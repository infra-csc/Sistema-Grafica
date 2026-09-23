// ─────────────────────────────────────────────────────────────────────────────
// A FILA DA CORREÇÃO E O ENVIO PARA A ARTE — as rotas reais sobre o storage de
// mentira de regras-fluxo-apoio.ts.
//
// Vieram de casos que só liam o fonte:
//   · correcao-sempre-tem-saida.test.ts — a peça devolvida INTEIRA
//     (awaiting_submission + rejectedBySponsor) chega à Correção com as
//     aprovações que tem (não um [] fixo), pelo mesmo mapa das demais;
//   · envio-repetido-nao-e-erro.test.ts — o envio em lote distingue "já foi
//     enviado" de "ainda não chegou à vinculação".
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: {} as Record<string, any>,
  broadcast: [] as any[],
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
    broadcast: (m: any) => { H.broadcast.push(m); },
    createAuditLog: async () => {},
    createAuditLogsEmLote: async () => {},
    updateEventStatus: async () => {},
  };
});
// sponsors.ts importa o índice das rotas de peça, que puxa as planilhas.
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));

import { registrarFilasEPorEvento } from "../routes/itens/leitura";
import { registerSponsorRoutes } from "../routes/sponsors";
import { capturarRotas } from "./rotas-de-mentira";
import { ligarStorage, mundoNovo, peca, sessao, type Mundo } from "./regras-fluxo-apoio";

const { chamar } = capturarRotas((app) => { registrarFilasEPorEvento(app); registerSponsorRoutes(app); });

let mundo: Mundo;
beforeEach(() => {
  mundo = mundoNovo();
  ligarStorage(H.storage, mundo);
  H.broadcast.length = 0;
  H.storage.getItemsParaCorrecao = vi.fn(async () => Object.values(mundo.itens));
  H.storage.getAllEvents = vi.fn(async () => Object.values(mundo.eventos));
  H.storage.getAllSponsors = vi.fn(async () => [{ id: "sp-atlas", name: "Atlas Schindler" }, { id: "sp-brad", name: "Bradesco" }]);
  H.storage.getItemSponsorApprovalsByItemIds = vi.fn(async (ids: string[]) => ids.flatMap((id) => mundo.aprovacoes[id] ?? []));
});

// ═════════════════════════════════════════════════════════════════════════════
describe("Correção: a peça devolvida leva as aprovações que tem", () => {
  it("a devolvida inteira vem com a linha em awaiting_arte (o caso #3027), pelo mesmo mapa da reprovada por patrocinador", async () => {
    mundo.itens.devolvida = peca({ id: "devolvida", displayId: "#3027", status: "awaiting_submission", rejectedBySponsor: true });
    mundo.itens.reprovada = peca({ id: "reprovada", displayId: "#3100", status: "awaiting_sponsor_approval" });
    mundo.itens.nuncaEnviada = peca({ id: "nuncaEnviada", status: "awaiting_submission", rejectedBySponsor: false });
    const linha = (itemId: string, sponsorId: string, status: string) => ({ id: `${itemId}-${sponsorId}`, itemId, sponsorId, status });
    mundo.aprovacoes.devolvida = [linha("devolvida", "sp-atlas", "awaiting_arte"), linha("devolvida", "sp-brad", "approved")];
    mundo.aprovacoes.reprovada = [linha("reprovada", "sp-brad", "awaiting_arte")];

    const r = await chamar("GET /api/items/resubmission-needed", { sessao: sessao("arte") });
    expect(r.status).toBe(200);
    const porId = new Map((r.body as any[]).map((i) => [i.id, i]));
    expect([...porId.keys()].sort()).toEqual(["devolvida", "reprovada"]);

    const devolvida = porId.get("devolvida");
    // Só as linhas em awaiting_arte: é o que o seletor do modal oferece.
    expect(devolvida.awaitingArteApprovals.map((a: any) => [a.sponsorId, a.sponsor?.name])).toEqual([["sp-atlas", "Atlas Schindler"]]);
    expect(devolvida.aprovacoes).toHaveLength(2);
    expect(porId.get("reprovada").awaitingArteApprovals.map((a: any) => a.sponsorId)).toEqual(["sp-brad"]);
  });

  it("devolvida sem linha de patrocinador segue na fila (lista vazia, não some)", async () => {
    mundo.itens.devolvida = peca({ id: "devolvida", status: "awaiting_submission", rejectedBySponsor: true });
    const r = await chamar("GET /api/items/resubmission-needed", { sessao: sessao("admin") });
    expect((r.body as any[]).map((i) => [i.id, i.awaitingArteApprovals])).toEqual([["devolvida", []]]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("envio para a Arte: a frase diz o que aconteceu", () => {
  it("'já foi enviado' para quem passou da vinculação; 'ainda não chegou' para rascunho e solicitado", async () => {
    mundo.itens.a = peca({ id: "a", displayId: "#0001", status: "awaiting_submission" });
    mundo.itens.b = peca({ id: "b", displayId: "#0002", status: "draft" });
    mundo.itens.c = peca({ id: "c", displayId: "#0003", status: "requested" });
    const r = await chamar("POST /api/items/send-to-arte", { sessao: sessao("atendimento"), body: { itemIds: ["a", "b", "c"] } });
    expect(r.status).toBe(200);
    const corpo = r.body as any;
    expect(corpo.sent).toBe(0);
    expect(corpo.errors).toEqual([
      'Item #0001 já foi enviado (está em "Aguardando Envio")',
      'Item #0002 ainda não chegou à vinculação (está em "Rascunho")',
      'Item #0003 ainda não chegou à vinculação (está em "Solicitado")',
    ]);
    // Nunca a frase velha, que não dizia nenhum dos dois lados.
    expect(JSON.stringify(corpo)).not.toContain("não está no status correto para envio");
    expect(H.storage.updateItem).not.toHaveBeenCalled();
  });
});
