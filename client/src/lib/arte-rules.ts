// ─────────────────────────────────────────────────────────────────────────────
// Regras PURAS da tela de Arte.
//
// PORQUÊ ESTE ARQUIVO EXISTE. A tela tinha o mesmo recorte escrito em quatro
// lugares que divergiram na prática: o predicado completo em `itemsByTab`, uma
// versão pela metade em `correcaoCount`, outra pela metade em `baseItems` da
// aba Correção, e literais de status soltos nos gates dos modais. O resultado
// era o chip "Ativos: Saída 10 dias" aceso enquanto a aba Correção devolvia a
// lista inteira, e a seção "Substituir Arquivo Final" simplesmente não existir
// para peças com status legado.
//
// Tudo o que é decisão de negócio (que status entra em que aba, o que passa no
// filtro, como um arquivo casa com uma peça, qual marco de prazo vale para a
// fase) mora aqui, sem React, e é testado em server/__tests__/arte-rules.test.ts.
//
// Os recortes de status derivam de PRODUCTION_STATUSES (lib/status.ts) — a
// fonte única do app — em vez de repetir os nomes canônicos.
// ─────────────────────────────────────────────────────────────────────────────
import { PRODUCTION_STATUSES } from "./status";
import { toUTCDisplayDate } from "./utils";

// ── Recortes de status por fase ─────────────────────────────────────────────
// Os aliases em português (pronto_para_producao, liberado, em_producao,
// produzido, entregue) continuam aceitos: ainda circulam no banco e uma peça
// gravada assim precisa aparecer na aba Finalizados E abrir a substituição de
// arquivo final. Era exatamente esse o gate que nunca disparava.
export const FINALIZADOS_STATUSES: string[] = [
  "awaiting_final_review",
  "ready_for_production",
  "pronto_para_producao",
  "liberado",
  "approved",
  ...PRODUCTION_STATUSES, // inProduction, produced, conferred, delivered
  "em_producao",
  "produzido",
  "entregue",
];

export const TAB_STATUSES: Record<string, string[]> = {
  "criar-aprovacoes": ["awaiting_submission"],
  "aguardando-patrocinador": ["awaiting_sponsor_approval"],
  "finalizar-layouts": ["sponsor_approved", "awaiting_creator_review"],
  finalizados: FINALIZADOS_STATUSES,
};

/** Ordem das abas na barra de fases. "correcao" vem de outra rota. */
export const ARTE_TAB_IDS = [
  "criar-aprovacoes",
  "aguardando-patrocinador",
  "correcao",
  "finalizar-layouts",
  "finalizados",
] as const;
export type ArteTabId = (typeof ARTE_TAB_IDS)[number];

export function isArteTabId(v: string | null | undefined): v is ArteTabId {
  return !!v && (ARTE_TAB_IDS as readonly string[]).includes(v);
}

/** Status em que a Arte pode dispensar a peça (liberar direto para produção). */
export const DISPENSAVEIS_STATUSES: string[] = [
  "awaiting_submission",
  "sponsor_approved",
  "awaiting_creator_review",
];

// Peças "da Arte" para exportação/book: tudo que está no fluxo da tela mais as
// já liberadas para produção (mas não as produzidas/entregues, que não fazem
// sentido num book de aprovação).
export const ARTE_POOL_STATUSES: string[] = [
  ...TAB_STATUSES["criar-aprovacoes"],
  ...TAB_STATUSES["aguardando-patrocinador"],
  ...TAB_STATUSES["finalizar-layouts"],
  "ready_for_production",
  "pronto_para_producao",
  "liberado",
];

/**
 * Prioridade de evento. O schema grava `urgente` (shared/schema.ts), mas
 * `urgent` sobrevive como grafia LEGADA em dados antigos — o filtro comparava
 * só com a legada e por isso nunca devolvia nada. As duas contam.
 */
export function isUrgente(priority: string | null | undefined): boolean {
  return priority === "urgente" || priority === "urgent";
}

// ── Filtros ─────────────────────────────────────────────────────────────────

export interface ArteFilters {
  search: string;
  eventIds: string[];
  sponsorIds: string[];
  types: string[];
  materials: string[];
  months: string[];
  next10Days: boolean;
  urgente: boolean;
  /** "todos" | "com" | "sem" — pares mutuamente exclusivos viraram tri-estado. */
  thumb: TriState;
  final: TriState;
  period: PeriodFilter;
}

export type TriState = "todos" | "com" | "sem";
export const PERIOD_FILTERS = ["Todos", "Hoje", "7 dias", "15 dias", "30 dias"] as const;
export type PeriodFilter = (typeof PERIOD_FILTERS)[number];

export const EMPTY_ARTE_FILTERS: ArteFilters = {
  search: "",
  eventIds: [],
  sponsorIds: [],
  types: [],
  materials: [],
  months: [],
  next10Days: false,
  urgente: false,
  thumb: "todos",
  final: "todos",
  period: "Todos",
};

/** Marcos de data calculados UMA vez por passada, não por item. */
export interface DateBounds {
  today: Date;
  tomorrow: Date;
  tenDays: Date;
  in7: Date;
  in15: Date;
  in30: Date;
}

export function makeDateBounds(now: Date = new Date()): DateBounds {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const add = (d: number) => {
    const x = new Date(today);
    x.setDate(x.getDate() + d);
    return x;
  };
  return { today, tomorrow: add(1), tenDays: add(10), in7: add(7), in15: add(15), in30: add(30) };
}

/**
 * Predicado ÚNICO da tela. Alimenta as quatro abas de status, a contagem da aba
 * Correção e a lista da própria aba Correção — antes eram três implementações e
 * duas delas ignoravam metade dos filtros que os chips diziam estar ligados.
 *
 * `search` já deve chegar em minúsculas (o chamador tem o valor deferido).
 */
export function matchesArteFilters(item: any, f: ArteFilters, b: DateBounds): boolean {
  if (f.eventIds.length && !f.eventIds.includes(item.eventId)) return false;
  if (f.types.length && !f.types.includes(item.type)) return false;
  if (f.materials.length && !f.materials.includes(item.material)) return false;

  // Item sem data de saída fica DE FORA quando um filtro de data está ativo —
  // antes ele passava e "Saída 10 dias" listava eventos sem saída nenhuma.
  // toUTCDisplayDate: mesma base do rótulo "Saída" do cabeçalho (que exibe em
  // UTC); calcular em local divergia perto da meia-noite.
  const depRaw = item.event?.truckDepartureDate;
  if (f.next10Days) {
    if (!depRaw) return false;
    const dep = toUTCDisplayDate(depRaw);
    if (!(dep >= b.today && dep <= b.tenDays)) return false;
  }
  if (f.months.length) {
    if (!depRaw) return false;
    if (!f.months.includes((toUTCDisplayDate(depRaw).getMonth() + 1).toString())) return false;
  }
  if (f.search) {
    const hit = [item.displayId, item.type, item.description, item.event?.name].some(
      (v: any) => v && String(v).toLowerCase().includes(f.search),
    );
    if (!hit) return false;
  }
  if (f.sponsorIds.length && !(item.sponsors ?? []).some((s: any) => f.sponsorIds.includes(s.id)))
    return false;
  if (f.thumb === "sem" && item.approvalThumbUrl) return false;
  if (f.thumb === "com" && !item.approvalThumbUrl) return false;
  if (f.final === "sem" && item.finalFileUrl) return false;
  if (f.final === "com" && !item.finalFileUrl) return false;
  if (f.urgente && !isUrgente(item.event?.priority)) return false;

  if (f.period !== "Todos") {
    if (!depRaw) return false; // sem data de saída, não pertence a nenhum período
    const dep = toUTCDisplayDate(depRaw);
    // Os três períodos longos só tinham teto: "7 dias" devolvia os próximos 7
    // SOMADOS a todo o histórico já despachado. Piso e teto, como o "Hoje" e o
    // toggle "Saída 10 dias" sempre fizeram.
    const ceil =
      f.period === "Hoje" ? b.tomorrow : f.period === "7 dias" ? b.in7 : f.period === "15 dias" ? b.in15 : b.in30;
    if (f.period === "Hoje") {
      if (!(dep >= b.today && dep < ceil)) return false;
    } else if (!(dep >= b.today && dep <= ceil)) return false;
  }
  return true;
}

/** Quantos filtros estão ativos (para o rótulo "N filtros ativos"). */
export function countActiveFilters(f: ArteFilters): number {
  let n = 0;
  if (f.search) n++;
  n += f.eventIds.length + f.sponsorIds.length + f.types.length + f.materials.length;
  if (f.months.length) n++;
  if (f.next10Days) n++;
  if (f.urgente) n++;
  if (f.thumb !== "todos") n++;
  if (f.final !== "todos") n++;
  if (f.period !== "Todos") n++;
  return n;
}

/**
 * Chave estável do recorte. A paginação era reiniciada pela IDENTIDADE do
 * objeto de baldes, e o WebSocket troca essa identidade a cada `item_updated` —
 * quem clicou "Carregar mais" três vezes perdia a posição sem ter feito nada.
 */
export function filtersKey(f: ArteFilters, tab: string): string {
  return [
    tab,
    f.search,
    f.eventIds.join("|"),
    f.sponsorIds.join("|"),
    f.types.join("|"),
    f.materials.join("|"),
    f.months.join("|"),
    f.next10Days ? "1" : "",
    f.urgente ? "1" : "",
    f.thumb,
    f.final,
    f.period,
  ].join("~");
}

// ── Filtros na URL ──────────────────────────────────────────────────────────
// Só os valores fora do padrão entram, para que o estado limpo continue sendo
// uma URL limpa. Nomes em pt-BR: a URL é compartilhada entre colegas.

export function serializeArteFilters(f: ArteFilters, tab: string): string {
  const p = new URLSearchParams();
  if (tab && tab !== "criar-aprovacoes") p.set("fase", tab);
  if (f.search) p.set("busca", f.search);
  if (f.eventIds.length) p.set("evento", f.eventIds.join(","));
  if (f.sponsorIds.length) p.set("patrocinador", f.sponsorIds.join(","));
  if (f.types.length) p.set("tipo", f.types.join(","));
  if (f.materials.length) p.set("material", f.materials.join(","));
  if (f.months.length) p.set("mes", f.months.join(","));
  if (f.next10Days) p.set("saida10", "1");
  if (f.urgente) p.set("urgente", "1");
  if (f.thumb !== "todos") p.set("thumb", f.thumb);
  if (f.final !== "todos") p.set("final", f.final);
  if (f.period !== "Todos") p.set("periodo", f.period);
  return p.toString();
}

function list(p: URLSearchParams, key: string): string[] {
  return (p.get(key) ?? "").split(",").filter(Boolean);
}

function tri(p: URLSearchParams, key: string): TriState {
  const v = p.get(key);
  return v === "com" || v === "sem" ? v : "todos";
}

export function parseArteFilters(search: string): { filters: ArteFilters; tab: ArteTabId | null } {
  const p = new URLSearchParams(search);
  const period = p.get("periodo");
  return {
    tab: isArteTabId(p.get("fase")) ? (p.get("fase") as ArteTabId) : null,
    filters: {
      search: p.get("busca") ?? "",
      eventIds: list(p, "evento"),
      sponsorIds: list(p, "patrocinador"),
      types: list(p, "tipo"),
      materials: list(p, "material"),
      months: list(p, "mes"),
      next10Days: p.get("saida10") === "1",
      urgente: p.get("urgente") === "1",
      thumb: tri(p, "thumb"),
      final: tri(p, "final"),
      period: (PERIOD_FILTERS as readonly string[]).includes(period ?? "")
        ? (period as PeriodFilter)
        : "Todos",
    },
  };
}

// ── Quantidade ──────────────────────────────────────────────────────────────
/**
 * `String(q || '—').padStart(2,'0')` transformava peça sem quantidade em
 * "0—", em negrito, numa coluna numérica de produção.
 */
export function formatQuantity(quantity: unknown): string {
  const n = typeof quantity === "number" ? quantity : Number(quantity);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return String(n).padStart(2, "0");
}

// ── Vínculo automático do multi-upload ──────────────────────────────────────

export interface FileMatchCandidates {
  /** Números de 3+ dígitos achados no nome, na ordem em que aparecem. */
  numbers: string[];
  /** Ordem de tentativa: o ÚLTIMO número primeiro (convenção de nomenclatura). */
  ordered: string[];
  /** true quando há mais de um candidato ou um deles parece um ano. */
  ambiguous: boolean;
}

const YEAR_RE = /^(19|20)\d{2}$/;

/**
 * "banner_2024_0277.jpg" tem dois candidatos ("2024" e "0277") e a versão
 * antiga casava com o PRIMEIRO — podia vincular à peça de displayId 2024 e
 * ninguém via. O último número do nome é a convenção real de quem exporta, e
 * um candidato que parece ano nunca é tentado antes dos outros.
 */
export function fileMatchCandidates(fileName: string): FileMatchCandidates {
  const numbers = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/\D/g, " ")
    .trim()
    .split(/\s+/)
    .filter((n) => n.length >= 3);
  const reversed = [...numbers].reverse();
  const ordered = [
    ...reversed.filter((n) => !YEAR_RE.test(n)),
    ...reversed.filter((n) => YEAR_RE.test(n)),
  ];
  return {
    numbers,
    ordered,
    ambiguous: numbers.length > 1 || numbers.some((n) => YEAR_RE.test(n)),
  };
}

/** Normaliza um displayId para comparação numérica ("#0062-C1" → "0062"). */
export function normalizeDisplayId(displayId: unknown): string {
  return String(displayId ?? "").replace(/\D/g, "").padStart(4, "0");
}

/**
 * Casa um arquivo com uma peça do pool. `taken` são as peças já vinculadas por
 * outro card (dois arquivos não podem apontar para a mesma peça).
 */
export function matchFileToItem<T extends { id: string; displayId?: string | null }>(
  fileName: string,
  pool: T[],
  taken: Set<string>,
): { item: T | null; ambiguous: boolean } {
  const { ordered, ambiguous } = fileMatchCandidates(fileName);
  for (const num of ordered) {
    const target = num.padStart(4, "0");
    const hit = pool.find((i) => !taken.has(i.id) && normalizeDisplayId(i.displayId) === target);
    if (hit) return { item: hit, ambiguous };
  }
  return { item: null, ambiguous: false };
}

// ── Prazo por fase ──────────────────────────────────────────────────────────

/** Marco relevante para cada fase da Arte, ancorado na saída do caminhão. */
export const PHASE_DEADLINE: Record<string, { label: string; field: string; fallback: number }> = {
  "criar-aprovacoes": { label: "Entrega de Layouts", field: "deadlineEntregaLayouts", fallback: -20 },
  correcao: { label: "Entrega de Layouts", field: "deadlineEntregaLayouts", fallback: -20 },
  "aguardando-patrocinador": { label: "Aprovação de Layout", field: "deadlineAprovacaoLayout", fallback: -12 },
  "finalizar-layouts": { label: "Aprovação de Layout", field: "deadlineAprovacaoLayout", fallback: -12 },
  finalizados: { label: "Saída do caminhão", field: "", fallback: 0 },
};

export interface PhaseDeadline {
  label: string;
  date: Date;
  /** Dias restantes: negativo = atrasado, 0 = vence hoje. */
  diff: number;
}

/**
 * Prazo da fase para um evento. `null` quando o evento não tem saída marcada —
 * aí não há âncora e qualquer número seria inventado.
 */
export function phaseDeadline(
  event: any,
  tab: string,
  today: Date = makeDateBounds().today,
): PhaseDeadline | null {
  const raw = event?.truckDepartureDate;
  if (!raw) return null;
  const cfg = PHASE_DEADLINE[tab] ?? PHASE_DEADLINE["criar-aprovacoes"];
  const offset = cfg.field ? (event[cfg.field] ?? cfg.fallback) : 0;
  const d = new Date(toUTCDisplayDate(raw).getTime() + offset * 86400000);
  d.setHours(0, 0, 0, 0);
  return {
    label: cfg.label,
    date: d,
    diff: Math.ceil((d.getTime() - today.getTime()) / 86400000),
  };
}

/**
 * Ordena os eventos de uma aba por urgência do marco da fase. Evento sem saída
 * marcada vai para o fim: sem âncora não dá para dizer que é urgente.
 */
export function compareEventUrgency(a: any, b: any, tab: string, today?: Date): number {
  const da = phaseDeadline(a, tab, today);
  const db = phaseDeadline(b, tab, today);
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return da.date.getTime() - db.date.getTime();
}

// ── Recorte temporal padrão da aba Finalizados ──────────────────────────────
/**
 * A aba Finalizados acumula produzido/conferido/entregue e nunca para de
 * crescer. O padrão passa a ser os últimos 90 dias por saída do caminhão, com
 * saída explícita ("ver tudo") — a aba continua servindo de conferência
 * recente sem pagar a ordenação do histórico inteiro.
 */
export const FINALIZADOS_JANELA_DIAS = 90;

export function dentroDaJanelaFinalizados(
  item: any,
  today: Date,
  dias = FINALIZADOS_JANELA_DIAS,
): boolean {
  const raw = item.event?.truckDepartureDate;
  if (!raw) return true; // sem saída marcada não dá para excluir por data
  const dep = toUTCDisplayDate(raw);
  const piso = new Date(today);
  piso.setDate(piso.getDate() - dias);
  return dep >= piso;
}
