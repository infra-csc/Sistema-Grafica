// Capacidade × Demanda por semana — o bloco que responde a única pergunta que
// nenhuma tela do app responde: "a gráfica vai dar conta do que vem?".
//
// O que estes testes prendem: a semana futura NÃO tem realizado (e `null` não
// é 0 — barra zerada à direita de "hoje" seria lida como "a gráfica parou"), a
// média de capacidade ignora a semana atual pela metade, e tudo que não pôde
// ser somado é declarado em vez de sumir.
import { describe, expect, it } from "vitest";
import { businessDayMs, eventCycleDayIndex } from "@/lib/analises-metrics";
import type { AnaliseEvent, AnaliseItem } from "@/lib/analises-metrics";
import {
  computeCapacidade, conclusaoDiaMs, rotuloSemana, weekKeysAround, weekStartMs,
} from "@/lib/analises-capacidade";

const DIA = 86_400_000;
const SEMANA = 7 * DIA;

function item(over: Partial<AnaliseItem> & { status: string }): AnaliseItem {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    eventId: over.eventId ?? "ev1",
    status: over.status,
    type: "Banner",
    quantity: over.quantity ?? 1,
    calculatedM2: "calculatedM2" in over ? over.calculatedM2 : "10.00",
    createdAt: over.createdAt ?? "2026-05-01T12:00:00.000Z",
    deliveredAt: over.deliveredAt ?? null,
    producedAt: over.producedAt ?? null,
    conferredAt: over.conferredAt ?? null,
    sponsors: [],
  };
}

// Quarta-feira, 10/06/2026, meio-dia em Brasília.
const AGORA = new Date("2026-06-10T15:00:00.000Z").getTime();
const HOJE = businessDayMs(AGORA);
const SEMANA_ATUAL = weekStartMs(HOJE);

function evento(id: string, saidaDiaMs: number): AnaliseEvent {
  return { id, name: id, truckDepartureDate: new Date(saidaDiaMs).toISOString(), createdAt: "2026-01-01T00:00:00.000Z" };
}

describe("semanas", () => {
  it("a semana começa na segunda-feira", () => {
    // A saída do caminhão e o turno da gráfica são de semana útil.
    for (let d = 0; d < 14; d++) {
      const dia = HOJE + d * DIA;
      const inicio = weekStartMs(dia);
      expect(new Date(inicio).getUTCDay()).toBe(1);
      expect(inicio).toBeLessThanOrEqual(dia);
      expect(dia - inicio).toBeLessThan(SEMANA);
    }
  });

  it("a janela tem 12 semanas atrás, a atual e 8 à frente", () => {
    const keys = weekKeysAround(HOJE, 12, 8);
    expect(keys).toHaveLength(21);
    expect(keys[12]).toBe(SEMANA_ATUAL);
    expect(keys[0]).toBe(SEMANA_ATUAL - 12 * SEMANA);
    expect(keys[20]).toBe(SEMANA_ATUAL + 8 * SEMANA);
  });

  it("o rótulo do eixo identifica a semana pela segunda-feira", () => {
    expect(rotuloSemana(Date.UTC(2026, 5, 8))).toBe("08/06");
  });
});

describe("data de conclusão", () => {
  it("prefere a produção — é ela que mede capacidade de máquina", () => {
    expect(conclusaoDiaMs(item({ status: "delivered", producedAt: "2026-06-03T12:00:00.000Z", deliveredAt: "2026-06-09T12:00:00.000Z" })))
      .toBe(Date.UTC(2026, 5, 3));
  });

  it("cai para conferência e entrega quando a produção não foi carimbada", () => {
    // Sem a reserva, a série de realizado ficaria artificialmente baixa e o
    // diretor leria uma capacidade menor do que a real.
    expect(conclusaoDiaMs(item({ status: "delivered", conferredAt: "2026-06-04T12:00:00.000Z" }))).toBe(Date.UTC(2026, 5, 4));
    expect(conclusaoDiaMs(item({ status: "entregue", deliveredAt: "2026-06-05T12:00:00.000Z" }))).toBe(Date.UTC(2026, 5, 5));
    expect(conclusaoDiaMs(item({ status: "inProduction" }))).toBeNull();
  });
});

describe("capacidade × demanda", () => {
  const eventos = [
    evento("passado", SEMANA_ATUAL - 2 * SEMANA),
    evento("agora", SEMANA_ATUAL + DIA),
    evento("futuro", SEMANA_ATUAL + 3 * SEMANA),
    evento("longe", SEMANA_ATUAL + 40 * SEMANA),
    evento("quebrado", Date.UTC(206, 0, 1)),
  ];
  const idx = eventCycleDayIndex(eventos);

  it("a demanda cai na semana da SAÍDA DO CAMINHÃO", () => {
    const { semanas } = computeCapacidade({
      items: [
        item({ eventId: "passado", status: "delivered", calculatedM2: "100.00" }),
        item({ eventId: "futuro", status: "awaiting_approval", calculatedM2: "250.00" }),
      ],
      cycleDayByEvent: idx, nowMs: AGORA,
    });
    expect(semanas.find((s) => s.inicioMs === SEMANA_ATUAL - 2 * SEMANA)!.demandaM2).toBe(100);
    expect(semanas.find((s) => s.inicioMs === SEMANA_ATUAL + 3 * SEMANA)!.demandaM2).toBe(250);
  });

  it("semana futura tem demanda mas NÃO tem realizado — null, não zero", () => {
    const { semanas } = computeCapacidade({
      items: [item({ eventId: "futuro", status: "awaiting_approval", calculatedM2: "60.00" })],
      cycleDayByEvent: idx, nowMs: AGORA,
    });
    const futura = semanas.find((s) => s.inicioMs === SEMANA_ATUAL + 3 * SEMANA)!;
    expect(futura.demandaM2).toBe(60);
    expect(futura.concluidoM2).toBeNull();
    expect(futura.passada).toBe(false);
    expect(futura.atual).toBe(false);
  });

  it("o realizado cai na semana em que a peça ficou pronta", () => {
    const prontoNaSemanaPassada = new Date(SEMANA_ATUAL - SEMANA + 2 * DIA + 15 * 3_600_000).toISOString();
    const { semanas } = computeCapacidade({
      items: [item({ eventId: "passado", status: "delivered", calculatedM2: "80.00", producedAt: prontoNaSemanaPassada })],
      cycleDayByEvent: idx, nowMs: AGORA,
    });
    expect(semanas.find((s) => s.inicioMs === SEMANA_ATUAL - SEMANA)!.concluidoM2).toBe(80);
  });

  it("produção adiantada para evento futuro entra no realizado da semana atual", () => {
    // Sem isto o m² sumia do gráfico: não existe barra de realizado no futuro.
    const prontoHoje = new Date(HOJE + 15 * 3_600_000).toISOString();
    const { semanas } = computeCapacidade({
      items: [item({ eventId: "futuro", status: "produced", calculatedM2: "70.00", producedAt: prontoHoje })],
      cycleDayByEvent: idx, nowMs: AGORA,
    });
    expect(semanas.find((s) => s.atual)!.concluidoM2).toBe(70);
  });

  it("a média de capacidade ignora a semana atual, que está pela metade", () => {
    const naSemanaPassada = new Date(SEMANA_ATUAL - SEMANA + DIA + 15 * 3_600_000).toISOString();
    const hojeMesmo = new Date(HOJE + 15 * 3_600_000).toISOString();
    const r = computeCapacidade({
      items: [
        item({ eventId: "passado", status: "produced", calculatedM2: "120.00", producedAt: naSemanaPassada }),
        item({ eventId: "agora", status: "produced", calculatedM2: "999.00", producedAt: hojeMesmo }),
      ],
      cycleDayByEvent: idx, nowMs: AGORA,
    });
    // 120 m² espalhados por 12 semanas passadas; os 999 da semana corrente,
    // que ainda é quarta-feira, não podem puxar a régua para cima.
    expect(r.semanasNaMedia).toBe(12);
    expect(r.mediaConcluidoM2).toBeCloseTo(10, 5);
  });

  it("declara o que não pôde ser somado em vez de deixar sumir", () => {
    const r = computeCapacidade({
      items: [
        item({ eventId: "quebrado", status: "requested", quantity: 4 }),
        item({ eventId: "longe", status: "requested", quantity: 7 }),
        item({ eventId: "passado", status: "produced", quantity: 3, calculatedM2: null, producedAt: new Date(SEMANA_ATUAL - SEMANA + DIA).toISOString() }),
      ],
      cycleDayByEvent: idx, nowMs: AGORA,
    });
    expect(r.demandaSemData).toBe(4);
    expect(r.demandaForaDaJanela).toBe(7);
    expect(r.semMedida).toBe(3);
  });

  it("recebe o 'agora' CRU e normaliza para o dia do negócio", () => {
    // Um âncora fora da meia-noite desalinharia todas as chaves de semana e o
    // gráfico sairia vazio sem nenhum erro. Às 23h de Brasília ainda é o mesmo
    // dia útil — e a mesma semana.
    const quaseMeiaNoiteEmSP = new Date("2026-06-11T02:00:00.000Z").getTime();
    const r = computeCapacidade({ items: [], cycleDayByEvent: idx, nowMs: quaseMeiaNoiteEmSP });
    expect(r.semanas.find((s) => s.atual)!.inicioMs).toBe(SEMANA_ATUAL);
    expect(r.semanas.every((s) => new Date(s.inicioMs).getUTCDay() === 1)).toBe(true);
  });

  it("peça fora do funil não vira demanda nem capacidade", () => {
    const r = computeCapacidade({
      items: [item({ eventId: "passado", status: "canceled", quantity: 50, calculatedM2: "500.00" })],
      cycleDayByEvent: idx, nowMs: AGORA,
    });
    expect(r.semanas.every((s) => s.demandaM2 === 0)).toBe(true);
    expect(r.demandaSemData).toBe(0);
  });

  it("base vazia devolve a janela inteira zerada, com uma semana atual só", () => {
    const r = computeCapacidade({ items: [], cycleDayByEvent: idx, nowMs: AGORA });
    expect(r.semanas).toHaveLength(21);
    expect(r.mediaConcluidoM2).toBe(0);
    expect(r.semanas.filter((s) => s.atual)).toHaveLength(1);
  });
});
