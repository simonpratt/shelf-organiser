// Command shelf-organiser serves the Shelf Organiser API and web client.
package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"slices"
	"strconv"
	"strings"
	"syscall"
	"time"
	_ "time/tzdata" // TZ works on distroless, which has no zoneinfo

	"shelf-organiser/apps/server/internal/api"
	"shelf-organiser/apps/server/internal/auth"
	"shelf-organiser/apps/server/internal/claude"
	"shelf-organiser/apps/server/internal/claude/claudefake"
	"shelf-organiser/apps/server/internal/config"
	"shelf-organiser/apps/server/internal/store"
	"shelf-organiser/apps/server/internal/web"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx, os.Getenv, os.Stderr, nil); err != nil {
		fmt.Fprintf(os.Stderr, "shelf-organiser: %v\n", err)
		os.Exit(1)
	}
}

// run serves the app until ctx is cancelled. onListen, if set, is called with
// the bound address once the server is listening.
func run(ctx context.Context, getenv func(string) string, logOut io.Writer, onListen func(net.Addr)) error {
	cfg, err := config.Load(getenv)
	if err != nil {
		return err
	}
	logger := slog.New(slog.NewTextHandler(logOut, nil))

	if err := os.MkdirAll(cfg.DataDir, 0o755); err != nil {
		return fmt.Errorf("creating DATA_DIR: %w", err)
	}
	st, err := store.Open(ctx, cfg.DataDir)
	if err != nil {
		return err
	}
	defer st.Close()

	var a *auth.Auth
	if cfg.AuthEnabled() {
		key, err := st.SessionKey(ctx)
		if err != nil {
			return err
		}
		a = auth.New(cfg.Username, cfg.Password.Reveal(), key, time.Now)
	} else {
		logger.Warn("no login: APP_USERNAME and APP_PASSWORD are empty, so anyone who can reach the app can use it")
	}

	ln, err := net.Listen("tcp", ":"+strconv.Itoa(cfg.Port))
	if err != nil {
		return fmt.Errorf("listening on port %d: %w", cfg.Port, err)
	}
	srv := &http.Server{
		Handler:           newHandler(cfg, st, a, logger),
		ReadHeaderTimeout: 10 * time.Second,
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelWarn),
	}
	logger.Info("listening", "addr", ln.Addr().String(), "data_dir", cfg.DataDir, "test_mode", cfg.TestMode,
		"claude", cfg.AnthropicAPIKey.IsSet(), "login", cfg.AuthEnabled())
	if onListen != nil {
		onListen(ln.Addr())
	}

	serveErr := make(chan error, 1)
	go func() { serveErr <- srv.Serve(ln) }()
	select {
	case err := <-serveErr:
		return err
	case <-ctx.Done():
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	logger.Info("stopped")
	return nil
}

// testAnthropicKey is the only API key the test-mode fake Anthropic API accepts.
const testAnthropicKey = "test-anthropic-key"

// newHandler serves the app. With a login (a non-nil Auth), every /api/ path
// but the session routes, and the test routes in test mode, needs a session;
// /healthz, the client and its files (no data in them) never do.
func newHandler(cfg config.Config, st *store.Store, a *auth.Auth, logger *slog.Logger) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("ok\n"))
	})
	var c *claude.Client
	if cfg.AnthropicAPIKey.IsSet() {
		c = claude.New(cfg.AnthropicAPIKey.Reveal(), cfg.AnthropicBaseURL)
	}
	api.Register(mux, st, c, a, logger)
	if cfg.TestMode {
		// The e2e suite points ANTHROPIC_BASE_URL here, so Claude features run
		// against the shared fake rather than the real API.
		mux.Handle("/api/test/anthropic/", http.StripPrefix("/api/test/anthropic", claudefake.New(testAnthropicKey)))
		// Lets the e2e suite start every test from an empty database.
		mux.HandleFunc("POST /api/test/reset", func(w http.ResponseWriter, r *http.Request) {
			if err := st.Reset(r.Context()); err != nil {
				logger.Error("resetting", "err", err)
				api.WriteError(w, http.StatusInternalServerError, "internal error")
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})
	}
	mux.Handle("/", web.Handler())
	public := func(r *http.Request) bool {
		if cfg.TestMode && strings.HasPrefix(r.URL.Path, "/api/test/") {
			return true // the e2e suite resets the database without logging in
		}
		return slices.Contains(api.PublicPaths, r.URL.Path)
	}
	return auth.Middleware(a, public, mux)
}
