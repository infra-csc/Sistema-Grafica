// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// A TELA DA ANÁLISES (Painel operacional da gráfica) — o contrato de uso:
//   · abre no Painel geral com a frase-resumo e os seis números;
//   · as cinco abas trocam o conteúdo e vão para a URL (?aba=);
//   · clicar no evento da tabela abre "Status por evento" COM ele;
//   · Produção: sub-abas, projeção com dia/processo/incluir atrasados;
//   · Pré-produção: o número abre a lista de peças;
//   · Problemas: chips recortam a lista;
//   · a falha da rota mostra o erro desenhado, não uma tela vazia.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as React from "react";
import { render, cleanup, act, fireEvent, within } from "@testing-library/react";
import { montarPainelOperacional, somarDias, type PecaDoPainel, type PainelOperacional } from "@shared/painel-operacional";
import { buildEventPrazo, computeKpis, type DomainEvent } from "../services/prazo-domain";
import { businessDayStrToMs } from "@shared/prazo-dates";
import type { PrazoEvent } from "@shared/prazos-contract";

const h = React.createElement;

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

// ── O painel de teste, montado pela regra de verdade ────────────────────────
const HOJE = "2026-10-16";
const em = (n: number) => new Date(Date.parse(`${somarDias(HOJE, n)}T15:00:00Z`));
const EVENTOS: DomainEvent[] = [
  { id: "e1", name: "Copa Norte", status: "created", startDate: "2026-10-20", truckDepartureDate: "2026-10-14T00:00:00.000Z" },
  { id: "e2", name: "Abertura Sul", status: "created", startDate: "2026-11-01", truckDepartureDate: "2026-10-30T00:00:00.000Z" },
];
let n = 0;
const peca = (eventId: string, status: string, over: Partial<PecaDoPainel> = {}): PecaDoPainel => ({
  id: `p${++n}`, displayId: String(n).padStart(4, "0"), eventId, status, type: "Banner", description: `Peça ${n}`,
  measurement: "1x1", material: "Lona", finish: "Ilhós", quantity: 2, reuseQty: 0, fileWidth: "1", fileHeight: "1",
  createdAt: em(-5), ...over,
});
const PECAS = [
  peca("e1", "ready_for_production", { quantity: 4 }),
  peca("e1", "awaiting_submission", { isPriority: true }),
  peca("e1", "ready_for_production", { parentItemId: "x", complementReason: "Perda na produção" }),
  peca("e2", "awaiting_submission", { rejectedBySponsor: true }),
  peca("e2", "awaiting_sponsor_approval", { approvalThumbUpdatedAt: em(-2) }),
  peca("e2", "produced", { producedAt: em(-1) }),
  peca("e2", "ready_for_production", { quantity: 3 }),
];
function montarPainel(): PainelOperacional {
  const prazos = EVENTOS
    .map((ev) => buildEventPrazo(ev, PECAS.filter((p) => p.eventId === ev.id).map((p) => ({ ...p, quantity: p.quantity ?? 1, type: p.type ?? "" })) as never, { today: businessDayStrToMs(HOJE) }))
    .filter((e): e is PrazoEvent => !!e).map((e) => ({ ...e, eventId: e.id, kit: null }));
  return montarPainelOperacional({
    pecas: PECAS, prazos, kpis: computeKpis(prazos), hoje: HOJE, geradoEm: em(0).toISOString(),
    nomeDoEvento: new Map(EVENTOS.map((e) => [e.id, e.name])),
  });
}
const PAINEL = montarPainel();

const Q = vi.hoisted(() => ({ erro: false }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => (Q.erro
    ? { data: undefined, isLoading: false, isError: true, isFetching: false, dataUpdatedAt: 0 }
    : { data: PAINEL, isLoading: false, isError: false, isFetching: false, dataUpdatedAt: Date.now() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

const celular = vi.hoisted(() => ({ valor: false }));
vi.mock("@/hooks/use-mobile", async (original) => ({
  ...(await original<typeof import("@/hooks/use-mobile")>()),
  useIsMobile: () => celular.valor,
}));

import Analises from "@/pages/analises";

const pelo = (c: HTMLElement, id: string) => c.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
async function esperarUrl() { await act(async () => { await new Promise((r) => setTimeout(r, 200)); }); }

describe("Análises — Painel operacional", () => {
  beforeEach(() => { window.history.replaceState(null, "", "/analises"); Q.erro = false; celular.valor = false; });
  afterEach(() => cleanup());

  it("abre no Painel geral com a frase, os seis números e os eventos ativos", () => {
    const { container: c } = render(h(Analises));
    expect(pelo(c, "title-analises")!.textContent).toBe("Análises");
    expect(pelo(c, "painel-op-frase")!.textContent).toMatch(/2 eventos estão atrasados, com \d+ peças fora do prazo da fase/);
    for (const id of ["op-kpi-eventos-atrasados", "op-kpi-pecas-fora", "op-kpi-saidas", "op-kpi-abertas", "op-kpi-m2-7d", "op-kpi-m2-falta"]) {
      expect(pelo(c, id), id).not.toBeNull();
    }
    expect(pelo(c, "op-kpi-abertas")!.textContent).toContain("7");
    expect(c.querySelectorAll('[data-testid="op-tabela-eventos-linha"]')).toHaveLength(2);
    expect(c.querySelectorAll('[role="tab"][data-testid^="aba-painel-op-"]')).toHaveLength(5);
  });

  it("as cinco abas trocam o conteúdo e vão para a URL", async () => {
    const { container: c } = render(h(Analises));
    for (const aba of ["producao", "pre", "problemas", "evento"]) {
      act(() => { fireEvent.click(pelo(c, `aba-painel-op-${aba}`)!); });
      expect(pelo(c, `painel-op-${aba}`), aba).not.toBeNull();
      await esperarUrl();
      expect(window.location.search).toContain(`aba=${aba}`);
    }
  });

  it("clicar no evento da tabela abre Status por evento com ele selecionado", async () => {
    const { container: c } = render(h(Analises));
    const linhas = Array.from(c.querySelectorAll('[data-testid="op-evento-abrir"]')) as HTMLElement[];
    const abertura = linhas.find((l) => l.textContent === "Abertura Sul")!;
    act(() => { fireEvent.click(abertura); });
    expect(pelo(c, "aba-painel-evento")).not.toBeNull();
    expect(pelo(c, "op-evento-fatos")!.textContent).toContain("Abertura Sul");
    expect(pelo(c, "op-evento-alerta")!.textContent).toMatch(/fase(s)? atrasada/);
    expect(c.querySelectorAll('[data-testid="op-tabela-evento-pecas-linha"]')).toHaveLength(4);
    await esperarUrl();
    expect(window.location.search).toContain("ev=e2");
  });

  it("a URL abre direto na aba e no evento", () => {
    window.history.replaceState(null, "", "/analises?aba=evento&ev=e1");
    const { container: c } = render(h(Analises));
    expect(pelo(c, "op-evento-fatos")!.textContent).toContain("Copa Norte");
  });

  it("Produção: realizado com medida; projeção com processo e incluir atrasados", async () => {
    const { container: c } = render(h(Analises));
    act(() => { fireEvent.click(pelo(c, "aba-painel-op-producao")!); });
    expect(pelo(c, "op-prod-real")).not.toBeNull();
    act(() => { fireEvent.change(pelo(c, "op-producao-medida")!, { target: { value: "unidades" } }); });
    expect((pelo(c, "op-producao-medida") as HTMLSelectElement).value).toBe("unidades");

    act(() => { fireEvent.click(pelo(c, "op-sub-projecao")!); });
    await esperarUrl();
    expect(window.location.search).toContain("sub=projecao");
    const total = () => pelo(c, "op-carga-impressao-total")!.textContent;
    const comAtrasados = total();
    expect(comAtrasados).toMatch(/m²/);
    act(() => { fireEvent.click(pelo(c, "op-proj-atrasados")!); });
    expect(total()).not.toBe(comAtrasados);
    expect(pelo(c, "op-carga-impressao-atrasados")!.textContent).toContain("fora da conta");
    act(() => { fireEvent.change(pelo(c, "op-proj-medida")!, { target: { value: "unidades" } }); });
    expect(total()).toMatch(/pç/);
    // um dia da fila projeta aquele dia
    const dia = c.querySelector('[data-testid="op-fila-dia-2026-10-29"]') as HTMLElement;
    act(() => { fireEvent.click(dia); });
    expect(pelo(c, "op-carga-impressao")!.textContent).toContain("29/10/2026");
  });

  it("Pré-produção: o número da tabela lista as peças, e Fechar some com a lista", () => {
    const { container: c } = render(h(Analises));
    act(() => { fireEvent.click(pelo(c, "aba-painel-op-pre")!); });
    const celula = c.querySelector('[data-testid="op-pre-celula-layout"]') as HTMLElement;
    act(() => { fireEvent.click(celula); });
    const lista = pelo(c, "op-pre-pecas")!;
    expect(lista.textContent).toMatch(/Peças — /);
    expect(lista.querySelectorAll('[data-testid="op-tabela-pre-pecas-linha"]').length).toBeGreaterThan(0);
    act(() => { fireEvent.click(pelo(c, "op-pre-pecas-fechar")!); });
    expect(pelo(c, "op-pre-pecas")).toBeNull();
  });

  it("Problemas: os chips recortam a lista", () => {
    const { container: c } = render(h(Analises));
    act(() => { fireEvent.click(pelo(c, "aba-painel-op-problemas")!); });
    const linhas = () => c.querySelectorAll('[data-testid="op-tabela-problemas-linha"]').length;
    const todos = linhas();
    act(() => { fireEvent.click(pelo(c, "op-prob-tipo-refacao")!); });
    expect(linhas()).toBe(1);
    expect(within(pelo(c, "op-tabela-problemas")!).getByText("Perda na produção")).toBeTruthy();
    act(() => { fireEvent.click(pelo(c, "op-prob-tipo-fura")!); });
    expect(linhas()).toBe(1);
    expect(todos).toBeGreaterThan(1);
  });

  it("falha da rota: o erro desenhado com o botão de tentar de novo", () => {
    Q.erro = true;
    const { container: c } = render(h(Analises));
    expect(c.textContent).toContain("Não foi possível carregar o painel operacional");
    expect(pelo(c, "painel-op-tentar-de-novo")).not.toBeNull();
  });

  it("no celular a tela monta sem as colunas secundárias", () => {
    celular.valor = true;
    const { container: c } = render(h(Analises));
    expect(c.querySelector('[data-testid="op-tabela-eventos-ordem-saida"]')).toBeNull();
    expect(c.querySelector('[data-testid="op-tabela-eventos-ordem-atraso"]')).not.toBeNull();
  });
});
