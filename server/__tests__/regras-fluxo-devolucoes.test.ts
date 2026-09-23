// ─────────────────────────────────────────────────────────────────────────────
// AS DEVOLUÇÕES DA GRÁFICA E DA ARTE — as rotas reais (server/routes/itens/
// revisao.ts) sobre o storage de mentira de regras-fluxo-apoio.ts.
//
// Vieram de casos que só liam o fonte:
//   · devolver-para-a-revisao.test.ts — a janela vem da tabela (só liberada),
//     é da Gráfica, exige motivo, volta para a Revisão Final sem a revisão
//     anterior e avisa a fila da Gráfica;
//   · devolver-de-qualquer-estado.test.ts — a Arte devolve de qualquer estado
//     menos o rascunho, o papel e a guarda de evento não mudaram, nada de
//     produção é apagado, e a trilha marca "JÁ FORA DA ARTE".
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: {} as Record<string, any>,
  broadcast: [] as any[],
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
    broadcast: (m: any) => { H.broadcast.push(m); },
    createAuditLog: async (_r: any, _a: string, _t: string, _id: string, detalhe: string) => { H.trilha.push(detalhe); },
    createAuditLogsEmLote: async (_r: any, linhas: Array<{ details: string }>) => { for (const l of linhas) H.trilha.push(l.details); },
    updateEventStatus: async () => {},
  };
});
vi.mock("../services/consultaDeEstoqueNaLiberacao", () => ({
  respostaDoEstoqueParaLiberar: async () => null,
  marcarRespostaAplicada: async () => {},
}));

import { vemDeOrigemValida, origemDaAcao } from "@shared/maquina-de-estados";
import { MOTIVO_MIN } from "../routes/itens/comum";
import { registrarRevisao } from "../routes/itens/revisao";
import { capturarRotas } from "./rotas-de-mentira";
import { ligarStorage, mundoNovo, peca, sessao, type Mundo } from "./regras-fluxo-apoio";

const { chamar } = capturarRotas(registrarRevisao);
const MOTIVO = "A arte veio com o logo do patrocinador errado";
const RECADO_DO_MOTIVO = `Explique o motivo da devolução em pelo menos ${MOTIVO_MIN} caracteres — quem recebe a peça de volta precisa saber o que refazer.`;

let mundo: Mundo;
beforeEach(() => {
  mundo = mundoNovo();
  ligarStorage(H.storage, mundo);
  H.broadcast.length = 0; H.trilha.length = 0;
});

// ═════════════════════════════════════════════════════════════════════════════
describe("a Gráfica devolve para a Revisão (return-to-review)", () => {
  const devolver = (papel: string, corpo: Record<string, unknown> = { rejectionReason: MOTIVO }, id = "p1") =>
    chamar("PATCH /api/items/:id/return-to-review", { sessao: sessao(papel), params: { id }, body: corpo });

  it("a janela é a da tabela: aceita de cada status de origem, recusa o resto com 409", async () => {
    for (const status of origemDaAcao("devolver-para-a-revisao") ?? []) {
      mundo.itens.p1 = peca({ status });
      expect((await devolver("grafica")).status, status).toBe(200);
    }
    for (const status of ["inProduction", "produced", "conferred", "delivered", "awaiting_final_review"]) {
      mundo.itens.p1 = peca({ status });
      const r = await devolver("grafica");
      expect(r.status, status).toBe(409);
      expect((r.body as any).error).toContain("não pode voltar para a Revisão — há material produzido para desfazer.");
    }
  });

  it("é da Gráfica (e do admin) — quem recebe a peça de volta não a devolve", async () => {
    for (const papel of ["solicitacao", "arte", "atendimento"]) {
      mundo.itens.p1 = peca({ status: "ready_for_production" });
      const r = await devolver(papel);
      expect(r.status, papel).toBe(403);
      expect((r.body as any).error).toBe("Apenas a Gráfica pode devolver para a Revisão");
    }
    mundo.itens.p1 = peca({ status: "ready_for_production" });
    expect((await devolver("admin")).status).toBe(200);
  });

  it("o motivo passa pelo mesmo leitor das outras devoluções: curto demais é 400", async () => {
    mundo.itens.p1 = peca({ status: "ready_for_production" });
    for (const corpo of [{}, { rejectionReason: "   curto  " }]) {
      const r = await devolver("grafica", corpo);
      expect(r.status).toBe(400);
      expect((r.body as any).error).toBe(RECADO_DO_MOTIVO);
    }
    expect(H.storage.updateItem).not.toHaveBeenCalled();
  });

  it("volta para Aguardando Revisão Final, sem a revisão anterior, com o motivo — e avisa a fila da Gráfica", async () => {
    mundo.itens.p1 = peca({ status: "ready_for_production", creatorReviewedAt: new Date("2026-09-01T00:00:00Z") });
    const r = await devolver("grafica");
    expect(r.status).toBe(200);
    expect(mundo.itens.p1).toMatchObject({ status: "awaiting_final_review", creatorReviewedAt: null, rejectionReason: MOTIVO, observations: MOTIVO });
    // `item_updated` é o que invalida /api/items/approved (a fila da Gráfica).
    expect(H.broadcast).toContainEqual(expect.objectContaining({ type: "item_updated" }));
    expect(mundo.notificacoes[0]).toMatchObject({ type: "itemRejected", targetRoles: ["solicitacao"] });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("a Arte devolve ao solicitante de qualquer estado (arte-reject)", () => {
  const devolver = (papel: string, id = "p1") =>
    chamar("PATCH /api/items/:id/arte-reject", { sessao: sessao(papel), params: { id }, body: { rejectionReason: MOTIVO } });

  it("aceita de qualquer estado, inclusive depois da produção", async () => {
    for (const status of ["requested", "awaiting_submission", "ready_for_production", "inProduction", "produced", "delivered", "canceled"]) {
      mundo.itens.p1 = peca({ status });
      const r = await devolver("arte");
      expect(r.status, status).toBe(200);
      expect(mundo.itens.p1.status).toBe("draft");
    }
  });

  it("o rascunho continua recusado — não há para onde devolver", async () => {
    expect(vemDeOrigemValida("draft", "devolver-ao-solicitante")).toBe(false);
    expect(vemDeOrigemValida("status_que_nao_existe", "devolver-ao-solicitante")).toBe(true);
    mundo.itens.p1 = peca({ status: "draft" });
    const r = await devolver("arte");
    expect(r.status).toBe(409);
    expect((r.body as any).error).toBe("Esta peça já está na criação (Rascunho) — não há para onde devolver.");
    expect(H.storage.updateItem).not.toHaveBeenCalled();
  });

  it("o papel não mudou: Arte e admin", async () => {
    for (const papel of ["solicitacao", "grafica", "atendimento"]) {
      mundo.itens.p1 = peca({ status: "awaiting_submission" });
      const r = await devolver(papel);
      expect(r.status, papel).toBe(403);
      expect((r.body as any).error).toBe("Apenas usuários com perfil Arte podem devolver a peça para o solicitante");
    }
    mundo.itens.p1 = peca({ status: "awaiting_submission" });
    expect((await devolver("admin")).status).toBe(200);
  });

  it("evento finalizado continua barrando", async () => {
    mundo.itens.p1 = peca({ status: "inProduction", eventId: "ev-fim" });
    const r = await devolver("arte");
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "EVENT_FINALIZED" });
    expect(mundo.itens.p1.status).toBe("inProduction");
  });

  it("nada de produção é apagado: o reset zera só aprovação e revisão", async () => {
    const producao = {
      producedAt: new Date("2026-09-10T10:00:00Z"), deliveredAt: new Date("2026-09-11T10:00:00Z"),
      productionStartedAt: new Date("2026-09-09T10:00:00Z"), conferredAt: new Date("2026-09-10T12:00:00Z"),
      quantityProduced: 10,
    };
    mundo.itens.p1 = peca({ status: "delivered", sponsorApprovedBy: "Ana", sponsorApprovedAt: new Date(), creatorReviewedAt: new Date(), rejectedBySponsor: true, rejectedByCreator: true, ...producao });
    await devolver("arte");
    const gravado = H.storage.updateItem.mock.calls[0][1];
    for (const campo of ["producedAt", "deliveredAt", "productionStartedAt", "conferredAt", "quantityProduced"]) {
      expect(gravado, campo).not.toHaveProperty(campo);
    }
    expect(mundo.itens.p1).toMatchObject({
      status: "draft", sponsorApprovedBy: null, sponsorApprovedAt: null, creatorReviewedAt: null,
      rejectedBySponsor: false, rejectedByCreator: false, ...producao,
    });
  });

  it("a trilha marca quando a peça veio de DEPOIS da Arte", async () => {
    mundo.itens.p1 = peca({ status: "inProduction" });
    await devolver("arte");
    expect(H.trilha[0]).toContain("(devolvida pela Arte ao solicitante, JÁ FORA DA ARTE)");

    mundo.itens.p2 = peca({ id: "p2", status: "awaiting_submission" });
    await devolver("arte", "p2");
    expect(H.trilha[1]).toContain("(devolvida pela Arte ao solicitante).");
    expect(H.trilha[1]).not.toContain("JÁ FORA DA ARTE");
  });
});
