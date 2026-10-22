package store

import (
	"context"
	"strings"
)

type FoodCatalogItem struct {
	ID           int64
	Slug         string
	Name         string
	Brand        string
	Category     string
	ProteinG     float64
	CarbsG       float64
	FatG         float64
	Kcal         float64
	PerGrams     float64
	ServingGrams int
	ServingLabel string
	Source       string
}

func (s *Store) SearchFoods(ctx context.Context, query string, limit int) ([]FoodCatalogItem, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return []FoodCatalogItem{}, nil
	}
	if limit <= 0 {
		limit = 12
	}
	pattern := "%" + strings.ToLower(query) + "%"
	rows, err := s.pool.Query(ctx, `
		SELECT id, slug, name, brand, category, protein_g, carbs_g, fat_g, kcal,
		       per_grams, serving_grams, serving_label, source
		FROM foods
		WHERE LOWER(name) LIKE $1 OR LOWER(slug) LIKE $1
		ORDER BY
			CASE WHEN LOWER(name) = LOWER($2) THEN 0
			     WHEN LOWER(name) LIKE LOWER($2) || '%' THEN 1
			     ELSE 2 END,
			name
		LIMIT $3`, pattern, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []FoodCatalogItem{}
	for rows.Next() {
		var item FoodCatalogItem
		if err := rows.Scan(
			&item.ID, &item.Slug, &item.Name, &item.Brand, &item.Category,
			&item.ProteinG, &item.CarbsG, &item.FatG, &item.Kcal,
			&item.PerGrams, &item.ServingGrams, &item.ServingLabel, &item.Source,
		); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}
