// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// SOLICITAÇÃO AO ESTOQUE — as telas MONTADAS (dono, 21/09).
//
//   1. REVISÃO FINAL: o modal Reaproveitamento PEDE ao estoque (não aplica mais);
//      a resposta aparece NA PEÇA e vem SUGERIDA — "Confirmar e liberar · 3
//      reaproveitadas + 3 a produzir" / "· 6 reaproveitadas — pula produção" /
//      "· 6 a produzir" — um clique confirma e libera; o "usar menos" fica atrás
//      de um link; pedido em aberto libera com aviso; a lista destaca, conta e
//      filtra ("Aguardando estoque", "Estoque respondeu"); o lote leva a
//      sugestão e o resumo diz quantas.
//   2. A CAIXA DA GRÁFICA: "Pedem 5 de 6 un.", sugestões do acervo, Atender (5),
//      Atender parcial, Não consigo atender, "sem vínculo com o acervo", abas na
//      URL, vazio, erro, sem sugestão; a Solicitação só acompanha.
//   3. CELULAR (390px): uma coluna, alvos de 44px, campos a 16px, respostas
//      coladas no pé com safe-area.
//   4. Nenhum LOCAL de galpão em lugar nenhum (decisão do dono).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "fs";
import path from "path";

const h = React.createElement;
vi.setConfig({ testTimeout: 120_000 });

// A feature está SEGURADA (dono, 21/09: SOLICITACAO_AO_ESTOQUE_ATIVA = false).
// Estes testes rodam com a chave LIGADA para não apodrecerem até religar; o
// estado desligado tem arquivo próprio (solicitacao-ao-estoque-desligada*).
vi.mock("@shared/consultas-de-estoque", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/consultas-de-estoque")>()),
  SOLICITACAO_AO_ESTOQUE_ATIVA: true,
}));

const U = vi.hoisted(() => ({ user: { id: "u-graf", name: "Gil", email: "g@g", role: "grafica", mustChangePassword: false } as any }));
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: U.user, isLoading: false, logout: () => {} }),
  AuthProvider: ({ children }: any) => children,
}));
const avisos: { title?: string; description?: string; variant?: string }[] = [];
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (t: any) => { avisos.push(t); }, dismiss: () => {}, toasts: [] }), toast: (t: any) => { avisos.push(t); } }));

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const tid = (id: string) => $(`[data-testid="${id}"]`);
const tick = (ms = 0) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
const px = (v: string | undefined) => parseFloat(String(v ?? "").replace("px", "")) || 0;
async function esperar(cond: () => boolean, oQue: string, max = 400) {
  for (let i = 0; i < max && !cond(); i++) await tick(25);
  expect(cond(), oQue).toBe(true);
}
const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

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
  (Element.prototype as any).hasPointerCapture = () => false;
  (Element.prototype as any).releasePointerCapture = () => {};
}

type Rota = (u: URL, init?: any) => any | undefined;
function fetchFalso(rota: Rota) {
  const mock = vi.fn(async (url: any, init?: any) => {
    const u = new URL(String(url), "http://local");
    const corpo = rota(u, init);
    if (corpo instanceof Response) return corpo;
    return new Response(JSON.stringify(corpo === undefined ? [] : corpo), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", mock);
  const escritas = () => mock.mock.calls.filter((c: any) => c[1]?.method && c[1].method !== "GET")
    .map((c: any) => ({ url: String(c[0]), method: c[1].method as string, body: c[1].body ? JSON.parse(String(c[1].body)) : null }));
  return { mock, escritas };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); avisos.length = 0; });

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
const solicitacaoDaPeca = (i: number, over: any = {}) => ({
  id: `c${i}`, itemId: `i${i}`, status: "aberta", quantidadePedida: 5, quantidadeAtendida: null, observacao: "usamos em Manaus",
  pedidoPor: "Sofia", pedidoPorId: "u-sol", pedidoEm: "2026-09-21T12:00:00.000Z", observacaoResposta: null, fotoUrl: null,
  respondidoPor: null, respondidoEm: null, aplicadoEm: null, ...over,
});
const atendeu = (i: number, atendida: number, pedida = 5, over: any = {}) => solicitacaoDaPeca(i, {
  status: atendida === 0 ? "nao_atendida" : atendida >= pedida ? "atendida" : "atendida_parcial", quantidadePedida: pedida,
  quantidadeAtendida: atendida, respondidoPor: "Gil", respondidoEm: "2026-09-21T14:00:00.000Z", ...over,
});

async function montarRevisao(largura: number, opts: { pecas?: any[]; solicitacoes?: any[]; url?: string; papel?: "solicitacao" | "admin" } = {}) {
  prepararJsdom(largura);
  const papel = opts.papel ?? "solicitacao";
  U.user = { id: papel === "admin" ? "u-adm" : "u-sol", name: papel === "admin" ? "Ada" : "Sofia", email: "s@s", role: papel, mustChangePassword: false };
  const pecas = opts.pecas ?? [pecaDaRevisao(1)];
  const solicitacoes = opts.solicitacoes ?? [];
  const f = fetchFalso((u, init) => {
    if (init?.method && init.method !== "GET") return { ok: true };
    if (u.pathname === "/api/items" && !u.searchParams.get("since")) return pecas;
    if (u.pathname === "/api/items") return { delta: true, agora: new Date().toISOString(), itens: [], removidas: [], eventos: [], patrocinadores: [] };
    if (u.pathname === "/api/events") return [EVENTO];
    if (u.pathname === "/api/consultas-de-estoque/da-revisao") return solicitacoes;
    const m = u.pathname.match(/^\/api\/items\/([^/]+)\/consulta-de-estoque$/);
    if (m) return { consulta: solicitacoes.find((c) => c.itemId === m[1]) ?? null };
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
  return f;
}
const fichaAberta = () => esperar(() => !!tid("button-release-modal") && !tid("estoque-na-ficha-carregando"), "a ficha abre com o estoque lido");

describe("Revisão Final — o modal Reaproveitamento PEDE ao estoque", () => {
  it("“Pedir 5 un. ao estoque”: cria a solicitação com a quantidade e o recado — não aplica nem libera nada; sem atalho para quem não é admin", async () => {
    const f = await montarRevisao(1280);
    await fichaAberta();
    expect(tid("button-release-modal")!.textContent).toContain("Liberar para produção");
    await act(async () => { fireEvent.click(tid("button-reuse-modal")!); });
    await esperar(() => !!tid("pedir-ao-estoque"), "o modal abre pedindo ao estoque");
    expect(tid("pedir-ao-estoque")!.textContent).toContain("A Gráfica confere no estoque e responde; o que ela atender vem como reaproveitamento.");
    expect(tid("button-pedir-tudo-ao-estoque")!.textContent).toContain("Pedir tudo (6 un.) ao estoque");
    expect(tid("ja-conferi-aplicar-agora")).toBeNull();
    const parte = tid("input-pedir-parte-ao-estoque") as HTMLInputElement;
    expect(parte.value).toBe("5");
    expect(px(parte.style.fontSize)).toBeGreaterThanOrEqual(16);
    expect(tid("button-pedir-parte-ao-estoque")!.textContent).toBe("Pedir 5 un. ao estoque");
    await act(async () => { fireEvent.change(tid("input-observacao-do-pedido")!, { target: { value: "  igual à de Manaus " } }); });
    await act(async () => { fireEvent.click(tid("button-pedir-parte-ao-estoque")!); });
    await esperar(() => f.escritas().length === 1, "o pedido é enviado");
    expect(f.escritas()[0]).toEqual({ url: "/api/items/i1/consulta-de-estoque", method: "POST", body: { quantidade: 5, observacao: "igual à de Manaus" } });
    expect(avisos.some((a) => a.title === "Pedido ao estoque: 5 un." && /liberada sem esperar/.test(a.description ?? ""))).toBe(true);
  });

  it("admin tem o atalho “Já conferi — aplicar agora”, com o caminho antigo inteiro", async () => {
    await montarRevisao(1280, { papel: "admin" });
    await fichaAberta();
    await act(async () => { fireEvent.click(tid("button-reuse-modal")!); });
    await esperar(() => !!tid("ja-conferi-aplicar-agora"), "o atalho aparece para o admin");
    expect(tid("ja-conferi-aplicar-agora")!.textContent).toContain("Já conferi no estoque — aplicar agora");
    expect(tid("ja-conferi-aplicar-agora")!.textContent).toContain("Reaproveitar tudo (6 un.) — pula produção");
    expect(tid("button-pedir-tudo-ao-estoque")).not.toBeNull();
  });
});

describe("Revisão Final — a resposta aparece NA PEÇA e vem sugerida", () => {
  it("pedido em aberto: selo “aguardando”, liberar CONTINUA permitido e a confirmação pergunta “Liberar sem esperar a resposta do estoque?”", async () => {
    await montarRevisao(1280, { solicitacoes: [solicitacaoDaPeca(1)] });
    await fichaAberta();
    await esperar(() => !!tid("estoque-na-ficha-aguardando"), "a faixa de espera aparece");
    expect(tid("estoque-na-ficha-aguardando")!.textContent).toContain("Pedido ao estoque: 5 un. · aguardando");
    expect(tid("estoque-na-ficha-aguardando")!.textContent).toContain("usamos em Manaus");
    expect(tid("button-cancelar-pedido-ao-estoque")).not.toBeNull();
    const liberar = tid("button-release-modal") as HTMLButtonElement;
    expect(liberar.disabled).toBe(false);
    expect(liberar.textContent).toContain("Liberar para produção");
    await act(async () => { fireEvent.click(liberar); });
    await esperar(() => !!tid("confirmacao-pedido-em-aberto"), "a confirmação fala do pedido");
    expect(tid("confirmacao-pedido-em-aberto")!.textContent).toContain("Liberar sem esperar a resposta do estoque?");
  });

  it("ATENDEU 3 de 5: bloco com pedida × atendida, quem, quando, observação e foto (SEM local); um clique confirma e libera, sem digitar nada", async () => {
    const f = await montarRevisao(1280, { solicitacoes: [atendeu(1, 3, 5, { observacaoResposta: "2 com ilhós rasgado", fotoUrl: "/objects/uploads/f.jpg" })] });
    await fichaAberta();
    await esperar(() => !!tid("estoque-na-ficha-atendeu"), "o bloco da resposta aparece");
    const bloco = tid("estoque-na-ficha-atendeu")!;
    for (const t of ["Estoque respondeu: atende 3 de 5", "Pedidas", "5 un.", "Atendidas", "3 un.", "Gil", "2 com ilhós rasgado", "É você quem segue com a peça"]) expect(bloco.textContent, t).toContain(t);
    expect(bloco.textContent).not.toMatch(/\blocal\b|setor|prateleira/i);
    expect(tid("link-foto-da-resposta")!.getAttribute("href")).toBe("/objects/uploads/f.jpg");
    expect(bloco.style.backgroundColor).toBe("rgb(240, 253, 244)");
    expect(tid("button-release-modal")!.textContent).toContain("Confirmar e liberar · 3 reaproveitadas + 3 a produzir");
    expect(tid("usar-menos")).toBeNull(); // o ajuste fica escondido

    await act(async () => { fireEvent.click(tid("button-release-modal")!); });
    await esperar(() => !!tid("confirmacao-com-estoque"), "a confirmação diz o que vem do estoque");
    expect(tid("confirmacao-com-estoque")!.textContent).toContain("3 un. vêm do estoque");
    await act(async () => { fireEvent.click(tid("button-release-confirm")!); });
    await esperar(() => f.escritas().length === 1, "libera");
    // corpo vazio: quem aplica o que o estoque atendeu é o servidor, na liberação
    expect(f.escritas()[0]).toEqual({ url: "/api/items/i1/creator-review", method: "PATCH", body: {} });
    expect(avisos.some((a) => /3 un\. do estoque e 3 a produzir/.test(a.description ?? ""))).toBe(true);
  });

  it("ATENDEU TUDO (6 de 6): “· 6 reaproveitadas — pula produção”, e libera mesmo sem arquivo final", async () => {
    await montarRevisao(1280, { pecas: [pecaDaRevisao(1, { finalFileUrl: null })], solicitacoes: [atendeu(1, 6, 6)] });
    await fichaAberta();
    await esperar(() => /pula produção/.test(tid("button-release-modal")!.textContent ?? ""), "o botão vem com a conta feita");
    expect(tid("button-release-modal")!.textContent).toContain("Confirmar e liberar · 6 reaproveitadas — pula produção");
    expect((tid("button-release-modal") as HTMLButtonElement).disabled).toBe(false);
  });

  it("NÃO ATENDE: “· 6 a produzir”, bloco cinza “não tem”, sem link de usar menos", async () => {
    await montarRevisao(1280, { solicitacoes: [atendeu(1, 0)] });
    await fichaAberta();
    await esperar(() => !!tid("estoque-na-ficha-nao-tem"), "o bloco da resposta aparece");
    expect(tid("estoque-na-ficha-nao-tem")!.textContent).toContain("Estoque respondeu: não tem as 5 un. pedidas — segue para produção");
    expect(tid("button-release-modal")!.textContent).toContain("Confirmar e liberar · 6 a produzir");
    expect(tid("link-usar-menos")).toBeNull();
  });

  it("“Usar menos do que o estoque atendeu”: link discreto → 2 de 3; o botão refaz a conta e a liberação manda { reuseQty: 2, peloEstoque }", async () => {
    const f = await montarRevisao(1280, { solicitacoes: [atendeu(1, 3)] });
    await fichaAberta();
    await esperar(() => !!tid("link-usar-menos"), "o link aparece");
    await act(async () => { fireEvent.click(tid("link-usar-menos")!); });
    const campo = tid("input-usar-menos") as HTMLInputElement;
    expect(campo.value).toBe("2");
    expect(campo.max).toBe("3");
    expect(tid("button-release-modal")!.textContent).toContain("Confirmar e liberar · 2 reaproveitadas + 4 a produzir");
    await act(async () => { fireEvent.change(campo, { target: { value: "9" } }); }); // nunca mais que o atendido
    expect((tid("input-usar-menos") as HTMLInputElement).value).toBe("3");
    await act(async () => { fireEvent.change(tid("input-usar-menos")!, { target: { value: "2" } }); });
    await act(async () => { fireEvent.click(tid("button-release-modal")!); });
    await esperar(() => !!tid("button-release-confirm"), "a confirmação abre");
    await act(async () => { fireEvent.click(tid("button-release-confirm")!); });
    await esperar(() => f.escritas().length === 1, "libera");
    expect(f.escritas()[0].body).toEqual({ reuseQty: 2, peloEstoque: true });
  });
});

describe("Revisão Final — a lista não deixa a resposta passar batido", () => {
  const pecas = [pecaDaRevisao(1), pecaDaRevisao(2), pecaDaRevisao(3), pecaDaRevisao(4)];
  const solicitacoes = [atendeu(3, 3), solicitacaoDaPeca(2), atendeu(4, 5)];

  it("selo na linha, a peça respondida SOBE, e os contadores “Estoque respondeu (2)” / “Aguardando estoque (1)” filtram — com o filtro na URL", async () => {
    await montarRevisao(1280, { pecas, solicitacoes, url: "/solicitacao" });
    await esperar(() => !!tid("selo-estoque-i3"), "os selos chegam");
    expect(tid("selo-estoque-i3")!.textContent).toContain("Estoque respondeu");
    expect(tid("selo-estoque-i2")!.textContent).toContain("Aguardando estoque");
    expect(tid("selo-estoque-i1")).toBeNull();
    const ordem = () => Array.from(document.querySelectorAll('[data-testid^="button-review-"]')).map((el) => el.getAttribute("data-testid")!.replace("button-review-", ""));
    expect(ordem().slice(0, 2).sort()).toEqual(["i3", "i4"]);

    expect(tid("chip-estoque-respondeu")!.textContent).toContain("Estoque respondeu");
    expect(tid("chip-estoque-respondeu")!.textContent).toContain("2");
    expect(tid("chip-aguardando-estoque")!.textContent).toContain("1");
    await act(async () => { fireEvent.click(tid("chip-estoque-respondeu")!); });
    expect(ordem().sort()).toEqual(["i3", "i4"]);
    expect(window.location.search).toContain("estoque=respondeu");
    await act(async () => { fireEvent.click(tid("chip-aguardando-estoque")!); });
    expect(ordem()).toEqual(["i2"]);
    expect(window.location.search).toContain("estoque=aguardando");
  });

  it("?estoque=respondeu na URL já abre filtrado", async () => {
    await montarRevisao(1280, { pecas, solicitacoes, url: "/solicitacao?estoque=respondeu" });
    await esperar(() => !!tid("selo-estoque-i3"), "os selos chegam");
    expect(tid("chip-estoque-respondeu")!.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelectorAll('[data-testid^="button-review-"]').length).toBe(2);
  });

  it("liberação em LOTE: as peças com resposta entram com a sugestão e o resumo diz “4 peças · 2 com reaproveitamento do estoque (8 un.)”", async () => {
    const f = await montarRevisao(1280, { pecas, solicitacoes, url: "/solicitacao" });
    await esperar(() => !!tid("selo-estoque-i3"), "os selos chegam");
    const marcarTodas = $('[data-testid="checkbox-select-all"]') ?? $('input[type="checkbox"]');
    expect(marcarTodas, "há um selecionar tudo").not.toBeNull();
    await act(async () => { fireEvent.click(marcarTodas!); });
    await esperar(() => !!tid("button-bulk-release-hero"), "a barra do lote aparece");
    await act(async () => { fireEvent.click(tid("button-bulk-release-hero")!); });
    await esperar(() => !!tid("aviso-bulk-release-estoque"), "o resumo do lote aparece");
    expect(tid("aviso-bulk-release-estoque")!.textContent).toContain("4 peças · 2 com reaproveitamento do estoque (8 un.)");
    await act(async () => { fireEvent.click(tid("button-bulk-release-confirm")!); });
    await esperar(() => f.escritas().length === 4, "libera as quatro");
    // corpo vazio em todas: o servidor aplica o que o estoque atendeu em cada uma
    for (const e of f.escritas()) expect(e).toMatchObject({ method: "PATCH", body: {} });
  });

  it("celular 390px: os alvos do pedido ao estoque têm 44px ou mais", async () => {
    await montarRevisao(390);
    await fichaAberta();
    await act(async () => { fireEvent.click(tid("button-reuse-modal")!); });
    await esperar(() => !!tid("pedir-ao-estoque"), "o modal abre");
    for (const id of ["button-pedir-tudo-ao-estoque", "button-pedir-parte-ao-estoque", "input-pedir-parte-ao-estoque"]) {
      expect(px(tid(id)!.style.minHeight), id).toBeGreaterThanOrEqual(44);
    }
  });
});

// ─── 2 · A CAIXA DA GRÁFICA ──────────────────────────────────────────────────
const daCaixa = (i: number, over: any = {}) => ({
  id: `c${i}`, itemId: `i${i}`, eventId: "e1", status: "aberta", pedidoPor: "Sofia", pedidoPorId: "u-sol", pedidoEm: "2026-09-21T12:00:00.000Z",
  observacao: i === 1 ? "usamos em Manaus" : null, quantidadePedida: 5, quantidadeAtendida: null, ativosIds: [], observacaoResposta: null, fotoUrl: null,
  respondidoPor: null, respondidoEm: null, aplicadoEm: null,
  peca: { id: `i${i}`, displayId: `#012${i}`, tipo: "Lona", descricao: "Lona de pórtico", largura: "2.00", altura: "1.00", material: "Lona 440g", quantidade: 6, status: "awaiting_final_review", reuseQty: 0, produzidas: 0, thumb: null, patrocinadores: ["Livelo"] },
  evento: { id: "e1", nome: "Maratona X", saidaDoCaminhao: "2099-09-05T08:00:00.000Z" },
  ...over,
});
const sugestao = (chave: string, quantidade: number, over: any = {}) => ({
  chave, relacao: "identica", condicao: "PERFEITO", thumb: null, quantidade,
  origem: { displayId: "#0042", tipo: "Lona", descricao: null, largura: "2.00", altura: "1.00", eventName: "Primavera Manaus", eventInicio: "2026-08-20T00:00:00.000Z" },
  ativos: Array.from({ length: quantidade }, (_, n) => ({ id: `${chave}-a${n}`, displayId: `#EST-${n}`, quantidade: 1 })),
  ...over,
});

async function montarCaixa(largura: number, opts: { url?: string; papel?: "grafica" | "solicitacao" | "admin"; abertas?: any[] | "erro"; respondidas?: any[]; sugestoes?: (busca: string) => any } = {}) {
  prepararJsdom(largura);
  const papel = opts.papel ?? "grafica";
  U.user = { id: papel === "solicitacao" ? "u-sol" : "u-graf", name: papel === "solicitacao" ? "Sofia" : "Gil", email: "x@x", role: papel, mustChangePassword: false };
  const f = fetchFalso((u, init) => {
    if (init?.method && init.method !== "GET") return { ok: true };
    if (u.pathname === "/api/consultas-de-estoque") {
      if (u.searchParams.get("status") === "aberta") {
        if (opts.abertas === "erro") return new Response(JSON.stringify({ error: "caiu" }), { status: 500, headers: { "content-type": "application/json" } });
        return opts.abertas ?? [];
      }
      return opts.respondidas ?? [];
    }
    if (u.pathname.endsWith("/sugestoes")) return (opts.sugestoes ?? (() => ({ semMedida: false, sugestoes: [] })))(u.searchParams.get("busca") ?? "");
    return [];
  });
  window.history.replaceState(null, "", opts.url ?? "/grafica/solicitacoes-ao-estoque");
  const { queryClient } = await import("@/lib/queryClient");
  const Pagina = (await import("@/pages/solicitacoes-ao-estoque")).default;
  queryClient.clear();
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Pagina as any, null))); });
  await esperar(() => !tid("consultas-carregando"), "a lista carrega");
  return f;
}

describe("a caixa da Gráfica — Solicitações ao estoque", () => {
  it("vazio e erro têm frase e saída", async () => {
    await montarCaixa(1280, { abertas: [] });
    expect(tid("title-solicitacoes-ao-estoque")!.textContent).toContain("Solicitações ao estoque");
    expect(tid("consultas-vazio")!.textContent).toContain("Nenhuma solicitação aberta");
    cleanup();
    await montarCaixa(1280, { abertas: "erro" });
    await esperar(() => !!tid("consultas-erro"), "o erro aparece");
    expect(tid("consultas-erro")!.textContent).toContain("Tentar de novo");
  });

  it("“Pedem 5 de 6 un.” e a peça com tudo o que a Gráfica precisa — sem nenhuma menção a local", async () => {
    await montarCaixa(1280, { abertas: [daCaixa(1)], sugestoes: () => ({ semMedida: false, sugestoes: [sugestao("L1", 6)] }) });
    const cartao = tid("consulta-c1")!;
    expect(tid("pedem-c1")!.textContent).toBe("Pedem 5 de 6 un.");
    for (const t of ["#0121", "Lona", "2 × 1 m", "Lona 440g", "Livelo", "Maratona X", "caminhão sai", "Pedida por Sofia", "usamos em Manaus"]) expect(cartao.textContent, t).toContain(t);
    await esperar(() => !!tid("lista-de-sugestoes"), "as sugestões chegam");
    for (const t of ["O sistema sugere", "Já usada em Primavera Manaus", "Perfeito", "6 un. livres"]) expect(cartao.textContent, t).toContain(t);
    expect(cartao.textContent).not.toMatch(/\blocal\b|setor|prateleira/i);
    expect(tid("button-atender-c1")!.textContent).toContain("Atender (5)");
    expect(tid("button-atender-parcial-c1")).not.toBeNull();
    expect(tid("button-nao-consigo-c1")!.textContent).toContain("Não consigo atender");
  });

  it("ATENDER (5): escolhe 3 de um lote + 2 de outro — o teto é o PEDIDO — e manda os ativos certos", async () => {
    const f = await montarCaixa(1280, { abertas: [daCaixa(1)], sugestoes: () => ({ semMedida: false, sugestoes: [sugestao("L1", 6), sugestao("L2", 5, { condicao: "AVARIA_LEVE", relacao: "generica" })] }) });
    await esperar(() => !!tid("lista-de-sugestoes"), "as sugestões chegam");
    await act(async () => { fireEvent.change(tid("qtd-sugestao-L1")!, { target: { value: "3" } }); });
    await act(async () => { fireEvent.change(tid("qtd-sugestao-L2")!, { target: { value: "9" } }); }); // só cabem 2 (5 pedidas − 3)
    expect((tid("qtd-sugestao-L2") as HTMLInputElement).value).toBe("2");
    expect(tid("aviso-vinculo-c1")!.textContent).toContain("5 un. do acervo ficam reservadas");
    await act(async () => { fireEvent.click(tid("button-atender-c1")!); });
    await esperar(() => f.escritas().length === 1, "responde");
    expect(f.escritas()[0]).toEqual({
      url: "/api/consultas-de-estoque/c1/responder", method: "POST",
      body: { resposta: "atender", quantidade: 5, ativosIds: ["L1-a0", "L1-a1", "L1-a2", "L2-a0", "L2-a1"] },
    });
    expect(avisos.some((a) => a.title === "Respondido: atende 5 de 5 un." && /Revisão Final/.test(a.description ?? ""))).toBe(true);
  });

  it("ATENDER PARCIAL: 3 escolhidas viram “Atender parcial (3 de 5)”; o campo aceita de 1 a 4 e nunca menos que o reservado", async () => {
    const f = await montarCaixa(1280, { abertas: [daCaixa(1)], sugestoes: () => ({ semMedida: false, sugestoes: [sugestao("L1", 6)] }) });
    await esperar(() => !!tid("lista-de-sugestoes"), "as sugestões chegam");
    const parcial = () => tid("button-atender-parcial-c1") as HTMLButtonElement;
    expect(parcial().disabled).toBe(true);
    await act(async () => { fireEvent.change(tid("qtd-sugestao-L1")!, { target: { value: "3" } }); });
    expect(parcial().textContent).toContain("Atender parcial (3 de 5)");
    await act(async () => { fireEvent.change(tid("input-parcial-c1")!, { target: { value: "2" } }); }); // menos que as 3 reservadas
    expect(parcial().disabled).toBe(true);
    await act(async () => { fireEvent.change(tid("input-parcial-c1")!, { target: { value: "5" } }); }); // 5 é "atender", não parcial
    expect(parcial().disabled).toBe(true);
    await act(async () => { fireEvent.change(tid("input-parcial-c1")!, { target: { value: "4" } }); });
    expect(parcial().textContent).toContain("Atender parcial (4 de 5)");
    await act(async () => { fireEvent.change(tid("input-observacao-resposta-c1")!, { target: { value: "1 fora do cadastro" } }); });
    await act(async () => { fireEvent.click(parcial()); });
    await esperar(() => f.escritas().length === 1, "responde");
    expect(f.escritas()[0].body).toEqual({ resposta: "atender", quantidade: 4, ativosIds: ["L1-a0", "L1-a1", "L1-a2"], observacao: "1 fora do cadastro" });
  });

  it("sem sugestão: manda procurar no galpão; dá para atender SEM escolher ativo (“sem vínculo com o acervo”) ou dizer que não consegue, com o motivo", async () => {
    const f = await montarCaixa(1280, { abertas: [daCaixa(1)] });
    await esperar(() => !!tid("sugestoes-vazio"), "a frase de vazio aparece");
    expect(tid("sugestoes-vazio")!.textContent).toBe("Nada parecido no acervo — procure no galpão e responda.");
    expect(tid("aviso-vinculo-c1")!.textContent).toContain("sem vínculo com o acervo");
    expect((tid("button-atender-c1") as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { fireEvent.change(tid("input-observacao-resposta-c1")!, { target: { value: "rasgadas" } }); });
    await act(async () => { fireEvent.click(tid("button-nao-consigo-c1")!); });
    await esperar(() => f.escritas().length === 1, "responde");
    expect(f.escritas()[0].body).toEqual({ resposta: "nao_atender", observacao: "rasgadas" });
    expect(avisos.some((a) => a.title === "Respondido: não consigo atender")).toBe(true);
  });

  it("busca manual: pede ao servidor com o texto e troca o título; só UMA solicitação procura por vez", async () => {
    const buscas: string[] = [];
    await montarCaixa(1280, { abertas: [daCaixa(1), daCaixa(2)], sugestoes: (b) => { buscas.push(b); return { semMedida: false, sugestoes: b ? [sugestao("M1", 2)] : [] }; } });
    await esperar(() => !!tid("sugestoes-vazio"), "primeira procura");
    expect(tid("responder-c2")).toBeNull();
    await act(async () => { fireEvent.change(tid("input-busca-acervo-c1")!, { target: { value: "portico" } }); });
    await act(async () => { fireEvent.click(tid("button-busca-acervo-c1")!); });
    await esperar(() => !!tid("sugestao-M1"), "o resultado da busca aparece");
    expect(buscas).toEqual(["", "portico"]);
    expect(tid("responder-c1")!.textContent).toContain("Busca no acervo");
    await act(async () => { fireEvent.click(tid("button-procurar-c2")!); });
    await esperar(() => !!tid("responder-c2"), "a segunda abre");
    expect(tid("responder-c1")).toBeNull();
  });

  it("a aba mora na URL; Respondidas conta o desfecho — quem segue com a peça é a Revisão Final", async () => {
    await montarCaixa(1280, {
      url: "/grafica/solicitacoes-ao-estoque?aba=respondidas",
      respondidas: [
        daCaixa(1, { status: "atendida_parcial", quantidadeAtendida: 3, respondidoPor: "Gil", respondidoEm: "2026-09-21T14:00:00.000Z", ativosIds: ["a", "b"] }),
        daCaixa(2, { status: "atendida", quantidadeAtendida: 5, respondidoPor: "Gil", aplicadoEm: "2026-09-21T15:00:00.000Z", peca: { ...daCaixa(2).peca, status: "ready_for_production", reuseQty: 5 } }),
        daCaixa(3, { status: "nao_atendida", quantidadeAtendida: 0, respondidoPor: "Gil", observacaoResposta: "rasgadas" }),
      ],
    });
    expect(tid("aba-respondidas")!.getAttribute("aria-selected")).toBe("true");
    expect(tid("consulta-c1")!.textContent).toContain("Atendeu 3 de 5 un. pedidas");
    expect(tid("consulta-c1")!.textContent).toContain("2 peças reservadas do acervo");
    expect(tid("consulta-c1")!.textContent).toContain("Esperando a Revisão Final confirmar e liberar");
    expect(tid("consulta-c2")!.textContent).toContain("Já é reaproveitamento na peça (5 de 6 un. reaproveitadas)");
    expect(tid("consulta-c2")!.textContent).toContain("sem vínculo com o acervo");
    expect(tid("consulta-c3")!.textContent).toContain("Não conseguiu atender as 5 un. pedidas");
    expect(tid("consulta-c3")!.textContent).toContain("rasgadas");
    await act(async () => { fireEvent.click(tid("aba-abertas")!); });
    expect(window.location.search).toBe("");
    await act(async () => { fireEvent.click(tid("aba-respondidas")!); });
    expect(window.location.search).toBe("?aba=respondidas");
  });

  it("a Solicitação só acompanha: sem procurar nem responder; cancela a dela", async () => {
    const f = await montarCaixa(1280, { papel: "solicitacao", abertas: [daCaixa(1)] });
    expect(tid("responder-c1")).toBeNull();
    expect(tid("button-procurar-c1")).toBeNull();
    expect(tid("consulta-c1")!.textContent).toContain("Esperando a Gráfica responder");
    await act(async () => { fireEvent.click(tid("button-cancelar-c1")!); });
    await esperar(() => f.escritas().length === 1, "cancela");
    expect(f.escritas()[0].url).toBe("/api/consultas-de-estoque/c1/cancelar");
  });

  it("celular 390px: uma coluna, alvos de 44px, campos a 16px e as respostas coladas no pé com safe-area", async () => {
    await montarCaixa(390, { abertas: [daCaixa(1)], sugestoes: () => ({ semMedida: false, sugestoes: [sugestao("L1", 6)] }) });
    await esperar(() => !!tid("lista-de-sugestoes"), "as sugestões chegam");
    expect(tid("consulta-c1")!.style.gridTemplateColumns).toBe("1fr");
    for (const id of ["aba-abertas", "aba-respondidas", "button-atender-c1", "button-atender-parcial-c1", "button-nao-consigo-c1", "button-busca-acervo-c1"]) {
      expect(px(tid(id)!.style.minHeight), id).toBeGreaterThanOrEqual(44);
    }
    for (const id of ["input-busca-acervo-c1", "qtd-sugestao-L1", "input-parcial-c1", "input-observacao-resposta-c1"]) {
      expect(px(tid(id)!.style.fontSize), id).toBeGreaterThanOrEqual(16);
      expect(px(tid(id)!.style.minHeight), id).toBeGreaterThanOrEqual(44);
    }
    const pe = tid("acoes-c1")!;
    expect(pe.style.position).toBe("sticky");
    expect(pe.style.bottom).toBe("0px");
    // O jsdom descarta env() ao serializar o estilo — a safe-area se prende pela fonte.
    expect(ler("client/src/pages/solicitacoes-ao-estoque.tsx")).toContain('padding: "10px 14px calc(10px + env(safe-area-inset-bottom))"');
  });
});

// ─── 3 · O QUE SE PRENDE PELA FONTE ──────────────────────────────────────────
describe("as regras da casa nos arquivos novos", () => {
  const NOVOS = [
    "client/src/pages/solicitacoes-ao-estoque.tsx",
    "client/src/components/consulta-de-estoque/na-revisao.tsx",
    "client/src/components/consulta-de-estoque/aviso-na-grafica.tsx",
  ];

  it("laranja e cinza decorativos nunca como cor de texto; nada de “Pelotão”; sem {/* */} colado em return; o nome na interface é “Solicitação ao estoque”", () => {
    for (const arq of NOVOS) {
      const fonte = ler(arq);
      // cor de TEXTO: `color:` fora de um ícone (svg herda `color`; o único uso de #a8a29e é o ícone vazio da miniatura)
      for (const u of Array.from(fonte.matchAll(/color: ["'](#f97316|#a8a29e)["']/gi))) {
        const linha = fonte.slice(fonte.lastIndexOf("\n", u.index!) + 1, fonte.indexOf("\n", u.index!));
        expect(linha, `${arq}: ${linha.trim()}`).toContain("<PackageSearch");
      }
      expect(fonte.toLowerCase(), arq).not.toContain("pelotão");
      expect(fonte, arq).not.toMatch(/return \(\s*\{\/\*/);
      expect(fonte, arq).not.toMatch(/[?:] \(\s*\{\/\*/);
      // nenhuma frase de tela chama isto de "consulta"
      const frases = Array.from(fonte.matchAll(/>([^<>{}]*[Cc]onsulta[^<>{}]*)</g), (m) => m[1]);
      expect(frases, arq).toEqual([]);
    }
  });

  it("menu “Solicitações ao estoque”, rota, pré-carga, o número das abertas (só para quem responde) e o destino de cada aviso", () => {
    const menu = ler("client/src/components/app-sidebar.tsx");
    expect(menu).toContain('title: "Solicitações ao estoque", url: "/grafica/solicitacoes-ao-estoque", icon: PackageSearch, roles: ["grafica", "solicitacao", "admin"],');
    expect(menu).toContain("...(SOLICITACAO_AO_ESTOQUE_ATIVA ? [ITEM_SOLICITACOES_AO_ESTOQUE] : []),");
    expect(menu).toContain('queryKey: ["/api/consultas-de-estoque/abertas"],');
    expect(menu).toContain('const respondeConsultas = SOLICITACAO_AO_ESTOQUE_ATIVA && (role === "grafica" || role === "admin");');
    expect(menu).toContain('"solicitação ao estoque esperando" : "solicitações ao estoque esperando"} resposta');
    const app = ler("client/src/App.tsx");
    expect(app).toContain('const SolicitacoesAoEstoque = lazyPage(() => import("@/pages/solicitacoes-ao-estoque"));');
    expect(app).toContain('<Route path="/grafica/solicitacoes-ao-estoque">');
    // a Gráfica vai para a caixa; a resposta de peça em revisão abre a FICHA; a de peça já liberada, a aba Respondidas
    expect(app).toContain('if (tipo === "consultaDeEstoque") return "/grafica/solicitacoes-ao-estoque";');
    expect(app).toContain('if (role === "grafica" || tipo === "consultaDeEstoqueAplicada") return "/grafica/solicitacoes-ao-estoque?aba=respondidas";');
    expect(app).toContain("return n.itemId ? `/solicitacao?item=${n.itemId}` : \"/solicitacao\";");
    expect(ler("client/src/lib/prefetch-de-rota.ts")).toContain('{ "/grafica/solicitacoes-ao-estoque": () => import("@/pages/solicitacoes-ao-estoque") }');
    const sino = ler("client/src/components/notification-bell.tsx");
    for (const tipo of ["consultaDeEstoque:", "consultaDeEstoqueRespondida:", "consultaDeEstoqueAplicada:"]) expect(sino).toContain(tipo);
  });

  it("na fila da Gráfica, a peça liberada com pedido aberto avisa “N un. aguardando resposta do estoque”, com atalho — uma chave só", () => {
    const aviso = ler("client/src/components/consulta-de-estoque/aviso-na-grafica.tsx");
    expect(aviso).toContain('queryKey: ["/api/consultas-de-estoque/abertas-por-peca"],');
    expect(aviso).toContain("{aberta.quantidadePedida} un. aguardando resposta do estoque");
    expect(aviso).toContain('href="/grafica/solicitacoes-ao-estoque"');
    expect(aviso).toContain("responda a solicitação antes de imprimir tudo");
    expect((ler("client/src/pages/grafica.tsx").match(/<AvisoDoEstoqueNaPeca /g) ?? []).length).toBe(3);
  });
});
