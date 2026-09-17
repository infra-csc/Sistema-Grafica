// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// PERFORMANCE DO PAINEL GERAL — medida, não palpite (PERF-4, 17/09).
//
// O Painel é a PRIMEIRA tela de todos os perfis e trabalha sobre o acervo
// inteiro (5.128 peças em produção, metade delas em evento finalizado). Este
// arquivo monta a página de verdade com ~5.000 peças sintéticas em 68 eventos
// e mede o que o usuário sente:
//
//   · quantos elementos o DOM monta na abertura;
//   · quanto custa o primeiro render;
//   · quanto custa aplicar uma busca e um filtro de status;
//   · quantas LINHAS re-renderizam quando nada mudou — revalidação da query
//     (WebSocket / foco / rede de segurança de 5 min) e abrir o menu de
//     exportar. Linha que re-renderiza sem ter mudado é o custo que se repete
//     o dia inteiro: a tela recebe invalidação a cada mutação de QUALQUER
//     usuário.
//
// Os tempos são impressos (console.log) para comparação antes/depois; as
// asserções ficam só nas CONTAGENS, que não oscilam com a máquina.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, vi } from "vitest";
import * as React from "react";
import { render, act } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { appendFileSync } from "fs";

const h = React.createElement;

// Contador de renders da pílula de status: há UMA por linha de peça, então é
// o termômetro de "quantas linhas re-renderizaram".
const cont = vi.hoisted(() => ({ pill: 0 }));
vi.mock("@/components/status-pill", async (original) => {
  const m: any = await original();
  const R = await import("react");
  return {
    ...m,
    StatusPill: (p: any) => { cont.pill++; return R.createElement(m.StatusPill, p); },
  };
});
vi.mock("@/contexts/auth-context", async () => {
  const R = await import("react");
  const user = { id: "u1", name: "Admin", email: "a@a", role: "admin", mustChangePassword: false };
  return {
    AuthProvider: ({ children }: any) => R.createElement(R.Fragment, null, children),
    useAuth: () => ({ user, isLoading: false, login: async () => {}, logout: async () => {} }),
  };
});
// A ficha da peça não é desta medida (ela tem as próprias queries).
vi.mock("@/components/item-details-dialog", async () => ({
  ItemDetailsDialog: () => null,
}));

// ── Dados sintéticos com a forma de /api/items ─────────────────────────────
let seed = 42;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];

const DIA = 86_400_000;
const AGORA = Date.now();
const STATUS = [
  "requested", "draft", "awaiting_linking", "awaiting_submission", "awaiting_submission",
  "awaiting_submission", "awaiting_approval", "awaiting_finalization", "awaiting_final_review",
  "ready_for_production", "approved", "inProduction", "produced", "conferred", "delivered",
  "delivered", "canceled",
] as const;
const TIPOS = ["Banner", "Backdrop", "Faixa", "Adesivo", "Totem", "Placa", "Wind Banner", "Pórtico", "Testeira", "Bandeira", "Painel", "Lona"];
const GRUPOS = ["Comunicação", "Estrutura", "Sinalização"];

const SPONSORS = Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, name: `Patrocinador ${i}`, color: "#3b82f6", company: null }));
const EVENTS = Array.from({ length: 68 }, (_, i) => {
  // 36 de 68 fora de jogo — a mesma proporção de produção (2.734 de 5.128).
  const finalizado = i < 36;
  const inicio = new Date(AGORA + (finalizado ? -(10 + i) : 5 + i) * DIA);
  return {
    id: `e${i}`, name: `Evento ${String(i).padStart(2, "0")}`,
    priority: pick(["urgente", "alta", "media", "baixa"]),
    startDate: inicio.toISOString().slice(0, 10),
    truckDepartureDate: new Date(inicio.getTime() - 3 * DIA).toISOString(),
    status: "active", manuallyClosed: finalizado && i % 2 === 0, reopenedAt: null,
  };
});
const ITEMS = Array.from({ length: 5000 }, (_, i) => {
  const ev = EVENTS[i % 68];
  const status = pick(STATUS);
  const criado = AGORA - (5 + Math.floor(rnd() * 90)) * DIA;
  return {
    id: `i${i}`, displayId: `#${String(i).padStart(4, "0")}`,
    eventId: ev.id, event: ev,
    type: pick(TIPOS), description: `Peça sintética ${i} para medir a tela`,
    status, statusChangedAt: rnd() < 0.1 ? null : new Date(AGORA - Math.floor(rnd() * 30) * DIA).toISOString(),
    createdAt: new Date(criado).toISOString(), updatedAt: new Date(criado).toISOString(),
    deliveredAt: status === "delivered" ? new Date(criado + 20 * DIA).toISOString() : null,
    deletedAt: null,
    fileWidth: "2.00", fileHeight: "1.00", visualWidth: "1.90", visualHeight: "0.90",
    observations: rnd() < 0.2 ? "Ajustar a logo" : null,
    isReuse: rnd() < 0.05, referenceUrl: null, bookUrl: null,
    sponsors: [
      { ...pick(SPONSORS), approvalStatus: pick(["approved", "pending", "rejected", null]) },
    ],
  };
});
const STANDARD = TIPOS.map((t, i) => ({ id: `std${i}`, name: t, group: GRUPOS[i % 3] }));

const commits: number[] = [];
const onRender = (_id: string, _phase: string, actualDuration: number) => { commits.push(actualDuration); };

// O Vitest 4 esconde o console de teste que passa; com PERF_OUT definido os
// números também vão para um arquivo (é assim que se compara antes/depois).
function relatar(r: unknown) {
  const linha = `[perf-painel] ${JSON.stringify(r)}`;
  console.log(linha);
  const destino = process.env.PERF_OUT;
  if (destino) appendFileSync(destino, `${linha}\n`);
}

async function tick(ms = 30) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }

/** Custo de uma interação: commits, soma do render e linhas re-renderizadas. */
async function medir(nome: string, acao: () => void | Promise<void>, espera = 60) {
  commits.length = 0;
  cont.pill = 0;
  const t0 = performance.now();
  await act(async () => { await acao(); });
  await tick(espera);
  const r = {
    nome,
    commits: commits.length,
    renderMs: Math.round(commits.reduce((a, b) => a + b, 0)),
    // Parede inclui a espera fixa; serve só de ordem de grandeza.
    paredeMs: Math.round(performance.now() - t0 - espera),
    linhasRenderizadas: cont.pill,
  };
  relatar(r);
  return r;
}

function digitar(el: HTMLInputElement, valor: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  setter.call(el, valor);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

const observadores = new Set<any>();
const pedidos: string[] = [];

/** Simula o usuário rolando até a sentinela: dispara os observers vivos. */
async function rolarAteOFim() {
  for (let volta = 0; volta < 50 && document.querySelector('[data-testid="painel-sentinela-lote"]'); volta++) {
    await act(async () => {
      for (const o of Array.from(observadores)) o.cb(o.alvos.map((target: Element) => ({ target, isIntersecting: true })), o);
    });
  }
}

beforeAll(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  // IntersectionObserver controlável: jsdom não rola nem calcula interseção,
  // então o teste "rola" chamando os observers vivos à mão.
  vi.stubGlobal("IntersectionObserver", class {
    cb: any; alvos: Element[] = [];
    constructor(cb: any) { this.cb = cb; observadores.add(this); }
    observe(el: Element) { this.alvos.push(el); }
    unobserve() {}
    disconnect() { observadores.delete(this); }
    takeRecords() { return []; }
  });
  (Element.prototype as any).scrollIntoView = () => {};
  const json = (b: any) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
  vi.stubGlobal("fetch", async (url: any) => {
    const u = String(url);
    pedidos.push(u);
    if (u.startsWith("/api/items")) return json(ITEMS);
    // A lista de eventos é pedida com `?itens=resumo` (perf 17/09): o caminho decide.
    if (u.split("?")[0] === "/api/events") return json(EVENTS);
    if (u === "/api/sponsors") return json(SPONSORS);
    if (u === "/api/standard-items") return json(STANDARD);
    return json([]);
  });
});

describe("Painel Geral com 5.000 peças e 68 eventos", () => {
  it("mede abertura, busca, filtro, revalidação e menu", async () => {
    const { queryClient } = await import("@/lib/queryClient");
    const PainelGeral = (await import("@/pages/painel-geral")).default;
    queryClient.clear();
    // Cache semeado como se a rede já tivesse respondido: a medida é da TELA,
    // não do download (que é assunto de outra frente).
    queryClient.setQueryData(["/api/items"], JSON.parse(JSON.stringify(ITEMS)));
    queryClient.setQueryData(["/api/events"], JSON.parse(JSON.stringify(EVENTS)));
    queryClient.setQueryData(["/api/sponsors"], SPONSORS);
    queryClient.setQueryData(["/api/standard-items"], STANDARD);
    window.history.replaceState(null, "", "/");

    commits.length = 0;
    cont.pill = 0;
    const t0 = performance.now();
    await act(async () => {
      render(h(QueryClientProvider, { client: queryClient } as any,
        h(React.Profiler, { id: "painel", onRender } as any, h(PainelGeral as any))));
    });
    const primeiroRenderMs = Math.round(performance.now() - t0);
    await tick(80);
    const abertura = {
      nome: "abertura",
      primeiroRenderMs,
      commits: commits.length,
      renderMs: Math.round(commits.reduce((a, b) => a + b, 0)),
      elementosDom: document.querySelectorAll("*").length,
      linhas: document.querySelectorAll('[data-testid^="item-row-"]').length,
      linhasRenderizadas: cont.pill,
    };
    relatar(abertura);
    expect(abertura.linhas).toBeGreaterThan(0);
    // Renderização incremental: a abertura monta só o primeiro lote.
    expect(abertura.linhas).toBeLessThanOrEqual(40);

    // A régua de contagem da tela não pode mudar com a otimização.
    const contador = () => document.querySelector('[data-testid="painel-contador"]')?.textContent ?? "";
    const contagemInicial = contador();
    expect(contagemInicial).toMatch(/peças encontradas/);

    const busca = document.querySelector('[data-testid="input-search"]') as HTMLInputElement;
    const r1 = await medir("busca 'Banner'", () => digitar(busca, "Banner"), 260);
    expect(contador()).not.toBe(contagemInicial);
    const r2 = await medir("limpar busca", () => digitar(busca, ""), 260);
    expect(contador()).toBe(contagemInicial);

    const card = () => document.querySelector('[data-testid="stat-card-awaiting_submission"]') as HTMLElement;
    const r3 = await medir("filtro de status (card)", () => card().click());
    const r4 = await medir("desfaz filtro de status", () => card().click());
    expect(contador()).toBe(contagemInicial);

    // Revalidação SEM mudança: o servidor devolve o mesmo JSON.
    const r5 = await medir("revalidação sem mudanças", async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    }, 150);

    const exportar = () => document.querySelector('[data-testid="button-export-painel"]') as HTMLElement;
    const r6 = await medir("abrir menu Exportar", () => exportar().click());
    const r7 = await medir("fechar menu Exportar", () => exportar().click());

    const linha = document.querySelector('[data-testid^="item-row-"]') as HTMLElement;
    const r8 = await medir("abrir ficha da peça", () => linha.click());

    const caixa = document.querySelector('[data-testid^="checkbox-i"]') as HTMLElement;
    const r9 = await medir("marcar uma peça", () => caixa.click());

    // Rolar até o fim tem de chegar ao MESMO conjunto de antes da PERF-4: cinco
    // eventos abertos com o teto de 50 linhas cada, "Mostrar todas" nesses
    // cinco e "Mostrar as N peças" nos demais.
    const r10 = await medir("rolar até o fim (todos os lotes)", () => rolarAteOFim());
    const linhasNoFim = document.querySelectorAll('[data-testid^="item-row-"]').length;
    const botoesMostrarTodas = document.querySelectorAll('[data-testid^="button-show-all-"]').length;
    const botoesAbrirGrupo = document.querySelectorAll('[data-testid^="button-open-group-"]').length;
    relatar({ nome: "fim da lista", linhasNoFim, botoesMostrarTodas, botoesAbrirGrupo, elementosDom: document.querySelectorAll("*").length });
    expect(linhasNoFim).toBe(250);
    expect(botoesMostrarTodas).toBe(5);
    expect(botoesAbrirGrupo).toBeGreaterThan(0);
    expect(document.querySelector('[data-testid="painel-sentinela-lote"]')).toBeNull();
    expect(r10.commits).toBeGreaterThan(0);

    // "Mostrar todas" é um pedido explícito: as linhas entram inteiras no mesmo
    // clique, sem esperar sentinela nenhuma.
    const mostrarTodas = document.querySelector('[data-testid^="button-show-all-"]') as HTMLElement;
    const escondidas = Number(/\(\+(\d+)\)/.exec(mostrarTodas.textContent ?? "")?.[1] ?? 0);
    expect(escondidas).toBeGreaterThan(0);
    await act(async () => { mostrarTodas.click(); });
    await tick(30);
    expect(document.querySelectorAll('[data-testid^="item-row-"]').length).toBe(250 + escondidas);
    expect(document.querySelector('[data-testid="painel-sentinela-lote"]')).toBeNull();


    // ── Metas (DEPOIS da PERF-4) ────────────────────────────────────────────
    // Nada mudou nos dados → nenhuma linha re-renderiza.
    expect(r5.linhasRenderizadas).toBe(0);
    // Estado que não é da lista (menu, ficha) não re-renderiza as linhas.
    expect(r6.linhasRenderizadas).toBe(0);
    expect(r7.linhasRenderizadas).toBe(0);
    expect(r8.linhasRenderizadas).toBe(0);
    // Marcar uma peça re-renderiza só a linha dela.
    expect(r9.linhasRenderizadas).toBe(1);
    // Sem ?evento= de evento sem peça, a tela não baixa /api/events: nome e
    // prioridade vêm do evento embutido em cada peça.
    expect(pedidos.filter((u) => u.split("?")[0] === "/api/events")).toEqual([]);
  }, 120_000);
});
