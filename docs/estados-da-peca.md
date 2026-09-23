# Os estados da peça: quem move, e para onde

Montado a partir de `shared/fluxo-peca.ts` (as etapas canônicas),
`shared/permissoes.ts` (a régua de papéis) e de `shared/maquina-de-estados.ts`
(as transições, que as rotas em `server/routes/itens/`, `molde.ts`,
`sponsors.ts`, `events.ts` e `tubos.ts` seguem).

> O `admin` passa em todas as guardas deste documento. No texto ele é omitido;
> na tabela gerada ele aparece em cada linha.

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

A tabela abaixo é `TRANSICOES`, de `shared/maquina-de-estados.ts` — é de lá
que as rotas leem de onde cada ação pode partir, e
`server/__tests__/maquina-de-estados-conformidade.test.ts` roda os handlers
reais conferindo, status a status, que aceitam e recusam o que ela diz.
Restaurar da lixeira (`POST /:id/restore`, só admin) não é transição: a peça
volta com o status que tinha.

<!-- gerado:inicio — scripts/gerar-doc-estados-da-peca.ts, a partir de shared/maquina-de-estados.ts. Não edite à mão: mude a tabela e rode o script. -->

Cada linha é um desfecho: de onde a peça sai, para onde vai e quem pode (aqui o
admin aparece com todos). As condições são o que a rota confere além do status e
do papel. "Fica onde está" = a ação mexe em outra coisa (a linha do
patrocinador, o reaproveitamento) e a peça não muda de status.

### POST /api/events/:id/items/submit

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| enviar-lista-para-vinculacao | `draft`, `requested` | `awaiting_linking` | admin, solicitacao | evento aberto (nem encerrado nem já realizado); peça do Kit só por quem a criou |
| enviar-molde-da-lista | `draft`, `requested` | `awaiting_submission` | admin, solicitacao | evento aberto (nem encerrado nem já realizado); molde: não tem patrocinador, pula a vinculação |

### POST /api/items/:id/sponsors/sync

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| vincular-patrocinadores | `requested`, `awaiting_linking` | fica onde está | admin, arte, atendimento, solicitacao | evento aberto (nem encerrado nem já realizado); molde não recebe patrocinador |

### POST /api/items/send-to-arte

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| enviar-para-a-arte | `awaiting_linking` | `awaiting_submission` | admin, arte, atendimento, solicitacao | evento aberto (nem encerrado nem já realizado); patrocinador vinculado, ou "sem aprovação", reaproveitamento ou molde |

### POST /api/items/:id/return-to-creation

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| voltar-para-a-criacao | `draft`, `requested`, `awaiting_linking`, `awaiting_submission` | `draft` | admin, arte, atendimento, solicitacao | evento aberto (nem encerrado nem já realizado); os vínculos de patrocinador são apagados |

### PATCH /api/items/:id/submit-for-approval

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| enviar-para-aprovacao | `awaiting_submission` | `awaiting_sponsor_approval` | arte, admin | evento aberto (nem encerrado nem já realizado); thumb enviado pelo app; tem patrocinador vinculado e não é isenta de aprovação |
| enviar-direto-para-finalizacao | `awaiting_submission` | `awaiting_creator_review` | arte, admin | evento aberto (nem encerrado nem já realizado); thumb enviado pelo app; sem patrocinador vinculado, ou isenta de aprovação |
| enviar-molde-para-revisao | `awaiting_submission` | `awaiting_final_review` | arte, admin | evento aberto (nem encerrado nem já realizado); thumb enviado pelo app; molde: sem aprovação nem finalização |

### PATCH /api/items/:id/sponsor-approve

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| aprovar-peca-inteira | `awaiting_sponsor_approval` | `sponsor_approved` | atendimento, admin | evento aberto (nem encerrado nem já realizado); todas as linhas de patrocinador viram aprovadas |

### POST /api/items/:id/sponsor-approvals/:sponsorId/approve

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| aprovar-o-ultimo-patrocinador | `awaiting_sponsor_approval` | `sponsor_approved` | atendimento, admin | evento aberto (nem encerrado nem já realizado); patrocinador vinculado à peça e não esperando versão nova da Arte; com ele, todos os vinculados aprovaram |
| aprovar-um-patrocinador | `awaiting_sponsor_approval` | fica onde está | atendimento, admin | evento aberto (nem encerrado nem já realizado); patrocinador vinculado à peça e não esperando versão nova da Arte; ainda falta patrocinador aprovar |

### POST /api/items/:id/sponsor-approvals/:sponsorId/reject

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| reprovar-por-patrocinador | `awaiting_sponsor_approval` | fica onde está | atendimento, admin | evento aberto (nem encerrado nem já realizado); motivo com pelo menos 10 caracteres; a linha do patrocinador vai para "aguardando a Arte"; desaprovadores estritos perdem a aprovação |

### POST /api/items/:id/sponsor-approvals/resubmit

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| reenviar-nova-versao | `awaiting_sponsor_approval` | fica onde está | arte, admin | evento aberto (nem encerrado nem já realizado); thumb enviado pelo app; vai para todo patrocinador que ainda não aprovou |

### POST /api/items/:id/sponsor-approvals/:sponsorId/revert

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| revogar-aprovacao | `sponsor_approved` | `awaiting_sponsor_approval` | admin, atendimento | evento aberto (nem encerrado nem já realizado); a linha do patrocinador volta a pendente; o arquivo final fica |
| revogar-aprovacao | `awaiting_finalization`, `awaiting_creator_review`, `awaiting_final_review`, `awaiting_review`, `in_review` | `awaiting_sponsor_approval` | admin | evento aberto (nem encerrado nem já realizado); a linha do patrocinador volta a pendente; o arquivo final fica |
| revogar-aprovacao | `awaiting_sponsor_approval` | fica onde está | admin, atendimento | evento aberto (nem encerrado nem já realizado); só a linha do patrocinador volta a pendente |
| revogar-aprovacao | qualquer status, menos `sponsor_approved`, `awaiting_finalization`, `awaiting_creator_review`, `awaiting_final_review`, `awaiting_review`, `in_review`, `awaiting_sponsor_approval` | fica onde está | admin | evento aberto (nem encerrado nem já realizado); correção de admin: só a linha do patrocinador volta a pendente |

### POST /api/items/bulk-add-sponsor

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| reabrir-ao-acrescentar-patrocinador | `sponsor_approved`, `awaiting_finalization`, `awaiting_creator_review`, `awaiting_final_review`, `awaiting_review`, `in_review` | `awaiting_sponsor_approval` | admin, solicitacao | evento aberto (nem encerrado nem já realizado); só o patrocinador novo decide; os demais seguem aprovados |

### DELETE /api/items/:itemId/sponsors/:sponsorId · DELETE /api/events/:eventId/sponsors/:sponsorId

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| cancelar-ao-tirar-o-ultimo-patrocinador | qualquer status, menos `ready_for_production`, `approved`, `inProduction`, `produced`, `conferred`, `packed`, `delivered`, `canceled`, `archived` | `canceled` | admin, arte, atendimento, solicitacao | o patrocinador desvinculado era o único da peça |
| fechar-rodada-ao-tirar-patrocinador-pendente | `awaiting_sponsor_approval`, `awaiting_approval` | `sponsor_approved` | admin, arte, atendimento, solicitacao | o patrocinador desvinculado estava pendente e os que restam já aprovaram |

### PATCH /api/items/:id/dispense

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| dispensar-aprovacao | `awaiting_submission`, `awaiting_sponsor_approval` | `awaiting_creator_review` | arte, admin | evento aberto (nem encerrado nem já realizado); motivo com pelo menos 10 caracteres; molde não passa por aprovação |

### PATCH /api/items/:id/submit-final-file

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| enviar-arquivo-final | `sponsor_approved`, `awaiting_creator_review` | `awaiting_final_review` | arte, admin | evento aberto (nem encerrado nem já realizado) |

### PATCH /api/items/:id/update-thumb

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| trocar-thumb-aprovado | `sponsor_approved` | `awaiting_sponsor_approval` | arte, admin | evento aberto (nem encerrado nem já realizado); motivo da troca; um patrocinador desaprovador (aprovação estrita) tinha aprovado — ele vê a versão nova |

### PATCH /api/items/:id/update-final-file

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| trocar-arquivo-final-liberado | `ready_for_production`, `pronto_para_producao`, `approved`, `liberado`, `inProduction`, `em_producao` | `awaiting_final_review` | arte, admin | evento aberto (nem encerrado nem já realizado); peça não travada pela Solicitação; nenhuma unidade produzida — a liberação valia para o arquivo anterior |

### PATCH /api/items/:id/creator-review

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| liberar-para-producao | `awaiting_final_review` | `ready_for_production` | solicitacao, admin | evento aberto (nem encerrado nem já realizado); arquivo final enviado (molde dispensa); peça travada: dizer se destrava ou mantém a trava |
| liberar-com-reaproveitamento-total | `awaiting_final_review` | `produced` | solicitacao, admin | evento aberto (nem encerrado nem já realizado); reaproveitamento da quantidade inteira — não imprime nada |
| liberar-o-que-ja-foi-liberado | `ready_for_production`, `approved`, `pronto_para_producao`, `liberado`, `inProduction`, `em_producao`, `produced`, `produzido`, `conferred`, `packed`, `delivered`, `entregue` | fica onde está | solicitacao, admin | evento aberto (nem encerrado nem já realizado); clique repetido: responde a peça como está |

### PATCH /api/items/:id/return-to-arte · PATCH /api/items/bulk-return-to-arte

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| devolver-para-a-arte | `awaiting_final_review` | `awaiting_submission` | solicitacao, admin | evento aberto (nem encerrado nem já realizado); motivo com pelo menos 10 caracteres; destino "arte" (refazer a arte) — molde volta sempre para cá |
| devolver-para-a-finalizacao | `awaiting_final_review` | `sponsor_approved` | solicitacao, admin | evento aberto (nem encerrado nem já realizado); motivo com pelo menos 10 caracteres; destino "finalização" (trocar o arquivo final) com a rodada de aprovação fechada |
| devolver-para-a-aprovacao | `awaiting_final_review` | `awaiting_sponsor_approval` | solicitacao, admin | evento aberto (nem encerrado nem já realizado); motivo com pelo menos 10 caracteres; destino "finalização", mas com patrocinador ainda pendente |

### PATCH /api/items/:id/arte-reject

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| devolver-ao-solicitante | qualquer status, menos `draft` | `draft` | arte, admin | evento aberto (nem encerrado nem já realizado); motivo com pelo menos 10 caracteres; de depois da Arte a trilha marca "JÁ FORA DA ARTE" |

### PATCH /api/items/:id/return-to-review

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| devolver-para-a-revisao | `ready_for_production`, `pronto_para_producao`, `approved`, `liberado` | `awaiting_final_review` | grafica, admin | evento aberto (nem encerrado nem já realizado); motivo com pelo menos 10 caracteres; nenhuma unidade impressa |

### PATCH /api/items/:id/cancel · PATCH /api/items/bulk-cancel

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| cancelar | qualquer status | `canceled` | solicitacao, arte, admin | evento aberto (nem encerrado nem já realizado); complementos sem material vão junto |

### PATCH /api/items/:id/uncancel

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| descancelar | `canceled` | volta para onde estava | admin | evento aberto (nem encerrado nem já realizado); volta ao status de antes (coluna → trilha → Solicitado); de impressão, volta liberada e no topo da fila |

### PATCH /api/items/:id/start-printing

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| iniciar-impressao | `ready_for_production`, `pronto_para_producao`, `approved`, `liberado`, `inProduction`, `em_producao` | `inProduction` | grafica, admin | evento aberto (nem encerrado nem já realizado); peça não travada pela Solicitação; molde não vai para a impressora; há o que imprimir; impressora livre |

### PATCH /api/items/:id/start-production

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| concluir-impressao | `inProduction`, `em_producao` | `produced` | grafica, admin | evento aberto (o realizado aceita informar o que já estava na impressora); peça não travada pela Solicitação; impressas + reaproveitadas cobrem a quantidade |
| informar-impressas-parcial | `inProduction`, `em_producao` | `inProduction` | grafica, admin | evento aberto (o realizado aceita informar o que já estava na impressora); peça não travada pela Solicitação; ainda falta imprimir |
| esvaziar-impressoras | `inProduction`, `em_producao` | `ready_for_production` | grafica, admin | peça dividida entre impressoras: a última parte ativa acabou sem fechar a peça |

### POST /api/items/:id/mark-reuse

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| reaproveitar-o-que-falta | `ready_for_production`, `pronto_para_producao`, `approved`, `inProduction`, `em_producao` | `produced` | grafica, admin, solicitacao | evento aberto (nem encerrado nem já realizado); peça não travada pela Solicitação; reaproveitadas + impressas cobrem a quantidade |
| reaproveitar-parte | `ready_for_production`, `pronto_para_producao`, `approved`, `inProduction`, `em_producao` | fica onde está | grafica, admin, solicitacao | evento aberto (nem encerrado nem já realizado); peça não travada pela Solicitação; ainda sobra o que imprimir |
| ajustar-reaproveitamento-da-produzida | `produced`, `produzido` | `produced` | admin, solicitacao | evento aberto (nem encerrado nem já realizado); peça não travada pela Solicitação; nada conferido nem entregue — converte impressas em reaproveitadas e vice-versa |

### POST /api/items/:id/correct-reuse

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| corrigir-reaproveitamento-para-a-fila | `produced`, `produzido` | `ready_for_production` | grafica, solicitacao, admin | evento aberto (nem encerrado nem já realizado); nada conferido, entregue ou embalado; sobra o que imprimir |
| corrigir-reaproveitamento-para-a-fila | qualquer status, menos `awaiting_final_review`, `awaiting_review`, `in_review`, `produced`, `produzido` | `ready_for_production` | admin | evento aberto (nem encerrado nem já realizado); o admin corrige em qualquer etapa antes da conferência; sobra o que imprimir |
| corrigir-para-reaproveitamento-total | qualquer status, menos `awaiting_final_review`, `awaiting_review`, `in_review` | `produced` | admin | evento aberto (nem encerrado nem já realizado); peça não travada pela Solicitação; nada conferido, entregue ou embalado; só o admin alcança o total (Gráfica e Solicitação corrigem até quantidade − 1) |

### POST /api/items/:id/confer

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| conferir-tudo | qualquer status, menos `awaiting_final_review`, `awaiting_review`, `in_review`, `delivered`, `entregue`, `canceled`, `archived`, `deleted` | `conferred` | grafica, solicitacao, admin | peça não travada pela Solicitação; foto da conferência; molde não passa por conferência; confere a quantidade inteira |
| conferir-tudo-ja-embalado | qualquer status, menos `awaiting_final_review`, `awaiting_review`, `in_review`, `delivered`, `entregue`, `canceled`, `archived`, `deleted` | `packed` | grafica, solicitacao, admin | peça não travada pela Solicitação; foto da conferência; fecha a conferência com tudo já embalado |
| conferir-parte | qualquer status, menos `awaiting_final_review`, `awaiting_review`, `in_review`, `delivered`, `entregue`, `canceled`, `archived`, `deleted` | fica onde está | grafica, solicitacao, admin | peça não travada pela Solicitação; foto da conferência; ainda falta conferir |

### PATCH /api/tubos/:id/itens

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| embalar | `produced`, `produzido`, `conferred`, `conferido`, `packed` | `packed` | admin, grafica, solicitacao | peça não travada pela Solicitação; a quantidade inteira conferida e embalada |

### PATCH /api/tubos/:id/itens · DELETE /api/tubos/:id

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| tirar-do-tubo | `packed` | `conferred` | admin, grafica, solicitacao | a peça sai do volume (ou o volume é apagado) |

### POST /api/tubos/:id/entregar

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| entregar-volume | `produced`, `produzido`, `conferred`, `conferido`, `packed` | `delivered` | admin, grafica, solicitacao | o volume entregue completa a quantidade da peça |

### PATCH /api/items/:id/molde-produzido

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| marcar-molde-produzido | `ready_for_production`, `pronto_para_producao`, `approved`, `liberado` | `produced` | grafica, admin | evento aberto (nem encerrado nem já realizado); peça não travada pela Solicitação; é molde |
| marcar-molde-ja-produzido | `produced`, `produzido` | fica onde está | grafica, admin | é molde; clique repetido: responde a peça como está |

### PATCH /api/items/:id/molde-voltar-liberado

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| desfazer-molde-produzido | `produced`, `produzido` | `ready_for_production` | grafica, admin | evento aberto (nem encerrado nem já realizado); peça não travada pela Solicitação; é molde; nada conferido, embalado ou entregue |
| desfazer-molde-ja-liberado | `ready_for_production`, `pronto_para_producao`, `approved`, `liberado` | fica onde está | grafica, admin | é molde; clique repetido: responde a peça como está |

### POST /api/items/:id/complement

| Ação | De | Para | Quem | Condições |
| --- | --- | --- | --- | --- |
| criar-complemento | `inProduction`, `em_producao`, `produced`, `produzido`, `conferred`, `packed`, `delivered`, `entregue` | fica onde está | admin, solicitacao | evento aberto (nem encerrado nem já realizado); a peça-mãe não muda: nasce uma peça nova (o complemento) já liberada para produção; não é ela mesma um complemento |

<!-- gerado:fim -->

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

O handler em `server/routes/itens/conferencia.ts` confere o papel, busca a
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
