package draft

import (
	"context"
	"encoding/json"
	"io"
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
		{"gaste 34 en reparacion de llanta con mi tarjeta amex", 3400, true},
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
	system, user := Prompt([]Category{{ID: 4, Name: "Transporte", Kind: "gasto"}}, today, "era transporte", &Proposal{AmountCents: 1800, CategoryID: 3}, "Usuario: bembos\nHecho: Anoté Salidas")
	if !strings.Contains(system, "4 Transporte") || !strings.Contains(user, "era transporte") || !strings.Contains(user, "1800") {
		t.Fatalf("system %s user %s", system, user)
	}
	if !strings.Contains(user, "Memoria reciente:") || !strings.Contains(user, "bembos") {
		t.Fatalf("memory missing in user %s", user)
	}
}

func TestTryLocalMoneyClearLine(t *testing.T) {
	today := time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC)
	categories := []Category{
		{ID: 3, Name: "Comida", Kind: "gasto"},
		{ID: 5, Name: "Entretenimiento", Kind: "gasto"},
		{ID: 9, Name: "Casa", Kind: "gasto"},
	}
	sources := []PaySource{{ID: 9, Name: "Amex", Kind: "debt"}}
	got, ok := TryLocalMoney("almuerzo 18.50", categories, sources, today, nil)
	if !ok || got.AmountCents != 1850 || got.CategoryID != 3 || got.Category != "Comida" {
		t.Fatalf("almuerzo %+v ok=%v", got, ok)
	}
	got, ok = TryLocalMoney("gaste 23 soles en cine de mi tarjeta amex", categories, sources, today, nil)
	if !ok || got.AmountCents != 2300 || got.CategoryID != 5 || got.DebtID != 9 || got.SourceName != "Amex" {
		t.Fatalf("cine %+v ok=%v", got, ok)
	}
	categories = append(categories, Category{ID: 6, Name: "Transporte", Kind: "gasto"})
	got, ok = TryLocalMoney("gaste 34 en reparacion de llanta con mi tarjeta amex", categories, sources, today, nil)
	if !ok || got.AmountCents != 3400 || got.CategoryID != 6 || got.DebtID != 9 {
		t.Fatalf("llanta %+v ok=%v", got, ok)
	}
}

func TestTryLocalMoneyCategoryCorrection(t *testing.T) {
	today := time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC)
	categories := []Category{
		{ID: 3, Name: "Comida", Kind: "gasto"},
		{ID: 9, Name: "Casa", Kind: "gasto"},
		{ID: 11, Name: "Alimentos", Kind: "gasto"},
	}
	sources := []PaySource{{ID: 9, Name: "Amex", Kind: "debt"}}
	previous := &Proposal{Kind: "gasto", AmountCents: 2300, Note: "cine", Day: "2026-10-17"}
	got, ok := TryLocalMoney("alimentos", categories, sources, today, previous)
	if !ok || got.AmountCents != 2300 || got.CategoryID != 11 || got.Category != "Alimentos" {
		t.Fatalf("alimentos name %+v ok=%v", got, ok)
	}
	previous = &Proposal{Kind: "gasto", AmountCents: 2300, Note: "cine", Day: "2026-10-17"}
	categories = []Category{{ID: 3, Name: "Comida", Kind: "gasto"}, {ID: 9, Name: "Casa", Kind: "gasto"}}
	got, ok = TryLocalMoney("alimentos", categories, sources, today, previous)
	if !ok || got.CategoryID != 3 || got.Category != "Comida" {
		t.Fatalf("alimentos synonym %+v ok=%v", got, ok)
	}
	if _, ok = TryLocalMoney("no sé", categories, sources, today, previous); ok {
		t.Fatal("expected miss")
	}
	previous = &Proposal{Kind: "gasto", AmountCents: 3400, CategoryID: 6, Category: "Transporte", Note: "reparacion llanta", Day: "2026-10-17"}
	got, ok = TryLocalMoney("falto anotar que lo saque de mi tarjeta amex", categories, sources, today, previous)
	if !ok || got.DebtID != 9 || got.SourceName != "Amex" || got.AmountCents != 3400 || got.CategoryID != 6 {
		t.Fatalf("amex correction %+v ok=%v", got, ok)
	}
	previous = &Proposal{Kind: "gasto", AmountCents: 200, CategoryID: 3, Category: "Comida", Note: "agregar a mis gastos palta", Day: "2026-10-17", DebtID: 9, SourceName: "Amex"}
	got, ok = TryLocalMoney("el gasto solo fue en 'palta'", categories, sources, today, previous)
	if !ok || got.Note != "palta" || got.AmountCents != 200 || got.DebtID != 9 {
		t.Fatalf("note correction %+v ok=%v", got, ok)
	}
}

func TestMatchPaySourceIgnoresSolesInAccountName(t *testing.T) {
	sources := []PaySource{
		{ID: 1, Name: "Ahorros Soles - BCP", Kind: "account"},
		{ID: 9, Name: "Amex", Kind: "debt"},
		{ID: 3, Name: "BCP Amex Gold", Kind: "debt"},
	}
	got, ok := MatchPaySource("agregar a mis gastos 2 soles en palta de mi tarjeta amex categoria alimentos", sources)
	if !ok || got.Kind != "debt" || (got.ID != 9 && got.ID != 3) {
		t.Fatalf("want Amex card, got %+v ok=%v", got, ok)
	}
	if _, ok := MatchPaySource("gaste 2 soles en palta", sources); ok {
		t.Fatal("soles alone must not match Ahorros Soles")
	}
	got, ok = MatchPaySource("cuenta de ahorros", sources)
	if !ok || got.ID != 1 || got.Kind != "account" {
		t.Fatalf("want savings account, got %+v ok=%v", got, ok)
	}
}

func TestTryLocalMoneyDoesNotInheritPreviousSource(t *testing.T) {
	today := time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC)
	categories := []Category{{ID: 3, Name: "Comida", Kind: "gasto"}}
	sources := []PaySource{{ID: 3, Name: "BCP Amex Gold", Kind: "debt"}, {ID: 1, Name: "Ahorros Soles - BCP", Kind: "account"}}
	previous := &Proposal{Kind: "gasto", AmountCents: 3400, DebtID: 3, SourceName: "BCP Amex Gold", CategoryID: 3, Category: "Comida"}
	got, ok := TryLocalMoney("anotar 20 soles en perejil gasto", categories, sources, today, previous)
	if !ok || got.AmountCents != 2000 {
		t.Fatalf("draft %+v ok=%v", got, ok)
	}
	if got.DebtID != 0 || got.AccountID != 0 || got.SourceName != "" {
		t.Fatalf("must not inherit previous source %+v", got)
	}
	got, ok = TryLocalMoney("cuenta de ahorros", categories, sources, today, &Proposal{
		Kind: "gasto", AmountCents: 2000, CategoryID: 3, Category: "Comida", Note: "perejil", Day: "2026-10-17",
	})
	if !ok || got.AccountID != 1 || got.SourceName != "Ahorros Soles - BCP" {
		t.Fatalf("savings correction %+v ok=%v", got, ok)
	}
}

func TestLocalMoneyNoteStripsBoilerplate(t *testing.T) {
	note := localMoneyNote("agregar a mis gastos 2 soles en palta de mi tarjeta amex categoria alimentos", "Alimentos")
	if note != "palta" {
		t.Fatalf("note %q", note)
	}
}

func TestCompleteAndTranscribe(t *testing.T) {
	ollama := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/chat" {
			http.NotFound(w, r)
			return
		}
		raw, _ := io.ReadAll(r.Body)
		var req struct {
			KeepAlive int `json:"keep_alive"`
			Options   struct {
				NumThread  int `json:"num_thread"`
				NumCtx     int `json:"num_ctx"`
				NumPredict int `json:"num_predict"`
			} `json:"options"`
		}
		if err := json.Unmarshal(raw, &req); err != nil {
			t.Error(err)
		}
		if req.KeepAlive != -1 || req.Options.NumThread != 4 {
			t.Errorf("keep_alive=%d num_thread=%d", req.KeepAlive, req.Options.NumThread)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"message":{"content":"{\"kind\":\"gasto\"}"}}`))
	}))
	defer ollama.Close()
	got, err := Complete(context.Background(), ollama.URL, "qwen2.5:3b", "sistema", "almuerzo", nil, 4)
	if err != nil || !strings.Contains(got, "gasto") {
		t.Fatalf("%q %v", got, err)
	}

	money := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var req struct {
			Options struct {
				NumCtx     int `json:"num_ctx"`
				NumPredict int `json:"num_predict"`
				NumThread  int `json:"num_thread"`
			} `json:"options"`
		}
		if err := json.Unmarshal(raw, &req); err != nil {
			t.Error(err)
		}
		if req.Options.NumCtx != 512 || req.Options.NumPredict != 72 || req.Options.NumThread != 4 {
			t.Errorf("money options %+v", req.Options)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"message":{"content":"{\"kind\":\"gasto\"}"}}`))
	}))
	defer money.Close()
	if _, err := CompleteMoney(context.Background(), money.URL, "qwen2.5:3b", "s", "u", 4); err != nil {
		t.Fatalf("CompleteMoney %v", err)
	}

	missing := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "model not found", http.StatusNotFound)
	}))
	defer missing.Close()
	if _, err := Complete(context.Background(), missing.URL, "missing", "s", "u", nil, 4); err != ErrPreparing {
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
