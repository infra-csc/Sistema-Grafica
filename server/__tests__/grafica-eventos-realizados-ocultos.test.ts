// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// GRÁFICA SEM AS PEÇAS DE EVENTO REALIZADO, POR PADRÃO (dono, 08/10: "tirar os
// itens de eventos que foram realizados da Gráfica… tem que tirar a
// visualização dele, porque atrapalha, e eles não vão produzir mais").
//
// Reverte, SÓ NA TELA, a regra de 17/08 ("os eventos finalizados devem
// aparecer ainda na Revisão e Gráfica") — a Revisão Final não muda.
//
//   · a peça de evento realizado ou encerrado some da fila e dos cartões de
//     etapa (tabela em 1710 e cartões em 390);
//   · "Mostrar eventos realizados (N)" diz quantas estão escondidas e as traz
//     de volta com o selo; a escolha vai para a URL (?realizados=1);
//   · evento reaberto depois da data volta a contar como vivo;
//   · sem nenhuma escondida, o controle some;
//   · MÁQUINAS: a fila geral (espera por impressora) esconde a de evento
//     finalizado; a que já está numa impressora segue no cartão.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;
vi.setConfig({ testTimeout: 120_000 });

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "u-g", name: "Gil", email: "g@g", role: "grafica", mustChangePassword: false }, isLoading: false, logout: () => {} }),
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
  Object.defineProperty(window, "innerHeight", { value: 900, configurable: true });
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: /max-width:\s*767px/.test(q) && largura < 768, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
  (Element.prototype as any).scrollIntoView = () => {};
  (Element.prototype as any).scrollTo = () => {};
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const DIA = 86_400_000;
const iso = (d: number) => new Date(Date.now() + d * DIA).toISOString();
const evento = (id: string, nome: string, dias: number, over: any = {}) => ({
  id, name: nome, priority: "media", status: "active", manuallyClosed: false,
  startDate: iso(dias).slice(0, 10), truckDepartureDate: iso(dias - 3), reopenedAt: null,
  deadlineListaImagens: -25, deadlineEntregaLayouts: -20, deadlineAprovacaoLayout: -12, deadlineFinalizacao: -10,
  deadlineRevisaoLista: -8, deadlineProducaoGrafica: -1, sponsors: [], items: [], ...over,
});
const VIVO = evento("e1", "Maratona Viva", 15);
const REALIZADO = evento("e2", "Corrida Passada", -5);
const ENCERRADO = evento("e3", "Evento Encerrado", 20, { status: "closed", manuallyClosed: true });
const REABERTO = evento("e4", "Reaberto Depois", -6, { reopenedAt: iso(-1) });
const peca = (id: string, ev: any, over: any = {}) => ({
  id, displayId: `#0${id.replace(/\D/g, "").padStart(3, "0")}`, eventId: ev.id, event: ev, type: "Banner", description: `Banner ${id}`,
  quantity: 2, quantityProduced: 0, conferredQty: 0, deliveredQty: 0, embaladaQty: 0, reuseQty: 0, isReuse: false, isPriority: false,
  material: "Lona", finish: "Ilhós", calculatedM2: "2", visualWidth: "1", visualHeight: "1", fileWidth: "100", fileHeight: "100",
  status: "ready_for_production", skipApproval: false, sponsors: [], observations: "", approvalThumbUrl: null,
  finalFileUrl: "/objects/a.pdf", kitRemessaId: null, parentItemId: null, createdAt: iso(-10), updatedAt: iso(-1), statusChangedAt: iso(-1),
  ...over,
});
const FILA = () => [
  peca("p1", VIVO),
  peca("p2", REALIZADO),
  peca("p3", REALIZADO, { isPriority: true }),
  peca("p4", ENCERRADO),
  peca("p5", REABERTO),
];

async function montarGrafica(largura: number, pecas: any[], busca = "") {
  prepararJsdom(largura);
  vi.stubGlobal("fetch", vi.fn(async (url: any) => new Response(JSON.stringify(String(url).startsWith("/api/items/approved") ? pecas : []), { status: 200, headers: { "content-type": "application/json" } })));
  window.history.replaceState(null, "", `/grafica${busca}`);
  const { queryClient } = await import("@/lib/queryClient");
  const Grafica = (await import("@/pages/grafica")).default;
  queryClient.clear();
  queryClient.setQueryData(["/api/items/approved"], pecas);
  queryClient.setQueryData(["/api/standard-items"], []);
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Grafica as any, null))); });
  await tick(250);
}
const naTela = (id: string) => document.body.innerHTML.includes(`data-testid="button-view-${id}"`) || !!document.querySelector(`[data-item-row="${id}"]`) || document.body.textContent!.includes(`Banner ${id}`);

describe.each([1710, 390])("Gráfica em %ipx — eventos realizados", (largura) => {
  it("escondidas por padrão; o controle diz quantas; reaberto depois da data fica", async () => {
    await montarGrafica(largura, FILA());
    await esperar(() => naTela("p1"), "a peça viva aparece");
    expect(naTela("p5"), "evento reaberto depois da data: vivo").toBe(true);
    for (const id of ["p2", "p3", "p4"]) expect(naTela(id), `${id} de evento finalizado: escondida`).toBe(false);
    const botao = tid("button-realizados-filter");
    expect(botao, "o controle aparece").not.toBeNull();
    expect(botao!.textContent).toContain("Mostrar eventos realizados (3)");
    // Os cartões de etapa contam o que a tela mostra: 2 liberadas, não 5.
    expect(document.body.textContent).toMatch(/Liberados\s*2/i);
  });

  it("o controle traz as escondidas de volta, com o selo, e grava ?realizados=1", async () => {
    await montarGrafica(largura, FILA());
    await esperar(() => !!tid("button-realizados-filter"), "o controle aparece");
    await act(async () => { fireEvent.click(tid("button-realizados-filter")!); });
    await esperar(() => naTela("p2") && naTela("p4"), "as escondidas voltam");
    expect(document.body.textContent).toMatch(/Evento realizado|Evento encerrado/);
    await tick(300);
    expect(window.location.search).toContain("realizados=1");
  });

  it("a URL com ?realizados=1 abre com elas à vista", async () => {
    await montarGrafica(largura, FILA(), "?realizados=1");
    await esperar(() => naTela("p2"), "aparece");
    expect(tid("button-realizados-filter")!.getAttribute("aria-pressed") ?? tid("button-realizados-filter")!.textContent).toBeTruthy();
  });

  it("sem nenhuma de evento finalizado, o controle some", async () => {
    await montarGrafica(largura, [peca("p1", VIVO), peca("p5", REABERTO)]);
    await esperar(() => naTela("p1"), "a peça viva aparece");
    expect(tid("button-realizados-filter")).toBeNull();
  });
});

describe("os filtros na URL", () => {
  it("realizados vai e volta só quando ligado", async () => {
    const { filtrosDaURL, filtrosParaQuery, FILTROS_VAZIOS, contarFiltrosAtivos } = await import("@/lib/grafica-filtros");
    expect(filtrosDaURL("").realizados).toBe(false);
    expect(filtrosDaURL("?realizados=1").realizados).toBe(true);
    expect(filtrosParaQuery("", { ...FILTROS_VAZIOS, realizados: true })).toBe("realizados=1");
    expect(filtrosParaQuery("?realizados=1", FILTROS_VAZIOS)).toBe("");
    // Não é filtro: é o estado natural da tela (como as entregues).
    expect(contarFiltrosAtivos({ ...FILTROS_VAZIOS, realizados: true })).toBe(0);
  });
});

describe("Máquinas: a fila geral esconde; a impressora mantém", () => {
  it("deEventoFinalizado: realizado e encerrado sim; vivo e reaberto depois da data não", async () => {
    const { deEventoFinalizado } = await import("@/components/grafica/maquinas/regras");
    const { todayBusinessMs } = await import("@/lib/status");
    const info = (e: any) => ({ eventoInfo: { id: e.id, name: e.name, status: e.status, startDate: e.startDate, reopenedAt: e.reopenedAt } });
    const hoje = todayBusinessMs();
    expect(deEventoFinalizado(info(REALIZADO), hoje)).toBe(true);
    expect(deEventoFinalizado(info(ENCERRADO), hoje)).toBe(true);
    expect(deEventoFinalizado(info(VIVO), hoje)).toBe(false);
    expect(deEventoFinalizado(info(REABERTO), hoje)).toBe(false);
  });

  it("a tela: a de evento realizado sai da espera; a reservada numa impressora segue no cartão", async () => {
    prepararJsdom(1366);
    const base = (p: any, over: any = {}) => ({
      id: p.id, displayId: p.displayId, tipo: "Banner", descricao: p.description, evento: p.event.name, quantidade: 2, reuso: 0, aImprimir: 2, impressas: 0,
      desde: null, maquina: null, status: "ready_for_production", miniatura: null,
      eventoInfo: { id: p.event.id, name: p.event.name, status: p.event.status, startDate: p.event.startDate, reopenedAt: p.event.reopenedAt },
      maquinaPrevista: null, m2: 2, saidaCaminhao: p.event.truckDepartureDate, prazoProducaoGrafica: -1, reserva: {}, semImpressora: 2, imprimindoEm: [], ...over,
    });
    const [p1, p2, , p4] = FILA();
    const retrato = {
      dia: iso(0).slice(0, 10), hoje: iso(0).slice(0, 10), semMaquina: [],
      maquinas: ["1", "2", "3", "4"].map((codigo) => ({
        codigo, rotulo: `Impressora ${codigo}`, imprimindo: [], registros: [], unidadesNoDia: 0, pecasNoDia: 0,
        naFila: codigo === "1" ? [base(p4, { maquinaPrevista: "1", reservadas: 2, reserva: { "1": 2 }, semImpressora: 0 })] : [],
      })),
      filaGeral: [base(p1), base(p2)],
    };
    vi.stubGlobal("fetch", vi.fn(async (url: any) => new Response(JSON.stringify(String(url).startsWith("/api/grafica/maquinas") && !String(url).includes("relatorio") ? retrato : []), { status: 200, headers: { "content-type": "application/json" } })));
    window.history.replaceState(null, "", "/grafica/maquinas");
    const { queryClient } = await import("@/lib/queryClient");
    const Maquinas = (await import("@/pages/grafica-maquinas")).default;
    queryClient.clear();
    queryClient.setQueryData(["/api/grafica/maquinas"], retrato);
    await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Maquinas as any, null))); });
    await esperar(() => !!tid("fila-peca-p1"), "a viva espera na fila geral");
    expect(tid("fila-peca-p2"), "a de evento realizado sai da espera").toBeNull();
    expect(tid("peca-na-fila-p4"), "a reservada na impressora segue no cartão").not.toBeNull();
    expect(tid("finalizadas-fora-da-fila")!.textContent).toContain("1 peça de evento já realizado ou encerrado fica fora desta fila");
  });
});
