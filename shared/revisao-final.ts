// ─────────────────────────────────────────────────────────────────────────────
// QUAIS PEÇAS ESPERAM A REVISÃO FINAL — uma régua só para a fila da tela de
// Revisão, para o número no menu lateral (dono, 26/10) e para a contagem do
// servidor (GET /api/items/revisao-final/contagem). Os três não divergem.
// ─────────────────────────────────────────────────────────────────────────────
import { ehBookCompleto } from "./fluxo-peca";

export const STATUS_DA_REVISAO = "awaiting_final_review";

type PecaContavel = { status?: string | null; type?: string | null; kitRemessaId?: string | null };
type QuemRevisa = { role?: string | null; kit?: boolean | null } | null | undefined;

/**
 * As peças que a pessoa revisa: em Revisão Final, sem o BOOK COMPLETO (é o
 * trâmite do Atendimento, não uma peça) e — para a Solicitação da Arena —
 * sem as peças do Kit (quem revisa essas é a equipe do Kit).
 */
export function pecasParaRevisar<T extends PecaContavel>(itens: readonly T[], user: QuemRevisa): T[] {
  return itens.filter((item) =>
    !ehBookCompleto(item)
    && item.status === STATUS_DA_REVISAO
    && !(user?.role === "solicitacao" && !user?.kit && item.kitRemessaId));
}
