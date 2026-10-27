#!/bin/sh
# Cópia incremental Replit -> R2: retomada = todas as cópias anteriores; token pela entrada padrão.
set -eu
cd /home/marcosvinicius/grafica-homolog/infra
TS=$(date -u +%Y%m%dT%H%M%S)
cat transferencias/copia-20261026T1407.jsonl transferencias/copia-20261026T17*.jsonl > /tmp/retomada-$TS.jsonl
docker run -i --rm --name grafica-storage-copia-$TS --memory=768m --env-file services.env \
  -v "$PWD/migrar-storage-r2-novos.mjs:/app/migrar-storage-r2.mjs:ro" \
  -v "/tmp/retomada-$TS.jsonl:/app/retomada.jsonl:ro" \
  grafica-homolog:20261026-integrada node /app/migrar-storage-r2.mjs --aplicar --todos --retomar --confirmar-destino=grafica-homolog-arquivos \
  > transferencias/copia-$TS.jsonl
rm -f /tmp/retomada-$TS.jsonl
head -1 transferencias/copia-$TS.jsonl | cut -c1-200
tail -1 transferencias/copia-$TS.jsonl
