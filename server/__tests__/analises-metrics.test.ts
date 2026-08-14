// Regra pura da tela de Análises. A tela tinha ZERO teste — e dois dos seus
// blocos liam campos que não existem no banco, o que só apareceu quando alguém
// abriu o schema ao lado. Cada bloco abaixo prende um desses defeitos.
import { describe, expect, it } from "vitest";
import { spDayMs } from "../services/prazo-domain";
import {
  businessDayMs, computeAlerts, computeByType, computeDonut, computeKpis,
  computeMonthly, computeTopSponsors, cycleWindow, eventCycleDayIndex, eventDayMs,
  filterEvents, filterItems, fmtSaidaEm, monthKeyOf, monthKeysEndingAt, qtyOf,
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
    createdAt: over.createdAt ?? new Date(2026, 5, 10),
    updatedAt: over.updatedAt ?? new Date(2026, 5, 10),
    deliveredAt: over.deliveredAt ?? null,
    sponsors: over.sponsors ?? [],
  };
}

function evento(over: Partial<AnaliseEvent> & { id: string }): AnaliseEvent {
  return {
    id: over.id,
    name: over.name ?? `Evento ${over.id}`,
    priority: over.priority ?? null,
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
    expect(monthKeyOf("lixo")).toBeNull();
  });

  it("monthKeysEndingAt devolve 6 meses terminando no mês de referência", () => {
    const keys = monthKeysEndingAt(new Date(2026, 0, 15).getTime(), 6);
    expect(keys).toEqual(["2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01"]);
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
    const f = filterItems(items, idx, { window: cycleWindow("7d", agora), eventFilter: "all", statusFilter: "all", sponsorFilter: "all" });
    expect(f.map((i) => i.id)).toEqual(["b"]);
  });
});

describe("filtro de patrocinador", () => {
  it("lê sponsors[] — o campo que a API realmente devolve", () => {
    // `i.sponsorIds` não existe em `items`: `[].includes(...)` era sempre
    // false e escolher QUALQUER patrocinador zerava a tela inteira.
    const items = [
      item({ id: "a", status: "delivered", sponsors: [{ id: "s1", name: "Alfa" }] }),
      item({ id: "b", status: "delivered", sponsors: [{ id: "s2", name: "Beta" }] }),
      item({ id: "c", status: "delivered", sponsors: [] }),
    ];
    const idx = new Map<string, number | null>();
    const f = filterItems(items, idx, { window: null, eventFilter: "all", statusFilter: "all", sponsorFilter: "s1" });
    expect(f.map((i) => i.id)).toEqual(["a"]);
  });

  it("ranking de patrocinadores deixa de sair sempre vazio", () => {
    const items = [
      item({ status: "delivered", quantity: 10, sponsors: [{ id: "s1" }, { id: "s2" }] }),
      item({ status: "inProduction", quantity: 5, sponsors: [{ id: "s2" }] }),
      item({ status: "canceled", quantity: 100, sponsors: [{ id: "s1" }] }),
    ];
    const top = computeTopSponsors(items, [{ id: "s1", name: "Alfa" }, { id: "s2", name: "Beta" }]);
    expect(top).toEqual([
      { id: "s2", name: "Beta", qty: 15 },
      { id: "s1", name: "Alfa", qty: 10 },
    ]);
  });
});

describe("KPIs sobre o funil canônico", () => {
  it("conta a grafia legada 'entregue' como entregue", () => {
    const k = computeKpis([
      item({ status: "entregue", quantity: 200 }),
      item({ status: "requested", quantity: 100 }),
    ]);
    expect(k.deliveredQty).toBe(200);
    expect(k.totalQty).toBe(300);
    expect(k.deliveryRate).toBeCloseTo(66.667, 2);
  });

  it("não conta cancelada/excluída nem como pendência nem como total", () => {
    const k = computeKpis([
      item({ status: "delivered", quantity: 50 }),
      item({ status: "canceled", quantity: 950 }),
      item({ status: "deleted", quantity: 5 }),
    ]);
    expect(k.totalQty).toBe(50);
    expect(k.outOfFunnelQty).toBe(955);
    expect(k.deliveryRate).toBe(100);
  });

  it("'Em Produção' e 'Aprovadas ou Além' usam a mesma definição da rosca", () => {
    const k = computeKpis([
      item({ status: "conferred", quantity: 3 }),
      item({ status: "ready_for_production", quantity: 2 }),
      item({ status: "awaiting_approval", quantity: 5 }),
    ]);
    expect(k.inProdQty).toBe(5);           // conferred + ready_for_production
    expect(k.approvedOrBeyondQty).toBe(5);
    expect(k.approvalRate).toBe(50);
  });

  it("base vazia não divide por zero", () => {
    const k = computeKpis([]);
    expect(k).toMatchObject({ totalQty: 0, deliveryRate: 0, approvalRate: 0, inProdRate: 0 });
  });

  it("quantity ausente vale 1", () => {
    expect(qtyOf({ quantity: null })).toBe(1);
    expect(qtyOf({ quantity: 0 })).toBe(1);
    expect(qtyOf({ quantity: 7 })).toBe(7);
  });
});

describe("rosca", () => {
  it("separa aprovação de produção e não deixa legado cair em 'Outros'", () => {
    const d = computeDonut([
      item({ status: "awaiting_approval", quantity: 40 }),
      item({ status: "approved", quantity: 30 }),
      item({ status: "em_producao", quantity: 20 }),
      item({ status: "entregue", quantity: 10 }),
    ]);
    const porChave = Object.fromEntries(d.map((s) => [s.key, s.qty]));
    expect(porChave).toEqual({ aprovacao: 40, producao: 50, entregue: 10 });
    expect(d.some((s) => s.key === "outros")).toBe(false);
  });

  it("status desconhecido vira 'Outros' com piso de 1%", () => {
    const d = computeDonut([
      item({ status: "delivered", quantity: 999 }),
      item({ status: "status_do_futuro", quantity: 1 }),
    ]);
    const outros = d.find((s) => s.key === "outros")!;
    expect(outros.qty).toBe(1);
    expect(outros.pct).toBe(1);
  });

  it("sem peças no funil devolve lista vazia", () => {
    expect(computeDonut([])).toEqual([]);
    expect(computeDonut([item({ status: "canceled", quantity: 9 })])).toEqual([]);
  });
});

describe("série mensal", () => {
  it("soma criação e entrega no mês certo, numa passada", () => {
    const keys = monthKeysEndingAt(new Date(2026, 7, 14).getTime(), 6);
    const pontos = computeMonthly([
      item({ status: "delivered", quantity: 4, createdAt: new Date(2026, 5, 2), deliveredAt: new Date(2026, 6, 9) }),
      item({ status: "requested", quantity: 3, createdAt: new Date(2026, 7, 1) }),
      // Fora da janela de 6 meses: não aparece em lugar nenhum.
      item({ status: "delivered", quantity: 99, createdAt: new Date(2024, 0, 1), deliveredAt: new Date(2024, 0, 5) }),
    ], keys);
    const por = Object.fromEntries(pontos.map((p) => [p.key, p]));
    expect(por["2026-06"]).toMatchObject({ producao: 4, entregas: 0 });
    expect(por["2026-07"]).toMatchObject({ producao: 0, entregas: 4 });
    expect(por["2026-08"]).toMatchObject({ producao: 3, entregas: 0 });
    expect(pontos).toHaveLength(6);
  });

  it("'entregue' legado também entra na série de entregas", () => {
    const keys = monthKeysEndingAt(new Date(2026, 7, 14).getTime(), 6);
    const pontos = computeMonthly([
      item({ status: "entregue", quantity: 7, createdAt: new Date(2026, 7, 1), deliveredAt: new Date(2026, 7, 3) }),
    ], keys);
    expect(pontos.find((p) => p.key === "2026-08")!.entregas).toBe(7);
  });
});

describe("por tipo de peça", () => {
  it("agrupa por tipo, ignora fora do funil e ordena por volume", () => {
    const linhas = computeByType([
      item({ status: "delivered", type: "Lona", quantity: 10 }),
      item({ status: "requested", type: "Lona", quantity: 10 }),
      item({ status: "entregue",  type: " Banner ", quantity: 5 }),
      item({ status: "canceled",  type: "Banner", quantity: 500 }),
      item({ status: "requested", type: null, quantity: 1 }),
    ]);
    expect(linhas.map((l) => [l.type, l.total, l.delivered, l.rate])).toEqual([
      ["Lona", 20, 10, 50],
      ["Banner", 5, 5, 100],
      ["Sem tipo", 1, 0, 0],
    ]);
  });
});

describe("Central Operacional", () => {
  const agora = new Date("2026-08-14T12:00:00.000Z").getTime();

  it("a urgência sai de priority === 'urgente', não de status === 'urgent'", () => {
    // "urgent" aparecia UMA vez em todo o repositório: nesta comparação.
    // Nenhuma rota grava esse valor — o alerta jamais disparou.
    const events = [
      evento({ id: "e1", name: "Copa", priority: "urgente", truckDepartureDate: "2026-12-01T00:00:00.000Z" }),
      evento({ id: "e2", name: "Outro", priority: "alta", truckDepartureDate: "2026-12-01T00:00:00.000Z" }),
    ];
    const a = computeAlerts({ events, items: [], nowMs: agora });
    expect(a[0]).toMatchObject({ tag: "URGENTE", eventId: "e1", ignoraFiltros: true });
    expect(a[0].title).toContain("Copa");
  });

  it("declara quantos eventos urgentes ficaram de fora", () => {
    const events = ["a", "b", "c"].map((id) =>
      evento({ id, priority: "urgente", truckDepartureDate: "2026-12-01T00:00:00.000Z" }));
    const a = computeAlerts({ events, items: [], nowMs: agora });
    expect(a[0].desc).toContain("mais 2");
  });

  it("o alerta de decisão pendente cobre revisão interna e usa horas reais", () => {
    const items = [
      item({ status: "awaiting_sponsor_approval", quantity: 4, updatedAt: new Date(agora - 30 * 3_600_000) }),
      item({ status: "in_review", quantity: 6, updatedAt: new Date(agora - 48 * 3_600_000) }),
      // Movimentada há 2h: não conta.
      item({ status: "awaiting_approval", quantity: 99, updatedAt: new Date(agora - 2 * 3_600_000) }),
    ];
    const a = computeAlerts({ events: [], items, nowMs: agora });
    expect(a[0].tag).toBe("APROVAÇÃO PENDENTE");
    expect(a[0].title).toContain("10");
  });

  it("'aguardando gráfica' inclui a grafia legada pronto_para_producao", () => {
    const items = [
      item({ status: "ready_for_production", quantity: 2 }),
      item({ status: "pronto_para_producao", quantity: 3 }),
    ];
    const a = computeAlerts({ events: [], items, nowMs: agora });
    expect(a[0].tag).toBe("PRODUÇÃO");
    expect(a[0].title).toContain("5");
  });

  it("saída iminente fala em dias e ignora data absurda", () => {
    const events = [
      evento({ id: "ok", name: "Night Run", truckDepartureDate: new Date(agora + 60 * 3_600_000).toISOString() }),
      evento({ id: "absurdo", name: "Typo", truckDepartureDate: "20205-01-01T00:00:00.000Z" }),
      evento({ id: "longe", name: "Longe", truckDepartureDate: new Date(agora + 400 * 3_600_000).toISOString() }),
    ];
    const a = computeAlerts({ events, items: [], nowMs: agora });
    const saida = a.find((x) => x.tag === "SAÍDA IMINENTE")!;
    expect(saida.title).toContain("em 3 dias");
    expect(saida.eventId).toBe("ok");
  });

  it("fmtSaidaEm troca 71h por dias", () => {
    expect(fmtSaidaEm(8)).toBe("em 8h");
    expect(fmtSaidaEm(71)).toBe("em 3 dias");
    expect(fmtSaidaEm(25)).toBe("em 1 dia");
  });

  it("corta em 4 alertas", () => {
    const events = [
      evento({ id: "u", priority: "urgente", truckDepartureDate: new Date(agora + 10 * 3_600_000).toISOString() }),
    ];
    const items = [
      item({ status: "awaiting_approval", updatedAt: new Date(agora - 72 * 3_600_000) }),
      item({ status: "ready_for_production" }),
    ];
    expect(computeAlerts({ events, items, nowMs: agora }).length).toBeLessThanOrEqual(4);
  });

  it("sem nada a reportar devolve lista vazia", () => {
    expect(computeAlerts({ events: [], items: [], nowMs: agora })).toEqual([]);
  });
});
