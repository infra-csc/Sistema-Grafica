// EVENTO REALIZADO — a regra do dono (14/08): "eventos finalizados, ou seja que
// passou o dia, não contam mais para prazos e no app". Sobre a âncora, quando
// perguntado se era a saída do caminhão: "saída do caminhão não, e sim a DATA
// DO EVENTO". E o recorte de alcance, logo depois: "evento passado some de tudo
// NÃO. Ele tem que ficar de registro no app em algumas telas, mas não em tela
// de ações e nem de gestão."
//
// O QUE ESTE ARQUIVO PROTEGE (as três coisas que ninguém percebe quebrando):
//   1. A ÂNCORA. É `events.startDate`, não `truckDepartureDate`. O caminhão sai
//      DIAS ANTES do evento; ancorar nele apagaria da fila a peça que ainda dá
//      tempo de produzir.
//   2. A VIRADA DO DIA. "Passou o dia" é DEPOIS do fim do dia do evento, no
//      fuso America/São_Paulo. Durante o dia do evento a peça ainda conta — e
//      às 21h da véspera (00h UTC do dia seguinte) nada pode sumir.
//   3. EVENTO SEM DATA DE INÍCIO (existe no banco) NUNCA é finalizado pela
//      data. Sem âncora não há "passou", e sumir por falta de cadastro seria
//      esconder justamente o evento mais mal cadastrado. Mesma decisão para a
//      data com ano absurdo ("0206" no lugar de "2026"): é cadastro a corrigir,
//      não evento a apagar.
//
// A quarta coisa protegida é o AVISO: nada some em silêncio, e a frase precisa
// distinguir as duas origens — "encerrado" tem volta (reabrir o evento),
// "realizado" não tem.
//
// QUEM AINDA USA O AVISO (17/08): só Arte, Atendimento e Vincular
// Patrocinadores. A Gráfica e a Revisão Final voltaram a MOSTRAR essas peças —
// as ações que a guarda do servidor permite (conferir, entregar, excluir) moram
// nelas, e esconder tornava impossível executá-las. Lá o sinal é um selo na
// linha, não um aviso de ausência; ver evento-finalizado-telas.test.ts.
import { describe, it, expect } from "vitest";
import {
  motivoEventoFinalizado,
  isEventoFinalizado,
  eventDayMs,
  spDayMs,
  EVENT_CLOSED_STATUS,
} from "@shared/prazo-dates";
import { isPrazoCandidate, type DomainEvent } from "../services/prazo-domain";
import { avisoPecasOcultas, isEventoEncerrado, marcoEventoFinalizado } from "@/lib/status";

const dia = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

const HOJE = dia("2026-08-14");

/** Evento mínimo do domínio de prazos — a saída do caminhão é ANTES do início. */
const evento = (over: Partial<DomainEvent> = {}): DomainEvent => ({
  id: "ev-1",
  name: "Corrida da Cidade",
  status: "created",
  startDate: "2026-08-20T00:00:00.000Z",
  truckDepartureDate: "2026-08-18T00:00:00.000Z",
  ...over,
});

// ─────────────────────────────────────────────────────────────────────────────
describe("motivoEventoFinalizado — a âncora é a DATA DO EVENTO", () => {
  it("evento com data futura ainda conta", () => {
    expect(motivoEventoFinalizado({ startDate: "2026-08-20" }, HOJE)).toBeNull();
    expect(isEventoFinalizado({ startDate: "2026-08-20" }, HOJE)).toBe(false);
  });

  it("NO DIA do evento ele ainda conta — a regra é 'passou o dia', não 'chegou o dia'", () => {
    expect(motivoEventoFinalizado({ startDate: "2026-08-14" }, HOJE)).toBeNull();
  });

  it("no dia SEGUINTE ao evento ele está realizado", () => {
    expect(motivoEventoFinalizado({ startDate: "2026-08-13" }, HOJE)).toBe("realizado");
    expect(isEventoFinalizado({ startDate: "2026-08-13" }, HOJE)).toBe(true);
  });

  it("a âncora NÃO é a saída do caminhão: caminhão que já saiu não finaliza o evento", () => {
    // Saída 12/08 (passada), evento 20/08 (futuro). É o caso normal da semana
    // de produção: ancorar na saída apagaria a fila inteira da Gráfica.
    const ev = { startDate: "2026-08-20", truckDepartureDate: "2026-08-12" };
    expect(motivoEventoFinalizado(ev, HOJE)).toBeNull();
  });

  it("aceita Date e string, com hora ou sem", () => {
    expect(motivoEventoFinalizado({ startDate: new Date("2026-08-13T00:00:00.000Z") }, HOJE)).toBe("realizado");
    expect(motivoEventoFinalizado({ startDate: "2026-08-13T23:59:00.000Z" }, HOJE)).toBe("realizado");
    expect(motivoEventoFinalizado({ startDate: "2026-08-14T23:59:00.000Z" }, HOJE)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("as DUAS origens ficam distinguíveis", () => {
  it("encerramento manual devolve 'encerrado', não 'realizado'", () => {
    expect(motivoEventoFinalizado({ status: EVENT_CLOSED_STATUS, startDate: "2026-08-20" }, HOJE))
      .toBe("encerrado");
  });

  it("evento enriquecido (/api/events) é lido por `manuallyClosed`", () => {
    expect(motivoEventoFinalizado({ status: "created", manuallyClosed: true, startDate: "2026-08-20" }, HOJE))
      .toBe("encerrado");
  });

  it("encerrado À MÃO e com a data passada continua 'encerrado'", () => {
    // A decisão de uma pessoa é a explicação mais informativa das duas — e é a
    // única com volta. Se virasse "realizado", a tela deixaria de oferecer
    // "reabrir o evento" para o caso em que reabrir é exatamente o remédio.
    expect(motivoEventoFinalizado({ status: EVENT_CLOSED_STATUS, startDate: "2026-08-01" }, HOJE))
      .toBe("encerrado");
  });

  it("evento vivo não é nem um nem outro", () => {
    expect(motivoEventoFinalizado({ status: "created", startDate: "2026-08-20" }, HOJE)).toBeNull();
    expect(motivoEventoFinalizado(null, HOJE)).toBeNull();
    expect(motivoEventoFinalizado(undefined, HOJE)).toBeNull();
    expect(motivoEventoFinalizado({}, HOJE)).toBeNull();
  });

  it("`isEventoEncerrado` continua estreito — o Calendário depende disso", () => {
    // O Calendário não pode perder o passado: lá o evento realizado permanece
    // desenhado no mês. Só o encerramento manual muda o visual dele.
    expect(isEventoEncerrado({ status: EVENT_CLOSED_STATUS })).toBe(true);
    expect(isEventoEncerrado({ status: "created" })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("evento SEM data de início — decisão explícita", () => {
  it("sem startDate NUNCA é finalizado pela data", () => {
    expect(motivoEventoFinalizado({ status: "created" }, HOJE)).toBeNull();
    expect(motivoEventoFinalizado({ status: "created", startDate: null }, HOJE)).toBeNull();
    expect(motivoEventoFinalizado({ status: "created", startDate: "" }, HOJE)).toBeNull();
    expect(isEventoFinalizado({ startDate: undefined }, HOJE)).toBe(false);
  });

  it("sem startDate MAS encerrado à mão continua saindo — o motivo é o outro", () => {
    expect(motivoEventoFinalizado({ status: EVENT_CLOSED_STATUS, startDate: null }, HOJE))
      .toBe("encerrado");
  });

  it("data impossível de ler não vira 'realizado'", () => {
    expect(motivoEventoFinalizado({ startDate: "não é data" }, HOJE)).toBeNull();
  });

  it("ano absurdo ('0206' por '2026') é cadastro a corrigir, não evento a apagar", () => {
    // 0206 está 1.800 anos no passado: uma comparação ingênua responderia "já
    // passou" e o typo APAGARIA o evento das filas em vez de aparecer.
    expect(eventDayMs("0206-08-20")).toBeNull();
    expect(motivoEventoFinalizado({ startDate: "0206-08-20" }, HOJE)).toBeNull();
    expect(eventDayMs("2026-08-20")).toBe(dia("2026-08-20"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("virada do dia em America/São_Paulo", () => {
  // O bug clássico desta base: comparar o instante bruto contra um timestamp
  // gravado à meia-noite UTC faz o dia "virar" às 21h de Brasília da véspera —
  // três horas em que a fila esvazia sozinha, justamente no fim do expediente.

  it("às 21h do dia do evento a peça AINDA está na fila", () => {
    // 21/08 00:30Z = 20/08 21:30 em São Paulo. Evento é dia 20 → ainda hoje.
    const hoje = spDayMs(new Date("2026-08-21T00:30:00.000Z"));
    expect(motivoEventoFinalizado({ startDate: "2026-08-20" }, hoje)).toBeNull();
  });

  it("às 23h59 do dia do evento ainda está na fila", () => {
    const hoje = spDayMs(new Date("2026-08-21T02:59:00.000Z")); // 20/08 23:59 SP
    expect(motivoEventoFinalizado({ startDate: "2026-08-20" }, hoje)).toBeNull();
  });

  it("à meia-noite de Brasília do dia seguinte ela sai", () => {
    const hoje = spDayMs(new Date("2026-08-21T03:00:00.000Z")); // 21/08 00:00 SP
    expect(motivoEventoFinalizado({ startDate: "2026-08-20" }, hoje)).toBe("realizado");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Gestão de Prazos — o gate do servidor usa o MESMO predicado", () => {
  it("evento que acontece HOJE continua sendo cobrado", () => {
    expect(isPrazoCandidate(evento({ startDate: "2026-08-14" }), HOJE)).toBe(true);
  });

  it("evento de ontem sai da Gestão de Prazos", () => {
    expect(isPrazoCandidate(evento({ startDate: "2026-08-13" }), HOJE)).toBe(false);
  });

  it("evento futuro com o caminhão JÁ SAÍDO continua sendo cobrado", () => {
    // É o coração da tela: caminhão atrasado com peça pendente é exatamente o
    // que a Gestão de Prazos existe para gritar. Ancorar na saída mataria isso.
    const ev = evento({ startDate: "2026-08-20", truckDepartureDate: "2026-08-10" });
    expect(isPrazoCandidate(ev, HOJE)).toBe(true);
  });

  it("evento encerrado à mão sai mesmo com data futura", () => {
    expect(isPrazoCandidate(evento({ status: EVENT_CLOSED_STATUS }), HOJE)).toBe(false);
  });

  it("evento com tudo entregue ('completed') continua fora", () => {
    expect(isPrazoCandidate(evento({ status: "completed" }), HOJE)).toBe(false);
  });

  it("evento sem data de início continua na cobrança", () => {
    const semData = evento({ startDate: null as unknown as string });
    expect(isPrazoCandidate(semData, HOJE)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("nada some em silêncio — a frase do aviso", () => {
  it("sem peças escondidas não há aviso nenhum", () => {
    expect(avisoPecasOcultas({ encerrado: 0, realizado: 0 }, "desta fila")).toBeNull();
  });

  it("só encerradas: oferece o caminho de volta (reabrir)", () => {
    const a = avisoPecasOcultas({ encerrado: 3, realizado: 0 }, "desta fila")!;
    expect(a.destaque).toBe("3 peças");
    expect(a.texto).toContain("evento foi encerrado");
    expect(a.texto).toContain("reabrir o evento");
    expect(a.texto).not.toContain("realizado");
  });

  it("só realizadas: NÃO promete reabrir — não há volta", () => {
    const a = avisoPecasOcultas({ encerrado: 0, realizado: 2 }, "destas abas")!;
    expect(a.destaque).toBe("2 peças");
    expect(a.texto).toContain("destas abas");
    expect(a.texto).toContain("já foi realizado");
    expect(a.texto).not.toContain("reabrir");
  });

  it("as duas origens juntas: cada número com o seu motivo", () => {
    const a = avisoPecasOcultas({ encerrado: 1, realizado: 4 }, "desta tela")!;
    expect(a.destaque).toBe("5 peças");
    expect(a.texto).toContain("1 porque o evento foi encerrado");
    expect(a.texto).toContain("4 porque o evento já foi realizado");
  });

  it("concordância no singular", () => {
    const a = avisoPecasOcultas({ encerrado: 0, realizado: 1 }, "desta fila")!;
    expect(a.destaque).toBe("1 peça");
    expect(a.texto.startsWith("está fora desta fila")).toBe(true);
    expect(a.texto).toContain("Ela continua");
  });

  it("sempre diz ONDE a peça continua — esconder não é apagar", () => {
    for (const c of [{ encerrado: 2, realizado: 0 }, { encerrado: 0, realizado: 2 }, { encerrado: 1, realizado: 1 }]) {
      expect(avisoPecasOcultas(c, "desta fila")!.texto).toContain("Detalhe do Evento");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O MARCO NA TRILHA DA PEÇA — pedido do dono (14/08), olhando a aba Histórico
// do Atendimento: "no app onde tem algum histórico, tem que colocar que o
// evento foi encerrado".
//
// O QUE ESTE BLOCO PROTEGE:
//   1. A PALAVRA. O rótulo aparece dentro da história de uma PEÇA e precisa
//      dizer EVENTO — sem isso a leitura vira "a peça foi encerrada", que é
//      falso: a peça continua existindo, com o mesmo status.
//   2. A DATA QUE NÃO EXISTE. Não há coluna `closedAt`/`closedBy` em events; o
//      autor e a hora do encerramento vivem só no audit log, que não viaja com
//      a peça. O marco de encerramento tem de sair SEM data — o dia em que
//      alguém "resolver" preenchê-la com `updatedAt` é o dia em que a trilha
//      passa a mentir, e é aqui que isso quebra.
//   3. A DATA QUE EXISTE. No "realizado" a data É o fato (events.startDate), e
//      ela sai como dia-calendário "YYYY-MM-DD" — nunca um Date de meia-noite
//      UTC, que renderiza a VÉSPERA em qualquer fuso a oeste de Greenwich.
describe("marco de fim na trilha da peça", () => {
  it("evento em jogo não ganha marco nenhum", () => {
    expect(marcoEventoFinalizado(evento(), HOJE)).toBeNull();
  });

  it("encerrado: fala de EVENTO, tem volta, e NÃO inventa data", () => {
    const m = marcoEventoFinalizado(evento({ status: EVENT_CLOSED_STATUS }), HOJE)!;
    expect(m.motivo).toBe("encerrado");
    expect(m.label).toBe("Evento encerrado");
    expect(m.dataEventoISO).toBeNull();
    expect(m.hint).toContain("Histórico geral");
    expect(m.hint).toContain("reabrir");
  });

  it("realizado: mostra a data do evento e NÃO promete reabrir", () => {
    const m = marcoEventoFinalizado(evento({ startDate: "2026-08-12T00:00:00.000Z" }), HOJE)!;
    expect(m.motivo).toBe("realizado");
    expect(m.label).toBe("Evento realizado");
    expect(m.dataEventoISO).toBe("2026-08-12");
    expect(m.hint).not.toContain("reabrir");
  });

  it("o rótulo sempre começa em 'Evento' — nunca deixa parecer que a PEÇA acabou", () => {
    for (const ev of [evento({ status: EVENT_CLOSED_STATUS }), evento({ startDate: "2026-08-12" })]) {
      const m = marcoEventoFinalizado(ev, HOJE)!;
      expect(m.label.startsWith("Evento ")).toBe(true);
      expect(m.label.toLowerCase()).not.toContain("peça");
    }
  });

  it("encerrado à mão vence a data — o marco é o do humano, mesmo com o dia já passado", () => {
    const m = marcoEventoFinalizado(
      evento({ status: EVENT_CLOSED_STATUS, startDate: "2026-08-01" }), HOJE,
    )!;
    expect(m.motivo).toBe("encerrado");
    expect(m.dataEventoISO).toBeNull();
  });

  it("durante o DIA do evento ainda não há marco (mesma virada de dia das filas)", () => {
    expect(marcoEventoFinalizado(evento({ startDate: "2026-08-14" }), HOJE)).toBeNull();
  });

  it("nenhuma cor de texto proibida (#f97316 / #a8a29e) sai deste marco", () => {
    for (const ev of [evento({ status: EVENT_CLOSED_STATUS }), evento({ startDate: "2026-08-12" })]) {
      const m = marcoEventoFinalizado(ev, HOJE)!;
      expect(["#f97316", "#a8a29e"]).not.toContain(m.text);
    }
  });
});
