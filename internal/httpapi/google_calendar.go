package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"

	"hoy/internal/gcal"
	"hoy/internal/session"
	"hoy/internal/store"
)

const googleSyncStale = 15 * time.Minute

func (s *Server) googleCalendarStatus(w http.ResponseWriter, r *http.Request) {
	connected, lastSync, err := s.Store.GoogleCalendarConnected(r.Context(), currentUser(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo leer el estado de Google Calendar")
		return
	}
	configured := s.googleCalendarConfig() != nil
	out := map[string]any{
		"configured": configured,
		"connected":  connected,
	}
	if lastSync != nil {
		out["lastSyncAt"] = lastSync.UTC().Format(time.RFC3339)
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) googleCalendarConnect(w http.ResponseWriter, r *http.Request) {
	conf := s.googleCalendarConfig()
	if conf == nil {
		writeError(w, http.StatusConflict, "Google Calendar no está configurado")
		return
	}
	state, err := randomToken(16)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo empezar la conexión")
		return
	}
	verifier, err := randomToken(32)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo empezar la conexión")
		return
	}
	exp := time.Now().Add(10 * time.Minute)
	http.SetCookie(w, &http.Cookie{
		Name:     session.OAuthCookieName(),
		Value:    session.SignOAuth(s.SessionSecret, state, verifier, exp),
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   s.CookieSecure,
		MaxAge:   600,
	})
	url := conf.AuthCodeURL(state,
		oauth2.S256ChallengeOption(verifier),
		oauth2.AccessTypeOffline,
		oauth2.ApprovalForce,
	)
	http.Redirect(w, r, url, http.StatusFound)
}

func (s *Server) googleCalendarCallback(w http.ResponseWriter, r *http.Request) {
	conf := s.googleCalendarConfig()
	if conf == nil {
		http.Redirect(w, r, "/cuenta?error=gcal", http.StatusFound)
		return
	}
	cookie, err := r.Cookie(session.CookieName())
	if err != nil {
		http.Redirect(w, r, "/?error=gcal", http.StatusFound)
		return
	}
	userID, ok := session.UserID(s.SessionSecret, cookie.Value, time.Now())
	if !ok || userID == 0 {
		http.Redirect(w, r, "/?error=gcal", http.StatusFound)
		return
	}
	oauthCookie, err := r.Cookie(session.OAuthCookieName())
	if err != nil {
		http.Redirect(w, r, "/cuenta?error=gcal", http.StatusFound)
		return
	}
	state, verifier, ok := session.ReadOAuth(s.SessionSecret, oauthCookie.Value, time.Now())
	if !ok || state == "" || state != r.URL.Query().Get("state") || r.URL.Query().Get("code") == "" {
		http.Redirect(w, r, "/cuenta?error=gcal", http.StatusFound)
		return
	}
	token, err := conf.Exchange(r.Context(), r.URL.Query().Get("code"), oauth2.VerifierOption(verifier))
	if err != nil || token == nil {
		http.Redirect(w, r, "/cuenta?error=gcal", http.StatusFound)
		return
	}
	refresh := strings.TrimSpace(token.RefreshToken)
	if refresh == "" {
		// Re-consent sometimes omits refresh; keep existing if present.
		if existing, err := s.Store.GoogleToken(r.Context(), userID); err == nil {
			refresh = existing.RefreshToken
		}
	}
	if refresh == "" {
		http.Redirect(w, r, "/cuenta?error=gcal_refresh", http.StatusFound)
		return
	}
	var expiry *time.Time
	if !token.Expiry.IsZero() {
		t := token.Expiry.UTC()
		expiry = &t
	}
	if err := s.Store.SaveGoogleToken(r.Context(), userID, refresh, token.AccessToken, strings.Join(conf.Scopes, " "), expiry); err != nil {
		http.Redirect(w, r, "/cuenta?error=gcal", http.StatusFound)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     session.OAuthCookieName(),
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
	// Best-effort first sync for the next two weeks.
	now := time.Now().In(s.Loc)
	from := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, s.Loc).AddDate(0, 0, -7)
	to := from.AddDate(0, 0, 28)
	_ = s.syncGoogleCalendar(r.Context(), userID, from, to)
	http.Redirect(w, r, "/cuenta?gcal=ok", http.StatusFound)
}

func (s *Server) googleCalendarDisconnect(w http.ResponseWriter, r *http.Request) {
	if err := s.Store.DeleteGoogleCalendar(r.Context(), currentUser(r)); err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo desconectar Google Calendar")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) listGoogleEvents(w http.ResponseWriter, r *http.Request) {
	from, to, ok := parseEventRange(w, r, s.Loc)
	if !ok {
		return
	}
	uid := currentUser(r)
	connected, lastSync, err := s.Store.GoogleCalendarConnected(r.Context(), uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo leer Google Calendar")
		return
	}
	if connected {
		stale := lastSync == nil || time.Since(*lastSync) > googleSyncStale
		if stale || r.URL.Query().Get("sync") == "1" {
			if syncErr := s.syncGoogleCalendar(r.Context(), uid, from, to); syncErr != nil {
				if errors.Is(syncErr, gcal.ErrUnauthorized) || errors.Is(syncErr, store.ErrNotFound) {
					writeError(w, http.StatusConflict, "Vuelve a conectar Google Calendar")
					return
				}
				// Serve cached events if sync fails transiently.
			}
		}
	}
	items, err := s.Store.GoogleEvents(r.Context(), uid, from, to)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudieron leer los eventos de Google")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"connected": connected,
		"events":    items,
	})
}

func (s *Server) syncGoogleCalendarNow(w http.ResponseWriter, r *http.Request) {
	from, to, ok := parseEventRange(w, r, s.Loc)
	if !ok {
		return
	}
	uid := currentUser(r)
	if err := s.syncGoogleCalendar(r.Context(), uid, from, to); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusConflict, "Conecta Google Calendar primero")
			return
		}
		if errors.Is(err, gcal.ErrUnauthorized) {
			writeError(w, http.StatusConflict, "Vuelve a conectar Google Calendar")
			return
		}
		writeError(w, http.StatusBadGateway, "No se pudo sincronizar con Google")
		return
	}
	items, err := s.Store.GoogleEvents(r.Context(), uid, from, to)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudieron leer los eventos de Google")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"connected": true, "events": items})
}

func (s *Server) syncGoogleCalendar(ctx context.Context, userID int64, from, to time.Time) error {
	tok, err := s.Store.GoogleToken(ctx, userID)
	if err != nil {
		return err
	}
	conf := s.googleCalendarConfig()
	if conf == nil {
		return gcal.ErrUnavailable
	}
	oauthToken := &oauth2.Token{
		RefreshToken: tok.RefreshToken,
		AccessToken:  tok.AccessToken,
		TokenType:    "Bearer",
	}
	if tok.Expiry != nil {
		oauthToken.Expiry = *tok.Expiry
	}
	ts := conf.TokenSource(ctx, oauthToken)
	fresh, err := ts.Token()
	if err != nil {
		_ = s.Store.DeleteGoogleCalendar(ctx, userID)
		return gcal.ErrUnauthorized
	}
	if fresh.AccessToken != tok.AccessToken || (tok.Expiry == nil && !fresh.Expiry.IsZero()) {
		var expiry *time.Time
		if !fresh.Expiry.IsZero() {
			t := fresh.Expiry.UTC()
			expiry = &t
		}
		_ = s.Store.UpdateGoogleAccessToken(ctx, userID, fresh.AccessToken, expiry)
	}
	client := s.GCal
	if client == nil {
		client = gcal.New()
	}
	items, err := client.ListPrimaryEvents(ctx, fresh, from, to)
	if err != nil {
		if errors.Is(err, gcal.ErrUnauthorized) {
			_ = s.Store.DeleteGoogleCalendar(ctx, userID)
		}
		return err
	}
	return s.Store.ReplaceGoogleEventsInRange(ctx, userID, from, to, items)
}

func (s *Server) googleCalendarConfig() *oauth2.Config {
	if s.GoogleID == "" || s.GoogleSecret == "" {
		return nil
	}
	redirect := strings.TrimSpace(s.GoogleCalendarRedirect)
	if redirect == "" {
		redirect = calendarRedirectFromLogin(s.GoogleRedirect)
	}
	if redirect == "" {
		return nil
	}
	return &oauth2.Config{
		ClientID:     s.GoogleID,
		ClientSecret: s.GoogleSecret,
		RedirectURL:  redirect,
		Scopes:       []string{gcal.Scope()},
		Endpoint:     google.Endpoint,
	}
}

func calendarRedirectFromLogin(loginRedirect string) string {
	loginRedirect = strings.TrimSpace(loginRedirect)
	if loginRedirect == "" {
		return ""
	}
	return strings.Replace(loginRedirect, "/api/auth/google/callback", "/api/google/calendar/callback", 1)
}
