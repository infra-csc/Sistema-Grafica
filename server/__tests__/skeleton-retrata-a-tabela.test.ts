// ─────────────────────────────────────────────────────────────────────────────
// O SKELETON É O RETRATO DA TABELA QUE VAI CHEGAR.
//
// O defeito que este arquivo existe para impedir, contado uma vez:
//
// O skeleton do Painel Geral desenhava uma FAIXA PRETA de 40px, porque quando
// ele foi escrito o cabeçalho da tabela era escuro. O cabeçalho virou claro
// (#fafaf9 com texto #57534e) numa passada posterior e ninguém voltou aqui.
//
// Resultado: com 3.187 peças a caminho, a primeira coisa que todo mundo via era
// uma tarja preta larga — que ainda por cima lê como erro ou censura — e que
// sumia quando os dados chegavam. Um piscar de um design que não existe mais.
//
// Os outros números também haviam se soltado do real, medidos no DOM: a linha
// da tabela tem 63px e o skeleton fazia ~38; a zebra é #f6f4f1 e ele usava
// #fafaf9. Skeleton que não bate com o conteúdo entrega justamente o layout
// shift que ele existe para evitar.
//
// A regra que fica: skeleton é cópia, não ilustração. Quando a tabela muda, ele
// muda junto — senão vira o retrato de uma tela antiga, e ninguém percebe
// porque só aparece por um segundo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const painel = readFileSync(path.resolve(__dirname, "../../client/src/pages/painel-geral.tsx"), "utf8");

/** O bloco do skeleton da tabela. */
function skeleton(): string {
  const i = painel.indexOf('aria-label="Carregando peças"');
  expect(i).toBeGreaterThan(-1);
  return painel.slice(i - 400, i + 1600);
}

describe("o skeleton copia a tabela real", () => {
  it("não desenha mais a faixa escura do cabeçalho antigo", () => {
    expect(skeleton()).not.toContain('backgroundColor: "#1c1917"');
  });

  it("o cabeçalho falso usa o mesmo fundo e filete do thead real", () => {
    const s = skeleton();
    expect(s).toContain('backgroundColor: "#fafaf9"');
    expect(s).toContain('borderBottom: "1px solid #e7e5e4"');
  });

  it("a zebra falsa usa a mesma cor da zebra real", () => {
    // A tabela alterna #ffffff e #f6f4f1 (ver .pg-row[data-zebra]).
    expect(skeleton()).toContain('"#f6f4f1" : "#ffffff"');
    expect(painel).toContain('.pg-row[data-zebra="1"] { background-color: #f6f4f1; }');
  });

  it("a linha falsa tem a altura da linha real", () => {
    // 63px foi medido no DOM, com dados de produção.
    expect(skeleton()).toContain("height: 63");
  });

  it("continua anunciando a carga para leitor de tela", () => {
    // O motivo de o skeleton existir não é visual: é dizer que há trabalho em
    // curso. Perder isto num ajuste de cor seria trocar um defeito por outro.
    expect(skeleton()).toContain('aria-busy="true"');
  });
});
