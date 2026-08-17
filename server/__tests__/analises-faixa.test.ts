// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// A FAIXA DE FILTROS DA TELA DE ANÁLISES
//
// O dono olhou a tela ao vivo e reprovou os filtros. Cada defeito que ele
// apontou vira um teste aqui, porque todos eram invisíveis para o `tsc`:
//
//  1. o rótulo em CAIXA ALTA acima de cada gatilho repetia o que o próprio
//     gatilho dizia, e gastava uma linha inteira da primeira dobra;
//  2. o texto do gatilho aparecia CENTRALIZADO (herança do `text-align:center`
//     que o navegador dá a todo <button>, exposta pelo `fullWidth` que
//     esticava o <span> do rótulo) — no resto do app ele é à esquerda;
//  3. "SEM FILTROS" era um rótulo de estado com cara de botão desligado, e o
//     botão de limpar só nascia DEPOIS que já havia algo para limpar;
//  4. o menu de Período trazia caixa de busca para quatro opções fixas;
//  5. a tela abria em "Todo o período" e, como esse recorte não tem janela
//     anterior, os quatro KPIs abriam dizendo "Escolha um período para
//     comparar" — ou seja, abria sem entregar o principal;
//  6. o bloco "Tempo por etapa" ocupava meia dobra para dizer "— dias".
//
// O item 6 mudou de natureza: o bloco VOLTOU, agora com permanência medida na
// trilha de auditoria (server/services/tempo-etapas.ts). O que continua sendo
// testado aqui é a decisão que sobreviveu — recorte sem base suficiente não
// ganha bloco vazio —, mais o caso novo: havendo base, o bloco aparece com
// número e com denominador visível.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as React from "react";
import { render, cleanup, act } from "@testing-library/react";
import { businessDayMs } from "@/lib/analises-metrics";

const h = React.createElement;

// O ResponsiveContainer do recharts assina o ResizeObserver no efeito de
// montagem, e o jsdom não tem um. Sem este esboço a tela inteira derruba o
// teste antes de qualquer asserção sobre a faixa.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

const DIA = 86_400_000;
// Ancorado no "hoje" REAL do negócio, não numa data fixa: o recorte da tela é
// relativo (últimos 30 dias), e congelar o relógio só acrescentaria uma peça
// móvel entre o teste e o que ele mede.
const hoje = businessDayMs(Date.now());
const diaAtras = (n: number) => new Date(hoje - n * DIA).toISOString();

/* Dois ciclos fechados: um dentro dos últimos 30 dias, outro dentro dos 30
   anteriores. É a base mínima para o período padrão de 30 dias ser legítimo —
   com peça nas DUAS janelas, a comparação dos KPIs existe de verdade. */
const EVENTS = [
  { id: "ev-recente", name: "Copa Norte", truckDepartureDate: diaAtras(5), createdAt: diaAtras(60) },
  { id: "ev-antes", name: "Abertura Sul", truckDepartureDate: diaAtras(45), createdAt: diaAtras(90) },
];
const ITEMS = [
  {
    id: "i1", eventId: "ev-recente", status: "delivered", type: "Banner", quantity: 3,
    calculatedM2: "10.00", createdAt: diaAtras(20), deliveredAt: diaAtras(6),
    sponsors: [{ id: "sp1", name: "Alfa" }],
  },
  {
    id: "i2", eventId: "ev-antes", status: "delivered", type: "Banner", quantity: 2,
    calculatedM2: "8.00", createdAt: diaAtras(60), deliveredAt: diaAtras(46),
    sponsors: [{ id: "sp1", name: "Alfa" }],
  },
];
const SPONSORS = [{ id: "sp1", name: "Alfa" }];

const celular = vi.hoisted(() => ({ valor: false }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => celular.valor }));

/* O agregado de "Tempo por etapa" NÃO sai de /api/items: ele é medido no
   servidor sobre a trilha de auditoria. Fica num porta-valor para que o teste
   escolha se aquele recorte tem base — que é a única coisa que decide se o
   bloco aparece. */
const tempo = vi.hoisted(() => ({ payload: null as unknown }));

// A tela não passa queryFn (o app tem uma global). Aqui o dado é entregue
// direto: o alvo do teste é a FAIXA, não a camada de rede.
vi.mock("@tanstack/react-query", () => {
  const porChave: Record<string, unknown[]> = {
    "/api/events": EVENTS,
    "/api/items": ITEMS,
    "/api/sponsors": SPONSORS,
  };
  return {
    useQuery: ({ queryKey }: { queryKey: string[] }) => ({
      data: queryKey[0]!.startsWith("/api/analises/tempo-por-etapa")
        ? tempo.payload
        : porChave[queryKey[0]!] ?? [],
      isLoading: false, isError: false, isFetching: false,
      dataUpdatedAt: Date.now(),
    }),
    useQueryClient: () => ({ invalidateQueries: () => {} }),
  };
});

vi.mock("wouter", () => ({ useLocation: () => ["/analises", () => {}] }));

/* Importado UMA vez, fora de qualquer teste: puxar a tela (com o recharts
   junto) custa alguns segundos, e pago dentro do primeiro `it` esse custo
   estourava o timeout padrão quando a suíte inteira roda em paralelo — o teste
   falhava por carga da máquina, não por defeito da tela. */
const { default: DashboardAnalises } = await import("@/pages/dashboard-analises");
vi.setConfig({ testTimeout: 20_000 });

async function abrirTela() {
  const r = render(h(DashboardAnalises));
  // O período padrão é resolvido num efeito, depois que os dados chegam.
  await act(async () => { await Promise.resolve(); });
  return r;
}

beforeEach(() => {
  celular.valor = false;
  // Sem base é o PADRÃO: nenhum teste desta suíte fala do bloco de tempo, e o
  // bloco não pode aparecer por acidente no meio de quem mede a faixa.
  tempo.payload = null;
  window.history.replaceState(null, "", "/analises");
});
afterEach(() => { cleanup(); });

describe("faixa de filtros — cada controle diz o recorte, uma vez só", () => {
  it("o gatilho carrega o recorte e o rótulo em caixa alta não é repetido acima", async () => {
    const { getByTestId, container } = await abrirTela();
    const periodo = getByTestId("select-period");
    expect(periodo.textContent).toContain("últimos 30 dias");

    // O rótulo do campo agora existe só no nome acessível e no ícone; nenhum
    // texto visível repete "Período"/"Patrocinador" ao lado do gatilho que já
    // os diz. (Antes: um <span> em caixa alta por campo, mais uma linha de
    // altura na primeira dobra.)
    expect(periodo.getAttribute("aria-label")).toBe("Período: Saídas nos últimos 30 dias");
    const rotulosSoltos = Array.from(container.querySelectorAll("span"))
      .filter((s) => s.children.length === 0)
      .map((s) => (s.textContent || "").trim())
      .filter((t) => t === "Período" || t === "Evento" || t === "Patrocinador");
    expect(rotulosSoltos).toEqual([]);
  });

  it("o texto do gatilho fica à esquerda — sem o esticão que o centralizava", async () => {
    // `fullWidth` põe `justify-content: space-between` no botão e `flex: 1` no
    // <span> do rótulo. Com o <span> esticado, o `text-align: center` que o
    // navegador dá a todo <button> passa a aparecer, e o gatilho lia como campo
    // desabilitado. No desktop os três gatilhos crescem com o conteúdo.
    const { getByTestId } = await abrirTela();
    for (const id of ["select-period", "select-event", "select-sponsor"]) {
      const b = getByTestId(id) as HTMLElement;
      expect(b.style.justifyContent, id).toBe("");
      expect(b.style.minWidth, id).toBe("176px");
    }
  });

  it("os três gatilhos partem da mesma largura mínima — a grade vem daí", async () => {
    const { getByTestId } = await abrirTela();
    const larguras = ["select-period", "select-event", "select-sponsor"]
      .map((id) => (getByTestId(id) as HTMLElement).style.minWidth);
    expect(new Set(larguras).size).toBe(1);
  });

  it("'Limpar tudo' está sempre desenhado, e apaga quando não há o que limpar", async () => {
    // Antes: "SEM FILTROS" solto em cinza (um rótulo de estado com cara de
    // botão desligado) e o botão de limpar só aparecendo depois que já havia
    // algo errado para desfazer.
    const { getByTestId, queryByText } = await abrirTela();
    const limpar = getByTestId("btn-clear-filters") as HTMLButtonElement;
    expect(limpar.textContent).toContain("Limpar tudo");
    expect(queryByText(/sem filtros/i)).toBeNull();

    // Na abertura há o período padrão para limpar; depois de limpo, o botão
    // continua desenhado — apagado, no mesmo lugar.
    expect(limpar.disabled).toBe(false);
    await act(async () => { limpar.click(); });
    expect((getByTestId("btn-clear-filters") as HTMLButtonElement).disabled).toBe(true);
  });

  it("a linha de escopo declara o recorte, diz de onde veio o padrão, e é aria-live", async () => {
    const { getByTestId } = await abrirTela();
    const recorte = getByTestId("recorte-analises");
    expect(recorte.getAttribute("aria-live")).toBe("polite");
    // Na abertura o único filtro ligado é o padrão, e ninguém o escolheu:
    // "1 filtro ativo" seria verdade sem ser honesto.
    expect(recorte.textContent).toContain("Período padrão");
    // 3 de 5 peças — Σ quantidade, não linhas.
    expect(recorte.textContent).toContain("3");
    expect(recorte.textContent).toContain("5");

    // Tocar no recorte devolve a contagem normal.
    await act(async () => { (getByTestId("btn-clear-filters") as HTMLElement).click(); });
    expect(getByTestId("recorte-analises").textContent).not.toContain("Período padrão");
  });

  it("o menu de período abre sem caixa de busca", async () => {
    // Quatro opções fixas não são uma lista para procurar — e o campo ainda
    // roubava o foco de quem só queria escolher com as setas.
    const { getByTestId, container } = await abrirTela();
    await act(async () => { (getByTestId("select-period") as HTMLElement).click(); });
    expect(container.querySelector('input[type="text"]')).toBeNull();
  });
});

describe("a tela abre respondendo", () => {
  it("resolve um período padrão com janela anterior de verdade", async () => {
    const { getByTestId } = await abrirTela();
    // Nenhum dos quatro KPIs pode abrir pedindo configuração.
    for (const id of ["kpi-prazo", "kpi-ciclo", "kpi-retrabalho", "kpi-m2"]) {
      expect(getByTestId(id).textContent, id).not.toContain("Escolha um período");
    }
  });

  it("o padrão vai para a URL — o recorte que se vê é o que se compartilha", async () => {
    await abrirTela();
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(window.location.search).toContain("periodo=30d");
  });

  it("um período vindo da URL manda no padrão", async () => {
    window.history.replaceState(null, "", "/analises?periodo=7d");
    const { getByTestId } = await abrirTela();
    expect(getByTestId("select-period").textContent).toContain("últimos 7 dias");
  });

  it("'all' explícito na URL é respeitado — o padrão não sequestra a escolha", async () => {
    window.history.replaceState(null, "", "/analises?periodo=all");
    const { getByTestId } = await abrirTela();
    expect(getByTestId("select-period").textContent).toContain("Todo o período");
    expect(getByTestId("kpi-prazo").textContent).toContain("Todo o período não tem anterior");
  });
});

describe("blocos que não informam nada não ocupam tela", () => {
  it("sem base no recorte, 'Tempo por etapa' não aparece — nem como lugar reservado", async () => {
    // A regra que o dono estabeleceu ao reprovar o bloco vazio ("dado
    // indisponível, não está nota 10 nunca essa tela") continua valendo depois
    // de o número passar a existir: recorte sem base não ganha bloco.
    tempo.payload = {
      etapas: [],
      etapasSemBase: [{ key: "layouts", label: "Entrega de Layouts", pecas: 2 }],
      pecasNoRecorte: 3, pecasMedidas: 2, medicaoDesde: null, logsLidos: 4, truncado: false,
    };
    const { queryByText, container } = await abrirTela();
    expect(queryByText(/Tempo por etapa/)).toBeNull();
    expect(queryByText(/Dado indispon/i)).toBeNull();
    expect(container.textContent).not.toContain("— dias");
  });

  it("resposta ainda não carregada também não desenha bloco (nem derruba a tela)", async () => {
    tempo.payload = undefined;
    const { queryByText, container } = await abrirTela();
    expect(queryByText(/Tempo por etapa/)).toBeNull();
    expect(container.querySelector("#h-ofensores")).not.toBeNull();
  });

  it("com base, o bloco volta COM número e declara sobre quantas peças", async () => {
    tempo.payload = {
      etapas: [
        { key: "layouts", label: "Entrega de Layouts", medianaDias: 9, pecas: 40, planejadoDias: 5, deltaDias: 4, emAberto: 3 },
      ],
      etapasSemBase: [],
      pecasNoRecorte: 120, pecasMedidas: 44,
      medicaoDesde: "2026-05-02T10:00:00.000Z", logsLidos: 900, truncado: false,
    };
    const { getByTestId, container } = await abrirTela();
    expect(container.querySelector("#h-tempo")).not.toBeNull();
    expect(getByTestId("tempo-etapa-layouts").textContent).toContain("9 dias");
    // Denominador visível: a regra da tela é que nenhum número entra sozinho.
    expect(getByTestId("tempo-cobertura").textContent).toContain("44 de 120 peças");
    expect(getByTestId("tempo-etapa-layouts").textContent).toContain("além do plano");
  });

  it("o que é conteúdo real continua de pé", async () => {
    const { getByTestId, container } = await abrirTela();
    expect(container.querySelector("#h-carga")).not.toBeNull();
    expect(container.querySelector("#h-ofensores")).not.toBeNull();
    expect(getByTestId("kpi-prazo")).toBeTruthy();
    expect(getByTestId("button-export-analises")).toBeTruthy();
    // A tela se atualiza sozinha: não existe botão "Atualizar" aqui.
    expect(container.textContent).not.toContain("Atualizar");
  });
});

describe("celular", () => {
  it("os filtros viram gaveta atrás de um botão que carrega o contador", async () => {
    celular.valor = true;
    const { getByTestId, queryByTestId } = await abrirTela();
    const botao = getByTestId("button-toggle-filtros");
    // O contador vive no botão para que "tenho filtro ligado" sobreviva com a
    // gaveta fechada.
    expect(botao.textContent).toContain("1");
    expect(queryByTestId("painel-filtros-mobile")).toBeNull();

    await act(async () => { (botao as HTMLElement).click(); });
    expect(queryByTestId("painel-filtros-mobile")).not.toBeNull();
    expect(getByTestId("select-period")).toBeTruthy();
  });
});
