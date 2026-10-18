package draft

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestAmountFromText(t *testing.T) {
	cases := []struct {
		text string
		want int64
		ok   bool
	}{
		{"almuerzo 18,50", 1850, true},
		{"S/ 18.50", 1850, true},
		{"taxi 18", 1800, true},
		{"ayer gasté 20 soles", 2000, true},
		{"18", 1800, true},
		{"el 12 de octubre", 0, false},
	}
	for _, item := range cases {
		got, ok := AmountFromText(item.text)
		if ok != item.ok || got != item.want {
			t.Fatalf("%q -> %d %v, want %d %v", item.text, got, ok, item.want, item.ok)
		}
	}
}

func TestNormalizeDropsUnknownCategoryAndInventedAmount(t *testing.T) {
	today := time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC)
	categories := []Category{{ID: 3, Name: "Comida", Kind: "gasto"}, {ID: 4, Name: "Transporte", Kind: "gasto"}}
	got, err := Normalize("pasé por el centro", `{"kind":"gasto","amountCents":999999,"categoryId":99,"note":"centro","day":"2026-10-17","confidence":"alta","question":""}`, categories, today, false, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got.AmountCents != 0 || got.CategoryID != 0 {
		t.Fatalf("invented draft %+v", got)
	}
	if !strings.Contains(got.Question, "cuánto") || !strings.Contains(got.Question, "categoría") {
		t.Fatalf("question %q", got.Question)
	}
}

func TestNormalizeUsesTextAmountAndName(t *testing.T) {
	today := time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC)
	categories := []Category{{ID: 3, Name: "Comida", Kind: "gasto"}, {ID: 8, Name: "Sueldo", Kind: "ingreso"}}
	got, err := Normalize("almuerzo 18.50", `{"kind":"gasto","amountCents":1,"categoryId":3,"note":"menú","day":"2026-12-01","confidence":"alta","question":"¿seguro?"}`, categories, today, false, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got.AmountCents != 1850 || got.CategoryID != 3 || got.Category != "Comida" {
		t.Fatalf("%+v", got)
	}
	if got.Day != "2026-10-17" || got.Question != "" || got.Confidence != "alta" {
		t.Fatalf("day/question %+v", got)
	}
}

func TestNormalizeTrustsImageAmountAndKeepsCorrection(t *testing.T) {
	today := time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC)
	categories := []Category{{ID: 3, Name: "Comida", Kind: "gasto"}, {ID: 4, Name: "Transporte", Kind: "gasto"}}
	previous := &Proposal{Kind: "gasto", AmountCents: 1850, CategoryID: 3, Category: "Comida", Note: "Almuerzo", Day: "2026-10-16"}
	got, err := Normalize("era transporte", `{"kind":"gasto","amountCents":null,"categoryId":0,"note":"","day":"","confidence":"baja","question":""}`, categories, today, true, previous)
	if err != nil {
		t.Fatal(err)
	}
	if got.AmountCents != 1850 || got.CategoryID != 4 || got.Note != "Almuerzo" || got.Day != "2026-10-16" {
		t.Fatalf("%+v", got)
	}
}

func TestNormalizeDecimalModelAmountAndLongNote(t *testing.T) {
	today := time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC)
	categories := []Category{{ID: 3, Name: "Comida", Kind: "gasto"}}
	note := strings.Repeat("a", 90)
	got, err := Normalize("", `{"kind":"ingreso","amountCents":18.5,"categoryId":3,"note":"`+note+`","day":"ayer","confidence":"alta","question":""}`, categories, today, true, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got.Kind != "ingreso" || got.AmountCents != 1850 || got.CategoryID != 0 {
		t.Fatalf("%+v", got)
	}
	if len([]rune(got.Note)) != noteLimit {
		t.Fatalf("note len %d", len([]rune(got.Note)))
	}
}

func TestPromptListsCategoryIDs(t *testing.T) {
	today := time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC)
	system, user := Prompt([]Category{{ID: 4, Name: "Transporte", Kind: "gasto"}}, today, "era transporte", &Proposal{AmountCents: 1800, CategoryID: 3})
	if !strings.Contains(system, "4 Transporte") || !strings.Contains(user, "era transporte") || !strings.Contains(user, "1800") {
		t.Fatalf("system %s user %s", system, user)
	}
}

func TestCompleteAndTranscribe(t *testing.T) {
	ollama := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/chat" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"message":{"content":"{\"kind\":\"gasto\"}"}}`))
	}))
	defer ollama.Close()
	got, err := Complete(context.Background(), ollama.URL, "qwen2.5vl:3b", "sistema", "almuerzo", nil)
	if err != nil || !strings.Contains(got, "gasto") {
		t.Fatalf("%q %v", got, err)
	}

	missing := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "model not found", http.StatusNotFound)
	}))
	defer missing.Close()
	if _, err := Complete(context.Background(), missing.URL, "missing", "s", "u", nil); err != ErrPreparing {
		t.Fatalf("preparing %v", err)
	}

	whisper := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Error(err)
		}
		_, _ = w.Write([]byte(`{"text":" almuerzo 18.50 "}`))
	}))
	defer whisper.Close()
	text, err := Transcribe(context.Background(), whisper.URL, "audio.webm", []byte("audio"))
	if err != nil || text != "almuerzo 18.50" {
		t.Fatalf("%q %v", text, err)
	}
}
