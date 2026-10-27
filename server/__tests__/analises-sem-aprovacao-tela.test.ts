// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// ANÁLISES × PEÇAS SEM APROVAÇÃO (Pedro/dono, 26/10) — a tela:
//   · RF09: Problemas separa "Atraso interno" × "Atraso do cliente" (cartões,
//     chips e barras), com o selo na linha da peça;
//   · RF10: o indicador "Aguardando arte do cliente" (peças e espera média por
//     evento), com o vazio desenhado;
//   · RF11: o filtro de marca da página recorta as peças de todas as abas, vai
//     para a URL (?marca=) e refaz os contadores com as MESMAS definições do
//     servidor (sem filtro, o resumo é o do servidor);
//   · RF06/RF12: selos e "Layout normal → ajustado" na lista de peças;
//   · RF07: o subestado "Layout — Aguardando arte do cliente" em Status por evento;
//   · Eventos × processo × prazo: a célula só com peça sem aprovação mostra o
//     prazo ajustado, marcado, com a regra na dica.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as React from "react";
import { render, cleanup, act, fireEvent } from "@testing-library/react";
import { montarPainelOperacional, type PecaDoPainel, type PainelOperacional } from "@shared/painel-operacional";
import { buildEventPrazo, computeKpis, type DomainEvent } from "../services/prazo-domain";
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

// ── O exemplo do documento: Layout 10/11, ajustado 17/11 (+7), Finalização 20/11 ──
const HOJE = "2026-11-24";
const EVENTO: DomainEvent = {
  id: "ev-1", name: "CORRIDA NORTE", status: "created", priority: null,
  startDate: "2026-12-05T00:00:00.000Z", truckDepartureDate: "2026-11-30T00:00:00.000Z", createdBy: null,
};
const peca = (id: string, status: string, over: Partial<PecaDoPainel> = {}): PecaDoPainel => ({
  id, displayId: id.toUpperCase(), eventId: "ev-1", status, type: "Banner", description: `Peça ${id}`,
  measurement: "1x1", material: "Lona", finish: "Ilhós", quantity: 1, reuseQty: 0, fileWidth: "1", fileHeight: "1", ...over,
});
const PECAS: PecaDoPainel[] = [
  peca("sem", "awaiting_submission", { skipApproval: true }), // passou do ajustado: atraso interno
  peca("cli", "awaiting_submission", { arteDoCliente: true, arteDoClienteMarcadaEm: "2026-11-10T13:00:00Z" }), // atraso do cliente
  peca("com", "awaiting_finalization"), // sem marca, finalização vencida: atraso interno
];
function montar(): PainelOperacional {
  const ev = buildEventPrazo(EVENTO, PECAS.map((p) => ({ ...p, quantity: p.quantity ?? 1, type: p.type ?? "" })) as never,
    { today: Date.parse(`${HOJE}T00:00:00Z`), diasDaAprovacao: 7 }) as PrazoEvent;
  const prazos = [{ ...ev, eventId: ev.id, kit: null }];
  return montarPainelOperacional({
    pecas: PECAS, prazos, kpis: computeKpis(prazos), hoje: HOJE, geradoEm: `${HOJE}T12:00:00Z`,
    nomeDoEvento: new Map([["ev-1", "CORRIDA NORTE"]]), diasDaAprovacao: 7,
  });
}
const PAINEL = montar();

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: PAINEL, isLoading: false, isError: false, isFetching: false, dataUpdatedAt: Date.now() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/hooks/use-mobile", async (original) => ({
  ...(await original<typeof import("@/hooks/use-mobile")>()),
  useIsMobile: () => false,
}));

import Analises from "@/pages/analises";
import { recortarPorMarca, resumoDasPecas } from "@/pages/analises/contexto";

const pelo = (c: HTMLElement, id: string) => c.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const todos = (c: HTMLElement, id: string) => Array.from(c.querySelectorAll(`[data-testid="${id}"]`)) as HTMLElement[];
async function esperarUrl() { await act(async () => { await new Promise((r) => setTimeout(r, 200)); }); }
const abrir = (qs: string) => { window.history.replaceState(null, "", `/analises${qs}`); return render(h(Analises)).container; };

describe("Análises × peças sem aprovação", () => {
  beforeEach(() => { window.history.replaceState(null, "", "/analises"); });
  afterEach(() => cleanup());

  it("o painel do exemplo: interno × cliente e o aguardando, como a regra diz", () => {
    const l = (id: string) => PAINEL.pecas.find((p) => p.id === id)!;
    expect(l("sem")).toMatchObject({ prazoFase: "2026-11-17", atrasoDoCliente: false, prazoDeLayout: { normal: "2026-11-10", ajustado: "2026-11-17" } });
    expect(l("cli")).toMatchObject({ atrasoDoCliente: true, aguardandoArteCliente: true, diasAguardandoArte: 14 });
    expect(l("com")).toMatchObject({ atrasoDoCliente: false, prazoDeLayout: null });
    expect(l("com").diasAtraso).toBeGreaterThan(0);
  });

  it("RF11: sem filtro, os contadores refeitos na tela são os do servidor; com filtro, seguem o recorte", () => {
    expect(resumoDasPecas(PAINEL.pecas, PAINEL.resumo)).toEqual(PAINEL.resumo);
    expect(recortarPorMarca(PAINEL, "todas")).toBe(PAINEL);
    const so = recortarPorMarca(PAINEL, "semPatrocinio");
    expect(so.pecas.map((p) => p.id)).toEqual(["sem"]);
    expect(so.resumo).toMatchObject({ pecasAbertas: 1, atrasadasAbertas: 1, atrasoClienteAbertas: 0, aguardandoArteAbertas: 0, m2AImprimir: PAINEL.resumo.m2AImprimir });
    expect(so.eventos).toBe(PAINEL.eventos); // os prazos do evento não mudam com o filtro
  });

  it("RF09/RF10: Problemas separa interno × cliente e mostra quem espera a arte", () => {
    const c = abrir("?aba=problemas");
    expect(pelo(c, "op-kpi-atraso-interno")!.textContent).toContain("2");
    expect(pelo(c, "op-kpi-atraso-cliente")!.textContent).toContain("1");
    expect(pelo(c, "op-kpi-aguardando-arte")!.textContent).toContain("1");
    expect(pelo(c, "op-prob-tipo-atrasoInterno")!.textContent).toBe("Atraso interno2");
    expect(pelo(c, "op-prob-tipo-atrasoCliente")!.textContent).toBe("Atraso do cliente1");
    expect(pelo(c, "op-barras-problemas")!.textContent).toContain("Atraso do cliente");

    act(() => { fireEvent.click(pelo(c, "op-prob-tipo-atrasoCliente")!); });
    const linhas = todos(c, "op-tabela-problemas-linha");
    expect(linhas).toHaveLength(1);
    expect(linhas[0].querySelector('[data-testid="op-atraso-cliente-cli"]')!.textContent).toBe("Atraso do cliente");
    expect(linhas[0].querySelector('[data-testid="selo-arte-do-cliente-cli"]')!.textContent).toBe("Aguardando arte do cliente");

    // O indicador: 1 peça no evento, 14 dias de espera, 1 já com atraso do cliente.
    const tabela = pelo(c, "op-tabela-aguardando-arte")!;
    expect(todos(tabela, "op-tabela-aguardando-arte-linha")).toHaveLength(1);
    expect(tabela.textContent).toContain("CORRIDA NORTE");
    expect(pelo(c, "op-aguardando-arte-resumo")!.textContent).toMatch(/1 peça marcada “Arte do cliente” ainda sem o arquivo, esperando em média 14 dias/);
  });

  it("RF06/RF12: a lista de peças traz os selos e o Layout normal → ajustado", () => {
    const c = abrir("?aba=problemas");
    act(() => { fireEvent.click(pelo(c, "op-prob-tipo-atrasoInterno")!); });
    const tabela = pelo(c, "op-tabela-problemas")!;
    expect(tabela.querySelector('[data-testid="selo-sem-patrocinio-sem"]')!.textContent).toBe("Sem patrocínio");
    expect(tabela.querySelector('[data-testid="op-prazo-layout-sem"]')!.textContent).toMatch(/Layout\s*10\/11.*17\/11/);
    // A peça sem marca não ganha selo nem o par de prazos.
    expect(tabela.querySelector('[data-testid="op-prazo-layout-com"]')).toBeNull();
    expect(tabela.querySelector('[data-testid^="selo-"][data-testid$="-com"]')).toBeNull();
  });

  it("RF11: o filtro de marca vale para a página, vai para a URL e o vazio do indicador aparece", async () => {
    const c = abrir("?aba=problemas&marca=comAprovacao");
    expect((pelo(c, "op-filtro-marca-select") as HTMLSelectElement).value).toBe("comAprovacao");
    expect(pelo(c, "op-filtro-marca-resumo")!.textContent).toMatch(/^1 de 3 peças em todas as abas/);
    expect(pelo(c, "op-aguardando-arte-vazio")!.textContent).toBe("Nenhuma peça aguardando arte do cliente.");
    expect(pelo(c, "op-kpi-atraso-cliente")!.textContent).toContain("0");

    act(() => { fireEvent.change(pelo(c, "op-filtro-marca-select")!, { target: { value: "arteDoCliente" } }); });
    await esperarUrl();
    expect(window.location.search).toContain("marca=arteDoCliente");
    expect(pelo(c, "op-aguardando-arte-vazio")).toBeNull();

    // Troca de aba: o filtro continua (é da página).
    act(() => { fireEvent.click(pelo(c, "aba-painel-op-evento")!); });
    expect(todos(c, "op-tabela-evento-pecas-linha")).toHaveLength(1);

    act(() => { fireEvent.click(pelo(c, "op-filtro-marca-limpar")!); });
    await esperarUrl();
    expect(window.location.search).not.toContain("marca=");
    expect(todos(c, "op-tabela-evento-pecas-linha")).toHaveLength(3);
  });

  it("RF07: Status por evento conta o subestado “Layout — Aguardando arte do cliente”", () => {
    const c = abrir("?aba=evento&ev=ev-1");
    const aviso = pelo(c, "op-evento-aguardando-arte")!;
    expect(aviso.textContent).toContain("Layout — Aguardando arte do cliente:");
    expect(aviso.textContent).toContain("1 peça");
    expect(aviso.textContent).toContain("1 com atraso do cliente");
  });

  it("Eventos × processo × prazo: a célula só com peça sem aprovação mostra o prazo ajustado, com a regra na dica", () => {
    const c = abrir("?aba=pre&pre=calendario");
    const linha = todos(c, "op-cal-linha").find((l) => l.getAttribute("data-evento") === "ev-1")!;
    const layout = linha.querySelector('[data-testid="op-cal-celula-f1"]') as HTMLElement;
    expect(layout.getAttribute("data-ajustado")).toBe("1");
    expect(layout.querySelector('[data-testid="op-cal-celula-ajustada"]')!.textContent).toContain("17/11");
    expect(layout.getAttribute("title")).toContain("Prazo do evento 10/11 — só há peças sem aprovação nesta fase (Layout + 7 dias corridos)");
    // A Finalização tem a peça comum: o prazo é o do evento, sem marca de ajuste.
    const fin = linha.querySelector('[data-testid="op-cal-celula-f3"]') as HTMLElement;
    expect(fin.getAttribute("data-ajustado")).toBeNull();

    // O quadro da célula diz o prazo que vale e o do evento.
    act(() => { fireEvent.click(layout); });
    expect(pelo(c, "op-cal-pecas-resumo")!.textContent).toMatch(/prazo da fase 17\/11\/2026 \(ajustado; prazo do evento 10\/11\/2026\)/);
  });
});
