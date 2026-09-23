// Os tipos da IMPORTAÇÃO DE PLANILHA (preview editável antes de importar).

/**
 * Uma linha do preview: a peça que o servidor leu (PecaLida, em
 * server/services/xlsxImport.ts) com o `_id` e os patrocinadores sugeridos
 * que o cliente acrescenta. Depois de editada na tabela, número vira texto —
 * por isso as medidas aceitam as duas formas.
 */
export interface LinhaDaImportacao {
  _id: string;
  type?: string | null;
  description?: string | null;
  quantity?: number | string | null;
  visualWidth?: number | string | null;
  visualHeight?: number | string | null;
  fileWidth?: number | string | null;
  fileHeight?: number | string | null;
  calculatedM2?: number | string | null;
  material?: string | null;
  finish?: string | null;
  measurement?: string | null;
  observations?: string | null;
  suggestedSponsorIds?: string[] | null;
  /** Reaproveitamento total — marcado pela planilha ou pelo botão da linha. */
  reuse?: boolean | null;
  /** A linha da planilha (a numeração que o Excel mostra). */
  linha?: number | null;
  repeteLinha?: number | null;
}

/** Os campos que a célula da tabela deixa editar. */
export type CampoDaLinha =
  | "description" | "quantity" | "material" | "finish" | "observations"
  | "fileWidth" | "fileHeight" | "visualWidth" | "visualHeight";

/** Patrocinador do evento, com a cota que dá a cor do chip. */
export interface PatrocinadorDoEvento {
  sponsorId: string;
  quota: string;
  name: string;
}
