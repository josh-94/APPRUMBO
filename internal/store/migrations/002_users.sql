CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_identities (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    subject TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, subject)
);

DELETE FROM push_subscriptions;
DELETE FROM lists;

ALTER TABLE lists ADD COLUMN user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE push_subscriptions ADD COLUMN user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE;

CREATE INDEX lists_user_idx ON lists (user_id, position);
CREATE INDEX push_user_idx ON push_subscriptions (user_id);
