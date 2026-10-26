#!/bin/sh
set -eu
umask 077
base=/home/marcosvinicius/grafica-homolog/infra
dump="$base/backups/grafica-20261009T151610Z-1598982.dump"
container=grafica-homolog-postgres-1
database=grafica_restorecheck_20261009_151610
test -s "$dump"
sha256sum -c "$dump.sha256"
docker exec "$container" createdb -U postgres -O grafica_app "$database"
docker exec -i "$container" pg_restore --list < "$dump" | \
  sed '/ SCHEMA - public /d; / COMMENT - SCHEMA public /d' > "$base/backups/restorecheck-20261009.list"
docker cp "$base/backups/restorecheck-20261009.list" "$container:/tmp/grafica-restorecheck-20261009.list"
docker exec -i "$container" pg_restore -U postgres --role=grafica_app \
  --dbname="$database" --single-transaction --exit-on-error --no-owner --no-acl \
  --use-list=/tmp/grafica-restorecheck-20261009.list < "$dump"
docker exec -i -e GRAFICA_RESTORE_TEST_DB="$database" grafica-homolog-app-1 \
  node --input-type=module - < "$base/verificar-restauracao.mjs" > "$base/backups/restorecheck-20261009.json"
cat "$base/backups/restorecheck-20261009.json"
# Só o banco de teste criado por esta execução. Não remove bancos se falhar.
docker exec "$container" dropdb -U postgres "$database"
docker exec "$container" rm /tmp/grafica-restorecheck-20261009.list
echo 'Teste concluído; banco temporário removido.'
