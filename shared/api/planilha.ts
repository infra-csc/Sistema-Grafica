// ─────────────────────────────────────────────────────────────────────────────
// CONTRATOS DA IMPORTAÇÃO POR PLANILHA E DA CLONAGEM.
//
// Fonte: server/services/xlsxImport.ts (PecaLida, handlePreviewXlsx,
// handleConfirmImport) e server/routes/itens/criacao.ts (clone-items).
// ─────────────────────────────────────────────────────────────────────────────
import type { CabecalhoDoKit } from "../kit";
import type { PecaJson } from "./itens";

/** Uma peça lida da planilha (PecaLida em xlsxImport.ts). */
export interface PecaLidaDaPlanilha {
  type: string;
  description: string;
  quantity: number;
  visualWidth: number | null;
  visualHeight: number | null;
  fileWidth: number | null;
  fileHeight: number | null;
  calculatedM2: number;
  material: string;
  finish: string;
  measurement: string;
  observations: string;
  suggestedSponsorIds: string[];
  /** Só quando a planilha DIZ que a peça é reaproveitamento total ("Sim"). */
  reuse?: boolean;
  /** A linha da planilha (a numeração que o Excel mostra). */
  linha?: number;
  /** Repete uma linha anterior da MESMA planilha. */
  repeteLinha?: number;
}

/** Linha com cara de peça que ficou fora da leitura, e por quê. */
export interface LinhaIgnoradaDaPlanilha { linha: number; motivo: string }

/** POST /api/events/:id/preview-xlsx (multipart, campo `file`). */
export interface PreviaDaPlanilha {
  items: PecaLidaDaPlanilha[];
  ignoradas: LinhaIgnoradaDaPlanilha[];
  fileName: string;
  /** Cabeçalho da planilha do Kit (datas, versão); null quando não é do Kit. */
  kit: CabecalhoDoKit | null;
}

/** POST /api/events/:id/confirm-import → 201. */
export interface RespostaDaImportacao {
  imported: number;
  items: PecaJson[];
  /** Presente quando a importação criou uma remessa do Kit nova. */
  kitRemessaId?: string;
}

/** POST /api/events/:id/clone-items → 201. */
export interface RespostaDaClonagem {
  cloned: number;
  items: PecaJson[];
  /** Peças da origem que não entraram (recorte do Kit). */
  deixadasDeFora: number;
}
