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
import { statusParaContagem } from "@shared/molde";
import { STATUS_DA_ETAPA, etapaDaPeca } from "@shared/fluxo-peca";

const PHASE_NOUN: Record<string, string> = {
  // 21/09: o vocabulário do selo (lib/status) — "Em Impressão" e "Impresso /
  // Acabamento". "em produção"/"produzidas" era o nome ANTIGO das duas etapas
  // e aparecia nos tooltips/aria de Eventos e do Detalhe do evento.
  inProduction: "em impressão",
  produced:     "em acabamento",
  conferred:    "conferidas",
  packed:       "embaladas",
  delivered:    "entregues",
};

export const PHASES = PRODUCTION_STATUSES.map((key) => ({
  key,
  color: getStatusMeta(key).dot,
  // Grafias legadas vêm da etapa canônica (shared/fluxo-peca), não de cópia local.
  statuses: STATUS_DA_ETAPA[key] as readonly string[],
  noun: PHASE_NOUN[key],
}));

/** Peças por fase, na ordem de PHASES. */
export function contarPorFase(items: ReadonlyArray<{ status: string; type?: string | null }> | null | undefined): number[] {
  const counts = new Array(PHASES.length).fill(0) as number[];
  for (const it of items ?? []) {
    // Molde produzido é o fim do fluxo dele: conta na fase "entregues" (shared/molde).
    const etapa = etapaDaPeca(statusParaContagem(it));
    const idx = PHASES.findIndex((p) => p.key === etapa);
    if (idx >= 0) counts[idx] += 1;
  }
  return counts;
}

/** O mesmo, a partir do evento enriquecido (`event.items`) que a lista de Eventos recebe. */
export function contarPorFaseDoEvento(event: { items?: unknown }): number[] {
  return contarPorFase(Array.isArray(event?.items) ? (event.items as { status: string }[]) : []);
}
