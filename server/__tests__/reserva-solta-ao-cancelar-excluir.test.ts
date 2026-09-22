// ─────────────────────────────────────────────────────────────────────────────
// CANCELAR/EXCLUIR PEÇA SOLTA A RESERVA DE ESTOQUE (rotas reais de items.ts,
// banco de mentira). Sem isto a peça do acervo ficava "reservada" para uma
// peça morta e ia no caminhão do evento dela.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { txDeMentira } from "./tx-de-mentira";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: {} as Record<string, any>,
  liberar: [] as Array<{ ids: string[]; motivo: string }>,
}));

vi.mock("../db", () => ({ db: H.db, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real,
    requireAuth: (_q: any, _s: any, n: any) => n(),
    requireAdmin: (_q: any, _s: any, n: any) => n(),
    requireRole: () => (_q: any, _s: any, n: any) => n(),
    broadcast: () => {},
    createAuditLog: async () => {},
    createAuditLogsEmLote: async () => {},
  };
});
vi.mock("../routes/estoque-reservas", async () => {
  const real = await vi.importActual<any>("../routes/estoque-reservas");
  return { ...real, liberarReservasDasPecas: async (_req: any, ids: string[], motivo: string) => { H.liberar.push({ ids, motivo }); } };
});
vi.mock("../cache", () => ({ eventsCache: null, setEventsCache: vi.fn(), invalidateEventsCache: vi.fn(), invalidateAllCaches: vi.fn(), registrarCache: vi.fn(), invalidarCacheNoCluster: vi.fn() }));
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn() }));
vi.mock("../objectStorage", () => ({
  ObjectStorageService: class { async trySetObjectEntityAclPolicy(u: string) { return u; } normalizeObjectEntityPath(u: string) { return u; } },
}));

const { registerItemRoutes } = await import("../routes/items");

const rotas = new Map<string, any[]>();
const app: any = {};
for (const v of ["get", "post", "patch", "put", "delete"]) app[v] = (c: string, ...hs: any[]) => { rotas.set(`${v.toUpperCase()} ${c}`, hs); return app; };
registerItemRoutes(app);

async function chamar(chave: string, params: any, body: any = {}) {
  const req: any = { params, body, query: {}, headers: {}, userRole: "admin", userId: "u1", userName: "Ana", session: { userId: "u1", userRole: "admin" } };
  const res: any = { _status: 200, _body: undefined };
  res.status = (c: number) => { res._status = c; return res; };
  res.set = () => res; res.setHeader = () => res;
  res.json = (b: any) => { res._body = b; res._done = true; return res; };
  res.send = res.json;
  for (const h of rotas.get(chave)!) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (res._done || !seguiu) break;
  }
  return { status: res._status as number, body: res._body };
}

let mundo: { itens: Record<string, any>; eventos: Record<string, any> };
const peca = (id: string) => ({
  id, displayId: `#${id}`, eventId: "ev-1", type: "2x1", status: "ready_for_production", quantity: 1,
  quantityProduced: 0, deletedAt: null, parentItemId: null, observations: null,
});

beforeEach(() => {
  H.liberar.length = 0;
  mundo = {
    itens: { "it-1": peca("it-1"), "it-2": peca("it-2") },
    eventos: { "ev-1": { id: "ev-1", name: "Meia do Rio", status: "created", startDate: new Date("2099-12-20T00:00:00Z"), truckDepartureDate: new Date("2099-12-18T00:00:00Z") } },
  };
  for (const k of Object.keys(H.db)) delete H.db[k];
  const tx = txDeMentira(mundo);
  Object.assign(H.db, tx, { transaction: async (fn: any) => fn(tx) });
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getItem = vi.fn(async (id: string) => mundo.itens[id]);
  s.getEvent = vi.fn(async (id: string) => mundo.eventos[id]);
  s.updateItem = vi.fn(async (id: string, d: any) => (mundo.itens[id] = { ...mundo.itens[id], ...d }));
  s.getLiveComplements = vi.fn(async () => []);
});

describe("cancelar/excluir peça solta as reservas dela", () => {
  it("cancelar uma peça", async () => {
    const r = await chamar("PATCH /api/items/:id/cancel", { id: "it-1" }, { notes: "cliente desistiu" });
    expect(r.status).toBe(200);
    expect(mundo.itens["it-1"].status).toBe("canceled");
    expect(H.liberar).toEqual([{ ids: ["it-1"], motivo: "cancelada" }]);
  });

  it("cancelar em lote solta as reservas do lote numa chamada só", async () => {
    const r = await chamar("PATCH /api/items/bulk-cancel", {}, { itemIds: ["it-1", "it-2"] });
    expect(r.status).toBe(200);
    expect(H.liberar).toHaveLength(1);
    expect(H.liberar[0].ids.sort()).toEqual(["it-1", "it-2"]);
    expect(H.liberar[0].motivo).toBe("cancelada");
  });

  it("excluir a peça", async () => {
    const r = await chamar("DELETE /api/items/:id", { id: "it-1" });
    expect(r.status).toBe(200);
    expect(mundo.itens["it-1"].deletedAt).toBeInstanceOf(Date);
    expect(H.liberar).toEqual([{ ids: ["it-1"], motivo: "excluída" }]);
  });

  it("peça que não existe: nada é solto", async () => {
    expect((await chamar("PATCH /api/items/:id/cancel", { id: "nao-existe" })).status).toBe(404);
    expect(H.liberar).toEqual([]);
  });
});
