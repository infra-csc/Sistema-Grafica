// ─────────────────────────────────────────────────────────────────────────────
// ABA "APROVAÇÃO" — a etapa em que a bola está com o PATROCINADOR (o
// Atendimento registra a decisão dele). O prazo é o marco da Aprovação de
// Layout (−12).
//
// O que olhar aqui: quantas peças esperam decisão e há quanto tempo; EM QUEM
// a decisão está esperando (ranking por patrocinador, do servidor); o que foi
// decidido no período e por que se reprova. É leitura de onde o fluxo está
// parado — a tela não propõe ação sobre o patrocinador, e o texto também não.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { AlertTriangle, CheckCircle2, Flag, Hourglass, RotateCcw, UserCheck } from "lucide-react";
import { EstadoVazio } from "@/components/ui/estados";
import { T, TOM, FS, FW, R } from "@/lib/theme";
import { DIAS_PARADA, ehCorrecaoDaArte, resumirGrupo, type GrupoDePecas } from "@/lib/analises-estado";
import type { AprovacaoDaOperacao } from "@shared/analises-operacao-contract";
import type { ContextoDaAnalise, PecaDaAnalise } from "../contexto";
import {
  AvisoDeCobertura, BlocoDaOperacao, BotaoDeContagem, CartaoDeNumero, DistribuicaoDeIdade, GradeDeNumeros, ListaDeBarras,
  NumeroDoServidor, SecaoDaAnalise, TabelaCompacta, fmtDia, fmtDias, fmtInt, plural, rotuloDaJanela,
} from "../componentes";

/**
 * A linha de aprovação com a bola no patrocinador — a MESMA régua do servidor
 * (pendentesAgora): `awaiting_arte` é a Arte refazendo, não espera de decisão.
 */
const PENDENTE = new Set(["pending", "new_version_pending"]);

type LinhaDoPatrocinador = AprovacaoDaOperacao["esperaPorPatrocinador"][number];

interface LinhaDoEvento {
  eventoId: string;
  nome: string;
  prazoDia: string | null;
  vencido: boolean;
  grupo: GrupoDePecas<PecaDaAnalise>;
  correcao: PecaDaAnalise[];
}

/** 0 dia não é "0 dias" para quem lê: é a decisão que ficou pendente hoje. */
const fraseDeDias = (d: number) => (d < 1 ? "menos de 1 dia" : fmtDias(d));

export default function AbaAprovacao({ ctx }: { ctx: ContextoDaAnalise }) {
  const { estado, leitura } = ctx;
  const fase = estado.porFase.aprovacao;
  const etapa = estado.porEtapa.find((e) => e.etapa === "awaiting_approval");

  const dados = React.useMemo(() => {
    const correcao = fase.pecas.filter(ehCorrecaoDaArte);

    // As peças que a tela tem em mãos com decisão pendente de CADA patrocinador
    // — é o que torna clicável o número do ranking do servidor. A régua é a do
    // servidor: só peça que ESTÁ na etapa de Aprovação (a linha que ficou
    // "pendente" numa peça que voltou ao rascunho não é espera de decisão).
    // Peça de evento já realizado também conta (o servidor não a tira).
    const pendentesPorPatrocinador = new Map<string, PecaDaAnalise[]>();
    for (const p of ctx.pecas) {
      const l = leitura(p);
      if (l.etapa !== "awaiting_approval" || (l.situacao !== "ativa" && l.situacao !== "eventoFinalizado")) continue;
      for (const s of p.sponsors ?? []) {
        if (!s?.id || !PENDENTE.has(String(s.approvalStatus ?? ""))) continue;
        const l = pendentesPorPatrocinador.get(s.id);
        if (l) { if (!l.includes(p)) l.push(p); } else pendentesPorPatrocinador.set(s.id, [p]);
      }
    }

    const porEvento = new Map<string, PecaDaAnalise[]>();
    for (const p of fase.pecas) {
      const l = porEvento.get(p.eventId);
      if (l) l.push(p); else porEvento.set(p.eventId, [p]);
    }
    const eventos: LinhaDoEvento[] = Array.from(porEvento, ([eventoId, ps]) => {
      const ref = ps.map(leitura).find((l) => l.prazo && !l.prazo.cobradaPorOutraEtapa);
      return {
        eventoId,
        nome: leitura(ps[0]).evento?.name ?? "Evento não encontrado",
        prazoDia: ref?.prazo?.dia ?? null,
        vencido: (ref?.prazo?.diasRestantes ?? 0) < 0,
        grupo: resumirGrupo(ps, leitura),
        correcao: ps.filter(ehCorrecaoDaArte),
      };
    });
    return { correcao, pendentesPorPatrocinador, eventos };
  }, [fase.pecas, ctx.pecas, leitura]);

  return (
    <div data-testid="aba-aprovacao" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section aria-labelledby="h-apr-resumo">
        <h2 id="h-apr-resumo" className="sr-only">Resumo da Aprovação</h2>
        <GradeDeNumeros minimo={ctx.isMobile ? 150 : 200} rotulo="Resumo da Aprovação">
          <CartaoDeNumero ctx={ctx} testId="apr-aguardando" rotulo="Em aprovação" icone={UserCheck} pecas={fase.pecas}
            titulo="Aguardando a decisão do patrocinador"
            sub={fase.diasMediana != null ? `Mediana de ${fmtDias(fase.diasMediana)} esperando` : fase.pecas.length ? "Sem registro de idade" : "Nenhuma peça esperando"} />
          <CartaoDeNumero ctx={ctx} testId="apr-atrasadas" rotulo="Atrasadas" icone={AlertTriangle} tom="perigo" pecas={fase.atrasadas}
            titulo="Atrasadas na Aprovação de Layout" subtitulo="Passaram do marco da Aprovação de Layout do evento"
            sub={fase.piorAtraso ? `A pior venceu há ${fmtDias(fase.piorAtraso.diasDeAtraso)}` : "Nenhuma passou do marco"} />
          <CartaoDeNumero ctx={ctx} testId="apr-paradas" rotulo={`Paradas ${DIAS_PARADA}+ dias`} icone={Hourglass} tom="alerta" pecas={fase.paradas}
            titulo={`Esperando decisão há ${DIAS_PARADA} dias ou mais`} sub="Na mesma etapa" />
          <CartaoDeNumero ctx={ctx} testId="apr-correcao" rotulo="Correção na Arte" icone={RotateCcw} tom="alerta" pecas={dados.correcao}
            titulo="Esperando patrocinador com alguma linha devolvida à Arte"
            subtitulo="Um patrocinador reprovou e a Arte refaz; os outros ainda decidem"
            sub="Um reprovou, a Arte refaz" />
          <CartaoDeNumero ctx={ctx} testId="apr-prioritarias" rotulo="Prioritárias" icone={Flag} tom="laranja" pecas={fase.prioritarias}
            titulo="Prioritárias esperando decisão"
            sub={(() => {
              const at = fase.prioritarias.filter((p) => leitura(p).atrasada).length;
              return at > 0 ? `${fmtInt(at)} ${plural(at, "atrasada", "atrasadas")}` : "Nenhuma atrasada";
            })()} />
        </GradeDeNumeros>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: 20, alignItems: "start" }}>
        <SecaoDaAnalise id="h-apr-idade" testId="apr-idade-secao" titulo="Há quanto tempo esperando" descricao="Dias desde que cada peça foi enviada para aprovação (a última mudança de status).">
          <DistribuicaoDeIdade ctx={ctx} grupo={fase} contexto="esperando decisão" testId="apr-idade" />
          {etapa && etapa.porStatus.length > 1 && (
            <p style={{ margin: "12px 0 0", fontSize: FS.small, color: T.second }}>
              Grafias de status nesta etapa:{" "}
              {etapa.porStatus.map((s, i) => (
                <React.Fragment key={s.status}>
                  {i > 0 && " · "}{s.rotulo} <BotaoDeContagem ctx={ctx} pecas={s.pecas} titulo={s.rotulo} />
                </React.Fragment>
              ))}
            </p>
          )}
        </SecaoDaAnalise>

        <SecaoDaAnalise id="h-apr-decisoes" testId="apr-decisoes" titulo="Decisões no período" descricao="O que os patrocinadores decidiram, lido da trilha (a decisão continua contada mesmo depois que a arte é renovada).">
          <BlocoDaOperacao ctx={ctx} titulo="Decisões do período">
            {(op) => {
              const a = op.aprovacao;
              const total = a.decididasNoPeriodo.aprovadas + a.decididasNoPeriodo.reprovadas;
              const taxa = total > 0 ? Math.round((a.decididasNoPeriodo.reprovadas / total) * 100) : null;
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <GradeDeNumeros minimo={140} rotulo={`Decisões ${rotuloDaJanela(op)}`}>
                    <NumeroDoServidor testId="apr-aprovadas" rotulo={`Aprovadas ${rotuloDaJanela(op)}`} valor={a.decididasNoPeriodo.aprovadas} />
                    <NumeroDoServidor testId="apr-reprovadas" rotulo={`Reprovadas ${rotuloDaJanela(op)}`} valor={a.decididasNoPeriodo.reprovadas} />
                    <NumeroDoServidor testId="apr-taxa" rotulo="Taxa de reprovação" valor={taxa == null ? "—" : `${taxa}%`}
                      sub={total > 0 ? `${fmtInt(total)} ${plural(total, "decisão", "decisões")}` : "Nenhuma decisão no período"} />
                    <NumeroDoServidor testId="apr-mediana" rotulo="Mediana até decidir" valor={a.diasAteDecidirMediana == null ? "—" : fraseDeDias(a.diasAteDecidirMediana)}
                      sub="Do envio (ou nova versão) à decisão" />
                  </GradeDeNumeros>
                  {total > 0 && (
                    <div aria-hidden="true" style={{ display: "flex", height: 10, borderRadius: R.pill, overflow: "hidden", backgroundColor: T.low, border: `1px solid ${T.border}` }}>
                      <span style={{ width: `${(a.decididasNoPeriodo.aprovadas / total) * 100}%`, backgroundColor: TOM.sucesso.dot }} />
                      <span style={{ width: `${(a.decididasNoPeriodo.reprovadas / total) * 100}%`, backgroundColor: TOM.perigo.dot }} />
                    </div>
                  )}
                </div>
              );
            }}
          </BlocoDaOperacao>
        </SecaoDaAnalise>
      </div>

      <SecaoDaAnalise
        id="h-apr-patrocinadores"
        testId="apr-patrocinadores"
        titulo="Em quem a decisão está esperando"
        descricao="Patrocinadores com peça esperando a decisão deles, a espera mais longa primeiro. O número de peças abre a lista."
      >
        <BlocoDaOperacao ctx={ctx} titulo="Espera por patrocinador">
          {(op) => (
            <TabelaCompacta<LinhaDoPatrocinador>
              testId="tabela-apr-patrocinadores"
              legenda="Peças esperando decisão por patrocinador"
              linhas={op.aprovacao.esperaPorPatrocinador}
              chave={(l) => l.sponsorId}
              limite={10}
              minLargura={520}
              vazio="Nenhum patrocinador com decisão pendente neste recorte."
              ordemInicial={{ coluna: "antiga", direcao: "desc" }}
              colunas={[
                { id: "nome", rotulo: "Patrocinador", ordenavel: true, valor: (l) => l.nome },
                {
                  id: "pecas", rotulo: "Peças", alinhar: "direita", ordenavel: true, valor: (l) => l.pecasPendentes,
                  titulo: "Peças com a decisão deste patrocinador pendente",
                  render: (l) => {
                    const minhas = dados.pendentesPorPatrocinador.get(l.sponsorId) ?? [];
                    // O servidor não vê os filtros de tipo nem os atalhos: quando a
                    // lista daqui é menor, a diferença é dita, não escondida.
                    if (minhas.length === l.pecasPendentes || minhas.length === 0) {
                      return minhas.length === 0
                        ? <span style={{ fontVariantNumeric: "tabular-nums" }} title="Nenhuma destas peças está no recorte atual">{fmtInt(l.pecasPendentes)}</span>
                        : <BotaoDeContagem ctx={ctx} pecas={minhas} forte titulo={`${l.nome} — com decisão pendente`} testId={`apr-pat-${l.sponsorId}`} />;
                    }
                    return (
                      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
                        <BotaoDeContagem ctx={ctx} pecas={minhas} forte titulo={`${l.nome} — com decisão pendente (no recorte)`} testId={`apr-pat-${l.sponsorId}`} />
                        <span style={{ fontSize: FS.small, color: T.second }} title="O total do servidor não aplica o filtro de tipo nem os atalhos do topo">de {fmtInt(l.pecasPendentes)}</span>
                      </span>
                    );
                  },
                },
                { id: "antiga", rotulo: "Mais antiga", alinhar: "direita", ordenavel: true, valor: (l) => l.diasMaisAntiga,
                  titulo: "Há quanto tempo a decisão pendente mais antiga espera",
                  render: (l) => <span style={{ fontWeight: l.diasMaisAntiga >= DIAS_PARADA ? FW.forte : FW.corpo, color: l.diasMaisAntiga >= DIAS_PARADA ? TOM.perigo.text : l.diasMaisAntiga >= 7 ? TOM.alerta.text : T.text }}>{fraseDeDias(l.diasMaisAntiga)}</span> },
                { id: "mediana", rotulo: "Mediana", alinhar: "direita", ordenavel: true, ocultarNoCelular: true, valor: (l) => l.diasMediana,
                  titulo: "Mediana de dias das decisões pendentes", render: (l) => fraseDeDias(l.diasMediana) },
              ]}
            />
          )}
        </BlocoDaOperacao>
      </SecaoDaAnalise>

      <SecaoDaAnalise id="h-apr-motivos" testId="apr-motivos" titulo="Por que se reprova" descricao="Os motivos de reprovação mais frequentes no período (texto agrupado sem acento e sem caixa).">
        <BlocoDaOperacao ctx={ctx} titulo="Motivos de reprovação">
          {(op) => (
            op.aprovacao.motivosDeReprovacao.length === 0 ? (
              <EstadoVazio compacto tom="sucesso" icone={CheckCircle2} titulo="Nenhuma reprovação com motivo no período" testId="apr-motivos-vazio" />
            ) : (
              <ListaDeBarras
                testId="apr-lista-motivos"
                legenda="Motivos de reprovação, do mais frequente ao menos"
                itens={op.aprovacao.motivosDeReprovacao.map((m, i) => ({
                  id: `${i}-${m.motivo}`, rotulo: m.motivo, valor: m.vezes, cor: TOM.perigo.dot,
                  texto: `${fmtInt(m.vezes)}×`,
                }))}
              />
            )
          )}
        </BlocoDaOperacao>
      </SecaoDaAnalise>

      <SecaoDaAnalise id="h-apr-eventos" testId="apr-eventos" titulo="Por evento" descricao="Cada evento com peça esperando decisão. O prazo é o marco da Aprovação de Layout do evento.">
        <TabelaCompacta<LinhaDoEvento>
          testId="tabela-apr-eventos"
          legenda="Peças esperando decisão por evento"
          linhas={dados.eventos}
          chave={(l) => l.eventoId}
          limite={10}
          minLargura={680}
          vazio="Nenhuma peça esperando decisão neste recorte."
          ordemInicial={{ coluna: "atrasadas", direcao: "desc" }}
          colunas={[
            { id: "nome", rotulo: "Evento", ordenavel: true, valor: (l) => l.nome },
            { id: "prazo", rotulo: "Aprovação de Layout", ordenavel: true, ocultarNoCelular: true, valor: (l) => l.prazoDia,
              render: (l) => l.prazoDia == null ? <span style={{ color: T.second }}>sem saída</span>
                : <span style={{ fontWeight: l.vencido ? FW.forte : FW.corpo, color: l.vencido ? undefined : T.second }}>{fmtDia(l.prazoDia)}{l.vencido ? " · vencido" : ""}</span> },
            { id: "pecas", rotulo: "Esperando", alinhar: "direita", ordenavel: true, valor: (l) => l.grupo.pecas.length,
              render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.grupo.pecas} titulo={`${l.nome} — esperando decisão`} /> },
            { id: "atrasadas", rotulo: "Atrasadas", alinhar: "direita", ordenavel: true, valor: (l) => l.grupo.atrasadas.length,
              render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.grupo.atrasadas} tom="perigo" forte titulo={`${l.nome} — atrasadas na Aprovação`} /> },
            { id: "paradas", rotulo: "14+ dias", alinhar: "direita", ordenavel: true, ocultarNoCelular: true, valor: (l) => l.grupo.paradas.length,
              render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.grupo.paradas} tom="alerta" titulo={`${l.nome} — esperando há 14+ dias`} /> },
            { id: "correcao", rotulo: "Correção", titulo: "Com alguma linha devolvida à Arte", alinhar: "direita", ordenavel: true, ocultarNoCelular: true, valor: (l) => l.correcao.length,
              render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.correcao} tom="alerta" titulo={`${l.nome} — com devolução à Arte`} /> },
          ]}
        />
      </SecaoDaAnalise>

      <AvisoDeCobertura
        testId="apr-cobertura"
        itens={[
          "Os números de cima vêm das peças e seguem todos os filtros do topo; decisões, motivos e a espera por patrocinador vêm do levantamento do servidor, que segue só o evento e o patrocinador.",
          "Peça isenta de aprovação não passa por esta etapa: ela é medida pela Finalização.",
          fase.idade.desconhecida.length > 0 && `${fmtInt(fase.idade.desconhecida.length)} ${plural(fase.idade.desconhecida.length, "peça não tem", "peças não têm")} registro de quando foi enviada — idade desconhecida.`,
        ]}
      />
    </div>
  );
}
