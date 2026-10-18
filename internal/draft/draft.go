package draft

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

const noteLimit = 80

var (
	ErrUnavailable = errors.New("unavailable")
	ErrPreparing   = errors.New("preparing")
	ErrTimeout     = errors.New("timeout")
	ErrEmpty       = errors.New("empty")
	ErrUnreadable  = errors.New("unreadable")
)

var httpClient = &http.Client{Timeout: 75 * time.Second}

type Category struct {
	ID   int64
	Name string
	Kind string
}

type Proposal struct {
	Kind        string `json:"kind"`
	AmountCents int64  `json:"amountCents"`
	CategoryID  int64  `json:"categoryId"`
	Category    string `json:"category"`
	Note        string `json:"note"`
	Day         string `json:"day"`
	Confidence  string `json:"confidence"`
	Question    string `json:"question"`
	Transcript  string `json:"transcript,omitempty"`
}

type modelJSON struct {
	Kind        string          `json:"kind"`
	AmountCents json.RawMessage `json:"amountCents"`
	CategoryID  int64           `json:"categoryId"`
	Note        string          `json:"note"`
	Day         string          `json:"day"`
	Confidence  string          `json:"confidence"`
	Question    string          `json:"question"`
}

func Prompt(categories []Category, today time.Time, text string, previous *Proposal) (string, string) {
	var gastos, ingresos strings.Builder
	for _, item := range categories {
		line := fmt.Sprintf("- %d %s\n", item.ID, item.Name)
		if item.Kind == "ingreso" {
			ingresos.WriteString(line)
			continue
		}
		if item.Kind == "gasto" {
			gastos.WriteString(line)
		}
	}
	if gastos.Len() == 0 {
		gastos.WriteString("(ninguna)\n")
	}
	if ingresos.Len() == 0 {
		ingresos.WriteString("(ninguna)\n")
	}
	system := fmt.Sprintf(`Eres Rumbo. Conviertes un mensaje en un movimiento de plata y respondes solo JSON.
Hoy es %s. La moneda es soles.

Categorías de gasto:
%s
Categorías de ingreso:
%s
Reglas:
- kind es "gasto" o "ingreso".
- amountCents son centavos: 18.50 soles es 1850. Si no ves un monto, pon amountCents en null. No inventes el monto.
- categoryId tiene que ser uno de los ids de arriba y del mismo kind. Si no encaja, pon 0.
- note es un detalle corto, máximo 80 letras. Puede ir vacío.
- day es YYYY-MM-DD. Si no dicen el día, usa hoy. Nunca un día futuro.
- confidence es "alta" o "baja".
- question es una pregunta corta si falta el monto o la categoría. Si está completo, déjala vacía.`,
		today.Format("2006-01-02"), gastos.String(), ingresos.String())

	user := text
	if previous != nil && (previous.AmountCents > 0 || previous.CategoryID > 0 || previous.Note != "") {
		raw, _ := json.Marshal(previous)
		user = "Borrador anterior:\n" + string(raw) + "\n\nCorrección:\n" + text
	}
	return system, user
}

func Normalize(text, raw string, categories []Category, today time.Time, trustModelAmount bool, previous *Proposal) (Proposal, error) {
	parsed, err := parseModel(raw)
	if err != nil {
		return Proposal{}, ErrUnreadable
	}
	kind := "gasto"
	if parsed.Kind == "ingreso" {
		kind = "ingreso"
	}
	amount, hasAmount := AmountFromText(text)
	if !hasAmount && trustModelAmount {
		amount, hasAmount = amountFromModel(parsed.AmountCents)
	}
	if !hasAmount && previous != nil && previous.AmountCents > 0 {
		amount = previous.AmountCents
		hasAmount = true
	}
	if amount <= 0 || amount > 100_000_000 {
		hasAmount = false
		amount = 0
	}

	category, ok := categoryByID(parsed.CategoryID, kind, categories)
	if !ok {
		category, ok = categoryByName(text, kind, categories)
	}
	if !ok && previous != nil {
		category, ok = categoryByID(previous.CategoryID, kind, categories)
	}
	note := clip(parsed.Note, noteLimit)
	if note == "" && previous != nil {
		note = clip(previous.Note, noteLimit)
	}
	day := resolveDay(text, parsed.Day, today, previous)

	out := Proposal{
		Kind:        kind,
		AmountCents: amount,
		Note:        note,
		Day:         day.Format("2006-01-02"),
		Confidence:  "baja",
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
	return out, nil
}

func AmountFromText(text string) (int64, bool) {
	text = strings.TrimSpace(text)
	if text == "" {
		return 0, false
	}
	if cents, ok := lastMoney(moneyPhrase, text); ok {
		return cents, true
	}
	if cents, ok := lastMoney(decimalNum, text); ok {
		return cents, true
	}
	if m := onlyNum.FindStringSubmatch(text); m != nil {
		return parseSoles(m[1])
	}
	if m := trailingNum.FindStringSubmatch(text); m != nil {
		return parseSoles(m[1])
	}
	return 0, false
}

var (
	moneyPhrase = regexp.MustCompile(`(?i)(?:(?:s\s*/|soles?)\s*(\d{1,6}(?:[.,]\d{1,2})?)|(\d{1,6}(?:[.,]\d{1,2})?)\s*soles?)`)
	decimalNum  = regexp.MustCompile(`(\d{1,6}[.,]\d{1,2})`)
	onlyNum     = regexp.MustCompile(`^(\d{1,6}(?:[.,]\d{1,2})?)$`)
	trailingNum = regexp.MustCompile(`(?i)^[\p{L}\s]{1,48}?(\d{1,6}(?:[.,]\d{1,2})?)\s*$`)
)

func lastMoney(re *regexp.Regexp, text string) (int64, bool) {
	matches := re.FindAllStringSubmatch(text, -1)
	if len(matches) == 0 {
		return 0, false
	}
	last := matches[len(matches)-1]
	for _, part := range last[1:] {
		if part != "" {
			return parseSoles(part)
		}
	}
	return 0, false
}

func parseSoles(raw string) (int64, bool) {
	raw = strings.ReplaceAll(strings.TrimSpace(raw), ",", ".")
	if raw == "" {
		return 0, false
	}
	whole, frac, hasFrac := strings.Cut(raw, ".")
	soles, err := strconv.ParseInt(whole, 10, 64)
	if err != nil || soles < 0 {
		return 0, false
	}
	cents := soles * 100
	if hasFrac {
		if len(frac) > 2 {
			frac = frac[:2]
		}
		frac += "00"
		part, err := strconv.ParseInt(frac[:2], 10, 64)
		if err != nil {
			return 0, false
		}
		cents += part
	}
	if cents <= 0 {
		return 0, false
	}
	return cents, true
}

func amountFromModel(raw json.RawMessage) (int64, bool) {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return 0, false
	}
	if strings.Contains(trimmed, ".") {
		literal := strings.Trim(trimmed, `"`)
		if cents, ok := parseSoles(literal); ok {
			return cents, true
		}
	}
	var whole int64
	if err := json.Unmarshal(raw, &whole); err == nil && whole > 0 {
		return whole, true
	}
	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		return parseSoles(text)
	}
	return 0, false
}

func parseModel(raw string) (modelJSON, error) {
	raw = strings.TrimSpace(raw)
	if start := strings.Index(raw, "{"); start >= 0 {
		if end := strings.LastIndex(raw, "}"); end > start {
			raw = raw[start : end+1]
		}
	}
	var parsed modelJSON
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return modelJSON{}, err
	}
	return parsed, nil
}

func categoryByID(id int64, kind string, categories []Category) (Category, bool) {
	if id == 0 {
		return Category{}, false
	}
	for _, item := range categories {
		if item.ID == id && item.Kind == kind {
			return item, true
		}
	}
	return Category{}, false
}

func categoryByName(text, kind string, categories []Category) (Category, bool) {
	lower := strings.ToLower(text)
	var best Category
	bestLen := 0
	for _, item := range categories {
		if item.Kind != kind {
			continue
		}
		name := strings.ToLower(strings.TrimSpace(item.Name))
		if utf8.RuneCountInString(name) < 3 {
			continue
		}
		if strings.Contains(lower, name) && utf8.RuneCountInString(name) > bestLen {
			best = item
			bestLen = utf8.RuneCountInString(name)
		}
	}
	if bestLen == 0 {
		return Category{}, false
	}
	return best, true
}

func resolveDay(text, raw string, today time.Time, previous *Proposal) time.Time {
	today = time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, today.Location())
	if strings.Contains(strings.ToLower(text), "ayer") {
		return today.AddDate(0, 0, -1)
	}
	if day, ok := parseDay(raw, today.Location()); ok && !day.After(today) {
		return day
	}
	if previous != nil {
		if day, ok := parseDay(previous.Day, today.Location()); ok && !day.After(today) {
			return day
		}
	}
	return today
}

func parseDay(raw string, loc *time.Location) (time.Time, bool) {
	day, err := time.ParseInLocation("2006-01-02", strings.TrimSpace(raw), loc)
	if err != nil {
		return time.Time{}, false
	}
	return day, true
}

func clip(value string, limit int) string {
	value = strings.Join(strings.Fields(value), " ")
	runes := []rune(value)
	if len(runes) > limit {
		return string(runes[:limit])
	}
	return value
}

func Complete(ctx context.Context, baseURL, model, system, user string, image []byte) (string, error) {
	message := map[string]any{
		"role":    "user",
		"content": user,
	}
	if len(image) > 0 {
		message["images"] = []string{base64.StdEncoding.EncodeToString(image)}
	}
	body, err := json.Marshal(map[string]any{
		"model":  model,
		"stream": false,
		"format": "json",
		"messages": []any{
			map[string]string{"role": "system", "content": system},
			message,
		},
		"options": map[string]any{
			"temperature": 0.1,
			"num_ctx":     2048,
			"num_predict": 200,
		},
	})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(baseURL, "/")+"/api/chat", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := httpClient.Do(req)
	if err != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return "", ErrTimeout
		}
		return "", ErrUnavailable
	}
	defer resp.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", ErrUnavailable
	}
	if resp.StatusCode == http.StatusNotFound || (resp.StatusCode >= 400 && bytes.Contains(bytes.ToLower(payload), []byte("not found"))) {
		return "", ErrPreparing
	}
	if resp.StatusCode >= 400 {
		return "", ErrUnavailable
	}
	var decoded struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil || strings.TrimSpace(decoded.Message.Content) == "" {
		return "", ErrUnreadable
	}
	return decoded.Message.Content, nil
}

func Transcribe(ctx context.Context, baseURL, filename string, audio []byte) (string, error) {
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return "", err
	}
	if _, err := part.Write(audio); err != nil {
		return "", err
	}
	_ = writer.WriteField("response_format", "json")
	_ = writer.WriteField("language", "es")
	if err := writer.Close(); err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(baseURL, "/")+"/inference", &buf)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	resp, err := httpClient.Do(req)
	if err != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return "", ErrTimeout
		}
		return "", ErrUnavailable
	}
	defer resp.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil || resp.StatusCode >= 400 {
		return "", ErrUnavailable
	}
	var decoded struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return "", ErrUnreadable
	}
	text := strings.TrimSpace(decoded.Text)
	if text == "" {
		return "", ErrEmpty
	}
	return text, nil
}
