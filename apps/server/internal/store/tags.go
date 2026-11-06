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
	// TypeDimension and LocationDimension are each set on at most one
	// top-level tag, never the same one (see resolveDimensions).
	TypeDimension     bool
	LocationDimension bool
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
		SELECT t.id, t.name, t.parent_id, t.is_type, t.is_location, COUNT(l.id), COALESCE(SUM(l.space), 0)
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
		if err := rows.Scan(&t.ID, &t.Name, &parent, &t.TypeDimension, &t.LocationDimension, &t.ItemCount, &t.TotalSpace); err != nil {
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
	resolveDimensions(tags)
	return tags, nil
}

// typeNames and locationNames are the names that make a top-level tag the
// Type or Location dimension when none has been remembered, in order of
// preference.
var (
	typeNames     = []string{"type", "kind", "category"}
	locationNames = []string{"location", "place", "room", "where"}
)

// resolveDimensions leaves TypeDimension and LocationDimension set only on
// the Type and Location dimensions. Each is the top-level tag remembered as
// it, else the first top-level tag named as in its names list, else none;
// the Type dimension is resolved first and is never also the Location one.
func resolveDimensions(tags map[int64]*Tag) {
	typ := pickDimension(tags, func(t *Tag) *bool { return &t.TypeDimension }, typeNames, nil)
	loc := pickDimension(tags, func(t *Tag) *bool { return &t.LocationDimension }, locationNames, typ)
	if typ != nil {
		typ.TypeDimension = true
	}
	if loc != nil {
		loc.LocationDimension = true
	}
}

// pickDimension clears flag on every tag and returns the top-level tag it was
// set on (remembered), else the first named as in names, skipping skip.
func pickDimension(tags map[int64]*Tag, flag func(*Tag) *bool, names []string, skip *Tag) *Tag {
	var remembered *Tag
	named := make([]*Tag, len(names))
	for _, t := range tags {
		f := flag(t)
		was := *f
		*f = false
		if t.ParentID != nil || t == skip {
			continue
		}
		if was {
			remembered = t
		}
		if i := slices.Index(names, strings.ToLower(t.Name)); i >= 0 {
			named[i] = t
		}
	}
	if remembered != nil {
		return remembered
	}
	for _, t := range named {
		if t != nil {
			return t
		}
	}
	return nil
}

// rememberLocationDimension makes the dimension of the first of paths
// outside the Type dimension the Location dimension, when there is none yet:
// an item's first such tag is usually where it is.
func rememberLocationDimension(ctx context.Context, tx *sql.Tx, paths [][]string) error {
	if len(paths) == 0 {
		return nil
	}
	tags, err := loadTags(ctx, tx)
	if err != nil {
		return err
	}
	typ := ""
	for _, t := range tags {
		if t.LocationDimension {
			return nil
		}
		if t.TypeDimension {
			typ = t.Name
		}
	}
	for _, p := range paths {
		if !strings.EqualFold(p[0], typ) {
			_, err := tx.ExecContext(ctx,
				"UPDATE tags SET is_location = 1 WHERE parent_id IS NULL AND name = ? COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM tags WHERE is_location = 1)", p[0])
			return err
		}
	}
	return nil
}

// RememberTypeDimension marks the top-level tag called name (ignoring case)
// as the Type dimension, unless one is remembered already or no such tag
// exists, so the first one Claude picks sticks.
func (s *Store) RememberTypeDimension(ctx context.Context, name string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE tags SET is_type = 1
		WHERE parent_id IS NULL AND name = ? COLLATE NOCASE
		AND NOT EXISTS (SELECT 1 FROM tags WHERE is_type = 1)`, name)
	return err
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
		// Only a top-level tag can be a remembered dimension.
		_, err = tx.ExecContext(ctx,
			"UPDATE tags SET name = ?, parent_id = ?, is_type = is_type AND ? IS NULL, is_location = is_location AND ? IS NULL WHERE id = ?",
			name, parentID, parentID, parentID, id)
		return err
	})
	if err != nil {
		return Tag{}, err
	}
	return s.tag(ctx, survivor)
}

// mergeInto folds tag src into tag dst and deletes src: src's items get dst
// instead, and src's child tags move under dst, each merged in turn into a
// child of dst with the same name (ignoring case). dst keeps its name, and
// becomes the Type or Location dimension if src was it and dst is top level.
func mergeInto(ctx context.Context, tx *sql.Tx, src, dst int64) error {
	var wasType, wasLocation bool
	if err := tx.QueryRowContext(ctx, "SELECT is_type, is_location FROM tags WHERE id = ?", src).Scan(&wasType, &wasLocation); err != nil {
		return err
	}
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
	if _, err := tx.ExecContext(ctx, "DELETE FROM tags WHERE id = ?", src); err != nil {
		return err
	}
	if wasType {
		if _, err = tx.ExecContext(ctx, "UPDATE tags SET is_type = 1 WHERE id = ? AND parent_id IS NULL", dst); err != nil {
			return err
		}
	}
	if wasLocation {
		_, err = tx.ExecContext(ctx, "UPDATE tags SET is_location = 1 WHERE id = ? AND parent_id IS NULL", dst)
	}
	return err
}

// DeleteTag deletes tag id and all its descendants. Items tagged with any of
// them keep existing; under a nested tag they move up to its parent, so they
// stay in the dimension (unless they have another tag inside the parent
// already), while under a top-level tag they just lose those tags. All in one
// transaction.
func (s *Store) DeleteTag(ctx context.Context, id int64) error {
	return s.inTx(ctx, func(tx *sql.Tx) error {
		tags, err := loadTags(ctx, tx)
		if err != nil {
			return err
		}
		tag, ok := tags[id]
		if !ok {
			return ErrNotFound
		}
		if tag.ParentID != nil {
			if err := moveItemsUp(ctx, tx, tags, id, *tag.ParentID); err != nil {
				return err
			}
		}
		// ON DELETE CASCADE takes the subtree and its item links.
		_, err = tx.ExecContext(ctx, "DELETE FROM tags WHERE id = ?", id)
		return err
	})
}

// moveItemsUp tags parent onto every item tagged inside id's subtree that has
// no other tag inside parent's.
func moveItemsUp(ctx context.Context, tx *sql.Tx, tags map[int64]*Tag, id, parent int64) error {
	links, err := itemTagLinks(ctx, tx)
	if err != nil {
		return err
	}
	within := func(tagID, top int64) bool {
		for t := tags[tagID]; t != nil; {
			if t.ID == top {
				return true
			}
			if t.ParentID == nil {
				return false
			}
			t = tags[*t.ParentID]
		}
		return false
	}
	for item, tagIDs := range links {
		losing, kept := false, false
		for _, t := range tagIDs {
			switch {
			case within(t, id):
				losing = true
			case within(t, parent):
				kept = true
			}
		}
		if losing && !kept {
			if _, err := tx.ExecContext(ctx, "INSERT INTO item_tags (item_id, tag_id) VALUES (?, ?)", item, parent); err != nil {
				return err
			}
		}
	}
	return nil
}
