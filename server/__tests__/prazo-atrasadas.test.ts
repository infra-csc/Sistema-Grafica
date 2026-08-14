// ─────────────────────────────────────────────────────────────────────────────
// GESTÃO DE PRAZOS — a lista PLANA de peças atrasadas
// (client/src/components/prazos/atrasadas.ts).
//
// PORQUÊ este arquivo mora em server/__tests__: o vitest.config só inclui este
// diretório (environment: node), e as funções sob teste são PURAS — payload do
// contrato entra, lista ordenada sai. Mesmo arranjo de `prazo-gargalos.test.ts`.
//
// Os eventos NÃO são objetos literais escritos à mão: são montados pelo domínio
// de verdade (`buildEventPrazo`), com `today` injetado. É o que dá valor ao
// teste central daqui — o de que a lista FECHA COM O PLACAR (`computeKpis`).
// Dois números sobre o mesmo assunto, calculados por caminhos diferentes, na
// mesma tela e a um clique um do outro: se divergirem em silêncio, o diretor
// para de acreditar nos dois.
//
// O QUE ESTÁ PROTEGIDO AQUI:
//  • a definição de ATRASADA (o prazo do marco daquela peça venceu — nunca uma
//    definição nova inventada no cliente);
//  • a peça isenta de aprovação (`skipApproval`) sendo medida pelo prazo da
//    APROVAÇÃO e ainda assim atribuída ao setor da etapa em que ESTÁ;
//  • a ordem (pior atraso primeiro, empate por quem está parada há mais tempo);
//  • o destino de cada linha (`STAGE_SECTOR`, o mesmo do drill do modal);
//  • os filtros por peça (etapa, dia e busca por código/descrição/evento);
//  • a única divergência possível com o placar — evento com prazos editados
//    FORA DE ORDEM —, que a lista subconta em vez de superconta, e que a tela
//    explica em uma linha.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import {
  computePecasAtrasadas,
  filtrarPecasAtrasadas,
} from "@/components/prazos/atrasadas";
import {
  buildEventPrazo,
  computeKpis,
  type DomainEvent,
  type DomainItem,
} from "../services/prazo-domain";
import type { PrazoEvent } from "@shared/prazos-contract";

const dia = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

// Saída num domingo (2026-08-30) — os marcos caem em:
//   listaImagens −25 → 05/08 · layouts −20 → 10/08 · aprovacao −12 → 18/08
//   finalizacao  −10 → 20/08 · revisao −8 → 22/08 (sáb) → 21/08 · producao −1 → 29/08
const HOJE = dia("2026-08-20");

function evento(over: Partial<DomainEvent> = {}): DomainEvent {
  return {
    id: "ev-1",
    name: "COPA BRASIL DE HANDEBOL",
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

describe("computePecasAtrasadas — o que entra na lista", () => {
  it("só entra a peça cujo PRAZO DO MARCO já venceu", () => {
    // Em 20/08: lista (05/08) e layouts (10/08) venceram; finalização vence
    // HOJE (diff 0, ainda não venceu) e revisão/produção estão no futuro.
    const ev = montar(evento(), [
      peca({ status: "draft" }),                  // etapa 0 — vencida há 15d
      peca({ status: "awaiting_submission" }),    // etapa 1 — vencida há 10d
      peca({ status: "sponsor_approved" }),       // etapa 3 — vence hoje
      peca({ status: "in_review" }),              // etapa 4 — futuro
      peca({ status: "delivered" }),              // fora do funil
    ]);
    const lista = computePecasAtrasadas([ev]);
    expect(lista.map((p) => p.item.status)).toEqual(["draft", "awaiting_submission"]);
    expect(lista.map((p) => p.diasAtraso)).toEqual([15, 10]);
  });

  it("evento com data de saída inválida não produz peça atrasada", () => {
    // Sem data confiável não há atraso confiável — o domínio já mantém as
    // etapas em "upcoming", e a lista não pode inventar um atraso de 600 mil
    // dias em cima de um cadastro quebrado.
    const ev = montar(
      evento({ truckDepartureDate: "0206-08-30T00:00:00.000Z" }),
      [peca({ status: "draft" })],
    );
    expect(ev.invalidDate).toBe(true);
    expect(computePecasAtrasadas([ev])).toEqual([]);
  });

  it("evento sem nenhuma peça não produz linha (e não quebra)", () => {
    const ev = montar(evento(), []);
    expect(computePecasAtrasadas([ev])).toEqual([]);
  });
});

describe("peça isenta da aprovação do patrocinador", () => {
  // As duas estão em RASCUNHO (etapa 0, prazo vencido há 15 dias). A isenta é
  // cobrada pelo prazo da APROVAÇÃO (18/08, vencido há 2 dias): é a folga que
  // o dono escolheu dar. Se a lista medisse pela etapa, as duas apareceriam
  // com 15 dias e a regra do dono sumiria da tela mais visível do assunto.
  const ev = montar(evento(), [
    peca({ id: "normal", displayId: "#N1", status: "draft" }),
    peca({ id: "isenta", displayId: "#I1", status: "draft", skipApproval: true }),
  ]);
  const lista = computePecasAtrasadas([ev]);

  it("é medida pelo prazo da Aprovação de Layout, não pelo da etapa em que está", () => {
    const isenta = lista.find((p) => p.item.id === "isenta");
    expect(isenta?.diasAtraso).toBe(2);
    expect(isenta?.marco.key).toBe("aprovacao");
    expect(isenta?.cobradaPorOutraEtapa).toBe(true);

    const normal = lista.find((p) => p.item.id === "normal");
    expect(normal?.diasAtraso).toBe(15);
    expect(normal?.cobradaPorOutraEtapa).toBe(false);
  });

  it("continua atribuída ao setor da etapa em que ESTÁ (de quem é a bola)", () => {
    // O marco diz QUANDO cobrar; a etapa diz DE QUEM cobrar. Unificar os dois
    // campos mandaria o diretor cobrar o Atendimento por uma peça que ainda
    // está na mesa de quem cadastra.
    const isenta = lista.find((p) => p.item.id === "isenta");
    expect(isenta?.stage.key).toBe("listaImagens");
    expect(isenta?.setor).toBe("Solicitação");
  });
});

describe("ordem e destino de cada linha", () => {
  it("pior atraso primeiro; empate desempata por quem está parada há mais tempo", () => {
    const ev = montar(evento(), [
      peca({ id: "a", status: "awaiting_submission", updatedAt: "2026-08-19T12:00:00.000Z" }),
      peca({ id: "b", status: "awaiting_submission", updatedAt: "2026-08-01T12:00:00.000Z" }),
      peca({ id: "c", status: "draft", updatedAt: "2026-08-19T12:00:00.000Z" }),
    ]);
    const lista = computePecasAtrasadas([ev]);
    // "c" está na etapa mais antiga (15d de atraso) e abre a lista; entre as
    // duas de 10 dias, quem está parada há 19 dias vem antes.
    expect(lista.map((p) => p.item.id)).toEqual(["c", "b", "a"]);
  });

  it("cada linha aponta para a tela que RESOLVE a peça (mesmo mapa do drill)", () => {
    const ev = montar(evento(), [
      peca({ id: "arte", status: "awaiting_submission" }),
      peca({ id: "solicitacao", status: "draft" }),
    ]);
    const porId = new Map(computePecasAtrasadas([ev]).map((p) => [p.item.id, p]));
    expect(porId.get("arte")?.setor).toBe("Arte");
    expect(porId.get("arte")?.url).toBe("/arte");
    // Etapa sem tela própria cai no detalhe do evento, onde a peça nasce.
    expect(porId.get("solicitacao")?.url).toBe("/eventos/ev-1");
  });

  it("mistura eventos numa lista só, sem agrupar, dizendo de qual evento é cada peça", () => {
    const a = montar(evento({ id: "ev-a", name: "COPA A" }), [peca({ status: "awaiting_submission" })]);
    const b = montar(evento({ id: "ev-b", name: "COPA B" }), [peca({ status: "draft" })]);
    const lista = computePecasAtrasadas([a, b]);
    expect(lista.map((p) => p.eventName)).toEqual(["COPA B", "COPA A"]);
    expect(lista.every((p) => p.eventId && p.eventName)).toBe(true);
  });
});

describe("a lista fecha com o placar", () => {
  it("tem exatamente `kpis.pecasAtrasadas` linhas num conjunto misto", () => {
    const eventos = [
      montar(evento({ id: "ev-1" }), [
        peca({ status: "draft" }),
        peca({ status: "awaiting_submission" }),
        peca({ status: "draft", skipApproval: true }),
        peca({ status: "in_review" }),
        peca({ status: "delivered" }),
      ]),
      // Data quebrada: entra no payload, não entra em nenhum dos dois números.
      montar(evento({ id: "ev-2", truckDepartureDate: "0206-08-30T00:00:00.000Z" }), [
        peca({ status: "draft" }),
      ]),
      // Sem peça nenhuma: o pior caso do negócio, e mesmo assim zero peças.
      montar(evento({ id: "ev-3" }), []),
      // Tudo dentro do prazo.
      montar(evento({ id: "ev-4" }), [peca({ status: "in_review" })]),
    ];
    const kpis = computeKpis(eventos);
    expect(kpis.pecasAtrasadas).toBe(3);
    expect(computePecasAtrasadas(eventos)).toHaveLength(kpis.pecasAtrasadas);
  });

  it("com prazos editados FORA DE ORDEM a lista subconta — nunca superconta", () => {
    // Aprovação puxada para −30 (antes da Lista de Imagens, que é −25). Em
    // 01/08 a Aprovação já venceu (31/07) e a Lista ainda não (05/08). O placar
    // conta a peça em rascunho, porque ela trava a etapa vencida mais avançada;
    // a lista NÃO a escreve como "atrasada há N dias", porque o prazo que mede
    // aquela peça ainda não venceu — e a tela diz a diferença em voz alta em
    // vez de exibir dois números que se contradizem.
    const ev = montar(
      evento({ deadlineAprovacaoLayout: -30 }),
      [peca({ status: "draft" })],
      dia("2026-08-01"),
    );
    const kpis = computeKpis([ev]);
    expect(kpis.pecasAtrasadas).toBe(1);
    expect(computePecasAtrasadas([ev])).toHaveLength(0);
    expect(computePecasAtrasadas([ev]).length).toBeLessThanOrEqual(kpis.pecasAtrasadas);
  });
});

describe("filtrarPecasAtrasadas — filtros no grão da PEÇA", () => {
  const ev = montar(evento({ name: "COPA SÃO PAULO" }), [
    peca({ id: "p-lista", displayId: "#3521", status: "draft", description: "Fachada lateral" }),
    peca({ id: "p-arte", displayId: "#3522", status: "awaiting_submission", description: "Testeira do palco" }),
  ]);
  const lista = computePecasAtrasadas([ev]);

  it("etapa filtra pela etapa em que a PEÇA está", () => {
    const r = filtrarPecasAtrasadas(lista, { etapaKey: "layouts" });
    expect(r.map((p) => p.item.id)).toEqual(["p-arte"]);
    expect(filtrarPecasAtrasadas(lista, { etapaKey: "all" })).toHaveLength(2);
  });

  it("dia filtra pelo prazo que MEDE a peça", () => {
    // layouts vence em 10/08; lista de imagens, em 05/08.
    expect(filtrarPecasAtrasadas(lista, { dia: "2026-08-10" }).map((p) => p.item.id))
      .toEqual(["p-arte"]);
    expect(filtrarPecasAtrasadas(lista, { dia: "2026-08-05" }).map((p) => p.item.id))
      .toEqual(["p-lista"]);
  });

  it("busca acha por código, por descrição e pelo nome do evento (sem acento)", () => {
    expect(filtrarPecasAtrasadas(lista, { busca: "3521" }).map((p) => p.item.id)).toEqual(["p-lista"]);
    expect(filtrarPecasAtrasadas(lista, { busca: "testeira" }).map((p) => p.item.id)).toEqual(["p-arte"]);
    expect(filtrarPecasAtrasadas(lista, { busca: "sao paulo" })).toHaveLength(2);
    expect(filtrarPecasAtrasadas(lista, { busca: "não existe" })).toHaveLength(0);
  });

  it("os filtros se acumulam", () => {
    expect(filtrarPecasAtrasadas(lista, { etapaKey: "layouts", busca: "3521" })).toHaveLength(0);
  });
});
