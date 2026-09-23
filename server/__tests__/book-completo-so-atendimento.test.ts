// ─────────────────────────────────────────────────────────────────────────────
// A PEÇA "BOOK COMPLETO" SÓ APARECE NO ATENDIMENTO (regra do dono, 25/08).
//
// Nasceu num teste: o book inteiro do evento cadastrado como UMA peça, para o
// patrocinador aprovar o conjunto pelo fluxo do Atendimento. Ela só existe
// para esse trâmite — não é imprimível, não tem m² real, não entra em prazo.
// Em qualquer outra fila ela é ruído que infla contagem.
//
// O desenho: predicado ÚNICO em shared/fluxo-peca (ehBookCompleto), aplicado
// em cada porta. Duas exceções deliberadas, testadas aqui com nome:
//   · a CORREÇÃO da Arte (resubmission-needed) — reprovada, a v2 precisa de
//     porta de reenvio;
//   · o DETALHE DO EVENTO — registro bruto, é por lá que se edita/exclui.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { fonteDaTela } from "./fonte-da-tela";
import { readFileSync } from "fs";
import { lerTelaOuArquivo } from "./fonte-das-telas-da-arte";
import { ehBookCompleto } from "../../shared/fluxo-peca";

// Arte, Revisão e Vinculação são lidas como a área inteira (página + pasta).
const ler = (rel: string) => {
  const daRaiz = rel.replace(/^\.\.\/\.\.\//, "");
  return daRaiz !== rel ? lerTelaOuArquivo(daRaiz) : readFileSync(new URL(rel, import.meta.url), "utf8");
};

describe("o predicado", () => {
  it("casa o tipo com e sem espaço, em qualquer caixa — e nada além", () => {
    expect(ehBookCompleto({ type: "BOOK COMPLETO" })).toBe(true);
    expect(ehBookCompleto({ type: "book completo" })).toBe(true);
    expect(ehBookCompleto({ type: "Book  Completo v2" })).toBe(true);
    expect(ehBookCompleto({ type: "PLACA" })).toBe(false);
    expect(ehBookCompleto({ type: "BOOK" })).toBe(false);
    expect(ehBookCompleto(null)).toBe(false);
  });
});

// As portas do SERVIDOR (e a exceção da Correção) rodam em regras-avisos-book-completo.test.ts.
describe("as portas fechadas", () => {
  const PORTAS: Array<[string, string]> = [
    ["Arte (fila principal)", "../../client/src/pages/arte.tsx"],
    // A query de peças do Painel mora no hook de dados da tela.
    ["Painel Geral", "../../client/src/components/painel/use-painel-dados.ts"],
    ["Revisão", "../../client/src/pages/solicitacao.tsx"],
    ["Etiquetas", "../../client/src/pages/etiquetas-evento.tsx"],
  ];
  for (const [nome, rel] of PORTAS) {
    it(`${nome} filtra ehBookCompleto`, () => {
      expect(ler(rel)).toContain("ehBookCompleto(");
    });
  }
});

describe("as exceções deliberadas", () => {
  it("o Atendimento NÃO filtra — é o lugar dela", () => {
    expect(fonteDaTela("atendimento")).not.toContain("ehBookCompleto");
  });
});
