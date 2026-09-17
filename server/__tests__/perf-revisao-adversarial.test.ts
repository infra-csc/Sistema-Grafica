// @vitest-environment jsdom
//
// CORREÇÕES DA REVISÃO ADVERSARIAL DA AUDITORIA DE PERFORMANCE (17/09).
//
// As otimizações de performance ficam; o que este arquivo prende são os
// efeitos colaterais que a revisão achou nelas: foco que caía no <body> no
// último lote da Gráfica, selo de urgência parado nos cartões memoizados,
// retrato do evento refeito a cada tecla, "+N abaixo" velho, página da trilha
// presa sem timer, Login lazy sem fronteira de erro por rota e o staleTime da
// Análise que tinha subido para 5 min sem decisão.
// (O resync do delta e a invalidação durante a primeira carga estão em
// tempo-real-primeira-conexao.test.ts.)
import { describe, it, expect, afterEach } from "vitest";
import * as React from "react";
import { render, act, cleanup } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import { SentinelaDaLista } from "@/components/grafica/lista-incremental";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const h = React.createElement;

afterEach(() => cleanup());

describe("Gráfica: o último \"Mostrar mais\" não joga o foco no <body>", () => {
  function Lista({ total, lote }: { total: number; lote: number }) {
    const [n, setN] = React.useState(lote);
    return h(SentinelaDaLista, { mostradas: Math.min(n, total), total, lote, onMais: () => setN((x) => x + lote) });
  }

  it("clicar no último lote leva o foco ao texto fixo do fim", async () => {
    const { getByTestId, queryByTestId, getByText } = render(h(Lista, { total: 150, lote: 60 }));
    await act(async () => { getByTestId("button-mostrar-mais-pecas").click(); });
    // Ainda falta um lote: o botão continua e o fim não aparece.
    expect(queryByTestId("button-mostrar-mais-pecas")).not.toBeNull();
    const botao = getByTestId("button-mostrar-mais-pecas");
    botao.focus();
    await act(async () => { botao.click(); });
    expect(queryByTestId("button-mostrar-mais-pecas")).toBeNull();
    const fim = getByText("Mostrando todas as 150 peças");
    expect(document.activeElement).toBe(fim);
    expect(fim.getAttribute("tabindex")).toBe("-1");
  });

  it("lista que já nasce completa (ou completa pela rolagem) não mostra texto nem rouba foco", () => {
    const { container } = render(h(SentinelaDaLista, { mostradas: 40, total: 40, lote: 60, onMais: () => {} }));
    expect(container.textContent).toBe("");
    expect(document.activeElement).toBe(document.body);
  });
});

describe("as demais correções (trechos que sustentam a regra)", () => {
  it("Eventos: cartão e linha memoizados leem o relógio de minuto da página, não Date.now()", () => {
    const ev = ler("client/src/pages/eventos.tsx");
    const cartao = ev.slice(ev.indexOf("function EventCard({"), ev.indexOf("const EventCardMemo"));
    const linha = ev.slice(ev.indexOf("function EventRow({"), ev.indexOf("function EventCardActions("));
    expect(cartao).toContain("(departure.getTime() - agoraMs) / 3600000");
    expect(cartao).not.toContain("getTime() - Date.now()");
    expect(linha).toContain("const hoje = new Date(agoraMs);");
    expect(linha).not.toContain("new Date().get");
    expect(ev).toContain("setInterval(() => setAgoraMs(Date.now()), 60_000)");
    expect(ev).toContain("return () => clearInterval(id);");
    expect((ev.match(/agoraMs=\{agoraMs\}/g) ?? []).length).toBe(2);
  });

  it("Painel Geral: o retrato do evento (meta + selo) tem memo próprio, fora do memo dos filtros", () => {
    const pg = ler("client/src/pages/painel-geral.tsx");
    expect(pg).toContain("const { eventMeta, seloDosEventosVivos } = useMemo(() => {");
    expect(pg).toContain("}, [items, hojeNegocioMs]);");
    // o fallback das excluídas trabalha numa CÓPIA — não suja o memo do retrato
    expect(pg).toContain("const seloPorEvento = new Map(seloDosEventosVivos);");
  });

  it("Gestão de Prazos: \"+N abaixo\" recalcula quando o card muda de altura (cobrança/realce)", () => {
    expect(ler("client/src/components/prazos/quadro-coluna.tsx"))
      .toContain("useLayoutEffect(() => { recalcular(); }, [eventos, renderCard, recalcular]);");
  });

  it("Histórico: o lote pendente da trilha tem timer (e ele é cancelado na limpeza)", () => {
    const hi = ler("client/src/pages/historico.tsx");
    expect(hi).toContain("timerDoLote = setTimeout(incorporar, INTERVALO_INCORPORACAO_MS - decorrido)");
    expect(hi).toContain("if (timerDoLote) clearTimeout(timerDoLote);");
  });

  it("casca: Login sem sessão tem fronteira de erro por rota; Alterar Senha usa o loader de página cheia", () => {
    const app = ler("client/src/App.tsx");
    const semSessao = app.slice(app.indexOf('if (!isAuthenticated || location === "/login")'));
    expect(semSessao.slice(0, 600)).toContain("<ErrorBoundary resetKey={location}>");
    expect(app).toContain("<Suspense fallback={<FullPageLoader />}><ProtectedRoute component={ChangePassword} /></Suspense>");
  });

  it("Análises: o acervo volta ao staleTime de 60s (freshness) — os 5 min não foram decididos", () => {
    const da = ler("client/src/pages/dashboard-analises.tsx");
    expect(da).not.toContain("freshnessAcervo");
    expect(da).toContain('useQuery<AnaliseItem[]>({ queryKey: ["/api/items"], ...freshness })');
    expect(da).toContain("ao voltar para a aba e, por segurança, a cada 5 minutos.");
  });

  it("script de índices: segue depois de um comando que falha e sai com código ≠ 0", () => {
    const sc = ler("scripts/indices-performance.mjs");
    expect(sc).toContain("falhas.push(");
    expect(sc).toContain("process.exit(1);");
  });
});
