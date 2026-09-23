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

Se o Pull trouxe arquivo novo em `migrations/`, rode na Shell, **antes** de
republicar: `npm run db:migrate` (simulação) e `npm run db:migrate -- --aplicar`
(README → "Banco e migrações"; a adoção, uma vez por banco, está lá). **Nunca
`db:push` em produção**: o `drizzle-kit push` derruba o que o schema não
declara — os índices de busca criados por script, por exemplo — e já apagou
tabela e índices aqui. `db:push` é só para banco descartável.

## Configuração do Repl

* **Deployment**: autoscale. `build = npm run build`, `run = npm run start`.
  Várias cópias do processo ao mesmo tempo — é daí que vêm o LISTEN/NOTIFY do
  tempo real e a trava de liderança dos agendadores (docs/arquitetura.md).
* **Porta**: 5000 → 80. É a única não bloqueada.
* **Integrações**: banco (Neon), WebSocket, Object Storage.
* **`[postMerge]`** roda `scripts/post-merge.sh` a cada merge. Ele **não toca no
  banco**: o `db:push` automático que havia ali derrubava o que o schema não
  declara e chegava a pedir confirmação de perda de dado no meio do merge.
* **Secrets**: as sensíveis (`DATABASE_URL`, `SESSION_SECRET`, `SSO_SECRET`,
  `PRIVATE_OBJECT_DIR`). As de comportamento — que não são segredo — ficam em
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
