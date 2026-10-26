CREATE TABLE user_google_tokens (
  user_id BIGINT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  access_token TEXT NOT NULL DEFAULT '',
  expiry TIMESTAMPTZ,
  scopes TEXT NOT NULL DEFAULT '',
  last_sync_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE google_calendar_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  google_event_id TEXT NOT NULL,
  google_calendar_id TEXT NOT NULL DEFAULT 'primary',
  title TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  html_link TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'horizonte',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at >= starts_at),
  UNIQUE (user_id, google_event_id)
);

CREATE INDEX google_calendar_events_user_range_idx
  ON google_calendar_events (user_id, starts_at, ends_at);
