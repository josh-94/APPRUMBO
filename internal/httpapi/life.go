package httpapi

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"hoy/internal/store"
)

func (s *Server) habits(w http.ResponseWriter, r *http.Request) {
	items, err := s.Store.Habits(r.Context(), currentUser(r), s.today())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudieron leer los hábitos")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"habits": items})
}

func (s *Server) createHabit(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name  string `json:"name"`
		NGoal int    `json:"nGoal"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" || len([]rune(name)) > 80 {
		writeError(w, http.StatusUnprocessableEntity, "El nombre del hábito no sirve")
		return
	}
	id, err := s.Store.CreateHabit(r.Context(), currentUser(r), name, body.NGoal)
	if errors.Is(err, store.ErrHabitLimit) {
		writeError(w, http.StatusUnprocessableEntity, "Máximo 7 hábitos. Archiva uno para crear otro.")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo crear el hábito")
		return
	}
	items, err := s.Store.Habits(r.Context(), currentUser(r), s.today())
	if err != nil {
		writeJSON(w, http.StatusCreated, map[string]any{"id": id})
		return
	}
	for _, item := range items {
		if item.ID == id {
			writeJSON(w, http.StatusCreated, item)
			return
		}
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

func (s *Server) habitCheck(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	day, ok := s.checkDay(w, r)
	if !ok {
		return
	}
	on := r.Method == http.MethodPost
	if err := s.Store.SetHabitCheck(r.Context(), currentUser(r), id, day, on); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "No está")
			return
		}
		writeError(w, http.StatusInternalServerError, "No se pudo guardar el hábito")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) checkDay(w http.ResponseWriter, r *http.Request) (time.Time, bool) {
	raw := r.URL.Query().Get("day")
	if r.Method == http.MethodPost && raw == "" {
		var body struct {
			Day string `json:"day"`
		}
		_ = readJSON(w, r, &body)
		raw = body.Day
	}
	today := s.today()
	if raw == "" {
		return today, true
	}
	day, err := time.ParseInLocation("2006-01-02", raw, s.Loc)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "Ese día no parece correcto")
		return time.Time{}, false
	}
	if day.After(today) {
		writeError(w, http.StatusUnprocessableEntity, "No se puede marcar un día que no llegó")
		return time.Time{}, false
	}
	return day, true
}

func (s *Server) moneyMonth(w http.ResponseWriter, r *http.Request) {
	from, to := s.monthRange(r.URL.Query().Get("month"))
	summary, err := s.Store.Month(r.Context(), currentUser(r), from, to)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo leer la plata")
		return
	}
	var remaining *int64
	if summary.IncomeCents > 0 {
		value := summary.IncomeCents - summary.SpentCents
		remaining = &value
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"spentCents":     summary.SpentCents,
		"incomeCents":    summary.IncomeCents,
		"remainingCents": remaining,
		"accounts":       summary.Accounts,
		"categories":     summary.Categories,
		"movements":      summary.Movements,
	})
}

func (s *Server) createMovement(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Kind        string `json:"kind"`
		AmountCents int64  `json:"amountCents"`
		AccountID   int64  `json:"accountId"`
		CategoryID  int64  `json:"categoryId"`
		Day         string `json:"day"`
		Note        string `json:"note"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	day := s.today()
	if body.Day != "" {
		parsed, err := time.ParseInLocation("2006-01-02", body.Day, s.Loc)
		if err != nil {
			writeError(w, http.StatusUnprocessableEntity, "Ese día no parece correcto")
			return
		}
		day = parsed
	}
	if len([]rune(strings.Join(strings.Fields(body.Note), " "))) > 80 {
		writeError(w, http.StatusUnprocessableEntity, "El detalle cabe en 80 letras.")
		return
	}
	item, err := s.Store.CreateMovement(r.Context(), currentUser(r), store.Movement{
		Kind:        body.Kind,
		AmountCents: body.AmountCents,
		AccountID:   body.AccountID,
		CategoryID:  body.CategoryID,
		Note:        body.Note,
	}, day)
	if errors.Is(err, store.ErrBadMoney) {
		writeError(w, http.StatusUnprocessableEntity, "Ese monto no parece correcto. Usa solo números, por ejemplo 25.50.")
		return
	}
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "No está")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo anotar")
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (s *Server) createCategory(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
		Kind string `json:"kind"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	item, err := s.Store.CreateCategory(r.Context(), currentUser(r), body.Name, body.Kind)
	if errors.Is(err, store.ErrBadMoney) {
		writeError(w, http.StatusUnprocessableEntity, "Ponle un nombre de hasta 40 letras.")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo crear la categoría")
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (s *Server) exportData(w http.ResponseWriter, r *http.Request) {
	userID := currentUser(r)
	tasks, err := s.Store.Tasks(r.Context(), userID, time.Now().AddDate(0, -6, 0))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo exportar")
		return
	}
	out := make([]taskDTO, 0, len(tasks))
	for _, item := range tasks {
		out = append(out, s.toTask(item))
	}
	bundle, err := s.Store.ExportBundle(r.Context(), userID, s.today())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo exportar")
		return
	}
	bundle["tasks"] = out
	writeJSON(w, http.StatusOK, bundle)
}

func (s *Server) today() time.Time {
	now := time.Now().In(s.Loc)
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, s.Loc)
}

func (s *Server) monthRange(raw string) (time.Time, time.Time) {
	now := s.today()
	year, month := now.Year(), now.Month()
	if len(raw) == 7 {
		if parsed, err := time.ParseInLocation("2006-01", raw, s.Loc); err == nil {
			year, month = parsed.Year(), parsed.Month()
		}
	}
	from := time.Date(year, month, 1, 0, 0, 0, 0, s.Loc)
	return from, from.AddDate(0, 1, 0)
}
