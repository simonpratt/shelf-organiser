package api

import (
	"context"
	"math"

	"shelf-organiser/apps/server/internal/auth"
)

// PublicPaths need no session, so the client can find out whether to show the
// login page, log in, and log out with an expired cookie.
var PublicPaths = []string{"/api/session", "/api/login", "/api/logout"}

func (h *handlers) GetSession(ctx context.Context, _ GetSessionRequestObject) (GetSessionResponseObject, error) {
	_, loggedIn := auth.FromContext(ctx)
	return GetSession200JSONResponse{LoginRequired: h.auth != nil, LoggedIn: loggedIn}, nil
}

func (h *handlers) Login(ctx context.Context, req LoginRequestObject) (LoginResponseObject, error) {
	if h.auth == nil {
		return Login404JSONResponse{Error: "no login is set up"}, nil
	}
	if req.Body == nil {
		return Login400JSONResponse{BadRequestJSONResponse{Error: "a JSON body is required"}}, nil
	}
	ok, wait := h.auth.Login(req.Body.Username, req.Body.Password)
	if wait > 0 {
		secs := int(math.Ceil(wait.Seconds()))
		return Login429JSONResponse{
			Body:    Error{Error: "Too many wrong tries. Wait a few seconds and try again."},
			Headers: Login429ResponseHeaders{RetryAfter: &secs},
		}, nil
	}
	if !ok {
		h.logger.Warn("failed login")
		return Login401JSONResponse{Error: "Wrong username or password."}, nil
	}
	secure, _ := auth.FromContext(ctx)
	c := h.auth.SessionCookie(secure).String()
	return Login204Response{Headers: Login204ResponseHeaders{SetCookie: &c}}, nil
}

func (h *handlers) Logout(ctx context.Context, _ LogoutRequestObject) (LogoutResponseObject, error) {
	secure, _ := auth.FromContext(ctx)
	c := auth.ClearCookie(secure).String()
	return Logout204Response{Headers: Logout204ResponseHeaders{SetCookie: &c}}, nil
}
