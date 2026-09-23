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

  // Depois da migração para o design system, a altura de um alvo chega por
  // TRÊS caminhos, e o piso vale para os três:
  //   1. número cru num elemento com cursor:pointer (o que sobrou à mão);
  //   2. `alvo(base, dedo)` — a base é a altura no mouse;
  //   3. `<Botao tamanho>` — "sm" é H.sm (32), abaixo do piso de ponteiro.
  // Antes só o caminho 1 era medido: `alvo(32, dedo)` passava calado.
  const H_DO_TOKEN: Record<string, number> = { "H.sm": 32, "H.md": 36, "H.toque": 44 };

  it("toda altura interativa declarada à mão respeita o piso", () => {
    // Ícones (28px) ficam de fora porque não são alvo. As caixas de seleção
    // são a EXCEÇÃO CONHECIDA registrada abaixo (o alvo é o label em volta).
    const alturas = painel.split(/\r?\n/)
      .filter(l => l.includes("cursor: \"pointer\""))
      .filter(l => !l.includes("accentColor"))
      .flatMap(l => [...l.matchAll(/(?:^|[^A-Za-z])(?:minHeight|height): (\d+),/g)].map(m => Number(m[1])));
    for (const h of alturas) expect(h).toBeGreaterThanOrEqual(MIN_PONTEIRO);
  });

  it("toda base de alvo(base, dedo) respeita o piso no mouse", () => {
    const bases = [...painel.matchAll(/alvo\(([^,]+),\s*dedo\)/g)].map(m => {
      const b = m[1].trim();
      return /^\d+$/.test(b) ? Number(b) : H_DO_TOKEN[b];
    });
    // O painel mede alvos por este caminho; sem nenhum, o teste não mede nada.
    expect(bases.length).toBeGreaterThan(0);
    for (const b of bases) {
      expect(b, "base de alvo() fora da escada H ou sem número").toBeDefined();
      expect(b).toBeGreaterThanOrEqual(MIN_PONTEIRO);
    }
  });

  it("nenhum Botao do painel usa o tamanho abaixo do piso", () => {
    // Recorta cada Botao até o fechamento (o `=>` das props quebraria um [^>]*).
    const botoes = painel.split("<Botao").slice(1).map(b => b.slice(0, b.search(/<\/Botao>|\/>/)));
    expect(botoes.length).toBeGreaterThan(0);
    for (const b of botoes) expect(b).not.toContain('tamanho="sm"');
  });

  it("as caixas de seleção têm alvo de 36px", () => {
    // ESTE TESTE SUBSTITUI UMA PENDÊNCIA. A versão anterior dele existia só
    // para manter visível que as caixas eram 15×15 — abaixo dos 24×24 do AA
    // e dos 36 de ponteiro da casa — e foi escrita para FALHAR quando o
    // conserto chegasse. Chegou.
    //
    // Não há conserto CSS-only no próprio input: padding não se aplica a
    // elemento substituído, transform não muda a caixa de layout e ::before
    // não renderiza nele. Quem cresce é o label em volta — 36×36 de área
    // clicável, com margem negativa de 10px devolvendo ao layout o espaço
    // tomado. A caixa continua desenhada com 15px no mesmo lugar.
    expect(painel).toContain(".pg-check { display: inline-flex;");
    expect(painel).toContain("width: 36px; height: 36px; margin: -10px;");
  });

  it("as duas caixas usam o alvo — cabeçalho do grupo e linha da peça", () => {
    const labels = painel.split('<label className="pg-check"').length - 1;
    expect(labels).toBe(2);
  });

  it("o alvo da linha não abre a peça por engano", () => {
    // A linha inteira abre a peça no clique, e a área NOVA do alvo fica fora
    // do input. Sem stopPropagation no label, mirar a borda do alvo marcaria
    // a peça E abriria o modal: o alvo maior viraria uma armadilha.
    expect(painel).toContain('<label className="pg-check" onClick={(e) => e.stopPropagation()}>');
  });
});
