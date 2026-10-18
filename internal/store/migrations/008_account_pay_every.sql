ALTER TABLE accounts ADD COLUMN pay_every TEXT NOT NULL DEFAULT '';
ALTER TABLE accounts ADD COLUMN payday2 SMALLINT CHECK (payday2 IS NULL OR payday2 BETWEEN 1 AND 31);
ALTER TABLE accounts ADD COLUMN payday2_cents BIGINT CHECK (payday2_cents IS NULL OR payday2_cents > 0);
ALTER TABLE accounts ADD CONSTRAINT accounts_pay_every CHECK (pay_every IN ('', 'semana', 'quincena', 'mes'));

UPDATE accounts SET pay_every = 'mes' WHERE payday IS NOT NULL;
