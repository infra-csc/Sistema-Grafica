// ─────────────────────────────────────────────────────────────────────────────
// PRODUÇÃO INTERNA — "direto para a Gráfica", as ROTAS (dono, 02/10).
//
// Os handlers reais com o banco mockado (o mundo de peças, a transação de
// mentira), conferindo:
//   · a ação avulsa por peça: papéis, patrocinador (409 com a frase), sem
//     instrução e sem arquivo (400), etapa (já com a Arte), molde, travada,
//     evento encerrado, Kit; e o EFEITO gravado (status, marca, skipApproval,
//     approvedAt, instruções, arquivo, trilha, aviso à Gráfica);
//   · o lote misto: quem foi, quem ficou de fora e por quê;
//   · a marca na criação e na edição (papel, etapa, patrocinador);
//   · vincular patrocinador a peça marcada é recusado;
//   · o ENVIO DA LISTA leva a marcada direto para Pronto para Produção e
//     segura no rascunho a que não tem arquivo nem instrução.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { txDeMentira, type OperacaoDoTx } from "./tx-de-mentira";

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/banco_nunca_acessado";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: {} as Record<string, any>,
  mundo: { itens: {} as Record<string, any> },
  trilha: [] as string[],
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
    requireRole: (...papeis: string[]) => (req: any, res: any, next: any) =>
      (papeis.includes(req.userRole) ? next() : res.status(403).json({ error: "sem permissão" })),
    broadcast: () => {},
    createAuditLog: async (_q: any, _a: string, _t: string, _id: string, det: string) => { H.trilha.push(det); },
    createAuditLogsEmLote: async (_q: any, linhas: Array<{ details?: string }>) => { for (const l of linhas) H.trilha.push(l.details ?? ""); },
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
vi.mock("../services/prioridadeAutomatica", () => ({ aplicarPrioridadeAutomatica: vi.fn(async () => {}) }));

const { registerItemRoutes } = await import("../routes/items");
const { registerSponsorRoutes } = await import("../routes/sponsors");
const { registerEventRoutes } = await import("../routes/events");
const { auditLogs, notifications } = await import("@shared/schema");
const PI = await import("@shared/producao-interna");

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
registerSponsorRoutes(app);
registerEventRoutes(app);

async function chamar(chave: string, ctx: { params?: any; body?: any; userRole: string; userKit?: boolean }) {
  const hs = rotas.get(chave);
  if (!hs) throw new Error(`Rota não registrada: ${chave}`);
  const req: any = { params: ctx.params ?? {}, body: ctx.body ?? {}, query: {}, headers: {}, userRole: ctx.userRole, userKit: ctx.userKit, userId: "u1", userName: "Maria", session: {} };
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

const peca = (id: string, over: Record<string, unknown> = {}) => ({
  id, displayId: `#0${id.replace(/\D/g, "").padStart(3, "0")}`, eventId: "ev-1", type: "Banner", description: "Banner da recepção",
  quantity: 2, quantityProduced: 0, reuseQty: 0, isReuse: false, status: "draft", skipApproval: false, deletedAt: null,
  parentItemId: null, kitRemessaId: null, criadoPorId: "u9", observations: "", approvalThumbUrl: null, finalFileUrl: null,
  finalFileName: null, travadaEm: null, producaoInterna: false, instrucoesGrafica: null, approvedAt: null, creatorReviewedAt: null,
  calculatedM2: "2.00", material: "Lona", finish: "Ilhós", measurement: "1.00 × 1.00", fileWidth: "1", fileHeight: "1", area: "1", visual: "1",
  createdAt: new Date("2026-09-01"),
  ...over,
});

const INSTR = "Imprimir em lona fosca 1x1 m, com ilhós nos cantos";
let vinculos: Array<{ itemId: string; sponsorId: string }>;
let ops: OperacaoDoTx[];
let eventos: Record<string, any>;

beforeEach(() => {
  H.mundo.itens = {};
  H.trilha.length = 0;
  vinculos = [];
  ops = [];
  eventos = {
    "ev-1": { id: "ev-1", name: "COPA NORTE", status: "created", startDate: "2099-01-10", truckDepartureDate: new Date("2099-01-01T00:00:00Z") },
    "ev-fechado": { id: "ev-fechado", name: "ANTIGO", status: "closed", manuallyClosed: true, startDate: "2099-01-10", truckDepartureDate: new Date("2099-01-01T00:00:00Z") },
  };
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, {
    getItem: vi.fn(async (id: string) => (H.mundo.itens[id] ? { ...H.mundo.itens[id] } : undefined)),
    getItemsByIds: vi.fn(async (ids: string[]) => ids.map((id) => H.mundo.itens[id]).filter(Boolean).map((p) => ({ ...p }))),
    getItemsByEvent: vi.fn(async () => Object.values(H.mundo.itens).map((p: any) => ({ ...p }))),
    updateItem: vi.fn(async (id: string, dados: any) => (H.mundo.itens[id] ? (H.mundo.itens[id] = { ...H.mundo.itens[id], ...dados }) : undefined)),
    updateItemWithStatusCheck: vi.fn(async (id: string, de: string, para: string, extras?: any) => {
      const p = H.mundo.itens[id];
      if (!p || p.status !== de) return null;
      H.mundo.itens[id] = { ...p, ...(extras ?? {}), status: para };
      return { ...H.mundo.itens[id] };
    }),
    createItem: vi.fn(async (dados: any) => { const p = { ...peca("p99"), ...dados, id: "p99", displayId: "#0099" }; H.mundo.itens.p99 = p; return p; }),
    getEvent: vi.fn(async (id: string) => eventos[id]),
    updateEvent: vi.fn(async (id: string, d: any) => (eventos[id] = { ...eventos[id], ...d })),
    createNotification: vi.fn(async (n: any) => ({ id: "n1", ...n })),
    getItemSponsors: vi.fn(async (itemId: string) => vinculos.filter((v) => v.itemId === itemId)),
    getItemSponsorsByItemIds: vi.fn(async (ids: string[]) => vinculos.filter((v) => ids.includes(v.itemId))),
    getSponsor: vi.fn(async (id: string) => ({ id, name: id, strictApproval: false, arquivadoEm: null })),
    bulkSyncItemSponsors: vi.fn(async () => {}),
    addSponsorToItem: vi.fn(async (d: any) => d),
    getLiveComplements: vi.fn(async () => []),
  });
  H.db.transaction = vi.fn(async (fn: any) => fn(txDeMentira(H.mundo, ops)));
  H.db.execute = vi.fn(async () => ({ rows: [] }));
  H.db.insert = vi.fn(() => ({ values: async () => [] }));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const DIRETO = "POST /api/items/:id/direto-para-grafica";
const LOTE = "POST /api/items/direto-para-grafica";
const insercoes = (tabela: unknown) => ops.filter((o) => o.tipo === "insert" && o.tabela === tabela).map((o) => o.valores);

describe("POST /api/items/:id/direto-para-grafica — quem pode", () => {
  for (const papel of ["grafica", "arte", "atendimento"]) {
    it(`${papel}: 403, nada muda`, async () => {
      H.mundo.itens.p1 = peca("p1", { finalFileUrl: "/objects/a.pdf" });
      const r = await chamar(DIRETO, { params: { id: "p1" }, userRole: papel, body: { instrucoes: INSTR } });
      expect(r.status).toBe(403);
      expect(H.mundo.itens.p1.status).toBe("draft");
    });
  }
  for (const papel of ["solicitacao", "admin"]) {
    it(`${papel}: envia`, async () => {
      H.mundo.itens.p1 = peca("p1");
      const r = await chamar(DIRETO, { params: { id: "p1" }, userRole: papel, body: { instrucoes: INSTR } });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(H.mundo.itens.p1.status).toBe("ready_for_production");
    });
  }
});

describe("POST /api/items/:id/direto-para-grafica — as recusas", () => {
  it("peça com patrocinador vinculado: 409 com a frase e o código", async () => {
    H.mundo.itens.p1 = peca("p1");
    vinculos = [{ itemId: "p1", sponsorId: "sp1" }];
    const r = await chamar(DIRETO, { params: { id: "p1" }, userRole: "solicitacao", body: { instrucoes: INSTR } });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe(PI.CODIGO_COM_PATROCINADOR);
    expect(r.body.error).toMatch(/patrocinador/i);
    expect(H.mundo.itens.p1.status).toBe("draft");
  });

  it("sem arquivo e sem instrução: 400 — e com instrução curta também", async () => {
    H.mundo.itens.p1 = peca("p1");
    const r = await chamar(DIRETO, { params: { id: "p1" }, userRole: "solicitacao", body: {} });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe(PI.CODIGO_SEM_INSTRUCOES);
    const curta = await chamar(DIRETO, { params: { id: "p1" }, userRole: "solicitacao", body: { instrucoes: "lona" } });
    expect(curta.status).toBe(400);
    expect(H.mundo.itens.p1.status).toBe("draft");
  });

  it("com arquivo, a instrução é opcional", async () => {
    H.mundo.itens.p1 = peca("p1");
    const r = await chamar(DIRETO, { params: { id: "p1" }, userRole: "solicitacao", body: { finalFileUrl: "\\\\10.100.1.7\\TTKGrafica\\Banner.tif" } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(H.mundo.itens.p1.finalFileUrl).toBe("\\\\10.100.1.7\\TTKGrafica\\Banner.tif");
  });

  it("a instrução já escrita na lista vale (o corpo pode vir vazio)", async () => {
    H.mundo.itens.p1 = peca("p1", { instrucoesGrafica: INSTR });
    const r = await chamar(DIRETO, { params: { id: "p1" }, userRole: "solicitacao", body: {} });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(H.mundo.itens.p1.instrucoesGrafica).toBe(INSTR);
  });

  it("já com a Arte (aguardando envio): 409 dizendo para voltar à criação", async () => {
    H.mundo.itens.p1 = peca("p1", { status: "awaiting_submission" });
    const r = await chamar(DIRETO, { params: { id: "p1" }, userRole: "solicitacao", body: { instrucoes: INSTR } });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/Arte/);
  });

  it("molde, reaproveitamento total e travada: 409", async () => {
    for (const over of [{ type: "Molde" }, { isReuse: true }, { travadaEm: new Date() }]) {
      H.mundo.itens.p1 = peca("p1", over);
      const r = await chamar(DIRETO, { params: { id: "p1" }, userRole: "admin", body: { instrucoes: INSTR } });
      expect(r.status, JSON.stringify(over)).toBe(409);
      expect(H.mundo.itens.p1.status).toBe("draft");
    }
  });

  it("evento encerrado: 409 EVENT_FINALIZED", async () => {
    H.mundo.itens.p1 = peca("p1", { eventId: "ev-fechado" });
    const r = await chamar(DIRETO, { params: { id: "p1" }, userRole: "admin", body: { instrucoes: INSTR } });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("EVENT_FINALIZED");
  });

  it("Kit: a Solicitação da Arena não envia peça do Kit; o dono do Kit envia a dele", async () => {
    H.mundo.itens.p1 = peca("p1", { kitRemessaId: "k1", criadoPorId: "u1" });
    const arena = await chamar(DIRETO, { params: { id: "p1" }, userRole: "solicitacao", body: { instrucoes: INSTR } });
    expect(arena.status).toBe(403);
    const dono = await chamar(DIRETO, { params: { id: "p1" }, userRole: "solicitacao", userKit: true, body: { instrucoes: INSTR } });
    expect(dono.status, JSON.stringify(dono.body)).toBe(200);
  });
});

describe("POST /api/items/:id/direto-para-grafica — o que grava", () => {
  it("Pronto para Produção, a marca, skipApproval, approvedAt; Revisão Final intocada", async () => {
    H.mundo.itens.p1 = peca("p1", { status: "awaiting_linking" });
    const r = await chamar(DIRETO, { params: { id: "p1" }, userRole: "solicitacao", body: { instrucoes: `  ${INSTR}  ` } });
    expect(r.status).toBe(200);
    const p = H.mundo.itens.p1;
    expect(p).toMatchObject({ status: "ready_for_production", producaoInterna: true, skipApproval: true, instrucoesGrafica: INSTR, hasModifiedData: false });
    expect(p.approvedAt).toBeInstanceOf(Date);
    expect(p.statusChangedAt).toBeInstanceOf(Date);
    expect(p.creatorReviewedAt).toBeNull();
    expect(p.calculatedM2).toBe("2.00"); // o m² da criação fica
  });

  it("o arquivo subido pelo app (URL crua do bucket) vira /objects/ com o nome", async () => {
    H.mundo.itens.p1 = peca("p1");
    await chamar(DIRETO, { params: { id: "p1" }, userRole: "admin", body: { finalFileUrl: "https://storage.googleapis.com/b/.private/uploads/abc", finalFileName: "banner.pdf" } });
    expect(H.mundo.itens.p1).toMatchObject({ finalFileUrl: "/objects/uploads/abc", finalFileName: "banner.pdf" });
    expect(H.mundo.itens.p1.finalFileUpdatedAt).toBeInstanceOf(Date);
  });

  it("trilha com a frase clara e aviso para a Gráfica (e o admin)", async () => {
    H.mundo.itens.p1 = peca("p1");
    await chamar(DIRETO, { params: { id: "p1" }, userRole: "solicitacao", body: { instrucoes: INSTR } });
    const [linha] = insercoes(auditLogs);
    expect(linha.details).toContain("Enviada direto para a Gráfica (produção interna, sem passar pela Arte)");
    expect(linha.details).toContain("Rascunho → Pronto para Produção");
    expect(linha.details).toContain(INSTR);
    const [aviso] = insercoes(notifications);
    expect(aviso.targetRoles).toEqual(["grafica", "admin"]);
    expect(aviso.message).toContain("sem arquivo, ver instruções");
  });
});

describe("POST /api/items/direto-para-grafica — lote misto", () => {
  beforeEach(() => {
    H.mundo.itens = {
      p1: peca("p1", { finalFileUrl: "/objects/p1.pdf" }),
      p2: peca("p2"),
      p3: peca("p3"),
      p4: peca("p4", { status: "awaiting_submission", finalFileUrl: "/objects/p4.pdf" }),
      p5: peca("p5", { instrucoesGrafica: INSTR }),
    };
    vinculos = [{ itemId: "p2", sponsorId: "sp1" }];
  });

  it("sem instrução comum: vão as que têm arquivo ou instrução própria; as outras ficam com o motivo", async () => {
    const r = await chamar(LOTE, { userRole: "solicitacao", body: { itemIds: ["p1", "p2", "p3", "p4", "p5"] } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.enviadas.map((p: any) => p.id).sort()).toEqual(["p1", "p5"]);
    const motivo = (id: string) => r.body.ficaramDeFora.find((f: any) => f.id === id)?.motivo ?? "";
    expect(motivo("p2")).toMatch(/patrocinador/i);
    expect(motivo("p3")).toMatch(/instruções/i);
    expect(motivo("p4")).toMatch(/Arte/);
    expect(H.mundo.itens.p2.status).toBe("draft");
    expect(H.mundo.itens.p3.status).toBe("draft");
    // UM aviso para o lote, nomeando as peças.
    const avisos = insercoes(notifications);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].message).toContain("#0001");
    expect(avisos[0].message).toContain("#0005");
  });

  it("com instrução comum, a peça sem nada também vai — e recebe a instrução", async () => {
    const r = await chamar(LOTE, { userRole: "admin", body: { itemIds: ["p1", "p3"], instrucoes: INSTR } });
    expect(r.body.enviadas).toHaveLength(2);
    expect(H.mundo.itens.p3).toMatchObject({ status: "ready_for_production", instrucoesGrafica: INSTR });
  });

  it("a instrução comum só completa: a peça com instrução própria fica com a dela", async () => {
    const r = await chamar(LOTE, { userRole: "admin", body: { itemIds: ["p3", "p5"], instrucoes: "Outra instrução comum, longa o bastante" } });
    expect(r.body.enviadas).toHaveLength(2);
    expect(H.mundo.itens.p5.instrucoesGrafica).toBe(INSTR);
    expect(H.mundo.itens.p3.instrucoesGrafica).toBe("Outra instrução comum, longa o bastante");
  });

  it("nada passa: 409 com a lista dos motivos", async () => {
    const r = await chamar(LOTE, { userRole: "solicitacao", body: { itemIds: ["p2", "p4"] } });
    expect(r.status).toBe(409);
    expect(r.body.ficaramDeFora).toHaveLength(2);
  });

  it("lista vazia ou grande demais: 400; papel errado: 403", async () => {
    expect((await chamar(LOTE, { userRole: "solicitacao", body: { itemIds: [] } })).status).toBe(400);
    expect((await chamar(LOTE, { userRole: "solicitacao", body: { itemIds: Array.from({ length: 501 }, (_, i) => `x${i}`) } })).status).toBe(400);
    expect((await chamar(LOTE, { userRole: "grafica", body: { itemIds: ["p1"] } })).status).toBe(403);
  });
});

describe("a marca na criação e na edição", () => {
  it("criar marcada (Solicitação), com arquivo: nasce com a marca, a instrução e o arquivo", async () => {
    const r = await chamar("POST /api/items", { userRole: "solicitacao", body: {
      eventId: "ev-1", type: "Banner", quantity: 1, area: "1", visual: "1", calculatedM2: "1", material: "Lona", finish: "Ilhós", measurement: "1 × 1",
      producaoInterna: true, instrucoesGrafica: INSTR, finalFileUrl: "\\\\srv\\Banner.tif",
    } });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const dados = H.storage.createItem.mock.calls[0][0];
    expect(dados).toMatchObject({ producaoInterna: true, instrucoesGrafica: INSTR, finalFileUrl: "\\\\srv\\Banner.tif" });
    expect(H.trilha.join(" ")).toContain("DIRETO PARA A GRÁFICA");
  });

  it("criar MOLDE marcado: 409", async () => {
    const r = await chamar("POST /api/items", { userRole: "admin", body: {
      eventId: "ev-1", type: "Molde", quantity: 1, area: "1", visual: "1", calculatedM2: "1", material: "Lona", finish: "Ilhós", measurement: "1 × 1",
      producaoInterna: true,
    } });
    expect(r.status).toBe(409);
    expect(H.storage.createItem).not.toHaveBeenCalled();
  });

  it("editar: a Solicitação marca o rascunho sem patrocinador", async () => {
    H.mundo.itens.p1 = peca("p1");
    const r = await chamar("PATCH /api/items/:id", { params: { id: "p1" }, userRole: "solicitacao", body: { producaoInterna: true, instrucoesGrafica: INSTR } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(H.mundo.itens.p1).toMatchObject({ producaoInterna: true, instrucoesGrafica: INSTR, status: "draft" });
  });

  it("editar: marcar peça com patrocinador → 409 com a frase", async () => {
    H.mundo.itens.p1 = peca("p1");
    vinculos = [{ itemId: "p1", sponsorId: "sp1" }];
    const r = await chamar("PATCH /api/items/:id", { params: { id: "p1" }, userRole: "admin", body: { producaoInterna: true } });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe(PI.CODIGO_COM_PATROCINADOR);
    expect(H.mundo.itens.p1.producaoInterna).toBe(false);
  });

  it("editar: a Arte não marca (403); fora da lista (aguardando vinculação) não marca (409)", async () => {
    H.mundo.itens.p1 = peca("p1");
    expect((await chamar("PATCH /api/items/:id", { params: { id: "p1" }, userRole: "arte", body: { producaoInterna: true } })).status).toBe(403);
    H.mundo.itens.p2 = peca("p2", { status: "awaiting_linking" });
    expect((await chamar("PATCH /api/items/:id", { params: { id: "p2" }, userRole: "solicitacao", body: { producaoInterna: true } })).status).toBe(409);
  });

  it("editar: o form inteiro de quem não marca passa, se a marca e a instrução não mudam", async () => {
    H.mundo.itens.p1 = peca("p1", { producaoInterna: true, instrucoesGrafica: INSTR });
    const r = await chamar("PATCH /api/items/:id", { params: { id: "p1" }, userRole: "arte", body: { producaoInterna: true, instrucoesGrafica: INSTR, description: "Outro texto" } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  });
});

// ENTRADA RÁPIDA (dono, 07/10): a coluna "Gráfica" da grade cria peças
// marcadas pelo POST /api/items/bulk — com a MESMA régua do POST unitário e,
// agora, com o caminho do arquivo colado na linha.
describe("criação em lote (Entrada rápida) com a marca", () => {
  const BULK = "POST /api/items/bulk";
  const linha = (over: Record<string, unknown> = {}) => ({
    eventId: "ev-1", type: "Faixa", description: "Faixa da fila", quantity: 1, area: "2", visual: "0.5", calculatedM2: "1",
    visualWidth: "2", visualHeight: "0.5", fileWidth: "2", fileHeight: "0.5", material: "Lona", finish: "Ilhós", measurement: "2 × 0.5",
    ...over,
  });
  beforeEach(() => {
    H.storage.createBulkItems = vi.fn(async (xs: any[]) => xs.map((x, i) => ({ ...peca(`b${i + 1}`), ...x, id: `b${i + 1}` })));
  });

  it("Solicitação: a linha marcada nasce com a marca, a instrução normalizada e o arquivo; a comum, sem nada", async () => {
    const caminho = String.raw`\\10.100.1.7\TTKGrafica\INTERNO\Faixa_fila.pdf`;
    const r = await chamar(BULK, { userRole: "solicitacao", body: { items: [
      linha({ producaoInterna: true, instrucoesGrafica: `  ${INSTR}  `, finalFileUrl: caminho, finalFileName: "Faixa_fila.pdf" }),
      linha({ description: "Faixa comum", producaoInterna: false }),
      linha({ description: "Placa interna", producaoInterna: true, instrucoesGrafica: INSTR }),
    ] } });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const [marcada, comum, semArquivo] = H.storage.createBulkItems.mock.calls[0][0];
    expect(marcada).toMatchObject({ producaoInterna: true, instrucoesGrafica: INSTR, finalFileUrl: caminho, finalFileName: "Faixa_fila.pdf" });
    expect(marcada.finalFileUpdatedAt).toBeInstanceOf(Date);
    expect(comum.producaoInterna).toBe(false);
    expect(comum.finalFileUrl).toBeUndefined();
    expect(semArquivo).toMatchObject({ producaoInterna: true, instrucoesGrafica: INSTR });
    expect(semArquivo.finalFileUrl).toBeUndefined();
    // Nasce rascunho: quem leva para a Gráfica é o envio da lista.
    expect(marcada.status).toBeUndefined();
    expect(H.trilha.filter((t) => t.includes("DIRETO PARA A GRÁFICA"))).toHaveLength(2);
  });

  it("sem a marca, o lote é o de sempre — e um finalFileUrl no corpo da peça comum é ignorado", async () => {
    const r = await chamar(BULK, { userRole: "admin", body: { items: [linha({ finalFileUrl: "/objects/forjado.pdf" }), linha({ description: "Outra" })] } });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    for (const p of H.storage.createBulkItems.mock.calls[0][0]) {
      expect(p.producaoInterna ?? false).toBe(false);
      expect(p.finalFileUrl).toBeUndefined();
    }
  });

  it("marcada sem instrução nem arquivo: o rascunho aceita (a regra é do envio da lista)", async () => {
    const r = await chamar(BULK, { userRole: "solicitacao", body: { items: [linha({ producaoInterna: true })] } });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(H.storage.createBulkItems.mock.calls[0][0][0]).toMatchObject({ producaoInterna: true });
  });

  it("quem não é admin nem Solicitação não marca: 403 apontando a linha, nada criado", async () => {
    eventos["ev-1"].createdBy = "u1"; // criador do evento pode lançar peças, mas não marcar
    const r = await chamar(BULK, { userRole: "arte", body: { items: [linha(), linha({ producaoInterna: true, instrucoesGrafica: INSTR })] } });
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/^Linha 2:/);
    expect(H.storage.createBulkItems).not.toHaveBeenCalled();
  });

  it("molde ou reaproveitamento total marcados: 409 com a linha e a frase", async () => {
    const molde = await chamar(BULK, { userRole: "admin", body: { items: [linha({ type: "Molde", producaoInterna: true, instrucoesGrafica: INSTR })] } });
    expect(molde.status).toBe(409);
    expect(molde.body.error).toMatch(/^Linha 1: Molde/);
    const reuso = await chamar(BULK, { userRole: "admin", body: { items: [linha(), linha({ isReuse: true, producaoInterna: true, instrucoesGrafica: INSTR })] } });
    expect(reuso.status).toBe(409);
    expect(reuso.body.error).toMatch(/^Linha 2: .*reaproveitamento/i);
    expect(H.storage.createBulkItems).not.toHaveBeenCalled();
  });
});

describe("patrocinador em peça marcada", () => {
  it("sincronizar patrocinadores: 409 com a frase; limpar (lista vazia) passa", async () => {
    H.mundo.itens.p1 = peca("p1", { status: "requested", producaoInterna: true });
    const r = await chamar("POST /api/items/:id/sponsors/sync", { params: { id: "p1" }, userRole: "solicitacao", body: { sponsorIds: ["sp1"] } });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe(PI.ERRO_PATROCINADOR_NA_PRODUCAO_INTERNA);
    expect(H.storage.bulkSyncItemSponsors).not.toHaveBeenCalled();
    const limpar = await chamar("POST /api/items/:id/sponsors/sync", { params: { id: "p1" }, userRole: "solicitacao", body: { sponsorIds: [] } });
    expect(limpar.status, JSON.stringify(limpar.body)).toBe(200);
  });

  it("vincular um patrocinador avulso: 409", async () => {
    H.mundo.itens.p1 = peca("p1", { producaoInterna: true });
    const r = await chamar("POST /api/items/:id/sponsors", { params: { id: "p1" }, userRole: "admin", body: { sponsorId: "sp1" } });
    expect(r.status).toBe(409);
    expect(H.storage.addSponsorToItem).not.toHaveBeenCalled();
  });
});

describe("envio da lista (POST /api/events/:id/items/submit) com peças marcadas", () => {
  const ENVIO = "POST /api/events/:id/items/submit";

  it("a marcada vai para Pronto para Produção; a comum para a Vinculação; trilha e aviso à Gráfica", async () => {
    H.mundo.itens = {
      p1: peca("p1", { producaoInterna: true, instrucoesGrafica: INSTR }),
      p2: peca("p2"),
    };
    const r = await chamar(ENVIO, { params: { id: "ev-1" }, userRole: "solicitacao" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(H.mundo.itens.p1).toMatchObject({ status: "ready_for_production", producaoInterna: true, skipApproval: true });
    expect(H.mundo.itens.p1.approvedAt).toBeInstanceOf(Date);
    expect(H.mundo.itens.p2.status).toBe("awaiting_linking");
    expect(r.body.diretoParaGrafica).toEqual(["#0001"]);
    expect(H.trilha.some((t) => t.includes("Enviada direto para a Gráfica (produção interna, sem passar pela Arte) no envio da lista"))).toBe(true);
    const avisos = H.storage.createNotification.mock.calls.map((c: any[]) => c[0]);
    expect(avisos.find((a: any) => a.targetRoles.includes("grafica"))?.message).toContain("#0001");
    // O aviso da Arte fala só da peça comum.
    expect(avisos.find((a: any) => a.type === "itemsSubmitted")?.message).toContain("1 novo item");
  });

  it("marcada sem arquivo e sem instrução FICA no rascunho, com o motivo; as outras seguem", async () => {
    H.mundo.itens = {
      p1: peca("p1", { producaoInterna: true }),
      p2: peca("p2"),
    };
    const r = await chamar(ENVIO, { params: { id: "ev-1" }, userRole: "solicitacao" });
    expect(r.status).toBe(200);
    expect(H.mundo.itens.p1.status).toBe("draft");
    expect(r.body.ficaramNoRascunho[0]).toMatchObject({ displayId: "#0001" });
    expect(r.body.ficaramNoRascunho[0].motivo).toMatch(/instruções/);
    expect(H.mundo.itens.p2.status).toBe("awaiting_linking");
  });

  it("só marcadas sem nada: 400 dizendo por quê, nada anda", async () => {
    H.mundo.itens = { p1: peca("p1", { producaoInterna: true }) };
    const r = await chamar(ENVIO, { params: { id: "ev-1" }, userRole: "solicitacao" });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("#0001");
    expect(H.mundo.itens.p1.status).toBe("draft");
  });

  it("marcada que ganhou patrocinador por outra porta fica no rascunho", async () => {
    H.mundo.itens = { p1: peca("p1", { producaoInterna: true, instrucoesGrafica: INSTR }), p2: peca("p2") };
    vinculos = [{ itemId: "p1", sponsorId: "sp1" }];
    const r = await chamar(ENVIO, { params: { id: "ev-1" }, userRole: "admin" });
    expect(r.status).toBe(200);
    expect(H.mundo.itens.p1.status).toBe("draft");
    expect(r.body.ficaramNoRascunho[0].motivo).toMatch(/patrocinador/i);
  });
});
