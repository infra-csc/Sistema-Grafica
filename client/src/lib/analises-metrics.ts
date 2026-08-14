// Base da tela de Análises: tipos do payload, âncoras de data e recorte de
// período. Sem React, sem date-fns, sem I/O.
//
// PORQUÊ este arquivo existe:
//  1. A tela fazia ~32 varreduras completas da lista de peças POR RENDER, e a
//     memoização era decorativa porque a âncora de data (`subDays(new Date())`)
//     nascia nova a cada render. Aqui cada agregado é UMA passada e recebe o
//     "agora" por parâmetro — quem chama controla a estabilidade.
//  2. `format()` do date-fns LANÇA em data inválida, e a tela é um componente
//     só, sem error boundary: uma data ruim derrubava a página inteira. Aqui
//     toda leitura de data devolve `null` em vez de lançar.
//  3. Regra de negócio dentro de componente não tem teste. Aqui tem
//     (`server/__tests__/analises-metrics.test.ts`).
import { isPlausibleEventYear } from "@shared/prazo-dates";
import { isOutOfFunnel } from "./analises-status";

export const DAY_MS = 86_400_000;

// ─── Tipos mínimos do que a API realmente devolve ────────────────────────────
// Estrutural de propósito: a query era `useQuery<any[]>` e foi exatamente o
// `any` que apagou o erro de `i.sponsorIds` (campo que não existe em `items`;
// `GET /api/items` entrega `sponsors: [...]`, montado por
// `enrichItemsWithEventsAndSponsors`). Todo campo listado aqui foi conferido
// em `shared/schema.ts` antes de entrar.

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
  /** `decimal(10,2)` — o driver devolve STRING, nunca número. */
  calculatedM2?: string | number | null;
  createdAt: string | Date;
  /** Carimbado só na entrega TOTAL (`isFullDelivery` em routes/items.ts). */
  deliveredAt?: string | Date | null;
  producedAt?: string | Date | null;
  conferredAt?: string | Date | null;
  /** Reprovação EM ABERTO — as duas flags são limpas quando a peça reanda. */
  rejectedBySponsor?: boolean | null;
  rejectedByCreator?: boolean | null;
  /** Arquivo final substituído pela Arte: marca DURÁVEL de refação. */
  previousFinalFileUrl?: string | null;
  /** Layout de aprovação substituído pela Arte: idem. */
  previousApprovalThumbUrl?: string | null;
  /** Peça-filha de complemento (quantidade extra depois da produção). */
  complementSeq?: number | null;
  /** Vínculo peça↔patrocinador entregue pela rota. NUNCA `sponsorIds`. */
  sponsors?: AnaliseSponsorRef[] | null;
}

export interface AnaliseEvent {
  id: string;
  name: string;
  truckDepartureDate?: string | Date | null;
  createdAt: string | Date;
}

export interface AnaliseSponsor {
  id: string;
  name: string;
}

export const qtyOf = (i: { quantity?: number | null }): number => i.quantity || 1;

/**
 * m² do item. `calculatedM2` já é `quantidade × largura × altura` (o servidor
 * recalcula em `deriveCalculatedM2`), então NÃO se multiplica por quantidade de
 * novo. Devolve `null` quando o item não tem medida de arquivo — e "sem medida"
 * precisa ser contado à parte, não somado como zero.
 */
export function m2Of(i: { calculatedM2?: string | number | null }): number | null {
  if (i.calculatedM2 == null) return null;
  const n = typeof i.calculatedM2 === "number" ? i.calculatedM2 : parseFloat(i.calculatedM2);
  return Number.isFinite(n) && n > 0 ? n : null;
}

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

/** Milissegundos de um timestamp real (deliveredAt, producedAt), ou `null`. */
export function instantMs(value: string | Date | null | undefined): number | null {
  if (value == null) return null;
  const t = new Date(value as string).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Dia-calendário de um timestamp REAL, no fuso do negócio.
 *
 * É o que permite comparar `deliveredAt` (instante UTC) com
 * `truckDepartureDate` (data wall-clock) sem que uma entrega das 22h de sexta
 * em Brasília caia no sábado e vire "fora do prazo" por fuso.
 */
export function instantDayMs(value: string | Date | null | undefined): number | null {
  const t = instantMs(value);
  if (t == null) return null;
  const day = businessDayMs(t);
  return isPlausibleEventYear(new Date(day).getUTCFullYear()) ? day : null;
}

// ─── Recorte de período: CICLO DO EVENTO, não criação da peça ────────────────

export interface CycleWindow {
  /** Dia-calendário inicial (UTC-meia-noite), inclusive. */
  fromMs: number;
  /** Dia-calendário final (UTC-meia-noite), inclusive. */
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

/**
 * A janela imediatamente anterior, do mesmo tamanho e sem sobreposição.
 *
 * É o denominador da comparação dos KPIs. Devolve `null` para "Todo o período"
 * — e a tela precisa DIZER que não há comparação, em vez de inventar uma: um
 * "0%" no lugar da variação seria lido como "não mudou nada".
 */
export function previousWindow(w: CycleWindow | null): CycleWindow | null {
  if (!w) return null;
  const len = w.toMs - w.fromMs;
  return { fromMs: w.fromMs - len - DAY_MS, toMs: w.fromMs - DAY_MS };
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
  sponsorFilter: string;
}

/**
 * Uma passada com os predicados — eram 4 `filter` encadeados.
 *
 * Não há mais filtro de STATUS: numa tela de razões e tempos ele tornava todo
 * KPI tautológico (escolher "Entregue" produzia "taxa de entrega 100%").
 */
export function filterItems(
  items: AnaliseItem[],
  cycleDayByEvent: Map<string, number | null>,
  f: ItemFilters,
): AnaliseItem[] {
  const { window: w, eventFilter, sponsorFilter } = f;
  const allEvents = eventFilter === "all";
  const allSponsors = sponsorFilter === "all";
  if (!w && allEvents && allSponsors) return items;
  return items.filter((i) => {
    if (!allEvents && i.eventId !== eventFilter) return false;
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

// ─── Período de abertura ─────────────────────────────────────────────────────

/**
 * Ordem em que os períodos são tentados na abertura. Do mais recente para o
 * mais largo: quanto mais curta a janela, mais o número fala do agora.
 */
export const DEFAULT_PERIOD_ORDER = ["30d", "90d"] as const;

/**
 * Período com que a tela ABRE quando a URL não traz um.
 *
 * PORQUÊ isto existe: sem período, os quatro KPIs abriam dizendo "Escolha um
 * período para comparar". Estava correto — "Todo o período" não tem janela
 * anterior, então não há comparação a fazer —, mas o primeiro contato com a
 * tela eram quatro cartões que não comparavam nada. Um painel que abre pedindo
 * configuração antes de responder não é um painel.
 *
 * PORQUÊ 30 dias e não 7: o recorte é por SAÍDA DE CAMINHÃO já ocorrida, e a
 * casa tem poucas dezenas de eventos por ano — uma janela de 7 dias tem chance
 * real de não conter nenhum ciclo fechado, e a tela abriria vazia, que é pior
 * do que abrir sem comparação. 30 dias é o menor degrau que acompanha o ritmo
 * mensal da operação.
 *
 * PORQUÊ a escolha é MEDIDA e não fixa: o padrão só vale se ele de fato
 * entregar o que promete. Um período é aceito apenas quando existe peça na
 * janela ATUAL **e** na ANTERIOR — sem as duas, a comparação continuaria em
 * branco e o padrão não teria resolvido nada. Não havendo nenhum candidato que
 * satisfaça isso, devolve "all" e a tela volta a DIZER que não há comparação,
 * em vez de inventar uma.
 *
 * Canceladas e excluídas não contam: são as mesmas peças que já ficam fora de
 * todo denominador da tela.
 */
export function pickDefaultPeriod(
  items: AnaliseItem[],
  cycleDayByEvent: Map<string, number | null>,
  nowMs: number,
  candidatos: readonly string[] = DEFAULT_PERIOD_ORDER,
): string {
  for (const p of candidatos) {
    const atualW = cycleWindow(p, nowMs);
    const anteriorW = previousWindow(atualW);
    if (!atualW || !anteriorW) continue;
    let atual = 0;
    let anterior = 0;
    for (const i of items) {
      if (isOutOfFunnel(i.status)) continue;
      const dia = cycleDayByEvent.get(i.eventId) ?? null;
      if (dia == null) continue;
      if (isInCycleWindow(dia, atualW)) atual++;
      else if (isInCycleWindow(dia, anteriorW)) anterior++;
      if (atual > 0 && anterior > 0) return p;
    }
  }
  return "all";
}
