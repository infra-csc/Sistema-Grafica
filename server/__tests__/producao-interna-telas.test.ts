// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// PRODUÇÃO INTERNA — as telas MONTADAS (dono, 02/10).
//
//   · GRÁFICA (tabela em 1710 e cartão em 390): a peça que veio direto da
//     Solicitação mostra o selo "Produção interna" e as INSTRUÇÕES em
//     destaque, inteiras; a peça comum vizinha não ganha nada disso.
//   · O DIÁLOGO "Enviar direto para a Gráfica": uma peça sem arquivo exige a
//     instrução (botão com o motivo visível); com ela, chama a rota por peça;
//     no lote, a peça com patrocinador aparece "de fora" com o motivo e o
//     envio vai pela rota de lote; o erro do servidor aparece no diálogo.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;
vi.setConfig({ testTimeout: 120_000 });

const U = vi.hoisted(() => ({ user: { id: "u-g", name: "Gil", email: "g@g", role: "grafica", mustChangePassword: false } as any }));
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: U.user, isLoading: false, logout: () => {} }),
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

/** fetch falso: `rota` devolve [status, corpo] ou só o corpo (200). */
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
const INSTR = "Imprimir em lona fosca 1x1 m\ncom ilhós nos 4 cantos";
const peca = (id: string, over: any = {}) => ({
  id, displayId: `#0${id.replace(/\D/g, "").padStart(3, "0")}`, eventId: "e1", event: EVENTO, type: "Banner", description: `Banner ${id}`,
  quantity: 2, quantityProduced: 0, conferredQty: 0, deliveredQty: 0, embaladaQty: 0, reuseQty: 0, isReuse: false,
  material: "Lona", finish: "Ilhós", calculatedM2: "2", visualWidth: "1", visualHeight: "1", fileWidth: "100", fileHeight: "100",
  status: "ready_for_production", skipApproval: false, sponsors: [], observations: "", approvalThumbUrl: null,
  finalFileUrl: null, kitRemessaId: null, parentItemId: null, createdAt: iso(-10), updatedAt: iso(-1), statusChangedAt: iso(-1),
  producaoInterna: false, instrucoesGrafica: null,
  ...over,
});

// ─── GRÁFICA ─────────────────────────────────────────────────────────────────
async function montarGrafica(largura: number, pecas: any[]) {
  prepararJsdom(largura);
  U.user = { id: "u-g", name: "Gil", email: "g@g", role: "grafica", mustChangePassword: false };
  fetchFalso((u) => (u.pathname === "/api/items/approved" ? pecas : []));
  window.history.replaceState(null, "", "/grafica");
  const { queryClient } = await import("@/lib/queryClient");
  const Grafica = (await import("@/pages/grafica")).default;
  queryClient.clear();
  queryClient.setQueryData(["/api/items/approved"], pecas);
  queryClient.setQueryData(["/api/standard-items"], []);
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Grafica as any, null))); });
  await tick(250);
}

describe.each([1710, 390])("Gráfica em %ipx — produção interna", (largura) => {
  it("selo \"Produção interna\" e as instruções em destaque, só na peça marcada", async () => {
    await montarGrafica(largura, [
      peca("p1", { producaoInterna: true, skipApproval: true, instrucoesGrafica: INSTR }),
      peca("p2", { finalFileUrl: "x.pdf", approvalThumbUrl: "/objects/t.png" }),
    ]);
    await esperar(() => !!tid("selo-producao-interna-p1"), "o selo aparece na peça marcada");
    expect(tid("selo-producao-interna-p1")!.textContent).toContain("Produção interna");
    expect(tid("selo-producao-interna-p1")!.getAttribute("title")).toMatch(/faça pelas instruções/);
    const bloco = tid("instrucoes-grafica-p1");
    expect(bloco, "as instruções aparecem").not.toBeNull();
    expect(bloco!.textContent).toContain("Instruções para a Gráfica · sem arquivo");
    // Inteiras, com a quebra de linha (pre-wrap), sem corte.
    expect(bloco!.textContent).toContain("com ilhós nos 4 cantos");
    expect(tid("selo-producao-interna-p2")).toBeNull();
    expect(tid("instrucoes-grafica-p2")).toBeNull();
  });
});

// ─── O DIÁLOGO ───────────────────────────────────────────────────────────────
async function montarDialogo(largura: number, pecas: any[], rota: (u: URL, init?: any) => any) {
  prepararJsdom(largura);
  const escritas = fetchFalso(rota);
  const { queryClient } = await import("@/lib/queryClient");
  const { EnviarDiretoGraficaDialog } = await import("@/components/enviar-direto-grafica-dialog");
  queryClient.clear();
  const aoFechar = vi.fn();
  await act(async () => {
    render(h(QueryClientProvider, { client: queryClient } as any,
      h(EnviarDiretoGraficaDialog, { aberto: true, aoFechar, pecas, papel: "solicitacao", eventId: "e1" })));
  });
  await tick(50);
  return { escritas, aoFechar };
}
const RASCUNHO = (id: string, over: any = {}) => peca(id, { status: "draft", ...over });

describe.each([1366, 390])("Diálogo em %ipx", (largura) => {
  it("uma peça sem arquivo: exige a instrução, depois envia pela rota da peça", async () => {
    const { escritas, aoFechar } = await montarDialogo(largura, [RASCUNHO("p1")], (u, init) =>
      init?.method === "POST" ? { id: "p1", displayId: "#0001", status: "ready_for_production" } : []);
    await esperar(() => !!tid("button-confirmar-direto-grafica"), "o diálogo abre");
    const botao = tid("button-confirmar-direto-grafica") as HTMLButtonElement;
    expect(botao.disabled, "sem instrução e sem arquivo, não envia").toBe(true);
    expect(document.body.textContent).toContain("Escreva as instruções para a Gráfica");
    expect(document.body.textContent).toContain("O que acontece");
    expect(tid("input-arquivo-grafica"), "uma peça: o arquivo opcional aparece").not.toBeNull();

    await act(async () => { fireEvent.change(tid("input-instrucoes-grafica")!, { target: { value: "Cortar e furar nos cantos" } }); });
    expect((tid("button-confirmar-direto-grafica") as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { fireEvent.click(tid("button-confirmar-direto-grafica")!); });
    await esperar(() => escritas().length === 1, "envia");
    expect(escritas()[0]).toEqual({ url: "/api/items/p1/direto-para-grafica", method: "POST", body: { instrucoes: "Cortar e furar nos cantos" } });
    await esperar(() => aoFechar.mock.calls.length > 0, "fecha no sucesso");
    expect(avisos.at(-1)?.title).toBe("Peça enviada direto para a Gráfica");
  });

  it("o caminho do arquivo dispensa a instrução e vai no corpo", async () => {
    const { escritas } = await montarDialogo(largura, [RASCUNHO("p1")], (_u, init) =>
      init?.method === "POST" ? { id: "p1", displayId: "#0001" } : []);
    await esperar(() => !!tid("input-arquivo-grafica"), "o diálogo abre");
    await act(async () => { fireEvent.change(tid("input-arquivo-grafica")!, { target: { value: "\\\\srv\\Grafica\\Banner.tif" } }); });
    expect((tid("button-confirmar-direto-grafica") as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { fireEvent.click(tid("button-confirmar-direto-grafica")!); });
    await esperar(() => escritas().length === 1, "envia");
    expect(escritas()[0].body).toEqual({ finalFileUrl: "\\\\srv\\Grafica\\Banner.tif", finalFileName: "Banner.tif" });
  });

  it("lote: a peça com patrocinador fica de fora com o motivo; envia pela rota de lote", async () => {
    const { escritas } = await montarDialogo(largura, [
      RASCUNHO("p1", { finalFileUrl: "/objects/a.pdf" }),
      RASCUNHO("p2", { instrucoesGrafica: INSTR }),
      RASCUNHO("p3", { sponsors: [{ id: "sp1", name: "Banco" }] }),
    ], (_u, init) => (init?.method === "POST" ? { enviadas: [{ id: "p1", displayId: "#0001" }, { id: "p2", displayId: "#0002" }], ficaramDeFora: [] } : []));
    await esperar(() => !!tid("lista-direto-grafica-fora"), "a lista de fora aparece");
    expect(tid("lista-direto-grafica-fora")!.textContent).toContain("#0003");
    expect(tid("lista-direto-grafica-fora")!.textContent).toMatch(/patrocinador/i);
    expect(tid("input-arquivo-grafica"), "lote não leva arquivo").toBeNull();
    const botao = tid("button-confirmar-direto-grafica") as HTMLButtonElement;
    expect(botao.disabled, "as duas têm arquivo ou instrução própria").toBe(false);
    expect(botao.textContent).toContain("Enviar 2 direto para a Gráfica");
    await act(async () => { fireEvent.click(botao); });
    await esperar(() => escritas().length === 1, "envia o lote");
    expect(escritas()[0]).toEqual({ url: "/api/items/direto-para-grafica", method: "POST", body: { itemIds: ["p1", "p2"] } });
  });

  it("o erro do servidor aparece no diálogo, que fica aberto", async () => {
    const { aoFechar } = await montarDialogo(largura, [RASCUNHO("p1", { finalFileUrl: "/objects/a.pdf" })], (_u, init) =>
      (init?.method === "POST" ? [409, { error: "Tem patrocinador vinculado — peça com patrocinador passa pela Arte e pela aprovação." }] : []));
    await esperar(() => !!tid("button-confirmar-direto-grafica"), "o diálogo abre");
    await act(async () => { fireEvent.click(tid("button-confirmar-direto-grafica")!); });
    await esperar(() => !!tid("erro-direto-grafica"), "o erro aparece");
    expect(tid("erro-direto-grafica")!.textContent).toContain("Tem patrocinador vinculado");
    expect(aoFechar).not.toHaveBeenCalled();
  });
});

// ─── O BLOCO DO FORMULÁRIO ───────────────────────────────────────────────────
describe("o bloco 'Vai direto para a Gráfica' do formulário", () => {
  it("o corpo do POST/PATCH nunca manda arquivo vazio (apagaria o arquivo final da Arte)", async () => {
    const { corpoDaProducaoInterna, CAMPOS_VAZIOS_DA_PRODUCAO_INTERNA, camposDaProducaoInternaDaPeca, mostraCampoProducaoInterna } = await import("@/components/campo-producao-interna");
    expect(corpoDaProducaoInterna(CAMPOS_VAZIOS_DA_PRODUCAO_INTERNA)).toEqual({ producaoInterna: false });
    expect(corpoDaProducaoInterna({ ...CAMPOS_VAZIOS_DA_PRODUCAO_INTERNA, producaoInterna: true, instrucoesGrafica: "  Cortar  " }))
      .toEqual({ producaoInterna: true, instrucoesGrafica: "Cortar" });
    expect(corpoDaProducaoInterna({ producaoInterna: true, instrucoesGrafica: "", arquivoGrafica: "\\srv\a.tif", arquivoGraficaNome: "a.tif" }))
      .toEqual({ producaoInterna: true, instrucoesGrafica: null, finalFileUrl: "\\srv\a.tif", finalFileName: "a.tif" });
    expect(camposDaProducaoInternaDaPeca({ producaoInterna: true, instrucoesGrafica: "x" })).toMatchObject({ producaoInterna: true, instrucoesGrafica: "x" });
    expect(mostraCampoProducaoInterna("solicitacao")).toBe(true);
    expect(mostraCampoProducaoInterna("solicitacao", "awaiting_linking")).toBe(false);
    expect(mostraCampoProducaoInterna("arte")).toBe(false);
  });

  it("marcar revela instruções e arquivo; com patrocinador a caixinha fica bloqueada com o motivo", async () => {
    prepararJsdom(1366);
    const { CampoProducaoInterna, CAMPOS_VAZIOS_DA_PRODUCAO_INTERNA } = await import("@/components/campo-producao-interna");
    function Casca({ temPatrocinador = false }: { temPatrocinador?: boolean }) {
      const [v, setV] = React.useState(CAMPOS_VAZIOS_DA_PRODUCAO_INTERNA);
      return h(CampoProducaoInterna, { valor: v, onChange: setV, temPatrocinador });
    }
    await act(async () => { render(h(Casca)); });
    expect(tid("textarea-instrucoes-grafica")).toBeNull();
    await act(async () => { fireEvent.click(tid("checkbox-producao-interna")!); });
    expect(tid("textarea-instrucoes-grafica")).not.toBeNull();
    expect(tid("input-arquivo-producao-interna")).not.toBeNull();
    expect(document.body.textContent).toContain("(obrigatório sem arquivo)");
    cleanup();
    await act(async () => { render(h(Casca, { temPatrocinador: true })); });
    expect((tid("checkbox-producao-interna") as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).toContain("Desvincule antes de marcar");
  });
});

// ─── A LIGAÇÃO NO DETALHE DO EVENTO (05/10) ──────────────────────────────────
const DRAFT = (id: string, over: any = {}) => peca(id, { status: "draft", observations: null, referenceUrl: null, referenceUrls: null, ...over });

async function montarRascunhos(largura: number, pecas: any[], extra: any = {}) {
  prepararJsdom(largura);
  const { CardDeRascunhos } = await import("@/components/detalhe-do-evento/card-de-rascunhos");
  const abrirEnvioDireto = vi.fn();
  const setSubmitConfirmOpen = vi.fn();
  await act(async () => {
    render(h(CardDeRascunhos as any, {
      draftItems: pecas, rascunhosQueEuEnvio: pecas, showAllDrafts: false, setShowAllDrafts: () => {},
      groupOf: () => "", user: { id: "u1", role: "solicitacao" }, hasPermission: () => false, isMobile: largura < 768,
      canUploadReference: false, canEditLists: true, canDeleteAny: true, eventoFinalizado: false, avisoEventoFim: "",
      isEditBlocked: () => false, motivoEdicaoBloqueada: () => null, handleEditItem: () => {}, setDeletingItem: () => {},
      salvarReferenciasMutation: { mutate: () => {} }, getUploadUrl: async () => ({ method: "PUT", url: "" }),
      enviando: false, setSubmitConfirmOpen, abrirEnvioDireto, ...extra,
    }));
  });
  return { abrirEnvioDireto, setSubmitConfirmOpen };
}

describe.each([1366, 390])("Rascunhos em %ipx — direto para a Gráfica", (largura) => {
  it("selo nas marcadas, ação por peça e o lote das marcadas; o rodapé divide o envio", async () => {
    const { abrirEnvioDireto } = await montarRascunhos(largura, [
      DRAFT("p1", { producaoInterna: true, instrucoesGrafica: INSTR }),
      DRAFT("p2", { producaoInterna: true }),
      DRAFT("p3"),
    ]);
    expect(tid("selo-producao-interna-p1")!.textContent).toContain("Direto para a Gráfica");
    expect(tid("selo-producao-interna-p3")).toBeNull();
    const rodape = tid("texto-envio-rascunhos")!.textContent!;
    expect(rodape).toContain("1 vai para Vincular Patrocinadores");
    expect(rodape).toContain("1 vai direto para a Gráfica");
    expect(rodape).toContain("1 marcada fica aqui");
    // Por peça: a comum também pode ir direto (sem patrocinador).
    expect(tid("button-direto-grafica-p3")!.getAttribute("aria-label")).toContain("direto para a Gráfica");
    await act(async () => { fireEvent.click(tid("button-direto-grafica-p3")!); });
    expect(abrirEnvioDireto.mock.calls[0][0].map((p: any) => p.id)).toEqual(["p3"]);
    // Lote: as marcadas (a completa e a que só precisa da instrução).
    await act(async () => { fireEvent.click(tid("button-direto-grafica-lote")!); });
    expect(abrirEnvioDireto.mock.calls[1][0].map((p: any) => p.id)).toEqual(["p1", "p2"]);
    expect((tid("button-submit-drafts") as HTMLButtonElement).disabled).toBe(false);
  });

  it("só sobrou a marcada sem nada: o envio da lista trava e a frase diz o caminho", async () => {
    await montarRascunhos(largura, [DRAFT("p2", { producaoInterna: true })]);
    expect((tid("button-submit-drafts") as HTMLButtonElement).disabled).toBe(true);
    expect(tid("texto-envio-rascunhos")!.textContent).toContain("Enviar só a marcada");
    expect(tid("button-direto-grafica-lote")).not.toBeNull();
  });

  it("peça com patrocinador e molde não ganham o botão", async () => {
    await montarRascunhos(largura, [DRAFT("p1", { sponsors: [{ id: "s", name: "Banco" }] }), DRAFT("p2", { type: "Molde" })]);
    expect(tid("button-direto-grafica-p1")).toBeNull();
    expect(tid("button-direto-grafica-p2")).toBeNull();
  });
});

describe("a confirmação do envio da lista divide como o servidor", () => {
  it("para a vinculação, direto para a Gráfica e as que ficam, com o motivo", async () => {
    prepararJsdom(1366);
    const { ConfirmarEnvioDialog } = await import("@/components/detalhe-do-evento/confirmar-envio-dialog");
    await act(async () => {
      render(h(ConfirmarEnvioDialog as any, {
        submitConfirmOpen: true, setSubmitConfirmOpen: () => {}, dedo: false, enviando: false, onConfirmar: () => {},
        rascunhosQueEuEnvio: [DRAFT("p1", { producaoInterna: true, finalFileUrl: "/objects/a.pdf" }), DRAFT("p2", { producaoInterna: true }), DRAFT("p3")],
      }));
    });
    await tick(50);
    expect(tid("secao-envio-grafica")!.textContent).toContain("1 peça");
    expect(tid("secao-envio-ficam")!.textContent).toContain("1 peça");
    expect(tid("secao-envio-vinculacao")!.textContent).toContain("1 peça");
    expect(document.body.textContent).toContain("Sem arquivo e sem instruções");
    expect(tid("button-confirm-submit-drafts")!.textContent).toContain("Enviar 2 peças");
  });
});

describe("o diálogo no lote: a marcada sem instrução fica de fora até a instrução comum", () => {
  it("escrever a instrução comum a traz para o envio", async () => {
    const { escritas } = await montarDialogo(1366, [
      RASCUNHO("p1", { producaoInterna: true, instrucoesGrafica: INSTR }),
      RASCUNHO("p2", { producaoInterna: true }),
    ], (_u, init) => (init?.method === "POST" ? { enviadas: [], ficaramDeFora: [] } : []));
    await esperar(() => !!tid("lista-direto-grafica-fora"), "a de fora aparece");
    expect(tid("lista-direto-grafica-fora")!.textContent).toContain("#0002");
    await act(async () => { fireEvent.change(tid("input-instrucoes-grafica")!, { target: { value: "Faixa 2x0,5 m, texto FILA" } }); });
    expect(tid("lista-direto-grafica-fora")).toBeNull();
    expect(tid("button-confirmar-direto-grafica")!.textContent).toContain("Enviar 2 direto");
    await act(async () => { fireEvent.click(tid("button-confirmar-direto-grafica")!); });
    await esperar(() => escritas().length === 1, "envia o lote");
    expect(escritas()[0].body).toEqual({ itemIds: ["p1", "p2"], instrucoes: "Faixa 2x0,5 m, texto FILA" });
  });
});

// ─── A RÉGUA DA FICHA (05/10): etapas PULADAS, não feitas ────────────────────
describe.each([1366, 390])("Ficha em %ipx — régua da produção interna", (largura) => {
  async function montarCabecalho(item: any) {
    prepararJsdom(largura);
    const { CabecalhoDaFicha } = await import("@/components/ficha-da-peca/cabecalho");
    await act(async () => { render(h(CabecalhoDaFicha as any, { item, isMobile: largura < 768, onTransferir: () => {}, onOpenChange: () => {} })); });
  }

  it("peça de produção interna: Vinculação→Revisão vazadas com 'pulada' e o rótulo perto da régua", async () => {
    await montarCabecalho(peca("p1", { producaoInterna: true, status: "ready_for_production" }));
    const puladas = Array.from(document.querySelectorAll<HTMLElement>('[data-pulada="sim"]'));
    expect(puladas).toHaveLength(5);
    expect(puladas[0].getAttribute("title")).toBe("Vinculação: pulada — produção interna");
    expect(tid("trilha-pulada-producao-interna")!.textContent).toContain("Produção interna — pulou da lista para a Gráfica");
  });

  it("peça comum: a régua de sempre, nenhuma pulada", async () => {
    await montarCabecalho(peca("p2", { status: "ready_for_production" }));
    expect(document.querySelectorAll('[data-pulada="sim"]')).toHaveLength(0);
    expect(tid("trilha-pulada-producao-interna")).toBeNull();
  });
});
