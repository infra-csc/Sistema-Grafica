// ─────────────────────────────────────────────────────────────────────────────
// A TELA NÃO TEM DOIS TOKENS PARA O MESMO TRABALHO.
//
// O que este arquivo trava, e por quê:
//
// O inventário do Painel Geral encontrou 49 cores distintas numa tela só, e
// entre elas DOIS cinzas de texto — #746e69 (31 usos) e #78716c (18 usos) —
// separados por 6 unidades de distância euclidiana. Lado a lado são o mesmo
// cinza; a diferença não é uma decisão, é um acidente que se acumulou.
//
// E não era só redundância. Sobre o #f5f5f4 da faixa de tipo:
//
//   #78716c ... 4,40:1  → REPROVA AA
//   #746e69 ... 4,61:1  → passa
//
// Pior: o comentário que eu mesmo havia escrito ali afirmava "#78716c sobre
// #f5f5f4 = 4,7:1 ✓". O número estava errado, e o visto de aprovação era falso.
// Consolidar no cinza que passa corrige o contraste E remove o token duplicado,
// sem custo visual — porque os dois são indistinguíveis.
//
// A regra que fica: token duplicado não é só desordem. Quando dois valores
// quase iguais convivem, um deles acaba usado num fundo onde falha, e ninguém
// percebe porque "é a mesma cor de sempre". E contraste declarado em comentário
// tem de ser CALCULADO, nunca estimado de cabeça.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const painel = readFileSync(path.resolve(__dirname, "../../client/src/pages/painel-geral.tsx"), "utf8");

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

describe("um cinza de texto só", () => {
  it("nenhuma cor de texto usa o cinza que reprova", () => {
    expect(painel).not.toContain('color: "#78716c"');
  });

  it("o cinza escolhido passa AA sobre todos os fundos da tela", () => {
    // #ffffff (linha zebrada par), #fafaf9 (fundo da página e do thead),
    // #f5f5f4 (faixa de tipo) — os três fundos claros que a tela usa atrás de
    // texto secundário.
    for (const fundo of ["#ffffff", "#fafaf9", "#f5f5f4"]) {
      expect(contraste("#746e69", fundo)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("o cinza descartado de fato falhava — a troca não foi estética", () => {
    expect(contraste("#78716c", "#f5f5f4")).toBeLessThan(4.5);
  });
});

describe("o contraste declarado bate com o calculado", () => {
  it("a faixa de tipo declara o número certo", () => {
    // O comentário anterior dizia 4,7:1 para um par que dá 4,40. Se alguém
    // reescrever o valor, este teste força o cálculo em vez do chute.
    const i = painel.indexOf("#746e69 sobre #f5f5f4");
    expect(i).toBeGreaterThan(-1);
    const declarado = painel.slice(i, i + 60).match(/=\s*([\d,]+):1/)?.[1]?.replace(",", ".");
    expect(Number(declarado)).toBeCloseTo(contraste("#746e69", "#f5f5f4"), 1);
  });
});
