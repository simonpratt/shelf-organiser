package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

var (
	key   = []byte("0123456789abcdef0123456789abcdef")
	start = time.Date(2026, 11, 6, 12, 0, 0, 0, time.UTC)
)

type clock struct{ t time.Time }

func (c *clock) now() time.Time { return c.t }

func newAuth(c *clock) *Auth { return New("simon", "correct horse", key, c.now) }

// serve sends a request for path, with cookie if given, through Middleware
// guarding an OK handler, with /api/session public.
func serve(a *Auth, path string, cookie *http.Cookie) *httptest.ResponseRecorder {
	h := Middleware(a, func(r *http.Request) bool { return r.URL.Path == "/api/session" },
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			_, loggedIn := FromContext(r.Context())
			if loggedIn {
				_, _ = w.Write([]byte("in"))
			} else {
				_, _ = w.Write([]byte("out"))
			}
		}))
	req := httptest.NewRequest("GET", path, nil)
	if cookie != nil {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestLoginAcceptsOnlyTheAccount(t *testing.T) {
	a := newAuth(&clock{start})
	for _, tc := range []struct {
		user, pass string
		ok         bool
	}{
		{"simon", "correct horse", true},
		{"simon", "correct hors", false},
		{"Simon", "correct horse", false},
		{"", "", false},
	} {
		if ok, _ := a.Login(tc.user, tc.pass); ok != tc.ok {
			t.Errorf("Login(%q, %q) = %v; want %v", tc.user, tc.pass, ok, tc.ok)
		}
	}
}

func TestLoginRefusesToCheckAfterFiveFailuresUntilATryRefills(t *testing.T) {
	c := &clock{start}
	a := newAuth(c)
	for i := range loginBurst {
		if ok, wait := a.Login("simon", "guess"); ok || wait != 0 {
			t.Fatalf("try %d = %v, %v; want a plain failure", i+1, ok, wait)
		}
	}
	ok, wait := a.Login("simon", "correct horse")
	if ok || wait != loginRefill {
		t.Fatalf("sixth try = %v, wait %v; want refused with wait %v even with the right password", ok, wait, loginRefill)
	}
	c.t = c.t.Add(loginRefill)
	if ok, _ := a.Login("simon", "correct horse"); !ok {
		t.Error("right password after the wait was refused")
	}
}

func TestSuccessfulLoginsDoNotUseUpTries(t *testing.T) {
	a := newAuth(&clock{start})
	for range 3 * loginBurst {
		if ok, _ := a.Login("simon", "correct horse"); !ok {
			t.Fatal("right password refused")
		}
	}
}

func TestSessionCookieIsHttpOnlyStrictAndLongLived(t *testing.T) {
	a := newAuth(&clock{start})
	c := a.SessionCookie(true)
	if !c.HttpOnly || c.SameSite != http.SameSiteStrictMode || !c.Secure || c.Path != "/" || c.MaxAge != int(Lifetime/time.Second) {
		t.Errorf("cookie = %+v", c)
	}
	if a.SessionCookie(false).Secure {
		t.Error("cookie over plain HTTP is Secure, so the browser would drop it")
	}
	if strings.Contains(c.Value, "correct horse") || strings.Contains(c.String(), string(key)) {
		t.Errorf("cookie %q carries the password or key", c.String())
	}
}

func TestMiddlewareAnswers401WithoutAValidSession(t *testing.T) {
	c := &clock{start}
	a := newAuth(c)
	good := a.SessionCookie(false)
	tampered := *good
	tampered.Value = strings.Replace(good.Value, ".", "x.", 1)
	other := New("simon", "new password", key, c.now).SessionCookie(false)

	for _, tc := range []struct {
		name   string
		path   string
		cookie *http.Cookie
		code   int
		body   string
	}{
		{"no cookie", "/api/items", nil, 401, `{"error":"unauthorized"}`},
		{"tampered", "/api/items", &tampered, 401, `{"error":"unauthorized"}`},
		{"signed before the password changed", "/api/items", other, 401, `{"error":"unauthorized"}`},
		{"valid", "/api/items", good, 200, "in"},
		{"public path, no cookie", "/api/session", nil, 200, "out"},
		{"public path, valid", "/api/session", good, 200, "in"},
		{"client route", "/items/new", nil, 200, "out"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := serve(a, tc.path, tc.cookie)
			if rec.Code != tc.code || strings.TrimSpace(rec.Body.String()) != tc.body {
				t.Errorf("got %d %q; want %d %q", rec.Code, rec.Body.String(), tc.code, tc.body)
			}
		})
	}
}

func TestSessionExpiresAfterItsLifetime(t *testing.T) {
	c := &clock{start}
	a := newAuth(c)
	cookie := a.SessionCookie(false)
	c.t = start.Add(Lifetime - time.Minute)
	if rec := serve(a, "/api/items", cookie); rec.Code != 200 {
		t.Errorf("just before expiry = %d; want 200", rec.Code)
	}
	c.t = start.Add(Lifetime)
	if rec := serve(a, "/api/items", cookie); rec.Code != 401 {
		t.Errorf("at expiry = %d; want 401", rec.Code)
	}
}

func TestMiddlewareRenewsTheCookieOnlyOnceADayHasPassed(t *testing.T) {
	c := &clock{start}
	a := newAuth(c)
	cookie := a.SessionCookie(false)

	c.t = start.Add(time.Hour)
	if rec := serve(a, "/api/items", cookie); rec.Header().Get("Set-Cookie") != "" {
		t.Error("renewed an hour-old cookie")
	}
	c.t = start.Add(30 * 24 * time.Hour)
	rec := serve(a, "/api/items", cookie)
	renewed := rec.Result().Cookies()
	if len(renewed) != 1 || renewed[0].MaxAge != int(Lifetime/time.Second) {
		t.Fatalf("30-day-old cookie renewed as %v; want a fresh %v cookie", renewed, Lifetime)
	}
	// The renewed cookie runs from now, so it outlives the original.
	c.t = start.Add(Lifetime + time.Hour)
	if rec := serve(a, "/api/items", renewed[0]); rec.Code != 200 {
		t.Errorf("renewed cookie after the original's expiry = %d; want 200", rec.Code)
	}
}

func TestNoLoginLetsEverythingThroughAsLoggedIn(t *testing.T) {
	if rec := serve(nil, "/api/items", nil); rec.Code != 200 || rec.Body.String() != "in" {
		t.Errorf("got %d %q; want 200 in", rec.Code, rec.Body.String())
	}
}

func TestSecureFollowsTheReverseProxy(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	if Secure(r) {
		t.Error("plain request is secure")
	}
	r.Header.Set("X-Forwarded-Proto", "https")
	if !Secure(r) {
		t.Error("request forwarded from HTTPS isn't secure")
	}
}
