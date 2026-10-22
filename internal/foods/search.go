package foods

import (
	"context"
	"fmt"
)

const localEnough = 3

// FromLocal maps a catalog row into a Hit used by the API.
func FromLocal(id int64, slug, name, brand string, protein, carbs, fat, kcal, perGrams float64, servingGrams int, servingLabel, source string) Hit {
	if source == "" {
		source = "local"
	}
	if perGrams <= 0 {
		perGrams = 100
	}
	hitID := slug
	if hitID == "" {
		hitID = fmt.Sprintf("local:%d", id)
	} else {
		hitID = "local:" + hitID
	}
	return Hit{
		ID:           hitID,
		Name:         name,
		Brand:        brand,
		ProteinG:     protein,
		CarbsG:       carbs,
		FatG:         fat,
		Kcal:         kcal,
		PerGrams:     perGrams,
		Source:       source,
		ServingGrams: servingGrams,
		ServingLabel: servingLabel,
	}
}

// MergeSearch returns local hits first. If fewer than localEnough, appends Open Food Facts results.
func MergeSearch(ctx context.Context, local []Hit, remote *Client, query string) ([]Hit, error) {
	for i := range local {
		if local[i].Source == "" {
			local[i].Source = "local"
		}
	}
	if len(local) >= localEnough {
		return local, nil
	}
	client := remote
	if client == nil {
		client = NewClient()
	}
	off, err := client.Search(ctx, query)
	if err != nil {
		// Local-first: if remote is down, still return what we have (possibly empty).
		return local, nil
	}
	seen := make(map[string]bool, len(local))
	for _, hit := range local {
		seen[normalizeKey(hit.Name)] = true
	}
	for _, hit := range off {
		hit.Source = "off"
		key := normalizeKey(hit.Name)
		if seen[key] {
			continue
		}
		seen[key] = true
		local = append(local, hit)
	}
	return local, nil
}

func normalizeKey(name string) string {
	out := make([]rune, 0, len(name))
	for _, r := range []rune(name) {
		if r >= 'A' && r <= 'Z' {
			r += 'a' - 'A'
		}
		if r == ' ' || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			out = append(out, r)
		}
	}
	return string(out)
}
