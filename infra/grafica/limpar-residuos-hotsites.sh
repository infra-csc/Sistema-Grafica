#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  printf '%s\n' 'Execute com sudo.' >&2
  exit 1
fi
# Não tocar no proxy/logs caso uma configuração nova já tenha sido criada.
test ! -e /srv/hotsites
test ! -e /etc/caddy/Caddyfile
for grafica_temp in /var/tmp/grafica-hotsites-previo.T4l4p2 /var/tmp/grafica-hotsites-recuperacao.c0KYwV; do
  if [ -d "$grafica_temp" ]; then
    test ! -L "$grafica_temp"
    test "$(readlink -f "$grafica_temp")" = "$grafica_temp"
    rm -f -- "$grafica_temp/hotsites.tar.gz"
    rmdir -- "$grafica_temp"
  fi
done
if [ -d /var/log/caddy ]; then
  test ! -L /var/log/caddy
  test "$(readlink -f /var/log/caddy)" = /var/log/caddy
  rm -rf -- /var/log/caddy
fi
rm -f -- /home/marcosvinicius/grafica-migracao/remover-hotsites-20261007.sh
rmdir /home/marcosvinicius/grafica-migracao 2>/dev/null || true
printf '%s\n' 'Resíduos dos hotsites retirados; backups preservados no computador local.'
