package httpapi

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"hoy/internal/store"
)

func (s *Server) updateHabit(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var body struct {
		Name  string `json:"name"`
		NGoal int    `json:"nGoal"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	if err := s.Store.UpdateHabit(r.Context(), currentUser(r), id, body.Name, body.NGoal); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "No está")
			return
		}
		if errors.Is(err, store.ErrBadMoney) {
			writeError(w, http.StatusUnprocessableEntity, "El hábito no se pudo guardar")
			return
		}
		writeError(w, http.StatusInternalServerError, "No se pudo guardar el hábito")
		return
	}
	items, err := s.Store.Habits(r.Context(), currentUser(r), s.today())
	if err != nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	for _, item := range items {
		if item.ID == id {
			writeJSON(w, http.StatusOK, item)
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) deleteHabit(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := s.Store.DeleteHabit(r.Context(), currentUser(r), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "No está")
			return
		}
		writeError(w, http.StatusInternalServerError, "No se pudo borrar el hábito")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) goals(w http.ResponseWriter, r *http.Request) {
	items, err := s.Store.Goals(r.Context(), currentUser(r), s.today())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudieron leer las metas")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"goals": items})
}

func (s *Server) saveGoal(w http.ResponseWriter, r *http.Request) {
	var body store.Goal
	if err := readJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	if id, ok := optionalPathID(r); ok {
		body.ID = id
	}
	item, err := s.Store.SaveGoal(r.Context(), currentUser(r), body)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "No está")
		return
	}
	if errors.Is(err, store.ErrBadMoney) {
		writeError(w, http.StatusUnprocessableEntity, "Revisa nombre y monto de la meta")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo guardar la meta")
		return
	}
	status := http.StatusCreated
	if body.ID != 0 {
		status = http.StatusOK
	}
	writeJSON(w, status, item)
}

func (s *Server) deleteGoal(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := s.Store.DeleteGoal(r.Context(), currentUser(r), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "No está")
			return
		}
		writeError(w, http.StatusInternalServerError, "No se pudo borrar la meta")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) contributeGoal(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var body struct {
		AmountCents int64  `json:"amountCents"`
		AccountID   int64  `json:"accountId"`
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
			writeError(w, http.StatusUnprocessableEntity, "Día inválido")
			return
		}
		day = parsed
	}
	item, err := s.Store.ContributeGoal(r.Context(), currentUser(r), id, body.AccountID, body.AmountCents, day, body.Note)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "No está")
		return
	}
	if errors.Is(err, store.ErrBadMoney) {
		writeError(w, http.StatusUnprocessableEntity, "Monto inválido")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo abonar")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) workoutRoutines(w http.ResponseWriter, r *http.Request) {
	items, err := s.Store.WorkoutRoutines(r.Context(), currentUser(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudieron leer las rutinas")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"routines": items})
}

func (s *Server) saveWorkoutRoutine(w http.ResponseWriter, r *http.Request) {
	var body store.WorkoutRoutine
	if err := readJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	if id, ok := optionalPathID(r); ok {
		body.ID = id
	}
	item, err := s.Store.SaveWorkoutRoutine(r.Context(), currentUser(r), body)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "No está")
		return
	}
	if errors.Is(err, store.ErrBadMoney) {
		writeError(w, http.StatusUnprocessableEntity, "Ponle un nombre a la rutina")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo guardar la rutina")
		return
	}
	status := http.StatusCreated
	if r.Method == http.MethodPatch {
		status = http.StatusOK
	}
	writeJSON(w, status, item)
}

func (s *Server) deleteWorkoutRoutine(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := s.Store.DeleteWorkoutRoutine(r.Context(), currentUser(r), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "No está")
			return
		}
		writeError(w, http.StatusInternalServerError, "No se pudo borrar la rutina")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) workoutSessions(w http.ResponseWriter, r *http.Request) {
	from := s.today().AddDate(0, 0, -60)
	to := s.today().AddDate(0, 0, 1)
	items, err := s.Store.WorkoutSessions(r.Context(), currentUser(r), from, to)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudieron leer las sesiones")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessions": items})
}

func (s *Server) addWorkoutSession(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RoutineID   int64             `json:"routineId"`
		Day         string            `json:"day"`
		Note        string            `json:"note"`
		DurationMin int               `json:"durationMin"`
		Sets        []store.WorkoutSet `json:"sets"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	day := s.today()
	if body.Day != "" {
		parsed, err := time.ParseInLocation("2006-01-02", body.Day, s.Loc)
		if err != nil {
			writeError(w, http.StatusUnprocessableEntity, "Día inválido")
			return
		}
		day = parsed
	}
	item, err := s.Store.AddWorkoutSession(r.Context(), currentUser(r), store.WorkoutSession{
		RoutineID:   body.RoutineID,
		Note:        body.Note,
		DurationMin: body.DurationMin,
		Sets:        body.Sets,
	}, day)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "No está")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo guardar la sesión")
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (s *Server) workoutRecords(w http.ResponseWriter, r *http.Request) {
	items, err := s.Store.WorkoutRecords(r.Context(), currentUser(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudieron leer los récords")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"records": items})
}

func (s *Server) homePrefs(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		cards, err := s.Store.HomePrefs(r.Context(), currentUser(r))
		if err != nil {
			writeError(w, http.StatusInternalServerError, "No se pudieron leer las preferencias")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"cards": cards})
		return
	}
	var body struct {
		Cards []string `json:"cards"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	if err := s.Store.SaveHomePrefs(r.Context(), currentUser(r), body.Cards); err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudieron guardar")
		return
	}
	cards, _ := s.Store.HomePrefs(r.Context(), currentUser(r))
	writeJSON(w, http.StatusOK, map[string]any{"cards": cards})
}

func optionalPathID(r *http.Request) (int64, bool) {
	raw := r.PathValue("id")
	if raw == "" {
		return 0, false
	}
	var id int64
	for _, ch := range raw {
		if ch < '0' || ch > '9' {
			return 0, false
		}
		id = id*10 + int64(ch-'0')
	}
	return id, id > 0
}

func (s *Server) agenda(w http.ResponseWriter, r *http.Request) {
	dayRaw := strings.TrimSpace(r.URL.Query().Get("day"))
	day := s.today()
	if dayRaw != "" {
		parsed, err := time.ParseInLocation("2006-01-02", dayRaw, s.Loc)
		if err != nil {
			writeError(w, http.StatusUnprocessableEntity, "Día inválido")
			return
		}
		day = parsed
	}
	from := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, s.Loc)
	to := from.AddDate(0, 0, 1)
	userID := currentUser(r)
	tasks, err := s.Store.Tasks(r.Context(), userID, from.AddDate(0, 0, -1))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo armar la agenda")
		return
	}
	habits, err := s.Store.Habits(r.Context(), userID, s.today())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo armar la agenda")
		return
	}
	sessions, err := s.Store.WorkoutSessions(r.Context(), userID, from, to)
	if err != nil {
		sessions = nil
	}
	dayKey := from.Format("2006-01-02")
	items := []map[string]any{}
	for _, item := range tasks {
		if item.Status != "open" {
			continue
		}
		dueKey := ""
		hour := ""
		if item.DueAt != nil {
			local := item.DueAt.In(s.Loc)
			dueKey = local.Format("2006-01-02")
			hour = local.Format("15:04")
		}
		remindMatch := item.RemindAt != nil && sameDay(*item.RemindAt, from)
		if dueKey != dayKey && !remindMatch {
			continue
		}
		items = append(items, map[string]any{
			"type":    "task",
			"id":      item.ID,
			"title":   item.Title,
			"hour":    hour,
			"payKind": item.PayKind,
			"payRef":  item.PayRef,
		})
	}
	for _, habit := range habits {
		items = append(items, map[string]any{
			"type":   "habit",
			"id":     habit.ID,
			"title":  habit.Name,
			"done":   containsDay(habit.Checks, dayKey),
			"nGoal":  habit.NGoal,
			"doneWeek": habit.DoneThisWeek,
		})
	}
	for _, session := range sessions {
		items = append(items, map[string]any{
			"type":  "workout",
			"id":    session.ID,
			"title": session.RoutineName,
			"note":  session.Note,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"day": dayKey, "items": items})
}

func sameDay(t time.Time, day time.Time) bool {
	y1, m1, d1 := t.In(day.Location()).Date()
	y2, m2, d2 := day.Date()
	return y1 == y2 && m1 == m2 && d1 == d2
}

func containsDay(days []string, day string) bool {
	for _, item := range days {
		if item == day {
			return true
		}
	}
	return false
}
