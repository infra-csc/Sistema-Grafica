# Os estados da peça: quem move, e para onde

Montado a partir de `shared/fluxo-peca.ts` (as etapas canônicas),
`shared/permissoes.ts` (a régua de papéis) e dos handlers em
`server/routes/items.ts`, `molde.ts`, `sponsors.ts` e `tubos.ts`.

> **O `admin` foi omitido de todas as linhas.** Ele passa em todas as guardas
> deste documento. Onde só ele pode, está dito.

---

## O caminho normal, em uma linha

```
Rascunho → Aguardando Vinculação → Aguardando Envio → Aguardando Aprovação
        → Aguardando Finalização → Aguardando Revisão Final
        → Pronto para Produção → Em Impressão → Impresso/Acabamento
        → Conferido → Embalado → Entregue
```

E os dois desvios que existem de verdade:

* **"Sem aprovação"** (`skipApproval`) ou peça sem patrocinador: o envio da Arte
  pula "Aguardando Aprovação" e cai direto na finalização.
* **Molde** (`type = "Molde"`): não passa por Vinculação, não tem aprovação nem
  arquivo final, e não vai para a impressora. Envio → Revisão Final → Liberado →
  Produzido, e acabou.

---

## Etapas canônicas

`shared/fluxo-peca.ts` reúne todo status gravado (canônico **e** legado) numa
etapa. É a régua única de toda tela que **conta** peça — antes, Painel, barra de
fases, Atendimento, Prazos e Análises tinham cada um a sua tabela, e a mesma
peça `entregue` era "Outros" no Painel e entregue nas Análises.

| Etapa | Status gravados (o 1º é o canônico) | Rótulo |
| --- | --- | --- |
| `requested` | `requested`, `draft`, `solicitado`, `rascunho` | Rascunho / Solicitado |
| `awaiting_linking` | `awaiting_linking` | Aguardando Vinculação |
| `awaiting_submission` | `awaiting_submission` | Aguardando Envio |
| `awaiting_approval` | `awaiting_approval`, `awaiting_sponsor_approval` | Aguardando Aprovação |
| `awaiting_finalization` | `awaiting_finalization`, `sponsor_approved`, `awaiting_creator_review` | Aguardando Finalização |
| `awaiting_final_review` | `awaiting_final_review`, `awaiting_review`, `in_review` | Aguardando Revisão Final |
| `ready_for_production` | `ready_for_production`, `pronto_para_producao` | Pronto para Produção |
| `approved` | `approved`, `liberado` | Liberado |
| `inProduction` | `inProduction`, `em_producao`, `in_production` | Em Impressão |
| `produced` | `produced`, `produzido` | Impresso / Acabamento |
| `conferred` | `conferred`, `conferido` | Conferido |
| `packed` | `packed`, `embalado` | Embalado |
| `delivered` | `delivered`, `entregue` | Entregue |
| `canceled` | `canceled`, `cancelled`, `deleted`, `archived` | Fora do funil |

---

## A tabela: de onde, para onde, por quem

| De | Ação (rota) | Para | Quem |
| --- | --- | --- | --- |
| — | criar peça (`POST /api/items`, `/bulk`) | Rascunho | Solicitação |
| Rascunho | enviar a lista (`POST /api/events/:id/items/submit`) | Aguardando Vinculação (molde: Aguardando Envio) | Solicitação |
| Aguardando Vinculação | mandar para a Arte (`POST /api/items/send-to-arte`) | Aguardando Envio | Solicitação, Arte, Atendimento |
| Aguardando Envio | enviar com o thumb (`PATCH /:id/submit-for-approval`) | Aguardando Aprovação — ou **Aguardando Finalização** se `skipApproval` ou sem patrocinador | Arte |
| Aguardando Envio | idem, sendo **molde** (`shared/molde`) | Aguardando Revisão Final | Arte |
| Aguardando Envio / Aguardando Aprovação | pular a aprovação (`PATCH /:id/dispense`) | Aguardando Finalização | Arte |
| Aguardando Aprovação | aprovar pela peça inteira (`PATCH /:id/sponsor-approve`) | Aguardando Finalização | Atendimento |
| Aguardando Aprovação | aprovar **por patrocinador** (`POST /:id/sponsor-approvals/:sponsorId/approve`) | Aguardando Finalização **quando todos aprovarem** | Atendimento |
| Aguardando Aprovação | reprovar por patrocinador (`…/reject`) | fica; a peça é marcada como reprovada | Atendimento |
| Aguardando Finalização | subir o arquivo final (`PATCH /:id/submit-final-file`) | Aguardando Revisão Final | Arte |
| Aguardando Revisão Final | liberar (`PATCH /:id/creator-review`) | Pronto para Produção | Solicitação |
| Aguardando Revisão Final | devolver para a Arte (`PATCH /:id/return-to-arte`, `bulk-return-to-arte`) | Aguardando Finalização, ou **Aguardando Envio** com `destino: "arte"` | Solicitação |
| Pronto para Produção / Liberado | iniciar impressão (`PATCH /:id/start-printing`) | Em Impressão | Gráfica |
| Pronto para Produção / Liberado | devolver para a Revisão (`PATCH /:id/return-to-review`) | Aguardando Revisão Final | Gráfica |
| Pronto para Produção / Liberado (**molde**) | marcar produzido (`PATCH /:id/molde-produzido`) | Impresso / Acabamento | Gráfica |
| Impresso (**molde**) | desfazer (`PATCH /:id/molde-voltar-liberado`) | Pronto para Produção | Gráfica |
| Em Impressão | informar impressas (`PATCH /:id/start-production`) | fica, ou **Impresso / Acabamento** quando fecha a conta | Gráfica |
| Impresso / Acabamento | conferir (`POST /:id/confer`) | Conferido (parcial: fica) | Gráfica, Solicitação |
| Impresso / Conferido | embalar (`POST /api/events/:eventId/tubos`, `PATCH /api/tubos/:id/itens`) | **Embalado** (o produzido só vira `packed` quando a conferência dele fecha) | Gráfica, Solicitação |
| Embalado | tirar do volume (ou apagar o volume) | volta a Conferido | Gráfica, Solicitação |
| Embalado | entregar o volume (`POST /api/tubos/:id/entregar`) | Entregue | Gráfica, Solicitação |
| **qualquer um** (menos Rascunho) | a Arte devolve ao solicitante (`PATCH /:id/arte-reject`) | Rascunho | Arte |
| **qualquer um** | cancelar (`PATCH /:id/cancel`, `bulk-cancel`) | Fora do funil | Solicitação, Arte |
| Fora do funil | descancelar (`PATCH /:id/uncancel`) | de onde saiu (ver abaixo) | **só admin** |
| pós-aprovação | revogar aprovação (`POST /:id/sponsor-approvals/:sponsorId/revert`) | Aguardando Aprovação | Atendimento (só em Aguardando Aprovação / Finalização); **admin** em qualquer status pós-aprovação |
| excluída | restaurar (`POST /:id/restore`) | volta como estava | **só admin** |

---

## As regras que a tabela não cabe

### Evento realizado ou encerrado barra quase tudo

`barraEventoFinalizado` (`server/routes/eventoFinalizado.ts`) responde **409** em
~39 rotas de escrita de peça. A régua do dono para o caso duvidoso é **barrar**:
mexer ali reescreve número fechado com o patrocinador, e quem precisa mesmo
corrigir reabre o evento, que é barato.

A exceção: informar impressas de uma peça que **já está** na impressora segue
valendo — a lona está na máquina agora.

### Devolver vale de qualquer estado — menos do rascunho

Até 24/08 a Arte só devolvia de cinco status pré-produção: depois que a Gráfica
encostava na peça, ela precisava chamar um admin — justamente no caso em que
devolver mais importa, o arquivo errado descoberto depois da produção.

Hoje devolve de qualquer lugar, e o que sustenta a decisão é o que **não** muda:

* o único estado recusado é o próprio **Rascunho** (não há para onde devolver, e
  ainda zeraria os campos de aprovação);
* **nada de produção é apagado** — o status volta, o histórico fica;
* a trilha **marca** quando a peça veio de depois da Arte ("JÁ FORA DA ARTE"),
  senão ninguém entende, semanas depois, por que a fila da Gráfica perdeu uma
  linha;
* o **motivo é obrigatório**, com no mínimo 10 caracteres: "não" e "ruim" não
  dizem à Arte o que mudar, e uma devolução sem instrução é uma ida e volta
  garantida.

### Descancelar restaura em ordem de confiança

1. `statusBeforeCancel` — a coluna que o cancelamento grava desde 01/09;
2. a **trilha de auditoria** — a última linha "Status alterado: X → Y" anterior
   ao cancelamento (cobre as canceladas antes da coluna existir);
3. `requested` — sem pista nenhuma, volta ao início do fluxo.

Em todos os casos **a trilha diz qual das três valeu**. E a peça que estava *Em
Impressão* volta **Liberada**, não ocupando a impressora: outra peça pode ter
entrado na máquina enquanto esta esteve cancelada. O que já tinha sido impresso
é preservado em `quantityProduced`.

### Revogar aprovação reabre a decisão, não apaga o trabalho

Vale de **todo** status pós-aprovação (`POS_APROVACAO` em `shared/fluxo-peca.ts`),
não só do primeiro degrau — a peça incoerente anda (arquivo final → revisão →
devolvida) sem fechar a rodada por baixo. O arquivo final e o thumb que a Arte
já subiu **ficam**.

O corte no fim da lista é deliberado (dono, 25/08): **da liberação para a
produção em diante, a peça é chão de fábrica** — puxá-la de volta seria tirar
trabalho da mesa da Gráfica por uma decisão comercial. O Atendimento só revoga
na janela de aprovação/finalização; o admin revoga a linha em qualquer status,
mas a peça só reabre se estiver em `POS_APROVACAO`.

### A peça travada pela Solicitação

`POST /:id/travar` / `/destravar` (Solicitação e admin). A Gráfica **vê o
motivo** mas não destrava. Enquanto travada, informar impressas, conferir e
embalar são recusados com `code: PECA_TRAVADA`.

### "Book completo"

A peça-book (`type` casando `/book[\s_-]*completo/i`) existe só para o
patrocinador aprovar o conjunto pelo trâmite do Atendimento. Não é imprimível,
não tem m² real e não entra em prazo de produção: **só aparece no Atendimento**
(e na Correção da Arte quando reprovada) e no Detalhe do Evento, que é o
registro bruto. Some de Painel, Gráfica, Revisão, Prazos, Análises, Versões,
busca, etiquetas, relatório e digests.

---

## Divergências encontradas ao montar este documento

Estão aqui, e **não** foram "consertadas" na doc — o comportamento é o do
código; quem decide se o certo é a regra ou a implementação é o dono.

### 1. `PATCH /api/items/:id/deliver` não entrega mais nada

`shared/fluxo-peca.ts` documenta, no bloco `EMBALADO`:

> "A entrega individual (PATCH /deliver) segue aceitando `conferred` (peça
> grande que não vai em tubo) E `packed`."

O handler em `server/routes/items.ts` (~linha 5562) confere o papel, busca a
peça e responde **409 em todos os casos**:

> "Embale antes de entregar (Embalar pede a foto; a entrega pede só quem
> recebeu)"

Não há caminho de entrega individual: **toda** entrega passa por
`POST /api/tubos/:id/entregar`. A rota continua declarada em
`shared/permissoes.ts` e a peça grande que não vai em tubo precisa de uma
embalagem avulsa antes.

**A decidir:** a frase do `shared/` está velha (e é ela que muda), ou a entrega
individual deveria voltar para a peça grande?

### 2. `awaiting_approval` nunca é escrito — só lido

A etapa `awaiting_approval` lista dois status, mas **nenhum handler grava**
`"awaiting_approval"`: o valor vivo é sempre `awaiting_sponsor_approval`. O
primeiro sobrevive em sete lugares de LEITURA (`routes/events.ts`,
`routes/sponsors.ts`, `services/gestaoDigest.ts`, `services/prazo-domain.ts`) —
é legado de banco, e está certo continuar lendo.

Não é defeito; é o tipo de coisa que engana quem escreve filtro novo e copia a
lista de dois achando que os dois acontecem.

### 3. `PATCH /api/items/:id/approve` responde 410 e continua registrada

Não é divergência — é uma lápide deliberada ("Esta forma de liberar a peça foi
desativada. Use a Revisão Final"). Fica anotada aqui só para quem a encontrar
na lista de rotas não achar que é caminho vivo.
