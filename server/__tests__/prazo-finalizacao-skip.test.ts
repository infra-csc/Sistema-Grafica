// As DUAS regras de negócio novas do modelo de prazos, definidas pelo dono.
//
// PORQUÊ um arquivo próprio: as duas mudam o SIGNIFICADO do funil (uma etapa a
// mais e um marco que não é o da etapa em que a peça está), e as duas são o
// tipo de regra que a próxima pessoa vai achar que é bug — "por que a Lista de
// Imagens está verde se tem peça em rascunho?". Concentrar aqui deixa a
// resposta a um `grep skipApproval` de distância, com o motivo escrito.
//
// REGRA 1 — Finalização é etapa do fluxo, com marco próprio (padrão −10).
//   A Arte anexando o arquivo final deixou de ficar pendurada na Revisão de
//   Lista: são dois trabalhos, de dois setores, com dois prazos.
//
// REGRA 2 — Peça isenta da aprovação do patrocinador (`items.skipApproval`) é
//   cobrada pelo prazo de FINALIZAÇÃO (decisão do dono, 24/08 — antes era o de
//   Aprovação de Layout). Ela não passa pela etapa de aprovação, e a
//   Finalização é a primeira etapa por onde ela REALMENTE passa: cobrá-la pela
//   aprovação era medi-la por um marco que ela nunca cumpre.
//
// Nenhum teste lê o relógio: `today` é sempre injetado.
import { describe, it, expect } from "vitest";
import {
  FINALIZACAO_STAGE_INDEX,
  STAGE_DEFS,
  STATUS_STAGE_RANK,
  buildEventPrazo,
  marcoIndexFor,
  type DomainEvent,
  type DomainItem,
} from "../services/prazo-domain";
import type { PrazoEvent } from "@shared/prazos-contract";

const dia = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const HOJE = dia("2026-08-13");

// Saída num domingo (2026-08-30) — os marcos caem em:
//   listaImagens −25 → 05/08 · layouts −20 → 10/08 · aprovacao −12 → 18/08
//   finalizacao  −10 → 20/08 · revisao −8 → 22/08 (sáb) → 21/08 · producao −1 → 29/08
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

function montar(ev: DomainEvent, itens: DomainItem[], today = HOJE): PrazoEvent {
  const r = buildEventPrazo(ev, itens, { today });
  expect(r).not.toBeNull();
  return r as PrazoEvent;
}

const idxDe = (key: string) => STAGE_DEFS.findIndex((s) => s.key === key);
const etapa = (ev: PrazoEvent, key: string) => ev.stages.find((s) => s.key === key)!;

// ═════════════════════════════════════════════════════════════════════════════
// REGRA 1 — Finalização como etapa própria
// ═════════════════════════════════════════════════════════════════════════════
describe("REGRA 1 — Finalização é etapa do fluxo, entre Aprovação e Revisão", () => {
  it("entra na posição do fluxo real, com offset padrão −10", () => {
    const finalizacao = STAGE_DEFS[idxDe("finalizacao")];
    expect(finalizacao.label).toBe("Finalização");
    expect(finalizacao.defaultOffset).toBe(-10);
    expect(finalizacao.offsetField).toBe("deadlineFinalizacao");
    // Ajusta fim de semana como as outras (seg–sex) — só a Produção Gráfica
    // vence no sábado (seg–sáb; dono, 19/10).
    expect(finalizacao.fimDeSemana).toBe("seg-sex");

    // A POSIÇÃO é a regra: depois da aprovação (a Arte só finaliza o que foi
    // aprovado) e antes da revisão do criador (que revisa o arquivo final).
    expect(idxDe("finalizacao")).toBe(idxDe("aprovacao") + 1);
    expect(idxDe("revisao")).toBe(idxDe("finalizacao") + 1);
  });

  it("os três caminhos que chegam na finalização caem nesta etapa, e só nela", () => {
    // `sponsor_approved` = aprovação normal · `awaiting_creator_review` = peça
    // isenta de aprovação (items.ts:1335) · `awaiting_finalization` = legado.
    for (const status of ["sponsor_approved", "awaiting_creator_review", "awaiting_finalization"]) {
      expect(STATUS_STAGE_RANK[status], status).toBe(idxDe("finalizacao"));
    }
    // E a revisão do criador ficou SÓ com a revisão — era isto que estava
    // misturado: um marco só para dois setores diferentes.
    for (const status of ["awaiting_final_review", "awaiting_review", "in_review"]) {
      expect(STATUS_STAGE_RANK[status], status).toBe(idxDe("revisao"));
    }
  });

  it("a peça em finalização acende o marco de −10, não mais o de −8", () => {
    const ev = montar(evento(), [peca({ status: "sponsor_approved" })]);

    const finalizacao = etapa(ev, "finalizacao");
    expect(finalizacao.deadline).toBe("2026-08-20"); // 30/08 − 10, quinta
    expect(finalizacao.directCount).toBe(1);
    expect(finalizacao.pendingCount).toBe(1);

    // A Revisão de Lista continua existindo e vencendo DEPOIS: são dois
    // prazos, não um. Antes, a peça sem arquivo final só acendia no −8.
    const revisao = etapa(ev, "revisao");
    expect(revisao.deadline).toBe("2026-08-21"); // 22/08 é sábado → sexta
    expect(revisao.directCount).toBe(0);
    expect(finalizacao.deadline < revisao.deadline).toBe(true);

    // Tudo que vem antes está limpo — a peça já passou por lá.
    expect(etapa(ev, "aprovacao").state).toBe("done");
    expect(ev.pendingItems[0].stageIndex).toBe(idxDe("finalizacao"));
  });

  it("o offset do evento sobrepõe o padrão da etapa", () => {
    const ev = montar(evento({ deadlineFinalizacao: -15 }), [peca({ status: "sponsor_approved" })]);
    // 30/08 − 15 = 15/08, sábado → antecipa para sexta 14/08.
    expect(etapa(ev, "finalizacao").deadline).toBe("2026-08-14");
  });

  it("a finalização acusa o atraso um dia ANTES de a revisão sequer vencer", () => {
    // Hoje 21/08: o marco da finalização (20/08) já passou; o da revisão
    // (21/08) só vence hoje. Sem a etapa nova, este evento ainda estaria
    // amarelo — o arquivo final atrasado só apareceria amanhã.
    const ev = montar(evento(), [peca({ status: "awaiting_finalization" })], dia("2026-08-21"));
    expect(etapa(ev, "finalizacao").state).toBe("overdue");
    expect(etapa(ev, "finalizacao").diffDays).toBe(-1);
    expect(etapa(ev, "revisao").state).toBe("warning"); // vence hoje, ainda não é atraso
    expect(ev.categoria).toBe("atrasado");
    expect(ev.piorAtrasoDias).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// REGRA 2 — peça sem aprovação é cobrada pelo prazo de LAYOUT AJUSTADO
//
// Pedro/dono 26/10 ("Prazos para peças sem aprovação"): a peça "Sem patrocínio"
// (skipApproval) ou "Arte do cliente" vence o Layout no prazo de Layout + a
// duração da Aprovação (dias corridos, configuração — padrão 7). O prazo da
// Finalização em diante não muda. A regra única mora em
// @shared/prazo-sem-aprovacao; os casos completos (os 9 critérios de aceite) em
// prazos-sem-aprovacao.test.ts.
//
// REGRA ANTIGA (24/08, trocada em 26/10): a peça isenta era cobrada pelo marco
// da FINALIZAÇÃO, e as etapas anteriores não a contavam. Os testes abaixo
// descreviam essa regra e foram reescritos para a nova.
//
// Neste evento: Entrega de Layouts 10/08 (seg) → ajustado 17/08 (seg);
// Aprovação 18/08; Finalização 20/08.
// ═════════════════════════════════════════════════════════════════════════════
describe("REGRA 2 — skipApproval é medida pelo Layout ajustado (Pedro/dono 26/10)", () => {
  it("marcoIndexFor: a peça com marca, em Lista de Imagens ou Layout, é cobrada no marco de Layout", () => {
    expect(marcoIndexFor("draft", true)).toBe(idxDe("layouts"));
    expect(marcoIndexFor("awaiting_submission", true)).toBe(idxDe("layouts"));
    expect(marcoIndexFor("requested", false, false, true)).toBe(idxDe("layouts")); // Arte do cliente
    // Parada num status de aprovação: é ali que ela está, e ali é cobrada.
    expect(marcoIndexFor("awaiting_sponsor_approval", true)).toBe(idxDe("aprovacao"));
    // Sem a marca, nada muda.
    expect(marcoIndexFor("draft", false)).toBe(idxDe("listaImagens"));
    expect(marcoIndexFor("awaiting_submission")).toBe(idxDe("layouts"));
    // Na Finalização ou depois, a marca não mexe em prazo nenhum (RN05).
    expect(marcoIndexFor("awaiting_creator_review", true)).toBe(FINALIZACAO_STAGE_INDEX);
    expect(marcoIndexFor("ready_for_production", true)).toBe(idxDe("producao"));
    expect(marcoIndexFor("delivered", true)).toBeUndefined();
    expect(marcoIndexFor("canceled", true)).toBeUndefined();
  });

  it("em 13/08 a sem patrocínio NÃO está atrasada (Layout ajustado 17/08); a comum, ao lado, está", () => {
    const isenta = montar(evento(), [peca({ status: "awaiting_submission", skipApproval: true })]);
    expect(etapa(isenta, "layouts")).toMatchObject({ deadline: "2026-08-10", prazoEfetivo: "2026-08-17", pendingCount: 1, atrasadas: 0, state: "upcoming" });
    expect(etapa(isenta, "aprovacao").directCount).toBe(0);
    expect(etapa(isenta, "finalizacao").directCount).toBe(0);
    expect(etapa(isenta, "finalizacao").deadline).toBe("2026-08-20"); // inalterado
    expect(isenta.categoria).toBe("emDia");

    const normal = montar(evento(), [peca({ status: "awaiting_submission" })]);
    expect(etapa(normal, "layouts").state).toBe("overdue");
    expect(normal.categoria).toBe("atrasado");
  });

  it("no dia 17/08 ainda vence hoje; em 18/08 está atrasada no Layout", () => {
    const hoje17 = montar(evento(), [peca({ status: "awaiting_submission", skipApproval: true })], dia("2026-08-17"));
    expect(etapa(hoje17, "layouts").state).toBe("warning");
    expect(hoje17.categoria).toBe("emDia");
    const dia18 = montar(evento(), [peca({ status: "awaiting_submission", skipApproval: true })], dia("2026-08-18"));
    expect(etapa(dia18, "layouts")).toMatchObject({ state: "overdue", diffDays: -1, atrasadas: 1 });
    expect(dia18.categoria).toBe("atrasado");
    expect(dia18.pecasEmAtraso).toBe(1);
  });

  it("a peça com marca continua no drill-down, com a bola no setor certo e o prazo dela", () => {
    const ev = montar(evento(), [peca({ status: "awaiting_submission", skipApproval: true })]);
    expect(ev.pendingItems).toHaveLength(1);
    expect(ev.pendingItems[0]).toMatchObject({ stageIndex: idxDe("layouts"), marcoIndex: idxDe("layouts"), prazo: "2026-08-17" });
  });

  it("sem a flag, marcoIndex e stageIndex são o mesmo índice em todo o funil", () => {
    const itens = STAGE_DEFS.flatMap((def) => def.pendingStatuses.map((st) => peca({ status: st })));
    const ev = montar(evento(), itens);
    for (const it of ev.pendingItems) {
      expect(it.marcoIndex, `status ${it.status}`).toBe(it.stageIndex);
    }
  });

  it("a promoção não cria nem some com peça: a soma dos marcos bate com o total", () => {
    const ev = montar(evento(), [
      peca({ status: "draft", skipApproval: true }),
      peca({ status: "awaiting_submission", skipApproval: true }),
      peca({ status: "awaiting_submission" }),
      peca({ status: "sponsor_approved", skipApproval: true }),
      peca({ status: "delivered" }),   // fora da pendência
      peca({ status: "canceled" }),    // fora do funil
    ]);
    const somaDireta = ev.stages.reduce((acc, s) => acc + s.directCount, 0);
    expect(somaDireta).toBe(ev.pendingItems.length);
    expect(somaDireta).toBe(4);
    // As duas com marca anteriores ao Layout caem no LAYOUT, junto da comum;
    // a que já está na finalização fica lá. A aprovação não conta nenhuma.
    expect(etapa(ev, "layouts").directCount).toBe(3);
    expect(etapa(ev, "aprovacao").directCount).toBe(0);
    expect(etapa(ev, "finalizacao").directCount).toBe(1);
    expect(ev.stages.at(-1)!.pendingCount).toBe(4);
  });
});
