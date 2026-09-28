import base64
import hashlib
import logging
import secrets
import threading
from datetime import datetime, timedelta, timezone
from email.utils import parseaddr
from urllib.parse import urlencode

import bcrypt
import httpx
import psycopg
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse, RedirectResponse, Response

from .config import Config
from .notify import connect_redis, run_scheduler
from .schedule import day_key, mask, section_for, start_of_day, weekdays
from .session import read_oauth, sign, sign_oauth, user_id
from .store import EmailTaken, LastList, ListRow, NotFound, Store, Subscription, connect
from .tasks import (
    Task,
    ValidationError,
    apply_done,
    apply_later,
    apply_today,
    in_my_day,
    in_week,
    moment_rank,
    normalize,
)

log = logging.getLogger("hoy")
COOKIE = "hoy_session"
OAUTH_COOKIE = "hoy_oauth"
DUMMY_HASH = b"$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"


def create_app(cfg: Config, store: Store, redis_client) -> FastAPI:
    app = FastAPI()
    stop = threading.Event()
    thread = threading.Thread(target=run_scheduler, args=(store, redis_client, cfg.location, stop), daemon=True)
    thread.start()

    @app.on_event("shutdown")
    def _stop() -> None:
        stop.set()

    def error(status: int, message: str) -> JSONResponse:
        return JSONResponse({"error": message}, status_code=status)

    def current(request: Request) -> int | JSONResponse:
        raw = request.cookies.get(COOKIE)
        if not raw:
            return error(401, "Necesitas entrar")
        found = user_id(cfg.session_secret, raw, datetime.now(timezone.utc))
        if found is None:
            return error(401, "Necesitas entrar")
        return found

    def session_cookie(response: Response, uid: int, exp: datetime) -> None:
        response.set_cookie(
            COOKIE,
            sign(cfg.session_secret, uid, exp),
            max_age=max(int((exp - datetime.now(timezone.utc)).total_seconds()), 0),
            path="/",
            httponly=True,
            samesite="lax",
            secure=cfg.cookie_secure,
        )

    @app.get("/healthz")
    def health():
        try:
            store.ping()
            redis_client.ping()
        except Exception:
            return PlainTextResponse("base de datos", status_code=503)
        return PlainTextResponse("ok")

    @app.post("/api/register")
    async def register(request: Request):
        email, password, problem = await credentials(request)
        if problem is not None:
            return problem
        if len(password) < 8:
            return error(422, "La contraseña necesita al menos 8 caracteres")
        digest = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        try:
            uid = store.register(email, digest)
        except EmailTaken:
            return error(409, "Ese correo ya tiene cuenta")
        except Exception:
            log.exception("register")
            return error(500, "No se pudo crear la cuenta")
        response = JSONResponse({"ok": True}, status_code=201)
        session_cookie(response, uid, datetime.now(timezone.utc) + timedelta(days=30))
        return response

    @app.post("/api/session")
    async def login(request: Request):
        email, password, problem = await credentials(request)
        if problem is not None:
            return problem
        stored = DUMMY_HASH
        uid = None
        try:
            found, hashed = store.user_by_email(email)
            if hashed:
                stored = hashed.encode()
                uid = found
        except NotFound:
            pass
        except Exception:
            log.exception("login")
            return error(500, "No se pudo entrar")
        try:
            ok = bcrypt.checkpw(password.encode(), stored)
        except ValueError:
            ok = False
        if not ok or uid is None:
            return error(401, "Correo o contraseña incorrectos")
        response = JSONResponse({"ok": True})
        session_cookie(response, uid, datetime.now(timezone.utc) + timedelta(days=30))
        return response

    @app.delete("/api/session")
    def logout():
        response = Response(status_code=204)
        response.delete_cookie(COOKIE, path="/")
        return response

    @app.get("/api/session")
    def session_info(request: Request):
        uid = current(request)
        if isinstance(uid, JSONResponse):
            return uid
        return {"ok": True, "push": bool(cfg.vapid_public)}

    @app.get("/api/auth/google")
    def google_start():
        if not _google_ready(cfg):
            return error(409, "Google no está configurado")
        state = secrets.token_urlsafe(16)
        verifier = secrets.token_urlsafe(32)
        exp = datetime.now(timezone.utc) + timedelta(minutes=10)
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
        query = urlencode({
            "client_id": cfg.google_id,
            "redirect_uri": cfg.google_redirect,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        })
        response = RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{query}", status_code=302)
        response.set_cookie(
            OAUTH_COOKIE,
            sign_oauth(cfg.session_secret, state, verifier, exp),
            max_age=600,
            path="/",
            httponly=True,
            samesite="lax",
            secure=cfg.cookie_secure,
        )
        return response

    @app.get("/api/auth/google/callback")
    def google_callback(request: Request):
        fail = RedirectResponse("/?error=google", status_code=302)
        if not _google_ready(cfg):
            return fail
        raw = request.cookies.get(OAUTH_COOKIE)
        parsed = read_oauth(cfg.session_secret, raw, datetime.now(timezone.utc)) if raw else None
        code = request.query_params.get("code", "")
        state = request.query_params.get("state", "")
        if parsed is None or parsed[0] != state or not code:
            return fail
        verifier = parsed[1]
        try:
            token = httpx.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": cfg.google_id,
                    "client_secret": cfg.google_secret,
                    "code": code,
                    "code_verifier": verifier,
                    "grant_type": "authorization_code",
                    "redirect_uri": cfg.google_redirect,
                },
                timeout=10,
            )
            token.raise_for_status()
            access = token.json()["access_token"]
            info = httpx.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {access}"},
                timeout=10,
            )
            info.raise_for_status()
            body = info.json()
        except Exception:
            log.exception("google")
            return fail
        email = normalize_email(str(body.get("email") or ""))
        if email is None or not body.get("email_verified") or not body.get("sub"):
            return fail
        try:
            uid = store.upsert_google_user(email, str(body["sub"]))
        except Exception:
            log.exception("google user")
            return fail
        response = RedirectResponse("/dia", status_code=302)
        response.delete_cookie(OAUTH_COOKIE, path="/")
        session_cookie(response, uid, datetime.now(timezone.utc) + timedelta(days=30))
        return response

    @app.get("/api/lists")
    def lists(request: Request):
        uid = current(request)
        if isinstance(uid, JSONResponse):
            return uid
        try:
            rows = store.lists(uid)
        except Exception:
            log.exception("lists")
            return error(500, "No se pudieron leer las listas")
        return {"lists": [_list_json(item) for item in rows]}

    @app.post("/api/lists")
    async def create_list(request: Request):
        uid = current(request)
        if isinstance(uid, JSONResponse):
            return uid
        body = await _json(request)
        if body is None:
            return error(400, "JSON inválido")
        name = str(body.get("name") or "").strip()
        if not name or len(name) > 80:
            return error(422, "El nombre de la lista no sirve")
        try:
            created = store.create_list(uid, name)
        except Exception:
            log.exception("create list")
            return error(500, "No se pudo crear la lista")
        return JSONResponse(_list_json(created), status_code=201)

    @app.patch("/api/lists/{list_id}")
    async def rename_list(list_id: int, request: Request):
        uid = current(request)
        if isinstance(uid, JSONResponse):
            return uid
        body = await _json(request)
        if body is None:
            return error(400, "JSON inválido")
        name = str(body.get("name") or "").strip()
        if not name or len(name) > 80:
            return error(422, "El nombre de la lista no sirve")
        try:
            renamed = store.rename_list(uid, list_id, name)
        except NotFound:
            return error(404, "Lista no encontrada")
        except Exception:
            log.exception("rename list")
            return error(500, "No se pudo renombrar")
        return _list_json(renamed)

    @app.delete("/api/lists/{list_id}")
    def delete_list(list_id: int, request: Request):
        uid = current(request)
        if isinstance(uid, JSONResponse):
            return uid
        try:
            store.delete_list(uid, list_id)
        except LastList:
            return error(409, "Deja al menos una lista")
        except NotFound:
            return error(404, "Lista no encontrada")
        except Exception:
            log.exception("delete list")
            return error(500, "No se pudo borrar la lista")
        return Response(status_code=204)

    @app.post("/api/lists/{list_id}/order")
    async def reorder(list_id: int, request: Request):
        uid = current(request)
        if isinstance(uid, JSONResponse):
            return uid
        body = await _json(request)
        if body is None:
            return error(400, "JSON inválido")
        try:
            ids = [int(item) for item in body.get("taskIds") or []]
        except (TypeError, ValueError):
            return error(400, "JSON inválido")
        try:
            store.reorder(uid, list_id, ids)
        except NotFound:
            return error(404, "Hay una tarea que no está en la lista")
        except Exception:
            log.exception("reorder")
            return error(500, "No se pudo reordenar")
        return Response(status_code=204)

    @app.get("/api/tasks")
    def tasks(request: Request):
        uid = current(request)
        if isinstance(uid, JSONResponse):
            return uid
        now = datetime.now(timezone.utc)
        since = start_of_day(now, cfg.location) - timedelta(days=14)
        try:
            rows = store.tasks(uid, since)
        except Exception:
            log.exception("tasks")
            return error(500, "No se pudieron leer las tareas")
        view = request.query_params.get("view")
        if view == "myday":
            selected = [item for item in rows if in_my_day(item, now, cfg.location)]
            selected.sort(key=_due_key)
            selected.sort(key=lambda item: (item.status != "open", not item.pinned))
        elif view == "week":
            selected = [item for item in rows if in_week(item, now, cfg.location)]
            selected.sort(key=_due_key)
        elif view == "moment":
            start = start_of_day(now, cfg.location)
            selected = []
            for item in rows:
                if item.status != "open":
                    continue
                if item.completed_at is not None and start_of_day(item.completed_at, cfg.location) == start:
                    continue
                if item.due_at is not None and item.due_at >= start and section_for(item.due_at, now, cfg.location) == "today":
                    continue
                selected.append(item)
            selected.sort(key=_due_key)
            selected.sort(key=lambda item: moment_rank(item, now, cfg.location))
        else:
            raw_list = request.query_params.get("listId")
            try:
                list_id = int(raw_list or "")
            except ValueError:
                return error(400, "Falta la lista")
            selected = [item for item in rows if item.list_id == list_id]
            if request.query_params.get("sort") == "manual":
                selected.sort(key=lambda item: (item.status != "open", item.position, item.id))
            else:
                selected.sort(key=_due_key)
                selected.sort(key=lambda item: (
                    item.status != "open",
                    _section_rank(section_for(item.due_at, now, cfg.location)),
                ))
        return {"tasks": [_task_json(item, now, cfg) for item in selected]}

    @app.get("/api/tasks/{task_id}")
    def task_by_id(task_id: int, request: Request):
        uid = current(request)
        if isinstance(uid, JSONResponse):
            return uid
        item = _load(store, uid, task_id)
        if item is None:
            return error(404, "Tarea no encontrada")
        return _task_json(item, datetime.now(timezone.utc), cfg)

    @app.post("/api/tasks")
    async def create_task(request: Request):
        uid = current(request)
        if isinstance(uid, JSONResponse):
            return uid
        item, problem = await _read_task(request)
        if problem is not None:
            return problem
        item.status = "open"
        try:
            item = normalize(item, datetime.now(timezone.utc), cfg.location)
            created = store.create_task(uid, item)
        except ValidationError as exc:
            return error(422, exc.message)
        except NotFound:
            return error(422, "La lista no existe")
        except psycopg.errors.ForeignKeyViolation:
            return error(422, "La lista no existe")
        except Exception:
            log.exception("create task")
            return error(500, "No se pudo crear la tarea")
        return JSONResponse(_task_json(created, datetime.now(timezone.utc), cfg), status_code=201)

    @app.patch("/api/tasks/{task_id}")
    async def update_task(task_id: int, request: Request):
        uid = current(request)
        if isinstance(uid, JSONResponse):
            return uid
        current_item = _load(store, uid, task_id)
        if current_item is None:
            return error(404, "Tarea no encontrada")
        item, problem = await _read_task(request)
        if problem is not None:
            return problem
        item.id = current_item.id
        item.position = current_item.position
        item.status = current_item.status
        item.completed_at = current_item.completed_at
        try:
            item = normalize(item, datetime.now(timezone.utc), cfg.location)
            item.status = current_item.status
            item.completed_at = current_item.completed_at
            updated = store.update_task(uid, item)
        except ValidationError as exc:
            return error(422, exc.message)
        except NotFound:
            return error(404, "Tarea no encontrada")
        except psycopg.errors.ForeignKeyViolation:
            return error(422, "La lista no existe")
        except Exception:
            log.exception("update task")
            return error(500, "No se pudo guardar la tarea")
        return _task_json(updated, datetime.now(timezone.utc), cfg)

    @app.delete("/api/tasks/{task_id}")
    def delete_task(task_id: int, request: Request):
        uid = current(request)
        if isinstance(uid, JSONResponse):
            return uid
        try:
            store.delete_task(uid, task_id)
        except NotFound:
            return error(404, "Tarea no encontrada")
        except Exception:
            log.exception("delete task")
            return error(500, "No se pudo borrar la tarea")
        return Response(status_code=204)

    def _mutate(request: Request, task_id: int, fn):
        uid = current(request)
        if isinstance(uid, JSONResponse):
            return uid
        item = _load(store, uid, task_id)
        if item is None:
            return error(404, "Tarea no encontrada")
        try:
            updated = store.update_task(uid, fn(item))
        except Exception:
            log.exception("mutate")
            return error(500, "No se pudo actualizar la tarea")
        return _task_json(updated, datetime.now(timezone.utc), cfg)

    @app.post("/api/tasks/{task_id}/done")
    def done_task(task_id: int, request: Request):
        return _mutate(request, task_id, lambda item: apply_done(item, datetime.now(timezone.utc), cfg.location))

    @app.post("/api/tasks/{task_id}/today")
    def today_task(task_id: int, request: Request):
        return _mutate(request, task_id, lambda item: apply_today(item, datetime.now(timezone.utc), cfg.location))

    @app.post("/api/tasks/{task_id}/later")
    async def later_task(task_id: int, request: Request):
        body = await _json(request)
        due = _parse_time((body or {}).get("dueAt")) if body else None
        if due is None:
            return error(400, "Elige una fecha")
        return _mutate(request, task_id, lambda item: apply_later(item, due))

    @app.get("/api/push/vapid")
    def vapid(request: Request):
        uid = current(request)
        if isinstance(uid, JSONResponse):
            return uid
        if not cfg.vapid_public:
            return error(409, "El servidor no tiene llaves VAPID")
        return {"publicKey": cfg.vapid_public}

    @app.post("/api/push/subscriptions")
    async def save_push(request: Request):
        uid = current(request)
        if isinstance(uid, JSONResponse):
            return uid
        body = await _json(request)
        keys = (body or {}).get("keys") or {}
        endpoint = str((body or {}).get("endpoint") or "")
        if body is None or not endpoint or not keys.get("p256dh") or not keys.get("auth"):
            return error(400, "Suscripción incompleta")
        try:
            store.save_subscription(uid, Subscription(endpoint, keys["p256dh"], keys["auth"]))
        except Exception:
            log.exception("push")
            return error(500, "No se pudo guardar la suscripción")
        return Response(status_code=204)

    @app.delete("/api/push/subscriptions")
    async def delete_push(request: Request):
        uid = current(request)
        if isinstance(uid, JSONResponse):
            return uid
        body = await _json(request)
        endpoint = str((body or {}).get("endpoint") or "")
        if not endpoint:
            return error(400, "Falta el endpoint")
        try:
            store.delete_subscription(endpoint)
        except Exception:
            log.exception("push delete")
            return error(500, "No se pudo borrar la suscripción")
        return Response(status_code=204)

    return app


def _google_ready(cfg: Config) -> bool:
    return bool(cfg.google_id and cfg.google_secret and cfg.google_redirect)


def _list_json(item: ListRow) -> dict:
    return {"id": item.id, "name": item.name, "position": item.position, "openCount": item.open_count}


def _task_json(item: Task, now: datetime, cfg: Config) -> dict:
    return {
        "id": item.id,
        "listId": item.list_id,
        "title": item.title,
        "notes": item.notes,
        "dueAt": item.due_at.isoformat() if item.due_at else None,
        "remindAt": item.remind_at.isoformat() if item.remind_at else None,
        "status": item.status,
        "pinned": item.pinned,
        "position": item.position,
        "repeatWeekdays": weekdays(item.repeat_mask),
        "completedAt": item.completed_at.isoformat() if item.completed_at else None,
        "section": section_for(item.due_at, now, cfg.location),
        "dueDay": day_key(item.due_at, cfg.location) if item.due_at else None,
    }


def _due_key(item: Task):
    if item.due_at is None:
        return (1, datetime.max.replace(tzinfo=timezone.utc), item.id)
    return (0, item.due_at, item.id)


def _section_rank(section: str) -> int:
    return {"today": 0, "tomorrow": 1, "upcoming": 2}.get(section, 3)


def _load(store: Store, uid: int, task_id: int) -> Task | None:
    since = datetime.now(timezone.utc) - timedelta(days=365 * 5)
    for item in store.tasks(uid, since):
        if item.id == task_id:
            return item
    return None


async def _json(request: Request) -> dict | None:
    try:
        body = await request.json()
    except Exception:
        return None
    if not isinstance(body, dict):
        return None
    return body


async def _read_task(request: Request) -> tuple[Task | None, JSONResponse | None]:
    body = await _json(request)
    if body is None:
        return None, JSONResponse({"error": "JSON inválido"}, status_code=400)
    try:
        list_id = int(body.get("listId"))
    except (TypeError, ValueError):
        return None, JSONResponse({"error": "JSON inválido"}, status_code=400)
    days = body.get("repeatWeekdays") or []
    if not isinstance(days, list):
        return None, JSONResponse({"error": "JSON inválido"}, status_code=400)
    return Task(
        list_id=list_id,
        title=str(body.get("title") or ""),
        notes=str(body.get("notes") or ""),
        due_at=_parse_time(body.get("dueAt")),
        want_remind=bool(body.get("remind")),
        pinned=bool(body.get("pinned")),
        repeat_mask=mask([int(day) for day in days]),
    ), None


def _parse_time(value) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    text = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


async def credentials(request: Request) -> tuple[str, str, JSONResponse | None]:
    body = await _json(request)
    if body is None:
        return "", "", JSONResponse({"error": "JSON inválido"}, status_code=400)
    email = normalize_email(str(body.get("email") or ""))
    if email is None:
        return "", "", JSONResponse({"error": "El correo no sirve"}, status_code=422)
    return email, str(body.get("password") or ""), None


def normalize_email(value: str) -> str | None:
    email = value.strip().lower()
    _, addr = parseaddr(email)
    if addr != email or len(email) > 200 or "@" not in email or email.startswith("@") or email.endswith("@"):
        return None
    return email


def build(cfg: Config) -> FastAPI:
    store = connect(cfg.database_url)
    store.migrate()
    redis_client = connect_redis(cfg.redis_url)
    return create_app(cfg, store, redis_client)
