#!/bin/sh
# Restaura o dump do Neon num banco NOVO de produção. Não toca nos bancos existentes.
set -eu
umask 077
base=/home/marcosvinicius/grafica-homolog/infra
dump="$base/migration/$1"
container=grafica-homolog-postgres-1
database=grafica_producao_20261026
test -s "$dump"
existe=$(docker exec "$container" psql -U postgres -Atc "select 1 from pg_database where datname='$database'")
test -z "$existe" || { echo "Banco $database já existe; abortando."; exit 1; }
docker exec "$container" createdb -U postgres -O grafica_app "$database"
docker exec -i "$container" pg_restore --list < "$dump" | \
  sed '/ SCHEMA - public /d; / COMMENT - SCHEMA public /d' > "$base/migration/producao-20261026.list"
docker cp "$base/migration/producao-20261026.list" "$container:/tmp/grafica-producao-20261026.list"
docker exec -i "$container" pg_restore -U postgres --role=grafica_app \
  --dbname="$database" --single-transaction --exit-on-error --no-owner --no-acl \
  --use-list=/tmp/grafica-producao-20261026.list < "$dump"
docker exec "$container" rm /tmp/grafica-producao-20261026.list
echo "Restaurado em $database"
