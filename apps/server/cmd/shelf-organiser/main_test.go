package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"shelf-organiser/apps/server/internal/claude/claudefake"
)

// startApp boots the whole app through run(), as main does, on a free port
// with a fresh database, and returns its base URL.
func startApp(t *testing.T, env map[string]string) string {
	t.Helper()
	return startAppLogging(t, env, io.Discard)
}

// startAppLogging is startApp, writing the app's log to logOut.
func startAppLogging(t *testing.T, env map[string]string, logOut io.Writer) string {
	t.Helper()
	if env == nil {
		env = map[string]string{}
	}
	env["DATA_DIR"] = t.TempDir()
	env["PORT"] = "0"

	ctx, cancel := context.WithCancel(context.Background())
	addr := make(chan net.Addr, 1)
	done := make(chan error, 1)
	go func() {
		done <- run(ctx, func(k string) string { return env[k] }, logOut, func(a net.Addr) { addr <- a })
	}()
	var base string
	select {
	case a := <-addr:
		base = fmt.Sprintf("http://127.0.0.1:%d", a.(*net.TCPAddr).Port)
	case err := <-done:
		t.Fatalf("run exited before listening: %v", err)
	case <-time.After(5 * time.Second):
		t.Fatal("app did not start")
	}
	t.Cleanup(func() {
		cancel()
		if err := <-done; err != nil {
			t.Errorf("shutdown: %v", err)
		}
	})
	return base
}

func do(t *testing.T, method, url, body string) (int, string) {
	t.Helper()
	req, err := http.NewRequest(method, url, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	return res.StatusCode, string(b)
}

func TestRunRejectsInvalidConfig(t *testing.T) {
	err := run(context.Background(), func(k string) string {
		return map[string]string{"PORT": "nope", "DATA_DIR": t.TempDir()}[k]
	}, io.Discard, nil)
	if err == nil || !strings.Contains(err.Error(), "PORT") {
		t.Errorf("err = %v; want a PORT error", err)
	}
}

func TestItemRoundTripPersistsTagsAndReturnsErrorEnvelopes(t *testing.T) {
	base := startApp(t, nil)

	if code, body := do(t, "GET", base+"/healthz", ""); code != 200 {
		t.Fatalf("healthz = %d %s", code, body)
	}

	code, body := do(t, "POST", base+"/api/items",
		`{"name":"Tent","litres":30,"quantity":2,"tags":[["Type","Camping"]]}`)
	if code != 201 {
		t.Fatalf("create = %d %s", code, body)
	}
	var item struct {
		ID       int64 `json:"id"`
		Quantity int   `json:"quantity"`
		Tags     []struct {
			Path []string `json:"path"`
		} `json:"tags"`
	}
	if err := json.Unmarshal([]byte(body), &item); err != nil {
		t.Fatal(err)
	}
	if item.Quantity != 2 || len(item.Tags) != 1 || strings.Join(item.Tags[0].Path, "/") != "Type/Camping" {
		t.Errorf("created item = %s", body)
	}

	// Quantity defaults to 1 when left out.
	_, body = do(t, "POST", base+"/api/items", `{"name":"Lamp","litres":5}`)
	if !strings.Contains(body, `"quantity":1`) {
		t.Errorf("item without quantity = %s; want quantity 1", body)
	}

	_, body = do(t, "GET", base+"/api/tags", "")
	if !strings.Contains(body, `"path":["Type","Camping"]`) || !strings.Contains(body, `"itemCount":1`) {
		t.Errorf("tags = %s; want Type/Camping with one item", body)
	}

	for _, tc := range []struct {
		name, method, path, body string
		code                     int
		error                    string
	}{
		{"invalid input", "POST", "/api/items", `{"name":"","litres":1}`, 400, "name is required"},
		{"malformed JSON", "POST", "/api/items", `{`, 400, "invalid request body"},
		{"bad id", "GET", "/api/items/abc", "", 400, "invalid request parameters"},
		{"missing item", "DELETE", "/api/items/999", "", 404, "not found"},
		{"unknown API path", "GET", "/api/nope", "", 404, "not found"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			code, body := do(t, tc.method, base+tc.path, tc.body)
			var env struct{ Error string }
			_ = json.Unmarshal([]byte(body), &env)
			if code != tc.code || env.Error != tc.error {
				t.Errorf("got %d %s; want %d {\"error\":%q}", code, body, tc.code, tc.error)
			}
		})
	}

	if code, _ := do(t, "DELETE", fmt.Sprintf("%s/api/items/%d", base, item.ID), ""); code != 204 {
		t.Errorf("delete = %d; want 204", code)
	}
}

func TestTestRoutesExistOnlyInTestMode(t *testing.T) {
	plain := startApp(t, nil)
	for _, path := range []string{"/api/test/reset", "/api/test/anthropic/v1/messages"} {
		if code, _ := do(t, "POST", plain+path, "{}"); code != 404 {
			t.Errorf("%s without test mode = %d; want 404", path, code)
		}
	}

	base := startApp(t, map[string]string{"APP_TEST_MODE": "1"})
	do(t, "POST", base+"/api/items", `{"name":"Tent","litres":30,"tags":[["Type"]]}`)
	if code, _ := do(t, "POST", base+"/api/test/reset", ""); code != 204 {
		t.Fatalf("reset = %d; want 204", code)
	}
	_, items := do(t, "GET", base+"/api/items", "")
	_, tags := do(t, "GET", base+"/api/tags", "")
	if strings.TrimSpace(items) != "[]" || strings.TrimSpace(tags) != "[]" {
		t.Errorf("after reset: items %s, tags %s; want both empty", items, tags)
	}
	// Ids restart, so e2e assertions on ids stay exact.
	_, body := do(t, "POST", base+"/api/items", `{"name":"Lamp","litres":5}`)
	if !strings.Contains(body, `"id":1,`) {
		t.Errorf("first item after reset = %s; want id 1", body)
	}
}

func TestServesSpecAsWritten(t *testing.T) {
	_, body := do(t, "GET", startApp(t, nil)+"/api/openapi.json", "")
	var spec struct {
		Paths map[string]map[string]json.RawMessage `json:"paths"`
	}
	if err := json.Unmarshal([]byte(body), &spec); err != nil {
		t.Fatal(err)
	}
	var op struct {
		OperationID string `json:"operationId"`
	}
	_ = json.Unmarshal(spec.Paths["/api/items"]["get"], &op)
	if got := op.OperationID; got != "listItems" {
		t.Errorf("operationId = %q; want listItems, as written in openapi.yaml", got)
	}
}

func TestClaudeFeaturesAreOffWithoutAnAPIKey(t *testing.T) {
	base := startApp(t, nil)
	if _, body := do(t, "GET", base+"/api/claude", ""); strings.TrimSpace(body) != `{"enabled":false}` {
		t.Errorf("Claude status = %s; want disabled", body)
	}
	for path, body := range map[string]string{
		"/api/dictation/drafts": `{"transcript":"a tent"}`,
		"/api/tag-proposals":    `{"name":"Tent"}`,
		"/api/organise":         ``,
	} {
		if code, _ := do(t, "POST", base+path, body); code != 503 {
			t.Errorf("%s without a key = %d; want 503", path, code)
		}
	}
}

func TestDictationSaysWhenTheServersKeyIsRejected(t *testing.T) {
	claude := httptest.NewServer(claudefake.New("sk-ant-the-real-key"))
	defer claude.Close()
	base := startApp(t, map[string]string{"ANTHROPIC_API_KEY": "sk-ant-a-wrong-key", "ANTHROPIC_BASE_URL": claude.URL})

	code, body := do(t, "POST", base+"/api/dictation/drafts", `{"transcript":"a tent"}`)
	if code != 502 || !strings.Contains(body, "API key was rejected") || strings.Contains(body, "sk-ant") {
		t.Errorf("drafts with a rejected key = %d %s; want 502 naming the key, without it", code, body)
	}
}

func TestDictationDraftsReuseExistingTagsAndSaveNothing(t *testing.T) {
	fake := claudefake.New("sk-ant-app-test")
	claude := httptest.NewServer(fake)
	defer claude.Close()
	base := startApp(t, map[string]string{"ANTHROPIC_API_KEY": "sk-ant-app-test", "ANTHROPIC_BASE_URL": claude.URL})

	do(t, "POST", base+"/api/tags", `{"path":["Location","Shed"]}`)
	if _, body := do(t, "GET", base+"/api/claude", ""); strings.TrimSpace(body) != `{"enabled":true}` {
		t.Errorf("Claude status = %s; want enabled", body)
	}
	code, body := do(t, "POST", base+"/api/dictation/drafts", `{"transcript":"two camping chairs, a drill in the shed"}`)
	want := `{"drafts":[{"litres":40,"name":"Camping chairs","quantity":2,"tags":[]},` +
		`{"litres":40,"name":"Drill in the shed","quantity":1,"tags":[["Location","Shed"]]}]}`
	if code != 200 || strings.TrimSpace(body) != want {
		t.Errorf("drafts = %d %s; want %s", code, body, want)
	}
	if _, items := do(t, "GET", base+"/api/items", ""); strings.TrimSpace(items) != "[]" {
		t.Errorf("items after drafting = %s; want none saved", items)
	}

	for _, tc := range []struct {
		name, body string
		code       int
	}{
		{"empty transcript", `{"transcript":"  "}`, 400},
		{"too long", `{"transcript":"` + strings.Repeat("a", 4001) + `"}`, 400},
		{"Claude failing", `{"transcript":"a tent ` + claudefake.FailMarker + `"}`, 502},
	} {
		t.Run(tc.name, func(t *testing.T) {
			code, body := do(t, "POST", base+"/api/dictation/drafts", tc.body)
			if code != tc.code || strings.Contains(body, "sk-ant") {
				t.Errorf("got %d %s; want %d without the key", code, body, tc.code)
			}
		})
	}
}

func TestOrganiseProposesTypeTagsThatApplyInOneGo(t *testing.T) {
	claude := httptest.NewServer(claudefake.New("sk-ant-app-test"))
	defer claude.Close()
	base := startApp(t, map[string]string{"ANTHROPIC_API_KEY": "sk-ant-app-test", "ANTHROPIC_BASE_URL": claude.URL})

	do(t, "POST", base+"/api/items", `{"name":"Lawn mower","litres":300,"tags":[["Location","Shed"]]}`)
	do(t, "POST", base+"/api/items", `{"name":"Tent","litres":40,"tags":[["Type","Camping"]]}`)
	do(t, "POST", base+"/api/items", `{"name":"Mystery box","litres":20}`)

	code, body := do(t, "POST", base+"/api/organise", "")
	// The tent has a Type tag already, and the fake can't place the mystery box.
	want := `{"capped":false,"dimension":"Type","proposals":[{"itemId":1,"tags":[{"isNew":true,"path":["Type","Garden"]}]}],"remaining":1}`
	if code != 200 || strings.TrimSpace(body) != want {
		t.Fatalf("organise = %d %s; want %s", code, body, want)
	}
	if _, tags := do(t, "GET", base+"/api/tags", ""); strings.Contains(tags, "Garden") {
		t.Errorf("tags after organise = %s; want nothing created until applied", tags)
	}

	if code, body := do(t, "POST", base+"/api/items/tags", `{"assignments":[{"itemId":1,"tags":[["Type","Garden"]]},{"itemId":99,"tags":[["Type","Sport"]]}]}`); code != 404 {
		t.Errorf("applying to a missing item = %d %s; want 404", code, body)
	}
	if code, body := do(t, "POST", base+"/api/items/tags", `{"assignments":[{"itemId":1,"tags":[["Type","Garden"]]}]}`); code != 204 {
		t.Fatalf("apply = %d %s; want 204", code, body)
	}
	_, mower := do(t, "GET", base+"/api/items/1", "")
	if !strings.Contains(mower, `["Location","Shed"]`) || !strings.Contains(mower, `["Type","Garden"]`) {
		t.Errorf("mower after apply = %s; want its Location kept and Type › Garden added", mower)
	}
	if _, tags := do(t, "GET", base+"/api/tags", ""); strings.Contains(tags, "Sport") {
		t.Errorf("tags = %s; want the failed batch to have created nothing", tags)
	}

	// Type now exists, so it is the Type dimension for every client and for Claude.
	if _, tags := do(t, "GET", base+"/api/tags", ""); !strings.Contains(tags, `"isTypeDimension":true,"itemCount":2,"name":"Type"`) {
		t.Errorf("tags = %s; want Type marked as the Type dimension", tags)
	}
	code, body = do(t, "POST", base+"/api/tag-proposals", `{"name":"Cordless drill","tags":[["Location","Shed"]]}`)
	if reqs := claude.Config.Handler.(*claudefake.Fake).Requests(); !strings.Contains(fmt.Sprint(reqs[len(reqs)-1].Body), `what things are is "Type"`) {
		t.Errorf("the proposal request didn't name the Type dimension")
	}
	if want := `{"dimension":"Type","tags":[{"isNew":true,"path":["Type","Tools","Power tools"]}]}`; code != 200 || strings.TrimSpace(body) != want {
		t.Errorf("tag proposals = %d %s; want %s", code, body, want)
	}
	if code, _ := do(t, "POST", base+"/api/tag-proposals", `{"name":" "}`); code != 400 {
		t.Errorf("tag proposals without a name = %d; want 400", code)
	}
}

// syncBuffer is a bytes.Buffer safe to read while the app writes its log.
type syncBuffer struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (s *syncBuffer) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.Write(p)
}

func (s *syncBuffer) String() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.String()
}

func TestLoginGuardsTheAPIAndKeepsTheBrowserLoggedInUntilLogout(t *testing.T) {
	var logs syncBuffer
	base := startAppLogging(t, map[string]string{
		"APP_USERNAME": "simon", "APP_PASSWORD": "correct horse", "APP_TEST_MODE": "1",
	}, &logs)
	jar, _ := cookiejar.New(nil)
	browser := &http.Client{Jar: jar}
	call := func(method, path, body string) (int, string, *http.Response) {
		t.Helper()
		req, _ := http.NewRequest(method, base+path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		res, err := browser.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		b, _ := io.ReadAll(res.Body)
		return res.StatusCode, strings.TrimSpace(string(b)), res
	}

	// Without a session: the API is closed, but health, the client, its
	// files and the test routes are open.
	for _, path := range []string{"/api/items", "/api/tags", "/api/claude", "/api/nope"} {
		if code, body, _ := call("GET", path, ""); code != 401 || body != `{"error":"unauthorized"}` {
			t.Errorf("GET %s logged out = %d %s; want 401 unauthorized", path, code, body)
		}
	}
	if code, _, _ := call("GET", "/healthz", ""); code != 200 {
		t.Errorf("GET /healthz logged out = %d; want 200", code)
	}
	// The client may not be built (CI's checks job runs go test without it,
	// so these 503), but the login must never guard it.
	for _, path := range []string{"/", "/login"} {
		if code, _, _ := call("GET", path, ""); code == 401 {
			t.Errorf("GET %s logged out = 401; want the client unguarded", path)
		}
	}
	if code, _, _ := call("POST", "/api/test/reset", ""); code != 204 {
		t.Errorf("test reset logged out = %d; want 204", code)
	}
	if _, body, _ := call("GET", "/api/session", ""); body != `{"loggedIn":false,"loginRequired":true}` {
		t.Errorf("session logged out = %s", body)
	}

	if code, body, _ := call("POST", "/api/login", `{"username":"simon","password":"wrong"}`); code != 401 || body != `{"error":"Wrong username or password."}` {
		t.Errorf("wrong password = %d %s", code, body)
	}
	code, _, res := call("POST", "/api/login", `{"username":"simon","password":"correct horse"}`)
	if code != 204 {
		t.Fatalf("login = %d; want 204", code)
	}
	if c := res.Header.Get("Set-Cookie"); !strings.Contains(c, "HttpOnly") || !strings.Contains(c, "SameSite=Strict") || !strings.Contains(c, "Max-Age=7776000") || strings.Contains(c, "Secure") {
		t.Errorf("session cookie = %q; want HttpOnly, Strict, 90 days, not Secure over plain HTTP", c)
	}
	if code, body, _ := call("POST", "/api/items", `{"name":"Tent","litres":30}`); code != 201 {
		t.Errorf("create logged in = %d %s; want 201", code, body)
	}
	if _, body, _ := call("GET", "/api/session", ""); body != `{"loggedIn":true,"loginRequired":true}` {
		t.Errorf("session logged in = %s", body)
	}

	if code, _, _ := call("POST", "/api/logout", ""); code != 204 {
		t.Errorf("logout = %d; want 204", code)
	}
	if code, _, _ := call("GET", "/api/items", ""); code != 401 {
		t.Errorf("items after logout = %d; want 401", code)
	}

	if strings.Contains(logs.String(), "correct horse") {
		t.Errorf("the password is in the log:\n%s", logs.String())
	}
}

func TestNoLoginLeavesTheAPIOpenAndSaysSo(t *testing.T) {
	var logs syncBuffer
	base := startAppLogging(t, nil, &logs)
	if code, _ := do(t, "GET", base+"/api/items", ""); code != 200 {
		t.Errorf("items = %d; want 200 without a login", code)
	}
	if _, body := do(t, "GET", base+"/api/session", ""); strings.TrimSpace(body) != `{"loggedIn":true,"loginRequired":false}` {
		t.Errorf("session = %s", body)
	}
	if code, _ := do(t, "POST", base+"/api/login", `{"username":"a","password":"b"}`); code != 404 {
		t.Errorf("login without one set up = %d; want 404", code)
	}
	if !strings.Contains(logs.String(), "no login") {
		t.Errorf("startup log doesn't say there is no login:\n%s", logs.String())
	}
}
