package dictation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
	"github.com/anthropics/anthropic-sdk-go/shared/constant"
)

// Model is the Claude model that reads dictations.
const Model = "claude-opus-5-5"

// Claude is the Extractor backed by the Anthropic API.
type Claude struct {
	client anthropic.Client
}

// NewClaude returns a Claude extractor using apiKey. baseURL, when not
// empty, replaces the API's address (the e2e suite's fake).
func NewClaude(apiKey, baseURL string) *Claude {
	opts := []option.RequestOption{option.WithAPIKey(apiKey), option.WithRequestTimeout(60 * time.Second)}
	if baseURL != "" {
		opts = append(opts, option.WithBaseURL(baseURL))
	}
	return &Claude{client: anthropic.NewClient(opts...)}
}

const systemPrompt = `You turn a dictated list of things stored in a shed or back room into item drafts the user will review before saving.

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

type output struct {
	Items []struct {
		Name     string   `json:"name"`
		Quantity int      `json:"quantity"`
		Litres   *float64 `json:"litres"` // null when there's no sensible estimate
		Tags     []string `json:"tags"`   // typed paths, "Location/Shed"
	} `json:"items"`
}

// UserMessage is the prompt for one dictation: the existing tag paths, one
// per line in their typed form, then the transcript.
func UserMessage(transcript string, tagPaths [][]string) string {
	var b strings.Builder
	b.WriteString("Existing tag paths:\n<tags>\n")
	for _, p := range tagPaths {
		b.WriteString(strings.Join(p, "/") + "\n")
	}
	b.WriteString("</tags>\n\nDictation:\n<dictation>\n" + transcript + "\n</dictation>")
	return b.String()
}

// Extract asks Claude for the drafts in transcript. The result is not yet
// cleaned; pass it through Clean.
func (c *Claude) Extract(ctx context.Context, transcript string, tagPaths [][]string) ([]Draft, error) {
	msg, err := c.client.Beta.Messages.New(ctx, anthropic.BetaMessageNewParams{
		Model:     Model,
		MaxTokens: 16000,
		// A refusal is retried on a suitable model rather than failing the dictation.
		Betas:     []anthropic.AnthropicBeta{anthropic.AnthropicBetaServerSideFallback2026_07_01},
		Fallbacks: anthropic.BetaFallbacksParamUnion{OfDefault: constant.ValueOf[constant.Default]()},
		System:    []anthropic.BetaTextBlockParam{{Text: systemPrompt}},
		OutputConfig: anthropic.BetaOutputConfigParam{
			// A short list needs little reasoning; low keeps the wait short.
			Effort: anthropic.BetaOutputConfigEffortLow,
			Format: anthropic.BetaJSONOutputFormatParam{Schema: draftSchema},
		},
		Messages: []anthropic.BetaMessageParam{
			anthropic.NewBetaUserMessage(anthropic.NewBetaTextBlock(UserMessage(transcript, tagPaths))),
		},
	})
	if err != nil {
		return nil, fmt.Errorf("calling Claude: %w", err)
	}
	switch msg.StopReason {
	case anthropic.BetaStopReasonEndTurn:
	case anthropic.BetaStopReasonRefusal:
		return nil, errors.New("claude declined the dictation")
	default:
		return nil, fmt.Errorf("claude stopped early: %s", msg.StopReason)
	}
	var text string
	for _, block := range msg.Content {
		if t, ok := block.AsAny().(anthropic.BetaTextBlock); ok {
			text += t.Text
		}
	}
	var out output
	if err := json.Unmarshal([]byte(text), &out); err != nil {
		return nil, fmt.Errorf("parsing Claude's drafts: %w", err)
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
