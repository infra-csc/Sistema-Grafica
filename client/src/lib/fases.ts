/**
 * AS FASES DE PRODUÇÃO, e a contagem de peças por fase — num lugar só.
 *
 * A barra segmentada por fase nasceu no cartão de Eventos, virou função de
 * módulo quando a lista de Eventos passou a desenhar a mesma barra, e agora o
 * Detalhe do Evento — a tela que DETÉM as peças — também a desenha. Três telas
 * com a mesma barra e uma conta só: duas implementações da mesma contagem
 * divergem no primeiro ajuste que só uma delas recebe.
 *
 * Deriva de PRODUCTION_STATUSES (lib/status) para não inventar vocabulário: a
 * barra antiga só enxergava `delivered`, então um evento com tudo produzido e
 * conferido aparecia com 0% — visualmente idêntico a um evento travado.
 */
import { PRODUCTION_STATUSES, getStatusMeta } from "@/lib/status";

const PHASE_ALIASES: Record<string, string[]> = {
  inProduction: ["inProduction", "em_producao"],
  produced:     ["produced", "produzido"],
  conferred:    ["conferred"],
  delivered:    ["delivered", "entregue"],
};
const PHASE_NOUN: Record<string, string> = {
  inProduction: "em produção",
  produced:     "produzidas",
  conferred:    "conferidas",
  delivered:    "entregues",
};

export const PHASES = PRODUCTION_STATUSES.map((key) => ({
  key,
  color: getStatusMeta(key).dot,
  statuses: PHASE_ALIASES[key],
  noun: PHASE_NOUN[key],
}));

/** Peças por fase, na ordem de PHASES. */
export function contarPorFase(items: ReadonlyArray<{ status: string }> | null | undefined): number[] {
  const counts = new Array(PHASES.length).fill(0) as number[];
  for (const it of items ?? []) {
    const idx = PHASES.findIndex((p) => p.statuses.includes(it.status));
    if (idx >= 0) counts[idx] += 1;
  }
  return counts;
}

/** O mesmo, a partir do evento enriquecido (`event.items`) que a lista de Eventos recebe. */
export function contarPorFaseDoEvento(event: { items?: unknown }): number[] {
  return contarPorFase(Array.isArray(event?.items) ? (event.items as { status: string }[]) : []);
}
