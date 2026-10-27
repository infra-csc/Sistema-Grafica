#!/bin/sh
# Gera .env e app.env do DEV com segredos NOVOS. Não lê nenhum segredo da produção.
set -eu
umask 077
d=/home/marcosvinicius/grafica-dev
test ! -e "$d/.env" || { echo ".env já existe; abortando."; exit 1; }
r() { openssl rand -hex "$1"; }
PGA=$(r 24)
PGU=$(r 24)
cat > "$d/.env" <<EOF
POSTGRES_ADMIN_PASSWORD=$PGA
GRAFICA_DB_PASSWORD=$PGU
GRAFICA_DEV_IMAGE=grafica-homolog:20261026-integrada
EOF
cat > "$d/app.env" <<EOF
# DEV — gerado em $(date -u +%FT%TZ). Segredos novos; nenhum segredo da produção.
DATABASE_URL=postgresql://grafica_app:$PGU@postgres:5432/grafica_dev
SESSION_SECRET=$(r 48)
# Aleatório próprio: tokens do portal NORTE (assinados com o segredo de prod) são recusados.
SSO_SECRET=$(r 48)
CHECKLIST_INTEGRACAO_TOKEN=$(r 32)
# Microsoft SSO desligado até registrar a redirect URI do dev no Entra ID.
MICROSOFT_TENANT_ID=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_REDIRECT_URI=https://devgrafica.appsnorte.com/api/auth/microsoft/callback
# Sem e-mail: sem chave Resend e todos os interruptores desligados.
ENABLE_EMAIL=false
ENABLE_DAILY_DIGEST=false
RESEND_API_KEY=
BOOK_EMAIL_NOTIFICATIONS_ENABLED=false
BOOK_EMAIL_DRY_RUN=true
BOOK_EMAIL_APP_URL=https://devgrafica.appsnorte.com
REVISAO_DIGEST_ENABLED=false
GESTAO_DIGEST_ENABLED=false
ARQUIVAMENTO_AUTOMATICO_ENABLED=false
ANTHROPIC_API_KEY=
# Storage INOFENSIVO: conta/chaves fictícias, bucket inexistente. Nenhuma chave do R2 de prod.
STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=00000000000000000000000000000000
R2_BUCKET=grafica-dev-arquivos
R2_ACCESS_KEY_ID=dev-sem-credencial
R2_SECRET_ACCESS_KEY=dev-sem-credencial
PRIVATE_OBJECT_DIR=/grafica-dev-arquivos/.private
PUBLIC_OBJECT_SEARCH_PATHS=/grafica-dev-arquivos/public
LEGACY_PRIVATE_OBJECT_DIRS=
EOF
chmod 600 "$d/.env" "$d/app.env"
echo "env gerados"
