// Rotas de autenticação e gestão de usuários, rodando os handlers reais com o
// banco mockado: senha de cadastro, e-mail sem maiúsculas, tempo constante,
// limite por conta e sessões encerradas na exclusão/redefinição de senha.
import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

const H = vi.hoisted(() => ({
  usuarios: [] as any[],
  queries: [] as { sql: string; params: any[] }[],
  criados: [] as any[],
  avisos: [] as string[],
}));

vi.mock("../db", () => ({
  db: {},
  pool: { query: async (sql: string, params: any[]) => { H.queries.push({ sql, params }); return { rows: [], rowCount: 0 }; } },
}));
vi.mock("../storage", () => ({
  storage: {
    createUser: async (u: any) => { const novo = { id: `id-${H.criados.length}`, ...u }; H.criados.push(novo); return novo; },
    getUser: async (id: string) => H.usuarios.find((u) => u.id === id),
    updateUser: async (id: string, d: any) => { const u = H.usuarios.find((x) => x.id === id); if (u) Object.assign(u, d); return u; },
    deleteUser: async (id: string) => { H.usuarios = H.usuarios.filter((u) => u.id !== id); return true; },
    createAuditLog: async () => ({}),
    getAllUsers: async () => H.usuarios,
  },
}));
vi.mock("../cache", () => ({ invalidateEventsCache: vi.fn(), invalidateNotificationsCache: vi.fn() }));
vi.mock("../login-seguro", async () => {
  const real = await vi.importActual<any>("../login-seguro");
  return {
    ...real,
    // A consulta real é `lower(email) = lower($1)`; aqui, o mesmo critério em memória.
    buscarUsuarioPorEmail: async (email: string) =>
      H.usuarios.find((u) => u.email === email.trim()) ?? H.usuarios.find((u) => u.email.toLowerCase() === email.trim().toLowerCase()),
  };
});
vi.mock("../sessoes-encerradas", () => ({ avisarSessoesEncerradas: (id: string) => H.avisos.push(id) }));

const { registerAuthRoutes } = await import("../routes/auth");

type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const app: any = {};
for (const v of ["get", "post", "patch", "put", "delete"]) {
  app[v] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${v.toUpperCase()} ${caminho}`, hs); return app; };
}
registerAuthRoutes(app);

let ip = 0;
async function chamar(chave: string, ctx: { body?: any; params?: any; session?: any; userId?: string; ip?: string } = {}) {
  const hs = rotas.get(chave)!;
  const session: any = {
    userId: "admin-1", userRole: "admin", userName: "Admin",
    regenerate: (cb: any) => cb(), save: (cb: any) => cb(), destroy: (cb: any) => cb(),
    ...ctx.session,
  };
  const req: any = { body: ctx.body ?? {}, params: ctx.params ?? {}, session, sessionID: "sid-atual", userId: ctx.userId ?? "admin-1", userName: "Admin", ip: ctx.ip ?? `10.0.0.${++ip}` };
  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: any) => { res.body = b; return res; };
  for (const h of hs) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (!seguiu) break;
  }
  return { status: res.statusCode, body: res.body, req };
}

beforeEach(() => {
  H.usuarios = [];
  H.queries = [];
  H.criados = [];
  H.avisos = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("cadastro", () => {
  it("sem senha: grava senha aleatória — nunca o texto fixo antigo", async () => {
    const r = await chamar("POST /api/auth/register", { body: { name: "Ana", email: "ana@x.com", role: "arte" } });
    expect(r.status).toBe(200);
    const hash = H.criados[0].passwordHash;
    expect(await bcrypt.compare("sso_placeholder_pw", hash)).toBe(false);
    expect(r.body.passwordHash).toBeUndefined();
  });

  it("duas cadastradas sem senha não ficam com a mesma senha", async () => {
    await chamar("POST /api/auth/register", { body: { name: "A", email: "a@x.com" } });
    await chamar("POST /api/auth/register", { body: { name: "B", email: "b@x.com" } });
    expect(H.criados[0].passwordHash).not.toBe(H.criados[1].passwordHash);
  });

  it("com senha: a senha informada vale", async () => {
    await chamar("POST /api/auth/register", { body: { name: "A", email: "a@x.com", password: "segredo123" } });
    expect(await bcrypt.compare("segredo123", H.criados[0].passwordHash)).toBe(true);
  });

  it("e-mail já existente com outra grafia é recusado", async () => {
    H.usuarios = [{ id: "u1", email: "Ana@X.com" }];
    const r = await chamar("POST /api/auth/register", { body: { name: "Ana", email: "ana@x.com" } });
    expect(r.status).toBe(400);
  });
});

describe("login", () => {
  beforeEach(async () => {
    H.usuarios = [{ id: "u1", name: "Ana", email: "Ana@X.com", role: "arte", kit: false, passwordHash: await bcrypt.hash("certa123", 4) }];
  });

  it("entra com o e-mail em qualquer caixa e carimba o início da sessão", async () => {
    const r = await chamar("POST /api/auth/login", { body: { email: "ana@x.COM", password: "certa123" }, session: {} });
    expect(r.status).toBe(200);
    expect(r.req.session.userId).toBe("u1");
    expect(typeof r.req.session.loginEm).toBe("number");
  });

  it("'não existe' e 'senha errada' respondem igual", async () => {
    const a = await chamar("POST /api/auth/login", { body: { email: "ninguem@x.com", password: "qualquer" }, session: {} });
    const b = await chamar("POST /api/auth/login", { body: { email: "ana@x.com", password: "errada" }, session: {} });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });

  it("e-mail inexistente também gasta um bcrypt (tempo constante)", async () => {
    const compare = vi.spyOn(bcrypt, "compare");
    await chamar("POST /api/auth/login", { body: { email: "ninguem@x.com", password: "qualquer" }, session: {} });
    expect(compare).toHaveBeenCalled();
    compare.mockRestore();
  });

  it("limite por conta: trocar de IP não dá tentativas novas", async () => {
    let ultimo = 0;
    for (let i = 0; i < 12; i++) {
      const r = await chamar("POST /api/auth/login", { body: { email: "Alvo@X.com", password: "chute" + i }, session: {} });
      ultimo = r.status;
    }
    expect(ultimo).toBe(429);
  });
});

describe("sessões encerradas", () => {
  it("excluir usuário apaga as sessões dele e avisa o tempo real", async () => {
    H.usuarios = [{ id: "u2", name: "Beto", email: "b@x.com" }];
    const r = await chamar("DELETE /api/users/:id", { params: { id: "u2" } });
    expect(r.status).toBe(200);
    const q = H.queries.find((x) => x.sql.includes("DELETE FROM session"));
    expect(q?.params).toEqual(["u2"]);
    expect(H.avisos).toEqual(["u2"]);
  });

  it("admin redefinir a senha de alguém derruba todas as sessões dessa pessoa", async () => {
    H.usuarios = [{ id: "u2", name: "Beto", email: "b@x.com" }];
    const r = await chamar("PATCH /api/users/:id", { params: { id: "u2" }, body: { password: "novaSenha1" } });
    expect(r.status).toBe(200);
    const q = H.queries.find((x) => x.sql.includes("DELETE FROM session"));
    expect(q?.params).toEqual(["u2"]);
    expect(H.avisos).toEqual(["u2"]);
  });

  it("edição sem senha/perfil não mexe em sessão", async () => {
    H.usuarios = [{ id: "u2", name: "Beto", email: "b@x.com" }];
    await chamar("PATCH /api/users/:id", { params: { id: "u2" }, body: { name: "Roberto" } });
    expect(H.queries.some((x) => x.sql.includes("DELETE FROM session"))).toBe(false);
  });
});
