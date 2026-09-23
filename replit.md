# NORTE — Sistema Gráfica (notas do Replit)

**A documentação do projeto mora no [README.md](README.md).** Este arquivo
guarda só o que é do Replit e as preferências de trabalho do dono.

| Quero saber | Onde está |
| --- | --- |
| O que o app é, os perfis, o caminho da peça, como rodar local | [README.md](README.md) |
| Camadas, `shared/`, tempo real, caches, agendadores, uploads | [docs/arquitetura.md](docs/arquitetura.md) |
| Status da peça: quem move, de onde, para onde | [docs/estados-da-peca.md](docs/estados-da-peca.md) |
| Variáveis de ambiente, uma por uma | [.env.example](.env.example) |
| Testes de ponta a ponta | [e2e/README.md](e2e/README.md) |

> Este arquivo já foi um espelho da arquitetura, mantido à mão — e envelheceu,
> como todo espelho: descrevia status em português (`aguardando_envio`) que o
> banco nunca gravou, e um módulo de inventário que mudou depois. Uma descrição
> que ninguém verifica vira desinformação com data marcada. Agora ele aponta
> para os documentos que ficam perto do código.

---

## Publicar

```
Pull  →  Stop  →  Run  →  Republish
```

**Stop e Run não são opcionais**: sem reiniciar, o Repl segue servindo o build
anterior. E só o **Republish** troca o que o usuário final enxerga — o preview
do editor é outro processo.

Se o schema mudou, rode a migração aditiva **antes** de republicar, e confira o
drift depois (README → "Migrações"). **Nunca `db:push` em produção sem
`npm run db:drift` antes**: o `drizzle-kit push` derruba o que o schema não
declara — a sequência do `displayId`, os índices criados por script e a tabela
`session` (derrubá-la desloga todo mundo).

## Configuração do Repl

* **Deployment**: autoscale. `build = npm run build`, `run = npm run start`.
  Várias cópias do processo ao mesmo tempo — é daí que vêm o LISTEN/NOTIFY do
  tempo real e a trava de liderança dos agendadores (docs/arquitetura.md).
* **Porta**: 5000 → 80. É a única não bloqueada.
* **Integrações**: banco (Neon), WebSocket, Object Storage. E o app
  **Checklist de Arena**, que só LÊ as peças da Arena entregues por token
  (`CHECKLIST_INTEGRACAO_TOKEN`, sem ele a integração fica desligada):
  `GET /api/integracao/checklist/eventos`,
  `GET /api/integracao/checklist/eventos/:id/entregues` e
  `GET /api/integracao/checklist/itens/:itemId/thumb` (a arte) — contrato em
  docs/arquitetura.md → "Integração com o Checklist de Arena".
* **`[postMerge]`** roda `scripts/post-merge.sh` a cada merge. Ele **não toca no
  banco**: o `db:push` automático que havia ali derrubava o que o schema não
  declara e chegava a pedir confirmação de perda de dado no meio do merge.
* **Secrets**: as sensíveis (`DATABASE_URL`, `SESSION_SECRET`, `SSO_SECRET`,
  `PRIVATE_OBJECT_DIR`, `CHECKLIST_INTEGRACAO_TOKEN`). As de comportamento — que não são segredo — ficam em
  `[userenv.shared]` do `.replit`, à vista.

## Preferências do dono

* **Explicação curta e clara**, sem rodeio.
* **Iterativo**: muitas entregas pequenas, não uma grande.
* **Confirmar antes** de mudança significativa de código ou decisão de
  arquitetura.
* **Não mexer em `shared/schema.ts`** sem instrução explícita.
* **Reler o diff inteiro antes de aplicar** — lógica, casos de borda e efeito
  colateral. Só então aplicar.
* **Tudo em português**: títulos de tarefa, descrições, textos de tela.
