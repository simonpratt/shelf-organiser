// Package auth handles the one account's login and its session cookie. A
// session is an HMAC-SHA256-signed cookie holding the username and an
// expiry; the server keeps no session list. The signing key is derived from
// a random key kept in the database and the username and password, so a
// restart keeps the browser logged in and changing either logs it out.
package auth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	CookieName = "shelf_session"
	Lifetime   = 90 * 24 * time.Hour
	// renewBelow: a valid cookie with less than this left is reissued, so a
	// phone in use stays logged in indefinitely without a Set-Cookie on
	// every response.
	renewBelow = Lifetime - 24*time.Hour

	// Every client shares loginBurst failed tries, then one more every
	// loginRefill: about 360 guesses an hour at most.
	loginBurst  = 5
	loginRefill = 10 * time.Second
)

// Auth checks the login and issues and checks session cookies.
type Auth struct {
	username [sha256.Size]byte
	password [sha256.Size]byte
	name     string
	key      []byte
	now      func() time.Time
	attempts *limiter
}

// New returns an Auth for the account, signing with a key derived from
// stored (the database's random key) and the credentials.
func New(username, password string, stored []byte, now func() time.Time) *Auth {
	m := hmac.New(sha256.New, stored)
	m.Write([]byte("session\x00" + username + "\x00" + password))
	return &Auth{
		username: sha256.Sum256([]byte(username)),
		password: sha256.Sum256([]byte(password)),
		name:     username,
		key:      m.Sum(nil),
		now:      now,
		attempts: &limiter{tokens: loginBurst, burst: loginBurst, every: loginRefill, last: now()},
	}
}

// Login reports whether username and password are the account's. When too
// many tries have failed lately it checks nothing and returns how long to
// wait instead.
func (a *Auth) Login(username, password string) (ok bool, wait time.Duration) {
	allowed, wait := a.attempts.take(a.now())
	if !allowed {
		return false, wait
	}
	// Over SHA-256 digests, in constant time, so neither the values nor
	// their lengths leak through timing.
	u, p := sha256.Sum256([]byte(username)), sha256.Sum256([]byte(password))
	if subtle.ConstantTimeCompare(u[:], a.username[:])&subtle.ConstantTimeCompare(p[:], a.password[:]) != 1 {
		return false, 0
	}
	a.attempts.refund() // a right login gives its try back
	return true, 0
}

type session struct {
	Username  string `json:"u"`
	ExpiresAt int64  `json:"e"` // unix seconds
}

// SessionCookie is a fresh session for the account, valid for Lifetime.
func (a *Auth) SessionCookie(secure bool) *http.Cookie {
	exp := a.now().Add(Lifetime)
	payload, _ := json.Marshal(session{Username: a.name, ExpiresAt: exp.Unix()})
	value := enc(payload) + "." + enc(a.sign(payload))
	return cookie(value, int(Lifetime/time.Second), secure)
}

// ClearCookie removes the session cookie.
func ClearCookie(secure bool) *http.Cookie { return cookie("", -1, secure) }

func cookie(value string, maxAge int, secure bool) *http.Cookie {
	return &http.Cookie{
		Name: CookieName, Value: value, Path: "/", MaxAge: maxAge,
		HttpOnly: true, SameSite: http.SameSiteStrictMode, Secure: secure,
	}
}

var errInvalid = errors.New("no valid session")

// verify returns the session in r's cookie if it is signed with the key,
// names the account and has not expired.
func (a *Auth) verify(r *http.Request) (session, error) {
	c, err := r.Cookie(CookieName)
	if err != nil {
		return session{}, errInvalid
	}
	p, sig, ok := strings.Cut(c.Value, ".")
	if !ok {
		return session{}, errInvalid
	}
	payload, err1 := dec(p)
	mac, err2 := dec(sig)
	if err1 != nil || err2 != nil || !hmac.Equal(mac, a.sign(payload)) {
		return session{}, errInvalid
	}
	var s session
	if err := json.Unmarshal(payload, &s); err != nil {
		return session{}, errInvalid
	}
	if s.Username != a.name || !a.now().Before(time.Unix(s.ExpiresAt, 0)) {
		return session{}, errInvalid
	}
	return s, nil
}

func (a *Auth) sign(payload []byte) []byte {
	m := hmac.New(sha256.New, a.key)
	m.Write(payload)
	return m.Sum(nil)
}

func enc(b []byte) string          { return base64.RawURLEncoding.EncodeToString(b) }
func dec(s string) ([]byte, error) { return base64.RawURLEncoding.DecodeString(s) }

// Secure reports whether the browser reached the app over HTTPS, directly or
// through a reverse proxy that terminates TLS.
func Secure(r *http.Request) bool {
	return r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

type ctxKey struct{}

type state struct {
	secure   bool
	loggedIn bool
}

// FromContext reports what Middleware found for the request: whether it came
// over HTTPS, and whether it carries a valid session (always true without a
// login). Without Middleware both are false.
func FromContext(ctx context.Context) (secure, loggedIn bool) {
	s, _ := ctx.Value(ctxKey{}).(state)
	return s.secure, s.loggedIn
}

// Middleware lets a request for an /api/ path through only with a valid
// session cookie, unless public says the path needs none; other paths (the
// client and its files) are always served. A nil Auth means no login: every
// request is logged in. A cookie with less than renewBelow left is reissued,
// so the lifetime runs from the last use rather than the login.
func Middleware(a *Auth, public func(*http.Request) bool, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		st := state{secure: Secure(r), loggedIn: a == nil}
		api := strings.HasPrefix(r.URL.Path, "/api/")
		if a != nil && api {
			if s, err := a.verify(r); err == nil {
				st.loggedIn = true
				if time.Unix(s.ExpiresAt, 0).Sub(a.now()) < renewBelow {
					http.SetCookie(w, a.SessionCookie(st.secure))
				}
			} else if !public(r) {
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Cache-Control", "no-store")
				w.WriteHeader(http.StatusUnauthorized)
				_, _ = w.Write([]byte(`{"error":"unauthorized"}` + "\n"))
				return
			}
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, st)))
	})
}

// limiter is a token bucket shared by every client: burst tries straight
// away, then one more every `every`.
type limiter struct {
	mu     sync.Mutex
	tokens float64
	burst  float64
	every  time.Duration
	last   time.Time
}

func (l *limiter) take(now time.Time) (ok bool, wait time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if now.After(l.last) {
		l.tokens = math.Min(l.burst, l.tokens+float64(now.Sub(l.last))/float64(l.every))
		l.last = now
	}
	if l.tokens >= 1 {
		l.tokens--
		return true, 0
	}
	return false, time.Duration((1 - l.tokens) * float64(l.every))
}

func (l *limiter) refund() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.tokens = math.Min(l.burst, l.tokens+1)
}
