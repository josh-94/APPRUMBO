package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strings"
	"time"

	"hoy/internal/draft"
	"hoy/internal/store"
)

const draftBodyLimit = 8 << 20

func (s *Server) captureDraft(w http.ResponseWriter, r *http.Request) {
	if s.OllamaURL == "" || (s.OllamaModel == "" && s.OllamaTextModel == "") {
		writeError(w, http.StatusServiceUnavailable, "No pude leer eso ahora. Anótalo a mano.")
		return
	}
	var body struct {
		Text   string `json:"text"`
		Intent string `json:"intent"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	text := strings.TrimSpace(body.Text)
	if text == "" {
		writeError(w, http.StatusUnprocessableEntity, "Escribe qué quieres anotar.")
		return
	}
	if utf8Len(text) > 500 {
		text = string([]rune(text)[:500])
	}
	ctx, cancel := context.WithTimeout(r.Context(), 80*time.Second)
	defer cancel()

	intent := strings.ToLower(strings.TrimSpace(body.Intent))
	needMoney := intent == "gasto" || intent == "auto" || intent == ""
	var categories []draft.Category
	var sources []draft.PaySource
	if needMoney {
		uid := currentUser(r)
		items, err := s.Store.Categories(ctx, uid)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "No se pudieron leer las categorías")
			return
		}
		categories = toDraftCategories(items)
		accounts, err := s.Store.MoneyAccounts(ctx, uid)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "No se pudieron leer las cuentas")
			return
		}
		cards, err := s.Store.MoneyCards(ctx, uid)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "No se pudieron leer las tarjetas")
			return
		}
		for _, item := range accounts {
			sources = append(sources, draft.PaySource{ID: item.ID, Name: item.Name, Kind: "account"})
		}
		for _, item := range cards {
			sources = append(sources, draft.PaySource{ID: item.ID, Name: item.Name, Kind: "debt"})
		}
	}
	system, user := draft.CapturePrompt(body.Intent, categories, sources, s.today(), text)
	raw, err := draft.CompleteCapture(ctx, s.OllamaURL, s.draftModel(false), system, user, s.OllamaNumThread)
	if message, failed := draftFailure(err, "No entendí eso. Dilo de otra forma."); failed {
		writeError(w, message.status, message.text)
		return
	}
	proposal, err := draft.NormalizeCapture(text, raw, body.Intent, categories, sources, s.today())
	if err != nil {
		writeError(w, http.StatusBadGateway, "No entendí eso. Dilo de otra forma.")
		return
	}
	proposal.Transcript = text
	writeJSON(w, http.StatusOK, proposal)
}

func (s *Server) moneyDraft(w http.ResponseWriter, r *http.Request) {
	if s.OllamaURL == "" || (s.OllamaModel == "" && s.OllamaTextModel == "") {
		writeError(w, http.StatusServiceUnavailable, "No pude leer eso ahora. Anótalo a mano.")
		return
	}
	in, ok := readDraft(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 80*time.Second)
	defer cancel()

	text := strings.TrimSpace(in.Text)
	if len(in.Audio) > 0 {
		if s.WhisperURL == "" {
			writeError(w, http.StatusServiceUnavailable, "No pude oír eso ahora. Anótalo a mano.")
			return
		}
		transcript, err := draft.Transcribe(ctx, s.WhisperURL, audioFilename(in.AudioName), in.Audio)
		if message, failed := draftFailure(err, "No escuché nada. Prueba de nuevo."); failed {
			writeError(w, message.status, message.text)
			return
		}
		if text != "" {
			text = strings.TrimSpace(transcript + " " + text)
		} else {
			text = transcript
		}
	}
	if text == "" && len(in.Image) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "Escribe, dicta o manda una foto.")
		return
	}
	if utf8Len(text) > 2000 {
		text = string([]rune(text)[:2000])
	}

	categories, err := s.Store.Categories(ctx, currentUser(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudieron leer las categorías")
		return
	}
	modelText := text
	if modelText == "" {
		modelText = "Lee la imagen y anota el gasto o el ingreso."
	}
	system, user := draft.Prompt(toDraftCategories(categories), s.today(), modelText, in.Previous, in.Memory)
	raw, err := draft.Complete(ctx, s.OllamaURL, s.draftModel(len(in.Image) > 0), system, user, in.Image, s.OllamaNumThread)
	if message, failed := draftFailure(err, "No entendí eso. Dilo de otra forma."); failed {
		writeError(w, message.status, message.text)
		return
	}
	proposal, err := draft.Normalize(text, raw, toDraftCategories(categories), s.today(), len(in.Image) > 0, in.Previous)
	if err != nil {
		writeError(w, http.StatusBadGateway, "No entendí eso. Dilo de otra forma.")
		return
	}
	proposal.Transcript = text
	writeJSON(w, http.StatusOK, proposal)
}

func (s *Server) draftModel(image bool) string {
	if image {
		if s.OllamaModel != "" {
			return s.OllamaModel
		}
		return s.OllamaTextModel
	}
	if s.OllamaTextModel != "" {
		return s.OllamaTextModel
	}
	return s.OllamaModel
}

type draftInput struct {
	Text      string
	Audio     []byte
	AudioName string
	Image     []byte
	Previous  *draft.Proposal
	Memory    string
}

func readDraft(w http.ResponseWriter, r *http.Request) (draftInput, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, draftBodyLimit)
	mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if strings.HasPrefix(mediaType, "multipart/") {
		return readDraftForm(w, r)
	}
	var body struct {
		Text     string          `json:"text"`
		Previous json.RawMessage `json:"previous"`
		Memory   string          `json:"memory"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		if tooLarge(err) {
			writeError(w, http.StatusRequestEntityTooLarge, "Ese archivo es muy grande.")
			return draftInput{}, false
		}
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return draftInput{}, false
	}
	previous, ok := decodePrevious(w, body.Previous)
	if !ok {
		return draftInput{}, false
	}
	return draftInput{Text: body.Text, Previous: previous, Memory: body.Memory}, true
}

func readDraftForm(w http.ResponseWriter, r *http.Request) (draftInput, bool) {
	if err := r.ParseMultipartForm(draftBodyLimit); err != nil {
		if tooLarge(err) {
			writeError(w, http.StatusRequestEntityTooLarge, "Ese archivo es muy grande.")
			return draftInput{}, false
		}
		writeError(w, http.StatusBadRequest, "No pude leer el mensaje")
		return draftInput{}, false
	}
	var in draftInput
	in.Text = r.FormValue("text")
	in.Memory = r.FormValue("memory")
	previous, ok := decodePrevious(w, []byte(r.FormValue("previous")))
	if !ok {
		return draftInput{}, false
	}
	in.Previous = previous
	audio, name, err := formFile(r, "audio")
	if err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "Ese audio es muy grande.")
		return draftInput{}, false
	}
	in.Audio = audio
	in.AudioName = name
	image, _, err := formFile(r, "image")
	if err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "Esa foto es muy grande.")
		return draftInput{}, false
	}
	if len(image) > 0 && !isImage(image) {
		writeError(w, http.StatusUnprocessableEntity, "Esa foto no se pudo leer. Prueba con otra.")
		return draftInput{}, false
	}
	in.Image = image
	return in, true
}

func formFile(r *http.Request, field string) ([]byte, string, error) {
	file, header, err := r.FormFile(field)
	if err != nil {
		return nil, "", nil
	}
	defer file.Close()
	payload, err := io.ReadAll(io.LimitReader(file, (4<<20)+1))
	if err != nil {
		return nil, "", err
	}
	if len(payload) > 4<<20 {
		return nil, "", errors.New("too large")
	}
	name := "audio.webm"
	if header != nil && header.Filename != "" {
		name = header.Filename
	}
	return payload, name, nil
}

func decodePrevious(w http.ResponseWriter, raw []byte) (*draft.Proposal, bool) {
	if len(strings.TrimSpace(string(raw))) == 0 {
		return nil, true
	}
	var previous draft.Proposal
	if err := json.Unmarshal(raw, &previous); err != nil {
		writeError(w, http.StatusBadRequest, "El borrador anterior no sirve")
		return nil, false
	}
	return &previous, true
}

func isImage(payload []byte) bool {
	kind := http.DetectContentType(payload)
	return kind == "image/jpeg" || kind == "image/png" || kind == "image/gif" || kind == "image/webp"
}

func toDraftCategories(items []store.Category) []draft.Category {
	out := make([]draft.Category, 0, len(items))
	for _, item := range items {
		out = append(out, draft.Category{ID: item.ID, Name: item.Name, Kind: item.Kind})
	}
	return out
}

type draftMessage struct {
	status int
	text   string
}

func draftFailure(err error, empty string) (draftMessage, bool) {
	if err == nil {
		return draftMessage{}, false
	}
	switch {
	case errors.Is(err, draft.ErrEmpty):
		return draftMessage{http.StatusUnprocessableEntity, empty}, true
	case errors.Is(err, draft.ErrPreparing):
		return draftMessage{http.StatusServiceUnavailable, "El modelo todavía se está preparando."}, true
	case errors.Is(err, draft.ErrTimeout):
		return draftMessage{http.StatusGatewayTimeout, "Tardó demasiado. Prueba con una frase más corta."}, true
	case errors.Is(err, draft.ErrUnreadable):
		return draftMessage{http.StatusBadGateway, "No entendí eso. Dilo de otra forma."}, true
	default:
		return draftMessage{http.StatusServiceUnavailable, "No pude leer eso ahora. Anótalo a mano."}, true
	}
}

func tooLarge(err error) bool {
	var max *http.MaxBytesError
	return errors.As(err, &max)
}

func utf8Len(value string) int {
	return len([]rune(value))
}

func audioFilename(name string) string {
	lower := strings.ToLower(name)
	switch {
	case strings.HasSuffix(lower, ".mp4"), strings.HasSuffix(lower, ".m4a"), strings.HasSuffix(lower, ".aac"):
		return "audio.mp4"
	case strings.HasSuffix(lower, ".mp3"):
		return "audio.mp3"
	case strings.HasSuffix(lower, ".wav"):
		return "audio.wav"
	case strings.HasSuffix(lower, ".ogg"):
		return "audio.ogg"
	default:
		return "audio.webm"
	}
}
