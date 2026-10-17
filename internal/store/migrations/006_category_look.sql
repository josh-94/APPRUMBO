ALTER TABLE categories ADD COLUMN icon TEXT NOT NULL DEFAULT '';
ALTER TABLE categories ADD COLUMN tint TEXT NOT NULL DEFAULT '';

UPDATE categories SET icon = '🍽', tint = 'bruma' WHERE name = 'Almuerzo' AND icon = '';
UPDATE categories SET icon = '🍔', tint = 'ciruela' WHERE name = 'Comida' AND icon = '';
UPDATE categories SET icon = '🚌', tint = 'azul' WHERE name = 'Transporte' AND icon = '';
UPDATE categories SET icon = '🏠', tint = 'bruma' WHERE name = 'Casa' AND icon = '';
UPDATE categories SET icon = '🎉', tint = 'ciruela' WHERE name = 'Salidas' AND icon = '';
UPDATE categories SET icon = '✨', tint = 'azul' WHERE name = 'Otros' AND icon = '';
UPDATE categories SET icon = '💰', tint = 'bruma' WHERE kind = 'ingreso' AND name = 'Ingreso' AND icon = '';
