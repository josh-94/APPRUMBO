package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"hoy/internal/config"
	"hoy/internal/notify"
	"hoy/internal/store"
)

func main() {
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
	redisClient, err := notify.ConnectRedis(ctx, cfg.RedisURL)
	if err != nil {
		slog.Error("redis", "err", err)
		os.Exit(1)
	}
	defer func() { _ = redisClient.Close() }()

	slog.Info("worker")
	if err := notify.RunWorker(ctx, db, redisClient, cfg.VAPIDPublic, cfg.VAPIDPrivate, cfg.VAPIDSubject); err != nil {
		slog.Error("worker", "err", err)
		os.Exit(1)
	}
}
