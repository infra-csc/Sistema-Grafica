// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// VINCULAR PATROCINADORES ABRE LEVE — o volume de produção não monta de uma vez.
//
// O defeito (medido em produção, 07/10): "a tela Vincular Patrocinadores
// demorando muito para abrir" — 10–13 s até estabilizar, com os dados já
// chegados em ~1 s. O teto de 50 linhas era POR GRUPO: 30 eventos montavam
// 1.263 linhas de uma vez, cada uma com um chip por patrocinador do evento —
// ~37 mil nós no DOM, quase todos muito abaixo da dobra.
//
// O conserto: os grupos montam a tabela, em ordem, até somar LINHAS_DE_SAIDA
// linhas; os demais mostram o CABEÇALHO (nome, contagem, ações) e reservam a
// altura da tabela, que monta quando a rolagem chega perto (MontaQuandoPerto).
// Nada some: rolando até o fim, toda peça que o teto do grupo mostrava aparece.
//
// E a busca digita no próprio campo: a tecla não espera a tela redesenhar.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ITEM_RENDER_CAP, LINHAS_DE_SAIDA } from "@/components/vinculacao/constantes";

const h = React.createElement;

// ── O volume de produção: 30 eventos, 8 patrocinadores cada, 1.300 peças ──
const N_EVENTOS = 30;
const SPONSORS = Array.from({ length: 12 }, (_, i) => ({
  id: `s${i}`, name: `Marca ${i}`, color: "#3b82f6", company: null,
}));
const evento = (e: number) => ({
  id: `e${e}`, name: `Circuito ${e} 2099`, priority: "alta", status: "active", manuallyClosed: false,
  startDate: "2099-09-10", truckDepartureDate: "2099-09-05T08:00:00.000Z",
  deadlineListaImagens: -25, deadlineEntregaLayouts: -20, deadlineAprovacaoLayout: -12,
  deadlineFinalizacao: -10, deadlineRevisaoLista: -8, deadlineProducaoGrafica: -1,
  lifecycle: "active", allDelivered: false, eventHasPassed: false,
  sponsors: Array.from({ length: 8 }, (_, k) => ({ sponsorId: `s${(e + k) % 12}`, quota: "ouro" })),
  items: [],
  nextMilestone: null,
});
const EVENTOS = Array.from({ length: N_EVENTOS }, (_, e) => evento(e));
const TIPOS = ["Pórtico", "Placa KM", "Banner", "Testeira", "Gradil", "Totem"];
// 1.300 peças: dez eventos de 50, dez de 45 e dez de 35 — quase todos no teto.
const TAMANHOS = EVENTOS.map((_, e) => (e < 10 ? 50 : e < 20 ? 45 : 35));
let seq = 1000;
const ITENS = EVENTOS.flatMap((ev, e) => Array.from({ length: TAMANHOS[e] }, (_, k) => {
  seq++;
  return {
    id: `i${seq}`, displayId: `#${seq}`, eventId: ev.id, event: ev, type: TIPOS[k % TIPOS.length],
    description: `Peça ${seq}`, quantity: 1, visualWidth: "3", visualHeight: "2", material: "Lona", finish: "Ilhós",
    // Um terço já enviado, com patrocinador; o resto pendente.
    status: k % 3 === 0 ? "awaiting_submission" : "awaiting_linking",
    skipApproval: false, isReuse: false, observations: "",
    sponsors: k % 3 === 0 ? [{ id: ev.sponsors[0].sponsorId }] : [],
    approvalThumbUrl: null, createdAt: "2026-08-01T12:00:00.000Z", updatedAt: "2026-08-01T12:00:00.000Z",
  };
}));

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

// IntersectionObserver controlável: jsdom não rola nem calcula interseção, então
// o teste "rola" chamando à mão os observadores vivos.
type Observador = { cb: (e: Array<{ target: Element; isIntersecting: boolean }>) => void; alvos: Element[] };
const observadores = new Set<Observador>();

beforeAll(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class {
    cb: Observador["cb"]; alvos: Element[] = [];
    constructor(cb: Observador["cb"]) { this.cb = cb; observadores.add(this); }
    observe(el: Element) { this.alvos.push(el); }
    unobserve() {}
    disconnect() { observadores.delete(this); }
    takeRecords() { return []; }
  });
  Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal("fetch", async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u === "/api/auth/me") return json({ id: "u1", name: "Admin", email: "a@a", role: "admin", mustChangePassword: false });
    if (u === "/api/sponsors") return json(SPONSORS);
    if (u.split("?")[0] === "/api/events") return json(EVENTOS);
    if (u === "/api/items" || u.startsWith("/api/items?")) return json(ITENS);
    return json([]);
  });
});

async function tick(ms = 60) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
async function esperar(seletor: string, max = 400) {
  for (let i = 0; i < max && !document.querySelector(seletor); i++) await tick(25);
  expect(document.querySelector(seletor), seletor).toBeTruthy();
}
const contar = (sel: string) => document.querySelectorAll(sel).length;
const LINHA = '[data-testid^="item-row-"]';
const RESERVA = '[data-montagem="reservada"]';

/** "Rola" até o fim: avisa todos os observadores vivos até não sobrar reserva. */
async function rolarAteOFim() {
  for (let volta = 0; volta < 60 && document.querySelector(RESERVA); volta++) {
    await act(async () => {
      for (const o of Array.from(observadores)) o.cb(o.alvos.map((target) => ({ target, isIntersecting: true })));
    });
  }
}

async function abrir() {
  cleanup();
  observadores.clear();
  window.history.replaceState(null, "", "/vincular-patrocinadores");
  try { sessionStorage.clear(); localStorage.clear(); } catch { /* sem storage */ }
  const { queryClient } = await import("@/lib/queryClient");
  const { TooltipProvider } = await import("@/components/ui/tooltip");
  const { AuthProvider } = await import("@/contexts/auth-context");
  const Vincular = (await import("@/pages/vincular-patrocinadores")).default;
  queryClient.clear();
  render(h(QueryClientProvider, { client: queryClient } as any,
    h(TooltipProvider, null, h(AuthProvider, null, h(Vincular as any, null)))));
  await esperar(LINHA);
  await tick(120);
}

describe("Vinculação com 1.300 peças em 30 eventos", () => {
  it("a abertura monta só a primeira tela; os 30 cabeçalhos saem todos, com as contagens", async () => {
    expect(ITENS.length).toBe(1300);
    await abrir();

    const linhas = contar(LINHA);
    // O orçamento da abertura: até LINHAS_DE_SAIDA, mais o grupo que cruza a
    // conta (inteiro, até o teto dele). Antes eram as 1.300 de uma vez. O teto
    // é um NÚMERO, e não a soma das constantes: subir a constante para "montar
    // tudo" tem de reprovar aqui, não passar junto.
    expect(linhas).toBeGreaterThan(0);
    expect(linhas).toBeLessThanOrEqual(100);
    expect(LINHAS_DE_SAIDA + ITEM_RENDER_CAP).toBeLessThanOrEqual(100);
    // Os chips acompanham as linhas: um por patrocinador do evento, só nas
    // linhas montadas (eram ~10 mil nesta carga).
    expect(contar('[data-testid^="checkbox-sponsor-"]')).toBeLessThanOrEqual(linhas * 8);

    // NENHUM GRUPO SOME: o cabeçalho de cada evento está na tela, com a contagem
    // de vinculadas do grupo INTEIRO — inclusive dos que ainda não montaram.
    expect(contar('section[data-testid^="grupo-"]')).toBe(N_EVENTOS);
    for (const [e, ev] of EVENTOS.entries()) {
      const secao = document.querySelector(`section[data-testid="grupo-${ev.id}"]`)!;
      expect(secao.querySelector("header")!.textContent).toContain(ev.name);
      expect(secao.querySelector("header")!.textContent).toContain(`/${TAMANHOS[e]} vinculadas`);
    }
    // Os que não montaram reservam a altura da tabela e dizem quantas peças vêm.
    const reservas = Array.from(document.querySelectorAll<HTMLElement>(RESERVA));
    expect(reservas.length).toBeGreaterThanOrEqual(N_EVENTOS - 2);
    for (const r of reservas) {
      expect(parseFloat(r.style.height)).toBeGreaterThan(500);
      expect(r.textContent).toMatch(/Preparando \d+ peças…/);
    }
  }, 60000);

  it("rolando até o fim, toda peça que o teto do grupo mostrava aparece", async () => {
    await abrir();
    await rolarAteOFim();
    expect(contar(RESERVA)).toBe(0);
    const esperado = TAMANHOS.reduce((a, n) => a + Math.min(n, ITEM_RENDER_CAP), 0);
    expect(contar(LINHA)).toBe(esperado);
  }, 120000);

  it("a busca digita no campo na hora e filtra quando a transição chega; 'Limpar' esvazia o campo", async () => {
    await abrir();
    const campo = document.querySelector('[data-testid="input-search-events"]') as HTMLInputElement;
    act(() => { fireEvent.change(campo, { target: { value: "Circuito 7 " } }); });
    // O caractere está no campo antes de qualquer conta da tela.
    expect(campo.value).toBe("Circuito 7 ");
    for (let i = 0; i < 80 && contar('section[data-testid^="grupo-"]') !== 1; i++) await tick(25);
    expect(contar('section[data-testid^="grupo-"]')).toBe(1);
    expect(document.querySelector('section[data-testid="grupo-e7"]')).toBeTruthy();
    // O único grupo do recorte monta de saída — não fica esperando a rolagem.
    expect(contar(RESERVA)).toBe(0);

    // O "x" da busca limpa pelo mesmo caminho; o campo e a lista voltam.
    const limpar = document.querySelector('[aria-label="Limpar a busca"]') as HTMLElement;
    await act(async () => { limpar.click(); });
    expect(campo.value).toBe("");
    for (let i = 0; i < 80 && contar('section[data-testid^="grupo-"]') !== N_EVENTOS; i++) await tick(25);
    expect(contar('section[data-testid^="grupo-"]')).toBe(N_EVENTOS);

    // Limpeza que vem de FORA do campo ("Limpar filtros" do estado vazio):
    // o campo acompanha — não fica mostrando a busca que já não vale.
    act(() => { fireEvent.change(campo, { target: { value: "nada-casa-com-isto" } }); });
    await esperar('[data-testid="button-clear-filters"]');
    await act(async () => { (document.querySelector('[data-testid="button-clear-filters"]') as HTMLElement).click(); });
    for (let i = 0; i < 80 && contar('section[data-testid^="grupo-"]') !== N_EVENTOS; i++) await tick(25);
    expect(campo.value).toBe("");
    expect(contar('section[data-testid^="grupo-"]')).toBe(N_EVENTOS);
  }, 60000);
});
