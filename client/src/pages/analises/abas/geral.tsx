// ANÁLISES › PAINEL GERAL — os seis números, as peças em aberto por
// status, a impressão realizada × planejada e os eventos ativos (o clique no
// evento abre "Status por evento").
import * as React from "react";
import { AlertTriangle, CalendarClock, Layers, Printer, Ruler, Truck } from "lucide-react";
import { abertasPorStatus, impressaoRealizadoXPlanejado, type EventoDoPainel } from "@shared/painel-operacional";
import { CartaoKpi } from "@/components/ui/cartao-kpi";
import { T, FS, FW } from "@/lib/theme";
import { GradeDeNumeros, SecaoDaAnalise, TabelaCompacta } from "../blocos";
import { BarrasEmpilhadas, COR, DiasDeAtraso, GraficoDeDias, NomeDoEvento, SeloDaSituacao, dm, dma, fmt0, fmtM2 } from "../comum";
import type { ContextoDoPainel } from "../contexto";

export default function AbaGeral({ ctx }: { ctx: ContextoDoPainel }) {
  const { painel, abrirEvento, isMobile } = ctx;
  const { kpis, resumo } = painel;
  const status = React.useMemo(() => abertasPorStatus(painel.pecas), [painel.pecas]);
  const serie = React.useMemo(() => impressaoRealizadoXPlanejado(painel), [painel]);

  return (
    <div data-testid="aba-painel-geral" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section aria-labelledby="h-op-kpis">
        <h2 id="h-op-kpis" className="sr-only">Resumo da operação</h2>
        <GradeDeNumeros minimo={isMobile ? 150 : 190} rotulo="Resumo da operação">
          <CartaoKpi data-testid="op-kpi-eventos-atrasados" rotulo="Eventos atrasados" icone={AlertTriangle} valor={fmt0(kpis.atrasados)} tom={kpis.atrasados > 0 ? "perigo" : "neutro"} sub="Alguma fase vencida com peça pendente" />
          <CartaoKpi data-testid="op-kpi-pecas-fora" rotulo="Peças fora do prazo" icone={CalendarClock} valor={fmt0(kpis.pecasAtrasadas)} tom={kpis.pecasAtrasadas > 0 ? "perigo" : "neutro"} sub="Pendentes da fase vencida mais avançada" />
          <CartaoKpi data-testid="op-kpi-saidas" rotulo="Saídas em 7 dias" icone={Truck} valor={fmt0(kpis.saidas7d)} sub="Caminhões de hoje a hoje + 7" />
          <CartaoKpi data-testid="op-kpi-abertas" rotulo="Peças em aberto" icone={Layers} valor={fmt0(resumo.pecasAbertas)} sub="Não entregues, eventos ativos" />
          <CartaoKpi data-testid="op-kpi-m2-7d" rotulo="m² impressos · 7 dias" icone={Printer} valor={fmt0(resumo.m2Impresso7d)} sub="Pelo fim da impressão" />
          <CartaoKpi data-testid="op-kpi-m2-falta" rotulo="m² ainda a imprimir" icone={Ruler} valor={fmt0(resumo.m2AImprimir)} sub="Saldo dos eventos ativos" />
        </GradeDeNumeros>
      </section>

      <div className="pop-grade-2">
        <SecaoDaAnalise id="h-op-status" testId="op-status" titulo="Peças em aberto por status" descricao="Eventos ativos. Em vermelho, as que já passaram do prazo da fase.">
          <BarrasEmpilhadas
            testId="op-status-barras"
            legenda="Peças em aberto por status, no prazo e atrasadas"
            linhas={status.map((s) => ({ id: s.etapa, rotulo: s.rotulo, partes: { noPrazo: s.pecas - s.atrasadas, atrasadas: s.atrasadas } }))}
            series={[{ chave: "noPrazo", nome: "No prazo", cor: COR.prazo }, { chave: "atrasadas", nome: "Atrasadas", cor: COR.atrasado }]}
            formato={fmt0}
            vazio="Nenhuma peça em aberto nos eventos ativos."
          />
        </SecaoDaAnalise>

        <SecaoDaAnalise
          id="h-op-impressao"
          testId="op-impressao"
          titulo="Impressão: realizado × planejado (m² por dia)"
          descricao="Últimas 3 semanas e próximas 3 (dias úteis). O planejado distribui o que falta imprimir até o prazo de produção de cada evento; o que já venceu aparece hoje como atrasado."
        >
          <GraficoDeDias
            testId="op-grafico-impressao"
            legenda="m² impressos por dia nas últimas 3 semanas e m² planejados para as próximas 3"
            dados={serie}
            series={[
              { chave: "realizado", nome: "Realizado", cor: COR.prazo },
              { chave: "planejado", nome: "Planejado", cor: COR.planejado },
              { chave: "atrasado", nome: "Atrasado (acumulado)", cor: COR.atrasado },
            ]}
            formato={fmtM2}
            empilhado
            hoje={painel.hoje}
            altura={isMobile ? 240 : 320}
            vazio="Sem impressão registrada nem planejada neste período."
          />
        </SecaoDaAnalise>
      </div>

      <SecaoDaAnalise id="h-op-eventos" testId="op-eventos" titulo="Eventos ativos" descricao="Clique num evento para abrir o status dele.">
        <TabelaCompacta<EventoDoPainel>
          testId="op-tabela-eventos"
          legenda="Eventos ativos com situação, peças e atraso"
          linhas={painel.eventos}
          chave={(e) => e.chave}
          limite={15}
          minLargura={760}
          ordemInicial={{ coluna: "data", direcao: "asc" }}
          aoClicarLinha={(e) => abrirEvento(e.chave)}
          vazio="Nenhum evento ativo."
          colunas={[
            { id: "evento", rotulo: "Evento", ordenavel: true, valor: (e) => e.nome,
              render: (e) => (
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <NomeDoEvento nome={e.nome} aoAbrir={() => abrirEvento(e.chave)} testId="op-evento-abrir" />
                  {/* No celular as datas saem das colunas e vêm sob o nome. */}
                  {isMobile && <span style={{ fontSize: FS.small, fontWeight: FW.corpo, color: T.second }}>Evento {dm(e.dataEvento)} · saída {dm(e.saidaCaminhao)}</span>}
                </span>
              ) },
            { id: "data", rotulo: "Data do evento", ordenavel: true, ocultarNoCelular: true, valor: (e) => e.dataEvento, render: (e) => dma(e.dataEvento) },
            { id: "saida", rotulo: "Saída caminhão", ordenavel: true, ocultarNoCelular: true, valor: (e) => e.saidaCaminhao, render: (e) => dma(e.saidaCaminhao) },
            { id: "situacao", rotulo: "Situação", ordenavel: true, valor: (e) => e.situacao, render: (e) => <SeloDaSituacao situacao={e.situacao} /> },
            { id: "pecas", rotulo: "Peças", alinhar: "direita", ordenavel: true, ocultarNoCelular: true, valor: (e) => e.totalPecas },
            { id: "entregues", rotulo: "Entregues", alinhar: "direita", ordenavel: true, ocultarNoCelular: true, valor: (e) => e.entregues },
            { id: "atraso", rotulo: "Em atraso", alinhar: "direita", ordenavel: true, valor: (e) => e.pecasEmAtraso,
              render: (e) => <DiasDeAtraso dias={e.pecasEmAtraso} /> },
            { id: "pior", rotulo: "Pior atraso (dias)", alinhar: "direita", ordenavel: true, ocultarNoCelular: true, valor: (e) => e.piorAtrasoDias,
              render: (e) => <span style={{ color: e.piorAtrasoDias > 0 ? undefined : T.second, fontSize: FS.body }}>{fmt0(e.piorAtrasoDias)}</span> },
          ]}
        />
      </SecaoDaAnalise>
    </div>
  );
}
