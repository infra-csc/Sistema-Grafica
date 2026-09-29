// ─────────────────────────────────────────────────────────────────────────────
// O VOCABULÁRIO VISUAL DO ATENDIMENTO — o que a lista, o modal e o histórico
// dividem, num lugar só.
//
// Antes cada pedaço escrevia o seu "rótulo de seção" (11px, 700, 0.08em), o seu
// piso de letra no celular e o seu rodapé de confirmação — com pequenas
// diferenças que, somadas, faziam o modal parecer montado por três mãos.
// ─────────────────────────────────────────────────────────────────────────────
import type { CSSProperties } from "react";
import { FONT, FS, FW, R, T } from "@/lib/theme";

/**
 * PISO DE 12px NO TOQUE. A régua da Revisão Final (`letra`), da Arte
 * (`fsToque`) e da Gráfica (`fsMin`): rótulos de 10–11px lidos a um braço de
 * distância, no celular ou no tablet do galpão, somem. No desktop a densidade
 * continua a de sempre.
 */
export const letra = (n: number, toque: boolean) => (toque ? Math.max(12, n) : n);

/** Rótulo de SEÇÃO (Especificações, Decisão, Arquivos…): um desenho só. */
export function rotuloDeSecao(toque: boolean): CSSProperties {
  return {
    margin: 0, fontSize: letra(FS.small, toque), fontWeight: FW.rotulo,
    letterSpacing: "0.08em", textTransform: "uppercase", color: T.second,
  };
}

/** O código da peça: mono, cinza, alinhado em coluna — em todo lugar. */
export function codigoDaPeca(toque: boolean, tamanho: number = FS.meta): CSSProperties {
  return {
    fontFamily: FONT.mono, fontSize: letra(tamanho, toque), fontWeight: FW.forte,
    color: T.second, fontVariantNumeric: "tabular-nums", flexShrink: 0, whiteSpace: "nowrap",
  };
}

/** Superfície de lista: papel branco, hairline, raio de card — sem sombra. */
export const SUPERFICIE: CSSProperties = {
  backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden",
};
