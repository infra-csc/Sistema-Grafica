// A trava do espelho.
//
// `client/src/lib/analises-status.ts` repete o funil canônico porque o cliente
// não pode importar `server/services/prazo-domain.ts`. Repetição de regra de
// negócio é exatamente o que produziu a quarta taxonomia divergente da tela de
// Análises — peça com grafia legada (`entregue`, `em_producao`) caía num grupo
// "Outros" cinza e a taxa de entrega da casa saía subnotificada.
//
// Estes testes existem para que a divergência QUEBRE O GATE em vez de virar um
// número errado na tela do diretor: acrescentar uma grafia legada em
// `STAGE_DEFS` e esquecer do espelho falha aqui.
import { describe, expect, it } from "vitest";
import {
  DELIVERED, OUT_OF_FUNNEL, STAGE_DEFS, STATUS_STAGE_RANK,
} from "../services/prazo-domain";
import {
  ANALISE_STAGES, AWAITING_DECISION_STATUSES, DELIVERED_STATUSES, FLOW_GROUPS,
  OUT_OF_FUNNEL_STATUSES, flowGroupOf, isApprovedOrBeyond, isDelivered,
  isInProduction, isOutOfFunnel,
} from "@/lib/analises-status";

describe("analises-status: espelho de STAGE_DEFS", () => {
  it("tem as mesmas etapas, na mesma ordem", () => {
    expect(ANALISE_STAGES.map((s) => s.key)).toEqual(STAGE_DEFS.map((s) => s.key));
    expect(ANALISE_STAGES.map((s) => s.label)).toEqual(STAGE_DEFS.map((s) => s.label));
  });

  it("tem exatamente os mesmos status por etapa, incluindo as grafias legadas", () => {
    for (const canon of STAGE_DEFS) {
      const espelho = ANALISE_STAGES.find((s) => s.key === canon.key);
      expect(espelho, `etapa ${canon.key} ausente no espelho`).toBeDefined();
      expect(espelho!.statuses).toEqual(canon.pendingStatuses);
    }
  });

  it("as grafias legadas em português estão cobertas", () => {
    // As que motivaram o comentário de events.ts: sem elas a peça sumia do
    // funil e a etapa virava verde falso.
    for (const legado of ["pronto_para_producao", "liberado", "em_producao", "produzido"]) {
      expect(flowGroupOf(legado)).toBe("producao");
    }
    expect(isDelivered("entregue")).toBe(true);
    expect(isDelivered("delivered")).toBe(true);
  });

  it("DELIVERED e OUT_OF_FUNNEL batem com o domínio", () => {
    expect(new Set(DELIVERED_STATUSES)).toEqual(DELIVERED);
    expect(new Set(OUT_OF_FUNNEL_STATUSES)).toEqual(OUT_OF_FUNNEL);
  });

  it("todo status conhecido pelo domínio cai num grupo do funil", () => {
    for (const status of Object.keys(STATUS_STAGE_RANK)) {
      expect(flowGroupOf(status), `status ${status} ficou sem grupo`).not.toBeNull();
    }
  });
});

describe("analises-status: grupos da rosca", () => {
  it("nenhum status pertence a dois grupos", () => {
    const vistos = new Set<string>();
    for (const g of FLOW_GROUPS) {
      for (const s of g.statuses) {
        expect(vistos.has(s), `status ${s} duplicado em ${g.key}`).toBe(false);
        vistos.add(s);
      }
    }
  });

  it("separa 'esperando o patrocinador' de 'liberado para a gráfica'", () => {
    // Era o mesmo grupo: ler "Aprovação 48%" não distinguia acervo travado de
    // acervo pronto para imprimir — decisões opostas na mesma fatia.
    expect(flowGroupOf("awaiting_approval")).toBe("aprovacao");
    expect(flowGroupOf("awaiting_sponsor_approval")).toBe("aprovacao");
    expect(flowGroupOf("ready_for_production")).toBe("producao");
    expect(flowGroupOf("approved")).toBe("producao");
  });

  it("fora do funil não pertence a grupo nenhum", () => {
    for (const s of OUT_OF_FUNNEL_STATUSES) {
      expect(isOutOfFunnel(s)).toBe(true);
      expect(flowGroupOf(s)).toBeNull();
    }
  });

  it("status desconhecido não explode e não entra em grupo", () => {
    expect(flowGroupOf("status_que_nao_existe")).toBeNull();
    expect(flowGroupOf(null)).toBeNull();
    expect(flowGroupOf(undefined)).toBeNull();
    expect(isDelivered(null)).toBe(false);
    expect(isOutOfFunnel(undefined)).toBe(false);
  });
});

describe("analises-status: as três definições de 'produção' viraram uma", () => {
  it("'conferred' e 'produced' contam como produção, como na rosca", () => {
    // O KPI usava {inProduction, produced} e a fatia usava
    // {inProduction, produced, conferred}: card e rosca davam números
    // diferentes para a mesma palavra, lado a lado.
    expect(isInProduction("inProduction")).toBe(true);
    expect(isInProduction("produced")).toBe(true);
    expect(isInProduction("conferred")).toBe(true);
    expect(isInProduction("delivered")).toBe(false);
  });

  it("'aprovadas ou além' inclui o que está comprovadamente além da aprovação", () => {
    // O KPI omitia conferred, ready_for_production e pronto_para_producao —
    // peças além da aprovação contadas como aquém dela.
    for (const s of ["approved", "ready_for_production", "pronto_para_producao", "inProduction", "produced", "conferred", "delivered", "entregue"]) {
      expect(isApprovedOrBeyond(s), s).toBe(true);
    }
    for (const s of ["awaiting_approval", "awaiting_final_review", "requested", "draft"]) {
      expect(isApprovedOrBeyond(s), s).toBe(false);
    }
  });
});

describe("analises-status: alerta de decisão pendente", () => {
  it("cobre aprovação de patrocinador E revisão interna", () => {
    // A lista anterior tinha 2 dos 8 status e o alerta subnotificava.
    for (const s of [
      "awaiting_approval", "awaiting_sponsor_approval", "awaiting_finalization",
      "sponsor_approved", "awaiting_final_review", "awaiting_review", "in_review",
      "awaiting_creator_review",
    ]) {
      expect(AWAITING_DECISION_STATUSES).toContain(s);
    }
    expect(AWAITING_DECISION_STATUSES).not.toContain("delivered");
    expect(AWAITING_DECISION_STATUSES).not.toContain("inProduction");
  });
});
