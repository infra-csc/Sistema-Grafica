// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// A GRÁFICA NO CELULAR — a régua do operador em pé no galpão.
//
// QUEM USA: celular numa mão e o material na outra, luz ruim, às vezes luva,
// Android mediano (360–412px) ou iPhone com notch/home indicator. O que este
// arquivo prende é o que esse uso exige e que um teste de "string no fonte" não
// enxerga: a página MONTADA em 360 e 390px de largura, com dados realistas.
//
// COMO MEDE (jsdom não faz layout): lê os estilos inline que o navegador vai
// aplicar. Por isso as regras aqui são estruturais — alvo de toque declarado
// (minHeight/height ≥ 44), espaço entre vizinhos (gap ≥ 8), fonte do campo
// (≥ 16, abaixo disso o iOS dá zoom ao focar), recorte seguro nos rodapés,
// nada com largura fixa maior que a tela, e a ORDEM da primeira dobra.
//
// ARMADILHA DO JSDOM (descoberta aqui, vale para quem escrever o próximo): o
// parser de CSS dele DESCARTA o atalho `padding: "12px 16px calc(12px +
// env(...))"` inteiro — a propriedade some do elemento. Os longos
// (`paddingBottom: "calc(12px + env(...))"`) passam. É por isso que o recorte
// seguro dos rodapés da Gráfica é escrito nos longos.
//
// O relatório de cada largura sai no console (GRAFICA_CELULAR_SAIDA grava num
// arquivo): foi com ele que se tirou a nota ANTES × DEPOIS.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { appendFileSync } from "fs";
import * as React from "react";
import { render, act, cleanup } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", name: "Admin", email: "a@a", role: "admin", mustChangePassword: false }, isLoading: false, logout: () => {} }),
}));

const DIA = 86400000;
const agora = Date.now();
const iso = (deltaDias: number) => new Date(agora + deltaDias * DIA).toISOString();

/** Quatro eventos, um já realizado (selo de evento finalizado). */
const EVENTOS = [
  { id: "ev1", name: "Maratona Internacional de São Paulo 2026", status: "active", startDate: iso(6).slice(0, 10), truckDepartureDate: iso(3), deadlineProducaoGrafica: -2 },
  { id: "ev2", name: "Corrida Noturna 10K", status: "active", startDate: iso(12).slice(0, 10), truckDepartureDate: iso(9), deadlineProducaoGrafica: -3 },
  { id: "ev3", name: "Meia do Rio", status: "active", startDate: iso(25).slice(0, 10), truckDepartureDate: iso(21), deadlineProducaoGrafica: -5 },
  { id: "ev4", name: "Trail das Serras (realizado)", status: "active", startDate: iso(-2).slice(0, 10), truckDepartureDate: iso(-5), deadlineProducaoGrafica: -2 },
];
const TIPOS = ["Backdrop", "Wind Banner", "Placa km", "Pórtico de largada", "Faixa de chegada", "Testeira"];
const STATUS = ["approved", "ready_for_production", "inProduction", "produced", "conferred", "delivered"];

function gerarPecas() {
  const pecas: any[] = [];
  for (let i = 0; i < 48; i++) {
    const ev = EVENTOS[i % EVENTOS.length];
    const status = STATUS[i % STATUS.length];
    const qtd = 2 + (i % 7);
    const conferidaParcial = status === "produced" && i % 4 === 3;
    pecas.push({
      id: `p${i}`, displayId: `#${String(60 + i).padStart(4, "0")}`,
      type: TIPOS[i % TIPOS.length],
      description: `${TIPOS[(i * 5) % TIPOS.length]} lona 440g ${i % 2 ? "5KM" : "10KM"} — patrocinador master com logo aplicado`,
      quantity: qtd,
      quantityProduced: ["inProduction"].includes(status) ? 1 : ["produced", "conferred", "delivered"].includes(status) ? qtd : 0,
      // Nomes de lib/saldo.ts: conferredQty/deliveredQty (não quantityConferred).
      conferredQty: conferidaParcial ? 1 : ["conferred", "delivered"].includes(status) ? qtd : 0,
      deliveredQty: status === "delivered" ? qtd : 0,
      status, eventId: ev.id, event: ev,
      material: "Lona 440g", finish: "Ilhós", calculatedM2: "6.00",
      fileWidth: "300", fileHeight: "200", visualWidth: "3", visualHeight: "2",
      approvalThumbUrl: i % 3 === 0 ? null : `/objects/thumb-${i}.png`,
      observations: i % 5 === 0 ? "Conferir a cor do logo com a prova" : "",
      isReuse: false, reuseQty: 0, isPriority: i % 11 === 0,
      kitRemessaId: i % 13 === 0 ? "k1" : null,
      statusChangedAt: iso(-(i % 6)),
    });
  }
  // Um complemento em aberto (+2 un.) colado na mãe.
  pecas.push({ ...pecas[2], id: "p2c1", displayId: "#0062-C1", parentItemId: "p2", parent: { displayId: "#0062" }, quantity: 2, quantityProduced: 0, conferredQty: 0, deliveredQty: 0, status: "approved", complementReason: "Patrocinador pediu mais duas placas", complementRequestedBy: "Ana", complementRequestedAt: iso(-1) });
  return pecas;
}
const PECAS = gerarPecas();

/** Achados em componentes que a Gráfica não pode editar (saem no relatório). */
const externos = new Set<string>();
const TOCAVEIS = 'button, a[href], [role="checkbox"], input:not([type="hidden"]):not([type="file"]), select, textarea';
const px = (v: string | null | undefined) => {
  const m = String(v ?? "").match(/^(-?\d+(?:\.\d+)?)px$/);
  return m ? Number(m[1]) : NaN;
};
const maior = (...vs: number[]) => { const ok = vs.filter((v) => !Number.isNaN(v)); return ok.length ? Math.max(...ok) : NaN; };

function visivel(el: Element) {
  for (let e: Element | null = el; e; e = e.parentElement) {
    if (e.classList.contains("sr-only") || e.classList.contains("hidden")) return false;
    if ((e as HTMLElement).style?.display === "none") return false;
  }
  return true;
}

function descrever(el: Element) {
  const t = (el.getAttribute("data-testid") || el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 48);
  return `<${el.tagName.toLowerCase()}> ${t}`;
}

/** Alvo de toque declarado: altura (e largura, se o botão é só ícone) ≥ 44. */
function alvosPequenos(raiz: ParentNode = document.body) {
  const ruins: string[] = [];
  for (const el of Array.from(raiz.querySelectorAll<HTMLElement>(TOCAVEIS))) {
    if (!visivel(el)) continue;
    // X nativo do DialogContent, escondido pela classe do pai (HIDE_NATIVE_CLOSE).
    if (el.parentElement?.className.includes("[&>button:last-child]:hidden") && el === el.parentElement.lastElementChild) continue;
    // X do ModalHeader (components/modal-shell.tsx, 40/34px): fora do escopo
    // da Gráfica — relatado como PARA OUTRA FRENTE, contado à parte.
    if (el.getAttribute("title") === "Fechar (Esc)") { externos.add("modal-shell: X do ModalHeader < 44px"); continue; }
    // Botão do ObjectUploader: a altura vem da classe (min-h-[Npx]), não do inline.
    if (el.getAttribute("data-testid") === "button-upload-photo") {
      const m = el.className.match(/min-h-\[(\d+)px\]/);
      if (!m || Number(m[1]) < 44) ruins.push(`${descrever(el)} (uploader sem min-h)`);
      continue;
    }
    const s = el.style;
    const alt = maior(px(s.minHeight), px(s.height));
    if (!(alt >= 44)) { ruins.push(`${descrever(el)} (altura ${Number.isNaN(alt) ? "não declarada" : alt})`); continue; }
    const soIcone = (el.textContent ?? "").trim().length <= 2 && el.tagName === "BUTTON";
    if (soIcone) {
      const larg = maior(px(s.minWidth), px(s.width), px(s.flexBasis));
      if (!(larg >= 44)) ruins.push(`${descrever(el)} (largura ${larg})`);
    }
  }
  return ruins;
}

/** Vizinhos tocáveis lado a lado precisam de ≥ 8px entre eles. */
function vizinhosColados(raiz: ParentNode = document.body) {
  const ruins: string[] = [];
  const conta = (filho: Element) =>
    filho.matches(TOCAVEIS) ||
    (filho.querySelectorAll(TOCAVEIS).length === 1 && (filho.textContent ?? "") === (filho.querySelector(TOCAVEIS)!.textContent ?? ""));
  const todos = Array.from(raiz.querySelectorAll<HTMLElement>("*"));
  for (const el of todos) {
    const disp = el.style.display;
    if (disp !== "flex" && disp !== "inline-flex" && disp !== "grid") continue;
    const filhos = Array.from(el.children).filter((c) => visivel(c) && conta(c));
    if (filhos.length < 2) continue;
    const gap = Math.min(...String(el.style.gap || "0").split(/\s+/).map((g) => px(g) || 0));
    if (gap < 8) ruins.push(`${descrever(el)} (gap ${gap}, ${filhos.length} tocáveis)`);
  }
  return ruins;
}

/** Informação em letra < 12px (só elementos com texto PRÓPRIO). */
function letrasMiudas(raiz: ParentNode = document.body) {
  const ruins: string[] = [];
  for (const el of Array.from(raiz.querySelectorAll<HTMLElement>("*"))) {
    const fs = px(el.style.fontSize);
    if (!(fs < 12) || !visivel(el)) continue;
    if (el.closest('[data-testid^="selo-kit-"]')) continue; // componente de fora (PARA OUTRA FRENTE)
    const proprio = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 1);
    if (proprio) ruins.push(`${descrever(el)} (${fs}px)`);
  }
  return ruins;
}

/** Larguras fixas maiores que a tela (px em width/minWidth/flexBasis/grid). */
function largurasFixas(largura: number, raiz: ParentNode = document.body) {
  const ruins: string[] = [];
  for (const el of Array.from(raiz.querySelectorAll<HTMLElement>("*"))) {
    const s = el.style;
    for (const [nome, v] of [["width", s.width], ["minWidth", s.minWidth], ["flexBasis", s.flexBasis]] as const) {
      if (px(v) > largura) ruins.push(`${descrever(el)} ${nome}=${v}`);
    }
    const cols = String(s.gridTemplateColumns || "").match(/(\d+)px/g);
    if (cols && cols.map((c) => px(c)).reduce((a, b) => a + b, 0) > largura) ruins.push(`${descrever(el)} grid=${s.gridTemplateColumns}`);
  }
  return ruins;
}

/** Campos: número com teclado numérico; nenhum campo abaixo de 16px (zoom do iOS). */
function camposRuins(raiz: ParentNode = document.body) {
  const ruins: string[] = [];
  for (const el of Array.from(raiz.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"))) {
    const tipo = el.getAttribute("type") ?? "text";
    if (["hidden", "file", "checkbox", "radio"].includes(tipo) || !visivel(el)) continue;
    if (tipo === "number" && (el.getAttribute("inputmode") !== "numeric" || !el.getAttribute("pattern"))) ruins.push(`${descrever(el)} (sem inputMode/pattern)`);
    const fs = px(el.style.fontSize);
    if (!(fs >= 16)) ruins.push(`${descrever(el)} (fonte ${Number.isNaN(fs) ? "herdada" : fs})`);
  }
  return ruins;
}

/** Sobe do botão até o rodapé: quem declara o recorte seguro de baixo. */
function rodapeSeguro(botao: Element | null) {
  for (let e = botao?.parentElement ?? null; e; e = e.parentElement) {
    if (/safe-area-inset-bottom/.test(e.style.paddingBottom)) return e;
    if (e.getAttribute("role") === "dialog") break;
  }
  return null;
}

const saida = (linha: string) => {
  // eslint-disable-next-line no-console
  console.log(`[grafica-celular] ${linha}`);
  if (process.env.GRAFICA_CELULAR_SAIDA) appendFileSync(process.env.GRAFICA_CELULAR_SAIDA, linha + "\n");
};

async function tick(ms = 0) {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}
const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const clicar = async (el: Element | null) => { expect(el, "elemento para clicar").toBeTruthy(); await act(async () => { (el as HTMLElement).click(); }); await tick(0); };

/** visualViewport falso: o teclado virtual é ele encolhendo. */
function viewportVisivel(altura: number) {
  const alvo = new EventTarget() as any;
  alvo.height = altura; alvo.width = window.innerWidth; alvo.offsetTop = 0; alvo.offsetLeft = 0; alvo.scale = 1;
  return alvo;
}

beforeAll(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: /max-width:\s*767px/.test(q), media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
  (Element.prototype as any).scrollIntoView = () => {};
  (Element.prototype as any).hasPointerCapture = () => false;
  (Element.prototype as any).releasePointerCapture = () => {};
  vi.stubGlobal("fetch", async (url: any) => {
    const caminho = String(url).split("?")[0];
    const corpo = caminho === "/api/items/approved" ? PECAS : [];
    return new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
  });
});

afterEach(() => { cleanup(); });

async function montar(largura: number, alturaTela = 760) {
  Object.defineProperty(window, "innerWidth", { value: largura, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: alturaTela, configurable: true });
  const vv = viewportVisivel(alturaTela);
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
  const { queryClient } = await import("@/lib/queryClient");
  const Grafica = (await import("@/pages/grafica")).default;
  queryClient.clear();
  queryClient.setQueryData(["/api/items/approved"], PECAS);
  queryClient.setQueryData(["/api/standard-items"], []);
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Grafica as any, null))); });
  await tick(250);
  return vv;
}

describe.each([360, 390])("Gráfica em %ipx de largura", (largura) => {
  it("lista: primeira dobra na ordem certa, sem estouro lateral, alvos e letras de celular", async () => {
    await montar(largura);
    expect(document.querySelector("table"), "no celular a fila é de cartões, nunca tabela").toBeNull();
    const primeira = $("[data-item-row]");
    expect(primeira).toBeTruthy();

    // ORDEM DA PRIMEIRA DOBRA — fila (primária) → lote/Excel → etapas → guia → busca/Filtros → peça.
    // O gatilho do guia mora na 2ª linha da barra de filtros no celular (fechado, decisão do dono).
    const ordem = ["title-grafica", "button-fila-conferir", "button-bulk-confer", "button-export-xlsx", "stat-revisao", "stat-total", "input-search-filter", "button-abrir-filtros-mobile", "button-next-10-days-filter"]
      .map((t) => $(`[data-testid="${t}"]`));
    ordem.forEach((el, i) => expect(el, `bloco ${i} da primeira dobra`).toBeTruthy());
    for (let i = 1; i < ordem.length; i++) {
      expect(ordem[i - 1]!.compareDocumentPosition(ordem[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, `ordem ${i}`).toBeTruthy();
    }
    expect(ordem[ordem.length - 1]!.compareDocumentPosition(primeira!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const relatorio = {
      largura,
      alvosPequenos: alvosPequenos(),
      vizinhosColados: vizinhosColados(),
      letrasMiudas: letrasMiudas(),
      largurasFixas: largurasFixas(largura),
      campos: camposRuins(),
      // Busca e "Filtros" dividem UMA linha: a segunda linha da barra custava 52px antes da primeira peça.
      buscaEFiltrosNaMesmaLinha: $('[data-testid="input-search-filter"]')!.parentElement!.parentElement === $('[data-testid="button-abrir-filtros-mobile"]')!.parentElement,
      dicaFilaLote: ($('[data-testid="dica-fila-lote"]')?.textContent ?? "").length,
      etapas: $('[role="group"][aria-label="Filtrar a fila por etapa"]')!.style.gridTemplateColumns,
    };
    saida(`LISTA ${JSON.stringify(relatorio, null, 2)}`);

    expect(relatorio.etapas, "cartões de etapa em 3 colunas (decisão do dono)").toBe("repeat(3, 1fr)");
    expect(relatorio.largurasFixas).toEqual([]);
    expect(relatorio.alvosPequenos).toEqual([]);
    expect(relatorio.vizinhosColados).toEqual([]);
    expect(relatorio.letrasMiudas).toEqual([]);
    expect(relatorio.campos).toEqual([]);
    expect(relatorio.buscaEFiltrosNaMesmaLinha).toBe(true);
    expect(relatorio.dicaFilaLote, "a dica fila × lote cabe numa linha").toBeLessThanOrEqual(56);
    // Total ativo diz que está ativo SEM depender da cor do anel.
    expect($('[data-testid="stat-total"]')!.getAttribute("aria-pressed")).toBe("true");
    expect($('[data-testid="stat-total-ativo"]'), "marca de ativo no Total que não é só cor").toBeTruthy();
  }, 60_000);

  it("modais de produzir, conferir, entregar e devolver: rodapé seguro, campos de celular, teclado virtual", async () => {
    const vv = await montar(largura);
    // O botão do CARTÃO que abre cada modal, achado pelo rótulo (o mesmo que o operador lê).
    const noCartao = (rotulo: RegExp) => Array.from(document.querySelectorAll<HTMLElement>("[data-item-row] button"))
      .find((b) => rotulo.test((b.textContent ?? "").trim()) && !(b as HTMLButtonElement).disabled) ?? null;
    const casos: [() => HTMLElement | null, string][] = [
      [() => noCartao(/^Imprimir$/), '[data-testid="button-confirm-production"]'],
      [() => noCartao(/^Conferir( \d+)?$/), '[data-testid="button-confirm-conference"]'],
      [() => noCartao(/^Entregar( \d+)?$/), '[data-testid="button-confirm-delivery"]'],
      [() => $('[data-testid^="button-devolver-revisao-card-"]'), '[data-testid="button-confirmar-devolver-revisao"]'],
    ];
    const relatorio: Record<string, unknown> = {};
    for (const [abrir, confirmar] of casos) {
      const gatilho = abrir();
      expect(gatilho, `botão do cartão que abre ${confirmar}`).toBeTruthy();
      await clicar(gatilho);
      const dialogo = $('[role="dialog"]');
      expect(dialogo, `modal de ${confirmar}`).toBeTruthy();
      const botao = $(confirmar);
      expect(botao, confirmar).toBeTruthy();
      // Teclado virtual abre: a área visível encolhe para 420px.
      vv.height = 420;
      await act(async () => { vv.dispatchEvent(new Event("resize")); });
      relatorio[confirmar] = {
        rodapeSeguro: !!rodapeSeguro(botao),
        alvos: alvosPequenos(dialogo!),
        vizinhos: vizinhosColados(dialogo!),
        campos: camposRuins(dialogo!),
        letras: letrasMiudas(dialogo!),
        tetoComTeclado: dialogo!.style.maxHeight,
        uploaderCamera: !!dialogo!.querySelector('input[type="file"][capture="environment"]'),
      };
      vv.height = 760;
      await act(async () => { vv.dispatchEvent(new Event("resize")); });
      await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
      await tick(20);
      if ($('[role="dialog"]')) {
        const fechar = $('[role="dialog"] button[aria-label="Fechar"]');
        await clicar(fechar);
        await tick(20);
      }
    }
    saida(`MODAIS ${largura} ${JSON.stringify(relatorio, null, 2)}`);
    for (const [, confirmar] of casos) {
      const r = relatorio[confirmar] as any;
      expect(r.rodapeSeguro, `${confirmar}: rodapé com env(safe-area-inset-bottom)`).toBe(true);
      expect(r.alvos, confirmar).toEqual([]);
      expect(r.vizinhos, confirmar).toEqual([]);
      expect(r.campos, confirmar).toEqual([]);
      expect(r.letras, confirmar).toEqual([]);
      // Com o teclado aberto o modal cabe na área VISÍVEL (420 − 16 de respiro).
      expect(r.tetoComTeclado, `${confirmar}: teto segue o teclado`).toBe("404px");
    }
    expect((relatorio['[data-testid="button-confirm-conference"]'] as any).uploaderCamera, "câmera traseira direto").toBe(true);
  }, 60_000);

  it("fila do galpão, barra do lote e folha de filtros", async () => {
    const vv = await montar(largura);

    // ── FILA DO GALPÃO ──
    await clicar($('[data-testid="button-fila-conferir"]'));
    const fila = $('[data-testid="galpao-fila"]')!;
    expect(fila).toBeTruthy();
    const topo = $('[data-testid="galpao-sair"]')!.parentElement!;
    const registrou = $('[data-testid="galpao-registrou"]')!;
    const arte = fila.querySelector<HTMLImageElement>('img[alt^="Arte da peça"]');
    vv.height = 400;
    await act(async () => { vv.dispatchEvent(new Event("resize")); });
    const galpao = {
      rodapeSeguro: !!rodapeSeguro($('[data-testid="galpao-confirmar"]')),
      topoSeguro: /safe-area-inset-top/.test(topo.style.paddingTop),
      alvos: alvosPequenos(fila),
      vizinhos: vizinhosColados(fila),
      campos: camposRuins(fila),
      letras: letrasMiudas(fila),
      // O aviso "registrou" não pode empurrar a câmera para baixo do dedo.
      avisoSemEmpurrar: registrou.style.position === "relative" && registrou.style.height === "0px",
      arteComAlturaReservada: arte ? !!arte.style.height : true,
      alturaComTeclado: fila.style.height,
    };
    vv.height = 760;
    await act(async () => { vv.dispatchEvent(new Event("resize")); });
    await clicar($('[data-testid="galpao-sair"]'));

    // ── BARRA DO LOTE ──
    await clicar($('[data-testid="button-bulk-confer"]'));
    const barra = $('[role="toolbar"]')!;
    const raiz = $('[data-testid="title-grafica"]')!.closest<HTMLElement>('[style*="overflow-y"]')!;
    await clicar($('[role="checkbox"][aria-label^="Selecionar"]'));
    const lote = {
      barraSegura: /safe-area-inset-bottom/.test(barra.style.paddingBottom),
      alvos: alvosPequenos(barra),
      vizinhos: vizinhosColados(barra),
      letras: letrasMiudas(barra),
      rotulo: $('[data-testid="button-bulk-continuar"]')!.textContent,
      reservaDaLista: raiz.style.paddingBottom,
      contadorVivo: !!barra.querySelector('[aria-live="polite"]'),
      caixasDeSelecao: alvosPequenos(document.body).filter((r) => r.includes("Selecionar")),
    };
    // ── DIÁLOGO DO LOTE (a foto única) ──
    await clicar($('[data-testid="button-bulk-continuar"]'));
    const dialogoLote = $('[role="dialog"]')!;
    expect(dialogoLote, "diálogo do lote").toBeTruthy();
    vv.height = 380;
    await act(async () => { vv.dispatchEvent(new Event("resize")); });
    const confirmarLote = Array.from(dialogoLote.querySelectorAll("button")).find((b) => /^Conferir \d+ peça/.test((b.textContent ?? "").trim())) ?? null;
    const dialogoDoLote = {
      rodapeSeguro: !!rodapeSeguro(confirmarLote),
      alvos: alvosPequenos(dialogoLote),
      vizinhos: vizinhosColados(dialogoLote),
      campos: camposRuins(dialogoLote),
      letras: letrasMiudas(dialogoLote),
      tetoComTeclado: dialogoLote.style.maxHeight,
    };
    vv.height = 760;
    await act(async () => { vv.dispatchEvent(new Event("resize")); });
    await clicar(dialogoLote.querySelector('button[title="Fechar (Esc)"]'));
    await tick(20);
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });

    // ── FOLHA DE FILTROS ──
    await clicar($('[data-testid="button-abrir-filtros-mobile"]'));
    const folha = $('[data-testid="folha-filtros-mobile"]')!;
    const folhaR = {
      altura: folha.style.height,
      rodapeSeguro: !!rodapeSeguro($('[data-testid="button-aplicar-filtros-mobile"]')),
      topoSeguro: /safe-area-inset-top/.test((folha.firstElementChild as HTMLElement).style.paddingTop),
      alvos: alvosPequenos(folha),
      vizinhos: vizinhosColados(folha),
      letras: letrasMiudas(folha),
    };
    saida(`GALPÃO/LOTE/FOLHA ${largura} ${JSON.stringify({ galpao, lote, dialogoDoLote, folha: folhaR, externos: Array.from(externos) }, null, 2)}`);

    expect(galpao.rodapeSeguro).toBe(true);
    expect(galpao.topoSeguro).toBe(true);
    expect(galpao.alvos).toEqual([]);
    expect(galpao.vizinhos).toEqual([]);
    expect(galpao.campos).toEqual([]);
    expect(galpao.letras).toEqual([]);
    expect(galpao.avisoSemEmpurrar).toBe(true);
    expect(galpao.arteComAlturaReservada).toBe(true);
    expect(galpao.alturaComTeclado, "a fila encolhe para a área acima do teclado").toBe("400px");

    expect(lote.barraSegura).toBe(true);
    expect(lote.alvos).toEqual([]);
    expect(lote.vizinhos).toEqual([]);
    expect(lote.letras).toEqual([]);
    expect(lote.rotulo).toMatch(/Continuar para a foto/);
    expect(lote.contadorVivo).toBe(true);
    // A lista reserva, embaixo, a altura da barra de DUAS linhas do celular.
    expect(lote.reservaDaLista).toMatch(/calc\((1[3-9]\d|[2-9]\d\d)px \+ env\(safe-area-inset-bottom\)\)/);

    expect(dialogoDoLote.rodapeSeguro).toBe(true);
    expect(dialogoDoLote.alvos).toEqual([]);
    expect(dialogoDoLote.vizinhos).toEqual([]);
    expect(dialogoDoLote.campos).toEqual([]);
    expect(dialogoDoLote.letras).toEqual([]);
    expect(dialogoDoLote.tetoComTeclado).toBe("364px");

    expect(folhaR.altura).toBe("100dvh");
    expect(folhaR.rodapeSeguro).toBe(true);
    expect(folhaR.topoSeguro).toBe(true);
    expect(folhaR.alvos).toEqual([]);
    expect(folhaR.vizinhos).toEqual([]);
    expect(folhaR.letras).toEqual([]);
  }, 60_000);
});
