// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// PASSADA DE CELULAR SOBRE O QUE MUDOU EM 21/09 (dono: "verificar que com esses
// ajustes ainda está 10/10 para mobile").
//
// As cinco telas/fluxos que mudaram no dia, MONTADAS a 390px com dados
// realistas, contra a mesma régua da Gráfica mobile (grafica-celular.test.ts):
//   · alvos de toque ≥ 44px; campos ≥ 16px (sem zoom do iOS); letra ≥ 12px;
//   · nada mais largo que a tela; rodapé fixo com env(safe-area-inset-bottom);
//   · teclado aberto (visualViewport encolhe) não esconde o botão primário.
//
//   1. MÁQUINAS — abas, cartões (peça dividida, três ações em largura total),
//      fila geral (select nativo a 16px na linha inteira), seletor de peça,
//      resumo do período com Excel e intervalo.
//   2. MODAL DE IMPRESSÃO — grade 2×2 das impressoras, "Quantas saíram agora?",
//      painel "Mover para" com Tudo/Quantidade, rodapé seguro, teclado.
//   3. GRÁFICA — oito cartões de etapa (Total fecha a última linha), progresso
//      dividido e selo "Fila:" no cartão, "Entregar tubo" antes de "Tirar do
//      tubo", barra "Embalar em lote", filtro Impressora na folha.
//   4. MODAL DE TUBOS — "Embalar #0381" com tubos de 44px, fechar com câmera
//      direta, entregar com recebedor a 16px, rodapé fixo e teclado.
//   5. ETIQUETAS — "Em lista" (era "2x1 em lista") cabe na barra, como alvo de 44.
//
// COMO MEDE: o jsdom não faz layout — as regras são estruturais (estilos inline
// que o navegador vai aplicar). Ver a nota sobre o atalho `padding` com env()
// em grafica-celular.test.ts: por isso os rodapés são escritos nos LONGOS.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;
const LARGURA = 390;

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", name: "Operador", email: "g@g", role: "admin", mustChangePassword: false }, isLoading: false, logout: () => {} }),
}));

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));
const tick = (ms = 0) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
const px = (v: string | null | undefined) => { const m = String(v ?? "").match(/^(-?\d+(?:\.\d+)?)px$/); return m ? Number(m[1]) : NaN; };
const maior = (...vs: number[]) => { const ok = vs.filter((v) => !Number.isNaN(v)); return ok.length ? Math.max(...ok) : NaN; };
const TOCAVEIS = 'button, a[href], [role="checkbox"], input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]), select, textarea';

function visivel(el: Element) {
  for (let e: Element | null = el; e; e = e.parentElement) {
    if (e.classList.contains("sr-only") || e.classList.contains("hidden")) return false;
    if ((e as HTMLElement).style?.display === "none") return false;
  }
  return true;
}
const descrever = (el: Element) => `<${el.tagName.toLowerCase()}> ${(el.getAttribute("data-testid") || el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 48)}`;

/** Alvo de toque declarado (minHeight/height ≥ 44; largura também nos só-ícone). */
function alvosPequenos(raiz: ParentNode = document.body) {
  const ruins: string[] = [];
  for (const el of Array.from(raiz.querySelectorAll<HTMLElement>(TOCAVEIS))) {
    if (!visivel(el)) continue;
    // X nativo do DialogContent (escondido por classe) e X do ModalHeader
    // (44px por CSS global no toque, fora do estilo inline): casca, não tela.
    if (el.parentElement?.className.includes("[&>button:last-child]:hidden") && el === el.parentElement.lastElementChild) continue;
    if (el.getAttribute("title") === "Fechar (Esc)") continue;
    if (el.getAttribute("data-testid") === "button-upload-photo") {
      const m = el.className.match(/min-h-\[(\d+)px\]/);
      if (!m || Number(m[1]) < 44) ruins.push(`${descrever(el)} (uploader sem min-h)`);
      continue;
    }
    // Classe de alvo das etiquetas (min-height por CSS no toque).
    if (el.className.includes("etq-alvo") || el.closest(".etq-alvo")) continue;
    const alt = maior(px(el.style.minHeight), px(el.style.height));
    if (!(alt >= 44)) { ruins.push(`${descrever(el)} (altura ${Number.isNaN(alt) ? "não declarada" : alt})`); continue; }
    const soIcone = (el.textContent ?? "").trim().length <= 2 && el.tagName === "BUTTON";
    if (soIcone && !(maior(px(el.style.minWidth), px(el.style.width), px(el.style.flexBasis)) >= 44)) ruins.push(`${descrever(el)} (largura)`);
  }
  return ruins;
}
/** Campos de texto ≥ 16px; número com teclado numérico. */
function camposRuins(raiz: ParentNode = document.body) {
  const ruins: string[] = [];
  for (const el of Array.from(raiz.querySelectorAll<HTMLInputElement>("input, textarea, select"))) {
    const tipo = el.getAttribute("type") ?? "text";
    if (["hidden", "file", "checkbox", "radio"].includes(tipo) || !visivel(el)) continue;
    if (tipo === "number" && (el.getAttribute("inputmode") !== "numeric" || !el.getAttribute("pattern"))) ruins.push(`${descrever(el)} (sem inputMode/pattern)`);
    const fs = px(el.style.fontSize);
    if (!(fs >= 16)) ruins.push(`${descrever(el)} (fonte ${Number.isNaN(fs) ? "herdada" : fs})`);
  }
  return ruins;
}
/** Texto próprio abaixo de 12px. */
function letrasMiudas(raiz: ParentNode = document.body) {
  const ruins: string[] = [];
  for (const el of Array.from(raiz.querySelectorAll<HTMLElement>("*"))) {
    const fs = px(el.style.fontSize);
    if (!(fs < 12) || !visivel(el)) continue;
    if (Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 1)) ruins.push(`${descrever(el)} (${fs}px)`);
  }
  return ruins;
}
/** Larguras fixas maiores que a tela. */
function largurasFixas(raiz: ParentNode = document.body) {
  const ruins: string[] = [];
  for (const el of Array.from(raiz.querySelectorAll<HTMLElement>("*"))) {
    for (const [nome, v] of [["width", el.style.width], ["minWidth", el.style.minWidth], ["flexBasis", el.style.flexBasis]] as const) {
      if (px(v) > LARGURA) ruins.push(`${descrever(el)} ${nome}=${v}`);
    }
    const cols = String(el.style.gridTemplateColumns || "").match(/(\d+)px/g);
    if (cols && cols.map((c) => px(c)).reduce((a, b) => a + b, 0) > LARGURA) ruins.push(`${descrever(el)} grid`);
  }
  return ruins;
}
/** Sobe do botão até quem declara o recorte seguro de baixo. */
function rodapeSeguro(botao: Element | null) {
  for (let e = botao?.parentElement ?? null; e; e = e.parentElement) {
    if (/safe-area-inset-bottom/.test(e.style.paddingBottom)) return e;
    if (e.getAttribute("role") === "dialog") break;
  }
  return null;
}
/** Nada com reticências de linha única dentro do recorte (o galpão não pode ler "Placa de octa…"). */
const comReticencias = (raiz: ParentNode) => Array.from(raiz.querySelectorAll<HTMLElement>("*")).filter((e) => e.style.textOverflow === "ellipsis" && e.style.whiteSpace === "nowrap").map(descrever);

/** visualViewport falso: o teclado virtual é ele encolhendo. */
function viewportVisivel(altura: number) {
  const alvo = new EventTarget() as any;
  alvo.height = altura; alvo.width = LARGURA; alvo.offsetTop = 0; alvo.offsetLeft = 0; alvo.scale = 1;
  return alvo;
}
const teclado = async (vv: any, altura: number) => { vv.height = altura; await act(async () => { vv.dispatchEvent(new Event("resize")); }); };

/** O que o jsdom não tem e as telas usam. Reaplicado a cada montagem. */
function prepararJsdom() {
  Object.defineProperty(window, "innerWidth", { value: LARGURA, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 760, configurable: true });
  const vv = viewportVisivel(760);
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: /max-width:\s*767px/.test(q), media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
  (Element.prototype as any).scrollIntoView = () => {};
  (Element.prototype as any).hasPointerCapture = () => false;
  (Element.prototype as any).releasePointerCapture = () => {};
  return vv;
}
const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// ═════════════════════════════════════════════════════════════════════════════
// 1 e 2 · MÁQUINAS e o MODAL DE IMPRESSÃO
// ═════════════════════════════════════════════════════════════════════════════
const HOJE = "2026-09-21";
const desdeISO = new Date(Date.now() - 80 * 60000).toISOString();
const evento = { id: "ev1", name: "Maratona Internacional de São Paulo 2026", status: "created", startDate: "2026-12-01T00:00:00Z", reopenedAt: null };
const peca = (id: string, displayId: string, tipo: string, impressas: number, aImprimir: number, maquina: string) => ({
  id, displayId, tipo, descricao: "lona 440g com logo do patrocinador master", evento: evento.name, quantidade: aImprimir, reuso: 0,
  aImprimir, impressas, desde: desdeISO, maquina, status: "inProduction", miniatura: null, eventoInfo: evento,
});
const naFila = (id: string, displayId: string, tipo: string, maquinaPrevista: string | null, dias: number) => ({
  ...peca(id, displayId, tipo, 0, 10, ""), status: "approved", maquina: null, desde: null,
  maquinaPrevista, m2: 4.5, saidaCaminhao: new Date(Date.now() + dias * 86_400_000).toISOString(), prazoProducaoGrafica: -1,
});
function retratoDasMaquinas() {
  const dividida = { ...peca("p1", "#0101", "Placa de octanorme grande para o pórtico de largada", 5, 10, "1"), impressaoPorMaquina: { "1": { atrib: 8, impressas: 5 }, "2": { atrib: 2, impressas: 0 } } };
  const reg = (id: string, tipo: string, quantidade: number, totalDepois: number, hora: string, ordem: number) => ({ id, itemId: "p1", displayId: "#0101", tipoPeca: "Placa", evento: evento.name, tipo, quantidade, totalDepois, aImprimir: 10, hora, quem: "Ana", ordem });
  return {
    dia: HOJE, hoje: HOJE,
    maquinas: [
      { codigo: "1", rotulo: "Impressora 1 (New XT)", imprimindo: [{ ...dividida, maquina: "1", parte: { atrib: 8, impressas: 5 } }], registros: [reg("r1", "parcial", 3, 3, "10:12", 0), reg("r2", "inicio", 0, 0, "09:00", 2)], unidadesNoDia: 3, pecasNoDia: 1 },
      { codigo: "2", rotulo: "Impressora 2", imprimindo: [{ ...dividida, maquina: "2", parte: { atrib: 2, impressas: 0 } }], naFila: [naFila("f4", "#0204", "Backdrop", "2", 1)], registros: [], unidadesNoDia: 0, pecasNoDia: 0 },
      { codigo: "3", rotulo: "Impressora 3", imprimindo: [], registros: [], unidadesNoDia: 0, pecasNoDia: 0 },
      { codigo: "4", rotulo: "Impressora 4 (Targa Elite)", imprimindo: [], registros: [], unidadesNoDia: 0, pecasNoDia: 0 },
    ],
    semMaquina: [],
    filaGeral: [naFila("f1", "#0201", "Placa de octanorme grande para o pórtico", null, 2), naFila("f2", "#0202", "Banner de rua", null, 9)],
  };
}
function relatorioDoDia() {
  const maq = (maquina: string, rotulo: string, extra: Partial<any> = {}) => ({ dia: HOJE, maquina, rotulo, unidades: 0, pecas: 0, concluidas: 0, aindaNaMaquina: 0, primeira: null, ultima: null, minutosAtivos: 0, quem: [], ...extra });
  return { de: HOJE, ate: HOJE, hoje: HOJE, dias: [{ dia: HOJE, maquinas: [maq("1", "Impressora 1 (New XT)", { unidades: 3, pecas: 1, aindaNaMaquina: 1, primeira: "09:00", ultima: "10:12", minutosAtivos: 72, quem: ["Ana"] }), maq("2", "Impressora 2"), maq("3", "Impressora 3"), maq("4", "Impressora 4 (Targa Elite)")], total: { unidades: 3, pecas: 1, concluidas: 0, aindaNaMaquina: 1, minutosAtivos: 72 } }] };
}
async function montarMaquinas(url = "/grafica/maquinas") {
  const vv = prepararJsdom();
  vi.stubGlobal("fetch", vi.fn(async (u: any) => (String(u).includes("/relatorio") ? json(relatorioDoDia()) : String(u).includes("/api/grafica/maquinas") ? json(retratoDasMaquinas()) : json({}))));
  window.history.replaceState({}, "", url);
  const { queryClient } = await import("@/lib/queryClient");
  const Pagina = (await import("@/pages/grafica-maquinas")).default;
  queryClient.clear();
  queryClient.setQueryData(["/api/grafica/maquinas"], retratoDasMaquinas());
  queryClient.setQueryData(["/api/grafica/maquinas/relatorio", `?de=${HOJE}&ate=${HOJE}`], relatorioDoDia());
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Pagina as any, null))); });
  await tick(30);
  return vv;
}

describe("MÁQUINAS a 390px", () => {
  it("AGORA: abas sem cortar, cartão da peça dividida com as três ações em largura total, fila com select de 16px na linha inteira", async () => {
    await montarMaquinas();
    // As abas rolam na horizontal dentro do próprio trilho (nunca cortam nem estouram a página).
    const abas = $('[data-testid="abas-maquinas"]')!;
    expect(abas.style.overflowX).toBe("auto");
    for (const t of $$('[role="tab"]')) { expect(t.style.whiteSpace).toBe("nowrap"); expect(px(t.style.minHeight)).toBeGreaterThanOrEqual(44); }
    // A peça dividida: cada cartão mostra a parte dele e as três ações empilhadas.
    expect($('[data-testid="maquina-agora-1"] [data-testid="progresso-p1"]')!.textContent).toBe("5 de 8 nesta impressora · peça 5 de 10 no total");
    expect($('[data-testid="maquina-agora-2"] [data-testid="progresso-p1"]')!.textContent).toBe("0 de 2 nesta impressora · peça 5 de 10 no total");
    for (const id of ["button-impressas-p1", "button-trocar-maquina-p1", "link-peca-grafica-p1"]) {
      const el = $(`[data-testid="maquina-agora-1"] [data-testid="${id}"]`)!;
      expect(el.style.flex, id).toBe("1 1 100%");
      expect(px(el.style.minHeight), id).toBeGreaterThanOrEqual(44);
    }
    // O nome da impressora e o da peça quebram linha (2 linhas), nunca reticenciam.
    expect(comReticencias($('[data-testid="maquina-agora-1"]')!)).toEqual([]);
    expect($('[data-testid="nome-peca-p1"]')!.style.webkitLineClamp || ($('[data-testid="nome-peca-p1"]')!.style as any).WebkitLineClamp).toBe("2");
    // "Escolher peça" e a fila reservada do cartão 2.
    expect($('[data-testid="link-escolher-peca-3"]')!.style.width).toBe("100%");
    expect($('[data-testid="button-iniciar-fila-f4"]')).toBeTruthy();
    // Fila geral: o select nativo a 16px ocupa a linha inteira (alvo de 44 sem mirar).
    const sel = $('[data-testid="reservar-fila-f1"]') as HTMLSelectElement;
    expect(px(sel.style.fontSize)).toBe(16);
    expect(sel.style.width).toBe("100%");
    expect(px(sel.style.minHeight)).toBe(44);
    await act(async () => { fireEvent.click($('[data-testid="selecionar-fila-f1"]')!); });
    expect(px(($('[data-testid="reservar-lote"]') as HTMLSelectElement).style.fontSize)).toBe(16);
    // A régua inteira sobre a página.
    expect(largurasFixas()).toEqual([]);
    expect(alvosPequenos()).toEqual([]);
    expect(camposRuins()).toEqual([]);
    expect(letrasMiudas()).toEqual([]);
  }, 30_000);

  it("MODAL: grade 2×2 a 48px, 'Quantas saíram agora?' com teclado numérico, rodapé seguro, e o teclado aberto encolhe o modal", async () => {
    const vv = await montarMaquinas();
    // Pelo cartão da Impressora 1 (5 de 8 já saíram: existe o "Corrigir o total").
    await act(async () => { fireEvent.click($('[data-testid="maquina-agora-1"] [data-testid="button-impressas-p1"]')!); });
    await tick(30);
    const dialogo = $('[role="dialog"]')!;
    expect(dialogo.textContent).toContain("Quantas saíram agora?");
    expect($('[data-testid="progresso-no-modal"]')!.textContent).toBe("5 de 8 nesta impressora · peça 5 de 10 no total");
    const campo = $('[data-testid="input-quantity-produced"]') as HTMLInputElement;
    expect(campo.getAttribute("inputmode")).toBe("numeric");
    expect(px(campo.style.fontSize)).toBeGreaterThanOrEqual(16);
    expect(px(($('[data-testid="button-set-total"]') as HTMLElement).style.minHeight)).toBeGreaterThanOrEqual(44);
    expect(px(($('[data-testid="button-corrigir-total"]') as HTMLElement).style.minHeight)).toBe(44);
    // O primário vive no rodapé grudado com o recorte seguro.
    expect(rodapeSeguro($('[data-testid="button-confirm-production"]'))).toBeTruthy();
    expect(px(($('[data-testid="button-confirm-production"]') as HTMLElement).style.minHeight)).toBe(48);
    // "Trocar de máquina" ocupa a linha inteira da faixa; a faixa não corta o texto.
    expect(($('[data-testid="button-trocar-maquina"]') as HTMLElement).style.flex).toBe("1 1 100%");
    expect(comReticencias($('[data-testid="onde-esta"]')!)).toEqual([]);
    // Painel "Mover para": 2×2 a 48px; Tudo/Quantidade a 48; o campo a 16px.
    await act(async () => { fireEvent.click($('[data-testid="button-trocar-maquina"]')!); });
    const grade = $('[data-testid="seletor-maquina"] [role="radio"]')!.parentElement!;
    expect(grade.style.gridTemplateColumns).toBe("repeat(2, 1fr)");
    for (const m of ["1", "2", "3", "4"]) expect(px(($(`[data-testid="maquina-${m}"]`) as HTMLElement).style.minHeight)).toBe(48);
    await act(async () => { fireEvent.click($('[data-testid="maquina-3"]')!); });
    await act(async () => { fireEvent.click($('[data-testid="mover-quantidade"]')!); });
    const mover = $('[data-testid="input-quantidade-mover"]') as HTMLInputElement;
    expect(px(mover.style.fontSize)).toBe(16);
    expect(mover.getAttribute("inputmode")).toBe("numeric");
    // Teclado aberto: o modal cabe na área visível (420 − 16 de respiro).
    await teclado(vv, 420);
    expect(dialogo.style.maxHeight).toBe("404px");
    await teclado(vv, 760);
    expect(dialogo.style.maxHeight).not.toBe("404px");
    expect(alvosPequenos(dialogo)).toEqual([]);
    expect(camposRuins(dialogo)).toEqual([]);
    expect(letrasMiudas(dialogo)).toEqual([]);
    expect(largurasFixas(dialogo)).toEqual([]);
  }, 30_000);

  it("SELETOR DE PEÇA: busca a 16px, itens de 56px, teclado aberto encolhe o modal", async () => {
    const vv = await montarMaquinas();
    await act(async () => { fireEvent.click($('[data-testid="link-escolher-peca-3"]')!); });
    await tick(30);
    const seletor = $('[data-testid="seletor-de-peca"]')!;
    expect(px(($('[data-testid="busca-peca"]') as HTMLInputElement).style.fontSize)).toBe(16);
    for (const b of $$('[data-testid^="escolher-peca-"]')) expect(px(b.style.minHeight)).toBeGreaterThanOrEqual(44);
    await teclado(vv, 420);
    expect(seletor.style.maxHeight).toBe("404px");
    await teclado(vv, 760);
    expect(alvosPequenos(seletor)).toEqual([]);
    expect(letrasMiudas(seletor)).toEqual([]);
    expect(comReticencias(seletor)).toEqual([]);
  }, 30_000);

  it("RESUMO: período, intervalo (datas a 16px) e Exportar Excel cabem — em cartões, sem tabela", async () => {
    await montarMaquinas("/grafica/maquinas?aba=resumo");
    expect($("table")).toBeNull();
    expect($('[data-testid="resumo-cartoes"]')).toBeTruthy();
    for (const id of ["periodo-dia", "periodo-semana", "periodo-mes", "periodo-intervalo", "button-exportar-excel"]) {
      expect(px(($(`[data-testid="${id}"]`) as HTMLElement).style.minHeight), id).toBe(44);
    }
    await act(async () => { fireEvent.click($('[data-testid="periodo-intervalo"]')!); });
    await tick(20);
    expect(px(($('[data-testid="intervalo-de"]') as HTMLInputElement).style.fontSize)).toBe(16);
    expect(px(($('[data-testid="intervalo-ate"]') as HTMLInputElement).style.fontSize)).toBe(16);
    expect(largurasFixas()).toEqual([]);
    expect(alvosPequenos()).toEqual([]);
    expect(camposRuins()).toEqual([]);
    expect(letrasMiudas()).toEqual([]);
  }, 30_000);
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 · A GRÁFICA
// ═════════════════════════════════════════════════════════════════════════════
const DIA = 86_400_000;
const iso = (d: number) => new Date(Date.now() + d * DIA).toISOString();
const EV = { id: "ev1", name: "Maratona Internacional de São Paulo 2026", status: "active", startDate: iso(6).slice(0, 10), truckDepartureDate: iso(3), deadlineProducaoGrafica: -2 };
function pecasDaGrafica() {
  const base = (id: string, n: number, status: string, extra: Partial<any> = {}) => ({
    id, displayId: `#${String(n).padStart(4, "0")}`, type: "Backdrop", description: "Backdrop lona 440g 10KM — patrocinador master com logo aplicado",
    quantity: 10, quantityProduced: 0, conferredQty: 0, deliveredQty: 0, status, eventId: EV.id, event: EV,
    material: "Lona 440g", finish: "Ilhós", calculatedM2: "6.00", fileWidth: "300", fileHeight: "200", visualWidth: "3", visualHeight: "2",
    approvalThumbUrl: null, observations: "", isReuse: false, reuseQty: 0, isPriority: false, kitRemessaId: null, statusChangedAt: iso(-1), ...extra,
  });
  return [
    base("g1", 381, "packed", { quantityProduced: 10, conferredQty: 10, tuboId: "t1" }),
    base("g2", 382, "inProduction", { quantityProduced: 5, printMachine: "1", impressaoPorMaquina: { "1": { atrib: 8, impressas: 5 }, "2": { atrib: 2, impressas: 0 } } }),
    base("g3", 383, "inProduction", { quantityProduced: 3, printMachine: "1" }),
    base("g4", 384, "approved", { maquinaPrevista: "2" }),
    base("g5", 385, "conferred", { quantityProduced: 10, conferredQty: 10 }),
    base("g6", 386, "conferred", { quantityProduced: 10, conferredQty: 10 }),
    base("g7", 387, "produced", { quantityProduced: 10 }),
    base("g8", 388, "awaiting_final_review"),
  ];
}
async function montarGrafica() {
  const vv = prepararJsdom();
  const pecas = pecasDaGrafica();
  vi.stubGlobal("fetch", vi.fn(async (u: any) => json(String(u).split("?")[0] === "/api/items/approved" ? pecas : [])));
  window.history.replaceState({}, "", "/grafica");
  const { queryClient } = await import("@/lib/queryClient");
  const Grafica = (await import("@/pages/grafica")).default;
  queryClient.clear();
  queryClient.setQueryData(["/api/items/approved"], pecas);
  queryClient.setQueryData(["/api/standard-items"], []);
  queryClient.setQueryData(["/api/tubos"], [{ id: "t1", numero: 1, eventId: EV.id, entregueEm: null, fechadoEm: null }]);
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Grafica as any, null))); });
  await tick(250);
  return vv;
}

describe("GRÁFICA a 390px", () => {
  it("oito cartões de etapa em 3 colunas com o Total fechando a última linha; o cartão da peça mostra a divisão, o selo 'Fila:' e 'Entregar tubo' antes de 'Tirar do tubo'", async () => {
    await montarGrafica();
    const etapas = $('[role="group"][aria-label="Filtrar a fila por etapa"]')!;
    expect(etapas.style.gridTemplateColumns).toBe("repeat(3, 1fr)");
    expect(etapas.querySelectorAll("button").length).toBe(8);
    expect($('[data-testid="stat-packed"]')).toBeTruthy();
    // 3 / 3 / Entregues + Total: o Total ocupa as duas colunas que sobram.
    expect($('[data-testid="stat-total"]')!.style.gridColumn).toBe("span 2");
    // Progresso dividido e simples, no cartão.
    expect($('[data-testid="progresso-impressao-g2"]')!.textContent).toContain("Impressora 1 (New XT) · 5 de 8 un. / Impressora 2 · 0 de 2 un.");
    expect($('[data-testid="progresso-impressao-g3"]')!.textContent).toContain("Impressora 1 (New XT) · 3 de 10 impressas · 7 na impressora");
    // Selo da reserva feita na aba Máquinas, a 12px.
    const selo = $('[data-item-row] [data-testid="selo-fila-impressora"]')!;
    expect(selo.textContent).toContain("Fila: Impressora 2");
    expect(px(selo.style.fontSize)).toBe(12);
    // Embalada: a principal é "Entregar tubo" (sólida, 48px, antes no DOM); "Tirar do tubo" é a secundária.
    const entregarTubo = $('[data-testid="button-entregar-tubo-card-g1"]')!;
    const tirar = $('[data-testid="button-tirar-do-tubo-card-g1"]')!;
    expect(entregarTubo.compareDocumentPosition(tirar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(entregarTubo.style.background).toBe("rgb(29, 78, 216)");
    expect(px(entregarTubo.style.minHeight)).toBe(48);
    expect(px(tirar.style.minHeight)).toBe(48);
    // "Entregar" da embalada é de contorno — uma sólida só por peça.
    const entregar = $('[data-testid="button-entregar-card-g1"]');
    if (entregar) expect(entregar.style.background).toBe("rgb(255, 255, 255)");
    // Conferida: Embalar é a principal, a 48px.
    expect(px($('[data-testid="button-embalar-card-g5"]')!.style.minHeight)).toBe(48);
    expect(largurasFixas()).toEqual([]);
    expect(alvosPequenos()).toEqual([]);
    expect(camposRuins()).toEqual([]);
    expect(letrasMiudas()).toEqual([]);
  }, 60_000);

  it("barra 'Embalar em lote' em duas linhas com o recorte seguro; a folha 'Mais filtros' tem o filtro Impressora com alvo de 44", async () => {
    await montarGrafica();
    await act(async () => { fireEvent.click($('[data-testid="button-bulk-pack"]')!); });
    await tick(20);
    const barra = $('[role="toolbar"]')!;
    expect(barra.textContent).toContain("Embalar em lote");
    expect(/safe-area-inset-bottom/.test(barra.style.paddingBottom)).toBe(true);
    const continuar = $('[data-testid="button-bulk-continuar"]')!;
    expect(continuar.textContent).toContain("Escolher o tubo");
    expect(px(continuar.style.minHeight)).toBe(48);
    // O rótulo do modo divide a primeira linha só com o X; os botões descem.
    const rotulo = barra.querySelector<HTMLElement>('[aria-live="polite"]')!.parentElement!;
    expect(rotulo.style.flex).toBe("1 1 calc(100% - 52px)");
    expect(alvosPequenos(barra)).toEqual([]);
    expect(letrasMiudas(barra)).toEqual([]);
    await act(async () => { fireEvent.click(barra.querySelector('button[aria-label="Sair do modo lote sem registrar"]')!); });
    await tick(20);
    // A folha de filtros: o Impressora está lá, como os outros, com alvo de 44.
    await act(async () => { fireEvent.click($('[data-testid="button-abrir-filtros-mobile"]')!); });
    await tick(20);
    const folha = $('[data-testid="folha-filtros-mobile"]')!;
    const impressora = folha.querySelector<HTMLElement>('[data-testid="select-impressora-filter"]');
    expect(impressora, "filtro Impressora na folha").toBeTruthy();
    expect(px(impressora!.style.minHeight) >= 44 || px(impressora!.style.height) >= 44).toBe(true);
    expect(rodapeSeguro($('[data-testid="button-aplicar-filtros-mobile"]'))).toBeTruthy();
    expect(alvosPequenos(folha)).toEqual([]);
    expect(letrasMiudas(folha)).toEqual([]);
  }, 60_000);
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 · O MODAL DE TUBOS
// ═════════════════════════════════════════════════════════════════════════════
function retratoDosTubos() {
  const p = (id: string, displayId: string, conferida: boolean, description = "lona 440g com logo do patrocinador master aplicado") => ({ id, displayId, type: "Placa de octanorme grande", description, quantity: 4, status: conferida ? "conferred" : "produced", conferredQty: conferida ? 4 : 0, deliveredQty: 0, conferida, entregue: false });
  const tubo = (id: string, numero: number, pecas: any[], extra: Partial<any> = {}) => ({ id, numero, entregueEm: null, recebidoPor: null, entreguePor: null, fotoEntregaUrl: null, fotosFechamento: [], fechadoEm: null, fechadoPor: null, alteradoDepoisDaFoto: false, pecas, faltamConferir: pecas.filter((x) => !x.conferida).map((x) => x.displayId), prontoParaEntregar: pecas.length > 0 && pecas.every((x) => x.conferida), ...extra });
  return {
    evento: { id: "ev1", name: "Maratona Internacional de São Paulo 2026" },
    tubos: [tubo("t1", 1, [p("p3", "#0383", true)]), tubo("t2", 2, [p("p4", "#0384", false)])],
    semTubo: [p("p1", "#0381", true), p("p2", "#0382", false)],
  };
}
async function montarTubos(props: Record<string, unknown> = {}) {
  const vv = prepararJsdom();
  vi.stubGlobal("fetch", vi.fn(async () => json(retratoDosTubos())));
  const { queryClient } = await import("@/lib/queryClient");
  const { TubosDialog } = await import("@/components/tubos-dialog");
  queryClient.clear();
  queryClient.setQueryData(["/api/events/ev1/tubos"], retratoDosTubos());
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(TubosDialog as any, { evento: { id: "ev1", name: "Maratona Internacional de São Paulo 2026" }, onClose: () => {}, ...props }))); });
  await tick(30);
  return vv;
}

describe("MODAL DE TUBOS a 390px", () => {
  it("'Embalar #0381': os tubos são alvos de 44px; a lista não corta nomes nem estoura a tela", async () => {
    await montarTubos({ itensIniciais: ["p1"] });
    const dialogo = $('[role="dialog"]')!;
    const atalho = $('[data-testid="embalar-atalho"]')!;
    expect(atalho.textContent).toContain("Embalar #0381");
    for (const id of ["embalar-no-tubo-1", "embalar-no-tubo-2", "embalar-em-tubo-novo"]) expect(px($(`[data-testid="${id}"]`)!.style.minHeight), id).toBe(44);
    expect(comReticencias(dialogo)).toEqual([]);
    expect(largurasFixas(dialogo)).toEqual([]);
    expect(alvosPequenos(dialogo)).toEqual([]);
    expect(letrasMiudas(dialogo)).toEqual([]);
  }, 30_000);

  it("'Fechar tubo': câmera direta, rodapé fixo com o recorte seguro; 'Entregar tubo': recebedor a 16px, rodapé fixo, e o teclado não esconde o botão", async () => {
    const vv = await montarTubos();
    const dialogo = $('[role="dialog"]')!;
    await act(async () => { fireEvent.click($('[data-testid="fechar-tubo-1"]')!); });
    const formFechar = $('[data-testid="form-fechar-tubo-1"]')!;
    expect(formFechar.querySelector('input[type="file"][capture="environment"]'), "câmera traseira direto").toBeTruthy();
    // Os botões do formulário moram no rodapé do modal, fora da rolagem, com o recorte seguro.
    const rodapeFechar = $('[data-testid="rodape-fechar-tubo-1"]')!;
    expect(rodapeFechar).toBeTruthy();
    expect(formFechar.contains(rodapeFechar)).toBe(false);
    expect(/safe-area-inset-bottom/.test(rodapeFechar.style.paddingBottom)).toBe(true);
    const confirmarFechar = $('[data-testid="confirmar-fechar-tubo-1"]') as HTMLButtonElement;
    expect(confirmarFechar.disabled).toBe(true);
    expect(confirmarFechar.textContent).toBe("Tire a foto para fechar");
    expect(px(confirmarFechar.style.minHeight)).toBe(48);
    expect(alvosPequenos(dialogo)).toEqual([]);
    // Cancelar fecha o formulário e o rodapé some.
    await act(async () => { fireEvent.click(rodapeFechar.querySelector("button")!); });
    expect($('[data-testid="rodape-fechar-tubo-1"]')).toBeNull();
    // Entregar o Tubo 1 (pronto): recebedor obrigatório a 16px, rodapé fixo.
    await act(async () => { fireEvent.click($('[data-testid="entregar-tubo-1"]')!); });
    const recebedor = $('[data-testid="recebedor-tubo-1"]') as HTMLInputElement;
    expect(px(recebedor.style.fontSize)).toBe(16);
    expect(px(recebedor.style.height)).toBe(44);
    const rodapeEntregar = $('[data-testid="rodape-entregar-tubo-1"]')!;
    expect(/safe-area-inset-bottom/.test(rodapeEntregar.style.paddingBottom)).toBe(true);
    const confirmarEntrega = () => $('[data-testid="confirmar-entrega-tubo-1"]') as HTMLButtonElement;
    expect(confirmarEntrega().disabled).toBe(true);
    await act(async () => { fireEvent.change(recebedor, { target: { value: "João" } }); });
    expect(confirmarEntrega().disabled).toBe(false);
    expect(confirmarEntrega().textContent).toBe("Entregar Tubo 1");
    // O Tubo 2 (falta conferir) não entrega, e diz por quê.
    expect(($('[data-testid="entregar-tubo-2"]') as HTMLButtonElement).disabled).toBe(true);
    expect(dialogo.textContent).toContain("Falta conferir: #0384");
    // Teclado aberto no "Quem recebeu": o modal cabe na área visível.
    await teclado(vv, 420);
    expect(dialogo.style.maxHeight).toBe("404px");
    await teclado(vv, 760);
    expect(camposRuins(dialogo)).toEqual([]);
    expect(alvosPequenos(dialogo)).toEqual([]);
    expect(letrasMiudas(dialogo)).toEqual([]);
    expect(largurasFixas(dialogo)).toEqual([]);
  }, 30_000);
});

// ═════════════════════════════════════════════════════════════════════════════
// 5 · ETIQUETAS
// ═════════════════════════════════════════════════════════════════════════════
describe("ETIQUETAS a 390px", () => {
  it("'Em lista' está na barra que quebra linha (nada cortado) e é alvo de 44 no toque", async () => {
    prepararJsdom();
    vi.stubGlobal("fetch", vi.fn(async () => json([])));
    window.history.replaceState({}, "", "/eventos/ev1/etiquetas");
    const { queryClient } = await import("@/lib/queryClient");
    const Pagina = (await import("@/pages/etiquetas-evento")).default;
    queryClient.clear();
    queryClient.setQueryData(["/api/events", "ev1"], { id: "ev1", name: "Circuito Corrida Vale 2026 Itabira" });
    queryClient.setQueryData(["/api/items", "ev1"], [
      { id: "e1", displayId: "#0001", type: "2x1", description: "2x1 Ministério - 16", quantity: 16, status: "conferred", conferredQty: 16, deliveredQty: 0 },
      { id: "e2", displayId: "#0002", type: "Backdrop", description: "Backdrop lona", quantity: 1, status: "conferred", conferredQty: 1, deliveredQty: 0 },
    ]);
    await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Pagina as any, null))); });
    await tick(60);
    const caixa = $('[data-testid="check-em-lista"]')!;
    expect(caixa, "a caixa 'Em lista'").toBeTruthy();
    const rotulo = caixa.closest("label")!;
    expect(rotulo.textContent).toContain("Em lista");
    // A faixa dos tipos/tamanho também quebra linha e não estoura os 390px.
    const faixa = $('[data-testid="faixa-em-lista"]')!;
    expect(faixa.style.flexWrap).toBe("wrap");
    expect(largurasFixas(faixa)).toEqual([]);
    expect(alvosPequenos(faixa)).toEqual([]);
    expect(rotulo.className).toContain("etq-alvo");
    const barra = rotulo.closest<HTMLElement>(".etq-acao")!;
    expect(barra.style.flexWrap).toBe("wrap");
    expect(largurasFixas(barra)).toEqual([]);
    expect(comReticencias(barra)).toEqual([]);
    // A regra de 44 vive no CSS da página (o inline não tem media query).
    const css = $("style")?.textContent ?? "";
    expect(css).toContain(".etq-alvo { min-height: 44px; }");
    expect(css).toContain('.etq-acao button, .etq-acao input[type="checkbox"] + span { min-height: 44px; }');
  }, 30_000);
});
