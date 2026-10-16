// ─────────────────────────────────────────────────────────────────────────────
// DE ONDE VEM O REAPROVEITAMENTO — as ROTAS (dono, 16/10).
//
// Os handlers reais (banco de mentira de tx-de-mentira.ts):
//   · PATCH /api/items/:id/origem-reaproveitamento — papéis, validação (em
//     trânsito sem observação, valor inválido), trilha, aviso "Buscar no
//     estoque" no sino da Gráfica, etapa refeita e a recusa segura;
//   · o CAMINHO DA PEÇA 100% EM TRÂNSITO: liberada na Revisão Final já fecha
//     como Entregue, a conferência recusa, e desmarcar a devolve ao galpão;
//   · a PARCIAL: Reaproveitar da Gráfica com 4 em trânsito; as 6 impressas
//     conferem e a peça fecha a conferência no físico;
//   · o PATCH da peça (formulário): grava a origem com a marcação, recusa o
//     papel errado e a troca que mexeria na etapa;
//   · correct-reuse: zerar apaga a origem; total em trânsito fecha.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { txDeMentira } from "./tx-de-mentira";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: {} as Record<string, any>,
  mundo: { itens: {} as Record<string, any> },
  trilha: [] as string[],
  avisos: [] as any[],
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
    broadcast: () => {},
    createAuditLog: async (_req: any, _a: string, _t: string, _id: string, detalhe: string) => { H.trilha.push(detalhe); },
    createAuditLogsEmLote: async () => {},
    updateEventStatus: async () => {},
  };
});
vi.mock("../routes/pedidos-de-peca", async () => {
  const real = await vi.importActual<any>("../routes/pedidos-de-peca");
  return { ...real, aoExcluirPeca: async () => {} };
});
vi.mock("../routes/estoque-reservas", async () => {
  const real = await vi.importActual<any>("../routes/estoque-reservas");
  return { ...real, liberarReservasDasPecas: async () => {} };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/ocupacaoDasImpressoras", () => ({ quemOcupaAImpressora: async () => null, erroImpressoraOcupada: () => "ocupada" }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));
vi.mock("../services/consultaDeEstoqueNaLiberacao", () => ({
  respostaDoEstoqueParaLiberar: vi.fn(async () => null),
  marcarRespostaAplicada: vi.fn(async () => {}),
}));

const { registerItemRoutes } = await import("../routes/items");

type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const app: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  app[verbo] = (caminho: string, ...hs: Handler[]) => {
    const chave = `${verbo.toUpperCase()} ${caminho}`;
    if (!rotas.has(chave)) rotas.set(chave, hs);
    return app;
  };
}
registerItemRoutes(app);

async function chamar(chave: string, body: any, userRole: string, id = "p1") {
  const hs = rotas.get(chave);
  if (!hs) throw new Error(`Rota não registrada: ${chave}`);
  const req: any = { params: { id }, body, query: {}, headers: {}, userRole, userId: "u1", userName: "Maria", session: {} };
  const res: any = { _status: 200, _body: undefined, _pronto: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; res._pronto = true; return res; };
  res.set = () => res; res.setHeader = () => res; res.send = res.json;
  for (const h of hs) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (res._pronto || !seguiu) break;
  }
  return { status: res._status, body: res._body };
}

const OBS = "Night Run Salvador, etapa 17/10";
const ORIGEM = "PATCH /api/items/:id/origem-reaproveitamento";
const peca = (over: Record<string, unknown> = {}) => ({
  id: "p1", displayId: "#6033", eventId: "ev-1", type: "Placa 2x1", description: "Largada", quantity: 10,
  quantityProduced: 0, reuseQty: 0, isReuse: false, conferredQty: 0, embaladaQty: 0, deliveredQty: 0,
  status: "ready_for_production", deletedAt: null, parentItemId: null, travadaEm: null, travadaPor: null, travadaMotivo: null,
  printMachine: null, impressaoPorMaquina: null, reservaPorMaquina: null, maquinaPrevista: null, skipApproval: false,
  finalFileUrl: "/objects/uploads/final.pdf", conferencePhotoUrl: null, conferredAt: null, kitRemessaId: null,
  origemReaproveitamento: null, obsReaproveitamento: null, producaoInterna: false, instrucoesGrafica: null,
  fileWidth: "2.00", fileHeight: "1.00", area: "2", visual: "1", calculatedM2: "20.00", material: "Lona", finish: "Ilhós",
  measurement: "2.00 × 1.00", observations: "", createdAt: new Date("2026-09-01"),
  ...over,
});
const p1 = () => H.mundo.itens.p1;

beforeEach(() => {
  H.mundo.itens = {};
  H.trilha.length = 0;
  H.avisos.length = 0;
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, {
    getItem: vi.fn(async (id: string) => (H.mundo.itens[id] ? { ...H.mundo.itens[id] } : undefined)),
    updateItem: vi.fn(async (id: string, dados: any) => (H.mundo.itens[id] ? (H.mundo.itens[id] = { ...H.mundo.itens[id], ...dados }) : undefined)),
    getEvent: vi.fn(async () => ({ id: "ev-1", name: "COPA NORTE", status: "created", startDate: "2099-01-10", truckDepartureDate: new Date("2099-01-01T00:00:00Z") })),
    getItemSponsors: vi.fn(async () => []),
    getLiveComplements: vi.fn(async () => []),
    createNotification: vi.fn(async (n: any) => { H.avisos.push(n); return { id: `n${H.avisos.length}`, ...n }; }),
  });
  H.db.transaction = vi.fn(async (fn: any) => fn(txDeMentira(H.mundo)));
  H.db.execute = vi.fn(async () => ({ rows: [] }));
  H.db.insert = vi.fn(() => ({ values: async () => [] }));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("PATCH /api/items/:id/origem-reaproveitamento — quem e o quê", () => {
  it("Arte e Atendimento não marcam (403)", async () => {
    H.mundo.itens.p1 = peca({ reuseQty: 4 });
    for (const papel of ["arte", "atendimento"]) {
      const r = await chamar(ORIGEM, { origemReaproveitamento: "estoque" }, papel);
      expect(r.status, papel).toBe(403);
    }
    expect(p1().origemReaproveitamento).toBeNull();
  });

  it("em trânsito SEM observação: 400 com a instrução; valor inválido: 400; corpo vazio: 400", async () => {
    H.mundo.itens.p1 = peca({ reuseQty: 4 });
    const semObs = await chamar(ORIGEM, { origemReaproveitamento: "em_transito" }, "grafica");
    expect(semObs.status).toBe(400);
    expect(semObs.body.error).toMatch(/escreva de qual etapa\/evento a peça vem/i);
    expect((await chamar(ORIGEM, { origemReaproveitamento: "tapecaria" }, "grafica")).status).toBe(400);
    expect((await chamar(ORIGEM, {}, "grafica")).status).toBe(400);
    expect(p1().origemReaproveitamento).toBeNull();
  });

  it("peça sem reaproveitamento: 409 claro", async () => {
    H.mundo.itens.p1 = peca();
    const r = await chamar(ORIGEM, { origemReaproveitamento: "estoque" }, "solicitacao");
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/não tem unidade reaproveitada/);
  });

  it("a Gráfica só marca da liberação em diante; ninguém marca na cancelada", async () => {
    H.mundo.itens.p1 = peca({ reuseQty: 4, status: "awaiting_submission" });
    expect((await chamar(ORIGEM, { origemReaproveitamento: "estoque" }, "grafica")).status).toBe(409);
    expect((await chamar(ORIGEM, { origemReaproveitamento: "estoque" }, "solicitacao")).status).toBe(200);
    H.mundo.itens.p1 = peca({ reuseQty: 4, status: "canceled" });
    const r = await chamar(ORIGEM, { origemReaproveitamento: "estoque" }, "admin");
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/não muda mais/);
  });

  it("estoque na fila da Gráfica: grava, escreve a trilha e avisa a Gráfica no sino", async () => {
    H.mundo.itens.p1 = peca({ reuseQty: 4 });
    const r = await chamar(ORIGEM, { origemReaproveitamento: "estoque", obsReaproveitamento: "Galpão, prateleira 3" }, "solicitacao");
    expect(r.status).toBe(200);
    expect(p1()).toMatchObject({ origemReaproveitamento: "estoque", obsReaproveitamento: "Galpão, prateleira 3", status: "ready_for_production" });
    expect(H.trilha.at(-1)).toBe("Reaproveitamento: estoque — Galpão, prateleira 3");
    expect(H.avisos).toHaveLength(1);
    expect(H.avisos[0]).toMatchObject({ type: "itemAdded", targetRoles: ["grafica"], itemId: "p1" });
    expect(H.avisos[0].message).toBe("Buscar no estoque: #6033 Placa 2x1 Largada (4 un.) · Galpão, prateleira 3 — Evento: COPA NORTE");
    // repetir a mesma origem: nada muda, nada avisa
    await chamar(ORIGEM, { origemReaproveitamento: "estoque", obsReaproveitamento: "Galpão, prateleira 3" }, "solicitacao");
    expect(H.avisos).toHaveLength(1);
  });

  it("a Gráfica marcando estoque não avisa a si mesma", async () => {
    H.mundo.itens.p1 = peca({ reuseQty: 4 });
    expect((await chamar(ORIGEM, { origemReaproveitamento: "estoque" }, "grafica")).status).toBe(200);
    expect(H.avisos).toHaveLength(0);
  });
});

describe("o caminho da peça 100% em trânsito", () => {
  it("liberada na Revisão com reaproveitamento total em trânsito: fecha como Entregue, sem passar pela Gráfica", async () => {
    H.mundo.itens.p1 = peca({ status: "awaiting_final_review" });
    const r = await chamar("PATCH /api/items/:id/creator-review", { reuseQty: 10, origemReaproveitamento: "em_transito", obsReaproveitamento: OBS }, "solicitacao");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(p1()).toMatchObject({ status: "delivered", reuseQty: 10, isReuse: true, origemReaproveitamento: "em_transito", obsReaproveitamento: OBS, deliveredQty: 0 });
    expect(p1().deliveredAt).toBeInstanceOf(Date);
    // Conferir agora é recusado — não há nada no galpão.
    const conf = await chamar("POST /api/items/:id/confer", { conferencePhotoUrl: "/objects/uploads/f.jpg" }, "grafica");
    expect(conf.status).toBe(409);
    // E nenhum aviso de estoque (não é do estoque).
    expect(H.avisos.filter((a) => a.targetRoles?.includes("grafica"))).toHaveLength(0);
  });

  it("Reaproveitar na Gráfica com a peça inteira em trânsito: sai da fila (Entregue) com a trilha", async () => {
    H.mundo.itens.p1 = peca();
    const r = await chamar("POST /api/items/:id/mark-reuse", { origemReaproveitamento: "em_transito", obsReaproveitamento: OBS }, "grafica");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(p1()).toMatchObject({ status: "delivered", reuseQty: 10, isReuse: true, origemReaproveitamento: "em_transito" });
    expect(H.trilha.at(-1)).toContain(`Reaproveitamento: em trânsito — ${OBS}`);
    expect(H.trilha.at(-1)).toContain(`Reaproveitada em trânsito (${OBS}) — não passa pela Gráfica`);
  });

  it("desmarcar em trânsito depois de fechada: volta ao galpão (Produzido) e passa a conferir", async () => {
    H.mundo.itens.p1 = peca({ status: "delivered", reuseQty: 10, isReuse: true, origemReaproveitamento: "em_transito", obsReaproveitamento: OBS, deliveredAt: new Date() });
    const r = await chamar(ORIGEM, { origemReaproveitamento: "estoque" }, "solicitacao");
    expect(r.status).toBe(200);
    expect(p1()).toMatchObject({ status: "produced", origemReaproveitamento: "estoque", obsReaproveitamento: null, deliveredAt: null });
    expect(H.trilha.at(-1)).toMatch(/Status: Entregue → .* as reaproveitadas voltam a passar por conferir/);
    const conf = await chamar("POST /api/items/:id/confer", { conferencePhotoUrl: "/objects/uploads/f.jpg" }, "grafica");
    expect(conf.status, JSON.stringify(conf.body)).toBe(200);
    expect(p1()).toMatchObject({ status: "conferred", conferredQty: 10 });
  });

  it("marcar em trânsito numa produzida inteira-reaproveitada: fecha como Entregue", async () => {
    H.mundo.itens.p1 = peca({ status: "produced", reuseQty: 10, isReuse: true });
    const r = await chamar(ORIGEM, { origemReaproveitamento: "em_transito", obsReaproveitamento: OBS }, "grafica");
    expect(r.status).toBe(200);
    expect(p1().status).toBe("delivered");
    expect(H.trilha.at(-1)).toContain("não passa pela Gráfica");
  });

  it("travada pela Solicitação: marcar em trânsito não fecha a peça", async () => {
    H.mundo.itens.p1 = peca({ status: "produced", reuseQty: 10, isReuse: true, travadaEm: new Date(), travadaPor: "Ana", travadaMotivo: "segurar" });
    const r = await chamar(ORIGEM, { origemReaproveitamento: "em_transito", obsReaproveitamento: OBS }, "grafica");
    expect(r.status).toBe(409);
    expect(p1().status).toBe("produced");
  });
});

describe("a peça PARCIAL (6 impressas + 4 em trânsito)", () => {
  it("Reaproveitar 4 em trânsito; as 6 impressas conferem e a conferência fecha no físico", async () => {
    H.mundo.itens.p1 = peca({ status: "inProduction", printMachine: "1" });
    const r = await chamar("POST /api/items/:id/mark-reuse", { qty: 4, origemReaproveitamento: "em_transito", obsReaproveitamento: OBS }, "grafica");
    expect(r.status).toBe(200);
    expect(p1()).toMatchObject({ reuseQty: 4, isReuse: false, status: "inProduction", origemReaproveitamento: "em_transito" });
    // a impressão das 6 fecha a peça (simulado: o start-production faz isto)
    H.mundo.itens.p1 = { ...p1(), quantityProduced: 6, status: "produced" };
    const sete = await chamar("POST /api/items/:id/confer", { conferencePhotoUrl: "/objects/uploads/f.jpg", qty: 7 }, "grafica");
    expect(sete.status, "não há 7 no galpão").toBe(409);
    const conf = await chamar("POST /api/items/:id/confer", { conferencePhotoUrl: "/objects/uploads/f.jpg" }, "grafica");
    expect(conf.status, JSON.stringify(conf.body)).toBe(200);
    expect(p1()).toMatchObject({ conferredQty: 6, status: "conferred" });
  });

  it("marcar em trânsito depois de o galpão conferir as reaproveitadas: recusa clara, nada muda", async () => {
    H.mundo.itens.p1 = peca({ status: "produced", quantityProduced: 6, reuseQty: 4, conferredQty: 9, origemReaproveitamento: "estoque" });
    const r = await chamar(ORIGEM, { origemReaproveitamento: "em_transito", obsReaproveitamento: OBS }, "grafica");
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/9 un\. já foram conferidas.*Use "Estoque"/);
    expect(p1()).toMatchObject({ origemReaproveitamento: "estoque", status: "produced" });
  });

  it("marcar em trânsito com o físico já conferido: a peça vira Conferida", async () => {
    H.mundo.itens.p1 = peca({ status: "produced", quantityProduced: 6, reuseQty: 4, conferredQty: 6 });
    const r = await chamar(ORIGEM, { origemReaproveitamento: "em_transito", obsReaproveitamento: OBS }, "admin");
    expect(r.status).toBe(200);
    expect(p1().status).toBe("conferred");
  });
});

describe("as outras portas", () => {
  it("PATCH da peça (formulário): grava a origem com a marcação; papel errado: 403", async () => {
    H.mundo.itens.p1 = peca({ status: "draft" });
    const r = await chamar("PATCH /api/items/:id", { isReuse: true, reuseQty: 10, origemReaproveitamento: "em_transito", obsReaproveitamento: OBS }, "solicitacao");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(p1()).toMatchObject({ isReuse: true, reuseQty: 10, origemReaproveitamento: "em_transito", obsReaproveitamento: OBS, status: "draft" });
    expect(H.trilha.at(-1)).toContain(`Reaproveitamento: em trânsito — ${OBS}`);
    const arte = await chamar("PATCH /api/items/:id", { origemReaproveitamento: "estoque" }, "arte");
    expect(arte.status).toBe(403);
    // o formulário manda "" para "sem origem" — não pode quebrar o PATCH de quem não mexe nela
    H.mundo.itens.p1 = peca({ status: "draft" });
    expect((await chamar("PATCH /api/items/:id", { description: "Nova", origemReaproveitamento: "", obsReaproveitamento: "" }, "arte")).status).toBe(200);
  });

  it("PATCH da peça: em trânsito sem observação é 400; desligar o reaproveitamento apaga a origem", async () => {
    H.mundo.itens.p1 = peca({ status: "draft", isReuse: true, reuseQty: 10, origemReaproveitamento: "estoque" });
    expect((await chamar("PATCH /api/items/:id", { origemReaproveitamento: "em_transito" }, "solicitacao")).status).toBe(400);
    const r = await chamar("PATCH /api/items/:id", { isReuse: false }, "solicitacao");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(p1()).toMatchObject({ isReuse: false, reuseQty: 0, origemReaproveitamento: null, obsReaproveitamento: null });
  });

  it("PATCH da peça no fim do fluxo: trocar para/de em trânsito vai pelo botão da ficha (409)", async () => {
    H.mundo.itens.p1 = peca({ status: "produced", isReuse: true, reuseQty: 10 });
    const r = await chamar("PATCH /api/items/:id", { origemReaproveitamento: "em_transito", obsReaproveitamento: OBS }, "solicitacao");
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/Origem do reaproveitamento/);
    expect(p1().status).toBe("produced");
  });

  it("correct-reuse: zerar apaga a origem; o total com em trânsito fecha a peça", async () => {
    H.mundo.itens.p1 = peca({ status: "produced", quantityProduced: 7, reuseQty: 3, origemReaproveitamento: "estoque", obsReaproveitamento: "Galpão" });
    expect((await chamar("POST /api/items/:id/correct-reuse", { correctedReuseQty: 0 }, "grafica")).status).toBe(200);
    expect(p1()).toMatchObject({ status: "ready_for_production", reuseQty: 0, origemReaproveitamento: null, obsReaproveitamento: null });

    H.mundo.itens.p1 = peca({ status: "produced", quantityProduced: 7, reuseQty: 3, origemReaproveitamento: "em_transito", obsReaproveitamento: OBS });
    expect((await chamar("POST /api/items/:id/correct-reuse", { correctedReuseQty: 10 }, "admin")).status).toBe(200);
    expect(p1()).toMatchObject({ status: "delivered", reuseQty: 10, isReuse: true, quantityProduced: 0 });
  });

  it("Revisão Final libera com reaproveitamento do ESTOQUE: a Gráfica é avisada na chegada", async () => {
    H.mundo.itens.p1 = peca({ status: "awaiting_final_review" });
    const r = await chamar("PATCH /api/items/:id/creator-review", { reuseQty: 4, origemReaproveitamento: "estoque", obsReaproveitamento: "Lote do Rio" }, "solicitacao");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(p1()).toMatchObject({ status: "ready_for_production", reuseQty: 4, origemReaproveitamento: "estoque" });
    const aviso = H.avisos.find((a) => a.targetRoles?.includes("grafica"));
    expect(aviso?.message).toMatch(/^Buscar no estoque: #6033 .*\(4 un\.\) · Lote do Rio — Evento: COPA NORTE$/);
  });
});
