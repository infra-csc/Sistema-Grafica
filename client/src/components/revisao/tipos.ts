// ─────────────────────────────────────────────────────────────────────────────
// O QUE A REVISÃO FINAL RECEBE DA API, tipado como chega.
//
// A base é o schema (`@shared/schema`), mas pelo JSON: toda coluna timestamp
// chega como texto ISO, não como Date — `ComoJson` diz isso ao compilador em
// vez de fingir que a tela recebe um Date. O resto são os campos que o
// servidor acrescenta à peça ao enriquecê-la (server/routes/itens/leitura.ts):
// o evento, os patrocinadores e a remessa do Kit.
// ─────────────────────────────────────────────────────────────────────────────
import type { AuditLog, Event, Item, Sponsor, StandardItem } from "@shared/schema";
import type { RemessaDoKit } from "@shared/kit";

/** Datas viram texto ISO no JSON; o resto passa como está. */
export type ComoJson<T> = { [K in keyof T]: Date extends T[K] ? Exclude<T[K], Date> | string : T[K] };

/** GET /api/events — o evento cru. */
export type EventoDaApi = ComoJson<Event>;

/**
 * O evento que vem DENTRO da peça. Na peça do Kit ele chega com as datas da
 * remessa no lugar das da Arena (`eventoComDatasDoKit`, shared/kit.ts) e a
 * marca `datasDoKit`, que troca "Caminhão" por "Entrega do material".
 */
export type EventoDaPeca = EventoDaApi & {
  datasDoKit?: boolean;
  kitVersao?: string;
  saidaDaArena?: string;
};

/** Patrocinador da peça, com o status da aprovação dele nela. */
export type PatrocinadorDaPeca = ComoJson<Sponsor> & { approvalStatus?: string | null };

/** Uma peça da fila de revisão, como GET /api/items?status= entrega. */
export type PecaDaRevisao = ComoJson<Item> & {
  event?: EventoDaPeca;
  sponsors?: PatrocinadorDaPeca[];
  kitRemessa?: Partial<RemessaDoKit> | null;
};

/** Uma linha da trilha (GET /api/audit-logs?entityId=). */
export type RegistroDoHistorico = ComoJson<AuditLog>;

/** Item padrão — a tela só lê o nome e o grupo, para ordenar e agrupar. */
export type ItemPadrao = ComoJson<StandardItem>;

/** POST /api/revisao/digest/enviar: a frase pronta, inclusive quando não enviou. */
export interface RespostaDoAviso {
  status?: string;
  mensagem?: string;
}

/**
 * PATCH /api/items/:id/return-to-arte: a peça como ficou, mais o destino que o
 * SERVIDOR aplicou (molde volta sempre para o começo da Arte). Corpo vazio
 * quando a resposta não é JSON.
 */
export type RespostaDaDevolucao = Partial<PecaDaRevisao> & { destinoDevolvido?: string };

/** PATCH /api/items/bulk-return-to-arte. `errors` era um número em versões antigas. */
export interface RespostaDoLoteDeDevolucao {
  success: number;
  errors?: Array<{ itemId: string; error: string }> | number;
  failedItemIds?: string[];
  destinos?: Record<string, string>;
}

/** Para onde a peça devolvida volta. */
export type DestinoDaDevolucao = "finalizacao" | "arte";

/** O filtro do estoque (?estoque=). "" = desligado. */
export type FiltroDoEstoque = "" | "aguardando" | "respondeu";

/** O recorte que mora na URL (?busca=&evento=&tipo=). */
export interface FiltrosRevisao { busca: string; eventos: string[]; tipos: string[] }

/** Uma opção de faceta (evento ou tipo) com a contagem do pool. */
export interface OpcaoDeFaceta { value: string; label: string; count: number }
