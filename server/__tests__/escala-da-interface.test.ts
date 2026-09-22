// ─────────────────────────────────────────────────────────────────────────────
// A ESCALA DA INTERFACE EXISTE, E OS DOIS TEMAS USAM OS MESMOS NOMES.
//
// Etapa 1 do redesign do Painel Geral: criar os degraus que faltavam. As regras
// que este arquivo guarda continuam as mesmas — o que mudou foi a escala, que
// deixou de ser uma segunda verdade.
//
// O QUE ACONTECEU COM ELA. Estes tokens nasceram no CSS, sem consumidor: nenhum
// .tsx lia `var(--n3)`, porque quase todo estilo deste app é INLINE e o inline
// lê `T`, `FS` e `R` de lib/theme.ts. Duas escadas, então, e elas divergiram
// em silêncio — `--r-md` valia 10 contra `R.md` 8, `--n3` valia #e7e5e4 contra
// `T.border` #e8e8e7. Ninguém viu porque ninguém usava.
//
// Agora o TypeScript é a fonte e o CSS é o ESPELHO, para o que o inline não
// alcança: pseudo-classe, media query e tema escuro. Os nomes seguem a mesma
// ideia, com duas diferenças:
//
//   · onze neutros em vez de nove (n0..n10). A tela usa onze, contados — e os
//     dois que faltavam, #f0efee e #44403c, aparecem em 90 e 231 pontos;
//   · a tipografia usa o nome do degrau (--fs-body) em vez do número
//     (--fs-3), porque é assim que FS se chama do outro lado do espelho.
//
// O casamento valor a valor entre os dois lados é conferido em
// design-system.test.ts ("theme.ts e index.css carregam os mesmos valores").
// Aqui ficam as regras da escala em si.
//
// A regra que fica: token de tema só serve se o tema escuro redefinir o MESMO
// nome. Um token que existe só no claro é um literal com nome bonito.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const css = readFileSync(path.resolve(__dirname, "../../client/src/index.css"), "utf8");

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

/** Lê um token do bloco pedido. */
function token(nome: string, bloco: "claro" | "escuro"): string {
  const inicio = bloco === "claro"
    ? css.indexOf("A ESCALA DA INTERFACE")
    : css.indexOf(".dark {", css.indexOf("A ESCALA DA INTERFACE"));
  const fim = bloco === "claro" ? css.indexOf(".dark {", inicio) : css.indexOf("}", inicio);
  const trecho = css.slice(inicio, fim);
  return trecho.match(new RegExp(`--${nome}:\\s*([^;]+);`))?.[1]?.trim() ?? "";
}

/** Os degraus da escada, na ordem. */
const NEUTROS = Array.from({ length: 11 }, (_, i) => `n${i}`);
/** Os nomes da escala tipográfica — os mesmos de FS em lib/theme.ts. */
const TAMANHOS = ["micro", "small", "meta", "body", "read", "strong", "lead", "title", "h2", "h1"];

describe("a escala existe", () => {
  it("onze neutros, dez tamanhos, seis espaçamentos", () => {
    for (const n of NEUTROS) expect(token(n, "claro"), `--${n}`).toMatch(/^#[0-9a-f]{6}$/i);
    for (const t of TAMANHOS) expect(token(`fs-${t}`, "claro"), `--fs-${t}`).toMatch(/^\d+px$/);
    for (let i = 1; i <= 6; i++) expect(token(`sp-${i}`, "claro")).toMatch(/^\d+px$/);
  });

  it("a escada de neutros só escurece — sem degrau fora de ordem", () => {
    // Um degrau que não escurece é um degrau que não existe: se n4 e n5 têm o
    // mesmo peso, a borda forte e a borda comum viram a mesma borda.
    const claros = NEUTROS.map(n => contraste(token(n, "claro"), "#ffffff"));
    for (let i = 1; i < claros.length; i++) {
      expect(claros[i], `${NEUTROS[i]} tem de ser mais escuro que ${NEUTROS[i - 1]}`)
        .toBeGreaterThan(claros[i - 1]);
    }
  });

  it("a tipografia só cresce, e o piso é 10px", () => {
    const px = TAMANHOS.map(t => Number(token(`fs-${t}`, "claro").replace("px", "")));
    expect(px[0], "abaixo de 10px não se lê no galpão").toBe(10);
    for (let i = 1; i < px.length; i++) expect(px[i]).toBeGreaterThan(px[i - 1]);
    // 16px é o degrau do campo no celular: abaixo disso o iOS dá zoom sozinho.
    expect(px).toContain(16);
  });

  it("o espaçamento é grade de 4", () => {
    for (let i = 1; i <= 6; i++) {
      const v = Number(token(`sp-${i}`, "claro").replace("px", ""));
      expect(v % 4).toBe(0);
    }
  });

  it("há UMA altura de controle de ponteiro e UMA de dedo", () => {
    expect(token("ctl-h", "claro")).toBe("36px");
    expect(token("ctl-h-touch", "claro")).toBe("44px");
  });

  it("a sombra tem três degraus nomeados, e nenhum quarto", () => {
    // Eram --sh-1 sozinho. Três porque SHADOW tem três (rente, destacado,
    // flutuante) e o espelho não pode ter menos degraus que a fonte.
    for (const s of ["sh-sm", "sh-md", "sh-lg"]) expect(token(s, "claro"), `--${s}`).toBeTruthy();
    expect(css).not.toContain("--sh-2:");
    expect(css).not.toContain("--sh-xl:");
  });

  it("a linha da tabela tem altura única", () => {
    expect(token("row-h", "claro")).toBe("64px");
  });

  it("o corpo tem line-height de leitura", () => {
    expect(token("lh-body", "claro")).toBe("1.5");
  });

  it("e o movimento tem as duas durações da casa", () => {
    expect(token("dur-rapida", "claro")).toBe("120ms");
    expect(token("dur-media", "claro")).toBe("180ms");
  });
});

describe("os dois temas usam os mesmos nomes", () => {
  it("o tema escuro redefine todos os onze neutros", () => {
    for (const n of NEUTROS) {
      expect(token(n, "escuro"), `--${n} no escuro`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(token(n, "escuro")).not.toBe(token(n, "claro"));
    }
  });

  it("a escada dos neutros passa AA como texto NOS DOIS temas", () => {
    // n7 para baixo é o TEXTO; n6 para cima é superfície, borda e decoração.
    // O corte mudou de lugar quando a escada ganhou dois degraus, mas continua
    // sendo o mesmo corte: o último tom que não se lê e o primeiro que se lê.
    for (const tema of ["claro", "escuro"] as const) {
      const fundo = token("n0", tema);
      for (const t of ["n7", "n8", "n9", "n10"]) {
        expect(contraste(token(t, tema), fundo), `${t} no tema ${tema}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("n6 é reconhecidamente insuficiente para conteúdo", () => {
    // Está na escala de propósito, para desabilitado e ícone decorativo. Se
    // alguém o usar como texto, o número explica por que não pode.
    expect(contraste(token("n6", "claro"), token("n0", "claro"))).toBeLessThan(4.5);
  });
});
