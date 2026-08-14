// Domínio da Gestão de Prazos — regra de negócio PURA, sem Express e sem I/O.
//
// PORQUÊ este arquivo existe: a regra inteira do produto (o funil de 5 etapas,
// a pendência acumulada, a âncora de fuso, o semáforo) morava dentro de um
// handler Express de 270 linhas — impossível de testar sem subir servidor e
// banco. Aqui ela é uma função pura sobre estruturas simples; a rota fica só
// com I/O + montagem, e o job de snapshot reusa exatamente o mesmo cálculo
// (antes o job teria que reimplementar a conta e as duas versões divergiriam).
//
// O cálculo dos marcos espelha a Agenda Operacional do event-detail:
// cada etapa é um offset em dias sobre a SAÍDA DO CAMINHÃO (âncora oficial
// de prazos do negócio), com ajuste de fim de semana (sáb→sex, dom→seg)
// exceto na Produção Gráfica, que roda em qualquer dia.
//
// Toda a aritmética de datas é feita em UTC sobre a data-calendário
// (YYYY-MM-DD): o servidor pode rodar em qualquer fuso e o resultado
// tem que bater com o que a UI exibe (que formata em UTC).
import { isPlausibleEventYear } from "@shared/prazo-dates";
import { PRODUCED_LIKE } from "@shared/prazos-contract";
import type {
  PrazoCategoria,
  PrazoEvent,
  PrazoKpis,
  PrazoPendingItem,
  PrazoPendingSponsor,
  PrazoStage,
  StageState,
} from "@shared/prazos-contract";

export interface StageDef {
  key: string;
  label: string;
  offsetField:
    | "deadlineListaImagens"
    | "deadlineEntregaLayouts"
    | "deadlineAprovacaoLayout"
    | "deadlineRevisaoLista"
    | "deadlineProducaoGrafica";
  defaultOffset: number;
  allDays: boolean; // true = não ajusta fim de semana
  // Status de item que significam "ainda não passou por esta etapa".
  pendingStatuses: string[];
}

// A ordem importa: uma etapa só está concluída quando nenhuma peça está
// nela NEM em qualquer etapa anterior (peça em rascunho também não foi
// aprovada). Os status legados entram na etapa equivalente.
export const STAGE_DEFS: StageDef[] = [
  {
    key: "listaImagens", label: "Lista de Imagens",
    offsetField: "deadlineListaImagens", defaultOffset: -25, allDays: false,
    pendingStatuses: ["draft", "requested", "awaiting_linking"],
  },
  {
    key: "layouts", label: "Entrega de Layouts",
    offsetField: "deadlineEntregaLayouts", defaultOffset: -20, allDays: false,
    pendingStatuses: ["awaiting_submission"],
  },
  {
    key: "aprovacao", label: "Aprovação de Layout",
    offsetField: "deadlineAprovacaoLayout", defaultOffset: -12, allDays: false,
    pendingStatuses: ["awaiting_approval", "awaiting_sponsor_approval"],
  },
  {
    key: "revisao", label: "Revisão de Lista",
    offsetField: "deadlineRevisaoLista", defaultOffset: -8, allDays: false,
    pendingStatuses: [
      "awaiting_finalization", "sponsor_approved",
      "awaiting_final_review", "awaiting_review", "in_review", "awaiting_creator_review",
    ],
  },
  {
    key: "producao", label: "Produção Gráfica",
    offsetField: "deadlineProducaoGrafica", defaultOffset: -1, allDays: true,
    // "pronto_para_producao"/"liberado"/"em_producao" são grafias LEGADAS em
    // pt que circulam no banco (a dispensa da Arte grava pronto_para_producao;
    // ver items.ts:1599) — sem elas a peça sumia do funil e a etapa virava
    // verde falso. `PRODUCED_LIKE` (contrato compartilhado) traz o subconjunto
    // "já produzida/conferida", que o cliente também cita no resumo por setor.
    pendingStatuses: [
      "ready_for_production", "approved", "inProduction",
      "pronto_para_producao", "liberado", "em_producao",
      ...PRODUCED_LIKE,
    ],
  },
];

/** Ordem/rótulos das etapas para o payload — o front deriva os cabeçalhos daqui. */
export const STAGE_META = STAGE_DEFS.map((d) => ({ key: d.key, label: d.label }));

// "entregue" é a grafia legada de delivered — conta como pronta, não pendente.
export const DELIVERED = new Set(["delivered", "entregue"]);

// status → índice da etapa em que a peça está travada (0-4).
// Fora do mapa = já passou por tudo (delivered) ou está fora do funil.
export const STATUS_STAGE_RANK: Record<string, number> = {};
STAGE_DEFS.forEach((s, i) => s.pendingStatuses.forEach((st) => { STATUS_STAGE_RANK[st] = i; }));

// Cancelada/excluída/arquivada não conta como pendência nem como total.
export const OUT_OF_FUNNEL = new Set(["canceled", "deleted", "archived"]);

// Status em que a peça está esperando decisão de patrocinador.
export const AWAITING_SPONSOR = new Set(["awaiting_approval", "awaiting_sponsor_approval"]);

// Aprovação em aberto cuja bola está com o PATROCINADOR (o resto está com a Arte).
export const SPONSOR_TURN = new Set(["pending", "new_version_pending"]);

// "Hoje" do NEGÓCIO: dia-calendário em America/Sao_Paulo, expresso como
// UTC-midnight para a aritmética de dias. A âncora anterior (dia UTC do
// servidor) virava "amanhã" às 21h de Brasília e o semáforo mostrava
// "vencida há 1d" com o dia ainda em curso — exatamente nas horas em que
// o diretor confere pendência de véspera. As DATAS de evento continuam
// tratadas como wall-clock em UTC (convenção de toda a UI); só o "hoje"
// e os timestamps reais (updatedAt) usam o fuso do negócio.
export const SP_DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
});
export function spDayMs(date: Date): number {
  const [y, m, d] = SP_DAY_FMT.format(date).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
export function todayBusinessMs(): number {
  return spDayMs(new Date());
}
export function todayBusinessStr(): string {
  return SP_DAY_FMT.format(new Date()); // YYYY-MM-DD (en-CA)
}

/** "YYYY-MM-DD" (fuso do negócio) → milissegundos UTC-meia-noite. */
export function businessDayStrToMs(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

// Data-calendário (UTC, meia-noite) da saída do caminhão.
export function truckDayUTC(truckDepartureDate: Date | string): Date {
  const d = new Date(truckDepartureDate);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Marco da etapa: saída + offset, com ajuste de fim de semana quando a
// etapa não roda em todos os dias (mesma regra do event-detail).
export function stageDeadline(truckDay: Date, offsetDays: number, allDays: boolean): Date {
  const d = new Date(truckDay);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  if (!allDays) {
    const dow = d.getUTCDay();
    if (dow === 6) d.setUTCDate(d.getUTCDate() - 1); // sábado → sexta
    if (dow === 0) d.setUTCDate(d.getUTCDate() + 1); // domingo → segunda
  }
  return d;
}

// Dias-calendário (no fuso do negócio) desde um timestamp real.
export function daysSince(ts: Date | string | null | undefined, today: number): number {
  if (!ts) return 0;
  return Math.max(0, Math.round((today - spDayMs(new Date(ts))) / 86400000));
}

// ─── Entradas do domínio ─────────────────────────────────────────────────────
// Tipos ESTRUTURAIS (não os do Drizzle) de propósito: o teste monta um objeto
// literal de 8 campos em vez de fabricar uma linha de `items` com 60 colunas.
// `Event`/`Item` do schema são atribuíveis a estes sem cast.

export interface DomainEvent {
  id: string;
  name: string;
  status: string;
  priority?: string | null;
  startDate: Date | string;
  truckDepartureDate: Date | string;
  createdBy?: string | null;
  deadlineListaImagens?: number | null;
  deadlineEntregaLayouts?: number | null;
  deadlineAprovacaoLayout?: number | null;
  deadlineRevisaoLista?: number | null;
  deadlineProducaoGrafica?: number | null;
}

export interface DomainItem {
  id: string;
  displayId: string;
  status: string;
  type: string;
  description?: string | null;
  quantity: number;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
}

export interface DomainApproval {
  sponsorId: string;
  status: string;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export interface BuildEventDeps {
  /** "Hoje" do negócio em ms (UTC-meia-noite) — ver `todayBusinessMs`. */
  today: number;
  /** id → nome do patrocinador (o "Patrocinador removido" é o fallback). */
  sponsorNameById?: Map<string, string>;
  /** itemId → aprovações em aberto daquela peça. */
  openApprovalsByItem?: Map<string, DomainApproval[]>;
  /** userId → nome (para `solicitante`). Montado UMA vez pela rota; nunca N+1. */
  userNameById?: Map<string, string>;
  /**
   * Callback do agregado cross-evento de patrocinadores. Fica fora da função
   * para não obrigar o domínio a conhecer o ranking — quem chama decide se
   * quer acumular (a rota quer; o job de snapshot não).
   */
  onSponsorHolding?: (info: {
    sponsorId: string;
    sponsorName: string;
    days: number;
    eventId: string;
    eventName: string;
    itemId: string;
    displayId: string;
  }) => void;
}

/**
 * Recorte barato de "evento que ainda interessa à gestão de prazos", aplicável
 * ANTES de buscar as peças no banco (o filtro por `allDelivered` depende das
 * peças e continua dentro de `buildEventPrazo`).
 *
 * startPassed compara DIA-calendário UTC (não o instante): com timestamp à
 * meia-noite UTC, o evento sumia da tela às 21h da VÉSPERA em UTC-3 — as
 * horas de crise.
 */
export function isPrazoCandidate(event: DomainEvent, today: number): boolean {
  if (event.status === "completed") return false;
  const startPassed = today > truckDayUTC(event.startDate).getTime();
  return !startPassed;
}

/**
 * Monta o objeto `PrazoEvent` completo de um evento.
 * Devolve `null` quando o evento saiu da gestão de prazos (concluído, tudo
 * entregue, ou já começado) — "é história", nas palavras do negócio.
 */
export function buildEventPrazo(
  event: DomainEvent,
  items: DomainItem[],
  deps: BuildEventDeps,
): PrazoEvent | null {
  const { today } = deps;

  const eventItems = items.filter((it) => !OUT_OF_FUNNEL.has(it.status));

  // Evento concluído, com tudo entregue ou já começado é história —
  // sai da gestão de prazos.
  const allDelivered = eventItems.length > 0 && eventItems.every((it) => DELIVERED.has(it.status));
  if (allDelivered || !isPrazoCandidate(event, today)) return null;

  const truckDay = truckDayUTC(event.truckDepartureDate);
  // Mesmo guard do Painel: ano absurdo (ex.: 0206) é problema de
  // cadastro — sinalizamos em vez de calcular atraso de 600 mil dias.
  // A faixa mora em @shared/prazo-dates (fonte única, ver o arquivo).
  const invalidDate = !isPlausibleEventYear(truckDay.getUTCFullYear());

  // Contagem por etapa: direta (travadas AQUI) e acumulada (aqui ou antes).
  const directCounts = new Array(STAGE_DEFS.length).fill(0);
  for (const it of eventItems) {
    const rank = STATUS_STAGE_RANK[it.status];
    if (rank !== undefined) directCounts[rank] += 1;
  }
  // Evento sem NENHUMA peça: runningPending 0 deixaria as 5 etapas
  // "done" — verde falso para um evento em que nada começou. Etapas
  // ficam neutras e o front sinaliza "sem peças cadastradas".
  const noItems = eventItems.length === 0;

  let runningPending = 0;
  const stages: PrazoStage[] = STAGE_DEFS.map((def, i) => {
    runningPending += directCounts[i];
    const offset = (event[def.offsetField] as number | null | undefined) ?? def.defaultOffset;
    const deadline = stageDeadline(truckDay, offset, def.allDays);
    const diffDays = Math.round((deadline.getTime() - today) / 86400000);

    let state: StageState;
    if (noItems) state = "upcoming";
    else if (runningPending === 0) state = "done";
    else if (invalidDate) state = "upcoming"; // sem data confiável não há atraso confiável
    else if (diffDays < 0) state = "overdue";
    else if (diffDays <= 3) state = "warning";
    else state = "upcoming";

    return {
      key: def.key,
      label: def.label,
      deadline: deadline.toISOString().slice(0, 10),
      diffDays,
      pendingCount: runningPending,   // travadas aqui OU antes (o gate real)
      directCount: directCounts[i],   // travadas exatamente nesta etapa
      state,
    };
  });

  const deliveredCount = eventItems.filter((it) => DELIVERED.has(it.status)).length;

  // Risco projetado (regra fixa inicial, S6 da revisão): marco a até
  // 2 dias de vencer com 10+ peças ainda no gate é matematicamente
  // inviável — merece grito ANTES de virar atraso consumado.
  const riskCritical = !invalidDate && stages.some((s) =>
    (s.state === "warning" || s.state === "upcoming")
    && s.diffDays >= 0 && s.diffDays <= 2 && s.pendingCount >= 10);

  // Peças pendentes para o drill-down — detalhadas de propósito: a
  // tela existe para o diretor COBRAR, então cada linha diz o que é,
  // há quantos dias está parada e (na aprovação) quem está segurando.
  const pendingItems: PrazoPendingItem[] = eventItems
    .filter((it) => STATUS_STAGE_RANK[it.status] !== undefined)
    .map((it) => {
      // APROXIMAÇÃO documentada: updatedAt é tocado por QUALQUER
      // edição (inclusive atribuir book, que varre o evento inteiro),
      // não só por transição de status. Por isso a UI rotula "sem
      // movimento há Xd" — não "parada no status há Xd". O relógio
      // exato pede uma coluna statusChangedAt (dívida registrada).
      const waitingDays = daysSince(it.updatedAt ?? it.createdAt, today);
      let sponsors: PrazoPendingSponsor[] | undefined;
      if (AWAITING_SPONSOR.has(it.status)) {
        const open = deps.openApprovalsByItem?.get(it.id) ?? [];
        sponsors = open.map((ap) => {
          const name = deps.sponsorNameById?.get(ap.sponsorId) ?? "Patrocinador removido";
          // updatedAt ?? createdAt: o registro sobrevive ao ciclo
          // reprovar→reenviar (o reset só bumpa updatedAt) — contar de
          // createdAt cobraria o patrocinador por dias em que a bola
          // estava com a Arte. Recém-criado, os dois são iguais.
          const days = daysSince(ap.updatedAt ?? ap.createdAt, today);
          const holder: "sponsor" | "arte" = SPONSOR_TURN.has(ap.status) ? "sponsor" : "arte";
          if (holder === "sponsor") {
            deps.onSponsorHolding?.({
              sponsorId: ap.sponsorId,
              sponsorName: name,
              days,
              eventId: event.id,
              eventName: event.name,
              itemId: it.id,
              displayId: it.displayId,
            });
          }
          return { name, days, holder };
        });
      }
      return {
        id: it.id,
        displayId: it.displayId,
        status: it.status,
        // Etapa calculada AQUI (fonte única): o front não mantém mais
        // um espelho do mapa status→etapa que podia divergir.
        stageIndex: STATUS_STAGE_RANK[it.status],
        type: it.type,
        description: it.description ?? null,
        quantity: it.quantity,
        waitingDays,
        sponsors,
      };
    });

  // ── Campos derivados (fonte única para KPI, colunas, filtros e faixas) ────

  const overdueStages = stages.filter((s) => s.state === "overdue");

  // CATEGORIA: uma classificação e só uma, com precedência explícita.
  // Antes, "sem peças", "data inválida", "atrasado" e "em dia" eram decididos
  // separadamente em quatro lugares (KPI, coluna do quadro, filtro "Só com
  // atraso" e o botão de cobrança) — e discordavam. O evento sem nenhuma peça
  // a 5 dias da saída, que é o pior caso do negócio, era o que mais sofria:
  // entrava no placar "em dia", ia parar na ÚLTIMA coluna do funil e sumia do
  // filtro de atraso. Aqui ele ganha nome próprio, antes de qualquer outra
  // coisa — inclusive antes de "data inválida", porque sem peça nem existe
  // funil a corrigir.
  const categoria: PrazoCategoria =
    eventItems.length === 0 ? "semPecas"
    : invalidDate ? "dataInvalida"
    : overdueStages.length > 0 ? "atrasado"
    : "emDia";

  // Dias até a saída, MESMA âncora do semáforo. `null` quando a data não é
  // confiável — o cliente exibe "corrija o cadastro" em vez de uma conta fiel
  // sobre lixo (o "0206" que virava "ATRASADO 664730D").
  const diasParaSaida = invalidDate
    ? null
    : Math.round((truckDay.getTime() - today) / 86400000);

  // Pior atraso do evento: a etapa vencida há MAIS tempo é a de menor
  // diffDays (mais negativo). Ordena "mais atrasado primeiro" e a faixa
  // "Comece por aqui" sem o cliente refazer a varredura.
  const piorAtrasoDias = overdueStages.length
    ? Math.abs(Math.min(...overdueStages.map((s) => s.diffDays)))
    : 0;

  // Peças em atraso DESTE evento: a pendência acumulada da etapa vencida mais
  // AVANÇADA (peça presa antes também está atrasada para aquele marco). É
  // exatamente a parcela deste evento em `kpis.pecasAtrasadas` — expor por
  // evento é o que reconcilia o card com o placar.
  const pecasEmAtraso = overdueStages.length
    ? overdueStages[overdueStages.length - 1].pendingCount
    : 0;

  // Separa o evento atrasado mas FERVENDO do evento atrasado e ABANDONADO —
  // são duas cobranças completamente diferentes.
  const piorEsperaDias = pendingItems.length
    ? Math.max(...pendingItems.map((it) => it.waitingDays))
    : 0;

  return {
    id: event.id,
    name: event.name,
    priority: event.priority ?? null,
    // ISO explícito: o contrato promete `string`, e deixar o `Date` cru
    // dependendo da serialização do Express é o tipo de acordo tácito que
    // quebra no dia em que alguém trocar o serializador.
    startDate: new Date(event.startDate).toISOString(),
    truckDepartureDate: new Date(event.truckDepartureDate).toISOString(),
    invalidDate,
    totalItems: eventItems.length,
    deliveredItems: deliveredCount,
    stages,
    pendingItems,
    riskCritical,
    categoria,
    diasParaSaida,
    piorAtrasoDias,
    pecasEmAtraso,
    piorEsperaDias,
    solicitante: (event.createdBy && deps.userNameById?.get(event.createdBy)) || null,
  };
}

/**
 * Placar, derivado INTEIRAMENTE de `categoria`.
 *
 * A fórmula antiga era `emDia = length - comAtraso - invalidos`: uma subtração
 * sobre conjuntos que se sobrepõem. Um evento com data inválida E sem peças
 * era descontado duas vezes e `emDia` podia ficar NEGATIVO. Contando categoria
 * exclusiva vale a identidade
 * `atrasados + semPecas + invalidCount + emDia === events.length`.
 *
 * NOTA para quem for comparar com a tendência de ontem: `emDia` e
 * `invalidCount` MUDARAM de definição. No primeiro dia após o deploy a seta
 * ▲▼ reflete a troca de fórmula, não a realidade do negócio. É esperado —
 * não "consertar" achando que é bug.
 */
export function computeKpis(events: PrazoEvent[]): PrazoKpis {
  const byCategoria = (c: PrazoCategoria) => events.filter((ev) => ev.categoria === c).length;
  return {
    atrasados: byCategoria("atrasado"),
    // Reusa `diasParaSaida` (já calculado com a âncora do negócio) em vez de
    // refazer a conta — era a terceira cópia da mesma aritmética.
    saidas7d: events.filter((ev) => ev.diasParaSaida !== null && ev.diasParaSaida >= 0 && ev.diasParaSaida <= 7).length,
    pecasAtrasadas: events.reduce((acc, ev) => acc + ev.pecasEmAtraso, 0),
    emDia: byCategoria("emDia"),
    invalidCount: byCategoria("dataInvalida"),
    semPecas: byCategoria("semPecas"),
  };
}
