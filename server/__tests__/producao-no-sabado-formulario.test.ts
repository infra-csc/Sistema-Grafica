// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// O FLUXO DO DONO (19/10): "se eu quiser colocar no sábado, eu poder — aqui
// ele bloqueia e joga na sexta".
//
// Editar Evento → Prazos → Produção Gráfica → escolher um SÁBADO no seletor →
// Salvar. O formulário tem de MOSTRAR o sábado (sem aviso), mandar o offset do
// sábado no PATCH, e o servidor (card do evento e Gestão de Prazos) tem de
// calcular o MESMO sábado. Escolher DOMINGO mostra o sábado com o aviso
// "Cairia no domingo — antecipado para sábado (dd/mm/aaaa)". Os demais marcos
// continuam: sábado vai para a sexta, com o aviso de sempre.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, vi } from "vitest";
import * as React from "react";
import { render, act } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/banco_nunca_acessado";

const h = React.createElement;

// Seletor de data falso: dois botões, um sábado e um domingo.
vi.mock("@/components/ui/calendar", async () => {
  const R = await import("react");
  return {
    Calendar: (props: any) => R.createElement("div", { "data-testid": "calendario-falso" },
      [["sab", new Date(2026, 9, 31)], ["dom", new Date(2026, 10, 1)]].map(([k, d]: any) =>
        R.createElement("button", { key: k, type: "button", "data-dia": k, onClick: () => props.onSelect?.(d) }, k))),
  };
});

// Saída TERÇA 03/11/2026: Produção (−1) na segunda 02/11 — dia útil, sem aviso.
const EVENTO = {
  id: "e1", name: "Evento Sábado", priority: "alta",
  startDate: "2026-11-07T00:00:00.000Z", truckDepartureDate: "2026-11-03T08:00:00.000Z",
  deadlineListaImagens: -25, deadlineEntregaLayouts: -20, deadlineAprovacaoLayout: -12,
  deadlineFinalizacao: -10, deadlineRevisaoLista: -8, deadlineProducaoGrafica: -1,
  lifecycle: "active", allDelivered: false, eventHasPassed: false,
  sponsors: [], items: [], nextMilestone: null,
};

const patches: any[] = [];

beforeAll(() => {
  const real = window.getComputedStyle.bind(window);
  vi.stubGlobal("getComputedStyle", (el: Element, pe?: string | null) => {
    const base = real(el as any, pe as any);
    return new Proxy(base, {
      get(t, p) {
        if (p === "animationName") {
          const st = (el as HTMLElement).getAttribute?.("data-state");
          if (st === "open") return "radix-enter";
          if (st === "closed") return "radix-exit";
          return "none";
        }
        const v = (t as any)[p];
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
  });
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class {
    cb: any;
    constructor(cb: any) { this.cb = cb; }
    observe(el: any) { setTimeout(() => this.cb([{ target: el, borderBoxSize: [{ inlineSize: 16, blockSize: 16 }] }], this), 0); }
    unobserve() {} disconnect() {}
  });
  (Element.prototype as any).scrollIntoView = () => {};

  vi.stubGlobal("fetch", async (url: any, init?: any) => {
    const u = String(url);
    const method = (init?.method || "GET").toUpperCase();
    const json = (b: any) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
    if (u === "/api/auth/me") return json({ id: "u1", name: "Admin", email: "a@a", role: "admin", mustChangePassword: false });
    if (u === "/api/sponsors") return json([]);
    if (u.split("?")[0] === "/api/events" && method === "GET") return json([EVENTO]);
    if (u === "/api/events/e1" && method === "PATCH") { patches.push(JSON.parse(init.body)); return json({ ...EVENTO, ...JSON.parse(init.body) }); }
    if (u.startsWith("/api/events/")) return json([]);
    return json([]);
  });
});

async function tick(ms = 60) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
async function clicar(sel: string, ms = 120) {
  await act(async () => { q(sel)?.click(); });
  await tick(ms);
}
async function escolherNoSeletor(campo: string, dia: "sab" | "dom") {
  await clicar(`[data-testid="input-${campo}"]`, 150);
  // O popover anterior pode estar ainda SAINDO (congelado na animação): o
  // clique vai no seletor que está ABERTO agora.
  const aberto = Array.from(document.querySelectorAll('[data-testid="calendario-falso"]'))
    .find((el) => el.closest("[data-state]")?.getAttribute("data-state") === "open") as HTMLElement | undefined;
  expect(aberto, `seletor de ${campo} abriu`).toBeTruthy();
  await act(async () => { (aberto!.querySelector(`[data-dia="${dia}"]`) as HTMLElement).click(); });
  await tick(200);
}
const textoDoCampo = (campo: string) => q(`[data-testid="input-${campo}"]`)?.textContent ?? "";
const aviso = (campo: string) => q(`[data-testid="ajuste-${campo}"]`)?.textContent ?? null;

describe("Editar Evento: Produção Gráfica no sábado", () => {
  it("escolher sábado → fica sábado → salvar → o servidor calcula o sábado", async () => {
    const { queryClient } = await import("@/lib/queryClient");
    const { TooltipProvider } = await import("@/components/ui/tooltip");
    const { AuthProvider } = await import("@/contexts/auth-context");
    const { Toaster } = await import("@/components/ui/toaster");
    const Eventos = (await import("@/pages/eventos")).default;

    queryClient.clear();
    render(
      h(QueryClientProvider, { client: queryClient } as any,
        h(TooltipProvider, null,
          h(AuthProvider, null, h(Eventos as any, null), h(Toaster as any, null)))),
    );
    await tick(250);

    await clicar('[data-testid="button-edit-event-e1"]', 300);
    expect(q('[role="dialog"]')).toBeTruthy();
    if (!q('[data-testid="input-deadlineProducaoGrafica"]')) await clicar('[data-testid="button-toggle-prazos"]', 150);
    expect(textoDoCampo("deadlineProducaoGrafica")).toContain("02/11");

    // DOMINGO na Produção: aparece o SÁBADO, com o aviso novo.
    await escolherNoSeletor("deadlineProducaoGrafica", "dom");
    expect(textoDoCampo("deadlineProducaoGrafica")).toContain("31/10");
    expect(aviso("deadlineProducaoGrafica")).toBe("Cairia no domingo — antecipado para sábado (31/10/2026)");

    // SÁBADO na Produção: fica no SÁBADO, sem aviso (antes ia para a sexta).
    await escolherNoSeletor("deadlineProducaoGrafica", "sab");
    expect(textoDoCampo("deadlineProducaoGrafica")).toContain("31/10");
    expect(aviso("deadlineProducaoGrafica")).toBeNull();

    // Os demais marcos não mudaram: sábado na Revisão de Lista vai para a sexta.
    await escolherNoSeletor("deadlineRevisaoLista", "sab");
    expect(textoDoCampo("deadlineRevisaoLista")).toContain("30/10");
    expect(aviso("deadlineRevisaoLista")).toBe("Cairia no sábado — antecipado para sexta (30/10/2026)");

    // Salvar.
    await act(async () => { q('[data-testid="button-submit-event"]')?.click(); });
    await tick(400);
    expect(patches.length).toBe(1);
    const body = patches[0];
    expect(body.deadlineProducaoGrafica).toBe(-3); // 03/11 − 3 = sábado 31/10
    expect(body.deadlineRevisaoLista).toBe(-3);

    // O servidor, com o que foi gravado: card do evento e Gestão de Prazos.
    const { insertEventSchema } = await import("@shared/schema");
    const gravado = { ...EVENTO, ...insertEventSchema.partial().parse(body) };
    const { enrichEvent } = await import("../routes/events");
    const { buildEventPrazo } = await import("../services/prazo-domain");
    const hoje = Date.UTC(2026, 9, 20);
    const itens = [{ id: "i1", displayId: "#1", status: "ready_for_production", type: "2x1", quantity: 1 }];
    const card = enrichEvent(gravado, itens, [], hoje);
    expect(card.nextMilestone?.key).toBe("producao");
    expect(card.nextMilestone?.deadline).toBe("2026-10-31");
    const gp = buildEventPrazo(gravado as any, itens as any, { today: hoje });
    expect(gp!.stages.find((s) => s.key === "producao")!.deadline).toBe("2026-10-31");
    expect(gp!.stages.find((s) => s.key === "revisao")!.deadline).toBe("2026-10-30");
  }, 60000);
});
