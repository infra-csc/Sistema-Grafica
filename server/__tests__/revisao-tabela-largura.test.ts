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
import { fonteDaRevisao } from "./fonte-das-telas-da-arte";

// A tela foi dividida: o <thead> mora em components/revisao/tabela-da-revisao.tsx,
// as faixas com colSpan em cabecalho-do-evento e linha-da-peca, e a régua na página.
// Lê-se a tela inteira (só existe um <thead> nela).
const TELA = fonteDaRevisao();

/** Colunas reais: o checkbox do cabeçalho + as colunas de dados declaradas. */
function colunasReais(): number {
  const inicio = TELA.indexOf("<thead>");
  const fim = TELA.indexOf("</thead>", inicio);
  const cabecalho = TELA.slice(inicio, fim);
  const colunasDeDados = (cabecalho.match(/\{ label: "/g) ?? []).length;
  return 1 + colunasDeDados; // + o checkbox de selecionar todos
}

// Desde a régua de densidade (820/1180 de área útil) a tabela tem DUAS
// larguras: inteira (4 colunas de dados) e compacta (3 — a medida funde na
// célula da Peça). O colSpan deixou de ser número e passou a sair da MESMA
// conta que decide quantas colunas o <thead> desenha.
describe("nenhuma linha declara mais colunas do que a tabela tem", () => {
  it("a tabela tem 5 colunas: checkbox + Peça, Qtd·Dim·m², Arquivo final, Ações", () => {
    expect(colunasReais()).toBe(5);
  });

  it("todo colSpan cabe na tabela — nada de coluna fantasma", () => {
    const total = colunasReais();
    const numericos = [...TELA.matchAll(/colSpan=\{(\d+)\}/g)].map((m) => Number(m[1]));
    for (const n of numericos) {
      expect(n, `colSpan={${n}} numa tabela de ${total} colunas`).toBeLessThanOrEqual(total);
    }
    const spans = [...TELA.matchAll(/colSpan=\{([^}]+)\}/g)].map((m) => m[1]);
    expect(spans.length).toBeGreaterThan(0);
    for (const e of spans) expect(["colunasDeDados", "colunasDeDados + 1"]).toContain(e);
    // A conta: quatro colunas de dados, três no compacto — e o thead some com
    // a MESMA coluna que a linha deixa de desenhar.
    expect(TELA).toContain("const colunasDeDados = compacto ? 3 : 4;");
    expect(TELA).toContain('{ label: "Qtd · Dim · m²", w: 230, fundeNoCompacto: true }');
    expect(TELA).toContain(".filter(col => !(compacto && col.fundeNoCompacto))");
    expect(TELA).toContain("{!compacto && (");
  });

  it("a faixa do evento ocupa exatamente o que sobra depois do checkbox", () => {
    expect(TELA).toContain('<td colSpan={colunasDeDados} style={{ padding: "10px 16px" }}>');
  });

  it("os subgrupos ocupam a linha inteira", () => {
    expect(TELA).toContain(`<td colSpan={colunasDeDados + 1} style={{ padding: '5px 16px' }}>`);
    expect(TELA).not.toContain("colSpan={7}");
    expect(TELA).not.toContain("colSpan={8}");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SEM ROLAGEM LATERAL EM NENHUMA FAIXA (dono, 15/09). O corte próprio de 980px
// saiu; a tela usa a régua do app pela ÁREA ÚTIL (hooks/use-mobile):
//   · < 820    → cartões;
//   · 820–1180 → COMPACTO: "Qtd · Dim · m²" (262px) desce para a célula da
//                Peça — sobram 460 fixos, e a Peça tem ≥ 360 já nos 820;
//   · ≥ 1180   → a tabela inteira (~920 + a Peça).
// ─────────────────────────────────────────────────────────────────────────────
describe("tabela × cartões pela régua da área útil, sem rolagem lateral", () => {
  it("a área útil desconta o padding da lista e passa pela régua do app", () => {
    expect(TELA).toContain("densityFromWidth(larguraLista - PADDING_DA_LISTA)");
    expect(TELA).toContain("const PADDING_DA_LISTA = 64;");
    expect(TELA).toContain('const listaEmCartoes = isMobile || densidade === "cards";');
    expect(TELA).toContain('const compacto = !listaEmCartoes && densidade === "compact";');
    // O corte próprio morreu.
    expect(TELA).not.toContain("larguraLista < 980");
  });

  it("no compacto a medida continua visível, na célula da Peça", () => {
    expect(TELA).toContain("data-testid={`medida-fundida-${item.id}`}");
    expect(TELA).toContain("{medidaDaPeca(item)}");
  });

  it("a conta fecha: no piso de cada faixa a Peça ainda tem ≥ 300px", () => {
    // checkbox 96 + Arquivo 172 + Ações 192 = 460 fixos (paddings incluídos).
    const fixosNoCompacto = 96 + 172 + 192;
    expect(820 - fixosNoCompacto).toBeGreaterThanOrEqual(300);
    // A inteira (com os 262 da medida) só entra a partir de 1180.
    expect(1180 - (fixosNoCompacto + 262)).toBeGreaterThanOrEqual(200);
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
