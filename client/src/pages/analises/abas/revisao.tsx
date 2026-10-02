// ─────────────────────────────────────────────────────────────────────────────
// ABA "REVISÃO FINAL" — o último degrau antes da Gráfica: quem pediu a peça
// confere o arquivo final e libera. O prazo é o marco da Revisão de Lista (−8).
//
// O que olhar aqui: fila parada nesta etapa segura a Gráfica inteira — a peça
// está pronta e não anda. "Sem arquivo final" é o que a Revisão vai devolver.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { AlertTriangle, ClipboardCheck, FileX, Flag, Hourglass, Inbox, Recycle } from "lucide-react";
import { EstadoVazio } from "@/components/ui/estados";
import { T, FS, FW } from "@/lib/theme";
import { arquivoFinalOk } from "@shared/molde";
import { DIAS_PARADA, resumirGrupo, type GrupoDePecas } from "@/lib/analises-estado";
import type { ContextoDaAnalise, PecaDaAnalise } from "../contexto";
import {
  AvisoDeCobertura, BotaoDeContagem, CartaoDeNumero, DistribuicaoDeIdade, GradeDeNumeros, ListaDePecas,
  SecaoDaAnalise, TabelaCompacta, fmtDia, fmtDias, fmtInt, plural,
} from "../componentes";

interface LinhaDoEvento {
  eventoId: string;
  nome: string;
  prazoDia: string | null;
  vencido: boolean;
  grupo: GrupoDePecas<PecaDaAnalise>;
  reuso: PecaDaAnalise[];
  semArquivo: PecaDaAnalise[];
}

export default function AbaRevisao({ ctx }: { ctx: ContextoDaAnalise }) {
  const { estado, leitura } = ctx;
  const fase = estado.porFase.revisao;
  const etapa = estado.porEtapa.find((e) => e.etapa === "awaiting_final_review")!;

  const dados = React.useMemo(() => {
    const reuso = fase.pecas.filter((p) => !!p.isReuse);
    const semArquivo = fase.pecas.filter((p) => !arquivoFinalOk(p));
    const porEvento = new Map<string, PecaDaAnalise[]>();
    for (const p of fase.pecas) {
      const l = porEvento.get(p.eventId);
      if (l) l.push(p); else porEvento.set(p.eventId, [p]);
    }
    const linhas: LinhaDoEvento[] = Array.from(porEvento, ([eventoId, ps]) => {
      const ref = ps.map(leitura).find((l) => l.prazo && !l.prazo.cobradaPorOutraEtapa);
      return {
        eventoId,
        nome: leitura(ps[0]).evento?.name ?? "Evento não encontrado",
        prazoDia: ref?.prazo?.dia ?? null,
        vencido: (ref?.prazo?.diasRestantes ?? 0) < 0,
        grupo: resumirGrupo(ps, leitura),
        reuso: ps.filter((p) => !!p.isReuse),
        semArquivo: ps.filter((p) => !arquivoFinalOk(p)),
      };
    });
    const maisAntigas = fase.pecas.map(leitura).filter((l) => l.diasNaFase != null).sort((a, b) => (b.diasNaFase ?? 0) - (a.diasNaFase ?? 0));
    return { reuso, semArquivo, linhas, maisAntigas };
  }, [fase.pecas, leitura]);

  if (fase.pecas.length === 0) {
    return (
      <EstadoVazio
        testId="revisao-vazia" icone={Inbox} tom="sucesso"
        titulo="Nada esperando a Revisão Final"
        descricao="Nenhuma peça aguarda conferência neste recorte — a Gráfica não está esperando por esta etapa."
      />
    );
  }

  return (
    <div data-testid="aba-revisao" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section aria-labelledby="h-rev-resumo">
        <h2 id="h-rev-resumo" className="sr-only">Resumo da Revisão Final</h2>
        <GradeDeNumeros minimo={ctx.isMobile ? 150 : 200} rotulo="Resumo da Revisão Final">
          <CartaoDeNumero ctx={ctx} testId="rev-fila" rotulo="Na fila" icone={ClipboardCheck} pecas={fase.pecas}
            titulo="Aguardando a Revisão Final" sub={fase.diasMediana != null ? `Mediana de ${fmtDias(fase.diasMediana)} na fila` : "Sem registro de idade"} />
          <CartaoDeNumero ctx={ctx} testId="rev-atrasadas" rotulo="Atrasadas" icone={AlertTriangle} tom="perigo" pecas={fase.atrasadas}
            titulo="Atrasadas na Revisão de Lista" sub={fase.piorAtraso ? `A pior venceu há ${fmtDias(fase.piorAtraso.diasDeAtraso)}` : "Nenhuma passou do marco"} />
          <CartaoDeNumero ctx={ctx} testId="rev-paradas" rotulo={`Paradas ${DIAS_PARADA}+ dias`} icone={Hourglass} tom="alerta" pecas={fase.paradas}
            titulo={`Na Revisão há ${DIAS_PARADA} dias ou mais`} sub="Prontas, sem andar" />
          <CartaoDeNumero ctx={ctx} testId="rev-sem-arquivo" rotulo="Sem arquivo final" icone={FileX} tom="alerta" pecas={dados.semArquivo}
            titulo="Na Revisão sem arquivo final" sub="A Revisão vai devolver à Arte" />
          <CartaoDeNumero ctx={ctx} testId="rev-reuso" rotulo="Reaproveitamento" icone={Recycle} tom="ceu" pecas={dados.reuso}
            titulo="Na Revisão com reaproveitamento" sub="Saem do estoque, não da impressora" />
          <CartaoDeNumero ctx={ctx} testId="rev-prioritarias" rotulo="Prioritárias" icone={Flag} tom="laranja" pecas={fase.prioritarias}
            titulo="Prioritárias na Revisão" sub={fase.travadas.length > 0 ? `${fmtInt(fase.travadas.length)} ${plural(fase.travadas.length, "travada", "travadas")}` : "Furam a fila"} />
        </GradeDeNumeros>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: 20, alignItems: "start" }}>
        <SecaoDaAnalise id="h-rev-idade" titulo="Há quanto tempo na Revisão" descricao="Dias desde que cada peça chegou à Revisão Final.">
          <DistribuicaoDeIdade ctx={ctx} grupo={fase} contexto="na Revisão Final" testId="rev-idade" />
          {etapa.porStatus.length > 1 && (
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
        <SecaoDaAnalise id="h-rev-antigas" testId="rev-antigas" titulo="As mais antigas na fila" descricao="As peças esperando conferência há mais tempo.">
          <ListaDePecas leituras={dados.maisAntigas} limite={5} testId="rev-lista-antigas" vazio="Nenhuma peça da fila tem registro de quando chegou." />
        </SecaoDaAnalise>
      </div>

      <SecaoDaAnalise id="h-rev-eventos" testId="rev-eventos" titulo="Por evento" descricao="Cada evento com peça na Revisão Final. O prazo é o marco da Revisão de Lista do evento.">
        <TabelaCompacta<LinhaDoEvento>
          testId="tabela-rev-eventos"
          legenda="Peças na Revisão Final por evento"
          linhas={dados.linhas}
          chave={(l) => l.eventoId}
          limite={10}
          minLargura={720}
          ordemInicial={{ coluna: "atrasadas", direcao: "desc" }}
          colunas={[
            { id: "nome", rotulo: "Evento", ordenavel: true, valor: (l) => l.nome },
            { id: "prazo", rotulo: "Revisão de Lista", ordenavel: true, ocultarNoCelular: true, valor: (l) => l.prazoDia,
              render: (l) => l.prazoDia == null ? <span style={{ color: T.second }}>sem saída</span>
                : <span style={{ fontWeight: l.vencido ? FW.forte : FW.corpo, color: l.vencido ? undefined : T.second }}>{fmtDia(l.prazoDia)}{l.vencido ? " · vencido" : ""}</span> },
            { id: "pecas", rotulo: "Na fila", alinhar: "direita", ordenavel: true, valor: (l) => l.grupo.pecas.length,
              render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.grupo.pecas} titulo={`${l.nome} — na Revisão Final`} /> },
            { id: "atrasadas", rotulo: "Atrasadas", alinhar: "direita", ordenavel: true, valor: (l) => l.grupo.atrasadas.length,
              render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.grupo.atrasadas} tom="perigo" forte titulo={`${l.nome} — atrasadas na Revisão`} /> },
            { id: "paradas", rotulo: "14+ dias", alinhar: "direita", ordenavel: true, valor: (l) => l.grupo.paradas.length,
              render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.grupo.paradas} tom="alerta" titulo={`${l.nome} — paradas 14+ dias na Revisão`} /> },
            { id: "sem", rotulo: "Sem arquivo", alinhar: "direita", ordenavel: true, ocultarNoCelular: true, valor: (l) => l.semArquivo.length,
              render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.semArquivo} tom="alerta" titulo={`${l.nome} — sem arquivo final`} /> },
            { id: "reuso", rotulo: "Reaproveit.", titulo: "Reaproveitamento", alinhar: "direita", ordenavel: true, ocultarNoCelular: true, valor: (l) => l.reuso.length,
              render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.reuso} titulo={`${l.nome} — reaproveitamento`} /> },
            { id: "travadas", rotulo: "Travadas", alinhar: "direita", ordenavel: true, ocultarNoCelular: true, valor: (l) => l.grupo.travadas.length,
              render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.grupo.travadas} tom="roxo" titulo={`${l.nome} — travadas`} /> },
          ]}
        />
      </SecaoDaAnalise>

      <AvisoDeCobertura
        testId="rev-cobertura"
        itens={[
          "A trava só vale na Gráfica e cai quando a peça volta para a Revisão — travada aqui é exceção, não rotina.",
          "Molde não tem arquivo final: não entra em \"sem arquivo final\".",
          fase.idade.desconhecida.length > 0 && `${fmtInt(fase.idade.desconhecida.length)} ${plural(fase.idade.desconhecida.length, "peça não tem", "peças não têm")} registro de quando chegou — idade desconhecida.`,
        ]}
      />
    </div>
  );
}
