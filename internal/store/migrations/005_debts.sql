ALTER TABLE accounts ADD COLUMN payday SMALLINT CHECK (payday BETWEEN 1 AND 31);
ALTER TABLE accounts ADD COLUMN payday_cents BIGINT CHECK (payday_cents IS NULL OR payday_cents > 0);
ALTER TABLE accounts ADD COLUMN last_payday DATE;

ALTER TABLE tasks ADD COLUMN pay_kind TEXT CHECK (pay_kind IN ('sueldo', 'tarjeta', 'prestamo', 'mes'));
ALTER TABLE tasks ADD COLUMN pay_ref BIGINT;

CREATE UNIQUE INDEX tasks_open_pay_idx ON tasks (pay_kind, pay_ref) WHERE status = 'open' AND pay_kind IS NOT NULL;

CREATE TABLE money_settings (
    user_id BIGINT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    fx_hundredths INTEGER NOT NULL DEFAULT 340 CHECK (fx_hundredths BETWEEN 100 AND 2000)
);

CREATE TABLE debts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('tarjeta', 'prestamo')),
    name TEXT NOT NULL,
    balance_pen BIGINT NOT NULL DEFAULT 0 CHECK (balance_pen >= 0),
    balance_usd BIGINT NOT NULL DEFAULT 0 CHECK (balance_usd >= 0),
    cuota_pen BIGINT NOT NULL DEFAULT 0 CHECK (cuota_pen >= 0),
    cuota_usd BIGINT NOT NULL DEFAULT 0 CHECK (cuota_usd >= 0),
    due_day SMALLINT NOT NULL CHECK (due_day BETWEEN 1 AND 31),
    currency TEXT NOT NULL DEFAULT 'pen' CHECK (currency IN ('pen', 'usd')),
    last_paid DATE
);

CREATE INDEX debts_user_idx ON debts (user_id, due_day);

CREATE TABLE bills (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    due_day SMALLINT NOT NULL CHECK (due_day BETWEEN 1 AND 31),
    category_id BIGINT REFERENCES categories (id),
    last_paid DATE
);

CREATE INDEX bills_user_idx ON bills (user_id, due_day);
