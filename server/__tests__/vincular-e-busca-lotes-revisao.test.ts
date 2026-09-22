// ─────────────────────────────────────────────────────────────────────────────
// BUSCA DE ARTE E VINCULAÇÃO — regras e respostas das rotas (revisão 22/09).
//
//   7. a busca de arte já feita tira cancelada, rascunho e reprovada, e diz
//      no cartão se a arte foi aprovada (por quem e quando);
//   9. send-to-arte devolve o motivo POR PEÇA (`falhas`), para a tela
//      escrever na linha certa;
//  11. return-to-creation diz quantos vínculos apagou e que o thumb fica;
//  14. sponsors/sync recusa patrocinador inexistente e a trilha conta só os
//      válidos;
//  15. mensagens humanas: "Peça não encontrada.", status traduzido e 500
//      sem vazar o erro técnico.
// Rotas reais, com banco e storage de mentira.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  filas: [] as any[][],
  storage: {} as Record<string, any>,
  createAuditLog: (async () => {}) as any,
}));

vi.mock("../db", () => {
  // Cadeia do drizzle: cada SELECT consome a próxima resposta enfileirada.
  const consulta = () => {
    const q: any = {
      from: () => q, leftJoin: () => q, where: () => q, orderBy: () => q, limit: () => q,
      then: (ok: any, falha: any) => Promise.resolve(H.filas.shift() ?? []).then(ok, falha),
    };
    return q;
  };
  return { db: { select: consulta, transaction: async () => {} }, pool: {} };
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
    requireAdmin: (_req: any, _res: any, next: any) => next(),
    requireRole: () => (_req: any, _res: any, next: any) => next(),
    broadcast: () => {},
    createAuditLog: (...a: any[]) => H.createAuditLog(...a),
    updateEventStatus: async () => {},
  };
});
vi.mock("../cache", () => ({ eventsCache: null, setEventsCache: vi.fn(), invalidateEventsCache: vi.fn(), invalidateAllCaches: vi.fn() }));
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));
vi.mock("../services/consultaDeEstoqueNaLiberacao", () => ({
  respostaDoEstoqueParaLiberar: vi.fn(async () => null),
  marcarRespostaAplicada: vi.fn(async () => {}),
}));

import { arteForaDaBusca, aprovacaoDaArte, STATUS_FORA_DA_BUSCA_DE_ARTE } from "@shared/artes-parecidas";
import { registerArtesBuscaRoutes } from "../routes/artes-busca";
import { registerSponsorRoutes } from "../routes/sponsors";

type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const appFalso: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  appFalso[verbo] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs); return appFalso; };
}
registerArtesBuscaRoutes(appFalso);
registerSponsorRoutes(appFalso);

async function chamar(chave: string, ctx: { params?: any; body?: any; query?: any } = {}) {
  const handlers = rotas.get(chave);
  if (!handlers) throw new Error(`Rota não registrada: ${chave}`);
  const req: any = {
    params: ctx.params ?? {}, body: ctx.body ?? {}, query: ctx.query ?? {}, headers: {},
    userRole: "arte", userId: "u1", userKit: false, userName: "Maria", session: {},
  };
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

// ═════════════════════════════════════════════════════════════════════════════
// 7 · a régua pura
// ═════════════════════════════════════════════════════════════════════════════
describe("7 · o que fica fora da busca de arte", () => {
  it("cancelada, arquivada, apagada e rascunho ficam fora (qualquer caixa)", () => {
    for (const status of STATUS_FORA_DA_BUSCA_DE_ARTE) expect(arteForaDaBusca({ status })).toBe(true);
    expect(arteForaDaBusca({ status: "Canceled" })).toBe(true);
    expect(arteForaDaBusca({ status: "delivered" })).toBe(false);
  });

  it("reprovação em aberto na peça tira a arte", () => {
    expect(arteForaDaBusca({ status: "awaiting_submission", rejectedBySponsor: true })).toBe(true);
    expect(arteForaDaBusca({ status: "awaiting_submission", rejectedByCreator: true })).toBe(true);
  });

  it("linha de patrocinador reprovada tira a arte — se falar do thumb que está lá", () => {
    const peca = { status: "sponsor_approved", thumbUrl: "/objects/nova" };
    expect(arteForaDaBusca(peca, [{ status: "rejected", decidedThumbUrl: "/objects/nova" }])).toBe(true);
    expect(arteForaDaBusca(peca, [{ status: "rejected", decidedThumbUrl: null }])).toBe(true);
    // Reprovou a arte ANTERIOR; a atual é outra.
    expect(arteForaDaBusca(peca, [{ status: "rejected", decidedThumbUrl: "/objects/velha" }])).toBe(false);
  });
});

describe("7 · aprovada, por quem e quando", () => {
  it("todas as linhas aprovadas sobre o thumb atual → aprovada, com nomes e a última data", () => {
    const r = aprovacaoDaArte({ thumbUrl: "/objects/a" }, [
      { status: "approved", approvedBy: "Ana", approvedAt: "2026-09-01T10:00:00Z", decidedThumbUrl: "/objects/a" },
      { status: "approved", approvedBy: "Bia", approvedAt: "2026-09-03T10:00:00Z" },
    ]);
    expect(r).toEqual({ aprovada: true, aprovadaPor: "Ana, Bia", aprovadaEm: "2026-09-03T10:00:00.000Z" });
  });

  it("uma pendente basta para não estar aprovada", () => {
    expect(aprovacaoDaArte({}, [{ status: "approved" }, { status: "pending" }]).aprovada).toBe(false);
  });

  it("aprovação de outra arte não vale para a atual", () => {
    expect(aprovacaoDaArte({ thumbUrl: "/objects/b" }, [{ status: "approved", decidedThumbUrl: "/objects/a" }]).aprovada).toBe(false);
  });

  it("sem linhas, vale o carimbo da peça", () => {
    expect(aprovacaoDaArte({ sponsorApprovedBy: "Caio", sponsorApprovedAt: new Date("2026-08-20T12:00:00Z") }))
      .toEqual({ aprovada: true, aprovadaPor: "Caio", aprovadaEm: "2026-08-20T12:00:00.000Z" });
    expect(aprovacaoDaArte({})).toEqual({ aprovada: false, aprovadaPor: null, aprovadaEm: null });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7 · a rota
// ═════════════════════════════════════════════════════════════════════════════
const linha = (id: string, mudanca: any = {}) => ({
  id, displayId: `#${id}`, tipo: "2x1", descricao: "portico",
  thumbUrl: `/objects/${id}`, previewUrl: null, arquivoFinalUrl: null, arquivoFinalNome: null,
  kitRemessaId: null, criadoPorId: "u1", fileWidth: "2.00", fileHeight: "1.00",
  eventId: `ev-${id}`, eventName: "Circuito das Estações 2026 São Paulo", eventInicio: new Date("2026-01-01T00:00:00Z"),
  status: "delivered", rejectedBySponsor: false, rejectedByCreator: false, sponsorApprovedBy: null, sponsorApprovedAt: null,
  ...mudanca,
});

describe("7 · GET /api/artes/busca", () => {
  beforeEach(() => { H.filas = []; });

  it("tira cancelada, rascunho e reprovada; marca a aprovada com quem e quando", async () => {
    // Sem `q`: alvo → mesmo patrocinador → recentes → vínculos → decisões.
    H.filas = [
      [linha("alvo")],
      [],
      [
        linha("cancelada", { status: "canceled" }),
        linha("rascunho", { status: "draft" }),
        linha("reprovadaNaPeca", { rejectedBySponsor: true }),
        linha("reprovadaNaLinha"),
        linha("aprovada"),
        linha("semDecisao"),
      ],
      [],
      [
        { itemId: "reprovadaNaLinha", status: "rejected", approvedBy: null, approvedAt: null, decidedThumbUrl: "/objects/reprovadaNaLinha" },
        { itemId: "aprovada", status: "approved", approvedBy: "Karina", approvedAt: new Date("2026-09-10T15:00:00Z"), decidedThumbUrl: null },
      ],
    ];
    const r = await chamar("GET /api/artes/busca", { query: { item: "alvo" } });
    expect(r.status).toBe(200);
    const ids = r.body.artes.map((a: any) => a.id).sort();
    expect(ids).toEqual(["aprovada", "semDecisao"]);
    const aprovada = r.body.artes.find((a: any) => a.id === "aprovada");
    expect(aprovada).toMatchObject({ aprovada: true, aprovadaPor: "Karina", aprovadaEm: "2026-09-10T15:00:00.000Z" });
    expect(r.body.artes.find((a: any) => a.id === "semDecisao")).toMatchObject({ aprovada: false, aprovadaPor: null, aprovadaEm: null });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9, 11, 14, 15 · rotas de sponsors.ts
// ═════════════════════════════════════════════════════════════════════════════
let itens: Record<string, any>;
const EVENTO = { id: "ev-1", name: "COPA NORTE", status: "created", startDate: "2099-01-10", truckDepartureDate: new Date("2099-01-01T00:00:00Z") };
const peca = (over: any = {}) => ({
  id: "p1", displayId: "#0500", eventId: "ev-1", type: "Pórtico", status: "awaiting_linking",
  skipApproval: false, isReuse: false, approvalThumbUrl: null, deletedAt: null, ...over,
});

beforeEach(() => {
  itens = { p1: peca() };
  H.createAuditLog = vi.fn(async () => {});
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getEvent = vi.fn(async () => EVENTO);
  s.getItem = vi.fn(async (id: string) => itens[id]);
  s.updateItem = vi.fn(async (id: string, d: any) => { itens[id] = { ...itens[id], ...d }; return itens[id]; });
  s.getSponsor = vi.fn(async (id: string) => (id.startsWith("sp-") ? { id, name: `Marca ${id}` } : undefined));
  s.bulkSyncItemSponsors = vi.fn(async () => {});
  s.getItemSponsors = vi.fn(async () => [{ sponsorId: "sp-1" }, { sponsorId: "sp-2" }]);
  s.createNotification = vi.fn(async (n: any) => ({ id: "n1", ...n }));
});

describe("14 · POST /api/items/:id/sponsors/sync valida os patrocinadores", () => {
  it("ID inexistente → 400 com o ID na frase, e nada é gravado", async () => {
    const r = await chamar("POST /api/items/:id/sponsors/sync", { params: { id: "p1" }, body: { sponsorIds: ["sp-1", "fantasma"] } });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("Patrocinador não encontrado: fantasma");
    expect(H.storage.bulkSyncItemSponsors).not.toHaveBeenCalled();
    expect(H.createAuditLog).not.toHaveBeenCalled();
  });

  it("a trilha conta só os válidos (vazios e repetidos não contam)", async () => {
    const r = await chamar("POST /api/items/:id/sponsors/sync", { params: { id: "p1" }, body: { sponsorIds: ["sp-1", "sp-1", "", null, "sp-2"] } });
    expect(r.status).toBe(200);
    expect(H.storage.bulkSyncItemSponsors).toHaveBeenCalledWith("p1", ["sp-1", "sp-2"]);
    expect(H.createAuditLog.mock.calls[0][4]).toContain("2 patrocinadores vinculados");
  });

  it("peça inexistente → 404 'Peça não encontrada.'", async () => {
    const r = await chamar("POST /api/items/:id/sponsors/sync", { params: { id: "nada" }, body: { sponsorIds: [] } });
    expect(r).toEqual({ status: 404, body: { error: "Peça não encontrada." } });
  });

  it("erro inesperado → 500 sem vazar a mensagem técnica", async () => {
    H.storage.bulkSyncItemSponsors = vi.fn(async () => { throw new Error("duplicate key value violates unique constraint"); });
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await chamar("POST /api/items/:id/sponsors/sync", { params: { id: "p1" }, body: { sponsorIds: ["sp-1"] } });
    erro.mockRestore();
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("duplicate key");
  });
});

describe("11 · POST /api/items/:id/return-to-creation", () => {
  it("diz quantos vínculos apagou e que o thumb fica", async () => {
    itens.p1 = peca({ approvalThumbUrl: "/objects/rascunho" });
    const r = await chamar("POST /api/items/:id/return-to-creation", { params: { id: "p1" } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ message: "Peça devolvida para a Criação.", vinculosRemovidos: 2, thumbMantido: true });
    expect(H.storage.bulkSyncItemSponsors).toHaveBeenCalledWith("p1", []);
    // O thumb não é tocado pela rota.
    expect(H.storage.updateItem.mock.calls[0][1]).not.toHaveProperty("approvalThumbUrl");
    expect(itens.p1.approvalThumbUrl).toBe("/objects/rascunho");
  });

  it("status fora da vinculação → 409 com o status traduzido", async () => {
    itens.p1 = peca({ status: "inProduction" });
    const r = await chamar("POST /api/items/:id/return-to-creation", { params: { id: "p1" } });
    expect(r.status).toBe(409);
    expect(r.body.error).not.toContain("inProduction");
    expect(r.body.error).toContain("não pode voltar para a Criação");
  });

  it("peça inexistente → 404 'Peça não encontrada.'", async () => {
    const r = await chamar("POST /api/items/:id/return-to-creation", { params: { id: "nada" } });
    expect(r).toEqual({ status: 404, body: { error: "Peça não encontrada." } });
  });
});

describe("9 · POST /api/items/send-to-arte devolve o motivo por peça", () => {
  it("as que falharam vêm em `falhas` com o id; a que foi não", async () => {
    itens = {
      p1: peca({ id: "p1" }),
      p2: peca({ id: "p2", displayId: "#0501", status: "awaiting_submission" }),
      p3: peca({ id: "p3", displayId: "#0502" }),
    };
    H.storage.getItemSponsors = vi.fn(async (id: string) => (id === "p3" ? [] : [{ sponsorId: "sp-1" }]));
    const r = await chamar("POST /api/items/send-to-arte", { body: { itemIds: ["p1", "p2", "p3"] } });
    expect(r.status).toBe(200);
    expect(r.body.sent).toBe(1);
    const porId = Object.fromEntries(r.body.falhas.map((f: any) => [f.itemId, f.motivo]));
    expect(Object.keys(porId).sort()).toEqual(["p2", "p3"]);
    expect(porId.p2).toContain("Já tinha sido enviada");
    expect(porId.p2).not.toContain("awaiting_submission");
    expect(porId.p3).toContain("patrocinador");
    // O formato antigo continua (a tela reconhece "já foi enviado").
    expect(r.body.errors.some((e: string) => e.includes("já foi enviado"))).toBe(true);
  });

  it("erro técnico numa peça não vaza na frase", async () => {
    H.storage.getItemSponsors = vi.fn(async () => { throw new Error("connection terminated unexpectedly"); });
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await chamar("POST /api/items/send-to-arte", { body: { itemIds: ["p1"] } });
    erro.mockRestore();
    expect(JSON.stringify(r.body)).not.toContain("connection terminated");
    expect(r.body.falhas[0]).toMatchObject({ itemId: "p1" });
  });
});
