// ─────────────────────────────────────────────────────────────────────────────
// TRANSFERIR, DESCANCELAR E CLONAR COM SELEÇÃO — as rotas reais de peça
// (server/routes/itens/*) rodando sobre o storage de mentira de
// regras-fluxo-apoio.ts, com o requireAuth de verdade (sessão de rotas-de-mentira).
//
// Vieram de casos que só liam o fonte:
//   · transferir-evento.test.ts — só admin (e declarado na régua), muda só o
//     evento, barra origem e destino finalizados, recusa o mesmo evento,
//     recalcula os dois eventos e derruba o cache de Versões;
//   · descancelar.test.ts — só admin, o cancelamento grava de onde a peça saiu
//     (individual e lote, sem sobrescrever), a ordem coluna → trilha →
//     requested, só cancelada descancela, evento finalizado barra;
//   · clonar-com-selecao.test.ts — itemIds opcional, id alheio recusado com
//     contagem, seleção vazia/malformada, a trilha "N de M".
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: { execute: (async () => ({ rows: [] })) as any, insert: (() => ({ values: async () => [] })) as any },
  broadcast: [] as any[],
  trilha: [] as string[],
  eventosRecalculados: [] as string[],
  cacheDeVersoes: 0,
  aoExcluirPeca: [] as any[],
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
    createAuditLog: async (_r: any, _a: string, _t: string, _id: string, detalhe: string) => { H.trilha.push(detalhe); },
    createAuditLogsEmLote: async (_r: any, linhas: Array<{ details: string }>) => { for (const l of linhas) H.trilha.push(l.details); },
    updateEventStatus: async (id: string) => { H.eventosRecalculados.push(id); },
  };
});
vi.mock("../routes/versoes", async () => {
  const real = await vi.importActual<any>("../routes/versoes");
  return { ...real, invalidarCacheDeVersoes: () => { H.cacheDeVersoes += 1; } };
});
vi.mock("../routes/estoque-reservas", async () => {
  const real = await vi.importActual<any>("../routes/estoque-reservas");
  return { ...real, liberarReservasDasPecas: async () => {} };
});
vi.mock("../routes/pedidos-de-peca", async () => {
  const real = await vi.importActual<any>("../routes/pedidos-de-peca");
  return { ...real, aoExcluirPeca: async (...a: any[]) => { H.aoExcluirPeca.push(a); } };
});

import { items } from "@shared/schema";
import { REGUA_DE_PAPEIS } from "@shared/permissoes";
import { EVENTO_REALIZADO_ERRO } from "../routes/eventoFinalizado";
import { registrarTransferencia } from "../routes/itens/transferencia";
import { registrarCancelamento } from "../routes/itens/cancelamento";
import { registrarClonagem } from "../routes/itens/criacao";
import { capturarRotas } from "./rotas-de-mentira";
import { ligarStorage, mundoNovo, peca, sessao, type Mundo } from "./regras-fluxo-apoio";

const { chamar } = capturarRotas((app) => { registrarTransferencia(app); registrarCancelamento(app); registrarClonagem(app); });
const regra = (metodo: string, rota: string) => REGUA_DE_PAPEIS.find((r) => r.metodo === metodo && r.rota === rota);

let mundo: Mundo;
beforeEach(() => {
  mundo = mundoNovo();
  ligarStorage(H.storage, mundo);
  H.broadcast.length = 0; H.trilha.length = 0; H.eventosRecalculados.length = 0; H.aoExcluirPeca.length = 0;
  H.cacheDeVersoes = 0;
  H.db.execute = vi.fn(async () => ({ rows: [] }));
});

// ═════════════════════════════════════════════════════════════════════════════
describe("transferir de evento", () => {
  const transferir = (papel: string, id: string, eventId: string) =>
    chamar("POST /api/items/:id/transfer-event", { sessao: sessao(papel), params: { id }, body: { eventId } });

  it("só admin transfere (e a régua declara isso)", async () => {
    for (const papel of ["solicitacao", "arte", "grafica", "atendimento"]) {
      mundo.itens.p1 = peca();
      const r = await transferir(papel, "p1", "ev-2");
      expect(r.status, papel).toBe(403);
      expect((r.body as any).error).toBe("Apenas administradores podem transferir peças de evento.");
      expect(mundo.itens.p1.eventId).toBe("ev-1");
    }
    expect(regra("POST", "/api/items/:id/transfer-event")?.papeis).toEqual(["admin"]);
    expect((await transferir("admin", "p1", "ev-2")).status).toBe(200);
  });

  it("muda só o evento — status, patrocínio e aprovações seguem como estavam", async () => {
    mundo.itens.p1 = peca({ status: "sponsor_approved", sponsorApprovedBy: "Ana", skipApproval: true });
    const r = await transferir("admin", "p1", "ev-2");
    expect(r.status).toBe(200);
    // A ÚNICA escrita na peça: o evento (e a remessa do Kit, que era da origem).
    expect(H.storage.updateItem).toHaveBeenCalledTimes(1);
    expect(Object.keys(H.storage.updateItem.mock.calls[0][1]).sort()).toEqual(["eventId", "kitRemessaId"]);
    expect(mundo.itens.p1).toMatchObject({ eventId: "ev-2", status: "sponsor_approved", sponsorApprovedBy: "Ana", skipApproval: true });
    expect(H.trilha[0]).toContain('do evento "COPA NORTE" para "COPA SUL" — status mantido');
  });

  it("barra transferir DE e PARA evento finalizado", async () => {
    mundo.itens.p1 = peca({ eventId: "ev-fim" });
    const daOrigem = await transferir("admin", "p1", "ev-2");
    expect(daOrigem.status).toBe(409);
    expect(daOrigem.body).toMatchObject({ error: EVENTO_REALIZADO_ERRO, code: "EVENT_FINALIZED", reason: "realizado" });

    mundo.itens.p2 = peca({ id: "p2" });
    const paraDestino = await transferir("admin", "p2", "ev-fim");
    expect(paraDestino.status).toBe(409);
    expect(paraDestino.body).toMatchObject({ code: "EVENT_FINALIZED", reason: "realizado" });
    expect(H.storage.updateItem).not.toHaveBeenCalled();
  });

  it("recusa transferir para o evento em que a peça já está", async () => {
    mundo.itens.p1 = peca();
    const r = await transferir("admin", "p1", "ev-1");
    expect(r.status).toBe(409);
    expect((r.body as any).error).toBe("A peça já está neste evento.");
  });

  it("recalcula o status dos DOIS eventos e derruba o cache de Versões", async () => {
    mundo.itens.p1 = peca();
    await transferir("admin", "p1", "ev-2");
    expect(H.eventosRecalculados.sort()).toEqual(["ev-1", "ev-2"]);
    expect(H.cacheDeVersoes).toBe(1);
    expect(H.broadcast).toContainEqual(expect.objectContaining({ type: "item_updated" }));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("descancelar", () => {
  const descancelar = (papel: string, id = "p1") => chamar("PATCH /api/items/:id/uncancel", { sessao: sessao(papel), params: { id } });
  const cancelar = (id = "p1") => chamar("PATCH /api/items/:id/cancel", { sessao: sessao("admin"), params: { id }, body: { notes: "engano" } });

  it("só admin descancela (e a régua declara isso)", async () => {
    for (const papel of ["solicitacao", "arte", "grafica", "atendimento"]) {
      mundo.itens.p1 = peca({ status: "canceled", statusBeforeCancel: "approved" });
      const r = await descancelar(papel);
      expect(r.status, papel).toBe(403);
      expect((r.body as any).error).toBe("Apenas administradores podem descancelar itens");
    }
    expect(regra("PATCH", "/api/items/:id/uncancel")?.papeis).toEqual(["admin"]);
  });

  it("o cancelamento grava DE ONDE a peça saiu — individual e lote — e cancelar de novo não sobrescreve", async () => {
    expect(getTableConfig(items).columns.some((c) => c.name === "status_before_cancel")).toBe(true);

    mundo.itens.p1 = peca({ status: "approved" });
    await cancelar();
    expect(mundo.itens.p1).toMatchObject({ status: "canceled", statusBeforeCancel: "approved" });
    // Re-cancelar a já cancelada mantém a origem de verdade (não vira "canceled").
    await cancelar();
    expect(mundo.itens.p1.statusBeforeCancel).toBe("approved");

    mundo.itens.p2 = peca({ id: "p2", status: "awaiting_final_review" });
    const lote = await chamar("PATCH /api/items/bulk-cancel", { sessao: sessao("solicitacao"), body: { itemIds: ["p2"] } });
    expect(lote.status).toBe(200);
    expect(mundo.itens.p2).toMatchObject({ status: "canceled", statusBeforeCancel: "awaiting_final_review" });
  });

  it("restaura pela COLUNA primeiro, e a trilha diz de onde veio; a coluna é limpa", async () => {
    mundo.itens.p1 = peca({ status: "canceled", statusBeforeCancel: "approved" });
    mundo.trilha.p1 = [{ details: "Status alterado: Rascunho → Aguardando Envio" }];
    const r = await descancelar("admin");
    expect(r.status).toBe(200);
    expect(mundo.itens.p1).toMatchObject({ status: "approved", statusBeforeCancel: null });
    expect(H.trilha).toContain("Item descancelado — voltou para Liberado (registrado no cancelamento)");
  });

  it("sem a coluna, infere pela TRILHA; sem pista nenhuma, volta a 'requested' e diz que foi palpite", async () => {
    mundo.itens.p1 = peca({ status: "canceled", statusBeforeCancel: null });
    mundo.trilha.p1 = [{ details: "Status alterado: Aguardando Envio → Aguardando Revisão Final" }];
    await descancelar("admin");
    expect(mundo.itens.p1.status).toBe("awaiting_final_review");
    expect(H.trilha.at(-1)).toBe("Item descancelado — voltou para Aguardando Revisão Final (inferido pela trilha de auditoria)");

    mundo.itens.p2 = peca({ id: "p2", status: "canceled", statusBeforeCancel: null });
    await descancelar("admin", "p2");
    expect(mundo.itens.p2.status).toBe("requested");
    expect(H.trilha.at(-1)).toBe("Item descancelado — voltou para Solicitado (sem registro do status anterior — voltou ao início do fluxo)");
  });

  it("só peça CANCELADA descancela, e evento finalizado barra", async () => {
    mundo.itens.p1 = peca({ status: "approved" });
    const naoCancelada = await descancelar("admin");
    expect(naoCancelada.status).toBe(409);
    expect((naoCancelada.body as any).error).toBe("A peça não está cancelada — nada a descancelar");

    mundo.itens.p2 = peca({ id: "p2", eventId: "ev-fim", status: "canceled", statusBeforeCancel: "approved" });
    const fechado = await descancelar("admin", "p2");
    expect(fechado.status).toBe(409);
    expect(fechado.body).toMatchObject({ code: "EVENT_FINALIZED" });
    expect(mundo.itens.p2.status).toBe("canceled");
  });

  it("a inferência pela trilha nunca devolve 'canceled' — pula a linha do próprio cancelamento", async () => {
    mundo.itens.p1 = peca({ status: "canceled", statusBeforeCancel: null });
    // Mais recente primeiro: a linha do cancelamento vem antes da que vale.
    mundo.trilha.p1 = [
      { details: "Status alterado: Liberado → Cancelado" },
      { details: "Status alterado: Aguardando Revisão Final → Liberado" },
    ];
    await descancelar("admin");
    expect(mundo.itens.p1.status).toBe("approved");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("clonar com seleção", () => {
  const clonar = (body: Record<string, unknown>) =>
    chamar("POST /api/events/:id/clone-items", { sessao: sessao("admin"), params: { id: "ev-1" }, body: { sourceEventId: "ev-2", ...body } });

  beforeEach(() => {
    for (const n of [1, 2, 3]) mundo.itens[`o${n}`] = peca({ id: `o${n}`, displayId: `#000${n}`, eventId: "ev-2" });
    mundo.itens.alheia = peca({ id: "alheia", eventId: "ev-1" });
  });

  it("itemIds ausente clona o evento inteiro, como sempre", async () => {
    const r = await clonar({});
    expect(r.status).toBe(201);
    expect((r.body as any).cloned).toBe(3);
    expect(H.trilha.at(-1)).toBe('3 itens clonados do evento "COPA SUL"');
  });

  it("id que não é do evento de origem é recusado, com a contagem — nada é criado", async () => {
    const r = await clonar({ itemIds: ["o1", "alheia", "fantasma"] });
    expect(r.status).toBe(400);
    expect((r.body as any).error).toBe("2 das peças selecionadas não pertencem ao evento de origem — recarregue e tente de novo");
    expect(H.storage.createBulkItems).not.toHaveBeenCalled();
  });

  it("seleção vazia e lista malformada não passam", async () => {
    const vazia = await clonar({ itemIds: [] });
    expect(vazia.status).toBe(400);
    expect((vazia.body as any).error).toBe("Nenhuma peça selecionada para clonar");
    for (const ruim of ["o1", [1, 2], { id: "o1" }]) {
      const r = await clonar({ itemIds: ruim });
      expect(r.status).toBe(400);
      expect((r.body as any).error).toBe("itemIds deve ser uma lista de ids de peças");
    }
  });

  it("seleção parcial: só as escolhidas, e a trilha diz 'N de M'", async () => {
    const r = await clonar({ itemIds: ["o1", "o3"] });
    expect(r.status).toBe(201);
    expect((r.body as any).cloned).toBe(2);
    expect(H.trilha.at(-1)).toBe('2 itens clonados do evento "COPA SUL" (seleção: 2 de 3)');
  });
});
