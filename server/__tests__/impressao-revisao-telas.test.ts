// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// IMPRESSÃO E MÁQUINAS, TELAS MONTADAS — a revisão adversarial de 22/09.
//
//   3. Números iguais: a linha da Gráfica diz "4 de 28 · 6 na impressora" (o
//      que está NAS partes ativas, como o cartão) e mostra a reserva da peça
//      em impressão ("Fila: Impressora 1 (8)").
//   4. Recuar sempre: a fila da impressora não anuncia como "Próxima" a peça de
//      evento finalizado; ela oferece "Devolver à fila geral", que passa.
//   5. "Tirar da impressora" na Gráfica para a peça TRAVADA (o modal não abre).
//   6. "Imprimir esta no lugar" com a reserva de OUTRA impressora manda `reservaDe`.
//   7. O modal acompanha a lista nova (depois de um 409, o número certo).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { rotuloDaMaquina } from "@shared/fluxo-peca";

vi.setConfig({ testTimeout: 40_000 });
const h = React.createElement;
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", name: "Operador", email: "g@g", role: "grafica", mustChangePassword: false }, isLoading: false, logout: () => {} }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }), toast: () => {} }));

const DIA = 86_400_000;
const iso = (d: number) => new Date(Date.now() + d * DIA).toISOString();
const EVENTO = { id: "ev1", name: "Maratona SP", status: "active", startDate: iso(10).slice(0, 10), truckDepartureDate: iso(5), reopenedAt: null, deadlineProducaoGrafica: -3 };
const base = { eventId: "ev1", event: EVENTO, description: "", material: "Lona", finish: "", calculatedM2: "2", isReuse: false, statusChangedAt: iso(-1), productionStartedAt: iso(-0.05) };
const TRAVA = { travadaEm: new Date(Date.now() - 3600_000).toISOString(), travadaPor: "Ana", travadaPorId: "u9", travadaMotivo: "Arte vai mudar" };
const ITENS = [
  // POR PARTES: 10 na Impressora 2 (4 impressas), 8 reservadas à 1, 10 sem impressora.
  { ...base, id: "p1", displayId: "#0201", type: "Backdrop", status: "inProduction", quantity: 28, quantityProduced: 4, printMachine: "2", impressaoPorMaquina: { "2": { atrib: 10, impressas: 4 } }, reservaPorMaquina: { "1": 8 }, maquinaPrevista: "1" },
  // TRAVADA em impressão na Impressora 3.
  { ...base, id: "p2", displayId: "#0202", type: "Totem", status: "inProduction", quantity: 6, quantityProduced: 1, printMachine: "3", ...TRAVA },
  // Em impressão na Impressora 4: 2 de 10.
  { ...base, id: "p4", displayId: "#0204", type: "Placa", status: "inProduction", quantity: 10, quantityProduced: 2, printMachine: "4" },
];

let escritas: { url: string; metodo: string; body: any }[] = [];
function preparar(corpoGet: (u: string) => unknown) {
  Object.defineProperty(window, "innerWidth", { value: 1600, configurable: true });
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
  (Element.prototype as any).scrollIntoView = () => {};
  (Element.prototype as any).hasPointerCapture = () => false;
  (Element.prototype as any).releasePointerCapture = () => {};
  escritas = [];
  vi.stubGlobal("fetch", async (url: any, init?: any) => {
    const u = String(url);
    if (init?.method && init.method !== "GET") {
      escritas.push({ url: u, metodo: init.method, body: init.body ? JSON.parse(String(init.body)) : null });
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify(corpoGet(u)), { status: 200, headers: { "content-type": "application/json" } });
  });
}
const $ = (s: string) => document.querySelector<HTMLElement>(s);
const tick = (ms = 0) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

async function montarGrafica(itens: any[] = ITENS) {
  preparar((u) => (u.startsWith("/api/items/approved") ? itens : []));
  window.history.replaceState({}, "", "/grafica");
  const { queryClient } = await import("@/lib/queryClient");
  const Grafica = (await import("@/pages/grafica")).default;
  queryClient.clear();
  queryClient.setQueryData(["/api/items/approved"], itens);
  queryClient.setQueryData(["/api/standard-items"], []);
  queryClient.setQueryData(["/api/tubos"], []);
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Grafica as any, null))); });
  await tick(300);
  return queryClient;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Gráfica montada", () => {
  it("[3] a peça por partes: '4 de 28 · 6 na impressora' (o mesmo 'na impressora' do cartão) e o selo da reserva 'Fila: Impressora 1 (8)'", async () => {
    await montarGrafica();
    const progresso = $('[data-testid="progresso-impressao-p1"]')!.textContent!;
    expect(progresso).toContain("4 de 28 impressas · 6 na impressora");
    expect(progresso).not.toContain("24 na impressora");
    expect(progresso).toContain("10 sem impressora");
    const linha = $('[data-testid="row-item-p1"]')!;
    expect(linha.querySelector('[data-testid="selo-fila-impressora"]')!.textContent).toBe(`Fila: ${rotuloDaMaquina("1")} (8)`);
    // A peça em impressão SEM reserva não ganha selo.
    expect($('[data-testid="row-item-p4"]')!.querySelector('[data-testid="selo-fila-impressora"]')).toBeNull();
  });

  it("[5] peça TRAVADA em impressão: o modal não abre, mas 'Tirar da impressora' está na linha e chama o /pausar", async () => {
    await montarGrafica();
    expect(($('[data-testid="button-production-p2"]') as HTMLButtonElement).disabled).toBe(true);
    // A peça livre não ganha o botão (ela tem o modal).
    expect($('[data-testid="tirar-bloqueada-p4"]')).toBeNull();
    const tirar = $('[data-testid="button-tirar-bloqueada-p2-3"]')!;
    expect(tirar.textContent).toContain("Tirar da impressora");
    await act(async () => { fireEvent.click(tirar); });
    expect($('[data-testid="confirmar-tirar-bloqueada-p2-3"]')!.textContent).toContain("1 de 6 ficam anotadas; 5 voltam para a fila dela.");
    await act(async () => { fireEvent.click($('[data-testid="button-confirmar-tirar-bloqueada-p2-3"]')!); });
    await tick(30);
    expect(escritas).toContainEqual({ url: "/api/grafica/maquinas/3/pausar", metodo: "POST", body: { itemId: "p2" } });
  });

  it("[7] o modal de impressão acompanha a fila: um colega lançou impressas → o modal passa a partir do número novo", async () => {
    const qc = await montarGrafica();
    await act(async () => { fireEvent.click($('[data-testid="button-production-p4"]')!); });
    await tick(30);
    await act(async () => { fireEvent.change($('[data-testid="input-quantity-produced"]')!, { target: { value: "3" } }); });
    expect($('[data-testid="linha-da-conta"]')!.textContent).toContain("2 já saíram + 3 agora = 5 de 10");
    // A lista nova chega (o 409 recarrega; ou o eco do lançamento do colega).
    await act(async () => { qc.setQueryData(["/api/items/approved"], ITENS.map((i) => (i.id === "p4" ? { ...i, quantityProduced: 5 } : i))); });
    await tick(50);
    expect($('[data-testid="linha-da-conta"]')!.textContent).toContain("5 já saíram + 3 agora = 8 de 10");
    await act(async () => { fireEvent.click($('[data-testid="button-confirm-production"]')!); });
    await tick(30);
    const lancamento = escritas.find((e) => e.url === "/api/items/p4/start-production")!;
    expect(lancamento.body).toMatchObject({ quantityProduced: 8, expectedProduced: 5 });
  });
});

// ─── Máquinas ────────────────────────────────────────────────────────────────
const eventoInfo = (passado = false) => ({ id: passado ? "ev0" : "ev1", name: passado ? "Corrida de ontem" : "Maratona SP", status: "active", startDate: passado ? iso(-5).slice(0, 10) : EVENTO.startDate, reopenedAt: null });
const pecaDoRetrato = (id: string, displayId: string, extra: Record<string, unknown> = {}) => ({
  id, displayId, tipo: "Backdrop", descricao: "", evento: "Maratona SP", material: "Lona", medida: null, patrocinadores: [],
  quantidade: 10, reuso: 0, aImprimir: 10, impressas: 0, desde: iso(-0.05), maquina: null, status: "approved", miniatura: null,
  impressaoPorMaquina: null, eventoInfo: eventoInfo(), ...extra,
});
const naFila = (id: string, displayId: string, maquina: string, reservadas: number, extra: Record<string, unknown> = {}) => ({
  ...pecaDoRetrato(id, displayId, extra), maquinaPrevista: maquina, reserva: { [maquina]: reservadas }, pausas: {}, semImpressora: 10 - reservadas,
  imprimindoEm: [], m2: 2, saidaCaminhao: EVENTO.truckDepartureDate, prazoProducaoGrafica: -3, reservadas, pausadaEm: null,
});
function retrato(impressasDaP5 = 2) {
  return {
    dia: "2026-09-22", hoje: "2026-09-22",
    maquinas: ["1", "2", "3", "4"].map((codigo) => ({
      codigo, rotulo: rotuloDaMaquina(codigo),
      imprimindo: codigo === "1" ? [{ ...pecaDoRetrato("p5", "#0305", { status: "inProduction", impressas: impressasDaP5 }), maquina: "1", parte: null }] : [],
      naFila: codigo === "2" ? [
        // Pausada no topo, de um evento que JÁ ACONTECEU.
        { ...naFila("pa", "#0301", "2", 5, { eventoInfo: eventoInfo(true), impressas: 5 }), pausadaEm: iso(-0.1) },
        naFila("pb", "#0302", "2", 10),
      ] : [],
      registros: [], unidadesNoDia: 0, pecasNoDia: 0,
    })),
    semMaquina: [],
    filaGeral: [],
  };
}
async function montarMaquinas() {
  let atual = retrato();
  preparar((u) => (u.startsWith("/api/grafica/maquinas") && !u.includes("relatorio") ? atual : []));
  window.history.replaceState({}, "", "/grafica/maquinas");
  const { queryClient } = await import("@/lib/queryClient");
  const Pagina = (await import("@/pages/grafica-maquinas")).default;
  queryClient.clear();
  queryClient.setQueryData(["/api/grafica/maquinas"], atual);
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Pagina as any, null))); });
  await tick(50);
  return { queryClient, trocar: (r: any) => { atual = r; } };
}

describe("Máquinas montada", () => {
  it("[4] a peça de evento finalizado pausada no topo NÃO é a 'Próxima' — a próxima é a primeira que pode entrar; ela só oferece 'Devolver'", async () => {
    await montarMaquinas();
    const pa = $('[data-testid="button-iniciar-fila-pa"]') as HTMLButtonElement;
    const pb = $('[data-testid="button-iniciar-fila-pb"]') as HTMLButtonElement;
    expect(pa.disabled).toBe(true);
    expect(pa.getAttribute("data-proxima")).toBeNull();
    expect(pa.textContent).not.toContain("Próxima");
    expect(pb.getAttribute("data-proxima")).toBe("true");
    expect(pb.textContent).toContain("Próxima: #0302");
    // Mover para outra impressora não (faz andar); devolver sim (recua).
    expect(($('[data-testid="mover-fila-pa"]') as HTMLSelectElement).disabled).toBe(true);
    expect($('[data-testid="button-devolver-fila-pb"]')).toBeNull();
    await act(async () => { fireEvent.click($('[data-testid="button-devolver-fila-pa"]')!); });
    await tick(30);
    expect(escritas).toContainEqual({ url: "/api/items/pa/maquina-prevista", metodo: "PATCH", body: { maquina: null, quantidade: 5, deMaquina: "2" } });
  });

  it("[7] o modal do cartão acompanha o retrato novo: o colega lançou impressas → o modal parte do número novo", async () => {
    const { queryClient, trocar } = await montarMaquinas();
    await act(async () => { fireEvent.click($('[data-testid="button-impressas-p5"]')!); });
    await tick(30);
    await act(async () => { fireEvent.change($('[data-testid="input-quantity-produced"]')!, { target: { value: "1" } }); });
    expect($('[data-testid="linha-da-conta"]')!.textContent).toContain("2 já saíram + 1 agora = 3 de 10");
    trocar(retrato(6));
    await act(async () => { queryClient.setQueryData(["/api/grafica/maquinas"], retrato(6)); });
    await tick(50);
    expect($('[data-testid="linha-da-conta"]')!.textContent).toContain("6 já saíram + 1 agora = 7 de 10");
  });
});

describe("modal de impressão", () => {
  it("[6] 'Imprimir esta no lugar' com a reserva de OUTRA impressora: o corpo leva `reservaDe`", async () => {
    preparar(() => []);
    const { queryClient } = await import("@/lib/queryClient");
    const { ModalImpressao } = await import("@/components/grafica/modal-impressao");
    queryClient.clear();
    // 10 reservadas à Impressora 2; o operador abriu a parte dela e escolheu a 1, ocupada pela #0999.
    const item = { id: "pz", displayId: "#0310", type: "Placa", status: "approved", quantity: 10, quantityProduced: 0, reuseQty: 0, printMachine: null, impressaoPorMaquina: null, reservaPorMaquina: { "2": 10 }, maquinaPrevista: "2" };
    const ocupadas = { "1": { id: "x", displayId: "#0999", impressas: 1, teto: 5, nome: "Backdrop" } };
    await act(async () => {
      render(h(QueryClientProvider, { client: queryClient } as any,
        h(ModalImpressao as any, { item, onFechar: () => {}, maquinaInicial: "2", parteAIniciar: { quantidade: 10, daReserva: true }, ocupadas })));
    });
    await tick(30);
    await act(async () => { fireEvent.click($('[data-testid="maquina-1"]')!); });
    expect($('[data-testid="troca-no-modal"]')).not.toBeNull();
    await act(async () => { fireEvent.click($('[data-testid="button-imprimir-no-lugar"]')!); });
    await tick(30);
    expect(escritas).toContainEqual({ url: "/api/grafica/maquinas/1/trocar", metodo: "POST", body: { tirarItemId: "x", colocarItemId: "pz", quantidade: 10, reservaDe: "2" } });
  });
});
