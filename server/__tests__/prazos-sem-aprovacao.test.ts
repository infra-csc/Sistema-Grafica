// ─────────────────────────────────────────────────────────────────────────────
// PRAZOS PARA PEÇAS SEM APROVAÇÃO — os 9 critérios de aceite do documento do
// Pedro (26/10, "Gestão Gráfica — Prazos para peças sem aprovação (sem
// patrocínio e arte do cliente)"), aprovado pelo dono ("faz o que está no
// documento").
//
// EXEMPLO-BASE do documento: Layout com prazo em 10/11 e Aprovação de 7 dias.
// Aqui: saída do caminhão segunda 30/11/2026 → Entrega de Layouts (−20) terça
// 10/11, Aprovação de Layout (−12) quarta 18/11, Finalização (−10) sexta 20/11.
// Layout ajustado = 10/11 + 7 dias corridos = terça 17/11.
//
// Os critérios rodam nas DUAS camadas que importam: a regra pura (a função
// única de @shared/prazo-sem-aprovacao, o domínio da Gestão de Prazos, as
// Análises e o card do evento) e as ROTAS reais (marcar, desmarcar, travar
// depois do Layout, "Arte recebida", lote e trilha), com o banco mockado.
// Nenhum teste lê o relógio do domínio: o "hoje" é injetado.
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

// ═════════════════════════════════════════════════════════════════════════════
describe("a regra única (shared/prazo-sem-aprovacao)", () => {
  it("o exemplo-base cai onde o documento diz (terça → terça, sem ajuste de fim de semana)", () => {
    expect(PA.prazoDeLayoutAjustado(LAYOUT, 7)).toBe(AJUSTADO);
    expect(PA.DIAS_DA_APROVACAO_PADRAO).toBe(7);
  });

  it("dias CORRIDOS, e a data resultante na regra do Layout (seg–sex)", () => {
    // 10/11 (terça) + 4 = sábado 14/11 → sexta 13/11; + 5 = domingo 15/11 → segunda 16/11.
    expect(PA.prazoDeLayoutAjustado(LAYOUT, 4)).toBe("2026-11-13");
    expect(PA.prazoDeLayoutAjustado(LAYOUT, 5)).toBe("2026-11-16");
    expect(PA.prazoDeLayoutAjustado(LAYOUT, 3)).toBe("2026-11-13");
  });

  it("a configuração: inteiro de 1 a 30; o resto cai no padrão", () => {
    expect(PA.diasDaAprovacaoOuPadrao(10)).toBe(10);
    expect(PA.diasDaAprovacaoOuPadrao("12")).toBe(12);
    for (const ruim of [0, 31, 2.5, "x", null, undefined, -3]) expect(PA.diasDaAprovacaoOuPadrao(ruim)).toBe(7);
  });

  it("Kit (26/10: cobrado da Entrega de Layouts) — com marca, o Layout ajustado como qualquer peça", () => {
    const pd = PA.prazoDaPeca({ status: "awaiting_submission", skipApproval: true, kitRemessaId: "k1" }, PRAZOS_DO_EVENTO, N)!;
    expect(pd.marco).toBe(PA.INDICE_LAYOUT);
    expect(pd.prazo).toBe(AJUSTADO);
    expect(PA.prazosDeLayoutDaPeca({ skipApproval: true, kitRemessaId: "k1" }, LAYOUT, N)).toEqual({ normal: LAYOUT, ajustado: AJUSTADO });
    // Sem marca, o Kit na Lista de Imagens é medido pela Entrega de Layouts (não pela Lista).
    const kit = PA.prazoDaPeca({ status: "requested", kitRemessaId: "k1" }, PRAZOS_DO_EVENTO, N)!;
    expect(kit.marco).toBe(PA.INDICE_LAYOUT);
    expect(kit.prazo).toBe(LAYOUT);
  });

  it("a peça com marca em Lista de Imagens é medida pelo Layout ajustado (o Layout do documento é um só)", () => {
    const pd = PA.prazoDaPeca({ status: "requested", arteDoCliente: true }, PRAZOS_DO_EVENTO, N)!;
    expect(pd.marco).toBe(PA.INDICE_LAYOUT);
    expect(pd.prazo).toBe(AJUSTADO);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("critério 1 — Sem patrocínio: prazo de Layout em 17/11 e não atrasada em 12/11", () => {
  it("a função única: 17/11, ajustado, normal 10/11", () => {
    const pd = PA.prazoDaPeca({ status: "awaiting_submission", skipApproval: true }, PRAZOS_DO_EVENTO, N)!;
    expect(pd).toMatchObject({ marco: PA.INDICE_LAYOUT, prazo: AJUSTADO, prazoNormal: LAYOUT, ajustado: true, piso: AJUSTADO });
  });

  it("Gestão de Prazos em 12/11: a peça sem patrocínio não está atrasada; a comum, no mesmo evento, está", () => {
    const sem = item({ skipApproval: true });
    const so = prazos([sem], "2026-11-12");
    expect(so.pendingItems[0]).toMatchObject({ prazo: AJUSTADO, semPatrocinio: true, prazoDeLayout: { normal: LAYOUT, ajustado: AJUSTADO } });
    expect(etapa(so, "layouts")).toMatchObject({ deadline: LAYOUT, prazoEfetivo: AJUSTADO, atrasadas: 0 });
    expect(etapa(so, "layouts").state).not.toBe("overdue");
    expect(so.categoria).toBe("emDia");
    expect(so.pecasEmAtraso).toBe(0);

    const comum = item();
    const misto = prazos([sem, comum], "2026-11-12");
    expect(etapa(misto, "layouts")).toMatchObject({ state: "overdue", prazoEfetivo: LAYOUT, pendingCount: 2, atrasadas: 1 });
    expect(misto.pecasEmAtraso).toBe(1); // só a comum
  });

  it("em 18/11 (depois do ajustado) a sem patrocínio está atrasada — e é atraso INTERNO", () => {
    const ev = prazos([item({ skipApproval: true })], "2026-11-18");
    expect(etapa(ev, "layouts").state).toBe("overdue");
    expect(ev.pendingItems[0].atrasoDoCliente).toBe(false);
    expect(ev.pecasAtrasoDoCliente).toBe(0);
  });
});

describe("critério 2 — as duas marcas: 17/11, não 24/11", () => {
  it("a extensão soma uma vez só", () => {
    const pd = PA.prazoDaPeca({ status: "awaiting_submission", skipApproval: true, arteDoCliente: true, arteRecebidaEm: "2026-11-01" }, PRAZOS_DO_EVENTO, N)!;
    expect(pd.prazo).toBe(AJUSTADO);
    expect(pd.prazo).not.toBe("2026-11-24");
    const ev = prazos([item({ skipApproval: true, arteDoCliente: true })], "2026-11-12");
    expect(ev.pendingItems[0].prazo).toBe(AJUSTADO);
  });
});

describe("critério 3 — sai de Layout direto para a Finalização; o prazo da Finalização não muda", () => {
  it("o prazo da Finalização (e o final) é o mesmo com e sem marca (RN05)", () => {
    const com = prazos([item({ status: "awaiting_creator_review", skipApproval: true, arteDoCliente: true })], "2026-11-12");
    const sem = prazos([item({ status: "awaiting_creator_review" })], "2026-11-12");
    expect(etapa(com, "finalizacao").deadline).toBe(FINALIZACAO);
    expect(com.pendingItems[0].prazo).toBe(FINALIZACAO);
    expect(sem.pendingItems[0].prazo).toBe(FINALIZACAO);
    expect(com.stages.map((s) => s.deadline)).toEqual(sem.stages.map((s) => s.deadline));
    // Depois do Layout a marca não estende nada.
    expect(com.pendingItems[0].prazo).toBe(com.stages[3].deadline);
  });

  it("a máquina de estados: Aguardando Envio → Finalização pela Arte recebida", async () => {
    const M = await import("@shared/maquina-de-estados");
    expect(M.proximoStatus("awaiting_submission", "receber-arte-do-cliente")).toBe("awaiting_creator_review");
    expect(M.proximoStatus("requested", "registrar-arte-do-cliente-recebida")).toBe("requested");
  });

  it("nas Análises a peça com marca não passa pela fase de Aprovação", () => {
    expect(PO.passosPendentes(1, true)).toEqual([1, 3, 4]);
    expect(PO.passosPendentes(1, false)).toEqual([1, 2, 3, 4]);
  });
});

describe("critério 5 — Arte do cliente não recebida em 18/11 = Atraso do cliente, não interno", () => {
  it("Gestão de Prazos: atrasada, classificada como do cliente", () => {
    const ev = prazos([item({ arteDoCliente: true, status: "awaiting_submission" })], "2026-11-18");
    expect(ev.pendingItems[0]).toMatchObject({ aguardandoArteDoCliente: true, atrasoDoCliente: true });
    expect(ev.categoria).toBe("atrasado");
    expect(ev.pecasEmAtraso).toBe(1);
    expect(ev.pecasAtrasoDoCliente).toBe(1);
    expect(computeKpis([ev]).pecasAtrasoDoCliente).toBe(1);
  });

  it("antes do ajustado (17/11) ela espera, mas não está atrasada", () => {
    const ev = prazos([item({ arteDoCliente: true })], "2026-11-17");
    expect(ev.pendingItems[0]).toMatchObject({ aguardandoArteDoCliente: true, atrasoDoCliente: false });
    expect(ev.categoria).toBe("emDia");
  });

  it("com a arte já recebida e a peça ainda em Layout, o atraso é INTERNO", () => {
    const ev = prazos([item({ arteDoCliente: true, arteRecebidaEm: "2026-11-15" })], "2026-11-18");
    expect(ev.pendingItems[0]).toMatchObject({ aguardandoArteDoCliente: false, atrasoDoCliente: false });
    expect(ev.pecasEmAtraso).toBe(1);
  });
});

describe("critério 6 — desmarcar devolve o Layout para 10/11 e reativa a Aprovação", () => {
  it("sem marca: 10/11, sem piso, e a Aprovação volta a ser passo da peça (mesmo ficando atrasada)", () => {
    const pd = PA.prazoDaPeca({ status: "awaiting_submission", skipApproval: false }, PRAZOS_DO_EVENTO, N)!;
    expect(pd).toMatchObject({ prazo: LAYOUT, ajustado: false, piso: null });
    expect(PA.pulaAprovacao({ skipApproval: false, arteDoCliente: false })).toBe(false);
    const ev = prazos([item({ skipApproval: false })], "2026-11-12");
    expect(etapa(ev, "layouts").state).toBe("overdue");
    expect(ev.pendingItems[0].prazo).toBe(LAYOUT);
  });
});

describe("critério 8 — painéis e filtros: prazo ajustado e interno × cliente", () => {
  const montar = (pecas: any[], hoje: string) => {
    const doms = pecas.map((p) => ({ ...p, eventId: "ev-1" }));
    const ev = buildEventPrazo(evento(), doms, { today: dia(hoje), diasDaAprovacao: N })!;
    return PO.montarPainelOperacional({
      pecas: doms, prazos: [ev], kpis: computeKpis([ev]), hoje, geradoEm: `${hoje}T12:00:00Z`,
      nomeDoEvento: new Map([["ev-1", "CORRIDA NORTE"]]), diasDaAprovacao: N,
    });
  };

  it("Análises: prazo da fase e dias de atraso pelo ajustado; Problemas separa interno × cliente; o indicador e o filtro", () => {
    const pecas = [
      item({ id: "sem", skipApproval: true }),
      item({ id: "cli", arteDoCliente: true, arteDoClienteMarcadaEm: "2026-11-10T13:00:00Z" } as any),
      item({ id: "com" }),
    ];
    const em12 = montar(pecas, "2026-11-12");
    const linha = (id: string) => em12.pecas.find((p) => p.id === id)!;
    expect(linha("sem")).toMatchObject({ prazoFase: AJUSTADO, diasAtraso: 0, semAprovacao: true, semPatrocinio: true, prazoDeLayout: { normal: LAYOUT, ajustado: AJUSTADO } });
    expect(linha("cli")).toMatchObject({ prazoFase: AJUSTADO, diasAtraso: 0, aguardandoArteCliente: true, diasAguardandoArte: 2 });
    expect(linha("com")).toMatchObject({ prazoFase: LAYOUT, diasAtraso: 2 });

    const em18 = montar(pecas, "2026-11-18");
    const prob = PO.problemasPorEvento(em18.pecas)[0];
    expect(prob).toMatchObject({ atrasadas: 3, atrasoCliente: 1, atrasoInterno: 2 });
    expect(PO.pecasComProblema(em18.pecas, "atrasoCliente", null).map((p) => p.id)).toEqual(["cli"]);
    expect(PO.pecasComProblema(em18.pecas, "atrasoInterno", null).map((p) => p.id).sort()).toEqual(["com", "sem"]);
    expect(em18.resumo).toMatchObject({ atrasoClienteAbertas: 1, aguardandoArteAbertas: 1 });
    expect(PO.aguardandoArtePorEvento(em18.pecas)).toEqual([{ evento: "ev-1", pecas: 1, diasMedios: 8, atrasadas: 1 }]);

    const ids = (f: import("@shared/painel-operacional").FiltroDeMarca) => em18.pecas.filter((p) => PO.passaNoFiltroDeMarca(p, f)).map((p) => p.id).sort();
    expect(ids("semPatrocinio")).toEqual(["sem"]);
    expect(ids("arteDoCliente")).toEqual(["cli"]);
    expect(ids("aguardandoArte")).toEqual(["cli"]);
    expect(ids("semAprovacao")).toEqual(["cli", "sem"]);
    expect(ids("comAprovacao")).toEqual(["com"]);
  });

  it("Eventos × processo × prazo: a célula de Layout só com peças sem aprovação não fica atrasada em 12/11", () => {
    const so = montar([item({ id: "a", skipApproval: true }), item({ id: "b", arteDoCliente: true })], "2026-11-12");
    const cel = PO.eventosProcessoPrazo(so).linhas[0].fases.find((f) => f.n === 1)!;
    expect(cel).toMatchObject({ prazo: LAYOUT, prazoEfetivo: AJUSTADO, pendentes: 2 });
    expect(cel.situacao).not.toBe("atrasada");
    const misto = montar([item({ id: "a", skipApproval: true }), item({ id: "c" })], "2026-11-12");
    expect(PO.eventosProcessoPrazo(misto).linhas[0].fases.find((f) => f.n === 1)!.situacao).toBe("atrasada");
    // Pendências de pré-produção: só a comum conta como atrasada.
    expect(PO.pendenciasPorEvento(misto)[0].atrasados.layout).toBe(1);
  });

  it("o card do evento (próximo marco) aponta o Layout ajustado quando só restam peças sem aprovação", () => {
    const ev = { ...evento(), deadlineEntregaLayouts: null };
    const r = enrichEvent(ev, [{ id: "x", eventId: "ev-1", status: "awaiting_submission", skipApproval: true }], [], dia("2026-11-12"), N);
    expect(r.nextMilestone).toMatchObject({ key: "layouts", deadline: AJUSTADO, state: "upcoming" });
    const comum = enrichEvent(ev, [{ id: "y", eventId: "ev-1", status: "awaiting_submission", skipApproval: false }], [], dia("2026-11-12"), N);
    expect(comum.nextMilestone).toMatchObject({ key: "layouts", deadline: LAYOUT, state: "overdue" });
  });

  it("a configuração muda o N em todo lugar (ex.: 10 dias → 20/11)", () => {
    const ev = buildEventPrazo(evento(), [item({ skipApproval: true })], { today: dia("2026-11-12"), diasDaAprovacao: 10 })!;
    expect(ev.pendingItems[0].prazo).toBe("2026-11-20");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// As ROTAS — critérios 4, 6, 7 e 9.
// ═════════════════════════════════════════════════════════════════════════════
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
    getItemSponsorsByItemIds: vi.fn(async (ids: string[]) => vinculos.filter((v) => ids.includes(v.itemId))),
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

const PATCH = "PATCH /api/items/:id";
const RECEBIDA = "POST /api/items/:id/arte-recebida";
const LOTE = "POST /api/items/marcas-sem-aprovacao";

describe("critério 4 — Arte do cliente mostra “Aguardando arte do cliente” até alguém marcar Arte recebida", () => {
  it("marcada: aguardando; Arte recebida (Arte, com data): sai da espera e vai para a Finalização", async () => {
    H.mundo.itens.p1 = peca("p1", { arteDoCliente: true });
    expect(PA.aguardandoArteDoCliente(H.mundo.itens.p1)).toBe(true);
    // Enviar para aprovação com a espera aberta é recusado: quem encerra é a Arte recebida.
    const envio = await chamar("PATCH /api/items/:id/submit-for-approval", { params: { id: "p1" }, userRole: "arte", body: { approvalThumbUrl: "/objects/uploads/x.png" } });
    expect(envio.status).toBe(409);
    expect(envio.body.code).toBe("AGUARDANDO_ARTE_DO_CLIENTE");

    const r = await chamar(RECEBIDA, { params: { id: "p1" }, userRole: "arte", userName: "Ana Arte", body: { data: "2020-01-02" } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(H.mundo.itens.p1).toMatchObject({ arteRecebidaEm: "2020-01-02", arteRecebidaPor: "Ana Arte", status: "awaiting_creator_review" });
    expect(PA.aguardandoArteDoCliente(H.mundo.itens.p1)).toBe(false);
    expect(H.trilha.at(-1)?.det).toMatch(/Arte do cliente recebida em 02\/01\/2020/);
    expect(H.trilha.at(-1)?.det).toMatch(/Aguardando Envio.*→/);
  });

  it("antes da Arte (solicitado) a chegada fica registrada e a peça segue o fluxo", async () => {
    H.mundo.itens.p1 = peca("p1", { arteDoCliente: true, status: "requested" });
    const r = await chamar(RECEBIDA, { params: { id: "p1" }, userRole: "solicitacao", body: {} });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(H.mundo.itens.p1.status).toBe("requested");
    expect(H.mundo.itens.p1.arteRecebidaEm).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(PA.aguardandoArteDoCliente(H.mundo.itens.p1)).toBe(false);
  });

  it("recusas: papel, peça sem a marca, data no futuro, peça fora do Layout", async () => {
    H.mundo.itens.p1 = peca("p1", { arteDoCliente: true });
    expect((await chamar(RECEBIDA, { params: { id: "p1" }, userRole: "grafica" })).status).toBe(403);
    expect((await chamar(RECEBIDA, { params: { id: "p1" }, userRole: "arte", body: { data: "2999-01-01" } })).status).toBe(400);
    H.mundo.itens.p2 = peca("p2");
    expect((await chamar(RECEBIDA, { params: { id: "p2" }, userRole: "arte" })).status).toBe(409);
    H.mundo.itens.p3 = peca("p3", { arteDoCliente: true, status: "awaiting_final_review" });
    expect((await chamar(RECEBIDA, { params: { id: "p3" }, userRole: "admin" })).status).toBe(409);
    expect(H.mundo.itens.p1.status).toBe("awaiting_submission");
  });

  it("Sem patrocínio enviada pela Arte vai direto para a Finalização (pula a Aprovação)", async () => {
    H.mundo.itens.p1 = peca("p1", { skipApproval: true });
    vinculos = [{ itemId: "p1", sponsorId: "sp1" }];
    const r = await chamar("PATCH /api/items/:id/submit-for-approval", { params: { id: "p1" }, userRole: "arte", body: { approvalThumbUrl: "/objects/uploads/x.png" } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(H.mundo.itens.p1.status).toBe("awaiting_creator_review");
  });
});

describe("critério 6 — desmarcar reativa a Aprovação (rota)", () => {
  it("com patrocinador, a peça desmarcada volta a ir para a Aprovação", async () => {
    H.mundo.itens.p1 = peca("p1", { skipApproval: true });
    vinculos = [{ itemId: "p1", sponsorId: "sp1" }];
    const des = await chamar(PATCH, { params: { id: "p1" }, userRole: "solicitacao", body: { skipApproval: false } });
    expect(des.status, JSON.stringify(des.body)).toBe(200);
    const r = await chamar("PATCH /api/items/:id/submit-for-approval", { params: { id: "p1" }, userRole: "arte", body: { approvalThumbUrl: "/objects/uploads/x.png" } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(H.mundo.itens.p1.status).toBe("awaiting_sponsor_approval");
  });
});

describe("critério 7 — depois do Layout a marca não muda (exceto admin)", () => {
  for (const status of ["awaiting_sponsor_approval", "awaiting_creator_review", "awaiting_final_review", "ready_for_production"]) {
    it(`${status}: Solicitação recebe 409; admin muda`, async () => {
      H.mundo.itens.p1 = peca("p1", { status });
      const r = await chamar(PATCH, { params: { id: "p1" }, userRole: "solicitacao", body: { arteDoCliente: true } });
      expect(r.status).toBe(409);
      expect(r.body.error).toBe(PA.FRASE_MARCA_TRAVADA);
      expect(H.mundo.itens.p1.arteDoCliente).toBe(false);
      const adm = await chamar(PATCH, { params: { id: "p1" }, userRole: "admin", body: { arteDoCliente: true } });
      if (status === "awaiting_sponsor_approval") {
        // Revisão 27/10: NA Aprovação nem o admin marca — sai dela pela
        // "Dispensar aprovação" (o servidor desfaria a marca ali).
        expect(adm.status).toBe(409);
        expect(adm.body.error).toContain("Dispensar aprovação");
        expect(H.mundo.itens.p1.arteDoCliente).toBe(false);
        return;
      }
      expect(adm.status, JSON.stringify(adm.body)).toBe(200);
      expect(H.mundo.itens.p1.arteDoCliente).toBe(true);
    });
  }

  it("em Layout a Solicitação muda; Arte e Atendimento não marcam", async () => {
    for (const status of ["draft", "requested", "awaiting_linking", "awaiting_submission"]) {
      H.mundo.itens.p1 = peca("p1", { status });
      expect((await chamar(PATCH, { params: { id: "p1" }, userRole: "solicitacao", body: { skipApproval: true } })).status, status).toBe(200);
    }
    H.mundo.itens.p2 = peca("p2");
    expect((await chamar(PATCH, { params: { id: "p2" }, userRole: "arte", body: { arteDoCliente: true } })).status).toBe(403);
    expect((await chamar(PATCH, { params: { id: "p2" }, userRole: "atendimento", body: { skipApproval: true } })).status).toBe(403);
  });

  it("o lote (RF02): marca as do Layout e deixa de fora, com o motivo, a que já saiu dele", async () => {
    H.mundo.itens.p1 = peca("p1", { status: "requested" });
    H.mundo.itens.p2 = peca("p2", { status: "awaiting_submission" });
    H.mundo.itens.p3 = peca("p3", { status: "awaiting_final_review" });
    const r = await chamar(LOTE, { userRole: "solicitacao", body: { itemIds: ["p1", "p2", "p3"], semPatrocinio: true, arteDoCliente: true } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.alteradas).toBe(2);
    expect(r.body.ficaramDeFora).toEqual([{ id: "p3", displayId: "#0003", motivo: PA.FRASE_MARCA_TRAVADA }]);
    expect(H.mundo.itens.p1).toMatchObject({ skipApproval: true, arteDoCliente: true, arteDoClienteMarcadaPor: "Maria" });
    expect(H.mundo.itens.p3).toMatchObject({ skipApproval: false, arteDoCliente: false });
    // O admin alcança a de fora.
    const adm = await chamar(LOTE, { userRole: "admin", body: { itemIds: ["p3"], semPatrocinio: true } });
    expect(adm.body.alteradas).toBe(1);
    // Papel errado e lote de dois eventos são recusados inteiros.
    expect((await chamar(LOTE, { userRole: "arte", body: { itemIds: ["p1"], semPatrocinio: false } })).status).toBe(403);
    H.mundo.itens.p9 = peca("p9", { eventId: "ev-2" });
    expect((await chamar(LOTE, { userRole: "admin", body: { itemIds: ["p1", "p9"], semPatrocinio: false } })).status).toBe(400);
  });
});

describe("critério 9 — o histórico mostra quem marcou/desmarcou cada marca e quando (com os dois prazos)", () => {
  it("marcar e desmarcar deixam linha com o usuário e os prazos normal × ajustado do momento", async () => {
    H.mundo.itens.p1 = peca("p1");
    await chamar(PATCH, { params: { id: "p1" }, userRole: "solicitacao", userName: "Sofia Solicitação", body: { skipApproval: true } });
    await chamar(PATCH, { params: { id: "p1" }, userRole: "solicitacao", userName: "Sofia Solicitação", body: { arteDoCliente: true } });
    await chamar(PATCH, { params: { id: "p1" }, userRole: "admin", userName: "Ana Admin", body: { skipApproval: false } });
    await chamar(PATCH, { params: { id: "p1" }, userRole: "admin", userName: "Ana Admin", body: { arteDoCliente: false } });
    const linhas = H.trilha.filter((t) => t.id === "p1");
    expect(linhas.map((l) => l.quem)).toEqual(["Sofia Solicitação", "Sofia Solicitação", "Ana Admin", "Ana Admin"]);
    expect(linhas[0].det).toContain("“Sem patrocínio” marcada — prazo de Layout: normal 10/11/2026 · ajustado 17/11/2026 (+7 dias corridos)");
    expect(linhas[1].det).toContain("“Arte do cliente” marcada");
    expect(linhas[2].det).toContain("“Sem patrocínio” desmarcada");
    expect(linhas[2].det).toContain("segue o ajustado pela outra marca");
    expect(linhas[3].det).toContain("“Arte do cliente” desmarcada");
    expect(linhas[3].det).toContain("volta a valer o normal; a Aprovação volta para a peça");
    // Quem marcou a Arte do cliente fica também na peça; ao desmarcar, sai junto com a chegada.
    expect(H.mundo.itens.p1).toMatchObject({ arteDoCliente: false, arteDoClienteMarcadaPor: null, arteRecebidaEm: null });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Revisão 27/10 — os caminhos laterais que mexiam nas marcas (revisor independente).
// ═════════════════════════════════════════════════════════════════════════════
describe("revisão 27/10 — caminhos laterais respeitam as marcas", () => {
  const ACRESCENTAR = "POST /api/items/bulk-add-sponsor";
  const prepararAcrescentar = () => Object.assign(H.storage, {
    getEventSponsors: vi.fn(async () => [{ sponsorId: "s1" }]),
    addSponsorToEvent: vi.fn(async () => ({})),
    addSponsorToItem: vi.fn(async (v: any) => { vinculos.push(v); return v; }),
    getItemSponsorApproval: vi.fn(async () => undefined),
    createItemSponsorApproval: vi.fn(async () => ({})),
  });

  it("acrescentar patrocinador fora do Layout: a Solicitação é recusada se a peça tem marca (RN07)", async () => {
    prepararAcrescentar();
    H.mundo.itens.p1 = peca("p1", { status: "awaiting_creator_review", arteDoCliente: true, arteRecebidaEm: "2026-11-12" });
    const r = await chamar(ACRESCENTAR, { body: { sponsorId: "s1", itemIds: ["p1"] }, userRole: "solicitacao" });
    expect(r.body.recusadas.map((x: any) => x.motivo).join(" ")).toContain("só um admin");
    expect(H.mundo.itens.p1.status).toBe("awaiting_creator_review");
    expect(H.mundo.itens.p1.arteDoCliente).toBe(true);
  });

  it("acrescentar patrocinador (admin) desmarca as duas marcas, reabre a aprovação e deixa a trilha (RN04/RN08/RN10)", async () => {
    prepararAcrescentar();
    H.mundo.itens.p1 = peca("p1", { status: "awaiting_creator_review", arteDoCliente: true, arteRecebidaEm: "2026-11-12" });
    await chamar(ACRESCENTAR, { body: { sponsorId: "s1", itemIds: ["p1"] }, userRole: "admin", userName: "Ana" });
    expect(H.mundo.itens.p1.status).toBe("awaiting_sponsor_approval");
    expect(H.mundo.itens.p1.arteDoCliente).toBe(false);
    expect(H.mundo.itens.p1.skipApproval).toBe(false);
    expect(H.trilha.map((t) => t.det).join(" ")).toContain("“Arte do cliente” desmarcada (patrocinador acrescentado)");
  });

  it("acrescentar patrocinador em Layout (Solicitação) desmarca “Sem patrocínio” com a frase na trilha", async () => {
    prepararAcrescentar();
    H.mundo.itens.p1 = peca("p1", { status: "awaiting_submission", skipApproval: true });
    await chamar(ACRESCENTAR, { body: { sponsorId: "s1", itemIds: ["p1"] }, userRole: "solicitacao" });
    expect(H.mundo.itens.p1.skipApproval).toBe(false);
    expect(H.mundo.itens.p1.status).toBe("awaiting_submission");
    expect(H.trilha.map((t) => t.det).join(" ")).toContain("“Sem patrocínio” desmarcada (patrocinador acrescentado)");
  });

  it("dispensar a aprovação não tira a peça da espera da arte do cliente (RN06)", async () => {
    H.mundo.itens.p1 = peca("p1", { arteDoCliente: true });
    const r = await chamar("PATCH /api/items/:id/dispense", { params: { id: "p1" }, body: { reason: "cliente mandou o arquivo por e-mail" }, userRole: "arte" });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("AGUARDANDO_ARTE_DO_CLIENTE");
    expect(H.mundo.itens.p1.status).toBe("awaiting_submission");
  });

  it("devolver para a Criação mantém as marcas (o prazo não muda em silêncio)", async () => {
    Object.assign(H.storage, { bulkSyncItemSponsors: vi.fn(async () => {}) });
    H.mundo.itens.p1 = peca("p1", { status: "awaiting_linking", skipApproval: true, arteDoCliente: true });
    const r = await chamar("POST /api/items/:id/return-to-creation", { params: { id: "p1" }, userRole: "solicitacao" });
    expect(r.status).toBe(200);
    expect(H.mundo.itens.p1.status).toBe("draft");
    expect(H.mundo.itens.p1.skipApproval).toBe(true);
    expect(H.mundo.itens.p1.arteDoCliente).toBe(true);
  });

  it("criação: só admin e Solicitação criam a peça já marcada; o lote deixa a frase na trilha; o complemento herda", async () => {
    const { readFileSync } = await import("fs");
    const CRIACAO = readFileSync(new URL("../routes/itens/criacao.ts", import.meta.url), "utf8");
    expect(CRIACAO).toContain("if ((validatedData.skipApproval || validatedData.arteDoCliente) && !PAPEIS_QUE_MARCAM.includes(req.userRole ?? \"\")) {");
    expect(CRIACAO).toContain("if ((parsed.skipApproval || parsed.arteDoCliente) && !PAPEIS_QUE_MARCAM.includes(req.userRole ?? \"\")) {");
    expect(CRIACAO).toContain("frasesDasMarcas({ skipApproval: false, arteDoCliente: false }, item, ctxDasMarcas, \"na criação\")");
    const STORAGE = readFileSync(new URL("../storage.ts", import.meta.url), "utf8");
    expect(STORAGE).toContain("arteDoCliente: parent.arteDoCliente,");
    expect(STORAGE).toContain("arteRecebidaEm: parent.arteRecebidaEm,");
  });

  it("a devolução da Revisão Final trata a Arte do cliente como rodada fechada (RN04)", async () => {
    const { readFileSync } = await import("fs");
    const REVISAO = readFileSync(new URL("../routes/itens/revisao.ts", import.meta.url), "utf8");
    expect(REVISAO).toContain("if (pulaAprovacao(item)) return true;");
  });

  it("o Detalhe do Evento oferece “Arte recebida” para quem registra (RF03)", async () => {
    const { readFileSync } = await import("fs");
    const LINHA = readFileSync(new URL("../../client/src/components/detalhe-do-evento/linha-da-peca.tsx", import.meta.url), "utf8");
    expect(LINHA).toContain("PAPEIS_DA_ARTE_RECEBIDA.includes(p.papel ?? \"\") && aguardandoArteDoCliente(item)");
    // Revisão 27/10: botão COM TEXTO ao lado do selo (tabela e cartão), não só um ícone.
    expect(LINHA).toContain("data-testid={`button-arte-recebida-${item.id}`}");
    expect(LINHA).toMatch(/<FileInput[^>]*\/>\s*Arte recebida\s*<\/button>/);
    expect(LINHA.match(/aoRegistrarArte=\{podeArteRecebida/g)?.length).toBe(2);
    const DETALHE = readFileSync(new URL("../../client/src/pages/event-detail.tsx", import.meta.url), "utf8");
    expect(DETALHE).toContain("<ArteRecebidaDialog");
  });
});

describe("revisão 27/10 — a Aprovação não é segurada pela peça sem aprovação (RN04)", () => {
  it("só peças com marca: a Aprovação fica sem pendência; a atrasada conta uma vez, no Layout", () => {
    const ev = prazos([item({ skipApproval: true }), item({ arteDoCliente: true, arteRecebidaEm: "2026-11-12" })], "2026-11-19");
    expect(etapa(ev, "aprovacao").pendingCount).toBe(0);
    expect(etapa(ev, "aprovacao").state).toBe("upcoming"); // pulada, não "feita"
    expect(etapa(ev, "layouts").state).toBe("overdue");
    expect(ev.pecasEmAtraso).toBe(2);
  });

  it("misturado: a comum segura a Aprovação; o placar soma as duas atrasadas sem contar em dobro", () => {
    const ev = prazos([item({ skipApproval: true }), item()], "2026-11-19");
    expect(etapa(ev, "aprovacao").pendingCount).toBe(1);
    expect(etapa(ev, "aprovacao").state).toBe("overdue");
    expect(ev.pecasEmAtraso).toBe(2);
    expect(computeKpis([ev]).pecasAtrasadas).toBe(2);
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// Revisão 27/10 (3ª rodada): marca × patrocinador, peça na Aprovação, molde e
// produção interna; o piso só no Layout (RN05).
// ═════════════════════════════════════════════════════════════════════════════
describe("revisão 27/10 — quando a peça NÃO pode receber a marca", () => {
  it("recusaAoMarcar: patrocinador vinculado, peça na Aprovação, molde e produção interna — só ao LIGAR", () => {
    expect(PA.recusaAoMarcar({ status: "awaiting_linking", temPatrocinador: true }, "solicitacao", true)).toContain("patrocinador vinculado");
    expect(PA.recusaAoMarcar({ status: "awaiting_linking", temPatrocinador: true }, "solicitacao", false)).toBeNull();
    expect(PA.recusaAoMarcar({ status: "awaiting_sponsor_approval" }, "admin", true)).toContain("Dispensar aprovação");
    expect(PA.recusaAoMarcar({ status: "draft", molde: true }, "admin", true)).toContain("Molde");
    expect(PA.recusaAoMarcar({ status: "draft", producaoInterna: true }, "admin", true)).toContain("Produção interna");
    expect(PA.recusaAoMarcar({ status: "draft" }, "solicitacao", true)).toBeNull();
    // O papel e o RN07 continuam valendo antes de tudo.
    expect(PA.recusaAoMarcar({ status: "draft" }, "arte", true)).toContain("admin e da Solicitação");
    expect(PA.recusaAoMarcar({ status: "awaiting_creator_review" }, "solicitacao", false)).toBe(PA.FRASE_MARCA_TRAVADA);
  });

  it("PATCH: marcar peça com patrocinador vinculado é recusado com o motivo; desmarcar passa", async () => {
    H.mundo.itens.p1 = peca("p1", { status: "awaiting_submission" });
    vinculos.push({ itemId: "p1", sponsorId: "s1" });
    const r = await chamar(PATCH, { params: { id: "p1" }, body: { skipApproval: true }, userRole: "solicitacao" });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("patrocinador vinculado");
    expect(H.mundo.itens.p1.skipApproval).toBe(false);
  });

  it("lote: a peça na Aprovação fica de fora com o motivo (nada de “1 atualizada” sem mudar)", async () => {
    Object.assign(H.storage, { getItemSponsorsByItemIds: vi.fn(async () => []) });
    H.mundo.itens.p1 = peca("p1", { status: "awaiting_sponsor_approval" });
    const r = await chamar(LOTE, { body: { itemIds: ["p1"], arteDoCliente: true }, userRole: "admin" });
    expect(r.body.alteradas).toBe(0);
    expect(r.body.ficaramDeFora[0].motivo).toContain("Dispensar aprovação");
  });

  it("lote: peça com patrocinador vinculado fica de fora; a sem vínculo é marcada", async () => {
    Object.assign(H.storage, { getItemSponsorsByItemIds: vi.fn(async () => [{ itemId: "p1", sponsorId: "s1" }]) });
    H.mundo.itens.p1 = peca("p1");
    H.mundo.itens.p2 = peca("p2");
    const r = await chamar(LOTE, { body: { itemIds: ["p1", "p2"], semPatrocinio: true }, userRole: "solicitacao" });
    expect(r.body.alteradas).toBe(1);
    expect(r.body.ficaramDeFora.map((x: any) => x.displayId)).toEqual([H.mundo.itens.p1.displayId]);
    expect(H.mundo.itens.p2.skipApproval).toBe(true);
  });

  it("“Arte recebida” recusa molde (ele não passa pela Finalização)", async () => {
    H.mundo.itens.p1 = peca("p1", { type: "MOLDE", arteDoCliente: true });
    const r = await chamar(RECEBIDA, { params: { id: "p1" }, body: {}, userRole: "arte" });
    expect(r.status).toBe(409);
    expect(H.mundo.itens.p1.status).toBe("awaiting_submission");
  });

  it("RN05: o piso só vale no marco de Layout — com N grande, a Finalização segue a data do evento", () => {
    const pd = PA.prazoDaPeca({ status: "awaiting_submission", skipApproval: true }, PRAZOS_DO_EVENTO, 20)!;
    expect(pd.marco).toBe(PA.INDICE_LAYOUT);
    expect(pd.prazo > FINALIZACAO).toBe(true); // o Layout ajustado passa da Finalização…
    expect(PA.prazoNoMarco(PA.INDICE_FINALIZACAO, PRAZOS_DO_EVENTO, pd.piso)).toBe(FINALIZACAO); // …mas a Finalização não anda
  });
});

describe("revisão 27/10 — telas: erros chegam à pessoa e o dia digitado não volta sozinho", () => {
  it("as mutações das peças sem aprovação e da Configuração mostram o erro do servidor", async () => {
    const { readFileSync } = await import("fs");
    const ACOES = readFileSync(new URL("../../client/src/components/sem-aprovacao-acoes.tsx", import.meta.url), "utf8");
    expect(ACOES.split('onError: (error: Error) => toast({ variant: "destructive"').length - 1).toBe(2);
    const CONFIG = readFileSync(new URL("../../client/src/pages/configuracoes.tsx", import.meta.url), "utf8");
    expect(CONFIG).toContain("onError: (error: Error) => toast({ variant: \"destructive\"");
    expect(CONFIG).toContain("Dias somados ao Layout das peças sem aprovação");
  });

  it("o diálogo “Arte recebida” só repõe o dia ao abrir ou trocar de peça", async () => {
    const { readFileSync } = await import("fs");
    const ACOES = readFileSync(new URL("../../client/src/components/sem-aprovacao-acoes.tsx", import.meta.url), "utf8");
    expect(ACOES).toContain("[aberto, peca?.id, chegadaGravada, hoje]");
  });

  it("o formulário: travado com o motivo para peça com patrocinador; some no molde e na produção interna; avisa ao desmarcar sem patrocinador", async () => {
    const { readFileSync } = await import("fs");
    const CAMPO = readFileSync(new URL("../../client/src/components/detalhe-do-evento/campo-sem-aprovacao.tsx", import.meta.url), "utf8");
    expect(CAMPO).toContain("const recusaAoLigar = recusaAoMarcar({ status, temPatrocinador }, papel, true);");
    expect(CAMPO).toContain("data-testid=\"desmarcou-sem-patrocinador\"");
    const FORM = readFileSync(new URL("../../client/src/components/detalhe-do-evento/formulario-da-peca.tsx", import.meta.url), "utf8");
    expect(FORM).toContain("{(podePriorizar || isAdmin) && !ehMolde(formData) && !formData.producaoInterna && (");
  });

  it("vincular patrocinador numa peça “Arte do cliente” diz que a marca saiu", async () => {
    const { readFileSync } = await import("fs");
    const V = readFileSync(new URL("../../client/src/components/vinculacao/use-acoes-da-vinculacao.tsx", import.meta.url), "utf8");
    expect(V).toContain("“Arte do cliente” saiu de");
  });
});
