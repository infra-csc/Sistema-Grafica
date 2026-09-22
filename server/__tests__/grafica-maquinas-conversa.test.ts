// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// A GRÁFICA E MÁQUINAS CONVERSANDO (dono, 21/09: "as telas Máquinas da Gráfica
// e Gráfica têm que se conversar").
//
// O que este arquivo prende:
//   1. TEMPO REAL: toda mensagem que o servidor emite num gesto das duas telas
//      invalida AS DUAS chaves (/api/items/approved e /api/grafica/maquinas) —
//      pelo mapa (lib/tempo-real-grafica.ts) e pelo hook montado; e as
//      mutações das duas telas usam a mesma invalidação.
//   2. MESMOS NÚMEROS: as duas telas montadas com o MESMO fixture mostram o
//      mesmo progresso, o mesmo selo de fila, a mesma contagem de "em
//      impressão" e de liberadas, e marcam as MESMAS impressoras ocupadas no
//      modal (a peça com 10 de 10 não ocupa — é a régua do servidor).
//   3. MESMAS AÇÕES: o modal das duas telas oferece tirar da impressora,
//      imprimir no lugar e só reservar.
//   4. IDA E VOLTA: peça → cartão da impressora (e de volta) e impressora →
//      filtro "Impressora" (e de volta), com o recorte certo.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as React from "react";
import { readFileSync } from "fs";
import { resolve } from "path";
import { render, act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  CHAVES_POR_MENSAGEM, CHAVES_DA_MUTACAO, chavesDaMensagem,
} from "@/lib/tempo-real-grafica";
import {
  numerosDaImpressao, fraseDaFila, ocupacaoDasImpressoras, impressorasDaPeca, imprimeNaMaquina,
  linkDaImpressoraEmMaquinas, linkDaPecaNaGrafica, linkDaImpressoraNaGrafica,
} from "@shared/progresso-da-impressao";
import { itemCasaFiltros, FILTROS_VAZIOS } from "@/lib/grafica-filtros";
import { rotuloDaMaquina } from "@shared/fluxo-peca";
import { semImpressora, reservaDaPeca } from "@shared/reserva-de-impressora";

vi.setConfig({ testTimeout: 40_000 });
const h = React.createElement;
const ler = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", name: "Operador", email: "g@g", role: "grafica", mustChangePassword: false }, isLoading: false, logout: () => {} }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }), toast: () => {} }));

// ─── 1 · Tempo real ───────────────────────────────────────────────────────────
// Ação (nas duas telas) × mensagem que o servidor emite. Conferida na fonte
// das rotas logo abaixo — a tabela do relatório é esta.
const ACOES: { acao: string; rota: string; arquivo: string; mensagens: string[] }[] = [
  { acao: "iniciar impressão / imprimir agora / trocar de máquina", rota: '"/api/items/:id/start-printing"', arquivo: "server/routes/items.ts", mensagens: ["item_updated", "production_started"] },
  { acao: "informar impressas / mandar para acabamento", rota: '"/api/items/:id/start-production"', arquivo: "server/routes/items.ts", mensagens: ["production_started"] },
  { acao: "reservar / mover / devolver reserva (com quantidade)", rota: '"/api/items/:id/maquina-prevista"', arquivo: "server/routes/maquinas.ts", mensagens: ["item_updated"] },
  { acao: "reservar em lote", rota: '"/api/items/bulk-maquina-prevista"', arquivo: "server/routes/maquinas.ts", mensagens: ["item_updated"] },
  { acao: "tirar da impressora / trocar por prioridade", rota: "tirarEColocar", arquivo: "server/routes/maquinas.ts", mensagens: ["item_updated", "production_started"] },
  { acao: "conferir", rota: '"/api/items/:id/confer"', arquivo: "server/routes/items.ts", mensagens: ["item_updated"] },
  { acao: "reaproveitar / corrigir reaproveitamento", rota: '"/api/items/:id/mark-reuse"', arquivo: "server/routes/items.ts", mensagens: ["item_updated"] },
  { acao: "embalar / tirar do tubo / entregar tubo", rota: "tubos", arquivo: "server/routes/tubos.ts", mensagens: ["items_bulk_updated", "tubos_atualizados"] },
  { acao: "liberar peça (Revisão Final)", rota: '"/api/items/:id/creator-review"', arquivo: "server/routes/items.ts", mensagens: ["item_approved"] },
  { acao: "cancelar / devolver em lote", rota: '"/api/items/bulk-cancel"', arquivo: "server/routes/items.ts", mensagens: ["items_bulk_updated"] },
  { acao: "excluir peça", rota: '"/api/items/:id"', arquivo: "server/routes/items.ts", mensagens: ["item_deleted"] },
  { acao: "encerrar / reabrir evento", rota: "event_closed", arquivo: "server/routes/events.ts", mensagens: ["event_closed", "event_reopened"] },
];

describe("1 · tempo real: toda mensagem de peça invalida as DUAS telas", () => {
  it("o servidor emite a mensagem de cada ação", () => {
    for (const a of ACOES) {
      const fonte = ler(a.arquivo);
      expect(fonte, a.acao).toContain(a.rota);
      for (const m of a.mensagens) expect(fonte, `${a.acao} → ${m}`).toContain(`type: "${m}"`);
    }
  });

  it("o mapa: cada mensagem das ações invalida a fila da Gráfica E o retrato de Máquinas (e o resumo)", () => {
    const deItem = new Set(ACOES.flatMap((a) => a.mensagens).filter((m) => m !== "tubos_atualizados"));
    for (const m of Array.from(deItem).concat(["production_updated", "event_updated", "event_deleted", "item_sponsor_added", "item_sponsor_removed"])) {
      const chaves = CHAVES_POR_MENSAGEM[m as keyof typeof CHAVES_POR_MENSAGEM] ?? [];
      expect(chaves, m).toContain("/api/items/approved");
      expect(chaves, m).toContain("/api/grafica/maquinas");
      expect(chaves, m).toContain("/api/grafica/maquinas/relatorio");
    }
    // O que ANTES faltava: liberada, lote e exclusão (Máquinas) e o evento alterado (as duas).
    expect(CHAVES_POR_MENSAGEM.item_approved).toContain("/api/grafica/maquinas");
    expect(CHAVES_POR_MENSAGEM.items_bulk_updated).toContain("/api/grafica/maquinas");
    expect(CHAVES_POR_MENSAGEM.item_deleted).toContain("/api/items/approved");
    // As chaves que dependem do corpo continuam.
    expect(chavesDaMensagem({ type: "tubos_atualizados", eventId: "ev1" })).toContainEqual(["/api/events/ev1/tubos"]);
    expect(chavesDaMensagem({ type: "event_closed", eventId: "ev1" })).toContainEqual(["/api/items", "ev1"]);
  });

  it("o hook montado: a mensagem de um gesto invalida as duas chaves (passando pelo coalescer)", async () => {
    const sockets: any[] = [];
    class SocketFalso { static OPEN = 1; static CONNECTING = 0; readyState = 0; onopen: any; onclose: any; onmessage: any; onerror: any; constructor() { sockets.push(this); } close() {} send() {} }
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("WebSocket", SocketFalso as any);
    try {
      vi.resetModules();
      const { queryClient } = await import("@/lib/queryClient");
      const { useWebSocket } = await import("@/hooks/use-websocket");
      queryClient.clear();
      const hook = renderHook(() => useWebSocket());
      await act(async () => { sockets[0].onopen(); vi.advanceTimersByTime(3000); });
      for (const tipo of ["item_updated", "production_started", "item_approved", "items_bulk_updated", "item_deleted"]) {
        queryClient.setQueryData(["/api/items/approved"], []);
        queryClient.setQueryData(["/api/grafica/maquinas"], {});
        queryClient.setQueryData(["/api/grafica/maquinas", "?dia=2026-09-20"], {});
        await act(async () => { sockets[0].onmessage({ data: JSON.stringify({ type: tipo, item: {} }) }); vi.advanceTimersByTime(2500); });
        expect(queryClient.getQueryState(["/api/items/approved"])?.isInvalidated, `${tipo} → Gráfica`).toBe(true);
        expect(queryClient.getQueryState(["/api/grafica/maquinas"])?.isInvalidated, `${tipo} → Máquinas`).toBe(true);
        expect(queryClient.getQueryState(["/api/grafica/maquinas", "?dia=2026-09-20"])?.isInvalidated, `${tipo} → Máquinas (outro dia)`).toBe(true);
      }
      // A reconexão também revalida o retrato de Máquinas.
      queryClient.setQueryData(["/api/grafica/maquinas"], {});
      await act(async () => { sockets[0].onclose(); vi.advanceTimersByTime(1500); });
      await act(async () => { sockets[1].onopen(); vi.advanceTimersByTime(3000); });
      expect(queryClient.getQueryState(["/api/grafica/maquinas"])?.isInvalidated).toBe(true);
      hook.unmount();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("as mutações das duas telas usam a MESMA invalidação (fila + acervo + Máquinas + resumo)", () => {
    expect(CHAVES_DA_MUTACAO).toEqual(["/api/items/approved", "/api/items", "/api/grafica/maquinas", "/api/grafica/maquinas/relatorio"]);
    const GRAFICA = ler("client/src/pages/grafica.tsx");
    const MAQUINAS = ler("client/src/pages/grafica-maquinas.tsx");
    const MODAL = ler("client/src/components/grafica/modal-impressao.tsx");
    const TUBOS = ler("client/src/components/tubos-dialog.tsx");
    // Nenhuma invalidação solta da fila (que esqueceria Máquinas).
    for (const [nome, fonte] of [["grafica", GRAFICA], ["maquinas", MAQUINAS], ["modal", MODAL], ["tubos", TUBOS]] as const) {
      expect(fonte, nome).not.toContain('queryKey: ["/api/items/approved"] })');
      expect(fonte, nome).toContain("invalidarGraficaEMaquinas");
    }
    expect(MODAL).toContain("const invalidarTudo = () => invalidarGraficaEMaquinas();");
  });
});

// ─── O fixture: o mesmo mundo, nas duas formas ────────────────────────────────
const DIA = 86_400_000;
const iso = (d: number) => new Date(Date.now() + d * DIA).toISOString();
const EVENTO = { id: "ev1", name: "Maratona SP", status: "active", startDate: iso(10).slice(0, 10), truckDepartureDate: iso(5), reopenedAt: null, deadlineProducaoGrafica: -3 };
const base = { eventId: "ev1", event: EVENTO, description: "", material: "Lona", finish: "", calculatedM2: "2", isReuse: false, statusChangedAt: iso(-1), productionStartedAt: iso(-0.05) };
/** A fila da Gráfica (/api/items/approved). */
const ITENS = [
  // Em impressão na Impressora 2: 3 de 10.
  { ...base, id: "p1", displayId: "#0101", type: "Backdrop", status: "inProduction", quantity: 10, quantityProduced: 3, printMachine: "2" },
  // DIVIDIDA entre a 3 (1 de 3) e a 4 (0 de 2): uma peça, dois cartões.
  { ...base, id: "p2", displayId: "#0102", type: "Totem", status: "inProduction", quantity: 5, quantityProduced: 1, printMachine: "3", impressaoPorMaquina: { "3": { atrib: 3, impressas: 1 }, "4": { atrib: 2, impressas: 0 } } },
  // Liberada, 20 de 34 reservadas para a Impressora 1.
  { ...base, id: "p3", displayId: "#0103", type: "Placa", status: "approved", quantity: 34, quantityProduced: 0, printMachine: null, maquinaPrevista: "1", reservaPorMaquina: { "1": 20 } },
  // Todas as 10 já saíram da Impressora 1: espera só "Mandar p/ acabamento" — NÃO ocupa.
  { ...base, id: "p4", displayId: "#0104", type: "Banner", status: "inProduction", quantity: 10, quantityProduced: 10, printMachine: "1" },
];
const byId = (id: string) => ITENS.find((i) => i.id === id)! as any;

/** O retrato de Máquinas como o servidor o monta (server/routes/maquinas.ts) a partir das MESMAS peças. */
function retratoDe(itens: any[]) {
  const eventoInfo = { id: EVENTO.id, name: EVENTO.name, status: EVENTO.status, startDate: EVENTO.startDate, reopenedAt: null };
  const peca = (i: any) => ({
    id: i.id, displayId: i.displayId, tipo: i.type, descricao: i.description, evento: EVENTO.name, material: i.material, medida: null, patrocinadores: [],
    quantidade: i.quantity, reuso: i.reuseQty ?? 0, aImprimir: i.quantity - (i.reuseQty ?? 0), impressas: i.quantityProduced ?? 0,
    desde: i.productionStartedAt, maquina: i.printMachine ?? null, status: i.status, miniatura: null, impressaoPorMaquina: i.impressaoPorMaquina ?? null, eventoInfo,
  });
  const emImpressao = itens.filter((i) => i.status === "inProduction");
  const naFila = itens.filter((i) => i.status === "approved" || (i.status === "inProduction" && i.impressaoPorMaquina));
  const daFila = (i: any) => ({ ...peca(i), maquinaPrevista: i.maquinaPrevista ?? null, reserva: reservaDaPeca(i), pausas: {}, semImpressora: semImpressora(i), imprimindoEm: [], m2: 2, saidaCaminhao: EVENTO.truckDepartureDate, prazoProducaoGrafica: -3 });
  return {
    dia: "2026-09-22", hoje: "2026-09-22",
    maquinas: ["1", "2", "3", "4"].map((codigo) => ({
      codigo, rotulo: rotuloDaMaquina(codigo),
      imprimindo: emImpressao.filter((i) => imprimeNaMaquina(i, codigo)).map((i) => ({ ...peca(i), maquina: codigo, parte: i.impressaoPorMaquina?.[codigo] ?? null })),
      naFila: naFila.filter((i) => (reservaDaPeca(i)[codigo] ?? 0) > 0).map((i) => ({ ...daFila(i), maquinaPrevista: codigo, reservadas: reservaDaPeca(i)[codigo], pausadaEm: null })),
      registros: [], unidadesNoDia: 0, pecasNoDia: 0,
    })),
    semMaquina: [],
    filaGeral: naFila.map(daFila).filter((p) => p.semImpressora > 0),
  };
}

function prepararJsdom() {
  Object.defineProperty(window, "innerWidth", { value: 1600, configurable: true });
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
  (Element.prototype as any).scrollIntoView = () => {};
  (Element.prototype as any).hasPointerCapture = () => false;
  (Element.prototype as any).releasePointerCapture = () => {};
  const retrato = retratoDe(ITENS);
  vi.stubGlobal("fetch", async (url: any) => {
    const u = String(url);
    const corpo = u.startsWith("/api/items/approved") ? ITENS : u.startsWith("/api/grafica/maquinas") && !u.includes("relatorio") ? retrato : [];
    return new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
  });
}
const $ = (s: string) => document.querySelector<HTMLElement>(s);
const tick = (ms = 0) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

async function montarGrafica(url = "/grafica") {
  prepararJsdom();
  window.history.replaceState({}, "", url);
  const { queryClient } = await import("@/lib/queryClient");
  const Grafica = (await import("@/pages/grafica")).default;
  queryClient.clear();
  queryClient.setQueryData(["/api/items/approved"], ITENS);
  queryClient.setQueryData(["/api/standard-items"], []);
  queryClient.setQueryData(["/api/tubos"], []);
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Grafica as any, null))); });
  await tick(300);
}
async function montarMaquinas(url = "/grafica/maquinas") {
  prepararJsdom();
  window.history.replaceState({}, "", url);
  const { queryClient } = await import("@/lib/queryClient");
  const Pagina = (await import("@/pages/grafica-maquinas")).default;
  queryClient.clear();
  queryClient.setQueryData(["/api/grafica/maquinas"], retratoDe(ITENS));
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Pagina as any, null))); });
  await tick(50);
}

beforeEach(() => { vi.resetModules(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// ─── 2 · Mesmos dados, mesmos números ─────────────────────────────────────────
describe("2 · a régua única (pura)", () => {
  it("progresso, fila e ocupação saem das mesmas funções", () => {
    expect(numerosDaImpressao(byId("p1")).frase).toBe("3 de 10 impressas · 7 na impressora");
    expect(numerosDaImpressao(byId("p2"), "3").frase).toBe("1 de 3 impressa · 2 na impressora");
    expect(numerosDaImpressao(byId("p2")).onde).toBe(`${rotuloDaMaquina("3")} · 1 de 3 un. / ${rotuloDaMaquina("4")} · 0 de 2 un.`);
    expect(fraseDaFila(byId("p3"))).toBe(`Fila: ${rotuloDaMaquina("1")} (20) · 14 sem impressora`);
    // A peça 10 de 10 NÃO ocupa a Impressora 1 — a mesma régua do servidor (ocupanteDaImpressora).
    const o = ocupacaoDasImpressoras(ITENS.filter((i) => i.status === "inProduction") as any);
    expect(Object.keys(o).sort()).toEqual(["2", "3", "4"]);
    expect(o["2"]).toMatchObject({ id: "p1", displayId: "#0101", impressas: 3, teto: 10 });
    // De qual impressora é a peça: a dividida é da 3 E da 4; a reservada, da 1.
    expect(impressorasDaPeca(byId("p2"))).toEqual(["3", "4"]);
    expect(impressorasDaPeca(byId("p3"))).toEqual(["1"]);
    const so4 = { ...FILTROS_VAZIOS, impressora: ["4"] };
    const ctx = { groupOf: () => "", hojeUTC: Date.UTC(2026, 8, 22) };
    expect(itemCasaFiltros(byId("p2"), so4, ctx)).toBe(true);
    expect(itemCasaFiltros(byId("p1"), so4, ctx)).toBe(false);
  });
});

describe("2 · as duas telas montadas com o MESMO fixture dizem o mesmo", () => {
  it("Gráfica: progresso, divisão, selo da fila e contagens", async () => {
    await montarGrafica();
    expect($('[data-testid="progresso-impressao-p1"]')!.textContent).toContain(numerosDaImpressao(byId("p1")).frase);
    expect($('[data-testid="progresso-impressao-p2"]')!.textContent).toContain(numerosDaImpressao(byId("p2")).onde!);
    expect($('[data-testid="row-item-p3"]')!.textContent).toContain(fraseDaFila(byId("p3"))!);
    // "Em Impressão" = 3 peças (a dividida conta UMA vez); "Liberados" = 1.
    expect($('[data-testid="stat-production"]')!.getAttribute("aria-label")).toBe("Filtrar por Em Impressão — 3 peças");
    expect($('[data-testid="stat-approved"]')!.getAttribute("aria-label")).toBe("Filtrar por Liberados — 1 peças");
  });

  it("Máquinas: o mesmo progresso nos cartões e as mesmas contagens", async () => {
    await montarMaquinas();
    expect($('[data-testid="progresso-p1"]')!.textContent).toBe(numerosDaImpressao(byId("p1")).frase);
    // A dividida: cada cartão com a SUA parte e o total da peça.
    const cartao3 = $('[data-testid="maquina-agora-3"]')!;
    expect(cartao3.querySelector('[data-testid="progresso-p2"]')!.textContent).toBe("1 de 3 nesta impressora · peça 1 de 5 no total");
    // "Agora · 3 peças em impressão" — o mesmo 3 do card da Gráfica (antes: 4, a dividida contava duas vezes).
    expect($('[data-testid="resumo-agora"]')!.textContent).toBe("3 peças em impressão");
    expect($('[data-testid="relacao-liberados"]')!.textContent).toContain('1 peça liberada ao todo — é o "Liberados" da Gráfica.');
  });

  it("o MESMO modal com as MESMAS ocupadas: a Impressora 2 (com a #0101) ocupada, a 1 (10 de 10) livre — nas duas telas", async () => {
    const ocupadasNoModal = () => ["1", "2", "3", "4"].map((m) => [m, $(`[data-testid="maquina-${m}"]`)?.getAttribute("data-ocupada") ?? null]);
    await montarGrafica();
    await act(async () => { fireEvent.click($('[data-testid="button-production-p3"]')!); });
    await tick(30);
    const naGrafica = ocupadasNoModal();
    // As ações do modal: imprimir no lugar (na ocupada) e só reservar (na livre).
    await act(async () => { fireEvent.click($('[data-testid="maquina-2"]')!); });
    expect($('[data-testid="troca-no-modal"]')!.textContent).toContain("Tirar #0101");
    expect($('[data-testid="button-imprimir-no-lugar"]')).not.toBeNull();
    await act(async () => { fireEvent.click($('[data-testid="maquina-3"]')!); });
    await act(async () => { fireEvent.click($('[data-testid="maquina-1"]')!); });
    // 20 já reservadas na 1 viram o padrão do campo; só as 14 SEM impressora podem ser reservadas.
    expect($('[data-testid="button-so-reservar"]')!.textContent).toBe("Só reservar (até 14 un. sem impressora)");
    expect(($('[data-testid="button-so-reservar"]') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fireEvent.change($('[data-testid="input-quantidade-iniciar"]')!, { target: { value: "5" } }); });
    expect($('[data-testid="button-so-reservar"]')!.textContent).toBe(`Só reservar 5 un. para a ${rotuloDaMaquina("1")}`);
    expect(($('[data-testid="button-so-reservar"]') as HTMLButtonElement).disabled).toBe(false);
    cleanup();
    await montarMaquinas();
    await act(async () => { fireEvent.click($('[data-testid="button-iniciar-fila-p3"]')!); });
    await tick(30);
    const emMaquinas = ocupadasNoModal();
    expect(naGrafica).toEqual([["1", null], ["2", "#0101"], ["3", "#0102"], ["4", "#0102"]]);
    expect(emMaquinas).toEqual(naGrafica);
    // Em Máquinas, a mesma troca na ocupada (a reservada já está na fila: sem "Só reservar").
    await act(async () => { fireEvent.click($('[data-testid="maquina-2"]')!); });
    expect($('[data-testid="troca-no-modal"]')!.textContent).toContain("Tirar #0101");
  });
});

// ─── 3 · Mesmas ações ─────────────────────────────────────────────────────────
describe("3 · a peça em impressão tem as mesmas ações nas duas telas", () => {
  it("na Gráfica, o modal da peça em impressão oferece Tirar da impressora e Trocar de máquina (como o cartão)", async () => {
    await montarGrafica();
    await act(async () => { fireEvent.click($('[data-testid="button-production-p1"]')!); });
    await tick(30);
    expect($('[data-testid="button-trocar-maquina"]')).not.toBeNull();
    await act(async () => { fireEvent.click($('[data-testid="button-tirar-da-impressora"]')!); });
    expect($('[data-testid="confirmar-tirar"]')!.textContent).toContain("3 de 10 ficam anotadas; 7 voltam para o topo da fila dela");
  });
  it("e o cartão de Máquinas continua com Impressas, Trocar de máquina, Tirar da impressora e Ver na Gráfica", async () => {
    await montarMaquinas();
    for (const t of ["button-impressas-p1", "button-trocar-maquina-p1", "button-tirar-da-impressora-p1", "link-peca-grafica-p1"]) expect($(`[data-testid="${t}"]`), t).not.toBeNull();
  });
});

// ─── 4 · Ida e volta ──────────────────────────────────────────────────────────
describe("4 · navegação entre as telas, com o recorte certo", () => {
  it("os links", () => {
    expect(linkDaImpressoraEmMaquinas("2", "p1")).toBe("/grafica/maquinas?foco=2&item=p1");
    expect(linkDaPecaNaGrafica("p1")).toBe("/grafica?item=p1");
    expect(linkDaImpressoraNaGrafica("3")).toBe("/grafica?impressora=3");
  });

  it("Gráfica → Máquinas: a impressora na linha leva ao cartão dela, com a peça", async () => {
    await montarGrafica();
    expect($('[data-testid="link-ver-na-maquina-p1"]')!.getAttribute("href")).toBe("/grafica/maquinas?foco=2&item=p1");
  });

  it("Máquinas com ?foco=2&item=p1: o cartão e a peça em foco; os links de volta", async () => {
    await montarMaquinas("/grafica/maquinas?foco=2&item=p1");
    expect($('[data-testid="maquina-agora-2"]')!.getAttribute("data-em-foco")).toBe("true");
    expect($('[data-testid="peca-na-maquina-p1"]')!.getAttribute("data-em-foco")).toBe("true");
    expect($('[data-testid="maquina-agora-1"]')!.getAttribute("data-em-foco")).toBeNull();
    expect($('[data-testid="link-peca-grafica-p1"]')!.getAttribute("href")).toBe("/grafica?item=p1");
    expect($('[data-testid="link-impressora-na-grafica-3"]')!.getAttribute("href")).toBe("/grafica?impressora=3");
  });

  it("Gráfica com ?item=p1 põe a peça na busca; com ?impressora=4 mostra a dividida (como o cartão da 4) e o link leva ao cartão", async () => {
    await montarGrafica("/grafica?item=p1");
    await tick(50);
    expect(($('[data-testid="input-search-filter"]') as HTMLInputElement).value).toBe("#0101");
    cleanup();
    await montarGrafica("/grafica?impressora=4");
    expect($('[data-testid="row-item-p2"]')).not.toBeNull();
    expect($('[data-testid="row-item-p1"]')).toBeNull();
    expect($('[data-testid="link-maquinas"]')!.getAttribute("href")).toBe("/grafica/maquinas?foco=4");
  });
});
