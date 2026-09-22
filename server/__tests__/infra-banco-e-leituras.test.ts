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

const H = vi.hoisted(() => ({ storage: {} as Record<string, any>, select: null as null | (() => any) }));

vi.mock("../db", () => ({
  db: { select: (...a: any[]) => H.select!() },
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
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn() }));

const { cabeNaJanelaDeEntregues, DIAS_DE_ENTREGUES_NA_FILA, lerSementeDasCotasGlobais, DatabaseStorage } = await import("../storage") as any;
const { registerItemRoutes } = await import("../routes/items");
const { createRateLimiter, chaveDoUsuarioOuIp } = await import("../routes/shared");

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

  it("o SQL da fila e o do delta usam a mesma constante", () => {
    const STORAGE = ler("server/storage.ts");
    const fila = STORAGE.slice(STORAGE.indexOf("async getApprovedItems"), STORAGE.indexOf("private async generateNextDisplayId"));
    expect(fila).toContain("make_interval(days => ${DIAS_DE_ENTREGUES_NA_FILA})");
    expect(fila).toContain("coalesce(${items.deliveredAt}, ${items.statusChangedAt}, ${items.updatedAt})");
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

  it("a rota não escreve mais no disco, e a migração semeia com o conteúdo do JSON", () => {
    const SP = ler("server/routes/sponsors.ts");
    expect(SP).not.toContain("writeFileSync");
    expect(SP).toContain("await storage.setGlobalQuotaRule(quota, itemTypes ?? []);");
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
  it("as duas leituras do diário filtram created_at por intervalo — nunca a coluna convertida", () => {
    const MAQ = ler("server/routes/maquinas.ts");
    expect(MAQ).not.toContain("at time zone ${FUSO})::date");
    expect((MAQ.match(/where \$\{entreOsDias\(/g) ?? []).length).toBe(2);
    expect(MAQ).toContain("r.created_at >= timezone('UTC', (${de}::date)::timestamp at time zone ${FUSO})");
    expect(MAQ).toContain("r.created_at < timezone('UTC', (${ate}::date + 1)::timestamp at time zone ${FUSO})");
    expect(ler("shared/schema.ts")).toContain('index("IDX_registros_impressao_created_at").on(table.createdAt)');
    expect(ler("scripts/migracao-aditiva-producao.sql")).toContain('CREATE INDEX IF NOT EXISTS "IDX_registros_impressao_created_at" ON registros_de_impressao (created_at);');
  });
});

describe("o merge do Replit não mexe mais no banco", () => {
  it("post-merge: npm install + aviso; nada de db:push", () => {
    const PM = ler("scripts/post-merge.sh");
    expect(PM).toContain("npm install");
    expect(PM).not.toMatch(/^npm run db:push/m);
    expect(PM).toContain("node scripts/migracao-aditiva-producao.mjs");
  });
});
