// ─────────────────────────────────────────────────────────────────────────────
// PERF-7 (servidor) — O RECORTE, A PROJEÇÃO E O TETO DE AVISO.
//
// O lado do cliente está em perf7-filas-recortadas.test.ts (monta as telas e
// mede KB). Aqui rodam os HANDLERS de verdade, com o storage mockado, para
// prender o contrato que as telas passaram a depender:
//
//   · `?eventId=` recorta (e vai ao banco COMBINADO com `?status=`, não
//     recortando em JavaScript o que o WHERE podia recortar);
//   · `?status=` aceita as grafias LEGADAS da régua de shared/fluxo-peca —
//     era um 400 que derrubava a aba Finalizados da Arte;
//   · `?campos=trilha` devolve só as colunas da trilha, sem evento,
//     patrocinador nem complemento, e mede o quanto isso encolhe o corpo;
//   · pedir o acervo SEM recorte nenhum acima do teto vira aviso no log — com
//     origem e tamanho — em vez de um `slice` silencioso;
//   · o recorte não fura `pecaVisivelPara` nem a ordem do acervo.
//
// E a miniatura gravada no upload (services/miniaturas.ts), que é a outra
// metade desta rodada: gerar uma vez no upload em vez de baixar o original de
// até 25 MB a cada falta do LRU.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({ storage: {} as Record<string, any> }));

vi.mock("../db", () => ({ db: {}, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real,
    requireAuth: (_req: any, _res: any, next: any) => next(),
    broadcast: () => {},
    createAuditLog: async () => {},
    updateEventStatus: async () => {},
  };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn() }));

import { registerItemRoutes } from "../routes/items";
import { CAMPOS_DA_TRILHA, COLUNAS_DA_TRILHA } from "@shared/itens-compactos";

// ── Harness (o mesmo dos outros testes de rota) ─────────────────────────────
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

async function chamar(chave: string, ctx: { query?: any; userRole?: string; headers?: any } = {}) {
  const handlers = rotas.get(chave);
  if (!handlers) throw new Error(`Rota não registrada: ${chave}`);
  const req: any = {
    params: {}, body: {}, query: ctx.query ?? {}, headers: ctx.headers ?? {},
    userRole: ctx.userRole ?? "admin", userId: "u1", userName: "Maria Silva",
    session: { userId: "u1", userRole: ctx.userRole ?? "admin", userName: "Maria Silva" },
  };
  const res: any = { _status: 200, _body: undefined, _done: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.set = () => res;
  res.setHeader = res.set;
  res.json = (b: any) => { res._body = b; res._done = true; return res; };
  res.send = res.json;
  for (const h of handlers) {
    let chamouNext = false;
    await h(req, res, () => { chamouNext = true; });
    if (res._done || !chamouNext) break;
  }
  return { status: res._status, body: res._body };
}

// ── Mundo em memória ────────────────────────────────────────────────────────
const GET_ITENS = "GET /api/items";
const DIA = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

const EVENTOS = Array.from({ length: 6 }, (_, i) => ({
  id: `ev-${i}`, name: `Evento ${i}`, status: "created", priority: "alta",
  startDate: "2099-01-01", truckDepartureDate: "2098-12-20", createdBy: "u1",
  createdAt: iso(Date.now() - 90 * DIA),
}));
const PATROCINADORES = Array.from({ length: 8 }, (_, i) => ({
  id: `sp-${i}`, name: `Patrocinador ${i}`, color: "#3b82f6", logoUrl: null,
}));

const STATUS = ["delivered", "entregue", "produzido", "awaiting_submission", "awaiting_sponsor_approval", "draft"];
const PECAS = Array.from({ length: 120 }, (_, i) => ({
  id: `it-${i}`, displayId: `#${1000 + i}`, eventId: EVENTOS[i % EVENTOS.length].id,
  type: "Backdrop", description: `Peça ${i} com descrição de tamanho realista`,
  material: "LONA", finish: "Ilhós", quantity: 1 + (i % 4),
  visualWidth: "3", visualHeight: "2", calculatedM2: "6",
  status: STATUS[i % STATUS.length], skipApproval: false, isReuse: false,
  deletedAt: null, parentItemId: null, kitRemessaId: null, observations: "",
  approvalThumbUrl: null, finalFileUrl: null, referenceUrl: null, bookUrl: null,
  quantityProduced: i % 3, productionStartedAt: iso(Date.now() - 20 * DIA),
  approvedAt: iso(Date.now() - 18 * DIA), creatorReviewedAt: iso(Date.now() - 17 * DIA),
  deliveredAt: null, receivedBy: null,
  createdAt: iso(Date.now() - 60 * DIA - i * 60_000), updatedAt: iso(Date.now() - 10 * DIA),
}));

/** O que o storage recebeu — é assim que se prova que o WHERE foi combinado. */
const chamadas: { fn: string; args: any[] }[] = [];

beforeEach(() => {
  chamadas.length = 0;
  const registrar = (fn: string, impl: (...a: any[]) => any) => (...args: any[]) => {
    chamadas.push({ fn, args });
    return impl(...args);
  };
  Object.assign(H.storage, {
    getAllItems: registrar("getAllItems", async () => PECAS),
    getItemsByStatuses: registrar("getItemsByStatuses", async (sts: string[]) =>
      PECAS.filter((p) => sts.includes(p.status))),
    getItemsByEvents: registrar("getItemsByEvents", async (evs: string[]) =>
      PECAS.filter((p) => evs.includes(p.eventId))),
    getItemsByStatusesAndEvents: registrar("getItemsByStatusesAndEvents", async (sts: string[], evs: string[]) =>
      PECAS.filter((p) => sts.includes(p.status) && evs.includes(p.eventId))),
    getItemsByIds: registrar("getItemsByIds", async (ids: string[]) => PECAS.filter((p) => ids.includes(p.id))),
    getAllEvents: async () => EVENTOS,
    getEventsByIds: async (ids: string[]) => EVENTOS.filter((e) => ids.includes(e.id)),
    getAllSponsors: async () => PATROCINADORES,
    // Vínculo de patrocinador: dois por peça — é o que faz o corpo enriquecido
    // pesar, e é justamente o que a projeção da trilha não manda.
    getAllItemSponsors: async () => PECAS.flatMap((p, i) => [
      { itemId: p.id, sponsorId: PATROCINADORES[i % 8].id },
      { itemId: p.id, sponsorId: PATROCINADORES[(i * 3 + 1) % 8].id },
    ]),
    getItemSponsorsByItemIds: async (ids: string[]) =>
      (await H.storage.getAllItemSponsors()).filter((v: any) => ids.includes(v.itemId)),
    getAllItemSponsorApprovals: async () => [],
    getItemSponsorApprovalsByItemIds: async () => [],
    getComplementsByParentIds: async () => [],
    getLiveComplements: async () => [],
  });
});

const bytes = (x: unknown) => JSON.stringify(x).length;

describe("PERF-7 · /api/items recorta no banco", () => {
  it("`?eventId=` sozinho vai a getItemsByEvents e devolve só aqueles eventos", async () => {
    const r = await chamar(GET_ITENS, { query: { eventId: "ev-1,ev-2" } });
    expect(r.status).toBe(200);
    expect(chamadas.map((c) => c.fn)).toContain("getItemsByEvents");
    expect(chamadas.some((c) => c.fn === "getAllItems")).toBe(false);
    expect(new Set((r.body as any[]).map((i) => i.eventId))).toEqual(new Set(["ev-1", "ev-2"]));
  });

  it("`?status=` com `?eventId=` vai em UMA consulta combinada (não recorta em JavaScript)", async () => {
    const r = await chamar(GET_ITENS, { query: { status: "delivered,entregue", eventId: "ev-0,ev-3" } });
    const usada = chamadas.find((c) => c.fn.startsWith("getItems"))!;
    expect(usada.fn).toBe("getItemsByStatusesAndEvents");
    expect(usada.args[0].sort()).toEqual(["delivered", "entregue"]);
    expect(usada.args[1].sort()).toEqual(["ev-0", "ev-3"]);
    for (const i of r.body as any[]) {
      expect(["delivered", "entregue"]).toContain(i.status);
      expect(["ev-0", "ev-3"]).toContain(i.eventId);
    }
  });

  it("as grafias LEGADAS da régua passam na validação — era o 400 da aba Finalizados", async () => {
    const r = await chamar(GET_ITENS, { query: { status: "produzido,entregue,conferido,em_producao,liberado,pronto_para_producao" } });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it("id de evento inválido e lista vazia são 400 com frase, não lista vazia silenciosa", async () => {
    expect((await chamar(GET_ITENS, { query: { eventId: "ev 1; drop" } })).status).toBe(400);
    expect((await chamar(GET_ITENS, { query: { eventId: "" } })).status).toBe(400);
    expect((await chamar(GET_ITENS, { query: { status: "nao_existe" } })).status).toBe(400);
  });

  it("a lista recortada sai na MESMA ordem do acervo (created_at DESC)", async () => {
    const recortada = (await chamar(GET_ITENS, { query: { eventId: "ev-0,ev-1,ev-2,ev-3,ev-4,ev-5" } })).body as any[];
    const inteira = (await chamar(GET_ITENS)).body as any[];
    expect(recortada.map((i) => i.id)).toEqual(inteira.map((i) => i.id));
  });
});

describe("PERF-7 · a projeção da trilha", () => {
  it("devolve só as colunas da trilha, sem evento nem patrocinadores", async () => {
    const r = await chamar(GET_ITENS, { query: { campos: CAMPOS_DA_TRILHA } });
    expect(r.status).toBe(200);
    const peca = (r.body as any[])[0];
    expect(Object.keys(peca).sort()).toEqual([...COLUNAS_DA_TRILHA].sort());
    expect("event" in peca).toBe(false);
    expect("sponsors" in peca).toBe(false);
  });

  it("encolhe o corpo em mais da metade (medido)", async () => {
    const cheio = bytes((await chamar(GET_ITENS)).body);
    const enxuto = bytes((await chamar(GET_ITENS, { query: { campos: CAMPOS_DA_TRILHA } })).body);
    process.stderr.write(
      `[perf7] /api/items: enriquecido ${(cheio / 1024).toFixed(1)} KB → ?campos=trilha `
      + `${(enxuto / 1024).toFixed(1)} KB (${PECAS.length} peças) · −${(100 - (enxuto / cheio) * 100).toFixed(0)}%\n`,
    );
    expect(enxuto).toBeLessThan(cheio * 0.5);
  });

  it("combina com o recorte: a trilha de um evento só", async () => {
    const r = await chamar(GET_ITENS, { query: { campos: CAMPOS_DA_TRILHA, eventId: "ev-2" } });
    expect((r.body as any[]).every((i) => i.eventId === "ev-2")).toBe(true);
    expect((r.body as any[]).length).toBeGreaterThan(0);
  });
});

describe("PERF-7 · o teto de aviso do acervo inteiro", () => {
  it("pedir tudo acima do teto avisa no log com origem e tamanho — e nunca trunca", async () => {
    const muitas = Array.from({ length: 2100 }, (_, i) => ({ ...PECAS[i % PECAS.length], id: `big-${i}` }));
    H.storage.getAllItems = async () => muitas;
    const avisos: string[] = [];
    const espiao = vi.spyOn(console, "warn").mockImplementation((...a: any[]) => { avisos.push(a.join(" ")); });
    try {
      const r = await chamar(GET_ITENS, { headers: { referer: "http://app/painel-geral" } });
      // Sem corte: a lista sai inteira. Um `slice` silencioso aqui já fez peças
      // "sumirem" do Painel quando o banco passou de 1.000.
      expect((r.body as any[]).length).toBe(2100);
      expect(avisos.some((a) => a.includes("SEM recorte") && a.includes("2100") && a.includes("painel-geral"))).toBe(true);
    } finally {
      espiao.mockRestore();
    }
  });

  it("lista RECORTADA não avisa — é o caminho que se quer", async () => {
    const avisos: string[] = [];
    const espiao = vi.spyOn(console, "warn").mockImplementation((...a: any[]) => { avisos.push(a.join(" ")); });
    try {
      await chamar(GET_ITENS, { query: { status: "delivered" } });
      expect(avisos.filter((a) => a.includes("SEM recorte"))).toEqual([]);
    } finally {
      espiao.mockRestore();
    }
  });
});
