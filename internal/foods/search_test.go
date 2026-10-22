package foods

import (
	"context"
	"testing"
)

func TestMergeSearchKeepsLocalWhenEnough(t *testing.T) {
	local := []Hit{
		{ID: "local:a", Name: "Arroz cocido", Source: "local"},
		{ID: "local:b", Name: "Arroz crudo", Source: "local"},
		{ID: "local:c", Name: "Arroz chaufa", Source: "local"},
	}
	out, err := MergeSearch(context.Background(), local, &Client{URL: "http://127.0.0.1:9/nope"}, "arroz")
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 3 {
		t.Fatalf("want 3 local-only hits, got %d", len(out))
	}
	for _, hit := range out {
		if hit.Source != "local" {
			t.Fatalf("unexpected source %q", hit.Source)
		}
	}
}

func TestFromLocalSetsIDAndServing(t *testing.T) {
	hit := FromLocal(1, "huevo", "Huevo entero", "", 13, 1.1, 11, 155, 100, 50, "1 unidad", "local")
	if hit.ID != "local:huevo" {
		t.Fatalf("id = %q", hit.ID)
	}
	if hit.ServingGrams != 50 || hit.ServingLabel != "1 unidad" {
		t.Fatalf("serving = %d %q", hit.ServingGrams, hit.ServingLabel)
	}
}
