// ─────────────────────────────────────────────────────────────────────────────
// PAINEL OPERACIONAL DA GRÁFICA — a regra de @shared/painel-operacional, com
// dados sintéticos e os eventos montados pela MESMA função da Gestão de Prazos
// (buildEventPrazo + computeKpis), como a rota faz.
//
// O que se prende: cada KPI, cada série (realizado, planejado, pré), os dias
// úteis seg–sáb, o vencido indo para HOJE como atrasado, o reuso fora do m², a
// projeção do dia (atrasados × programados × já produzidos), as pendências de
// pré-produção, os problemas e o status por evento.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import {
  montarPainelOperacional, unidadesAProduzir, m2PorUnidade, normalizarRotulo, diasDoIntervalo, ehDiaUtil, somarDias,
  abertasPorStatus, impressaoRealizadoXPlanejado, producaoRealizadaPorDia, producaoPlanejadaPorDia, producaoPorEvento,
  projetarDia, classeNaProjecao, preRealizadoPorDia, prePlanejadoPorDia, pendenciasPorEvento, pecasDaPendencia,
  passosPendentes, problemasPorEvento, pecasComProblema, eventoPadrao, pecasPorFase, faseDaPeca,
  type PecaDoPainel, type PainelOperacional,
} from "@shared/painel-operacional";
import { buildEventPrazo, computeKpis, type DomainEvent } from "../services/prazo-domain";
import { businessDayStrToMs } from "@shared/prazo-dates";
import type { PrazoEvent } from "@shared/prazos-contract";

const HOJE = "2026-10-16"; // sexta-feira
const HOJE_MS = businessDayStrToMs(HOJE);
/** Um instante ao meio-dia de Brasília, n dias de hoje. */
const em = (n: number) => new Date(Date.parse(`${somarDias(HOJE, n)}T15:00:00Z`));

const E1: DomainEvent = { id: "e1", name: "Copa Norte", status: "created", startDate: "2026-10-20", truckDepartureDate: "2026-10-14T00:00:00.000Z" };
const E2: DomainEvent = { id: "e2", name: "Abertura Sul", status: "created", startDate: "2026-11-01", truckDepartureDate: "2026-10-30T00:00:00.000Z" };

let seq = 0;
const peca = (eventId: string, status: string, over: Partial<PecaDoPainel> = {}): PecaDoPainel => {
  seq += 1;
  return {
    id: over.id ?? `p${seq}`, displayId: over.displayId ?? String(seq).padStart(4, "0"), eventId, status,
    type: "Banner", description: `Peça ${seq}`, measurement: "1x1", material: "lona", finish: "ilhos",
    quantity: 1, reuseQty: 0, fileWidth: null, fileHeight: null, visualWidth: null, visualHeight: null,
    skipApproval: false, isPriority: false, parentItemId: null, complementReason: null,
    rejectedBySponsor: false, rejectedByCreator: false, createdAt: em(-40), ...over,
  };
};

const PECAS: PecaDoPainel[] = [
  // ── E1: produção vencida (prazo de produção 13/10) ──
  peca("e1", "ready_for_production", { id: "a1", quantity: 10, reuseQty: 2, fileWidth: "1.00", fileHeight: "2.00" }), // 8 un · 16 m²
  peca("e1", "inProduction", { id: "a2", quantity: 5, quantityProduced: 3, visualWidth: "1", visualHeight: "1" }), // resta imprimir 2
  peca("e1", "produced", { id: "a3", quantity: 4, fileWidth: "0.5", fileHeight: "2", producedAt: em(-2) }), // 4 m² impressos há 2 dias
  peca("e1", "delivered", { id: "a4", quantity: 3, fileWidth: "1", fileHeight: "1", producedAt: em(-10), conferredAt: em(-9) }),
  peca("e1", "awaiting_submission", { id: "a5", isPriority: true, material: "  Lona  ", finish: "ILHÓS" }), // fura-fila, layout vencido
  peca("e1", "ready_for_production", { id: "a6", parentItemId: "a1", complementReason: "Avaria no transporte", fileWidth: "1", fileHeight: "1" }),
  peca("e1", "ready_for_production", { id: "a7", type: "BOOK COMPLETO", quantity: 50, fileWidth: "10", fileHeight: "10" }),
  peca("e1", "canceled", { id: "a8", quantity: 50, fileWidth: "10", fileHeight: "10", producedAt: em(-1) }),
  // ── E2: saída 30/10 ──
  peca("e2", "awaiting_submission", { id: "b1", quantity: 2, skipApproval: true, rejectedBySponsor: true, fileWidth: "1", fileHeight: "1" }),
  peca("e2", "draft", { id: "b2", fileWidth: "2", fileHeight: "1" }), // Lista de imagens (vencida 05/10)
  peca("e2", "conferred", { id: "b3", quantity: 6, fileWidth: "1", fileHeight: "1", producedAt: em(-1), conferredAt: em(0) }),
  peca("e2", "awaiting_final_review", { id: "b4", quantity: 4, reuseQty: 4, fileWidth: "1", fileHeight: "1", creatorReviewedAt: em(-1) }),
  peca("e2", "ready_for_production", { id: "b5", quantity: 2, fileWidth: "3", fileHeight: "1" }), // 6 m², liberada
  peca("e2", "awaiting_sponsor_approval", { id: "b6", fileWidth: "1", fileHeight: "1", approvalThumbUpdatedAt: em(-3), statusChangedAt: em(-3) }),
  // ── evento que já saiu dos prazos: só o realizado conta ──
  peca("e3", "delivered", { id: "c1", quantity: 2, fileWidth: "1", fileHeight: "1", producedAt: em(-2), conferredAt: em(-1) }),
];

function montar(pecas = PECAS): PainelOperacional {
  const prazos = [E1, E2]
    .map((ev) => buildEventPrazo(ev, pecas.filter((p) => p.eventId === ev.id && !/book/i.test(p.type ?? "")).map((p) => ({ ...p, quantity: p.quantity ?? 1, type: p.type ?? "" })) as never, { today: HOJE_MS }))
    .filter((e): e is PrazoEvent => !!e)
    .map((e) => ({ ...e, eventId: e.id, kit: null }));
  return montarPainelOperacional({
    pecas, prazos, kpis: computeKpis(prazos), hoje: HOJE, geradoEm: em(0).toISOString(),
    nomeDoEvento: new Map([["e1", "Copa Norte"], ["e2", "Abertura Sul"], ["e3", "Maratona Antiga"]]),
  });
}
const P = montar();
const peca$ = (id: string) => P.pecas.find((p) => p.id === id)!;

describe("unidades, m² e datas", () => {
  it("unidades = quantidade − reuso; m² por unidade = arquivo, senão visual, senão 0", () => {
    expect(unidadesAProduzir({ quantity: 10, reuseQty: 2 })).toBe(8);
    expect(unidadesAProduzir({ quantity: 2, reuseQty: 5 })).toBe(0);
    expect(m2PorUnidade({ fileWidth: "1.5", fileHeight: "2", visualWidth: "9", visualHeight: "9" })).toBe(3);
    expect(m2PorUnidade({ fileWidth: null, fileHeight: "2", visualWidth: "1", visualHeight: "1.5" })).toBe(1.5);
    expect(m2PorUnidade({})).toBe(0);
    expect(peca$("a1").m2).toBe(16); // 8 un × 2 m² — o reuso não entra
    expect(peca$("b4").m2).toBe(0);
  });

  it("dia útil é segunda a sábado", () => {
    expect(ehDiaUtil("2026-10-17")).toBe(true); // sábado
    expect(ehDiaUtil("2026-10-18")).toBe(false); // domingo
    expect(diasDoIntervalo("2026-10-16", "2026-10-29")).toHaveLength(12);
    expect(diasDoIntervalo("2026-10-16", "2026-10-29", false)).toHaveLength(14);
  });

  it("material e acabamento: caixa alta, espaços únicos e grafias juntadas", () => {
    expect(normalizarRotulo("  lona   fosca ")).toBe("LONA FOSCA");
    expect(normalizarRotulo("ilhos")).toBe("ILHÓS");
    expect(peca$("a5").material).toBe("LONA");
    expect(peca$("a5").acabamento).toBe("ILHÓS");
  });

  it("fase: a regra do app (legados, molde, Lista de imagens)", () => {
    expect(faseDaPeca({ status: "draft" }).fase).toBe(0);
    expect(faseDaPeca({ status: "awaiting_sponsor_approval" }).fase).toBe(2);
    expect(faseDaPeca({ status: "packed" }).fase).toBe(5);
    expect(faseDaPeca({ status: "entregue" }).fase).toBe(6);
    expect(faseDaPeca({ status: "produced", type: "Molde" }).fase).toBe(6);
    expect(faseDaPeca({ status: "cancelled" }).etapa).toBe("canceled");
  });
});

describe("o que entra e o que fica de fora", () => {
  it("BOOK COMPLETO e canceladas somem de tudo; evento fora dos prazos só no realizado", () => {
    expect(P.pecas.map((p) => p.id)).not.toContain("a7");
    expect(P.pecas.map((p) => p.id)).not.toContain("a8");
    expect(P.pecas.map((p) => p.id)).not.toContain("c1");
    expect(P.prodRealizado.some((r) => r.evento === "e3")).toBe(true);
    expect(P.nomes.e3).toBe("Maratona Antiga");
  });
});

describe("Painel geral", () => {
  it("os KPIs de evento são os da Gestão de Prazos", () => {
    expect(P.kpis.atrasados).toBe(2);
    expect(P.eventos.map((e) => e.situacao)).toEqual(["Atrasado", "Atrasado"]);
    expect(P.kpis.pecasAtrasadas).toBe(P.eventos.reduce((s, e) => s + e.pecasEmAtraso, 0));
  });

  it("peças em aberto = não entregues dos eventos ativos, Lista de imagens inclusa", () => {
    // a1 a2 a3 a5 a6 · b1 b2 b3 b4 b5 b6
    expect(P.resumo.pecasAbertas).toBe(11);
    const s = abertasPorStatus(P.pecas);
    expect(s.find((r) => r.etapa === "requested")).toMatchObject({ pecas: 1, atrasadas: 1 });
    expect(s.find((r) => r.etapa === "ready_for_production")).toMatchObject({ pecas: 3, atrasadas: 2 });
    expect(s.find((r) => r.etapa === "delivered")).toBeUndefined();
  });

  it("m² impressos em 7 dias (pelo fim da impressão, sem reuso) e m² a imprimir", () => {
    // a3 4 m² (−2) + b3 6 m² (−1) + c1 2 m² (−2); a4 (−10) fica fora
    expect(P.resumo.m2Impresso7d).toBe(12);
    // a1 16 + a2 2 + a6 1 + b1 2 + b2 2 + b5 6 + b6 1 (a5 sem medida = 0; b4 todo reuso)
    expect(P.resumo.m2AImprimir).toBe(30);
  });

  it("realizado × planejado: 3 semanas para trás e 3 para frente, só dias úteis; o vencido cai em hoje", () => {
    const serie = impressaoRealizadoXPlanejado(P);
    expect(serie[0].dia).toBe(somarDias(HOJE, -20));
    expect(serie.some((d) => !ehDiaUtil(d.dia))).toBe(false);
    const hoje = serie.find((d) => d.dia === HOJE)!;
    expect(hoje.atrasado).toBe(19); // a1 16 + a2 2 + a6 1
    expect(serie.filter((d) => d.dia !== HOJE).every((d) => d.atrasado === 0)).toBe(true);
    expect(serie.find((d) => d.dia === somarDias(HOJE, -2))!.realizado).toBe(6); // a3 + c1
  });
});

describe("Produção — planejado", () => {
  it("liberada: saldo dividido pelos dias úteis de hoje até o prazo de produção", () => {
    const b5 = P.prodPlanejado.filter((r) => r.evento === "e2" && r.processo === "impressao" && r.situacao === "liberado");
    expect(b5).toHaveLength(12);
    expect(b5.every((r) => r.m2 === 0.5)).toBe(true);
    expect(b5.some((r) => r.dia === "2026-10-18")).toBe(false); // domingo
  });

  it("em pré-produção: começa no dia seguinte ao prazo da revisão final", () => {
    const pre = P.prodPlanejado.filter((r) => r.evento === "e2" && r.processo === "impressao" && r.situacao === "preProducao");
    expect(pre[0].dia).toBe("2026-10-23");
    expect(pre.map((r) => r.dia)).toEqual(["2026-10-23", "2026-10-24", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"]);
    // b1 2 + b2 2 + b6 1 = 5 m² em 6 dias
    // (cada linha diária é arredondada a 2 casas, como no painel de referência)
    expect(pre.reduce((s, r) => s + r.m2, 0)).toBeCloseTo(5, 1);
  });

  it("prazo vencido: TODO o saldo vai para hoje como atrasado; em impressão desconta o já impresso", () => {
    const atr = P.prodPlanejado.filter((r) => r.situacao === "atrasado");
    expect(atr.every((r) => r.dia === HOJE)).toBe(true);
    const imp = atr.find((r) => r.processo === "impressao")!;
    expect(imp.unidades).toBe(8 + 2 + 1 + 1); // a1 8 · a2 5−3 · a5 1 (ainda em layout, mas o prazo venceu) · a6 1
    const acab = atr.find((r) => r.processo === "acabamento")!;
    expect(acab.unidades).toBe(8 + 5 + 4 + 1 + 1); // a1 · a2 · a3 (impressa, não acabada) · a5 · a6
  });

  it("séries por dia com filtro de evento e medida", () => {
    const real = producaoRealizadaPorDia(P, "e2", "m2");
    expect(real.find((d) => d.dia === HOJE)!.acabamento).toBe(6);
    expect(real.find((d) => d.dia === somarDias(HOJE, -1))!.impressao).toBe(6);
    expect(producaoRealizadaPorDia(P, "e2", "itens").find((d) => d.dia === HOJE)!.acabamento).toBe(1);
    const plan = producaoPlanejadaPorDia(P, "impressao", "e1", "unidades");
    expect(plan[0]).toMatchObject({ dia: HOJE, atrasado: 12, liberado: 0 });
    expect(producaoPlanejadaPorDia(P, "impressao", "nenhum", "m2")).toEqual([]);
  });

  it("produção por evento: realizado 30 dias e saldo", () => {
    const e1 = producaoPorEvento(P).find((r) => r.evento === "e1")!;
    expect(e1).toMatchObject({ impressoM2_30d: 7, acabadoM2_30d: 3, aImprimirM2: 19, aImprimirUn: 12, prazoProducao: "2026-10-13" });
  });
});

describe("Projeção de produção do dia", () => {
  it("atrasado só com prazo ANTES de hoje; programado no dia; já produzido sai da carga", () => {
    const a1 = peca$("a1");
    expect(classeNaProjecao(a1, "impressao", HOJE, HOJE)).toBe("atrasado");
    expect(classeNaProjecao(peca$("a3"), "impressao", HOJE, HOJE)).toBeNull(); // vencida, mas já impressa
    expect(classeNaProjecao(peca$("a3"), "acabamento", HOJE, HOJE)).toBe("atrasado");
    expect(classeNaProjecao(peca$("b5"), "impressao", HOJE, HOJE)).toBeNull(); // futura nunca é atrasada
    expect(classeNaProjecao(peca$("b5"), "impressao", "2026-10-29", HOJE)).toBe("pendente");
    expect(classeNaProjecao(peca$("b3"), "impressao", "2026-10-29", HOJE)).toBe("produzido");
  });

  it("carga = atrasados + programados − já produzidos; sem atrasados, eles saem da conta", () => {
    const p = projetarDia(P, { dia: "2026-10-29", processo: "impressao", medida: "m2", incluirAtrasados: true });
    const imp = p.cartoes.find((c) => c.processo === "impressao")!;
    // A projeção conta a peça INTEIRA (m² × unidades a produzir), como o painel de
    // referência: a2, em impressão, entra com as 5 unidades.
    expect(imp.atrasados.m2).toBe(16 + 5 + 1);
    expect(imp.programados.m2).toBe(6 + 6 + 2 + 2 + 1); // b5 b3 b1 b2 b6 (b4 sem unidade)
    expect(imp.produzidos.m2).toBe(6); // b3
    expect(imp.carga.m2).toBe(22 + 17 - 6);
    const sem = projetarDia(P, { dia: "2026-10-29", processo: "impressao", medida: "m2", incluirAtrasados: false });
    expect(sem.cartoes[0].carga.m2).toBe(11);
    expect(sem.pecas.some((x) => x.classe === "atrasado")).toBe(false);
  });

  it("dia no passado vira hoje; a fila põe os atrasados só em hoje", () => {
    const p = projetarDia(P, { dia: "2026-10-01", processo: "impressao", medida: "unidades", incluirAtrasados: true });
    expect(p.dia).toBe(HOJE);
    expect(p.fila[0]).toMatchObject({ dia: HOJE, atrasados: 8 + 5 + 1 + 1 });
    expect(p.fila.slice(1).every((d) => d.atrasados === 0)).toBe(true);
    expect(p.fila.at(-1)!.dia).toBe("2026-10-29");
    expect(p.fila).toHaveLength(14); // todos os dias, domingos inclusos
  });

  it("quebras por material, acabamento e evento somam a carga", () => {
    const p = projetarDia(P, { dia: HOJE, processo: "impressao", medida: "m2", incluirAtrasados: true });
    expect(p.porEvento).toEqual([{ rotulo: "Copa Norte", atrasado: 22, pendente: 0, produzido: 0, carga: 22 }]);
    expect(p.porMaterial[0]).toMatchObject({ rotulo: "LONA", carga: 22 });
  });
});

describe("Pré-produção", () => {
  it("processos pendentes por fase; a isenta pula a aprovação; Lista de imagens passa por todos", () => {
    expect(passosPendentes(0, false)).toEqual([1, 2, 3, 4]);
    expect(passosPendentes(1, true)).toEqual([1, 3, 4]);
    expect(passosPendentes(3, false)).toEqual([3, 4]);
    expect(passosPendentes(5, false)).toEqual([]);
  });

  it("realizado: cada processo no dia em que a peça passou por ele (layout pelo thumb)", () => {
    const r = preRealizadoPorDia(P, null, null);
    expect(r.find((d) => d.dia === somarDias(HOJE, -3))!.layout).toBe(1); // b6
    expect(r.find((d) => d.dia === somarDias(HOJE, -1))!.revisao).toBe(1); // b4
    expect(preRealizadoPorDia(P, null, ["aprovacao"]).every((d) => d.layout === 0)).toBe(true);
  });

  it("planejado: no prazo da fase; o vencido vai para hoje em 'atrasado'", () => {
    const r = prePlanejadoPorDia(P, "e2", null);
    // vencido hoje: b2 layout (09/10) — a aprovação de b2 vence 19/10.
    // b1 é "Sem patrocínio": o Layout dela é o AJUSTADO, 09/10 + 7 dias corridos
    // = 16/10 (hoje) — vence hoje, não está vencida (Pedro/dono 26/10; antes as
    // Análises a cobravam pelo Layout normal e ela aparecia atrasada).
    expect(r[0]).toMatchObject({ dia: HOJE, atrasado: 1, layout: 1 });
    expect(r.find((d) => d.dia === "2026-10-19")!.aprovacao).toBe(2); // b2 e b6
    expect(r.find((d) => d.dia === "2026-10-20")!.finalizacao).toBe(3); // b1 b2 b6
  });

  it("pendências por evento: cada peça conta uma vez, no processo em que está (dono, 19/10)", () => {
    const e2 = pendenciasPorEvento(P).find((r) => r.evento === "e2")!;
    expect(e2.pendentes).toEqual({ layout: 2, aprovacao: 1, finalizacao: 0, revisao: 1 });
    // a soma das colunas = número de peças pendentes (nenhuma peça aparece em duas colunas)
    expect(Object.values(e2.pendentes).reduce((a, b) => a + b, 0)).toBe(pecasDaPendencia(P, "e2", null, false).length);
    // Pedro/dono 26/10: b1 (Sem patrocínio) vence o Layout no ajustado (16/10 = hoje) — não está atrasada.
    expect(e2.atrasados).toEqual({ layout: 1, aprovacao: 0, finalizacao: 0, revisao: 0 });
    expect(e2.totalAtrasados).toBe(1);
    expect(pecasDaPendencia(P, "e2", "aprovacao", false).map((p) => p.id).sort()).toEqual(["b6"]);
    expect(pecasDaPendencia(P, "e2", "atrasados", false).map((p) => p.id).sort()).toEqual(["b2"]);
    expect(pecasDaPendencia(P, "e2", null, false)).toHaveLength(4);
  });
});

describe("Problemas operacionais", () => {
  it("KPIs entre as peças em aberto", () => {
    expect(P.resumo.furaFilaAbertas).toBe(1); // a5
    expect(P.resumo.refacoesAbertas).toBe(1); // a6
    expect(P.resumo.reprovadasAbertas).toBe(1); // b1
    expect(P.resumo.atrasadasAbertas).toBe(P.pecas.filter((p) => p.fase < 6 && p.diasAtraso > 0).length);
    // Sem patrocínio: cobrada pelo Layout AJUSTADO (09/10 + 7 = 16/10, hoje) — Pedro/dono 26/10
    // (até aqui: pela finalização, 20/10).
    expect(peca$("b1").diasAtraso).toBe(0);
    expect(peca$("b1").prazoFase).toBe("2026-10-16");
    expect(peca$("b2").diasAtraso).toBe(11); // Lista de imagens venceu 05/10
  });

  it("por evento e a lista com chips e filtro", () => {
    const e1 = problemasPorEvento(P.pecas).find((r) => r.evento === "e1")!;
    expect(e1.furaFila).toBe(1);
    expect(e1.refacoes).toBe(1);
    expect(pecasComProblema(P.pecas, "refacao", null).map((p) => p.id)).toEqual(["a6"]);
    expect(peca$("a6").motivoRefacao).toBe("Avaria no transporte");
    expect(pecasComProblema(P.pecas, "reprovada", "e1")).toEqual([]);
    expect(pecasComProblema(P.pecas, "todos", null).some((p) => p.fase === 6)).toBe(false);
  });
});

describe("Status por evento", () => {
  it("abre no primeiro atrasado pela data do evento; peças por fase com entregues", () => {
    expect(eventoPadrao(P.eventos)).toBe("e1");
    const e1 = pecasPorFase(P.pecas, "e1");
    expect(e1.find((r) => r.rotulo === "Entregue")!.entregues).toBe(1);
    expect(e1.find((r) => r.rotulo === "Produção gráfica")).toMatchObject({ atrasadas: 4, noPrazo: 0 });
    const ev = P.eventos.find((e) => e.chave === "e2")!;
    expect(ev.fases.map((f) => f.prazo)).toEqual(["2026-10-05", "2026-10-09", "2026-10-19", "2026-10-20", "2026-10-22", "2026-10-29"]);
    expect(ev.fases[0].situacao).toBe("Atrasada");
  });
});

describe("Pré-produção — atrasado conta a peça uma vez (dono, 19/10)", () => {
  it("o 'Atrasado' de hoje no planejado não passa do número de peças atrasadas", () => {
    const hojeLinha = prePlanejadoPorDia(P, null, null).find((l) => l.dia === P.hoje);
    const pecasAtrasadas = P.pecas.filter((p) => p.fase >= 0 && p.fase <= 4 && pecasDaPendencia(P, p.evento, "atrasados", false).some((x) => x.id === p.id)).length;
    expect(hojeLinha?.atrasado ?? 0).toBeLessThanOrEqual(pecasAtrasadas);
  });
});
