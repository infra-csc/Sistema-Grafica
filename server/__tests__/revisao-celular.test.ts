// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// A REVISÃO FINAL NO CELULAR E NO DESKTOP (revisão de 25/09).
//
// jsdom não faz layout: as regras aqui são ESTRUTURAIS — onde cada controle
// mora, o estilo inline declarado (alvo ≥ 44 no celular, letra ≥ 12) e o que
// fica fora da rolagem. O que depende de medida real (a primeira peça acima
// da dobra a 360×640) tem de ser conferido ao vivo.
//
//   · LISTA (celular): a barra de filtros ROLA junto (não é fixa); busca +
//     "Filtros (n)" + Evento à vista; Tipo e facetas numa folha de tela cheia
//     com "Ver N peças"; o cartão tem "Revisar" como ação principal e nada
//     escrito abaixo de 12px; o lote vira barra FIXA no rodapé.
//   · FICHA (celular): Liberar e Devolver num RODAPÉ FIXO fora da rolagem; o
//     motivo do Liberar apagado escrito ao lado; a fila numa tira própria; a
//     tira de metadados em grade (sem rolagem lateral); nada abaixo de 12px.
//   · CONFIRMAÇÕES (celular): botões em linha cheia, a ação principal em
//     cima, todos com alvo de 44.
//   · DESKTOP: nada disso muda — faixa fixa, botões na faixa de decisão, e o
//     "Selecionar todos" não se repete na barra quando a tabela já o tem.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;
vi.setConfig({ testTimeout: 120_000 });

let papel = "solicitacao";
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "u-s", name: "Sofia", email: "s@s", role: papel, mustChangePassword: false }, isLoading: false, logout: () => {} }),
  AuthProvider: ({ children }: any) => children,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {}, dismiss: () => {}, toasts: [] }), toast: () => {} }));

const tid = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const tick = (ms = 0) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
async function esperar(cond: () => boolean, oQue: string, max = 400) {
  for (let i = 0; i < max && !cond(); i++) await tick(25);
  expect(cond(), oQue).toBe(true);
}
const px = (v: string) => { const m = /^(\d+(?:\.\d+)?)px$/.exec(v); return m ? Number(m[1]) : NaN; };

function prepararJsdom(largura: number) {
  Object.defineProperty(window, "innerWidth", { value: largura, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 780, configurable: true });
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: /max-width:\s*767px/.test(q) && largura < 768, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
  (Element.prototype as any).scrollIntoView = () => {};
  (Element.prototype as any).scrollTo = () => {};
  (Element.prototype as any).hasPointerCapture = () => false;
  (Element.prototype as any).releasePointerCapture = () => {};
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); papel = "solicitacao"; });

const DIA = 86_400_000;
const iso = (d: number) => new Date(Date.now() + d * DIA).toISOString();
const EVENTO = {
  id: "e1", name: "Maratona Internacional de São Paulo", priority: "media", status: "active", manuallyClosed: false,
  startDate: iso(20).slice(0, 10), truckDepartureDate: iso(5), lifecycle: "active", allDelivered: false, eventHasPassed: false,
  deadlineListaImagens: -25, deadlineRevisaoLista: -8, sponsors: [], items: [],
};
const peca = (id: string, over: any = {}) => ({
  id, displayId: `#0${id.replace(/\D/g, "").padStart(3, "0")}`, eventId: "e1", event: EVENTO, type: "Pórtico inflável", description: `Pórtico de largada ${id}`,
  quantity: 2, quantityProduced: 0, conferredQty: 0, deliveredQty: 0, reuseQty: 0, isReuse: false,
  material: "Lona 440g", finish: "Ilhós a cada 50cm", calculatedM2: "12.5", fileWidth: "500", fileHeight: "250",
  status: "awaiting_final_review", skipApproval: false, sponsors: [{ id: "s1", name: "Marca Azul" }], observations: "", approvalThumbUrl: "/objects/t.png",
  finalFileUrl: "/objects/final.pdf", kitRemessaId: null, parentItemId: null, travadaEm: null,
  createdAt: iso(-10), updatedAt: iso(-1), statusChangedAt: iso(-1),
  ...over,
});
const FILA = [
  peca("a1"),
  peca("a2", { finalFileUrl: null }),
  peca("a3", { travadaEm: iso(-1), travadaPor: "Ana", travadaMotivo: "Quantidade vai mudar" }),
  peca("a4", { rejectionReason: "O logo estava cortado na lateral", observations: "Conferir o azul" }),
];

async function montar(largura: number, pecas = FILA) {
  prepararJsdom(largura);
  vi.stubGlobal("fetch", vi.fn(async (url: any, init?: any) => {
    const u = new URL(String(url), "http://local");
    const metodo = init?.method ?? "GET";
    const json = (corpo: any, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
    if (metodo !== "GET") return json({ ok: true });
    if (u.pathname === "/api/items" && u.searchParams.get("since")) return json({ delta: true, agora: new Date().toISOString(), itens: [], removidas: [], eventos: [], patrocinadores: [] });
    if (u.pathname === "/api/items") return json(pecas);
    if (u.pathname === "/api/events") return json([EVENTO]);
    if (/consulta-de-estoque$/.test(u.pathname)) return json({ consulta: null });
    return json([]);
  }));
  window.history.replaceState(null, "", "/solicitacao");
  const { queryClient, resetItensDelta } = await import("@/lib/queryClient");
  const { TooltipProvider } = await import("@/components/ui/tooltip");
  const Solicitacao = (await import("@/pages/solicitacao")).default;
  queryClient.clear();
  resetItensDelta();
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(TooltipProvider, null, h(Solicitacao as any, null)))); });
  await esperar(() => !!tid(`button-review-${pecas[0].id}`), "a fila da Revisão carrega");
}

/** Todo texto com letra declarada inline abaixo de 12px dentro de `raiz`. */
function letrasPequenas(raiz: Element): string[] {
  const achados: string[] = [];
  raiz.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const fs = px(el.style.fontSize);
    if (!Number.isNaN(fs) && fs < 12 && (el.textContent ?? "").trim()) achados.push(`${fs}px "${(el.textContent ?? "").trim().slice(0, 40)}"`);
  });
  return achados;
}

/** Botões com altura declarada abaixo de 44 (o X do cabeçalho sobe por CSS em pointer: coarse). */
function alvosPequenos(raiz: Element): string[] {
  const achados: string[] = [];
  raiz.querySelectorAll<HTMLElement>("button").forEach((b) => {
    if (b.classList.contains("modal-fechar")) return;
    // O X nativo do DialogContent, escondido por classe (HIDE_NATIVE_CLOSE) — o jsdom não lê CSS.
    if (b.parentElement?.getAttribute("role") === "dialog" && b === b.parentElement.lastElementChild) return;
    const alt = Math.max(px(b.style.minHeight) || 0, px(b.style.height) || 0);
    if (alt < 44) achados.push(`${alt}px "${(b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 30)}"`);
  });
  return achados;
}

async function abrirFicha(id: string) {
  await act(async () => { fireEvent.click(tid(`button-review-${id}`)!); });
  await esperar(() => !!tid("modal-revisao"), "a ficha abre");
}

describe("celular (390): a lista", () => {
  it("a barra de filtros rola junto e guarda Tipo e facetas numa folha", async () => {
    await montar(390);
    const barra = tid("barra-de-filtros-revisao")!;
    expect(barra.style.position).not.toBe("sticky");
    expect(tid("button-abrir-filtros-mobile")).not.toBeNull();
    expect(tid("filtro-evento-mobile")).not.toBeNull();
    // Tipo e os chips não ficam na faixa: moram na folha.
    expect(barra.querySelector('[data-testid="chip-sem-arquivo"]')).toBeNull();
    await act(async () => { fireEvent.click(tid("button-abrir-filtros-mobile")!); });
    const folha = tid("folha-filtros-mobile")!;
    expect(folha.getAttribute("role")).toBe("dialog");
    expect(folha.style.position).toBe("fixed");
    expect(folha.querySelector('[data-testid="chip-sem-arquivo"]')).not.toBeNull();
    // "Sem arquivo final" ligado: o botão da barra conta 1 e a folha diz quantas peças ficam.
    await act(async () => { fireEvent.click(folha.querySelector<HTMLElement>('[data-testid="chip-sem-arquivo"]')!); });
    await esperar(() => tid("button-aplicar-filtros-mobile")!.textContent === "Ver 1 peça", "a folha conta o recorte");
    await act(async () => { fireEvent.click(tid("button-aplicar-filtros-mobile")!); });
    expect(tid("folha-filtros-mobile")).toBeNull();
    expect(tid("button-abrir-filtros-mobile")!.textContent).toContain("Filtros (1)");
  });

  it("o cartão tem Revisar como ação principal, a medida e nada abaixo de 12px", async () => {
    await montar(390);
    const revisar = tid("button-revisar-cartao-a1")!;
    expect(revisar.textContent).toContain("Revisar");
    expect(revisar.className).toContain("ds-botao");
    expect(px(revisar.style.minHeight)).toBeGreaterThanOrEqual(44);
    expect(tid("medida-cartao-a1")!.textContent).toBe("2 un · 500×250 · 12.5 m²");
    // O cabeçalho do evento diz a urgência, como a faixa da tabela.
    expect(tid("chip-caminhao-cartoes-e1")!.textContent).toMatch(/5d|4d|6d/);
    const lista = tid("button-review-a1")!.closest("section")!;
    expect(letrasPequenas(lista)).toEqual([]);
    expect(alvosPequenos(lista)).toEqual([]);
  });

  it("o lote vira barra fixa no rodapé", async () => {
    await montar(390);
    await act(async () => { fireEvent.click(tid("checkbox-select-all")!); });
    await esperar(() => !!tid("barra-do-lote"), "a barra do lote aparece");
    const barra = tid("barra-do-lote")!;
    expect(barra.style.position).toBe("fixed");
    expect(barra.style.bottom).toBe("0px");
    expect(tid("button-bulk-release-hero")!.textContent).toBe("Liberar as 2 prontas");
    expect(alvosPequenos(barra)).toEqual([]);
  });
});

describe("celular (390): a ficha", () => {
  it("Liberar e Devolver moram num rodapé fixo, fora da rolagem", async () => {
    await montar(390);
    await abrirFicha("a1");
    const rodape = tid("rodape-da-decisao")!;
    expect(rodape).not.toBeNull();
    const liberar = tid("button-release-modal")!;
    const devolver = tid("button-return-toggle")!;
    expect(rodape.contains(liberar)).toBe(true);
    expect(rodape.contains(devolver)).toBe(true);
    // O rodapé é irmão do corpo que rola — não está dentro dele.
    let el: HTMLElement | null = rodape.parentElement;
    while (el && el !== document.body) {
      expect(el.style.overflowY).not.toBe("auto");
      el = el.parentElement;
    }
    expect(px(liberar.style.minHeight)).toBeGreaterThanOrEqual(48);
    // Reaproveitar e Travar ficam no corpo, lado a lado.
    expect(rodape.contains(tid("button-reuse-modal"))).toBe(false);
    expect(tid("button-travar-revisao")).not.toBeNull();
  });

  it("sem arquivo final: o motivo do Liberar apagado está escrito no rodapé", async () => {
    await montar(390);
    await abrirFicha("a2");
    expect((tid("button-release-modal") as HTMLButtonElement).disabled).toBe(true);
    expect(tid("motivo-no-rodape")!.textContent).toContain("arquivo final");
    expect((tid("button-return-toggle") as HTMLButtonElement).disabled).toBe(false);
  });

  it("a fila numa tira própria, metadados em grade, e nada abaixo de 12px nem alvo abaixo de 44", async () => {
    await montar(390);
    await abrirFicha("a4");
    expect(tid("fila-da-ficha-celular")).not.toBeNull();
    expect(tid("text-queue-position")!.textContent).toBe("4 / 4");
    const tira = tid("tira-de-metadados")!;
    expect(tira.style.display).toBe("grid");
    expect(tira.style.overflowX).not.toBe("auto");
    // Os dois arquivos lado a lado também aqui.
    expect(tid("faixa-comparacao")!.style.gridTemplateColumns).toBe("minmax(0, 1fr) minmax(0, 1fr)");
    const modal = tid("modal-revisao")!;
    expect(letrasPequenas(modal)).toEqual([]);
    expect(alvosPequenos(modal)).toEqual([]);
    // O motivo da última devolução e o recado continuam à vista.
    expect(tid("motivo-ultima-devolucao")!.textContent).toContain("logo estava cortado");
    expect((tid("textarea-item-observations") as HTMLTextAreaElement).value).toBe("Conferir o azul");
  });

  it("peça travada: a confirmação empilha os botões, com a ação principal em cima", async () => {
    await montar(390);
    await abrirFicha("a3");
    // O Destravar, na faixa vermelha da trava, também com alvo de 44.
    expect(alvosPequenos(tid("selo-travada-revisao")!)).toEqual([]);
    await act(async () => { fireEvent.click(tid("button-release-modal")!); });
    await esperar(() => !!tid("button-release-destravar"), "a confirmação abre");
    const confirmar = tid("button-release-confirm")!;
    const rodape = confirmar.parentElement!;
    expect(rodape.style.flexDirection).toBe("column-reverse");
    // column-reverse sobre Cancelar → destravar → manter: "manter" é o último
    // no DOM e, portanto, o PRIMEIRO na tela.
    const botoes = Array.from(rodape.querySelectorAll("button"));
    expect(botoes[botoes.length - 1]).toBe(confirmar);
    expect(alvosPequenos(rodape)).toEqual([]);
  });

  it("devolver: o seletor de destino e o contador em letra de 12 ou mais", async () => {
    await montar(390);
    await abrirFicha("a1");
    await act(async () => { fireEvent.click(tid("button-return-toggle")!); });
    await esperar(() => !!tid("textarea-return-quick"), "a confirmação de devolver abre");
    const dialogo = tid("textarea-return-quick")!.closest('[role="alertdialog"]')!;
    expect(letrasPequenas(dialogo).join(" | ")).toBe("");
    expect(alvosPequenos(dialogo).join(" | ")).toBe("");
    expect(px((tid("textarea-return-quick") as HTMLElement).style.fontSize)).toBeGreaterThanOrEqual(16);
  });
});

describe("desktop (1280): nada disso muda", () => {
  it("faixa fixa, botões na faixa de decisão, sem rodapé fixo e sem 'selecionar todos' repetido", async () => {
    await montar(1280);
    expect(tid("barra-de-filtros-revisao")!.style.position).toBe("sticky");
    // A tabela já tem a caixa de marcar todas no cabeçalho.
    expect(tid("checkbox-select-all-header")).not.toBeNull();
    expect(tid("checkbox-select-all")).toBeNull();
    // O contador único continua.
    expect(tid("contador-da-fila")!.textContent).toContain("4 de 4 peças");
    await abrirFicha("a1");
    expect(tid("rodape-da-decisao")).toBeNull();
    expect(tid("fila-da-ficha-celular")).toBeNull();
    expect(tid("button-release-modal")!.textContent).toContain("Liberar para produção");
    expect(tid("tira-de-metadados")!.style.display).toBe("flex");
    // A confirmação do desktop continua em fileira, Cancelar à esquerda.
    await act(async () => { fireEvent.click(tid("button-return-toggle")!); });
    await esperar(() => !!tid("button-return-confirm"), "a confirmação de devolver abre");
    expect(tid("button-return-confirm")!.parentElement!.style.flexDirection).not.toBe("column-reverse");
  });

  it("admin: excluir é um Botão de verdade na linha (sem onMouseEnter) e o ícone do cartão tem 44", async () => {
    papel = "admin";
    await montar(1280);
    const lixeira = tid("button-delete-a1")!;
    expect(lixeira.className).toContain("ds-botao");
    expect(lixeira.getAttribute("aria-label")).toBe("Excluir a peça #0001");
    const reuso = tid("button-reuse-a1")!;
    expect(reuso.className).toContain("ds-botao");
    expect(reuso.getAttribute("aria-pressed")).toBe("false");
    cleanup();
    await montar(390);
    expect(px(tid("button-delete-a1")!.style.minHeight)).toBeGreaterThanOrEqual(44);
    expect(tid("button-delete-a1")!.style.width).toBe("44px");
  });
});
