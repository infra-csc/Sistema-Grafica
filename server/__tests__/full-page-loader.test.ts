// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// O LOADER DE PÁGINA INTEIRA CENTRALIZADO (passada visual, 23/09).
//
// Com o app rodando, "NORTE / Carregando…" aparecia encostado na borda
// ESQUERDA: a div tinha `flex items-center justify-center h-dvh`, mas dentro
// de um pai flex em LINHA ela encolhia até o conteúdo — e o `justify-center`
// só centraliza dentro da largura que a própria div tem. O conserto é ela
// ocupar a largura toda (`w-full`).
//
// O jsdom não calcula layout (nem carrega o Tailwind), então o que se prende
// aqui é o contrato de classes que produz o layout — montado de verdade,
// dentro de um pai flex em linha como o da casca do app.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach } from "vitest";
import * as React from "react";
import { readFileSync } from "fs";
import path from "path";
import { render, cleanup } from "@testing-library/react";
import { FullPageLoader } from "@/components/full-page-loader";

const h = React.createElement;
afterEach(cleanup);

describe("FullPageLoader", () => {
  it("ocupa a largura toda e centraliza nos dois eixos, mesmo num pai flex em linha", () => {
    const { getByRole } = render(h("div", { style: { display: "flex", flexDirection: "row" } }, h(FullPageLoader)));
    const raiz = getByRole("status");
    const classes = raiz.className.split(/\s+/);
    // Largura: sem isto a div encolhe até o conteúdo e o texto cola na esquerda.
    expect(classes).toContain("w-full");
    // Centralização horizontal e vertical, na altura da janela.
    for (const c of ["flex", "items-center", "justify-center", "h-dvh"]) expect(classes).toContain(c);
    // Nenhuma largura fixa ou máxima que devolva o problema por outro caminho.
    expect(raiz.style.width).toBe("");
    expect(raiz.style.maxWidth).toBe("");
  });

  it("mostra a marca e o texto empilhados e centralizados, e é anunciado a leitor de tela", () => {
    const { getByRole } = render(h(FullPageLoader));
    const raiz = getByRole("status");
    expect(raiz.getAttribute("aria-live")).toBe("polite");
    expect(raiz.textContent).toContain("NORTE");
    expect(raiz.textContent).toContain("Carregando…");
    const coluna = raiz.firstElementChild as HTMLElement;
    expect(coluna.style.flexDirection).toBe("column");
    expect(coluna.style.alignItems).toBe("center");
  });

  it("o App usa o componente — não há uma segunda cópia do loader para divergir", () => {
    const app = readFileSync(path.resolve(__dirname, "../../client/src/App.tsx"), "utf8");
    expect(app).toContain('import { FullPageLoader } from "@/components/full-page-loader";');
    expect(app).not.toMatch(/function FullPageLoader\s*\(/);
  });
});
