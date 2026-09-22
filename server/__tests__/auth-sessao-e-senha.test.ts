// ─────────────────────────────────────────────────────────────────────────────
// AUTENTICAÇÃO — o que `seguranca-auth.test.ts` ainda não cobria.
//
// Aquele arquivo pina o cadastro, o login e as sessões derrubadas na exclusão /
// redefinição de senha. Sobravam de fora três caminhos que decidem quem entra e
// com que poder — e todos os três já quebraram uma vez nesta base:
//
//   1. TROCA DE SENHA. O flag "primeiro acesso" é decidido pelo REGISTRO do
//      usuário, nunca pelo corpo da requisição. Antes bastava o cliente omitir
//      `currentPassword` para trocar a senha de uma sessão aberta sem provar
//      que conhecia a senha atual. Aqui o teste manda o `isFirstAccess: true`
//      no corpo de propósito, para provar que ele é ignorado.
//   2. VER COMO (15/09). O admin empresta o perfil à própria SESSÃO. Quem é
//      admin de verdade fica em `papelReal` — e é ele, não `userRole`, que
//      autoriza a próxima troca. Sem isso, o primeiro "ver como grafica"
//      trancaria o admin fora do próprio botão de voltar.
//   3. SESSÃO VENCIDA ATÉ A ROTA. `sessao-valida.ts` já tem teste de unidade,
//      mas ninguém checava o encontro dele com `requireAuth`: sessão estourada
//      precisa VIRAR 401 na rota, não só ser destruída em silêncio.
//
// Como sempre por aqui: os handlers são os reais, o banco é de mentira.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

const H = vi.hoisted(() => ({
  usuarios: [] as any[],
  queries: [] as { sql: string; params: any[] }[],
  trilha: [] as { quem: any; acao: string; detalhe: string }[],
  avisos: [] as string[],
}));

vi.mock("../db", () => ({
  db: {},
  pool: { query: async (sql: string, params: any[]) => { H.queries.push({ sql, params }); return { rows: [], rowCount: 0 }; } },
}));
vi.mock("../storage", () => ({
  storage: {
    getUser: async (id: string) => H.usuarios.find((u) => u.id === id),
    updateUser: async (id: string, d: any) => { const u = H.usuarios.find((x) => x.id === id); if (u) Object.assign(u, d); return u; },
    createUser: async (u: any) => u,
    deleteUser: async () => true,
    getAllUsers: async () => H.usuarios,
    createAuditLog: async () => ({}),
  },
}));
vi.mock("../cache", () => ({ invalidateEventsCache: vi.fn(), invalidateNotificationsCache: vi.fn() }));
vi.mock("../sessoes-encerradas", () => ({ avisarSessoesEncerradas: (id: string) => H.avisos.push(id) }));
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real,
    // O limitador é por IP/conta e tem teste próprio; aqui ele só atrapalharia
    // os casos que repetem a mesma rota.
    changePasswordRateLimiter: (_req: any, _res: any, next: any) => next(),
    createAuditLog: async (quem: any, acao: string, _t: string, _id: string, detalhe: string) => {
      H.trilha.push({ quem, acao, detalhe });
    },
  };
});

const { registerAuthRoutes } = await import("../routes/auth");
const { validarSessao, TETO_DA_SESSAO_MS } = await import("../sessao-valida");
const { requireAuth } = await import("../routes/shared");

// ── App de mentira ───────────────────────────────────────────────────────────
type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const app: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  app[verbo] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs); return app; };
}
registerAuthRoutes(app);

type Ctx = { body?: any; params?: any; session?: any; userId?: string; sessionID?: string };
async function chamar(chave: string, ctx: Ctx = {}) {
  const hs = rotas.get(chave);
  if (!hs) throw new Error(`Rota não registrada: ${chave}`);
  const session: any = {
    userId: "u1", userRole: "admin", userName: "Ana",
    regenerate: (cb: any) => cb(), save: (cb: any) => cb(), destroy: (cb: any) => cb(),
    ...ctx.session,
  };
  const req: any = {
    body: ctx.body ?? {}, params: ctx.params ?? {}, session,
    sessionID: ctx.sessionID ?? "sid-desta-aba",
    userId: ctx.userId ?? session.userId, userName: session.userName, userRole: session.userRole,
    ip: "10.0.0.1",
  };
  const res: any = { statusCode: 200, body: undefined, pronto: false };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: any) => { res.body = b; res.pronto = true; return res; };
  for (const h of hs) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (res.pronto || !seguiu) break;
  }
  return { status: res.statusCode, body: res.body, req };
}

const SENHA_ATUAL = "senhaAntiga1";
async function usuario(over: any = {}) {
  return {
    id: "u1", name: "Ana", email: "ana@norte.com", role: "admin", kit: false,
    mustChangePassword: false, passwordHash: await bcrypt.hash(SENHA_ATUAL, 4),
    ...over,
  };
}

const sessoesApagadas = () => H.queries.filter((q) => q.sql.includes("DELETE FROM session"));

beforeEach(async () => {
  H.usuarios = [await usuario()];
  H.queries = [];
  H.trilha = [];
  H.avisos = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ═════════════════════════════════════════════════════════════════════════════
// 1 · Troca de senha
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/auth/change-password", () => {
  const trocar = (body: any, session?: any) => chamar("POST /api/auth/change-password", { body, session });

  it("com a senha atual certa: grava o hash novo e some o mustChangePassword", async () => {
    const r = await trocar({ currentPassword: SENHA_ATUAL, newPassword: "senhaNova123", confirmPassword: "senhaNova123" });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ message: "Senha alterada com sucesso" });
    expect(await bcrypt.compare("senhaNova123", H.usuarios[0].passwordHash)).toBe(true);
    expect(H.usuarios[0].mustChangePassword).toBe(false);
  });

  it("senha atual ERRADA: 401 e a senha gravada não muda", async () => {
    const hashAntes = H.usuarios[0].passwordHash;
    const r = await trocar({ currentPassword: "chute", newPassword: "senhaNova123", confirmPassword: "senhaNova123" });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe("Senha atual incorreta");
    expect(H.usuarios[0].passwordHash).toBe(hashAntes);
  });

  it("sem senha atual: 400 — e o `isFirstAccess` do CORPO não isenta ninguém", async () => {
    // A regressão que este caso existe para travar: quem já está logado
    // trocava a senha sem provar que conhecia a atual, bastando mentir aqui.
    const hashAntes = H.usuarios[0].passwordHash;
    const r = await trocar({ isFirstAccess: true, newPassword: "senhaNova123", confirmPassword: "senhaNova123" });
    expect(r.status).toBe(400);
    expect(H.usuarios[0].passwordHash).toBe(hashAntes);
  });

  it("primeiro acesso (flag do REGISTRO): troca sem a senha atual", async () => {
    H.usuarios = [await usuario({ mustChangePassword: true })];
    const r = await trocar({ newPassword: "senhaNova123", confirmPassword: "senhaNova123" });
    expect(r.status).toBe(200);
    expect(H.usuarios[0].mustChangePassword).toBe(false);
  });

  it("nova senha curta ou confirmação diferente: 400, sem gravar", async () => {
    const hashAntes = H.usuarios[0].passwordHash;
    expect((await trocar({ currentPassword: SENHA_ATUAL, newPassword: "curta", confirmPassword: "curta" })).status).toBe(400);
    expect((await trocar({ currentPassword: SENHA_ATUAL, newPassword: "senhaNova123", confirmPassword: "outraCoisa1" })).status).toBe(400);
    expect(H.usuarios[0].passwordHash).toBe(hashAntes);
  });

  it("as OUTRAS sessões da pessoa caem; a aba que trocou continua", async () => {
    await trocar({ currentPassword: SENHA_ATUAL, newPassword: "senhaNova123", confirmPassword: "senhaNova123" });
    const q = sessoesApagadas()[0];
    expect(q.sql).toContain("sid <> $2");
    expect(q.params).toEqual(["u1", "sid-desta-aba"]);
    expect(H.avisos).toEqual(["u1"]);
  });

  it("a trilha registra 'password_changed' — não um 'updated' genérico", async () => {
    await trocar({ currentPassword: SENHA_ATUAL, newPassword: "senhaNova123", confirmPassword: "senhaNova123" });
    expect(H.trilha.map((l) => l.acao)).toEqual(["password_changed"]);
    expect(H.trilha[0].detalhe).toBe("Senha alterada");
  });

  it("usuário que sumiu do banco no meio do caminho: 404", async () => {
    H.usuarios = [];
    expect((await trocar({ currentPassword: SENHA_ATUAL, newPassword: "senhaNova123", confirmPassword: "senhaNova123" })).status).toBe(404);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 · Ver como
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/auth/ver-como", () => {
  const verComo = (body: any, session?: any) => chamar("POST /api/auth/ver-como", { body, session });

  it("admin empresta o perfil à sessão e guarda quem ele É em papelReal", async () => {
    const r = await verComo({ role: "grafica" });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ role: "grafica", kit: false, papelReal: "admin" });
    expect(r.req.session.userRole).toBe("grafica");
    expect(r.req.session.papelReal).toBe("admin");
  });

  it("de um perfil emprestado dá para ir a outro — quem autoriza é papelReal", async () => {
    // Sem esta regra, o primeiro "ver como" trancaria o admin fora do botão:
    // `userRole` já não diz "admin", e a segunda troca cairia em 403.
    const r = await verComo({ role: "arte" }, { userRole: "grafica", papelReal: "admin" });
    expect(r.status).toBe(200);
    expect(r.req.session.userRole).toBe("arte");
    expect(r.req.session.papelReal).toBe("admin");
  });

  it("voltar para admin limpa papelReal e a marca do Kit", async () => {
    const r = await verComo({ role: "admin" }, { userRole: "solicitacao", papelReal: "admin", userKit: true });
    expect(r.body).toEqual({ role: "admin", kit: false, papelReal: null });
    expect(r.req.session.papelReal).toBeUndefined();
    expect(r.req.session.userKit).toBe(false);
  });

  it("quem NÃO é admin leva 403 e a sessão não muda", async () => {
    const r = await verComo({ role: "admin" }, { userRole: "grafica" });
    expect(r.status).toBe(403);
    expect(r.req.session.userRole).toBe("grafica");
    expect(r.req.session.papelReal).toBeUndefined();
  });

  it("perfil inventado: 400", async () => {
    for (const role of ["diretor", "", "ADMIN", null]) {
      const r = await verComo({ role });
      expect(r.status, String(role)).toBe(400);
    }
  });

  it("a marca do Kit só existe em Solicitação", async () => {
    expect((await verComo({ role: "solicitacao", kit: true })).body.kit).toBe(true);
    expect((await verComo({ role: "grafica", kit: true })).body.kit).toBe(false);
  });

  it("a trilha usa o nome puro — trocar de perfil não é ação 'como' o perfil novo", async () => {
    await verComo({ role: "grafica" });
    expect(H.trilha[0].quem).toMatchObject({ userName: "Ana", userId: "u1" });
    expect(H.trilha[0].detalhe).toBe("Passou a ver o sistema como grafica");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 · Quem sou eu / sair
// ═════════════════════════════════════════════════════════════════════════════
describe("GET /api/auth/me e POST /api/auth/logout", () => {
  it("sem sessão: 401", async () => {
    const r = await chamar("GET /api/auth/me", { session: { userId: undefined } });
    expect(r.status).toBe(401);
  });

  it("nunca devolve o hash da senha", async () => {
    const r = await chamar("GET /api/auth/me");
    expect(r.status).toBe(200);
    expect(r.body.passwordHash).toBeUndefined();
    expect(r.body.email).toBe("ana@norte.com");
  });

  it("fora do 'ver como', papelReal vem nulo; dentro, vem o perfil emprestado e o real", async () => {
    expect((await chamar("GET /api/auth/me")).body.papelReal).toBeNull();
    const dentro = await chamar("GET /api/auth/me", { session: { userRole: "grafica", papelReal: "admin" } });
    expect(dentro.body).toMatchObject({ role: "grafica", papelReal: "admin" });
  });

  it("logout destrói a sessão", async () => {
    const destroy = vi.fn((cb: any) => cb());
    const r = await chamar("POST /api/auth/logout", { session: { destroy } });
    expect(r.status).toBe(200);
    expect(destroy).toHaveBeenCalled();
  });

  it("logout que falha não finge que deu certo", async () => {
    const r = await chamar("POST /api/auth/logout", { session: { destroy: (cb: any) => cb(new Error("redis fora")) } });
    expect(r.status).toBe(500);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 · Sessão vencida, até a rota
// ═════════════════════════════════════════════════════════════════════════════
describe("sessão vencida encontra requireAuth", () => {
  /** Roda o middleware de sessão e, em seguida, a guarda — como no servidor. */
  async function passarPelaPorta(sessao: any, existe = true, agora = Date.now()) {
    const req: any = { session: { ...sessao, destroy: (cb: any) => { delete req.session; cb(); } } };
    const res: any = { statusCode: 200, body: undefined };
    res.status = (c: number) => { res.statusCode = c; return res; };
    res.json = (b: any) => { res.body = b; return res; };
    await validarSessao({ existe: async () => existe }, () => agora)(req, res, () => {});
    let entrou = false;
    requireAuth(req, res, () => { entrou = true; });
    return { entrou, status: res.statusCode, body: res.body };
  }

  it("sessão dentro do teto entra", async () => {
    const r = await passarPelaPorta({ userId: "u1", loginEm: Date.now() });
    expect(r.entrou).toBe(true);
  });

  it("passou dos 30 dias: a rota responde 401 (não basta destruir em silêncio)", async () => {
    const agora = TETO_DA_SESSAO_MS * 3;
    const r = await passarPelaPorta({ userId: "u1", loginEm: 0 }, true, agora);
    expect(r.entrou).toBe(false);
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: "Não autenticado" });
  });

  it("usuário excluído com sessão nova em folha também cai em 401", async () => {
    const r = await passarPelaPorta({ userId: "u1", loginEm: Date.now() }, false);
    expect(r.entrou).toBe(false);
    expect(r.status).toBe(401);
  });

  it("banco fora do ar não desloga ninguém — a sessão segue e a rota decide", async () => {
    const req: any = { session: { userId: "u1", loginEm: Date.now(), destroy: vi.fn() } };
    await validarSessao({ existe: async () => { throw new Error("banco fora"); } })(req, {} as any, () => {});
    let entrou = false;
    requireAuth(req, { status: () => ({ json: () => {} }) } as any, () => { entrou = true; });
    expect(entrou).toBe(true);
  });
});
