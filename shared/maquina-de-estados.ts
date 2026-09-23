// ─────────────────────────────────────────────────────────────────────────────
// A MÁQUINA DE ESTADOS DA PEÇA, DECLARADA — de onde a peça sai, para onde vai,
// por qual gesto e quem pode fazê-lo.
//
// Antes disto a resposta estava em dezenas de `if (status !== …)` espalhados
// pelas rotas. A tabela abaixo foi escrita a partir do que o código FAZ (não
// do que deveria fazer): as rotas de peça passam a ler daqui o "de onde pode
// vir", e `maquina-de-estados-conformidade.test.ts` roda os handlers reais,
// status a status, conferindo que aceitam e recusam exatamente o que a tabela
// diz. A documentação (docs/estados-da-peca.md) é gerada daqui pelo script
// scripts/gerar-doc-estados-da-peca.ts — e um teste quebra se ela envelhecer.
//
// O QUE A TABELA DIZ: o recorte por STATUS e por PAPEL. O resto das regras
// (evento finalizado, trava da Solicitação, quantidades, arquivo final) segue
// nas rotas e nos módulos de shared/ — a tabela os cita em `condicoes`, para
// quem lê, sem pretender executá-los.
//
// Uma linha por DESFECHO: um gesto que leva a destinos diferentes conforme a
// condição (enviar a arte vai para a aprovação, para a finalização ou, no
// molde, para a revisão) vira uma linha por destino, e cada ação tem um
// destino só — `proximoStatus` é uma função, não um palpite.
// ─────────────────────────────────────────────────────────────────────────────
import type { Papel } from "./permissoes";
import { DISPENSAVEIS, DESTINO_DA_DISPENSA, POS_APROVACAO, EM_REVISAO, DEPOIS_DA_ARTE, PODE_IR_PARA_TUBO } from "./fluxo-peca";
import { DESTINO_DO_ENVIO_DO_MOLDE, MOLDE_LIBERADO } from "./molde";
import { ARTE_DECIDE_NA_REVISAO } from "./troca-de-material";

/** Status gravado na peça — os canônicos e as grafias legadas que o banco ainda tem. */
export type StatusDaPeca = string;

/** Destino que não é um status fixo: a peça não muda, ou volta para onde estava. */
export const FICA_ONDE_ESTA = "mesmo" as const;
export const VOLTA_PARA_ONDE_ESTAVA = "anterior" as const;
export type Destino = StatusDaPeca | typeof FICA_ONDE_ESTA | typeof VOLTA_PARA_ONDE_ESTAVA;

/** Uma lista de status, ou "qualquer status, menos estes". */
export type Origem = readonly StatusDaPeca[] | { readonly todosMenos: readonly StatusDaPeca[] };

export type AcaoDaPeca =
  | "enviar-lista-para-vinculacao" | "enviar-molde-da-lista" | "vincular-patrocinadores"
  | "enviar-para-a-arte" | "voltar-para-a-criacao"
  | "enviar-para-aprovacao" | "enviar-direto-para-finalizacao" | "enviar-molde-para-revisao"
  | "aprovar-peca-inteira" | "aprovar-o-ultimo-patrocinador" | "aprovar-um-patrocinador"
  | "reprovar-por-patrocinador" | "reenviar-nova-versao" | "revogar-aprovacao"
  | "reabrir-ao-acrescentar-patrocinador" | "cancelar-ao-tirar-o-ultimo-patrocinador"
  | "fechar-rodada-ao-tirar-patrocinador-pendente"
  | "dispensar-aprovacao" | "enviar-arquivo-final" | "trocar-thumb-aprovado" | "trocar-arquivo-final-liberado"
  | "liberar-para-producao" | "liberar-com-reaproveitamento-total" | "liberar-o-que-ja-foi-liberado"
  | "devolver-para-a-arte" | "devolver-para-a-finalizacao" | "devolver-para-a-aprovacao"
  | "devolver-ao-solicitante" | "devolver-para-a-revisao"
  | "cancelar" | "descancelar"
  | "iniciar-impressao" | "concluir-impressao" | "informar-impressas-parcial" | "esvaziar-impressoras"
  | "reaproveitar-o-que-falta" | "reaproveitar-parte" | "ajustar-reaproveitamento-da-produzida"
  | "corrigir-reaproveitamento-para-a-fila" | "corrigir-para-reaproveitamento-total"
  | "conferir-tudo" | "conferir-tudo-ja-embalado" | "conferir-parte"
  | "marcar-molde-produzido" | "marcar-molde-ja-produzido" | "desfazer-molde-produzido" | "desfazer-molde-ja-liberado"
  | "embalar" | "tirar-do-tubo" | "entregar-volume"
  | "criar-complemento";

export interface Transicao {
  acao: AcaoDaPeca;
  /** De onde a peça pode sair por esta ação. */
  de: Origem;
  /** Para onde vai. `mesmo` = o status não muda (o gesto mexe em outra coisa). */
  para: Destino;
  /** Quem pode. Recorte por papel da ROTA (ver shared/permissoes.ts). */
  papeis: readonly Papel[];
  /** O que mais a rota exige, em frase de gente (não é executado daqui). */
  condicoes: readonly string[];
  /** As rotas que fazem este gesto ("VERBO /caminho"). */
  rotas: readonly string[];
}

// ─── As listas de origem que mais de uma linha usa ──────────────────────────
/** Liberada para a Gráfica, ainda sem impressora. */
export const LIBERADA: readonly StatusDaPeca[] = ["ready_for_production", "pronto_para_producao", "approved", "liberado"];
/** Na impressora. */
export const EM_IMPRESSAO: readonly StatusDaPeca[] = ["inProduction", "em_producao"];
/** Liberada ou na impressora — pode ir (ou trocar de) máquina. */
export const PODE_IR_PARA_A_MAQUINA: readonly StatusDaPeca[] = [...LIBERADA, ...EM_IMPRESSAO];
/** Produzida (impressa ou reaproveitada), antes da conferência. */
export const PRODUZIDA: readonly StatusDaPeca[] = ["produced", "produzido"];
/** Revisão Final: clicar "Liberar" aqui de novo não é erro (lista desatualizada, clique duplo). */
export const JA_LIBERADA: readonly StatusDaPeca[] = [
  "ready_for_production", "approved", "pronto_para_producao", "liberado",
  "inProduction", "em_producao", "produced", "produzido", "conferred", "packed", "delivered", "entregue",
];
/** Onde o reaproveitamento pode ser marcado pela Gráfica (antes de produzida). */
export const REAPROVEITAVEL: readonly StatusDaPeca[] = ["ready_for_production", "pronto_para_producao", "approved", ...EM_IMPRESSAO];
/** Fora da conferência: o fim do fluxo e o que saiu do funil. */
export const FORA_DA_CONFERENCIA: readonly StatusDaPeca[] = ["delivered", "entregue", "canceled", "archived", "deleted"];
/** Onde o atendimento pode revogar/reverter uma decisão de patrocinador. */
export const REVOGAVEL_PELO_ATENDIMENTO: readonly StatusDaPeca[] = ["awaiting_sponsor_approval", "sponsor_approved"];
/** Na fase de vinculação (reescrever patrocinadores). */
export const EM_VINCULACAO: readonly StatusDaPeca[] = ["requested", "awaiting_linking"];
/** Ainda não saiu da criação/vinculação — pode voltar para a Criação. */
export const ANTES_DA_ARTE: readonly StatusDaPeca[] = ["draft", "requested", "awaiting_linking", "awaiting_submission"];
/** Onde a peça pode ser complementada (aumento depois de entrar em produção). */
export const COMPLEMENTAVEL: readonly StatusDaPeca[] = [
  "inProduction", "em_producao", "produced", "produzido",
  "conferred", "packed", "delivered", "entregue",
];

const EM_APROVACAO: readonly StatusDaPeca[] = ["awaiting_sponsor_approval"];
const POS_APROVACAO_SEM_FINALIZACAO = POS_APROVACAO.filter((s) => s !== "sponsor_approved");
const QUEM_DECIDE_NA_REVISAO: readonly Papel[] = ARTE_DECIDE_NA_REVISAO ? ["solicitacao", "admin", "arte"] : ["solicitacao", "admin"];
const CONFERIVEL: Origem = { todosMenos: [...Array.from(EM_REVISAO), ...FORA_DA_CONFERENCIA] };

const EVENTO_ABERTO = "evento aberto (nem encerrado nem já realizado)";
const NAO_TRAVADA = "peça não travada pela Solicitação";
const MOTIVO = "motivo com pelo menos 10 caracteres";

const ROTA = {
  submitLista: "POST /api/events/:id/items/submit",
  sync: "POST /api/items/:id/sponsors/sync",
  enviarArte: "POST /api/items/send-to-arte",
  voltarCriacao: "POST /api/items/:id/return-to-creation",
  submit: "PATCH /api/items/:id/submit-for-approval",
  sponsorApprove: "PATCH /api/items/:id/sponsor-approve",
  aprovar: "POST /api/items/:id/sponsor-approvals/:sponsorId/approve",
  reprovar: "POST /api/items/:id/sponsor-approvals/:sponsorId/reject",
  revogar: "POST /api/items/:id/sponsor-approvals/:sponsorId/revert",
  reenviar: "POST /api/items/:id/sponsor-approvals/resubmit",
  acrescentar: "POST /api/items/bulk-add-sponsor",
  tirarDaPeca: "DELETE /api/items/:itemId/sponsors/:sponsorId",
  tirarDoEvento: "DELETE /api/events/:eventId/sponsors/:sponsorId",
  dispensar: "PATCH /api/items/:id/dispense",
  arquivoFinal: "PATCH /api/items/:id/submit-final-file",
  trocarThumb: "PATCH /api/items/:id/update-thumb",
  trocarArquivo: "PATCH /api/items/:id/update-final-file",
  liberar: "PATCH /api/items/:id/creator-review",
  devolverArte: "PATCH /api/items/:id/return-to-arte",
  devolverArteLote: "PATCH /api/items/bulk-return-to-arte",
  devolverSolicitante: "PATCH /api/items/:id/arte-reject",
  devolverRevisao: "PATCH /api/items/:id/return-to-review",
  cancelar: "PATCH /api/items/:id/cancel",
  cancelarLote: "PATCH /api/items/bulk-cancel",
  descancelar: "PATCH /api/items/:id/uncancel",
  imprimir: "PATCH /api/items/:id/start-printing",
  impressas: "PATCH /api/items/:id/start-production",
  reaproveitar: "POST /api/items/:id/mark-reuse",
  corrigirReuso: "POST /api/items/:id/correct-reuse",
  conferir: "POST /api/items/:id/confer",
  moldeProduzido: "PATCH /api/items/:id/molde-produzido",
  moldeDesfazer: "PATCH /api/items/:id/molde-voltar-liberado",
  embalar: "PATCH /api/tubos/:id/itens",
  apagarTubo: "DELETE /api/tubos/:id",
  entregarTubo: "POST /api/tubos/:id/entregar",
  complemento: "POST /api/items/:id/complement",
} as const;

export const TRANSICOES: readonly Transicao[] = [
  // ── Criação e vinculação ─────────────────────────────────────────────────
  { acao: "enviar-lista-para-vinculacao", de: ["draft", "requested"], para: "awaiting_linking", papeis: ["admin", "solicitacao"],
    condicoes: [EVENTO_ABERTO, "peça do Kit só por quem a criou"], rotas: [ROTA.submitLista] },
  { acao: "enviar-molde-da-lista", de: ["draft", "requested"], para: "awaiting_submission", papeis: ["admin", "solicitacao"],
    condicoes: [EVENTO_ABERTO, "molde: não tem patrocinador, pula a vinculação"], rotas: [ROTA.submitLista] },
  { acao: "vincular-patrocinadores", de: EM_VINCULACAO, para: FICA_ONDE_ESTA, papeis: ["admin", "arte", "atendimento", "solicitacao"],
    condicoes: [EVENTO_ABERTO, "molde não recebe patrocinador"], rotas: [ROTA.sync] },
  { acao: "enviar-para-a-arte", de: ["awaiting_linking"], para: "awaiting_submission", papeis: ["admin", "arte", "atendimento", "solicitacao"],
    condicoes: [EVENTO_ABERTO, "patrocinador vinculado, ou \"sem aprovação\", reaproveitamento ou molde"], rotas: [ROTA.enviarArte] },
  { acao: "voltar-para-a-criacao", de: ANTES_DA_ARTE, para: "draft", papeis: ["admin", "arte", "atendimento", "solicitacao"],
    condicoes: [EVENTO_ABERTO, "os vínculos de patrocinador são apagados"], rotas: [ROTA.voltarCriacao] },

  // ── Arte e aprovação do patrocinador ─────────────────────────────────────
  { acao: "enviar-para-aprovacao", de: ["awaiting_submission"], para: "awaiting_sponsor_approval", papeis: ["arte", "admin"],
    condicoes: [EVENTO_ABERTO, "thumb enviado pelo app", "tem patrocinador vinculado e não é isenta de aprovação"], rotas: [ROTA.submit] },
  { acao: "enviar-direto-para-finalizacao", de: ["awaiting_submission"], para: "awaiting_creator_review", papeis: ["arte", "admin"],
    condicoes: [EVENTO_ABERTO, "thumb enviado pelo app", "sem patrocinador vinculado, ou isenta de aprovação"], rotas: [ROTA.submit] },
  { acao: "enviar-molde-para-revisao", de: ["awaiting_submission"], para: DESTINO_DO_ENVIO_DO_MOLDE, papeis: ["arte", "admin"],
    condicoes: [EVENTO_ABERTO, "thumb enviado pelo app", "molde: sem aprovação nem finalização"], rotas: [ROTA.submit] },
  { acao: "aprovar-peca-inteira", de: EM_APROVACAO, para: "sponsor_approved", papeis: ["atendimento", "admin"],
    condicoes: [EVENTO_ABERTO, "todas as linhas de patrocinador viram aprovadas"], rotas: [ROTA.sponsorApprove] },
  { acao: "aprovar-o-ultimo-patrocinador", de: EM_APROVACAO, para: "sponsor_approved", papeis: ["atendimento", "admin"],
    condicoes: [EVENTO_ABERTO, "patrocinador vinculado à peça e não esperando versão nova da Arte", "com ele, todos os vinculados aprovaram"], rotas: [ROTA.aprovar] },
  { acao: "aprovar-um-patrocinador", de: EM_APROVACAO, para: FICA_ONDE_ESTA, papeis: ["atendimento", "admin"],
    condicoes: [EVENTO_ABERTO, "patrocinador vinculado à peça e não esperando versão nova da Arte", "ainda falta patrocinador aprovar"], rotas: [ROTA.aprovar] },
  { acao: "reprovar-por-patrocinador", de: EM_APROVACAO, para: FICA_ONDE_ESTA, papeis: ["atendimento", "admin"],
    condicoes: [EVENTO_ABERTO, MOTIVO, "a linha do patrocinador vai para \"aguardando a Arte\"; desaprovadores estritos perdem a aprovação"], rotas: [ROTA.reprovar] },
  { acao: "reenviar-nova-versao", de: EM_APROVACAO, para: FICA_ONDE_ESTA, papeis: ["arte", "admin"],
    condicoes: [EVENTO_ABERTO, "thumb enviado pelo app", "vai para todo patrocinador que ainda não aprovou"], rotas: [ROTA.reenviar] },
  { acao: "revogar-aprovacao", de: ["sponsor_approved"], para: "awaiting_sponsor_approval", papeis: ["admin", "atendimento"],
    condicoes: [EVENTO_ABERTO, "a linha do patrocinador volta a pendente; o arquivo final fica"], rotas: [ROTA.revogar] },
  { acao: "revogar-aprovacao", de: POS_APROVACAO_SEM_FINALIZACAO, para: "awaiting_sponsor_approval", papeis: ["admin"],
    condicoes: [EVENTO_ABERTO, "a linha do patrocinador volta a pendente; o arquivo final fica"], rotas: [ROTA.revogar] },
  { acao: "revogar-aprovacao", de: EM_APROVACAO, para: FICA_ONDE_ESTA, papeis: ["admin", "atendimento"],
    condicoes: [EVENTO_ABERTO, "só a linha do patrocinador volta a pendente"], rotas: [ROTA.revogar] },
  { acao: "revogar-aprovacao", de: { todosMenos: [...POS_APROVACAO, ...EM_APROVACAO] }, para: FICA_ONDE_ESTA, papeis: ["admin"],
    condicoes: [EVENTO_ABERTO, "correção de admin: só a linha do patrocinador volta a pendente"], rotas: [ROTA.revogar] },
  { acao: "reabrir-ao-acrescentar-patrocinador", de: POS_APROVACAO, para: "awaiting_sponsor_approval", papeis: ["admin", "solicitacao"],
    condicoes: [EVENTO_ABERTO, "só o patrocinador novo decide; os demais seguem aprovados"], rotas: [ROTA.acrescentar] },
  { acao: "cancelar-ao-tirar-o-ultimo-patrocinador", de: { todosMenos: Array.from(DEPOIS_DA_ARTE) }, para: "canceled",
    papeis: ["admin", "arte", "atendimento", "solicitacao"],
    condicoes: ["o patrocinador desvinculado era o único da peça"], rotas: [ROTA.tirarDaPeca, ROTA.tirarDoEvento] },
  { acao: "fechar-rodada-ao-tirar-patrocinador-pendente", de: ["awaiting_sponsor_approval", "awaiting_approval"], para: "sponsor_approved",
    papeis: ["admin", "arte", "atendimento", "solicitacao"],
    condicoes: ["o patrocinador desvinculado estava pendente e os que restam já aprovaram"], rotas: [ROTA.tirarDaPeca, ROTA.tirarDoEvento] },
  { acao: "dispensar-aprovacao", de: DISPENSAVEIS, para: DESTINO_DA_DISPENSA, papeis: ["arte", "admin"],
    condicoes: [EVENTO_ABERTO, MOTIVO, "molde não passa por aprovação"], rotas: [ROTA.dispensar] },
  { acao: "enviar-arquivo-final", de: ["sponsor_approved", "awaiting_creator_review"], para: "awaiting_final_review", papeis: ["arte", "admin"],
    condicoes: [EVENTO_ABERTO], rotas: [ROTA.arquivoFinal] },
  { acao: "trocar-thumb-aprovado", de: ["sponsor_approved"], para: "awaiting_sponsor_approval", papeis: ["arte", "admin"],
    condicoes: [EVENTO_ABERTO, "motivo da troca", "um patrocinador desaprovador (aprovação estrita) tinha aprovado — ele vê a versão nova"], rotas: [ROTA.trocarThumb] },
  { acao: "trocar-arquivo-final-liberado", de: PODE_IR_PARA_A_MAQUINA, para: "awaiting_final_review", papeis: ["arte", "admin"],
    condicoes: [EVENTO_ABERTO, NAO_TRAVADA, "nenhuma unidade produzida — a liberação valia para o arquivo anterior"], rotas: [ROTA.trocarArquivo] },

  // ── Revisão Final ────────────────────────────────────────────────────────
  { acao: "liberar-para-producao", de: ["awaiting_final_review"], para: "ready_for_production", papeis: QUEM_DECIDE_NA_REVISAO,
    condicoes: [EVENTO_ABERTO, "arquivo final enviado (molde dispensa)", "peça travada: dizer se destrava ou mantém a trava"], rotas: [ROTA.liberar] },
  { acao: "liberar-com-reaproveitamento-total", de: ["awaiting_final_review"], para: "produced", papeis: QUEM_DECIDE_NA_REVISAO,
    condicoes: [EVENTO_ABERTO, "reaproveitamento da quantidade inteira — não imprime nada"], rotas: [ROTA.liberar] },
  { acao: "liberar-o-que-ja-foi-liberado", de: JA_LIBERADA, para: FICA_ONDE_ESTA, papeis: QUEM_DECIDE_NA_REVISAO,
    condicoes: [EVENTO_ABERTO, "clique repetido: responde a peça como está"], rotas: [ROTA.liberar] },
  { acao: "devolver-para-a-arte", de: ["awaiting_final_review"], para: "awaiting_submission", papeis: QUEM_DECIDE_NA_REVISAO,
    condicoes: [EVENTO_ABERTO, MOTIVO, "destino \"arte\" (refazer a arte) — molde volta sempre para cá"], rotas: [ROTA.devolverArte, ROTA.devolverArteLote] },
  { acao: "devolver-para-a-finalizacao", de: ["awaiting_final_review"], para: "sponsor_approved", papeis: QUEM_DECIDE_NA_REVISAO,
    condicoes: [EVENTO_ABERTO, MOTIVO, "destino \"finalização\" (trocar o arquivo final) com a rodada de aprovação fechada"], rotas: [ROTA.devolverArte, ROTA.devolverArteLote] },
  { acao: "devolver-para-a-aprovacao", de: ["awaiting_final_review"], para: "awaiting_sponsor_approval", papeis: QUEM_DECIDE_NA_REVISAO,
    condicoes: [EVENTO_ABERTO, MOTIVO, "destino \"finalização\", mas com patrocinador ainda pendente"], rotas: [ROTA.devolverArte, ROTA.devolverArteLote] },
  { acao: "devolver-ao-solicitante", de: { todosMenos: ["draft"] }, para: "draft", papeis: ["arte", "admin"],
    condicoes: [EVENTO_ABERTO, MOTIVO, "de depois da Arte a trilha marca \"JÁ FORA DA ARTE\""], rotas: [ROTA.devolverSolicitante] },
  { acao: "devolver-para-a-revisao", de: LIBERADA, para: "awaiting_final_review", papeis: ["grafica", "admin"],
    condicoes: [EVENTO_ABERTO, MOTIVO, "nenhuma unidade impressa"], rotas: [ROTA.devolverRevisao] },

  // ── Cancelamento ─────────────────────────────────────────────────────────
  { acao: "cancelar", de: { todosMenos: [] }, para: "canceled", papeis: ["solicitacao", "arte", "admin"],
    condicoes: [EVENTO_ABERTO, "complementos sem material vão junto"], rotas: [ROTA.cancelar, ROTA.cancelarLote] },
  { acao: "descancelar", de: ["canceled"], para: VOLTA_PARA_ONDE_ESTAVA, papeis: ["admin"],
    condicoes: [EVENTO_ABERTO, "volta ao status de antes (coluna → trilha → Solicitado); de impressão, volta liberada e no topo da fila"], rotas: [ROTA.descancelar] },

  // ── Impressão ────────────────────────────────────────────────────────────
  { acao: "iniciar-impressao", de: PODE_IR_PARA_A_MAQUINA, para: "inProduction", papeis: ["grafica", "admin"],
    condicoes: [EVENTO_ABERTO, NAO_TRAVADA, "molde não vai para a impressora", "há o que imprimir", "impressora livre"], rotas: [ROTA.imprimir] },
  { acao: "concluir-impressao", de: EM_IMPRESSAO, para: "produced", papeis: ["grafica", "admin"],
    condicoes: ["evento aberto (o realizado aceita informar o que já estava na impressora)", NAO_TRAVADA, "impressas + reaproveitadas cobrem a quantidade"], rotas: [ROTA.impressas] },
  { acao: "informar-impressas-parcial", de: EM_IMPRESSAO, para: "inProduction", papeis: ["grafica", "admin"],
    condicoes: ["evento aberto (o realizado aceita informar o que já estava na impressora)", NAO_TRAVADA, "ainda falta imprimir"], rotas: [ROTA.impressas] },
  { acao: "esvaziar-impressoras", de: EM_IMPRESSAO, para: "ready_for_production", papeis: ["grafica", "admin"],
    condicoes: ["peça dividida entre impressoras: a última parte ativa acabou sem fechar a peça"], rotas: [ROTA.impressas] },

  // ── Reaproveitamento ─────────────────────────────────────────────────────
  { acao: "reaproveitar-o-que-falta", de: REAPROVEITAVEL, para: "produced", papeis: ["grafica", "admin", "solicitacao"],
    condicoes: [EVENTO_ABERTO, NAO_TRAVADA, "reaproveitadas + impressas cobrem a quantidade"], rotas: [ROTA.reaproveitar] },
  { acao: "reaproveitar-parte", de: REAPROVEITAVEL, para: FICA_ONDE_ESTA, papeis: ["grafica", "admin", "solicitacao"],
    condicoes: [EVENTO_ABERTO, NAO_TRAVADA, "ainda sobra o que imprimir"], rotas: [ROTA.reaproveitar] },
  { acao: "ajustar-reaproveitamento-da-produzida", de: PRODUZIDA, para: "produced", papeis: ["admin", "solicitacao"],
    condicoes: [EVENTO_ABERTO, NAO_TRAVADA, "nada conferido nem entregue — converte impressas em reaproveitadas e vice-versa"], rotas: [ROTA.reaproveitar] },
  { acao: "corrigir-reaproveitamento-para-a-fila", de: PRODUZIDA, para: "ready_for_production", papeis: ["grafica", "solicitacao", "admin"],
    condicoes: [EVENTO_ABERTO, "nada conferido, entregue ou embalado", "sobra o que imprimir"], rotas: [ROTA.corrigirReuso] },
  { acao: "corrigir-reaproveitamento-para-a-fila", de: { todosMenos: [...Array.from(EM_REVISAO), ...PRODUZIDA] }, para: "ready_for_production", papeis: ["admin"],
    condicoes: [EVENTO_ABERTO, "o admin corrige em qualquer etapa antes da conferência", "sobra o que imprimir"], rotas: [ROTA.corrigirReuso] },
  { acao: "corrigir-para-reaproveitamento-total", de: { todosMenos: Array.from(EM_REVISAO) }, para: "produced", papeis: ["admin"],
    condicoes: [EVENTO_ABERTO, NAO_TRAVADA, "nada conferido, entregue ou embalado", "só o admin alcança o total (Gráfica e Solicitação corrigem até quantidade − 1)"], rotas: [ROTA.corrigirReuso] },

  // ── Conferência, embalagem e entrega ─────────────────────────────────────
  { acao: "conferir-tudo", de: CONFERIVEL, para: "conferred", papeis: ["grafica", "solicitacao", "admin"],
    condicoes: [NAO_TRAVADA, "foto da conferência", "molde não passa por conferência", "confere a quantidade inteira"], rotas: [ROTA.conferir] },
  { acao: "conferir-tudo-ja-embalado", de: CONFERIVEL, para: "packed", papeis: ["grafica", "solicitacao", "admin"],
    condicoes: [NAO_TRAVADA, "foto da conferência", "fecha a conferência com tudo já embalado"], rotas: [ROTA.conferir] },
  { acao: "conferir-parte", de: CONFERIVEL, para: FICA_ONDE_ESTA, papeis: ["grafica", "solicitacao", "admin"],
    condicoes: [NAO_TRAVADA, "foto da conferência", "ainda falta conferir"], rotas: [ROTA.conferir] },
  { acao: "embalar", de: PODE_IR_PARA_TUBO.filter((s) => !EM_REVISAO.has(s)), para: "packed", papeis: ["admin", "grafica", "solicitacao"],
    condicoes: [NAO_TRAVADA, "a quantidade inteira conferida e embalada"], rotas: [ROTA.embalar] },
  { acao: "tirar-do-tubo", de: ["packed"], para: "conferred", papeis: ["admin", "grafica", "solicitacao"],
    condicoes: ["a peça sai do volume (ou o volume é apagado)"], rotas: [ROTA.embalar, ROTA.apagarTubo] },
  { acao: "entregar-volume", de: PODE_IR_PARA_TUBO, para: "delivered", papeis: ["admin", "grafica", "solicitacao"],
    condicoes: ["o volume entregue completa a quantidade da peça"], rotas: [ROTA.entregarTubo] },

  // ── Molde (fluxo curto) ──────────────────────────────────────────────────
  { acao: "marcar-molde-produzido", de: MOLDE_LIBERADO, para: "produced", papeis: ["grafica", "admin"],
    condicoes: [EVENTO_ABERTO, NAO_TRAVADA, "é molde"], rotas: [ROTA.moldeProduzido] },
  { acao: "marcar-molde-ja-produzido", de: PRODUZIDA, para: FICA_ONDE_ESTA, papeis: ["grafica", "admin"],
    condicoes: ["é molde", "clique repetido: responde a peça como está"], rotas: [ROTA.moldeProduzido] },
  { acao: "desfazer-molde-produzido", de: PRODUZIDA, para: "ready_for_production", papeis: ["grafica", "admin"],
    condicoes: [EVENTO_ABERTO, NAO_TRAVADA, "é molde", "nada conferido, embalado ou entregue"], rotas: [ROTA.moldeDesfazer] },
  { acao: "desfazer-molde-ja-liberado", de: MOLDE_LIBERADO, para: FICA_ONDE_ESTA, papeis: ["grafica", "admin"],
    condicoes: ["é molde", "clique repetido: responde a peça como está"], rotas: [ROTA.moldeDesfazer] },

  // ── Complemento ──────────────────────────────────────────────────────────
  { acao: "criar-complemento", de: COMPLEMENTAVEL, para: FICA_ONDE_ESTA, papeis: ["admin", "solicitacao"],
    condicoes: [EVENTO_ABERTO, "a peça-mãe não muda: nasce uma peça nova (o complemento) já liberada para produção", "não é ela mesma um complemento"], rotas: [ROTA.complemento] },
];

// ─── As leituras ─────────────────────────────────────────────────────────────

/** O status está na origem? */
export function origemAceita(de: Origem, status: StatusDaPeca | null | undefined): boolean {
  const s = String(status ?? "");
  return Array.isArray(de) ? (de as readonly string[]).includes(s) : !(de as { todosMenos: readonly string[] }).todosMenos.includes(s);
}

const linhasDa = (acao: AcaoDaPeca) => TRANSICOES.filter((t) => t.acao === acao);

/**
 * A peça neste status pode sofrer esta ação por este papel? (Só status e
 * papel — as condições da linha continuam sendo da rota.)
 */
export function podeTransicionar(status: StatusDaPeca | null | undefined, acao: AcaoDaPeca, papel: string | null | undefined): boolean {
  return linhasDa(acao).some((t) => origemAceita(t.de, status) && (t.papeis as readonly string[]).includes(String(papel ?? "")));
}

/** A ação aceita a peça neste status, para algum papel? (É o gate de status das rotas.) */
export function vemDeOrigemValida(status: StatusDaPeca | null | undefined, acao: AcaoDaPeca): boolean {
  return linhasDa(acao).some((t) => origemAceita(t.de, status));
}

/**
 * Para onde a peça vai. `null` quando a ação não parte deste status. O
 * status atual volta quando a ação não o muda (`mesmo`); o descancelar
 * devolve `anterior` — o destino mora na peça, não na tabela.
 */
export function proximoStatus(status: StatusDaPeca | null | undefined, acao: AcaoDaPeca): StatusDaPeca | typeof VOLTA_PARA_ONDE_ESTAVA | null {
  const linha = linhasDa(acao).find((t) => origemAceita(t.de, status));
  if (!linha) return null;
  return linha.para === FICA_ONDE_ESTA ? String(status ?? "") : linha.para;
}

/**
 * Os status de onde a ação parte, em lista (união das linhas dela, na ordem
 * da tabela). `null` quando alguma linha é "qualquer status, menos …".
 */
export function origemDaAcao(acao: AcaoDaPeca): readonly StatusDaPeca[] | null {
  const saida: StatusDaPeca[] = [];
  for (const t of linhasDa(acao)) {
    if (!Array.isArray(t.de)) return null;
    for (const s of t.de as readonly StatusDaPeca[]) if (!saida.includes(s)) saida.push(s);
  }
  return saida;
}
