// Tipos da tela de Eventos: o que GET /api/events devolve (enrichEvent em
// server/routes/events.ts) e o estado do formulário de evento.
import type { Event, EventSponsor } from "@shared/schema";

/** O JSON traz as datas como texto ISO. */
type ComoJson<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K];
};

export type PriorityLevel = 'baixa' | 'media' | 'alta' | 'urgente' | 'sem_prioridade';

// VOCABULÁRIO DOS QUATRO ESTADOS — duas palavras, dois significados, sem
// sobreposição:
//   · `manually_closed` "Encerrado manualmente" — ENCERRAR é sempre decisão de
//     gente, e é a única com volta (reabrir). É o único estado que NÃO é
//     derivado, e sobrepõe os outros três (ver enrichEvent).
//   · `completed` "Concluído" — a produção terminou. O fim feliz.
//   · `realizado` "Realizado com pendências" — REALIZAR é sempre a data: o dia
//     do evento passou e sobrou trabalho aberto. Substituiu
//     `closed_with_pending`, que dizia "Encerrado" sem que ninguém tivesse
//     encerrado nada — três rótulos começando por "Encerrado" para três coisas
//     diferentes era a confusão que este nome desfaz.
//   · `active` — em jogo.
export type LifecycleKey = 'active' | 'completed' | 'realizado' | 'manually_closed';

/** Forma de `event.nextMilestone` — contrato de server/routes/events.ts. */
export interface NextMilestonePayload {
  key: string;
  label: string;
  deadline: string;       // "YYYY-MM-DD", já com ajuste sáb→sex / dom→seg
  daysRemaining: number;  // >0 faltam N · 0 vence hoje · <0 atrasado há N
  state: 'upcoming' | 'warning' | 'overdue';
  pendingItems: number;
  invalidDate: boolean;
}

/**
 * Peça embutida no evento. Com `?itens=resumo` o cliente a remonta só com
 * `eventId`, `status` e `skipApproval` (shared/eventos-resumo.ts) — o `id`
 * pode faltar, e ninguém nesta tela o lê.
 */
export interface PecaDoEventoNaLista {
  id?: string;
  eventId?: string;
  status: string;
  skipApproval?: unknown;
}

/** Vínculo evento ↔ patrocinador como vem embutido: nome e cor saem da lista global. */
export type VinculoDoEventoNaLista = Pick<ComoJson<EventSponsor>, "sponsorId" | "quota"> & Partial<ComoJson<EventSponsor>>;

/**
 * Um evento de GET /api/events. Os contadores e o ciclo de vida vêm prontos
 * do servidor; ficam opcionais porque um Express antigo (git pull sem
 * Stop/Run) responde sem eles — e `readEventStats` tem o fallback.
 */
export type EventoDaLista = ComoJson<Event> & {
  lifecycle?: string | null;
  eventHasPassed?: boolean;
  allDelivered?: boolean;
  manuallyClosed?: boolean;
  itemCount?: number;
  activeItemCount?: number;
  deliveredCount?: number;
  canceledCount?: number;
  openCount?: number;
  nextMilestone?: NextMilestonePayload | null;
  items?: PecaDoEventoNaLista[];
  sponsors?: VinculoDoEventoNaLista[];
};

export interface EventStats {
  itemCount: number;
  activeItemCount: number;
  deliveredCount: number;
  canceledCount: number;
  openCount: number;
  inProductionCount: number;
  allDelivered: boolean;
  eventHasPassed: boolean;
  manuallyClosed: boolean;
  lifecycle: LifecycleKey;
  progressPct: number;
}

/** Os três baldes de situação — particionam: cada evento cai em um só. */
export type BaldeDaSituacao = "ativos" | "pendencias" | "arquivados";
export type OrdemDosEventos = "saida" | "marco" | "nome";
export type DensidadeDaLista = "cartoes" | "lista";

export type CampoDePrazo =
  | 'deadlineListaImagens' | 'deadlineEntregaLayouts' | 'deadlineAprovacaoLayout'
  | 'deadlineFinalizacao' | 'deadlineRevisaoLista' | 'deadlineProducaoGrafica';

/** O formulário de criar/editar/duplicar. Datas em texto ("YYYY-MM-DD", saída com "THH:MM"). */
export type FormularioDoEvento = {
  name: string;
  priority: string;
  startDate: string;
  truckDepartureDate: string;
  /** "YYYY-MM-DD" ou "" — opcional, só para evento com molde. */
  prazoMolde: string;
} & Record<CampoDePrazo, number>;

/** Assinatura dos handlers das ações do cartão/linha (estáveis, via useCallback). */
export type AcaoSobreEvento = (event: EventoDaLista, e: React.MouseEvent) => void;
