// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO DE GET /api/events (a lista de eventos enriquecida).
//
// Fonte: server/routes/events.ts (enrichEvent, montarListaDeEventos). O cliente
// pede `?itens=resumo` e `expandirItensDosEventos` (shared/eventos-resumo.ts)
// devolve `items` como array antes do cache — por isso cada entrada de `items`
// tem só `eventId`, `status` e `skipApproval` (o `id` da peça NÃO volta).
// ─────────────────────────────────────────────────────────────────────────────
import type { EventSponsor } from "../schema";
import type { Json } from "./json";
import type { EventoJson } from "./itens";

/** O ciclo do evento: "encerrado" é decisão de gente; "realizado" é a data. */
export type CicloDoEvento = "active" | "completed" | "realizado" | "manually_closed";

/** O primeiro marco ainda pendente (nextMilestoneFor). */
export interface ProximoMarco {
  /** listaImagens | layouts | aprovacao | finalizacao | revisao | producao */
  key: string;
  label: string;
  /** "YYYY-MM-DD" (já com ajuste de fim de semana); "" quando a data é inválida. */
  deadline: string;
  /** >0 faltam N dias · 0 vence hoje · <0 atrasado há N dias. */
  daysRemaining: number;
  state: "upcoming" | "warning" | "overdue";
  pendingItems: number;
  /** Ano da saída fora de 2000-2100: não confie no prazo. */
  invalidDate: boolean;
}

/** Uma peça do evento como a lista a entrega ao cache (depois de expandir o resumo). */
export interface PecaNaListaDeEventos {
  eventId: string;
  status: string;
  skipApproval: boolean | null;
}

/** Elemento de GET /api/events. */
export type EventoDaLista = EventoJson & {
  /** Derivado da produção: "created" | "completed" | "closed". */
  status: string;
  eventHasPassed: boolean;
  allDelivered: boolean;
  manuallyClosed: boolean;
  lifecycle: CicloDoEvento;
  itemCount: number;
  activeItemCount: number;
  deliveredCount: number;
  canceledCount: number;
  openCount: number;
  /** Só para evento em jogo (`lifecycle === "active"`). */
  nextMilestone: ProximoMarco | null;
  items: PecaNaListaDeEventos[];
  /** Vínculos evento↔patrocinador (linhas de `event_sponsors`). */
  sponsors: Json<EventSponsor>[];
};

/** GET /api/sponsors/usage — uso de cada patrocinador, por id. */
export type UsoDosPatrocinadores = Record<string, { events: number; items: number; pendencias: number; mediaDias: number | null }>;
