package store

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"hoy/internal/task"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

var ErrNotFound = errors.New("not found")
var ErrLastList = errors.New("last list")

type List struct {
	ID        int64
	Name      string
	Position  int
	OpenCount int
}

type Subscription struct {
	Endpoint string
	P256dh   string
	Auth     string
}

type DueReminder struct {
	TaskID     int64
	Title      string
	RemindAt   time.Time
	RepeatMask int
}

type Store struct {
	pool *pgxpool.Pool
}

func Connect(ctx context.Context, url string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, err
	}
	cfg.MaxConns = 5
	var last error
	for attempt := 0; attempt < 30; attempt++ {
		pool, err := pgxpool.NewWithConfig(ctx, cfg)
		if err == nil {
			err = pool.Ping(ctx)
		}
		if err == nil {
			return &Store{pool: pool}, nil
		}
		last = err
		if pool != nil {
			pool.Close()
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(time.Second):
		}
	}
	return nil, fmt.Errorf("postgres: %w", last)
}

func (s *Store) Close() { s.pool.Close() }

func (s *Store) Ping(ctx context.Context) error { return s.pool.Ping(ctx) }

func (s *Store) Migrate(ctx context.Context) error {
	if _, err := s.pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY)`); err != nil {
		return err
	}
	names, err := fs.Glob(migrationFS, "migrations/*.sql")
	if err != nil {
		return err
	}
	sort.Strings(names)
	for _, name := range names {
		version := name
		var seen int
		if err := s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM schema_migrations WHERE version = $1`, version).Scan(&seen); err != nil {
			return err
		}
		if seen > 0 {
			continue
		}
		body, err := migrationFS.ReadFile(name)
		if err != nil {
			return err
		}
		tx, err := s.pool.Begin(ctx)
		if err != nil {
			return err
		}
		for _, stmt := range splitSQL(string(body)) {
			if _, err := tx.Exec(ctx, stmt); err != nil {
				_ = tx.Rollback(ctx)
				return fmt.Errorf("%s: %w", name, err)
			}
		}
		if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations (version) VALUES ($1)`, version); err != nil {
			_ = tx.Rollback(ctx)
			return err
		}
		if err := tx.Commit(ctx); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) Lists(ctx context.Context) ([]List, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT l.id, l.name, l.position,
		       COALESCE(COUNT(t.id) FILTER (WHERE t.status = 'open'), 0)::int
		FROM lists l
		LEFT JOIN tasks t ON t.list_id = l.id
		GROUP BY l.id
		ORDER BY l.position, l.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []List
	for rows.Next() {
		var list List
		if err := rows.Scan(&list.ID, &list.Name, &list.Position, &list.OpenCount); err != nil {
			return nil, err
		}
		out = append(out, list)
	}
	return out, rows.Err()
}

func (s *Store) CreateList(ctx context.Context, name string) (List, error) {
	var list List
	err := s.pool.QueryRow(ctx, `
		INSERT INTO lists (name, position)
		VALUES ($1, COALESCE((SELECT MAX(position) + 1 FROM lists), 0))
		RETURNING id, name, position`, name).Scan(&list.ID, &list.Name, &list.Position)
	return list, err
}

func (s *Store) RenameList(ctx context.Context, id int64, name string) (List, error) {
	var list List
	err := s.pool.QueryRow(ctx, `
		UPDATE lists SET name = $2 WHERE id = $1
		RETURNING id, name, position`, id, name).Scan(&list.ID, &list.Name, &list.Position)
	if errors.Is(err, pgx.ErrNoRows) {
		return List{}, ErrNotFound
	}
	return list, err
}

func (s *Store) DeleteList(ctx context.Context, id int64) error {
	var count int
	if err := s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM lists`).Scan(&count); err != nil {
		return err
	}
	if count <= 1 {
		return ErrLastList
	}
	tag, err := s.pool.Exec(ctx, `DELETE FROM lists WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) Tasks(ctx context.Context, doneSince time.Time) ([]task.Task, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, list_id, title, notes, due_at, remind_at, status, pinned, position,
		       repeat_weekdays, completed_at, created_at, updated_at
		FROM tasks
		WHERE status = 'open' OR completed_at >= $1
		ORDER BY position, id`, doneSince)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []task.Task
	for rows.Next() {
		item, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) CreateTask(ctx context.Context, item task.Task) (task.Task, error) {
	row := s.pool.QueryRow(ctx, `
		INSERT INTO tasks (list_id, title, notes, due_at, remind_at, pinned, position, repeat_weekdays)
		VALUES (
			$1, $2, $3, $4, $5, $6,
			COALESCE((SELECT MAX(position) + 1 FROM tasks WHERE list_id = $1), 0),
			$7
		)
		RETURNING id, list_id, title, notes, due_at, remind_at, status, pinned, position,
		          repeat_weekdays, completed_at, created_at, updated_at`,
		item.ListID, item.Title, item.Notes, item.DueAt, item.RemindAt, item.Pinned, item.RepeatMask)
	return scanTask(row)
}

func (s *Store) UpdateTask(ctx context.Context, item task.Task) (task.Task, error) {
	row := s.pool.QueryRow(ctx, `
		UPDATE tasks SET
			list_id = $2,
			title = $3,
			notes = $4,
			due_at = $5,
			remind_at = $6,
			status = $7,
			pinned = $8,
			repeat_weekdays = $9,
			completed_at = $10,
			updated_at = now()
		WHERE id = $1
		RETURNING id, list_id, title, notes, due_at, remind_at, status, pinned, position,
		          repeat_weekdays, completed_at, created_at, updated_at`,
		item.ID, item.ListID, item.Title, item.Notes, item.DueAt, item.RemindAt,
		item.Status, item.Pinned, item.RepeatMask, item.CompletedAt)
	got, err := scanTask(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return task.Task{}, ErrNotFound
	}
	return got, err
}

func (s *Store) DeleteTask(ctx context.Context, id int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM tasks WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) Reorder(ctx context.Context, listID int64, ids []int64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	for i, id := range ids {
		tag, err := tx.Exec(ctx, `UPDATE tasks SET position = $1, updated_at = now() WHERE id = $2 AND list_id = $3`, i, id, listID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
	}
	return tx.Commit(ctx)
}

func (s *Store) SaveSubscription(ctx context.Context, sub Subscription) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO push_subscriptions (endpoint, p256dh, auth_key)
		VALUES ($1, $2, $3)
		ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth_key = EXCLUDED.auth_key`,
		sub.Endpoint, sub.P256dh, sub.Auth)
	return err
}

func (s *Store) DeleteSubscription(ctx context.Context, endpoint string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM push_subscriptions WHERE endpoint = $1`, endpoint)
	return err
}

func (s *Store) Subscriptions(ctx context.Context) ([]Subscription, error) {
	rows, err := s.pool.Query(ctx, `SELECT endpoint, p256dh, auth_key FROM push_subscriptions ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Subscription
	for rows.Next() {
		var sub Subscription
		if err := rows.Scan(&sub.Endpoint, &sub.P256dh, &sub.Auth); err != nil {
			return nil, err
		}
		out = append(out, sub)
	}
	return out, rows.Err()
}

func (s *Store) DueReminders(ctx context.Context, limit int) ([]DueReminder, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, title, remind_at, repeat_weekdays
		FROM tasks
		WHERE status = 'open'
		  AND remind_at IS NOT NULL
		  AND remind_at <= now()
		  AND NOT EXISTS (
		    SELECT 1 FROM reminder_log l
		    WHERE l.task_id = tasks.id AND l.remind_at = tasks.remind_at
		  )
		ORDER BY remind_at
		LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DueReminder
	for rows.Next() {
		var item DueReminder
		var mask int16
		if err := rows.Scan(&item.TaskID, &item.Title, &item.RemindAt, &mask); err != nil {
			return nil, err
		}
		item.RepeatMask = int(mask)
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) ClaimReminder(ctx context.Context, taskID int64, remindAt time.Time, next *time.Time) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	tag, err := tx.Exec(ctx, `
		INSERT INTO reminder_log (task_id, remind_at) VALUES ($1, $2)
		ON CONFLICT DO NOTHING`, taskID, remindAt)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return nil
	}
	if next != nil {
		if _, err := tx.Exec(ctx, `UPDATE tasks SET remind_at = $2, updated_at = now() WHERE id = $1 AND remind_at = $3`, taskID, *next, remindAt); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *Store) ReleaseReminder(ctx context.Context, taskID int64, remindAt time.Time) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM reminder_log WHERE task_id = $1 AND remind_at = $2`, taskID, remindAt)
	return err
}

type scanner interface {
	Scan(dest ...any) error
}

func scanTask(row scanner) (task.Task, error) {
	var item task.Task
	var mask int16
	err := row.Scan(
		&item.ID, &item.ListID, &item.Title, &item.Notes, &item.DueAt, &item.RemindAt,
		&item.Status, &item.Pinned, &item.Position, &mask, &item.CompletedAt,
		&item.CreatedAt, &item.UpdatedAt,
	)
	item.RepeatMask = int(mask)
	return item, err
}

func splitSQL(body string) []string {
	var out []string
	var b strings.Builder
	for _, line := range strings.Split(body, "\n") {
		trim := strings.TrimSpace(line)
		if strings.HasPrefix(trim, "--") {
			continue
		}
		b.WriteString(line)
		b.WriteByte('\n')
		if strings.HasSuffix(trim, ";") {
			stmt := strings.TrimSpace(b.String())
			stmt = strings.TrimSuffix(stmt, ";")
			stmt = strings.TrimSpace(stmt)
			if stmt != "" {
				out = append(out, stmt)
			}
			b.Reset()
		}
	}
	return out
}
