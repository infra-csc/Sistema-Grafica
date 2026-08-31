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
  /**
   * Só o que já passou do marco da FASE (ver `isAtrasadaNaFase`).
   *
   * NÃO é avaliado por `matchesArteFilters`: o marco depende da fase em que a
   * peça está, e `matchesArteFilters` roda ANTES do balde por fase existir.
   * Quem aplica é `filtrarAtrasadasDaFase`, já com a fase do balde em mãos.
   * Ele mora aqui mesmo assim porque é filtro para todo o resto — URL,
   * contagem de filtros ativos, chave de recorte e chip de "Ativos:".
   */
  atrasado: boolean;
}

export type TriState = "todos" | "com" | "sem";
export const PERIOD_FILTERS = ["Todos", "Hoje", "7 dias", "15 dias", "30 dias"] as const;
export type PeriodFilter = (typeof PERIOD_FILTERS)[number];

/**
 * A ORDEM da lista. Mora FORA de `ArteFilters` de propósito: ordenação não é
 * filtro (job 6 do vocabulário em components/filter-select.tsx) — não tira
 * linha nenhuma, sempre vale alguma e não tem o que limpar. Se entrasse no
 * objeto de filtros, viraria +1 em `countActiveFilters`, ganharia chip de
 * "Ativos:" com um × que não teria o que apagar, e mudaria `filtersKey`,
 * reiniciando a paginação de quem só quis reordenar o que já estava vendo.
 * Ela viaja na URL mesmo assim porque a URL da Arte é mandada entre colegas:
 * "a fila por prazo" é metade do que se está mostrando quando se manda o link.
 */
export const ARTE_SORT_MODES = ["evento", "prazo"] as const;
export type ArteSortMode = (typeof ARTE_SORT_MODES)[number];
// PRAZO é o padrão (decisão do dono, 31/08): a fila abre como fila de
// trabalho — o marco mais apertado no topo — e não como lista organizada por
// evento. "Por evento" continua a um clique e viaja na URL (?ordem=evento).
export const ARTE_SORT_PADRAO: ArteSortMode = "prazo";

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
  atrasado: false,
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
  if (f.atrasado) n++;
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
    f.atrasado ? "1" : "",
  ].join("~");
}

// ── Filtros na URL ──────────────────────────────────────────────────────────
// Só os valores fora do padrão entram, para que o estado limpo continue sendo
// uma URL limpa. Nomes em pt-BR: a URL é compartilhada entre colegas.

export function serializeArteFilters(
  f: ArteFilters,
  tab: string,
  sort: ArteSortMode = ARTE_SORT_PADRAO,
): string {
  const p = new URLSearchParams();
  if (tab && tab !== "criar-aprovacoes") p.set("fase", tab);
  // Só a ordem NÃO-padrão entra, pela mesma regra dos filtros: estado limpo
  // continua sendo URL limpa.
  if (sort !== ARTE_SORT_PADRAO) p.set("ordem", sort);
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
  if (f.atrasado) p.set("atrasados", "1");
  return p.toString();
}

function list(p: URLSearchParams, key: string): string[] {
  return (p.get(key) ?? "").split(",").filter(Boolean);
}

function tri(p: URLSearchParams, key: string): TriState {
  const v = p.get(key);
  return v === "com" || v === "sem" ? v : "todos";
}

export function parseArteFilters(
  search: string,
): { filters: ArteFilters; tab: ArteTabId | null; sort: ArteSortMode } {
  const p = new URLSearchParams(search);
  const period = p.get("periodo");
  const ordem = p.get("ordem");
  return {
    tab: isArteTabId(p.get("fase")) ? (p.get("fase") as ArteTabId) : null,
    sort: (ARTE_SORT_MODES as readonly string[]).includes(ordem ?? "")
      ? (ordem as ArteSortMode)
      : ARTE_SORT_PADRAO,
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
      atrasado: p.get("atrasados") === "1",
    },
  };
}

// ── Quantidade ──────────────────────────────────────────────────────────────
/**
 * `String(q || '—').padStart(2,'0')` transformava peça sem quantidade em
 * "0—", em negrito, numa coluna numérica de produção.
 *
 * E o zero à esquerda também caiu: quantidade é NÚMERO, não código de peça.
 * "01 banner" é como se lê um identificador, não como se lê uma contagem — e
 * na mesma linha o displayId ("#1725") já é o campo com cara de código.
 */
export function formatQuantity(quantity: unknown): string {
  const n = typeof quantity === "number" ? quantity : Number(quantity);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return String(n);
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

/**
 * Marco relevante para cada fase da Arte, ancorado na saída do caminhão.
 *
 * ESTE MAPA É UM ESPELHO de `STAGE_DEFS` (server/services/prazo-domain.ts) — o
 * funil da Gestão de Prazos e esta tela cobram a MESMA peça, e por isso têm que
 * cobrar pela MESMA data. Cada linha aqui aponta para a etapa do funil cujos
 * `pendingStatuses` são exatamente os `TAB_STATUSES` da aba:
 *
 *   criar-aprovacoes (awaiting_submission) ............ layouts     (−20)
 *   correcao (peça devolvida, refaz o layout) ......... layouts     (−20)
 *   aguardando-patrocinador (awaiting_sponsor_...) .... aprovacao   (−12)
 *   finalizar-layouts (sponsor_approved,
 *                      awaiting_creator_review) ....... finalizacao (−10)
 *
 * PORQUÊ "Finalizar arte" é cobrada por FINALIZAÇÃO e não mais por Aprovação de
 * Layout. Até a criação da etapa Finalização, anexar o arquivo final não tinha
 * marco próprio e a aba pegava emprestado o da aprovação (−12) — a peça aprovada
 * no dia −12 aparecia como já vencida no instante em que caía nesta aba, porque
 * o marco que a media era o da etapa ANTERIOR, já cumprida. O funil ganhou
 * `finalizacao` (−10) exatamente para esse trabalho: são os mesmos três status,
 * é a mesma peça, e agora é a mesma data nas duas telas.
 *
 * `allDays` replica o campo homônimo de `StageDef`: os marcos do funil não caem
 * em fim de semana (ver `phaseDeadline`). A exceção é Finalizados, cujo "marco"
 * é a própria saída do caminhão — data real de despacho, que não se antecipa
 * por ser sábado.
 */
export const PHASE_DEADLINE: Record<
  string,
  { label: string; field: string; fallback: number; allDays: boolean }
> = {
  "criar-aprovacoes": { label: "Entrega de Layouts", field: "deadlineEntregaLayouts", fallback: -20, allDays: false },
  correcao: { label: "Entrega de Layouts", field: "deadlineEntregaLayouts", fallback: -20, allDays: false },
  "aguardando-patrocinador": { label: "Aprovação de Layout", field: "deadlineAprovacaoLayout", fallback: -12, allDays: false },
  "finalizar-layouts": { label: "Finalização", field: "deadlineFinalizacao", fallback: -10, allDays: false },
  finalizados: { label: "Saída do caminhão", field: "", fallback: 0, allDays: true },
};

/**
 * Marcos que a faixa do evento exibe, na ordem do funil. São as FASES (não
 * rótulos soltos): a faixa reusa `phaseDeadline`, então a data do chip é
 * necessariamente a mesma da coluna "Prazo" e do selo de atraso.
 */
export const ARTE_MARCOS_FAIXA = [
  "criar-aprovacoes",
  "aguardando-patrocinador",
  "finalizar-layouts",
] as const;

export interface PhaseDeadline {
  label: string;
  date: Date;
  /** Dias restantes: negativo = atrasado, 0 = vence hoje. */
  diff: number;
}

/**
 * Antecipa/adia o marco que cai no fim de semana — sábado → sexta, domingo →
 * segunda.
 *
 * PORQUÊ ISTO EXISTE AQUI. É a segunda metade de `stageDeadline`
 * (server/services/prazo-domain.ts): sem ela, a mesma peça tinha DUAS datas de
 * prazo, uma na Gestão de Prazos (ajustada) e outra nesta tela (crua), e as
 * duas telas discordavam sobre quem está atrasado toda vez que o marco caía num
 * fim de semana. O código do servidor não pode ser importado pelo cliente (viria
 * junto no bundle), então a conta é reescrita — e o teste
 * `server/__tests__/arte-rules.test.ts` compara as duas implementações dia a dia
 * por um ano inteiro: se alguém mexer numa e não na outra, ele quebra.
 *
 * O servidor faz a conta em UTC-meia-noite e a tela em local-meia-noite;
 * `toUTCDisplayDate` preserva o DIA-calendário, então o dia da semana é o mesmo
 * nos dois lados.
 */
function ajustaFimDeSemana(d: Date): void {
  const dow = d.getDay();
  if (dow === 6) d.setDate(d.getDate() - 1);
  if (dow === 0) d.setDate(d.getDate() + 1);
}

/**
 * Prazo da fase para um evento. `null` quando o evento não tem saída marcada —
 * aí não há âncora e qualquer número seria inventado.
 *
 * A aritmética é de CALENDÁRIO (`setDate`), não de milissegundos, pelo mesmo
 * motivo que a do servidor: somar `offset * 86400000` a um horário local erra o
 * dia quando o intervalo cruza uma virada de horário de verão do fuso da
 * máquina, e o "dia −20" tem que ser o dia −20 no calendário.
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
  const d = toUTCDisplayDate(raw);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  if (!cfg.allDays) ajustaFimDeSemana(d);
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

// ── Atraso ──────────────────────────────────────────────────────────────────

/**
 * A peça já passou do marco da FASE em que está?
 *
 * QUAL MARCO, E POR QUE NÃO É A SAÍDA DO CAMINHÃO. O prazo que a tela cobra é
 * o de `PHASE_DEADLINE` — Entrega de Layouts (−20) para quem ainda vai enviar
 * ou está em correção, Aprovação de Layout (−12) para quem espera patrocinador,
 * Finalização (−10) para quem vai anexar o arquivo final. São os mesmos marcos
 * do funil da Gestão de Prazos, com o mesmo ajuste de fim de semana: as duas
 * telas cobram a mesma peça na mesma data ou nenhuma das duas é confiável.
 * A saída do caminhão é o prazo mais FOLGADO do fluxo: é o
 * fim da linha, semanas depois da data em que o trabalho desta fase precisa
 * estar feito. Medir por ela deixaria a fila inteira "no prazo" até o mês
 * seguinte e o filtro devolveria quase nada — que é exatamente o alarme tarde
 * demais que o marco por fase existe para evitar.
 *
 * É a MESMA `phaseDeadline` da coluna "Prazo" e da faixa de diagnóstico: o
 * filtro mostra o conjunto dos selos "Nd atrasado" que já estão na tela, nunca
 * uma segunda contagem paralela.
 *
 * Finalizados é a exceção deliberada: o marco daquela fase é a própria saída
 * do caminhão, que para uma peça já pronta costuma ter passado — chamar isso
 * de atraso acenderia alarme falso na lista inteira. Lá nada é atrasado.
 */
export function isAtrasadaNaFase(item: any, tab: string, today: Date): boolean {
  if (tab === "finalizados") return false;
  const p = phaseDeadline(item?.event, tab, today);
  return !!p && p.diff < 0;
}

/** Recorte "só atrasadas" de um balde já filtrado, com a fase daquele balde. */
export function filtrarAtrasadasDaFase(items: any[], tab: string, today: Date): any[] {
  if (tab === "finalizados") return [];
  return items.filter((i) => isAtrasadaNaFase(i, tab, today));
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
