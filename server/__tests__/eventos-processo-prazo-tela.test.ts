// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// ANÁLISES › PRÉ-PRODUÇÃO › "EVENTOS × PROCESSO × PRAZO" — a tela:
//   · o submenu (Realizado e pendências | Eventos × processo × prazo), com o
//     conteúdo antigo intacto no primeiro;
//   · ?pre=calendario e o link direto #pre-calendario abrem o submenu novo;
//   · a célula vermelha abre o quadro com a MESMA contagem da célula, a
//     célula fica marcada e Fechar devolve o foco a ela;
//   · o filtro "somente eventos com fase atrasada" e a ordenação por coluna
//     (crescente → decrescente, aria-sort), com o estado na URL (cal_*).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as React from "react";
import { render, cleanup, act, fireEvent } from "@testing-library/react";
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
if (typeof CSS === "undefined" || !CSS.escape) (globalThis as unknown as { CSS: { escape: (s: string) => string } }).CSS = { escape: (s: string) => s.replace(/["\\]/g, "\\$&") };

// ── O painel de teste, montado pela regra de verdade ────────────────────────
const HOJE = "2026-10-16";
const em = (n: number) => new Date(Date.parse(`${somarDias(HOJE, n)}T15:00:00Z`));
const EVENTOS: DomainEvent[] = [
  // Saída já passou: todas as fases vencidas.
  { id: "e1", name: "Copa Norte", status: "created", startDate: "2026-10-20", truckDepartureDate: "2026-10-14T00:00:00.000Z" },
  // Layout vencido (10/10), o resto dentro da janela.
  { id: "e2", name: "Abertura Sul", status: "created", startDate: "2026-11-01", truckDepartureDate: "2026-10-30T00:00:00.000Z" },
  // Só o layout cai na janela (29/10): nada atrasado.
  { id: "e3", name: "Trilha Oeste", status: "created", startDate: "2026-11-20", truckDepartureDate: "2026-11-18T00:00:00.000Z" },
  // Tudo longe: fora da tela.
  { id: "e4", name: "Corrida Leste", status: "created", startDate: "2026-12-20", truckDepartureDate: "2026-12-18T00:00:00.000Z" },
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
  peca("e1", "ready_for_production"),
  peca("e2", "awaiting_submission"),
  peca("e2", "awaiting_sponsor_approval"),
  peca("e2", "produced"),
  peca("e2", "delivered"),
  peca("e3", "ready_for_production"), // fases 1–4 concluídas, só a produção pendente
  peca("e4", "awaiting_submission"),
];
function montarPainel(): PainelOperacional {
  const prazos = EVENTOS
    .map((ev) => buildEventPrazo(ev, PECAS.filter((p) => p.eventId === ev.id).map((p) => ({ ...p, quantity: p.quantity ?? 1, type: p.type ?? "" })) as never, { today: businessDayStrToMs(HOJE) }))
    .filter((e): e is PrazoEvent => !!e).map((e) => ({ ...e, eventId: e.id, kit: null }));
  return montarPainelOperacional({
    pecas: PECAS, prazos, kpis: computeKpis(prazos), hoje: HOJE, geradoEm: em(0).toISOString(),
    nomeDoEvento: new Map(EVENTOS.map((e) => [e.id, e.name])), remessasConhecidas: new Set(),
  });
}
const PAINEL = montarPainel();

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: PAINEL, isLoading: false, isError: false, isFetching: false, dataUpdatedAt: Date.now() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
const celular = vi.hoisted(() => ({ valor: false }));
vi.mock("@/hooks/use-mobile", async (original) => ({
  ...(await original<typeof import("@/hooks/use-mobile")>()),
  useIsMobile: () => celular.valor,
}));

import Analises from "@/pages/analises";

const pelo = (c: HTMLElement, id: string) => c.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const todos = (c: HTMLElement, id: string) => Array.from(c.querySelectorAll(`[data-testid="${id}"]`)) as HTMLElement[];
const eventosDaGrade = (c: HTMLElement) => todos(c, "op-cal-linha").map((l) => l.getAttribute("data-evento"));
async function esperarUrl() { await act(async () => { await new Promise((r) => setTimeout(r, 200)); }); }
function abrirCalendario() {
  window.history.replaceState(null, "", "/analises?aba=pre&pre=calendario");
  return render(h(Analises)).container;
}

describe("Análises › Pré-produção › Eventos × processo × prazo", () => {
  beforeEach(() => { window.history.replaceState(null, "", "/analises"); celular.valor = false; });
  afterEach(() => cleanup());

  it("Pré-produção tem o submenu; o conteúdo antigo continua no primeiro (critério 1)", async () => {
    window.history.replaceState(null, "", "/analises?aba=pre");
    const { container: c } = render(h(Analises));
    const sub = pelo(c, "op-pre-subabas")!;
    expect(sub.querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(pelo(c, "op-pre-sub-pendencias")!.textContent).toBe("Realizado e pendências");
    expect(pelo(c, "op-pre-sub-calendario")!.textContent).toBe("Eventos × processo × prazo");
    expect(pelo(c, "op-pre-sub-pendencias")!.getAttribute("aria-selected")).toBe("true");
    for (const id of ["op-pre-filtros", "op-pre-real", "op-pre-plan", "op-pre-evento-tabela"]) expect(pelo(c, id), id).not.toBeNull();

    act(() => { fireEvent.click(pelo(c, "op-pre-sub-calendario")!); });
    expect(pelo(c, "op-pre-calendario")).not.toBeNull();
    expect(pelo(c, "op-pre-evento-tabela")).toBeNull();
    await esperarUrl();
    expect(window.location.search).toContain("pre=calendario");
  });

  it("o link direto #pre-calendario abre a Pré-produção já no submenu novo (e vira query)", async () => {
    window.history.replaceState(null, "", "/analises#pre-calendario");
    const { container: c } = render(h(Analises));
    expect(pelo(c, "aba-painel-op-pre")!.getAttribute("aria-selected")).toBe("true");
    expect(pelo(c, "op-pre-calendario")).not.toBeNull();
    await esperarUrl();
    expect(window.location.search).toContain("aba=pre");
    expect(window.location.search).toContain("pre=calendario");
    expect(window.location.hash).toBe("");
  });

  it("a grade: só eventos que entram, atrasados primeiro, saída passada riscada, frase da contagem cumulativa", () => {
    const c = abrirCalendario();
    expect(eventosDaGrade(c)).toEqual(["e1", "e2", "e3"]);
    const linhaE1 = todos(c, "op-cal-linha")[0];
    expect(linhaE1.querySelector('[data-testid="op-cal-fases-atrasadas"]')!.textContent).toBe("5 fases atrasadas");
    expect(linhaE1.querySelector('[data-testid="op-cal-saida-passou"]')).not.toBeNull();
    expect(pelo(c, "op-cal")!.textContent).toContain("cada célula conta as peças que ainda precisam passar por aquela fase");
    expect(pelo(c, "op-cal-contagem")!.textContent).toMatch(/3 eventos, 2 com fase atrasada/);
    // Cada fase mostra a data do prazo (critério 3).
    for (const cel of linhaE1.querySelectorAll('[data-testid^="op-cal-celula-f"]')) expect(cel.textContent).toMatch(/\d{2}\/\d{2}/);
  });

  it("clicar na célula vermelha abre o quadro com a mesma contagem; Fechar some com ele e devolve o foco (critério 5)", async () => {
    const c = abrirCalendario();
    const linhaE1 = todos(c, "op-cal-linha")[0];
    const celula = linhaE1.querySelector('[data-testid="op-cal-celula-f5"]') as HTMLButtonElement;
    expect(celula.tagName).toBe("BUTTON");
    expect(celula.getAttribute("data-situacao")).toBe("atrasada");
    const naCelula = Number(celula.querySelector('[data-testid="op-cal-celula-info"]')!.textContent!.match(/^(\d+) pç/)![1]);
    expect(naCelula).toBe(3);

    act(() => { fireEvent.click(celula); });
    const quadro = pelo(c, "op-cal-pecas")!;
    expect(quadro.textContent).toContain("Copa Norte — Produção gráfica");
    expect(pelo(c, "op-cal-pecas-resumo")!.textContent).toMatch(/^3 peças atrasadas nesta fase · prazo da fase \d{2}\/\d{2}\/2026 \(vencido há \d+ dias?\)$/);
    expect(todos(quadro, "op-tabela-cal-pecas-linha")).toHaveLength(naCelula);
    expect(quadro.textContent).toContain("Fura-fila");
    expect(celula.getAttribute("aria-pressed")).toBe("true");
    await esperarUrl();
    expect(window.location.search).toContain("cal_ev=e1");
    expect(window.location.search).toContain("cal_fase=5");

    act(() => { fireEvent.click(pelo(c, "op-cal-pecas-fechar")!); });
    expect(pelo(c, "op-cal-pecas")).toBeNull();
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(document.activeElement).toBe(c.querySelector('[data-cal-celula="e1|5"]'));
  });

  it("célula sem pendência não é clicável; a URL com cal_ev/cal_fase abre o quadro direto", () => {
    window.history.replaceState(null, "", "/analises?aba=pre&pre=calendario&cal_ev=e2&cal_fase=2");
    const { container: c } = render(h(Analises));
    expect(pelo(c, "op-cal-pecas")!.textContent).toContain("Abertura Sul — Aprovação de layout");
    const concluidas = Array.from(c.querySelectorAll('[data-situacao="concluida"]'));
    expect(concluidas.length).toBeGreaterThan(0);
    expect(concluidas.every((x) => x.tagName === "SPAN" && x.textContent!.includes("concluída"))).toBe(true);
  });

  it("somente eventos com fase atrasada esconde os outros (e vai para a URL)", async () => {
    const c = abrirCalendario();
    act(() => { fireEvent.click(pelo(c, "op-cal-so-atrasadas")!); });
    expect(eventosDaGrade(c)).toEqual(["e1", "e2"]);
    await esperarUrl();
    expect(window.location.search).toContain("cal_so_atr=1");
  });

  it("ordenar pelo topo da coluna: crescente, depois decrescente, com aria-sort (critério 6)", async () => {
    const c = abrirCalendario();
    const th = (id: string) => pelo(c, `op-cal-ordem-${id}`)!.closest("th")!;
    expect(th("f1").getAttribute("aria-sort")).toBe("none");

    act(() => { fireEvent.click(pelo(c, "op-cal-ordem-data_evento")!); });
    expect(th("data_evento").getAttribute("aria-sort")).toBe("ascending");
    expect(pelo(c, "op-cal-ordem-data_evento")!.textContent).toContain("↑");
    expect(eventosDaGrade(c)).toEqual(["e1", "e2", "e3"]);
    act(() => { fireEvent.click(pelo(c, "op-cal-ordem-data_evento")!); });
    expect(th("data_evento").getAttribute("aria-sort")).toBe("descending");
    expect(eventosDaGrade(c)).toEqual(["e3", "e2", "e1"]);

    act(() => { fireEvent.click(pelo(c, "op-cal-ordem-evento")!); });
    expect(eventosDaGrade(c)).toEqual(["e2", "e1", "e3"]); // Abertura, Copa, Trilha
    expect(th("data_evento").getAttribute("aria-sort")).toBe("none");

    act(() => { fireEvent.click(pelo(c, "op-cal-ordem-f5")!); });
    act(() => { fireEvent.click(pelo(c, "op-cal-ordem-f5")!); });
    expect(th("f5").getAttribute("aria-sort")).toBe("descending");
    expect(eventosDaGrade(c)).toEqual(["e3", "e2", "e1"]); // pelo prazo da produção
    await esperarUrl();
    expect(window.location.search).toContain("cal_ord=f5");
    expect(window.location.search).toContain("cal_dir=desc");

    act(() => { fireEvent.click(pelo(c, "op-cal-ordem-padrao")!); });
    expect(eventosDaGrade(c)).toEqual(["e1", "e2", "e3"]);
  });

  it("no celular monta com a coluna Evento fixa e alvos de 44px", () => {
    celular.valor = true;
    const c = abrirCalendario();
    expect(pelo(c, "op-pre-sub-calendario")!.textContent).toBe("Processo × prazo");
    const primeira = todos(c, "op-cal-linha")[0].querySelector("th")!;
    expect(primeira.style.position).toBe("sticky");
    expect(primeira.style.left).toBe("0px");
    const botao = c.querySelector(".pop-cal-celula") as HTMLElement;
    expect(botao.style.minHeight).toBe("44px");
    expect(pelo(c, "op-cal-ordem-evento")!.style.minHeight).toBe("44px");
  });
});
