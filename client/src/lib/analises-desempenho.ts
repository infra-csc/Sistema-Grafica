// Retrabalho da peça — a régua que o Painel Geral usa no foco "retrabalho"
// (components/painel/recorte.ts). Regra pura, sem React e sem I/O.
//
// Até 16/10 este arquivo era a régua da aba "Desempenho" da Análises (KPIs de
// ciclos fechados, ofensores). A Análises virou o Painel operacional da
// gráfica e aquela aba saiu; ficou só o que o Painel Geral importa.
import type { AnaliseItem } from "./analises-metrics";

// ─── Retrabalho ──────────────────────────────────────────────────────────────

/**
 * A peça passou por REFAÇÃO DE ARTE?
 *
 * Dois sinais DURÁVEIS e dois TRANSITÓRIOS, e a diferença importa:
 *
 *  - `previousFinalFileUrl` e `previousApprovalThumbUrl` são gravados quando a
 *    Arte SUBSTITUI um arquivo final ou um layout já enviado
 *    (`routes/items.ts` — troca de arte e troca de thumb). Nunca são limpos:
 *    valem para ciclos fechados, que é o recorte desta tela.
 *  - `rejectedBySponsor`/`rejectedByCreator` são LIMPOS quando a peça reanda
 *    (aprovação do patrocinador, reenvio da Arte). Sozinhos, subnotificam o
 *    passado; entram porque pegam a reprovação que ainda está em aberto.
 *
 * Consequência declarada na tela: isto é PISO, não total. Retrabalho anterior
 * à substituição de arquivo — e reprovação já resolvida sem troca de arte —
 * só existe em `audit_logs`, que o cliente não lê.
 */
export function temRefacao(i: AnaliseItem): boolean {
  return !!(
    i.previousFinalFileUrl ||
    i.previousApprovalThumbUrl ||
    i.rejectedBySponsor ||
    i.rejectedByCreator
  );
}

