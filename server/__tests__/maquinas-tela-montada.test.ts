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
    expect(nome.textContent).toBe("#0101Backdrop");
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
    const nome = $('[data-testid="fila-peca-f1"] a span') as HTMLElement;
    expect(nome.style.whiteSpace).not.toBe("nowrap");
  });

  it("RESERVAR manda SÓ { maquina } — nada de status; devolver manda null; o lote usa bulk-", async () => {
    await montar(1280, retrato({ fila: true }));
    const { escritas } = fetchPorUrl();
    const sel = $('[data-testid="reservar-fila-f1"]') as HTMLSelectElement;
    expect(Array.from(sel.options).map((o) => o.textContent)).toEqual(["Reservar para…", "Impressora 1 (New XT)", "Impressora 2", "Impressora 3", "Impressora 4 (Targa Elite)"]);
    await act(async () => { fireEvent.change(sel, { target: { value: "2" } }); });
    await tick(30);
    expect(escritas()).toEqual([{ url: "/api/items/f1/maquina-prevista", body: { maquina: "2" } }]);

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
    expect(iniciar.textContent).toBe("Iniciar impressão na Impressora 2");
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
    expect(($('[data-testid="button-iniciar-impressao"]') as HTMLButtonElement).textContent).toBe("Iniciar impressão na Impressora 2");
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

describe("o modal de impressão com a peça FORA da máquina", () => {
  it("só a impressora e UM botão 'Iniciar impressão na …'; sem campo de quantidade", async () => {
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
    expect(iniciar().textContent).toBe("Iniciar impressão na Impressora 4 (Targa Elite)");
    expect($('[role="dialog"]')!.textContent).toContain("Escolha a impressora e inicie a impressão");
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
