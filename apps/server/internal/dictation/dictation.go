// Package dictation turns a dictated list of items into item drafts for the
// user to review. The phone's keyboard does the speech-to-text (see
// docs/adr/0001-dictation-via-keyboard-and-claude.md); this package only
// parses the transcript, through an Extractor.
package dictation

import (
	"context"
	"math"
	"strings"
)

// Draft is a proposed item read from a dictation, not yet saved.
type Draft struct {
	Name     string
	Quantity int
	// Litres is the estimated size of one unit; nil when there's no usable estimate.
	Litres *float64
	// Tags are existing tag paths only.
	Tags [][]string
}

// Extractor reads drafts out of a transcript. tagPaths are the existing tag
// paths, so the extractor can suggest them instead of inventing new ones.
type Extractor interface {
	Extract(ctx context.Context, transcript string, tagPaths [][]string) ([]Draft, error)
}

// MaxTranscript bounds what one dictation may send to Claude, in characters.
const MaxTranscript = 4000

const maxDrafts = 50

// Clean makes an extractor's drafts safe to show: names trimmed and
// non-empty, quantity at least 1, a positive size or none, and tags reduced
// to existing paths (matched ignoring case, returned as stored, no repeats).
func Clean(drafts []Draft, existing [][]string) []Draft {
	byKey := make(map[string][]string, len(existing))
	for _, p := range existing {
		byKey[pathKey(p)] = p
	}
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

func pathKey(path []string) string {
	parts := make([]string, len(path))
	for i, p := range path {
		parts[i] = strings.ToLower(strings.TrimSpace(p))
	}
	return strings.Join(parts, "/")
}
