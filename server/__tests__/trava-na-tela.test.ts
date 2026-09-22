// @vitest-environment jsdom
//
// A TRAVA DA SOLICITAÇÃO NAS TELAS MONTADAS (dono, 21/09): o botão "Travar" só
// para Solicitação/admin; o selo vermelho-escuro com motivo e quem travou; os
// botões de ação desabilitados com o motivo; "Destravar" só para quem pode; o
// filtro "Travadas (N)"; Máquinas com o mesmo selo e sem Iniciar/Reservar; 390px.
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { rotuloDaMaquina } from "@shared/fluxo-peca";

vi.setConfig({ testTimeout: 40_000 });
const h = React.createElement;
const papel = { atual: "grafica" as string };
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", name: "Fulano", email: "x@x", role: papel.atual, mustChangePassword: false }, isLoading: false, logout: () => {} }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }), toast: () => {} }));

const DIA = 86_400_000;
const iso = (d: number) => new Date(Date.now() + d * DIA).toISOString();
const EVENTO = { id: "ev1", name: "Maratona SP", status: "active", startDate: iso(10).slice(0, 10), truckDepartureDate: iso(5), reopenedAt: null, deadlineProducaoGrafica: -3 };
const base = { eventId: "ev1", event: EVENTO, description: "", material: "Lona", finish: "", calculatedM2: "2", isReuse: false, statusChangedAt: iso(-1) };
const TRAVA = { travadaEm: new Date(Date.now() - 2 * 3600_000).toISOString(), travadaPor: "Ana Solicitação", travadaPorId: "u9", travadaMotivo: "Arte vai mudar" };
const ITENS = [
  { ...base, id: "t1", displayId: "#0201", type: "Backdrop", status: "approved", quantity: 10, quantityProduced: 0, ...TRAVA },
  { ...base, id: "t2", displayId: "#0202", type: "Totem", status: "produced", quantity: 4, quantityProduced: 4, ...TRAVA },
  { ...base, id: "l1", displayId: "#0203", type: "Placa", status: "approved", quantity: 6, quantityProduced: 0 },
];

let escritas: { url: string; body: any }[] = [];
function preparar(largura: number) {
  Object.defineProperty(window, "innerWidth", { value: largura, configurable: true });
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: /max-width:\s*767px/.test(q) && largura < 768, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
  (Element.prototype as any).scrollIntoView = () => {};
  (Element.prototype as any).hasPointerCapture = () => false;
  (Element.prototype as any).releasePointerCapture = () => {};
  escritas = [];
  vi.stubGlobal("fetch", async (url: any, init?: any) => {
    const u = String(url);
    if (init?.method && init.method !== "GET") { escritas.push({ url: u, body: init.body ? JSON.parse(String(init.body)) : null }); return new Response("{}", { status: 200, headers: { "content-type": "application/json" } }); }
    const corpo = u.startsWith("/api/items/approved") ? ITENS : [];
    return new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
  });
}
const $ = (s: string) => document.querySelector<HTMLElement>(s);
const tick = (ms = 0) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

async function montarGrafica(largura = 1600, url = "/grafica") {
  preparar(largura);
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

afterEach(() => { cleanup(); vi.unstubAllGlobals(); papel.atual = "grafica"; });

describe("Gráfica com peça travada", () => {
  it("a Gráfica: vê o selo e o motivo, não trava nem destrava, e as ações ficam desabilitadas com o motivo", async () => {
    papel.atual = "grafica";
    await montarGrafica();
    const selo = $('[data-testid="selo-travada-t1"]')!;
    expect(selo.textContent).toBe("Travada: Arte vai mudar · por Ana Solicitação, há 2h");
    expect(selo.style.background).toBe("rgb(127, 29, 29)");
    expect($('[data-testid="button-destravar-t1"]')).toBeNull();
    expect($('[data-testid="button-travar-l1"]')).toBeNull();
    const imprimir = $('[data-testid="button-production-t1"]') as HTMLButtonElement;
    expect(imprimir.disabled).toBe(true);
    expect(imprimir.title).toBe("Peça travada pela Solicitação: Arte vai mudar — fale com Ana Solicitação");
    const conferir = $('[data-testid="button-confer-t2"]') as HTMLButtonElement;
    expect(conferir.disabled).toBe(true);
    // A livre segue livre.
    expect(($('[data-testid="button-production-l1"]') as HTMLButtonElement).disabled).toBe(false);
    // O filtro rápido: "Travadas (2)", na URL.
    const pill = $('[data-testid="button-travadas-filter"]')!;
    expect(pill.textContent).toContain("Travadas (2)");
    await act(async () => { fireEvent.click(pill); });
    await tick(300);
    expect(window.location.search).toContain("travadas=1");
    expect($('[data-testid="row-item-l1"]')).toBeNull();
    expect($('[data-testid="row-item-t1"]')).not.toBeNull();
  });

  it("a Solicitação: 'Travar' abre o modal com motivo obrigatório e chips; 'Destravar' na travada", async () => {
    papel.atual = "solicitacao";
    await montarGrafica();
    await act(async () => { fireEvent.click($('[data-testid="button-travar-l1"]')!); });
    await tick(20);
    const confirmar = () => $('[data-testid="button-confirmar-trava"]') as HTMLButtonElement;
    expect(confirmar().disabled).toBe(true);
    await act(async () => { fireEvent.change($('[data-testid="input-motivo-trava"]')!, { target: { value: "abc" } }); });
    expect(confirmar().disabled).toBe(true);
    expect($('[data-testid="aviso-motivo-trava"]')).not.toBeNull();
    await act(async () => { fireEvent.click($('[data-testid="chip-motivo-Aguardando patrocinador"]')!); });
    expect(confirmar().disabled).toBe(false);
    await act(async () => { fireEvent.click(confirmar()); });
    await tick(20);
    expect(escritas).toContainEqual({ url: "/api/items/l1/travar", body: { motivo: "Aguardando patrocinador" } });
    await act(async () => { fireEvent.click($('[data-testid="button-destravar-t1"]')!); });
    await tick(20);
    expect(escritas.map((e) => e.url)).toContain("/api/items/t1/destravar");
  });

  it("390px: o selo quebra linha e os alvos têm 44px", async () => {
    papel.atual = "solicitacao";
    await montarGrafica(390);
    const selo = $('[data-testid="selo-travada-t1"]')!;
    expect(selo.style.whiteSpace).toBe("normal");
    expect(selo.style.overflowWrap).toBe("anywhere");
    expect(($('[data-testid="button-destravar-t1"]') as HTMLElement).style.minHeight).toBe("44px");
    expect(($('[data-testid="button-travar-l1"]') as HTMLElement).style.minHeight).toBe("44px");
  });
});

describe("Máquinas com peça travada", () => {
  it("a peça travada na fila tem o mesmo selo e não Inicia / Imprime agora / Reserva", async () => {
    preparar(1600);
    window.history.replaceState({}, "", "/grafica/maquinas");
    const { queryClient } = await import("@/lib/queryClient");
    const Pagina = (await import("@/pages/grafica-maquinas")).default;
    queryClient.clear();
    const eventoInfo = { id: "ev1", name: "Maratona SP", status: "active", startDate: EVENTO.startDate, reopenedAt: null };
    const naFila = (id: string, displayId: string, trava: any, maquinaPrevista: string | null) => ({
      id, displayId, tipo: "Backdrop", descricao: "", evento: "Maratona SP", quantidade: 10, reuso: 0, aImprimir: 10, impressas: 0, desde: null, maquina: null,
      status: "approved", miniatura: null, eventoInfo, maquinaPrevista, m2: 2, saidaCaminhao: EVENTO.truckDepartureDate, prazoProducaoGrafica: -3,
      reserva: maquinaPrevista ? { [maquinaPrevista]: 10 } : {}, pausas: {}, semImpressora: maquinaPrevista ? 0 : 10, imprimindoEm: [], ...trava,
    });
    queryClient.setQueryData(["/api/grafica/maquinas"], {
      dia: "2026-09-22", hoje: "2026-09-22",
      maquinas: ["1", "2", "3", "4"].map((codigo) => ({ codigo, rotulo: rotuloDaMaquina(codigo), imprimindo: [], naFila: codigo === "2" ? [{ ...naFila("r1", "#0301", TRAVA, "2"), reservadas: 10, pausadaEm: null }] : [], registros: [], unidadesNoDia: 0, pecasNoDia: 0 })),
      semMaquina: [],
      filaGeral: [naFila("g1", "#0302", TRAVA, null), naFila("g2", "#0303", {}, null)],
    });
    await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Pagina as any, null))); });
    await tick(50);
    const iniciar = $('[data-testid="button-iniciar-fila-r1"]') as HTMLButtonElement;
    expect(iniciar.disabled).toBe(true);
    expect(iniciar.title).toBe("Não dá para iniciar impressão: Peça travada pela Solicitação: Arte vai mudar — fale com Ana Solicitação");
    expect(($('[data-testid="button-reservar-g1"]') as HTMLButtonElement).disabled).toBe(true);
    expect(($('[data-testid="reservar-fila-g1"]') as HTMLSelectElement).disabled).toBe(true);
    expect(($('[data-testid="reservar-fila-g2"]') as HTMLSelectElement).disabled).toBe(false);
    expect(document.body.textContent).toContain("Travada: Arte vai mudar · por Ana Solicitação, há 2h");
  });
});
