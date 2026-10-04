# RUMBO

Planificador personal del día. El sitio público es [app.codewithjosh.codes](https://app.codewithjosh.codes).

En la interfaz, **Hoy** significa el día de hoy: el grupo de tareas, el botón para mover una tarea a hoy y la etiqueta de fecha. El nombre del producto es RUMBO.

La app que está publicada es la de Go y React. El perfil de FastAPI y Flutter queda para comparar memoria y no debe arrancar a la vez: los dos workers leen el mismo grupo de Redis.

El módulo Go, la base, las cookies y las imágenes Docker siguen llamándose `hoy`. Cambiarlos no renombra el volumen de Postgres que ya existe.

## Arranque local

```bash
cp deploy/.env.example deploy/.env
docker compose --env-file deploy/.env -f deploy/compose.yaml --profile local up --build
```

La app queda en `http://127.0.0.1:8088`. Con el perfil `local`, pgweb escucha solo en `http://127.0.0.1:8081`.

`deploy/.env` no va a git. `SESSION_SECRET` tiene que tener al menos 16 caracteres. `COOKIE_SECURE` se deja en `false` en la red de casa y en `true` cuando el sitio se sirve por HTTPS.

## Cuentas

Se entra con correo y contraseña, o con Google. El botón de Google responde solo si las tres variables tienen valor:

```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URL
```

En local el redirect es `http://127.0.0.1:8088/api/auth/google/callback`. En el sitio público es `https://app.codewithjosh.codes/api/auth/google/callback`. Google pide `openid`, `email` y `profile`. Si el correo ya tiene cuenta, la enlaza. Si no, crea el usuario y abre el día.

La política de privacidad está en `/privacidad` y las condiciones en `/condiciones`.

## Avisos

En el iPhone el aviso solo llega si la app está en la pantalla de inicio y el sitio es HTTPS.

```bash
docker compose --env-file deploy/.env -f deploy/compose.yaml run --rm --no-deps api vapid
```

Las dos llaves van a `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`. `VAPID_SUBJECT` es un correo, por ejemplo `mailto:hello@codewithjosh.codes`. Una tarea avisa si tiene fecha, hora y **Recordarme**. El aviso sale hasta unos 30 segundos después de esa hora.

## Publicación

El túnel de Cloudflare apunta el hostname `app` a `http://web:80`. El token vive solo en `TUNNEL_TOKEN` dentro de `deploy/.env` en el servidor, no en git.

En el servidor, dentro del repo:

```bash
docker compose --env-file deploy/.env -f deploy/compose.yaml --profile tunnel up -d --build
```

Eso levanta Postgres, Redis, la API, el worker, la web y `cloudflared`. No arranques el perfil `python` en ese mismo momento.
