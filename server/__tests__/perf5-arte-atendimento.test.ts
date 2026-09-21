// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// PERF-5 — ARTE E ATENDIMENTO COM O ACERVO DE PRODUÇÃO (≈5.000 peças).
//
// PORQUÊ ESTE ARQUIVO EXISTE. As duas telas mostram só as peças de algumas
// fases, mas recebem /api/items inteiro (5.128 peças em produção, 3.105 já
// entregues). O custo não estava no download sozinho: estava no que cada
// render fazia com ele. Este arquivo monta as DUAS páginas de verdade, com
// dados sintéticos no tamanho real, e mede o que o operador sente:
//
//   · tempo do primeiro render e nº de elementos no DOM;
//   · tempo para trocar de fase e para digitar na busca;
//   · quantas vezes as LINHAS da lista renderizam enquanto se digita o motivo
//     num modal — tecla em modal não pode repintar a fila inteira;
//   · (Atendimento) quantas vezes /api/items/batch-approval-data (5,8 MB em
//     produção) é baixado de novo depois de aprovar uma peça nesta tela.
//
// Os TEMPOS vão para o console (dependem da máquina e do jsdom — não viram
// asserção). As CONTAGENS viram asserção: são elas que regridem em silêncio.
//
// TAMANHO. Na suíte comum o acervo tem 640 peças (mesmas proporções de
// produção): as contagens não dependem do tamanho e a suíte não fica minutos
// mais lenta. Para medir no tamanho real:
//   PERF5_N=5128 node node_modules/vitest/vitest.mjs run server/__tests__/perf5-arte-atendimento.test.ts
// e, para comparar com a versão anterior das telas, PERF5_ORIGINAL=<pasta, a
// partir da raiz do repo, com arte.tsx e atendimento.tsx antigos> (tirados com
// git show <commit>:client/src/pages/…). A versão antiga do Atendimento trava
// o jsdom no laço de render do carregamento (ver SEM_DADOS na tela): para
// medi-la, troque ali `data: items = []` e `data: events = []` por um vazio fixo.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { compactarAprovacoes } from "@shared/itens-compactos";

const h = React.createElement;

// ── Espiões de render das LINHAS ────────────────────────────────────────────
// Arte: PrazoInline mora só na célula de prazo da linha (renderPrazo).
// Atendimento: SponsorChips mora só no card da peça da fila.
// Os dois delegam para o componente real — a tela desenha igual.
const contadores = vi.hoisted(() => ({ prazo: 0, chips: 0 }));
vi.mock("@/components/prazo-inline", async (original) => {
  const real = await original<any>();
  const R = await import("react");
  return { ...real, PrazoInline: (p: any) => { contadores.prazo++; return R.createElement(real.PrazoInline, p); } };
});
vi.mock("@/components/sponsor-chips", async (original) => {
  const real = await original<any>();
  const R = await import("react");
  return { ...real, SponsorChips: (p: any) => { contadores.chips++; return R.createElement(real.SponsorChips, p); } };
});

// ── Acervo sintético no tamanho de produção ─────────────────────────────────
const DIA = 86_400_000;
const hoje = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const dataISO = (ms: number) => iso(ms).slice(0, 10);

const N_PECAS = Number(process.env.PERF5_N ?? 640);
const N_EVENTOS = 120;
const EVENTOS = Array.from({ length: N_EVENTOS }, (_, i) => {
  // 90 eventos por vir, 30 já realizados (saem das filas, mas são processados).
  const inicio = i < 90 ? hoje + (5 + (i % 90)) * DIA : hoje - (10 + i) * DIA;
  return {
    id: `e${i}`, name: `Evento ${i} Corrida`, status: "active",
    startDate: dataISO(inicio), truckDepartureDate: iso(inicio - 3 * DIA),
    priority: ["baixa", "media", "alta", "urgente"][i % 4],
  };
});
const PATROCINADORES = Array.from({ length: 60 }, (_, i) => ({
  id: `s${i}`, name: `Patrocinador ${i}`, color: "#3b82f6",
}));
const TIPOS = ["Backdrop", "Banner", "Placa", "Faixa", "Totem", "Adesivo", "Wind banner", "Pórtico", "Testeira", "Bandeira"];
const MATERIAIS = ["LONA", "SANETT", "ACM", "PVC", "TECIDO", "ADESIVO"];

// Proporções de produção: 3.105 entregues em 5.128, e assim por diante.
function statusDe(i: number): string {
  i = Math.floor((i * 5128) / N_PECAS);
  if (i < 3105) return "delivered";
  if (i < 3705) return "awaiting_submission";
  if (i < 4205) return "awaiting_sponsor_approval";
  if (i < 4405) return "awaiting_creator_review";
  if (i < 4605) return "sponsor_approved";
  return "draft";
}

const PECAS = Array.from({ length: N_PECAS }, (_, i) => {
  const ev = EVENTOS[i % N_EVENTOS];
  const sps = [PATROCINADORES[i % 60], PATROCINADORES[(i * 7 + 3) % 60]];
  const status = statusDe(i);
  return {
    id: `p${i}`, displayId: `#${1000 + i}`, status,
    type: TIPOS[i % TIPOS.length], description: `Descrição da peça ${i}`,
    material: MATERIAIS[i % MATERIAIS.length], finish: "Ilhós", quantity: 1 + (i % 5),
    visualWidth: "3", visualHeight: "2", fileWidth: "300", fileHeight: "200", calculatedM2: "6",
    eventId: ev.id, event: { ...ev },
    sponsors: sps.map((s, k) => ({ ...s, approvalStatus: k === 0 ? "pending" : "approved" })),
    approvalThumbUrl: i % 2 === 0 ? `/objects/thumb-${i}.png` : null,
    finalFileUrl: status === "delivered" ? `\\\\srv\\arte\\final-${i}.pdf` : null,
    statusChangedAt: iso(hoje - (i % 20) * DIA),
    updatedAt: iso(hoje - (i % 20) * DIA), createdAt: iso(hoje - 40 * DIA),
    skipApproval: false, isPriority: i % 97 === 0,
  };
});
const CORRECAO = PECAS.filter((p) => p.status === "awaiting_sponsor_approval").slice(0, 60).map((p) => ({
  ...p,
  awaitingArteApprovals: [{ sponsorId: p.sponsors[0].id, sponsor: p.sponsors[0], status: "awaiting_arte", rejectionReason: "Logo desatualizado" }],
  aprovacoes: [{ sponsorId: p.sponsors[0].id, sponsor: p.sponsors[0], status: "awaiting_arte" }],
}));
const BATCH = (() => {
  const sponsorsByItem: Record<string, any[]> = {};
  const approvalsByItem: Record<string, any[]> = {};
  for (const p of PECAS) {
    const sps = p.sponsors.map(({ approvalStatus, ...s }) => s);
    sponsorsByItem[p.id] = sps;
    approvalsByItem[p.id] = sps.map((s, k) => ({
      id: `${p.id}-${s.id}`, itemId: p.id, sponsorId: s.id, sponsor: s,
      status: p.status === "awaiting_sponsor_approval" ? (k === 0 ? "pending" : "approved") : "approved",
      approvedAt: iso(hoje - ((Number(p.id.slice(1)) % 50) * DIA)),
    }));
  }
  return { sponsorsByItem, approvalsByItem };
})();

// ── Rede ────────────────────────────────────────────────────────────────────
const rede = { batch: 0, batchUrls: [] as string[], batchBytes: 0 };
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
    const method = (init?.method || "GET").toUpperCase();
    const json = (b: any) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
    if (u === "/api/auth/me") return json({ id: "u1", name: "Admin", email: "a@a", role: "admin", mustChangePassword: false });
    // /api/items com ou sem query (formato compacto, delta): o array cheio é
    // aceito pelo cliente em qualquer caso; o delta vem vazio.
    if ((u === "/api/items" || u.startsWith("/api/items?")) && method === "GET") {
      return u.includes("since=") ? json({ itens: [], removidas: [], agora: iso(Date.now()) }) : json(PECAS);
    }
    if (u === "/api/items/resubmission-needed") return json(CORRECAO);
    // A tela pede o lote COMPACTO (perf, 17/09): o mock responde como o
    // servidor — compacto com `?formato=compacto`, o formato antigo sem.
    if (u.split("?")[0] === "/api/items/batch-approval-data") {
      rede.batch++;
      rede.batchUrls.push(u);
      const corpo = u.includes("formato=compacto") ? compactarAprovacoes(BATCH as any) : BATCH;
      rede.batchBytes = JSON.stringify(corpo).length;
      return json(corpo);
    }
    // A lista de eventos é pedida com `?itens=resumo` (perf 17/09): o caminho decide.
    if (u.split("?")[0] === "/api/events" && method === "GET") return json(EVENTOS);
    if (u === "/api/sponsors" && method === "GET") return json(PATROCINADORES);
    const aprov = u.match(/^\/api\/items\/([^/]+)\/sponsor-approvals$/);
    if (aprov) return json(BATCH.approvalsByItem[aprov[1]]);
    // Aprovação individual da ÚLTIMA marca pendente: o servidor devolve o
    // registro, `allApproved` e a peça já em sponsor_approved.
    const umaMarca = u.match(/^\/api\/items\/([^/]+)\/sponsor-approvals\/([^/]+)\/approve$/);
    if (umaMarca && method === "POST") {
      const p = PECAS.find((x) => x.id === umaMarca[1])!;
      const a = BATCH.approvalsByItem[p.id].find((x) => x.sponsorId === umaMarca[2])!;
      return json({
        approval: { ...a, status: "approved", approvedAt: iso(Date.now()) },
        allApproved: true,
        item: { ...p, status: "sponsor_approved", updatedAt: iso(Date.now()) },
      });
    }
    return json([]);
  });
});

beforeEach(() => {
  cleanup();
  contadores.prazo = 0;
  contadores.chips = 0;
  rede.batch = 0;
  rede.batchUrls = [];
  try { sessionStorage.clear(); } catch {}
  window.history.replaceState(null, "", "/");
});

async function tick(ms = 20) {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}
async function esperar(cond: () => boolean, max = 600) {
  for (let i = 0; i < max && !cond(); i++) { if (i % 50 === 0) passo(`esperando ${i}`); await tick(10); }
  if (!cond()) passo(`esperar falhou; tela: ${(document.body.textContent || "").slice(0, 400)}`);
  expect(cond()).toBe(true);
}
const $ = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const elementos = () => document.body.querySelectorAll("*").length;

async function digitar(el: HTMLElement, textos: string[]) {
  const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  for (const t of textos) {
    await act(async () => {
      setter.call(el, t);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await tick(0);
  }
}
const prefixos = (s: string) => Array.from({ length: s.length }, (_, i) => s.slice(0, i + 1));
const ms = (t0: number) => Math.round(performance.now() - t0);
// Marcos de progresso para rodadas longas (PERF5_VERBOSE=1).
const passo = (s: string) => { if (process.env.PERF5_VERBOSE) process.stderr.write(`[PERF-5] ${new Date().toISOString().slice(11, 19)} ${s}
`); };

async function montar(pagina: "arte" | "atendimento") {
  const { queryClient, resetItensDelta } = await import("@/lib/queryClient");
  const { TooltipProvider } = await import("@/components/ui/tooltip");
  const { AuthProvider } = await import("@/contexts/auth-context");
  const original = process.env.PERF5_ORIGINAL;
  const Pagina = (original
    ? await import(/* @vite-ignore */ `../../${original.replace(/\\/g, "/")}/${pagina}.tsx`)
    : await import(pagina === "arte" ? "@/pages/arte" : "@/pages/atendimento")).default;
  queryClient.clear();
  resetItensDelta();
  const t0 = performance.now();
  render(h(QueryClientProvider, { client: queryClient } as any, h(TooltipProvider, null, h(AuthProvider, null, h(Pagina as any, null)))));
  return t0;
}

describe(`PERF-5 · Arte com ${N_PECAS} peças`, () => {
  it("primeiro render, troca de fase, busca e digitação do motivo", async () => {
    const t0 = await montar("arte");
    await esperar(() => document.querySelectorAll('[data-testid^="row-pending-item-"]').length > 0);
    const primeiro = ms(t0);
    const domInicial = elementos();

    passo("etapa 1");
    let t = performance.now();
    await act(async () => { $('[data-testid="tab-finalizados"]')!.click(); });
    await tick(0);
    const trocaFase = ms(t);
    const domFinalizados = elementos();

    await act(async () => { $('[data-testid="tab-criar-aprovacoes"]')!.click(); });
    await tick(0);

    t = performance.now();
    await digitar($('[data-testid="input-search-filter"]')!, prefixos("evento 1"));
    const busca = ms(t);
    await digitar($('[data-testid="input-search-filter"]')!, [""]);
    await tick(0);

    // Motivo do "Devolver ao solicitante" — o modal vive no topo da página.
    passo("etapa 2");
    const primeiraLinha = document.querySelector('[data-testid^="row-pending-item-"]')!;
    const id = primeiraLinha.getAttribute("data-testid")!.replace("row-pending-item-", "");
    await act(async () => { $(`[data-testid="button-row-menu-${id}"]`)!.click(); });
    await tick(20);
    await act(async () => { $(`[data-testid="button-devolver-${id}"]`)!.click(); });
    await esperar(() => !!$('[data-testid="textarea-devolver-motivo"]'));
    passo("etapa 3");
    contadores.prazo = 0;
    t = performance.now();
    await digitar($('[data-testid="textarea-devolver-motivo"]')!, prefixos("arte errada no logo"));
    const motivo = ms(t);
    const rendersDeLinhaNoMotivo = contadores.prazo;

    // stderr: o vitest cala o console de teste que passa, e o número é o ponto.
    process.stderr.write(`[PERF-5][Arte] primeiro render ${primeiro}ms · DOM ${domInicial} el. · troca p/ Finalizados ${trocaFase}ms (DOM ${domFinalizados}) · busca 8 teclas ${busca}ms · motivo 19 teclas ${motivo}ms · renders de linha no motivo ${rendersDeLinhaNoMotivo}
`);
    // Digitar no modal não pode repintar as linhas da fila.
    expect(rendersDeLinhaNoMotivo).toBe(0);
  }, 1_800_000);
});

describe(`PERF-5 · Atendimento com ${N_PECAS} peças`, () => {
  it("primeiro render, busca, motivo da reprovação e aprovação sem re-baixar o lote", async () => {
    const t0 = await montar("atendimento");
    passo("montou atendimento");
    await esperar(() => document.querySelectorAll('[data-testid^="toggle-event-"]').length > 0 && !document.body.textContent!.includes("carregando patrocinadores"));
    const primeiro = ms(t0);
    const domInicial = elementos();
    // O lote foi pedido compacto (e a tela chegou até aqui com os patrocinadores
    // decodificados: sem eles não haveria botão de reprovar mais abaixo).
    expect(rede.batchUrls[0]).toBe("/api/items/batch-approval-data?formato=compacto");
    process.stderr.write(`[PERF-5][Atendimento] lote de aprovações: ${(JSON.stringify(BATCH).length / 1024).toFixed(0)} KB no formato antigo → ${(rede.batchBytes / 1024).toFixed(0)} KB compacto
`);

    passo("etapa 4");
    let t = performance.now();
    await digitar($('[data-testid="input-search"]')!, prefixos("backdrop"));
    const busca = ms(t);
    await digitar($('[data-testid="input-search"]')!, [""]);
    await tick(0);

    passo("etapa 5");
    const grupo = document.querySelector('[data-testid^="toggle-event-"]') as HTMLElement;
    await act(async () => { grupo.click(); });
    await tick(0);
    const card = document.querySelector('[data-testid^="button-view-"]') as HTMLElement;
    await act(async () => { card.click(); });
    await esperar(() => !!document.querySelector('[aria-label^="Reprovar para "]'));
    await act(async () => { (document.querySelector('[aria-label^="Reprovar para "]') as HTMLElement).click(); });
    await esperar(() => !!document.querySelector('[data-testid^="textarea-reject-reason-"]'));
    passo("etapa 6");
    contadores.chips = 0;
    t = performance.now();
    await digitar(document.querySelector('[data-testid^="textarea-reject-reason-"]') as HTMLElement, prefixos("logo desatualizado"));
    const motivo = ms(t);
    const rendersDeCardNoMotivo = contadores.chips;

    // Cancela a reprovação e aprova a última marca pendente: a resposta traz
    // o registro e a peça, os dois são remendados no lugar — o lote de 5,8 MB
    // não precisa voltar.
    await act(async () => {
      Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "Cancelar")?.click();
    });
    await tick(0);
    passo("etapa 7");
    rede.batch = 0;
    await act(async () => { (document.querySelector('[data-testid^="button-approve-sponsor-"]') as HTMLElement).click(); });
    await esperar(() => !!$('[data-testid="button-confirm-approve-individual"]'));
    await act(async () => { $('[data-testid="button-confirm-approve-individual"]')!.click(); });
    await tick(300);
    const lotesDepoisDeAprovar = rede.batch;

    // stderr: o vitest cala o console de teste que passa, e o número é o ponto.
    process.stderr.write(`[PERF-5][Atendimento] primeiro render ${primeiro}ms · DOM ${domInicial} el. · busca 8 teclas ${busca}ms · motivo 18 teclas ${motivo}ms · renders de card no motivo ${rendersDeCardNoMotivo} · batch-approval-data re-baixado ${lotesDepoisDeAprovar}×
`);
    expect(rendersDeCardNoMotivo).toBe(0);
    expect(lotesDepoisDeAprovar).toBe(0);
  }, 1_800_000);
});
