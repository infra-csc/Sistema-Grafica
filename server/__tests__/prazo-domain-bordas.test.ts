// Bordas do DOMÍNIO da Gestão de Prazos — o que `prazo-domain.test.ts` ainda
// não fecha.
//
// PORQUÊ um segundo arquivo em vez de crescer o primeiro: aquele testa a regra
// com `today` SEMPRE injetado à mão, o que é ótimo para determinismo mas deixa
// de fora justamente o caminho que causou o bug mais caro da tela — o que passa
// por `todayBusinessStr()`/`todayBusinessMs()` lendo o relógio de verdade. Aqui
// o relógio do processo é congelado e a âncora é exercida de ponta a ponta.
//
// Os outros blocos cobrem bordas cujo teste existente afirma a regra de forma
// TAUTOLÓGICA (recalculando a mesma expressão do código no `expect`) ou que
// simplesmente não tinham caso:
//   • cobertura de status medida contra `client/src/lib/status.ts` (a fonte
//     única da casa) e não só contra `ITEM_STATUSES` — o mapa do cliente tem
//     grafias legadas em pt que o schema não lista;
//   • `pecasEmAtraso` com números LITERAIS e negativa explícita da soma;
//   • `holder`/dias do patrocinador no ciclo reprovar→reenviar;
//   • varredura completa da régua de `riskCritical` (0,1,2 dias × 3 dias).
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  buildEventPrazo,
  daysSince,
  spDayMs,
  todayBusinessMs,
  todayBusinessStr,
  STAGE_DEFS,
  STATUS_STAGE_RANK,
  DELIVERED,
  OUT_OF_FUNNEL,
  type DomainApproval,
  type DomainEvent,
  type DomainItem,
} from "../services/prazo-domain";
import type { PrazoEvent } from "@shared/prazos-contract";

const DIA_MS = 86400000;
const dia = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

// Calendário de referência (conferido): 2026-08-30 é DOMINGO, 2026-08-13 é
// QUINTA, 2026-08-12 é QUARTA, 2026-08-15 é SÁBADO, 2026-07-19 é DOMINGO.
// Todos os offsets abaixo foram escolhidos para cair no dia da semana que o
// teste precisa — mudar a data-base quebra os marcos de propósito.
const SAIDA_DOMINGO = "2026-08-30T00:00:00.000Z";

function evento(over: Partial<DomainEvent> = {}): DomainEvent {
  return {
    id: "ev-1",
    name: "COPA NORTE DE ATLETISMO — ETAPA 2",
    status: "created",
    priority: null,
    startDate: "2026-09-05T00:00:00.000Z",
    truckDepartureDate: SAIDA_DOMINGO,
    createdBy: null,
    ...over,
  };
}

let seq = 0;
function peca(over: Partial<DomainItem> = {}): DomainItem {
  seq += 1;
  return {
    id: `it-${seq}`,
    displayId: `#10${seq}`,
    status: "draft",
    type: "2x1",
    description: null,
    quantity: 1,
    updatedAt: null,
    createdAt: null,
    ...over,
  };
}

function montar(ev: DomainEvent, itens: DomainItem[], today = dia("2026-08-13")): PrazoEvent {
  const r = buildEventPrazo(ev, itens, { today });
  expect(r).not.toBeNull();
  return r as PrazoEvent;
}

// ─────────────────────────────────────────────────────────────────────────────
// T2 — a âncora lendo o RELÓGIO DE VERDADE, não um `today` injetado.
//
// O bug histórico: entre 21h e 23h59 de Brasília o dia UTC já virou. Com a
// âncora antiga (dia UTC do servidor), uma etapa que vence HOJE aparecia como
// "vencida há 1d" — e é exatamente nesse horário que o diretor confere a
// pendência de véspera. Congelamos o processo às 00h30 UTC de 14/08 para não
// depender de o CI rodar de madrugada.
// ─────────────────────────────────────────────────────────────────────────────
describe("T2 — âncora de fuso lida do relógio do processo (21h de Brasília)", () => {
  // 2026-08-13T00:30:00Z = 12/08/2026 21h30 em São Paulo (UTC-3).
  const RELOGIO = new Date("2026-08-13T00:30:00.000Z");

  beforeAll(() => {
    // Só o Date é falsificado: setTimeout/setInterval seguem reais, para não
    // travar await de outros módulos carregados no mesmo processo.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(RELOGIO);
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("às 21h30 de Brasília o dia de NEGÓCIO ainda é 12/08, embora em UTC já seja 13/08", () => {
    // A prova de que os dois relógios discordam — é essa discordância que
    // produzia o "vencida há 1d" fantasma.
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-08-13");
    expect(todayBusinessStr()).toBe("2026-08-12");
    expect(todayBusinessMs()).toBe(dia("2026-08-12"));
  });

  it("etapa com marco em 12/08 fica com diffDays 0 (vence HOJE), não -1", () => {
    // Saída 30/08 (domingo) com offset -18 → 12/08, que é QUARTA: nenhum
    // ajuste de fim de semana entra na conta e o marco fica exatamente no dia
    // de negócio corrente.
    const ev = buildEventPrazo(
      evento({ deadlineListaImagens: -18 }),
      [peca({ status: "draft" })],
      { today: todayBusinessMs() },
    )!;

    expect(ev.stages[0].deadline).toBe("2026-08-12");
    expect(ev.stages[0].diffDays).toBe(0);
    // Vence hoje = "warning" (o dia ainda é do time). Nunca "overdue".
    expect(ev.stages[0].state).toBe("warning");

    // E a régua do bug: com a âncora INGÊNUA (dia UTC do servidor), a mesma
    // etapa daria -1 e pintaria de vermelho um prazo que ainda está em curso.
    const ancoraIngenua = dia(new Date().toISOString().slice(0, 10));
    const diffIngenuo = Math.round((dia("2026-08-12") - ancoraIngenua) / DIA_MS);
    expect(diffIngenuo).toBe(-1);
    expect(ev.stages[0].diffDays).not.toBe(diffIngenuo);
  });

  it("a virada do dia de negócio acontece à meia-noite de Brasília, não à de Greenwich", () => {
    expect(spDayMs(new Date("2026-08-13T02:59:59.000Z"))).toBe(dia("2026-08-12"));
    expect(spDayMs(new Date("2026-08-13T03:00:00.000Z"))).toBe(dia("2026-08-13"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T4 — cobertura de status medida contra a FONTE ÚNICA da casa.
//
// `prazo-domain.test.ts` já varre `ITEM_STATUSES` (@shared/schema). Este teste
// varre `client/src/lib/status.ts`, que é o vocabulário que a UI realmente
// conhece e que contém grafias legadas em pt (`liberado`, `em_producao`,
// `produzido`, `entregue`, `pronto_para_producao`) ausentes do schema. Foi por
// um status vivo fora do mapa que peças legadas sumiam do funil e a etapa
// virava verde falso.
// ─────────────────────────────────────────────────────────────────────────────
describe("T4 — nenhum status de peça VIVA fica fora do funil", () => {
  // `STATUS` mistura status de PEÇA e de EVENTO no mesmo mapa (o badge é o
  // mesmo componente). Só estes três são de evento — qualquer outro nome novo
  // que apareça ali é peça e tem que estar classificado.
  // "closed" = encerramento MANUAL do evento (POST /api/events/:id/close);
  // nenhuma peça usa esse status.
  const STATUS_DE_EVENTO = new Set(["created", "completed", "closed"]);

  it("todo status de client/src/lib/status.ts está no funil, entregue ou fora do funil", async () => {
    const { STATUS } = await import("@/lib/status");
    const orfaos = Object.keys(STATUS).filter(
      (s) =>
        !STATUS_DE_EVENTO.has(s) &&
        STATUS_STAGE_RANK[s] === undefined &&
        !DELIVERED.has(s) &&
        !OUT_OF_FUNNEL.has(s),
    );
    // Falha com o NOME do status novo na mensagem: quem adicionar um status na
    // UI sem classificá-lo aqui descobre no CI, não pela peça sumindo do
    // painel do diretor.
    expect(orfaos, `status sem classificação no funil de prazos: ${orfaos.join(", ")}`).toEqual([]);
  });

  it("as três classificações são mutuamente exclusivas", async () => {
    const { STATUS } = await import("@/lib/status");
    for (const s of Object.keys(STATUS)) {
      const em = [
        STATUS_STAGE_RANK[s] !== undefined,
        DELIVERED.has(s),
        OUT_OF_FUNNEL.has(s),
      ].filter(Boolean).length;
      // 0 só é aceitável para status de evento; 2+ significaria que a mesma
      // peça é contada como pendente E como entregue.
      expect(em, `status "${s}" classificado ${em} vezes`).toBeLessThanOrEqual(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T5 — grafias legadas em pt exercidas pelo COMPORTAMENTO, não pelo mapa.
// ─────────────────────────────────────────────────────────────────────────────
describe("T5 — grafias legadas em pt não produzem verde falso", () => {
  it("peças em 'pronto_para_producao'/'liberado'/'em_producao'/'produzido' seguram a Produção Gráfica", () => {
    const legados = ["pronto_para_producao", "liberado", "em_producao", "produzido"];
    for (const status of legados) {
      const ev = montar(evento(), [peca({ status })]);
      const producao = ev.stages.at(-1)!;
      expect(producao.directCount, `status ${status}`).toBe(1);
      expect(producao.pendingCount, `status ${status}`).toBe(1);
      expect(producao.state, `status ${status}`).not.toBe("done");
      // E a peça aparece no drill — sem isso o diretor não teria o que cobrar.
      expect(ev.pendingItems.map((it) => it.status)).toEqual([status]);
      expect(ev.pendingItems[0].stageIndex).toBe(STAGE_DEFS.length - 1);
    }
  });

  it("'entregue' vale tanto quanto 'delivered' para tirar o evento da gestão", () => {
    // A cancelada é filtrada ANTES do `allDelivered`, então o evento fica com
    // uma única peça viva — e ela está entregue. Sai do payload, exatamente
    // como sairia com a grafia inglesa. Se a grafia legada não contasse como
    // entregue, este evento ficaria eternamente "atrasado" na tela do diretor.
    expect(buildEventPrazo(evento(), [peca({ status: "entregue" }), peca({ status: "canceled" })], {
      today: dia("2026-08-13"),
    })).toBeNull();
    expect(buildEventPrazo(evento(), [peca({ status: "delivered" })], {
      today: dia("2026-08-13"),
    })).toBeNull();
  });

  it("'entregue' não é contada como pendência quando o evento ainda tem peça viva", () => {
    const ev = montar(evento(), [peca({ status: "entregue" }), peca({ status: "draft" })]);
    expect(ev.totalItems).toBe(2);
    expect(ev.deliveredItems).toBe(1);
    // A entregue NÃO aparece no drill e NÃO engorda o gate: TODAS as etapas
    // seguram por causa da draft, e o contador é 1 — não 2.
    expect(ev.pendingItems.map((it) => it.status)).toEqual(["draft"]);
    expect(ev.stages.map((s) => s.pendingCount)).toEqual(STAGE_DEFS.map(() => 1));
    expect(ev.stages.every((s) => s.state !== "done")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T9 — peças fora do funil não entram em NENHUMA contagem.
// ─────────────────────────────────────────────────────────────────────────────
describe("T9 — canceladas/excluídas/arquivadas são invisíveis para o placar", () => {
  it("não entram em totalItems, pendingCount nem deliveredItems", () => {
    const ev = montar(evento(), [
      peca({ status: "canceled" }),
      peca({ status: "deleted" }),
      peca({ status: "archived" }),
      peca({ status: "draft" }),
      peca({ status: "delivered" }),
    ]);
    expect(ev.totalItems).toBe(2);          // só a draft e a delivered
    expect(ev.deliveredItems).toBe(1);
    expect(ev.stages.at(-1)!.pendingCount).toBe(1);
    expect(ev.pendingItems).toHaveLength(1);
    expect(ev.pendingItems[0].status).toBe("draft");
  });

  it("evento SÓ com peças fora do funil é 'semPecas', não 'tudo entregue'", () => {
    // Guard sutil: `allDelivered` roda sobre a lista JÁ filtrada. Se as
    // canceladas contassem, o evento sairia do payload — e um evento cujas
    // peças foram todas canceladas às vésperas da saída é caso de cobrança,
    // não de arquivo.
    const ev = montar(evento(), [peca({ status: "canceled" }), peca({ status: "archived" })]);
    expect(ev.categoria).toBe("semPecas");
    expect(ev.totalItems).toBe(0);
    expect(ev.stages.every((s) => s.state === "upcoming")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T10 — régua completa do risco projetado (0,1,2 acende; 3 não).
// ─────────────────────────────────────────────────────────────────────────────
describe("T10 — riskCritical: a régua inteira, não só um ponto", () => {
  // A etapa de Produção Gráfica é `allDays` (não ajusta fim de semana), então
  // o marco cai exatamente no dia calculado — é a única forma de varrer
  // 0/1/2/3 dias sem que sábado/domingo desloquem a conta.
  function comMarcoEm(diasAFrente: number, quantasPecas: number): PrazoEvent {
    const offset = -17 + diasAFrente; // saída 30/08 − 17 = 13/08 = hoje
    const itens = Array.from({ length: quantasPecas }, () => peca({ status: "approved" }));
    return montar(evento({ deadlineProducaoGrafica: offset }), itens);
  }

  it("acende com marco a 0, 1 ou 2 dias e 10+ peças no gate", () => {
    for (const dias of [0, 1, 2]) {
      const ev = comMarcoEm(dias, 10);
      expect(ev.stages.at(-1)!.diffDays, `marco a ${dias} dias`).toBe(dias);
      expect(ev.riskCritical, `marco a ${dias} dias com 10 peças`).toBe(true);
    }
  });

  it("NÃO acende com marco a 3 dias — a régua é 0..2", () => {
    const ev = comMarcoEm(3, 30);
    expect(ev.stages.at(-1)!.diffDays).toBe(3);
    expect(ev.stages.at(-1)!.state).toBe("warning"); // ainda é amarelo, só não é grito
    expect(ev.riskCritical).toBe(false);
  });

  it("NÃO acende com 9 peças, mesmo com o marco vencendo hoje", () => {
    const ev = comMarcoEm(0, 9);
    expect(ev.stages.at(-1)!.pendingCount).toBe(9);
    expect(ev.riskCritical).toBe(false);
  });

  it("NÃO acende com data inválida, mesmo com 30 peças", () => {
    const itens = Array.from({ length: 30 }, () => peca({ status: "approved" }));
    const ev = montar(evento({ truckDepartureDate: "0206-08-30T00:00:00.000Z" }), itens);
    expect(ev.invalidDate).toBe(true);
    expect(ev.riskCritical).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T11 — `pecasEmAtraso` é a etapa vencida MAIS AVANÇADA, com números literais.
//
// O teste existente afirma isso recalculando a MESMA expressão do código
// (`vencidas[vencidas.length-1].pendingCount`) — se o código trocasse para a
// soma, o `expect` trocaria junto e o teste continuaria verde. Aqui os números
// são literais e a soma é negada explicitamente.
// ─────────────────────────────────────────────────────────────────────────────
describe("T11 — pecasEmAtraso não é a soma das etapas vencidas", () => {
  // 2 peças presas na etapa 0 e 3 na etapa 1.
  // Marcos (saída 30/08 domingo): etapa 0 com offset -41 → 20/07 (segunda),
  // 24 dias vencida; etapa 1 no default -20 → 10/08 (segunda), 3 dias vencida.
  // As etapas 2..4 ainda não venceram.
  function eventoComDuasVencidas(): PrazoEvent {
    const itens = [
      peca({ status: "draft" }), peca({ status: "draft" }),
      peca({ status: "awaiting_submission" }),
      peca({ status: "awaiting_submission" }),
      peca({ status: "awaiting_submission" }),
    ];
    return montar(evento({ deadlineListaImagens: -41 }), itens);
  }

  it("com duas etapas vencidas, vale o pendingCount da mais avançada", () => {
    const ev = eventoComDuasVencidas();

    expect(ev.stages[0].deadline).toBe("2026-07-20");
    expect(ev.stages[0].diffDays).toBe(-24);
    expect(ev.stages[0].state).toBe("overdue");
    expect(ev.stages[0].pendingCount).toBe(2);

    expect(ev.stages[1].deadline).toBe("2026-08-10");
    expect(ev.stages[1].diffDays).toBe(-3);
    expect(ev.stages[1].state).toBe("overdue");
    expect(ev.stages[1].pendingCount).toBe(5); // acumulada: 2 da etapa 0 + 3 daqui

    expect(ev.stages.slice(2).every((s) => s.state !== "overdue")).toBe(true);

    // A regra: a parcela do evento no placar é 5 (a acumulada da etapa 1),
    // NUNCA 2+5=7 — as 2 peças da etapa 0 já estão contadas dentro das 5.
    expect(ev.pecasEmAtraso).toBe(5);
    expect(ev.pecasEmAtraso).not.toBe(7);
  });

  it("piorAtrasoDias é o atraso da etapa vencida há MAIS tempo (24, não 3)", () => {
    expect(eventoComDuasVencidas().piorAtrasoDias).toBe(24);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T12 — `piorAtrasoDias` com números literais e a chave de desempate.
// ─────────────────────────────────────────────────────────────────────────────
describe("T12 — piorAtrasoDias e as chaves de ordenação", () => {
  /**
   * Evento com EXATAMENTE duas etapas vencidas: a de Aprovação há 3 dias e a
   * de Produção Gráfica há 25. A peça em `awaiting_approval` deixa as etapas 0
   * e 1 concluídas; o offset de produção (-42 → 19/07, domingo, mas a etapa é
   * `allDays` e não desloca) crava o atraso de 25 dias.
   */
  function evento3e25(id = "e-25"): PrazoEvent {
    return montar(
      evento({ id, deadlineAprovacaoLayout: -20, deadlineProducaoGrafica: -42 }),
      [peca({ status: "awaiting_approval" })],
    );
  }

  it("vale o MAIOR atraso entre as etapas vencidas (25, não 3)", () => {
    const ev = evento3e25();
    const vencidas = ev.stages.filter((s) => s.state === "overdue");
    expect(vencidas.map((s) => s.diffDays)).toEqual([-3, -25]);
    expect(ev.piorAtrasoDias).toBe(25);
  });

  it("sem etapa vencida, piorAtrasoDias é 0", () => {
    const ev = montar(evento({ truckDepartureDate: "2026-12-20T00:00:00.000Z" }), [peca({ status: "draft" })]);
    expect(ev.stages.some((s) => s.state === "overdue")).toBe(false);
    expect(ev.piorAtrasoDias).toBe(0);
  });

  it("o par (piorAtrasoDias desc, saída asc) ordena pior-primeiro e desempata pela saída mais próxima", () => {
    // NOTA DE ESCOPO: o comparador em si vive inline num useMemo de
    // `client/src/pages/gestao-prazos.tsx` (ordem === "atraso") e não é
    // exportado — não dá para importá-lo num teste de ambiente `node`. O que
    // este teste congela é o CONTRATO que o comparador consome: que o servidor
    // entrega `piorAtrasoDias` e `truckDepartureDate` com valores suficientes
    // para produzir a ordem certa. Se o servidor parar de calcular o pior
    // atraso, a ordenação da tela quebra aqui e não em produção.
    const pior = evento3e25("pior");         // piorAtrasoDias 25
    const medio = montar(                      // piorAtrasoDias 10
      evento({ id: "medio", deadlineListaImagens: -27 }),
      [peca({ status: "draft" })],
    );
    // Dois sem atraso nenhum, com saídas diferentes — testam o desempate.
    const semAtrasoLonge = montar(
      evento({ id: "longe", truckDepartureDate: "2026-12-20T00:00:00.000Z" }), [peca({ status: "draft" })],
    );
    const semAtrasoPerto = montar(
      evento({ id: "perto", truckDepartureDate: "2026-11-10T00:00:00.000Z" }), [peca({ status: "draft" })],
    );

    // O "médio" tem a etapa 0 vencida há 10 dias (03/08, segunda) e a etapa 1
    // vencida há 3 — o pior continua sendo 10.
    expect(medio.stages[0].deadline).toBe("2026-08-03");
    expect(medio.piorAtrasoDias).toBe(10);
    expect(semAtrasoLonge.piorAtrasoDias).toBe(0);
    expect(semAtrasoPerto.piorAtrasoDias).toBe(0);

    const ordenados = [semAtrasoLonge, medio, semAtrasoPerto, pior].sort(
      (a, b) =>
        b.piorAtrasoDias - a.piorAtrasoDias ||
        new Date(a.truckDepartureDate).getTime() - new Date(b.truckDepartureDate).getTime(),
    );
    expect(ordenados.map((e) => e.id)).toEqual(["pior", "medio", "perto", "longe"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T13 — `daysSince` com piso 0.
// ─────────────────────────────────────────────────────────────────────────────
describe("T13 — daysSince nunca devolve negativo", () => {
  const hoje = dia("2026-08-13");

  it("timestamp no futuro vira 0 (relógio de máquina adiantado ou gravação em outro fuso)", () => {
    expect(daysSince(new Date("2026-08-14T12:00:00.000Z"), hoje)).toBe(0);
    expect(daysSince(new Date("2027-01-01T00:00:00.000Z"), hoje)).toBe(0);
    expect(daysSince("2026-08-13T23:59:00.000Z", hoje)).toBe(0);
  });

  it("o piso 0 chega até `waitingDays` do drill (é lá que viraria 'parada há -1d')", () => {
    const ev = montar(evento(), [peca({ status: "draft", statusChangedAt: new Date("2026-08-30T00:00:00.000Z") })]);
    expect(ev.pendingItems[0].waitingDays).toBe(0);
    expect(ev.piorEsperaDias).toBe(0);
  });

  it("SEM CARIMBO DE ETAPA a espera é null — não 0, que diria 'andou hoje'", () => {
    // Mudou de propósito. A espera passou a sair de `statusChangedAt`, e a
    // peça anterior a essa coluna não tem como saber há quanto tempo está
    // parada. Zero seria a pior resposta possível: é a afirmação de que ela
    // acabou de andar, dita justamente sobre a peça mais antiga do banco.
    const ev = montar(evento(), [peca({ status: "draft", updatedAt: null, createdAt: null })]);
    expect(ev.pendingItems[0].waitingDays).toBeNull();
  });

  it("e `updatedAt` recente NÃO ressuscita a espera — era daí que vinha a mentira", () => {
    // O caso de campo: peça parada em "Aguardando Envio" desde 7 de agosto,
    // tocada hoje por uma escrita que nem gera linha no histórico. A tela
    // dizia "hoje"; agora cala, porque não sabe.
    const ev = montar(evento(), [peca({ status: "draft", updatedAt: new Date("2026-08-13T12:00:00.000Z") })]);
    expect(ev.pendingItems[0].waitingDays).toBeNull();
  });

  it("com carimbo, conta do carimbo e ignora `updatedAt`", () => {
    const ev = montar(evento(), [peca({
      status: "draft",
      statusChangedAt: new Date("2026-08-04T12:00:00.000Z"),
      updatedAt: new Date("2026-08-13T12:00:00.000Z"),
    })]);
    expect(ev.pendingItems[0].waitingDays).toBe(9);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T14 — aprovações: quem está com a bola e há quantos dias.
//
// O ponto caro: `updatedAt ?? createdAt`. O ciclo reprovar→reenviar só bumpa
// `updatedAt`; contar de `createdAt` cobraria o patrocinador por dias em que a
// bola estava com a Arte — e a cobrança é feita por telefone, com nome e
// sobrenome. Um número errado aqui é uma ligação injusta.
// ─────────────────────────────────────────────────────────────────────────────
describe("T14 — holder, dias e ranking de patrocinadores", () => {
  const hoje = dia("2026-08-13");
  // MEIO-DIA UTC de propósito: `daysSince` converte o instante para o dia de
  // NEGÓCIO (America/Sao_Paulo), e meia-noite UTC é 21h do dia ANTERIOR em
  // Brasília. Datar um registro com "T00:00Z" e esperar o dia da string é
  // errar por um dia — a mesma armadilha que a âncora existe para eliminar.
  const meioDia = (d: string) => new Date(`${d}T12:00:00.000Z`);
  const NOMES = new Map([
    ["sp-pending", "Coca-Cola"],
    ["sp-nova", "Ambev"],
    ["sp-arte", "Itaú"],
    ["sp-legado", "Vivo"],
  ]);

  function comAprovacoes(aprovacoes: DomainApproval[]) {
    const cobrados: { sponsorId: string; days: number; itemId: string; displayId: string }[] = [];
    const item = peca({ id: "it-apr", displayId: "#777", status: "awaiting_approval" });
    const ev = buildEventPrazo(evento(), [item], {
      today: hoje,
      sponsorNameById: NOMES,
      openApprovalsByItem: new Map([["it-apr", aprovacoes]]),
      onSponsorHolding: (i) =>
        cobrados.push({ sponsorId: i.sponsorId, days: i.days, itemId: i.itemId, displayId: i.displayId }),
    })!;
    return { ev, cobrados };
  }

  it("'pending' e 'new_version_pending' põem a bola com o PATROCINADOR e entram no ranking", () => {
    const { ev, cobrados } = comAprovacoes([
      { sponsorId: "sp-pending", status: "pending", createdAt: meioDia("2026-08-06") },
      { sponsorId: "sp-nova", status: "new_version_pending", createdAt: meioDia("2026-08-11") },
    ]);
    expect(ev.pendingItems[0].sponsors?.map((s) => s.holder)).toEqual(["sponsor", "sponsor"]);
    expect(cobrados.map((c) => c.sponsorId)).toEqual(["sp-pending", "sp-nova"]);
    // O ranking recebe o suficiente para o diretor cobrar a PEÇA, não só o
    // patrocinador: a linha expansível cita o displayId.
    expect(cobrados[0]).toMatchObject({ days: 7, itemId: "it-apr", displayId: "#777" });
  });

  it("'awaiting_arte' e 'rejected' põem a bola com a ARTE — e o patrocinador NÃO é cobrado", () => {
    const { ev, cobrados } = comAprovacoes([
      { sponsorId: "sp-arte", status: "awaiting_arte", createdAt: meioDia("2026-08-01") },
      { sponsorId: "sp-legado", status: "rejected", createdAt: meioDia("2026-08-01") },
    ]);
    // Aparecem no drill (o "—" sem explicação parecia dado quebrado)…
    expect(ev.pendingItems[0].sponsors).toEqual([
      { name: "Itaú", days: 12, holder: "arte" },
      { name: "Vivo", days: 12, holder: "arte" },
    ]);
    // …mas ninguém entra no ranking de quem está segurando aprovação.
    expect(cobrados).toEqual([]);
  });

  it("os dias vêm de updatedAt (o registro sobrevive ao ciclo reprovar→reenviar)", () => {
    // Registro criado há 24 dias, mas REENVIADO há 3: o patrocinador só está
    // com a bola há 3 dias. Cobrar 24 seria factualmente falso.
    const { ev, cobrados } = comAprovacoes([{
      sponsorId: "sp-pending",
      status: "pending",
      createdAt: meioDia("2026-07-20"),
      updatedAt: meioDia("2026-08-10"),
    }]);
    expect(ev.pendingItems[0].sponsors?.[0].days).toBe(3);
    expect(ev.pendingItems[0].sponsors?.[0].days).not.toBe(24);
    expect(cobrados[0].days).toBe(3);
  });

  it("sem updatedAt, cai para createdAt (registro recém-criado)", () => {
    const { ev } = comAprovacoes([{
      sponsorId: "sp-pending", status: "pending",
      createdAt: meioDia("2026-08-08"), updatedAt: null,
    }]);
    expect(ev.pendingItems[0].sponsors?.[0].days).toBe(5);
  });

  it("só peça AGUARDANDO APROVAÇÃO carrega `sponsors` — as outras nem consultam o mapa", () => {
    const chamou: string[] = [];
    const ev = buildEventPrazo(evento(), [peca({ id: "it-z", status: "draft" })], {
      today: hoje,
      openApprovalsByItem: new Map([["it-z", [{ sponsorId: "sp-pending", status: "pending" }]]]),
      onSponsorHolding: (i) => chamou.push(i.sponsorId),
    })!;
    expect(ev.pendingItems[0].sponsors).toBeUndefined();
    expect(chamou).toEqual([]);
  });
});
