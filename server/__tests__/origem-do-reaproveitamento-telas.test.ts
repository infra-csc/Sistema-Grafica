// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// DE ONDE VEM O REAPROVEITAMENTO — as telas MONTADAS (dono, 16/10).
//
//   · GRÁFICA (tabela em 1710 e cartão em 390): o selo "Em trânsito · 4 un."
//     (com a etapa no title) e "Buscar no estoque"; a peça comum não ganha nada;
//   · o REAPROVEITAR da Gráfica abre o diálogo com "De onde vem?": em trânsito
//     sem a etapa não confirma; com ela, a origem vai no corpo do mark-reuse;
//   · o diálogo "Origem do reaproveitamento" (o botão da ficha) grava pelo
//     PATCH e mostra a recusa do servidor dentro dele;
//   · a FICHA mostra o bloco com a etapa e o botão só para quem pode;
//   · a REVISÃO FINAL: "Reaproveitar tudo" com em trânsito pede a etapa e
//     entrega a origem a quem chama.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;
vi.setConfig({ testTimeout: 120_000 });

const U = vi.hoisted(() => ({ user: { id: "u-g", name: "Gil", email: "g@g", role: "grafica", mustChangePassword: false } as any }));
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: U.user, isLoading: false, logout: () => {}, hasPermission: (r: any) => U.user.role === "admin" || ([] as string[]).concat(r).includes(U.user.role) }),
  AuthProvider: ({ children }: any) => children,
}));
const avisos: { title?: string; description?: string; variant?: string }[] = [];
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
const EVENTO = {
  id: "e1", name: "Maratona X", priority: "media", status: "active", manuallyClosed: false,
  startDate: iso(20).slice(0, 10), truckDepartureDate: iso(17), lifecycle: "active", allDelivered: false, eventHasPassed: false,
  deadlineListaImagens: -25, deadlineEntregaLayouts: -20, deadlineAprovacaoLayout: -12, deadlineFinalizacao: -10,
  deadlineRevisaoLista: -8, deadlineProducaoGrafica: -1, sponsors: [], items: [],
};
const OBS = "Night Run Salvador, etapa 17/10";
const peca = (id: string, over: any = {}) => ({
  id, displayId: `#0${id.replace(/\D/g, "").padStart(3, "0")}`, eventId: "e1", event: EVENTO, type: "Placa", description: `Placa ${id}`,
  quantity: 10, quantityProduced: 0, conferredQty: 0, deliveredQty: 0, embaladaQty: 0, reuseQty: 0, isReuse: false,
  material: "Lona", finish: "Ilhós", calculatedM2: "20", visualWidth: "2", visualHeight: "1", fileWidth: "200", fileHeight: "100",
  status: "ready_for_production", skipApproval: false, sponsors: [], observations: "", approvalThumbUrl: "/objects/t.png",
  finalFileUrl: "/objects/f.pdf", kitRemessaId: null, parentItemId: null, createdAt: iso(-10), updatedAt: iso(-1), statusChangedAt: iso(-1),
  producaoInterna: false, instrucoesGrafica: null, origemReaproveitamento: null, obsReaproveitamento: null,
  ...over,
});

// ─── GRÁFICA ─────────────────────────────────────────────────────────────────
async function montarGrafica(largura: number, pecas: any[], rota?: (u: URL, init?: any) => any) {
  prepararJsdom(largura);
  U.user = { id: "u-g", name: "Gil", email: "g@g", role: "grafica", mustChangePassword: false };
  const escritas = fetchFalso((u, init) => rota?.(u, init) ?? (u.pathname === "/api/items/approved" ? pecas : []));
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

describe.each([1710, 390])("Gráfica em %ipx — o selo da origem", (largura) => {
  it("\"Em trânsito · 4 un.\" com a etapa no title, \"Buscar no estoque\" e nada na peça comum", async () => {
    await montarGrafica(largura, [
      peca("p1", { reuseQty: 4, origemReaproveitamento: "em_transito", obsReaproveitamento: OBS }),
      peca("p2", { reuseQty: 3, origemReaproveitamento: "estoque", obsReaproveitamento: "Galpão B" }),
      peca("p3"),
    ]);
    await esperar(() => !!tid("selo-origem-reaproveitamento-p1"), "o selo em trânsito aparece");
    const transito = tid("selo-origem-reaproveitamento-p1")!;
    expect(transito.textContent).toBe("Em trânsito · 4 un.");
    expect(transito.getAttribute("title")).toContain(`vindo de ${OBS}`);
    expect(transito.getAttribute("title")).toMatch(/Não passam por conferir, embalar nem entregar/);
    const estoque = tid("selo-origem-reaproveitamento-p2")!;
    expect(estoque.textContent).toBe("Buscar no estoque · 3 un.");
    expect(estoque.getAttribute("title")).toContain("Galpão B");
    expect(tid("selo-origem-reaproveitamento-p3")).toBeNull();
    expect(document.body.textContent).not.toMatch(/tape[cç]aria/i);
  });

  it("Reaproveitar abre \"De onde vem?\": em trânsito sem a etapa não confirma; com ela, vai no corpo", async () => {
    const pecas = [peca("p1")];
    const escritas = await montarGrafica(largura, pecas, (u, init) =>
      init?.method === "POST" ? { ...pecas[0], reuseQty: 4, origemReaproveitamento: "em_transito" } : u.pathname === "/api/items/approved" ? pecas : []);
    const sufixo = largura < 768 ? "card-" : "";
    await esperar(() => !!tid(`button-reuse-${sufixo}p1`), "o botão Reaproveitar aparece");
    await act(async () => { fireEvent.click(tid(`button-reuse-${sufixo}p1`)!); });
    await esperar(() => !!tid(`dialogo-reaproveitar-${sufixo}p1`), "o diálogo abre");
    await act(async () => { fireEvent.change(tid(`input-reuse-qty-${sufixo}p1`)!, { target: { value: "4" } }); });
    await act(async () => { fireEvent.click(tid(`reap-grafica-${sufixo}p1-origem-em_transito`)!); });
    const confirmar = () => tid(`button-reuse-confirm-${sufixo}p1`) as HTMLButtonElement;
    expect(confirmar().disabled, "sem a etapa, não confirma").toBe(true);
    expect(tid(`reap-grafica-${sufixo}p1-ajuda`)!.textContent).toContain("Escreva de qual etapa/evento a peça vem");
    await act(async () => { fireEvent.change(tid(`reap-grafica-${sufixo}p1-obs`)!, { target: { value: OBS } }); });
    expect(confirmar().disabled).toBe(false);
    expect(confirmar().textContent).toContain("Reaproveitar 4 un.");
    await act(async () => { fireEvent.click(confirmar()); });
    await esperar(() => escritas().length === 1, "envia");
    expect(escritas()[0]).toEqual({
      url: "/api/items/p1/mark-reuse", method: "POST",
      body: { qty: 4, origemReaproveitamento: "em_transito", obsReaproveitamento: OBS },
    });
  });
});

// ─── O DIÁLOGO DA FICHA ──────────────────────────────────────────────────────
describe.each([1366, 390])("\"Origem do reaproveitamento\" em %ipx", (largura) => {
  async function montar(p: any, rota: (u: URL, init?: any) => any) {
    prepararJsdom(largura);
    const escritas = fetchFalso(rota);
    const { queryClient } = await import("@/lib/queryClient");
    const { DialogoOrigemDoReaproveitamento } = await import("@/components/reaproveitamento/dialogo-origem");
    queryClient.clear();
    const aoFechar = vi.fn();
    await act(async () => {
      render(h(QueryClientProvider, { client: queryClient } as any, h(DialogoOrigemDoReaproveitamento, { peca: p, aoFechar, isMobile: largura < 768 })));
    });
    await tick(50);
    return { escritas, aoFechar };
  }

  it("parte da origem que a peça tem e grava pelo PATCH", async () => {
    const p = peca("p1", { status: "produced", reuseQty: 10, isReuse: true, origemReaproveitamento: "estoque", obsReaproveitamento: "Galpão" });
    const { escritas, aoFechar } = await montar(p, (_u, init) => (init?.method === "PATCH" ? { ...p, status: "delivered", origemReaproveitamento: "em_transito", obsReaproveitamento: OBS } : []));
    await esperar(() => !!tid("dialogo-origem-reaproveitamento"), "abre");
    expect(tid("origem-ficha-origem-estoque")!.getAttribute("aria-checked")).toBe("true");
    expect((tid("origem-ficha-obs") as HTMLInputElement).value).toBe("Galpão");
    await act(async () => { fireEvent.click(tid("origem-ficha-origem-em_transito")!); });
    await act(async () => { fireEvent.change(tid("origem-ficha-obs")!, { target: { value: OBS } }); });
    await act(async () => { fireEvent.click(tid("button-salvar-origem-reaproveitamento")!); });
    await esperar(() => escritas().length === 1, "grava");
    expect(escritas()[0]).toEqual({
      url: "/api/items/p1/origem-reaproveitamento", method: "PATCH",
      body: { origemReaproveitamento: "em_transito", obsReaproveitamento: OBS },
    });
    await esperar(() => aoFechar.mock.calls.length > 0, "fecha");
    expect(avisos.at(-1)?.description).toMatch(/não passa pela Gráfica — ficou como Entregue/);
  });

  it("a recusa do servidor aparece dentro do diálogo, que fica aberto", async () => {
    const p = peca("p1", { status: "produced", quantityProduced: 6, reuseQty: 4, conferredQty: 9, origemReaproveitamento: "estoque" });
    const erro = "Não dá para marcar como em trânsito: 9 un. já foram conferidas/embaladas no galpão.";
    const { aoFechar } = await montar(p, (_u, init) => (init?.method === "PATCH" ? [409, { error: erro }] : []));
    await esperar(() => !!tid("dialogo-origem-reaproveitamento"), "abre");
    await act(async () => { fireEvent.click(tid("origem-ficha-origem-em_transito")!); });
    await act(async () => { fireEvent.change(tid("origem-ficha-obs")!, { target: { value: OBS } }); });
    await act(async () => { fireEvent.click(tid("button-salvar-origem-reaproveitamento")!); });
    await esperar(() => !!tid("erro-origem-reaproveitamento"), "o erro aparece");
    expect(tid("erro-origem-reaproveitamento")!.textContent).toBe(erro);
    expect(aoFechar).not.toHaveBeenCalled();
  });
});

// ─── A FICHA ─────────────────────────────────────────────────────────────────
describe("a ficha da peça", () => {
  async function montarFicha(p: any, papel: string | null) {
    prepararJsdom(1366);
    fetchFalso(() => []);
    const { queryClient } = await import("@/lib/queryClient");
    const { ItemDetailsDialog } = await import("@/components/item-details-dialog");
    queryClient.clear();
    if (papel) queryClient.setQueryData(["/api/auth/me"], { id: "u1", name: "Ana", role: papel });
    await act(async () => {
      render(h(QueryClientProvider, { client: queryClient } as any, h(ItemDetailsDialog as any, { item: p, open: true, onOpenChange: () => {} })));
    });
    await tick(80);
  }

  it("mostra a origem com a etapa por extenso e o botão para quem pode", async () => {
    await montarFicha(peca("p1", { status: "produced", reuseQty: 4, quantityProduced: 6, origemReaproveitamento: "em_transito", obsReaproveitamento: OBS }), "solicitacao");
    await esperar(() => !!tid("ficha-origem-reaproveitamento-p1"), "o bloco aparece");
    const bloco = tid("ficha-origem-reaproveitamento-p1")!;
    expect(bloco.textContent).toContain("Reaproveitamento · 4 de 10 un.");
    expect(bloco.textContent).toContain("Em trânsito · 4 un.");
    expect(bloco.textContent).toContain(`Vem de ${OBS}`);
    await act(async () => { fireEvent.click(tid("button-origem-reaproveitamento-p1")!); });
    await esperar(() => !!tid("dialogo-origem-reaproveitamento"), "o botão abre o diálogo");
  });

  it("Arte vê a origem, mas sem o botão; peça sem reaproveitamento não tem bloco", async () => {
    await montarFicha(peca("p1", { status: "produced", reuseQty: 10, isReuse: true, origemReaproveitamento: "estoque" }), "arte");
    await esperar(() => !!tid("ficha-origem-reaproveitamento-p1"), "o bloco aparece");
    expect(tid("button-origem-reaproveitamento-p1")).toBeNull();
    cleanup();
    await montarFicha(peca("p2"), "solicitacao");
    expect(tid("ficha-origem-reaproveitamento-p2")).toBeNull();
  });
});

// ─── A REVISÃO FINAL ─────────────────────────────────────────────────────────
describe("Revisão Final — o diálogo de reaproveitamento", () => {
  it("em trânsito pede a etapa; \"Reaproveitar tudo\" entrega a origem a quem chama", async () => {
    prepararJsdom(1366);
    fetchFalso(() => []);
    const { queryClient } = await import("@/lib/queryClient");
    const { DialogoReaproveitamento } = await import("@/components/revisao/dialogo-reaproveitamento");
    const aoTudo = vi.fn();
    const p = peca("p1", { status: "awaiting_final_review" });
    await act(async () => {
      render(h(QueryClientProvider, { client: queryClient } as any, h(DialogoReaproveitamento, {
        itemId: "p1", pendingItems: [p] as any, dedo: false, isMobile: false, admin: false, partialReuseQty: 4, setPartialReuseQty: () => {},
        ocupado: false, salvandoParte: false, aoFechar: () => {}, aoReaproveitarTudo: aoTudo, aoReaproveitarParte: () => {},
      })));
    });
    await esperar(() => !!tid("revisao-reaproveitar-origem-em_transito"), "a escolha aparece");
    await act(async () => { fireEvent.click(tid("revisao-reaproveitar-origem-em_transito")!); });
    const tudo = Array.from(document.querySelectorAll("button")).find((b) => /Reaproveitar tudo/.test(b.textContent ?? "")) as HTMLButtonElement;
    expect(tudo.disabled, "sem a etapa").toBe(true);
    expect(tudo.textContent).toContain("em trânsito, não passa pela Gráfica");
    await act(async () => { fireEvent.change(tid("revisao-reaproveitar-obs")!, { target: { value: OBS } }); });
    expect(tudo.disabled).toBe(false);
    await act(async () => { fireEvent.click(tudo); });
    expect(aoTudo).toHaveBeenCalledTimes(1);
    expect(aoTudo.mock.calls[0][1]).toEqual({ origem: "em_transito", obs: OBS });
  });
});
