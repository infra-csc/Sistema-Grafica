import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  notifyBookSaved: vi.fn(),
  createAuditLog: vi.fn(),
  broadcast: vi.fn(),
}));

vi.mock("../db", () => ({ db: {} }));
vi.mock("../storage", () => ({
  storage: H.storage,
  assetPrefix: () => "",
  assetSeqOf: () => 0,
  isDisplayIdConflictError: () => false,
}));
vi.mock("../routes/shared", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  broadcast: (...args: any[]) => H.broadcast(...args),
  translateStatus: (status: string) => status,
  createAuditLog: (...args: any[]) => H.createAuditLog(...args),
  resolveActor: () => null,
  updateEventStatus: vi.fn(),
  EVENT_CLOSED_STATUS: "closed",
}));
vi.mock("../routes/eventoFinalizado", () => ({
  EVENTO_ENCERRADO_ERRO: "Evento encerrado",
  EVENTO_REALIZADO_ERRO: "Evento realizado",
  motivoEventoFechado: () => null,
  erroEventoFechado: () => "Evento encerrado",
  motivoEventoDaPeca: async () => null,
  barraEventoFinalizado: async () => false,
  contadorDeBloqueio: () => 0,
}));
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({
  handlePreviewXlsx: vi.fn(),
  handleConfirmImport: vi.fn(),
}));
vi.mock("../services/xlsxExport", () => ({
  handleExportItemsXlsx: vi.fn(),
  handleExportSelectedItemsXlsx: vi.fn(),
}));
vi.mock("../services/bookEmailNotification", () => ({
  notifyBookSaved: (...args: any[]) => H.notifyBookSaved(...args),
}));

const { registerItemRoutes } = await import("../routes/items");

type Handler = (req: any, res: any, next: any) => unknown;
const routes = new Map<string, Handler[]>();
const app: any = {};
for (const method of ["get", "post", "patch", "put", "delete"]) {
  app[method] = (path: string, ...handlers: Handler[]) => {
    routes.set(`${method.toUpperCase()} ${path}`, handlers);
    return app;
  };
}
registerItemRoutes(app);

async function callBookRoute(body: unknown): Promise<{ status: number; body: unknown }> {
  const handlers = routes.get("POST /api/events/:eventId/book");
  if (!handlers) throw new Error("Rota de book não registrada");

  const req: any = {
    params: { eventId: "evento-1" },
    body,
    userRole: "arte",
    userId: "user-1",
    userName: "Ana Arte",
    session: { userId: "user-1", userRole: "arte" },
  };
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };

  for (const handler of handlers) {
    let nextCalled = false;
    await handler(req, res, () => { nextCalled = true; });
    if (res.body !== undefined || !nextCalled) break;
  }

  return { status: res.statusCode, body: res.body };
}

beforeEach(() => {
  vi.clearAllMocks();
  H.storage.getEvent = vi.fn().mockResolvedValue({
    id: "evento-1",
    name: "Corrida NORTE",
    status: "created",
  });
  H.storage.clearEventBookUrl = vi.fn().mockResolvedValue(3);
  H.storage.setItemsBookUrl = vi.fn().mockResolvedValue(2);
  H.storage.createEventBook = vi.fn().mockResolvedValue({ id: "book-1" });
  H.notifyBookSaved.mockResolvedValue({ status: "disabled" });
  H.createAuditLog.mockResolvedValue(undefined);
});

describe("e-mail ao salvar book", () => {
  it("dispara somente depois de persistir um book", async () => {
    const sequence: string[] = [];
    H.storage.setItemsBookUrl.mockImplementation(async () => {
      sequence.push("persistiu");
      return 2;
    });
    H.notifyBookSaved.mockImplementation(async () => {
      sequence.push("notificou");
      return { status: "disabled" };
    });

    await expect(callBookRoute({
      bookUrl: "/objects/books/corrida.pdf",
      itemIds: ["item-1", "item-2"],
    })).resolves.toEqual({ status: 200, body: { updated: 2 } });

    expect(sequence).toEqual(["persistiu", "notificou"]);
    expect(H.notifyBookSaved).toHaveBeenCalledWith({
      eventId: "evento-1",
      eventName: "Corrida NORTE",
      itemCount: 2,
      bookUrl: "/objects/books/corrida.pdf",
    });
  });

  it("não dispara e-mail ao remover o book", async () => {
    await callBookRoute({ bookUrl: null, itemIds: ["item-1"] });

    expect(H.notifyBookSaved).not.toHaveBeenCalled();
  });

  it("preserva o book e a notificação quando a auditoria falha", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    H.createAuditLog.mockRejectedValue(new Error("banco de auditoria indisponível"));

    await expect(callBookRoute({
      bookUrl: "/objects/books/corrida.pdf",
      itemIds: ["item-1"],
    })).resolves.toEqual({ status: 200, body: { updated: 2 } });

    expect(H.storage.setItemsBookUrl).toHaveBeenCalled();
    expect(H.notifyBookSaved).toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith("[book] falha ao registrar auditoria", expect.objectContaining({
      eventId: "evento-1",
    }));
    errorLog.mockRestore();
  });
});