#!/bin/sh
set -eu
umask 077
grafica_base=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$grafica_base"
test -f .env
test -f services.env
test ! -e app.env || { printf '%s\n' 'app.env já existe; preservado.'; exit 0; }
# .env é configuração privada gerada nesta VPS, administrada pelo operador.
set -a
. ./.env
set +a
: "${GRAFICA_DB_USER:?}" "${GRAFICA_DB_PASSWORD:?}" "${POSTGRES_DB:?}"
# Senhas desta preparação são hexadecimais, portanto seguras em uma URI.
case "$GRAFICA_DB_PASSWORD" in *[!a-fA-F0-9]*|'') exit 2;; esac
grafica_tmp=$(mktemp .app-env-XXXXXX)
trap 'rm -f -- "$grafica_tmp"' EXIT HUP INT TERM
{
  printf 'DATABASE_URL=postgresql://%s:%s@postgres:5432/%s\n' "$GRAFICA_DB_USER" "$GRAFICA_DB_PASSWORD" "$POSTGRES_DB"
  printf 'SESSION_SECRET=%s\n' "$(openssl rand -hex 48)"
  # Segredo isolado: o portal real ainda não está integrado à homologação.
  printf 'SSO_SECRET=%s\n' "$(openssl rand -hex 48)"
} > "$grafica_tmp"
chmod 600 "$grafica_tmp"
ln -- "$grafica_tmp" app.env
printf '%s\n' 'app.env criado com modo 600; sem seed e sem integração com portal de produção.'
