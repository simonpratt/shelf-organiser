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
