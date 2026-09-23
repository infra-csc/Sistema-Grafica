// ─────────────────────────────────────────────────────────────────────────────
// TIPOS DAS RESPOSTAS DA API QUE A GRÁFICA LÊ.
//
// A base é o schema (`Item`, `Event`, `StandardItem`, `AuditLog`); em cima
// dela vai só o que o servidor ANEXA na leitura (evento, mãe, complementos,
// remessa do Kit, resumo do tubo) — ver server/routes/itens/leitura.ts
// (enrichItemsWithEventsAndSponsors). Datas chegam como texto ISO (JSON).
// ─────────────────────────────────────────────────────────────────────────────
import type { AuditLog, Event, Item, StandardItem } from "@shared/schema";
import type { RemessaDoKit } from "@shared/kit";

/** Como o JSON entrega um registro do banco: `Date` vira texto ISO. */
export type ComoJson<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K];
};

/** O evento CRU que acompanha a peça (sem enrichEvent): status, datas e prazos. */
export type EventoDaPeca = ComoJson<Event>;

/** Um complemento vivo da peça-mãe (anexado pelo enrich do servidor). */
export type ComplementoResumo = { id: string; displayId: string; quantity: number; status?: string | null };

/** Um volume (tubo ou embalagem avulsa) em que parte da peça está. */
export type VolumeDaPecaApi = { tuboId: string; numero: number; avulso: boolean; quantidade: number };

/** A peça como GET /api/items/approved devolve: a linha do banco + o que o enrich anexa. */
export type PecaDaFila = ComoJson<Item> & {
  event?: EventoDaPeca | null;
  /** Mãe do complemento (só o que a tela lê). */
  parent?: { id?: string; displayId?: string | null } | null;
  complements?: ComplementoResumo[] | null;
  kitRemessa?: Partial<RemessaDoKit> | null;
  // Resumo do tubo em que a peça está (services/tubosDaPeca.ts → comTubo).
  tuboNumero?: number;
  tuboAvulso?: boolean;
  tuboFechadoEm?: string | null;
  tuboEntregueEm?: string | null;
  tuboRecebidoPor?: string | null;
  tuboVolumes?: VolumeDaPecaApi[];
};

/** Resumo de tubo que a fila lê (GET /api/tubos): número por id e o que há dentro. */
export type TuboResumo = {
  id: string; numero: number; avulso?: boolean; eventId: string; entregueEm: string | null; fechadoEm?: string | null;
  /** EMBALAGEM COM QUANTIDADE: o que está em cada volume, e quanto. */
  linhas?: Array<{ itemId: string; quantidade: number; entregue: boolean }>;
};

/** Modelo do catálogo (GET /api/standard-items) — a Gráfica lê nome → grupo. */
export type ModeloDoCatalogo = ComoJson<StandardItem>;

/** Registro do histórico (GET /api/audit-logs?entityType=item&entityId=…). */
export type RegistroDoHistorico = ComoJson<AuditLog>;

/** Estado do painel de tubos aberto a partir da fila. */
export type PainelDeTubos = {
  id: string; name: string;
  /** Peças já marcadas para embalar ao abrir. */
  embalar?: string[];
  /** Veio do "Embalar em lote". */
  lote?: boolean;
  /** Abre direto no formulário de entrega deste tubo. */
  entregarTubo?: string | null;
  /** Abre o modal deste tubo (toque no selo da peça). */
  verTubo?: string | null;
};
