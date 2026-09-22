// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// REVISÃO FINAL MONTADA — a trava, o lote de liberar e o molde devolvido.
//
//   · o lote manda SÓ as prontas; sem arquivo final e travada ficam de fora,
//     marcadas com o motivo na linha, e a recusa do servidor também vai para
//     a linha da peça;
//   · peça travada: a ficha mostra o selo e a confirmação oferece "Liberar e
//     destravar" e "Liberar mantendo a trava";
//   · molde: a devolução não oferece o seletor de destino.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;
vi.setConfig({ testTimeout: 120_000 });

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "u-s", name: "Sofia", email: "s@s", role: "solicitacao", mustChangePassword: false }, isLoading: false, logout: () => {} }),
  AuthProvider: ({ children }: any) => children,
}));
const avisos: { title?: string; description?: string }[] = [];
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (t: any) => { avisos.push(t); }, dismiss: () => {}, toasts: [] }), toast: (t: any) => { avisos.push(t); } }));

const tid = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const tick = (ms = 0) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
async function esperar(cond: () => boolean, oQue: string, max = 400) {
  for (let i = 0; i < max && !cond(); i++) await tick(25);
  expect(cond(), oQue).toBe(true);
}

function prepararJsdom(largura: number) {
  Object.defineProperty(window, "innerWidth", { value: largura, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 900, configurable: true });
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: /max-width:\s*767px/.test(q) && largura < 768, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
  (Element.prototype as any).scrollIntoView = () => {};
  (Element.prototype as any).scrollTo = () => {};
  (Element.prototype as any).hasPointerCapture = () => false;
  (Element.prototype as any).releasePointerCapture = () => {};
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); avisos.length = 0; });

const DIA = 86_400_000;
const iso = (d: number) => new Date(Date.now() + d * DIA).toISOString();
const EVENTO = {
  id: "e1", name: "Maratona X", priority: "media", status: "active", manuallyClosed: false,
  startDate: iso(20).slice(0, 10), truckDepartureDate: iso(17), lifecycle: "active", allDelivered: false, eventHasPassed: false,
  deadlineListaImagens: -25, deadlineRevisaoLista: -8, sponsors: [], items: [],
};
const peca = (id: string, over: any = {}) => ({
  id, displayId: `#0${id.replace(/\D/g, "").padStart(3, "0")}`, eventId: "e1", event: EVENTO, type: "Pórtico", description: `Peça ${id}`,
  quantity: 2, quantityProduced: 0, conferredQty: 0, deliveredQty: 0, reuseQty: 0, isReuse: false,
  material: "Lona", finish: "Ilhós", calculatedM2: "2", fileWidth: "100", fileHeight: "100",
  status: "awaiting_final_review", skipApproval: false, sponsors: [], observations: "", approvalThumbUrl: "/objects/t.png",
  finalFileUrl: "/objects/final.pdf", kitRemessaId: null, parentItemId: null, travadaEm: null,
  createdAt: iso(-10), updatedAt: iso(-1), statusChangedAt: iso(-1),
  ...over,
});
const TRAVA = { travadaEm: iso(-1), travadaPor: "Ana", travadaMotivo: "Quantidade vai mudar" };

async function montar(pecas: any[], recusar: Record<string, string> = {}) {
  prepararJsdom(1280);
  const chamadas: { url: string; method: string; body: any }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: any, init?: any) => {
    const u = new URL(String(url), "http://local");
    const metodo = init?.method ?? "GET";
    const json = (corpo: any, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
    if (metodo !== "GET") {
      chamadas.push({ url: u.pathname, method: metodo, body: init?.body ? JSON.parse(String(init.body)) : null });
      const id = u.pathname.split("/")[3];
      if (recusar[id]) return json({ error: recusar[id] }, 409);
      return json({ ...(pecas.find((p) => p.id === id) ?? {}), status: "ready_for_production" });
    }
    if (u.pathname === "/api/items" && u.searchParams.get("since")) return json({ delta: true, agora: new Date().toISOString(), itens: [], removidas: [], eventos: [], patrocinadores: [] });
    if (u.pathname === "/api/items") return json(pecas);
    if (u.pathname === "/api/events") return json([EVENTO]);
    if (/consulta-de-estoque$/.test(u.pathname)) return json({ consulta: null });
    return json([]);
  }));
  window.history.replaceState(null, "", "/solicitacao");
  const { queryClient, resetItensDelta } = await import("@/lib/queryClient");
  const { TooltipProvider } = await import("@/components/ui/tooltip");
  const Solicitacao = (await import("@/pages/solicitacao")).default;
  queryClient.clear();
  resetItensDelta();
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(TooltipProvider, null, h(Solicitacao as any, null)))); });
  await esperar(() => !!tid(`button-review-${pecas[0].id}`), "a fila da Revisão carrega");
  return chamadas;
}

describe("liberar em lote leva só as prontas", () => {
  it("sem arquivo e travada ficam de fora, com o motivo na linha; a recusa do servidor também", async () => {
    const chamadas = await montar([
      peca("a1"),
      peca("a2", { finalFileUrl: null }),
      peca("a3", TRAVA),
      peca("a4"),
    ], { a4: "O evento foi encerrado por um administrador." });
    await act(async () => { fireEvent.click(tid("checkbox-select-all-header")!); });
    await esperar(() => !!tid("button-bulk-release-hero"), "a barra de lote aparece");
    expect(tid("button-bulk-release-hero")!.textContent).toBe("Liberar as 2 prontas");
    await act(async () => { fireEvent.click(tid("button-bulk-release-hero")!); });
    await esperar(() => !!tid("button-bulk-release-confirm"), "a confirmação abre");
    expect(tid("aviso-bulk-release-sem-arquivo")!.textContent).toContain("1 ainda não tem");
    expect(tid("aviso-bulk-release-travadas")!.textContent).toContain("1 está travada");
    await act(async () => { fireEvent.click(tid("button-bulk-release-confirm")!); });
    await esperar(() => !!tid("falha-lote-a4"), "a recusa do servidor vai para a linha");
    // Só as prontas foram chamadas.
    expect(chamadas.map((c) => c.url).sort()).toEqual(["/api/items/a1/creator-review", "/api/items/a4/creator-review"]);
    expect(tid("falha-lote-a4")!.textContent).toContain("encerrado por um administrador");
    expect(tid("falha-lote-a2")!.textContent).toContain("Sem arquivo final");
    expect(tid("falha-lote-a3")!.textContent).toContain("Travada");
    expect(tid("badge-travada-tabela-a3")!.textContent).toContain("Quantidade vai mudar");
    expect(avisos.some((a) => a.title === "Liberação parcial")).toBe(true);
  });
});

describe("peça travada na ficha", () => {
  it("mostra o selo e a confirmação oferece destravar ou manter a trava", async () => {
    const chamadas = await montar([peca("t1", TRAVA)]);
    await act(async () => { fireEvent.click(tid("button-review-t1")!); });
    await esperar(() => !!tid("selo-travada-revisao"), "a ficha mostra a trava");
    expect(tid("selo-travada-revisao")!.textContent).toContain("Quantidade vai mudar");
    expect(tid("button-destravar-revisao")).not.toBeNull();
    await act(async () => { fireEvent.click(tid("button-release-modal")!); });
    await esperar(() => !!tid("button-release-destravar"), "a confirmação pergunta da trava");
    expect(tid("button-release-confirm")!.textContent).toBe("Liberar mantendo a trava");
    await act(async () => { fireEvent.click(tid("button-release-destravar")!); });
    await esperar(() => chamadas.length === 1, "libera");
    expect(chamadas[0]).toMatchObject({ url: "/api/items/t1/creator-review", body: { destravar: true } });
  });

  it("peça livre: o botão Travar pede motivo antes de travar", async () => {
    const chamadas = await montar([peca("l1")]);
    await act(async () => { fireEvent.click(tid("button-review-l1")!); });
    await esperar(() => !!tid("button-travar-revisao"), "a ficha oferece travar");
    await act(async () => { fireEvent.click(tid("button-travar-revisao")!); });
    await esperar(() => !!tid("button-travar-confirm-revisao"), "o diálogo abre");
    expect((tid("button-travar-confirm-revisao") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fireEvent.change(tid("textarea-motivo-trava-revisao")!, { target: { value: "Arte vai mudar" } }); });
    await act(async () => { fireEvent.click(tid("button-travar-confirm-revisao")!); });
    await esperar(() => chamadas.length === 1, "trava");
    expect(chamadas[0]).toMatchObject({ url: "/api/items/l1/travar", method: "POST", body: { motivo: "Arte vai mudar" } });
  });
});

describe("molde devolvido", () => {
  it("não oferece o seletor de destino — diz que volta para o começo da Arte com o thumb", async () => {
    await montar([peca("m1", { type: "Molde", finalFileUrl: null })]);
    await act(async () => { fireEvent.click(tid("button-review-m1")!); });
    await esperar(() => !!tid("button-return-toggle"), "a ficha abre");
    await act(async () => { fireEvent.click(tid("button-return-toggle")!); });
    await esperar(() => !!tid("aviso-devolucao-molde"), "o aviso do molde aparece");
    expect(tid("destino-finalizacao")).toBeNull();
    expect(tid("aviso-devolucao-molde")!.textContent).toContain("com o thumb");
  });
});
