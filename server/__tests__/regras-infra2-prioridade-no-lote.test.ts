// ─────────────────────────────────────────────────────────────────────────────
// PRIORIDADE NA ENTRADA RÁPIDA — o lote, rodando (dono, 27/08: "não achei para
// dar prioridade ao item").
//
// Veio de calendario-por-funcao.test.ts ("o LOTE tem o mesmo gate do POST
// unitário — e a notificação NOMEIA as prioritárias"), que lia o texto de
// server/routes/itens/criacao.ts. Aqui POST /api/items/bulk roda com storage
// de mentira.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  trilha: [] as { entityId: string; details: string }[],
  notificacoes: [] as any[],
}));

vi.mock("../db", () => ({ db: { transaction: async () => {}, execute: async () => ({ rows: [] }) }, pool: {} }));
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
    createAuditLogsEmLote: async (_req: any, linhas: any[]) => { H.trilha.push(...linhas); },
    updateEventStatus: async () => {},
  };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));

import { registerItemRoutes } from "../routes/items";
import { capturarRotas } from "./rotas-de-mentira";

const { chamar } = capturarRotas(registerItemRoutes);
const LINHA = { eventId: "ev-1", type: "Pórtico", description: "x", quantity: 1, area: "9.00", visual: "9.00", material: "Lona", finish: "Ilhós", measurement: "3x3", calculatedM2: "9.00" };
const lote = (papel: string, items: Record<string, unknown>[]) =>
  chamar("POST /api/items/bulk", { sessao: { userId: "u-arte", userRole: papel, userName: "Quem" }, body: { items } });

beforeEach(() => {
  H.trilha = [];
  H.notificacoes = [];
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  // A Arte criou o evento: pode criar peças nele (canCreateItemsFor).
  s.getEvent = vi.fn(async () => ({ id: "ev-1", name: "COPA NORTE", status: "created", startDate: "2099-01-10", createdBy: "u-arte" }));
  s.createBulkItems = vi.fn(async (lista: any[]) => lista.map((d, i) => ({ id: `n${i}`, displayId: `#090${i}`, ...d })));
  s.createNotification = vi.fn(async (n: any) => { H.notificacoes.push(n); return { id: "n1", ...n }; });
});

describe("POST /api/items/bulk — prioridade", () => {
  it("o gate é o do POST unitário: nascer prioritária é do admin e da Solicitação", async () => {
    const r = await lote("arte", [LINHA, { ...LINHA, isPriority: true }]);
    expect(r.status).toBe(403);
    expect((r.body as any).error).toBe("Marcar peça como prioritária é do admin e da Solicitação.");
    expect(H.storage.createBulkItems).not.toHaveBeenCalled();
    // sem prioridade, a mesma pessoa cria o lote normalmente
    expect((await lote("arte", [LINHA])).status).toBe(201);
    for (const papel of ["admin", "solicitacao"]) {
      expect((await lote(papel, [{ ...LINHA, isPriority: true }])).status, papel).toBe(201);
    }
  });

  it("a notificação NOMEIA as prioritárias, e a trilha marca cada uma", async () => {
    const r = await lote("solicitacao", [LINHA, { ...LINHA, isPriority: true }, LINHA]);
    expect(r.status).toBe(201);
    expect(H.notificacoes).toHaveLength(1);
    expect(H.notificacoes[0]).toMatchObject({
      type: "itemPriority",
      targetRoles: ["arte"],
      message: "3 itens adicionados - Evento: COPA NORTE — PRIORITÁRIAS (furam a fila): #0901",
    });
    expect(H.trilha.map((l) => l.details.endsWith(" — PRIORITÁRIA"))).toEqual([false, true, false]);
  });

  it("lote sem prioritária é o aviso de sempre", async () => {
    await lote("solicitacao", [LINHA, LINHA]);
    expect(H.notificacoes[0]).toMatchObject({ type: "itemAdded", message: "2 itens adicionados - Evento: COPA NORTE" });
  });
});
