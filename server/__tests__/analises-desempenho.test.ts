// Os 4 KPIs comparáveis e a tabela de ofensores.
//
// Estes testes prendem as decisões de MODELO da tela — as que, erradas, não
// quebram nada e só produzem um número que o diretor leva para a reunião:
//  - "no prazo" é medido contra a saída do caminhão, não contra hoje;
//  - o que não pôde ser medido é contado à parte, nunca somado como zero;
//  - a mesma seta para cima é boa em "entregas no prazo" e ruim em
//    "retrabalho", e os dois cards ficam lado a lado.
import { describe, expect, it } from "vitest";
import { eventCycleDayIndex } from "@/lib/analises-metrics";
import type { AnaliseEvent, AnaliseItem } from "@/lib/analises-metrics";
import {
  computeDesempenho, computeOfensores, ehComplemento, mediana, ordenarOfensores,
  rotaDoOfensor, temRefacao, variacao,
} from "@/lib/analises-desempenho";

const SAIDA = "2026-06-10T00:00:00.000Z";

function item(over: Partial<AnaliseItem> & { status: string }): AnaliseItem {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    eventId: over.eventId ?? "ev1",
    status: over.status,
    type: "type" in over ? over.type : "Banner",
    quantity: over.quantity ?? 1,
    calculatedM2: "calculatedM2" in over ? over.calculatedM2 : "10.00",
    createdAt: over.createdAt ?? "2026-05-20T12:00:00.000Z",
    deliveredAt: over.deliveredAt ?? null,
    producedAt: over.producedAt ?? null,
    conferredAt: over.conferredAt ?? null,
    rejectedBySponsor: over.rejectedBySponsor ?? false,
    rejectedByCreator: over.rejectedByCreator ?? false,
    previousFinalFileUrl: over.previousFinalFileUrl ?? null,
    previousApprovalThumbUrl: over.previousApprovalThumbUrl ?? null,
    complementSeq: over.complementSeq ?? null,
    sponsors: over.sponsors ?? [],
  };
}

const eventos: AnaliseEvent[] = [
  { id: "ev1", name: "Corrida do Sol", truckDepartureDate: SAIDA, createdAt: SAIDA },
  { id: "ev2", name: "Circuito Norte", truckDepartureDate: SAIDA, createdAt: SAIDA },
  { id: "evSemData", name: "Sem saída", truckDepartureDate: "0206-01-01T00:00:00.000Z", createdAt: SAIDA },
];
const idx = eventCycleDayIndex(eventos);
const nomes = new Map(eventos.map((e) => [e.id, e.name]));

describe("entregas no prazo", () => {
  it("mede contra a SAÍDA DO CAMINHÃO, e o próprio dia da saída é no prazo", () => {
    // O caminhão carrega no dia da saída, não na véspera.
    const r = computeDesempenho([
      item({ status: "delivered", deliveredAt: "2026-06-10T20:00:00.000Z" }), // 17h em SP, dia da saída
      item({ status: "delivered", deliveredAt: "2026-06-09T12:00:00.000Z" }), // véspera
      item({ status: "delivered", deliveredAt: "2026-06-11T12:00:00.000Z" }), // um dia depois
    ], idx);
    expect(r.prazoAvaliadas).toBe(3);
    expect(r.prazoNoPrazo).toBe(2);
    expect(r.prazoRate).toBeCloseTo(66.67, 1);
  });

  it("pesa pela quantidade — 200 unidades atrasadas doem mais que 1", () => {
    const r = computeDesempenho([
      item({ status: "delivered", quantity: 200, deliveredAt: "2026-06-15T12:00:00.000Z" }),
      item({ status: "delivered", quantity: 1, deliveredAt: "2026-06-01T12:00:00.000Z" }),
    ], idx);
    expect(r.prazoAvaliadas).toBe(201);
    expect(r.prazoNoPrazo).toBe(1);
  });

  it("entregue SEM data de entrega fica fora do denominador e é declarado", () => {
    // `deliveredAt` só é carimbado na entrega TOTAL. Contar essas peças como
    // atrasadas subnotificaria a casa em silêncio — o defeito que a tela tinha.
    const r = computeDesempenho([
      item({ status: "entregue", deliveredAt: null, quantity: 5 }),
      item({ status: "delivered", deliveredAt: "2026-06-01T12:00:00.000Z" }),
    ], idx);
    expect(r.prazoSemData).toBe(5);
    expect(r.prazoAvaliadas).toBe(1);
    expect(r.prazoRate).toBe(100);
  });

  it("evento sem saída válida não vira 'atrasado' — vira 'não avaliável'", () => {
    const r = computeDesempenho([
      item({ eventId: "evSemData", status: "delivered", deliveredAt: "2026-06-01T12:00:00.000Z", quantity: 3 }),
    ], idx);
    expect(r.prazoSemData).toBe(3);
    expect(r.prazoRate).toBeNull();
  });

  it("sem nenhuma entrega avaliável a taxa é null, não 0%", () => {
    // 0% diria "a operação falhou em tudo"; null diz "não há o que medir".
    const r = computeDesempenho([item({ status: "awaiting_approval" })], idx);
    expect(r.prazoRate).toBeNull();
  });
});

describe("ciclo de entrega", () => {
  it("é a mediana de dias entre criação e entrega, não a média", () => {
    // A média é sequestrada por uma peça esquecida no sistema desde janeiro.
    const r = computeDesempenho([
      item({ status: "delivered", createdAt: "2026-06-01T12:00:00.000Z", deliveredAt: "2026-06-03T12:00:00.000Z" }),
      item({ status: "delivered", createdAt: "2026-06-01T12:00:00.000Z", deliveredAt: "2026-06-05T12:00:00.000Z" }),
      item({ status: "delivered", createdAt: "2026-01-01T12:00:00.000Z", deliveredAt: "2026-06-05T12:00:00.000Z" }),
    ], idx);
    expect(r.cicloMedianaDias).toBe(4);
    expect(r.cicloAmostra).toBe(3);
  });

  it("mediana interpola nos pares e devolve null sem amostra", () => {
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
    expect(mediana([7])).toBe(7);
    expect(mediana([])).toBeNull();
  });
});

describe("retrabalho", () => {
  it("pega os dois sinais DURÁVEIS e os dois transitórios", () => {
    expect(temRefacao(item({ status: "delivered", previousFinalFileUrl: "x" }))).toBe(true);
    expect(temRefacao(item({ status: "delivered", previousApprovalThumbUrl: "x" }))).toBe(true);
    expect(temRefacao(item({ status: "awaiting_submission", rejectedByCreator: true }))).toBe(true);
    expect(temRefacao(item({ status: "awaiting_approval", rejectedBySponsor: true }))).toBe(true);
    expect(temRefacao(item({ status: "delivered" }))).toBe(false);
  });

  it("complemento é contado à parte — quantidade extra não é erro de arte", () => {
    const c = item({ status: "delivered", complementSeq: 1, quantity: 4 });
    expect(ehComplemento(c)).toBe(true);
    expect(temRefacao(c)).toBe(false);
    const r = computeDesempenho([c, item({ status: "delivered", quantity: 6 })], idx);
    expect(r.complementoPecas).toBe(4);
    expect(r.retrabalhoPecas).toBe(0);
  });

  it("o denominador é o funil, sem canceladas e sem excluídas", () => {
    const r = computeDesempenho([
      item({ status: "delivered", quantity: 10, previousFinalFileUrl: "x" }),
      item({ status: "delivered", quantity: 10 }),
      item({ status: "canceled", quantity: 100 }),
      item({ status: "deleted", quantity: 100 }),
    ], idx);
    expect(r.pecasTotal).toBe(20);
    expect(r.retrabalhoRate).toBe(50);
  });
});

describe("volume entregue em m²", () => {
  it("soma calculatedM2 só das entregues e conta as sem medida à parte", () => {
    // `calculatedM2` já é quantidade × largura × altura: não se multiplica de
    // novo pela quantidade.
    const r = computeDesempenho([
      item({ status: "delivered", quantity: 5, calculatedM2: "40.00", deliveredAt: "2026-06-01T12:00:00.000Z" }),
      item({ status: "delivered", quantity: 2, calculatedM2: null, deliveredAt: "2026-06-01T12:00:00.000Z" }),
      item({ status: "inProduction", calculatedM2: "999.00" }),
    ], idx);
    expect(r.m2Entregue).toBe(40);
    expect(r.m2SemMedida).toBe(2);
  });
});

describe("variação contra o período anterior", () => {
  it("a mesma subida é 'melhor' no prazo e 'pior' no retrabalho", () => {
    expect(variacao(90, 80, true)).toEqual({ delta: 10, direcao: "subiu", positiva: true });
    expect(variacao(9, 4, false)).toEqual({ delta: 5, direcao: "subiu", positiva: false });
    expect(variacao(12, 20, false)!.positiva).toBe(true);
  });

  it("sem um dos lados devolve null — a tela precisa DIZER que não há comparação", () => {
    // Um "0%" no lugar da variação é lido como "não mudou nada", que é a única
    // leitura que o caso não permite.
    expect(variacao(90, null, true)).toBeNull();
    expect(variacao(null, 90, true)).toBeNull();
    expect(variacao(90, undefined, true)).toBeNull();
  });

  it("igual não desenha seta", () => {
    expect(variacao(90, 90, true)).toBeNull();
  });
});

describe("ofensores", () => {
  const base = [
    item({ id: "a", eventId: "ev1", type: "Banner", quantity: 10, calculatedM2: "30.00", status: "delivered", deliveredAt: "2026-06-15T12:00:00.000Z", sponsors: [{ id: "sp1", name: "Alfa" }] }),
    item({ id: "b", eventId: "ev1", type: "banner ", quantity: 5, calculatedM2: "10.00", status: "delivered", deliveredAt: "2026-06-01T12:00:00.000Z", previousFinalFileUrl: "x", sponsors: [{ id: "sp1", name: "Alfa" }, { id: "sp2", name: "Beta" }] }),
    item({ id: "c", eventId: "ev2", type: "Rolo", quantity: 1, calculatedM2: "5.00", status: "awaiting_approval", sponsors: [{ id: "sp2", name: "Beta" }] }),
  ];
  const ctx = { cycleDayByEvent: idx, eventNameById: nomes, sponsors: [{ id: "sp1", name: "Alfa" }, { id: "sp2", name: "Beta" }] };

  it("por evento: fora do prazo com denominador visível e o que ficou em aberto", () => {
    const rows = computeOfensores(base, "evento", ctx);
    const ev1 = rows.find((r) => r.chave === "ev1")!;
    expect(ev1.label).toBe("Corrida do Sol");
    expect(ev1.pecas).toBe(15);
    expect(ev1.m2).toBe(40);
    expect(ev1.foraPrazo).toBe(10);
    expect(ev1.prazoAvaliadas).toBe(15);
    expect(ev1.prazoRate).toBeCloseTo(33.33, 1);
    expect(ev1.emAberto).toBe(0);

    const ev2 = rows.find((r) => r.chave === "ev2")!;
    expect(ev2.emAberto).toBe(1);
    expect(ev2.prazoRate).toBeNull();
  });

  it("por tipo: 'Banner', 'banner' e 'Banner ' são a mesma categoria", () => {
    // `items.type` é texto livre — o formulário permite tipo customizado.
    const rows = computeOfensores(base, "tipo", ctx);
    expect(rows).toHaveLength(2);
    const banner = rows.find((r) => r.chave === "banner")!;
    expect(banner.pecas).toBe(15);
  });

  it("por patrocinador: peça com dois patrocinadores conta nas duas linhas", () => {
    const rows = computeOfensores(base, "patrocinador", ctx);
    expect(rows.find((r) => r.chave === "sp1")!.pecas).toBe(15);
    expect(rows.find((r) => r.chave === "sp2")!.pecas).toBe(6);
    // A soma (21) é maior que o total real (16) de propósito — a tela declara.
    expect(rows.reduce((s, r) => s + r.pecas, 0)).toBe(21);
  });

  it("peça sem patrocinador não some da tabela", () => {
    const rows = computeOfensores([item({ status: "delivered", sponsors: [] })], "patrocinador", ctx);
    expect(rows[0].label).toBe("Sem patrocinador");
    expect(rotaDoOfensor("patrocinador", rows[0].chave, rows[0].label)).toBeNull();
  });

  it("ordena por dor absoluta, e linhas sem ciclo vão para o fim", () => {
    const rows = computeOfensores(base, "evento", ctx);
    expect(ordenarOfensores(rows, "atraso")[0].chave).toBe("ev1");
    expect(ordenarOfensores(rows, "retrabalho")[0].chave).toBe("ev1");
    expect(ordenarOfensores(rows, "ciclo").map((r) => r.chave)).toEqual(["ev1", "ev2"]);
    expect(ordenarOfensores(rows, "volume")[0].chave).toBe("ev1");
  });

  it("cada dimensão aponta para a tela vizinha certa", () => {
    // Análises diagnostica o padrão; as outras duas telas mostram o caso.
    expect(rotaDoOfensor("evento", "ev1", "Corrida do Sol")).toBe("/eventos/ev1");
    expect(rotaDoOfensor("tipo", "banner", "Banner")).toBe("/?tipo=Banner");
    expect(rotaDoOfensor("patrocinador", "sp1", "Alfa")).toBe("/?patrocinador=sp1");
  });

  it("fora do funil não entra em nenhuma linha", () => {
    const rows = computeOfensores([item({ status: "canceled", quantity: 99 })], "evento", ctx);
    expect(rows).toHaveLength(0);
  });
});
