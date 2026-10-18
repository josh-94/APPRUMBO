package httpapi

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"hoy/internal/store"
)

func (s *Server) listEvents(w http.ResponseWriter, r *http.Request) {
	from, to, ok := parseEventRange(w, r, s.Loc)
	if !ok {
		return
	}
	items, err := s.Store.Events(r.Context(), currentUser(r), from, to)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudieron leer los eventos")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": items})
}

func (s *Server) eventByID(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	item, err := s.Store.EventByID(r.Context(), currentUser(r), id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "No está")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo leer el evento")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) createEvent(w http.ResponseWriter, r *http.Request) {
	input, ok := readEventInput(w, r, s.Loc)
	if !ok {
		return
	}
	item, err := s.Store.CreateEvent(r.Context(), currentUser(r), input)
	if errors.Is(err, store.ErrBadMoney) {
		writeError(w, http.StatusUnprocessableEntity, "Revisa título, horario y color del evento")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo crear el evento")
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (s *Server) updateEvent(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	input, ok := readEventInput(w, r, s.Loc)
	if !ok {
		return
	}
	item, err := s.Store.UpdateEvent(r.Context(), currentUser(r), id, input)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "No está")
		return
	}
	if errors.Is(err, store.ErrBadMoney) {
		writeError(w, http.StatusUnprocessableEntity, "Revisa título, horario y color del evento")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo guardar el evento")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) deleteEvent(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := s.Store.DeleteEvent(r.Context(), currentUser(r), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "No está")
			return
		}
		writeError(w, http.StatusInternalServerError, "No se pudo borrar el evento")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func parseEventRange(w http.ResponseWriter, r *http.Request, loc *time.Location) (time.Time, time.Time, bool) {
	fromRaw := strings.TrimSpace(r.URL.Query().Get("from"))
	toRaw := strings.TrimSpace(r.URL.Query().Get("to"))
	if fromRaw == "" || toRaw == "" {
		writeError(w, http.StatusUnprocessableEntity, "Indica from y to")
		return time.Time{}, time.Time{}, false
	}
	from, err := parseDayOrTime(fromRaw, loc, false)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "from inválido")
		return time.Time{}, time.Time{}, false
	}
	to, err := parseDayOrTime(toRaw, loc, true)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "to inválido")
		return time.Time{}, time.Time{}, false
	}
	if !to.After(from) {
		writeError(w, http.StatusUnprocessableEntity, "to debe ser después de from")
		return time.Time{}, time.Time{}, false
	}
	if to.Sub(from) > 400*24*time.Hour {
		writeError(w, http.StatusUnprocessableEntity, "Rango demasiado amplio")
		return time.Time{}, time.Time{}, false
	}
	return from, to, true
}

func parseDayOrTime(raw string, loc *time.Location, endOfDay bool) (time.Time, error) {
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return t, nil
	}
	day, err := time.ParseInLocation("2006-01-02", raw, loc)
	if err != nil {
		return time.Time{}, err
	}
	if endOfDay {
		return day.AddDate(0, 0, 1), nil
	}
	return day, nil
}

func readEventInput(w http.ResponseWriter, r *http.Request, loc *time.Location) (store.EventInput, bool) {
	var body struct {
		Title          string `json:"title"`
		Location       string `json:"location"`
		Description    string `json:"description"`
		AllDay         bool   `json:"allDay"`
		StartsAt       string `json:"startsAt"`
		EndsAt         string `json:"endsAt"`
		Color          string `json:"color"`
		RemindMinutes  *int   `json:"remindMinutes"`
		RepeatRule     string `json:"repeatRule"`
		RepeatWeekdays []int  `json:"repeatWeekdays"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return store.EventInput{}, false
	}
	starts, err := time.Parse(time.RFC3339, strings.TrimSpace(body.StartsAt))
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "startsAt inválido")
		return store.EventInput{}, false
	}
	input := store.EventInput{
		Title:          body.Title,
		Location:       body.Location,
		Description:    body.Description,
		AllDay:         body.AllDay,
		StartsAt:       starts.In(loc),
		Color:          body.Color,
		RemindMinutes:  body.RemindMinutes,
		RepeatRule:     body.RepeatRule,
		RepeatWeekdays: body.RepeatWeekdays,
	}
	if strings.TrimSpace(body.EndsAt) != "" {
		ends, err := time.Parse(time.RFC3339, strings.TrimSpace(body.EndsAt))
		if err != nil {
			writeError(w, http.StatusUnprocessableEntity, "endsAt inválido")
			return store.EventInput{}, false
		}
		endsLocal := ends.In(loc)
		input.EndsAt = &endsLocal
	}
	return input, true
}
