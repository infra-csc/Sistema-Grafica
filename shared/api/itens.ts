// ─────────────────────────────────────────────────────────────────────────────
// CONTRATOS DAS LISTAS DE PEÇAS — GET /api/items e recortes, /api/items/approved,
// /pending, /deleted, /resubmission-needed, /batch-approval-data, /:eventId.
//
// Fonte: server/routes/itens/leitura.ts (enrichItemsWithEventsAndSponsors,
// enrichItemsWithComplements, attachParents) e server/services/tubosDaPeca.ts
// (comTubo). O formato COMPACTO e o DELTA (shared/itens-compactos.ts) são
// decodificados em client/src/lib/queryClient.ts ANTES do cache: o que o
// `useQuery` recebe é sempre o array de `PecaEnriquecida` descrito aqui.
// ─────────────────────────────────────────────────────────────────────────────
import type { Event, Item, ItemSponsorApproval, Sponsor, kitRemessas } from "../schema";
import type { COLUNAS_DA_TRILHA } from "../itens-compactos";
import type { Json } from "./json";

/** Linha da peça como chega pelo cabo (datas em texto ISO). */
export type PecaJson = Json<Item>;
/** Linha do evento como chega pelo cabo. */
export type EventoJson = Json<Event>;
/** Linha do patrocinador como chega pelo cabo. */
export type PatrocinadorJson = Json<Sponsor>;
/** Remessa do Kit (linha de `kit_remessas`) como chega pelo cabo. */
export type RemessaDoKitJson = Json<typeof kitRemessas.$inferSelect>;

/**
 * O evento EMBUTIDO na peça. Na peça do Kit ele vem com as datas da remessa
 * (shared/kit.ts, eventoComDatasDoKit): `truckDepartureDate`/`startDate` já
 * trocados e as três marcas abaixo presentes.
 */
export type EventoEmbutido = EventoJson & {
  datasDoKit?: true;
  kitVersao?: string;
  /** A saída ORIGINAL da Arena, guardada quando a peça do Kit troca as datas. */
  saidaDaArena?: string | null;
};

/** O patrocinador embutido na peça, com o status da aprovação DESTA peça. */
export type PatrocinadorDaPeca = PatrocinadorJson & {
  /** "approved" | "rejected" | "pending" | "awaiting_arte" … ou null (sem linha de aprovação). */
  approvalStatus: string | null;
};

/** Um volume (tubo ou embalagem avulsa) da peça — services/tubosDaPeca.ts. */
export type VolumeDaPeca = { tuboId: string; numero: number; avulso: boolean; quantidade: number };

/** O resumo do tubo que `comTubo` espalha na peça quando ela tem `tuboId`. */
export type TuboDaPeca = {
  tuboNumero: number;
  /** Embalada SOZINHA: o volume não é um "Tubo N" (número negativo). */
  tuboAvulso: boolean;
  tuboFechadoEm: string | null;
  tuboEntregueEm: string | null;
  tuboRecebidoPor: string | null;
  /** Volumes ABERTOS da peça, com quanto dela está em cada. */
  tuboVolumes?: VolumeDaPeca[];
  /** Volumes JÁ ENTREGUES da peça (só a etiqueta lê). */
  tuboVolumesEntregues?: VolumeDaPeca[];
};

/** O `parent` que o complemento carrega (attachParents). */
export type MaeDoComplemento = { id: string; displayId: string | null; quantity: number; status: string };

/**
 * A peça ENRIQUECIDA das listas — o elemento de GET /api/items (sem
 * `?campos=`), /approved, /pending, /deleted e /api/items/:eventId.
 *
 * - `event` fica AUSENTE quando o evento não está no dicionário (arquivado):
 *   `undefined` some no JSON;
 * - `tubo*` só existem quando a peça está num volume (`comTubo`);
 * - `complements`/`contractedTotal` só na MÃE que tem complemento;
 * - `parent` só no complemento cuja mãe foi encontrada.
 */
export type PecaEnriquecida = PecaJson & Partial<TuboDaPeca> & {
  event?: EventoEmbutido;
  sponsors: PatrocinadorDaPeca[];
  kitRemessa: RemessaDoKitJson | null;
  complements?: PecaJson[];
  contractedTotal?: number;
  parent?: MaeDoComplemento;
};

/** GET /api/items?campos=trilha — só as colunas de COLUNAS_DA_TRILHA (a coluna ausente vem null, como a nula). */
export type PecaDaTrilha = { [K in typeof COLUNAS_DA_TRILHA[number]]: PecaJson[K] };

/**
 * A resposta do DELTA (`?since=`) antes da decodificação — é o que
 * `aplicarDelta` (client/src/lib/queryClient.ts) junta ao cache. `agora` é a
 * âncora do próximo delta (relógio do servidor).
 */
export interface DeltaDePecas<P = PecaEnriquecida> {
  delta: true;
  agora?: string;
  itens?: P[];
  removidas?: string[];
  /** TODOS os eventos (é por eles que a peça de evento excluído sai do cache). */
  eventos?: EventoJson[];
  /** TODOS os patrocinadores (re-costuram os embutidos nas peças que não mudaram). */
  patrocinadores?: PatrocinadorJson[];
}

/** Aprovação de patrocinador com o patrocinador junto (resubmission-needed, batch-approval-data). */
export type AprovacaoComPatrocinador = Json<ItemSponsorApproval> & { sponsor: PatrocinadorJson | null };

/** GET /api/items/resubmission-needed — a fila de Correção da Arte. */
export type PecaParaCorrecao = PecaJson & {
  event: EventoJson | null;
  /** As linhas em `awaiting_arte` (o que voltou e precisa ser refeito). */
  awaitingArteApprovals: AprovacaoComPatrocinador[];
  /** TODAS as aprovações da peça (quem já aprovou mantém). */
  aprovacoes: AprovacaoComPatrocinador[];
};

/** GET /api/items/batch-approval-data — vínculos e aprovações das peças vivas, por peça. */
export interface DadosDeAprovacaoEmLote {
  sponsorsByItem: Record<string, PatrocinadorJson[]>;
  approvalsByItem: Record<string, AprovacaoComPatrocinador[]>;
}
