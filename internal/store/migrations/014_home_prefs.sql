CREATE TABLE home_prefs (
  user_id BIGINT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  cards JSONB NOT NULL DEFAULT '["agenda","habits","money","goals","workouts"]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
