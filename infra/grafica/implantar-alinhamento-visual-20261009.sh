#!/bin/sh
set -eu
base=/home/marcosvinicius/grafica-homolog
cd "$base/infra"
archive="$base/grafica-frontend-20261009-visual.tar.gz"
echo '9d85fe02db7879b84fe6689a897858660608226da27b4692e4d911dacabcb0c4  '"$archive" | sha256sum -c -
test ! -e "$base/release-visual-20261009"
cp -a "$base/release-microsoft-20261009" "$base/release-visual-20261009"
tar -xzf "$archive" -C "$base/release-visual-20261009"
test "$(sha256sum "$base/release-microsoft-20261009/dist/index.js" | cut -d' ' -f1)" = "$(sha256sum "$base/release-visual-20261009/dist/index.js" | cut -d' ' -f1)"
sudo -n docker build -t grafica-homolog:20261009-visual "$base/release-visual-20261009"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="$base/infra/backups/config-visual-$stamp"
sudo -n mkdir -m 700 "$backup"
sudo -n cp compose.app.yaml "$backup/compose.app.yaml"
sed -i 's/20261009-microsoft/20261009-visual/g; s/release-microsoft-20261009/release-visual-20261009/g' compose.app.yaml
sudo -n docker compose -p grafica-homolog -f compose.yaml -f compose.app.yaml up -d --no-deps app
echo "CONFIG_BACKUP=$backup"
sudo -n docker inspect grafica-homolog-app-1 --format '{{.Config.Image}} {{.State.Status}}'
