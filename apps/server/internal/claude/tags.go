package claude

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/anthropics/anthropic-sdk-go"
)

// Claude proposes tags in the Type dimension only, and only for items with
// no tag in it yet (docs/adr/0002-claude-proposes-type-tags-on-request.md).

// TagModel proposes tags: short classification over a small tree, so the
// cheapest model does it well.
const TagModel = anthropic.ModelClaudeHaiku5_5

// MaxItemsToTag bounds how many items one request sends, biggest first.
const MaxItemsToTag = 500

// ItemToTag is an item Claude may propose tags for.
type ItemToTag struct {
	// Ref is the item's id, or any number for an item not saved yet.
	Ref  int64
	Name string
	Note string
	Tags [][]string
}

// ProposedTag is a tag path Claude proposes for an item. New means no tag
// exists at that path yet; applying it creates the missing tags.
type ProposedTag struct {
	Path []string
	New  bool
}

// ItemProposal is the proposed tags for one item, best first.
type ItemProposal struct {
	Ref  int64
	Tags []ProposedTag
}

// Proposals is Claude's answer to ProposeTags.
type Proposals struct {
	// Dimension is the top-level tag Claude took as the Type dimension; a
	// new one ("Type") when the tree has none.
	Dimension string
	// Items are in the order they were asked about; items Claude couldn't
	// place, or that already have a tag in Dimension, are left out.
	Items []ItemProposal
	// Remaining counts the items asked about that still have no tag in
	// Dimension and no proposal, e.g. beyond maxItems.
	Remaining int
}

// TagAsk is what ProposeTags asks for.
type TagAsk struct {
	Items []ItemToTag
	// Tree is every existing tag path.
	Tree [][]string
	// PerItem is how many alternatives to propose for each item.
	PerItem int
	// MaxItems is how many items to propose tags for at most.
	MaxItems int
	// Dimension is the Type dimension when the app knows it already, an
	// existing top-level tag; empty lets Claude pick one.
	Dimension string
}

const tagPrompt = `You organise the things stored in one person's shed or back room by what kind of thing they are, using their tag tree.

Tags form a tree, written as paths like "Type/Camping/Tents". Each top-level tag is a dimension: one way of grouping the items. Some dimensions say where things are (such as Location, Room or Shelf); others say what things are (such as Type, Kind or Category).

- dimension: the existing top-level tag that says what things are, written exactly as given. If there is none, use "Type".
- items: for each listed item that has no tag inside that dimension, propose up to the number of tag paths asked for, best first, each starting with the dimension ("Type/Garden/Lawn care"). Refer to the item by its ref. Work through the items in the order listed, and stop at the number of items asked for.
- Reuse an existing tag whenever one fits, written exactly as given. Only when none fits, propose a new one under the best existing parent. Never add a near-duplicate of an existing tag ("Camping gear" beside "Camping").
- Keep the tree tidy: a handful of broad groups, at most three levels below the dimension, short plural names in sentence case ("Power tools"), never "/" in a name. Prefer the most specific tag that fits.
- Leave out items you can't place with reasonable confidence. Never propose tags in a dimension that says where things are: only the user knows that.`

var proposalSchema = map[string]any{
	"type":                 "object",
	"additionalProperties": false,
	"required":             []string{"dimension", "items"},
	"properties": map[string]any{
		"dimension": map[string]any{"type": "string"},
		"items": map[string]any{
			"type": "array",
			"items": map[string]any{
				"type":                 "object",
				"additionalProperties": false,
				"required":             []string{"ref", "tags"},
				"properties": map[string]any{
					"ref":  map[string]any{"type": "integer"},
					"tags": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
				},
			},
		},
	},
}

type proposalOutput struct {
	Dimension string `json:"dimension"`
	Items     []struct {
		Ref  int64    `json:"ref"`
		Tags []string `json:"tags"` // typed paths, "Type/Garden"
	} `json:"items"`
}

// maxNoteInPrompt keeps a long note from dominating the prompt.
const maxNoteInPrompt = 200

// TagMessage is the prompt for ask: the tag paths, then one JSON line per item.
func TagMessage(ask TagAsk) string {
	var b strings.Builder
	writeTags(&b, ask.Tree)
	if ask.Dimension != "" {
		fmt.Fprintf(&b, "The dimension that says what things are is %q: use it.\n", ask.Dimension)
	}
	fmt.Fprintf(&b, "Propose up to %d tag paths per item, for at most %d items.\n\nItems, one JSON object per line:\n<items>\n", ask.PerItem, ask.MaxItems)
	for _, it := range ask.Items {
		note := []rune(it.Note)
		if len(note) > maxNoteInPrompt {
			note = append(note[:maxNoteInPrompt], '…')
		}
		tags := make([]string, len(it.Tags))
		for i, t := range it.Tags {
			tags[i] = strings.Join(t, "/")
		}
		line, _ := json.Marshal(map[string]any{"ref": it.Ref, "name": it.Name, "note": string(note), "tags": tags})
		b.Write(line)
		b.WriteByte('\n')
	}
	b.WriteString("</items>")
	return b.String()
}

// ProposeTags asks Claude for proposed tags in the Type dimension. The
// answer is cleaned: see cleanProposals.
func (c *Client) ProposeTags(ctx context.Context, ask TagAsk) (Proposals, error) {
	if len(ask.Items) > MaxItemsToTag {
		ask.Items = ask.Items[:MaxItemsToTag]
	}
	var out proposalOutput
	err := c.ask(ctx, request{
		model:  TagModel,
		effort: anthropic.BetaOutputConfigEffortLow,
		// Haiku has no server-side fallback model.
		system: tagPrompt,
		user:   TagMessage(ask),
		schema: proposalSchema,
	}, &out)
	if err != nil {
		return Proposals{}, err
	}
	return cleanProposals(out, ask), nil
}

// maxTagDepth is the dimension plus three levels, as the prompt asks.
const maxTagDepth = 4

// cleanProposals keeps only proposals the app can apply as promised: inside
// one dimension (ask.Dimension when set; else Claude's, which must be an
// existing top-level tag, matched ignoring case, or becomes "Type"), at
// least one level below it, valid names, for items asked about that have no
// tag in that dimension yet, without tags they already have or repeats, and
// at most ask.PerItem per item and ask.MaxItems items. Existing tags come
// back as stored; any other path is New.
func cleanProposals(out proposalOutput, ask TagAsk) Proposals {
	existing := byPathKey(ask.Tree)
	dim := strings.TrimSpace(out.Dimension)
	if ask.Dimension != "" {
		dim = ask.Dimension
	}
	// A new dimension is always "Type", which the store recognises by name.
	if p, ok := existing[pathKey([]string{dim})]; ok && len(p) == 1 {
		dim = p[0]
	} else {
		dim = "Type"
	}
	dimKey := pathKey([]string{dim})

	items := make(map[int64]ItemToTag, len(ask.Items))
	untyped := map[int64]bool{}
	for _, it := range ask.Items {
		items[it.Ref] = it
		untyped[it.Ref] = true
		for _, t := range it.Tags {
			if len(t) > 0 && pathKey(t[:1]) == dimKey {
				untyped[it.Ref] = false
			}
		}
	}

	byRef := map[int64][]ProposedTag{}
	for _, raw := range out.Items {
		it, asked := items[raw.Ref]
		if !asked || !untyped[raw.Ref] || byRef[raw.Ref] != nil || len(byRef) == ask.MaxItems {
			continue
		}
		have := byPathKey(it.Tags)
		seen := map[string]bool{}
		var tags []ProposedTag
		for _, s := range raw.Tags {
			path := proposedPath(s, dim, existing)
			if path == nil {
				continue
			}
			k := pathKey(path)
			if _, ok := have[k]; ok || seen[k] {
				continue
			}
			seen[k] = true
			stored, ok := existing[k]
			if ok {
				path = stored
			}
			tags = append(tags, ProposedTag{Path: path, New: !ok})
			if len(tags) == ask.PerItem {
				break
			}
		}
		if len(tags) > 0 {
			byRef[raw.Ref] = tags
		}
	}

	res := Proposals{Dimension: dim}
	for _, it := range ask.Items {
		if tags, ok := byRef[it.Ref]; ok {
			res.Items = append(res.Items, ItemProposal{Ref: it.Ref, Tags: tags})
		} else if untyped[it.Ref] {
			res.Remaining++
		}
	}
	return res
}

// proposedPath parses a typed path inside dim, or returns nil. Existing
// ancestors take their stored names, so a new tag lands beside its siblings.
func proposedPath(s, dim string, existing map[string][]string) []string {
	parts := strings.Split(s, "/")
	if len(parts) < 2 || len(parts) > maxTagDepth || pathKey(parts[:1]) != pathKey([]string{dim}) {
		return nil
	}
	path := []string{dim}
	for _, p := range parts[1:] {
		p = strings.TrimSpace(p)
		if !validTagName(p) {
			return nil
		}
		path = append(path, p)
		if stored, ok := existing[pathKey(path)]; ok {
			path = append([]string(nil), stored...)
		}
	}
	return path
}

// validTagName mirrors the store's rule, so an accepted proposal never fails
// to save.
func validTagName(name string) bool {
	n := len([]rune(name))
	return n > 0 && n <= 60 && !strings.ContainsAny(name, "/›")
}
