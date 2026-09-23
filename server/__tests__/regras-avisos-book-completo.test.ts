// ─────────────────────────────────────────────────────────────────────────────
// BOOK COMPLETO SÓ NO ATENDIMENTO — as portas do SERVIDOR, rodando.
//
// Veio de book-completo-so-atendimento.test.ts (as portas de server/** e a
// exceção da Correção da Arte), que conferia se o texto de cada arquivo
// continha "ehBookCompleto(". Aqui cada porta roda com a mesma peça BOOK
// COMPLETO ao lado de uma peça comum, e o que se afirma é a resposta.
// Versões e Relatório têm o caso em regras-avisos-versoes/-relatorio.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const H = vi.hoisted(() => {
  // Método de storage não configurado responde lista vazia: cada porta só
  // precisa das peças; o resto do mundo pode estar vazio.
  const base: Record<string, any> = {};
  const storage = new Proxy(base, {
    get: (t, k: string) => (k in t ? t[k] : (t[k] = vi.fn(async () => []))),
  });
  // Consulta direta ao banco falha: as portas que a usam tratam a falha por bloco.
  const falha: any = new Proxy(function () {}, {
    get: (_t, k) => (k === "then" ? (_ok: unknown, erro: (e: Error) => void) => erro(new Error("sem banco no teste")) : () => falha),
    apply: () => falha,
  });
  return { base, storage, db: { select: () => falha, execute: () => falha, insert: () => falha }, resultados: [] as unknown[][] };
});

vi.mock("../db", () => ({ db: H.db, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));

import { capturarRotas } from "./rotas-de-mentira";
import { registerItemRoutes } from "../routes/items";
import { registerAnaliseRoutes } from "../routes/analises";
import { registerPrazoRoutes } from "../routes/prazos";
import { registerBuscaRoutes } from "../routes/busca";
import { montarResumo } from "../services/revisaoDigest";

const { chamar } = capturarRotas((app) => {
  registerItemRoutes(app);
  registerAnaliseRoutes(app);
  registerPrazoRoutes(app);
  registerBuscaRoutes(app);
});
const admin = { userId: "u1", userRole: "admin", userName: "Maria" };

type Linha = Record<string, any>;
const EVENTO = { id: "ev-1", name: "COPA NORTE", status: "created", startDate: "2099-01-10", truckDepartureDate: new Date("2099-01-01T00:00:00Z"), arquivadoEm: null };
const peca = (id: string, over: Linha = {}): Linha => ({
  id, displayId: `#${id}`, eventId: "ev-1", type: "Pórtico", description: `Peça ${id}`, status: "ready_for_production",
  deletedAt: null, skipApproval: false, kitRemessaId: null, criadoPorId: null, parentItemId: null,
  quantity: 1, createdAt: new Date("2026-09-01T12:00:00Z"), updatedAt: new Date("2026-09-01T12:00:00Z"), ...over,
});
const comum = (over: Linha = {}) => peca("comum", over);
const book = (over: Linha = {}) => peca("book", { type: "BOOK COMPLETO", ...over });

beforeEach(() => {
  for (const k of Object.keys(H.base)) delete H.base[k];
  H.base.getAllEvents = vi.fn(async () => [EVENTO]);
  H.base.getEvent = vi.fn(async () => EVENTO);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

const ids = (lista: Linha[]) => lista.map((p) => p.id).sort();

describe("as portas fechadas do servidor", () => {
  it("fila da Gráfica (GET /api/items/approved)", async () => {
    H.base.getApprovedItems = vi.fn(async () => [comum(), book()]);
    const r = await chamar("GET /api/items/approved", { sessao: admin });
    expect(r.status).toBe(200);
    expect(ids(r.body as Linha[])).toEqual(["comum"]);
  });

  it("fila da Gráfica, delta (?since=) — o book que mudou vai para 'removidas', não para a fila", async () => {
    H.base.getItemsChangedSince = vi.fn(async () => [comum({ updatedAt: new Date() }), book({ updatedAt: new Date() })]);
    const r = await chamar("GET /api/items/approved", { sessao: admin, query: { since: new Date(Date.now() - 60_000).toISOString() } });
    expect(r.status).toBe(200);
    const b = r.body as { itens: Linha[]; removidas: string[] };
    expect(ids(b.itens)).toEqual(["comum"]);
    expect(b.removidas).toContain("book");
  });

  it("Análises (tempo por etapa) não contam o book", async () => {
    // A rota guarda a resposta 60 s por recorte: o relógio anda entre as chamadas.
    vi.useFakeTimers({ toFake: ["Date"] });
    let t = Date.parse("2026-09-10T12:00:00Z");
    const tempo = async (lista: Linha[]) => {
      vi.setSystemTime((t += 3_600_000));
      H.base.getAllItems = vi.fn(async () => lista);
      const r = await chamar("GET /api/analises/tempo-por-etapa", { sessao: admin, query: { periodo: "tudo" } });
      expect(r.status).toBe(200);
      return JSON.stringify(r.body);
    };
    try {
      const semBook = await tempo([comum({ status: "delivered" })]);
      expect(await tempo([comum({ status: "delivered" }), book({ status: "delivered" })])).toBe(semBook);
      // e a porta é sensível: uma peça COMUM a mais muda a resposta
      expect(await tempo([comum({ status: "delivered" }), peca("outra", { status: "delivered" })])).not.toBe(semBook);
    } finally {
      vi.useRealTimers();
    }
  });

  it("Gestão de Prazos não conta o book", async () => {
    H.base.getItemsParaPrazos = vi.fn(async () => [comum({ status: "awaiting_creation" }), book({ status: "awaiting_creation" })]);
    const comBook = await chamar("GET /api/prazos", { sessao: admin });
    H.base.getItemsParaPrazos = vi.fn(async () => [comum({ status: "awaiting_creation" })]);
    const semBook = await chamar("GET /api/prazos", { sessao: admin });
    expect(comBook.status).toBe(200);
    const tirarRelogio = (b: any) => JSON.parse(JSON.stringify(b, (k, v) => (/(geradoEm|agora|calculadoEm|generatedAt)/i.test(k) ? undefined : v)));
    expect(JSON.stringify(comBook.body)).not.toContain("#book");
    expect(tirarRelogio(comBook.body)).toEqual(tirarRelogio(semBook.body));
    H.base.getItemsParaPrazos = vi.fn(async () => [comum({ status: "awaiting_creation" }), peca("outra", { status: "awaiting_creation" })]);
    const comOutra = await chamar("GET /api/prazos", { sessao: admin });
    expect(tirarRelogio(comOutra.body)).not.toEqual(tirarRelogio(semBook.body));
  });

  it("busca global", async () => {
    const respostas = [[comum(), book()].map((p) => ({ ...p, eventName: "COPA NORTE" })), []];
    const cadeia = (dados: unknown): any => new Proxy(function () {}, {
      get: (_t, k) => (k === "then" ? (ok: (v: unknown) => void) => ok(dados) : () => cadeia(dados)),
      apply: () => cadeia(dados),
    });
    const antes = H.db.select;
    H.db.select = () => cadeia(respostas.shift());
    try {
      const r = await chamar("GET /api/busca", { sessao: admin, query: { q: "peça" } });
      expect(r.status).toBe(200);
      expect(ids((r.body as { pecas: Linha[] }).pecas)).toEqual(["comum"]);
    } finally {
      H.db.select = antes;
    }
  });

  it("aviso da Revisão (montarResumo)", () => {
    const agora = new Date("2026-09-10T15:00:00Z");
    const naRevisao = { eventId: "ev-1", status: "awaiting_final_review", createdAt: new Date("2026-09-10T11:00:00Z") };
    const r = montarResumo([naRevisao, { ...naRevisao, type: "BOOK COMPLETO" }], () => "COPA NORTE", new Date("2026-09-10T10:00:00Z"), agora);
    const soComum = montarResumo([naRevisao], () => "COPA NORTE", new Date("2026-09-10T10:00:00Z"), agora);
    expect(r).toEqual(soComum);
    expect(montarResumo([naRevisao, naRevisao], () => "COPA NORTE", new Date("2026-09-10T10:00:00Z"), agora)).not.toEqual(soComum);
  });
});

describe("a exceção deliberada do servidor", () => {
  it("a Correção da Arte NÃO filtra — reprovada, a v2 precisa da porta de reenvio", async () => {
    H.base.getItemsParaCorrecao = vi.fn(async () => [
      comum({ status: "awaiting_submission", rejectedBySponsor: true }),
      book({ status: "awaiting_submission", rejectedBySponsor: true }),
    ]);
    const r = await chamar("GET /api/items/resubmission-needed", { sessao: { ...admin, userRole: "arte" } });
    expect(r.status).toBe(200);
    expect(ids(r.body as Linha[])).toEqual(["book", "comum"]);
  });
});
