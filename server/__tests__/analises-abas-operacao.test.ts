// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// AS CINCO ABAS DA OPERAÇÃO DA ANÁLISES — Aprovação, Gráfica, Eventos e
// prazos, Pessoas, Estoque e reaproveitamento — montadas DIRETO com um
// contexto falso (a régua de verdade, lib/analises-estado, sobre peças
// inventadas) e o levantamento do servidor no formato real de
// GET /api/analises/operacao.
//
// O que se prende aqui é o contrato de uso de cada aba:
//   · os números batem com as peças e com o payload do servidor;
//   · todo número que é um conjunto de peças ABRE a gaveta com exatamente
//     aquelas peças (ctx.abrirPecas recebe o array certo);
//   · a aba Pessoas diz, antes de qualquer número, que aquilo é volume de
//     ações e não nota de desempenho — inclusive quando o servidor falha;
//   · a falha do servidor não derruba a aba: a parte das peças continua.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { render, cleanup, act, fireEvent, within } from "@testing-library/react";
import { businessDayMs } from "@/lib/analises-metrics";
import { criarLeitor, resumirEstado } from "@/lib/analises-estado";
import type { OperacaoDaAnalise } from "@shared/analises-operacao-contract";
import type { ContextoDaAnalise, EventoDaAnalise, PecaDaAnalise } from "@/pages/analises/contexto";
import { TEXTO_DAS_TRAVADAS } from "@/pages/analises/componentes";

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

// O celular é ligado por teste (as tabelas leem o hook, não o ctx).
const celular = vi.hoisted(() => ({ valor: false }));
vi.mock("@/hooks/use-mobile", async (original) => ({
  ...(await original<typeof import("@/hooks/use-mobile")>()),
  useIsMobile: () => celular.valor,
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/analises", () => {}],
  Link: ({ href, children, ...resto }: { href: string; children: React.ReactNode }) => h("a", { href, ...resto }, children),
}));

const DIA = 86_400_000;
const hojeMs = businessDayMs(Date.now());
const dia = (n: number) => new Date(hojeMs + n * DIA).toISOString();

// ev1 sai em 9 dias: a Aprovação de Layout (−12) já venceu; a Revisão (−8) e
// a Produção (−1) ainda não. ev2 sai em 60 dias. ev3 não tem data de saída.
const EVENTOS: EventoDaAnalise[] = [
  { id: "ev1", name: "Copa Norte", truckDepartureDate: dia(9), startDate: dia(12), status: "created", createdAt: dia(-60) },
  { id: "ev2", name: "Abertura Sul", truckDepartureDate: dia(60), startDate: dia(63), status: "created", createdAt: dia(-10) },
  { id: "ev3", name: "Sem Data", truckDepartureDate: null, status: "created", createdAt: dia(-10) },
];

const p = (x: Partial<PecaDaAnalise> & { id: string; eventId: string; status: string }): PecaDaAnalise =>
  ({ displayId: x.id.toUpperCase(), type: "Banner", quantity: 1, createdAt: dia(-30), statusChangedAt: dia(-1), sponsors: [], ...x });

const PECAS: PecaDaAnalise[] = [
  // Aprovação: a1 e a2 do ev1 (atrasadas), a3 do ev2 com uma linha devolvida à Arte.
  p({ id: "a1", eventId: "ev1", status: "awaiting_sponsor_approval", statusChangedAt: dia(-20), sponsors: [{ id: "sp1", name: "Banco Aurora", approvalStatus: "pending" }] }),
  p({ id: "a2", eventId: "ev1", status: "awaiting_sponsor_approval", statusChangedAt: dia(-2), sponsors: [{ id: "sp1", name: "Banco Aurora", approvalStatus: "pending" }, { id: "sp2", name: "Cia Beta", approvalStatus: "approved" }] }),
  p({ id: "a3", eventId: "ev2", status: "awaiting_sponsor_approval", sponsors: [{ id: "sp2", name: "Cia Beta", approvalStatus: "awaiting_arte" }, { id: "sp1", name: "Banco Aurora", approvalStatus: "new_version_pending" }] }),
  // Gráfica.
  p({ id: "g1", eventId: "ev1", status: "inProduction", quantity: 10, quantityProduced: 6, conferredQty: 0, printMachine: "1" }), // imprimindo; 6 já esperam conferência
  p({ id: "g2", eventId: "ev1", status: "produced", quantity: 5, quantityProduced: 5 }),
  p({ id: "g5", eventId: "ev1", status: "produced", quantity: 4, quantityProduced: 4, conferredQty: 2 }), // 2 conferidas já esperam embalagem
  p({ id: "g3", eventId: "ev2", status: "conferred", quantity: 4, quantityProduced: 4, conferredQty: 4 }),
  p({ id: "g4", eventId: "ev2", status: "packed", quantity: 2, quantityProduced: 2, conferredQty: 2, embaladaQty: 2 }),
  // Reaproveitamento, os dois esperando a Revisão Final.
  p({ id: "r1", eventId: "ev2", status: "awaiting_final_review", quantity: 3, isReuse: true }),
  p({ id: "r2", eventId: "ev1", status: "awaiting_final_review", quantity: 5, reuseQty: 2 }),
  // Entregue, e uma peça num evento sem data de saída.
  p({ id: "d1", eventId: "ev2", status: "delivered", deliveredAt: dia(-2) }),
  // Linha de aprovação que ficou "pending" numa peça que voltou ao rascunho.
  p({ id: "s1", eventId: "ev3", status: "draft", sponsors: [{ id: "sp1", name: "Banco Aurora", approvalStatus: "pending" }] }),
];

const diasDoPeriodo = (n: number) => Array.from({ length: n }, (_, i) => new Date(hojeMs - (n - 1 - i) * DIA).toISOString().slice(0, 10));

/** O payload no formato REAL do servidor local (02/10). */
const OPERACAO: OperacaoDaAnalise = {
  janela: { de: new Date(hojeMs - 29 * DIA).toISOString(), ate: new Date(hojeMs + DIA).toISOString(), evento: null, patrocinador: null },
  geradoEm: new Date().toISOString(),
  aprovacao: {
    pendentesAgora: 40,
    esperaPorPatrocinador: [
      { sponsorId: "sp1", nome: "Banco Aurora", pecasPendentes: 11, diasMaisAntiga: 0, diasMediana: 0 },
      { sponsorId: "sp9", nome: "Rede Delta", pecasPendentes: 2, diasMaisAntiga: 16, diasMediana: 9 },
    ],
    decididasNoPeriodo: { aprovadas: 2, reprovadas: 4 },
    motivosDeReprovacao: [{ motivo: "Logo fora do padrão do patrocinador", vezes: 4 }, { motivo: "Texto com erro", vezes: 1 }],
    diasAteDecidirMediana: 2.5,
  },
  grafica: {
    porMaquina: [
      { maquina: "Impressora 1 (New XT)", codigo: "1", unidades: 6, m2: 3.24, registros: 2, pecas: 1 },
      { maquina: "Impressora 2", codigo: "2", unidades: 0, m2: 0, registros: 0, pecas: 0 },
      { maquina: "Impressora 3", codigo: "3", unidades: 0, m2: 0, registros: 0, pecas: 0 },
      { maquina: "Impressora 4", codigo: "4", unidades: 0, m2: 0, registros: 0, pecas: 0 },
    ],
    porDia: diasDoPeriodo(30).map((d, i) => ({ dia: d, unidades: i === 28 ? 6 : 0, m2: i === 28 ? 3.24 : 0 })),
    tubos: { abertos: 3, fechados: 1, entreguesNoPeriodo: 5, avulsosAbertos: 2 },
    embaladasPorDia: diasDoPeriodo(30).map((d, i) => ({ dia: d, embaladas: i === 27 ? 4 : 0, entregues: i === 29 ? 2 : 0 })),
  },
  pessoas: {
    porPessoa: [
      { nome: "Ana Arte", papel: "arte", total: 30, porAcao: { "enviar arte": 20, "trocar arte": 10 } },
      { nome: "Gil Gráfica", papel: "grafica", total: 12, porAcao: { imprimir: 8, conferir: 4 } },
      { nome: "Bia Arte", papel: "arte", total: 6, porAcao: { "enviar arte": 5, aprovar: 1 } },
      { nome: "Ex-usuário", papel: null, total: 3, porAcao: { "natureza nova": 3 } },
    ],
    cobertura: { linhasLidas: 50, truncado: true, teto: 50, soAcoesEmPecas: true },
  },
  estoque: {
    ativosPorSituacao: [
      { situacao: "NO_GALPAO", unidades: 120, registros: 40 },
      { situacao: "EM_USO", unidades: 30, registros: 10 },
      { situacao: "DESCARTADO", unidades: 7, registros: 3 },
    ],
    ativosPorCondicao: [{ condicao: "PERFEITO", unidades: 130 }, { condicao: "AVARIA_LEVE", unidades: 20 }],
    reaproveitadas: { pecas: 3, unidades: 30, m2: 12 },
    impressas: { pecas: 9, unidades: 70, m2: 48 },
    pedidosAoEstoque: { abertos: 4, respondidosNoPeriodo: 9 },
    pedidosDePeca: { abertos: 2, atendidosNoPeriodo: 6, recusadosNoPeriodo: 1 },
  },
  arte: { versoesNoPeriodo: {}, pecasComMaisVersoes: [] },
};

function montarCtx(extra: Partial<ContextoDaAnalise> = {}) {
  const hoje = new Date();
  const eventoPorId = new Map(EVENTOS.map((e) => [e.id, e]));
  const leitura = criarLeitor<PecaDaAnalise>(eventoPorId, hoje);
  const estado = resumirEstado(PECAS, leitura, hoje);
  const abrirPecas = vi.fn();
  const ctx: ContextoDaAnalise = {
    pecas: PECAS, todasAsPecas: PECAS, eventos: EVENTOS, eventoPorId,
    patrocinadores: [{ id: "sp1", name: "Banco Aurora" }, { id: "sp2", name: "Cia Beta" }] as ContextoDaAnalise["patrocinadores"],
    filtros: { evento: "all", patrocinador: "all", tipo: "all", soAtrasadas: false, soTravadas: false, soPrioritarias: false },
    operacao: OPERACAO, operacaoCarregando: false, operacaoErro: false,
    leitura, estado, estadoDoTodo: estado, hoje, isMobile: false,
    abrirPecas, irParaAba: vi.fn(), limparFiltros: vi.fn(),
    ...extra,
  };
  return { ctx, abrirPecas };
}
const SEM_SERVIDOR: Partial<ContextoDaAnalise> = { operacao: null, operacaoErro: true };

/** Os ids das peças da ÚLTIMA abertura da gaveta. */
const idsAbertos = (fn: ReturnType<typeof vi.fn>) => (fn.mock.calls.at(-1)?.[1] as PecaDaAnalise[]).map((x) => x.id).sort();

async function clicar(el: HTMLElement) { await act(async () => { fireEvent.click(el); }); }

const { default: AbaAprovacao } = await import("@/pages/analises/abas/aprovacao");
const { default: AbaGrafica } = await import("@/pages/analises/abas/grafica");
const { default: AbaEventos } = await import("@/pages/analises/abas/eventos");
const { default: AbaPessoas } = await import("@/pages/analises/abas/pessoas");
const { default: AbaEstoque } = await import("@/pages/analises/abas/estoque");
vi.setConfig({ testTimeout: 30_000 });

afterEach(() => { cleanup(); celular.valor = false; });

describe("Aprovação", () => {
  it("conta as peças esperando decisão, as atrasadas e as com devolução à Arte — e o número abre as peças", async () => {
    const { ctx, abrirPecas } = montarCtx();
    const r = render(h(AbaAprovacao, { ctx }));
    expect(r.getByTestId("apr-aguardando").textContent).toContain("3");
    expect(r.getByTestId("apr-atrasadas").textContent).toContain("2");
    expect(r.getByTestId("apr-correcao").textContent).toContain("1");
    await clicar(r.getByTestId("apr-atrasadas"));
    expect(idsAbertos(abrirPecas)).toEqual(["a1", "a2"]);
    await clicar(r.getByTestId("apr-correcao"));
    expect(idsAbertos(abrirPecas)).toEqual(["a3"]);
  });

  it("decisões do período, taxa de reprovação e motivos vêm do servidor", () => {
    const { ctx } = montarCtx();
    const r = render(h(AbaAprovacao, { ctx }));
    expect(r.getByTestId("apr-aprovadas").textContent).toContain("2");
    expect(r.getByTestId("apr-reprovadas").textContent).toContain("4");
    expect(r.getByTestId("apr-taxa").textContent).toContain("67%");
    expect(r.getByTestId("apr-mediana").textContent).toContain("2,5 dias");
    expect(r.getByTestId("apr-lista-motivos").textContent).toContain("Logo fora do padrão do patrocinador");
    // Linguagem neutra: a tela não propõe ação sobre o patrocinador.
    expect(r.container.textContent?.toLowerCase()).not.toMatch(/cobr/);
  });

  it("o ranking por patrocinador abre as peças pendentes DAQUELE patrocinador e diz a diferença para o total", async () => {
    const { ctx, abrirPecas } = montarCtx();
    const r = render(h(AbaAprovacao, { ctx }));
    const tabela = r.getByTestId("tabela-apr-patrocinadores");
    // A espera mais longa primeiro.
    const linhas = within(tabela).getAllByTestId("tabela-apr-patrocinadores-linha");
    expect(linhas[0].textContent).toContain("Rede Delta");
    // Banco Aurora: o servidor conta 11; a tela tem 3 em mãos (pending e
    // new_version_pending) — só as que ESTÃO na etapa: a linha pendente que
    // ficou no rascunho (s1) não é espera de decisão. A tela vence no clique.
    const botao = r.getByTestId("apr-pat-sp1");
    expect(botao.textContent).toBe("3");
    expect(linhas[1].textContent).toContain("de 11");
    await clicar(botao);
    expect(idsAbertos(abrirPecas)).toEqual(["a1", "a2", "a3"]);
    // Uma coluna só de peças.
    expect(within(tabela).queryByText("Na Aprovação")).toBeNull();
    // Sem peça em mãos, o número do servidor fica, sem fingir que abre lista.
    expect(within(linhas[0]).queryByRole("button")).toBeNull();
    expect(linhas[0].textContent).toContain("16 dias");
  });

  it("servidor fora: a parte das peças continua de pé", () => {
    const { ctx } = montarCtx(SEM_SERVIDOR);
    const r = render(h(AbaAprovacao, { ctx }));
    expect(r.getAllByTestId("operacao-erro").length).toBeGreaterThan(0);
    expect(r.getByTestId("apr-aguardando").textContent).toContain("3");
    expect(r.getByTestId("tabela-apr-eventos")).toBeTruthy();
  });
});

describe("Gráfica", () => {
  it("as filas de cada mão contam as parciais pela régua da Gráfica, e cada número abre as peças dele", async () => {
    const { ctx, abrirPecas } = montarCtx();
    const r = render(h(AbaGrafica, { ctx }));
    expect(r.getByTestId("gra-na-grafica").textContent).toContain("5");
    expect(r.getByTestId("gra-em-impressao").textContent).toContain("1");
    // A conferir: g2 e g5 pelo status, g1 pelo saldo (6 impressas de 10).
    expect(r.getByTestId("gra-mao-produced").textContent).toBe("3");
    await clicar(r.getByTestId("gra-parcial-produced"));
    expect(idsAbertos(abrirPecas)).toEqual(["g1"]);
    // A embalar: g3 pelo status, g5 pelo saldo (2 conferidas de 4).
    expect(r.getByTestId("gra-mao-conferred").textContent).toBe("2");
    await clicar(r.getByTestId("gra-parcial-conferred"));
    expect(idsAbertos(abrirPecas)).toEqual(["g5"]);
  });

  it("impressoras, produção e volumes vêm do servidor; 'imprimindo agora' abre a peça da máquina", async () => {
    const { ctx, abrirPecas } = montarCtx();
    const r = render(h(AbaGrafica, { ctx }));
    const maquinas = within(r.getByTestId("gra-lista-maquinas")).getAllByTestId("gra-lista-maquinas-item");
    expect(maquinas).toHaveLength(4);
    expect(maquinas[0].textContent).toContain("Impressora 1 (New XT)");
    expect(maquinas[0].textContent).toContain("6 un.");
    expect(maquinas[0].textContent).toContain("3,2 m²");
    await clicar(r.getByTestId("gra-maq-agora-1"));
    expect(idsAbertos(abrirPecas)).toEqual(["g1"]);
    expect(r.getByTestId("gra-total-unidades").textContent).toContain("6");
    expect(r.getByTestId("gra-tubos-abertos").textContent).toContain("3");
    expect(r.getByTestId("gra-tubos-fechados").textContent).toContain("1");
    expect(r.getByTestId("gra-volumes-entregues").textContent).toContain("5");
    expect(r.getByTestId("gra-grafico-producao")).toBeTruthy();
    expect(r.getByTestId("gra-grafico-embalagem")).toBeTruthy();
  });

  it("o cartão de travadas diz a mesma frase da Visão geral", () => {
    const { ctx } = montarCtx();
    const r = render(h(AbaGrafica, { ctx }));
    expect(r.getByTestId("gra-travadas").textContent).toContain(TEXTO_DAS_TRAVADAS.sub);
  });

  it("servidor fora: filas e etapas continuam, os blocos do servidor dizem que falharam", () => {
    const { ctx } = montarCtx(SEM_SERVIDOR);
    const r = render(h(AbaGrafica, { ctx }));
    expect(r.getAllByTestId("operacao-erro")).toHaveLength(3);
    expect(r.getByTestId("gra-mao-produced").textContent).toBe("3");
    expect(r.getByTestId("gra-fluxo")).toBeTruthy();
  });
});

describe("Eventos e prazos", () => {
  it("a matriz evento × etapa tem semáforo e a célula abre as peças daquele evento naquela etapa", async () => {
    const { ctx, abrirPecas } = montarCtx();
    const r = render(h(AbaEventos, { ctx }));
    const celula = r.getByTestId("ev-celula-ev1-aprovacao-1");
    expect(celula.getAttribute("data-semaforo")).toBe("perigo");
    await clicar(within(celula).getAllByRole("button")[0]);
    expect(idsAbertos(abrirPecas)).toEqual(["a1", "a2"]);
    // A Gráfica do ev1 está em dia: sem semáforo de alarme.
    expect(r.getByTestId("ev-celula-ev1-grafica-1").getAttribute("data-semaforo")).toBe("neutro");
    // O evento mais atrasado vem primeiro.
    const linhas = within(r.getByTestId("tabela-ev-matriz")).getAllByTestId("tabela-ev-matriz-linha");
    expect(linhas[0].textContent).toContain("Copa Norte");
  });

  it("'Por etapa' abre uma coluna por etapa", async () => {
    const { ctx, abrirPecas } = montarCtx();
    const r = render(h(AbaEventos, { ctx }));
    await clicar(r.getByTestId("ev-grao-etapa"));
    const celula = r.getByTestId("ev-celula-ev1-produced");
    await clicar(within(celula).getAllByRole("button")[0]);
    expect(idsAbertos(abrirPecas)).toEqual(["g2", "g5"]);
  });

  it("próximas saídas dizem o que falta; evento sem saída é contado à parte", async () => {
    const { ctx, abrirPecas } = montarCtx();
    const r = render(h(AbaEventos, { ctx }));
    // ev1 sai em 9 dias com 6 peças pendentes (a1, a2, g1, g2, g5, r2).
    await clicar(r.getByTestId("ev-falta-ev1"));
    expect(idsAbertos(abrirPecas)).toEqual(["a1", "a2", "g1", "g2", "g5", "r2"]);
    expect(r.queryByTestId("ev-falta-ev2")).toBeNull();
    await clicar(r.getByTestId("ev-sem-saida"));
    expect(idsAbertos(abrirPecas)).toEqual(["s1"]);
  });
});

describe("no celular", () => {
  it("Eventos: sem colunas de etapa nem seletor; a saída vai embaixo do nome", () => {
    celular.valor = true;
    const { ctx } = montarCtx({ isMobile: true });
    const r = render(h(AbaEventos, { ctx }));
    expect(r.queryByTestId("ev-grao-etapa")).toBeNull();
    expect(r.queryByTestId("ev-celula-ev1-aprovacao-1")).toBeNull();
    const saidas = r.getByTestId("tabela-ev-saidas");
    const cab = Array.from(saidas.querySelectorAll("th[scope=col]")).map((t) => t.textContent);
    expect(cab).toEqual(["Evento", "Falta", "Atrasadas"]);
    expect(saidas.textContent).toContain("em 9 dias");
  });

  it("Pessoas: só pessoa, setor e total", () => {
    celular.valor = true;
    const { ctx } = montarCtx({ isMobile: true });
    const r = render(h(AbaPessoas, { ctx }));
    const cab = Array.from(r.getByTestId("tabela-pessoas").querySelectorAll("th[scope=col]")).map((t) => t.textContent?.replace(/[▾▴]/g, "").trim());
    expect(cab).toEqual(["Pessoa", "Setor", "Total"]);
  });
});

describe("Pessoas", () => {
  it("diz que é volume de ações, não nota — e diz a cobertura da trilha", () => {
    const { ctx } = montarCtx();
    const r = render(h(AbaPessoas, { ctx }));
    const aviso = r.getByTestId("pessoas-aviso-volume");
    expect(aviso.textContent).toContain("Volume de ações, não nota de desempenho");
    // O aviso vem ANTES dos números.
    expect(aviso.compareDocumentPosition(r.getByTestId("pessoas-total")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const cobertura = r.getByTestId("pessoas-cobertura").textContent ?? "";
    expect(cobertura).toContain("teto de 50 linhas");
    expect(cobertura).toContain("só contam as ações sobre peças");
  });

  it("totais, setores e a tabela por pessoa, com as naturezas na ordem do contrato e a desconhecida no fim", async () => {
    const { ctx } = montarCtx();
    const r = render(h(AbaPessoas, { ctx }));
    expect(r.getByTestId("pessoas-total").textContent).toContain("51");
    // O que diz algo ao gestor: a ação e o setor que mais aparecem — com rótulo de gente.
    expect(r.getByTestId("pessoas-acao-mais").textContent).toContain("Enviar arte");
    expect(r.getByTestId("pessoas-setor-mais").textContent).toContain("Arte");
    expect(r.getByTestId("pessoas-lista-naturezas").textContent).toContain("Registrar aprovação");
    expect(r.getByTestId("pessoas-n").textContent).toContain("4");
    const setores = r.getByTestId("pessoas-lista-setores").textContent ?? "";
    expect(setores).toContain("Arte");
    expect(setores).toContain("Sem cadastro ligado");
    const tabela = r.getByTestId("tabela-pessoas");
    const cabecalhos = Array.from(tabela.querySelectorAll("th[scope=col]")).map((t) => t.textContent?.replace(/[▾▴]/g, "").trim());
    // As 5 mais frequentes, na ordem do fluxo; a de 1 ação soma em "Demais".
    expect(cabecalhos).toEqual(["Pessoa", "Setor", "Total", "Enviar arte", "Trocar arte", "Imprimir", "Conferir", "Natureza nova", "Demais"]);
    expect(within(tabela).getAllByTestId("tabela-pessoas-linha")[0].textContent).toContain("Ana Arte");
    await clicar(r.getByTestId("pessoas-todas-naturezas"));
    const todas = Array.from(r.getByTestId("tabela-pessoas").querySelectorAll("th[scope=col]")).map((t) => t.textContent?.replace(/[▾▴]/g, "").trim());
    expect(todas).toContain("Aprovação");
    expect(todas).not.toContain("Demais");
    await clicar(r.getByTestId("pessoas-setor-arte"));
    expect(within(r.getByTestId("tabela-pessoas")).getAllByTestId("tabela-pessoas-linha")).toHaveLength(2);
  });

  it("servidor fora: o aviso continua lá", () => {
    const { ctx } = montarCtx(SEM_SERVIDOR);
    const r = render(h(AbaPessoas, { ctx }));
    expect(r.getByTestId("pessoas-aviso-volume")).toBeTruthy();
    expect(r.getByTestId("operacao-erro")).toBeTruthy();
  });
});

describe("Estoque e reaproveitamento", () => {
  it("as peças em andamento com reaproveitamento, integral e parcial, abrem a lista", async () => {
    const { ctx, abrirPecas } = montarCtx();
    const r = render(h(AbaEstoque, { ctx }));
    expect(r.getByTestId("est-com-reuso").textContent).toContain("2");
    expect(r.getByTestId("est-com-reuso").textContent).toContain("5 unidades saem");
    await clicar(r.getByTestId("est-parcial"));
    expect(idsAbertos(abrirPecas)).toEqual(["r2"]);
    await clicar(r.getByTestId("est-integral"));
    expect(idsAbertos(abrirPecas)).toEqual(["r1"]);
    await clicar(r.getByTestId("est-revisao"));
    expect(idsAbertos(abrirPecas)).toEqual(["r1", "r2"]);
  });

  it("reaproveitado × impresso, acervo e pedidos vêm do servidor com os rótulos da casa", () => {
    const { ctx } = montarCtx();
    const r = render(h(AbaEstoque, { ctx }));
    expect(r.getByTestId("est-pct-unidades").textContent).toContain("30%");
    expect(r.getByTestId("est-pct-m2").textContent).toContain("20%");
    expect(r.getByTestId("est-acervo-vivo").textContent).toContain("150");
    const situacao = r.getByTestId("est-lista-situacao").textContent ?? "";
    expect(situacao).toContain("No galpão");
    expect(situacao).toContain("Descartada");
    expect(r.getByTestId("est-lista-condicao").textContent).toContain("Avaria Leve");
    expect(r.getByTestId("est-pedidos-estoque-abertos").textContent).toContain("4");
    expect(r.getByTestId("est-pedidos-peca-recusados").textContent).toContain("1");
  });

  it("com filtro de evento, avisa que o acervo não é recortado; servidor fora não derruba os cartões", () => {
    const { ctx } = montarCtx({ ...SEM_SERVIDOR, filtros: { evento: "ev1", patrocinador: "all", tipo: "all", soAtrasadas: false, soTravadas: false, soPrioritarias: false } });
    const r = render(h(AbaEstoque, { ctx }));
    expect(r.getByTestId("est-cobertura").textContent).toContain("O acervo não tem evento");
    expect(r.getAllByTestId("operacao-erro")).toHaveLength(3);
    expect(r.getByTestId("est-com-reuso").textContent).toContain("2");
  });
});
