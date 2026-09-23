// ─────────────────────────────────────────────────────────────────────────────
// A COLUNA "Tubo" DA PLANILHA — rodando o gerador de verdade
// (services/xlsxExport.ts) com um ExcelJS de mentira que guarda o que é
// escrito. Veio de producao-no-resto-do-fluxo ("Excel: coluna Tubo só no
// export de peças (produção), ao lado da Impressora"), que lia o fonte.
//
// O exceljs de verdade puxa o jszip ao carregar, e o pnpm não o expõe neste
// ambiente (a mesma nota de controle-de-maquinas e do teste de importação).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { bancoDeMentira, mundoVazio, type MundoDoBanco } from "./regras-producao-apoio";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: {} as Record<string, any>,
  planilhas: [] as any[],
}));

vi.mock("../db", () => ({ db: H.db, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("exceljs", () => {
  class Cell { value: any = null; font: any; fill: any; alignment: any; border: any; numFmt: any; }
  class Row {
    cells = new Map<number, Cell>();
    height = 0;
    getCell(i: number) { let c = this.cells.get(i); if (!c) { c = new Cell(); this.cells.set(i, c); } return c; }
    eachCell(_o: any, fn: (c: Cell, i: number) => void) { for (const [i, c] of Array.from(this.cells)) fn(c, i); }
  }
  class Sheet {
    columns: { key: string }[] = [];
    rows: Row[] = [];
    views: any; autoFilter: any;
    constructor(public name: string) {}
    getRow(n: number) { while (this.rows.length < n) this.rows.push(new Row()); return this.rows[n - 1]; }
    getCell(ref: string) { return this.getRow(Number(ref.slice(1))).getCell(ref.charCodeAt(0) - 64); }
    mergeCells() {}
    addRow(obj: Record<string, any>) { const r = this.getRow(this.rows.length + 1); this.columns.forEach((c, i) => { if (obj[c.key] !== undefined) r.getCell(i + 1).value = obj[c.key]; }); return r; }
  }
  class Workbook {
    creator = ""; created: any; worksheets: Sheet[] = [];
    xlsx = { write: async () => {} };
    constructor() { H.planilhas.push(this); }
    addWorksheet(name: string) { const s = new Sheet(name); this.worksheets.push(s); return s; }
    getWorksheet(name: string) { return this.worksheets.find((w) => w.name === name); }
  }
  return { default: { Workbook } };
});

import { handleExportSelectedItemsXlsx, handleExportItemsXlsx, montarPlanilhaDeMaquinas } from "../services/xlsxExport";

// Importar xlsxExport puxa o storage inteiro: com a máquina carregada, passa de 40 s.
vi.setConfig({ testTimeout: 120_000 });

let mundo: MundoDoBanco;
const peca = (id: string, over: Record<string, unknown> = {}) => ({
  id, displayId: `#${id}`, eventId: "ev-1", type: "2x1", description: "Logo", quantity: 10, status: "packed",
  quantityProduced: 10, reuseQty: 0, isReuse: false, conferredQty: 10, deliveredQty: 0, printMachine: "1", tuboId: null,
  deletedAt: null, parentItemId: null, calculatedM2: "2.00", measurement: "1 × 0.2", ...over,
});

const res = () => {
  const r: any = { _status: 200, headersSent: false };
  r.status = (c: number) => { r._status = c; return r; };
  r.json = (b: any) => { r._body = b; return r; };
  r.setHeader = () => r; r.end = () => r;
  return r;
};
const linha = (ws: any, n: number) => Array.from(ws.getRow(n).cells.entries() as Iterable<[number, any]>).sort((a, b) => a[0] - b[0]).map(([, c]) => c.value);

beforeEach(() => {
  H.planilhas.length = 0;
  mundo = mundoVazio();
  mundo.tubos.t1 = { id: "t1", eventId: "ev-1", numero: 2, avulso: false, fechadoEm: null, entregueEm: null, recebidoPor: null };
  for (const k of Object.keys(H.db)) delete H.db[k];
  Object.assign(H.db, bancoDeMentira(mundo));
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getItemsByIds = vi.fn(async () => [peca("a", { tuboId: "t1" }), peca("b")]);
  s.getItemsByEvent = vi.fn(async () => [peca("a", { tuboId: "t1" })]);
  s.getEvent = vi.fn(async () => ({ id: "ev-1", name: "COPA", startDate: "2099-01-10", truckDepartureDate: null }));
  s.getAllEvents = vi.fn(async () => [{ id: "ev-1", name: "COPA" }]);
  s.getAllSponsors = vi.fn(async () => []);
  s.getAllItemSponsors = vi.fn(async () => []);
  s.getItemSponsors = vi.fn(async () => []);
});

describe("a coluna Tubo da planilha", () => {
  it("export da Gráfica (produção): 'Tubo' logo depois de 'Impressora', com o número do tubo da peça", async () => {
    await handleExportSelectedItemsXlsx({ body: { itemIds: ["a", "b"] } } as any, res());
    const ws = H.planilhas[0].getWorksheet("Itens");
    const cab = linha(ws, 3);
    expect(cab.indexOf("Tubo")).toBe(cab.indexOf("Impressora") + 1);
    const col = cab.indexOf("Tubo");
    expect([linha(ws, 4)[cab.indexOf("#ID")], linha(ws, 4)[col]]).toEqual(["#a", 2]);
    expect(ws.getRow(5).getCell(col + 1).value).toBe(""); // sem tubo: vazio
  });

  it("export por evento (especificação) e relatório das máquinas: sem a coluna", async () => {
    await handleExportItemsXlsx({ params: { id: "ev-1" } } as any, res());
    expect(linha(H.planilhas[0].getWorksheet("Itens"), 3)).not.toContain("Tubo");
    const wb: any = montarPlanilhaDeMaquinas({ de: "2026-09-21", ate: "2026-09-21", resumo: [], registros: [] });
    for (const ws of wb.worksheets) expect(linha(ws, 3), ws.name).not.toContain("Tubo");
  });
});
