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

/** A aba "KIT" de uma pasta com várias abas: quantas peças tem e se foi ela a lida. */
export interface AbaDoKitDaPlanilha { nome: string; pecas: number; lida: boolean }

/** POST /api/events/:id/preview-xlsx[?para=kit] (multipart, campo `file`). */
export interface PreviaDaPlanilha {
  items: PecaLidaDaPlanilha[];
  ignoradas: LinhaIgnoradaDaPlanilha[];
  fileName: string;
  /** Cabeçalho da planilha do Kit (datas, versão); null quando não é do Kit. */
  kit: CabecalhoDoKit | null;
  /** O nome da aba de onde as peças saíram (null sem nomes de aba). */
  aba?: string | null;
  /** As abas visíveis com peças (ordem da pasta); mais de uma = a tela deixa escolher. */
  abas?: AbaComPecasDaPlanilha[];
  /** A aba do Kit, quando a pasta tem uma com peças. */
  abaDoKit?: AbaDoKitDaPlanilha | null;
}

/** Uma aba com peças: o nome, quantas, se é a do Kit e se foi a lida. */
export interface AbaComPecasDaPlanilha { nome: string; pecas: number; doKit: boolean; lida: boolean }

/** POST /api/events/:id/confirm-import → 201. */
export interface RespostaDaImportacao {
  imported: number;
  items: PecaJson[];
  /** Planilha do Kit: a inclusão do Kit do evento em que as peças entraram (23/10). */
  kitRemessaId?: string;
}

/** POST /api/events/:id/clone-items → 201. */
export interface RespostaDaClonagem {
  cloned: number;
  items: PecaJson[];
  /** Peças da origem que não entraram (recorte do Kit). */
  deixadasDeFora: number;
  /** A clonagem recém-feita, para o "Desfazer" do aviso. null quando a trilha
   *  não conseguiu guardar o lote (aí não há o que oferecer). */
  lote?: ClonagemDesfazivel | null;
}

/**
 * Uma clonagem que ainda pode ser desfeita (shared/desfazer-clonagem.ts):
 * devolvida pela própria clonagem e por GET /api/events/:id/clone-items/desfazivel.
 */
export interface ClonagemDesfazivel {
  /** Id da linha do lote na trilha — é o que o desfazer recebe. */
  id: string;
  origemNome: string;
  /** Quantas peças a clonagem criou. */
  total: number;
  /** Quantas ainda estão em rascunho (as que o desfazer tiraria, se intocadas). */
  emRascunho: number;
  /** Quando clonou e quando a janela fecha (ISO). */
  em: string;
  expiraEm: string;
  /** A clonagem é de quem está vendo (senão é um admin vendo a de outra pessoa). */
  porVoce: boolean;
  porNome: string;
}

/** GET /api/events/:id/clone-items/desfazivel → 200. */
export interface RespostaDaClonagemDesfazivel {
  lote: ClonagemDesfazivel | null;
}

/** POST /api/events/:id/clone-items/desfazer → 200. */
export interface RespostaDoDesfazerClonagem {
  removidas: number;
  /** As que ficaram, cada uma com o motivo (shared/desfazer-clonagem.ts). */
  ficaram: Array<{ id: string; displayId: string | null; motivo: string }>;
  /** Já tinham sido excluídas antes (à mão, pela lixeira). */
  jaExcluidas: number;
  origemNome: string;
}
