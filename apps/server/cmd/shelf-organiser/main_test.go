package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"shelf-organiser/apps/server/internal/dictation/claudefake"
)

// startApp boots the whole app through run(), as main does, on a free port
// with a fresh database, and returns its base URL.
func startApp(t *testing.T, env map[string]string) string {
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
		done <- run(ctx, func(k string) string { return env[k] }, io.Discard, func(a net.Addr) { addr <- a })
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

func TestDictationIsOffWithoutAnAPIKey(t *testing.T) {
	base := startApp(t, nil)
	if _, body := do(t, "GET", base+"/api/dictation", ""); strings.TrimSpace(body) != `{"enabled":false}` {
		t.Errorf("dictation status = %s; want disabled", body)
	}
	if code, _ := do(t, "POST", base+"/api/dictation/drafts", `{"transcript":"a tent"}`); code != 503 {
		t.Errorf("drafts without a key = %d; want 503", code)
	}
}

func TestDictationDraftsReuseExistingTagsAndSaveNothing(t *testing.T) {
	fake := claudefake.New("sk-ant-app-test")
	claude := httptest.NewServer(fake)
	defer claude.Close()
	base := startApp(t, map[string]string{"ANTHROPIC_API_KEY": "sk-ant-app-test", "ANTHROPIC_BASE_URL": claude.URL})

	do(t, "POST", base+"/api/tags", `{"path":["Location","Shed"]}`)
	if _, body := do(t, "GET", base+"/api/dictation", ""); strings.TrimSpace(body) != `{"enabled":true}` {
		t.Errorf("dictation status = %s; want enabled", body)
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
