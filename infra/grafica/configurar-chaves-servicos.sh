#!/bin/sh
# Executar por SSH interativo. As chaves nunca aparecem no histórico ou na tela.
set -eu
umask 077
grafica_base=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
test -t 0 || { printf '%s\n' 'Execute em um terminal SSH interativo.' >&2; exit 1; }
test -f "$grafica_base/services.env.example"
if [ -e "$grafica_base/services.env" ]; then
  printf '%s\n' 'services.env já existe. Não será sobrescrito.' >&2
  exit 1
fi
grafica_tmp=$(mktemp "$grafica_base/.services-XXXXXX")
trap 'stty echo 2>/dev/null || true; rm -f -- "$grafica_tmp"' EXIT HUP INT TERM
read_secret() {
  printf '%s: ' "$1" >&2
  stty -echo
  IFS= read -r grafica_secret
  stty echo
  printf '\n' >&2
  case "$grafica_secret" in ''|*[!a-zA-Z0-9_-]*) printf '%s\n' 'Chave vazia ou formato inválido.' >&2; exit 1;; esac
}
read_secret 'R2 Access Key ID (token exclusivo do bucket da Gráfica)'
grafica_access=$grafica_secret
read_secret 'R2 Secret Access Key'
grafica_secret_r2=$grafica_secret
while IFS= read -r grafica_line || [ -n "$grafica_line" ]; do
  case "$grafica_line" in
    R2_ACCESS_KEY_ID=*) printf 'R2_ACCESS_KEY_ID=%s\n' "$grafica_access";;
    R2_SECRET_ACCESS_KEY=*) printf 'R2_SECRET_ACCESS_KEY=%s\n' "$grafica_secret_r2";;
    RESEND_API_KEY=*) printf 'RESEND_API_KEY=\n';;
    BOOK_EMAIL_FROM=*) printf 'BOOK_EMAIL_FROM=\n';;
    *) printf '%s\n' "$grafica_line";;
  esac
done < "$grafica_base/services.env.example" > "$grafica_tmp"
chmod 600 "$grafica_tmp"
# Link atômico: se outro processo criou o destino, não sobrescrevemos suas chaves.
ln -- "$grafica_tmp" "$grafica_base/services.env"
rm -f -- "$grafica_tmp"
trap - EXIT HUP INT TERM
unset grafica_access grafica_secret_r2 grafica_secret
printf '%s\n' 'services.env criado com modo 600. E-mails continuam desligados.'
