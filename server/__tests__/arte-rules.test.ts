// Regras puras da tela de Arte (client/src/lib/arte-rules.ts).
//
// Cada bloco aqui trava um bug real que a revisão da tela encontrou: o filtro
// "Urgente" que comparava com a grafia legada e nunca devolvia nada, o período
// "7 dias" sem piso que trazia todo o histórico junto, a peça sem quantidade
// virando "0—", o vínculo do multi-upload casando com o ano do nome do arquivo
// e os literais de status divergindo da fonte única.
import { describe, it, expect } from "vitest";
import {
  FINALIZADOS_STATUSES,
  TAB_STATUSES,
  ARTE_POOL_STATUSES,
  ARTE_TAB_IDS,
  DISPENSAVEIS_STATUSES,
  isArteTabId,
  isUrgente,
  EMPTY_ARTE_FILTERS,
  makeDateBounds,
  matchesArteFilters,
  countActiveFilters,
  filtersKey,
  serializeArteFilters,
  parseArteFilters,
  formatQuantity,
  fileMatchCandidates,
  normalizeDisplayId,
  matchFileToItem,
  phaseDeadline,
  compareEventUrgency,
  dentroDaJanelaFinalizados,
  isAtrasadaNaFase,
  filtrarAtrasadasDaFase,
  type ArteFilters,
} from "../../client/src/lib/arte-rules";
import { PRODUCTION_STATUSES } from "../../client/src/lib/status";

const NOW = new Date(2026, 7, 14, 10, 0, 0); // 14/08/2026, horário local
const B = makeDateBounds(NOW);

/** Data de saída no formato que o servidor devolve (ISO em UTC). */
function saida(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toISOString();
}

function item(over: Record<string, any> = {}): any {
  return {
    id: over.id ?? "i1",
    displayId: "0277",
    type: "Rolo",
    material: "LONA",
    description: "Rolo de entrada",
    status: "awaiting_submission",
    eventId: "e1",
    sponsors: [{ id: "s1", name: "Patro" }],
    approvalThumbUrl: null,
    finalFileUrl: null,
    quantity: 2,
    event: { id: "e1", name: "Rio S21K", priority: "media", truckDepartureDate: saida(2026, 8, 20) },
    ...over,
  };
}

function filters(over: Partial<ArteFilters> = {}): ArteFilters {
  return { ...EMPTY_ARTE_FILTERS, ...over };
}

describe("recortes de status", () => {
  it("FINALIZADOS_STATUSES deriva de PRODUCTION_STATUSES (fonte única)", () => {
    for (const s of PRODUCTION_STATUSES) expect(FINALIZADOS_STATUSES).toContain(s);
  });

  it("mantém os aliases legados em português que circulam no banco", () => {
    for (const s of ["pronto_para_producao", "liberado", "em_producao", "produzido", "entregue"]) {
      expect(FINALIZADOS_STATUSES).toContain(s);
    }
  });

  it("as quatro abas de status não se sobrepõem", () => {
    const vistos = new Set<string>();
    for (const tab of Object.keys(TAB_STATUSES)) {
      for (const s of TAB_STATUSES[tab]) {
        expect(vistos.has(s)).toBe(false);
        vistos.add(s);
      }
    }
  });

  it("ARTE_POOL_STATUSES não inclui produzido/entregue (não entram em book de aprovação)", () => {
    expect(ARTE_POOL_STATUSES).not.toContain("produced");
    expect(ARTE_POOL_STATUSES).not.toContain("delivered");
    expect(ARTE_POOL_STATUSES).toContain("awaiting_submission");
  });

  it("dispensar não é oferecido para peça já com o patrocinador", () => {
    expect(DISPENSAVEIS_STATUSES).not.toContain("awaiting_sponsor_approval");
  });

  it("isArteTabId reconhece só as cinco fases", () => {
    for (const t of ARTE_TAB_IDS) expect(isArteTabId(t)).toBe(true);
    expect(isArteTabId("qualquer-coisa")).toBe(false);
    expect(isArteTabId(null)).toBe(false);
  });
});

describe("isUrgente", () => {
  it("aceita a grafia do schema e a legada", () => {
    expect(isUrgente("urgente")).toBe(true);
    expect(isUrgente("urgent")).toBe(true);
  });
  it("recusa as demais prioridades e o vazio", () => {
    for (const p of ["alta", "media", "baixa", "", null, undefined]) {
      expect(isUrgente(p as any)).toBe(false);
    }
  });
});

describe("matchesArteFilters", () => {
  it("sem filtro, tudo passa", () => {
    expect(matchesArteFilters(item(), filters(), B)).toBe(true);
  });

  it("filtro Urgente encontra evento com a grafia do schema", () => {
    const f = filters({ urgente: true });
    expect(matchesArteFilters(item({ event: { priority: "urgente", truckDepartureDate: saida(2026, 8, 20) } }), f, B)).toBe(true);
    expect(matchesArteFilters(item({ event: { priority: "urgent", truckDepartureDate: saida(2026, 8, 20) } }), f, B)).toBe(true);
    expect(matchesArteFilters(item({ event: { priority: "alta", truckDepartureDate: saida(2026, 8, 20) } }), f, B)).toBe(false);
  });

  it("período de 7 dias tem PISO — evento já despachado não entra", () => {
    const f = filters({ period: "7 dias" });
    const passado = item({ event: { truckDepartureDate: saida(2025, 3, 1) } });
    const proximo = item({ event: { truckDepartureDate: saida(2026, 8, 18) } });
    const distante = item({ event: { truckDepartureDate: saida(2026, 9, 30) } });
    expect(matchesArteFilters(passado, f, B)).toBe(false);
    expect(matchesArteFilters(proximo, f, B)).toBe(true);
    expect(matchesArteFilters(distante, f, B)).toBe(false);
  });

  it("15 e 30 dias também têm piso", () => {
    const passado = item({ event: { truckDepartureDate: saida(2020, 1, 1) } });
    expect(matchesArteFilters(passado, filters({ period: "15 dias" }), B)).toBe(false);
    expect(matchesArteFilters(passado, filters({ period: "30 dias" }), B)).toBe(false);
  });

  it("'Hoje' pega só a saída do próprio dia", () => {
    const f = filters({ period: "Hoje" });
    expect(matchesArteFilters(item({ event: { truckDepartureDate: saida(2026, 8, 14) } }), f, B)).toBe(true);
    expect(matchesArteFilters(item({ event: { truckDepartureDate: saida(2026, 8, 15) } }), f, B)).toBe(false);
  });

  it("item sem data de saída sai de qualquer filtro de data", () => {
    const semData = item({ event: { name: "X", truckDepartureDate: null } });
    expect(matchesArteFilters(semData, filters({ period: "30 dias" }), B)).toBe(false);
    expect(matchesArteFilters(semData, filters({ next10Days: true }), B)).toBe(false);
    expect(matchesArteFilters(semData, filters({ months: ["8"] }), B)).toBe(false);
    expect(matchesArteFilters(semData, filters(), B)).toBe(true);
  });

  it("tri-estado de thumb substitui o par que se anulava", () => {
    const com = item({ approvalThumbUrl: "/objects/a.png" });
    const sem = item({ approvalThumbUrl: null });
    expect(matchesArteFilters(com, filters({ thumb: "com" }), B)).toBe(true);
    expect(matchesArteFilters(com, filters({ thumb: "sem" }), B)).toBe(false);
    expect(matchesArteFilters(sem, filters({ thumb: "sem" }), B)).toBe(true);
    // Não existe estado que descarte os dois ao mesmo tempo.
    expect(matchesArteFilters(com, filters({ thumb: "todos" }), B)).toBe(true);
    expect(matchesArteFilters(sem, filters({ thumb: "todos" }), B)).toBe(true);
  });

  it("tri-estado de arquivo final", () => {
    const com = item({ finalFileUrl: "\\\\srv\\a.tif" });
    expect(matchesArteFilters(com, filters({ final: "com" }), B)).toBe(true);
    expect(matchesArteFilters(com, filters({ final: "sem" }), B)).toBe(false);
  });

  it("busca casa ID, tipo, descrição e nome do evento", () => {
    for (const termo of ["0277", "rolo", "entrada", "rio s21k"]) {
      expect(matchesArteFilters(item(), filters({ search: termo }), B)).toBe(true);
    }
    expect(matchesArteFilters(item(), filters({ search: "inexistente" }), B)).toBe(false);
  });

  it("evento, tipo, material e patrocinador filtram por identidade", () => {
    expect(matchesArteFilters(item(), filters({ eventIds: ["e2"] }), B)).toBe(false);
    expect(matchesArteFilters(item(), filters({ types: ["Rolo"] }), B)).toBe(true);
    expect(matchesArteFilters(item(), filters({ materials: ["SANETT"] }), B)).toBe(false);
    expect(matchesArteFilters(item(), filters({ sponsorIds: ["s1"] }), B)).toBe(true);
    expect(matchesArteFilters(item(), filters({ sponsorIds: ["s9"] }), B)).toBe(false);
  });
});

describe("countActiveFilters e filtersKey", () => {
  it("conta cada valor selecionado e cada toggle", () => {
    expect(countActiveFilters(EMPTY_ARTE_FILTERS)).toBe(0);
    expect(
      countActiveFilters(filters({ eventIds: ["a", "b"], urgente: true, thumb: "sem", period: "7 dias" })),
    ).toBe(5);
  });

  it("a chave muda com o recorte e é estável para o mesmo recorte", () => {
    const f = filters({ eventIds: ["a"] });
    expect(filtersKey(f, "finalizados")).toBe(filtersKey(filters({ eventIds: ["a"] }), "finalizados"));
    expect(filtersKey(f, "finalizados")).not.toBe(filtersKey(f, "correcao"));
    expect(filtersKey(f, "x")).not.toBe(filtersKey(filters({ eventIds: ["b"] }), "x"));
  });
});

describe("filtros na URL", () => {
  it("estado padrão gera URL limpa", () => {
    expect(serializeArteFilters(EMPTY_ARTE_FILTERS, "criar-aprovacoes")).toBe("");
  });

  it("ida e volta preserva todos os campos", () => {
    const f = filters({
      search: "rolo",
      eventIds: ["e1", "e2"],
      sponsorIds: ["s1"],
      types: ["Rolo"],
      materials: ["LONA"],
      months: ["8", "9"],
      next10Days: true,
      urgente: true,
      thumb: "sem",
      final: "com",
      period: "15 dias",
    });
    const qs = serializeArteFilters(f, "correcao");
    const back = parseArteFilters(qs);
    expect(back.filters).toEqual(f);
    expect(back.tab).toBe("correcao");
  });

  it("valores inválidos na URL caem no padrão em vez de quebrar", () => {
    const back = parseArteFilters("fase=inventada&periodo=ontem&thumb=talvez");
    expect(back.tab).toBeNull();
    expect(back.filters.period).toBe("Todos");
    expect(back.filters.thumb).toBe("todos");
  });

  it("URL vazia devolve o estado limpo", () => {
    expect(parseArteFilters("").filters).toEqual(EMPTY_ARTE_FILTERS);
  });
});

describe("formatQuantity", () => {
  it("peça sem quantidade mostra travessão, nunca '0—'", () => {
    for (const q of [null, undefined, 0, "", NaN]) {
      expect(formatQuantity(q)).toBe("—");
    }
  });
  it("quantidade é número, sem zero à esquerda", () => {
    expect(formatQuantity(2)).toBe("2");
    expect(formatQuantity(12)).toBe("12");
    expect(formatQuantity(140)).toBe("140");
  });
});

describe("vínculo automático do multi-upload", () => {
  it("prefere o ÚLTIMO número do nome e evita o que parece ano", () => {
    const c = fileMatchCandidates("banner_2024_0277.jpg");
    expect(c.numbers).toEqual(["2024", "0277"]);
    expect(c.ordered[0]).toBe("0277");
    expect(c.ambiguous).toBe(true);
  });

  it("nome com um número só não é ambíguo", () => {
    const c = fileMatchCandidates("0277_aplique.jpg");
    expect(c.ordered).toEqual(["0277"]);
    expect(c.ambiguous).toBe(false);
  });

  it("ignora números de menos de 3 dígitos ('3x3', '01')", () => {
    expect(fileMatchCandidates("tenda_3x3_0122.png").numbers).toEqual(["0122"]);
  });

  it("normalizeDisplayId ignora o complemento do ID", () => {
    expect(normalizeDisplayId("#0062-C1")).toBe("00621");
    expect(normalizeDisplayId("62")).toBe("0062");
    expect(normalizeDisplayId(null)).toBe("0000");
  });

  it("casa com a peça certa e marca o vínculo como duvidoso", () => {
    const pool = [
      { id: "a", displayId: "2024" },
      { id: "b", displayId: "0277" },
    ];
    const r = matchFileToItem("banner_2024_0277.jpg", pool, new Set());
    expect(r.item?.id).toBe("b");
    expect(r.ambiguous).toBe(true);
  });

  it("peça já vinculada por outro arquivo sai do pool", () => {
    const pool = [{ id: "b", displayId: "0277" }];
    expect(matchFileToItem("0277_a.jpg", pool, new Set(["b"])).item).toBeNull();
  });

  it("sem número casável devolve null", () => {
    expect(matchFileToItem("arte_final.jpg", [{ id: "b", displayId: "0277" }], new Set()).item).toBeNull();
  });
});

describe("prazo por fase", () => {
  const evento = { truckDepartureDate: saida(2026, 9, 3), deadlineEntregaLayouts: -20, deadlineAprovacaoLayout: -12 };

  it("a aba de envio usa Entrega de Layouts", () => {
    const d = phaseDeadline(evento, "criar-aprovacoes", B.today)!;
    expect(d.label).toBe("Entrega de Layouts");
    expect(d.date.getDate()).toBe(14); // 03/09 − 20d = 14/08
    expect(d.diff).toBe(0);
  });

  it("a aba de aguardando usa Aprovação de Layout", () => {
    const d = phaseDeadline(evento, "aguardando-patrocinador", B.today)!;
    expect(d.label).toBe("Aprovação de Layout");
    expect(d.diff).toBe(8); // 03/09 − 12d = 22/08
  });

  it("usa o padrão da casa quando o evento não define o marco", () => {
    const d = phaseDeadline({ truckDepartureDate: saida(2026, 9, 3) }, "criar-aprovacoes", B.today)!;
    expect(d.diff).toBe(0);
  });

  it("evento sem saída marcada não tem prazo inventado", () => {
    expect(phaseDeadline({ truckDepartureDate: null }, "criar-aprovacoes", B.today)).toBeNull();
    expect(phaseDeadline(undefined, "criar-aprovacoes", B.today)).toBeNull();
  });

  it("marco atrasado devolve diff negativo", () => {
    const d = phaseDeadline({ truckDepartureDate: saida(2026, 8, 20) }, "criar-aprovacoes", B.today)!;
    expect(d.diff).toBeLessThan(0);
  });

  it("ordena eventos por urgência, com os sem saída no fim", () => {
    const perto = { truckDepartureDate: saida(2026, 8, 25) };
    const longe = { truckDepartureDate: saida(2026, 12, 1) };
    const semData = { truckDepartureDate: null };
    const ordenados = [longe, semData, perto].sort((a, b) => compareEventUrgency(a, b, "criar-aprovacoes", B.today));
    expect(ordenados[0]).toBe(perto);
    expect(ordenados[2]).toBe(semData);
  });
});

describe("atraso contra o marco da FASE", () => {
  // Este bloco trava a decisão de produto do filtro "Prazo: atrasados": o que
  // conta é o marco da fase, não a saída do caminhão.
  const naFase = (tab: string, saidaDate: string, over: Record<string, any> = {}) =>
    isAtrasadaNaFase(item({ event: { truckDepartureDate: saidaDate, ...over } }), tab, B.today);

  it("peça com saída no FUTURO já pode estar atrasada na fase", () => {
    // Saída em 20/08 (6 dias à frente): pela saída do caminhão, no prazo.
    // Entrega de Layouts é 20/08 − 20d = 31/07 — 14 dias vencida.
    const saida20 = saida(2026, 8, 20);
    expect(phaseDeadline({ truckDepartureDate: saida20 }, "criar-aprovacoes", B.today)!.diff).toBe(-14);
    expect(naFase("criar-aprovacoes", saida20)).toBe(true);
  });

  it("o marco muda com a fase: a mesma peça atrasa em uma e não na outra", () => {
    // Saída 03/09 → Entrega de Layouts 14/08 (hoje, no prazo) e Aprovação de
    // Layout 22/08 (ainda longe). Saída 30/08 → Entrega 10/08, já vencida.
    expect(naFase("criar-aprovacoes", saida(2026, 8, 30))).toBe(true);
    expect(naFase("aguardando-patrocinador", saida(2026, 8, 30))).toBe(false);
  });

  it("vence hoje não é atrasado (diff 0)", () => {
    expect(naFase("criar-aprovacoes", saida(2026, 9, 3))).toBe(false);
  });

  it("Correção é cobrada pelo mesmo marco de Entrega de Layouts", () => {
    expect(naFase("correcao", saida(2026, 8, 30))).toBe(true);
  });

  it("respeita o offset gravado no evento, não só o padrão da casa", () => {
    // Offset −5 sobre a saída de 20/08 → 15/08, ainda no futuro.
    expect(naFase("criar-aprovacoes", saida(2026, 8, 20), { deadlineEntregaLayouts: -5 })).toBe(false);
  });

  it("Finalizados nunca acusa atraso — o marco de lá é a própria saída", () => {
    expect(naFase("finalizados", saida(2025, 1, 5))).toBe(false);
    expect(filtrarAtrasadasDaFase([item({ event: { truckDepartureDate: saida(2025, 1, 5) } })], "finalizados", B.today))
      .toEqual([]);
  });

  it("peça sem saída marcada não é atrasada (não há âncora)", () => {
    expect(naFase("criar-aprovacoes", null as any)).toBe(false);
    expect(isAtrasadaNaFase({ event: null }, "criar-aprovacoes", B.today)).toBe(false);
    expect(isAtrasadaNaFase({}, "criar-aprovacoes", B.today)).toBe(false);
  });

  it("filtrarAtrasadasDaFase devolve o mesmo conjunto do selo da coluna Prazo", () => {
    const lista = [
      item({ id: "atrasada", event: { truckDepartureDate: saida(2026, 8, 30) } }),
      item({ id: "no-prazo", event: { truckDepartureDate: saida(2026, 10, 1) } }),
      item({ id: "sem-saida", event: { truckDepartureDate: null } }),
    ];
    const so = filtrarAtrasadasDaFase(lista, "criar-aprovacoes", B.today);
    expect(so.map((i: any) => i.id)).toEqual(["atrasada"]);
    // O mesmo recorte que a coluna desenharia como "Nd atrasado".
    const pelaColuna = lista.filter(
      (i: any) => (phaseDeadline(i.event, "criar-aprovacoes", B.today)?.diff ?? 0) < 0,
    );
    expect(pelaColuna.map((i: any) => i.id)).toEqual(["atrasada"]);
  });

  it("entra na conta de filtros ativos e na chave de recorte", () => {
    expect(countActiveFilters(filters({ atrasado: true }))).toBe(1);
    expect(filtersKey(filters({ atrasado: true }), "x")).not.toBe(filtersKey(filters(), "x"));
  });

  it("vai e volta da URL como ?atrasados=1", () => {
    expect(serializeArteFilters(filters({ atrasado: true }), "criar-aprovacoes")).toBe("atrasados=1");
    expect(parseArteFilters("atrasados=1").filters.atrasado).toBe(true);
    expect(parseArteFilters("").filters.atrasado).toBe(false);
    expect(parseArteFilters("atrasados=talvez").filters.atrasado).toBe(false);
  });
});

describe("janela padrão da aba Finalizados", () => {
  it("mantém o que saiu nos últimos 90 dias e no futuro", () => {
    expect(dentroDaJanelaFinalizados(item({ event: { truckDepartureDate: saida(2026, 7, 20) } }), B.today)).toBe(true);
    expect(dentroDaJanelaFinalizados(item({ event: { truckDepartureDate: saida(2026, 9, 20) } }), B.today)).toBe(true);
  });
  it("corta o histórico antigo", () => {
    expect(dentroDaJanelaFinalizados(item({ event: { truckDepartureDate: saida(2025, 1, 5) } }), B.today)).toBe(false);
  });
  it("peça sem saída marcada nunca é cortada por data", () => {
    expect(dentroDaJanelaFinalizados(item({ event: { truckDepartureDate: null } }), B.today)).toBe(true);
  });
});
