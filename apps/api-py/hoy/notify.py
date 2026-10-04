import json
import logging
import time
from datetime import timezone

import redis
from pywebpush import WebPushException, webpush

from .schedule import next_after
from .store import Store

STREAM = "notifications"
log = logging.getLogger("hoy")


def connect_redis(url: str) -> redis.Redis:
    client = redis.Redis.from_url(url)
    last: Exception | None = None
    for _ in range(30):
        try:
            client.ping()
            return client
        except Exception as exc:
            last = exc
            time.sleep(1)
    raise RuntimeError(f"redis: {last}")


def publish(client: redis.Redis, message: dict) -> None:
    client.xadd(STREAM, {"payload": json.dumps(message)})


def run_scheduler(store: Store, client: redis.Redis, loc, stop) -> None:
    publish_due(store, client, loc)
    while not stop.wait(30):
        publish_due(store, client, loc)


def publish_due(store: Store, client: redis.Redis, loc) -> None:
    try:
        due = store.due_reminders(50)
    except Exception:
        log.exception("due reminders")
        return
    for item in due:
        dedupe = item.remind_at.astimezone(timezone.utc).isoformat()
        message = {
            "taskId": item.task_id,
            "userId": item.user_id,
            "title": item.title,
            "remindAt": item.remind_at.isoformat(),
            "dedupe": f"{dedupe}:{item.task_id}",
        }
        try:
            publish(client, message)
        except Exception:
            log.exception("publish reminder")
            continue
        nxt = None
        if item.repeat_mask:
            local = item.remind_at.astimezone(loc)
            nxt = next_after(item.remind_at, item.repeat_mask, local.hour, local.minute, loc)
        try:
            store.claim_reminder(item.task_id, item.remind_at, nxt)
        except Exception:
            log.exception("claim reminder")


def run_worker(store: Store, client: redis.Redis, public_key: str, private_key: str, subject: str, stop) -> None:
    try:
        client.xgroup_create(STREAM, "push", id="0", mkstream=True)
    except redis.ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise
    while not stop.is_set():
        try:
            streams = client.xreadgroup("push", "worker", {STREAM: ">"}, count=10, block=5000)
        except Exception:
            if stop.is_set():
                return
            log.exception("read stream")
            time.sleep(1)
            continue
        if not streams:
            continue
        for _, entries in streams:
            for entry_id, fields in entries:
                handle(store, client, public_key, private_key, subject, entry_id, fields)


def handle(store, client, public_key, private_key, subject, entry_id, fields) -> None:
    raw = fields.get(b"payload") or fields.get("payload") or b""
    if isinstance(raw, bytes):
        raw = raw.decode()
    try:
        message = json.loads(raw)
    except Exception:
        log.exception("bad payload")
        client.xack(STREAM, "push", entry_id)
        return
    dedupe = str(message.get("dedupe") or "")
    sent_key = "sent:" + dedupe
    if client.exists(sent_key):
        client.xack(STREAM, "push", entry_id)
        return
    task_id = int(message.get("taskId") or 0)
    user_id = int(message.get("userId") or 0)
    if not public_key or not private_key:
        log.error("faltan llaves VAPID; el recordatorio no se envió task=%s", task_id)
        client.xack(STREAM, "push", entry_id)
        return
    if user_id == 0:
        client.xack(STREAM, "push", entry_id)
        return
    try:
        subs = store.subscriptions(user_id)
    except Exception:
        log.exception("subscriptions")
        return
    payload = json.dumps({
        "title": "RUMBO",
        "body": message.get("title") or "",
        "tag": dedupe,
        "url": f"/tarea/{task_id}",
    })
    pem = vapid_pem(private_key)
    for sub in subs:
        try:
            response = webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=pem,
                vapid_claims={"sub": subject},
                ttl=60,
            )
        except WebPushException as exc:
            status = exc.response.status_code if exc.response is not None else 0
            if status in (404, 410):
                store.delete_subscription(sub.endpoint)
                continue
            log.error("web push status %s", status or exc)
            return
        except Exception:
            log.exception("web push")
            return
        if response is not None and response.status_code in (404, 410):
            store.delete_subscription(sub.endpoint)
            continue
        if response is not None and response.status_code >= 300:
            log.error("web push status %s", response.status_code)
            return
    client.set(sent_key, "1", ex=7 * 24 * 3600)
    client.xack(STREAM, "push", entry_id)


def vapid_pem(private_key: str) -> str:
    if "BEGIN" in private_key:
        return private_key
    import base64

    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    pad = "=" * ((4 - len(private_key) % 4) % 4)
    raw = base64.urlsafe_b64decode(private_key + pad)
    key = ec.derive_private_key(int.from_bytes(raw, "big"), ec.SECP256R1())
    return key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
