# Funciones compartidas por los comandos de consola del servidor.
# No se ejecuta solo: lo usan gui, publicar, usuarios y estado.

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  echo "Este archivo no es un comando. Usa: rumbo ayuda" >&2
  exit 1
fi

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPTS_DIR/../.." && pwd)"

require_linux() {
  if [[ "$(uname -s)" != "Linux" ]]; then
    echo "Estos comandos corren en el servidor, por SSH." >&2
    exit 1
  fi
}

require_env() {
  if [[ ! -f "$ROOT/deploy/.env" ]]; then
    echo "Falta $ROOT/deploy/.env. Cópialo desde deploy/.env.example y cambia las contraseñas." >&2
    exit 1
  fi
}

ensure_docker() {
  if [[ -n "${DOCKER_READY:-}" ]]; then
    return 0
  fi
  if docker info >/dev/null 2>&1; then
    DOCKER=(docker)
  else
    echo "Docker pide permisos de administrador." >&2
    DOCKER=(sudo docker)
    "${DOCKER[@]}" info >/dev/null
  fi
  if ! "${DOCKER[@]}" compose version >/dev/null 2>&1; then
    echo "Falta el plugin 'docker compose'." >&2
    exit 1
  fi
  DOCKER_READY=1
}

compose() {
  ensure_docker
  (
    cd "$ROOT"
    "${DOCKER[@]}" compose --env-file deploy/.env -f deploy/compose.yaml "$@"
  )
}

docker_cli() {
  ensure_docker
  "${DOCKER[@]}" "$@"
}

# Túnel de Cloudflare solo si hay token. No imprime el valor.
tunnel_configurado() {
  local line val
  line="$(grep -E '^[[:space:]]*TUNNEL_TOKEN=' "$ROOT/deploy/.env" | tail -1 || true)"
  val="${line#*=}"
  val="${val%$'\r'}"
  val="${val#\"}"
  val="${val%\"}"
  val="${val#\'}"
  val="${val%\'}"
  [[ -n "${val// /}" ]]
}

app_timezone() {
  local tz
  tz="$(grep -E '^[[:space:]]*APP_TIMEZONE=' "$ROOT/deploy/.env" 2>/dev/null | tail -1 | cut -d= -f2- || true)"
  tz="${tz%$'\r'}"
  tz="${tz#\"}"
  tz="${tz%\"}"
  tz="${tz#\'}"
  tz="${tz%\'}"
  if [[ ! "$tz" =~ ^[A-Za-z0-9_+/-]+$ ]]; then
    tz="America/Bogota"
  fi
  printf '%s' "$tz"
}
