// @vitest-environment jsdom
//
// ARTE — "MENOS É MAIS" (dono, 22/09: "a ideia é não deixar a tela com tanta
// informação da Arte, pois hoje está bem poluída" · "apenas o que eles
// REALMENTE usam").
//
// A régua veio da trilha de 30 dias: a Arte vive de três gestos (subir/enviar
// thumb, enviar arquivo final, reenviar correção). Monta a tela em 1280px e
// 390px e trava o que ficou à vista e o que foi para um clique:
//   · TOPO: título, UMA linha de contexto, "Envio de thumbs em lote" (a ação
//     de lote da mesma rota de envio) e "Mais ações" com Exportar PDF, Subir
//     book e PDF compartilhado; o guia da fase mora no "?";
//   · FAIXAS: a faixa "N eventos" saiu (repetia o seletor de Evento); a faixa
//     do evento mostra só o marco DESTA fase;
//   · LINHA: medida/m²/material viraram texto secundário da coluna Peça; no
//     máximo UM selo colorido de estado; UMA ação principal + "⋯".
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { vi } from "vitest";
import * as React from "react";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;
const DIA = 86_400_000;
const hoje = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

const EVENTOS = [0, 1].map((i) => ({
  id: `e${i}`, name: `Corrida ${i}`, status: "active",
  startDate: iso(hoje + (40 + i) * DIA).slice(0, 10), truckDepartureDate: iso(hoje + (37 + i) * DIA),
  priority: "media",
}));
const SP = [{ id: "s0", name: "Marca A", color: "#3b82f6" }];
const PECAS = Array.from({ length: 4 }, (_, i) => ({
  id: `p${i}`, displayId: `#${100 + i}`, status: "awaiting_submission",
  type: "Backdrop", description: `Peça ${i}`, material: "LONA",
  finish: "Ilhós", quantity: 2, visualWidth: "3", visualHeight: "2", fileWidth: "3.1", fileHeight: "2.1", calculatedM2: "6.51",
  eventId: EVENTOS[i % 2].id, event: { ...EVENTOS[i % 2] },
  sponsors: [{ ...SP[0], approvalStatus: "pending" }],
  // p0 junta TRÊS estados: reprovada, prioritária e com thumb salvo.
  approvalThumbUrl: i === 0 ? "/objects/t0.png" : null, finalFileUrl: null,
  rejectedBySponsor: i === 0, isPriority: i === 0,
  statusChangedAt: iso(hoje - DIA), updatedAt: iso(hoje - DIA), createdAt: iso(hoje - 10 * DIA),
  skipApproval: false,
}));

let largura = 1280;
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
    if (u === "/api/auth/me") return json({ id: "u1", name: "Arte", email: "a@a", role: "arte", mustChangePassword: false });
    if ((u === "/api/items" || u.startsWith("/api/items?")) && method === "GET") {
      return u.includes("since=") ? json({ itens: [], removidas: [], agora: iso(Date.now()) }) : json(PECAS);
    }
    if (u.split("?")[0] === "/api/items/batch-approval-data") return json({ sponsorsByItem: {}, approvalsByItem: {} });
    if (u.split("?")[0] === "/api/events" && method === "GET") return json(EVENTOS);
    if (u === "/api/sponsors" && method === "GET") return json(SP);
    return json([]);
  });
});

beforeEach(() => {
  cleanup();
  try { localStorage.clear(); sessionStorage.clear(); } catch {}
  window.history.replaceState(null, "", "/");
});

const $ = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const tid = (id: string) => $(`[data-testid="${id}"]`);
async function tick(ms = 20) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
async function esperar(cond: () => boolean, max = 400) {
  for (let i = 0; i < max && !cond(); i++) await tick(10);
  expect(cond()).toBe(true);
}
async function clicar(el: HTMLElement | null) {
  expect(el).not.toBeNull();
  await act(async () => {
    fireEvent.pointerDown(el!, { button: 0, pointerType: "mouse" });
    fireEvent.click(el!);
  });
  await tick(20);
}

async function montar(px: number) {
  largura = px;
  window.history.replaceState(null, "", "/arte");
  const { queryClient, resetItensDelta } = await import("@/lib/queryClient");
  const { TooltipProvider } = await import("@/components/ui/tooltip");
  const { AuthProvider } = await import("@/contexts/auth-context");
  const Arte = (await import("@/pages/arte")).default;
  queryClient.clear();
  resetItensDelta();
  render(h(QueryClientProvider, { client: queryClient } as any, h(TooltipProvider, null, h(AuthProvider, null, h(Arte as any, null)))));
  await esperar(() => !!$(px < 768 ? '[data-testid^="card-arte-"]' : '[data-testid^="row-pending-item-"]'));
  await tick(50);
}

describe("Arte 1280px — topo limpo e 'Mais ações'", { timeout: 60_000 }, () => {
  it("à vista: título, UMA linha de contexto, o lote de thumbs e 'Mais ações' — o resto a um clique", async () => {
    await montar(1280);
    expect(tid("contexto-arte")!.textContent).toMatch(/4 peças esperando a Arte/);
    expect(tid("button-open-bulk-thumb")).not.toBeNull();
    for (const id of ["button-export-pdf", "button-upload-book", "button-open-bulk-upload", "guia-da-fase"]) {
      expect(tid(id), id).toBeNull();
    }
    await clicar(tid("button-mais-acoes"));
    expect(tid("button-export-pdf")).not.toBeNull();
    expect(tid("button-upload-book")).not.toBeNull();
    const lote = tid("button-open-bulk-upload") as HTMLButtonElement;
    expect(lote.disabled).toBe(true);
    expect(lote.textContent).toContain("Marque as peças");
    // As cores de 17/09 continuam dentro do menu.
    expect(tid("button-export-pdf")!.style.color).toBe("rgb(29, 78, 216)");
    expect(tid("button-upload-book")!.style.color).toBe("rgb(107, 33, 168)");
  });

  it("o guia da fase mora no '?' ao lado do título", async () => {
    await montar(1280);
    await clicar(tid("button-como-funciona"));
    expect(tid("guia-da-fase")).not.toBeNull();
  });

  it("sem a faixa 'N eventos'; a faixa do evento traz só o marco desta fase", async () => {
    await montar(1280);
    expect(tid("button-toggle-events")).toBeNull();
    expect(document.body.textContent).not.toMatch(/\b2 eventos\b/);
    const marcos = document.querySelectorAll('[data-testid="marco-da-fase"]');
    expect(marcos.length).toBe(2); // um por evento
    expect(marcos[0].getAttribute("title")).toContain("Marco desta fase");
  });

  it("linha: sem colunas de Dimensões/M²/Material; medida e material em texto secundário", async () => {
    await montar(1280);
    const cabecalhos = Array.from(document.querySelectorAll("th")).map((t) => t.textContent);
    for (const c of ["Dimensões", "M²", "Material"]) expect(cabecalhos).not.toContain(c);
    const meta = tid("meta-peca-p1")!;
    expect(meta.textContent).toContain("3 × 2");
    expect(meta.textContent).toContain("6.51 m²");
    expect(meta.textContent).toContain("LONA");
  });

  it("linha: no máximo UM selo colorido — os outros estados viram texto", async () => {
    await montar(1280);
    const reprovada = tid("badge-rejected-sponsor-p0")!;
    const prioritaria = tid("tag-prioritaria-p0")!;
    expect(reprovada.style.border).not.toBe("");
    expect(prioritaria.style.border).toBe("");
    expect(prioritaria.style.backgroundColor).toBe("");
    // UMA ação principal + "⋯" na linha.
    const linha = tid("row-pending-item-p1")!;
    expect(linha.querySelectorAll('[data-testid^="button-action-"]').length).toBe(1);
    expect(linha.querySelectorAll('[data-testid^="button-row-menu-"]').length).toBe(1);
  });
});

describe("Arte 390px — topo e card limpos", { timeout: 60_000 }, () => {
  it("topo com alvos de 44px e 'Mais ações' abrindo as ações de apoio", async () => {
    await montar(390);
    expect(tid("button-mais-acoes")!.style.height).toBe("44px");
    expect(tid("button-open-bulk-thumb")!.style.height).toBe("44px");
    expect(tid("button-export-pdf")).toBeNull();
    await clicar(tid("button-mais-acoes"));
    expect(tid("button-export-pdf")!.style.minHeight).toBe("44px");
  });

  it("card: nome, prazo e linha secundária; patrocinadores só onde a etapa é a aprovação deles", async () => {
    await montar(390);
    const card = tid("card-arte-p1")!;
    expect(card.textContent).toContain("Backdrop");
    expect(tid("meta-peca-p1")!.textContent).toContain("Qtd 2");
    expect(card.textContent).not.toContain("Marca A");
    expect(card.querySelectorAll('[data-testid^="button-action-"]').length).toBe(1);
    expect(tid("button-action-p1")!.style.height).toBe("44px");
  });
});
