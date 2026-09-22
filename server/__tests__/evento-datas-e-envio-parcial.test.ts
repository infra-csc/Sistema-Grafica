// ─────────────────────────────────────────────────────────────────────────────
// EVENTO: a data de evento finalizado e o envio de rascunhos com falha parcial.
//
//   · quem não é admin não muda a data de um evento que já aconteceu (ou foi
//     encerrado) — mudar a data o "reabriria" por baixo, e reabrir é do admin;
//     o formulário que manda a MESMA data continua passando;
//   · envio de rascunhos: as peças que passaram ganham trilha e aviso, e a
//     resposta nomeia as que não foram (antes: 409 e silêncio sobre as que
//     tinham ido);
//   · os catch das rotas de evento não devolvem `error.message` cru.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/banco_nunca_acessado";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  broadcast: (() => {}) as any,
  createAuditLog: (async () => {}) as any,
}));

vi.mock("../db", () => ({ db: {}, pool: {} }));
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
  };
});
vi.mock("../services/prioridadeAutomatica", () => ({ aplicarPrioridadeAutomatica: vi.fn(async () => {}) }));

const { registerEventRoutes } = await import("../routes/events");

type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const appFalso: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  appFalso[verbo] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs); return appFalso; };
}
registerEventRoutes(appFalso);

async function chamar(chave: string, ctx: { params?: any; body?: any; userRole?: string } = {}) {
  const handlers = rotas.get(chave)!;
  const req: any = { params: ctx.params ?? {}, body: ctx.body ?? {}, query: {}, headers: {}, userRole: ctx.userRole, userId: "u1", userName: "Maria", session: {} };
  const res: any = { _status: 200, _body: undefined, _done: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; res._done = true; return res; };
  res.set = () => res; res.setHeader = () => res; res.send = res.json;
  for (const h of handlers) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (res._done || !seguiu) break;
  }
  return { status: res._status, body: res._body };
}

let banco: Record<string, any>;
let pecas: any[];
let trilha: string[];
let avisos: any[];
beforeEach(() => {
  banco = {
    // Já aconteceu (a data passou) — "realizado".
    "ev-velho": { id: "ev-velho", name: "COPA 2020", status: "created", startDate: new Date("2020-03-10T08:00:00Z"), truckDepartureDate: new Date("2020-03-01T11:00:00Z") },
    "ev-1": { id: "ev-1", name: "COPA", status: "created", startDate: new Date("2099-03-10T08:00:00Z"), truckDepartureDate: new Date("2099-03-01T11:00:00Z") },
  };
  pecas = [];
  trilha = [];
  avisos = [];
  H.broadcast = vi.fn();
  H.createAuditLog = vi.fn(async (_u: any, _a: string, _t: string, _id: string, det: string) => { trilha.push(det); });
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getEvent = vi.fn(async (id: string) => banco[id]);
  s.updateEvent = vi.fn(async (id: string, dados: any) => (banco[id] = { ...banco[id], ...dados }));
  s.getItemsByEvent = vi.fn(async () => pecas);
  s.createNotification = vi.fn(async (n: any) => { avisos.push(n); return n; });
});

describe("a data do evento que já acabou", () => {
  it("Solicitação não empurra a data de evento realizado — 409 com code/reason", async () => {
    const r = await chamar("PATCH /api/events/:id", { params: { id: "ev-velho" }, userRole: "solicitacao", body: { startDate: "2099-03-10T08:00" } });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "EVENT_FINALIZED", reason: "realizado" });
    expect(r.body.error).toBe("Este evento já aconteceu — só o admin muda a data dele (reabrindo o evento).");
    expect(new Date(banco["ev-velho"].startDate).getUTCFullYear()).toBe(2020);
  });

  it("o formulário com a MESMA data passa (edita outro campo)", async () => {
    const r = await chamar("PATCH /api/events/:id", { params: { id: "ev-velho" }, userRole: "solicitacao", body: { startDate: "2020-03-10T08:00", name: "COPA 2020 (ok)" } });
    expect(r.status).toBe(200);
    expect(banco["ev-velho"].name).toBe("COPA 2020 (ok)");
  });

  it("o admin muda", async () => {
    const r = await chamar("PATCH /api/events/:id", { params: { id: "ev-velho" }, userRole: "admin", body: { startDate: "2099-03-10T08:00" } });
    expect(r.status).toBe(200);
  });

  it("evento em jogo: a Solicitação muda a data como sempre", async () => {
    const r = await chamar("PATCH /api/events/:id", { params: { id: "ev-1" }, userRole: "solicitacao", body: { startDate: "2099-03-12T08:00" } });
    expect(r.status).toBe(200);
  });
});

describe("envio de rascunhos com falha parcial", () => {
  beforeEach(() => {
    pecas = [
      { id: "a", displayId: "#0001", status: "draft", type: "Pórtico", eventId: "ev-1" },
      { id: "b", displayId: "#0002", status: "draft", type: "Pórtico", eventId: "ev-1" },
      { id: "c", displayId: "#0003", status: "draft", type: "Pórtico", eventId: "ev-1" },
    ];
  });

  it("as que passaram ganham trilha e aviso; a resposta nomeia as que ficaram", async () => {
    // A #0002 mudou de status no meio (outra pessoa mexeu): volta null.
    H.storage.updateItemWithStatusCheck = vi.fn(async (id: string, _de: string, para: string) => (id === "b" ? null : { ...pecas.find((p) => p.id === id), status: para }));
    const r = await chamar("POST /api/events/:id/items/submit", { params: { id: "ev-1" }, userRole: "solicitacao" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ count: 2, failedCount: 1, falharam: ["#0002"] });
    expect(trilha.join(" ")).toContain("2 itens: Status alterado de Rascunho → Aguardando Vinculação");
    expect(trilha.join(" ")).toContain("1 não foi (mudaram de status durante o envio): #0002");
    expect(avisos).toHaveLength(1);
    expect(H.broadcast).toHaveBeenCalledWith(expect.objectContaining({ type: "items_submitted", count: 2 }));
  });

  it("nenhuma passou: 409 dizendo quais", async () => {
    H.storage.updateItemWithStatusCheck = vi.fn(async () => null);
    const r = await chamar("POST /api/events/:id/items/submit", { params: { id: "ev-1" }, userRole: "admin" });
    expect(r.status).toBe(409);
    expect(r.body.falharam).toEqual(["#0001", "#0002", "#0003"]);
    expect(avisos).toHaveLength(0);
  });

  it("aviso que falha não derruba o envio", async () => {
    H.storage.updateItemWithStatusCheck = vi.fn(async (id: string, _de: string, para: string) => ({ ...pecas.find((p) => p.id === id), status: para }));
    H.storage.createNotification = vi.fn(async () => { throw new Error("fora do ar"); });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await chamar("POST /api/events/:id/items/submit", { params: { id: "ev-1" }, userRole: "admin" });
    log.mockRestore();
    expect(r.status).toBe(200);
    expect(r.body.count).toBe(3);
  });
});

describe("erros das rotas de evento", () => {
  it("falha interna vira 500 sem a mensagem do banco", async () => {
    H.storage.getEvent = vi.fn(async () => { throw new Error('connection terminated: password authentication failed for user "neondb"'); });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await chamar("POST /api/events/:id/items/submit", { params: { id: "ev-1" }, userRole: "admin" });
    log.mockRestore();
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("neondb");
  });

  it("validação do PATCH vira frase em português", async () => {
    const r = await chamar("PATCH /api/events/:id", { params: { id: "ev-1" }, userRole: "admin", body: { name: 42 } });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Campo Nome: valor inválido");
  });
});
