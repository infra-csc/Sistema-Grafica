// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// PERF-6 — BENCHMARK DAS TELAS DE EVENTO/REVISÃO/VINCULAR/SOLICITAÇÕES.
//
// Monta cada página com o volume de produção (5.000 peças no acervo, 68
// eventos, centenas de peças na vinculação, 300 solicitações) e mede três
// coisas:
//
//  1. REQUISIÇÕES POR URL na montagem — a mesma URL pedida duas vezes pela
//     própria tela é desperdício que nenhum cache de servidor salva. (O
//     WebSocket não monta aqui: a invalidação do `onopen` fica fora da conta
//     e é relatada à parte.)
//  2. TEMPO DE RENDER (React.Profiler, `actualDuration`) da montagem e da
//     interação principal de cada tela — digitar na busca, marcar uma peça.
//  3. QUANTAS VEZES os cartões/linhas renderizam numa tecla — é o custo que
//     escala com o tamanho da lista.
//
// As asserções só cobrem o que é DETERMINÍSTICO (contagem de requisições e
// o isolamento dos cartões). Os tempos vão para o console: jsdom em modo dev
// não é o navegador, mas o ANTES × DEPOIS na mesma máquina é comparável.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { appendFileSync } from "fs";

const h = React.createElement;

// ── Dados ───────────────────────────────────────────────────────────────────
const FUTURO = "2099-09-10";
const SAIDA = "2099-09-05T08:00:00.000Z";
const TIPOS = ["Backdrop", "Totem", "Banner", "Faixa", "Placa", "Adesivo", "Wind Banner", "Pórtico"];
const STATUS_ACERVO = ["delivered", "inProduction", "awaiting_art", "awaiting_approval", "produced", "ready_for_production"];

const SPONSORS = Array.from({ length: 147 }, (_, i) => ({
  id: `s${i}`, name: `Patrocinador ${String(i).padStart(3, "0")}`, color: "#3b82f6", company: null,
}));

function evento(i: number, pecas: { status: string }[] = []) {
  return {
    id: `e${i}`, name: `Evento ${String(i).padStart(2, "0")}`, priority: ["alta", "media", "baixa", "urgente", ""][i % 5],
    status: "active", manuallyClosed: false,
    startDate: FUTURO, truckDepartureDate: SAIDA,
    deadlineListaImagens: -25, deadlineEntregaLayouts: -20, deadlineAprovacaoLayout: -12,
    deadlineFinalizacao: -10, deadlineRevisaoLista: -8, deadlineProducaoGrafica: -1,
    lifecycle: "active", allDelivered: false, eventHasPassed: false,
    itemCount: pecas.length, activeItemCount: pecas.length, deliveredCount: 0, canceledCount: 0, openCount: pecas.length,
    sponsors: Array.from({ length: 8 }, (_, k) => ({ sponsorId: `s${(i * 3 + k) % 147}`, quota: "ouro" })),
    items: pecas,
    nextMilestone: { key: "arte", label: "Entrega de layouts", deadline: "2099-08-10", daysRemaining: 20, state: "upcoming", pendingItems: 3, invalidDate: false },
  };
}

// 68 eventos; o acervo tem 5.000 peças espalhadas por eles.
const N_EVENTOS = 68;
const EVENTOS_BASE = Array.from({ length: N_EVENTOS }, (_, i) => evento(i));

function peca(i: number, eventId: string, status: string, ev: any) {
  return {
    id: `i${i}`, displayId: `#${String(i).padStart(4, "0")}`, eventId, event: ev,
    type: TIPOS[i % TIPOS.length], description: `Descrição da peça ${i}`,
    quantity: 1 + (i % 4), visualWidth: "3", visualHeight: "2", material: "Lona", finish: "Ilhós",
    status, skipApproval: false, isReuse: false, observations: "",
    sponsors: [], finalFileUrl: status === "awaiting_final_review" ? "https://ex.com/final.pdf" : null,
    approvalThumbUrl: null, createdAt: "2026-08-01T12:00:00.000Z", updatedAt: "2026-08-01T12:00:00.000Z",
  };
}

// Acervo da Revisão: 5.000 peças, só 2 em awaiting_final_review.
const ACERVO = Array.from({ length: 5000 }, (_, i) => {
  const ev = EVENTOS_BASE[i % N_EVENTOS];
  const status = i === 10 || i === 4000 ? "awaiting_final_review" : STATUS_ACERVO[i % STATUS_ACERVO.length];
  return peca(i, ev.id, status, ev);
});
// Os eventos embutem as peças (slim) como no /api/events real.
const EVENTOS = EVENTOS_BASE.map((ev) => ({
  ...ev,
  items: ACERVO.filter((p) => p.eventId === ev.id).map((p) => ({ id: p.id, eventId: p.eventId, status: p.status, skipApproval: false })),
}));

// Vinculação: 600 peças aguardando vínculo em 6 eventos (100 cada), dentro do
// mesmo acervo de 5.000.
const ACERVO_VINCULAR = ACERVO.map((p, i) => (i < 600
  ? { ...p, eventId: `e${i % 6}`, event: EVENTOS_BASE[i % 6], status: "awaiting_linking" }
  : p));

// Detalhe: um evento com 400 peças.
const PECAS_DO_EVENTO = Array.from({ length: 400 }, (_, i) =>
  peca(i, "e1", STATUS_ACERVO[i % STATUS_ACERVO.length], EVENTOS_BASE[1]));

const PEDIDOS = Array.from({ length: 300 }, (_, i) => ({
  id: `p${i}`, status: "aberto", pedidoPor: "Atendimento", pedidoPorId: "u9",
  createdAt: new Date(Date.UTC(2026, 7, 1 + (i % 28))).toISOString(),
  linhas: [{
    id: `l${i}`, pedidoId: `p${i}`, ordem: 0, eventId: `e${i % N_EVENTOS}`, eventName: `Evento ${i % N_EVENTOS}`,
    eventSaida: SAIDA, sponsorIds: [], tipo: TIPOS[i % TIPOS.length], descricao: "Peça pedida", quantidade: 2,
    status: "aberto", observacao: "", prazo: null, pecas: [],
  }],
}));

// ── Contador de requisições ─────────────────────────────────────────────────
const pedidas = new Map<string, number>();
const json = (b: any) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
let perfil: "admin" | "solicitacao" = "admin";

beforeAll(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class {
    observe() {} unobserve() {} disconnect() {}
  });
  vi.stubGlobal("IntersectionObserver", class {
    observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
  });
  (Element.prototype as any).scrollIntoView = () => {};

  vi.stubGlobal("fetch", async (url: any, init?: any) => {
    const u = String(url);
    const method = (init?.method || "GET").toUpperCase();
    if (method === "GET") pedidas.set(u, (pedidas.get(u) ?? 0) + 1);
    const tela = (globalThis as any).__telaPerf6 as string;
    if (u === "/api/auth/me") return json({ id: "u1", name: "Admin", email: "a@a", role: perfil, mustChangePassword: false });
    if (u === "/api/sponsors") return json(SPONSORS);
    // A lista de eventos é pedida com `?itens=resumo` (perf 17/09): o caminho decide.
    if (u.split("?")[0] === "/api/events") return json(EVENTOS);
    // O cliente pode pedir o acervo com querystring (?formato=compacto, ?since=);
    // o mock responde o array cheio, que o queryClient aceita como full fetch.
    // A Revisão pede o recorte `?status=` (perf 17/09): o mock recorta como o servidor.
    if (u === "/api/items" || u.startsWith("/api/items?")) {
      const lista = tela === "vincular" ? ACERVO_VINCULAR : ACERVO;
      const sts = new URL(u, "http://local").searchParams.get("status")?.split(",");
      return json(sts ? lista.filter((p) => sts.includes(p.status)) : lista);
    }
    if (u === "/api/events/e1") return json({ ...EVENTOS[1], items: undefined });
    if (u === "/api/items/e1") return json(PECAS_DO_EVENTO);
    if (u.startsWith("/api/pedidos-de-peca")) return json(u.includes("eventId=") ? [] : PEDIDOS);
    if (u.startsWith("/api/events/e1/sponsors")) return json(EVENTOS[1].sponsors);
    if (u.includes("estoque-resumo")) return json({});
    return json([]);
  });
});

beforeEach(() => {
  cleanup();
  pedidas.clear();
});

async function tick(ms = 60) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }

type Medida = { commits: number; ms: number };
function novoProfiler() {
  const m: Medida = { commits: 0, ms: 0 };
  const onRender = (_id: string, _fase: string, actual: number) => {
    m.commits++; m.ms += actual;
    // Um laço de render aparece aqui antes de travar o teste.
    if (m.commits % 500 === 0) anotar(`AVISO ${m.commits} commits seguidos`);
  };
  const zerar = () => { m.commits = 0; m.ms = 0; };
  return { m, onRender, zerar };
}

async function montar(Pagina: any, onRender: any) {
  const { queryClient } = await import("@/lib/queryClient");
  const { resetItensDelta } = await import("@/lib/queryClient");
  const { TooltipProvider } = await import("@/components/ui/tooltip");
  const { AuthProvider } = await import("@/contexts/auth-context");
  queryClient.clear();
  resetItensDelta();
  const t0 = performance.now();
  render(
    h(QueryClientProvider, { client: queryClient } as any,
      h(TooltipProvider, null,
        h(AuthProvider, null, h(React.Profiler, { id: "pagina", onRender }, h(Pagina, null))))),
  );
  return t0;
}

async function esperar(seletor: string, max = 1600) {
  for (let i = 0; i < max && !document.querySelector(seletor); i++) await tick(25);
  if (!document.querySelector(seletor)) {
    // Diagnóstico: o que a tela mostrava quando o alvo não apareceu.
    const texto = (document.body.textContent || "").replace(/\s+/g, " ").slice(0, 600);
    anotar(`FALHA esperando ${seletor} · requisições ${JSON.stringify(Object.fromEntries(pedidas))} · tela: ${texto}`);
  }
  expect(document.querySelector(seletor)).toBeTruthy();
}

async function digitar(seletor: string, textos: string[], pausa = 30) {
  const campo = document.querySelector(seletor) as HTMLInputElement;
  expect(campo).toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  for (const t of textos) {
    await act(async () => { setter.call(campo, t); campo.dispatchEvent(new Event("input", { bubbles: true })); });
    await tick(pausa);
  }
}

const repetidas = () => Array.from(pedidas.entries()).filter(([, n]) => n > 1);
// O console do teste não aparece quando a saída do vitest vai para arquivo
// (não-TTY): com PERF6_OUT definido, cada medida também é gravada lá.
function anotar(linha: string) {
  console.log(`[PERF-6] ${linha}`);
  const destino = process.env.PERF6_OUT;
  if (destino) appendFileSync(destino, `[PERF-6] ${linha}\n`);
}

// O benchmark completo leva minutos (5.000 peças, 3.000 linhas no Vincular):
// só roda com PERF6_BENCH=1. O Detalhe do Evento roda SEMPRE — é a guarda do
// laço de render do diálogo de clonar, que girava sem parar com a página aberta.
const itBench = process.env.PERF6_BENCH ? it : it.skip;

describe("PERF-6 — telas de evento", () => {
  itBench("Revisão Final: 5.000 peças no acervo, 2 na fila", async () => {
    (globalThis as any).__telaPerf6 = "revisao";
    perfil = "admin";
    window.history.replaceState(null, "", "/solicitacao");
    const { m, onRender, zerar } = novoProfiler();
    const Solicitacao = (await import("@/pages/solicitacao")).default;
    const t0 = await montar(Solicitacao, onRender);
    await esperar('[data-testid="button-review-i10"]');
    const montagem = performance.now() - t0;
    anotar(`Revisão · montagem ${montagem.toFixed(0)}ms · ${m.commits} commits · render ${m.ms.toFixed(0)}ms · requisições ${JSON.stringify(Object.fromEntries(pedidas))}`);
    expect(repetidas()).toEqual([]);

    zerar();
    const t1 = performance.now();
    await digitar('[data-testid="input-search"]', ["b", "ba", "ban", "back", "backd"], 20);
    anotar(`Revisão · 5 teclas na busca ${(performance.now() - t1).toFixed(0)}ms · ${m.commits} commits · render ${m.ms.toFixed(0)}ms`);
  }, 120000);

  itBench("Eventos: 68 eventos com as peças embutidas", async () => {
    (globalThis as any).__telaPerf6 = "eventos";
    perfil = "admin";
    window.history.replaceState(null, "", "/eventos?situacao=ativos");
    const { m, onRender, zerar } = novoProfiler();
    const Eventos = (await import("@/pages/eventos")).default;
    const t0 = await montar(Eventos, onRender);
    await esperar('[data-testid="card-event-e0"]');
    await tick(100);
    const montagem = performance.now() - t0;
    anotar(`Eventos · montagem ${montagem.toFixed(0)}ms · ${m.commits} commits · render ${m.ms.toFixed(0)}ms · requisições ${JSON.stringify(Object.fromEntries(pedidas))}`);
    expect(repetidas()).toEqual([]);

    // Digitar na busca: cada tecla muda `searchInput`; o filtro só aplica
    // 200ms depois. As teclas intermediárias não mudam a lista.
    zerar();
    const t1 = performance.now();
    await digitar('[data-testid="input-search-events"]', ["E", "Ev", "Eve", "Even", "Event"], 15);
    const teclas = { commits: m.commits, ms: m.ms, wall: performance.now() - t1 };
    await tick(260);
    anotar(`Eventos · 5 teclas na busca (antes do debounce) ${teclas.wall.toFixed(0)}ms · ${teclas.commits} commits · render ${teclas.ms.toFixed(0)}ms · +debounce total render ${m.ms.toFixed(0)}ms`);

    // Digitar o nome no modal de criar: a página inteira re-renderizava a cada tecla.
    zerar();
    await act(async () => { (document.querySelector('[data-testid="button-create-event"]') as HTMLElement)?.click(); });
    await tick(150);
    zerar();
    const t2 = performance.now();
    await digitar('[data-testid="input-event-name"]', ["N", "No", "Nov", "Novo", "Novo "], 15);
    anotar(`Eventos · 5 teclas no nome do modal ${(performance.now() - t2).toFixed(0)}ms · ${m.commits} commits · render ${m.ms.toFixed(0)}ms`);
  }, 120000);

  itBench("Vincular: 600 peças aguardando vínculo em 6 eventos", async () => {
    (globalThis as any).__telaPerf6 = "vincular";
    perfil = "admin";
    try { sessionStorage.clear(); } catch { /* sem storage */ }
    window.history.replaceState(null, "", "/vincular-patrocinadores");
    const { m, onRender, zerar } = novoProfiler();
    // PERF6_VINCULAR aponta para outra cópia da tela (ex.: a versão do HEAD)
    // quando se quer medir o ANTES sem mexer no arquivo de trabalho.
    const Vincular = (process.env.PERF6_VINCULAR
      ? await import(/* @vite-ignore */ process.env.PERF6_VINCULAR)
      : await import("@/pages/vincular-patrocinadores")).default;
    const t0 = await montar(Vincular, onRender);
    await esperar('[data-testid="item-row-i0"]');
    await tick(100);
    const montagem = performance.now() - t0;
    anotar(`Vincular · montagem ${montagem.toFixed(0)}ms · ${m.commits} commits · render ${m.ms.toFixed(0)}ms · linhas ${document.querySelectorAll('[data-testid^="item-row-"]').length} · requisições ${JSON.stringify(Object.fromEntries(pedidas))}`);
    expect(repetidas()).toEqual([]);

    // Marcar um patrocinador numa linha e marcar a caixa de seleção de outra.
    // Peça editável: o chip é o botão `checkbox-sponsor-` (o `chip-sponsor-` é o da enviada).
    const chip = document.querySelector('[data-testid^="checkbox-sponsor-i0-"]') as HTMLElement | null;
    expect(chip).toBeTruthy();
    zerar();
    const t1 = performance.now();
    for (let k = 0; k < 3; k++) {
      await act(async () => { chip?.click(); });
      await tick(10);
    }
    anotar(`Vincular · 3 cliques num chip ${(performance.now() - t1).toFixed(0)}ms · ${m.commits} commits · render ${m.ms.toFixed(0)}ms`);

    zerar();
    const t2 = performance.now();
    for (const id of ["i6", "i12", "i18"]) {
      await act(async () => { (document.querySelector(`[data-testid="checkbox-item-${id}"]`) as HTMLElement)?.click(); });
      await tick(10);
    }
    anotar(`Vincular · 3 seleções de linha ${(performance.now() - t2).toFixed(0)}ms · ${m.commits} commits · render ${m.ms.toFixed(0)}ms`);

    zerar();
    const t3 = performance.now();
    await digitar('[data-testid="input-search-events"]', ["B", "Ba", "Ban", "Bann", "Banne"], 15);
    anotar(`Vincular · 5 teclas na busca ${(performance.now() - t3).toFixed(0)}ms · ${m.commits} commits · render ${m.ms.toFixed(0)}ms`);
  }, 120000);

  it("Detalhe do evento: 400 peças", async () => {
    (globalThis as any).__telaPerf6 = "detalhe";
    perfil = "admin";
    window.history.replaceState(null, "", "/eventos/e1");
    const { m, onRender, zerar } = novoProfiler();
    const Detalhe = (await import("@/pages/event-detail")).default;
    const t0 = await montar(Detalhe, onRender);
    await esperar('[data-testid="input-search-event-items"]');
    await tick(150);
    const montagem = performance.now() - t0;
    anotar(`Detalhe · montagem ${montagem.toFixed(0)}ms · ${m.commits} commits · render ${m.ms.toFixed(0)}ms · requisições ${JSON.stringify(Object.fromEntries(pedidas))}`);
    expect(repetidas()).toEqual([]);
    // Lista global de eventos só com o diálogo de clonar aberto.
    expect(Array.from(pedidas.keys()).filter((u) => u.split("?")[0] === "/api/events")).toEqual([]);
    // Montar leva poucos commits. Com o `= []` instável no diálogo de clonar,
    // passava de 26 mil em dez segundos e o teste nunca terminava.
    const commitsDaMontagem = m.commits;
    await tick(500);
    expect(m.commits - commitsDaMontagem).toBeLessThan(20);

    zerar();
    const t1 = performance.now();
    await digitar('[data-testid="input-search-event-items"]', ["#", "#0", "#00", "#001", "#0010"], 15);
    anotar(`Detalhe · 5 teclas na busca ${(performance.now() - t1).toFixed(0)}ms · ${m.commits} commits · render ${m.ms.toFixed(0)}ms`);
  }, 120000);

  itBench("Solicitação de peças: 300 solicitações", async () => {
    (globalThis as any).__telaPerf6 = "pedidos";
    perfil = "admin";
    window.history.replaceState(null, "", "/pedidos-de-peca");
    const { m, onRender, zerar } = novoProfiler();
    const Pedidos = (await import("@/pages/pedidos-de-peca")).default;
    const t0 = await montar(Pedidos, onRender);
    await esperar('[data-testid="input-busca-pedidos"]');
    await tick(150);
    const montagem = performance.now() - t0;
    anotar(`Pedidos · montagem ${montagem.toFixed(0)}ms · ${m.commits} commits · render ${m.ms.toFixed(0)}ms · requisições ${JSON.stringify(Object.fromEntries(pedidas))}`);
    expect(repetidas()).toEqual([]);

    zerar();
    const t1 = performance.now();
    await digitar('[data-testid="input-busca-pedidos"]', ["E", "Ev", "Eve", "Even", "Event"], 15);
    anotar(`Pedidos · 5 teclas na busca ${(performance.now() - t1).toFixed(0)}ms · ${m.commits} commits · render ${m.ms.toFixed(0)}ms`);
  }, 120000);
});
