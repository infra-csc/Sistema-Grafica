// ─────────────────────────────────────────────────────────────────────────────
// SOLICITAÇÃO DE PEÇA DO ATENDIMENTO — as rotas reais (server/routes/
// pedidos-de-peca.ts) sobre o banco de mentira de regras-fluxo-banco.ts, que
// AVALIA os WHERE: o "update condicional" (só se ainda está aberta, só se o
// ajuste ainda está pendente, só se a peça ainda está livre) roda de verdade.
//
// Vieram de casos de pedidos-de-peca.test.ts que só liam o fonte: papéis e
// rotas, várias peças validadas no servidor, o Atendimento só com as dele,
// cancelar só enquanto aberta, ajuste condicional e respondido uma vez, a
// peça criada atende uma peça solicitada só, o formato antigo, os avisos para
// quem pediu (e o sino/"marcar todas") e o prazo pela saída do caminhão.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { getTableName } from "drizzle-orm";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  storageReal: null as any,
  db: {} as Record<string, any>,
  broadcast: [] as any[],
  trilha: [] as string[],
}));

vi.mock("../db", () => ({ db: H.db, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  H.storageReal = real.storage; // o storage de verdade, sobre o banco de mentira
  return { ...real, storage: H.storage };
});
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real,
    broadcast: (m: any) => { H.broadcast.push(m); },
    createAuditLog: async (_r: any, _a: string, _t: string, _id: string, detalhe: string) => { H.trilha.push(detalhe); },
    createAuditLogsEmLote: async () => {},
    updateEventStatus: async () => {},
  };
});

import { items, linhasDoPedidoDePeca, notifications } from "@shared/schema";
import { MAX_PECAS_POR_SOLICITACAO, MIN_MOTIVO_DO_PEDIDO } from "@shared/pedidos-de-peca";
import { registerPedidosDePecaRoutes } from "../routes/pedidos-de-peca";
import { registerNotificationRoutes } from "../routes/notifications";
import { invalidateNotificationsCache } from "../cache";
import { capturarRotas } from "./rotas-de-mentira";
import { bancoDeMentira, type Tabelas } from "./regras-fluxo-banco";
import { mundoNovo, peca, sessao } from "./regras-fluxo-apoio";

const { rotas, chamar } = capturarRotas((app) => { registerPedidosDePecaRoutes(app); registerNotificationRoutes(app); });
const MOTIVO = "o evento reduziu o número de pórticos";
const AT1 = sessao("atendimento", { userId: "u-at1", userName: "Ana" });
const AT2 = sessao("atendimento", { userId: "u-at2", userName: "Beto" });
const SOL = sessao("solicitacao", { userId: "u-sol", userName: "Sol" });
const coluna = (tabela: any, nome: string) => getTableConfig(tabela).columns.find((c) => c.name === nome);

let t: Tabelas;
// A conversão do formato antigo roda UMA vez por processo: o registro do SQL
// atravessa os testes (a primeira leitura pode ter sido a de outro caso).
const sqlExecutado: string[] = [];
const linha = (over: Record<string, unknown>) => ({
  id: "l1", pedidoId: "ped1", ordem: 0, eventId: "ev-1", sponsorIds: [], quantidade: 2, observacao: "Pórtico da largada",
  referencias: [], status: "aberto", precisaAte: null, tipoDePeca: "Pórtico", largura: null, altura: null,
  resolvidoPor: null, resolvidoPorId: null, resolvidoEm: null, motivoRecusa: null, motivoCancelamento: null,
  ajusteStatus: null, ajusteTexto: null, ajustePedidoPor: null, ajustePedidoPorId: null, ajustePedidoEm: null,
  ajusteRespondidoPor: null, ajusteRespondidoEm: null, ajusteResposta: null, createdAt: new Date(), updatedAt: new Date(),
  ...over,
});
const pedido = (id: string, pedidoPorId: string) => ({ id, status: "aberto", pedidoPor: pedidoPorId, pedidoPorId, createdAt: new Date(), eventId: null, referencias: [] });

beforeEach(() => {
  const mundo = mundoNovo();
  t = {
    events: Object.values(mundo.eventos),
    sponsors: [{ id: "sp-a", name: "Aché" }, { id: "sp-b", name: "Bradesco" }],
    event_sponsors: [{ id: "es1", eventId: "ev-1", sponsorId: "sp-a" }],
    pedidos_de_peca: [pedido("ped1", "u-at1"), pedido("ped2", "u-at2")],
    pedidos_de_peca_linhas: [linha({ id: "l1", pedidoId: "ped1" }), linha({ id: "l2", pedidoId: "ped2" })],
    items: [peca({ id: "p1", displayId: "#0500", status: "draft" })],
    notifications: [],
  };
  for (const k of Object.keys(H.db)) delete H.db[k];
  Object.assign(H.db, bancoDeMentira(t, sqlExecutado));
  H.broadcast.length = 0; H.trilha.length = 0;
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getEvent = vi.fn(async (id: string) => t.events.find((e) => e.id === id));
  s.getItem = vi.fn(async (id: string) => t.items.find((i) => i.id === id));
  s.getItemSponsors = vi.fn(async () => []);
  s.addSponsorToItem = vi.fn(async () => ({}));
  s.updateItem = vi.fn(async () => ({}));
  s.createNotification = vi.fn(async (n: any) => { const feita = { id: `n${t.notifications.length + 1}`, isRead: false, createdAt: new Date(), ...n }; t.notifications.push(feita); return feita; });
  s.getAllNotifications = vi.fn(async () => t.notifications);
  invalidateNotificationsCache();
});

const linhaNoBanco = (id: string) => t.pedidos_de_peca_linhas.find((l) => l.id === id)!;
const NOVA = (over: Record<string, unknown> = {}) => ({ linhas: [{ eventId: "ev-1", quantidade: 2, observacao: "Pórtico da largada", ...over }] });

// ═════════════════════════════════════════════════════════════════════════════
describe("papéis e rotas", () => {
  const casos: Array<[string, Record<string, string>, string[], string[]]> = [
    ["GET /api/pedidos-de-peca", {}, ["admin", "solicitacao", "atendimento", "arte"], ["grafica"]],
    ["POST /api/pedidos-de-peca", {}, ["admin", "atendimento"], ["solicitacao", "arte", "grafica"]],
    ["PATCH /api/pedidos-de-peca/:id/cancelar", { id: "ped1" }, ["admin", "atendimento"], ["solicitacao", "arte", "grafica"]],
    ["PATCH /api/pedidos-de-peca/linhas/:linhaId/atender", { linhaId: "l1" }, ["admin", "solicitacao"], ["atendimento", "arte", "grafica"]],
    ["PATCH /api/pedidos-de-peca/linhas/:linhaId/recusar", { linhaId: "l1" }, ["admin", "solicitacao"], ["atendimento", "arte", "grafica"]],
    ["PATCH /api/pedidos-de-peca/linhas/:linhaId/cancelar", { linhaId: "l1" }, ["admin", "atendimento"], ["solicitacao", "arte", "grafica"]],
    ["PATCH /api/pedidos-de-peca/linhas/:linhaId/reabrir", { linhaId: "l1" }, ["admin", "atendimento", "solicitacao"], ["arte", "grafica"]],
    ["PATCH /api/pedidos-de-peca/linhas/:linhaId/ajuste", { linhaId: "l1" }, ["admin", "atendimento"], ["solicitacao", "arte", "grafica"]],
    ["PATCH /api/pedidos-de-peca/linhas/:linhaId/ajuste/responder", { linhaId: "l1" }, ["admin", "solicitacao"], ["atendimento", "arte", "grafica"]],
  ];

  it.each(casos)("%s: só os papéis dela passam do portão", async (rota, params, podem, naoPodem) => {
    for (const papel of naoPodem) expect((await chamar(rota, { sessao: sessao(papel, { userId: "u-at1" }), params })).status, papel).toBe(403);
    for (const papel of podem) expect((await chamar(rota, { sessao: sessao(papel, { userId: "u-at1" }), params })).status, papel).not.toBe(403);
  });

  it("ninguém EDITA uma solicitação: não existe PATCH genérico", () => {
    expect(rotas.has("PATCH /api/pedidos-de-peca/:id")).toBe(false);
    expect([...rotas.keys()].filter((k) => k.startsWith("PUT "))).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("várias peças, validadas no servidor", () => {
  it("tabela própria de linhas, com evento e patrocinadores por peça", () => {
    expect(getTableName(linhasDoPedidoDePeca)).toBe("pedidos_de_peca_linhas");
    expect(coluna(linhasDoPedidoDePeca, "sponsor_ids")).toMatchObject({ notNull: true, dataType: "array" });
    const fk = getTableConfig(linhasDoPedidoDePeca).foreignKeys.find((f) => f.reference().columns.some((c) => c.name === "event_id"));
    expect(fk?.onDelete).toBe("cascade");
  });

  it("recusa: peças demais, patrocinador fora do evento, patrocinadores demais, referência que não é do app", async () => {
    const pedir = (body: unknown) => chamar("POST /api/pedidos-de-peca", { sessao: AT1, body });
    const demais = await pedir({ linhas: Array.from({ length: MAX_PECAS_POR_SOLICITACAO + 1 }, () => NOVA().linhas[0]) });
    expect(demais.status).toBe(400);
    expect((demais.body as any).error).toBe(`No máximo ${MAX_PECAS_POR_SOLICITACAO} peças por solicitação`);

    const fora = await pedir(NOVA({ sponsorIds: ["sp-a", "sp-b"] }));
    expect(fora.status).toBe(400);
    expect((fora.body as any).error).toBe("Peça 1: há patrocinador que não é de COPA NORTE.");

    expect((await pedir(NOVA({ sponsorIds: Array.from({ length: 51 }, (_, i) => `sp-${i}`) }))).status).toBe(400);

    for (const ruim of ["javascript:alert(1)", "http://x.com/a.png"]) {
      const r = await pedir(NOVA({ referencias: [ruim] }));
      expect(r.status, ruim).toBe(400);
      expect((r.body as any).error).toBe("Referência inválida — envie a imagem pelo formulário");
    }
    expect(t.pedidos_de_peca).toHaveLength(2); // nada gravado
  });

  it("o prazo nasce da saída do caminhão de cada peça (ou da data informada)", async () => {
    await chamar("POST /api/pedidos-de-peca", { sessao: AT1, body: { linhas: [NOVA().linhas[0], { ...NOVA().linhas[0], eventId: "ev-2", precisaAte: "2099-01-20" }] } });
    const novas = t.pedidos_de_peca_linhas.slice(-2);
    expect(novas[0].precisaAte).toEqual(t.events.find((e) => e.id === "ev-1")!.truckDepartureDate);
    expect(novas[1].precisaAte).toEqual(new Date("2099-01-20T12:00:00Z"));
    expect(novas.map((l) => l.status)).toEqual(["aberto", "aberto"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("o Atendimento vê só as suas e só mexe nas suas", () => {
  it("a lista corta pelo autor; Solicitação vê todas", async () => {
    expect(((await chamar("GET /api/pedidos-de-peca", { sessao: AT1 })).body as any[]).map((p) => p.id)).toEqual(["ped1"]);
    expect(((await chamar("GET /api/pedidos-de-peca", { sessao: SOL })).body as any[]).map((p) => p.id).sort()).toEqual(["ped1", "ped2"]);
  });

  it("mexer na solicitação de outra pessoa responde 404 (como se não existisse)", async () => {
    const corpo = { motivo: MOTIVO, texto: "trocar a cor do fundo para azul" };
    linhaNoBanco("l2").status = "cancelado";
    expect((await chamar("PATCH /api/pedidos-de-peca/:id/cancelar", { sessao: AT1, params: { id: "ped2" }, body: corpo })).status).toBe(404);
    for (const acao of ["cancelar", "reabrir", "ajuste"]) {
      const r = await chamar(`PATCH /api/pedidos-de-peca/linhas/:linhaId/${acao}`, { sessao: AT1, params: { linhaId: "l2" }, body: corpo });
      expect(r.status, acao).toBe(404);
    }
    expect(linhaNoBanco("l2").status).toBe("cancelado");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("cancelar só enquanto aberta; ajuste condicional e respondido uma vez", () => {
  it("a solicitação inteira só se cancela com tudo aberto; a peça, só se ELA ainda está aberta", async () => {
    t.pedidos_de_peca_linhas.push(linha({ id: "l1b", pedidoId: "ped1", ordem: 1, status: "atendido" }));
    const inteira = await chamar("PATCH /api/pedidos-de-peca/:id/cancelar", { sessao: AT1, params: { id: "ped1" }, body: { motivo: MOTIVO } });
    expect(inteira.status).toBe(409);
    expect((inteira.body as any).error).toBe("Quem monta a lista já agiu nesta solicitação — cancele só as peças que ainda estão abertas.");

    const atendida = await chamar("PATCH /api/pedidos-de-peca/linhas/:linhaId/cancelar", { sessao: AT1, params: { linhaId: "l1b" }, body: { motivo: MOTIVO } });
    expect(atendida.status).toBe(409);
    const aberta = await chamar("PATCH /api/pedidos-de-peca/linhas/:linhaId/cancelar", { sessao: AT1, params: { linhaId: "l1" }, body: { motivo: MOTIVO } });
    expect(aberta.status).toBe(200);
    expect(linhaNoBanco("l1")).toMatchObject({ status: "cancelado", motivoCancelamento: MOTIVO });
    expect(linhaNoBanco("l1b").status).toBe("atendido");
  });

  it("o motivo tem mínimo", async () => {
    const r = await chamar("PATCH /api/pedidos-de-peca/linhas/:linhaId/cancelar", { sessao: AT1, params: { linhaId: "l1" }, body: { motivo: "curto" } });
    expect(r.status).toBe(400);
    expect((r.body as any).error).toBe(`Diga por que a peça está sendo cancelada (mínimo ${MIN_MOTIVO_DO_PEDIDO} caracteres).`);
  });

  it("ajuste: um pendente por vez, respondido uma vez só — e pedir de novo depois de respondido vale", async () => {
    linhaNoBanco("l1").status = "atendido";
    const ajuste = (texto: string) => chamar("PATCH /api/pedidos-de-peca/linhas/:linhaId/ajuste", { sessao: AT1, params: { linhaId: "l1" }, body: { texto } });
    const responder = (aceitar: boolean) => chamar("PATCH /api/pedidos-de-peca/linhas/:linhaId/ajuste/responder", { sessao: SOL, params: { linhaId: "l1" }, body: { aceitar, motivo: MOTIVO } });

    expect((await ajuste("trocar a cor do fundo para azul")).status).toBe(200);
    const segundo = await ajuste("e também aumentar a fonte");
    expect(segundo.status).toBe(409);
    expect((segundo.body as any).error).toBe("Já existe um ajuste esperando resposta de quem monta a lista.");

    expect((await responder(true)).status).toBe(200);
    expect(linhaNoBanco("l1").ajusteStatus).toBe("aceito");
    const deNovo = await responder(false);
    expect(deNovo.status).toBe(409);
    expect((deNovo.body as any).error).toBe("Não há ajuste esperando resposta nesta peça.");
    expect(t.notifications.map((n) => n.type)).toContain("pedidoAjusteAceito");

    // Respondido (não mais pendente): o WHERE deixa pedir outro.
    expect((await ajuste("agora trocar o texto do rodapé")).status).toBe(200);
    expect((await responder(false)).status).toBe(200);
    expect(t.notifications.at(-1)?.type).toBe("pedidoAjusteRecusado");
  });

  it("peça atendida não se reabre na mão", async () => {
    linhaNoBanco("l1").status = "atendido";
    const r = await chamar("PATCH /api/pedidos-de-peca/linhas/:linhaId/reabrir", { sessao: SOL, params: { linhaId: "l1" }, body: { motivo: MOTIVO } });
    expect(r.status).toBe(409);
    expect((r.body as any).error).toBe("Peça atendida não se reabre na mão — se a peça criada estiver errada, exclua-a e a solicitação volta a ficar aberta.");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("uma peça criada atende no máximo uma peça solicitada", () => {
  const atender = (linhaId: string) => chamar("PATCH /api/pedidos-de-peca/linhas/:linhaId/atender", { sessao: SOL, params: { linhaId }, body: { itemId: "p1" } });

  it("a coluna do vínculo existe e solta sozinha se a linha some", () => {
    const fk = getTableConfig(items).foreignKeys.find((f) => f.reference().columns.some((c) => c.name === "pedido_de_peca_linha_id"));
    expect(getTableName(fk!.reference().foreignTable)).toBe("pedidos_de_peca_linhas");
    expect(fk!.onDelete).toBe("set null");
  });

  it("liga a peça e marca a linha atendida; a mesma peça numa segunda solicitação é recusada", async () => {
    expect((await atender("l1")).status).toBe(200);
    expect(t.items[0]).toMatchObject({ pedidoDePecaId: "ped1", pedidoDePecaLinhaId: "l1" });
    expect(linhaNoBanco("l1").status).toBe("atendido");
    const outra = await atender("l2");
    expect(outra.status).toBe(409);
    expect((outra.body as any).error).toBe("A peça #0500 já atende outra solicitação.");
  });

  it("o vínculo é CONDICIONAL: quem leu a peça livre e perdeu a corrida recebe 409, sem gravar por cima", async () => {
    // A leitura (storage) viu a peça livre; o banco já a tem ligada a outra linha.
    H.storage.getItem = vi.fn(async () => ({ ...t.items[0], pedidoDePecaId: null, pedidoDePecaLinhaId: null }));
    Object.assign(t.items[0], { pedidoDePecaId: "ped2", pedidoDePecaLinhaId: "l2" });
    const r = await atender("l1");
    expect(r.status).toBe(409);
    expect((r.body as any).error).toBe("A peça #0500 acabou de ser ligada a outra solicitação.");
    expect(t.items[0].pedidoDePecaLinhaId).toBe("l2");
    expect(linhaNoBanco("l1").status).toBe("aberto");
  });

  it("evento finalizado barra", async () => {
    linhaNoBanco("l1").eventId = "ev-fim";
    t.items[0].eventId = "ev-fim";
    const r = await atender("l1");
    expect(r.status).toBe(409);
    expect(t.items[0].pedidoDePecaLinhaId ?? null).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("solicitações do formato antigo", () => {
  it("ganham a sua linha na primeira leitura, sem duplicar a de quem já tem", async () => {
    // SQL cru (INSERT … SELECT): o banco de mentira não o roda; confere-se a
    // guarda que vai ao Postgres — a integração com banco real é que o executa.
    await chamar("GET /api/pedidos-de-peca", { sessao: SOL });
    const conversao = sqlExecutado.find((q) => q.includes("INSERT INTO pedidos_de_peca_linhas"));
    expect(conversao).toMatch(/AND NOT EXISTS \(SELECT 1 FROM pedidos_de_peca_linhas l WHERE l\.pedido_id = p\.id\)/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("avisos para QUEM PEDIU", () => {
  it("recusar avisa o autor da solicitação (aviso individual)", async () => {
    expect(coluna(notifications, "target_user_id")).toBeDefined();
    await chamar("PATCH /api/pedidos-de-peca/linhas/:linhaId/recusar", { sessao: SOL, params: { linhaId: "l1" }, body: { motivo: MOTIVO } });
    expect(t.notifications.at(-1)).toMatchObject({ type: "pedidoRecusado", targetUserId: "u-at1", targetRoles: ["atendimento", "admin"] });
  });

  it("o sino mostra o aviso individual só a quem ele se destina", async () => {
    await chamar("PATCH /api/pedidos-de-peca/linhas/:linhaId/recusar", { sessao: SOL, params: { linhaId: "l1" }, body: { motivo: MOTIVO } });
    const doSino = async (quem: Record<string, unknown>) => ((await chamar("GET /api/notifications", { sessao: quem })).body as any[]).map((n) => n.type);
    expect(await doSino(AT1)).toEqual(["pedidoRecusado"]);
    invalidateNotificationsCache();
    expect(await doSino(AT2)).toEqual([]);
  });

  it("'marcar todas' não apaga o aviso individual de outra pessoa", async () => {
    t.notifications.push(
      { id: "x1", isRead: false, targetUserId: "u-at1", targetRoles: ["atendimento"] },
      { id: "x2", isRead: false, targetUserId: "u-at2", targetRoles: ["atendimento"] },
      { id: "x3", isRead: false, targetUserId: null, targetRoles: ["atendimento"] },
    );
    const marcadas = await H.storageReal.markAllNotificationsAsReadForRole(null, "u-at1");
    expect(marcadas).toBe(2);
    expect(t.notifications.map((n) => [n.id, n.isRead])).toEqual([["x1", true], ["x2", false], ["x3", true]]);
  });
});
