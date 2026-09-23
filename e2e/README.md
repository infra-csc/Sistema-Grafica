# Testes de ponta a ponta (E2E)

Cinco fluxos, um por arquivo, na ordem em que a peça anda pelo app:

| Arquivo | O que percorre |
| --- | --- |
| `01-login.spec.ts` | Entrar pelo formulário, senha errada, sair de verdade, rota protegida sem sessão |
| `02-solicitacao-cria-e-envia.spec.ts` | Digitar a peça no lote do evento (a tela), enviá-la, a Vinculação, evento realizado |
| `03-arte-envia-thumb-e-final.spec.ts` | Thumb, arquivo final, upload que mente o tipo, a Arte não libera o próprio trabalho |
| `04-revisao-final-libera.spec.ts` | Liberar para a Gráfica, sem arquivo final não libera, devolver com motivo (e a Arte vê o motivo) |
| `05-grafica-imprime-confere-embala-entrega.spec.ts` | Imprimir → informar impressas → conferir → embalar → entregar o volume; a fila no celular |

Cada um roda nas três larguras de `playwright.config.ts`: **390** (celular, que é
onde a Gráfica trabalha), **820** (tablet) e **1280** (desktop).

---

## Rodando (o normal): tudo na sua máquina

```bash
npm run ferramentas:instalar   # uma vez: Playwright + Chromium + PGlite, fora do repositório
npm run e2e                    # sobe banco + app, roda as 3 larguras, derruba tudo
```

`npm run e2e` (`scripts/e2e.mjs`), sem `E2E_BASE_URL`:

1. sobe um Postgres **em memória** (PGlite), aplica as migrações e cria um
   usuário por perfil (`<perfil>@local.test`, senha `senha-local-123`);
2. sobe o app (`server/index.ts` com Vite) numa porta local (5199, ou
   `E2E_PORTA`), com um object storage de mentira — **os uploads funcionam**;
3. roda cada largura com o servidor reiniciado (os limitadores de login e de
   escrita são por processo; três larguras seguidas estourariam a cota);
4. derruba tudo. Nada fica rodando, nada encosta em banco de verdade.

Os argumentos passam para o Playwright:

```bash
npm run e2e -- --project=celular-390
npm run e2e -- e2e/05-grafica-imprime-confere-embala-entrega.spec.ts
npm run e2e -- --headed          # ver o navegador
npm run e2e:ui                   # modo interativo, para calibrar seletor
```

Falhou? `test-results/<largura>/` tem trace, vídeo, screenshot e o
`error-context.md` (a árvore da tela no momento da falha) do passo que quebrou:
`node ../_ferramentas/node_modules/@playwright/test/cli.js show-trace <trace.zip>`.
As últimas linhas do servidor saem no console.

Ver as telas sem rodar teste: `npm run dev:local` (README da raiz) sobe o mesmo
ambiente com dados de exemplo em todas as etapas.

---

## Contra outro alvo (o Replit de dev)

Com `E2E_BASE_URL` definida, `npm run e2e` só roda a suíte contra aquele
endereço — nada sobe localmente:

```bash
export E2E_BASE_URL="https://<seu-repl-de-dev>.replit.dev"
export E2E_SENHA="umaSenhaDeTeste123"                  # a MESMA para os cinco usuários
export E2E_EMAIL_ADMIN="admin.e2e@teste.local"
export E2E_EMAIL_SOLICITACAO="solicitacao.e2e@teste.local"
export E2E_EMAIL_ARTE="arte.e2e@teste.local"
export E2E_EMAIL_GRAFICA="grafica.e2e@teste.local"
export E2E_EMAIL_ATENDIMENTO="atendimento.e2e@teste.local"
npm run e2e
```

Os usuários (um por perfil) são criados pela tela **Usuários**, como admin, e
**não podem** estar com "trocar senha no primeiro acesso" pendente — o login
para no `/change-password` e o teste falha de propósito.

Cuidado com o limite de login: são **10 por IP e 10 por conta a cada 15 min**.
No alvo local, cada login usa um IP de mentira (`X-Forwarded-For`, que o
servidor aceita porque confia em um proxy); atrás do proxy do Replit isso não
vale. A suíte reaproveita a sessão de cada perfil (`entrar` em `apoio.ts`) e o
fluxo 1 distribui os perfis pelas larguras, mas duas rodadas seguidas contra o
Replit podem esbarrar no limite — espere os 15 minutos.

### NUNCA aponte para produção

Estes testes **criam evento, criam peça, iniciam impressão e entregam volume**.
`e2e/apoio.ts` recusa qualquer hospedeiro que pareça de produção
(`print-flow-manager*.replit.app`, `*.nortemkt.com`). Alvo novo de produção?
Acrescente o padrão na lista `PROIBIDOS` desse arquivo.

---

## Como os testes entram

* **O fluxo 1 entra pelo formulário em todo teste** — é ele que testa o login.
  Cada largura usa o perfil que trabalha naquele aparelho (`perfilDaLargura`:
  Gráfica no celular, Arte no tablet, Solicitação no desktop).
* **Os fluxos 2 a 5 reaproveitam a sessão**: cada perfil entra UMA vez pelo
  formulário e o cookie fica num arquivo temporário (por alvo), usado pelos
  testes seguintes e pelas três larguras. Sessão que não serve mais → entra de
  novo pelo formulário.
* **Excluir o evento de teste é do admin**: `limpar` entra como admin antes. (Sem
  isso, a exclusão levava 403 calada, os eventos de teste se acumulavam e a peça
  que ficou "em impressão" segurava a impressora dos testes seguintes.)

## O cenário vem pela API

Nos pontos em que um fluxo depende de uma etapa anterior, o cenário é montado
**pela API** (`e2e/cenario.ts`), não clicando pelas telas. É deliberado: se a
Arte mudar de layout, quem tem de ficar vermelho é o fluxo 3 — não o da Gráfica.

* O "Tipo" do lote lista os **Modelos** cadastrados; num banco novo não há
  nenhum, então `garantirModelo` cria o "Pórtico E2E".
* A Gráfica tem **uma peça por impressora** (409 `PRINTER_BUSY`):
  `iniciarNumaImpressoraLivre` tenta da 1 à 4, para o teste não depender de
  quem mais está imprimindo no banco-alvo.
* O servidor grava o arquivo subido como `/objects/uploads/<id>`, não como a URL
  do bucket que o upload devolve — `comoGravado` faz a mesma conversão.
* Os testes rodam com **um worker**: os fluxos disputam as mesmas impressoras e
  o banco local é uma sessão só.

---

## Defeitos achados pelos E2E

| Teste | Defeito | Situação |
| --- | --- | --- |
| 01 · senha errada / e-mail inexistente | A tela de login dizia **"Sua sessão expirou"** para quem errou a senha (o 401 do login era tratado como sessão vencida). A troca de senha com a senha atual errada chegava a derrubar a sessão. | Corrigido em `client/src/lib/queryClient.ts` (`ehRespostaDeCredencial`). |

Um defeito novo achado aqui entra com `test.fail(true, "…")` — a suíte fica verde
e o Playwright acusa quando o conserto chegar.

## O que estes testes NÃO cobrem

* **SSO pelo portal NORTE** — depende do portal, que não existe no alvo de teste.
  O login por senha (formulário de admin) é o caminho exercitado.
* **Aprovação por patrocinador** — as peças nascem com "sem aprovação"
  (`skipApproval`), para o fluxo não depender de cadastro de patrocinador. A
  máquina de estados da aprovação tem teste de servidor
  (`server/__tests__/maquina-de-estados-da-peca.test.ts`).
* **E-mails e digests** — mandam mensagem de verdade; ficam nos testes de servidor
  (no app local eles estão desligados).
* **Corrida entre duas pessoas** (dois cliques na mesma peça ao mesmo tempo): o
  banco local é uma sessão só — `FOR UPDATE` e advisory locks não disputam nada.
  Isso é coberto pelos testes de servidor.
