#!/bin/sh
set -eu

# Instala somente Docker Engine/Compose. Não instala proxy, não reinicia Caddy
# e não altera DNS, bancos existentes ou dados da aplicação. O próprio Docker
# cria regras de rede/firewall ao iniciar; não publicamos portas do banco.
if [ "$(id -u)" -ne 0 ]; then
  printf '%s\n' 'Execute com sudo: sudo sh instalar-docker-ubuntu.sh' >&2
  exit 1
fi

. /etc/os-release
if [ "$ID" != ubuntu ]; then
  printf '%s\n' 'Este instalador foi preparado somente para Ubuntu.' >&2
  exit 1
fi
case "$VERSION_ID" in
  22.04|24.04|26.04) ;;
  *) printf '%s\n' 'Versão Ubuntu não homologada neste instalador.' >&2; exit 1 ;;
esac

if command -v docker >/dev/null 2>&1; then
  printf '%s\n' 'Docker já existe. Conferir versão e Compose antes de continuar.'
  docker --version
  docker compose version
  exit 0
fi

# Não remover instalações existentes automaticamente.
for package in docker.io docker-compose docker-compose-v2 podman-docker containerd runc; do
  if dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q 'install ok installed'; then
    printf 'Pacote existente exige revisão manual: %s\n' "$package" >&2
    exit 1
  fi
done

apt-get update
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
grafica_architecture=$(dpkg --print-architecture)
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $VERSION_CODENAME
Components: stable
Architectures: $grafica_architecture
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker --version
docker compose version

printf '%s\n' 'Docker instalado. A Gráfica e o banco ainda não foram iniciados.'
