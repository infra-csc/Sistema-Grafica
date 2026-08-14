// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/items/:id/dispense — a dispensa da Arte, que PULA a aprovação e
// joga a peça direto na fila da Gráfica.
//
// Era a única transição do fluxo que fazia isso em silêncio: sem broadcast, sem
// notificação, e respondendo `{success:true}` em vez do item. A peça aparecia na
// Gráfica só no próximo F5, e ninguém do chão de fábrica sabia que ela entrara.
// Estes testes congelam o contrato alinhado com as rotas irmãs.
//
// Mesmo estilo de complemento-rotas.test.ts: os handlers reais rodam; só a
// borda (db, storage, efeitos de ./shared) é mockada.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: { transaction: (async () => {}) as any },
  broadcast: (() => {}) as any,
  createAuditLog: (async () => {}) as any,
  updateEventStatus: (async () => {}) as any,
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
    requireAuth: (_req: any, _res: any, next: any) => next(),
    broadcast: (...a: any[]) => H.broadcast(...a),
    createAuditLog: (...a: any[]) => H.createAuditLog(...a),
    updateEventStatus: (...a: any[]) => H.updateEventStatus(...a),
  };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn() }));

import { registerItemRoutes } from "../routes/items";

const rotas = new Map<string, Array<(req: any, res: any, next: any) => any>>();
const appFalso: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  appFalso[verbo] = (caminho: string, ...hs: any[]) => {
    rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs);
    return appFalso;
  };
}
registerItemRoutes(appFalso);

const DISPENSE = "PATCH /api/items/:id/dispense";

async function chamar(chave: string, ctx: { params?: any; body?: any; userRole?: string; userName?: string } = {}) {
  const handlers = rotas.get(chave);
  if (!handlers) throw new Error(`Rota não registrada: ${chave}`);
  const req: any = {
    params: ctx.params ?? {}, body: ctx.body ?? {}, query: {}, headers: {},
    userRole: ctx.userRole, userName: ctx.userName ?? "Ana da Arte", userId: "u-ana",
    session: { userRole: ctx.userRole },
  };
  const res: any = { _status: 200, _body: undefined, _done: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.set = () => res; res.setHeader = res.set;
  res.json = (b: any) => { res._body = b; res._done = true; return res; };
  res.send = res.json;
  for (const h of handlers) {
    let chamouNext = false;
    await h(req, res, () => { chamouNext = true; });
    if (res._done || !chamouNext) break;
  }
  return { status: res._status, body: res._body };
}

let itens: Record<string, any>;
let broadcasts: any[];
let notificacoes: any[];

const peca = (over: Partial<any> = {}) => ({
  id: "i-1", displayId: "#0062", eventId: "ev-1",
  type: "Pórtico 6x3", status: "awaiting_creator_review", quantity: 4,
  deletedAt: null, ...over,
});

beforeEach(() => {
  itens = { "i-1": peca() };
  broadcasts = [];
  notificacoes = [];

  H.broadcast = vi.fn((m: any) => { broadcasts.push(m); });
  H.createAuditLog = vi.fn(async () => {});

  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getItem = vi.fn(async (id: string) => itens[id]);
  s.getEvent = vi.fn(async (id: string) => (id === "ev-1" ? { id: "ev-1", name: "COPA NORTE 2026" } : undefined));
  s.updateItem = vi.fn(async (id: string, patch: any) => {
    itens[id] = { ...itens[id], ...patch };
    return itens[id];
  });
  s.createNotification = vi.fn(async (n: any) => {
    const linha = { id: `notif-${notificacoes.length + 1}`, ...n };
    notificacoes.push(linha);
    return linha;
  });
});


/**
 * O 1º argumento de createAuditLog é o ATOR (o próprio `req`), não mais um nome
 * solto: a linha grava userName E userId — o id é o que resiste a nome trocado
 * ou repetido. Espelha resolveActor() de server/routes/shared.ts.
 */
const atorDe = (a: any): { userName: string; userId: string | null } =>
  typeof a === "string"
    ? { userName: a.trim() || "Sistema", userId: null }
    : { userName: String(a?.userName ?? "").trim() || "Sistema", userId: a?.userId ?? null };

const dispensar = (over: any = {}) =>
  chamar(DISPENSE, { params: { id: "i-1" }, userRole: "arte", ...over });

describe("gates que continuam de pé", () => {
  it("só Arte e admin dispensam", async () => {
    for (const papel of ["grafica", "solicitacao", "atendimento"]) {
      const r = await dispensar({ userRole: papel });
      expect(r.status, `papel ${papel}`).toBe(403);
    }
    expect(H.storage.updateItem).not.toHaveBeenCalled();
  });

  it("404 para peça inexistente", async () => {
    const r = await chamar(DISPENSE, { params: { id: "nao-existe" }, userRole: "arte" });
    expect(r.status).toBe(404);
  });

  it("409 num status que não permite dispensa (a peça já está em produção)", async () => {
    itens["i-1"] = peca({ status: "inProduction" });
    const r = await dispensar();
    expect(r.status).toBe(409);
    expect(H.storage.updateItem).not.toHaveBeenCalled();
  });
});

describe("o contrato alinhado com as rotas irmãs", () => {
  it("responde O ITEM atualizado, não `{success:true}`", async () => {
    const r = await dispensar();
    expect(r.status).toBe(200);
    // O cliente precisa ler o novo status sem outro round-trip.
    expect(r.body).toMatchObject({ id: "i-1", displayId: "#0062", status: "ready_for_production" });
    expect(r.body.success).toBeUndefined();
  });

  it("emite item_updated — sem ele a Gráfica só via a peça no próximo F5", async () => {
    await dispensar();
    const evento = broadcasts.find((b) => b.type === "item_updated");
    expect(evento).toBeDefined();
    expect(evento.item).toMatchObject({ id: "i-1", status: "ready_for_production" });
  });

  it("notifica o papel grafica com o texto pedido, e avisa pelo sino", async () => {
    await dispensar();
    expect(notificacoes).toHaveLength(1);
    const n = notificacoes[0];
    expect(n.targetRoles).toEqual(["grafica"]);
    expect(n.message).toBe("Peça liberada sem aprovação: Pórtico 6x3 — COPA NORTE 2026");
    expect(n.itemId).toBe("i-1");
    expect(n.eventId).toBe("ev-1");
    expect(broadcasts.map((b) => b.type)).toContain("notification_created");
  });

  it("evento ausente não quebra a mensagem nem a rota", async () => {
    itens["i-1"] = peca({ eventId: "ev-fantasma" });
    const r = await dispensar();
    expect(r.status).toBe(200);
    expect(notificacoes[0].message).toBe("Peça liberada sem aprovação: Pórtico 6x3");
  });

  it("o audit log da dispensa continua, com status anterior e motivo", async () => {
    await dispensar({ body: { reason: "cliente aprovou por WhatsApp" } });
    expect(H.createAuditLog).toHaveBeenCalled();
    const [autor, acao, entidade, id, detalhe] = (H.createAuditLog as any).mock.calls[0];
    expect(atorDe(autor)).toEqual({ userName: "Ana da Arte", userId: "u-ana" });
    expect(acao).toBe("dispensed");
    expect(entidade).toBe("item");
    expect(id).toBe("i-1");
    expect(detalhe).toContain("awaiting_creator_review");
    expect(detalhe).toContain("cliente aprovou por WhatsApp");
  });
});
