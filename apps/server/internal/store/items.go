package store

import (
	"context"
	"database/sql"
	"math"
	"slices"
	"strings"
)

// Item is something stored in the shed. Its total space is Litres × Quantity.
type Item struct {
	ID       int64
	Name     string
	Litres   float64 // volume of one unit
	Quantity int
	Note     string
	Tags     []TagRef // sorted by path
}

// ItemInput is the editable part of an item. Tags are paths; any that don't
// exist yet are created along with their ancestors.
type ItemInput struct {
	Name     string
	Litres   float64
	Quantity int
	Note     string
	Tags     [][]string
}

const (
	maxItemName = 200
	maxNote     = 2000
	maxLitres   = 1_000_000 // a 100 m³ room; anything bigger is a typo
)

func (in ItemInput) clean() (ItemInput, error) {
	in.Name = strings.TrimSpace(in.Name)
	in.Note = strings.TrimSpace(in.Note)
	switch {
	case in.Name == "":
		return in, invalid("name is required")
	case len([]rune(in.Name)) > maxItemName:
		return in, invalid("name can be at most %d characters", maxItemName)
	case math.IsNaN(in.Litres) || in.Litres <= 0:
		return in, invalid("size must be more than 0 litres")
	case in.Litres > maxLitres:
		return in, invalid("size can be at most %d litres", maxLitres)
	case in.Quantity < 1:
		return in, invalid("quantity must be at least 1")
	case len([]rune(in.Note)) > maxNote:
		return in, invalid("note can be at most %d characters", maxNote)
	}
	return in, nil
}

// ListItems returns every item, largest total space first.
func (s *Store) ListItems(ctx context.Context) ([]Item, error) {
	return s.items(ctx, "")
}

// GetItem returns item id.
func (s *Store) GetItem(ctx context.Context, id int64) (Item, error) {
	items, err := s.items(ctx, "WHERE i.id = ?", id)
	if err != nil {
		return Item{}, err
	}
	if len(items) == 0 {
		return Item{}, ErrNotFound
	}
	return items[0], nil
}

func (s *Store) items(ctx context.Context, where string, args ...any) ([]Item, error) {
	tags, err := loadTags(ctx, s.db)
	if err != nil {
		return nil, err
	}
	links, err := itemTagLinks(ctx, s.db)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, litres, quantity, note FROM items i `+where+`
		ORDER BY litres * quantity DESC, name COLLATE NOCASE, id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Item
	for rows.Next() {
		var it Item
		if err := rows.Scan(&it.ID, &it.Name, &it.Litres, &it.Quantity, &it.Note); err != nil {
			return nil, err
		}
		it.Tags = []TagRef{}
		for _, tagID := range links[it.ID] {
			if t, ok := tags[tagID]; ok {
				it.Tags = append(it.Tags, TagRef{ID: t.ID, Path: t.Path})
			}
		}
		slices.SortFunc(it.Tags, func(a, b TagRef) int { return comparePaths(a.Path, b.Path) })
		out = append(out, it)
	}
	return out, rows.Err()
}

// itemTagLinks returns the tag ids of every item, keyed by item id.
func itemTagLinks(ctx context.Context, q queryer) (map[int64][]int64, error) {
	rows, err := q.QueryContext(ctx, "SELECT item_id, tag_id FROM item_tags")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	links := map[int64][]int64{}
	for rows.Next() {
		var item, tag int64
		if err := rows.Scan(&item, &tag); err != nil {
			return nil, err
		}
		links[item] = append(links[item], tag)
	}
	return links, rows.Err()
}

// CreateItem adds an item, creating any missing tags in its tag paths. With
// no Location dimension yet, its first tag outside the Type dimension starts
// one (rememberLocationDimension).
func (s *Store) CreateItem(ctx context.Context, in ItemInput) (Item, error) {
	in, err := in.clean()
	if err != nil {
		return Item{}, err
	}
	var id int64
	err = s.inTx(ctx, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx,
			"INSERT INTO items (name, litres, quantity, note) VALUES (?, ?, ?, ?)",
			in.Name, in.Litres, in.Quantity, in.Note)
		if err != nil {
			return err
		}
		if id, err = res.LastInsertId(); err != nil {
			return err
		}
		if err := setItemTags(ctx, tx, id, in.Tags); err != nil {
			return err
		}
		return rememberLocationDimension(ctx, tx, in.Tags)
	})
	if err != nil {
		return Item{}, err
	}
	return s.GetItem(ctx, id)
}

// UpdateItem replaces item id, including its whole set of tags.
func (s *Store) UpdateItem(ctx context.Context, id int64, in ItemInput) (Item, error) {
	in, err := in.clean()
	if err != nil {
		return Item{}, err
	}
	err = s.inTx(ctx, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx,
			"UPDATE items SET name = ?, litres = ?, quantity = ?, note = ? WHERE id = ?",
			in.Name, in.Litres, in.Quantity, in.Note, id)
		if err != nil {
			return err
		}
		if n, err := res.RowsAffected(); err != nil {
			return err
		} else if n == 0 {
			return ErrNotFound
		}
		if _, err := tx.ExecContext(ctx, "DELETE FROM item_tags WHERE item_id = ?", id); err != nil {
			return err
		}
		return setItemTags(ctx, tx, id, in.Tags)
	})
	if err != nil {
		return Item{}, err
	}
	return s.GetItem(ctx, id)
}

func setItemTags(ctx context.Context, tx *sql.Tx, itemID int64, paths [][]string) error {
	for _, p := range paths {
		tagID, err := ensurePath(ctx, tx, p)
		if err != nil {
			return err
		}
		// OR IGNORE: two paths differing only in case name the same tag.
		if _, err := tx.ExecContext(ctx,
			"INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)", itemID, tagID); err != nil {
			return err
		}
	}
	return nil
}

// DeleteItem deletes item id.
func (s *Store) DeleteItem(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx, "DELETE FROM items WHERE id = ?", id)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// TagAssignment adds tags to one item.
type TagAssignment struct {
	ItemID int64
	Tags   [][]string
}

// AddItemTags adds each assignment's tags to its item, keeping the tags it
// has and creating any missing tags, all in one transaction: an unknown item
// or an invalid path changes nothing.
func (s *Store) AddItemTags(ctx context.Context, assignments []TagAssignment) error {
	return s.inTx(ctx, func(tx *sql.Tx) error {
		for _, a := range assignments {
			var exists bool
			if err := tx.QueryRowContext(ctx, "SELECT EXISTS (SELECT 1 FROM items WHERE id = ?)", a.ItemID).Scan(&exists); err != nil {
				return err
			}
			if !exists {
				return ErrNotFound
			}
			if err := setItemTags(ctx, tx, a.ItemID, a.Tags); err != nil {
				return err
			}
		}
		return nil
	})
}
