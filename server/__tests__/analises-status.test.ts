// Entregue e fora do funil na tela de Análises. O teste de PARIDADE com
// STAGE_DEFS morreu junto com o espelho: as duas listas agora saem do mesmo
// FUNIL_DE_PRAZOS (shared/fluxo-peca), e a prova de que as telas classificam
// igual mora em etapa-canonica.test.ts.
import { describe, expect, it } from "vitest";
import { ANALISE_STAGES, OUT_OF_FUNNEL_STATUSES, isDelivered, isOutOfFunnel } from "@/lib/analises-status";

describe("analises-status: entregue e fora do funil", () => {
  it("as grafias legadas em português contam", () => {
    // As que motivaram o comentário de events.ts: sem elas a peça sumia do
    // funil e a etapa virava verde falso.
    expect(isDelivered("entregue")).toBe(true);
    expect(isDelivered("delivered")).toBe(true);
    for (const legado of ["pronto_para_producao", "liberado", "em_producao", "produzido"]) {
      const naProducao = ANALISE_STAGES.find((s) => s.key === "producao")!.statuses;
      expect(naProducao, legado).toContain(legado);
    }
  });

  it("cancelada/excluída/arquivada não é entrega e não conta no total", () => {
    for (const s of OUT_OF_FUNNEL_STATUSES) {
      expect(isOutOfFunnel(s)).toBe(true);
      expect(isDelivered(s)).toBe(false);
    }
  });

  it("status desconhecido ou nulo não explode", () => {
    expect(isDelivered("status_que_nao_existe")).toBe(false);
    expect(isDelivered(null)).toBe(false);
    expect(isOutOfFunnel(undefined)).toBe(false);
  });
});
