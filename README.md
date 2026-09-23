# NORTE — Sistema Gráfica

Gestão da produção gráfica da NORTE Marketing Esportivo. Substitui a planilha
que controlava, de ponta a ponta, o caminho de cada peça impressa: da
solicitação até a entrega no caminhão.

**Stack:** React + Vite + TypeScript no cliente · Express + Drizzle no servidor ·
PostgreSQL (Neon) · WebSocket para tempo real · publicado no Replit (autoscale).

* [Arquitetura](docs/arquitetura.md) — camadas, `shared/`, tempo real, caches,
  agendadores, uploads
* [Estados da peça](docs/estados-da-peca.md) — quem move a peça, de onde, para onde
* [Testes E2E](e2e/README.md) — como rodar os cinco fluxos

---

## Os cinco perfis

| Perfil | O que faz |
| --- | --- |
| **Solicitação** | Cria o evento e as peças; envia a lista; **libera na Revisão Final**; confere e entrega |
| **Arte** | Sobe o thumb de aprovação e o arquivo final; devolve a peça ao solicitante |
| **Atendimento** | Aprova (ou reprova) pelo patrocinador; revoga aprovação; pede peça |
| **Gráfica** | Inicia a impressão, informa o que saiu, confere, embala e entrega o volume |
| **Admin** | Tudo, mais usuários, cancelar/descancelar, transferir peça e reparos |

O admin pode **ver como** outro perfil (sem trocar o cadastro): a sessão empresta
o papel e toda ação entra na trilha como "Ana (como Gráfica)".

O perfil **Kit** é um recorte da Solicitação: enxerga e envia só as peças das
remessas do próprio Kit.

---

## O caminho da peça, em 10 linhas

1. A **Solicitação** cria o evento e digita as peças (lote ou importação de
   planilha). Elas nascem em **Rascunho**.
2. Clica em **Enviar**: as peças vão para **Aguardando Vinculação**.
3. Na **Vinculação**, a Arte amarra os patrocinadores (ou marca "sem
   aprovação") e manda para a fila dela: **Aguardando Envio**.
4. A **Arte** sobe o **thumb** — a imagem que o patrocinador vai olhar — e
   envia. Com patrocinador, a peça vai para **Aguardando Aprovação**; sem ele
   (ou com "sem aprovação"), pula direto para a finalização.
5. O **Atendimento** aprova por patrocinador. Quando todos aprovam, a peça vai
   para **Aguardando Finalização**.
6. A **Arte** sobe o **arquivo final** — o que a impressora recebe. A peça cai
   em **Aguardando Revisão Final**.
7. A **Solicitação** revisa: **libera** (→ Pronto para Produção) ou **devolve**
   para a Arte com um motivo de, no mínimo, 10 caracteres.
8. A **Gráfica** escolhe a máquina e inicia: **Em Impressão**. Informa quantas
   saíram (o número é o **total**, não o acréscimo) até fechar: **Impresso**.
9. **Confere** com foto (**Conferido**) e **embala** num volume (**Embalado**).
10. **Entrega o volume**, com o nome de quem recebeu: **Entregue**. Fim.

Fora do trilho: a Arte **devolve ao solicitante** de qualquer estado (menos do
rascunho), a Gráfica **devolve para a Revisão** antes de imprimir, e a peça pode
ser **cancelada** (e descancelada, só pelo admin). Detalhes e exceções em
[docs/estados-da-peca.md](docs/estados-da-peca.md).

---

## Rodando local

### O jeito rápido: `npm run dev:local` (sem banco, sem Replit)

Sobe o app inteiro na sua máquina com um **banco de teste** — nada a
configurar, nada que encoste em produção:

```bash
npm ci
npm run ferramentas:instalar   # uma vez: PGlite + Playwright, FORA do repositório
npm run dev:local              # http://localhost:5000
```

O que ele faz (`scripts/dev-local.mjs`):

1. sobe um **Postgres em memória** (PGlite — o Postgres compilado para
   WebAssembly) servido na máquina pelo protocolo normal do Postgres (psql e
   DBeaver conectam) e por WebSocket (é por onde o driver do Neon do servidor
   fala);
2. aplica as **migrações** de `migrations/` — as mesmas de produção;
3. cria **um usuário por perfil** — `admin@local.test`, `solicitacao@local.test`,
   `arte@local.test`, `grafica@local.test`, `atendimento@local.test`, todos com a
   senha `senha-local-123` (só existe nesse banco de mentira). Na tela de login,
   "Entrar com e-mail e senha";
4. semeia **dados de exemplo pela própria API** (`scripts/local/semear.mjs`): 3
   eventos, 4 patrocinadores e ~30 peças em todas as etapas — rascunho,
   vinculação, Arte, aprovação, finalização, revisão, fila da Gráfica (uma
   **travada**, uma reservada a uma impressora), em impressão (uma **dividida**
   entre duas impressoras), impressas, conferidas, **embaladas num tubo fechado**,
   **entregues**, um **molde** e uma cancelada;
5. sobe o servidor (Vite + Express) com e-mail, avisos agendados e o canal entre
   cópias **desligados**.

`Ctrl+C` derruba servidor, banco e storage. Opções: `--persistir` (guarda os
dados entre execuções), `--limpar`, `--sem-exemplos`, `--porta=5000`.

**Uploads funcionam**: um object storage de mentira (`scripts/local/gcs-local.mjs`)
faz o papel do bucket do Replit. O que **não** existe no local: o login pelo
portal (SSO), e-mail de verdade e a URL assinada do caminho legado de upload
(`POST /api/objects/upload` — as telas usam o `/upload-direct`, que funciona).

Como o banco local se liga ao servidor sem mudar o código de produção: o
servidor usa o driver serverless do Neon (`server/db.ts`), que fala Postgres
dentro de um WebSocket. O `dev:local` carrega antes do servidor um preload só
dele (`scripts/local/neon-local.mjs`, via `--import`) que aponta esse driver para
o banco local. `server/db.ts` não mudou.

> **Onde ficam as ferramentas.** PGlite e Playwright moram em `../_ferramentas`
> (ou na pasta de `NORTE_FERRAMENTAS`), fora do projeto: o app publicado não
> precisa delas, o Playwright baixa ~300 MB de navegador e o PGlite dentro do
> projeto duplicaria o `drizzle-orm`. Ver `scripts/local/ferramentas.mjs`.

> **Limites do banco local** (é banco de teste): o PGlite é uma sessão só, e
> `scripts/local/banco-local.mjs` enfileira as conexões do app por lote e por
> transação. Travas de linha (`FOR UPDATE`) e advisory locks não disputam nada,
> e LISTEN/NOTIFY não chega a outra conexão (o app sobe com
> `TEMPO_REAL_CANAL=off`). Corrida entre duas pessoas não se testa aqui.

### Contra um Postgres de verdade

```bash
cp .env.example .env
```

Preencha as três obrigatórias (as outras têm padrão ou desligam o recurso):

| Variável | Sem ela |
| --- | --- |
| `DATABASE_URL` | O servidor **lança no import** de `server/db.ts` — não sobe pela metade |
| `SESSION_SECRET` | Fail-fast em `server/session.ts`. Gere com `openssl rand -base64 48` |
| `PRIVATE_OBJECT_DIR` | Upload não grava (Object Storage do Replit) |

E uma que **precisa** ser definida em produção, embora o app suba sem ela:

| Variável | Sem ela |
| --- | --- |
| `SSO_SECRET` | O login pelo portal NORTE passa a validar o JWT com o `SESSION_SECRET` — funciona, mas o portal fica com o segredo que assina as sessões deste app (quem tem um forja o outro). O boot avisa no log (`[SSO] ATENÇÃO`). Use o **mesmo** valor configurado no portal e **diferente** do `SESSION_SECRET`. |

O `.env.example` explica **cada** variável, uma por linha.

Banco vazio recebe a estrutura pelas **migrações**:

```bash
npm run db:migrate -- --aplicar   # cria tudo, na ordem de migrations/
npm run db:drift                  # confere que não sobrou nem faltou nada
npm run dev                       # http://localhost:5000
```

> Não use `npm run db:push` num banco que importa: ver "Banco e migrações".

### O primeiro admin

Não há cadastro aberto: usuário é criado **por um admin**, pela tela Usuários. O
primeiro sai do `SEED_PASSWORD`, e ele só age **com a tabela `users` vazia**:

```bash
SEED_PASSWORD="umaSenhaForte123" npm run dev
```

Isso cria as contas iniciais (entre como `admin@norte.com`), todas com "trocar a
senha no primeiro acesso". **Apague a variável depois** — com o banco já
povoado ela não faz nada, e guardá-la é só um segredo a mais no ambiente.
(O `dev:local` não usa isso: cria os usuários de teste dele.)

Nenhuma outra rotina roda no boot. As correções de dados que rodavam a cada
deploy viraram scripts em `scripts/`, rodados uma vez por quem opera.

---

## Publicando no Replit

```
Pull  →  Stop  →  Run  →  (se veio migração) npm run db:migrate -- --aplicar  →  Republish
```

1. **Pull** — traz a `main` para o Repl.
2. **Stop** e **Run** — reinicia o processo. Sem isso, o Repl segue servindo o
   build anterior.
3. **Migração** — se o Pull trouxe arquivo novo em `migrations/`, rode na Shell
   (primeiro sem `--aplicar`, que só mostra o que faria). Ver abaixo.
4. **Republish** — publica o deployment (autoscale). Só o Republish troca o que
   o usuário final enxerga.

---

## Banco e migrações

**Dev e produção são bancos DIFERENTES.** Cada um recebe as migrações à parte, e
antes de culpar o código por um "column does not exist", confira o drift.

### O fluxo, a cada mudança de schema

```
muda shared/schema.ts → npm run db:generate → revisa o SQL → commit → no Replit: npm run db:migrate -- --aplicar
```

1. **Mudou `shared/schema.ts`** (tabela, coluna, índice).
2. **`npm run db:generate`** — o `drizzle-kit` compara o schema com o último
   retrato (`migrations/meta/`) e escreve `migrations/NNNN_<nome>.sql`. **Não
   abre conexão com banco nenhum.** Dê nome: `npm run db:generate -- --name troca-do-tubo`.
3. **Revise o SQL.** É o que vai rodar em produção. Coluna `NOT NULL` nova em
   tabela com dados precisa de `DEFAULT`; renomear aparece como apagar+criar
   (o drizzle pergunta — responda "rename" quando for). Objeto que o schema não
   sabe declarar (extensão, índice GIN) vai numa migração escrita à mão:
   `npm run db:generate -- --custom --name <nome>` cria o arquivo vazio.
4. **Commit** do `.sql` **e** de `migrations/meta/` juntos.
5. **No Replit** (dev e, depois, produção), na Shell:

   ```bash
   npm run db:migrate                 # SIMULAÇÃO: lista o que está pendente
   npm run db:migrate -- --aplicar    # aplica, tudo numa transação
   npm run db:drift                   # confere
   ```

O executor (`scripts/migrar.mjs`) usa a mesma tabela de controle do drizzle
(`drizzle.__drizzle_migrations`), avisa se um `.sql` já aplicado foi editado
depois (a edição **não** chega ao banco — mudança vai numa migração nova) e
recusa rodar a migração de base num banco que já tem tabelas.

O CI (`npm run db:migrate:ci`) sobe um Postgres vazio em memória, aplica todas
as migrações do zero e falha se o resultado divergir do schema — inclusive se
alguém mudou o schema e esqueceu o `db:generate`.

> **Nomes de restrição.** O `db:generate` compara o schema com o retrato em
> `migrations/meta/`, não com o banco. Algumas tabelas de produção nasceram da
> migração aditiva, com nomes de chave estrangeira do Postgres
> (`tubos_event_id_fkey`) e não do drizzle (`tubos_event_id_events_id_fk`). Se
> uma migração futura apagar ou trocar uma restrição **pelo nome**, confira o
> nome real em produção antes de aplicar.

### Adoção — UMA VEZ em cada banco (produção e dev)

Produção e dev nasceram de `db:push` + migração aditiva: já têm o schema
inteiro, mas nenhuma migração registrada. A adoção confere com o
`checar-drift` que **não falta nada** e só então **marca** a migração de base
como aplicada, **sem executá-la**; depois aplica as seguintes (hoje, a
`0001_busca-trigram-fora-do-schema`, idempotente: extensão `pg_trgm` e os 3
índices GIN do Histórico, que produção já tem). Ela **não altera nenhum dado** —
só cria o schema `drizzle` com a tabela de controle.

Na Shell do Replit **de dev** e, depois, na **de produção** (cada uma com o seu
`DATABASE_URL`):

```bash
npm run db:drift                          # 1. nada FALTANDO? (sobrando é legado — fica)
npm run db:migrate -- --adotar            # 2. simulação da adoção: confere e mostra o plano
npm run db:migrate -- --adotar --aplicar  # 3. adota
npm run db:migrate                        # 4. "Nenhuma migração pendente"
```

Se o passo 2 acusar falta, rode antes a migração aditiva
(`node scripts/migracao-aditiva-producao.mjs`, idempotente, só cria) e repita.
Depois da adoção, a migração aditiva e o `db:push` deixam de ser o caminho: o
schema muda **só** por migração.

### O `db:push` virou ferramenta de banco descartável

`npm run db:push` continua existindo, mas **só para banco que se pode jogar
fora** (um Postgres de rascunho seu). Ele alinha o banco ao schema nos **dois
sentidos**: o que existe lá e o schema não declara, ele derruba — os índices de
busca do Histórico, por exemplo — e em produção já apagou tabela e índices. O
`db:drift` lista o que sobra **separando** o que foi criado por script.

O hook de merge do Replit (`scripts/post-merge.sh`) **não mexe no banco**: a
migração é um passo que alguém roda e confere.

---

## Os scripts

Todos leem `DATABASE_URL` do ambiente. Rode com `npx tsx scripts/<arquivo>`.

### Só leem (seguros a qualquer hora)

| Script | O que responde |
| --- | --- |
| `checar-drift.mjs` | O que falta ou sobra no banco em relação ao schema (`npm run db:drift`) |
| `migrar.mjs` sem `--aplicar` | O que está pendente em `migrations/` (`npm run db:migrate`) |
| `checar-senhas-seed.mjs` | Quais contas ainda usam a senha do cadastro inicial (passe `SENHA_ANTIGA`) |
| `contar-vinculos-duplicados.mjs` | Duplicatas em `item_sponsors` e afins, antes de criar índice único |
| `conferir-medida-vs-dimensoes.ts` | Peças cujos campos derivados de medida envelheceram |
| `preview-email-book.ts` | Gera o e-mail do book com dados de exemplo, sem enviar |
| `preview-email-gestao.ts` | O mesmo, para o aviso da gestão |

### Estrutura do banco

| Script | O que faz |
| --- | --- |
| `migrar.mjs` | **As migrações** de `migrations/` (`npm run db:migrate`; simulação sem `--aplicar`; `--adotar` uma vez por banco) |
| `ci-migracoes.mjs` | O CI das migrações, num Postgres em memória (`npm run db:migrate:ci`) |
| `migracao-aditiva-producao.mjs` | O caminho ANTIGO (até a adoção): cria tabelas, colunas e índices que faltam |
| `migracao-sso-tokens.mjs` | Tabela dos tokens de troca do SSO (`IF NOT EXISTS`) |
| `indices-performance.mjs` | Índices de performance (`CREATE INDEX CONCURRENTLY`, um por vez) |
| `criar-indices-de-busca.ts` | Índices trigram da busca do Histórico |

### Preenchem dado que faltava (rodar uma vez)

| Script | O que faz |
| --- | --- |
| `backfill-status-changed-at.ts` | Preenche `items.status_changed_at` pelos timestamps existentes |
| `backfill-status-da-trilha.ts` | Segunda passada do anterior, usando a trilha de auditoria |
| `backfill-books.ts` | Guarda o histórico de books antes que o `book_url` atual o apague |
| `backfill-inventario.ts` | Cria os ativos de inventário que o boot criava a cada partida |
| `inferir-executivos.ts` | Deduz o executivo de conta de cada patrocinador |

### Consertam dado torto (leia o cabeçalho antes)

| Script | O que conserta |
| --- | --- |
| `unificar-status-legado.ts` | Duas grafias do mesmo status circulando no banco |
| `reparar-aprovacao-incoerente.ts` | Peça avançada com patrocinador "Aguardando" (caso #4176) |
| `reparar-vinculos-de-evento.ts` | Patrocinador que está na peça e não está no evento |
| `motivos-sem-s.ts` | Motivos que perderam a letra "s" (o `s+` sem a barra invertida) |
| `corrigir-senha-placeholder.mjs` | Contas criadas sem senha que ganharam uma senha fixa conhecida |

`post-merge.sh` roda sozinho a cada merge no Replit e **não toca no banco**.

### Ambiente local (`dev-local.mjs`, `e2e.mjs`, `scripts/local/`)

Nunca leem o `DATABASE_URL` do ambiente: o banco é sempre o PGlite que eles
mesmos sobem. `banco-local.mjs` (Postgres em memória nas portas TCP e
WebSocket), `gcs-local.mjs` (object storage de mentira), `neon-local.mjs`
(preload que aponta o driver do Neon para o banco local), `app-local.mjs`
(monta tudo e sobe o servidor), `semear.mjs` (dados de exemplo pela API),
`instalar-ferramentas.mjs` (`npm run ferramentas:instalar`).

---

## Testes

```bash
npm run check          # tipos do app
npm run check:tests    # tipos dos ~255 arquivos de teste (ficam fora do tsconfig do app)
npm test               # a suíte inteira (Vitest)
npm run test:watch
npm run test:coverage
```

Dois projetos do Vitest, e eles rodam nesta ordem:

* **`servidor`** — rotas com banco de mentira e regras puras;
* **`telas`** — quem pede `// @vitest-environment jsdom` no docblock. Monta React
  no jsdom, é pesado, e por isso corre **depois** e com 4 workers: na suíte
  única, disputava CPU com os de servidor e estourava o tempo.

Um arquivo só:

```bash
node node_modules/vitest/vitest.mjs run server/__tests__/<arquivo>.test.ts
```

### Ponta a ponta (Playwright)

Cinco fluxos — login, Solicitação, Arte, Revisão Final e Gráfica — em três
larguras (390, 820, 1280), contra o **app inteiro rodando na sua máquina** com
banco de teste:

```bash
npm run ferramentas:instalar   # uma vez: Playwright + Chromium, fora do repositório
npm run e2e                    # sobe banco + app, roda as 3 larguras, derruba tudo
npm run e2e -- --project=celular-390
npm run e2e -- e2e/05-grafica-imprime-confere-embala-entrega.spec.ts
```

**Nunca rodam contra produção**: com `E2E_BASE_URL` definida, a suíte vai
contra aquele endereço (o Replit de dev, por exemplo), e `e2e/apoio.ts` recusa
qualquer hospedeiro de produção. Detalhes, o que a suíte **não** cobre e os
defeitos conhecidos: [e2e/README.md](e2e/README.md).

### CI

`.github/workflows/ci.yml`, **sem segredo nenhum**:

* a cada push e pull request — `npm ci`, `npm run check`, `npm run check:tests`,
  `npm test` e `npm run build`; e, em paralelo, **as migrações**: um Postgres
  vazio em memória recebe todas as migrações do zero e é comparado com o schema
  (`npm run db:migrate:ci`);
* à mão (aba Actions → CI → **Run workflow**) — também os testes de ponta a
  ponta, com o app inteiro local (`npm run e2e`).
