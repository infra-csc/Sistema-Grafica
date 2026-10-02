// ─────────────────────────────────────────────────────────────────────────────
// ABA "VISÃO GERAL" — a saúde da operação numa olhada.
//
// A ORDEM É A DA PERGUNTA DO GESTOR: (1) está tudo bem? — os seis números;
// (2) onde está a massa? — o fluxo inteiro, da Solicitação à Entrega; (3) o
// que trava? — os maiores gargalos e os eventos com mais atraso; (4) o que
// está esquecido? — as peças paradas há mais tempo. Resumo antes do detalhe,
// e todo número abre as peças que ele conta.
// ─────────────────────────────────────────────────────────────────────────────
import { Activity, AlertTriangle, CheckCircle2, Flag, Hourglass, Lock, ArrowRight } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/estados";
import { T, FS, FW } from "@/lib/theme";
import { DIAS_PARADA, type EtapaNoEstado, type EventoNoEstado } from "@/lib/analises-estado";
import type { ContextoDaAnalise, IdDaAba, PecaDaAnalise } from "../contexto";
import {
  AvisoDeCobertura, BotaoDeContagem, CartaoDeNumero, DistribuicaoDeIdade, FluxoDeEtapas, GradeDeNumeros,
  ListaDePecas, SecaoDaAnalise, TabelaCompacta, TEXTO_DAS_TRAVADAS, fmtDia, fmtDias, fmtInt, plural,
} from "../componentes";

const ABA_DA_FASE: Record<string, IdDaAba | undefined> = {
  solicitacao: "solicitacao", arte: "arte", aprovacao: "aprovacao", revisao: "revisao", grafica: "grafica",
};

function textoDaSaida(e: EventoNoEstado<PecaDaAnalise>): string {
  if (e.saidaDiaMs == null || e.diasParaSaida == null) return "sem data de saída";
  const d = e.diasParaSaida;
  if (d === 0) return `${fmtDia(e.saidaDiaMs)} · sai hoje`;
  if (d > 0) return `${fmtDia(e.saidaDiaMs)} · em ${fmtDias(d)}`;
  return `${fmtDia(e.saidaDiaMs)} · saiu há ${fmtDias(-d)}`;
}

export default function AbaGeral({ ctx }: { ctx: ContextoDaAnalise }) {
  const { estado } = ctx;
  const ativas = estado.ativas;
  const n = ativas.pecas.length;
  const filtrado = ctx.pecas.length !== ctx.todasAsPecas.length;

  if (estado.total.length === 0) {
    return (
      <EstadoVazio
        testId="geral-vazio"
        titulo={filtrado ? "Nenhuma peça neste recorte" : "Nenhuma peça cadastrada"}
        descricao={filtrado ? "Os filtros do topo esvaziaram a lista." : "Quando houver peças, o estado de cada fase aparece aqui."}
        acao={filtrado ? <Botao tamanho="toque" onClick={ctx.limparFiltros}>Limpar os filtros e ver tudo</Botao> : undefined}
      />
    );
  }

  const rec = estado.entreguesRecentes;
  const avaliaveis = rec.noPrazo.length + rec.foraDoPrazo.length;
  const pctNoPrazo = avaliaveis > 0 ? Math.round((rec.noPrazo.length / avaliaveis) * 100) : null;
  const pior = ativas.piorAtraso;

  const gargalos = estado.maioresFilas.slice(0, 6);
  const eventosComAtraso = estado.porEvento.filter((e) => e.atrasadas.length > 0);

  return (
    <div data-testid="aba-geral" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* (1) ESTÁ TUDO BEM? */}
      <section aria-labelledby="h-geral-saude">
        <h2 id="h-geral-saude" className="sr-only">Saúde da operação</h2>
        <GradeDeNumeros minimo={ctx.isMobile ? 150 : 200} rotulo="Saúde da operação" testId="geral-kpis">
          <CartaoDeNumero
            ctx={ctx} testId="kpi-em-andamento" rotulo="Em andamento" icone={Activity}
            pecas={ativas.pecas} titulo="Peças em andamento"
            sub={ativas.diasMediana != null ? `Mediana de ${fmtDias(ativas.diasMediana)} na etapa` : "Sem registro de idade"}
          />
          <CartaoDeNumero
            ctx={ctx} testId="kpi-atrasadas" rotulo="Atrasadas na etapa" icone={AlertTriangle} tom="perigo"
            pecas={ativas.atrasadas} titulo="Atrasadas na etapa" subtitulo="Passaram do prazo da etapa em que estão"
            sub={pior ? `A pior venceu há ${fmtDias(pior.diasDeAtraso)}` : "Nenhuma passou do prazo da etapa"}
          />
          <CartaoDeNumero
            ctx={ctx} testId="kpi-paradas" rotulo={`Paradas ${DIAS_PARADA}+ dias`} icone={Hourglass} tom="alerta"
            pecas={ativas.paradas} titulo={`Paradas há ${DIAS_PARADA} dias ou mais na mesma etapa`}
            sub={n > 0 ? `${Math.round((ativas.paradas.length / n) * 100)}% das em andamento` : "—"}
          />
          <CartaoDeNumero
            ctx={ctx} testId="kpi-travadas" rotulo={TEXTO_DAS_TRAVADAS.rotulo} icone={Lock} tom="roxo"
            pecas={ativas.travadas} titulo={TEXTO_DAS_TRAVADAS.titulo} subtitulo={TEXTO_DAS_TRAVADAS.subtitulo}
            sub={TEXTO_DAS_TRAVADAS.sub}
          />
          <CartaoDeNumero
            ctx={ctx} testId="kpi-prioritarias" rotulo="Prioritárias" icone={Flag} tom="laranja"
            pecas={ativas.prioritarias} titulo="Prioritárias em andamento"
            sub={(() => {
              const at = ativas.prioritarias.filter((p) => ctx.leitura(p).atrasada).length;
              return at > 0 ? `${fmtInt(at)} ${plural(at, "atrasada", "atrasadas")}` : "Nenhuma atrasada";
            })()}
          />
          <CartaoDeNumero
            ctx={ctx} testId="kpi-entregues" rotulo={`Entregues em ${rec.janelaDias} dias`} icone={CheckCircle2} tom="sucesso"
            pecas={rec.pecas} titulo={`Entregues nos últimos ${rec.janelaDias} dias`}
            sub={pctNoPrazo != null ? `${pctNoPrazo}% até a saída do caminhão` : "Sem saída para comparar"}
            acaoSecundaria={rec.foraDoPrazo.length > 0 ? (
              <BotaoDeContagem
                ctx={ctx} pecas={rec.foraDoPrazo} tom="perigo" sufixo=" depois da saída"
                titulo={`Entregues depois da saída do caminhão (últimos ${rec.janelaDias} dias)`}
                rotulo="Entregues depois da saída do caminhão" testId="kpi-entregues-fora"
              />
            ) : undefined}
          />
        </GradeDeNumeros>
      </section>

      {/* (2) ONDE ESTÁ A MASSA, e (3) O QUE TRAVA */}
      {/* As duas colunas terminam JUNTAS: a grade estica as duas, e a última
          seção da direita cresce até o fim (antes a direita acabava ~350px
          antes do fluxo, deixando um buraco na dobra de 1366). */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(480px, 100%), 1fr))", gap: 20, alignItems: "stretch" }}>
        <SecaoDaAnalise
          id="h-geral-fluxo"
          testId="geral-fluxo"
          titulo="O fluxo inteiro"
          descricao={<>Onde estão as <strong style={{ color: T.text }}>{fmtInt(n)}</strong> peças em andamento, etapa por etapa. Cada número abre as peças; o nome da fase leva à aba dela.</>}
        >
          <FluxoDeEtapas
            ctx={ctx}
            etapas={estado.porEtapa}
            aoAbrirFase={(fase) => { const a = ABA_DA_FASE[fase]; if (a) ctx.irParaAba(a); }}
          />
        </SecaoDaAnalise>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          <SecaoDaAnalise
            id="h-geral-gargalos"
            testId="geral-gargalos"
            titulo="Maiores gargalos"
            descricao="As etapas com mais peças paradas agora. Clique na linha para abrir a aba da fase."
          >
            <TabelaCompacta<EtapaNoEstado<PecaDaAnalise>>
              testId="tabela-gargalos"
              legenda="Etapas com mais peças em andamento"
              minLargura={420}
              linhas={gargalos}
              chave={(e) => e.etapa}
              limite={6}
              vazio="Nenhuma peça em andamento."
              aoClicarLinha={(e) => { const a = e.fase ? ABA_DA_FASE[e.fase] : undefined; if (a) ctx.irParaAba(a); }}
              colunas={[
                { id: "etapa", rotulo: "Etapa", valor: (e) => e.rotulo },
                {
                  id: "pecas", rotulo: "Peças", alinhar: "direita", valor: (e) => e.pecas.length,
                  render: (e) => (
                    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
                      <BotaoDeContagem ctx={ctx} pecas={e.pecas} titulo={e.rotulo} forte />
                      <span style={{ fontSize: FS.small, color: T.second }}>{n > 0 ? `${Math.round((e.pecas.length / n) * 100)}%` : ""}</span>
                    </span>
                  ),
                },
                { id: "atrasadas", rotulo: "Atrasadas", alinhar: "direita", valor: (e) => e.atrasadas.length,
                  render: (e) => <BotaoDeContagem ctx={ctx} pecas={e.atrasadas} tom="perigo" titulo={`${e.rotulo} — atrasadas na etapa`} /> },
                { id: "mediana", rotulo: "Mediana", alinhar: "direita", ocultarNoCelular: true, titulo: "Mediana de dias na etapa (só peças com registro)",
                  valor: (e) => e.diasMediana, render: (e) => fmtDias(e.diasMediana) },
              ]}
            />
          </SecaoDaAnalise>

          <SecaoDaAnalise
            id="h-geral-idade"
            testId="geral-idade"
            titulo="Há quanto tempo paradas"
            descricao="Dias desde a última mudança de status de cada peça em andamento — a régua da casa: 7 pede olhar, 14 é gargalo."
          >
            <DistribuicaoDeIdade ctx={ctx} grupo={ativas} contexto="em andamento" />
          </SecaoDaAnalise>

          {/* As mais paradas moram AQUI, e não numa faixa larga embaixo: esticar
              a "idade" até a altura do fluxo deixava ~350px vazios dentro dela;
              com as 3 peças mais antigas, a direita termina junto do fluxo — e a
              última seção cresce o que sobrar. A lista inteira está no botão. */}
          <SecaoDaAnalise
            id="h-geral-paradas"
            testId="geral-paradas"
            style={{ flex: "1 1 auto" }}
            titulo="Parado há mais tempo"
            descricao="As peças em andamento há mais dias na mesma etapa, com o prazo de cada uma."
            acoes={ativas.paradas.length > 0 ? (
              <Botao variante="fantasma" tamanho="sm" onClick={() => ctx.abrirPecas(`Paradas há ${DIAS_PARADA} dias ou mais`, ativas.paradas)} data-testid="geral-ver-paradas">
                Ver as {fmtInt(ativas.paradas.length)} paradas {DIAS_PARADA}+ dias
              </Botao>
            ) : undefined}
          >
            <ListaDePecas leituras={estado.maisParadas} limite={3} testId="geral-lista-paradas" vazio="Nenhuma peça em andamento com registro de quando entrou na etapa." />
          </SecaoDaAnalise>
        </div>
      </div>

      <SecaoDaAnalise
        id="h-geral-eventos"
        testId="geral-eventos"
        titulo="Eventos com mais atraso"
        descricao="Os eventos com peças que passaram do prazo da etapa em que estão — os piores primeiro."
        acoes={
          <Botao variante="fantasma" tamanho="sm" onClick={() => ctx.irParaAba("eventos")} data-testid="geral-ver-eventos">
            Todos os eventos
            <ArrowRight aria-hidden="true" style={{ width: 12, height: 12 }} />
          </Botao>
        }
      >
        {eventosComAtraso.length === 0 ? (
          <EstadoVazio compacto tom="sucesso" icone={CheckCircle2} titulo="Nenhum evento com peça atrasada" descricao="Todas as peças em andamento estão dentro do prazo da etapa." testId="geral-eventos-vazio" />
        ) : (
          <TabelaCompacta<EventoNoEstado<PecaDaAnalise>>
            testId="tabela-eventos-atraso"
            legenda="Eventos com peças atrasadas na etapa"
            linhas={eventosComAtraso}
            chave={(e) => e.eventoId}
            limite={6}
            minLargura={680}
            ordemInicial={{ coluna: "atrasadas", direcao: "desc" }}
            colunas={[
              { id: "nome", rotulo: "Evento", ordenavel: true, valor: (e) => e.nome },
              { id: "saida", rotulo: "Saída do caminhão", ordenavel: true, ocultarNoCelular: true, valor: (e) => e.saidaDiaMs,
                render: (e) => <span style={{ color: e.diasParaSaida != null && e.diasParaSaida <= 3 ? undefined : T.second, fontWeight: FW.corpo }}>{textoDaSaida(e)}</span> },
              { id: "pecas", rotulo: "Em andamento", alinhar: "direita", ordenavel: true, valor: (e) => e.pecas.length,
                render: (e) => <BotaoDeContagem ctx={ctx} pecas={e.pecas} titulo={`${e.nome} — em andamento`} /> },
              { id: "atrasadas", rotulo: "Atrasadas", alinhar: "direita", ordenavel: true, valor: (e) => e.atrasadas.length,
                render: (e) => <BotaoDeContagem ctx={ctx} pecas={e.atrasadas} tom="perigo" forte titulo={`${e.nome} — atrasadas na etapa`} /> },
              { id: "pior", rotulo: "Pior atraso", alinhar: "direita", ordenavel: true, ocultarNoCelular: true, valor: (e) => e.piorAtraso?.diasDeAtraso ?? null,
                render: (e) => e.piorAtraso ? <span style={{ color: T.text }}>{fmtDias(e.piorAtraso.diasDeAtraso)}</span> : "—" },
              { id: "travadas", rotulo: "Travadas", alinhar: "direita", ordenavel: true, ocultarNoCelular: true, valor: (e) => e.travadas.length,
                render: (e) => <BotaoDeContagem ctx={ctx} pecas={e.travadas} tom="roxo" titulo={`${e.nome} — travadas`} /> },
            ]}
          />
        )}
      </SecaoDaAnalise>

      <AvisoDeCobertura
        testId="geral-cobertura"
        itens={[
          "\"Atrasada\" é a peça que passou do prazo da ETAPA em que está (os marcos do evento, os mesmos da Gestão de Prazos), não da saída do caminhão.",
          ativas.idade.desconhecida.length > 0 && <>
            <BotaoDeContagem ctx={ctx} pecas={ativas.idade.desconhecida} titulo="Sem registro de quando entrou na etapa" />{" "}
            {plural(ativas.idade.desconhecida.length, "peça não tem", "peças não têm")} registro de quando entrou na etapa: a idade delas é desconhecida, nunca zero.
          </>,
          estado.semPrazo.length > 0 && <>
            <BotaoDeContagem ctx={ctx} pecas={estado.semPrazo} titulo="Em andamento sem prazo (evento sem saída válida)" />{" "}
            {plural(estado.semPrazo.length, "está em evento", "estão em eventos")} sem data de saída válida — sem prazo para medir atraso.
          </>,
          estado.deEventoFinalizado.length > 0 && <>
            <BotaoDeContagem ctx={ctx} pecas={estado.deEventoFinalizado} titulo="Pendentes de eventos encerrados ou já realizados" />{" "}
            {plural(estado.deEventoFinalizado.length, "ficou pendente", "ficaram pendentes")} em eventos encerrados ou já realizados e não {plural(estado.deEventoFinalizado.length, "conta", "contam")} como em andamento.
          </>,
          estado.statusDesconhecido.length > 0 && <>
            <BotaoDeContagem ctx={ctx} pecas={estado.statusDesconhecido} titulo="Status desconhecido" />{" "}
            com status que a régua não reconhece — {plural(estado.statusDesconhecido.length, "ficou", "ficaram")} fora das contas.
          </>,
          estado.foraDoFunil.length > 0 && `Canceladas, excluídas e arquivadas (${fmtInt(estado.foraDoFunil.length)}) não entram em nenhuma conta.`,
        ]}
      />
    </div>
  );
}
