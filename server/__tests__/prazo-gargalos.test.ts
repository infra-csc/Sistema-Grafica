// ─────────────────────────────────────────────────────────────────────────────
// GESTÃO DE PRAZOS — agregados do CLIENTE (client/src/components/prazos/
// gargalos.ts): o resumo por setor e a contagem de eventos por etapa.
//
// PORQUÊ este arquivo mora em server/__tests__: o vitest.config só inclui este
// diretório (environment: node). As funções sob teste são PURAS — payload do
// contrato entra, agregado sai — então rodam em node sem DOM e sem React.
//
// O que está protegido aqui é regra de NEGÓCIO que vivia sem teste dentro de
// dois useMemo da página:
//   • a REATRIBUIÇÃO: peça em aprovação cujas bolas estão TODAS com a Arte
//     conta na mesa da Arte (reprovação aguardando reenvio), não na do
//     Atendimento;
//   • a soma por setor (count/avg/max/eventCount) e o sub-rótulo de
//     produzidas (`producedCount`, vocabulário PRODUCED_LIKE do contrato);
//   • o selo de gargalo com a regra do empate (2 empatados destacam os dois;
//     3+ é dia distribuído, ninguém destaca);
//   • eventos por etapa: o evento aparece em TODA etapa em que tem peça
//     travada (regra do dono, 17/08), com `currentStageIdx` de fallback para
//     quem não tem peça travada em lugar nenhum.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import {
  computeEventosPorEtapa,
  computeSectorSummary,
  eventoNaEtapa,
} from "@/components/prazos/gargalos";
import type {
  PrazoEvent,
  PrazoPendingItem,
  PrazoStage,
} from "@shared/prazos-contract";

const STAGE_META = [
  { key: "listaImagens", label: "Lista de Imagens" },
  { key: "layouts", label: "Entrega de Layouts" },
  { key: "aprovacao", label: "Aprovação de Layout" },
  { key: "revisao", label: "Revisão de Lista" },
  { key: "producao", label: "Produção Gráfica" },
];

function stage(key: string, label: string, pendingCount: number): PrazoStage {
  return {
    key, label, deadline: "2026-08-20", diffDays: 7,
    pendingCount, directCount: 0, state: pendingCount > 0 ? "upcoming" : "done",
  };
}

let seq = 0;
function item(over: Partial<PrazoPendingItem> = {}): PrazoPendingItem {
  seq += 1;
  return {
    id: `it-${seq}`, displayId: `#${1000 + seq}`, status: "draft",
    stageIndex: 0, type: "2x1", description: null, quantity: 1,
    waitingDays: 0, ...over,
  };
}

function evento(over: Partial<PrazoEvent> = {}): PrazoEvent {
  seq += 1;
  const pendingItems = over.pendingItems ?? [];
  // `stages` coerente com as peças por padrão: pendência acumulada a partir
  // da primeira etapa com peça (é o que `currentStageIdx` lê).
  const firstIdx = pendingItems.length
    ? Math.min(...pendingItems.map((it) => it.stageIndex))
    : -1;
  return {
    id: `ev-${seq}`,
    name: `EVENTO ${seq}`,
    priority: null,
    startDate: "2026-09-05T00:00:00.000Z",
    truckDepartureDate: "2026-08-30T00:00:00.000Z",
    invalidDate: false,
    totalItems: pendingItems.length,
    deliveredItems: 0,
    stages: STAGE_META.map((m, i) =>
      stage(m.key, m.label, firstIdx >= 0 && i >= firstIdx ? 1 : 0)),
    riskCritical: false,
    categoria: pendingItems.length ? "emDia" : "semPecas",
    diasParaSaida: 17,
    piorAtrasoDias: 0,
    pecasEmAtraso: 0,
    piorEsperaDias: 0,
    solicitante: null,
    ...over,
    pendingItems,
  };
}

describe("computeSectorSummary — soma por setor", () => {
  it("conta peças, médias, pior espera e eventos distintos por etapa", async () => {
    const evA = evento({
      pendingItems: [
        item({ stageIndex: 0, waitingDays: 2 }),
        item({ stageIndex: 0, waitingDays: 4 }),
        item({ stageIndex: 1, status: "awaiting_submission", waitingDays: 9 }),
      ],
    });
    const evB = evento({
      pendingItems: [item({ stageIndex: 0, waitingDays: 6 })],
    });

    const setores = computeSectorSummary([evA, evB], STAGE_META);

    const lista = setores.find((s) => s.key === "listaImagens")!;
    expect(lista.sector).toBe("Solicitação");
    expect(lista.count).toBe(3);
    expect(lista.avgDays).toBe(4);       // (2+4+6)/3
    expect(lista.maxDays).toBe(6);
    expect(lista.eventCount).toBe(2);    // A e B
    expect(lista.isWorst).toBe(true);    // 3 > 1, empate só entre 2? não: único

    const arte = setores.find((s) => s.key === "layouts")!;
    expect(arte.count).toBe(1);
    expect(arte.eventCount).toBe(1);
    expect(arte.isWorst).toBe(false);

    // Etapas sem peça ficam zeradas, sem gargalo.
    for (const key of ["aprovacao", "revisao", "producao"]) {
      const s = setores.find((x) => x.key === key)!;
      expect([s.count, s.avgDays, s.maxDays, s.eventCount]).toEqual([0, 0, 0, 0]);
      expect(s.isWorst).toBe(false);
    }
  });

  it("REATRIBUIÇÃO: aprovação com todas as bolas na Arte conta na mesa da Arte", async () => {
    const ev = evento({
      pendingItems: [
        // Todas as bolas com a Arte → a mesa é da Arte (layouts).
        item({
          stageIndex: 2, status: "awaiting_approval", waitingDays: 5,
          sponsors: [
            { name: "Coca-Cola", days: 5, holder: "arte" },
            { name: "Ambev", days: 3, holder: "arte" },
          ],
        }),
        // UMA bola ainda com patrocinador → continua na Aprovação.
        item({
          stageIndex: 2, status: "awaiting_approval", waitingDays: 8,
          sponsors: [
            { name: "Coca-Cola", days: 8, holder: "sponsor" },
            { name: "Ambev", days: 2, holder: "arte" },
          ],
        }),
        // Sem registro de aprovação (sponsors ausente) → fica na Aprovação.
        item({ stageIndex: 2, status: "awaiting_approval", waitingDays: 1 }),
      ],
    });

    const setores = computeSectorSummary([ev], STAGE_META);
    const arte = setores.find((s) => s.key === "layouts")!;
    const aprovacao = setores.find((s) => s.key === "aprovacao")!;

    expect(arte.count).toBe(1);
    expect(arte.maxDays).toBe(5);
    expect(aprovacao.count).toBe(2);
    expect(aprovacao.maxDays).toBe(8);
    // A peça reatribuída conta o EVENTO na Arte também.
    expect(arte.eventCount).toBe(1);
  });

  it("producedCount separa 'já produzida' (PRODUCED_LIKE) do resto da Gráfica", async () => {
    const ev = evento({
      pendingItems: [
        item({ stageIndex: 4, status: "ready_for_production", waitingDays: 1 }),
        item({ stageIndex: 4, status: "produced", waitingDays: 2 }),
        item({ stageIndex: 4, status: "conferred", waitingDays: 3 }),
        item({ stageIndex: 4, status: "produzido", waitingDays: 4 }),   // grafia legada
      ],
    });
    const producao = computeSectorSummary([ev], STAGE_META).find((s) => s.key === "producao")!;
    expect(producao.count).toBe(4);
    expect(producao.producedCount).toBe(3);
  });

  it("empate em 2 setores destaca os dois; empate em 3+ não destaca ninguém", async () => {
    const doisEmpatados = [
      evento({ pendingItems: [item({ stageIndex: 0 })] }),
      evento({ pendingItems: [item({ stageIndex: 1, status: "awaiting_submission" })] }),
    ];
    const s2 = computeSectorSummary(doisEmpatados, STAGE_META);
    expect(s2.filter((s) => s.isWorst).map((s) => s.key)).toEqual(["listaImagens", "layouts"]);

    const tresEmpatados = [
      ...doisEmpatados,
      evento({ pendingItems: [item({ stageIndex: 3, status: "awaiting_review" })] }),
    ];
    const s3 = computeSectorSummary(tresEmpatados, STAGE_META);
    expect(s3.some((s) => s.isWorst)).toBe(false);
  });

  it("sem nenhuma peça pendente, nada é gargalo", async () => {
    const setores = computeSectorSummary([evento()], STAGE_META);
    expect(setores.every((s) => s.count === 0 && !s.isWorst)).toBe(true);
  });
});

describe("computeEventosPorEtapa — a conta da coluna do quadro", () => {
  it("cada evento conta UMA vez, na etapa atual (primeira com pendência acumulada)", async () => {
    const naLista = evento({ pendingItems: [item({ stageIndex: 0 })] });
    // Peça na produção mas OUTRA ainda na lista → o evento está na Lista.
    const travadoAtras = evento({
      pendingItems: [
        item({ stageIndex: 0 }),
        item({ stageIndex: 4, status: "ready_for_production" }),
      ],
    });
    const naProducao = evento({
      pendingItems: [item({ stageIndex: 4, status: "ready_for_production" })],
    });

    const m = computeEventosPorEtapa([naLista, travadoAtras, naProducao], STAGE_META);
    expect(m.get("listaImagens")).toBe(2);
    expect(m.get("producao")).toBe(1);
    expect(m.get("layouts")).toBeUndefined();
    // Soma total = nº de eventos (nenhum conta duas vezes).
    expect([...m.values()].reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("evento SEM peças cai na etapa 0 — a próxima ação real é cadastrar a lista", async () => {
    const m = computeEventosPorEtapa([evento()], STAGE_META);
    expect(m.get("listaImagens")).toBe(1);
  });
});

describe("eventoNaEtapa — o evento aparece onde há trabalho, não só no gargalo", () => {
  /** Constrói `stages` com o directCount de cada etapa, na ordem do STAGE_META. */
  function comTravadas(diretas: number[]): PrazoEvent {
    const base = evento({ pendingItems: [item({ stageIndex: 0 })] });
    return {
      ...base,
      stages: STAGE_META.map((m, i) => ({
        key: m.key, label: m.label, deadline: "2026-08-20", diffDays: 7,
        // pendingCount acumulado da direita para a esquerda não importa aqui:
        // o predicado lê directCount. Mantido coerente para não confundir.
        pendingCount: diretas.slice(i).reduce((a, b) => a + b, 0),
        directCount: diretas[i] ?? 0,
        state: (diretas[i] ?? 0) > 0 ? "upcoming" : "done",
      })),
    };
  }

  it("evento com peça em duas etapas aparece nas DUAS", () => {
    // 9 paradas em Layouts e 2 em Produção: antes existia só em Layouts, e
    // quem abria a coluna da Gráfica não via que ali havia trabalho.
    const ev = comTravadas([0, 9, 0, 0, 2]);
    expect(eventoNaEtapa(ev, 1)).toBe(true);
    expect(eventoNaEtapa(ev, 4)).toBe(true);
    expect(eventoNaEtapa(ev, 0)).toBe(false);
    expect(eventoNaEtapa(ev, 2)).toBe(false);
  });

  it("a etapa VAZIA entre duas cheias continua vazia", () => {
    // É a diferença entre directCount e pendingCount: o acumulado poria o
    // evento também em Aprovação, que não tem peça nenhuma parada.
    const ev = comTravadas([0, 9, 0, 0, 2]);
    expect(eventoNaEtapa(ev, 3)).toBe(false);
  });

  it("evento sem peça travada em lugar nenhum não some do quadro", () => {
    const ev = comTravadas([0, 0, 0, 0, 0]);
    const colunas = STAGE_META.map((_, i) => eventoNaEtapa(ev, i));
    expect(colunas.filter(Boolean).length, "deveria aparecer em exatamente uma").toBe(1);
  });

  it("a contagem do cabeçalho usa o MESMO predicado da coluna", () => {
    const a = comTravadas([0, 3, 0, 0, 1]);
    const b = comTravadas([0, 0, 0, 0, 5]);
    const m = computeEventosPorEtapa([a, b], STAGE_META);
    expect(m.get("layouts")).toBe(1);
    expect(m.get("producao")).toBe(2);
    // A soma PASSA do número de eventos, de propósito: 'a' conta duas vezes.
    expect([...m.values()].reduce((x, y) => x + y, 0)).toBe(3);
  });
});

