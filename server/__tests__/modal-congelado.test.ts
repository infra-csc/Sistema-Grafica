// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// O LAÇO DO MODAL DE EVENTOS (React #185 "Maximum update depth exceeded")
//
// Duas correções anteriores curaram só o CANCELAR. Este arquivo existe para
// medir, e não deduzir, as duas metades do mecanismo:
//
//  1. `churn de ref` — toda primitiva do Radix compõe a ref com
//     `useComposedRefs(forwardedRef, (node) => setNode(node))`. A arrow nasce
//     de novo a cada render e é DEPENDÊNCIA do useCallback interno, então a ref
//     composta muda de identidade a cada render e o React desanexa/reanexa no
//     commit — cada desanexa/reanexa é um `setState` em fase de commit. É o
//     `usePresence` que aparece no topo do stack do #185, via
//     `safelyDetachRef` → `composeRefs` → `setRef`.
//
//  2. `miolo congelado` — sozinho, o churn é inofensivo (o valor volta ao que
//     era e o React desiste). Ele vira fatal quando acontece com a subárvore
//     MORRENDO: o Presence do Radix segura o conteúdo montado durante a
//     animação de saída, e cada render da página nessa janela manda mais uma
//     rodada de desanexa/reanexa para dentro do que está sendo desmontado.
//     Cancelar = 1 render. Salvar = 4 (isPending voltando a false, o useToast
//     que assina a página inteira, o timer de entrada do toast e a chegada do
//     refetch do invalidateQueries). Este teste mede exatamente esse 4 → 0.
//
// Sem a correção, o segundo teste falha com "expected 4 to be +0".
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, vi } from "vitest";
import * as React from "react";
import { render, act } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;

// Contador de renders do miolo do formulário. O Checkbox é a folha mais funda
// (uma por linha de patrocinador): se ele renderizou, a subárvore renderizou.
const contador = vi.hoisted(() => ({ n: 0 }));
vi.mock("@/components/ui/checkbox", async () => {
  const R = await import("react");
  return {
    Checkbox: (props: any) => {
      contador.n++;
      return R.createElement("input", {
        type: "checkbox",
        "data-testid": props["data-testid"],
        checked: !!props.checked,
        readOnly: true,
      });
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
  // jsdom não calcula animation-name. Sem isto o Presence desmontaria o
  // conteúdo no MESMO commit em que `open` vira false — e a janela de "saindo
  // com animação", que é onde o bug vive, não existiria no teste. O proxy
  // abaixo emula o CSSStyleDeclaration VIVO do browser.
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
    observe(el: any) {
      setTimeout(() => this.cb([{ target: el, borderBoxSize: [{ inlineSize: 16, blockSize: 16 }] }], this), 0);
    }
    unobserve() {}
    disconnect() {}
  });
  (Element.prototype as any).scrollIntoView = () => {};

  let versao = 0;
  vi.stubGlobal("fetch", async (url: any, init?: any) => {
    const u = String(url);
    const method = (init?.method || "GET").toUpperCase();
    const json = (b: any) =>
      new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
    if (u === "/api/auth/me") {
      return json({ id: "u1", name: "Admin", email: "a@a", role: "admin", mustChangePassword: false });
    }
    if (u === "/api/sponsors") return json([{ id: "s1", name: "Patro 1", color: "#3b82f6" }]);
    if (u === "/api/events" && method === "GET") { versao++; return json([{ ...EVENTO, _v: versao }]); }
    if (u === "/api/events/e1/sponsors" && method === "GET") return json([{ sponsorId: "s1", quota: "MASTER" }]);
    if (u.startsWith("/api/events/e1")) return json({ ok: true });
    return json([]);
  });
});

async function tick(ms = 60) {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}

describe("churn de ref das primitivas Radix", () => {
  it("cada render do pai custa um desanexa + um reanexa; o nativo custa zero", async () => {
    const { Checkbox } = await vi.importActual<any>("@/components/ui/checkbox");
    let anexa = 0;
    let desanexa = 0;

    function medir(filho: (ref: any, n: number) => React.ReactElement) {
      anexa = 0; desanexa = 0;
      let setN: (v: number) => void = () => {};
      const Host = () => {
        const [n, s] = React.useState(0);
        setN = s;
        const ref = React.useCallback((node: any) => { if (node) anexa++; else desanexa++; }, []);
        return h("form", null, filho(ref, n));
      };
      const view = render(h(Host));
      anexa = 0; desanexa = 0;
      for (let i = 1; i <= 5; i++) act(() => { setN(i); });
      const r = { anexa, desanexa };
      view.unmount();
      return r;
    }

    const radix = medir((ref, n) =>
      h(Checkbox, { key: "c", ref, checked: true, onCheckedChange: () => {}, "data-n": n }));
    const nativo = medir((ref, n) =>
      h("input", { key: "c", type: "checkbox", ref, checked: true, readOnly: true, "data-n": n }));

    // 5 re-renders do pai, sem nenhuma mudança no checkbox: o Radix desanexa e
    // reanexa a ref 5 vezes; o <input> nativo, nenhuma.
    expect(radix.desanexa).toBe(5);
    expect(radix.anexa).toBe(5);
    expect(nativo.desanexa).toBe(0);
    expect(nativo.anexa).toBe(0);
  }, 30000);
});

describe("modal de evento: o miolo para de renderizar enquanto o modal sai", () => {
  it("salvar não manda mais nenhum render para a subárvore em desmontagem", async () => {
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
      (document.querySelector('[data-testid="button-edit-event-e1"]') as HTMLElement)?.click();
    });
    await tick(150);

    const dialog = () => document.querySelector('[role="dialog"]');
    expect(dialog()?.getAttribute("data-state")).toBe("open");
    // Com patrocinador vinculado, o formulário tem de fato uma linha com
    // checkbox — é a condição em que o bug foi relatado.
    expect(document.querySelectorAll('[data-testid^="checkbox-sponsor-"]').length).toBeGreaterThan(0);

    const salvar = Array.from(document.querySelectorAll("button"))
      .find((b) => /salvar/i.test(b.textContent || ""));
    await act(async () => { (salvar as HTMLElement)?.click(); });

    // Só começa a contar quando o modal já está SAINDO (data-state=closed e
    // ainda montado, que é a janela da animação de saída).
    for (let i = 0; i < 40 && dialog()?.getAttribute("data-state") !== "closed"; i++) await tick(10);
    expect(dialog()?.getAttribute("data-state")).toBe("closed");
    contador.n = 0;

    // Os renders da página que hoje batem na subárvore morrendo: chegada do
    // refetch do invalidateQueries, o toast, e — para não depender de rede —
    // três digitações na busca.
    await tick(200);
    const busca = document.querySelector('[data-testid="input-search-events"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    for (const t of ["a", "ab", "abc"]) {
      await act(async () => {
        setter.call(busca, t);
        busca.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await tick(30);
    }
    await tick(300);

    // Sem FreezeWhileClosing este número é 4.
    expect(contador.n).toBe(0);

    // O congelamento NÃO pode grudar: encerrada a animação de saída, o Presence
    // desmonta e a próxima abertura tem de renderizar de novo, do zero.
    await act(async () => {
      document.querySelectorAll('[data-state="closed"]').forEach((n) => {
        const ev: any = new Event("animationend", { bubbles: false });
        ev.animationName = "radix-exit";
        n.dispatchEvent(ev);
      });
    });
    await tick(60);
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    setter.call(busca, "");
    await act(async () => { busca.dispatchEvent(new Event("input", { bubbles: true })); });
    await tick(300);
    await act(async () => {
      (document.querySelector('[data-testid="button-edit-event-e1"]') as HTMLElement)?.click();
    });
    await tick(150);
    expect(document.querySelector('[role="dialog"]')?.getAttribute("data-state")).toBe("open");
    expect((document.querySelector('[data-testid="input-event-name"]') as HTMLInputElement)?.value)
      .toBe("Evento 1");
    expect(contador.n).toBeGreaterThan(0);
  }, 40000);
});
