ALTER TABLE movements
  ADD COLUMN currency TEXT NOT NULL DEFAULT 'pen'
  CHECK (currency IN ('pen', 'usd'));
