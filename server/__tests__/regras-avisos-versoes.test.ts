// ─────────────────────────────────────────────────────────────────────────────
// VERSÕES APROVADAS, RODANDO — o que as rotas da peça GRAVAM e o que a rota
// /api/versoes RECONSTRÓI, filtra, pagina e exporta.
//
// De onde vieram: versoes-aprovadas.test.ts §1–3 (eram leituras do texto de
// shared/schema.ts, server/storage.ts, server/routes/versoes.ts e das rotas
// da peça). Aqui roda o handler real, com storage e banco de mentira, e o que
// se afirma é o gravado, o corpo devolvido e o cache derrubado.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import ts from "typescript";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: {} as Record<string, any>,
  trilha: [] as { acao: string; tipo: string; id: string; detalhe: string }[],
  invalidou: [] as string[],
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
    broadcast: () => {},
    createAuditLog: async (_req: unknown, acao: string, tipo: string, id: string, detalhe: string) => {
      H.trilha.push({ acao, tipo, id, detalhe });
    },
    createAuditLogsEmLote: async () => {},
    updateEventStatus: async () => {},
  };
});
// O cache é o de verdade; só contamos quem pediu para derrubá-lo.
vi.mock("../cache", async () => {
  const real = await vi.importActual<any>("../cache");
  return {
    ...real,
    invalidarCacheNoCluster: (nome: string) => { H.invalidou.push(nome); real.invalidarCacheNoCluster(nome); },
  };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));
vi.mock("../services/consultaDeEstoqueNaLiberacao", () => ({
  respostaDoEstoqueParaLiberar: vi.fn(async () => null),
  marcarRespostaAplicada: vi.fn(async () => {}),
}));

import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { itemArtVersions, eventBooks, itemSponsorApprovals } from "@shared/schema";
import { capturarRotas } from "./rotas-de-mentira";
import { registerItemRoutes } from "../routes/items";
import { registerVersoesRoutes, invalidarCacheDeVersoes, csv } from "../routes/versoes";
import { descreverEnvio } from "../services/bookEmailNotification";

const RAIZ = path.resolve(__dirname, "../..");
const dialeto = new PgDialect();
const sqlDe = (c: SQL) => dialeto.sqlToQuery(c).sql;

const { chamar } = capturarRotas((app) => { registerItemRoutes(app); registerVersoesRoutes(app); });
const sessao = (userRole = "admin") => ({ userId: "u1", userRole, userName: "Maria" });

// ── O mundo ──────────────────────────────────────────────────────────────────
type Linha = Record<string, any>;
let M: {
  itens: Linha[]; eventos: Linha[]; sponsors: Linha[]; aprovacoes: Linha[];
  versoes: Linha[]; books: Linha[]; logsTroca: Linha[]; logsAviso: Linha[];
  vinculos: string[]; kit: string[];
};
let consultas: string[];

const T = (min: number) => new Date(Date.UTC(2026, 7, 20, 12, min, 0));
const iso = (min: number) => T(min).toISOString();
const peca = (id: string, over: Linha = {}): Linha => ({
  id, displayId: `#${id}`, eventId: "ev-1", type: "Pórtico", description: `Peça ${id}`, status: "awaiting_sponsor_approval",
  deletedAt: null, approvalThumbUrl: null, approvalThumbUpdatedAt: null, bookUrl: null, skipApproval: false,
  createdAt: T(0), updatedAt: T(0), ...over,
});
const versao = (itemId: string, thumbUrl: string, min: number, origem = "envio", createdBy: string | null = "Arte") =>
  ({ itemId, thumbUrl, createdAt: T(min), origem, createdBy });
const aprov = (itemId: string, sponsorId: string, over: Linha = {}): Linha =>
  ({ id: `a-${itemId}-${sponsorId}`, itemId, sponsorId, status: "pending", ...over });
const logTroca = (itemId: string, detalhe: string, min: number) => ({ entityType: "item", entityId: itemId, details: detalhe, createdAt: T(min) });

beforeEach(() => {
  invalidarCacheDeVersoes(); // cada teste começa com o quadro recalculado
  H.invalidou = [];
  H.trilha = [];
  consultas = [];
  M = {
    itens: [], aprovacoes: [], versoes: [], books: [], logsTroca: [], logsAviso: [], vinculos: [], kit: [],
    eventos: [
      { id: "ev-1", name: "COPA NORTE", status: "created", startDate: "2099-01-10", truckDepartureDate: new Date("2099-01-01T00:00:00Z") },
      { id: "ev-2", name: "ECO RUN", status: "created", startDate: "2099-02-10", truckDepartureDate: new Date("2099-02-01T00:00:00Z") },
    ],
    sponsors: [{ id: "sp-vale", name: "Vale", color: "#0a0" }, { id: "sp-ache", name: "Aché", color: null }],
  };
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, {
    // leitura da tela de Versões
    getAllItems: vi.fn(async () => M.itens),
    getAllEvents: vi.fn(async () => M.eventos),
    getAllSponsors: vi.fn(async () => M.sponsors),
    getAllItemSponsorApprovals: vi.fn(async () => M.aprovacoes),
    getAllItemArtVersions: vi.fn(async () => M.versoes),
    getAllEventBooks: vi.fn(async () => M.books),
    getIdsDasPecasDoKitDoCriador: vi.fn(async () => M.kit),
    // escrita pelas rotas da peça
    getItem: vi.fn(async (id: string) => M.itens.find((i) => i.id === id)),
    getEvent: vi.fn(async (id: string) => M.eventos.find((e) => e.id === id)),
    updateItem: vi.fn(async (id: string, d: Linha) => { const i = M.itens.find((x) => x.id === id); return i ? Object.assign(i, d) : undefined; }),
    createItemArtVersion: vi.fn(async (v: Linha) => v),
    createNotification: vi.fn(async (n: Linha) => ({ id: "n1", ...n })),
    getItemSponsors: vi.fn(async (itemId: string) => M.vinculos.map((sponsorId) => ({ itemId, sponsorId }))),
    getSponsor: vi.fn(async (id: string) => ({ ...M.sponsors.find((x) => x.id === id), strictApproval: false })),
    getItemSponsorApprovals: vi.fn(async (itemId: string) => M.aprovacoes.filter((a) => a.itemId === itemId)),
    getItemSponsorApproval: vi.fn(async (itemId: string, sp: string) => M.aprovacoes.find((a) => a.itemId === itemId && a.sponsorId === sp)),
    updateItemSponsorApproval: vi.fn(async (id: string, d: Linha) => { const a = M.aprovacoes.find((x) => x.id === id); return a ? Object.assign(a, d) : undefined; }),
    createItemSponsorApproval: vi.fn(async (d: Linha) => { const a = { id: `a-${d.itemId}-${d.sponsorId}`, ...d }; M.aprovacoes.push(a); return a; }),
    initializeItemSponsorApprovals: vi.fn(async () => {}),
  });
  // As duas leituras da trilha: responde conforme o que o WHERE pede.
  H.db.select = () => ({
    from: () => ({
      where: (cond: SQL) => ({
        orderBy: async () => {
          const q = sqlDe(cond);
          consultas.push(q);
          if (q.includes("Thumb de aprovação atualizado")) return M.logsTroca;
          if (q.includes("Aviso por e-mail enviado para")) return M.logsAviso;
          return [];
        },
      }),
    }),
  });
  H.db.transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(H.db));
  H.db.execute = vi.fn(async () => ({ rows: [] }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const versoes = async (query: Record<string, unknown> = {}) => {
  const r = await chamar("GET /api/versoes", { sessao: sessao(), query });
  expect(r.status).toBe(200);
  return r.body as any;
};
const pecaNaTela = async (id: string) => (await versoes({ foco: "todas" })).itens.find((p: any) => p.id === id);

// ═════════════════════════════════════════════════════════════════════════════
// 1 · o que passa a ser GRAVADO
// ═════════════════════════════════════════════════════════════════════════════
describe("1 · o que passa a ser GRAVADO", () => {
  it("duas tabelas novas e uma coluna nova — apagar peça/evento leva a história junto (cascade)", () => {
    const tabV = getTableConfig(itemArtVersions);
    const tabB = getTableConfig(eventBooks);
    expect(tabV.name).toBe("item_art_versions");
    expect(tabB.name).toBe("event_books");
    const decidida = getTableConfig(itemSponsorApprovals).columns.find((c) => c.name === "decided_thumb_url");
    expect(decidida).toBeDefined();
    expect(decidida!.notNull).toBe(false); // aditiva: linhas antigas ficam sem
    const fk = (t: ReturnType<typeof getTableConfig>, col: string) =>
      t.foreignKeys.find((f) => f.reference().columns.some((c) => c.name === col));
    expect(fk(tabV, "item_id")?.onDelete).toBe("cascade");
    expect(fk(tabB, "event_id")?.onDelete).toBe("cascade");
  });

  it("o storage grava e lê as duas tabelas", async () => {
    const real = await vi.importActual<any>("../storage");
    const st = Object.create(real.DatabaseStorage.prototype);
    const inseridos: { tabela: unknown; valores: unknown }[] = [];
    H.db.insert = (tabela: unknown) => ({ values: (valores: unknown) => ({ returning: async () => { inseridos.push({ tabela, valores }); return [valores]; } }) });
    const lidas: unknown[] = [];
    H.db.select = () => ({ from: (tabela: unknown) => ({ orderBy: async () => { lidas.push(tabela); return []; } }) });

    await st.createItemArtVersion({ itemId: "p1", thumbUrl: "/objects/a.png", origem: "envio" });
    await st.createEventBook({ eventId: "ev-1", bookUrl: "/objects/b.pdf", itemCount: 2 });
    await st.getAllItemArtVersions();
    await st.getAllEventBooks();
    expect(inseridos.map((i) => i.tabela)).toEqual([itemArtVersions, eventBooks]);
    expect(lidas).toEqual([itemArtVersions, eventBooks]);
  });

  it("ENVIO para aprovação grava a versão (forma /objects/) e derruba o cache; sem thumb, nada", async () => {
    M.itens = [peca("p1", { status: "awaiting_submission" })];
    M.vinculos = ["sp-vale"];
    const cru = "https://storage.googleapis.com/bucket/.private/uploads/a.png";
    const r = await chamar("PATCH /api/items/:id/submit-for-approval", { sessao: sessao("arte"), params: { id: "p1" }, body: { approvalThumbUrl: cru } });
    expect(r.status).toBe(200);
    expect(H.storage.createItemArtVersion).toHaveBeenCalledWith({ itemId: "p1", thumbUrl: "/objects/uploads/a.png", origem: "envio", createdBy: "Maria" });
    expect(H.invalidou).toContain("versoes");

    H.storage.createItemArtVersion.mockClear();
    M.itens = [peca("p2", { status: "awaiting_submission" })];
    const sem = await chamar("PATCH /api/items/:id/submit-for-approval", { sessao: sessao("arte"), params: { id: "p2" }, body: {} });
    expect(sem.status).toBe(400);
    expect(H.storage.createItemArtVersion).not.toHaveBeenCalled();
  });

  it("REENVIO da Arte grava a versão com origem 'reenvio'", async () => {
    M.itens = [peca("p1", { approvalThumbUrl: "/objects/v1.png" })];
    M.vinculos = ["sp-vale"];
    M.aprovacoes = [aprov("p1", "sp-vale", { status: "awaiting_arte" })];
    const r = await chamar("POST /api/items/:id/sponsor-approvals/resubmit", { sessao: sessao("arte"), params: { id: "p1" }, body: { newThumbUrl: "/objects/v2.png" } });
    expect(r.status).toBe(200);
    expect(H.storage.createItemArtVersion).toHaveBeenCalledWith({ itemId: "p1", thumbUrl: "/objects/v2.png", origem: "reenvio", createdBy: "Maria" });
    expect(H.invalidou).toContain("versoes");
  });

  it("TROCA de thumb grava a versão com origem 'troca'", async () => {
    M.itens = [peca("p1", { status: "awaiting_submission", approvalThumbUrl: "/objects/v1.png" })];
    const r = await chamar("PATCH /api/items/:id/update-thumb", { sessao: sessao("arte"), params: { id: "p1" }, body: { approvalThumbUrl: "/objects/v2.png" } });
    expect(r.status).toBe(200);
    expect(H.storage.createItemArtVersion).toHaveBeenCalledWith(expect.objectContaining({ itemId: "p1", thumbUrl: "/objects/v2.png", origem: "troca" }));
    expect(H.invalidou).toContain("versoes");
  });

  // Os quatro ramos: aprovar/reprovar × linha existente/linha nova.
  for (const acao of ["approve", "reject"] as const) {
    for (const temLinha of [true, false]) {
      it(`${acao === "approve" ? "aprovar" : "reprovar"} ${temLinha ? "(linha existente)" : "(linha nova)"} grava O QUE foi decidido`, async () => {
        M.itens = [peca("p1", { approvalThumbUrl: "/objects/v3.png" })];
        M.vinculos = ["sp-vale", "sp-ache"];
        if (temLinha) M.aprovacoes = [aprov("p1", "sp-vale")];
        const r = await chamar(`POST /api/items/:id/sponsor-approvals/:sponsorId/${acao}`, {
          sessao: sessao("atendimento"), params: { id: "p1", sponsorId: "sp-vale" },
          body: acao === "reject" ? { rejectionReason: "logo torto no canto" } : {},
        });
        expect(r.status).toBe(200);
        const linha = M.aprovacoes.find((a) => a.sponsorId === "sp-vale");
        expect(linha?.decidedThumbUrl).toBe("/objects/v3.png");
        expect(linha?.status).toBe(acao === "approve" ? "approved" : "awaiting_arte");
        expect(H.invalidou).toContain("versoes");
      });
    }
  }

  // Varredura (AST): regra de código "quem grava versão, decisão ou book
  // derruba o cache" — vale para rota nova que ainda não tem teste rodando.
  it("toda função de rota que grava versão, decisão ou book derruba o cache das Versões", () => {
    const ESCRITAS = new Set(["createItemArtVersion", "createItemSponsorApproval", "updateItemSponsorApproval", "createEventBook"]);
    const arquivos: string[] = [];
    const andar = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) andar(p);
        else if (/\.ts$/.test(e.name)) arquivos.push(p);
      }
    };
    andar(path.join(RAIZ, "server/routes"));
    const faltando: string[] = [];
    let vistas = 0;
    for (const arq of arquivos) {
      const fonte = ts.createSourceFile(arq, readFileSync(arq, "utf8"), ts.ScriptTarget.Latest, true);
      const chamaNome = (n: ts.Node, nomes: Set<string>): boolean => {
        let achou = false;
        const v = (x: ts.Node) => {
          if (achou) return;
          if (ts.isCallExpression(x)) {
            const e = x.expression;
            const nome = ts.isPropertyAccessExpression(e) ? e.name.text : ts.isIdentifier(e) ? e.text : "";
            if (nomes.has(nome)) { achou = true; return; }
          }
          ts.forEachChild(x, v);
        };
        v(n);
        return achou;
      };
      // A "unidade" é a função de topo: o handler passado a app.x(...) ou uma função declarada no arquivo.
      const unidades: { nome: string; no: ts.Node }[] = [];
      const coletar = (x: ts.Node) => {
        if (ts.isCallExpression(x) && ts.isPropertyAccessExpression(x.expression) && /^(get|post|patch|put|delete)$/.test(x.expression.name.text)
          && x.arguments.length > 0 && ts.isStringLiteral(x.arguments[0])) {
          const h = x.arguments[x.arguments.length - 1];
          unidades.push({ nome: `${x.expression.name.text.toUpperCase()} ${(x.arguments[0] as ts.StringLiteral).text}`, no: h });
          return;
        }
        if (ts.isFunctionDeclaration(x) && x.name && !/^regist/i.test(x.name.text)) { unidades.push({ nome: x.name.text, no: x }); return; }
        ts.forEachChild(x, coletar);
      };
      coletar(fonte);
      for (const u of unidades) {
        if (!chamaNome(u.no, ESCRITAS)) continue;
        vistas++;
        // revogarAprovacoesEstritas derruba o cache ela mesma quando revoga.
        if (!chamaNome(u.no, new Set(["invalidarCacheDeVersoes", "revogarAprovacoesEstritas"]))) {
          faltando.push(`${path.relative(RAIZ, arq)} · ${u.nome}`);
        }
      }
    }
    expect(vistas).toBeGreaterThan(8); // a varredura achou as rotas de verdade
    // ACHADO (23/09, relatado e não consertado aqui): vincular patrocinador a
    // peça já em aprovação cria a linha 'pending' sem derrubar o cache — a
    // tela de Versões vê a decisão nova só depois do TTL (30 s).
    const CONHECIDOS = ["server/routes/sponsors.ts · POST /api/items/:id/sponsors"];
    expect(faltando.map((f) => f.split(path.sep).join("/")).filter((f) => !CONHECIDOS.includes(f))).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 · o legado é RECONSTRUÍDO e rotulado
// ═════════════════════════════════════════════════════════════════════════════
describe("2 · o legado é RECONSTRUÍDO e rotulado", () => {
  it("a rota exige sessão", async () => {
    const r = await chamar("GET /api/versoes", { query: {} });
    expect(r.status).toBe(401);
    expect((await chamar("GET /api/versoes/export.csv", { query: {} })).status).toBe(401);
  });

  // Varredura: "está registrada" é regra de montagem do app (routes.ts), não comportamento de rota.
  it("todo register*Routes de server/routes é chamado em routes.ts (a de Versões inclusive)", () => {
    const principal = readFileSync(path.join(RAIZ, "server/routes.ts"), "utf8");
    const nomes = readdirSync(path.join(RAIZ, "server/routes")).filter((f) => f.endsWith(".ts"))
      .flatMap((f) => Array.from(readFileSync(path.join(RAIZ, "server/routes", f), "utf8").matchAll(/export (?:async )?function (register\w+Routes)\s*\(/g), (m) => m[1]));
    expect(nomes).toContain("registerVersoesRoutes");
    const soltos = nomes.filter((n) => !new RegExp(`\\b${n}\\s*\\(\\s*app\\b`).test(principal));
    expect(soltos).toEqual([]);
  });

  it("lê a trilha com o MESMO formato que a rota de troca escreve", async () => {
    M.itens = [peca("p1", { status: "awaiting_submission", approvalThumbUrl: "/objects/v1.png" })];
    await chamar("PATCH /api/items/:id/update-thumb", { sessao: sessao("arte"), params: { id: "p1" }, body: { approvalThumbUrl: "/objects/v2.png" } });
    const frase = H.trilha.find((l) => l.detalhe.startsWith("Thumb de aprovação atualizado"))!.detalhe;
    // A troca vira só trilha (sem versão gravada — o legado); a tela reconstrói as duas.
    M.itens = [peca("p1", { approvalThumbUrl: "/objects/v2.png" })];
    M.logsTroca = [logTroca("p1", frase, 30)];
    const p = await pecaNaTela("p1");
    expect(p.versoes).toEqual([
      { thumbUrl: "/objects/v1.png", em: new Date(T(30).getTime() - 1).toISOString(), origem: "trilha", por: null, inferida: true },
      { thumbUrl: "/objects/v2.png", em: iso(30), origem: "trilha", por: "Maria", inferida: true },
    ]);
    // e só a trilha de TROCA é consultada
    expect(consultas.some((q) => q.includes("like 'Thumb de aprovação atualizado%'"))).toBe(true);
  });

  it("versão do estado atual e decisão sem registro saem com a bandeira de inferida", async () => {
    M.itens = [peca("p1", { approvalThumbUrl: "/objects/v1.png", updatedAt: T(5) })];
    M.aprovacoes = [aprov("p1", "sp-vale", { status: "approved", approvedAt: T(10), approvedBy: "Bia" })];
    const p = await pecaNaTela("p1");
    expect(p.versoes).toEqual([{ thumbUrl: "/objects/v1.png", em: iso(5), origem: "atual", por: null, inferida: true }]);
    expect(p.decisoes[0]).toMatchObject({ thumbUrl: "/objects/v1.png", inferido: true, versao: 1, divergente: false });
  });

  it("a versão GRAVADA vence a reconstruída — nunca inferir o que foi registrado", async () => {
    M.itens = [peca("p1", { approvalThumbUrl: "/objects/v2.png" })];
    M.versoes = [versao("p1", "/objects/v1.png", 1), versao("p1", "/objects/v2.png", 20, "troca", "Ana")];
    M.logsTroca = [logTroca("p1", "Thumb de aprovação atualizado por Ana. Anterior: /objects/v1.png → Novo: /objects/v2.png", 20)];
    M.aprovacoes = [aprov("p1", "sp-vale", { status: "approved", approvedAt: T(10), decidedThumbUrl: "/objects/v1.png" })];
    const p = await pecaNaTela("p1");
    expect(p.versoes.map((v: any) => [v.thumbUrl, v.origem, v.inferida])).toEqual([
      ["/objects/v1.png", "envio", false], ["/objects/v2.png", "troca", false],
    ]);
    // aprovou v1, a peça está em v2: divergente, registrado (não inferido)
    expect(p.decisoes[0]).toMatchObject({ versao: 1, inferido: false, divergente: true });
    expect(p.divergente).toBe(true);
  });

  it("CORREÇÃO 24/08 · a numeração é por ocorrência: arquivo reenviado não faz a v3 virar v1", async () => {
    M.itens = [peca("p1", { approvalThumbUrl: "/objects/a.png" })];
    M.versoes = [versao("p1", "/objects/a.png", 1), versao("p1", "/objects/b.png", 10), versao("p1", "/objects/a.png", 20, "reenvio")];
    M.aprovacoes = [
      aprov("p1", "sp-vale", { status: "approved", approvedAt: T(30), decidedThumbUrl: "/objects/a.png" }),
      aprov("p1", "sp-ache", { status: "rejected", rejectedAt: T(5), decidedThumbUrl: "/objects/a.png" }),
    ];
    const p = await pecaNaTela("p1");
    expect(p.decisoes.find((d: any) => d.sponsorId === "sp-vale").versao).toBe(3);
    expect(p.decisoes.find((d: any) => d.sponsorId === "sp-ache").versao).toBe(1);
  });

  it("CORREÇÃO 24/08 · decisão inferida empatada (≤1 s) com a troca de arte vira INDETERMINADA", async () => {
    M.itens = [peca("p1", { approvalThumbUrl: "/objects/b.png" })];
    M.versoes = [versao("p1", "/objects/a.png", 1), versao("p1", "/objects/b.png", 10)];
    // decidiu 0,8 s ANTES de a arte trocar: pela data valia a v1, mas a ordem real é indeterminável
    const empate = new Date(T(10).getTime() - 800);
    M.aprovacoes = [aprov("p1", "sp-vale", { status: "approved", approvedAt: empate })];
    const p = await pecaNaTela("p1");
    expect(p.decisoes[0]).toMatchObject({ ambiguo: true, versao: null, inferido: true });
    expect(p.indeterminada).toBe(true);
    expect(p.atencao).toBe(true);

    // longe da troca (5 s), a decisão se amarra à versão vigente
    invalidarCacheDeVersoes();
    M.aprovacoes = [aprov("p1", "sp-vale", { status: "approved", approvedAt: new Date(T(10).getTime() + 5000) })];
    expect((await pecaNaTela("p1")).decisoes[0]).toMatchObject({ ambiguo: false, versao: 2 });
  });

  it("peças apagadas e o BOOK COMPLETO ficam fora", async () => {
    M.itens = [
      peca("viva", { approvalThumbUrl: "/objects/a.png" }),
      peca("apagada", { approvalThumbUrl: "/objects/a.png", deletedAt: T(1) }),
      peca("book", { type: "BOOK COMPLETO", approvalThumbUrl: "/objects/a.png" }),
    ];
    const ids = (await versoes({ foco: "todas" })).itens.map((p: any) => p.id);
    expect(ids).toEqual(["viva"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 · o servidor filtra, pagina, resume e exporta
// ═════════════════════════════════════════════════════════════════════════════
describe("3 · o servidor filtra, pagina, resume e exporta", () => {
  // 30 peças com história (atenção) no ev-1, 5 no ev-2, e uma quieta no ev-1.
  const montarAcervo = () => {
    for (let i = 0; i < 35; i++) {
      const id = `p${String(i).padStart(2, "0")}`;
      M.itens.push(peca(id, { eventId: i < 30 ? "ev-1" : "ev-2", approvalThumbUrl: "/objects/b.png" }));
      M.versoes.push(versao(id, "/objects/a.png", 1), versao(id, "/objects/b.png", 2));
    }
    M.itens.push(peca("quieta", { approvalThumbUrl: "/objects/a.png" }));
    M.aprovacoes.push(aprov("p00", "sp-vale", { status: "approved", approvedAt: T(3), decidedThumbUrl: "/objects/b.png" }));
    M.aprovacoes.push(aprov("quieta", "sp-ache", { status: "pending" }));
  };

  it("aceita o recorte e devolve UMA página, com tamanho entre 10 e 120 (padrão 40)", async () => {
    montarAcervo();
    const r = await versoes({ evento: "ev-1", tamanho: "10", pagina: "1" });
    expect(r.total).toBe(30);
    expect(r.itens).toHaveLength(10);
    expect(r.itens[0].id).toBe("p10");
    expect(r).toMatchObject({ pagina: 1, tamanho: 10 });
    expect((await versoes({ tamanho: "3" })).tamanho).toBe(10);
    expect((await versoes({ tamanho: "999" })).tamanho).toBe(120);
    expect((await versoes({ tamanho: "xyz" })).tamanho).toBe(40);
    // foco desconhecido cai em "atenção"
    expect((await versoes({ foco: "qualquer" })).total).toBe(35);
    expect((await versoes({ foco: "sem-patrocinador" })).total).toBe(34);
  });

  it("facetas contam o pool SEM a própria dimensão — e o resumo, sem o foco", async () => {
    montarAcervo();
    const r = await versoes({ evento: "ev-1" });
    // o filtro de evento não esconde o outro evento da própria faceta
    expect(r.facetas.eventos).toEqual([
      { value: "ev-1", label: "COPA NORTE", count: 30 },
      { value: "ev-2", label: "ECO RUN", count: 5 },
    ]);
    // resumo: a quieta (sem atenção) conta no total, mesmo com foco "atenção"
    expect(r.resumo).toMatchObject({ total: 31, atencao: 30, comHistorico: 30, semPatrocinador: 29 });
    // a faceta de patrocinador respeita evento e foco
    expect(r.facetas.patrocinadores).toEqual([{ value: "sp-vale", label: "Vale", count: 1 }]);
    const busca = await versoes({ busca: "P01" });
    expect(busca.itens.map((p: any) => p.id)).toEqual(["p01"]);
  });

  it("'precisa de atenção' é sobre VERSÃO — decisão parada há meses não entra (prazo não mora aqui)", async () => {
    M.itens = [peca("parada", { approvalThumbUrl: "/objects/a.png", updatedAt: new Date("2026-01-01") })];
    M.aprovacoes = [aprov("parada", "sp-vale", { status: "pending", createdAt: new Date("2026-01-01") })];
    const r = await versoes();
    expect(r.total).toBe(0);
    expect(r.resumo.atencao).toBe(0);
    const p = await pecaNaTela("parada");
    expect(p.atencao).toBe(false);
    // nenhum campo de prazo/cobrança viaja na peça
    expect(Object.keys(p).filter((k) => /prazo|dias|cobr/i.test(k))).toEqual([]);
  });

  describe("books", () => {
    const BOOK = "/objects/books/atual.pdf";
    const booksDoEv1 = async () => (await versoes()).books.find((b: any) => b.eventId === "ev-1").books;

    it("desatualizado conta as peças DO BOOK, e diz quais — com identidade", async () => {
      M.itens = [
        peca("dentro", { bookUrl: BOOK, approvalThumbUrl: "/objects/b.png", approvalThumbUpdatedAt: T(50), status: "sponsor_approved" }),
        peca("fora", { approvalThumbUrl: "/objects/b.png", approvalThumbUpdatedAt: T(50) }),
      ];
      M.versoes = [
        versao("dentro", "/objects/a.png", 1), versao("dentro", "/objects/b.png", 50, "troca", "Ana"),
        versao("fora", "/objects/a.png", 1), versao("fora", "/objects/b.png", 50, "troca", "Ana"),
      ];
      M.books = [{ eventId: "ev-1", bookUrl: BOOK, createdAt: T(20), createdBy: "Arte", itemCount: 1, comment: "trocamos a Vale" }];
      const [b] = await booksDoEv1();
      expect(b).toMatchObject({ bookUrl: BOOK, em: iso(20), por: "Arte", comentario: "trocamos a Vale", membrosConhecidos: true, inferido: false, pecasMudaramDepois: 1 });
      expect(b.pecasMudaram).toEqual([{
        id: "dentro", displayId: "#dentro", eventId: "ev-1", em: iso(50), type: "Pórtico",
        description: "Peça dentro", status: "sponsor_approved", por: "Ana", versao: 2,
      }]);
    });

    it("os membros saem de TODOS os itens — peça sem versão nem decisão também é do book", async () => {
      M.itens = [peca("crua", { bookUrl: BOOK }), peca("crua2", { bookUrl: BOOK })];
      M.books = [
        { eventId: "ev-1", bookUrl: BOOK, createdAt: T(20), createdBy: "Arte", itemCount: 2 },
        { eventId: "ev-1", bookUrl: "/objects/books/velho.pdf", createdAt: T(10), createdBy: "Arte", itemCount: 7 },
      ];
      const [atual, velho] = await booksDoEv1();
      expect(atual).toMatchObject({ bookUrl: BOOK, membrosConhecidos: true, pecasMudaramDepois: 0 });
      // o substituído guarda a contagem, não a lista
      expect(velho).toMatchObject({ itemCount: 7, membrosConhecidos: false });
    });

    it("só conta como TROCA o que tem prova de arte nova — updatedAt de uma descrição não é troca", async () => {
      M.itens = [
        peca("descricao", { bookUrl: BOOK, approvalThumbUrl: "/objects/a.png", updatedAt: T(60) }),
        peca("carimbo", { bookUrl: BOOK, approvalThumbUrl: "/objects/a.png", updatedAt: T(60), approvalThumbUpdatedAt: T(60) }),
      ];
      M.books = [{ eventId: "ev-1", bookUrl: BOOK, createdAt: T(20), createdBy: "Arte", itemCount: 2 }];
      const [b] = await booksDoEv1();
      expect(b.pecasMudaram.map((p: any) => p.id)).toEqual(["carimbo"]);
    });

    it("o book atual sem registro (legado) entra sem data, sem fingir que é o mais novo", async () => {
      M.itens = [peca("x", { bookUrl: "/objects/books/legado.pdf" }), peca("y", { bookUrl: "/objects/books/legado.pdf" })];
      M.books = [{ eventId: "ev-1", bookUrl: "/objects/books/antigo.pdf", createdAt: T(5), createdBy: "Arte", itemCount: 3 }];
      const lista = await booksDoEv1();
      expect(lista.map((b: any) => b.bookUrl)).toEqual(["/objects/books/antigo.pdf", "/objects/books/legado.pdf"]);
      expect(lista[1]).toEqual({ bookUrl: "/objects/books/legado.pdf", em: null, por: null, itemCount: 2, inferido: true, comentario: null, membrosConhecidos: true, pecasMudaramDepois: 0, pecasMudaram: [] });
    });

    it("o último aviso ENVIADO sai da trilha — data e pessoas; nada de taxa de abertura", async () => {
      M.itens = [peca("x", { bookUrl: BOOK })];
      M.books = [{ eventId: "ev-1", bookUrl: BOOK, createdAt: T(5), createdBy: "Arte", itemCount: 1 }];
      const log = (detalhe: string, min: number) => ({ entityType: "event", entityId: "ev-1", details: detalhe, createdAt: T(min) });
      M.logsAviso = [
        log(descreverEnvio({ status: "sent", para: ["a@x.com"], copia: [], descartados: [] } as any), 10),
        log(`Reenvio manual. ${descreverEnvio({ status: "sent", para: ["a@x.com", "b@x.com"], copia: ["c@x.com", "d@x.com", "e@x.com"], descartados: ["ruim"] } as any)}`, 20),
        log(descreverEnvio({ status: "failed", reason: "SMTP fora" } as any), 30),
      ];
      const ev = (await versoes()).books.find((b: any) => b.eventId === "ev-1");
      expect(ev.aviso).toEqual({ em: iso(20), pessoas: 5 });
      // a consulta só pede os ENVIADOS (o "NÃO enviado" não é aviso dado)
      const q = consultas.find((c) => c.includes("Aviso por e-mail"))!;
      expect(q).toContain("like 'Aviso por e-mail enviado para %'");
      expect(q).toContain("like 'Reenvio manual. Aviso por e-mail enviado para %'");
    });
  });

  it("o CSV exporta o RECORTE inteiro (não a página), com BOM e CRLF", async () => {
    M.itens = [];
    for (let i = 0; i < 45; i++) {
      M.itens.push(peca(`c${String(i).padStart(2, "0")}`, { approvalThumbUrl: "/objects/b.png" }));
      M.versoes.push(versao(`c${String(i).padStart(2, "0")}`, "/objects/a.png", 1), versao(`c${String(i).padStart(2, "0")}`, "/objects/b.png", 2));
    }
    M.aprovacoes = [aprov("c00", "sp-vale", { status: "approved", approvedAt: T(3), decidedThumbUrl: "/objects/a.png", rejectionReason: null })];
    const r = await chamar("GET /api/versoes/export.csv", { sessao: sessao(), query: { tamanho: "10" } });
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toBe("text/csv; charset=utf-8");
    const corpo = r.body as string;
    expect(corpo.charCodeAt(0)).toBe(0xfeff);
    const linhas = corpo.slice(1).split("\r\n");
    expect(linhas[0].split(";")).toContain("Aprovou versão diferente da atual");
    expect(linhas).toHaveLength(1 + 45);
    expect(linhas.find((l) => l.includes("#c00"))).toMatch(/;Vale;Aprovou;v1;.*;SIM$/);
  });

  it("célula de CSV que parece fórmula vira texto", () => {
    expect(csv("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csv("-1")).toBe("'-1");
    expect(csv(12)).toBe("12");
  });

  it("o cache curto evita recalcular a cada filtro — e a escrita o derruba na hora", async () => {
    M.itens = [peca("p1", { approvalThumbUrl: "/objects/a.png" })];
    await versoes({ foco: "todas" });
    await versoes({ foco: "todas", busca: "x" });
    expect(H.storage.getAllItems).toHaveBeenCalledTimes(1);

    // uma aprovação muda o quadro: a próxima leitura já vê
    M.vinculos = ["sp-vale"];
    M.itens[0].status = "awaiting_sponsor_approval";
    await chamar("POST /api/items/:id/sponsor-approvals/:sponsorId/approve", { sessao: sessao("atendimento"), params: { id: "p1", sponsorId: "sp-vale" } });
    const p = await pecaNaTela("p1");
    expect(H.storage.getAllItems).toHaveBeenCalledTimes(2);
    expect(p.decisoes[0]).toMatchObject({ status: "approved", thumbUrl: "/objects/a.png" });
  });

  it("usuário do Kit vê só as peças dele", async () => {
    M.itens = [peca("minha", { approvalThumbUrl: "/objects/a.png" }), peca("alheia", { approvalThumbUrl: "/objects/a.png" })];
    M.kit = ["minha"];
    const r = await chamar("GET /api/versoes", { sessao: { ...sessao("solicitacao"), userKit: true }, query: { foco: "todas" } });
    expect((r.body as any).itens.map((p: any) => p.id)).toEqual(["minha"]);
  });
});
