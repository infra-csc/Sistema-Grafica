// ─────────────────────────────────────────────────────────────────────────────
// CRIAR, CANCELAR, CLONAR E TRANSFERIR PEÇA — as rotas reais, com o banco de
// mentira (mesma borda de molde-revisao-adversarial.test.ts).
//
// O que este arquivo pina:
//   1. o lote (POST /api/items/bulk) exige um evento só e não aceita remessa
//      do Kit sem a conferência do POST unitário; erro de validação em pt-BR;
//   2. o PATCH /edit (irmã sem zod) não existe mais;
//   3. dispensar aprovação e reaproveitar são do admin e da Solicitação, e
//      reaproveitar exige dizer quantas unidades;
//   4. cancelar grava o MOTIVO na coluna própria, preserva as observações,
//      recalcula o evento, leva junto os complementos sem material e avisa
//      sobre os que ficaram; a solicitação ligada volta a abrir;
//   5. transferir recusa complemento e mãe com complemento, desliga da
//      solicitação e avisa dos patrocinadores fora do destino;
//   6. clonar deixa canceladas (por padrão) e complementos de fora, zera o
//      reaproveitamento e não é do usuário do Kit;
//   9. o helper de erros traduz o ZodError e esconde o 500.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: { transaction: (async () => {}) as any, execute: (async () => ({ rows: [] })) as any, insert: (() => ({ values: async () => [] })) as any },
  broadcast: (() => {}) as any,
  createAuditLog: (async () => {}) as any,
  createAuditLogsEmLote: (async () => {}) as any,
  updateEventStatus: (async () => {}) as any,
  aoExcluirPeca: (async () => {}) as any,
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
    createAuditLogsEmLote: (...a: any[]) => H.createAuditLogsEmLote(...a),
    updateEventStatus: (...a: any[]) => H.updateEventStatus(...a),
  };
});
vi.mock("../routes/pedidos-de-peca", async () => {
  const real = await vi.importActual<any>("../routes/pedidos-de-peca");
  return { ...real, aoExcluirPeca: (...a: any[]) => H.aoExcluirPeca(...a) };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));
vi.mock("../services/consultaDeEstoqueNaLiberacao", () => ({
  respostaDoEstoqueParaLiberar: vi.fn(async () => null),
  marcarRespostaAplicada: vi.fn(async () => {}),
}));

import { registerItemRoutes, CANCELAR_MAE_CANCELA_COMPLEMENTOS_NAO_PRODUZIDOS, complementoSemMaterial } from "../routes/items";
import { fraseDoZod, responderErro, ERRO_INTERNO } from "../erros";
import { REGUA_DE_PAPEIS } from "@shared/permissoes";
import { items, publicInsertItemSchema } from "@shared/schema";
import { getTableConfig } from "drizzle-orm/pg-core";
import { readFileSync } from "fs";
import path from "path";

type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const appFalso: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  appFalso[verbo] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs); return appFalso; };
}
registerItemRoutes(appFalso);

async function chamar(chave: string, ctx: { params?: any; body?: any; userRole?: string; userKit?: boolean } = {}) {
  const handlers = rotas.get(chave);
  if (!handlers) throw new Error(`Rota não registrada: ${chave}`);
  const req: any = { params: ctx.params ?? {}, body: ctx.body ?? {}, query: {}, headers: {}, userRole: ctx.userRole, userKit: ctx.userKit, userId: "u1", userName: "Maria", session: {} };
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

let mundo: { itens: Record<string, any>; eventos: Record<string, any>; vinculos: Record<string, string[]>; doEvento: Record<string, string[]> };
let criadas: any[];

const peca = (over: any = {}) => ({
  id: "p1", displayId: "#0500", eventId: "ev-1", type: "Pórtico", description: "Pórtico", quantity: 10,
  quantityProduced: null, reuseQty: 0, isReuse: false, conferredQty: 0, embaladaQty: 0, deliveredQty: 0,
  status: "awaiting_submission", skipApproval: false, deletedAt: null, parentItemId: null, kitRemessaId: null,
  observations: "Ilhós a cada 50 cm", motivoCancelamento: null, statusBeforeCancel: null,
  pedidoDePecaLinhaId: null, fileWidth: "2.00", fileHeight: "1.00", area: "2", visual: "1", calculatedM2: "20.00",
  material: "Lona", finish: "Ilhós", measurement: "2.00 × 1.00",
  ...over,
});

const LINHA_DO_LOTE = { eventId: "ev-1", type: "Pórtico", description: "x", quantity: 1, area: "9.00", visual: "9.00", material: "Lona", finish: "Ilhós", measurement: "3x3", calculatedM2: "9.00" };

beforeEach(() => {
  mundo = {
    itens: {},
    eventos: {
      "ev-1": { id: "ev-1", name: "COPA NORTE", status: "created", startDate: "2099-01-10", truckDepartureDate: new Date("2099-01-01T00:00:00Z") },
      "ev-2": { id: "ev-2", name: "COPA SUL", status: "created", startDate: "2099-02-10", truckDepartureDate: new Date("2099-02-01T00:00:00Z") },
      "ev-fim": { id: "ev-fim", name: "JÁ FOI", status: "created", startDate: "2020-01-10", truckDepartureDate: new Date("2020-01-01T00:00:00Z") },
    },
    vinculos: {},
    doEvento: { "ev-1": ["sp-a"], "ev-2": ["sp-a"] },
  };
  criadas = [];
  H.broadcast = vi.fn();
  H.createAuditLog = vi.fn(async () => {});
  H.createAuditLogsEmLote = vi.fn(async () => {});
  H.updateEventStatus = vi.fn(async () => {});
  H.aoExcluirPeca = vi.fn(async () => {});
  H.db.execute = vi.fn(async () => ({ rows: [] }));
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getItem = vi.fn(async (id: string) => mundo.itens[id]);
  s.getEvent = vi.fn(async (id: string) => mundo.eventos[id]);
  s.updateItem = vi.fn(async (id: string, dados: any) => (mundo.itens[id] = { ...mundo.itens[id], ...dados }));
  s.updateEvent = vi.fn(async () => ({}));
  s.createNotification = vi.fn(async (n: any) => ({ id: "n1", ...n }));
  s.createItem = vi.fn(async (dados: any) => { criadas.push(dados); return { id: "novo", displayId: "#0900", ...dados }; });
  s.createBulkItems = vi.fn(async (lista: any[]) => { criadas.push(...lista); return lista.map((d, i) => ({ id: `n${i}`, displayId: `#09${i}`, ...d })); });
  s.getLiveComplements = vi.fn(async (maeId: string) => Object.values(mundo.itens).filter((i: any) => i.parentItemId === maeId && !i.deletedAt));
  s.getItemsByEvent = vi.fn(async (eventId: string) => Object.values(mundo.itens).filter((i: any) => i.eventId === eventId && !i.deletedAt));
  s.getItemSponsors = vi.fn(async (itemId: string) => (mundo.vinculos[itemId] ?? []).map((sponsorId) => ({ itemId, sponsorId })));
  s.getEventSponsors = vi.fn(async (eventId: string) => (mundo.doEvento[eventId] ?? []).map((sponsorId) => ({ eventId, sponsorId })));
  s.getSponsor = vi.fn(async (id: string) => ({ id, name: id === "sp-b" ? "Bradesco" : "Aché" }));
  s.getAuditLogs = vi.fn(async () => []);
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. O lote
// ═════════════════════════════════════════════════════════════════════════════
describe("1 · POST /api/items/bulk: um evento por lote", () => {
  it("linha de outro evento é recusada com o número da linha — nada é criado", async () => {
    const r = await chamar("POST /api/items/bulk", { userRole: "solicitacao", body: { items: [LINHA_DO_LOTE, { ...LINHA_DO_LOTE, eventId: "ev-fim" }] } });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Linha 2: todas as peças do lote precisam ser do mesmo evento.");
    expect(H.storage.createBulkItems).not.toHaveBeenCalled();
  });

  it("evento fechado: 409 com code/reason (o cliente não precisa ler a frase)", async () => {
    const r = await chamar("POST /api/items/bulk", { userRole: "admin", body: { items: [{ ...LINHA_DO_LOTE, eventId: "ev-fim" }] } });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "EVENT_FINALIZED", reason: "realizado" });
  });

  it("a remessa do Kit no corpo do lote é descartada (sem a conferência do POST unitário)", async () => {
    const r = await chamar("POST /api/items/bulk", { userRole: "solicitacao", body: { items: [{ ...LINHA_DO_LOTE, kitRemessaId: "remessa-de-outro-evento" }] } });
    expect(r.status).toBe(201);
    expect(criadas[0].kitRemessaId).toBeUndefined();
    expect(H.updateEventStatus).toHaveBeenCalledWith("ev-1");
  });

  it("erro de validação sai em português, com a linha e o campo", async () => {
    const r = await chamar("POST /api/items/bulk", { userRole: "admin", body: { items: [LINHA_DO_LOTE, { ...LINHA_DO_LOTE, quantity: 0 }] } });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Linha 2: Campo Quantidade: precisa ser no mínimo 1");
  });

  it("lote vazio: frase humana", async () => {
    const r = await chamar("POST /api/items/bulk", { userRole: "admin", body: { items: [] } });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Nenhuma peça enviada — preencha pelo menos uma linha.");
  });

  it("POST unitário em evento fechado também devolve code/reason", async () => {
    const r = await chamar("POST /api/items", { userRole: "admin", body: { ...LINHA_DO_LOTE, eventId: "ev-fim" } });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("EVENT_FINALIZED");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. /edit
// ═════════════════════════════════════════════════════════════════════════════
describe("2 · PATCH /api/items/:id/edit saiu", () => {
  it("a rota não é registrada e a régua não a declara", () => {
    expect(rotas.has("PATCH /api/items/:id/edit")).toBe(false);
    expect(REGUA_DE_PAPEIS.some((r) => r.rota === "/api/items/:id/edit")).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. PATCH genérico por papel
// ═════════════════════════════════════════════════════════════════════════════
describe("3 · dispensar aprovação e reaproveitar pelo PATCH", () => {
  it("Atendimento e Arte não mudam skipApproval nem isReuse", async () => {
    for (const papel of ["atendimento", "arte"]) {
      mundo.itens.p1 = peca();
      const a = await chamar("PATCH /api/items/:id", { params: { id: "p1" }, userRole: papel, body: { skipApproval: true } });
      expect(a.status, papel).toBe(403);
      expect(a.body.error).toBe("Dispensar a aprovação do patrocinador é do admin e da Solicitação.");
      const b = await chamar("PATCH /api/items/:id", { params: { id: "p1" }, userRole: papel, body: { isReuse: true, reuseQty: 10 } });
      expect(b.status, papel).toBe(403);
      expect(b.body.error).toBe("Marcar reaproveitamento é do admin e da Solicitação.");
    }
    expect(mundo.itens.p1.skipApproval).toBe(false);
    expect(mundo.itens.p1.isReuse).toBe(false);
  });

  it("o form inteiro com o MESMO valor passa (Arte editando outro campo)", async () => {
    mundo.itens.p1 = peca();
    const r = await chamar("PATCH /api/items/:id", { params: { id: "p1" }, userRole: "arte", body: { skipApproval: false, isReuse: false, description: "Pórtico novo" } });
    expect(r.status).toBe(200);
    expect(mundo.itens.p1.description).toBe("Pórtico novo");
  });

  it("isReuse=true sem reuseQty é recusado; com a quantidade, grava as duas", async () => {
    mundo.itens.p1 = peca();
    const sem = await chamar("PATCH /api/items/:id", { params: { id: "p1" }, userRole: "solicitacao", body: { isReuse: true } });
    expect(sem.status).toBe(400);
    expect(sem.body.error).toMatch(/informe quantas unidades/);
    expect(mundo.itens.p1.isReuse).toBe(false);

    const demais = await chamar("PATCH /api/items/:id", { params: { id: "p1" }, userRole: "solicitacao", body: { isReuse: true, reuseQty: 11 } });
    expect(demais.status).toBe(400);

    const ok = await chamar("PATCH /api/items/:id", { params: { id: "p1" }, userRole: "admin", body: { isReuse: true, reuseQty: 10 } });
    expect(ok.status).toBe(200);
    expect(mundo.itens.p1).toMatchObject({ isReuse: true, reuseQty: 10 });

    const desliga = await chamar("PATCH /api/items/:id", { params: { id: "p1" }, userRole: "admin", body: { isReuse: false } });
    expect(desliga.status).toBe(200);
    expect(mundo.itens.p1).toMatchObject({ isReuse: false, reuseQty: 0 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Cancelar
// ═════════════════════════════════════════════════════════════════════════════
describe("4 · cancelar guarda o motivo à parte e leva os complementos sem material", () => {
  it("a decisão padrão está numa constante nomeada", () => {
    expect(CANCELAR_MAE_CANCELA_COMPLEMENTOS_NAO_PRODUZIDOS).toBe(true);
    expect(complementoSemMaterial({ quantityProduced: 0 })).toBe(true);
    expect(complementoSemMaterial({ quantityProduced: 2 })).toBe(false);
    expect(complementoSemMaterial({ conferredQty: 1 })).toBe(false);
  });

  it("observações intactas, motivo na coluna, evento recalculado", async () => {
    mundo.itens.p1 = peca();
    const r = await chamar("PATCH /api/items/:id/cancel", { params: { id: "p1" }, userRole: "solicitacao", body: { notes: "  cliente desistiu  " } });
    expect(r.status).toBe(200);
    expect(mundo.itens.p1).toMatchObject({
      status: "canceled",
      statusBeforeCancel: "awaiting_submission",
      motivoCancelamento: "cliente desistiu",
      observations: "Ilhós a cada 50 cm",
    });
    expect(H.updateEventStatus).toHaveBeenCalledWith("ev-1");
  });

  it("complemento sem material cai junto; o que tem material fica, e a resposta avisa", async () => {
    mundo.itens.p1 = peca({ status: "inProduction", quantityProduced: 4 });
    mundo.itens.c1 = peca({ id: "c1", displayId: "#0500-C1", parentItemId: "p1", status: "ready_for_production" });
    mundo.itens.c2 = peca({ id: "c2", displayId: "#0500-C2", parentItemId: "p1", status: "produced", quantityProduced: 3 });
    const r = await chamar("PATCH /api/items/:id/cancel", { params: { id: "p1" }, userRole: "admin", body: { notes: "evento reduziu" } });
    expect(r.status).toBe(200);
    expect(mundo.itens.c1.status).toBe("canceled");
    expect(mundo.itens.c1.motivoCancelamento).toBe("evento reduziu (junto com a peça #0500)");
    expect(mundo.itens.c2.status).toBe("produced");
    expect(r.body.complementosCancelados).toEqual(["#0500-C1"]);
    expect(r.body.complementosMantidos).toEqual(["#0500-C2"]);
    expect(r.body.aviso).toBe("O complemento #0500-C2 já tem material produzido e continua ativo — cancele à parte, se for o caso.");
  });

  it("peça que atendia uma solicitação: a solicitação volta a abrir (como na exclusão)", async () => {
    mundo.itens.p1 = peca({ pedidoDePecaLinhaId: "linha-1" });
    await chamar("PATCH /api/items/:id/cancel", { params: { id: "p1" }, userRole: "solicitacao", body: {} });
    expect(H.aoExcluirPeca).toHaveBeenCalledTimes(1);
    expect(H.aoExcluirPeca.mock.calls[0][2]).toBe("cancelada");
  });

  it("em lote: mesmo registro, observações intactas, complemento selecionado não é cancelado duas vezes", async () => {
    mundo.itens.p1 = peca();
    mundo.itens.c1 = peca({ id: "c1", displayId: "#0500-C1", parentItemId: "p1" });
    const r = await chamar("PATCH /api/items/bulk-cancel", { userRole: "solicitacao", body: { itemIds: ["p1", "c1"], notes: "sem verba" } });
    expect(r.status).toBe(200);
    expect(r.body.canceled).toBe(2);
    expect(r.body.complementosCancelados).toEqual([]);
    expect(mundo.itens.p1).toMatchObject({ status: "canceled", motivoCancelamento: "sem verba", observations: "Ilhós a cada 50 cm" });
    expect(H.updateEventStatus).toHaveBeenCalledWith("ev-1");
  });

  it("a coluna nova é aditiva: schema declara, SQL cria com IF NOT EXISTS, o conferidor a lista", () => {
    const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
    expect(getTableConfig(items).columns.some((c) => c.name === "motivo_cancelamento")).toBe(true);
    expect(ler("scripts/migracao-aditiva-producao.sql")).toContain("ALTER TABLE items ADD COLUMN IF NOT EXISTS motivo_cancelamento text;");
    expect(ler("scripts/migracao-aditiva-producao.mjs")).toContain("'motivo_cancelamento'");
    // A API pública de criação não escreve o motivo.
    expect(publicInsertItemSchema.safeParse({ ...LINHA_DO_LOTE, motivoCancelamento: "x" }).data).not.toHaveProperty("motivoCancelamento");
  });

  it("descancelar limpa o motivo", async () => {
    mundo.itens.p1 = peca({ status: "canceled", statusBeforeCancel: "awaiting_submission", motivoCancelamento: "engano" });
    const r = await chamar("PATCH /api/items/:id/uncancel", { params: { id: "p1" }, userRole: "admin" });
    expect(r.status).toBe(200);
    expect(mundo.itens.p1).toMatchObject({ status: "awaiting_submission", motivoCancelamento: null, observations: "Ilhós a cada 50 cm" });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Transferir
// ═════════════════════════════════════════════════════════════════════════════
describe("5 · transferir de evento", () => {
  it("complemento não troca de evento sozinho", async () => {
    mundo.itens.c1 = peca({ id: "c1", parentItemId: "p1" });
    const r = await chamar("POST /api/items/:id/transfer-event", { params: { id: "c1" }, userRole: "admin", body: { eventId: "ev-2" } });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("IS_COMPLEMENT");
  });

  it("mãe com complemento vivo também não", async () => {
    mundo.itens.p1 = peca();
    mundo.itens.c1 = peca({ id: "c1", displayId: "#0500-C1", parentItemId: "p1" });
    const r = await chamar("POST /api/items/:id/transfer-event", { params: { id: "p1" }, userRole: "admin", body: { eventId: "ev-2" } });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("HAS_COMPLEMENTS");
    expect(r.body.error).toContain("#0500-C1");
    expect(mundo.itens.p1.eventId).toBe("ev-1");
  });

  it("desliga da solicitação do evento de origem e avisa do patrocinador fora do destino", async () => {
    mundo.itens.p1 = peca({ pedidoDePecaLinhaId: "linha-1", pedidoDePecaId: "ped-1" });
    mundo.vinculos.p1 = ["sp-a", "sp-b"];
    const r = await chamar("POST /api/items/:id/transfer-event", { params: { id: "p1" }, userRole: "admin", body: { eventId: "ev-2" } });
    expect(r.status).toBe(200);
    expect(mundo.itens.p1).toMatchObject({ eventId: "ev-2", pedidoDePecaLinhaId: null, pedidoDePecaId: null, kitRemessaId: null });
    expect(H.aoExcluirPeca.mock.calls[0][2]).toBe("transferida de evento");
    expect(r.body.patrocinadoresFora).toEqual(["Bradesco"]);
    expect(r.body.avisos[0]).toBe('Bradesco não é patrocinador de "COPA SUL" — vincule ao evento ou tire da peça.');
  });

  it("destino fechado: code/reason", async () => {
    mundo.itens.p1 = peca();
    const r = await chamar("POST /api/items/:id/transfer-event", { params: { id: "p1" }, userRole: "admin", body: { eventId: "ev-fim" } });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "EVENT_FINALIZED", reason: "realizado" });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. Clonar
// ═════════════════════════════════════════════════════════════════════════════
describe("6 · clonar", () => {
  beforeEach(() => {
    mundo.itens.a = peca({ id: "a", eventId: "ev-2", displayId: "#0001", isReuse: true, reuseQty: 10 });
    mundo.itens.b = peca({ id: "b", eventId: "ev-2", displayId: "#0002", status: "canceled" });
    mundo.itens.c = peca({ id: "c", eventId: "ev-2", displayId: "#0001-C1", parentItemId: "a" });
  });

  it("clonar tudo deixa de fora cancelada e complemento, e zera o reaproveitamento", async () => {
    const r = await chamar("POST /api/events/:id/clone-items", { params: { id: "ev-1" }, userRole: "solicitacao", body: { sourceEventId: "ev-2" } });
    expect(r.status).toBe(201);
    expect(r.body.cloned).toBe(1);
    expect(r.body.deixadasDeFora).toBe(2);
    expect(criadas).toHaveLength(1);
    expect(criadas[0]).toMatchObject({ eventId: "ev-1", status: "draft", isReuse: false, reuseQty: 0 });
  });

  it("cancelada escolhida à mão vai; complemento escolhido não", async () => {
    const r = await chamar("POST /api/events/:id/clone-items", { params: { id: "ev-1" }, userRole: "admin", body: { sourceEventId: "ev-2", itemIds: ["b", "c"] } });
    expect(r.status).toBe(201);
    expect(r.body.cloned).toBe(1);
    expect(criadas[0].description).toBe("Pórtico");
  });

  it("só complementos: 400 dizendo por quê", async () => {
    const r = await chamar("POST /api/events/:id/clone-items", { params: { id: "ev-1" }, userRole: "admin", body: { sourceEventId: "ev-2", itemIds: ["c"] } });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/complementos ou canceladas/);
  });

  it("usuário do Kit não clona", async () => {
    const r = await chamar("POST /api/events/:id/clone-items", { params: { id: "ev-1" }, userRole: "solicitacao", userKit: true, body: { sourceEventId: "ev-2" } });
    expect(r.status).toBe(403);
    expect(H.storage.createBulkItems).not.toHaveBeenCalled();
  });

  it("destino fechado: code/reason", async () => {
    const r = await chamar("POST /api/events/:id/clone-items", { params: { id: "ev-fim" }, userRole: "admin", body: { sourceEventId: "ev-2" } });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("EVENT_FINALIZED");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. Importação — as travas do preview (o parser e o confirmar moram em
//    importacao-com-transacao.test.ts)
// ═════════════════════════════════════════════════════════════════════════════
describe("8 · o preview da planilha passa pelas mesmas travas do confirmar", () => {
  it("evento fechado: 409 antes de ler o arquivo", async () => {
    const r = await chamar("POST /api/events/:id/preview-xlsx", { params: { id: "ev-fim" }, userRole: "admin" });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("EVENT_FINALIZED");
  });
  it("sem permissão: 403", async () => {
    const r = await chamar("POST /api/events/:id/preview-xlsx", { params: { id: "ev-1" }, userRole: "grafica" });
    expect(r.status).toBe(403);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. Erros em português
// ═════════════════════════════════════════════════════════════════════════════
describe("9 · erros que chegam à tela", () => {
  it("ZodError vira 'Campo X: …'", () => {
    const s = z.object({ quantity: z.number().min(1), type: z.string(), items: z.array(z.string()).min(1) });
    const frase = (v: any) => { const r = s.safeParse(v); return r.success ? "" : fraseDoZod(r.error); };
    expect(frase({ quantity: 0, type: "a", items: ["x"] })).toBe("Campo Quantidade: precisa ser no mínimo 1");
    expect(frase({ quantity: 1, items: ["x"] })).toBe("Campo Tipo: é obrigatório");
    expect(frase({ quantity: "2", type: "a", items: ["x"] })).toBe("Campo Quantidade: precisa ser um número");
    expect(frase({ quantity: 1, type: "a", items: [] })).toBe("Campo Peças: escolha pelo menos um");
    // Mensagem escrita à mão no schema é a frase inteira.
    const custom = z.object({ eventId: z.string().min(1, "Informe o evento de destino") }).safeParse({ eventId: "" });
    expect(fraseDoZod((custom as any).error)).toBe("Informe o evento de destino");
  });

  it("o resto é 500 sem a mensagem interna", () => {
    const res: any = { status: (c: number) => { res.c = c; return res; }, json: (b: any) => { res.b = b; return res; } };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    responderErro(res, new Error('relation "items" does not exist'), "teste");
    expect(res.c).toBe(500);
    expect(res.b.error).toBe(ERRO_INTERNO);
    expect(JSON.stringify(res.b)).not.toContain("relation");
    log.mockRestore();
  });

  it("'Item not found' não sai mais em inglês", async () => {
    const r = await chamar("PATCH /api/items/:id/cancel", { params: { id: "nao-existe" }, userRole: "admin" });
    expect(r.status).toBe(404);
    expect(r.body.error).toBe("Peça não encontrada");
  });
});
