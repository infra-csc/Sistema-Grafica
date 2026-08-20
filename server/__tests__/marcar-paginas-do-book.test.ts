// ─────────────────────────────────────────────────────────────────────────────
// MARCAR PÁGINAS DO BOOK POR NÚMERO.
//
// Com 22 páginas, o gargalo do recorte não é decidir quais páginas levar — é
// ACHÁ-LAS na grade, rolando e conferindo miniatura por miniatura. Quem tem o
// book aberto do lado já sabe que quer "1-4, 9".
//
// Este arquivo trava o que se pode provar sem um PDF na mão, que é justamente
// onde o engano acontece: intervalo invertido, número fora da faixa, vírgula
// sobrando. E trava a decisão que não é óbvia — número fora da faixa é ignorado
// em SILÊNCIO, porque digitar 40 num book de 22 é engano de quem digita, não
// pedido para cortar o resto, e um erro na cara interromperia uma marcação que
// estava quase certa.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { interpretarIntervalo } from "../../client/src/components/book-page-picker";

describe("o que o campo de número entende", () => {
  it("o caso do enunciado: 1-4, 9", () => {
    expect(interpretarIntervalo("1-4, 9", 22)).toEqual([1, 2, 3, 4, 9]);
  });

  it("número solto", () => {
    expect(interpretarIntervalo("7", 22)).toEqual([7]);
  });

  it("intervalo invertido vale igual", () => {
    // "9-6" é o mesmo pedido que "6-9" — quem digita de trás para a frente
    // quis as mesmas páginas.
    expect(interpretarIntervalo("9-6", 22)).toEqual([6, 7, 8, 9]);
  });

  it("espaço em volta do hífen e vírgulas sobrando não atrapalham", () => {
    expect(interpretarIntervalo(" 2 - 3 ,, 5 , ", 22)).toEqual([2, 3, 5]);
  });
});

describe("o que ele ignora, em silêncio", () => {
  it("página além do fim do book", () => {
    expect(interpretarIntervalo("40", 22)).toEqual([]);
  });

  it("e o pedaço do intervalo que passa do fim", () => {
    expect(interpretarIntervalo("20-25", 22)).toEqual([20, 21, 22]);
  });

  it("zero e negativo não existem como página", () => {
    expect(interpretarIntervalo("0, -3", 22)).toEqual([]);
  });

  it("texto que não é número", () => {
    expect(interpretarIntervalo("capa, últimas", 22)).toEqual([]);
  });

  it("campo vazio", () => {
    expect(interpretarIntervalo("   ", 22)).toEqual([]);
  });
});

describe("a marcação SOMA à seleção, não substitui", () => {
  it("o que já estava marcado continua", () => {
    // O componente faz `new Set(prev)` e adiciona; aqui garantimos que a função
    // devolve só o acréscimo, sem opinião sobre o que já havia.
    const jaMarcadas = new Set([15, 16]);
    const novas = new Set(jaMarcadas);
    interpretarIntervalo("1-4, 9", 22).forEach(n => novas.add(n));
    expect(Array.from(novas).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 9, 15, 16]);
  });

  it("e repetir a mesma marcação não duplica", () => {
    const s = new Set<number>();
    interpretarIntervalo("1-4", 22).forEach(n => s.add(n));
    interpretarIntervalo("3-6", 22).forEach(n => s.add(n));
    expect(Array.from(s).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
