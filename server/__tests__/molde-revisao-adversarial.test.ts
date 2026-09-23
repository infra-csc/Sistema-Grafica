// ─────────────────────────────────────────────────────────────────────────────
// REVISÃO ADVERSARIAL do Molde, da Arte e do PATCH genérico (22/09).
//
// O que este arquivo pina, com as ROTAS REAIS (borda mockada como em
// molde.test.ts) sempre que dá:
//   1. o tipo não vira nem deixa de ser Molde fora do rascunho (PATCH);
//   2. peça travada não muda de quantidade (PATCH);
//   3. o PATCH genérico aplica a régua do thumb (/objects/);
//   4. a criação pública não aceita status/quantidades/carimbos do corpo;
//   5. transfer-event recusa lixeira, Kit e reserva de estoque;
//   8. o molde nas pontas: trava no "voltar para liberado", aviso de evento
//      concluído, contagens, pedidos de peça, digest, planilha, telas;
//  10. a régua de permissões declara as duas rotas do molde;
//  11. os índices e o CHECK do SQL aditivo estão declarados no schema.
// A busca de arte (6) mora em busca-arte-revisao.test.ts (outro mock de db).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fonteDaArte } from "./fonte-das-telas-da-arte";
import { readFileSync } from "fs";
import path from "path";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: { transaction: (async () => {}) as any, execute: (async () => ({ rows: [] })) as any },
  broadcast: (() => {}) as any,
  createAuditLog: (async () => {}) as any,
  updateEventStatus: (async () => {}) as any,
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
    updateEventStatus: (...a: any[]) => H.updateEventStatus(...a),
  };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));
vi.mock("../services/consultaDeEstoqueNaLiberacao", () => ({
  respostaDoEstoqueParaLiberar: vi.fn(async () => null),
  marcarRespostaAplicada: vi.fn(async () => {}),
}));

import { getTableConfig } from "drizzle-orm/pg-core";
import {
  trocaDeMoldeProibida, tiposOferecidos, ERRO_TROCA_DE_MOLDE, TIPOS_DE_PECA, STATUS_QUE_PERMITEM_TROCAR_MOLDE,
} from "@shared/molde";
import { publicInsertItemSchema, items, tuboItens, prazoCobrancas, ITEM_STATUSES } from "@shared/schema";
import { REGUA_DE_PAPEIS } from "@shared/permissoes";
import { etapaDaPecaDoPedido, etapaDaPeca } from "@shared/pedidos-de-peca";
import { ERRO_THUMB_FORA_DO_STORAGE } from "../routes/thumb-url";
import { registerItemRoutes } from "../routes/items";
import { registerMoldeRoutes } from "../routes/molde";
import { montarResumo } from "../services/revisaoDigest";
import { isDelivered } from "@/lib/analises-status";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

// ═════════════════════════════════════════════════════════════════════════════
// Harness das rotas reais
// ═════════════════════════════════════════════════════════════════════════════
type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const appFalso: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  appFalso[verbo] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs); return appFalso; };
}
registerItemRoutes(appFalso);
registerMoldeRoutes(appFalso);

async function chamar(chave: string, ctx: { params?: any; body?: any; userRole?: string } = {}) {
  const handlers = rotas.get(chave);
  if (!handlers) throw new Error(`Rota não registrada: ${chave}`);
  const req: any = { params: ctx.params ?? {}, body: ctx.body ?? {}, query: {}, headers: {}, userRole: ctx.userRole, userId: "u1", userName: "Maria", session: {} };
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

/** O texto cru de um `sql\`\`` do drizzle (para saber qual consulta é). */
const textoDoSql = (q: any): string =>
  (q?.queryChunks ?? []).map((c: any) => (Array.isArray(c?.value) ? c.value.join("") : "")).join("");

let mundo: { itens: Record<string, any>; eventos: Record<string, any> };
let notificacoes: any[];
let criadas: any[];
let reservas: string[];

const peca = (over: any = {}) => ({
  id: "p1", displayId: "#0500", eventId: "ev-1", type: "Pórtico", description: "Pórtico", quantity: 10,
  quantityProduced: null, reuseQty: 0, isReuse: false, conferredQty: 0, embaladaQty: 0, deliveredQty: 0,
  status: "draft", skipApproval: false, approvalThumbUrl: null, finalFileUrl: null, deletedAt: null, parentItemId: null,
  kitRemessaId: null, travadaEm: null, fileWidth: "2.00", fileHeight: "1.00",
  ...over,
});

const TRAVA = { travadaEm: new Date("2026-09-21T12:00:00Z"), travadaPor: "Ana Solicitação", travadaMotivo: "Quantidade vai mudar" };

beforeEach(() => {
  mundo = {
    itens: {},
    eventos: {
      "ev-1": { id: "ev-1", name: "COPA NORTE", status: "created", startDate: "2099-01-10", truckDepartureDate: new Date("2099-01-01T00:00:00Z") },
      "ev-2": { id: "ev-2", name: "COPA SUL", status: "created", startDate: "2099-02-10", truckDepartureDate: new Date("2099-02-01T00:00:00Z") },
    },
  };
  notificacoes = []; criadas = []; reservas = [];
  H.broadcast = vi.fn();
  H.createAuditLog = vi.fn(async () => {});
  H.updateEventStatus = vi.fn(async () => {});
  H.db.execute = vi.fn(async (q: any) => {
    const t = textoDoSql(q);
    if (t.includes("event_inventory_allocations")) return { rows: reservas.map(() => ({ ok: 1 })) };
    return { rows: [] };
  });
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getItem = vi.fn(async (id: string) => mundo.itens[id]);
  s.getEvent = vi.fn(async (id: string) => mundo.eventos[id]);
  s.updateItem = vi.fn(async (id: string, dados: any) => (mundo.itens[id] = { ...mundo.itens[id], ...dados }));
  s.updateEvent = vi.fn(async () => ({}));
  s.createNotification = vi.fn(async (n: any) => { notificacoes.push(n); return { id: "n1", ...n }; });
  s.createItem = vi.fn(async (dados: any) => { criadas.push(dados); return { id: "novo", displayId: "#0900", ...dados, status: dados.status ?? "draft" }; });
  s.createBulkItems = vi.fn(async (lista: any[]) => { criadas.push(...lista); return lista.map((d, i) => ({ id: `n${i}`, displayId: `#09${i}`, ...d })); });
  // Transferir confere complementos e patrocinadores do destino.
  s.getLiveComplements = vi.fn(async () => []);
  s.getItemSponsors = vi.fn(async () => []);
  s.getEventSponsors = vi.fn(async () => []);
  s.getSponsor = vi.fn(async () => undefined);
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. Troca de tipo de/para Molde
// ═════════════════════════════════════════════════════════════════════════════
describe("1 · a fronteira do molde fica fechada fora do rascunho", () => {
  const ETAPAS_FORA_DO_RASCUNHO = [
    "awaiting_linking", "awaiting_submission", "awaiting_sponsor_approval", "awaiting_finalization",
    "awaiting_final_review", "ready_for_production", "inProduction", "produced", "conferred", "packed", "delivered",
  ];

  it("a regra pura: só cruza a fronteira do molde que conta; rascunho libera", () => {
    expect(STATUS_QUE_PERMITEM_TROCAR_MOLDE).toEqual(["draft", "requested", "rascunho"]);
    for (const status of ["draft", "requested"]) {
      expect(trocaDeMoldeProibida({ type: "Pórtico", status }, "Molde")).toBe(false);
      expect(trocaDeMoldeProibida({ type: "Molde", status }, "Pórtico")).toBe(false);
    }
    for (const status of ETAPAS_FORA_DO_RASCUNHO) {
      expect(trocaDeMoldeProibida({ type: "Pórtico", status }, "Molde"), status).toBe(true);
      expect(trocaDeMoldeProibida({ type: "Pórtico", status }, "MOLDES"), status).toBe(true);
      expect(trocaDeMoldeProibida({ type: "Molde", status }, "Pórtico"), status).toBe(true);
      // Dentro do mesmo lado da fronteira, segue livre.
      expect(trocaDeMoldeProibida({ type: "Pórtico", status }, "Arena"), status).toBe(false);
      expect(trocaDeMoldeProibida({ type: "Molde", status }, "MOLDE"), status).toBe(false);
      // Tipo ausente = não mexe no tipo.
      expect(trocaDeMoldeProibida({ type: "Molde", status }, undefined), status).toBe(false);
    }
  });

  it("o formulário só oferece Molde na criação e no rascunho", () => {
    expect(tiposOferecidos(null)).toEqual([...TIPOS_DE_PECA]);
    expect(tiposOferecidos({ type: "Pórtico", status: "draft" })).toContain("Molde");
    expect(tiposOferecidos({ type: "Pórtico", status: "awaiting_submission" })).not.toContain("Molde");
    expect(tiposOferecidos({ type: "Pórtico", status: "awaiting_submission" })).toContain("Arena");
    expect(tiposOferecidos({ type: "Molde", status: "ready_for_production" })).toEqual(["Molde"]);
    const tela = ler("client/src/pages/event-detail.tsx");
    expect(tela).toContain("typeOptions={tiposOferecidos(editingItem, itemTypes)}");
  });

  it("PATCH genérico: 409 em cada etapa fora do rascunho, nos dois sentidos — e nada é gravado", async () => {
    for (const status of ETAPAS_FORA_DO_RASCUNHO) {
      mundo.itens.p1 = peca({ status });
      const r = await chamar("PATCH /api/items/:id", { params: { id: "p1" }, body: { type: "Molde" }, userRole: "admin" });
      expect(r.status, status).toBe(409);
      expect(r.body.error).toBe(ERRO_TROCA_DE_MOLDE);
      expect(mundo.itens.p1.type).toBe("Pórtico");

      mundo.itens.m1 = peca({ id: "m1", type: "Molde", status });
      const r2 = await chamar("PATCH /api/items/:id", { params: { id: "m1" }, body: { type: "Pórtico" }, userRole: "solicitacao" });
      expect(r2.status, status).toBe(409);
      expect(mundo.itens.m1.type).toBe("Molde");
    }
    expect(H.storage.updateItem).not.toHaveBeenCalled();
  });

  it("PATCH genérico: no rascunho troca, e grava o nome canônico", async () => {
    for (const status of ["draft", "requested"]) {
      mundo.itens.p1 = peca({ status });
      const r = await chamar("PATCH /api/items/:id", { params: { id: "p1" }, body: { type: "MOLDES" }, userRole: "admin" });
      expect(r.status, status).toBe(200);
      expect(mundo.itens.p1.type).toBe("Molde");
    }
  });

  it("o PATCH /edit (irmã sem validação) não existe mais — só o genérico edita", () => {
    expect(rotas.has("PATCH /api/items/:id/edit")).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Quantidade de peça travada
// ═════════════════════════════════════════════════════════════════════════════
describe("2 · peça travada não muda de quantidade", () => {
  it("PATCH genérico: a redução que a promoveria a Produzido volta 409 com a frase da trava", async () => {
    mundo.itens.p1 = peca({ status: "inProduction", quantity: 10, quantityProduced: 6, ...TRAVA });
    const r = await chamar("PATCH /api/items/:id", { params: { id: "p1" }, body: { quantity: 6 }, userRole: "solicitacao" });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("PECA_TRAVADA");
    expect(r.body.error).toBe("Peça travada pela Solicitação: Quantidade vai mudar — fale com Ana Solicitação");
    expect(mundo.itens.p1.status).toBe("inProduction");
    expect(mundo.itens.p1.quantity).toBe(10);
  });

  it("qualquer mudança de quantidade (a regra escolhida é a mais simples); outros campos passam", async () => {
    mundo.itens.p1 = peca({ status: "draft", quantity: 10, ...TRAVA });
    expect((await chamar("PATCH /api/items/:id", { params: { id: "p1" }, body: { quantity: 12 }, userRole: "admin" })).status).toBe(409);
    const obs = await chamar("PATCH /api/items/:id", { params: { id: "p1" }, body: { observations: "ok", quantity: 10 }, userRole: "admin" });
    expect(obs.status).toBe(200);
    expect(mundo.itens.p1.observations).toBe("ok");
  });

  it("sem trava, a promoção de sempre continua", async () => {
    mundo.itens.p1 = peca({ status: "inProduction", quantity: 10, quantityProduced: 6 });
    const r = await chamar("PATCH /api/items/:id", { params: { id: "p1" }, body: { quantity: 6 }, userRole: "solicitacao" });
    expect(r.status).toBe(200);
    expect(mundo.itens.p1.status).toBe("produced");
  });

});

// ═════════════════════════════════════════════════════════════════════════════
// 3. approvalThumbUrl pelo PATCH genérico
// ═════════════════════════════════════════════════════════════════════════════
describe("3 · o PATCH genérico aplica a régua do thumb", () => {
  it("URL de fora: 400 com a mesma frase das rotas de envio", async () => {
    mundo.itens.p1 = peca({ status: "awaiting_submission" });
    const r = await chamar("PATCH /api/items/:id", { params: { id: "p1" }, body: { approvalThumbUrl: "https://example.com/x.png" }, userRole: "arte" });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe(ERRO_THUMB_FORA_DO_STORAGE);
    expect(H.storage.updateItem).not.toHaveBeenCalled();
  });

  it("/objects/ passa; a URL crua do bucket é gravada normalizada; o valor já gravado não trava a edição", async () => {
    mundo.itens.p1 = peca({ status: "awaiting_submission" });
    expect((await chamar("PATCH /api/items/:id", { params: { id: "p1" }, body: { approvalThumbUrl: "/objects/uploads/a.png" }, userRole: "arte" })).status).toBe(200);
    expect(mundo.itens.p1.approvalThumbUrl).toBe("/objects/uploads/a.png");
    await chamar("PATCH /api/items/:id", { params: { id: "p1" }, body: { approvalThumbUrl: "https://storage.googleapis.com/b/.private/uploads/b.png" }, userRole: "arte" });
    expect(mundo.itens.p1.approvalThumbUrl).toBe("/objects/uploads/b.png");
    mundo.itens.p2 = peca({ id: "p2", status: "awaiting_submission", approvalThumbUrl: "http://legado/x.jpg" });
    expect((await chamar("PATCH /api/items/:id", { params: { id: "p2" }, body: { approvalThumbUrl: "http://legado/x.jpg", observations: "x" }, userRole: "admin" })).status).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. POST /api/items não aceita campos de controle
// ═════════════════════════════════════════════════════════════════════════════
describe("4 · a criação pública nasce em rascunho, sem carimbos do corpo", () => {
  const base = {
    eventId: "ev-1", type: "Molde", quantity: 3, area: "2", visual: "1",
    material: "Lona", finish: "Refile", measurement: "2 × 1", calculatedM2: "6.00",
  };
  const forjados = {
    status: "produced", quantityProduced: 3, conferredQty: 3, deliveredQty: 3, reuseQty: 3,
    producedAt: new Date(), deliveredAt: new Date(), approvedAt: new Date(), statusChangedAt: new Date(),
    approvalThumbUrl: "/objects/x", finalFileUrl: "\\\\srv\\x.tif", rejectedByCreator: true, deletedAt: new Date(),
  };

  it("o schema descarta cada campo de controle", () => {
    const out: any = publicInsertItemSchema.parse({ ...base, ...forjados });
    for (const campo of Object.keys(forjados)) expect(out[campo], campo).toBeUndefined();
    expect(out.type).toBe("Molde");
    expect(out.quantity).toBe(3);
  });

  it("POST /api/items: um molde 'produced' no corpo nasce sem status (o default da coluna é rascunho)", async () => {
    const r = await chamar("POST /api/items", { body: { ...base, ...forjados }, userRole: "admin" });
    expect(r.status).toBe(201);
    expect(criadas).toHaveLength(1);
    for (const campo of Object.keys(forjados)) expect(criadas[0][campo], campo).toBeUndefined();
    expect(r.body.status).toBe("draft");
  });

  it("POST /api/items/bulk: a mesma blindagem", async () => {
    const r = await chamar("POST /api/items/bulk", { body: { items: [{ ...base, ...forjados }, { ...base, status: "delivered" }] }, userRole: "admin" });
    expect(r.status).toBe(201);
    expect(criadas.map((c) => c.status)).toEqual([undefined, undefined]);
    expect(criadas[0].quantityProduced).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. transfer-event
// ═════════════════════════════════════════════════════════════════════════════
describe("5 · transferir de evento recusa lixeira, Kit e reserva de estoque", () => {
  const transferir = (id = "p1") => chamar("POST /api/items/:id/transfer-event", { params: { id }, body: { eventId: "ev-2" }, userRole: "admin" });

  it("peça na lixeira → 409 ITEM_DELETED", async () => {
    mundo.itens.p1 = peca({ status: "awaiting_submission", deletedAt: new Date() });
    const r = await transferir();
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("ITEM_DELETED");
  });

  it("peça do Kit → 409 KIT_ITEM", async () => {
    mundo.itens.p1 = peca({ status: "awaiting_submission", kitRemessaId: "rem-1" });
    const r = await transferir();
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("KIT_ITEM");
  });

  it("peça com reserva de estoque → 409 HAS_STOCK_RESERVATION", async () => {
    mundo.itens.p1 = peca({ status: "awaiting_submission" });
    reservas = ["alloc-1"];
    const r = await transferir();
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("HAS_STOCK_RESERVATION");
    expect(mundo.itens.p1.eventId).toBe("ev-1");
  });

  it("sem nada disso, transfere como antes", async () => {
    mundo.itens.p1 = peca({ status: "awaiting_submission" });
    const r = await transferir();
    expect(r.status).toBe(200);
    expect(mundo.itens.p1.eventId).toBe("ev-2");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. O molde nas pontas
// ═════════════════════════════════════════════════════════════════════════════
describe("8 · molde: trava, aviso de evento concluído e contagens", () => {
  it("'Voltar para liberado' respeita a trava", async () => {
    mundo.itens.m1 = peca({ id: "m1", type: "Molde", status: "produced", quantityProduced: 3, ...TRAVA });
    const r = await chamar("PATCH /api/items/:id/molde-voltar-liberado", { params: { id: "m1" }, userRole: "grafica" });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("PECA_TRAVADA");
    expect(mundo.itens.m1.status).toBe("produced");
  });

  it("o molde que conclui o evento dispara o aviso eventCompleted, como a entrega do tubo", async () => {
    mundo.itens.m1 = peca({ id: "m1", type: "Molde", status: "ready_for_production", quantity: 3 });
    H.updateEventStatus = vi.fn(async (id: string) => { mundo.eventos[id] = { ...mundo.eventos[id], status: "completed" }; });
    const r = await chamar("PATCH /api/items/:id/molde-produzido", { params: { id: "m1" }, userRole: "grafica" });
    expect(r.status).toBe(200);
    expect(notificacoes.map((n) => n.type)).toEqual(["eventCompleted"]);
    expect(notificacoes[0].targetRoles).toEqual(["solicitacao"]);
  });

  it("evento que já estava concluído não repete o aviso", async () => {
    mundo.itens.m1 = peca({ id: "m1", type: "Molde", status: "ready_for_production", quantity: 3 });
    mundo.eventos["ev-1"].status = "completed";
    await chamar("PATCH /api/items/:id/molde-produzido", { params: { id: "m1" }, userRole: "grafica" });
    expect(notificacoes).toEqual([]);
  });

  it("digest da Revisão: molde não é 'sem arquivo final'", () => {
    const agora = new Date("2026-09-22T12:00:00Z");
    const r = montarResumo(
      [
        { id: "a", status: "awaiting_final_review", type: "Molde", finalFileUrl: null, eventId: "e", statusChangedAt: agora },
        { id: "b", status: "awaiting_final_review", type: "Pórtico", finalFileUrl: null, eventId: "e", statusChangedAt: agora },
      ] as any,
      () => "Evento", new Date("2026-09-21T00:00:00Z"), agora,
    );
    expect(r.total).toBe(2);
    expect(r.semArquivo).toBe(1);
  });

  it("Análises: com a PEÇA, molde produzido é concluído; com o status cru, a régua de antes", () => {
    expect(isDelivered({ type: "Molde", status: "produced" })).toBe(true);
    expect(isDelivered({ type: "Pórtico", status: "produced" })).toBe(false);
    expect(isDelivered("produced")).toBe(false);
    expect(isDelivered("entregue")).toBe(true);
  });

  it("pedidos de peça: o molde produzido chega a 'Entregue'; a peça comum produzida, não", () => {
    expect(etapaDaPecaDoPedido({ type: "Molde", status: "produced" })).toBe(4);
    expect(etapaDaPecaDoPedido({ type: "Pórtico", status: "produced" })).toBe(3);
    expect(etapaDaPeca("produced")).toBe(3);
    const ui = ler("client/src/components/pedidos/ui.tsx");
    expect(ui).toContain("const etapa = etapaDaPecaDoPedido(p);");
    expect(ui).toContain("<StatusBadge status={statusDeExibicao(p)} short />");
    const rota = ler("server/routes/pedidos-de-peca.ts");
    for (const c of ["embaladaQty: itemsTable.embaladaQty", "deliveredQty: itemsTable.deliveredQty", "travadaEm: itemsTable.travadaEm", "travadaMotivo: itemsTable.travadaMotivo"]) {
      expect(rota).toContain(c);
    }
    expect(rota).toContain("PECA_SEM_FLUXO.has(peca.status) && !ehMolde(peca)");
  });

  it("os pontos das telas e rotas que tratavam o molde como peça comum", () => {
    const relatorio = ler("server/routes/relatorio.ts");
    expect(relatorio).toContain("DELIVERED.has(statusParaContagem(i))");
    // A Arte foi dividida (página + components/arte/): o texto da tela inteira.
    // O "fora do book" recebe da fila se o evento tem book (eventoTemBook).
    const arte = fonteDaArte();
    expect(arte).toContain("if (!arquivoFinalOk(item)) p.semFinal++;");
    expect(arte).toContain("eventoTemBook={eventosComBook.has(item.eventId)}");
    expect(arte).toContain("eventoTemBook && !ehMolde(item) && (");
    expect(arte).toContain("moldes enviados para a Revisão Final");
    expect(arte).toContain('"molde enviado" : "moldes enviados"} para a Revisão Final');
    expect(arte).toContain("if (ehMolde(alvo)) enviadosMolde++; else enviados++;");
    const eventos = ler("server/routes/events.ts");
    expect(eventos).toContain("molde vai direto para a Arte, sem vinculação");
    const patrocinio = ler("server/routes/sponsors.ts");
    expect(patrocinio).toContain('if (ehMolde(item)) return res.status(409).json({ error: ERRO_PATROCINADOR_EM_MOLDE, code: "MOLDE_SEM_PATROCINADOR" });');
    expect(patrocinio).toContain("if (ehMolde(currentItem) && validSponsorIds.length > 0) {");
    const atendimento = ler("client/src/pages/atendimento.tsx");
    expect(atendimento).toContain("if (ehMolde(item)) return jornadaDoMolde(item, agora);");
    expect(atendimento).toContain("const statusCfg = getStatusMeta(statusDeExibicao(item));");
    const detalhe = ler("client/src/pages/event-detail.tsx");
    expect(detalhe).toContain("const chave = statusDeExibicao(item);");
    const painel = ler("client/src/pages/painel-geral.tsx");
    expect(painel).toContain("if (moldeConcluido(selectedItem)) return null;");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. Planilha: rótulo em português para todo status
// ═════════════════════════════════════════════════════════════════════════════
describe("9 · a planilha não imprime status cru", () => {
  // O módulo arrasta o exceljs (fora do alcance do teste): lê-se o mapa do fonte.
  const src = ler("server/services/xlsxExport.ts");
  const mapa = src.slice(src.indexOf("export const STATUS_LABELS"), src.indexOf("};", src.indexOf("export const STATUS_LABELS")));
  const rotulo = (s: string) => mapa.match(new RegExp(`(?:^|[\\s,{])${s}: "([^"]+)"`))?.[1];
  it("todo ITEM_STATUSES tem rótulo, e os três que saíam crus estão em português", () => {
    for (const s of ITEM_STATUSES) expect(rotulo(s), s).toBeTruthy();
    expect(rotulo("awaiting_review")).toBe("Ag. Revisão");
    expect(rotulo("in_review")).toBe("Em Revisão");
    expect(rotulo("canceled")).toBe("Cancelado");
    expect(mapa).toContain('[STATUS_MOLDE_PRODUZIDO]: "Produzido (molde)"');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. Permissões
// ═════════════════════════════════════════════════════════════════════════════
describe("10 · a régua declara as rotas do molde", () => {
  it("molde-produzido e molde-voltar-liberado: admin e grafica", () => {
    for (const rota of ["/api/items/:id/molde-produzido", "/api/items/:id/molde-voltar-liberado"]) {
      const linha = REGUA_DE_PAPEIS.find((r) => r.metodo === "PATCH" && r.rota === rota);
      expect(linha?.papeis.slice().sort(), rota).toEqual(["admin", "grafica"]);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. Índices e CHECK declarados no schema (o db:push não os apaga)
// ═════════════════════════════════════════════════════════════════════════════
describe("11 · o schema declara o que o SQL cria", () => {
  const tabelas: Record<string, any> = { items, prazo_cobrancas: prazoCobrancas, tubo_itens: tuboItens };
  const sqlPerf = ler("scripts/indices-performance.sql");

  it("os três índices de performance: mesmo nome, mesma tabela, mesmas colunas", () => {
    const linhas = Array.from(sqlPerf.matchAll(/CREATE INDEX CONCURRENTLY IF NOT EXISTS "(\w+)" ON "(\w+)" USING btree \(([^)]*)\)/g));
    const alvo = ["IDX_items_updated_at", "IDX_items_criado_por_kit", "IDX_prazo_cobrancas_target_id_created"];
    for (const nome of alvo) {
      const m = linhas.find((l) => l[1] === nome);
      expect(m, nome).toBeTruthy();
      const [, , tabela, cols] = m!;
      const colunasSql = Array.from(cols.matchAll(/"(\w+)"/g)).map((x) => x[1]);
      const cfg = getTableConfig(tabelas[tabela]);
      const idx = cfg.indexes.find((i: any) => i.config.name === nome);
      expect(idx, `${nome} declarado em shared/schema.ts`).toBeTruthy();
      expect(idx!.config.columns.map((c: any) => c.name), nome).toEqual(colunasSql);
    }
  });

  it("todo índice do SQL de performance está declarado (nenhum some num db:push)", () => {
    for (const [, nome, tabela] of Array.from(sqlPerf.matchAll(/CREATE INDEX CONCURRENTLY IF NOT EXISTS "(\w+)" ON "(\w+)"/g))) {
      const src = ler("shared/schema.ts");
      expect(src, `${nome} (${tabela})`).toContain(`index("${nome}")`);
    }
  });

  it("CHECK (quantidade > 0) de tubo_itens, com o nome que o Postgres dá ao CHECK inline", () => {
    const cfg = getTableConfig(tuboItens);
    const chk = cfg.checks.find((c: any) => c.name === "tubo_itens_quantidade_check");
    expect(chk).toBeTruthy();
    const aditivo = ler("scripts/migracao-aditiva-producao.sql");
    expect(aditivo).toContain("quantidade integer NOT NULL CHECK (quantidade > 0)");
    expect(aditivo).toContain("ADD CONSTRAINT tubo_itens_quantidade_check CHECK (quantidade > 0)");
  });

  it("as FKs inline do SQL aditivo são renomeadas para o nome do drizzle, sem apagar nada", () => {
    const aditivo = ler("scripts/migracao-aditiva-producao.sql");
    for (const [antigo, novo] of [
      ["tubos_event_id_fkey", "tubos_event_id_events_id_fk"],
      ["items_tubo_id_fkey", "items_tubo_id_tubos_id_fk"],
      ["tubo_itens_tubo_id_fkey", "tubo_itens_tubo_id_tubos_id_fk"],
      ["tubo_itens_item_id_fkey", "tubo_itens_item_id_items_id_fk"],
    ]) {
      expect(aditivo).toContain(`'${antigo}', '${novo}'`);
    }
    expect(aditivo).toContain("RENAME CONSTRAINT");
    const fks = getTableConfig(tuboItens).foreignKeys.map((f: any) => f.getName());
    expect(fks.sort()).toEqual(["tubo_itens_item_id_items_id_fk", "tubo_itens_tubo_id_tubos_id_fk"]);
    // Só renomeia: nada de DROP no bloco novo.
    const bloco = aditivo.slice(aditivo.indexOf("Nomes das FKs e do CHECK alinhados"));
    expect(bloco).not.toMatch(/\bDROP\b/i);
  });
});
