// ─────────────────────────────────────────────────────────────────────────────
// AVISO DE BOOK — a costura com a rota que publica o book.
//
// Arquivo original de 21/08, reescrito na revisão de 24/08. As três garantias
// originais continuam fixadas: o e-mail sai SÓ depois de o book estar salvo,
// não sai quando o book é removido, e uma falha de auditoria não derruba nem o
// book nem o aviso. O que mudou:
//
//  · o resultado do envio PARA DE SUMIR. Era `void notifyBookSaved(...)`: sem
//    espera, sem trilha, sem resposta — se o provedor recusasse, a Arte achava
//    que tinha avisado. Agora o desfecho vai para a trilha do evento e volta
//    na resposta da rota, para a tela poder dizer o que aconteceu.
//  · os destinatários vêm do EVENTO (executivos de conta dos patrocinadores),
//    e não mais de uma variável global igual para todos os eventos.
//  · existe uma rota de REENVIO, para "não chegou" não exigir republicar o
//    book inteiro.
// ─────────────────────────────────────────────────────────────────────────────
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
  descreverEnvio: (r: any) => `desfecho:${r.status}`,
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

async function chamar(rota: string, body: unknown, userRole = "arte"): Promise<{ status: number; body: any }> {
  const handlers = routes.get(rota);
  if (!handlers) throw new Error(`Rota não registrada: ${rota}`);

  const req: any = {
    params: { eventId: "evento-1" },
    body,
    userRole,
    userId: "user-1",
    userName: "Ana Arte",
    session: { userId: "user-1", userRole: userRole },
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

const callBookRoute = (body: unknown) => chamar("POST /api/events/:eventId/book", body);

beforeEach(() => {
  vi.clearAllMocks();
  H.storage.getEvent = vi.fn().mockResolvedValue({
    id: "evento-1",
    name: "Corrida NORTE",
    status: "created",
    truckDepartureDate: new Date("2026-09-05T11:00:00.000Z"),
  });
  H.storage.clearEventBookUrl = vi.fn().mockResolvedValue(3);
  H.storage.setItemsBookUrl = vi.fn().mockResolvedValue(2);
  H.storage.createEventBook = vi.fn().mockResolvedValue({ id: "book-1" });
  H.storage.getAllEventBooks = vi.fn().mockResolvedValue([{ eventId: "evento-1", bookUrl: "/objects/books/corrida.pdf" }]);
  H.storage.getItemsByEvent = vi.fn().mockResolvedValue([
    { id: "item-1", bookUrl: "/objects/books/corrida.pdf" },
    { id: "item-2", bookUrl: "/objects/books/corrida.pdf" },
    { id: "item-3", bookUrl: null },
  ]);
  H.storage.getEventSponsors = vi.fn().mockResolvedValue([{ sponsorId: "s1" }, { sponsorId: "s2" }]);
  // s1 tem executivo (u9); s2 não tem — e é justamente o caso que NÃO coloca
  // ninguém do atendimento no aviso (decisão do dono, 25/08).
  H.storage.getAllSponsors = vi.fn().mockResolvedValue([
    { id: "s1", accountExecutiveId: "u9" },
    { id: "s2", accountExecutiveId: null },
    { id: "s3", accountExecutiveId: "u1" }, // executivo de OUTRO evento: não entra
  ]);
  H.storage.getSponsor = vi.fn(async (id: string) => ({ id, accountExecutiveId: id === "s1" ? "u9" : null }));
  H.storage.getUser = vi.fn().mockResolvedValue({ id: "u9", email: "exec@nortemkt.com" });
  H.storage.getAllUsers = vi.fn().mockResolvedValue([
    { id: "u1", email: "atend1@nortemkt.com", role: "atendimento" }, // sem cliente NESTE evento
    { id: "u2", email: "atend2@nortemkt.com", role: "atendimento" },
    { id: "u3", email: "pedro@nortemkt.com", role: "admin" },        // nomeado, acompanha
    { id: "u4", email: "yan.araujo@nortemkt.com", role: "admin" },   // nomeado, acompanha
    { id: "u5", email: "chefe@nortemkt.com", role: "admin" },        // admin NÃO nomeado
    { id: "u6", email: "pedido@nortemkt.com", role: "solicitacao" }, // papel fora hoje
    { id: "u7", email: "arte@nortemkt.com", role: "arte" },          // publica o book
    { id: "u8", email: "", role: "atendimento" },                    // sem e-mail
    { id: "u9", email: "exec@nortemkt.com", role: "atendimento" },   // executivo do s1
  ]);
  H.notifyBookSaved.mockResolvedValue({ status: "disabled" });
  H.createAuditLog.mockResolvedValue(undefined);
});

describe("e-mail ao salvar book", () => {
  it("dispara só depois de o book estar persistido E auditado", async () => {
    const sequencia: string[] = [];
    H.storage.setItemsBookUrl.mockImplementation(async () => { sequencia.push("persistiu"); return 2; });
    H.createAuditLog.mockImplementation(async (_r: any, _a: any, _t: any, _id: any, detalhe: string) => {
      sequencia.push(detalhe.startsWith("desfecho:") ? "auditou-aviso" : "auditou-book");
    });
    H.notifyBookSaved.mockImplementation(async () => { sequencia.push("notificou"); return { status: "sent", para: ["exec@nortemkt.com"], descartados: [] }; });

    const r = await callBookRoute({ bookUrl: "/objects/books/corrida.pdf", itemIds: ["item-1", "item-2"] });

    expect(r.status).toBe(200);
    expect(r.body.updated).toBe(2);
    // Um efeito EXTERNO nunca deve acontecer antes de existir registro interno.
    expect(sequencia).toEqual(["persistiu", "auditou-book", "notificou", "auditou-aviso"]);
  });

  it("o aviso leva o contexto que faltava — e os destinatários vêm do evento", async () => {
    await callBookRoute({ bookUrl: "/objects/books/corrida.pdf", itemIds: ["item-1", "item-2"] });

    expect(H.notifyBookSaved).toHaveBeenCalledWith(expect.objectContaining({
      eventId: "evento-1",
      eventName: "Corrida NORTE",
      itemCount: 2,
      totalDoEvento: 3,          // o denominador que faltava
      bookUrl: "/objects/books/corrida.pdf",
      publicadoPor: "Ana Arte",
      saidaDoCaminhao: "2026-09-05T11:00:00.000Z",
      publicacao: 1,
      // Decisão do dono, revista em 25/08: a ARTE inteira (publica o book) e
      // os EXECUTIVOS com cliente NESTE evento de frente; as duas pessoas
      // nomeadas em cópia. O atendimento sem cliente aqui (u1, u2) ficou de
      // fora — que é a mudança. Admin não nomeado, Solicitação e usuário sem
      // e-mail continuam fora.
      destinatariosPrincipais: ["exec@nortemkt.com", "arte@nortemkt.com"],
      destinatariosDeCopia: ["pedro@nortemkt.com", "yan.araujo@nortemkt.com"],
    }));
  });

  it("o desfecho do envio volta na resposta e vai para a trilha", async () => {
    H.notifyBookSaved.mockResolvedValue({ status: "sent", para: ["exec@nortemkt.com"], copia: [], descartados: [] });

    const r = await callBookRoute({ bookUrl: "/objects/books/corrida.pdf", itemIds: ["item-1"] });

    expect(r.body.aviso).toEqual({ status: "sent", para: ["exec@nortemkt.com"], copia: [], descartados: [] });
    expect(H.createAuditLog).toHaveBeenCalledWith(
      expect.anything(), "updated", "event", "evento-1", "desfecho:sent",
    );
  });

  it("não dispara e-mail ao remover o book", async () => {
    const r = await callBookRoute({ bookUrl: null, itemIds: ["item-1"] });
    expect(H.notifyBookSaved).not.toHaveBeenCalled();
    expect(r.body.aviso).toBeNull();
  });

  it("preserva o book e o aviso quando a auditoria falha", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    H.createAuditLog.mockRejectedValue(new Error("banco de auditoria indisponível"));

    const r = await callBookRoute({ bookUrl: "/objects/books/corrida.pdf", itemIds: ["item-1"] });

    expect(r.status).toBe(200);
    expect(r.body.updated).toBe(2);
    expect(H.storage.setItemsBookUrl).toHaveBeenCalled();
    expect(H.notifyBookSaved).toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith("[book] falha ao registrar auditoria", expect.objectContaining({
      eventId: "evento-1",
    }));
    errorLog.mockRestore();
  });

  it("uma falha ao PREPARAR o aviso não derruba o book", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // getAllUsers resolve os DOIS lados dos destinatários (o papel e o
    // executivo do evento) — é ele que precisa falhar para exercitar o caminho.
    H.storage.getAllUsers.mockRejectedValue(new Error("banco fora"));

    const r = await callBookRoute({ bookUrl: "/objects/books/corrida.pdf", itemIds: ["item-1"] });

    expect(r.status).toBe(200);
    expect(r.body.updated).toBe(2);
    expect(r.body.aviso).toMatchObject({ status: "failed" });
    errorLog.mockRestore();
  });
});

describe("reenviar o aviso", () => {
  const reenviar = (papel: string) => chamar("POST /api/events/:eventId/book/notify", {}, papel);

  it("SÓ admin reenvia — decisão do dono (24/08)", async () => {
    // Disparo que sai do sistema passa pelo dono: são 26 destinatários e não
    // há desfazer. Começou aberta a Arte e Atendimento; foi fechada.
    expect((await reenviar("admin")).status).toBe(200);
    for (const papel of ["arte", "atendimento", "grafica", "solicitacao"]) {
      expect((await reenviar(papel)).status).toBe(403);
    }
  });

  it("usa o book ATUAL do evento e devolve a frase do desfecho", async () => {
    H.notifyBookSaved.mockResolvedValue({ status: "sent", para: ["exec@nortemkt.com"], copia: [], descartados: [] });

    const r = await reenviar("admin");

    expect(H.notifyBookSaved).toHaveBeenCalledWith(expect.objectContaining({
      bookUrl: "/objects/books/corrida.pdf",
      itemCount: 2,               // as duas peças que estão no book
    }));
    expect(r.body.mensagem).toBe("desfecho:sent");
    expect(H.createAuditLog).toHaveBeenCalledWith(
      expect.anything(), "updated", "event", "evento-1", "Reenvio manual. desfecho:sent",
    );
  });

  it("evento sem book publicado responde 409, não um e-mail vazio", async () => {
    H.storage.getItemsByEvent.mockResolvedValue([{ id: "item-1", bookUrl: null }]);
    const r = await reenviar("admin");
    expect(r.status).toBe(409);
    expect(H.notifyBookSaved).not.toHaveBeenCalled();
  });
});
