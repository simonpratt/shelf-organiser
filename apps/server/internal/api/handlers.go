package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"shelf-organiser/apps/server/internal/claude"
	"shelf-organiser/apps/server/internal/store"
	"shelf-organiser/apps/server/openapi"
)

type handlers struct {
	store  *store.Store
	logger *slog.Logger
	// claude is nil when no Anthropic API key is configured.
	claude *claude.Client
}

// Register mounts the JSON API, its spec at /api/openapi.json, and a JSON
// 404 for any other /api path, on mux. A nil Claude client leaves every
// Claude feature off.
func Register(mux *http.ServeMux, s *store.Store, c *claude.Client, logger *slog.Logger) {
	h := &handlers{store: s, logger: logger, claude: c}
	strict := NewStrictHandlerWithOptions(h, nil, StrictHTTPServerOptions{
		RequestErrorHandlerFunc: func(w http.ResponseWriter, r *http.Request, err error) {
			WriteError(w, http.StatusBadRequest, "invalid request body")
		},
		ResponseErrorHandlerFunc: func(w http.ResponseWriter, r *http.Request, err error) {
			logger.Error("request failed", "method", r.Method, "path", r.URL.Path, "err", err)
			WriteError(w, http.StatusInternalServerError, "internal error")
		},
	})
	HandlerWithOptions(strict, StdHTTPServerOptions{
		BaseRouter: mux,
		ErrorHandlerFunc: func(w http.ResponseWriter, r *http.Request, err error) {
			WriteError(w, http.StatusBadRequest, "invalid request parameters")
		},
	})
	mux.HandleFunc("GET /api/openapi.json", func(w http.ResponseWriter, r *http.Request) {
		spec, err := openapi.JSON()
		if err != nil {
			logger.Error("converting spec", "err", err)
			WriteError(w, http.StatusInternalServerError, "internal error")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(spec)
	})
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		WriteError(w, http.StatusNotFound, "not found")
	})
}

// WriteError writes the house error envelope, {"error": msg}.
func WriteError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Error{Error: msg})
}

func validationMessage(err error) (string, bool) {
	var v *store.ValidationError
	if errors.As(err, &v) {
		return v.Msg, true
	}
	return "", false
}

var notFound = Error{Error: "not found"}

func toAPIItem(it store.Item) Item {
	tags := make([]TagRef, len(it.Tags))
	for i, t := range it.Tags {
		tags[i] = TagRef{Id: t.ID, Path: t.Path}
	}
	return Item{Id: it.ID, Name: it.Name, Litres: it.Litres, Quantity: it.Quantity, Note: it.Note, Tags: tags}
}

func toAPITag(t store.Tag) Tag {
	return Tag{Id: t.ID, Name: t.Name, ParentId: t.ParentID, Path: t.Path, ItemCount: t.ItemCount, TotalSpace: t.TotalSpace}
}

func toStoreInput(in *ItemInput) store.ItemInput {
	out := store.ItemInput{Name: in.Name, Litres: in.Litres, Quantity: 1}
	if in.Quantity != nil {
		out.Quantity = *in.Quantity
	}
	if in.Note != nil {
		out.Note = *in.Note
	}
	if in.Tags != nil {
		out.Tags = *in.Tags
	}
	return out
}

func (h *handlers) ListItems(ctx context.Context, _ ListItemsRequestObject) (ListItemsResponseObject, error) {
	items, err := h.store.ListItems(ctx)
	if err != nil {
		return nil, err
	}
	res := make(ListItems200JSONResponse, len(items))
	for i, it := range items {
		res[i] = toAPIItem(it)
	}
	return res, nil
}

func (h *handlers) CreateItem(ctx context.Context, req CreateItemRequestObject) (CreateItemResponseObject, error) {
	if req.Body == nil {
		return CreateItem400JSONResponse{BadRequestJSONResponse{Error: "a JSON body is required"}}, nil
	}
	it, err := h.store.CreateItem(ctx, toStoreInput(req.Body))
	if msg, ok := validationMessage(err); ok {
		return CreateItem400JSONResponse{BadRequestJSONResponse{Error: msg}}, nil
	}
	if err != nil {
		return nil, err
	}
	return CreateItem201JSONResponse(toAPIItem(it)), nil
}

func (h *handlers) GetItem(ctx context.Context, req GetItemRequestObject) (GetItemResponseObject, error) {
	it, err := h.store.GetItem(ctx, req.Id)
	if errors.Is(err, store.ErrNotFound) {
		return GetItem404JSONResponse{NotFoundJSONResponse(notFound)}, nil
	}
	if err != nil {
		return nil, err
	}
	return GetItem200JSONResponse(toAPIItem(it)), nil
}

func (h *handlers) UpdateItem(ctx context.Context, req UpdateItemRequestObject) (UpdateItemResponseObject, error) {
	if req.Body == nil {
		return UpdateItem400JSONResponse{BadRequestJSONResponse{Error: "a JSON body is required"}}, nil
	}
	it, err := h.store.UpdateItem(ctx, req.Id, toStoreInput(req.Body))
	if msg, ok := validationMessage(err); ok {
		return UpdateItem400JSONResponse{BadRequestJSONResponse{Error: msg}}, nil
	}
	if errors.Is(err, store.ErrNotFound) {
		return UpdateItem404JSONResponse{NotFoundJSONResponse(notFound)}, nil
	}
	if err != nil {
		return nil, err
	}
	return UpdateItem200JSONResponse(toAPIItem(it)), nil
}

func (h *handlers) DeleteItem(ctx context.Context, req DeleteItemRequestObject) (DeleteItemResponseObject, error) {
	err := h.store.DeleteItem(ctx, req.Id)
	if errors.Is(err, store.ErrNotFound) {
		return DeleteItem404JSONResponse{NotFoundJSONResponse(notFound)}, nil
	}
	if err != nil {
		return nil, err
	}
	return DeleteItem204Response{}, nil
}

func (h *handlers) ListTags(ctx context.Context, _ ListTagsRequestObject) (ListTagsResponseObject, error) {
	tags, err := h.store.ListTags(ctx)
	if err != nil {
		return nil, err
	}
	res := make(ListTags200JSONResponse, len(tags))
	for i, t := range tags {
		res[i] = toAPITag(t)
	}
	return res, nil
}

func (h *handlers) EnsureTag(ctx context.Context, req EnsureTagRequestObject) (EnsureTagResponseObject, error) {
	if req.Body == nil {
		return EnsureTag400JSONResponse{BadRequestJSONResponse{Error: "a JSON body is required"}}, nil
	}
	t, err := h.store.EnsureTag(ctx, req.Body.Path)
	if msg, ok := validationMessage(err); ok {
		return EnsureTag400JSONResponse{BadRequestJSONResponse{Error: msg}}, nil
	}
	if err != nil {
		return nil, err
	}
	return EnsureTag200JSONResponse(toAPITag(t)), nil
}

func (h *handlers) UpdateTag(ctx context.Context, req UpdateTagRequestObject) (UpdateTagResponseObject, error) {
	if req.Body == nil {
		return UpdateTag400JSONResponse{BadRequestJSONResponse{Error: "a JSON body is required"}}, nil
	}
	t, err := h.store.UpdateTag(ctx, req.Id, req.Body.Name, req.Body.ParentId)
	if msg, ok := validationMessage(err); ok {
		return UpdateTag400JSONResponse{BadRequestJSONResponse{Error: msg}}, nil
	}
	switch {
	case errors.Is(err, store.ErrNotFound):
		return UpdateTag404JSONResponse{NotFoundJSONResponse(notFound)}, nil
	case errors.Is(err, store.ErrConflict):
		return UpdateTag409JSONResponse{Error: "another tag in the same place already has that name"}, nil
	case err != nil:
		return nil, err
	}
	return UpdateTag200JSONResponse(toAPITag(t)), nil
}

func (h *handlers) DeleteTag(ctx context.Context, req DeleteTagRequestObject) (DeleteTagResponseObject, error) {
	err := h.store.DeleteTag(ctx, req.Id)
	if errors.Is(err, store.ErrNotFound) {
		return DeleteTag404JSONResponse{NotFoundJSONResponse(notFound)}, nil
	}
	if err != nil {
		return nil, err
	}
	return DeleteTag204Response{}, nil
}

func (h *handlers) AddItemTags(ctx context.Context, req AddItemTagsRequestObject) (AddItemTagsResponseObject, error) {
	if req.Body == nil {
		return AddItemTags400JSONResponse{BadRequestJSONResponse{Error: "a JSON body is required"}}, nil
	}
	assignments := make([]store.TagAssignment, len(req.Body.Assignments))
	for i, a := range req.Body.Assignments {
		assignments[i] = store.TagAssignment{ItemID: a.ItemId}
		for _, t := range a.Tags {
			assignments[i].Tags = append(assignments[i].Tags, t)
		}
	}
	err := h.store.AddItemTags(ctx, assignments)
	if msg, ok := validationMessage(err); ok {
		return AddItemTags400JSONResponse{BadRequestJSONResponse{Error: msg}}, nil
	}
	if errors.Is(err, store.ErrNotFound) {
		return AddItemTags404JSONResponse{NotFoundJSONResponse{Error: "an item no longer exists; reload and try again"}}, nil
	}
	if err != nil {
		return nil, err
	}
	return AddItemTags204Response{}, nil
}
