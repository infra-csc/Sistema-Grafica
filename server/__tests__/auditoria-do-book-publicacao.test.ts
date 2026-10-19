// ─────────────────────────────────────────────────────────────────────────────
// PUBLICAR O BOOK DISPARA A AUDITORIA — depois da resposta, sem atrasá-la, e
// sem que uma falha dela derrube a publicação. Remover o book não dispara.
// ─────────────────────────────────────────────────────────────────────────────
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  disparar: vi.fn(),
  ordem: [] as string[],
}));

vi.mock("../db", () => ({ db: {} }));
vi.mock("../storage", () => ({ storage: H.storage, assetPrefix: () => "", assetSeqOf: () => 0, isDisplayIdConflictError: () => false }));
vi.mock("../routes/shared", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  createAuditLogsEmLote: vi.fn(),
  broadcast: vi.fn(),
  translateStatus: (s: string) => s,
  createAuditLog: vi.fn(async () => {}),
  resolveActor: () => null,
  updateEventStatus: vi.fn(),
  EVENT_CLOSED_STATUS: "closed",
}));
vi.mock("../routes/eventoFinalizado", () => ({
  EVENTO_ENCERRADO_ERRO: "x", EVENTO_REALIZADO_ERRO: "x", motivoEventoFechado: () => null, erroEventoFechado: () => "x",
  motivoEventoDaPeca: async () => null, barraEventoFinalizado: async () => false, contadorDeBloqueio: () => 0,
}));
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn() }));
vi.mock("../services/bookEmailNotification", () => ({ notifyBookSaved: vi.fn(async () => ({ status: "disabled" })), descreverEnvio: () => "x" }));
vi.mock("../services/auditoria-do-book/fila", () => ({
  dispararAuditoriaDoBook: (...a: unknown[]) => { H.ordem.push("disparou"); return H.disparar(...a); },
}));

const { capturarRotas } = await import("./rotas-de-mentira");
const { registerItemRoutes } = await import("../routes/items");
const { chamar } = capturarRotas(registerItemRoutes);

const publicar = (body: Record<string, unknown>) =>
  chamar("POST /api/events/:eventId/book", { params: { eventId: "ev-1" }, body, sessao: { userId: "u1", userRole: "arte", userName: "Ana" } });
/** O disparo é assíncrono (import tardio): espera a fila de microtarefas andar. */
const assentar = () => new Promise((r) => setTimeout(r, 30));

beforeEach(() => {
  H.ordem.length = 0;
  H.disparar.mockReset().mockResolvedValue("aud-1");
  Object.assign(H.storage, {
    getEvent: vi.fn(async () => ({ id: "ev-1", name: "Night Run", status: "created" })),
    clearEventBookUrl: vi.fn(async () => 0),
    setItemsBookUrl: vi.fn(async () => { H.ordem.push("gravou"); return 1; }),
    createEventBook: vi.fn(async () => ({ id: "b1" })),
    getAllEventBooks: vi.fn(async () => []),
    getItemsByEvent: vi.fn(async () => [{ id: "i1", status: "draft", deletedAt: null }]),
    getEventSponsors: vi.fn(async () => []),
    getAllSponsors: vi.fn(async () => []),
    getAllUsers: vi.fn(async () => []),
  });
});

describe("book publicado → auditoria enfileirada", () => {
  it("dispara com o evento e o book, depois de gravar", async () => {
    const r = await publicar({ bookUrl: "/objects/uploads/abc", itemIds: ["i1"] });
    expect(r.status).toBe(200);
    await assentar();
    expect(H.disparar).toHaveBeenCalledWith("ev-1", "/objects/uploads/abc");
    expect(H.ordem).toEqual(["gravou", "disparou"]);
  });

  it("remover o book (bookUrl null) não dispara", async () => {
    const r = await publicar({ bookUrl: null, itemIds: ["i1"] });
    expect(r.status).toBe(200);
    await assentar();
    expect(H.disparar).not.toHaveBeenCalled();
  });

  it("a auditoria falhando não muda a resposta da publicação", async () => {
    H.disparar.mockRejectedValue(new Error("banco fora"));
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await publicar({ bookUrl: "/objects/uploads/abc", itemIds: ["i1"] });
    expect(r.status).toBe(200);
    expect((r.body as any).updated).toBe(1);
    await assentar();
    expect(erro).toHaveBeenCalledWith("[book] auditoria do book não enfileirada", expect.objectContaining({ eventId: "ev-1" }));
    erro.mockRestore();
  });
});
