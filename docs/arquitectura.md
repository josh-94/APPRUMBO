# Arquitectura de Rumbo

Octubre 2026. Describe el sistema que corre hoy en la placa de casa. No es un plan de migración.

## Cómo llega una visita

El navegador habla con Cloudflare. Ahí terminan el DNS y el TLS de `apprumbo.online` (la página) y `mi.apprumbo.online` (la app). Un contenedor `cloudflared` abre el túnel hacia afuera y entrega el tráfico a nginx, dentro de la red de Docker. La placa no publica el puerto 443.

```mermaid
flowchart LR
  browser[Navegador]
  cf[Cloudflare_DNS_y_tunel]
  web[nginx_web]
  api[API_Go]
  pg[Postgres]
  redis[Redis]
  worker[Worker_push]
  groq[Groq]
  ollama[Ollama_gemma3]
  browser --> cf --> web
  web -->|estaticos| browser
  web -->|/api| api
  api --> pg
  api --> redis
  api -->|avisos| redis
  api -->|texto_primero| groq
  api -.->|fallback| ollama
  worker --> redis
  worker --> pg
```

nginx está en [apps/web/nginx.conf](../apps/web/nginx.conf). Los archivos de la app y de la landing salen de disco. Lo que empieza por `/api/` se reenvía a `api:8080`, acepta hasta 8 MB y espera 90 segundos: margen para la respuesta del modelo. `www.apprumbo.online` redirige al apex en Cloudflare; el túnel no lo publica.

## Qué corre en la placa

Producción es el perfil `tunnel` de [deploy/compose.yaml](../deploy/compose.yaml). Un solo `docker compose` levanta todo en la misma máquina. La placa tiene unos 8 GB de RAM; el presupuesto de abajo deja margen para el SO y Docker.

| Servicio | Qué hace | Tope de memoria |
| --- | --- | --- |
| `postgres` | Datos. Postgres 16. Volumen `pgdata`. | 512 MiB |
| `redis` | Cola de avisos. 64 MB; si se llena, bota lo más viejo. | 96 MiB |
| `api` | API en Go. Sesión en una cookie firmada. Publica los recordatorios en Redis. Llama a Groq y, si hace falta, a Ollama. | 128 MiB |
| `worker` | Lee esa cola y manda el push. | 64 MiB |
| `web` | nginx. Estáticos y proxy hacia la API. | 64 MiB |
| `cloudflared` | Túnel. El token vive en `deploy/.env`, que no está en git. | 128 MiB |
| `ollama` | Fallback local: `gemma3:1b`. `MAX_LOADED_MODELS=1`, `KEEP_ALIVE=-1`. Sin visión ni audio. | 2 GiB |
| `ollama-pull` | Baja Gemma la primera vez, lo calienta y sale. No se queda encendido. | 128 MiB |

Redis no guarda la sesión de cada visita: la cookie viaja con el navegador y la API la verifica sola.

Los borradores de gasto/captura que necesitan modelo van primero a **Groq** (`GROQ_API_KEY` + `GROQ_MODEL`, por defecto `llama-3.1-8b-instant`). Si Groq falla (red, 429, 5xx) o no hay key, caen a **Ollama** con `gemma3:1b`. Muchas correcciones cortas se resuelven en local sin llamar a ningún modelo.

Ollama no publica puertos y no sale por el túnel. Solo la API le habla, dentro de la red de Docker. Los pesos quedan en el volumen `ollamadata`. El primer arranque los descarga y deja el modelo en RAM. La API manda `num_thread` (`OLLAMA_NUM_THREAD`, por defecto 4) y contextos cortos. El chat de gastos y la captura aceptan solo texto; si llega audio o imagen, la API responde 422. El borrador no se guarda solo: la persona lo confirma y ahí la API anota el movimiento.

El reloj de la app sale de `APP_TIMEZONE` en `deploy/.env`. El ejemplo del repo dice `America/Bogota`. Lima marca la misma hora (UTC−5, sin horario de verano).

Para publicar un cambio: `rumbo publicar`. Baja la rama con fast-forward, reconstruye las imágenes en la placa y espera a que `/healthz` de la API responda. Postgres no se borra: los datos están en el volumen `pgdata`.

No hay copia de seguridad de `pgdata` en este repositorio. Si se pierde el disco, se pierde la base.

## Para crecer

Hoy es una sola máquina, una sola API y una sola base, detrás del túnel. Para que aguante más gente haría falta una copia de la base fuera de la placa, más de un proceso de API y Postgres en otra máquina.
