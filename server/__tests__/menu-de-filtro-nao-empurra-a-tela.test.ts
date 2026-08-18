// ─────────────────────────────────────────────────────────────────────────────
// O MENU DE UM FILTRO NUNCA EMPURRA A TELA NEM CORTA O PRÓPRIO RÓTULO.
//
// O defeito que este arquivo existe para impedir, contado uma vez:
//
// O menu era `position: absolute` dentro do próprio controle. Elemento absoluto
// ESTENDE a área rolável do documento — então, no filtro mais à direita da
// faixa, o menu abria para fora da janela, a página inteira ganhava rolagem
// horizontal e o conteúdo da esquerda (barra lateral, começo da tabela) saía de
// vista. O menu não empurrava só a si mesmo: empurrava a tela.
//
// A escolha do lado tinha um buraco além disso. Havia um `fits()` que testava o
// lado preferido e depois o oposto, mas quando NENHUM dos dois cabia ele
// devolvia o lado preferido — exatamente o que transborda. Faltava a terceira
// saída, que é grampear na janela.
//
// E havia um segundo defeito, independente e anterior: o rótulo da opção é
// `flex: 1` com `text-overflow: ellipsis`, ou seja, sua largura mínima é ZERO.
// Ele nunca empurra o menu; só encolhe até virar reticências. Como a largura
// efetiva vinha do piso, e o piso de um filtro `fullWidth` era a largura do
// gatilho, o Foco (gatilho de 120px) abria um menu de 120px mostrando
// "Reprovad…", "Em event…", "Só pendê…".
//
// Por fim, a armadilha do `fixed`: qualquer ancestral com `transform`, `filter`
// ou `will-change` vira o bloco de contenção dele, e o menu deixa de se
// posicionar pela janela. Medindo ao vivo com um ancestral deslocado em 300px,
// o painel foi parar em `left: 2710`. Este controle é usado em 15 telas, dentro
// de containers que não controlamos — por isso o painel mora no <body> via
// portal, onde não existe ancestral algum.
//
// Os testes leem o FONTE porque o que se quer travar é a decisão de layout, e
// não um pixel: renderizar em jsdom mediria zero, já que jsdom não faz layout.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const fonte = readFileSync(
  path.resolve(__dirname, "../../client/src/components/filter-select.tsx"),
  "utf8",
);

describe("menu de filtro: não empurra a tela", () => {
  it("o painel é fixed, e não absolute", () => {
    // Dentro de modal ele vira `absolute` de propósito: `fixed` ali seria
    // capturado pelo transform do Radix, e o painel precisa ficar na
    // subárvore do modal para receber clique, foco e roda do mouse.
    expect(fonte).toContain('position: dentroDeModal ? "absolute" : "fixed"');
  });

  it("o painel mora no <body>, fora do alcance de ancestral transformado", () => {
    expect(fonte).toContain("createPortal");
    expect(fonte).toContain("), dentroDeModal ?? document.body)}");
  });

  it("a posição é grampeada na janela, e não apenas escolhida entre dois lados", () => {
    // O grampo tem de existir nos DOIS sentidos: teto pela direita e piso pela
    // esquerda. Só um dos dois deixa o menu sair pelo outro lado.
    expect(fonte).toMatch(/Math\.min\(preferido, maximo\)/);
    expect(fonte).toMatch(/Math\.max\(caixa\.left \+ RESPIRO, /);
    expect(fonte).toMatch(/caixa\.right - width - RESPIRO/);
  });

  it("não sobrou o fallback que devolvia o lado que transborda", () => {
    expect(fonte).not.toContain("const fits =");
    expect(fonte).not.toContain("effectiveAlign");
  });
});

describe("menu de filtro: não corta o próprio rótulo", () => {
  it("a largura tem um piso próprio, independente da largura do gatilho", () => {
    expect(fonte).toContain("PISO_PAINEL");
    expect(fonte).toMatch(/Math\.max\(panelWidth \?\? \(fullWidth \? rect\.width : 280\), PISO_PAINEL\)/);
  });

  it("o piso comporta o maior rótulo do app", () => {
    const m = fonte.match(/const PISO_PAINEL = (\d+);/);
    expect(m).not.toBeNull();
    // "Em evento com caminhão atrasado" mede 199px em 12px, e ainda dividem a
    // linha a caixa de seleção e a contagem.
    expect(Number(m![1])).toBeGreaterThanOrEqual(220);
  });

  it("o painel cresce com o conteúdo: piso e teto, nunca largura travada", () => {
    expect(fonte).toContain("minWidth: pos?.minWidth");
    expect(fonte).toContain("maxWidth: TETO_PAINEL");
    expect(fonte).not.toContain("width: pos?.width");
  });

  it("o grampo mede a largura REAL do painel, não uma suposta", () => {
    expect(fonte).toContain("painelRef.current?.getBoundingClientRect().width");
  });
});

describe("menu de filtro: o portal não quebra o clique-fora", () => {
  it("clique dentro do painel portado não conta como clique fora", () => {
    // Sem esta checagem o primeiro clique numa opção fecharia o menu antes de
    // a opção ser marcada, porque o painel não está dentro de `ref`.
    expect(fonte).toContain("painelRef.current?.contains(alvo)");
  });
});
