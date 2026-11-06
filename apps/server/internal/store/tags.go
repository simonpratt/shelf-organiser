package store

import (
	"context"
	"database/sql"
	"errors"
	"slices"
	"strings"
)

// Tag is one node of the tag tree.
type Tag struct {
	ID       int64
	Name     string
	ParentID *int64
	// Path is the tag's names from its top-level ancestor down to itself.
	Path []string
	// ItemCount and TotalSpace cover the tag's whole subtree, counting an
	// item tagged at several levels once.
	ItemCount  int
	TotalSpace float64
}

// TagRef is a tag as attached to an item.
type TagRef struct {
	ID   int64
	Path []string
}

const maxTagName = 60

// queryer is satisfied by both *sql.DB and *sql.Tx.
type queryer interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

// cleanTagName trims a tag name and rejects names the UI could not round-trip:
// "/" is how a path is typed and "›" is how one is shown.
func cleanTagName(name string) (string, error) {
	name = strings.TrimSpace(name)
	switch {
	case name == "":
		return "", invalid("tag names can't be empty")
	case len([]rune(name)) > maxTagName:
		return "", invalid("tag names can be at most %d characters", maxTagName)
	case strings.ContainsAny(name, "/›"):
		return "", invalid("tag names can't contain / or ›")
	}
	return name, nil
}

// loadTags returns every tag keyed by id, with paths filled in.
func loadTags(ctx context.Context, q queryer) (map[int64]*Tag, error) {
	rows, err := q.QueryContext(ctx, `
		WITH RECURSIVE sub(top, id) AS (
			SELECT id, id FROM tags
			UNION ALL
			SELECT sub.top, t.id FROM tags t JOIN sub ON t.parent_id = sub.id
		),
		linked AS (
			SELECT DISTINCT sub.top, i.id, i.litres * i.quantity AS space
			FROM sub
			JOIN item_tags it ON it.tag_id = sub.id
			JOIN items i ON i.id = it.item_id
		)
		SELECT t.id, t.name, t.parent_id, COUNT(l.id), COALESCE(SUM(l.space), 0)
		FROM tags t LEFT JOIN linked l ON l.top = t.id
		GROUP BY t.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tags := map[int64]*Tag{}
	for rows.Next() {
		var t Tag
		var parent sql.NullInt64
		if err := rows.Scan(&t.ID, &t.Name, &parent, &t.ItemCount, &t.TotalSpace); err != nil {
			return nil, err
		}
		if parent.Valid {
			t.ParentID = &parent.Int64
		}
		tags[t.ID] = &t
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for _, t := range tags {
		t.Path = pathOf(tags, t.ID)
	}
	return tags, nil
}

func pathOf(tags map[int64]*Tag, id int64) []string {
	var path []string
	// UpdateTag refuses cycles, so this walk always reaches the top; the
	// length bound only stops a corrupted database from hanging a request.
	for t := tags[id]; t != nil && len(path) <= len(tags); {
		path = append(path, t.Name)
		if t.ParentID == nil {
			break
		}
		t = tags[*t.ParentID]
	}
	slices.Reverse(path)
	return path
}

func comparePaths(a, b []string) int {
	for i := 0; i < len(a) && i < len(b); i++ {
		if c := strings.Compare(strings.ToLower(a[i]), strings.ToLower(b[i])); c != 0 {
			return c
		}
	}
	return len(a) - len(b)
}

// ListTags returns every tag sorted by path, so parents come before children.
func (s *Store) ListTags(ctx context.Context) ([]Tag, error) {
	tags, err := loadTags(ctx, s.db)
	if err != nil {
		return nil, err
	}
	out := make([]Tag, 0, len(tags))
	for _, t := range tags {
		out = append(out, *t)
	}
	slices.SortFunc(out, func(a, b Tag) int { return comparePaths(a.Path, b.Path) })
	return out, nil
}

// EnsureTag returns the tag at path, creating it and any missing ancestors.
// Names match existing tags ignoring case, so "type/camping" reuses
// "Type › Camping".
func (s *Store) EnsureTag(ctx context.Context, path []string) (Tag, error) {
	var id int64
	err := s.inTx(ctx, func(tx *sql.Tx) error {
		var err error
		id, err = ensurePath(ctx, tx, path)
		return err
	})
	if err != nil {
		return Tag{}, err
	}
	return s.tag(ctx, id)
}

func ensurePath(ctx context.Context, q queryer, path []string) (int64, error) {
	if len(path) == 0 {
		return 0, invalid("a tag path needs at least one name")
	}
	var parent *int64
	var id int64
	for _, raw := range path {
		name, err := cleanTagName(raw)
		if err != nil {
			return 0, err
		}
		id, err = siblingNamed(ctx, q, parent, name, 0)
		if errors.Is(err, ErrNotFound) {
			res, err := q.ExecContext(ctx, "INSERT INTO tags (name, parent_id) VALUES (?, ?)", name, parent)
			if err != nil {
				return 0, err
			}
			if id, err = res.LastInsertId(); err != nil {
				return 0, err
			}
		} else if err != nil {
			return 0, err
		}
		parent = new(id) // a copy: id is reassigned on the next iteration
	}
	return id, nil
}

// siblingNamed finds the tag under parent (nil for top level) called name,
// ignoring case and the tag excludeID.
func siblingNamed(ctx context.Context, q queryer, parent *int64, name string, excludeID int64) (int64, error) {
	var p int64
	if parent != nil {
		p = *parent
	}
	var id int64
	err := q.QueryRowContext(ctx,
		"SELECT id FROM tags WHERE COALESCE(parent_id, 0) = ? AND name = ? COLLATE NOCASE AND id != ?",
		p, name, excludeID).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrNotFound
	}
	return id, err
}

func (s *Store) tag(ctx context.Context, id int64) (Tag, error) {
	tags, err := loadTags(ctx, s.db)
	if err != nil {
		return Tag{}, err
	}
	t, ok := tags[id]
	if !ok {
		return Tag{}, ErrNotFound
	}
	return *t, nil
}

// UpdateTag renames tag id and moves it under parentID (nil for top level).
// Its descendants and item links move with it. When a sibling there already
// has the name, UpdateTag returns ErrConflict, unless merge is set: then tag
// id is merged into that sibling (see mergeInto) and the sibling is returned.
func (s *Store) UpdateTag(ctx context.Context, id int64, name string, parentID *int64, merge bool) (Tag, error) {
	survivor := id
	err := s.inTx(ctx, func(tx *sql.Tx) error {
		tags, err := loadTags(ctx, tx)
		if err != nil {
			return err
		}
		if _, ok := tags[id]; !ok {
			return ErrNotFound
		}
		name, err := cleanTagName(name)
		if err != nil {
			return err
		}
		if parentID != nil {
			if _, ok := tags[*parentID]; !ok {
				return invalid("the new parent tag doesn't exist")
			}
			for p := tags[*parentID]; p != nil; {
				if p.ID == id {
					return invalid("a tag can't be moved inside itself")
				}
				if p.ParentID == nil {
					break
				}
				p = tags[*p.ParentID]
			}
		}
		sibling, err := siblingNamed(ctx, tx, parentID, name, id)
		switch {
		case err == nil && !merge:
			return ErrConflict
		case err == nil:
			survivor = sibling
			return mergeInto(ctx, tx, id, sibling)
		case !errors.Is(err, ErrNotFound):
			return err
		}
		_, err = tx.ExecContext(ctx, "UPDATE tags SET name = ?, parent_id = ? WHERE id = ?", name, parentID, id)
		return err
	})
	if err != nil {
		return Tag{}, err
	}
	return s.tag(ctx, survivor)
}

// mergeInto folds tag src into tag dst and deletes src: src's items get dst
// instead, and src's child tags move under dst, each merged in turn into a
// child of dst with the same name (ignoring case). dst keeps its name.
func mergeInto(ctx context.Context, tx *sql.Tx, src, dst int64) error {
	if _, err := tx.ExecContext(ctx,
		"INSERT OR IGNORE INTO item_tags (item_id, tag_id) SELECT item_id, ? FROM item_tags WHERE tag_id = ?", dst, src); err != nil {
		return err
	}
	type child struct {
		id   int64
		name string
	}
	var children []child
	rows, err := tx.QueryContext(ctx, "SELECT id, name FROM tags WHERE parent_id = ?", src)
	if err != nil {
		return err
	}
	for rows.Next() {
		var c child
		if err := rows.Scan(&c.id, &c.name); err != nil {
			rows.Close()
			return err
		}
		children = append(children, c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for _, c := range children {
		same, err := siblingNamed(ctx, tx, &dst, c.name, 0)
		switch {
		case err == nil:
			if err := mergeInto(ctx, tx, c.id, same); err != nil {
				return err
			}
		case errors.Is(err, ErrNotFound):
			if _, err := tx.ExecContext(ctx, "UPDATE tags SET parent_id = ? WHERE id = ?", dst, c.id); err != nil {
				return err
			}
		default:
			return err
		}
	}
	_, err = tx.ExecContext(ctx, "DELETE FROM tags WHERE id = ?", src)
	return err
}

// DeleteTag deletes tag id and all its descendants. Items tagged with any of
// them keep existing and simply lose those tags (both via ON DELETE CASCADE).
func (s *Store) DeleteTag(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx, "DELETE FROM tags WHERE id = ?", id)
	if err != nil {
		return err
	}
	if n, err := res.RowsAffected(); err != nil {
		return err
	} else if n == 0 {
		return ErrNotFound
	}
	return nil
}
