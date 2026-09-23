// ─────────────────────────────────────────────────────────────────────────────
// TUBOS — as regras do volume RODANDO as rotas reais (server/routes/tubos.ts)
// sobre o banco de mentira de regras-producao-apoio.ts.
//
// Vieram de casos que só liam o fonte:
//   · tubos.test.ts — o modelo (schema), rotas registradas e seus papéis, a
//     numeração com corrida, a entrega numa transação, a hora da trilha, o
//     "adicionar fotos" (acumula, não entrega), a trava do Kit repetida no
//     tubo, o aviso de evento concluído, a coluna avulso;
//   · trava-da-peca.test.ts — embalar e entregar o volume barram peça travada;
//   · quem-ve-o-botao-de-conferir.test.ts — entregar é dos mesmos três papéis
//     de conferir (a entrega é do volume).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { montarRotas, bancoDeMentira, mundoVazio, type MundoDoBanco, type OpDoBanco } from "./regras-producao-apoio";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: {} as Record<string, any>,
  requireAuth: function requireAuth(_req: any, _res: any, next: any) { next(); },
  broadcast: [] as any[],
  trilha: [] as string[],
  updateEventStatus: (async () => {}) as (id: string) => Promise<void>,
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
    requireAuth: H.requireAuth,
    requireRole: () => (_req: any, _res: any, next: any) => next(),
    broadcast: (m: any) => { H.broadcast.push(m); },
    createAuditLog: async (_req: any, _acao: string, _tipo: string, _id: string, detalhe: string) => { H.trilha.push(detalhe); },
    createAuditLogsEmLote: async (_req: any, linhas: Array<{ details: string }>) => { for (const l of linhas) H.trilha.push(l.details); },
    updateEventStatus: (id: string) => H.updateEventStatus(id),
  };
});

import { tubos, items, publicInsertItemSchema } from "@shared/schema";
import { REGUA_DE_PAPEIS } from "@shared/permissoes";
import { fraseDaTrava } from "@shared/trava-da-peca";
import { registerTubosRoutes } from "../routes/tubos";

const { rotas, chamar } = montarRotas(registerTubosRoutes);
const RAIZ = path.resolve(__dirname, "../..");

let mundo: MundoDoBanco;
let ops: OpDoBanco[];
let proximos: number[];
let colisoes: unknown[];

const FOTO = "/objects/uploads/tubo.png";
const TRAVA = { travadaEm: new Date("2026-09-21T12:00:00Z"), travadaPor: "Ana Solicitação", travadaMotivo: "Arte vai mudar" };
const pecaEmbalada = (id: string, over: Record<string, unknown> = {}) => ({
  id, displayId: `#000${id}`, type: "2x1", description: "Logo", quantity: 2, quantityProduced: 2, status: "packed",
  conferredQty: 2, embaladaQty: 2, deliveredQty: 0, isReuse: false, reuseQty: 0, conferencePhotoUrl: "/objects/c.png",
  tuboId: "t1", eventId: "ev-1", deletedAt: null, kitRemessaId: null, criadoPorId: null,
  travadaEm: null, travadaPor: null, travadaMotivo: null, ...over,
});

function ligar() {
  for (const k of Object.keys(H.db)) delete H.db[k];
  const db = bancoDeMentira(mundo, {
    aoExecutar: (sql) => (/as proximo from tubos/.test(sql) ? { rows: [{ proximo: proximos.shift() ?? 99 }] } : { rows: [] }),
    aoInserir: (tabela) => { if (tabela === "tubos" && colisoes.length) throw colisoes.shift(); },
  });
  Object.assign(H.db, db);
  ops = db.ops;
}

beforeEach(() => {
  mundo = mundoVazio();
  mundo.eventos["ev-1"] = { id: "ev-1", name: "COPA NORTE", status: "created", arquivadoEm: null };
  mundo.itens.a = pecaEmbalada("a");
  mundo.itens.b = pecaEmbalada("b");
  mundo.itens.c = pecaEmbalada("c", { status: "conferred", embaladaQty: 0, tuboId: null });
  mundo.tubos.t1 = { id: "t1", eventId: "ev-1", numero: 1, avulso: false, entregueEm: null, fotosFechamento: ["/objects/uploads/a.png"], fechadoEm: new Date("2026-09-20T10:00:00Z"), fechadoPor: "Ana", conteudoAlteradoEm: new Date("2026-09-20T11:00:00Z") };
  mundo.linhas.l1 = { id: "l1", tuboId: "t1", itemId: "a", quantidade: 2, entregueEm: null };
  mundo.linhas.l2 = { id: "l2", tuboId: "t1", itemId: "b", quantidade: 2, entregueEm: null };
  proximos = []; colisoes = [];
  H.broadcast.length = 0; H.trilha.length = 0;
  H.updateEventStatus = async () => {};
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getEvent = vi.fn(async (id: string) => (mundo.eventos[id] ? { ...mundo.eventos[id] } : undefined));
  s.createNotification = vi.fn(async (n: any) => ({ id: "n1", ...n }));
  ligar();
});
afterEach(() => { vi.useRealTimers(); });

const escritas = () => ops.filter((o) => o.tipo === "update" || o.tipo === "insert" || o.tipo === "delete");

// ═════════════════════════════════════════════════════════════════════════════
describe("o modelo (schema)", () => {
  const cfg = getTableConfig(tubos);
  const coluna = (nome: string) => cfg.columns.find((c) => c.name === nome);

  it("tubo numerado por evento, sem número repetido no mesmo evento (índice único)", () => {
    expect(coluna("numero")?.notNull).toBe(true);
    const uq = cfg.indexes.find((i) => i.config.name === "UQ_tubos_evento_numero");
    expect(uq?.config.unique).toBe(true);
    expect(uq?.config.columns.map((c: any) => c.name)).toEqual(["event_id", "numero"]);
  });

  it("a peça aponta para UM tubo (atalho), que some sem apagar a peça (ON DELETE SET NULL)", () => {
    const fk = getTableConfig(items).foreignKeys.find((f) => f.reference().foreignTable === tubos);
    expect(fk?.reference().columns.map((c) => c.name)).toEqual(["tubo_id"]);
    expect(fk?.onDelete).toBe("set null");
  });

  it("a entrega do tubo guarda foto, recebedor, quando e quem registrou", () => {
    for (const c of ["entregue_em", "recebido_por", "foto_entrega_url", "entregue_por"]) expect(coluna(c), c).toBeTruthy();
  });

  it("tubos.avulso: booleano obrigatório com padrão false, e a migração aditiva cria a coluna", () => {
    expect(coluna("avulso")).toMatchObject({ notNull: true, hasDefault: true, default: false });
    // Varredura (o SQL não roda aqui): algum .sql de scripts/ acrescenta a coluna sem apagar nada.
    const sqls = readdirSync(path.join(RAIZ, "scripts")).filter((f) => f.endsWith(".sql")).map((f) => readFileSync(path.join(RAIZ, "scripts", f), "utf8"));
    expect(sqls.some((s) => /ALTER TABLE tubos ADD COLUMN IF NOT EXISTS avulso boolean NOT NULL DEFAULT false/i.test(s))).toBe(true);
  });

  it("a peça não nasce com impressora nem tubo: a API pública descarta os dois", () => {
    const base = { eventId: "ev-1", type: "Pórtico", quantity: 1, area: "1", visual: "1", material: "Lona", finish: "Refile", measurement: "1 × 1", calculatedM2: "1" };
    const out: any = publicInsertItemSchema.parse({ ...base, printMachine: "1", tuboId: "t1" });
    expect(out.printMachine).toBeUndefined();
    expect(out.tuboId).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("as rotas e os papéis", () => {
  const ROTAS = [
    "GET /api/events/:eventId/tubos", "GET /api/tubos", "GET /api/tubos/:id", "POST /api/events/:eventId/tubos",
    "PATCH /api/tubos/:id/itens", "DELETE /api/tubos/:id", "POST /api/tubos/:id/fechar", "POST /api/tubos/:id/entregar",
    "POST /api/tubos/entregar-em-lote",
  ];

  it("existem, pedem sessão primeiro, e o servidor as registra", () => {
    for (const r of ROTAS) expect(rotas.get(r)?.[0], r).toBe(H.requireAuth);
    // Varredura (montar o servidor inteiro não cabe aqui): routes.ts chama o registro.
    expect(readFileSync(path.join(RAIZ, "server/routes.ts"), "utf8")).toMatch(/^\s*registerTubosRoutes\(app\);/m);
  });

  it("são dos mesmos papéis de conferir e entregar: arte e atendimento levam 403 em todas", async () => {
    for (const papel of ["arte", "atendimento", undefined]) {
      for (const r of ROTAS) {
        const res = await chamar(r, { params: { id: "t1", eventId: "ev-1" }, body: { receivedBy: "João", tuboIds: ["t1"] }, userRole: papel });
        expect(res.status, `${papel} ${r}`).toBe(403);
      }
    }
    expect(escritas()).toEqual([]);
  });

  it("gráfica, solicitação e admin passam do gate (e a régua de permissões diz o mesmo)", async () => {
    for (const papel of ["grafica", "solicitacao", "admin"]) {
      // Sem "quem recebeu" o erro é de conteúdo (400), não de papel.
      expect((await chamar("POST /api/tubos/:id/entregar", { params: { id: "t1" }, body: {}, userRole: papel })).status, papel).toBe(400);
    }
    const escrita = REGUA_DE_PAPEIS.filter((r) => /\/tubos/.test(r.rota)); // a régua só lista rotas de escrita
    expect(escrita.map((r) => `${r.metodo} ${r.rota}`).sort()).toEqual([
      "DELETE /api/tubos/:id", "PATCH /api/tubos/:id/itens", "POST /api/events/:eventId/tubos",
      "POST /api/tubos/:id/entregar", "POST /api/tubos/:id/fechar", "POST /api/tubos/entregar-em-lote",
    ]);
    for (const r of escrita) expect(r.papeis.slice().sort(), r.rota).toEqual(["admin", "grafica", "solicitacao"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("numerar o tubo", () => {
  const criar = () => chamar("POST /api/events/:eventId/tubos", { params: { eventId: "ev-1" }, body: {}, userRole: "grafica" });

  it("usa o próximo número do evento", async () => {
    proximos = [2];
    const r = await criar();
    expect(r.status).toBe(201);
    expect(ops.find((o) => o.tipo === "execute")?.sql).toBe("select greatest(coalesce(max(numero), 0), 0) + 1 as proximo from tubos where event_id = ");
    expect(r.body).toMatchObject({ eventId: "ev-1", numero: 2, avulso: false, criadoPor: "Maria" });
    expect(H.trilha).toEqual(["Tubo 2 criado (COPA NORTE)"]);
  });

  it("dois tubos no mesmo segundo: quem bate no índice único (23505) tenta de novo com o número seguinte", async () => {
    proximos = [2, 3];
    colisoes = [Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" })];
    const r = await criar();
    expect(r.status).toBe(201);
    expect(r.body.numero).toBe(3);
    expect(ops.filter((o) => o.tipo === "execute").length).toBe(2);
  });

  it("tubo de verdade pede o maior número + 1; o avulso (embalada sozinha) pede o menor − 1 e não gasta número", async () => {
    proximos = [2];
    await criar();
    // Nenhum volume no evento (o banco de mentira não avalia o JOIN da busca do avulso aberto).
    for (const k of Object.keys(mundo.tubos)) delete mundo.tubos[k];
    for (const k of Object.keys(mundo.linhas)) delete mundo.linhas[k];
    ligar();
    proximos = [-1];
    const r = await chamar("POST /api/events/:eventId/tubos", { params: { eventId: "ev-1" }, body: { avulso: true, itens: [{ id: "c" }], fotos: [FOTO] }, userRole: "grafica" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ numero: -1, avulso: true });
    // As duas consultas (o valor que devolvem é semântica do Postgres — ver o relatório).
    expect(ops.filter((o) => o.tipo === "execute").map((o) => o.sql)).toEqual([
      "select least(coalesce(min(numero), 0), 0) - 1 as proximo from tubos where event_id = ",
    ]);
  });

  it("outro erro não é corrida: não repete e responde 500; três colisões seguidas também desistem", async () => {
    colisoes = [Object.assign(new Error("boom"), { code: "XX000" })];
    proximos = [2];
    expect((await criar()).status).toBe(500);
    expect(ops.filter((o) => o.tipo === "execute").length).toBe(1);
    ligar();
    const dup = () => Object.assign(new Error("dup"), { code: "23505" });
    colisoes = [dup(), dup(), dup()];
    proximos = [2, 3, 4];
    expect((await criar()).status).toBe(500);
    expect(Object.keys(mundo.tubos)).toEqual(["t1"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("entregar o volume inteiro", () => {
  const entregar = (body: Record<string, unknown> = { receivedBy: "João" }, userRole = "grafica") =>
    chamar("POST /api/tubos/:id/entregar", { params: { id: "t1" }, body, userRole });

  it("todas as peças numa transação só — toda escrita da entrega acontece dentro dela", async () => {
    const r = await entregar();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, numero: 1, entregues: 2, unidades: 4 });
    expect(ops.filter((o) => o.tipo === "tx")).toHaveLength(1);
    const e = escritas();
    expect(e.length).toBeGreaterThan(0);
    expect(e.every((o) => o.emTx)).toBe(true);
    expect(mundo.tubos.t1).toMatchObject({ recebidoPor: "João", entreguePor: "Maria", fotoEntregaUrl: null });
    expect(mundo.tubos.t1.entregueEm).toBeInstanceOf(Date);
    expect([mundo.itens.a.status, mundo.itens.b.status]).toEqual(["delivered", "delivered"]);
    expect(Object.values(mundo.linhas).every((l: any) => l.entregueEm instanceof Date)).toBe(true);
  });

  it("uma falha no meio desfaz tudo (ou todas, ou nenhuma)", async () => {
    let n = 0;
    const db = bancoDeMentira(mundo, { aoInserir: (tabela) => { if (tabela === "audit_logs" && ++n === 2) throw new Error("caiu a conexão"); } });
    for (const k of Object.keys(H.db)) delete H.db[k];
    Object.assign(H.db, db);
    const r = await entregar();
    expect(r.status).toBe(500);
    expect(mundo.tubos.t1.entregueEm).toBeNull();
    expect([mundo.itens.a.status, mundo.itens.b.status]).toEqual(["packed", "packed"]);
    // O que foi gravado antes da falha estava dentro da transação (o banco desfaz).
    expect(db.ops.filter((o: OpDoBanco) => o.tipo === "update").every((o: OpDoBanco) => o.emTx)).toBe(true);
  });

  it("só 'quem recebeu' é obrigatório; a foto do comprovante é opcional, mas tem de ser do nosso storage", async () => {
    expect((await entregar({ receivedBy: "  " })).body.error).toBe("Informe quem recebeu — é o que registra a entrega");
    const fora = await entregar({ receivedBy: "João", photoUrl: "https://example.com/x.png" });
    expect(fora.status).toBe(400);
    expect(fora.body.error).toBe("A foto precisa ser enviada pelo app (endereço /objects/…)");
    expect(escritas()).toEqual([]);
  });

  it("a hora da trilha é no fuso do galpão (dia/mês hora:minuto)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 21, 17, 32)));
    await entregar();
    const doTubo = (mundo.inseridos.audit_logs ?? []).find((l) => l.entityType === "tubo");
    expect(doTubo.details).toBe("Tubo 1 entregue a João em 21/09 14:32 — #000a (2), #000b (2)");
  });

  it("peça travada no volume segura a entrega inteira — com a frase da trava", async () => {
    mundo.itens.a = { ...mundo.itens.a, ...TRAVA };
    const r = await entregar();
    expect(r.status).toBe(409);
    expect(r.body.error).toBe(`#000a no Tubo 1: ${fraseDaTrava(TRAVA)}`);
    expect(mundo.tubos.t1.entregueEm).toBeNull();
  });

  it("evento que conclui com a entrega: a Solicitação é avisada; evento já concluído não repete o aviso", async () => {
    H.updateEventStatus = async (id) => { mundo.eventos[id].status = "completed"; };
    await entregar();
    expect(H.storage.createNotification).toHaveBeenCalledTimes(1);
    expect(H.storage.createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: "eventCompleted", eventId: "ev-1", targetRoles: ["solicitacao"] }));
    expect(H.broadcast.filter((m) => m.type === "notification_created")).toHaveLength(1);

    // Já estava concluído antes: nenhum aviso novo.
    mundo.tubos.t2 = { id: "t2", eventId: "ev-1", numero: 2, avulso: false, entregueEm: null, fotosFechamento: [], fechadoEm: null };
    mundo.itens.d = pecaEmbalada("d", { tuboId: "t2" });
    mundo.linhas.l3 = { id: "l3", tuboId: "t2", itemId: "d", quantidade: 2, entregueEm: null };
    await chamar("POST /api/tubos/:id/entregar", { params: { id: "t2" }, body: { receivedBy: "João" }, userRole: "grafica" });
    expect(H.storage.createNotification).toHaveBeenCalledTimes(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("adicionar fotos ao tubo (era 'fechar') — não é entrega", () => {
  const fechar = (body: Record<string, unknown>) => chamar("POST /api/tubos/:id/fechar", { params: { id: "t1" }, body, userRole: "grafica" });

  it("no mínimo uma foto, no máximo 20 por vez, e só do nosso storage (a régua dos thumbs)", async () => {
    expect((await fechar({})).body.error).toBe("Tire pelo menos uma foto do tubo");
    const muitas = Array.from({ length: 21 }, (_v, i) => `/objects/uploads/${i}.png`);
    expect((await fechar({ fotos: muitas })).body.error).toBe("No máximo 20 fotos por vez");
    const fora = await fechar({ fotos: ["https://example.com/x.png"] });
    expect(fora).toEqual({ status: 400, body: { error: "As fotos precisam ser enviadas pelo app (endereço /objects/…)" } });
    expect(escritas()).toEqual([]);
  });

  it("ACUMULA sem duplicar, grava quando e quem, zera o 'alterado depois da foto' — e não mexe na entrega", async () => {
    const r = await fechar({ fotos: ["/objects/uploads/a.png", "/objects/uploads/b.png"] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, fotos: 2, totalDeFotos: 2 });
    expect(mundo.tubos.t1.fotosFechamento).toEqual(["/objects/uploads/a.png", "/objects/uploads/b.png"]);
    expect(mundo.tubos.t1).toMatchObject({ fechadoPor: "Maria", conteudoAlteradoEm: null, entregueEm: null });
    // As peças do tubo são carimbadas (o delta ?since= traz a hora da foto) — só isso.
    const nasPecas = escritas().filter((o) => o.tabela === "items");
    expect(nasPecas).toHaveLength(1);
    expect(Object.keys(nasPecas[0].valores)).toEqual(["updatedAt"]);
    expect(nasPecas[0].ids?.sort()).toEqual(["a", "b"]);
    expect([mundo.itens.a.status, mundo.itens.b.status]).toEqual(["packed", "packed"]);
    expect(escritas().some((o) => o.valores && ("entregueEm" in o.valores || "deliveredQty" in o.valores))).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("a trava do Kit e a da Solicitação alcançam o tubo", () => {
  const RECADO = "Peça do Kit: a Solicitação da Arena só visualiza. Quem age nela é o usuário do Kit.";
  beforeEach(() => {
    mundo.itens.k = pecaEmbalada("k", { status: "conferred", embaladaQty: 0, tuboId: null, kitRemessaId: "rem-1", criadoPorId: "u-kit" });
  });

  it("a Solicitação sem Kit não embala nem tira peça do Kit pelo tubo (a trava global não vê `adicionar`)", async () => {
    const pedir = (body: Record<string, unknown>) => chamar("PATCH /api/tubos/:id/itens", { params: { id: "t1" }, body, userRole: "solicitacao" });
    expect(await pedir({ adicionar: ["k"], fotos: [FOTO] })).toEqual({ status: 403, body: { error: RECADO } });
    mundo.itens.a = { ...mundo.itens.a, kitRemessaId: "rem-1" };
    expect(await pedir({ remover: ["a"] })).toEqual({ status: 403, body: { error: RECADO } });
    expect(escritas()).toEqual([]);
  });

  it("nem entrega o volume que tem peça do Kit", async () => {
    mundo.itens.a = { ...mundo.itens.a, kitRemessaId: "rem-1" };
    const r = await chamar("POST /api/tubos/:id/entregar", { params: { id: "t1" }, body: { receivedBy: "João" }, userRole: "solicitacao" });
    expect(r).toEqual({ status: 403, body: { error: RECADO } });
    expect(mundo.tubos.t1.entregueEm).toBeNull();
  });

  it("peça travada pela Solicitação não é embalada — a recusa diz qual e por quê", async () => {
    mundo.itens.c = { ...mundo.itens.c, ...TRAVA };
    const r = await chamar("POST /api/events/:eventId/tubos", { params: { eventId: "ev-1" }, body: { itens: [{ id: "c" }], fotos: [FOTO] }, userRole: "grafica" });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe(`Não dá para embalar — #000c: ${fraseDaTrava(TRAVA)}`);
    expect(Object.keys(mundo.tubos)).toEqual(["t1"]);
  });
});
