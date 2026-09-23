// ─────────────────────────────────────────────────────────────────────────────
// O REENVIO DA CORREÇÃO É DERIVADO, NÃO ESCOLHIDO — a rota, rodando.
//
// Veio de arte-nota-10.test.ts ("e o servidor não aceita subconjunto
// diferente"), que lia o texto de server/routes/itens/aprovacao.ts. A regra do
// dono: o reenvio vai para quem ainda não aprovou (reprovou ou aguarda); quem
// aprovou mantém. O cliente não manda mais o conjunto; se mandar, só passa o
// conjunto derivado — e não existe mais o 400 "Selecione pelo menos um".
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({ storage: {} as Record<string, any> }));

vi.mock("../db", () => ({ db: { transaction: async () => {}, execute: async () => ({ rows: [] }) }, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real,
    requireAuth: (_req: any, _res: any, next: any) => next(),
    broadcast: () => {},
    createAuditLog: async () => {},
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
import { capturarRotas } from "./rotas-de-mentira";

const { chamar } = capturarRotas(registerItemRoutes);

let linhas: any[];
let peca: any;
const reenviar = (body: Record<string, unknown>) =>
  chamar("POST /api/items/:id/sponsor-approvals/resubmit", {
    sessao: { userId: "u1", userRole: "arte", userName: "Jan" },
    params: { id: "p1" },
    body: { newThumbUrl: "/objects/uploads/v2.png", ...body },
  });

beforeEach(() => {
  peca = { id: "p1", eventId: "ev-1", type: "Pórtico", status: "awaiting_sponsor_approval", approvalThumbUrl: "/objects/uploads/v1.png", deletedAt: null };
  linhas = [
    { id: "a-vale", sponsorId: "sp-vale", status: "awaiting_arte" },
    { id: "a-ache", sponsorId: "sp-ache", status: "approved" },
    { id: "a-min", sponsorId: "sp-min", status: "pending" },
  ];
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getItem = vi.fn(async () => peca);
  s.getEvent = vi.fn(async () => ({ id: "ev-1", name: "COPA", status: "created", startDate: "2099-01-10" }));
  s.getItemSponsorApprovals = vi.fn(async () => linhas);
  s.getItemSponsorApproval = vi.fn(async (_i: string, sp: string) => linhas.find((l) => l.sponsorId === sp));
  s.updateItemSponsorApproval = vi.fn(async (id: string, d: any) => Object.assign(linhas.find((l) => l.id === id), d));
  s.updateItem = vi.fn(async (_id: string, d: any) => (peca = { ...peca, ...d }));
  s.createItemArtVersion = vi.fn(async () => ({}));
  s.getItemSponsors = vi.fn(async () => linhas.map((l) => ({ sponsorId: l.sponsorId })));
  s.getSponsor = vi.fn(async (id: string) => ({ id, name: id, strictApproval: false }));
  s.createNotification = vi.fn(async (n: any) => ({ id: "n1", ...n }));
});

describe("POST /api/items/:id/sponsor-approvals/resubmit — o conjunto é do servidor", () => {
  it("sem conjunto no corpo: vai para quem não aprovou; quem aprovou mantém", async () => {
    const r = await reenviar({});
    expect(r.status).toBe(200);
    expect(linhas.map((l) => [l.sponsorId, l.status])).toEqual([
      ["sp-vale", "new_version_pending"], // reprovou → volta para o Atendimento
      ["sp-ache", "approved"],            // aprovou → mantém
      ["sp-min", "pending"],              // aguardava → segue aguardando, agora com a versão nova
    ]);
    expect(peca.approvalThumbUrl).toBe("/objects/uploads/v2.png");
  });

  it("lista vazia não é mais erro (o 400 'Selecione pelo menos um' morreu com a escolha)", async () => {
    expect((await reenviar({ sponsorIds: [] })).status).toBe(200);
  });

  it("o MESMO conjunto derivado, em qualquer ordem, passa", async () => {
    expect((await reenviar({ sponsorIds: ["sp-min", "sp-vale"] })).status).toBe(200);
  });

  it("subconjunto ou conjunto diferente: 409 que diz qual seria o certo — e nada é gravado", async () => {
    for (const sponsorIds of [["sp-vale"], ["sp-vale", "sp-min", "sp-ache"], ["sp-vale", "sp-outro"]]) {
      const r = await reenviar({ sponsorIds });
      expect(r.status, sponsorIds.join()).toBe(409);
      expect(r.body).toEqual({
        error: "O reenvio vai sempre para quem ainda não aprovou — o servidor não aceita outro conjunto.",
        esperado: ["sp-vale", "sp-min"],
      });
    }
    expect(H.storage.updateItemSponsorApproval).not.toHaveBeenCalled();
    expect(H.storage.updateItem).not.toHaveBeenCalled();
  });

  it("todos já aprovaram: 409 — não há para quem reenviar", async () => {
    for (const l of linhas) l.status = "approved";
    const r = await reenviar({});
    expect(r.status).toBe(409);
    expect((r.body as any).error).toBe("Nenhum patrocinador pendente para receber o reenvio — todos já aprovaram.");
  });
});
