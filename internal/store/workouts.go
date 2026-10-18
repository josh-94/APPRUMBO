package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type WorkoutExercise struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Position int    `json:"position"`
}

type WorkoutRoutine struct {
	ID        int64             `json:"id"`
	Name      string            `json:"name"`
	Exercises []WorkoutExercise `json:"exercises"`
}

type WorkoutSet struct {
	ID           int64  `json:"id"`
	ExerciseName string `json:"exerciseName"`
	Reps         int    `json:"reps"`
	WeightGrams  int    `json:"weightGrams"`
	Position     int    `json:"position"`
}

type WorkoutSession struct {
	ID          int64        `json:"id"`
	RoutineID   int64        `json:"routineId,omitempty"`
	RoutineName string       `json:"routineName,omitempty"`
	OccurredOn  string       `json:"occurredOn"`
	Note        string       `json:"note"`
	DurationMin int          `json:"durationMin"`
	Sets        []WorkoutSet `json:"sets"`
}

type WorkoutRecord struct {
	ExerciseName string `json:"exerciseName"`
	WeightGrams  int    `json:"weightGrams"`
	Reps         int    `json:"reps"`
	OccurredOn   string `json:"occurredOn"`
}

func (s *Store) WorkoutRoutines(ctx context.Context, userID int64) ([]WorkoutRoutine, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, name FROM workout_routines
		WHERE user_id = $1 AND active ORDER BY id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []WorkoutRoutine{}
	for rows.Next() {
		var item WorkoutRoutine
		if err := rows.Scan(&item.ID, &item.Name); err != nil {
			return nil, err
		}
		item.Exercises = []WorkoutExercise{}
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range out {
		ex, err := s.workoutExercises(ctx, out[i].ID)
		if err != nil {
			return nil, err
		}
		out[i].Exercises = ex
	}
	return out, nil
}

func (s *Store) workoutExercises(ctx context.Context, routineID int64) ([]WorkoutExercise, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, name, position FROM workout_exercises
		WHERE routine_id = $1 ORDER BY position, id`, routineID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []WorkoutExercise{}
	for rows.Next() {
		var item WorkoutExercise
		if err := rows.Scan(&item.ID, &item.Name, &item.Position); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) SaveWorkoutRoutine(ctx context.Context, userID int64, item WorkoutRoutine) (WorkoutRoutine, error) {
	name, err := cleanLabel(item.Name, 80)
	if err != nil || name == "" {
		return WorkoutRoutine{}, ErrBadMoney
	}
	item.Name = name
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return WorkoutRoutine{}, err
	}
	defer tx.Rollback(ctx)
	if item.ID == 0 {
		err = tx.QueryRow(ctx, `
			INSERT INTO workout_routines (user_id, name) VALUES ($1, $2) RETURNING id`,
			userID, item.Name).Scan(&item.ID)
	} else {
		tag, err := tx.Exec(ctx, `
			UPDATE workout_routines SET name = $3
			WHERE id = $1 AND user_id = $2 AND active`, item.ID, userID, item.Name)
		if err != nil {
			return WorkoutRoutine{}, err
		}
		if tag.RowsAffected() == 0 {
			return WorkoutRoutine{}, ErrNotFound
		}
		if _, err = tx.Exec(ctx, `DELETE FROM workout_exercises WHERE routine_id = $1`, item.ID); err != nil {
			return WorkoutRoutine{}, err
		}
	}
	if err != nil {
		return WorkoutRoutine{}, err
	}
	exercises := []WorkoutExercise{}
	for i, ex := range item.Exercises {
		label, err := cleanLabel(ex.Name, 80)
		if err != nil || label == "" {
			continue
		}
		var id int64
		err = tx.QueryRow(ctx, `
			INSERT INTO workout_exercises (routine_id, name, position) VALUES ($1, $2, $3) RETURNING id`,
			item.ID, label, i).Scan(&id)
		if err != nil {
			return WorkoutRoutine{}, err
		}
		exercises = append(exercises, WorkoutExercise{ID: id, Name: label, Position: i})
	}
	if err = tx.Commit(ctx); err != nil {
		return WorkoutRoutine{}, err
	}
	item.Exercises = exercises
	return item, nil
}

func (s *Store) DeleteWorkoutRoutine(ctx context.Context, userID, id int64) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE workout_routines SET active = FALSE
		WHERE id = $1 AND user_id = $2 AND active`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) WorkoutSessions(ctx context.Context, userID int64, from, to time.Time) ([]WorkoutSession, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT s.id, COALESCE(s.routine_id, 0), COALESCE(r.name, ''),
		       to_char(s.occurred_on, 'YYYY-MM-DD'), s.note, s.duration_min
		FROM workout_sessions s
		LEFT JOIN workout_routines r ON r.id = s.routine_id
		WHERE s.user_id = $1 AND s.occurred_on >= $2 AND s.occurred_on < $3
		ORDER BY s.occurred_on DESC, s.id DESC`, userID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []WorkoutSession{}
	for rows.Next() {
		var item WorkoutSession
		if err := rows.Scan(&item.ID, &item.RoutineID, &item.RoutineName, &item.OccurredOn, &item.Note, &item.DurationMin); err != nil {
			return nil, err
		}
		item.Sets = []WorkoutSet{}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) AddWorkoutSession(ctx context.Context, userID int64, item WorkoutSession, day time.Time) (WorkoutSession, error) {
	note, err := cleanLabel(item.Note, 80)
	if err != nil {
		return WorkoutSession{}, err
	}
	item.Note = note
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return WorkoutSession{}, err
	}
	defer tx.Rollback(ctx)
	if item.RoutineID != 0 {
		var owner int64
		err = tx.QueryRow(ctx, `SELECT user_id FROM workout_routines WHERE id = $1 AND active`, item.RoutineID).Scan(&owner)
		if errors.Is(err, pgx.ErrNoRows) || owner != userID {
			return WorkoutSession{}, ErrNotFound
		}
		if err != nil {
			return WorkoutSession{}, err
		}
	}
	err = tx.QueryRow(ctx, `
		INSERT INTO workout_sessions (user_id, routine_id, occurred_on, note, duration_min)
		VALUES ($1, NULLIF($2, 0), $3, $4, $5) RETURNING id`,
		userID, item.RoutineID, day, item.Note, item.DurationMin).Scan(&item.ID)
	if err != nil {
		return WorkoutSession{}, err
	}
	sets := []WorkoutSet{}
	for i, set := range item.Sets {
		label, err := cleanLabel(set.ExerciseName, 80)
		if err != nil || label == "" {
			continue
		}
		var id int64
		err = tx.QueryRow(ctx, `
			INSERT INTO workout_sets (session_id, exercise_name, reps, weight_grams, position)
			VALUES ($1, $2, $3, $4, $5) RETURNING id`,
			item.ID, label, set.Reps, set.WeightGrams, i).Scan(&id)
		if err != nil {
			return WorkoutSession{}, err
		}
		sets = append(sets, WorkoutSet{ID: id, ExerciseName: label, Reps: set.Reps, WeightGrams: set.WeightGrams, Position: i})
	}
	if err = tx.Commit(ctx); err != nil {
		return WorkoutSession{}, err
	}
	item.OccurredOn = day.Format("2006-01-02")
	item.Sets = sets
	return item, nil
}

func (s *Store) WorkoutRecords(ctx context.Context, userID int64) ([]WorkoutRecord, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT DISTINCT ON (ws.exercise_name)
			ws.exercise_name, ws.weight_grams, ws.reps, to_char(s.occurred_on, 'YYYY-MM-DD')
		FROM workout_sets ws
		JOIN workout_sessions s ON s.id = ws.session_id
		WHERE s.user_id = $1 AND ws.weight_grams > 0
		ORDER BY ws.exercise_name, ws.weight_grams DESC, s.occurred_on DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []WorkoutRecord{}
	for rows.Next() {
		var item WorkoutRecord
		if err := rows.Scan(&item.ExerciseName, &item.WeightGrams, &item.Reps, &item.OccurredOn); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func defaultHomeCards() []string {
	return []string{"agenda", "habits", "goals", "workouts"}
}

func (s *Store) HomePrefs(ctx context.Context, userID int64) ([]string, error) {
	var raw []byte
	err := s.pool.QueryRow(ctx, `SELECT cards FROM home_prefs WHERE user_id = $1`, userID).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return defaultHomeCards(), nil
	}
	if err != nil {
		return nil, err
	}
	cards := []string{}
	if err := json.Unmarshal(raw, &cards); err != nil || len(cards) == 0 {
		return defaultHomeCards(), nil
	}
	return filterHomeCards(cards), nil
}

func filterHomeCards(cards []string) []string {
	allowed := map[string]bool{"agenda": true, "habits": true, "goals": true, "workouts": true}
	clean := []string{}
	seen := map[string]bool{}
	for _, card := range cards {
		if !allowed[card] || seen[card] {
			continue
		}
		seen[card] = true
		clean = append(clean, card)
	}
	if len(clean) == 0 {
		return defaultHomeCards()
	}
	return clean
}

func (s *Store) SaveHomePrefs(ctx context.Context, userID int64, cards []string) error {
	clean := filterHomeCards(cards)
	payload, err := json.Marshal(clean)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx, `
		INSERT INTO home_prefs (user_id, cards, updated_at) VALUES ($1, $2::jsonb, now())
		ON CONFLICT (user_id) DO UPDATE SET cards = EXCLUDED.cards, updated_at = now()`,
		userID, payload)
	return err
}
