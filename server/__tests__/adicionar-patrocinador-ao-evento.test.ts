// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// "TODA VEZ QUE VOU CRIAR UM EVENTO E ADICIONAR UM PATROCINADOR" (#185)
//
// Relatado em 24/08, com o passo exato. A lista de patrocinadores do formulário
// de evento renderiza UMA LINHA POR PATROCINADOR — 147 em produção — e cada
// linha tem um Checkbox do Radix. Marcar um patrocinador faz duas coisas ao
// mesmo tempo: muda `selectedSponsorIds` (re-renderiza a lista inteira) e
// RE-ORDENA (os selecionados sobem para o topo), o que troca de lugar quase
// todas as linhas.
//
// O churn de ref das primitivas do Radix já está medido em
// modal-congelado.test.ts: cada render do pai custa um desanexa + um reanexa
// por primitiva, e cada um deles é um setState em fase de commit. Com 147
// linhas trocando de posição de uma vez, a pilha de updates aninhados passa
// dos 50 que o React admite — e ele estoura o #185.
//
// Este teste monta o caso do relato com as 147 linhas de produção e falha se
// o laço voltar.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, vi } from "vitest";
import * as React from "react";
import { render, act } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "fs";
import path from "path";

const h = React.createElement;

// Conta renders que chegam ao miolo do popover de data. É a medida do bug:
// depois que o popover começa a sair, ninguém mais pode renderizar lá dentro.
const contador = vi.hoisted(() => ({ n: 0 }));
vi.mock("@/components/ui/calendar", async () => {
  const R = await import("react");
  return {
    Calendar: (props: any) => {
      contador.n++;
      return R.createElement("div", { "data-testid": "calendario-falso" },
        [10, 20].map((d) => R.createElement("button", {
          key: d, type: "button", "data-dia": d,
          onClick: () => props.onSelect?.(new Date(2026, 10, d)),
        }, String(d))));
    },
  };
});

const SPONSORS = Array.from({ length: 147 }, (_, i) => ({
  id: `s${i}`,
  name: `Patrocinador ${String(i).padStart(3, "0")}`,
  color: "#3b82f6",
  company: null,
}));

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
    if (u === "/api/sponsors") return json(SPONSORS);
    if (u === "/api/events" && method === "GET") return json([EVENTO]);
    if (u === "/api/events" && method === "POST") return json({ ...EVENTO, id: "novo" });
    if (u.startsWith("/api/events/")) return json([]);
    return json([]);
  });
});

async function tick(ms = 60) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }

describe("criar evento e adicionar patrocinadores", () => {
  it("marcar patrocinadores não estoura o laço de render, mesmo com 147 na lista", async () => {
    const erros: string[] = [];
    const origErr = console.error;
    console.error = (...a: any[]) => { erros.push(a.map(String).join(" ")); };
    const laco = () => erros.filter((e) => /Maximum update depth|#185/.test(e));

    try {
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
      await tick(200);

      await act(async () => {
        (document.querySelector('[data-testid="button-create-event"]') as HTMLElement)?.click();
      });
      await tick(300);
      expect(document.querySelector('[role="dialog"]')).toBeTruthy();

      const caixas = () => Array.from(document.querySelectorAll('[data-testid^="checkbox-sponsor-"]'));
      expect(caixas().length).toBeGreaterThan(100);
      expect({ etapa: "modal aberto com 147 linhas", laco: laco() })
        .toEqual({ etapa: "modal aberto com 147 linhas", laco: [] });

      // O passo do relato: marcar um patrocinador. A lista re-ordena (os
      // selecionados sobem), então quase todas as linhas trocam de lugar.
      for (const id of ["s130", "s77", "s12", "s99", "s45"]) {
        await act(async () => {
          (document.querySelector(`[data-testid="checkbox-sponsor-${id}"]`) as HTMLElement)?.click();
        });
        await tick(80);
        expect({ etapa: `marcou ${id}`, laco: laco() }).toEqual({ etapa: `marcou ${id}`, laco: [] });
      }

      // Desmarcar também reordena.
      await act(async () => {
        (document.querySelector('[data-testid="checkbox-sponsor-s77"]') as HTMLElement)?.click();
      });
      await tick(120);

      // E buscar, que refiltra e reordena a cada tecla.
      const busca = document.querySelector('[data-testid="input-sponsor-search"]') as HTMLInputElement | null;
      if (busca) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
        for (const t of ["P", "Pa", "Pat", "Patr"]) {
          await act(async () => { setter.call(busca, t); busca.dispatchEvent(new Event("input", { bubbles: true })); });
          await tick(40);
        }
      }
      await tick(300);

      expect({ etapa: "fim", laco: laco() }).toEqual({ etapa: "fim", laco: [] });

      // ── A CADEIA DO RELATO ────────────────────────────────────────────────
      // O fluxo real não é "marcar patrocinador" isolado: é escolher a DATA e,
      // logo depois, mexer nos patrocinadores. Escolher a data fecha o popover,
      // que fica montado durante a animação de saída; o clique no patrocinador
      // re-renderiza as 147 linhas e, sem o congelamento, essa enxurrada de
      // render entra na subárvore que está morrendo. É a receita do #185.
      await act(async () => {
        (document.querySelector('[data-testid="input-start-date"]') as HTMLElement)?.click();
      });
      await tick(150);
      expect(document.querySelector('[data-testid="calendario-falso"]')).toBeTruthy();
      await act(async () => {
        (document.querySelector('[data-dia="20"]') as HTMLElement)?.click();
      });
      await tick(30);

      // O popover está SAINDO e o modal continua aberto.
      const popover = () => document.querySelector('[data-testid="calendario-falso"]')?.closest('[data-state]');
      expect(popover()?.getAttribute("data-state")).toBe("closed");
      contador.n = 0;

      // Agora o passo do relato, em cima da subárvore morrendo.
      for (const id of ["s5", "s6", "s7", "s8"]) {
        await act(async () => {
          (document.querySelector(`[data-testid="checkbox-sponsor-${id}"]`) as HTMLElement)?.click();
        });
        await tick(40);
      }
      await tick(200);

      // Nenhum render chegou ao popover em desmontagem — é o que a cura de
      // 9606b7a garante, e é o que faltava no que está publicado.
      expect(contador.n).toBe(0);
      expect({ etapa: "data e depois patrocinadores", laco: laco() })
        .toEqual({ etapa: "data e depois patrocinadores", laco: [] });
    } finally {
      console.error = origErr;
    }
  }, 60000);
});

// ─────────────────────────────────────────────────────────────────────────────
// A CURA (24/08, depois do relato voltar com o app JÁ publicado).
//
// Congelar o popover não bastou: o erro voltou com o bundle novo, no mesmo
// passo. A causa estava na própria lista, e são duas coisas somadas:
//
//  1. cada linha usava o Checkbox do RADIX, cujo churn de ref este repositório
//     já media (modal-congelado.test.ts): cinco renders do pai custam cinco
//     desanexa+reanexa; um <input> nativo custa ZERO;
//  2. marcar um patrocinador REORDENAVA a lista (selecionados para o topo),
//     pondo as ~147 linhas em movimento de uma vez — 147 vezes aquele custo,
//     em fase de commit, muito além dos 50 updates aninhados que o React
//     admite antes de estourar o #185.
//
// Este teste fixa as duas metades no código, porque nenhuma delas se defende
// sozinha: sem a caixa nativa a reordenação volta a custar caro, e sem a ordem
// congelada a lista inteira volta a se mexer a cada clique.
// ─────────────────────────────────────────────────────────────────────────────
describe("as duas metades da cura estão no código", () => {
  const EVENTOS = readFileSync(path.resolve(__dirname, "../../client/src/pages/eventos.tsx"), "utf8");

  it("a caixa da linha é nativa, não primitiva do Radix", () => {
    const i = EVENTOS.indexOf("data-testid={`checkbox-sponsor-");
    expect(i).toBeGreaterThan(-1);
    const trecho = EVENTOS.slice(i - 1500, i + 300);
    expect(trecho).toContain('type="checkbox"');
    expect(trecho).toContain('accentColor: "#fd761a"');
    expect(trecho).not.toContain("<Checkbox");
  });

  it("a ordem da lista é congelada enquanto o formulário está aberto", () => {
    expect(EVENTOS).toContain("const ordemFixadaNoTopo = useMemo(");
    expect(EVENTOS).toContain("() => new Set(selecionadosRef.current),");
    // as dependências NÃO incluem selectedSponsorIds — é esse o ponto.
    expect(EVENTOS).toContain("[open, sponsorSearch, sponsors],");
    expect(EVENTOS).toContain("const selA = ordemFixadaNoTopo.has(a.id) ? 0 : 1;");
    expect(EVENTOS).not.toContain("const selA = selectedSponsorIds.includes(a.id) ? 0 : 1;");
  });

  it("e os selecionados continuam subindo ao topo — a capacidade não se perdeu", () => {
    expect(EVENTOS).toContain("if (selA !== selB) return selA - selB;");
  });
});
