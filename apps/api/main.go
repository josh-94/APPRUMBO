package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/SherClockHolmes/webpush-go"

	"hoy/internal/config"
	"hoy/internal/httpapi"
	"hoy/internal/notify"
	"hoy/internal/store"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "vapid" {
		privateKey, publicKey, err := webpush.GenerateVAPIDKeys()
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		fmt.Printf("VAPID_PUBLIC_KEY=%s\nVAPID_PRIVATE_KEY=%s\n", publicKey, privateKey)
		return
	}

	cfg, err := config.Load()
	if err != nil {
		slog.Error("config", "err", err)
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := store.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("postgres", "err", err)
		os.Exit(1)
	}
	defer db.Close()
	if err := db.Migrate(ctx); err != nil {
		slog.Error("migrate", "err", err)
		os.Exit(1)
	}
	redisClient, err := notify.ConnectRedis(ctx, cfg.RedisURL)
	if err != nil {
		slog.Error("redis", "err", err)
		os.Exit(1)
	}
	defer func() { _ = redisClient.Close() }()

	go notify.RunScheduler(ctx, db, redisClient, cfg.Location)

	api := &httpapi.Server{
		Store:         db,
		Redis:         redisClient,
		Loc:            cfg.Location,
		SessionSecret:  cfg.SessionSecret,
		CookieSecure:   cfg.CookieSecure,
		VAPIDPublic:    cfg.VAPIDPublic,
		GoogleID:       cfg.GoogleID,
		GoogleSecret:   cfg.GoogleSecret,
		GoogleRedirect: cfg.GoogleRedirect,
	}
	server := &http.Server{
		Addr:              cfg.Addr,
		Handler:           api.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()
	slog.Info("api", "addr", cfg.Addr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("listen", "err", err)
		os.Exit(1)
	}
}
