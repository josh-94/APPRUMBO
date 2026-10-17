ALTER TABLE accounts ADD COLUMN currency TEXT NOT NULL DEFAULT 'PEN';
ALTER TABLE accounts ADD CONSTRAINT accounts_currency_len CHECK (char_length(currency) BETWEEN 1 AND 6);
