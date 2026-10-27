#!/bin/sh
set -eu
umask 077

# Remoção autorizada e executada pelo usuário/agente em 07/10/2026.
# A revisão do hash impede usar este script contra uma configuração alterada.
if [ "${1:-}" = --verificar ]; then
  sha256sum /etc/caddy/Caddyfile
  stat -c '%A %U:%G %n' /srv/hotsites /etc/caddy/Caddyfile
  printf '%s\n' 'Revisar a configuração antes de passar seu hash à remoção.'
  exit 0
fi
if [ "${1:-}" != --aplicar ] || [ "$#" -ne 2 ]; then
  printf '%s\n' 'Uso: sh remover-hotsites.sh --verificar' \
    'Depois da revisão: sudo sh remover-hotsites.sh --aplicar HASH_SHA256_DO_CADDYFILE' >&2
  exit 1
fi
if [ "$(id -u)" -ne 0 ]; then
  printf '%s\n' 'A remoção exige root/sudo para arquivos protegidos e serviço Caddy.' >&2
  exit 1
fi
case "$2" in *[!0-9a-f]*|'') printf '%s\n' 'Hash inválido.' >&2; exit 1 ;; esac
test "${#2}" -eq 64
test -f /etc/caddy/Caddyfile
test ! -L /etc/caddy/Caddyfile
grafica_hash_atual=$(sha256sum /etc/caddy/Caddyfile | cut -d ' ' -f 1)
if [ "$grafica_hash_atual" != "$2" ]; then
  printf '%s\n' 'Caddyfile mudou desde a revisão; remoção interrompida.' >&2
  exit 1
fi
test -d /srv/hotsites
test ! -L /srv/hotsites
if [ "$(readlink -f /srv/hotsites)" != /srv/hotsites ]; then
  printf '%s\n' 'Caminho dos hotsites fora do alvo autorizado.' >&2
  exit 1
fi
grep -q '/srv/hotsites/' /etc/caddy/Caddyfile
# Não parar um proxy que passou a servir outra aplicação.
if grep -Eq '^[[:space:]]*(reverse_proxy|import|php_fastcgi)[[:space:]]' /etc/caddy/Caddyfile; then
  printf '%s\n' 'Configuração adicional encontrada; revisar antes de remover.' >&2
  exit 1
fi
awk '$1 == "root" && $3 !~ /^\/srv\/hotsites\// { bad = 1 } END { exit bad }' /etc/caddy/Caddyfile

# Backup temporário fora da árvore apagada. Será baixado e removido da VPS
# depois da conferência local. Preserva links sem seguir destinos externos.
grafica_recuperacao=$(mktemp -d /var/tmp/grafica-hotsites-recuperacao.XXXXXX)
grafica_archive="$grafica_recuperacao/hotsites.tar.gz"
set -- srv/hotsites etc/caddy/Caddyfile
if [ -e /etc/caddy/Caddyfile.before-home ]; then set -- "$@" etc/caddy/Caddyfile.before-home; fi
if [ -d /var/log/caddy ]; then set -- "$@" var/log/caddy; fi
tar -C / -czf "$grafica_archive" "$@"
tar -tzf "$grafica_archive" >/dev/null

systemctl stop caddy
systemctl disable caddy

# Alvos literais. A árvore principal foi conferida por caminho canônico acima.
rm -rf -- /srv/hotsites
rm -f -- /etc/caddy/Caddyfile /etc/caddy/Caddyfile.before-home
if [ -d /var/log/caddy ] && [ "$(readlink -f /var/log/caddy)" = /var/log/caddy ]; then
  # Inclui direct-test.log, encontrado no backup completo dos hotsites.
  rm -rf -- /var/log/caddy
fi

# Permite ao acesso SSH já existente baixar o backup; a pasta permanece privada.
chown marcosvinicius "$grafica_recuperacao" "$grafica_archive"
test ! -e /srv/hotsites
test ! -e /etc/caddy/Caddyfile
printf '%s\n' 'Arquivos e rotas dos hotsites removidos; Caddy parado e desabilitado.'
printf '%s\n' 'Caddy permanece instalado para configurar o proxy da Gráfica.'
printf 'Backup temporário para baixar e retirar da VPS: %s\n' "$grafica_archive"
sha256sum "$grafica_archive"
ss -lnt '( sport = :80 or sport = :8080 )'
