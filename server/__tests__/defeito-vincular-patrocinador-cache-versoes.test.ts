// ─────────────────────────────────────────────────────────────────────────────
// DEFEITO (integração, 23/09): POST /api/items/:id/sponsors em peça que já
// está em aprovação cria a linha PENDENTE do patrocinador novo, mas não
// derrubava o cache da tela de Versões — ela só via a pendência depois de
// ~30 s. As outras escritas de decisão derrubam (invalidarCacheDeVersoes →
// invalidarCacheNoCluster("versoes")); esta passa a derrubar também.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/banco_nunca_acessado";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  derrubados: [] as string[],
}));

vi.mock("../db", () => ({ db: { execute: async () => ({ rows: [] }) }, pool: {} }));
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
    requireAdmin: (_req: any, _res: any, next: any) => next(),
    broadcast: () => {},
    createAuditLog: async () => {},
    createAuditLogsEmLote: async () => {},
    updateEventStatus: async () => {},
  };
});
vi.mock("../cache", () => ({
  eventsCache: null, setEventsCache: vi.fn(), eventsCacheGeneration: () => 0, EVENTS_CACHE_TTL_MS: 1,
  invalidateEventsCache: vi.fn(), invalidateAllCaches: vi.fn(), registrarCache: vi.fn(),
  invalidarCacheNoCluster: (nome: string) => { H.derrubados.push(nome); },
}));
vi.mock("../services/prioridadeAutomatica", () => ({ aplicarPrioridadeAutomatica: vi.fn(async () => {}) }));
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));
vi.mock("../services/consultaDeEstoqueNaLiberacao", () => ({
  respostaDoEstoqueParaLiberar: vi.fn(async () => null),
  marcarRespostaAplicada: vi.fn(async () => {}),
}));

const { registerSponsorRoutes } = await import("../routes/sponsors");

type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const appFalso: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  appFalso[verbo] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs); return appFalso; };
}
registerSponsorRoutes(appFalso);

async function vincular(sponsorId: string) {
  const req: any = { params: { id: "p1" }, body: { sponsorId }, query: {}, headers: {}, userRole: "admin", userId: "u1", userName: "Maria", session: {} };
  const res: any = { _status: 200, _body: undefined, _done: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; res._done = true; return res; };
  for (const h of rotas.get("POST /api/items/:id/sponsors")!) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (res._done || !seguiu) break;
  }
  return { status: res._status, body: res._body };
}

let peca: any;
let linhas: any[];
beforeEach(() => {
  H.derrubados = [];
  linhas = [];
  peca = { id: "p1", displayId: "#2801", eventId: "ev-1", type: "Pórtico", status: "awaiting_sponsor_approval", deletedAt: null };
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getItem = vi.fn(async () => peca);
  s.getEvent = vi.fn(async () => ({ id: "ev-1", name: "COPA", status: "created", startDate: new Date("2099-03-10T08:00:00Z"), truckDepartureDate: new Date("2099-03-01T11:00:00Z") }));
  s.getSponsor = vi.fn(async (id: string) => ({ id, name: "Bradesco", arquivadoEm: null }));
  s.addSponsorToItem = vi.fn(async (d: any) => ({ id: "is-1", ...d }));
  s.getItemSponsorApproval = vi.fn(async (itemId: string, sponsorId: string) => linhas.find((l) => l.itemId === itemId && l.sponsorId === sponsorId));
  s.createItemSponsorApproval = vi.fn(async (l: any) => { linhas.push(l); return l; });
});

describe("vincular patrocinador a peça em aprovação derruba o cache de Versões", () => {
  it("a pendência nova nasce E o cache de Versões cai na hora", async () => {
    const r = await vincular("sp-b");
    expect(r.status).toBe(201);
    expect(linhas).toEqual([expect.objectContaining({ itemId: "p1", sponsorId: "sp-b", status: "pending" })]);
    expect(H.derrubados).toContain("versoes");
  });

  it("peça fora da aprovação não ganha linha — e o cache fica (nada que Versões mostre mudou)", async () => {
    peca.status = "awaiting_submission";
    const r = await vincular("sp-b");
    expect(r.status).toBe(201);
    expect(linhas).toEqual([]);
    expect(H.derrubados).not.toContain("versoes");
  });
});
