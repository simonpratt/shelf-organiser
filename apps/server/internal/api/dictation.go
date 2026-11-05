package api

import (
	"context"
	"strings"
	"unicode/utf8"

	"shelf-organiser/apps/server/internal/claude"
)

func (h *handlers) DraftItems(ctx context.Context, req DraftItemsRequestObject) (DraftItemsResponseObject, error) {
	if h.claude == nil {
		return DraftItems503JSONResponse{Error: "dictation isn't set up: the server has no Anthropic API key"}, nil
	}
	if req.Body == nil {
		return DraftItems400JSONResponse{BadRequestJSONResponse{Error: "a JSON body is required"}}, nil
	}
	transcript := strings.TrimSpace(req.Body.Transcript)
	switch {
	case transcript == "":
		return DraftItems400JSONResponse{BadRequestJSONResponse{Error: "say or type at least one item"}}, nil
	case utf8.RuneCountInString(transcript) > claude.MaxTranscript:
		return DraftItems400JSONResponse{BadRequestJSONResponse{Error: "that's too long for one go; split it up"}}, nil
	}

	tags, err := h.store.ListTags(ctx)
	if err != nil {
		return nil, err
	}
	paths := make([][]string, len(tags))
	for i, t := range tags {
		paths[i] = t.Path
	}
	drafts, err := h.claude.Extract(ctx, transcript, paths)
	if err != nil {
		h.logger.Error("reading dictation", "err", err)
		return DraftItems502JSONResponse{Error: claudeFailure(err, "add the items")}, nil
	}

	out := DraftItems200JSONResponse{Drafts: []Draft{}}
	for _, d := range claude.CleanDrafts(drafts, paths) {
		tags := make([]TagPath, len(d.Tags))
		for i, t := range d.Tags {
			tags[i] = t
		}
		out.Drafts = append(out.Drafts, Draft{Name: d.Name, Quantity: d.Quantity, Litres: d.Litres, Tags: tags})
	}
	return out, nil
}
