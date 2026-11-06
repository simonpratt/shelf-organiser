-- +goose Up
-- is_location marks the top-level tag remembered as the Location dimension
-- (the one that says where an item is), like is_type for the Type dimension.
ALTER TABLE tags ADD COLUMN is_location INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX tags_one_location_dimension ON tags (is_location) WHERE is_location = 1;

-- +goose Down
DROP INDEX tags_one_location_dimension;
ALTER TABLE tags DROP COLUMN is_location;
