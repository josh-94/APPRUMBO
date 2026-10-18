ALTER TABLE habits
  ADD COLUMN icon TEXT NOT NULL DEFAULT '✨',
  ADD COLUMN category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('general', 'estudios', 'finanzas', 'salud')),
  ADD COLUMN daily_goal SMALLINT NOT NULL DEFAULT 1
    CHECK (daily_goal BETWEEN 1 AND 99);

ALTER TABLE habit_checks
  ADD COLUMN count SMALLINT NOT NULL DEFAULT 1
    CHECK (count >= 1);
