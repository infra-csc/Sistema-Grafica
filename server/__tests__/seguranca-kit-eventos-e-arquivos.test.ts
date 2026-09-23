// O usuário do Kit nas escritas de EVENTO e de VOLUME (trava-do-kit, rodando o
// middleware com req/res falsos) e na leitura de /objects/* (a rota real, com
// o banco e o bucket de mentira).
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  consultas: [] as { sql: string; params: any[] }[],
  // Arquivos das peças do Kit de cada usuário (o que a consulta "minhas" devolve).
  doKit: {} as Record<string, string[]>,
  // Donas de cada caminho (o que a varredura devolve).
  donas: {} as Record<string, { kit_remessa_id: string | null; criado_por_id: string | null }[]>,
}));

vi.mock("../db", () => ({
  db: {},
  pool: {
    query: async (sql: string, params: any[]) => {
      H.consultas.push({ sql, params });
      if (sql.includes("WITH minhas")) return { rows: (H.doKit[params[0]] ?? []).map((url) => ({ url })) };
      return { rows: H.donas[params[0]] ?? [] };
    },
  },
}));
vi.mock("../storage", () => ({ storage: {} }));
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return { ...real, requireAuth: (_req: any, _res: any, next: any) => next() };
});
vi.mock("../objectStorage", () => ({
  ObjectNotFoundError: class extends Error {},
  ObjectStorageService: class {
    async getObjectEntityFile(caminho: string) {
      return { name: caminho, getMetadata: async () => [{ metadata: {} }] };
    }
    async downloadObject(arquivo: any, res: any) { res._servido = arquivo.name; res._status = 200; }
  },
}));

const {
  travaDoKit, MSG_EVENTO_DE_OUTRO, MSG_PECA_FORA_DO_KIT, MSG_VOLUME_FORA_DO_KIT, MSG_VOLUME_SEM_PECA,
} = await import("../trava-do-kit");
const { criarAclDoKit, caminhoDoObjeto, MSG_ARQUIVO_FORA_DO_KIT } = await import("../objectAcl");
const { registerObjectRoutes } = await import("../routes/objects");

function resFalso() {
  const r: any = { statusCode: 200, body: undefined };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.json = (b: any) => { r.body = b; return r; };
  return r;
}

// ═════════════════════════════════════════════════════════════════════════════
describe("trava do Kit — escritas de evento e de volume", () => {
  const pecas: Record<string, { id: string; kitRemessaId: string | null; criadoPorId: string | null }> = {
    minha: { id: "minha", kitRemessaId: "r1", criadoPorId: "kit1" },
    minha2: { id: "minha2", kitRemessaId: "r1", criadoPorId: "kit1" },
    deOutroKit: { id: "deOutroKit", kitRemessaId: "r2", criadoPorId: "kit2" },
    arena: { id: "arena", kitRemessaId: null, criadoPorId: null },
  };
  const volumes: Record<string, string[]> = {
    soMeu: ["minha", "minha2"],
    misto: ["minha", "arena"],
    vazio: [],
  };
  const deps = {
    buscarPecas: vi.fn(async (ids: string[]) => ids.map((i) => pecas[i]).filter(Boolean)),
    buscarCriadorDoEvento: vi.fn(async (id: string) =>
      id === "meuEvento" ? { existe: true, createdBy: "kit1" } : id === "daArena" ? { existe: true, createdBy: "adm" } : { existe: false, createdBy: null }),
    buscarPecasDoVolume: vi.fn(async (id: string) => (id in volumes ? volumes[id].map((i) => pecas[i]) : null)),
  };
  async function rodar(req: any, quem: any = { userKit: true, userId: "kit1" }) {
    const res = resFalso();
    const next = vi.fn();
    await travaDoKit(deps)({ body: {}, ...quem, ...req }, res, next);
    return { res, next, passou: next.mock.calls.length > 0 };
  }
  beforeEach(() => { deps.buscarPecas.mockClear(); deps.buscarCriadorDoEvento.mockClear(); deps.buscarPecasDoVolume.mockClear(); });

  // Todas as escritas por evento que não agem por peça (grep de app.post/patch/put/delete em /api/events/:id).
  const DO_EVENTO: [string, string][] = [
    ["PATCH", "/api/events/X"],
    ["DELETE", "/api/events/X"],
    ["PATCH", "/api/events/X/priority"],
    ["POST", "/api/events/X/close"],
    ["POST", "/api/events/X/reopen"],
    ["POST", "/api/events/X/sponsors"],
    ["PATCH", "/api/events/X/sponsors/s1"],
    ["DELETE", "/api/events/X/sponsors/s1"],
    ["POST", "/api/events/X/auto-link-sponsors"],
    ["PUT", "/api/events/X/quota-rules"],
    ["DELETE", "/api/events/X/quota-rules/GOLD"],
    ["POST", "/api/events/X/book"],
    ["POST", "/api/events/X/book/notify"],
    ["POST", "/api/events/X/dispatch-inventory"],
    ["POST", "/api/events/X/return-inventory"],
    ["POST", "/api/events/X/allocations"],
  ];

  it.each(DO_EVENTO)("%s %s em evento de outra pessoa → 403", async (method, caminho) => {
    const { res, passou } = await rodar({ method, path: caminho.replace("X", "daArena") });
    expect(passou).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe(MSG_EVENTO_DE_OUTRO);
  });

  it.each(DO_EVENTO)("%s %s no evento que ele criou → segue para a rota", async (method, caminho) => {
    expect((await rodar({ method, path: caminho.replace("X", "meuEvento") })).passou).toBe(true);
  });

  it("evento que não existe segue para a rota (404 dela)", async () => {
    expect((await rodar({ method: "PATCH", path: "/api/events/sumiu/priority" })).passou).toBe(true);
  });

  it("as escritas por peça seguem no evento da Arena (a peça do Kit mora lá)", async () => {
    for (const path of ["/api/events/daArena/items/submit", "/api/events/daArena/preview-xlsx", "/api/events/daArena/confirm-import"]) {
      expect((await rodar({ method: "POST", path })).passou, path).toBe(true);
    }
  });

  it("leitura do evento da Arena não é barrada", async () => {
    expect((await rodar({ method: "GET", path: "/api/events/daArena/sponsors" })).passou).toBe(true);
    expect(deps.buscarCriadorDoEvento).not.toHaveBeenCalled();
  });

  it("quem não é do Kit passa direto, sem consultar nada", async () => {
    const { passou } = await rodar({ method: "PATCH", path: "/api/events/daArena/priority" }, { userKit: false, userId: "sol1", userRole: "solicitacao" });
    expect(passou).toBe(true);
    expect(deps.buscarCriadorDoEvento).not.toHaveBeenCalled();
  });

  describe("volumes", () => {
    it("embalar as peças dele no evento da Arena: pode (itens com quantidade ou itemIds)", async () => {
      expect((await rodar({ method: "POST", path: "/api/events/daArena/tubos", body: { itens: [{ id: "minha", quantidade: 2 }] } })).passou).toBe(true);
      expect((await rodar({ method: "POST", path: "/api/events/daArena/tubos", body: { itemIds: ["minha", "minha2"] } })).passou).toBe(true);
    });

    it("embalar peça alheia → 403", async () => {
      for (const body of [{ itens: [{ id: "minha" }, { id: "arena" }] }, { itemIds: ["deOutroKit"] }]) {
        const { res } = await rodar({ method: "POST", path: "/api/events/daArena/tubos", body });
        expect(res.statusCode).toBe(403);
        expect(res.body.error).toBe(MSG_PECA_FORA_DO_KIT);
      }
    });

    it("abrir volume vazio → 403 (ficaria órfão: o Kit não apaga volume)", async () => {
      const { res } = await rodar({ method: "POST", path: "/api/events/meuEvento/tubos", body: {} });
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe(MSG_VOLUME_SEM_PECA);
    });

    it.each([
      ["PATCH", "/api/tubos/misto/itens", { remover: ["minha"] }],
      ["PATCH", "/api/tubos/misto/itens", { adicionar: ["minha2"] }],
      ["DELETE", "/api/tubos/misto", {}],
      ["POST", "/api/tubos/misto/fechar", { fotos: ["/objects/x"] }],
      ["POST", "/api/tubos/misto/entregar", { receivedBy: "João" }],
    ])("%s %s em volume com peça alheia → 403", async (method, path, body) => {
      const { res, passou } = await rodar({ method, path, body });
      expect(passou).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe(MSG_VOLUME_FORA_DO_KIT);
    });

    it("volume só com peças dele: embalar, tirar, fotografar e entregar seguem", async () => {
      for (const [method, path, body] of [
        ["PATCH", "/api/tubos/soMeu/itens", { adicionar: ["minha"], remover: ["minha2"] }],
        ["POST", "/api/tubos/soMeu/fechar", { fotos: ["/objects/x"] }],
        ["POST", "/api/tubos/soMeu/entregar", { receivedBy: "João" }],
      ] as [string, string, any][]) {
        expect((await rodar({ method, path, body })).passou, path).toBe(true);
      }
    });

    it("volume dele, mas pondo peça alheia dentro → 403", async () => {
      const { res } = await rodar({ method: "PATCH", path: "/api/tubos/soMeu/itens", body: { itens: [{ id: "arena", quantidade: 1 }] } });
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe(MSG_PECA_FORA_DO_KIT);
    });

    it("volume inexistente segue para a rota (404 dela); o lote recusa volume a volume na rota", async () => {
      expect((await rodar({ method: "POST", path: "/api/tubos/sumiu/fechar" })).passou).toBe(true);
      expect((await rodar({ method: "POST", path: "/api/tubos/entregar-em-lote", body: { tuboIds: ["misto"] } })).passou).toBe(true);
      expect(deps.buscarPecasDoVolume).toHaveBeenCalledTimes(1);
    });

    it("ler o volume não passa pela trava de escrita", async () => {
      expect((await rodar({ method: "GET", path: "/api/tubos/misto" })).passou).toBe(true);
      expect(deps.buscarPecasDoVolume).not.toHaveBeenCalled();
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("arquivos: a ACL do Kit", () => {
  it("normaliza as formas gravadas (query, URL crua do bucket)", () => {
    expect(caminhoDoObjeto("/objects/uploads/a?thumb=1")).toBe("/objects/uploads/a");
    expect(caminhoDoObjeto("https://storage.googleapis.com/bucket/.private/uploads/a?X-Goog=1")).toBe("/objects/uploads/a");
    expect(caminhoDoObjeto("\\\\servidor\\arte\\x.tif")).toBeNull();
    expect(caminhoDoObjeto(null)).toBeNull();
  });

  function aclCom(doUsuario: string[], donas: Record<string, any[]>) {
    let t = 0;
    const consultar = vi.fn(async (sql: string, params: any[]) =>
      sql.includes("WITH minhas") ? { rows: doUsuario.map((url) => ({ url })) } : { rows: donas[params[0]] ?? [] });
    return { acl: criarAclDoKit(consultar, () => t), consultar, passar: (ms: number) => { t += ms; } };
  }

  it("arquivo das peças dele: sai sem a varredura das donas", async () => {
    const { acl, consultar } = aclCom(["/objects/uploads/meu?thumb=1"], {});
    expect(await acl.podeLer("kit1", "/objects/uploads/meu")).toBe(true);
    expect(consultar).toHaveBeenCalledTimes(1);
    expect(consultar.mock.calls[0][0]).toContain("WITH minhas");
  });

  it("arquivo de peça alheia: recusado", async () => {
    const { acl } = aclCom([], { "/objects/uploads/arena": [{ kit_remessa_id: null, criado_por_id: "sol" }] });
    expect(await acl.podeLer("kit1", "/objects/uploads/arena")).toBe(false);
  });

  it("remessa de outro usuário do Kit: recusada; a dele: liberada", async () => {
    const { acl } = aclCom([], {
      "/objects/uploads/planilha-outro": [{ kit_remessa_id: "r2", criado_por_id: "kit2" }],
      "/objects/uploads/planilha-minha": [{ kit_remessa_id: "r1", criado_por_id: "kit1" }],
    });
    expect(await acl.podeLer("kit1", "/objects/uploads/planilha-outro")).toBe(false);
    expect(await acl.podeLer("kit1", "/objects/uploads/planilha-minha")).toBe(true);
  });

  it("arquivo sem dona conhecida (upload recém-feito, foto de estoque): a regra de sempre", async () => {
    const { acl } = aclCom([], {});
    expect(await acl.podeLer("kit1", "/objects/uploads/solto")).toBe(true);
  });

  it("dona compartilhada (arte reaproveitada numa peça dele e numa da Arena): liberado", async () => {
    const { acl } = aclCom([], { "/objects/uploads/reuso": [{ kit_remessa_id: null, criado_por_id: null }, { kit_remessa_id: "r1", criado_por_id: "kit1" }] });
    expect(await acl.podeLer("kit1", "/objects/uploads/reuso")).toBe(true);
  });

  it("cache curto: dentro de 60 s não consulta de novo; depois, consulta", async () => {
    const { acl, consultar, passar } = aclCom([], { "/objects/uploads/arena": [{ kit_remessa_id: null, criado_por_id: null }] });
    await acl.podeLer("kit1", "/objects/uploads/arena");
    await acl.podeLer("kit1", "/objects/uploads/arena");
    expect(consultar).toHaveBeenCalledTimes(2); // "minhas" + donas, uma vez cada
    passar(61_000);
    await acl.podeLer("kit1", "/objects/uploads/arena");
    expect(consultar).toHaveBeenCalledTimes(4);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("GET /objects/* — a rota de verdade", () => {
  type Handler = (req: any, res: any, next: any) => any;
  const rotas = new Map<string, Handler[]>();
  const app: any = {};
  for (const v of ["get", "post", "patch", "put", "delete"]) {
    app[v] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${v.toUpperCase()} ${caminho}`, hs); return app; };
  }

  async function pedir(caminho: string, quem: any) {
    if (rotas.size === 0) await registerObjectRoutes(app);
    const hs = rotas.get("GET /objects/:objectPath(*)")!;
    const req: any = { path: caminho, query: {}, params: {}, headers: {}, ...quem };
    const res: any = { _status: 200, _servido: null as string | null, _body: undefined };
    res.status = (c: number) => { res._status = c; return res; };
    res.json = (b: any) => { res._body = b; return res; };
    res.sendStatus = (c: number) => { res._status = c; return res; };
    res.set = () => res; res.end = () => res;
    for (const h of hs) {
      let seguiu = false;
      await h(req, res, () => { seguiu = true; });
      if (!seguiu) break;
    }
    return res;
  }

  beforeEach(() => {
    H.consultas = [];
    H.doKit = { kit1: ["/objects/uploads/thumb-minha"] };
    H.donas = {
      "/objects/uploads/thumb-arena": [{ kit_remessa_id: null, criado_por_id: "sol" }],
      "/objects/uploads/foto-tubo-arena": [{ kit_remessa_id: null, criado_por_id: null }],
    };
  });

  it("Kit abre o thumb da peça dele", async () => {
    const r = await pedir("/objects/uploads/thumb-minha", { userId: "kit1", userKit: true });
    expect(r._servido).toBe("/objects/uploads/thumb-minha");
  });

  it("Kit NÃO abre o arquivo da peça da Arena sabendo o caminho (thumb, foto de embalagem)", async () => {
    for (const caminho of ["/objects/uploads/thumb-arena", "/objects/uploads/foto-tubo-arena"]) {
      const r = await pedir(caminho, { userId: "kit1", userKit: true });
      expect(r._status, caminho).toBe(403);
      expect(r._body.error).toBe(MSG_ARQUIVO_FORA_DO_KIT);
      expect(r._servido).toBeNull();
    }
  });

  it("Kit abre arquivo sem dona conhecida (a regra de sempre)", async () => {
    const r = await pedir("/objects/uploads/recem-enviado", { userId: "kit1", userKit: true });
    expect(r._servido).toBe("/objects/uploads/recem-enviado");
  });

  it("os outros perfis não pagam consulta nenhuma", async () => {
    const r = await pedir("/objects/uploads/thumb-arena", { userId: "sol", userKit: false, userRole: "solicitacao" });
    expect(r._servido).toBe("/objects/uploads/thumb-arena");
    expect(H.consultas).toEqual([]);
  });
});
