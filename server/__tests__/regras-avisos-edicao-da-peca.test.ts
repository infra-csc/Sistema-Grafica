// ─────────────────────────────────────────────────────────────────────────────
// O PATCH /api/items/:id, RODANDO — referências múltiplas em sincronia e o
// recado para a Gráfica na trilha.
//
// De onde vieram (eram leituras do texto de shared/schema.ts e das rotas da
// peça): referencias-multiplas.test.ts ("a coluna existe e o PATCH aceita os
// dois campos"; "o PATCH sincroniza NOS DOIS sentidos e normaliza cada URL")
// e recado-para-a-grafica.test.ts ("a trilha grava o texto"). Aqui o PATCH
// roda com storage e object storage de mentira; afirma-se o gravado e a trilha.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => {
  const base: Record<string, any> = {};
  return {
    base,
    storage: new Proxy(base, { get: (t, k: string) => (k in t ? t[k] : (t[k] = vi.fn(async () => []))) }),
    acl: [] as { url: string; acl: unknown }[],
    trilha: [] as string[],
  };
});

vi.mock("../db", () => ({ db: { transaction: async (fn: (tx: unknown) => unknown) => fn({}), execute: async () => ({ rows: [] }) }, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return { ...real, broadcast: () => {}, createAuditLog: async (_r: unknown, _a: string, _t: string, _id: string, detalhe: string) => { H.trilha.push(detalhe); }, updateEventStatus: async () => {} };
});
// O object storage: a URL crua do bucket vira /objects/ com a ACL do dono;
// objeto que não existe (URL externa) cai só na normalização do caminho.
vi.mock("../objectStorage", () => ({
  ObjectStorageService: class {
    async trySetObjectEntityAclPolicy(url: string, acl: unknown) {
      H.acl.push({ url, acl });
      if (url.includes("externo")) throw new Error("objeto não existe");
      return url.replace("https://storage.googleapis.com/bucket/.private/", "/objects/");
    }
    normalizeObjectEntityPath(url: string) { return `normalizado:${url}`; }
  },
}));
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));

import { getTableConfig } from "drizzle-orm/pg-core";
import { items } from "@shared/schema";
import { capturarRotas } from "./rotas-de-mentira";
import { registerItemRoutes } from "../routes/items";

const { chamar } = capturarRotas(registerItemRoutes);
const CRU = "https://storage.googleapis.com/bucket/.private/uploads/";

let gravado: Record<string, unknown> | null;
beforeEach(() => {
  for (const k of Object.keys(H.base)) delete H.base[k];
  H.acl = [];
  H.trilha = [];
  gravado = null;
  const peca = { id: "p1", displayId: "#1", eventId: "ev-1", type: "Pórtico", status: "draft", quantity: 1, deletedAt: null,
    referenceUrl: "/objects/uploads/velha.png", referenceUrls: ["/objects/uploads/velha.png"], observations: "recado antigo" };
  H.base.getItem = vi.fn(async () => peca);
  H.base.getEvent = vi.fn(async () => ({ id: "ev-1", status: "created", startDate: "2099-01-10", truckDepartureDate: new Date("2099-01-01") }));
  H.base.updateItem = vi.fn(async (_id: string, dados: Record<string, unknown>) => { gravado = dados; return { ...peca, ...dados }; });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const patch = async (body: Record<string, unknown>) => {
  const r = await chamar("PATCH /api/items/:id", { sessao: { userId: "u-arte", userRole: "arte", userName: "Ana" }, params: { id: "p1" }, body });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return gravado!;
};

describe("a lista na peça, a primeira no campo antigo", () => {
  it("a coluna reference_urls existe, é lista de texto e opcional (aditiva)", () => {
    const col = getTableConfig(items).columns.find((c) => c.name === "reference_urls");
    expect(col).toBeDefined();
    expect(col!.getSQLType()).toBe("text[]");
    expect(col!.notNull).toBe(false);
  });

  it("a LISTA manda: cada URL normalizada com a ACL de quem enviou, e o campo antigo vira a primeira", async () => {
    const g = await patch({ referenceUrls: [`${CRU}a.png`, "", "/objects/uploads/b.png", "https://externo.com/c.png"] });
    expect(g.referenceUrls).toEqual(["/objects/uploads/a.png", "/objects/uploads/b.png", "normalizado:https://externo.com/c.png"]);
    expect(g.referenceUrl).toBe("/objects/uploads/a.png");
    // o vazio foi descartado antes da ACL; o dono é o usuário da sessão, visível a todo logado
    expect(H.acl.map((a) => a.url)).toEqual([`${CRU}a.png`, "/objects/uploads/b.png", "https://externo.com/c.png"]);
    expect(H.acl[0].acl).toEqual({ owner: "u-arte", visibility: "public" });
  });

  it("lista vazia remove tudo: o campo antigo vira null", async () => {
    const g = await patch({ referenceUrls: [] });
    expect(g.referenceUrls).toEqual([]);
    expect(g.referenceUrl).toBeNull();
  });

  it("só o campo antigo (chamador legado): a lista espelha ele — normalizado", async () => {
    const g = await patch({ referenceUrl: `${CRU}nova.png` });
    expect(g.referenceUrl).toBe("/objects/uploads/nova.png");
    expect(g.referenceUrls).toEqual(["/objects/uploads/nova.png"]);
  });

  it("limpar pelo campo antigo limpa a lista", async () => {
    const g = await patch({ referenceUrl: null });
    expect(g.referenceUrl).toBeNull();
    expect(g.referenceUrls).toBeNull();
  });

  it("edição que não toca referência não mexe em nenhum dos dois campos", async () => {
    const g = await patch({ description: "nova descrição" });
    expect(g).not.toHaveProperty("referenceUrl");
    expect(g).not.toHaveProperty("referenceUrls");
  });
});

describe("o recado para a Gráfica não se perde", () => {
  it("a trilha grava o TEXTO do recado, não só 'Observações atualizadas'", async () => {
    await patch({ observations: "  Imprimir em lona fosca  " });
    expect(H.trilha).toEqual(['Observações: "Imprimir em lona fosca"']);
  });

  it("recado longo não estoura a linha da trilha: 300 caracteres e reticências", async () => {
    await patch({ observations: "x".repeat(450) });
    expect(H.trilha[0]).toBe(`Observações: "${"x".repeat(300)}..."`);
  });

  it("apagar o recado também fica registrado", async () => {
    await patch({ observations: "" });
    expect(H.trilha).toEqual(["Observações apagadas"]);
  });
});
