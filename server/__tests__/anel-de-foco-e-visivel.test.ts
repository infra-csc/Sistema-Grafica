// ─────────────────────────────────────────────────────────────────────────────
// O ANEL DE FOCO É VISÍVEL DE VERDADE.
//
// O defeito que este arquivo existe para impedir, contado uma vez:
//
// O app tem uma regra global de `:focus-visible` — isso estava certo, e o anel
// aparece de fato ao navegar por Tab (conferi no navegador). O problema era a
// COR: `--orange-brand` (#f97316).
//
// Indicador de foco é informação visual que identifica um estado de componente,
// então a WCAG 1.4.11 cobra 3:1 contra o fundo adjacente. Esse laranja não
// chega lá em nenhum dos fundos do app:
//
//   sobre #ffffff ... 2,80
//   sobre #fafaf9 ... 2,68
//   sobre #f5f5f4 ... 2,57
//
// É o mesmo motivo pelo qual a régua da casa já proíbe esse laranja como cor de
// texto — só que aqui ele estava justamente no anel que serve quem navega por
// teclado e precisa enxergar onde está.
//
// UM ERRO DE MEDIÇÃO QUE QUASE VIROU RELATÓRIO: antes disto eu varri a tela
// chamando `el.focus()` por script e conclui que 12 de 18 elementos não tinham
// anel nenhum. Era falso. `:focus-visible` só casa quando o navegador julga que
// o foco veio do TECLADO; foco programático casa `:focus` e mais nada. Ao
// repetir com Tab de verdade, o anel estava lá em todos. Ferramenta errada
// inventa defeito — e defeito inventado custa mais caro que defeito não achado.
//
// A regra que fica: estado de interação se testa com a interação, não com a API
// que tem o mesmo nome.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const css = readFileSync(path.resolve(__dirname, "../../client/src/index.css"), "utf8");

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

/** Fundos que o app usa atrás de elementos focáveis. */
const FUNDOS = ["#ffffff", "#fafaf9", "#f5f5f4"];
/** WCAG 1.4.11 — contraste de conteúdo não textual. */
const MIN_NAO_TEXTO = 3;

describe("o anel de foco global", () => {
  it("existe uma regra de :focus-visible", () => {
    expect(css).toContain(":focus-visible {");
  });

  it("o anel usa o laranja profundo, não o da marca", () => {
    const i = css.indexOf(":focus-visible {");
    const regra = css.slice(i, css.indexOf("}", i));
    expect(regra).toContain("var(--orange-deep)");
    expect(regra).not.toContain("var(--orange-brand)");
  });

  it("a cor do anel passa 3:1 em todos os fundos do app", () => {
    for (const fundo of FUNDOS) {
      expect(contraste("#ea580c", fundo)).toBeGreaterThanOrEqual(MIN_NAO_TEXTO);
    }
  });

  it("o laranja da marca de fato reprovava — a troca não foi estética", () => {
    for (const fundo of FUNDOS) {
      expect(contraste("#f97316", fundo)).toBeLessThan(MIN_NAO_TEXTO);
    }
  });

  it("o foco por mouse continua sem anel", () => {
    // `:focus:not(:focus-visible) { outline: none }` é o que impede o anel de
    // aparecer no clique. Perder isso encheria a tela de anéis a cada clique.
    expect(css).toContain(":focus:not(:focus-visible)");
  });
});
