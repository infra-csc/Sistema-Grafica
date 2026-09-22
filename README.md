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

### 1. Dependências

```bash
npm ci
```

### 2. Variáveis

```bash
cp .env.example .env
```

Preencha as três obrigatórias (as outras têm padrão ou desligam o recurso):

| Variável | Sem ela |
| --- | --- |
| `DATABASE_URL` | O servidor **lança no import** de `server/db.ts` — não sobe pela metade |
| `SESSION_SECRET` | Fail-fast em `server/session.ts`. Gere com `openssl rand -base64 48` |
| `PRIVATE_OBJECT_DIR` | Upload não grava (Object Storage do Replit) |

O `.env.example` explica **cada** variável, uma por linha.

### 3. Banco

Um banco vazio recebe a estrutura pela **migração aditiva** — a mesma que
produção recebe. Ela só cria o que falta e **nunca apaga nada**:

```bash
npx tsx scripts/migracao-aditiva-producao.mjs
npm run db:drift        # confere que não sobrou nem faltou nada
```

> Não use `npm run db:push` para montar o banco: ele derruba o que o schema não
> declara (sequência do `displayId`, índices de busca, tabela de sessões).

### 4. Subir

```bash
npm run dev             # http://localhost:5000 — API e cliente na mesma porta
```

### 5. O primeiro admin

Não há cadastro aberto: usuário é criado **por um admin**, pela tela Usuários. O
primeiro sai do `SEED_PASSWORD`, e ele só age **com a tabela `users` vazia**:

```bash
SEED_PASSWORD="umaSenhaForte123" npm run dev
```

Isso cria as contas iniciais (entre como `admin@norte.com`), todas com "trocar a
senha no primeiro acesso". **Apague a variável depois** — com o banco já
povoado ela não faz nada, e guardá-la é só um segredo a mais no ambiente.

Nenhuma outra rotina roda no boot. As correções de dados que rodavam a cada
deploy viraram scripts em `scripts/`, rodados uma vez por quem opera.

---

## Publicando no Replit

```
Pull  →  Stop  →  Run  →  Republish
```

1. **Pull** — traz a `main` para o Repl.
2. **Stop** e **Run** — reinicia o processo. Sem isso, o Repl segue servindo o
   build anterior.
3. **Republish** — publica o deployment (autoscale). Só o Republish troca o que
   o usuário final enxerga.

Antes de republicar, se o schema mudou, leia a seção abaixo.

---

## Migrações: a regra que já custou caro

**Dev e produção são bancos DIFERENTES.** Antes de culpar o código por um
"column does not exist", confira o drift.

```bash
# 1. O que o banco tem a menos (ou a mais) que o schema — SÓ LÊ
DATABASE_URL="<produção>" npm run db:drift

# 2. Se faltar algo: a migração aditiva. Só cria, nunca apaga.
DATABASE_URL="<produção>" npx tsx scripts/migracao-aditiva-producao.mjs

# 3. Confira de novo
DATABASE_URL="<produção>" npm run db:drift
```

**Nunca rode `db:push` em produção sem passar pelo `db:drift` antes.** O
`drizzle-kit push` alinha o banco ao schema nos **dois sentidos**: o que existe
lá e o schema não declara, ele derruba — e é exatamente o caso da sequência do
`displayId`, dos índices criados por script e da tabela `session` (derrubá-la
desloga todo mundo). O `db:drift` lista o que sobra **separando** o que foi
criado por script, justamente para isso.

O hook de merge do Replit (`scripts/post-merge.sh`) **não mexe mais no banco**
pelo mesmo motivo: o `db:push` automático pedia confirmação de perda de dado no
meio de um merge.

---

## Os scripts

Todos leem `DATABASE_URL` do ambiente. Rode com `npx tsx scripts/<arquivo>`.

### Só leem (seguros a qualquer hora)

| Script | O que responde |
| --- | --- |
| `checar-drift.mjs` | O que falta ou sobra no banco em relação ao schema (`npm run db:drift`) |
| `checar-senhas-seed.mjs` | Quais contas ainda usam a senha do cadastro inicial (passe `SENHA_ANTIGA`) |
| `contar-vinculos-duplicados.mjs` | Duplicatas em `item_sponsors` e afins, antes de criar índice único |
| `conferir-medida-vs-dimensoes.ts` | Peças cujos campos derivados de medida envelheceram |
| `preview-email-book.ts` | Gera o e-mail do book com dados de exemplo, sem enviar |
| `preview-email-gestao.ts` | O mesmo, para o aviso da gestão |

### Estrutura do banco (só criam)

| Script | O que faz |
| --- | --- |
| `migracao-aditiva-producao.mjs` | **A migração.** Cria tabelas, colunas e índices que faltam |
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
larguras (390, 820, 1280). **Não rodam contra produção**: sem `E2E_BASE_URL` a
suíte inteira é pulada, e o alvo é conferido antes do primeiro clique.

```bash
npm i -D @playwright/test     # fica fora das dependências (baixa ~300 MB de navegador)
npm run e2e:install           # o Chromium, só na primeira vez
npm run e2e
```

Como montar o alvo (Replit de dev ou Postgres local), quais variáveis definir e
o que a suíte **não** cobre: [e2e/README.md](e2e/README.md).

### CI

`.github/workflows/ci.yml` roda a cada push e pull request: `npm ci`,
`npm run check`, `npm run check:tests`, `npm test` e `npm run build`. **Sem
segredo nenhum** — nada ali toca banco, bucket ou e-mail.
