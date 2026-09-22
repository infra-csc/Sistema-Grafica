// ─────────────────────────────────────────────────────────────────────────────
// A METRAGEM NUNCA MAIS CORTA NA ARTE.
//
// O defeito que este arquivo existia para impedir: a coluna "M²" apertada
// cortava a metragem em "11....", "12....". Desde 22/09 (dono: "a tela está
// bem poluída — apenas o que eles REALMENTE usam") Dimensões, M² e Material
// deixaram de ser colunas e viraram a linha secundária da coluna "Peça"
// (renderMetaDaPeca), que QUEBRA em vez de cortar. O que se guarda agora:
//   · não existe mais coluna de M² para voltar a ser apertada;
//   · a metragem continua à vista, com a unidade escrita;
//   · o mínimo da tabela continua derivado das colunas.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const arte = readFileSync(path.resolve(__dirname, "../../client/src/pages/arte.tsx"), "utf8");

describe("Arte: a metragem corre em texto, sem coluna para cortá-la", () => {
  it("M², Dimensões e Material não são mais colunas", () => {
    const bloco = arte.slice(arte.indexOf("const ARTE_COLS: ArteCol[] = ["), arte.indexOf("\n];", arte.indexOf("const ARTE_COLS: ArteCol[] = [")));
    for (const c of ["M²", "Dimensões", "Material"]) expect(bloco).not.toContain(`{ label: '${c}'`);
  });

  it("a metragem continua à vista na linha da peça, com a unidade e sem reticência", () => {
    const meta = arte.slice(arte.indexOf("const renderMetaDaPeca"), arte.indexOf("const renderRow"));
    expect(meta).toContain("{item.calculatedM2} m²");
    expect(meta).toContain("flexWrap: 'wrap'");
    expect(meta).not.toContain("textOverflow: 'ellipsis'");
  });
});

describe("Arte: o mínimo da tabela continua derivado", () => {
  it("a soma vem das colunas, e não de um número escrito à mão", () => {
    expect(arte).toContain("const arteColsWidth = (cols: ArteCol[]) => ARTE_PECA_MIN_WIDTH");
    expect(arte).toMatch(/cols\.reduce\(\(sum, c\) => sum \+ \(typeof c\.w === 'number' \? c\.w : 0\), 0\)/);
  });
});
