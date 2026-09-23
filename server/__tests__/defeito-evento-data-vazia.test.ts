// ─────────────────────────────────────────────────────────────────────────────
// DEFEITO (integração, 23/09): storage.updateEvent aceitava data vazia — o
// `if (data.startDate)` pulava a conversão, o "" ia cru para a coluna
// timestamp e o erro do driver virava 500. E a rota deixava passar um dia que
// não existe ("2099-02-30" era gravado como 02/03). Agora: 400 com frase
// "Data inválida…" na rota, e o storage barra antes do banco.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/banco_nunca_acessado";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  gravados: [] as any[],
}));

vi.mock("../db", () => ({
  db: {
    update: () => ({ set: (d: any) => ({ where: () => ({ returning: async () => { H.gravados.push(d); return [{ id: "ev-1", ...d }]; } }) }) }),
  },
  pool: {},
}));
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
  };
});
vi.mock("../services/prioridadeAutomatica", () => ({ aplicarPrioridadeAutomatica: vi.fn(async () => {}) }));

const { registerEventRoutes } = await import("../routes/events");
const { DatabaseStorage } = await import("../storage") as any;
const { responderErro } = await import("../erros");

type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const appFalso: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  appFalso[verbo] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs); return appFalso; };
}
registerEventRoutes(appFalso);

async function chamar(chave: string, body: any, params: any = {}) {
  const req: any = { params, body, query: {}, headers: {}, userRole: "admin", userId: "u1", userName: "Maria", session: {} };
  const res: any = { _status: 200, _body: undefined, _done: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; res._done = true; return res; };
  res.set = () => res; res.setHeader = () => res; res.send = res.json;
  for (const h of rotas.get(chave)!) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (res._done || !seguiu) break;
  }
  return { status: res._status, body: res._body };
}

let evento: any;
beforeEach(() => {
  H.gravados = [];
  evento = { id: "ev-1", name: "COPA", status: "created", startDate: new Date("2099-03-10T08:00:00Z"), truckDepartureDate: new Date("2099-03-01T11:00:00Z") };
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getEvent = vi.fn(async () => evento);
  s.updateEvent = vi.fn(async (_id: string, d: any) => ({ ...evento, ...d }));
  s.createEvent = vi.fn(async (d: any) => ({ id: "novo", ...d }));
});

describe("PATCH /api/events/:id — data vazia ou inexistente é 400 com frase", () => {
  it.each([
    [{ startDate: "" }, "Data inválida — preencha o início do evento."],
    [{ truckDepartureDate: "   " }, "Data inválida — preencha a saída do caminhão."],
  ])("%j → 400 \"Data inválida…\"", async (body, frase) => {
    const r = await chamar("PATCH /api/events/:id", body, { id: "ev-1" });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe(frase);
    expect(H.storage.updateEvent).not.toHaveBeenCalled();
  });

  it("dia que não existe (30/02) não vira 02/03 em silêncio", async () => {
    const r = await chamar("PATCH /api/events/:id", { startDate: "2099-02-30", truckDepartureDate: "2099-02-20" }, { id: "ev-1" });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/^Data inválida — confira o início do evento/);
    expect(H.storage.updateEvent).not.toHaveBeenCalled();
  });

  it("data válida continua passando", async () => {
    const r = await chamar("PATCH /api/events/:id", { startDate: "2099-03-12", truckDepartureDate: "2099-03-02" }, { id: "ev-1" });
    expect(r.status).toBe(200);
    expect(H.storage.updateEvent).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/events — a mesma régua na criação", () => {
  it("início vazio → 400 \"Data inválida…\"", async () => {
    const r = await chamar("POST /api/events", { name: "COPA", startDate: "", truckDepartureDate: "2099-03-01" });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Data inválida — preencha o início do evento.");
    expect(H.storage.createEvent).not.toHaveBeenCalled();
  });
});

describe("storage.updateEvent — a última porta antes do banco", () => {
  const armazem = new DatabaseStorage();

  it.each([[{ startDate: "" }], [{ truckDepartureDate: "" }], [{ startDate: null }], [{ startDate: "2099-02-30" }]])(
    "%j não chega ao banco e vira 400 (não 500)",
    async (dados) => {
      const erro = await armazem.updateEvent("ev-1", dados).then(() => null, (e: unknown) => e);
      expect(H.gravados).toEqual([]);
      expect(erro).toMatchObject({ httpStatus: 400 });
      // Pelo catch das rotas (responderErro) sai 400 com a frase, não o 500 genérico.
      const res: any = { status(c: number) { res.c = c; return res; }, json(b: any) { res.b = b; return res; } };
      responderErro(res, erro, "teste");
      expect(res.c).toBe(400);
      expect(res.b.error).toMatch(/^Data inválida/);
    },
  );

  it("data boa é convertida e gravada; campo ausente não é tocado", async () => {
    await armazem.updateEvent("ev-1", { startDate: "2099-03-12T08:00:00Z", name: "COPA 2" });
    expect(H.gravados).toHaveLength(1);
    expect(H.gravados[0].startDate).toEqual(new Date("2099-03-12T08:00:00Z"));
    expect("truckDepartureDate" in H.gravados[0]).toBe(false);
  });
});
