// ─────────────────────────────────────────────────────────────────────────────
// A RÉGUA DO THUMB NAS ROTAS QUE GRAVAM — executando as rotas reais da peça.
//
// Veio de buscar-arte-ja-feita.test.ts (que contava ocorrências no texto das
// rotas da peça). Aqui submit-for-approval, update-thumb e resubmit rodam com
// a borda mockada (como em molde-revisao-adversarial.test.ts): URL de fora é
// recusada com a frase da casa, a crua do bucket é GRAVADA normalizada — no
// item e na versão da arte. O PATCH genérico (a 4ª rota) é coberto por
// molde-revisao-adversarial.test.ts, "3 · o PATCH genérico aplica a régua".
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: { transaction: (async () => {}) as any, execute: (async () => ({ rows: [] })) as any },
}));

vi.mock("../db", () => ({ db: H.db, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<Record<string, unknown>>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<Record<string, unknown>>("../routes/shared");
  return {
    ...real,
    requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
    requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    broadcast: vi.fn(),
    createAuditLog: vi.fn(async () => {}),
    updateEventStatus: vi.fn(async () => {}),
  };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));
vi.mock("../services/consultaDeEstoqueNaLiberacao", () => ({
  respostaDoEstoqueParaLiberar: vi.fn(async () => null),
  marcarRespostaAplicada: vi.fn(async () => {}),
}));

import { capturarRotas } from "./rotas-de-mentira";
import { ERRO_THUMB_FORA_DO_STORAGE } from "../routes/thumb-url";
import { registerItemRoutes } from "../routes/items";

const { chamar } = capturarRotas(registerItemRoutes);
const ARTE = { userId: "u1", userRole: "arte", userName: "Maria" };
const FORA = "https://example.com/x.png";
const CRUA = "https://storage.googleapis.com/bucket/.private/uploads/nova.png?x=1";
const NORMALIZADA = "/objects/uploads/nova.png";

let itens: Record<string, any>;
const peca = (over: Record<string, unknown> = {}) => ({
  id: "p1", displayId: "#0500", eventId: "ev-1", type: "Pórtico", description: "Pórtico", quantity: 10,
  quantityProduced: null, reuseQty: 0, isReuse: false, conferredQty: 0, embaladaQty: 0, deliveredQty: 0,
  status: "awaiting_submission", skipApproval: false, approvalThumbUrl: null, finalFileUrl: null, deletedAt: null,
  parentItemId: null, kitRemessaId: null, travadaEm: null, fileWidth: "2.00", fileHeight: "1.00",
  ...over,
});

beforeEach(() => {
  itens = {};
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getItem = vi.fn(async (id: string) => itens[id]);
  s.getEvent = vi.fn(async () => ({ id: "ev-1", name: "COPA NORTE", status: "created", startDate: "2099-01-10" }));
  s.updateItem = vi.fn(async (id: string, dados: Record<string, unknown>) => (itens[id] = { ...itens[id], ...dados }));
  s.createItemArtVersion = vi.fn(async () => ({}));
  s.createNotification = vi.fn(async (n: Record<string, unknown>) => ({ id: "n1", ...n }));
  s.getItemSponsors = vi.fn(async () => []);
  s.getItemSponsorApprovals = vi.fn(async () => []);
  s.getItemSponsorApproval = vi.fn(async () => undefined);
  s.updateItemSponsorApproval = vi.fn(async () => ({}));
  s.initializeItemSponsorApprovals = vi.fn(async () => {});
  s.getSponsor = vi.fn(async () => undefined);
});

describe("as rotas que gravam thumb só aceitam objeto do storage", () => {
  it("submit-for-approval: recusa URL de fora e grava a forma normalizada no item e na versão", async () => {
    itens.p1 = peca();
    const fora = await chamar("PATCH /api/items/:id/submit-for-approval", { sessao: ARTE, params: { id: "p1" }, body: { approvalThumbUrl: FORA } });
    expect(fora.status).toBe(400);
    expect(fora.body).toEqual({ error: ERRO_THUMB_FORA_DO_STORAGE });
    expect(H.storage.updateItem).not.toHaveBeenCalled();
    expect(H.storage.createItemArtVersion).not.toHaveBeenCalled();

    const ok = await chamar("PATCH /api/items/:id/submit-for-approval", { sessao: ARTE, params: { id: "p1" }, body: { approvalThumbUrl: CRUA } });
    expect(ok.status).toBe(200);
    expect(itens.p1.approvalThumbUrl).toBe(NORMALIZADA);
    expect(H.storage.createItemArtVersion).toHaveBeenCalledWith(expect.objectContaining({ thumbUrl: NORMALIZADA, origem: "envio" }));
  });

  it("update-thumb: guarda o anterior, compara pela forma normalizada e versiona como troca", async () => {
    itens.p1 = peca({ approvalThumbUrl: "/objects/uploads/velha.png" });
    const fora = await chamar("PATCH /api/items/:id/update-thumb", { sessao: ARTE, params: { id: "p1" }, body: { approvalThumbUrl: FORA } });
    expect(fora.status).toBe(400);
    expect(fora.body).toEqual({ error: ERRO_THUMB_FORA_DO_STORAGE });

    // A crua do bucket e a /objects/ são o MESMO arquivo: não é troca.
    const igual = await chamar("PATCH /api/items/:id/update-thumb", {
      sessao: ARTE, params: { id: "p1" }, body: { approvalThumbUrl: "https://storage.googleapis.com/b/.private/uploads/velha.png" },
    });
    expect(igual.status).toBe(409);
    expect(H.storage.updateItem).not.toHaveBeenCalled();

    const ok = await chamar("PATCH /api/items/:id/update-thumb", { sessao: ARTE, params: { id: "p1" }, body: { approvalThumbUrl: CRUA } });
    expect(ok.status).toBe(200);
    expect(itens.p1.approvalThumbUrl).toBe(NORMALIZADA);
    expect(itens.p1.previousApprovalThumbUrl).toBe("/objects/uploads/velha.png");
    expect(H.storage.createItemArtVersion).toHaveBeenCalledWith(expect.objectContaining({ thumbUrl: NORMALIZADA, origem: "troca" }));
  });

  it("resubmit: recusa URL de fora e grava a normalizada, limpando a reprovação", async () => {
    itens.p1 = peca({ status: "awaiting_sponsor_approval", approvalThumbUrl: "/objects/uploads/velha.png", rejectedBySponsor: true });
    H.storage.getItemSponsorApprovals = vi.fn(async () => [{ id: "a1", sponsorId: "s1", status: "awaiting_arte" }]);
    const rota = "POST /api/items/:id/sponsor-approvals/resubmit";

    const fora = await chamar(rota, { sessao: ARTE, params: { id: "p1" }, body: { newThumbUrl: FORA } });
    expect(fora.status).toBe(400);
    expect(fora.body).toEqual({ error: ERRO_THUMB_FORA_DO_STORAGE });
    expect(H.storage.updateItem).not.toHaveBeenCalled();

    const ok = await chamar(rota, { sessao: ARTE, params: { id: "p1" }, body: { newThumbUrl: CRUA } });
    expect(ok.status).toBe(200);
    expect(itens.p1.approvalThumbUrl).toBe(NORMALIZADA);
    expect(itens.p1.rejectedBySponsor).toBe(false);
    expect(H.storage.createItemArtVersion).toHaveBeenCalledWith(expect.objectContaining({ thumbUrl: NORMALIZADA, origem: "reenvio" }));
  });

  it("o caminho do arquivo final fica fora da régua — é caminho de rede por regra da casa", async () => {
    const REDE = "\\\\servidor\\arte\\Rolo_Ministerio.tif";
    itens.p1 = peca({ status: "sponsor_approved", approvalThumbUrl: "/objects/uploads/a.png" });
    const envio = await chamar("PATCH /api/items/:id/submit-final-file", {
      sessao: ARTE, params: { id: "p1" }, body: { finalFileUrl: REDE, finalFileName: "Rolo_Ministerio.tif" },
    });
    expect(envio.status).toBe(200);
    expect(itens.p1.finalFileUrl).toBe(REDE);

    // Pelo PATCH genérico (admin corrige), o caminho de rede também passa intacto.
    itens.p2 = peca({ id: "p2", status: "awaiting_final_review", finalFileUrl: "//srv/velho.tif" });
    const edicao = await chamar("PATCH /api/items/:id", { sessao: { userId: "u1", userRole: "admin" }, params: { id: "p2" }, body: { finalFileUrl: REDE } });
    expect(edicao.status).toBe(200);
    expect(itens.p2.finalFileUrl).toBe(REDE);
  });
});
