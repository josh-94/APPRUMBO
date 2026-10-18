ALTER TABLE movements ALTER COLUMN account_id DROP NOT NULL;
ALTER TABLE movements ADD COLUMN debt_id BIGINT REFERENCES debts (id) ON DELETE SET NULL;
ALTER TABLE movements ADD CONSTRAINT movements_source CHECK (
  (account_id IS NOT NULL AND debt_id IS NULL)
  OR (account_id IS NULL AND debt_id IS NOT NULL)
);
CREATE INDEX movements_debt_idx ON movements (debt_id, occurred_on DESC, id DESC);
