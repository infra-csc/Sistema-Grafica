// ─── Tipos do Painel Geral ──────────────────────────────────────────────────
// A peça chega de /api/items já ENRIQUECIDA pelo servidor
// (server/routes/itens/leitura.ts): o evento CRU (com as datas da remessa,
// quando é peça do Kit), os patrocinadores com o status da aprovação e a
// remessa do Kit. Pelo JSON, toda data do banco vira texto ISO — por isso os
// tipos do schema passam por `ComoJson` antes de chegar aqui.
import type { AuditLog, Event, Item, Sponsor } from "@shared/schema";
import type { RemessaDoKit } from "@shared/kit";
import type { SeloEventoFinalizado } from "@/lib/painel-encerrados";

/** O que o JSON faz com a linha do banco: `Date` vira string ISO. */
export type ComoJson<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K];
};

/** O evento embutido em cada peça (`item.event`). */
export type EventoDaPeca = ComoJson<Event>;

/** Patrocinador vinculado à peça, com o status CRU da aprovação dele. */
export type PatrocinadorDaPeca = ComoJson<Sponsor> & { approvalStatus?: string | null };

/** Uma peça de /api/items (e de /api/items/deleted). */
export type PecaDoPainel = ComoJson<Item> & {
  event?: EventoDaPeca | null;
  sponsors?: PatrocinadorDaPeca[] | null;
  kitRemessa?: Partial<RemessaDoKit> | null;
  /** Grafia antiga do carimbo — `diasNoEstado` aceita as duas. */
  status_changed_at?: string | null;
};

/** Registro de /api/audit-logs da peça aberta na ficha. */
export type RegistroDeAuditoria = ComoJson<AuditLog>;

export type SortCampo = "displayId" | "status" | "area" | "ciclo";
export type SortDir = "asc" | "desc";

/** Ações da lista — objeto estável; as funções leem o estado atual por ref. */
export interface AcoesDaLista {
  abrir: (item: PecaDoPainel) => void;
  alternarSelecao: (id: string) => void;
  alternarSelecaoDoEvento: (itens: PecaDoPainel[], marcar: boolean) => void;
  excluir: (id: string) => void;
  restaurar: (id: string) => void;
  /** `extra`: quantas linhas o clique revela — entram no orçamento na hora. */
  expandir: (key: string, extra: number) => void;
  abrirGrupo: (key: string, extra: number) => void;
  ordenar: (campo: SortCampo) => void;
}

/** O retrato do evento, calculado sobre a base INTEIRA (não sobre o recorte). */
export type MetaDoEvento = {
  truckDayMs: number | null;
  pendentes: number;
  /** Selo de evento fora de jogo — `null` enquanto ele ainda conta. */
  selo: SeloEventoFinalizado | null;
};

/** As peças de um evento na lista, na ordem de exibição. */
export type GrupoDeEvento = { eventId: string | null; eventName: string; items: PecaDoPainel[] };

/** Opção de menu de filtro com contagem (FilterSelect / EventFilterDropdown). */
export type OpcaoDeFiltro = { value: string; label: string; count: number; dotColor?: string; pinned?: boolean };

/** O que vai para o DOM agora (renderização incremental por orçamento). */
export type GrupoNoPlano = {
  eventKey: string;
  gd: GrupoDeEvento;
  groupOpen: boolean;
  isExpanded: boolean;
  linhasPermitidas: number;
};
