// Base da tela de Análises: âncoras de data, recorte por ciclo e filtros.
// A tela tinha ZERO teste — e dois dos seus blocos liam campos que não existem
// no banco, o que só apareceu quando alguém abriu o schema ao lado. Cada bloco
// abaixo prende um desses defeitos.
import { describe, expect, it } from "vitest";
import { spDayMs } from "../services/prazo-domain";
import {
  businessDayMs, cycleWindow, eventCycleDayIndex, eventDayMs, filterEvents,
  filterItems, instantDayMs, m2Of, pickDefaultPeriod, previousWindow, qtyOf,
} from "@/lib/analises-metrics";
import type { AnaliseEvent, AnaliseItem } from "@/lib/analises-metrics";

const DIA = 86_400_000;

function item(over: Partial<AnaliseItem> & { status: string }): AnaliseItem {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    eventId: over.eventId ?? "ev1",
    status: over.status,
    type: "type" in over ? over.type : "Banner",
    quantity: over.quantity ?? 1,
    calculatedM2: "calculatedM2" in over ? over.calculatedM2 : "10.00",
    createdAt: over.createdAt ?? new Date(2026, 5, 10),
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

function evento(over: Partial<AnaliseEvent> & { id: string }): AnaliseEvent {
  return {
    id: over.id,
    name: over.name ?? `Evento ${over.id}`,
    truckDepartureDate: over.truckDepartureDate ?? "2026-06-01T00:00:00.000Z",
    createdAt: over.createdAt ?? "2026-05-01T00:00:00.000Z",
  };
}

describe("âncora de data", () => {
  it("businessDayMs concorda com o spDayMs do domínio do servidor", () => {
    // Os dois têm de dar o mesmo dia: em UTC puro, entre 21h e 00h em Brasília
    // o recorte de período pula um dia inteiro.
    for (const iso of [
      "2026-08-14T02:59:00.000Z", // 23:59 de 13/08 em Brasília
      "2026-08-14T03:01:00.000Z", // 00:01 de 14/08 em Brasília
      "2026-01-01T12:00:00.000Z",
      "2026-12-31T23:30:00.000Z",
    ]) {
      const ms = new Date(iso).getTime();
      expect(businessDayMs(ms), iso).toBe(spDayMs(new Date(ms)));
    }
  });

  it("eventDayMs rejeita data impossível em vez de lançar", () => {
    // `format()` do date-fns LANÇA em data inválida e a tela é um componente
    // só, sem error boundary: uma data ruim derrubava a página inteira.
    expect(eventDayMs("2026-06-01T10:00:00.000Z")).toBe(Date.UTC(2026, 5, 1));
    expect(eventDayMs(null)).toBeNull();
    expect(eventDayMs("nada disso")).toBeNull();
    expect(eventDayMs("20205-06-01T00:00:00.000Z")).toBeNull();
  });

  it("instantDayMs leva o timestamp para o dia-calendário de Brasília", () => {
    // É o que impede uma entrega das 22h de sexta em São Paulo de cair no
    // sábado e virar "fora do prazo" só por fuso horário.
    expect(instantDayMs("2026-06-02T02:00:00.000Z")).toBe(Date.UTC(2026, 5, 1));
    expect(instantDayMs("2026-06-02T04:00:00.000Z")).toBe(Date.UTC(2026, 5, 2));
    expect(instantDayMs(null)).toBeNull();
    expect(instantDayMs("lixo")).toBeNull();
  });
});

describe("leitura de m² e quantidade", () => {
  it("calculatedM2 chega como STRING do driver e já inclui a quantidade", () => {
    // `deriveCalculatedM2` no servidor grava quantidade × largura × altura:
    // multiplicar por quantidade de novo dobraria o volume da casa.
    expect(m2Of({ calculatedM2: "12.50" })).toBe(12.5);
    expect(m2Of({ calculatedM2: 8 })).toBe(8);
  });

  it("ausência de medida é null, não zero", () => {
    // Zero somaria em silêncio; null obriga a tela a contar à parte.
    expect(m2Of({ calculatedM2: null })).toBeNull();
    expect(m2Of({ calculatedM2: "0.00" })).toBeNull();
    expect(m2Of({ calculatedM2: "abc" })).toBeNull();
  });

  it("quantidade ausente vale 1 peça", () => {
    expect(qtyOf({ quantity: null })).toBe(1);
    expect(qtyOf({ quantity: 7 })).toBe(7);
  });
});

describe("recorte de período por ciclo do evento", () => {
  const agora = new Date("2026-08-14T15:00:00.000Z").getTime();
  const hoje = businessDayMs(agora);

  it("é uma janela FECHADA que termina hoje", () => {
    const w = cycleWindow("30d", agora)!;
    expect(w.toMs).toBe(hoje);
    expect(w.fromMs).toBe(hoje - 30 * DIA);
    expect(cycleWindow("all", agora)).toBeNull();
  });

  it("inclui o ciclo já encerrado e exclui o que ainda vai sair", () => {
    // O ponto do conserto: o recorte anterior filtrava peças pela data de
    // CRIAÇÃO e media quantas já estavam ENTREGUES, num pipeline cujo primeiro
    // marco é -25 dias. "Últimos 7 dias" zerava a taxa por construção.
    const events = [
      evento({ id: "passado", truckDepartureDate: new Date(hoje - 3 * DIA).toISOString() }),
      evento({ id: "antigo",  truckDepartureDate: new Date(hoje - 200 * DIA).toISOString() }),
      evento({ id: "futuro",  truckDepartureDate: new Date(hoje + 5 * DIA).toISOString() }),
      evento({ id: "quebrado", truckDepartureDate: "0206-06-01T00:00:00.000Z" }),
    ];
    const idx = eventCycleDayIndex(events);
    const w = cycleWindow("30d", agora);
    expect(filterEvents(events, idx, w).map((e) => e.id)).toEqual(["passado"]);
    // Sem período, nada é descartado — nem o cadastro quebrado.
    expect(filterEvents(events, idx, null)).toHaveLength(4);
  });

  it("a peça segue o ciclo do evento dela, não a própria data de criação", () => {
    const events = [
      evento({ id: "fechado", truckDepartureDate: new Date(hoje - 2 * DIA).toISOString() }),
      evento({ id: "aberto",  truckDepartureDate: new Date(hoje + 20 * DIA).toISOString() }),
    ];
    const idx = eventCycleDayIndex(events);
    const items = [
      // Criada há muito tempo, mas de evento que só sai daqui a 20 dias.
      item({ id: "a", eventId: "aberto", status: "requested", createdAt: new Date(hoje - 60 * DIA) }),
      // Criada ontem, de evento que já saiu: entra no recorte.
      item({ id: "b", eventId: "fechado", status: "delivered", createdAt: new Date(hoje - 1 * DIA) }),
    ];
    const f = filterItems(items, idx, { window: cycleWindow("7d", agora), eventFilter: "all", sponsorFilter: "all" });
    expect(f.map((i) => i.id)).toEqual(["b"]);
  });
});

describe("janela anterior — o denominador da comparação", () => {
  const agora = new Date("2026-08-14T15:00:00.000Z").getTime();
  const hoje = businessDayMs(agora);

  it("tem o mesmo tamanho e não encosta na janela atual", () => {
    const atual = cycleWindow("30d", agora)!;
    const ant = previousWindow(atual)!;
    expect(ant.toMs).toBe(atual.fromMs - DIA);
    expect(ant.toMs - ant.fromMs).toBe(atual.toMs - atual.fromMs);
    expect(ant.fromMs).toBe(hoje - 61 * DIA);
  });

  it("'todo o período' não tem anterior — e a tela precisa DIZER isso", () => {
    // Devolver uma janela vazia faria a variação sair 0%, que é lido como
    // "não mudou nada" — a única leitura que o caso não permite.
    expect(previousWindow(null)).toBeNull();
  });
});

describe("filtro de patrocinador", () => {
  it("lê sponsors[] — o campo que a API realmente devolve", () => {
    // `i.sponsorIds` não existe em `items`: `[].includes(...)` era sempre
    // falso, então escolher QUALQUER patrocinador zerava a tela inteira.
    const idx = eventCycleDayIndex([evento({ id: "ev1" })]);
    const items = [
      item({ id: "com", status: "delivered", sponsors: [{ id: "sp1", name: "Alfa" }] }),
      item({ id: "sem", status: "delivered", sponsors: [{ id: "sp2", name: "Beta" }] }),
    ];
    const f = filterItems(items, idx, { window: null, eventFilter: "all", sponsorFilter: "sp1" });
    expect(f.map((i) => i.id)).toEqual(["com"]);
  });

  it("sem nenhum filtro devolve a MESMA lista, sem alocar outra", () => {
    const idx = eventCycleDayIndex([evento({ id: "ev1" })]);
    const items = [item({ status: "delivered" })];
    expect(filterItems(items, idx, { window: null, eventFilter: "all", sponsorFilter: "all" })).toBe(items);
  });
});

describe("período de abertura — a tela precisa chegar respondendo", () => {
  // A tela abria em "Todo o período" e, como "todo o período" não tem janela
  // anterior, os quatro KPIs abriam dizendo "Escolha um período para comparar".
  // O padrão só é legítimo se ENTREGAR a comparação — por isso o teste prende
  // a regra das duas janelas, não o valor "30d".
  const agora = new Date("2026-08-14T15:00:00.000Z").getTime();
  const hoje = businessDayMs(agora);
  const diaIso = (atras: number) => new Date(hoje - atras * DIA).toISOString();

  const cenario = (saidas: number[], status = "delivered") => {
    const events = saidas.map((d, i) => evento({ id: `ev${i}`, truckDepartureDate: diaIso(d) }));
    const items = saidas.map((_, i) => item({ id: `it${i}`, eventId: `ev${i}`, status }));
    return { idx: eventCycleDayIndex(events), items };
  };

  it("abre em 30 dias quando há ciclo fechado nas DUAS janelas", () => {
    const { idx, items } = cenario([5, 40]);
    expect(pickDefaultPeriod(items, idx, agora)).toBe("30d");
  });

  it("alarga para o trimestre quando os 30 dias não têm anterior comparável", () => {
    // Com peça só na janela atual, a comparação sairia "Sem base nos dois
    // períodos" — o padrão não teria resolvido nada.
    const { idx, items } = cenario([5, 100]);
    expect(pickDefaultPeriod(items, idx, agora)).toBe("90d");
  });

  it("devolve 'all' quando nenhum candidato compara — e a tela volta a dizer isso", () => {
    const { idx, items } = cenario([5]);
    expect(pickDefaultPeriod(items, idx, agora)).toBe("all");
  });

  it("canceladas não sustentam um período padrão", () => {
    // São as mesmas peças que já ficam fora de todo denominador da tela: abrir
    // num recorte sustentado só por elas mostraria KPIs zerados.
    const { idx, items } = cenario([5, 40], "canceled");
    expect(pickDefaultPeriod(items, idx, agora)).toBe("all");
  });

  it("evento sem data de saída válida não entra na conta", () => {
    const events = [evento({ id: "ev0", truckDepartureDate: null })];
    const items = [item({ id: "it0", eventId: "ev0", status: "delivered" })];
    expect(pickDefaultPeriod(items, eventCycleDayIndex(events), agora)).toBe("all");
  });

  it("base vazia abre em 'all' em vez de num recorte sem nada dentro", () => {
    expect(pickDefaultPeriod([], new Map(), agora)).toBe("all");
  });
});
