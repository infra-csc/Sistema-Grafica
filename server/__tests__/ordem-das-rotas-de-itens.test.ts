// ─────────────────────────────────────────────────────────────────────────────
// A ORDEM DAS ROTAS DA PEÇA — a mesma de antes do fatiamento de items.ts.
//
// O Express entrega a requisição à PRIMEIRA rota que casa. Com as rotas
// espalhadas em server/routes/itens/*, trocar uma linha de registerItemRoutes
// de lugar muda qual handler responde: `GET /api/items/pending` depois de
// `GET /api/items/:eventId` vira "o evento de id pending", e os `bulk-*`
// antes do desvio do PATCH genérico mudam de dono. A lista abaixo é a ordem
// do items.ts monolítico, copiada dele — só muda de propósito.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";

vi.mock("../db", () => ({ db: {}, pool: {} }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));

const { registerItemRoutes } = await import("../routes/items");

const ORDEM_ORIGINAL = [
  "GET /api/items",
  "GET /api/items/deleted",
  "POST /api/items/:id/restore",
  "POST /api/items/labels-printed",
  "GET /api/items/pending",
  "GET /api/items/resubmission-needed",
  "GET /api/items/approved",
  "GET /api/items/batch-approval-data",
  "GET /api/items/:eventId",
  "POST /api/items",
  "POST /api/items/bulk",
  "GET /api/events/:id/export-items",
  "POST /api/items/export-xlsx",
  "POST /api/events/:id/preview-xlsx",
  "POST /api/events/:id/confirm-import",
  "POST /api/events/:id/clone-items",
  "PATCH /api/items/:id",
  "POST /api/items/:id/transfer-event",
  "DELETE /api/items/:id",
  "POST /api/items/:id/complement",
  "DELETE /api/items/:id/complement",
  "PATCH /api/items/:id/submit-for-approval",
  "PATCH /api/items/:id/sponsor-approve",
  "PATCH /api/items/:id/dispense",
  "GET /api/items/:id/sponsor-approvals",
  "POST /api/items/:id/sponsor-approvals/:sponsorId/approve",
  "POST /api/items/:id/sponsor-approvals/:sponsorId/reject",
  "POST /api/items/:id/sponsor-approvals/:sponsorId/revert",
  "POST /api/items/:id/sponsor-approvals/resubmit",
  "POST /api/items/:id/initialize-sponsor-approvals",
  "PATCH /api/items/:id/submit-final-file",
  "PATCH /api/items/:id/update-thumb",
  "PATCH /api/items/:id/update-final-file",
  "PATCH /api/items/:id/creator-review",
  "PATCH /api/items/:id/arte-reject",
  "PATCH /api/items/:id/return-to-arte",
  "PATCH /api/items/:id/return-to-review",
  "PATCH /api/items/bulk-return-to-arte",
  "PATCH /api/items/:id/cancel",
  "PATCH /api/items/:id/uncancel",
  "PATCH /api/items/bulk-cancel",
  "PATCH /api/items/:id/approve",
  "PATCH /api/items/:id/start-printing",
  "PATCH /api/items/:id/start-production",
  "POST /api/items/:id/mark-reuse",
  "POST /api/items/:id/correct-reuse",
  "POST /api/items/:id/confer",
  "PATCH /api/items/:id/deliver",
  "POST /api/events/:eventId/book",
  "POST /api/events/:eventId/book/notify",
  "POST /api/revisao/digest/enviar",
  "POST /api/gestao/digest/enviar",
  "GET /api/admin/consistencia",
  "GET /api/admin/notificacoes",
  "POST /api/admin/notificacoes/destinatarios",
  "DELETE /api/admin/notificacoes/destinatarios/:id",
  "POST /api/items/:id/production",
];

function ordemRegistrada(): string[] {
  const ordem: string[] = [];
  const app: any = {};
  for (const verbo of ["get", "post", "patch", "put", "delete"]) {
    app[verbo] = (caminho: string) => { ordem.push(`${verbo.toUpperCase()} ${caminho}`); return app; };
  }
  registerItemRoutes(app);
  return ordem;
}

describe("registerItemRoutes — a ordem de sempre", () => {
  it("registra as mesmas rotas, na mesma ordem do items.ts monolítico", () => {
    expect(ordemRegistrada()).toEqual(ORDEM_ORIGINAL);
  });

  it("as leituras fixas vêm antes de GET /api/items/:eventId", () => {
    const ordem = ordemRegistrada();
    const porEvento = ordem.indexOf("GET /api/items/:eventId");
    for (const fixa of ["pending", "approved", "deleted", "resubmission-needed", "batch-approval-data"]) {
      expect(ordem.indexOf(`GET /api/items/${fixa}`)).toBeLessThan(porEvento);
    }
  });

  it("os lotes (bulk-*) vêm depois do PATCH genérico — é ele que os desvia com next()", () => {
    const ordem = ordemRegistrada();
    const generico = ordem.indexOf("PATCH /api/items/:id");
    expect(ordem.indexOf("PATCH /api/items/bulk-return-to-arte")).toBeGreaterThan(generico);
    expect(ordem.indexOf("PATCH /api/items/bulk-cancel")).toBeGreaterThan(generico);
  });
});
