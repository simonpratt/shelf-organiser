// Package config loads the server's configuration from the environment.
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"strconv"
	"strings"
)

// Config is the server's configuration.
type Config struct {
	DataDir string // where shelf.db lives
	Port    int    // 0 picks a free port (tests)
	// TestMode mounts the e2e suite's test routes. Never set it in production.
	TestMode bool
	// AnthropicAPIKey turns on dictation; without it the app is typed entry only.
	AnthropicAPIKey Secret
	// AnthropicBaseURL overrides the Anthropic API's address; empty for the real one.
	AnthropicBaseURL string
	// Username and Password turn on the login: both set, or neither (no login).
	Username string
	Password Secret
}

// AuthEnabled reports whether the app asks for a login.
func (c Config) AuthEnabled() bool { return c.Username != "" }

// Secret holds a value that must never be printed or logged. Every
// formatting path (fmt verbs, slog) renders it as a placeholder; call Reveal
// to get the underlying value where it is genuinely needed.
type Secret struct{ value string }

// Reveal returns the secret value.
func (s Secret) Reveal() string { return s.value }

// IsSet reports whether the secret is non-empty.
func (s Secret) IsSet() bool { return s.value != "" }

func (s Secret) String() string {
	if s.value == "" {
		return ""
	}
	return "[redacted]"
}

// GoString keeps %#v from printing the value.
func (s Secret) GoString() string { return s.String() }

// Format keeps every fmt verb, including %+v on a containing struct, from
// printing the value.
func (s Secret) Format(f fmt.State, _ rune) { _, _ = f.Write([]byte(s.String())) }

// LogValue keeps slog from printing the value.
func (s Secret) LogValue() slog.Value { return slog.StringValue(s.String()) }

// Load reads the configuration using getenv (normally os.Getenv). It returns
// one error naming every invalid value.
func Load(getenv func(string) string) (Config, error) {
	get := func(name string) string { return strings.TrimSpace(getenv(name)) }
	var errs []error

	cfg := Config{DataDir: get("DATA_DIR"), Port: 8080}
	if cfg.DataDir == "" {
		cfg.DataDir = "data"
	}
	if p := get("PORT"); p != "" {
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 || n > 65535 {
			errs = append(errs, fmt.Errorf("PORT must be a number from 0 to 65535, got %q", p))
		}
		cfg.Port = n
	}
	switch v := get("APP_TEST_MODE"); v {
	case "", "0", "false":
	case "1", "true":
		cfg.TestMode = true
	default:
		errs = append(errs, fmt.Errorf("APP_TEST_MODE must be 1 or 0, got %q", v))
	}

	cfg.AnthropicAPIKey = Secret{get("ANTHROPIC_API_KEY")}
	if u := get("ANTHROPIC_BASE_URL"); u != "" {
		parsed, err := url.Parse(u)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
			errs = append(errs, fmt.Errorf("ANTHROPIC_BASE_URL must be an http:// or https:// URL, got %q", u))
		}
		cfg.AnthropicBaseURL = u
	}

	// The password is taken as typed, spaces and all; only the username is trimmed.
	cfg.Username = get("APP_USERNAME")
	cfg.Password = Secret{getenv("APP_PASSWORD")}
	if (cfg.Username == "") != !cfg.Password.IsSet() {
		errs = append(errs, errors.New("APP_USERNAME and APP_PASSWORD must be set together, or both left empty for no login"))
	}

	if len(errs) > 0 {
		return Config{}, errors.Join(errs...)
	}
	return cfg, nil
}
