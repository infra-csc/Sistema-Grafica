// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// FECHAMENTO DO EVENTO NAS TELAS (19/10) — os botões aparecem onde a equipe
// procura e chamam a rota certa:
//
//   · GRÁFICA (1710 e 390): com evento escolhido no filtro, a faixa "Fechamento
//     de <evento>" baixa o evento INTEIRO (/api/events/:id/export-xlsx; vários
//     → /api/fechamento-xlsx?eventos=…). O "Exportar Excel" da lista visível
//     continua. Evento realizado escondido: a faixa diz e traz o atalho.
//   · DETALHE DO EVENTO: no "Mais" para todo evento; à vista quando o evento
//     já foi realizado ou encerrado.
//   · RELATÓRIO DO EVENTO: o mesmo botão ao lado de Imprimir.
//   · ACHAR O EVENTO REALIZADO: Eventos ("+N em Encerrados") e Ctrl K já
//     o encontram — conferido aqui para não regredir.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { fonteDoComponente } from "./fonte-dos-componentes";
import { readFileSync } from "fs";
import path from "path";

const h = React.createElement;
vi.setConfig({ testTimeout: 120_000 });

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "u-g", name: "Gil", email: "g@g", role: "grafica", mustChangePassword: false }, isLoading: false, logout: () => {}, hasPermission: () => false }),
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

/** As URLs pedidas ao servidor; a do fechamento responde com um .xlsx. */
let pedidos: string[] = [];
function prepararJsdom(largura: number, json: (url: string) => unknown = () => []) {
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
  (URL as any).createObjectURL = () => "blob:fechamento";
  (URL as any).revokeObjectURL = () => {};
  // A âncora do download: jsdom não navega, e não deve tentar.
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  pedidos = [];
  vi.stubGlobal("fetch", vi.fn(async (url: any) => {
    const u = String(url);
    pedidos.push(u);
    if (u.includes("export-xlsx") || u.startsWith("/api/fechamento-xlsx")) {
      return new Response(new Blob(["xlsx"]), { status: 200, headers: { "content-disposition": `attachment; filename="${encodeURIComponent("Fechamento — X.xlsx")}"` } });
    }
    return new Response(JSON.stringify(json(u)), { status: 200, headers: { "content-type": "application/json" } });
  }));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const DIA = 86_400_000;
const iso = (d: number) => new Date(Date.now() + d * DIA).toISOString();
const evento = (id: string, nome: string, dias: number, over: any = {}) => ({
  id, name: nome, priority: "media", status: "active", manuallyClosed: false,
  startDate: iso(dias).slice(0, 10), truckDepartureDate: iso(dias - 3), reopenedAt: null,
  deadlineListaImagens: -25, deadlineEntregaLayouts: -20, deadlineAprovacaoLayout: -12, deadlineFinalizacao: -10,
  deadlineRevisaoLista: -8, deadlineProducaoGrafica: -1, sponsors: [], items: [], ...over,
});
const VIVO = evento("e1", "Maratona Viva", 15);
const REALIZADO = evento("e2", "Night Run Teresina", -5);
const peca = (id: string, ev: any, over: any = {}) => ({
  id, displayId: `#0${id.replace(/\D/g, "").padStart(3, "0")}`, eventId: ev.id, event: ev, type: "Banner", description: `Banner ${id}`,
  quantity: 2, quantityProduced: 0, conferredQty: 0, deliveredQty: 0, embaladaQty: 0, reuseQty: 0, isReuse: false, isPriority: false,
  material: "Lona", finish: "Ilhós", calculatedM2: "2", visualWidth: "1", visualHeight: "1", fileWidth: "100", fileHeight: "100",
  status: "ready_for_production", skipApproval: false, sponsors: [], observations: "", approvalThumbUrl: null,
  finalFileUrl: "/objects/a.pdf", kitRemessaId: null, parentItemId: null, createdAt: iso(-10), updatedAt: iso(-1), statusChangedAt: iso(-1),
  ...over,
});
const FILA = () => [peca("p1", VIVO), peca("p6", VIVO), peca("p2", REALIZADO), peca("p3", REALIZADO)];

async function montarGrafica(largura: number, busca = "") {
  const pecas = FILA();
  prepararJsdom(largura, (u) => (u.startsWith("/api/items/approved") ? pecas : []));
  window.history.replaceState(null, "", `/grafica${busca}`);
  const { queryClient } = await import("@/lib/queryClient");
  const Grafica = (await import("@/pages/grafica")).default;
  queryClient.clear();
  queryClient.setQueryData(["/api/items/approved"], pecas);
  queryClient.setQueryData(["/api/standard-items"], []);
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Grafica as any, null))); });
  await tick(250);
}
const clicar = async (el: HTMLElement) => { await act(async () => { fireEvent.click(el); }); await tick(50); };

describe.each([1710, 390])("Gráfica em %ipx — exportar o fechamento do evento", (largura) => {
  it("sem evento escolhido: nada de faixa; o Exportar Excel da lista visível segue lá", async () => {
    await montarGrafica(largura);
    await esperar(() => !!tid("button-export-xlsx"), "o Exportar Excel");
    expect(tid("faixa-fechamento")).toBeNull();
  });

  it("com UM evento escolhido: a faixa nomeia o evento e baixa o evento inteiro pela rota do evento", async () => {
    await montarGrafica(largura, "?evento=e1");
    await esperar(() => !!tid("faixa-fechamento"), "a faixa aparece");
    expect(tid("faixa-fechamento-titulo")!.textContent).toBe("Fechamento de Maratona Viva");
    expect(tid("faixa-fechamento")!.textContent).toContain("entregues, reaproveitadas e em trânsito");
    expect(tid("button-export-xlsx"), "o Exportar Excel continua").not.toBeNull();
    await clicar(tid("button-export-fechamento-grafica")!);
    await esperar(() => pedidos.includes("/api/events/e1/export-xlsx"), "chamou a rota do fechamento do evento");
    expect(pedidos.some((u) => u.startsWith("/api/items/export-xlsx")), "não é a exportação da lista visível").toBe(false);
  });

  it("com VÁRIOS eventos: um arquivo só, pela rota do lote", async () => {
    await montarGrafica(largura, "?evento=e1,e2");
    await esperar(() => !!tid("button-export-fechamento-grafica"), "o botão aparece");
    expect(tid("button-export-fechamento-grafica")!.textContent).toContain("Exportar fechamento (2 eventos)");
    await clicar(tid("button-export-fechamento-grafica")!);
    await esperar(() => pedidos.includes("/api/fechamento-xlsx?eventos=e1,e2"), "chamou a rota do lote");
  });

  it("evento REALIZADO escolhido com a fila escondendo-o: a faixa diz quantas estão fora e o atalho as traz", async () => {
    await montarGrafica(largura, "?evento=e2");
    await esperar(() => !!tid("faixa-fechamento-ocultas"), "o aviso das escondidas");
    expect(tid("faixa-fechamento-ocultas")!.textContent).toContain("2 peças estão fora da fila porque o evento já foi realizado");
    // O fechamento não depende de mostrá-las: já leva o evento inteiro.
    expect(tid("button-export-fechamento-grafica")).not.toBeNull();
    await clicar(tid("faixa-fechamento-mostrar-realizados")!);
    await esperar(() => tid("faixa-fechamento-ocultas") === null, "com os realizados à vista, o aviso sai");
    await tick(300);
    expect(window.location.search).toContain("realizados=1");
  });
});

describe("Detalhe do Evento — o fechamento no cabeçalho", () => {
  async function montarAcoes(props: { eventoFinalizado?: boolean; isEventClosed?: boolean; isMobile?: boolean }) {
    prepararJsdom(props.isMobile ? 390 : 1366);
    const { AcoesDoEvento } = await import("@/components/detalhe-do-evento/acoes-do-evento");
    const nada = () => {};
    await act(async () => {
      render(h(AcoesDoEvento as any, {
        eventId: "ev-ter", isMobile: !!props.isMobile, canEditLists: false, canCloseEvent: false,
        isEventClosed: !!props.isEventClosed, eventoFinalizado: !!props.eventoFinalizado, avisoEventoFim: "Evento realizado",
        abrirEntradaDePecas: nada, setImportDialogOpen: nada, setCloneDialogOpen: nada, setCloseDialogOpen: nada,
        setReopenDialogOpen: nada, setDevolverParaArteOpen: nada, setLocation: nada, toast: nada, children: null,
      }));
    });
    await tick(20);
  }
  const abrirMais = async () => {
    const el = tid("button-mais-acoes-evento")!;
    await act(async () => { fireEvent.pointerDown(el, { button: 0, pointerType: "mouse" }); fireEvent.click(el); });
    await tick(30);
  };

  it.each([[false], [true]])("evento REALIZADO (celular=%s): botão à vista que baixa o evento inteiro", async (isMobile) => {
    await montarAcoes({ eventoFinalizado: true, isMobile });
    const b = tid("button-export-fechamento");
    expect(b, "à vista").not.toBeNull();
    await clicar(b!);
    await esperar(() => pedidos.includes("/api/events/ev-ter/export-xlsx"), "chamou a rota do fechamento");
  });

  it("evento ENCERRADO à mão: também à vista", async () => {
    await montarAcoes({ isEventClosed: true });
    expect(tid("button-export-fechamento")).not.toBeNull();
  });

  it("evento em andamento: só no menu Mais, ao lado do Exportar Excel (que segue sendo a especificação)", async () => {
    await montarAcoes({});
    expect(tid("button-export-fechamento")).toBeNull();
    await abrirMais();
    await esperar(() => !!tid("button-export-fechamento-menu"), "o item no Mais");
    expect(tid("button-export-fechamento-menu")!.textContent).toContain("Exportar fechamento (Excel)");
    expect(tid("button-export-xlsx"), "o Exportar Excel de sempre").not.toBeNull();
    await act(async () => { fireEvent.click(tid("button-export-fechamento-menu")!); });
    await esperar(() => pedidos.includes("/api/events/ev-ter/export-xlsx"), "o item chama a rota do fechamento");
  });
});

describe("Relatório do evento — o mesmo botão", () => {
  it.each([[1366], [390]])("em %ipx: ao lado de Imprimir, chama a rota do fechamento do evento", async (largura) => {
    prepararJsdom(largura);
    window.history.replaceState(null, "", "/eventos/ev-ter/relatorio");
    const { queryClient } = await import("@/lib/queryClient");
    const Relatorio = (await import("@/pages/relatorio-evento")).default;
    queryClient.clear();
    queryClient.setQueryData(["/api/events/ev-ter/relatorio"], {
      gerado: { em: iso(0), por: "Gil" },
      evento: { id: "ev-ter", name: "Night Run Teresina", truckDepartureDate: iso(-8), startDate: iso(-5), priority: "media", status: "completed" },
      totais: { pecas: 76, entregues: 76, canceladas: 0 },
      prazo: null, aprovacoes: [],
      fotos: { total: 0, conferencia: 0, entrega: 0, ultimas: [] },
    });
    await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Relatorio as any, null))); });
    await esperar(() => !!tid("button-export-fechamento-relatorio"), "o botão no relatório");
    expect(tid("relatorio-barra")!.contains(tid("button-export-fechamento-relatorio"))).toBe(true);
    await clicar(tid("button-export-fechamento-relatorio")!);
    await esperar(() => pedidos.includes("/api/events/ev-ter/export-xlsx"), "chamou a rota do fechamento");
  });
});

describe("achar o evento realizado (caminho que já existia, conferido)", () => {
  it("Eventos: a busca anuncia \"+N em Encerrados\" com a lista cheia, e o estado vazio traz o botão", () => {
    expect(fonteDoComponente("components/eventos/barra-de-filtros.tsx")).toContain("data-testid=\"button-busca-inclui-ocultos\"");
    expect(fonteDoComponente("components/eventos/lista-de-eventos.tsx")).toContain("data-testid=\"button-incluir-situacoes-ocultas\"");
  });
  it("Ctrl K: a busca de eventos só tira o ARQUIVADO — realizado e encerrado aparecem", () => {
    const busca = readFileSync(path.resolve(process.cwd(), "server/routes/busca.ts"), "utf8");
    expect(busca).toContain(".where(and(ilike(events.name, padraoTexto), isNull(events.arquivadoEm)))");
  });
});
