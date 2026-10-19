// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// AUDITORIA DO BOOK NA TELA DE EVENTOS — montada de verdade.
//   · Solicitação vê o atalho com PEÇAS e EVENTOS ("3 peças em 2 eventos"), a
//     faixa e o selo no cartão — e só conta o que está em aberto;
//   · o painel abre pela faixa, mostra página/peça/confiança e "Já cadastrei"
//     derruba a contagem na hora (antes da resposta do servidor);
//   · o atalho filtra só os eventos com peça fora da lista;
//   · Kit e os demais papéis nem pedem a auditoria.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;

const H = vi.hoisted(() => ({
  usuario: { role: "solicitacao", kit: false } as { role: string; kit: boolean },
  chamadas: [] as Array<{ metodo: string; url: string; corpo?: unknown }>,
  segurarPost: null as null | Promise<void>,
}));

const evento = (id: string, name: string) => ({
  id, name, priority: "alta", startDate: "2099-09-10", truckDepartureDate: "2099-09-05T08:00:00.000Z",
  deadlineListaImagens: -25, deadlineEntregaLayouts: -20, deadlineAprovacaoLayout: -12,
  deadlineFinalizacao: -10, deadlineRevisaoLista: -8, deadlineProducaoGrafica: -1,
  lifecycle: "active", allDelivered: false, eventHasPassed: false, sponsors: [], items: [], nextMilestone: null,
});
const EVENTOS = [evento("e1", "NIGHT RUN VITÓRIA"), evento("e2", "DESAFIO PETROBRAS"), evento("e3", "COPA SEM ACHADO")];

const f = (chave: string, pecaNoBook: string, confianca = "alta", pagina = 13) => ({ chave, pagina, pecaNoBook, detalhe: `Detalhe de ${pecaNoBook}`, confianca, candidata: null, candidataId: null });
const auditoria = (id: string, eventId: string, eventName: string, faltando: unknown[], resolvidos: Record<string, unknown> = {}, canceladas: unknown[] = []) => ({
  id, eventId, eventName, bookUrl: `/objects/uploads/${id}`, bookPublicadoEm: "2026-10-19T14:00:00.000Z", status: "concluida",
  modelo: "claude-opus-5-5", achados: { faltando, canceladas, divergencias: [{ chave: "d0", pagina: 5, ids: ["i9"], displayIds: ["#6524"], noBook: "logo novo", noApp: "logo antigo" }], observacoes: "Nota curta." },
  resolvidos, pecasNoBook: 37, encontradasNoApp: 33, erro: null, criadoEm: "2026-10-19T14:00:00.000Z", concluidoEm: "2026-10-19T14:03:00.000Z",
});
let AUDITORIAS: unknown[] = [];

beforeAll(() => {
  const real = window.getComputedStyle.bind(window);
  vi.stubGlobal("getComputedStyle", (el: Element, pe?: string | null) => {
    const base = real(el, pe ?? undefined);
    return new Proxy(base, {
      get(t, p) {
        if (p === "animationName") return "none";
        const v = Reflect.get(t, p);
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
  });
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(Element.prototype, "scrollIntoView", { value: () => {}, configurable: true });

  vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url).split("?")[0];
    const metodo = (init?.method || "GET").toUpperCase();
    H.chamadas.push({ metodo, url: u, corpo: init?.body ? JSON.parse(String(init.body)) : undefined });
    const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
    if (u === "/api/auth/me") return json({ id: "u1", name: "Maria", email: "m@a", role: H.usuario.role, kit: H.usuario.kit, mustChangePassword: false });
    if (u === "/api/events") return json(EVENTOS);
    if (u === "/api/auditorias-do-book") return json({ auditorias: AUDITORIAS });
    if (metodo === "POST" && u.startsWith("/api/auditorias-do-book/")) {
      if (H.segurarPost) await H.segurarPost;
      return json({ ok: true });
    }
    return json([]);
  });
});

beforeEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/eventos");
  H.usuario = { role: "solicitacao", kit: false };
  H.chamadas.length = 0;
  H.segurarPost = null;
  AUDITORIAS = [
    // e1: 3 achados, 1 já marcado → 2 em aberto
    auditoria("a1", "e1", "NIGHT RUN VITÓRIA", [f("f0", "Placas KM 1 a 4"), f("f1", "Saia do palco", "media", 5), f("f2", "Já resolvida")], { f2: { motivo: "cadastrada", por: "Ana", porId: "u2", em: "2026-10-19T15:00:00.000Z" } }),
    // e2: 1 faltando + 1 cancelada no app = 2 a revisar
    // e2 teve REENVIO depois do 1º book: a auditoria do 1º continua valendo
    { ...auditoria("a2", "e2", "DESAFIO PETROBRAS", [f("f0", "2x1 Sputnik", "baixa", 4)], {},
      [{ chave: "c0", pagina: 6, pecaNoBook: "2x1 Bradesco Seguros", detalhe: "patrocinador trocado", ids: ["i8040"], rotulos: ["#8040 2x1 Bradesco Seguros"] }]),
      bookMaisNovoEm: "2026-10-21T10:00:00.000Z" },
    // e3: nada faltando
    auditoria("a3", "e3", "COPA SEM ACHADO", []),
  ];
});

async function tick(ms = 60) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
const porTestId = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
async function esperar<T>(ler: () => T | null | undefined | false, ms = 12_000): Promise<T | null> {
  const fim = Date.now() + ms;
  for (;;) {
    const v = ler();
    if (v) return v;
    if (Date.now() > fim) return null;
    await tick(50);
  }
}
async function clicar(id: string) {
  const el = await esperar(() => porTestId(id));
  expect(el, `faltou [data-testid="${id}"]`).toBeTruthy();
  await act(async () => { el!.click(); });
  await tick(80);
}

async function montar() {
  const { queryClient } = await import("@/lib/queryClient");
  const { TooltipProvider } = await import("@/components/ui/tooltip");
  const { AuthProvider } = await import("@/contexts/auth-context");
  const { Toaster } = await import("@/components/ui/toaster");
  const Eventos = (await import("@/pages/eventos")).default;
  queryClient.clear();
  render(h(QueryClientProvider, { client: queryClient }, h(TooltipProvider, null, h(AuthProvider, null, h(Eventos), h(Toaster)))));
  await tick(100);
}

describe("Eventos: book com peças fora da lista", () => {
  it("o atalho diz peças E eventos, a faixa lista os eventos e o selo conta só o que está em aberto", async () => {
    await montar();
    const chip = await esperar(() => porTestId("chip-foco-book")?.textContent?.includes("em 2 eventos") && porTestId("chip-foco-book"), 20_000);
    expect(chip?.textContent).toContain("Book com peças fora da lista");
    expect(chip?.textContent).toContain("4 peças em 2 eventos");
    expect(porTestId("faixa-book-titulo")?.textContent).toContain("4 peças dos books para revisar na lista");
    expect(porTestId("faixa-book")?.textContent).toContain("1 cancelada no app");
    expect(porTestId("faixa-book-titulo")?.textContent).toContain("em 2 eventos");
    expect(porTestId("abrir-book-e1")).toBeTruthy();
    expect(porTestId("abrir-book-e3")).toBeNull();
    expect(porTestId("selo-book-e1")?.textContent).toContain("2 fora da lista");
    expect(porTestId("selo-book-e2")?.textContent).toContain("2 fora da lista");
    expect(porTestId("selo-book-e3")).toBeNull();
  }, 90_000);

  it("o atalho filtra só os eventos com peça fora da lista", async () => {
    await montar();
    expect(await esperar(() => porTestId("selo-book-e1"), 20_000)).toBeTruthy();
    expect(await esperar(() => document.body.textContent?.includes("COPA SEM ACHADO"))).toBe(true);
    await clicar("chip-foco-book");
    await esperar(() => !document.body.textContent?.includes("COPA SEM ACHADO"));
    expect(document.body.textContent).not.toContain("COPA SEM ACHADO");
    expect(document.body.textContent).toContain("NIGHT RUN VITÓRIA");
    expect(document.body.textContent).toContain("DESAFIO PETROBRAS");
  }, 90_000);

  it("o painel mostra página, peça e confiança; 'Já cadastrei' derruba a contagem antes da resposta", async () => {
    await montar();
    await clicar("abrir-book-e1");
    const painel = await esperar(() => porTestId("achado-f0"));
    expect(painel?.textContent).toContain("Placas KM 1 a 4");
    expect(painel?.textContent).toContain("Confiança alta");
    const pagina = painel?.querySelector("a[href*='#page=']") as HTMLAnchorElement | null;
    expect(pagina?.getAttribute("href")).toBe("/objects/uploads/a1#page=13");
    expect(pagina?.getAttribute("target")).toBe("_blank");
    expect(porTestId("achado-f2")).toBeNull(); // já marcada: fora da lista em aberto
    expect(porTestId("divergencia-d0")?.textContent).toContain("logo novo");

    let soltar!: () => void;
    H.segurarPost = new Promise<void>((r) => { soltar = r; });
    await clicar("ja-cadastrei-f0");
    // otimista: antes de o servidor responder, a peça sai e o atalho já conta 2
    expect(porTestId("achado-f0")).toBeNull();
    expect(porTestId("chip-foco-book")?.textContent).toContain("3 peças em 2 eventos");
    expect(porTestId("selo-book-e1")?.textContent).toContain("1 fora da lista");
    const post = H.chamadas.find((c) => c.metodo === "POST");
    expect(post).toEqual({ metodo: "POST", url: "/api/auditorias-do-book/a1/resolver", corpo: { chave: "f0", motivo: "cadastrada" } });
    soltar();
    await tick(100);
  }, 90_000);

  it("o aviso do sino abre o painel do evento direto (/eventos?foco=book&book=<id>)", async () => {
    window.history.replaceState(null, "", "/eventos?foco=book&book=e2");
    await montar();
    const achado = await esperar(() => porTestId("achado-f0"), 20_000);
    expect(achado?.textContent).toContain("2x1 Sputnik");
    expect(achado?.textContent).toContain("Confiança baixa");
    // a cancelada vem em seção própria, com a peça do app nomeada
    const cancelada = porTestId("cancelada-c0");
    expect(cancelada?.textContent).toContain("No book, mas cancelada no app — #8040 2x1 Bradesco Seguros");
    expect(cancelada?.querySelector("a[href='/eventos/e2?item=i8040']")).toBeTruthy();
    expect(document.body.textContent).toContain("No book, mas canceladas no app");
    expect(porTestId("cancelada-de-proposito-c0")).toBeTruthy();
    // reenvio: diz que a auditoria é do 1º book, e o PDF aberto é o auditado
    expect(porTestId("painel-book-reenvio")?.textContent).toContain("A auditoria automática lê só o 1º book do evento");
    expect(porTestId("abrir-book-pdf")?.textContent).toContain("Abrir o book auditado");
    expect(porTestId("abrir-book-pdf")?.getAttribute("href")).toBe("/objects/uploads/a2");
  }, 90_000);

  it("Kit e os demais papéis não veem nem pedem a auditoria", async () => {
    for (const u of [{ role: "solicitacao", kit: true }, { role: "arte", kit: false }, { role: "grafica", kit: false }, { role: "atendimento", kit: false }]) {
      cleanup();
      H.usuario = u;
      H.chamadas.length = 0;
      await montar();
      await esperar(() => document.body.textContent?.includes("NIGHT RUN VITÓRIA"));
      await tick(150);
      expect(porTestId("chip-foco-book"), JSON.stringify(u)).toBeNull();
      expect(porTestId("faixa-book")).toBeNull();
      expect(porTestId("selo-book-e1")).toBeNull();
      expect(H.chamadas.some((c) => c.url === "/api/auditorias-do-book"), JSON.stringify(u)).toBe(false);
    }
  }, 180_000);
});
