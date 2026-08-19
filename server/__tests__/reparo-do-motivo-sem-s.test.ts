// ─────────────────────────────────────────────────────────────────────────────
// O REPARO DOS MOTIVOS QUE PERDERAM O "S".
//
// A PROVA DESTE ARQUIVO. Em vez de escrever à mão o que "deveria sair", ele
// pega o texto ORIGINAL, aplica o defeito exatamente como o servidor aplicou, e
// exige que o reparo devolva o original. É a única forma de medir honestamente
// quanto se recupera — e de descobrir o que NÃO se recupera.
//
// O que ficou provado:
//
//   • com o vocabulário do próprio banco, o texto longo volta INTEIRO;
//   • sem vocabulário, volta só o "s" de borda (espaço duplo);
//   • palavra que ninguém escreveu antes fica com o buraco à vista, e o buraco
//     é reportado em vez de ser preenchido por chute.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import {
  pareceMotivoDanificado as temAssinaturaDeDano,
  montarLexico,
  pareceMotivoDanificado,
  repararMotivoSemS,
} from "../../shared/reparo-motivo";

/** O defeito, exatamente como o servidor o aplicou. */
const quebrar = (t: string) => t.replace(/s+/g, " ");

/** O motivo real que apareceu na tela de Correção (peça #2222). */
const ORIGINAL =
  "Seguem os ajustes necessários : • Na peça onde consta a chancela 'Patrocínio', " +
  "substituir por 'Realização'. • Espaço Bem-estar: recuar um pouco a ilustração " +
  "para mantê-la mais afastada da logomarca. • Estande local: falta informar o nome " +
  "(enviaremos a arte pronta) • Peça balcão: conforme demais etapas , não teremos " +
  "esta peça, certo?";

/**
 * O vocabulário que o banco teria: outros motivos, escritos FORA da janela do
 * defeito, com as mesmas palavras do dia a dia da Arte. Nenhum deles é o texto
 * danificado — se fosse, o teste seria circular.
 */
const CORPUS_INTEGRO = [
  "Seguem os ajustes necessários para a arte",
  "Onde consta a chancela, favor substituir",
  "O Espaço Bem-estar precisa de mais respiro",
  "Recuar a ilustração para deixar mais afastada",
  "O Estande local ainda não tem nome",
  "Enviaremos a arte pronta ainda hoje",
  "Conforme as demais etapas do evento",
  "Não teremos esta peça neste ciclo",
];

describe("o defeito e a sua assinatura", () => {
  const quebrado = quebrar(ORIGINAL);

  it("some com todos os s minúsculos", () => {
    expect(quebrado).not.toMatch(/s/);
    expect(quebrado).toContain("aju te");     // "ajustes"
    expect(quebrado).toContain("nece ário");  // "necessários" — o "ss" virou UM espaço
  });

  it("e o detector reconhece", () => {
    expect(pareceMotivoDanificado(quebrado)).toBe(true);
    expect(pareceMotivoDanificado(ORIGINAL)).toBe(false);
  });
});

describe("com o vocabulário do próprio banco", () => {
  const lex = montarLexico(CORPUS_INTEGRO);
  const reparado = repararMotivoSemS(quebrar(ORIGINAL), lex);

  it("devolve o texto inteiro", () => {
    expect(reparado).toBe(ORIGINAL);
  });

  it("inclusive o 'ss' de necessários, que virou um espaço só", () => {
    expect(reparado).toContain("necessários");
  });

  it("e o texto deixa de ter a assinatura do dano", () => {
    expect(temAssinaturaDeDano(reparado)).toBe(false);
  });
});

describe("sem vocabulário, recupera só o que é certo", () => {
  const reparado = repararMotivoSemS(quebrar(ORIGINAL));

  it("devolve o s de borda", () => {
    expect(reparado).toContain("Seguem os");
  });

  it("mas deixa o do meio da palavra à vista, em vez de inventar", () => {
    expect(reparado).toContain("aju");
    expect(reparado).not.toContain("ajustes");
  });
});

describe("o reparo não estraga o que está inteiro", () => {
  const lex = montarLexico(CORPUS_INTEGRO);

  it("texto sadio sai idêntico", () => {
    expect(repararMotivoSemS(ORIGINAL, lex)).toBe(ORIGINAL);
  });

  it("e rodar duas vezes não muda nada", () => {
    const uma = repararMotivoSemS(quebrar(ORIGINAL), lex);
    expect(repararMotivoSemS(uma, lex)).toBe(uma);
  });
});

describe("palavra que ninguém escreveu antes", () => {
  const lex = montarLexico(["texto sem nada a ver"]);

  it("fica com o buraco em vez de inventar a palavra", () => {
    const reparado = repararMotivoSemS(quebrar("a cor está desbotada"), lex);
    // Sem vocabulário que confirme, o espaço FICA. E não existe sinal
    // automático de 'ainda está quebrado' depois disso: a assinatura do dano
    // é a ausência de s, e ela cai assim que um único s é reposto. Quem julga
    // é quem lê o antes e o depois na ferramenta.
    expect(reparado).not.toContain("desbotada");
    expect(reparado).toContain("de botada");
  });
});
