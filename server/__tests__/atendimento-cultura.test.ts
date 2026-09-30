// ─────────────────────────────────────────────────────────────────────────────
// ATENDIMENTO – CULTURA (dono, 30/09): "um novo perfil de atendimento —
// cultura — que é igual, mas pode criar e editar evento". Decisão: só o
// EVENTO — peças continuam com a Solicitação; excluir e encerrar, com o admin.
//
// Desenho igual ao do Kit: o papel continua "atendimento" e a MARCA `cultura`
// no usuário acrescenta a permissão (shared/permissoes: podeGerirEvento).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/banco_nunca_acessado";

const H = vi.hoisted(() => ({ storage: {} as Record<string, any> }));

vi.mock("../db", () => ({ db: {}, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return { ...real, requireAuth: (_req: any, _res: any, next: any) => next(), broadcast: () => {}, createAuditLog: async () => {} };
});
vi.mock("../services/prioridadeAutomatica", () => ({ aplicarPrioridadeAutomatica: vi.fn(async () => {}) }));

const { registerEventRoutes } = await import("../routes/events");
const { canCreateItemsFor } = await import("../routes/itens/comum");
const { podeGerirEvento } = await import("@shared/permissoes");

type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const appFalso: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  appFalso[verbo] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs); return appFalso; };
}
registerEventRoutes(appFalso);

async function chamar(chave: string, body: any, quem: { userRole: string; userCultura?: boolean }, params: any = {}) {
  const req: any = { params, body, query: {}, headers: {}, userId: "u-cult", userName: "Carla Cultura", session: {}, ...quem };
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

const EVENTO = { name: "FESTIVAL DE CULTURA", startDate: "2099-03-10", truckDepartureDate: "2099-03-01" };
let evento: any;
beforeEach(() => {
  evento = { id: "ev-1", name: "COPA", status: "created", createdBy: "u-cult", startDate: new Date("2099-03-10T08:00:00Z"), truckDepartureDate: new Date("2099-03-01T11:00:00Z") };
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getEvent = vi.fn(async () => evento);
  s.updateEvent = vi.fn(async (_id: string, d: any) => ({ ...evento, ...d }));
  s.createEvent = vi.fn(async (d: any) => ({ id: "novo", ...d }));
});

describe("a regra (shared/permissoes)", () => {
  it("admin e Solicitação gerem evento; Atendimento só com a marca Cultura; a marca não vale em outro papel", () => {
    expect(podeGerirEvento("admin")).toBe(true);
    expect(podeGerirEvento("solicitacao")).toBe(true);
    expect(podeGerirEvento("atendimento")).toBe(false);
    expect(podeGerirEvento("atendimento", true)).toBe(true);
    expect(podeGerirEvento("arte", true)).toBe(false);
    expect(podeGerirEvento("grafica", true)).toBe(false);
  });
});

describe("rotas de evento", () => {
  it("Atendimento SEM a marca: criar e editar evento continuam 403", async () => {
    expect((await chamar("POST /api/events", EVENTO, { userRole: "atendimento" })).status).toBe(403);
    expect((await chamar("PATCH /api/events/:id", { name: "X" }, { userRole: "atendimento" }, { id: "ev-1" })).status).toBe(403);
    expect(H.storage.createEvent).not.toHaveBeenCalled();
    expect(H.storage.updateEvent).not.toHaveBeenCalled();
  });

  it("Atendimento – Cultura cria e edita evento", async () => {
    const c = await chamar("POST /api/events", EVENTO, { userRole: "atendimento", userCultura: true });
    expect(c.status, JSON.stringify(c.body)).not.toBe(403);
    expect(H.storage.createEvent).toHaveBeenCalled();
    const e = await chamar("PATCH /api/events/:id", { name: "COPA NOVA" }, { userRole: "atendimento", userCultura: true }, { id: "ev-1" });
    expect(e.status, JSON.stringify(e.body)).toBe(200);
    expect(H.storage.updateEvent).toHaveBeenCalled();
  });

  it("excluir e encerrar evento continuam só do admin", async () => {
    const quem = { userRole: "atendimento", userCultura: true };
    for (const chave of ["DELETE /api/events/:id", "POST /api/events/:id/close"]) {
      if (!rotas.has(chave)) continue;
      expect((await chamar(chave, {}, quem, { id: "ev-1" })).status, chave).toBe(403);
    }
  });
});

describe("criar o evento NÃO dá a lista de peças ao Cultura", () => {
  it("o criador comum mexe na lista do evento dele; o Cultura criador, não", async () => {
    expect(await canCreateItemsFor({ userRole: "atendimento", userId: "u-cult" }, "ev-1")).toBe(true);
    expect(await canCreateItemsFor({ userRole: "atendimento", userId: "u-cult", userCultura: true }, "ev-1")).toBe(false);
    expect(await canCreateItemsFor({ userRole: "solicitacao", userCultura: false }, "ev-1")).toBe(true);
  });

  it("a tela espelha: canEditLists exclui o Cultura criador; Eventos usa podeGerirEvento", () => {
    const ler = (p: string) => readFileSync(join(import.meta.dirname, "..", "..", p), "utf8");
    expect(ler("client/src/pages/event-detail.tsx")).toContain("event.createdBy === user.id && !user.cultura");
    const eventos = ler("client/src/pages/eventos.tsx");
    expect(eventos).toContain("const canEdit = podeGerirEvento(role, user?.cultura);");
    expect(eventos).toContain("const canCreate = podeGerirEvento(role, user?.cultura);");
  });
});

describe("a marca na sessão e no cadastro", () => {
  const AUTH = readFileSync(join(import.meta.dirname, "..", "routes", "auth.ts"), "utf8");
  it("o login (senha e SSO) carrega a marca só para quem é Atendimento", () => {
    expect(AUTH).toContain(`req.session.userCultura = user.role === "atendimento" && user.cultura === true;`);
    expect(readFileSync(join(import.meta.dirname, "..", "index.ts"), "utf8")).toContain(`req.session.userCultura = fullUser[0].role === "atendimento" && fullUser[0].cultura === true;`);
  });
  it("mudar a marca derruba as sessões da pessoa (entra de novo já com a permissão certa)", () => {
    expect(AUTH).toContain("validatedData.kit !== undefined || validatedData.cultura !== undefined");
  });
  it("marca em perfil que não é Atendimento não pega; trocar de perfil a derruba", () => {
    expect(AUTH).toContain(`if (papelFinal !== "atendimento") updateData.cultura = false;`);
    expect(AUTH).toContain(`cultura: userData.role === "atendimento" && userData.cultura === true,`);
  });
});
