// ─────────────────────────────────────────────────────────────────────────────
// O KIT NO SERVIDOR — as rotas, o login e os serviços reais, sobre um storage e
// um banco de mentira. O usuário do Kit só vê (e só mexe) nas peças do Kit que
// ele criou; a marca vem do login; remessa é do admin e da Solicitação.
//
// Vieram de casos de kit.test.ts que só liam o fonte:
//   · schema (marca no usuário, remessa com as datas, peça com remessa e autor);
//   · a marca vem do login e mudar a marca derruba as sessões;
//   · remessas: criar/excluir é admin|Solicitação, o Kit lista só as dele,
//     versão repetida barrada, excluir só antes de a peça andar;
//   · peças: o recorte nas listas, na criação, na Entrada Rápida e na importação
//     (e o aviso que falha não desfaz a importação);
//   · eventos: contagens só das peças dele, e o envio separa Kit e Arena;
//   · o recorte nas outras leituras: Gestão de Prazos, busca, trilha, sino,
//     fotos e a planilha exportada.
//
// Os que já rodam em outro arquivo foram só citados lá em kit.test.ts:
// GET /api/items cheio/delta/recorte (itens-compactos.test.ts) e Versões
// (regras-avisos-versoes.test.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { getTableConfig } from "drizzle-orm/pg-core";
import { getTableName } from "drizzle-orm";

const H = vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://teste:teste@localhost:5432/banco_nunca_acessado";
  return {
    storage: {} as Record<string, any>,
    db: {} as Record<string, any>,
    pool: { query: (async () => ({ rows: [], rowCount: 0 })) as any },
    broadcast: [] as any[],
    trilha: [] as string[],
    usuarios: [] as Array<Record<string, unknown>>,
    sessoesAvisadas: [] as string[],
    /** O que cada SELECT devolve: (nome da tabela, WHERE) → linhas. */
    consulta: ((_t: string, _w: unknown) => []) as (t: string, w: unknown) => any[],
    inseridos: [] as Array<{ tabela: string; valores: any }>,
    /** As linhas que a exportação escreveu na planilha (ws.addRow). */
    linhasDaPlanilha: [] as Array<Record<string, unknown>>,
  };
});

vi.mock("../db", () => ({ db: H.db, pool: H.pool }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  const passa = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    ...real,
    // Os limitadores de login contam no Postgres; aqui não é deles que se trata.
    loginRateLimiter: passa, loginPorContaRateLimiter: passa, changePasswordRateLimiter: passa,
    broadcast: (m: any) => { H.broadcast.push(m); },
    createAuditLog: async (_r: any, _a: string, _t: string, _id: string, detalhe: string) => { H.trilha.push(detalhe); },
    createAuditLogsEmLote: async (_r: any, linhas: Array<{ details: string }>) => { for (const l of linhas) H.trilha.push(l.details); },
    updateEventStatus: async () => {},
  };
});
vi.mock("../login-seguro", async () => {
  const real = await vi.importActual<any>("../login-seguro");
  return { ...real, buscarUsuarioPorEmail: async (email: string) => H.usuarios.find((u) => String(u.email).toLowerCase() === email.toLowerCase()) };
});
vi.mock("../sessoes-encerradas", () => ({ avisarSessoesEncerradas: (id: string) => { H.sessoesAvisadas.push(id); } }));
// O exceljs não carrega neste ambiente (falta o jszip); a planilha de mentira
// guarda as linhas que a exportação escreveria — é o que o teste confere.
vi.mock("exceljs", () => {
  const celula = () => ({ value: undefined as unknown });
  const linha = () => ({ height: 0, getCell: () => celula(), eachCell: () => {} });
  class Workbook {
    creator = ""; created = new Date();
    xlsx = { write: async () => {} };
    addWorksheet() {
      return {
        columns: [] as unknown[], mergeCells: () => {}, getCell: () => celula(), getRow: () => linha(),
        addRow: (valores: Record<string, unknown>) => { H.linhasDaPlanilha.push(valores); return linha(); },
      };
    }
  }
  return { default: { Workbook } };
});
vi.mock("../services/prioridadeAutomatica", () => ({ aplicarPrioridadeAutomatica: async () => ({ ajustados: 0 }) }));

import { items, users, kitRemessas } from "@shared/schema";
import { publicInsertItemSchema } from "@shared/schema";
import { registerAuthRoutes } from "../routes/auth";
import { registerKitRoutes } from "../routes/kit";
import { registrarCriacao } from "../routes/itens/criacao";
import { registrarFilasEPorEvento } from "../routes/itens/leitura";
import { registerEventRoutes } from "../routes/events";
import { registerPrazoRoutes } from "../routes/prazos";
import { registerBuscaRoutes } from "../routes/busca";
import { registerAuditLogRoutes } from "../routes/audit-logs";
import { registerNotificationRoutes } from "../routes/notifications";
import { registerPhotoRoutes } from "../routes/photos";
import { handleConfirmImport } from "../services/xlsxImport";
import { handleExportItemsXlsx } from "../services/xlsxExport";
import { invalidateNotificationsCache } from "../cache";
import { capturarRotas } from "./rotas-de-mentira";
import { textosDoWhere } from "./tx-de-mentira";
import { ligarStorage, mundoNovo, peca, sessao, type Mundo } from "./regras-fluxo-apoio";

const { rotas, chamar } = capturarRotas((app) => {
  registerAuthRoutes(app); registerKitRoutes(app); registrarCriacao(app); registrarFilasEPorEvento(app);
  registerEventRoutes(app); registerPrazoRoutes(app); registerBuscaRoutes(app); registerAuditLogRoutes(app);
  registerNotificationRoutes(app); registerPhotoRoutes(app);
});
const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.resolve(RAIZ, rel), "utf8");
const KIT = sessao("solicitacao", { userId: "u-kit", userKit: true });
const ARENA = sessao("solicitacao", { userId: "u-arena" });

// ─── o banco de mentira ──────────────────────────────────────────────────────
function cadeia(tabela: unknown) {
  let where: unknown = null;
  const c: any = {
    where: (w: unknown) => { where = w; return c; },
    leftJoin: () => c, innerJoin: () => c, orderBy: () => c, limit: () => c, for: () => c,
    then: (ok: any, erro: any) => Promise.resolve().then(() => H.consulta(getTableName(tabela as any), where)).then(ok, erro),
  };
  return c;
}
function inserir(tabela: unknown) {
  return {
    values: (valores: any) => {
      H.inseridos.push({ tabela: getTableName(tabela as any), valores });
      const linhas = (Array.isArray(valores) ? valores : [valores]).map((v: any, i: number) => ({ id: getTableName(tabela as any) === "kit_remessas" ? "rem-nova" : `peca-${i}`, ...v }));
      const p: any = Promise.resolve(linhas);
      p.returning = async () => linhas;
      p.onConflictDoNothing = () => p;
      return p;
    },
  };
}

let mundo: Mundo;
let remessas: any[];
beforeEach(async () => {
  mundo = mundoNovo();
  ligarStorage(H.storage, mundo);
  H.broadcast.length = 0; H.trilha.length = 0; H.sessoesAvisadas.length = 0; H.inseridos.length = 0;
  remessas = [
    { id: "rem-kit", eventId: "ev-1", versao: "V1", criadoPorId: "u-kit", entregaMaterial: new Date("2099-01-03T12:00:00Z") },
    { id: "rem-outro", eventId: "ev-1", versao: "V2", criadoPorId: "u-outro-kit", entregaMaterial: new Date("2099-01-04T12:00:00Z") },
  ];
  // As peças do Kit dele, de outro usuário do Kit, e a da Arena.
  mundo.itens.minha = peca({ id: "minha", displayId: "#K1", kitRemessaId: "rem-kit", criadoPorId: "u-kit", status: "draft" });
  mundo.itens.alheia = peca({ id: "alheia", displayId: "#K2", kitRemessaId: "rem-outro", criadoPorId: "u-outro-kit", status: "draft" });
  mundo.itens.arena = peca({ id: "arena", displayId: "#0500", status: "draft" });
  H.consulta = (tabela, where) => {
    if (tabela === "kit_remessas") {
      // O WHERE de verdade: por id, por evento, por versão (sem caixa) e (Kit) por quem criou.
      const textos = textosDoWhere(where);
      const filtra = (prefixo: RegExp, valor: string) => !textos.some((t) => prefixo.test(t)) || textos.some((t) => t.toLowerCase() === valor.toLowerCase());
      return remessas.filter((r) => filtra(/^rem-/, r.id) && filtra(/^u-/, r.criadoPorId) && filtra(/^ev-/, r.eventId) && filtra(/^v[0-9]+$/i, r.versao));
    }
    if (tabela === "items") return Object.values(mundo.itens);
    return [];
  };
  H.db.select = () => ({ from: (t: unknown) => cadeia(t) });
  H.db.insert = inserir;
  H.db.update = () => ({ set: () => ({ where: async () => [] }) });
  H.db.delete = () => ({ where: async () => [] });
  H.db.execute = async () => ({ rows: [] });
  H.pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));

  const s = H.storage;
  const vivas = () => Object.values(mundo.itens).filter((i: any) => !i.deletedAt);
  s.getAllItems = vi.fn(async () => vivas());
  s.getComplementsByParentIds = vi.fn(async () => []);
  s.getPendingItems = vi.fn(async () => vivas());
  s.getApprovedItems = vi.fn(async () => vivas());
  s.getItemsDoKitDoCriador = vi.fn(async () => vivas().filter((i: any) => i.kitRemessaId)); // até a alheia: a rota filtra de novo
  s.getIdsDasPecasDoKitDoCriador = vi.fn(async (uid: string | null) => vivas().filter((i: any) => i.kitRemessaId && i.criadoPorId === uid).map((i: any) => i.id));
  s.getItemsParaPrazos = vi.fn(async () => vivas());
  s.getAllEvents = vi.fn(async () => Object.values(mundo.eventos));
  s.getEventsByIds = vi.fn(async (ids: string[]) => ids.map((id) => mundo.eventos[id]).filter(Boolean));
  s.getAllSponsors = vi.fn(async () => []);
  s.getAllEventSponsors = vi.fn(async () => []);
  s.getAllItemSponsors = vi.fn(async () => []);
  s.getAllItemSponsorApprovals = vi.fn(async () => []);
  s.getItemSponsorsByItemIds = vi.fn(async () => []);
  s.getItemSponsorApprovalsByItemIds = vi.fn(async () => []);
  s.getOpenItemSponsorApprovals = vi.fn(async () => []);
  s.getAllUsers = vi.fn(async () => []);
  s.updateItemWithStatusCheck = vi.fn(async (id: string, _de: string, para: string) => (mundo.itens[id] = { ...mundo.itens[id], status: para }));
  s.updateUser = vi.fn(async (id: string, dados: any) => ({ ...H.usuarios.find((u) => u.id === id), ...dados }));
  s.getAuditLogs = vi.fn(async () => [
    { id: "l1", entityType: "item", entityId: "minha", userId: "u-arena", details: "na peça dele", createdAt: new Date() },
    { id: "l2", entityType: "item", entityId: "arena", userId: "u-arena", details: "na peça da Arena", createdAt: new Date() },
    { id: "l3", entityType: "event", entityId: "ev-1", userId: "u-kit", details: "o que ele fez", createdAt: new Date() },
  ]);
  s.getAllNotifications = vi.fn(async () => [
    { id: "n1", type: "itemAdded", itemId: "minha", targetRoles: ["solicitacao"], targetUserId: null },
    { id: "n2", type: "itemAdded", itemId: "arena", targetRoles: ["solicitacao"], targetUserId: null },
    { id: "n3", type: "aviso", itemId: null, targetRoles: ["solicitacao"], targetUserId: "u-kit" },
  ]);
  s.getAllDeliveryPhotos = vi.fn(async () => [{ id: "f1", itemId: "minha" }, { id: "f2", itemId: "arena" }, { id: "f3", itemId: "alheia" }]);
  invalidateNotificationsCache();
});

// ═════════════════════════════════════════════════════════════════════════════
describe("o modelo", () => {
  it("marca no usuário, remessa com as datas do Kit, peça com remessa e autor — o autor não vem do corpo", () => {
    const kit = getTableConfig(users).columns.find((c) => c.name === "kit");
    expect(kit).toMatchObject({ notNull: true, default: false });
    const rem = getTableConfig(kitRemessas);
    expect(rem.name).toBe("kit_remessas");
    expect(rem.columns.find((c) => c.name === "entrega_material")?.notNull).toBe(true);
    const tabela = getTableConfig(items);
    const fk = tabela.foreignKeys.find((f) => f.reference().columns.some((c) => c.name === "kit_remessa_id"));
    expect(getTableName(fk!.reference().foreignTable)).toBe("kit_remessas");
    expect(fk!.onDelete).toBe("set null");
    expect(tabela.columns.some((c) => c.name === "criado_por_id")).toBe(true);
    const LINHA = { eventId: "ev-1", type: "Pórtico", description: "x", quantity: 1, area: "9.00", visual: "9.00", material: "Lona", finish: "Ilhós", measurement: "3x3", calculatedM2: "9.00" };
    expect(publicInsertItemSchema.parse({ ...LINHA, criadoPorId: "forjado" })).not.toHaveProperty("criadoPorId");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("a marca vem do login", () => {
  beforeEach(async () => {
    const hash = await bcrypt.hash("senha-certa", 4);
    H.usuarios = [
      { id: "u-kit", name: "Kaio", email: "kaio@x.com", role: "solicitacao", kit: true, passwordHash: hash },
      { id: "u-arena", name: "Ana", email: "ana@x.com", role: "solicitacao", kit: false, passwordHash: hash },
    ];
  });

  it("o login por senha grava a marca na sessão (true só para quem tem kit = true)", async () => {
    // A pilha da rota rodada à mão para LER a sessão depois (o chamar não a devolve).
    const logar = async (email: string) => {
      const sessaoDoLogin: Record<string, unknown> = { regenerate: (cb: () => void) => cb(), save: (cb: () => void) => cb() };
      const req: any = { body: { email, password: "senha-certa" }, session: sessaoDoLogin, headers: {}, ip: "127.0.0.1", socket: {} };
      const res: any = { statusCode: 200, status(c: number) { res.statusCode = c; return res; }, json() { return res; } };
      for (const h of rotas.get("POST /api/auth/login")!) {
        let seguiu = false;
        await h(req, res, () => { seguiu = true; });
        if (!seguiu) break;
      }
      expect(res.statusCode).toBe(200);
      return sessaoDoLogin;
    };
    expect(await logar("kaio@x.com")).toMatchObject({ userId: "u-kit", userKit: true });
    expect(await logar("ana@x.com")).toMatchObject({ userId: "u-arena", userKit: false });
  });

  it("mudar a marca (ou o perfil) derruba as sessões da pessoa; mudar só o nome, não", async () => {
    const admin = sessao("admin", { userId: "u-admin" });
    await chamar("PATCH /api/users/:id", { sessao: admin, params: { id: "u-arena" }, body: { kit: true } });
    expect(H.sessoesAvisadas).toEqual(["u-arena"]);
    expect(H.pool.query).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM session"), ["u-arena"]);
    expect(H.trilha.at(-1)).toContain("marcado como usuário do Kit");

    await chamar("PATCH /api/users/:id", { sessao: admin, params: { id: "u-arena" }, body: { name: "Ana Paula" } });
    expect(H.sessoesAvisadas).toEqual(["u-arena"]);
  });

  it("a sessão SSO e o middleware copiam a mesma marca (varredura: vivem dentro do servidor inteiro)", () => {
    // index.ts (SSO) e routes.ts (middleware) só rodam com o app de pé;
    // aqui confere-se que os dois leem a marca do mesmo lugar e do mesmo jeito.
    expect(ler("server/index.ts")).toMatch(/req\.session\.userKit\s*=\s*fullUser\[0\]\.kit === true;/);
    const rotas = ler("server/routes.ts");
    expect(rotas).toMatch(/req\.userKit\s*=\s*req\.session\.userKit === true;/);
    expect(rotas).toMatch(/\bregisterKitRoutes\(app\);/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("remessas do Kit", () => {
  const nova = { eventId: "ev-1", versao: "V9", entregaMaterial: "2099-01-05" };

  it("criar e excluir é do admin e da Solicitação", async () => {
    for (const papel of ["arte", "grafica", "atendimento"]) {
      expect((await chamar("POST /api/kit/remessas", { sessao: sessao(papel), body: nova })).status, papel).toBe(403);
      expect((await chamar("DELETE /api/kit/remessas/:id", { sessao: sessao(papel), params: { id: "rem-kit" } })).status, papel).toBe(403);
    }
    expect((await chamar("POST /api/kit/remessas", { sessao: sessao("admin"), body: nova })).status).toBe(201);
    expect(H.inseridos[0]).toMatchObject({ tabela: "kit_remessas", valores: { versao: "V9", criadoPorId: "u1" } });
  });

  it("o usuário do Kit lista só as dele; os outros listam todas do evento", async () => {
    const doKit = await chamar("GET /api/kit/remessas", { sessao: KIT, query: { eventId: "ev-1" } });
    expect((doKit.body as any[]).map((r) => r.id)).toEqual(["rem-kit"]);
    const daArena = await chamar("GET /api/kit/remessas", { sessao: ARENA, query: { eventId: "ev-1" } });
    expect((daArena.body as any[]).map((r) => r.id)).toEqual(["rem-kit", "rem-outro"]);
  });

  it("versão repetida no mesmo evento é barrada (sem diferença de caixa)", async () => {
    const repetida = await chamar("POST /api/kit/remessas", { sessao: sessao("admin"), body: { ...nova, versao: "v1" } });
    expect(repetida.status).toBe(409);
    expect(H.inseridos).toEqual([]);
    expect((repetida.body as any).error).toBe("Já existe a remessa KIT v1 neste evento — use a próxima versão ou exclua a repetida.");
  });

  it("excluir a remessa só enquanto nenhuma peça andou", async () => {
    H.consulta = (t) => (t === "kit_remessas" ? [remessas[0]] : t === "items" ? [{ id: "minha", displayId: "#K1", status: "awaiting_linking" }] : []);
    const andou = await chamar("DELETE /api/kit/remessas/:id", { sessao: KIT, params: { id: "rem-kit" } });
    expect(andou.status).toBe(409);
    expect((andou.body as any).error).toBe("Não dá para excluir: 1 peça já seguiu o fluxo (#K1). Cancele antes.");

    H.consulta = (t) => (t === "kit_remessas" ? [remessas[0]] : t === "items" ? [{ id: "minha", displayId: "#K1", status: "draft" }] : []);
    const ok = await chamar("DELETE /api/kit/remessas/:id", { sessao: KIT, params: { id: "rem-kit" } });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true, excluidas: 1 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("as peças do Kit", () => {
  const LINHA = { eventId: "ev-1", type: "Pórtico", description: "x", quantity: 1, area: "9.00", visual: "9.00", material: "Lona", finish: "Ilhós", measurement: "3x3", calculatedM2: "9.00" };
  const ids = (r: { body: unknown }) => (r.body as any[]).map((i) => i.id).sort();

  it("as listas (por evento, pendentes, fila da Gráfica) cortam no que ele criou", async () => {
    expect(ids(await chamar("GET /api/items/:eventId", { sessao: KIT, params: { eventId: "ev-1" } }))).toEqual(["minha"]);
    expect(ids(await chamar("GET /api/items/pending", { sessao: KIT }))).toEqual(["minha"]);
    expect(ids(await chamar("GET /api/items/approved", { sessao: KIT }))).toEqual(["minha"]);
    // Quem não é do Kit vê tudo.
    expect(ids(await chamar("GET /api/items/:eventId", { sessao: ARENA, params: { eventId: "ev-1" } }))).toEqual(["alheia", "arena", "minha"]);
  });

  it("criar: o Kit só cria na remessa DELE, e o autor é quem está logado", async () => {
    const semRemessa = await chamar("POST /api/items", { sessao: KIT, body: LINHA });
    expect(semRemessa.status).toBe(400);
    expect((semRemessa.body as any).error).toBe("Usuário do Kit cria só peça do Kit — escolha a remessa do Kit.");

    const alheia = await chamar("POST /api/items", { sessao: KIT, body: { ...LINHA, kitRemessaId: "rem-outro" } });
    expect(alheia.status).toBe(403);

    const ok = await chamar("POST /api/items", { sessao: KIT, body: { ...LINHA, kitRemessaId: "rem-kit", criadoPorId: "forjado" } });
    expect(ok.status).toBe(201);
    expect(mundo.criadas.at(-1)).toMatchObject({ kitRemessaId: "rem-kit", criadoPorId: "u-kit" });
  });

  it("a Entrada Rápida não cria peça do Kit", async () => {
    const r = await chamar("POST /api/items/bulk", { sessao: KIT, body: { items: [LINHA] } });
    expect(r.status).toBe(403);
    expect((r.body as any).error).toBe("A Entrada Rápida não cria peça do Kit — use o formulário ou a importação.");
    expect(H.storage.createBulkItems).not.toHaveBeenCalled();
  });

  describe("importação da planilha", () => {
    const LINHA_DA_PLANILHA = { type: "Testeira", description: "A", quantity: 2, fileWidth: 3, fileHeight: 1, calculatedM2: 6, material: "Lona", finish: "Ilhós", measurement: "3.00 × 1.00", observations: "", suggestedSponsorIds: [], linha: 7 };
    const confirmar = async (body: any, quem: Record<string, unknown>) => {
      const req: any = { params: { id: "ev-1" }, body, ...quem };
      const res: any = { _status: 200 };
      res.status = (c: number) => { res._status = c; return res; };
      res.json = (b: any) => { res._body = b; return res; };
      await handleConfirmImport(req, res);
      return { status: res._status, body: res._body };
    };
    beforeEach(() => {
      H.storage.ensureDisplayIdSequence = vi.fn(async () => {});
      // O tipo da planilha é casado com o catálogo e o evento (shared/tipo-da-peca).
      H.storage.getAllStandardItems = vi.fn(async () => []);
      H.storage.getItemsByEvent = vi.fn(async () => []);
      H.db.transaction = vi.fn(async (fazer: any) => fazer({
        select: () => ({ from: () => ({ where: async () => [] }) }),
        insert: inserir,
        execute: async () => ({ rows: [{ next_id: 101 }] }),
      }));
    });

    it("o Kit só importa para uma remessa, e as peças saem com o autor logado", async () => {
      const sem = await confirmar({ items: [LINHA_DA_PLANILHA] }, { userRole: "solicitacao", userKit: true, userId: "u-kit" });
      expect(sem.status).toBe(400);
      expect(sem.body.error).toBe("Usuário do Kit importa só peças do Kit — escolha a remessa do Kit.");
      expect(H.db.transaction).not.toHaveBeenCalled();

      const ok = await confirmar({ items: [LINHA_DA_PLANILHA], kitRemessaId: "rem-kit" }, { userRole: "solicitacao", userKit: true, userId: "u-kit", userName: "Kaio" });
      expect(ok.status).toBe(201);
      expect(H.inseridos.find((o) => o.tabela === "items")!.valores[0]).toMatchObject({ kitRemessaId: "rem-kit", criadoPorId: "u-kit" });
    });

    it("o aviso que falha não desfaz a importação — vai para o log", async () => {
      H.storage.createNotification = vi.fn(async () => { throw new Error("fora do ar"); });
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const r = await confirmar({ items: [LINHA_DA_PLANILHA] }, { userRole: "solicitacao", userId: "u-arena", userName: "Ana" });
      expect(r.status).toBe(201);
      expect(log.mock.calls.some((c) => String(c[0]).includes("peças importadas, mas o aviso falhou"))).toBe(true);
      log.mockRestore();
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("eventos", () => {
  it("o Kit vê todos os eventos, mas as contagens são só das peças dele (lista e detalhe)", async () => {
    const lista = await chamar("GET /api/events", { sessao: KIT });
    const ev1 = (lista.body as any[]).find((e) => e.id === "ev-1");
    expect((lista.body as any[]).map((e) => e.id).sort()).toEqual(Object.keys(mundo.eventos).sort());
    expect(ev1.itemCount).toBe(1);
    const detalhe = await chamar("GET /api/events/:id", { sessao: KIT, params: { id: "ev-1" } });
    expect((detalhe.body as any).itemCount).toBe(1);
    const daArena = await chamar("GET /api/events/:id", { sessao: ARENA, params: { id: "ev-1" } });
    expect((daArena.body as any).itemCount).toBe(3);
  });

  it("enviar para a vinculação separa as listas: Kit as dele, Arena as da Arena, admin tudo", async () => {
    const enviar = (quem: Record<string, unknown>) => chamar("POST /api/events/:id/items/submit", { sessao: quem, params: { id: "ev-1" } });
    await enviar(KIT);
    expect(Object.fromEntries(Object.values(mundo.itens).map((i: any) => [i.id, i.status]))).toEqual({ minha: "awaiting_linking", alheia: "draft", arena: "draft" });
    await enviar(ARENA);
    expect(mundo.itens.arena.status).toBe("awaiting_linking");
    expect(mundo.itens.alheia.status).toBe("draft");
    await enviar(sessao("admin"));
    expect(mundo.itens.alheia.status).toBe("awaiting_linking");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("as outras leituras ficam no recorte dele", () => {
  it("Gestão de Prazos: só as peças do Kit dele entram na conta", async () => {
    const total = async (quem: Record<string, unknown>) =>
      ((await chamar("GET /api/prazos", { sessao: quem })).body as any).events.reduce((s: number, e: any) => s + e.totalItems, 0);
    expect(await total(KIT)).toBe(1);
    expect(await total(ARENA)).toBe(3);
  });

  it("busca global: só as peças do Kit dele", async () => {
    const r = await chamar("GET /api/busca", { sessao: KIT, query: { q: "#K" } });
    expect((r.body as any).pecas.map((p: any) => p.id)).toEqual(["minha"]);
    const daArena = await chamar("GET /api/busca", { sessao: ARENA, query: { q: "#K" } });
    expect((daArena.body as any).pecas).toHaveLength(3);
  });

  it("trilha: o que ele fez e o histórico das peças dele", async () => {
    const r = await chamar("GET /api/audit-logs", { sessao: KIT });
    expect((r.body as any[]).map((l) => l.id)).toEqual(["l1", "l3"]);
  });

  it("sino: aviso individual dele ou sobre peça do Kit dele", async () => {
    const r = await chamar("GET /api/notifications", { sessao: KIT });
    expect((r.body as any[]).map((n) => n.id).sort()).toEqual(["n1", "n3"]);
    const daArena = await chamar("GET /api/notifications", { sessao: ARENA });
    expect((daArena.body as any[]).map((n) => n.id).sort()).toEqual(["n1", "n2"]);
  });

  it("registros de fotos: só das peças dele", async () => {
    const r = await chamar("GET /api/photos", { sessao: KIT });
    expect((r.body as any[]).map((f) => f.id)).toEqual(["f1"]);
    expect(((await chamar("GET /api/photos", { sessao: ARENA })).body as any[])).toHaveLength(3);
  });

  it("a planilha exportada do evento: só as peças do Kit dele", async () => {
    const exportar = async (quem: Record<string, unknown>) => {
      H.linhasDaPlanilha.length = 0;
      const res: any = { setHeader: () => res, status: () => res, json: () => res, end: () => res };
      await handleExportItemsXlsx({ params: { id: "ev-1" }, ...quem } as any, res);
      // A última linha é a do TOTAL (vazia).
      return H.linhasDaPlanilha.map((l) => l.displayId).filter(Boolean).sort();
    };
    expect(await exportar({ userKit: true, userId: "u-kit" })).toEqual(["#K1"]);
    expect(await exportar({ userId: "u-arena" })).toEqual(["#0500", "#K1", "#K2"]);
  });
});
