// ─────────────────────────────────────────────────────────────────────────────
// CONFERÊNCIA COM TETO, IMPRESSAS NO EVENTO REALIZADO E TROCA NO MODO MOVER —
// as rotas REAIS executadas com o banco de mentira (tx-de-mentira.ts), mais as
// contas puras de shared/embalagem.ts que servidor e tela leem.
//
//   · o teto da conferência é (impressas + reaproveitadas) − conferidas;
//     CONFERIR_PARCIAL: 6 de 10 no acabamento → confere 6, e o status só vira
//     Conferido quando a quantidade inteira foi conferida;
//   · `qty` enviada tem de ser inteiro ≥ 1; a foto tem de ser do storage;
//   · start-production: IMPRESSAS_EM_EVENTO_REALIZADO, número inteiro de
//     verdade, trilha dos ativos em LOTE e o ciclo de vida só do evento da peça;
//   · /trocar com `deMaquina`: "Imprimir esta no lugar" no modo mover.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { txDeMentira, type OperacaoDoTx } from "./tx-de-mentira";
import { items as tabelaItems } from "@shared/schema";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: { transaction: (async () => {}) as any, execute: (async () => ({ rows: [] })) as any, insert: (() => {}) as any },
  broadcast: (() => {}) as any,
  createAuditLog: (async () => {}) as any,
  cron: (() => {}) as any,
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
    requireAuth: (_req: any, _res: any, next: any) => next(),
    requireRole: () => (_req: any, _res: any, next: any) => next(),
    broadcast: (...a: any[]) => H.broadcast(...a),
    createAuditLog: (...a: any[]) => H.createAuditLog(...a),
    updateEventStatus: async () => {},
  };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: (...a: any[]) => H.cron(...a) }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));
vi.mock("../services/consultaDeEstoqueNaLiberacao", () => ({
  respostaDoEstoqueParaLiberar: vi.fn(async () => null),
  marcarRespostaAplicada: vi.fn(async () => {}),
}));

import {
  tetoDaConferencia, aConferir, planejarConferencia, statusConferivel, CONFERIR_PARCIAL, CONFERIR_E_EMBALAR,
} from "@shared/embalagem";
import { eventoBarraImpressas, IMPRESSAS_EM_EVENTO_REALIZADO, planejarLancamentoDeImpressas } from "@shared/impressao-dividida";
import { remainingConfer, canConfer } from "@/lib/saldo";
import { registerItemRoutes } from "../routes/items";
import { registerMaquinasRoutes } from "../routes/maquinas";

// ═════════════════════════════════════════════════════════════════════════════
// 1. AS CONTAS PURAS
// ═════════════════════════════════════════════════════════════════════════════
const peca = (over: Record<string, unknown> = {}) => ({
  quantity: 10, quantityProduced: 0, reuseQty: 0, isReuse: false, conferredQty: 0, embaladaQty: 0, deliveredQty: 0, status: "inProduction", ...over,
});

describe("o teto da conferência (shared/embalagem)", () => {
  it("decisões do dono ligadas por padrão", () => {
    expect(CONFERIR_PARCIAL).toBe(true);
    expect(CONFERIR_E_EMBALAR).toBe(true);
    expect(IMPRESSAS_EM_EVENTO_REALIZADO).toBe(true);
  });

  it("6 de 10 no acabamento: existem 6 para conferir, não 10", () => {
    expect(tetoDaConferencia(peca({ quantityProduced: 6 }))).toBe(6);
    expect(aConferir(peca({ quantityProduced: 6 }))).toBe(6);
    expect(aConferir(peca({ quantityProduced: 6, conferredQty: 4 }))).toBe(2);
    // com a decisão desligada, a parte impressa espera a peça fechar
    expect(aConferir(peca({ quantityProduced: 6 }), false)).toBe(0);
    expect(aConferir(peca({ quantityProduced: 6, reuseQty: 2 }), false)).toBe(2);
  });

  it("impressão fechada vale a parte impressa inteira mesmo com o contador vazio (acervo antigo)", () => {
    expect(tetoDaConferencia(peca({ status: "produced", quantityProduced: null }))).toBe(10);
    expect(tetoDaConferencia(peca({ status: "produced", quantityProduced: null, reuseQty: 3 }))).toBe(10);
  });

  it("reaproveitado confere sem impressão; revisão, cancelada e entregue não conferem", () => {
    expect(aConferir(peca({ status: "ready_for_production", reuseQty: 4 }))).toBe(4);
    for (const st of ["awaiting_final_review", "in_review", "canceled", "archived", "delivered"]) {
      expect(statusConferivel(st), st).toBe(false);
      expect(aConferir(peca({ status: st, quantityProduced: 10 })), st).toBe(0);
    }
  });

  it("planejarConferencia: qty inteira ≥ 1 quando enviada; ausente = tudo o que existe", () => {
    const p = peca({ quantityProduced: 6 });
    expect(planejarConferencia(p)).toMatchObject({ ok: true, quantidade: 6, conferredQty: 6, completa: false, novoStatus: null });
    for (const lixo of [0, -1, "abc", null, 2.5, "", "3.5"]) {
      expect(planejarConferencia(p, lixo), String(lixo)).toMatchObject({ ok: false, http: 400 });
    }
    expect(planejarConferencia(p, "4")).toMatchObject({ ok: true, quantidade: 4 });
    expect(planejarConferencia(p, 7)).toMatchObject({ ok: false, http: 409 });
    expect((planejarConferencia(p, 7) as any).motivo).toContain("Só há 6 un. para conferir agora");
  });

  it("o status só vira Conferido quando a quantidade inteira foi conferida", () => {
    expect(planejarConferencia(peca({ status: "produced", quantityProduced: 10, conferredQty: 6 }), 4)).toMatchObject({ ok: true, completa: true, novoStatus: "conferred" });
    expect(planejarConferencia(peca({ status: "produced", quantityProduced: 10, conferredQty: 6, embaladaQty: 10 }), 4)).toMatchObject({ novoStatus: "packed" });
  });

  it("a tela lê a MESMA conta (lib/saldo)", () => {
    const p = peca({ quantityProduced: 6, conferredQty: 2 });
    expect(remainingConfer(p as any)).toBe(aConferir(p));
    expect(canConfer(p as any)).toBe(true);
    expect(canConfer(peca({ quantityProduced: 6, conferredQty: 6 }) as any)).toBe(false);
  });

  it("evento realizado não barra informar impressas da peça EM impressão; barra o resto", () => {
    expect(eventoBarraImpressas("realizado", "inProduction")).toBe(false);
    expect(eventoBarraImpressas("realizado", "ready_for_production")).toBe(true);
    expect(eventoBarraImpressas("encerrado", "inProduction")).toBe(true);
    expect(eventoBarraImpressas(null, "ready_for_production")).toBe(false);
  });

  it("quantityProduced na peça não dividida: número INTEIRO de verdade (\"5\" e 2.5 não passam)", () => {
    const p = { id: "p", status: "inProduction", quantity: 10, reuseQty: 0, quantityProduced: 2, printMachine: "1", impressaoPorMaquina: null, productionStartedAt: new Date(), producedAt: null, travadaEm: null };
    expect(planejarLancamentoDeImpressas(p as any, { quantityProduced: "5" }, new Date())).toMatchObject({ ok: false, status: 400 });
    expect(planejarLancamentoDeImpressas(p as any, { quantityProduced: 2.5 }, new Date())).toMatchObject({ ok: false, status: 400 });
    expect(planejarLancamentoDeImpressas(p as any, { quantityProduced: 5 }, new Date())).toMatchObject({ ok: true, quantityProduced: 5 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. AS ROTAS REAIS
// ═════════════════════════════════════════════════════════════════════════════
type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const appFalso: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  appFalso[verbo] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs); return appFalso; };
}
registerItemRoutes(appFalso);
registerMaquinasRoutes(appFalso);

async function chamar(chave: string, ctx: { params?: any; body?: any; userRole?: string } = {}) {
  const handlers = rotas.get(chave);
  if (!handlers) throw new Error(`Rota não registrada: ${chave}`);
  const req: any = { params: ctx.params ?? {}, body: ctx.body ?? {}, query: {}, headers: {}, userRole: ctx.userRole ?? "grafica", userId: "u1", userName: "Maria", session: {} };
  const res: any = { _status: 200, _body: undefined, _done: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; res._done = true; return res; };
  res.set = () => res; res.setHeader = () => res; res.send = res.json;
  for (const h of handlers) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (res._done || !seguiu) break;
  }
  return { status: res._status, body: res._body };
}

const HOJE = new Date("2026-09-22T12:00:00.000Z");
let mundo: { itens: Record<string, any>; eventos: Record<string, any> };
let ops: OperacaoDoTx[];
let inseridos: any[];
const FOTO = "/objects/uploads/conf.jpg";
const item = (over: Record<string, unknown> = {}) => ({
  id: "p1", displayId: "#0100", eventId: "ev-1", type: "Pórtico", description: "Entrada", quantity: 10,
  quantityProduced: 6, reuseQty: 0, isReuse: false, conferredQty: 0, embaladaQty: 0, deliveredQty: 0,
  status: "inProduction", printMachine: "1", impressaoPorMaquina: null, reservaPorMaquina: null, maquinaPrevista: null,
  deletedAt: null, travadaEm: null, conferencePhotoUrl: null, conferredAt: null, productionStartedAt: new Date("2026-09-20T10:00:00Z"), producedAt: null,
  parentItemId: null, approvalThumbUrl: null,
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(HOJE);
  mundo = {
    itens: { p1: item() },
    eventos: { "ev-1": { id: "ev-1", name: "COPA NORTE", status: "active", startDate: new Date("2026-12-20T00:00:00Z"), truckDepartureDate: new Date("2026-12-18T00:00:00Z") } },
  };
  ops = []; inseridos = [];
  H.broadcast = vi.fn();
  H.createAuditLog = vi.fn(async () => {});
  H.cron = vi.fn();
  H.db.transaction = vi.fn(async (cb: any) => cb(txDeMentira(mundo, ops)));
  H.db.insert = vi.fn(() => ({ values: async (v: any) => { inseridos.push(v); return []; } }));
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getItem = vi.fn(async (id: string) => mundo.itens[id]);
  s.getEvent = vi.fn(async (id: string) => mundo.eventos[id]);
  s.getItemSponsors = vi.fn(async () => []);
  s.getAssetsByOriginalItemId = vi.fn(async () => []);
  s.createInventoryAssets = vi.fn(async (rs: any[]) => rs.map((r, i) => ({ id: `at-${i}`, ...r })));
  s.createBulkAuditLogs = vi.fn(async () => {});
  s.createAuditLog = vi.fn(async () => {});
});
afterEach(() => { vi.useRealTimers(); });

const conferir = (body: Record<string, unknown>, id = "p1", userRole = "grafica") =>
  chamar("POST /api/items/:id/confer", { params: { id }, body, userRole });

describe("POST /api/items/:id/confer — o teto é o que já existe", () => {
  it("6 de 10 impressas (em impressão): confere 6, e a peça continua Em Impressão", async () => {
    const r = await conferir({ conferencePhotoUrl: FOTO });
    expect(r.status).toBe(200);
    expect(mundo.itens.p1.conferredQty).toBe(6);
    expect(mundo.itens.p1.status).toBe("inProduction");
    expect(mundo.itens.p1.conferencePhotoUrl).toBe(FOTO);
  });

  it("pedir mais do que saiu da impressora é 409 com frase (antes conferia 10 de 6)", async () => {
    const r = await conferir({ conferencePhotoUrl: FOTO, qty: 8 });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("Só há 6 un. para conferir agora");
    expect(mundo.itens.p1.conferredQty).toBe(0);
  });

  it("qty 0, \"abc\" ou null: 400 em pt-BR, nada gravado (antes virava \"conferir tudo\")", async () => {
    for (const qty of [0, "abc", null, 1.5]) {
      const r = await conferir({ conferencePhotoUrl: FOTO, qty });
      expect(r.status, String(qty)).toBe(400);
      expect(r.body.error).toBe("Informe quantas unidades conferir (número inteiro, pelo menos 1).");
    }
    expect(ops.filter((o) => o.tipo === "update")).toEqual([]);
  });

  it("a foto de fora do storage é recusada antes de abrir a transação", async () => {
    const r = await conferir({ conferencePhotoUrl: "https://exemplo.com/x.jpg" });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("/objects/");
    expect(H.db.transaction).not.toHaveBeenCalled();
    // a forma crua do bucket é normalizada
    const ok = await conferir({ conferencePhotoUrl: "https://storage.googleapis.com/bucket/.private/uploads/a.jpg" });
    expect(ok.status).toBe(200);
    expect(mundo.itens.p1.conferencePhotoUrl).toBe("/objects/uploads/a.jpg");
  });

  it("fechar a quantidade inteira promove a Conferido", async () => {
    mundo.itens.p1 = item({ status: "produced", quantityProduced: 10, conferredQty: 6 });
    const r = await conferir({ conferencePhotoUrl: FOTO, qty: 4 });
    expect(r.status).toBe(200);
    expect(mundo.itens.p1).toMatchObject({ conferredQty: 10, status: "conferred" });
  });

  it("nada impresso: 409 que explica; peça inexistente: 404 em pt-BR", async () => {
    mundo.itens.p1 = item({ quantityProduced: 0 });
    const r = await conferir({ conferencePhotoUrl: FOTO });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("Nada a conferir agora");
    const x = await conferir({ conferencePhotoUrl: FOTO }, "nao-existe");
    expect(x.status).toBe(404);
    expect(x.body.error).toBe("Peça não encontrada.");
  });

  it("500 não vaza a mensagem crua do banco", async () => {
    H.db.transaction = vi.fn(async () => { throw new Error('relation "items" does not exist'); });
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await conferir({ conferencePhotoUrl: FOTO });
    erro.mockRestore();
    expect(r.status).toBe(500);
    expect(r.body.error).toBe("Não foi possível completar a operação");
  });
});

describe("PATCH /api/items/:id/start-production — impressas", () => {
  const lancar = (body: Record<string, unknown>) => chamar("PATCH /api/items/:id/start-production", { params: { id: "p1" }, body });
  const realizado = () => { mundo.eventos["ev-1"] = { ...mundo.eventos["ev-1"], startDate: new Date("2026-09-20T00:00:00Z") }; };

  it("evento REALIZADO: a peça que estava na impressora informa o que saiu (até o que estava atribuído)", async () => {
    realizado();
    const r = await lancar({ quantityProduced: 8 });
    expect(r.status).toBe(200);
    expect(mundo.itens.p1.quantityProduced).toBe(8);
    // acima do atribuído continua recusado pelo plano
    const alem = await lancar({ quantityProduced: 11 });
    expect(alem.status).toBe(400);
  });

  it("evento REALIZADO: a peça fora da impressora continua barrada (iniciar é trabalho novo)", async () => {
    realizado();
    mundo.itens.p1 = item({ status: "ready_for_production", quantityProduced: 0, printMachine: null });
    const r = await lancar({ quantityProduced: 2 });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "EVENT_FINALIZED", reason: "realizado" });
    expect(H.db.transaction).not.toHaveBeenCalled();
  });

  it("evento ENCERRADO à mão continua barrando (tem volta: reabrir)", async () => {
    mundo.eventos["ev-1"] = { ...mundo.eventos["ev-1"], status: "closed" };
    const r = await lancar({ quantityProduced: 8 });
    expect(r.status).toBe(409);
    expect(r.body.reason).toBe("encerrado");
  });

  it("\"5\" (texto) é 400; sem número é 400 em pt-BR", async () => {
    expect((await lancar({ quantityProduced: "5" })).status).toBe(400);
    const vazio = await lancar({});
    expect(vazio.status).toBe(400);
    expect(vazio.body.error).toBe("Informe quantas unidades saíram da impressora");
  });

  it("fechar a peça cria os ativos com a trilha em LOTE e roda o ciclo de vida só do evento dela", async () => {
    const r = await lancar({ quantityProduced: 10 });
    expect(r.status).toBe(200);
    expect(mundo.itens.p1.status).toBe("produced");
    expect(H.storage.createInventoryAssets).toHaveBeenCalledTimes(1);
    expect(H.storage.createInventoryAssets.mock.calls[0][0]).toHaveLength(10);
    // um INSERT para as 10 linhas da trilha, não dez
    expect(H.storage.createBulkAuditLogs).toHaveBeenCalledTimes(1);
    expect(H.storage.createBulkAuditLogs.mock.calls[0][0]).toHaveLength(10);
    expect(H.storage.createBulkAuditLogs.mock.calls[0][0][0]).toMatchObject({ action: "cadastrado", entityType: "inventory_asset", userName: "Maria" });
    expect(H.cron).toHaveBeenCalledWith("ev-1");
  });

  it("peça inexistente: 404 em pt-BR", async () => {
    const r = await chamar("PATCH /api/items/:id/start-production", { params: { id: "nao-existe" }, body: { quantityProduced: 1 } });
    expect(r.status).toBe(404);
    expect(r.body.error).toBe("Peça não encontrada.");
  });
});

describe("PATCH /api/items/:id/deliver (aposentada)", () => {
  it("404 em pt-BR para peça inexistente", async () => {
    const r = await chamar("PATCH /api/items/:id/deliver", { params: { id: "nao-existe" } });
    expect(r.status).toBe(404);
    expect(r.body.error).toBe("Peça não encontrada.");
  });
});

describe("POST /api/grafica/maquinas/:maquina/trocar com deMaquina — imprimir no lugar no modo mover", () => {
  it("a que ocupa a 2 sai (volta à fila dela) e as unidades da peça MUDAM da 1 para a 2", async () => {
    mundo.itens = {
      a: item({ id: "a", displayId: "#0200", status: "inProduction", quantity: 10, quantityProduced: 2, printMachine: "1" }),
      b: item({ id: "b", displayId: "#0201", status: "inProduction", quantity: 5, quantityProduced: 1, printMachine: "2" }),
    };
    const r = await chamar("POST /api/grafica/maquinas/:maquina/trocar", { params: { maquina: "2" }, body: { tirarItemId: "b", colocarItemId: "a", deMaquina: "1" } });
    expect(r.status).toBe(200);
    const doA = ops.find((o) => o.tipo === "update" && o.tabela === tabelaItems && o.ids.includes("a"))!;
    expect(doA.valores).toMatchObject({ status: "inProduction", printMachine: "2" });
    // 2 impressas ficam anotadas na 1; as 8 que faltavam vão para a 2
    expect(doA.valores.impressaoPorMaquina).toEqual({ "1": { atrib: 2, impressas: 2 }, "2": { atrib: 8, impressas: 0 } });
    const doB = ops.find((o) => o.tipo === "update" && o.ids.includes("b"))!;
    expect(doB.valores.status).toBe("ready_for_production");
    // o diário registra a TROCA (8 movidas), não um início
    expect(inseridos.flat().find((v: any) => v.itemId === "a")).toMatchObject({ maquina: "2", tipo: "troca", quantidade: 8 });
  });

  it("sem deMaquina, a peça em impressão noutra impressora não tem o que iniciar (o caminho de antes segue igual)", async () => {
    mundo.itens = {
      a: item({ id: "a", status: "inProduction", quantity: 10, quantityProduced: 2, printMachine: "1" }),
      b: item({ id: "b", status: "inProduction", quantity: 5, quantityProduced: 1, printMachine: "2" }),
    };
    const r = await chamar("POST /api/grafica/maquinas/:maquina/trocar", { params: { maquina: "2" }, body: { tirarItemId: "b", colocarItemId: "a" } });
    expect(r.status).toBe(409);
  });

  it("evento finalizado da que ENTRA barra também no modo mover (trocar de máquina é trabalho andando)", async () => {
    mundo.eventos["ev-1"] = { ...mundo.eventos["ev-1"], startDate: new Date("2026-09-20T00:00:00Z") };
    mundo.itens = {
      a: item({ id: "a", status: "inProduction", quantity: 10, quantityProduced: 2, printMachine: "1" }),
      b: item({ id: "b", eventId: "ev-2", status: "inProduction", quantity: 5, quantityProduced: 1, printMachine: "2" }),
    };
    const r = await chamar("POST /api/grafica/maquinas/:maquina/trocar", { params: { maquina: "2" }, body: { tirarItemId: "b", colocarItemId: "a", deMaquina: "1" } });
    expect(r.status).toBe(409);
  });
});
