// ─────────────────────────────────────────────────────────────────────────────
// ABA "ESTOQUE E REAPROVEITAMENTO" — quanto do que sai para os eventos vem do
// galpão em vez da impressora, o acervo como está agora e os pedidos (ao
// estoque, pela Revisão Final; de peça, pelo Atendimento).
//
// DUAS FONTES:
//   · as peças EM ANDAMENTO com reaproveitamento (integral ou parcial) saem de
//     /api/items — seguem todos os filtros do topo e abrem a lista;
//   · reaproveitado × impresso, acervo e pedidos vêm do levantamento do
//     servidor. O acervo é FOTO DE AGORA e não tem evento: o filtro de evento
//     não o recorta (o de patrocinador recorta, pelos patrocinadores impressos
//     no ativo) — e o rodapé diz isso quando o filtro está ligado.
//
// A régua do reaproveitamento é a da Gráfica (lib/saldo, reusedTotalOf):
// isReuse = a peça inteira sai do estoque; reuseQty > 0 = só parte dela.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { AlertTriangle, Inbox, Layers, Recycle, SplitSquareHorizontal } from "lucide-react";
import { EstadoVazio } from "@/components/ui/estados";
import { T, TOM, FS, FW, R } from "@/lib/theme";
import { reusedOf, reusedTotalOf, type SaldoItem } from "@/lib/saldo";
import { conditionMeta } from "@/lib/inventory-meta";
import { resumirGrupo, type EtapaNoEstado } from "@/lib/analises-estado";
import type { EstoqueDaOperacao, OperacaoDaAnalise } from "@shared/analises-operacao-contract";
import type { ContextoDaAnalise, PecaDaAnalise } from "../contexto";
import {
  AvisoDeCobertura, BlocoDaOperacao, CartaoDeNumero, FluxoDeEtapas, GradeDeNumeros, ListaDeBarras, NumeroDoServidor,
  SecaoDaAnalise, fmtInt, plural, rotuloDaJanela,
} from "../componentes";

const comoSaldo = (p: PecaDaAnalise) => p as PecaDaAnalise & SaldoItem;
const integral = (p: PecaDaAnalise) => !!p.isReuse;
const parcial = (p: PecaDaAnalise) => !p.isReuse && reusedOf(comoSaldo(p)) > 0;

/**
 * Rótulos e ordem da situação do ativo — os da busca de semelhantes do estoque
 * (components/estoque-semelhantes-dialog.tsx), que é onde a Revisão lê o acervo.
 * Situação nova que o servidor mande aparece com o código cru, no fim.
 */
const SITUACOES: { id: string; rotulo: string; cor: string }[] = [
  { id: "NO_GALPAO", rotulo: "No galpão", cor: TOM.sucesso.dot },
  { id: "EM_USO", rotulo: "Em uso", cor: TOM.laranja.dot },
  { id: "AGUARDANDO_TRIAGEM", rotulo: "Aguardando triagem", cor: TOM.alerta.dot },
  { id: "EM_MANUTENCAO", rotulo: "Em manutenção", cor: TOM.alerta.dot },
  { id: "DESCARTADO", rotulo: "Descartada", cor: TOM.neutro.dot },
];
const COR_DA_CONDICAO: Record<string, string> = { PERFEITO: TOM.sucesso.dot, AVARIA_LEVE: TOM.alerta.dot, SUCATA: TOM.perigo.dot };

const fmtM2 = (n: number): string => `${n.toLocaleString("pt-BR", { maximumFractionDigits: n >= 100 ? 0 : 1 })} m²`;
const pct = (a: number, b: number): number | null => (a + b > 0 ? Math.round((a / (a + b)) * 100) : null);

export default function AbaEstoque({ ctx }: { ctx: ContextoDaAnalise }) {
  const { estado, leitura } = ctx;

  const dados = React.useMemo(() => {
    const comReuso = estado.ativas.pecas.filter((p) => integral(p) || parcial(p));
    const grupo = resumirGrupo(comReuso, leitura);
    const ids = new Set(comReuso.map((p) => p.id));
    // O fluxo das peças com reuso: as etapas do estado, recortadas a elas (só
    // as etapas onde há alguma — o resto seria uma escada de zeros).
    const etapas: EtapaNoEstado<PecaDaAnalise>[] = estado.porEtapa
      .filter((e) => e.etapa !== "delivered")
      .map((e) => ({ ...e, ...resumirGrupo(e.pecas.filter((p) => ids.has(p.id)), leitura) }))
      .filter((e) => e.pecas.length > 0);
    const unidades = comReuso.reduce((t, p) => t + reusedTotalOf(comoSaldo(p)), 0);
    return {
      comReuso, grupo, etapas, unidades,
      integrais: comReuso.filter(integral),
      parciais: comReuso.filter(parcial),
      naRevisao: comReuso.filter((p) => leitura(p).etapa === "awaiting_final_review"),
    };
  }, [estado.ativas.pecas, estado.porEtapa, leitura]);

  return (
    <div data-testid="aba-estoque" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section aria-labelledby="h-est-resumo">
        <h2 id="h-est-resumo" className="sr-only">Reaproveitamento em andamento</h2>
        <GradeDeNumeros minimo={ctx.isMobile ? 150 : 200} rotulo="Reaproveitamento em andamento">
          <CartaoDeNumero ctx={ctx} testId="est-com-reuso" rotulo="Reaproveitamento" icone={Recycle} tom="ceu" pecas={dados.comReuso}
            titulo="Em andamento com reaproveitamento" subtitulo="Saem do estoque, no todo ou em parte"
            sub={`${fmtInt(dados.unidades)} ${plural(dados.unidades, "unidade sai", "unidades saem")} do estoque`} />
          <CartaoDeNumero ctx={ctx} testId="est-integral" rotulo="Integral" icone={Layers} pecas={dados.integrais}
            titulo="Reaproveitamento integral" subtitulo="A peça inteira sai do estoque" sub="A peça inteira sai do estoque" />
          <CartaoDeNumero ctx={ctx} testId="est-parcial" rotulo="Parcial" icone={SplitSquareHorizontal} pecas={dados.parciais}
            titulo="Reaproveitamento parcial" subtitulo="Parte sai do estoque, o resto é impresso" sub="Parte do estoque, parte impressa" />
          <CartaoDeNumero ctx={ctx} testId="est-revisao" rotulo="Na Revisão Final" icone={Inbox} pecas={dados.naRevisao}
            titulo="Com reaproveitamento esperando a Revisão Final" sub="Onde o pedido ao estoque é feito" />
          <CartaoDeNumero ctx={ctx} testId="est-atrasadas" rotulo="Atrasadas" icone={AlertTriangle} tom="perigo" pecas={dados.grupo.atrasadas}
            titulo="Com reaproveitamento e atrasadas na etapa" sub="Passaram do prazo da etapa" />
        </GradeDeNumeros>
      </section>

      {/* Cada bloco na largura toda: a altura do "onde estão" vai de uma linha
          (nenhuma peça) a seis etapas, e lado a lado com a comparação sempre
          sobrava um buraco num dos dois. Por dentro, a comparação usa a
          largura em duas colunas. */}
      <SecaoDaAnalise id="h-est-entregues" testId="est-reaproveitado" titulo="Reaproveitado × impresso" descricao="Entre as peças entregues no período — é a entrega que prova que a unidade do estoque foi usada de fato.">
        <BlocoDaOperacao ctx={ctx} titulo="Reaproveitado × impresso">
          {(op) => <Comparacao op={op} />}
        </BlocoDaOperacao>
      </SecaoDaAnalise>

      <SecaoDaAnalise id="h-est-fluxo" testId="est-fluxo" titulo="Onde estão as peças com reaproveitamento" descricao="Em que etapa do fluxo está cada peça em andamento que sai, no todo ou em parte, do estoque.">
        {dados.etapas.length === 0
          ? <p data-testid="est-fluxo-vazio" style={{ margin: 0, fontSize: FS.body, color: T.second }}>Nenhuma peça em andamento com reaproveitamento neste recorte.</p>
          : <FluxoDeEtapas ctx={ctx} etapas={dados.etapas} agruparPorFase={false} mostrarEntregue={false} testId="est-fluxo-etapas" />}
      </SecaoDaAnalise>

      <SecaoDaAnalise id="h-est-acervo" testId="est-acervo" titulo="O acervo agora" descricao="Os ativos do estoque como estão hoje: onde estão e em que condição (a condição só dos não descartados).">
        <BlocoDaOperacao ctx={ctx} titulo="Acervo">
          {(op) => <Acervo e={op.estoque} />}
        </BlocoDaOperacao>
      </SecaoDaAnalise>

      <SecaoDaAnalise id="h-est-pedidos" testId="est-pedidos" titulo="Pedidos" descricao="Ao estoque, feitos pela Revisão Final; e de peça, feitos pelo Atendimento (contados por peça pedida).">
        <BlocoDaOperacao ctx={ctx} titulo="Pedidos">
          {(op) => {
            const e = op.estoque;
            const janela = rotuloDaJanela(op);
            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: 16 }}>
                <div>
                  <h3 style={{ margin: "0 0 8px", fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>Pedidos ao estoque</h3>
                  <GradeDeNumeros minimo={130} rotulo="Pedidos ao estoque">
                    <NumeroDoServidor testId="est-pedidos-estoque-abertos" rotulo="Abertos agora" valor={e.pedidosAoEstoque.abertos} sub="Esperando resposta do estoque" />
                    <NumeroDoServidor testId="est-pedidos-estoque-respondidos" rotulo={`Respondidos ${janela}`} valor={e.pedidosAoEstoque.respondidosNoPeriodo} sub="Atendidos, parciais ou não" />
                  </GradeDeNumeros>
                </div>
                <div>
                  <h3 style={{ margin: "0 0 8px", fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>Pedidos de peça</h3>
                  <GradeDeNumeros minimo={110} rotulo="Pedidos de peça">
                    <NumeroDoServidor testId="est-pedidos-peca-abertos" rotulo="Abertos" valor={e.pedidosDePeca.abertos} />
                    <NumeroDoServidor testId="est-pedidos-peca-atendidos" rotulo={`Atendidos ${janela}`} valor={e.pedidosDePeca.atendidosNoPeriodo} />
                    <NumeroDoServidor testId="est-pedidos-peca-recusados" rotulo={`Recusados ${janela}`} valor={e.pedidosDePeca.recusadosNoPeriodo} />
                  </GradeDeNumeros>
                </div>
              </div>
            );
          }}
        </BlocoDaOperacao>
      </SecaoDaAnalise>

      <AvisoDeCobertura
        testId="est-cobertura"
        itens={[
          "Os cartões de cima vêm das peças em andamento e seguem todos os filtros do topo; o resto vem do levantamento do servidor e é contado em unidades, ativos e pedidos — por isso não abre lista.",
          ctx.filtros.evento !== "all" && "O acervo não tem evento: o filtro de evento não o recorta (reaproveitado × impresso e pedidos, sim).",
          ctx.filtros.patrocinador !== "all" && "Com filtro de patrocinador, o acervo conta os ativos que trazem a marca dele impressa.",
        ]}
      />
    </div>
  );
}

function Comparacao({ op }: { op: OperacaoDaAnalise }) {
  const { reaproveitadas: r, impressas: i } = op.estoque;
  const janela = rotuloDaJanela(op);
  const pUn = pct(r.unidades, i.unidades);
  const pM2 = pct(r.m2, i.m2);
  if (r.unidades + i.unidades === 0) {
    return <EstadoVazio compacto icone={Recycle} titulo={`Nenhuma peça entregue ${janela}`} descricao="Sem entrega, não há o que comparar." testId="est-comparacao-vazia" />;
  }
  const linha = (rotulo: string, cor: string, v: { pecas: number; unidades: number; m2: number }, testId: string) => (
    <div data-testid={testId} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) repeat(3, auto)", columnGap: 14, alignItems: "baseline", padding: "8px 0", borderTop: `1px solid ${T.border}` }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: FS.body, fontWeight: FW.medio, color: T.text, minWidth: 0 }}>
        <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: cor, flexShrink: 0 }} />{rotulo}
      </span>
      <span style={{ fontSize: FS.body, fontVariantNumeric: "tabular-nums", color: T.text, textAlign: "right" }}>{fmtInt(v.pecas)} {plural(v.pecas, "peça", "peças")}</span>
      <span style={{ fontSize: FS.body, fontVariantNumeric: "tabular-nums", color: T.text, textAlign: "right", fontWeight: FW.forte }}>{fmtInt(v.unidades)} un.</span>
      <span style={{ fontSize: FS.body, fontVariantNumeric: "tabular-nums", color: T.second, textAlign: "right" }}>{fmtM2(v.m2)}</span>
    </div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", columnGap: 28, rowGap: 14, alignItems: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <GradeDeNumeros minimo={150} rotulo="Porcentagem reaproveitada">
          <NumeroDoServidor testId="est-pct-unidades" rotulo="Reaproveitado (unidades)" valor={pUn == null ? "—" : `${pUn}%`} sub={`das unidades entregues ${janela}`} />
          <NumeroDoServidor testId="est-pct-m2" rotulo="Reaproveitado (m²)" valor={pM2 == null ? "—" : `${pM2}%`} sub="dos m² entregues" />
        </GradeDeNumeros>
        <div aria-hidden="true" style={{ display: "flex", height: 12, borderRadius: R.pill, overflow: "hidden", backgroundColor: T.low, border: `1px solid ${T.border}` }}>
          <span style={{ width: `${pUn ?? 0}%`, backgroundColor: TOM.ceu.dot }} />
          <span style={{ width: `${100 - (pUn ?? 0)}%`, backgroundColor: TOM.laranja.dot }} />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        <div>
          {linha("Do estoque", TOM.ceu.dot, r, "est-linha-reaproveitadas")}
          {linha("Impressas", TOM.laranja.dot, i, "est-linha-impressas")}
        </div>
        <p style={{ margin: 0, fontSize: FS.small, color: T.second }}>
          Peça com reaproveitamento parcial conta nos dois lados (as unidades se dividem) — por isso a porcentagem é por unidade e por m², não por peça.
        </p>
      </div>
    </div>
  );
}

function Acervo({ e }: { e: EstoqueDaOperacao }) {
  const conhecidas = new Set(SITUACOES.map((s) => s.id));
  const porId = new Map(e.ativosPorSituacao.map((s) => [s.situacao, s]));
  const situacoes = [
    ...SITUACOES.filter((s) => porId.has(s.id)).map((s) => ({ ...s, v: porId.get(s.id)! })),
    ...e.ativosPorSituacao.filter((s) => !conhecidas.has(s.situacao)).map((s) => ({ id: s.situacao, rotulo: s.situacao, cor: TOM.neutro.dot, v: s })),
  ];
  const vivos = e.ativosPorSituacao.filter((s) => s.situacao !== "DESCARTADO").reduce((t, s) => t + s.unidades, 0);
  const noGalpao = porId.get("NO_GALPAO")?.unidades ?? 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <GradeDeNumeros minimo={150} rotulo="Acervo">
        <NumeroDoServidor testId="est-acervo-vivo" rotulo="Unidades no acervo" valor={vivos} sub="Sem as descartadas" />
        <NumeroDoServidor testId="est-acervo-galpao" rotulo="No galpão" valor={noGalpao} sub={vivos > 0 ? `${Math.round((noGalpao / vivos) * 100)}% do acervo, prontas para reaproveitar` : undefined} />
      </GradeDeNumeros>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: 20, alignItems: "start" }}>
        <div>
          <h3 style={{ margin: "0 0 4px", fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>Por situação</h3>
          <ListaDeBarras
            testId="est-lista-situacao"
            legenda="Unidades do acervo por situação"
            vazio="Nenhum ativo no acervo."
            itens={situacoes.map((s) => ({
              id: s.id, valor: s.v.unidades, cor: s.cor,
              // Os registros na MESMA linha do rótulo: numa linha de detalhe
              // própria, a lista de situação ficava o dobro da de condição.
              rotulo: <>{s.rotulo} <span style={{ fontSize: FS.small, fontWeight: FW.corpo, color: T.second }}>· {fmtInt(s.v.registros)} {plural(s.v.registros, "registro", "registros")}</span></>,
              texto: `${fmtInt(s.v.unidades)} un.`,
            }))}
          />
        </div>
        <div>
          <h3 style={{ margin: "0 0 4px", fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>Por condição</h3>
          <ListaDeBarras
            testId="est-lista-condicao"
            legenda="Unidades do acervo por condição"
            vazio="Nenhum ativo fora do descarte."
            itens={e.ativosPorCondicao.map((c) => ({
              id: c.condicao,
              rotulo: c.condicao in COR_DA_CONDICAO ? conditionMeta(c.condicao).label : c.condicao,
              valor: c.unidades, cor: COR_DA_CONDICAO[c.condicao] ?? TOM.neutro.dot,
              texto: `${fmtInt(c.unidades)} un.`,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
