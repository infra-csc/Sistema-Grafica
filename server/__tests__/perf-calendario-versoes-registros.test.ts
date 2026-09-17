// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// PERFORMANCE DE REGISTROS E CALENDÁRIO — o que roda enquanto a tela ESPERA
// (PERF-4, 17/09).
//
// Auditoria rápida das três telas menores (Calendário, Versões, Registros): as
// três já filtram/paginam no lugar certo (Versões é paginada no servidor;
// Registros pagina 60 fotos e adia a busca; Calendário indexa por dia). O
// gargalo real encontrado foi outro, e silencioso:
//
//   Registros fazia `data: photos = []` — um array NOVO a cada render enquanto
//   /api/photos não chega — e tinha `useEffect(() => setBrokenIds(new Set()),
//   [photos])`. Efeito que roda a cada render e grava um Set NOVO a cada vez
//   é um laço: render → efeito → setState → render… A tela girava em falso,
//   ocupando a thread principal, durante TODA a carga — e para sempre se a
//   rota falhasse (no erro `data` continua undefined).
//
// Este arquivo conta os commits do React enquanto a rota está pendurada e
// depois de ela falhar. Calendário entra como controle: o mesmo `= []` lá não
// alimenta efeito com setState, e o número dele mostra o que é "parado".
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, vi } from "vitest";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;

vi.mock("@/contexts/auth-context", async () => {
  const R = await import("react");
  const user = { id: "u1", name: "Admin", email: "a@a", role: "admin", mustChangePassword: false };
  return {
    AuthProvider: ({ children }: any) => R.createElement(R.Fragment, null, children),
    useAuth: () => ({ user, isLoading: false, login: async () => {}, logout: async () => {} }),
  };
});

const rota = vi.hoisted(() => ({ modo: "pendurada" as "pendurada" | "erro" }));

const commits: number[] = [];
const onRender = (_id: string, _phase: string, d: number) => { commits.push(d); };
// SEM act(): dentro dele o React esvazia a fila de updates até ela acabar — e
// com o laço ela nunca acaba (o teste antigo derrubava o worker). Fora do
// act, o relógio real corre e a contagem de commits na janela é a medida.
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  (Element.prototype as any).scrollIntoView = () => {};
  vi.stubGlobal("fetch", (url: any) => {
    if (rota.modo === "erro") {
      return Promise.resolve(new Response(JSON.stringify({ error: "falhou" }), { status: 500, headers: { "content-type": "application/json" } }));
    }
    // Pendurada: nunca responde — é a carga lenta de uma rede ruim.
    return new Promise<Response>(() => {});
  });
});

async function contarCommits(Pagina: any, janelaMs: number) {
  const { queryClient } = await import("@/lib/queryClient");
  const { TooltipProvider } = await import("@/components/ui/tooltip");
  queryClient.clear();
  commits.length = 0;
  // O React avisa "Maximum update depth" no console quando o laço é detectado
  // — silenciado aqui para a contagem falar sozinha.
  const origErr = console.error;
  console.error = () => {};
  try {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = false;
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    root.render(h(QueryClientProvider, { client: queryClient } as any,
      h(TooltipProvider as any, null, h(React.Profiler, { id: "tela", onRender } as any, h(Pagina)))));
    await esperar(janelaMs);
    const n = commits.length;
    root.unmount();
    el.remove();
    return n;
  } finally {
    console.error = origErr;
  }
}

describe("telas paradas esperando a rota não giram em falso", () => {
  it("Registros: commits com /api/photos pendurada e com a rota em erro", async () => {
    const Registros = (await import("@/pages/registros")).default;

    rota.modo = "pendurada";
    const pendurada = await contarCommits(Registros, 1500);
    rota.modo = "erro";
    const erro = await contarCommits(Registros, 1500);
    console.log(`[perf-registros] ${JSON.stringify({ commitsEm1500msPendurada: pendurada, commitsEm1500msComErro: erro })}`);

    // Parada de verdade: o mount e, no erro, a troca para o estado de erro.
    // O laço dava centenas de commits na mesma janela.
    expect(pendurada).toBeLessThanOrEqual(5);
    expect(erro).toBeLessThanOrEqual(8);
  }, 60_000);

  it("Calendário (controle): commits com /api/events pendurada", async () => {
    const Calendario = (await import("@/pages/calendario")).default;
    rota.modo = "pendurada";
    const pendurada = await contarCommits(Calendario, 1500);
    console.log(`[perf-calendario] ${JSON.stringify({ commitsEm1500msPendurada: pendurada })}`);
    expect(pendurada).toBeLessThanOrEqual(5);
  }, 60_000);
});
