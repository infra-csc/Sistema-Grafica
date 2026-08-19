// ─────────────────────────────────────────────────────────────────────────────
// PEÇA VINDA DO ACERVO NÃO CONGELA.
//
// O beco sem saída, contado uma vez:
//
// Peça reaproveitada não pode ser PRODUZIDA — não há o que imprimir, e isso está
// certo. Só que `canConfer` exigia o status `produced`, por onde ela nunca
// passa. Sem conferência não há entrega, porque a entrega sai do conferido.
// Resultado: a peça ficava para sempre em `ready_for_production`, com um olho de
// "ver detalhes" como única ação.
//
// Medido em produção: 72 peças nesse estado. A #1656 é o retrato — quantidade 1,
// reuso 1, produzido 0, conferido 0, entregue 0.
//
// Havia uma escapatória (`isLegacyReuse`), mas ela só cobre dado ANTIGO, em que
// `reuseQty` ficava zerado. Peça reaproveitada pelo caminho novo, com `reuseQty`
// preenchido, caía exatamente no vão entre as duas regras.
//
// O QUE EU ERREI NA PRIMEIRA TENTATIVA, e vale registrar: mudei a CONTA
// (`remainingConfer`) para "produzido + reaproveitado − conferido". Um teste
// existente derrubou na hora — a peça normal do fixture tem 10 unidades, 3
// conferidas e `quantityProduced` VAZIO, porque quem garante que a produção
// aconteceu é o STATUS, não um contador. "Faltam 7" virava "faltam 0" e a tela
// inteira parava de oferecer conferência. O defeito nunca esteve na conta:
// estava no PORTÃO.
//
// A regra que fica: quando um caso especial não passa, olhe primeiro o portão
// que o barra — não a conta que ele nem chegou a usar.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { canConfer, canDeliver, remainingConfer } from "@/lib/saldo";

/** A #1656 real: tudo veio do acervo, nada produzido, nada conferido. */
const acervo = (extra: Record<string, unknown> = {}) =>
  ({
    status: "ready_for_production",
    quantity: 1, isReuse: true, reuseQty: 1,
    quantityProduced: 0, conferredQty: 0, deliveredQty: 0,
    ...extra,
  }) as any;

/** Peça normal, impressa. */
const impressa = (extra: Record<string, unknown> = {}) =>
  ({
    status: "produced",
    quantity: 10, isReuse: false, reuseQty: 0,
    conferredQty: 0, deliveredQty: 0,
    ...extra,
  }) as any;

describe("a peça de acervo entra na fila de conferência", () => {
  it("pode ser conferida mesmo sem nunca ter sido produzida", () => {
    expect(canConfer(acervo())).toBe(true);
  });

  it("o saldo a conferir é a quantidade contratada", () => {
    expect(remainingConfer(acervo({ quantity: 2, reuseQty: 2 }))).toBe(2);
  });

  it("conferida, ela passa a poder ser entregue", () => {
    // É a segunda trava da corrente: sem conferência, `remainingDeliver` é 0.
    expect(canDeliver(acervo({ conferredQty: 1 }))).toBe(true);
  });

  it("conferida e entregue, some das duas filas", () => {
    const pronta = acervo({ conferredQty: 1, deliveredQty: 1, status: "delivered" });
    expect(canConfer(pronta)).toBe(false);
    expect(canDeliver(pronta)).toBe(false);
  });
});

describe("o caminho normal continua exatamente como era", () => {
  it("a conta a conferir NÃO depende de quantityProduced", () => {
    // Foi isto que minha primeira tentativa quebrou: o fixture não preenche
    // `quantityProduced`, e amarrar a conta a ele zerava o saldo.
    expect(remainingConfer(impressa({ conferredQty: 3 }))).toBe(7);
  });

  it("peça só produzida continua conferível", () => {
    expect(canConfer(impressa())).toBe(true);
  });

  it("peça que não foi produzida nem reaproveitada NÃO é conferível", () => {
    // O portão continua existindo: o "ou" abriu uma porta, não derrubou o muro.
    const crua = impressa({ status: "ready_for_production" });
    expect(canConfer(crua)).toBe(false);
  });
});

describe("o reuso legado segue pelo caminho dele", () => {
  it("continua fora da conferência, com a entrega saindo da quantidade cheia", () => {
    // `reuseQty` zerado com isReuse true = dado antigo. Ali a entrega já
    // funcionava direto, e mexer nisso seria consertar o que não quebrou.
    const legado = acervo({ reuseQty: 0 });
    expect(canConfer(legado)).toBe(false);
    expect(canDeliver(legado)).toBe(true);
  });
});
