#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# DEPLOY DO DEV pelo GitHub Actions (.github/workflows/deploy-dev.yml).
#
# Roda na VPS como comando FORÇADO da chave do CI em ~/.ssh/authorized_keys:
#   restrict,command="/home/marcosvinicius/grafica-dev/deploy-ci.sh" ssh-ed25519 … grafica-dev-ci
# Qualquer comando que a chave peça cai aqui; o único aceito é "deploy <sha>",
# com o release (tar.gz) no stdin. Só mexe no projeto Compose grafica-dev:
# nunca toca containers, banco, arquivos ou .env da produção.
#
# Passos: extrai o release → build da imagem grafica-dev:<sha> → migrações só
# no grafica_dev → troca GRAFICA_DEV_IMAGE → sobe o app → espera o health.
# Falhou depois da troca: volta para a imagem anterior e sai com erro.
# Guarda as últimas 5 releases/imagens.
#
# Teste manual: ./deploy-ci.sh deploy <sha> < release.tar.gz
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

BASE=/home/marcosvinicius/grafica-dev
PROJETO=grafica-dev
MANTER=5
LIMITE_RELEASE=$((300 * 1024 * 1024))

cd "$BASE"
log() { printf '[deploy-dev %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
docker() { sudo -n docker "$@"; }

pedido="${SSH_ORIGINAL_COMMAND:-$*}"
if [[ ! "$pedido" =~ ^deploy\ ([0-9a-f]{7,40})$ ]]; then
  echo "Esta chave só faz o deploy do DEV: 'deploy <sha>' com o release no stdin." >&2
  exit 2
fi
sha="${BASH_REMATCH[1]}"
tag="${sha:0:12}"

exec 9>"$BASE/.deploy.lock"
flock -w 900 9 || { echo "Outro deploy do dev está em andamento." >&2; exit 1; }

rel="$BASE/releases/$tag"
log "release $tag"
rm -rf "$rel"
mkdir -p "$rel"
head -c "$LIMITE_RELEASE" | tar -xzf - -C "$rel" --no-same-owner --no-same-permissions
for f in package.json package-lock.json dist/index.js migrations scripts/migrar.mjs shared global-quota-rules.json; do
  [ -e "$rel/$f" ] || { echo "Release incompleto: falta $f" >&2; exit 1; }
done
chmod -R a+rX "$rel"

imagem="grafica-dev:$tag"
log "build $imagem"
docker build --quiet -t "$imagem" -f "$BASE/Dockerfile.ci" \
  --label "grafica.commit=$sha" --label "grafica.ambiente=dev" "$rel" >/dev/null

# Migrações: simulação e, se houver pendência, aplicação — só no grafica_dev
# (o DATABASE_URL do app.env do dev, na rede do dev).
migrar() {
  docker run --rm --network "${PROJETO}_backend" --env-file "$BASE/app.env" \
    --read-only --cap-drop ALL --security-opt no-new-privileges:true \
    "$imagem" node scripts/migrar.mjs "$@"
}
grep -q '@postgres:5432/grafica_dev' "$BASE/app.env" || { echo "app.env não aponta para o grafica_dev; abortando." >&2; exit 1; }
saida=$(migrar)
echo "$saida" | tail -4
if ! echo "$saida" | grep -q "Nenhuma migração pendente"; then
  log "aplicando migrações no grafica_dev"
  migrar --aplicar | tail -6
fi

anterior=$(sed -n 's/^GRAFICA_DEV_IMAGE=//p' "$BASE/.env")
trocar() { sed -i "s|^GRAFICA_DEV_IMAGE=.*|GRAFICA_DEV_IMAGE=$1|" "$BASE/.env"; }
subir() { docker compose -p "$PROJETO" up -d --no-deps app >/dev/null 2>&1; }
saudavel() {
  for _ in $(seq 1 40); do
    estado=$(docker inspect -f '{{.State.Health.Status}}' "${PROJETO}-app-1" 2>/dev/null || true)
    if [ "$estado" = healthy ] && [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5001/)" = 200 ]; then
      return 0
    fi
    [ "$estado" = unhealthy ] && return 1
    sleep 3
  done
  return 1
}

log "trocando $anterior → $imagem"
trocar "$imagem"
subir
if saudavel; then
  log "OK: dev no ar com $imagem (http://127.0.0.1:5001 → 200)"
else
  log "FALHOU: o app não ficou saudável; últimas linhas do log:"
  docker logs --tail 40 "${PROJETO}-app-1" 2>&1 || true
  log "voltando para $anterior"
  trocar "$anterior"
  subir
  saudavel && log "rollback OK" || log "ATENÇÃO: rollback também não ficou saudável"
  exit 1
fi

# Limpeza: últimas $MANTER releases e imagens grafica-dev (nunca a em uso).
ls -1t "$BASE/releases" | tail -n +$((MANTER + 1)) | while read -r velho; do
  rm -rf "${BASE:?}/releases/$velho"
done
docker images grafica-dev --format '{{.Tag}}' | tail -n +$((MANTER + 1)) | while read -r velha; do
  [ "grafica-dev:$velha" = "$imagem" ] || docker rmi "grafica-dev:$velha" >/dev/null 2>&1 || true
done
docker image prune -f --filter "label=grafica.ambiente=dev" >/dev/null 2>&1 || true
