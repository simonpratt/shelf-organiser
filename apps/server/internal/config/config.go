// Package config loads the server's configuration from the environment.
package config

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// Config is the server's configuration.
type Config struct {
	DataDir string // where shelf.db lives
	Port    int    // 0 picks a free port (tests)
	// TestMode mounts the e2e suite's reset route. Never set it in production.
	TestMode bool
}

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

	if len(errs) > 0 {
		return Config{}, errors.Join(errs...)
	}
	return cfg, nil
}
