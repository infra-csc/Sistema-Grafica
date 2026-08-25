// ─────────────────────────────────────────────────────────────────────────────
// EVENTO FINALIZADO NÃO RECEBE TRABALHO — todas as rotas de escrita de peça.
//
// O QUE ORIGINOU ESTE ARQUIVO, relatado pelo dono com observação em produção:
// "vi situações de encerrar eventos e conseguirem aprovar ainda".
//
// Só a CRIAÇÃO estava barrada (event-encerramento-pecas.test.ts cobre as cinco
// portas). Todo o resto — aprovar, reprovar, liberar, dispensar, subir arquivo,
// produzir, editar, vincular patrocinador — continuava funcionando. As filas de
// trabalho ESCONDEM essas peças, mas esconder é filtro de CLIENTE: o Painel
// Geral e o Detalhe do Evento continuam mostrando a peça de propósito (regra do
// dono: registro não perde o passado), e era por ali que a ação acontecia.
//
// SEGUNDA RODADA: a primeira só cobriu items.ts e sponsors.ts (39 rotas). A
// rede de (5) não olhava para server/routes/events.ts, e POST
// /api/events/:id/items/submit — que promove peças em LOTE de rascunho para
// aguardando vinculação — escapou por não estar em nenhuma das duas listas.
// events.ts entrou em FONTES para que isso não se repita.
//
// O CRITÉRIO que este arquivo trava, e é ELE que alguém vai questionar depois:
//   BARRA o que faz o trabalho ANDAR. PERMITE o que ARRUMA A CASA.
//
// As três garantias, nesta ordem:
//   1. Toda rota que faz o trabalho andar devolve 409 — nos DOIS motivos
//      (encerrado à mão e já realizado), com a frase certa de cada um.
//   2. As EXCEÇÕES continuam passando: excluir peça, restaurar peça, cancelar
//      complemento, conferir e registrar entrega.
//   3. O controle: com o evento vivo, tudo o que foi barrado acima passa.
//
// A prova de (1) percorre uma TABELA, não uma lista de `it` escritos à mão: uma
// rota de escrita nova sem guarda é o modo de falha que se quer barrar, e a
// tabela é o lugar onde se percebe a ausência.
//
// Mesmo estilo de event-encerramento-pecas.test.ts: os handlers REAIS rodam; só
// a borda (db, storage, efeitos de ./shared e os serviços de planilha) é
// mockada.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: { transaction: (async () => {}) as any },
  broadcast: (() => {}) as any,
  createAuditLog: (async () => {}) as any,
  updateEventStatus: (async () => {}) as any,
  confirmImport: (async () => {}) as any,
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
    requireAdmin: (_req: any, _res: any, next: any) => next(),
    requireRole: () => (_req: any, _res: any, next: any) => next(),
    broadcast: (...a: any[]) => H.broadcast(...a),
    createAuditLog: (...a: any[]) => H.createAuditLog(...a),
    updateEventStatus: (...a: any[]) => H.updateEventStatus(...a),
  };
});
vi.mock("../cache", () => ({
  eventsCache: null,
  setEventsCache: vi.fn(),
  invalidateEventsCache: vi.fn(),
  invalidateAllCaches: vi.fn(),
}));
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({
  handlePreviewXlsx: vi.fn(),
  handleConfirmImport: (...a: any[]) => H.confirmImport(...a),
}));
vi.mock("../services/xlsxExport", () => ({
  handleExportItemsXlsx: vi.fn(),
  handleExportSelectedItemsXlsx: vi.fn(),
}));
vi.mock("../objectStorage", () => ({
  ObjectStorageService: class {
    async trySetObjectEntityAclPolicy(u: string) { return u; }
    normalizeObjectEntityPath(u: string) { return u; }
  },
}));

const { registerItemRoutes, EVENTO_ENCERRADO_ERRO, EVENTO_REALIZADO_ERRO } =
  await import("../routes/items");
const { registerSponsorRoutes } = await import("../routes/sponsors");
const { registerEventRoutes } = await import("../routes/events");

// ── Harness: um "Express" que só guarda handlers ─────────────────────────────
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
registerSponsorRoutes(appFalso);
registerEventRoutes(appFalso);

async function chamar(
  chave: string,
  ctx: { params?: any; body?: any; userRole?: string; userId?: string } = {},
): Promise<{ status: number; body: any }> {
  const handlers = rotas.get(chave);
  if (!handlers) throw new Error(`Rota não registrada: ${chave}`);

  const req: any = {
    params: ctx.params ?? {},
    body: ctx.body ?? {},
    query: {},
    headers: {},
    userRole: ctx.userRole ?? "admin",
    userId: ctx.userId ?? "user-1",
    userName: "Maria Silva",
    session: { userId: ctx.userId ?? "user-1", userRole: ctx.userRole ?? "admin" },
  };

  const res: any = { _status: 200, _body: undefined, _done: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.set = () => res;
  res.setHeader = () => res;
  res.json = (b: any) => { res._body = b; res._done = true; return res; };
  res.send = res.json;

  for (const h of handlers) {
    let chamouNext = false;
    await h(req, res, () => { chamouNext = true; });
    if (res._done || !chamouNext) break;
  }
  return { status: res._status, body: res._body };
}

// ── Mundo ────────────────────────────────────────────────────────────────────
// A data é fixada com fake timers: "realizado" é uma comparação com o dia de
// hoje no fuso do negócio, e um teste que dependesse do relógio real quebraria
// sozinho no dia seguinte ao ser escrito.
const HOJE = new Date("2026-08-14T12:00:00.000Z");

let mundo: { eventos: Record<string, any>; itens: Record<string, any> };

function evento(over: Record<string, any> = {}) {
  return {
    id: "ev-1",
    name: "COPA NORTE 2026",
    status: "created",
    priority: "alta",
    createdBy: "user-1",
    startDate: new Date("2026-12-20T00:00:00Z"),
    truckDepartureDate: new Date("2026-12-18T00:00:00Z"),
    ...over,
  };
}

/** Peça no estado exato que cada rota exige — o teto é sempre "passou o gate". */
function peca(over: Record<string, any> = {}) {
  return {
    id: "it-1", displayId: "#0062", eventId: "ev-1",
    type: "Pórtico 6x3", description: "Entrada principal",
    quantity: 2, area: "18.00", visual: "18.00",
    material: "Lona 440g", finish: "Ilhós", measurement: "6x3",
    calculatedM2: "36.00", fileWidth: "6.10", fileHeight: "3.10",
    status: "awaiting_sponsor_approval",
    quantityProduced: 0, reuseQty: 0, conferredQty: 0, deliveredQty: 0,
    isReuse: false, skipApproval: false,
    approvalThumbUrl: "https://obj/thumb.png", finalFileUrl: "https://obj/final.pdf",
    parentItemId: null, deletedAt: null, observations: null,
    conferencePhotoUrl: null, deliveryPhotoUrl: null,
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(HOJE);

  mundo = { eventos: { "ev-1": evento() }, itens: { "it-1": peca() } };

  H.db.transaction = vi.fn(async (cb: any) => {
    // Transação de mentira: devolve a peça "atualizada" para os handlers que
    // fazem UPDATE ... RETURNING dentro da tx.
    const tx = {
      update: () => ({ set: () => ({ where: () => ({ returning: async () => [{ ...mundo.itens["it-1"], status: "atualizado" }] }) }) }),
      insert: () => ({ values: () => ({ returning: async () => [{ id: "notif-1" }] }) }),
    };
    return await cb(tx);
  });
  H.broadcast = vi.fn(() => {});
  H.createAuditLog = vi.fn(async () => {});
  H.updateEventStatus = vi.fn(async () => {});
  H.confirmImport = vi.fn(async (_req: any, res: any) => res.status(200).json({ imported: 1 }));

  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getEvent = vi.fn(async (id: string) => mundo.eventos[id]);
  s.getItem = vi.fn(async (id: string) => mundo.itens[id]);
  s.getItemsByEvent = vi.fn(async (id: string) =>
    Object.values(mundo.itens).filter((i: any) => i.eventId === id));
  s.updateItem = vi.fn(async (id: string, d: any) => {
    mundo.itens[id] = { ...mundo.itens[id], ...d };
    return mundo.itens[id];
  });
  s.updateEvent = vi.fn(async (id: string, d: any) => {
    mundo.eventos[id] = { ...mundo.eventos[id], ...d };
    return mundo.eventos[id];
  });
  s.deleteItem = vi.fn(async () => true);
  s.restoreItem = vi.fn(async () => true);
  s.createItem = vi.fn(async (d: any) => ({ id: "novo-1", displayId: "#0100", ...d }));
  s.createBulkItems = vi.fn(async (rs: any[]) => rs.map((r, i) => ({ id: `novo-${i}`, ...r })));
  s.createNotification = vi.fn(async (n: any) => ({ id: "notif-1", ...n }));
  s.getLiveComplements = vi.fn(async () => []);
  s.findRecentComplement = vi.fn(async () => undefined);
  s.getItemSponsors = vi.fn(async () => [{ sponsorId: "sp-1" }]);
  s.getSponsor = vi.fn(async () => ({ id: "sp-1", name: "Patrocínio Norte" }));
  s.getItemSponsorApproval = vi.fn(async () => ({ id: "ap-1", status: "pending", sponsorId: "sp-1" }));
  s.getItemSponsorApprovals = vi.fn(async () => [{ id: "ap-1", status: "pending", sponsorId: "sp-1" }]);
  s.updateItemSponsorApproval = vi.fn(async (_id: string, d: any) => ({ id: "ap-1", ...d }));
  s.createItemSponsorApproval = vi.fn(async (d: any) => ({ id: "ap-1", ...d }));
  s.initializeItemSponsorApprovals = vi.fn(async () => {});
  s.bulkSyncItemSponsors = vi.fn(async () => {});
  s.addSponsorToItem = vi.fn(async (d: any) => ({ id: "is-1", ...d }));
  s.removeSponsorFromItem = vi.fn(async () => true);
  s.autoLinkByQuota = vi.fn(async () => 3);
  s.clearEventBookUrl = vi.fn(async () => {});
  s.setItemsBookUrl = vi.fn(async () => 1);
  s.getAssetsByOriginalItemId = vi.fn(async () => []);
  s.createInventoryAssets = vi.fn(async () => []);
  s.copyItemSponsorApprovals = vi.fn(async () => {});
  s.createComplementItemTx = vi.fn(async () => ({ id: "c-1", displayId: "#0062-C1" }));
  // POST /api/events/:id/items/submit (server/routes/events.ts): promove em
  // lote, sem passar por storage.updateItem.
  s.updateItemWithStatusCheck = vi.fn(async (id: string, _de: string, para: string) => {
    mundo.itens[id] = { ...mundo.itens[id], status: para };
    return mundo.itens[id];
  });
});

/** As duas origens da finalização, com a frase que cada uma deve devolver. */
const MOTIVOS = [
  {
    nome: "encerrado à mão",
    aplica: () => { mundo.eventos["ev-1"] = evento({ status: "closed" }); },
    frase: EVENTO_ENCERRADO_ERRO,
    reason: "encerrado",
  },
  {
    nome: "já realizado (a data passou)",
    // Véspera de hoje no fuso do negócio: "passou o dia" é comparação estrita.
    aplica: () => { mundo.eventos["ev-1"] = evento({ startDate: new Date("2026-08-13T00:00:00Z") }); },
    frase: EVENTO_REALIZADO_ERRO,
    reason: "realizado",
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// (1) O QUE FAZ O TRABALHO ANDAR — 409 nos dois motivos.
//
// `estado` deixa a peça no status que a rota exige, para provar que o 409 vem
// do EVENTO e não de um gate de status que já barraria de qualquer jeito.
// ─────────────────────────────────────────────────────────────────────────────
type Caso = {
  chave: string;
  params?: any;
  body?: any;
  userRole?: string;
  estado?: Record<string, any>;
};

const BARRADAS: Caso[] = [
  // ── Criação (já existiam; ficam aqui para a tabela ser a lista COMPLETA) ──
  { chave: "POST /api/items", body: { eventId: "ev-1", type: "Pórtico", description: "x", quantity: 1, area: "9.00", visual: "9.00", material: "Lona", finish: "Ilhós", measurement: "3x3", calculatedM2: "9.00" } },
  { chave: "POST /api/items/bulk", body: { items: [{ eventId: "ev-1", type: "Pórtico", description: "x", quantity: 1, area: "9.00", visual: "9.00", material: "Lona", finish: "Ilhós", measurement: "3x3", calculatedM2: "9.00" }] } },
  { chave: "POST /api/events/:id/confirm-import", params: { id: "ev-1" }, body: { items: [], fileName: "l.xlsx" } },
  { chave: "POST /api/events/:id/clone-items", params: { id: "ev-1" }, body: { sourceEventId: "ev-1" } },
  { chave: "POST /api/items/:id/complement", params: { id: "it-1" }, body: { quantity: 3, reason: "cliente confirmou dois pórticos extras" }, estado: { status: "produced" } },

  // ── Edição do contrato da peça ───────────────────────────────────────────
  { chave: "PATCH /api/items/:id", params: { id: "it-1" }, body: { quantity: 5 } },
  { chave: "PATCH /api/items/:id/edit", params: { id: "it-1" }, body: { quantity: 5 } },

  // ── Fluxo de aprovação ───────────────────────────────────────────────────
  { chave: "PATCH /api/items/:id/submit-for-approval", params: { id: "it-1" }, userRole: "arte", body: { approvalThumbUrl: "https://obj/t.png" }, estado: { status: "awaiting_submission" } },
  { chave: "PATCH /api/items/:id/sponsor-approve", params: { id: "it-1" }, userRole: "atendimento" },
  { chave: "PATCH /api/items/:id/dispense", params: { id: "it-1" }, userRole: "arte" },
  { chave: "POST /api/items/:id/sponsor-approvals/:sponsorId/approve", params: { id: "it-1", sponsorId: "sp-1" }, userRole: "atendimento" },
  { chave: "POST /api/items/:id/sponsor-approvals/:sponsorId/reject", params: { id: "it-1", sponsorId: "sp-1" }, userRole: "atendimento", body: { rejectionReason: "logo pequena" } },
  { chave: "POST /api/items/:id/sponsor-approvals/:sponsorId/revert", params: { id: "it-1", sponsorId: "sp-1" } },
  { chave: "POST /api/items/:id/sponsor-approvals/resubmit", params: { id: "it-1" }, userRole: "arte", body: { newThumbUrl: "https://obj/t2.png", sponsorIds: ["sp-1"] } },
  { chave: "POST /api/items/:id/initialize-sponsor-approvals", params: { id: "it-1" }, userRole: "arte" },

  // ── Arquivos (é o material que a Gráfica imprime) ────────────────────────
  { chave: "PATCH /api/items/:id/submit-final-file", params: { id: "it-1" }, userRole: "arte", body: { finalFileUrl: "https://obj/f.pdf" }, estado: { status: "sponsor_approved" } },
  { chave: "PATCH /api/items/:id/update-thumb", params: { id: "it-1" }, userRole: "arte", body: { approvalThumbUrl: "https://obj/novo.png" } },
  { chave: "PATCH /api/items/:id/update-final-file", params: { id: "it-1" }, userRole: "arte", body: { finalFileUrl: "https://obj/novo.pdf" } },

  // ── Revisão final ────────────────────────────────────────────────────────
  { chave: "PATCH /api/items/:id/creator-review", params: { id: "it-1" }, userRole: "solicitacao", estado: { status: "awaiting_final_review" } },
  { chave: "PATCH /api/items/:id/creator-reject", params: { id: "it-1" }, userRole: "solicitacao", estado: { status: "awaiting_final_review" } },
  { chave: "PATCH /api/items/:id/return-to-arte", params: { id: "it-1" }, userRole: "solicitacao", body: { notes: "trocar cor" }, estado: { status: "awaiting_final_review" } },
  { chave: "PATCH /api/items/bulk-return-to-arte", body: { itemIds: ["it-1"], notes: "trocar cor" }, userRole: "solicitacao", estado: { status: "awaiting_final_review" } },
  { chave: "PATCH /api/items/bulk-creator-reject", body: { itemIds: ["it-1"], notes: "refazer o layout" }, userRole: "solicitacao", estado: { status: "awaiting_final_review" } },

  // ── Cancelamento (caso duvidoso — barrado por decisão, ver a rota) ───────
  { chave: "PATCH /api/items/:id/cancel", params: { id: "it-1" }, userRole: "solicitacao", body: { notes: "cliente desistiu" } },
  { chave: "PATCH /api/items/bulk-cancel", body: { itemIds: ["it-1"], notes: "cliente desistiu" }, userRole: "solicitacao" },

  // ── Produção ─────────────────────────────────────────────────────────────
  { chave: "PATCH /api/items/:id/approve", params: { id: "it-1" }, userRole: "solicitacao" },
  { chave: "PATCH /api/items/:id/start-production", params: { id: "it-1" }, userRole: "grafica", body: { quantityProduced: 2 }, estado: { status: "ready_for_production" } },
  { chave: "POST /api/items/:id/mark-reuse", params: { id: "it-1" }, userRole: "grafica", body: { qty: 1 }, estado: { status: "ready_for_production" } },
  { chave: "POST /api/items/:id/correct-reuse", params: { id: "it-1" }, userRole: "grafica", body: { correctedReuseQty: 1 }, estado: { status: "produced", reuseQty: 2, isReuse: true } },

  // ── Book de aprovação (caso duvidoso — barrado, ver a rota) ──────────────
  { chave: "POST /api/events/:eventId/book", params: { eventId: "ev-1" }, userRole: "arte", body: { bookUrl: "https://obj/book.pdf", itemIds: ["it-1"] } },

  // ── Patrocinadores da peça (server/routes/sponsors.ts) ───────────────────
  { chave: "POST /api/events/:id/auto-link-sponsors", params: { id: "ev-1" } },
  { chave: "POST /api/items/:id/sponsors/sync", params: { id: "it-1" }, body: { sponsorIds: ["sp-1"] }, estado: { status: "awaiting_linking" } },
  { chave: "POST /api/items/:id/return-to-creation", params: { id: "it-1" }, estado: { status: "awaiting_linking" } },
  { chave: "POST /api/items/send-to-arte", body: { itemIds: ["it-1"] }, estado: { status: "awaiting_linking" } },
  { chave: "POST /api/items/:id/sponsors", params: { id: "it-1" }, body: { sponsorId: "sp-1" } },
  { chave: "DELETE /api/items/:itemId/sponsors/:sponsorId", params: { itemId: "it-1", sponsorId: "sp-1" } },

  // ── Envio em lote de rascunhos (server/routes/events.ts) ─────────────────
  // A ÚNICA escrita de peça deste arquivo — o commit que barrou as outras 39
  // rotas não tocou em events.ts, e esta ficou de fora.
  { chave: "POST /api/events/:id/items/submit", params: { id: "ev-1" }, userRole: "solicitacao", estado: { status: "draft" } },
];

describe.each(MOTIVOS)("evento $nome — nada faz o trabalho andar", (motivo) => {
  it.each(BARRADAS.map(c => [c.chave, c] as const))("%s → 409", async (_nome, caso) => {
    if (caso.estado) mundo.itens["it-1"] = peca(caso.estado);
    motivo.aplica();

    const r = await chamar(caso.chave, caso);

    expect(r.status).toBe(409);
    expect(r.body.error).toBe(motivo.frase);
    // Nada foi escrito: o 409 vem ANTES de qualquer UPDATE/INSERT.
    expect(H.storage.updateItem).not.toHaveBeenCalled();
    expect(H.storage.createItem).not.toHaveBeenCalled();
    expect(H.storage.createBulkItems).not.toHaveBeenCalled();
    expect(H.storage.updateItemWithStatusCheck).not.toHaveBeenCalled();
    expect(H.db.transaction).not.toHaveBeenCalled();
  });
});

describe("o corpo do 409 distingue as duas origens sem parsear a frase", () => {
  it.each(MOTIVOS.map(m => [m.nome, m] as const))("%s → code + reason", async (_n, motivo) => {
    motivo.aplica();
    const r = await chamar("PATCH /api/items/:id/sponsor-approve", {
      params: { id: "it-1" }, userRole: "atendimento",
    });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("EVENT_FINALIZED");
    expect(r.body.reason).toBe(motivo.reason);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (2) AS EXCEÇÕES — o que ARRUMA A CASA continua passando.
// Cada `it` carrega a justificativa, porque é ela que vai ser questionada.
// ─────────────────────────────────────────────────────────────────────────────
describe.each(MOTIVOS)("evento $nome — o que arruma a casa continua liberado", (motivo) => {
  it("EXCLUIR peça: barrar deixaria lixo preso num evento que ninguém mais mexe", async () => {
    motivo.aplica();

    const r = await chamar("DELETE /api/items/:id", { params: { id: "it-1" }, userRole: "solicitacao" });

    expect(r.status).toBe(200);
    expect(H.storage.deleteItem).toHaveBeenCalledWith("it-1");
  });

  it("RESTAURAR peça: é o desfazer da exclusão — sem ele, o engano vira permanente", async () => {
    motivo.aplica();

    const r = await chamar("POST /api/items/:id/restore", { params: { id: "it-1" } });

    expect(r.status).toBe(200);
    expect(H.storage.restoreItem).toHaveBeenCalledWith("it-1");
  });

  it("CANCELAR COMPLEMENTO: é desfazer, não avançar — e nada foi produzido", async () => {
    mundo.itens["it-1"] = peca({ id: "it-1", displayId: "#0062-C1", parentItemId: "mae-1" });
    mundo.itens["mae-1"] = peca({ id: "mae-1", displayId: "#0062" });
    motivo.aplica();

    const r = await chamar("DELETE /api/items/:id/complement", {
      params: { id: "it-1" }, userRole: "solicitacao",
    });

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("CONFERIR: fecha a conta do que já está impresso — não consegue produzir nada", async () => {
    mundo.itens["it-1"] = peca({ status: "produced", quantityProduced: 2 });
    motivo.aplica();

    const r = await chamar("POST /api/items/:id/confer", {
      params: { id: "it-1" }, userRole: "grafica",
      body: { conferencePhotoUrl: "https://obj/conf.jpg" },
    });

    expect(r.status).toBe(200);
    expect(mundo.itens["it-1"].conferredQty).toBe(2);
  });

  it("ENTREGAR: registrar o que fisicamente já saiu — o teto é o que foi conferido", async () => {
    mundo.itens["it-1"] = peca({ status: "conferred", quantityProduced: 2, conferredQty: 2 });
    motivo.aplica();

    const r = await chamar("PATCH /api/items/:id/deliver", {
      params: { id: "it-1" }, userRole: "grafica", body: { receivedBy: "João da portaria", photoUrl: "/objects/uploads/comprovante.jpg" },
    });

    expect(r.status).toBe(200);
    expect(H.db.transaction).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (3) O CONTROLE — com o evento vivo, tudo o que foi barrado acima passa.
//
// Sem esta parte a suíte provaria apenas que o servidor sabe dizer 409; não
// provaria que ele ainda sabe dizer sim.
// ─────────────────────────────────────────────────────────────────────────────
describe("evento VIVO — a guarda não pega nada de quem ainda tem trabalho", () => {
  it.each(BARRADAS.map(c => [c.chave, c] as const))("%s não devolve 409 de evento finalizado", async (_nome, caso) => {
    if (caso.estado) mundo.itens["it-1"] = peca(caso.estado);

    const r = await chamar(caso.chave, caso);

    // O status exato varia por rota (200/201/400/409 de outra regra). O que
    // NÃO pode acontecer é a recusa POR EVENTO FINALIZADO.
    expect(r.body?.code).not.toBe("EVENT_FINALIZED");
    expect(r.body?.error).not.toBe(EVENTO_ENCERRADO_ERRO);
    expect(r.body?.error).not.toBe(EVENTO_REALIZADO_ERRO);
  });

  it("no DIA do evento ele ainda conta — a regra é 'passou o dia', não 'chegou o dia'", async () => {
    // 14/08 é hoje no fuso do negócio: aprovar tem de funcionar.
    mundo.eventos["ev-1"] = evento({ startDate: new Date("2026-08-14T00:00:00Z") });

    const r = await chamar("PATCH /api/items/:id/sponsor-approve", {
      params: { id: "it-1" }, userRole: "atendimento",
    });

    expect(r.status).toBe(200);
    expect(mundo.itens["it-1"].status).toBe("sponsor_approved");
  });

  it("POST /api/events/:id/items/submit com evento vivo promove o rascunho de verdade (200)", async () => {
    mundo.itens["it-1"] = peca({ status: "draft" });

    const r = await chamar("POST /api/events/:id/items/submit", {
      params: { id: "ev-1" }, userRole: "solicitacao",
    });

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.count).toBe(1);
    expect(H.storage.updateItemWithStatusCheck).toHaveBeenCalledWith("it-1", "draft", "awaiting_linking");
  });

  it("evento SEM data de início nunca é finalizado pela data — cadastro ruim não vira bloqueio", async () => {
    mundo.eventos["ev-1"] = evento({ startDate: null });

    const r = await chamar("PATCH /api/items/:id/sponsor-approve", {
      params: { id: "it-1" }, userRole: "atendimento",
    });

    expect(r.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (4) O LOTE MISTO — a peça boa não paga pela ruim.
// ─────────────────────────────────────────────────────────────────────────────
describe("rotas de lote: item barrado entra na lista de erros, não derruba o envio", () => {
  it("bulk-return-to-arte com uma peça viva e uma finalizada processa a viva", async () => {
    mundo.eventos["ev-morto"] = evento({ id: "ev-morto", status: "closed" });
    mundo.itens["it-vivo"] = peca({ id: "it-vivo", status: "awaiting_final_review" });
    mundo.itens["it-morto"] = peca({ id: "it-morto", eventId: "ev-morto", status: "awaiting_final_review" });

    const r = await chamar("PATCH /api/items/bulk-return-to-arte", {
      body: { itemIds: ["it-vivo", "it-morto"], notes: "ajustar a cor do fundo" }, userRole: "solicitacao",
    });

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(1);
    expect(r.body.errors).toBe(1);
    expect(r.body.failedItemIds).toEqual(["it-morto"]);
    expect(mundo.itens["it-morto"].status).toBe("awaiting_final_review");
  });

  it("lote INTEIRO barrado vira 409 — 'não fiz nada' com status 200 é o silêncio de sempre", async () => {
    mundo.itens["it-1"] = peca({ status: "awaiting_final_review" });
    mundo.eventos["ev-1"] = evento({ status: "closed" });

    const r = await chamar("PATCH /api/items/bulk-return-to-arte", {
      body: { itemIds: ["it-1"], notes: "refazer o layout" }, userRole: "solicitacao",
    });

    expect(r.status).toBe(409);
    expect(r.body.code).toBe("EVENT_FINALIZED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (5) A REDE — rota de escrita NOVA não passa sem decisão.
//
// Este é o teste chato, e é o que impede a regressão de voltar: o buraco
// original não foi uma guarda escrita errado, foi uma guarda que ninguém
// lembrou de pôr. Lê o CÓDIGO-FONTE, na mesma disciplina de
// auditoria-autoria.test.ts — exercitar ~40 rotas contra um banco que esta casa
// não tem seria o caminho pior.
//
// Quem adicionar uma rota de escrita tem duas saídas, e as duas são explícitas:
// pôr a guarda, ou entrar nesta lista com o motivo escrito.
// ─────────────────────────────────────────────────────────────────────────────
const SEM_GUARDA_POR_DESENHO: Record<string, string> = {
  // ARRUMA A CASA — ver a justificativa longa em cada rota.
  "POST /api/items/:id/restore": "desfaz a exclusão; sem ela um clique errado vira permanente",
  "DELETE /api/items/:id": "limpeza SOFT e restaurável; barrar deixaria lixo preso no evento",
  "DELETE /api/items/:id/complement": "desfaz um aumento, e só quando nada foi produzido",
  // FECHA A CONTA do que fisicamente já existe.
  "POST /api/items/:id/confer": "exige a peça em Produzido: registra contagem, não produz nada",
  "PATCH /api/items/:id/deliver": "teto é o já conferido; a papelada da entrega chega depois do evento",
  "POST /api/items/labels-printed": "carimbo de que a etiqueta SAIU na impressora (labelPrintedAt + trilha) — registra um fato físico, não muda status nem produz nada; mesma família do confer/deliver, onde o papel anda mesmo com o evento travado",
  // Não mudam estado de peça.
  "POST /api/revisao/digest/enviar": "dispara o resumo da fila de revisão por e-mail; não grava peça nem evento (só a trilha do disparo) e não tem alvo de evento nenhum",
  "POST /api/events/:eventId/book/notify": "reenvia por e-mail o aviso de um book que JÁ existe; não grava peça nem evento (só a trilha do reenvio) — e é justamente em evento antigo que alguém pede o book de novo, então barrar fecharia a porta exatamente onde ela é útil",
  "POST /api/items/export-xlsx": "só lê e devolve arquivo",
  "POST /api/events/:id/preview-xlsx": "faz o parse da planilha sem salvar nada",
  "POST /api/items/:id/production": "rota aposentada, responde 410 sem tocar em nada",
  // sponsors.ts — cadastro de patrocinador e vínculo de EVENTO, não estado de
  // peça. Ficaram de fora do recorte desta guarda de propósito.
  "POST /api/sponsors": "cadastro global de patrocinador, não é peça",
  "PATCH /api/sponsors/:id": "cadastro global de patrocinador, não é peça",
  "DELETE /api/sponsors/:id": "cadastro global de patrocinador, não é peça",
  "PUT /api/events/:id/quota-rules": "regra de cota do evento, não estado de peça",
  "DELETE /api/events/:id/quota-rules/:quota": "regra de cota do evento, não estado de peça",
  "PUT /api/quota-rules/global": "regra de cota global, não estado de peça",
  "PATCH /api/events/:eventId/sponsors/:sponsorId": "cota do patrocinador NO EVENTO, não estado de peça",
  "POST /api/events/:id/sponsors": "vínculo patrocinador↔EVENTO, não estado de peça",
  "DELETE /api/events/:eventId/sponsors/:sponsorId": "vínculo patrocinador↔EVENTO, não estado de peça",

  // events.ts — nenhuma delas mexe em peça nem no CAMPO `status` do evento
  // (o único jeito de mudar `status` é close/reopen, abaixo). "Estado do
  // evento" aqui é literal: as duas rotas que gravam `status` no banco.
  "POST /api/events": "cria evento NOVO — não existe evento anterior para checar finalização",
  "PATCH /api/events/:id": "edita dados do evento (datas, nome, prazos) e explicitamente NÃO grava `status` (ver _statusIgnorado); é também o único caminho para corrigir um cadastro ruim (ex.: ano digitado errado) que tornou o evento 'realizado' por engano — barrar aqui fecharia a única saída de correção, já que 'realizado' não tem reabrir",
  "PATCH /api/events/:id/priority": "só reordena a fila de prioridade; evento finalizado já saiu das filas de trabalho por outro caminho (lifecycle), então não faz nenhum trabalho andar",
  "DELETE /api/events/:id": "exclusão do evento é limpeza (mesma categoria de excluir peça, que esta guarda já libera de propósito) — admin only",
  "POST /api/events/:id/close": "é a própria trava manual — precisa funcionar mesmo num evento já 'realizado' pela data, para alguém poder fechá-lo formalmente",
  "POST /api/events/:id/reopen": "é a válvula que desfaz o bloqueio; por definição nunca é barrada",
};

const RAIZ = path.resolve(__dirname, "..", "..");
const FONTES = ["server/routes/items.ts", "server/routes/sponsors.ts", "server/routes/events.ts"];

type RotaFonte = { chave: string; corpo: string };

function rotasDe(rel: string): RotaFonte[] {
  const src = fs.readFileSync(path.join(RAIZ, rel), "utf8");
  const re = /app\.(get|post|patch|put|delete)\(\s*["'`]([^"'`]+)/g;
  const achadas: Array<{ verbo: string; caminho: string; i: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) achadas.push({ verbo: m[1].toUpperCase(), caminho: m[2], i: m.index });
  return achadas.map((r, k) => ({
    chave: `${r.verbo} ${r.caminho}`,
    corpo: src.slice(r.i, achadas[k + 1]?.i ?? src.length),
  }));
}

const TEM_GUARDA = /barraEventoFinalizado|motivoEventoDaPeca|motivoEventoFechado|contadorDeBloqueio/;

describe("rede: nenhuma rota de escrita de peça fica sem decisão sobre evento finalizado", () => {
  for (const rel of FONTES) {
    it(`${rel} — toda escrita tem guarda ou está na lista justificada`, () => {
      const semDecisao = rotasDe(rel)
        .filter(r => !r.chave.startsWith("GET "))
        .filter(r => !TEM_GUARDA.test(r.corpo))
        .map(r => r.chave)
        .filter(chave => !(chave in SEM_GUARDA_POR_DESENHO));
      expect(semDecisao).toEqual([]);
    });
  }

  it("a lista de exceções não guarda rota que já não existe", () => {
    const existentes = new Set(FONTES.flatMap(rotasDe).map(r => r.chave));
    for (const chave of Object.keys(SEM_GUARDA_POR_DESENHO)) {
      expect(existentes.has(chave), `${chave} saiu do código — tire da lista`).toBe(true);
    }
  });

  it("toda rota da tabela BARRADAS existe mesmo — tabela não vira ficção", () => {
    for (const caso of BARRADAS) {
      expect(rotas.has(caso.chave), `${caso.chave} não está registrada`).toBe(true);
    }
  });
});
