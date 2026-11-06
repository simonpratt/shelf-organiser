// Package web serves the embedded React client, falling back to index.html
// for client-side routes.
package web

import (
	"io/fs"
	"net/http"
	"path"
	"strings"

	client "shelf-organiser/apps/web"
)

// Handler serves the built client. Vite's hashed files under /assets/, and the
// speech model under /models/ (its directory names its revision), are cached
// forever; everything else, index.html included, is served no-cache so a new
// build shows up on the next load.
func Handler() http.Handler {
	dist, err := fs.Sub(client.Dist, "dist")
	if err != nil {
		panic(err) // the embed pattern guarantees dist exists
	}
	files := http.FileServerFS(dist)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Cross-origin isolation lets the speech worker's WASM use threads,
		// about twice as fast (ADR 0003). Everything the page loads is this origin's.
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
		w.Header().Set("Cross-Origin-Embedder-Policy", "require-corp")
		index, err := fs.ReadFile(dist, "index.html")
		if err != nil {
			http.Error(w, "the web client has not been built; run make build", http.StatusServiceUnavailable)
			return
		}
		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if name != "" && name != "index.html" {
			if st, err := fs.Stat(dist, name); err == nil && !st.IsDir() {
				if strings.HasPrefix(name, "assets/") || strings.HasPrefix(name, "models/") {
					w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
				} else {
					w.Header().Set("Cache-Control", "no-cache")
				}
				files.ServeHTTP(w, r)
				return
			}
			if strings.HasPrefix(name, "assets/") || strings.HasPrefix(name, "models/") {
				http.NotFound(w, r) // a stale asset or model URL, not a client route
				return
			}
		}
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(index)
	})
}
