// ─────────────────────────────────────────────────────────────────────────────
// A TABELA DA REVISÃO NÃO EMPURRA O BOTÃO PARA FORA (dono, 11/09: "cortando o
// botão").
//
// Duas causas somadas cortavam o "Revisar" na borda direita do card:
//
//   1. COLUNAS FANTASMA. A tabela foi enxugada de sete colunas de dados para
//      quatro (o comentário "DE SETE COLUNAS PARA QUATRO" registra o corte),
//      mas as linhas de grupo seguiram declarando colSpan 7 e 8. Numa tabela
//      de 5 colunas reais, o navegador cria colunas vazias para acomodar o
//      excesso e redistribui a largura entre elas.
//
//   2. A FAIXA DO EVENTO NÃO QUEBRAVA. Nome e chips de prazo ficavam lado a
//      lado num flex sem wrap, com os chips em nowrap. Numa célula de tabela
//      isso vira LARGURA MÍNIMA — e a largura mínima de uma célula com colSpan
//      alarga a tabela inteira, todas as linhas junto.
//
// A rolagem horizontal existia (overflowX: auto), mas a barra fica no PÉ da
// tabela, dezenas de linhas abaixo: quem olhava via só o botão decepado.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const TELA = readFileSync(path.resolve(__dirname, "../../client/src/pages/solicitacao.tsx"), "utf8");

/** Colunas reais: o checkbox do cabeçalho + as colunas de dados declaradas. */
function colunasReais(): number {
  const inicio = TELA.indexOf("<thead>");
  const fim = TELA.indexOf("</thead>", inicio);
  const cabecalho = TELA.slice(inicio, fim);
  const colunasDeDados = (cabecalho.match(/\{ label: "/g) ?? []).length;
  return 1 + colunasDeDados; // + o checkbox de selecionar todos
}

describe("nenhuma linha declara mais colunas do que a tabela tem", () => {
  it("a tabela tem 5 colunas: checkbox + Peça, Qtd·Dim·m², Arquivo final, Ações", () => {
    expect(colunasReais()).toBe(5);
  });

  it("todo colSpan cabe na tabela — nada de coluna fantasma", () => {
    const total = colunasReais();
    const spans = [...TELA.matchAll(/colSpan=\{(\d+)\}/g)].map((m) => Number(m[1]));
    expect(spans.length).toBeGreaterThan(0);
    for (const n of spans) {
      expect(n, `colSpan={${n}} numa tabela de ${total} colunas`).toBeLessThanOrEqual(total);
    }
  });

  it("a faixa do evento ocupa exatamente o que sobra depois do checkbox", () => {
    expect(TELA).toContain('<td colSpan={4} style={{ padding: "10px 16px" }}>');
  });

  it("os subgrupos ocupam a linha inteira", () => {
    expect(TELA).toContain(`<td colSpan={5} style={{ padding: '5px 16px' }}>`);
    expect(TELA).not.toContain("colSpan={7}");
    expect(TELA).not.toContain("colSpan={8}");
  });
});

describe("a faixa do evento quebra linha em vez de alargar a tabela", () => {
  it("nome e chips descem de linha quando não cabem lado a lado", () => {
    expect(TELA).toContain('justifyContent: "space-between", flexWrap: "wrap", gap: "8px 16px"');
  });

  it("o bloco dos chips pode encolher (minWidth: 0) e quebrar", () => {
    expect(TELA).toContain('flexWrap: "wrap", alignItems: "center", minWidth: 0 }}>');
  });
});
