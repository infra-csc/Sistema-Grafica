// ─────────────────────────────────────────────────────────────────────────────
// A PEÇA E A EMBALAGEM NAS ROTAS DE PEÇA — conferir, entregar (aposentada),
// excluir, transferir e corrigir reaproveitamento, executadas com o banco de
// mentira que avalia o WHERE (regras-estoque-banco-de-mentira.ts).
//
// Vieram de casos que só liam o texto das rotas de peça em:
//   · embalagem-revisao-22-09.test.ts ("6 · conferir trava a peça");
//   · embalagem-com-quantidade.test.ts ("PATCH /deliver → 409 para qualquer peça");
//   · entrega-a-foto-e-o-comprovante.test.ts ("responde 409 que ensina");
//   · embalagem-revisao-adversarial.test.ts (transferir com volume aberto,
//     corrigir reaproveitamento embalado, piso da redução, excluir a peça).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { criarBanco, type Banco } from "./regras-estoque-banco-de-mentira";

const H = vi.hoisted(() => ({
  banco: null as any,
  storage: {} as Record<string, any>,
  auditoria: [] as any[][],
}));

vi.mock("../db", () => ({ db: new Proxy({}, { get: (_t, k) => H.banco.db[k] }), pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: new Proxy({}, { get: (_t, k) => H.storage[k as string] }) };
});
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real,
    requireAuth: (_q: any, _s: any, n: any) => n(),
    requireRole: () => (_q: any, _s: any, n: any) => n(),
    broadcast: () => {},
    createAuditLog: async (...a: any[]) => { H.auditoria.push(a); },
    createAuditLogsEmLote: async () => {},
    updateEventStatus: async () => {},
  };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));
vi.mock("../services/consultaDeEstoqueNaLiberacao", () => ({
  respostaDoEstoqueParaLiberar: vi.fn(async () => null),
  marcarRespostaAplicada: vi.fn(async () => {}),
}));

import { registerItemRoutes } from "../routes/items";
import { planejarEdicao } from "../services/edicao-da-peca";

type Handler = (req: any, res: any, next: any) => unknown;
const rotas = new Map<string, Handler[]>();
const app: any = {};
for (const v of ["get", "post", "patch", "put", "delete"]) app[v] = (c: string, ...hs: Handler[]) => { rotas.set(`${v.toUpperCase()} ${c}`, hs); return app; };
registerItemRoutes(app);

async function chamar(chave: string, ctx: { params?: any; body?: any; papel?: string } = {}) {
  const hs = rotas.get(chave);
  if (!hs) throw new Error(`Rota não registrada: ${chave}`);
  const req: any = { params: ctx.params ?? {}, body: ctx.body ?? {}, query: {}, headers: {}, userRole: ctx.papel ?? "grafica", userId: "u1", userName: "Gil", session: {} };
  const res: any = { _status: 200, _body: undefined, _done: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; res._done = true; return res; };
  res.set = () => res; res.setHeader = () => res; res.send = res.json;
  for (const h of hs) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (res._done || !seguiu) break;
  }
  return { status: res._status as number, body: res._body };
}

const FOTO = "/objects/uploads/conf.jpg";
const EVENTOS: Record<string, any> = {
  "ev-1": { id: "ev-1", name: "COPA NORTE", status: "created", arquivadoEm: null, startDate: "2099-01-10", truckDepartureDate: new Date("2099-01-01T00:00:00Z") },
  "ev-2": { id: "ev-2", name: "COPA SUL", status: "created", arquivadoEm: null, startDate: "2099-02-10", truckDepartureDate: new Date("2099-02-01T00:00:00Z") },
};
const peca = (id: string, over: Record<string, unknown> = {}) => ({
  id, displayId: `#${id}`, eventId: "ev-1", type: "2x1", description: "Nubank", quantity: 10, quantityProduced: 10,
  status: "conferred", conferredQty: 10, embaladaQty: 0, deliveredQty: 0, isReuse: false, reuseQty: 0,
  conferencePhotoUrl: FOTO, conferredAt: null, tuboId: null, deletedAt: null, kitRemessaId: null, criadoPorId: null, parentItemId: null,
  travadaEm: null, travadaPor: null, travadaMotivo: null, pedidoDePecaLinhaId: null, updatedAt: null, statusChangedAt: null, ...over,
});

let b: Banco;
function montar(t: { items?: any[]; tubos?: any[]; tubo_itens?: any[] }) {
  b = criarBanco({ events: Object.values(EVENTOS), items: [], tubos: [], tubo_itens: [], audit_logs: [], event_inventory_allocations: [], ...t }, {
    // transferir pergunta por SQL cru se a peça está num volume ABERTO
    executar: (q) => (q.sql.includes("from tubo_itens")
      ? b.mundo.tubo_itens.filter((l) => l.itemId === q.params[0] && !l.entregueEm).map(() => ({ ok: 1 }))
      : []),
  });
  H.banco = b;
  const naoUse = (nome: string) => vi.fn(async () => { throw new Error(`${nome} não devia ser chamado`); });
  for (const k of Object.keys(H.storage)) delete H.storage[k];
  Object.assign(H.storage, {
    getItem: vi.fn(async (id: string) => { const p = b.linha("items", id); return p ? { ...p } : undefined; }),
    getEvent: vi.fn(async (id: string) => EVENTOS[id]),
    getLiveComplements: vi.fn(async () => []),
    getItemSponsors: vi.fn(async () => []),
    getEventSponsors: vi.fn(async () => []),
    getSponsor: vi.fn(async () => undefined),
    updateItem: vi.fn(async (id: string, dados: any) => Object.assign(b.linha("items", id)!, dados)),
    deleteItem: naoUse("storage.deleteItem"),
    createNotification: vi.fn(async (n: any) => ({ id: "n1", ...n })),
  });
}
const item = (id: string) => b.linha("items", id)!;

beforeEach(() => { H.auditoria = []; });

describe("conferir trava a peça (revisão de 22/09)", () => {
  it("lê a peça com FOR UPDATE dentro da transação, faz a conta com ELA e grava lá dentro — sem storage.getItem/updateItem", async () => {
    montar({ items: [peca("p1", { status: "produced", conferredQty: 7, embaladaQty: 7 })] });
    H.storage.getItem = vi.fn(async () => { throw new Error("leu fora da trava"); });
    H.storage.updateItem = vi.fn(async () => { throw new Error("gravou fora da trava"); });
    const r = await chamar("POST /api/items/:id/confer", { params: { id: "p1" }, body: { conferencePhotoUrl: FOTO, qty: 3 } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const tx = b.ops.filter((o) => o.tx !== null);
    expect(tx[0]).toMatchObject({ tipo: "select", tabela: "items", travou: true });
    expect(tx.find((o) => o.tipo === "update")).toMatchObject({ tabela: "items" });
    expect(b.gravacoes().every((o) => o.tx !== null)).toBe(true);
    // parcial que já embalou a parte dela: fecha como Conferido (falta embalar 3)
    expect(item("p1")).toMatchObject({ conferredQty: 10, status: "conferred" });
    expect(item("p1").statusChangedAt).toBeInstanceOf(Date);
  });

  it("fechar a conferência de peça já TODA embalada vira Embalado (a rota usa planejarConferencia)", async () => {
    montar({ items: [peca("p1", { status: "produced", conferredQty: 7, embaladaQty: 10 })] });
    const r = await chamar("POST /api/items/:id/confer", { params: { id: "p1" }, body: { conferencePhotoUrl: FOTO, qty: 3 } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(item("p1")).toMatchObject({ conferredQty: 10, status: "packed" });
    expect(H.auditoria.at(-1)?.[4]).toBe("Conferência concluída (10/10) — já estava toda embalada");
  });

  it("a conta usa a linha lida NA TRAVA: quem conferiu no meio do caminho encolhe o teto", async () => {
    montar({ items: [peca("p1", { status: "produced", conferredQty: 7 })] });
    const original = b.db.transaction;
    b.db.transaction = async (fn: any) => { item("p1").conferredQty = 9; return original(fn); };
    const r = await chamar("POST /api/items/:id/confer", { params: { id: "p1" }, body: { conferencePhotoUrl: FOTO, qty: 3 } });
    expect(r.status).toBe(409);
    expect(item("p1").conferredQty).toBe(9);
  });
});

describe("PATCH /api/items/:id/deliver — aposentada: 409 que ensina, para QUALQUER peça, sem escrever nada", () => {
  it.each([
    ["conferida", { status: "conferred" }],
    ["parcial", { status: "produced", conferredQty: 7 }],
    ["embalada", { status: "packed", embaladaQty: 10 }],
  ])("%s → 409", async (_nome, over) => {
    montar({ items: [peca("p1", over)] });
    const r = await chamar("PATCH /api/items/:id/deliver", { params: { id: "p1" }, body: { receivedBy: "Zé", photoUrl: FOTO } });
    expect(r).toEqual({ status: 409, body: { error: "Embale antes de entregar (Embalar pede a foto; a entrega pede só quem recebeu)" } });
    expect(b.gravacoes()).toEqual([]);
    expect(H.storage.updateItem).not.toHaveBeenCalled();
    expect(H.auditoria).toEqual([]);
  });

  it("quem não confere nem entrega leva 403 antes de tudo", async () => {
    montar({ items: [peca("p1")] });
    expect((await chamar("PATCH /api/items/:id/deliver", { params: { id: "p1" }, papel: "arte" })).status).toBe(403);
  });
});

describe("excluir a peça embalada", () => {
  it("DELETE tira dos volumes abertos e faz o soft delete na MESMA transação (nunca storage.deleteItem)", async () => {
    montar({
      items: [peca("p1", { status: "packed", embaladaQty: 10, tuboId: "t1" })],
      tubos: [{ id: "t1", eventId: "ev-1", numero: 1, avulso: false, entregueEm: null, fechadoEm: null }],
      tubo_itens: [{ id: "l1", tuboId: "t1", itemId: "p1", quantidade: 10, entregueEm: null }],
    });
    const r = await chamar("DELETE /api/items/:id", { params: { id: "p1" }, papel: "admin" });
    expect(r, JSON.stringify(r.body)).toEqual({ status: 200, body: { success: true } });
    expect(b.mundo.tubo_itens).toEqual([]);
    expect(item("p1").deletedAt).toBeInstanceOf(Date);
    const escritas = b.gravacoes().filter((o) => o.tabela === "items" || o.tabela === "tubo_itens");
    expect(new Set(escritas.map((o) => o.tx)).size).toBe(1);
    expect(escritas[0].tx).not.toBeNull();
    expect(H.storage.deleteItem).not.toHaveBeenCalled();
  });
});

describe("as outras portas respeitam a embalagem", () => {
  it("transferir de evento: 409 com linha ABERTA no volume; entregue não segura", async () => {
    montar({
      items: [peca("p1", { status: "packed", embaladaQty: 10 })],
      tubo_itens: [{ id: "l1", tuboId: "t1", itemId: "p1", quantidade: 10, entregueEm: null }],
    });
    const r = await chamar("POST /api/items/:id/transfer-event", { params: { id: "p1" }, body: { eventId: "ev-2" }, papel: "admin" });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "IN_OPEN_TUBE", error: "Esta peça está embalada num tubo ainda não entregue. Tire a peça do tubo antes de transferir." });
    expect(H.storage.updateItem).not.toHaveBeenCalled();

    b.linha("tubo_itens", "l1")!.entregueEm = new Date();
    const ok = await chamar("POST /api/items/:id/transfer-event", { params: { id: "p1" }, body: { eventId: "ev-2" }, papel: "admin" });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(item("p1").eventId).toBe("ev-2");
  });

  it("corrigir reaproveitamento recusa a peça com unidade embalada", async () => {
    montar({ items: [peca("p1", { status: "produced", isReuse: true, reuseQty: 3, quantityProduced: 7, conferredQty: 0, embaladaQty: 2 })] });
    const r = await chamar("POST /api/items/:id/correct-reuse", { params: { id: "p1" }, body: { correctedReuseQty: 1 } });
    expect(r).toEqual({ status: 409, body: { error: "Não é possível corrigir: 2 un. já estão embaladas. Tire a peça do tubo antes de corrigir." } });
    expect(H.storage.updateItem).not.toHaveBeenCalled();
  });

  it("o piso da redução de quantidade inclui as embaladas", () => {
    const atual = peca("p1", { status: "produced", quantityProduced: 0, conferredQty: 0, embaladaQty: 7, isReuse: true }) as any;
    const plano = planejarEdicao(atual, { quantity: 5 } as any, undefined, false);
    expect(plano).toEqual({ recusa: { status: 409, corpo: expect.objectContaining({ code: "QUANTITY_FLOOR", minimum: 7 }) } });
    expect("recusa" in planejarEdicao(atual, { quantity: 7 } as any, undefined, false)).toBe(false);
  });
});
