CREATE TABLE lists (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    list_id BIGINT NOT NULL REFERENCES lists (id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    due_at TIMESTAMPTZ,
    remind_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    position INTEGER NOT NULL DEFAULT 0,
    repeat_weekdays SMALLINT NOT NULL DEFAULT 0,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE push_subscriptions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reminder_log (
    task_id BIGINT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    remind_at TIMESTAMPTZ NOT NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (task_id, remind_at)
);

CREATE INDEX tasks_list_idx ON tasks (list_id, position);
CREATE INDEX tasks_due_idx ON tasks (status, due_at);
CREATE INDEX tasks_remind_idx ON tasks (status, remind_at);

INSERT INTO lists (name, position) VALUES
    ('Personal', 0),
    ('Trabajo', 1),
    ('Recados', 2);
