package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"

	"hoy/internal/schedule"
	"hoy/internal/session"
	"hoy/internal/store"
	"hoy/internal/task"
)

// Hash of a value that is never a real password, so a missing account still spends a bcrypt compare.
var dummyPasswordHash = []byte("$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy")

type Server struct {
	Store          *store.Store
	Redis          *redis.Client
	Loc            *time.Location
	SessionSecret  string
	CookieSecure   bool
	VAPIDPublic    string
	GoogleID       string
	GoogleSecret   string
	GoogleRedirect string
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("POST /api/session", s.login)
	mux.HandleFunc("POST /api/register", s.register)
	mux.HandleFunc("GET /api/auth/google", s.googleStart)
	mux.HandleFunc("GET /api/auth/google/callback", s.googleCallback)
	mux.HandleFunc("DELETE /api/session", s.logout)
	mux.HandleFunc("GET /api/session", s.protected(s.sessionInfo))
	mux.HandleFunc("GET /api/lists", s.protected(s.lists))
	mux.HandleFunc("POST /api/lists", s.protected(s.createList))
	mux.HandleFunc("PATCH /api/lists/{id}", s.protected(s.renameList))
	mux.HandleFunc("DELETE /api/lists/{id}", s.protected(s.deleteList))
	mux.HandleFunc("POST /api/lists/{id}/order", s.protected(s.reorder))
	mux.HandleFunc("GET /api/tasks", s.protected(s.tasks))
	mux.HandleFunc("GET /api/tasks/{id}", s.protected(s.taskByID))
	mux.HandleFunc("POST /api/tasks", s.protected(s.createTask))
	mux.HandleFunc("PATCH /api/tasks/{id}", s.protected(s.updateTask))
	mux.HandleFunc("DELETE /api/tasks/{id}", s.protected(s.deleteTask))
	mux.HandleFunc("POST /api/tasks/{id}/done", s.protected(s.doneTask))
	mux.HandleFunc("POST /api/tasks/{id}/today", s.protected(s.todayTask))
	mux.HandleFunc("POST /api/tasks/{id}/later", s.protected(s.laterTask))
	mux.HandleFunc("GET /api/push/vapid", s.protected(s.vapid))
	mux.HandleFunc("POST /api/push/subscriptions", s.protected(s.savePush))
	mux.HandleFunc("DELETE /api/push/subscriptions", s.protected(s.deletePush))
	mux.HandleFunc("GET /api/habits", s.protected(s.habits))
	mux.HandleFunc("POST /api/habits", s.protected(s.createHabit))
	mux.HandleFunc("POST /api/habits/{id}/checks", s.protected(s.habitCheck))
	mux.HandleFunc("DELETE /api/habits/{id}/checks", s.protected(s.habitCheck))
	mux.HandleFunc("GET /api/money/month", s.protected(s.moneyMonth))
	mux.HandleFunc("POST /api/movements", s.protected(s.createMovement))
	mux.HandleFunc("GET /api/export", s.protected(s.exportData))
	return mux
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	if err := s.Store.Ping(r.Context()); err != nil {
		writeError(w, http.StatusServiceUnavailable, "base de datos")
		return
	}
	if s.Redis != nil {
		if err := s.Redis.Ping(r.Context()).Err(); err != nil {
			writeError(w, http.StatusServiceUnavailable, "redis")
			return
		}
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	email, password, ok := s.readCredentials(w, r)
	if !ok {
		return
	}
	id, hash, err := s.Store.UserByEmail(r.Context(), email)
	stored := dummyPasswordHash
	if err == nil && hash != nil {
		stored = []byte(*hash)
	}
	if bcrypt.CompareHashAndPassword(stored, []byte(password)) != nil || err != nil || hash == nil {
		writeError(w, http.StatusUnauthorized, "Correo o contraseña incorrectos")
		return
	}
	s.setSession(w, id, time.Now().Add(30*24*time.Hour))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	email, password, ok := s.readCredentials(w, r)
	if !ok {
		return
	}
	if len(password) < 8 {
		writeError(w, http.StatusUnprocessableEntity, "La contraseña necesita al menos 8 caracteres")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo crear la cuenta")
		return
	}
	id, err := s.Store.Register(r.Context(), email, string(hash))
	if errors.Is(err, store.ErrEmailTaken) {
		writeError(w, http.StatusConflict, "Ese correo ya tiene cuenta")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo crear la cuenta")
		return
	}
	s.setSession(w, id, time.Now().Add(30*24*time.Hour))
	writeJSON(w, http.StatusCreated, map[string]bool{"ok": true})
}

func (s *Server) readCredentials(w http.ResponseWriter, r *http.Request) (string, string, bool) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return "", "", false
	}
	email, ok := normalizeEmail(body.Email)
	if !ok {
		writeError(w, http.StatusUnprocessableEntity, "El correo no sirve")
		return "", "", false
	}
	return email, body.Password, true
}

func normalizeEmail(value string) (string, bool) {
	email := strings.ToLower(strings.TrimSpace(value))
	parsed, err := mail.ParseAddress(email)
	if err != nil || parsed.Address != email || len(email) > 200 {
		return "", false
	}
	return email, true
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     session.CookieName(),
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   s.CookieSecure,
		MaxAge:   -1,
	})
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) sessionInfo(w http.ResponseWriter, r *http.Request) {
	email, _ := s.Store.Email(r.Context(), currentUser(r))
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":    true,
		"push":  s.VAPIDPublic != "",
		"email": email,
	})
}

func (s *Server) lists(w http.ResponseWriter, r *http.Request) {
	lists, err := s.Store.Lists(r.Context(), currentUser(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudieron leer las listas")
		return
	}
	out := make([]listDTO, 0, len(lists))
	for _, list := range lists {
		out = append(out, toList(list))
	}
	writeJSON(w, http.StatusOK, map[string]any{"lists": out})
}

func (s *Server) createList(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" || len([]rune(name)) > 80 {
		writeError(w, http.StatusUnprocessableEntity, "El nombre de la lista no sirve")
		return
	}
	list, err := s.Store.CreateList(r.Context(), currentUser(r), name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo crear la lista")
		return
	}
	writeJSON(w, http.StatusCreated, toList(list))
}

func (s *Server) renameList(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" || len([]rune(name)) > 80 {
		writeError(w, http.StatusUnprocessableEntity, "El nombre de la lista no sirve")
		return
	}
	list, err := s.Store.RenameList(r.Context(), currentUser(r), id, name)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "Lista no encontrada")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo renombrar")
		return
	}
	writeJSON(w, http.StatusOK, toList(list))
}

func (s *Server) deleteList(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	err := s.Store.DeleteList(r.Context(), currentUser(r), id)
	if errors.Is(err, store.ErrLastList) {
		writeError(w, http.StatusConflict, "Deja al menos una lista")
		return
	}
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "Lista no encontrada")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo borrar la lista")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) reorder(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var body struct {
		TaskIDs []int64 `json:"taskIds"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	if err := s.Store.Reorder(r.Context(), currentUser(r), id, body.TaskIDs); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "Hay una tarea que no está en la lista")
			return
		}
		writeError(w, http.StatusInternalServerError, "No se pudo reordenar")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) taskByID(w http.ResponseWriter, r *http.Request) {
	item, ok := s.loadTask(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, s.toTask(item))
}

func (s *Server) tasks(w http.ResponseWriter, r *http.Request) {
	since := schedule.StartOfDay(time.Now(), s.Loc).AddDate(0, 0, -14)
	all, err := s.Store.Tasks(r.Context(), currentUser(r), since)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudieron leer las tareas")
		return
	}
	now := time.Now()
	view := r.URL.Query().Get("view")
	var selected []task.Task
	switch view {
	case "myday":
		for _, item := range all {
			if task.InMyDay(item, now, s.Loc) {
				selected = append(selected, item)
			}
		}
		sortMyDay(selected)
	case "week":
		for _, item := range all {
			if task.InWeek(item, now, s.Loc) {
				selected = append(selected, item)
			}
		}
		sortByDue(selected)
	case "moment":
		start := schedule.StartOfDay(now, s.Loc)
		for _, item := range all {
			if item.Status != task.StatusOpen {
				continue
			}
			if item.CompletedAt != nil && schedule.SameDay(*item.CompletedAt, now, s.Loc) {
				continue
			}
			if item.DueAt != nil && !item.DueAt.Before(start) && schedule.SectionFor(item.DueAt, now, s.Loc) == schedule.SectionToday {
				continue
			}
			selected = append(selected, item)
		}
		sortMoment(selected, now, s.Loc)
	default:
		listID, err := strconv.ParseInt(r.URL.Query().Get("listId"), 10, 64)
		if err != nil {
			writeError(w, http.StatusBadRequest, "Falta la lista")
			return
		}
		for _, item := range all {
			if item.ListID == listID {
				selected = append(selected, item)
			}
		}
		if r.URL.Query().Get("sort") == "manual" {
			sortManual(selected)
		} else {
			sortBySection(selected, now, s.Loc)
		}
	}
	out := make([]taskDTO, 0, len(selected))
	for _, item := range selected {
		out = append(out, s.toTask(item))
	}
	writeJSON(w, http.StatusOK, map[string]any{"tasks": out})
}

func (s *Server) createTask(w http.ResponseWriter, r *http.Request) {
	in, ok := s.readTask(w, r)
	if !ok {
		return
	}
	in.Status = task.StatusOpen
	normalized, err := task.Normalize(in, time.Now(), s.Loc)
	if err != nil {
		writeValidation(w, err)
		return
	}
	created, err := s.Store.CreateTask(r.Context(), currentUser(r), normalized)
	if isFK(err) {
		writeError(w, http.StatusUnprocessableEntity, "La lista no existe")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo crear la tarea")
		return
	}
	writeJSON(w, http.StatusCreated, s.toTask(created))
}

func (s *Server) updateTask(w http.ResponseWriter, r *http.Request) {
	current, ok := s.loadTask(w, r)
	if !ok {
		return
	}
	in, ok := s.readTask(w, r)
	if !ok {
		return
	}
	in.ID = current.ID
	in.Position = current.Position
	in.Status = current.Status
	in.CompletedAt = current.CompletedAt
	in.CreatedAt = current.CreatedAt
	normalized, err := task.Normalize(in, time.Now(), s.Loc)
	if err != nil {
		writeValidation(w, err)
		return
	}
	normalized.Status = current.Status
	normalized.CompletedAt = current.CompletedAt
	updated, err := s.Store.UpdateTask(r.Context(), currentUser(r), normalized)
	if isFK(err) {
		writeError(w, http.StatusUnprocessableEntity, "La lista no existe")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo guardar la tarea")
		return
	}
	writeJSON(w, http.StatusOK, s.toTask(updated))
}

func (s *Server) deleteTask(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := s.Store.DeleteTask(r.Context(), currentUser(r), id); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "Tarea no encontrada")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo borrar la tarea")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) doneTask(w http.ResponseWriter, r *http.Request) {
	s.mutate(w, r, func(item task.Task) task.Task {
		return task.ApplyDone(item, time.Now(), s.Loc)
	})
}

func (s *Server) todayTask(w http.ResponseWriter, r *http.Request) {
	s.mutate(w, r, func(item task.Task) task.Task {
		return task.ApplyToday(item, time.Now(), s.Loc)
	})
}

func (s *Server) laterTask(w http.ResponseWriter, r *http.Request) {
	var body struct {
		DueAt time.Time `json:"dueAt"`
	}
	if err := readJSON(w, r, &body); err != nil || body.DueAt.IsZero() {
		writeError(w, http.StatusBadRequest, "Elige una fecha")
		return
	}
	s.mutate(w, r, func(item task.Task) task.Task {
		return task.ApplyLater(item, body.DueAt)
	})
}

func (s *Server) vapid(w http.ResponseWriter, r *http.Request) {
	if s.VAPIDPublic == "" {
		writeError(w, http.StatusConflict, "El servidor no tiene llaves VAPID")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"publicKey": s.VAPIDPublic})
}

func (s *Server) savePush(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Endpoint string `json:"endpoint"`
		Keys     struct {
			P256dh string `json:"p256dh"`
			Auth   string `json:"auth"`
		} `json:"keys"`
	}
	if err := readJSON(w, r, &body); err != nil || body.Endpoint == "" || body.Keys.P256dh == "" || body.Keys.Auth == "" {
		writeError(w, http.StatusBadRequest, "Suscripción incompleta")
		return
	}
	err := s.Store.SaveSubscription(r.Context(), currentUser(r), store.Subscription{
		Endpoint: body.Endpoint,
		P256dh:   body.Keys.P256dh,
		Auth:     body.Keys.Auth,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo guardar la suscripción")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) deletePush(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Endpoint string `json:"endpoint"`
	}
	if err := readJSON(w, r, &body); err != nil || body.Endpoint == "" {
		writeError(w, http.StatusBadRequest, "Falta el endpoint")
		return
	}
	if err := s.Store.DeleteSubscription(r.Context(), body.Endpoint); err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo borrar la suscripción")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) mutate(w http.ResponseWriter, r *http.Request, fn func(task.Task) task.Task) {
	current, ok := s.loadTask(w, r)
	if !ok {
		return
	}
	updated, err := s.Store.UpdateTask(r.Context(), currentUser(r), fn(current))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo actualizar la tarea")
		return
	}
	writeJSON(w, http.StatusOK, s.toTask(updated))
}

func (s *Server) loadTask(w http.ResponseWriter, r *http.Request) (task.Task, bool) {
	id, ok := pathID(w, r)
	if !ok {
		return task.Task{}, false
	}
	since := time.Now().AddDate(-5, 0, 0)
	all, err := s.Store.Tasks(r.Context(), currentUser(r), since)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo leer la tarea")
		return task.Task{}, false
	}
	for _, item := range all {
		if item.ID == id {
			return item, true
		}
	}
	writeError(w, http.StatusNotFound, "Tarea no encontrada")
	return task.Task{}, false
}

func (s *Server) readTask(w http.ResponseWriter, r *http.Request) (task.Task, bool) {
	var body struct {
		ListID         int64      `json:"listId"`
		Title          string     `json:"title"`
		Notes          string     `json:"notes"`
		DueAt          *time.Time `json:"dueAt"`
		Remind         bool       `json:"remind"`
		Pinned         bool       `json:"pinned"`
		RepeatWeekdays []int      `json:"repeatWeekdays"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return task.Task{}, false
	}
	return task.Task{
		ListID:     body.ListID,
		Title:      body.Title,
		Notes:      body.Notes,
		DueAt:      body.DueAt,
		WantRemind: body.Remind,
		Pinned:     body.Pinned,
		RepeatMask: schedule.Mask(body.RepeatWeekdays),
	}, true
}

func (s *Server) toTask(item task.Task) taskDTO {
	var dueDay *string
	if item.DueAt != nil {
		key := schedule.DayKey(*item.DueAt, s.Loc)
		dueDay = &key
	}
	return taskDTO{
		ID:             item.ID,
		ListID:         item.ListID,
		Title:          item.Title,
		Notes:          item.Notes,
		DueAt:          item.DueAt,
		RemindAt:       item.RemindAt,
		Status:         item.Status,
		Pinned:         item.Pinned,
		Position:       item.Position,
		RepeatWeekdays: schedule.Weekdays(item.RepeatMask),
		CompletedAt:    item.CompletedAt,
		Section:        string(schedule.SectionFor(item.DueAt, time.Now(), s.Loc)),
		DueDay:         dueDay,
	}
}

func (s *Server) protected(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(session.CookieName())
		if err != nil {
			writeError(w, http.StatusUnauthorized, "Necesitas entrar")
			return
		}
		id, ok := session.UserID(s.SessionSecret, cookie.Value, time.Now())
		if !ok {
			writeError(w, http.StatusUnauthorized, "Necesitas entrar")
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), userContextKey{}, id)))
	}
}

func (s *Server) setSession(w http.ResponseWriter, userID int64, exp time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     session.CookieName(),
		Value:    session.Sign(s.SessionSecret, userID, exp),
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   s.CookieSecure,
		MaxAge:   int(time.Until(exp).Seconds()),
	})
}

type userContextKey struct{}

func currentUser(r *http.Request) int64 {
	id, _ := r.Context().Value(userContextKey{}).(int64)
	return id
}

type listDTO struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Position  int    `json:"position"`
	OpenCount int    `json:"openCount"`
}

type taskDTO struct {
	ID             int64      `json:"id"`
	ListID         int64      `json:"listId"`
	Title          string     `json:"title"`
	Notes          string     `json:"notes"`
	DueAt          *time.Time `json:"dueAt"`
	RemindAt       *time.Time `json:"remindAt"`
	Status         string     `json:"status"`
	Pinned         bool       `json:"pinned"`
	Position       int        `json:"position"`
	RepeatWeekdays []int      `json:"repeatWeekdays"`
	CompletedAt    *time.Time `json:"completedAt"`
	Section        string     `json:"section"`
	DueDay         *string    `json:"dueDay"`
}

func toList(list store.List) listDTO {
	return listDTO{ID: list.ID, Name: list.Name, Position: list.Position, OpenCount: list.OpenCount}
}

func pathID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Identificador inválido")
		return 0, false
	}
	return id, true
}

func readJSON(w http.ResponseWriter, r *http.Request, dest any) error {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	return dec.Decode(dest)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func writeValidation(w http.ResponseWriter, err error) {
	var ve *task.ValidationError
	if errors.As(err, &ve) {
		writeError(w, http.StatusUnprocessableEntity, ve.Message)
		return
	}
	writeError(w, http.StatusUnprocessableEntity, "Datos inválidos")
}

func isFK(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23503"
}
