// Os tipos da ENTRADA RÁPIDA (grade de lançamento de peças em lote).

export interface BulkItemRow {
  id: string;
  type: string;
  description: string;
  quantity: string;
  visualWidth: string;
  visualHeight: string;
  fileWidth: string;
  fileHeight: string;
  material: string;
  finish: string;
  measurement: string;
  observations: string;
  calculatedM2: number;
  sponsorId: string;
  isReuse: boolean;
  /** Fura a fila da Arte (dono, 27/08) — só admin|solicitacao (podePriorizar). */
  isPriority: boolean;
  /** O modelo de que a linha nasceu — gravado na peça para o catálogo contar o uso. */
  standardItemId: string;
}

export interface StandardItem {
  id: string;
  name: string;
  type: string;
  group?: string | null;
  area: number;
  visual: number;
  visualWidth?: number | null;
  visualHeight?: number | null;
  fileWidth?: number | null;
  fileHeight?: number | null;
  material?: string | null;
  finish?: string | null;
}

export interface Sponsor {
  id: string;
  name: string;
  company?: string | null;
}

export interface ExistingItem {
  id: string;
  displayId: string;
  type: string;
  quantity: number;
  description?: string | null;
  visualWidth?: string | number | null;
  visualHeight?: string | number | null;
  fileWidth?: string | number | null;
  fileHeight?: string | number | null;
  material?: string | null;
  finish?: string | null;
  status: string;
}

/** A peça que uma linha completa vira no envio — o que `onSubmit` recebe. */
export interface PecaDoLote {
  eventId: string;
  type: string;
  description: string;
  quantity: number;
  area: number;
  visual: number;
  visualWidth: string;
  visualHeight: string;
  fileWidth: string;
  fileHeight: string;
  material: string;
  finish: string;
  measurement: string;
  observations: string;
  calculatedM2: number;
  isReuse: boolean;
  isPriority: boolean;
  standardItemId: string | null;
}

/** Uma repetição achada antes de gravar: dentro do lote ou contra o evento. */
export interface DuplicataDoLote {
  newItem: PecaDoLote;
  existingItem: ExistingItem;
}

/** O que a revisão do lote mostra: o que será criado e o que repete. */
export interface ConfirmacaoDoLote {
  valid: PecaDoLote[];
  duplicates: DuplicataDoLote[];
}
