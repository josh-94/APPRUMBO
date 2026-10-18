CREATE TABLE gym_week_days (
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    week_start DATE NOT NULL,
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    PRIMARY KEY (user_id, week_start, weekday)
);
CREATE INDEX gym_week_days_user_week_idx ON gym_week_days (user_id, week_start);

CREATE TABLE gym_logs (
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    day DATE NOT NULL,
    attended BOOLEAN NOT NULL DEFAULT FALSE,
    attended_at TIME,
    PRIMARY KEY (user_id, day)
);
CREATE INDEX gym_logs_user_day_idx ON gym_logs (user_id, day DESC);

CREATE TABLE meals (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    day DATE NOT NULL,
    title TEXT NOT NULL,
    eaten_at TIME,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX meals_user_day_idx ON meals (user_id, day DESC, id DESC);

CREATE TABLE meal_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    meal_id BIGINT NOT NULL REFERENCES meals (id) ON DELETE CASCADE,
    food_name TEXT NOT NULL,
    brand TEXT NOT NULL DEFAULT '',
    off_id TEXT NOT NULL DEFAULT '',
    grams INT NOT NULL CHECK (grams > 0),
    protein_g DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (protein_g >= 0),
    carbs_g DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (carbs_g >= 0),
    fat_g DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (fat_g >= 0),
    kcal DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (kcal >= 0)
);
CREATE INDEX meal_items_meal_idx ON meal_items (meal_id, id);
