# Ambiente DEV/staging da Gráfica

Cópia isolada da produção na mesma VPS, para testar alterações antes de subir
em `https://grafica.appsnorte.com`.

| | Produção | DEV |
| --- | --- | --- |
| URL | https://grafica.appsnorte.com | https://devgrafica.appsnorte.com |
| Pasta na VPS | `~/grafica-homolog/infra` | `~/grafica-dev` |
| Projeto Compose | `grafica-homolog` | `grafica-dev` |
| App | `127.0.0.1:5000` (1,5 GB) | `127.0.0.1:5001` (768 MB) |
| Postgres | `127.0.0.1:5432` (1 GB) | `127.0.0.1:5433` (384 MB, `grafica_dev`) |
| Rede / volume | `grafica-homolog_backend` / `grafica-homolog_postgres_data` | `grafica-dev_backend` / `grafica-dev_postgres_data` |

## Isolamento

- Rede, volume, banco e segredos próprios. Da rede do dev o Postgres de
  produção não é alcançável.
- `preparar-env.sh` gera `.env` e `app.env` com segredos **novos**; não lê
  nada da produção. Os dois ficam com modo 600 e nunca entram no Git.
- Sem e-mail: `RESEND_API_KEY` vazia e todos os interruptores desligados
  (digests da Revisão e da Gestão, aviso de book, arquivamento automático).
- `SSO_SECRET` aleatório: tokens do portal NORTE de produção são recusados.
- Storage: enquanto não houver bucket próprio do dev, o R2 aponta para conta,
  chaves e bucket fictícios. Nunca usar as chaves do bucket de produção
  (`grafica-homolog-arquivos`) nem do `grafica-backups` aqui.

## Montagem (já feita em 26/10/2026)

```bash
mkdir -m 700 ~/grafica-dev && cd ~/grafica-dev
# copiar compose.yaml, preparar-env.sh e init/ desta pasta
./preparar-env.sh
docker compose -p grafica-dev up -d postgres
# cópia do banco de produção (somente leitura em prod)
docker exec grafica-homolog-postgres-1 pg_dump -U postgres -Fc <banco_de_prod> > dumps/prod.dump
docker exec -i grafica-dev-postgres-1 pg_restore --list < dumps/prod.dump \
  | sed '/ SCHEMA - public /d; / COMMENT - SCHEMA public /d' > dumps/restore.list
docker cp dumps/restore.list grafica-dev-postgres-1:/tmp/restore.list
docker exec -i grafica-dev-postgres-1 pg_restore -U postgres --role=grafica_app \
  --dbname=grafica_dev --single-transaction --exit-on-error --no-owner --no-acl \
  --use-list=/tmp/restore.list < dumps/prod.dump
docker exec grafica-dev-postgres-1 psql -U postgres -d grafica_dev -c 'truncate session, sso_tokens_de_troca'
docker compose -p grafica-dev up -d app
```

O bloco do Caddy está em `Caddyfile.dev` (acrescentado ao `/etc/caddy/Caddyfile`;
validar com `caddy validate` e aplicar com `systemctl reload caddy`).

## Deploy automático (GitHub Actions)

Todo push na branch `dev` dispara `.github/workflows/deploy-dev.yml`: `npm ci`,
`npm run check`, `npm run build`, empacota o release e o envia por SSH
(porta 2222) para a VPS. Lá, `deploy-ci.sh` (cópia em `~/grafica-dev/`):

1. extrai o release em `~/grafica-dev/releases/<sha>`;
2. monta `grafica-dev:<sha>` com o `Dockerfile.ci` (dependências do lock do commit);
3. roda as migrações só no `grafica_dev` (simulação; aplica se houver pendência);
4. troca `GRAFICA_DEV_IMAGE` no `.env` e sobe o app;
5. espera o health e `127.0.0.1:5001 → 200`; se falhar, volta para a imagem anterior;
6. mantém as 5 últimas releases e imagens.

A chave do CI (secret `DEV_SSH_PRIVATE_KEY`) entra no `~/.ssh/authorized_keys`
com comando forçado, e só consegue rodar esse deploy:

```
restrict,command="/home/marcosvinicius/grafica-dev/deploy-ci.sh" ssh-ed25519 AAAA… grafica-dev-ci
```

Rodar à mão na VPS: `./deploy-ci.sh deploy <sha> < release.tar.gz`.
Também dá para disparar pela aba Actions ("Run workflow").

## Atualizar o DEV com uma alteração de código (manual)

Nada disso toca a produção.

1. No PC, na branch `dev`: `npm ci && npm run check && npm test && npm run build`.
2. Enviar o build para a VPS, numa pasta nova:
   `~/grafica-dev/release-AAAAMMDD/` com `dist/`, `migrations/`, `scripts/migrar.mjs` e `shared/`.
3. Gerar a imagem só do dev (o `Dockerfile.dev` desta pasta parte da imagem em produção):
   `docker build -t grafica-dev:AAAAMMDD -f Dockerfile.dev --build-arg BASE=grafica-homolog:20261026-integrada release-AAAAMMDD`
4. Se houver migração nova, aplicar **somente** no `grafica_dev`
   (`npm run db:migrate` primeiro sem `--aplicar`).
5. Trocar `GRAFICA_DEV_IMAGE=grafica-dev:AAAAMMDD` no `~/grafica-dev/.env` e rodar
   `docker compose -p grafica-dev up -d app`.
6. Testar em https://devgrafica.appsnorte.com. Aprovado, a mesma imagem segue o
   procedimento de troca da produção (`infra/grafica/README.md`).

Para recomeçar o banco do dev com uma cópia nova da produção, repetir o dump e
restaurar num banco limpo (`dropdb`/`createdb -O grafica_app grafica_dev` no
container do dev).
