// @vitest-environment jsdom
//
// REPRO do #185 relatado em /patrocinadores (24/08). Mesmo arreio de
// modal-congelado.test.ts e popover-congelado.test.ts.
import { describe, it, expect, beforeAll, vi } from "vitest";
import * as React from "react";
import { render, act } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;

const SPONSORS = Array.from({ length: 147 }, (_, i) => ({
  id: `s${i}`, name: `Patrocinador ${i}`, color: "#3b82f6",
  accountExecutiveId: i % 3 === 0 ? "u1" : null,
  company: null, contactPerson: null, phone: null, email: null, notes: null, quota: null,
}));
const USERS = [
  { id: "u1", name: "Ana Executiva", role: "atendimento" },
  { id: "u2", name: "Bruno Executivo", role: "atendimento" },
];
const USAGE = Object.fromEntries(SPONSORS.map(s => [s.id, { events: 3, items: 12, pendencias: 1, mediaDias: 4 }]));

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
    if (u === "/api/auth/me") return json({ id: "u9", name: "Admin", email: "a@a", role: "admin", mustChangePassword: false });
    if (u === "/api/sponsors" && method === "GET") return json(SPONSORS);
    if (u === "/api/sponsors" && method === "POST") return json({ ...SPONSORS[0], id: "novo" });
    if (u.startsWith("/api/sponsors/usage")) return json(USAGE);
    if (u.startsWith("/api/users/basic")) return json(USERS);
    if (u.startsWith("/api/sponsors/")) return json({ ok: true });
    return json([]);
  });
});

async function tick(ms = 60) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }

describe("/patrocinadores não estoura o laço de render (#185)", () => {
  it("abre o cadastro, usa o seletor de executivo e salva", async () => {
    const erros: string[] = [];
    const origErr = console.error;
    console.error = (...a: any[]) => { erros.push(a.map(String).join(" ")); };
    const laco = () => erros.filter((e) => /Maximum update depth|#185/.test(e));

    try {
      const { queryClient } = await import("@/lib/queryClient");
      const { TooltipProvider } = await import("@/components/ui/tooltip");
      const { AuthProvider } = await import("@/contexts/auth-context");
      const { Toaster } = await import("@/components/ui/toaster");
      const Patrocinadores = (await import("@/pages/patrocinadores")).default;

      queryClient.clear();
      render(
        h(QueryClientProvider, { client: queryClient } as any,
          h(TooltipProvider, null,
            h(AuthProvider, null, h(Patrocinadores as any, null), h(Toaster as any, null)))),
      );
      await tick(200);
      expect({ etapa: "carregou a lista", laco: laco() }).toEqual({ etapa: "carregou a lista", laco: [] });

      // 1 · o filtro de executivo da barra (FilterSelect FORA de modal)
      await act(async () => {
        (document.querySelector('[data-testid="filter-executive"]') as HTMLElement)?.click();
      });
      await tick(120);
      await act(async () => { document.body.click(); });
      await tick(150);
      expect({ etapa: "filtro da barra", laco: laco() }).toEqual({ etapa: "filtro da barra", laco: [] });

      // 2 · abrir o cadastro
      await act(async () => {
        (document.querySelector('[data-testid="button-add-sponsor"]') as HTMLElement)?.click();
      });
      await tick(250);
      expect(document.querySelector('[role="dialog"]')).toBeTruthy();
      expect({ etapa: "abriu o modal", laco: laco() }).toEqual({ etapa: "abriu o modal", laco: [] });

      // 3 · digitar o nome
      const nome = document.querySelector('[data-testid="input-sponsor-name"]') as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      for (const t of ["A", "Ac", "Acm", "Acme"]) {
        await act(async () => { setter.call(nome, t); nome.dispatchEvent(new Event("input", { bubbles: true })); });
        await tick(30);
      }

      // 4 · o seletor de executivo DENTRO do modal (é o caminho suspeito: um
      //     painel que abre e fecha com o modal aberto)
      await act(async () => {
        (document.querySelector('[data-testid="select-account-executive"]') as HTMLElement)?.click();
      });
      await tick(150);
      const opcao = Array.from(document.querySelectorAll("button, [role='option']"))
        .find((b) => (b.textContent || "").includes("Ana Executiva"));
      await act(async () => { (opcao as HTMLElement)?.click(); });
      await tick(200);
      expect({ etapa: "escolheu executivo", laco: laco() }).toEqual({ etapa: "escolheu executivo", laco: [] });

      // 4b · o painel aberto + SCROLL: o FilterSelect remede a posição a cada
      //      evento de scroll (fase de captura) e grava um objeto novo. No
      //      navegador isso acontece o tempo todo; o jsdom não gera sozinho.
      await act(async () => {
        (document.querySelector('[data-testid="select-account-executive"]') as HTMLElement)?.click();
      });
      await tick(120);
      for (let i = 0; i < 30; i++) {
        await act(async () => {
          window.dispatchEvent(new Event("scroll", { bubbles: true }));
          (document.querySelector('[role="dialog"]') as HTMLElement)?.dispatchEvent(new Event("scroll", { bubbles: true }));
        });
      }
      await tick(150);
      expect({ etapa: "scroll com painel aberto", laco: laco() }).toEqual({ etapa: "scroll com painel aberto", laco: [] });

      // 4c · fechar o painel COM o modal aberto e continuar rolando — é a
      //      receita do #185 (subárvore saindo + renders chegando).
      await act(async () => { document.body.click(); });
      for (let i = 0; i < 20; i++) {
        await act(async () => { window.dispatchEvent(new Event("scroll", { bubbles: true })); });
      }
      await tick(200);
      expect({ etapa: "painel saindo + scroll", laco: laco() }).toEqual({ etapa: "painel saindo + scroll", laco: [] });

      // 4d · editar uma linha existente e cancelar
      await act(async () => { document.querySelector('[data-testid="button-cancel"]') && (document.querySelector('[data-testid="button-cancel"]') as HTMLElement).click(); });
      await tick(200);
      await act(async () => { (document.querySelector('[data-testid="text-sponsor-name-s1"]') as HTMLElement)?.click(); });
      await tick(200);
      expect({ etapa: "abriu edicao", laco: laco() }).toEqual({ etapa: "abriu edicao", laco: [] });

      // 5 · escolher cor e salvar
      await act(async () => {
        (document.querySelector('[data-testid="color-#f97316"]') as HTMLElement)?.click();
      });
      await tick(60);
      await act(async () => {
        (document.querySelector('[data-testid="button-submit"]') as HTMLElement)?.click();
      });
      await tick(400);

      // 6 · a página respira depois do modal sair (refetch, toast, digitação)
      const busca = document.querySelector('[data-testid="input-search-sponsors"]') as HTMLInputElement | null;
      if (busca) for (const t of ["a", "ab", "abc"]) {
        await act(async () => { setter.call(busca, t); busca.dispatchEvent(new Event("input", { bubbles: true })); });
        await tick(40);
      }
      await tick(400);

      expect({ etapa: "salvou e respirou", laco: laco() }).toEqual({ etapa: "salvou e respirou", laco: [] });
    } finally {
      console.error = origErr;
    }
  }, 60000);
});
