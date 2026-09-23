// ─────────────────────────────────────────────────────────────────────────────
// A METRAGEM NUNCA MAIS CORTA NA ARTE.
//
// O defeito que este arquivo existia para impedir: a coluna "M²" apertada
// cortava a metragem em "11....", "12....". Desde 22/09 (dono: "a tela está
// bem poluída — apenas o que eles REALMENTE usam") Dimensões, M² e Material
// deixaram de ser colunas e viraram a linha secundária da coluna "Peça"
// (MetaDaPeca, em components/arte/celulas-da-peca.tsx), que QUEBRA em vez de
// cortar. O que se guarda agora:
//   · não existe mais coluna de M² para voltar a ser apertada;
//   · a metragem continua à vista, com a unidade escrita;
//   · o mínimo da tabela continua derivado das colunas.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { lerDaRaiz } from "./fonte-das-telas-da-arte";

// A tela da Arte foi dividida: as colunas moram em colunas.ts e a linha
// secundária da peça em celulas-da-peca.tsx.
const colunas = lerDaRaiz("client/src/components/arte/colunas.ts");
const celulas = lerDaRaiz("client/src/components/arte/celulas-da-peca.tsx");

describe("Arte: a metragem corre em texto, sem coluna para cortá-la", () => {
  it("M², Dimensões e Material não são mais colunas", () => {
    expect(colunas).toContain("const ARTE_COLS: ArteCol[] = [");
    const bloco = colunas.slice(colunas.indexOf("const ARTE_COLS: ArteCol[] = ["), colunas.indexOf("\n];", colunas.indexOf("const ARTE_COLS: ArteCol[] = [")));
    for (const c of ["M²", "Dimensões", "Material"]) expect(bloco).not.toContain(`{ label: '${c}'`);
  });

  it("a metragem continua à vista na linha da peça, com a unidade e sem reticência", () => {
    // MetaDaPeca é a última função do arquivo das células.
    expect(celulas).toContain("export function MetaDaPeca(");
    const meta = celulas.slice(celulas.indexOf("export function MetaDaPeca("));
    expect(meta).toContain("{item.calculatedM2} m²");
    expect(meta).toContain("flexWrap: 'wrap'");
    expect(meta).not.toContain("textOverflow: 'ellipsis'");
  });
});

describe("Arte: o mínimo da tabela continua derivado", () => {
  it("a soma vem das colunas, e não de um número escrito à mão", () => {
    expect(colunas).toContain("const arteColsWidth = (cols: ArteCol[]) => ARTE_PECA_MIN_WIDTH");
    expect(colunas).toMatch(/cols\.reduce\(\(sum, c\) => sum \+ \(typeof c\.w === 'number' \? c\.w : 0\), 0\)/);
  });
});
