-- +goose Up
-- Tags form a tree: a NULL parent_id is a top-level tag (a dimension such as
-- Location or Type). Deleting a tag deletes its subtree and, through
-- item_tags, unlinks those tags from items; the items themselves remain.
CREATE TABLE tags (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT    NOT NULL,
    parent_id INTEGER REFERENCES tags(id) ON DELETE CASCADE
);
-- Sibling names are unique ignoring case. COALESCE makes top-level tags
-- siblings of each other, since a plain UNIQUE treats every NULL as distinct.
CREATE UNIQUE INDEX tags_sibling_name ON tags (COALESCE(parent_id, 0), name COLLATE NOCASE);

-- litres is the volume of one unit; total space is litres * quantity.
CREATE TABLE items (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT    NOT NULL,
    litres   REAL    NOT NULL CHECK (litres > 0),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    note     TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE item_tags (
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, tag_id)
);
CREATE INDEX item_tags_tag ON item_tags (tag_id);

-- +goose Down
DROP TABLE item_tags;
DROP TABLE items;
DROP TABLE tags;
