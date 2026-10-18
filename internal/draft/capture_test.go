package draft

import (
	"strings"
	"testing"
	"time"
)

func TestNormalizeCaptureEventFutureDate(t *testing.T) {
	today := time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC)
	raw := `{"kind":"evento","title":"recoger a mama","day":"2026-10-31","time":"04:00","durationMin":60,"allDay":false,"remind":false,"amountCents":0,"currency":"pen","categoryId":0,"confidence":"alta","question":""}`
	got, err := NormalizeCapture("31 octubre a las 4 am recoger a mama", raw, "evento", nil, nil, today)
	if err != nil {
		t.Fatal(err)
	}
	if got.Kind != "evento" || got.Title != "recoger a mama" || got.Day != "2026-10-31" || got.Time != "04:00" || got.DurationMin != 60 {
		t.Fatalf("%+v", got)
	}
	if got.Confidence != "alta" {
		t.Fatalf("confidence %q", got.Confidence)
	}
}

func TestNormalizeCaptureForcesIntent(t *testing.T) {
	today := time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC)
	raw := `{"kind":"evento","title":"Reunión","day":"2026-10-18","time":"08:00","durationMin":60,"allDay":false,"remind":false,"confidence":"alta","question":""}`
	got, err := NormalizeCapture("Reunión mañana 8am", raw, "recordatorio", nil, nil, today)
	if err != nil {
		t.Fatal(err)
	}
	if got.Kind != "recordatorio" || !got.Remind || got.Time != "08:00" || got.Day != "2026-10-18" {
		t.Fatalf("%+v", got)
	}
}

func TestNormalizeCaptureMananaFromText(t *testing.T) {
	today := time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC)
	raw := `{"kind":"tarea","title":"Reunión","day":"2099-01-01","time":"8:00 am","durationMin":0,"remind":true,"confidence":"alta","question":""}`
	got, err := NormalizeCapture("Reunión mañana 8am", raw, "tarea", nil, nil, today)
	if err != nil {
		t.Fatal(err)
	}
	if got.Day != "2026-10-18" || got.Time != "08:00" || !got.Remind {
		t.Fatalf("%+v", got)
	}
}

func TestNormalizeCaptureGasto(t *testing.T) {
	today := time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC)
	categories := []Category{{ID: 5, Name: "Farmacia", Kind: "gasto"}, {ID: 3, Name: "Comida", Kind: "gasto"}}
	sources := []PaySource{{ID: 9, Name: "Amex", Kind: "debt"}, {ID: 1, Name: "BCP", Kind: "account"}}
	raw := `{"kind":"gasto","title":"pastillas","day":"2026-10-17","time":"","amountCents":2300,"currency":"pen","categoryId":0,"confidence":"alta","question":""}`
	got, err := NormalizeCapture("gaste 23 de mi tarjeta amex en pastillas", raw, "gasto", categories, sources, today)
	if err != nil {
		t.Fatal(err)
	}
	if got.AmountCents != 2300 || got.CategoryID != 5 || got.Category != "Farmacia" {
		t.Fatalf("category %+v", got)
	}
	if got.DebtID != 9 || got.SourceName != "Amex" || got.AccountID != 0 {
		t.Fatalf("source %+v", got)
	}
	if !strings.Contains(strings.ToLower(got.Title), "pastilla") {
		t.Fatalf("title %q", got.Title)
	}
	if got.Confidence != "alta" {
		t.Fatalf("confidence %q question %q", got.Confidence, got.Question)
	}
}

func TestNormalizeCaptureUnreadable(t *testing.T) {
	today := time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC)
	_, err := NormalizeCapture("hola", "not json", "evento", nil, nil, today)
	if err != ErrUnreadable {
		t.Fatalf("err %v", err)
	}
}

func TestCapturePromptIncludesToday(t *testing.T) {
	today := time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC)
	system, user := CapturePrompt("evento", []Category{{ID: 3, Name: "Comida", Kind: "gasto"}}, nil, today, "hola")
	if !strings.Contains(system, "2026-10-17") || user != "hola" {
		t.Fatalf("system=%q user=%q", system, user)
	}
	if strings.Contains(system, "Comida") {
		t.Fatalf("evento prompt should omit categories: %q", system)
	}
	gasto, _ := CapturePrompt("gasto", []Category{{ID: 3, Name: "Comida", Kind: "gasto"}}, []PaySource{{ID: 2, Name: "Amex", Kind: "debt"}}, today, "25")
	if !strings.Contains(gasto, "Comida") || !strings.Contains(gasto, "Amex") {
		t.Fatalf("gasto prompt missing money lists: %q", gasto)
	}
}
