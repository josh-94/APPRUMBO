CREATE TABLE goals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'ahorro' CHECK (kind IN ('ahorro', 'numero', 'etapas')),
  target_cents BIGINT NOT NULL CHECK (target_cents > 0),
  saved_cents BIGINT NOT NULL DEFAULT 0 CHECK (saved_cents >= 0),
  deadline DATE,
  account_id BIGINT REFERENCES accounts (id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX goals_user_idx ON goals (user_id, active, id);

CREATE TABLE goal_moves (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  goal_id BIGINT NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
  account_id BIGINT REFERENCES accounts (id) ON DELETE SET NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX goal_moves_goal_idx ON goal_moves (goal_id, occurred_on DESC, id DESC);
