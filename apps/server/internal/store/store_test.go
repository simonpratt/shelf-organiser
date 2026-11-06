package store

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"
)

func open(t *testing.T) *Store {
	t.Helper()
	s, err := Open(context.Background(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func paths(tags []Tag) []string {
	var out []string
	for _, t := range tags {
		out = append(out, strings.Join(t.Path, "/"))
	}
	return out
}

func refPaths(refs []TagRef) []string {
	var out []string
	for _, r := range refs {
		out = append(out, strings.Join(r.Path, "/"))
	}
	return out
}

func TestOpenTwiceKeepsDataAndSkipsAppliedMigrations(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	s, err := Open(ctx, dir)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateItem(ctx, ItemInput{Name: "Tent", Litres: 30, Quantity: 1}); err != nil {
		t.Fatal(err)
	}
	s.Close()

	s, err = Open(ctx, dir)
	if err != nil {
		t.Fatalf("reopening: %v", err)
	}
	defer s.Close()
	items, err := s.ListItems(ctx)
	if err != nil || len(items) != 1 {
		t.Fatalf("got %v, %v; want the one item", items, err)
	}
}

func TestCreateItemCreatesMissingAncestorsAndReusesExistingTagsIgnoringCase(t *testing.T) {
	ctx := context.Background()
	s := open(t)

	if _, err := s.EnsureTag(ctx, []string{"Type", "Camping"}); err != nil {
		t.Fatal(err)
	}
	item, err := s.CreateItem(ctx, ItemInput{
		Name: " Tent ", Litres: 30, Quantity: 2,
		Tags: [][]string{{"type", "camping", "Tents"}, {"Location", "Shed"}, {"Type", "Camping", "tents"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if item.Name != "Tent" {
		t.Errorf("name = %q; want trimmed", item.Name)
	}
	if got, want := refPaths(item.Tags), []string{"Location/Shed", "Type/Camping/Tents"}; !slices.Equal(got, want) {
		t.Errorf("item tags = %v; want %v", got, want)
	}

	tags, err := s.ListTags(ctx)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"Location", "Location/Shed", "Type", "Type/Camping", "Type/Camping/Tents"}
	if got := paths(tags); !slices.Equal(got, want) {
		t.Errorf("tags = %v; want %v", got, want)
	}
}

func TestListItemsPutsLargestTotalSpaceFirst(t *testing.T) {
	ctx := context.Background()
	s := open(t)
	for _, in := range []ItemInput{
		{Name: "Shoebox", Litres: 8, Quantity: 1},
		{Name: "Crates", Litres: 45, Quantity: 3}, // 135 L
		{Name: "Couch", Litres: 100, Quantity: 1},
	} {
		if _, err := s.CreateItem(ctx, in); err != nil {
			t.Fatal(err)
		}
	}
	items, err := s.ListItems(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, it := range items {
		names = append(names, it.Name)
	}
	if want := []string{"Crates", "Couch", "Shoebox"}; !slices.Equal(names, want) {
		t.Errorf("order = %v; want %v", names, want)
	}
}

func TestItemValidation(t *testing.T) {
	ctx := context.Background()
	s := open(t)
	for name, in := range map[string]ItemInput{
		"blank name":        {Name: "  ", Litres: 1, Quantity: 1},
		"zero litres":       {Name: "x", Litres: 0, Quantity: 1},
		"zero quantity":     {Name: "x", Litres: 1, Quantity: 0},
		"empty tag segment": {Name: "x", Litres: 1, Quantity: 1, Tags: [][]string{{"Type", " "}}},
		"slash in tag":      {Name: "x", Litres: 1, Quantity: 1, Tags: [][]string{{"a/b"}}},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := s.CreateItem(ctx, in)
			var v *ValidationError
			if !errors.As(err, &v) {
				t.Fatalf("err = %v; want a ValidationError", err)
			}
		})
	}
	// A rejected item must not leave half-created tags behind.
	if tags, _ := s.ListTags(ctx); len(tags) != 0 {
		t.Errorf("tags after rejected items = %v; want none", paths(tags))
	}
}

func TestUpdateItemReplacesTags(t *testing.T) {
	ctx := context.Background()
	s := open(t)
	item, err := s.CreateItem(ctx, ItemInput{Name: "Drill", Litres: 5, Quantity: 1, Tags: [][]string{{"Tools"}}})
	if err != nil {
		t.Fatal(err)
	}
	item, err = s.UpdateItem(ctx, item.ID, ItemInput{Name: "Drill", Litres: 6, Quantity: 2, Note: "cordless", Tags: [][]string{{"Tools", "Power tools"}}})
	if err != nil {
		t.Fatal(err)
	}
	if item.Litres != 6 || item.Quantity != 2 || item.Note != "cordless" {
		t.Errorf("item = %+v; want updated fields", item)
	}
	if got := refPaths(item.Tags); !slices.Equal(got, []string{"Tools/Power tools"}) {
		t.Errorf("tags = %v; want only Tools/Power tools", got)
	}
	if _, err := s.UpdateItem(ctx, 999, ItemInput{Name: "x", Litres: 1, Quantity: 1}); !errors.Is(err, ErrNotFound) {
		t.Errorf("updating a missing item: err = %v; want ErrNotFound", err)
	}
}

func TestMoveTagCarriesDescendantsAndRefusesCycles(t *testing.T) {
	ctx := context.Background()
	s := open(t)
	shelf, _ := s.EnsureTag(ctx, []string{"Location", "Shed", "Shelf 2"})
	shed := *shelf.ParentID
	room, _ := s.EnsureTag(ctx, []string{"Location", "Back room"})
	item, _ := s.CreateItem(ctx, ItemInput{Name: "Paint", Litres: 4, Quantity: 1, Tags: [][]string{{"Location", "Shed", "Shelf 2"}}})

	// Move Shed under Back room, renaming it.
	if _, err := s.UpdateTag(ctx, shed, "Cupboard", &room.ID, false); err != nil {
		t.Fatal(err)
	}
	item, _ = s.GetItem(ctx, item.ID)
	if got, want := refPaths(item.Tags), []string{"Location/Back room/Cupboard/Shelf 2"}; !slices.Equal(got, want) {
		t.Errorf("item tags after move = %v; want %v", got, want)
	}

	// Moving a tag under its own descendant would make a cycle.
	_, err := s.UpdateTag(ctx, room.ID, "Back room", &shelf.ID, false)
	var v *ValidationError
	if !errors.As(err, &v) {
		t.Errorf("moving under a descendant: err = %v; want a ValidationError", err)
	}
	if _, err := s.UpdateTag(ctx, room.ID, "Back room", &room.ID, false); !errors.As(err, &v) {
		t.Errorf("moving under itself: err = %v; want a ValidationError", err)
	}

	// Moving to top level works with a nil parent.
	top, err := s.UpdateTag(ctx, room.ID, "Back room", nil, false)
	if err != nil || top.ParentID != nil || !slices.Equal(top.Path, []string{"Back room"}) {
		t.Errorf("move to top = %+v, %v; want a top-level Back room", top, err)
	}
}

func TestRenameTagToASiblingsNameConflicts(t *testing.T) {
	ctx := context.Background()
	s := open(t)
	a, _ := s.EnsureTag(ctx, []string{"Type", "Camping"})
	_, _ = s.EnsureTag(ctx, []string{"Type", "Garden"})
	if _, err := s.UpdateTag(ctx, a.ID, "garden", a.ParentID, false); !errors.Is(err, ErrConflict) {
		t.Errorf("err = %v; want ErrConflict", err)
	}
	// Changing only the case of its own name is not a conflict.
	if _, err := s.UpdateTag(ctx, a.ID, "CAMPING", a.ParentID, false); err != nil {
		t.Errorf("recasing own name: %v", err)
	}
}

func TestMergingATagMovesItsItemsAndChildrenIntoTheSiblingWithThatName(t *testing.T) {
	ctx := context.Background()
	s := open(t)
	bench, _ := s.EnsureTag(ctx, []string{"Location", "Shed", "Workbench"})
	both, _ := s.CreateItem(ctx, ItemInput{Name: "Vice", Litres: 5, Quantity: 1,
		Tags: [][]string{{"Location", "Shed", "Workbench"}, {"Location", "Shed", "Left shelf"}}})
	drawer, _ := s.CreateItem(ctx, ItemInput{Name: "Screws", Litres: 1, Quantity: 1,
		Tags: [][]string{{"Location", "Shed", "Workbench", "Drawer", "Top"}}})
	hook, _ := s.CreateItem(ctx, ItemInput{Name: "Saw", Litres: 3, Quantity: 1,
		Tags: [][]string{{"Location", "Shed", "Workbench", "Hooks"}}})
	_, _ = s.EnsureTag(ctx, []string{"Location", "Shed", "Left shelf", "drawer", "Bottom"})

	// Without merge the clash is refused and nothing changes.
	if _, err := s.UpdateTag(ctx, bench.ID, "left shelf", bench.ParentID, false); !errors.Is(err, ErrConflict) {
		t.Fatalf("err = %v; want ErrConflict", err)
	}
	got, err := s.UpdateTag(ctx, bench.ID, "left shelf", bench.ParentID, true)
	if err != nil {
		t.Fatal(err)
	}
	// The survivor keeps its own name; same-named children merge too.
	if want := []string{"Location", "Shed", "Left shelf"}; !slices.Equal(got.Path, want) {
		t.Errorf("survivor = %v; want %v", got.Path, want)
	}
	tags, _ := s.ListTags(ctx)
	if got, want := paths(tags), []string{"Location", "Location/Shed", "Location/Shed/Left shelf",
		"Location/Shed/Left shelf/drawer", "Location/Shed/Left shelf/drawer/Bottom",
		"Location/Shed/Left shelf/drawer/Top", "Location/Shed/Left shelf/Hooks"}; !slices.Equal(got, want) {
		t.Errorf("tags = %v; want %v", got, want)
	}
	for _, c := range []struct {
		id   int64
		want []string
	}{
		{both.ID, []string{"Location/Shed/Left shelf"}},
		{drawer.ID, []string{"Location/Shed/Left shelf/drawer/Top"}},
		{hook.ID, []string{"Location/Shed/Left shelf/Hooks"}},
	} {
		it, _ := s.GetItem(ctx, c.id)
		if got := refPaths(it.Tags); !slices.Equal(got, c.want) {
			t.Errorf("%s tags = %v; want %v", it.Name, got, c.want)
		}
	}
}

func TestMovingATagOntoASameNamedTagMerges(t *testing.T) {
	ctx := context.Background()
	s := open(t)
	loose, _ := s.EnsureTag(ctx, []string{"Shed"})
	shed, _ := s.EnsureTag(ctx, []string{"Location", "Shed"})
	item, _ := s.CreateItem(ctx, ItemInput{Name: "Rake", Litres: 8, Quantity: 1, Tags: [][]string{{"Shed", "Top shelf"}}})

	if _, err := s.UpdateTag(ctx, loose.ID, "Shed", shed.ParentID, true); err != nil {
		t.Fatal(err)
	}
	item, _ = s.GetItem(ctx, item.ID)
	if got, want := refPaths(item.Tags), []string{"Location/Shed/Top shelf"}; !slices.Equal(got, want) {
		t.Errorf("item tags = %v; want %v", got, want)
	}
}

func TestDeleteTagRemovesSubtreeButKeepsItems(t *testing.T) {
	ctx := context.Background()
	s := open(t)
	item, _ := s.CreateItem(ctx, ItemInput{Name: "Tent", Litres: 30, Quantity: 1,
		Tags: [][]string{{"Type", "Camping", "Tents"}, {"Location", "Shed"}}})
	camping, _ := s.EnsureTag(ctx, []string{"Type", "Camping"})

	if err := s.DeleteTag(ctx, camping.ID); err != nil {
		t.Fatal(err)
	}
	tags, _ := s.ListTags(ctx)
	if got, want := paths(tags), []string{"Location", "Location/Shed", "Type"}; !slices.Equal(got, want) {
		t.Errorf("tags = %v; want %v", got, want)
	}
	item, err := s.GetItem(ctx, item.ID)
	if err != nil {
		t.Fatalf("item should survive its tag's deletion: %v", err)
	}
	if got := refPaths(item.Tags); !slices.Equal(got, []string{"Location/Shed"}) {
		t.Errorf("item tags = %v; want only Location/Shed", got)
	}
	if err := s.DeleteTag(ctx, camping.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("deleting again: err = %v; want ErrNotFound", err)
	}
}

func TestDeleteItemKeepsTags(t *testing.T) {
	ctx := context.Background()
	s := open(t)
	item, _ := s.CreateItem(ctx, ItemInput{Name: "Tent", Litres: 30, Quantity: 1, Tags: [][]string{{"Type"}}})
	if err := s.DeleteItem(ctx, item.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetItem(ctx, item.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("get after delete: err = %v; want ErrNotFound", err)
	}
	tags, _ := s.ListTags(ctx)
	if len(tags) != 1 || tags[0].ItemCount != 0 {
		t.Errorf("tags = %+v; want Type with no items", tags)
	}
}

func TestTagCountsCoverTheSubtreeAndCountEachItemOnce(t *testing.T) {
	ctx := context.Background()
	s := open(t)
	// Tent sits under Location twice (Shed and Shed/Shelf 2), so it must count once.
	mustCreate := func(in ItemInput) {
		if _, err := s.CreateItem(ctx, in); err != nil {
			t.Fatal(err)
		}
	}
	mustCreate(ItemInput{Name: "Tent", Litres: 30, Quantity: 2, Tags: [][]string{{"Location", "Shed"}, {"Location", "Shed", "Shelf 2"}}})
	mustCreate(ItemInput{Name: "Drill", Litres: 5, Quantity: 1, Tags: [][]string{{"Location", "Garage"}}})
	mustCreate(ItemInput{Name: "Bike", Litres: 200, Quantity: 1})

	tags, err := s.ListTags(ctx)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string][2]float64{}
	for _, tg := range tags {
		got[strings.Join(tg.Path, "/")] = [2]float64{float64(tg.ItemCount), tg.TotalSpace}
	}
	want := map[string][2]float64{
		"Location":              {2, 65},
		"Location/Garage":       {1, 5},
		"Location/Shed":         {1, 60},
		"Location/Shed/Shelf 2": {1, 60},
	}
	for path, w := range want {
		if got[path] != w {
			t.Errorf("%s: (items, litres) = %v; want %v", path, got[path], w)
		}
	}
}

func TestAddItemTagsKeepsExistingTagsAndChangesNothingOnAFailure(t *testing.T) {
	ctx := context.Background()
	s := open(t)
	mower, err := s.CreateItem(ctx, ItemInput{Name: "Mower", Litres: 300, Quantity: 1, Tags: [][]string{{"Location", "Shed"}}})
	if err != nil {
		t.Fatal(err)
	}
	tent, err := s.CreateItem(ctx, ItemInput{Name: "Tent", Litres: 40, Quantity: 1})
	if err != nil {
		t.Fatal(err)
	}

	// An unknown item rolls back the whole batch, including the new tags.
	err = s.AddItemTags(ctx, []TagAssignment{{ItemID: mower.ID, Tags: [][]string{{"Type", "Garden"}}}, {ItemID: 999, Tags: [][]string{{"Type", "Camping"}}}})
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v; want ErrNotFound", err)
	}
	if tags, _ := s.ListTags(ctx); !slices.Equal(paths(tags), []string{"Location", "Location/Shed"}) {
		t.Errorf("tags after a failed batch = %v; want no new ones", paths(tags))
	}

	if err := s.AddItemTags(ctx, []TagAssignment{
		{ItemID: mower.ID, Tags: [][]string{{"type", "Garden"}}},
		{ItemID: tent.ID, Tags: [][]string{{"Type", "Camping"}}},
	}); err != nil {
		t.Fatal(err)
	}
	got, _ := s.GetItem(ctx, mower.ID)
	if !slices.Equal(refPaths(got.Tags), []string{"Location/Shed", "type/Garden"}) {
		t.Errorf("mower tags = %v; want its Location kept and the Type added", refPaths(got.Tags))
	}
	got, _ = s.GetItem(ctx, tent.ID)
	if !slices.Equal(refPaths(got.Tags), []string{"type/Camping"}) {
		t.Errorf("tent tags = %v; want the type tag created just before reused", refPaths(got.Tags))
	}
}
