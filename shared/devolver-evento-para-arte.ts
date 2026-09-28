// ─────────────────────────────────────────────────────────────────────────────
// DEVOLVER AS PEÇAS DE UM EVENTO PARA A ARTE — ação de admin, com motivo.
//
// O caso (dono, 28/09): "Night Run CWB mudou de data e com isso mudam todos os
// logos de Ministério e Lei etc… como fazemos pra retornar tudo pra Arte?".
// Peça a peça, a única devolução para a Arte era a da Revisão Final — e a
// maioria das peças já estava em outra etapa (com o Atendimento, aprovada,
// liberada para a Gráfica).
//
// A regra é a da devolução "refazer a arte" da Revisão Final (destino "arte":
// volta para Aguardando envio sem thumb, sem arquivo final e sem aprovação),
// aberta às etapas seguintes ENQUANTO não existe material físico:
//   · volta: com o Atendimento, aprovada, finalização, Revisão Final, liberada
//     para a Gráfica, e na impressora sem nenhuma unidade impressa;
//   · não volta (com o porquê): material impresso/conferido/entregue — o
//     caminho é complemento/reimpressão; travada pela Solicitação — destrave
//     antes; cancelada; já com a Arte; ainda antes da Arte.
// Puro: a rota e o diálogo leem daqui (a tela não oferece o que o servidor nega).
// ─────────────────────────────────────────────────────────────────────────────
import { pecaTravada, type PecaTravavel } from "./trava-da-peca";

export type PecaParaDevolver = PecaTravavel & {
  status?: string | null;
  quantityProduced?: number | null;
  conferredQty?: number | null;
  deliveredQty?: number | null;
  embaladaQty?: number | null;
};

/** Por que a peça fica de fora — o agrupamento que o diálogo mostra. */
export type ForaDaDevolucao = "ja-na-arte" | "antes-da-arte" | "com-material" | "travada" | "cancelada";

export type SituacaoDaDevolucao =
  | { volta: true }
  | { volta: false; grupo: ForaDaDevolucao; porque: string };

/** Motivo mínimo: a mesma régua das outras devoluções (lerMotivoDevolucao). */
export const MOTIVO_DEVOLVER_EVENTO_MIN = 10;

const CANCELADA = ["canceled", "cancelled", "deleted", "archived"];
const JA_NA_ARTE = ["awaiting_submission"];
const ANTES_DA_ARTE = ["draft", "requested", "awaiting_linking"];
/** Status em que o material físico existe (mesmo sem contador preenchido). */
const COM_MATERIAL = [
  "produced", "produzido", "molde_produzido", "conferred", "packed", "delivered", "entregue",
];

/** As etapas de onde a peça volta — a origem da transição na máquina de estados. */
export const VOLTA_PARA_A_ARTE_DE = [
  "awaiting_sponsor_approval", "awaiting_approval", "sponsor_approved", "awaiting_finalization",
  "awaiting_creator_review", "awaiting_final_review", "awaiting_review", "in_review",
  "ready_for_production", "pronto_para_producao", "approved", "liberado",
  "inProduction", "em_producao",
] as const;

export function situacaoParaVoltarAArte(p: PecaParaDevolver): SituacaoDaDevolucao {
  const status = p.status ?? "";
  if (CANCELADA.includes(status)) return { volta: false, grupo: "cancelada", porque: "cancelada" };
  if (JA_NA_ARTE.includes(status)) return { volta: false, grupo: "ja-na-arte", porque: "já está com a Arte" };
  if (ANTES_DA_ARTE.includes(status)) return { volta: false, grupo: "antes-da-arte", porque: "ainda não chegou à Arte" };
  const material = (p.quantityProduced ?? 0) > 0 || (p.conferredQty ?? 0) > 0 || (p.embaladaQty ?? 0) > 0 || (p.deliveredQty ?? 0) > 0;
  if (material || COM_MATERIAL.includes(status)) {
    return { volta: false, grupo: "com-material", porque: "já tem material impresso — peça um complemento/reimpressão" };
  }
  if (pecaTravada(p)) return { volta: false, grupo: "travada", porque: "travada pela Solicitação — destrave antes" };
  if ((VOLTA_PARA_A_ARTE_DE as readonly string[]).includes(status)) return { volta: true };
  // Status desconhecido/legado: não se mexe no que não se entende.
  return { volta: false, grupo: "antes-da-arte", porque: "etapa que não volta para a Arte" };
}

/** O título de cada grupo "de fora" no diálogo. */
export const ROTULO_DE_FORA: Record<ForaDaDevolucao, string> = {
  "com-material": "Com material impresso (complemento/reimpressão)",
  "travada": "Travadas pela Solicitação",
  "ja-na-arte": "Já estão com a Arte",
  "antes-da-arte": "Ainda não chegaram à Arte",
  "cancelada": "Canceladas",
};
