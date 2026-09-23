// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// ARQUIVADOS NAS TELAS — Eventos e Patrocinadores, montadas de verdade.
//
// "Excluir" arquiva no servidor (nada é apagado), mas a tela dizia "remove
// permanentemente" e não havia como ver nem restaurar o que saiu. Aqui:
//   · a confirmação de excluir diz que ARQUIVA e que dá para restaurar;
//   · o admin vê "Arquivados (N)" — e só ele, e só quando há o que restaurar;
//   · Restaurar pergunta antes (confirmação da casa), chama a rota, avisa com
//     toast de sucesso e revalida as listas que o item volta a ocupar.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;

type Resposta = { status?: number; corpo: unknown };
const H = vi.hoisted(() => ({
  papel: "admin" as string,
  chamadas: [] as Array<{ metodo: string; url: string }>,
  rotas: {} as Record<string, () => { status?: number; corpo: unknown }>,
}));

const EVENTO = {
  id: "e1", name: "COPA NORTE", priority: "alta",
  startDate: "2099-09-10", truckDepartureDate: "2099-09-05T08:00:00.000Z",
  deadlineListaImagens: -25, deadlineEntregaLayouts: -20, deadlineAprovacaoLayout: -12,
  deadlineFinalizacao: -10, deadlineRevisaoLista: -8, deadlineProducaoGrafica: -1,
  lifecycle: "active", allDelivered: false, eventHasPassed: false,
  sponsors: [], items: [], nextMilestone: null,
};
const EVENTO_ARQUIVADO = {
  id: "ev-arq", name: "COPA ANTIGA", startDate: "2099-03-10T08:00:00.000Z",
  arquivadoEm: "2026-09-20T12:00:00.000Z", arquivadoPor: "Ana", totalPecas: 3,
};
const PATROCINADOR = { id: "sp-1", name: "Marca Viva", color: "#3b82f6", company: null, accountExecutiveId: null, strictApproval: false, arquivadoEm: null, arquivadoPor: null };
const PATROCINADOR_ARQUIVADO = { ...PATROCINADOR, id: "sp-arq", name: "Marca Arquivada", arquivadoEm: "2026-09-21T15:30:00.000Z", arquivadoPor: "Bruno" };

beforeAll(() => {
  const real = window.getComputedStyle.bind(window);
  vi.stubGlobal("getComputedStyle", (el: Element, pe?: string | null) => {
    const base = real(el, pe ?? undefined);
    return new Proxy(base, {
      get(t, p) {
        if (p === "animationName") return "none";
        const v = Reflect.get(t, p);
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
  });
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(Element.prototype, "scrollIntoView", { value: () => {}, configurable: true });

  vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url).split("?")[0];
    const metodo = (init?.method || "GET").toUpperCase();
    H.chamadas.push({ metodo, url: u });
    const json = (r: Resposta) => new Response(JSON.stringify(r.corpo), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
    const rota = H.rotas[`${metodo} ${u}`];
    if (rota) return json(rota());
    if (u === "/api/auth/me") return json({ corpo: { id: "u1", name: "Maria", email: "m@a", role: H.papel, mustChangePassword: false } });
    return json({ corpo: [] });
  });
});

beforeEach(() => {
  cleanup();
  H.papel = "admin";
  H.chamadas.length = 0;
  H.rotas = {};
});

async function tick(ms = 60) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
const porTestId = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
/** Espera a tela chegar ao estado (a máquina ocupada atrasa query e animação). */
async function esperar<T>(ler: () => T | null | undefined | false, ms = 6000): Promise<T | null> {
  const fim = Date.now() + ms;
  for (;;) {
    const v = ler();
    if (v) return v;
    if (Date.now() > fim) return null;
    await tick(50);
  }
}
async function clicar(id: string) {
  const el = await esperar(() => porTestId(id));
  expect(el, `faltou [data-testid="${id}"]`).toBeTruthy();
  await act(async () => { el!.click(); });
  await tick(80);
}

async function montar(Tela: React.ComponentType) {
  const { queryClient } = await import("@/lib/queryClient");
  const { TooltipProvider } = await import("@/components/ui/tooltip");
  const { AuthProvider } = await import("@/contexts/auth-context");
  const { Toaster } = await import("@/components/ui/toaster");
  queryClient.clear();
  render(
    h(QueryClientProvider, { client: queryClient },
      h(TooltipProvider, null,
        h(AuthProvider, null, h(Tela), h(Toaster)))),
  );
  await tick(100);
  return queryClient;
}

describe("Eventos: excluir arquiva, e o admin restaura", () => {
  it("a confirmação de excluir diz que arquiva e que nada é apagado", async () => {
    H.rotas["GET /api/events"] = () => ({ corpo: [EVENTO] });
    const Eventos = (await import("@/pages/eventos")).default;
    await montar(Eventos);
    await clicar("button-delete-event-e1");
    const texto = document.body.textContent ?? "";
    expect(texto).toContain("Arquivar evento");
    expect(texto).toContain("Nada é apagado");
    expect(texto).toContain("restaurá-lo em Arquivados");
    expect(texto).not.toContain("remove permanentemente");
    expect(texto).not.toContain("não pode ser desfeita");
    expect(porTestId("button-confirm-delete-event")?.textContent).toContain("Arquivar");
  }, 30_000);

  it("admin vê 'Arquivados (N)' e restaura com confirmação, toast e listas revalidadas", async () => {
    let arquivados = [EVENTO_ARQUIVADO];
    H.rotas["GET /api/events"] = () => ({ corpo: [EVENTO] });
    H.rotas["GET /api/events/arquivados"] = () => ({ corpo: arquivados });
    H.rotas["POST /api/events/ev-arq/restaurar"] = () => { arquivados = []; return { corpo: { success: true, items: 3 } }; };
    const Eventos = (await import("@/pages/eventos")).default;
    const qc = await montar(Eventos);
    const invalidar = vi.spyOn(qc, "invalidateQueries");

    expect((await esperar(() => porTestId("button-eventos-arquivados")))?.textContent).toContain("Arquivados (1)");
    await clicar("button-eventos-arquivados");
    const linha = await esperar(() => porTestId("eventos-arquivados-linha-ev-arq"));
    expect(linha?.textContent).toContain("COPA ANTIGA");
    expect(linha?.textContent).toContain("Arquivado em 20/09/2026");
    expect(linha?.textContent).toContain("por Ana");
    expect(linha?.textContent).toContain("3 peças");

    // Restaurar pergunta antes — sem confirmar, nada vai ao servidor.
    await clicar("eventos-arquivados-restaurar-ev-arq");
    expect((await esperar(() => porTestId("confirmacao")?.textContent?.includes("Restaurar") && porTestId("confirmacao")))?.textContent).toContain("Restaurar COPA ANTIGA?");
    await clicar("confirmacao-cancelar");
    expect(H.chamadas.some((c) => c.metodo === "POST")).toBe(false);

    await clicar("eventos-arquivados-restaurar-ev-arq");
    await clicar("confirmacao-confirmar");
    await esperar(() => document.body.textContent?.includes("Evento restaurado"));
    expect(H.chamadas).toContainEqual({ metodo: "POST", url: "/api/events/ev-arq/restaurar" });
    const chaves = invalidar.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(chaves).toEqual(expect.arrayContaining(['["/api/events"]', '["/api/items"]', '["/api/events/arquivados"]']));
    expect(document.body.textContent).toContain("Evento restaurado");
    expect(document.body.textContent).toContain("COPA ANTIGA voltou às telas com 3 peças");
  }, 30_000);

  it("quem não é admin não vê o acesso nem pede a lista", async () => {
    H.papel = "solicitacao";
    H.rotas["GET /api/events"] = () => ({ corpo: [EVENTO] });
    H.rotas["GET /api/events/arquivados"] = () => ({ corpo: [EVENTO_ARQUIVADO] });
    const Eventos = (await import("@/pages/eventos")).default;
    await montar(Eventos);
    await esperar(() => porTestId("button-delete-event-e1") || document.body.textContent?.includes("COPA NORTE"));
    await tick(200);
    expect(porTestId("button-eventos-arquivados")).toBeNull();
    expect(H.chamadas.some((c) => c.url === "/api/events/arquivados")).toBe(false);
  }, 30_000);

  it("sem nada arquivado, o acesso não aparece", async () => {
    H.rotas["GET /api/events"] = () => ({ corpo: [EVENTO] });
    H.rotas["GET /api/events/arquivados"] = () => ({ corpo: [] });
    const Eventos = (await import("@/pages/eventos")).default;
    await montar(Eventos);
    await esperar(() => H.chamadas.some((c) => c.url === "/api/events/arquivados"));
    await tick(200);
    expect(porTestId("button-eventos-arquivados")).toBeNull();
  }, 30_000);
});

describe("Patrocinadores: excluir arquiva, e o admin restaura", () => {
  it("a confirmação de excluir diz que arquiva e o que fica guardado", async () => {
    H.rotas["GET /api/sponsors"] = () => ({ corpo: [PATROCINADOR] });
    const Patrocinadores = (await import("@/pages/patrocinadores")).default;
    await montar(Patrocinadores);
    const lixeira = await esperar(() => document.querySelector('[aria-label="Excluir patrocinador Marca Viva"]') as HTMLElement | null);
    expect(lixeira).toBeTruthy();
    await act(async () => { lixeira!.click(); });
    await tick(120);
    const dialogo = porTestId("dialog-confirm-delete")?.textContent ?? "";
    expect(dialogo).toContain("Arquivar Marca Viva?");
    expect(dialogo).toContain("Nada é apagado");
    expect(dialogo).toContain("Dá para restaurar em Arquivados");
    expect(dialogo).not.toContain("irreversível");
    expect(porTestId("button-confirm-delete")?.textContent).toContain("Sim, arquivar");
  }, 30_000);

  it("admin vê 'Arquivados (N)' e restaura com confirmação, toast e lista revalidada", async () => {
    let arquivados = [PATROCINADOR_ARQUIVADO];
    H.rotas["GET /api/sponsors"] = () => ({ corpo: [PATROCINADOR] });
    H.rotas["GET /api/sponsors/arquivados"] = () => ({ corpo: arquivados });
    H.rotas["POST /api/sponsors/sp-arq/restaurar"] = () => { arquivados = []; return { corpo: { ...PATROCINADOR_ARQUIVADO, arquivadoEm: null } }; };
    const Patrocinadores = (await import("@/pages/patrocinadores")).default;
    const qc = await montar(Patrocinadores);
    const invalidar = vi.spyOn(qc, "invalidateQueries");

    expect((await esperar(() => porTestId("button-patrocinadores-arquivados")))?.textContent).toContain("Arquivados (1)");
    await clicar("button-patrocinadores-arquivados");
    const linha = await esperar(() => porTestId("patrocinadores-arquivados-linha-sp-arq"));
    expect(linha?.textContent).toContain("Marca Arquivada");
    expect(linha?.textContent).toContain("por Bruno");

    await clicar("patrocinadores-arquivados-restaurar-sp-arq");
    expect((await esperar(() => porTestId("confirmacao")?.textContent?.includes("Restaurar") && porTestId("confirmacao")))?.textContent).toContain("Restaurar Marca Arquivada?");
    await clicar("confirmacao-confirmar");
    await esperar(() => document.body.textContent?.includes("Patrocinador restaurado"));
    expect(H.chamadas).toContainEqual({ metodo: "POST", url: "/api/sponsors/sp-arq/restaurar" });
    const chaves = invalidar.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(chaves).toEqual(expect.arrayContaining(['["/api/sponsors"]', '["/api/sponsors/arquivados"]']));
    expect(document.body.textContent).toContain("Patrocinador restaurado");
  }, 30_000);

  it("quem não é admin não vê o acesso nem pede a lista", async () => {
    H.papel = "atendimento";
    H.rotas["GET /api/sponsors"] = () => ({ corpo: [PATROCINADOR] });
    H.rotas["GET /api/sponsors/arquivados"] = () => ({ corpo: [PATROCINADOR_ARQUIVADO] });
    const Patrocinadores = (await import("@/pages/patrocinadores")).default;
    await montar(Patrocinadores);
    await esperar(() => document.body.textContent?.includes("Marca Viva"));
    await tick(200);
    expect(porTestId("button-patrocinadores-arquivados")).toBeNull();
    expect(H.chamadas.some((c) => c.url === "/api/sponsors/arquivados")).toBe(false);
  }, 30_000);
});
