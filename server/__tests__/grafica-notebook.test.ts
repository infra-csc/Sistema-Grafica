// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// A GRÁFICA NO NOTEBOOK — passada visual com o app rodando (1.366×800, barra
// lateral aberta, ~1.060px úteis):
//
//   1. a fila caía para CARTÕES de celular: a tabela compacta estourava (a
//      coluna de Ações com "Entregar tubo" + "Tirar do tubo" por extenso, o
//      Status em `nowrap` e 16px de respiro em cada célula). Na compacta as
//      células respiram 10px, o Status quebra linha e o "Tirar do tubo" vira
//      ícone (com aria-label);
//   2. os 8 cartões de etapa numa grade `auto-fit` de 150px davam 6 colunas e
//      deixavam "Entregues" e "Total" órfãos numa segunda linha: agora é 8
//      numa linha quando cabem, ou 4 × 2.
//
// jsdom não faz layout: a largura da raiz é SIMULADA (como em
// grafica-tabela-largura.test.ts) e a tabela não estoura — o que se prende é a
// densidade escolhida e o que ela desenha.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", name: "Admin", email: "a@a", role: "admin", mustChangePassword: false }, isLoading: false, logout: () => {} }),
}));

const DIA = 86400000;
const agora = Date.now();
const iso = (d: number) => new Date(agora + d * DIA).toISOString();
const EVENTO = { id: "ev1", name: "Maratona de São Paulo", status: "active", startDate: iso(8).slice(0, 10), truckDepartureDate: iso(4), deadlineProducaoGrafica: -3 };

const PECAS = [
  { id: "n1", displayId: "#5001", type: "Placa km", status: "approved", quantity: 6, quantityProduced: 0 },
  // Embalada num tubo aberto: "Entregar tubo" (rótulo) + "Tirar do tubo" (ícone na compacta).
  { id: "n2", displayId: "#5002", type: "Placa km", status: "packed", quantity: 6, quantityProduced: 6, conferredQty: 6, embaladaQty: 6, tuboId: "t1" },
].map((p) => ({
  ...p, eventId: EVENTO.id, event: EVENTO, description: "Placa de quilômetro em lona", material: "LONA", finish: "ILHÓS",
  calculatedM2: "1.00", isReuse: false, observations: "", statusChangedAt: iso(-1),
}));
const TUBOS = [{ id: "t1", numero: 1, avulso: false, eventId: EVENTO.id, entregueEm: null, fechadoEm: null, linhas: [{ itemId: "n2", quantidade: 6, entregue: false }] }];

/** A largura da raiz da Gráfica (a janela menos a barra lateral de 16rem). */
let larguraDaRaiz = 1110;

beforeAll(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
  const medirOriginal = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const ehRaiz = (this as HTMLElement).style?.overflowY === "auto" && !!this.querySelector?.('[data-testid="title-grafica"]');
    return ehRaiz
      ? ({ width: larguraDaRaiz, height: 800, top: 0, left: 0, right: larguraDaRaiz, bottom: 800, x: 0, y: 0, toJSON() {} } as DOMRect)
      : medirOriginal.call(this);
  };
  vi.stubGlobal("fetch", async (url: string) => new Response(JSON.stringify(String(url).startsWith("/api/items/approved") ? PECAS : String(url).startsWith("/api/tubos") ? TUBOS : []), { status: 200, headers: { "content-type": "application/json" } }));
});

afterEach(() => cleanup());

async function montar(largura: number) {
  larguraDaRaiz = largura;
  const { queryClient } = await import("@/lib/queryClient");
  const Grafica = (await import("@/pages/grafica")).default;
  queryClient.clear();
  queryClient.setQueryData(["/api/items/approved"], PECAS);
  queryClient.setQueryData(["/api/standard-items"], []);
  queryClient.setQueryData(["/api/tubos"], TUBOS);
  await act(async () => { render(h(QueryClientProvider, { client: queryClient }, h(Grafica, null))); });
  await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
}
const $ = (s: string) => document.querySelector<HTMLElement>(s);

describe("Gráfica num notebook de 1.366px com a barra lateral aberta", () => {
  it("a fila é TABELA compacta, não cartões: células de 10px, Status que quebra linha e 'Tirar do tubo' em ícone", async () => {
    await montar(1110);
    expect(document.querySelector("table"), "tabela, não cartões").toBeTruthy();
    const cabecalhos = Array.from(document.querySelectorAll("th")).map((th) => th.textContent);
    expect(cabecalhos, "compacta: m² e Material fundidos").not.toContain("m² a produzir");
    expect(document.querySelector("th")!.style.padding).toBe("10px");
    expect($('[data-testid="celula-status-n1"]')!.style.whiteSpace).toBe("normal");
    expect($('[data-testid="celula-status-n1"]')!.style.padding).toBe("13px 10px");
    // A principal da embalada fica com rótulo; a secundária vira ícone com nome acessível.
    expect($('[data-testid="button-entregar-tubo-n2"]')!.textContent).toContain("Entregar tubo");
    const tirar = $('[data-testid="button-tirar-do-tubo-n2"]')!;
    expect(tirar.textContent?.trim()).toBe("");
    expect(tirar.getAttribute("aria-label")).toBe("Tirar do tubo: #5002");
    expect(tirar.getAttribute("title")).toBe("Tira a peça do tubo — ela volta a Conferido");
    // A principal da liberada continua à vista, fora do menu ⋯.
    expect($('[data-testid="button-production-n1"]')!.closest('[data-testid^="menu-acoes-"]')).toBeNull();
  }, 60_000);

  it("os 8 cartões de etapa: 4 × 2 no notebook, 8 numa linha na tela larga — nenhum órfão", async () => {
    await montar(1110);
    expect($('[data-testid="grade-etapas"]')!.style.gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
    expect($('[data-testid="grade-etapas"]')!.querySelectorAll('[data-testid^="stat-"]:not([data-testid$="-ativo"])').length).toBe(8);
    cleanup();
    await montar(1380);
    expect($('[data-testid="grade-etapas"]')!.style.gridTemplateColumns).toBe("repeat(8, minmax(0, 1fr))");
  }, 60_000);

  it("na tabela CHEIA nada muda: 16px de respiro, Status sem quebra e 'Tirar do tubo' por extenso", async () => {
    await montar(1500);
    expect(Array.from(document.querySelectorAll("th")).map((th) => th.textContent)).toContain("m² a produzir");
    expect(document.querySelector("th")!.style.padding).toBe("10px 16px");
    expect($('[data-testid="celula-status-n1"]')!.style.whiteSpace).toBe("nowrap");
    expect($('[data-testid="button-tirar-do-tubo-n2"]')!.textContent).toContain("Tirar do tubo");
  }, 60_000);
});
