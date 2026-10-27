#!/bin/sh
set -eu
umask 077
base=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# Exclusão mútua inclusive para execuções manuais.
exec 9>"$base/backups/.backup.lock"
flock -n 9 || { echo 'Já há um backup em execução.' >&2; exit 1; }
sh "$base/backup-postgres.sh" > "$base/backups/ultima-execucao.log"
cat "$base/backups/ultima-execucao.log"
dump=$(sed -n 's/^Backup criado e catálogo validado: //p' "$base/backups/ultima-execucao.log")
test -s "$dump"
if [ -f "$base/backup-r2.env" ]; then
  # Usa apenas a credencial de backup. Não entrega ao container segredos do app.
  docker run --rm --read-only --user 0 --cap-drop ALL \
    --security-opt no-new-privileges:true --memory 192m --cpus 0.5 \
    --env-file "$base/backup-r2.env" \
    -v "$base/backups:/backups:ro" \
    -v "$base/enviar-backup-r2.mjs:/app/scripts/enviar-backup-r2.mjs:ro" \
    grafica-homolog:20261009-visual node /app/scripts/enviar-backup-r2.mjs \
    "/backups/$(basename "$dump")" > "$dump.r2.json"
  cat "$dump.r2.json"
else
  echo 'Backup local concluído. Envio ao R2 pendente: backup-r2.env ausente.'
fi
# Não elimina backups anteriores. Retenção será definida separadamente.
