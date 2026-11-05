package config

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// Every variable Load reads must be documented in .env.example, so a new
// setting can't ship without the deployer hearing about it.
func TestEveryEnvVarIsInEnvExample(t *testing.T) {
	src, err := os.ReadFile("config.go")
	if err != nil {
		t.Fatal(err)
	}
	example, err := os.ReadFile("../../../../.env.example")
	if err != nil {
		t.Fatal(err)
	}
	names := regexp.MustCompile(`get(?:env)?\("([A-Z_]+)"\)`).FindAllStringSubmatch(string(src), -1)
	if len(names) == 0 {
		t.Fatal("found no env vars in config.go; has the pattern changed?")
	}
	for _, m := range names {
		if !strings.Contains(string(example), "\n"+m[1]+"=") && !strings.HasPrefix(string(example), m[1]+"=") {
			t.Errorf("%s is read by config.Load but missing from .env.example", m[1])
		}
	}
}
