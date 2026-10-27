// ANÁLISES › PROBLEMAS OPERACIONAIS — atrasadas, fura-fila,
// refações/reproduções e layouts reprovados, entre as peças EM ABERTO dos
// eventos ativos; por evento e peça a peça.
//
// PEÇAS SEM APROVAÇÃO (Pedro/dono, 26/10):
//   · RF09 — o atraso separado por responsável: "Atraso interno" × "Atraso do
//     cliente" (RN09: a peça com "Arte do cliente" sem o arquivo depois do
//     Layout ajustado). "Atrasadas" segue sendo a soma das duas;
//   · RF10 — o indicador "Aguardando arte do cliente": quantas peças e há
//     quantos dias, em média, esperam o arquivo, por evento.
// A regra é a de @shared/painel-operacional (`pecasComProblema`,
// `problemasPorEvento`, `aguardandoArtePorEvento`); aqui só se desenha.
import * as React from "react";
import { AlertTriangle, Flag, Hourglass, RefreshCcw, ThumbsDown, UserX } from "lucide-react";
import {
  FASE_ENTREGUE, aguardandoArtePorEvento, pecasComProblema, problemasPorEvento, rotuloDaEtapaNoPainel,
  type AguardandoArteDoEvento, type PecaDaLinha, type TipoDeProblema,
} from "@shared/painel-operacional";
import { ROTULO_AGUARDANDO_ARTE, ROTULO_ATRASO_DO_CLIENTE, ROTULO_ATRASO_INTERNO } from "@shared/prazo-sem-aprovacao";
import { CartaoKpi } from "@/components/ui/cartao-kpi";
import { T, TOM, FS, FW } from "@/lib/theme";
import { COR_DO_ATRASO_DO_CLIENTE, TOM_DO_ATRASO_DO_CLIENTE } from "@/components/selo-sem-aprovacao";
import { GradeDeNumeros, SecaoDaAnalise, TabelaCompacta, idDaPeca } from "../blocos";
import {
  AtrasoDaLinha, BarrasEmpilhadas, COR, Campo, CelulaDaPeca, Chips, FaixaDeControles, FiltroDeEvento, NomeDoEvento,
  PrazoDaLinha, SimNao, StatusDaLinha, Vazio, fmt0, fmt1, opcoesDeEvento,
} from "../comum";
import type { ContextoDoPainel } from "../contexto";

const TIPOS: { id: TipoDeProblema; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" }, { id: "atraso", rotulo: "Atrasadas" },
  { id: "atrasoInterno", rotulo: ROTULO_ATRASO_INTERNO }, { id: "atrasoCliente", rotulo: ROTULO_ATRASO_DO_CLIENTE },
  { id: "fura", rotulo: "Fura-fila" }, { id: "refacao", rotulo: "Refações / reproduções" }, { id: "reprovada", rotulo: "Reprovadas" },
];

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

export default function AbaProblemas({ ctx }: { ctx: ContextoDoPainel }) {
  const { painel, isMobile, abrirEvento } = ctx;
  const { resumo } = painel;
  const [tipo, setTipo] = React.useState<TipoDeProblema>("todos");
  const [evento, setEvento] = React.useState<string | null>(null);
  const tabelaRef = React.useRef<HTMLDivElement>(null);
  const aguardandoRef = React.useRef<HTMLDivElement>(null);

  const porEvento = React.useMemo(() => problemasPorEvento(painel.pecas).slice(0, 15), [painel.pecas]);
  const aguardando = React.useMemo(() => aguardandoArtePorEvento(painel.pecas), [painel.pecas]);
  const lista = React.useMemo(() => pecasComProblema(painel.pecas, tipo, evento), [painel.pecas, tipo, evento]);
  const opcoes = React.useMemo(() => opcoesDeEvento(painel.eventos.map((e) => e.chave), painel.nomes), [painel]);
  const contagem = React.useMemo(() => {
    const c = {} as Record<TipoDeProblema, number>;
    for (const t of TIPOS) c[t.id] = pecasComProblema(painel.pecas, t.id, evento).length;
    return c;
  }, [painel.pecas, evento]);
  const irParaLista = (t: TipoDeProblema) => {
    setTipo(t);
    setTimeout(() => tabelaRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 50);
  };

  const atrasoInterno = resumo.atrasadasAbertas - resumo.atrasoClienteAbertas;
  const atrasoCliente = resumo.atrasoClienteAbertas;
  const totalAguardando = resumo.aguardandoArteAbertas;
  // A média geral de espera: sobre as peças que têm o carimbo da marcação.
  const esperas = painel.pecas.filter((p) => p.aguardandoArteCliente && p.fase < FASE_ENTREGUE && p.diasAguardandoArte != null).map((p) => p.diasAguardandoArte as number);
  const mediaGeral = esperas.length ? Math.round((esperas.reduce((s, d) => s + d, 0) / esperas.length) * 10) / 10 : null;

  return (
    <div data-testid="aba-painel-problemas" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section aria-labelledby="h-op-prob-kpis">
        <h2 id="h-op-prob-kpis" className="sr-only">Problemas em aberto</h2>
        <GradeDeNumeros minimo={isMobile ? 150 : 190} rotulo="Problemas em aberto">
          <CartaoKpi data-testid="op-kpi-atraso-interno" rotulo={ROTULO_ATRASO_INTERNO} icone={AlertTriangle} valor={fmt0(atrasoInterno)} tom={atrasoInterno > 0 ? "perigo" : "neutro"}
            sub={resumo.atrasadasAbertas > 0 ? `${fmt0(atrasoInterno)} de ${fmt0(resumo.atrasadasAbertas)} atrasadas · prazo da fase vencido` : "Prazo da fase atual vencido"}
            navegacao={atrasoInterno > 0} onClick={atrasoInterno > 0 ? () => irParaLista("atrasoInterno") : undefined} />
          <CartaoKpi data-testid="op-kpi-atraso-cliente" rotulo={ROTULO_ATRASO_DO_CLIENTE} icone={UserX} valor={fmt0(atrasoCliente)} tom={atrasoCliente > 0 ? TOM_DO_ATRASO_DO_CLIENTE : "neutro"}
            sub="Arte do cliente não chegou até o Layout ajustado"
            navegacao={atrasoCliente > 0} onClick={atrasoCliente > 0 ? () => irParaLista("atrasoCliente") : undefined} />
          <CartaoKpi data-testid="op-kpi-aguardando-arte" rotulo={ROTULO_AGUARDANDO_ARTE} icone={Hourglass} valor={fmt0(totalAguardando)} tom={totalAguardando > 0 ? "turquesa" : "neutro"}
            sub={totalAguardando > 0 && mediaGeral != null ? `Espera média de ${fmt1(mediaGeral)} ${plural(mediaGeral, "dia", "dias")}` : "Peças esperando o arquivo do cliente"}
            navegacao={totalAguardando > 0}
            onClick={totalAguardando > 0 ? () => setTimeout(() => aguardandoRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 0) : undefined} />
          <CartaoKpi data-testid="op-kpi-fura-fila" rotulo="Fura-fila em aberto" icone={Flag} valor={fmt0(resumo.furaFilaAbertas)} tom={resumo.furaFilaAbertas > 0 ? "alerta" : "neutro"}
            sub="Peças prioritárias" navegacao={resumo.furaFilaAbertas > 0} onClick={resumo.furaFilaAbertas > 0 ? () => irParaLista("fura") : undefined} />
          <CartaoKpi data-testid="op-kpi-refacoes" rotulo="Refações / reproduções" icone={RefreshCcw} valor={fmt0(resumo.refacoesAbertas)} tom={resumo.refacoesAbertas > 0 ? "roxo" : "neutro"}
            sub="Complementos: avaria, perda, quantidade, cliente" navegacao={resumo.refacoesAbertas > 0} onClick={resumo.refacoesAbertas > 0 ? () => irParaLista("refacao") : undefined} />
          <CartaoKpi data-testid="op-kpi-reprovadas" rotulo="Layouts reprovados" icone={ThumbsDown} valor={fmt0(resumo.reprovadasAbertas)} tom={resumo.reprovadasAbertas > 0 ? "turquesa" : "neutro"}
            sub="Reprovados e ainda em aberto" navegacao={resumo.reprovadasAbertas > 0} onClick={resumo.reprovadasAbertas > 0 ? () => irParaLista("reprovada") : undefined} />
        </GradeDeNumeros>
      </section>

      <SecaoDaAnalise id="h-op-prob-ev" testId="op-prob-evento" titulo="Problemas por evento" descricao="Peças em aberto de cada evento ativo (os 15 com mais problemas). O atraso vem separado: interno (da casa) e do cliente (a arte do cliente que não chegou). Clique num evento para filtrar a lista abaixo.">
        <BarrasEmpilhadas
          testId="op-barras-problemas"
          legenda="Problemas por evento"
          linhas={porEvento.map((r) => ({
            id: r.evento, rotulo: painel.nomes[r.evento] ?? r.evento,
            partes: { atrasoInterno: r.atrasoInterno, atrasoCliente: r.atrasoCliente, furaFila: r.furaFila, refacoes: r.refacoes, reprovadas: r.reprovadas },
          }))}
          series={[
            { chave: "atrasoInterno", nome: ROTULO_ATRASO_INTERNO, cor: COR.atrasado },
            { chave: "atrasoCliente", nome: ROTULO_ATRASO_DO_CLIENTE, cor: COR.atrasoCliente },
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

      <div ref={aguardandoRef} style={{ scrollMarginTop: 12 }}>
        <SecaoDaAnalise
          id="h-op-prob-aguardando"
          testId="op-aguardando-arte"
          titulo={ROTULO_AGUARDANDO_ARTE}
          descricao={totalAguardando > 0 ? (
            <span data-testid="op-aguardando-arte-resumo">
              <strong style={{ color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmt0(totalAguardando)}</strong> {plural(totalAguardando, "peça marcada", "peças marcadas")} “Arte do cliente” ainda sem o arquivo
              {mediaGeral != null ? <>, esperando em média <strong style={{ color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmt1(mediaGeral)} {plural(mediaGeral, "dia", "dias")}</strong></> : null}
              {atrasoCliente > 0 ? <> — <strong style={{ color: COR_DO_ATRASO_DO_CLIENTE.text, fontVariantNumeric: "tabular-nums" }}>{fmt0(atrasoCliente)}</strong> já {plural(atrasoCliente, "passou", "passaram")} do Layout ajustado (atraso do cliente)</> : null}
              . Dias contados desde a marcação. Clique no evento para abrir o status dele.
            </span>
          ) : "Peças com “Arte do cliente” que ainda esperam o arquivo, por evento."}
        >
          {aguardando.length === 0 ? (
            <Vazio testId="op-aguardando-arte-vazio">Nenhuma peça aguardando arte do cliente.</Vazio>
          ) : (
            <TabelaCompacta<AguardandoArteDoEvento>
              testId="op-tabela-aguardando-arte"
              legenda="Peças aguardando arte do cliente por evento, com os dias médios de espera"
              linhas={aguardando}
              chave={(r) => r.evento}
              limite={10}
              minLargura={520}
              ordemInicial={{ coluna: "pecas", direcao: "desc" }}
              aoClicarLinha={(r) => abrirEvento(r.evento)}
              colunas={[
                { id: "evento", rotulo: "Evento", ordenavel: true, valor: (r) => painel.nomes[r.evento] ?? r.evento,
                  render: (r) => <NomeDoEvento nome={painel.nomes[r.evento] ?? r.evento} aoAbrir={() => abrirEvento(r.evento)} testId="op-aguardando-arte-evento" /> },
                { id: "pecas", rotulo: "Peças", alinhar: "direita", ordenavel: true, valor: (r) => r.pecas },
                { id: "dias", rotulo: "Espera média (dias)", titulo: "Média dos dias desde a marcação “Arte do cliente” (só as peças com a data da marcação)", alinhar: "direita", ordenavel: true,
                  valor: (r) => r.diasMedios, render: (r) => (r.diasMedios == null ? <span style={{ color: T.second }}>—</span> : fmt1(r.diasMedios)) },
                { id: "atrasadas", rotulo: ROTULO_ATRASO_DO_CLIENTE, alinhar: "direita", ordenavel: true, valor: (r) => r.atrasadas,
                  render: (r) => <span style={{ fontVariantNumeric: "tabular-nums", color: r.atrasadas > 0 ? COR_DO_ATRASO_DO_CLIENTE.text : T.second, fontWeight: r.atrasadas > 0 ? FW.forte : FW.corpo }}>{fmt0(r.atrasadas)}</span> },
              ]}
            />
          )}
        </SecaoDaAnalise>
      </div>

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
              minLargura={1040}
              alturaMaxima={620}
              ordemInicial={{ coluna: "atraso", direcao: "desc" }}
              vazio="Nenhuma peça com esse problema."
              colunas={[
                { id: "peca", rotulo: "Peça", ordenavel: true, valor: (p) => p.displayId, render: (p) => <CelulaDaPeca id={idDaPeca(p)} evento={painel.nomes[p.evento]} isMobile={isMobile} /> },
                { id: "evento", rotulo: "Evento", ordenavel: true, ocultarNoCelular: true, valor: (p) => painel.nomes[p.evento] ?? p.evento },
                { id: "descricao", rotulo: "Descrição", ordenavel: true, ocultarNoCelular: true, valor: (p) => p.descricao || null,
                  render: (p) => <span className="pop-texto-longo" title={p.descricao} style={{ fontSize: FS.body }}>{p.descricao || "—"}</span> },
                { id: "status", rotulo: "Status", ordenavel: true, valor: (p) => rotuloDaEtapaNoPainel(p.etapa), render: (p) => <StatusDaLinha p={p} /> },
                { id: "prazo", rotulo: "Prazo da fase", ordenavel: true, ocultarNoCelular: true, valor: (p) => p.prazoFase, render: (p) => <PrazoDaLinha p={p} /> },
                { id: "atraso", rotulo: "Dias de atraso", alinhar: "direita", ordenavel: true, valor: (p) => p.diasAtraso, render: (p) => <AtrasoDaLinha p={p} /> },
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
