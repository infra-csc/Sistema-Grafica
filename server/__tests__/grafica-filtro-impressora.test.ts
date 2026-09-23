// ─────────────────────────────────────────────────────────────────────────────
// FILTRO "IMPRESSORA" na Gráfica (pedido do dono, 21/09: "na Gráfica ter filtro
// de impressoras").
//
// A regra pura mora em lib/grafica-filtros (URL, contagem, casamento); a tela
// só monta as opções. Cada bloco prende um pedaço do contrato: a opção com
// contagem no menu, a chave `?impressora=` na URL, o "Sem impressora" do
// legado, e a entrada na fonte única (nFiltros, limpar, "Recorte atual").
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  FILTROS_VAZIOS, SEM_IMPRESSORA, contarFiltrosAtivos, descreverFiltros,
  filtrosDaURL, filtrosParaQuery, itemCasaFiltros, itemImpressora, temFiltroAtivo,
  type GraficaFiltros, type ItemGrafica,
} from "../../client/src/lib/grafica-filtros";
import { NOMES_DAS_MAQUINAS, rotuloDaMaquina } from "../../shared/fluxo-peca";
import { fonteDaGrafica } from "./fonte-da-grafica";

const TELA = fonteDaGrafica();

const f = (over: Partial<GraficaFiltros> = {}): GraficaFiltros => ({ ...FILTROS_VAZIOS, ...over });
const ctx = { groupOf: () => "", hojeUTC: Date.UTC(2026, 8, 21) };
const peca = (over: Partial<ItemGrafica> = {}): ItemGrafica => ({
  id: "p1", displayId: "#0001", type: "Banner", status: "inProduction", quantity: 10,
  eventId: "ev1", event: { name: "Maratona SP", truckDepartureDate: null },
  ...over,
});

describe("a impressora que o filtro enxerga na peça", () => {
  it("lê o código de `printMachine` (o mesmo que o formato compacto entrega)", () => {
    expect(itemImpressora(peca({ printMachine: "1" }))).toBe("1");
    expect(itemImpressora(peca({ printMachine: "4" }))).toBe("4");
  });

  it("peça já produzida continua da máquina em que começou (printMachine nunca é apagado)", () => {
    expect(itemImpressora(peca({ status: "produced", printMachine: "2" }))).toBe("2");
  });

  it("'Sem impressora' é SÓ a peça em impressão sem máquina (legado)", () => {
    expect(itemImpressora(peca({ status: "inProduction", printMachine: null }))).toBe(SEM_IMPRESSORA);
    expect(itemImpressora(peca({ status: "em_producao" }))).toBe(SEM_IMPRESSORA);
    // fora da impressão e sem máquina: não tem impressora nenhuma
    expect(itemImpressora(peca({ status: "approved" }))).toBeNull();
    expect(itemImpressora(peca({ status: "produced", printMachine: null }))).toBeNull();
  });
});

describe("casamento item ↔ filtro de impressora", () => {
  it("com o filtro ativo, só passam as peças que casam; sem impressora ficam de fora", () => {
    const r = f({ impressora: ["1", "3"] });
    expect(itemCasaFiltros(peca({ printMachine: "1" }), r, ctx)).toBe(true);
    expect(itemCasaFiltros(peca({ printMachine: "3" }), r, ctx)).toBe(true);
    expect(itemCasaFiltros(peca({ printMachine: "2" }), r, ctx)).toBe(false);
    expect(itemCasaFiltros(peca({ status: "approved" }), r, ctx)).toBe(false);
  });

  it("'Sem impressora' acha o legado em impressão", () => {
    const r = f({ impressora: [SEM_IMPRESSORA] });
    expect(itemCasaFiltros(peca({ status: "inProduction" }), r, ctx)).toBe(true);
    expect(itemCasaFiltros(peca({ status: "inProduction", printMachine: "1" }), r, ctx)).toBe(false);
  });

  it("a faceta exclui a própria dimensão (contagem por opção sai do pool sem ela)", () => {
    const r = f({ impressora: ["1"] });
    expect(itemCasaFiltros(peca({ printMachine: "2" }), r, ctx, { excluir: "impressora" })).toBe(true);
  });
});

describe("fonte única: URL, contagem, limpar e empty state", () => {
  it("vive na URL como ?impressora=1,3", () => {
    expect(filtrosDaURL("?impressora=1,3").impressora).toEqual(["1", "3"]);
    expect(filtrosDaURL("").impressora).toEqual([]);
    expect(filtrosParaQuery("", f({ impressora: ["1", "3"] }))).toBe("impressora=1%2C3");
    expect(filtrosParaQuery("?impressora=1", FILTROS_VAZIOS)).toBe("");
  });

  it("conta como filtro ativo e some ao limpar (FILTROS_VAZIOS)", () => {
    expect(FILTROS_VAZIOS.impressora).toEqual([]);
    expect(temFiltroAtivo(f({ impressora: ["2"] }))).toBe(true);
    expect(contarFiltrosAtivos(f({ impressora: ["2"], status: ["inProduction"] }))).toBe(2);
  });

  it("no 'Recorte atual' aparece o NOME da máquina, não o código", () => {
    const d = descreverFiltros(f({ impressora: ["1", SEM_IMPRESSORA] }), {
      impressora: (v) => v.map(m => m === SEM_IMPRESSORA ? "Sem impressora" : rotuloDaMaquina(m)).join(", "),
    });
    expect(d).toEqual([`Impressora: ${NOMES_DAS_MAQUINAS["1"]}, Sem impressora`]);
    // e a tela passa exatamente esse tradutor
    expect(TELA).toContain('impressora: (v) => v.map(m => m === SEM_IMPRESSORA ? "Sem impressora" : rotuloDaMaquina(m)).join(", "),');
  });
});

describe("o dropdown na tela", () => {
  it("entra em SELECTS_PRINCIPAIS — a mesma lista que a folha 'Mais filtros' do celular reaproveita", () => {
    expect(TELA).toContain('{ label: "Impressora", allLabel: "Todas as impressoras", values: filtros.impressora, set: (v: string[]) => patchFiltros({ impressora: v }), options: impressoraFilterOptions, testId: "select-impressora-filter", sempre: false,');
    expect(TELA).toContain("Impressora: \"Máquina em que a peça começou a imprimir;");
  });

  it("as opções saem do gFacetPool, em ordem fixa (4 máquinas + Sem impressora), só com contagem > 0 ou já escolhida", () => {
    expect(TELA).toContain("gFacetPool('impressora').forEach((i) => {");
    expect(TELA).toContain("const ordem = [...MAQUINAS_DE_IMPRESSAO, SEM_IMPRESSORA];");
    expect(TELA).toContain(".filter(m => (conta.get(m) ?? 0) > 0 || filtros.impressora.includes(m))");
    expect(TELA).toContain('label: m === SEM_IMPRESSORA ? "Sem impressora" : rotuloDaMaquina(m),');
    expect(TELA).toContain("}, [gFacetPool, filtros.impressora]);");
  });
});
