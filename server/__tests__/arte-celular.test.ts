// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// A ARTE NO CELULAR E NO TABLET (revisão de 24/09) + os dois pedidos do dono do
// mesmo dia: o LEMBRETE do arquivo final e a TROCA do que já foi enviado.
//
// jsdom não faz layout: as regras aqui são estruturais — onde cada controle
// mora, estilo inline declarado (alvo ≥ 44, letra ≥ 12), a ordem da primeira
// dobra e o que a ficha oferece em cada fase. O que depende de medida real
// (a primeira peça abaixo da dobra a 360×780) foi conferido ao vivo.
//
//   · CELULAR: o topo ROLA junto (não é mais fixo); o "⋯" (Mais ações) mora na
//     linha do título e leva o lote de thumbs; Evento + "Saída 10 dias" numa
//     linha; fase + Ordenar (⇅) + Selecionar tudo numa linha; a contagem da
//     fase vai no gatilho.
//   · CARTÃO: caixinha de seleção com alvo de 44 nas abas que selecionam; nada
//     escrito abaixo de 12px.
//   · FICHA: o bloco de ação da fase vem no TOPO (antes do percurso), também
//     o do thumb; o lembrete vermelho acompanha todo envio/troca de arquivo
//     final; peça com o Atendimento abre só a troca do thumb (sem campo de
//     arquivo final), e o "⋯" oferece "Trocar thumb" quando a regra deixa.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { regraDaTrocaDeThumb } from "../../shared/troca-de-material";
import { ITENS_DO_LEMBRETE_DO_ARQUIVO_FINAL } from "../../client/src/components/arte/lembrete-do-arquivo-final";

const h = React.createElement;
const DIA = 86_400_000;
const hoje = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

const EVENTO = {
  id: "e1", name: "Circuito Estações — Primavera de Salvador", status: "active", priority: "media",
  startDate: iso(hoje + 40 * DIA).slice(0, 10), truckDepartureDate: iso(hoje + 37 * DIA),
};
const base = (i: number, over: Record<string, unknown> = {}) => ({
  id: `p${i}`, displayId: `#${100 + i}`, status: "awaiting_submission",
  type: "Backdrop", description: `Peça ${i}`, material: "LONA", finish: "Ilhós", quantity: 2,
  visualWidth: "3", visualHeight: "2", fileWidth: "3.1", fileHeight: "2.1", calculatedM2: "6.51",
  eventId: EVENTO.id, event: { ...EVENTO }, sponsors: [{ id: "s0", name: "Marca A", color: "#3b82f6", approvalStatus: "pending" }],
  approvalThumbUrl: null, finalFileUrl: null, skipApproval: false, observations: "Conferir o logo novo",
  statusChangedAt: iso(hoje - 3 * DIA), updatedAt: iso(hoje - DIA), createdAt: iso(hoje - 10 * DIA),
  ...over,
});
const PECAS = [
  base(0), base(1),
  base(2, { status: "sponsor_approved", approvalThumbUrl: "/objects/t2.png" }),
  base(3, { status: "awaiting_sponsor_approval", approvalThumbUrl: "/objects/t3.png" }),
  base(4, { status: "ready_for_production", approvalThumbUrl: "/objects/t4.png", finalFileUrl: "\\\\srv\\artes\\p4.pdf" }),
];

let largura = 390;
let papel = "arte";
beforeAll(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
  (Element.prototype as any).scrollIntoView = () => {};
  (Element.prototype as any).scrollTo = () => {};
  (Element.prototype as any).hasPointerCapture = () => false;
  (Element.prototype as any).releasePointerCapture = () => {};
  Object.defineProperty(window, "innerWidth", { configurable: true, get: () => largura });
  vi.stubGlobal("fetch", async (url: any, init?: any) => {
    const u = String(url);
    const method = (init?.method || "GET").toUpperCase();
    const json = (b: any) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
    if (u === "/api/auth/me") return json({ id: "u1", name: "Ana", email: "a@a", role: papel, mustChangePassword: false });
    if ((u === "/api/items" || u.startsWith("/api/items?")) && method === "GET") {
      return u.includes("since=") ? json({ itens: [], removidas: [], agora: iso(Date.now()) }) : json(PECAS);
    }
    if (u.split("?")[0] === "/api/items/batch-approval-data") return json({ sponsorsByItem: {}, approvalsByItem: {} });
    if (u.split("?")[0] === "/api/events" && method === "GET") return json([EVENTO]);
    if (u.split("?")[0] === "/api/artes/sugestao-final") return json(null);
    return json([]);
  });
});

beforeEach(() => {
  cleanup();
  try { localStorage.clear(); sessionStorage.clear(); } catch { /* sem storage */ }
});

const $ = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const tid = (id: string) => $(`[data-testid="${id}"]`);
async function tick(ms = 20) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
async function esperar(cond: () => boolean, oQue = "", max = 400) {
  for (let i = 0; i < max && !cond(); i++) await tick(10);
  expect(cond(), oQue).toBe(true);
}
async function clicar(el: HTMLElement | null) {
  expect(el).not.toBeNull();
  await act(async () => {
    fireEvent.pointerDown(el!, { button: 0, pointerType: "mouse" });
    fireEvent.click(el!);
  });
  await tick(20);
}
const px = (v: string) => { const m = /^(\d+(?:\.\d+)?)px$/.exec(v); return m ? Number(m[1]) : NaN; };
const antes = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

async function montar(px_: number, busca = "?fase=criar-aprovacoes", comoPapel = "arte") {
  largura = px_;
  papel = comoPapel;
  window.history.replaceState(null, "", `/arte${busca}`);
  const { queryClient, resetItensDelta } = await import("@/lib/queryClient");
  const { TooltipProvider } = await import("@/components/ui/tooltip");
  const { AuthProvider } = await import("@/contexts/auth-context");
  const Arte = (await import("@/pages/arte")).default;
  queryClient.clear();
  resetItensDelta();
  render(h(QueryClientProvider, { client: queryClient } as any, h(TooltipProvider, null, h(AuthProvider, null, h(Arte as any, null)))));
}

/** Texto PRÓPRIO com fonte inline < 12px (ignora o que é só para leitor de tela). */
function letrasMiudas(raiz: ParentNode) {
  const ruins: string[] = [];
  for (const el of Array.from(raiz.querySelectorAll<HTMLElement>("*"))) {
    const fs = px(el.style.fontSize);
    if (!(fs < 12) || el.closest(".sr-only")) continue;
    const proprio = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 1);
    if (proprio) ruins.push(`${(el.textContent ?? "").trim().slice(0, 30)} (${fs}px)`);
  }
  return ruins;
}

describe.each([360, 390])("Arte em %ipx — primeira dobra do celular", { timeout: 60_000 }, (larg) => {
  it("o topo rola junto e cabe em quatro faixas: título+⋯, busca+Filtros, Evento+Saída, fase+⇅+selecionar", async () => {
    await montar(larg);
    await esperar(() => !!$('[data-testid^="card-arte-"]'), "a fila carrega em cartões");
    // Topo não é mais fixo; quem rola é a raiz.
    expect(tid("topo-arte")!.style.position).toBe("relative");
    expect(tid("raiz-arte")!.style.overflowY).toBe("auto");
    // Sem o ícone da página (a barra do app já diz "Arte").
    expect(tid("cabecalho-da-pagina")!.querySelector('div[aria-hidden="true"]')).toBeNull();
    // "⋯" de 44×44 na linha do título; o lote de thumbs mora DENTRO dele.
    const mais = tid("button-mais-acoes")!;
    expect(mais.style.width).toBe("44px");
    expect(mais.style.minHeight).toBe("44px");
    expect(tid("button-open-bulk-thumb")).toBeNull();
    // Evento e "Saída 10 dias" na MESMA linha.
    const linhaEvento = tid("filtro-evento-mobile")!;
    expect(linhaEvento.contains(tid("button-next-10-days-filter"))).toBe(true);
    // Fase, Ordenar (só ícone) e Selecionar tudo na MESMA linha, com a contagem no gatilho.
    const linhaFase = tid("linha-fase-mobile")!;
    for (const id of ["select-fase-mobile", "select-ordenar", "button-select-all"]) {
      expect(linhaFase.contains(tid(id)), id).toBe(true);
    }
    expect(tid("select-fase-mobile-contagem")!.textContent).toBe("2");
    expect(tid("select-ordenar")!.getAttribute("aria-label")).toMatch(/^Ordenar: /);
    expect(tid("select-ordenar")!.textContent).toBe("");
    expect(tid("button-select-all")!.getAttribute("aria-label")).toBe("Selecionar tudo");
    // Ordem de leitura: título → busca → evento → fase → primeira peça.
    const ordem = ["contexto-arte", "input-search-filter", "filtro-evento-mobile", "linha-fase-mobile"].map((t) => tid(t)!);
    for (let i = 1; i < ordem.length; i++) expect(antes(ordem[i - 1], ordem[i]), `ordem ${i}`).toBe(true);
    expect(antes(ordem[3], $('[data-testid^="card-arte-"]')!)).toBe(true);
  });

  it("o lote de thumbs abre pelo '⋯' e o <input> do lote continua montado fora do menu", async () => {
    await montar(larg);
    await esperar(() => !!$('[data-testid^="card-arte-"]'));
    const entrada = document.getElementById("arte-input-lote-thumbs") as HTMLInputElement;
    expect(entrada?.type).toBe("file");
    await clicar(tid("button-mais-acoes"));
    const lote = tid("button-open-bulk-thumb")!;
    expect(lote.getAttribute("for")).toBe("arte-input-lote-thumbs");
    expect(lote.style.height).toBe("44px");
  });

  it("cartão: caixinha com alvo de 44 nas abas que selecionam, e nada abaixo de 12px", async () => {
    await montar(larg);
    await esperar(() => !!tid("card-arte-p0"));
    const alvo = tid("alvo-selecao-p0")!;
    expect(alvo.style.width).toBe("44px");
    expect(alvo.style.height).toBe("44px");
    await act(async () => { fireEvent.click(tid("checkbox-item-p0")!); });
    await tick(20);
    expect(tid("chip-selecao")!.textContent).toMatch(/1 selecionada/);
    // Marcar NÃO abre a peça.
    expect($('[role="dialog"]')).toBeNull();
    const lista = document.getElementById("painel-arte")!;
    expect(letrasMiudas(lista), "letra < 12px na fila do celular").toEqual([]);
    expect(tid("cell-idade-p0")!.textContent).toMatch(/^há \d+d na fase$/);
  });

  it("aba sem seleção (Aguardando patrocinador): cartão sem caixinha", async () => {
    await montar(larg, "?fase=aguardando-patrocinador");
    await esperar(() => !!tid("card-arte-p3"));
    expect(tid("alvo-selecao-p3")).toBeNull();
    expect(tid("button-select-all")).toBeNull();
  });

  it("modo consulta: faixa de UMA frase no celular", async () => {
    await montar(larg, "?fase=criar-aprovacoes", "atendimento");
    await esperar(() => !!tid("banner-modo-consulta"));
    expect(tid("banner-modo-consulta")!.textContent).toBe("Modo consulta. Só a equipe de Arte altera as peças.");
  });
});

describe("Arte — a ficha abre com o bloco de ação no TOPO", { timeout: 60_000 }, () => {
  it("aguardando envio: o painel do thumb vem antes do percurso", async () => {
    await montar(1280);
    await esperar(() => !!tid("row-pending-item-p0"));
    await clicar(tid("button-action-p0"));
    await esperar(() => !!tid("button-upload-file"), "a zona de upload aparece");
    const percurso = tid("section-percurso");
    if (percurso) expect(antes(tid("button-upload-file")!, percurso)).toBe(true);
  });
});

describe("Arte — lembrete do arquivo final (dono, 24/09)", { timeout: 60_000 }, () => {
  it("o texto exato, lista semântica, nota, vermelho de perigo e ≥ 12px", async () => {
    expect(ITENS_DO_LEMBRETE_DO_ARQUIVO_FINAL).toEqual([
      "Medida do arquivo (inclusive área visual)",
      "Se o arquivo está em CMYK",
      "Resolução do arquivo e dos logos",
      "Layout confere com o thumb/book aprovado",
    ]);
    await montar(1280, "?item=p2");
    await esperar(() => !!tid("lembrete-arquivo-final"), "Finalizar: o lembrete aparece");
    const nota = tid("lembrete-arquivo-final")!;
    expect(nota.getAttribute("role")).toBe("note");
    expect(nota.textContent).toContain("Lembre-se de conferir:");
    expect(nota.querySelectorAll("ul > li").length).toBe(4);
    expect(nota.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    expect(nota.querySelector("button, input, [role=checkbox]"), "lembrete, não checklist clicável").toBeNull();
    for (const li of Array.from(nota.querySelectorAll<HTMLElement>("li"))) expect(px(li.style.fontSize)).toBeGreaterThanOrEqual(12);
    // Vem ANTES do botão de envio, e não o trava.
    expect(antes(nota, tid("button-submit-final")!)).toBe(true);
    expect(tid("lembrete-arquivo-final")!.style.background).toBe("rgb(254, 242, 242)"); // TOM.perigo.bg
  });

  it("na TROCA do arquivo final (peça liberada) o lembrete também aparece", async () => {
    await montar(1280, "?item=p4");
    await esperar(() => !!tid("input-final-file-path"), "a troca do arquivo final aparece");
    expect(tid("lembrete-arquivo-final")).not.toBeNull();
    expect(tid("aviso-troca-volta-revisao")!.textContent).toMatch(/Revisão Final/);
  });

  it("no celular a lista não tem letra < 12px", async () => {
    await montar(390, "?item=p2");
    await esperar(() => !!tid("lembrete-arquivo-final"));
    expect(letrasMiudas(tid("lembrete-arquivo-final")!)).toEqual([]);
  });
});

describe("Arte — trocar o que já foi enviado", { timeout: 60_000 }, () => {
  it("peça com o Atendimento: a ficha abre a troca do thumb (pela regra), sem campo de arquivo final nem lembrete", async () => {
    const regra = regraDaTrocaDeThumb(PECAS[3]);
    await montar(1280, "?item=p3");
    await esperar(() => !!tid("painel-da-ficha-arte"), "o bloco de troca abre no topo da ficha");
    expect(tid("painel-da-ficha-arte")!.textContent).toContain("Trocar thumb enviado");
    expect(tid("input-final-file-path")).toBeNull();
    expect(tid("lembrete-arquivo-final")).toBeNull();
    const texto = tid("texto-troca-thumb")!.textContent ?? "";
    if (regra.pode) {
      expect(texto).toMatch(/Atendimento será avisado/);
      if (regra.exigeMotivo) expect(tid("textarea-motivo-troca-thumb")).not.toBeNull();
    } else {
      expect(texto).toBe(regra.motivo);
      expect(tid("uploader-update-thumb")).toBeNull();
    }
  });

  it("o '⋯' da linha oferece 'Trocar thumb' só quando a regra deixa", async () => {
    await montar(1280, "?fase=aguardando-patrocinador");
    await esperar(() => !!tid("button-row-menu-p3"));
    await clicar(tid("button-row-menu-p3"));
    await esperar(() => !!tid("button-view-p3"));
    expect(!!tid("button-trocar-thumb-p3")).toBe(regraDaTrocaDeThumb(PECAS[3]).pode);
    if (tid("button-trocar-thumb-p3")) {
      await clicar(tid("button-trocar-thumb-p3"));
      await esperar(() => !!tid("painel-da-ficha-arte"), "abre a ficha com a troca");
    }
  });
});
