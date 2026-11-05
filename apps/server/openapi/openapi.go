// Package openapi embeds the hand-written spec, openapi.yaml, so the server
// can serve it exactly as written.
//
// oapi-codegen's own embedded copy is not used: it rewrites operation ids
// (listItems becomes ListItems), so the served document would differ from the
// spec the code is generated from.
package openapi

import (
	_ "embed"

	"github.com/oasdiff/yaml"
)

//go:embed openapi.yaml
var spec []byte

// JSON returns the spec converted to JSON.
func JSON() ([]byte, error) { return yaml.YAMLToJSON(spec) }
