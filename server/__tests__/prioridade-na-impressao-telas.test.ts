// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// PRIORIDADE NA IMPRESSÃO — as telas MONTADAS (dono, 08/10).
//
//   · GRÁFICA (tabela em 1710 e cartões em 390), como a Solicitação: a peça em
//     revisão e a liberada mostram "Pedir prioridade"; a já impressa, não. A
//     prioritária abre o grupo "Prioritárias" no TOPO, antes dos eventos —
//     mesmo sendo de um evento mais distante — com o evento na própria peça.
//     Clicar chama a rota com { prioritaria: true } e o toast traz "Desfazer".
//   · Como a Gráfica (e a Arte): nenhum botão.
//   · O CONTROLE das fichas (Revisão Final, Painel, Detalhe do Evento): rótulo
//     por extenso; pedida → "Prioridade pedida" + "Retirar prioridade".
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;
vi.setConfig({ testTimeout: 120_000 });

const U = vi.hoisted(() => ({ user: { id: "u-s", name: "Sol", email: "s@s", role: "solicitacao", mustChangePassword: false } as any }));
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: U.user, isLoading: false, logout: () => {} }),
  AuthProvider: ({ children }: any) => children,
}));
const avisos: { title?: string; description?: string; variant?: string; action?: any }[] = [];
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
    const r = rota(u, init);
    const [status, corpo] = Array.isArray(r) && typeof r[0] === "number" ? r : [200, r];
    return new Response(JSON.stringify(corpo === undefined ? [] : corpo), { status, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", mock);
  return () => mock.mock.calls.filter((c: any) => c[1]?.method && c[1].method !== "GET")
    .map((c: any) => ({ url: String(c[0]), method: c[1].method as string, body: c[1].body ? JSON.parse(String(c[1].body)) : null }));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); avisos.length = 0; });

const DIA = 86_400_000;
const iso = (d: number) => new Date(Date.now() + d * DIA).toISOString();
const evento = (id: string, nome: string, dias: number) => ({
  id, name: nome, priority: "media", status: "active", manuallyClosed: false,
  startDate: iso(dias + 3).slice(0, 10), truckDepartureDate: iso(dias), lifecycle: "active", allDelivered: false, eventHasPassed: false,
  deadlineListaImagens: -25, deadlineEntregaLayouts: -20, deadlineAprovacaoLayout: -12, deadlineFinalizacao: -10,
  deadlineRevisaoLista: -8, deadlineProducaoGrafica: -1, sponsors: [], items: [],
});
const PERTO = evento("e1", "Maratona Perto", 10);
const LONGE = evento("e2", "Corrida Longe", 60);
const peca = (id: string, over: any = {}) => ({
  id, displayId: `#0${id.replace(/\D/g, "").padStart(3, "0")}`, eventId: "e1", event: PERTO, type: "Banner", description: `Banner ${id}`,
  quantity: 2, quantityProduced: 0, conferredQty: 0, deliveredQty: 0, embaladaQty: 0, reuseQty: 0, isReuse: false, isPriority: false,
  material: "Lona", finish: "Ilhós", calculatedM2: "2", visualWidth: "1", visualHeight: "1", fileWidth: "100", fileHeight: "100",
  status: "ready_for_production", skipApproval: false, sponsors: [], observations: "", approvalThumbUrl: null,
  finalFileUrl: "/objects/a.pdf", kitRemessaId: null, parentItemId: null, createdAt: iso(-10), updatedAt: iso(-1), statusChangedAt: iso(-1),
  producaoInterna: false, instrucoesGrafica: null,
  ...over,
});

async function montarGrafica(largura: number, papel: string, pecas: any[], rota?: (u: URL, init?: any) => any) {
  prepararJsdom(largura);
  U.user = { id: `u-${papel}`, name: "Fulana", email: "f@f", role: papel, mustChangePassword: false };
  const escritas = fetchFalso(rota ?? ((u) => (u.pathname === "/api/items/approved" ? pecas : [])));
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

describe.each([1710, 390])("Gráfica em %ipx", (largura) => {
  const FILA = () => [
    peca("p1", { status: "awaiting_final_review" }),
    peca("p2"),
    peca("p3", { status: "produced", quantityProduced: 2 }),
    peca("p9", { eventId: "e2", event: LONGE, isPriority: true, type: "Placa" }),
  ];

  it("Solicitação: botão na peça em revisão e na liberada; nada na já impressa", async () => {
    await montarGrafica(largura, "solicitacao", FILA());
    await esperar(() => !!tid("button-pedir-prioridade-p2"), "o botão aparece na liberada");
    expect(tid("button-pedir-prioridade-p1"), "em revisão também").not.toBeNull();
    expect(tid("button-pedir-prioridade-p2")!.textContent).toContain("Pedir prioridade");
    expect(tid("button-pedir-prioridade-p3"), "já impressa: sem botão").toBeNull();
    // A já prioritária oferece retirar.
    expect(tid("button-retirar-prioridade-p9")).not.toBeNull();
  });

  it("a prioritária de evento distante abre o grupo \"Prioritárias\" no topo, com o evento na peça", async () => {
    await montarGrafica(largura, "solicitacao", FILA());
    await esperar(() => !!tid("cabecalho-prioritarias"), "o grupo aparece");
    expect(tid("cabecalho-prioritarias")!.textContent).toContain("Prioritárias");
    expect(tid("cabecalho-prioritarias")!.textContent).toContain("1 peça");
    expect(tid("evento-da-prioritaria-p9")!.textContent).toContain("Corrida Longe");
    // Na ordem do documento: o grupo, a prioritária, e só depois as do evento mais próximo.
    const cab = tid("cabecalho-prioritarias")!;
    const p9 = tid("evento-da-prioritaria-p9")!;
    const p2 = tid("button-pedir-prioridade-p2")!;
    expect(cab.compareDocumentPosition(p9) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(p9.compareDocumentPosition(p2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.body.textContent).toContain("Maratona Perto");
  });

  it("pedir chama a rota e o toast traz Desfazer", async () => {
    const escritas = await montarGrafica(largura, "solicitacao", FILA(), (u, init) => {
      if (init?.method === "POST") return { ...peca("p2"), isPriority: true };
      return u.pathname === "/api/items/approved" ? FILA() : [];
    });
    await esperar(() => !!tid("button-pedir-prioridade-p2"), "o botão aparece");
    await act(async () => { fireEvent.click(tid("button-pedir-prioridade-p2")!); });
    await esperar(() => escritas().length === 1, "pede");
    expect(escritas()[0]).toEqual({ url: "/api/items/p2/prioridade-na-impressao", method: "POST", body: { prioritaria: true } });
    await esperar(() => avisos.some((a) => a.title === "Prioridade pedida: #0002"), "o toast de sucesso");
    const toast = avisos.find((a) => a.title === "Prioridade pedida: #0002")!;
    expect(toast.description).toMatch(/Gráfica foi avisada/);
    expect(toast.action?.props?.children).toBe("Desfazer");
  });

  for (const papel of ["grafica", "arte"]) {
    it(`${papel}: nenhum botão de prioridade (o selo segue)`, async () => {
      await montarGrafica(largura, papel, FILA());
      await esperar(() => !!tid("cabecalho-prioritarias"), "a fila desenha");
      expect(document.querySelector('[data-testid^="button-pedir-prioridade-"]')).toBeNull();
      expect(document.querySelector('[data-testid^="button-retirar-prioridade-"]')).toBeNull();
      expect(tid(largura < 768 ? "chip-prioritaria-p9" : "selo-prioritaria-p9")).not.toBeNull();
    });
  }
});

// ─── O CONTROLE DAS FICHAS (Revisão Final, Painel Geral, Detalhe do Evento) ──
async function montarControle(papel: string, item: any, eventoFinalizado = false) {
  prepararJsdom(1366);
  U.user = { id: `u-${papel}`, name: "Fulana", email: "f@f", role: papel, mustChangePassword: false };
  fetchFalso(() => []);
  const { queryClient } = await import("@/lib/queryClient");
  const { PrioridadeNaImpressao } = await import("@/components/prioridade-na-impressao");
  queryClient.clear();
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(PrioridadeNaImpressao, { item, eventoFinalizado }))); });
  await tick(20);
}

describe("o controle das fichas", () => {
  it("Solicitação, peça na Revisão Final: \"Pedir prioridade na impressão\" por extenso", async () => {
    await montarControle("solicitacao", peca("p1", { status: "awaiting_final_review" }));
    expect(tid("button-pedir-prioridade-p1")!.textContent).toContain("Pedir prioridade na impressão");
  });

  it("pedida: \"Prioridade pedida\" + \"Retirar prioridade\"", async () => {
    await montarControle("admin", peca("p1", { status: "inProduction", isPriority: true }));
    expect(tid("prioridade-pedida-p1")!.textContent).toContain("Prioridade pedida");
    expect(tid("button-retirar-prioridade-p1")!.textContent).toContain("Retirar prioridade");
  });

  it("evento finalizado: pedir some; retirar fica", async () => {
    await montarControle("solicitacao", peca("p1"), true);
    expect(tid("button-pedir-prioridade-p1")).toBeNull();
    cleanup();
    await montarControle("solicitacao", peca("p1", { isPriority: true }), true);
    expect(tid("button-retirar-prioridade-p1")).not.toBeNull();
  });

  for (const [papel, status] of [["arte", "awaiting_final_review"], ["grafica", "ready_for_production"], ["atendimento", "ready_for_production"], ["solicitacao", "produced"], ["solicitacao", "awaiting_submission"]] as const) {
    it(`${papel} em ${status}: nada`, async () => {
      await montarControle(papel, peca("p1", { status }));
      expect(document.querySelector('[data-testid$="-prioridade-p1"]')).toBeNull();
      expect(tid("prioridade-pedida-p1")).toBeNull();
    });
  }
});
