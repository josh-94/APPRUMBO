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

type HabitCheck struct {
	Day   string `json:"day"`
	Count int    `json:"count"`
}

type Habit struct {
	ID           int64        `json:"id"`
	Name         string       `json:"name"`
	NGoal        int          `json:"nGoal"`
	Icon         string       `json:"icon"`
	Category     string       `json:"category"`
	DailyGoal    int          `json:"dailyGoal"`
	DoneToday    int          `json:"doneToday"`
	DoneThisWeek int          `json:"doneThisWeek"`
	StreakWeeks  int          `json:"streakWeeks"`
	StreakDays   int          `json:"streakDays"`
	Checks       []HabitCheck `json:"checks"`
}

type HabitInput struct {
	Name      string
	NGoal     int
	Icon      string
	Category  string
	DailyGoal int
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
	Icon     string `json:"icon"`
	Tint     string `json:"tint"`
}

type Movement struct {
	ID          int64  `json:"id"`
	AccountID   int64  `json:"accountId"`
	DebtID      int64  `json:"debtId"`
	CategoryID  int64  `json:"categoryId"`
	Kind        string `json:"kind"`
	Currency    string `json:"currency"`
	AmountCents int64  `json:"amountCents"`
	OccurredOn  string `json:"occurredOn"`
	AccountName string `json:"accountName"`
	Category    string `json:"category"`
	Note        string `json:"note"`
}

type MoneyCard struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Currency string `json:"currency"`
}

type MonthSummary struct {
	SpentCents   int64
	IncomeCents  int64
	FxHundredths int
	Currency     string
	Accounts     []Account
	Cards        []MoneyCard
	Categories   []Category
	Movements    []Movement
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
		SELECT id, name, n_goal, icon, category, daily_goal FROM habits
		WHERE user_id = $1 AND active
		ORDER BY id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var habits []Habit
	for rows.Next() {
		var h Habit
		if err := rows.Scan(&h.ID, &h.Name, &h.NGoal, &h.Icon, &h.Category, &h.DailyGoal); err != nil {
			return nil, err
		}
		if h.Icon == "" {
			h.Icon = "✨"
		}
		if h.Category == "" {
			h.Category = "general"
		}
		if h.DailyGoal < 1 {
			h.DailyGoal = 1
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
	todayKey := today.Format("2006-01-02")
	for i := range habits {
		checks, err := s.habitChecks(ctx, habits[i].ID, start.AddDate(0, 0, -370))
		if err != nil {
			return nil, err
		}
		habits[i].Checks = checks
		doneDays := completedDays(checks, habits[i].DailyGoal)
		habits[i].DoneThisWeek = len(checksInWeek(doneDays, start))
		habits[i].DoneToday = countOnDay(checks, todayKey)
		habits[i].StreakWeeks = StreakWeeks(doneDays, habits[i].NGoal, today)
		habits[i].StreakDays = StreakDays(doneDays, today)
	}
	return habits, nil
}

func (s *Store) habitChecks(ctx context.Context, habitID int64, since time.Time) ([]HabitCheck, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT to_char(day, 'YYYY-MM-DD'), count FROM habit_checks
		WHERE habit_id = $1 AND day >= $2
		ORDER BY day`, habitID, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var checks []HabitCheck
	for rows.Next() {
		var c HabitCheck
		if err := rows.Scan(&c.Day, &c.Count); err != nil {
			return nil, err
		}
		checks = append(checks, c)
	}
	if checks == nil {
		checks = []HabitCheck{}
	}
	return checks, rows.Err()
}

func normalizeHabitInput(in HabitInput) (HabitInput, error) {
	label, err := cleanLabel(in.Name, 80)
	if err != nil || label == "" {
		return HabitInput{}, ErrBadMoney
	}
	in.Name = label
	if in.NGoal < 1 || in.NGoal > 7 {
		in.NGoal = 5
	}
	if in.DailyGoal < 1 || in.DailyGoal > 99 {
		in.DailyGoal = 1
	}
	icon := strings.TrimSpace(in.Icon)
	if icon == "" {
		icon = "✨"
	}
	runes := []rune(icon)
	if len(runes) > 8 {
		icon = string(runes[:8])
	}
	in.Icon = icon
	switch strings.ToLower(strings.TrimSpace(in.Category)) {
	case "estudios", "finanzas", "salud", "general":
		in.Category = strings.ToLower(strings.TrimSpace(in.Category))
	case "":
		in.Category = "general"
	default:
		return HabitInput{}, ErrBadMoney
	}
	return in, nil
}

func (s *Store) CreateHabit(ctx context.Context, userID int64, in HabitInput) (int64, error) {
	in, err := normalizeHabitInput(in)
	if err != nil {
		return 0, err
	}
	var count int
	if err := s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM habits WHERE user_id = $1 AND active`, userID).Scan(&count); err != nil {
		return 0, err
	}
	if count >= 7 {
		return 0, ErrHabitLimit
	}
	var id int64
	err = s.pool.QueryRow(ctx, `
		INSERT INTO habits (user_id, name, n_goal, icon, category, daily_goal)
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
		userID, in.Name, in.NGoal, in.Icon, in.Category, in.DailyGoal).Scan(&id)
	return id, err
}

func (s *Store) SetHabitCheckCount(ctx context.Context, userID, habitID int64, day time.Time, count int) error {
	var owner int64
	var dailyGoal int
	err := s.pool.QueryRow(ctx, `
		SELECT user_id, daily_goal FROM habits WHERE id = $1 AND active`, habitID).Scan(&owner, &dailyGoal)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && owner != userID) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if dailyGoal < 1 {
		dailyGoal = 1
	}
	if count <= 0 {
		_, err = s.pool.Exec(ctx, `DELETE FROM habit_checks WHERE habit_id = $1 AND day = $2`, habitID, day)
		return err
	}
	if count > dailyGoal {
		count = dailyGoal
	}
	_, err = s.pool.Exec(ctx, `
		INSERT INTO habit_checks (habit_id, day, count) VALUES ($1, $2, $3)
		ON CONFLICT (habit_id, day) DO UPDATE SET count = EXCLUDED.count`, habitID, day, count)
	return err
}

func (s *Store) SetHabitCheck(ctx context.Context, userID, habitID int64, day time.Time, on bool) error {
	if !on {
		return s.SetHabitCheckCount(ctx, userID, habitID, day, 0)
	}
	var dailyGoal int
	err := s.pool.QueryRow(ctx, `
		SELECT daily_goal FROM habits WHERE id = $1 AND user_id = $2 AND active`, habitID, userID).Scan(&dailyGoal)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if dailyGoal < 1 {
		dailyGoal = 1
	}
	return s.SetHabitCheckCount(ctx, userID, habitID, day, dailyGoal)
}

func (s *Store) UpdateHabit(ctx context.Context, userID, id int64, in HabitInput) error {
	in, err := normalizeHabitInput(in)
	if err != nil {
		return err
	}
	tag, err := s.pool.Exec(ctx, `
		UPDATE habits SET name = $3, n_goal = $4, icon = $5, category = $6, daily_goal = $7
		WHERE id = $1 AND user_id = $2 AND active`,
		id, userID, in.Name, in.NGoal, in.Icon, in.Category, in.DailyGoal)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) DeleteHabit(ctx context.Context, userID, id int64) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE habits SET active = FALSE
		WHERE id = $1 AND user_id = $2 AND active`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) Month(ctx context.Context, userID int64, from, to time.Time) (MonthSummary, error) {
	var summary MonthSummary
	summary.FxHundredths = DefaultFxHundredths
	summary.Currency = "PEN"
	summary.Accounts = []Account{}
	summary.Cards = []MoneyCard{}
	summary.Categories = []Category{}
	summary.Movements = []Movement{}
	_ = s.pool.QueryRow(ctx, `
		SELECT fx_hundredths, currency FROM money_settings WHERE user_id = $1`, userID).Scan(&summary.FxHundredths, &summary.Currency)
	if summary.FxHundredths <= 0 {
		summary.FxHundredths = DefaultFxHundredths
	}
	if summary.Currency == "" {
		summary.Currency = "PEN"
	}
	if err := s.pool.QueryRow(ctx, `
		SELECT
			COALESCE(SUM(
				CASE WHEN currency = 'usd' THEN amount_cents * $4 / 100 ELSE amount_cents END
			) FILTER (WHERE kind = 'gasto'), 0),
			COALESCE(SUM(
				CASE WHEN currency = 'usd' THEN amount_cents * $4 / 100 ELSE amount_cents END
			) FILTER (WHERE kind = 'ingreso'), 0)
		FROM movements
		WHERE user_id = $1 AND occurred_on >= $2 AND occurred_on < $3`,
		userID, from, to, summary.FxHundredths).Scan(&summary.SpentCents, &summary.IncomeCents); err != nil {
		return summary, err
	}
	accounts, err := s.accounts(ctx, userID)
	if err != nil {
		return summary, err
	}
	cards, err := s.moneyCards(ctx, userID)
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
	summary.Cards = cards
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

func (s *Store) moneyCards(ctx context.Context, userID int64) ([]MoneyCard, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, name, currency FROM debts
		WHERE user_id = $1 AND kind = 'tarjeta'
		ORDER BY due_day, id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MoneyCard{}
	for rows.Next() {
		var item MoneyCard
		if err := rows.Scan(&item.ID, &item.Name, &item.Currency); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) Categories(ctx context.Context, userID int64) ([]Category, error) {
	return s.categories(ctx, userID)
}

func (s *Store) categories(ctx context.Context, userID int64) ([]Category, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, name, kind, position, icon, tint FROM categories
		WHERE user_id = $1 ORDER BY position, id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Category
	for rows.Next() {
		var item Category
		if err := rows.Scan(&item.ID, &item.Name, &item.Kind, &item.Position, &item.Icon, &item.Tint); err != nil {
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
		SELECT m.id, COALESCE(m.account_id, 0), COALESCE(m.debt_id, 0), COALESCE(m.category_id, 0), m.kind, m.currency, m.amount_cents,
		       to_char(m.occurred_on, 'YYYY-MM-DD'),
		       COALESCE(a.name, d.name, ''), COALESCE(c.name, ''), COALESCE(m.note, '')
		FROM movements m
		LEFT JOIN accounts a ON a.id = m.account_id
		LEFT JOIN debts d ON d.id = m.debt_id
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
		if err := rows.Scan(&item.ID, &item.AccountID, &item.DebtID, &item.CategoryID, &item.Kind, &item.Currency, &item.AmountCents, &item.OccurredOn, &item.AccountName, &item.Category, &item.Note); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	if out == nil {
		out = []Movement{}
	}
	return out, rows.Err()
}

func normalizeMoveCurrency(raw string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", "pen", "sol", "soles":
		return "pen", nil
	case "usd", "dolar", "dólar", "dolares", "dólares", "$":
		return "usd", nil
	default:
		return "", ErrBadMoney
	}
}

func (s *Store) CreateMovement(ctx context.Context, userID int64, item Movement, day time.Time) (Movement, error) {
	if item.AmountCents <= 0 || (item.Kind != "gasto" && item.Kind != "ingreso") {
		return Movement{}, ErrBadMoney
	}
	currency, err := normalizeMoveCurrency(item.Currency)
	if err != nil {
		return Movement{}, err
	}
	item.Currency = currency
	if item.DebtID != 0 && item.Kind != "gasto" {
		return Movement{}, ErrBadMoney
	}
	if (item.AccountID == 0) == (item.DebtID == 0) {
		return Movement{}, ErrBadMoney
	}
	note, err := cleanLabel(item.Note, 80)
	if err != nil {
		return Movement{}, err
	}
	item.Note = note
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Movement{}, err
	}
	defer tx.Rollback(ctx)
	sourceName, err := s.lockMovementSource(ctx, tx, userID, &item)
	if err != nil {
		return Movement{}, err
	}
	if item.CategoryID != 0 {
		var catOwner int64
		var kind string
		if err := tx.QueryRow(ctx, `SELECT user_id, kind FROM categories WHERE id = $1`, item.CategoryID).Scan(&catOwner, &kind); err != nil || catOwner != userID || kind != item.Kind {
			return Movement{}, ErrBadMoney
		}
	}
	err = tx.QueryRow(ctx, `
		INSERT INTO movements (user_id, account_id, debt_id, category_id, kind, currency, amount_cents, occurred_on, note)
		VALUES ($1, NULLIF($2, 0), NULLIF($3, 0), NULLIF($4, 0), $5, $6, $7, $8, $9)
		RETURNING id`,
		userID, item.AccountID, item.DebtID, item.CategoryID, item.Kind, item.Currency, item.AmountCents, day, item.Note).Scan(&item.ID)
	if err != nil {
		return Movement{}, err
	}
	if item.DebtID != 0 {
		if err := applyCardBalance(ctx, tx, userID, item.DebtID, item.Kind, item.Currency, item.AmountCents); err != nil {
			return Movement{}, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return Movement{}, err
	}
	item.OccurredOn = day.Format("2006-01-02")
	item.AccountName = sourceName
	return item, nil
}

func (s *Store) UpdateMovement(ctx context.Context, userID int64, item Movement, day time.Time) (Movement, error) {
	if item.ID == 0 || item.AmountCents <= 0 || (item.Kind != "gasto" && item.Kind != "ingreso") {
		return Movement{}, ErrBadMoney
	}
	currency, err := normalizeMoveCurrency(item.Currency)
	if err != nil {
		return Movement{}, err
	}
	item.Currency = currency
	if item.DebtID != 0 && item.Kind != "gasto" {
		return Movement{}, ErrBadMoney
	}
	if (item.AccountID == 0) == (item.DebtID == 0) {
		return Movement{}, ErrBadMoney
	}
	note, err := cleanLabel(item.Note, 80)
	if err != nil {
		return Movement{}, err
	}
	item.Note = note
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Movement{}, err
	}
	defer tx.Rollback(ctx)
	var prev Movement
	err = tx.QueryRow(ctx, `
		SELECT COALESCE(account_id, 0), COALESCE(debt_id, 0), kind, currency, amount_cents
		FROM movements WHERE id = $1 AND user_id = $2 FOR UPDATE`, item.ID, userID).Scan(&prev.AccountID, &prev.DebtID, &prev.Kind, &prev.Currency, &prev.AmountCents)
	if errors.Is(err, pgx.ErrNoRows) {
		return Movement{}, ErrNotFound
	}
	if err != nil {
		return Movement{}, err
	}
	if prev.DebtID != 0 {
		if err := applyCardBalance(ctx, tx, userID, prev.DebtID, reverseKind(prev.Kind), prev.Currency, prev.AmountCents); err != nil {
			return Movement{}, err
		}
	}
	sourceName, err := s.lockMovementSource(ctx, tx, userID, &item)
	if err != nil {
		return Movement{}, err
	}
	if item.CategoryID != 0 {
		var catOwner int64
		var kind string
		if err := tx.QueryRow(ctx, `SELECT user_id, kind FROM categories WHERE id = $1`, item.CategoryID).Scan(&catOwner, &kind); err != nil || catOwner != userID || kind != item.Kind {
			return Movement{}, ErrBadMoney
		}
	}
	tag, err := tx.Exec(ctx, `
		UPDATE movements
		SET account_id = NULLIF($3, 0), debt_id = NULLIF($4, 0), category_id = NULLIF($5, 0),
			kind = $6, currency = $7, amount_cents = $8, occurred_on = $9, note = $10
		WHERE id = $1 AND user_id = $2`,
		item.ID, userID, item.AccountID, item.DebtID, item.CategoryID, item.Kind, item.Currency, item.AmountCents, day, item.Note)
	if err != nil {
		return Movement{}, err
	}
	if tag.RowsAffected() == 0 {
		return Movement{}, ErrNotFound
	}
	if item.DebtID != 0 {
		if err := applyCardBalance(ctx, tx, userID, item.DebtID, item.Kind, item.Currency, item.AmountCents); err != nil {
			return Movement{}, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return Movement{}, err
	}
	item.OccurredOn = day.Format("2006-01-02")
	item.AccountName = sourceName
	return item, nil
}

func (s *Store) DeleteMovement(ctx context.Context, userID, id int64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var prev Movement
	err = tx.QueryRow(ctx, `
		SELECT COALESCE(debt_id, 0), kind, currency, amount_cents
		FROM movements WHERE id = $1 AND user_id = $2 FOR UPDATE`, id, userID).Scan(&prev.DebtID, &prev.Kind, &prev.Currency, &prev.AmountCents)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if prev.DebtID != 0 {
		if err := applyCardBalance(ctx, tx, userID, prev.DebtID, reverseKind(prev.Kind), prev.Currency, prev.AmountCents); err != nil {
			return err
		}
	}
	tag, err := tx.Exec(ctx, `DELETE FROM movements WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return tx.Commit(ctx)
}

func (s *Store) lockMovementSource(ctx context.Context, tx pgx.Tx, userID int64, item *Movement) (string, error) {
	if item.AccountID != 0 {
		var owner int64
		var name string
		err := tx.QueryRow(ctx, `SELECT user_id, name FROM accounts WHERE id = $1`, item.AccountID).Scan(&owner, &name)
		if errors.Is(err, pgx.ErrNoRows) || owner != userID {
			return "", ErrNotFound
		}
		return name, err
	}
	var owner int64
	var kind, name string
	err := tx.QueryRow(ctx, `SELECT user_id, kind, name FROM debts WHERE id = $1 FOR UPDATE`, item.DebtID).Scan(&owner, &kind, &name)
	if errors.Is(err, pgx.ErrNoRows) || owner != userID || kind != "tarjeta" {
		if err == nil || errors.Is(err, pgx.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", err
	}
	return name, nil
}

func applyCardBalance(ctx context.Context, tx pgx.Tx, userID, debtID int64, kind, currency string, amount int64) error {
	delta := amount
	if kind == "ingreso" {
		delta = -amount
	}
	_, err := tx.Exec(ctx, `
		UPDATE debts SET
			balance_pen = CASE WHEN $4 = 'pen' THEN GREATEST(0, balance_pen + $3) ELSE balance_pen END,
			balance_usd = CASE WHEN $4 = 'usd' THEN GREATEST(0, balance_usd + $3) ELSE balance_usd END
		WHERE id = $1 AND user_id = $2`, debtID, userID, delta, currency)
	return err
}

func reverseKind(kind string) string {
	if kind == "gasto" {
		return "ingreso"
	}
	return "gasto"
}

func (s *Store) CreateCategory(ctx context.Context, userID int64, name, kind, icon, tint string) (Category, error) {
	if kind != "gasto" && kind != "ingreso" {
		return Category{}, ErrBadMoney
	}
	label, err := cleanLabel(name, 40)
	if err != nil || label == "" {
		return Category{}, ErrBadMoney
	}
	icon, tint, err = categoryLook(kind, icon, tint)
	if err != nil {
		return Category{}, err
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
		INSERT INTO categories (user_id, name, kind, position, icon, tint)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, name, kind, position, icon, tint`,
		userID, label, kind, position, icon, tint).Scan(&item.ID, &item.Name, &item.Kind, &item.Position, &item.Icon, &item.Tint)
	if isUnique(err) {
		return s.categoryByName(ctx, userID, kind, label)
	}
	return item, err
}

func (s *Store) categoryByName(ctx context.Context, userID int64, kind, name string) (Category, error) {
	var item Category
	err := s.pool.QueryRow(ctx, `
		SELECT id, name, kind, position, icon, tint FROM categories
		WHERE user_id = $1 AND kind = $2 AND lower(name) = lower($3)`,
		userID, kind, name).Scan(&item.ID, &item.Name, &item.Kind, &item.Position, &item.Icon, &item.Tint)
	return item, err
}

func categoryLook(kind, icon, tint string) (string, string, error) {
	icon = strings.TrimSpace(icon)
	if len([]rune(icon)) > 8 {
		return "", "", ErrBadMoney
	}
	if icon == "" {
		if kind == "ingreso" {
			icon = "💰"
		} else {
			icon = "✨"
		}
	}
	switch tint {
	case "", "bruma", "ciruela", "azul":
		if tint == "" {
			tint = "bruma"
		}
	default:
		return "", "", ErrBadMoney
	}
	return icon, tint, nil
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

func completedDays(checks []HabitCheck, dailyGoal int) []string {
	if dailyGoal < 1 {
		dailyGoal = 1
	}
	var days []string
	for _, c := range checks {
		if c.Count >= dailyGoal {
			days = append(days, c.Day)
		}
	}
	if days == nil {
		days = []string{}
	}
	return days
}

func countOnDay(checks []HabitCheck, day string) int {
	for _, c := range checks {
		if c.Day == day {
			return c.Count
		}
	}
	return 0
}

// StreakDays cuenta días seguidos cumplidos. Si hoy no está hecho, arranca desde ayer.
func StreakDays(days []string, today time.Time) int {
	set := map[string]bool{}
	for _, day := range days {
		set[day] = true
	}
	today = time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, today.Location())
	cursor := today
	if !set[cursor.Format("2006-01-02")] {
		cursor = cursor.AddDate(0, 0, -1)
	}
	streak := 0
	for i := 0; i < 400; i++ {
		if !set[cursor.Format("2006-01-02")] {
			break
		}
		streak++
		cursor = cursor.AddDate(0, 0, -1)
	}
	return streak
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
