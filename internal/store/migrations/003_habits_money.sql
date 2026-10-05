CREATE TABLE habits (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    n_goal SMALLINT NOT NULL DEFAULT 5 CHECK (n_goal BETWEEN 1 AND 7),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX habits_user_idx ON habits (user_id, active);

CREATE TABLE habit_checks (
    habit_id BIGINT NOT NULL REFERENCES habits (id) ON DELETE CASCADE,
    day DATE NOT NULL,
    PRIMARY KEY (habit_id, day)
);

CREATE TABLE accounts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX accounts_user_idx ON accounts (user_id);

CREATE TABLE categories (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('gasto', 'ingreso')),
    position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX categories_user_idx ON categories (user_id, kind, position);

CREATE TABLE movements (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    account_id BIGINT NOT NULL REFERENCES accounts (id),
    category_id BIGINT REFERENCES categories (id),
    kind TEXT NOT NULL CHECK (kind IN ('gasto', 'ingreso')),
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    occurred_on DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX movements_user_month_idx ON movements (user_id, occurred_on DESC);

INSERT INTO accounts (user_id, name)
SELECT id, 'Billetera' FROM users;

INSERT INTO categories (user_id, name, kind, position)
SELECT u.id, c.name, c.kind, c.position
FROM users u
CROSS JOIN (
    VALUES
        ('Almuerzo', 'gasto', 0),
        ('Comida', 'gasto', 1),
        ('Transporte', 'gasto', 2),
        ('Casa', 'gasto', 3),
        ('Salidas', 'gasto', 4),
        ('Otros', 'gasto', 5),
        ('Ingreso', 'ingreso', 6)
) AS c(name, kind, position);
