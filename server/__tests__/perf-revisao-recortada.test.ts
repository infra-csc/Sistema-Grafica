// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// REVISÃO FINAL COM A LISTA RECORTADA NO SERVIDOR (perf, 17/09 — 2ª passada).
//
// A tela lia ["/api/items"] (5.128 peças, 15 MB em produção) para mostrar as
// ~8 em "Aguardando Revisão Final". Agora pede ["/api/items",
// "?status=awaiting_final_review"]. Este arquivo monta a página DE VERDADE com
// um fetch falso que conta URL e bytes e prende:
//   · a fila mostra EXATAMENTE as mesmas peças (as em revisão, nenhuma a mais);
//   · o acervo inteiro nunca é baixado;
//   · o link `?item=` de uma peça que já saiu da fila continua avisando com o
//     CÓDIGO da peça (antes vinha do acervo; agora de uma busca só por ela).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;
const H = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: H.toast, dismiss: () => {}, toasts: [] }),
  toast: H.toast,
}));

const FUTURO = "2099-09-10";
const SAIDA = "2099-09-05T08:00:00.000Z";
const REVISAO = "awaiting_final_review";
const STATUS = ["delivered", "inProduction", "awaiting_submission", "awaiting_sponsor_approval", "produced", "ready_for_production"];

const EVENTOS = Array.from({ length: 40 }, (_, i) => ({
  id: `e${i}`, name: `Evento ${String(i).padStart(2, "0")}`, priority: "media", status: "active", manuallyClosed: false,
  startDate: FUTURO, truckDepartureDate: SAIDA, lifecycle: "active", allDelivered: false, eventHasPassed: false,
  deadlineListaImagens: -25, deadlineEntregaLayouts: -20, deadlineAprovacaoLayout: -12,
  deadlineFinalizacao: -10, deadlineRevisaoLista: -8, deadlineProducaoGrafica: -1,
  sponsors: [], items: [],
}));
const NA_REVISAO = new Set([7, 300, 1234, 2500, 4001, 4999]);
const ACERVO = Array.from({ length: 5000 }, (_, i) => {
  const ev = EVENTOS[i % EVENTOS.length];
  return {
    id: `i${i}`, displayId: `#${String(i).padStart(4, "0")}`, eventId: ev.id, event: ev,
    type: "Backdrop", description: `Peça ${i} com uma descrição de tamanho realista para o acervo`,
    quantity: 1 + (i % 4), visualWidth: "3", visualHeight: "2", material: "Lona", finish: "Ilhós",
    status: NA_REVISAO.has(i) ? REVISAO : STATUS[i % STATUS.length], skipApproval: false, isReuse: false,
    observations: "", sponsors: [{ id: "s1", name: "Patrocinador 1", color: "#3b82f6", approvalStatus: "approved" }],
    finalFileUrl: "https://ex.com/final.pdf", approvalThumbUrl: null, kitRemessaId: null,
    createdAt: new Date(Date.UTC(2026, 7, 1) - i * 60_000).toISOString(), updatedAt: "2026-08-01T12:00:00.000Z",
  };
});

const pedidas: { url: string; bytes: number }[] = [];
const json = (b: any) => {
  const corpo = JSON.stringify(b);
  return { res: new Response(corpo, { status: 200, headers: { "content-type": "application/json" } }), bytes: corpo.length };
};

beforeAll(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
  (Element.prototype as any).scrollIntoView = () => {};

  vi.stubGlobal("fetch", async (url: any) => {
    const u = new URL(String(url), "http://local");
    let r: { res: Response; bytes: number };
    if (u.pathname === "/api/auth/me") r = json({ id: "u1", name: "Admin", email: "a@a", role: "admin", mustChangePassword: false });
    else if (u.pathname === "/api/items") {
      // O servidor de verdade: recorte por status/ids; `since` sem mudança.
      const since = u.searchParams.get("since");
      const sts = u.searchParams.get("status")?.split(",");
      const ids = u.searchParams.get("ids")?.split(",");
      const lista = ACERVO.filter((p) => (!sts || sts.includes(p.status)) && (!ids || ids.includes(p.id)));
      r = since ? json({ delta: true, agora: new Date().toISOString(), itens: [], removidas: [], eventos: [], patrocinadores: [] }) : json(lista);
    } else if (u.pathname === "/api/events") r = json(EVENTOS);
    else r = json([]);
    pedidas.push({ url: String(url), bytes: r.bytes });
    return r.res;
  });
});

beforeEach(() => {
  cleanup();
  pedidas.length = 0;
  H.toast.mockClear();
});

async function tick(ms = 50) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }

async function montar() {
  const { queryClient, resetItensDelta } = await import("@/lib/queryClient");
  const { TooltipProvider } = await import("@/components/ui/tooltip");
  const { AuthProvider } = await import("@/contexts/auth-context");
  const Solicitacao = (await import("@/pages/solicitacao")).default;
  queryClient.clear();
  resetItensDelta();
  render(h(QueryClientProvider, { client: queryClient } as any,
    h(TooltipProvider, null, h(AuthProvider, null, h(Solicitacao, null)))));
}

async function esperar(cond: () => boolean, max = 400) {
  for (let i = 0; i < max && !cond(); i++) await tick(25);
  expect(cond()).toBe(true);
}

const idsNaTela = () => new Set(Array.from(document.querySelectorAll('[data-testid^="button-review-"]'))
  .map((el) => el.getAttribute("data-testid")!.replace("button-review-", "")));

describe("Revisão Final com a lista recortada", () => {
  it("mostra exatamente as peças em revisão, sem baixar o acervo (mede URL e tamanho)", async () => {
    window.history.replaceState(null, "", "/solicitacao");
    await montar();
    const esperadas = new Set(ACERVO.filter((p) => p.status === REVISAO).map((p) => p.id));
    await esperar(() => idsNaTela().size === esperadas.size);
    await tick(300);
    expect(idsNaTela()).toEqual(esperadas);

    const deItens = pedidas.filter((p) => new URL(p.url, "http://local").pathname === "/api/items");
    expect(deItens.map((p) => p.url)).toEqual(["/api/items?status=awaiting_final_review&formato=compacto"]);
    const acervoInteiro = JSON.stringify(ACERVO).length;
    const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
    process.stderr.write(`[perf] Revisão Final: /api/items antes ${kb(acervoInteiro)} (${ACERVO.length} peças) → depois ${kb(deItens[0].bytes)} (${esperadas.size} peças) · requisições ${JSON.stringify(pedidas.map((p) => p.url))}\n`);
    expect(deItens[0].bytes).toBeLessThan(acervoInteiro * 0.01);
  }, 60_000);

  it("link ?item= de peça que já saiu da fila: o aviso continua dizendo o código dela", async () => {
    const saiu = ACERVO.find((p) => p.status === "delivered")!;
    window.history.replaceState(null, "", `/solicitacao?item=${saiu.id}`);
    await montar();
    await esperar(() => H.toast.mock.calls.length > 0);
    expect(H.toast.mock.calls[0][0].title).toBe(`A peça ${saiu.displayId} não está nesta fila agora`);
    // Buscou só a peça do link — nunca o acervo inteiro.
    const deItens = pedidas.filter((p) => new URL(p.url, "http://local").pathname === "/api/items").map((p) => p.url);
    expect(deItens).toContain(`/api/items?ids=${saiu.id}&formato=compacto`);
    expect(deItens.every((u) => u.includes("status=") || u.includes("ids="))).toBe(true);
  }, 60_000);

  it("link ?item= de peça NA fila abre a ficha sem busca extra", async () => {
    const naFila = ACERVO.find((p) => p.status === REVISAO)!;
    window.history.replaceState(null, "", `/solicitacao?item=${naFila.id}`);
    await montar();
    await esperar(() => (document.body.textContent || "").includes(naFila.displayId) && !window.location.search.includes("item="));
    await tick(200);
    expect(H.toast).not.toHaveBeenCalled();
    expect(pedidas.some((p) => p.url.includes("ids="))).toBe(false);
  }, 60_000);
});
