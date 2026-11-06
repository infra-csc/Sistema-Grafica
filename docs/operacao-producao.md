# Operação da produção

Como a Gráfica roda hoje, onde fica cada peça e o que fazer no dia a dia.
Estado de referência: **novembro de 2026**. A migração do Replit/Neon para a
VPS terminou em **26/10/2026**; o histórico dela está em [docs/README.md](README.md)
→ "Histórico".

> Este documento não traz segredo nenhum. Senhas, chaves e tokens ficam só nos
> arquivos `.env`, `app.env`, `services.env` e `backup-r2.env` da VPS (modo 600),
> nunca no Git nem no chat.

---

## Visão geral

```
navegador ──HTTPS──▶ Cloudflare (proxy, DNS de appsnorte.com)
                        │
                        ▼
                VPS Hetzner (Ubuntu, Docker)
                ┌───────────────────────────────────────────────┐
                │ Caddy (systemd, TLS, 50 MB de upload, /ws)     │
                │   grafica.appsnorte.com    → 127.0.0.1:5000    │
                │   devgrafica.appsnorte.com → 127.0.0.1:5001    │
                │                                                │
                │ compose grafica-homolog  (PRODUÇÃO)            │
                │   app       Node 24, imagem grafica-homolog:*  │
                │   postgres  PostgreSQL 16, só em loopback      │
                │                                                │
                │ compose grafica-dev      (DEV, isolado)        │
                │   app + postgres próprios                      │
                └───────────────────────────────────────────────┘
                        │                         │
                        ▼                         ▼
        Cloudflare R2 (arquivos e backups)   Resend (e-mails)
```

| Peça | Produção | Onde está configurado |
| --- | --- | --- |
| Endereço | https://grafica.appsnorte.com | DNS na Cloudflare (registro A `grafica`, proxy ligado) |
| Proxy reverso | Caddy (systemd) | `/etc/caddy/Caddyfile` · modelo em [infra/grafica/Caddyfile](../infra/grafica/Caddyfile) |
| Pasta na VPS | `~/grafica-homolog/infra` | cópia de [infra/grafica/](../infra/grafica/) |
| Projeto Compose | `grafica-homolog` | [compose.yaml](../infra/grafica/compose.yaml) (Postgres) + [compose.app.yaml](../infra/grafica/compose.app.yaml) (app) |
| App | `127.0.0.1:5000`, 1,5 GB / 2 CPU, sistema de arquivos só leitura | `app.env` + `services.env` |
| Banco | PostgreSQL 16 local, `127.0.0.1:5432`, fuso **UTC** | `.env` (senhas do Postgres) |
| Arquivos | R2, bucket privado `grafica-homolog-arquivos` | `services.env` (`STORAGE_PROVIDER=r2`, `R2_*`) |
| Backups | R2, bucket `grafica-backups/postgres/` | `backup-r2.env` (credencial só de backup) |
| E-mail | Resend, remetente `sistemagrafica@nortemkt.com` | `services.env` (`RESEND_API_KEY`, `BOOK_EMAIL_*`) |
| Login | Microsoft (Entra ID), portal NORTE (SSO) e e-mail+senha | `app.env` (`MICROSOFT_*`, `SSO_SECRET`) |
| Checklist de Arena | lê a Gráfica por token | `CHECKLIST_INTEGRACAO_TOKEN` — ver [integracao-checklist.md](integracao-checklist.md) |

O nome `grafica-homolog` é herança da fase de homologação: **é a produção**.
Renomear exigiria recriar volume e rede, por isso ficou.

Acesso administrativo: SSH na **porta 2222**, só por chave, usuário com sudo.
O IP da VPS está no registro DNS da Cloudflare; não é necessário repeti-lo aqui.

---

## Ambientes e branches

| | Produção | DEV / staging |
| --- | --- | --- |
| URL | https://grafica.appsnorte.com | https://devgrafica.appsnorte.com |
| Branch | `main` | `dev` |
| Pasta na VPS | `~/grafica-homolog/infra` | `~/grafica-dev` |
| Banco | `grafica_producao_20261026b` | `grafica_dev` (cópia da produção) |
| Login | Microsoft + portal + senha | só e-mail e senha local |
| E-mails e agendadores | ligados | todos desligados |
| Arquivos | R2 de produção | R2 fictício (bucket do dev ainda não criado) |
| Deploy | manual (abaixo) | `.github/workflows/deploy-dev.yml` a cada push na `dev` |

Detalhes do DEV em [infra/grafica-dev/README.md](../infra/grafica-dev/README.md).

### Fluxo de alteração

1. Commit na branch **`dev`** (nunca direto na `main`).
2. O CI (`ci.yml`) roda tipos, testes, build e migrações.
3. O deploy do DEV atualiza https://devgrafica.appsnorte.com. Testar lá.
4. Abrir **pull request `dev` → `main`**. Merge só com o OK explícito do responsável.
5. Publicar na produção com a mesma versão (procedimento abaixo).

---

## Publicar uma versão na produção

Não há deploy automático da produção. O roteiro é o mesmo que o do DEV, mas
feito à mão e conferido a cada passo.

1. **Build** a partir da `main`, fora da VPS (a máquina é pequena para o
   `vite build`):

   ```bash
   npm ci && npm run check && npm test && npm run build
   tar -czf release.tar.gz package.json package-lock.json dist migrations \
       scripts/migrar.mjs shared global-quota-rules.json
   ```

2. **Enviar** para uma pasta nova na VPS, por exemplo
   `~/grafica-homolog/release-AAAAMMDD/`, e extrair.

3. **Backup antes da troca**:

   ```bash
   cd ~/grafica-homolog/infra
   sudo sh backup-completo.sh          # dump + envio ao R2 com sha256
   ```

   Guarde também a configuração atual (`.env`, `app.env`, `services.env`) numa
   pasta `backups/config-antes-<motivo>-<data>/` com modo 700.

4. **Imagem nova**, partindo da imagem que está no ar (o `Dockerfile.release-*`
   só copia `dist/`, `migrations/`, `scripts/migrar.mjs` e `shared/`):

   ```bash
   docker build -t grafica-homolog:AAAAMMDD-<nome> \
     -f infra/grafica/Dockerfile.release-20261026 ../release-AAAAMMDD
   ```

   Ajuste o `FROM` para a imagem atual (`docker compose ps` mostra qual é).
   Se o `package-lock.json` mudou, monte a imagem do zero com
   [infra/grafica/Dockerfile](../infra/grafica/Dockerfile).

5. **Migrações** — sempre a simulação primeiro, contra o banco de produção:

   ```bash
   docker run --rm --network grafica-homolog_backend --env-file app.env \
     grafica-homolog:AAAAMMDD-<nome> node scripts/migrar.mjs            # lista pendências
   docker run --rm --network grafica-homolog_backend --env-file app.env \
     grafica-homolog:AAAAMMDD-<nome> node scripts/migrar.mjs --aplicar  # aplica, numa transação
   ```

   Nunca `db:push` em produção. Nunca migração automática no boot.

6. **Trocar a imagem**: atualizar `GRAFICA_RELEASE=AAAAMMDD-<nome>` no `.env` e

   ```bash
   docker compose -p grafica-homolog -f compose.yaml -f compose.app.yaml up -d app
   docker compose -p grafica-homolog ps                     # app "healthy"
   curl -sI http://127.0.0.1:5000/ | head -1                # 200
   ```

7. **Conferir** no navegador: login, Painel, um upload/miniatura e o tempo
   real (WebSocket `/ws`).

### Voltar atrás (rollback)

A imagem anterior continua na máquina. Basta devolver o valor antigo de
`GRAFICA_RELEASE` no `.env` e repetir o `up -d app`. Se a versão nova aplicou
migração, avalie antes: as migrações são aditivas na prática, mas uma coluna
renomeada ou removida exige restaurar o backup do passo 3.

---

## Backups

* **Quando:** todo dia às 03:00 (Brasília), pelo `grafica-backup.timer`
  (systemd), que chama [backup-completo.sh](../infra/grafica/backup-completo.sh).
* **O quê:** `pg_dump` em formato custom do banco do app, com o catálogo
  conferido, gravado em `infra/backups/` na VPS e enviado ao R2
  (`grafica-backups/postgres/`) com sha256.
* **Credencial:** `backup-r2.env` só tem acesso ao bucket de backups; o
  container do envio não recebe os segredos do app.
* **Manual:** `sudo sh backup-completo.sh` (há trava contra execução dupla).
* **Conferir:** `systemctl list-timers grafica-backup.timer` e
  `cat infra/backups/ultima-execucao.log`.

Pendências conhecidas: retenção automática (hoje nada é apagado), alerta
quando o backup falha e cópia externa da configuração.

### Restaurar

Os scripts `restaurar-producao-*.sh` e `verificar-restauracao*.mjs` em
[infra/grafica/](../infra/grafica/) são o roteiro usado no corte. Em resumo:
criar um banco novo, `pg_restore --single-transaction --no-owner --no-acl`
com a role `grafica_app`, **`ALTER DATABASE <banco> SET timezone='UTC'`**,
conferir contagens e drift (`npm run db:drift`) e só então apontar o
`DATABASE_URL` do `app.env` para ele. O teste de restauração de 09/10 está em
[backup-restauracao-20261009.md](backup-restauracao-20261009.md).

---

## Cuidados que já custaram caro

* **Fuso horário do banco = UTC.** As colunas são `timestamp` sem fuso, com
  `default now()`, e o Drizzle lê como UTC. Em 26/10 o Postgres estava em
  `America/Sao_Paulo` e os registros ficaram 3 h atrasados (Histórico e
  notificações "paravam"). Hoje o `compose.yaml` força `TZ=UTC` e
  `-c timezone=UTC`. **Todo banco novo ou restaurado** precisa de
  `ALTER DATABASE ... SET timezone='UTC'`.
* **`docker compose down -v` apaga o volume do banco.** Use `down` sem `-v`,
  ou melhor, `up -d app` para trocar só o app.
* **Uma só origem gravando.** Replit e Neon ficaram pausados depois do corte;
  em 26/10 o Replit foi reativado por engano por 10 minutos e o corte teve de
  ser refeito. Não religar.
* **Portas só em loopback.** App e Postgres publicam em `127.0.0.1`; quem fala
  com a internet é o Caddy. pgAdmin entra por túnel SSH
  ([acesso-pgadmin.md](acesso-pgadmin.md)).
* **Memória.** A VPS tem ~3,7 GB e 2 GB de swap, dividida entre produção e DEV.
  Build de front-end não roda nela.

---

## Variáveis de produção (sem valores)

| Arquivo na VPS | Variáveis |
| --- | --- |
| `.env` | `POSTGRES_ADMIN_PASSWORD`, `GRAFICA_DB_PASSWORD`, `GRAFICA_RELEASE` |
| `app.env` | `DATABASE_URL`, `SESSION_SECRET`, `SSO_SECRET`, `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI`, `CHECKLIST_INTEGRACAO_TOKEN` (pode estar no `services.env`; confira com `grep -l` na VPS) |
| `services.env` | `STORAGE_PROVIDER=r2`, `R2_*`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS`, `LEGACY_PRIVATE_OBJECT_DIRS`, `RESEND_API_KEY`, `BOOK_EMAIL_*`, interruptores dos digests |
| `backup-r2.env` | `BACKUP_R2_*` |

O significado de cada uma está no [.env.example](../.env.example) da raiz e nos
modelos `*.example` de [infra/grafica/](../infra/grafica/). Trocar o
`SESSION_SECRET` desloga todo mundo (é o botão de pânico). O `SSO_SECRET` é o
mesmo segredo configurado no Portal NORTE ONE e deve ser diferente do
`SESSION_SECRET`.

---

## Pendências abertas

* Ligar o deploy automático do DEV: chave pública do CI no `authorized_keys`
  (com `command=` forçado) e secret `DEV_SSH_PRIVATE_KEY` no GitHub.
* Bucket R2 próprio do DEV (`grafica-dev-arquivos`) com token restrito.
* Retenção e alerta dos backups; cópia externa da configuração.
* Limpeza dos bancos antigos de importação na VPS.
* Desligar de vez Replit e Neon depois do período de segurança.
* Arquivamento automático segue desligado (`ARQUIVAMENTO_AUTOMATICO_ENABLED=false`).
