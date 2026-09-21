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

function retrato(opts: { registros?: boolean; imprimindo?: boolean; muitos?: number } = {}) {
  const { registros = true, imprimindo = true, muitos = 0 } = opts;
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
      { codigo: "2", rotulo: "Impressora 2", imprimindo: [], registros: regs2, unidadesNoDia: registros ? 4 : 0, pecasNoDia: registros ? 1 : 0 },
      { codigo: "3", rotulo: "Impressora 3", imprimindo: [], registros: [], unidadesNoDia: 0, pecasNoDia: 0 },
      { codigo: "4", rotulo: "Impressora 4 (Targa Elite)", imprimindo: [], registros: [], unidadesNoDia: 0, pecasNoDia: 0 },
    ],
    semMaquina: [],
  };
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

async function montar(largura: number, dados: any | null) {
  prepararJsdom(largura);
  window.history.replaceState({}, "", "/grafica/maquinas");
  const { queryClient } = await import("@/lib/queryClient");
  const Pagina = (await import("@/pages/grafica-maquinas")).default;
  queryClient.clear();
  if (dados) queryClient.setQueryData(["/api/grafica/maquinas"], dados);
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
    expect($('[data-testid="link-escolher-peca-2"]')!.getAttribute("href")).toBe("/grafica?status=ready_for_production,approved");
    expect($('[data-testid="link-grafica-em-impressao"]')!.getAttribute("href")).toBe("/grafica?status=inProduction");
    expect($('[data-testid="resumo-agora"]')!.textContent).toBe("1 peça em impressão");
    expect($('[data-testid="atualizado-ha"]')).toBeTruthy();
  });

  it("DIÁRIO: uma lista só na ordem do dia; o chip filtra e grava na URL", async () => {
    await montar(1280, retrato());
    const linhas = () => $$('[data-testid^="linha-diario-"]').map((e) => e.getAttribute("data-testid"));
    expect(linhas()).toEqual(["linha-diario-r1", "linha-diario-r3", "linha-diario-r2"]);
    expect($('[data-testid="chip-maquina-todas"]')!.textContent).toBe("Todas3");
    expect($('[data-testid="chip-maquina-2"]')!.textContent).toBe("Impressora 21");
    expect($('[data-testid="linha-diario-r1"]')!.textContent).toContain("Mandou 3 para acabamento (3 de 10)");
    expect($('[data-testid="linha-diario-r3"]')!.textContent).toContain("Concluiu: 10 de 10 impressas");

    await act(async () => { fireEvent.click($('[data-testid="chip-maquina-2"]')!); });
    await tick(20);
    expect(window.location.search).toBe("?maquina=2");
    expect($('[data-testid="chip-maquina-2"]')!.getAttribute("aria-pressed")).toBe("true");
    expect(linhas()).toEqual(["linha-diario-r3"]);
    // Com uma impressora escolhida a coluna "Impressora" some.
    expect($$('[data-testid="diario-tabela"] th').map((e) => e.textContent)).not.toContain("Impressora");

    // O rodapé do cartão leva ao diário daquela impressora.
    await act(async () => { fireEvent.click($('[data-testid="resumo-dia-1"]')!); });
    await tick(20);
    expect(window.location.search).toBe("?maquina=1");
    expect(linhas()).toEqual(["linha-diario-r1", "linha-diario-r2"]);
  });

  it("DIÁRIO vazio: diz o que fazer; com filtro, oferece 'ver todas'", async () => {
    await montar(1280, retrato({ registros: false }));
    expect($('[data-testid="diario-vazio"]')!.textContent).toContain("Nenhuma impressão registrada hoje.");
    expect($('[data-testid="diario-vazio"]')!.textContent).toContain("Ao iniciar uma impressão na Gráfica, ela aparece aqui.");
    await act(async () => { fireEvent.click($('[data-testid="chip-maquina-3"]')!); });
    await tick(20);
    expect($('[data-testid="diario-vazio"]')!.textContent).toContain("Nada saiu da Impressora 3 hoje.");
    await act(async () => { fireEvent.click($('[data-testid="button-ver-todas"]')!); });
    await tick(20);
    expect(window.location.search).toBe("");
  });

  it("DIÁRIO grande: entra por lotes de 60 com 'mostrar mais'", async () => {
    await montar(1280, retrato({ muitos: 100 }));
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
    const campo = $('[data-testid="input-quantity-produced"]') as HTMLInputElement;
    expect(campo.value).toBe("3");
    const confirmar = () => $('[data-testid="button-confirm-production"]') as HTMLButtonElement;
    expect(confirmar().disabled).toBe(true);
    expect(confirmar().textContent).toBe("Nada mudou");
    await act(async () => { fireEvent.change(campo, { target: { value: "4" } }); });
    expect(confirmar().textContent).toBe("Mandar 1 para acabamento (4 de 10)");
    expect(confirmar().disabled).toBe(false);
    await act(async () => { fireEvent.click($('[data-testid="button-set-total"]')!); });
    expect(confirmar().textContent).toBe("Mandar as últimas 7 e concluir");
    await act(async () => { fireEvent.change(campo, { target: { value: "12" } }); });
    expect(confirmar().disabled).toBe(true);
    expect($('[data-testid="aviso-quantidade"]')!.textContent).toContain("A peça tem 10 un. para imprimir");
    // Trocar de máquina é um link discreto que abre um painel; a atual fica desabilitada.
    await act(async () => { fireEvent.click($('[data-testid="button-trocar-maquina"]')!); });
    expect($('[data-testid="painel-troca"]')).toBeTruthy();
    expect(($('[data-testid="maquina-1"]') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fireEvent.click($('[data-testid="maquina-3"]')!); });
    expect($('[data-testid="button-iniciar-impressao"]')!.textContent).toBe("Mover para a Impressora 3");
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
    await montar(390, retrato());
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
