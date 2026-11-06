-- +goose Up
-- One row: the random key login sessions are signed with, kept here so a
-- restart doesn't log the browser out. Reset leaves it alone.
CREATE TABLE session_key (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  key BLOB NOT NULL
);

-- +goose Down
DROP TABLE session_key;
