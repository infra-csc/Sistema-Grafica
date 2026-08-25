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
import { readFileSync } from "fs";
import { ehBookCompleto } from "../../shared/fluxo-peca";

const ler = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

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

describe("as portas fechadas", () => {
  const PORTAS: Array<[string, string]> = [
    ["fila da Gráfica (rota approved)", "../routes/items.ts"],
    ["Versões", "../routes/versoes.ts"],
    ["Análises", "../routes/analises.ts"],
    ["Prazos", "../routes/prazos.ts"],
    ["Relatório do evento", "../routes/relatorio.ts"],
    ["busca global", "../routes/busca.ts"],
    ["digest da revisão", "../services/revisaoDigest.ts"],
    ["Arte (fila principal)", "../../client/src/pages/arte.tsx"],
    ["Painel Geral", "../../client/src/pages/painel-geral.tsx"],
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
    expect(ler("../../client/src/pages/atendimento.tsx")).not.toContain("ehBookCompleto");
  });

  it("a Correção da Arte NÃO filtra — reprovada, a v2 precisa da porta", () => {
    // resubmission-needed monta a fila da Correção; o filtro da Arte vale só
    // para allItems (a fila principal), e este teste quebra se alguém aplicar
    // o predicado dentro da rota.
    const items = ler("../routes/items.ts");
    const i = items.indexOf('"/api/items/resubmission-needed"');
    const rota = items.slice(i, items.indexOf("app.get(", i + 10));
    expect(rota).not.toContain("ehBookCompleto");
  });
});
