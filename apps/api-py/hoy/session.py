import base64
import hashlib
import hmac
from datetime import datetime, timezone


def sign(secret: str, user_id: int, exp: datetime) -> str:
    payload = f"{user_id}:{int(exp.timestamp())}"
    return payload + "." + _mac(secret, payload)


def user_id(secret: str, value: str, now: datetime) -> int | None:
    payload = _verified(secret, value)
    if payload is None or ":" not in payload:
        return None
    user_part, exp_part = payload.split(":", 1)
    try:
        found = int(user_part)
        exp_unix = int(exp_part)
    except ValueError:
        return None
    if found <= 0 or now.timestamp() >= exp_unix:
        return None
    return found


def sign_oauth(secret: str, state: str, verifier: str, exp: datetime) -> str:
    payload = f"{state}\n{verifier}\n{int(exp.timestamp())}"
    encoded = base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
    return encoded + "." + _mac(secret, payload)


def read_oauth(secret: str, value: str, now: datetime) -> tuple[str, str] | None:
    encoded, _, sig = value.partition(".")
    if not sig:
        return None
    pad = "=" * ((4 - len(encoded) % 4) % 4)
    try:
        payload = base64.urlsafe_b64decode(encoded + pad).decode()
    except Exception:
        return None
    if not _mac_ok(secret, payload, sig):
        return None
    parts = payload.split("\n")
    if len(parts) != 3 or not parts[0] or not parts[1]:
        return None
    try:
        exp_unix = int(parts[2])
    except ValueError:
        return None
    if now.timestamp() >= exp_unix:
        return None
    return parts[0], parts[1]


def _verified(secret: str, value: str) -> str | None:
    payload, _, sig = value.partition(".")
    if not sig or not _mac_ok(secret, payload, sig):
        return None
    return payload


def _mac_ok(secret: str, payload: str, sig: str) -> bool:
    if len(sig) != 64:
        return False
    expected = _mac(secret, payload)
    return hmac.compare_digest(sig, expected)


def _mac(secret: str, payload: str) -> str:
    digest = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest()
    return digest.hex()


def aware(moment: datetime) -> datetime:
    if moment.tzinfo is None:
        return moment.replace(tzinfo=timezone.utc)
    return moment
