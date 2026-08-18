// ─────────────────────────────────────────────────────────────────────────────
// O MODAL DA PEÇA USA A PALETA DO APP.
//
// O defeito que este arquivo existe para impedir, contado uma vez:
//
// O modal da peça — 1391 linhas, aberto por CINCO telas — trazia uma paleta
// estrangeira. Ele tinha 60 cores distintas, mais que o Painel Geral inteiro
// (49), e os acentos vinham de outro sistema: #006398 e #ff5449 são tokens
// clássicos do Material 3.
//
// Duas delas eram quase-clones do que o app já tinha, a 6 unidades de distância
// — indistinguíveis lado a lado:
//
//   laranja de ação ... modal #fd761a  vs  app #f97316
//   quase-preto ....... modal #1a1c1c  vs  app #1c1917
//
// E o laranja não era só redundante: #fd761a dá 2,70 sobre branco. A régua da
// casa já proíbe o #f97316 como cor de texto por esse motivo exato, e o modal
// usava um clone dele — inclusive na "SAÍDA DO CAMINHÃO", número de 18px em
// negrito que é o dado mais importante do app (o Painel Geral inteiro é
// ordenado por ele). O dado que manda na operação era o menos legível da tela.
//
// #c2410c dá 5,18: mesma família de cor, mesma leitura de "laranja de ação", e
// passa AA.
//
// O QUE NÃO FOI MEXIDO, e por quê: os chips do cabeçalho (#ff5449, #4ade80,
// rgba brancas) vivem sobre banner ESCURO e estão corretos ali. Minha primeira
// medição os reprovou porque comparei contra branco — fundo errado. Cor só se
// julga junto do que está atrás dela.
//
// A regra que fica: componente compartilhado não tem paleta própria. Quando
// tem, ele carrega o desvio para todas as telas que o abrem.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const modal = readFileSync(path.resolve(__dirname, "../../client/src/components/item-details-dialog.tsx"), "utf8");

function contraste(a: string, b: string): number {
  const lum = (h: string) => {
    const c = [1, 3, 5]
      .map(i => parseInt(h.slice(i, i + 2), 16) / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("o modal não tem paleta própria", () => {
  it("o laranja estrangeiro sumiu", () => {
    expect(modal).not.toContain("#fd761a");
  });

  it("o quase-preto estrangeiro sumiu do texto", () => {
    expect(modal).not.toContain('color: "#1a1c1c"');
  });

  it("o laranja que ficou passa AA sobre branco", () => {
    expect(modal).toContain('color: "#c2410c"');
    expect(contraste("#c2410c", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("nenhum laranja de baixo contraste voltou como cor de texto", () => {
    // #f97316 dá 2,80 sobre branco — a régua da casa o proíbe como texto, e
    // era dele que o clone #fd761a tinha nascido.
    expect(modal).not.toContain('color: "#f97316"');
  });
});

describe("a SAÍDA DO CAMINHÃO é legível", () => {
  it("o dado mais importante do app usa o laranja que passa", () => {
    // O Painel Geral inteiro é ordenado pela saída do caminhão. Este numero
    // estava em 2,70 — abaixo até do limite de texto GRANDE, que é 3,0.
    const i = modal.indexOf("Saída do Caminhão");
    expect(i).toBeGreaterThan(-1);
    const bloco = modal.slice(i, i + 400);
    expect(bloco).toContain('color: "#c2410c"');
  });
});

describe("o cabeçalho escuro fica como está", () => {
  it("os chips sobre banner escuro continuam com as cores claras deles", () => {
    // Julgados contra o fundo certo, estao corretos. Trocá-los por cores de
    // fundo claro seria "consertar" para pior.
    expect(modal).toContain('color: "#ff5449"');
    expect(modal).toContain('color: "#4ade80"');
  });
});
