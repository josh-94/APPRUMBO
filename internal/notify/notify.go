package notify

import (
	"context"
	"encoding/json"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/SherClockHolmes/webpush-go"
	"github.com/redis/go-redis/v9"

	"hoy/internal/schedule"
	"hoy/internal/store"
)

const stream = "notifications"

type Message struct {
	TaskID   int64     `json:"taskId"`
	UserID   int64     `json:"userId"`
	Title    string    `json:"title"`
	RemindAt time.Time `json:"remindAt"`
	Dedupe   string    `json:"dedupe"`
}

func ConnectRedis(ctx context.Context, url string) (*redis.Client, error) {
	opt, err := redis.ParseURL(url)
	if err != nil {
		return nil, err
	}
	client := redis.NewClient(opt)
	var last error
	for attempt := 0; attempt < 30; attempt++ {
		last = client.Ping(ctx).Err()
		if last == nil {
			return client, nil
		}
		select {
		case <-ctx.Done():
			_ = client.Close()
			return nil, ctx.Err()
		case <-time.After(time.Second):
		}
	}
	_ = client.Close()
	return nil, last
}

func Publish(ctx context.Context, client *redis.Client, msg Message) error {
	body, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	return client.XAdd(ctx, &redis.XAddArgs{
		Stream: stream,
		Values: map[string]any{"payload": string(body)},
	}).Err()
}

func RunScheduler(ctx context.Context, db *store.Store, client *redis.Client, loc *time.Location) {
	tick := time.NewTicker(30 * time.Second)
	defer tick.Stop()
	publishDue(ctx, db, client, loc)
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			publishDue(ctx, db, client, loc)
		}
	}
}

func publishDue(ctx context.Context, db *store.Store, client *redis.Client, loc *time.Location) {
	due, err := db.DueReminders(ctx, 50)
	if err != nil {
		slog.Error("due reminders", "err", err)
		return
	}
	for _, item := range due {
		msg := Message{
			TaskID:   item.TaskID,
			UserID:   item.UserID,
			Title:    item.Title,
			RemindAt: item.RemindAt,
			Dedupe:   item.RemindAt.UTC().Format(time.RFC3339Nano) + ":" + itoa(item.TaskID),
		}
		if err := Publish(ctx, client, msg); err != nil {
			slog.Error("publish reminder", "task", item.TaskID, "err", err)
			continue
		}
		var next *time.Time
		if item.RepeatMask != 0 {
			local := item.RemindAt.In(loc)
			if candidate, ok := schedule.NextAfter(item.RemindAt, item.RepeatMask, local.Hour(), local.Minute(), loc); ok {
				next = &candidate
			}
		}
		if err := db.ClaimReminder(ctx, item.TaskID, item.RemindAt, next); err != nil {
			slog.Error("claim reminder", "task", item.TaskID, "err", err)
		}
	}
}

func RunWorker(ctx context.Context, db *store.Store, client *redis.Client, publicKey, privateKey, subject string) error {
	if err := client.XGroupCreateMkStream(ctx, stream, "push", "0").Err(); err != nil && !isBusyGroup(err) {
		return err
	}
	for {
		if ctx.Err() != nil {
			return nil
		}
		streams, err := client.XReadGroup(ctx, &redis.XReadGroupArgs{
			Group:    "push",
			Consumer: "worker",
			Streams:  []string{stream, ">"},
			Count:    10,
			Block:    5 * time.Second,
		}).Result()
		if err == redis.Nil {
			continue
		}
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			slog.Error("read stream", "err", err)
			time.Sleep(time.Second)
			continue
		}
		for _, slice := range streams {
			for _, entry := range slice.Messages {
				handle(ctx, db, client, publicKey, privateKey, subject, entry)
			}
		}
	}
}

func handle(ctx context.Context, db *store.Store, client *redis.Client, publicKey, privateKey, subject string, entry redis.XMessage) {
	raw, _ := entry.Values["payload"].(string)
	var msg Message
	if err := json.Unmarshal([]byte(raw), &msg); err != nil {
		slog.Error("bad payload", "err", err)
		_ = client.XAck(ctx, stream, "push", entry.ID).Err()
		return
	}
	sentKey := "sent:" + msg.Dedupe
	if n, err := client.Exists(ctx, sentKey).Result(); err == nil && n > 0 {
		_ = client.XAck(ctx, stream, "push", entry.ID).Err()
		return
	}
	if publicKey == "" || privateKey == "" {
		slog.Error("faltan llaves VAPID; el recordatorio no se envió", "task", msg.TaskID)
		_ = client.XAck(ctx, stream, "push", entry.ID).Err()
		return
	}
	if msg.UserID == 0 {
		_ = client.XAck(ctx, stream, "push", entry.ID).Err()
		return
	}
	subs, err := db.Subscriptions(ctx, msg.UserID)
	if err != nil {
		slog.Error("subscriptions", "err", err)
		return
	}
	payload, _ := json.Marshal(map[string]string{
		"title": "Hoy",
		"body":  msg.Title,
		"tag":   msg.Dedupe,
	})
	for _, sub := range subs {
		resp, err := webpush.SendNotification(payload, &webpush.Subscription{
			Endpoint: sub.Endpoint,
			Keys:     webpush.Keys{P256dh: sub.P256dh, Auth: sub.Auth},
		}, &webpush.Options{
			Subscriber:      subject,
			VAPIDPublicKey:  publicKey,
			VAPIDPrivateKey: privateKey,
			TTL:             60,
		})
		if resp != nil {
			_ = resp.Body.Close()
		}
		if err != nil || resp == nil {
			slog.Error("web push", "err", err)
			return
		}
		if resp.StatusCode == 404 || resp.StatusCode == 410 {
			_ = db.DeleteSubscription(ctx, sub.Endpoint)
			continue
		}
		if resp.StatusCode >= 300 {
			slog.Error("web push status", "status", resp.StatusCode)
			return
		}
	}
	if err := client.Set(ctx, sentKey, "1", 7*24*time.Hour).Err(); err != nil {
		slog.Error("dedupe", "err", err)
		return
	}
	if err := client.XAck(ctx, stream, "push", entry.ID).Err(); err != nil {
		slog.Error("ack", "err", err)
	}
}

func isBusyGroup(err error) bool {
	return err != nil && strings.Contains(err.Error(), "BUSYGROUP")
}

func itoa(n int64) string {
	return strconv.FormatInt(n, 10)
}
