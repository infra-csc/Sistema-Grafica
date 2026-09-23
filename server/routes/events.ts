// Event CRUD + item submission routes. Extracted from server/routes.ts.
import type { Express } from "express";
import { storage } from "../storage";
import { insertEventSchema, type Item } from "@shared/schema";
import {
  isPlausibleEventDate,
  isPlausibleEventYear,
  spDayMs,
  todayBusinessMs,
  eventDayMs,
  motivoEventoFinalizado,
} from "@shared/prazo-dates";
import {
  requireAuth,
  broadcast,
  translateStatus,
  createAuditLog,
  EVENT_CLOSED_STATUS,
} from "./shared";

import { eventsCache, setEventsCache, eventsCacheGeneration, EVENTS_CACHE_TTL_MS } from "../cache";
import { ITENS_RESUMO, resumirItensDosEventos } from "@shared/eventos-resumo";
import { statusParaContagem, statusAoEnviarALista, ehMolde } from "@shared/molde";
import { prazoMoldeParaGravar, prazoMoldeBR } from "@shared/prazo-molde";

const ERRO_PRAZO_MOLDE = "Prazo do molde inválido — escolha um dia no calendário (ou deixe em branco)";
// Mesmo predicado e mesma frase que server/routes/items.ts usa em toda
// escrita de peça (ver o bloco "EVENTO FINALIZADO × ESCRITA DE PEÇA" em
// ./eventoFinalizado). Importada de lá — não de "./items" — de propósito:
// items.ts carrega os serviços de planilha (→ pacote `exceljs`), e este
// arquivo precisa continuar importável sem essa árvore (ver o porquê no topo
// de eventoFinalizado.ts). É o único lugar deste arquivo que precisa da
// checagem (ver comentário na rota POST /api/events/:id/items/submit).
import { motivoEventoFechado, erroEventoFechado } from "./eventoFinalizado";
import { prioridadePelaSaida } from "@shared/prioridade-do-evento";
import { responderErro } from "../erros";
import { aplicarPrioridadeAutomatica } from "../services/prioridadeAutomatica";
import { barraSeArquivado } from "../services/arquivamento";

// Normaliza startDate/truckDepartureDate (string "YYYY-MM-DD[THH:MM...]" ou Date
// vindo do storage) para a data-calendário "YYYY-MM-DD", sem envolver timezone
// local. Datetimes do app são tratados como UTC em toda a UI.
function toDateOnlyStr(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

// Data/hora legível no audit log. Lida em UTC de propósito — é a convenção de
// todo o app (as telas formatam com timeZone:'UTC'), e um log que trocasse de
// hora conforme o fuso do processo seria pior que nenhum log.
function toAuditDateStr(value: unknown): string {
  const d = value instanceof Date ? value : new Date(String(value ?? ""));
  if (Number.isNaN(d.getTime())) return "—";
  const iso = d.toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} ${iso.slice(11, 16)}`;
}

const EVENT_DEADLINE_LABELS: Record<string, string> = {
  deadlineListaImagens: "Prazo da lista de imagens",
  deadlineEntregaLayouts: "Prazo de entrega dos layouts",
  deadlineAprovacaoLayout: "Prazo de aprovação do layout",
  deadlineFinalizacao: "Prazo de finalização da arte",
  deadlineRevisaoLista: "Prazo de revisão da lista",
  deadlineProducaoGrafica: "Prazo da produção gráfica",
};

/**
 * Diff campo a campo da edição de evento, no mesmo formato que o PATCH de peça
 * já usa ("Campo: antes → depois"). Existe porque `Evento "X" atualizado`
 * — texto que o log gravava — não responde NENHUMA pergunta de auditoria.
 * A saída do caminhão vem primeiro: é a âncora de todos os prazos da casa.
 */
function describeEventChanges(before: any, after: any): string[] {
  const parts: string[] = [];
  const ts = (v: unknown) => {
    const d = v instanceof Date ? v : new Date(String(v ?? ""));
    return Number.isNaN(d.getTime()) ? NaN : d.getTime();
  };

  if (ts(before.truckDepartureDate) !== ts(after.truckDepartureDate)) {
    parts.push(
      `Saída do caminhão: ${toAuditDateStr(before.truckDepartureDate)} → ${toAuditDateStr(after.truckDepartureDate)}`
    );
  }
  if (ts(before.startDate) !== ts(after.startDate)) {
    parts.push(`Início do evento: ${toAuditDateStr(before.startDate)} → ${toAuditDateStr(after.startDate)}`);
  }
  if (before.name !== after.name) {
    parts.push(`Nome: "${before.name}" → "${after.name}"`);
  }
  if (before.franchise !== after.franchise) {
    parts.push(`Franquia: ${before.franchise || "—"} → ${after.franchise || "—"}`);
  }
  if (before.priority !== after.priority) {
    parts.push(`Prioridade: ${before.priority || "sem prioridade"} → ${after.priority || "sem prioridade"}`);
  }
  if ((prazoMoldeBR(before.prazoMolde) ?? null) !== (prazoMoldeBR(after.prazoMolde) ?? null)) {
    parts.push(`Prazo do molde: ${prazoMoldeBR(before.prazoMolde) ?? "—"} → ${prazoMoldeBR(after.prazoMolde) ?? "—"}`);
  }
  if (before.approvalBookUrl !== after.approvalBookUrl) {
    parts.push(after.approvalBookUrl ? "Book de aprovação atualizado" : "Book de aprovação removido");
  }
  for (const [field, label] of Object.entries(EVENT_DEADLINE_LABELS)) {
    if (before[field] !== after[field]) {
      parts.push(`${label}: ${before[field] ?? "—"} → ${after[field] ?? "—"} dias`);
    }
  }
  return parts;
}

// Ano plausível para datas de evento — a regra (e o porquê dela) mora em
// @shared/prazo-dates. Era a mesma faixa 2000-2100 datilografada aqui, na
// Gestão de Prazos e no Painel Geral: três cópias de uma regra que decide se
// um dado entra no banco e como ele é exibido depois.

// Converte o que o cliente manda em um instante UTC EXPLÍCITO.
//
// O cliente envia "YYYY-MM-DDTHH:MM" SEM sufixo de fuso e a convenção de toda
// a UI é que esse valor É a hora de parede pretendida (as telas formatam com
// timeZone:'UTC'). `new Date("2026-03-10T08:00")` interpreta no fuso do
// PROCESSO: hoje o Replit roda em UTC e o round-trip fecha por sorte de
// infraestrutura — no dia em que o container subir com TZ=America/Sao_Paulo,
// TODO evento passa a ser gravado 3h deslocado, sem lançar um único erro.
// Carimbar o "Z" aqui torna a gravação independente do fuso do servidor.
//
// Devolve null quando o valor é impossível de interpretar ("2026-03-10T:" —
// o que o campo de horário do modal produz quando se digita só ":"). Antes
// isso virava `Invalid Date`, o insert do Drizzle estourava com
// "RangeError: Invalid time value" e o usuário via essa frase num toast.
function toUtcInstant(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const naive = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(raw);
  if (naive) {
    const [, dayPart, hh = "00", mm = "00", ss = "00"] = naive;
    const parsed = new Date(`${dayPart}T${hh}:${mm}:${ss}.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  // Já vem com fuso explícito (…Z / …-03:00) ou é um formato que o runtime
  // entende sem ambiguidade — respeitamos como está.
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// "Hoje" do NEGÓCIO e aritmética de marcos
//
// ATENÇÃO / DÍVIDA CONHECIDA: este bloco é um GÊMEO do que existe em
// server/routes/prazos.ts (SP_DAY_FMT/spDayMs/todayBusinessMs, STAGE_DEFS,
// stageDeadline, DELIVERED, OUT_OF_FUNNEL). Não dava para importar de lá nesta
// onda porque prazos.ts está sob edição concorrente. A extração para um módulo
// compartilhado (ex.: server/lib/marcos.ts) consumido pelos DOIS — e, no
// cliente, pela Agenda Operacional do event-detail, que é a terceira cópia da
// mesma conta — está anotada para a segunda onda. Ao mexer aqui, mexa lá.
// ─────────────────────────────────────────────────────────────────────────────

// Dia-calendário no fuso do negócio, expresso como UTC-midnight para a
// aritmética de dias. A âncora anterior (instante bruto contra um timestamp
// gravado à meia-noite UTC) virava "o evento já passou" às 21h de Brasília do
// dia ANTERIOR ao início — 3h de antecipação justamente nas horas em que
// alguém está correndo atrás de peça faltando.
//
// A conta MUDOU DE CASA (para @shared/prazo-dates), não de comportamento: a
// regra "evento realizado sai das filas" é avaliada também no CLIENTE, que não
// importa `server/`, e uma segunda implementação da virada do dia divergiria.
// Continuam exportadas daqui para os testes
// (server/__tests__/event-status-derivado.test.ts): a virada de dia no fuso do
// negócio já causou bug nesta base e precisa de asserção própria — testá-la
// via HTTP exigiria banco.
export { spDayMs, todayBusinessMs };

// Data-calendário (UTC, meia-noite) de um timestamp de evento. As DATAS de
// evento continuam tratadas como wall-clock em UTC (convenção de toda a UI);
// só o "hoje" usa o fuso do negócio.
function dayUTC(value: Date | string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date(NaN);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// "entregue" é a grafia legada de delivered — conta como pronta, não pendente.
const DELIVERED = new Set(["delivered", "entregue"]);
// Cancelada/excluída/arquivada não conta como pendência nem como total.
const OUT_OF_FUNNEL = new Set(["canceled", "deleted", "archived"]);
// "em_producao" é a grafia legada de inProduction. Peça aqui significa material
// físico já na máquina — é o número que a confirmação de encerramento precisa
// dizer em voz alta.
const IN_PRODUCTION = new Set(["inProduction", "em_producao"]);

/**
 * Dimensão do trabalho VIVO de um evento. Existe para o encerramento manual
 * poder dizer "12 peças pendentes, sendo 3 em produção" em vez de "há peças em
 * aberto" — a confirmação genérica que ninguém lê.
 */
export function countOpenWork(eventItems: { status: string }[]) {
  let deliveredCount = 0;
  let canceledCount = 0;
  let inProductionCount = 0;
  for (const it of eventItems) {
    if (OUT_OF_FUNNEL.has(it.status)) { canceledCount += 1; continue; }
    // Molde produzido é o fim do fluxo dele — conta como entregue (shared/molde).
    if (DELIVERED.has(statusParaContagem(it))) deliveredCount += 1;
    else if (IN_PRODUCTION.has(it.status)) inProductionCount += 1;
  }
  const activeItemCount = eventItems.length - canceledCount;
  return {
    itemCount: eventItems.length,
    activeItemCount,
    deliveredCount,
    canceledCount,
    inProductionCount,
    openCount: activeItemCount - deliveredCount,
  };
}

interface MarcoDef {
  key: string;
  label: string;
  offsetField:
    | "deadlineListaImagens"
    | "deadlineEntregaLayouts"
    | "deadlineAprovacaoLayout"
    | "deadlineFinalizacao"
    | "deadlineRevisaoLista"
    | "deadlineProducaoGrafica";
  defaultOffset: number;
  allDays: boolean; // true = não ajusta fim de semana
  // Status de item que significam "ainda não passou por esta etapa".
  pendingStatuses: string[];
}

// A ordem importa: uma etapa só está concluída quando nenhuma peça está nela
// NEM em qualquer etapa anterior. Espelha STAGE_DEFS de prazos.ts, inclusive
// as grafias LEGADAS em pt que circulam no banco — sem elas a peça sumia do
// funil e a etapa virava verde falso.
const MARCO_DEFS: MarcoDef[] = [
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
    key: "finalizacao", label: "Finalização",
    offsetField: "deadlineFinalizacao", defaultOffset: -10, allDays: false,
    pendingStatuses: [
      "awaiting_finalization", "sponsor_approved", "awaiting_creator_review",
    ],
  },
  {
    key: "revisao", label: "Revisão de Lista",
    offsetField: "deadlineRevisaoLista", defaultOffset: -8, allDays: false,
    pendingStatuses: [
      "awaiting_final_review", "awaiting_review", "in_review",
    ],
  },
  {
    key: "producao", label: "Produção Gráfica",
    offsetField: "deadlineProducaoGrafica", defaultOffset: -1, allDays: true,
    pendingStatuses: [
      "ready_for_production", "approved", "inProduction", "produced", "conferred", "packed",
      "pronto_para_producao", "liberado", "em_producao", "produzido",
    ],
  },
];

// status → índice do marco em que a peça está travada.
const STATUS_MARCO_RANK: Record<string, number> = {};
MARCO_DEFS.forEach((m, i) => m.pendingStatuses.forEach((st) => { STATUS_MARCO_RANK[st] = i; }));

const APROVACAO_MARCO_INDEX = MARCO_DEFS.findIndex((m) => m.key === "aprovacao");

// Gêmeo de `marcoIndexFor` (services/prazo-domain.ts): peça isenta da aprovação
// do patrocinador é cobrada pelo prazo de APROVAÇÃO DE LAYOUT — ela não passa
// pela etapa de aprovação, então é esse o marco que vale para ela. Sem isto o
// card do evento apontaria um "próximo marco" diferente do que a Gestão de
// Prazos cobra para a mesma peça.
function marcoIndexFor(status: string, skipApproval?: boolean | null): number | undefined {
  const rank = STATUS_MARCO_RANK[status];
  if (rank === undefined) return undefined;
  if (skipApproval && rank < APROVACAO_MARCO_INDEX) return APROVACAO_MARCO_INDEX;
  return rank;
}

// Marco da etapa: saída do caminhão + offset, com ajuste de fim de semana
// quando a etapa não roda em todos os dias (mesma regra do event-detail e de
// /api/prazos). A âncora é a SAÍDA, nunca a data do evento.
function marcoDeadline(truckDay: Date, offsetDays: number, allDays: boolean): Date {
  const d = new Date(truckDay);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  if (!allDays) {
    const dow = d.getUTCDay();
    if (dow === 6) d.setUTCDate(d.getUTCDate() - 1); // sábado → sexta
    if (dow === 0) d.setUTCDate(d.getUTCDate() + 1); // domingo → segunda
  }
  return d;
}

export interface NextMilestone {
  /** Chave: listaImagens | layouts | aprovacao | finalizacao | revisao | producao */
  key: string;
  /** Rótulo pt-BR pronto para exibição ("Lista de Imagens"). */
  label: string;
  /** Data-calendário do vencimento, "YYYY-MM-DD" (já com ajuste de fim de semana). */
  deadline: string;
  /** >0 faltam N dias · 0 vence hoje · <0 atrasado há N dias. Dia-calendário SP. */
  daysRemaining: number;
  /** overdue = daysRemaining<0 · warning = vence em até 3 dias · upcoming = resto. */
  state: "upcoming" | "warning" | "overdue";
  /** Peças travadas NESTE marco ou em algum anterior. 0 = evento sem peça alguma. */
  pendingItems: number;
  /** Ano da saída fora de 2000-2100 (typo de cadastro): não confie no prazo. */
  invalidDate: boolean;
}

// Primeiro marco ainda não vencido pelo trabalho — o que a pessoa precisa
// resolver a seguir. Devolve null quando não há mais nada pendente no funil.
function nextMilestoneFor(
  event: Record<string, any>,
  eventItems: { status: string; skipApproval?: boolean | null }[],
  todayMs: number,
): NextMilestone | null {
  const funnelItems = eventItems.filter((it) => !OUT_OF_FUNNEL.has(it.status));

  const direct = new Array(MARCO_DEFS.length).fill(0);
  for (const it of funnelItems) {
    const marco = marcoIndexFor(statusParaContagem(it), it.skipApproval);
    if (marco !== undefined) direct[marco] += 1;
  }

  const truckDay = dayUTC(event.truckDepartureDate);
  // Mesma fonte única da validação de escrita logo acima e da Gestão de
  // Prazos: a faixa 2000-2100 estava datilografada de novo AQUI, dentro do
  // mesmo arquivo que já importa o helper. Quem afrouxar a regra num lugar
  // sem afrouxar no outro cria dado que entra no banco e depois é exibido
  // como "cadastro quebrado" para sempre.
  const invalidDate = !isPlausibleEventYear(truckDay.getUTCFullYear());

  let running = 0;
  for (let i = 0; i < MARCO_DEFS.length; i++) {
    running += direct[i];

    // Evento SEM nenhuma peça: o marco pendente é o primeiro (a lista de
    // imagens). É o caso que a lista de eventos mais precisa gritar — "lista
    // vence em 12 dias" num evento onde nada foi cadastrado ainda.
    const isNext = funnelItems.length === 0 ? i === 0 : running > 0;
    if (!isNext) continue;

    const def = MARCO_DEFS[i];
    const offset = (event[def.offsetField] as number | null | undefined) ?? def.defaultOffset;
    const deadline = marcoDeadline(truckDay, offset, def.allDays);
    const daysRemaining = Math.round((deadline.getTime() - todayMs) / 86400000);

    // Sem data confiável não há atraso confiável: nunca pintamos de vermelho
    // um prazo derivado de um ano absurdo.
    let state: NextMilestone["state"] = "upcoming";
    if (!invalidDate) {
      if (daysRemaining < 0) state = "overdue";
      else if (daysRemaining <= 3) state = "warning";
    }

    return {
      key: def.key,
      label: def.label,
      deadline: Number.isNaN(deadline.getTime()) ? "" : deadline.toISOString().slice(0, 10),
      daysRemaining: Number.isFinite(daysRemaining) ? daysRemaining : 0,
      state,
      pendingItems: running,
      invalidDate,
    };
  }

  return null;
}

/**
 * Enriquecimento único do evento, usado pela LISTA e pelo DETALHE.
 *
 * O bug que isto corrige: o servidor carimbava `status = "completed"` só
 * porque a data de início tinha passado. Um evento com 3 de 20 peças
 * entregues ficava verde, perdia a bandeira de prioridade, caía para o último
 * balde da ordenação e sumia do filtro "Urgente" — exatamente no instante em
 * que virava um problema irreversível (o caminhão já saiu). Pior: o override
 * existia SÓ em GET /api/events, então o card dizia "Concluído" e o detalhe do
 * MESMO evento dizia "Criado", a um clique de distância.
 *
 * Agora os dois conceitos viajam separados no payload:
 *   · allDelivered    → a PRODUÇÃO terminou (todas as peças do funil entregues)
 *   · eventHasPassed  → o DIA DO EVENTO passou (dia-calendário em
 *                       America/Sao_Paulo, comparação estrita: durante o dia
 *                       do evento o trabalho ainda conta)
 * e `lifecycle` combina os dois num discriminador pronto para a UI:
 * `active | completed | realizado | manually_closed`.
 *
 * `status` continua no payload, com a mesma semântica de antes ("created" |
 * "completed"), para não quebrar quem já o consome — mas agora é derivado nas
 * DUAS direções: um "completed" velho gravado no banco (o helper
 * updateEventStatus de routes/shared.ts ainda persiste o carimbo por data) é
 * rebaixado para "created" quando a produção não terminou.
 */
// Exportada só para os testes: é a regra de negócio mais perigosa do módulo
// (decide se um evento aparece verde) e é 100% pura — recebe hoje por parâmetro.
export function enrichEvent(
  event: Record<string, any>,
  eventItems: any[],
  eventSponsors: any[],
  todayMs: number,
) {
  const itemCount = eventItems.length;
  let deliveredCount = 0;
  let canceledCount = 0;
  for (const it of eventItems) {
    if (OUT_OF_FUNNEL.has(it.status)) canceledCount += 1;
    else if (DELIVERED.has(statusParaContagem(it))) deliveredCount += 1;
  }
  // Canceladas/arquivadas saem do denominador: não são trabalho pendente nem
  // trabalho entregue — não devem impedir um evento de fechar.
  const activeItemCount = itemCount - canceledCount;
  const openCount = activeItemCount - deliveredCount;

  const allDelivered = activeItemCount > 0 && openCount === 0;

  // O DIA DO EVENTO PASSOU — mesmo predicado das filas de trabalho e da Gestão
  // de Prazos (@shared/prazo-dates). Era `>=` aqui e `>` lá: um dia inteiro em
  // que a lista de Eventos carimbava "Encerrado com pendências" num evento que
  // AINDA estava sendo cobrado em todas as outras telas. O dono decidiu por
  // `>` (14/08): "passou o dia" é depois do fim do dia do evento — durante o
  // dia do evento o trabalho ainda conta, e é o único critério compatível com
  // a regra que tirou o evento realizado das cinco filas.
  //
  // `eventDayMs` (e não `dayUTC`) também descarta o ANO IMPLAUSÍVEL: um "0206"
  // digitado no lugar de "2026" deixa de ser lido como "já passou" e volta a
  // aparecer como cadastro a corrigir, em vez de nascer arquivado.
  const eventDay = eventDayMs(event.startDate);
  const eventHasPassed = eventDay !== null && todayMs > eventDay;

  // ENCERRAMENTO MANUAL SOBREPÕE A DERIVAÇÃO — nas duas direções. Um evento
  // encerrado à mão com tudo entregue NÃO vira "Concluído" (a tela precisa
  // distinguir "encerrado por alguém" de "encerrado porque tudo foi entregue"),
  // e um encerrado à mão com peça em aberto NÃO vira "Realizado com
  // pendências" — esse selo é o alarme de quem esqueceu, e um evento que
  // alguém fechou de propósito não é um esquecimento.
  //
  // `motivoEventoFinalizado` é quem decide: é o MESMO predicado que tira o
  // evento das filas, então a lista de Eventos e as filas nunca discordam
  // sobre quem saiu nem sobre por quê.
  const motivoFinalizado = motivoEventoFinalizado(event, todayMs);
  const manuallyClosed = motivoFinalizado === "encerrado";

  // VOCABULÁRIO: "encerrado" é sempre decisão de gente (tem volta: reabrir);
  // "realizado" é sempre a data (não tem volta). `realizado` substituiu
  // `closed_with_pending` — mesmo balde, nome honesto: ninguém encerrou o
  // evento, ele simplesmente aconteceu e deixou trabalho para trás. Quando a
  // produção terminou antes, o balde é "completed", que continua sendo o fim
  // feliz e não é um alarme.
  const lifecycle: "active" | "completed" | "realizado" | "manually_closed" =
    manuallyClosed ? "manually_closed"
    : allDelivered ? "completed"
    : motivoFinalizado === "realizado" ? "realizado"
    : "active";

  // Compatibilidade: status permanece "created" | "completed" para os eventos
  // vivos e agora é totalmente derivado da produção. "closed" é o único valor
  // que a derivação NÃO pode reescrever.
  const derivedStatus =
    manuallyClosed ? EVENT_CLOSED_STATUS
    : allDelivered ? "completed"
    : event.status === "completed" ? "created"
    : event.status;

  return {
    ...event,
    status: derivedStatus,
    eventHasPassed,
    allDelivered,
    manuallyClosed,
    lifecycle,
    itemCount,
    activeItemCount,
    deliveredCount,
    canceledCount,
    openCount,
    // Só faz sentido perguntar "o que vence primeiro" para evento em jogo.
    // Encerrado/concluído, o sinal certo é o lifecycle, não um marco vencido.
    nextMilestone: lifecycle === "active" ? nextMilestoneFor(event, eventItems, todayMs) : null,
    items: eventItems,
    sponsors: eventSponsors,
  };
}

/**
 * Monta a lista enriquecida de eventos (sem o recorte do Kit). Pura sobre as
 * três leituras: separada do handler para o agrupamento poder ser medido e
 * reusado. O agrupamento por evento é UMA passada sobre as peças — nada aqui
 * percorre o acervo uma vez por evento.
 */
export function montarListaDeEventos(
  allEvents: Record<string, any>[],
  allItems: Array<{ eventId: string; status: string; skipApproval?: boolean | null }>,
  allEventSponsors: Array<{ eventId: string }>,
  todayMs: number,
) {
  // getAllEventSponsors já vem ordenado por createdAt desc — agrupar preserva
  // a mesma ordem que getEventSponsors daria.
  const itemsByEvent = new Map<string, any[]>();
  for (const it of allItems) {
    const arr = itemsByEvent.get(it.eventId);
    if (arr) arr.push(it); else itemsByEvent.set(it.eventId, [it]);
  }
  const sponsorsByEvent = new Map<string, any[]>();
  for (const es of allEventSponsors) {
    const arr = sponsorsByEvent.get(es.eventId);
    if (arr) arr.push(es); else sponsorsByEvent.set(es.eventId, [es]);
  }
  return allEvents.map((event) =>
    enrichEvent(
      event,
      itemsByEvent.get(event.id) ?? [],
      sponsorsByEvent.get(event.id) ?? [],
      todayMs,
    ),
  );
}

/** Envia um JSON já serializado com os mesmos cabeçalhos que res.json poria. */
function enviarJsonPronto(res: any, json: string) {
  if (!res.get("Content-Type")) res.set("Content-Type", "application/json");
  return res.send(json);
}

// UMA montagem em voo por vez (perf 17/09). A tela pede /api/events 2–3× ao
// abrir; com o cache vazio (toda escrita o invalida), cada pedido disparava as
// mesmas três leituras e a mesma serialização de ~800 KB em paralelo. Agora os
// pedidos que chegam durante a montagem esperam a MESMA promessa — mas só se
// nenhuma escrita aconteceu desde que ela começou (mesma geração do cache).
// Se houve escrita no meio, o pedido novo monta de novo, com o dado novo: é a
// mesma garantia de frescor de não ter cache nenhum.
//
// DUAS VARIANTES (perf 17/09): a lista de sempre e a com `?itens=resumo` (as
// peças embutidas viram contagem por status — shared/eventos-resumo.ts). Cada
// uma tem a sua montagem em voo e o seu JSON pronto: servir a um pedido a
// variante do outro mudaria o corpo que ele recebe. O JSON do resumo guarda a
// GERAÇÃO junto — a mesma régua do eventsCache: qualquer escrita (broadcast →
// invalidateEventsCache) avança a geração e o resumo guardado deixa de valer.
type VarianteDaLista = "completa" | "resumo";
const montagensEmVoo: Record<VarianteDaLista, { geracao: number; json: Promise<string> } | null> = {
  completa: null,
  resumo: null,
};
let resumoPronto: { geracao: number; expiresAt: number; json: string } | null = null;

/** O JSON do resumo guardado, se ainda vale (mesma geração e dentro do TTL). */
function resumoEmCache(): string | null {
  return resumoPronto && resumoPronto.geracao === eventsCacheGeneration() && resumoPronto.expiresAt > Date.now()
    ? resumoPronto.json
    : null;
}

function listaDeEventosJson(variante: VarianteDaLista = "completa"): Promise<string> {
  const geracao = eventsCacheGeneration();
  const montagemEmVoo = montagensEmVoo[variante];
  if (montagemEmVoo && montagemEmVoo.geracao === geracao) return montagemEmVoo.json;

  const json = (async () => {
    // 3 queries totais (eventos + todos os itens + todos os vínculos de
    // patrocinador), agrupando em memória — em vez de 1 + 2 queries POR evento
    // (N+1). Com centenas de eventos isso era a diferença entre ~3 e ~600
    // queries neste endpoint, que é o mais chamado do app.
    // AUDITORIA 27/08: getItemsSlimForEvents (id/eventId/status/skipApproval)
    // no lugar de getAllItems (66 colunas do acervo inteiro). O enriquecimento
    // só CONTA e classifica por status — e o `items` embutido na resposta,
    // que os consumidores (Eventos, funil de fases) leem só por status,
    // deixa de carregar o acervo dentro da lista de eventos.
    const [allEvents, allItems, allEventSponsors] = await Promise.all([
      storage.getAllEvents(),
      storage.getItemsSlimForEvents(),
      storage.getAllEventSponsors(),
    ]);
    // Um único "hoje" para toda a página: dois eventos nunca podem ser
    // avaliados contra dias diferentes por causa da virada durante o loop.
    const lista = montarListaDeEventos(
      allEvents as unknown as Record<string, any>[],
      allItems,
      allEventSponsors,
      todayBusinessMs(),
    );
    // Só vira cache se nenhuma escrita invalidou no meio da montagem.
    if (variante === "resumo") {
      const texto = JSON.stringify(resumirItensDosEventos(lista));
      if (geracao === eventsCacheGeneration()) {
        resumoPronto = { geracao, expiresAt: Date.now() + EVENTS_CACHE_TTL_MS, json: texto };
      }
      return texto;
    }
    const texto = JSON.stringify(lista);
    setEventsCache(texto, geracao);
    return texto;
  })();

  const voo = { geracao, json };
  montagensEmVoo[variante] = voo;
  // Limpa a vaga ao terminar (com sucesso ou erro) — sem apagar uma montagem
  // MAIS NOVA que tenha ocupado o lugar enquanto esta rodava.
  json.then(
    () => { if (montagensEmVoo[variante] === voo) montagensEmVoo[variante] = null; },
    () => { if (montagensEmVoo[variante] === voo) montagensEmVoo[variante] = null; },
  );
  return json;
}

export function registerEventRoutes(app: Express): void {
  // ============ EVENTS ============

  // Get all events with items count
  app.get("/api/events", requireAuth, async (req, res) => {
    try {
      // `?itens=resumo` (perf 17/09): as peças embutidas vão como contagem por
      // status (shared/eventos-resumo.ts). Sem o parâmetro, a resposta de sempre.
      const resumo = req.query?.itens === ITENS_RESUMO;
      // USUÁRIO DO KIT (14/09): vê todos os eventos (precisa deles para criar
      // as remessas), mas as peças embutidas — contagens e fases — são só as
      // peças do Kit dele. Fora do cache compartilhado, que é o de todos.
      if ((req as any).userKit) {
        const userId = (req as any).userId ?? "";
        // PERF (17/09): o recorte "peças do Kit criadas por este usuário" vai
        // para o banco — antes vinha o acervo inteiro (66 colunas × todas as
        // peças) para sobrar meia dúzia. Mesmas linhas, mesma ordem.
        const [eventosKit, pecasKit, vinculosKit] = await Promise.all([
          storage.getAllEvents(),
          storage.getItemsDoKitDoCriador(userId),
          storage.getAllEventSponsors(),
        ]);
        const porEventoKit = new Map<string, any[]>();
        for (const it of pecasKit) {
          // Redundante com o WHERE do banco, de propósito: é a regra de
          // visibilidade do Kit, e ela continua valendo aqui mesmo que a
          // consulta mude um dia. Custa uma comparação por peça DO KIT.
          if (!it.kitRemessaId || it.criadoPorId !== userId) continue;
          const arr = porEventoKit.get(it.eventId);
          if (arr) arr.push(it); else porEventoKit.set(it.eventId, [it]);
        }
        const patrocinadoresKit = new Map<string, any[]>();
        for (const es of vinculosKit) {
          const arr = patrocinadoresKit.get(es.eventId);
          if (arr) arr.push(es); else patrocinadoresKit.set(es.eventId, [es]);
        }
        const hojeKit = todayBusinessMs();
        const listaKit = eventosKit.map((event) => enrichEvent(
          event as unknown as Record<string, any>,
          porEventoKit.get(event.id) ?? [],
          patrocinadoresKit.get(event.id) ?? [],
          hojeKit,
        ));
        return res.json(resumo ? resumirItensDosEventos(listaKit) : listaKit);
      }

      // PERF (17/09): o cache guarda o JSON JÁ SERIALIZADO. A lista tem ~800 KB
      // (as peças de todos os eventos vão embutidas) e é pedida 2–3× por tela:
      // res.json refazia o JSON.stringify inteiro, síncrono, a cada acerto de
      // cache. O corpo enviado é byte a byte o mesmo que res.json produziria
      // (este app não configura "json spaces"/"json replacer"), e o
      // Content-Type também — res.json só o define quando ausente, e o send
      // acrescenta o charset nos dois caminhos.
      if (resumo) {
        const pronto = resumoEmCache();
        return enviarJsonPronto(res, pronto ?? await listaDeEventosJson("resumo"));
      }

      const now = Date.now();
      if (eventsCache && eventsCache.expiresAt > now) {
        return enviarJsonPronto(res, eventsCache.data as string);
      }

      enviarJsonPronto(res, await listaDeEventosJson());
    } catch (error: any) {
      responderErro(res, error, "listar eventos");
    }
  });

  // Lista dos ARQUIVADOS, de onde o admin restaura. Registrada antes de
  // `/api/events/:id`, que casaria "arquivados" como id. Admin: é quem arquiva.
  app.get("/api/events/arquivados", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas administradores veem os eventos arquivados" });
      }
      res.json(await storage.getEventosArquivados());
    } catch (error: unknown) {
      responderErro(res, error, "listar eventos arquivados");
    }
  });

  // Get single event.
  // Mesmo enriquecimento da lista — sem isto o card dizia "Concluído" e esta
  // rota dizia "Criado" para o mesmo evento, a um clique de distância.
  app.get("/api/events/:id", requireAuth, async (req, res) => {
    try {
      // PERF (17/09): as três leituras saem juntas. Antes o evento ia sozinho
      // e só depois peças + vínculos — um round-trip inteiro a mais em toda
      // abertura de detalhe, para economizar duas consultas baratas (por
      // índice) no caso raro do 404.
      const [event, todasAsPecas, eventSponsors] = await Promise.all([
        storage.getEvent(req.params.id),
        storage.getItemsByEvent(req.params.id),
        storage.getEventSponsors(req.params.id),
      ]);
      if (!event) {
        return res.status(404).json({ error: "Evento não encontrado" });
      }
      // Arquivado sumiu de todas as listas; aberto por link direto, some também.
      if (event.arquivadoEm) {
        return res.status(404).json({ error: "Este evento foi arquivado.", code: "ARCHIVED" });
      }
      // Usuário do Kit: só as peças do Kit dele entram nas contagens (14/09).
      const userIdKit = (req as any).userId;
      const eventItems = (req as any).userKit
        ? todasAsPecas.filter((i) => !!i.kitRemessaId && i.criadoPorId === userIdKit)
        : todasAsPecas;

      res.json(
        enrichEvent(
          event as unknown as Record<string, any>,
          eventItems,
          eventSponsors,
          todayBusinessMs(),
        ),
      );
    } catch (error: any) {
      responderErro(res, error, "abrir evento");
    }
  });

  // Create event — mesmos papéis do PATCH: gestão de evento é admin/solicitação.
  // Estava só com requireAuth: gráfica/arte podiam criar eventos por API.
  app.post("/api/events", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin" && req.userRole !== "solicitacao") {
        return res.status(403).json({ error: "Sem permissão para criar eventos" });
      }
      const validatedData = insertEventSchema.parse(req.body);

      // `status` e `createdBy` são DERIVADOS/da sessão — nenhum cliente pode
      // escrevê-los. insertEventSchema só omite id/createdAt/updatedAt, então
      // ambos chegam pelo body: um POST com status:"completed" criava um evento
      // futuro nascido verde, e um createdBy forjado daria a outro usuário o
      // direito de gerenciar a lista de peças (gate "criador do evento" de
      // items.ts). Descartamos aqui até o .omit() do schema ser corrigido.
      const {
        status: _statusIgnorado,
        createdBy: _createdByIgnorado,
        ...safeData
      } = validatedData;

      // Validação: saída do caminhão deve ser pelo menos 1 dia antes do início.
      // Comparação por STRING (YYYY-MM-DD), igual ao cliente — new Date() misturava
      // UTC (date-only) com horário local (datetime) e, em America/Sao_Paulo,
      // rejeitava com 400 o caso-limite que a UI permite.
      const s = toDateOnlyStr(validatedData.startDate);
      const t = toDateOnlyStr(validatedData.truckDepartureDate);
      if (!isPlausibleEventDate(s) || !isPlausibleEventDate(t)) {
        return res.status(400).json({
          error: "Data fora do intervalo válido — confira o ano (ex.: 2026)"
        });
      }
      if (t >= s) {
        return res.status(400).json({
          error: "A saída do caminhão deve ser pelo menos 1 dia antes do início do evento"
        });
      }

      // Horário incompleto ("2026-03-10T:") passava por toda a validação e só
      // estourava no insert do Drizzle, com "RangeError: Invalid time value"
      // dentro do toast destrutivo. Aqui vira uma frase que o usuário entende.
      const startAt = toUtcInstant(validatedData.startDate);
      const truckAt = toUtcInstant(validatedData.truckDepartureDate);
      if (!startAt || !truckAt) {
        return res.status(400).json({
          error: "Data ou horário inválido — confira o campo de hora (formato 08:00)"
        });
      }

      // PRIORIDADE (25/08): quem escolheu no formulário TRAVA (ajuste manual);
      // quem não escolheu já nasce com a automática pela saída do caminhão —
      // sem esperar o próximo tick do job.
      // PRAZO DO MOLDE (22/09): opcional; o dia vira meio-dia UTC.
      const prazoMolde = prazoMoldeParaGravar((safeData as any).prazoMolde);
      if (prazoMolde === false) return res.status(400).json({ error: ERRO_PRAZO_MOLDE });

      const prioridadeEscolhida = (safeData as any).priority ?? null;
      const event = await storage.createEvent({
        ...safeData,
        prazoMolde: prazoMolde ?? null,
        priority: prioridadeEscolhida ?? prioridadePelaSaida(truckAt.getTime(), Date.now()),
        priorityManual: !!prioridadeEscolhida,
        startDate: startAt,
        truckDepartureDate: truckAt,
        // Autoria vem SEMPRE da sessão. A coluna existia e nunca era
        // preenchida pela UI, deixando três gates de autorização inertes
        // (items.ts canCreateItemsFor, PATCH de item, canEditLists).
        createdBy: req.userId ?? null,
      });

      // Create audit log
      await createAuditLog(
        (req as any).userName,
        'created',
        'event',
        event.id,
        `Evento "${event.name}" criado`
      );

      // Não notificar quando evento é criado (só quando itens forem adicionados)

      // Broadcast update
      broadcast({ type: "event_created", event });

      res.status(201).json(event);
    } catch (error: any) {
      responderErro(res, error, "criar evento");
    }
  });

  // Update event
  app.patch("/api/events/:id", requireAuth, async (req, res) => {
    // Edição de evento é gestão (mesmos papéis que a UI mostra o lápis) — a
    // rota aceitava qualquer papel reescrever datas/dados de qualquer evento.
    if (!["admin", "solicitacao"].includes(req.userRole ?? "")) {
      return res.status(403).json({ error: "Sem permissão para editar eventos" });
    }
    try {
      const validatedData = insertEventSchema.partial().parse(req.body);

      // Mesma regra do POST: status é derivado da produção e autoria não se
      // transfere por PATCH. Sem isto, um PATCH { status:"completed" } deixava
      // o evento verde no banco para sempre.
      const {
        status: _statusIgnorado,
        createdBy: _createdByIgnorado,
        ...safeData
      } = validatedData;

      // Sanidade de ano SÓ nos campos enviados — validar o lado composto do
      // evento atual bloquearia justamente o PATCH que corrige uma data já
      // ruim no banco (ex.: o 0206 que motivou esta guarda).
      const sentDates = [validatedData.startDate, validatedData.truckDepartureDate]
        .filter((d): d is NonNullable<typeof d> => d != null);
      if (sentDates.some((d) => !isPlausibleEventDate(toDateOnlyStr(d)))) {
        return res.status(400).json({
          error: "Data fora do intervalo válido — confira o ano (ex.: 2026)"
        });
      }

      // Estado ANTES da gravação — é o que permite o audit log dizer o que
      // mudou. `Evento "X" atualizado` sem diff é inútil mesmo quando exibido:
      // a pergunta de auditoria mais cara da casa é "quem mudou a data de
      // saída do caminhão e quando", e a resposta não estava em lugar nenhum.
      const before = await storage.getEvent(req.params.id);
      if (!before) {
        return res.status(404).json({ error: "Evento não encontrado" });
      }
      if (barraSeArquivado(before, res)) return;

      // DATA DE EVENTO FINALIZADO: empurrar a data de um evento que já
      // aconteceu (ou foi encerrado) para o futuro o "reabriria" por baixo —
      // as filas voltariam a mostrá-lo sem ninguém ter decidido reabrir.
      // Reabrir é do admin (POST /reopen); por isso só ele muda essa data.
      // O formulário manda a data inteira mesmo sem mexer: só barra se MUDOU.
      const papel = req.userRole ?? "";
      if (papel !== "admin" && validatedData.startDate != null) {
        const motivoFim = motivoEventoFinalizado(before, todayBusinessMs());
        const mudou = toUtcInstant(validatedData.startDate)?.getTime() !== new Date(before.startDate as any).getTime();
        if (motivoFim && mudou) {
          return res.status(409).json({
            error: motivoFim === "encerrado"
              ? "Evento encerrado — a data só muda depois de reaberto, e reabrir é do admin."
              : "Este evento já aconteceu — só o admin muda a data dele (reabrindo o evento).",
            code: "EVENT_FINALIZED",
            reason: motivoFim,
          });
        }
      }

      // Validação: se QUALQUER uma das datas está sendo alterada, verificar a
      // regra — compondo o lado ausente com o evento atual (payload parcial).
      // Comparação por STRING (YYYY-MM-DD), igual ao cliente e ao POST acima.
      if (validatedData.startDate || validatedData.truckDepartureDate) {
        let startRaw: unknown = validatedData.startDate;
        let truckRaw: unknown = validatedData.truckDepartureDate;
        if (!startRaw || !truckRaw) {
          startRaw = startRaw || before.startDate;
          truckRaw = truckRaw || before.truckDepartureDate;
        }
        const s = toDateOnlyStr(startRaw);
        const t = toDateOnlyStr(truckRaw);
        if (s && t && t >= s) {
          return res.status(400).json({
            error: "A saída do caminhão deve ser pelo menos 1 dia antes do início do evento"
          });
        }
      }

      // Normaliza para instante UTC explícito (ver toUtcInstant) apenas o que
      // veio no payload parcial — e barra horário impossível antes do Drizzle.
      const patchData: Record<string, unknown> = { ...safeData };
      if (validatedData.startDate != null) {
        const startAt = toUtcInstant(validatedData.startDate);
        if (!startAt) {
          return res.status(400).json({
            error: "Data ou horário inválido — confira o campo de hora (formato 08:00)"
          });
        }
        patchData.startDate = startAt;
      }
      if (validatedData.truckDepartureDate != null) {
        const truckAt = toUtcInstant(validatedData.truckDepartureDate);
        if (!truckAt) {
          return res.status(400).json({
            error: "Data ou horário inválido — confira o campo de hora (formato 08:00)"
          });
        }
        patchData.truckDepartureDate = truckAt;
      }

      // PRAZO DO MOLDE (22/09): só mexe se veio; vazio limpa.
      if ("prazoMolde" in patchData) {
        const prazoMolde = prazoMoldeParaGravar(validatedData.prazoMolde);
        if (prazoMolde === false) return res.status(400).json({ error: ERRO_PRAZO_MOLDE });
        if (prazoMolde === undefined) delete patchData.prazoMolde; else patchData.prazoMolde = prazoMolde;
      }

      const event = await storage.updateEvent(req.params.id, patchData as any);
      if (!event) {
        return res.status(404).json({ error: "Evento não encontrado" });
      }

      // Create audit log
      const changes = describeEventChanges(before, event);
      await createAuditLog(
        (req as any).userName,
        'updated',
        'event',
        event.id,
        changes.length > 0
          ? `Evento "${event.name}" atualizado — ${changes.join(" | ")}`
          : `Evento "${event.name}" atualizado (sem alteração de campos)`
      );

      broadcast({ type: "event_updated", event });

      // Mudou a saída do caminhão? A régua automática reprioriza JÁ (só os
      // eventos sem trava manual) — não no próximo tick de hora.
      if (patchData.truckDepartureDate) void aplicarPrioridadeAutomatica();

      res.json(event);
    } catch (error: any) {
      responderErro(res, error, "editar evento");
    }
  });

  // Update event priority — admin, atendimento (histórico) e solicitação (quem
  // gerencia eventos). Antes a UI mostrava a bandeira para solicitação e o
  // servidor devolvia 403; e atendimento tinha o direito sem botão nenhum.
  app.patch("/api/events/:id/priority", requireAuth, async (req, res) => {
    try {
      if (!["admin", "atendimento", "solicitacao"].includes(req.userRole ?? "")) {
        return res.status(403).json({ error: "Acesso negado" });
      }
      const { priority } = req.body;

      // priority vazia/null = DESTRAVAR: a prioridade volta a ser a AUTOMÁTICA
      // pela saída do caminhão (25/08, shared/prioridade-do-evento). Definir um
      // nível TRAVA o evento — a regra não sobrescreve escolha de gente.
      const clearing = priority === null || priority === "";
      if (!clearing && !["baixa", "media", "alta", "urgente"].includes(priority)) {
        return res.status(400).json({ error: "Prioridade inválida. Use: baixa, media, alta, urgente ou vazio para voltar à automática" });
      }

      const before = await storage.getEvent(req.params.id);
      if (!before) {
        return res.status(404).json({ error: "Evento não encontrado" });
      }
      if (barraSeArquivado(before, res)) return;
      // Ao destravar, a automática entra JÁ — devolver null e esperar o tick
      // deixaria o card "sem prioridade" por até uma hora.
      const automatica = motivoEventoFinalizado(before as any, todayBusinessMs()) !== null
        ? null
        : prioridadePelaSaida(before.truckDepartureDate ? new Date(before.truckDepartureDate as any).getTime() : null, Date.now());
      const event = await storage.updateEvent(req.params.id, {
        priority: (clearing ? automatica : priority) as any,
        priorityManual: !clearing,
      } as any);
      if (!event) {
        return res.status(404).json({ error: "Evento não encontrado" });
      }

      // Create audit log
      await createAuditLog(
        (req as any).userName,
        'updated',
        'event',
        event.id,
        clearing
          ? `Prioridade do evento "${event.name}" voltou à automática (regra da saída do caminhão${automatica ? `: "${automatica}"` : ""})`
          : `Prioridade do evento "${event.name}" definida como "${priority}" à mão — travada; a regra automática não mexe até limpar`
      );

      // eventId no topo do payload: o handler do cliente invalida
      // ['/api/events'] e ['/api/events', eventId] sem precisar cavar o objeto.
      broadcast({ type: "event_priority_updated", eventId: event.id, event });

      res.json(event);
    } catch (error: any) {
      responderErro(res, error, "prioridade do evento");
    }
  });

  // "Excluir" evento = ARQUIVAR (o botão das telas continua chamando DELETE).
  //
  // Antes era DELETE da linha, e o ON DELETE CASCADE apagava junto peças,
  // aprovações, registros de impressão, linhas de tubo e consultas de estoque —
  // sem volta, e com peças-fantasma nas abas abertas. Agora a linha fica com
  // `arquivado_em`: some de toda lista e contagem, não aceita escrita, e
  // POST /restaurar devolve tudo como estava. Remoção física é manutenção
  // (docs/arquitetura.md), nunca um clique.
  app.delete("/api/events/:id", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas administradores podem excluir eventos" });
      }
      const event = await storage.getEvent(req.params.id);
      if (!event || event.arquivadoEm) {
        return res.status(404).json({ error: "Evento não encontrado" });
      }

      // Dimensão do que sai de vista — para a trilha e para a resposta (a
      // confirmação da UI diz "e 128 peças (96 já entregues)"). Lida ANTES de
      // arquivar: depois, a leitura de peças já não enxerga o evento.
      const items = await storage.getItemsByEvent(req.params.id);
      const deliveredCount = items.filter((it) => DELIVERED.has(it.status)).length;

      const arquivado = await storage.arquivarEvento(req.params.id, (req as any).userName ?? null);
      if (!arquivado) {
        // Outro clique arquivou no meio: para quem pediu, o resultado é o mesmo.
        return res.status(404).json({ error: "Evento não encontrado" });
      }

      await createAuditLog(
        (req as any).userName,
        'deleted',
        'event',
        req.params.id,
        `Evento "${event.name}" arquivado — ${items.length} ${items.length === 1 ? 'peça saiu' : 'peças saíram'} de vista (${deliveredCount} já ${deliveredCount === 1 ? 'entregue' : 'entregues'}). Nada foi apagado: restaurar devolve tudo como estava`
      );

      // event_deleted: as telas tiram o evento. items_bulk_updated: a lista de
      // peças busca o delta, que já vem sem o evento em `eventos` — e o cliente
      // derruba as peças dele (aplicarDelta).
      broadcast({ type: "event_deleted", eventId: req.params.id });
      if (items.length > 0) broadcast({ type: "items_bulk_updated", itemIds: items.map((i) => i.id), eventId: req.params.id });

      // Mesmo contrato de antes (`deletedItems` = peças que saíram de vista).
      res.json({ success: true, deletedItems: items.length, deliveredItems: deliveredCount, archived: true });
    } catch (error: any) {
      responderErro(res, error, "excluir evento");
    }
  });

  // Restaurar evento arquivado — mesmo gate de quem arquiva (admin).
  app.post("/api/events/:id/restaurar", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas administradores podem restaurar eventos" });
      }
      const event = await storage.getEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Evento não encontrado" });
      }
      const restaurado = event.arquivadoEm ? await storage.restaurarEvento(req.params.id) : undefined;
      if (!restaurado) {
        return res.status(409).json({ error: "Este evento não está arquivado" });
      }
      const items = await storage.getItemsByEvent(req.params.id);
      await createAuditLog(
        (req as any).userName,
        'updated',
        'event',
        req.params.id,
        `Evento "${event.name}" restaurado do arquivo — ${items.length} ${items.length === 1 ? 'peça voltou' : 'peças voltaram'} às telas`
      );
      // O delta de /api/items reenvia as peças do evento restaurado (restauradoEm).
      broadcast({ type: "event_updated", event: restaurado });
      if (items.length > 0) broadcast({ type: "items_bulk_updated", itemIds: items.map((i) => i.id), eventId: req.params.id });
      res.json({ success: true, event: restaurado, items: items.length });
    } catch (error: any) {
      responderErro(res, error, "restaurar evento");
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ENCERRAR / REABRIR — a única ação HUMANA sobre o ciclo de vida do evento.
  //
  // Por que existe: até aqui "acabou" era 100% derivado (todas as peças
  // entregues, ou a data passou). Não havia como uma pessoa dizer "esse evento
  // está fechado" — um evento que saiu com 3 peças canceladas na mão ficava
  // para sempre em "Realizado com pendências", em âmbar na lista de Eventos por
  // um trabalho que ninguém mais vai fazer. Encerrar é o que troca esse selo
  // pelo cinza "Encerrado manualmente" — e é a única das duas saídas com volta.
  //
  // Por que é ADMIN, e não admin/solicitação como a edição: encerrar não muda
  // um dado do evento, retira trabalho do campo de visão de OUTRAS equipes —
  // some da Gestão de Prazos e das filas de Arte/Gráfica/Atendimento. É a mesma
  // classe de decisão da exclusão (também admin), e não a de editar uma data.
  // Reabrir usa o mesmo gate de propósito: quem pode desfazer é quem pode fazer.
  //
  // O que NÃO acontece: nenhuma peça muda de status. Encerrar não cancela nem
  // entrega nada — é justamente por isso que reabrir devolve o evento
  // exatamente ao estado em que ele estava.
  // ───────────────────────────────────────────────────────────────────────────
  app.post("/api/events/:id/close", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas administradores podem encerrar eventos" });
      }
      const event = await storage.getEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Evento não encontrado" });
      }
      if (barraSeArquivado(event, res)) return;
      if (event.status === EVENT_CLOSED_STATUS) {
        return res.status(409).json({ error: "Este evento já está encerrado" });
      }

      // Dimensão real do que está sendo tirado de vista — vai para o log e volta
      // no corpo, para o toast repetir o número que a confirmação prometeu.
      const items = await storage.getItemsByEvent(req.params.id);
      const work = countOpenWork(items);

      // `reopenedAt: null` junto: encerrar REVOGA a licença que a reabertura
      // deu. Sem isto, um evento reaberto e encerrado de novo voltaria a ficar
      // destravado assim que alguém reabrisse pela segunda vez — a licença
      // antiga ainda estaria lá, com data posterior ao dia do evento.
      const updated = await storage.updateEvent(req.params.id, { status: EVENT_CLOSED_STATUS, reopenedAt: null } as any);
      if (!updated) {
        return res.status(404).json({ error: "Evento não encontrado" });
      }

      const resumo = work.openCount > 0
        ? `${work.openCount} ${work.openCount === 1 ? "peça continua" : "peças continuam"} em aberto (${work.inProductionCount} em produção, ${work.deliveredCount} de ${work.activeItemCount} ${work.deliveredCount === 1 ? "entregue" : "entregues"})`
        : work.activeItemCount > 0
          ? `todas as ${work.activeItemCount} peças já estavam entregues`
          : "o evento não tinha nenhuma peça";

      await createAuditLog(
        (req as any).userName,
        "updated",
        "event",
        updated.id,
        `Evento "${updated.name}" ENCERRADO manualmente — ${resumo}. Sai da Gestão de Prazos e das filas de trabalho; segue visível no histórico e pode ser reaberto.`
      );

      broadcast({ type: "event_closed", eventId: updated.id, event: updated });

      res.json({ success: true, event: updated, ...work });
    } catch (error: any) {
      responderErro(res, error, "encerrar evento");
    }
  });

  app.post("/api/events/:id/reopen", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas administradores podem reabrir eventos" });
      }
      const event = await storage.getEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Evento não encontrado" });
      }
      /**
       * REABRIR VALE PARA AS DUAS ORIGENS, e antes valia só para uma.
       *
       * A rota exigia `status === closed`, ou seja, só aceitava desfazer o
       * encerramento HUMANO. Um evento travado porque a data passou devolvia
       * 409 — e a única saída era encerrar primeiro para poder reabrir, uma
       * dança sem sentido que o dono de fato executou antes de reclamar.
       *
       * Agora a pergunta é a mesma que trava a edição: o evento está
       * finalizado por ALGUM motivo? Se não está, não há o que reabrir.
       */
      if (barraSeArquivado(event, res)) return;
      const motivo = motivoEventoFinalizado(event, todayBusinessMs());
      if (motivo === null) {
        return res.status(409).json({ error: "Este evento não está encerrado nem já aconteceu" });
      }

      // Volta para "created" e não para "completed": a partir daqui quem manda
      // é a derivação de novo, e a primeira mexida numa peça (updateEventStatus)
      // recarimba o valor certo. Carimbar "completed" aqui seria a mentira que
      // esta base já corrigiu uma vez.
      // `reopenedAt` é a licença: a partir daqui a data deixa de travar este
      // evento. Gravada AGORA (e não como booleano) porque a regra compara a
      // reabertura com o dia do evento — reabrir antes da data não pode valer
      // como licença para depois que ela vencer.
      const updated = await storage.updateEvent(req.params.id, { status: "created", reopenedAt: new Date() } as any);
      if (!updated) {
        return res.status(404).json({ error: "Evento não encontrado" });
      }

      const items = await storage.getItemsByEvent(req.params.id);
      const work = countOpenWork(items);

      await createAuditLog(
        (req as any).userName,
        "updated",
        "event",
        updated.id,
        `Evento "${updated.name}" REABERTO (estava ${motivo === "encerrado" ? "encerrado à mão" : "fora de jogo porque a data já passou"}) — volta para a Gestão de Prazos e para as filas de trabalho com ${work.openCount} ${work.openCount === 1 ? "peça em aberto" : "peças em aberto"} (${work.inProductionCount} em produção).`
      );

      broadcast({ type: "event_reopened", eventId: updated.id, event: updated });

      res.json({ success: true, event: updated, ...work });
    } catch (error: any) {
      responderErro(res, error, "reabrir evento");
    }
  });

  // Submit all draft items to Arte
  app.post("/api/events/:id/items/submit", requireAuth, async (req, res) => {
    try {
      const userRole = (req as any).userRole;
      const userId = (req as any).userId;
      const eventId = req.params.id;

      // Buscar evento para validação
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Evento não encontrado" });
      }

      // Allow admin or any solicitacao user to submit draft items
      const isAdmin = userRole === 'admin';
      const isSolicitacao = userRole === 'solicitacao';

      if (!isAdmin && !isSolicitacao) {
        return res.status(403).json({ error: "Acesso negado. Apenas perfis de Solicitação ou Admin podem enviar itens para vinculação" });
      }

      // Evento fechado (à mão OU já realizado): esta rota promove TODAS as
      // peças em rascunho do evento para "aguardando vinculação" de uma vez —
      // é a mesma classe de "fazer o trabalho andar" que motivou a guarda em
      // server/routes/items.ts (ver o bloco "EVENTO FINALIZADO × ESCRITA DE
      // PEÇA" lá), só que faltava aqui: o commit que barrou as 39 rotas de
      // peça não tocou em events.ts, e esta era a única escrita de peça deste
      // arquivo. Sem isto, o Detalhe do Evento continuava oferecendo "Enviar
      // para vinculação" e o servidor aceitava — o mesmo buraco relatado em
      // produção, por uma porta diferente.
      const fechadoSubmit = motivoEventoFechado(event);
      if (fechadoSubmit) {
        return res.status(409).json({
          error: erroEventoFechado(fechadoSubmit),
          code: "EVENT_FINALIZED",
          reason: fechadoSubmit,
        });
      }

      // Buscar todos os itens em rascunho deste evento (draft = novo, requested = legado)
      const allItems = await storage.getItemsByEvent(eventId);
      // KIT (14/09): cada um envia a sua lista — o usuário do Kit só as peças
      // do Kit dele; a Solicitação da Arena só as da Arena; o admin, tudo.
      const doKit = (req as any).userKit === true;
      const draftItems = allItems.filter(item =>
        (item.status === 'draft' || item.status === 'requested') &&
        (isAdmin || (doKit ? (!!item.kitRemessaId && item.criadoPorId === userId) : !item.kitRemessaId)));

      if (draftItems.length === 0) {
        return res.status(400).json({ error: "Nenhum item em rascunho para enviar" });
      }

      // Atomic status transition: draft/requested → awaiting_linking
      // Cast is safe: draftItems was filtered to only draft/requested above.
      type ItemStatus = Parameters<typeof storage.updateItemWithStatusCheck>[1];
      const updatePromises = draftItems.map(item =>
        // MOLDE (22/09) não passa pela Vinculação: cai direto na Arte (shared/molde).
        storage.updateItemWithStatusCheck(item.id, item.status as ItemStatus, statusAoEnviarALista(item))
      );
      const updatedItems = await Promise.all(updatePromises);

      // Filter out failed updates (items that returned null)
      const successfulUpdates = updatedItems.filter((item): item is Item => item !== null);
      // FALHA PARCIAL: a peça que mudou de status no meio do envio (outra
      // pessoa mexeu) volta null. As que PASSARAM já estão gravadas — antes a
      // rota respondia 409 e saía sem trilha nem aviso delas, e a tela dizia
      // "não deu" sobre peças que tinham ido. Agora elas seguem o caminho
      // normal abaixo, e a resposta nomeia as que ficaram.
      const falharam = draftItems.filter((_, i) => updatedItems[i] === null);
      const failedCount = falharam.length;

      // Nenhuma passou: aí sim é conflito — nada foi feito.
      if (successfulUpdates.length === 0 && failedCount > 0) {
        return res.status(409).json({
          error: "As peças mudaram de status durante o envio (outra pessoa mexeu nelas). Recarregue a página e tente de novo.",
          failedCount,
          successCount: 0,
          falharam: falharam.map((i) => i.displayId),
        });
      }

      // All updates successful - create audit log with actual count.
      // MOLDE (revisão 22/09): o molde NÃO foi para a Vinculação — foi direto
      // para a Arte (Aguardando envio). A trilha e o aviso dizem o destino de
      // cada grupo, em vez de chamar tudo de "aguardando vinculação".
      const moldes = successfulUpdates.filter((i) => ehMolde(i)).length;
      const comuns = successfulUpdates.length - moldes;
      const frases: string[] = [];
      if (comuns > 0) frases.push(`${comuns} ${comuns === 1 ? 'item' : 'itens'}: Status alterado de Rascunho → Aguardando Vinculação (${comuns === 1 ? 'enviado' : 'enviados'} para vinculação)`);
      if (moldes > 0) frases.push(`${moldes} ${moldes === 1 ? 'molde' : 'moldes'}: Status alterado de Rascunho → Aguardando Envio (molde vai direto para a Arte, sem vinculação)`);
      if (failedCount > 0) frases.push(`${failedCount} não ${failedCount === 1 ? 'foi' : 'foram'} (mudaram de status durante o envio): ${falharam.map((i) => i.displayId).join(', ')}`);
      if (frases.length > 0) {
        await createAuditLog(
          (req as any).userName,
          'created',
          'item',
          eventId,
          frases.join(' | ')
        );
      }

      // Notify Arte and Admin profiles with actual count
      if (successfulUpdates.length > 0) {
        const partes: string[] = [];
        if (comuns > 0) partes.push(`${comuns} ${comuns === 1 ? 'novo item' : 'novos itens'} aguardando vinculação de patrocinadores`);
        if (moldes > 0) partes.push(`${moldes} ${moldes === 1 ? 'molde pronto' : 'moldes prontos'} para a Arte (sem vinculação)`);
        // O aviso não desfaz o envio: as peças já andaram.
        try {
          await storage.createNotification({
            type: 'itemsSubmitted',
            message: `${partes.join(' e ')} no evento "${event.name}"`,
            targetRoles: ['arte'], // só quem AGE: a Arte cria o thumb; admin não tem ação aqui
            eventId,
          });
        } catch (e) {
          console.error("[enviar rascunhos] peças enviadas, mas o aviso falhou:", e);
        }
      }

      broadcast({
        type: "items_submitted",
        eventId,
        count: successfulUpdates.length,
        items: successfulUpdates
      });

      res.json({
        success: true,
        count: successfulUpdates.length,
        items: successfulUpdates,
        failedCount,
        // Códigos das que não foram (mudaram de status no meio do envio).
        falharam: falharam.map((i) => i.displayId),
      });
    } catch (error: any) {
      responderErro(res, error, "enviar rascunhos");
    }
  });

}
