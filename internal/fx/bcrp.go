package fx

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	DefaultHundredths = 340
	MinHundredths     = 100
	MaxHundredths     = 2000
	cacheTTL          = 8 * time.Hour
	defaultURL        = "https://estadisticas.bcrp.gob.pe/estadisticas/series/api/PD04638PD/json"
)

var ErrUnavailable = errors.New("fx unavailable")

type Client struct {
	HTTP *http.Client
	URL  string

	mu      sync.Mutex
	value   int
	fetched time.Time
}

func NewClient() *Client {
	return &Client{
		HTTP: &http.Client{Timeout: 8 * time.Second},
		URL:  defaultURL,
	}
}

// Hundredths returns the cached BCRP venta rate as soles-per-dollar × 100.
// On failure it returns ErrUnavailable without clearing a previous cache value.
func (c *Client) Hundredths(ctx context.Context) (int, error) {
	if c == nil {
		return 0, ErrUnavailable
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.value > 0 && time.Since(c.fetched) < cacheTTL {
		return c.value, nil
	}
	value, err := c.fetch(ctx)
	if err != nil {
		return 0, err
	}
	c.value = value
	c.fetched = time.Now()
	return value, nil
}

func (c *Client) fetch(ctx context.Context) (int, error) {
	client := c.HTTP
	if client == nil {
		client = &http.Client{Timeout: 8 * time.Second}
	}
	url := c.URL
	if url == "" {
		url = defaultURL
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, ErrUnavailable
	}
	resp, err := client.Do(req)
	if err != nil {
		return 0, ErrUnavailable
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return 0, ErrUnavailable
	}
	payload, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return 0, ErrUnavailable
	}
	return ParseHundredths(payload)
}

func ParseHundredths(payload []byte) (int, error) {
	var body struct {
		Periods []struct {
			Values []string `json:"values"`
		} `json:"periods"`
	}
	if err := json.Unmarshal(payload, &body); err != nil {
		return 0, ErrUnavailable
	}
	for i := len(body.Periods) - 1; i >= 0; i-- {
		if len(body.Periods[i].Values) == 0 {
			continue
		}
		raw := strings.TrimSpace(body.Periods[i].Values[0])
		if raw == "" || strings.EqualFold(raw, "n.d.") {
			continue
		}
		rate, err := strconv.ParseFloat(raw, 64)
		if err != nil || rate <= 0 {
			continue
		}
		hundredths := int(math.Round(rate * 100))
		if hundredths < MinHundredths || hundredths > MaxHundredths {
			return 0, ErrUnavailable
		}
		return hundredths, nil
	}
	return 0, ErrUnavailable
}
