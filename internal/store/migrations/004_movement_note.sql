ALTER TABLE movements ADD COLUMN note TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX categories_user_kind_name_idx ON categories (user_id, kind, lower(name));
