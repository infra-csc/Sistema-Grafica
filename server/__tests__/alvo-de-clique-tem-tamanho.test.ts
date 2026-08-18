// ─────────────────────────────────────────────────────────────────────────────
// TODO ALVO DE CLIQUE TEM O TAMANHO MÍNIMO DA CASA.
//
// O defeito que este arquivo existe para impedir, contado uma vez:
//
// O inventário de componentes do Painel Geral encontrou CINCO alturas
// interativas diferentes — 28, 34, 36, 38 e 44 — quando a régua do projeto tem
// duas: 44px para toque e 36px para ponteiro. Duas ficavam abaixo do mínimo:
//
//   • três botões de ação do rodapé da ficha ("Continuar em…", "Copiar link")
//     a 34px, dois pixels abaixo — o tipo de erro que ninguém vê e todo mundo
//     sente ao errar o clique;
//
//   • dois gatilhos "Mostrar os N status sem peça" com texto de 11px e 2px de
//     padding, o que dá cerca de 17px de altura clicável: menos da METADE do
//     mínimo, num controle que muda o que a faixa inteira de KPIs mostra.
//
// O conserto dos gatilhos não desenha caixa: `inline-flex` com `minHeight` e
// fundo transparente aumenta a área de clique sem mudar o traço. Alvo grande
// não precisa de moldura grande.
//
// A regra que fica: alvo de clique se mede em pixels, não em aparência. Um link
// de 11px parece pequeno e é pequeno — a diferença é que agora o teste sabe.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const painel = readFileSync(path.resolve(__dirname, "../../client/src/pages/painel-geral.tsx"), "utf8");

/** Mínimo de ponteiro da casa. Toque é 44; este arquivo cobre o piso. */
const MIN_PONTEIRO = 36;

describe("nenhum alvo interativo abaixo do mínimo", () => {
  it("não sobrou botão de 34px", () => {
    expect(painel).not.toContain("height: 34,");
  });

  it("os gatilhos de texto ganharam área de clique, não moldura", () => {
    // minHeight + inline-flex + fundo transparente: cresce o alvo, não o traço.
    const gatilhos = painel.split('padding: "0 2px", fontSize: 11').length - 1;
    expect(gatilhos).toBe(2);
    expect(painel).not.toContain('padding: "2px 2px"');
  });

  it("toda altura interativa declarada respeita o piso", () => {
    // Varre as alturas em elementos com cursor:pointer. Ícones (28px) ficam de
    // fora porque não são alvo — o que importa é o que responde a clique.
    const linhas = painel.split(/\r?\n/)
      .filter(l => l.includes("cursor: \"pointer\""))
      // As caixas de seleção são a EXCEÇÃO CONHECIDA registrada abaixo. Sem
      // excluí-las aqui este teste ficaria vermelho para sempre e deixaria de
      // proteger todo o resto.
      .filter(l => !l.includes("accentColor"));
    const alturas = linhas
      .map(l => l.match(/height: (\d+),/)?.[1])
      .filter((h): h is string => Boolean(h))
      .map(Number);
    expect(alturas.length).toBeGreaterThan(0);
    for (const h of alturas) expect(h).toBeGreaterThanOrEqual(MIN_PONTEIRO);
  });

  it("AINDA PENDENTE: as caixas de seleção são 15×15", () => {
    // Este teste NÃO celebra o estado atual — ele o mantém visível.
    //
    // As caixas de seleção da tabela são <input type="checkbox"> de 15×15. A
    // WCAG 2.5.8 pede 24×24 no nível AA, e a régua da casa pede 36 de
    // ponteiro. Não há correção CSS-only: `padding` não se aplica a input,
    // `transform` não muda a caixa de layout, e `::before` não renderiza em
    // elemento substituído. O conserto certo é envolver num <label> com
    // padding e margem negativa, em mais de um ponto (cabeçalho do grupo,
    // linha da tabela) — reestruturação de linha, que pede passada própria e
    // verificação ao vivo.
    //
    // Quando isso for feito, este teste DEVE falhar. É o sinal de que a
    // pendência acabou e a hora de trocá-lo pela regra de verdade.
    const caixas = painel.split(/\r?\n/).filter(l => l.includes("accentColor"));
    expect(caixas.length).toBe(2);
    for (const l of caixas) expect(l).toContain("height: 15,");
  });
});
