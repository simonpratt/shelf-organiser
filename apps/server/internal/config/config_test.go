package config

import (
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
	_, err := Load(env(map[string]string{"PORT": "99999", "APP_TEST_MODE": "yes"}))
	if err == nil {
		t.Fatal("want an error")
	}
	for _, name := range []string{"PORT", "APP_TEST_MODE"} {
		if !strings.Contains(err.Error(), name) {
			t.Errorf("error %q doesn't mention %s", err, name)
		}
	}
}
