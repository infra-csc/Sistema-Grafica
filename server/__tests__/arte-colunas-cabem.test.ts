// ─────────────────────────────────────────────────────────────────────────────
// A COLUNA DE M² CABE O MAIOR VALOR REAL DA BASE.
//
// O defeito que este arquivo existe para impedir, contado uma vez:
//
// A metragem aparecia como "11....", "12....", "19...." em TODAS as abas da
// Arte — Finalizados inclusive, porque ARTE_COLS_FINALIZADOS não sobrescreve
// esta coluna. A causa foi eu ter apertado M² de 72 para 60 numa passada de
// orçamento de colunas, contra uma medição que uma rodada ANTERIOR já tinha
// feito e deixado registrada no próprio arquivo.
//
// A conta, medida em canvas com Space Grotesk 600 13px sobre os 3.187 itens de
// produção: os maiores valores ("86.40", "44.46", "40.09") pedem 36px. Com
// `w: 60` e padding de 12+12, sobravam exatamente 36 úteis. Empate não cabe —
// a elipse dispara no primeiro subpixel.
//
// A regra que fica: largura de coluna numérica se mede contra o MAIOR valor da
// base, com folga, e não contra o valor que estava na tela naquele dia.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const arte = readFileSync(path.resolve(__dirname, "../../client/src/pages/arte.tsx"), "utf8");

/** 12px de cada lado, como todas as células da tabela da Arte. */
const PADDING_CELULA = 24;
/** Maior valor de m² da base, em Space Grotesk 600 13px. Medido, não estimado. */
const PIOR_CASO_M2 = 36;

describe("Arte: a coluna de M² cabe a metragem", () => {
  const largura = Number(arte.match(/\{ label: 'M²',\s+w: (\d+),/)?.[1]);

  it("a coluna declara uma largura numérica", () => {
    expect(Number.isFinite(largura)).toBe(true);
  });

  it("sobra espaço útil para o maior valor da base, com folga", () => {
    const uteis = largura - PADDING_CELULA;
    // Folga real, não empate: 60 dava 36 úteis para 36 necessários e cortava.
    expect(uteis).toBeGreaterThan(PIOR_CASO_M2);
    expect(uteis).toBeGreaterThanOrEqual(PIOR_CASO_M2 + 8);
  });

  it("a aba Finalizados herda a mesma largura", () => {
    // Se algum dia ela passar a sobrescrever M², este teste tem de ser revisto:
    // hoje a herança é o que garante que a correção vale para as cinco abas.
    const bloco = arte.slice(arte.indexOf("ARTE_COLS_FINALIZADOS: ArteCol[]"), arte.indexOf("const colunasDaAba"));
    expect(bloco).not.toContain("'M²'");
  });
});

describe("Arte: o mínimo da tabela continua derivado", () => {
  it("a soma vem das colunas, e não de um número escrito à mão", () => {
    // Um total hardcoded foi o que fez as larguras divergirem antes; alargar
    // uma coluna tem de propagar sozinho.
    expect(arte).toContain("const arteColsWidth = (cols: ArteCol[]) => ARTE_PECA_MIN_WIDTH");
    expect(arte).toMatch(/cols\.reduce\(\(sum, c\) => sum \+ \(typeof c\.w === 'number' \? c\.w : 0\), 0\)/);
  });
});
