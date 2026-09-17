// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// PERF-4 — BENCHMARK DA GESTÃO DE PRAZOS
//
// Medido em produção: /api/prazos com 460 KB e 1.883 elementos no DOM. A tela
// não tem botão "Atualizar" (regra do dono) e se mantém fresca sozinha: o
// WebSocket invalida '/api/prazos' a cada mutação (debounce de 500ms), a query
// revalida no foco e a cada 5 min, e o selo "Atualizado há X" re-renderiza a
// página a cada minuto. Ou seja: o caso QUENTE desta tela não é a primeira
// carga — é a revalidação que devolve o mesmo dado, dezenas de vezes por hora,
// com o diretor lendo.
//
// Este arquivo monta a página inteira com um payload sintético do tamanho do
// de produção (~68 eventos, ~5.000 peças) e mede:
//   • elementos no DOM por visão;
//   • commits do React e tempo (actualDuration) por cenário — SÓ LOGADOS;
//   • quantas vezes um card/linha foi desenhado (contador em `saidaChip` e
//     `fmtDiaCurto`, chamados uma vez por render de card/linha);
//   • leituras de layout forçadas (`offsetTop`) pelas colunas do quadro.
//
// As asserções ficam só em CONTAGENS estáveis (renders de card, leituras de
// layout), nunca em tempo — tempo varia com a máquina do CI.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, vi } from "vitest";
import * as React from "react";
import { render, act, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;

const cont = vi.hoisted(() => ({ chip: 0, diaCurto: 0, offsetTop: 0, ws: new Set<() => void>() }));

// Contadores de render por card/linha. `saidaChip` é chamado uma vez por render
// de QuadroCard, de linha da TabelaPrazos e de CardMobilePrazos; `fmtDiaCurto`
// uma vez por render de linha/cartão da lista de peças atrasadas.
vi.mock("@/components/prazos/tokens", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/components/prazos/tokens")>();
  return {
    ...orig,
    saidaChip: (ev: any) => { cont.chip++; return orig.saidaChip(ev); },
    fmtDiaCurto: (iso: string) => { cont.diaCurto++; return orig.fmtDiaCurto(iso); },
  };
});

// O sinal do WebSocket ("chegou mudança") vira um gatilho do teste: é o
// caminho real de uma mutação feita por outro usuário.
vi.mock("@/hooks/use-websocket", () => ({
  onPrazosInvalidated: (fn: () => void) => { cont.ws.add(fn); return () => { cont.ws.delete(fn); }; },
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", name: "Diretor", role: "admin" }, isLoading: false }),
}));

// ─── Payload sintético (formato de @shared/prazos-contract) ─────────────────
const STAGES = [
  ["listaImagens", "Lista de Imagens", -25],
  ["layouts", "Entrega de Layouts", -20],
  ["aprovacao", "Aprovação de Layout", -12],
  ["finalizacao", "Finalização", -10],
  ["revisao", "Revisão de Lista", -8],
  ["producao", "Produção Gráfica", -1],
] as const;
const TODAY = "2026-09-17";
const STATUS_POR_ETAPA = ["draft", "layout_pending", "pending_approval", "finalizing", "review", "printing"];
const PRIORIDADES = ["urgente", "alta", "media", "baixa", null];

function rng(seed: number) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}
function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function gerarPayload() {
  const r = rng(42);
  const events: any[] = [];
  let totalPecas = 0;
  for (let e = 0; e < 68; e++) {
    const semPecas = e % 23 === 22;
    const diasParaSaida = Math.floor(r() * 40) - 5;
    const saida = addDays(TODAY, diasParaSaida);
    // Perfil de produção: ~74 peças por evento, parte já entregue, e as
    // pendentes concentradas no gargalo do evento (e um resto na etapa
    // seguinte) — não espalhadas pelas seis etapas.
    const nPend = semPecas ? 0 : 15 + Math.floor(r() * 30);
    const total = semPecas ? 0 : nPend + 20 + Math.floor(r() * 30);
    const gargalo = Math.floor(r() * 5);
    const pendingItems = Array.from({ length: nPend }, (_, i) => {
      const stageIndex = r() < 0.8 ? gargalo : gargalo + 1;
      const sponsors = stageIndex === 2
        ? Array.from({ length: 1 + Math.floor(r() * 4) }, (_, k) => ({
            name: `Patrocinador ${k + Math.floor(r() * 30)}`, days: Math.floor(r() * 15),
            holder: r() < 0.2 ? "arte" : "sponsor",
          }))
        : undefined;
      return {
        id: `it-${e}-${i}`, displayId: `#${1000 + e * 100 + i}`, status: STATUS_POR_ETAPA[stageIndex],
        stageIndex, marcoIndex: stageIndex, type: "Banner", description: `Banner 3x1 — fachada ${i}`,
        quantity: 1 + (i % 4), waitingDays: r() < 0.1 ? null : Math.floor(r() * 20), sponsors,
      };
    });
    totalPecas += total;
    const direct = [0, 0, 0, 0, 0, 0];
    for (const it of pendingItems) direct[it.stageIndex]++;
    let acumulado = 0;
    const stages = STAGES.map(([key, label, off], i) => {
      acumulado += direct[i];
      const deadline = addDays(saida, off);
      const diffDays = diasParaSaida + off;
      const state = acumulado === 0 ? "done"
        : diffDays < 0 ? "overdue" : diffDays <= 3 ? "warning" : "upcoming";
      return { key, label, deadline, diffDays, pendingCount: acumulado, directCount: direct[i], state };
    });
    const vencidas = stages.filter((s) => s.state === "overdue");
    const piorAtrasoDias = vencidas.length ? Math.max(...vencidas.map((s) => Math.abs(s.diffDays))) : 0;
    events.push({
      id: `ev-${e}`, eventId: `ev-${e}`, kit: null,
      name: `Copa Regional ${String(e).padStart(2, "0")} — Etapa ${1 + (e % 4)}`,
      priority: PRIORIDADES[e % PRIORIDADES.length],
      startDate: `${addDays(saida, 3)}T12:00:00.000Z`, truckDepartureDate: `${saida}T08:00:00.000Z`,
      invalidDate: false, totalItems: total, deliveredItems: total - nPend,
      stages, pendingItems, riskCritical: e % 9 === 0,
      categoria: semPecas ? "semPecas" : vencidas.length ? "atrasado" : "emDia",
      diasParaSaida, piorAtrasoDias,
      pecasEmAtraso: vencidas.length ? vencidas[vencidas.length - 1].pendingCount : 0,
      piorEsperaDias: pendingItems.reduce((m, it) => Math.max(m, it.waitingDays ?? 0), 0),
      solicitante: "Fulano",
    });
  }
  const cobrancas: Record<string, any> = {};
  for (let e = 0; e < 68; e += 5) {
    cobrancas[`event:ev-${e}`] = {
      userName: "Diretor", createdAt: "2026-09-12T12:00:00.000Z", daysAgo: 5, total: 2,
      historico: [{ userName: "Diretor", createdAt: "2026-09-12T12:00:00.000Z", daysAgo: 5 }],
      promessaData: "2026-09-15", promessaDiasRestantes: -2, nota: "Arte reenvia", houveMovimento: false,
    };
  }
  const atrasados = events.filter((e) => e.categoria === "atrasado").length;
  const semPecasN = events.filter((e) => e.categoria === "semPecas").length;
  return {
    payload: {
      generatedAt: new Date().toISOString(), today: TODAY,
      stageMeta: STAGES.map(([key, label]) => ({ key, label })),
      events,
      sponsorDelays: Array.from({ length: 12 }, (_, i) => ({
        sponsorId: `sp-${i}`, name: `Patrocinador ${i}`, pendingCount: 30 - i, maxDays: 20 - i, eventCount: 3,
        items: Array.from({ length: 20 }, (_, k) => ({ itemId: `x${i}-${k}`, eventId: "ev-1", eventName: "Copa", displayId: `#${k}`, days: k })),
        executivoConta: "Ana",
      })),
      kpis: {
        atrasados, saidas7d: events.filter((e) => e.diasParaSaida >= 0 && e.diasParaSaida <= 7).length,
        pecasAtrasadas: events.reduce((a, e) => a + e.pecasEmAtraso, 0),
        emDia: events.length - atrasados - semPecasN, invalidCount: 0, semPecas: semPecasN,
      },
      trend: { atrasados: 1, saidas7d: 0, pecasAtrasadas: -4, emDia: 2 },
      cobrancas,
      desdeOntem: { baseDay: "2026-09-16", entraramEmAtraso: [{ id: "ev-1", name: "Copa 1" }], sairamDoAtraso: [], pecasDestravadas: 12 },
    },
    totalPecas,
  };
}

const { payload, totalPecas } = gerarPayload();
const JSON_PAYLOAD = JSON.stringify(payload);

beforeAll(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class {
    observe() {} unobserve() {} disconnect() {}
  });
  (Element.prototype as any).scrollIntoView = () => {};
  (window as any).scrollTo = () => {};
  // Cada leitura de `offsetTop` é, no navegador, um layout síncrono forçado
  // quando há mudança pendente no DOM — é o custo que a coluna do quadro paga.
  Object.defineProperty(HTMLElement.prototype, "offsetTop", {
    configurable: true,
    get() { cont.offsetTop++; return 0; },
  });
  vi.stubGlobal("fetch", async (url: any) => {
    const u = String(url);
    // Mesmo JSON a cada chamada: a revalidação "sem mudança" que o WebSocket
    // e o polling produzem o dia inteiro.
    if (u === "/api/prazos") return new Response(JSON_PAYLOAD, { status: 200, headers: { "content-type": "application/json" } });
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  });
});

async function tick(ms = 30) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }

const prof = { commits: 0, ms: 0 };
function zerar() { prof.commits = 0; prof.ms = 0; cont.chip = 0; cont.diaCurto = 0; cont.offsetTop = 0; }
function foto() {
  return {
    commits: prof.commits, ms: Math.round(prof.ms * 10) / 10,
    cards: cont.chip, linhasPeca: cont.diaCurto, offsetTop: cont.offsetTop,
  };
}
const domCount = () => document.querySelectorAll("*").length;

const resultados: Record<string, any> = {};

describe("PERF-4 — Gestão de Prazos com volume de produção", () => {
  it("mede montagem, revalidação, busca, modal e troca de visão", async () => {
    localStorage.clear();
    window.history.replaceState(null, "", "/gestao-prazos");
    const { queryClient } = await import("@/lib/queryClient");
    const { TooltipProvider } = await import("@/components/ui/tooltip");
    const GestaoPrazos = (await import("@/pages/gestao-prazos")).default;
    queryClient.clear();

    const onRender: React.ProfilerOnRenderCallback = (_id, _phase, actualDuration) => {
      prof.commits++; prof.ms += actualDuration;
    };

    zerar();
    const t0 = performance.now();
    render(
      h(QueryClientProvider, { client: queryClient } as any,
        h(TooltipProvider, null,
          h(React.Profiler, { id: "gp", onRender }, h(GestaoPrazos as any, null)))),
    );
    await tick(150);
    expect(document.querySelector('[data-testid^="card-quadro-"]')).toBeTruthy();
    const cardsNoDom = document.querySelectorAll('[data-testid^="card-quadro-"]').length;
    resultados.montagemQuadro = { ...foto(), wallMs: Math.round(performance.now() - t0), dom: domCount(), cardsNoDom };

    // ── Revalidação sem mudança (polling/foco): mesmo JSON ──────────────────
    zerar();
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ["/api/prazos"] }); });
    await tick(60);
    resultados.revalidarQuadro = foto();

    // ── Mensagem do WebSocket: pílula "N mudanças" + revalidação ───────────
    zerar();
    await act(async () => {
      cont.ws.forEach((fn) => fn());
      await queryClient.invalidateQueries({ queryKey: ["/api/prazos"] });
    });
    await tick(60);
    resultados.wsQuadro = foto();

    // ── Abrir/fechar o guia "Como ler" (estado do topo da página) ──────────
    zerar();
    await act(async () => { fireEvent.click(document.querySelector('[data-testid="toggle-como-ler-prazos"]')!); });
    await tick(20);
    resultados.toggleGuia = foto();

    // ── Busca: 4 teclas ─────────────────────────────────────────────────────
    const busca = document.querySelector('[data-testid="input-busca-prazos"]') as HTMLInputElement;
    zerar();
    const tb = performance.now();
    for (const t of ["c", "co", "cop", "copa"]) {
      await act(async () => { fireEvent.change(busca, { target: { value: t } }); });
    }
    await tick(20);
    resultados.buscaQuadro4Teclas = { ...foto(), wallMs: Math.round(performance.now() - tb) };
    await act(async () => { fireEvent.change(busca, { target: { value: "" } }); });
    await tick(20);

    // ── Abrir e fechar o modal do evento ───────────────────────────────────
    zerar();
    await act(async () => { fireEvent.click(document.querySelector('[data-testid="card-quadro-ev-1"]')!); });
    await tick(40);
    const domModal = domCount();
    const abriu = !!document.querySelector('[role="dialog"]');
    await act(async () => { fireEvent.click(document.querySelector('[role="dialog"] button[aria-label="Fechar"]')!); });
    await tick(80);
    resultados.modalAbrirFechar = { ...foto(), abriu, domComModal: domModal };

    // ── Tabela ──────────────────────────────────────────────────────────────
    zerar();
    await act(async () => { fireEvent.click(document.querySelector('[data-testid="visao-tabela"]')!); });
    await tick(40);
    resultados.trocarParaTabela = { ...foto(), dom: domCount() };
    zerar();
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ["/api/prazos"] }); });
    await tick(60);
    resultados.revalidarTabela = foto();

    // ── Peças atrasadas ─────────────────────────────────────────────────────
    zerar();
    await act(async () => { fireEvent.click(document.querySelector('[data-testid="visao-atrasadas"]')!); });
    await tick(40);
    resultados.trocarParaAtrasadas = { ...foto(), dom: domCount() };
    zerar();
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ["/api/prazos"] }); });
    await tick(60);
    resultados.revalidarAtrasadas = foto();
    zerar();
    const tp = performance.now();
    for (const t of ["b", "ba", "ban", "bann"]) {
      await act(async () => { fireEvent.change(busca, { target: { value: t } }); });
    }
    await tick(20);
    resultados.buscaAtrasadas4Teclas = { ...foto(), wallMs: Math.round(performance.now() - tp) };

    const linhas = [
      `[PERF-4] payload: ${(JSON_PAYLOAD.length / 1024).toFixed(0)} KB · ${payload.events.length} eventos · ${totalPecas} peças · ${payload.events.reduce((a: number, e: any) => a + e.pendingItems.length, 0)} pendentes`,
      ...Object.entries(resultados).map(([k, v]) => `[PERF-4] ${k}: ${JSON.stringify(v)}`),
    ];
    // `process.stdout` além do `console.log`: o reporter padrão do vitest
    // engole o console de teste que passa, e estes números são a razão de ser
    // do arquivo.
    console.log(linhas.join("\n"));
    process.stdout.write(`\n${linhas.join("\n")}\n`);

    // ── Asserções: só CONTAGENS (tempo não é estável entre máquinas) ────────
    // Números de ANTES do PERF-4, com este mesmo payload: montagem 2× cada
    // card; revalidar/WS/guia 134 cards e 134 leituras de offsetTop; 4 teclas
    // de busca 536; abrir+fechar o modal 268; revalidar a tabela 69 linhas; a
    // lista de peças 100 linhas por revalidação e 600 em 4 teclas.
    //
    // O contador `cards` também soma o `saidaChip` do cabeçalho do modal (a
    // página guarda o último evento aberto para a animação de saída), então
    // "zero card redesenhado" aparece como ≤ 1 por commit da página nos
    // cenários depois do modal.
    expect(resultados.montagemQuadro.cards, "montagem desenha cada card uma vez").toBe(cardsNoDom);
    expect(resultados.revalidarQuadro.cards, "revalidação sem mudança não redesenha cards").toBe(0);
    expect(resultados.revalidarQuadro.offsetTop, "revalidação sem mudança não re-mede colunas").toBe(0);
    expect(resultados.wsQuadro.cards, "mensagem do WebSocket sem mudança não redesenha cards").toBe(0);
    expect(resultados.wsQuadro.offsetTop).toBe(0);
    expect(resultados.toggleGuia.cards, "abrir o guia não redesenha cards").toBe(0);
    expect(resultados.buscaQuadro4Teclas.cards, "busca que não muda a lista não redesenha cards").toBe(0);
    expect(resultados.buscaQuadro4Teclas.offsetTop).toBe(0);
    expect(resultados.modalAbrirFechar.abriu).toBe(true);
    expect(resultados.modalAbrirFechar.cards, "abrir/fechar o modal não redesenha o quadro").toBeLessThan(10);
    expect(resultados.modalAbrirFechar.offsetTop).toBe(0);
    expect(resultados.revalidarTabela.cards, "revalidação sem mudança não redesenha linhas da tabela")
      .toBeLessThanOrEqual(resultados.revalidarTabela.commits);
    expect(resultados.revalidarAtrasadas.linhasPeca, "revalidação sem mudança não redesenha peças").toBe(0);
    expect(resultados.buscaAtrasadas4Teclas.linhasPeca, "busca que não muda a página visível não redesenha peças").toBe(0);
  }, 60_000);
});
