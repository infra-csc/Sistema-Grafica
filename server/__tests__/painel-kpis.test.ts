// Agrupamento de status do Painel Geral. A regra vivia DUAS vezes no mesmo
// arquivo (um Record no filtro, um switch nos KPIs) sem ligação nenhuma, e o
// switch não tinha `default:` — status fora do mapa somava no Total e em card
// nenhum, quebrando a soma em silêncio. Estes testes prendem a invariante.
import { describe, expect, it } from "vitest";
import { ITEM_STATUSES } from "@shared/schema";
import {
  STATUS_GROUPS, GROUP_KEYS, computeStats, matchesStatusFilter, statusGroupOf,
  statusFlowIndex,
} from "@/lib/painel-kpis";

const itens = (...statuses: string[]) => statuses.map((status) => ({ status }));

describe("mapa de grupos", () => {
  it("nenhum status pertence a dois grupos", () => {
    const vistos = new Set<string>();
    for (const k of GROUP_KEYS) {
      for (const st of STATUS_GROUPS[k]) {
        expect(vistos.has(st), `${st} aparece em mais de um grupo`).toBe(false);
        vistos.add(st);
      }
    }
  });

  it("cobre os status que as rotas realmente gravam", () => {
    // Não exige cobrir ITEM_STATUSES inteiro de propósito: `awaiting_review`,
    // `in_review` e `archived` estão declarados no schema e NENHUMA rota os
    // grava. Se um dia gravarem, caem em `outros` e viram card visível — que é
    // exatamente o comportamento desejado, não um bug.
    for (const st of ["draft", "requested", "awaiting_linking", "awaiting_submission",
      "awaiting_approval", "awaiting_sponsor_approval", "awaiting_finalization",
      "sponsor_approved", "awaiting_creator_review", "awaiting_final_review",
      "ready_for_production", "pronto_para_producao", "approved", "inProduction",
      "produced", "conferred", "delivered", "canceled"]) {
      expect(statusGroupOf(st), st).not.toBeNull();
    }
  });

  it("vocabulário fantasma do schema não é reclassificado às escondidas", () => {
    const fantasmas = (ITEM_STATUSES as readonly string[]).filter((s) => statusGroupOf(s) === null);
    expect(fantasmas).toEqual(expect.arrayContaining(["awaiting_review", "in_review", "archived"]));
  });

  it("statusFlowIndex segue a ordem do fluxo e joga desconhecido para o fim", () => {
    expect(statusFlowIndex("requested")).toBeLessThan(statusFlowIndex("awaiting_approval"));
    expect(statusFlowIndex("awaiting_approval")).toBeLessThan(statusFlowIndex("delivered"));
    expect(statusFlowIndex("nao_existe")).toBe(GROUP_KEYS.length);
  });
});

describe("computeStats", () => {
  it("INVARIANTE: soma dos grupos + outros === total", () => {
    const stats = computeStats(itens(
      "draft", "requested", "awaiting_sponsor_approval", "pronto_para_producao",
      "delivered", "canceled", "liberado", "em_producao", "nada_disso",
    ));
    const somaGrupos = GROUP_KEYS.reduce((a, k) => a + stats.byGroup[k], 0);
    expect(somaGrupos + stats.outros).toBe(stats.total);
    expect(stats.total).toBe(9);
  });

  it("status fora do mapa vira `outros` COM o valor cru, nunca silêncio", () => {
    const stats = computeStats(itens("liberado", "entregue", "liberado", "requested"));
    expect(stats.outros).toBe(3);
    expect(stats.outrosStatus).toEqual(["entregue", "liberado"]);
    expect(stats.byGroup.requested).toBe(1);
  });

  it("aliases do mesmo grupo somam no mesmo card", () => {
    const stats = computeStats(itens("awaiting_approval", "awaiting_sponsor_approval"));
    expect(stats.byGroup.awaiting_approval).toBe(2);
  });

  it("drafts é subconjunto de requested, não card próprio", () => {
    const stats = computeStats(itens("draft", "draft", "requested"));
    expect(stats.drafts).toBe(2);
    expect(stats.byGroup.requested).toBe(3);
  });

  it("item sem status nenhum aparece em outros, não some", () => {
    const stats = computeStats([{ status: null }, { status: undefined }]);
    expect(stats.total).toBe(2);
    expect(stats.outros).toBe(2);
    expect(stats.outrosStatus).toEqual(["(sem status)"]);
  });
});

describe("matchesStatusFilter", () => {
  it("sem filtro, tudo passa", () => {
    expect(matchesStatusFilter("qualquer_coisa", [])).toBe(true);
  });

  it("chave de grupo casa com o grupo inteiro", () => {
    expect(matchesStatusFilter("awaiting_sponsor_approval", ["awaiting_approval"])).toBe(true);
    expect(matchesStatusFilter("pronto_para_producao", ["ready_for_production"])).toBe(true);
  });

  it("valor fora do mapa casa por igualdade exata — é assim que `draft` ganha opção própria", () => {
    expect(matchesStatusFilter("draft", ["draft"])).toBe(true);
    expect(matchesStatusFilter("requested", ["draft"])).toBe(false);
    // ...e continua somando no card "Solicitado", que é o grupo dele.
    expect(matchesStatusFilter("draft", ["requested"])).toBe(true);
  });

  it("filtro e KPI concordam: o que casa com a chave está no grupo dela", () => {
    // É a regressão que o arquivo tinha por construção — duas escritas da mesma
    // regra que "coincidiam" até alguém mexer numa só.
    for (const k of GROUP_KEYS) {
      for (const st of STATUS_GROUPS[k]) {
        expect(matchesStatusFilter(st, [k]), `${st} x ${k}`).toBe(true);
        expect(statusGroupOf(st)).toBe(k);
      }
    }
  });
});
