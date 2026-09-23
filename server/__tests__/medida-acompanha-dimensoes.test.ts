// ─────────────────────────────────────────────────────────────────────────────
// A MEDIDA ACOMPANHA AS DIMENSÕES — e nenhum campo derivado envelhece sozinho.
//
// Relatado em produção, 20/08: a peça #2472 teve as dimensões corrigidas de
// 3.95×2.95 para 7.55×2.25 às 14:36, e a gráfica continuou lendo 3.95×2.95.
//
// A causa é uma denormalização meio-mantida. `items.measurement` guarda
// "3.95 × 2.95" como TEXTO ao lado de `file_width` e `file_height`, que guardam
// os mesmos dois números. O m² já era recalculado no servidor a cada edição; a
// medida, que é o MESMO dado pela mesma razão, não era: o PATCH escrevia por
// cima o `measurement` que o formulário tinha carregado ao ABRIR — o antigo.
// A mesma doença na dupla ao lado: `area`/`visual` (o par ORIGINAL da medida
// visual) congelava quando o formulário mandava só `visual_width/height`.
//
// A regra é deliberadamente estreita: re-derivar SÓ quando as dimensões mudam.
// `measurement` é editável de propósito, e derivar sempre apagaria um texto
// escrito à mão que ninguém pediu para apagar.
//
// Tudo aqui RODA o código: as funções de derivação, o PATCH/POST reais (borda
// mockada) e o script do passivo com o banco de mentira. Os casos de
// campos-derivados-nao-envelhecem.test.ts que liam o fonte vieram para cá.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { montarRotas } from "./regras-producao-apoio";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: {} as Record<string, any>,
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
    requireRole: () => (_req: any, _res: any, next: any) => next(),
    broadcast: () => {},
    createAuditLog: async (_req: any, _acao: string, _tipo: string, _id: string, detalhe: string) => { H.trilha.push(detalhe); },
    createAuditLogsEmLote: async () => {},
    updateEventStatus: async () => {},
  };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));

import { items } from "@shared/schema";
import { deriveMeasurement, medidaMudou, derivarAreaVisual, deriveCalculatedM2 } from "../routes/itens/comum";
import * as comum from "../routes/itens/comum";
import { updateItemSchema } from "../services/edicao-da-peca";
import { registerItemRoutes } from "../routes/items";

const { chamar } = montarRotas(registerItemRoutes);

let pecas: Record<string, any>;
let criadas: any[];
const peca = (over: Record<string, unknown> = {}) => ({
  id: "p1", displayId: "#2472", eventId: "ev-1", type: "Pórtico", description: "Pórtico", status: "draft",
  quantity: 2, quantityProduced: null, reuseQty: 0, isReuse: false, conferredQty: 0, deliveredQty: 0, embaladaQty: 0,
  fileWidth: "3.95", fileHeight: "2.95", measurement: "3.95 × 2.95", calculatedM2: "23.31",
  area: "3.95", visual: "2.95", visualWidth: "3.95", visualHeight: "2.95",
  skipApproval: false, isPriority: false, approvalThumbUrl: null, finalFileUrl: null, deletedAt: null, travadaEm: null,
  ...over,
});
const editar = (body: Record<string, unknown>) => chamar("PATCH /api/items/:id", { params: { id: "p1" }, body, userRole: "solicitacao" });

beforeEach(() => {
  H.trilha.length = 0;
  pecas = { p1: peca() };
  criadas = [];
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getItem = vi.fn(async (id: string) => (pecas[id] ? { ...pecas[id] } : undefined));
  s.getEvent = vi.fn(async () => ({ id: "ev-1", name: "COPA", status: "created", startDate: "2099-01-10", createdBy: "u1" }));
  s.updateItem = vi.fn(async (id: string, dados: any) => (pecas[id] = { ...pecas[id], ...dados }));
  s.updateEvent = vi.fn(async () => ({}));
  s.createNotification = vi.fn(async (n: any) => ({ id: "n1", ...n }));
  s.createItem = vi.fn(async (dados: any) => { criadas.push(dados); return { id: "novo", displayId: "#0900", ...dados }; });
  s.createBulkItems = vi.fn(async (lista: any[]) => { criadas.push(...lista); return lista.map((d, i) => ({ id: `n${i}`, displayId: `#09${i}`, ...d })); });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("as derivações do servidor (funções puras)", () => {
  it("a medida em texto: 'L × A' com 2 casas — o mesmo formato do importador de planilha", () => {
    expect(deriveMeasurement("7.55", "2.25")).toBe("7.55 × 2.25");
    expect(deriveMeasurement(3, 2.5)).toBe("3.00 × 2.50");
  });

  it("exige os dois lados positivos; sem dimensão devolve undefined (e não '', que apagaria o texto)", () => {
    for (const [w, h] of [[null, "2"], ["2", undefined], ["0", "2"], ["-1", "2"], ["abc", "2"], [undefined, undefined]] as const) {
      expect(deriveMeasurement(w as any, h as any), `${w}×${h}`).toBeUndefined();
    }
  });

  it("'mudou?' compara os NÚMEROS: '3.9' e '3.90' são a mesma dimensão", () => {
    const atual = { fileWidth: "3.90", fileHeight: "2.95" };
    expect(medidaMudou(atual, "3.9", 2.95)).toBe(false);
    expect(medidaMudou(atual, "7.55", "2.95")).toBe(true);
    expect(medidaMudou(atual, "3.90", "2.25")).toBe(true);
  });

  it("o par visual velho (area/visual) sai do par novo, e o m² de quantidade × largura × altura", () => {
    expect(derivarAreaVisual("2", "1.5")).toEqual({ area: "2.00", visual: "1.50" });
    expect(derivarAreaVisual(null, "1.5")).toBeUndefined();
    expect(deriveCalculatedM2({ quantity: 2, fileWidth: "7.55", fileHeight: "2.25" })).toBe("33.98");
    expect(deriveCalculatedM2({ quantity: 2, fileWidth: null, fileHeight: "2.25" })).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("cada fato guardado em mais de uma coluna tem quem o mantenha junto", () => {
  // A classe de bug (campos-derivados-nao-envelhecem): se duas colunas guardam o
  // mesmo fato, ou o servidor as move JUNTAS, ou uma delas mente. Quem for
  // adicionar a terceira dupla acrescenta aqui a coluna e a função.
  const DUPLAS = [
    { fato: "a medida do arquivo, como texto", colunas: ["measurement", "file_width", "file_height"], derivador: "deriveMeasurement" },
    { fato: "a medida visual, no par antigo", colunas: ["area", "visual", "visual_width", "visual_height"], derivador: "derivarAreaVisual" },
    { fato: "o metro quadrado", colunas: ["calculated_m2", "quantity", "file_width", "file_height"], derivador: "deriveCalculatedM2" },
  ];
  const colunasDoBanco = getTableConfig(items).columns.map((c) => c.name);

  it.each(DUPLAS)("$fato → $derivador", ({ colunas, derivador }) => {
    expect(typeof (comum as Record<string, unknown>)[derivador], `${derivador} sumiu de server/routes/itens/comum.ts`).toBe("function");
    for (const c of colunas) expect(colunasDoBanco, `a coluna ${c} sumiu do schema`).toContain(c);
  });

  it("measurement continua editável pelo PATCH (é texto de gente, não só derivado)", () => {
    expect(updateItemSchema.parse({ measurement: "conforme croqui" })).toEqual({ measurement: "conforme croqui" });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("PATCH /api/items/:id — o único caminho de edição", () => {
  it("dimensão mudou: grava a medida DERIVADA e ignora a velha que o formulário devolveu (a #2472)", async () => {
    const r = await editar({ fileWidth: "7.55", fileHeight: "2.25", measurement: "3.95 × 2.95" });
    expect(r.status).toBe(200);
    expect(H.storage.updateItem).toHaveBeenCalledWith("p1", expect.objectContaining({ measurement: "7.55 × 2.25", calculatedM2: "33.98" }));
    expect(pecas.p1.measurement).toBe("7.55 × 2.25");
  });

  it("mudar só UM lado também re-deriva, com o outro lado que já estava na peça", async () => {
    await editar({ fileHeight: "2.25" });
    expect(pecas.p1.measurement).toBe("3.95 × 2.25");
  });

  it("dimensão igual: o texto escrito à mão fica ('conforme croqui' não é apagado)", async () => {
    pecas.p1 = peca({ measurement: "conforme croqui" });
    await editar({ fileWidth: "3.95", fileHeight: "2.95", measurement: "conforme croqui" });
    expect(pecas.p1.measurement).toBe("conforme croqui");
    await editar({ measurement: "3 peças de 2m" });
    expect(pecas.p1.measurement).toBe("3 peças de 2m");
  });

  it("o par velho da medida visual anda com o par novo", async () => {
    await editar({ visualWidth: "2.00", visualHeight: "1.50" });
    expect(pecas.p1).toMatchObject({ area: "2.00", visual: "1.50", visualWidth: "2.00", visualHeight: "1.50" });
  });

  it("a trilha diz que a medida mudou — comparando o que FOI GRAVADO, não o que veio no corpo", async () => {
    // O corpo trouxe a medida VELHA (o formulário devolve a que carregou); o
    // gravado é a derivada — é essa troca que a trilha tem de contar.
    await editar({ fileWidth: "7.55", fileHeight: "2.25", measurement: "3.95 × 2.95" });
    expect(H.trilha[0]).toContain("Medida: 3.95 × 2.95 → 7.55 × 2.25");
    expect(H.trilha[0]).toContain("Dimensões: 3.95×2.95 → 7.55×2.25");
  });

  it("e diz quando a medida visual mudou", async () => {
    await editar({ visualWidth: "2.00", visualHeight: "1.50" });
    expect(H.trilha[0]).toContain("Medida visual: 3.95×2.95 → 2.00×1.50");
  });

  it("dimensão igual e medida igual: a trilha não inventa mudança de medida", async () => {
    await editar({ fileWidth: "3.95", fileHeight: "2.95", observations: "ok" });
    expect(H.trilha[0]).not.toContain("Medida:");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("na criação, a medida nasce junto — só quando o cliente não mandou uma", () => {
  const base = { eventId: "ev-1", type: "Pórtico", quantity: 2, area: "7.55", visual: "2.25", material: "Lona", finish: "Refile", calculatedM2: "1", fileWidth: "7.55", fileHeight: "2.25" };

  it("POST unitário: sem medida → derivada; com texto → o texto (não há valor anterior para contradizer)", async () => {
    expect((await chamar("POST /api/items", { body: { ...base, measurement: "" }, userRole: "admin" })).status).toBe(201);
    expect((await chamar("POST /api/items", { body: { ...base, measurement: "conforme croqui" }, userRole: "admin" })).status).toBe(201);
    expect(criadas.map((c) => c.measurement)).toEqual(["7.55 × 2.25", "conforme croqui"]);
  });

  it("POST em lote: a mesma regra, linha a linha", async () => {
    const r = await chamar("POST /api/items/bulk", { body: { items: [{ ...base, measurement: "  " }, { ...base, measurement: "à mão" }] }, userRole: "admin" });
    expect(r.status).toBe(201);
    expect(criadas.map((c) => c.measurement)).toEqual(["7.55 × 2.25", "à mão"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// O PASSIVO: as peças que divergiram ANTES da correção seguem divergindo até
// alguém editá-las. O script as lista e só escreve com --aplicar.
describe("scripts/conferir-medida-vs-dimensoes.ts — roda com o banco de mentira", () => {
  const acervo = [
    { id: "a", displayId: "#0001", fileWidth: "7.55", fileHeight: "2.25", measurement: "3.95 × 2.95", area: "7.55", visual: "2.25", visualWidth: "7.55", visualHeight: "2.25" },
    { id: "b", displayId: "#0002", fileWidth: "2", fileHeight: "1", measurement: "conforme croqui", area: "2", visual: "1", visualWidth: "2", visualHeight: "1" },
    { id: "c", displayId: "#0003", fileWidth: null, fileHeight: null, measurement: "", area: "3.95", visual: "2.95", visualWidth: "2.00", visualHeight: "1.50" },
    { id: "d", displayId: "#0004", fileWidth: "1", fileHeight: "1", measurement: "1.00 × 1.00", area: "1", visual: "1", visualWidth: "1", visualHeight: "1" },
  ];
  let gravacoes: Array<{ valores: any }>;
  let saida: string[];

  async function rodar(argv: string[]) {
    gravacoes = []; saida = [];
    for (const k of Object.keys(H.db)) delete H.db[k];
    H.db.select = () => ({ from: async () => acervo.map((l) => ({ ...l })) });
    H.db.update = () => ({ set: (valores: any) => ({ where: async () => { gravacoes.push({ valores }); } }) });
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => { saida.push(a.join(" ")); });
    const argvAntes = process.argv;
    process.argv = ["node", "conferir-medida-vs-dimensoes.ts", ...argv];
    const fim = new Promise<number>((ok) => { vi.spyOn(process, "exit").mockImplementation(((c?: number) => { ok(c ?? 0); }) as never); });
    try {
      vi.resetModules();
      await import("../../scripts/conferir-medida-vs-dimensoes");
      return await fim;
    } finally {
      process.argv = argvAntes;
    }
  }
  afterEach(() => { vi.restoreAllMocks(); });

  it("sem --aplicar: lista as duas duplas e NÃO escreve nada", async () => {
    expect(await rodar([])).toBe(0);
    expect(gravacoes).toEqual([]);
    const texto = saida.join("\n");
    expect(texto).toContain("MEDIDA (texto) diferente das dimensões de arquivo: 1");
    expect(texto).toContain("AREA/VISUAL congelados fora do par visual_width/height: 1");
    expect(texto).toContain("Nada foi escrito.");
  });

  it("com --aplicar: corrige a medida que PARECE medida e o par velho — e deixa a prosa em paz", async () => {
    expect(await rodar(["--aplicar"])).toBe(0);
    expect(gravacoes.map((g) => g.valores)).toEqual([
      { measurement: "7.55 × 2.25" },   // a #0001, a medida velha
      { area: "2.00", visual: "1.50" }, // a #0003, o par congelado
    ]);
    const texto = saida.join("\n");
    // "conforme croqui" não é medida errada: sai na seção à parte, sem ser tocado.
    expect(texto).toContain("Texto que NÃO parece medida — não serão tocadas: 1");
    expect(texto).toContain('"conforme croqui"');
  });
});
