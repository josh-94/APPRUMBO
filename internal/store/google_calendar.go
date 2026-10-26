package store

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type GoogleToken struct {
	UserID       int64
	RefreshToken string
	AccessToken  string
	Expiry       *time.Time
	Scopes       string
	LastSyncAt   *time.Time
}

type GoogleCalendarEvent struct {
	ID               int64     `json:"id"`
	GoogleEventID    string    `json:"googleEventId"`
	GoogleCalendarID string    `json:"googleCalendarId"`
	Title            string    `json:"title"`
	Location         string    `json:"location"`
	Description      string    `json:"description"`
	AllDay           bool      `json:"allDay"`
	StartsAt         time.Time `json:"startsAt"`
	EndsAt           time.Time `json:"endsAt"`
	HTMLLink         string    `json:"htmlLink"`
	Color            string    `json:"color"`
	Source           string    `json:"source"`
}

type GoogleCalendarEventInput struct {
	GoogleEventID    string
	GoogleCalendarID string
	Title            string
	Location         string
	Description      string
	AllDay           bool
	StartsAt         time.Time
	EndsAt           time.Time
	HTMLLink         string
	Color            string
}

func (s *Store) GoogleCalendarConnected(ctx context.Context, userID int64) (bool, *time.Time, error) {
	var last *time.Time
	err := s.pool.QueryRow(ctx, `
		SELECT last_sync_at FROM user_google_tokens WHERE user_id = $1`, userID).Scan(&last)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil, nil
	}
	if err != nil {
		return false, nil, err
	}
	return true, last, nil
}

func (s *Store) SaveGoogleToken(ctx context.Context, userID int64, refresh, access, scopes string, expiry *time.Time) error {
	refresh = strings.TrimSpace(refresh)
	if refresh == "" {
		return ErrBadMoney
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO user_google_tokens (user_id, refresh_token, access_token, expiry, scopes, updated_at)
		VALUES ($1, $2, $3, $4, $5, now())
		ON CONFLICT (user_id) DO UPDATE SET
			refresh_token = CASE
				WHEN EXCLUDED.refresh_token <> '' THEN EXCLUDED.refresh_token
				ELSE user_google_tokens.refresh_token
			END,
			access_token = EXCLUDED.access_token,
			expiry = EXCLUDED.expiry,
			scopes = EXCLUDED.scopes,
			updated_at = now()`,
		userID, refresh, strings.TrimSpace(access), expiry, strings.TrimSpace(scopes),
	)
	return err
}

func (s *Store) GoogleToken(ctx context.Context, userID int64) (GoogleToken, error) {
	var item GoogleToken
	err := s.pool.QueryRow(ctx, `
		SELECT user_id, refresh_token, access_token, expiry, scopes, last_sync_at
		FROM user_google_tokens WHERE user_id = $1`, userID).Scan(
		&item.UserID, &item.RefreshToken, &item.AccessToken, &item.Expiry, &item.Scopes, &item.LastSyncAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return GoogleToken{}, ErrNotFound
	}
	return item, err
}

func (s *Store) UpdateGoogleAccessToken(ctx context.Context, userID int64, access string, expiry *time.Time) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE user_google_tokens
		SET access_token = $2, expiry = $3, updated_at = now()
		WHERE user_id = $1`, userID, strings.TrimSpace(access), expiry)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) TouchGoogleSync(ctx context.Context, userID int64) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE user_google_tokens SET last_sync_at = now(), updated_at = now() WHERE user_id = $1`, userID)
	return err
}

func (s *Store) DeleteGoogleCalendar(ctx context.Context, userID int64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `DELETE FROM google_calendar_events WHERE user_id = $1`, userID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM user_google_tokens WHERE user_id = $1`, userID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) GoogleEvents(ctx context.Context, userID int64, from, to time.Time) ([]GoogleCalendarEvent, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, google_event_id, google_calendar_id, title, location, description,
		       all_day, starts_at, ends_at, html_link, color
		FROM google_calendar_events
		WHERE user_id = $1 AND starts_at < $3 AND ends_at > $2
		ORDER BY starts_at, id`, userID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []GoogleCalendarEvent{}
	for rows.Next() {
		var item GoogleCalendarEvent
		if err := rows.Scan(
			&item.ID, &item.GoogleEventID, &item.GoogleCalendarID, &item.Title, &item.Location, &item.Description,
			&item.AllDay, &item.StartsAt, &item.EndsAt, &item.HTMLLink, &item.Color,
		); err != nil {
			return nil, err
		}
		item.Source = "google"
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) ReplaceGoogleEventsInRange(ctx context.Context, userID int64, from, to time.Time, items []GoogleCalendarEventInput) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `
		DELETE FROM google_calendar_events
		WHERE user_id = $1 AND starts_at < $3 AND ends_at > $2`, userID, from, to); err != nil {
		return err
	}
	for _, item := range items {
		color := strings.TrimSpace(item.Color)
		if color == "" {
			color = "horizonte"
		}
		calID := strings.TrimSpace(item.GoogleCalendarID)
		if calID == "" {
			calID = "primary"
		}
		title := strings.TrimSpace(item.Title)
		if title == "" {
			title = "(sin título)"
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO google_calendar_events (
				user_id, google_event_id, google_calendar_id, title, location, description,
				all_day, starts_at, ends_at, html_link, color, updated_at
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
			ON CONFLICT (user_id, google_event_id) DO UPDATE SET
				google_calendar_id = EXCLUDED.google_calendar_id,
				title = EXCLUDED.title,
				location = EXCLUDED.location,
				description = EXCLUDED.description,
				all_day = EXCLUDED.all_day,
				starts_at = EXCLUDED.starts_at,
				ends_at = EXCLUDED.ends_at,
				html_link = EXCLUDED.html_link,
				color = EXCLUDED.color,
				updated_at = now()`,
			userID, item.GoogleEventID, calID, title, strings.TrimSpace(item.Location), strings.TrimSpace(item.Description),
			item.AllDay, item.StartsAt.UTC(), item.EndsAt.UTC(), strings.TrimSpace(item.HTMLLink), color,
		); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `
		UPDATE user_google_tokens SET last_sync_at = now(), updated_at = now() WHERE user_id = $1`, userID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
