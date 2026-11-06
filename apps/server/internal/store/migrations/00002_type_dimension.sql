-- +goose Up
-- is_type marks the top-level tag remembered as the Type dimension (the one
-- that says what kind of thing an item is). At most one tag has it, and only
-- a top-level tag: the store clears it when the tag moves under another.
ALTER TABLE tags ADD COLUMN is_type INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX tags_one_type_dimension ON tags (is_type) WHERE is_type = 1;

-- +goose Down
DROP INDEX tags_one_type_dimension;
ALTER TABLE tags DROP COLUMN is_type;
