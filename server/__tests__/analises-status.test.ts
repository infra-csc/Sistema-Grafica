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
  ANALISE_STAGES, DELIVERED_STATUSES, OUT_OF_FUNNEL_STATUSES, isDelivered, isOutOfFunnel,
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

  it("DELIVERED e OUT_OF_FUNNEL batem com o domínio", () => {
    expect(new Set(DELIVERED_STATUSES)).toEqual(DELIVERED);
    expect(new Set(OUT_OF_FUNNEL_STATUSES)).toEqual(OUT_OF_FUNNEL);
  });

  it("todo status conhecido pelo domínio é etapa, entrega ou fora do funil", () => {
    // A cobertura é o que importa: um status que o espelho não conhece não
    // some da tela — ele entra no denominador de toda razão sem estar em
    // nenhum numerador, e o número fica errado para baixo, em silêncio.
    const conhecidos = new Set<string>([
      ...ANALISE_STAGES.flatMap((s) => s.statuses),
      ...DELIVERED_STATUSES,
      ...OUT_OF_FUNNEL_STATUSES,
    ]);
    for (const status of Object.keys(STATUS_STAGE_RANK)) {
      expect(conhecidos.has(status), `status ${status} ficou de fora do espelho`).toBe(true);
    }
  });

  it("nenhum status pertence a duas etapas", () => {
    const vistos = new Set<string>();
    for (const s of ANALISE_STAGES) {
      for (const st of s.statuses) {
        expect(vistos.has(st), `status ${st} duplicado em ${s.key}`).toBe(false);
        vistos.add(st);
      }
    }
  });
});

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
