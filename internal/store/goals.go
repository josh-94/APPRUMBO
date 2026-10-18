package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type Goal struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Kind        string `json:"kind"`
	TargetCents int64  `json:"targetCents"`
	SavedCents  int64  `json:"savedCents"`
	Deadline    string `json:"deadline,omitempty"`
	AccountID   int64  `json:"accountId,omitempty"`
	Pct         int    `json:"pct"`
	DaysLeft    *int   `json:"daysLeft,omitempty"`
}

func (s *Store) Goals(ctx context.Context, userID int64, today time.Time) ([]Goal, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, name, kind, target_cents, saved_cents,
		       COALESCE(to_char(deadline, 'YYYY-MM-DD'), ''), COALESCE(account_id, 0)
		FROM goals WHERE user_id = $1 AND active
		ORDER BY id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Goal{}
	for rows.Next() {
		var item Goal
		var deadline string
		if err := rows.Scan(&item.ID, &item.Name, &item.Kind, &item.TargetCents, &item.SavedCents, &deadline, &item.AccountID); err != nil {
			return nil, err
		}
		item.Deadline = deadline
		item.Pct = goalPct(item.SavedCents, item.TargetCents)
		if deadline != "" {
			if d, err := time.ParseInLocation("2006-01-02", deadline, today.Location()); err == nil {
				left := int(d.Sub(today.Truncate(24*time.Hour)).Hours() / 24)
				item.DaysLeft = &left
			}
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func goalPct(saved, target int64) int {
	if target <= 0 {
		return 0
	}
	pct := int((saved * 100) / target)
	if pct > 100 {
		return 100
	}
	if pct < 0 {
		return 0
	}
	return pct
}

func (s *Store) SaveGoal(ctx context.Context, userID int64, item Goal) (Goal, error) {
	name, err := cleanLabel(item.Name, 80)
	if err != nil || name == "" {
		return Goal{}, ErrBadMoney
	}
	if item.TargetCents <= 0 {
		return Goal{}, ErrBadMoney
	}
	if item.Kind == "" {
		item.Kind = "ahorro"
	}
	if item.Kind != "ahorro" && item.Kind != "numero" && item.Kind != "etapas" {
		return Goal{}, ErrBadMoney
	}
	item.Name = name
	var deadline any
	if item.Deadline != "" {
		d, err := time.Parse("2006-01-02", item.Deadline)
		if err != nil {
			return Goal{}, ErrBadMoney
		}
		deadline = d
	}
	if item.ID == 0 {
		err = s.pool.QueryRow(ctx, `
			INSERT INTO goals (user_id, name, kind, target_cents, saved_cents, deadline, account_id)
			VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, 0))
			RETURNING id`,
			userID, item.Name, item.Kind, item.TargetCents, item.SavedCents, deadline, item.AccountID).Scan(&item.ID)
	} else {
		tag, err := s.pool.Exec(ctx, `
			UPDATE goals SET name = $3, kind = $4, target_cents = $5, deadline = $6, account_id = NULLIF($7, 0)
			WHERE id = $1 AND user_id = $2 AND active`,
			item.ID, userID, item.Name, item.Kind, item.TargetCents, deadline, item.AccountID)
		if err != nil {
			return Goal{}, err
		}
		if tag.RowsAffected() == 0 {
			return Goal{}, ErrNotFound
		}
		err = s.pool.QueryRow(ctx, `SELECT saved_cents FROM goals WHERE id = $1`, item.ID).Scan(&item.SavedCents)
		if err != nil {
			return Goal{}, err
		}
	}
	if err != nil {
		return Goal{}, err
	}
	item.Pct = goalPct(item.SavedCents, item.TargetCents)
	return item, nil
}

func (s *Store) DeleteGoal(ctx context.Context, userID, id int64) error {
	tag, err := s.pool.Exec(ctx, `UPDATE goals SET active = FALSE WHERE id = $1 AND user_id = $2 AND active`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) ContributeGoal(ctx context.Context, userID, goalID, accountID, amountCents int64, day time.Time, note string) (Goal, error) {
	if amountCents <= 0 {
		return Goal{}, ErrBadMoney
	}
	note, err := cleanLabel(note, 80)
	if err != nil {
		return Goal{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Goal{}, err
	}
	defer tx.Rollback(ctx)
	var item Goal
	var deadline *time.Time
	err = tx.QueryRow(ctx, `
		SELECT id, name, kind, target_cents, saved_cents, deadline, COALESCE(account_id, 0)
		FROM goals WHERE id = $1 AND user_id = $2 AND active FOR UPDATE`,
		goalID, userID).Scan(&item.ID, &item.Name, &item.Kind, &item.TargetCents, &item.SavedCents, &deadline, &item.AccountID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Goal{}, ErrNotFound
	}
	if err != nil {
		return Goal{}, err
	}
	if accountID == 0 {
		accountID = item.AccountID
	}
	if accountID != 0 {
		var owner int64
		err = tx.QueryRow(ctx, `SELECT user_id FROM accounts WHERE id = $1`, accountID).Scan(&owner)
		if errors.Is(err, pgx.ErrNoRows) || owner != userID {
			return Goal{}, ErrNotFound
		}
		if err != nil {
			return Goal{}, err
		}
	}
	item.SavedCents += amountCents
	if _, err = tx.Exec(ctx, `UPDATE goals SET saved_cents = $2 WHERE id = $1`, goalID, item.SavedCents); err != nil {
		return Goal{}, err
	}
	if _, err = tx.Exec(ctx, `
		INSERT INTO goal_moves (user_id, goal_id, account_id, amount_cents, occurred_on, note)
		VALUES ($1, $2, NULLIF($3, 0), $4, $5, $6)`,
		userID, goalID, accountID, amountCents, day, note); err != nil {
		return Goal{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Goal{}, err
	}
	if deadline != nil {
		item.Deadline = deadline.Format("2006-01-02")
	}
	item.Pct = goalPct(item.SavedCents, item.TargetCents)
	return item, nil
}
