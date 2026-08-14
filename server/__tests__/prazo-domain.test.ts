// Testes do DOMÍNIO da Gestão de Prazos.
//
// PORQUÊ: a regra de negócio inteira do produto (funil de 5 etapas, pendência
// acumulada, âncora de fuso, categoria do evento, placar) não tinha uma linha
// de teste — e três dos achados críticos da revisão profunda são exatamente o
// tipo de borda que um punhado de teste puro pega antes do usuário.
//
// Nenhum teste depende do relógio real: `today` é sempre passado explicitamente
// (a única exceção é o teste da âncora de fuso, que injeta um Date fixo).
import { describe, it, expect } from "vitest";
import { ITEM_STATUSES } from "@shared/schema";
import {
  STAGE_DEFS,
  STATUS_STAGE_RANK,
  DELIVERED,
  OUT_OF_FUNNEL,
  buildEventPrazo,
  computeKpis,
  isPrazoCandidate,
  spDayMs,
  stageDeadline,
  truckDayUTC,
  daysSince,
  businessDayStrToMs,
  type DomainEvent,
  type DomainItem,
} from "../services/prazo-domain";
import type { PrazoEvent } from "@shared/prazos-contract";

const DIA = 86400000;
const dia = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

// Saída num domingo (2026-08-30) exercita o ajuste de fim de semana nas 4
// primeiras etapas; a Produção Gráfica (allDays) fica fora do ajuste.
function evento(over: Partial<DomainEvent> = {}): DomainEvent {
  return {
    id: "ev-1",
    name: "COPA BRASIL DE HANDEBOL — ETAPA 1",
    status: "created",
    priority: null,
    startDate: "2026-09-05T00:00:00.000Z",
    truckDepartureDate: "2026-08-30T00:00:00.000Z",
    createdBy: null,
    ...over,
  };
}

let seq = 0;
function peca(over: Partial<DomainItem> = {}): DomainItem {
  seq += 1;
  return {
    id: `it-${seq}`,
    displayId: `#00${seq}`,
    status: "draft",
    type: "2x1",
    description: null,
    quantity: 1,
    updatedAt: null,
    createdAt: null,
    ...over,
  };
}

/** buildEventPrazo com `today` fixo, garantindo não-nulo (o teste falha se sair). */
function montar(ev: DomainEvent, itens: DomainItem[], today = dia("2026-08-13")): PrazoEvent {
  const r = buildEventPrazo(ev, itens, { today });
  expect(r).not.toBeNull();
  return r as PrazoEvent;
}

// ─────────────────────────────────────────────────────────────────────────────
describe("âncora de 'hoje' em America/Sao_Paulo", () => {
  it("às 21h de Brasília ainda é o MESMO dia (o bug que a âncora corrigiu)", () => {
    // 2026-08-14T00:30Z = 2026-08-13 21:30 em São Paulo (UTC-3).
    expect(spDayMs(new Date("2026-08-14T00:30:00.000Z"))).toBe(dia("2026-08-13"));
    // 2026-08-14T02:59Z = 2026-08-13 23:59 em São Paulo — ainda dia 13.
    expect(spDayMs(new Date("2026-08-14T02:59:00.000Z"))).toBe(dia("2026-08-13"));
    // 2026-08-14T03:01Z = 2026-08-14 00:01 em São Paulo — aí sim virou.
    expect(spDayMs(new Date("2026-08-14T03:01:00.000Z"))).toBe(dia("2026-08-14"));
  });

  it("daysSince nunca é negativo e conta dias-calendário", () => {
    const hoje = dia("2026-08-13");
    expect(daysSince(new Date("2026-08-10T12:00:00.000Z"), hoje)).toBe(3);
    expect(daysSince(null, hoje)).toBe(0);
    // Timestamp no futuro (relógio torto) vira 0, não um número negativo que
    // pintaria "parada há -2 dias".
    expect(daysSince(new Date("2026-08-20T12:00:00.000Z"), hoje)).toBe(0);
  });

  it("businessDayStrToMs casa com a âncora de dia", () => {
    expect(businessDayStrToMs("2026-08-13")).toBe(dia("2026-08-13"));
  });
});

describe("marcos e ajuste de fim de semana", () => {
  const saidaDomingo = truckDayUTC("2026-08-30T00:00:00.000Z"); // domingo

  it("sábado anda para sexta e domingo anda para segunda", () => {
    // 2026-08-15 é sábado → 2026-08-14 (sexta).
    expect(stageDeadline(truckDayUTC("2026-08-16T00:00:00.000Z"), -1, false).toISOString().slice(0, 10))
      .toBe("2026-08-14");
    // 2026-08-16 é domingo → 2026-08-17 (segunda).
    expect(stageDeadline(truckDayUTC("2026-08-17T00:00:00.000Z"), -1, false).toISOString().slice(0, 10))
      .toBe("2026-08-17");
  });

  it("Produção Gráfica (allDays) NÃO ajusta fim de semana", () => {
    // Saída domingo 2026-08-30, offset -1 → sábado 2026-08-29, e fica.
    expect(stageDeadline(saidaDomingo, -1, true).toISOString().slice(0, 10)).toBe("2026-08-29");
  });

  it("offset do evento sobrepõe o default da etapa", () => {
    const ev = montar(evento({ deadlineListaImagens: -40 }), [peca({ status: "draft" })]);
    // 2026-08-30 − 40 = 2026-07-21 (terça, sem ajuste).
    expect(ev.stages[0].deadline).toBe("2026-07-21");
  });

  it("offset 0 do evento é respeitado (não cai no default por falsy)", () => {
    const ev = montar(evento({ deadlineListaImagens: 0 }), [peca({ status: "draft" })]);
    // Saída domingo → ajusta para segunda 2026-08-31.
    expect(ev.stages[0].deadline).toBe("2026-08-31");
  });
});

describe("cobertura do funil por status", () => {
  it("todo ITEM_STATUSES está no funil, entregue ou fora do funil — nenhum some", () => {
    const orfaos = ITEM_STATUSES.filter(
      (s) => STATUS_STAGE_RANK[s] === undefined && !DELIVERED.has(s) && !OUT_OF_FUNNEL.has(s),
    );
    expect(orfaos).toEqual([]);
  });

  it("os status legados em pt continuam mapeados na Produção Gráfica", () => {
    const producaoIdx = STAGE_DEFS.length - 1;
    for (const legado of ["pronto_para_producao", "liberado", "em_producao", "produzido"]) {
      expect(STATUS_STAGE_RANK[legado]).toBe(producaoIdx);
    }
  });

  it("'entregue' (grafia legada) conta como pronta, não como pendente", () => {
    const ev = montar(evento(), [peca({ status: "entregue" }), peca({ status: "draft" })]);
    expect(ev.totalItems).toBe(2);
    expect(ev.deliveredItems).toBe(1);
    expect(ev.pendingItems).toHaveLength(1);
  });

  it("cancelada/excluída/arquivada não conta como total nem como pendência", () => {
    const ev = montar(evento(), [
      peca({ status: "canceled" }), peca({ status: "archived" }), peca({ status: "draft" }),
    ]);
    expect(ev.totalItems).toBe(1);
    expect(ev.pendingItems).toHaveLength(1);
  });
});

describe("pendência ACUMULADA — o gate que impede o falso verde", () => {
  it("uma peça travada na etapa 0 mantém TODAS as etapas pendentes", () => {
    const ev = montar(evento(), [peca({ status: "draft" })]);
    expect(ev.stages.map((s) => s.pendingCount)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(ev.stages.map((s) => s.directCount)).toEqual([1, 0, 0, 0, 0, 0]);
    expect(ev.stages.every((s) => s.state !== "done")).toBe(true);
  });

  it("etapa anterior limpa fica 'done'; a da peça e as seguintes, não", () => {
    // Peça em "awaiting_approval" = etapa 2. As etapas 0 e 1 estão limpas.
    const ev = montar(evento(), [peca({ status: "awaiting_approval" })]);
    expect(ev.stages.map((s) => s.pendingCount)).toEqual([0, 0, 1, 1, 1, 1]);
    expect(ev.stages[0].state).toBe("done");
    expect(ev.stages[1].state).toBe("done");
    expect(ev.stages[2].state).not.toBe("done");
  });

  it("39 peças na produção e 1 esquecida no rascunho travam TUDO desde a etapa 0", () => {
    const itens = [peca({ status: "draft" })];
    for (let i = 0; i < 39; i++) itens.push(peca({ status: "approved" }));
    const ev = montar(evento(), itens);
    expect(ev.stages[0].pendingCount).toBe(1);
    expect(ev.stages[0].directCount).toBe(1);
    expect(ev.stages.at(-1)!.pendingCount).toBe(40);
  });
});

describe("categoria — classificação única e exclusiva", () => {
  it("evento SEM PEÇAS é 'semPecas', nunca 'emDia', e não tem etapa vencida", () => {
    // Saída daqui a 17 dias: os marcos -25/-20/-12 já passaram. Antes isto
    // pintava verde e ia parar na última coluna do funil.
    const ev = montar(evento(), []);
    expect(ev.categoria).toBe("semPecas");
    expect(ev.totalItems).toBe(0);
    expect(ev.stages.every((s) => s.state === "upcoming")).toBe(true);
    expect(ev.pecasEmAtraso).toBe(0);
  });

  it("'semPecas' tem precedência sobre data inválida", () => {
    const ev = montar(evento({ truckDepartureDate: "0206-08-30T00:00:00.000Z" }), []);
    expect(ev.invalidDate).toBe(true);
    expect(ev.categoria).toBe("semPecas");
  });

  it("data de saída com ano absurdo vira 'dataInvalida', sem atraso calculado", () => {
    const ev = montar(evento({ truckDepartureDate: "0206-08-30T00:00:00.000Z" }), [peca({ status: "draft" })]);
    expect(ev.invalidDate).toBe(true);
    expect(ev.categoria).toBe("dataInvalida");
    expect(ev.stages.every((s) => s.state !== "overdue")).toBe(true);
    expect(ev.diasParaSaida).toBeNull();
  });

  it("etapa vencida com peça no gate vira 'atrasado'", () => {
    const ev = montar(evento(), [peca({ status: "draft" })]);
    expect(ev.stages.some((s) => s.state === "overdue")).toBe(true);
    expect(ev.categoria).toBe("atrasado");
  });

  it("tudo dentro do prazo vira 'emDia'", () => {
    // Saída bem distante: nenhum marco venceu ainda.
    const ev = montar(evento({ truckDepartureDate: "2026-12-20T00:00:00.000Z" }), [peca({ status: "draft" })]);
    expect(ev.categoria).toBe("emDia");
  });
});

describe("campos derivados por evento", () => {
  it("diasParaSaida usa a âncora do negócio e é null quando a data é inválida", () => {
    expect(montar(evento(), [peca()]).diasParaSaida).toBe(17); // 13/08 → 30/08
    expect(montar(evento({ truckDepartureDate: "0206-08-30T00:00:00.000Z" }), [peca()]).diasParaSaida).toBeNull();
  });

  it("piorAtrasoDias é o |menor diffDays| entre as etapas vencidas", () => {
    const ev = montar(evento(), [peca({ status: "draft" })]);
    const vencidas = ev.stages.filter((s) => s.state === "overdue");
    expect(vencidas.length).toBeGreaterThan(0);
    expect(ev.piorAtrasoDias).toBe(Math.abs(Math.min(...vencidas.map((s) => s.diffDays))));
    expect(ev.piorAtrasoDias).toBeGreaterThan(0);
  });

  it("piorAtrasoDias é 0 quando não há etapa vencida", () => {
    expect(montar(evento({ truckDepartureDate: "2026-12-20T00:00:00.000Z" }), [peca()]).piorAtrasoDias).toBe(0);
  });

  it("pecasEmAtraso é a pendência da etapa vencida MAIS AVANÇADA", () => {
    const itens = [peca({ status: "draft" }), peca({ status: "awaiting_approval" })];
    const ev = montar(evento(), itens);
    const vencidas = ev.stages.filter((s) => s.state === "overdue");
    expect(ev.pecasEmAtraso).toBe(vencidas[vencidas.length - 1].pendingCount);
  });

  it("piorEsperaDias é o maior waitingDays entre as pendentes", () => {
    const ev = montar(evento(), [
      peca({ status: "draft", updatedAt: new Date("2026-08-10T12:00:00.000Z") }),
      peca({ status: "draft", updatedAt: new Date("2026-08-04T12:00:00.000Z") }),
    ]);
    expect(ev.piorEsperaDias).toBe(9);
  });

  it("solicitante vem do Map de usuários (nunca N+1) e cai para null sem vínculo", () => {
    const users = new Map([["u-1", "Ana Paula"]]);
    const comDono = buildEventPrazo(evento({ createdBy: "u-1" }), [peca()], {
      today: dia("2026-08-13"), userNameById: users,
    });
    expect(comDono?.solicitante).toBe("Ana Paula");
    const semDono = buildEventPrazo(evento({ createdBy: "u-removido" }), [peca()], {
      today: dia("2026-08-13"), userNameById: users,
    });
    expect(semDono?.solicitante).toBeNull();
  });

  it("datas saem como ISO string, não como Date", () => {
    const ev = montar(evento(), [peca()]);
    expect(typeof ev.truckDepartureDate).toBe("string");
    expect(ev.truckDepartureDate).toBe("2026-08-30T00:00:00.000Z");
  });
});

describe("saída da gestão de prazos", () => {
  const hoje = dia("2026-08-13");

  it("evento concluído sai", () => {
    expect(buildEventPrazo(evento({ status: "completed" }), [peca()], { today: hoje })).toBeNull();
    expect(isPrazoCandidate(evento({ status: "completed" }), hoje)).toBe(false);
  });

  // O evento ENCERRADO à mão é o caso que a outra condição NÃO cobre: aqui a
  // saída ainda está no futuro (05/09 contra hoje 13/08) e há peça em aberto —
  // sem a cláusula de "closed" ele seguiria sendo cobrado toda semana por um
  // trabalho que um admin já decidiu que ninguém mais vai fazer.
  it("evento ENCERRADO à mão sai, mesmo com a saída ainda no futuro", () => {
    const encerrado = evento({ status: "closed" });

    expect(isPrazoCandidate(encerrado, hoje)).toBe(false);
    expect(buildEventPrazo(encerrado, [peca()], { today: hoje })).toBeNull();
    // Controle: o MESMO evento sem o encerramento continua sendo cobrado.
    expect(isPrazoCandidate(evento(), hoje)).toBe(true);
  });

  it("evento com TUDO entregue sai — mas só se tiver alguma peça", () => {
    expect(buildEventPrazo(evento(), [peca({ status: "delivered" })], { today: hoje })).toBeNull();
    // Zero peças NÃO é "tudo entregue": esse é justamente o caso que a tela
    // escondia. Ele continua no payload, agora como "semPecas".
    expect(buildEventPrazo(evento(), [], { today: hoje })).not.toBeNull();
  });

  it("evento já começado sai, comparando DIA-calendário (não o instante)", () => {
    // Começa hoje: ainda aparece (o dia não passou).
    expect(isPrazoCandidate(evento({ startDate: "2026-08-13T00:00:00.000Z" }), hoje)).toBe(true);
    // Começou ontem: é história.
    expect(isPrazoCandidate(evento({ startDate: "2026-08-12T00:00:00.000Z" }), hoje)).toBe(false);
  });
});

describe("risco projetado", () => {
  it("marco a até 2 dias com 10+ peças no gate acende o alarme", () => {
    // Saída 2026-08-25; marco de produção (-1, allDays) em 24/08. Usamos um
    // offset explícito para deixar o marco de layouts a 2 dias de hoje.
    const itens = Array.from({ length: 10 }, () => peca({ status: "awaiting_submission" }));
    const ev = montar(evento({ truckDepartureDate: "2026-08-25T00:00:00.000Z", deadlineEntregaLayouts: -10 }), itens);
    expect(ev.riskCritical).toBe(true);
  });

  it("com 9 peças NÃO acende (a régua é 10+)", () => {
    const itens = Array.from({ length: 9 }, () => peca({ status: "awaiting_submission" }));
    const ev = montar(evento({ truckDepartureDate: "2026-08-25T00:00:00.000Z", deadlineEntregaLayouts: -10 }), itens);
    expect(ev.riskCritical).toBe(false);
  });

  it("data inválida nunca acende risco (não há prazo confiável a projetar)", () => {
    const itens = Array.from({ length: 30 }, () => peca({ status: "awaiting_submission" }));
    const ev = montar(evento({ truckDepartureDate: "0206-08-25T00:00:00.000Z" }), itens);
    expect(ev.riskCritical).toBe(false);
  });
});

describe("agregado de patrocinadores", () => {
  it("só chama onSponsorHolding quando a bola está com o PATROCINADOR", () => {
    const chamadas: string[] = [];
    buildEventPrazo(evento(), [peca({ id: "it-x", status: "awaiting_approval" })], {
      today: dia("2026-08-13"),
      sponsorNameById: new Map([["sp-1", "Coca-Cola"], ["sp-2", "Ambev"]]),
      openApprovalsByItem: new Map([["it-x", [
        { sponsorId: "sp-1", status: "pending", createdAt: new Date("2026-08-02T00:00:00.000Z") },
        { sponsorId: "sp-2", status: "rejected", createdAt: new Date("2026-08-02T00:00:00.000Z") },
      ]]]),
      onSponsorHolding: (i) => chamadas.push(i.sponsorId),
    });
    expect(chamadas).toEqual(["sp-1"]);
  });

  it("patrocinador removido não quebra o drill", () => {
    const ev = montar(evento(), [peca({ id: "it-y", status: "awaiting_approval" })]);
    const comAprovacao = buildEventPrazo(evento(), [peca({ id: "it-y", status: "awaiting_approval" })], {
      today: dia("2026-08-13"),
      openApprovalsByItem: new Map([["it-y", [{ sponsorId: "sumiu", status: "pending" }]]]),
    });
    expect(ev.pendingItems[0].sponsors).toEqual([]);
    expect(comAprovacao?.pendingItems[0].sponsors?.[0].name).toBe("Patrocinador removido");
  });
});

describe("computeKpis", () => {
  const hoje = dia("2026-08-13");

  function cenario(): PrazoEvent[] {
    return [
      // atrasado
      montar(evento({ id: "a" }), [peca({ status: "draft" })]),
      // em dia
      montar(evento({ id: "b", truckDepartureDate: "2026-12-20T00:00:00.000Z" }), [peca({ status: "draft" })]),
      // sem peças
      montar(evento({ id: "c" }), []),
      // data inválida
      montar(evento({ id: "d", truckDepartureDate: "0206-08-30T00:00:00.000Z" }), [peca({ status: "draft" })]),
      // sem peças E data inválida — o caso que fazia emDia ficar NEGATIVO
      montar(evento({ id: "e", truckDepartureDate: "0206-08-30T00:00:00.000Z" }), []),
    ];
  }

  it("as quatro categorias somam exatamente o total de eventos", () => {
    const evs = cenario();
    const k = computeKpis(evs);
    expect(k.atrasados + k.semPecas + k.invalidCount + k.emDia).toBe(evs.length);
  });

  it("evento sem peças E com data inválida é contado UMA vez (era descontado duas)", () => {
    const k = computeKpis(cenario());
    expect(k.semPecas).toBe(2);      // "c" e "e"
    expect(k.invalidCount).toBe(1);  // só "d"
    expect(k.emDia).toBe(1);         // só "b" — nunca negativo
    expect(k.atrasados).toBe(1);     // só "a"
  });

  it("pecasAtrasadas é a soma de pecasEmAtraso — o card reconcilia com o placar", () => {
    const evs = cenario();
    const k = computeKpis(evs);
    expect(k.pecasAtrasadas).toBe(evs.reduce((acc, ev) => acc + ev.pecasEmAtraso, 0));
  });

  it("saidas7d usa diasParaSaida (0..7) e ignora data inválida", () => {
    const evs = [
      montar(evento({ id: "hoje", truckDepartureDate: "2026-08-13T00:00:00.000Z" }), [peca()]),
      montar(evento({ id: "sete", truckDepartureDate: "2026-08-20T00:00:00.000Z" }), [peca()]),
      montar(evento({ id: "oito", truckDepartureDate: "2026-08-21T00:00:00.000Z" }), [peca()]),
      montar(evento({ id: "inval", truckDepartureDate: "0206-08-20T00:00:00.000Z" }), [peca()]),
    ];
    expect(computeKpis(evs).saidas7d).toBe(2);
    expect(hoje).toBe(dia("2026-08-13"));
  });

  it("placar vazio não quebra", () => {
    expect(computeKpis([])).toEqual({
      atrasados: 0, saidas7d: 0, pecasAtrasadas: 0, emDia: 0, invalidCount: 0, semPecas: 0,
    });
  });
});

describe("regressões de fronteira", () => {
  it("marco que vence HOJE não é atraso (diffDays 0 = warning)", () => {
    // Marco de produção (-1, allDays) em 2026-08-13 → saída 2026-08-14.
    // A peça já está na produção, então as etapas anteriores estão "done"
    // mesmo com marco no passado — é a pendência ACUMULADA decidindo, não a
    // data. O evento é "emDia" com a última etapa vencendo hoje.
    const ev = montar(evento({ truckDepartureDate: "2026-08-14T00:00:00.000Z" }), [peca({ status: "approved" })]);
    const producao = ev.stages.at(-1)!;
    expect(producao.diffDays).toBe(0);
    expect(producao.state).toBe("warning");
    expect(ev.stages.slice(0, -1).every((s) => s.state === "done")).toBe(true);
    expect(ev.categoria).toBe("emDia");
  });

  it("marco vencido SÓ vira atraso se ainda houver peça no gate", () => {
    // Mesma saída de ontem, mas com a peça travada no rascunho: aí sim as
    // etapas anteriores estão vencidas e o evento é "atrasado".
    const ev = montar(evento({ truckDepartureDate: "2026-08-14T00:00:00.000Z" }), [peca({ status: "draft" })]);
    expect(ev.categoria).toBe("atrasado");
    expect(ev.stages[0].state).toBe("overdue");
  });

  it("o dia é fechado em UTC: 1 dia = 86400000ms exatos na conta de etapas", () => {
    const ev = montar(evento(), [peca()]);
    const marco = Date.UTC(
      Number(ev.stages[0].deadline.slice(0, 4)),
      Number(ev.stages[0].deadline.slice(5, 7)) - 1,
      Number(ev.stages[0].deadline.slice(8, 10)),
    );
    expect(ev.stages[0].diffDays).toBe(Math.round((marco - dia("2026-08-13")) / DIA));
  });
});
