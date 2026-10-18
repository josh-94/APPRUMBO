ALTER TABLE debts ADD COLUMN last4 TEXT NOT NULL DEFAULT '';
ALTER TABLE debts ADD COLUMN limit_cents BIGINT NOT NULL DEFAULT 0 CHECK (limit_cents >= 0);
ALTER TABLE debts ADD CONSTRAINT debts_last4 CHECK (last4 = '' OR last4 ~ '^[0-9]{4}$');

CREATE TABLE debt_moves (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    debt_id BIGINT NOT NULL REFERENCES debts (id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('consumo', 'pago')),
    currency TEXT NOT NULL CHECK (currency IN ('pen', 'usd')),
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    occurred_on DATE NOT NULL,
    note TEXT NOT NULL DEFAULT ''
);

CREATE INDEX debt_moves_debt_idx ON debt_moves (debt_id, occurred_on DESC, id DESC);
