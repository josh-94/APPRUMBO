ALTER TABLE debts ADD COLUMN tint TEXT NOT NULL DEFAULT 'noche';
ALTER TABLE debts ADD CONSTRAINT debts_tint CHECK (
  tint IN ('noche', 'oro', 'azul', 'ciruela', 'bosque', 'grafito', 'cobre')
);
