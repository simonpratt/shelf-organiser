package api

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/anthropics/anthropic-sdk-go"

	"shelf-organiser/apps/server/internal/claude"
)

func (h *handlers) GetDictation(context.Context, GetDictationRequestObject) (GetDictationResponseObject, error) {
	return GetDictation200JSONResponse{Enabled: h.claude != nil}, nil
}

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
		return DraftItems502JSONResponse{Error: claudeFailure(err)}, nil
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

// claudeFailure says what the user can do about a failed call to Claude:
// nothing but fix the server's key, wait, or retry.
func claudeFailure(err error) string {
	var apiErr *anthropic.Error
	if errors.As(err, &apiErr) {
		switch apiErr.StatusCode {
		case http.StatusUnauthorized, http.StatusForbidden:
			return "The server's Anthropic API key was rejected. Add the items by hand for now."
		case http.StatusTooManyRequests:
			return "Claude is busy. Try again in a minute, or add the items by hand."
		}
	}
	return "Claude couldn't read that just now. Try again, or add the items by hand."
}
