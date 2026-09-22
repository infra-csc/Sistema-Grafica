// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// PERF-7 — CADA FILA PEDE SÓ A SUA ETAPA (2ª rodada de performance).
//
// Arte, Atendimento, Vinculação e Histórico baixavam GET /api/items INTEIRO —
// 5.128 peças e 15 MB em produção — para desenhar uma etapa. Agora cada uma
// pede o recorte que mostra (`?status=`), e o Histórico pede a projeção da
// trilha (`?campos=trilha`).
//
// COMO ESTE ARQUIVO PROVA. Ele monta as páginas DE VERDADE contra um servidor
// falso que implementa o recorte como o servidor real, e roda cada tela DUAS
// vezes:
//
//   · ANTES — o servidor falso IGNORA `?status=`/`?campos=` e devolve o
//     acervo, que é exatamente o que a tela recebia antes (o componente é o
//     mesmo, os filtros do cliente são os mesmos: mesma tela, mesmos dados);
//   · DEPOIS — o servidor falso honra o recorte.
//
// Daí saem as duas asserções que interessam:
//   1. CUSTO: a URL pedida, o nº de peças e os BYTES do corpo, com teto;
//   2. NÃO-REGRESSÃO: as contagens das abas (Arte), o placar de Pendentes e a
//      lista do Histórico (Atendimento), as linhas da fila (Vinculação) e as
//      linhas da trilha (Histórico) são IGUAIS nos dois modos.
//
// Os KB medidos vão para o stderr, no mesmo formato dos outros perf-*.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { compactarAprovacoes, CAMPOS_DA_TRILHA, COLUNAS_DA_TRILHA } from "@shared/itens-compactos";

const h = React.createElement;

const DIA = 86_400_000;
const agoraMs = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const dia = (ms: number) => iso(ms).slice(0, 10);

// ── Acervo sintético nas proporções de produção ─────────────────────────────
// 5.128 peças, 3.105 entregues. O tamanho padrão é menor para a suíte não
// custar minutos; as CONTAGENS e a proporção de bytes não dependem dele.
//   PERF7_N=5128 node node_modules/vitest/vitest.mjs run server/__tests__/perf7-filas-recortadas.test.ts
const N_PECAS = Number(process.env.PERF7_N ?? 700);
const N_EVENTOS = 68;

// DOIS TERÇOS DOS EVENTOS JÁ PASSARAM — é a forma do acervo de produção (68
// eventos, quase todas as 3.105 peças entregues penduradas nos antigos), e é
// o que dá sentido ao recorte `?eventId=` da Vinculação. As telas descartam
// peça de evento finalizado pelo MESMO predicado nos dois modos, então isto
// não altera o que se compara — só deixa de mandar pela rede o que seria
// jogado fora na chegada.
const EVENTOS = Array.from({ length: N_EVENTOS }, (_, i) => {
  const passado = i % 3 !== 0;
  const inicio = passado ? agoraMs - (10 + (i % 200)) * DIA : agoraMs + (20 + (i % 60)) * DIA;
  return {
    id: `e${i}`, name: `Evento ${String(i).padStart(2, "0")} Corrida`,
    status: "active", manuallyClosed: false, lifecycle: "active",
    startDate: dia(inicio), truckDepartureDate: iso(inicio - 3 * DIA),
    priority: ["baixa", "media", "alta", "urgente"][i % 4],
    allDelivered: false, eventHasPassed: passado, createdAt: iso(agoraMs - 90 * DIA),
    deadlineListaImagens: -25, deadlineEntregaLayouts: -20, deadlineAprovacaoLayout: -12,
    deadlineFinalizacao: -10, deadlineRevisaoLista: -8, deadlineProducaoGrafica: -1,
    sponsors: [], items: [],
  };
});
const PATROCINADORES = Array.from({ length: 60 }, (_, i) => ({
  id: `s${i}`, name: `Patrocinador ${i}`, color: "#3b82f6",
}));
const TIPOS = ["Backdrop", "Banner", "Placa", "Faixa", "Totem", "Adesivo", "Wind banner", "Pórtico"];
const MATERIAIS = ["LONA", "SANETT", "ACM", "PVC", "TECIDO"];

/**
 * Proporções de produção, com as grafias LEGADAS misturadas de propósito: é
 * exatamente o que faria o recorte errar se ele fosse escrito com status
 * soltos em vez das etapas canônicas de shared/fluxo-peca.
 */
function statusDe(n: number): string {
  const i = Math.floor((n * 5128) / N_PECAS);
  if (i < 2600) return "delivered";
  if (i < 3105) return "entregue";            // legado
  if (i < 3300) return "conferred";
  if (i < 3400) return "produzido";           // legado
  if (i < 3500) return "inProduction";
  if (i < 3650) return "ready_for_production";
  if (i < 3700) return "liberado";            // legado
  if (i < 3780) return "awaiting_final_review";
  if (i < 4205) return "awaiting_submission";
  if (i < 4505) return "awaiting_sponsor_approval";
  if (i < 4650) return "awaiting_creator_review";
  if (i < 4750) return "sponsor_approved";
  // O que NENHUMA das filas desenha — e é daqui que sai o ganho.
  if (i < 4980) return "draft";
  if (i < 5080) return "awaiting_linking";
  return "canceled";
}

const ACERVO = Array.from({ length: N_PECAS }, (_, i) => {
  const ev = EVENTOS[i % N_EVENTOS];
  const sps = [PATROCINADORES[i % 60], PATROCINADORES[(i * 7 + 3) % 60]];
  const status = statusDe(i);
  return {
    id: `p${i}`, displayId: `#${1000 + i}`, status,
    type: TIPOS[i % TIPOS.length], description: `Descrição realista da peça ${i} para o acervo`,
    material: MATERIAIS[i % MATERIAIS.length], finish: "Ilhós", quantity: 1 + (i % 5),
    visualWidth: "3", visualHeight: "2", fileWidth: "300", fileHeight: "200", calculatedM2: "6",
    eventId: ev.id, event: { ...ev },
    sponsors: sps.map((s, k) => ({ ...s, approvalStatus: k === 0 ? "pending" : "approved" })),
    approvalThumbUrl: i % 2 === 0 ? `/objects/uploads/thumb-${i}` : null,
    finalFileUrl: status === "delivered" ? `\\\\srv\\arte\\final-${i}.pdf` : null,
    referenceUrl: null, bookUrl: null, kitRemessaId: null, parentItemId: null,
    skipApproval: false, isReuse: false, isPriority: i % 97 === 0, observations: "",
    rejectedBySponsor: false, quantityProduced: status === "delivered" ? 1 + (i % 5) : 0,
    productionStartedAt: iso(agoraMs - (20 + (i % 10)) * DIA),
    approvedAt: iso(agoraMs - (18 + (i % 10)) * DIA),
    creatorReviewedAt: iso(agoraMs - (17 + (i % 10)) * DIA),
    deliveredAt: status === "delivered" ? iso(agoraMs - (i % 10) * DIA) : null,
    receivedBy: null, conferredAt: null, producedAt: null, tuboId: null, tuboFechadoEm: null,
    statusChangedAt: iso(agoraMs - (i % 20) * DIA),
    // createdAt decrescente: a MESMA ordem do ORDER BY created_at DESC do banco.
    createdAt: iso(agoraMs - 60 * DIA - i * 60_000),
    updatedAt: iso(agoraMs - (i % 20) * DIA),
  };
});

const CORRECAO = ACERVO.filter((p) => p.status === "awaiting_sponsor_approval").slice(0, 30).map((p) => ({
  ...p,
  awaitingArteApprovals: [{ sponsorId: p.sponsors[0].id, sponsor: p.sponsors[0], status: "awaiting_arte", rejectionReason: "Logo desatualizado" }],
  aprovacoes: [{ sponsorId: p.sponsors[0].id, sponsor: p.sponsors[0], status: "awaiting_arte" }],
}));

/** Quem ainda NÃO chegou à aprovação do patrocinador — sem linha aprovada. */
const ANTES_DA_APROVACAO = new Set(["draft", "requested", "awaiting_linking", "awaiting_submission", "canceled"]);

const BATCH = (() => {
  const sponsorsByItem: Record<string, any[]> = {};
  const approvalsByItem: Record<string, any[]> = {};
  for (const p of ACERVO) {
    const sps = p.sponsors.map(({ approvalStatus, ...s }) => s);
    sponsorsByItem[p.id] = sps;
    approvalsByItem[p.id] = sps.map((s, k) => ({
      id: `${p.id}-${s.id}`, itemId: p.id, sponsorId: s.id, sponsor: s,
      status: ANTES_DA_APROVACAO.has(p.status) ? "pending"
        : p.status === "awaiting_sponsor_approval" ? (k === 0 ? "pending" : "approved")
        : "approved",
      approvedAt: iso(agoraMs - (Number(p.id.slice(1)) % 50) * DIA),
    }));
  }
  return { sponsorsByItem, approvalsByItem };
})();

const AUDIT: any[] = [];

// ── O servidor falso ────────────────────────────────────────────────────────
/**
 * `recorta: false` reproduz o servidor de ANTES: ignora `?status=`/`?campos=`.
 *
 * As telas hoje pedem DUAS listas (Arte: filas + finalizados; Atendimento:
 * fila + histórico). Devolver o acervo para as duas daria uma tela com cada
 * peça em dobro, que não é o que existia antes. Então no modo ANTES a PRIMEIRA
 * lista cheia da montagem leva o acervo e as demais voltam vazias — que é
 * exatamente o desenho de uma query só sobre o acervo inteiro.
 */
const modo = { recorta: true, cheiasNaMontagem: 0 };
const pedidas: { url: string; bytes: number; pecas: number }[] = [];

const projetar = (p: any) => {
  const o: Record<string, any> = {};
  for (const c of COLUNAS_DA_TRILHA) o[c] = (p as any)[c] ?? null;
  return o;
};

/** O mesmo recorte de lerRecorte/casaRecorte (server/routes/items.ts). */
function recortar(u: URL): any[] {
  if (!modo.recorta) return ACERVO;
  const sts = u.searchParams.get("status")?.split(",");
  const ids = u.searchParams.get("ids")?.split(",");
  const evs = u.searchParams.get("eventId")?.split(",");
  return ACERVO.filter((p) =>
    (!sts || sts.includes(p.status)) && (!ids || ids.includes(p.id)) && (!evs || evs.includes(p.eventId)));
}

beforeAll(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
  (Element.prototype as any).scrollIntoView = () => {};
  (Element.prototype as any).scrollTo = () => {};

  vi.stubGlobal("fetch", async (url: any, init?: any) => {
    const u = String(url);
    const alvo = new URL(u, "http://local");
    const metodo = (init?.method || "GET").toUpperCase();
    const json = (b: any) => {
      const corpo = JSON.stringify(b);
      if (alvo.pathname === "/api/items") {
        pedidas.push({ url: u, bytes: corpo.length, pecas: Array.isArray(b) ? b.length : 0 });
      }
      return new Response(corpo, { status: 200, headers: { "content-type": "application/json" } });
    };
    if (alvo.pathname === "/api/auth/me") return json({ id: "u1", name: "Admin", email: "a@a", role: "admin", mustChangePassword: false });
    if (alvo.pathname === "/api/items" && metodo === "GET") {
      // `since` sem mudança nenhuma — o delta não é o que este arquivo mede.
      if (alvo.searchParams.has("since")) {
        return json({ delta: true, agora: iso(Date.now()), itens: [], removidas: [], eventos: EVENTOS, patrocinadores: PATROCINADORES });
      }
      if (!modo.recorta) return json(modo.cheiasNaMontagem++ === 0 ? ACERVO : []);
      const lista = recortar(alvo);
      const trilha = alvo.searchParams.get("campos") === CAMPOS_DA_TRILHA;
      return json(trilha ? lista.map(projetar) : lista);
    }
    if (alvo.pathname === "/api/items/resubmission-needed") return json(CORRECAO);
    if (alvo.pathname === "/api/items/batch-approval-data") {
      return json(u.includes("formato=compacto") ? compactarAprovacoes(BATCH as any) : BATCH);
    }
    if (alvo.pathname === "/api/events") return json(EVENTOS);
    if (alvo.pathname === "/api/sponsors") return json(PATROCINADORES);
    if (alvo.pathname === "/api/audit-logs") {
      return json(alvo.searchParams.has("withTotal") ? { logs: AUDIT, total: AUDIT.length, nextCursor: null } : AUDIT);
    }
    return json([]);
  });
});

afterAll(() => { vi.unstubAllGlobals(); });

beforeEach(() => {
  cleanup();
  pedidas.length = 0;
  try { sessionStorage.clear(); localStorage.clear(); } catch { /* modo privado */ }
  window.history.replaceState(null, "", "/");
});

async function tick(ms = 20) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
async function esperar(cond: () => boolean, max = 600) {
  for (let i = 0; i < max && !cond(); i++) await tick(10);
  expect(cond()).toBe(true);
}

async function montar(qual: "arte" | "atendimento" | "vincular" | "historico") {
  const { queryClient, resetItensDelta } = await import("@/lib/queryClient");
  const { TooltipProvider } = await import("@/components/ui/tooltip");
  const { AuthProvider } = await import("@/contexts/auth-context");
  const Pagina = (await (qual === "arte" ? import("@/pages/arte")
    : qual === "atendimento" ? import("@/pages/atendimento")
    : qual === "vincular" ? import("@/pages/vincular-patrocinadores")
    : import("@/pages/historico"))).default;
  queryClient.clear();
  resetItensDelta();
  modo.cheiasNaMontagem = 0;
  render(h(QueryClientProvider, { client: queryClient } as any,
    h(TooltipProvider, null, h(AuthProvider, null, h(Pagina as any, null)))));
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
const deItens = () => pedidas.filter((p) => new URL(p.url, "http://local").pathname === "/api/items");
/** A primeira busca CHEIA da lista (as com `since=` são deltas vazios aqui). */
const cheia = () => deItens().find((p) => !p.url.includes("since="))!;

function relatar(tela: string, antes: { bytes: number; pecas: number }, depois: { bytes: number; pecas: number }, urls: string[]) {
  process.stderr.write(
    `[perf7] ${tela}: /api/items antes ${kb(antes.bytes)} (${antes.pecas} peças) → depois ${kb(depois.bytes)}`
    + ` (${depois.pecas} peças) · −${(100 - (depois.bytes / antes.bytes) * 100).toFixed(0)}%`
    + ` · requisições ${JSON.stringify(urls)}\n`,
  );
}

// ── ARTE ────────────────────────────────────────────────────────────────────
const ABAS_DA_ARTE = ["criar-aprovacoes", "aguardando-patrocinador", "correcao", "finalizar-layouts", "finalizados"];
/** O número da pílula de cada aba (ausente = 0, como a tela desenha). */
function contagensDaArte(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ABAS_DA_ARTE) {
    const el = document.querySelector(`[data-testid="tab-${id}"]`);
    const m = (el?.textContent || "").match(/(\d+)\s*$/);
    out[id] = m ? Number(m[1]) : 0;
  }
  return out;
}

describe("PERF-7 · Arte", () => {
  it("pede só as etapas das suas abas, e as contagens das abas não mudam", async () => {
    modo.recorta = false;
    await montar("arte");
    await esperar(() => document.querySelector('[data-testid="tab-finalizados"]') !== null);
    await tick(300);
    const contagensAntes = contagensDaArte();
    const antes = cheia();

    cleanup();
    pedidas.length = 0;
    try { sessionStorage.clear(); } catch { /* modo privado */ }
    modo.recorta = true;
    await montar("arte");
    await esperar(() => document.querySelector('[data-testid="tab-finalizados"]') !== null);
    await tick(300);
    const contagensDepois = contagensDaArte();
    const depois = cheia();

    // 1. NÃO-REGRESSÃO: as cinco abas contam exatamente o mesmo.
    expect(contagensDepois).toEqual(contagensAntes);
    // Uma tela vazia passaria no igual acima sem provar nada.
    expect(Object.values(contagensAntes).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);

    // 2. CUSTO: DUAS buscas recortadas — as filas de trabalho e os
    //    finalizados —, nenhuma delas o acervo.
    const urls = deItens().map((p) => p.url);
    const todasCheias = deItens().filter((p) => !p.url.includes("since="));
    expect(todasCheias.length).toBe(2);
    expect(todasCheias.every((p) => p.url.includes("status=") && p.url.includes("formato=compacto"))).toBe(true);
    const trabalho = todasCheias.find((p) => p.url.includes("awaiting_submission"))!;
    const finalizados = todasCheias.find((p) => p.url.includes("delivered"))!;
    const somado = { bytes: trabalho.bytes + finalizados.bytes, pecas: trabalho.pecas + finalizados.pecas };
    relatar("Arte (total)", antes, somado, urls);
    process.stderr.write(
      `[perf7] Arte · PRIMEIRA PINTURA (as três filas de trabalho): ${kb(trabalho.bytes)} (${trabalho.pecas} peças)`
      + ` — os Finalizados (${kb(finalizados.bytes)}, ${finalizados.pecas} peças) descem em paralelo\n`,
    );
    // Rascunho, vinculação, fora do funil e tudo de evento já finalizado saem
    // da rede de vez.
    expect(somado.pecas).toBeLessThan(antes.pecas * 0.6);
    expect(somado.bytes).toBeLessThan(antes.bytes * 0.6);
    // E o que a tela de TRABALHO espera para pintar é uma fração do acervo.
    expect(trabalho.bytes).toBeLessThan(antes.bytes * 0.15);
  }, 120_000);
});

// ── ATENDIMENTO ─────────────────────────────────────────────────────────────
describe("PERF-7 · Atendimento", () => {
  // Os grupos por evento abrem fechados: o que a tela AFIRMA sobre o recorte
  // são o contador ("N de M peças") e os quatro números do placar — e é isso
  // que não pode mudar.
  const texto = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.textContent ?? "";
  const placar = () => ["contador-pecas", "placar-nova-versao", "placar-aguardando",
    "placar-arte-refazendo", "placar-atrasados"].map(texto).join(" | ");

  async function medir(recorta: boolean) {
    modo.recorta = recorta;
    pedidas.length = 0;
    await montar("atendimento");
    await esperar(() => /\d/.test(texto("contador-pecas")));
    await tick(300);
    return { placar: placar(), cheia: cheia(), urls: deItens().map((p) => p.url) };
  }

  it("a fila desce sozinha; o histórico só quando a aba é aberta", async () => {
    const antes = await medir(false);
    cleanup();
    const depois = await medir(true);

    // 1. NÃO-REGRESSÃO: mesmo contador, mesmo placar.
    expect(depois.placar).toBe(antes.placar);
    expect(antes.placar).toMatch(/[1-9]/);

    // 2. CUSTO: uma busca só, da etapa de aprovação — e NENHUMA do histórico
    //    enquanto a aba Histórico não é aberta.
    const cheias = depois.urls.filter((u) => !u.includes("since="));
    expect(cheias.length).toBe(1);
    expect(cheias[0]).toContain("status=awaiting_approval");
    relatar("Atendimento (fila)", antes.cheia, depois.cheia, depois.urls);
    // A fila é uma etapa entre catorze: o teto é generoso de propósito, o que
    // se prende é a ordem de grandeza.
    expect(depois.cheia.bytes).toBeLessThan(antes.cheia.bytes * 0.2);
  }, 120_000);

  it("a aba Histórico baixa o recorte pós-aprovação e mostra as mesmas peças", async () => {
    async function historico(recorta: boolean) {
      modo.recorta = recorta;
      pedidas.length = 0;
      await montar("atendimento");
      await esperar(() => /\d/.test(document.querySelector('[data-testid="contador-pecas"]')?.textContent ?? ""));
      await act(async () => {
        (document.getElementById("tab-history") as HTMLButtonElement | null)?.click();
      });
      await esperar(() => /\d+ resultados?/.test(document.body.textContent || ""));
      await tick(400);
      const m = (document.body.textContent || "").match(/(\d+) resultados?/);
      return { resultados: m ? Number(m[1]) : -1, urls: deItens().map((p) => p.url) };
    }
    const antes = await historico(false);
    cleanup();
    const depois = await historico(true);

    expect(antes.resultados).toBeGreaterThan(0);
    expect(depois.resultados).toBe(antes.resultados);
    // Duas listas agora: a fila e o pós-aprovação — e a segunda só apareceu
    // porque a aba foi aberta.
    const cheias = depois.urls.filter((u) => !u.includes("since="));
    expect(cheias.length).toBe(2);
    expect(cheias.some((u) => u.includes("status=awaiting_approval"))).toBe(true);
    expect(cheias.some((u) => u.includes("delivered"))).toBe(true);
  }, 120_000);
});

// ── VINCULAÇÃO ──────────────────────────────────────────────────────────────
describe("PERF-7 · Vinculação", () => {
  it("pede só os status que a fila exibe, com as mesmas linhas", async () => {
    async function medir(recorta: boolean) {
      modo.recorta = recorta;
      pedidas.length = 0;
      await montar("vincular");
      await esperar(() => document.querySelectorAll('[data-testid^="item-row-"]').length > 0);
      await tick(300);
      return {
        ids: new Set(Array.from(document.querySelectorAll('[data-testid^="item-row-"]'))
          .map((el) => el.getAttribute("data-testid")!.replace("item-row-", ""))),
        cheia: cheia(), urls: deItens().map((p) => p.url),
      };
    }
    const antes = await medir(false);
    cleanup();
    const depois = await medir(true);

    expect(antes.ids.size).toBeGreaterThan(0);
    expect(depois.ids).toEqual(antes.ids);
    expect(depois.cheia.url).toContain("status=");
    relatar("Vinculação", antes.cheia, depois.cheia, depois.urls);
    expect(depois.cheia.bytes).toBeLessThan(antes.cheia.bytes * 0.6);
    expect(depois.cheia.url).toContain("eventId=");
  }, 120_000);
});

// ── HISTÓRICO ───────────────────────────────────────────────────────────────
describe("PERF-7 · Histórico", () => {
  it("pede a projeção da trilha e desenha as mesmas linhas", async () => {
    async function medir(recorta: boolean) {
      modo.recorta = recorta;
      pedidas.length = 0;
      window.history.replaceState(null, "", "/historico");
      await montar("historico");
      await esperar(() => document.querySelectorAll('[data-testid^="button-detail-"]').length > 0);
      await tick(300);
      return {
        linhas: Array.from(document.querySelectorAll('[data-testid^="button-detail-"]')).length,
        texto: (document.querySelector('[data-testid="text-resumo-filtros"]')?.textContent || ""),
        cheia: cheia(), urls: deItens().map((p) => p.url),
      };
    }
    const antes = await medir(false);
    cleanup();
    const depois = await medir(true);

    // 1. NÃO-REGRESSÃO: a trilha desenha as mesmas linhas e diz o mesmo total.
    expect(antes.linhas).toBeGreaterThan(0);
    expect(depois.linhas).toBe(antes.linhas);
    expect(depois.texto).toBe(antes.texto);

    // 2. CUSTO: a projeção, e nada além dela.
    expect(depois.cheia.url).toContain(`campos=${CAMPOS_DA_TRILHA}`);
    relatar("Histórico", antes.cheia, depois.cheia, depois.urls);
    // ~14 colunas escalares no lugar de ~40 colunas + evento + patrocinadores.
    expect(depois.cheia.pecas).toBe(antes.cheia.pecas);
    expect(depois.cheia.bytes).toBeLessThan(antes.cheia.bytes * 0.35);
  }, 120_000);
});
