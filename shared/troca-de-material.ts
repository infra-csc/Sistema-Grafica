// ─────────────────────────────────────────────────────────────────────────────
// TROCAR O MATERIAL DA ARTE DEPOIS QUE A PEÇA ANDOU — e quem decide na Revisão.
//
// Duas trocas que a Arte faz numa peça que já saiu da mesa dela:
//   · o ARQUIVO FINAL (update-final-file) — o que a Gráfica imprime;
//   · o THUMB (update-thumb) — o que o patrocinador aprovou.
//
// Sem regra, as duas passavam em qualquer status: um arquivo novo entrava numa
// peça liberada sem ninguém da Revisão ver, e um thumb trocado depois da
// aprovação ficava "aprovado" sem o patrocinador ter visto aquela versão.
//
// Puro: o servidor (as guardas das rotas) e a tela da Arte (esconder a ação ou
// escrever o motivo) leem DESTAS funções — a tela não oferece o que o servidor
// nega.
// ─────────────────────────────────────────────────────────────────────────────

import { pecaTravada, fraseDaTrava, type PecaTravavel } from "./trava-da-peca";

/**
 * Decisão do dono (padrão proposto, ajustável aqui): trocar o thumb DEPOIS da
 * aprovação do patrocinador é permitido, mas exige um motivo por escrito e
 * fica marcado como "trocada após aprovação" na trilha e na versão.
 *   · "motivo"   — permite, com motivo (o padrão);
 *   · "bloquear" — recusa: arte nova pede uma rodada de aprovação nova.
 */
export const THUMB_APOS_APROVACAO: "motivo" | "bloquear" = "motivo";

/**
 * Decisão do dono (24/09): trocar o thumb ENQUANTO a peça está com o
 * Atendimento (aguardando o patrocinador) é permitido, com motivo. Antes era
 * recusado — e uma alteração que chegava nesse meio-tempo obrigava a esperar
 * alguém reprovar para a peça voltar à Arte. Com a troca, o Atendimento é
 * avisado para apresentar a versão nova, e o patrocinador desaprovador
 * (strictApproval) que já tinha aprovado a anterior volta a aprovar.
 *   · "motivo"   — permite, com motivo (o padrão);
 *   · "bloquear" — volta à regra antiga: a versão nova entra pela reprovação.
 */
export const THUMB_EM_APROVACAO: "motivo" | "bloquear" = "motivo";

/**
 * Decisão do dono (padrão proposto, ajustável aqui): liberar ou devolver na
 * Revisão Final é da Solicitação (e do admin). A Arte não revisa o próprio
 * trabalho — com `true` ela volta a poder, nas mesmas rotas.
 */
export const ARTE_DECIDE_NA_REVISAO = false;

/** Quem libera/devolve/reaproveita na Revisão Final. */
export const papelDecideNaRevisao = (papel: string | null | undefined): boolean =>
  papel === "solicitacao" || papel === "admin" || (ARTE_DECIDE_NA_REVISAO && papel === "arte");

/** O motivo da troca do thumb depois da aprovação: a mesma régua das devoluções. */
export const MOTIVO_TROCA_MIN = 10;

/** Frase única para o 409 de material já produzido (servidor e tela). */
export const ERRO_JA_PRODUZIDO = "Já há material produzido — peça um complemento/reimpressão.";

const LIBERADA = ["ready_for_production", "approved", "pronto_para_producao", "liberado"];
const EM_IMPRESSAO = ["inProduction", "em_producao"];
const PRODUZIDA_EM_DIANTE = [
  "produced", "produzido", "molde_produzido", "conferred", "packed", "delivered", "entregue",
];
const FORA_DO_FLUXO = ["canceled", "cancelled", "deleted", "archived"];
/** Em aprovação do patrocinador — o Atendimento está mostrando este thumb. */
const EM_APROVACAO = ["awaiting_sponsor_approval"];
/** Aprovada e ainda na Arte/Revisão: a troca do thumb pede motivo. */
const APROVADA_ANTES_DA_LIBERACAO = [
  "sponsor_approved", "awaiting_finalization", "awaiting_creator_review",
  "awaiting_final_review", "awaiting_review", "in_review",
];

export type PecaComMaterial = PecaTravavel & {
  status?: string | null;
  quantityProduced?: number | null;
  conferredQty?: number | null;
  deliveredQty?: number | null;
  finalFileUrl?: string | null;
  approvalThumbUrl?: string | null;
  skipApproval?: boolean | null;
};

/** Já existe material físico desta peça? (impressas, conferidas ou entregues.) */
export function temMaterialProduzido(p: PecaComMaterial): boolean {
  return (p.quantityProduced ?? 0) > 0 || (p.conferredQty ?? 0) > 0 || (p.deliveredQty ?? 0) > 0
    || PRODUZIDA_EM_DIANTE.includes(p.status ?? "");
}

export type RegraDaTroca =
  | { pode: false; motivo: string; travada?: boolean }
  | { pode: true; voltaParaRevisao: boolean };

/**
 * Trocar o ARQUIVO FINAL agora:
 *   · na Revisão Final (ou antes): troca simples, a peça fica onde está;
 *   · liberada, ou em impressão sem nenhuma impressa: a troca DEVOLVE a peça
 *     para a Revisão Final — a liberação valia para o arquivo anterior;
 *   · com material produzido: não — o que está no galpão é do arquivo antigo;
 *   · travada pela Solicitação: não (a trava segura a peça como está).
 */
export function regraDaTrocaDeArquivoFinal(p: PecaComMaterial | null | undefined): RegraDaTroca {
  if (!p) return { pode: false, motivo: "Peça não encontrada." };
  if (!p.finalFileUrl) return { pode: false, motivo: "A peça ainda não tem arquivo final enviado." };
  const status = p.status ?? "";
  if (FORA_DO_FLUXO.includes(status)) return { pode: false, motivo: "Peça cancelada não recebe arquivo novo." };
  if (pecaTravada(p)) return { pode: false, motivo: fraseDaTrava(p), travada: true };
  if (temMaterialProduzido(p)) return { pode: false, motivo: ERRO_JA_PRODUZIDO };
  if (LIBERADA.includes(status) || EM_IMPRESSAO.includes(status)) return { pode: true, voltaParaRevisao: true };
  return { pode: true, voltaParaRevisao: false };
}

export type RegraDoThumb =
  | { pode: false; motivo: string }
  | { pode: true; exigeMotivo: boolean };

/**
 * Trocar o THUMB agora:
 *   · em aprovação do patrocinador: com motivo (THUMB_EM_APROVACAO) — o
 *     servidor avisa o Atendimento para apresentar a versão nova;
 *   · aprovada (Finalização/Revisão): com motivo (THUMB_APOS_APROVACAO);
 *   · liberada em diante: não — a peça já é da Gráfica;
 *   · antes da aprovação: livre.
 */
export function regraDaTrocaDeThumb(p: PecaComMaterial | null | undefined): RegraDoThumb {
  if (!p) return { pode: false, motivo: "Peça não encontrada." };
  if (!p.approvalThumbUrl) return { pode: false, motivo: "A peça ainda não tem thumb enviado." };
  const status = p.status ?? "";
  if (FORA_DO_FLUXO.includes(status)) return { pode: false, motivo: "Peça cancelada não recebe thumb novo." };
  if (EM_APROVACAO.includes(status)) {
    if (THUMB_EM_APROVACAO === "motivo") return { pode: true, exigeMotivo: true };
    return { pode: false, motivo: "A peça está com o Atendimento, aguardando o patrocinador — trocar o thumb agora mudaria o que ele está avaliando. Se a arte precisa mudar, o Atendimento registra a reprovação e a versão nova vai pela Correção." };
  }
  if (LIBERADA.includes(status) || EM_IMPRESSAO.includes(status) || PRODUZIDA_EM_DIANTE.includes(status)) {
    return { pode: false, motivo: "A peça já foi liberada para a Gráfica — o thumb aprovado não muda mais. Se a arte está errada, a Gráfica devolve para a Revisão ou peça um complemento." };
  }
  if (APROVADA_ANTES_DA_LIBERACAO.includes(status)) {
    // Isenta de aprovação: ninguém aprovou este thumb, então não há o que proteger.
    if (p.skipApproval) return { pode: true, exigeMotivo: false };
    if (THUMB_APOS_APROVACAO === "bloquear") {
      return { pode: false, motivo: "O patrocinador já aprovou este thumb — arte nova pede uma rodada de aprovação nova." };
    }
    return { pode: true, exigeMotivo: true };
  }
  return { pode: true, exigeMotivo: false };
}

/** O motivo limpo (espaços colapsados), ou o erro humano. */
export function lerMotivoDaTroca(bruto: unknown): { ok: true; motivo: string } | { ok: false; erro: string } {
  const motivo = typeof bruto === "string" ? bruto.trim().replace(/\s+/g, " ") : "";
  if (motivo.length < MOTIVO_TROCA_MIN) {
    return { ok: false, erro: `O patrocinador já aprovou este thumb — explique em pelo menos ${MOTIVO_TROCA_MIN} caracteres por que ele está sendo trocado.` };
  }
  return { ok: true, motivo };
}

/** Marca da trilha e da versão para a troca feita depois da aprovação. */
export const MARCA_TROCA_APOS_APROVACAO = "trocada após aprovação";
/** Marca da trilha e da versão para a troca feita com o Atendimento (em aprovação). */
export const MARCA_TROCA_EM_APROVACAO = "trocada durante a aprovação";
