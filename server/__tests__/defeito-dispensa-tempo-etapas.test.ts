// ─────────────────────────────────────────────────────────────────────────────
// DEFEITO (integração, 23/09): desde 09/09 dispensar a aprovação manda a peça
// para a FINALIZAÇÃO da Arte (DESTINO_DA_DISPENSA), mas o "Tempo por etapa"
// ainda lia a linha da dispensa como entrada na Produção Gráfica — os dias de
// finalização iam para a conta da Gráfica. A frase aqui é a que a rota REAL
// grava; a dispensa antiga (antes de 09/09, sem "Foi direto para a
// finalização") ia mesmo para a Gráfica e continua lida assim.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  trilha: [] as { acao: string; detalhe: string }[],
}));

vi.mock("../db", () => ({ db: { execute: async () => ({ rows: [] }), transaction: async () => {} }, pool: {} }));
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
    createAuditLog: async (_req: any, acao: string, _tipo: string, _id: string, detalhe: string) => { H.trilha.push({ acao, detalhe }); },
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
import { interpretarLog, permanenciaDaPeca, ETAPA_FINALIZACAO, ETAPA_PRODUCAO } from "../services/tempo-etapas";
import { STAGE_DEFS } from "../services/prazo-domain";

const ETAPA_APROVACAO = STAGE_DEFS.findIndex((s) => s.key === "aprovacao");

type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const appFalso: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  appFalso[verbo] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs); return appFalso; };
}
registerItemRoutes(appFalso);

let peca: any;
beforeEach(() => {
  H.trilha = [];
  peca = {
    id: "p1", displayId: "#0500", eventId: "ev-1", type: "Pórtico", quantity: 1, status: "awaiting_sponsor_approval",
    skipApproval: false, deletedAt: null, parentItemId: null,
  };
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getItem = vi.fn(async () => peca);
  s.getEvent = vi.fn(async () => ({ id: "ev-1", name: "COPA", status: "created", startDate: "2099-01-10", truckDepartureDate: new Date("2099-01-01T00:00:00Z") }));
  s.updateItem = vi.fn(async (_id: string, d: any) => (peca = { ...peca, ...d }));
  s.createNotification = vi.fn(async (n: any) => ({ id: "n1", ...n }));
});

async function dispensar(): Promise<{ status: number; detalhe: string }> {
  const req: any = { params: { id: "p1" }, body: { reason: "Urgência do evento, dono autorizou" }, query: {}, headers: {}, userRole: "arte", userId: "u1", userName: "Ana", session: {} };
  const res: any = { _status: 200, _done: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = () => { res._done = true; return res; };
  for (const h of rotas.get("PATCH /api/items/:id/dispense")!) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (res._done || !seguiu) break;
  }
  const linha = H.trilha.find((l) => l.acao === "dispensed");
  return { status: res._status, detalhe: linha?.detalhe ?? "" };
}

const DIA = 86_400_000;
const T0 = Date.UTC(2026, 8, 1, 15);

describe("dispensa de aprovação no Tempo por etapa", () => {
  it("a linha que a rota grava leva a peça para a FINALIZAÇÃO, não para a Gráfica", async () => {
    const { status, detalhe } = await dispensar();
    expect(status).toBe(200);
    expect(peca.status).toBe("awaiting_creator_review");
    const t = interpretarLog("dispensed", detalhe);
    expect(t?.destino).toEqual({ tipo: "etapa", indice: ETAPA_FINALIZACAO });
    expect(t?.origem).toBe(ETAPA_APROVACAO);
  });

  it("os dias entre a dispensa e a Revisão contam na Finalização; a Gráfica não ganha nada", async () => {
    const { detalhe } = await dispensar();
    const dias = permanenciaDaPeca([
      { ts: T0, action: "dispensed", details: detalhe },
      { ts: T0 + 3 * DIA, action: "updated", details: "Status alterado: Aguardando Revisão Final → Aguardando Revisão Final (arquivo final adicionado)" },
    ], null);
    expect(dias.get(ETAPA_FINALIZACAO)).toBe(3);
    expect(dias.has(ETAPA_PRODUCAO)).toBe(false);
  });

  it("dispensa ANTIGA (antes de 09/09, ia direto para a Gráfica) continua lida como Gráfica", () => {
    const t = interpretarLog("dispensed", "Peça dispensada pela Arte. Status anterior: sponsor_approved. Motivo: urgência");
    expect(t?.destino).toEqual({ tipo: "etapa", indice: ETAPA_PRODUCAO });
  });
});
