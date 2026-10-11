package store

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var ErrHabitLimit = errors.New("habit limit")
var ErrBadMoney = errors.New("bad money")

type Habit struct {
	ID           int64    `json:"id"`
	Name         string   `json:"name"`
	NGoal        int      `json:"nGoal"`
	DoneThisWeek int      `json:"doneThisWeek"`
	StreakWeeks  int      `json:"streakWeeks"`
	Checks       []string `json:"checks"`
}

type Account struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type Category struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Kind     string `json:"kind"`
	Position int    `json:"position"`
}

type Movement struct {
	ID          int64  `json:"id"`
	AccountID   int64  `json:"accountId"`
	CategoryID  int64  `json:"categoryId"`
	Kind        string `json:"kind"`
	AmountCents int64  `json:"amountCents"`
	OccurredOn  string `json:"occurredOn"`
	AccountName string `json:"accountName"`
	Category    string `json:"category"`
	Note        string `json:"note"`
}

type MonthSummary struct {
	SpentCents  int64
	IncomeCents int64
	Accounts    []Account
	Categories  []Category
	Movements   []Movement
}

func (s *Store) Email(ctx context.Context, userID int64) (string, error) {
	var email string
	err := s.pool.QueryRow(ctx, `SELECT email FROM users WHERE id = $1`, userID).Scan(&email)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return email, err
}

func (s *Store) Habits(ctx context.Context, userID int64, today time.Time) ([]Habit, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, name, n_goal FROM habits
		WHERE user_id = $1 AND active
		ORDER BY id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var habits []Habit
	for rows.Next() {
		var h Habit
		if err := rows.Scan(&h.ID, &h.Name, &h.NGoal); err != nil {
			return nil, err
		}
		habits = append(habits, h)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if habits == nil {
		habits = []Habit{}
	}
	start := mondayOf(today)
	for i := range habits {
		checks, err := s.habitDays(ctx, habits[i].ID, start.AddDate(0, 0, -370))
		if err != nil {
			return nil, err
		}
		habits[i].Checks = checksInWeek(checks, start)
		habits[i].DoneThisWeek = len(habits[i].Checks)
		habits[i].StreakWeeks = StreakWeeks(checks, habits[i].NGoal, today)
	}
	return habits, nil
}

func (s *Store) habitDays(ctx context.Context, habitID int64, since time.Time) ([]string, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT to_char(day, 'YYYY-MM-DD') FROM habit_checks
		WHERE habit_id = $1 AND day >= $2
		ORDER BY day`, habitID, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var days []string
	for rows.Next() {
		var day string
		if err := rows.Scan(&day); err != nil {
			return nil, err
		}
		days = append(days, day)
	}
	return days, rows.Err()
}

func (s *Store) CreateHabit(ctx context.Context, userID int64, name string, nGoal int) (int64, error) {
	if nGoal < 1 || nGoal > 7 {
		nGoal = 5
	}
	var count int
	if err := s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM habits WHERE user_id = $1 AND active`, userID).Scan(&count); err != nil {
		return 0, err
	}
	if count >= 7 {
		return 0, ErrHabitLimit
	}
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO habits (user_id, name, n_goal) VALUES ($1, $2, $3) RETURNING id`,
		userID, name, nGoal).Scan(&id)
	return id, err
}

func (s *Store) SetHabitCheck(ctx context.Context, userID, habitID int64, day time.Time, on bool) error {
	var owner int64
	err := s.pool.QueryRow(ctx, `SELECT user_id FROM habits WHERE id = $1 AND active`, habitID).Scan(&owner)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && owner != userID) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if on {
		_, err = s.pool.Exec(ctx, `
			INSERT INTO habit_checks (habit_id, day) VALUES ($1, $2)
			ON CONFLICT DO NOTHING`, habitID, day)
		return err
	}
	_, err = s.pool.Exec(ctx, `DELETE FROM habit_checks WHERE habit_id = $1 AND day = $2`, habitID, day)
	return err
}

func (s *Store) Month(ctx context.Context, userID int64, from, to time.Time) (MonthSummary, error) {
	var summary MonthSummary
	summary.Accounts = []Account{}
	summary.Categories = []Category{}
	summary.Movements = []Movement{}
	if err := s.pool.QueryRow(ctx, `
		SELECT
			COALESCE(SUM(amount_cents) FILTER (WHERE kind = 'gasto'), 0),
			COALESCE(SUM(amount_cents) FILTER (WHERE kind = 'ingreso'), 0)
		FROM movements
		WHERE user_id = $1 AND occurred_on >= $2 AND occurred_on < $3`,
		userID, from, to).Scan(&summary.SpentCents, &summary.IncomeCents); err != nil {
		return summary, err
	}
	accounts, err := s.accounts(ctx, userID)
	if err != nil {
		return summary, err
	}
	categories, err := s.categories(ctx, userID)
	if err != nil {
		return summary, err
	}
	movements, err := s.movements(ctx, userID, from, to)
	if err != nil {
		return summary, err
	}
	summary.Accounts = accounts
	summary.Categories = categories
	summary.Movements = movements
	return summary, nil
}

func (s *Store) accounts(ctx context.Context, userID int64) ([]Account, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, name FROM accounts WHERE user_id = $1 ORDER BY id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Account
	for rows.Next() {
		var item Account
		if err := rows.Scan(&item.ID, &item.Name); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	if out == nil {
		out = []Account{}
	}
	return out, rows.Err()
}

func (s *Store) categories(ctx context.Context, userID int64) ([]Category, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, name, kind, position FROM categories
		WHERE user_id = $1 ORDER BY position, id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Category
	for rows.Next() {
		var item Category
		if err := rows.Scan(&item.ID, &item.Name, &item.Kind, &item.Position); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	if out == nil {
		out = []Category{}
	}
	return out, rows.Err()
}

func (s *Store) movements(ctx context.Context, userID int64, from, to time.Time) ([]Movement, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT m.id, m.account_id, COALESCE(m.category_id, 0), m.kind, m.amount_cents,
		       to_char(m.occurred_on, 'YYYY-MM-DD'), a.name, COALESCE(c.name, ''), COALESCE(m.note, '')
		FROM movements m
		JOIN accounts a ON a.id = m.account_id
		LEFT JOIN categories c ON c.id = m.category_id
		WHERE m.user_id = $1 AND m.occurred_on >= $2 AND m.occurred_on < $3
		ORDER BY m.occurred_on DESC, m.id DESC`, userID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Movement
	for rows.Next() {
		var item Movement
		if err := rows.Scan(&item.ID, &item.AccountID, &item.CategoryID, &item.Kind, &item.AmountCents, &item.OccurredOn, &item.AccountName, &item.Category, &item.Note); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	if out == nil {
		out = []Movement{}
	}
	return out, rows.Err()
}

func (s *Store) CreateMovement(ctx context.Context, userID int64, item Movement, day time.Time) (Movement, error) {
	if item.AmountCents <= 0 || (item.Kind != "gasto" && item.Kind != "ingreso") {
		return Movement{}, ErrBadMoney
	}
	note, err := cleanLabel(item.Note, 80)
	if err != nil {
		return Movement{}, err
	}
	item.Note = note
	var accountOwner int64
	if err := s.pool.QueryRow(ctx, `SELECT user_id FROM accounts WHERE id = $1`, item.AccountID).Scan(&accountOwner); err != nil || accountOwner != userID {
		return Movement{}, ErrNotFound
	}
	if item.CategoryID != 0 {
		var catOwner int64
		var kind string
		if err := s.pool.QueryRow(ctx, `SELECT user_id, kind FROM categories WHERE id = $1`, item.CategoryID).Scan(&catOwner, &kind); err != nil || catOwner != userID || kind != item.Kind {
			return Movement{}, ErrBadMoney
		}
	}
	err = s.pool.QueryRow(ctx, `
		INSERT INTO movements (user_id, account_id, category_id, kind, amount_cents, occurred_on, note)
		VALUES ($1, $2, NULLIF($3, 0), $4, $5, $6, $7)
		RETURNING id`,
		userID, item.AccountID, item.CategoryID, item.Kind, item.AmountCents, day, item.Note).Scan(&item.ID)
	if err != nil {
		return Movement{}, err
	}
	item.OccurredOn = day.Format("2006-01-02")
	return item, nil
}

func (s *Store) CreateCategory(ctx context.Context, userID int64, name, kind string) (Category, error) {
	if kind != "gasto" && kind != "ingreso" {
		return Category{}, ErrBadMoney
	}
	label, err := cleanLabel(name, 40)
	if err != nil || label == "" {
		return Category{}, ErrBadMoney
	}
	existing, err := s.categoryByName(ctx, userID, kind, label)
	if err == nil {
		return existing, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return Category{}, err
	}
	var position int
	if err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(MAX(position), -1) + 1 FROM categories
		WHERE user_id = $1 AND kind = $2`, userID, kind).Scan(&position); err != nil {
		return Category{}, err
	}
	var item Category
	err = s.pool.QueryRow(ctx, `
		INSERT INTO categories (user_id, name, kind, position)
		VALUES ($1, $2, $3, $4)
		RETURNING id, name, kind, position`,
		userID, label, kind, position).Scan(&item.ID, &item.Name, &item.Kind, &item.Position)
	if isUnique(err) {
		return s.categoryByName(ctx, userID, kind, label)
	}
	return item, err
}

func (s *Store) categoryByName(ctx context.Context, userID int64, kind, name string) (Category, error) {
	var item Category
	err := s.pool.QueryRow(ctx, `
		SELECT id, name, kind, position FROM categories
		WHERE user_id = $1 AND kind = $2 AND lower(name) = lower($3)`,
		userID, kind, name).Scan(&item.ID, &item.Name, &item.Kind, &item.Position)
	return item, err
}

func cleanLabel(raw string, max int) (string, error) {
	label := strings.Join(strings.Fields(raw), " ")
	if len([]rune(label)) > max {
		return "", ErrBadMoney
	}
	return label, nil
}

func (s *Store) ExportBundle(ctx context.Context, userID int64, today time.Time) (map[string]any, error) {
	habits, err := s.Habits(ctx, userID, today)
	if err != nil {
		return nil, err
	}
	from := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2100, 1, 1, 0, 0, 0, 0, time.UTC)
	month, err := s.Month(ctx, userID, from, to)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"habits":    habits,
		"movements": month.Movements,
		"accounts":  month.Accounts,
	}, nil
}

func mondayOf(day time.Time) time.Time {
	day = time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, day.Location())
	delta := (int(day.Weekday()) + 6) % 7
	return day.AddDate(0, 0, -delta)
}

func checksInWeek(days []string, start time.Time) []string {
	end := start.AddDate(0, 0, 7)
	var out []string
	for _, day := range days {
		parsed, err := time.ParseInLocation("2006-01-02", day, start.Location())
		if err != nil {
			continue
		}
		if !parsed.Before(start) && parsed.Before(end) {
			out = append(out, day)
		}
	}
	if out == nil {
		out = []string{}
	}
	return out
}

// StreakWeeks cuenta semanas seguidas con al menos nGoal checks.
// La semana en curso no rompe la racha hasta el domingo.
func StreakWeeks(days []string, nGoal int, today time.Time) int {
	set := map[string]bool{}
	for _, day := range days {
		set[day] = true
	}
	today = time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, today.Location())
	start := mondayOf(today)
	count := func(week time.Time) int {
		n := 0
		for i := 0; i < 7; i++ {
			if set[week.AddDate(0, 0, i).Format("2006-01-02")] {
				n++
			}
		}
		return n
	}
	cursor := start
	if count(cursor) < nGoal {
		if today.Weekday() == time.Sunday {
			return 0
		}
		cursor = cursor.AddDate(0, 0, -7)
	}
	streak := 0
	for i := 0; i < 60; i++ {
		if count(cursor) < nGoal {
			break
		}
		streak++
		cursor = cursor.AddDate(0, 0, -7)
	}
	return streak
}
