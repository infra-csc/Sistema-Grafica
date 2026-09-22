// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// TRIAGEM DE RETORNO e ESTOQUE MONTADAS (revisão de 21/09).
//
// O que este arquivo prende, com as páginas de verdade no jsdom:
//   1. VOLUME: 4 mil+ peças na triagem e 5 mil no acervo não viram 4 mil
//      linhas no DOM — lotes + "Mostrar mais"; a lista de eventos e as colunas
//      do quadro também entram em lotes.
//   2. A ALTERNATIVA AO ARRASTAR: clique + barra (desktop e celular) e as
//      teclas G/M/D/T no cartão focado, com o anúncio para leitor de tela.
//   3. DESCARTAR PEDE CONFIRMAÇÃO (quadro, linha e lote); "Rever" não grava.
//   4. GRAVAÇÃO EM GRUPOS: nunca mais de GRAVACOES_POR_VEZ PATCH ao mesmo tempo.
//   5. ONDE ESTOU NA URL: vista/evento/filtros da triagem; "reserva=1" no estoque.
//   6. ESTADOS: carregando, erro, vazio, busca sem resultado.
//   7. CELULAR (390px): sem tabela, alvos de 44px, campos a 16px.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;

// A primeira importação das páginas transforma centenas de módulos; com a
// máquina carregada isso sozinho passa dos 5 s padrão.
vi.setConfig({ testTimeout: 120_000 });

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", name: "Admin", email: "a@a", role: "admin", mustChangePassword: false }, isLoading: false, logout: () => {} }),
}));

// Os avisos são capturados: o <Toaster/> mora no App, fora da página montada.
const avisos: { title?: string; description?: string; variant?: string }[] = [];
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (t: any) => { avisos.push(t); } }) }));
const textoDosAvisos = () => avisos.map((a) => `${a.title ?? ""} ${a.description ?? ""}`).join(" | ");

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));
const tid = (id: string) => $(`[data-testid="${id}"]`);
const tick = (ms = 0) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
const px = (v: string | undefined) => parseFloat(String(v ?? "").replace("px", "")) || 0;

const ativoDaTriagem = (i: number, eventId: string | null, extra: any = {}) => ({
  id: `a${i}`, displayId: `#EST-${String(i).padStart(4, "0")}`, name: `Placa ${i}`, quantity: 1, condition: "PERFEITO",
  trackingStatus: "AGUARDANDO_TRIAGEM", location: null, notes: null, franchiseTags: [], sponsorIds: [], sponsors: [],
  approvalThumbUrl: null, autoAdded: true, originalItemId: null, updatedAt: "2026-09-01T12:00:00Z",
  eventId, eventName: eventId ? `Evento ${eventId}` : null, eventDate: "2026-08-30T00:00:00Z", ...extra,
});

/** 4.200 peças: 60 eventos de 50 + uma pilha de 1.200 num evento só. */
function filaGrande() {
  const lista: any[] = [];
  let n = 0;
  for (let e = 0; e < 60; e++) for (let i = 0; i < 50; i++) lista.push(ativoDaTriagem(n++, `e${e}`));
  for (let i = 0; i < 1200; i++) lista.push(ativoDaTriagem(n++, "pilha"));
  return lista;
}

const ativoDoAcervo = (i: number, extra: any = {}) => ({
  id: `s${i}`, displayId: `#EST-${String(i).padStart(4, "0")}`, name: `Lona ${i}`, quantity: 1, condition: "PERFEITO",
  trackingStatus: "NO_GALPAO", location: "Setor A", notes: null, franchiseTags: [], sponsorIds: [],
  approvalThumbUrl: null, autoAdded: true, originalItemId: null, ...extra,
});

function prepararJsdom(largura: number) {
  Object.defineProperty(window, "innerWidth", { value: largura, configurable: true });
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: /max-width:\s*767px/.test(q) && largura < 768, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  (Element.prototype as any).scrollIntoView = () => {};
  (Element.prototype as any).hasPointerCapture = () => false;
  (Element.prototype as any).releasePointerCapture = () => {};
}

/** Respostas de leitura por trecho de URL (usos, peça de origem…). */
const respostasExtras: Record<string, unknown> = {};

/** fetch falso: guarda as escritas e mede quantas ficam abertas ao mesmo tempo. */
function fetchFalso(opts: { falhar?: (url: string) => string | null; demora?: number; fila?: any[]; segurarFila?: () => Promise<void> } = {}) {
  const estado = { abertas: 0, pico: 0 };
  const mock = vi.fn(async (url: any, init?: any) => {
    const u = String(url);
    if ((!init?.method || init.method === "GET") && u.includes("awaiting-triage")) await opts.segurarFila?.();
    if (init?.method && init.method !== "GET") {
      estado.abertas++; estado.pico = Math.max(estado.pico, estado.abertas);
      await new Promise((r) => setTimeout(r, opts.demora ?? 2));
      estado.abertas--;
      const erro = opts.falhar?.(u);
      if (erro) return new Response(JSON.stringify({ error: erro }), { status: 400, headers: { "content-type": "application/json" } });
    }
    // A fila volta igual no refetch: o servidor de mentira não tria de verdade.
    const extra = Object.entries(respostasExtras).find(([trecho]) => u.includes(trecho));
    const corpo = extra ? extra[1] : u.includes("awaiting-triage") ? opts.fila ?? [] : [];
    return new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", mock);
  const escritas = () => mock.mock.calls.filter((c: any) => c[1]?.method && c[1].method !== "GET")
    .map((c: any) => ({ url: String(c[0]), method: c[1].method, body: c[1].body ? JSON.parse(String(c[1].body)) : null }));
  return { mock, escritas, estado };
}

async function montarTriagem(largura: number, fila: any[] | "carregando" | "erro", opts: { url?: string; reservas?: any[] } = {}) {
  prepararJsdom(largura);
  window.history.replaceState({}, "", opts.url ?? "/triagem-retorno");
  const { queryClient } = await import("@/lib/queryClient");
  const Pagina = (await import("@/pages/triagem-retorno")).default;
  queryClient.clear();
  // staleTime infinito do app: o que está no cache não é pedido de novo.
  if (Array.isArray(fila)) queryClient.setQueryData(["/api/inventory/awaiting-triage"], fila);
  queryClient.setQueryData(["/api/estoque/reservas-ativas"], opts.reservas ?? []);
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Pagina as any, null))); });
  await tick(30);
  return queryClient;
}

async function montarEstoque(largura: number, acervo: any[], opts: { url?: string; reservas?: any[]; usos?: any[]; itens?: any[]; eventos?: any[]; trilha?: Record<string, any[]> } = {}) {
  prepararJsdom(largura);
  window.history.replaceState({}, "", opts.url ?? "/estoque");
  const { queryClient } = await import("@/lib/queryClient");
  const Pagina = (await import("@/pages/estoque")).default;
  queryClient.clear();
  // Como o servidor manda desde 22/09: o evento da peça de origem vem no ativo;
  // os usos e a peça de origem são pedidos sob demanda (fetch falso).
  const eventoDaPeca = new Map((opts.itens ?? []).map((i: any) => [i.id, i.eventId]));
  queryClient.setQueryData(["/api/inventory"], acervo.map((a) => ({ ...a, origemEventId: a.originalItemId ? eventoDaPeca.get(a.originalItemId) ?? null : null })));
  queryClient.setQueryData(["/api/sponsors"], []);
  queryClient.setQueryData(["/api/events"], opts.eventos ?? []);
  respostasExtras["/api/estoque/usos"] = opts.usos ?? [];
  if (opts.itens?.[0]) respostasExtras["/origem"] = opts.itens[0];
  for (const [id, logs] of Object.entries(opts.trilha ?? {})) queryClient.setQueryData([`/api/audit-logs?entityType=inventory_asset&entityId=${id}`], logs);
  queryClient.setQueryData(["/api/estoque/reservas-ativas"], opts.reservas ?? []);
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Pagina as any, null))); });
  await tick(30);
  return queryClient;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); avisos.length = 0; for (const k of Object.keys(respostasExtras)) delete respostasExtras[k]; });

// ─── Triagem: entrada por evento ─────────────────────────────────────────────
describe("triagem · lista de eventos com 4 mil+ peças", () => {
  it("monta um lote de eventos, busca por nome e mostra mais sob pedido", async () => {
    fetchFalso();
    const { LOTE_DE_EVENTOS } = await import("@/components/triagem/eventos-da-triagem");
    await montarTriagem(1280, filaGrande());
    expect($$('[data-testid^="evento-triagem-"]').length).toBe(LOTE_DE_EVENTOS);
    expect(document.body.textContent).toContain("61 eventos voltaram · 4200 peças esperando");
    // O que pede atenção vem dito: todos esperam há mais de 14 dias.
    expect(tid("resumo-eventos-triagem")!.textContent).toContain("há mais de 14 dias");

    await act(async () => { fireEvent.click(tid("mostrar-mais-eventos")!); });
    expect($$('[data-testid^="evento-triagem-"]').length).toBe(LOTE_DE_EVENTOS * 2);

    await act(async () => { fireEvent.change(tid("input-busca-eventos-triagem")!, { target: { value: "pilha" } }); });
    expect($$('[data-testid^="evento-triagem-"]').map((b) => b.dataset.testid)).toEqual(["evento-triagem-pilha"]);

    await act(async () => { fireEvent.change(tid("input-busca-eventos-triagem")!, { target: { value: "não existe" } }); });
    expect(tid("eventos-sem-resultado")).not.toBeNull();
  });

  it("estados: carregando, erro com tentar de novo, e vazio que explica", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    await montarTriagem(1280, "carregando");
    expect($('[aria-busy="true"]')).not.toBeNull();
    cleanup();

    fetchFalso();
    await montarTriagem(1280, []);
    expect(document.body.textContent).toContain("Nenhum material aguardando triagem");
    expect(tid("button-triagem-tabela")).toBeNull();
  });

  it("o endereço guarda onde estou: abrir um evento grava vista e evento; F5 volta ao quadro", async () => {
    fetchFalso();
    await montarTriagem(1280, filaGrande());
    await act(async () => { fireEvent.click(tid("evento-triagem-e0")!); });
    await tick(260);
    expect(window.location.search).toContain("vista=quadro");
    expect(window.location.search).toContain("evento=e0");
    cleanup();

    await montarTriagem(1280, filaGrande(), { url: "/triagem-retorno?vista=quadro&evento=e3" });
    expect(tid("quadro-triagem")).not.toBeNull();
    expect(document.body.textContent).toContain("Evento e3");
    cleanup();

    // Link antigo de um evento que já terminou a triagem: cai na lista.
    await montarTriagem(1280, filaGrande(), { url: "/triagem-retorno?vista=quadro&evento=sumiu" });
    expect(tid("quadro-triagem")).toBeNull();
    expect(tid("lista-eventos-triagem")).not.toBeNull();
  });
});

// ─── Triagem: o quadro ───────────────────────────────────────────────────────
describe("triagem · quadro do evento", () => {
  it("a pilha de 1.200 entra em lotes; buscar e 'selecionar visíveis' só pegam o que está na tela", async () => {
    fetchFalso();
    const { LOTE_DA_COLUNA } = await import("@/components/triagem/quadro-da-triagem");
    await montarTriagem(1280, filaGrande(), { url: "/triagem-retorno?vista=quadro&evento=pilha" });
    expect($$('[data-testid^="cartao-triagem-"]').length).toBe(LOTE_DA_COLUNA);
    await act(async () => { fireEvent.click(tid("mostrar-mais-triar")!); });
    expect($$('[data-testid^="cartao-triagem-"]').length).toBe(LOTE_DA_COLUNA * 2);

    await act(async () => { fireEvent.click(tid("button-selecionar-visiveis")!); });
    expect(tid("barra-mover-selecionadas")!.textContent).toContain(`${LOTE_DA_COLUNA * 2} selecionados`);
    await act(async () => { fireEvent.click(tid("mover-para-manutencao")!); });
    // O contador da coluna diz o total, não o que está montado.
    expect(tid("unidades-manutencao")!.textContent).toBe(`${LOTE_DA_COLUNA * 2} un.`);
    expect($$('[data-testid="coluna-triagem-manutencao"] [data-testid^="cartao-triagem-"]').length).toBe(LOTE_DA_COLUNA);

    await act(async () => { fireEvent.change(tid("input-busca-quadro")!, { target: { value: "Placa 4199" } }); });
    expect($$('[data-testid="coluna-triagem-triar"] [data-testid^="cartao-triagem-"]').length).toBe(1);
  });

  it("sem arrastar: teclas G/M/D no cartão focado movem, anunciam e passam o foco ao vizinho", async () => {
    fetchFalso();
    await montarTriagem(1280, filaGrande(), { url: "/triagem-retorno?vista=quadro&evento=e1" });
    const primeiro = tid("cartao-triagem-triar-a50")!;
    expect(primeiro.getAttribute("aria-keyshortcuts")).toBe("G M D T");
    primeiro.focus();
    await act(async () => { fireEvent.keyDown(primeiro, { key: "g" }); });
    await tick(5);
    expect($('[data-testid="coluna-triagem-galpao"] [data-testid="cartao-triagem-galpao-a50"]')).not.toBeNull();
    expect(tid("anuncio-do-quadro")!.textContent).toBe("1 unidade movida para Galpão");
    expect(document.activeElement?.getAttribute("data-testid")).toBe("cartao-triagem-triar-a51");
    // Ctrl+D é do navegador: não move.
    await act(async () => { fireEvent.keyDown(tid("cartao-triagem-triar-a51")!, { key: "d", ctrlKey: true }); });
    expect($('[data-testid="coluna-triagem-descartar"] [data-testid^="cartao-triagem-"]')).toBeNull();
    // T devolve para "A triar" — o desfazer de antes de salvar.
    await act(async () => { fireEvent.keyDown(tid("cartao-triagem-galpao-a50")!, { key: "T" }); });
    expect($('[data-testid="coluna-triagem-triar"] [data-testid="cartao-triagem-triar-a50"]')).not.toBeNull();
  });

  it("descartar pede confirmação; 'Rever' não grava; confirmar grava em grupos, com o motivo do erro", async () => {
    const { GRAVACOES_POR_VEZ } = await import("@/components/triagem/quadro-da-triagem");
    const { escritas, estado } = fetchFalso({ fila: filaGrande(), falhar: (u) => (u.includes("/a101/") ? "Ativo bloqueado" : null) });
    await montarTriagem(1280, filaGrande(), { url: "/triagem-retorno?vista=quadro&evento=e2" });
    await act(async () => { fireEvent.click(tid("button-selecionar-visiveis")!); });
    await act(async () => { fireEvent.click(tid("mover-para-descartar")!); });
    await act(async () => { fireEvent.click(tid("button-salvar-triagem")!); });
    expect(document.body.textContent).toContain("Descartar 40 un. de 40 materiais?");
    expect(escritas().length).toBe(0);
    await act(async () => { fireEvent.click(tid("button-rever-descarte")!); });
    await tick(10);
    expect(escritas().length).toBe(0);

    await act(async () => { fireEvent.click(tid("button-salvar-triagem")!); });
    await act(async () => { fireEvent.click(tid("button-confirmar-descarte")!); });
    await tick(150);
    expect(escritas().length).toBe(40);
    expect(escritas()[0].body).toEqual({ condition: "SUCATA", trackingStatus: "DESCARTADO" });
    expect(estado.pico).toBeLessThanOrEqual(GRAVACOES_POR_VEZ);
    expect(textoDosAvisos()).toContain("39 salvas · 1 com erro");
    expect(textoDosAvisos()).toContain("Ativo bloqueado");
    // A que falhou continua no destino para tentar de novo.
    expect($('[data-testid="coluna-triagem-descartar"] [data-testid="cartao-triagem-descartar-a101"]')).not.toBeNull();
  });

  it("galpão grava sem pedir local (o sistema não guarda onde fica); sem descarte não há confirmação", async () => {
    const { escritas } = fetchFalso();
    await montarTriagem(1280, filaGrande(), { url: "/triagem-retorno?vista=quadro&evento=e4" });
    await act(async () => { fireEvent.click(tid("cartao-triagem-triar-a200")!); });
    await act(async () => { fireEvent.click(tid("mover-para-galpao")!); });
    expect(tid("aviso-local-galpao")).toBeNull();
    expect(tid("input-local-galpao")).toBeNull();
    expect($('[aria-label*="mapa do galpão"]')).toBeNull();
    await act(async () => { fireEvent.click(tid("button-salvar-triagem")!); });
    await tick(40);
    expect(escritas().map((e) => e.body)).toEqual([{ condition: "PERFEITO", trackingStatus: "NO_GALPAO" }]);
  });

  it("celular 390px: uma coluna, nada arrasta, barra de destinos com alvos de 44px e campo a 16px", async () => {
    fetchFalso();
    await montarTriagem(390, filaGrande(), { url: "/triagem-retorno?vista=quadro&evento=e5" });
    expect($$("[data-cartao]").every((c) => c.getAttribute("draggable") === "false")).toBe(true);
    expect(document.body.textContent).toContain("toque no material e escolha o destino");
    await act(async () => { fireEvent.click(tid("cartao-triagem-triar-a250")!); });
    for (const d of ["galpao", "manutencao", "descartar", "triar"]) expect(px(tid(`mover-para-${d}`)!.style.height)).toBeGreaterThanOrEqual(44);
    expect(px(tid("input-busca-quadro")!.style.fontSize)).toBe(16);
    expect(tid("barra-mover-selecionadas")!.style.bottom).toContain("safe-area-inset-bottom");
  });
});

// ─── Triagem: itens por quantidade JUNTOS (dono, 21/09) ─────────────────────
describe("triagem · quadro agrupado por quantidade", () => {
  /** Como o dado é de fato: 24 registros de 1 unidade, todos da mesma peça. */
  const vinteEQuatro = () => Array.from({ length: 24 }, (_, i) => ativoDaTriagem(1000 + i, "min", { name: "2x1 Ministério", originalItemId: "item-2x1", displayId: `#EST-0412-${i + 1}` }));
  const fila = () => [...vinteEQuatro(), ativoDaTriagem(2000, "min", { name: "Grade", quantity: 10, displayId: "#EST-M-7" }), ativoDaTriagem(2001, "min", { name: "Pórtico" })];
  const abrir = (largura: number, opts: any = {}) => montarTriagem(largura, fila(), { url: "/triagem-retorno?vista=quadro&evento=min", ...opts });
  const digitar = async (destino: string, valor: string) => { await act(async () => { fireEvent.change(tid(`qtd-${destino}`)!, { target: { value: valor } }); }); };

  it("24 registros iguais viram UM cartão com a soma; a expansão mostra os registros", async () => {
    fetchFalso({ fila: fila() });
    await abrir(1280);
    expect($$('[data-testid^="cartao-triagem-triar-"]').length).toBe(3);
    expect(tid("quantidade-triar-a1000")!.textContent).toBe("24un.");
    expect(tid("resumo-do-quadro")!.textContent).toContain("3 materiais · 35 de 35 un. a triar");
    expect(tid("pecas-triar-a1000")).toBeNull();
    await act(async () => { fireEvent.click(tid("ver-pecas-triar-a1000")!); });
    expect(tid("pecas-triar-a1000")!.querySelectorAll("li").length).toBe(24);
    // Ordem natural do código: -2 antes de -10.
    expect(Array.from(tid("pecas-triar-a1000")!.querySelectorAll("li")).slice(0, 3).map((l) => l.textContent)).toEqual(["#EST-0412-1", "#EST-0412-2", "#EST-0412-3"]);
    // Material de uma unidade só não tem o que dividir.
    expect(tid("dividir-triar-a2001")).toBeNull();
  });

  it("Dividir: 20 Galpão · 3 Manutenção · 1 Descartar, com o resto ao vivo e a soma presa no total", async () => {
    fetchFalso({ fila: fila() });
    await abrir(1280);
    await act(async () => { fireEvent.click(tid("dividir-triar-a1000")!); });
    expect(tid("resta-sem-destino")!.textContent).toContain("Restam 24 sem destino");
    await digitar("galpao", "20");
    await digitar("manutencao", "3");
    expect(tid("resta-sem-destino")!.textContent).toContain("Resta 1 sem destino");
    // 9 não cabe: só sobra 1.
    await digitar("descartar", "9");
    expect((tid("qtd-descartar") as HTMLInputElement).value).toBe("1");
    expect(tid("resta-sem-destino")!.textContent).toContain("As 24 unidades têm destino");
    await act(async () => { fireEvent.click(tid("dividir-aplicar")!); });
    // O mesmo material aparece nas três colunas, cada uma com a sua fatia.
    expect(tid("quantidade-galpao-a1000")!.textContent).toBe("20un.de 24");
    expect(tid("quantidade-manutencao-a1000")!.textContent).toBe("3un.de 24");
    expect(tid("quantidade-descartar-a1000")!.textContent).toBe("1un.de 24");
    expect(tid("cartao-triagem-triar-a1000")).toBeNull();
    expect(tid("unidades-galpao")!.textContent).toBe("20 un.");
  });

  it("salvar distribui os registros NA ORDEM, confirma o descarte parcial e resume as recusadas sem travar as demais", async () => {
    const { escritas } = fetchFalso({ fila: fila(), falhar: (u) => (u.includes("/a1003/") || u.includes("/a1004/") ? "Essa peça já foi triada (está: No galpão) — atualize a lista" : null) });
    await abrir(1280);
    await act(async () => { fireEvent.click(tid("dividir-triar-a1000")!); });
    await digitar("galpao", "20"); await digitar("manutencao", "3"); await digitar("descartar", "1");
    await act(async () => { fireEvent.click(tid("dividir-aplicar")!); });
    await act(async () => { fireEvent.click(tid("button-salvar-triagem")!); });
    expect(tid("titulo-confirmar-descarte")!.textContent).toBe("Descartar 1 de 24 un. de 2x1 Ministério?");
    expect(escritas().length).toBe(0);
    await act(async () => { fireEvent.click(tid("button-confirmar-descarte")!); });
    await tick(150);
    const e = escritas();
    expect(e.length).toBe(24);
    expect(e.every((x) => x.method === "PATCH")).toBe(true);
    const destinoDe = (n: number) => e.find((x) => x.url.includes(`/a${1000 + n}/`))!.body.trackingStatus;
    expect([destinoDe(0), destinoDe(19), destinoDe(20), destinoDe(22), destinoDe(23)]).toEqual(["NO_GALPAO", "NO_GALPAO", "EM_MANUTENCAO", "EM_MANUTENCAO", "DESCARTADO"]);
    expect(textoDosAvisos()).toContain("22 salvas · 2 já tinham sido triadas");
    expect(avisos.some((a) => a.variant === "destructive")).toBe(false);
  });

  it("registro ×10: repartido inteiro usa triage-split; repartido só em parte não grava e diz por quê", async () => {
    const { escritas } = fetchFalso({ fila: fila() });
    await abrir(1280);
    await act(async () => { fireEvent.click(tid("dividir-triar-a2000")!); });
    await digitar("manutencao", "4");
    await act(async () => { fireEvent.click(tid("dividir-aplicar")!); });
    await act(async () => { fireEvent.click(tid("button-salvar-triagem")!); });
    await tick(20);
    expect(escritas().length).toBe(0);
    expect(textoDosAvisos()).toContain("#EST-M-7 é um registro de 10 unidades");
    expect(textoDosAvisos()).toContain("faltam 6 un.");

    await act(async () => { fireEvent.click(tid("dividir-manutencao-a2000")!); });
    await act(async () => { fireEvent.click(tid("tudo-para-galpao")!); });
    await digitar("galpao", "6"); await digitar("manutencao", "4");
    await act(async () => { fireEvent.click(tid("dividir-aplicar")!); });
    await act(async () => { fireEvent.click(tid("button-salvar-triagem")!); });
    await tick(40);
    expect(escritas()).toEqual([{ url: "/api/inventory/a2000/triage-split", method: "POST", body: { splits: [
      { qty: 6, condition: "PERFEITO", trackingStatus: "NO_GALPAO" },
      { qty: 4, condition: "AVARIA_LEVE", trackingStatus: "EM_MANUTENCAO" },
    ] } }]);
  });

  it("arrastar/mover o cartão inteiro = tudo para lá; a tabela deixa os iguais juntos e diz quantos são", async () => {
    fetchFalso({ fila: fila() });
    await abrir(1280);
    await act(async () => { fireEvent.click(tid("cartao-triagem-triar-a1000")!); });
    await act(async () => { fireEvent.click(tid("mover-para-manutencao")!); });
    expect(tid("quantidade-manutencao-a1000")!.textContent).toBe("24un.");
    expect(tid("anuncio-do-quadro")!.textContent).toBe("24 unidades movidas para Manutenção");
    cleanup();
    await montarTriagem(1280, fila(), { url: "/triagem-retorno?vista=tabela" });
    expect(tid("iguais-a1000")!.textContent).toBe("24 un. iguais");
    expect(tid("iguais-a2001")).toBeNull();
  });

  it("celular 390px: o controle de quantidade é numérico, 16px, 44px e com rodapé acima da barra de gesto", async () => {
    fetchFalso({ fila: fila() });
    await abrir(390);
    await act(async () => { fireEvent.click(tid("dividir-triar-a1000")!); });
    const campo = tid("qtd-galpao") as HTMLInputElement;
    expect(campo.getAttribute("inputmode")).toBe("numeric");
    expect(px(campo.style.fontSize)).toBe(16);
    expect(px(campo.style.height)).toBeGreaterThanOrEqual(44);
    expect(px(tid("dividir-aplicar")!.style.height)).toBeGreaterThanOrEqual(44);
    expect(tid("dividir-aplicar")!.parentElement!.style.paddingBottom).toContain("safe-area-inset-bottom");
    await act(async () => { fireEvent.click(tid("tudo-para-galpao")!); });
    expect(campo.value).toBe("24");
  });

  // ── Revisão adversarial de 22/09 ──────────────────────────────────────────
  it("reservadas vão primeiro ao Galpão; se não couberem, Dividir e Salvar avisam e nada é gravado", async () => {
    // As três ÚLTIMAS no código estão reservadas para outro evento.
    const reservas = ["a1021", "a1022", "a1023"].map((id, i) => ({ reservaId: `r${i}`, assetId: id, itemDisplayId: "#0123", eventName: "Meia do Rio", saida: "2026-10-01T08:00:00Z" }));
    const { escritas } = fetchFalso({ fila: fila() });
    await abrir(1280, { reservas });
    await act(async () => { fireEvent.click(tid("dividir-triar-a1000")!); });
    await digitar("galpao", "1"); await digitar("descartar", "23");
    expect(tid("aviso-reservadas-dividir")!.textContent).toContain("3 unidades estão reservadas");
    await act(async () => { fireEvent.click(tid("dividir-aplicar")!); });
    await act(async () => { fireEvent.click(tid("button-salvar-triagem")!); });
    await tick(20);
    expect(escritas().length).toBe(0);
    expect(tid("titulo-confirmar-descarte")).toBeNull();
    expect(textoDosAvisos()).toContain("2 peças reservadas iriam para fora do Galpão");
    expect(textoDosAvisos()).toContain("está reservado para #0123 (Meia do Rio) — libere a reserva ou mande para o Galpão");

    // Refaz: 3 no Galpão e 21 na Manutenção → as três reservadas vão ao Galpão.
    await act(async () => { fireEvent.click(tid("dividir-galpao-a1000")!); });
    await digitar("descartar", "0"); await digitar("galpao", "3"); await digitar("manutencao", "21");
    expect(tid("aviso-reservadas-dividir")).toBeNull();
    await act(async () => { fireEvent.click(tid("dividir-aplicar")!); });
    await act(async () => { fireEvent.click(tid("button-salvar-triagem")!); });
    await tick(150);
    const e = escritas();
    expect(e.length).toBe(24);
    const destino = (id: string) => e.find((x) => x.url.includes(`/${id}/`))!.body.trackingStatus;
    expect(["a1021", "a1022", "a1023"].map(destino)).toEqual(["NO_GALPAO", "NO_GALPAO", "NO_GALPAO"]);
    expect(e.filter((x) => x.body.trackingStatus === "EM_MANUTENCAO").length).toBe(21);
  });

  it("outra pessoa triou parte do grupo: a divisão é zerada e avisada — nada vira Galpão em silêncio", async () => {
    const { escritas } = fetchFalso({ fila: fila() });
    const qc = await abrir(1280);
    await act(async () => { fireEvent.click(tid("dividir-triar-a1000")!); });
    await digitar("galpao", "20"); await digitar("descartar", "4");
    await act(async () => { fireEvent.click(tid("dividir-aplicar")!); });
    expect(tid("quantidade-descartar-a1000")!.textContent).toBe("4un.de 24");
    // Outra aba triou 2 dos 24: a fila volta com 22.
    await act(async () => { qc.setQueryData(["/api/inventory/awaiting-triage"], fila().filter((a) => a.id !== "a1000" && a.id !== "a1001")); });
    await tick(10);
    expect(textoDosAvisos()).toContain("Outra pessoa triou parte deste grupo — refaça a divisão");
    expect(tid("cartao-triagem-galpao-a1002")).toBeNull();
    expect(tid("cartao-triagem-descartar-a1002")).toBeNull();
    expect(tid("quantidade-triar-a1002")!.textContent).toBe("22un.");
    expect((tid("button-salvar-triagem") as HTMLButtonElement).disabled).toBe(true);
    expect(escritas().length).toBe(0);
  });

  it("nova tentativa: ×10 que falhou volta com as 10; Salvar espera a lista; o 2º Salvar manda só o que falhou", async () => {
    let falhar = true;
    let soltarFila: () => void = () => {};
    let segurar = false;
    const { escritas } = fetchFalso({
      fila: fila(),
      falhar: (u) => (falhar && (u.includes("/a2000/") || u.includes("/a1005/")) ? "Instabilidade no servidor" : null),
      segurarFila: () => (segurar ? new Promise<void>((ok) => { soltarFila = ok; }) : Promise.resolve()),
    });
    await abrir(1280);
    for (const id of ["a1000", "a2000", "a2001"]) await act(async () => { fireEvent.click(tid(`cartao-triagem-triar-${id}`)!); });
    await act(async () => { fireEvent.click(tid("mover-para-galpao")!); });
    segurar = true;
    await act(async () => { fireEvent.click(tid("button-salvar-triagem")!); });
    await tick(150);
    expect(escritas().length).toBe(26);
    expect(textoDosAvisos()).toContain("24 salvas · 2 com erro");
    // O registro ×10 volta ao Galpão com as 10 unidades (antes voltava como 1).
    expect(tid("quantidade-galpao-a2000")!.textContent).toBe("10un.");
    // Os 23 já gravados saem do quadro na hora; só o que falhou fica.
    expect(tid("quantidade-galpao-a1005")!.textContent).toBe("1un.");
    // Enquanto a lista não volta, Salvar fica travado.
    const botao = tid("button-salvar-triagem") as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(botao.textContent).toContain("Atualizando a lista");
    await act(async () => { soltarFila(); });
    await tick(20);
    expect(botao.disabled).toBe(false);
    expect(textoDosAvisos()).not.toContain("Outra pessoa triou");

    falhar = false; segurar = false;
    await act(async () => { fireEvent.click(botao); });
    await tick(80);
    const segunda = escritas().slice(26);
    expect(segunda.map((x) => x.url).sort()).toEqual(["/api/inventory/a1005/triage", "/api/inventory/a2000/triage"]);
    expect(segunda.every((x) => x.body.trackingStatus === "NO_GALPAO")).toBe(true);
    expect(textoDosAvisos()).toContain("2 salvas");
  });
});

// ─── Triagem: a tabela ───────────────────────────────────────────────────────
describe("triagem · tabela completa", () => {
  it("4.200 na fila → um lote de linhas; 'selecionar todas' marca só as visíveis", async () => {
    fetchFalso();
    const { LOTE_DA_TABELA } = await import("@/pages/triagem-retorno");
    await montarTriagem(1280, filaGrande(), { url: "/triagem-retorno?vista=tabela" });
    expect($$('[data-testid^="row-triage-"]').length).toBe(LOTE_DA_TABELA);
    await act(async () => { fireEvent.click(tid("checkbox-select-all")!); });
    expect(tid("button-bulk-triage-header")!.textContent).toContain(`Confirmar lote (${LOTE_DA_TABELA})`);
    await act(async () => { fireEvent.click(tid("mostrar-mais-tabela")!); });
    expect($$('[data-testid^="row-triage-"]').length).toBe(LOTE_DA_TABELA * 2);
  });

  it("os filtros vêm da URL e voltam ao primeiro lote ao mudar", async () => {
    fetchFalso();
    await montarTriagem(1280, filaGrande(), { url: "/triagem-retorno?vista=tabela&eventos=e7&q=Placa%2035" });
    // e7 = peças 350..399; "Placa 35" casa 350..359.
    expect($$('[data-testid^="row-triage-"]').length).toBe(10);
    expect((tid("input-triage-search") as HTMLInputElement).value).toBe("Placa 35");
  });

  it("salvar uma linha como Descartar pede confirmação; lote com divisão incompleta não vai ao servidor", async () => {
    const fila = [ativoDaTriagem(1, "e1"), ativoDaTriagem(2, "e1", { quantity: 5 })];
    const { escritas } = fetchFalso({ fila });
    await montarTriagem(1280, fila, { url: "/triagem-retorno?vista=tabela" });
    const linha = tid("row-triage-a1")!;
    const sucata = Array.from(linha.querySelectorAll("button")).find((b) => b.textContent?.includes("Sucata"))!;
    await act(async () => { fireEvent.click(sucata); });
    await act(async () => { fireEvent.click(tid("button-save-triage-a1")!); });
    expect(document.body.textContent).toContain("Descartar #EST-0001?");
    expect(escritas().length).toBe(0);
    await act(async () => { fireEvent.click(tid("button-confirmar-descarte")!); });
    await tick(40);
    expect(escritas().map((e) => e.body.trackingStatus)).toEqual(["DESCARTADO"]);

    // ×5 dividida com 4 distribuídas: o lote para antes do servidor.
    await act(async () => { fireEvent.click(tid("button-mode-split-a2")!); });
    await act(async () => { fireEvent.click(tid("button-split-minus-a2-0")!); });
    await act(async () => { fireEvent.click(tid("checkbox-asset-a2")!); });
    await act(async () => { fireEvent.click(tid("button-bulk-confirm")!); });
    await tick(20);
    expect(escritas().length).toBe(1);
    expect(textoDosAvisos()).toContain("divisão incompleta");
  });

  it("celular 390px: cartões no lugar da tabela, selecionar visíveis e Salvar com 44px", async () => {
    fetchFalso();
    await montarTriagem(390, filaGrande(), { url: "/triagem-retorno?vista=tabela" });
    expect($("table")).toBeNull();
    expect(px(tid("button-save-triage-a0")!.style.minHeight)).toBeGreaterThanOrEqual(44);
    expect(tid("input-location-a0")).toBeNull();
    expect(px((tid("input-notes-a0") as HTMLElement).style.fontSize)).toBe(16);
    await act(async () => { fireEvent.click(tid("button-selecionar-visiveis-tabela")!); });
    expect(tid("button-bulk-confirm")).not.toBeNull();
    expect(tid("button-selecionar-visiveis-tabela")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("a lista inteira de peças (/api/items) só é pedida quando o modal de detalhe abre", async () => {
    const { mock } = fetchFalso();
    await montarTriagem(1280, [ativoDaTriagem(1, "e1")], { url: "/triagem-retorno?vista=tabela" });
    expect(mock.mock.calls.some((c: any) => String(c[0]).includes("/api/items"))).toBe(false);
  });
});

// ─── Estoque ─────────────────────────────────────────────────────────────────
describe("estoque", () => {
  const acervo = () => Array.from({ length: 5000 }, (_, i) => ativoDoAcervo(i, i % 10 === 0 ? { trackingStatus: "DESCARTADO" } : {}));

  it("5 mil ativos → um lote na tabela, rodapé 'N de M' e Mostrar mais", async () => {
    fetchFalso();
    const { LOTE_DO_ESTOQUE } = await import("@/pages/estoque");
    await montarEstoque(1280, acervo());
    expect($$('[data-testid^="row-asset-"]').length).toBe(LOTE_DO_ESTOQUE);
    expect(tid("contador-da-lista")!.textContent).toBe(`${LOTE_DO_ESTOQUE} de 4500 materiais · 4500 unidades`);
    await act(async () => { fireEvent.click(tid("mostrar-mais-estoque")!); });
    expect($$('[data-testid^="row-asset-"]').length).toBe(LOTE_DO_ESTOQUE * 2);
    // Trocar o recorte volta ao primeiro lote.
    await act(async () => { fireEvent.click(tid("button-ver-descartados-rodape")!); });
    await tick(10);
    expect($$('[data-testid^="row-asset-"]').length).toBe(LOTE_DO_ESTOQUE);
    expect(tid("contador-da-lista")!.textContent).toBe(`${LOTE_DO_ESTOQUE} de 500 materiais · 500 unidades`);
  });

  it("'No galpão' não promete disponível; Reservadas filtra, grava na URL e Limpar desfaz", async () => {
    fetchFalso();
    const reservas = [{ reservaId: "r1", assetId: "s3", itemDisplayId: "#0101", eventName: "Meia do Rio", saida: "2026-10-01T08:00:00Z" }];
    await montarEstoque(1280, acervo().slice(0, 30), { reservas });
    expect(document.body.textContent).not.toContain("Disponível no depósito");
    expect(document.body.textContent).toContain("1 com reserva");
    const botao = tid("button-so-reservadas")!;
    expect(botao.getAttribute("aria-pressed")).toBe("false");
    await act(async () => { fireEvent.click(botao); });
    await tick(260);
    expect($$('[data-testid^="row-asset-"]').map((r) => r.dataset.testid)).toEqual(["row-asset-s3"]);
    expect(window.location.search).toContain("reserva=1");
    expect(tid("button-so-reservadas")!.getAttribute("aria-pressed")).toBe("true");
    await act(async () => { fireEvent.click(tid("button-clear-filters")!); });
    expect($$('[data-testid^="row-asset-"]').length).toBe(27);
  });

  it("busca sem resultado tem saída; celular 390px usa lista, com busca a 16px e ações de 44px", async () => {
    fetchFalso();
    await montarEstoque(390, acervo().slice(0, 30));
    expect($("table")).toBeNull();
    expect(px(tid("input-search-assets")!.style.fontSize)).toBe(16);
    expect(px(tid("button-view-asset-s1")!.style.width)).toBeGreaterThanOrEqual(44);
    await act(async () => { fireEvent.change(tid("input-search-assets")!, { target: { value: "zzz" } }); });
    await tick(20);
    expect(document.body.textContent).toContain("Nenhum ativo neste recorte");
    await act(async () => { fireEvent.click(tid("button-clear-filters-vazio")!); });
    await tick(20);
    expect($$('[data-testid^="row-asset-"]').length).toBe(27);
  });
});

// ─── Estoque agrupado por quantidade + detalhe do ativo (dono, 21/09) ───────
describe("estoque · agrupado por quantidade, onde já foi usado e o detalhe", () => {
  /** O print do dono: 34 registros "#EST-0396-N · 2×1 Nubank ×1", um por unidade. */
  const nubank = () => Array.from({ length: 34 }, (_, i) => ativoDoAcervo(3000 + i, {
    name: "2×1 — 2×1 Nubank", displayId: `#EST-0396-${i + 1}`, originalItemId: "item-0396", location: "Galpão Central",
    trackingStatus: i < 30 ? "NO_GALPAO" : "EM_USO", condition: i < 2 ? "AVARIA_LEVE" : "PERFEITO", approvalThumbUrl: i === 0 ? "/objects/arte-nubank.png" : null,
  }));
  const acervo = () => [...nubank(), ativoDoAcervo(1, { name: "Pórtico" })];
  const opts = () => ({
    itens: [{ id: "item-0396", displayId: "#0396", eventId: "ev-origem", type: "2×1", material: "Lona 440g", finish: "Ilhós", visualWidth: "2.00", visualHeight: "1.00", quantity: 34, sponsors: [{ id: "sp1", name: "Nubank" }] }],
    eventos: [{ id: "ev-origem", name: "Primavera RJ", startDate: "2026-08-10T00:00:00Z" }],
    usos: [
      ...[0, 1, 2, 3].map((i) => ({ id: `al${i}`, assetId: `s${3000 + i}`, eventId: "ev-t3", eventName: "teste 3", inicio: "2026-12-01T00:00:00Z", itemId: "it9", itemDisplayId: "#0777", em: "2026-09-20T10:00:00Z" })),
      { id: "al9", assetId: "s3005", eventId: "ev-velho", eventName: "Meia de Floripa", inicio: "2026-06-01T00:00:00Z", itemId: null, itemDisplayId: null, em: "2026-05-20T10:00:00Z" },
    ],
    reservas: [0, 1, 2, 3].map((i) => ({ reservaId: `r${i}`, assetId: `s${3000 + i}`, itemDisplayId: "#0777", eventName: "teste 3", saida: "2026-11-28T08:00:00Z" })),
    trilha: { s3000: [{ id: "l1", action: "cadastrado", userName: "Ana", createdAt: "2026-08-01T12:00:00Z" }, { id: "l2", action: "triagem", userName: "Bia", createdAt: "2026-08-12T12:00:00Z" }] },
  });

  it("34 linhas iguais viram UMA: soma, situação em unidades, condição agregada e onde já foi usado", async () => {
    fetchFalso();
    await montarEstoque(1280, acervo(), opts());
    expect($$('[data-testid^="row-group-"]').length).toBe(1);
    expect($$('[data-testid^="row-asset-"]').map((r) => r.dataset.testid)).toEqual(["row-asset-s1"]);
    expect(tid("unidades-s3000")!.textContent).toBe("34un.");
    expect(tid("situacao-s3000")!.textContent).toBe("30 no galpão (4 separadas) · 4 em uso");
    expect(tid("condicao-s3000")!.textContent).toBe("32 perfeito · 2 avaria leve");
    expect(tid("usado-em-s3000")!.textContent).toBe("teste 3Primavera RJ+1");
    expect(tid("contador-da-lista")!.textContent).toBe("2 materiais · 35 unidades");
    // Os cartões do topo seguem contando UNIDADES.
    expect(document.body.textContent).toContain("4 com reserva");
    // Sem coluna nem busca por localização.
    expect($$("th").map((t) => t.textContent)).toEqual(["Material", "Quantidade", "Situação", "Condição", "Onde já foi usado", "Ações"]);
    expect(document.body.textContent).not.toContain("Galpão Central");
    expect(document.body.textContent).not.toContain("Sem local");
    expect((tid("input-search-assets") as HTMLInputElement).placeholder).toBe("Nome, ID ou franquia...");
  });

  it("a expansão devolve as unidades, com as ações por unidade lá dentro", async () => {
    fetchFalso();
    await montarEstoque(1280, acervo(), opts());
    expect(tid("row-asset-s3000")).toBeNull();
    await act(async () => { fireEvent.click(tid("expandir-s3000")!); });
    expect(tid("expandir-s3000")!.getAttribute("aria-expanded")).toBe("true");
    expect($$('[data-testid^="row-asset-s30"]').length).toBe(34);
    for (const acao of ["button-view-asset", "button-edit-asset", "button-delete-asset", "button-quick-condition"]) expect(tid(`${acao}-s3007`)).not.toBeNull();
    expect(tid("chip-reservada-s3001")).not.toBeNull();
  });

  it("detalhe do GRUPO: 34 un., arte, situação, as duas quantidades explicadas, patrocinador da peça, usos e unidades", async () => {
    fetchFalso();
    await montarEstoque(1280, acervo(), opts());
    await act(async () => { fireEvent.click(tid("button-view-group-s3000")!); });
    await tick(20); // a peça de origem é pedida quando o detalhe abre
    const modal = tid("detalhe-do-ativo")!;
    expect(modal.textContent).toContain("34 unidades em 34 registros");
    expect(tid("detalhe-arte")!.getAttribute("alt")).toBe("Arte de 2×1 — 2×1 Nubank");
    expect(tid("detalhe-situacao-frase")!.textContent).toContain("30 no galpão (4 separadas) · 4 em uso");
    expect(modal.textContent).toContain("Neste material34 un.");
    expect(modal.textContent).toContain("Peça de origem #039634 un. pedidas");
    expect(modal.textContent).toContain("PatrocinadoresNubank");
    expect(tid("detalhe-reserva")!.textContent).toContain("4 unidades reservadas: teste 3");
    expect(tid("detalhe-usos")!.querySelectorAll("li").length).toBe(3);
    expect(tid("detalhe-usos")!.textContent).toContain("Separada para teste 3 · 4 unidades");
    expect(tid("detalhe-usos")!.textContent).toContain("Impressa para Primavera RJ · 34 unidades");
    expect(tid("detalhe-unidades")!.querySelectorAll("li").length).toBe(34);
    // Um tema só, sem localização, sem rótulo em caixa alta monoespaçada.
    expect(modal.textContent).not.toMatch(/Localiza|Galpão Central|RASTREABILIDADE|ESPECIFICAÇÕES/);
  });

  it("detalhe da UNIDADE: abre pelo grupo, mostra a peça da reserva, a trilha clara e volta ao grupo", async () => {
    fetchFalso();
    await montarEstoque(1280, acervo(), opts());
    await act(async () => { fireEvent.click(tid("button-view-group-s3000")!); });
    await act(async () => { fireEvent.click(tid("detalhe-unidade-s3000")!); });
    const modal = tid("detalhe-do-ativo")!;
    expect(modal.textContent).toContain("#EST-0396-1 · 1 unidade · uma das 34 deste material");
    expect(tid("detalhe-situacao")!.textContent).toBe("No galpão");
    expect(tid("detalhe-reserva")!.textContent).toContain("Reservada para a peça #0777 de teste 3");
    expect(tid("detalhe-usos")!.textContent).toContain("Separada para teste 3 · peça #0777");
    expect(tid("detalhe-trilha")!.querySelectorAll("li").length).toBe(2);
    expect(modal.textContent).toContain("Este registro1 un.");
    expect(tid("detalhe-editar")).not.toBeNull();
    await act(async () => { fireEvent.click(tid("detalhe-voltar-ao-grupo")!); });
    expect(tid("detalhe-unidades")).not.toBeNull();
  });

  it("ação em grupo: mudar a condição das N unidades grava uma por uma, em grupos de 6", async () => {
    const { GRAVACOES_POR_VEZ } = await import("@/components/triagem/quadro-da-triagem");
    const { escritas, estado } = fetchFalso();
    await montarEstoque(1280, acervo(), opts());
    await act(async () => { fireEvent.click(tid("button-view-group-s3000")!); });
    // Condições mistas: nenhuma marcada.
    expect($$('[data-testid^="detalhe-condicao-"]').every((b) => b.getAttribute("aria-checked") === "false")).toBe(true);
    await act(async () => { fireEvent.click(tid("detalhe-condicao-PERFEITO")!); });
    await tick(120);
    expect(escritas().length).toBe(34);
    expect(escritas().every((e) => e.method === "PATCH" && e.body.condition === "PERFEITO" && !("location" in e.body))).toBe(true);
    expect(estado.pico).toBeLessThanOrEqual(GRAVACOES_POR_VEZ);
    expect(textoDosAvisos()).toContain("Condição: Perfeito");
    // Manutenção só para o que está parado: o grupo tem 4 em uso.
    expect(tid("detalhe-manutencao")).toBeNull();
  });

  it("celular 390px: cartão do material, expansão, e o modal com rodapé fixo, 44px e safe-area", async () => {
    fetchFalso();
    await montarEstoque(390, acervo(), opts());
    expect($("table")).toBeNull();
    expect(tid("situacao-s3000")!.textContent).toBe("30 no galpão (4 separadas) · 4 em uso");
    await act(async () => { fireEvent.click(tid("expandir-s3000")!); });
    expect(tid("unidades-de-s3000")!.querySelectorAll("li").length).toBe(34);
    await act(async () => { fireEvent.click(tid("button-view-group-s3000")!); });
    expect(px(tid("detalhe-fechar")!.style.minHeight)).toBeGreaterThanOrEqual(44);
    expect(px(tid("detalhe-condicao-SUCATA")!.style.minHeight)).toBeGreaterThanOrEqual(44);
    expect(tid("detalhe-fechar")!.parentElement!.style.paddingBottom).toContain("safe-area-inset-bottom");
  });

  // ── Revisão adversarial de 22/09 ──────────────────────────────────────────
  it("editar peça EM USO não manda a situação do ciclo (era 400); a tela não baixa /api/items", async () => {
    const { escritas, mock } = fetchFalso();
    await montarEstoque(1280, acervo(), opts());
    await act(async () => { fireEvent.click(tid("expandir-s3000")!); });
    await act(async () => { fireEvent.click(tid("button-edit-asset-s3033")!); });
    await act(async () => { fireEvent.change(tid("input-asset-name")!, { target: { value: "2×1 Nubank (lona nova)" } }); });
    await act(async () => { fireEvent.click(tid("button-save-asset")!); });
    await tick(20);
    expect(escritas().map((x) => [x.method, x.url])).toEqual([["PATCH", "/api/inventory/s3033"]]);
    expect(escritas()[0].body.name).toBe("2×1 Nubank (lona nova)");
    expect("trackingStatus" in escritas()[0].body).toBe(false);
    // O evento de origem vem no próprio ativo; a peça de origem, sob demanda.
    expect(mock.mock.calls.some((c: any) => String(c[0]).startsWith("/api/items"))).toBe(false);
  });

  it("a linha aberta continua aberta quando os eventos chegam depois (a chave do grupo não muda)", async () => {
    fetchFalso();
    const qc = await montarEstoque(1280, acervo(), { ...opts(), eventos: [] });
    await act(async () => { fireEvent.click(tid("expandir-s3000")!); });
    expect(tid("expandir-s3000")!.getAttribute("aria-expanded")).toBe("true");
    await act(async () => { qc.setQueryData(["/api/events"], opts().eventos); });
    await tick(10);
    expect(tid("expandir-s3000")!.getAttribute("aria-expanded")).toBe("true");
    expect($$('[data-testid^="row-asset-s30"]').length).toBe(34);
  });

  it("os cartões do topo contam UNIDADES como as linhas, e dizem quando registros ≠ unidades", async () => {
    fetchFalso();
    await montarEstoque(1280, [ativoDoAcervo(1, { quantity: 10, name: "Grade" }), ativoDoAcervo(2)]);
    expect(document.body.textContent).toContain("2 registros · 11 unidades");
    expect(tid("contador-da-lista")!.textContent).toBe("2 materiais · 11 unidades");
  });

  it("o formulário de novo ativo não pede localização", async () => {
    fetchFalso();
    await montarEstoque(1280, acervo(), opts());
    await act(async () => { fireEvent.click(tid("button-new-asset")!); });
    expect(tid("input-asset-quantity")).not.toBeNull();
    expect(tid("input-asset-location")).toBeNull();
    expect($('[aria-label*="mapa do galpão"]')).toBeNull();
  });
});

// ─── Regras da casa, no texto das telas ──────────────────────────────────────
describe("regras da casa", () => {
  it("emGrupos respeita o teto, a ordem e devolve cada resultado", async () => {
    const { emGrupos } = await import("@/components/triagem/quadro-da-triagem");
    let abertas = 0, pico = 0;
    const avancos: number[] = [];
    const r = await emGrupos([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      abertas++; pico = Math.max(pico, abertas);
      await new Promise((ok) => setTimeout(ok, 1));
      abertas--;
      if (n === 4) throw new Error("quatro");
      return n * 2;
    }, (f) => avancos.push(f));
    expect(pico).toBe(3);
    expect(avancos).toEqual([3, 6, 7]);
    expect(r.map((x) => (x.status === "fulfilled" ? x.value : "erro"))).toEqual([2, 4, 6, "erro", 10, 12, 14]);
  });

  it("sem cor proibida como texto, sem a palavra aposentada, sem `= []` em useQuery", async () => {
    const { readFileSync } = await import("fs");
    const path = await import("path");
    for (const rel of ["client/src/pages/triagem-retorno.tsx", "client/src/pages/estoque.tsx", "client/src/components/triagem/quadro-da-triagem.tsx", "client/src/components/triagem/eventos-da-triagem.tsx"]) {
      const fonte = readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
      expect(fonte, rel).not.toMatch(/color:\s*"#(f97316|a8a29e)"/i);
      expect(fonte.toLowerCase(), rel).not.toContain("pelot");
      if (rel.includes("pages/")) expect(fonte, rel).not.toMatch(/data:\s*\w+\s*=\s*\[\]\s*[,}]/);
    }
  });
});
