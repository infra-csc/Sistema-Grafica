// ─────────────────────────────────────────────────────────────────────────────
// REAPROVEITAR DEPOIS DE PRODUZIDO, E O MOLDE — as rotas reais
// (server/routes/itens/reaproveitamento.ts e server/routes/molde.ts) sobre o
// storage de mentira de regras-fluxo-apoio.ts.
//
// Vieram de casos que só liam o fonte:
//   · reaproveitar-apos-produzido.test.ts — quem ajusta depois de Produzido,
//     a tranca de conferida/entregue, o fluxo normal intacto, o ajuste
//     ABSOLUTO nas duas direções, a conta que fecha e a trilha;
//   · revisao-final-2-ajustes.test.ts — o molde travado não vira produzido, o
//     molde produzido conta como entregue e produzir/desfazer recalculam o evento.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: { insert: (() => ({ values: async () => [] })) as any } as Record<string, any>,
  broadcast: [] as any[],
  trilha: [] as string[],
  eventosRecalculados: [] as string[],
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
    updateEventStatus: async (id: string) => { H.eventosRecalculados.push(id); },
  };
});

import { podeTransicionar, origemDaAcao } from "@shared/maquina-de-estados";
import { fraseDaTrava, CODIGO_PECA_TRAVADA } from "@shared/trava-da-peca";
import { TIPO_MOLDE } from "@shared/molde";
import { calculateEventStatus } from "../routes/shared";
import { registrarReaproveitamento } from "../routes/itens/reaproveitamento";
import { registerMoldeRoutes } from "../routes/molde";
import { capturarRotas } from "./rotas-de-mentira";
import { ligarStorage, mundoNovo, peca, sessao, type Mundo } from "./regras-fluxo-apoio";

const { chamar } = capturarRotas((app) => { registrarReaproveitamento(app); registerMoldeRoutes(app); });

let mundo: Mundo;
beforeEach(() => {
  mundo = mundoNovo();
  ligarStorage(H.storage, mundo);
  H.broadcast.length = 0; H.trilha.length = 0; H.eventosRecalculados.length = 0;
});

const reaproveitar = (papel: string, corpo: Record<string, unknown>) =>
  chamar("POST /api/items/:id/mark-reuse", { sessao: sessao(papel), params: { id: "p1" }, body: corpo });
const produzida = (over: Record<string, unknown> = {}) => peca({ status: "produced", quantity: 10, quantityProduced: 10, reuseQty: 0, ...over });

// ═════════════════════════════════════════════════════════════════════════════
describe("reaproveitar depois de Produzido: quem pode, e quando", () => {
  it("só Solicitação e admin; a Gráfica ouve o porquê", async () => {
    for (const papel of ["solicitacao", "admin"]) expect(podeTransicionar("produced", "ajustar-reaproveitamento-da-produzida", papel)).toBe(true);
    expect(podeTransicionar("produced", "ajustar-reaproveitamento-da-produzida", "grafica")).toBe(false);

    mundo.itens.p1 = produzida();
    const grafica = await reaproveitar("grafica", { reuseTotal: 4 });
    expect(grafica.status).toBe(409);
    expect((grafica.body as any).error).toBe("Peça já produzida: mudar o reaproveitamento agora é da Solicitação e do admin.");
    expect(mundo.itens.p1.reuseQty).toBe(0);

    for (const papel of ["solicitacao", "admin"]) {
      mundo.itens.p1 = produzida();
      expect((await reaproveitar(papel, { reuseTotal: 4 })).status, papel).toBe(200);
    }
  });

  it("conferida ou entregue, acabou — o número virou contagem física", async () => {
    mundo.itens.p1 = produzida({ conferredQty: 2 });
    const conferida = await reaproveitar("solicitacao", { reuseTotal: 4 });
    expect(conferida.status).toBe(409);
    expect((conferida.body as any).error).toBe("Não é possível reaproveitar: a peça já foi parcialmente conferida");

    mundo.itens.p1 = produzida({ deliveredQty: 3 });
    const entregue = await reaproveitar("solicitacao", { reuseTotal: 4 });
    expect(entregue.status).toBe(409);
    expect((entregue.body as any).error).toBe("Não é possível reaproveitar: 3 un. já foram entregues");
  });

  it("fora de Produzido a régua é a de antes: só soma, sem invadir o produzido", async () => {
    expect(origemDaAcao("reaproveitar-parte")).toEqual(["ready_for_production", "pronto_para_producao", "approved", "inProduction", "em_producao"]);
    expect(origemDaAcao("ajustar-reaproveitamento-da-produzida")).toEqual(["produced", "produzido"]);

    // 10 un., 4 já impressas: cabem 6 no reaproveitamento — nunca as impressas.
    mundo.itens.p1 = peca({ status: "inProduction", quantity: 10, quantityProduced: 4, reuseQty: 0 });
    const r = await reaproveitar("grafica", { qty: 99 });
    expect(r.status).toBe(200);
    expect(mundo.itens.p1).toMatchObject({ reuseQty: 6, quantityProduced: 4, status: "produced" });
    expect(H.trilha[0]).toBe("Reaproveitamento parcial pela Gráfica: 6 un. (6/10 reaproveitadas, 4 a produzir)");

    // Fora das duas listas: o erro de status de sempre.
    mundo.itens.p1 = peca({ status: "awaiting_submission" });
    const cedo = await reaproveitar("grafica", { qty: 1 });
    expect(cedo.status).toBe(409);
    expect((cedo.body as any).error).toBe("Status atual não permite reaproveitamento: Aguardando Envio");
  });
});

describe("a conversão fecha a conta — nas DUAS direções", () => {
  it("o controle manda o TOTAL: aumenta, diminui, volta a zero — e o mesmo valor é recusado", async () => {
    mundo.itens.p1 = produzida();
    await reaproveitar("solicitacao", { reuseTotal: 7 });
    expect(mundo.itens.p1).toMatchObject({ reuseQty: 7, quantityProduced: 3 });
    await reaproveitar("solicitacao", { reuseTotal: 2 });
    expect(mundo.itens.p1).toMatchObject({ reuseQty: 2, quantityProduced: 8 });
    await reaproveitar("solicitacao", { reuseTotal: 0 });
    expect(mundo.itens.p1).toMatchObject({ reuseQty: 0, quantityProduced: 10, isReuse: false });
    // Acima da quantidade é grampeado nela.
    await reaproveitar("solicitacao", { reuseTotal: 50 });
    expect(mundo.itens.p1).toMatchObject({ reuseQty: 10, quantityProduced: 0, isReuse: true });

    const igual = await reaproveitar("solicitacao", { reuseTotal: 10 });
    expect(igual.status).toBe(409);
    expect((igual.body as any).error).toBe("A peça já tem 10 un. reaproveitada(s).");
  });

  it("o que vira reuso SAI do produzido e o status segue Produzido — nada volta à fila", async () => {
    mundo.itens.p1 = produzida({ printMachine: "1", reservaPorMaquina: { "2": 3 }, maquinaPrevista: "2" });
    await reaproveitar("admin", { reuseTotal: 4 });
    expect(mundo.itens.p1).toMatchObject({ status: "produced", reuseQty: 4, quantityProduced: 6, reservaPorMaquina: null, maquinaPrevista: null, impressaoPorMaquina: null });
    expect(mundo.itens.p1.reuseQty + mundo.itens.p1.quantityProduced).toBe(mundo.itens.p1.quantity);
  });

  it("a trilha explica o ajuste, com os dois lados da conta", async () => {
    mundo.itens.p1 = produzida({ reuseQty: 2, quantityProduced: 8 });
    await reaproveitar("solicitacao", { reuseTotal: 5 });
    expect(H.trilha).toEqual(["Reaproveitamento ajustado após Produzido: 2 → 5 un. reaproveitada(s) (5 produzida(s) de 10)"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("o molde", () => {
  const molde = (over: Record<string, unknown> = {}) => peca({ type: TIPO_MOLDE, quantity: 2, ...over });

  it("molde travado pela Solicitação não vira produzido (nem desfaz)", async () => {
    const trava = { travadaEm: new Date("2026-09-22T12:00:00Z"), travadaPor: "Bia", travadaMotivo: "patrocinador trocou o logo" };
    mundo.itens.p1 = molde({ status: "ready_for_production", ...trava });
    const produzir = await chamar("PATCH /api/items/:id/molde-produzido", { sessao: sessao("grafica"), params: { id: "p1" } });
    expect(produzir.status).toBe(409);
    expect(produzir.body).toEqual({ error: fraseDaTrava(mundo.itens.p1), code: CODIGO_PECA_TRAVADA });
    expect(mundo.itens.p1.status).toBe("ready_for_production");

    mundo.itens.p1 = molde({ status: "produced", quantityProduced: 2, ...trava });
    const desfazer = await chamar("PATCH /api/items/:id/molde-voltar-liberado", { sessao: sessao("grafica"), params: { id: "p1" } });
    expect(desfazer.status).toBe(409);
    expect((desfazer.body as any).code).toBe(CODIGO_PECA_TRAVADA);
    expect(mundo.itens.p1.status).toBe("produced");
  });

  it("molde produzido conta como entregue: evento só com ele conclui", async () => {
    mundo.itens.m1 = molde({ id: "m1", status: "produced", quantityProduced: 2 });
    mundo.itens.c1 = peca({ id: "c1", status: "canceled" });
    expect(await calculateEventStatus("ev-1")).toBe("completed");
    // Uma peça comum produzida (não entregue) ainda segura o evento.
    mundo.itens.p2 = peca({ id: "p2", status: "produced" });
    expect(await calculateEventStatus("ev-1")).toBe("created");
  });

  it("produzir e desfazer recalculam o status do evento", async () => {
    mundo.itens.p1 = molde({ status: "ready_for_production" });
    const produzir = await chamar("PATCH /api/items/:id/molde-produzido", { sessao: sessao("grafica"), params: { id: "p1" } });
    expect(produzir.status).toBe(200);
    expect(mundo.itens.p1).toMatchObject({ status: "produced", quantityProduced: 2 });
    expect(H.eventosRecalculados).toEqual(["ev-1"]);

    const desfazer = await chamar("PATCH /api/items/:id/molde-voltar-liberado", { sessao: sessao("admin"), params: { id: "p1" } });
    expect(desfazer.status).toBe(200);
    expect(mundo.itens.p1).toMatchObject({ status: "ready_for_production", quantityProduced: 0, producedAt: null });
    expect(H.eventosRecalculados).toEqual(["ev-1", "ev-1"]);
  });
});
