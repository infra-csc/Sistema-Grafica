// ─────────────────────────────────────────────────────────────────────────────
// A ESCALA DA INTERFACE EXISTE, E OS DOIS TEMAS USAM OS MESMOS NOMES.
//
// Etapa 1 do redesign do Painel Geral: criar os degraus que faltavam.
//
// O que já existia e continua sendo fonte da verdade: os tokens do shadcn com
// o bloco .dark, os --orange-* da marca, e lib/status.ts com as cores de status
// de peça em JS.
//
// O que NÃO existia: a escala. Sem ela a tela escrevia 300 valores literais no
// JSX — medido — e nenhum respondia a troca de tema.
//
// NOTA sobre os --status-* que já estavam no arquivo: eles têm classes geradas
// e NENHUM .tsx os consome. São tokens mortos de uma tentativa anterior. Não
// construí sobre eles de propósito: a fonte viva é lib/status.ts, e verdade
// duplicada em dois lugares é como ela se perde.
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
    ? css.indexOf("ESCALA DA INTERFACE")
    : css.indexOf(".dark {", css.indexOf("ESCALA DA INTERFACE"));
  const fim = bloco === "claro" ? css.indexOf(".dark {", inicio) : inicio + 900;
  const trecho = css.slice(inicio, fim);
  return trecho.match(new RegExp(`--${nome}:\s*([^;]+);`))?.[1]?.trim() ?? "";
}

describe("a escala existe", () => {
  it("nove neutros, cinco tamanhos, seis espaçamentos", () => {
    for (let i = 0; i <= 8; i++) expect(token(`n${i}`, "claro")).toMatch(/^#[0-9a-f]{6}$/i);
    for (let i = 1; i <= 5; i++) expect(token(`fs-${i}`, "claro")).toMatch(/^\d+px$/);
    for (let i = 1; i <= 6; i++) expect(token(`sp-${i}`, "claro")).toMatch(/^\d+px$/);
  });

  it("o espaçamento é grade de 4", () => {
    for (let i = 1; i <= 6; i++) {
      const v = Number(token(`sp-${i}`, "claro").replace("px", ""));
      expect(v % 4).toBe(0);
    }
  });

  it("há UMA altura de controle e UM nível de sombra", () => {
    expect(token("ctl-h", "claro")).toBe("36px");
    expect(token("ctl-h-touch", "claro")).toBe("44px");
    expect(token("sh-1", "claro")).toBeTruthy();
    expect(css).not.toContain("--sh-2:");
  });

  it("a linha da tabela tem altura única", () => {
    expect(token("row-h", "claro")).toBe("64px");
  });

  it("o corpo tem line-height de leitura", () => {
    expect(token("lh-body", "claro")).toBe("1.5");
  });
});

describe("os dois temas usam os mesmos nomes", () => {
  it("o tema escuro redefine todos os nove neutros", () => {
    for (let i = 0; i <= 8; i++) {
      expect(token(`n${i}`, "escuro")).toMatch(/^#[0-9a-f]{6}$/i);
      expect(token(`n${i}`, "escuro")).not.toBe(token(`n${i}`, "claro"));
    }
  });

  it("a escada dos neutros passa AA como texto NOS DOIS temas", () => {
    // n6, n7 e n8 são os degraus de conteúdo; n5 para baixo é desabilitado.
    for (const tema of ["claro", "escuro"] as const) {
      const fundo = token("n0", tema);
      for (const t of ["n6", "n7", "n8"]) {
        expect(contraste(token(t, tema), fundo)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("n5 é reconhecidamente insuficiente para conteúdo", () => {
    // Está na escala de propósito, para desabilitado e ícone decorativo. Se
    // alguém o usar como texto, o número explica por que não pode.
    expect(contraste(token("n5", "claro"), token("n0", "claro"))).toBeLessThan(4.5);
  });
});
