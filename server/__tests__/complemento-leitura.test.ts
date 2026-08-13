// ─────────────────────────────────────────────────────────────────────────────
// COMPLEMENTO — o que a TELA recebe e os efeitos colaterais na peça-filha.
//
// complemento-rotas.test.ts prova a ESCRITA (criar, cancelar, bifurcar, piso).
// Este arquivo prova as três coisas que acontecem DEPOIS e que nenhuma tela
// sobrevive sem:
//
//   1. LEITURA. Nenhum pixel do recurso existe sem `complements[]`,
//      `contractedTotal` e `parent` chegando nas três rotas que alimentam a
//      Gráfica, o Painel e a ficha do evento. É a única parte do contrato que
//      o client consome DIRETO — um campo que some aqui não gera erro nenhum:
//      o badge simplesmente não aparece, e o operador imprime a quantidade
//      errada sem nada na tela indicando problema.
//
//   2. PROPAGAÇÃO DA ARTE. Se a Arte troca o arquivo final depois do
//      complemento nascer e a troca não alcança o filho, a Gráfica imprime a
//      versão velha. Refugo real, dinheiro perdido, e — de novo — sem sintoma
//      na tela (risco #12 da spec, gravidade Alta).
//
//   3. ATIVOS DE INVENTÁRIO. `#0062-C1` é o PRIMEIRO displayId que não é "#" +
//      4 dígitos. O código antigo fazia replace(/[^0-9]/g,'') e produziria
//      `#EST-00621-1`, que colide com a peça #0621 (risco #5, Alta).
//
// Os handlers rodam de verdade (mesmo harness de complemento-rotas.test.ts:
// um "Express" que só guarda handlers). Mockado é só a borda — `../db`,
// `../storage` e os efeitos de `./shared`. Nenhum teste toca banco.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: { transaction: (async () => {}) as any },
  broadcast: (() => {}) as any,
  createAuditLog: (async () => {}) as any,
  updateEventStatus: (async () => {}) as any,
}));

vi.mock("../db", () => ({ db: H.db, pool: {} }));

vi.mock("../storage", async () => {
  // assetPrefix / assetSeqOf reais: são eles que a rota de produção usa para
  // nomear os ativos, e é exatamente isso que os últimos testes verificam.
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});

vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real,
    requireAuth: (_req: any, _res: any, next: any) => next(),
    broadcast: (...a: any[]) => H.broadcast(...a),
    createAuditLog: (...a: any[]) => H.createAuditLog(...a),
    updateEventStatus: (...a: any[]) => H.updateEventStatus(...a),
  };
});

vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn() }));

import { registerItemRoutes } from "../routes/items";
import { auditLogs } from "@shared/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Harness
// ─────────────────────────────────────────────────────────────────────────────
type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const appFalso: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  appFalso[verbo] = (caminho: string, ...hs: Handler[]) => {
    rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs);
    return appFalso;
  };
}
registerItemRoutes(appFalso);

async function chamar(
  chave: string,
  ctx: { params?: any; body?: any; query?: any; userRole?: string; userId?: string; userName?: string } = {},
): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  const handlers = rotas.get(chave);
  if (!handlers) throw new Error(`Rota não registrada: ${chave}`);

  const req: any = {
    params: ctx.params ?? {},
    body: ctx.body ?? {},
    query: ctx.query ?? {},
    headers: {},
    userRole: ctx.userRole,
    userId: ctx.userId,
    userName: ctx.userName ?? "Maria Silva",
    session: { userId: ctx.userId, userRole: ctx.userRole, userName: ctx.userName },
  };

  const res: any = { _status: 200, _body: undefined, _headers: {}, _done: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.set = (k: string, v: string) => { res._headers[k] = v; return res; };
  res.setHeader = res.set;
  res.json = (b: any) => { res._body = b; res._done = true; return res; };
  res.send = res.json;

  for (const h of handlers) {
    let chamouNext = false;
    await h(req, res, () => { chamouNext = true; });
    if (res._done || !chamouNext) break;
  }
  return { status: res._status, body: res._body, headers: res._headers };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mundo em memória
// ─────────────────────────────────────────────────────────────────────────────
const GET_TODOS = "GET /api/items";
const GET_APROVADOS = "GET /api/items/approved";
const GET_POR_EVENTO = "GET /api/items/:eventId";
const PATCH_ARQUIVO_FINAL = "PATCH /api/items/:id/update-final-file";
const START_PRODUCTION = "PATCH /api/items/:id/start-production";

const MOTIVO = "cliente confirmou dois pórticos extras para a ativação de sábado";

function evento(over: Partial<any> = {}) {
  return {
    id: "ev-1",
    name: "COPA NORTE 2026",
    status: "created",
    priority: "alta",
    createdBy: "user-criador",
    truckDepartureDate: new Date("2099-01-01T00:00:00Z"),
    franchise: "Norte Nordeste",
    ...over,
  };
}

function peca(over: Partial<any> = {}) {
  return {
    id: "mae-1",
    displayId: "#0062",
    eventId: "ev-1",
    type: "Pórtico 6x3",
    description: "Entrada principal",
    area: "18.00", visual: "18.00",
    fileWidth: "6.10", fileHeight: "3.10",
    material: "Lona 440g", finish: "Ilhós", measurement: "6x3",
    calculatedM2: "189.10",
    status: "delivered",
    quantity: 10,
    quantityProduced: 10,
    reuseQty: 0,
    isReuse: false,
    conferredQty: 10,
    deliveredQty: 10,
    parentItemId: null,
    complementSeq: null,
    complementReason: null,
    complementRequestedBy: null,
    complementRequestedAt: null,
    finalFileUrl: "/objects/arte-v1.pdf",
    finalFileName: "portico-v1.pdf",
    finalPreviewUrl: "/objects/arte-v1.png",
    finalFileUpdatedAt: new Date("2026-08-01T09:00:00Z"),
    approvalThumbUrl: "/objects/thumb.png",
    productionStartedAt: new Date("2026-08-02T08:00:00Z"),
    producedAt: null,
    deletedAt: null,
    observations: null,
    ...over,
  };
}

/** Projeção que `getComplementsByParentIds` devolve (ComplementSummary). */
function resumo(over: Partial<any> = {}) {
  return {
    id: "filho-1",
    displayId: "#0062-C1",
    parentItemId: "mae-1",
    quantity: 4,
    status: "ready_for_production",
    quantityProduced: null,
    reuseQty: 0,
    conferredQty: 0,
    deliveredQty: 0,
    complementSeq: 1,
    complementReason: MOTIVO,
    complementRequestedBy: "Maria Silva",
    complementRequestedAt: new Date("2026-08-13T14:22:00Z"),
    ...over,
  };
}

const erroPg = (code: string, msg: string) => Object.assign(new Error(msg), { code });
const MIGRACAO_PENDENTE = () => erroPg("42703", 'column "parent_item_id" does not exist');

let mundo: { itens: Record<string, any>; eventos: Record<string, any> };
let txOps: { inserts: Array<{ table: any; vals: any }>; updates: Array<{ table: any; vals: any }> };
let broadcasts: any[];
let logs: Array<{ userName: string; action: string; entityType: string; entityId: string; details: string }>;
/** Linha que o UPDATE dentro da transação deve devolver (a rota lê o retorno). */
let itemEmFoco: any = null;

function novoTx() {
  return {
    insert: (table: any) => ({
      values: (vals: any) => {
        txOps.inserts.push({ table, vals });
        const linha = { id: `linha-${txOps.inserts.length}`, ...vals };
        const p: any = Promise.resolve([linha]);
        p.returning = async () => [linha];
        return p;
      },
    }),
    update: (table: any) => ({
      set: (vals: any) => ({
        where: (_w: any) => {
          txOps.updates.push({ table, vals });
          const linha = { ...(itemEmFoco ?? {}), ...vals };
          const p: any = Promise.resolve([linha]);
          p.returning = async () => [linha];
          return p;
        },
      }),
    }),
  };
}

beforeEach(() => {
  mundo = { itens: {}, eventos: { "ev-1": evento() } };
  txOps = { inserts: [], updates: [] };
  broadcasts = [];
  logs = [];
  itemEmFoco = null;

  H.db.transaction = vi.fn(async (cb: any) => await cb(novoTx()));
  H.broadcast = vi.fn((msg: any) => { broadcasts.push(msg); });
  H.createAuditLog = vi.fn(async (userName: string, action: string, entityType: string, entityId: string, details: string) => {
    logs.push({ userName, action, entityType, entityId, details });
  });
  H.updateEventStatus = vi.fn(async () => {});

  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];

  s.getItem = vi.fn(async (id: string) => mundo.itens[id]);
  s.getEvent = vi.fn(async (id: string) => mundo.eventos[id]);
  s.getAllEvents = vi.fn(async () => Object.values(mundo.eventos));
  s.getAllSponsors = vi.fn(async () => []);
  s.getAllItemSponsors = vi.fn(async () => []);
  s.getAllItemSponsorApprovals = vi.fn(async () => []);
  s.getItemSponsors = vi.fn(async () => []);
  s.getComplementsByParentIds = vi.fn(async () => []);
  s.getItemsByIds = vi.fn(async (ids: string[]) => ids.map((id) => mundo.itens[id]).filter(Boolean));
  s.getLiveComplements = vi.fn(async (parentId: string) =>
    Object.values(mundo.itens).filter((i: any) => i.parentItemId === parentId && !i.deletedAt));
  s.updateItem = vi.fn(async (id: string, payload: any) => {
    mundo.itens[id] = { ...mundo.itens[id], ...payload };
    return mundo.itens[id];
  });
  s.createNotification = vi.fn(async (n: any) => ({ id: `notif-${Math.random()}`, ...n }));
  s.getAssetsByOriginalItemId = vi.fn(async () => []);
  s.createInventoryAssets = vi.fn(async (rs: any[]) => rs.map((r, i) => ({ id: `at-${i}`, ...r })));

  s.getAllItems = vi.fn(async () => Object.values(mundo.itens));
  s.getApprovedItems = vi.fn(async () => Object.values(mundo.itens));
  s.getItemsByEvent = vi.fn(async (evId: string) =>
    Object.values(mundo.itens).filter((i: any) => i.eventId === evId));
});

/** As TRÊS rotas de leitura que enriquecem — o contrato tem que ser o mesmo. */
const ROTAS_DE_LEITURA: Array<[string, string, any]> = [
  ["/api/items", GET_TODOS, {}],
  ["/api/items/approved", GET_APROVADOS, {}],
  ["/api/items/:eventId", GET_POR_EVENTO, { params: { eventId: "ev-1" } }],
];

const porDisplayId = (corpo: any[], displayId: string) =>
  corpo.find((i) => i.displayId === displayId);

// ═════════════════════════════════════════════════════════════════════════════
describe("contrato de leitura — o que a tela recebe da MÃE", () => {
  beforeEach(() => {
    mundo.itens["mae-1"] = peca();
    mundo.itens["outra"] = peca({ id: "outra", displayId: "#0063", quantity: 5, type: "Banner" });
    H.storage.getComplementsByParentIds = vi.fn(async () => [resumo()]);
  });

  it.each(ROTAS_DE_LEITURA)("%s entrega complements[] e contractedTotal na mãe", async (_nome, chave, ctx) => {
    const r = await chamar(chave, { ...ctx, userRole: "grafica", userId: "u1" });
    expect(r.status).toBe(200);
    const mae = porDisplayId(r.body, "#0062");
    expect(mae.complements).toHaveLength(1);
    expect(mae.complements[0]).toMatchObject({ displayId: "#0062-C1", quantity: 4, complementSeq: 1 });
    expect(mae.contractedTotal).toBe(14);
  });

  it("a QUANTIDADE da mãe continua 10 — contractedTotal é derivado, não gravado", async () => {
    const r = await chamar(GET_TODOS, { userRole: "grafica" });
    const mae = porDisplayId(r.body, "#0062");
    expect(mae.quantity).toBe(10);          // o que foi contratado na origem
    expect(mae.contractedTotal).toBe(14);   // o que a operação precisa entregar
    // E nenhum UPDATE saiu para o banco por causa de uma LEITURA.
    expect(H.storage.updateItem).not.toHaveBeenCalled();
  });

  it("DOIS aumentos somam no contractedTotal e chegam os dois na lista", async () => {
    H.storage.getComplementsByParentIds = vi.fn(async () => [
      resumo(),
      resumo({ id: "filho-2", displayId: "#0062-C2", quantity: 2, complementSeq: 2, complementReason: "faltou no palco" }),
    ]);
    const r = await chamar(GET_TODOS, { userRole: "grafica" });
    const mae = porDisplayId(r.body, "#0062");
    expect(mae.contractedTotal).toBe(16);
    expect(mae.complements.map((c: any) => c.displayId)).toEqual(["#0062-C1", "#0062-C2"]);
    // Cada aumento carrega o PRÓPRIO motivo — é o ganho central do modelo.
    expect(mae.complements.map((c: any) => c.complementReason)).toEqual([MOTIVO, "faltou no palco"]);
  });

  it("a ORDEM em que os complementos chegam do banco é preservada (asc complementSeq)", async () => {
    H.storage.getComplementsByParentIds = vi.fn(async () => [
      resumo({ id: "f1", displayId: "#0062-C1", complementSeq: 1 }),
      resumo({ id: "f2", displayId: "#0062-C2", complementSeq: 2 }),
      resumo({ id: "f3", displayId: "#0062-C3", complementSeq: 3 }),
    ]);
    const r = await chamar(GET_TODOS, { userRole: "grafica" });
    expect(porDisplayId(r.body, "#0062").complements.map((c: any) => c.complementSeq)).toEqual([1, 2, 3]);
  });

  it("peça SEM complemento não ganha os campos — o payload de 99% do acervo não muda", async () => {
    const r = await chamar(GET_TODOS, { userRole: "grafica" });
    const outra = porDisplayId(r.body, "#0063");
    expect("complements" in outra).toBe(false);
    expect("contractedTotal" in outra).toBe(false);
    // O client antigo (e todo cálculo de KPI) continua lendo `quantity`.
    expect(outra.quantity).toBe(5);
  });

  it("quantidade nula num complemento não vira NaN no total (o pior número da tela)", async () => {
    H.storage.getComplementsByParentIds = vi.fn(async () => [
      resumo({ quantity: 4 }),
      resumo({ id: "f2", displayId: "#0062-C2", quantity: null, complementSeq: 2 }),
    ]);
    const r = await chamar(GET_TODOS, { userRole: "grafica" });
    expect(porDisplayId(r.body, "#0062").contractedTotal).toBe(14);
  });

  it("o enriquecimento NÃO atropela event/sponsors (é a mesma passagem)", async () => {
    const r = await chamar(GET_TODOS, { userRole: "grafica" });
    const mae = porDisplayId(r.body, "#0062");
    expect(mae.event?.name).toBe("COPA NORTE 2026");
    expect(mae.sponsors).toEqual([]);
  });

  it("uma única query de complementos para a lista inteira (nada de N+1)", async () => {
    await chamar(GET_TODOS, { userRole: "grafica" });
    expect(H.storage.getComplementsByParentIds).toHaveBeenCalledTimes(1);
    expect(H.storage.getComplementsByParentIds).toHaveBeenCalledWith(["mae-1", "outra"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("contrato de leitura — o que a tela recebe do FILHO", () => {
  beforeEach(() => {
    mundo.itens["mae-1"] = peca();
    mundo.itens["filho-1"] = peca({
      id: "filho-1", displayId: "#0062-C1", parentItemId: "mae-1", complementSeq: 1,
      quantity: 4, status: "ready_for_production", quantityProduced: null,
      conferredQty: 0, deliveredQty: 0, complementReason: MOTIVO,
    });
    H.storage.getComplementsByParentIds = vi.fn(async () => [resumo()]);
  });

  it.each(ROTAS_DE_LEITURA)("%s resolve o parent do complemento", async (_nome, chave, ctx) => {
    const r = await chamar(chave, { ...ctx, userRole: "grafica", userId: "u1" });
    const filho = porDisplayId(r.body, "#0062-C1");
    expect(filho.parent).toEqual({ id: "mae-1", displayId: "#0062", quantity: 10, status: "delivered" });
  });

  it("o parent é um RECORTE — a peça-mãe inteira não vai junto no payload", async () => {
    const r = await chamar(GET_TODOS, { userRole: "grafica" });
    const filho = porDisplayId(r.body, "#0062-C1");
    expect(Object.keys(filho.parent).sort()).toEqual(["displayId", "id", "quantity", "status"]);
  });

  it("mãe JÁ na lista não gera segunda query (a tela da Gráfica costuma trazer as duas)", async () => {
    await chamar(GET_TODOS, { userRole: "grafica" });
    expect(H.storage.getItemsByIds).not.toHaveBeenCalled();
  });

  it("mãe FORA da lista ainda assim resolve — a fila da Gráfica recorta por status", async () => {
    // Cenário real: /api/items/approved não traz peças em rascunho. Sem esta
    // busca, a linha diria "COMPLEMENTO DE undefined".
    H.storage.getApprovedItems = vi.fn(async () => [mundo.itens["filho-1"]]);
    const r = await chamar(GET_APROVADOS, { userRole: "grafica" });
    expect(H.storage.getItemsByIds).toHaveBeenCalledWith(["mae-1"]);
    expect(porDisplayId(r.body, "#0062-C1").parent.displayId).toBe("#0062");
  });

  it("mãe que sumiu de vez não quebra a linha — o filho volta sem parent, e só", async () => {
    H.storage.getApprovedItems = vi.fn(async () => [mundo.itens["filho-1"]]);
    H.storage.getItemsByIds = vi.fn(async () => []);
    const r = await chamar(GET_APROVADOS, { userRole: "grafica" });
    expect(r.status).toBe(200);
    expect(porDisplayId(r.body, "#0062-C1").parent).toBeUndefined();
  });

  it("lista sem complemento nenhum não dispara a query de mães", async () => {
    delete mundo.itens["filho-1"];
    H.storage.getComplementsByParentIds = vi.fn(async () => []);
    await chamar(GET_TODOS, { userRole: "grafica" });
    expect(H.storage.getItemsByIds).not.toHaveBeenCalled();
  });

  it("filho órfão (mãe sem complemento vivo indexado) ainda recebe parent", async () => {
    // getComplementsByParentIds devolve vazio (ex.: recorte de status), mas o
    // filho está na lista: o parentesco precisa ser resolvido mesmo assim.
    H.storage.getComplementsByParentIds = vi.fn(async () => []);
    const r = await chamar(GET_TODOS, { userRole: "grafica" });
    expect(porDisplayId(r.body, "#0062-C1").parent.displayId).toBe("#0062");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("migração pendente — a listagem degrada, o app NÃO cai", () => {
  beforeEach(() => {
    mundo.itens["mae-1"] = peca();
    mundo.itens["outra"] = peca({ id: "outra", displayId: "#0063", quantity: 5 });
    H.storage.getComplementsByParentIds = vi.fn(async () => { throw MIGRACAO_PENDENTE(); });
  });

  it.each(ROTAS_DE_LEITURA)("%s continua respondendo o acervo inteiro sem o bloco de complemento", async (_nome, chave, ctx) => {
    const r = await chamar(chave, { ...ctx, userRole: "grafica", userId: "u1" });
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(2);
    expect(porDisplayId(r.body, "#0062").contractedTotal).toBeUndefined();
    // O que a tela sempre mostrou continua lá — some o recurso novo, não o app.
    expect(porDisplayId(r.body, "#0062").quantity).toBe(10);
    expect(porDisplayId(r.body, "#0062").event?.name).toBe("COPA NORTE 2026");
  });

  it("erro que NÃO é 42703 propaga — o try/catch não pode virar mordaça de bug", async () => {
    H.storage.getComplementsByParentIds = vi.fn(async () => { throw erroPg("57014", "canceling statement due to statement timeout"); });
    const r = await chamar(GET_TODOS, { userRole: "grafica" });
    expect(r.status).toBe(500);
    expect(r.body.error).toContain("statement timeout");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("Arte troca o arquivo final — a arte nova alcança o complemento", () => {
  const NOVA = { finalFileUrl: "/objects/arte-v2.pdf", finalFileName: "portico-v2.pdf", finalPreviewUrl: "/objects/arte-v2.png" };
  const trocar = (over: any = {}) => chamar(PATCH_ARQUIVO_FINAL, {
    params: { id: "mae-1" }, body: NOVA, userRole: over.userRole ?? "arte", userName: "João da Arte",
  });

  beforeEach(() => {
    mundo.itens["mae-1"] = peca();
    mundo.itens["filho-1"] = peca({
      id: "filho-1", displayId: "#0062-C1", parentItemId: "mae-1", complementSeq: 1,
      quantity: 4, status: "ready_for_production", quantityProduced: null, reuseQty: 0,
      conferredQty: 0, deliveredQty: 0,
    });
  });

  const atualizacoesDe = (id: string) =>
    (H.storage.updateItem as any).mock.calls.filter((c: any[]) => c[0] === id).map((c: any[]) => c[1]);

  it("complemento ainda NÃO impresso recebe a arte nova", async () => {
    const r = await trocar();
    expect(r.status).toBe(200);
    const [payload] = atualizacoesDe("filho-1");
    expect(payload).toMatchObject({
      finalFileUrl: "/objects/arte-v2.pdf",
      finalFileName: "portico-v2.pdf",
      finalPreviewUrl: "/objects/arte-v2.png",
    });
  });

  it("o arquivo ANTERIOR do filho aponta para a arte que ele de fato carregava", async () => {
    await trocar();
    const [payload] = atualizacoesDe("filho-1");
    expect(payload.previousFinalFileUrl).toBe("/objects/arte-v1.pdf");
    expect(payload.previousFinalFileName).toBe("portico-v1.pdf");
  });

  it("complemento JÁ IMPRESSO não é reescrito — mentiria sobre o que está no galpão", async () => {
    mundo.itens["filho-1"].quantityProduced = 3;
    const r = await trocar();
    expect(r.status).toBe(200);
    expect(atualizacoesDe("filho-1")).toHaveLength(0);
    expect(atualizacoesDe("mae-1")).toHaveLength(1); // a mãe troca normalmente
  });

  it("complemento com REAPROVEITAMENTO marcado também não é reescrito", async () => {
    mundo.itens["filho-1"].reuseQty = 2;
    await trocar();
    expect(atualizacoesDe("filho-1")).toHaveLength(0);
  });

  it("grava audit log no COMPLEMENTO dizendo de onde veio a arte", async () => {
    await trocar();
    const log = logs.find((l) => l.entityId === "filho-1");
    expect(log?.details).toContain("Arquivo final propagado da peça original #0062");
    expect(log?.userName).toBe("João da Arte");
  });

  it("avisa a Gráfica citando os complementos afetados, com broadcast que invalida a fila", async () => {
    mundo.itens["filho-2"] = peca({
      id: "filho-2", displayId: "#0062-C2", parentItemId: "mae-1", complementSeq: 2,
      quantity: 2, status: "ready_for_production", quantityProduced: null, reuseQty: 0,
    });
    await trocar();
    const notifs = (H.storage.createNotification as any).mock.calls.map((c: any[]) => c[0]);
    const doComplemento = notifs.find((n: any) => String(n.message).includes("#0062-C1"));
    expect(doComplemento).toBeDefined();
    expect(doComplemento.message).toContain("#0062-C2");
    expect(doComplemento.targetRoles).toEqual(["grafica"]);
    expect(broadcasts.map((b) => b.type)).toContain("production_updated");
  });

  it("sem complemento elegível, nenhuma notificação extra é criada (nada de ruído)", async () => {
    delete mundo.itens["filho-1"];
    await trocar();
    const notifs = (H.storage.createNotification as any).mock.calls.map((c: any[]) => c[0]);
    expect(notifs).toHaveLength(1);                       // só a da própria peça
    expect(notifs[0].message).not.toContain("complemento");
  });

  it("falha na propagação NÃO desfaz a troca da mãe — ela já foi commitada", async () => {
    H.storage.getLiveComplements = vi.fn(async () => { throw MIGRACAO_PENDENTE(); });
    const r = await trocar();
    expect(r.status).toBe(200);
    expect(r.body.finalFileUrl).toBe("/objects/arte-v2.pdf");
  });

  it("só Arte e admin trocam o arquivo — o gate que protege toda a propagação", async () => {
    expect((await trocar({ userRole: "grafica" })).status).toBe(403);
    expect((await trocar({ userRole: "solicitacao" })).status).toBe(403);
    expect((await trocar({ userRole: "admin" })).status).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("ativos de inventário do complemento — o prefixo que não pode colidir", () => {
  const produzir = (id: string, body: any) =>
    chamar(START_PRODUCTION, { params: { id }, body, userRole: "grafica", userName: "Carlos" });

  const ativosCriados = () =>
    ((H.storage.createInventoryAssets as any).mock.calls[0]?.[0] ?? []) as any[];

  beforeEach(() => {
    mundo.itens["mae-1"] = peca({ status: "inProduction", quantityProduced: 0, conferredQty: 0, deliveredQty: 0, producedAt: null });
    mundo.itens["filho-1"] = peca({
      id: "filho-1", displayId: "#0062-C1", parentItemId: "mae-1", complementSeq: 1,
      quantity: 4, status: "inProduction", quantityProduced: 0, reuseQty: 0,
      conferredQty: 0, deliveredQty: 0, producedAt: null, productionStartedAt: null,
    });
  });

  it("o complemento gera #EST-0062C1-1..4 — nunca #EST-00621-N, que é a peça #0621", async () => {
    itemEmFoco = mundo.itens["filho-1"];
    const r = await produzir("filho-1", { quantityProduced: 4 });
    expect(r.status).toBe(200);
    expect(ativosCriados().map((a) => a.displayId)).toEqual([
      "#EST-0062C1-1", "#EST-0062C1-2", "#EST-0062C1-3", "#EST-0062C1-4",
    ]);
    expect(ativosCriados().every((a) => a.originalItemId === "filho-1")).toBe(true);
  });

  it("a MÃE continua gerando #EST-0062-N — byte a byte o formato de sempre", async () => {
    itemEmFoco = mundo.itens["mae-1"];
    await produzir("mae-1", { quantityProduced: 10 });
    expect(ativosCriados().map((a) => a.displayId).slice(0, 3)).toEqual([
      "#EST-0062-1", "#EST-0062-2", "#EST-0062-3",
    ]);
    expect(ativosCriados()).toHaveLength(10);
  });

  it("o bloco do complemento e o da peça #0621 NÃO se cruzam (o bug do replace)", async () => {
    itemEmFoco = mundo.itens["filho-1"];
    await produzir("filho-1", { quantityProduced: 2 });
    const doComplemento = ativosCriados().map((a) => a.displayId);

    (H.storage.createInventoryAssets as any).mockClear();
    mundo.itens["p621"] = peca({ id: "p621", displayId: "#0621", quantity: 2, status: "inProduction", quantityProduced: 0, producedAt: null, productionStartedAt: null });
    itemEmFoco = mundo.itens["p621"];
    await produzir("p621", { quantityProduced: 2 });
    const daOutraPeca = ativosCriados().map((a) => a.displayId);

    expect(daOutraPeca).toEqual(["#EST-0621-1", "#EST-0621-2"]);
    expect(doComplemento.some((d) => daOutraPeca.includes(d))).toBe(false);
  });

  it("o ativo do complemento carrega o parentesco nas observações", async () => {
    itemEmFoco = mundo.itens["filho-1"];
    await produzir("filho-1", { quantityProduced: 4 });
    expect(ativosCriados()[0].notes).toBe("Gráfica — Evento: COPA NORTE 2026 · Complemento de #0062");
  });

  it("o ativo de peça normal não ganha texto de complemento", async () => {
    itemEmFoco = mundo.itens["mae-1"];
    await produzir("mae-1", { quantityProduced: 10 });
    expect(ativosCriados()[0].notes).toBe("Gráfica — Evento: COPA NORTE 2026");
  });

  it("com um ativo EXCLUÍDO no meio, o próximo lote sai do MAIOR sufixo (não da contagem)", async () => {
    // Bloco de 5 com o -3 excluído. Por contagem, o próximo lote recomeçaria em
    // -5 (que já existe) e o INSERT estouraria 23505 DEPOIS de a peça já estar
    // marcada como produzida — um 500 num estado que ninguém reproduz.
    mundo.itens["filho-1"].quantity = 6;
    itemEmFoco = mundo.itens["filho-1"];
    H.storage.getAssetsByOriginalItemId = vi.fn(async () => [
      { displayId: "#EST-0062C1-1" }, { displayId: "#EST-0062C1-2" },
      { displayId: "#EST-0062C1-4" }, { displayId: "#EST-0062C1-5" },
    ]);
    await produzir("filho-1", { quantityProduced: 6 });
    expect(ativosCriados().map((a) => a.displayId)).toEqual(["#EST-0062C1-6", "#EST-0062C1-7"]);
  });

  it("produção parcial não cria ativo nenhum — o inventário só nasce com a peça fechada", async () => {
    itemEmFoco = mundo.itens["filho-1"];
    const r = await produzir("filho-1", { quantityProduced: 2 });
    expect(r.body.status).toBe("inProduction");
    expect(H.storage.createInventoryAssets).not.toHaveBeenCalled();
  });

  it("cada ativo criado vira registro de auditoria", async () => {
    itemEmFoco = mundo.itens["filho-1"];
    await produzir("filho-1", { quantityProduced: 4 });
    expect(logs.filter((l) => l.entityType === "inventory_asset")).toHaveLength(4);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("producedAt — a etapa que faltava na trilha da ficha", () => {
  const produzir = (id: string, body: any) =>
    chamar(START_PRODUCTION, { params: { id }, body, userRole: "grafica", userName: "Carlos" });
  const valsDoUpdate = () => txOps.updates[0]?.vals ?? {};

  beforeEach(() => {
    mundo.itens["filho-1"] = peca({
      id: "filho-1", displayId: "#0062-C1", parentItemId: "mae-1", complementSeq: 1,
      quantity: 4, status: "inProduction", quantityProduced: 0, reuseQty: 0,
      conferredQty: 0, deliveredQty: 0, producedAt: null, productionStartedAt: new Date("2026-08-13T15:00:00Z"),
    });
    itemEmFoco = mundo.itens["filho-1"];
  });

  it("fechar a produção grava producedAt", async () => {
    await produzir("filho-1", { quantityProduced: 4 });
    expect(valsDoUpdate().status).toBe("produced");
    expect(valsDoUpdate().producedAt).toBeInstanceOf(Date);
  });

  it("produção parcial não grava producedAt (a peça não fechou)", async () => {
    await produzir("filho-1", { quantityProduced: 2 });
    expect(valsDoUpdate().status).toBe("inProduction");
    expect("producedAt" in valsDoUpdate()).toBe(false);
  });

  it("producedAt existente não é sobrescrito por um relançamento", async () => {
    mundo.itens["filho-1"].producedAt = new Date("2026-08-10T10:00:00Z");
    itemEmFoco = mundo.itens["filho-1"];
    await produzir("filho-1", { quantityProduced: 4 });
    expect("producedAt" in valsDoUpdate()).toBe(false);
  });

  it("o audit log da produção do complemento sai com o total da PRÓPRIA linha", async () => {
    await produzir("filho-1", { quantityProduced: 4 });
    const log = txOps.inserts.filter((i) => i.table === auditLogs).map((i) => i.vals)[0];
    expect(log.details).toContain("Produção: 4/4 un.");
    expect(log.action).toBe("produced");
  });
});
