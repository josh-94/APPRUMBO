package httpapi

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"hoy/internal/foods"
	"hoy/internal/store"
)

func (s *Server) gymWeek(w http.ResponseWriter, r *http.Request) {
	week := s.weekParam(r.URL.Query().Get("week"))
	item, err := s.Store.GymWeek(r.Context(), currentUser(r), week)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo leer la semana")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) setGymWeek(w http.ResponseWriter, r *http.Request) {
	var body struct {
		WeekStart string `json:"weekStart"`
		Weekdays  []int  `json:"weekdays"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	week, err := time.ParseInLocation("2006-01-02", body.WeekStart, s.Loc)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "Semana inválida")
		return
	}
	if err := s.Store.SetGymWeek(r.Context(), currentUser(r), week, body.Weekdays); err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo guardar el plan")
		return
	}
	item, err := s.Store.GymWeek(r.Context(), currentUser(r), week)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo leer la semana")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) setGymLog(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Day        string `json:"day"`
		Attended   bool   `json:"attended"`
		AttendedAt string `json:"attendedAt"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	day, err := time.ParseInLocation("2006-01-02", body.Day, s.Loc)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "Día inválido")
		return
	}
	item, err := s.Store.SetGymLog(r.Context(), currentUser(r), day, body.Attended, body.AttendedAt)
	if errors.Is(err, store.ErrBadMoney) {
		writeError(w, http.StatusUnprocessableEntity, "Hora inválida")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo guardar")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) meals(w http.ResponseWriter, r *http.Request) {
	day, err := time.ParseInLocation("2006-01-02", r.URL.Query().Get("day"), s.Loc)
	if err != nil {
		day = s.today()
	}
	items, err := s.Store.Meals(r.Context(), currentUser(r), day)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudieron leer las comidas")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"meals": items})
}

func (s *Server) createMeal(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Day     string `json:"day"`
		Title   string `json:"title"`
		EatenAt string `json:"eatenAt"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	day, err := time.ParseInLocation("2006-01-02", body.Day, s.Loc)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "Día inválido")
		return
	}
	item, err := s.Store.CreateMeal(r.Context(), currentUser(r), day, body.Title, body.EatenAt)
	if errors.Is(err, store.ErrBadMoney) {
		writeError(w, http.StatusUnprocessableEntity, "Ponle un nombre a la comida")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo crear la comida")
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (s *Server) deleteMeal(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := s.Store.DeleteMeal(r.Context(), currentUser(r), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "No está")
			return
		}
		writeError(w, http.StatusInternalServerError, "No se pudo borrar")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) addMealItem(w http.ResponseWriter, r *http.Request) {
	mealID, ok := pathID(w, r)
	if !ok {
		return
	}
	var body store.MealItem
	if err := readJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	item, err := s.Store.AddMealItem(r.Context(), currentUser(r), mealID, body)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "No está")
		return
	}
	if errors.Is(err, store.ErrBadMoney) {
		writeError(w, http.StatusUnprocessableEntity, "Revisa el alimento y los gramos")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo añadir")
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (s *Server) deleteMealItem(w http.ResponseWriter, r *http.Request) {
	mealID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || mealID <= 0 {
		writeError(w, http.StatusBadRequest, "ID inválido")
		return
	}
	itemID, err := strconv.ParseInt(r.PathValue("itemId"), 10, 64)
	if err != nil || itemID <= 0 {
		writeError(w, http.StatusBadRequest, "ID inválido")
		return
	}
	if err := s.Store.DeleteMealItem(r.Context(), currentUser(r), mealID, itemID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "No está")
			return
		}
		writeError(w, http.StatusInternalServerError, "No se pudo borrar")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) foodSearch(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		writeJSON(w, http.StatusOK, map[string]any{"foods": []foods.Hit{}})
		return
	}
	client := s.Foods
	if client == nil {
		client = foods.NewClient()
	}
	hits, err := client.Search(r.Context(), query)
	if err != nil {
		writeError(w, http.StatusBadGateway, "No pude buscar alimentos ahora.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"foods": hits})
}

func (s *Server) weekParam(raw string) time.Time {
	if raw == "" {
		return store.WeekStart(s.today())
	}
	day, err := time.ParseInLocation("2006-01-02", raw, s.Loc)
	if err != nil {
		return store.WeekStart(s.today())
	}
	return store.WeekStart(day)
}
