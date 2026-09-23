// ─────────────────────────────────────────────────────────────────────────────
// OS TIPOS DA VINCULAÇÃO — o que a tela realmente lê da API, e nada além.
//
// Parte do schema (@shared/schema), mas no formato do JSON: `Date` chega como
// string, e as relações que o servidor embute (patrocinadores da peça e do
// evento, remessa do Kit) entram só com os campos que a tela usa. Quem
// precisar de outro campo acrescenta aqui — e o tsc aponta onde ele faltar.
// ─────────────────────────────────────────────────────────────────────────────
import type { QueryKey } from "@tanstack/react-query";
import type { Event, EventSponsor, Item, Sponsor, StandardItem } from "@shared/schema";
import type { RemessaDoKit } from "@shared/kit";

/** Como o JSON entrega: `Date` vira string ISO. */
export type ComoJson<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K];
};

/**
 * A PEÇA como GET /api/items?status=…&eventId=… entrega (formato compacto,
 * expandido pelo queryClient). `sponsors` são os vínculos já salvos — é deles
 * que sai o `originalSponsorsMap`, sem a antiga requisição por peça.
 */
export type PecaDaVinculacao = Pick<
  ComoJson<Item>,
  | "id" | "displayId" | "eventId" | "type" | "description" | "status"
  | "skipApproval" | "isReuse" | "quantity" | "calculatedM2" | "referenceUrl" | "kitRemessaId"
> & {
  sponsors?: Pick<Sponsor, "id">[] | null;
  kitRemessa?: Partial<RemessaDoKit> | null;
};

/** O EVENTO de GET /api/events, com os patrocinadores dele embutidos. */
export type EventoDaVinculacao = Pick<
  ComoJson<Event>,
  "id" | "name" | "priority" | "status" | "startDate" | "truckDepartureDate" | "reopenedAt"
> & {
  sponsors?: Pick<EventSponsor, "sponsorId">[] | null;
};

/** O PATROCINADOR de GET /api/sponsors. */
export type PatrocinadorDaVinculacao = Pick<Sponsor, "id" | "name" | "color" | "company">;

/** A peça padrão de GET /api/standard-items — só o que monta o grupo pai. */
export type PecaPadrao = Pick<StandardItem, "name" | "group">;

/** Rascunho local de uma peça: o que foi marcado e ainda não foi salvo. */
export type ItemChanges = {
  sponsorIds: string[];
  skipApproval: boolean;
  isDirty: boolean;
};

// Estados UI simplificados
export type UIStatus = 'RASCUNHO' | 'PRONTO' | 'ENVIADO' | 'PENDENTE';

/** A FOTO que o modal de envio leva: as peças e o que cada uma ganha nele. */
export interface SendConfirmModal {
  items: PecaDaVinculacao[];
  pendingByItem: Record<string, Set<string>>;
}

/** Um item do POST /api/items/:id/sponsors/sync. */
export type SavePayload = { itemId: string; sponsorIds: string[]; skipApproval: boolean };

/** A falha de uma peça num lote — o motivo fica escrito na linha dela. */
export type FalhaDaPeca = { itemId: string; message: string };

/** O que o salvamento em lote devolve: nada propaga enquanto houver um salvo. */
export type ResultadoDoSalvamento = { savedIds: string[]; failed: FalhaDaPeca[] };

/** A cópia dos mapas antes do otimista, para desfazer só o que falhou. */
export type FotoDoSalvamento = {
  itemSponsorsMap: Record<string, string[]>;
  originalSponsorsMap: Record<string, string[]>;
  /** Cada consulta sob o prefixo ["/api/items"] como estava antes do otimista. */
  itemsCache: Array<[QueryKey, unknown]>;
};

/** Resposta de POST /api/items/send-to-arte. */
export type RespostaDoEnvio = {
  success?: boolean;
  sent: number;
  errors?: string[];
  falhas?: { itemId: string; motivo: string }[];
};

/** Uma peça recusada num lote, com o motivo do servidor. */
export type Recusada = { displayId: string; motivo: string };

/** Resposta de POST /api/items/bulk-add-sponsor. */
export type RespostaDoAcrescentar = {
  sponsor: string;
  vinculadas: number;
  reabertas: number;
  jaTinham: number;
  pendenciasCriadas: number;
  recusadas: Recusada[];
};

/** O resultado de um lote com muitas recusas, aberto em modal. */
export type ResultadoDoLote = { titulo: string; recusadas: Recusada[] };

/** Uma entrada de GET /api/events/:id/auto-link-preview (storage.previewAutoLink). */
export type PreviaDoAutoVinculo = {
  sponsorId: string;
  sponsorName: string;
  quota: string;
  items: { itemId: string; displayId: string; type: string; description: string | null }[];
};

/** Progresso visível da sincronização do envio em lote. */
export type ProgressoDoEnvio = { feito: number; total: number };

/** Uma opção de filtro facetado, com contagem. */
export type OpcaoDeFiltro = { value: string; label: string; count: number; dotColor?: string };

/**
 * Um grupo da lista: o evento inteiro, ou um patrocinador dentro do evento.
 * O grupo por patrocinador traz TODAS as peças do evento — o chip marcado é
 * que diz quais já têm a marca.
 */
export type GrupoDaLista = {
  chave: string;
  event: EventoDaVinculacao;
  /** Só no agrupamento por patrocinador. */
  sponsor?: PatrocinadorDaVinculacao;
  itens: PecaDaVinculacao[];
  vinculadas: number;
  total: number;
};

export type Agrupamento = "evento" | "patrocinador";

/** As quatro contagens por situação. */
export type ContagemPorEstado = Record<UIStatus, number>;
