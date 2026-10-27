#!/bin/sh
# Exporta somente os schemas da aplicação, sem escrever no Neon.
set -eu
umask 077
grafica_base=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
test -f "$grafica_base/.env.neon-source"
test -f /etc/ssl/certs/ca-certificates.crt
mkdir -p "$grafica_base/migration"
chmod 700 "$grafica_base/migration"
grafica_nome="neon-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
docker run --rm --memory=256m --cpus=0.5 \
  --env-file "$grafica_base/.env.neon-source" \
  --env "GRAFICA_DUMP_NAME=$grafica_nome" \
  -v "$grafica_base/migration:/migration" \
  -v /etc/ssl/certs/ca-certificates.crt:/grafica-ca.crt:ro \
  postgres:16-bookworm sh -eu -c '
    umask 077
    test -f /grafica-ca.crt
    export PGDATABASE="$(printf %s "$SOURCE_DATABASE_URL" | sed "s/sslmode=require/sslmode=verify-full/")"
    export PGSSLROOTCERT=/grafica-ca.crt
    export PGCONNECT_TIMEOUT=15
    export PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=120000"
    trap '\''rm -f "/migration/$GRAFICA_DUMP_NAME.tmp"'\'' EXIT HUP INT TERM
    pg_dump --dbname="$PGDATABASE" --format=custom --compress=6 --no-owner --no-privileges \
      --lock-wait-timeout=15s --schema=public --schema=drizzle \
      --exclude-table-data=public.session \
      --exclude-table-data=public.sso_tokens_de_troca \
      --exclude-table-data=public.limite_de_tentativas \
      --exclude-table-data=public.reservas_de_disparo \
      --file="/migration/$GRAFICA_DUMP_NAME.tmp"
    pg_restore --list "/migration/$GRAFICA_DUMP_NAME.tmp" >/dev/null
    test ! -e "/migration/$GRAFICA_DUMP_NAME"
    mv "/migration/$GRAFICA_DUMP_NAME.tmp" "/migration/$GRAFICA_DUMP_NAME"
    sha256sum "/migration/$GRAFICA_DUMP_NAME"
    wc -c "/migration/$GRAFICA_DUMP_NAME"
  '
