// O Excel da tela Reaproveitar: a lista para separar no estoque, por prova.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/banco_nunca_acessado";
vi.mock("../storage", () => ({
  storage: {},
  compareDisplayId: (a: string, b: string) => String(a).localeCompare(String(b)),
}));

const peca = (over: Record<string, unknown>) => ({
  id: "p", eventId: "e1", displayId: "#1", type: "2x1", description: "Painel", material: "Lona", quantity: 10, status: "ready_for_production",
  reusoPedido: 0, reuseQty: 0, isReuse: false, fileWidth: "1.90", fileHeight: "0.90", obsReaproveitamento: null, observations: null, ...over,
}) as any;

describe("montarPlanilhaDoReaproveitar", () => {
  const eventos = new Map([
    ["e1", { name: "Prova que sai depois", truckDepartureDate: new Date("2026-12-10T12:00:00Z") }],
    ["e2", { name: "Prova que sai antes", truckDepartureDate: new Date("2026-11-10T12:00:00Z") }],
  ]) as any;

  it("sai na ordem do caminhão, com a quantidade a separar e a coluna Separado vazia", async () => {
    const { montarPlanilhaDoReaproveitar } = await import("../services/excelDoReaproveitar");
    const wb = montarPlanilhaDoReaproveitar([
      peca({ id: "a", displayId: "#2", eventId: "e1", reusoPedido: 4, obsReaproveitamento: "Galpão 2" }),
      peca({ id: "b", displayId: "#1", eventId: "e2", reuseQty: 3, status: "produced" }),
    ], eventos, "Reaproveitar: teste");
    const ws = wb.getWorksheet("Separação")!;
    const cab = (ws.getRow(3).values as unknown[]).slice(1);
    expect(cab).toEqual(["Evento", "Saída", "Código", "Tipo", "Descrição", "Material", "Medidas (m)", "Separar (un.)", "Separado", "Onde está", "Observação da peça"]);
    const col = (nome: string) => cab.indexOf(nome) + 1;
    expect(ws.getRow(4).getCell(col("Evento")).value).toBe("Prova que sai antes");
    expect(ws.getRow(4).getCell(col("Separar (un.)")).value).toBe(3);
    expect(ws.getRow(5).getCell(col("Código")).value).toBe("#2");
    expect(ws.getRow(5).getCell(col("Separar (un.)")).value).toBe(4);
    expect(ws.getRow(5).getCell(col("Onde está")).value).toBe("Galpão 2");
    expect(ws.getRow(5).getCell(col("Medidas (m)")).value).toBe("1.90 × 0.90");
    expect(ws.getRow(5).getCell(col("Separado")).value || "").toBe("");
    expect(String(ws.getCell("A2").value)).toContain("2 peças");
    expect(String(ws.getCell("A2").value)).toContain("7 un. para separar");
  });

  it("nome longo quebra a linha, sem cortar", async () => {
    const { montarPlanilhaDoReaproveitar } = await import("../services/excelDoReaproveitar");
    const wb = montarPlanilhaDoReaproveitar([peca({ description: "x".repeat(200) })], eventos, "t");
    expect(wb.getWorksheet("Separação")!.getRow(4).getCell(5).alignment?.wrapText).toBe(true);
  });
});

describe("a tela e a rota", () => {
  const ler = (f: string) => readFileSync(path.resolve(__dirname, "../..", f), "utf8");
  it("o botão exporta a lista filtrada que está na tela", () => {
    const P = ler("client/src/pages/reaproveitar.tsx");
    expect(P).toContain('data-testid="button-excel-reaproveitar"');
    expect(P).toContain("ids: visiveis.map((p) => p.id)");
  });
  it("a rota fica fora de /api/items e recorta o Kit", () => {
    expect(ler("server/routes/itens/planilha.ts")).toContain('app.post("/api/reaproveitar/excel", requireAuth, responderExcelDoReaproveitar)');
    expect(ler("server/services/excelDoReaproveitar.ts")).toContain("doKit.has(i.id)");
  });
});
