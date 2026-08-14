// ─────────────────────────────────────────────────────────────────────────────
// EVENTO ENCERRADO NÃO RECEBE PEÇA NOVA — as cinco portas de entrada.
//
// PORQUÊ: o encerramento manual (POST /api/events/:id/close) promete que o
// evento sai da Gestão de Prazos e das filas de trabalho. Uma peça criada
// DEPOIS disso nasceria fora dos dois lugares: invisível para quem teria de
// fazê-la, e ainda assim cobrada de ninguém. O ramo antigo de `completed` (que
// REABRE o evento ao receber peça) não pode valer aqui — ele desfaria em
// silêncio uma decisão de admin, exatamente o que a guarda de
// `updateEventStatus` existe para impedir.
//
// Mesmo estilo de complemento-rotas.test.ts: os handlers REAIS de
// server/routes/items.ts rodam; só a borda (db, storage, efeitos de ./shared e
// os serviços de planilha) é mockada.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { isEventoEncerrado, EVENT_CLOSED_STATUS } from "@/lib/status";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: { transaction: (async () => {}) as any },
  broadcast: (() => {}) as any,
  createAuditLog: (async () => {}) as any,
  updateEventStatus: (async () => {}) as any,
  confirmImport: (async () => {}) as any,
}));

vi.mock("../db", () => ({ db: H.db, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real,
    requireAuth: (_req: any, _res: any, next: any) => next(),
    broadcast: (...a: any[]) => H.broadcast(...a),
    createAuditLog: (...a: any[]) => H.createAuditLog(...a),
    updateEventStatus: (...a: any[]) => H.updateEventStatus(...a),
  };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({
  handlePreviewXlsx: vi.fn(),
  handleConfirmImport: (...a: any[]) => H.confirmImport(...a),
}));
vi.mock("../services/xlsxExport", () => ({
  handleExportItemsXlsx: vi.fn(),
  handleExportSelectedItemsXlsx: vi.fn(),
}));

const { registerItemRoutes, EVENTO_ENCERRADO_ERRO } = await import("../routes/items");

// ─────────────────────────────────────────────────────────────────────────────
type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const appFalso: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  appFalso[verbo] = (caminho: string, ...hs: Handler[]) => {
    rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs);
    return appFalso;
  };
}
registerItemRoutes(appFalso);

async function chamar(
  chave: string,
  ctx: { params?: any; body?: any; userRole?: string; userId?: string } = {},
): Promise<{ status: number; body: any }> {
  const handlers = rotas.get(chave);
  if (!handlers) throw new Error(`Rota não registrada: ${chave}`);

  const req: any = {
    params: ctx.params ?? {},
    body: ctx.body ?? {},
    query: {},
    headers: {},
    userRole: ctx.userRole ?? "admin",
    userId: ctx.userId ?? "user-1",
    userName: "Maria Silva",
    session: { userId: ctx.userId ?? "user-1", userRole: ctx.userRole ?? "admin" },
  };

  const res: any = { _status: 200, _body: undefined, _done: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.set = () => res;
  res.setHeader = () => res;
  res.json = (b: any) => { res._body = b; res._done = true; return res; };
  res.send = res.json;

  for (const h of handlers) {
    let chamouNext = false;
    await h(req, res, () => { chamouNext = true; });
    if (res._done || !chamouNext) break;
  }
  return { status: res._status, body: res._body };
}

// ─────────────────────────────────────────────────────────────────────────────
let mundo: { eventos: Record<string, any>; itens: Record<string, any> };

const PECA_VALIDA = {
  eventId: "ev-1",
  type: "Pórtico 6x3",
  description: "Entrada principal",
  quantity: 2,
  area: "18.00",
  visual: "18.00",
  material: "Lona 440g",
  finish: "Ilhós",
  measurement: "6x3",
  calculatedM2: "36.00",
};

function evento(over: Record<string, any> = {}) {
  return {
    id: "ev-1",
    name: "COPA NORTE 2026",
    status: "created",
    priority: "alta",
    createdBy: "user-1",
    truckDepartureDate: new Date("2099-01-01T00:00:00Z"),
    ...over,
  };
}

beforeEach(() => {
  mundo = {
    eventos: { "ev-1": evento(), "ev-origem": evento({ id: "ev-origem", name: "COPA SUL 2026" }) },
    itens: {
      "it-origem": {
        id: "it-origem", displayId: "#0001", eventId: "ev-origem", ...PECA_VALIDA,
        status: "delivered", quantityProduced: 2, reuseQty: 0, isReuse: false,
        parentItemId: null, deletedAt: null, observations: null,
        fileWidth: "6.10", fileHeight: "3.10",
      },
    },
  };

  H.db.transaction = vi.fn(async (cb: any) => await cb({}));
  H.broadcast = vi.fn(() => {});
  H.createAuditLog = vi.fn(async () => {});
  H.updateEventStatus = vi.fn(async () => {});
  H.confirmImport = vi.fn(async (_req: any, res: any) => res.status(200).json({ imported: 1 }));

  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getEvent = vi.fn(async (id: string) => mundo.eventos[id]);
  s.getItem = vi.fn(async (id: string) => mundo.itens[id]);
  s.getItemsByEvent = vi.fn(async (id: string) =>
    Object.values(mundo.itens).filter((i: any) => i.eventId === id));
  s.createItem = vi.fn(async (d: any) => ({ id: "novo-1", displayId: "#0100", ...d }));
  s.createBulkItems = vi.fn(async (rs: any[]) => rs.map((r, i) => ({ id: `novo-${i}`, displayId: `#010${i}`, ...r })));
  s.createNotification = vi.fn(async (n: any) => ({ id: "notif-1", ...n }));
  s.updateEvent = vi.fn(async (id: string, d: any) => {
    mundo.eventos[id] = { ...mundo.eventos[id], ...d };
    return mundo.eventos[id];
  });
  s.getLiveComplements = vi.fn(async () => []);
  s.findRecentComplement = vi.fn(async () => undefined);
});

const encerrar = () => { mundo.eventos["ev-1"] = evento({ status: "closed" }); };
const nadaFoiCriado = () => {
  expect(H.storage.createItem).not.toHaveBeenCalled();
  expect(H.storage.createBulkItems).not.toHaveBeenCalled();
};

// ─────────────────────────────────────────────────────────────────────────────
describe("evento encerrado recusa peça nova — 409, sem auto-reabrir", () => {
  it("POST /api/items", async () => {
    encerrar();

    const r = await chamar("POST /api/items", { body: PECA_VALIDA });

    expect(r.status).toBe(409);
    expect(r.body.error).toBe(EVENTO_ENCERRADO_ERRO);
    nadaFoiCriado();
    // A DECISÃO CONTINUA DE PÉ: o ramo de "completed" logo abaixo reabriria o
    // evento e apagaria a prioridade — é justamente o que não pode acontecer.
    expect(mundo.eventos["ev-1"].status).toBe("closed");
    expect(mundo.eventos["ev-1"].priority).toBe("alta");
  });

  it("POST /api/items/bulk", async () => {
    encerrar();

    const r = await chamar("POST /api/items/bulk", { body: { items: [PECA_VALIDA, PECA_VALIDA] } });

    expect(r.status).toBe(409);
    expect(r.body.error).toBe(EVENTO_ENCERRADO_ERRO);
    nadaFoiCriado();
  });

  it("POST /api/events/:id/confirm-import — o import da planilha nem começa", async () => {
    encerrar();

    const r = await chamar("POST /api/events/:id/confirm-import", {
      params: { id: "ev-1" },
      body: { items: [PECA_VALIDA], fileName: "lista.xlsx" },
    });

    expect(r.status).toBe(409);
    expect(r.body.error).toBe(EVENTO_ENCERRADO_ERRO);
    expect(H.confirmImport).not.toHaveBeenCalled();
  });

  it("POST /api/events/:id/clone-items", async () => {
    encerrar();

    const r = await chamar("POST /api/events/:id/clone-items", {
      params: { id: "ev-1" },
      body: { sourceEventId: "ev-origem" },
    });

    expect(r.status).toBe(409);
    expect(r.body.error).toBe(EVENTO_ENCERRADO_ERRO);
    nadaFoiCriado();
  });

  it("POST /api/items/:id/complement — a peça-filha nasceria invisível na fila", async () => {
    mundo.itens["mae-1"] = {
      ...mundo.itens["it-origem"], id: "mae-1", displayId: "#0062", eventId: "ev-1",
    };
    encerrar();

    const r = await chamar("POST /api/items/:id/complement", {
      params: { id: "mae-1" },
      body: { quantity: 3, reason: "cliente confirmou dois pórticos extras para sábado" },
    });

    expect(r.status).toBe(409);
    expect(r.body.error).toBe(EVENTO_ENCERRADO_ERRO);
    expect(H.db.transaction).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("evento NÃO encerrado segue exatamente como antes", () => {
  it("evento vivo aceita a peça", async () => {
    const r = await chamar("POST /api/items", { body: PECA_VALIDA });

    expect(r.status).toBe(201);
    expect(H.storage.createItem).toHaveBeenCalled();
  });

  it("evento 'completed' continua REABRINDO ao receber peça (derivação, não decisão)", async () => {
    mundo.eventos["ev-1"] = evento({ status: "completed" });

    const r = await chamar("POST /api/items", { body: PECA_VALIDA });

    expect(r.status).toBe(201);
    // "completed" é carimbo derivado da produção: reabri-lo só devolve o evento
    // à própria derivação. Só "closed" é decisão de gente.
    expect(mundo.eventos["ev-1"].status).toBe("created");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O MESMO gate, do lado do cliente: é ele que tira o evento encerrado das filas
// de Arte/Atendimento/Gráfica e do calendário (client/src/lib/status.ts).
describe("isEventoEncerrado — o gate das filas no cliente", () => {
  it("lê a coluna CRUA: é a única coisa que `item.event` traz nas listas de peça", () => {
    // `item.event` vem direto do storage, sem passar por enrichEvent — não há
    // `manuallyClosed` ali, só o status.
    expect(isEventoEncerrado({ status: EVENT_CLOSED_STATUS })).toBe(true);
    expect(isEventoEncerrado({ status: "created" })).toBe(false);
    expect(isEventoEncerrado({ status: "completed" })).toBe(false);
  });

  it("lê `manuallyClosed` quando o evento vem enriquecido (/api/events)", () => {
    expect(isEventoEncerrado({ status: "created", manuallyClosed: true })).toBe(true);
    expect(isEventoEncerrado({ status: "created", manuallyClosed: false })).toBe(false);
  });

  it("peça sem evento não some da fila por engano", () => {
    expect(isEventoEncerrado(null)).toBe(false);
    expect(isEventoEncerrado(undefined)).toBe(false);
    expect(isEventoEncerrado({})).toBe(false);
  });
});
