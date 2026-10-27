// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// PEÇAS SEM APROVAÇÃO NA ENTRADA RÁPIDA E NOS RASCUNHOS (Pedro/dono, 26/10).
//
// A Entrada rápida é o caminho principal da Solicitação para lançar peças — e
// não tinha as duas marcas que o formulário de uma peça já tinha. Conferido:
//   · as colunas "Sem patrocínio" e "Arte do cliente" só existem para quem
//     marca (PAPEIS_QUE_MARCAM = admin|Solicitação) — a Arte não as vê;
//   · o corpo do lote leva skipApproval/arteDoCliente por linha;
//   · a linha "Gráfica" (produção interna) trava as marcas, com o porquê, e
//     marcá-la limpa as marcas que a linha tinha;
//   · a revisão do lote mostra os selos e o efeito no prazo;
//   · o card de rascunhos do Detalhe do Evento oferece "Marcar sem aprovação"
//     em lote (o MarcarSemAprovacaoDialog da Vinculação), só para quem marca.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { readFileSync } from "fs";
import path from "path";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;
vi.setConfig({ testTimeout: 120_000 });

const avisos: { title?: string; description?: string; variant?: string }[] = [];
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (t: any) => { avisos.push(t); }, dismiss: () => {}, toasts: [] }), toast: (t: any) => { avisos.push(t); } }));

const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const tid = (id: string) => $(`[data-testid="${id}"]`);
const tick = (ms = 0) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

function prepararJsdom(largura: number) {
  Object.defineProperty(window, "innerWidth", { value: largura, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 900, configurable: true });
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: /max-width:\s*767px/.test(q) && largura < 768, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } })));
  (Element.prototype as any).scrollIntoView = () => {};
  (Element.prototype as any).hasPointerCapture = () => false;
  (Element.prototype as any).releasePointerCapture = () => {};
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); avisos.length = 0; });

const MODELOS = [
  { id: "m1", name: "Faixa", type: "Faixa", area: 2, visual: 0.5, visualWidth: 2, visualHeight: 0.5, fileWidth: 2, fileHeight: 0.5, material: "Lona", finish: "Ilhós" },
];

/** A grade como o modal a monta para o papel (o MESMO gate do modal). */
async function montarGrade(papel: string) {
  prepararJsdom(1366);
  const { queryClient } = await import("@/lib/queryClient");
  const { BulkItemEntry } = await import("@/components/bulk-item-entry");
  const { PAPEIS_QUE_MARCAM } = await import("@shared/prazo-sem-aprovacao");
  const { mostraCampoProducaoInterna } = await import("@shared/producao-interna");
  queryClient.clear();
  queryClient.setQueryData(["/api/catalog-options"], []);
  const onSubmit = vi.fn();
  await act(async () => {
    render(h(QueryClientProvider, { client: queryClient } as any, h(BulkItemEntry as any, {
      eventId: "e1", standardItems: MODELOS, sponsors: [], existingItems: [],
      onSubmit, onCancel: () => {},
      podePriorizar: papel === "admin" || papel === "solicitacao",
      podeProducaoInterna: mostraCampoProducaoInterna(papel),
      podeMarcarSemAprovacao: PAPEIS_QUE_MARCAM.includes(papel),
    })));
  });
  await tick(50);
  return { onSubmit };
}

async function escolherTipo(ri: number, tipo: string) {
  const el = $(`[data-nav-row="${ri}"][data-nav-field="0"]`) as HTMLInputElement;
  await act(async () => { fireEvent.focus(el); fireEvent.change(el, { target: { value: tipo } }); });
  await act(async () => { fireEvent.keyDown(el, { key: "Enter" }); });
}
async function digitar(id: string, valor: string) {
  await act(async () => { fireEvent.change(tid(id)!, { target: { value: valor } }); });
}
async function clicar(id: string) { await act(async () => { fireEvent.click(tid(id)!); }); }
async function novaLinha() { await clicar("button-add-row"); }
const cabecalhos = () => Array.from(document.querySelectorAll("th")).map((th) => th.textContent ?? "");

describe("Entrada rápida: as colunas “Sem patrocínio” e “Arte do cliente”", () => {
  it("aparecem para a Solicitação (e o admin), com o nome inteiro e o efeito", async () => {
    for (const papel of ["solicitacao", "admin"]) {
      await montarGrade(papel);
      expect(tid("checkbox-sem-patrocinio-0")).not.toBeNull();
      expect(tid("checkbox-arte-do-cliente-0")).not.toBeNull();
      // o cabeçalho curto + o nome inteiro para leitor de tela
      expect(cabecalhos().some((t) => t.includes("Sem patroc.") && t.includes("Sem patrocínio"))).toBe(true);
      expect(cabecalhos().some((t) => t.includes("Arte cliente") && t.includes("Arte do cliente"))).toBe(true);
      const th = Array.from(document.querySelectorAll("th")).find((t) => t.textContent?.includes("Sem patrocínio"))!;
      expect(th.getAttribute("title")).toMatch(/não passa pela Aprovação; prazo de Layout \+ 7 dias da Aprovação/);
      expect(tid("checkbox-arte-do-cliente-0")!.getAttribute("aria-label")).toBe("Arte do cliente, linha 1");
      cleanup();
    }
  });

  it("não aparecem para a Arte (nem para outros papéis)", async () => {
    for (const papel of ["arte", "atendimento", "grafica"]) {
      await montarGrade(papel);
      expect(tid("checkbox-sem-patrocinio-0")).toBeNull();
      expect(tid("checkbox-arte-do-cliente-0")).toBeNull();
      expect(cabecalhos().some((t) => t.includes("Sem patrocínio") || t.includes("Arte do cliente"))).toBe(false);
      cleanup();
    }
  });

  it("o modal passa o gate do servidor (PAPEIS_QUE_MARCAM) para a grade", () => {
    const fonte = ler("client/src/components/detalhe-do-evento/modal-de-entrada-de-pecas.tsx");
    expect(fonte).toContain("podeMarcarSemAprovacao={PAPEIS_QUE_MARCAM.includes(String(user?.role ?? \"\"))}");
  });

  it("a grade ganha largura para as duas colunas (a rolagem lateral do celular continua)", () => {
    const fonte = ler("client/src/components/bulk-item-entry.tsx");
    expect(fonte).toMatch(/970 \+ \(podeProducaoInterna \? 62 : 0\) \+ \(podeMarcarSemAprovacao \? 132 : 0\)/);
    // fora da navegação do Enter, como a "Gráfica": o Tab passa por elas
    expect(fonte).not.toMatch(/data-nav-field="(sp|ac)"/);
  });

  it("o corpo do lote leva as marcas por linha; a revisão mostra os selos e o efeito", async () => {
    const { onSubmit } = await montarGrade("solicitacao");
    // 1: Sem patrocínio · 2: as duas · 3: nenhuma
    await escolherTipo(0, "Faixa");
    await digitar("input-description-0", "Fila");
    await clicar("checkbox-sem-patrocinio-0");
    await novaLinha();
    await escolherTipo(1, "Faixa");
    await digitar("input-description-1", "Staff");
    await clicar("checkbox-sem-patrocinio-1");
    await clicar("checkbox-arte-do-cliente-1");
    await novaLinha();
    await escolherTipo(2, "Faixa");
    await digitar("input-description-2", "Master");

    await clicar("button-submit-bulk");
    await tick(50);
    expect(tid("revisao-lote-sem-aprovacao")?.textContent).toMatch(/^2 peças sem aprovação — não passam pela Aprovação; o prazo de Layout ganha 7 dias corridos\./);
    expect(tid("revisao-lote-sem-aprovacao")?.textContent).toContain("A de “Arte do cliente” espera o arquivo em Layout");
    expect(document.querySelectorAll('[data-testid="selo-sem-patrocinio"]').length).toBe(2);
    expect(document.querySelectorAll('[data-testid="selo-arte-do-cliente"]').length).toBe(1);
    // na revisão, o selo diz a marca ("Arte cliente"), não o subestado
    expect(tid("selo-arte-do-cliente")?.textContent).toContain("Arte cliente");

    await clicar("button-confirm-duplicates");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [pecas] = onSubmit.mock.calls[0];
    expect(pecas[0]).toMatchObject({ description: "Fila", skipApproval: true, arteDoCliente: false });
    expect(pecas[1]).toMatchObject({ description: "Staff", skipApproval: true, arteDoCliente: true });
    expect(pecas[2]).toMatchObject({ description: "Master", skipApproval: false, arteDoCliente: false });
  });

  it("sem as colunas (Arte), o corpo não leva marca nenhuma", async () => {
    const { onSubmit } = await montarGrade("arte");
    await escolherTipo(0, "Faixa");
    await clicar("button-submit-bulk");
    await tick(50);
    expect(tid("revisao-lote-sem-aprovacao")).toBeNull();
    await clicar("button-confirm-duplicates");
    const peca = onSubmit.mock.calls[0][0][0];
    expect(peca).not.toHaveProperty("skipApproval");
    expect(peca).not.toHaveProperty("arteDoCliente");
  });
});

describe("Entrada rápida: “Gráfica” e as marcas sem aprovação", () => {
  it("a linha “Gráfica” trava as marcas com o porquê — e marcá-la limpa as que havia", async () => {
    const { onSubmit } = await montarGrade("solicitacao");
    await escolherTipo(0, "Faixa");
    await clicar("checkbox-sem-patrocinio-0");
    await clicar("checkbox-arte-do-cliente-0");
    expect(tid("checkbox-sem-patrocinio-0")!.getAttribute("data-state")).toBe("checked");

    await clicar("checkbox-grafica-0");
    for (const id of ["checkbox-sem-patrocinio-0", "checkbox-arte-do-cliente-0"]) {
      const cx = tid(id) as HTMLButtonElement;
      expect(cx.disabled).toBe(true);
      expect(cx.getAttribute("data-state")).toBe("unchecked");
      expect(cx.closest("label")!.getAttribute("title")).toMatch(/^Marcada “Gráfica”: vai direto para a Gráfica, sem Arte nem Aprovação/);
    }
    // clicar na travada não marca
    await clicar("checkbox-arte-do-cliente-0");
    expect(tid("checkbox-arte-do-cliente-0")!.getAttribute("data-state")).toBe("unchecked");

    await digitar("textarea-instrucoes-grafica-0", "Faixa em lona");
    await clicar("button-submit-bulk");
    await tick(50);
    expect(tid("revisao-lote-sem-aprovacao")).toBeNull();
    await clicar("button-confirm-duplicates");
    const peca = onSubmit.mock.calls[0][0][0];
    expect(peca).toMatchObject({ producaoInterna: true });
    expect(peca).not.toHaveProperty("skipApproval");
    expect(peca).not.toHaveProperty("arteDoCliente");
  });

  it("desmarcar “Gráfica” devolve as marcas à linha", async () => {
    await montarGrade("solicitacao");
    await escolherTipo(0, "Faixa");
    await clicar("checkbox-grafica-0");
    expect((tid("checkbox-sem-patrocinio-0") as HTMLButtonElement).disabled).toBe(true);
    await clicar("checkbox-grafica-0");
    expect((tid("checkbox-sem-patrocinio-0") as HTMLButtonElement).disabled).toBe(false);
    await clicar("checkbox-sem-patrocinio-0");
    expect(tid("checkbox-sem-patrocinio-0")!.getAttribute("data-state")).toBe("checked");
  });

  it("a regra pura: só a linha “Gráfica” recusa; o corpo dela não leva marca", async () => {
    const { motivoDaLinhaSemMarcas, corpoDasMarcasDaLinha } = await import("@/components/entrada-rapida/regras");
    expect(motivoDaLinhaSemMarcas({ producaoInterna: false })).toBeNull();
    expect(motivoDaLinhaSemMarcas({ producaoInterna: true })).toMatch(/Desmarque “Gráfica”/);
    expect(corpoDasMarcasDaLinha({ producaoInterna: true, skipApproval: true, arteDoCliente: true })).toEqual({});
    expect(corpoDasMarcasDaLinha({ producaoInterna: false, skipApproval: false, arteDoCliente: true })).toEqual({ skipApproval: false, arteDoCliente: true });
  });
});

// ─── O card de rascunhos do Detalhe do Evento ────────────────────────────────

const rascunho = (over: Record<string, unknown> = {}) => ({
  id: "r1", displayId: "#0001", eventId: "e1", status: "draft", type: "Faixa", description: "Fila",
  quantity: 1, material: "Lona", finish: "Ilhós", calculatedM2: "1", referenceUrls: [], referenceUrl: null,
  skipApproval: false, arteDoCliente: false, arteRecebidaEm: null, kitRemessaId: null, producaoInterna: false,
  instrucoesGrafica: null, finalFileUrl: null, isReuse: false, createdById: "u1",
  ...over,
});

async function montarCard(papel: string, draftItems = [rascunho(), rascunho({ id: "r2", displayId: "#0002", description: "Staff" }), rascunho({ id: "r3", displayId: "#0003", producaoInterna: true, instrucoesGrafica: "x" })]) {
  prepararJsdom(1366);
  const { queryClient } = await import("@/lib/queryClient");
  const { CardDeRascunhos } = await import("@/components/detalhe-do-evento/card-de-rascunhos");
  queryClient.clear();
  await act(async () => {
    render(h(QueryClientProvider, { client: queryClient } as any, h(CardDeRascunhos as any, {
      draftItems, rascunhosQueEuEnvio: draftItems, showAllDrafts: true, setShowAllDrafts: () => {},
      groupOf: () => "", user: { id: "u1", role: papel }, hasPermission: (r: string | string[]) => [r].flat().includes(papel),
      isMobile: false, canUploadReference: false, canEditLists: true, canDeleteAny: false, eventoFinalizado: false,
      avisoEventoFim: "", isEditBlocked: () => false, motivoEdicaoBloqueada: () => null, handleEditItem: () => {},
      setDeletingItem: () => {}, salvarReferenciasMutation: { mutate: () => {} }, getUploadUrl: async () => ({ method: "PUT", url: "" }),
      enviando: false, setSubmitConfirmOpen: () => {}, abrirEnvioDireto: () => {},
      evento: { id: "e1", truckDepartureDate: "2026-12-01T12:00:00.000Z", deadlineEntregaLayouts: -20 },
    })));
  });
  await tick(20);
}

describe("Detalhe do Evento: “Marcar sem aprovação” no card de rascunhos", () => {
  it("só para quem marca — a Arte não vê o botão nem as caixinhas", async () => {
    await montarCard("arte");
    expect(tid("button-marcar-sem-aprovacao-rascunhos")).toBeNull();
    expect(tid("checkbox-escolher-rascunho-r1")).toBeNull();
    cleanup();
    await montarCard("solicitacao");
    expect(tid("button-marcar-sem-aprovacao-rascunhos")).not.toBeNull();
    expect(tid("checkbox-escolher-rascunho-r1")).not.toBeNull();
  });

  it("sem escolha, o lote vale para os rascunhos marcáveis (a linha “Gráfica” fica de fora, travada com o porquê)", async () => {
    await montarCard("solicitacao");
    const graf = tid("checkbox-escolher-rascunho-r3") as HTMLButtonElement;
    expect(graf.disabled).toBe(true);
    expect(graf.closest("label")!.getAttribute("title")).toMatch(/Vai direto para a Gráfica/);
    expect(tid("button-marcar-sem-aprovacao-rascunhos")!.textContent).toBe("Marcar sem aprovação (todos os 2)");
    await clicar("button-marcar-sem-aprovacao-rascunhos");
    await tick(20);
    const dlg = tid("dialogo-marcas-sem-aprovacao")!;
    expect(dlg).not.toBeNull();
    expect(dlg.textContent).toContain("2 peças");
    // o prazo de Layout normal → ajustado do evento (11/11 → 18/11)
    expect(dlg.textContent).toContain("11/11/2026 → 18/11/2026");
  });

  it("com escolha, o lote é só das escolhidas; aplicar manda o POST de lote", async () => {
    await montarCard("solicitacao");
    await clicar("checkbox-escolher-rascunho-r2");
    expect(tid("button-marcar-sem-aprovacao-rascunhos")!.textContent).toBe("Marcar sem aprovação (1)");
    await clicar("button-marcar-sem-aprovacao-rascunhos");
    await tick(20);
    expect(tid("dialogo-marcas-sem-aprovacao")!.textContent).toContain("1 peça");
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ alteradas: 1, ficaramDeFora: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    await clicar("lote-arte-do-cliente-marcar");
    await clicar("confirmar-marcas-sem-aprovacao");
    await tick(50);
    const chamada = fetchMock.mock.calls.find(([url]) => String(url).includes("/api/items/marcas-sem-aprovacao"));
    expect(chamada).toBeTruthy();
    expect(JSON.parse(String((chamada![1] as RequestInit).body))).toEqual({ itemIds: ["r2"], arteDoCliente: true });
  });

  it("a linha do rascunho mostra os selos das marcas", async () => {
    await montarCard("solicitacao", [rascunho({ skipApproval: true }), rascunho({ id: "r2", displayId: "#0002", arteDoCliente: true })]);
    expect(tid("selo-sem-patrocinio-r1")).not.toBeNull();
    expect(tid("selo-arte-do-cliente-r2")).not.toBeNull();
  });

  it("o Detalhe do Evento passa o evento ao card (o prazo ajustado no diálogo)", () => {
    expect(ler("client/src/pages/event-detail.tsx")).toMatch(/<CardDeRascunhos[\s\S]*?evento=\{event\}[\s\S]*?\/>/);
  });
});
