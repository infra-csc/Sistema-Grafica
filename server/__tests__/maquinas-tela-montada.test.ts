// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// A ABA MÁQUINAS MONTADA — e o modal de impressão sem ambiguidade (21/09).
//
// O que este arquivo prende, com a página de verdade no jsdom:
//   1. AGORA: quatro cartões com os nomes do dono, o progresso em palavras
//      ("3 de 10 impressas · 7 na impressora"), "Livre" com o atalho para
//      escolher peça, e a ação que abre o MESMO modal da fila.
//   2. O DIÁRIO: uma lista só, ordenada, com o chip por impressora que filtra
//      e grava na URL; o vazio útil; "mostrar mais" quando passa do lote.
//   3. O MODAL: peça fora da máquina → só a impressora e "Iniciar impressão";
//      peça na máquina → o campo de quantidade e UM botão que diz o que vai
//      acontecer com a diferença ("Mandar 3 para acabamento (4 de 10)").
//   4. PERMISSÃO: a Solicitação vê tudo e não age.
//   5. ESTADOS: silhueta ao carregar, erro com "tentar novamente".
//   6. CELULAR: sem tabela, alvos de 44px, campo de data a 16px.
//
// As frases puras (progresso, botão, diário) são testadas direto — é o que a
// linha da Gráfica, o cartão, a aba e o modal leem.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;

// Papel mutável: a maioria dos casos é a Gráfica; um caso vira Solicitação.
const papel = { atual: "grafica" as string };
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", name: "Operador", email: "g@g", role: papel.atual, mustChangePassword: false }, isLoading: false, logout: () => {} }),
}));

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));
const tick = (ms = 0) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
const px = (v: string | undefined) => parseFloat(String(v ?? "").replace("px", "")) || 0;

const HOJE = "2026-09-21";
const agoraISO = new Date(Date.now() - 80 * 60000).toISOString();

const evento = (name: string) => ({ id: "ev1", name, status: "created", startDate: "2026-12-01T00:00:00Z", reopenedAt: null });
const peca = (id: string, displayId: string, impressas: number, aImprimir: number, maquina: string) => ({
  id, displayId, tipo: "Backdrop", descricao: "lona 440g", evento: "Maratona SP", quantidade: aImprimir, reuso: 0,
  aImprimir, impressas, desde: agraISOFix(), maquina, status: "inProduction", miniatura: null, eventoInfo: evento("Maratona SP"),
});
function agraISOFix() { return agoraISO; }
const registro = (id: string, itemId: string, displayId: string, tipo: string, quantidade: number, totalDepois: number | null, hora: string, ordem: number) => ({
  id, itemId, displayId, tipoPeca: "Backdrop", evento: "Maratona SP", tipo, quantidade, totalDepois, aImprimir: 10, hora, quem: "Ana", ordem,
});

/** Peça liberada, para a fila (geral ou reservada). Saída do caminhão daqui a `diasParaSaida` dias. */
const naFila = (id: string, displayId: string, tipo: string, maquinaPrevista: string | null, diasParaSaida: number, evento = "Maratona SP") => ({
  ...peca(id, displayId, 0, 10, ""), tipo, evento, status: "approved", maquina: null, desde: null, eventoInfo: { ...evento_(evento) },
  maquinaPrevista, m2: 4.5, saidaCaminhao: new Date(Date.now() + diasParaSaida * 86_400_000).toISOString(), prazoProducaoGrafica: -1,
});
function evento_(name: string) { return evento(name); }

function retrato(opts: { registros?: boolean; imprimindo?: boolean; muitos?: number; fila?: boolean } = {}) {
  const { registros = true, imprimindo = true, muitos = 0, fila = false } = opts;
  const filaGeral = fila ? [
    naFila("f2", "#0202", "Banner de rua", null, 9, "Meia do Rio"),
    naFila("f1", "#0201", "Placa de octanorme grande para o pórtico", null, 2),
    naFila("f3", "#0203", "Lona", null, 20),
  ] : [];
  const reservadas2 = fila ? [naFila("f5", "#0205", "Totem", "2", 5), naFila("f4", "#0204", "Backdrop", "2", 1)] : [];
  const regs1 = registros ? [
    registro("r1", "p1", "#0101", "parcial", 3, 3, "10:12", 0),
    registro("r2", "p1", "#0101", "inicio", 0, 0, "09:00", 2),
  ] : [];
  const regs2 = registros ? [registro("r3", "p9", "#0109", "conclusao", 4, 10, "09:40", 1)] : [];
  const extras = Array.from({ length: muitos }, (_, i) => registro(`x${i}`, "p1", "#0101", "parcial", 1, 3, "08:00", 10 + i));
  return {
    dia: HOJE, hoje: HOJE,
    maquinas: [
      { codigo: "1", rotulo: "Impressora 1 (New XT)", imprimindo: imprimindo ? [peca("p1", "#0101", 3, 10, "1")] : [], registros: [...regs1, ...extras], unidadesNoDia: 3 + muitos, pecasNoDia: 1 },
      { codigo: "2", rotulo: "Impressora 2", imprimindo: [], naFila: reservadas2, registros: regs2, unidadesNoDia: registros ? 4 : 0, pecasNoDia: registros ? 1 : 0 },
      { codigo: "3", rotulo: "Impressora 3", imprimindo: [], registros: [], unidadesNoDia: 0, pecasNoDia: 0 },
      { codigo: "4", rotulo: "Impressora 4 (Targa Elite)", imprimindo: [], registros: [], unidadesNoDia: 0, pecasNoDia: 0 },
    ],
    semMaquina: [],
    filaGeral,
  };
}

/** O fetch falso em uso (vi.stubGlobal) — para olhar chamadas que não são PATCH. */
const fetchMockDe = () => globalThis.fetch as unknown;

/** fetch falso que responde por URL e guarda as chamadas de escrita. */
function fetchPorUrl(extra?: (url: string, init: any) => Response | null) {
  const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
  const mock = vi.fn(async (url: any, init?: any) => {
    const u = String(url);
    const r = extra?.(u, init);
    if (r) return r;
    if (u.includes("/relatorio")) return json(relatorioDoDia());
    if (u.includes("/api/grafica/maquinas")) return json(retrato({ fila: true }));
    return json({ atualizadas: 1, itens: [], erros: [] });
  });
  vi.stubGlobal("fetch", mock);
  const escritas = () => mock.mock.calls.filter((c: any) => c[1]?.method === "PATCH").map((c: any) => ({ url: String(c[0]), body: JSON.parse(String(c[1].body)) }));
  return { mock, escritas };
}

/** O que o jsdom não tem e a página usa. Reaplicado a cada montagem (o afterEach limpa os stubs). */
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

/** O relatório de um dia (a chave que a tela pede com ?periodo=dia). */
function relatorioDoDia(de = HOJE, ate = HOJE) {
  const maq = (maquina: string, rotulo: string, extra: Partial<any> = {}) => ({
    dia: de, maquina, rotulo, unidades: 0, pecas: 0, concluidas: 0, aindaNaMaquina: 0, primeira: null, ultima: null, minutosAtivos: 0, quem: [], ...extra,
  });
  return {
    de, ate, hoje: HOJE,
    dias: [{
      dia: de,
      maquinas: [
        maq("1", "Impressora 1 (New XT)", { unidades: 3, pecas: 1, aindaNaMaquina: 1, primeira: "09:00", ultima: "10:12", minutosAtivos: 72, quem: ["Ana"] }),
        maq("2", "Impressora 2", { unidades: 4, pecas: 1, concluidas: 1, primeira: "09:40", ultima: "09:40", quem: ["Ana"] }),
        maq("3", "Impressora 3"),
        maq("4", "Impressora 4 (Targa Elite)"),
      ],
      total: { unidades: 7, pecas: 2, concluidas: 1, aindaNaMaquina: 1, minutosAtivos: 72 },
    }],
  };
}

async function montar(largura: number, dados: any | null, opts: { url?: string; relatorio?: any } = {}) {
  prepararJsdom(largura);
  window.history.replaceState({}, "", opts.url ?? "/grafica/maquinas");
  const { queryClient } = await import("@/lib/queryClient");
  const Pagina = (await import("@/pages/grafica-maquinas")).default;
  queryClient.clear();
  if (dados) queryClient.setQueryData(["/api/grafica/maquinas"], dados);
  if (dados) {
    const rel = opts.relatorio ?? relatorioDoDia();
    queryClient.setQueryData(["/api/grafica/maquinas/relatorio", `?de=${rel.de}&ate=${rel.ate}`], rel);
  }
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Pagina as any, null))); });
  await tick(30);
  return queryClient;
}

afterEach(() => { cleanup(); papel.atual = "grafica"; vi.unstubAllGlobals(); });

describe("as frases puras", async () => {
  const m = await import("@/components/grafica/modal-impressao");

  it("progresso: quantas já foram para o acabamento e quantas ainda estão na impressora", () => {
    expect(m.progressoDaImpressao(3, 10)).toBe("3 de 10 impressas · 7 na impressora");
    expect(m.progressoDaImpressao(1, 10)).toBe("1 de 10 impressa · 9 na impressora");
    expect(m.progressoDaImpressao(0, 10)).toBe("nenhuma saiu ainda · 10 na impressora");
  });

  it("o botão do modal diz o que acontece com a DIFERENÇA", () => {
    expect(m.fraseDoBotaoDeImpressas(4, 1, 10)).toMatchObject({ rotulo: "Mandar 3 para acabamento (4 de 10)", pode: true });
    expect(m.fraseDoBotaoDeImpressas(10, 4, 10)).toMatchObject({ rotulo: "Mandar as últimas 6 e concluir", pode: true });
    expect(m.fraseDoBotaoDeImpressas(10, 0, 10)).toMatchObject({ rotulo: "Mandar todas as 10 e concluir", pode: true });
    expect(m.fraseDoBotaoDeImpressas(1, 1, 10)).toMatchObject({ rotulo: "Nada mudou", pode: false });
    expect(m.fraseDoBotaoDeImpressas(11, 1, 10)).toMatchObject({ rotulo: "Máximo 10", pode: false });
    expect(m.fraseDoBotaoDeImpressas(2, 4, 10)).toMatchObject({ rotulo: "Corrigir para 2 de 10", pode: true });
    expect(m.fraseDoBotaoDeImpressas(0, 1, 10).pode).toBe(false);
    // Legado: total atingido e a peça ainda "Em Impressão" — só falta mandar.
    expect(m.fraseDoBotaoDeImpressas(10, 10, 10)).toMatchObject({ rotulo: "Mandar para acabamento", pode: true });
  });

  it("o rótulo curto da linha: 'Impressas' enquanto falta, 'Mandar p/ acabamento' no teto", () => {
    expect(m.rotuloCurtoDaAcao(3, 10)).toBe("Impressas");
    expect(m.rotuloCurtoDaAcao(10, 10)).toBe("Mandar p/ acabamento");
  });

  it("o diário fala como o galpão", async () => {
    const { oQueAconteceu } = await import("@/pages/grafica-maquinas");
    const base = { id: "r", itemId: "p", displayId: "#1", tipoPeca: "B", evento: null, aImprimir: 10, hora: "10:00", quem: null, ordem: 0 };
    expect(oQueAconteceu({ ...base, tipo: "inicio", quantidade: 0, totalDepois: 0 } as any, "Impressora 2")).toBe("Iniciou a impressão");
    expect(oQueAconteceu({ ...base, tipo: "troca", quantidade: 0, totalDepois: 3 } as any, "Impressora 2")).toBe("Trocou para Impressora 2");
    expect(oQueAconteceu({ ...base, tipo: "parcial", quantidade: 3, totalDepois: 4 } as any, "Impressora 2")).toBe("Mandou 3 para acabamento (4 de 10)");
    expect(oQueAconteceu({ ...base, tipo: "conclusao", quantidade: 6, totalDepois: 10 } as any, "Impressora 2")).toBe("Concluiu: 10 de 10 impressas");
    expect(oQueAconteceu({ ...base, tipo: "parcial", quantidade: -2, totalDepois: 2 } as any, "Impressora 2")).toBe("Corrigiu para 2 de 10 (-2)");
  });
});

describe("a aba Máquinas no desktop", () => {
  it("AGORA: quatro cartões com os nomes do dono, progresso em palavras e 'Livre' com atalho", async () => {
    await montar(1280, retrato());
    const nomes = $$('[data-testid^="maquina-agora-"] h3').map((e) => e.textContent);
    expect(nomes).toEqual(["Impressora 1 (New XT)", "Impressora 2", "Impressora 3", "Impressora 4 (Targa Elite)"]);
    expect($('[data-testid="estado-1"]')!.textContent).toBe("Imprimindo");
    expect($('[data-testid="estado-2"]')!.textContent).toBe("Livre");
    expect($('[data-testid="progresso-p1"]')!.textContent).toBe("3 de 10 impressas · 7 na impressora");
    expect($('[role="progressbar"]')!.getAttribute("aria-valuenow")).toBe("3");
    // "Escolher peça" abre o seletor AQUI (dono, 21/09), não a fila da Gráfica.
    expect($('[data-testid="link-escolher-peca-2"]')!.tagName).toBe("BUTTON");
    expect($('[data-testid="link-grafica-em-impressao"]')!.getAttribute("href")).toBe("/grafica?status=inProduction");
    expect($('[data-testid="resumo-agora"]')!.textContent).toBe("1 peça em impressão");
    expect($('[data-testid="atualizado-ha"]')).toBeTruthy();
  });

  it("DIÁRIO: uma lista só na ordem do dia; o chip filtra e grava na URL", async () => {
    await montar(1280, retrato(), { url: "/grafica/maquinas?aba=diario" });
    const linhas = () => $$('[data-testid^="linha-diario-"]').map((e) => e.getAttribute("data-testid"));
    expect(linhas()).toEqual(["linha-diario-r1", "linha-diario-r3", "linha-diario-r2"]);
    expect($('[data-testid="chip-maquina-todas"]')!.textContent).toBe("Todas3");
    expect($('[data-testid="chip-maquina-2"]')!.textContent).toBe("Impressora 21");
    expect($('[data-testid="linha-diario-r1"]')!.textContent).toContain("Mandou 3 para acabamento (3 de 10)");
    expect($('[data-testid="linha-diario-r3"]')!.textContent).toContain("Concluiu: 10 de 10 impressas");

    await act(async () => { fireEvent.click($('[data-testid="chip-maquina-2"]')!); });
    await tick(20);
    expect(window.location.search).toBe("?aba=diario&maquina=2");
    expect($('[data-testid="chip-maquina-2"]')!.getAttribute("aria-pressed")).toBe("true");
    expect(linhas()).toEqual(["linha-diario-r3"]);
    // Com uma impressora escolhida a coluna "Impressora" some.
    expect($$('[data-testid="diario-tabela"] th').map((e) => e.textContent)).not.toContain("Impressora");
  });

  it("ABAS: 'agora' é o padrão (sem diário nem resumo montados); o rodapé do cartão leva à aba Diário daquela impressora", async () => {
    await montar(1280, retrato());
    expect($('[data-testid="aba-agora"]')!.getAttribute("aria-selected")).toBe("true");
    expect($('[data-testid="aba-agora"]')!.textContent).toContain("1"); // 1 peça em impressão
    expect($('[data-testid="aba-diario"]')!.textContent).toContain("3"); // 3 lançamentos hoje
    expect($$('[data-testid^="linha-diario-"]').length).toBe(0);
    expect($('[data-testid="secao-resumo"]')).toBeNull();
    expect($('[data-testid="secao-fila"]')).toBeTruthy();
    await act(async () => { fireEvent.click($('[data-testid="resumo-dia-1"]')!); });
    await tick(20);
    expect(window.location.search).toBe("?maquina=1&aba=diario");
    expect($('[data-testid="aba-diario"]')!.getAttribute("aria-selected")).toBe("true");
    expect($$('[data-testid^="linha-diario-"]').map((e) => e.getAttribute("data-testid"))).toEqual(["linha-diario-r1", "linha-diario-r2"]);
    expect($('[data-testid="maquina-agora-1"]')).toBeNull();
    await act(async () => { fireEvent.click($('[data-testid="aba-resumo"]')!); });
    await tick(20);
    expect($('[data-testid="secao-resumo"]')).toBeTruthy();
  });

  it("DIÁRIO vazio: diz o que fazer; com filtro, oferece 'ver todas'", async () => {
    await montar(1280, retrato({ registros: false }), { url: "/grafica/maquinas?aba=diario" });
    expect($('[data-testid="diario-vazio"]')!.textContent).toContain("Nenhuma impressão registrada hoje.");
    expect($('[data-testid="diario-vazio"]')!.textContent).toContain("Ao iniciar uma impressão na Gráfica, ela aparece aqui.");
    await act(async () => { fireEvent.click($('[data-testid="chip-maquina-3"]')!); });
    await tick(20);
    expect($('[data-testid="diario-vazio"]')!.textContent).toContain("Nada saiu da Impressora 3 hoje.");
    await act(async () => { fireEvent.click($('[data-testid="button-ver-todas"]')!); });
    await tick(20);
    expect(window.location.search).toBe("?aba=diario");
  });

  it("DIÁRIO grande: entra por lotes de 60 com 'mostrar mais'", async () => {
    await montar(1280, retrato({ muitos: 100 }), { url: "/grafica/maquinas?aba=diario" });
    expect($$('[data-testid^="linha-diario-"]').length).toBe(60);
    expect($('[data-testid="button-mostrar-mais"]')!.textContent).toBe("Mostrar mais 43");
    await act(async () => { fireEvent.click($('[data-testid="button-mostrar-mais"]')!); });
    expect($$('[data-testid^="linha-diario-"]').length).toBe(103);
    expect($('[data-testid="button-mostrar-mais"]')).toBeNull();
  });

  it("AGE: o botão do cartão abre o modal da fila já em 'informar impressas', e o botão diz o que vai acontecer", async () => {
    await montar(1280, retrato());
    await act(async () => { fireEvent.click($('[data-testid="button-impressas-p1"]')!); });
    await tick(30);
    const dialogo = $('[role="dialog"]');
    expect(dialogo).toBeTruthy();
    expect($('[data-testid="form-impressao"]')!.getAttribute("data-etapa")).toBe("impressas");
    expect(dialogo!.textContent).toContain("Em impressão na Impressora 1 (New XT)");
    expect(dialogo!.textContent).toContain("3 de 10 impressas · 7 na impressora");
    // Só UM botão primário: nada de "Iniciar" ao lado de "Salvar".
    expect($('[data-testid="button-iniciar-impressao"]')).toBeNull();
    // O campo pergunta o que saiu AGORA (dono, 21/09: "se tem 5 na
    // impressora, como imprimo 10?"): nasce vazio, o total é calculado.
    const campo = $('[data-testid="input-quantity-produced"]') as HTMLInputElement;
    expect(campo.value).toBe("");
    expect(campo.getAttribute("max")).toBe("7");
    expect(dialogo!.textContent).toContain("Quantas saíram agora?");
    expect(dialogo!.textContent).not.toContain("Informe o TOTAL");
    const confirmar = () => $('[data-testid="button-confirm-production"]') as HTMLButtonElement;
    expect(confirmar().disabled).toBe(true);
    expect(confirmar().textContent).toBe("Informe quantas saíram");
    await act(async () => { fireEvent.change(campo, { target: { value: "1" } }); });
    expect($('[data-testid="linha-da-conta"]')!.textContent).toBe("3 já saíram + 1 agora = 4 de 10 · 6 ficam na impressora");
    expect(confirmar().textContent).toBe("Mandar 1 para acabamento (4 de 10)");
    expect(confirmar().disabled).toBe(false);
    // "Tudo" = o que resta na impressora (7), não o teto.
    await act(async () => { fireEvent.click($('[data-testid="button-set-total"]')!); });
    expect(campo.value).toBe("7");
    expect(confirmar().textContent).toBe("Mandar as últimas 7 e concluir");
    await act(async () => { fireEvent.change(campo, { target: { value: "12" } }); });
    expect(confirmar().disabled).toBe(true);
    expect($('[data-testid="aviso-quantidade"]')!.textContent).toContain("Só há 7 na impressora");
    // O gesto manda o TOTAL ao servidor: 3 já + 5 agora = 8.
    await act(async () => { fireEvent.change(campo, { target: { value: "5" } }); });
    const { escritas } = fetchPorUrl();
    await act(async () => { fireEvent.click(confirmar()); });
    await tick(30);
    expect(escritas()[0]).toEqual({ url: "/api/items/p1/start-production", body: { quantityProduced: 8, expectedProduced: 3, printMachine: "1" } });
  });

  it("AGE: 'Corrigir o total já informado' abre o modo absoluto, com a frase de correção", async () => {
    await montar(1280, retrato());
    await act(async () => { fireEvent.click($('[data-testid="button-impressas-p1"]')!); });
    await tick(30);
    const dialogo = $('[role="dialog"]')!;
    await act(async () => { fireEvent.click($('[data-testid="button-corrigir-total"]')!); });
    const campo = $('[data-testid="input-quantity-produced"]') as HTMLInputElement;
    expect(campo.value).toBe("3");
    const confirmar = () => $('[data-testid="button-confirm-production"]') as HTMLButtonElement;
    expect(confirmar().textContent).toBe("Nada mudou");
    await act(async () => { fireEvent.change(campo, { target: { value: "2" } }); });
    expect(confirmar().textContent).toBe("Corrigir para 2 de 10");
    // Trocar de máquina é um botão contornado que abre um painel; a atual fica desabilitada.
    await act(async () => { fireEvent.click($('[data-testid="button-trocar-maquina"]')!); });
    expect($('[data-testid="painel-troca"]')).toBeTruthy();
    expect(($('[data-testid="maquina-1"]') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fireEvent.click($('[data-testid="maquina-3"]')!); });
    expect($('[data-testid="button-iniciar-impressao"]')!.textContent).toBe("Mover tudo para a Impressora 3");
    expect(dialogo.textContent).toContain("7 vão para a Impressora 3; 0 ficam na Impressora 1 (New XT).");
    // A linha do diário não repete a ação da peça (ela mora no cartão).
    expect($('[data-testid="button-impressas-linha-r1"]')).toBeNull();
  });

  it("PERMISSÃO: a Solicitação vê tudo e não age", async () => {
    papel.atual = "solicitacao";
    await montar(1280, retrato());
    expect($('[data-testid="progresso-p1"]')).toBeTruthy();
    expect($('[data-testid="button-impressas-p1"]')).toBeNull();
    expect($('[data-testid="button-impressas-linha-r1"]')).toBeNull();
    expect($('[data-testid="link-escolher-peca-2"]')).toBeNull();
    expect($('[data-testid="link-peca-grafica-p1"]')).toBeTruthy();
  });

  it("ESTADOS: silhueta ao carregar e erro com 'tentar novamente'", async () => {
    const qc = await montar(1280, null);
    // (o stub de fetch precisa vir DEPOIS de prepararJsdom, que roda dentro de montar — mas antes da primeira busca, que só sai no tick abaixo)
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "x" }), { status: 500, headers: { "content-type": "application/json" } })));
    // A primeira pintura é a silhueta, não um spinner.
    expect($('[data-testid="maquinas-carregando"]') || $('[data-testid="maquinas-erro"]')).toBeTruthy();
    for (let i = 0; i < 40 && !$('[data-testid="maquinas-erro"]'); i++) await tick(50);
    expect($('[data-testid="maquinas-erro"]')!.textContent).toContain("Não foi possível carregar as máquinas");
    expect($('[data-testid="button-tentar-novamente"]')).toBeTruthy();
    qc.clear();
  }, 20_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// SEGUNDA PASSADA (dono em produção, 21/09): "cortando o nome da impressora",
// "não consigo trocar de máquina um item", "não tem relatório diário, não tem
// relatório para exportar".
// ─────────────────────────────────────────────────────────────────────────────
describe("segunda passada: nada cortado, trocar direto, resumo e Excel", () => {
  it("o nome da impressora e o da peça não cortam: quebram em linha (h3 sem nowrap; peça com clamp de 2 linhas)", async () => {
    await montar(1280, retrato());
    const h3 = $('[data-testid="maquina-agora-1"] h3')!;
    expect(h3.textContent).toBe("Impressora 1 (New XT)");
    expect(h3.style.whiteSpace).not.toBe("nowrap");
    expect(h3.style.textOverflow).not.toBe("ellipsis");
    expect(h3.style.overflowWrap).toBe("anywhere");
    // A pílula não disputa espaço: o cabeçalho quebra linha se precisar.
    expect((h3.parentElement as HTMLElement).style.flexWrap).toBe("wrap");
    const nome = $('[data-testid="nome-peca-p1"]')!;
    // A DESCRIÇÃO em destaque (é ela que identifica) e o tipo como apoio.
    expect(nome.textContent).toBe("#0101lona 440gBackdrop");
    expect(nome.style.whiteSpace).not.toBe("nowrap");
    expect(nome.style.webkitLineClamp || (nome.style as any).WebkitLineClamp).toBe("2");
    // Em nenhum lugar da tela um rótulo ainda usa reticências de linha única.
    expect($$('[data-testid^="maquina-agora-"] *').filter((e) => e.style.textOverflow === "ellipsis")).toEqual([]);
  });

  it("'Trocar de máquina' no cartão abre o modal já no painel de troca, com o título dizendo isso", async () => {
    await montar(1280, retrato());
    const trocar = $('[data-testid="button-trocar-maquina-p1"]')!;
    expect(trocar.textContent).toContain("Trocar de máquina");
    await act(async () => { fireEvent.click(trocar); });
    await tick(30);
    const dialogo = $('[role="dialog"]')!;
    expect(dialogo.textContent).toContain("Trocar de máquina — Impressora 1 (New XT)");
    expect($('[data-testid="painel-troca"]')).toBeTruthy();
    expect(($('[data-testid="maquina-1"]') as HTMLButtonElement).disabled).toBe(true);
    const mover = () => $('[data-testid="button-iniciar-impressao"]') as HTMLButtonElement;
    expect(mover().disabled).toBe(true);
    await act(async () => { fireEvent.click($('[data-testid="maquina-2"]')!); });
    expect(mover().textContent).toBe("Mover tudo para a Impressora 2");
    expect(mover().disabled).toBe(false);
    // O gesto grava "troca" na máquina nova (mesmo endpoint da fila). Depois
    // dele a página recarrega o retrato e o relatório — o mock responde por URL.
    const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
    const fetchMock = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes("/start-printing")) return json({ id: "p1", printMachine: "2" });
      if (u.includes("/relatorio")) return json(relatorioDoDia());
      return json(retrato());
    });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { fireEvent.click(mover()); });
    await tick(30);
    const chamada = fetchMock.mock.calls.find((c: any) => String(c[0]).includes("/start-printing")) as any;
    expect(String(chamada[0])).toBe("/api/items/p1/start-printing");
    expect(JSON.parse(String(chamada[1].body))).toEqual({ printMachine: "2" });
  });

  it("no modal aberto em 'impressas', o 'Trocar de máquina' é um botão contornado — não um link perdido", async () => {
    await montar(1280, retrato());
    await act(async () => { fireEvent.click($('[data-testid="button-impressas-p1"]')!); });
    await tick(30);
    const b = $('[data-testid="button-trocar-maquina"]')!;
    expect(b.style.border).toContain("1.5px solid");
    expect(b.style.textDecoration).not.toBe("underline");
    expect(px(b.style.minHeight)).toBeGreaterThanOrEqual(34);
  });

  it("RESUMO do dia: uma linha por impressora com unidades, peças, concluídas, na máquina, atividade, tempo e quem — e o total", async () => {
    await montar(1280, retrato(), { url: "/grafica/maquinas?aba=resumo" });
    expect($('[data-testid="resumo-periodo"]')!.textContent).toBe("Hoje · 7 unidades impressas");
    const cabecalhos = $$('[data-testid="resumo-tabela"] th').map((e) => e.textContent);
    expect(cabecalhos).toEqual(["Impressora", "Unidades", "Peças", "Concluídas", "Na máquina", "Atividade", "Tempo ativo", "Quem"]);
    const celulas = (id: string) => $$(`[data-testid="${id}"] td`).map((e) => e.textContent);
    expect(celulas(`resumo-${HOJE}-1`)).toEqual(["Impressora 1 (New XT)", "3", "1", "0", "1", "09:00 → 10:12", "1h 12min", "Ana"]);
    expect(celulas(`resumo-${HOJE}-3`)).toEqual(["Impressora 3", "0", "0", "0", "0", "—", "—", "—"]);
    expect(celulas(`resumo-${HOJE}-total`)).toEqual(["Total", "7", "2", "1", "1", "", "1h 12min", ""]);
    // Clicar na impressora leva ao diário dela.
    await act(async () => { fireEvent.click($(`[data-testid="resumo-${HOJE}-2"] button`)!); });
    await tick(20);
    expect(window.location.search).toBe("?aba=diario&maquina=2");
  });

  it("o PERÍODO vive na URL e vale para o resumo e para o Excel; semana e mês nascem do dia do diário", async () => {
    const { intervaloDoPeriodo } = await import("@/pages/grafica-maquinas");
    // 21/09/2026 é segunda-feira: a semana é 21..27, travada em hoje (21).
    expect(intervaloDoPeriodo("dia", "2026-09-21", "2026-09-21", null, null)).toEqual({ de: "2026-09-21", ate: "2026-09-21" });
    expect(intervaloDoPeriodo("semana", "2026-09-21", "2026-09-21", null, null)).toEqual({ de: "2026-09-21", ate: "2026-09-21" });
    expect(intervaloDoPeriodo("semana", "2026-09-17", "2026-09-21", null, null)).toEqual({ de: "2026-09-14", ate: "2026-09-20" });
    expect(intervaloDoPeriodo("mes", "2026-09-17", "2026-09-21", null, null)).toEqual({ de: "2026-09-01", ate: "2026-09-21" });
    expect(intervaloDoPeriodo("mes", "2026-08-17", "2026-09-21", null, null)).toEqual({ de: "2026-08-01", ate: "2026-08-31" });
    expect(intervaloDoPeriodo("intervalo", "2026-09-21", "2026-09-21", "2026-09-15", "2026-09-21")).toEqual({ de: "2026-09-15", ate: "2026-09-21" });
    expect(intervaloDoPeriodo("intervalo", "2026-09-21", "2026-09-21", "2026-09-25", "2026-09-30")).toEqual({ de: "2026-09-21", ate: "2026-09-21" });
    expect(intervaloDoPeriodo("intervalo", "2026-09-21", "2026-09-21", null, null)).toEqual({ de: "2026-09-21", ate: "2026-09-21" });

    const semana = { ...relatorioDoDia("2026-09-21", "2026-09-21") };
    await montar(1280, retrato(), { relatorio: semana, url: "/grafica/maquinas?aba=resumo" });
    expect($('[data-testid="periodo-dia"]')!.getAttribute("aria-pressed")).toBe("true");
    await act(async () => { fireEvent.click($('[data-testid="periodo-semana"]')!); });
    await tick(20);
    expect(window.location.search).toBe("?aba=resumo&periodo=semana");
    expect($('[data-testid="periodo-semana"]')!.getAttribute("aria-pressed")).toBe("true");
    await act(async () => { fireEvent.click($('[data-testid="periodo-intervalo"]')!); });
    await tick(20);
    expect($('[data-testid="intervalo-de"]')).toBeTruthy();
    expect($('[data-testid="intervalo-ate"]')).toBeTruthy();
    await act(async () => { fireEvent.change($('[data-testid="intervalo-de"]')!, { target: { value: "2026-09-15" } }); });
    await tick(20);
    expect(window.location.search).toBe("?aba=resumo&periodo=intervalo&de=2026-09-15&ate=2026-09-21");
    expect($('[data-testid="button-exportar-excel"]')!.getAttribute("title")).toContain("15/09/2026 a 21/09/2026");
  });

  it("EXPORTAR Excel baixa o .xlsx do mesmo período, com o nome do dia", async () => {
    await montar(1280, retrato(), { url: "/grafica/maquinas?aba=resumo" });
    const fetchMock = vi.fn(async () => new Response(new Blob(["xlsx"]), { status: 200, headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } }));
    vi.stubGlobal("fetch", fetchMock);
    (URL as any).createObjectURL = () => "blob:x";
    (URL as any).revokeObjectURL = () => {};
    const cliques: string[] = [];
    const clickOriginal = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { cliques.push(this.download); };
    try {
      await act(async () => { fireEvent.click($('[data-testid="button-exportar-excel"]')!); });
      for (let i = 0; i < 20 && !cliques.length; i++) await tick(20);
    } finally {
      HTMLAnchorElement.prototype.click = clickOriginal;
    }
    expect(String((fetchMock.mock.calls[0] as any)[0])).toBe(`/api/grafica/maquinas/relatorio.xlsx?de=${HOJE}&ate=${HOJE}`);
    expect(cliques).toEqual([`maquinas-${HOJE}.xlsx`]);
  });

  it("RESUMO vazio diz o que fazer; a Solicitação vê o resumo e exporta (é leitura)", async () => {
    papel.atual = "solicitacao";
    await montar(1280, retrato(), { relatorio: { de: HOJE, ate: HOJE, hoje: HOJE, dias: [] }, url: "/grafica/maquinas?aba=resumo" });
    expect($('[data-testid="resumo-vazio"]')!.textContent).toContain("Nenhuma impressão registrada hoje.");
    expect($('[data-testid="button-exportar-excel"]')).toBeTruthy();
    expect($('[data-testid="button-trocar-maquina-p1"]')).toBeNull();
  });

  it("DIÁRIO a ~1040px úteis (menu aberto): tabela compacta, sem coluna cortada; abaixo de 820px vira cartões", async () => {
    await montar(1040, retrato(), { url: "/grafica/maquinas?aba=diario" });
    const tabela = $('[data-testid="diario-tabela"]')!;
    expect(tabela.getAttribute("data-compacto")).toBe("true");
    expect($$('[data-testid="diario-tabela"] th').map((e) => e.textContent)).toEqual(["Hora", "Impressora", "Peça", "O que aconteceu", "Quem"]);
    // O evento continua na tela, embaixo da peça.
    expect($('[data-testid="linha-diario-r1"]')!.textContent).toContain("Maratona SP");
    // Nenhuma célula corta texto — todas quebram linha.
    expect($$('[data-testid="diario-tabela"] td').filter((e) => e.style.textOverflow === "ellipsis" || e.style.maxWidth)).toEqual([]);
    expect(tabela.style.minWidth).toBe("");
    cleanup();
    await montar(700, retrato(), { url: "/grafica/maquinas?aba=diario" });
    expect($("table[data-testid='diario-tabela']")).toBeNull();
    expect($('[data-testid="diario-cartoes"]')).toBeTruthy();
    cleanup();
    await montar(700, retrato(), { url: "/grafica/maquinas?aba=resumo" });
    expect($('[data-testid="resumo-cartoes"]')).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A FILA (dono, 21/09): "deixar na fila alguns itens (geral) ou já setar em
// alguma impressora" — e "o reservar é só um controle, não muda status".
// ─────────────────────────────────────────────────────────────────────────────
describe("a fila: geral, reservada por impressora, e o seletor de peça", () => {
  it("FILA GERAL na ordem do caminhão, com prazo e m²; o cartão diz 'Livre · Na fila 2' e lista as reservadas", async () => {
    await montar(1280, retrato({ fila: true }));
    expect($('[data-testid="resumo-fila"]')!.textContent).toBe("3 peças liberadas sem impressora · 2 reservadas nos cartões acima");
    expect($$('[data-testid^="fila-peca-"]').map((e) => e.getAttribute("data-testid"))).toEqual(["fila-peca-f1", "fila-peca-f2", "fila-peca-f3"]);
    expect($('[data-testid="fila-peca-f1"]')!.textContent).toContain("Placa de octanorme grande para o pórtico");
    expect($('[data-testid="fila-peca-f1"]')!.textContent).toContain("4,5 m²");
    expect($('[data-testid="fila-peca-f1"]')!.textContent).toMatch(/Prazo \d\d\/\d\d · 1d/);
    expect($('[data-testid="estado-2"]')!.textContent).toBe("Livre · Na fila 2");
    expect($$('[data-testid="fila-maquina-2"] [data-testid^="peca-na-fila-"]').map((e) => e.getAttribute("data-testid"))).toEqual(["peca-na-fila-f4", "peca-na-fila-f5"]);
    // O nome longo não corta: clamp de 2 linhas, sem nowrap.
    const nome = $('[data-testid="nome-fila-geral-f1"]') as HTMLElement;
    expect(nome.style.webkitLineClamp || (nome.style as any).WebkitLineClamp).toBe("2");
    expect(nome.style.whiteSpace).not.toBe("nowrap");
  });

  it("RESERVAR manda SÓ { maquina, quantidade } — nada de status; devolver manda null; o lote usa bulk-", async () => {
    await montar(1280, retrato({ fila: true }));
    const { escritas } = fetchPorUrl();
    const sel = $('[data-testid="reservar-fila-f1"]') as HTMLSelectElement;
    expect(Array.from(sel.options).map((o) => o.textContent)).toEqual(["Impressora…", "Impressora 2 — livre", "Impressora 3 — livre", "Impressora 4 (Targa Elite) — livre", "Impressora 1 (New XT) — imprimindo #0101"]);
    // Sem impressora escolhida o botão não age; a quantidade nasce com tudo (placeholder).
    const botao = () => $('[data-testid="button-reservar-f1"]') as HTMLButtonElement;
    expect(botao().disabled).toBe(true);
    expect(($('[data-testid="qtd-reservar-f1"]') as HTMLInputElement).placeholder).toBe("10");
    await act(async () => { fireEvent.change(sel, { target: { value: "2" } }); });
    expect(botao().disabled).toBe(false);
    await act(async () => { fireEvent.click(botao()); });
    await tick(30);
    expect(escritas()).toEqual([{ url: "/api/items/f1/maquina-prevista", body: { maquina: "2", quantidade: 10 } }]);

    // No cartão: "Mover para…" oferece as outras três e "Devolver à fila geral".
    const mover = $('[data-testid="mover-fila-f4"]') as HTMLSelectElement;
    expect(Array.from(mover.options).map((o) => o.textContent)).toEqual(["Mover para…", "Impressora 1 (New XT)", "Impressora 3", "Impressora 4 (Targa Elite)", "Devolver à fila geral"]);
    await act(async () => { fireEvent.change(mover, { target: { value: "geral" } }); });
    await tick(30);
    expect(escritas()[1]).toEqual({ url: "/api/items/f4/maquina-prevista", body: { maquina: null } });

    // Lote: duas marcadas → bulk-maquina-prevista com os ids.
    await act(async () => { fireEvent.click($('[data-testid="selecionar-fila-f2"]')!); fireEvent.click($('[data-testid="selecionar-fila-f3"]')!); });
    expect($('[data-testid="lote-fila"]')!.textContent).toContain("2 selecionadas");
    await act(async () => { fireEvent.change($('[data-testid="reservar-lote"]')!, { target: { value: "3" } }); });
    await tick(30);
    expect(escritas()[2]).toEqual({ url: "/api/items/bulk-maquina-prevista", body: { itemIds: ["f2", "f3"], maquina: "3" } });
  });

  it("INICIAR da fila do cartão abre o modal em 'iniciar' com a Impressora 2 já marcada", async () => {
    await montar(1280, retrato({ fila: true }));
    await act(async () => { fireEvent.click($('[data-testid="button-iniciar-fila-f4"]')!); });
    await tick(30);
    expect($('[data-testid="form-impressao"]')!.getAttribute("data-etapa")).toBe("iniciar");
    expect($('[data-testid="maquina-2"]')!.getAttribute("aria-checked")).toBe("true");
    const iniciar = $('[data-testid="button-iniciar-impressao"]') as HTMLButtonElement;
    expect(iniciar.disabled).toBe(false);
    expect(iniciar.textContent).toBe("Iniciar tudo (10) na Impressora 2");
    // O gesto é o start-printing de sempre — quem limpa a reserva é o servidor.
    const { escritas } = fetchPorUrl();
    await act(async () => { fireEvent.click(iniciar); });
    await tick(30);
    expect(escritas()).toEqual([{ url: "/api/items/f4/start-printing", body: { printMachine: "2" } }]);
  });

  it("SELETOR DE PEÇA: 'Escolher peça' abre a lista aqui (reservadas desta no topo, com selo), busca filtra, um clique abre a impressão com a impressora escolhida", async () => {
    await montar(1280, retrato({ fila: true }));
    await act(async () => { fireEvent.click($('[data-testid="link-escolher-peca-2"]')!); });
    await tick(30);
    const seletor = $('[data-testid="seletor-de-peca"]')!;
    expect(seletor.textContent).toContain("Imprimir na Impressora 2");
    expect(seletor.textContent).toContain("5 peças liberadas · 2 reservadas para esta");
    expect($$('[data-testid^="escolher-peca-"]').map((e) => e.getAttribute("data-testid"))).toEqual(["escolher-peca-f4", "escolher-peca-f5", "escolher-peca-f1", "escolher-peca-f2", "escolher-peca-f3"]);
    expect($('[data-testid="selo-reservada-f4"]')).toBeTruthy();
    expect($('[data-testid="selo-reservada-f1"]')).toBeNull();
    expect($('[data-testid="link-ver-na-grafica"]')!.getAttribute("href")).toBe("/grafica?status=ready_for_production,approved");
    // Busca por evento, sem acento.
    await act(async () => { fireEvent.change($('[data-testid="busca-peca"]')!, { target: { value: "meia do rio" } }); });
    expect($$('[data-testid^="escolher-peca-"]').map((e) => e.getAttribute("data-testid"))).toEqual(["escolher-peca-f2"]);
    await act(async () => { fireEvent.change($('[data-testid="busca-peca"]')!, { target: { value: "xyz" } }); });
    expect($('[data-testid="seletor-sem-resultado"]')).toBeTruthy();
    await act(async () => { fireEvent.change($('[data-testid="busca-peca"]')!, { target: { value: "0202" } }); });
    await act(async () => { fireEvent.click($('[data-testid="escolher-peca-f2"]')!); });
    await tick(30);
    expect($('[data-testid="seletor-de-peca"]')).toBeNull();
    expect($('[data-testid="form-impressao"]')!.getAttribute("data-etapa")).toBe("iniciar");
    expect($('[data-testid="maquina-2"]')!.getAttribute("aria-checked")).toBe("true");
    expect(($('[data-testid="button-iniciar-impressao"]') as HTMLButtonElement).textContent).toBe("Iniciar tudo (10) na Impressora 2");
  });

  it("SELETOR vazio diz o que esperar; a Solicitação não vê reservar nem selecionar", async () => {
    await montar(1280, retrato());
    await act(async () => { fireEvent.click($('[data-testid="link-escolher-peca-2"]')!); });
    await tick(30);
    expect($('[data-testid="seletor-vazio"]')!.textContent).toContain("Nenhuma peça liberada agora.");
    cleanup();
    papel.atual = "solicitacao";
    await montar(1280, retrato({ fila: true }));
    expect($('[data-testid="fila-peca-f1"]')).toBeTruthy();
    expect($('[data-testid="reservar-fila-f1"]')).toBeNull();
    expect($('[data-testid="selecionar-fila-f1"]')).toBeNull();
    expect($('[data-testid="button-iniciar-fila-f4"]')).toBeNull();
  });

  it("CELULAR com a fila e o seletor abertos: alvos de 44, campos a 16px, nada mais largo que a tela", async () => {
    await montar(390, retrato({ fila: true }));
    await act(async () => { fireEvent.click($('[data-testid="link-escolher-peca-2"]')!); });
    await tick(30);
    const ruins: string[] = [];
    for (const el of $$("button, a[href], input:not([type=checkbox]), select")) {
      if (el.closest(".sr-only")) continue;
      // A casca do modal (X do cabeçalho, fechar nativo escondido) é do
      // modal-shell e ganha 44px por CSS global no celular — fora deste recorte.
      if (el.closest('[role="dialog"]') && !el.getAttribute("data-testid")) continue;
      const alt = Math.max(px(el.style.minHeight), px(el.style.height));
      if (alt < 44) ruins.push(`${el.getAttribute("data-testid") ?? el.tagName} altura ${alt}`);
    }
    expect(ruins).toEqual([]);
    expect(px(($('[data-testid="busca-peca"]') as HTMLInputElement).style.fontSize)).toBe(16);
    expect(px(($('[data-testid="reservar-fila-f1"]') as HTMLSelectElement).style.fontSize)).toBe(16);
    for (const el of $$("*")) for (const v of [el.style.width, el.style.minWidth]) expect(px(v), `${el.tagName} ${v}`).toBeLessThanOrEqual(390);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PEÇA DIVIDIDA (dono, 21/09: "ao mover, poder selecionar tudo ou
// quantidades"), fila geral sempre visível, servidor na versão anterior.
// ─────────────────────────────────────────────────────────────────────────────
describe("peça dividida, fila sempre visível e servidor antigo", () => {
  const dividida = () => {
    const r = retrato();
    const base = { ...peca("p1", "#0101", 5, 10, "1"), impressaoPorMaquina: { "1": { atrib: 8, impressas: 5 }, "2": { atrib: 2, impressas: 0 } } };
    r.maquinas[0].imprimindo = [{ ...base, maquina: "1", parte: { atrib: 8, impressas: 5 } } as any];
    r.maquinas[1].imprimindo = [{ ...base, maquina: "2", parte: { atrib: 2, impressas: 0 } } as any];
    return r;
  };

  it("MOVER uma quantidade: 'Tudo (7)' é o padrão; 'Quantidade' abre o campo; o PATCH leva quantidade e deMaquina", async () => {
    await montar(1280, retrato());
    await act(async () => { fireEvent.click($('[data-testid="button-trocar-maquina-p1"]')!); });
    await tick(30);
    await act(async () => { fireEvent.click($('[data-testid="maquina-2"]')!); });
    expect($('[data-testid="mover-tudo"]')!.textContent).toBe("Tudo (7)");
    expect($('[data-testid="mover-tudo"]')!.getAttribute("aria-checked")).toBe("true");
    const mover = () => $('[data-testid="button-iniciar-impressao"]') as HTMLButtonElement;
    expect(mover().textContent).toBe("Mover tudo para a Impressora 2");
    await act(async () => { fireEvent.click($('[data-testid="mover-quantidade"]')!); });
    expect(mover().disabled).toBe(true);
    expect($('[data-testid="texto-mover"]')!.textContent).toBe("Informe de 1 a 7 — é o que ainda está por imprimir na Impressora 1 (New XT).");
    const campo = $('[data-testid="input-quantidade-mover"]') as HTMLInputElement;
    expect(campo.getAttribute("inputmode")).toBe("numeric");
    await act(async () => { fireEvent.change(campo, { target: { value: "9" } }); });
    expect(mover().disabled).toBe(true);
    await act(async () => { fireEvent.change(campo, { target: { value: "2" } }); });
    expect($('[data-testid="texto-mover"]')!.textContent).toBe("2 vão para a Impressora 2; 5 ficam na Impressora 1 (New XT).");
    expect(mover().textContent).toBe("Mover 2 para a Impressora 2");
    expect(mover().disabled).toBe(false);
    const { escritas } = fetchPorUrl();
    await act(async () => { fireEvent.click(mover()); });
    await tick(30);
    expect(escritas()[0]).toEqual({ url: "/api/items/p1/start-printing", body: { printMachine: "2", quantidade: 2, deMaquina: "1" } });
  });

  it("CARTÕES: a peça dividida aparece nos dois, cada um com a sua parte; 'Impressas' informa só a parte daquela impressora", async () => {
    await montar(1280, dividida());
    expect($('[data-testid="maquina-agora-1"] [data-testid="progresso-p1"]')!.textContent).toBe("5 de 8 nesta impressora · peça 5 de 10 no total");
    expect($('[data-testid="maquina-agora-2"] [data-testid="progresso-p1"]')!.textContent).toBe("0 de 2 nesta impressora · peça 5 de 10 no total");
    expect($('[data-testid="estado-2"]')!.textContent).toContain("Imprimindo");
    // Abrir pelo cartão da Impressora 2: o modal fala da parte dela (0 de 2).
    await act(async () => { fireEvent.click($('[data-testid="maquina-agora-2"] [data-testid="button-impressas-p1"]')!); });
    await tick(30);
    expect($('[data-testid="progresso-no-modal"]')!.textContent).toBe("0 de 2 nesta impressora · peça 5 de 10 no total");
    expect($('[data-testid="divisao-no-modal"]')!.textContent).toContain("Impressora 1 (New XT) · 5 de 8 un. / Impressora 2 · 0 de 2 un.");
    const campo = $('[data-testid="input-quantity-produced"]') as HTMLInputElement;
    expect(campo.getAttribute("max")).toBe("2");
    await act(async () => { fireEvent.change(campo, { target: { value: "3" } }); });
    expect(($('[data-testid="button-confirm-production"]') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fireEvent.change(campo, { target: { value: "2" } }); });
    expect($('[data-testid="button-confirm-production"]')!.textContent).toBe("Mandar todas as 2 e concluir");
    // O PATCH vai POR impressora: total da peça 5 + 2 = 7, impressasNaMaquina 2 na "2".
    const { escritas } = fetchPorUrl();
    await act(async () => { fireEvent.click($('[data-testid="button-confirm-production"]')!); });
    await tick(30);
    expect(escritas()[0]).toEqual({ url: "/api/items/p1/start-production", body: { quantityProduced: 7, expectedProduced: 5, printMachine: "2", maquina: "2", impressasNaMaquina: 2 } });
  });

  it("FILA GERAL vazia continua na tela, com o que esperar e o link para a Gráfica", async () => {
    await montar(1280, retrato());
    expect($('[data-testid="secao-fila"]')).toBeTruthy();
    expect($('[data-testid="fila-vazia"]')!.textContent).toContain("Nenhuma peça liberada aguardando impressão.");
    expect($('[data-testid="fila-vazia"]')!.textContent).toContain("Quando a Revisão Final liberar, elas aparecem aqui para você reservar uma impressora.");
    expect($('[data-testid="link-fila-ver-na-grafica"]')!.getAttribute("href")).toBe("/grafica?status=ready_for_production,approved");
  });

  it("SERVIDOR NA VERSÃO ANTERIOR: rota nova devolvendo o HTML do SPA vira a mensagem do conserto (Stop e Run)", async () => {
    const { ehServidorNaVersaoAnterior } = await import("@/pages/grafica-maquinas");
    expect(ehServidorNaVersaoAnterior(new Error("O sistema acabou de ser atualizado — recarregue a página (F5) e tente de novo."))).toBe(true);
    expect(ehServidorNaVersaoAnterior(new Error("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"))).toBe(true);
    expect(ehServidorNaVersaoAnterior(new Error("500: Não foi possível montar o relatório"))).toBe(false);
    await montar(1280, retrato(), { url: "/grafica/maquinas?aba=resumo" });
    const { queryClient } = await import("@/lib/queryClient");
    queryClient.removeQueries({ queryKey: ["/api/grafica/maquinas/relatorio"] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<!DOCTYPE html><html></html>", { status: 200, headers: { "content-type": "text/html" } })));
    await act(async () => { fireEvent.click($('[data-testid="periodo-semana"]')!); });
    for (let i = 0; i < 40 && !$('[data-testid="resumo-erro"]'); i++) await tick(50);
    expect($('[data-testid="resumo-erro"]')!.textContent).toContain("O servidor ainda está na versão anterior — no Replit, faça Stop e Run e recarregue a página.");
  }, 20_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// RESERVA COM QUANTIDADE (dono, 21/09, olhando "#0396 2×1 · 34 un."): "além de
// reservar, posso direcionar a quantidade e para qual impressora vai".
// ─────────────────────────────────────────────────────────────────────────────
describe("reserva com quantidade: 34 un. → 20 para a Impressora 1 e 14 para a 2", () => {
  const com34 = () => {
    const r = retrato({ fila: true });
    // #0396: 20 já direcionadas à Impressora 1, 14 sem impressora → segue na fila geral E aparece no cartão da 1.
    const base = { ...naFila("g1", "#0396", "2×1", "1", 3), quantidade: 34, aImprimir: 34, reserva: { "1": 20 }, semImpressora: 14, imprimindoEm: [] as string[] };
    r.filaGeral = [base as any];
    r.maquinas[0].imprimindo = [];
    (r.maquinas[0] as any).naFila = [{ ...base, maquinaPrevista: "1", reservadas: 20 }];
    (r.maquinas[1] as any).naFila = [];
    return r;
  };

  it("a linha mostra o que já foi direcionado e continua na fila geral com o resto; reservar PARTE manda a quantidade", async () => {
    await montar(1280, com34());
    expect($('[data-testid="direcionado-g1"]')!.textContent).toBe("20 → Impressora 1 (New XT) · 14 sem impressora");
    const qtd = $('[data-testid="qtd-reservar-g1"]') as HTMLInputElement;
    expect(qtd.placeholder).toBe("14");
    expect(qtd.getAttribute("max")).toBe("14");
    expect(qtd.getAttribute("inputmode")).toBe("numeric");
    const botao = () => $('[data-testid="button-reservar-g1"]') as HTMLButtonElement;
    await act(async () => { fireEvent.change($('[data-testid="reservar-fila-g1"]')!, { target: { value: "2" } }); });
    // Mais do que sobra não passa.
    await act(async () => { fireEvent.change(qtd, { target: { value: "15" } }); });
    expect(botao().disabled).toBe(true);
    expect(qtd.getAttribute("aria-invalid")).toBe("true");
    await act(async () => { fireEvent.change(qtd, { target: { value: "9" } }); });
    expect(botao().disabled).toBe(false);
    expect(botao().getAttribute("title")).toBe("Reservar 9 un. para a Impressora 2");
    const { escritas } = fetchPorUrl();
    await act(async () => { fireEvent.click(botao()); });
    await tick(30);
    expect(escritas()[0]).toEqual({ url: "/api/items/g1/maquina-prevista", body: { maquina: "2", quantidade: 9 } });
  });

  it("no cartão: '20 de 34 un.'; mover PARTE manda quantidade e deMaquina; devolver também", async () => {
    await montar(1280, com34());
    expect($('[data-testid="estado-1"]')!.textContent).toBe("Livre · Na fila 1");
    expect($('[data-testid="peca-na-fila-g1"]')!.textContent).toContain("20 de 34 un.");
    // (o retrato recarregado depois de cada gesto continua sendo o das 34 un.)
    const { escritas } = fetchPorUrl((u) => (u.includes("/api/grafica/maquinas") && !u.includes("relatorio") ? new Response(JSON.stringify(com34()), { status: 200, headers: { "content-type": "application/json" } }) : null));
    const qtd = $('[data-testid="qtd-mover-fila-g1"]') as HTMLInputElement;
    expect(qtd.placeholder).toBe("20");
    await act(async () => { fireEvent.change(qtd, { target: { value: "6" } }); });
    const mover = $('[data-testid="mover-fila-g1"]') as HTMLSelectElement;
    expect(mover.options[0].textContent).toBe("Mover 6 para…");
    await act(async () => { fireEvent.change(mover, { target: { value: "3" } }); });
    await tick(30);
    expect(escritas()[0]).toEqual({ url: "/api/items/g1/maquina-prevista", body: { maquina: "3", quantidade: 6, deMaquina: "1" } });
    // Sem digitar quantidade, devolve TODAS as 20 desta impressora (não as de outra).
    await act(async () => { fireEvent.change(qtd, { target: { value: "" } }); });
    await act(async () => { fireEvent.change($('[data-testid="mover-fila-g1"]')!, { target: { value: "geral" } }); });
    await tick(30);
    expect(escritas()[1]).toEqual({ url: "/api/items/g1/maquina-prevista", body: { maquina: null, quantidade: 20, deMaquina: "1" } });
    // Quantidade fora do que está reservado trava o seletor.
    await act(async () => { fireEvent.change(qtd, { target: { value: "21" } }); });
    expect(($('[data-testid="mover-fila-g1"]') as HTMLSelectElement).disabled).toBe(true);
  });

  it("INICIAR do cartão inicia SÓ a parte reservada àquela impressora (iniciarParte + daReserva)", async () => {
    await montar(1280, com34());
    await act(async () => { fireEvent.click($('[data-testid="button-iniciar-fila-g1"]')!); });
    await tick(30);
    const dialogo = $('[role="dialog"]')!;
    expect(dialogo.textContent).toContain("Imprimir parte da peça");
    expect(dialogo.textContent).toContain("20 vão para a Impressora 1 (New XT) · 14 continuam liberadas (sem impressora)");
    expect($('[data-testid="form-impressao"]')!.getAttribute("data-etapa")).toBe("iniciar");
    expect($('[data-testid="maquina-1"]')!.getAttribute("aria-checked")).toBe("true");
    const iniciar = $('[data-testid="button-iniciar-impressao"]') as HTMLButtonElement;
    expect(iniciar.textContent).toBe("Iniciar 20 un. na Impressora 1 (New XT)");
    const { escritas } = fetchPorUrl();
    await act(async () => { fireEvent.click(iniciar); });
    await tick(30);
    expect(escritas()[0]).toEqual({ url: "/api/items/g1/start-printing", body: { printMachine: "1", quantidade: 20, iniciarParte: true, daReserva: true } });
  });

  it("peça JÁ em impressão numa impressora e com parte na fila de outra: o cartão diz isso, e Iniciar soma a parte nova", async () => {
    const r = com34();
    const emOutra = { ...naFila("g1", "#0396", "2×1", "2", 3), quantidade: 34, aImprimir: 34, status: "inProduction", maquina: "1", reserva: { "2": 14 }, semImpressora: 0, imprimindoEm: ["1"], impressaoPorMaquina: { "1": { atrib: 20, impressas: 5 } } };
    r.filaGeral = [];
    (r.maquinas[0] as any).naFila = [];
    r.maquinas[0].imprimindo = [{ ...peca("g1", "#0396", 5, 34, "1"), impressaoPorMaquina: { "1": { atrib: 20, impressas: 5 } }, parte: { atrib: 20, impressas: 5 } } as any];
    (r.maquinas[1] as any).naFila = [{ ...emOutra, maquinaPrevista: "2", reservadas: 14 }];
    await montar(1280, r);
    // Na Impressora 1: a parte dela (teto 20, não 34) — mesmo sendo a ÚNICA parte.
    expect($('[data-testid="maquina-agora-1"] [data-testid="progresso-g1"]')!.textContent).toBe("5 de 20 nesta impressora · peça 5 de 34 no total");
    expect($('[data-testid="ja-imprimindo-g1"]')!.textContent).toBe("14 un. na fila · peça já em impressão na Impressora 1 (New XT)");
    await act(async () => { fireEvent.click($('[data-testid="button-iniciar-fila-g1"]')!); });
    await tick(30);
    // Mesmo com a peça "em impressão", o modal fica na etapa INICIAR (é uma parte nova).
    expect($('[data-testid="form-impressao"]')!.getAttribute("data-etapa")).toBe("iniciar");
    expect($('[data-testid="button-iniciar-impressao"]')!.textContent).toBe("Iniciar 14 un. na Impressora 2");
  });

  it("'Impressas' de uma parte ÚNICA usa o teto da parte e manda por impressora", async () => {
    const r = com34();
    r.maquinas[0].imprimindo = [{ ...peca("g1", "#0396", 5, 34, "1"), impressaoPorMaquina: { "1": { atrib: 20, impressas: 5 } }, parte: { atrib: 20, impressas: 5 } } as any];
    await montar(1280, r);
    await act(async () => { fireEvent.click($('[data-testid="maquina-agora-1"] [data-testid="button-impressas-g1"]')!); });
    await tick(30);
    const campo = $('[data-testid="input-quantity-produced"]') as HTMLInputElement;
    expect(campo.getAttribute("max")).toBe("15"); // 20 atribuídas − 5 impressas; NÃO 29
    await act(async () => { fireEvent.click($('[data-testid="button-set-total"]')!); });
    const { escritas } = fetchPorUrl();
    await act(async () => { fireEvent.click($('[data-testid="button-confirm-production"]')!); });
    await tick(30);
    expect(escritas()[0]).toEqual({ url: "/api/items/g1/start-production", body: { quantityProduced: 20, expectedProduced: 5, printMachine: "1", maquina: "1", impressasNaMaquina: 20 } });
  });

  it("SELETOR DE PEÇA mostra a quantidade reservada a esta impressora e inicia só ela; da fila geral, só o que está sem impressora", async () => {
    await montar(1280, com34());
    await act(async () => { fireEvent.click($('[data-testid="link-escolher-peca-1"]')!); });
    await tick(30);
    expect($('[data-testid="selo-reservada-g1"]')!.textContent).toBe("Reservada · 20 un.");
    cleanup();
    await montar(1280, com34());
    await act(async () => { fireEvent.click($('[data-testid="link-escolher-peca-3"]')!); });
    await tick(30);
    await act(async () => { fireEvent.click($('[data-testid="escolher-peca-g1"]')!); });
    await tick(30);
    expect($('[data-testid="button-iniciar-impressao"]')!.textContent).toBe("Iniciar 14 un. na Impressora 3");
    const { escritas } = fetchPorUrl();
    await act(async () => { fireEvent.click($('[data-testid="button-iniciar-impressao"]')!); });
    await tick(30);
    expect(escritas()[0]).toEqual({ url: "/api/items/g1/start-printing", body: { printMachine: "3", quantidade: 14, iniciarParte: true } });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// "IMPRIMIR AGORA" (dono, 21/09): "quando a impressora estiver vazia, eu poder
// colocar direto para impressão, e não só reservar".
// ─────────────────────────────────────────────────────────────────────────────
describe("fila geral: Imprimir agora, sem modal", () => {
  it("impressora LIVRE: um clique inicia a peça inteira com o payload de sempre; livres vêm primeiro no select", async () => {
    await montar(1280, retrato({ fila: true }));
    const sel = $('[data-testid="reservar-fila-f1"]') as HTMLSelectElement;
    expect(sel.options[1].textContent).toBe("Impressora 2 — livre");
    expect(sel.options[4].textContent).toBe("Impressora 1 (New XT) — imprimindo #0101");
    const agora = () => $('[data-testid="button-imprimir-agora-f1"]') as HTMLButtonElement;
    expect(agora().disabled).toBe(true); // sem impressora escolhida
    await act(async () => { fireEvent.change(sel, { target: { value: "3" } }); });
    expect(agora().disabled).toBe(false);
    // "Imprimir agora" é o principal (sólido); "Reservar" é o de contorno.
    expect(agora().style.color).toMatch(/255|#fff/i);
    expect(($('[data-testid="button-reservar-f1"]') as HTMLElement).style.border).toContain("1px solid");
    const { escritas } = fetchPorUrl();
    // Duplo clique não inicia duas vezes.
    await act(async () => { fireEvent.click(agora()); fireEvent.click(agora()); });
    await tick(30);
    expect(escritas()).toEqual([{ url: "/api/items/f1/start-printing", body: { printMachine: "3" } }]);
    expect($('[role="dialog"]')).toBeNull(); // sem modal
  });

  it("PARCIAL: 4 de 10 → iniciarParte + quantidade (o resto continua na fila)", async () => {
    await montar(1280, retrato({ fila: true }));
    await act(async () => { fireEvent.change($('[data-testid="reservar-fila-f2"]')!, { target: { value: "2" } }); });
    await act(async () => { fireEvent.change($('[data-testid="qtd-reservar-f2"]')!, { target: { value: "4" } }); });
    const { escritas } = fetchPorUrl();
    await act(async () => { fireEvent.click($('[data-testid="button-imprimir-agora-f2"]')!); });
    await tick(30);
    expect(escritas()).toEqual([{ url: "/api/items/f2/start-printing", body: { printMachine: "2", iniciarParte: true, quantidade: 4 } }]);
  });

  // Dono (21/09): "caso a impressora esteja imprimindo algo, não dá para colocar outra; não faz
  // sentido dar [o Imprimir junto]. O que podemos implementar é TIRAR um item e COLOCAR o outro."
  it("impressora OCUPADA: 'Imprimir agora' desabilitado com o motivo; só Reservar — ou 'Imprimir esta no lugar', com a pergunta clara", async () => {
    await montar(1280, retrato({ fila: true }));
    const { escritas } = fetchPorUrl();
    await act(async () => { fireEvent.change($('[data-testid="reservar-fila-f1"]')!, { target: { value: "1" } }); });
    const agora = $('[data-testid="button-imprimir-agora-f1"]') as HTMLButtonElement;
    expect(agora.disabled).toBe(true);
    expect(agora.getAttribute("title")).toBe("Impressora 1 (New XT) está com #0101");
    expect($('[data-testid="ocupada-f1"]')!.textContent).toContain("Impressora 1 (New XT) está com #0101 — dá para reservar, ou imprimir esta no lugar.");
    expect($('[data-testid="button-imprimir-junto-f1"]')).toBeNull();
    expect(($('[data-testid="button-reservar-f1"]') as HTMLButtonElement).disabled).toBe(false);
    // A troca por prioridade pede confirmação e diz o que acontece com a que sai.
    await act(async () => { fireEvent.click($('[data-testid="button-imprimir-no-lugar-f1"]')!); });
    expect(escritas()).toEqual([]);
    expect($('[data-testid="confirmar-troca-f1"]')!.textContent).toContain("Tirar #0101 (Backdrop — lona 440g) da Impressora 1 (New XT) (3 de 10 já impressas ficam anotadas) e imprimir #0201 (Placa de octanorme grande para o pórtico — lona 440g) no lugar? A #0101 volta para o topo da fila desta impressora com as 7 que faltam.");
    await act(async () => { fireEvent.click($('[data-testid="button-cancelar-troca-f1"]')!); });
    expect($('[data-testid="confirmar-troca-f1"]')).toBeNull();
    await act(async () => { fireEvent.click($('[data-testid="button-imprimir-no-lugar-f1"]')!); });
    await act(async () => { fireEvent.click($('[data-testid="button-trocar-f1"]')!); });
    await tick(30);
    const posts = (fetchMockDe() as any).mock.calls.filter((c: any) => c[1]?.method === "POST").map((c: any) => ({ url: String(c[0]), body: JSON.parse(String(c[1].body)) }));
    expect(posts).toEqual([{ url: "/api/grafica/maquinas/1/trocar", body: { tirarItemId: "p1", colocarItemId: "f1", quantidade: 10 } }]);
  });

  it("CARTÃO ocupado: a fila NÃO inicia — botão desabilitado, motivo em 12px e 'Imprimir esta no lugar'; 'Tirar da impressora' libera", async () => {
    const r = retrato({ fila: true });
    // A #0204 e a #0205 estão na fila da Impressora 1, que imprime a #0101.
    (r.maquinas[0] as any).naFila = (r.maquinas[1] as any).naFila.map((x: any) => ({ ...x, maquinaPrevista: "1", reservadas: 10 }));
    (r.maquinas[1] as any).naFila = [];
    await montar(1280, r);
    const iniciar = $('[data-testid="button-iniciar-fila-f4"]') as HTMLButtonElement;
    expect(iniciar.disabled).toBe(true);
    expect(iniciar.getAttribute("data-proxima")).toBeNull(); // ocupada não tem "Próxima"
    const motivo = $('[data-testid="fila-ocupada-f4"] [role="status"]') as HTMLElement;
    expect(motivo.textContent).toBe("A impressora está com #0101 — tire-a, troque-a de máquina ou espere acabar");
    expect(px(motivo.style.fontSize)).toBe(12);
    expect($('[data-testid="mover-fila-f4"]')).toBeTruthy(); // a outra saída continua ali
    fetchPorUrl();
    await act(async () => { fireEvent.click($('[data-testid="button-imprimir-no-lugar-fila-f4"]')!); });
    expect($('[data-testid="confirmar-troca-fila-f4"]')!.textContent).toContain("Tirar #0101 (Backdrop — lona 440g) da Impressora 1 (New XT) (3 de 10 já impressas ficam anotadas) e imprimir #0204 (Backdrop — lona 440g) no lugar?");
    await act(async () => { fireEvent.click($('[data-testid="button-trocar-fila-f4"]')!); });
    await tick(30);
    const posts = () => (fetchMockDe() as any).mock.calls.filter((c: any) => c[1]?.method === "POST").map((c: any) => ({ url: String(c[0]), body: JSON.parse(String(c[1].body)) }));
    expect(posts()[0]).toEqual({ url: "/api/grafica/maquinas/1/trocar", body: { tirarItemId: "p1", colocarItemId: "f4", quantidade: 10 } });
    // "Tirar da impressora", sozinho: pausa e deixa a impressora livre.
    await act(async () => { fireEvent.click($('[data-testid="button-tirar-da-impressora-p1"]')!); });
    await tick(30);
    expect(posts()[1]).toEqual({ url: "/api/grafica/maquinas/1/pausar", body: { itemId: "p1" } });
  });

  it("quando a impressora ESVAZIA, a 'Próxima' volta a ser o botão do cartão; a pausada vem primeiro na fila; o diário conta a pausa", async () => {
    const r = retrato({ fila: true, imprimindo: false });
    (r.maquinas[0] as any).naFila = [
      { ...naFila("n1", "#0398", "Lona", "1", 1), reservadas: 10 },
      { ...naFila("n2", "#0386", "Placa", "1", 30), reservadas: 7, impressas: 3, pausadaEm: "2026-09-21T14:03:00.000Z" },
    ];
    (r.maquinas[0].registros as any).unshift({ ...registro("rp", "n2", "#0386", "pausa", 0, 3, "11:03", -1), deuLugarA: "#0398" });
    await montar(1280, r);
    // A pausada (#0386) sobe para o topo mesmo com a saída do caminhão mais longe — e é ela a "Próxima".
    expect($$('[data-testid="fila-maquina-1"] [data-testid^="peca-na-fila-"]').map((e) => e.getAttribute("data-testid"))).toEqual(["peca-na-fila-n2", "peca-na-fila-n1"]);
    const proxima = $('[data-testid="button-iniciar-fila-n2"]') as HTMLButtonElement;
    expect(proxima.disabled).toBe(false);
    expect(proxima.textContent).toBe("Próxima: #0386 · Iniciar 7 un.");
    expect($('[data-testid="peca-na-fila-n2"]')!.textContent).toContain("Pausada — volta primeiro");
    expect($('[data-testid="peca-na-fila-n2"]')!.textContent).toContain("3 de 10 já impressas");
    expect($('[data-testid="fila-ocupada-n1"]')).toBeNull();
    await act(async () => { fireEvent.click($('[data-testid="aba-diario"]')!); });
    await tick(20);
    expect($('[data-testid="linha-diario-rp"]')!.textContent).toContain("Pausou — deu lugar à #0398 (3 de 10 impressas)");
  });

  it("CELULAR: as saídas do cartão ocupado têm 44px e ocupam a linha inteira", async () => {
    const r = retrato({ fila: true });
    (r.maquinas[0] as any).naFila = [{ ...naFila("n1", "#0398", "Lona", "1", 1), reservadas: 10 }];
    await montar(390, r);
    const noLugar = $('[data-testid="button-imprimir-no-lugar-fila-n1"]')!;
    expect(px(noLugar.style.minHeight)).toBe(44);
    expect(noLugar.style.flex).toBe("1 1 100%");
    expect(px(($('[data-testid="button-tirar-da-impressora-p1"]') as HTMLElement).style.minHeight)).toBe(44);
    await act(async () => { fireEvent.click(noLugar); });
    for (const b of $$('[data-testid="confirmar-troca-fila-n1"] button')) expect(px(b.style.minHeight)).toBe(44);
  });

  it("cartão LIVRE com fila: a primeira é a 'Próxima', em destaque; a Solicitação não vê 'Imprimir agora'; no celular ele vem em cima, na linha inteira", async () => {
    await montar(1280, retrato({ fila: true }));
    const proxima = $('[data-testid="button-iniciar-fila-f4"]')!;
    expect(proxima.textContent).toBe("Próxima: #0204 · Iniciar 10 un.");
    expect(proxima.getAttribute("data-proxima")).toBe("true");
    expect($('[data-testid="button-iniciar-fila-f5"]')!.getAttribute("data-proxima")).toBeNull();
    cleanup();
    papel.atual = "solicitacao";
    await montar(1280, retrato({ fila: true }));
    expect($('[data-testid="button-imprimir-agora-f1"]')).toBeNull();
    cleanup();
    papel.atual = "grafica";
    await montar(390, retrato({ fila: true }));
    const agora = $('[data-testid="button-imprimir-agora-f1"]')!;
    expect(agora.style.flex).toBe("1 1 100%");
    expect(agora.style.order).toBe("-1");
    expect(px(agora.style.minHeight)).toBe(44);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O FIM DAS LISTAS (dono, 21/09): "não está cortando, mas parece que corta".
// ─────────────────────────────────────────────────────────────────────────────
describe("as listas FECHAM e a página respira no fim", () => {
  it("fila geral: '3 de 3 peças' quando tudo está à vista; com mais, 'Mostrando 20 de 25' + o botão no mesmo rodapé", async () => {
    await montar(1280, retrato({ fila: true }));
    const fecho = $('[data-testid="fecho-fila-geral"]')!;
    expect(fecho.textContent).toBe("3 de 3 peças");
    expect(fecho.getAttribute("data-fim")).toBe("true");
    expect(fecho.style.borderTop).toContain("1px solid");
    // O cartão fecha: borda e raio no contêiner, e nenhuma linha com borda de baixo (só de cima).
    const caixa = fecho.parentElement!.parentElement!;
    expect(caixa.style.border).toContain("1px solid");
    expect(px(caixa.style.borderRadius)).toBeGreaterThanOrEqual(8);
    expect($$('[data-testid^="fila-peca-"]').filter((e) => e.style.borderBottom)).toEqual([]);
    // Respiro no fim da página.
    expect(px($('[data-testid="pagina-maquinas"]')!.style.paddingBottom)).toBeGreaterThanOrEqual(64);
    cleanup();
    const muitas = retrato({ fila: true });
    muitas.filaGeral = Array.from({ length: 25 }, (_, i) => naFila(`m${i}`, `#03${String(i).padStart(2, "0")}`, "Lona", null, i + 1)) as any;
    await montar(1280, muitas);
    expect($('[data-testid="fecho-fila-geral"]')!.textContent).toBe("Mostrando 20 de 25 peçasMostrar mais 5");
    await act(async () => { fireEvent.click($('[data-testid="button-fila-toda"]')!); });
    expect($('[data-testid="fecho-fila-geral"]')!.textContent).toBe("25 de 25 peças");
  });

  it("diário e resumo também dizem o fim; o bloco 'Na fila' do cartão se limita a 5 no desktop", async () => {
    await montar(1280, retrato(), { url: "/grafica/maquinas?aba=diario" });
    expect($('[data-testid="fecho-diario"]')!.textContent).toBe("3 de 3 lançamentos");
    cleanup();
    await montar(1280, retrato(), { url: "/grafica/maquinas?aba=resumo" });
    expect($('[data-testid="fecho-resumo"]')!.textContent).toBe("Fim do resumo do dia");
    cleanup();
    const cheia = retrato({ fila: true });
    (cheia.maquinas[1] as any).naFila = Array.from({ length: 8 }, (_, i) => naFila(`c${i}`, `#04${String(i).padStart(2, "0")}`, "Totem", "2", i + 1));
    await montar(1280, cheia);
    expect($$('[data-testid="fila-maquina-2"] [data-testid^="peca-na-fila-"]').length).toBe(5);
    const ver = $('[data-testid="fila-maquina-ver-todas-2"]')!;
    expect(ver.textContent).toContain("Ver as 8 da fila");
    await act(async () => { fireEvent.click(ver); });
    expect($$('[data-testid="fila-maquina-2"] [data-testid^="peca-na-fila-"]').length).toBe(8);
  });

  it("celular: o respiro soma a área segura e cresce com a barra de lote grudada", async () => {
    await montar(390, retrato({ fila: true }));
    const pagina = () => $('[data-testid="pagina-maquinas"]')!.style.paddingBottom;
    expect(pagina()).toBe("calc(72px + env(safe-area-inset-bottom))");
    await act(async () => { fireEvent.click($('[data-testid="selecionar-fila-f1"]')!); });
    expect(pagina()).toBe("calc(160px + env(safe-area-inset-bottom))");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A DESCRIÇÃO e a FICHA (dono, 21/09): "aqui precisa da descrição do item"
// (todas eram "2×1") e "quando clicar, abrir o card com as informações do item".
// ─────────────────────────────────────────────────────────────────────────────
describe("duas peças 2×1 são distinguíveis em cada lista, e o título abre a ficha", () => {
  const duas = () => {
    const r = retrato({ fila: true });
    const x = (id: string, cod: string, descricao: string, maquinaPrevista: string | null, extra: Record<string, unknown> = {}) =>
      ({ ...naFila(id, cod, "2×1", maquinaPrevista, 3), descricao, material: "SANETT", medida: "1,90 × 0,90", patrocinadores: [descricao.replace("2×1 ", "")], ...extra });
    r.filaGeral = [x("d1", "#0400", "2×1 Nubank", null), x("d2", "#0401", "2×1 Santander", null)] as any;
    (r.maquinas[1] as any).naFila = [x("d3", "#0402", "Logo Caixa", "2", { reservadas: 10 }), x("d4", "#0403", "2×1 Itaú", "2", { reservadas: 10 })];
    r.maquinas[0].imprimindo = [{ ...peca("d5", "#0404", 3, 10, "1"), tipo: "2×1", descricao: "2×1 Bradesco", material: "SANETT", medida: "1,90 × 0,90", patrocinadores: ["Bradesco"] } as any];
    r.maquinas[0].registros = [{ ...registro("rd1", "d5", "#0404", "parcial", 3, 3, "10:12", 0), tipoPeca: "2×1", descricaoPeca: "2×1 Bradesco" }, { ...registro("rd2", "d1", "#0400", "inicio", 0, 0, "09:00", 1), tipoPeca: "2×1", descricaoPeca: "2×1 Nubank" }] as any;
    return r;
  };

  it("a regra pura do nome: descrição em destaque; tipo só quando não é repetição", async () => {
    const { nomeDaPeca, partesDoNomeDaPeca } = await import("@shared/nome-da-peca");
    expect(partesDoNomeDaPeca("2×1", "2×1 Nubank")).toEqual({ destaque: "2×1 Nubank", tipo: null });
    expect(partesDoNomeDaPeca("2×1", "2x1 Nubank")).toEqual({ destaque: "2x1 Nubank", tipo: null }); // x e × são a mesma coisa
    expect(partesDoNomeDaPeca("2×1", "Logo Caixa")).toEqual({ destaque: "Logo Caixa", tipo: "2×1" });
    expect(partesDoNomeDaPeca("Backdrop", "")).toEqual({ destaque: "Backdrop", tipo: null });
    expect(partesDoNomeDaPeca("Backdrop", "backdrop")).toEqual({ destaque: "Backdrop", tipo: null });
    expect(nomeDaPeca("2×1", "Logo Caixa")).toBe("2×1 — Logo Caixa");
    expect(nomeDaPeca("2×1", "2×1 Nubank")).toBe("2×1 Nubank");
  });

  it("fila geral, 'Na fila', cartão imprimindo, seletor e diário mostram a descrição — e material · medida · patrocinador", async () => {
    await montar(1280, duas());
    expect($('[data-testid="nome-fila-geral-d1"]')!.textContent).toBe("#04002×1 Nubank");
    expect($('[data-testid="nome-fila-geral-d2"]')!.textContent).toBe("#04012×1 Santander");
    expect($('[data-testid="apoio-d1"]')!.textContent).toBe("SANETT · 1,90 × 0,90 · Nubank");
    expect($('[data-testid="nome-fila-d3"]')!.textContent).toBe("#0402Logo Caixa2×1"); // o tipo entra como apoio
    expect($('[data-testid="nome-fila-d4"]')!.textContent).toBe("#04032×1 Itaú");
    expect($('[data-testid="nome-peca-d5"]')!.textContent).toBe("#04042×1 Bradesco");
    expect($('[data-testid="peca-na-maquina-d5"]')!.textContent).toContain("SANETT · 1,90 × 0,90 · Bradesco");
    // Nada cortado: 2 linhas com clamp, sem reticências de linha única.
    for (const id of ["nome-fila-geral-d1", "nome-fila-d3", "nome-peca-d5"]) {
      const el = $(`[data-testid="${id}"]`)!;
      expect(el.style.webkitLineClamp || (el.style as any).WebkitLineClamp, id).toBe("2");
      expect(el.style.whiteSpace, id).not.toBe("nowrap");
    }
    // Seletor "Escolher peça".
    await act(async () => { fireEvent.click($('[data-testid="link-escolher-peca-3"]')!); });
    await tick(30);
    expect($('[data-testid="escolher-peca-d1"]')!.textContent).toContain("2×1 Nubank");
    expect($('[data-testid="escolher-peca-d2"]')!.textContent).toContain("2×1 Santander");
    expect($('[data-testid="escolher-peca-d1"]')!.textContent).toContain("SANETT · 1,90 × 0,90 · Nubank");
    cleanup();
    // Diário.
    await montar(1280, duas(), { url: "/grafica/maquinas?aba=diario" });
    expect($('[data-testid="nome-diario-rd1"]')!.textContent).toBe("#04042×1 Bradesco");
    expect($('[data-testid="nome-diario-rd2"]')!.textContent).toBe("#04002×1 Nubank");
  });

  it("clicar no TÍTULO abre a ficha (a mesma da Gráfica); a área de ações não abre; o link do código não leva mais para a Gráfica", async () => {
    await montar(1280, duas());
    const { queryClient } = await import("@/lib/queryClient");
    const titulo = $('[data-testid="nome-fila-geral-d1"]') as HTMLButtonElement;
    expect(titulo.tagName).toBe("BUTTON"); // Enter/Espaço abrem, de graça
    expect(titulo.getAttribute("aria-label")).toBe("Ver detalhes de #0400");
    expect($('[data-testid="fila-peca-d1"] a[href^="/grafica?item="]')).toBeNull();
    // Mexer nos controles NÃO abre a ficha.
    await act(async () => { fireEvent.change($('[data-testid="reservar-fila-d1"]')!, { target: { value: "3" } }); });
    await act(async () => { fireEvent.click($('[data-testid="qtd-reservar-d1"]')!); });
    expect($('[data-testid="ficha-carregando"]')).toBeNull();
    // Sob demanda: enquanto a peça completa não chega, o aviso de carregando (com saída).
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    await act(async () => { fireEvent.click(titulo); });
    await tick(30);
    expect($('[data-testid="ficha-carregando"]')!.textContent).toContain("Buscando as informações da peça…");
    expect($('[data-testid="ficha-carregando"] a[href="/grafica?item=d1"]')).toBeTruthy();
    // A peça chega (a lista que a Gráfica usa) → a ficha de verdade abre.
    await act(async () => {
      queryClient.setQueryData(["/api/items/approved"], [{ id: "d1", displayId: "#0400", type: "2×1", description: "2×1 Nubank", status: "approved", quantity: 10, material: "SANETT", finish: "Ilhós", measurement: "1,90 × 0,90", eventId: "ev1", event: { id: "ev1", name: "Maratona SP" }, sponsors: [] }]);
    });
    await tick(60);
    expect($('[data-testid="ficha-carregando"]')).toBeNull();
    const ficha = $$('[role="dialog"]').find((d) => (d.textContent ?? "").includes("2×1 Nubank"));
    expect(ficha).toBeTruthy();
    expect(ficha!.textContent).toContain("#0400");
    expect($('[data-testid="ficha-ver-na-grafica"]')!.getAttribute("href")).toBe("/grafica?item=d1");
  }, 20_000);

  it("cartão imprimindo, 'Na fila', diário e seletor também abrem a ficha; no celular o título tem 44px", async () => {
    await montar(390, duas());
    const { queryClient } = await import("@/lib/queryClient");
    queryClient.setQueryData(["/api/items/approved"], [
      { id: "d5", displayId: "#0404", type: "2×1", description: "2×1 Bradesco", status: "inProduction", quantity: 10, material: "SANETT", finish: "", measurement: "", eventId: "ev1", event: { id: "ev1", name: "Maratona SP" }, sponsors: [] },
      { id: "d3", displayId: "#0402", type: "2×1", description: "Logo Caixa", status: "approved", quantity: 10, material: "SANETT", finish: "", measurement: "", eventId: "ev1", event: { id: "ev1", name: "Maratona SP" }, sponsors: [] },
    ]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } })));
    for (const [testId, texto] of [["nome-peca-d5", "2×1 Bradesco"], ["nome-fila-d3", "Logo Caixa"]] as const) {
      const titulo = $(`[data-testid="${testId}"]`) as HTMLElement;
      expect(px(titulo.style.minHeight), testId).toBe(44);
      await act(async () => { fireEvent.click(titulo); });
      await tick(60);
      const ficha = $$('[role="dialog"]').find((d) => (d.textContent ?? "").includes(texto));
      expect(ficha, testId).toBeTruthy();
      await act(async () => { fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" }); });
      await tick(60);
    }
    // No seletor a linha ESCOLHE a peça; a ficha abre pelo botão ao lado (44px).
    await act(async () => { fireEvent.click($('[data-testid="link-escolher-peca-3"]')!); });
    await tick(30);
    const olho = $('[data-testid="ficha-d1"]') as HTMLElement;
    expect(olho.getAttribute("aria-label")).toBe("Ver detalhes de #0400");
    expect(px(olho.style.minHeight)).toBe(44);
    expect(px(olho.style.minWidth)).toBe(44);
  }, 30_000);
});

describe("o modal de impressão com a peça FORA da máquina", () => {
  it("só a impressora e UM botão; o campo que aparece é o de QUANTAS VÃO para a impressora — não o de impressas", async () => {
    prepararJsdom(1280);
    const { ModalImpressao } = await import("@/components/grafica/modal-impressao");
    const { queryClient } = await import("@/lib/queryClient");
    const item = { id: "p5", displayId: "#0105", type: "Placa", status: "ready_for_production", quantity: 10, quantityProduced: 0, reuseQty: 0, printMachine: null, event: { name: "Meia do Rio" } };
    await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(ModalImpressao as any, { item, onFechar: () => {} }))); });
    await tick(30);
    expect($('[data-testid="form-impressao"]')!.getAttribute("data-etapa")).toBe("iniciar");
    expect($('[data-testid="input-quantity-produced"]')).toBeNull();
    expect($('[data-testid="button-confirm-production"]')).toBeNull();
    const iniciar = () => $('[data-testid="button-iniciar-impressao"]') as HTMLButtonElement;
    expect(iniciar().disabled).toBe(true);
    expect(iniciar().textContent).toBe("Iniciar impressão");
    await act(async () => { fireEvent.click($('[data-testid="maquina-4"]')!); });
    expect(iniciar().disabled).toBe(false);
    expect(iniciar().textContent).toBe("Iniciar tudo (10) na Impressora 4 (Targa Elite)");
    expect($('[role="dialog"]')!.textContent).toContain("Escolha a impressora e inicie a impressão");
  });

  // Dono (21/09), modal aberto pela Gráfica, #0399 · 28 un.: "ainda não consigo colocar a quantidade".
  it("ETAPA 1 com QUANTIDADE: 10 de 28 na Impressora 2 → iniciarParte; tudo → o payload de sempre; limites", async () => {
    prepararJsdom(1280);
    const { ModalImpressao, contaDoInicio } = await import("@/components/grafica/modal-impressao");
    const { queryClient } = await import("@/lib/queryClient");
    const item = { id: "p399", displayId: "#0399", type: "Placa", status: "ready_for_production", quantity: 28, quantityProduced: 0, reuseQty: 0, printMachine: null, event: { name: "Meia do Rio" } };
    await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(ModalImpressao as any, { item, onFechar: () => {} }))); });
    await tick(30);
    // O campo só aparece DEPOIS de escolher a impressora.
    expect($('[data-testid="quantas-vao"]')).toBeNull();
    await act(async () => { fireEvent.click($('[data-testid="maquina-2"]')!); });
    const campo = $('[data-testid="input-quantidade-iniciar"]') as HTMLInputElement;
    expect(campo.value).toBe("28");
    expect(campo.getAttribute("max")).toBe("28");
    expect(campo.getAttribute("inputmode")).toBe("numeric");
    const iniciar = () => $('[data-testid="button-iniciar-impressao"]') as HTMLButtonElement;
    expect(iniciar().textContent).toBe("Iniciar tudo (28) na Impressora 2");
    expect($('[data-testid="linha-quantas-vao"]')!.textContent).toBe("Todas as 28 vão para a Impressora 2");
    await act(async () => { fireEvent.change(campo, { target: { value: "10" } }); });
    expect($('[data-testid="linha-quantas-vao"]')!.textContent).toBe("10 vão para a Impressora 2 · 18 continuam liberadas (sem impressora)");
    expect(iniciar().textContent).toBe("Iniciar 10 un. na Impressora 2");
    // Limites: 0, vazio e 29 travam o botão e dizem a faixa.
    for (const v of ["0", "", "29"]) {
      await act(async () => { fireEvent.change(campo, { target: { value: v } }); });
      expect(iniciar().disabled, `valor "${v}"`).toBe(true);
      expect($('[data-testid="linha-quantas-vao"]')!.textContent).toBe("Informe de 1 a 28 — é o que pode ir para a Impressora 2 agora.");
    }
    await act(async () => { fireEvent.change(campo, { target: { value: "10" } }); });
    const { escritas, mock } = fetchPorUrl();
    await act(async () => { fireEvent.click(iniciar()); });
    await tick(30);
    expect(escritas()[0]).toEqual({ url: "/api/items/p399/start-printing", body: { printMachine: "2", quantidade: 10, iniciarParte: true } });
    // "Tudo" volta ao payload de sempre.
    mock.mockClear();
    await act(async () => { fireEvent.click($('[data-testid="button-iniciar-tudo"]')!); });
    expect(campo.value).toBe("28");
    await act(async () => { fireEvent.click(iniciar()); });
    await tick(30);
    expect(escritas()[0]).toEqual({ url: "/api/items/p399/start-printing", body: { printMachine: "2" } });

    // A conta pura: com 20 reservadas à Impressora 1, a Impressora 2 só pode receber as 8 sem impressora;
    // a Impressora 1 nasce com as 20 dela e pode chegar a 28.
    const reservada = { ...item, reservaPorMaquina: { "1": 20 } } as any;
    expect(contaDoInicio(reservada, "2", null, null, null)).toMatchObject({ disponivel: 8, padrao: 8, n: 8, inteira: false, valida: true });
    expect(contaDoInicio(reservada, "2", null, null, null).linha).toBe("8 vão para a Impressora 2 · 20 continuam liberadas (20 já reservadas a outra impressora)");
    expect(contaDoInicio(reservada, "1", null, null, null)).toMatchObject({ disponivel: 28, reservadas: 20, padrao: 20, n: 20, inteira: false });
    expect(contaDoInicio(reservada, "1", 28, null, null)).toMatchObject({ n: 28, inteira: true, valida: true });
    expect(contaDoInicio(reservada, "2", 9, null, null).valida).toBe(false);
    // Abriu para a parte reservada à 1 e trocou para a 4 na hora: a reserva da 1 vai junto.
    expect(contaDoInicio(reservada, "4", null, { quantidade: 20, daReserva: true }, "1")).toMatchObject({ origem: "1", disponivel: 28, padrao: 20, n: 20, valida: true });
    // Peça JÁ em impressão com parte (10 na Impressora 2): o resto são 18, e nunca é "inteira".
    const emParte = { ...item, status: "inProduction", printMachine: "2", impressaoPorMaquina: { "2": { atrib: 10, impressas: 0 } } } as any;
    expect(contaDoInicio(emParte, "3", null, { quantidade: 18, daReserva: false }, null)).toMatchObject({ disponivel: 18, n: 18, inteira: false, valida: true });
  });
});

describe("o modal com a peça EM impressão mas SEM impressora anotada (legado)", () => {
  it("nasce com o painel de impressora aberto; 'Confirmar impressora' grava início; impressas travadas até lá", async () => {
    prepararJsdom(1280);
    const { ModalImpressao } = await import("@/components/grafica/modal-impressao");
    const { queryClient } = await import("@/lib/queryClient");
    const item = { id: "p7", displayId: "#0107", type: "Placa", status: "inProduction", quantity: 10, quantityProduced: 2, reuseQty: 0, printMachine: null, event: { name: "Meia do Rio" } };
    await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(ModalImpressao as any, { item, onFechar: () => {} }))); });
    await tick(30);
    expect($('[data-testid="form-impressao"]')!.getAttribute("data-etapa")).toBe("impressas");
    expect($('[data-testid="painel-troca"]')).toBeTruthy();
    expect($('[data-testid="button-trocar-maquina"]')).toBeNull();
    expect($('[data-testid="onde-esta"]')!.textContent).toContain("impressora não anotada");
    const confirmar = () => $('[data-testid="button-iniciar-impressao"]') as HTMLButtonElement;
    expect(confirmar().textContent).toBe("Confirmar impressora");
    expect(confirmar().disabled).toBe(true);
    await act(async () => { fireEvent.click($('[data-testid="maquina-2"]')!); });
    expect(confirmar().textContent).toBe("Confirmar Impressora 2");
    expect(confirmar().disabled).toBe(false);
    // Informar impressas fica travado, com aviso, até a impressora existir.
    const salvar = $('[data-testid="button-confirm-production"]') as HTMLButtonElement;
    const campo = $('[data-testid="input-quantity-produced"]') as HTMLInputElement;
    await act(async () => { fireEvent.change(campo, { target: { value: "5" } }); });
    expect(salvar.disabled).toBe(true);
    expect($('[data-testid="aviso-quantidade"]')!.textContent).toBe("Escolha a impressora antes de informar as impressas.");
    // O gesto grava "inicio" (não "troca"): a mutation sai com trocando=false.
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ...item, printMachine: "2" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { fireEvent.click(confirmar()); });
    await tick(30);
    expect(String((fetchMock.mock.calls[0] as any)[0])).toBe("/api/items/p7/start-printing");
    expect(JSON.parse(String((fetchMock.mock.calls[0] as any)[1].body))).toEqual({ printMachine: "2" });
  });
});

describe("a aba Máquinas no celular", () => {
  it("sem tabela; alvos de 44; campo de data a 16px; nada mais largo que a tela", async () => {
    await montar(390, retrato(), { url: "/grafica/maquinas?aba=diario" });
    expect($("table")).toBeNull();
    expect($('[data-testid="diario-cartoes"]')).toBeTruthy();
    const ruins: string[] = [];
    for (const el of $$("button, a[href], input")) {
      if (el.closest(".sr-only")) continue;
      const alt = Math.max(px(el.style.minHeight), px(el.style.height));
      if (alt < 44) ruins.push(`${el.getAttribute("data-testid") ?? el.tagName} altura ${alt}`);
    }
    expect(ruins).toEqual([]);
    expect(px(($('[data-testid="escolher-data"]') as HTMLInputElement).style.fontSize)).toBe(16);
    for (const el of $$("*")) {
      for (const v of [el.style.width, el.style.minWidth]) expect(px(v), `${el.tagName} ${v}`).toBeLessThanOrEqual(390);
    }
    // A informação nunca cai abaixo de 12px no celular.
    const miudas = $$("*").filter((el) => {
      const fs = px(el.style.fontSize);
      return fs > 0 && fs < 12 && Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 1);
    });
    expect(miudas.map((e) => `${e.textContent?.slice(0, 30)} (${e.style.fontSize})`)).toEqual([]);
  });
});
