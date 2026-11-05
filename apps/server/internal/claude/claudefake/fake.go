// Package claudefake is the shared fake of the Anthropic Messages API, used
// by the claude package tests, the app tests and (mounted under test mode)
// the e2e suite, so no test ever reaches the real API.
//
// It answers a dictation the way a careful model would on simple input:
// the transcript is split on commas, "and" and new lines; each piece becomes
// one item with a leading number as its quantity and a size of 40 L; and an
// existing tag is suggested when its last name appears in the piece.
package claudefake

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
)

// FailMarker in a transcript makes the fake answer with a 500.
const FailMarker = "FAIL"

// Fake is an http.Handler for POST /v1/messages.
type Fake struct {
	APIKey string

	mu       sync.Mutex
	requests []Request
}

// Request is what the fake received.
type Request struct {
	APIKey string
	Body   map[string]any
}

// New returns a fake that accepts only apiKey.
func New(apiKey string) *Fake { return &Fake{APIKey: apiKey} }

// Requests returns every request received so far.
func (f *Fake) Requests() []Request {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]Request(nil), f.requests...)
}

func writeError(w http.ResponseWriter, status int, typ, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"type": "error", "error": map[string]string{"type": typ, "message": msg}})
}

var (
	section  = regexp.MustCompile(`(?s)<(tags|dictation)>\n(.*?)\n?</(?:tags|dictation)>`)
	splitter = regexp.MustCompile(`,|\n|\band\b`)
	leading  = regexp.MustCompile(`^(\d+|a|an|one|two|three|four|five|six)\s+`)
	words    = map[string]int{"a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6}
)

func (f *Fake) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost || !strings.HasSuffix(r.URL.Path, "/v1/messages") {
		writeError(w, http.StatusNotFound, "not_found_error", "not found")
		return
	}
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request_error", "bad JSON")
		return
	}
	key := r.Header.Get("X-Api-Key")
	f.mu.Lock()
	f.requests = append(f.requests, Request{APIKey: key, Body: body})
	f.mu.Unlock()
	if key != f.APIKey {
		writeError(w, http.StatusUnauthorized, "authentication_error", "invalid x-api-key")
		return
	}

	prompt := userText(body)
	var tags []string
	var transcript string
	for _, m := range section.FindAllStringSubmatch(prompt, -1) {
		if m[1] == "dictation" {
			transcript = m[2]
			continue
		}
		for _, line := range strings.Split(m[2], "\n") {
			if line != "" {
				tags = append(tags, line)
			}
		}
	}
	if strings.Contains(transcript, FailMarker) {
		writeError(w, http.StatusInternalServerError, "api_error", "internal error")
		return
	}

	type item struct {
		Name     string   `json:"name"`
		Quantity int      `json:"quantity"`
		Litres   float64  `json:"litres"`
		Tags     []string `json:"tags"`
	}
	items := []item{}
	for _, piece := range splitter.Split(transcript, -1) {
		piece = strings.TrimSpace(piece)
		if piece == "" {
			continue
		}
		it := item{Quantity: 1, Litres: 40, Tags: []string{}}
		if m := leading.FindStringSubmatch(strings.ToLower(piece)); m != nil {
			if n, err := strconv.Atoi(m[1]); err == nil {
				it.Quantity = n
			} else {
				it.Quantity = words[m[1]]
			}
			piece = piece[len(m[0]):]
		}
		for _, t := range tags {
			names := strings.Split(t, "/")
			if strings.Contains(strings.ToLower(piece), strings.ToLower(names[len(names)-1])) {
				it.Tags = append(it.Tags, t)
			}
		}
		it.Name = strings.ToUpper(piece[:1]) + piece[1:]
		items = append(items, it)
	}
	out, _ := json.Marshal(map[string]any{"items": items})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"id": "msg_fake", "type": "message", "role": "assistant", "model": body["model"],
		"content":     []map[string]any{{"type": "text", "text": string(out)}},
		"stop_reason": "end_turn", "stop_sequence": nil,
		"usage": map[string]any{"input_tokens": 100, "output_tokens": 50},
	})
}

// userText joins the text blocks of the request's messages.
func userText(body map[string]any) string {
	var b strings.Builder
	msgs, _ := body["messages"].([]any)
	for _, m := range msgs {
		content, _ := m.(map[string]any)["content"].([]any)
		for _, c := range content {
			if t, ok := c.(map[string]any)["text"].(string); ok {
				b.WriteString(t)
			}
		}
	}
	return b.String()
}
