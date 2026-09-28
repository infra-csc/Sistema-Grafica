// DEVOLVER AS PEÇAS DO EVENTO PARA A ARTE (dono, 28/09): "Night Run CWB mudou
// de data e com isso mudam todos os logos de Ministério e Lei… como fazemos
// pra retornar tudo pra Arte?" → botão de admin, com motivo.
import { describe, it, expect } from "vitest";
import { situacaoParaVoltarAArte, VOLTA_PARA_A_ARTE_DE } from "@shared/devolver-evento-para-arte";
import { TRANSICOES } from "@shared/maquina-de-estados";

const p = (over: Record<string, unknown> = {}) => ({ status: "awaiting_final_review", quantityProduced: 0, conferredQty: 0, deliveredQty: 0, embaladaQty: 0, travadaEm: null, ...over });

describe("quem volta para a Arte", () => {
  it.each([
    "awaiting_sponsor_approval", "sponsor_approved", "awaiting_creator_review", "awaiting_final_review",
    "ready_for_production", "approved", "inProduction",
  ])("%s, sem material impresso, volta", (status) => {
    expect(situacaoParaVoltarAArte(p({ status }))).toEqual({ volta: true });
  });

  it("na impressora COM unidade impressa não volta — há material (complemento/reimpressão)", () => {
    const s = situacaoParaVoltarAArte(p({ status: "inProduction", quantityProduced: 3 }));
    expect(s).toMatchObject({ volta: false, grupo: "com-material" });
  });

  it.each(["produced", "conferred", "packed", "delivered"])("%s não volta (material físico)", (status) => {
    expect(situacaoParaVoltarAArte(p({ status }))).toMatchObject({ volta: false, grupo: "com-material" });
  });

  // Dono, 28/09: "todos que têm Ministério, independente de status, pois ele
  // está travando alguns".
  it("travada pela Solicitação VOLTA, destravada", () => {
    expect(situacaoParaVoltarAArte(p({ travadaEm: new Date(), travadaPor: "Ana", travadaMotivo: "x" }))).toEqual({ volta: true, destrava: true });
  });

  it("já com a Arte também volta — recebe o motivo e a nova aprovação", () => {
    expect(situacaoParaVoltarAArte(p({ status: "awaiting_submission" }))).toEqual({ volta: true, jaNaArte: true });
  });

  it("antes da Arte e cancelada ficam de fora com o porquê", () => {
    expect(situacaoParaVoltarAArte(p({ status: "awaiting_linking" }))).toMatchObject({ volta: false, grupo: "antes-da-arte" });
    expect(situacaoParaVoltarAArte(p({ status: "canceled" }))).toMatchObject({ volta: false, grupo: "cancelada" });
  });

  it("a máquina de estados registra a ação, só para o admin, com a mesma origem", () => {
    const t = TRANSICOES.find((x) => x.acao === "devolver-evento-para-a-arte")!;
    expect(t).toBeTruthy();
    expect(t.papeis).toEqual(["admin"]);
    expect(t.para).toBe("awaiting_submission");
    expect(t.de).toEqual(VOLTA_PARA_A_ARTE_DE);
    expect(t.rotas).toEqual(["POST /api/events/:id/devolver-para-a-arte"]);
  });
});
