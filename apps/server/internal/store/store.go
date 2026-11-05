// Package store owns the SQLite database: opening it, running the goose
// migrations, and every query over items and tags.
package store

import (
	"context"
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"path/filepath"

	"github.com/pressly/goose/v3"
	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrations embed.FS

// ErrNotFound is returned when the requested item or tag does not exist.
var ErrNotFound = errors.New("not found")

// ErrConflict is returned when a tag would share a name with a sibling.
var ErrConflict = errors.New("conflict")

// ValidationError is input the caller should correct; its message is safe to
// show to the user.
type ValidationError struct{ Msg string }

func (e *ValidationError) Error() string { return e.Msg }

func invalid(format string, args ...any) error {
	return &ValidationError{Msg: fmt.Sprintf(format, args...)}
}

// Store is the app's database.
type Store struct {
	db *sql.DB
}

// Open opens (creating if needed) shelf.db in dataDir and migrates it.
func Open(ctx context.Context, dataDir string) (*Store, error) {
	path := filepath.Join(dataDir, "shelf.db")
	// WAL plus a busy timeout, and a single connection: the app is one
	// process, so serialising writes costs nothing and avoids SQLITE_BUSY.
	// foreign_keys is per connection in SQLite, hence the pragma in the DSN.
	dsn := "file:" + path + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("opening %s: %w", path, err)
	}
	db.SetMaxOpenConns(1)
	if err := migrate(ctx, db); err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

func migrate(ctx context.Context, db *sql.DB) error {
	sub, err := fs.Sub(migrations, "migrations")
	if err != nil {
		return err
	}
	p, err := goose.NewProvider(goose.DialectSQLite3, db, sub)
	if err != nil {
		return fmt.Errorf("loading migrations: %w", err)
	}
	if _, err := p.Up(ctx); err != nil {
		return fmt.Errorf("migrating: %w", err)
	}
	return nil
}

// Close closes the database.
func (s *Store) Close() error { return s.db.Close() }

// Reset deletes every item and tag and restarts ids at 1. It exists for the
// e2e suite's test-mode reset route only.
func (s *Store) Reset(ctx context.Context) error {
	return s.inTx(ctx, func(tx *sql.Tx) error {
		for _, q := range []string{
			"DELETE FROM item_tags",
			"DELETE FROM items",
			"DELETE FROM tags",
			"DELETE FROM sqlite_sequence",
		} {
			if _, err := tx.ExecContext(ctx, q); err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *Store) inTx(ctx context.Context, fn func(*sql.Tx) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}
