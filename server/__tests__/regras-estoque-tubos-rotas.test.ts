// ─────────────────────────────────────────────────────────────────────────────
// TUBOS E EMBALAGEM — as ROTAS REAIS de server/routes/tubos.ts executadas sobre
// o banco de mentira que avalia o WHERE (regras-estoque-banco-de-mentira.ts).
//
// Vieram de casos que só liam o texto de tubos.ts e tubosDaPeca.ts em:
//   · embalagem-revisao-adversarial.test.ts (travas, transação, escrita
//     relativa, recusa sem tubo vazio, atalho na entrega, fechadoEm);
//   · embalagem-com-quantidade.test.ts (pedidos com quantidade, soma na linha,
//     foto obrigatória, tirar por linha, entrega por quantidade, contratos
//     `quantidadeNoTubo` / `linhas` / `tuboVolumes`, "sem tubo");
//   · embalagem-revisao-22-09.test.ts (campos da trava, excluída no volume,
//     avulso reusado, depois do commit, janela de 60 dias, registros, trava da
//     união, carimbo do avulso que vira tubo, `tuboVolumesEntregues`).
// O que só um Postgres prova (FOR UPDATE disputado, índice único) fica nos
// testes integracao-*.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { criarBanco, type Banco, type Operacao } from "./regras-estoque-banco-de-mentira";

const H = vi.hoisted(() => ({
  banco: null as any,
  storage: {} as Record<string, any>,
  auditoria: [] as any[][],
  trilhaEmLote: [] as any[],
  broadcasts: [] as any[],
  falharTrilha: false,
}));

vi.mock("../db", () => ({ db: new Proxy({}, { get: (_t, k) => H.banco.db[k] }), pool: {} }));
vi.mock("../storage", () => ({ storage: new Proxy({}, { get: (_t, k) => H.storage[k as string] }) }));
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real,
    requireAuth: (_q: any, _s: any, n: any) => n(),
    broadcast: (m: any) => { H.broadcasts.push(m); },
    createAuditLog: async (...a: any[]) => { H.auditoria.push(a); },
    createAuditLogsEmLote: async (_req: any, linhas: any[]) => {
      if (H.falharTrilha) throw new Error("trilha fora do ar");
      H.trilhaEmLote.push(...linhas);
    },
    updateEventStatus: async () => {},
  };
});

import { registerTubosRoutes, excluirPecaTirandoDosVolumes } from "../routes/tubos";
import { resumosDeTuboPorIds, comTubo } from "../services/tubosDaPeca";

type Handler = (req: any, res: any, next: any) => unknown;
const rotas = new Map<string, Handler[]>();
const app: any = {};
for (const v of ["get", "post", "patch", "put", "delete"]) app[v] = (c: string, ...hs: Handler[]) => { rotas.set(`${v.toUpperCase()} ${c}`, hs); return app; };
registerTubosRoutes(app);

type Quem = { papel?: string; kit?: boolean; userId?: string };
async function chamar(chave: string, ctx: { params?: any; body?: any; query?: any } & Quem = {}) {
  const hs = rotas.get(chave);
  if (!hs) throw new Error(`Rota não registrada: ${chave}`);
  const req: any = {
    params: ctx.params ?? {}, body: ctx.body ?? {}, query: ctx.query ?? {},
    userRole: ctx.papel ?? "grafica", userKit: ctx.kit === true, userId: ctx.userId ?? "u-graf", userName: "Gil",
  };
  const res: any = { _status: 200, _body: undefined, _done: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; res._done = true; return res; };
  for (const h of hs) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (res._done || !seguiu) break;
  }
  return { status: res._status as number, body: res._body };
}

// ─── o mundo ────────────────────────────────────────────────────────────────
const FOTO = "/objects/uploads/tubo.jpg";
const peca = (id: string, over: Record<string, unknown> = {}) => ({
  id, displayId: `#${id}`, eventId: "ev-1", type: "2x1", description: "Nubank", quantity: 10, quantityProduced: 10,
  status: "conferred", conferredQty: 10, embaladaQty: 0, deliveredQty: 0, isReuse: false, reuseQty: 0,
  conferencePhotoUrl: "/objects/uploads/conf.jpg", tuboId: null, deletedAt: null, kitRemessaId: null, criadoPorId: null,
  travadaEm: null, travadaPor: null, travadaMotivo: null, bookUrl: null, updatedAt: null, statusChangedAt: null, ...over,
});
const tubo = (id: string, over: Record<string, unknown> = {}) => ({
  id, eventId: "ev-1", numero: 1, avulso: false, criadoPor: "Gil", fotosFechamento: [], fechadoEm: null, fechadoPor: null,
  conteudoAlteradoEm: null, entregueEm: null, recebidoPor: null, entreguePor: null, fotoEntregaUrl: null, entregueObs: null,
  createdAt: new Date("2026-09-20T12:00:00Z"), ...over,
});
const linha = (id: string, tuboId: string, itemId: string, quantidade: number, over: Record<string, unknown> = {}) => ({
  id, tuboId, itemId, quantidade, entregueEm: null, embaladoEm: new Date("2026-09-20T12:00:00Z"), embaladoPor: "Gil", ...over,
});
const EVENTO = { id: "ev-1", name: "COPA NORTE", arquivadoEm: null, status: "created", truckDepartureDate: new Date("2099-01-01T00:00:00Z") };

let b: Banco;
function montar(t: { items?: any[]; tubos?: any[]; tubo_itens?: any[]; events?: any[] }) {
  b = criarBanco({ events: [EVENTO], items: [], tubos: [], tubo_itens: [], audit_logs: [], ...t }, {
    // proximoNumero: o maior número do evento + 1 (tubo) ou o menor − 1 (avulso)
    executar: (q) => {
      const doEvento = (b.mundo.tubos ?? []).filter((x) => x.eventId === q.params[0]).map((x) => x.numero as number);
      if (q.sql.includes("max(numero)")) return [{ proximo: Math.max(0, ...doEvento) + 1 }];
      if (q.sql.includes("min(numero)")) return [{ proximo: Math.min(0, ...doEvento) - 1 }];
      return [];
    },
  });
  H.banco = b;
}
const item = (id: string) => b.linha("items", id)!;
const linhasDe = (itemId: string) => b.mundo.tubo_itens.filter((l) => l.itemId === itemId);
/** Antes de a transação começar, alguém mexe no banco (a corrida simulada). */
const noMeioDoCaminho = (mexer: () => void) => {
  const original = b.db.transaction;
  b.db.transaction = async (fn: any) => { mexer(); return original(fn); };
};
const daTransacao = (ops: Operacao[]) => ops.filter((o) => o.tx !== null);

beforeEach(() => {
  H.auditoria = []; H.trilhaEmLote = []; H.broadcasts = []; H.falharTrilha = false;
  for (const k of Object.keys(H.storage)) delete H.storage[k];
  H.storage.getEvent = vi.fn(async () => ({ ...EVENTO }));
  H.storage.createNotification = vi.fn(async (n: any) => ({ id: "n1", ...n }));
});
afterEach(() => { vi.restoreAllMocks(); });

// ═════════════════════════════════════════════════════════════════════════════
describe("embalar: o pedido, a soma e o atalho", () => {
  it("aceita `itens` com quantidade OU a lista de ids (= tudo o que dá); lista malformada é 400", async () => {
    montar({ items: [peca("p1"), peca("p2")] });
    const r = await chamar("POST /api/events/:eventId/tubos", { params: { eventId: "ev-1" }, body: { itens: [{ id: "p1", quantidade: 7 }], fotos: [FOTO] } });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const t1 = r.body.id;
    expect(linhasDe("p1")).toEqual([expect.objectContaining({ tuboId: t1, quantidade: 7 })]);
    expect(item("p1")).toMatchObject({ embaladaQty: 7, status: "conferred", tuboId: t1 });

    const p = await chamar("PATCH /api/tubos/:id/itens", { params: { id: t1 }, body: { adicionar: ["p2"], fotos: [FOTO] } });
    expect(p.status, JSON.stringify(p.body)).toBe(200);
    expect(linhasDe("p2")).toEqual([expect.objectContaining({ tuboId: t1, quantidade: 10 })]);
    expect(item("p2")).toMatchObject({ embaladaQty: 10, status: "packed" });

    for (const itens of [[{ id: 3 }], [{ id: "p1", quantidade: "abc" }]]) {
      const x = await chamar("POST /api/events/:eventId/tubos", { params: { eventId: "ev-1" }, body: { itens, fotos: [FOTO] } });
      expect(x.status, JSON.stringify(itens)).toBe(400);
    }
    const q = await chamar("PATCH /api/tubos/:id/itens", { params: { id: t1 }, body: { adicionar: "p1" } });
    expect(q.status).toBe(400);
  });

  it("soma NA LINHA com SET relativo (nunca um total lido antes), soma em embalada_qty e vira packed só com tudo", async () => {
    montar({
      items: [peca("p1", { embaladaQty: 7, tuboId: "t1" })],
      tubos: [tubo("t1")],
      tubo_itens: [linha("l1", "t1", "p1", 7)],
    });
    const r = await chamar("PATCH /api/tubos/:id/itens", { params: { id: "t1" }, body: { itens: [{ id: "p1", quantidade: 3 }], fotos: [FOTO] } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(linhasDe("p1")).toEqual([expect.objectContaining({ id: "l1", quantidade: 10 })]);
    const soma = b.ops.find((o) => o.tipo === "update" && o.tabela === "tubo_itens")!;
    // o SET é uma expressão sobre a própria coluna: quem embalou no meio não é sobrescrito
    expect(soma.valores.quantidade).not.toBeTypeOf("number");
    expect(item("p1")).toMatchObject({ embaladaQty: 10, status: "packed", tuboId: "t1" });
    expect(item("p1").statusChangedAt).toBeInstanceOf(Date);
    expect(H.trilhaEmLote).toEqual([expect.objectContaining({ entityId: "p1", details: expect.stringContaining("Embalada no Tubo 1 — 3 de 10 un.") })]);
  });

  it("embalar SEMPRE pede a foto — no tubo novo a recusa vem antes de criar; tirar do tubo não pede", async () => {
    montar({ items: [peca("p1"), peca("p2", { embaladaQty: 10, status: "packed", tuboId: "t1" })], tubos: [tubo("t1")], tubo_itens: [linha("l2", "t1", "p2", 10)] });
    const semFoto = await chamar("POST /api/events/:eventId/tubos", { params: { eventId: "ev-1" }, body: { itemIds: ["p1"] } });
    expect(semFoto).toEqual({ status: 400, body: { error: "Tire a foto para embalar" } });
    expect(b.mundo.tubos.map((t) => t.id)).toEqual(["t1"]); // nenhum tubo vazio nasceu
    const patchSemFoto = await chamar("PATCH /api/tubos/:id/itens", { params: { id: "t1" }, body: { adicionar: ["p1"] } });
    expect(patchSemFoto).toEqual({ status: 400, body: { error: "Tire a foto para embalar" } });
    expect(b.gravacoes()).toEqual([]);
    const tirar = await chamar("PATCH /api/tubos/:id/itens", { params: { id: "t1" }, body: { remover: ["p2"] } });
    expect(tirar.status).toBe(200);
    expect(linhasDe("p2")).toEqual([]);
  });

  it("a recusa de DENTRO da transação vira a resposta HTTP e não deixa o tubo recém-criado vazio", async () => {
    montar({ items: [peca("p1")] });
    // alguém cancela a peça entre a prévia e a transação
    noMeioDoCaminho(() => { item("p1").status = "canceled"; });
    const r = await chamar("POST /api/events/:eventId/tubos", { params: { eventId: "ev-1" }, body: { itemIds: ["p1"], fotos: [FOTO] } });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("Não dá para embalar — #p1: está cancelada");
    expect(b.mundo.tubos).toEqual([]);
    expect(b.mundo.tubo_itens).toEqual([]);
    expect(item("p1").embaladaQty).toBe(0);
  });

  it("a segunda embalagem SOZINHA da mesma peça vai para o avulso ABERTO — e a recusa não apaga o reusado", async () => {
    montar({
      items: [peca("p1", { embaladaQty: 7, tuboId: "a1" })],
      tubos: [tubo("a1", { numero: -1, avulso: true })],
      tubo_itens: [linha("l1", "a1", "p1", 7)],
    });
    const r = await chamar("POST /api/events/:eventId/tubos", { params: { eventId: "ev-1" }, body: { avulso: true, itens: [{ id: "p1", quantidade: 3 }], fotos: [FOTO] } });
    expect(r.status, JSON.stringify(r.body)).toBe(200); // 200 = reusou; 201 seria um volume novo
    expect(b.mundo.tubos.map((t) => t.id)).toEqual(["a1"]);
    expect(linhasDe("p1")).toEqual([expect.objectContaining({ id: "l1", quantidade: 10 })]);

    montar({
      items: [peca("p1", { embaladaQty: 7, tuboId: "a1" })],
      tubos: [tubo("a1", { numero: -1, avulso: true })],
      tubo_itens: [linha("l1", "a1", "p1", 7)],
    });
    noMeioDoCaminho(() => { item("p1").status = "canceled"; });
    const recusa = await chamar("POST /api/events/:eventId/tubos", { params: { eventId: "ev-1" }, body: { avulso: true, itemIds: ["p1"], fotos: [FOTO] } });
    expect(recusa.status).toBe(409);
    expect(b.mundo.tubos.map((t) => t.id)).toEqual(["a1"]);
  });

  it("o avulso que recebe OUTRA peça vira Tubo N — e a peça que já estava nele é carimbada (delta ?since=)", async () => {
    montar({
      items: [peca("p1", { embaladaQty: 10, status: "packed", tuboId: "a1" }), peca("p2")],
      tubos: [tubo("t1", { numero: 1 }), tubo("a1", { numero: -1, avulso: true })],
      tubo_itens: [linha("l1", "a1", "p1", 10)],
    });
    const r = await chamar("PATCH /api/tubos/:id/itens", { params: { id: "a1" }, body: { adicionar: ["p2"], fotos: [FOTO] } });
    expect(r).toEqual({ status: 200, body: { ok: true, numero: 2, avulso: false } });
    expect(b.linha("tubos", "a1")).toMatchObject({ avulso: false, numero: 2 });
    expect(item("p1").updatedAt).toBeInstanceOf(Date);
    expect(H.auditoria.some((a) => a[1] === "updated" && a[2] === "tubo" && a[4] === "Embalagem avulsa virou o Tubo 2")).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("concorrência: o volume e as peças TRAVADOS, as contas refeitas lá dentro", () => {
  it("o PATCH trava o volume e, logo depois, a UNIÃO das peças (embalar + tirar) de uma vez, por id", async () => {
    montar({
      items: [peca("p1", { embaladaQty: 10, status: "packed", tuboId: "t1" }), peca("p2")],
      tubos: [tubo("t1")],
      tubo_itens: [linha("l1", "t1", "p1", 10)],
    });
    const r = await chamar("PATCH /api/tubos/:id/itens", { params: { id: "t1" }, body: { adicionar: ["p2"], remover: ["p1"], fotos: [FOTO] } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const tx = daTransacao(b.ops);
    expect(tx[0]).toMatchObject({ tipo: "select", tabela: "tubos", travou: true });
    const travasDePeca = tx.filter((o) => o.tipo === "select" && o.tabela === "items" && o.travou);
    // a primeira trava de peça já pega as duas (embalar e tirar), antes de qualquer escrita
    expect(new Set(travasDePeca[0].where!.params)).toEqual(new Set(["p1", "p2"]));
    expect(tx.indexOf(travasDePeca[0])).toBeLessThan(tx.findIndex((o) => o.tipo !== "select"));
    // toda trava de peça é na ordem do id (duas transações cruzadas não se travam)
    for (const t of travasDePeca) expect(t.orderBy).toEqual(['"items"."id" asc']);
  });

  it("criar, mexer, apagar, fotografar e entregar: cada um numa transação que trava o volume, e toda escrita lá dentro", async () => {
    const cenario = () => montar({
      items: [peca("p1", { embaladaQty: 10, status: "packed", tuboId: "t1" }), peca("p2")],
      tubos: [tubo("t1")],
      tubo_itens: [linha("l1", "t1", "p1", 10)],
    });
    const chamadas: Array<[string, any]> = [
      ["POST /api/events/:eventId/tubos", { params: { eventId: "ev-1" }, body: { itemIds: ["p2"], fotos: [FOTO] } }],
      ["PATCH /api/tubos/:id/itens", { params: { id: "t1" }, body: { adicionar: ["p2"], fotos: [FOTO] } }],
      ["DELETE /api/tubos/:id", { params: { id: "t1" } }],
      ["POST /api/tubos/:id/fechar", { params: { id: "t1" }, body: { fotos: [FOTO] } }],
      ["POST /api/tubos/:id/entregar", { params: { id: "t1" }, body: { receivedBy: "Zé" } }],
    ];
    for (const [rota, ctx] of chamadas) {
      cenario();
      const r = await chamar(rota, ctx);
      expect(r.status, `${rota} ${JSON.stringify(r.body)}`).toBeLessThan(300);
      expect(b.ops.some((o) => o.tipo === "select" && o.tabela === "tubos" && o.travou && o.tx !== null), rota).toBe(true);
      // o único INSERT fora da transação é o do tubo novo (numerado antes)
      const fora = b.gravacoes().filter((o) => o.tx === null && !(o.tipo === "insert" && o.tabela === "tubos"));
      expect(fora, rota).toEqual([]);
    }
  });

  it("o volume ENTREGUE no meio do caminho é recusado lá dentro, e nada é gravado", async () => {
    montar({ items: [peca("p2")], tubos: [tubo("t1")] });
    noMeioDoCaminho(() => { b.linha("tubos", "t1")!.entregueEm = new Date(); });
    const r = await chamar("PATCH /api/tubos/:id/itens", { params: { id: "t1" }, body: { adicionar: ["p2"], fotos: [FOTO] } });
    expect(r).toEqual({ status: 409, body: { error: "O Tubo 1 já foi entregue — não dá para mexer no que tem dentro" } });
    expect(b.gravacoes()).toEqual([]);
    expect(item("p2").embaladaQty).toBe(0);
  });

  it("toda recusa de dentro da transação vira a resposta HTTP (criar, mexer, apagar, fotografar, entregar)", async () => {
    for (const [rota, ctx] of [
      ["PATCH /api/tubos/:id/itens", { params: { id: "t1" }, body: { remover: ["p1"] } }],
      ["DELETE /api/tubos/:id", { params: { id: "t1" } }],
      ["POST /api/tubos/:id/fechar", { params: { id: "t1" }, body: { fotos: [FOTO] } }],
      ["POST /api/tubos/:id/entregar", { params: { id: "t1" }, body: { receivedBy: "Zé" } }],
    ] as Array<[string, any]>) {
      montar({ items: [peca("p1", { embaladaQty: 10, status: "packed", tuboId: "t1" })], tubos: [tubo("t1")], tubo_itens: [linha("l1", "t1", "p1", 10)] });
      noMeioDoCaminho(() => { b.linha("tubos", "t1")!.entregueEm = new Date(); });
      const r = await chamar(rota, ctx);
      expect(r.status, rota).toBe(409);
      expect(r.body.error, rota).toContain("já foi entregue");
      expect(b.gravacoes(), rota).toEqual([]);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("tirar do volume é POR LINHA", () => {
  it("devolve AQUELA quantidade a conferida, a peça packed volta a conferred e o atalho vai para o outro volume", async () => {
    montar({
      items: [peca("p1", { embaladaQty: 10, status: "packed", tuboId: "t1" })],
      tubos: [tubo("t1", { numero: 1 }), tubo("t2", { numero: 2 })],
      tubo_itens: [linha("l1", "t1", "p1", 7), linha("l2", "t2", "p1", 3)],
    });
    const r = await chamar("PATCH /api/tubos/:id/itens", { params: { id: "t1" }, body: { remover: ["p1"] } });
    expect(r.status).toBe(200);
    expect(linhasDe("p1").map((l) => l.id)).toEqual(["l2"]);
    expect(item("p1")).toMatchObject({ embaladaQty: 3, status: "conferred", tuboId: "t2" });
    expect(H.trilhaEmLote).toEqual([expect.objectContaining({ entityId: "p1", details: "Retirada do Tubo 1 — 7 un." })]);
  });

  it("o avulso esvaziado some (não fica embalagem órfã)", async () => {
    montar({
      items: [peca("p1", { embaladaQty: 10, status: "packed", tuboId: "a1" })],
      tubos: [tubo("a1", { numero: -1, avulso: true })],
      tubo_itens: [linha("l1", "a1", "p1", 10)],
    });
    const r = await chamar("PATCH /api/tubos/:id/itens", { params: { id: "a1" }, body: { remover: ["p1"] } });
    expect(r.status).toBe(200);
    expect(b.mundo.tubos).toEqual([]);
    expect(H.trilhaEmLote[0].details).toBe("Embalagem desfeita — 10 un. voltaram a Conferido");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("entregar o volume entrega AS QUANTIDADES que estão nele", () => {
  const dividida = () => montar({
    items: [peca("p1", { embaladaQty: 10, status: "packed", tuboId: "t1" })],
    tubos: [tubo("t1", { numero: 1 }), tubo("t2", { numero: 2 })],
    tubo_itens: [linha("l1", "t1", "p1", 7), linha("l2", "t2", "p1", 3)],
  });

  it("só QUEM RECEBEU é obrigatório; a foto de fora do storage é recusada", async () => {
    dividida();
    expect((await chamar("POST /api/tubos/:id/entregar", { params: { id: "t1" }, body: {} })).status).toBe(400);
    expect((await chamar("POST /api/tubos/:id/entregar", { params: { id: "t1" }, body: { receivedBy: "Zé", photoUrl: "https://fora.com/x.jpg" } })).status).toBe(400);
    expect(b.gravacoes()).toEqual([]);
    expect((await chamar("POST /api/tubos/:id/entregar", { params: { id: "t1" }, body: { receivedBy: "Zé" } })).status).toBe(200);
  });

  it("7 de 10 no Tubo 1: carimba a linha, soma com teto (SET relativo) e fica packed; o atalho passa ao Tubo 2", async () => {
    dividida();
    const r = await chamar("POST /api/tubos/:id/entregar", { params: { id: "t1" }, body: { receivedBy: "Zé" } });
    expect(r.body).toMatchObject({ ok: true, numero: 1, entregues: 1, unidades: 7 });
    expect(b.linha("tubo_itens", "l1")!.entregueEm).toBeInstanceOf(Date);
    expect(b.linha("tubo_itens", "l2")!.entregueEm).toBeNull();
    expect(item("p1")).toMatchObject({ deliveredQty: 7, status: "packed", receivedBy: "Zé", tuboId: "t2" });
    const soma = b.ops.find((o) => o.tipo === "update" && o.tabela === "items" && "deliveredQty" in o.valores)!;
    expect(soma.valores.deliveredQty).not.toBeTypeOf("number"); // relativo, calculado no banco
    const trilhas = b.mundo.audit_logs.map((a) => a.details);
    expect(trilhas).toContainEqual(expect.stringMatching(/^Entrega parcial \(7\/10, recebido por: Zé\) — 7 un\. no Tubo 1, entregue a Zé em /));
    expect(trilhas).toContainEqual(expect.stringMatching(/^Tubo 1 entregue a Zé em .* — #p1 \(7\)$/));
    expect(b.linha("tubos", "t1")).toMatchObject({ recebidoPor: "Zé", entreguePor: "Gil" });
  });

  it("o segundo volume fecha a conta: delivered, 10 de 10, 'Entrega concluída'", async () => {
    dividida();
    await chamar("POST /api/tubos/:id/entregar", { params: { id: "t1" }, body: { receivedBy: "Zé" } });
    const r = await chamar("POST /api/tubos/:id/entregar", { params: { id: "t2" }, body: { receivedBy: "Zé" } });
    expect(r.status).toBe(200);
    expect(item("p1")).toMatchObject({ deliveredQty: 10, status: "delivered" });
    expect(b.mundo.audit_logs.map((a) => a.details)).toContainEqual(expect.stringMatching(/^Entrega concluída \(10\/10/));
  });

  it("peça-problema dentro (cancelada, excluída): 409 dizendo qual e como resolver — ANTES de qualquer escrita", async () => {
    montar({
      items: [peca("p1", { embaladaQty: 10, status: "packed", tuboId: "t1" }), peca("p2", { embaladaQty: 10, status: "canceled", tuboId: "t1" })],
      tubos: [tubo("t1", { numero: 3 })],
      tubo_itens: [linha("l1", "t1", "p1", 10), linha("l2", "t1", "p2", 10)],
    });
    const r = await chamar("POST /api/tubos/:id/entregar", { params: { id: "t1" }, body: { receivedBy: "Zé" } });
    expect(r).toEqual({ status: 409, body: { error: "Não dá para entregar o Tubo 3 — #p2 está cancelada. Para entregar, tire #p2 do Tubo 3 e tente de novo." } });
    expect(b.gravacoes()).toEqual([]);

    montar({
      items: [peca("p1", { embaladaQty: 10, status: "packed", tuboId: "a1", deletedAt: new Date() })],
      tubos: [tubo("a1", { numero: -1, avulso: true })],
      tubo_itens: [linha("l1", "a1", "p1", 10)],
    });
    const avulso = await chamar("POST /api/tubos/:id/entregar", { params: { id: "a1" }, body: { receivedBy: "Zé" } });
    expect(avulso.body.error).toBe("Não dá para entregar a embalagem — #p1 foi excluída. Para entregar, desfaça a embalagem de #p1 e tente de novo.");
  });

  it("apagar o avulso: a trilha nunca diz 'Tubo -1'", async () => {
    montar({ items: [peca("p1", { embaladaQty: 10, status: "packed", tuboId: "a1" })], tubos: [tubo("a1", { numero: -1, avulso: true })], tubo_itens: [linha("l1", "a1", "p1", 10)] });
    expect((await chamar("DELETE /api/tubos/:id", { params: { id: "a1" } })).body).toEqual({ ok: true, devolvidas: 1 });
    expect(H.auditoria.at(-1)![4]).toBe("Embalagem avulsa apagada — 1 peça(s) voltaram a Conferido");
    expect(H.trilhaEmLote[0].details).toBe("Embalagem desfeita — 10 un. voltaram a Conferido (Embalagem avulsa apagada)");
    montar({ tubos: [tubo("t1", { numero: 2 })] });
    await chamar("DELETE /api/tubos/:id", { params: { id: "t1" } });
    expect(H.auditoria.at(-1)![4]).toBe("Tubo 2 apagado (estava vazio)");
  });

  it("a entrega nunca passa da quantidade da peça (o teto está no SET)", async () => {
    dividida();
    item("p1").deliveredQty = 8; // alguém somou no meio
    await chamar("POST /api/tubos/:id/entregar", { params: { id: "t1" }, body: { receivedBy: "Zé" } });
    expect(item("p1").deliveredQty).toBe(10);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("depois do commit nada vira 500", () => {
  it("a trilha e o aviso falhando depois de embalar: 201, o volume fica e o erro vai ao log", async () => {
    montar({ items: [peca("p1")] });
    H.falharTrilha = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await chamar("POST /api/events/:eventId/tubos", { params: { eventId: "ev-1" }, body: { itemIds: ["p1"], fotos: [FOTO] } });
    expect(r.status).toBe(201);
    expect(linhasDe("p1")).toHaveLength(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('falha em "avisar a embalagem" depois do commit'), expect.any(Error));
  });

  it("idem ao tirar do volume", async () => {
    montar({ items: [peca("p1", { embaladaQty: 10, status: "packed", tuboId: "t1" })], tubos: [tubo("t1")], tubo_itens: [linha("l1", "t1", "p1", 10)] });
    H.falharTrilha = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await chamar("PATCH /api/tubos/:id/itens", { params: { id: "t1" }, body: { remover: ["p1"] } })).status).toBe(200);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('falha em "avisar a retirada" depois do commit'), expect.any(Error));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("o que as leituras devolvem", () => {
  it("GET /api/tubos/:id: fechadoEm no tubo (rodapé da etiqueta) e quantidadeNoTubo por peça", async () => {
    const fechadoEm = new Date("2026-09-21T15:00:00Z");
    montar({
      items: [peca("p1", { embaladaQty: 10, status: "packed", tuboId: "t1" })],
      tubos: [tubo("t1", { fechadoEm }), tubo("t2", { numero: 2 })],
      tubo_itens: [linha("l1", "t1", "p1", 7), linha("l2", "t2", "p1", 3)],
    });
    const r = await chamar("GET /api/tubos/:id", { params: { id: "t1" } });
    expect(r.body.tubo).toEqual({ id: "t1", numero: 1, avulso: false, entregueEm: null, recebidoPor: null, fechadoEm });
    expect(r.body.pecas).toEqual([expect.objectContaining({ id: "p1", quantity: 10, quantidadeNoTubo: 7, aEmbalar: 0, conferida: true })]);
  });

  it("retrato do evento: trava à vista, 'pronto para entregar' lê o problema, a excluída no volume ABERTO aparece e 'sem tubo' é quem tem unidade a embalar", async () => {
    const trava = { travadaEm: new Date(), travadaPor: "Bia", travadaMotivo: "Arte vai mudar" };
    montar({
      items: [
        peca("trav", { ...trava, embaladaQty: 10, status: "packed", tuboId: "t1" }),
        peca("exc", { embaladaQty: 10, status: "packed", tuboId: "t2", deletedAt: new Date() }),
        peca("ok", { embaladaQty: 10, status: "packed", tuboId: "t3" }),
        peca("inteira"),
        peca("parcial", { status: "produced", conferredQty: 7 }),
        peca("dividida", { embaladaQty: 7, tuboId: "t3" }),
        peca("cancelada", { status: "canceled" }),
        peca("revisao", { status: "awaiting_final_review", conferredQty: 0 }),
        peca("antiga", { status: "produced", conferredQty: 7, deliveredQty: 7 }),
      ],
      tubos: [tubo("t1", { numero: 1 }), tubo("t2", { numero: 2 }), tubo("t3", { numero: 3 })],
      tubo_itens: [linha("l1", "t1", "trav", 10), linha("l2", "t2", "exc", 10), linha("l3", "t3", "ok", 10), linha("l4", "t3", "dividida", 7)],
    });
    const r = await chamar("GET /api/events/:eventId/tubos", { params: { eventId: "ev-1" } });
    expect(r.status).toBe(200);
    const [t1, t2, t3] = r.body.tubos;
    expect(t1.pecas[0]).toMatchObject({ travada: true, travadaPor: "Bia", travadaMotivo: "Arte vai mudar", problema: "Peça travada pela Solicitação: Arte vai mudar — fale com Bia" });
    expect(t1.prontoParaEntregar).toBe(false);
    expect(t2.pecas[0]).toMatchObject({ id: "exc", excluida: true, problema: "foi excluída" });
    expect(t2.prontoParaEntregar).toBe(false);
    expect(t3.prontoParaEntregar).toBe(true);
    expect(t3.pecas.map((p: any) => [p.id, p.quantidadeNoTubo])).toEqual([["dividida", 7], ["ok", 10]]);
    expect(r.body.semTubo.map((p: any) => [p.id, p.aEmbalar])).toEqual([["dividida", 3], ["inteira", 10], ["parcial", 7]]);
  });

  it("GET /api/tubos: UM select para as linhas, `linhas` por volume e o recorte do Kit", async () => {
    montar({
      items: [
        peca("meu", { kitRemessaId: "rem", criadoPorId: "u-kit", embaladaQty: 10, status: "packed", tuboId: "t1" }),
        peca("alheio", { embaladaQty: 10, status: "packed", tuboId: "t2" }),
      ],
      tubos: [tubo("t1", { numero: 1 }), tubo("t2", { numero: 2 })],
      tubo_itens: [linha("l1", "t1", "meu", 4), linha("l2", "t2", "alheio", 10)],
    });
    const todos = await chamar("GET /api/tubos");
    expect(todos.body.map((t: any) => [t.id, t.linhas])).toEqual([
      ["t1", [{ itemId: "meu", quantidade: 4, entregue: false }]],
      ["t2", [{ itemId: "alheio", quantidade: 10, entregue: false }]],
    ]);
    expect(b.ops.filter((o) => o.tipo === "select" && o.tabela === "tubo_itens")).toHaveLength(1);
    const doKit = await chamar("GET /api/tubos", { papel: "solicitacao", kit: true, userId: "u-kit" });
    expect(doKit.body.map((t: any) => t.id)).toEqual(["t1"]);
  });

  it("GET /api/tubos (as duas formas) só vê volume ABERTO ou entregue há até 60 dias", async () => {
    const dias = (n: number) => new Date(Date.now() - n * 864e5);
    montar({
      items: [peca("p1", { status: "delivered", deliveredQty: 10 })],
      tubos: [tubo("aberto", { numero: 1 }), tubo("recente", { numero: 2, entregueEm: dias(10) }), tubo("velho", { numero: 3, entregueEm: dias(90) })],
      tubo_itens: [linha("l1", "recente", "p1", 10, { entregueEm: dias(10) })],
    });
    expect((await chamar("GET /api/tubos")).body.map((t: any) => t.id).sort()).toEqual(["aberto", "recente"]);
    expect((await chamar("GET /api/tubos", { query: { detalhe: "1" } })).body.map((t: any) => t.id).sort()).toEqual(["aberto", "recente"]);
  });

  it("registros: filtram por evento, desde e busca, e devolvem no máximo o limite; itemId entra no WHERE", async () => {
    const em = (d: string) => new Date(`2026-09-${d}T12:00:00Z`);
    montar({
      events: [EVENTO, { ...EVENTO, id: "ev-2", name: "COPA SUL" }],
      items: [peca("p1", { status: "delivered" }), peca("p2", { eventId: "ev-2", description: "Itaú", status: "delivered" })],
      tubos: [
        tubo("t1", { numero: 1, entregueEm: em("10"), recebidoPor: "Zé" }),
        tubo("t2", { numero: 2, entregueEm: em("20"), recebidoPor: "Ana" }),
        tubo("t3", { eventId: "ev-2", numero: 1, entregueEm: em("21"), recebidoPor: "Ana" }),
      ],
      tubo_itens: [linha("l1", "t1", "p1", 5, { entregueEm: em("10") }), linha("l2", "t2", "p1", 5, { entregueEm: em("20") }), linha("l3", "t3", "p2", 10, { entregueEm: em("21") })],
    });
    const ids = async (query: Record<string, string>) => (await chamar("GET /api/registros/tubos", { query })).body.map((t: any) => t.id);
    expect((await ids({})).sort()).toEqual(["t1", "t2", "t3"]);
    expect(await ids({ eventos: "ev-2" })).toEqual(["t3"]);
    expect((await ids({ desde: "2026-09-15T00:00:00Z" })).sort()).toEqual(["t2", "t3"]);
    expect(await ids({ busca: "itau" })).toEqual(["t3"]);
    expect(await ids({ limite: "1" })).toHaveLength(1);
    expect((await chamar("GET /api/registros/tubos", { query: { desde: "ontem" } })).status).toBe(400);
    await chamar("GET /api/registros/tubos", { query: { itemId: "p2" } });
    const sel = b.ops.filter((o) => o.tipo === "select" && o.tabela === "tubos").at(-1)!;
    expect(sel.where!.params).toContain("p2");
    expect(sel.where!.sql).toContain('"tubos"."id" in (select "tubo_itens"."tubo_id" from "tubo_itens" where "tubo_itens"."item_id" =');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("excluir a peça tira dos volumes abertos numa transação só", () => {
  it("trava os volumes (por id) antes da peça, tira, apaga o avulso vazio e faz o soft delete lá dentro", async () => {
    montar({
      items: [peca("p1", { embaladaQty: 10, status: "packed", tuboId: "t1" })],
      tubos: [tubo("t1", { numero: 1 }), tubo("a1", { numero: -1, avulso: true })],
      tubo_itens: [linha("l1", "t1", "p1", 7), linha("l2", "a1", "p1", 3)],
    });
    const r = await excluirPecaTirandoDosVolumes({ userName: "Ana" } as any, "p1");
    expect(r).toEqual({ tiradas: 2 });
    expect(b.mundo.tubo_itens).toEqual([]);
    expect(b.mundo.tubos.map((t) => t.id)).toEqual(["t1"]);
    expect(item("p1").deletedAt).toBeInstanceOf(Date);
    const tx = b.ops.filter((o) => o.tx !== null);
    expect(new Set(tx.map((o) => o.tx)).size).toBe(1);
    expect(b.gravacoes().every((o) => o.tx !== null)).toBe(true);
    const travaVolumes = tx.findIndex((o) => o.tabela === "tubos" && o.travou);
    const travaPeca = tx.findIndex((o) => o.tabela === "items" && o.travou);
    expect(tx[travaVolumes].orderBy).toEqual(['"tubos"."id" asc']);
    expect(travaVolumes).toBeLessThan(travaPeca);
    const softDelete = tx.findIndex((o) => o.tipo === "update" && o.tabela === "items" && o.valores.deletedAt);
    expect(tx.findIndex((o) => o.tipo === "delete" && o.tabela === "tubo_itens")).toBeLessThan(softDelete);
  });

  it("peça que já não existe: null, nada muda", async () => {
    montar({ items: [peca("p1", { deletedAt: new Date() })] });
    expect(await excluirPecaTirandoDosVolumes({ userName: "Ana" } as any, "p1")).toBeNull();
    expect(b.gravacoes()).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("a peça leva os volumes (services/tubosDaPeca)", () => {
  it("tuboVolumes = os abertos com a quantidade; tuboVolumesEntregues = os que já saíram", async () => {
    montar({
      items: [peca("p1", { tuboId: "t2" })],
      tubos: [tubo("t1", { numero: 1, entregueEm: new Date() }), tubo("t2", { numero: 2 })],
      tubo_itens: [linha("l1", "t1", "p1", 7, { entregueEm: new Date() }), linha("l2", "t2", "p1", 3)],
    });
    const mapa = await resumosDeTuboPorIds(["t2"]);
    const comVolumes = comTubo({ id: "p1", tuboId: "t2" }, mapa) as any;
    expect(comVolumes).toMatchObject({ tuboNumero: 2, tuboAvulso: false });
    expect(comVolumes.tuboVolumes).toEqual([{ tuboId: "t2", numero: 2, avulso: false, quantidade: 3 }]);
    expect(comVolumes.tuboVolumesEntregues).toEqual([{ tuboId: "t1", numero: 1, avulso: false, quantidade: 7 }]);
    // sem tubo, a peça sai como entrou
    expect(comTubo({ id: "p9", tuboId: null }, mapa)).toEqual({ id: "p9", tuboId: null });
  });

  it("a leitura das quantidades falhando não derruba a lista: a peça segue só com o número (e o log)", async () => {
    montar({ tubos: [tubo("t1")] });
    const original = b.db.select;
    let chamadas = 0;
    b.db.select = (...a: any[]) => { if (++chamadas === 2) throw new Error("sem tubo_itens"); return original(...a); };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const mapa = await resumosDeTuboPorIds(["t1"]);
    expect(comTubo({ id: "p1", tuboId: "t1" }, mapa)).toEqual(expect.objectContaining({ tuboNumero: 1 }));
    expect((comTubo({ id: "p1", tuboId: "t1" }, mapa) as any).tuboVolumes).toBeUndefined();
    expect(log).toHaveBeenCalledWith("[tubosDaPeca] não foi possível ler as quantidades por volume:", expect.any(Error));
  });
});
