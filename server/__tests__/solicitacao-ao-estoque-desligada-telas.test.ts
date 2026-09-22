// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// SOLICITAÇÃO AO ESTOQUE — A CHAVE DESLIGADA, NAS TELAS (dono, 21/09).
//
// "O reaproveitar por solicitação, segurar: não vamos implementar agora; segue
// no fluxo NORMAL de reaproveitar." Com SOLICITACAO_AO_ESTOQUE_ATIVA = false:
//   1. REVISÃO FINAL: o modal Reaproveitamento é o de antes — "Reaproveitar
//      tudo (N un.) — pula produção" e "Confirmar N un. reaproveitadas"
//      aplicam direto, com o payload de sempre; nenhum selo, chip, filtro
//      ?estoque=, bloco na ficha — e ZERO chamadas a /api/consultas-de-estoque;
//   2. GRÁFICA: o aviso "N un. aguardando resposta do estoque" não aparece e
//      não pede nada;
//   3. CASCA: sem o item "Solicitações ao estoque" no menu, sem o número, e a
//      rota antiga cai na Gráfica.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "fs";
import path from "path";

const h = React.createElement;
vi.setConfig({ testTimeout: 120_000 });

const U = vi.hoisted(() => ({ user: { id: "u-sol", name: "Sofia", email: "s@s", role: "solicitacao", mustChangePassword: false } as any }));
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: U.user, isLoading: false, logout: () => {} }),
  AuthProvider: ({ children }: any) => children,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {}, dismiss: () => {}, toasts: [] }), toast: () => {} }));

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const tid = (id: string) => $(`[data-testid="${id}"]`);
const tick = (ms = 0) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
async function esperar(cond: () => boolean, oQue: string, max = 400) {
  for (let i = 0; i < max && !cond(); i++) await tick(25);
  expect(cond(), oQue).toBe(true);
}

function prepararJsdom(largura: number) {
  Object.defineProperty(window, "innerWidth", { value: largura, configurable: true });
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
    const u = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url, "http://local");
    const corpo = rota(u, init);
    return new Response(JSON.stringify(corpo === undefined ? [] : corpo), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", mock);
  const urls = () => mock.mock.calls.map((c: any) => String(typeof c[0] === "string" ? c[0] : c[0] instanceof URL ? c[0].href : c[0].url));
  const escritas = () => mock.mock.calls.filter((c: any) => c[1]?.method && c[1].method !== "GET")
    .map((c: any) => ({ url: String(c[0]), method: c[1].method as string, body: c[1].body ? JSON.parse(String(c[1].body)) : null }));
  const doEstoque = () => urls().filter((u) => u.includes("consultas-de-estoque") || u.includes("consulta-de-estoque"));
  return { mock, escritas, doEstoque };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// ─── 1 · REVISÃO FINAL ───────────────────────────────────────────────────────
const EVENTO = {
  id: "e1", name: "Maratona X", priority: "media", status: "active", manuallyClosed: false, startDate: "2099-09-10",
  truckDepartureDate: "2099-09-05T08:00:00.000Z", lifecycle: "active", allDelivered: false, eventHasPassed: false,
  deadlineListaImagens: -25, deadlineEntregaLayouts: -20, deadlineAprovacaoLayout: -12, deadlineFinalizacao: -10,
  deadlineRevisaoLista: -8, deadlineProducaoGrafica: -1, sponsors: [], items: [],
};
const pecaDaRevisao = (i: number, over: any = {}) => ({
  id: `i${i}`, displayId: `#012${i}`, eventId: "e1", event: EVENTO, type: "Lona", description: `Lona de pórtico ${i}`, quantity: 6,
  visualWidth: "2", visualHeight: "1", material: "Lona", finish: "Ilhós", status: "awaiting_final_review", skipApproval: false,
  isReuse: false, reuseQty: 0, observations: "", sponsors: [], finalFileUrl: "https://ex.com/final.pdf", approvalThumbUrl: null,
  kitRemessaId: null, createdAt: "2026-09-01T12:00:00.000Z", updatedAt: "2026-09-01T12:00:00.000Z", ...over,
});
// Se a tela pedisse, o servidor "responderia" — e mesmo assim nada pode aparecer.
const RESPOSTAS = [
  { id: "c1", itemId: "i1", status: "atendida", quantidadePedida: 6, quantidadeAtendida: 6, respondidoPor: "Gil", respondidoEm: "2026-09-21T14:00:00.000Z" },
  { id: "c2", itemId: "i2", status: "aberta", quantidadePedida: 3, quantidadeAtendida: null, respondidoPor: null, respondidoEm: null },
];

async function montarRevisao(opts: { pecas?: any[]; url?: string; papel?: "solicitacao" | "admin" } = {}) {
  prepararJsdom(1280);
  const papel = opts.papel ?? "solicitacao";
  U.user = { id: papel === "admin" ? "u-adm" : "u-sol", name: papel === "admin" ? "Ada" : "Sofia", email: "s@s", role: papel, mustChangePassword: false };
  const pecas = opts.pecas ?? [pecaDaRevisao(1), pecaDaRevisao(2)];
  const f = fetchFalso((u, init) => {
    if (init?.method && init.method !== "GET") return { ok: true };
    if (u.pathname === "/api/items" && !u.searchParams.get("since")) return pecas;
    if (u.pathname === "/api/items") return { delta: true, agora: new Date().toISOString(), itens: [], removidas: [], eventos: [], patrocinadores: [] };
    if (u.pathname === "/api/events") return [EVENTO];
    if (u.pathname === "/api/consultas-de-estoque/da-revisao") return RESPOSTAS;
    const m = u.pathname.match(/^\/api\/items\/([^/]+)\/consulta-de-estoque$/);
    if (m) return { consulta: RESPOSTAS.find((c) => c.itemId === m[1]) ?? null };
    return [];
  });
  window.history.replaceState(null, "", opts.url ?? "/solicitacao?item=i1");
  const { queryClient, resetItensDelta } = await import("@/lib/queryClient");
  const { TooltipProvider } = await import("@/components/ui/tooltip");
  const Solicitacao = (await import("@/pages/solicitacao")).default;
  queryClient.clear();
  resetItensDelta();
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(TooltipProvider, null, h(Solicitacao, null)))); });
  await esperar(() => document.querySelectorAll('[data-testid^="button-review-"]').length > 0, "a fila carrega");
  await esperar(() => !!tid("button-release-modal"), "a ficha abre");
  await tick(200);
  return f;
}

const botaoComTexto = (texto: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((b) => (b.textContent ?? "").includes(texto)) ?? null;

describe("Revisão Final com a chave desligada — o fluxo NORMAL de reaproveitar", () => {
  it("nada da solicitação ao estoque aparece — e nenhuma chamada a /api/consultas-de-estoque", async () => {
    const f = await montarRevisao({ url: "/solicitacao?item=i1&estoque=respondeu" });
    expect(document.querySelectorAll('[data-testid^="selo-estoque-"]').length).toBe(0);
    expect(tid("chip-estoque-respondeu")).toBeNull();
    expect(tid("chip-aguardando-estoque")).toBeNull();
    // ?estoque= é ignorado como antes: não filtra, não some da URL por nossa conta
    expect(tid("button-review-i1")).not.toBeNull();
    expect(tid("button-review-i2")).not.toBeNull();
    expect(window.location.search).toContain("estoque=respondeu");
    // a ficha: botão de sempre, sem bloco do estoque
    expect(tid("button-release-modal")!.textContent).toContain("Liberar para produção");
    expect(document.querySelectorAll('[data-testid^="estoque-na-ficha"]').length).toBe(0);
    expect(f.doEstoque()).toEqual([]);
  });

  it("“Reaproveitar tudo (6 un.) — pula produção” aplica direto: PATCH isReuse + creator-review vazio, como antes", async () => {
    const f = await montarRevisao();
    await act(async () => { fireEvent.click(tid("button-reuse-modal")!); });
    await esperar(() => !!botaoComTexto("Reaproveitar tudo (6 un.) — pula produção"), "o modal abre com as opções de sempre");
    expect(tid("pedir-ao-estoque")).toBeNull();
    expect(tid("ja-conferi-aplicar-agora")).toBeNull();
    await act(async () => { fireEvent.click(botaoComTexto("Reaproveitar tudo (6 un.) — pula produção")!); });
    await esperar(() => f.escritas().length === 2, "as duas escritas de sempre");
    expect(f.escritas()).toEqual([
      { url: "/api/items/i1", method: "PATCH", body: { isReuse: true } },
      { url: "/api/items/i1/creator-review", method: "PATCH", body: {} },
    ]);
    expect(f.doEstoque()).toEqual([]);
  });

  it("“Confirmar N un. reaproveitadas” aplica direto: creator-review { reuseQty }, como antes", async () => {
    const f = await montarRevisao();
    await act(async () => { fireEvent.click(tid("button-reuse-modal")!); });
    await esperar(() => !!tid("input-partial-reuse-qty"), "o parcial aparece");
    await act(async () => { fireEvent.change(tid("input-partial-reuse-qty")!, { target: { value: "2" } }); });
    await act(async () => { fireEvent.click(botaoComTexto("Confirmar 2 un. reaproveitadas")!); });
    await esperar(() => f.escritas().length === 1, "a escrita de sempre");
    expect(f.escritas()).toEqual([{ url: "/api/items/i1/creator-review", method: "PATCH", body: { reuseQty: 2 } }]);
    expect(f.doEstoque()).toEqual([]);
  });

  it("admin vê o mesmo modal de antes (sem atalho escondido)", async () => {
    await montarRevisao({ papel: "admin" });
    await act(async () => { fireEvent.click(tid("button-reuse-modal")!); });
    await esperar(() => !!botaoComTexto("Reaproveitar tudo (6 un.) — pula produção"), "as opções aparecem direto");
    expect(tid("ja-conferi-aplicar-agora")).toBeNull();
    expect(tid("pedir-ao-estoque")).toBeNull();
  });

  it("Liberar: sem arquivo final continua travado (mesmo que o estoque “cobrisse tudo”); com arquivo, corpo vazio", async () => {
    const f = await montarRevisao({ pecas: [pecaDaRevisao(1, { finalFileUrl: null }), pecaDaRevisao(2)] });
    expect((tid("button-release-modal") as HTMLButtonElement).disabled).toBe(true);
    expect(tid("button-release-modal")!.getAttribute("title")).toBe("Arquivo final não enviado");
    cleanup();
    const g = await montarRevisao({ url: "/solicitacao?item=i2" });
    expect((tid("button-release-modal") as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { fireEvent.click(tid("button-release-modal")!); });
    await esperar(() => !!tid("button-release-confirm"), "a confirmação abre");
    expect(tid("confirmacao-com-estoque")).toBeNull();
    expect(tid("confirmacao-pedido-em-aberto")).toBeNull();
    await act(async () => { fireEvent.click(tid("button-release-confirm")!); });
    await esperar(() => g.escritas().length === 1, "libera");
    expect(g.escritas()).toEqual([{ url: "/api/items/i2/creator-review", method: "PATCH", body: {} }]);
    expect(f.doEstoque()).toEqual([]);
    expect(g.doEstoque()).toEqual([]);
  });
});

// ─── 2 · GRÁFICA ─────────────────────────────────────────────────────────────
describe("Gráfica com a chave desligada", () => {
  it("AvisoDoEstoqueNaPeca não desenha nada e não pede nada", async () => {
    prepararJsdom(1280);
    const f = fetchFalso(() => [{ id: "c1", itemId: "i1", quantidadePedida: 5, pedidoPor: "Sofia" }]);
    const { queryClient } = await import("@/lib/queryClient");
    queryClient.clear();
    const { AvisoDoEstoqueNaPeca } = await import("@/components/consulta-de-estoque/aviso-na-grafica");
    const { container } = render(h(QueryClientProvider, { client: queryClient } as any, h(AvisoDoEstoqueNaPeca, { peca: { id: "i1" } })));
    await tick(200);
    expect(container.innerHTML).toBe("");
    expect(f.mock).not.toHaveBeenCalled();
  });
});

// ─── 3 · A CASCA ─────────────────────────────────────────────────────────────
// Montar o App inteiro já é o trabalho de perf-casca-requisicoes.test.ts (que
// prova zero chamadas a /api/consultas-de-estoque/abertas e o orçamento de
// antes). Aqui, pela fonte, a mudança fica declarada.
describe("menu, rota e pré-carga com a chave desligada", () => {
  const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

  it("o item do menu e o número só existem com a chave ligada", () => {
    const menu = ler("client/src/components/app-sidebar.tsx");
    expect(menu).toContain("...(SOLICITACAO_AO_ESTOQUE_ATIVA ? [ITEM_SOLICITACOES_AO_ESTOQUE] : []),");
    expect(menu).toContain('const respondeConsultas = SOLICITACAO_AO_ESTOQUE_ATIVA && (role === "grafica" || role === "admin");');
    // nenhum outro "{ title: \"Solicitações ao estoque\"" solto no menu
    expect(menu).not.toContain('{ title: "Solicitações ao estoque"');
  });

  it("a rota antiga cai na Gráfica; a pré-carga só existe ligada", () => {
    const app = ler("client/src/App.tsx");
    expect(app).toContain("{() => SOLICITACAO_AO_ESTOQUE_ATIVA");
    expect(app).toContain(': <Redirect to="/grafica" replace />}');
    const prefetch = ler("client/src/lib/prefetch-de-rota.ts");
    expect(prefetch).toContain("...(SOLICITACAO_AO_ESTOQUE_ATIVA\n");
  });
});
