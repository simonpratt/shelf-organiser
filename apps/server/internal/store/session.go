package store

import (
	"context"
	"crypto/rand"
	"fmt"
)

// SessionKey returns the key login sessions are signed with, creating a
// random one the first time, so sessions outlive a restart.
func (s *Store) SessionKey(ctx context.Context) ([]byte, error) {
	fresh := make([]byte, 32)
	if _, err := rand.Read(fresh); err != nil {
		return nil, err
	}
	if _, err := s.db.ExecContext(ctx, "INSERT OR IGNORE INTO session_key (id, key) VALUES (1, ?)", fresh); err != nil {
		return nil, fmt.Errorf("saving session key: %w", err)
	}
	var key []byte
	if err := s.db.QueryRowContext(ctx, "SELECT key FROM session_key WHERE id = 1").Scan(&key); err != nil {
		return nil, fmt.Errorf("reading session key: %w", err)
	}
	return key, nil
}
