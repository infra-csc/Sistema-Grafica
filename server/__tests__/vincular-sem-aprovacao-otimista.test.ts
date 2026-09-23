// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// "SEM PATROCINADOR" SALVO APARECE NA LINHA NA HORA — o otimista acerta a lista.
//
// O defeito: o `onMutate` do salvar vínculo gravava `skipApproval` na chave
// EXATA `["/api/items"]`, mas a lista que a tela lê é recortada —
// `["/api/items", "?status=…&eventId=…"]`. O `setQueryData` caía numa chave
// sem ninguém olhando, e como o salvar (de propósito) não recarrega
// /api/items, a linha salva "sem patrocinador" voltava a dizer PENDENTE e a
// marca sumia — até o próximo recarregamento da tela.
//
// O conserto atualiza TODAS as listas sob o prefixo `["/api/items"]`. Aqui o
// servidor de mentira devolve SEMPRE `skipApproval: false` no GET: se a linha
// diz "Pronto" depois de salvar, foi o otimista que escreveu — não um refetch.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;

const SPONSORS = [{ id: "s1", name: "Bradesco", color: "#3b82f6", company: null }];
const EVENTO = {
  id: "e1", name: "Circuito das Estações 2099", priority: "alta", status: "active", manuallyClosed: false,
  startDate: "2099-09-10", truckDepartureDate: "2099-09-05T08:00:00.000Z",
  deadlineListaImagens: -25, deadlineEntregaLayouts: -20, deadlineAprovacaoLayout: -12,
  deadlineFinalizacao: -10, deadlineRevisaoLista: -8, deadlineProducaoGrafica: -1,
  lifecycle: "active", allDelivered: false, eventHasPassed: false,
  sponsors: [{ sponsorId: "s1", quota: "ouro" }],
  items: [],
  nextMilestone: null,
};
const PECA = {
  id: "i1", displayId: "#1001", eventId: "e1", event: EVENTO, type: "Pórtico", description: "Peça 1001",
  quantity: 1, visualWidth: "3", visualHeight: "2", material: "Lona", finish: "Ilhós",
  status: "awaiting_linking", skipApproval: false, isReuse: false, observations: "", sponsors: [],
  approvalThumbUrl: null, createdAt: "2026-08-01T12:00:00.000Z", updatedAt: "2026-08-01T12:00:00.000Z",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

// A resposta do sync fica PRESA até o teste soltar.
let soltarSync: (() => void) | null = null;
const getsDeItens: string[] = [];

beforeAll(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
  Element.prototype.scrollIntoView = () => {};

  vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method || "GET").toUpperCase();
    if (u === "/api/auth/me") return json({ id: "u1", name: "Admin", email: "a@a", role: "admin", mustChangePassword: false });
    if (u === "/api/sponsors") return json(SPONSORS);
    if (u.split("?")[0] === "/api/events") return json([EVENTO]);
    if (method === "GET" && (u === "/api/items" || u.startsWith("/api/items?"))) {
      getsDeItens.push(u);
      return json([PECA]); // o servidor NUNCA diz skipApproval: true aqui
    }
    if (method === "POST" && u === "/api/items/i1/sponsors/sync") {
      await new Promise<void>((r) => { soltarSync = r; });
      return json({ message: "ok" });
    }
    return json([]);
  });
});

async function tick(ms = 60) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
async function esperar(seletor: string, max = 200) {
  for (let i = 0; i < max && !document.querySelector(seletor); i++) await tick(25);
  expect(document.querySelector(seletor), seletor).toBeTruthy();
}
const clicar = async (seletor: string) => {
  const el = document.querySelector<HTMLElement>(seletor);
  expect(el, seletor).toBeTruthy();
  await act(async () => { el!.click(); });
};
const texto = (seletor: string) => document.querySelector(seletor)?.textContent ?? "";

describe("Vinculação: salvar 'sem patrocinador' atualiza a lista recortada", () => {
  it("a marca vai para a lista antes da resposta, e a linha fica Pronto depois dela — sem recarregar", async () => {
    cleanup();
    window.history.replaceState(null, "", "/vincular-patrocinadores");
    try { sessionStorage.clear(); localStorage.clear(); } catch { /* sem storage */ }
    const { queryClient } = await import("@/lib/queryClient");
    const { TooltipProvider } = await import("@/components/ui/tooltip");
    const { AuthProvider } = await import("@/contexts/auth-context");
    const { Toaster } = await import("@/components/ui/toaster");
    const Vincular = (await import("@/pages/vincular-patrocinadores")).default;
    queryClient.clear();
    render(
      h(QueryClientProvider, { client: queryClient },
        h(TooltipProvider, null, h(AuthProvider, null, h(Vincular), h(Toaster)))),
    );
    await esperar('[data-testid="item-row-i1"]');
    expect(texto('[data-testid="badge-status-i1"]')).toBe("Pendente");

    await clicar('[data-testid="btn-skip-sponsor-i1"]');
    await esperar('[data-testid="button-save-item-i1"]');
    expect(texto('[data-testid="badge-status-i1"]')).toBe("Rascunho");
    const getsAntes = getsDeItens.length;

    await clicar('[data-testid="button-save-item-i1"]');
    for (let i = 0; i < 100 && !soltarSync; i++) await tick(10);
    expect(soltarSync, "o sync deveria estar em voo").toBeTruthy();

    // ANTES da resposta: a lista que a tela lê (chave recortada) já tem a marca.
    const listas = queryClient.getQueriesData<Array<{ id: string; skipApproval: boolean }>>({ queryKey: ["/api/items"] })
      .filter(([, dados]) => Array.isArray(dados));
    expect(listas.length).toBeGreaterThan(0);
    expect(listas.some(([chave]) => chave.length > 1), "a lista da tela é a recortada").toBe(true);
    for (const [, dados] of listas) expect(dados!.find((p) => p.id === "i1")?.skipApproval).toBe(true);

    // A resposta chega: o rascunho some e a linha lê a marca da lista.
    await act(async () => { soltarSync!(); });
    await tick(120);
    expect(texto('[data-testid="badge-status-i1"]')).toBe("Pronto");
    expect(document.querySelector('[data-testid="btn-undo-skip-i1"]')).toBeTruthy();
    // E não foi um recarregamento que consertou (o servidor diria false).
    expect(getsDeItens.length).toBe(getsAntes);
  }, 30000);
});
