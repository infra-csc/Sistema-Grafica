// ─────────────────────────────────────────────────────────────────────────────
// O REPARO DOS MOTIVOS QUE PERDERAM O "S".
//
// A entrada destes testes é o texto REAL que apareceu na tela de Correção, e a
// saída esperada é o que a pessoa escreveu. O que este arquivo trava:
//
//   1. O reparo determinístico funciona — e só ele. Espaço duplo era um "s"
//      colado a um espaço; espaço simples pode ser espaço de verdade.
//
//   2. O reparo NÃO INVENTA. Um texto que já está inteiro tem de sair
//      idêntico: rodar a ferramenta duas vezes não pode corromper nada.
//
//   3. O detector não confunde texto curto ou sem "s" legítimo com dano.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import {
  pareceMotivoDanificado,
  repararMotivoSemS,
  suspeitasDeSNoMeio,
} from "../../shared/reparo-motivo";

/** O texto exatamente como o defeito o gravou (medido na tela de Correção). */
const DANIFICADO = "A cor do logo parece de botada, o roxo é bem mai  vivo - preci amo  garantir que ele  eja Core Purple";

describe("o reparo determinístico", () => {
  const reparado = repararMotivoSemS(DANIFICADO);

  it('devolve o "s" no fim de palavra: "mai  vivo" → "mais vivo"', () => {
    expect(reparado).toContain("mais vivo");
  });

  it('devolve o "s" no começo de palavra: "ele  eja" → "ele seja"', () => {
    expect(reparado).toContain("ele seja");
  });

  it('e o "s" que fecha "precisamos"', () => {
    expect(reparado).toContain("amos garantir");
  });

  it("mas NÃO tenta o s do meio da palavra — o buraco fica à vista", () => {
    // "desbotada" e "precisamos" perderam um "s" INTERNO, que virou espaço
    // simples e não tem como ser distinguido de um espaço de verdade.
    expect(reparado).toContain("de botada");
    expect(reparado).toContain("preci amos");
  });
});

describe("o reparo não estraga o que está inteiro", () => {
  const INTEIRO = "A cor do logo parece desbotada, o roxo é bem mais vivo.";

  it("texto sadio sai idêntico", () => {
    expect(repararMotivoSemS(INTEIRO)).toBe(INTEIRO);
  });

  it("e rodar duas vezes não muda nada", () => {
    const uma = repararMotivoSemS(DANIFICADO);
    expect(repararMotivoSemS(uma)).toBe(uma);
  });
});

describe("o detector", () => {
  it("acusa o texto mastigado", () => {
    expect(pareceMotivoDanificado(DANIFICADO)).toBe(true);
  });

  it("não acusa texto com s", () => {
    expect(pareceMotivoDanificado("A cor parece desbotada e o roxo está apagado")).toBe(false);
  });

  it("nem texto curto demais para ter opinião", () => {
    // "Cor errada" nao tem "s" minusculo e esta perfeito — por isso o piso.
    expect(pareceMotivoDanificado("Cor errada")).toBe(false);
  });
});

describe("as suspeitas que sobram são para o olho humano", () => {
  it("apontam onde ainda pode faltar um s no meio", () => {
    const sugestoes = suspeitasDeSNoMeio(repararMotivoSemS(DANIFICADO)).join(" ");
    expect(sugestoes).toContain("de botada");
  });
});
