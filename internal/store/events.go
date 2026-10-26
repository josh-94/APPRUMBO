package store

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

var allowedEventColors = map[string]bool{
	"menta":     true,
	"impulso":   true,
	"horizonte": true,
	"ciruela":   true,
	"alerta":    true,
	"bosque":    true,
}

type CalendarEvent struct {
	ID             int64     `json:"id"`
	Title          string    `json:"title"`
	Location       string    `json:"location"`
	Description    string    `json:"description"`
	AllDay         bool      `json:"allDay"`
	StartsAt       time.Time `json:"startsAt"`
	EndsAt         time.Time `json:"endsAt"`
	Color          string    `json:"color"`
	RemindMinutes  *int      `json:"remindMinutes,omitempty"`
	RepeatRule     string    `json:"repeatRule"`
	RepeatWeekdays []int     `json:"repeatWeekdays"`
}

type EventInput struct {
	Title          string     `json:"title"`
	Location       string     `json:"location"`
	Description    string     `json:"description"`
	AllDay         bool       `json:"allDay"`
	StartsAt       time.Time  `json:"startsAt"`
	EndsAt         *time.Time `json:"endsAt"`
	Color          string     `json:"color"`
	RemindMinutes  *int       `json:"remindMinutes"`
	RepeatRule     string     `json:"repeatRule"`
	RepeatWeekdays []int      `json:"repeatWeekdays"`
}

func (s *Store) Events(ctx context.Context, userID int64, from, to time.Time) ([]CalendarEvent, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, title, location, description, all_day, starts_at, ends_at, color,
		       remind_minutes, repeat_rule, COALESCE(repeat_weekdays, '{}')
		FROM calendar_events
		WHERE user_id = $1 AND starts_at < $3 AND ends_at > $2
		ORDER BY starts_at, id`, userID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CalendarEvent{}
	for rows.Next() {
		item, err := scanEvent(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) EventByID(ctx context.Context, userID, id int64) (CalendarEvent, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT id, title, location, description, all_day, starts_at, ends_at, color,
		       remind_minutes, repeat_rule, COALESCE(repeat_weekdays, '{}')
		FROM calendar_events
		WHERE id = $1 AND user_id = $2`, id, userID)
	item, err := scanEvent(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return CalendarEvent{}, ErrNotFound
	}
	return item, err
}

func (s *Store) CreateEvent(ctx context.Context, userID int64, input EventInput) (CalendarEvent, error) {
	item, err := normalizeEvent(input)
	if err != nil {
		return CalendarEvent{}, err
	}
	row := s.pool.QueryRow(ctx, `
		INSERT INTO calendar_events (
			user_id, title, location, description, all_day, starts_at, ends_at,
			color, remind_minutes, repeat_rule, repeat_weekdays
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		RETURNING id, title, location, description, all_day, starts_at, ends_at, color,
		          remind_minutes, repeat_rule, COALESCE(repeat_weekdays, '{}')`,
		userID, item.Title, item.Location, item.Description, item.AllDay, item.StartsAt, item.EndsAt,
		item.Color, item.RemindMinutes, item.RepeatRule, toSmallIntArray(item.RepeatWeekdays),
	)
	return scanEvent(row)
}

func (s *Store) UpdateEvent(ctx context.Context, userID, id int64, input EventInput) (CalendarEvent, error) {
	item, err := normalizeEvent(input)
	if err != nil {
		return CalendarEvent{}, err
	}
	row := s.pool.QueryRow(ctx, `
		UPDATE calendar_events SET
			title = $3, location = $4, description = $5, all_day = $6,
			starts_at = $7, ends_at = $8, color = $9, remind_minutes = $10,
			repeat_rule = $11, repeat_weekdays = $12, updated_at = now()
		WHERE id = $1 AND user_id = $2
		RETURNING id, title, location, description, all_day, starts_at, ends_at, color,
		          remind_minutes, repeat_rule, COALESCE(repeat_weekdays, '{}')`,
		id, userID, item.Title, item.Location, item.Description, item.AllDay, item.StartsAt, item.EndsAt,
		item.Color, item.RemindMinutes, item.RepeatRule, toSmallIntArray(item.RepeatWeekdays),
	)
	out, err := scanEvent(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return CalendarEvent{}, ErrNotFound
	}
	return out, err
}

func (s *Store) DeleteEvent(ctx context.Context, userID, id int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM calendar_events WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

type DueEventReminder struct {
	EventID       int64
	UserID        int64
	Title         string
	RemindAt      time.Time
	RemindMinutes int
}

func (s *Store) DueEventReminders(ctx context.Context, limit int) ([]DueEventReminder, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT e.id, e.user_id, e.title,
		       e.starts_at - (e.remind_minutes * interval '1 minute') AS remind_at,
		       e.remind_minutes
		FROM calendar_events e
		WHERE e.remind_minutes IS NOT NULL
		  AND e.starts_at - (e.remind_minutes * interval '1 minute') <= now()
		  AND e.starts_at - (e.remind_minutes * interval '1 minute') > now() - interval '6 hours'
		  AND NOT EXISTS (
		    SELECT 1 FROM event_reminder_log l
		    WHERE l.event_id = e.id
		      AND l.remind_at = e.starts_at - (e.remind_minutes * interval '1 minute')
		  )
		ORDER BY remind_at
		LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []DueEventReminder{}
	for rows.Next() {
		var item DueEventReminder
		if err := rows.Scan(&item.EventID, &item.UserID, &item.Title, &item.RemindAt, &item.RemindMinutes); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) ClaimEventReminder(ctx context.Context, eventID int64, remindAt time.Time) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO event_reminder_log (event_id, remind_at) VALUES ($1, $2)
		ON CONFLICT DO NOTHING`, eventID, remindAt)
	return err
}

type eventScanner interface {
	Scan(dest ...any) error
}

func scanEvent(row eventScanner) (CalendarEvent, error) {
	var item CalendarEvent
	var remind pgtype.Int4
	var days []int16
	if err := row.Scan(
		&item.ID, &item.Title, &item.Location, &item.Description, &item.AllDay,
		&item.StartsAt, &item.EndsAt, &item.Color, &remind, &item.RepeatRule, &days,
	); err != nil {
		return CalendarEvent{}, err
	}
	if remind.Valid {
		v := int(remind.Int32)
		item.RemindMinutes = &v
	}
	item.RepeatWeekdays = fromSmallIntArray(days)
	return item, nil
}

func normalizeEvent(input EventInput) (CalendarEvent, error) {
	title, err := cleanLabel(input.Title, 120)
	if err != nil || title == "" {
		return CalendarEvent{}, ErrBadMoney
	}
	location, err := cleanLabel(input.Location, 200)
	if err != nil {
		return CalendarEvent{}, ErrBadMoney
	}
	description := strings.TrimSpace(input.Description)
	if len([]rune(description)) > 2000 {
		return CalendarEvent{}, ErrBadMoney
	}
	if input.StartsAt.IsZero() {
		return CalendarEvent{}, ErrBadMoney
	}
	starts := input.StartsAt.UTC()
	var ends time.Time
	if input.EndsAt != nil && !input.EndsAt.IsZero() {
		ends = input.EndsAt.UTC()
	} else if input.AllDay {
		ends = starts.Add(24 * time.Hour)
	} else {
		ends = starts.Add(time.Hour)
	}
	if ends.Before(starts) {
		return CalendarEvent{}, ErrBadMoney
	}
	color := strings.TrimSpace(strings.ToLower(input.Color))
	if color == "" {
		color = "menta"
	}
	if !allowedEventColors[color] {
		return CalendarEvent{}, ErrBadMoney
	}
	rule := strings.TrimSpace(strings.ToLower(input.RepeatRule))
	if rule == "" {
		rule = "none"
	}
	if rule != "none" && rule != "weekly" {
		return CalendarEvent{}, ErrBadMoney
	}
	days := normalizeWeekdays(input.RepeatWeekdays)
	if rule == "weekly" && len(days) == 0 {
		return CalendarEvent{}, ErrBadMoney
	}
	if input.RemindMinutes != nil && (*input.RemindMinutes < 0 || *input.RemindMinutes > 4*7*24*60) {
		return CalendarEvent{}, ErrBadMoney
	}
	return CalendarEvent{
		Title:          title,
		Location:       location,
		Description:    description,
		AllDay:         input.AllDay,
		StartsAt:       starts,
		EndsAt:         ends,
		Color:          color,
		RemindMinutes:  input.RemindMinutes,
		RepeatRule:     rule,
		RepeatWeekdays: days,
	}, nil
}

func normalizeWeekdays(days []int) []int {
	seen := map[int]bool{}
	out := []int{}
	for _, day := range days {
		if day < 1 || day > 7 || seen[day] {
			continue
		}
		seen[day] = true
		out = append(out, day)
	}
	return out
}

func toSmallIntArray(days []int) []int16 {
	out := make([]int16, len(days))
	for i, day := range days {
		out[i] = int16(day)
	}
	return out
}

func fromSmallIntArray(days []int16) []int {
	out := make([]int, len(days))
	for i, day := range days {
		out[i] = int(day)
	}
	return out
}
