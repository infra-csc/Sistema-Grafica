// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// O FOCO DEPOIS DO DIÁLOGO DO REAPROVEITAR (revisão adversarial, 16/10).
//
// Na tabela compacta o "Reaproveitar" mora no menu "⋯", que FECHA ao abrir o
// diálogo. O Radix devolve o foco ao botão que abriu — escondido junto com o
// menu —, e o foco caía no <body>: quem usa teclado perdia o lugar na fila.
// O diálogo aceita `focoAoFechar`; a linha manda o próprio botão "⋯".
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";

vi.setConfig({ testTimeout: 60_000 });
const h = React.createElement;

afterEach(() => cleanup());

describe("o foco volta a um elemento VISÍVEL quando o diálogo do Reaproveitar fecha", () => {
  it("Esc no diálogo: o foco vai para o alvo dado (o botão '⋯' da linha), não para o <body>", async () => {
    (Element.prototype as any).scrollIntoView = () => {};
    (Element.prototype as any).hasPointerCapture = () => false;
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } }));
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    const { DialogoReaproveitar } = await import("../../client/src/components/reaproveitamento/dialogo-reaproveitar");

    function Linha() {
      const [aberto, setAberto] = React.useState(false);
      const [menu, setMenu] = React.useState(false);
      const [qtd, setQtd] = React.useState(1);
      return h("div", null,
        h("button", { "data-testid": "mais", onClick: () => setMenu(true) }, "⋯"),
        // o item do menu some quando o diálogo abre (como na tabela compacta)
        menu && h("button", { "data-testid": "reaproveitar", onClick: () => { setMenu(false); setAberto(true); } }, "Reaproveitar"),
        h(DialogoReaproveitar, {
          peca: { id: "p1", displayId: "#6033", type: "Placa", quantity: 10 },
          aberto, ajuste: false, minimo: 1, maximo: 10, quantidade: qtd, setQuantidade: setQtd, carregando: false,
          aoConfirmar: () => {}, aoFechar: () => setAberto(false),
          focoAoFechar: () => document.querySelector<HTMLElement>('[data-testid="mais"]'),
        }),
      );
    }

    render(h(Linha));
    const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    await act(async () => { fireEvent.click(q("mais")!); });
    q("reaproveitar")!.focus();
    await act(async () => { fireEvent.click(q("reaproveitar")!); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(document.querySelector('[data-reap-dialogo]')).not.toBeNull();
    await act(async () => { fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" }); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(document.querySelector('[data-reap-dialogo]')).toBeNull();
    expect(document.activeElement).toBe(q("mais"));
  });

  it("a linha da tabela compacta manda o próprio botão '⋯' como alvo", () => {
    const src = readFileSync(path.resolve(__dirname, "..", "..", "client/src/components/grafica/fila/acoes-da-linha.tsx"), "utf8");
    expect(src).toContain('focoAoFechar={compacto ? () => document.querySelector<HTMLElement>(`[data-testid="button-mais-acoes-${item.id}"]`) : undefined}');
  });
});
