package httpapi

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"

	"hoy/internal/session"
)

func (s *Server) googleStart(w http.ResponseWriter, r *http.Request) {
	conf := s.googleConfig()
	if conf == nil {
		writeError(w, http.StatusConflict, "Google no está configurado")
		return
	}
	state, err := randomToken(16)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo empezar el acceso")
		return
	}
	verifier, err := randomToken(32)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo empezar el acceso")
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
	http.Redirect(w, r, conf.AuthCodeURL(state, oauth2.S256ChallengeOption(verifier)), http.StatusFound)
}

func (s *Server) googleCallback(w http.ResponseWriter, r *http.Request) {
	conf := s.googleConfig()
	if conf == nil {
		http.Redirect(w, r, "/?error=google", http.StatusFound)
		return
	}
	cookie, err := r.Cookie(session.OAuthCookieName())
	if err != nil {
		http.Redirect(w, r, "/?error=google", http.StatusFound)
		return
	}
	state, verifier, ok := session.ReadOAuth(s.SessionSecret, cookie.Value, time.Now())
	if !ok || state == "" || state != r.URL.Query().Get("state") || r.URL.Query().Get("code") == "" {
		http.Redirect(w, r, "/?error=google", http.StatusFound)
		return
	}
	token, err := conf.Exchange(r.Context(), r.URL.Query().Get("code"), oauth2.VerifierOption(verifier))
	if err != nil {
		http.Redirect(w, r, "/?error=google", http.StatusFound)
		return
	}
	email, subject, err := googleIdentity(r, conf, token)
	if err != nil {
		http.Redirect(w, r, "/?error=google", http.StatusFound)
		return
	}
	id, err := s.Store.UpsertGoogleUser(r.Context(), email, subject)
	if err != nil {
		http.Redirect(w, r, "/?error=google", http.StatusFound)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     session.OAuthCookieName(),
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
	s.setSession(w, id, time.Now().Add(30*24*time.Hour))
	http.Redirect(w, r, "/dia", http.StatusFound)
}

func (s *Server) googleConfig() *oauth2.Config {
	if s.GoogleID == "" || s.GoogleSecret == "" || s.GoogleRedirect == "" {
		return nil
	}
	return &oauth2.Config{
		ClientID:     s.GoogleID,
		ClientSecret: s.GoogleSecret,
		RedirectURL:  s.GoogleRedirect,
		Scopes:       []string{"openid", "email", "profile"},
		Endpoint:     google.Endpoint,
	}
}

func googleIdentity(r *http.Request, conf *oauth2.Config, token *oauth2.Token) (string, string, error) {
	response, err := conf.Client(r.Context(), token).Get("https://www.googleapis.com/oauth2/v3/userinfo")
	if err != nil {
		return "", "", err
	}
	defer response.Body.Close()
	var body struct {
		Sub           string `json:"sub"`
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		return "", "", err
	}
	email, ok := normalizeEmail(body.Email)
	if !ok || !body.EmailVerified || body.Sub == "" {
		return "", "", errMissingIdentity
	}
	return email, body.Sub, nil
}

var errMissingIdentity = errString("identidad incompleta")

type errString string

func (e errString) Error() string { return string(e) }

func randomToken(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
