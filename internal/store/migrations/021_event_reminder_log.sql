CREATE TABLE event_reminder_log (
  event_id BIGINT NOT NULL REFERENCES calendar_events (id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, remind_at)
);

CREATE INDEX calendar_events_remind_idx ON calendar_events (starts_at)
  WHERE remind_minutes IS NOT NULL;
