# Testes de ponta a ponta (E2E)

Cinco fluxos, um por arquivo, na ordem em que a peça anda pelo app:

| Arquivo | O que percorre |
| --- | --- |
| `01-login.spec.ts` | Entrar, sair, senha errada, rota protegida sem sessão |
| `02-solicitacao-cria-e-envia.spec.ts` | Criar a peça no lote do evento e enviá-la |
| `03-arte-envia-thumb-e-final.spec.ts` | Thumb de aprovação e arquivo final |
| `04-revisao-final-libera.spec.ts` | Liberar para a Gráfica, ou devolver com motivo |
| `05-grafica-imprime-confere-embala-entrega.spec.ts` | Imprimir → informar impressas → conferir → embalar → entregar o volume |

Cada um roda nas três larguras de `playwright.config.ts`: **390** (celular, que é
onde a Gráfica trabalha), **820** (tablet) e **1280** (desktop).

---

## Antes de tudo: NUNCA aponte para produção

Estes testes **criam evento, criam peça, iniciam impressão e entregam volume**.
Rodá-los contra o banco de produção é estrago, não teste.

Por isso:

* sem `E2E_BASE_URL`, **a suíte inteira é pulada** — não existe alvo padrão;
* `e2e/apoio.ts` recusa qualquer URL cujo hospedeiro pareça de produção
  (`*.replit.app` do app, `*.nortemkt.com`). Se você criar um alvo novo,
  acrescente o padrão na lista `PROIBIDOS` desse arquivo.

---

## Montando um alvo de teste

### Opção A — o Replit de desenvolvimento (mais simples)

O Repl de dev já tem banco próprio e é o alvo natural.

1. Abra o Repl, **Run**, e copie a URL de preview (algo como
   `https://<nome>-<usuario>.<região>.replit.dev`).
2. Crie os usuários de teste (um por perfil) na tela **Usuários**, como admin.
3. Exporte as variáveis (abaixo) e rode.

### Opção B — Postgres local

```bash
# 1. Banco vazio
createdb norte_e2e

# 2. Estrutura. NUNCA use db:push aqui se quiser o mesmo esquema da produção:
#    a migração aditiva é a que produção recebeu.
DATABASE_URL="postgres://localhost:5432/norte_e2e" \
  npx tsx scripts/migracao-aditiva-producao.mjs

# 3. Confira que não falta nada
DATABASE_URL="postgres://localhost:5432/norte_e2e" npm run db:drift

# 4. Primeiro admin (só funciona com a tabela users VAZIA — ver o README da raiz)
DATABASE_URL="postgres://localhost:5432/norte_e2e" \
SESSION_SECRET="qualquer-coisa-com-32-caracteres-ou-mais" \
SEED_PASSWORD="umaSenhaDeTeste123" \
  npm run dev
```

Com o app de pé em `http://localhost:5000`, entre como `admin@norte.com` com a
`SEED_PASSWORD`, troque a senha e crie um usuário por perfil.

> O upload usa o Object Storage do Replit. Sem ele, os passos que sobem thumb e
> arquivo final falham — no local, a Opção A é a que exercita o fluxo completo.

---

## Variáveis

```bash
export E2E_BASE_URL="https://<seu-repl-de-dev>.replit.dev"   # ou http://localhost:5000
export E2E_SENHA="umaSenhaDeTeste123"                        # a MESMA para os cinco usuários
export E2E_EMAIL_ADMIN="admin.e2e@teste.local"
export E2E_EMAIL_SOLICITACAO="solicitacao.e2e@teste.local"
export E2E_EMAIL_ARTE="arte.e2e@teste.local"
export E2E_EMAIL_GRAFICA="grafica.e2e@teste.local"
export E2E_EMAIL_ATENDIMENTO="atendimento.e2e@teste.local"
```

Nenhuma senha mora no repositório. Os usuários de teste **não podem** estar com
"trocar senha no primeiro acesso" pendente — o login para no `/change-password` e
o teste falha de propósito, avisando que o usuário foi recriado.

---

## Rodando

O Playwright **não está nas dependências do projeto** (ele baixa navegadores de
~300 MB, e o build do app não precisa deles). Instale quando for usar:

```bash
npm i -D @playwright/test
npm run e2e:install        # baixa o Chromium — só na primeira vez
```

Depois:

```bash
npm run e2e                                   # as três larguras
npm run e2e -- --project=celular-390          # só o celular
npm run e2e -- e2e/05-grafica-*.spec.ts       # um fluxo
npm run e2e:ui                                # modo interativo, para calibrar
```

Falhou? `playwright-report/` tem o HTML, com trace, vídeo e screenshot do passo
que quebrou (`npx playwright show-report`).

---

## A primeira execução é de calibração

Os seletores foram escritos a partir do código das telas (`data-testid`), sem
uma execução contra o app rodando. Espere ajustar alguns nomes na primeira vez —
principalmente no fluxo 2, que digita no formulário de lote, onde os campos são
indexados por linha (`input-description-0`, `input-quantity-0`, …).

Nos pontos em que um fluxo depende de uma etapa anterior, o cenário é montado
**pela API** (`e2e/cenario.ts`), não clicando pelas telas. É deliberado: se a
Arte mudar de layout, quem tem de ficar vermelho é o fluxo 3 — não o da Gráfica.

## O que estes testes NÃO cobrem

* **SSO pelo portal NORTE** — depende do portal, que não existe no alvo de teste.
  O login por senha (formulário de admin) é o caminho exercitado.
* **Aprovação por patrocinador** — as peças nascem com "sem aprovação"
  (`skipApproval`), para o fluxo não depender de cadastro de patrocinador. A
  máquina de estados da aprovação tem teste de servidor
  (`server/__tests__/maquina-de-estados-da-peca.test.ts`).
* **E-mails e digests** — mandam mensagem de verdade; ficam nos testes de servidor.
