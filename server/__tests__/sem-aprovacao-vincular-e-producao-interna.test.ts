// ─────────────────────────────────────────────────────────────────────────────
// PEÇAS SEM APROVAÇÃO — rodada de 27/10 (as bordas da regra única):
//   1. vincular ≥1 patrocinador (o sync da Vinculação, inclusive o "Aplicar em
//      lote") desmarca "Arte do cliente" e "Sem patrocínio" — salvo quando o
//      corpo pede skipApproval:true junto — com a frase na trilha;
//   2. a PRODUÇÃO INTERNA grava skipApproval por dentro, mas não é "Sem
//      patrocínio": nem na Gestão de Prazos, nem nas Análises, nem no filtro;
//   3. a frase da trilha fora do Layout não diz que "a Aprovação volta";
//   (4. a invariante do storage está em sem-aprovacao-invariante-storage.test.ts.)
// O harness (rotas reais, banco mockado) é o de prazos-sem-aprovacao.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { txDeMentira } from "./tx-de-mentira";

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/banco_nunca_acessado";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: {} as Record<string, any>,
  mundo: { itens: {} as Record<string, any> },
  trilha: [] as Array<{ id: string; det: string; quem: string }>,
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
    requireAdmin: (req: any, res: any, next: any) => (req.userRole === "admin" ? next() : res.status(403).json({ error: "só admin" })),
    requireRole: (...papeis: string[]) => (req: any, res: any, next: any) =>
      (papeis.includes(req.userRole) ? next() : res.status(403).json({ error: "sem permissão" })),
    broadcast: () => {},
    createAuditLog: async (q: any, _a: string, _t: string, id: string, det: string) => { H.trilha.push({ id, det, quem: q?.userName ?? "" }); },
    createAuditLogsEmLote: async (q: any, linhas: Array<{ entityId: string; details?: string }>) => {
      for (const l of linhas) H.trilha.push({ id: l.entityId, det: l.details ?? "", quem: q?.userName ?? "" });
    },
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
const { registerEventRoutes, enrichEvent } = await import("../routes/events");
const { buildEventPrazo, computeKpis } = await import("../services/prazo-domain");
const PA = await import("@shared/prazo-sem-aprovacao");
const PO = await import("@shared/painel-operacional");
type DomainItem = import("../services/prazo-domain").DomainItem;
type DomainEvent = import("../services/prazo-domain").DomainEvent;

// ── O exemplo-base ───────────────────────────────────────────────────────────
const dia = (s: string) => Date.parse(`${s}T00:00:00Z`);
const SAIDA = "2026-11-30T00:00:00.000Z"; // segunda
const LAYOUT = "2026-11-10";
const AJUSTADO = "2026-11-17";
const APROVACAO = "2026-11-18";
const FINALIZACAO = "2026-11-20";
const N = 7;

const evento = (over: Partial<DomainEvent> = {}): DomainEvent => ({
  id: "ev-1", name: "CORRIDA NORTE", status: "created", priority: null,
  startDate: "2026-12-05T00:00:00.000Z", truckDepartureDate: SAIDA, createdBy: null, ...over,
});
let seq = 0;
const item = (over: Partial<DomainItem> = {}): DomainItem => {
  seq += 1;
  return { id: `it-${seq}`, displayId: `#0${seq}`, status: "awaiting_submission", type: "Banner", description: null, quantity: 1, ...over };
};
const prazos = (itens: DomainItem[], hoje: string) => {
  const r = buildEventPrazo(evento(), itens, { today: dia(hoje), diasDaAprovacao: N });
  expect(r).not.toBeNull();
  return r!;
};
const etapa = (ev: ReturnType<typeof prazos>, key: string) => ev.stages.find((s) => s.key === key)!;
const PRAZOS_DO_EVENTO = ["2026-11-05", LAYOUT, APROVACAO, FINALIZACAO, "2026-11-23", "2026-11-28"];


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

async function chamar(chave: string, ctx: { params?: any; body?: any; userRole: string; userName?: string }) {
  const hs = rotas.get(chave);
  if (!hs) throw new Error(`Rota não registrada: ${chave}`);
  const req: any = { params: ctx.params ?? {}, body: ctx.body ?? {}, query: {}, headers: {}, userRole: ctx.userRole, userId: "u1", userName: ctx.userName ?? "Maria", session: { userId: "u1", userRole: ctx.userRole } };
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
  id, displayId: `#0${id.replace(/\D/g, "").padStart(3, "0")}`, eventId: "ev-1", type: "Banner", description: "Banner",
  quantity: 2, quantityProduced: 0, reuseQty: 0, isReuse: false, status: "awaiting_submission", skipApproval: false,
  arteDoCliente: false, arteRecebidaEm: null, arteRecebidaPor: null, arteDoClienteMarcadaEm: null, arteDoClienteMarcadaPor: null,
  deletedAt: null, parentItemId: null, kitRemessaId: null, criadoPorId: "u9", observations: "", approvalThumbUrl: null,
  finalFileUrl: null, finalFileName: null, travadaEm: null, producaoInterna: false, instrucoesGrafica: null,
  calculatedM2: "2.00", material: "Lona", finish: "Ilhós", measurement: "1.00 × 1.00", fileWidth: "1", fileHeight: "1", area: "1", visual: "1",
  createdAt: new Date("2026-10-01"),
  ...over,
});

let vinculos: Array<{ itemId: string; sponsorId: string }>;
const EVENTO_ROTA = { id: "ev-1", name: "CORRIDA NORTE", status: "created", startDate: "2099-12-05", truckDepartureDate: new Date(SAIDA), deadlineEntregaLayouts: null };

beforeEach(() => {
  H.mundo.itens = {};
  H.trilha.length = 0;
  vinculos = [];
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, {
    getItem: vi.fn(async (id: string) => (H.mundo.itens[id] ? { ...H.mundo.itens[id] } : undefined)),
    getItemsByIds: vi.fn(async (ids: string[]) => ids.map((id) => H.mundo.itens[id]).filter(Boolean).map((p) => ({ ...p }))),
    updateItem: vi.fn(async (id: string, dados: any) => (H.mundo.itens[id] ? (H.mundo.itens[id] = { ...H.mundo.itens[id], ...dados }) : undefined)),
    getEvent: vi.fn(async () => EVENTO_ROTA),
    createNotification: vi.fn(async (n: any) => ({ id: "n1", ...n })),
    getItemSponsors: vi.fn(async (itemId: string) => vinculos.filter((v) => v.itemId === itemId)),
    getItemSponsorApprovals: vi.fn(async () => []),
    initializeItemSponsorApprovals: vi.fn(async () => {}),
    getSponsor: vi.fn(async (id: string) => ({ id, name: id, strictApproval: false })),
    createItemArtVersion: vi.fn(async () => ({})),
    getLiveComplements: vi.fn(async () => []),
  });
  H.db.transaction = vi.fn(async (fn: any) => fn(txDeMentira(H.mundo, [])));
  H.db.execute = vi.fn(async () => ({ rows: [] }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const SYNC = "POST /api/items/:id/sponsors/sync";
const ACRESCENTAR = "POST /api/items/bulk-add-sponsor";
const PATCH = "PATCH /api/items/:id";
const trilha = () => H.trilha.map((t) => t.det).join(" ");
const prepararSync = () => Object.assign(H.storage, {
  bulkSyncItemSponsors: vi.fn(async (itemId: string, ids: string[]) => {
    vinculos = vinculos.filter((v) => v.itemId !== itemId).concat(ids.map((sponsorId) => ({ itemId, sponsorId })));
  }),
});

// ═════════════════════════════════════════════════════════════════════════════
describe("1 — vincular patrocinador numa peça marcada (o sync da Vinculação)", () => {
  it("“Arte do cliente” cai ao vincular ≥1 patrocinador, com a frase na trilha (a peça não pula mais a Aprovação)", async () => {
    prepararSync();
    H.mundo.itens.p1 = peca("p1", { status: "awaiting_linking", arteDoCliente: true, arteDoClienteMarcadaPor: "Sofia", arteDoClienteMarcadaEm: new Date("2026-11-01") });
    const r = await chamar(SYNC, { params: { id: "p1" }, userRole: "solicitacao", body: { sponsorIds: ["s1"], skipApproval: false } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(H.mundo.itens.p1).toMatchObject({ arteDoCliente: false, arteDoClienteMarcadaPor: null, arteDoClienteMarcadaEm: null, arteRecebidaEm: null, skipApproval: false });
    expect(PA.pulaAprovacao(H.mundo.itens.p1)).toBe(false);
    expect(trilha()).toContain("“Arte do cliente” desmarcada (patrocinador vinculado)");
    expect(trilha()).toContain("a Aprovação volta para a peça");
  });

  it("“Sem patrocínio” cai mesmo quando o corpo não fala dela", async () => {
    prepararSync();
    H.mundo.itens.p1 = peca("p1", { status: "awaiting_linking", skipApproval: true });
    const r = await chamar(SYNC, { params: { id: "p1" }, userRole: "arte", body: { sponsorIds: ["s1"] } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(H.mundo.itens.p1.skipApproval).toBe(false);
    expect(trilha()).toContain("“Sem patrocínio” desmarcada (patrocinador vinculado)");
  });

  it("corpo com skipApproval:true junto: vale o que o corpo pediu (Sem patrocínio fica); a Arte do cliente cai", async () => {
    prepararSync();
    H.mundo.itens.p1 = peca("p1", { status: "awaiting_linking", skipApproval: true, arteDoCliente: true });
    const r = await chamar(SYNC, { params: { id: "p1" }, userRole: "solicitacao", body: { sponsorIds: ["s1"], skipApproval: true } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(H.mundo.itens.p1).toMatchObject({ skipApproval: true, arteDoCliente: false });
    expect(trilha()).not.toContain("“Sem patrocínio” desmarcada");
    expect(trilha()).toContain("“Arte do cliente” desmarcada (patrocinador vinculado)");
    expect(trilha()).toContain("segue o ajustado pela outra marca");
  });

  it("sync vazio (limpar patrocinadores) não mexe nas marcas", async () => {
    prepararSync();
    H.mundo.itens.p1 = peca("p1", { status: "awaiting_linking", skipApproval: true, arteDoCliente: true });
    const r = await chamar(SYNC, { params: { id: "p1" }, userRole: "solicitacao", body: { sponsorIds: [] } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(H.mundo.itens.p1).toMatchObject({ skipApproval: true, arteDoCliente: true });
    expect(H.storage.updateItem).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("2 — a produção interna não é “Sem patrocínio”", () => {
  const INTERNA = { skipApproval: true, producaoInterna: true };

  it("a regra única: sem marca, sem Layout ajustado, sem pular a Aprovação", () => {
    expect(PA.semPatrocinio(INTERNA)).toBe(false);
    expect(PA.pulaAprovacao(INTERNA)).toBe(false);
    expect(PA.semPatrocinio({ skipApproval: true })).toBe(true);
    expect(PA.prazosDeLayoutDaPeca(INTERNA, LAYOUT, N)).toBeNull();
    // Em rascunho, medida pelo marco normal (Lista de Imagens), não pelo Layout ajustado.
    const pd = PA.prazoDaPeca({ status: "draft", ...INTERNA }, PRAZOS_DO_EVENTO, N)!;
    expect(pd).toMatchObject({ marco: PA.INDICE_LISTA, prazo: PRAZOS_DO_EVENTO[PA.INDICE_LISTA], ajustado: false, piso: null });
    // Revisão 27/10 (3ª rodada): a "Arte do cliente" também não se aplica à
    // produção interna nem ao molde — não passam por aprovação nenhuma.
    expect(PA.pulaAprovacao({ ...INTERNA, arteDoCliente: true })).toBe(false);
    expect(PA.semPatrocinio({ skipApproval: true, type: "MOLDE" })).toBe(false);
    expect(PA.arteDoCliente({ arteDoCliente: true, type: "MOLDE" })).toBe(false);
  });

  it("Gestão de Prazos: a linha não diz “Sem patrocínio” e o prazo é o normal", () => {
    const ev = prazos([item({ id: "int", status: "awaiting_submission", ...INTERNA }), item({ id: "sem", skipApproval: true })], "2026-11-12");
    const linha = (id: string) => ev.pendingItems.find((p) => p.id === id)!;
    expect(linha("int")).toMatchObject({ semPatrocinio: false, prazo: LAYOUT, prazoDeLayout: null });
    expect(linha("sem")).toMatchObject({ semPatrocinio: true, prazo: AJUSTADO });
    // A interna segura a Aprovação como qualquer peça comum (coerente com pulaAprovacao).
    expect(etapa(ev, "aprovacao").pendingCount).toBe(1);
  });

  it("a Aprovação “pulada” (upcoming) continua valendo quando só há peças com marca antes dela", () => {
    const so = prazos([item({ skipApproval: true }), item({ arteDoCliente: true, arteRecebidaEm: "2026-11-12" })], "2026-11-19");
    expect(etapa(so, "aprovacao")).toMatchObject({ pendingCount: 0, state: "upcoming" });
  });

  it("Análises: a linha, o indicador e o filtro de marca deixam a interna fora de “Sem patrocínio”", () => {
    const doms = [item({ id: "int", ...INTERNA }), item({ id: "sem", skipApproval: true })].map((p) => ({ ...p, eventId: "ev-1" }));
    const ev = buildEventPrazo(evento(), doms, { today: dia("2026-11-12"), diasDaAprovacao: N })!;
    const painel = PO.montarPainelOperacional({
      pecas: doms, prazos: [ev], kpis: computeKpis([ev]), hoje: "2026-11-12", geradoEm: "2026-11-12T12:00:00Z",
      nomeDoEvento: new Map([["ev-1", "CORRIDA NORTE"]]), diasDaAprovacao: N,
    });
    const linha = painel.pecas.find((p) => p.id === "int")!;
    expect(linha).toMatchObject({ semPatrocinio: false, semAprovacao: false, prazoFase: LAYOUT, prazoDeLayout: null, piso: null });
    const ids = (f: import("@shared/painel-operacional").FiltroDeMarca) => painel.pecas.filter((p) => PO.passaNoFiltroDeMarca(p, f)).map((p) => p.id).sort();
    expect(ids("semPatrocinio")).toEqual(["sem"]);
    expect(ids("semAprovacao")).toEqual(["sem"]);
    expect(ids("comAprovacao")).toEqual(["int"]);
  });

  it("a trilha não fala de “Sem patrocínio” quando quem mexe no skipApproval é a produção interna", async () => {
    const { frasesDasMarcas } = await import("../services/marcas-de-aprovacao");
    const ctx = { prazoDeLayout: LAYOUT, diasDaAprovacao: N };
    expect(frasesDasMarcas({ status: "draft", producaoInterna: true }, { status: "ready_for_production", ...INTERNA }, ctx)).toEqual([]);
    expect(frasesDasMarcas({ status: "draft" }, { status: "draft", skipApproval: true }, ctx)[0]).toContain("“Sem patrocínio” marcada");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("3 — a frase da trilha fora do Layout não promete a Aprovação de volta", () => {
  const prazosDoLayout = { normal: LAYOUT, ajustado: AJUSTADO };

  it("a função: em Layout (ou sem status) a Aprovação volta; depois dela, a peça segue onde está", () => {
    const f = (status?: string) => PA.fraseDaTrilhaDaMarca("semPatrocinio", false, prazosDoLayout, N, false, undefined, status);
    expect(f()).toContain("volta a valer o normal; a Aprovação volta para a peça");
    expect(f("awaiting_submission")).toContain("a Aprovação volta para a peça");
    expect(f("draft")).toContain("a Aprovação volta para a peça");
    expect(f("awaiting_sponsor_approval")).toContain("a Aprovação volta para a peça");
    for (const status of ["awaiting_creator_review", "awaiting_final_review", "ready_for_production", "produced"]) {
      expect(f(status), status).toContain("volta a valer o prazo normal; a peça segue na etapa em que está");
      expect(f(status), status).not.toContain("a Aprovação volta");
    }
  });

  it("rota: o admin desmarca uma peça que já saiu do Layout — a trilha diz a verdade", async () => {
    H.mundo.itens.p1 = peca("p1", { status: "awaiting_final_review", arteDoCliente: true, arteRecebidaEm: "2026-11-05" });
    const r = await chamar(PATCH, { params: { id: "p1" }, userRole: "admin", userName: "Ana Admin", body: { arteDoCliente: false } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(H.mundo.itens.p1.status).toBe("awaiting_final_review");
    expect(trilha()).toContain("“Arte do cliente” desmarcada");
    expect(trilha()).toContain("a peça segue na etapa em que está");
    expect(trilha()).not.toContain("a Aprovação volta para a peça");
  });

  it("rota: acrescentar patrocinador que REABRE a aprovação diz que ela volta (é verdade ali)", async () => {
    Object.assign(H.storage, {
      getEventSponsors: vi.fn(async () => [{ sponsorId: "s1" }]),
      addSponsorToEvent: vi.fn(async () => ({})),
      addSponsorToItem: vi.fn(async (v: any) => { vinculos.push(v); return v; }),
      getItemSponsorApproval: vi.fn(async () => undefined),
      createItemSponsorApproval: vi.fn(async () => ({})),
    });
    H.mundo.itens.p1 = peca("p1", { status: "awaiting_creator_review", arteDoCliente: true, arteRecebidaEm: "2026-11-12" });
    await chamar(ACRESCENTAR, { body: { sponsorId: "s1", itemIds: ["p1"] }, userRole: "admin", userName: "Ana" });
    expect(H.mundo.itens.p1.status).toBe("awaiting_sponsor_approval");
    expect(trilha()).toContain("“Arte do cliente” desmarcada (patrocinador acrescentado)");
    expect(trilha()).toContain("a Aprovação volta para a peça");
  });
});
