CREATE TABLE workout_routines (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX workout_routines_user_idx ON workout_routines (user_id, active, id);

CREATE TABLE workout_exercises (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  routine_id BIGINT NOT NULL REFERENCES workout_routines (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0
);
CREATE INDEX workout_exercises_routine_idx ON workout_exercises (routine_id, position, id);

CREATE TABLE workout_sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  routine_id BIGINT REFERENCES workout_routines (id) ON DELETE SET NULL,
  occurred_on DATE NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  duration_min INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX workout_sessions_user_day_idx ON workout_sessions (user_id, occurred_on DESC, id DESC);

CREATE TABLE workout_sets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES workout_sessions (id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  reps INT NOT NULL DEFAULT 0 CHECK (reps >= 0),
  weight_grams INT NOT NULL DEFAULT 0 CHECK (weight_grams >= 0),
  position INT NOT NULL DEFAULT 0
);
CREATE INDEX workout_sets_session_idx ON workout_sets (session_id, position, id);
