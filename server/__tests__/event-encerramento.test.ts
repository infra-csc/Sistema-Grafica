// ─────────────────────────────────────────────────────────────────────────────
// ENCERRAR / REABRIR EVENTO — a única ação HUMANA sobre o ciclo de vida.
//
// PORQUÊ ESTE ARQUIVO EXISTE: até aqui "acabou" era 100% derivado (todas as
// peças entregues, ou a data passou). O encerramento manual é a primeira coisa
// nesta base que uma pessoa DECIDE e o sistema tem de respeitar — inclusive
// contra a própria derivação. Três invariantes valem mais que o resto:
//
//   1. Encerrar NÃO mexe em peça nenhuma. É por isso que reabrir devolve o
//      evento exatamente ao estado em que ele estava.
//   2. `updateEventStatus` (chamado 8× de items.ts, mais sponsors e import de
//      planilha) NUNCA pode reescrever um evento encerrado. Sem essa guarda a
//      primeira mexida numa peça desfazia a decisão sem log e sem aviso.
//   3. O log de auditoria precisa dizer o NÚMERO real de peças que ficaram
//      para trás. "Evento encerrado" sem contagem não responde nenhuma
//      pergunta de auditoria.
//
// Mesmo estilo de complemento-rotas.test.ts: os handlers REAIS rodam; só a
// borda (storage e os efeitos de ./shared) é mockada.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/banco_nunca_acessado";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  broadcast: (() => {}) as any,
  createAuditLog: (async () => {}) as any,
}));

vi.mock("../db", () => ({ db: {}, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real,
    // Autenticação já é testada em middleware.test.ts; aqui interessa o gate de
    // PAPEL, que é inline na rota.
    requireAuth: (_req: any, _res: any, next: any) => next(),
    broadcast: (...a: any[]) => H.broadcast(...a),
    createAuditLog: (...a: any[]) => H.createAuditLog(...a),
  };
});

const { registerEventRoutes, enrichEvent, countOpenWork } = await import("../routes/events");
const { updateEventStatus, EVENT_CLOSED_STATUS } = await import("../routes/shared");

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
registerEventRoutes(appFalso);

async function chamar(
  chave: string,
  ctx: { params?: any; body?: any; userRole?: string; userName?: string } = {},
): Promise<{ status: number; body: any }> {
  const handlers = rotas.get(chave);
  if (!handlers) throw new Error(`Rota não registrada: ${chave}`);

  const req: any = {
    params: ctx.params ?? {},
    body: ctx.body ?? {},
    query: {},
    headers: {},
    userRole: ctx.userRole,
    userName: ctx.userName ?? "Maria Silva",
    session: { userRole: ctx.userRole, userName: ctx.userName },
  };

  const res: any = { _status: 200, _body: undefined, _done: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; res._done = true; return res; };
  res.send = res.json;

  for (const h of handlers) {
    let chamouNext = false;
    await h(req, res, () => { chamouNext = true; });
    if (res._done || !chamouNext) break;
  }
  return { status: res._status, body: res._body };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mundo em memória
// ─────────────────────────────────────────────────────────────────────────────
let mundo: { eventos: Record<string, any>; itens: Record<string, any[]> };
let broadcasts: any[];
let logs: any[][];

function evento(over: Record<string, any> = {}) {
  return {
    id: "ev-1",
    name: "COPA NORTE 2026",
    status: "created",
    priority: "alta",
    startDate: new Date("2026-03-15T00:00:00.000Z"),
    truckDepartureDate: new Date("2026-03-10T00:00:00.000Z"),
    ...over,
  };
}

let seq = 0;
const peca = (status: string) => ({ id: `it-${++seq}`, status });
const pecas = (status: string, n: number) => Array.from({ length: n }, () => peca(status));

beforeEach(() => {
  mundo = { eventos: { "ev-1": evento() }, itens: { "ev-1": [] } };
  broadcasts = [];
  logs = [];

  H.broadcast = vi.fn((m: any) => { broadcasts.push(m); });
  H.createAuditLog = vi.fn(async (...a: any[]) => { logs.push(a); });

  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getEvent = vi.fn(async (id: string) => mundo.eventos[id]);
  s.getItemsByEvent = vi.fn(async (id: string) => mundo.itens[id] ?? []);
  s.updateEvent = vi.fn(async (id: string, data: any) => {
    if (!mundo.eventos[id]) return undefined;
    mundo.eventos[id] = { ...mundo.eventos[id], ...data };
    return mundo.eventos[id];
  });
});

const detalhesDoLog = () => logs.map((a) => String(a[4] ?? ""));

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/events/:id/close — quem pode", () => {
  it("admin encerra", async () => {
    const r = await chamar("POST /api/events/:id/close", { params: { id: "ev-1" }, userRole: "admin" });

    expect(r.status).toBe(200);
    expect(mundo.eventos["ev-1"].status).toBe(EVENT_CLOSED_STATUS);
  });

  // Encerrar tira trabalho da vista de OUTRAS equipes (Gestão de Prazos e
  // filas). É a classe da exclusão, não a da edição — solicitação edita evento
  // e ainda assim não encerra.
  it.each(["solicitacao", "atendimento", "arte", "grafica", undefined])(
    "nega para o papel %s e NÃO grava nada",
    async (papel) => {
      const r = await chamar("POST /api/events/:id/close", { params: { id: "ev-1" }, userRole: papel as any });

      expect(r.status).toBe(403);
      expect(mundo.eventos["ev-1"].status).toBe("created");
      expect(H.storage.updateEvent).not.toHaveBeenCalled();
      expect(broadcasts).toHaveLength(0);
      expect(logs).toHaveLength(0);
    },
  );

  it("nega a REABERTURA para quem não é admin", async () => {
    mundo.eventos["ev-1"] = evento({ status: EVENT_CLOSED_STATUS });

    const r = await chamar("POST /api/events/:id/reopen", { params: { id: "ev-1" }, userRole: "solicitacao" });

    expect(r.status).toBe(403);
    expect(mundo.eventos["ev-1"].status).toBe(EVENT_CLOSED_STATUS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("encerrar não esconde trabalho — só para de cobrá-lo", () => {
  it("nenhuma peça muda de status", async () => {
    mundo.itens["ev-1"] = [...pecas("inProduction", 3), ...pecas("draft", 9), ...pecas("delivered", 8)];
    const antes = mundo.itens["ev-1"].map((i) => i.status);

    await chamar("POST /api/events/:id/close", { params: { id: "ev-1" }, userRole: "admin" });

    expect(mundo.itens["ev-1"].map((i) => i.status)).toEqual(antes);
  });

  it("devolve a contagem REAL para a confirmação e o toast", async () => {
    mundo.itens["ev-1"] = [
      ...pecas("inProduction", 3),
      ...pecas("draft", 9),
      ...pecas("delivered", 8),
      ...pecas("canceled", 2), // fora do funil: não é pendência nem entrega
    ];

    const r = await chamar("POST /api/events/:id/close", { params: { id: "ev-1" }, userRole: "admin" });

    expect(r.body.openCount).toBe(12);        // 3 em produção + 9 rascunho
    expect(r.body.inProductionCount).toBe(3);
    expect(r.body.deliveredCount).toBe(8);
    expect(r.body.activeItemCount).toBe(20);  // canceladas fora do denominador
  });

  it("o log de auditoria diz o número, não 'evento encerrado'", async () => {
    mundo.itens["ev-1"] = [...pecas("inProduction", 3), ...pecas("draft", 9), ...pecas("delivered", 8)];

    await chamar("POST /api/events/:id/close", { params: { id: "ev-1" }, userRole: "admin", userName: "João Diretor" });

    expect(logs).toHaveLength(1);
    expect(logs[0][0]).toBe("João Diretor"); // autor; a hora vem do createdAt da linha
    expect(logs[0][2]).toBe("event");
    const detalhe = detalhesDoLog()[0];
    expect(detalhe).toContain("ENCERRADO manualmente");
    expect(detalhe).toContain("12 peças continuam em aberto");
    expect(detalhe).toContain("3 em produção");
  });

  it("evento sem peça alguma é encerrável e o log diz isso", async () => {
    const r = await chamar("POST /api/events/:id/close", { params: { id: "ev-1" }, userRole: "admin" });

    expect(r.status).toBe(200);
    expect(detalhesDoLog()[0]).toContain("não tinha nenhuma peça");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("reversibilidade", () => {
  it("reabrir devolve o evento à derivação (status 'created', nunca 'completed')", async () => {
    mundo.itens["ev-1"] = pecas("delivered", 4);
    await chamar("POST /api/events/:id/close", { params: { id: "ev-1" }, userRole: "admin" });

    const r = await chamar("POST /api/events/:id/reopen", { params: { id: "ev-1" }, userRole: "admin" });

    expect(r.status).toBe(200);
    // "created" e não "completed": a partir daqui quem manda é a derivação de
    // novo — carimbar concluído aqui seria a mentira que esta base já corrigiu.
    expect(mundo.eventos["ev-1"].status).toBe("created");
  });

  it("registra a reabertura no log, com autor", async () => {
    mundo.eventos["ev-1"] = evento({ status: EVENT_CLOSED_STATUS });
    mundo.itens["ev-1"] = pecas("inProduction", 2);

    await chamar("POST /api/events/:id/reopen", { params: { id: "ev-1" }, userRole: "admin", userName: "Ana Coordenação" });

    expect(logs[0][0]).toBe("Ana Coordenação");
    expect(detalhesDoLog()[0]).toContain("REABERTO");
    expect(detalhesDoLog()[0]).toContain("2 peças em aberto");
  });

  it("encerrar duas vezes é 409 — e não gera log nem broadcast duplicado", async () => {
    mundo.eventos["ev-1"] = evento({ status: EVENT_CLOSED_STATUS });

    const r = await chamar("POST /api/events/:id/close", { params: { id: "ev-1" }, userRole: "admin" });

    expect(r.status).toBe(409);
    expect(broadcasts).toHaveLength(0);
    expect(logs).toHaveLength(0);
  });

  it("reabrir o que não está encerrado é 409", async () => {
    // O fixture nasce com data de MARÇO, que já passou — e desde que a
    // reabertura passou a valer também para a trava por data, um evento
    // passado é legitimamente reabrível. Para medir o que este teste mede
    // ("não há o que reabrir"), o evento precisa estar de fato em jogo.
    mundo.eventos["ev-1"].startDate = new Date("2027-01-01T00:00:00.000Z");
    const r = await chamar("POST /api/events/:id/reopen", { params: { id: "ev-1" }, userRole: "admin" });

    expect(r.status).toBe(409);
  });

  it("reabrir evento travado pela DATA agora é permitido", async () => {
    // A regra mudou por decisão do dono: a data continua encerrando sozinha,
    // mas a reabertura à mão vence. Antes esta chamada devolvia 409 e a única
    // saída era encerrar o evento só para poder reabri-lo — a dança que o
    // dono executou antes de reclamar.
    mundo.eventos["ev-1"].startDate = new Date("2026-03-15T00:00:00.000Z");
    mundo.eventos["ev-1"].status = "created";

    const r = await chamar("POST /api/events/:id/reopen", { params: { id: "ev-1" }, userRole: "admin" });

    expect(r.status).toBe(200);
    // A licença fica gravada: é ela que a regra compara com o dia do evento.
    expect(mundo.eventos["ev-1"].reopenedAt).toBeInstanceOf(Date);
  });

  it("404 quando o evento não existe", async () => {
    const r = await chamar("POST /api/events/:id/close", { params: { id: "ev-999" }, userRole: "admin" });

    expect(r.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("broadcast: as outras abas precisam saber", () => {
  it("encerrar e reabrir emitem tipos próprios com eventId no topo", async () => {
    await chamar("POST /api/events/:id/close", { params: { id: "ev-1" }, userRole: "admin" });
    await chamar("POST /api/events/:id/reopen", { params: { id: "ev-1" }, userRole: "admin" });

    expect(broadcasts.map((b) => b.type)).toEqual(["event_closed", "event_reopened"]);
    // `eventId` no topo: o handler do cliente invalida ['/api/events'] e
    // ['/api/events', eventId] sem precisar cavar o objeto. E `event_` é o
    // prefixo que dispara a invalidação de '/api/prazos' no use-websocket.
    expect(broadcasts.every((b) => b.eventId === "ev-1")).toBe(true);
    expect(broadcasts.every((b) => b.type.startsWith("event_"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("o encerramento manual sobrepõe a derivação", () => {
  const HOJE = Date.UTC(2026, 1, 5); // 05/02/2026 — antes do evento

  it("evento encerrado com TUDO entregue não vira 'Concluído'", () => {
    const r = enrichEvent(evento({ status: EVENT_CLOSED_STATUS }), pecas("delivered", 5), [], HOJE);

    expect(r.lifecycle).toBe("manually_closed");
    expect(r.manuallyClosed).toBe(true);
    expect(r.status).toBe(EVENT_CLOSED_STATUS);
    // allDelivered continua verdadeiro: o fato não some, só deixa de mandar.
    expect(r.allDelivered).toBe(true);
  });

  it("evento encerrado com o dia passado não vira 'Realizado com pendências'", () => {
    // O dia do evento já passou e há peça aberta: sem o encerramento manual
    // isto seria `realizado`, o selo de cobrança. Encerrar é decisão de gente
    // e vence a data — inclusive porque só ela tem volta (reabrir).
    const depois = Date.UTC(2026, 2, 20);
    const r = enrichEvent(evento({ status: EVENT_CLOSED_STATUS }), pecas("draft", 3), [], depois);

    expect(r.eventHasPassed).toBe(true);
    expect(r.lifecycle).toBe("manually_closed");
  });

  it("evento encerrado não tem próximo marco — não há prazo a cobrar", () => {
    const r = enrichEvent(evento({ status: EVENT_CLOSED_STATUS }), pecas("draft", 3), [], HOJE);

    expect(r.nextMilestone).toBeNull();
  });

  it("evento vivo continua exatamente como antes", () => {
    const r = enrichEvent(evento(), pecas("draft", 3), [], HOJE);

    expect(r.manuallyClosed).toBe(false);
    expect(r.lifecycle).toBe("active");
    expect(r.nextMilestone).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("updateEventStatus não desfaz a decisão de gente", () => {
  it("evento encerrado com tudo entregue NÃO é recarimbado como 'completed'", async () => {
    mundo.eventos["ev-1"] = evento({ status: EVENT_CLOSED_STATUS });
    mundo.itens["ev-1"] = pecas("delivered", 4);

    await updateEventStatus("ev-1");

    expect(mundo.eventos["ev-1"].status).toBe(EVENT_CLOSED_STATUS);
    expect(H.storage.updateEvent).not.toHaveBeenCalled();
  });

  it("evento encerrado com peça aberta NÃO é recarimbado como 'created'", async () => {
    mundo.eventos["ev-1"] = evento({ status: EVENT_CLOSED_STATUS });
    mundo.itens["ev-1"] = [...pecas("draft", 2), ...pecas("delivered", 1)];

    await updateEventStatus("ev-1");

    expect(mundo.eventos["ev-1"].status).toBe(EVENT_CLOSED_STATUS);
  });

  it("evento NÃO encerrado segue sendo derivado normalmente", async () => {
    mundo.itens["ev-1"] = pecas("delivered", 3);

    await updateEventStatus("ev-1");

    expect(mundo.eventos["ev-1"].status).toBe("completed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("countOpenWork", () => {
  it("canceladas saem dos dois lados da conta", () => {
    const w = countOpenWork([
      ...pecas("delivered", 4),
      ...pecas("canceled", 2),
      ...pecas("deleted", 1),
      ...pecas("archived", 1),
      ...pecas("draft", 3),
    ]);

    expect(w.itemCount).toBe(11);
    expect(w.canceledCount).toBe(4);
    expect(w.activeItemCount).toBe(7);
    expect(w.deliveredCount).toBe(4);
    expect(w.openCount).toBe(3);
  });

  it("conta as grafias LEGADAS em português", () => {
    const w = countOpenWork([...pecas("entregue", 2), ...pecas("em_producao", 3)]);

    expect(w.deliveredCount).toBe(2);
    expect(w.inProductionCount).toBe(3);
    expect(w.openCount).toBe(3);
  });
});
