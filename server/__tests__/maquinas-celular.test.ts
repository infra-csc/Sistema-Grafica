// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// MÁQUINAS NO CELULAR — passada 10/10 só desta tela (dono, 21/09), sobre os
// controles que chegaram DEPOIS da passada anterior (celular-21-09.test.ts):
// reserva com impressora + quantidade na fila geral, "20 → Impressora 1 · 14
// sem impressora", fila do cartão com Iniciar / Mover / Devolver por
// quantidade, seletor com "Reservada · 20 un." e o modal em "Iniciar 20 un.".
//
// A tela MONTADA a 390px; a régua é a mesma (alvos ≥ 44, campos 16px com
// teclado numérico, letra ≥ 12, nada mais largo que a tela, rodapé com
// env(safe-area-inset-bottom), teclado não esconde o primário, DOM = tela).
// O jsdom não faz layout: as regras são estruturais (estilo inline).
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
// Os dados: o cenário do dono (21/09) — #0396 "2×1", 34 un.: 20 reservadas à
// Impressora 1 e 14 sem impressora; a #0390 imprimindo na 1 com 14 na fila da
// 2; fila geral com 45 peças (o lote é de 20).
// ═════════════════════════════════════════════════════════════════════════════
const HOJE = "2026-09-21";
const desdeISO = new Date(Date.now() - 80 * 60000).toISOString();
const evento = { id: "ev1", name: "Maratona Internacional de São Paulo 2026", status: "created", startDate: "2026-12-01T00:00:00Z", reopenedAt: null };
const base = (id: string, displayId: string, tipo: string, aImprimir: number) => ({
  id, displayId, tipo, descricao: "lona 440g com logo do patrocinador master", evento: evento.name, quantidade: aImprimir, reuso: 0,
  aImprimir, impressas: 0, desde: null as string | null, maquina: null as string | null, status: "approved", miniatura: null, eventoInfo: evento,
});
const naFila = (id: string, displayId: string, tipo: string, maquinaPrevista: string | null, dias: number, aImprimir = 10, extra: Record<string, unknown> = {}) => ({
  ...base(id, displayId, tipo, aImprimir), maquinaPrevista, m2: 4.5, saidaCaminhao: new Date(Date.now() + dias * 86_400_000).toISOString(), prazoProducaoGrafica: -1, ...extra,
});
function retrato() {
  const reg = (id: string, tipo: string, quantidade: number, totalDepois: number, hora: string, ordem: number) => ({ id, itemId: "p9", displayId: "#0101", tipoPeca: "Placa de octanorme grande para o pórtico de largada", evento: evento.name, tipo, quantidade, totalDepois, aImprimir: 34, hora, quem: "Ana Beatriz", ordem });
  // Peça POR PARTES com UMA parte só: iniciou as 20 reservadas à Impressora 4.
  const umaParte = { ...base("p9", "#0101", "Placa de octanorme grande para o pórtico de largada", 34), impressas: 5, desde: desdeISO, maquina: "4", status: "inProduction", impressaoPorMaquina: { "4": { atrib: 20, impressas: 5 } }, parte: { atrib: 20, impressas: 5 } };
  return {
    dia: HOJE, hoje: HOJE,
    maquinas: [
      { codigo: "1", rotulo: "Impressora 1 (New XT)", imprimindo: [], registros: [], unidadesNoDia: 0, pecasNoDia: 0,
        naFila: [
          naFila("q1", "#0396", "2×1", "1", 1, 34, { reservadas: 20, reserva: { "1": 20 }, semImpressora: 14 }),
          naFila("q2", "#0397", "Backdrop do pódio", "1", 2), naFila("q3", "#0398", "Banner de rua", "1", 3),
          naFila("q4", "#0399", "Testeira", "1", 4), naFila("q5", "#0400", "Placa de km", "1", 5, 1),
        ] },
      { codigo: "2", rotulo: "Impressora 2", imprimindo: [], registros: [], unidadesNoDia: 0, pecasNoDia: 0,
        naFila: [naFila("q6", "#0390", "Lona de gradil", "2", 1, 34, { reservadas: 14, imprimindoEm: ["1"] })] },
      { codigo: "3", rotulo: "Impressora 3", imprimindo: [], registros: [], unidadesNoDia: 0, pecasNoDia: 0,
        naFila: [naFila("q7", "#0391", "Pórtico de chegada com a marca do patrocinador", "3", 0, 34, { reservadas: 20 })] },
      { codigo: "4", rotulo: "Impressora 4 (Targa Elite)", imprimindo: [umaParte], registros: [reg("r1", "parcial", 5, 5, "10:12", 0), reg("r2", "inicio", 0, 0, "09:00", 1)], unidadesNoDia: 5, pecasNoDia: 1 },
    ],
    semMaquina: [],
    filaGeral: [
      naFila("q1", "#0396", "2×1", null, 1, 34, { reserva: { "1": 20 }, semImpressora: 14 }),
      ...Array.from({ length: 44 }, (_, i) => naFila(`g${i}`, `#${String(500 + i).padStart(4, "0")}`, "Placa de octanorme grande para o pórtico", null, 2 + i)),
    ],
  };
}
function relatorio() {
  const maq = (maquina: string, rotulo: string, extra: Partial<any> = {}) => ({ dia: HOJE, maquina, rotulo, unidades: 0, pecas: 0, concluidas: 0, aindaNaMaquina: 0, primeira: null, ultima: null, minutosAtivos: 0, quem: [], ...extra });
  return { de: HOJE, ate: HOJE, hoje: HOJE, dias: [{ dia: HOJE, maquinas: [maq("1", "Impressora 1 (New XT)"), maq("2", "Impressora 2"), maq("3", "Impressora 3"), maq("4", "Impressora 4 (Targa Elite)", { unidades: 5, pecas: 1, aindaNaMaquina: 1, primeira: "09:00", ultima: "10:12", minutosAtivos: 72, quem: ["Ana Beatriz"] })], total: { unidades: 5, pecas: 1, concluidas: 0, aindaNaMaquina: 1, minutosAtivos: 72 } }] };
}
async function montar(url = "/grafica/maquinas") {
  const vv = prepararJsdom();
  vi.stubGlobal("fetch", vi.fn(async (u: any) => (String(u).includes("/relatorio") ? json(relatorio()) : String(u).includes("/api/grafica/maquinas") ? json(retrato()) : json({}))));
  window.history.replaceState({}, "", url);
  const { queryClient } = await import("@/lib/queryClient");
  const Pagina = (await import("@/pages/grafica-maquinas")).default;
  queryClient.clear();
  queryClient.setQueryData(["/api/grafica/maquinas"], retrato());
  queryClient.setQueryData(["/api/grafica/maquinas/relatorio", `?de=${HOJE}&ate=${HOJE}`], relatorio());
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Pagina as any, null))); });
  await tick(30);
  return vv;
}
const regua = (raiz: ParentNode = document.body) => ({ larguras: largurasFixas(raiz), alvos: alvosPequenos(raiz), campos: camposRuins(raiz), letras: letrasMiudas(raiz) });
const LIMPA = { larguras: [], alvos: [], campos: [], letras: [] };
/** `a` vem antes de `b` no DOM (ordem visual = ordem do DOM). */
const antes = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("MÁQUINAS no celular (390px) — controles novos de 21/09", () => {
  it("1 · FILA GERAL: dados em cima, select na linha inteira, quantidade + Reservar lado a lado; direcionamento quebra sem cortar; lote grudado embaixo", async () => {
    await montar();
    const linha = $('[data-testid="fila-peca-q1"]')!;
    expect(linha.style.flexWrap).toBe("wrap");
    // Dados: ocupam o que sobra ao lado da caixa de seleção (sem base fixa de 220px).
    const dados = $('[data-testid="fila-dados-q1"]')!;
    expect(dados.style.flex).toBe("1 1 0%");
    const dir = $('[data-testid="direcionado-q1"]')!;
    expect(dir.textContent).toBe("20 → Impressora 1 (New XT) · 14 sem impressora");
    expect(dir.style.overflowWrap).toBe("anywhere");
    expect(dir.style.whiteSpace).not.toBe("nowrap");
    expect(comReticencias(linha)).toEqual([]);
    // O prazo mora DENTRO do bloco de dados (não ganha uma linha só dele).
    expect(dados.textContent).toContain("Prazo");
    // Controles: grupo na linha inteira; select 100%/16px/44; quantidade numérica de 84px.
    const grupo = $('[data-testid="controle-reserva-q1"]')!;
    expect(grupo.style.width).toBe("100%");
    expect(antes(dados, grupo)).toBe(true);
    const sel = $('[data-testid="reservar-fila-q1"]') as HTMLSelectElement;
    expect([sel.style.width, px(sel.style.fontSize), px(sel.style.minHeight)]).toEqual(["100%", 16, 44]);
    const qtd = $('[data-testid="qtd-reservar-q1"]') as HTMLInputElement;
    expect(qtd.getAttribute("inputmode")).toBe("numeric");
    expect(qtd.placeholder).toBe("14");
    expect(px(qtd.style.flexBasis)).toBe(84);
    expect(antes(sel, qtd) && antes(qtd, $('[data-testid="button-reservar-q1"]')!)).toBe(true);
    // Caixa de seleção: alvo de 44×44 (o rótulo em volta).
    const rotulo = $('[data-testid="selecionar-fila-q1"]')!.parentElement!;
    expect([px(rotulo.style.minHeight), px(rotulo.style.minWidth)]).toEqual([44, 44]);
    // Lote: depois da lista no DOM, grudado embaixo com o recorte seguro; o select (principal) em cima.
    await act(async () => { fireEvent.click($('[data-testid="selecionar-fila-q1"]')!); });
    await act(async () => { fireEvent.click($('[data-testid="selecionar-fila-g0"]')!); });
    const lote = $('[data-testid="lote-fila"]')!;
    expect(antes($('[data-testid="fila-geral"]')!, lote)).toBe(true);
    expect(lote.style.position).toBe("sticky");
    expect(lote.style.paddingBottom).toMatch(/safe-area-inset-bottom/);
    expect(lote.firstElementChild!.getAttribute("data-testid")).toBe("reservar-lote");
    expect((lote.firstElementChild as HTMLElement).style.width).toBe("100%");
    expect(lote.textContent).toContain("2 selecionadas");
    await act(async () => { fireEvent.click($('[data-testid="lote-limpar"]')!); });
    expect($('[data-testid="lote-fila"]')).toBeNull();
    expect(regua()).toEqual(LIMPA);
  }, 30_000);

  it("2 · CARTÃO: 'Na fila' não vira parede — Iniciar à vista, Mover/Devolver sob expansão por peça, e só 3 peças até pedir mais", async () => {
    await montar();
    const cartao = $('[data-testid="maquina-agora-1"]')!;
    // 5 na fila → 3 à vista + "Ver as 5 da fila".
    expect(cartao.querySelectorAll('[data-testid^="peca-na-fila-"]').length).toBe(3);
    const verTodas = $('[data-testid="fila-maquina-ver-todas-1"]')!;
    expect(verTodas.textContent).toContain("Ver as 5 da fila");
    // "#0396 2×1 · 20 de 34 un." e o Iniciar dizendo quantas.
    const peca = $('[data-testid="peca-na-fila-q1"]')!;
    expect(peca.textContent).toContain("#0396");
    expect(peca.textContent).toContain("20 de 34 un.");
    // Impressora LIVRE: a primeira da fila é a "Próxima" e o Iniciar ganha destaque (dono, 21/09).
    expect($('[data-testid="button-iniciar-fila-q1"]')!.textContent).toBe("Próxima: #0396 · Iniciar 20 un.");
    // Fechado: nem campo nem select desta peça na tela.
    expect($('[data-testid="qtd-mover-fila-q1"]')).toBeNull();
    expect($('[data-testid="mover-fila-q1"]')).toBeNull();
    const abrir = $('[data-testid="abrir-mover-fila-q1"]')!;
    expect(abrir.getAttribute("aria-expanded")).toBe("false");
    expect(antes($('[data-testid="button-iniciar-fila-q1"]')!, abrir)).toBe(true);
    await act(async () => { fireEvent.click(abrir); });
    expect(abrir.getAttribute("aria-expanded")).toBe("true");
    expect(abrir.getAttribute("aria-controls")).toBe($('[data-testid="mover-painel-q1"]')!.id);
    const qtd = $('[data-testid="qtd-mover-fila-q1"]') as HTMLInputElement;
    expect([qtd.getAttribute("inputmode"), px(qtd.style.fontSize), px(qtd.style.minHeight), qtd.placeholder]).toEqual(["numeric", 16, 44, "20"]);
    // O campo tem rótulo VISÍVEL (no toque não existe title/tooltip).
    expect(document.querySelector(`label[for="${qtd.id}"]`)!.textContent).toContain("Quantas das 20 un.");
    const sel = $('[data-testid="mover-fila-q1"]') as HTMLSelectElement;
    expect([sel.style.width, px(sel.style.fontSize)]).toEqual(["100%", 16]);
    expect(Array.from(sel.options).map((o) => o.textContent)).toContain("Devolver à fila geral");
    await act(async () => { fireEvent.change(qtd, { target: { value: "8" } }); });
    expect(sel.options[0].textContent).toBe("Mover 8 para…");
    // As outras peças continuam fechadas.
    expect($('[data-testid="mover-fila-q2"]')).toBeNull();
    // Peça de 1 un.: abre só o destino, sem campo de quantidade.
    await act(async () => { fireEvent.click(verTodas); });
    expect(cartao.querySelectorAll('[data-testid^="peca-na-fila-"]').length).toBe(5);
    await act(async () => { fireEvent.click($('[data-testid="abrir-mover-fila-q5"]')!); });
    expect($('[data-testid="qtd-mover-fila-q5"]')).toBeNull();
    expect($('[data-testid="mover-fila-q5"]')).toBeTruthy();
    // "14 un. na fila · peça já em impressão na Impressora 1" quebra, não corta.
    const ja = $('[data-testid="ja-imprimindo-q6"]')!;
    expect(ja.textContent).toBe("14 un. na fila · peça já em impressão na Impressora 1 (New XT)");
    expect(ja.style.whiteSpace).not.toBe("nowrap");
    // Peça por partes com UMA parte só (Impressora 4).
    expect($('[data-testid="maquina-agora-4"] [data-testid="progresso-p9"]')!.textContent).toBe("5 de 20 nesta impressora · peça 5 de 34 no total");
    expect(comReticencias(cartao)).toEqual([]);
    expect(regua()).toEqual(LIMPA);
  }, 30_000);

  it("3 · SELETOR e MODAL: selo 'Reservada · 20 un.' sob o nome; 'Iniciar 20 un. na Impressora 3' em cima, Cancelar embaixo, rodapé seguro e teclado", async () => {
    const vv = await montar();
    await act(async () => { fireEvent.click($('[data-testid="link-escolher-peca-3"]')!); });
    await tick(30);
    const seletor = $('[data-testid="seletor-de-peca"]')!;
    const item = $('[data-testid="escolher-peca-q7"]')!;
    // Os selos descem para baixo do texto (a coluna da direita roubava o nome).
    const selos = $('[data-testid="selos-peca-q7"]')!;
    expect(selos.style.flexWrap).toBe("wrap");
    expect($('[data-testid="selo-reservada-q7"]')!.textContent).toBe("Reservada · 20 un.");
    expect(item.children.length).toBe(2); // miniatura + coluna de texto
    expect(item.lastElementChild!.contains(selos)).toBe(true);
    expect(px(item.style.minHeight)).toBeGreaterThanOrEqual(44);
    expect(px(($('[data-testid="busca-peca"]') as HTMLInputElement).style.fontSize)).toBe(16);
    await teclado(vv, 420);
    expect(seletor.style.maxHeight).toBe("404px");
    await teclado(vv, 760);
    expect({ ...regua(seletor), ret: comReticencias(seletor) }).toEqual({ ...LIMPA, ret: [] });

    // Um toque → modal já em "Iniciar 20 un. na Impressora 3".
    await act(async () => { fireEvent.click(item); });
    await tick(40);
    const modal = $('[data-testid="modal-impressao"]')!;
    expect(modal.textContent).toContain("Imprimir parte da peça");
    const iniciar = $('[data-testid="button-iniciar-impressao"]')!;
    expect(iniciar.textContent).toBe("Iniciar 20 un. na Impressora 3");
    const rodape = $('[data-testid="rodape-iniciar"]')!;
    expect(rodape.style.paddingBottom).toMatch(/safe-area-inset-bottom/);
    expect(rodape.style.position).toBe("sticky");
    // Principal em cima, linha inteira; Cancelar depois (DOM = tela).
    expect(rodape.firstElementChild).toBe(iniciar);
    expect(iniciar.style.flex).toBe("1 1 100%");
    expect(px(iniciar.style.minHeight)).toBe(48);
    expect(rodape.lastElementChild!.textContent).toBe("Cancelar");
    // UMA PEÇA POR VEZ (21/09): a Impressora 4 está com a #0101 → desabilitada, dizendo com quem.
    const ocupada = $('[data-testid="maquina-4"]') as HTMLButtonElement;
    expect(ocupada.disabled).toBe(true);
    expect(ocupada.textContent).toBe("Impressora 4 (Targa Elite)com #0101");
    // Um nome comprido também cabe no botão: a Impressora 1, que está livre.
    await act(async () => { fireEvent.click($('[data-testid="maquina-1"]')!); });
    expect(iniciar.textContent).toBe("Iniciar 20 un. na Impressora 1 (New XT)");
    expect(iniciar.style.whiteSpace).not.toBe("nowrap");
    await teclado(vv, 420);
    expect(modal.style.maxHeight).toBe("404px");
    await teclado(vv, 760);
    expect(regua(modal)).toEqual(LIMPA);
  }, 30_000);

  it("3b · MODAL da peça por partes (uma parte só): progresso da parte; no 'Mover' o principal em cima e 'Manter' embaixo", async () => {
    await montar();
    await act(async () => { fireEvent.click($('[data-testid="maquina-agora-4"] [data-testid="button-trocar-maquina-p9"]')!); });
    await tick(40);
    const modal = $('[data-testid="modal-impressao"]')!;
    expect($('[data-testid="progresso-no-modal"]')!.textContent).toBe("5 de 20 nesta impressora · peça 5 de 34 no total");
    const acoes = $('[data-testid="acoes-da-troca"]')!;
    expect(acoes.style.flexWrap).toBe("wrap");
    expect(acoes.firstElementChild!.getAttribute("data-testid")).toBe("button-iniciar-impressao");
    expect((acoes.firstElementChild as HTMLElement).style.flex).toBe("1 1 100%");
    const manter = $('[data-testid="button-manter-maquina"]')!;
    expect(acoes.lastElementChild).toBe(manter);
    expect(manter.style.flex).toBe("1 1 100%");
    expect(manter.textContent).toBe("Manter na Impressora 4 (Targa Elite)");
    expect(rodapeSeguro($('[data-testid="button-confirm-production"]'))).toBeTruthy();
    expect(regua(modal)).toEqual(LIMPA);
  }, 30_000);

  it("4 · RESUMO e DIÁRIO: período e Excel na linha inteira, cartões em vez de tabela, régua limpa", async () => {
    await montar("/grafica/maquinas?aba=resumo");
    expect($("table")).toBeNull();
    expect($('[data-testid="resumo-cartoes"]')).toBeTruthy();
    expect($('[data-testid="seletor-periodo"]')!.style.flex).toBe("1 1 100%");
    for (const id of ["periodo-dia", "periodo-semana", "periodo-mes", "periodo-intervalo"]) {
      const b = $(`[data-testid="${id}"]`)!;
      expect([px(b.style.minHeight), b.style.flex], id).toEqual([44, "1 1 0%"]);
    }
    expect($('[data-testid="button-exportar-excel"]')!.style.flex).toBe("1 1 100%");
    await act(async () => { fireEvent.click($('[data-testid="periodo-intervalo"]')!); });
    await tick(20);
    expect(px(($('[data-testid="intervalo-de"]') as HTMLInputElement).style.fontSize)).toBe(16);
    expect(regua()).toEqual(LIMPA);
    cleanup();

    await montar("/grafica/maquinas?aba=diario");
    expect($("table")).toBeNull();
    expect($$('[data-testid="diario-cartoes"] [data-testid^="linha-diario-"]').length).toBe(2);
    expect($('[data-testid="abas-maquinas"]')!.style.overflowX).toBe("auto");
    expect(px(($('[data-testid="escolher-data"]') as HTMLInputElement).style.fontSize)).toBe(16);
    expect(comReticencias($('[data-testid="diario-cartoes"]')!)).toEqual([]);
    expect(regua()).toEqual(LIMPA);
  }, 30_000);

  it("5 · DESEMPENHO: a fila entra em lotes de 20 ('Mostrar mais'), nunca todas de uma vez; a linha é memoizada", async () => {
    await montar();
    const linhas = () => $$('[data-testid="fila-geral"] [data-testid^="fila-peca-"]').length;
    const mais = () => $('[data-testid="button-fila-toda"]');
    expect(linhas()).toBe(20);
    expect(mais()!.textContent).toContain("Mostrar mais 20");
    expect(mais()!.style.flex).toBe("1 1 100%");
    await act(async () => { fireEvent.click(mais()!); });
    expect(linhas()).toBe(40);
    expect(mais()!.textContent).toContain("Mostrar mais 5");
    await act(async () => { fireEvent.click(mais()!); });
    expect(linhas()).toBe(45);
    expect(mais()).toBeNull();
    const fs = await import("node:fs");
    const fonte = fs.readFileSync("client/src/pages/grafica-maquinas.tsx", "utf8") + fs.readFileSync("client/src/components/grafica/modal-impressao.tsx", "utf8");
    expect(fonte).toMatch(/const LinhaDaFilaGeral = memo\(/);
    expect(fonte).toMatch(/const LinhaDoDiario = memo\(/);
    // Régua de escrita: nada de comentário JSX logo após `return (` ou a abertura de um ternário.
    expect(fonte).not.toMatch(/(return|\?|:)\s*\(\s*\{\/\*/);
    // Laranja/cinza claros nunca como cor de TEXTO.
    expect(fonte).not.toMatch(/[^a-zA-Z]color:\s*"(#f97316|#a8a29e)"/i);
  }, 30_000);
});
