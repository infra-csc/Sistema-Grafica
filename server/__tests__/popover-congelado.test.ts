// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// O SEGUNDO LAÇO DO #185: o POPOVER que fecha dentro do modal que fica aberto.
//
// A cura anterior (modal-congelado) congela o miolo do MODAL enquanto o MODAL
// sai. Mas o formulário de evento tem três popovers (as duas datas e o menu de
// prazos) que abrem e fecham COM O MODAL ABERTO. Escolher uma data fecha o
// popover — e a subárvore dele fica montada durante a animação de saída, com
// `open` do modal ainda true, isto é, FORA do congelamento.
//
// A partir daí é o mecanismo já medido em modal-congelado.test.ts: cada render
// da página manda uma rodada de desanexa/reanexa de ref (`composeRefs` →
// `setRef`) para dentro da subárvore morrendo; o `usePresence` reage com
// setState; e em produção, onde a página re-renderiza sozinha (WebSocket,
// refetch do react-query, toast), a pilha chega ao limite de 50 updates
// aninhados e o React estoura o #185. O stack do bundle publicado confirma
// exatamente essas três funções.
//
// Este teste mede a mesma coisa que o outro, no ponto novo: quantos renders
// chegam ao miolo do popover DEPOIS que ele começou a sair. Tem de ser zero.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, vi } from "vitest";
import * as React from "react";
import { render, act } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;

// Contador de renders do miolo do popover de data.
const contador = vi.hoisted(() => ({ n: 0 }));
vi.mock("@/components/ui/calendar", async () => {
  const R = await import("react");
  return {
    Calendar: (props: any) => {
      contador.n++;
      // Dias suficientes para o teste escolher um.
      return R.createElement(
        "div",
        { "data-testid": "calendario-falso" },
        [10, 20].map((d) =>
          R.createElement(
            "button",
            {
              key: d,
              type: "button",
              "data-dia": d,
              onClick: () => props.onSelect?.(new Date(2026, 10, d)),
            },
            String(d),
          ),
        ),
      );
    },
  };
});

const EVENTO = {
  id: "e1", name: "Evento 1", priority: "alta",
  startDate: "2026-09-10", truckDepartureDate: "2026-09-05T08:00:00.000Z",
  deadlineListaImagens: -25, deadlineEntregaLayouts: -20, deadlineAprovacaoLayout: -12,
  deadlineFinalizacao: -10, deadlineRevisaoLista: -8, deadlineProducaoGrafica: -1,
  lifecycle: "active", allDelivered: false, eventHasPassed: false,
  sponsors: [], items: [], nextMilestone: null,
};

beforeAll(() => {
  const real = window.getComputedStyle.bind(window);
  vi.stubGlobal("getComputedStyle", (el: Element, pe?: string | null) => {
    const base = real(el as any, pe as any);
    return new Proxy(base, {
      get(t, p) {
        if (p === "animationName") {
          const st = (el as HTMLElement).getAttribute?.("data-state");
          if (st === "open") return "radix-enter";
          if (st === "closed") return "radix-exit";
          return "none";
        }
        const v = (t as any)[p];
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
  });
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class {
    cb: any;
    constructor(cb: any) { this.cb = cb; }
    observe(el: any) { setTimeout(() => this.cb([{ target: el, borderBoxSize: [{ inlineSize: 16, blockSize: 16 }] }], this), 0); }
    unobserve() {} disconnect() {}
  });
  (Element.prototype as any).scrollIntoView = () => {};

  vi.stubGlobal("fetch", async (url: any, init?: any) => {
    const u = String(url);
    const method = (init?.method || "GET").toUpperCase();
    const json = (b: any) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
    if (u === "/api/auth/me") return json({ id: "u1", name: "Admin", email: "a@a", role: "admin", mustChangePassword: false });
    if (u === "/api/sponsors") return json([{ id: "s1", name: "Patro 1", color: "#3b82f6" }]);
    if (u === "/api/events" && method === "GET") return json([EVENTO]);
    if (u === "/api/events" && method === "POST") return json({ ...EVENTO, id: "novo" });
    if (u.startsWith("/api/events/")) return json([]);
    return json([]);
  });
});

async function tick(ms = 60) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }

describe("popover de data: o miolo para de renderizar enquanto o popover sai", () => {
  it("escolher a data não manda mais renders para a subárvore em desmontagem", async () => {
    const { queryClient } = await import("@/lib/queryClient");
    const { TooltipProvider } = await import("@/components/ui/tooltip");
    const { AuthProvider } = await import("@/contexts/auth-context");
    const { Toaster } = await import("@/components/ui/toaster");
    const Eventos = (await import("@/pages/eventos")).default;

    queryClient.clear();
    render(
      h(QueryClientProvider, { client: queryClient } as any,
        h(TooltipProvider, null,
          h(AuthProvider, null, h(Eventos as any, null), h(Toaster as any, null)))),
    );
    await tick(150);

    await act(async () => {
      (document.querySelector('[data-testid="button-create-event"]') as HTMLElement)?.click();
    });
    await tick(200);
    expect(document.querySelector('[role="dialog"]')?.getAttribute("data-state")).toBe("open");

    // Abre o popover da data de início e escolhe um dia — o popover fecha.
    await act(async () => {
      (document.querySelector('[data-testid="input-start-date"]') as HTMLElement)?.click();
    });
    await tick(150);
    expect(document.querySelector('[data-testid="calendario-falso"]')).toBeTruthy();

    await act(async () => {
      (document.querySelector('[data-dia="20"]') as HTMLElement)?.click();
    });
    await tick(30);

    // O popover está SAINDO (ainda montado, data-state=closed) e o modal
    // continua aberto — a janela exata em que o bug vive.
    const popover = () => document.querySelector('[data-testid="calendario-falso"]')?.closest('[data-state]');
    expect(popover()?.getAttribute("data-state")).toBe("closed");
    expect(document.querySelector('[role="dialog"]')?.getAttribute("data-state")).toBe("open");

    contador.n = 0;

    // Renders da página que, em produção, chegam sozinhos: WebSocket, refetch
    // e toast. Aqui: digitação na busca (o debounce faz o resto).
    const busca = document.querySelector('[data-testid="input-search-events"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    for (const t of ["a", "ab", "abc"]) {
      await act(async () => {
        setter.call(busca, t);
        busca.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await tick(30);
    }
    await tick(200);

    expect(contador.n).toBe(0);
  }, 40000);
});
