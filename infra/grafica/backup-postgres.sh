#!/bin/sh
set -eu
umask 077

grafica_base=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
grafica_env=${GRAFICA_ENV_FILE:-"$grafica_base/.env"}
grafica_backup_dir=${GRAFICA_BACKUP_DIR:-"$grafica_base/backups"}
grafica_db=${GRAFICA_DATABASE_NAME:-}

if [ ! -f "$grafica_env" ]; then
  printf '%s\n' 'Arquivo de ambiente ausente. Defina GRAFICA_ENV_FILE ou crie .env.' >&2
  exit 1
fi

# POSTGRES_DB é o banco de inicialização do container e pode não ser o banco
# atualmente usado pelo app após uma importação. Consulte o destino ativo.
if [ -z "$grafica_db" ]; then
  grafica_db=$(docker compose --env-file "$grafica_env" \
    -f "$grafica_base/compose.yaml" -f "$grafica_base/compose.app.yaml" \
    exec -T app node --input-type=module -e \
    'const u=new URL(process.env.DATABASE_URL); if(u.hostname!=="postgres") process.exit(1); console.log(decodeURIComponent(u.pathname.slice(1)))')
fi
case "$grafica_db" in ''|*[!a-zA-Z0-9_]*) printf '%s\n' 'Nome do banco inválido.' >&2; exit 1;; esac

mkdir -p "$grafica_backup_dir"
grafica_tmp=$(mktemp "$grafica_backup_dir/.backup-XXXXXX")
trap 'rm -f "$grafica_tmp"' EXIT HUP INT TERM
grafica_destino="$grafica_backup_dir/grafica-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
if [ -e "$grafica_destino" ]; then
  printf '%s\n' 'O destino do backup já existe.' >&2
  exit 1
fi

docker compose --env-file "$grafica_env" -f "$grafica_base/compose.yaml" \
  exec -T postgres sh -c \
  'exec pg_dump -U "$POSTGRES_USER" -d "$1" --format=custom --no-owner --no-acl' sh "$grafica_db" > "$grafica_tmp"

test -s "$grafica_tmp"
docker compose --env-file "$grafica_env" -f "$grafica_base/compose.yaml" \
  exec -T postgres pg_restore --list < "$grafica_tmp" >/dev/null
mv "$grafica_tmp" "$grafica_destino"
trap - EXIT HUP INT TERM
printf 'Backup criado e catálogo validado: %s\n' "$grafica_destino"
printf 'Banco: %s\n' "$grafica_db"
sha256sum "$grafica_destino" > "$grafica_destino.sha256"

# O catálogo validado não comprova restauração. Testar em banco descartável.
# Este script não faz upload remoto e não apaga backups antigos.
