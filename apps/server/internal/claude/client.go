// Package claude is everything the app asks Claude: reading a dictation into
// item drafts (dictation.go), and proposing Type tags for items (tags.go).
// Each is one structured-output request through Client.ask, so every caller
// gets the same timeout, stop-reason handling and key-safe errors.
package claude

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
	"github.com/anthropics/anthropic-sdk-go/shared/constant"
)

// Client calls the Anthropic API. A nil *Client means no API key is set and
// every Claude feature is off.
type Client struct {
	client anthropic.Client
}

// New returns a Client using apiKey. baseURL, when not empty, replaces the
// API's address (the shared fake in tests and dev).
func New(apiKey, baseURL string) *Client {
	opts := []option.RequestOption{option.WithAPIKey(apiKey), option.WithRequestTimeout(60 * time.Second)}
	if baseURL != "" {
		opts = append(opts, option.WithBaseURL(baseURL))
	}
	return &Client{client: anthropic.NewClient(opts...)}
}

// request is one structured-output call.
type request struct {
	model  anthropic.Model
	effort anthropic.BetaOutputConfigEffort
	// fallback retries a refusal on a suitable model; not every model has one.
	fallback bool
	system   string
	user     string
	schema   map[string]any
}

// ask sends req and decodes Claude's JSON answer into out.
func (c *Client) ask(ctx context.Context, req request, out any) error {
	params := anthropic.BetaMessageNewParams{
		Model:     req.model,
		MaxTokens: 16000,
		System:    []anthropic.BetaTextBlockParam{{Text: req.system}},
		OutputConfig: anthropic.BetaOutputConfigParam{
			Effort: req.effort,
			Format: anthropic.BetaJSONOutputFormatParam{Schema: req.schema},
		},
		Messages: []anthropic.BetaMessageParam{
			anthropic.NewBetaUserMessage(anthropic.NewBetaTextBlock(req.user)),
		},
	}
	if req.fallback {
		params.Betas = []anthropic.AnthropicBeta{anthropic.AnthropicBetaServerSideFallback2026_07_01}
		params.Fallbacks = anthropic.BetaFallbacksParamUnion{OfDefault: constant.ValueOf[constant.Default]()}
	}
	msg, err := c.client.Beta.Messages.New(ctx, params)
	if err != nil {
		return fmt.Errorf("calling Claude: %w", err)
	}
	switch msg.StopReason {
	case anthropic.BetaStopReasonEndTurn:
	case anthropic.BetaStopReasonRefusal:
		return errors.New("claude declined the request")
	default:
		return fmt.Errorf("claude stopped early: %s", msg.StopReason)
	}
	var text string
	for _, block := range msg.Content {
		if t, ok := block.AsAny().(anthropic.BetaTextBlock); ok {
			text += t.Text
		}
	}
	if err := json.Unmarshal([]byte(text), out); err != nil {
		return fmt.Errorf("parsing Claude's answer: %w", err)
	}
	return nil
}
