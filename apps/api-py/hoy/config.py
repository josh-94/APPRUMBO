import os
from dataclasses import dataclass
from zoneinfo import ZoneInfo


@dataclass(frozen=True)
class Config:
    addr: str
    database_url: str
    redis_url: str
    session_secret: str
    location: ZoneInfo
    cookie_secure: bool
    vapid_public: str
    vapid_private: str
    vapid_subject: str
    google_id: str
    google_secret: str
    google_redirect: str


def load() -> Config:
    database_url = os.environ.get("DATABASE_URL", "")
    redis_url = os.environ.get("REDIS_URL", "")
    session_secret = os.environ.get("SESSION_SECRET", "")
    if not database_url or not redis_url:
        raise SystemExit("DATABASE_URL y REDIS_URL son obligatorias")
    if len(session_secret) < 16:
        raise SystemExit("SESSION_SECRET debe tener al menos 16 caracteres")
    zone = os.environ.get("APP_TIMEZONE", "America/Bogota")
    try:
        location = ZoneInfo(zone)
    except Exception as exc:
        raise SystemExit(f"APP_TIMEZONE: {exc}") from exc
    secure = os.environ.get("COOKIE_SECURE", "") in ("true", "1")
    return Config(
        addr=os.environ.get("APP_ADDR", ":8080"),
        database_url=database_url,
        redis_url=redis_url,
        session_secret=session_secret,
        location=location,
        cookie_secure=secure,
        vapid_public=os.environ.get("VAPID_PUBLIC_KEY", ""),
        vapid_private=os.environ.get("VAPID_PRIVATE_KEY", ""),
        vapid_subject=os.environ.get("VAPID_SUBJECT", "mailto:hello@codewithjosh.codes"),
        google_id=os.environ.get("GOOGLE_CLIENT_ID", ""),
        google_secret=os.environ.get("GOOGLE_CLIENT_SECRET", ""),
        google_redirect=os.environ.get("GOOGLE_REDIRECT_URL", ""),
    )
