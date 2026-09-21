// ─────────────────────────────────────────────────────────────────────────────
// GRÁFICA NO CELULAR — a adaptação responsiva (pedido do dono, 24/08).
//
// A regra do pedido: layout e apresentação mudam, lógica NÃO. O que este
// arquivo prende é a estrutura da adaptação e as três armadilhas clássicas de
// mobile que ela evita — 100vh com barra de navegador, rodapé sem recorte
// seguro, e o pior de todos: a versão mobile virar uma CÓPIA divergente do
// desktop.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const G = readFileSync(new URL("../../client/src/pages/grafica.tsx", import.meta.url), "utf8");
const SHELL = readFileSync(new URL("../../client/src/components/modal-shell.tsx", import.meta.url), "utf8");

describe("uma fonte, duas apresentações", () => {
  it("os selects moram numa lista de dados, e barra e folha mapeiam a MESMA", () => {
    // Se o celular tivesse a própria cópia dos campos, cada filtro novo teria
    // de ser lembrado duas vezes — a dívida que esta base já pagou cara.
    expect(G).toContain("const SELECTS_PRINCIPAIS = [");
    expect(G.match(/selects\(true\)/g)?.length).toBe(1);   // folha
    expect(G.match(/selects\(false\)/g)?.length).toBe(1);  // barra desktop
    expect(G.match(/avancados\(true\)/g)?.length).toBe(2); // grid desktop + folha
  });

  it("nada do vocabulário se perdeu na mudança", () => {
    for (const t of [
      "select-status-filter", "select-group-filter", "select-percurso-filter",
      "select-month-filter", "select-type-filter", "select-material-filter",
      "select-finish-filter", "button-next-10-days-filter", "button-limpar-filtros",
      "input-search-filter", "button-toggle-advanced-filters",
    ]) {
      expect(G, t).toContain(t);
    }
  });
});

describe("a folha de filtros do celular", () => {
  it("abre por um botão que diz quantos filtros estão ativos", () => {
    expect(G).toContain('data-testid="button-abrir-filtros-mobile"');
    expect(G).toContain('Filtros{nFiltros > 0 ? ` (${nFiltros})` : ""}');
  });

  it("é tela cheia com dvh — o 100vh clássico esconde o rodapé atrás da barra do navegador", () => {
    expect(G).toContain('data-testid="folha-filtros-mobile"');
    expect(G).toContain('height: "100dvh"');
    expect(G).toContain('overscrollBehavior: "contain"');
  });

  it("o rodapé aplica dizendo o RESULTADO, e respeita o recorte seguro", () => {
    expect(G).toContain("Ver {filteredItems.length} peça{filteredItems.length !== 1");
    // Em longos (paddingBottom): o atalho `padding` com env() some no parser do
    // jsdom, e o teste montado (grafica-celular) não o enxergava. Mesmo valor.
    expect(G).toContain('paddingBottom: "calc(10px + env(safe-area-inset-bottom))"');
  });

  it("fechar tem alvo de 44 e rótulo para leitor de tela", () => {
    expect(G).toContain('aria-label="Fechar filtros"');
    expect(G).toContain('data-testid="button-fechar-filtros-mobile"');
  });
});

describe("o card não perde ação da tabela", () => {
  // Desde a rodada 3 de UX o card vale também para o tablet (conteúdo < 820px):
  // nessa faixa ele é o ÚNICO layout. Cada ação da coluna de Ações tem de
  // existir no card com o MESMO gate — escrito igual, para não divergir.
  it("produzir, reaproveitar, corrigir reaproveitamento e devolver usam o gate literal da tabela", () => {
    const pares: [string, string][] = [
      ["const podeProduzirPeca = !emRevisao && canProduce && !isDelivered(item) && !isProduced(item) && !isPosConferencia(item) && !item.isReuse;",
       "{!bulkOn && !emRevisao && canProduce && !isDelivered(item) && !isProduced(item) && !isPosConferencia(item) && !item.isReuse && ("],
      ["const podeReaproveitarPeca = !emRevisao && !soVisualizaKit(item) && !isDelivered(item) && !isPosConferencia(item) && (!isProduced(item) ? tetoReaproveitar(item) > 0 : podeMexerQtd && qtyOf(item) > 0);",
       "{!bulkOn && !emRevisao && !soVisualizaKit(item) && !isDelivered(item) && !isPosConferencia(item) && (!isProduced(item) ? tetoReaproveitar(item) > 0 : podeMexerQtd && qtyOf(item) > 0) && ("],
      ["const podeCorrigirReaprov = !emRevisao && !soVisualizaKit(item) && (isProduced(item) || isAdmin) && reusedTotalOf(item) > 0",
       "{!bulkOn && !emRevisao && !soVisualizaKit(item) && (isProduced(item) || isAdmin) && reusedTotalOf(item) > 0"],
      ["const podeDevolverPeca = canProduce && podeDevolverParaRevisao(item);",
       "{!bulkOn && canProduce && podeDevolverParaRevisao(item) && ("],
    ];
    for (const [card, tabela] of pares) {
      expect(G, card).toContain(card);
      expect(G, tabela).toContain(tabela);
    }
    for (const t of ["button-production-card-", "button-reuse-card-", "button-correct-reuse-card-", "button-devolver-revisao-card-"]) {
      expect(G, t).toContain(t);
    }
  });
});

describe("as armadilhas de viewport", () => {
  it("a barra do lote reserva o recorte seguro do aparelho", () => {
    expect(G).toContain("paddingBottom: isMobile ? 'calc(10px + env(safe-area-inset-bottom))' : 'calc(12px + env(safe-area-inset-bottom))'");
    // e o conteúdo da página reserva a altura REAL da barra — no celular ela
    // tem duas linhas (grafica-celular.test.ts), no desktop uma
    expect(G).toContain("bulkOn ? (isMobile ? 'calc(140px + env(safe-area-inset-bottom))' : 'calc(88px + env(safe-area-inset-bottom))')");
  });

  it("o X de cancelar o lote vira dedo no celular", () => {
    expect(G).toContain("width: isMobile ? 44 : 36, height: isMobile ? 44 : 36");
  });

  it("modalSurface usa dvh com fallback, e nunca passa da largura da tela", () => {
    // Vale para TODOS os modais do app — a Gráfica foi o motivo, o benefício
    // é geral. O fallback em vh fica para navegador antigo; onde dvh existe,
    // a segunda linha vence.
    expect(SHELL).toContain('maxWidth: `min(${maxWidth}px, calc(100vw - 16px))`');
    expect(SHELL).toContain('maxHeight: "calc(100vh - 48px)"');
    expect(SHELL).toContain('CSS.supports?.("height: 100dvh")');
    expect(SHELL).toContain('maxHeight: "calc(100dvh - 24px)"');
  });
});

describe("o que o pedido mandou preservar", () => {
  it("o desktop continua com a barra horizontal de sempre", () => {
    expect(G).toContain("if (!isMobile) return (");
    expect(G).toContain('gridTemplateColumns: "repeat(3, 1fr)"');
  });

  it("nenhuma lógica mudou: as mesmas mutações, os mesmos gates", () => {
    // O modal de impressão (e suas duas mutations) mora em components/grafica/
    // modal-impressao.tsx desde 21/09 — a fila o importa por `useMutacoesDeImpressao`.
    for (const m of ["useMutacoesDeImpressao", "conferMutation", "markDeliveredMutation", "devolverMutation", "podeConferir"]) {
      expect(G, m).toContain(m);
    }
  });

  it("os cards mobile continuam com alvos de 44", () => {
    expect(G).toContain("width: '100%', minHeight: 44");
  });
});
