// ─────────────────────────────────────────────────────────────────────────────
// PRIORIDADE NA IMPRESSÃO — a ROTA (dono, 08/10).
//
//   POST /api/items/:id/prioridade-na-impressao   { prioritaria: boolean }
//
// O handler real com o banco mockado (o mundo de peças, a transação de
// mentira), conferindo: papel errado 403; corpo inválido 400; etapa errada
// 409 com a frase; lixeira 404; evento encerrado 409 (pedir) e livre
// (retirar); Kit; pedir grava isPriority + trilha + aviso à Gráfica e ao
// admin; retirar grava + trilha, sem aviso; pedir de novo não repete nada;
// outra pessoa mexendo no meio vira 409.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { txDeMentira, type OperacaoDoTx } from "./tx-de-mentira";

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/banco_nunca_acessado";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: {} as Record<string, any>,
  mundo: { itens: {} as Record<string, any> },
  avisos: [] as any[],
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
    requireRole: (...papeis: string[]) => (req: any, res: any, next: any) =>
      (papeis.includes(req.userRole) ? next() : res.status(403).json({ error: "sem permissão" })),
    broadcast: (m: any) => { H.avisos.push(m); },
    createAuditLog: async () => {},
    createAuditLogsEmLote: async () => {},
    updateEventStatus: async () => {},
  };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));

const { registerItemRoutes } = await import("../routes/items");
const { auditLogs, notifications } = await import("@shared/schema");

type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const app: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  app[verbo] = (caminho: string, ...hs: Handler[]) => {
    const chave = `${verbo.toUpperCase()} ${caminho}`;
    if (!rotas.has(chave)) rotas.set(chave, hs);
    return app;
  };
}
registerItemRoutes(app);

const ROTA = "POST /api/items/:id/prioridade-na-impressao";

async function chamar(ctx: { id?: string; body?: any; userRole: string; userKit?: boolean; userId?: string }) {
  const hs = rotas.get(ROTA);
  if (!hs) throw new Error(`Rota não registrada: ${ROTA}`);
  const req: any = { params: { id: ctx.id ?? "p1" }, body: ctx.body ?? {}, query: {}, headers: {}, userRole: ctx.userRole, userKit: ctx.userKit, userId: ctx.userId ?? "u1", userName: "Fulana", session: {} };
  const res: any = { _status: 200, _body: undefined, _pronto: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; res._pronto = true; return res; };
  res.set = () => res; res.setHeader = () => res; res.send = res.json;
  for (const h of hs) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (res._pronto || !seguiu) break;
  }
  return { status: res._status, body: res._body };
}

const peca = (over: Record<string, unknown> = {}) => ({
  id: "p1", displayId: "#6033", eventId: "ev-1", type: "Placa 2x1", description: "Placa da largada",
  quantity: 2, quantityProduced: 0, reuseQty: 0, isReuse: false, isPriority: false, status: "awaiting_final_review",
  deletedAt: null, kitRemessaId: null, criadoPorId: "u9", travadaEm: null,
  ...over,
});

let ops: OperacaoDoTx[];
let eventos: Record<string, any>;
const insercoes = (tabela: unknown) => ops.filter((o) => o.tipo === "insert" && o.tabela === tabela).map((o) => o.valores);

beforeEach(() => {
  H.mundo.itens = {};
  H.avisos.length = 0;
  ops = [];
  eventos = {
    "ev-1": { id: "ev-1", name: "COPA NORTE", status: "created", startDate: "2099-01-10", truckDepartureDate: new Date("2099-01-01T00:00:00Z") },
    "ev-fechado": { id: "ev-fechado", name: "ANTIGO", status: "closed", manuallyClosed: true, startDate: "2099-01-10", truckDepartureDate: new Date("2099-01-01T00:00:00Z") },
  };
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, {
    getItem: vi.fn(async (id: string) => (H.mundo.itens[id] ? { ...H.mundo.itens[id] } : undefined)),
    getEvent: vi.fn(async (id: string) => eventos[id]),
  });
  H.db.transaction = vi.fn(async (fn: any) => fn(txDeMentira(H.mundo, ops)));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("quem pode", () => {
  for (const papel of ["arte", "grafica", "atendimento"]) {
    it(`${papel}: 403, nada muda`, async () => {
      H.mundo.itens.p1 = peca();
      const r = await chamar({ userRole: papel, body: { prioritaria: true } });
      expect(r.status).toBe(403);
      expect(H.mundo.itens.p1.isPriority).toBe(false);
      expect(ops).toEqual([]);
    });
  }
  for (const papel of ["solicitacao", "admin"]) {
    it(`${papel}: pede`, async () => {
      H.mundo.itens.p1 = peca();
      const r = await chamar({ userRole: papel, body: { prioritaria: true } });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(H.mundo.itens.p1.isPriority).toBe(true);
    });
  }

  it("Solicitação da Arena em peça do Kit: 403", async () => {
    H.mundo.itens.p1 = peca({ kitRemessaId: "r1" });
    const r = await chamar({ userRole: "solicitacao", body: { prioritaria: true } });
    expect(r.status).toBe(403);
    expect(H.mundo.itens.p1.isPriority).toBe(false);
  });

  it("usuário do Kit na peça do Kit que criou: pede", async () => {
    H.mundo.itens.p1 = peca({ kitRemessaId: "r1", criadoPorId: "k1" });
    const r = await chamar({ userRole: "solicitacao", userKit: true, userId: "k1", body: { prioritaria: true } });
    expect(r.status).toBe(200);
  });
});

describe("o corpo e a peça", () => {
  it("corpo sem booleano: 400", async () => {
    H.mundo.itens.p1 = peca();
    expect((await chamar({ userRole: "solicitacao", body: {} })).status).toBe(400);
    expect((await chamar({ userRole: "solicitacao", body: { prioritaria: "sim" } })).status).toBe(400);
  });

  it("peça inexistente: 404", async () => {
    expect((await chamar({ id: "nada", userRole: "solicitacao", body: { prioritaria: true } })).status).toBe(404);
  });

  it("peça na lixeira: 404, nada muda", async () => {
    H.mundo.itens.p1 = peca({ deletedAt: new Date("2026-10-01") });
    const r = await chamar({ userRole: "solicitacao", body: { prioritaria: true } });
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("EXCLUIDA");
    expect(ops).toEqual([]);
  });
});

describe("a etapa", () => {
  for (const status of ["awaiting_final_review", "ready_for_production", "approved", "inProduction"]) {
    it(`${status}: aceita`, async () => {
      H.mundo.itens.p1 = peca({ status });
      expect((await chamar({ userRole: "solicitacao", body: { prioritaria: true } })).status).toBe(200);
    });
  }
  for (const status of ["draft", "awaiting_submission", "awaiting_sponsor_approval", "produced", "conferred", "delivered", "canceled"]) {
    it(`${status}: 409 com a frase, nada muda`, async () => {
      H.mundo.itens.p1 = peca({ status });
      const r = await chamar({ userRole: "solicitacao", body: { prioritaria: true } });
      expect(r.status).toBe(409);
      expect(r.body.code).toBe("ETAPA");
      expect(typeof r.body.error).toBe("string");
      expect(H.mundo.itens.p1.isPriority).toBe(false);
      expect(ops).toEqual([]);
    });
  }
  it("molde e reaproveitamento total: 409", async () => {
    H.mundo.itens.p1 = peca({ type: "Molde" });
    expect((await chamar({ userRole: "admin", body: { prioritaria: true } })).body.code).toBe("MOLDE");
    H.mundo.itens.p1 = peca({ isReuse: true });
    expect((await chamar({ userRole: "admin", body: { prioritaria: true } })).body.code).toBe("REAPROVEITAMENTO");
  });
});

describe("evento encerrado", () => {
  it("pedir: 409 EVENT_FINALIZED, nada muda", async () => {
    H.mundo.itens.p1 = peca({ eventId: "ev-fechado" });
    const r = await chamar({ userRole: "solicitacao", body: { prioritaria: true } });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("EVENT_FINALIZED");
    expect(H.mundo.itens.p1.isPriority).toBe(false);
  });
  it("retirar: passa (recuar nunca é barrado)", async () => {
    H.mundo.itens.p1 = peca({ eventId: "ev-fechado", isPriority: true });
    const r = await chamar({ userRole: "solicitacao", body: { prioritaria: false } });
    expect(r.status).toBe(200);
    expect(H.mundo.itens.p1.isPriority).toBe(false);
  });
});

describe("o efeito", () => {
  it("pedir: grava a marca, a trilha e o aviso à Gráfica e ao admin, na mesma transação", async () => {
    H.mundo.itens.p1 = peca({ status: "ready_for_production" });
    const r = await chamar({ userRole: "solicitacao", body: { prioritaria: true } });
    expect(r.status).toBe(200);
    expect(r.body.isPriority).toBe(true);
    const [trilha] = insercoes(auditLogs);
    expect(trilha.details).toBe("Prioridade na impressão pedida por Fulana (etapa: Pronto para Produção) — a peça passa à frente das outras na fila da Gráfica e na de Máquinas");
    expect(trilha.entityId).toBe("p1");
    const [aviso] = insercoes(notifications);
    expect(aviso.type).toBe("itemPriority");
    expect(aviso.targetRoles).toEqual(["grafica", "admin"]);
    expect(aviso.message).toBe("PRIORIDADE NA IMPRESSÃO: #6033 Placa 2x1 — COPA NORTE (pedida por Fulana)");
    expect(aviso.itemId).toBe("p1");
    expect(H.db.transaction).toHaveBeenCalledTimes(1);
    expect(H.avisos.map((m) => m.type)).toEqual(["item_updated", "notification_created"]);
  });

  it("retirar: tira a marca e grava a trilha, sem aviso", async () => {
    H.mundo.itens.p1 = peca({ status: "inProduction", isPriority: true });
    const r = await chamar({ userRole: "solicitacao", body: { prioritaria: false } });
    expect(r.status).toBe(200);
    expect(H.mundo.itens.p1.isPriority).toBe(false);
    expect(insercoes(auditLogs)[0].details).toBe("Prioridade na impressão retirada por Fulana (etapa: Em Impressão)");
    expect(insercoes(notifications)).toEqual([]);
    expect(H.avisos.map((m) => m.type)).toEqual(["item_updated"]);
  });

  it("pedir de novo numa peça já prioritária: responde a peça, sem trilha nem aviso", async () => {
    H.mundo.itens.p1 = peca({ isPriority: true });
    const r = await chamar({ userRole: "solicitacao", body: { prioritaria: true } });
    expect(r.status).toBe(200);
    expect(r.body.isPriority).toBe(true);
    expect(ops).toEqual([]);
  });

  it("outra pessoa mexeu no meio (a peça saiu da impressora): 409, sem trilha", async () => {
    H.mundo.itens.p1 = peca({ status: "inProduction" });
    // O UPDATE condicionado não acha a linha: entre a leitura e o clique a peça foi concluída.
    H.db.transaction = vi.fn(async (fn: any) => {
      H.mundo.itens.p1 = { ...H.mundo.itens.p1, status: "produced" };
      const tx = txDeMentira(H.mundo, ops);
      tx.update = () => ({ set: () => ({ where: () => { const p: any = Promise.resolve([]); p.returning = async () => []; return p; } }) });
      return fn(tx);
    });
    const r = await chamar({ userRole: "solicitacao", body: { prioritaria: true } });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/mudou de etapa/);
    expect(insercoes(auditLogs)).toEqual([]);
    expect(insercoes(notifications)).toEqual([]);
  });
});
