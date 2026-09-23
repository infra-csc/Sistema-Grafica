// ─────────────────────────────────────────────────────────────────────────────
// BANCO E LEITURAS — o que muda quando o servidor vira várias cópias e o
// acervo cresce:
//   · a fila da Gráfica leva só os entregues da janela (e o delta tira quem
//     cruzou a janela, mesmo sem a linha ter mudado);
//   · as cotas globais moram no banco, com o JSON do repo como semente;
//   · o limite de escrita é por USUÁRIO (o galpão sai por um IP só);
//   · sem ETag nas respostas da API, com o 304 dos estáticos intacto.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  select: null as null | (() => any),
  /** SQL cru de cada db.execute (o diário das máquinas). */
  executados: [] as unknown[],
  /** Escritas em disco feitas pelo código do app durante o teste. */
  escritasNoDisco: [] as string[],
}));

vi.mock("../db", () => ({
  db: { select: (...a: any[]) => H.select!(), execute: async (q: unknown) => { H.executados.push(q); return { rows: [] }; } },
  pool: {},
}));
// A rota das cotas globais não pode gravar no disco (várias cópias do servidor
// = vários discos). O fs real segue funcionando; só a escrita é anotada.
vi.mock("fs", async () => {
  const real = await vi.importActual<any>("fs");
  const anota = (f: (...a: any[]) => any) => (...a: any[]) => { H.escritasNoDisco.push(String(a[0])); return f(...a); };
  const writeFileSync = anota(real.writeFileSync);
  const writeFile = anota(real.writeFile);
  const promises = { ...real.promises, writeFile: anota(real.promises.writeFile) };
  return { ...real, default: { ...real, writeFileSync, writeFile, promises }, writeFileSync, writeFile, promises };
});
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
    updateEventStatus: async () => {},
  };
});
vi.mock("../services/kitRemessas", () => ({ carregarRemessa: async () => null, remessasPorIds: async () => new Map() }));
vi.mock("../services/tubosDaPeca", async () => {
  const real = await vi.importActual<any>("../services/tubosDaPeca");
  return { ...real, resumosDeTuboPorIds: async () => new Map() };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));
vi.mock("../cache", () => ({ eventsCache: null, setEventsCache: vi.fn(), invalidateEventsCache: vi.fn(), invalidateAllCaches: vi.fn(), registrarCache: vi.fn(), invalidarCacheNoCluster: vi.fn() }));

const { cabeNaJanelaDeEntregues, DIAS_DE_ENTREGUES_NA_FILA, lerSementeDasCotasGlobais, DatabaseStorage } = await import("../storage") as any;
const { registerItemRoutes } = await import("../routes/items");
const { createRateLimiter, chaveDoUsuarioOuIp } = await import("../routes/shared");
const { registerSponsorRoutes } = await import("../routes/sponsors");
const { registerMaquinasRoutes } = await import("../routes/maquinas");
const { capturarRotas } = await import("./rotas-de-mentira");
const { getTableConfig, PgDialect } = await import("drizzle-orm/pg-core");
const { registrosDeImpressao } = await import("@shared/schema");
const dialeto = new PgDialect();

const DIA = 24 * 60 * 60 * 1000;
const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

// ─── harness da rota ────────────────────────────────────────────────────────
type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const appFalso: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  appFalso[verbo] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs); return appFalso; };
}
registerItemRoutes(appFalso);

async function chamar(chave: string, query: Record<string, string> = {}) {
  const req: any = { params: {}, body: {}, query, headers: {}, userRole: "grafica", userId: "u1", userName: "Gráfica" };
  const res: any = { _status: 200, _body: undefined, _done: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.set = () => res; res.setHeader = res.set;
  res.json = (b: any) => { res._body = b; res._done = true; return res; };
  for (const h of rotas.get(chave)!) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (res._done || !seguiu) break;
  }
  return res;
}

describe("fila da Gráfica: entregues só da janela", () => {
  const agora = Date.UTC(2026, 8, 22, 15);
  it("só a entregue tem prazo; a janela é de 30 dias pelo carimbo mais específico", () => {
    expect(DIAS_DE_ENTREGUES_NA_FILA).toBe(30);
    expect(cabeNaJanelaDeEntregues({ status: "approved", updatedAt: new Date(agora - 400 * DIA) }, agora)).toBe(true);
    expect(cabeNaJanelaDeEntregues({ status: "delivered", deliveredAt: new Date(agora - 29 * DIA) }, agora)).toBe(true);
    expect(cabeNaJanelaDeEntregues({ status: "delivered", deliveredAt: new Date(agora - 31 * DIA) }, agora)).toBe(false);
    // deliveredAt vence os outros carimbos (a linha pode ter sido tocada depois).
    expect(cabeNaJanelaDeEntregues({ status: "delivered", deliveredAt: new Date(agora - 60 * DIA), updatedAt: new Date(agora) }, agora)).toBe(false);
    // Sem deliveredAt (legado), vale a troca de status.
    expect(cabeNaJanelaDeEntregues({ status: "delivered", deliveredAt: null, statusChangedAt: new Date(agora - 2 * DIA) }, agora)).toBe(true);
  });

  // Cadeia do drizzle que guarda o WHERE e devolve as linhas dadas.
  const capturandoWhere = (linhas: any[]) => {
    const onde: unknown[] = [];
    H.select = () => {
      const c: any = { from: () => c, orderBy: () => c, where: (w: unknown) => { onde.push(w); return c; }, then: (ok: any, f: any) => Promise.resolve(linhas).then(ok, f) };
      return c;
    };
    return onde;
  };

  it("o SQL da fila e o do delta usam a mesma constante e o mesmo carimbo", async () => {
    const onde = capturandoWhere([]);
    await new DatabaseStorage().getApprovedItems();
    await new DatabaseStorage().getIdsQueSairamDaJanelaDeEntregues(new Date(Date.now() - 2 * DIA));
    const [fila, delta] = onde.map((w) => dialeto.sqlToQuery(w as any));
    const CARIMBO = 'coalesce("items"."delivered_at", "items"."status_changed_at", "items"."updated_at")';
    expect(fila.sql).toContain(`${CARIMBO} >= timezone(`);
    expect(fila.sql).toMatch(/make_interval\(days => \$\d+\)/);
    expect(fila.params).toContain(DIAS_DE_ENTREGUES_NA_FILA);
    expect(delta.sql).toContain(CARIMBO);
    // o delta busca com folga no banco; a régua exata é a do JS (caso abaixo)
    expect(delta.params).toEqual(expect.arrayContaining([DIAS_DE_ENTREGUES_NA_FILA, DIAS_DE_ENTREGUES_NA_FILA + 2]));
  });

  it("delta: sai só quem CRUZOU a janela entre o since e agora", async () => {
    const agoraReal = Date.now();
    const dias = (n: number) => new Date(agoraReal - n * DIA);
    capturandoWhere([
      { id: "cruzou", status: "delivered", deliveredAt: dias(30.5) },
      { id: "ainda-dentro", status: "delivered", deliveredAt: dias(29.5) },
      { id: "ja-estava-fora", status: "delivered", deliveredAt: dias(32.5) },
      { id: "legado", status: "delivered", deliveredAt: null, statusChangedAt: dias(31) },
    ]);
    expect((await new DatabaseStorage().getIdsQueSairamDaJanelaDeEntregues(dias(2))).sort()).toEqual(["cruzou", "legado"]);
    // since mais novo que agora: nada a consultar
    H.select = () => { throw new Error("não devia consultar"); };
    expect(await new DatabaseStorage().getIdsQueSairamDaJanelaDeEntregues(new Date(agoraReal + DIA))).toEqual([]);
  });

  it("delta: a entregue antiga que mudou sai; a que o relógio tirou da janela também", async () => {
    const agoraReal = Date.now();
    Object.assign(H.storage, {
      getItemsChangedSince: async () => [
        { id: "velha", eventId: "e1", status: "delivered", deliveredAt: new Date(agoraReal - 45 * DIA), updatedAt: new Date(agoraReal), deletedAt: null },
        { id: "nova", eventId: "e1", status: "delivered", deliveredAt: new Date(agoraReal - 2 * DIA), updatedAt: new Date(agoraReal), deletedAt: null },
        { id: "fila", eventId: "e1", status: "approved", updatedAt: new Date(agoraReal), deletedAt: null },
      ],
      getIdsQueSairamDaJanelaDeEntregues: async () => ["cruzou-a-janela"],
      getAllEvents: async () => [{ id: "e1", name: "Evento", status: "created", startDate: new Date(agoraReal + 10 * DIA), truckDepartureDate: new Date(agoraReal + 9 * DIA) }],
      getAllSponsors: async () => [],
      getItemSponsorsByItemIds: async () => [],
      getItemSponsorApprovalsByItemIds: async () => [],
      getItemsByIds: async () => [],
      getComplementsByParentIds: async () => [],
    });
    const res = await chamar("GET /api/items/approved", { since: new Date(agoraReal - 60_000).toISOString() });
    expect(res._status, JSON.stringify(res._body)).toBe(200);
    expect(res._body.delta).toBe(true);
    expect(res._body.itens.map((i: any) => i.id).sort()).toEqual(["fila", "nova"]);
    expect(res._body.removidas.sort()).toEqual(["cruzou-a-janela", "velha"]);
  });
});

describe("cotas globais no banco (o JSON do repo é só semente)", () => {
  beforeEach(() => { H.select = null; });
  const cadeia = (resultado: any) => {
    const c: any = { from: () => c, orderBy: () => (resultado instanceof Error ? Promise.reject(resultado) : Promise.resolve(resultado)) };
    return c;
  };

  it("a semente é o arquivo do repositório", () => {
    const semente = lerSementeDasCotasGlobais();
    expect(semente.map((r: any) => r.quota)).toEqual(["MASTER", "GOLD", "SILVER", "APOIO", "MIDIA", "MINISTERIO"]);
  });

  it("com linhas na tabela, valem as do banco (na ordem de gravação)", async () => {
    H.select = () => cadeia([{ quota: "GOLD", itemTypes: ["Palco"] }, { quota: "MASTER", itemTypes: null }]);
    const regras = await new DatabaseStorage().getGlobalQuotaRules();
    expect(regras).toEqual([{ quota: "GOLD", itemTypes: ["Palco"] }, { quota: "MASTER", itemTypes: [] }]);
  });

  it("tabela vazia ou ainda não migrada: a semente — nunca a tela vazia", async () => {
    H.select = () => cadeia([]);
    expect((await new DatabaseStorage().getGlobalQuotaRules()).length).toBe(6);
    H.select = () => cadeia(new Error('relation "global_quota_rules" does not exist'));
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await new DatabaseStorage().getGlobalQuotaRules()).length).toBe(6);
    aviso.mockRestore();
  });

  it("a rota grava a cota no BANCO — nada no disco — e a leitura devolve o que o banco tem", async () => {
    const { chamar } = capturarRotas(registerSponsorRoutes);
    H.escritasNoDisco = [];
    H.storage.setGlobalQuotaRule = vi.fn(async () => {});
    H.storage.getGlobalQuotaRules = vi.fn(async () => [{ quota: "GOLD", itemTypes: ["Palco"] }]);
    const admin = { userId: "u1", userRole: "admin" };
    const r = await chamar("PUT /api/quota-rules/global", { sessao: admin, body: { quota: "GOLD", itemTypes: ["Palco"] } });
    expect(r.status).toBe(200);
    expect(H.storage.setGlobalQuotaRule).toHaveBeenCalledWith("GOLD", ["Palco"]);
    expect(H.escritasNoDisco).toEqual([]);
    expect((await chamar("GET /api/quota-rules/global", { sessao: { userId: "u2", userRole: "grafica" } })).body).toEqual([{ quota: "GOLD", itemTypes: ["Palco"] }]);
    // sem tipos grava a lista vazia; papel sem permissão não grava
    await chamar("PUT /api/quota-rules/global", { sessao: { userId: "u3", userRole: "atendimento" }, body: { quota: "MASTER" } });
    expect(H.storage.setGlobalQuotaRule).toHaveBeenLastCalledWith("MASTER", []);
    expect((await chamar("PUT /api/quota-rules/global", { sessao: { userId: "u4", userRole: "arte" }, body: { quota: "GOLD" } })).status).toBe(403);
    expect(H.storage.setGlobalQuotaRule).toHaveBeenCalledTimes(2);
    expect(H.escritasNoDisco).toEqual([]);
  });

  it("a migração semeia a tabela com o conteúdo do JSON", () => {
    // Varredura: o .sql roda à mão em produção; aqui só dá para conferir o texto.
    const SQL = ler("scripts/migracao-aditiva-producao.sql");
    const bloco = SQL.slice(SQL.indexOf("CREATE TABLE IF NOT EXISTS global_quota_rules"));
    for (const r of JSON.parse(ler("global-quota-rules.json"))) expect(bloco).toContain(`('${r.quota}', '{}'::text[]`);
  });
});

describe("limite de escrita por USUÁRIO", () => {
  const limitador = () => createRateLimiter({ windowMs: 60_000, max: 2, message: "calma", chave: chaveDoUsuarioOuIp });
  const pedir = (lim: any, req: any) => {
    let status = 200;
    const res: any = { status: (s: number) => { status = s; return { json: () => {} }; } };
    lim(req, res, () => {});
    return status;
  };

  it("duas pessoas no mesmo IP do galpão não dividem a cota", () => {
    const lim = limitador();
    const ana = { ip: "200.1.1.1", session: { userId: "ana" } };
    const beto = { ip: "200.1.1.1", session: { userId: "beto" } };
    expect([pedir(lim, ana), pedir(lim, ana), pedir(lim, ana)]).toEqual([200, 200, 429]);
    expect([pedir(lim, beto), pedir(lim, beto)]).toEqual([200, 200]);
  });

  it("sem sessão, conta por IP", () => {
    expect(chaveDoUsuarioOuIp({ ip: "1.2.3.4" })).toBe("ip:1.2.3.4");
    expect(chaveDoUsuarioOuIp({ ip: "1.2.3.4", session: { userId: "u" } })).toBe("u:u");
  });
});

describe("sem ETag na API, 304 dos estáticos intacto", () => {
  it("app.set('etag', false) está no index e o express.static segue respondendo 304", { timeout: 60_000 }, async () => {
    expect(ler("server/index.ts")).toContain('app.set("etag", false);');
    const express = (await import("express")).default;
    const os = await import("os");
    const fs = await import("fs");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "etag-"));
    fs.writeFileSync(path.join(dir, "app.js"), "console.log(1)");
    const app = express();
    app.set("etag", false);
    app.get("/api/lista", (_req, res) => { res.json({ itens: [1, 2, 3] }); });
    app.use(express.static(dir));
    const servidor = await new Promise<any>((ok) => { const s = app.listen(0, () => ok(s)); });
    try {
      const base = `http://127.0.0.1:${servidor.address().port}`;
      // http cru (o fetch acrescenta Cache-Control: no-cache em pedido
      // condicional, e aí nenhum servidor responde 304 — não é o navegador).
      const http = await import("http");
      const get = (caminho: string, headers: Record<string, string> = {}) =>
        new Promise<{ status: number; etag: string | undefined }>((ok, erro) => {
          http.get(`${base}${caminho}`, { headers }, (r) => { r.resume(); r.on("end", () => ok({ status: r.statusCode!, etag: r.headers.etag as string | undefined })); }).on("error", erro);
        });
      const api = await get("/api/lista");
      expect(api.etag).toBeUndefined();
      const primeiro = await get("/app.js");
      expect(primeiro.etag).toBeTruthy();
      const segundo = await get("/app.js", { "If-None-Match": primeiro.etag! });
      expect(segundo.status).toBe(304);
    } finally {
      servidor.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("máquinas: o dia por intervalo (usa o índice), no fuso de São Paulo", () => {
  it("as duas leituras do diário filtram created_at por intervalo — nunca a coluna convertida", async () => {
    const { chamar } = capturarRotas(registerMaquinasRoutes);
    const sessao = { userId: "u1", userRole: "grafica" };
    const doDiario = async (chave: string, query: Record<string, string>) => {
      H.executados = [];
      const r = await chamar(chave, { sessao, query });
      expect(r.status, chave).toBe(200);
      const qs = H.executados.map((q) => dialeto.sqlToQuery(q as any)).filter((q) => q.sql.includes("from registros_de_impressao r") && q.sql.includes("r.total_depois")); // as linhas do diário
      expect(qs, chave).toHaveLength(1);
      return qs[0];
    };
    const periodo = await doDiario("GET /api/grafica/maquinas/relatorio", { de: "2026-09-01", ate: "2026-09-03" });
    const dia = await doDiario("GET /api/grafica/maquinas", { dia: "2026-09-02" });
    for (const [q, de, ate] of [[periodo, "2026-09-01", "2026-09-03"], [dia, "2026-09-02", "2026-09-02"]] as const) {
      const where = q.sql.slice(q.sql.indexOf("where "));
      // o índice só serve com a coluna crua do lado esquerdo
      expect(where).toMatch(/r\.created_at >= timezone\('UTC', \(\$\d+::date\)::timestamp at time zone \$\d+\)/);
      expect(where).toMatch(/r\.created_at < timezone\('UTC', \(\$\d+::date \+ 1\)::timestamp at time zone \$\d+\)/);
      expect(where).not.toMatch(/created_at[^,]*\)::date/);
      expect(q.params).toEqual(expect.arrayContaining([de, ate, "America/Sao_Paulo"]));
    }
    const indice = getTableConfig(registrosDeImpressao).indexes.find((i: any) => i.config.name === "IDX_registros_impressao_created_at");
    expect(indice?.config.columns.map((c: any) => c.name)).toEqual(["created_at"]);
  });

  it("a migração cria o índice do diário", () => {
    // Varredura: o .sql roda à mão em produção; aqui só dá para conferir o texto.
    expect(ler("scripts/migracao-aditiva-producao.sql")).toContain('CREATE INDEX IF NOT EXISTS "IDX_registros_impressao_created_at" ON registros_de_impressao (created_at);');
  });
});

describe("o merge do Replit não mexe mais no banco", () => {
  it("post-merge: npm install + aviso; nada de db:push", () => {
    // Varredura: é o shell do merge do Replit (roda npm install) — não dá para
    // executar aqui. Olha só as linhas que RODAM (fora comentário e echo).
    const PM = ler("scripts/post-merge.sh");
    const comandos = PM.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !l.startsWith("echo"));
    expect(comandos).toContain("npm install");
    expect(comandos.filter((l) => /db:push|drizzle-kit\s+push|db:migrate/.test(l))).toEqual([]);
    expect(PM).toContain("node scripts/migracao-aditiva-producao.mjs");
  });
});
