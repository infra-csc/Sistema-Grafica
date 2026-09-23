// Sessão (teto absoluto, usuário excluído), trava do Kit, "ver como" na trilha,
// recorte da trilha, CSV sem fórmula, SSO de uso único e a régua de papéis.
import { describe, it, expect, vi } from "vitest";
import jwt from "jsonwebtoken";

vi.mock("../db", () => ({ db: {}, pool: {} }));

const { criarVerificadorDeUsuario, sessaoVencida, validarSessao, TETO_DA_SESSAO_MS } = await import("../sessao-valida");
const { travaDoKit, idsDePecaAlvo, MSG_PECA_FORA_DO_KIT, MSG_CLONAR_KIT, MSG_EVENTO_DE_OUTRO } = await import("../trava-do-kit");
const { nomeParaATrilha } = await import("../ver-como");
const { recortarTrilha } = await import("../routes/audit-logs");
const { csv } = await import("../routes/versoes");
const { criarTrocaDeSso, verificarJwtDoPortal } = await import("../sso-troca");
const { papeisDeListaNegada } = await import("../permissoes-scan");
const { avisarSessoesEncerradas, sessoesEncerradas } = await import("../sessoes-encerradas");

function resFalso() {
  const r: any = { statusCode: 200, body: undefined };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.json = (b: any) => { r.body = b; return r; };
  return r;
}

describe("sessão", () => {
  it("teto absoluto de 30 dias desde o login, mesmo com a sessão renovando", () => {
    const agora = 1_000_000_000_000;
    expect(sessaoVencida({ loginEm: agora - TETO_DA_SESSAO_MS + 1000 }, agora)).toBe(false);
    expect(sessaoVencida({ loginEm: agora - TETO_DA_SESSAO_MS - 1 }, agora)).toBe(true);
  });

  it("sessão antiga sem carimbo ganha o carimbo agora (não derruba todo mundo no deploy)", () => {
    const s: { loginEm?: number } = {};
    expect(sessaoVencida(s, 42)).toBe(false);
    expect(s.loginEm).toBe(42);
  });

  it("usuário excluído: a sessão é destruída e a requisição segue sem login", async () => {
    const mw = validarSessao({ existe: async () => false });
    const destroy = vi.fn((cb: () => void) => { delete req.session; cb(); });
    const req: any = { session: { userId: "u1", loginEm: Date.now(), destroy } };
    const next = vi.fn();
    await mw(req, {} as any, next);
    expect(destroy).toHaveBeenCalled();
    expect(req.session).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it("sessão vencida pelo teto é destruída sem nem consultar o banco", async () => {
    const existe = vi.fn(async () => true);
    const mw = validarSessao({ existe }, () => TETO_DA_SESSAO_MS * 2);
    const destroy = vi.fn((cb: () => void) => cb());
    await mw({ session: { userId: "u1", loginEm: 0, destroy } } as any, {} as any, vi.fn());
    expect(destroy).toHaveBeenCalled();
    expect(existe).not.toHaveBeenCalled();
  });

  it("usuário existente segue", async () => {
    const mw = validarSessao({ existe: async () => true });
    const destroy = vi.fn();
    const next = vi.fn();
    await mw({ session: { userId: "u1", loginEm: Date.now(), destroy } } as any, {} as any, next);
    expect(destroy).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it("cache de 60 s: consulta uma vez; esquecer() força consultar de novo", async () => {
    let t = 0;
    const consultar = vi.fn(async () => true);
    const v = criarVerificadorDeUsuario(consultar, () => t);
    await v.existe("u1");
    await v.existe("u1");
    expect(consultar).toHaveBeenCalledTimes(1);
    t = 61_000;
    await v.existe("u1");
    expect(consultar).toHaveBeenCalledTimes(2);
    v.esquecer("u1");
    await v.existe("u1");
    expect(consultar).toHaveBeenCalledTimes(3);
  });

  it("avisarSessoesEncerradas emite o userId", () => {
    const ouvir = vi.fn();
    sessoesEncerradas.on("encerradas", ouvir);
    avisarSessoesEncerradas("u9");
    sessoesEncerradas.off("encerradas", ouvir);
    expect(ouvir).toHaveBeenCalledWith("u9");
  });
});

describe("trava do Kit", () => {
  const pecas: Record<string, { id: string; kitRemessaId: string | null; criadoPorId: string | null }> = {
    minha: { id: "minha", kitRemessaId: "r1", criadoPorId: "kit1" },
    deOutroKit: { id: "deOutroKit", kitRemessaId: "r2", criadoPorId: "kit2" },
    arena: { id: "arena", kitRemessaId: null, criadoPorId: null },
  };
  const deps = {
    buscarPecas: async (ids: string[]) => ids.map((i) => pecas[i]).filter(Boolean),
    buscarCriadorDoEvento: async (id: string) =>
      id === "meuEvento" ? { existe: true, createdBy: "kit1" } : id === "outro" ? { existe: true, createdBy: "adm" } : { existe: false, createdBy: null },
    buscarPecasDoVolume: async () => null,
  };
  async function rodar(req: any) {
    const res = resFalso();
    const next = vi.fn();
    await travaDoKit(deps)({ userKit: true, userId: "kit1", body: {}, ...req }, res, next);
    return { res, next };
  }

  it("deixa agir na peça do Kit dele", async () => {
    const { next, res } = await rodar({ method: "PATCH", path: "/api/items/minha" });
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it.each([
    ["PATCH", "/api/items/arena"],
    ["DELETE", "/api/items/deOutroKit"],
    ["POST", "/api/items/arena/complement"],
    ["GET", "/api/items/arena/comments"],
    ["GET", "/api/items/arena/photos"],
    ["GET", "/api/items/deOutroKit/sponsor-approvals"],
    ["GET", "/api/items/arena/sponsors"],
  ])("recusa %s %s (peça que não é dele)", async (method, path) => {
    const { res, next } = await rodar({ method, path });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe(MSG_PECA_FORA_DO_KIT);
    expect(next).not.toHaveBeenCalled();
  });

  it("recusa lote com qualquer peça alheia (itemIds, ids ou itemId no corpo)", async () => {
    for (const body of [{ itemIds: ["minha", "arena"] }, { ids: ["deOutroKit"] }, { itemId: "arena" }]) {
      const { res } = await rodar({ method: "PATCH", path: "/api/items/bulk-cancel", body });
      expect(res.statusCode).toBe(403);
    }
  });

  it("GET /api/items/:eventId (lista por evento, sem sufixo) não é tratado como peça", () => {
    expect(idsDePecaAlvo({ method: "GET", path: "/api/items/evento-1", body: {} })).toEqual([]);
  });

  it("clonar itens: bloqueado para o Kit", async () => {
    const { res } = await rodar({ method: "POST", path: "/api/events/meuEvento/clone-items" });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe(MSG_CLONAR_KIT);
  });

  it("editar evento: só o que ele criou", async () => {
    expect((await rodar({ method: "PATCH", path: "/api/events/outro" })).res.body?.error).toBe(MSG_EVENTO_DE_OUTRO);
    expect((await rodar({ method: "PATCH", path: "/api/events/meuEvento" })).next).toHaveBeenCalled();
  });

  it("quem não é do Kit passa direto, sem consultar nada", async () => {
    const buscarPecas = vi.fn();
    const next = vi.fn();
    await travaDoKit({ ...deps, buscarPecas })({ userKit: false, userId: "x", method: "PATCH", path: "/api/items/arena", body: {} } as any, resFalso(), next);
    expect(next).toHaveBeenCalled();
    expect(buscarPecas).not.toHaveBeenCalled();
  });
});

describe("ver como na trilha", () => {
  it("marca o perfil emprestado", () => {
    expect(nomeParaATrilha("Ana", { papelReal: "admin", userRole: "grafica" })).toBe("Ana (como Gráfica)");
    expect(nomeParaATrilha("Ana", { papelReal: "admin", userRole: "solicitacao", userKit: true })).toBe("Ana (como Solicitação · Kit)");
    expect(nomeParaATrilha("Ana", { userRole: "admin" })).toBe("Ana");
  });
});

describe("recorte da trilha", () => {
  const logs = [
    { id: "1", entityType: "user", entityId: "u2", userId: "adm" },
    { id: "2", entityType: "item", entityId: "minha", userId: "outro" },
    { id: "3", entityType: "item", entityId: "arena", userId: "outro" },
    { id: "4", entityType: "event", entityId: "e1", userId: "kit1" },
  ];
  it("gestão de usuários só para admin", () => {
    expect(recortarTrilha(logs, { admin: true, kit: false, userId: "adm", minhas: new Set() })).toHaveLength(4);
    expect(recortarTrilha(logs, { admin: false, kit: false, userId: "x", minhas: new Set() }).map((l) => l.id)).toEqual(["2", "3", "4"]);
  });
  it("Kit: só o que ele fez e as peças dele", () => {
    expect(recortarTrilha(logs, { admin: false, kit: true, userId: "kit1", minhas: new Set(["minha"]) }).map((l) => l.id)).toEqual(["2", "4"]);
  });
});

describe("CSV sem fórmula", () => {
  it.each(["=HYPERLINK(\"x\")", "+1", "-2+3", "@SUM(A1)"])("neutraliza %s", (v) => {
    expect(csv(v).replace(/^"/, "").startsWith("'")).toBe(true);
  });
  it("texto comum e números seguem iguais", () => {
    expect(csv("Aprovou")).toBe("Aprovou");
    expect(csv(3)).toBe("3");
    expect(csv('a;"b"')).toBe('"a;""b"""');
  });
});

describe("SSO", () => {
  const segredo = "s3gredo";
  it("aceita HS256 recente do portal", () => {
    const t = jwt.sign({ email: "a@b.com" }, segredo, { issuer: "norte-portal", algorithm: "HS256" });
    expect(verificarJwtDoPortal(t, segredo).email).toBe("a@b.com");
  });
  it("recusa token velho, de outro emissor ou de outro algoritmo", () => {
    const velho = jwt.sign({ email: "a@b.com", iat: Math.floor(Date.now() / 1000) - 3600 }, segredo, { issuer: "norte-portal" });
    expect(() => verificarJwtDoPortal(velho, segredo)).toThrow();
    const outro = jwt.sign({ email: "a@b.com" }, segredo, { issuer: "x" });
    expect(() => verificarJwtDoPortal(outro, segredo)).toThrow();
    const hs512 = jwt.sign({ email: "a@b.com" }, segredo, { issuer: "norte-portal", algorithm: "HS512" });
    expect(() => verificarJwtDoPortal(hs512, segredo)).toThrow();
  });

  it("token de troca em tabela: uso único, só o hash é gravado", async () => {
    const tabela = new Map<string, { user_id: string; expira_em: Date }>();
    const consultar = async (sql: string, p: any[]) => {
      if (sql.startsWith("INSERT")) { tabela.set(p[0], { user_id: p[1], expira_em: p[2] }); return { rows: [] }; }
      if (sql.startsWith("DELETE FROM sso_tokens_de_troca WHERE token_hash")) {
        const l = tabela.get(p[0]); tabela.delete(p[0]); return { rows: l ? [l] : [] };
      }
      return { rows: [] };
    };
    const troca = criarTrocaDeSso(consultar);
    const token = await troca.emitir("u1");
    expect(tabela.has(token)).toBe(false); // guarda o hash, não o token
    expect(await troca.consumir(token)).toBe("u1");
    expect(await troca.consumir(token)).toBeNull();
  });

  it("vencido não entra", async () => {
    let t = 0;
    const tabela = new Map<string, any>();
    const consultar = async (sql: string, p: any[]) => {
      if (sql.startsWith("INSERT")) { tabela.set(p[0], { user_id: p[1], expira_em: p[2] }); return { rows: [] }; }
      if (sql.includes("token_hash = $1")) { const l = tabela.get(p[0]); tabela.delete(p[0]); return { rows: l ? [l] : [] }; }
      return { rows: [] };
    };
    const troca = criarTrocaDeSso(consultar, () => t);
    const token = await troca.emitir("u1");
    t = 61_000;
    expect(await troca.consumir(token)).toBeNull();
  });

  it("sem a tabela no banco (SQL não rodado), cai na memória e segue funcionando", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const consultar = async () => { throw Object.assign(new Error("relation does not exist"), { code: "42P01" }); };
    const troca = criarTrocaDeSso(consultar);
    const token = await troca.emitir("u1");
    expect(await troca.consumir(token)).toBe("u1");
    expect(await troca.consumir(token)).toBeNull();
    expect(aviso).toHaveBeenCalled();
    aviso.mockRestore();
  });
});

describe("régua de papéis lê a lista negada", () => {
  it("guarda que responde 403 na hora entra", () => {
    expect(papeisDeListaNegada(`if (!["admin", "arte"].includes(req.userRole ?? "")) {\n  return res.status(403).json({})`)).toEqual(["admin", "arte"]);
    expect(papeisDeListaNegada(`if (!["grafica"].includes((req as any).userRole ?? "")) {\n return res.status(403)`)).toEqual(["grafica"]);
    expect(papeisDeListaNegada(`const role = req.userRole;\nif (!["admin"].includes(role)) {\n return res.status(403)`)).toEqual(["admin"]);
  });
  it("guarda com alternativa (ex.: criador do evento) ou condicional não entra", () => {
    expect(papeisDeListaNegada(`const role = req.userRole ?? "";\nif (!["admin"].includes(role)) {\n  const existing = await x();`)).toEqual([]);
    expect(papeisDeListaNegada(`if (d.isPriority && !["admin"].includes(req.userRole ?? "")) {\n return res.status(403)`)).toEqual([]);
  });
});
