// ─────────────────────────────────────────────────────────────────────────────
// A TABELA DA DOC DOS ESTADOS DA PEÇA NÃO ENVELHECE.
//
// A seção gerada de docs/estados-da-peca.md vem de shared/maquina-de-estados.ts.
// Se alguém muda a tabela e não roda `npx tsx scripts/gerar-doc-estados-da-peca.ts`,
// este teste quebra — a doc que descreve uma máquina que não existe mais é
// pior do que doc nenhuma.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { secaoGeradaDosEstados, secaoGeradaNoTexto, aplicarSecaoGerada } from "@shared/maquina-de-estados-doc";
import { TRANSICOES } from "@shared/maquina-de-estados";

const DOC = readFileSync(path.resolve(__dirname, "../../docs/estados-da-peca.md"), "utf8");

describe("docs/estados-da-peca.md", () => {
  it("a seção gerada é exatamente o que a tabela gera (rode scripts/gerar-doc-estados-da-peca.ts se quebrar)", () => {
    expect(secaoGeradaNoTexto(DOC)).toBe(secaoGeradaDosEstados());
  });

  it("regerar não mexe no texto escrito à mão em volta", () => {
    expect(aplicarSecaoGerada(DOC)).toBe(DOC);
    expect(DOC).toContain("## As regras que a tabela não cabe");
    expect(DOC).toContain("## Divergências encontradas ao montar este documento");
  });

  it("lista toda ação da tabela", () => {
    const secao = secaoGeradaDosEstados();
    for (const t of TRANSICOES) expect(secao).toContain(`| ${t.acao} |`);
  });
});
