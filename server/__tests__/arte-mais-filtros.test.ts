// @vitest-environment jsdom
//
// ARTE — "MAIS FILTROS" (dono, 22/09: "a Arte está achando os filtros
// poluídos: deixar apenas EVENTOS aparentes e meio que esconder os outros
// filtros em um botão").
//
// Monta a tela de verdade em 1280px e em 390px e trava o contrato:
//   · à vista só a busca e o Evento;
//   · "Mais filtros" abre os outros ali mesmo (faixa no desktop, folha no
//     celular), com aria-expanded/aria-controls;
//   · o número do botão conta só o que está escondido;
//   · com a faixa fechada, os escondidos ligados viram chips removíveis;
//   · um link com filtro escondido abre a faixa sozinho;
//   · nada da URL mudou (mesmos parâmetros).
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { vi } from "vitest";
import * as React from "react";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;
const DIA = 86_400_000;
const hoje = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

const EVENTOS = [0, 1].map((i) => ({
  id: `e${i}`, name: `Corrida ${i}`, status: "active",
  startDate: iso(hoje + (20 + i) * DIA).slice(0, 10), truckDepartureDate: iso(hoje + (17 + i) * DIA),
  priority: i === 0 ? "urgente" : "media",
}));
const SP = [{ id: "s0", name: "Marca A", color: "#3b82f6" }];
const PECAS = Array.from({ length: 6 }, (_, i) => ({
  id: `p${i}`, displayId: `#${100 + i}`, status: "awaiting_submission",
  type: i % 2 ? "Banner" : "Backdrop", description: `Peça ${i}`, material: i % 2 ? "LONA" : "ACM",
  finish: "Ilhós", quantity: 1, visualWidth: "3", visualHeight: "2", fileWidth: "300", fileHeight: "200", calculatedM2: "6",
  eventId: EVENTOS[i % 2].id, event: { ...EVENTOS[i % 2] },
  sponsors: [{ ...SP[0], approvalStatus: "pending" }],
  approvalThumbUrl: null, finalFileUrl: null,
  statusChangedAt: iso(hoje - DIA), updatedAt: iso(hoje - DIA), createdAt: iso(hoje - 10 * DIA),
  skipApproval: false, isPriority: false,
}));

let largura = 1280;
beforeAll(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
  (Element.prototype as any).scrollIntoView = () => {};
  (Element.prototype as any).scrollTo = () => {};
  Object.defineProperty(window, "innerWidth", { configurable: true, get: () => largura });
  vi.stubGlobal("fetch", async (url: any, init?: any) => {
    const u = String(url);
    const method = (init?.method || "GET").toUpperCase();
    const json = (b: any) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
    if (u === "/api/auth/me") return json({ id: "u1", name: "Admin", email: "a@a", role: "admin", mustChangePassword: false });
    if ((u === "/api/items" || u.startsWith("/api/items?")) && method === "GET") {
      return u.includes("since=") ? json({ itens: [], removidas: [], agora: iso(Date.now()) }) : json(PECAS);
    }
    if (u.split("?")[0] === "/api/items/batch-approval-data") return json({ sponsorsByItem: {}, approvalsByItem: {} });
    if (u.split("?")[0] === "/api/events" && method === "GET") return json(EVENTOS);
    if (u === "/api/sponsors" && method === "GET") return json(SP);
    return json([]);
  });
});

beforeEach(() => {
  cleanup();
  try { localStorage.clear(); sessionStorage.clear(); } catch {}
  window.history.replaceState(null, "", "/");
});

const $ = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const tid = (id: string) => $(`[data-testid="${id}"]`);
async function tick(ms = 20) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
async function esperar(cond: () => boolean, max = 400) {
  for (let i = 0; i < max && !cond(); i++) await tick(10);
  expect(cond()).toBe(true);
}

async function montar(px: number, busca = "") {
  largura = px;
  window.history.replaceState(null, "", "/arte" + busca);
  const { queryClient, resetItensDelta } = await import("@/lib/queryClient");
  const { TooltipProvider } = await import("@/components/ui/tooltip");
  const { AuthProvider } = await import("@/contexts/auth-context");
  const Arte = (await import("@/pages/arte")).default;
  queryClient.clear();
  resetItensDelta();
  render(h(QueryClientProvider, { client: queryClient } as any, h(TooltipProvider, null, h(AuthProvider, null, h(Arte as any, null)))));
  await esperar(() => !!tid("input-search-filter"));
  await tick(50);
}

const ESCONDIDOS = ["select-sponsor-filter", "select-type-filter", "select-material-filter", "select-month-filter",
  "select-period-filter", "button-next-10-days-filter", "segment-atrasado", "segment-urgente", "segment-thumb",
  "segment-final", "select-ordenar"];
const presente = (id: string) => !!$(`[data-testid^="${id}"]`);

describe("Arte 1280px — só busca e Evento à vista", { timeout: 60_000 }, () => {
  it("fechada: nenhum dos outros filtros aparece; o botão diz o que controla", async () => {
    await montar(1280);
    expect(tid("input-search-filter")).not.toBeNull();
    expect(document.body.textContent).toContain("Evento");
    for (const id of ESCONDIDOS) expect(presente(id), id).toBe(false);
    const botao = tid("button-mais-filtros")!;
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    expect(botao.getAttribute("aria-controls")).toBe("arte-mais-filtros");
    expect(botao.textContent).toContain("Mais filtros");
    expect(botao.textContent).not.toMatch(/\(\d+\)/);
  });

  it("abrir mostra a faixa com todos os outros controles, e lembra na próxima visita", async () => {
    await montar(1280);
    await act(async () => { fireEvent.click(tid("button-mais-filtros")!); });
    expect(tid("button-mais-filtros")!.getAttribute("aria-expanded")).toBe("true");
    expect($("#arte-mais-filtros")).not.toBeNull();
    for (const id of ["segment-atrasado", "segment-urgente", "segment-thumb", "segment-final", "button-next-10-days-filter", "select-period-filter", "select-month-filter"]) {
      expect(presente(id), id).toBe(true);
    }
    expect(localStorage.getItem("arte.maisFiltrosAberto")).toBe("1");
    cleanup();
    await montar(1280);
    expect(tid("faixa-mais-filtros")).not.toBeNull();
  });

  it("contagem, chips com a faixa fechada e 'Limpar estes filtros'", async () => {
    await montar(1280);
    await act(async () => { fireEvent.click(tid("button-mais-filtros")!); });
    await act(async () => { fireEvent.click(tid("button-urgente-sim")!); });
    await act(async () => { fireEvent.click(tid("button-next-10-days-filter")!); });
    expect(tid("button-mais-filtros")!.textContent).toContain("Mais filtros (2)");
    // Aberta: os controles dizem o próprio estado — sem chip repetido.
    expect(tid("chip-ativo-urgente")).toBeNull();
    // Fechada: os dois viram chips removíveis, com "Limpar tudo".
    await act(async () => { fireEvent.click(tid("button-mais-filtros")!); });
    expect(tid("faixa-mais-filtros")).toBeNull();
    expect(tid("chip-ativo-urgente")).not.toBeNull();
    expect(tid("chip-ativo-next10")).not.toBeNull();
    expect(tid("button-clear-filters")).not.toBeNull();
    await act(async () => { fireEvent.click(tid("chip-ativo-urgente")!.querySelector("button")!); });
    expect(tid("button-mais-filtros")!.textContent).toContain("Mais filtros (1)");
    // "Limpar estes filtros" só existe com algo ligado, e só limpa os escondidos.
    await act(async () => { fireEvent.click(tid("button-mais-filtros")!); });
    await act(async () => { fireEvent.click(tid("button-limpar-mais-filtros")!); });
    expect(tid("button-mais-filtros")!.textContent).not.toMatch(/\(\d+\)/);
    expect(tid("button-limpar-mais-filtros")).toBeNull();
  });

  it("link com filtro escondido abre a faixa sozinho (mesmos parâmetros de URL)", async () => {
    await montar(1280, "?urgente=1");
    expect(tid("faixa-mais-filtros")).not.toBeNull();
    expect(tid("button-mais-filtros")!.getAttribute("aria-expanded")).toBe("true");
    expect(tid("button-mais-filtros")!.textContent).toContain("(1)");
    expect(tid("button-urgente-sim")!.getAttribute("aria-pressed")).toBe("true");
    // o gesto automático não vira preferência gravada
    expect(localStorage.getItem("arte.maisFiltrosAberto")).toBeNull();
  });
});

describe("Arte 390px — busca e Evento à vista, o resto na folha", { timeout: 60_000 }, () => {
  it("fechada: busca 16px/44px, Evento em linha própria, nada mais", async () => {
    await montar(390);
    const busca = tid("input-search-filter") as HTMLInputElement;
    expect(busca.style.fontSize).toBe("16px");
    expect(busca.style.height).toBe("44px");
    expect(tid("filtro-evento-mobile")).not.toBeNull();
    for (const id of ESCONDIDOS) expect(presente(id), id).toBe(false);
    const botao = tid("button-abrir-filtros-mobile")!;
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    expect(botao.getAttribute("aria-controls")).toBe("arte-folha-filtros");
    expect(botao.style.minHeight).toBe("44px");
  });

  it("a folha abre com os outros filtros, rodapé com safe-area, e fecha", async () => {
    await montar(390, "?urgente=1");
    // No celular a folha NUNCA abre sozinha; o recorte do link vira chip.
    expect(tid("folha-filtros-mobile")).toBeNull();
    expect(tid("chip-ativo-urgente")).not.toBeNull();
    expect(tid("button-abrir-filtros-mobile")!.textContent).toContain("Filtros (1)");
    await act(async () => { fireEvent.click(tid("button-abrir-filtros-mobile")!); });
    await tick(20);
    const folha = tid("folha-filtros-mobile")!;
    expect(folha.getAttribute("role")).toBe("dialog");
    expect(folha.id).toBe("arte-folha-filtros");
    for (const id of ["segment-atrasado", "segment-urgente", "segment-thumb", "segment-final", "button-next-10-days-filter"]) {
      expect(presente(id), id).toBe(true);
    }
    const rodape = tid("button-aplicar-filtros-mobile")!.parentElement!;
    expect(rodape.style.paddingBottom).toContain("safe-area-inset-bottom");
    await act(async () => { fireEvent.click(tid("button-aplicar-filtros-mobile")!); });
    expect(tid("folha-filtros-mobile")).toBeNull();
  });
});
