package draft

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"
)

const titleLimit = 120

type CaptureProposal struct {
	Kind         string `json:"kind"`
	Title        string `json:"title"`
	Day          string `json:"day"`
	Time         string `json:"time"`
	DurationMin  int    `json:"durationMin"`
	AllDay       bool   `json:"allDay"`
	Remind       bool   `json:"remind"`
	AmountCents  int64  `json:"amountCents"`
	Currency     string `json:"currency"`
	CategoryID   int64  `json:"categoryId"`
	Category     string `json:"category"`
	CategoryHint string `json:"categoryHint,omitempty"`
	Confidence   string `json:"confidence"`
	Question     string `json:"question"`
	Transcript   string `json:"transcript,omitempty"`
}

type captureModelJSON struct {
	Kind         string          `json:"kind"`
	Title        string          `json:"title"`
	Day          string          `json:"day"`
	Time         string          `json:"time"`
	DurationMin  json.RawMessage `json:"durationMin"`
	AllDay       bool            `json:"allDay"`
	Remind       bool            `json:"remind"`
	AmountCents  json.RawMessage `json:"amountCents"`
	Currency     string          `json:"currency"`
	CategoryID   int64           `json:"categoryId"`
	CategoryHint string          `json:"categoryHint"`
	Confidence   string          `json:"confidence"`
	Question     string          `json:"question"`
}

func CapturePrompt(intent string, categories []Category, today time.Time, text string) (string, string) {
	intent = normalizeIntent(intent)
	var gastos strings.Builder
	for _, item := range categories {
		if item.Kind == "gasto" {
			gastos.WriteString(fmt.Sprintf("- %d %s\n", item.ID, item.Name))
		}
	}
	if gastos.Len() == 0 {
		gastos.WriteString("(ninguna)\n")
	}
	system := fmt.Sprintf(`Responde solo JSON válido. Hoy es %s (America/Lima). Idioma: español.
Intento del usuario: %s.
Campos:
- kind: evento, tarea, recordatorio o gasto
- title: título corto limpio (sin fecha ni hora)
- day: YYYY-MM-DD (puede ser futuro)
- time: HH:MM 24h o vacío si todo el día / sin hora
- durationMin: minutos del evento (default 60), 0 si no aplica
- allDay: true/false
- remind: true si es recordatorio o si hay hora para avisar
- amountCents: centavos del gasto (25 = 2500) o 0
- currency: pen o usd
- categoryId: id de gasto de la lista, o 0
- categoryHint: nombre de categoría si no hay id
- confidence: alta o baja
- question: vacía si está claro; si no, una pregunta breve

Categorías de gasto:
%s
Reglas: si intent es evento/tarea/recordatorio/gasto, kind debe coincidir. Quita de title palabras de fecha/hora ("mañana", "31 octubre", "a las 4 am"). Para gasto, title/nota corta del concepto.`,
		today.Format("2006-01-02"), intent, gastos.String())
	return system, text
}

func NormalizeCapture(text, raw, intent string, categories []Category, today time.Time) (CaptureProposal, error) {
	parsed, err := parseCaptureModel(raw)
	if err != nil {
		return CaptureProposal{}, ErrUnreadable
	}
	intent = normalizeIntent(intent)
	kind := normalizeCaptureKind(parsed.Kind, intent)

	title := clip(parsed.Title, titleLimit)
	if title == "" {
		title = clip(text, titleLimit)
	}
	if title == "" {
		title = defaultTitle(kind)
	}

	day := resolveCaptureDay(text, parsed.Day, today)
	allDay := parsed.AllDay
	timeStr := normalizeTime(parsed.Time)
	if allDay {
		timeStr = ""
	}
	duration := intFromRaw(parsed.DurationMin, 60)
	if duration < 5 {
		duration = 5
	}
	if duration > 24*60 {
		duration = 24 * 60
	}
	if kind != "evento" {
		duration = 0
	}
	remind := parsed.Remind
	if kind == "recordatorio" {
		remind = true
		if timeStr == "" && !allDay {
			timeStr = "09:00"
		}
	}
	if kind == "tarea" && timeStr != "" {
		remind = true
	}

	out := CaptureProposal{
		Kind:        kind,
		Title:       title,
		Day:         day.Format("2006-01-02"),
		Time:        timeStr,
		DurationMin: duration,
		AllDay:      allDay && kind == "evento",
		Remind:      remind,
		Currency:    "pen",
		Confidence:  "baja",
	}
	if kind == "evento" && out.DurationMin == 0 {
		out.DurationMin = 60
	}
	if kind == "evento" && !out.AllDay && out.Time == "" {
		out.Time = "09:00"
	}

	if kind == "gasto" {
		currency := strings.ToLower(strings.TrimSpace(parsed.Currency))
		if currency == "usd" {
			out.Currency = "usd"
		}
		amount, hasAmount := AmountFromText(text)
		if !hasAmount {
			amount, hasAmount = amountFromModel(parsed.AmountCents)
		}
		if amount <= 0 || amount > 100_000_000 {
			hasAmount = false
			amount = 0
		}
		out.AmountCents = amount
		out.CategoryHint = clip(parsed.CategoryHint, 40)
		category, ok := categoryByID(parsed.CategoryID, "gasto", categories)
		if !ok {
			category, ok = categoryByName(text+" "+out.CategoryHint+" "+title, "gasto", categories)
		}
		if ok {
			out.CategoryID = category.ID
			out.Category = category.Name
		}
		var questions []string
		if !hasAmount {
			questions = append(questions, "¿De cuánto fue?")
		}
		if out.CategoryID == 0 {
			questions = append(questions, "¿En qué categoría lo anoto?")
		}
		out.Question = strings.Join(questions, " ")
		if out.Question == "" {
			out.Confidence = "alta"
		}
		if out.Title == defaultTitle("gasto") && out.Category != "" {
			out.Title = out.Category
		}
		return out, nil
	}

	if strings.EqualFold(parsed.Confidence, "alta") {
		out.Confidence = "alta"
	}
	if titleLooksEmpty(title, text) {
		out.Confidence = "baja"
		out.Question = "¿Cómo lo llamo?"
	} else if out.Confidence == "alta" {
		out.Question = ""
	} else if strings.TrimSpace(parsed.Question) != "" {
		out.Question = clip(parsed.Question, 120)
	}
	return out, nil
}

func normalizeIntent(intent string) string {
	switch strings.ToLower(strings.TrimSpace(intent)) {
	case "evento", "tarea", "recordatorio", "gasto":
		return strings.ToLower(strings.TrimSpace(intent))
	default:
		return "auto"
	}
}

func normalizeCaptureKind(modelKind, intent string) string {
	kind := strings.ToLower(strings.TrimSpace(modelKind))
	switch kind {
	case "evento", "tarea", "recordatorio", "gasto":
	default:
		kind = ""
	}
	if intent != "auto" {
		return intent
	}
	if kind != "" {
		return kind
	}
	return "tarea"
}

func defaultTitle(kind string) string {
	switch kind {
	case "evento":
		return "Evento"
	case "recordatorio":
		return "Recordatorio"
	case "gasto":
		return "Gasto"
	default:
		return "Tarea"
	}
}

func titleLooksEmpty(title, text string) bool {
	t := strings.ToLower(strings.TrimSpace(title))
	if t == "" || t == "evento" || t == "tarea" || t == "recordatorio" || t == "gasto" {
		return strings.TrimSpace(text) == ""
	}
	return false
}

func parseCaptureModel(raw string) (captureModelJSON, error) {
	raw = strings.TrimSpace(raw)
	if start := strings.Index(raw, "{"); start >= 0 {
		if end := strings.LastIndex(raw, "}"); end > start {
			raw = raw[start : end+1]
		}
	}
	var parsed captureModelJSON
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return captureModelJSON{}, err
	}
	return parsed, nil
}

func resolveCaptureDay(text, raw string, today time.Time) time.Time {
	today = time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, today.Location())
	lower := strings.ToLower(text)
	switch {
	case strings.Contains(lower, "pasado mañana"):
		return today.AddDate(0, 0, 2)
	case strings.Contains(lower, "mañana"):
		return today.AddDate(0, 0, 1)
	case strings.Contains(lower, "ayer"):
		return today.AddDate(0, 0, -1)
	case strings.Contains(lower, "hoy"):
		return today
	}
	if day, ok := parseDay(raw, today.Location()); ok {
		return day
	}
	return today
}

func normalizeTime(raw string) string {
	raw = strings.TrimSpace(strings.ToLower(raw))
	if raw == "" {
		return ""
	}
	raw = strings.ReplaceAll(raw, ".", "")
	raw = strings.ReplaceAll(raw, " ", "")
	meridiem := ""
	if strings.HasSuffix(raw, "am") {
		meridiem = "am"
		raw = strings.TrimSuffix(raw, "am")
	} else if strings.HasSuffix(raw, "pm") {
		meridiem = "pm"
		raw = strings.TrimSuffix(raw, "pm")
	}
	parts := strings.Split(raw, ":")
	if len(parts) == 0 || parts[0] == "" {
		return ""
	}
	hour, err := strconv.Atoi(parts[0])
	if err != nil {
		return ""
	}
	minute := 0
	if len(parts) > 1 {
		minute, err = strconv.Atoi(parts[1])
		if err != nil {
			return ""
		}
	}
	if meridiem == "pm" && hour < 12 {
		hour += 12
	}
	if meridiem == "am" && hour == 12 {
		hour = 0
	}
	if hour < 0 || hour > 23 || minute < 0 || minute > 59 {
		return ""
	}
	return fmt.Sprintf("%02d:%02d", hour, minute)
}

func intFromRaw(raw json.RawMessage, fallback int) int {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return fallback
	}
	var whole int
	if err := json.Unmarshal(raw, &whole); err == nil {
		if whole <= 0 {
			return fallback
		}
		return whole
	}
	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		n, err := strconv.Atoi(strings.TrimSpace(text))
		if err == nil && n > 0 {
			return n
		}
	}
	var f float64
	if err := json.Unmarshal(raw, &f); err == nil && f > 0 {
		return int(f)
	}
	return fallback
}
