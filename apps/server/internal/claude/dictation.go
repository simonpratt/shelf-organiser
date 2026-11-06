package claude

import (
	"context"
	"math"
	"strings"

	"github.com/anthropics/anthropic-sdk-go"
)

// The phone's keyboard does the speech-to-text (see
// docs/adr/0001-dictation-via-keyboard-and-claude.md); Extract only parses
// the transcript.

// DictationModel reads dictations. Sizes from loose speech need judgement.
const DictationModel = anthropic.ModelClaudeOpus5_5

// Draft is a proposed item read from a dictation, not yet saved.
type Draft struct {
	Name     string
	Quantity int
	// Litres is the estimated size of one unit; nil when there's no usable estimate.
	Litres *float64
	// Tags are existing tag paths only.
	Tags [][]string
}

// MaxTranscript bounds what one dictation may send to Claude, in characters.
const MaxTranscript = 4000

const maxDrafts = 50

const dictationPrompt = `You turn a dictated list of things stored in a shed or back room into item drafts the user will review before saving.

- The text usually comes from speech recognition, so it may have sound-alike mistakes ("long mower" for lawn mower, "mics" for bikes): read each item as the shed or household thing that was most plausibly said, and name it correctly.
- One item per distinct kind of thing: "two camping chairs" is one item with quantity 2. Apply spoken corrections ("no, three of them").
- name: short and plain, sentence case, without the quantity ("Camping chairs").
- litres: your best estimate of the space ONE unit takes up in storage, in litres. A shoebox is about 10, a milk crate 40, a moving box 120, a bike 500. Use null only when nothing said gives any idea of its size.
- tags: choose only from the existing tag paths given, written exactly as given, and only when the speaker says or clearly implies them (a place they mention, a kind of thing that obviously fits). Otherwise leave tags empty. Never invent tags.
- Ignore filler, and anything that isn't a stored thing.`

// draftSchema is the structured output Claude must return.
var draftSchema = map[string]any{
	"type":                 "object",
	"additionalProperties": false,
	"required":             []string{"items"},
	"properties": map[string]any{
		"items": map[string]any{
			"type": "array",
			"items": map[string]any{
				"type":                 "object",
				"additionalProperties": false,
				"required":             []string{"name", "quantity", "litres", "tags"},
				"properties": map[string]any{
					"name":     map[string]any{"type": "string"},
					"quantity": map[string]any{"type": "integer"},
					"litres":   map[string]any{"type": []string{"number", "null"}},
					"tags":     map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
				},
			},
		},
	},
}

type draftOutput struct {
	Items []struct {
		Name     string   `json:"name"`
		Quantity int      `json:"quantity"`
		Litres   *float64 `json:"litres"` // null when there's no sensible estimate
		Tags     []string `json:"tags"`   // typed paths, "Location/Shed"
	} `json:"items"`
}

// writeTags writes the tag paths in their typed form, one per line.
func writeTags(b *strings.Builder, tagPaths [][]string) {
	b.WriteString("Existing tag paths:\n<tags>\n")
	for _, p := range tagPaths {
		b.WriteString(strings.Join(p, "/") + "\n")
	}
	b.WriteString("</tags>\n\n")
}

// DictationMessage is the prompt for one dictation: the existing tag paths,
// then the transcript.
func DictationMessage(transcript string, tagPaths [][]string) string {
	var b strings.Builder
	writeTags(&b, tagPaths)
	b.WriteString("Dictation:\n<dictation>\n" + transcript + "\n</dictation>")
	return b.String()
}

// Extract asks Claude for the drafts in transcript. tagPaths are the
// existing tag paths, so Claude can suggest them. The result is not yet
// cleaned; pass it through CleanDrafts.
func (c *Client) Extract(ctx context.Context, transcript string, tagPaths [][]string) ([]Draft, error) {
	var out draftOutput
	err := c.ask(ctx, request{
		model: DictationModel,
		// A short list needs little reasoning; low keeps the wait short.
		effort:   anthropic.BetaOutputConfigEffortLow,
		fallback: true,
		system:   dictationPrompt,
		user:     DictationMessage(transcript, tagPaths),
		schema:   draftSchema,
	}, &out)
	if err != nil {
		return nil, err
	}
	drafts := make([]Draft, len(out.Items))
	for i, it := range out.Items {
		drafts[i] = Draft{Name: it.Name, Quantity: it.Quantity, Litres: it.Litres}
		for _, t := range it.Tags {
			drafts[i].Tags = append(drafts[i].Tags, strings.Split(t, "/"))
		}
	}
	return drafts, nil
}

// CleanDrafts makes Claude's drafts safe to show: names trimmed and
// non-empty, quantity at least 1, a positive size or none, and tags reduced
// to existing paths (matched ignoring case, returned as stored, no repeats).
func CleanDrafts(drafts []Draft, existing [][]string) []Draft {
	byKey := byPathKey(existing)
	out := make([]Draft, 0, len(drafts))
	for _, d := range drafts {
		d.Name = strings.TrimSpace(d.Name)
		if d.Name == "" {
			continue
		}
		d.Quantity = max(d.Quantity, 1)
		if d.Litres != nil && (math.IsNaN(*d.Litres) || math.IsInf(*d.Litres, 0) || *d.Litres <= 0) {
			d.Litres = nil
		}
		var tags [][]string
		seen := map[string]bool{}
		for _, t := range d.Tags {
			k := pathKey(t)
			if p, ok := byKey[k]; ok && !seen[k] {
				seen[k] = true
				tags = append(tags, p)
			}
		}
		d.Tags = tags
		out = append(out, d)
		if len(out) == maxDrafts {
			break
		}
	}
	return out
}

func byPathKey(paths [][]string) map[string][]string {
	m := make(map[string][]string, len(paths))
	for _, p := range paths {
		m[pathKey(p)] = p
	}
	return m
}

func pathKey(path []string) string {
	parts := make([]string, len(path))
	for i, p := range path {
		parts[i] = strings.ToLower(strings.TrimSpace(p))
	}
	return strings.Join(parts, "/")
}
