// ─────────────────────────────────────────────────────────────────────────────
// ABA "SOLICITAÇÃO E VINCULAÇÃO" — a entrada do fluxo: o que ainda é rascunho,
// o que foi solicitado e o que espera patrocinador vinculado. O prazo que mede
// esta fase é o primeiro marco do evento, a Lista de Imagens (−25).
//
// O que olhar aqui: rascunho velho é lista que ninguém fechou; "sem
// patrocinador" é peça que não tem quem aprove — e não vai andar sozinha.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { AlertTriangle, FilePen, Hourglass, Inbox, Link2Off, PackagePlus, Send } from "lucide-react";
import { T, FS, FW } from "@/lib/theme";
import { DIAS_PARADA, resumirGrupo, type GrupoDePecas } from "@/lib/analises-estado";
import type { ContextoDaAnalise, PecaDaAnalise } from "../contexto";
import {
  AvisoDeCobertura, BlocoDaOperacao, BotaoDeContagem, CartaoDeNumero, DistribuicaoDeIdade, FluxoDeEtapas,
  GradeDeNumeros, NumeroDoServidor, SecaoDaAnalise, TabelaCompacta, fmtDia, fmtInt, plural,
} from "../componentes";
import { EstadoVazio } from "@/components/ui/estados";

const RASCUNHO = ["draft", "rascunho"];
const SOLICITADO = ["requested", "solicitado"];
const semPatrocinador = (p: PecaDaAnalise) => (p.sponsors ?? []).length === 0;

interface LinhaDoEvento {
  eventoId: string;
  nome: string;
  prazoDia: string | null;
  prazoDiasRestantes: number | null;
  grupo: GrupoDePecas<PecaDaAnalise>;
  rascunho: PecaDaAnalise[];
  solicitado: PecaDaAnalise[];
  vinculacao: PecaDaAnalise[];
  semPatrocinador: PecaDaAnalise[];
}

export default function AbaSolicitacao({ ctx }: { ctx: ContextoDaAnalise }) {
  const { estado, leitura } = ctx;
  const fase = estado.porFase.solicitacao;
  const etapas = estado.porEtapa.filter((e) => e.fase === "solicitacao");

  const dados = React.useMemo(() => {
    const rascunho = fase.pecas.filter((p) => RASCUNHO.includes(p.status));
    const solicitado = fase.pecas.filter((p) => SOLICITADO.includes(p.status));
    const vinculacao = fase.pecas.filter((p) => leitura(p).etapa === "awaiting_linking");
    const sem = fase.pecas.filter(semPatrocinador);
    const dePedido = fase.pecas.filter((p) => !!p.pedidoDePecaId);

    const porEvento = new Map<string, PecaDaAnalise[]>();
    for (const p of fase.pecas) {
      const l = porEvento.get(p.eventId);
      if (l) l.push(p); else porEvento.set(p.eventId, [p]);
    }
    const linhas: LinhaDoEvento[] = Array.from(porEvento, ([eventoId, ps]) => {
      // O prazo do evento NESTA fase: o da peça medida pela própria etapa (a
      // isenta de aprovação é cobrada pela Finalização e não representa a fase).
      const ref = ps.map(leitura).find((l) => l.prazo && !l.prazo.cobradaPorOutraEtapa);
      return {
        eventoId,
        nome: leitura(ps[0]).evento?.name ?? "Evento não encontrado",
        prazoDia: ref?.prazo?.dia ?? null,
        prazoDiasRestantes: ref?.prazo?.diasRestantes ?? null,
        grupo: resumirGrupo(ps, leitura),
        rascunho: ps.filter((p) => RASCUNHO.includes(p.status)),
        solicitado: ps.filter((p) => SOLICITADO.includes(p.status)),
        vinculacao: ps.filter((p) => leitura(p).etapa === "awaiting_linking"),
        semPatrocinador: ps.filter(semPatrocinador),
      };
    });
    return { rascunho, solicitado, vinculacao, sem, dePedido, linhas };
  }, [fase.pecas, leitura]);

  if (fase.pecas.length === 0) {
    return (
      <EstadoVazio
        testId="solicitacao-vazia" icone={Inbox} tom="sucesso"
        titulo="Nada na entrada do fluxo"
        descricao="Nenhuma peça em rascunho, solicitada ou esperando vinculação neste recorte."
      />
    );
  }

  return (
    <div data-testid="aba-solicitacao" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section aria-labelledby="h-sol-resumo">
        <h2 id="h-sol-resumo" className="sr-only">Resumo da Solicitação e Vinculação</h2>
        <GradeDeNumeros minimo={ctx.isMobile ? 150 : 200} rotulo="Resumo da Solicitação e Vinculação">
          <CartaoDeNumero ctx={ctx} testId="sol-rascunho" rotulo="Rascunho" icone={FilePen} pecas={dados.rascunho}
            titulo="Em rascunho" sub="Lista ainda não enviada" />
          <CartaoDeNumero ctx={ctx} testId="sol-solicitado" rotulo="Solicitado" icone={Send} tom="info" pecas={dados.solicitado}
            titulo="Solicitadas" sub="Enviadas, ainda sem ir para a Arte" />
          <CartaoDeNumero ctx={ctx} testId="sol-vinculacao" rotulo="Ag. vinculação" icone={Link2Off} pecas={dados.vinculacao}
            titulo="Aguardando vinculação de patrocinador" sub="Esperando patrocinador para seguir" />
          <CartaoDeNumero ctx={ctx} testId="sol-atrasadas" rotulo="Atrasadas" icone={AlertTriangle} tom="perigo" pecas={fase.atrasadas}
            titulo="Atrasadas na Lista de Imagens" sub="Passaram do marco da Lista de Imagens" />
          <CartaoDeNumero ctx={ctx} testId="sol-sem-patrocinador" rotulo="Sem patrocinador" icone={Link2Off} tom="alerta" pecas={dados.sem}
            titulo="Sem patrocinador vinculado" sub="Ninguém para aprovar ainda" />
          <CartaoDeNumero ctx={ctx} testId="sol-paradas" rotulo={`Paradas ${DIAS_PARADA}+ dias`} icone={Hourglass} tom="alerta" pecas={fase.paradas}
            titulo={`Paradas há ${DIAS_PARADA} dias ou mais na entrada`} sub="Na mesma etapa" />
        </GradeDeNumeros>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: 20, alignItems: "start" }}>
        <SecaoDaAnalise id="h-sol-etapas" titulo="As etapas da entrada" descricao="Quantas peças em cada etapa, e quantas passaram do prazo ou estão paradas.">
          <FluxoDeEtapas ctx={ctx} etapas={etapas} agruparPorFase={false} mostrarEntregue={false} testId="sol-fluxo" />
          {etapas.some((e) => e.porStatus.length > 1) && (
            <p style={{ margin: "10px 0 0", fontSize: FS.small, color: T.second }}>
              Dentro de "{etapas[0].rotulo}":{" "}
              {etapas[0].porStatus.map((s, i) => (
                <React.Fragment key={s.status}>
                  {i > 0 && " · "}{s.rotulo}{" "}
                  <BotaoDeContagem ctx={ctx} pecas={s.pecas} titulo={s.rotulo} />
                </React.Fragment>
              ))}
            </p>
          )}
        </SecaoDaAnalise>
        <SecaoDaAnalise id="h-sol-idade" titulo="Há quanto tempo na entrada" descricao="Dias desde a última mudança de status. Rascunho velho é lista que ninguém fechou.">
          <DistribuicaoDeIdade ctx={ctx} grupo={fase} contexto="na Solicitação e Vinculação" testId="sol-idade" />
        </SecaoDaAnalise>
      </div>

      <SecaoDaAnalise
        id="h-sol-eventos"
        testId="sol-eventos"
        titulo="Por evento"
        descricao="Cada evento com peças na entrada do fluxo. O prazo é o marco da Lista de Imagens do evento."
      >
        <TabelaCompacta<LinhaDoEvento>
          testId="tabela-sol-eventos"
          legenda="Peças na Solicitação e Vinculação por evento"
          linhas={dados.linhas}
          chave={(l) => l.eventoId}
          limite={10}
          minLargura={760}
          ordemInicial={{ coluna: "atrasadas", direcao: "desc" }}
          colunas={[
            { id: "nome", rotulo: "Evento", ordenavel: true, valor: (l) => l.nome },
            { id: "pecas", rotulo: "Na entrada", alinhar: "direita", ordenavel: true, valor: (l) => l.grupo.pecas.length,
              render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.grupo.pecas} forte titulo={`${l.nome} — na Solicitação e Vinculação`} /> },
            { id: "prazo", rotulo: "Lista de Imagens", ordenavel: true, ocultarNoCelular: true, valor: (l) => l.prazoDia,
              render: (l) => l.prazoDia == null ? <span style={{ color: T.second }}>sem saída</span> : (
                <span style={{ color: (l.prazoDiasRestantes ?? 0) < 0 ? undefined : T.second, fontWeight: (l.prazoDiasRestantes ?? 0) < 0 ? FW.forte : FW.corpo }}>
                  {fmtDia(l.prazoDia)}{(l.prazoDiasRestantes ?? 0) < 0 ? " · vencido" : ""}
                </span>
              ) },
            { id: "rascunho", rotulo: "Rascunho", alinhar: "direita", ordenavel: true, ocultarNoCelular: true, valor: (l) => l.rascunho.length,
              render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.rascunho} titulo={`${l.nome} — rascunho`} /> },
            { id: "solicitado", rotulo: "Solicitado", alinhar: "direita", ordenavel: true, ocultarNoCelular: true, valor: (l) => l.solicitado.length,
              render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.solicitado} titulo={`${l.nome} — solicitadas`} /> },
            { id: "vinculacao", rotulo: "Ag. vinculação", alinhar: "direita", ordenavel: true, ocultarNoCelular: true, valor: (l) => l.vinculacao.length,
              render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.vinculacao} titulo={`${l.nome} — aguardando vinculação`} /> },
            { id: "sem", rotulo: "Sem patroc.", titulo: "Sem patrocinador vinculado", alinhar: "direita", ordenavel: true, valor: (l) => l.semPatrocinador.length,
              render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.semPatrocinador} tom="alerta" titulo={`${l.nome} — sem patrocinador`} /> },
            { id: "atrasadas", rotulo: "Atrasadas", alinhar: "direita", ordenavel: true, valor: (l) => l.grupo.atrasadas.length,
              render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.grupo.atrasadas} tom="perigo" forte titulo={`${l.nome} — atrasadas na Lista de Imagens`} /> },
          ]}
        />
      </SecaoDaAnalise>

      <SecaoDaAnalise
        id="h-sol-pedidos"
        testId="sol-pedidos"
        titulo="Pedidos de peça"
        descricao="Peças que nasceram de um pedido de peça, e o andamento dos pedidos nos últimos 30 dias."
      >
        {/* Ícone e frase numa LINHA (flex): solto dentro do <p>, o svg do
            Tailwind (display: block) subia para cima do texto. */}
        <p data-testid="sol-de-pedido" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, margin: "0 0 12px", fontSize: FS.body, color: T.text }}>
          <PackagePlus aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, color: T.muted }} />
          {dados.dePedido.length === 0 ? (
            <span>Nenhuma peça da entrada nasceu de um pedido de peça.</span>
          ) : (
            <span>
              <BotaoDeContagem ctx={ctx} pecas={dados.dePedido} titulo="Na entrada, nascidas de pedido de peça" forte />{" "}
              {dados.dePedido.length === 1 ? "peça da entrada nasceu" : "peças da entrada nasceram"} de um pedido de peça.
            </span>
          )}
        </p>
        <BlocoDaOperacao ctx={ctx} titulo="Andamento dos pedidos">
          {(op) => (
            <GradeDeNumeros minimo={150} rotulo="Pedidos de peça e ao estoque">
              <NumeroDoServidor rotulo="Pedidos de peça abertos" valor={op.estoque.pedidosDePeca.abertos} />
              <NumeroDoServidor rotulo="Atendidos em 30 dias" valor={op.estoque.pedidosDePeca.atendidosNoPeriodo} />
              <NumeroDoServidor rotulo="Recusados em 30 dias" valor={op.estoque.pedidosDePeca.recusadosNoPeriodo} />
              <NumeroDoServidor rotulo="Pedidos ao estoque abertos" valor={op.estoque.pedidosAoEstoque.abertos} />
            </GradeDeNumeros>
          )}
        </BlocoDaOperacao>
      </SecaoDaAnalise>

      <AvisoDeCobertura
        testId="sol-cobertura"
        itens={[
          "Os números de pedidos são do levantamento do servidor (contam pedidos, não peças) e por isso não abrem lista.",
          fase.idade.desconhecida.length > 0 && `${fmtInt(fase.idade.desconhecida.length)} ${plural(fase.idade.desconhecida.length, "peça não tem", "peças não têm")} registro de quando entrou na etapa — idade desconhecida.`,
        ]}
      />
    </div>
  );
}

