package api

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/anthropics/anthropic-sdk-go"

	"shelf-organiser/apps/server/internal/claude"
	"shelf-organiser/apps/server/internal/store"
)

const claudeOff = "Claude isn't set up: the server has no Anthropic API key"

func (h *handlers) GetClaude(context.Context, GetClaudeRequestObject) (GetClaudeResponseObject, error) {
	return GetClaude200JSONResponse{Enabled: h.claude != nil}, nil
}

// itemsToTag returns every item for Claude, biggest total space first.
func itemsToTag(items []store.Item) []claude.ItemToTag {
	out := make([]claude.ItemToTag, len(items))
	for i, it := range items {
		out[i] = claude.ItemToTag{Ref: it.ID, Name: it.Name, Note: it.Note}
		for _, t := range it.Tags {
			out[i].Tags = append(out[i].Tags, t.Path)
		}
	}
	return out
}

// tagAsk is a request for proposals over the whole tag tree, in the Type
// dimension when one is known.
func (h *handlers) tagAsk(ctx context.Context, items []claude.ItemToTag, perItem, maxItems int) (claude.TagAsk, error) {
	tags, err := h.store.ListTags(ctx)
	if err != nil {
		return claude.TagAsk{}, err
	}
	ask := claude.TagAsk{Items: items, PerItem: perItem, MaxItems: maxItems, Tree: make([][]string, len(tags))}
	for i, t := range tags {
		ask.Tree[i] = t.Path
		if t.TypeDimension {
			ask.Dimension = t.Name
		}
	}
	return ask, nil
}

// proposeTags asks Claude and remembers the dimension it took as the Type
// dimension, so every later proposal and every client agrees on it.
func (h *handlers) proposeTags(ctx context.Context, ask claude.TagAsk) (claude.Proposals, error) {
	p, err := h.claude.ProposeTags(ctx, ask)
	if err != nil {
		return p, err
	}
	if ask.Dimension == "" {
		if err := h.store.RememberTypeDimension(ctx, p.Dimension); err != nil {
			return p, err
		}
	}
	return p, nil
}

func toAPIProposed(tags []claude.ProposedTag) []ProposedTag {
	out := make([]ProposedTag, len(tags))
	for i, t := range tags {
		out[i] = ProposedTag{Path: t.Path, IsNew: t.New}
	}
	return out
}

func (h *handlers) ProposeTags(ctx context.Context, req ProposeTagsRequestObject) (ProposeTagsResponseObject, error) {
	if h.claude == nil {
		return ProposeTags503JSONResponse{Error: claudeOff}, nil
	}
	if req.Body == nil {
		return ProposeTags400JSONResponse{BadRequestJSONResponse{Error: "a JSON body is required"}}, nil
	}
	it := claude.ItemToTag{Name: strings.TrimSpace(req.Body.Name)}
	if req.Body.Note != nil {
		it.Note = *req.Body.Note
	}
	if req.Body.Tags != nil {
		for _, t := range *req.Body.Tags {
			it.Tags = append(it.Tags, t)
		}
	}
	switch {
	case it.Name == "":
		return ProposeTags400JSONResponse{BadRequestJSONResponse{Error: "name the item first"}}, nil
	case utf8.RuneCountInString(it.Name) > 200 || utf8.RuneCountInString(it.Note) > 2000:
		return ProposeTags400JSONResponse{BadRequestJSONResponse{Error: "the name or note is too long"}}, nil
	}
	ask, err := h.tagAsk(ctx, []claude.ItemToTag{it}, 3, 1)
	if err != nil {
		return nil, err
	}
	p, err := h.proposeTags(ctx, ask)
	if err != nil {
		h.logger.Error("proposing tags", "err", err)
		return ProposeTags502JSONResponse{Error: claudeFailure(err, "pick tags")}, nil
	}
	res := ProposeTags200JSONResponse{Dimension: p.Dimension, Tags: []ProposedTag{}}
	if len(p.Items) > 0 {
		res.Tags = toAPIProposed(p.Items[0].Tags)
	}
	return res, nil
}

// organiseBatch keeps one Organise review short and its wait in seconds.
const organiseBatch = 40

func (h *handlers) Organise(ctx context.Context, _ OrganiseRequestObject) (OrganiseResponseObject, error) {
	if h.claude == nil {
		return Organise503JSONResponse{Error: claudeOff}, nil
	}
	items, err := h.store.ListItems(ctx)
	if err != nil {
		return nil, err
	}
	ask, err := h.tagAsk(ctx, itemsToTag(items), 1, organiseBatch)
	if err != nil {
		return nil, err
	}
	res := Organise200JSONResponse{Proposals: []struct {
		ItemId int64         `json:"itemId"`
		Tags   []ProposedTag `json:"tags"`
	}{}}
	if len(items) == 0 {
		return res, nil
	}
	p, err := h.proposeTags(ctx, ask)
	if err != nil {
		h.logger.Error("organising", "err", err)
		return Organise502JSONResponse{Error: claudeFailure(err, "tag them")}, nil
	}
	res.Dimension, res.Remaining = p.Dimension, p.Remaining
	for _, ip := range p.Items {
		res.Proposals = append(res.Proposals, struct {
			ItemId int64         `json:"itemId"`
			Tags   []ProposedTag `json:"tags"`
		}{ip.Ref, toAPIProposed(ip.Tags)})
	}
	return res, nil
}

// claudeFailure says what the user can do about a failed call to Claude:
// nothing but fix the server's key, wait, or retry, or do instead what
// instead says by hand ("add the items").
func claudeFailure(err error, instead string) string {
	var apiErr *anthropic.Error
	if errors.As(err, &apiErr) {
		switch apiErr.StatusCode {
		case http.StatusUnauthorized, http.StatusForbidden:
			return "The server's Anthropic API key was rejected. " + upperFirst(instead) + " by hand for now."
		case http.StatusTooManyRequests:
			return "Claude is busy. Try again in a minute, or " + instead + " by hand."
		}
	}
	return "Claude couldn't answer just now. Try again, or " + instead + " by hand."
}

func upperFirst(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
