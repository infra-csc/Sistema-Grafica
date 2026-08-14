// Regra pura do lançamento de PRODUÇÃO. O campo é ABSOLUTO (grava o total)
// enquanto os dois modais irmãos são incrementais — a diferença que produzia
// perda silenciosa de registro na única tela dona desse número.
import { describe, expect, it } from "vitest";
import { avaliarProducao, ehConflitoDeProducao, tetoDeProducao } from "@/lib/grafica-producao";

const peca = (over: Record<string, unknown> = {}) => ({
  status: "inProduction", quantity: 10, quantityProduced: 0, reuseQty: 0, ...over,
});

describe("teto de produção — espelho da validação do servidor", () => {
  it("o reaproveitado não vai para a impressora e não conta como produzido", () => {
    expect(tetoDeProducao(peca({ quantity: 10, reuseQty: 4 }))).toBe(6);
  });

  it("sem reaproveitamento, o teto é a peça inteira", () => {
    expect(tetoDeProducao(peca({ quantity: 10 }))).toBe(10);
  });

  it("colunas nulas do acervo antigo não quebram a conta", () => {
    expect(tetoDeProducao({ quantity: null, reuseQty: null } as any)).toBe(0);
  });
});

describe("recusas — o que nem chega a virar requisição", () => {
  it("zero e negativo", () => {
    expect(avaliarProducao(peca(), 0).ok).toBe(false);
    expect(avaliarProducao(peca(), -3).ok).toBe(false);
  });

  it("valor não inteiro (o input aceita colar '2,5')", () => {
    const r = avaliarProducao(peca(), 2.5);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("inteiro");
  });

  it("acima do teto — e o erro explica a conta com o reaproveitamento", () => {
    const r = avaliarProducao(peca({ quantity: 10, reuseQty: 4 }), 7);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("Máximo 6");
    expect(r.erro).toContain("4 já foram reaproveitadas");
  });

  it("recusa nunca devolve payload", () => {
    expect(avaliarProducao(peca(), 99).payload).toBeNull();
  });
});

describe("expectedProduced — o lock otimista que o cliente nunca enviava", () => {
  // O guard existia no servidor (409 PRODUCTION_CONFLICT) e era código morto:
  // dois operadores do galpão com a mesma peça aberta sobrescreviam um ao
  // outro em silêncio, e o último a salvar apagava o lançamento do primeiro.
  it("vai no corpo com o total que o cliente leu ao abrir o modal", () => {
    expect(avaliarProducao(peca({ quantityProduced: 6 }), 8).payload)
      .toEqual({ quantityProduced: 8, expectedProduced: 6 });
  });

  it("na primeira produção o esperado é zero, não ausente", () => {
    expect(avaliarProducao(peca({ quantityProduced: null }), 4).payload)
      .toEqual({ quantityProduced: 4, expectedProduced: 0 });
  });
});

describe("redução do registro — a perda que era silenciosa", () => {
  it("lançar MENOS que o já produzido exige confirmação explícita", () => {
    const r = avaliarProducao(peca({ quantityProduced: 6 }), 3);
    expect(r.ok).toBe(true);
    expect(r.precisaConfirmar).toBe(true);
    // A pergunta cita os DOIS números e o que se perde — "tem certeza?" ninguém lê.
    expect(r.confirmacao).toContain("de 6 para 3");
    expect(r.confirmacao).toContain("3 un. deixam de constar");
    // ...e ensina o contrato: quem produziu 3 AGORA deveria lançar 9.
    expect(r.confirmacao).toContain("o total deveria ser 9");
  });

  it("lançar mais, ou o mesmo, passa direto", () => {
    expect(avaliarProducao(peca({ quantityProduced: 6 }), 9).precisaConfirmar).toBe(false);
    expect(avaliarProducao(peca({ quantityProduced: 6 }), 6).precisaConfirmar).toBe(false);
  });

  it("a primeira produção nunca pede confirmação", () => {
    const r = avaliarProducao(peca({ quantityProduced: 0 }), 1);
    expect(r.precisaConfirmar).toBe(false);
    expect(r.confirmacao).toBe("");
  });

  it("o caminho feliz do botão 'Tudo' (produz o teto de uma vez)", () => {
    const p = peca({ quantity: 10, reuseQty: 4 });
    const r = avaliarProducao(p, tetoDeProducao(p));
    expect(r.ok).toBe(true);
    expect(r.precisaConfirmar).toBe(false);
    expect(r.payload).toEqual({ quantityProduced: 6, expectedProduced: 0 });
  });
});

describe("tradução do 409 do servidor", () => {
  it("reconhece o conflito de concorrência pelo code do corpo cru", () => {
    expect(ehConflitoDeProducao('{"error":"Outra pessoa lançou…","code":"PRODUCTION_CONFLICT"}')).toBe(true);
  });

  it("não confunde com outros erros da mesma rota", () => {
    expect(ehConflitoDeProducao('{"error":"Quantidade inválida: 11 produzida(s)…"}')).toBe(false);
  });
});
