// Package web embeds the built React client so the server can serve it.
// dist/.gitkeep is committed so a fresh clone compiles before the client is
// built; the server then answers 503 until `make build` has run.
package web

import "embed"

//go:embed all:dist
var Dist embed.FS
