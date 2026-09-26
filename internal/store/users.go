package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var ErrEmailTaken = errors.New("email taken")

func (s *Store) Register(ctx context.Context, email, passwordHash string) (int64, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var id int64
	err = tx.QueryRow(ctx, `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id`, email, passwordHash).Scan(&id)
	if isUnique(err) {
		return 0, ErrEmailTaken
	}
	if err != nil {
		return 0, err
	}
	if err := seedLists(ctx, tx, id); err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return id, nil
}

func (s *Store) UserByEmail(ctx context.Context, email string) (int64, *string, error) {
	var id int64
	var hash *string
	err := s.pool.QueryRow(ctx, `SELECT id, password_hash FROM users WHERE email = $1`, email).Scan(&id, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil, ErrNotFound
	}
	return id, hash, err
}

func (s *Store) UpsertGoogleUser(ctx context.Context, email, subject string) (int64, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var id int64
	err = tx.QueryRow(ctx, `SELECT user_id FROM user_identities WHERE provider = 'google' AND subject = $1`, subject).Scan(&id)
	if err == nil {
		if err := tx.Commit(ctx); err != nil {
			return 0, err
		}
		return id, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}

	err = tx.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&id)
	if err == nil {
		if _, err := tx.Exec(ctx, `INSERT INTO user_identities (user_id, provider, subject) VALUES ($1, 'google', $2)`, id, subject); err != nil && !isUnique(err) {
			return 0, err
		}
		if err := tx.Commit(ctx); err != nil {
			return 0, err
		}
		return id, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}

	err = tx.QueryRow(ctx, `INSERT INTO users (email) VALUES ($1) RETURNING id`, email).Scan(&id)
	if isUnique(err) {
		return 0, ErrEmailTaken
	}
	if err != nil {
		return 0, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO user_identities (user_id, provider, subject) VALUES ($1, 'google', $2)`, id, subject); err != nil {
		return 0, err
	}
	if err := seedLists(ctx, tx, id); err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return id, nil
}

func seedLists(ctx context.Context, tx pgx.Tx, userID int64) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO lists (name, position, user_id) VALUES
		('Personal', 0, $1),
		('Trabajo', 1, $1),
		('Recados', 2, $1)`, userID)
	return err
}

func isUnique(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
