// ─────────────────────────────────────────────────────────────────────────────
// A SPEC DO BOOK — as medidas do exemplar manual, em um lugar só.
//
// Fonte: EcoRun_2026_Palmas_aprovacao_v1 (InDesign, 13 páginas), medido por
// leitura direta do PDF em 25/08 (ver o documento "Anatomia do Book"). O
// GERADOR (book-gerador.ts) e a PRÉVIA em HTML leem DAQUI: se a régua mudar,
// muda nos dois ao mesmo tempo — duas cópias da mesma medida foi o defeito
// que esta base já pagou caro em outros lugares.
//
// O que o exemplar ensina e este módulo prende:
//  · A4 PAISAGEM exato (842×595 pt).
//  · 1 grupo = 1 página; até 6 artes por página.
//  · 1 arte → página inteira · 2 → EMPILHADAS · 3 → 3×1 · 4–6 → grade de 3.
//  · Artes sempre CONTAIN, centradas na célula — nunca corta, nunca estica.
//  · Rodapé assinado: rótulo do grupo em 12 pt a x=215, ~65 pt do fundo, com
//    a barra diagonal antes. (No manual há o logo do evento à esquerda; sem
//    logo cadastrado, o nome do evento em texto pequeno ocupa o lugar.)
//  · Capa clara com a identidade do evento centrada.
// ─────────────────────────────────────────────────────────────────────────────

export const BOOK = {
  /** A4 paisagem, em pontos — medido do exemplar (297×210 mm). */
  LARGURA: 842,
  ALTURA: 595,

  /** O miolo (onde vivem as artes): ~76% da largura, centrado. */
  MIOLO_FRACAO: 0.76,
  MARGEM_TOPO: 40,
  /** Reserva do rodapé — as artes nunca invadem. */
  RODAPE_ALTURA: 75,
  /** Espaço entre células da grade. */
  GAP: 16,

  /** Rodapé, medido: rótulo 12 pt em x=215, baseline a ~65 pt do fundo. */
  RODAPE_ROTULO_X: 215,
  RODAPE_BASELINE_DO_FUNDO: 65,
  RODAPE_ROTULO_PT: 12,
  /** A barra diagonal antes do rótulo (lida do exemplar). */
  BARRA_X: 198,
  /** A identidade à esquerda (logo no manual; nome do evento no fallback). */
  ASSINATURA_X: 60,
  ASSINATURA_PT: 8,

  /** Capa: fundo claro com a identidade centrada (lido do exemplar). */
  CAPA_FUNDO: "#dedddc",
  CAPA_TEXTO: "#1c1917",

  /** Teto de artes por página — acima disso o grupo continua na seguinte. */
  MAX_POR_PAGINA: 6,

  /** Reamostragem das artes: qualidade do exemplar sem estourar e-mail. */
  ARTE_LARGURA_MAX: 1600,
  ARTE_JPEG_QUALIDADE: 0.85,
} as const;

export interface CelulaBook { x: number; y: number; w: number; h: number }

/** O retângulo do miolo (origem no TOPO-esquerda, como HTML). */
export function mioloDoBook(): CelulaBook {
  const w = Math.round(BOOK.LARGURA * BOOK.MIOLO_FRACAO);
  return {
    x: Math.round((BOOK.LARGURA - w) / 2),
    y: BOOK.MARGEM_TOPO,
    w,
    h: BOOK.ALTURA - BOOK.MARGEM_TOPO - BOOK.RODAPE_ALTURA,
  };
}

/**
 * As células de uma página com N artes (1..6), na regra do exemplar:
 * 1 → miolo inteiro · 2 → duas LINHAS (empilhadas, p.4 do exemplar) ·
 * 3 → três colunas · 4–6 → grade de 3 colunas × 2 linhas, preenchida por
 * linha. Origem no topo-esquerda; o gerador converte para a origem do PDF.
 */
export function celulasDaPagina(n: number): CelulaBook[] {
  const m = mioloDoBook();
  const g = BOOK.GAP;
  if (n <= 1) return [m];
  if (n === 2) {
    const h = (m.h - g) / 2;
    return [
      { x: m.x, y: m.y, w: m.w, h },
      { x: m.x, y: m.y + h + g, w: m.w, h },
    ];
  }
  const cols = 3;
  const rows = n <= 3 ? 1 : 2;
  const w = (m.w - g * (cols - 1)) / cols;
  const h = (m.h - g * (rows - 1)) / rows;
  return Array.from({ length: Math.min(n, BOOK.MAX_POR_PAGINA) }, (_, i) => ({
    x: m.x + (i % cols) * (w + g),
    y: m.y + Math.floor(i / cols) * (h + g),
    w,
    h,
  }));
}

/** Contain clássico: o retângulo da arte dentro da célula, centrado. */
export function encaixeContain(cel: CelulaBook, artW: number, artH: number): CelulaBook {
  if (artW <= 0 || artH <= 0) return { ...cel };
  const escala = Math.min(cel.w / artW, cel.h / artH);
  const w = artW * escala;
  const h = artH * escala;
  return { x: cel.x + (cel.w - w) / 2, y: cel.y + (cel.h - h) / 2, w, h };
}

export interface PaginaDoBook { rotulo: string; itens: any[] }

/**
 * Pagina os grupos na regra do exemplar: 1 grupo = 1 página, corte em 6 —
 * o grupo maior continua na página seguinte com o MESMO rótulo (o manual
 * não numera as partes, e a fidelidade manda).
 */
export function paginarGrupos(grupos: Array<{ rotulo: string; itens: any[] }>): PaginaDoBook[] {
  const paginas: PaginaDoBook[] = [];
  for (const gpo of grupos) {
    for (let i = 0; i < gpo.itens.length; i += BOOK.MAX_POR_PAGINA) {
      paginas.push({ rotulo: gpo.rotulo, itens: gpo.itens.slice(i, i + BOOK.MAX_POR_PAGINA) });
    }
  }
  return paginas;
}
