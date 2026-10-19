// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// CLONAR PEÇAS SEM SUSTO (19/10) — as telas, montadas de verdade.
//
// O caso: a Fernanda clonou "umas peças" para o Eco Run Navegantes (que já
// tinha 67) e vieram as 69 da origem, porque o diálogo abria com TUDO marcado.
//   · Diálogo: destino com peças abre com NADA marcado e o botão travado; vazio,
//     com tudo marcado (menos canceladas). Uma linha diz o modo. O botão conta.
//     A seleção não zera quando a lista da origem recarrega.
//   · Aviso: "69 peças clonadas de Eco Run Londrina · Desfazer", 30 s, e o
//     Desfazer chama a rota.
//   · Faixa: "Você clonou 69 peças de Eco Run Londrina às 22:08 · Desfazer
//     clonagem", enquanto o servidor disser que dá.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import * as React from "react";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CloneItemsDialog } from "@/components/clone-items-dialog";

const h = React.createElement;

const H = vi.hoisted(() => ({
  chamadas: [] as Array<{ metodo: string; url: string; corpo: unknown }>,
  rotas: {} as Record<string, () => unknown>,
}));

beforeAll(() => {
  if (!window.matchMedia) {
    (window as any).matchMedia = (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} });
  }
  if (!(globalThis as any).ResizeObserver) {
    (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
  vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url).split("?")[0];
    const metodo = (init?.method || "GET").toUpperCase();
    H.chamadas.push({ metodo, url: u, corpo: init?.body ? JSON.parse(String(init.body)) : undefined });
    const rota = H.rotas[`${metodo} ${u}`];
    return new Response(JSON.stringify(rota ? rota() : []), { status: 200, headers: { "content-type": "application/json" } });
  });
});

beforeEach(() => {
  cleanup();
  H.chamadas.length = 0;
  H.rotas = {};
});

async function tick(ms = 60) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }

const ORIGEM = [
  { id: "a", displayId: "#0001", type: "Pórtico", quantity: 2, status: "delivered" },
  { id: "b", displayId: "#0002", type: "Testeira", quantity: 1, status: "delivered" },
  { id: "c", displayId: "#0003", type: "Faixa", quantity: 4, status: "delivered" },
  { id: "x", displayId: "#0004", type: "Banner", quantity: 1, status: "canceled" },
];

function abrirDialogo(pecasNoDestino: number, onConfirmClone = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, queryFn: async () => [] } } });
  qc.setQueryData(["/api/items", "ev-2"], ORIGEM);
  const props = {
    open: true, onOpenChange: () => {}, eventId: "ev-1", eventName: "Eco Run Navegantes",
    allEvents: [{ id: "ev-2", name: "Eco Run Londrina", createdAt: "2026-01-01" }],
    cloneSourceId: "ev-2", setCloneSourceId: () => {}, isCloning: false, onConfirmClone, pecasNoDestino,
  };
  render(h(QueryClientProvider, { client: qc }, h(CloneItemsDialog, props)));
  return { qc, onConfirmClone };
}
const marcada = (id: string) => (screen.getByTestId(`linha-peca-clone-${id}`).querySelector("input") as HTMLInputElement).checked;

// ═════════════════════════════════════════════════════════════════════════════
describe("o diálogo: o que vem marcado depende do destino", () => {
  it("destino COM peças: nada marcado, a linha diz por quê, botão travado até escolher — e conta", () => {
    const { onConfirmClone } = abrirDialogo(67);
    for (const id of ["a", "b", "c", "x"]) expect(marcada(id), id).toBe(false);
    expect(screen.getByTestId("linha-modo-da-selecao").textContent).toBe("Nenhuma peça marcada — escolha as que vão para Eco Run Navegantes.");
    const botao = screen.getByTestId("button-confirm-clone") as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(botao.textContent).toContain("Clonar peças");
    expect(document.body.textContent).toContain("Marque ao menos uma peça.");

    fireEvent.click(screen.getByTestId("linha-peca-clone-a").querySelector("input")!);
    fireEvent.click(screen.getByTestId("linha-peca-clone-c").querySelector("input")!);
    expect(screen.getByTestId("linha-modo-da-selecao").textContent).toBe("Só as marcadas vão para Eco Run Navegantes.");
    // Reler: o botão com motivo à vista é outro nó quando destrava.
    const destravado = screen.getByTestId("button-confirm-clone") as HTMLButtonElement;
    expect(destravado.disabled).toBe(false);
    expect(destravado.textContent).toContain("Clonar 2 peças");
    fireEvent.click(destravado);
    expect(onConfirmClone).toHaveBeenCalledWith(["a", "c"]);
  });

  it("destino VAZIO: tudo marcado menos a cancelada, e a linha diz para desmarcar", () => {
    abrirDialogo(0);
    expect(["a", "b", "c"].every(marcada)).toBe(true);
    expect(marcada("x")).toBe(false);
    expect(screen.getByTestId("linha-modo-da-selecao").textContent).toBe("Todas marcadas, menos as canceladas — desmarque as que não vão.");
    expect(screen.getByTestId("button-confirm-clone").textContent).toContain("Clonar 3 peças");
    // Marcar todas (com a cancelada) e desmarcar todas continuam lá.
    fireEvent.click(screen.getByTestId("button-alternar-todas"));
    expect(screen.getByTestId("linha-modo-da-selecao").textContent).toBe("Todas marcadas — desmarque as que não vão.");
    fireEvent.click(screen.getByTestId("button-alternar-todas"));
    expect(screen.getByTestId("linha-modo-da-selecao").textContent).toBe("Nenhuma peça marcada — escolha as que vão para Eco Run Navegantes.");
  });

  it("a lista da origem recarregando (tempo real) não zera a seleção que a pessoa montou", async () => {
    const { qc } = abrirDialogo(67);
    fireEvent.click(screen.getByTestId("linha-peca-clone-b").querySelector("input")!);
    await act(async () => { qc.setQueryData(["/api/items", "ev-2"], ORIGEM.map((p) => ({ ...p }))); });
    expect(marcada("b")).toBe(true);
    expect(screen.getByTestId("button-confirm-clone").textContent).toContain("Clonar 1 peça");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
const LOTE = {
  id: "log-7", origemNome: "Eco Run Londrina", total: 69, emRascunho: 69,
  em: "2026-10-19T22:08:00.000Z", expiraEm: new Date(Date.now() + 60 * 60_000).toISOString(),
  porVoce: true, porNome: "Fernanda",
};

async function montarComToaster(filho: React.ReactElement | null) {
  const { queryClient } = await import("@/lib/queryClient");
  const { Toaster } = await import("@/components/ui/toaster");
  queryClient.clear();
  render(h(QueryClientProvider, { client: queryClient }, filho, h(Toaster)));
  return queryClient;
}

describe("o aviso depois de clonar", () => {
  it("'69 peças clonadas de Eco Run Londrina' com Desfazer por 30 s — e o Desfazer chama a rota", async () => {
    H.rotas["POST /api/events/ev-1/clone-items/desfazer"] = () => ({ removidas: 69, ficaram: [], jaExcluidas: 0, origemNome: "Eco Run Londrina" });
    await montarComToaster(null);
    const { avisarClonagem } = await import("@/components/detalhe-do-evento/desfazer-clonagem");
    await act(async () => { avisarClonagem("ev-1", { cloned: 69, lote: LOTE }); });
    await tick();
    const aviso = screen.getAllByTestId("toast")[0];
    expect(aviso.textContent).toContain("69 peças clonadas de Eco Run Londrina");
    expect(aviso.innerHTML).toContain("30000ms"); // a barra de tempo do aviso
    const desfazer = screen.getByTestId("toast-desfazer-clonagem");
    expect(desfazer.textContent).toBe("Desfazer");
    await act(async () => { desfazer.click(); });
    await tick(120);
    expect(H.chamadas).toContainEqual({ metodo: "POST", url: "/api/events/ev-1/clone-items/desfazer", corpo: { loteId: "log-7" } });
    expect(document.body.textContent).toContain("Clonagem desfeita");
    expect(document.body.textContent).toContain("69 peças de Eco Run Londrina saíram do rascunho e foram para a lixeira.");
  });

  it("sem lote (clonagem sem seleção), o aviso não oferece desfazer", async () => {
    await montarComToaster(null);
    const { avisarClonagem } = await import("@/components/detalhe-do-evento/desfazer-clonagem");
    await act(async () => { avisarClonagem("ev-1", { cloned: 5, lote: null }); });
    await tick();
    expect(screen.getAllByTestId("toast")[0].textContent).toContain("5 peças clonadas");
    expect(screen.queryByTestId("toast-desfazer-clonagem")).toBeNull();
  });
});

describe("a faixa no Detalhe do Evento", () => {
  it("'Você clonou 69 peças de Eco Run Londrina às HH:MM' + Desfazer clonagem; as que ficaram viram aviso", async () => {
    const { FaixaDaClonagem, chaveDaClonagemDesfazivel, horaCurta } = await import("@/components/detalhe-do-evento/desfazer-clonagem");
    H.rotas["GET /api/events/ev-1/clone-items/desfazivel"] = () => ({ lote: LOTE });
    H.rotas["POST /api/events/ev-1/clone-items/desfazer"] = () => ({
      removidas: 66, jaExcluidas: 0, origemNome: "Eco Run Londrina",
      ficaram: [{ id: "p1", displayId: "#1", motivo: "já saiu do rascunho" }, { id: "p2", displayId: "#2", motivo: "já saiu do rascunho" }, { id: "p3", displayId: "#3", motivo: "foi editada depois da clonagem" }],
    });
    await montarComToaster(h(FaixaDaClonagem, { eventId: "ev-1", isMobile: false }));
    await tick(150);
    const faixa = screen.getByTestId("faixa-desfazer-clonagem");
    expect(faixa.textContent).toContain(`Você clonou 69 peças de Eco Run Londrina às ${horaCurta(LOTE.em)}.`);
    expect(faixa.textContent).toContain(`Dá para desfazer até as ${horaCurta(LOTE.expiraEm)}.`);
    expect(chaveDaClonagemDesfazivel("ev-1").join("/")).toBe("/api/events/ev-1/clone-items/desfazivel");

    H.rotas["GET /api/events/ev-1/clone-items/desfazivel"] = () => ({ lote: null });
    await act(async () => { screen.getByTestId("button-desfazer-clonagem").click(); });
    await tick(200);
    expect(H.chamadas).toContainEqual({ metodo: "POST", url: "/api/events/ev-1/clone-items/desfazer", corpo: { loteId: "log-7" } });
    const aviso = screen.getAllByTestId("toast-aviso")[0];
    expect(aviso.textContent).toContain("Clonagem desfeita");
    expect(aviso.textContent).toContain("3 peças ficaram: 2 já saíram do rascunho, 1 foi editada depois da clonagem.");
    // Desfeita, o servidor diz que não há mais o que desfazer: a faixa some.
    expect(screen.queryByTestId("faixa-desfazer-clonagem")).toBeNull();
  });

  it("de outra pessoa (admin vendo), diz quem clonou; com parte já andada, diz quantas seguem em rascunho", async () => {
    const { FaixaDaClonagem } = await import("@/components/detalhe-do-evento/desfazer-clonagem");
    H.rotas["GET /api/events/ev-1/clone-items/desfazivel"] = () => ({ lote: { ...LOTE, porVoce: false, emRascunho: 60 } });
    await montarComToaster(h(FaixaDaClonagem, { eventId: "ev-1", isMobile: true }));
    await tick(150);
    const faixa = screen.getByTestId("faixa-desfazer-clonagem");
    expect(faixa.textContent).toContain("Fernanda clonou 69 peças de Eco Run Londrina");
    expect(faixa.textContent).toContain("só as 60 que seguem em rascunho.");
  });

  it("sem clonagem desfazível, nada aparece", async () => {
    const { FaixaDaClonagem } = await import("@/components/detalhe-do-evento/desfazer-clonagem");
    H.rotas["GET /api/events/ev-1/clone-items/desfazivel"] = () => ({ lote: null });
    await montarComToaster(h(FaixaDaClonagem, { eventId: "ev-1", isMobile: false }));
    await tick(150);
    expect(screen.queryByTestId("faixa-desfazer-clonagem")).toBeNull();
  });
});
