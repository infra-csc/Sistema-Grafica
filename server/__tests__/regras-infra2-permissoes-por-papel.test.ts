// ─────────────────────────────────────────────────────────────────────────────
// O QUE A TELA DE USUÁRIOS PROMETE, O SERVIDOR CUMPRE — rodando.
//
// Veio de usuarios-permissoes.test.ts ("cada ✓ da tela existe no servidor" e
// "cada × da tela também existe no servidor"), que procurava as guardas de
// papel no TEXTO das rotas com regex (requireRole, `userRole !== "x"`, lista
// com includes…). Aqui a rota REAL roda com a sessão de cada papel e o que se
// afirma é a resposta: 403 é "não pode"; qualquer outra resposta (400, 404,
// 409, 200) é "passou pela guarda de papel". O storage não tem nada — nenhuma
// escrita acontece de verdade.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeAll } from "vitest";

// Storage vazio: todo método existe e não acha nada (a rota para em 404/400
// depois de decidir o papel).
const H = vi.hoisted(() => ({
  storage: new Proxy({} as Record<string, any>, {
    get: (alvo, nome: string) => (alvo[nome] ??= async () => undefined),
  }),
}));

vi.mock("../db", () => ({ db: { transaction: async () => { throw new Error("sem banco"); }, execute: async () => ({ rows: [] }) }, pool: { query: async () => ({ rows: [] }) } }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return { ...real, broadcast: () => {}, createAuditLog: async () => {}, updateEventStatus: async () => {} };
});
vi.mock("../cache", () => ({ eventsCache: null, setEventsCache: vi.fn(), invalidateEventsCache: vi.fn(), invalidateAllCaches: vi.fn(), registrarCache: vi.fn(), invalidarCacheNoCluster: vi.fn() }));
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));
vi.mock("../services/consultaDeEstoqueNaLiberacao", () => ({
  respostaDoEstoqueParaLiberar: vi.fn(async () => null),
  marcarRespostaAplicada: vi.fn(async () => {}),
}));

import type { Express } from "express";
import { registerItemRoutes } from "../routes/items";
import { registerEventRoutes } from "../routes/events";
import { registerSponsorRoutes } from "../routes/sponsors";
import { registerAuthRoutes } from "../routes/auth";
import { registerPhotoRoutes } from "../routes/photos";
import { capturarRotas } from "./rotas-de-mentira";

const { rotas, chamar } = capturarRotas((app: Express) => {
  registerItemRoutes(app);
  registerEventRoutes(app);
  registerSponsorRoutes(app);
  registerAuthRoutes(app);
  registerPhotoRoutes(app);
});

beforeAll(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

/** "PATCH /api/items/:id" fixa o verbo; sem verbo, vale toda escrita registrada nesse caminho. */
function escritasDe(rota: string): string[] {
  const [, verbo, caminho] = /^(?:(POST|PATCH|PUT|DELETE) )?(.*)$/.exec(rota)!;
  const chaves = Array.from(rotas.keys()).filter((k) => {
    const [v, c] = k.split(" ");
    return c === caminho && v !== "GET" && (!verbo || v === verbo);
  });
  expect(chaves, `rota não registrada: ${rota}`).not.toEqual([]);
  return chaves;
}

const PARAMS = { id: "x1", itemId: "x1", eventId: "ev-x", sponsorId: "sp-x" };

/** A resposta de cada escrita da rota para este papel. */
async function respostas(rota: string, papel: string) {
  const saida: { chave: string; status: number; body: unknown }[] = [];
  for (const chave of escritasDe(rota)) {
    const r = await chamar(chave, { sessao: { userId: "u-teste", userRole: papel, userName: "Teste" }, params: PARAMS, body: {} });
    saida.push({ chave, status: r.status, body: r.body });
  }
  return saida;
}

describe("cada ✓ da tela passa pela guarda de papel do servidor", () => {
  const PODE: [string, string, string][] = [
    ["admin", "/api/users/:id", "gerenciar usuários"],
    ["solicitacao", "/api/events", "criar eventos"],
    ["solicitacao", "/api/items/:id/creator-review", "revisar peças"],
    ["solicitacao", "PATCH /api/items/:id", "editar peças"],
    ["solicitacao", "/api/items/:id/cancel", "cancelar peças"],
    ["arte", "/api/items/:id/submit-for-approval", "enviar para aprovação"],
    ["arte", "/api/items/:id/submit-final-file", "anexar arquivo final"],
    ["arte", "/api/items/:id/update-thumb", "anexar a arte"],
    ["arte", "/api/events/:eventId/book", "publicar o book"],
    ["grafica", "/api/items/:id/start-production", "iniciar produção"],
    ["grafica", "/api/items/:id/return-to-review", "devolver para revisão"],
    ["grafica", "/api/items/:itemId/photos", "anexar fotos"],
    ["atendimento", "/api/items/:id/sponsor-approvals/:sponsorId/approve", "aprovar pelo patrocinador"],
    ["atendimento", "/api/items/:id/sponsor-approvals/:sponsorId/revert", "revogar decisão"],
    ["atendimento", "/api/quota-rules/global", "ajustar cotas"],
  ];

  for (const [papel, rota, oQue] of PODE) {
    it(`${papel} pode ${oQue} (${rota})`, async () => {
      for (const r of await respostas(rota, papel)) {
        expect(r.status, `${r.chave}: ${JSON.stringify(r.body)}`).not.toBe(403);
      }
    });
  }
});

describe("cada × da tela é 403 no servidor", () => {
  const NAO_PODE: [string, string, string][] = [
    ["solicitacao", "/api/items/:id/sponsor-approvals/:sponsorId/approve", "decidir aprovação de patrocinador"],
    ["arte", "/api/items/:id/sponsor-approvals/:sponsorId/approve", "decidir aprovação de patrocinador"],
    ["grafica", "/api/items/:id/sponsor-approvals/:sponsorId/approve", "decidir aprovação de patrocinador"],
    ["arte", "/api/events", "criar eventos"],
    ["atendimento", "/api/events", "criar eventos"],
    ["grafica", "/api/events", "criar eventos"],
    ["solicitacao", "DELETE /api/events/:id", "excluir eventos"],
    ["solicitacao", "/api/items/:id/submit-final-file", "anexar arquivo final"],
    ["grafica", "/api/items/:id/submit-final-file", "anexar arquivo final"],
    ["atendimento", "/api/items/:id/submit-final-file", "anexar arquivo final"],
    ["grafica", "/api/items/:id/submit-for-approval", "enviar para aprovação"],
    ["atendimento", "/api/items/:id/start-production", "iniciar produção"],
    ["solicitacao", "/api/users/:id", "gerenciar usuários"],
    ["arte", "/api/users/:id", "gerenciar usuários"],
  ];

  for (const [papel, rota, oQue] of NAO_PODE) {
    it(`${papel} NÃO pode ${oQue} (${rota})`, async () => {
      for (const r of await respostas(rota, papel)) {
        expect(r.status, `${r.chave}: ${JSON.stringify(r.body)}`).toBe(403);
      }
    });
  }
});
