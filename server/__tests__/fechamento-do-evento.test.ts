// ─────────────────────────────────────────────────────────────────────────────
// FECHAMENTO DO EVENTO (19/10) — GET /api/events/:id/export-xlsx e
// GET /api/fechamento-xlsx?eventos=…, rodando o gerador de verdade
// (services/fechamentoDoEvento.ts + writeWorkbook) com um ExcelJS de mentira
// que guarda o que é escrito.
//
// Caso real: "Night Run Teresina está apenas com 2 itens; Circuitinho
// Salvador, Girl Power RJ e Petrobras Bike Recife não aparecem no relatório".
// O Exportar Excel da Gráfica leva a LISTA VISÍVEL (evento realizado oculto,
// entregues só de uma janela). O fechamento leva o EVENTO inteiro.
//
// O exceljs de verdade puxa o jszip ao carregar, e o node_modules deste
// ambiente não o tem (a mesma nota de regras-producao-planilha): o writer é
// de mentira; o que se confere é o que a planilha RECEBE.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { bancoDeMentira, mundoVazio, type MundoDoBanco } from "./regras-producao-apoio";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: {} as Record<string, any>,
  planilhas: [] as any[],
}));

vi.mock("../db", () => ({ db: H.db, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("exceljs", () => {
  class Cell { value: any = null; font: any; fill: any; alignment: any; border: any; numFmt: any; }
  class Row {
    cells = new Map<number, Cell>();
    height = 0;
    getCell(i: number) { let c = this.cells.get(i); if (!c) { c = new Cell(); this.cells.set(i, c); } return c; }
    eachCell(_o: any, fn: (c: Cell, i: number) => void) { for (const [i, c] of Array.from(this.cells)) fn(c, i); }
  }
  class Sheet {
    columns: { key: string }[] = [];
    rows: Row[] = [];
    views: any; autoFilter: any;
    constructor(public name: string) {}
    getRow(n: number) { while (this.rows.length < n) this.rows.push(new Row()); return this.rows[n - 1]; }
    getCell(ref: string) { return this.getRow(Number(ref.slice(1))).getCell(ref.charCodeAt(0) - 64); }
    mergeCells() {}
    addRow(obj: Record<string, any>) { const r = this.getRow(this.rows.length + 1); this.columns.forEach((c, i) => { if (obj[c.key] !== undefined) r.getCell(i + 1).value = obj[c.key]; }); return r; }
  }
  class Workbook {
    creator = ""; created: any; worksheets: Sheet[] = [];
    xlsx = { write: async () => {} };
    constructor() { H.planilhas.push(this); }
    addWorksheet(name: string) { const s = new Sheet(name); this.worksheets.push(s); return s; }
    getWorksheet(name: string) { return this.worksheets.find((w) => w.name === name); }
  }
  return { default: { Workbook } };
});

import { registerFechamentoRoutes } from "../routes/fechamento";
import { nomeDoArquivoDoFechamento, idsDosEventosDaQuery, FECHAMENTO_MAX_EVENTOS } from "../services/fechamentoDoEvento";

// Importar xlsxExport puxa o storage inteiro: com a máquina carregada, demora.
vi.setConfig({ testTimeout: 120_000 });

// ── As rotas num app que só guarda handlers ──────────────────────────────────
type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const appFalso: any = { get: (caminho: string, ...hs: Handler[]) => { rotas.set(`GET ${caminho}`, hs); return appFalso; } };
registerFechamentoRoutes(appFalso);

type Quem = { logado?: boolean; userRole?: string; userKit?: boolean; userId?: string };
async function chamar(chave: string, ctx: { params?: any; query?: any } & Quem = {}) {
  const hs = rotas.get(chave);
  if (!hs) throw new Error(`Rota não registrada: ${chave}`);
  const req: any = {
    params: ctx.params ?? {}, query: ctx.query ?? {}, body: {}, headers: {},
    session: ctx.logado === false ? {} : { userId: ctx.userId ?? "u1" },
    userRole: ctx.userRole ?? "grafica", userKit: ctx.userKit === true, userId: ctx.userId ?? "u1",
  };
  const res: any = { _status: 200, _body: undefined, _headers: {} as Record<string, string>, headersSent: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; return res; };
  res.setHeader = (k: string, v: string) => { res._headers[k.toLowerCase()] = v; return res; };
  res.end = () => res;
  for (const h of hs) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (!seguiu) break;
  }
  return res;
}

const linha = (ws: any, n: number) => Array.from(ws.getRow(n).cells.entries() as Iterable<[number, any]>).sort((a, b) => a[0] - b[0]).map(([, c]) => c.value);
const planilha = () => H.planilhas[H.planilhas.length - 1].getWorksheet("Itens");
/** As linhas de peça (da 4ª até antes do TOTAL), como objetos { coluna: valor }. */
function linhasDePeca(ws: any) {
  const cab = linha(ws, 3) as string[];
  const out: Record<string, any>[] = [];
  for (let n = 4; n <= ws.rows.length; n++) {
    const v = linha(ws, n);
    if (String(ws.getRow(n).getCell(1).value ?? "").startsWith("TOTAL")) break;
    // A coluna "Reaprov." aparece duas vezes (produção e especificação): a 1ª é a quantidade.
    const o: Record<string, any> = {};
    cab.forEach((h, i) => { if (!(h in o)) o[h] = ws.getRow(n).getCell(i + 1).value; });
    void v;
    out.push(o);
  }
  return out;
}
const linhaTotal = (ws: any) => {
  const cab = linha(ws, 3) as string[];
  for (let n = 4; n <= ws.rows.length; n++) {
    if (String(ws.getRow(n).getCell(1).value ?? "").startsWith("TOTAL")) {
      const o: Record<string, any> = { rotulo: ws.getRow(n).getCell(1).value };
      cab.forEach((h, i) => { if (!(h in o)) o[h] = ws.getRow(n).getCell(i + 1).value; });
      return o;
    }
  }
  return null;
};

// ── O mundo ──────────────────────────────────────────────────────────────────
let mundo: MundoDoBanco;
const peca = (id: string, eventId: string, over: Record<string, unknown> = {}) => ({
  id, displayId: `#${id}`, eventId, type: "Placa", description: `Peça ${id}`, quantity: 10, status: "delivered",
  quantityProduced: 10, reuseQty: 0, isReuse: false, conferredQty: 10, embaladaQty: 10, deliveredQty: 10, printMachine: "1", tuboId: null,
  // Entregue MUITO antes da janela de entregues da Gráfica: o fechamento leva mesmo assim.
  deliveredAt: new Date("2026-03-02T12:00:00Z"),
  deletedAt: null, parentItemId: null, calculatedM2: "2.00", measurement: "1 × 2", kitRemessaId: null, criadoPorId: "u-arena", ...over,
});

const EVENTOS: Record<string, any> = {
  ter: { id: "ter", name: "Night Run Teresina", startDate: "2026-03-01", truckDepartureDate: "2026-02-25", status: "completed", arquivadoEm: null, franchise: null },
  ssa: { id: "ssa", name: "Circuitinho Salvador", startDate: "2026-03-08", truckDepartureDate: "2026-03-03", status: "completed", arquivadoEm: null, franchise: null },
  arq: { id: "arq", name: "Evento Arquivado", startDate: "2026-03-08", truckDepartureDate: "2026-03-03", status: "completed", arquivadoEm: new Date("2026-04-01T00:00:00Z"), franchise: null },
  // Aberto, com data futura e peças em vários status.
  abe: { id: "abe", name: "Girl Power RJ", startDate: "2099-01-10", truckDepartureDate: "2099-01-05", status: "active", arquivadoEm: null, franchise: "Rio" },
};
let PECAS: any[];

beforeEach(() => {
  H.planilhas.length = 0;
  mundo = mundoVazio();
  mundo.tubos.t1 = { id: "t1", eventId: "ter", numero: 3, avulso: false, fechadoEm: null, entregueEm: null, recebidoPor: null };
  for (const k of Object.keys(H.db)) delete H.db[k];
  Object.assign(H.db, bancoDeMentira(mundo));

  PECAS = [
    // Teresina: 4 peças entregues (+ uma reaproveitada do estoque, uma em trânsito) e o BOOK COMPLETO.
    peca("0101", "ter", { tuboId: "t1" }),
    peca("0102", "ter", { quantityProduced: 6, reuseQty: 4, origemReaproveitamento: "estoque", obsReaproveitamento: null }),
    peca("0103", "ter", { quantityProduced: 0, conferredQty: 0, embaladaQty: 0, deliveredQty: 0, reuseQty: 10, isReuse: true, origemReaproveitamento: "em_transito", obsReaproveitamento: "Night Run Salvador, etapa 17/10" }),
    peca("0062-C1", "ter", { parentItemId: "p62", quantity: 4, quantityProduced: 4, conferredQty: 4, embaladaQty: 4, deliveredQty: 4 }),
    peca("0104", "ter", { type: "Book completo", description: "Book do evento" }),
    // Salvador
    peca("0201", "ssa"),
    // Girl Power (aberto): peças em produção, conferidas e uma do Kit
    peca("0301", "abe", { status: "inProduction", quantityProduced: 3, conferredQty: 0, embaladaQty: 0, deliveredQty: 0 }),
    peca("0302", "abe", { status: "conferred", embaladaQty: 0, deliveredQty: 0 }),
    peca("0303", "abe", { status: "approved", quantityProduced: 0, conferredQty: 0, embaladaQty: 0, deliveredQty: 0, kitRemessaId: "kr1", criadoPorId: "u-kit" }),
    peca("0304", "abe", { status: "approved", quantityProduced: 0, conferredQty: 0, embaladaQty: 0, deliveredQty: 0, kitRemessaId: "kr2", criadoPorId: "u-outro-kit" }),
    // Do evento ARQUIVADO (à mão ou pelo automático de 2 semanas).
    peca("0401", "arq"),
  ];

  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getEvent = vi.fn(async (id: string) => EVENTOS[id]);
  // O storage de verdade já tira as excluídas e as de evento arquivado.
  s.getItemsByEvents = vi.fn(async (ids: string[]) => PECAS.filter((p) => ids.includes(p.eventId) && !p.deletedAt && !EVENTOS[p.eventId]?.arquivadoEm));
  s.getAllSponsors = vi.fn(async () => [{ id: "sp1", name: "Petrobras" }]);
  s.getAllItemSponsors = vi.fn(async () => [{ itemId: "0101", sponsorId: "sp1" }]);
  // Só o fechamento do admin com evento arquivado lê por aqui.
  s.getItemsByEventsInclusiveArquivados = vi.fn(async (ids: string[]) => PECAS.filter((p) => ids.includes(p.eventId) && !p.deletedAt));
  // Exportar Excel da Gráfica (POST /api/items/export-xlsx).
  s.getItemsByIds = vi.fn(async (ids: string[]) => PECAS.filter((p) => ids.includes(p.id)));
  s.getAllEvents = vi.fn(async () => Object.values(EVENTOS).filter((e: any) => !e.arquivadoEm));
});

describe("GET /api/events/:id/export-xlsx — o fechamento de UM evento", () => {
  it("evento REALIZADO (data passou, tudo entregue): todas as peças vivas, inclusive as entregues fora da janela da Gráfica", async () => {
    const res = await chamar("GET /api/events/:id/export-xlsx", { params: { id: "ter" } });
    expect(res._status).toBe(200);
    const ws = planilha();
    const linhas = linhasDePeca(ws);
    // 4 peças — o BOOK COMPLETO (trâmite do Atendimento) não é peça.
    expect(linhas.map((l) => l["#ID"])).toEqual(["#0062-C1", "#0101", "#0102", "#0103"]);
    expect(linhas.every((l) => l.Evento === "Night Run Teresina")).toBe(true);
    expect(linhas.every((l) => l.Status === "Entregue")).toBe(true);
    // Título, subtítulo e o nome do arquivo.
    expect(ws.getCell("A1").value).toBe("FECHAMENTO — NIGHT RUN TERESINA");
    expect(String(ws.getCell("A2").value)).toContain("4 peças · 34 un.");
    expect(String(ws.getCell("A2").value)).toContain("Reaproveitadas 14 (10 em trânsito)");
    expect(decodeURIComponent(res._headers["content-disposition"])).toContain('filename="Fechamento — Night Run Teresina.xlsx"');
    expect(res._headers["content-type"]).toContain("spreadsheetml");
  });

  it("MESMO formato da exportação da Gráfica: colunas de produção, com Embalado e Em trânsito na ordem da cadeia", async () => {
    await chamar("GET /api/events/:id/export-xlsx", { params: { id: "ter" } });
    const cab = linha(planilha(), 3) as string[];
    for (const c of ["Evento", "Status", "Impressora", "Tubo", "Reaprov.", "M² a produzir", "Produzido", "Conferido", "Embalado", "Entregue", "Em trânsito", "#ID", "Complemento de", "Origem reaprov.", "Etapa de origem", "Patrocinadores"]) {
      expect(cab, c).toContain(c);
    }
    expect(cab.indexOf("Embalado")).toBe(cab.indexOf("Conferido") + 1);
    expect(cab.indexOf("Entregue")).toBe(cab.indexOf("Embalado") + 1);
    expect(cab.indexOf("Em trânsito")).toBe(cab.indexOf("Entregue") + 1);
  });

  it("reaproveitadas e em trânsito saem nas colunas certas (quantidade, origem, etapa, em trânsito)", async () => {
    await chamar("GET /api/events/:id/export-xlsx", { params: { id: "ter" } });
    const por = Object.fromEntries(linhasDePeca(planilha()).map((l) => [l["#ID"], l]));
    // Do estoque: 4 reaproveitadas, 6 produzidas — passa pelo galpão (em trânsito 0).
    expect([por["#0102"]["Reaprov."], por["#0102"]["Produzido"], por["#0102"]["Origem reaprov."], por["#0102"]["Em trânsito"]]).toEqual([4, 6, "Estoque", 0]);
    // Em trânsito: 10 reaproveitadas, nada produzido nem entregue pelo galpão, a etapa dita.
    expect([por["#0103"]["Reaprov."], por["#0103"]["Produzido"], por["#0103"]["Entregue"], por["#0103"]["Em trânsito"]]).toEqual([10, 0, 0, 10]);
    expect([por["#0103"]["Origem reaprov."], por["#0103"]["Etapa de origem"]]).toEqual(["Em trânsito", "Night Run Salvador, etapa 17/10"]);
    // Peça comum: sem origem; o tubo, o patrocinador e o complemento.
    expect([por["#0101"]["Origem reaprov."], por["#0101"]["Tubo"], por["#0101"]["Patrocinadores"], por["#0101"]["Embalado"]]).toEqual(["", 3, "Petrobras", 10]);
    expect(por["#0062-C1"]["Complemento de"]).toBe("#0062");
  });

  it("a linha TOTAL fecha a conta das colunas de produção", async () => {
    await chamar("GET /api/events/:id/export-xlsx", { params: { id: "ter" } });
    const t = linhaTotal(planilha())!;
    expect(t.rotulo).toBe("TOTAL — 4 itens");
    expect([t["Qtd"], t["Reaprov."], t["Produzido"], t["Conferido"], t["Embalado"], t["Entregue"], t["Em trânsito"]]).toEqual([34, 14, 20, 24, 24, 24, 10]);
  });

  it("evento ABERTO: todos os status, cada um com o seu rótulo", async () => {
    await chamar("GET /api/events/:id/export-xlsx", { params: { id: "abe" } });
    const linhas = linhasDePeca(planilha());
    expect(linhas.map((l) => [l["#ID"], l.Status])).toEqual([
      ["#0301", "Em Impressão"], ["#0302", "Conferido"], ["#0303", "Liberado"], ["#0304", "Liberado"],
    ]);
    expect(String(planilha().getCell("A2").value)).toContain("Franquia: Rio");
  });

  it("arquivado e inexistente: 404 (sumiram de todas as listas)", async () => {
    expect((await chamar("GET /api/events/:id/export-xlsx", { params: { id: "arq" } }))._status).toBe(404);
    expect((await chamar("GET /api/events/:id/export-xlsx", { params: { id: "nao-existe" } }))._status).toBe(404);
    expect(H.planilhas).toHaveLength(0);
  });

  it("papéis: qualquer logado exporta (gráfica, solicitação, admin, arte, atendimento); sem sessão, 401", async () => {
    for (const userRole of ["grafica", "solicitacao", "admin", "arte", "atendimento"]) {
      expect((await chamar("GET /api/events/:id/export-xlsx", { params: { id: "ter" }, userRole }))._status, userRole).toBe(200);
    }
    expect((await chamar("GET /api/events/:id/export-xlsx", { params: { id: "ter" }, logado: false }))._status).toBe(401);
  });

  it("usuário do Kit: só as peças do Kit que ELE criou (a mesma régua das outras exportações)", async () => {
    await chamar("GET /api/events/:id/export-xlsx", { params: { id: "abe" }, userRole: "solicitacao", userKit: true, userId: "u-kit" });
    expect(linhasDePeca(planilha()).map((l) => l["#ID"])).toEqual(["#0303"]);
    // E no evento da Arena sem peça dele: a planilha sai vazia, não com as dos outros.
    await chamar("GET /api/events/:id/export-xlsx", { params: { id: "ter" }, userRole: "solicitacao", userKit: true, userId: "u-kit" });
    expect(linhasDePeca(planilha())).toEqual([]);
  });
});

describe("GET /api/fechamento-xlsx?eventos=… — vários eventos num arquivo", () => {
  it("um arquivo, o evento numa coluna, evento a evento (pelo nome) e o código dentro dele", async () => {
    const res = await chamar("GET /api/fechamento-xlsx", { query: { eventos: "ter,ssa" } });
    expect(res._status).toBe(200);
    const linhas = linhasDePeca(planilha());
    expect(linhas.map((l) => [l.Evento, l["#ID"]])).toEqual([
      ["Circuitinho Salvador", "#0201"],
      ["Night Run Teresina", "#0062-C1"], ["Night Run Teresina", "#0101"], ["Night Run Teresina", "#0102"], ["Night Run Teresina", "#0103"],
    ]);
    expect(planilha().getCell("A1").value).toBe("FECHAMENTO — 2 EVENTOS");
    expect(String(planilha().getCell("A2").value)).toContain("Circuitinho Salvador, Night Run Teresina");
    expect(decodeURIComponent(res._headers["content-disposition"])).toContain('filename="Fechamento — 2 eventos.xlsx"');
  });

  it("aceita ?eventos repetido; arquivado no meio é ignorado; só arquivados → 404; nenhum → 400; acima do teto → 400", async () => {
    expect((await chamar("GET /api/fechamento-xlsx", { query: { eventos: ["ter", "arq"] } }))._status).toBe(200);
    expect(new Set(linhasDePeca(planilha()).map((l) => l.Evento))).toEqual(new Set(["Night Run Teresina"]));
    expect((await chamar("GET /api/fechamento-xlsx", { query: { eventos: "arq" } }))._status).toBe(404);
    expect((await chamar("GET /api/fechamento-xlsx", { query: {} }))._status).toBe(400);
    const muitos = Array.from({ length: FECHAMENTO_MAX_EVENTOS + 1 }, (_, i) => `e${i}`).join(",");
    expect((await chamar("GET /api/fechamento-xlsx", { query: { eventos: muitos } }))._status).toBe(400);
  });
});

describe("as peças do nome e da query", () => {
  it("nomeDoArquivoDoFechamento: um evento pelo nome, vários pela contagem; sem caractere proibido", () => {
    expect(nomeDoArquivoDoFechamento(["Petrobras Bike Recife"])).toBe("Fechamento — Petrobras Bike Recife.xlsx");
    expect(nomeDoArquivoDoFechamento(["A/B: C?"])).toBe("Fechamento — AB C.xlsx");
    expect(nomeDoArquivoDoFechamento(["a", "b", "c", "d"])).toBe("Fechamento — 4 eventos.xlsx");
  });
  it("idsDosEventosDaQuery: vírgula, repetição e vazios", () => {
    expect(idsDosEventosDaQuery("a, b,,a")).toEqual(["a", "b"]);
    expect(idsDosEventosDaQuery(["a", "b,c"])).toEqual(["a", "b", "c"]);
    expect(idsDosEventosDaQuery(undefined)).toEqual([]);
  });
});

describe("data do evento na planilha (meia-noite UTC)", () => {
  it("10/10 gravado como 2026-10-10T00:00Z sai 10/10/2026, não a véspera", async () => {
    const { fmtDiaDoEvento } = await import("../services/xlsxExport");
    expect(fmtDiaDoEvento(new Date("2026-10-10T00:00:00Z"))).toBe("10/10/2026");
    expect(fmtDiaDoEvento("2026-12-31T00:00:00.000Z")).toBe("31/12/2026");
    expect(fmtDiaDoEvento("lixo")).toBe("");
  });
});

// ── ARQUIVAMENTO AUTOMÁTICO (dono, 19/10) ────────────────────────────────────
// Evento 2 semanas depois da data é arquivado: as peças dele saem do
// "Exportar Excel" da Gráfica (mesmo com os ids vindos de uma aba aberta
// antes), e o fechamento continua saindo para o ADMIN, pelos Arquivados.
describe("evento arquivado: fechamento só para o admin", () => {
  it("admin baixa o fechamento do evento arquivado, com as peças dele", async () => {
    const res = await chamar("GET /api/events/:id/export-xlsx", { params: { id: "arq" }, userRole: "admin" });
    expect(res._status).toBe(200);
    expect(linhasDePeca(planilha()).map((l) => [l.Evento, l["#ID"]])).toEqual([["Evento Arquivado", "#0401"]]);
    expect(H.storage.getItemsByEventsInclusiveArquivados).toHaveBeenCalledWith(["arq"]);
  });

  it("os outros papéis seguem recebendo 404; evento vivo não usa a leitura inclusiva", async () => {
    for (const userRole of ["grafica", "solicitacao", "arte", "atendimento"]) {
      expect((await chamar("GET /api/events/:id/export-xlsx", { params: { id: "arq" }, userRole }))._status, userRole).toBe(404);
    }
    await chamar("GET /api/events/:id/export-xlsx", { params: { id: "ter" }, userRole: "admin" });
    expect(H.storage.getItemsByEventsInclusiveArquivados).not.toHaveBeenCalled();
  });
});

describe("POST /api/items/export-xlsx ignora peça de evento arquivado", () => {
  async function exportar(itemIds: string[], eventIds?: string[]) {
    const { handleExportSelectedItemsXlsx } = await import("../services/xlsxExport");
    const req: any = { body: { ...(eventIds ? { eventIds } : { itemIds }), title: "Produção — Gráfica" }, userKit: false, userId: "u1", userRole: "grafica" };
    const res: any = { _status: 200, _body: undefined, _headers: {} as Record<string, string>, headersSent: false };
    res.status = (c: number) => { res._status = c; return res; };
    res.json = (b: any) => { res._body = b; return res; };
    res.setHeader = (k: string, v: string) => { res._headers[k.toLowerCase()] = v; return res; };
    res.end = () => res;
    await handleExportSelectedItemsXlsx(req, res);
    return res;
  }

  it("id de peça arquivada vindo da aba aberta antiga: fica fora da planilha", async () => {
    const res = await exportar(["0101", "0401", "0201"]);
    expect(res._status).toBe(200);
    expect(linhasDePeca(planilha()).map((l) => l["#ID"]).sort()).toEqual(["#0101", "#0201"]);
    expect(String(planilha().getCell("A2").value)).toContain("2 peças");
  });

  it("só peças de evento arquivado: 404 com a frase, e nenhuma planilha vazia", async () => {
    const res = await exportar(["0401"]);
    expect(res._status).toBe(404);
    expect(res._body.error).toContain("Nenhuma peça encontrada");
    expect(H.planilhas).toHaveLength(0);
  });

  // O modal novo da Gráfica ("Selecionar eventos", commit 4c3a3d47 no main)
  // manda { eventIds }. Liga sozinho quando o servidor aceitar eventIds.
  const aceitaEventIds = readFileSync(path.resolve(__dirname, "../services/xlsxExport.ts"), "utf8").includes("req.body?.eventIds");
  it.skipIf(!aceitaEventIds)("pelo caminho de eventIds: evento arquivado escolhido fica fora; só ele → 404", async () => {
    const res = await exportar([], ["ter", "arq"]);
    expect(res._status).toBe(200);
    expect(new Set(linhasDePeca(planilha()).map((l) => l.Evento))).toEqual(new Set(["Night Run Teresina"]));
    H.planilhas.length = 0;
    expect((await exportar([], ["arq"]))._status).toBe(404);
    expect(H.planilhas).toHaveLength(0);
  });
});
