package config

import (
	"fmt"
	"log/slog"
	"strings"
	"testing"
)

func env(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

func TestLoadDefaults(t *testing.T) {
	cfg, err := Load(env(nil))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.DataDir != "data" || cfg.Port != 8080 || cfg.TestMode {
		t.Errorf("cfg = %+v; want data, 8080, test mode off", cfg)
	}
}

func TestLoadReportsEveryInvalidValueAtOnce(t *testing.T) {
	_, err := Load(env(map[string]string{"PORT": "99999", "APP_TEST_MODE": "yes", "ANTHROPIC_BASE_URL": "localhost:9"}))
	if err == nil {
		t.Fatal("want an error")
	}
	for _, name := range []string{"PORT", "APP_TEST_MODE", "ANTHROPIC_BASE_URL"} {
		if !strings.Contains(err.Error(), name) {
			t.Errorf("error %q doesn't mention %s", err, name)
		}
	}
}

func TestAPIKeyNeverAppearsWhenConfigIsPrinted(t *testing.T) {
	cfg, err := Load(env(map[string]string{"ANTHROPIC_API_KEY": "sk-ant-very-secret"}))
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.AnthropicAPIKey.IsSet() || cfg.AnthropicAPIKey.Reveal() != "sk-ant-very-secret" {
		t.Fatal("key not loaded")
	}
	var logged strings.Builder
	slog.New(slog.NewTextHandler(&logged, nil)).Info("config", "cfg", cfg, "key", cfg.AnthropicAPIKey)
	for _, out := range []string{fmt.Sprintf("%v %+v %#v %s", cfg, cfg, cfg, cfg.AnthropicAPIKey), logged.String()} {
		if strings.Contains(out, "very-secret") {
			t.Errorf("key leaked: %s", out)
		}
	}
}

func TestLoadNeedsUsernameAndPasswordTogether(t *testing.T) {
	for _, tc := range []struct {
		name    string
		env     map[string]string
		enabled bool
		wantErr bool
	}{
		{"neither", nil, false, false},
		{"both", map[string]string{"APP_USERNAME": "simon", "APP_PASSWORD": " pass word "}, true, false},
		{"username only", map[string]string{"APP_USERNAME": "simon"}, false, true},
		{"password only", map[string]string{"APP_PASSWORD": "hunter2"}, false, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			cfg, err := Load(env(tc.env))
			if (err != nil) != tc.wantErr {
				t.Fatalf("err = %v; want error %v", err, tc.wantErr)
			}
			if err != nil {
				if !strings.Contains(err.Error(), "APP_USERNAME") || strings.Contains(err.Error(), "hunter2") {
					t.Errorf("error %q should name APP_USERNAME and not show the password", err)
				}
				return
			}
			if cfg.AuthEnabled() != tc.enabled {
				t.Errorf("AuthEnabled = %v; want %v", cfg.AuthEnabled(), tc.enabled)
			}
			if tc.enabled && cfg.Password.Reveal() != " pass word " {
				t.Errorf("password = %q; want it untrimmed", cfg.Password.Reveal())
			}
			if strings.Contains(fmt.Sprintf("%+v", cfg), "pass word") {
				t.Error("password leaked when config was printed")
			}
		})
	}
}
