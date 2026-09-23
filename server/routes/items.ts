// ─────────────────────────────────────────────────────────────────────────────
// ROTAS DA PEÇA — o índice. Os handlers moram em server/routes/itens/, um
// arquivo por assunto; aqui fica só a ORDEM em que entram no Express.
//
// A ordem importa: o Express entrega a requisição à PRIMEIRA rota que casa.
// `/api/items/pending`, `/approved` e as outras leituras vêm antes de
// `GET /api/items/:eventId` (senão "pending" vira id de evento), e o
// `PATCH /api/items/:id` desvia com next() os `bulk-*`, registrados depois
// dele. Trocou a ordem abaixo, ordem-das-rotas-de-itens.test.ts quebra.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { registrarListaEExcluidas, registrarFilasEPorEvento } from "./itens/leitura";
import { registrarRestauracao, registrarExclusao } from "./itens/exclusao";
import { registrarEtiquetasImpressas } from "./itens/etiquetas";
import { registrarCriacao, registrarClonagem } from "./itens/criacao";
import { registrarPlanilha } from "./itens/planilha";
import { registrarEdicao } from "./itens/edicao";
import { registrarTransferencia } from "./itens/transferencia";
import { registrarComplemento } from "./itens/complemento";
import { registrarAprovacao } from "./itens/aprovacao";
import { registrarArte } from "./itens/arte";
import { registrarRevisao } from "./itens/revisao";
import { registrarCancelamento } from "./itens/cancelamento";
import { registrarRotasDeImpressao, registrarRotaAposentadaDeProducao } from "./itens/impressao";
import { registrarReaproveitamento } from "./itens/reaproveitamento";
import { registrarConferencia } from "./itens/conferencia";
import { registrarBook } from "./itens/book";
import { registrarAvisos } from "./itens/avisos";

// A guarda "evento finalizado não recebe trabalho" (constantes de erro,
// motivoEventoFechado/erroEventoFechado, motivoEventoDaPeca,
// barraEventoFinalizado, contadorDeBloqueio) mora em ./eventoFinalizado, não
// aqui. Motivo: aquele módulo também é importado por server/routes/events.ts
// (POST /api/events/:id/items/submit), e este arquivo (items.ts) importa os
// serviços de planilha (xlsxImport/xlsxExport → pacote `exceljs`). Se a guarda
// continuasse definida aqui, events.ts passaria a herdar essa árvore inteira
// só para checar se um evento acabou — e os testes puros de events.ts
// (event-status-derivado.test.ts, event-encerramento.test.ts) quebrariam num
// ambiente sem `exceljs` instalado, coisa que já aconteceu neste repo. O
// re-export abaixo existe só para não obrigar quem já importa estes nomes
// DAQUI (server/routes/sponsors.ts, os testes) a trocar de arquivo.
export {
  EVENTO_ENCERRADO_ERRO,
  EVENTO_REALIZADO_ERRO,
  motivoEventoFechado,
  erroEventoFechado,
  motivoEventoDaPeca,
  barraEventoFinalizado,
  contadorDeBloqueio,
} from "./eventoFinalizado";
// Quem já importava estes nomes DAQUI (rotas irmãs, scripts, testes) segue importando.
export { CANCELAR_MAE_CANCELA_COMPLEMENTOS_NAO_PRODUZIDOS, complementoSemMaterial } from "./itens/cancelamento";
export {
  destinatariosDoEvento, USAR_EXECUTIVOS_DO_EVENTO, PAPEIS_QUE_RECEBEM, DESTINATARIOS_NOMEADOS,
  destinatariosPorPapel, destinatariosNomeados, avisarBookPorEmail,
} from "./itens/book";
export { MOTIVO_REVOGACAO_PREFIXO, revogarAprovacoesEstritas } from "./itens/comum";

export function registerItemRoutes(app: Express): void {
  registrarListaEExcluidas(app); // GET /api/items, GET /api/items/deleted
  registrarRestauracao(app); // POST /api/items/:id/restore
  registrarEtiquetasImpressas(app); // POST /api/items/labels-printed
  registrarFilasEPorEvento(app); // GET pending, resubmission-needed, approved, batch-approval-data e :eventId (este por último)
  registrarCriacao(app); // POST /api/items, POST /api/items/bulk
  registrarPlanilha(app); // exportar e importar planilha
  registrarClonagem(app); // POST /api/events/:id/clone-items
  registrarEdicao(app); // PATCH /api/items/:id (desvia bulk-* com next)
  registrarTransferencia(app); // POST /api/items/:id/transfer-event
  registrarExclusao(app); // DELETE /api/items/:id
  registrarComplemento(app); // POST e DELETE /api/items/:id/complement
  registrarAprovacao(app); // envio para aprovação, aprovação, dispensa e aprovações por patrocinador
  registrarArte(app); // arquivo final e troca de thumb
  registrarRevisao(app); // Revisão Final: liberar e devolver (inclusive em lote)
  registrarCancelamento(app); // cancelar, descancelar e cancelar em lote
  registrarRotasDeImpressao(app); // approve (410), start-printing, start-production
  registrarReaproveitamento(app); // mark-reuse, correct-reuse
  registrarConferencia(app); // confer, deliver (aposentada)
  registrarBook(app); // POST /api/events/:eventId/book e /book/notify
  registrarAvisos(app); // digests e a tela de Notificações do admin
  registrarRotaAposentadaDeProducao(app); // POST /api/items/:id/production (410)
}
