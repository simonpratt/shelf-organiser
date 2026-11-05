package dictation

import (
	"context"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"shelf-organiser/apps/server/internal/dictation/claudefake"
)

func ptr(f float64) *float64 { return &f }

func TestCleanKeepsOnlyUsableDraftsAndExistingTags(t *testing.T) {
	existing := [][]string{{"Location", "Shed"}, {"Type", "Camping"}}
	got := Clean([]Draft{
		{Name: "  Camping chairs ", Quantity: 2, Litres: ptr(40), Tags: [][]string{{"type", "camping"}, {"Type", "Camping"}, {"Type", "Tents"}}},
		{Name: "   ", Quantity: 1, Litres: ptr(10)},
		{Name: "Mystery box", Quantity: 0, Litres: ptr(-5)},
	}, existing)

	if len(got) != 2 {
		t.Fatalf("got %d drafts; want 2 (the blank name dropped): %+v", len(got), got)
	}
	chairs, box := got[0], got[1]
	if chairs.Name != "Camping chairs" || chairs.Quantity != 2 || *chairs.Litres != 40 {
		t.Errorf("chairs = %+v", chairs)
	}
	// Matched ignoring case, returned as stored, the repeat and the unknown tag dropped.
	if len(chairs.Tags) != 1 || !slices.Equal(chairs.Tags[0], []string{"Type", "Camping"}) {
		t.Errorf("chairs tags = %v; want just Type/Camping", chairs.Tags)
	}
	if box.Quantity != 1 || box.Litres != nil {
		t.Errorf("box = %+v; want quantity 1 and no size", box)
	}
}

func TestClaudeSendsTheTagPathsAndReadsTheDrafts(t *testing.T) {
	fake := claudefake.New("test-key")
	srv := httptest.NewServer(fake)
	defer srv.Close()

	c := NewClaude("test-key", srv.URL)
	drafts, err := c.Extract(context.Background(), "two camping chairs and a drill from the shed",
		[][]string{{"Location", "Shed"}, {"Type", "Camping"}})
	if err != nil {
		t.Fatal(err)
	}
	if len(drafts) != 2 || drafts[0].Name != "Camping chairs" || drafts[0].Quantity != 2 || *drafts[0].Litres != 40 {
		t.Fatalf("drafts = %+v", drafts)
	}
	if !slices.EqualFunc(drafts[1].Tags, [][]string{{"Location", "Shed"}}, slices.Equal) {
		t.Errorf("drill tags = %v; want Location/Shed", drafts[1].Tags)
	}

	reqs := fake.Requests()
	if len(reqs) != 1 {
		t.Fatalf("got %d requests; want 1", len(reqs))
	}
	body := reqs[0].Body
	if body["model"] != Model {
		t.Errorf("model = %v", body["model"])
	}
	format := body["output_config"].(map[string]any)["format"].(map[string]any)
	if format["type"] != "json_schema" {
		t.Errorf("output_config.format = %v; want a JSON schema", format)
	}
	prompt := body["messages"].([]any)[0].(map[string]any)["content"].([]any)[0].(map[string]any)["text"].(string)
	if !strings.Contains(prompt, "Location/Shed\nType/Camping\n") {
		t.Errorf("prompt doesn't list the tag paths: %q", prompt)
	}
}

func TestClaudeErrorsNeverContainTheAPIKey(t *testing.T) {
	srv := httptest.NewServer(claudefake.New("right-key"))
	defer srv.Close()

	for name, c := range map[string]*Claude{
		"rejected key": NewClaude("wrong-key-sk-ant-123", srv.URL),
		"server error": NewClaude("right-key", srv.URL),
	} {
		t.Run(name, func(t *testing.T) {
			_, err := c.Extract(context.Background(), "a tent "+claudefake.FailMarker, nil)
			if err == nil {
				t.Fatal("want an error")
			}
			if strings.Contains(err.Error(), "sk-ant-123") || strings.Contains(err.Error(), "right-key") {
				t.Errorf("error leaks the key: %v", err)
			}
		})
	}
}
