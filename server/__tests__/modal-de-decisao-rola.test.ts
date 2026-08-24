// ─────────────────────────────────────────────────────────────────────────────
// O MODAL DE DECISÃO PRECISA ROLAR — relatado em 24/08/2026: "na tela do
// atendimento, quando temos muitos patrocinadores, o modal não está descendo;
// meio que o scroll não funciona".
//
// A cadeia tinha três elos e o do meio estava solto:
//
//   DialogContent   →  flex column, max-h-[92vh], overflow-hidden   ✔
//   .review-modal-body  →  flex:1, grid de duas colunas, overflow:hidden
//                          …sem min-height:0                        ✘
//   coluna da decisão   →  flex column; dentro, scrollport com
//                          flex:1 1 auto + min-height:0 + overflow:auto  ✔
//
// `min-height` vale `auto` por padrão em item de flex e de grid, e `auto`
// PROÍBE encolher abaixo do conteúdo. Com trinta patrocinadores, a coluna
// crescia além do modal; o scrollport interno, que já estava certo, nunca
// ficava menor que o conteúdo e portanto nunca rolava; e o `overflow: hidden`
// do corpo cortava o excesso — junto com o rodapé dos botões. Sem barra e sem
// botões: exatamente "não desce".
//
// No celular era pior: abaixo de 900px as duas colunas viram duas LINHAS
// dentro do mesmo `overflow: hidden`, e a segunda — a das decisões — ficava
// inteira fora de alcance.
//
// Este arquivo fixa os dois lados: a regra de CSS que devolve o encolhimento,
// e a estrutura do TSX que a regra pressupõe.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const CSS = ler("client/src/index.css");
const ATEND = ler("client/src/pages/atendimento.tsx");

/** O bloco de uma regra CSS, pelo seletor. */
function regra(css: string, seletor: string): string {
  const i = css.indexOf(seletor + " {");
  if (i < 0) return "";
  return css.slice(i, css.indexOf("}", i));
}

describe("a cadeia de rolagem do modal de decisão", () => {
  it("o corpo pode encolher — senão o overflow:hidden dele vira uma tesoura", () => {
    const corpo = regra(CSS, ".review-modal-body");
    expect(corpo).toContain("overflow: hidden");
    expect(corpo).toContain("min-height: 0");
  });

  it("as DUAS colunas podem encolher — é o elo que faltava", () => {
    const filhos = regra(CSS, ".review-modal-body > *");
    expect(filhos).toContain("min-height: 0");
  });

  it("a coluna da decisão continua com scrollport próprio e rodapé fixo", () => {
    // A estrutura que a regra de CSS pressupõe. Se alguém trocar o scrollport
    // por um contêiner sem min-height, o CSS acima não salva.
    expect(ATEND).toContain('<div style={{ padding: 24, overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>');
    expect(ATEND).toContain("borderTop: '1px solid #f1f0ef',");
    expect(ATEND).toContain("flexShrink: 0,");
  });

  it("no celular quem rola é o corpo inteiro, e as colunas param de competir", () => {
    const i = CSS.indexOf("@media (max-width: 900px)");
    const bloco = CSS.slice(i, i + 900);
    expect(bloco).toContain("grid-template-columns: 1fr;");
    expect(bloco).toContain("overflow-y: auto;");
    // as colunas empilhadas fluem: duas áreas roláveis em sequência dentro de
    // um contêiner que não rola deixavam a segunda inalcançável.
    expect(bloco).toContain(".review-modal-body > * > *");
    expect(bloco).toContain("overflow: visible !important;");
    expect(bloco).toContain("min-height: auto;");
  });

  it("o modal segue com teto de altura — a rolagem só existe porque há teto", () => {
    expect(ATEND).toContain("max-h-[92vh]");
    expect(ATEND).toContain("overflow-hidden flex flex-col");
  });
});
