// ─────────────────────────────────────────────────────────────────────────────
// "EXCLUIR" EVENTO OU PATROCINADOR = ARQUIVAR.
//
// O DELETE da linha levava em cascata peças, aprovações, impressões e tubos —
// sem volta. Agora as rotas de exclusão ARQUIVAM (mesmo contrato para as
// telas), POST /restaurar desfaz, e o arquivado não aceita escrita.
// Rotas reais, com storage e banco de mentira.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/banco_nunca_acessado";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  broadcast: (() => {}) as any,
  createAuditLog: (async () => {}) as any,
}));

vi.mock("../db", () => {
  const consulta = () => {
    const q: any = {
      from: () => q, leftJoin: () => q, innerJoin: () => q, where: () => q, orderBy: () => q, limit: () => q,
      then: (ok: any, falha: any) => Promise.resolve([]).then(ok, falha),
    };
    return q;
  };
  // Nenhum caminho destas rotas pode apagar linha: `delete` explode.
  const apagar = () => { throw new Error("DELETE físico não é permitido"); };
  return { db: { select: consulta, delete: apagar, transaction: async () => {} }, pool: {} };
});
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real,
    requireAuth: (_req: any, _res: any, next: any) => next(),
    // O gate de papel do admin roda de verdade (é parte do comportamento).
    requireAdmin: (req: any, res: any, next: any) => (req.userRole === "admin" ? next() : res.status(403).json({ error: "Acesso negado" })),
    requireRole: () => (_req: any, _res: any, next: any) => next(),
    broadcast: (...a: any[]) => H.broadcast(...a),
    createAuditLog: (...a: any[]) => H.createAuditLog(...a),
    updateEventStatus: async () => {},
  };
});
vi.mock("../cache", () => ({ eventsCache: null, setEventsCache: vi.fn(), eventsCacheGeneration: () => 0, EVENTS_CACHE_TTL_MS: 1, invalidateEventsCache: vi.fn(), invalidateAllCaches: vi.fn(), registrarCache: vi.fn(), invalidarCacheNoCluster: vi.fn() }));
vi.mock("../services/prioridadeAutomatica", () => ({ aplicarPrioridadeAutomatica: vi.fn(async () => {}) }));
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));
vi.mock("../services/consultaDeEstoqueNaLiberacao", () => ({
  respostaDoEstoqueParaLiberar: vi.fn(async () => null),
  marcarRespostaAplicada: vi.fn(async () => {}),
}));

const { registerEventRoutes } = await import("../routes/events");
const { registerSponsorRoutes } = await import("../routes/sponsors");
const { motivoEventoFechado, erroEventoFechado, barraEventoFinalizado } = await import("../routes/eventoFinalizado");
const { EVENTO_ARQUIVADO_ERRO, PATROCINADOR_ARQUIVADO_ERRO } = await import("../services/arquivamento");

type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const appFalso: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  appFalso[verbo] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs); return appFalso; };
}
registerEventRoutes(appFalso);
registerSponsorRoutes(appFalso);

async function chamar(chave: string, ctx: { params?: any; body?: any; userRole?: string } = {}) {
  const handlers = rotas.get(chave);
  if (!handlers) throw new Error(`Rota não registrada: ${chave}`);
  const req: any = {
    params: ctx.params ?? {}, body: ctx.body ?? {}, query: {}, headers: {},
    userRole: ctx.userRole ?? "admin", userId: "u1", userKit: false, userName: "Maria", session: {},
  };
  const res: any = { _status: 200, _body: undefined, _done: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; res._done = true; return res; };
  res.set = () => res; res.setHeader = () => res; res.send = res.json; res.get = () => undefined;
  for (const h of handlers) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (res._done || !seguiu) break;
  }
  return { status: res._status, body: res._body };
}

const ARQUIVADO_EM = new Date("2026-09-20T12:00:00Z");
let eventos: Record<string, any>;
let patrocinadores: Record<string, any>;
let pecas: any[];
let trilha: string[];
let sinais: any[];

beforeEach(() => {
  eventos = {
    "ev-1": { id: "ev-1", name: "COPA NORTE", status: "created", startDate: new Date("2099-03-10T08:00:00Z"), truckDepartureDate: new Date("2099-03-01T11:00:00Z"), arquivadoEm: null },
    "ev-arq": { id: "ev-arq", name: "COPA ANTIGA", status: "created", startDate: new Date("2099-03-10T08:00:00Z"), truckDepartureDate: new Date("2099-03-01T11:00:00Z"), arquivadoEm: ARQUIVADO_EM, arquivadoPor: "Ana" },
  };
  patrocinadores = {
    "sp-1": { id: "sp-1", name: "Marca Viva", arquivadoEm: null },
    "sp-arq": { id: "sp-arq", name: "Marca Arquivada", arquivadoEm: ARQUIVADO_EM },
  };
  pecas = [
    { id: "p1", displayId: "#0001", eventId: "ev-1", status: "delivered" },
    { id: "p2", displayId: "#0002", eventId: "ev-1", status: "draft" },
  ];
  trilha = [];
  sinais = [];
  H.broadcast = vi.fn((m: any) => { sinais.push(m); });
  H.createAuditLog = vi.fn(async (_u: any, _a: string, _t: string, _id: string, det: string) => { trilha.push(det); });
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getEvent = vi.fn(async (id: string) => eventos[id]);
  s.getItemsByEvent = vi.fn(async (id: string) => (eventos[id]?.arquivadoEm ? [] : pecas.filter((p) => p.eventId === id)));
  s.updateEvent = vi.fn(async (id: string, d: any) => (eventos[id] = { ...eventos[id], ...d }));
  s.arquivarEvento = vi.fn(async (id: string, por: string | null) => {
    if (!eventos[id] || eventos[id].arquivadoEm) return undefined;
    return (eventos[id] = { ...eventos[id], arquivadoEm: new Date(), arquivadoPor: por });
  });
  s.restaurarEvento = vi.fn(async (id: string) => {
    if (!eventos[id]?.arquivadoEm) return undefined;
    return (eventos[id] = { ...eventos[id], arquivadoEm: null, arquivadoPor: null, restauradoEm: new Date() });
  });
  s.getSponsor = vi.fn(async (id: string) => patrocinadores[id]);
  s.getSponsorsAtivos = vi.fn(async () => Object.values(patrocinadores).filter((p: any) => !p.arquivadoEm));
  s.getAllSponsors = vi.fn(async () => Object.values(patrocinadores));
  s.updateSponsor = vi.fn(async (id: string, d: any) => (patrocinadores[id] = { ...patrocinadores[id], ...d }));
  s.arquivarPatrocinador = vi.fn(async (id: string, por: string | null) => {
    if (!patrocinadores[id] || patrocinadores[id].arquivadoEm) return undefined;
    return (patrocinadores[id] = { ...patrocinadores[id], arquivadoEm: new Date(), arquivadoPor: por });
  });
  s.restaurarPatrocinador = vi.fn(async (id: string) => {
    if (!patrocinadores[id]?.arquivadoEm) return undefined;
    return (patrocinadores[id] = { ...patrocinadores[id], arquivadoEm: null, arquivadoPor: null });
  });
  s.addSponsorToEvent = vi.fn(async (v: any) => ({ id: "es-1", ...v }));
  s.updateEventSponsorQuota = vi.fn(async () => {});
  s.upsertEventQuotaRule = vi.fn(async () => ({}));
  s.getItem = vi.fn(async (id: string) => ({ id, displayId: "#0009", eventId: "ev-1", status: "awaiting_linking", type: "Pórtico", deletedAt: null }));
  s.getItemSponsors = vi.fn(async () => [{ sponsorId: "sp-1" }]);
  s.bulkSyncItemSponsors = vi.fn(async () => {});
  s.addSponsorToItem = vi.fn(async (v: any) => ({ id: "is-1", ...v }));
});

describe("DELETE /api/events/:id arquiva — nada é apagado", () => {
  it("admin: marca o arquivamento com quem fez, mesma resposta de antes, e avisa as telas", async () => {
    const r = await chamar("DELETE /api/events/:id", { params: { id: "ev-1" } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, deletedItems: 2, deliveredItems: 1 });
    expect(H.storage.arquivarEvento).toHaveBeenCalledWith("ev-1", "Maria");
    expect(eventos["ev-1"].arquivadoEm).toBeInstanceOf(Date);
    expect(trilha[0]).toContain('Evento "COPA NORTE" arquivado');
    expect(trilha[0]).toContain("Nada foi apagado");
    // O evento some das abas e a lista de peças é revalidada (o delta derruba as peças).
    expect(sinais).toContainEqual({ type: "event_deleted", eventId: "ev-1" });
    expect(sinais).toContainEqual({ type: "items_bulk_updated", itemIds: ["p1", "p2"], eventId: "ev-1" });
  });

  it("só o admin arquiva", async () => {
    const r = await chamar("DELETE /api/events/:id", { params: { id: "ev-1" }, userRole: "solicitacao" });
    expect(r.status).toBe(403);
    expect(H.storage.arquivarEvento).not.toHaveBeenCalled();
  });

  it("arquivado de novo = não encontrado (não regrava quem/quando)", async () => {
    const r = await chamar("DELETE /api/events/:id", { params: { id: "ev-arq" } });
    expect(r.status).toBe(404);
    expect(H.storage.arquivarEvento).not.toHaveBeenCalled();
    expect(eventos["ev-arq"].arquivadoPor).toBe("Ana");
  });
});

describe("POST /api/events/:id/restaurar", () => {
  it("admin restaura; as telas recarregam o evento e as peças", async () => {
    pecas.push({ id: "p9", displayId: "#0009", eventId: "ev-arq", status: "draft" });
    const r = await chamar("POST /api/events/:id/restaurar", { params: { id: "ev-arq" } });
    expect(r.status).toBe(200);
    expect(eventos["ev-arq"].arquivadoEm).toBeNull();
    expect(eventos["ev-arq"].restauradoEm).toBeInstanceOf(Date);
    expect(r.body).toMatchObject({ success: true, items: 1 });
    expect(trilha[0]).toContain('Evento "COPA ANTIGA" restaurado do arquivo');
    expect(sinais.map((m) => m.type)).toEqual(["event_updated", "items_bulk_updated"]);
  });

  it("não arquivado → 409; outro papel → 403; inexistente → 404", async () => {
    expect((await chamar("POST /api/events/:id/restaurar", { params: { id: "ev-1" } })).status).toBe(409);
    expect((await chamar("POST /api/events/:id/restaurar", { params: { id: "ev-arq" }, userRole: "solicitacao" })).status).toBe(403);
    expect((await chamar("POST /api/events/:id/restaurar", { params: { id: "nada" } })).status).toBe(404);
    expect(eventos["ev-arq"].arquivadoEm).toBe(ARQUIVADO_EM);
  });
});

describe("evento arquivado não aceita escrita nem aparece", () => {
  const casos: Array<[string, any]> = [
    ["PATCH /api/events/:id", { name: "Outro nome" }],
    ["PATCH /api/events/:id/priority", { priority: "alta" }],
    ["POST /api/events/:id/close", {}],
    ["POST /api/events/:id/reopen", {}],
    ["PUT /api/events/:id/quota-rules", { quota: "MASTER", itemTypes: ["Pórtico"] }],
    ["POST /api/events/:id/sponsors", { sponsorId: "sp-1" }],
  ];
  for (const [rota, body] of casos) {
    it(`${rota} → 409 com a frase de restaurar`, async () => {
      const r = await chamar(rota, { params: { id: "ev-arq" }, body });
      expect(r.status).toBe(409);
      expect(r.body.error).toBe(EVENTO_ARQUIVADO_ERRO);
      expect(H.storage.updateEvent).not.toHaveBeenCalled();
      expect(H.storage.addSponsorToEvent).not.toHaveBeenCalled();
      expect(H.storage.upsertEventQuotaRule).not.toHaveBeenCalled();
    });
  }

  it("enviar rascunhos do evento arquivado → 409 (guarda de evento finalizado)", async () => {
    const r = await chamar("POST /api/events/:id/items/submit", { params: { id: "ev-arq" }, userRole: "admin" });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: EVENTO_ARQUIVADO_ERRO, reason: "arquivado" });
  });

  it("GET /api/events/:id do arquivado → 404", async () => {
    H.storage.getEventSponsors = vi.fn(async () => []);
    const r = await chamar("GET /api/events/:id", { params: { id: "ev-arq" } });
    expect(r.status).toBe(404);
  });

  it("a guarda das peças barra qualquer escrita em peça de evento arquivado", async () => {
    expect(motivoEventoFechado(eventos["ev-arq"])).toBe("arquivado");
    expect(erroEventoFechado("arquivado")).toBe("Evento arquivado — restaure antes de mexer.");
    const res: any = { status: vi.fn(() => res), json: vi.fn(() => res) };
    expect(await barraEventoFinalizado({ eventId: "ev-arq" }, res)).toBe(true);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(await barraEventoFinalizado({ eventId: "ev-1" }, { status: vi.fn() })).toBe(false);
  });
});

describe("patrocinador: arquivar em vez de apagar", () => {
  it("DELETE arquiva (admin) e a lista de escolha deixa de trazê-lo", async () => {
    const r = await chamar("DELETE /api/sponsors/:id", { params: { id: "sp-1" } });
    expect(r.status).toBe(200);
    expect(r.body.message).toContain("arquivado");
    expect(H.storage.arquivarPatrocinador).toHaveBeenCalledWith("sp-1", "Maria");
    expect(trilha[0]).toContain("vínculos e aprovações ficam no histórico");
    expect(sinais).toContainEqual({ type: "sponsor_deleted", sponsorId: "sp-1" });
    const lista = await chamar("GET /api/sponsors");
    expect(lista.body).toEqual([]);
  });

  it("só o admin arquiva; restaurar devolve à lista", async () => {
    expect((await chamar("DELETE /api/sponsors/:id", { params: { id: "sp-1" }, userRole: "atendimento" })).status).toBe(403);
    const r = await chamar("POST /api/sponsors/:id/restaurar", { params: { id: "sp-arq" } });
    expect(r.status).toBe(200);
    expect(patrocinadores["sp-arq"].arquivadoEm).toBeNull();
    const lista = await chamar("GET /api/sponsors");
    expect(lista.body.map((p: any) => p.id).sort()).toEqual(["sp-1", "sp-arq"]);
    expect((await chamar("POST /api/sponsors/:id/restaurar", { params: { id: "sp-1" } })).status).toBe(409);
  });

  it("arquivado não se edita nem ganha vínculo novo", async () => {
    const editar = await chamar("PATCH /api/sponsors/:id", { params: { id: "sp-arq" }, body: { name: "Novo" }, userRole: "atendimento" });
    expect(editar.status).toBe(409);
    expect(editar.body.error).toBe(PATROCINADOR_ARQUIVADO_ERRO);
    expect(H.storage.updateSponsor).not.toHaveBeenCalled();

    const noEvento = await chamar("POST /api/events/:id/sponsors", { params: { id: "ev-1" }, body: { sponsorId: "sp-arq" } });
    expect(noEvento.status).toBe(409);
    expect(H.storage.addSponsorToEvent).not.toHaveBeenCalled();

    const naPeca = await chamar("POST /api/items/:id/sponsors", { params: { id: "p9" }, body: { sponsorId: "sp-arq" } });
    expect(naPeca.status).toBe(409);
    expect(H.storage.addSponsorToItem).not.toHaveBeenCalled();

    const emLote = await chamar("POST /api/items/bulk-add-sponsor", { body: { sponsorId: "sp-arq", itemIds: ["p9"] } });
    expect(emLote.status).toBe(409);
  });

  it("sync: acrescentar o arquivado é recusado; mantê-lo onde já estava, não", async () => {
    const novo = await chamar("POST /api/items/:id/sponsors/sync", { params: { id: "p9" }, body: { sponsorIds: ["sp-1", "sp-arq"] } });
    expect(novo.status).toBe(409);
    expect(novo.body.error).toContain("Marca Arquivada");
    expect(H.storage.bulkSyncItemSponsors).not.toHaveBeenCalled();

    H.storage.getItemSponsors = vi.fn(async () => [{ sponsorId: "sp-1" }, { sponsorId: "sp-arq" }]);
    const mantido = await chamar("POST /api/items/:id/sponsors/sync", { params: { id: "p9" }, body: { sponsorIds: ["sp-1", "sp-arq"] } });
    expect(mantido.body?.error ?? "").not.toContain(PATROCINADOR_ARQUIVADO_ERRO);
  });
});
