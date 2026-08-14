// Regra pura da tela de Análises — sem React, sem date-fns, sem I/O.
//
// PORQUÊ este arquivo existe:
//  1. A tela fazia ~32 varreduras completas da lista de peças POR RENDER, e a
//     memoização era decorativa porque a âncora de data (`subDays(new Date())`)
//     nascia nova a cada render. Aqui cada agregado é UMA passada e recebe o
//     "agora" por parâmetro — quem chama controla a estabilidade.
//  2. Nada disto tinha teste. Como função pura sobre objetos simples, passa a
//     ter (`server/__tests__/analises-metrics.test.ts`).
//  3. `format()` do date-fns LANÇA em data inválida, e a tela é um componente
//     só, sem error boundary: uma data ruim derrubava a página inteira. Aqui
//     toda leitura de data devolve `null` em vez de lançar.
import { isPlausibleEventYear } from "@shared/prazo-dates";
import {
  AWAITING_DECISION_STATUSES,
  FLOW_GROUPS,
  READY_FOR_PRODUCTION_STATUSES,
  flowGroupOf,
  isApprovedOrBeyond,
  isDelivered,
  isInProduction,
  isOutOfFunnel,
} from "./analises-status";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

// ─── Tipos mínimos do que a API realmente devolve ────────────────────────────
// Estrutural de propósito: a query era `useQuery<any[]>` e foi exatamente o
// `any` que apagou o erro de `i.sponsorIds` (campo que não existe em `items`;
// `GET /api/items` entrega `sponsors: [...]`, montado por
// `enrichItemsWithEventsAndSponsors`).

export interface AnaliseSponsorRef {
  id: string;
  name?: string | null;
}

export interface AnaliseItem {
  id: string;
  eventId: string;
  status: string;
  type?: string | null;
  quantity?: number | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  deliveredAt?: string | Date | null;
  /** Vínculo peça↔patrocinador entregue pela rota. NUNCA `sponsorIds`. */
  sponsors?: AnaliseSponsorRef[] | null;
}

export interface AnaliseEvent {
  id: string;
  name: string;
  /** `baixa | media | alta | urgente` — a urgência do negócio vive AQUI. */
  priority?: string | null;
  truckDepartureDate?: string | Date | null;
  createdAt: string | Date;
}

export interface AnaliseSponsor {
  id: string;
  name: string;
}

export const qtyOf = (i: { quantity?: number | null }): number => i.quantity || 1;

// ─── Datas ───────────────────────────────────────────────────────────────────

/**
 * Dia-calendário do NEGÓCIO (America/Sao_Paulo) em ms UTC-meia-noite.
 *
 * Gêmeo de `spDayMs` (`server/services/prazo-domain.ts`), que o cliente não
 * pode importar. O teste `analises-metrics.test.ts` compara os dois — a âncora
 * de "hoje" do app precisa ser uma só: em UTC puro, entre 21h e 00h em
 * Brasília o recorte de período pula um dia.
 */
const SP_DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
});
export function businessDayMs(nowMs: number): number {
  const [y, m, d] = SP_DAY_FMT.format(new Date(nowMs)).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * Data-calendário (UTC-meia-noite) de uma data de evento, ou `null` quando o
 * cadastro está quebrado. As DATAS de evento são wall-clock em UTC — convenção
 * de toda a UI; a guarda de ano plausível é a mesma de `@shared/prazo-dates`.
 */
export function eventDayMs(value: string | Date | null | undefined): number | null {
  if (value == null) return null;
  const d = new Date(value as string);
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  if (!isPlausibleEventYear(d.getUTCFullYear())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Milissegundos de um timestamp real (updatedAt, deliveredAt), ou `null`. */
export function instantMs(value: string | Date | null | undefined): number | null {
  if (value == null) return null;
  const t = new Date(value as string).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Chave "YYYY-MM" no fuso local (mesmo bucket que o eixo do gráfico usa). */
export function monthKeyOf(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  const d = new Date(value as string);
  if (!Number.isFinite(d.getTime())) return null;
  if (!isPlausibleEventYear(d.getFullYear())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** As `count` chaves "YYYY-MM" terminando no mês de `nowMs`, da mais antiga. */
export function monthKeysEndingAt(nowMs: number, count: number): string[] {
  const ref = new Date(nowMs);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const m = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    keys.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

// ─── Recorte de período: CICLO DO EVENTO, não criação da peça ────────────────

export interface CycleWindow {
  /** Dia-calendário inicial (UTC-meia-noite), inclusive. */
  fromMs: number;
  /** Dia-calendário final (UTC-meia-noite) = hoje do negócio, inclusive. */
  toMs: number;
}

export const PERIOD_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

/**
 * Janela FECHADA de ciclos: eventos cuja saída do caminhão já aconteceu, de
 * `hoje - N dias` até hoje.
 *
 * PORQUÊ fechada e por que pela saída. O recorte anterior filtrava peças pela
 * data de CRIAÇÃO e media quantas já estavam ENTREGUES — num pipeline cujo
 * primeiro marco é -25 dias antes da saída. "Últimos 7 dias" forçava a taxa de
 * entrega para perto de zero por construção: as peças recém-criadas ainda
 * estavam rigorosamente no prazo. Recortando pelo ciclo já encerrado, o
 * denominador passa a ser trabalho que TINHA de estar pronto, e a taxa de
 * entrega volta a significar desempenho.
 *
 * O limite superior é `hoje` de propósito: incluir saídas futuras traria de
 * volta o mesmo viés, agora pelo outro lado.
 */
export function cycleWindow(period: string, nowMs: number): CycleWindow | null {
  const days = PERIOD_DAYS[period];
  if (!days) return null;
  const today = businessDayMs(nowMs);
  return { fromMs: today - days * DAY_MS, toMs: today };
}

export function isInCycleWindow(dayMs: number | null, w: CycleWindow | null): boolean {
  if (!w) return true;
  if (dayMs == null) return false;
  return dayMs >= w.fromMs && dayMs <= w.toMs;
}

/** eventId → dia-calendário da saída do caminhão (`null` = cadastro quebrado). */
export function eventCycleDayIndex(events: AnaliseEvent[]): Map<string, number | null> {
  const map = new Map<string, number | null>();
  for (const e of events) map.set(e.id, eventDayMs(e.truckDepartureDate));
  return map;
}

export interface ItemFilters {
  window: CycleWindow | null;
  eventFilter: string;
  statusFilter: string;
  sponsorFilter: string;
}

/** Uma passada com os 4 predicados — eram 4 `filter` encadeados. */
export function filterItems(
  items: AnaliseItem[],
  cycleDayByEvent: Map<string, number | null>,
  f: ItemFilters,
): AnaliseItem[] {
  const { window: w, eventFilter, statusFilter, sponsorFilter } = f;
  const allEvents = eventFilter === "all";
  const allStatus = statusFilter === "all";
  const allSponsors = sponsorFilter === "all";
  if (!w && allEvents && allStatus && allSponsors) return items;
  return items.filter((i) => {
    if (!allEvents && i.eventId !== eventFilter) return false;
    if (!allStatus && i.status !== statusFilter) return false;
    if (w && !isInCycleWindow(cycleDayByEvent.get(i.eventId) ?? null, w)) return false;
    // `sponsors[]` é o que a rota devolve. `sponsorIds` nunca existiu em
    // `items` e, com `|| []`, selecionar qualquer patrocinador zerava a tela.
    if (!allSponsors && !(i.sponsors || []).some((s) => s.id === sponsorFilter)) return false;
    return true;
  });
}

export function filterEvents(
  events: AnaliseEvent[],
  cycleDayByEvent: Map<string, number | null>,
  w: CycleWindow | null,
): AnaliseEvent[] {
  if (!w) return events;
  return events.filter((e) => isInCycleWindow(cycleDayByEvent.get(e.id) ?? null, w));
}

// ─── KPIs ────────────────────────────────────────────────────────────────────

export interface AnaliseKpis {
  /** Total do FUNIL: exclui canceladas/excluídas/arquivadas (regra do domínio). */
  totalQty: number;
  outOfFunnelQty: number;
  deliveredQty: number;
  inProdQty: number;
  approvedOrBeyondQty: number;
  deliveryRate: number;
  approvalRate: number;
  inProdRate: number;
}

/** Uma passada — eram 6 (`reduce` + 2×(`filter`+`reduce`) + `filter`+`reduce`). */
export function computeKpis(items: AnaliseItem[]): AnaliseKpis {
  let totalQty = 0, outOfFunnelQty = 0, deliveredQty = 0, inProdQty = 0, approvedOrBeyondQty = 0;
  for (const i of items) {
    const q = qtyOf(i);
    if (isOutOfFunnel(i.status)) { outOfFunnelQty += q; continue; }
    totalQty += q;
    if (isDelivered(i.status)) deliveredQty += q;
    if (isInProduction(i.status)) inProdQty += q;
    if (isApprovedOrBeyond(i.status)) approvedOrBeyondQty += q;
  }
  const pct = (n: number) => (totalQty > 0 ? (n / totalQty) * 100 : 0);
  return {
    totalQty, outOfFunnelQty, deliveredQty, inProdQty, approvedOrBeyondQty,
    deliveryRate: pct(deliveredQty),
    approvalRate: pct(approvedOrBeyondQty),
    inProdRate: pct(inProdQty),
  };
}

// ─── Série mensal ────────────────────────────────────────────────────────────

export interface MonthlyPoint {
  key: string;
  producao: number;
  entregas: number;
}

/**
 * Uma passada com um `Map` — eram 12 varreduras completas (6 meses × 2 séries),
 * cada uma chamando `format()` do date-fns por item: ~48 mil formatações por
 * render numa base de 4 mil peças.
 */
export function computeMonthly(items: AnaliseItem[], monthKeys: string[]): MonthlyPoint[] {
  const acc = new Map<string, MonthlyPoint>();
  for (const k of monthKeys) acc.set(k, { key: k, producao: 0, entregas: 0 });
  for (const i of items) {
    if (isOutOfFunnel(i.status)) continue;
    const q = qtyOf(i);
    const criado = monthKeyOf(i.createdAt);
    const pontoCriado = criado ? acc.get(criado) : undefined;
    if (pontoCriado) pontoCriado.producao += q;
    if (isDelivered(i.status)) {
      // DÍVIDA CONHECIDA (para a rota agregada): `deliveredAt` só é carimbado
      // na entrega TOTAL, então o fallback em `updatedAt` faz uma peça editada
      // hoje migrar de barra e reescrever o passado do gráfico.
      const entregue = monthKeyOf(i.deliveredAt ?? i.updatedAt);
      const pontoEntregue = entregue ? acc.get(entregue) : undefined;
      if (pontoEntregue) pontoEntregue.entregas += q;
    }
  }
  return monthKeys.map((k) => acc.get(k)!);
}

// ─── Rosca ───────────────────────────────────────────────────────────────────

export interface DonutSlice {
  key: string;
  label: string;
  colorStatus: string | null;
  qty: number;
  pct: number;
}

/**
 * Distribuição pelos grupos do funil canônico. Fora do funil não entra no
 * total; "Outros" recebe só o que o vocabulário não conhece — antes era um
 * ralo semântico onde caíam as grafias legadas em português.
 */
export function computeDonut(items: AnaliseItem[]): DonutSlice[] {
  const qtyByGroup = new Map<string, number>();
  let total = 0;
  for (const i of items) {
    if (isOutOfFunnel(i.status)) continue;
    const q = qtyOf(i);
    total += q;
    const g = flowGroupOf(i.status) ?? "outros";
    qtyByGroup.set(g, (qtyByGroup.get(g) ?? 0) + q);
  }
  if (total === 0) return [];
  const slices: DonutSlice[] = FLOW_GROUPS.map((g) => {
    const qty = qtyByGroup.get(g.key) ?? 0;
    return { key: g.key, label: g.label, colorStatus: g.colorStatus, qty, pct: Math.round((qty / total) * 100) };
  });
  const outros = qtyByGroup.get("outros") ?? 0;
  if (outros > 0) {
    // pct por diferença, piso 1%: com qty > 0, anunciar "0%" é mentira de
    // arredondamento (a soma pode dar 101% — preço aceito pela honestidade).
    slices.push({
      key: "outros", label: "Outros", colorStatus: null, qty: outros,
      pct: Math.max(1, 100 - slices.reduce((s, g) => s + g.pct, 0)),
    });
  }
  return slices.filter((s) => s.qty > 0);
}

// ─── Por tipo de peça ────────────────────────────────────────────────────────

export interface TypeRow {
  type: string;
  total: number;
  delivered: number;
  rate: number;
}

export function computeByType(items: AnaliseItem[]): TypeRow[] {
  const map = new Map<string, { type: string; total: number; delivered: number }>();
  for (const i of items) {
    if (isOutOfFunnel(i.status)) continue;
    const label = (i.type || "").trim() || "Sem tipo";
    let row = map.get(label);
    if (!row) { row = { type: label, total: 0, delivered: 0 }; map.set(label, row); }
    const q = qtyOf(i);
    row.total += q;
    if (isDelivered(i.status)) row.delivered += q;
  }
  return Array.from(map.values())
    .map((v) => ({ ...v, rate: v.total > 0 ? (v.delivered / v.total) * 100 : 0 }))
    .sort((a, b) => b.total - a.total);
}

// ─── Patrocinadores ──────────────────────────────────────────────────────────

export interface SponsorRow {
  id: string;
  name: string;
  qty: number;
}

/**
 * Volume por patrocinador a partir de `item.sponsors[]`. O bloco lia
 * `item.sponsorIds` — campo inexistente — então o ranking saía vazio SEMPRE e
 * o card nunca foi exibido uma única vez.
 *
 * Só aloca os patrocinadores que aparecem nas peças (antes montava um mapa com
 * o cadastro inteiro para depois filtrar `qty > 0`).
 */
export function computeTopSponsors(
  items: AnaliseItem[],
  sponsors: AnaliseSponsor[],
  limit = 5,
): SponsorRow[] {
  const nameById = new Map(sponsors.map((s) => [s.id, s.name]));
  const acc = new Map<string, SponsorRow>();
  for (const i of items) {
    if (isOutOfFunnel(i.status)) continue;
    const q = qtyOf(i);
    for (const s of i.sponsors || []) {
      if (!s?.id) continue;
      let row = acc.get(s.id);
      if (!row) {
        row = { id: s.id, name: nameById.get(s.id) ?? s.name ?? "Sem nome", qty: 0 };
        acc.set(s.id, row);
      }
      row.qty += q;
    }
  }
  return Array.from(acc.values()).sort((a, b) => b.qty - a.qty).slice(0, limit);
}

// ─── Central Operacional ─────────────────────────────────────────────────────

export interface AnaliseAlert {
  tag: string;
  title: string;
  desc: string;
  eventId?: string;
  /** true = a regra olha TODOS os eventos, ignorando os filtros da tela. */
  ignoraFiltros: boolean;
}

const AWAITING_DECISION_SET = new Set(AWAITING_DECISION_STATUSES);
const READY_SET = new Set(READY_FOR_PRODUCTION_STATUSES);

const plural = (n: number, s: string, p: string) => (n === 1 ? s : p);

/** "em 8h" / "em 3 dias" — ninguém raciocina em 71 horas. */
export function fmtSaidaEm(hours: number): string {
  if (hours < 24) return `em ${Math.max(0, Math.round(hours))}h`;
  const dias = Math.round(hours / 24);
  return `em ${dias} ${plural(dias, "dia", "dias")}`;
}

export function computeAlerts(args: {
  events: AnaliseEvent[];
  items: AnaliseItem[];
  nowMs: number;
  limit?: number;
}): AnaliseAlert[] {
  const { events, items, nowMs, limit = 4 } = args;
  const list: AnaliseAlert[] = [];

  // A urgência do negócio é `events.priority === "urgente"` (schema:27), com
  // visual canônico em `lib/status.ts`. A regra anterior comparava
  // `event.status === "urgent"` — string que NENHUMA rota grava e que aparecia
  // uma única vez em todo o repositório: o alerta jamais disparou.
  const urgentes = events.filter((e) => e.priority === "urgente");
  if (urgentes.length > 0) {
    const e = urgentes[0];
    const extra = urgentes.length - 1;
    list.push({
      tag: "URGENTE",
      title: `Evento Urgente: ${e.name}`,
      desc: extra > 0
        ? `Verificar as peças pendentes — e mais ${extra} ${plural(extra, "evento urgente", "eventos urgentes")}.`
        : "Verificar todos os itens pendentes.",
      eventId: e.id,
      ignoraFiltros: true,
    });
  }

  let staleQty = 0;
  let staleEventId: string | undefined;
  let readyQty = 0;
  let readyEventId: string | undefined;
  for (const i of items) {
    const q = qtyOf(i);
    if (AWAITING_DECISION_SET.has(i.status)) {
      const upd = instantMs(i.updatedAt);
      if (upd != null && (nowMs - upd) / HOUR_MS > 24) {
        staleQty += q;
        staleEventId = staleEventId ?? i.eventId;
      }
    } else if (READY_SET.has(i.status)) {
      readyQty += q;
      readyEventId = readyEventId ?? i.eventId;
    }
  }
  if (staleQty > 0) {
    list.push({
      tag: "APROVAÇÃO PENDENTE",
      title: `${staleQty} ${plural(staleQty, "peça sem decisão", "peças sem decisão")}`,
      // "sem movimento" e não "parada": `updatedAt` é tocado por qualquer
      // edição da linha, então isto é aproximação — a mesma que a Gestão de
      // Prazos declara em vez de afirmar.
      desc: "Sem movimento há mais de 24h em aprovação ou revisão.",
      eventId: staleEventId,
      ignoraFiltros: false,
    });
  }
  if (readyQty > 0) {
    list.push({
      tag: "PRODUÇÃO",
      title: `${readyQty} ${plural(readyQty, "peça aguardando gráfica", "peças aguardando gráfica")}`,
      desc: "Liberadas pela Arte, ainda não iniciadas na produção.",
      eventId: readyEventId,
      ignoraFiltros: false,
    });
  }

  const nearDep = events
    .map((e) => {
      const dep = instantMs(e.truckDepartureDate);
      const day = eventDayMs(e.truckDepartureDate);
      if (dep == null || day == null) return null;
      return { e, hours: (dep - nowMs) / HOUR_MS };
    })
    .filter((x): x is { e: AnaliseEvent; hours: number } => !!x && x.hours > 0 && x.hours < 72)
    .sort((a, b) => a.hours - b.hours);
  if (nearDep.length > 0) {
    const { e, hours } = nearDep[0];
    const extra = nearDep.length - 1;
    list.push({
      tag: "SAÍDA IMINENTE",
      title: `${e.name} — saída ${fmtSaidaEm(hours)}`,
      desc: extra > 0
        ? `Confirmar que tudo está pronto — e mais ${extra} ${plural(extra, "saída", "saídas")} em até 72h.`
        : "Confirmar que todos os itens estão prontos para envio.",
      eventId: e.id,
      ignoraFiltros: true,
    });
  }

  return list.slice(0, limit);
}
