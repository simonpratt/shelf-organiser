package claudefake

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"
	"strings"
)

// keywords are the fake's taxonomy: a word in an item's name or note, and
// the tag below the Type dimension it proposes. Earlier rows win.
var keywords = []struct {
	words []string
	path  string
}{
	{[]string{"drill", "saw", "sander", "grinder"}, "Tools/Power tools"},
	{[]string{"hammer", "spanner", "wrench", "screwdriver", "toolbox", "tool"}, "Tools/Hand tools"},
	{[]string{"tent", "sleeping", "camping", "stove", "esky", "cooler"}, "Camping"},
	{[]string{"mower", "lawn", "hose", "rake", "spade", "shovel", "wheelbarrow", "garden", "pot"}, "Garden"},
	{[]string{"bike", "helmet", "ski", "surf", "ball", "racquet"}, "Sport"},
	{[]string{"christmas", "decoration", "lights", "halloween"}, "Seasonal"},
	{[]string{"couch", "sofa", "table", "desk", "chair", "lamp", "mattress"}, "Furniture"},
	{[]string{"photo", "album", "book", "letters", "toys"}, "Keepsakes"},
}

var (
	perItemRe  = regexp.MustCompile(`up to (\d+) tag paths per item, for at most (\d+) items`)
	categoryRe = regexp.MustCompile(`(?i)^(type|kind|category)$`)
)

func (f *Fake) proposeTags(w http.ResponseWriter, body map[string]any, prompt string) {
	perItem, maxItems := 1, 40
	if m := perItemRe.FindStringSubmatch(prompt); m != nil {
		perItem, _ = strconv.Atoi(m[1])
		maxItems, _ = strconv.Atoi(m[2])
	}
	var tree []string
	var lines []string
	for _, m := range section.FindAllStringSubmatch(prompt, -1) {
		for _, line := range strings.Split(m[2], "\n") {
			if line == "" {
				continue
			}
			if m[1] == "items" {
				lines = append(lines, line)
			} else {
				tree = append(tree, line)
			}
		}
	}
	dim := "Type"
	for _, t := range tree {
		if !strings.Contains(t, "/") && categoryRe.MatchString(t) {
			dim = t
			break
		}
	}

	type proposal struct {
		Ref  int64    `json:"ref"`
		Tags []string `json:"tags"`
	}
	proposals := []proposal{}
	for _, line := range lines {
		var it struct {
			Ref  int64    `json:"ref"`
			Name string   `json:"name"`
			Note string   `json:"note"`
			Tags []string `json:"tags"`
		}
		if err := json.Unmarshal([]byte(line), &it); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request_error", "bad item line")
			return
		}
		if strings.Contains(it.Name, FailMarker) {
			writeError(w, http.StatusInternalServerError, "api_error", "internal error")
			return
		}
		if len(proposals) == maxItems || hasTagIn(it.Tags, dim) {
			continue
		}
		text := strings.ToLower(it.Name + " " + it.Note)
		var tags []string
		add := func(p string) {
			for _, t := range tags {
				if strings.EqualFold(t, p) {
					return
				}
			}
			if len(tags) < perItem {
				tags = append(tags, p)
			}
		}
		for _, t := range tree {
			names := strings.Split(t, "/")
			last := strings.TrimSuffix(strings.ToLower(names[len(names)-1]), "s")
			if len(names) > 1 && strings.EqualFold(names[0], dim) && strings.Contains(text, last) {
				add(t)
			}
		}
		for _, k := range keywords {
			for _, word := range k.words {
				if strings.Contains(text, word) {
					add(dim + "/" + k.path)
					break
				}
			}
		}
		if len(tags) > 0 {
			proposals = append(proposals, proposal{Ref: it.Ref, Tags: tags})
		}
	}
	writeAnswer(w, body, map[string]any{"dimension": dim, "items": proposals})
}

func hasTagIn(tags []string, dim string) bool {
	for _, t := range tags {
		if strings.EqualFold(strings.Split(t, "/")[0], dim) {
			return true
		}
	}
	return false
}
