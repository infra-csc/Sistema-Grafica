// Agregados da faixa de análise — funções PURAS, sem React.
//
// PORQUÊ ESTE ARQUIVO: o resumo por setor (com a reatribuição "aprovação cuja
// bola está toda com a Arte conta na Arte") e a contagem de eventos por etapa
// eram regra de negócio escrita dentro de dois `useMemo` da página — sem teste
// possível sem montar a árvore React inteira. Aqui são funções sobre o payload
// do contrato, testadas em `server/__tests__/prazo-gargalos.test.ts` (o único
// diretório que o vitest.config inclui; funciona porque nada aqui toca DOM).
import { PRODUCED_LIKE } from "@shared/prazos-contract";
import type { PrazoEvent } from "@shared/prazos-contract";
import { currentStageIdx, STAGE_SECTOR, urlSetor } from "./tokens";

/** Uma linha do resumo por setor (consumida pela AnaliseBand). */
export interface SetorResumo {
  key: string;
  sector: string;
  stageLabel: string;
  /**
   * Href do card, já com a aba do setor quando ela existe (`urlSetor`). Este
   * bloco conta o conjunto COMPLETO, então não há evento nem peça para citar —
   * a etapa é toda a especificidade disponível, e ela vai na URL.
   */
  url: string | null;
  count: number;
  avgDays: number;
  maxDays: number;
  producedCount: number;
  eventCount: number;
  isWorst: boolean;
}

// O conjunto vem do CONTRATO compartilhado — mesma lista que compõe os
// `pendingStatuses` da produção no domínio do servidor. Um Set local aqui era
// a terceira cópia do vocabulário, pronta a divergir.
const PRODUCED = new Set<string>(PRODUCED_LIKE);

/**
 * Gargalo por setor (cross-evento, sobre o conjunto completo): quantas peças
 * estão na MESA de cada setor agora.
 *
 * Atribuição pelo dono REAL da bola, não só pela etapa: aprovação cuja(s)
 * bola(s) estão todas com a Arte conta na Arte (reprovação aguardando
 * reenvio); peça produzida/conferida não é mais "cobrança à Gráfica produzir"
 * — vira o sub-rótulo "aguardando conferência/entrega" via `producedCount`.
 *
 * Empate em 3+ setores zera `isWorst`: dia normal distribuído, não gargalo —
 * o destaque uniforme viraria alarme sem informação.
 */
export function computeSectorSummary(
  events: PrazoEvent[],
  stageMeta: { key: string; label: string }[],
): SetorResumo[] {
  const acc = stageMeta.map((m) => ({
    key: m.key,
    sector: STAGE_SECTOR[m.key]?.sector ?? m.label,
    stageLabel: m.label,
    url: urlSetor(m.key),
    count: 0,
    totalDays: 0,
    maxDays: 0,
    producedCount: 0,
    eventIds: new Set<string>(),
  }));
  const arteIdx = stageMeta.findIndex((m) => m.key === "layouts");
  for (const ev of events) {
    for (const it of ev.pendingItems) {
      let idx = it.stageIndex;
      // Bola de volta com a Arte (reprovação aguardando reenvio).
      if (stageMeta[idx]?.key === "aprovacao" && arteIdx >= 0
          && it.sponsors && it.sponsors.length > 0
          && it.sponsors.every((s) => s.holder === "arte")) {
        idx = arteIdx;
      }
      const s = acc[idx];
      if (!s) continue;
      s.count += 1;
      s.totalDays += it.waitingDays;
      s.maxDays = Math.max(s.maxDays, it.waitingDays);
      s.eventIds.add(ev.id);
      if (stageMeta[idx]?.key === "producao" && PRODUCED.has(it.status)) s.producedCount += 1;
    }
  }
  const worst = acc.reduce((w, s) => (s.count > w ? s.count : w), 0);
  const tied = acc.filter((s) => s.count === worst && worst > 0).length;
  return acc.map((s) => ({
    key: s.key,
    sector: s.sector,
    stageLabel: s.stageLabel,
    url: s.url,
    count: s.count,
    maxDays: s.maxDays,
    producedCount: s.producedCount,
    avgDays: s.count > 0 ? Math.round(s.totalDays / s.count) : 0,
    eventCount: s.eventIds.size,
    isWorst: worst > 0 && s.count === worst && tied < 3,
  }));
}

/**
 * Quantos EVENTOS estão parados em cada etapa — a mesma conta da coluna do
 * quadro. NÃO é o mesmo número do resumo por setor: aquele conta PEÇAS pelo
 * dono real da bola, este conta EVENTOS pela etapa atual — por isso o botão
 * do card de setor fala em eventos e não repete o número de peças.
 */
export function computeEventosPorEtapa(
  events: PrazoEvent[],
  stageMeta: { key: string; label: string }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const ev of events) {
    const k = stageMeta[currentStageIdx(ev)]?.key;
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}
