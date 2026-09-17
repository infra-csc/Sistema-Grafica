// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// PERFORMANCE DO HISTÓRICO E DAS ANÁLISES — medida, não palpite (PERF-4, 17/09).
//
// As duas telas trabalham sobre o acervo INTEIRO (5.128 peças em produção, 68+
// eventos) e, no Histórico, ainda sobre milhares de registros de auditoria
// caminhados em segundo plano. Este arquivo monta as páginas de verdade com
// dados sintéticos no formato das rotas e mede o que se repete o dia inteiro:
//
//   HISTÓRICO
//   · quantas vezes a timeline inteira é reconstruída até a trilha terminar de
//     ser caminhada (cada reconstrução é O(peças + registros));
//   · quantas LINHAS re-renderizam quando nada da lista mudou: revalidação sem
//     mudança, abrir e fechar o painel de detalhe e o tique de 30s
//     do "Atualizado há X";
//   · o custo de digitar uma busca.
//
//   ANÁLISES
//   · quantas vezes os agregados (desempenho × 2, capacidade, ofensores) são
//     recalculados no tique de 1 min, na revalidação sem mudança e ao trocar a
//     dimensão da tabela;
//   · quantas vezes o gráfico (recharts, o pedaço mais caro do render) é
//     redesenhado nessas mesmas situações;
//   · quantos downloads de /api/items a própria tela dispara ao voltar para a
//     aba depois de alguns minutos, com o WebSocket vivo.
//
// Os tempos são impressos (console.log) para comparação antes/depois; as
// asserções ficam só nas CONTAGENS, que não oscilam com a máquina.
//
// Como o recharts foi medido: `ResizeObserver` esboçado (o jsdom não tem) e o
// `BarChart` embrulhado num contador — o ResponsiveContainer não chega a
// desenhar barras com largura 0, mas o componente do gráfico É renderizado, e
// é o render dele (com filhos, eixos e células) que se conta.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup } from "@testing-library/react";
import { QueryClientProvider, focusManager } from "@tanstack/react-query";

const h = React.createElement;

const cont = vi.hoisted(() => ({
  linhas: 0, timeline: 0, desempenho: 0, capacidade: 0, ofensores: 0, grafico: 0,
  fetchItems: 0,
}));

// Cada linha do Histórico desenha a hora com `format(ts, "HH:mm:ss")` na
// TimeCell — uma chamada por linha renderizada, e em nenhum outro lugar.
vi.mock("date-fns", async (original) => {
  const m: any = await original();
  return {
    ...m,
    format: (...a: any[]) => { if (a[1] === "HH:mm:ss") cont.linhas++; return m.format(...a); },
  };
});
vi.mock("@/lib/timeline", async (original) => {
  const m: any = await original();
  return { ...m, buildTimeline: (...a: any[]) => { cont.timeline++; return m.buildTimeline(...a); } };
});
vi.mock("@/lib/analises-desempenho", async (original) => {
  const m: any = await original();
  return {
    ...m,
    computeDesempenho: (...a: any[]) => { cont.desempenho++; return m.computeDesempenho(...a); },
    computeOfensores: (...a: any[]) => { cont.ofensores++; return m.computeOfensores(...a); },
  };
});
vi.mock("@/lib/analises-capacidade", async (original) => {
  const m: any = await original();
  return { ...m, computeCapacidade: (...a: any[]) => { cont.capacidade++; return m.computeCapacidade(...a); } };
});
vi.mock("recharts", async (original) => {
  const m: any = await original();
  const R = await import("react");
  return {
    ...m,
    BarChart: (p: any) => { cont.grafico++; return R.createElement(m.BarChart, p); },
  };
});

// ── Dados sintéticos no formato das rotas ───────────────────────────────────
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];

const DIA = 86_400_000;
const AGORA = Date.now();
const STATUS = [
  "awaiting_linking", "awaiting_submission", "awaiting_approval", "awaiting_final_review",
  "ready_for_production", "approved", "inProduction", "produced", "delivered", "delivered", "canceled",
] as const;
const TIPOS = ["Banner", "Backdrop", "Faixa", "Adesivo", "Totem", "Placa", "Wind Banner", "Pórtico"];
const PESSOAS = ["Ana Souza", "Bruno Lima", "Carla Dias", "Diego Rocha", "Sistema"];

const SPONSORS = Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, name: `Patrocinador ${i}`, color: "#3b82f6", company: null }));
const EVENTS = Array.from({ length: 68 }, (_, i) => {
  // Metade no passado (ciclo encerrado), metade à frente — é o que alimenta
  // os KPIs (passado) e o bloco de carga (futuro).
  const inicio = new Date(AGORA + (i < 34 ? -(3 + i * 2) : (i - 30) * 2) * DIA);
  return {
    id: `e${i}`, name: `Evento ${String(i).padStart(2, "0")}`,
    priority: pick(["urgente", "alta", "media", "baixa"]),
    startDate: inicio.toISOString().slice(0, 10),
    truckDepartureDate: new Date(inicio.getTime() - 3 * DIA).toISOString(),
    // Cadastro sempre no passado — evento "criado daqui a 14 dias" subiria
    // para o topo da lista cronológica do Histórico.
    createdAt: new Date(Math.min(inicio.getTime() - 60 * DIA, AGORA - 4 * DIA)).toISOString(),
    status: "active", manuallyClosed: false, reopenedAt: null,
  };
});
const passado = (ms: number) => new Date(Math.min(ms, AGORA - 3 * DIA)).toISOString();
const ITEMS = Array.from({ length: 5000 }, (_, i) => {
  const ev = EVENTS[i % 68];
  const status = pick(STATUS);
  const criado = AGORA - (5 + Math.floor(rnd() * 90)) * DIA;
  return {
    id: `i${i}`, displayId: `#${String(i).padStart(4, "0")}`,
    eventId: ev.id, event: ev,
    type: pick(TIPOS), description: `Peça sintética ${i}`, quantity: 1 + Math.floor(rnd() * 4),
    status, statusChangedAt: new Date(AGORA - Math.floor(rnd() * 30) * DIA).toISOString(),
    createdAt: new Date(criado).toISOString(), updatedAt: new Date(criado).toISOString(),
    // Carimbos sempre no PASSADO (até 3 dias atrás): data futura subiria para
    // o topo da lista cronológica e não é o que a base real tem.
    creatorReviewedAt: ["approved", "inProduction", "produced", "delivered"].includes(status) ? passado(criado + 5 * DIA) : null,
    producedAt: ["produced", "delivered"].includes(status) ? passado(criado + 10 * DIA) : null,
    deliveredAt: status === "delivered" ? passado(criado + 20 * DIA) : null,
    deletedAt: null, calculatedM2: "2.00",
    fileWidth: "2.00", fileHeight: "1.00",
    sponsors: [{ ...pick(SPONSORS), approvalStatus: pick(["approved", "pending", "rejected", null]) }],
  };
});
// Trilha de auditoria: 4.500 registros em ordem DECRESCENTE (como a rota
// devolve), em 1 primeira página de 500 + 4 páginas caminhadas de 1.000. Os
// 20 mais recentes caem nas últimas horas — são as linhas com "há X minutos".
const ACOES = ["created", "updated", "approved", "production", "delivered", "rejected"] as const;
const LOGS = Array.from({ length: 4500 }, (_, i) => {
  const item = ITEMS[i % ITEMS.length];
  const ts = i < 20 ? AGORA - (i + 1) * 60_000 : AGORA - 2 * DIA - i * 15 * 60_000;
  const acao = pick(ACOES);
  return {
    id: `log${i}`, action: acao, entityType: "item", entityId: item.id,
    details: acao === "rejected" ? `Patrocinador ${item.sponsors[0].name} reprovou a arte` : `Peça ${item.displayId} ${acao}`,
    userName: pick(PESSOAS), createdAt: new Date(ts).toISOString(),
  };
});
const PAGINA0 = { logs: LOGS.slice(0, 500), total: LOGS.length, nextCursor: "c1" };
const paginaDoCursor = (c: string) => {
  const n = Number(c.slice(1));
  const ini = 500 + (n - 1) * 1000;
  const fim = ini + 1000;
  return { logs: LOGS.slice(ini, fim), nextCursor: fim < LOGS.length ? `c${n + 1}` : null };
};

const commits: number[] = [];
const onRender = (_id: string, _phase: string, actualDuration: number) => { commits.push(actualDuration); };

async function tick(ms = 30) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }

function zerar() {
  commits.length = 0;
  for (const k of Object.keys(cont) as (keyof typeof cont)[]) cont[k] = 0;
}

async function medir(tela: string, nome: string, acao: () => void | Promise<void>, espera = 60) {
  zerar();
  const t0 = performance.now();
  await act(async () => { await acao(); });
  await tick(espera);
  const r = {
    nome,
    commits: commits.length,
    renderMs: Math.round(commits.reduce((a, b) => a + b, 0)),
    paredeMs: Math.round(performance.now() - t0 - espera),
    linhasRenderizadas: cont.linhas,
    timeline: cont.timeline,
    desempenho: cont.desempenho,
    capacidade: cont.capacidade,
    ofensores: cont.ofensores,
    grafico: cont.grafico,
    fetchItems: cont.fetchItems,
  };
  console.log(`[perf-${tela}] ${JSON.stringify(r)}`);
  return r;
}

function digitar(el: HTMLInputElement, valor: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  setter.call(el, valor);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

// Os tiques de relógio das telas (30s no Histórico, 1 min nas Análises) são
// capturados em vez de esperados: a medida chama o callback na hora certa.
const intervalos = new Map<number, Array<() => void>>();
const realSetInterval = globalThis.setInterval;

beforeAll(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
  (Element.prototype as any).scrollIntoView = () => {};
  (Element.prototype as any).scrollTo = () => {};
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });

  const capturar = (fn: any, ms?: number, ...rest: any[]) => {
    if (ms === 30_000 || ms === 60_000) {
      const lista = intervalos.get(ms) ?? [];
      lista.push(fn);
      intervalos.set(ms, lista);
    }
    return (realSetInterval as any)(fn, ms, ...rest);
  };
  vi.stubGlobal("setInterval", capturar);
  (window as any).setInterval = capturar;

  const json = (b: any) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
  vi.stubGlobal("fetch", async (url: any) => {
    const u = String(url);
    if (u.startsWith("/api/items")) { cont.fetchItems++; return json(ITEMS); }
    // A lista de eventos é pedida com `?itens=resumo` (perf 17/09): o caminho decide.
    if (u.split("?")[0] === "/api/events") return json(EVENTS);
    if (u === "/api/sponsors") return json(SPONSORS);
    if (u.startsWith("/api/audit-logs")) {
      if (u.includes("withTotal")) return json(PAGINA0);
      const cursor = new URL(u, "http://x").searchParams.get("cursor");
      // Latência de rede por página caminhada: sem ela as quatro respostas
      // chegam no mesmo tique e o React junta tudo num render só — o que
      // esconderia exatamente o custo de "uma reconstrução por página".
      if (cursor) { await new Promise((r) => setTimeout(r, 40)); return json(paginaDoCursor(cursor)); }
      return json({ logs: [], nextCursor: null });
    }
    if (u.startsWith("/api/analises/tempo-por-etapa")) return json(null);
    return json([]);
  });
});

afterAll(() => { cleanup(); });

async function montar(Pagina: any) {
  const { queryClient } = await import("@/lib/queryClient");
  const { TooltipProvider } = await import("@/components/ui/tooltip");
  zerar();
  const t0 = performance.now();
  let r: ReturnType<typeof render>;
  await act(async () => {
    r = render(h(QueryClientProvider, { client: queryClient } as any,
      h(TooltipProvider as any, null,
        h(React.Profiler, { id: "tela", onRender } as any, h(Pagina)))));
  });
  return { r: r!, queryClient, t0 };
}

describe("Histórico com 5.000 peças, 68 eventos e 4.500 registros caminhados", () => {
  it("mede abertura, caminhamento, busca, revalidação, detalhe e tique", async () => {
    const Historico = (await import("@/pages/historico")).default;
    window.history.replaceState(null, "", "/historico");
    intervalos.clear();

    const { queryClient, t0 } = await montar(Historico);
    // Espera a trilha inteira ser caminhada (4 páginas) e a lista assentar.
    for (let i = 0; i < 60; i++) {
      await tick(25);
      if (!document.querySelector('[data-testid="faixa-confianca-historico"]')?.textContent?.includes("Completando")
        && document.querySelector('[data-testid^="timeline-event-"]')
        && queryClient.getQueryData<any>(["historico", "paginas-anteriores"])?.esgotado) break;
    }
    await tick(60);
    const abertura = {
      nome: "abertura + caminhamento completo",
      paredeMs: Math.round(performance.now() - t0),
      commits: commits.length,
      renderMs: Math.round(commits.reduce((a, b) => a + b, 0)),
      reconstrucoesDaTimeline: cont.timeline,
      elementosDom: document.querySelectorAll("*").length,
      linhas: document.querySelectorAll('[data-testid^="timeline-event-"]').length,
      linhasRenderizadas: cont.linhas,
    };
    console.log(`[perf-historico] ${JSON.stringify(abertura)}`);
    expect(abertura.linhas).toBe(25);
    expect(queryClient.getQueryData<any>(["historico", "paginas-anteriores"])?.logs.length).toBe(4000);

    const resumo = () => document.querySelector('[data-testid="text-resumo-filtros"]')?.textContent ?? "";
    const resumoInicial = resumo();

    // Busca digitada tecla a tecla — é assim que chega do teclado.
    const busca = document.querySelector('[data-testid="input-search-filter"]') as HTMLInputElement;
    const r1 = await medir("historico", "digitar 'Banner' (6 teclas)", async () => {
      for (const parcial of ["B", "Ba", "Ban", "Bann", "Banne", "Banner"]) {
        digitar(busca, parcial);
        await new Promise((r) => setTimeout(r, 0));
      }
    }, 400);
    expect(resumo()).not.toBe(resumoInicial);
    const r2 = await medir("historico", "limpar busca", () => digitar(busca, ""), 400);
    expect(resumo()).toBe(resumoInicial);

    const r3 = await medir("historico", "revalidação sem mudanças", async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
    }, 200);

    const r4 = await medir("historico", "abrir detalhe", () => {
      (document.querySelector('[data-testid="button-detail-3"]') as HTMLElement).click();
    });
    expect(document.querySelector('[data-testid="button-abrir-evento"]')).toBeTruthy();
    const r5 = await medir("historico", "fechar detalhe", () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    }, 120);

    // O tique de 30s: só as linhas com hora RELATIVA ("há 5 minutos") mudam
    // de texto; as demais são iguais antes e depois.
    const comHoraRelativa = Array.from(document.querySelectorAll('[data-testid^="timeline-event-"]'))
      .filter((el) => /há ([0-9]|menos de|cerca de|quase|mais de)|em ([0-9]|menos de|cerca de|quase|mais de)/.test(el.textContent ?? "")).length;
    console.log(`[perf-historico] linhas com hora relativa na página: ${comHoraRelativa}`);
    const r6 = await medir("historico", "tique de 30s", () => {
      for (const fn of intervalos.get(30_000) ?? []) fn();
    });
    // A hora relativa das linhas recentes continua andando com o tique.
    expect(r6.commits).toBeGreaterThan(0);

    console.log(`[perf-historico] RESUMO ${JSON.stringify({ abertura, r1, r2, r3, r4, r5, r6 })}`);

    // ── Metas (DEPOIS da PERF-4) ──────────────────────────────────────────
    // A trilha caminhada NÃO reconstrói a timeline uma vez por página.
    expect(abertura.reconstrucoesDaTimeline).toBeLessThanOrEqual(4);
    // Nada mudou nos dados → nenhuma linha re-renderiza, nenhuma reconstrução.
    expect(r3.timeline).toBe(0);
    expect(r3.linhasRenderizadas).toBe(0);
    // Painel de detalhe é estado de fora da lista.
    expect(r4.linhasRenderizadas).toBe(0);
    expect(r5.linhasRenderizadas).toBe(0);
    // No tique só re-renderizam as linhas com hora relativa (as das últimas
    // 24h), não a página inteira.
    expect(comHoraRelativa).toBeLessThan(25);
    expect(r6.linhasRenderizadas).toBeLessThanOrEqual(comHoraRelativa);
    cleanup();
  }, 180_000);
});

describe("Análises com 5.000 peças e 68 eventos", () => {
  it("mede abertura, tique de 1 min, revalidação, dimensão e volta à aba", async () => {
    const DashboardAnalises = (await import("@/pages/dashboard-analises")).default;
    window.history.replaceState(null, "", "/analises");
    intervalos.clear();
    const { queryClient } = await import("@/lib/queryClient");
    queryClient.clear();

    const { t0 } = await montar(DashboardAnalises);
    for (let i = 0; i < 40; i++) {
      await tick(25);
      if (document.querySelector('[data-testid="kpi-prazo"]')) break;
    }
    await tick(80);
    const abertura = {
      nome: "abertura",
      paredeMs: Math.round(performance.now() - t0),
      commits: commits.length,
      renderMs: Math.round(commits.reduce((a, b) => a + b, 0)),
      elementosDom: document.querySelectorAll("*").length,
      desempenho: cont.desempenho, capacidade: cont.capacidade, ofensores: cont.ofensores,
      grafico: cont.grafico,
    };
    console.log(`[perf-analises] ${JSON.stringify(abertura)}`);
    const kpi = () => document.querySelector('[data-testid="kpi-prazo"]')?.textContent ?? "";
    const kpiInicial = kpi();
    expect(kpiInicial).toMatch(/%|—/);

    const r1 = await medir("analises", "tique de 1 min", () => {
      for (const fn of intervalos.get(60_000) ?? []) fn();
    });
    expect(kpi()).toBe(kpiInicial);

    const r2 = await medir("analises", "revalidação sem mudanças", async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    }, 200);
    expect(kpi()).toBe(kpiInicial);

    const r3 = await medir("analises", "trocar dimensão da tabela", () => {
      (document.querySelector('[data-testid="dim-tipo"]') as HTMLElement).click();
    });
    const r4 = await medir("analises", "trocar a ordem da tabela", () => {
      (document.querySelector('[data-testid="ordem-volume"]') as HTMLElement).click();
    });

    // Volta à aba 3 minutos depois, com o WebSocket vivo (nenhuma mudança).
    const nowReal = Date.now;
    const r5 = await medir("analises", "voltar à aba após 3 min", async () => {
      vi.spyOn(Date, "now").mockImplementation(() => nowReal() + 3 * 60_000);
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    }, 250);
    vi.mocked(Date.now).mockRestore();
    focusManager.setFocused(undefined as any);

    console.log(`[perf-analises] RESUMO ${JSON.stringify({ abertura, r1, r2, r3, r4, r5 })}`);

    // ── Metas (DEPOIS da PERF-4) ──────────────────────────────────────────
    // O tique de 1 min só troca o "Atualizado há X": no mesmo dia, nenhum
    // agregado é recalculado e o gráfico não é redesenhado.
    expect(r1.desempenho).toBe(0);
    expect(r1.capacidade).toBe(0);
    expect(r1.ofensores).toBe(0);
    expect(r1.grafico).toBe(0);
    // Revalidação sem mudança: nada recalculado, nada redesenhado.
    expect(r2.capacidade).toBe(0);
    expect(r2.grafico).toBe(0);
    // A tabela de ofensores não arrasta o gráfico junto.
    expect(r3.grafico).toBe(0);
    expect(r4.grafico).toBe(0);
    expect(r3.desempenho).toBe(0);
    expect(r4.ofensores).toBe(0);
    // Voltar à aba com o dado de 3 min REVALIDA o acervo: o staleTime voltou
    // a 60s (revisão adversarial 17/09 — os 5 min não foram decididos). A
    // revalidação é por delta (KBs), e é uma só.
    expect(r5.fetchItems).toBe(1);
    cleanup();
  }, 180_000);
});
