// ─────────────────────────────────────────────────────────────────────────────
// GET /api/items?semKitAlheio=1 — o recorte da Vinculação (dono, 21/10:
// "usuário de Solicitação NÃO vê Kit"). A tela em
// vinculacao-sem-kit-da-solicitacao.test.ts; aqui, a rota de verdade.
//
//   · Solicitação da Arena + parâmetro → sem peça do Kit (lista e delta);
//   · Solicitação da Arena SEM o parâmetro → igual a antes (as outras telas
//     seguem mostrando o Kit para consulta);
//   · admin → tudo; usuário do Kit → só as dele (a régua de sempre).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({ storage: {} as Record<string, any> }));

vi.mock("../db", () => ({ db: {}, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return { ...real, requireAuth: (_req: any, _res: any, next: any) => next(), broadcast: () => {}, createAuditLog: async () => {}, updateEventStatus: async () => {} };
});
vi.mock("../services/tubosDaPeca", async () => {
  const real = await vi.importActual<any>("../services/tubosDaPeca");
  return { ...real, resumosDeTuboPorIds: async () => new Map() };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn() }));

import { registerItemRoutes } from "../routes/items";

type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const appFalso: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  appFalso[verbo] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs); return appFalso; };
}
registerItemRoutes(appFalso);

async function listar(query: Record<string, string>, quem: { userRole: string; userKit?: boolean; userId: string }) {
  const req: any = { params: {}, body: {}, query, headers: {}, ...quem, userName: "X", session: {} };
  const res: any = { _status: 200, _body: undefined, _done: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.set = () => res; res.setHeader = res.set;
  res.json = (b: any) => { res._body = b; res._done = true; return res; };
  for (const h of rotas.get("GET /api/items")!) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (res._done || !seguiu) break;
  }
  return { status: res._status, body: res._body };
}

const EVENTO = { id: "e1", name: "Eco Run", status: "active", startDate: "2026-11-10" };
const peca = (id: string, over: Record<string, unknown> = {}) => ({
  id, displayId: `#${id}`, status: "awaiting_linking", type: "Backdrop", eventId: "e1",
  kitRemessaId: null, criadoPorId: "uA", parentItemId: null, deletedAt: null, tuboId: null,
  createdAt: new Date("2026-10-01T12:00:00Z"), updatedAt: new Date("2026-10-21T12:00:00Z"), ...over,
});
const ACERVO = [
  peca("a1"), peca("a2"),
  peca("k1", { kitRemessaId: "r1", criadoPorId: "uK" }),
  peca("k2", { kitRemessaId: "r1", criadoPorId: "uK2" }),
];
const ARENA = { userRole: "solicitacao", userKit: false, userId: "uA" };
const KIT = { userRole: "solicitacao", userKit: true, userId: "uK" };
const ADMIN = { userRole: "admin", userKit: false, userId: "uAdm" };
const DA_VINCULACAO = { status: "awaiting_linking", eventId: "e1", semKitAlheio: "1" };
const ids = (b: any) => (Array.isArray(b) ? b : b.itens).map((p: any) => p.id).sort();

beforeEach(() => {
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getItemsByStatusesAndEvents = vi.fn(async () => ACERVO);
  s.getItemsChangedSince = vi.fn(async () => ACERVO);
  s.getAllItems = vi.fn(async () => ACERVO);
  s.getAllEvents = vi.fn(async () => [EVENTO]);
  s.getEventsByIds = vi.fn(async () => [EVENTO]);
  s.getAllSponsors = vi.fn(async () => []);
  s.getAllItemSponsors = vi.fn(async () => []);
  s.getAllItemSponsorApprovals = vi.fn(async () => []);
  s.getItemSponsorsByItemIds = vi.fn(async () => []);
  s.getItemSponsorApprovalsByItemIds = vi.fn(async () => []);
  s.getComplementsByParentIds = vi.fn(async () => []);
  s.getItemsByIds = vi.fn(async () => []);
});

describe("GET /api/items?semKitAlheio=1 (Vinculação)", () => {
  it("Solicitação da Arena: as peças do Kit saem da lista", async () => {
    const r = await listar(DA_VINCULACAO, ARENA);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(ids(r.body)).toEqual(["a1", "a2"]);
  });

  it("Solicitação da Arena sem o parâmetro: igual a antes (as outras telas seguem mostrando o Kit)", async () => {
    const { semKitAlheio: _fora, ...semParam } = DA_VINCULACAO;
    expect(ids((await listar(semParam, ARENA)).body)).toEqual(["a1", "a2", "k1", "k2"]);
  });

  it("admin vê tudo; usuário do Kit vê só as dele — com ou sem o parâmetro", async () => {
    expect(ids((await listar(DA_VINCULACAO, ADMIN)).body)).toEqual(["a1", "a2", "k1", "k2"]);
    expect(ids((await listar(DA_VINCULACAO, KIT)).body)).toEqual(["k1"]);
  });

  it("no delta, a peça do Kit vai em `removidas` para a Solicitação da Arena", async () => {
    const r = await listar({ ...DA_VINCULACAO, since: new Date(Date.now() - 60_000).toISOString() }, ARENA);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.delta).toBe(true);
    expect(ids(r.body)).toEqual(["a1", "a2"]);
    expect([...r.body.removidas].sort()).toEqual(["k1", "k2"]);
  });
});
