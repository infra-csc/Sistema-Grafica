// ─────────────────────────────────────────────────────────────────────────────
// OS TIPOS DO DETALHE DO EVENTO — o que as rotas devolvem e o que a tela passa
// entre os pedaços. Antes a página tipava tudo como `any` (ou `& Record<string,
// any>`), e um campo renomeado no servidor só aparecia como bug na tela.
// ─────────────────────────────────────────────────────────────────────────────
import type { Item, Event as EventRecord, StandardItem, AuditLog, EventSponsor } from "@shared/schema";
import type { RemessaDoKit } from "@shared/kit";
import type { MaeDoComplemento } from "@shared/api";
import type { useAuth } from "@/contexts/auth-context";

/**
 * O que o JSON da API entrega de uma linha do schema: `Date` vira texto ISO
 * (o Drizzle tipa timestamp como Date, mas pela rede chega string).
 */
export type ComoJson<T> = { [K in keyof T]: Exclude<T[K], Date> | (Date extends T[K] ? string : never) };

/** Patrocinador pendurado na peça pelo enrich de GET /api/items/:eventId. */
export type PatrocinadorDaPeca = { id: string; name: string; color?: string | null; quota?: string | null };

/** A peça como GET /api/items/:eventId devolve (server/routes/itens/leitura.ts). */
export type PecaDoEvento = ComoJson<Item> & {
  sponsors?: PatrocinadorDaPeca[];
  /** No complemento: a mãe, para a linha dizer "Compl. de #0062" (attachParents; displayId pode faltar). */
  parent?: MaeDoComplemento | null;
  /** Na mãe: os complementos vivos. */
  complements?: Array<{ id: string; displayId: string; quantity: number | string; status?: string }>;
  contractedTotal?: number;
  /** Peça do Kit: a remessa (as datas do Kit). */
  kitRemessa?: Partial<RemessaDoKit> | null;
};

/** O evento como GET /api/events/:id devolve (enrichEvent). */
export type EventoDoDetalhe = ComoJson<EventRecord> & {
  /** Encerrado à mão (enrichEvent); o fallback lê `status === 'closed'`. */
  manuallyClosed?: boolean;
};

/** Modelo do catálogo (GET /api/standard-items). */
export type ModeloDePeca = ComoJson<StandardItem>;

/** Opção avulsa do catálogo (GET /api/catalog-options). */
export type OpcaoDoCatalogo = { kind: string; value: string };

/** Vínculo evento ↔ patrocinador (GET /api/events/:id/sponsors). */
export type VinculoDePatrocinador = ComoJson<EventSponsor>;

/** Linha do log de auditoria (GET /api/audit-logs). */
export type LogDeAuditoria = ComoJson<AuditLog>;

/** GET /api/events/:id/estoque-resumo — por peça, o que o estoque tem de igual. */
export type EstoqueDaPeca = { disponiveis: number; chegamATempo: number; faltaTriagem: number; reservadas: number };
export type ResumoDoEstoque = Record<string, EstoqueDaPeca>;

/** Usuário logado (o contexto não exporta a interface). */
export type UsuarioLogado = ReturnType<typeof useAuth>["user"];

/** O formulário de peça (criar e editar) — ver EMPTY_ITEM_FORM em regras.ts. */
export interface ItemFormData {
  type: string;
  description: string;
  quantity: number;
  visualWidth: string;
  visualHeight: string;
  fileWidth: string;
  fileHeight: string;
  material: string;
  finish: string;
  measurement: string;
  observations: string;
  skipApproval: boolean;
  isPriority: boolean;
  isReuse: boolean;
  referenceUrl: string;
  standardItemId: string;
  kitRemessaId: string;
}

/**
 * O que o PATCH de peça recebe desta tela: o formulário inteiro (com
 * `reuseQty` quando liga o reaproveitamento) ou os campos que a ficha edita,
 * que chegam como estão na peça (texto do decimal, `null` no vazio).
 */
export type DadosDaEdicao = { [K in keyof ItemFormData]?: ItemFormData[K] | string | null } & { reuseQty?: number };

/** Um dos seis marcos do evento, já com a data ajustada ao fim de semana. */
export type Marco = { key: string; label: string; date: Date; adjusted: 'fri' | 'mon' | null; isPast: boolean; isOverdue: boolean };

/** Peças que ficaram para trás — o número que a confirmação de encerrar diz. */
export type TrabalhoAberto = { ativas: number; entregues: number; emProducao: number; abertas: number };
