// ─────────────────────────────────────────────────────────────────────────────
// OS TIPOS DA TELA DA ARTE — a peça como a API ENTREGA, não como o banco guarda.
//
// As colunas vêm de @shared/schema; o que muda no caminho é o JSON: toda data
// chega como texto ISO. Por cima das colunas, cada rota embute o que a tela lê
// (o evento, os patrocinadores com o status da aprovação, as aprovações da
// Correção). Os campos opcionais são opcionais de verdade: a fila da Correção
// (/api/items/resubmission-needed) não embute `sponsors`, e as filas de status
// não embutem as aprovações.
// ─────────────────────────────────────────────────────────────────────────────
import type { AuditLog, Event, Item, ItemSponsorApproval, Sponsor, StandardItem } from "@shared/schema";
import type { RemessaDoKit } from "@shared/kit";

/** Um registro do banco depois do JSON: `Date` vira texto ISO. */
export type NoJson<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K];
};

/** O evento embutido na peça (e o de /api/events). */
export type EventoDaPeca = NoJson<Event> & {
  /** Peça do Kit: o evento chega com as datas da remessa (shared/kit.ts). */
  datasDoKit?: boolean;
};

/** Patrocinador embutido na peça, com o status CRU da aprovação dele. */
export type PatrocinadorDaPeca = NoJson<Sponsor> & { approvalStatus: string | null };

/** Linha de aprovação da Correção, com o patrocinador embutido. */
export type AprovacaoDaCorrecao = NoJson<ItemSponsorApproval> & { sponsor: NoJson<Sponsor> | null };

export type PecaDaArte = NoJson<Item> & {
  event: EventoDaPeca | null;
  /** Ausente na fila da Correção: aquela rota não embute os vínculos. */
  sponsors?: PatrocinadorDaPeca[];
  kitRemessa?: Partial<RemessaDoKit> | null;
  /** Só na fila da Correção: as linhas reprovadas (awaiting_arte). */
  awaitingArteApprovals?: AprovacaoDaCorrecao[];
  /** Só na fila da Correção: TODAS as linhas de aprovação da peça. */
  aprovacoes?: AprovacaoDaCorrecao[];
  /** Grafia antiga do carimbo de fase, ainda tolerada pela régua da idade. */
  status_changed_at?: string | null;
};

/** A peça como vem de /api/items/resubmission-needed. */
export type PecaDaCorrecao = PecaDaArte & {
  awaitingArteApprovals: AprovacaoDaCorrecao[];
  aprovacoes: AprovacaoDaCorrecao[];
};

/** Modelo do catálogo (/api/standard-items) — a tela lê nome e grupo. */
export type ModeloDoCatalogo = NoJson<StandardItem>;

/** Registro de auditoria da peça aberta (/api/audit-logs?entityType=item). */
export type RegistroDeAuditoria = NoJson<AuditLog>;

/** O que GET /api/artes/sugestao-final devolve (ou null). */
export interface SugestaoDeArquivoFinal {
  finalFileUrl: string;
  finalFileName: string | null;
  displayId: string | null;
  tipo: string;
  descricao: string | null;
  evento: string | null;
  quando: string | null;
}

/** Resposta de POST /api/events/:id/book. */
export interface RespostaDoBook {
  updated: number;
  aviso: { status: string; para?: string[]; reason?: string } | null;
}

/**
 * Um arquivo do envio de thumbs em lote. `ambiguous`: o nome do arquivo tinha
 * mais de um número candidato (ou um que parece ano). O vínculo foi feito, mas
 * pede conferência — ver matchFileToItem em lib/arte-rules.
 */
export type BulkThumbEntry = {
  id: string;
  file: File;
  preview: string;
  matchedItemId: string | null;
  ambiguous?: boolean;
  status: "pending" | "uploading" | "done" | "error";
  errorMsg?: string;
};

/** Onde a arte achada pelo "Buscar arte já feita" vai parar. */
export type DestinoDaArte = "thumb-aprovacao" | "thumb-troca" | "thumb-correcao" | "arquivo-final";
export type BuscaDeArte = { itemId: string; displayId?: string | null; destino: DestinoDaArte };

/** Chip de filtro ativo: carrega o próprio filtro ({kind, id}). */
export type ActiveChip = { kind: string; id?: string; label: string };

/** Opção dos menus de filtro (FilterSelect / EventFilterDropdown). */
export type OpcaoDeFiltro = { value: string; label: string; count: number; dotColor?: string; pinned?: boolean };

/** Uma aba da tela, com a contagem do recorte. */
export type AbaDaArte = { id: string; label: string; count: number; testId: string };

/**
 * Os gestos da LINHA da fila (tabela e cartão). O objeto é ESTÁVEL durante a
 * vida da tela — ver `acoesDaLinha` na página — para a linha memoizada não
 * redesenhar quando nada dela mudou.
 */
export interface AcoesDaLinha {
  verDetalhes: (item: PecaDaArte) => void;
  alternarSelecao: (itemId: string) => void;
  enviarDireto: (item: PecaDaArte) => void;
  exportarProva: (item: PecaDaArte) => void;
  dispensar: (item: PecaDaArte) => void;
  devolver: (item: PecaDaArte) => void;
}
