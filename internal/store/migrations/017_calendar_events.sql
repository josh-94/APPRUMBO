CREATE TABLE calendar_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  color TEXT NOT NULL DEFAULT 'menta',
  remind_minutes INT,
  repeat_rule TEXT NOT NULL DEFAULT 'none' CHECK (repeat_rule IN ('none', 'weekly')),
  repeat_weekdays SMALLINT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at >= starts_at)
);

CREATE INDEX calendar_events_user_range_idx ON calendar_events (user_id, starts_at, ends_at);
