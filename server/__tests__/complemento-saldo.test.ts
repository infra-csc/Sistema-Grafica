// ─────────────────────────────────────────────────────────────────────────────
// ARITMÉTICA DE SALDO — client/src/lib/saldo.ts (código REAL, zero mock).
//
// PORQUÊ estes testes existem: o número que a Gráfica lê na linha É a ordem de
// serviço. Um erro de 1 unidade aqui não é cosmético — é peça a mais saindo da
// impressora (dinheiro) ou peça a menos chegando no evento (prejuízo de
// imagem). Estes onze cálculos viviam duplicados no topo de grafica.tsx e eram
// refeitos "na mão" na ficha e nos modais; toda vez que uma regra mudou (reuso
// parcial, conferência parcial, entrega parcial) uma das cópias ficou para
// trás. Agora há uma fonte só — e ela precisa de prova.
//
// O foco é a BORDA: null do acervo antigo, string vinda de coluna decimal,
// reuso total legado (isReuse sem reuseQty), reuso parcial, saldo negativo
// (nunca pode vazar para a UI) e o piso físico da redução, que é o espelho
// literal da validação do servidor em PATCH /api/items/:id.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import {
  qtyOf, producedOf, conferredOf, deliveredOf, reusedOf,
  isLegacyReuse, reusedTotalOf,
  remainingProduce, remainingConfer, remainingDeliver, remainingReuse,
  m2Of, m2ToProduce,
  canProduce, canConfer, canDeliver,
  isDelivered, isConferred, isProduced, isInProd,
  isComplement, complementsQtyOf, contractedTotalOf, reductionFloorOf,
  getSaldo,
  type SaldoItem,
} from "@/lib/saldo";

/** Peça-base: 10 un., nada produzido, nada reaproveitado. */
const peca = (over: Partial<SaldoItem> = {}): SaldoItem => ({
  status: "ready_for_production",
  quantity: 10,
  quantityProduced: null,
  reuseQty: 0,
  isReuse: false,
  conferredQty: 0,
  deliveredQty: 0,
  calculatedM2: "20.00",
  parentItemId: null,
  ...over,
});

// ─────────────────────────────────────────────────────────────────────────────
describe("leitura crua das quantidades (tolerância ao acervo antigo)", () => {
  it("null/undefined viram 0 — nunca NaN na tela", () => {
    const vazia: SaldoItem = {};
    expect(qtyOf(vazia)).toBe(0);
    expect(producedOf(vazia)).toBe(0);
    expect(conferredOf(vazia)).toBe(0);
    expect(deliveredOf(vazia)).toBe(0);
    expect(reusedOf(vazia)).toBe(0);
    expect(m2Of(vazia)).toBe(0);
  });

  it("string de coluna decimal é convertida (o Postgres devolve '20.00', não 20)", () => {
    expect(m2Of(peca({ calculatedM2: "20.00" }))).toBe(20);
    expect(qtyOf(peca({ quantity: "10" }))).toBe(10);
  });

  it("lixo não numérico vira 0 em vez de NaN", () => {
    expect(qtyOf(peca({ quantity: "dez" as any }))).toBe(0);
    expect(m2Of(peca({ calculatedM2: "—" as any }))).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("predicados de status (as DUAS grafias circulam no banco)", () => {
  it("entregue reconhece 'delivered' E o legado 'entregue'", () => {
    expect(isDelivered({ status: "delivered" })).toBe(true);
    expect(isDelivered({ status: "entregue" })).toBe(true);
    expect(isDelivered({ status: "conferred" })).toBe(false);
  });

  it("produzido reconhece 'produced' E o legado 'produzido'", () => {
    expect(isProduced({ status: "produced" })).toBe(true);
    expect(isProduced({ status: "produzido" })).toBe(true);
  });

  it("em produção reconhece 'inProduction' E o legado 'em_producao'", () => {
    expect(isInProd({ status: "inProduction" })).toBe(true);
    expect(isInProd({ status: "em_producao" })).toBe(true);
  });

  it("conferido só tem a grafia canônica", () => {
    expect(isConferred({ status: "conferred" })).toBe(true);
    expect(isConferred({ status: "conferido" })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("saldo a produzir", () => {
  it("peça virgem: falta produzir a quantidade inteira", () => {
    expect(remainingProduce(peca())).toBe(10);
  });

  it("produção parcial 6/10: faltam 4 — é o número do modal incremental", () => {
    expect(remainingProduce(peca({ quantityProduced: 6, status: "inProduction" }))).toBe(4);
  });

  it("REAPROVEITAMENTO PARCIAL: 4 vêm do galpão, só 6 vão para a impressora", () => {
    const p = peca({ reuseQty: 4 });
    expect(reusedTotalOf(p)).toBe(4);
    expect(remainingProduce(p)).toBe(6);
    // e com 2 já impressas, sobram 4
    expect(remainingProduce(peca({ reuseQty: 4, quantityProduced: 2 }))).toBe(4);
  });

  it("REAPROVEITAMENTO TOTAL (isReuse): nada vai para a impressora", () => {
    const total = peca({ isReuse: true, reuseQty: 10 });
    expect(reusedTotalOf(total)).toBe(10);
    expect(remainingProduce(total)).toBe(0);
    expect(canProduce(total)).toBe(false);
  });

  it("REAPROVEITAMENTO TOTAL LEGADO (isReuse sem reuseQty) cobre a peça inteira", () => {
    // A flag antiga nunca preencheu reuse_qty. Tratar reusedTotal como 0 aqui
    // mandaria 10 unidades que estão no galpão de volta para a impressora.
    const legado = peca({ isReuse: true, reuseQty: 0 });
    expect(isLegacyReuse(legado)).toBe(true);
    expect(reusedTotalOf(legado)).toBe(10);
    expect(remainingProduce(legado)).toBe(0);
  });

  it("nunca devolve negativo — produzido acima da quantidade (correção de digitação) clampa em 0", () => {
    expect(remainingProduce(peca({ quantityProduced: 14 }))).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("saldo a conferir e a entregar", () => {
  it("conferência parcial 3/10: faltam 7", () => {
    expect(remainingConfer(peca({ conferredQty: 3 }))).toBe(7);
  });

  it("entrega sai do que foi CONFERIDO, não do que foi produzido", () => {
    // 10 produzidas, só 4 conferidas: no máximo 4 podem ser entregues.
    const p = peca({ status: "produced", quantityProduced: 10, conferredQty: 4 });
    expect(remainingDeliver(p)).toBe(4);
    expect(remainingDeliver({ ...p, deliveredQty: 4 })).toBe(0);
  });

  it("reuso legado pula a conferência: a entrega sai da quantidade cheia", () => {
    // Regra antiga: peça marcada como reuso ia direto para a entrega. Mantida
    // para não travar entregas em andamento.
    const legado = peca({ isReuse: true, reuseQty: 0, conferredQty: 0 });
    expect(remainingDeliver(legado)).toBe(10);
    expect(canDeliver(legado)).toBe(true);
    expect(canConfer(legado)).toBe(false);
  });

  it("nunca devolve negativo (entregue > conferido, dado sujo do acervo)", () => {
    expect(remainingDeliver(peca({ conferredQty: 4, deliveredQty: 9 }))).toBe(0);
    expect(remainingConfer(peca({ conferredQty: 14 }))).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("saldo a reaproveitar", () => {
  it("desconta o que já foi reaproveitado e o que já foi impresso", () => {
    expect(remainingReuse(peca())).toBe(10);
    expect(remainingReuse(peca({ reuseQty: 4 }))).toBe(6);
    expect(remainingReuse(peca({ reuseQty: 4, quantityProduced: 6 }))).toBe(0);
  });

  it("usa reuseQty CRU (não o total efetivo) — o reuso legado ainda aceita marcação", () => {
    // Decisão do código: no legado (isReuse com reuse_qty = 0) a coluna nunca
    // foi preenchida, então a sobra é calculada pelo valor cru. Se este teste
    // quebrar, é porque alguém trocou reusedOf por reusedTotalOf — e aí a
    // Gráfica perde a possibilidade de registrar a quantidade reaproveitada
    // numa peça legada.
    expect(remainingReuse(peca({ isReuse: true, reuseQty: 0 }))).toBe(10);
  });

  it("nunca devolve negativo", () => {
    expect(remainingReuse(peca({ reuseQty: 8, quantityProduced: 5 }))).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("metragem", () => {
  it("sem reaproveitamento, o m² a produzir é o m² inteiro", () => {
    expect(m2ToProduce(peca({ calculatedM2: "20.00" }))).toBe(20);
  });

  it("com reuso parcial, rateia pela fração que vai para a impressora", () => {
    // 10 un. = 20 m² → 4 reaproveitadas, 6 impressas → 12 m².
    expect(m2ToProduce(peca({ calculatedM2: "20.00", reuseQty: 4 }))).toBe(12);
  });

  it("reuso total zera o m² a produzir (inclusive no legado)", () => {
    expect(m2ToProduce(peca({ calculatedM2: "20.00", isReuse: true, reuseQty: 10 }))).toBe(0);
    expect(m2ToProduce(peca({ calculatedM2: "20.00", isReuse: true, reuseQty: 0 }))).toBe(0);
  });

  it("peça sem m² gravado não inventa número", () => {
    expect(m2ToProduce(peca({ calculatedM2: null }))).toBe(0);
    expect(m2ToProduce(peca({ calculatedM2: "20.00", quantity: 0 }))).toBe(20);
  });

  it("o m² do COMPLEMENTO soma ao da mãe sem gambiarra — é o ganho do modelo", () => {
    // #0062: 10 un. / 20 m². #0062-C1: 4 un. / 8 m². O total do evento sai
    // certo somando as duas linhas, porque nenhuma agregação precisa saber o
    // que é complemento.
    const mae = peca({ quantity: 10, calculatedM2: "20.00", status: "delivered" });
    const filho = peca({ quantity: 4, calculatedM2: "8.00", parentItemId: "mae-1" });
    expect(m2Of(mae) + m2Of(filho)).toBe(28);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("gates de botão — o convite falso é o pior sintoma", () => {
  it("peça ENTREGUE não oferece produzir, conferir nem entregar", () => {
    // §5.3 da spec: é o caso principal do dono. A mãe entregue continua
    // entregue; o aumento vira complemento e NUNCA reabre a conferência dela.
    const entregue = peca({
      status: "delivered", quantityProduced: 10, conferredQty: 10, deliveredQty: 10,
    });
    expect(canProduce(entregue)).toBe(false);
    expect(canConfer(entregue)).toBe(false);
    expect(canDeliver(entregue)).toBe(false);
  });

  it("peça entregue com quantidade inflada por fora ainda assim não convida a conferir", () => {
    // Cenário do caminho silencioso antigo (hoje barrado por USE_COMPLEMENT no
    // servidor): 15 un. numa peça entregue com 10 impressas. Mesmo com o dado
    // sujo no banco, a UI não pode oferecer "conferir 5 unidades inexistentes".
    const suja = peca({
      status: "delivered", quantity: 15,
      quantityProduced: 10, conferredQty: 10, deliveredQty: 10,
    });
    expect(canConfer(suja)).toBe(false);
    expect(canDeliver(suja)).toBe(false);
    expect(canProduce(suja)).toBe(false);
  });

  it("conferir só depois de PRODUZIDO", () => {
    expect(canConfer(peca({ status: "inProduction", quantityProduced: 6 }))).toBe(false);
    expect(canConfer(peca({ status: "produced", quantityProduced: 10 }))).toBe(true);
    expect(canConfer(peca({ status: "produzido", quantityProduced: 10 }))).toBe(true);
  });

  it("peça conferida não volta para a impressora", () => {
    expect(canProduce(peca({ status: "conferred", quantityProduced: 10, conferredQty: 10 }))).toBe(false);
  });

  it("COMPLEMENTO recém-criado: só Produzir, com o saldo cheio", () => {
    // A linha que a Gráfica vê: "+4 un. — COMPLEMENTO DE #0062", Pronto para
    // Produção, botão Produzir ativo. Sem conta nenhuma.
    const filho = peca({
      status: "ready_for_production", quantity: 4, parentItemId: "mae-1",
      quantityProduced: null, reuseQty: 0, conferredQty: 0, deliveredQty: 0,
    });
    const s = getSaldo(filho);
    expect(s.isComplement).toBe(true);
    expect(s.toProduce).toBe(4);
    expect(s.canProduce).toBe(true);
    expect(s.canConfer).toBe(false);
    expect(s.canDeliver).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("complemento: identidade e total contratado", () => {
  it("parentItemId é o único critério de 'sou complemento'", () => {
    expect(isComplement(peca())).toBe(false);
    expect(isComplement(peca({ parentItemId: "mae-1" }))).toBe(true);
    expect(isComplement(peca({ parentItemId: null }))).toBe(false);
  });

  it("mãe sem complemento: contratado total = a própria quantidade", () => {
    expect(complementsQtyOf(peca())).toBe(0);
    expect(contractedTotalOf(peca({ quantity: 10 }))).toBe(10);
  });

  it("um aumento: 10 + 4 = 14", () => {
    const mae = peca({ quantity: 10, complements: [{ quantity: 4 }] });
    expect(complementsQtyOf(mae)).toBe(4);
    expect(contractedTotalOf(mae)).toBe(14);
  });

  it("DOIS AUMENTOS seguidos: 10 + 4 + 2 = 16, e a mãe segue com 10", () => {
    // É onde o modelo brilha: cada aumento mantém motivo, autor e m² próprios.
    // A quantidade da MÃE não muda — nenhum UPDATE na linha dela, nunca.
    const mae = peca({ quantity: 10, status: "delivered", complements: [{ quantity: 4 }, { quantity: 2 }] });
    expect(qtyOf(mae)).toBe(10);
    expect(contractedTotalOf(mae)).toBe(16);
    // e o ciclo da mãe continua fechado: nada a produzir/conferir/entregar
    const s = getSaldo({ ...mae, quantityProduced: 10, conferredQty: 10, deliveredQty: 10 });
    expect(s.canProduce).toBe(false);
    expect(s.canConfer).toBe(false);
    expect(s.canDeliver).toBe(false);
  });

  it("complements ausente ou com quantidade suja não quebra a soma", () => {
    expect(complementsQtyOf(peca({ complements: null }))).toBe(0);
    expect(complementsQtyOf(peca({ complements: [{ quantity: null }, { quantity: "3" }] }))).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("PISO FÍSICO da redução (espelho literal do servidor)", () => {
  // Servidor: piso = max(quantityProduced, conferredQty, deliveredQty).
  // O REUSO ficou de fora em 27/08 ("não está conseguindo diminuir"): unidade
  // reaproveitada não foi impressa — o PATCH a encolhe junto com a redução.
  it("peça virgem: piso 0 — dá para reduzir à vontade", () => {
    expect(reductionFloorOf(peca())).toBe(0);
  });

  it("o reuso NÃO soma no piso — só o impresso", () => {
    // 6 impressas + 4 do galpão: o piso é 6; as 4 do galpão encolhem junto.
    expect(reductionFloorOf(peca({ quantityProduced: 6, reuseQty: 4 }))).toBe(6);
    // toda reaproveitada (o caso #2345): piso 0
    expect(reductionFloorOf(peca({ status: "produced", reuseQty: 3, isReuse: true }))).toBe(0);
  });

  it("conferido acima do produzido levanta o piso", () => {
    expect(reductionFloorOf(peca({ quantityProduced: 3, conferredQty: 8 }))).toBe(8);
  });

  it("entregue acima de tudo levanta o piso (o caso da peça fechada)", () => {
    expect(reductionFloorOf(peca({
      status: "delivered", quantityProduced: 10, conferredQty: 10, deliveredQty: 10,
    }))).toBe(10);
  });

  it("acervo antigo com colunas nulas: piso 0, sem NaN", () => {
    expect(reductionFloorOf({ quantity: 10 })).toBe(0);
  });

  it("o piso é exatamente o que impede inventário órfão", () => {
    // "produzi 10 das 15 e o cliente desistiu das outras 5": reduzir para 10 é
    // permitido (piso 10); para 8 não — as 10 já existem no galpão.
    const p = peca({ quantity: 15, quantityProduced: 10, status: "inProduction" });
    const piso = reductionFloorOf(p);
    expect(piso).toBe(10);
    expect(10 >= piso).toBe(true);
    expect(8 >= piso).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("getSaldo — agregador coerente com os helpers individuais", () => {
  it("devolve os mesmos números que as funções soltas (produção parcial + reuso parcial)", () => {
    const p = peca({
      status: "inProduction", quantity: 10, quantityProduced: 4, reuseQty: 2,
      conferredQty: 1, deliveredQty: 0, calculatedM2: "20.00",
    });
    const s = getSaldo(p);
    expect(s).toMatchObject({
      qty: 10, produced: 4, reused: 2, reusedTotal: 2, conferred: 1, delivered: 0,
      toProduce: remainingProduce(p),
      toConfer: remainingConfer(p),
      toDeliver: remainingDeliver(p),
      toReuse: remainingReuse(p),
      m2: 20, m2ToProduce: m2ToProduce(p),
      reductionFloor: reductionFloorOf(p),
      isLegacyReuse: false, isDelivered: false, isConferred: false,
      isProduced: false, isInProd: true, isComplement: false,
      complementsQty: 0, contractedTotal: 10,
    });
    expect(s.toProduce).toBe(4); // 10 - 2 reaproveitadas - 4 impressas
  });

  it("item completamente vazio não explode e devolve tudo zerado", () => {
    const s = getSaldo({});
    expect(s.qty).toBe(0);
    expect(s.toProduce).toBe(0);
    expect(s.canProduce).toBe(false);
    expect(s.contractedTotal).toBe(0);
  });
});
