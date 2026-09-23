// ─────────────────────────────────────────────────────────────────────────────
// A REVISÃO APARECE NA GRÁFICA — SÓ PARA VER (decisão do dono, 24/08).
//
// "Revisão aparecer na Gráfica, mas claro sem eles poderem fazer ações."
// A peça em revisão é o trabalho CHEGANDO: a Gráfica passa a enxergá-la na
// própria fila (com o selo e o reaproveitamento visíveis), e nenhuma ação
// dela funciona — nem na tela, nem no servidor.
//
// O risco que este arquivo prende: o caminho do REUSO na conferência não
// olha status (decisão antiga, correta para o acervo). Enquanto a revisão
// não aparecia na Gráfica, isso era inalcançável; agora precisa de gate.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import { fonteDasRotasDeItens } from "./fonte-das-rotas-de-itens";
import { readFileSync } from "fs";
import { fonteDaGrafica } from "./fonte-da-grafica";

vi.mock("../db", () => ({ db: {} }));
vi.mock("../storage", () => ({ storage: {} }));

const { EM_REVISAO } = await import("@shared/fluxo-peca");

const STORAGE = readFileSync(new URL("../storage.ts", import.meta.url), "utf8");
const ITEMS = fonteDasRotasDeItens();
const GRAFICA = fonteDaGrafica();
const FILTROS = readFileSync(new URL("../../client/src/lib/grafica-filtros.ts", import.meta.url), "utf8");

describe("a lista tem um dono e os três status certos", () => {
  it("shared/fluxo-peca é a fonte — os mesmos três da etapa 'revisao' do funil", () => {
    expect(Array.from(EM_REVISAO).sort()).toEqual(["awaiting_final_review", "awaiting_review", "in_review"]);
    // e ninguém redeclara o trio na tela
    // O import pode trazer outros nomes do mesmo arquivo (as máquinas de
    // impressão entraram em 14/09) — o que importa é o trio vir DE LÁ.
    expect(GRAFICA).toMatch(/import \{[^}]*\bEM_REVISAO\b[^}]*\} from "@shared\/fluxo-peca";/);
    expect(GRAFICA).not.toContain('new Set(["awaiting_final_review"');
  });
});

describe("aparece", () => {
  it("o feed da Gráfica inclui os três status de revisão", () => {
    const i = STORAGE.indexOf("async getApprovedItems");
    const corpo = STORAGE.slice(i, i + 900);
    for (const st of ["awaiting_final_review", "awaiting_review", "in_review"]) {
      expect(corpo).toContain(`'${st}'`);
    }
  });

  it("com KPI 'Em Revisão · Chegando' clicável, antes de Liberados", () => {
    // UX rodada 4: o "sub" da aba virou frase visível no desktop ("Chegando da Revisão").
    expect(GRAFICA).toContain('{ label: "Em Revisão",   value: stats.revisao,    sub: "Chegando da Revisão",  testId: "stat-revisao",    filterVals: FILTRO_DOS_CARTOES.revisao },');
    expect(GRAFICA).toContain('revisao: ["awaiting_final_review"],');
    expect(GRAFICA.indexOf('testId: "stat-revisao"')).toBeLessThan(GRAFICA.indexOf('testId: "stat-approved"'));
  });

  it("com selo nas duas formas da lista (card e tabela)", () => {
    expect(GRAFICA).toContain("chip-revisao-${item.id}");
    expect(GRAFICA).toContain("selo-revisao-${item.id}");
    expect(GRAFICA).toContain("As ações liberam quando a Revisão Final aprovar.");
  });

  it("o filtro casa a família inteira, e a contagem soma igual — invariante da faceta", () => {
    expect(FILTROS).toContain('statusDoItem === "awaiting_final_review" || statusDoItem === "awaiting_review" || statusDoItem === "in_review"');
    expect(GRAFICA).toContain(': (s === "awaiting_review" || s === "in_review") ? "awaiting_final_review"');
  });
});

describe("mas não age", () => {
  it("na tela: conferir, entregar, produzir e lote são barrados pelo emRevisao", () => {
    expect(GRAFICA).toContain("const canConferItem = canConfer(item) && !emRevisao;");
    expect(GRAFICA).toContain("const podeProduzirAqui = !emRevisao && canProduce");
    expect(GRAFICA).toContain("const bulkEligible = !emRevisao && (bulkConferMode");
    expect(GRAFICA).toContain("{!bulkOn && !emRevisao && podeConferir && canConfer(item) && (");
    // a entrega por peça saiu da tela: a embalada sai pelo volume
    expect(GRAFICA).not.toContain("canDeliver(");
  });

  it("as filas do galpão e do lote nunca a incluem", () => {
    expect(GRAFICA).toContain("canConfer(i) && !EM_REVISAO.has(i.status)");
  });

  it("e o SERVIDOR recusa a conferência — o buraco do reuso está fechado", () => {
    // canConfer aceita reuseQty>0 sem olhar status; com a revisão agora
    // visível na fila, sem este gate uma peça em revisão com reaproveitamento
    // marcado seria conferível de verdade.
    const i = ITEMS.indexOf('app.post("/api/items/:id/confer"');
    const corpo = ITEMS.slice(i, i + 5000);
    expect(corpo).toContain("if (EM_REVISAO.has(current.status)) {");
    expect(corpo).toContain("a Gráfica confere depois que a Revisão liberar");
    expect(corpo.indexOf("EM_REVISAO.has")).toBeLessThan(corpo.indexOf("planejarConferencia("));
  });
});
describe("segunda rodada (25/08): os quatro furos que sobraram", () => {
  // O dono repetiu a regra com todas as letras: 'em revisão a Gráfica não
  // pode ter ação, apenas visualizar'. A primeira rodada fechou conferir,
  // entregar, produzir-no-card, lote e galpão — mas a TABELA ainda oferecia
  // Produzir e Reaproveitar, e o + de aumentar quantidade aparecia nos dois
  // layouts. E reaproveitar era ação REAL: o servidor não olhava o status.
  const G = fonteDaGrafica();
  const ITEMS = fonteDasRotasDeItens();

  it("produzir e reaproveitar da tabela exigem !emRevisao", () => {
    expect(G).toContain("{!bulkOn && !emRevisao && canProduce && !isDelivered(item)");
    // 15/09: + !soVisualizaKit(item) — a Solicitação da Arena só vê a peça do Kit.
    expect(G).toContain("{!bulkOn && !emRevisao && !pecaTravada(item) && !soVisualizaKit(item) && !isDelivered(item) && !isPosConferencia(item) && (!isProduced(item) ? tetoReaproveitar(item) > 0 : podeMexerQtd && qtyOf(item) > 0)");
    expect(G).toContain("{!bulkOn && !emRevisao && !soVisualizaKit(item) && (isProduced(item) || isAdmin) && reusedTotalOf(item) > 0");
  });

  it("aumentar quantidade some nos DOIS layouts", () => {
    expect(G.split("const mostraAumentar = !bulkOn && !emRevisao && !soVisualizaKit(item) && podeAumentarQuantidade(item, podeMexerQtd);").length - 1).toBe(2);
  });

  it("o servidor tranca reaproveitar e corrigir reaproveitamento em revisão", () => {
    // O botão sumir é cortesia; a tranca é do servidor — script e tela velha
    // também batem nela.
    // 3 = reaproveitar, corrigir reaproveitamento e INICIAR IMPRESSÃO (14/09):
    // levar a peça para a máquina também é agir, e a revisão também tranca.
    expect(ITEMS.match(/Esta peça está em revisão — a Gráfica só age depois que a revisão liberar./g)?.length).toBe(3);
  });
});

