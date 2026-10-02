// ─────────────────────────────────────────────────────────────────────────────
// ABA "ARTE" — as filas da mesa da Arte, com as regras da própria tela da Arte
// (lib/arte-rules + a regra da Correção de GET /api/items/resubmission-needed),
// a idade de cada fila, o atraso e o retrabalho.
//
// A Arte aparece DUAS vezes no fluxo: cria o layout antes da aprovação
// (Aguardando Envio) e anexa o arquivo final depois dela (Finalização). As
// duas estão aqui; "Aguardando patrocinador" também, porque a peça está na
// fila da Arte mesmo sem nada a fazer — é onde a Arte a enxerga.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { AlertTriangle, CheckCircle2, Palette, RotateCcw, ThumbsDown } from "lucide-react";
import { EstadoVazio } from "@/components/ui/estados";
import { T, FS, FW, FONT } from "@/lib/theme";
import {
  FILAS_DA_ARTE, pecasDaFilaDaArte, resumirGrupo, type GrupoDePecas, type IdDaFilaDaArte,
} from "@/lib/analises-estado";
import type { ContextoDaAnalise, PecaDaAnalise } from "../contexto";
import {
  AvisoDeCobertura, BlocoDaOperacao, BotaoDeContagem, CartaoDeNumero, DistribuicaoDeIdade, FluxoDeEtapas,
  GradeDeNumeros, NumeroDoServidor, SecaoDaAnalise, TabelaCompacta, fmtDias, fmtInt, idDaPeca, plural,
} from "../componentes";

const ROTULO_DA_ORIGEM: Record<string, string> = {
  envio: "Primeiro envio",
  reenvio: "Reenvio após reprovação",
  troca: "Troca de material",
};

interface LinhaDaFila { id: IdDaFilaDaArte; rotulo: string; grupo: GrupoDePecas<PecaDaAnalise> }
interface LinhaDoEvento { eventoId: string; nome: string; porFila: Record<IdDaFilaDaArte, PecaDaAnalise[]>; grupo: GrupoDePecas<PecaDaAnalise> }

export default function AbaArte({ ctx }: { ctx: ContextoDaAnalise }) {
  const { estado, leitura } = ctx;
  const ativas = estado.ativas.pecas;

  const dados = React.useMemo(() => {
    const filas: LinhaDaFila[] = FILAS_DA_ARTE.map((f) => ({
      id: f.id, rotulo: f.rotulo, grupo: resumirGrupo(pecasDaFilaDaArte(f.id, ativas, leitura), leitura),
    }));
    // A mesa inteira, sem contar a Correção duas vezes (ela é um recorte das outras).
    const mesa = resumirGrupo(ativas.filter((p) => leitura(p).fase === "arte" || leitura(p).etapa === "awaiting_approval"), leitura);
    const reprovadasPatrocinador = ativas.filter((p) => p.rejectedBySponsor === true);
    const reprovadasRevisao = ativas.filter((p) => p.rejectedByCreator === true);

    const porEvento = new Map<string, LinhaDoEvento>();
    for (const f of filas) {
      for (const p of f.grupo.pecas) {
        let l = porEvento.get(p.eventId);
        if (!l) {
          l = { eventoId: p.eventId, nome: leitura(p).evento?.name ?? "Evento não encontrado", porFila: { "criar-aprovacoes": [], "aguardando-patrocinador": [], correcao: [], "finalizar-layouts": [] }, grupo: resumirGrupo([], leitura) };
          porEvento.set(p.eventId, l);
        }
        l.porFila[f.id].push(p);
      }
    }
    const eventos = Array.from(porEvento.values()).map((l) => ({
      ...l,
      // Sem a Correção: ela repete peças das outras filas.
      grupo: resumirGrupo([...l.porFila["criar-aprovacoes"], ...l.porFila["aguardando-patrocinador"], ...l.porFila["finalizar-layouts"]], leitura),
    }));
    return { filas, mesa, reprovadasPatrocinador, reprovadasRevisao, eventos };
  }, [ativas, leitura]);

  const etapas = estado.porEtapa.filter((e) => e.etapa === "awaiting_submission" || e.etapa === "awaiting_approval" || e.etapa === "awaiting_finalization");
  const fila = (id: IdDaFilaDaArte) => dados.filas.find((f) => f.id === id)!;
  const subDaFila = (g: GrupoDePecas<PecaDaAnalise>) =>
    g.pecas.length === 0 ? "Fila vazia"
      : `${fmtInt(g.atrasadas.length)} ${plural(g.atrasadas.length, "atrasada", "atrasadas")} · ${fmtInt(g.paradas.length)} 14+ dias`;

  return (
    <div data-testid="aba-arte" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section aria-labelledby="h-arte-filas">
        <h2 id="h-arte-filas" className="sr-only">As filas da Arte</h2>
        <GradeDeNumeros minimo={ctx.isMobile ? 150 : 200} rotulo="As filas da Arte">
          {FILAS_DA_ARTE.map((f) => {
            const g = fila(f.id).grupo;
            return (
              <CartaoDeNumero
                key={f.id} ctx={ctx} testId={`arte-fila-${f.id}`}
                rotulo={f.curto} icone={f.id === "correcao" ? RotateCcw : Palette}
                tom={f.id === "correcao" ? "perigo" : g.atrasadas.length > 0 ? "alerta" : "neutro"}
                pecas={g.pecas} titulo={`Arte — ${f.rotulo}`} subtitulo={f.frase}
                sub={subDaFila(g)}
              />
            );
          })}
          <CartaoDeNumero
            ctx={ctx} testId="arte-atrasadas" rotulo="Atrasadas" icone={AlertTriangle} tom="perigo"
            pecas={dados.mesa.atrasadas} titulo="Atrasadas nas filas da Arte" subtitulo="Passaram do marco da etapa em que estão"
            sub={dados.mesa.piorAtraso ? `A pior venceu há ${fmtDias(dados.mesa.piorAtraso.diasDeAtraso)}` : "Nenhuma passou do prazo"}
          />
        </GradeDeNumeros>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: 20, alignItems: "start" }}>
        <SecaoDaAnalise id="h-arte-etapas" titulo="As etapas da Arte" descricao="Antes da aprovação (layout), esperando o patrocinador, e depois dela (arquivo final).">
          <FluxoDeEtapas ctx={ctx} etapas={etapas} agruparPorFase={false} mostrarEntregue={false} testId="arte-fluxo" />
        </SecaoDaAnalise>
        <SecaoDaAnalise id="h-arte-reprovadas" testId="arte-reprovadas" titulo="Reprovações em aberto" descricao="Peças em andamento que voltaram e ainda não foram aprovadas de novo.">
          {dados.reprovadasPatrocinador.length + dados.reprovadasRevisao.length === 0 ? (
            <EstadoVazio compacto tom="sucesso" icone={CheckCircle2} titulo="Nenhuma reprovação em aberto" testId="arte-reprovadas-vazio" />
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              <li style={{ display: "flex", alignItems: "center", gap: 10, fontSize: FS.body, color: T.text }}>
                <ThumbsDown aria-hidden="true" style={{ width: 14, height: 14, color: T.muted }} />
                <BotaoDeContagem ctx={ctx} pecas={dados.reprovadasPatrocinador} tom="perigo" forte vazio="0" titulo="Reprovadas pelo patrocinador (em aberto)" testId="arte-reprovadas-patrocinador" />
                <span>reprovadas pelo <strong style={{ fontWeight: FW.forte }}>patrocinador</strong></span>
              </li>
              <li style={{ display: "flex", alignItems: "center", gap: 10, fontSize: FS.body, color: T.text }}>
                <ThumbsDown aria-hidden="true" style={{ width: 14, height: 14, color: T.muted }} />
                <BotaoDeContagem ctx={ctx} pecas={dados.reprovadasRevisao} tom="perigo" forte vazio="0" titulo="Devolvidas pela Revisão Final (em aberto)" testId="arte-reprovadas-revisao" />
                <span>devolvidas pela <strong style={{ fontWeight: FW.forte }}>Revisão Final</strong></span>
              </li>
            </ul>
          )}
          <div style={{ marginTop: 16 }}>
            <DistribuicaoDeIdade ctx={ctx} grupo={dados.mesa} contexto="nas filas da Arte" testId="arte-idade" />
          </div>
        </SecaoDaAnalise>
      </div>

      <SecaoDaAnalise id="h-arte-idade-fila" testId="arte-idade-por-fila" titulo="Idade de cada fila" descricao="Há quanto tempo as peças de cada fila estão paradas nela. A Correção é um recorte das outras: a peça reprovada conta também na fila do status dela.">
        <TabelaCompacta<LinhaDaFila>
          testId="tabela-arte-filas"
          legenda="Idade das peças em cada fila da Arte"
          linhas={dados.filas}
          chave={(l) => l.id}
          minLargura={720}
          colunas={[
            { id: "fila", rotulo: "Fila", valor: (l) => l.rotulo },
            { id: "pecas", rotulo: "Peças", alinhar: "direita", valor: (l) => l.grupo.pecas.length,
              render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.grupo.pecas} forte titulo={`Arte — ${l.rotulo}`} /> },
            { id: "f0", rotulo: "Até 6 d", alinhar: "direita", ocultarNoCelular: true, valor: (l) => l.grupo.idade["0-6"].length,
              render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.grupo.idade["0-6"]} titulo={`${l.rotulo} — até 6 dias`} /> },
            { id: "f7", rotulo: "7–13 d", alinhar: "direita", ocultarNoCelular: true, valor: (l) => l.grupo.idade["7-13"].length,
              render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.grupo.idade["7-13"]} tom="alerta" titulo={`${l.rotulo} — 7 a 13 dias`} /> },
            { id: "f14", rotulo: "14+ d", alinhar: "direita", valor: (l) => l.grupo.idade["14+"].length,
              render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.grupo.idade["14+"]} tom="perigo" titulo={`${l.rotulo} — 14 dias ou mais`} /> },
            { id: "fx", rotulo: "Sem registro", alinhar: "direita", ocultarNoCelular: true, titulo: "Sem registro de quando entrou na etapa", valor: (l) => l.grupo.idade.desconhecida.length,
              render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.grupo.idade.desconhecida} titulo={`${l.rotulo} — idade desconhecida`} /> },
            { id: "atrasadas", rotulo: "Atrasadas", alinhar: "direita", valor: (l) => l.grupo.atrasadas.length,
              render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.grupo.atrasadas} tom="perigo" titulo={`${l.rotulo} — atrasadas`} /> },
            { id: "antiga", rotulo: "Mais antiga", alinhar: "direita", ocultarNoCelular: true, valor: (l) => l.grupo.maisAntiga?.diasNaFase ?? null,
              render: (l) => fmtDias(l.grupo.maisAntiga?.diasNaFase ?? null) },
          ]}
        />
      </SecaoDaAnalise>

      <SecaoDaAnalise id="h-arte-eventos" testId="arte-eventos" titulo="Por evento" descricao="Os eventos com peça na mesa da Arte, os mais atrasados primeiro.">
        <TabelaCompacta<LinhaDoEvento>
          testId="tabela-arte-eventos"
          legenda="Peças nas filas da Arte por evento"
          linhas={dados.eventos}
          chave={(l) => l.eventoId}
          limite={10}
          minLargura={820}
          vazio="Nenhum evento com peça na Arte neste recorte."
          ordemInicial={{ coluna: "atrasadas", direcao: "desc" }}
          colunas={[
            { id: "nome", rotulo: "Evento", ordenavel: true, valor: (l) => l.nome },
            { id: "pecas", rotulo: "Na Arte", alinhar: "direita", ordenavel: true, titulo: "Peças do evento nas filas da Arte (sem contar a Correção duas vezes)",
              valor: (l) => l.grupo.pecas.length,
              render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.grupo.pecas} forte titulo={`${l.nome} — nas filas da Arte`} /> },
            ...FILAS_DA_ARTE.map((f) => ({
              id: f.id, rotulo: f.rotulo, alinhar: "direita" as const, ordenavel: true, ocultarNoCelular: true,
              valor: (l: LinhaDoEvento) => l.porFila[f.id].length,
              render: (l: LinhaDoEvento) => <BotaoDeContagem ctx={ctx} pecas={l.porFila[f.id]} tom={f.id === "correcao" ? "perigo" : "neutro"} titulo={`${l.nome} — ${f.rotulo}`} />,
            })),
            { id: "atrasadas", rotulo: "Atrasadas", alinhar: "direita", ordenavel: true, valor: (l) => l.grupo.atrasadas.length,
              render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.grupo.atrasadas} tom="perigo" forte titulo={`${l.nome} — atrasadas na Arte`} /> },
          ]}
        />
      </SecaoDaAnalise>

      <SecaoDaAnalise id="h-arte-retrabalho" testId="arte-retrabalho" titulo="Retrabalho nos últimos 30 dias" descricao="Versões de arte criadas no período, por origem, e as peças que mais voltaram para a mesa.">
        <BlocoDaOperacao ctx={ctx} titulo="Versões de arte">
          {(op) => {
            const origens = Object.entries(op.arte.versoesNoPeriodo);
            const total = origens.reduce((t, [, n]) => t + n, 0);
            const porId = new Map(ctx.todasAsPecas.map((p) => [p.id, p]));
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <GradeDeNumeros minimo={150} rotulo="Versões por origem">
                  <NumeroDoServidor rotulo="Versões no período" valor={total} testId="arte-versoes-total" />
                  {origens.map(([origem, n]) => (
                    <NumeroDoServidor key={origem} rotulo={ROTULO_DA_ORIGEM[origem] ?? origem} valor={n}
                      sub={total > 0 ? `${Math.round((n / total) * 100)}% das versões` : undefined} />
                  ))}
                </GradeDeNumeros>
                {op.arte.pecasComMaisVersoes.length === 0 ? (
                  <p style={{ margin: 0, fontSize: FS.small, color: T.second }}>Nenhuma peça com 3 ou mais versões.</p>
                ) : (
                  <div>
                    <h3 style={{ margin: "0 0 8px", fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>Peças com mais versões</h3>
                    <ul data-testid="arte-mais-versoes" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(240px, 100%), 1fr))", gap: 8 }}>
                      {op.arte.pecasComMaisVersoes.slice(0, 12).map((v) => {
                        const p = porId.get(v.itemId);
                        return (
                          <li key={v.itemId} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, fontSize: FS.body }}>
                            <span style={{ fontFamily: FONT.mono, fontWeight: FW.forte, fontVariantNumeric: "tabular-nums", color: T.text, flexShrink: 0 }}>
                              {fmtInt(v.versoes)}×
                            </span>
                            {p ? (
                              <button
                                type="button" className="ds-botao ds-botao-fantasma"
                                onClick={() => ctx.abrirPecas(`${idDaPeca(p)} — ${fmtInt(v.versoes)} versões`, [p])}
                                style={{ border: "none", background: "transparent", padding: "2px 4px", cursor: "pointer", fontFamily: "inherit", fontSize: FS.body, color: T.text, textAlign: "left", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "underline", textDecorationColor: T.bdark, textUnderlineOffset: 3 }}
                              >
                                {idDaPeca(p)} · {p.type ?? "Sem tipo"}
                              </button>
                            ) : (
                              <span style={{ color: T.second }}>Peça fora da lista atual</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            );
          }}
        </BlocoDaOperacao>
      </SecaoDaAnalise>

      <AvisoDeCobertura
        testId="arte-cobertura"
        itens={[
          "O atraso é contra o marco da etapa em que a peça está (Entrega de Layouts, Aprovação de Layout, Finalização) — os mesmos da Gestão de Prazos; peça isenta de aprovação é medida pela Finalização.",
          "As filas leem a etapa canônica: um status gravado com grafia antiga aparece na fila da etapa dele em vez de sumir.",
          dados.mesa.idade.desconhecida.length > 0 && `${fmtInt(dados.mesa.idade.desconhecida.length)} ${plural(dados.mesa.idade.desconhecida.length, "peça não tem", "peças não têm")} registro de quando entrou na etapa — idade desconhecida.`,
        ]}
      />
    </div>
  );
}
