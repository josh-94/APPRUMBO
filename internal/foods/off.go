package foods

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

var ErrUnavailable = errors.New("foods unavailable")

type Hit struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Brand        string  `json:"brand"`
	Kcal         float64 `json:"kcal"`
	ProteinG     float64 `json:"proteinG"`
	CarbsG       float64 `json:"carbsG"`
	FatG         float64 `json:"fatG"`
	PerGrams     float64 `json:"perGrams"`
	Source       string  `json:"source,omitempty"`
	ServingGrams int     `json:"servingGrams,omitempty"`
	ServingLabel string  `json:"servingLabel,omitempty"`
}

type Client struct {
	HTTP *http.Client
	URL  string
}

func NewClient() *Client {
	return &Client{
		HTTP: &http.Client{Timeout: 10 * time.Second},
		URL:  "https://world.openfoodfacts.org/cgi/search.pl",
	}
}

func (c *Client) Search(ctx context.Context, query string) ([]Hit, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return []Hit{}, nil
	}
	base := c.URL
	if base == "" {
		base = "https://world.openfoodfacts.org/cgi/search.pl"
	}
	values := url.Values{}
	values.Set("search_terms", query)
	values.Set("search_simple", "1")
	values.Set("action", "process")
	values.Set("json", "1")
	values.Set("page_size", "12")
	values.Set("fields", "code,product_name,brands,nutriments")
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"?"+values.Encode(), nil)
	if err != nil {
		return nil, ErrUnavailable
	}
	req.Header.Set("User-Agent", "Rumbo/1.0 (hoy; food search)")
	client := c.HTTP
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, ErrUnavailable
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, ErrUnavailable
	}
	payload, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return nil, ErrUnavailable
	}
	var body struct {
		Products []struct {
			Code        string `json:"code"`
			ProductName string `json:"product_name"`
			Brands      string `json:"brands"`
			Nutriments  map[string]any `json:"nutriments"`
		} `json:"products"`
	}
	if err := json.Unmarshal(payload, &body); err != nil {
		return nil, ErrUnavailable
	}
	out := make([]Hit, 0, len(body.Products))
	for _, product := range body.Products {
		name := strings.TrimSpace(product.ProductName)
		if name == "" {
			continue
		}
		hit := Hit{
			ID:       strings.TrimSpace(product.Code),
			Name:     name,
			Brand:    strings.TrimSpace(product.Brands),
			PerGrams: 100,
			Kcal:     nutriment(product.Nutriments, "energy-kcal_100g", "energy-kcal"),
			ProteinG: nutriment(product.Nutriments, "proteins_100g", "proteins"),
			CarbsG:   nutriment(product.Nutriments, "carbohydrates_100g", "carbohydrates"),
			FatG:     nutriment(product.Nutriments, "fat_100g", "fat"),
		}
		if hit.Kcal == 0 {
			kj := nutriment(product.Nutriments, "energy_100g", "energy")
			if kj > 0 {
				hit.Kcal = kj / 4.184
			}
		}
		out = append(out, hit)
	}
	return out, nil
}

func nutriment(values map[string]any, keys ...string) float64 {
	for _, key := range keys {
		raw, ok := values[key]
		if !ok || raw == nil {
			continue
		}
		switch typed := raw.(type) {
		case float64:
			return typed
		case json.Number:
			n, _ := typed.Float64()
			return n
		case string:
			n, err := strconv.ParseFloat(strings.TrimSpace(typed), 64)
			if err == nil {
				return n
			}
		}
	}
	return 0
}

// ScaleMacros scales stored per-portion values to the given grams.
func ScaleMacros(base Hit, grams int) (protein, carbs, fat, kcal float64) {
	if grams <= 0 {
		return 0, 0, 0, 0
	}
	per := base.PerGrams
	if per <= 0 {
		per = 100
	}
	factor := float64(grams) / per
	return round1(base.ProteinG * factor), round1(base.CarbsG * factor), round1(base.FatG * factor), round1(base.Kcal * factor)
}

func round1(value float64) float64 {
	return float64(int(value*10+0.5)) / 10
}
