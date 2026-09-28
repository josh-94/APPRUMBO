import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .tasks import Task

MIGRATION_DIR = Path(__file__).parent / "migrations"


class NotFound(Exception):
    pass


class LastList(Exception):
    pass


class EmailTaken(Exception):
    pass


@dataclass
class ListRow:
    id: int
    name: str
    position: int
    open_count: int = 0


@dataclass
class Subscription:
    endpoint: str
    p256dh: str
    auth: str


@dataclass
class DueReminder:
    task_id: int
    user_id: int
    title: str
    remind_at: datetime
    repeat_mask: int


class Store:
    def __init__(self, pool: ConnectionPool) -> None:
        self.pool = pool

    def close(self) -> None:
        self.pool.close()

    def ping(self) -> None:
        with self.pool.connection() as conn:
            conn.execute("SELECT 1")

    def migrate(self) -> None:
        with self.pool.connection() as conn:
            conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY)")
            conn.commit()
            for path in sorted(MIGRATION_DIR.glob("*.sql")):
                version = f"migrations/{path.name}"
                seen = conn.execute(
                    "SELECT COUNT(*) AS n FROM schema_migrations WHERE version = %s",
                    (version,),
                ).fetchone()["n"]
                conn.rollback()
                if seen:
                    continue
                with conn.transaction():
                    for stmt in split_sql(path.read_text(encoding="utf-8")):
                        conn.execute(stmt)
                    conn.execute(
                        "INSERT INTO schema_migrations (version) VALUES (%s)",
                        (version,),
                    )

    def lists(self, user_id: int) -> list[ListRow]:
        with self.pool.connection() as conn:
            rows = conn.execute(
                """
                SELECT l.id, l.name, l.position,
                       COALESCE(COUNT(t.id) FILTER (WHERE t.status = 'open'), 0)::int AS open_count
                FROM lists l
                LEFT JOIN tasks t ON t.list_id = l.id
                WHERE l.user_id = %s
                GROUP BY l.id
                ORDER BY l.position, l.id
                """,
                (user_id,),
            ).fetchall()
        return [ListRow(r["id"], r["name"], r["position"], r["open_count"]) for r in rows]

    def create_list(self, user_id: int, name: str) -> ListRow:
        with self.pool.connection() as conn:
            row = conn.execute(
                """
                INSERT INTO lists (name, position, user_id)
                VALUES (%s, COALESCE((SELECT MAX(position) + 1 FROM lists WHERE user_id = %s), 0), %s)
                RETURNING id, name, position
                """,
                (name, user_id, user_id),
            ).fetchone()
            conn.commit()
        return ListRow(row["id"], row["name"], row["position"])

    def rename_list(self, user_id: int, list_id: int, name: str) -> ListRow:
        with self.pool.connection() as conn:
            row = conn.execute(
                """
                UPDATE lists SET name = %s WHERE id = %s AND user_id = %s
                RETURNING id, name, position
                """,
                (name, list_id, user_id),
            ).fetchone()
            conn.commit()
        if row is None:
            raise NotFound()
        return ListRow(row["id"], row["name"], row["position"])

    def delete_list(self, user_id: int, list_id: int) -> None:
        with self.pool.connection() as conn:
            count = conn.execute("SELECT COUNT(*) AS n FROM lists WHERE user_id = %s", (user_id,)).fetchone()["n"]
            if count <= 1:
                raise LastList()
            cur = conn.execute("DELETE FROM lists WHERE id = %s AND user_id = %s", (list_id, user_id))
            conn.commit()
            if cur.rowcount == 0:
                raise NotFound()

    def tasks(self, user_id: int, done_since: datetime) -> list[Task]:
        with self.pool.connection() as conn:
            rows = conn.execute(
                """
                SELECT t.id, t.list_id, t.title, t.notes, t.due_at, t.remind_at, t.status, t.pinned, t.position,
                       t.repeat_weekdays, t.completed_at, t.created_at, t.updated_at
                FROM tasks t
                JOIN lists l ON l.id = t.list_id
                WHERE l.user_id = %s AND (t.status = 'open' OR t.completed_at >= %s)
                ORDER BY t.position, t.id
                """,
                (user_id, done_since),
            ).fetchall()
        return [_task(row) for row in rows]

    def create_task(self, user_id: int, item: Task) -> Task:
        with self.pool.connection() as conn:
            row = conn.execute(
                """
                INSERT INTO tasks (list_id, title, notes, due_at, remind_at, pinned, position, repeat_weekdays)
                SELECT l.id, %s, %s, %s, %s, %s,
                       COALESCE((SELECT MAX(position) + 1 FROM tasks WHERE list_id = l.id), 0),
                       %s
                FROM lists l
                WHERE l.id = %s AND l.user_id = %s
                RETURNING id, list_id, title, notes, due_at, remind_at, status, pinned, position,
                          repeat_weekdays, completed_at, created_at, updated_at
                """,
                (item.title, item.notes, item.due_at, item.remind_at, item.pinned, item.repeat_mask, item.list_id, user_id),
            ).fetchone()
            conn.commit()
        if row is None:
            raise NotFound()
        return _task(row)

    def update_task(self, user_id: int, item: Task) -> Task:
        with self.pool.connection() as conn:
            row = conn.execute(
                """
                UPDATE tasks SET
                    list_id = %s,
                    title = %s,
                    notes = %s,
                    due_at = %s,
                    remind_at = %s,
                    status = %s,
                    pinned = %s,
                    repeat_weekdays = %s,
                    completed_at = %s,
                    updated_at = now()
                WHERE id = %s
                  AND list_id IN (SELECT id FROM lists WHERE user_id = %s)
                  AND %s IN (SELECT id FROM lists WHERE user_id = %s)
                RETURNING id, list_id, title, notes, due_at, remind_at, status, pinned, position,
                          repeat_weekdays, completed_at, created_at, updated_at
                """,
                (
                    item.list_id, item.title, item.notes, item.due_at, item.remind_at,
                    item.status, item.pinned, item.repeat_mask, item.completed_at,
                    item.id, user_id, item.list_id, user_id,
                ),
            ).fetchone()
            conn.commit()
        if row is None:
            raise NotFound()
        return _task(row)

    def delete_task(self, user_id: int, task_id: int) -> None:
        with self.pool.connection() as conn:
            cur = conn.execute(
                """
                DELETE FROM tasks WHERE id = %s
                AND list_id IN (SELECT id FROM lists WHERE user_id = %s)
                """,
                (task_id, user_id),
            )
            conn.commit()
            if cur.rowcount == 0:
                raise NotFound()

    def reorder(self, user_id: int, list_id: int, ids: list[int]) -> None:
        with self.pool.connection() as conn:
            owner = conn.execute("SELECT user_id FROM lists WHERE id = %s", (list_id,)).fetchone()
            if owner is None or owner["user_id"] != user_id:
                raise NotFound()
            with conn.transaction():
                for index, task_id in enumerate(ids):
                    cur = conn.execute(
                        "UPDATE tasks SET position = %s, updated_at = now() WHERE id = %s AND list_id = %s",
                        (index, task_id, list_id),
                    )
                    if cur.rowcount == 0:
                        raise NotFound()

    def save_subscription(self, user_id: int, sub: Subscription) -> None:
        with self.pool.connection() as conn:
            conn.execute(
                """
                INSERT INTO push_subscriptions (endpoint, p256dh, auth_key, user_id)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (endpoint) DO UPDATE
                SET p256dh = EXCLUDED.p256dh, auth_key = EXCLUDED.auth_key, user_id = EXCLUDED.user_id
                """,
                (sub.endpoint, sub.p256dh, sub.auth, user_id),
            )
            conn.commit()

    def delete_subscription(self, endpoint: str) -> None:
        with self.pool.connection() as conn:
            conn.execute("DELETE FROM push_subscriptions WHERE endpoint = %s", (endpoint,))
            conn.commit()

    def subscriptions(self, user_id: int) -> list[Subscription]:
        with self.pool.connection() as conn:
            rows = conn.execute(
                "SELECT endpoint, p256dh, auth_key FROM push_subscriptions WHERE user_id = %s ORDER BY id",
                (user_id,),
            ).fetchall()
        return [Subscription(r["endpoint"], r["p256dh"], r["auth_key"]) for r in rows]

    def due_reminders(self, limit: int) -> list[DueReminder]:
        with self.pool.connection() as conn:
            rows = conn.execute(
                """
                SELECT tasks.id, lists.user_id, tasks.title, tasks.remind_at, tasks.repeat_weekdays
                FROM tasks
                JOIN lists ON lists.id = tasks.list_id
                WHERE tasks.status = 'open'
                  AND tasks.remind_at IS NOT NULL
                  AND tasks.remind_at <= now()
                  AND NOT EXISTS (
                    SELECT 1 FROM reminder_log l
                    WHERE l.task_id = tasks.id AND l.remind_at = tasks.remind_at
                  )
                ORDER BY tasks.remind_at
                LIMIT %s
                """,
                (limit,),
            ).fetchall()
        return [
            DueReminder(r["id"], r["user_id"], r["title"], r["remind_at"], int(r["repeat_weekdays"]))
            for r in rows
        ]

    def claim_reminder(self, task_id: int, remind_at: datetime, nxt: datetime | None) -> None:
        with self.pool.connection() as conn:
            with conn.transaction():
                cur = conn.execute(
                    "INSERT INTO reminder_log (task_id, remind_at) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                    (task_id, remind_at),
                )
                if cur.rowcount == 0:
                    return
                if nxt is not None:
                    conn.execute(
                        "UPDATE tasks SET remind_at = %s, updated_at = now() WHERE id = %s AND remind_at = %s",
                        (nxt, task_id, remind_at),
                    )

    def release_reminder(self, task_id: int, remind_at: datetime) -> None:
        with self.pool.connection() as conn:
            conn.execute(
                "DELETE FROM reminder_log WHERE task_id = %s AND remind_at = %s",
                (task_id, remind_at),
            )
            conn.commit()

    def register(self, email: str, password_hash: str) -> int:
        with self.pool.connection() as conn:
            try:
                with conn.transaction():
                    row = conn.execute(
                        "INSERT INTO users (email, password_hash) VALUES (%s, %s) RETURNING id",
                        (email, password_hash),
                    ).fetchone()
                    _seed_lists(conn, row["id"])
            except psycopg.errors.UniqueViolation as exc:
                raise EmailTaken() from exc
        return row["id"]

    def user_by_email(self, email: str) -> tuple[int, str | None]:
        with self.pool.connection() as conn:
            row = conn.execute(
                "SELECT id, password_hash FROM users WHERE email = %s",
                (email,),
            ).fetchone()
        if row is None:
            raise NotFound()
        return row["id"], row["password_hash"]

    def upsert_google_user(self, email: str, subject: str) -> int:
        with self.pool.connection() as conn:
            with conn.transaction():
                found = conn.execute(
                    "SELECT user_id FROM user_identities WHERE provider = 'google' AND subject = %s",
                    (subject,),
                ).fetchone()
                if found is not None:
                    return found["user_id"]
                existing = conn.execute("SELECT id FROM users WHERE email = %s", (email,)).fetchone()
                if existing is not None:
                    try:
                        conn.execute(
                            "INSERT INTO user_identities (user_id, provider, subject) VALUES (%s, 'google', %s)",
                            (existing["id"], subject),
                        )
                    except psycopg.errors.UniqueViolation:
                        pass
                    return existing["id"]
                try:
                    created = conn.execute(
                        "INSERT INTO users (email) VALUES (%s) RETURNING id",
                        (email,),
                    ).fetchone()
                except psycopg.errors.UniqueViolation as exc:
                    raise EmailTaken() from exc
                conn.execute(
                    "INSERT INTO user_identities (user_id, provider, subject) VALUES (%s, 'google', %s)",
                    (created["id"], subject),
                )
                _seed_lists(conn, created["id"])
                return created["id"]


def connect(url: str) -> Store:
    last: Exception | None = None
    for _ in range(30):
        try:
            pool = ConnectionPool(
                url,
                min_size=1,
                max_size=5,
                kwargs={"row_factory": dict_row},
                open=True,
            )
            pool.wait(timeout=5)
            return Store(pool)
        except Exception as exc:
            last = exc
            time.sleep(1)
    raise RuntimeError(f"postgres: {last}")


def _seed_lists(conn: psycopg.Connection, user_id: int) -> None:
    conn.execute(
        """
        INSERT INTO lists (name, position, user_id) VALUES
        ('Personal', 0, %s),
        ('Trabajo', 1, %s),
        ('Recados', 2, %s)
        """,
        (user_id, user_id, user_id),
    )


def _task(row: dict) -> Task:
    return Task(
        id=row["id"],
        list_id=row["list_id"],
        title=row["title"],
        notes=row["notes"],
        due_at=row["due_at"],
        remind_at=row["remind_at"],
        status=row["status"],
        pinned=row["pinned"],
        position=row["position"],
        repeat_mask=int(row["repeat_weekdays"]),
        completed_at=row["completed_at"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def split_sql(body: str) -> list[str]:
    out: list[str] = []
    chunk: list[str] = []
    for line in body.split("\n"):
        trim = line.strip()
        if trim.startswith("--"):
            continue
        chunk.append(line)
        if trim.endswith(";"):
            stmt = "\n".join(chunk).strip()
            if stmt.endswith(";"):
                stmt = stmt[:-1].strip()
            if stmt:
                out.append(stmt)
            chunk = []
    return out
