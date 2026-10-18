package draft

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

const titleLimit = 120

type PaySource struct {
	ID   int64
	Name string
	Kind string // account | debt
}

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
	AccountID    int64  `json:"accountId"`
	DebtID       int64  `json:"debtId"`
	SourceName   string `json:"sourceName,omitempty"`
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
	AccountID    int64           `json:"accountId"`
	DebtID       int64           `json:"debtId"`
	Confidence   string          `json:"confidence"`
	Question     string          `json:"question"`
}

func CapturePrompt(intent string, categories []Category, sources []PaySource, today time.Time, text string) (string, string) {
	intent = normalizeIntent(intent)
	needMoney := intent == "gasto" || intent == "auto"
	system := fmt.Sprintf(`Solo JSON. Hoy %s. Intent:%s.
Campos: kind(evento|tarea|recordatorio|gasto), title(concepto corto sin monto ni medio de pago), day(YYYY-MM-DD), time(HH:MM o ""), durationMin, allDay, remind, amountCents, currency(pen|usd), categoryId, categoryHint, accountId, debtId, confidence(alta|baja), question.
kind=intent si no es auto. title ej: "pastillas" no "gaste 23 de mi tarjeta".`,
		today.Format("2006-01-02"), intent)
	if needMoney {
		var gastos, cuentas, tarjetas strings.Builder
		for _, item := range categories {
			if item.Kind == "gasto" {
				gastos.WriteString(fmt.Sprintf("- %d %s\n", item.ID, item.Name))
			}
		}
		if gastos.Len() == 0 {
			gastos.WriteString("(ninguna)\n")
		}
		for _, src := range sources {
			line := fmt.Sprintf("- %d %s\n", src.ID, src.Name)
			if src.Kind == "debt" {
				tarjetas.WriteString(line)
			} else {
				cuentas.WriteString(line)
			}
		}
		if cuentas.Len() == 0 {
			cuentas.WriteString("(ninguna)\n")
		}
		if tarjetas.Len() == 0 {
			tarjetas.WriteString("(ninguna)\n")
		}
		system += "\nCategorías gasto:\n" + gastos.String()
		system += "Cuentas (accountId):\n" + cuentas.String()
		system += "Tarjetas (debtId):\n" + tarjetas.String()
		system += "Si dice tarjeta/amex/visa usa debtId. Si dice yape/efectivo/cuenta usa accountId."
	}
	return system, text
}

func NormalizeCapture(text, raw, intent string, categories []Category, sources []PaySource, today time.Time) (CaptureProposal, error) {
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
			category, ok = matchGastoCategory(text+" "+out.CategoryHint+" "+title, categories)
		}
		if ok {
			out.CategoryID = category.ID
			out.Category = category.Name
		}
		source, hasSource := paySourceByID(parsed.AccountID, parsed.DebtID, sources)
		if !hasSource {
			source, hasSource = matchPaySource(text, sources)
		}
		if hasSource {
			if source.Kind == "debt" {
				out.DebtID = source.ID
			} else {
				out.AccountID = source.ID
			}
			out.SourceName = source.Name
		}
		note := cleanGastoTitle(text, title, out.Category, out.SourceName)
		if note != "" {
			out.Title = note
		} else if out.Category != "" {
			out.Title = out.Category
		}
		var questions []string
		if !hasAmount {
			questions = append(questions, "¿De cuánto fue?")
		}
		if out.CategoryID == 0 {
			questions = append(questions, "¿En qué categoría lo anoto?")
		}
		if !hasSource {
			questions = append(questions, "¿Con qué cuenta o tarjeta?")
		}
		out.Question = strings.Join(questions, " ")
		if out.Question == "" {
			out.Confidence = "alta"
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

var categorySynonyms = map[string][]string{
	"farmacia":   {"pastilla", "pastillas", "medicina", "medicinas", "remedio", "remedios", "farmacia", "botica"},
	"salud":      {"pastilla", "pastillas", "medicina", "doctor", "clínica", "clinica", "salud"},
	"comida":     {"almuerzo", "cena", "desayuno", "menú", "menu", "restaurante", "café", "cafe", "comida", "alimento", "alimentos"},
	"alimentos":  {"alimento", "alimentos", "almuerzo", "cena", "desayuno", "comida", "menú", "menu"},
	"transporte": {"taxi", "uber", "bus", "metro", "pasaje", "combustible", "gasolina", "transporte", "llanta", "llantas", "reparacion", "reparación"},
	"hogar":      {"super", "supermercado", "mercado", "casa", "hogar"},
	"casa":       {"super", "supermercado", "mercado", "casa", "hogar"},
	"entretenimiento": {"cine", "netflix", "spotify", "juego", "entrada"},
}

func matchGastoCategory(text string, categories []Category) (Category, bool) {
	if cat, ok := categoryByName(text, "gasto", categories); ok {
		return cat, true
	}
	lower := strings.ToLower(text)
	var best Category
	bestScore := 0
	for _, item := range categories {
		if item.Kind != "gasto" {
			continue
		}
		name := strings.ToLower(strings.TrimSpace(item.Name))
		score := 0
		if name != "" && strings.Contains(lower, name) {
			score = utf8.RuneCountInString(name)
		}
		for key, words := range categorySynonyms {
			if name != key && !strings.Contains(name, key) {
				continue
			}
			for _, word := range words {
				if strings.Contains(lower, word) {
					w := utf8.RuneCountInString(word) + 1
					if w > score {
						score = w
					}
				}
			}
		}
		if score > bestScore {
			best = item
			bestScore = score
		}
	}
	if bestScore == 0 {
		return Category{}, false
	}
	return best, true
}

func paySourceByID(accountID, debtID int64, sources []PaySource) (PaySource, bool) {
	if debtID > 0 {
		for _, src := range sources {
			if src.Kind == "debt" && src.ID == debtID {
				return src, true
			}
		}
	}
	if accountID > 0 {
		for _, src := range sources {
			if src.Kind == "account" && src.ID == accountID {
				return src, true
			}
		}
	}
	return PaySource{}, false
}

func matchPaySource(text string, sources []PaySource) (PaySource, bool) {
	lower := strings.ToLower(text)
	var best PaySource
	bestLen := 0
	for _, src := range sources {
		name := strings.ToLower(strings.TrimSpace(src.Name))
		if utf8.RuneCountInString(name) < 3 {
			continue
		}
		if strings.Contains(lower, name) && utf8.RuneCountInString(name) > bestLen {
			best = src
			bestLen = utf8.RuneCountInString(name)
		}
		// token match: "amex" inside "Amex Gold"
		for _, part := range strings.FieldsFunc(name, func(r rune) bool {
			return r == ' ' || r == '-' || r == '/'
		}) {
			if utf8.RuneCountInString(part) < 3 {
				continue
			}
			if strings.Contains(lower, part) && utf8.RuneCountInString(part) > bestLen {
				best = src
				bestLen = utf8.RuneCountInString(part)
			}
		}
	}
	if bestLen == 0 {
		return PaySource{}, false
	}
	return best, true
}

var (
	gastoVerbRe   = regexp.MustCompile(`(?i)\b(?:gast[eé]|pagu[eé]|compré|compre|pagué|pague)\b`)
	gastoAmountRe = regexp.MustCompile(`(?i)(?:s\s*/\s*)?\d{1,6}(?:[.,]\d{1,2})?\s*(?:soles?)?`)
	gastoPayRe    = regexp.MustCompile(`(?i)\b(?:de\s+)?(?:mi\s+)?(?:la\s+)?(?:tarjeta|cuenta)\b`)
	gastoStopRe   = regexp.MustCompile(`(?i)\b(?:en|por|de|del|la|el|un|una|mi|con|hoy|ayer)\b`)
)

func cleanGastoTitle(text, modelTitle, category, sourceName string) string {
	for _, candidate := range []string{modelTitle, text} {
		note := candidate
		note = gastoVerbRe.ReplaceAllString(note, " ")
		note = gastoAmountRe.ReplaceAllString(note, " ")
		note = gastoPayRe.ReplaceAllString(note, " ")
		if sourceName != "" {
			note = strings.ReplaceAll(note, sourceName, " ")
			note = strings.ReplaceAll(note, strings.ToLower(sourceName), " ")
			for _, part := range strings.Fields(strings.ToLower(sourceName)) {
				if utf8.RuneCountInString(part) >= 3 {
					re := regexp.MustCompile(`(?i)\b` + regexp.QuoteMeta(part) + `\b`)
					note = re.ReplaceAllString(note, " ")
				}
			}
		}
		note = gastoStopRe.ReplaceAllString(note, " ")
		note = clip(note, titleLimit)
		if note == "" {
			continue
		}
		if strings.EqualFold(note, category) && candidate == modelTitle {
			continue
		}
		return note
	}
	return ""
}
