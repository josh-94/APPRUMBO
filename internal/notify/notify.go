package notify

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/url"
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
	TaskID   int64     `json:"taskId,omitempty"`
	EventID  int64     `json:"eventId,omitempty"`
	UserID   int64     `json:"userId"`
	Title    string    `json:"title"`
	Body     string    `json:"body,omitempty"`
	URL      string    `json:"url,omitempty"`
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
	publishDueTasks(ctx, db, client, loc)
	publishDueEvents(ctx, db, client)
}

func publishDueTasks(ctx context.Context, db *store.Store, client *redis.Client, loc *time.Location) {
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
			URL:      "/tarea/" + itoa(item.TaskID),
			RemindAt: item.RemindAt,
			Dedupe:   "task:" + item.RemindAt.UTC().Format(time.RFC3339Nano) + ":" + itoa(item.TaskID),
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

func publishDueEvents(ctx context.Context, db *store.Store, client *redis.Client) {
	due, err := db.DueEventReminders(ctx, 50)
	if err != nil {
		slog.Error("due event reminders", "err", err)
		return
	}
	for _, item := range due {
		msg := Message{
			EventID:  item.EventID,
			UserID:   item.UserID,
			Title:    item.Title,
			Body:     eventRemindBody(item.Title, item.RemindMinutes),
			URL:      "/tiempo",
			RemindAt: item.RemindAt,
			Dedupe:   "event:" + item.RemindAt.UTC().Format(time.RFC3339Nano) + ":" + itoa(item.EventID),
		}
		if err := Publish(ctx, client, msg); err != nil {
			slog.Error("publish event reminder", "event", item.EventID, "err", err)
			continue
		}
		if err := db.ClaimEventReminder(ctx, item.EventID, item.RemindAt); err != nil {
			slog.Error("claim event reminder", "event", item.EventID, "err", err)
		}
	}
}

func eventRemindBody(title string, minutes int) string {
	when := formatRemindOffset(minutes)
	if when == "" {
		return title
	}
	return title + " · en " + when
}

func formatRemindOffset(minutes int) string {
	if minutes <= 0 {
		return "este momento"
	}
	if minutes%(7*24*60) == 0 {
		n := minutes / (7 * 24 * 60)
		if n == 1 {
			return "1 semana"
		}
		return itoa(int64(n)) + " semanas"
	}
	if minutes%(24*60) == 0 {
		n := minutes / (24 * 60)
		if n == 1 {
			return "1 día"
		}
		return itoa(int64(n)) + " días"
	}
	if minutes%60 == 0 {
		n := minutes / 60
		if n == 1 {
			return "1 hora"
		}
		return itoa(int64(n)) + " horas"
	}
	if minutes == 1 {
		return "1 minuto"
	}
	return itoa(int64(minutes)) + " minutos"
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
	body := msg.Body
	if body == "" {
		body = msg.Title
	}
	url := msg.URL
	if url == "" && msg.TaskID != 0 {
		url = "/tarea/" + itoa(msg.TaskID)
	}
	if url == "" {
		url = "/dia"
	}
	payload, _ := json.Marshal(map[string]string{
		"title": "RUMBO",
		"body":  body,
		"tag":   msg.Dedupe,
		"url":   url,
	})
	for _, sub := range subs {
		resp, err := webpush.SendNotification(payload, &webpush.Subscription{
			Endpoint: sub.Endpoint,
			Keys:     webpush.Keys{P256dh: sub.P256dh, Auth: sub.Auth},
		}, &webpush.Options{
			Subscriber:      vapidContact(subject),
			VAPIDPublicKey:  publicKey,
			VAPIDPrivateKey: privateKey,
			TTL:             60,
			HTTPClient:      applePushClient{publicKey: publicKey, inner: &http.Client{Timeout: 15 * time.Second}},
		})
		if err != nil || resp == nil {
			slog.Error("web push", "err", err)
			continue
		}
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 180))
		_ = resp.Body.Close()
		if resp.StatusCode == 404 || resp.StatusCode == 410 {
			_ = db.DeleteSubscription(ctx, sub.Endpoint)
			continue
		}
		if resp.StatusCode >= 300 {
			slog.Error("web push status", "status", resp.StatusCode, "body", string(body))
			continue
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

// vapidContact is the address the push library puts in the JWT.
// That library adds "mailto:" unless the value already starts with "https:",
// so a subject that is already "mailto:..." would be sent twice and Apple rejects it.
func vapidContact(subject string) string {
	subject = strings.TrimSpace(subject)
	return strings.TrimPrefix(subject, "mailto:")
}

type applePushClient struct {
	publicKey string
	inner     *http.Client
}

func (c applePushClient) Do(req *http.Request) (*http.Response, error) {
	if strings.Contains(req.URL.Host, "push.apple.com") {
		req.Header.Set("apns-push-type", "alert")
		req.Header.Set("apns-priority", "10")
		req.Header.Set("apns-topic", url.QueryEscape(c.publicKey))
	}
	return c.inner.Do(req)
}

func isBusyGroup(err error) bool {
	return err != nil && strings.Contains(err.Error(), "BUSYGROUP")
}

func itoa(n int64) string {
	return strconv.FormatInt(n, 10)
}
