// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// MOLDE — as telas MONTADAS (dono, 22/09).
//
//   · ARTE: o molde com thumb salvo envia com um clique e o destino é a
//     Revisão Final — não "aprovação do patrocinador"; sem "Direto para
//     finalização" no menu.
//   · REVISÃO FINAL: o molde sem arquivo final LIBERA (o botão não trava) e a
//     coluna do arquivo diz "Não se aplica".
//   · GRÁFICA (tabela e cartão): o molde liberado tem UMA ação — "Marcar como
//     produzido" — sem Imprimir, Reaproveitar, Devolver, Conferir; a peça comum
//     vizinha segue igual. O molde produzido some da fila como a entregue e
//     conta no cartão "Entregues", não em "Impresso". O selo MOLDE aparece.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;
vi.setConfig({ testTimeout: 120_000 });

const U = vi.hoisted(() => ({ user: { id: "u1", name: "Ada", email: "a@a", role: "admin", mustChangePassword: false } as any }));
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: U.user, isLoading: false, logout: () => {} }),
  AuthProvider: ({ children }: any) => children,
}));
const avisos: { title?: string; description?: string }[] = [];
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (t: any) => { avisos.push(t); }, dismiss: () => {}, toasts: [] }), toast: (t: any) => { avisos.push(t); } }));

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const tid = (id: string) => $(`[data-testid="${id}"]`);
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
  vi.stubGlobal("confirm", () => true);
  (Element.prototype as any).scrollIntoView = () => {};
  (Element.prototype as any).scrollTo = () => {};
  (Element.prototype as any).hasPointerCapture = () => false;
  (Element.prototype as any).releasePointerCapture = () => {};
}

function fetchFalso(rota: (u: URL, init?: any) => any) {
  const mock = vi.fn(async (url: any, init?: any) => {
    const u = new URL(String(url), "http://local");
    const corpo = rota(u, init);
    return new Response(JSON.stringify(corpo === undefined ? [] : corpo), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", mock);
  return () => mock.mock.calls.filter((c: any) => c[1]?.method && c[1].method !== "GET")
    .map((c: any) => ({ url: String(c[0]), method: c[1].method as string, body: c[1].body ? JSON.parse(String(c[1].body)) : null }));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); avisos.length = 0; });

const DIA = 86_400_000;
const iso = (d: number) => new Date(Date.now() + d * DIA).toISOString();
const EVENTO = {
  id: "e1", name: "Maratona X", priority: "media", status: "active", manuallyClosed: false,
  startDate: iso(20).slice(0, 10), truckDepartureDate: iso(17), lifecycle: "active", allDelivered: false, eventHasPassed: false,
  deadlineListaImagens: -25, deadlineEntregaLayouts: -20, deadlineAprovacaoLayout: -12, deadlineFinalizacao: -10,
  deadlineRevisaoLista: -8, deadlineProducaoGrafica: -1, sponsors: [], items: [],
};
const peca = (id: string, over: any = {}) => ({
  id, displayId: `#0${id.replace(/\D/g, "").padStart(3, "0")}`, eventId: "e1", event: EVENTO, type: "Molde", description: `Molde ${id}`,
  quantity: 2, quantityProduced: 0, conferredQty: 0, deliveredQty: 0, embaladaQty: 0, reuseQty: 0, isReuse: false,
  material: "Lona", finish: "Ilhós", calculatedM2: "2", visualWidth: "1", visualHeight: "1", fileWidth: "100", fileHeight: "100",
  status: "ready_for_production", skipApproval: false, sponsors: [], observations: "", approvalThumbUrl: "/objects/t.png",
  finalFileUrl: null, kitRemessaId: null, parentItemId: null, createdAt: iso(-10), updatedAt: iso(-1), statusChangedAt: iso(-1),
  ...over,
});

// ─── GRÁFICA ─────────────────────────────────────────────────────────────────
async function montarGrafica(largura: number, pecas: any[]) {
  prepararJsdom(largura);
  U.user = { id: "u-g", name: "Gil", email: "g@g", role: "grafica", mustChangePassword: false };
  const escritas = fetchFalso((u, init) => {
    if (init?.method && init.method !== "GET") return { ok: true };
    if (u.pathname === "/api/items/approved") return pecas;
    return [];
  });
  window.history.replaceState(null, "", "/grafica");
  const { queryClient } = await import("@/lib/queryClient");
  const Grafica = (await import("@/pages/grafica")).default;
  queryClient.clear();
  queryClient.setQueryData(["/api/items/approved"], pecas);
  queryClient.setQueryData(["/api/standard-items"], []);
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Grafica as any, null))); });
  await tick(250);
  return escritas;
}

const PECAS_GRAFICA = () => [
  peca("m1"),                                                          // molde liberado
  peca("m2", { status: "produced", quantityProduced: 2 }),             // molde produzido (fim)
  peca("p1", { type: "Pórtico", finalFileUrl: "x.pdf" }),              // comum liberada
  peca("p2", { type: "Pórtico", status: "produced", quantityProduced: 2, finalFileUrl: "x.pdf" }), // comum impressa
];

describe.each([1710, 390])("Gráfica em %ipx — o molde tem uma ação só", (largura) => {
  it("molde liberado: só \"Marcar como produzido\"; a peça comum segue com Imprimir", async () => {
    const escritas = await montarGrafica(largura, PECAS_GRAFICA());
    await esperar(() => !!tid("button-molde-produzido-m1"), "o molde liberado ganha o botão");
    expect(tid("button-molde-produzido-m1")!.textContent).toContain("Marcar como produzido");
    // Nenhuma outra ação de fluxo no molde
    for (const t of ["button-production", "button-production-mobile", "button-reuse", "button-devolver-revisao", "button-confer", "button-embalar", "button-deliver", "button-mais-acoes"]) {
      expect(tid(`${t}-m1`), `${t} não aparece no molde`).toBeNull();
    }
    // TODOS os botões da linha do molde: só o "produzido" e o "ver detalhes".
    const botoesDo = (id: string) => Array.from(document.querySelectorAll<HTMLElement>(`[data-testid^="button-"][data-testid$="-${id}"]`)).map((b) => b.getAttribute("data-testid")!);
    expect(botoesDo("m1").filter((t) => !/^button-(molde-produzido|view)/.test(t)), "nenhum outro botão no molde").toEqual([]);
    // A peça comum vizinha continua como antes
    expect(botoesDo("p1").some((t) => t.startsWith("button-production")), "Imprimir continua na peça comum").toBe(true);
    expect(botoesDo("p2").some((t) => /^button-confer/.test(t)), "Conferir continua na comum impressa").toBe(true);
    // Selo
    expect(tid("selo-molde-m1")).not.toBeNull();
    expect(tid("selo-molde-p1")).toBeNull();

    await act(async () => { fireEvent.click(tid("button-molde-produzido-m1")!); });
    await esperar(() => escritas().length === 1, "marca como produzido");
    expect(escritas()[0]).toEqual({ url: "/api/items/m1/molde-produzido", method: "PATCH", body: {} });
  });

  it("molde produzido: some da fila como a entregue e conta em \"Entregues\", não em \"Impresso\"", async () => {
    await montarGrafica(largura, PECAS_GRAFICA());
    await esperar(() => !!tid("button-molde-produzido-m1"), "a fila carrega");
    expect(document.querySelector('[data-item-row="m2"], [data-testid$="-m2"]'), "molde produzido oculto por padrão").toBeNull();
    const numero = (t: string) => (tid(t)?.textContent ?? "").replace(/\D+/g, " ").trim().split(" ")[0];
    expect(numero("stat-produced"), "Impresso conta só a comum").toBe("1");
    expect(numero("stat-delivered"), "Entregues conta o molde produzido").toBe("1");
  });
});

// ─── ARTE ────────────────────────────────────────────────────────────────────
describe("Arte — o molde envia direto para a Revisão Final", () => {
  it("um clique no \"Enviar\" do molde: PATCH submit-for-approval e o aviso diz Revisão Final; sem \"Direto para finalização\"", async () => {
    prepararJsdom(1440);
    U.user = { id: "u-a", name: "Ana", email: "a@a", role: "arte", mustChangePassword: false };
    const pecas = [peca("m1", { status: "awaiting_submission" }), peca("p1", { type: "Pórtico", status: "awaiting_submission" })];
    const escritas = fetchFalso((u, init) => {
      if (init?.method && init.method !== "GET") return { ...pecas[0], status: "awaiting_final_review" };
      if (u.pathname === "/api/items" && u.searchParams.get("since")) return { itens: [], removidas: [], agora: new Date().toISOString() };
      if (u.pathname === "/api/items") return pecas;
      if (u.pathname === "/api/events") return [EVENTO];
      if (u.pathname === "/api/items/batch-approval-data") return { sponsorsByItem: {}, approvalsByItem: {} };
      return [];
    });
    window.history.replaceState(null, "", "/arte");
    const { queryClient, resetItensDelta } = await import("@/lib/queryClient");
    const { TooltipProvider } = await import("@/components/ui/tooltip");
    const Arte = (await import("@/pages/arte")).default;
    queryClient.clear();
    resetItensDelta();
    await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(TooltipProvider, null, h(Arte as any, null)))); });
    await esperar(() => !!tid("button-action-m1"), "a fila da Arte carrega com o molde");
    expect(tid("button-action-m1")!.getAttribute("title")).toMatch(/Revisão Final/);
    expect(tid("button-action-p1")!.getAttribute("title")).toMatch(/aprovação do patrocinador/);
    expect(tid("selo-molde-m1")).not.toBeNull();
    await act(async () => { fireEvent.click(tid("button-action-m1")!); });
    await esperar(() => escritas().length === 1, "envia");
    expect(escritas()[0].url).toBe("/api/items/m1/submit-for-approval");
    await esperar(() => avisos.some((a) => /Revisão Final/.test(a.description ?? "")), "o aviso diz para onde foi");
    expect(tid("button-dispense-m1")).toBeNull();
  });
});

// ─── REVISÃO FINAL ───────────────────────────────────────────────────────────
describe("Revisão Final — o molde libera sem arquivo final", () => {
  it("\"Liberar\" habilitado e a coluna do arquivo diz \"Não se aplica\"", async () => {
    prepararJsdom(1280);
    U.user = { id: "u-s", name: "Sofia", email: "s@s", role: "solicitacao", mustChangePassword: false };
    const pecas = [peca("m1", { status: "awaiting_final_review" })];
    const escritas = fetchFalso((u, init) => {
      if (init?.method && init.method !== "GET") return { ...pecas[0], status: "ready_for_production" };
      if (u.pathname === "/api/items" && u.searchParams.get("since")) return { delta: true, agora: new Date().toISOString(), itens: [], removidas: [], eventos: [], patrocinadores: [] };
      if (u.pathname === "/api/items") return pecas;
      if (u.pathname === "/api/events") return [EVENTO];
      if (/consulta-de-estoque$/.test(u.pathname)) return { consulta: null };
      return [];
    });
    window.history.replaceState(null, "", "/solicitacao");
    const { queryClient, resetItensDelta } = await import("@/lib/queryClient");
    const { TooltipProvider } = await import("@/components/ui/tooltip");
    const Solicitacao = (await import("@/pages/solicitacao")).default;
    queryClient.clear();
    resetItensDelta();
    await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(TooltipProvider, null, h(Solicitacao as any, null)))); });
    await esperar(() => !!tid("cell-final-file-m1"), "a fila da Revisão carrega");
    expect(tid("cell-final-file-m1")!.textContent).toContain("Não se aplica");
    expect(tid("selo-molde-m1")).not.toBeNull();
    window.history.replaceState(null, "", "/solicitacao?item=m1");
    await act(async () => { fireEvent.click(tid("button-review-m1")!); });
    await esperar(() => !!tid("button-release-modal"), "a ficha abre");
    await esperar(() => !(tid("button-release-modal") as HTMLButtonElement).disabled, "liberar não trava por falta de arquivo final", 200);
    await act(async () => { fireEvent.click(tid("button-release-modal")!); });
    const confirmar = tid("button-release-confirm");
    if (confirmar) await act(async () => { fireEvent.click(confirmar); });
    await esperar(() => escritas().some((e) => e.url === "/api/items/m1/creator-review"), "libera");
  });
});
