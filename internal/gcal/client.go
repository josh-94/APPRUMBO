package gcal

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"golang.org/x/oauth2"

	"hoy/internal/store"
)

const calendarScope = "https://www.googleapis.com/auth/calendar.readonly"

var (
	ErrUnauthorized = errors.New("google unauthorized")
	ErrUnavailable  = errors.New("google unavailable")
)

type Client struct {
	HTTP *http.Client
}

func New() *Client {
	return &Client{HTTP: &http.Client{Timeout: 45 * time.Second}}
}

func Scope() string { return calendarScope }

func (c *Client) ListPrimaryEvents(ctx context.Context, token *oauth2.Token, from, to time.Time) ([]store.GoogleCalendarEventInput, error) {
	if token == nil || strings.TrimSpace(token.AccessToken) == "" {
		return nil, ErrUnauthorized
	}
	q := url.Values{}
	q.Set("timeMin", from.UTC().Format(time.RFC3339))
	q.Set("timeMax", to.UTC().Format(time.RFC3339))
	q.Set("singleEvents", "true")
	q.Set("orderBy", "startTime")
	q.Set("maxResults", "2500")
	endpoint := "https://www.googleapis.com/calendar/v3/calendars/primary/events?" + q.Encode()

	var out []store.GoogleCalendarEventInput
	pageToken := ""
	for {
		reqURL := endpoint
		if pageToken != "" {
			reqURL += "&pageToken=" + url.QueryEscape(pageToken)
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+token.AccessToken)
		resp, err := c.HTTP.Do(req)
		if err != nil {
			if errors.Is(ctx.Err(), context.DeadlineExceeded) {
				return nil, ErrUnavailable
			}
			return nil, ErrUnavailable
		}
		body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
		_ = resp.Body.Close()
		if err != nil {
			return nil, ErrUnavailable
		}
		if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			return nil, ErrUnauthorized
		}
		if resp.StatusCode >= 400 {
			return nil, fmt.Errorf("%w: status %d", ErrUnavailable, resp.StatusCode)
		}
		var decoded struct {
			NextPageToken string `json:"nextPageToken"`
			Items         []struct {
				ID          string `json:"id"`
				Status      string `json:"status"`
				Summary     string `json:"summary"`
				Location    string `json:"location"`
				Description string `json:"description"`
				HTMLLink    string `json:"htmlLink"`
				Start       struct {
					Date     string `json:"date"`
					DateTime string `json:"dateTime"`
				} `json:"start"`
				End struct {
					Date     string `json:"date"`
					DateTime string `json:"dateTime"`
				} `json:"end"`
			} `json:"items"`
		}
		if err := json.Unmarshal(body, &decoded); err != nil {
			return nil, ErrUnavailable
		}
		for _, item := range decoded.Items {
			if item.Status == "cancelled" || strings.TrimSpace(item.ID) == "" {
				continue
			}
			starts, ends, allDay, ok := parseBounds(item.Start.Date, item.Start.DateTime, item.End.Date, item.End.DateTime)
			if !ok {
				continue
			}
			out = append(out, store.GoogleCalendarEventInput{
				GoogleEventID:    item.ID,
				GoogleCalendarID: "primary",
				Title:            item.Summary,
				Location:         item.Location,
				Description:      item.Description,
				AllDay:           allDay,
				StartsAt:         starts,
				EndsAt:           ends,
				HTMLLink:         item.HTMLLink,
				Color:            "horizonte",
			})
		}
		pageToken = decoded.NextPageToken
		if pageToken == "" {
			break
		}
	}
	return out, nil
}

func parseBounds(startDate, startDateTime, endDate, endDateTime string) (time.Time, time.Time, bool, bool) {
	if startDate != "" {
		starts, err := time.ParseInLocation("2006-01-02", startDate, time.UTC)
		if err != nil {
			return time.Time{}, time.Time{}, false, false
		}
		endsRaw := endDate
		if endsRaw == "" {
			endsRaw = startDate
		}
		ends, err := time.ParseInLocation("2006-01-02", endsRaw, time.UTC)
		if err != nil {
			return time.Time{}, time.Time{}, false, false
		}
		if !ends.After(starts) {
			ends = starts.Add(24 * time.Hour)
		}
		return starts, ends, true, true
	}
	starts, err := time.Parse(time.RFC3339, startDateTime)
	if err != nil {
		return time.Time{}, time.Time{}, false, false
	}
	ends, err := time.Parse(time.RFC3339, endDateTime)
	if err != nil {
		ends = starts.Add(time.Hour)
	}
	if ends.Before(starts) {
		ends = starts.Add(time.Hour)
	}
	return starts, ends, false, true
}
