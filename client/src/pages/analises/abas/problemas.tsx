// ANÁLISES › PROBLEMAS OPERACIONAIS — atrasadas, fura-fila,
// refações/reproduções e layouts reprovados, entre as peças EM ABERTO dos
// eventos ativos; por evento e peça a peça.
import * as React from "react";
import { AlertTriangle, Flag, RefreshCcw, ThumbsDown } from "lucide-react";
import {
  pecasComProblema, problemasPorEvento, rotuloDaEtapaNoPainel, type PecaDaLinha, type TipoDeProblema,
} from "@shared/painel-operacional";
import { CartaoKpi } from "@/components/ui/cartao-kpi";
import { TOM, FS, FW, FONT } from "@/lib/theme";
import { GradeDeNumeros, SecaoDaAnalise, TabelaCompacta, idDaPeca } from "../blocos";
import { BarrasEmpilhadas, COR, Campo, CelulaDaPeca, Chips, DiasDeAtraso, FaixaDeControles, FiltroDeEvento, SimNao, dma, fmt0, opcoesDeEvento } from "../comum";
import type { ContextoDoPainel } from "../contexto";

const TIPOS: { id: TipoDeProblema; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" }, { id: "atraso", rotulo: "Atrasadas" }, { id: "fura", rotulo: "Fura-fila" },
  { id: "refacao", rotulo: "Refações / reproduções" }, { id: "reprovada", rotulo: "Reprovadas" },
];

export default function AbaProblemas({ ctx }: { ctx: ContextoDoPainel }) {
  const { painel, isMobile } = ctx;
  const { resumo } = painel;
  const [tipo, setTipo] = React.useState<TipoDeProblema>("todos");
  const [evento, setEvento] = React.useState<string | null>(null);
  const tabelaRef = React.useRef<HTMLDivElement>(null);

  const porEvento = React.useMemo(() => problemasPorEvento(painel.pecas).slice(0, 15), [painel.pecas]);
  const lista = React.useMemo(() => pecasComProblema(painel.pecas, tipo, evento), [painel.pecas, tipo, evento]);
  const opcoes = React.useMemo(() => opcoesDeEvento(painel.eventos.map((e) => e.chave), painel.nomes), [painel]);
  const contagem: Record<TipoDeProblema, number> = React.useMemo(() => {
    const c = (t: TipoDeProblema) => pecasComProblema(painel.pecas, t, evento).length;
    return { todos: c("todos"), atraso: c("atraso"), fura: c("fura"), refacao: c("refacao"), reprovada: c("reprovada") };
  }, [painel.pecas, evento]);
  const irParaLista = (t: TipoDeProblema) => {
    setTipo(t);
    setTimeout(() => tabelaRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 50);
  };

  return (
    <div data-testid="aba-painel-problemas" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section aria-labelledby="h-op-prob-kpis">
        <h2 id="h-op-prob-kpis" className="sr-only">Problemas em aberto</h2>
        <GradeDeNumeros minimo={isMobile ? 150 : 200} rotulo="Problemas em aberto">
          <CartaoKpi data-testid="op-kpi-atrasadas" rotulo="Peças atrasadas" icone={AlertTriangle} valor={fmt0(resumo.atrasadasAbertas)} tom={resumo.atrasadasAbertas > 0 ? "perigo" : "neutro"}
            sub="Prazo da fase atual vencido" navegacao={resumo.atrasadasAbertas > 0} onClick={resumo.atrasadasAbertas > 0 ? () => irParaLista("atraso") : undefined} />
          <CartaoKpi data-testid="op-kpi-fura-fila" rotulo="Fura-fila em aberto" icone={Flag} valor={fmt0(resumo.furaFilaAbertas)} tom={resumo.furaFilaAbertas > 0 ? "alerta" : "neutro"}
            sub="Peças prioritárias" navegacao={resumo.furaFilaAbertas > 0} onClick={resumo.furaFilaAbertas > 0 ? () => irParaLista("fura") : undefined} />
          <CartaoKpi data-testid="op-kpi-refacoes" rotulo="Refações / reproduções" icone={RefreshCcw} valor={fmt0(resumo.refacoesAbertas)} tom={resumo.refacoesAbertas > 0 ? "roxo" : "neutro"}
            sub="Complementos: avaria, perda, quantidade, cliente" navegacao={resumo.refacoesAbertas > 0} onClick={resumo.refacoesAbertas > 0 ? () => irParaLista("refacao") : undefined} />
          <CartaoKpi data-testid="op-kpi-reprovadas" rotulo="Layouts reprovados" icone={ThumbsDown} valor={fmt0(resumo.reprovadasAbertas)} tom={resumo.reprovadasAbertas > 0 ? "turquesa" : "neutro"}
            sub="Reprovados e ainda em aberto" navegacao={resumo.reprovadasAbertas > 0} onClick={resumo.reprovadasAbertas > 0 ? () => irParaLista("reprovada") : undefined} />
        </GradeDeNumeros>
      </section>

      <SecaoDaAnalise id="h-op-prob-ev" testId="op-prob-evento" titulo="Problemas por evento" descricao="Peças em aberto de cada evento ativo (os 15 com mais problemas). Clique num evento para filtrar a lista abaixo.">
        <BarrasEmpilhadas
          testId="op-barras-problemas"
          legenda="Problemas por evento"
          linhas={porEvento.map((r) => ({
            id: r.evento, rotulo: painel.nomes[r.evento] ?? r.evento,
            partes: { atrasadas: r.atrasadas, furaFila: r.furaFila, refacoes: r.refacoes, reprovadas: r.reprovadas },
          }))}
          series={[
            { chave: "atrasadas", nome: "Atrasadas", cor: COR.atrasado },
            { chave: "furaFila", nome: "Fura-fila", cor: COR.furaFila },
            { chave: "refacoes", nome: "Refações", cor: COR.refacao },
            { chave: "reprovadas", nome: "Reprovadas", cor: COR.reprovada },
          ]}
          formato={fmt0}
          vazio="Nenhum problema em aberto nos eventos ativos."
          aoClicar={(l) => { setEvento(l.id); irParaLista(tipo); }}
          rotuloDoClique="Filtrar a lista por este evento"
          selecionada={evento}
        />
      </SecaoDaAnalise>

      <div ref={tabelaRef} style={{ scrollMarginTop: 12 }}>
        <SecaoDaAnalise id="h-op-prob-lista" testId="op-prob-lista" titulo="Peças com problema" descricao={`${fmt0(lista.length)} ${lista.length === 1 ? "peça" : "peças"} neste recorte.`}>
          <FaixaDeControles testId="op-prob-filtros">
            <Campo rotulo="Problema">
              <Chips
                rotulo="Tipo de problema"
                testId="op-prob-tipo"
                tamanho={isMobile ? "toque" : "sm"}
                opcoes={TIPOS.map((t) => ({ ...t, contador: contagem[t.id] }))}
                ativos={[tipo]}
                aoAlternar={(id) => setTipo(id)}
              />
            </Campo>
            <FiltroDeEvento valor={evento} aoMudar={setEvento} opcoes={opcoes} isMobile={isMobile} testId="op-prob-evento-filtro" />
          </FaixaDeControles>
          <div style={{ marginTop: 14 }}>
            <TabelaCompacta<PecaDaLinha>
              testId="op-tabela-problemas"
              larguraDaPrimeira={84}
          encolherAoTransbordar={false}
              legenda="Peças com problema"
              linhas={lista}
              chave={(p) => p.id}
              limite={20}
              minLargura={980}
              alturaMaxima={620}
              ordemInicial={{ coluna: "atraso", direcao: "desc" }}
              vazio="Nenhuma peça com esse problema."
              colunas={[
                { id: "peca", rotulo: "Peça", ordenavel: true, valor: (p) => p.displayId, render: (p) => <CelulaDaPeca id={idDaPeca(p)} evento={painel.nomes[p.evento]} isMobile={isMobile} /> },
                { id: "evento", rotulo: "Evento", ordenavel: true, ocultarNoCelular: true, valor: (p) => painel.nomes[p.evento] ?? p.evento },
                { id: "descricao", rotulo: "Descrição", ordenavel: true, ocultarNoCelular: true, valor: (p) => p.descricao || null,
                  render: (p) => <span className="pop-texto-longo" title={p.descricao} style={{ fontSize: FS.body }}>{p.descricao || "—"}</span> },
                { id: "status", rotulo: "Status", ordenavel: true, valor: (p) => rotuloDaEtapaNoPainel(p.etapa) },
                { id: "prazo", rotulo: "Prazo da fase", ordenavel: true, ocultarNoCelular: true, valor: (p) => p.prazoFase,
                  render: (p) => <span style={{ color: p.diasAtraso > 0 ? TOM.perigo.text : undefined, fontWeight: p.diasAtraso > 0 ? FW.forte : undefined }}>{dma(p.prazoFase)}</span> },
                { id: "atraso", rotulo: "Dias de atraso", alinhar: "direita", ordenavel: true, valor: (p) => p.diasAtraso, render: (p) => <DiasDeAtraso dias={p.diasAtraso} /> },
                { id: "fura", rotulo: "Fura-fila", ordenavel: true, valor: (p) => (p.furaFila ? "Sim" : "Não"), render: (p) => <SimNao sim={p.furaFila} /> },
                { id: "refacao", rotulo: "Refação", ordenavel: true, valor: (p) => (p.refacao ? "Sim" : "Não"), render: (p) => <SimNao sim={p.refacao} /> },
                { id: "motivo", rotulo: "Motivo", ordenavel: true, ocultarNoCelular: true, valor: (p) => p.motivoRefacao || null,
                  render: (p) => <span className="pop-texto-longo" title={p.motivoRefacao} style={{ fontSize: FS.body }}>{p.motivoRefacao || "—"}</span> },
              ]}
            />
          </div>
        </SecaoDaAnalise>
      </div>
    </div>
  );
}
