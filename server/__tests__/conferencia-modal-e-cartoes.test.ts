// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// A TELA DA GRÁFICA MONTADA: o modal de conferência e os cartões da fila.
//
//   · o teto da conferência aparece na tela (6 de 10 impressas → "A Conferir 6"
//     e o aviso do que ainda não saiu da impressora);
//   · foto ainda subindo → o Conferir espera ("Enviando foto…", motivo à vista);
//   · a foto que termina de subir depois de o modal fechar não vai parar na
//     próxima peça;
//   · CONFERIR E EMBALAR: quando a conferência zera o que falta, "Já embalar
//     (volume avulso) com esta foto" vem marcado e faz a segunda ida (a rota de
//     embalar existente, avulso, com a mesma foto);
//   · os cartões "Em Revisão" e "Liberados" contam exatamente o que o clique filtra.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

vi.setConfig({ testTimeout: 60_000 });
const h = React.createElement;

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", name: "Operador", email: "g@g", role: "grafica", mustChangePassword: false }, isLoading: false, logout: () => {} }),
}));
const toasts: any[] = [];
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (t: any) => { toasts.push(t); } }), toast: (t: any) => { toasts.push(t); } }));

// O uploader de verdade sobe por XHR; aqui ele é um botão que COMEÇA o envio
// (avisa "enviando" como o real, por efeito) e guarda o onComplete daquele
// momento — o mesmo fechamento que o hook real usa.
const pendentes: Array<{ onComplete?: (r: { url: string }) => void; fim: () => void }> = [];
vi.mock("@/components/ObjectUploader", () => ({
  ObjectUploader: (props: any) => {
    const [enviando, setEnviando] = React.useState(false);
    React.useEffect(() => { props.onEnviandoMudou?.(enviando); }, [enviando]); // eslint-disable-line react-hooks/exhaustive-deps
    return h("button", {
      type: "button", "data-testid": "fake-upload",
      onClick: () => { setEnviando(true); pendentes.push({ onComplete: props.onComplete, fim: () => setEnviando(false) }); },
    }, props.children);
  },
}));

const DIA = 86_400_000;
const iso = (d: number) => new Date(Date.now() + d * DIA).toISOString();
const EVENTO = { id: "ev1", name: "Maratona SP", status: "active", startDate: iso(10).slice(0, 10), truckDepartureDate: iso(5), reopenedAt: null, deadlineProducaoGrafica: -3 };
const base = { eventId: "ev1", event: EVENTO, description: "", material: "Lona", finish: "", calculatedM2: "2", isReuse: false, reuseQty: 0, conferredQty: 0, deliveredQty: 0, embaladaQty: 0, statusChangedAt: iso(-1) };
const ITENS = [
  // 6 de 10 já saíram da impressora; a peça segue em impressão.
  { ...base, id: "c1", displayId: "#0301", type: "Backdrop", status: "inProduction", quantity: 10, quantityProduced: 6, printMachine: "2", productionStartedAt: iso(-0.1) },
  // Impressa inteira, nada conferido.
  { ...base, id: "c2", displayId: "#0302", type: "Totem", status: "produced", quantity: 3, quantityProduced: 3 },
  // A família da revisão (três grafias) e os liberados (duas grafias + approved).
  { ...base, id: "r1", displayId: "#0310", type: "Placa", status: "awaiting_final_review", quantity: 1, quantityProduced: 0 },
  { ...base, id: "r2", displayId: "#0311", type: "Placa", status: "in_review", quantity: 1, quantityProduced: 0 },
  { ...base, id: "r3", displayId: "#0312", type: "Placa", status: "awaiting_review", quantity: 1, quantityProduced: 0 },
  { ...base, id: "l1", displayId: "#0320", type: "Faixa", status: "pronto_para_producao", quantity: 1, quantityProduced: 0 },
  { ...base, id: "l2", displayId: "#0321", type: "Faixa", status: "approved", quantity: 1, quantityProduced: 0 },
  { ...base, id: "l3", displayId: "#0322", type: "Faixa", status: "ready_for_production", quantity: 1, quantityProduced: 0 },
];

let chamadas: Array<{ metodo: string; url: string; corpo: any }> = [];
function prepararJsdom() {
  Object.defineProperty(window, "innerWidth", { value: 1600, configurable: true });
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
  (Element.prototype as any).scrollIntoView = () => {};
  (Element.prototype as any).hasPointerCapture = () => false;
  (Element.prototype as any).releasePointerCapture = () => {};
  vi.stubGlobal("fetch", async (url: any, init?: RequestInit) => {
    const u = String(url);
    const metodo = (init?.method ?? "GET").toUpperCase();
    if (metodo !== "GET") {
      chamadas.push({ metodo, url: u, corpo: init?.body ? JSON.parse(String(init.body)) : null });
      return new Response(JSON.stringify({ id: "x" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const corpo = u.startsWith("/api/items/approved") ? ITENS : [];
    return new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
  });
}
const $ = (s: string) => document.querySelector<HTMLElement>(s);
const $$ = (s: string) => Array.from(document.querySelectorAll<HTMLElement>(s));
const tick = (ms = 0) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

async function montarGrafica() {
  prepararJsdom();
  window.history.replaceState({}, "", "/grafica");
  const { queryClient } = await import("@/lib/queryClient");
  const Grafica = (await import("@/pages/grafica")).default;
  queryClient.clear();
  queryClient.setQueryData(["/api/items/approved"], ITENS);
  queryClient.setQueryData(["/api/standard-items"], []);
  queryClient.setQueryData(["/api/tubos"], []);
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Grafica as any, null))); });
  await tick(300);
}
const botaoConferir = () => $('[data-testid="button-confirm-conference"]') as HTMLButtonElement;
const terminarEnvio = async (url: string) => {
  const p = pendentes.shift()!;
  await act(async () => { p.onComplete?.({ url }); p.fim(); });
  await tick(10);
};

beforeEach(() => { vi.resetModules(); chamadas = []; pendentes.length = 0; toasts.length = 0; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("o modal de conferência", () => {
  it("mostra o teto: 6 de 10 saíram → 'A Conferir 6' e o aviso do que ainda está na impressora", async () => {
    await montarGrafica();
    await act(async () => { fireEvent.click($('[data-testid="button-confer-c1"]')!); });
    await tick(30);
    expect($('[role="dialog"]')!.textContent).toContain("A Conferir");
    expect($('[data-testid="aviso-conferir-so-impressas"]')!.textContent).toContain("4 un. ainda não foram impressas");
    const qtd = $('#input-qtd-conferir') as HTMLInputElement;
    expect(qtd.max).toBe("6");
    expect(qtd.value).toBe("6");
    // peça que não fecha a conferência inteira nem é embalável agora: sem "Já embalar"
    expect($('[data-testid="opcao-ja-embalar"]')).toBeNull();
  });

  it("foto ainda subindo: o botão diz 'Enviando foto…', fica desabilitado e o motivo aparece", async () => {
    await montarGrafica();
    await act(async () => { fireEvent.click($('[data-testid="button-confer-c2"]')!); });
    await tick(30);
    expect(botaoConferir().textContent).toBe("Falta a foto");
    await act(async () => { fireEvent.click($$('[data-testid="fake-upload"]')[0]); });
    await tick(10);
    expect(botaoConferir().disabled).toBe(true);
    expect(botaoConferir().textContent).toContain("Enviando foto…");
    expect($('#aviso-foto-conferencia')!.textContent).toContain("A foto ainda está subindo");
    await terminarEnvio("/objects/uploads/c2.jpg");
    expect(botaoConferir().disabled).toBe(false);
    expect(botaoConferir().textContent).toBe("Conferir e embalar 3 un.");
  });

  it("a foto que chega depois de o modal fechar NÃO entra na próxima peça", async () => {
    await montarGrafica();
    await act(async () => { fireEvent.click($('[data-testid="button-confer-c2"]')!); });
    await tick(30);
    await act(async () => { fireEvent.click($$('[data-testid="fake-upload"]')[0]); });
    await tick(10);
    // fecha no meio do envio e abre outra peça
    await act(async () => { fireEvent.click(Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "Cancelar")!); });
    await tick(30);
    await act(async () => { fireEvent.click($('[data-testid="button-confer-c1"]')!); });
    await tick(30);
    await terminarEnvio("/objects/uploads/atrasada.jpg");
    expect(botaoConferir().textContent).toBe("Falta a foto");
    expect(document.querySelector('img[src="/objects/uploads/atrasada.jpg"]')).toBeNull();
  });

  it("CONFERIR E EMBALAR: marcado por padrão; confere e embala avulso com a mesma foto", async () => {
    await montarGrafica();
    await act(async () => { fireEvent.click($('[data-testid="button-confer-c2"]')!); });
    await tick(30);
    const caixa = $('[data-testid="checkbox-ja-embalar"]') as HTMLInputElement;
    expect(caixa.checked).toBe(true);
    expect($('[data-testid="opcao-ja-embalar"]')!.textContent).toBe("Já embalar (volume avulso) com esta foto");
    await act(async () => { fireEvent.click($$('[data-testid="fake-upload"]')[0]); });
    await terminarEnvio("/objects/uploads/c2.jpg");
    await act(async () => { fireEvent.click(botaoConferir()); });
    await tick(80);
    const confer = chamadas.find((c) => c.url === "/api/items/c2/confer")!;
    expect(confer.corpo).toMatchObject({ conferencePhotoUrl: "/objects/uploads/c2.jpg", qty: 3 });
    const embalar = chamadas.find((c) => c.url === "/api/events/ev1/tubos")!;
    expect(embalar.corpo).toEqual({ itens: [{ id: "c2", quantidade: 3 }], fotos: ["/objects/uploads/c2.jpg"], avulso: true });
    // a conferência vem ANTES da embalagem
    expect(chamadas.indexOf(confer)).toBeLessThan(chamadas.indexOf(embalar));
    expect(toasts.some((t) => String(t.title).startsWith("Conferida e embalada"))).toBe(true);
  });

  it("desmarcado: só confere (nenhuma ida às rotas de tubo)", async () => {
    await montarGrafica();
    await act(async () => { fireEvent.click($('[data-testid="button-confer-c2"]')!); });
    await tick(30);
    await act(async () => { fireEvent.click($('[data-testid="checkbox-ja-embalar"]')!); });
    await act(async () => { fireEvent.click($$('[data-testid="fake-upload"]')[0]); });
    await terminarEnvio("/objects/uploads/c2.jpg");
    expect(botaoConferir().textContent).toBe("Conferir 3 un.");
    await act(async () => { fireEvent.click(botaoConferir()); });
    await tick(80);
    expect(chamadas.some((c) => c.url === "/api/items/c2/confer")).toBe(true);
    expect(chamadas.some((c) => c.url.includes("/tubos"))).toBe(false);
  });
});

describe("os cartões da fila contam o que o clique filtra", () => {
  it("'Em Revisão' conta as três grafias e o clique mostra as três; 'Liberados' idem com as suas", async () => {
    await montarGrafica();
    expect($('[data-testid="stat-revisao"]')!.getAttribute("aria-label")).toBe("Filtrar por Em Revisão — 3 peças");
    expect($('[data-testid="stat-approved"]')!.getAttribute("aria-label")).toBe("Filtrar por Liberados — 3 peças");
    await act(async () => { fireEvent.click($('[data-testid="stat-revisao"]')!); });
    await tick(50);
    expect($$('[data-testid^="row-item-"]').map((e) => e.getAttribute("data-testid")).sort()).toEqual(["row-item-r1", "row-item-r2", "row-item-r3"]);
    await act(async () => { fireEvent.click($('[data-testid="stat-approved"]')!); });
    await tick(50);
    expect($$('[data-testid^="row-item-"]').map((e) => e.getAttribute("data-testid")).sort()).toEqual(["row-item-l1", "row-item-l2", "row-item-l3"]);
  });
});
