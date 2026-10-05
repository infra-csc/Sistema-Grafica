// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// A NOVA ANÁLISES, DE PONTA A PONTA NA TELA (dono, 01–02/10: "gestão completa
// de status, com abas, de todas as fases").
//
// O que se prende aqui é o CONTRATO de uso, não o desenho:
//   · a página abre na Visão geral com os números da régua única;
//   · todo número que é um conjunto de peças ABRE a gaveta com exatamente
//     aquelas peças, e cada peça leva à ficha dela (/eventos/:id?item=);
//   · trocar de aba troca o conteúdo e vai para a URL (?aba=);
//   · o atalho "Só atrasadas" recorta todas as abas;
//   · a aba Desempenho é a tela antiga inteira, com evento/patrocinador vindo
//     do topo (os gatilhos dela somem; o de período fica);
//   · a falha de /api/analises/operacao não derruba a página.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as React from "react";
import { render, cleanup, act, fireEvent, waitFor, within } from "@testing-library/react";
import { businessDayMs } from "@/lib/analises-metrics";

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

const DIA = 86_400_000;
// Relógio FIXO numa quarta-feira: o atraso na etapa conta dias úteis, e com o
// relógio real o mesmo cenário mudava de resultado conforme o dia da semana
// em que a suíte rodava (falhou numa segunda, 05/10).
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-09-30T15:00:00Z"));
const hoje = businessDayMs(Date.now());
const dia = (n: number) => new Date(hoje + n * DIA).toISOString();

// Saída em 9 dias: Lista (−25), Layouts (−20), Aprovação (−12) e Finalização
// (−10) já venceram — rascunho, envio e finalização estão atrasados.
const EVENTS = [
  { id: "ev1", name: "Copa Norte", truckDepartureDate: dia(9), startDate: dia(12), status: "created", createdAt: dia(-60) },
  { id: "ev2", name: "Abertura Sul", truckDepartureDate: dia(60), startDate: dia(63), status: "created", createdAt: dia(-10) },
];
const ITEMS = [
  // O displayId às vezes já vem com "#": a tela não pode escrever "##101".
  { id: "i1", displayId: "#101", eventId: "ev1", status: "draft", type: "Banner", quantity: 1, createdAt: dia(-30), statusChangedAt: dia(-20), sponsors: [] },
  { id: "i2", displayId: "102", eventId: "ev1", status: "awaiting_submission", type: "Banner", quantity: 2, createdAt: dia(-30), statusChangedAt: dia(-3), sponsors: [{ id: "sp1", name: "Alfa" }] },
  { id: "i3", displayId: "103", eventId: "ev1", status: "sponsor_approved", type: "Pórtico", quantity: 1, createdAt: dia(-30), statusChangedAt: null, sponsors: [{ id: "sp1", name: "Alfa" }] },
  { id: "i4", displayId: "104", eventId: "ev2", status: "awaiting_submission", type: "Banner", quantity: 1, createdAt: dia(-5), statusChangedAt: dia(-1), sponsors: [{ id: "sp2", name: "Beta" }], isPriority: true },
  { id: "i5", displayId: "105", eventId: "ev2", status: "inProduction", type: "Lona", quantity: 1, createdAt: dia(-5), statusChangedAt: dia(-1), sponsors: [], travadaEm: dia(-1), travadaMotivo: "Arte vai mudar" },
  { id: "i6", displayId: "106", eventId: "ev2", status: "delivered", type: "Lona", quantity: 1, createdAt: dia(-20), statusChangedAt: dia(-2), deliveredAt: dia(-2), sponsors: [] },
  { id: "i7", displayId: "107", eventId: "ev1", status: "awaiting_final_review", type: "Book completo", quantity: 1, createdAt: dia(-5), statusChangedAt: dia(-1), sponsors: [] },
];
const SPONSORS = [{ id: "sp1", name: "Alfa" }, { id: "sp2", name: "Beta" }];

const celular = vi.hoisted(() => ({ valor: false }));
vi.mock("@/hooks/use-mobile", async (original) => ({
  ...(await original<typeof import("@/hooks/use-mobile")>()),
  useIsMobile: () => celular.valor,
}));

vi.mock("@tanstack/react-query", () => {
  const porChave: Record<string, unknown> = { "/api/events": EVENTS, "/api/items": ITEMS, "/api/sponsors": SPONSORS };
  return {
    useQuery: ({ queryKey }: { queryKey: string[] }) => {
      const k = queryKey[0]!;
      // O agregado do servidor FALHA de propósito: a página tem de seguir de pé.
      if (k.startsWith("/api/analises/operacao")) {
        return { data: undefined, isLoading: false, isError: true, isFetching: false, dataUpdatedAt: 0 };
      }
      return {
        data: k.startsWith("/api/analises/tempo-por-etapa") ? null : (porChave[k] ?? []),
        isLoading: false, isError: false, isFetching: false, dataUpdatedAt: Date.now(),
      };
    },
    useQueryClient: () => ({ invalidateQueries: () => {} }),
  };
});

vi.mock("wouter", () => ({
  useLocation: () => ["/analises", () => {}],
  Link: ({ href, children, ...resto }: { href: string; children: React.ReactNode }) => h("a", { href, ...resto }, children),
}));

const { default: Analises } = await import("@/pages/analises");
vi.setConfig({ testTimeout: 30_000 });

async function abrir() {
  const r = render(h(Analises));
  await r.findByTestId("aba-geral", undefined, { timeout: 10_000 });
  return r;
}

beforeEach(() => {
  celular.valor = false;
  window.history.replaceState(null, "", "/analises");
});
afterEach(() => { cleanup(); });

describe("Visão geral", () => {
  it("abre com os números da régua única, e o Book completo não conta", async () => {
    const { getByTestId } = await abrir();
    // i1..i5 em andamento (o Book completo some; i6 está entregue).
    expect(getByTestId("kpi-em-andamento").textContent).toContain("5");
    // Atrasadas: rascunho (Lista −25), envio do ev1 (Layouts −20), finalização (−10).
    expect(getByTestId("kpi-atrasadas").textContent).toContain("3");
    expect(getByTestId("kpi-travadas").textContent).toContain("1");
    expect(getByTestId("kpi-prioritarias").textContent).toContain("1");
    expect(getByTestId("analises-subtitulo").textContent).toMatch(/5\s*peças em andamento/);
    // A aba Arte carrega o contador de atrasadas em perigo.
    expect(getByTestId("aba-analises-arte").textContent).toContain("2");
  });

  it("o número abre a gaveta com EXATAMENTE as peças dele, e cada uma leva à ficha", async () => {
    const r = await abrir();
    await act(async () => { fireEvent.click(r.getByTestId("kpi-atrasadas")); });
    const gaveta = await r.findByTestId("gaveta-de-pecas");
    const linhas = within(gaveta).getAllByTestId("gaveta-peca");
    expect(linhas).toHaveLength(3);
    const ids = linhas.map((l) => l.textContent);
    expect(ids.some((t) => t?.includes("#101"))).toBe(true);
    expect(ids.some((t) => t?.includes("#104"))).toBe(false);
    expect(gaveta.textContent).not.toContain("##");
    // A idade desconhecida é DITA, nunca "0 dias".
    expect(gaveta.textContent).toContain("Idade na etapa desconhecida");
    const link = within(gaveta).getAllByTestId("gaveta-abrir-peca")[0] as HTMLAnchorElement;
    expect(link.getAttribute("href")).toMatch(/^\/eventos\/ev1\?item=i\d$/);

    await act(async () => { fireEvent.click(within(gaveta).getByTestId("gaveta-fechar")); });
    await waitFor(() => expect(r.queryByTestId("gaveta-de-pecas")).toBeNull());
  });

  it("o selo de travadas no fluxo abre a peça travada com o motivo", async () => {
    const r = await abrir();
    await act(async () => { fireEvent.click(r.getByTestId("fluxo-travadas-inProduction")); });
    const gaveta = await r.findByTestId("gaveta-de-pecas");
    expect(within(gaveta).getAllByTestId("gaveta-peca")).toHaveLength(1);
    expect(gaveta.textContent).toContain("Arte vai mudar");
  });
});

describe("leitura sem ambiguidade", () => {
  it("a Arte aparece duas vezes no fluxo, e cada trecho diz qual é", async () => {
    const { getByTestId } = await abrir();
    const fluxo = getByTestId("fluxo-de-etapas").textContent ?? "";
    expect(fluxo).toContain("Arte · criação");
    expect(fluxo).toContain("Arte · finalização");
    // A etapa que soma rascunho e solicitado diz que soma.
    expect(getByTestId("fluxo-etapa-requested").textContent).toContain("Rascunho e solicitado");
  });

  it("sem filtro não há 'Limpar tudo' apagado — só a contagem", async () => {
    const r = await abrir();
    expect(r.queryByTestId("analises-limpar")).toBeNull();
    expect(r.queryByText("Nenhum filtro aplicado")).toBeNull();
  });

  it("as abas têm rótulo curto e o nome completo na dica", async () => {
    const r = await abrir();
    const estoque = r.getByTestId("aba-analises-estoque");
    expect(estoque.textContent).toBe("Estoque");
    expect(estoque.getAttribute("title")).toBe("Estoque e reaproveitamento");
  });

  it("no celular a tabela esconde as colunas secundárias e fica com nome, peças e atrasadas", async () => {
    celular.valor = true;
    const r = await abrir();
    const cab = Array.from(r.getByTestId("tabela-eventos-atraso").querySelectorAll("th[scope=col]")).map((t) => t.textContent ?? "");
    expect(cab).toHaveLength(3);
    expect(cab[0]).toContain("Evento");
    expect(cab[1]).toContain("Em andamento");
    expect(cab[2]).toContain("Atrasadas");
    // Os atalhos ficam numa grade de duas colunas (nem rolam e somem, nem
    // ocupam uma linha cada), sem o "Só" que os alargava.
    const grupo = r.getByRole("group", { name: "Atalhos de recorte" }) as HTMLElement;
    expect(grupo.style.display).toBe("grid");
    expect(grupo.style.gridTemplateColumns).toContain("repeat(2");
    expect(r.getByTestId("atalho-atrasadas").textContent).not.toContain("Só");
  });
});

describe("abas, URL e atalhos", () => {
  it("trocar de aba troca o conteúdo e grava ?aba= na URL", async () => {
    const r = await abrir();
    await act(async () => { fireEvent.click(r.getByTestId("aba-analises-arte")); });
    await r.findByTestId("aba-arte", undefined, { timeout: 10_000 });
    expect(r.getByTestId("arte-fila-criar-aprovacoes").textContent).toContain("2");
    expect(r.getByTestId("arte-fila-finalizar-layouts").textContent).toContain("1");
    // O levantamento do servidor falhou: o bloco diz isso, o resto continua.
    expect(r.getByTestId("operacao-erro")).toBeTruthy();
    await waitFor(() => expect(window.location.search).toContain("aba=arte"));
  });

  it("'Só atrasadas' recorta todas as abas e vai para a URL", async () => {
    const r = await abrir();
    await act(async () => { fireEvent.click(r.getByTestId("atalho-atrasadas")); });
    expect(r.getByTestId("atalho-atrasadas").getAttribute("aria-pressed")).toBe("true");
    expect(r.getByTestId("kpi-em-andamento").textContent).toContain("3");
    expect(r.getByTestId("recorte-status").textContent).toMatch(/3\s*de\s*6\s*peças/);
    await waitFor(() => expect(window.location.search).toContain("atrasadas=1"));
    await act(async () => { fireEvent.click(r.getByTestId("analises-limpar")); });
    expect(r.getByTestId("kpi-em-andamento").textContent).toContain("5");
  });

  it("abre direto na aba e no recorte que vêm na URL", async () => {
    window.history.replaceState(null, "", "/analises?aba=revisao&evento=ev2");
    const r = render(h(Analises));
    await r.findByTestId("revisao-vazia", undefined, { timeout: 10_000 });
    expect(r.getByTestId("aba-analises-revisao").getAttribute("aria-selected")).toBe("true");
  });

  it("Desempenho é a tela antiga, com evento e patrocinador vindos do topo", async () => {
    const r = await abrir();
    await act(async () => { fireEvent.click(r.getByTestId("aba-analises-desempenho")); });
    await r.findByTestId("aba-desempenho", undefined, { timeout: 15_000 });
    await r.findByTestId("select-period", undefined, { timeout: 15_000 });
    expect(r.queryByTestId("select-event")).toBeNull();
    expect(r.queryByTestId("select-sponsor")).toBeNull();
    expect(r.getByTestId("button-export-analises")).toBeTruthy();
    // Um <h1> só na página: o do painel antigo virou <h2>.
    expect(r.container.querySelectorAll("h1")).toHaveLength(1);
  });
});
