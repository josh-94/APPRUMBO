package store

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type GymWeek struct {
	WeekStart string      `json:"weekStart"`
	Weekdays  []int       `json:"weekdays"`
	Logs      []GymLog    `json:"logs"`
	DayMacros []DayMacros `json:"dayMacros"`
}

type GymLog struct {
	Day         string `json:"day"`
	Attended    bool   `json:"attended"`
	AttendedAt  string `json:"attendedAt,omitempty"`
}

type DayMacros struct {
	Day      string  `json:"day"`
	ProteinG float64 `json:"proteinG"`
	CarbsG   float64 `json:"carbsG"`
	FatG     float64 `json:"fatG"`
	Kcal     float64 `json:"kcal"`
}

type Meal struct {
	ID      int64      `json:"id"`
	Day     string     `json:"day"`
	Title   string     `json:"title"`
	EatenAt string     `json:"eatenAt,omitempty"`
	Items   []MealItem `json:"items"`
}

type MealItem struct {
	ID       int64   `json:"id"`
	FoodName string  `json:"foodName"`
	Brand    string  `json:"brand"`
	OffID    string  `json:"offId"`
	Grams    int     `json:"grams"`
	ProteinG float64 `json:"proteinG"`
	CarbsG   float64 `json:"carbsG"`
	FatG     float64 `json:"fatG"`
	Kcal     float64 `json:"kcal"`
}

func WeekStart(day time.Time) time.Time {
	day = time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, day.Location())
	delta := (int(day.Weekday()) + 6) % 7 // Monday = 0
	return day.AddDate(0, 0, -delta)
}

func (s *Store) GymWeek(ctx context.Context, userID int64, weekStart time.Time) (GymWeek, error) {
	weekStart = WeekStart(weekStart)
	end := weekStart.AddDate(0, 0, 7)
	out := GymWeek{
		WeekStart: weekStart.Format("2006-01-02"),
		Weekdays:  []int{},
		Logs:      []GymLog{},
		DayMacros: []DayMacros{},
	}
	rows, err := s.pool.Query(ctx, `
		SELECT weekday FROM gym_week_days
		WHERE user_id = $1 AND week_start = $2
		ORDER BY weekday`, userID, weekStart)
	if err != nil {
		return GymWeek{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var day int
		if err := rows.Scan(&day); err != nil {
			return GymWeek{}, err
		}
		out.Weekdays = append(out.Weekdays, day)
	}
	if err := rows.Err(); err != nil {
		return GymWeek{}, err
	}

	logRows, err := s.pool.Query(ctx, `
		SELECT to_char(day, 'YYYY-MM-DD'), attended,
		       COALESCE(to_char(attended_at, 'HH24:MI'), '')
		FROM gym_logs
		WHERE user_id = $1 AND day >= $2 AND day < $3
		ORDER BY day`, userID, weekStart, end)
	if err != nil {
		return GymWeek{}, err
	}
	defer logRows.Close()
	for logRows.Next() {
		var item GymLog
		if err := logRows.Scan(&item.Day, &item.Attended, &item.AttendedAt); err != nil {
			return GymWeek{}, err
		}
		out.Logs = append(out.Logs, item)
	}
	if err := logRows.Err(); err != nil {
		return GymWeek{}, err
	}

	macroRows, err := s.pool.Query(ctx, `
		SELECT to_char(m.day, 'YYYY-MM-DD'),
		       COALESCE(SUM(i.protein_g), 0),
		       COALESCE(SUM(i.carbs_g), 0),
		       COALESCE(SUM(i.fat_g), 0),
		       COALESCE(SUM(i.kcal), 0)
		FROM meals m
		LEFT JOIN meal_items i ON i.meal_id = m.id
		WHERE m.user_id = $1 AND m.day >= $2 AND m.day < $3
		GROUP BY m.day
		ORDER BY m.day`, userID, weekStart, end)
	if err != nil {
		return GymWeek{}, err
	}
	defer macroRows.Close()
	for macroRows.Next() {
		var item DayMacros
		if err := macroRows.Scan(&item.Day, &item.ProteinG, &item.CarbsG, &item.FatG, &item.Kcal); err != nil {
			return GymWeek{}, err
		}
		out.DayMacros = append(out.DayMacros, item)
	}
	return out, macroRows.Err()
}

func (s *Store) SetGymWeek(ctx context.Context, userID int64, weekStart time.Time, weekdays []int) error {
	weekStart = WeekStart(weekStart)
	seen := map[int]bool{}
	clean := make([]int, 0, len(weekdays))
	for _, day := range weekdays {
		if day < 0 || day > 6 || seen[day] {
			continue
		}
		seen[day] = true
		clean = append(clean, day)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `DELETE FROM gym_week_days WHERE user_id = $1 AND week_start = $2`, userID, weekStart); err != nil {
		return err
	}
	for _, day := range clean {
		if _, err := tx.Exec(ctx, `
			INSERT INTO gym_week_days (user_id, week_start, weekday)
			VALUES ($1, $2, $3)`, userID, weekStart, day); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *Store) SetGymLog(ctx context.Context, userID int64, day time.Time, attended bool, attendedAt string) (GymLog, error) {
	day = time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, day.Location())
	var at *time.Time
	if attended && strings.TrimSpace(attendedAt) != "" {
		parsed, err := time.Parse("15:04", strings.TrimSpace(attendedAt))
		if err != nil {
			return GymLog{}, ErrBadMoney
		}
		value := time.Date(0, 1, 1, parsed.Hour(), parsed.Minute(), 0, 0, time.UTC)
		at = &value
	}
	if !attended {
		at = nil
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO gym_logs (user_id, day, attended, attended_at)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (user_id, day) DO UPDATE
		SET attended = EXCLUDED.attended, attended_at = EXCLUDED.attended_at`,
		userID, day, attended, at)
	if err != nil {
		return GymLog{}, err
	}
	out := GymLog{Day: day.Format("2006-01-02"), Attended: attended}
	if at != nil {
		out.AttendedAt = at.Format("15:04")
	}
	return out, nil
}

func (s *Store) Meals(ctx context.Context, userID int64, day time.Time) ([]Meal, error) {
	day = time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, day.Location())
	rows, err := s.pool.Query(ctx, `
		SELECT id, to_char(day, 'YYYY-MM-DD'), title, COALESCE(to_char(eaten_at, 'HH24:MI'), '')
		FROM meals WHERE user_id = $1 AND day = $2
		ORDER BY id`, userID, day)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Meal{}
	for rows.Next() {
		var item Meal
		if err := rows.Scan(&item.ID, &item.Day, &item.Title, &item.EatenAt); err != nil {
			return nil, err
		}
		item.Items = []MealItem{}
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range out {
		items, err := s.mealItems(ctx, out[i].ID)
		if err != nil {
			return nil, err
		}
		out[i].Items = items
	}
	return out, nil
}

func (s *Store) mealItems(ctx context.Context, mealID int64) ([]MealItem, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, food_name, brand, off_id, grams, protein_g, carbs_g, fat_g, kcal
		FROM meal_items WHERE meal_id = $1 ORDER BY id`, mealID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MealItem{}
	for rows.Next() {
		var item MealItem
		if err := rows.Scan(&item.ID, &item.FoodName, &item.Brand, &item.OffID, &item.Grams, &item.ProteinG, &item.CarbsG, &item.FatG, &item.Kcal); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) CreateMeal(ctx context.Context, userID int64, day time.Time, title, eatenAt string) (Meal, error) {
	label, err := cleanLabel(title, 80)
	if err != nil || label == "" {
		return Meal{}, ErrBadMoney
	}
	day = time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, day.Location())
	var at *time.Time
	if strings.TrimSpace(eatenAt) != "" {
		parsed, err := time.Parse("15:04", strings.TrimSpace(eatenAt))
		if err != nil {
			return Meal{}, ErrBadMoney
		}
		value := time.Date(0, 1, 1, parsed.Hour(), parsed.Minute(), 0, 0, time.UTC)
		at = &value
	}
	var item Meal
	err = s.pool.QueryRow(ctx, `
		INSERT INTO meals (user_id, day, title, eaten_at)
		VALUES ($1, $2, $3, $4)
		RETURNING id`, userID, day, label, at).Scan(&item.ID)
	if err != nil {
		return Meal{}, err
	}
	item.Day = day.Format("2006-01-02")
	item.Title = label
	item.Items = []MealItem{}
	if at != nil {
		item.EatenAt = at.Format("15:04")
	}
	return item, nil
}

func (s *Store) DeleteMeal(ctx context.Context, userID, mealID int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM meals WHERE id = $1 AND user_id = $2`, mealID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) AddMealItem(ctx context.Context, userID, mealID int64, item MealItem) (MealItem, error) {
	var owner int64
	err := s.pool.QueryRow(ctx, `SELECT user_id FROM meals WHERE id = $1`, mealID).Scan(&owner)
	if errors.Is(err, pgx.ErrNoRows) || owner != userID {
		return MealItem{}, ErrNotFound
	}
	if err != nil {
		return MealItem{}, err
	}
	name, err := cleanLabel(item.FoodName, 120)
	if err != nil || name == "" || item.Grams <= 0 {
		return MealItem{}, ErrBadMoney
	}
	brand, _ := cleanLabel(item.Brand, 80)
	if item.ProteinG < 0 || item.CarbsG < 0 || item.FatG < 0 || item.Kcal < 0 {
		return MealItem{}, ErrBadMoney
	}
	item.FoodName = name
	item.Brand = brand
	item.OffID = strings.TrimSpace(item.OffID)
	err = s.pool.QueryRow(ctx, `
		INSERT INTO meal_items (meal_id, food_name, brand, off_id, grams, protein_g, carbs_g, fat_g, kcal)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id`,
		mealID, item.FoodName, item.Brand, item.OffID, item.Grams, item.ProteinG, item.CarbsG, item.FatG, item.Kcal).Scan(&item.ID)
	return item, err
}

func (s *Store) DeleteMealItem(ctx context.Context, userID, mealID, itemID int64) error {
	tag, err := s.pool.Exec(ctx, `
		DELETE FROM meal_items i
		USING meals m
		WHERE i.id = $1 AND i.meal_id = $2 AND m.id = i.meal_id AND m.user_id = $3`,
		itemID, mealID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
