# Arquitetura

Um mapa para quem vai mexer. Não repete o que o código já diz: aponta onde cada
coisa mora e, principalmente, **por que ela é assim** — as decisões que já
custaram caro.

---

## As três camadas e o que é de cada uma

```
client/src/    React + Vite + Tailwind. Telas, componentes e o estado de tela.
shared/        O que os DOIS lados precisam saber. É a camada que impede divergência.
server/        Express + Drizzle. Rotas, serviços, tempo real, agendadores.
```

O build junta tudo num processo só: `vite build` gera o cliente estático e
`esbuild` empacota `server/index.ts` em `dist/`. Em produção o mesmo Express
serve a API **e** os arquivos do cliente — uma porta (5000), uma origem.

### `client/src`

| Pasta | O que é |
| --- | --- |
| `pages/` | Uma tela por arquivo, roteadas por `wouter` em `App.tsx` |
| `components/` | O que é usado por mais de uma tela |
| `components/ui/` | Primitivas (shadcn/Radix). Só o que o app realmente usa |
| `lib/` | Regras de TELA: filtros, rótulos, formatação, tema |
| `hooks/` | React Query e afins |

Dados: **React Query**, com listas grandes carregadas por delta (`?since=`) em
vez de recarregar tudo.

### `server`

| Arquivo / pasta | O que é |
| --- | --- |
| `index.ts` | Cabeçalhos de segurança, CSRF, limitador de escrita, SSO do portal |
| `routes.ts` | Registra todos os módulos de rota, sobe os agendadores e o WebSocket |
| `routes/*.ts` | Um arquivo por assunto (itens, eventos, patrocinadores, tubos…) |
| `services/*.ts` | O que não é rota: digests, snapshots, inventário, liderança, miniaturas |
| `storage.ts` | A camada de acesso ao banco (Drizzle) |
| `db.ts` | O pool. **Lança no import sem `DATABASE_URL`** — falha rápido, não pela metade |

### `shared/` — a camada que existe para evitar duas verdades

A regra, escrita no topo de `shared/fluxo-peca.ts`:

> Quando o cliente precisa saber uma regra para **não oferecer** o que o
> servidor nega, a regra mora aqui — não escrita duas vezes com um teste
> comparando as cópias.

Um teste que só confere se duas listas continuam iguais é sintoma, não solução:
ele pega a divergência **depois** que ela foi escrita. O `shared/` a torna
inescrevível.

Os arquivos que mais importam:

| Arquivo | O que resolve |
| --- | --- |
| `schema.ts` | Tabelas (Drizzle) e os schemas Zod de entrada |
| `fluxo-peca.ts` | Status, etapas canônicas, o funil de prazos, as máquinas |
| `permissoes.ts` | A régua de papéis por rota de escrita (ver abaixo) |
| `prazo-dates.ts` | Quando um evento "já foi", e os cinco marcos |
| `ws-mensagens.ts` | O contrato das mensagens de tempo real |
| `impressao-dividida.ts` | A peça repartida entre impressoras |

#### A régua de papéis é verificada, não prometida

`shared/permissoes.ts` declara quem pode escrever em cada rota. O que a mantém
verdadeira não é disciplina: é `server/__tests__/permissoes-declaradas.test.ts`,
que varre as rotas com `server/permissoes-scan.ts` e **quebra se o código e a
tabela divergirem, em qualquer direção**. Mudou uma guarda? O teste aponta a
linha da tabela que tem de mudar junto, e o diff da tabela vira o registro
legível da decisão.

Rota de escrita sem linha na tabela = qualquer usuário autenticado.

---

## Autenticação e sessão

Dois caminhos de entrada, uma sessão só (cookie, `express-session` sobre
`connect-pg-simple` — a sessão vive no Postgres, e é por isso que dá para
derrubá-la de outra cópia):

1. **Senha** — `POST /api/auth/login`. O id da sessão é **regenerado** antes de
   escrever os dados (fixação de sessão). "Conta não existe" e "senha errada"
   respondem igual e gastam o mesmo tempo (um bcrypt contra um hash fictício):
   a diferença revelaria quem tem conta.
2. **SSO do portal NORTE** — `?portal_sso=<JWT>` → token de troca de **uso
   único** em tabela → `POST /api/auth/sso-exchange` cria a sessão na mesma
   origem.

A sessão é *rolling* (cada requisição renova 7 dias), com duas travas em
`server/sessao-valida.ts`, que roda **antes de qualquer rota**:

* teto absoluto de **30 dias** desde o login, renovando ou não;
* o usuário **ainda existe** (consulta com cache de 60 s por processo).

Sessão vencida ou de usuário excluído é destruída, e a requisição segue como
**não autenticada** — quem responde 401 é a guarda da rota, como sempre. Banco
fora do ar **não** desloga ninguém: segue o fluxo e a rota decide.

**Ver como** (15/09): o admin empresta um perfil à própria sessão. Quem ele É
fica em `session.papelReal` — e é `papelReal`, não `userRole`, que autoriza a
próxima troca; senão o primeiro "ver como" trancaria o admin fora do botão de
voltar. Tudo que ele fizer entra na trilha como "Ana (como Gráfica)".

---

## Tempo real: LISTEN/NOTIFY

O deploy é **autoscale**: o Replit sobe várias cópias do processo, e cada
navegador fica conectado por WebSocket a **uma** delas. Antes, `broadcast()` só
falava com os sockets da própria cópia — a conferência feita por quem caiu na
cópia A não chegava à Gráfica de quem estava na cópia B, e o cache da B seguia
servindo o dado velho.

Hoje (`server/tempo-real.ts`):

1. `broadcast(msg)` recorta a mensagem num **sinal** (`shared/ws-mensagens.ts`),
   invalida os caches e entrega aos sockets desta cópia na hora;
2. publica o sinal no canal do Postgres (`NOTIFY grafica_tempo_real`);
3. cada outra cópia, ouvindo o canal (`LISTEN`) numa conexão dedicada, faz o
   passo 1 do lado dela. A mensagem volta pelo canal e é ignorada pela origem.

Pontos que mordem:

* **A conexão do LISTEN é fora do pool e vai direto ao Postgres.** O endereço
  `-pooler` do Neon (PgBouncer em modo transação) **não entrega NOTIFY**. É para
  isso que existe `TEMPO_REAL_DATABASE_URL`.
* O `NOTIFY` aceita ~8 KB; acima disso vai só o tipo da mensagem.
* Queda da conexão → reconecta com espera crescente e, ao voltar, **limpa os
  caches e manda `resync`** aos próprios sockets: o que passou durante a queda
  não chegou aqui.
* O handshake do `/ws` é **autenticado**: o mesmo `sessionMiddleware` roda sobre
  a requisição de upgrade, e sem `userId` o socket é recusado. Sem isso,
  qualquer cliente que alcançasse `/ws` receberia todos os broadcasts.
* Quem é o socket fica **nele** (`userId`, `userKit`): é o que permite recortar
  o sinal do Kit sem mandar os textos para quem não é do Kit.

Sem `DATABASE_URL`, em teste, ou com `TEMPO_REAL_CANAL=off`, tudo fica local —
o comportamento de uma cópia só.

---

## Caches

Caches curtos, em memória, **por cópia** (`server/cache.ts`): eventos (30 s),
notificações e outros. Duas coisas os mantêm honestos:

* **Geração.** Cada invalidação incrementa um contador. Quem vai montar o cache
  anota a geração **antes** de ler o banco e só grava se ela não mudou. Sem
  isso havia uma corrida real: a leitura começa, uma escrita invalida o cache, a
  leitura (com o dado de **antes**) termina e grava — e esse dado velho era
  servido pelo TTL inteiro, justamente para as abas que o broadcast mandou
  recarregar.
* **Cluster.** A escrita numa cópia invalida o cache **dela**; as outras só
  ficam sabendo pelo canal do tempo real, que chama
  `invalidarCachesDaMensagem` / `invalidarCacheLocal` do lado de lá.

Fora isso: **sem ETag na API** (`app.set("etag", false)`) — o Express hasheava o
corpo inteiro de cada lista (MBs) para quase nunca bater; as listas vivem de
delta. E **gzip** ligado, porque as listagens são JSON grande e repetitivo.

---

## Agendadores: trava de liderança

Cada cópia sobe os mesmos relógios (`setInterval`) dos avisos de prazo, do fecho
de snapshots, da prioridade automática, do ciclo do inventário e dos digests.
Com três cópias, cada tarefa rodava três vezes.

`server/services/lideranca.ts` → `executarComoLider(tarefa, fn, { janelaMs })`:

1. abre uma transação e pede `pg_try_advisory_xact_lock(tarefa)` — se outra
   cópia está rodando a mesma tarefa **agora**, desiste na hora, sem esperar;
2. com `janelaMs`, **reserva a janela** (`reservarDisparo`): a primeira cópia da
   janela roda, as outras já sabem que foi feito;
3. roda e solta a trava no fim da transação. Não há trava a vazar: cópia que
   morre derruba a conexão, e o Postgres solta sozinho.

É trava **por execução**, não uma cópia "líder" fixa: no autoscale uma cópia
pode ficar sem CPU entre requisições, e a líder congelada seguraria a tarefa
para sempre. Aqui roda quem estiver acordado.

**Falha aberta**: sem banco (teste, script local) roda direto; falha ao pegar a
trava → roda mesmo assim. Trabalho em dobro é detectável; tarefa que para em
silêncio, não.

O mesmo mecanismo (`pg_advisory_xact_lock`) trava **por impressora** em
`routes/items.ts` e `routes/maquinas.ts`, para garantir "uma peça por vez por
impressora" contra duas requisições simultâneas.

---

## Excluir evento ou patrocinador = arquivar

O botão "Excluir" das telas continua chamando `DELETE /api/events/:id` e
`DELETE /api/sponsors/:id` — mas nenhuma das duas apaga a linha. Elas gravam
`arquivado_em`/`arquivado_por`, e `POST …/:id/restaurar` (admin) desfaz.

**Por quê.** As FKs de `items`, `item_sponsor_approvals`, `registros_de_impressao`,
`tubo_itens`, `consultas_de_estoque`, `event_sponsors`… são `ON DELETE CASCADE`.
Apagar um evento levava junto, sem volta, as peças, as aprovações, o diário das
impressoras e os volumes; `inventory_assets.original_item_id` ficava órfão; e as
abas abertas seguiam mostrando peças-fantasma. Apagar um patrocinador levava o
histórico de aprovações dele.

**O que o arquivado faz** (a regra mora em `server/services/arquivamento.ts`):

* **Evento** some de toda listagem e contagem — o filtro está no `storage`
  (`getAllEvents` e as leituras de peças, via `doEventoNaoArquivado`) e nas
  consultas cruas (busca, busca de arte, Máquinas, tubos, estoque, pedidos de
  peça, consultas de estoque, Kit, notificações, consistência). Não aceita
  escrita: a guarda de evento finalizado (`routes/eventoFinalizado.ts`) ganhou o
  motivo `"arquivado"`, que barra até o que "arruma a casa", e as rotas do
  próprio evento usam `barraSeArquivado` — 409 "Evento arquivado — restaure
  antes de mexer.". `getEvent(id)` continua enxergando o arquivado: é por ele
  que as guardas e a restauração leem.
* **Patrocinador** sai das listas de ESCOLHA (`GET /api/sponsors`, elenco do
  evento, vinculação automática, importação), mas `getAllSponsors` continua
  sendo o dicionário completo: o nome dele segue nas peças e aprovações antigas.
  Vínculo novo com arquivado é recusado; o vínculo antigo fica.
* **Restaurar evento** grava `restaurado_em`: as peças não mudaram, então o
  delta de `/api/items?since=` (que olha `updated_at` da peça) não as traria de
  volta às abas abertas — é por essa marca que ele as reenvia.

**Remoção física virou manutenção.** Se um dia for preciso apagar de verdade
(LGPD, lixo de teste), é um script de manutenção rodado à mão, com backup e
conferência — nunca um caminho do app. As FKs em cascata continuam no banco
(mudá-las não é migração aditiva); o que mudou é que o código não tem mais
`deleteEvent` nem `deleteSponsor`.

---

## Uploads

O arquivo é servido pela **mesma origem do app** (`/objects/*`). Um HTML ou SVG
enviado como "anexo" abriria com a sessão de quem clicasse — é XSS, não arte.
Por isso `server/upload-seguro.ts`:

**Entrada** — lista fechada (PNG, JPEG, WEBP, GIF, PDF, `.xlsx`, `.zip`), e o
tipo é decidido pelos **bytes** do arquivo, não pelo `Content-Type` que o
navegador declarou. Um "image/png" que na verdade é PDF fica gravado como PDF;
um HTML disfarçado de PNG é recusado. Teto de **50 MB**.

**Saída** — `X-Content-Type-Options: nosniff` sempre; imagem raster e PDF abrem
no navegador, todo o resto (inclusive tipos antigos gravados antes da lista
fechada) vai como download, isolado em `sandbox`. O PDF **não** leva `sandbox`:
o visualizador do Chrome se recusa a abrir documento em sandbox, e o PDF não
roda script na origem do app.

**Dois caminhos**:

* `PUT /api/objects/upload-direct` — o atual. Proxy de mesma origem: o navegador
  só fala com o app, e o servidor grava no bucket. Existe porque o caminho
  antigo (URL assinada + PUT direto no `storage.googleapis.com`) morria em
  "Failed to fetch" nas redes corporativas que bloqueiam o host do Google.
* `POST /api/objects/upload` — legado, devolve URL assinada. O bucket não amarra
  tipo nem tamanho a essa URL, então o **pedido** precisa declarar os dois.

`GET /objects/*` exige sessão e confere a ACL quando o objeto tem uma. Objeto
antigo sem política gravada é acessível a qualquer usuário autenticado (era o
comportamento anterior; negar 403 quebraria todo objeto legado). Com `?thumb=1`
e `sharp` instalado, devolve um WEBP de até 320 px (LRU em memória + cache de
navegador de 24 h) — as listas pintavam originais de MBs em caixas de 12–80 px.

---

## Segurança que vale em toda requisição

Em `server/index.ts`, antes de qualquer rota:

* `nosniff`, `Referrer-Policy: same-origin`, `X-Robots-Tag: noindex`, CSP; em
  produção, HSTS de um ano, `X-Frame-Options: DENY` e `frame-ancestors 'none'`
  (em dev, o preview do Replit é liberado);
* **CSRF**: em requisição que muda estado, o `Origin` tem de bater com o `host`.
  É a segunda camada — `sameSite: 'lax'` já barra a maior parte. A troca de SSO
  é isenta (é AJAX de mesma origem);
* **limitador de escrita** global: 300 mutações em 5 min por usuário, por cópia.
  Freio de script, não cota;
* resposta 5xx **nunca** devolve detalhe interno (constraint do Postgres, stack)
  ao cliente. A chave do erro é sempre `error`;
* corpos de resposta de rotas sensíveis (`/api/auth/*`, `/api/users*`) não são
  logados.

O processo instala `unhandledRejection`/`uncaughtException` e **segue de pé**,
com a causa no log: sem isso, uma Promise rejeitada derrubava o Node em silêncio
e o único rastro era o restart do Replit. É um compromisso consciente —
disponibilidade e visibilidade acima de reinício limpo, para um app interno.

---

## Testes

| Onde | O quê |
| --- | --- |
| `server/__tests__/` | ~255 arquivos, dois projetos do Vitest |
| projeto `servidor` | Padrão (node). Rotas com banco de mentira, regras puras |
| projeto `telas` | Quem pede `// @vitest-environment jsdom` no docblock |
| `e2e/` | Playwright, cinco fluxos, três larguras — ver `e2e/README.md` |

Os dois projetos existem porque montar React no jsdom é pesado: na suíte única,
os testes de tela disputavam CPU com os de servidor e estouravam o tempo — falha
falsa, que passava rodando o arquivo sozinho. Agora rodam **depois**
(`sequence.groupOrder`) e com 4 workers.

Padrões desta base:

* **Rota executada, não código lido.** O melhor teste daqui monta um `app` de
  mentira, registra os handlers reais e chama com um banco falso (ver
  `server/__tests__/tx-de-mentira.ts`). Teste que faz `expect(FONTE).toContain(...)`
  prova que a linha está escrita — não que a peça termina no status certo.
* **O nome do teste é a frase de negócio**, não o nome da função.
* **O comentário no topo diz por que o arquivo existe** e qual estrago ele
  impede. Vários apontam o caso real (#4176, #1527, #3483).
