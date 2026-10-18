ALTER TABLE money_settings
  ADD COLUMN currency TEXT NOT NULL DEFAULT 'PEN';

ALTER TABLE money_settings
  ADD CONSTRAINT money_settings_currency_len CHECK (char_length(currency) BETWEEN 1 AND 6);
