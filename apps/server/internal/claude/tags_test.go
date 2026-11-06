package claude

import (
	"context"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"shelf-organiser/apps/server/internal/claude/claudefake"
)

func TestCleanProposalsKeepsOnlyApplicableTagsInTheTypeDimension(t *testing.T) {
	ask := TagAsk{
		Tree: [][]string{{"Location"}, {"Location", "Shed"}, {"Kind"}, {"Kind", "Garden"}},
		Items: []ItemToTag{
			{Ref: 1, Name: "Lawn mower", Tags: [][]string{{"Location", "Shed"}}},
			{Ref: 2, Name: "Tent", Tags: [][]string{{"Kind", "Garden"}}}, // already has a Kind tag
			{Ref: 3, Name: "Hose"},
			{Ref: 4, Name: "Mystery box"},
		},
		PerItem: 2, MaxItems: 10,
	}
	got := cleanProposals(proposalOutput{
		Dimension: "kind", // matched to the stored "Kind"
		Items: []struct {
			Ref  int64    `json:"ref"`
			Tags []string `json:"tags"`
		}{
			{Ref: 3, Tags: []string{"Kind/garden", "kind/Garden/Hoses", "Kind/garden", "Kind/Garden/Hoses/Long/Too deep"}},
			{Ref: 1, Tags: []string{"Location/Shed/Floor", "Kind", "Kind/Bad›name", "Kind/Garden/Lawn care", "Kind/Tools"}},
			{Ref: 2, Tags: []string{"Kind/Camping"}},
			{Ref: 99, Tags: []string{"Kind/Garden"}},
			{Ref: 3, Tags: []string{"Kind/Sport"}}, // a second answer for the same item
		},
	}, ask)

	if got.Dimension != "Kind" {
		t.Errorf("dimension = %q; want the stored Kind", got.Dimension)
	}
	want := []ItemProposal{
		// Back in the order asked; Location, the bare dimension and bad names dropped; at most two each.
		{Ref: 1, Tags: []ProposedTag{{Path: []string{"Kind", "Garden", "Lawn care"}, New: true}, {Path: []string{"Kind", "Tools"}, New: true}}},
		// Existing tags come back as stored; repeats and over-deep paths dropped.
		{Ref: 3, Tags: []ProposedTag{{Path: []string{"Kind", "Garden"}}, {Path: []string{"Kind", "Garden", "Hoses"}, New: true}}},
	}
	if !slices.EqualFunc(got.Items, want, func(a, b ItemProposal) bool {
		return a.Ref == b.Ref && slices.EqualFunc(a.Tags, b.Tags, func(x, y ProposedTag) bool { return x.New == y.New && slices.Equal(x.Path, y.Path) })
	}) {
		t.Errorf("items = %+v\nwant  %+v", got.Items, want)
	}
	if got.Remaining != 1 {
		t.Errorf("remaining = %d; want 1 (the mystery box)", got.Remaining)
	}
}

func TestCleanProposalsStartsATypeDimensionWhenClaudeGivesNoUsableOne(t *testing.T) {
	got := cleanProposals(proposalOutput{Dimension: "Kinds/of thing", Items: []struct {
		Ref  int64    `json:"ref"`
		Tags []string `json:"tags"`
	}{{Ref: 1, Tags: []string{"Type/Camping"}}}}, TagAsk{Items: []ItemToTag{{Ref: 1, Name: "Tent"}}, PerItem: 1, MaxItems: 1})
	if got.Dimension != "Type" || len(got.Items) != 1 || !got.Items[0].Tags[0].New {
		t.Errorf("got %+v; want a new Type › Camping", got)
	}
}

func TestCleanProposalsKeepsToTheTypeDimensionTheAppKnows(t *testing.T) {
	got := cleanProposals(proposalOutput{Dimension: "Type", Items: []struct {
		Ref  int64    `json:"ref"`
		Tags []string `json:"tags"`
	}{{Ref: 1, Tags: []string{"Type/Camping", "Stuff/Camping"}}}}, TagAsk{
		Items: []ItemToTag{{Ref: 1, Name: "Tent"}}, Tree: [][]string{{"Stuff"}, {"Type"}}, Dimension: "Stuff", PerItem: 2, MaxItems: 1,
	})
	if got.Dimension != "Stuff" || len(got.Items) != 1 || len(got.Items[0].Tags) != 1 || got.Items[0].Tags[0].Path[0] != "Stuff" {
		t.Errorf("got %+v; want only Stuff › Camping", got)
	}
	if msg := TagMessage(TagAsk{Dimension: "Stuff"}); !strings.Contains(msg, `what things are is "Stuff"`) {
		t.Errorf("prompt doesn't name the dimension: %q", msg)
	}
}

func TestProposeTagsSendsTheTreeAndItemsToHaiku(t *testing.T) {
	fake := claudefake.New("test-key")
	srv := httptest.NewServer(fake)
	defer srv.Close()

	got, err := New("test-key", srv.URL).ProposeTags(context.Background(), TagAsk{
		Tree:    [][]string{{"Type"}, {"Type", "Camping"}},
		Items:   []ItemToTag{{Ref: 7, Name: "Camping stove", Note: "gas"}},
		PerItem: 3, MaxItems: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Items) != 1 || got.Items[0].Ref != 7 || got.Items[0].Tags[0].New {
		t.Fatalf("got %+v; want the existing Type › Camping for item 7", got)
	}

	body := fake.Requests()[0].Body
	if body["model"] != string(TagModel) {
		t.Errorf("model = %v; want %s", body["model"], TagModel)
	}
	if _, ok := body["fallbacks"]; ok {
		t.Error("sent fallbacks; Haiku has no fallback model")
	}
	prompt := body["messages"].([]any)[0].(map[string]any)["content"].([]any)[0].(map[string]any)["text"].(string)
	if !strings.Contains(prompt, "Type/Camping\n") || !strings.Contains(prompt, `{"name":"Camping stove","note":"gas","ref":7,"tags":[]}`) {
		t.Errorf("prompt doesn't carry the tree and the item: %q", prompt)
	}
}
