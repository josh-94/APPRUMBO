package config

import (
	"fmt"
	"os"
	"time"
)

type Config struct {
	Addr           string
	DatabaseURL    string
	RedisURL       string
	SessionSecret  string
	Location       *time.Location
	CookieSecure   bool
	VAPIDPublic    string
	VAPIDPrivate   string
	VAPIDSubject   string
	GoogleID       string
	GoogleSecret   string
	GoogleRedirect string
}

func Load() (Config, error) {
	cfg := Config{
		Addr:           env("APP_ADDR", ":8080"),
		DatabaseURL:    os.Getenv("DATABASE_URL"),
		RedisURL:       os.Getenv("REDIS_URL"),
		SessionSecret:  os.Getenv("SESSION_SECRET"),
		CookieSecure:   os.Getenv("COOKIE_SECURE") == "true" || os.Getenv("COOKIE_SECURE") == "1",
		VAPIDPublic:    os.Getenv("VAPID_PUBLIC_KEY"),
		VAPIDPrivate:   os.Getenv("VAPID_PRIVATE_KEY"),
		VAPIDSubject:   env("VAPID_SUBJECT", "mailto:hello@codewithjosh.codes"),
		GoogleID:       os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleSecret:   os.Getenv("GOOGLE_CLIENT_SECRET"),
		GoogleRedirect: os.Getenv("GOOGLE_REDIRECT_URL"),
	}
	if cfg.DatabaseURL == "" || cfg.RedisURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL y REDIS_URL son obligatorias")
	}
	if len(cfg.SessionSecret) < 16 {
		return Config{}, fmt.Errorf("SESSION_SECRET debe tener al menos 16 caracteres")
	}
	loc, err := time.LoadLocation(env("APP_TIMEZONE", "America/Bogota"))
	if err != nil {
		return Config{}, fmt.Errorf("APP_TIMEZONE: %w", err)
	}
	cfg.Location = loc
	return cfg, nil
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
