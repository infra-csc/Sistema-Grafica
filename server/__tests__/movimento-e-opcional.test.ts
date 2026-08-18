// ─────────────────────────────────────────────────────────────────────────────
// MOVIMENTO É OPCIONAL, E COR DE HOVER TEM DE SER LEGÍVEL.
//
// Dois defeitos que este arquivo existe para impedir:
//
// 1. O app não tinha NENHUMA regra de `prefers-reduced-motion`. O Painel Geral
//    move cada linha da tabela (translateY no hover) numa lista que pode ter
//    milhares — exatamente o gesto que quem tem sensibilidade vestibular já
//    pediu ao sistema operacional para desligar.
//
// 2. `.pg-sortable:hover` usava #fdba74, escolhido quando o cabeçalho da tabela
//    era ESCURO. Ao clarear o thead para #fafaf9 numa passada anterior, a cor
//    não foi revisada: virou 1,61:1 e o hover de ordenação ficou praticamente
//    invisível. Trocado por #c2410c, que dá 4,96:1.
//
// A regra que fica: mudar o FUNDO de um componente obriga a recalcular todas as
// cores que vivem sobre ele, inclusive as de estado (hover, foco, ativo) — são
// as que passam despercebidas porque não aparecem numa captura de tela parada.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const css = readFileSync(path.resolve(__dirname, "../../client/src/index.css"), "utf8");
const painel = readFileSync(path.resolve(__dirname, "../../client/src/pages/painel-geral.tsx"), "utf8");

/** Contraste WCAG entre duas cores hex. */
function contraste(a: string, b: string): number {
  const lum = (h: string) => {
    const c = [1, 3, 5]
      .map(i => parseInt(h.slice(i, i + 2), 16) / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("o app respeita prefers-reduced-motion", () => {
  it("existe a regra global", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("zera transição, animação e rolagem suave", () => {
    const bloco = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(bloco).toContain("transition-duration: 0.01ms !important");
    expect(bloco).toContain("animation-duration: 0.01ms !important");
    expect(bloco).toContain("scroll-behavior: auto !important");
  });

  it("usa 0.01ms e não `none`, para não matar o transitionend", () => {
    const bloco = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(bloco).not.toMatch(/transition:\s*none/);
  });
});

describe("o hover de ordenação é legível sobre o cabeçalho claro", () => {
  const FUNDO_THEAD = "#fafaf9";

  it("a cor do hover passa AA sobre o fundo do cabeçalho", () => {
    const cor = painel.match(/\.pg-sortable:hover \{ color: (#[0-9a-f]{6}); \}/i)?.[1];
    expect(cor).toBeTruthy();
    expect(contraste(cor!, FUNDO_THEAD)).toBeGreaterThanOrEqual(4.5);
  });

  it("a cor antiga, feita para cabeçalho escuro, não voltou", () => {
    // Olha a REGRA, não o arquivo: o comentário que documenta o defeito cita
    // #fdba74 de propósito, e proibir a menção apagaria a explicação.
    const regras = painel.match(/.pg-sortable:hover {[^}]*}/g) ?? [];
    expect(regras.length).toBe(1);
    expect(regras[0]).not.toContain("#fdba74");
  });
});
