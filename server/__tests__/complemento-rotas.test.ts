// ─────────────────────────────────────────────────────────────────────────────
// FLUXO DE COMPLEMENTO — comportamento das ROTAS REAIS de server/routes/items.ts.
//
// Os handlers rodam de verdade: `registerItemRoutes` é chamado com um "app"
// falso que só GUARDA os handlers, e cada teste invoca o handler com req/res de
// mentira (mesmo estilo de middleware.test.ts). O que está mockado é só a
// borda: `../db` (transação), `../storage` (persistência) e os efeitos de
// `./shared` (broadcast, audit log, updateEventStatus). Nenhum teste toca
// banco, e toda a regra de negócio — bifurcação, piso físico, dedupe, retry,
// gates de papel, pré-condições de cancelamento — é código de produção.
//
// A REGRA CENTRAL, que estes testes existem para congelar:
//   enquanto a peça NÃO entrou em produção, aumentar é EDITAR a quantidade;
//   depois que entrou, aumentar é criar um COMPLEMENTO.
//   Reduzir é SEMPRE edição, com piso físico.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks de borda (hoisted: o objeto H é criado antes dos imports) ──────────
const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: { transaction: (async () => {}) as any },
  broadcast: (() => {}) as any,
  createAuditLog: (async () => {}) as any,
  updateEventStatus: (async () => {}) as any,
}));

vi.mock("../db", () => ({ db: H.db, pool: {} }));

vi.mock("../storage", async () => {
  // Os helpers puros (assetPrefix, assetSeqOf, isDisplayIdConflictError) são os
  // REAIS — é isDisplayIdConflictError que decide o retry testado abaixo.
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});

vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real,
    // Autenticação já é testada em middleware.test.ts; aqui interessa o gate
    // de PAPEL, que é inline nas rotas (canCreateItemsFor / userRole).
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
import { parseDisplayId } from "../storage";
import { auditLogs, notifications, items as itemsTable } from "@shared/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Harness: um "Express" que só coleciona handlers, e um invocador de rota.
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

interface Resposta {
  status: number;
  body: any;
  headers: Record<string, string>;
}

async function chamar(
  chave: string,
  ctx: { params?: any; body?: any; query?: any; userRole?: string; userId?: string; userName?: string } = {},
): Promise<Resposta> {
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
const CRIADOR = "user-criador";
const MOTIVO = "cliente confirmou dois pórticos extras para a ativação de sábado";

/**
 * O 1º argumento de createAuditLog é o ATOR (o próprio `req`), não mais um nome
 * solto: a linha grava userName E userId — o id é o que resiste a nome trocado
 * ou repetido. Espelha resolveActor() de server/routes/shared.ts.
 */
const atorDe = (a: any): { userName: string; userId: string | null } =>
  typeof a === "string"
    ? { userName: a.trim() || "Sistema", userId: null }
    : { userName: String(a?.userName ?? "").trim() || "Sistema", userId: a?.userId ?? null };

let mundo: { itens: Record<string, any>; eventos: Record<string, any> };
let txOps: { inserts: Array<{ table: any; vals: any }>; updates: Array<{ table: any; vals: any }> };
let broadcasts: any[];

function evento(over: Partial<any> = {}) {
  return {
    id: "ev-1",
    name: "COPA NORTE 2026",
    status: "created",
    priority: "alta",
    createdBy: CRIADOR,
    truckDepartureDate: new Date("2099-01-01T00:00:00Z"),
    franchise: null,
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
    deletedAt: null,
    observations: null,
    ...over,
  };
}

/** tx de mentira: registra inserts/updates e devolve linhas plausíveis. */
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
          const linha = { id: "linha-atualizada", quantity: 10, ...vals };
          const p: any = Promise.resolve([linha]);
          p.returning = async () => [linha];
          return p;
        },
      }),
    }),
  };
}

const logsDeAuditoriaNaTx = () =>
  txOps.inserts.filter((i) => i.table === auditLogs).map((i) => i.vals);
const notificacoesNaTx = () =>
  txOps.inserts.filter((i) => i.table === notifications).map((i) => i.vals);
const tiposDeBroadcast = () => broadcasts.map((b) => b.type);

beforeEach(() => {
  mundo = { itens: {}, eventos: { "ev-1": evento() } };
  txOps = { inserts: [], updates: [] };
  broadcasts = [];

  H.db.transaction = vi.fn(async (cb: any) => await cb(novoTx()));
  H.broadcast = vi.fn((msg: any) => { broadcasts.push(msg); });
  H.createAuditLog = vi.fn(async () => {});
  H.updateEventStatus = vi.fn(async () => {});

  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];

  s.getItem = vi.fn(async (id: string) => mundo.itens[id]);
  s.getEvent = vi.fn(async (id: string) => mundo.eventos[id]);
  s.getLiveComplements = vi.fn(async (parentId: string) =>
    Object.values(mundo.itens).filter((i: any) => i.parentItemId === parentId && !i.deletedAt));
  s.findRecentComplement = vi.fn(async () => undefined);
  s.getItemSponsors = vi.fn(async () => []);
  s.bulkSyncItemSponsors = vi.fn(async () => []);
  s.copyItemSponsorApprovals = vi.fn(async () => 0);
  s.updateItem = vi.fn(async (id: string, payload: any) => ({ ...mundo.itens[id], ...payload }));
  s.deleteItem = vi.fn(async () => true);
  s.createNotification = vi.fn(async (n: any) => ({ id: "notif-1", ...n }));
  s.createItem = vi.fn(async (data: any) => ({ id: "novo-1", displayId: "#0100", ...data }));
  s.updateEvent = vi.fn(async () => mundo.eventos["ev-1"]);
  s.getAssetsByOriginalItemId = vi.fn(async () => []);
  s.createInventoryAssets = vi.fn(async (rs: any[]) => rs.map((r, i) => ({ id: `at-${i}`, ...r })));

  // Numeração pelo MAIOR sufixo, como a query SQL do método real: varre TODAS
  // as linhas, inclusive as soft-deletadas (número cancelado não é reciclado).
  s.createComplementItemTx = vi.fn(async (_tx: any, parent: any, fields: any) => {
    const maxSeq = Object.values(mundo.itens)
      .filter((i: any) => typeof i.displayId === "string" && i.displayId.startsWith(`${parent.displayId}-C`))
      .reduce((m: number, i: any) => Math.max(m, parseDisplayId(i.displayId).seq), 0);
    const seq = maxSeq + 1;
    const filho = {
      ...peca(),
      id: `filho-${seq}`,
      displayId: `${parent.displayId}-C${seq}`,
      eventId: parent.eventId,
      type: parent.type,
      quantity: fields.quantity,
      calculatedM2: fields.calculatedM2,
      status: fields.status,
      parentItemId: parent.id,
      complementSeq: seq,
      complementReason: fields.complementReason,
      complementRequestedBy: fields.complementRequestedBy,
      complementRequestedAt: fields.complementRequestedAt,
      quantityProduced: null, reuseQty: 0, isReuse: false,
      conferredQty: 0, deliveredQty: 0, deletedAt: null,
    };
    mundo.itens[filho.id] = filho;
    return filho;
  });
});

const POST_COMPLEMENTO = "POST /api/items/:id/complement";
const DELETE_COMPLEMENTO = "DELETE /api/items/:id/complement";
const PATCH_ITEM = "PATCH /api/items/:id";
const DELETE_ITEM = "DELETE /api/items/:id";
const START_PRODUCTION = "PATCH /api/items/:id/start-production";

/** Chamada padrão: solicitante aumentando em 4 unidades, com motivo válido. */
const aumentar = (over: any = {}) => chamar(POST_COMPLEMENTO, {
  params: { id: "mae-1" },
  body: { quantity: 4, reason: MOTIVO, ...(over.body ?? {}) },
  userRole: over.userRole ?? "solicitacao",
  userId: over.userId ?? "user-sol",
  userName: over.userName ?? "Maria Silva",
});

// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/items/:id/complement — o caminho feliz", () => {
  beforeEach(() => { mundo.itens["mae-1"] = peca(); });

  it("201 com a peça-filha #0062-C1, 4 un., pronta para produção e ligada à mãe", async () => {
    const r = await aumentar();
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      displayId: "#0062-C1",
      quantity: 4,
      status: "ready_for_production",
      parentItemId: "mae-1",
      complementSeq: 1,
      complementReason: MOTIVO,
      complementRequestedBy: "Maria Silva",
    });
  });

  it("o filho nasce ZERADO no ciclo — o número da linha JÁ É o saldo a produzir", async () => {
    const r = await aumentar();
    expect(r.body.quantityProduced).toBeNull();
    expect(r.body.reuseQty).toBe(0);
    expect(r.body.conferredQty).toBe(0);
    expect(r.body.deliveredQty).toBe(0);
  });

  it("A MÃE NÃO RECEBE UM ÚNICO UPDATE — é o ponto inteiro do modelo", async () => {
    await aumentar();
    expect(H.storage.updateItem).not.toHaveBeenCalled();
    expect(txOps.updates.filter((u) => u.table === itemsTable)).toHaveLength(0);
    expect(mundo.itens["mae-1"]).toMatchObject({ quantity: 10, status: "delivered", deliveredQty: 10 });
  });

  it("grava audit log NA FILHA e NA MÃE (a ficha filtra por entityId)", async () => {
    await aumentar();
    const logs = logsDeAuditoriaNaTx();
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.action === "complement_created" && l.entityType === "item")).toBe(true);

    const naFilha = logs.find((l) => l.entityId !== "mae-1")!;
    const naMae = logs.find((l) => l.entityId === "mae-1")!;
    expect(naFilha.details).toContain("Complemento de #0062: +4 un.");
    expect(naFilha.details).toContain("Peça original permanece Entregue com 10 un.");
    expect(naFilha.details).toContain(`Motivo: ${MOTIVO}`);
    expect(naMae.details).toContain("Complemento #0062-C1 criado: +4 un.");
    expect(naMae.details).toContain("(contratado 10 → 14)");
    expect(naMae.details).toContain(`Motivo: ${MOTIVO}`);
  });

  it("notifica SÓ a Gráfica, com o motivo por extenso na mensagem", async () => {
    await aumentar();
    const [n] = notificacoesNaTx();
    expect(n.type).toBe("complementCreated");
    expect(n.targetRoles).toEqual(["grafica"]);
    expect(n.message).toContain("+4 un. em #0062 (Pórtico 6x3) — COPA NORTE 2026");
    expect(n.message).toContain(`Motivo: ${MOTIVO}`);
    expect(n.itemId).toBe("filho-1");
  });

  it("emite o broadcast semântico E um tipo já tratado no client (a Gráfica não pode ficar cega)", async () => {
    await aumentar();
    expect(tiposDeBroadcast()).toEqual([
      "item_complement_created", "item_approved", "notification_created",
    ]);
    const [semantico] = broadcasts;
    expect(semantico).toMatchObject({ parentId: "mae-1", parentDisplayId: "#0062", quantity: 4 });
  });

  it("copia patrocinadores e aprovações PRESERVANDO status (nunca inicializa pendentes)", async () => {
    H.storage.getItemSponsors = vi.fn(async () => [{ sponsorId: "sp-1" }, { sponsorId: "sp-2" }]);
    // A armadilha fica ARMADA: se alguém trocar a cópia por esta chamada, ela
    // criaria linhas 'pending' que viram cobrança FALSA na Gestão de Prazos,
    // numa peça que já está aprovada e liberada para produção.
    H.storage.initializeItemSponsorApprovals = vi.fn(async () => []);
    await aumentar();
    expect(H.storage.bulkSyncItemSponsors).toHaveBeenCalledWith("filho-1", ["sp-1", "sp-2"]);
    expect(H.storage.copyItemSponsorApprovals).toHaveBeenCalledWith("mae-1", "filho-1");
    expect(H.storage.initializeItemSponsorApprovals).not.toHaveBeenCalled();
  });

  it("sem patrocinadores na mãe, não tenta sincronizar lista vazia", async () => {
    await aumentar();
    expect(H.storage.bulkSyncItemSponsors).not.toHaveBeenCalled();
    expect(H.storage.copyItemSponsorApprovals).toHaveBeenCalledWith("mae-1", "filho-1");
  });

  it("falha ao copiar patrocinadores NÃO desfaz o complemento (é dado de apresentação)", async () => {
    H.storage.getItemSponsors = vi.fn(async () => { throw new Error("sponsors fora do ar"); });
    const r = await aumentar();
    expect(r.status).toBe(201);
    expect(r.body.displayId).toBe("#0062-C1");
  });

  it("recalcula o status do evento SEM resetar a prioridade, mesmo com evento concluído", async () => {
    // O POST /api/items normal reseta a prioridade quando o evento está
    // 'completed'. Aqui isso apagaria a prioridade de um evento em andamento
    // por causa de 4 unidades.
    mundo.eventos["ev-1"] = evento({ status: "completed", priority: "urgente" });
    const r = await aumentar();
    expect(r.status).toBe(201);
    expect(H.updateEventStatus).toHaveBeenCalledWith("ev-1");
    expect(H.storage.updateEvent).not.toHaveBeenCalled();
    expect(mundo.eventos["ev-1"].priority).toBe("urgente");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("POST complemento — metragem sempre derivada no servidor", () => {
  it("1º caminho: fórmula normal (4 × 6,10 × 3,10 = 75,64 m²)", async () => {
    mundo.itens["mae-1"] = peca();
    const r = await aumentar();
    expect(r.body.calculatedM2).toBe("75.64");
    expect(logsDeAuditoriaNaTx()[0].details).toContain("(75.64 m²)");
  });

  it("2º caminho: mãe do acervo antigo (sem dimensões) → rateio do m² dela", async () => {
    // 10 un. = 20,00 m² → 4 un. = 8,00 m².
    mundo.itens["mae-1"] = peca({ fileWidth: null, fileHeight: null, calculatedM2: "20.00" });
    const r = await aumentar();
    expect(r.body.calculatedM2).toBe("8.00");
  });

  it("3º caminho: sem dimensões e sem m² → 0.00 com a ressalva no audit log", async () => {
    // A coluna é NOT NULL: gravar "0.00" é a única saída, mas o log precisa
    // dizer que o número não é confiável.
    mundo.itens["mae-1"] = peca({ fileWidth: null, fileHeight: null, calculatedM2: "0.00" });
    const r = await aumentar();
    expect(r.body.calculatedM2).toBe("0.00");
    expect(logsDeAuditoriaNaTx()[0].details).toContain("(m² não derivável)");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("REGRA DE BIFURCAÇÃO — antes da produção edita, depois complementa", () => {
  // Esta lista é o CONTRATO que as duas cópias de COMPLEMENT_ALLOWED_STATUSES
  // (a do servidor, privada em routes/items.ts, e a do client, hoje em
  // components/aumentar-quantidade-dialog.tsx) prometem espelhar. Nenhuma das
  // duas é exportável para cá sem inflar a superfície pública, então o contrato
  // é fixado aqui e verificado CONTRA O COMPORTAMENTO da rota. Se o servidor
  // mudar a lista sem que o client mude, um destes casos vira vermelho.
  // As grafias legadas em português entram porque circulam no banco: um gate
  // que compara só com a grafia canônica simplesmente nunca dispara.
  const EM_PRODUCAO = ["inProduction", "em_producao", "produced", "produzido", "conferred", "delivered", "entregue"];
  const ANTES = ["draft", "requested", "awaiting_linking", "awaiting_submission", "awaiting_approval",
    "awaiting_final_review", "ready_for_production", "pronto_para_producao", "approved"];

  it.each(EM_PRODUCAO)("status '%s' JÁ entrou em produção → complemento (201)", async (status) => {
    mundo.itens["mae-1"] = peca({ status });
    const r = await aumentar();
    expect(r.status).toBe(201);
    expect(r.body.displayId).toBe("#0062-C1");
  });

  it.each(ANTES)("status '%s' ainda NÃO entrou em produção → 409 NOT_IN_PRODUCTION", async (status) => {
    mundo.itens["mae-1"] = peca({ status });
    const r = await aumentar();
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("NOT_IN_PRODUCTION");
    expect(r.body.status).toBe(status);
    expect(r.body.error).toContain("edite a quantidade normalmente");
    expect(H.storage.createComplementItemTx).not.toHaveBeenCalled();
  });

  it("o mesmo aumento, na MESMA peça, muda de caminho conforme o status — e só isso", async () => {
    mundo.itens["mae-1"] = peca({ status: "ready_for_production" });
    expect((await aumentar()).status).toBe(409);
    mundo.itens["mae-1"] = peca({ status: "inProduction", quantityProduced: 6 });
    expect((await aumentar()).status).toBe(201);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("POST complemento — recusas", () => {
  it("409 IS_COMPLEMENT: complemento de complemento viraria #0062-C1-C1", async () => {
    mundo.itens["filho-1"] = peca({
      id: "filho-1", displayId: "#0062-C1", parentItemId: "mae-1", complementSeq: 1, quantity: 4,
    });
    const r = await chamar(POST_COMPLEMENTO, {
      params: { id: "filho-1" }, body: { quantity: 2, reason: MOTIVO },
      userRole: "solicitacao", userId: "user-sol",
    });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("IS_COMPLEMENT");
    expect(r.body.parentItemId).toBe("mae-1");
    expect(r.body.error).toContain("Peça o aumento na peça original");
  });

  it("403 para a GRÁFICA — ela produz o que pedem, não pede", async () => {
    mundo.itens["mae-1"] = peca();
    const r = await aumentar({ userRole: "grafica", userId: "user-graf" });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("Sem permissão para aumentar a quantidade neste evento");
    expect(H.storage.createComplementItemTx).not.toHaveBeenCalled();
  });

  it("403 para um papel qualquer que não criou o evento", async () => {
    mundo.itens["mae-1"] = peca();
    const r = await aumentar({ userRole: "arte", userId: "user-arte" });
    expect(r.status).toBe(403);
  });

  // Regra do dono: mexer na quantidade de peça já produzida é EXCLUSIVO de
  // solicitacao e admin. Criar peça no evento que você mesmo criou continua
  // valendo (outra rota, outro predicado) — alterar o contrato de uma peça que
  // já virou material físico, não.
  it("403 para o CRIADOR do evento quando o papel dele não é solicitacao/admin", async () => {
    mundo.itens["mae-1"] = peca();
    const r = await aumentar({ userRole: "arte", userId: CRIADOR });
    expect(r.status).toBe(403);
    expect(H.storage.createComplementItemTx).not.toHaveBeenCalled();
  });

  it("201 para solicitacao mesmo sem ter criado o evento", async () => {
    mundo.itens["mae-1"] = peca();
    const r = await aumentar({ userRole: "solicitacao", userId: "user-sol" });
    expect(r.status).toBe(201);
  });

  it("201 para admin", async () => {
    mundo.itens["mae-1"] = peca();
    expect((await aumentar({ userRole: "admin", userId: "user-admin" })).status).toBe(201);
  });

  it("404 quando a peça não existe", async () => {
    const r = await aumentar();
    expect(r.status).toBe(404);
    expect(r.body.error).toBe("Peça não encontrada");
  });

  it("404 quando a peça está na lixeira (soft delete)", async () => {
    mundo.itens["mae-1"] = peca({ deletedAt: new Date() });
    expect((await aumentar()).status).toBe(404);
  });

  it("404 quando o evento sumiu", async () => {
    mundo.itens["mae-1"] = peca();
    mundo.eventos = {};
    const r = await aumentar({ userRole: "admin", userId: "user-admin" });
    expect(r.status).toBe(404);
    expect(r.body.error).toBe("Evento não encontrado");
  });

  it("503 MIGRATION_PENDING quando as colunas novas ainda não existem (42703)", async () => {
    H.storage.getItem = vi.fn(async () => {
      throw Object.assign(new Error('column "parent_item_id" does not exist'), { code: "42703" });
    });
    const r = await aumentar();
    expect(r.status).toBe(503);
    expect(r.body.code).toBe("MIGRATION_PENDING");
    expect(r.body.error).toContain("npm run db:push");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("POST complemento — validação do corpo (o motivo é obrigatório de verdade)", () => {
  beforeEach(() => { mundo.itens["mae-1"] = peca(); });

  it("400 com a mensagem exata quando o motivo tem menos de 10 caracteres", async () => {
    const r = await aumentar({ body: { reason: "urgente" } });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Explique o motivo (mín. 10 caracteres)");
  });

  it("400 quando o motivo é só espaço em branco disfarçando o tamanho", async () => {
    const r = await aumentar({ body: { reason: "      curto      " } });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Explique o motivo (mín. 10 caracteres)");
  });

  it("400 quando o motivo passa de 500 caracteres", async () => {
    const r = await aumentar({ body: { reason: "a".repeat(501) } });
    expect(r.status).toBe(400);
  });

  it("400 para quantidade 0, negativa, fracionária ou acima do teto", async () => {
    for (const quantity of [0, -3, 4.5, 10000]) {
      const r = await aumentar({ body: { quantity } });
      expect(r.status, `quantity=${quantity}`).toBe(400);
    }
    expect(H.storage.createComplementItemTx).not.toHaveBeenCalled();
  });

  it("nenhum efeito colateral quando a validação falha", async () => {
    await aumentar({ body: { reason: "x" } });
    expect(txOps.inserts).toHaveLength(0);
    expect(broadcasts).toHaveLength(0);
    expect(H.updateEventStatus).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("POST complemento — dedupe, numeração e corrida", () => {
  beforeEach(() => { mundo.itens["mae-1"] = peca(); });

  it("duplo clique em 60 s devolve 200 + X-Complement-Deduped, sem criar a segunda linha", async () => {
    const jaExiste = { id: "filho-1", displayId: "#0062-C1", quantity: 4, parentItemId: "mae-1" };
    H.storage.findRecentComplement = vi.fn(async () => jaExiste);
    const r = await aumentar();
    expect(r.status).toBe(200);
    expect(r.headers["X-Complement-Deduped"]).toBe("1");
    expect(r.body).toEqual(jaExiste);
    expect(H.storage.createComplementItemTx).not.toHaveBeenCalled();
    expect(broadcasts).toHaveLength(0);
  });

  it("o dedupe consulta a janela de 60 s com mãe + quantidade + motivo", async () => {
    await aumentar();
    expect(H.storage.findRecentComplement).toHaveBeenCalledWith("mae-1", 4, MOTIVO, 60);
  });

  it("DOIS AUMENTOS seguidos viram -C1 e -C2, cada um com seu motivo", async () => {
    const r1 = await aumentar();
    const r2 = await aumentar({ body: { quantity: 2, reason: "o patrocinador pediu mais duas na lateral" } });
    expect(r1.body.displayId).toBe("#0062-C1");
    expect(r2.body.displayId).toBe("#0062-C2");
    expect(r1.body.complementReason).toBe(MOTIVO);
    expect(r2.body.complementReason).toBe("o patrocinador pediu mais duas na lateral");
    // Contratado total derivado: 10 + 4 + 2 = 16, com a mãe intocada em 10.
    expect(mundo.itens["mae-1"].quantity).toBe(10);
    const filhos = Object.values(mundo.itens).filter((i: any) => i.parentItemId === "mae-1");
    expect(filhos.reduce((s: number, i: any) => s + i.quantity, 0)).toBe(6);
  });

  it("número CANCELADO não é reciclado: com #0062-C1 na lixeira, o próximo é -C2", async () => {
    mundo.itens["filho-1"] = peca({
      id: "filho-1", displayId: "#0062-C1", parentItemId: "mae-1",
      complementSeq: 1, quantity: 4, deletedAt: new Date(),
    });
    const r = await aumentar();
    expect(r.body.displayId).toBe("#0062-C2");
  });

  it("corrida real: 23505 na primeira transação → REPETE a transação inteira e vence", async () => {
    // Duas pessoas pedem o aumento da mesma peça no mesmo instante e ambas
    // calculam -C1. Na segunda volta o MAX já enxerga o -C1 alheio.
    const original = H.storage.createComplementItemTx;
    let tentativa = 0;
    H.storage.createComplementItemTx = vi.fn(async (...args: any[]) => {
      tentativa += 1;
      if (tentativa === 1) {
        // a transação concorrente gravou o -C1 primeiro
        mundo.itens["outro"] = peca({ id: "outro", displayId: "#0062-C1", parentItemId: "mae-1", complementSeq: 1 });
        throw Object.assign(new Error('duplicate key value violates unique constraint "items_display_id_unique"'), {
          code: "23505", constraint: "items_display_id_unique",
        });
      }
      return await (original as any)(...args);
    });

    const r = await aumentar();
    expect(tentativa).toBe(2);
    expect(r.status).toBe(201);
    expect(r.body.displayId).toBe("#0062-C2");
  });

  it("erro que NÃO é conflito de displayId não é repetido às cegas", async () => {
    H.storage.createComplementItemTx = vi.fn(async () => {
      throw Object.assign(new Error("connection reset"), { code: "08006" });
    });
    const r = await aumentar();
    expect(r.status).toBe(500);
    expect(H.storage.createComplementItemTx).toHaveBeenCalledTimes(1);
  });

  it("caminhão já saiu: o audit log carrega a marca, e a criação segue permitida", async () => {
    mundo.eventos["ev-1"] = evento({ truckDepartureDate: new Date("2020-01-01T00:00:00Z") });
    const r = await aumentar();
    expect(r.status).toBe(201);
    for (const log of logsDeAuditoriaNaTx()) {
      expect(log.details).toContain("[pós-saída do caminhão]");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("DELETE /api/items/:id/complement — a janela de arrependimento", () => {
  const filhoVirgem = (over: any = {}) => peca({
    id: "filho-1", displayId: "#0062-C1", parentItemId: "mae-1", complementSeq: 1,
    quantity: 4, status: "ready_for_production",
    quantityProduced: null, reuseQty: 0, conferredQty: 0, deliveredQty: 0,
    complementReason: MOTIVO, ...over,
  });

  const cancelar = (over: any = {}) => chamar(DELETE_COMPLEMENTO, {
    params: { id: "filho-1" },
    userRole: over.userRole ?? "solicitacao",
    userId: over.userId ?? "user-sol",
    userName: "Maria Silva",
  });

  beforeEach(() => {
    mundo.itens["mae-1"] = peca();
    mundo.itens["filho-1"] = filhoVirgem();
  });

  it("200: soft delete, dois audit logs, notificação para a Gráfica e broadcasts", async () => {
    const r = await cancelar();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      success: true, itemId: "filho-1", displayId: "#0062-C1", parentDisplayId: "#0062",
    });

    const soft = txOps.updates.filter((u) => u.table === itemsTable);
    expect(soft).toHaveLength(1);
    expect(soft[0].vals.deletedAt).toBeInstanceOf(Date);

    const logs = logsDeAuditoriaNaTx();
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.action === "complement_canceled")).toBe(true);
    expect(logs.map((l) => l.entityId).sort()).toEqual(["filho-1", "mae-1"]);
    expect(logs.find((l) => l.entityId === "mae-1")!.details).toContain("Contratado volta a 10 un.");

    const [n] = notificacoesNaTx();
    expect(n.type).toBe("complementCanceled");
    expect(n.targetRoles).toEqual(["grafica"]);
    expect(n.message).toContain("Complemento #0062-C1 cancelado — não produzir.");

    expect(tiposDeBroadcast()).toEqual([
      "item_complement_canceled", "item_deleted", "production_updated", "notification_created",
    ]);
    expect(H.updateEventStatus).toHaveBeenCalledWith("ev-1");
  });

  // A spec original deixava a Gráfica cancelar (é quem vê o pedido absurdo
  // primeiro). O dono fechou depois: cancelar é desfazer um aumento de
  // quantidade, e isso é só de solicitacao/admin.
  it("403 para a GRÁFICA — cancelar é mexer na quantidade", async () => {
    const r = await cancelar({ userRole: "grafica", userId: "user-graf" });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("Sem permissão para cancelar este complemento");
    expect(txOps.updates).toHaveLength(0);
  });

  it("403 para arte, mesmo sendo o criador do evento", async () => {
    const r = await cancelar({ userRole: "arte", userId: CRIADOR });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("Sem permissão para cancelar este complemento");
    expect(txOps.updates).toHaveLength(0);
  });

  it("409 NOT_A_COMPLEMENT numa peça normal (a exclusão dela tem outra rota)", async () => {
    const r = await chamar(DELETE_COMPLEMENTO, {
      params: { id: "mae-1" }, userRole: "admin", userId: "user-admin",
    });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("NOT_A_COMPLEMENT");
  });

  it.each([
    ["produzida", { quantityProduced: 2 }, "2 produzida(s)"],
    ["reaproveitada", { reuseQty: 1 }, "1 reaproveitada(s)"],
    ["conferida", { conferredQty: 3 }, "3 conferida(s)"],
    ["entregue", { deliveredQty: 4 }, "4 entregue(s)"],
  ])("409 COMPLEMENT_TOUCHED com uma unidade %s — material físico não se desfaz por botão", async (_n, campos, trecho) => {
    mundo.itens["filho-1"] = filhoVirgem(campos);
    const r = await cancelar();
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("COMPLEMENT_TOUCHED");
    expect(r.body.error).toContain(trecho);
    expect(txOps.updates).toHaveLength(0);
    expect(broadcasts).toHaveLength(0);
  });

  it("o 409 devolve os QUATRO números, para a tela explicar o que impede", async () => {
    mundo.itens["filho-1"] = filhoVirgem({ quantityProduced: 2, reuseQty: 1, conferredQty: 3, deliveredQty: 0 });
    const r = await cancelar();
    expect(r.body).toMatchObject({ produced: 2, reused: 1, conferred: 3, delivered: 0 });
  });

  it("404 quando o complemento não existe ou já está na lixeira", async () => {
    mundo.itens["filho-1"] = filhoVirgem({ deletedAt: new Date() });
    expect((await cancelar()).status).toBe(404);
    delete mundo.itens["filho-1"];
    expect((await cancelar()).status).toBe(404);
  });

  it("503 MIGRATION_PENDING no 42703", async () => {
    H.storage.getItem = vi.fn(async () => {
      throw Object.assign(new Error('column "parent_item_id" does not exist'), { code: "42703" });
    });
    const r = await cancelar();
    expect(r.status).toBe(503);
    expect(r.body.code).toBe("MIGRATION_PENDING");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("PATCH /api/items/:id — o caminho antigo, agora fechado", () => {
  const editar = (body: any, over: any = {}) => chamar(PATCH_ITEM, {
    params: { id: "mae-1" }, body,
    userRole: over.userRole ?? "solicitacao", userId: over.userId ?? "user-sol",
  });

  it("409 USE_COMPLEMENT ao AUMENTAR peça em produção, já com a diferença calculada", async () => {
    // Este era o caminho silencioso: 15 numa peça ENTREGUE com 10 unidades era
    // aceito, a peça continuava "Entregue" e ganhava 5 que ninguém imprimiu.
    mundo.itens["mae-1"] = peca({ status: "delivered", quantity: 10 });
    const r = await editar({ quantity: 15 });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      code: "USE_COMPLEMENT",
      itemId: "mae-1",
      displayId: "#0062",
      currentQuantity: 10,
      suggestedComplement: 5, // o modal abre pré-preenchido com isto
    });
    expect(H.storage.updateItem).not.toHaveBeenCalled();
  });

  it.each(["inProduction", "em_producao", "produced", "produzido", "conferred", "delivered", "entregue"])(
    "bloqueia o aumento também em '%s'", async (status) => {
      mundo.itens["mae-1"] = peca({ status, quantity: 10 });
      const r = await editar({ quantity: 12 });
      expect(r.status).toBe(409);
      expect(r.body.code).toBe("USE_COMPLEMENT");
    });

  it("ANTES da produção, aumentar continua sendo edição simples", async () => {
    mundo.itens["mae-1"] = peca({ status: "ready_for_production", quantity: 10, quantityProduced: null, conferredQty: 0, deliveredQty: 0 });
    const r = await editar({ quantity: 15 });
    expect(r.status).toBe(200);
    expect(H.storage.updateItem).toHaveBeenCalledWith("mae-1", expect.objectContaining({ quantity: 15 }));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("PATCH /api/items/:id — piso físico da redução", () => {
  const editar = (body: any) => chamar(PATCH_ITEM, {
    params: { id: "mae-1" }, body, userRole: "solicitacao", userId: "user-sol",
  });

  it("409 QUANTITY_FLOOR ao furar o piso, com o mínimo no corpo", async () => {
    mundo.itens["mae-1"] = peca({ status: "produced", quantity: 15, quantityProduced: 10, conferredQty: 0, deliveredQty: 0 });
    const r = await editar({ quantity: 8 });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("QUANTITY_FLOOR");
    expect(r.body.minimum).toBe(10);
    expect(r.body.error).toContain("Mínimo: 10.");
    expect(H.storage.updateItem).not.toHaveBeenCalled();
  });

  it("reduzir EXATAMENTE até o piso é permitido", async () => {
    mundo.itens["mae-1"] = peca({ status: "produced", quantity: 15, quantityProduced: 10, conferredQty: 0, deliveredQty: 0 });
    const r = await editar({ quantity: 10 });
    expect(r.status).toBe(200);
  });

  it("o REUSO não é piso: a redução passa e o reuso encolhe para caber (dono, 27/08)", async () => {
    // 6 impressas (piso) + 4 do galpão. Reduzir para 9 passa; o reuso vira 3
    // (9 − 6 impressas) — unidade reaproveitada é registro, não material novo.
    mundo.itens["mae-1"] = peca({ status: "inProduction", quantity: 15, quantityProduced: 6, reuseQty: 4, conferredQty: 0, deliveredQty: 0 });
    const r = await editar({ quantity: 9 });
    expect(r.status).toBe(200);
    const payload = H.storage.updateItem.mock.calls[0][1];
    expect(payload.reuseQty).toBe(3);
    expect(payload.isReuse).toBe(false);
    // e com 9 ≤ 6 impressas + 3 reuso, a peça em produção promove a Produzido
    expect(payload.status).toBe("produced");
  });

  it("mas o IMPRESSO continua piso: reduzir abaixo dele é 409", async () => {
    mundo.itens["mae-1"] = peca({ status: "inProduction", quantity: 15, quantityProduced: 6, reuseQty: 4, conferredQty: 0, deliveredQty: 0 });
    const r = await editar({ quantity: 5 });
    expect(r.status).toBe(409);
    expect(r.body.minimum).toBe(6);
  });

  it("peça toda reaproveitada (o caso #2345): piso 0, reduzir 3 → 1 passa e vira reuso 1", async () => {
    mundo.itens["mae-1"] = peca({ status: "produced", quantity: 3, quantityProduced: 0, reuseQty: 3, conferredQty: 0, deliveredQty: 0 });
    const r = await editar({ quantity: 1 });
    expect(r.status).toBe(200);
    const payload = H.storage.updateItem.mock.calls[0][1];
    expect(payload.reuseQty).toBe(1);
    expect(payload.isReuse).toBe(true); // 1 de 1: segue reuso TOTAL
  });

  it("o piso considera o CONFERIDO quando ele é o maior", async () => {
    mundo.itens["mae-1"] = peca({ status: "conferred", quantity: 15, quantityProduced: 3, reuseQty: 0, conferredQty: 8, deliveredQty: 0 });
    const r = await editar({ quantity: 7 });
    expect(r.status).toBe(409);
    expect(r.body.minimum).toBe(8);
  });

  it("o piso considera o ENTREGUE quando ele é o maior (peça fechada)", async () => {
    mundo.itens["mae-1"] = peca({ status: "delivered", quantity: 10, quantityProduced: 0, reuseQty: 0, conferredQty: 0, deliveredQty: 10 });
    const r = await editar({ quantity: 4 });
    expect(r.status).toBe(409);
    expect(r.body.minimum).toBe(10);
  });

  it("peça virgem (piso 0) reduz à vontade", async () => {
    mundo.itens["mae-1"] = peca({ status: "ready_for_production", quantity: 10, quantityProduced: null, conferredQty: 0, deliveredQty: 0 });
    expect((await editar({ quantity: 1 })).status).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("PATCH /api/items/:id — promoção só para cima e efeitos da redução", () => {
  const editar = (body: any) => chamar(PATCH_ITEM, {
    params: { id: "mae-1" }, body, userRole: "solicitacao", userId: "user-sol",
  });

  it("'produzi 10 das 15 e o cliente desistiu das outras 5' → a peça vira Produzido", async () => {
    mundo.itens["mae-1"] = peca({ status: "inProduction", quantity: 15, quantityProduced: 10, conferredQty: 0, deliveredQty: 0 });
    const r = await editar({ quantity: 10 });
    expect(r.status).toBe(200);
    expect(H.storage.updateItem).toHaveBeenCalledWith("mae-1", expect.objectContaining({ status: "produced" }));
  });

  it("NUNCA rebaixa: peça entregue reduzida continua entregue", async () => {
    mundo.itens["mae-1"] = peca({ status: "delivered", quantity: 15, quantityProduced: 10, conferredQty: 10, deliveredQty: 10 });
    const r = await editar({ quantity: 10 });
    expect(r.status).toBe(200);
    const payload = (H.storage.updateItem as any).mock.calls[0][1];
    expect(payload.status).toBeUndefined();
  });

  it("saldo ainda aberto não promove nada", async () => {
    mundo.itens["mae-1"] = peca({ status: "inProduction", quantity: 15, quantityProduced: 6, conferredQty: 0, deliveredQty: 0 });
    await editar({ quantity: 12 });
    const payload = (H.storage.updateItem as any).mock.calls[0][1];
    expect(payload.status).toBeUndefined();
  });

  it("a Gráfica é avisada da redução (notificação + invalidação da fila dela)", async () => {
    mundo.itens["mae-1"] = peca({ status: "inProduction", quantity: 15, quantityProduced: 6, conferredQty: 0, deliveredQty: 0 });
    await editar({ quantity: 10 });
    expect(H.storage.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: "quantityReduced", targetRoles: ["grafica"],
    }));
    const msg = (H.storage.createNotification as any).mock.calls[0][0].message;
    expect(msg).toContain("Quantidade reduzida: #0062");
    expect(msg).toContain("15 → 10 un.");
    // 'production_updated' é o único tipo que invalida /api/items/approved.
    expect(tiposDeBroadcast()).toContain("production_updated");
  });

  it("redução em peça que ainda NÃO entrou em produção não incomoda a Gráfica", async () => {
    mundo.itens["mae-1"] = peca({ status: "ready_for_production", quantity: 15, quantityProduced: null, conferredQty: 0, deliveredQty: 0 });
    await editar({ quantity: 10 });
    expect(H.storage.createNotification).not.toHaveBeenCalled();
    expect(tiposDeBroadcast()).not.toContain("production_updated");
  });

  it("o m² é recalculado quando a quantidade muda (era o número que congelava)", async () => {
    mundo.itens["mae-1"] = peca({ status: "ready_for_production", quantity: 10, quantityProduced: null, conferredQty: 0, deliveredQty: 0 });
    await editar({ quantity: 4 });
    // 4 × 6,10 × 3,10 = 75,64
    expect(H.storage.updateItem).toHaveBeenCalledWith("mae-1", expect.objectContaining({ calculatedM2: "75.64" }));
  });

  it("um PATCH só de observações NÃO reescreve o m² (que pode ter sido ajustado à mão)", async () => {
    mundo.itens["mae-1"] = peca({ status: "ready_for_production", calculatedM2: "999.99" });
    await editar({ observations: "conferir a lateral" });
    const payload = (H.storage.updateItem as any).mock.calls[0][1];
    expect(payload.calculatedM2).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("DELETE /api/items/:id — a mãe não some deixando filho órfão", () => {
  it("409 HAS_COMPLEMENTS listando o que precisa ser cancelado antes", async () => {
    // O ON DELETE SET NULL da FK só dispara em DELETE físico; aqui a exclusão é
    // SOFT, então o filho ficaria apontando para uma peça invisível — a linha
    // da Gráfica diria "COMPLEMENTO DE #0062" com #0062 fora de tudo.
    mundo.itens["mae-1"] = peca();
    mundo.itens["filho-1"] = peca({ id: "filho-1", displayId: "#0062-C1", parentItemId: "mae-1", quantity: 4 });
    const r = await chamar(DELETE_ITEM, { params: { id: "mae-1" }, userRole: "admin", userId: "user-admin" });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("HAS_COMPLEMENTS");
    expect(r.body.complements).toEqual([{ id: "filho-1", displayId: "#0062-C1" }]);
    expect(r.body.error).toContain("Cancele o complemento antes de excluir");
    expect(H.storage.deleteItem).not.toHaveBeenCalled();
  });

  it("complemento JÁ CANCELADO não segura mais a exclusão da mãe", async () => {
    mundo.itens["mae-1"] = peca();
    mundo.itens["filho-1"] = peca({ id: "filho-1", displayId: "#0062-C1", parentItemId: "mae-1", deletedAt: new Date() });
    const r = await chamar(DELETE_ITEM, { params: { id: "mae-1" }, userRole: "admin", userId: "user-admin" });
    expect(r.status).toBe(200);
    expect(H.storage.deleteItem).toHaveBeenCalledWith("mae-1");
  });

  it("peça sem complemento nenhum exclui normalmente", async () => {
    mundo.itens["mae-1"] = peca();
    const r = await chamar(DELETE_ITEM, { params: { id: "mae-1" }, userRole: "admin", userId: "user-admin" });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("DELETE /api/items/:id — alcance da solicitação (decisão do dono)", () => {
  // A solicitação esbarrava numa lista de status bloqueados que começava em
  // "awaiting_submission": o papel dono da peça não conseguia excluir nem o
  // próprio rascunho recém-criado. Agora o alcance é o MESMO do admin. É seguro
  // porque a exclusão é SOFT (deletedAt) e restaurável.
  const excluir = (userRole: string) =>
    chamar(DELETE_ITEM, { params: { id: "mae-1" }, userRole, userId: `user-${userRole}` });

  it("solicitação exclui o próprio rascunho (awaiting_submission)", async () => {
    mundo.itens["mae-1"] = peca({ status: "awaiting_submission", quantityProduced: 0, conferredQty: 0, deliveredQty: 0 });
    const r = await excluir("solicitacao");
    expect(r.status).toBe(200);
    expect(H.storage.deleteItem).toHaveBeenCalledWith("mae-1");
  });

  it("solicitação alcança TODOS os status que estavam travados, como o admin", async () => {
    const antesTravados = [
      "awaiting_submission", "awaiting_approval", "awaiting_sponsor_approval",
      "awaiting_finalization", "sponsor_approved", "awaiting_creator_review",
      "awaiting_final_review", "ready_for_production", "pronto_para_producao",
      "approved", "inProduction", "produced", "conferred", "delivered",
    ];
    for (const status of antesTravados) {
      mundo.itens["mae-1"] = peca({ status });
      const r = await excluir("solicitacao");
      expect(r.status, `status ${status}`).toBe(200);
    }
  });

  it("a exclusão continua SOFT e auditada — é o que torna a liberação segura", async () => {
    mundo.itens["mae-1"] = peca({ status: "produced" });
    await excluir("solicitacao");
    // deleteItem é a exclusão soft do storage (grava deletedAt); nenhum DELETE
    // físico é emitido por esta rota.
    expect(H.storage.deleteItem).toHaveBeenCalledWith("mae-1");
    expect(H.createAuditLog).toHaveBeenCalled();
    const [autor, acao, entidade, id, detalhe] = (H.createAuditLog as any).mock.calls[0];
    expect(atorDe(autor)).toEqual({ userName: "Maria Silva", userId: "user-solicitacao" });
    expect(acao).toBe("deleted");
    expect(entidade).toBe("item");
    expect(id).toBe("mae-1");
    expect(detalhe).toContain("#0062");
    expect(detalhe).toContain("solicitacao");
    expect(tiposDeBroadcast()).toContain("item_deleted");
  });

  it("a integridade do complemento é regra de DADO: vale também para a solicitação", async () => {
    mundo.itens["mae-1"] = peca();
    mundo.itens["filho-1"] = peca({ id: "filho-1", displayId: "#0062-C1", parentItemId: "mae-1", quantity: 4 });
    const r = await excluir("solicitacao");
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("HAS_COMPLEMENTS");
    expect(H.storage.deleteItem).not.toHaveBeenCalled();
  });

  it("quem não é admin nem solicitação continua tomando 403", async () => {
    for (const papel of ["grafica", "arte", "atendimento", "financeiro"]) {
      mundo.itens["mae-1"] = peca({ status: "awaiting_submission" });
      const r = await excluir(papel);
      expect(r.status, `papel ${papel}`).toBe(403);
      expect(r.body.error).toContain("Sem permissão para excluir");
    }
    expect(H.storage.deleteItem).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("PATCH start-production — lock otimista do modal incremental", () => {
  const produzir = (body: any) => chamar(START_PRODUCTION, {
    params: { id: "filho-1" }, body, userRole: "grafica", userId: "user-graf",
  });

  beforeEach(() => {
    // Complemento de 10 un. com 6 já lançadas por outro operador.
    mundo.itens["filho-1"] = peca({
      id: "filho-1", displayId: "#0062-C1", parentItemId: "mae-1",
      quantity: 10, quantityProduced: 6, reuseQty: 0,
      conferredQty: 0, deliveredQty: 0, status: "inProduction",
    });
  });

  it("409 PRODUCTION_CONFLICT quando alguém lançou produção nesse meio-tempo", async () => {
    // A tela abriu vendo 3; enquanto isso o colega lançou e o total virou 6.
    const r = await produzir({ quantityProduced: 5, expectedProduced: 3 });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("PRODUCTION_CONFLICT");
    expect(r.body.actualProduced).toBe(6);
    expect(H.db.transaction).not.toHaveBeenCalled();
  });

  it("passa quando o total lido bate com o gravado (modal incremental: 6 + 2 = 8)", async () => {
    const r = await produzir({ quantityProduced: 8, expectedProduced: 6 });
    expect(r.status).toBe(200);
    expect(H.db.transaction).toHaveBeenCalled();
    expect(txOps.updates[0].vals).toMatchObject({ status: "inProduction", quantityProduced: 8 });
  });

  it("campo é OPCIONAL — client antigo, sem expectedProduced, continua funcionando", async () => {
    const r = await produzir({ quantityProduced: 8 });
    expect(r.status).toBe(200);
  });

  it("regressão do total não vira erro, mas fica GRITADA no audit log", async () => {
    // Enquanto o contrato do campo for absoluto, quem produz 6 e digita 4
    // regride o total. Bloquear quebraria a correção legítima de digitação.
    const r = await produzir({ quantityProduced: 4, expectedProduced: 6 });
    expect(r.status).toBe(200);
    const log = logsDeAuditoriaNaTx()[0];
    expect(log.details).toContain("ATENÇÃO: total produzido REDUZIDO de 6 para 4 un.");
  });

  it("o teto continua sendo a quantidade DA LINHA — o complemento não alarga nada", async () => {
    const r = await produzir({ quantityProduced: 11, expectedProduced: 6 });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("excede as 10 un.");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("rotas de borda do recurso", () => {
  it("POST /api/items/:id/production responde 410 ROUTE_GONE (caminho paralelo aposentado)", async () => {
    const r = await chamar("POST /api/items/:id/production", {
      params: { id: "mae-1" }, body: { quantityProduced: 999 }, userRole: "grafica",
    });
    expect(r.status).toBe(410);
    expect(r.body.code).toBe("ROUTE_GONE");
    expect(r.body.error).toContain("start-production");
  });

  it("POST /api/items IGNORA um parentItemId forjado no corpo", async () => {
    // Parentesco só nasce em POST /api/items/:id/complement. Sem o recorte do
    // schema público, qualquer usuário penduraria uma peça como "complemento"
    // de outra — inclusive de outro evento.
    const r = await chamar("POST /api/items", {
      body: {
        eventId: "ev-1", type: "Banner", quantity: 2,
        area: "2", visual: "2", material: "Lona", finish: "Ilhós",
        measurement: "2x1", calculatedM2: "4.00",
        parentItemId: "mae-1", complementSeq: 7, complementReason: "forjado",
      },
      userRole: "solicitacao", userId: "user-sol",
    });
    expect(r.status).toBe(201);
    const payload = (H.storage.createItem as any).mock.calls[0][0];
    expect(payload.parentItemId).toBeUndefined();
    expect(payload.complementSeq).toBeUndefined();
    expect(payload.complementReason).toBeUndefined();
  });
});
