// ─────────────────────────────────────────────────────────────────────────────
// DEFEITO (integração, 23/09): cancelar UMA peça em impressão gravava a
// "pausa" no diário das máquinas DUAS vezes — uma dentro de
// gravarCancelamento e outra de novo na rota. O cancelamento em lote gravava
// uma. O diário alimenta a aba Máquinas: pausa em dobro é uma saída da
// impressora que não aconteceu.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  inserts: [] as { tabela: unknown; valores: any }[],
}));

vi.mock("../db", () => ({
  db: {
    insert: (tabela: unknown) => ({ values: async (valores: any) => { H.inserts.push({ tabela, valores }); return []; } }),
    execute: async () => ({ rows: [] }),
    transaction: async () => {},
  },
  pool: {},
}));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real,
    requireAuth: (_req: any, _res: any, next: any) => next(),
    requireRole: () => (_req: any, _res: any, next: any) => next(),
    broadcast: () => {},
    createAuditLog: async () => {},
    createAuditLogsEmLote: async () => {},
    updateEventStatus: async () => {},
  };
});
vi.mock("../routes/estoque-reservas", async () => {
  const real = await vi.importActual<any>("../routes/estoque-reservas");
  return { ...real, liberarReservasDasPecas: async () => {} };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));
vi.mock("../services/consultaDeEstoqueNaLiberacao", () => ({
  respostaDoEstoqueParaLiberar: vi.fn(async () => null),
  marcarRespostaAplicada: vi.fn(async () => {}),
}));

import { registerItemRoutes } from "../routes/items";
import { registrosDeImpressao } from "@shared/schema";

type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const appFalso: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  appFalso[verbo] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs); return appFalso; };
}
registerItemRoutes(appFalso);

async function chamar(chave: string, body: any, params: any = {}) {
  const req: any = { params, body, query: {}, headers: {}, userRole: "admin", userId: "u1", userName: "Maria", session: {} };
  const res: any = { _status: 200, _body: undefined, _done: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; res._done = true; return res; };
  res.set = () => res; res.setHeader = () => res; res.send = res.json;
  for (const h of rotas.get(chave)!) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (res._done || !seguiu) break;
  }
  return { status: res._status, body: res._body };
}

let itens: Record<string, any>;
const pausas = () => H.inserts.filter((i) => i.tabela === registrosDeImpressao && i.valores.tipo === "pausa");

// Peça imprimindo em duas impressoras: uma pausa por impressora, não mais.
const imprimindo = (id: string) => ({
  id, displayId: `#${id}`, eventId: "ev-1", type: "Pórtico", quantity: 10, quantityProduced: 2,
  reuseQty: 0, isReuse: false, status: "inProduction", printMachine: "1",
  impressaoPorMaquina: { "1": { atrib: 6, impressas: 2 }, "3": { atrib: 4, impressas: 0 } },
  deletedAt: null, parentItemId: null, pedidoDePecaLinhaId: null, statusBeforeCancel: null,
});

beforeEach(() => {
  H.inserts = [];
  itens = { p1: imprimindo("p1"), p2: imprimindo("p2") };
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getItem = vi.fn(async (id: string) => itens[id]);
  s.getEvent = vi.fn(async () => ({ id: "ev-1", name: "COPA", status: "created", startDate: "2099-01-10", truckDepartureDate: new Date("2099-01-01T00:00:00Z") }));
  s.updateItem = vi.fn(async (id: string, dados: any) => (itens[id] = { ...itens[id], ...dados }));
  s.getLiveComplements = vi.fn(async () => []);
});

describe("cancelar peça em impressão: UMA pausa por impressora no diário", () => {
  it("cancelamento individual grava uma pausa por impressora ativa (antes: duas)", async () => {
    const r = await chamar("PATCH /api/items/:id/cancel", { notes: "Evento mudou" }, { id: "p1" });
    expect(r.status).toBe(200);
    const linhas = pausas();
    expect(linhas.map((l) => l.valores.maquina).sort()).toEqual(["1", "3"]);
    expect(linhas.every((l) => l.valores.itemId === "p1")).toBe(true);
  });

  it("o individual e o em lote gravam o mesmo número de pausas", async () => {
    await chamar("PATCH /api/items/:id/cancel", {}, { id: "p1" });
    const doIndividual = pausas().length;
    H.inserts = [];
    await chamar("PATCH /api/items/bulk-cancel", { itemIds: ["p2"] });
    expect(pausas().length).toBe(doIndividual);
  });
});
