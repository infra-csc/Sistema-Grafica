// ─────────────────────────────────────────────────────────────────────────────
// ABA "GRÁFICA" — da peça liberada à entrega: a fila de cada mão (imprimir,
// conferir, embalar, entregar), as impressoras e o ritmo de produção do
// período. O prazo é o marco da Produção Gráfica, que só a entrega encerra.
//
// DUAS FONTES, DITAS NO TÍTULO DE CADA BLOCO:
//   · o ESTADO de agora (quantas em cada etapa, idade, atraso, parciais) sai
//     das peças — mesmo número da Visão geral, e todo número abre a lista;
//   · o DIÁRIO das máquinas (unidades, m², registros), os tubos e as séries por
//     dia vêm do levantamento do servidor — são agregados, não abrem lista.
//
// AS PARCIAIS. Com a conferência parcial, a peça tem trabalho em duas mãos ao
// mesmo tempo (6 de 10 impressas esperam a conferência enquanto 4 ainda estão
// na máquina). A régua é `casaEtapa` (lib/grafica-filtros) — a MESMA do card da
// tela da Gráfica —, então o "A conferir" daqui bate com o de lá.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CheckCircle2, Factory, Hourglass, Lock, Printer } from "lucide-react";
import { Segmentado } from "@/components/ui/abas";
import { T, TOM, FS, FW, FONT, R } from "@/lib/theme";
import { casaEtapa } from "@/lib/grafica-filtros";
import type { SaldoItem } from "@/lib/saldo";
import { DIAS_PARADA, resumirGrupo, type GrupoDePecas } from "@/lib/analises-estado";
import { estaEmImpressao, estaLiberada, imprimeNaMaquina, impressorasDaPeca, SEM_IMPRESSORA } from "@shared/progresso-da-impressao";
import type { GraficaDaOperacao } from "@shared/analises-operacao-contract";
import type { ContextoDaAnalise, PecaDaAnalise } from "../contexto";
import {
  AvisoDeCobertura, BlocoDaOperacao, BotaoDeContagem, CartaoDeNumero, DistribuicaoDeIdade, FluxoDeEtapas, GradeDeNumeros,
  ListaDeBarras, NumeroDoServidor, SecaoDaAnalise, TabelaCompacta, TEXTO_DAS_TRAVADAS, fmtDia, fmtDias, fmtInt, plural, rotuloDaJanela,
} from "../componentes";

type PecaDaImpressora = Parameters<typeof imprimeNaMaquina>[0];
const comoReservavel = (p: PecaDaAnalise) => p as unknown as PecaDaImpressora;

/** As três mãos depois da impressora — o id é o status que `casaEtapa` entende. */
const MAOS = [
  { id: "produced", rotulo: "A conferir", frase: "Impressas esperando a conferência" },
  { id: "conferred", rotulo: "A embalar", frase: "Conferidas esperando a embalagem" },
  { id: "packed", rotulo: "Embaladas, a entregar", frase: "Em volume, esperando a entrega" },
] as const;

interface LinhaDaMao { id: string; rotulo: string; frase: string; total: PecaDaAnalise[]; peloStatus: PecaDaAnalise[]; parcial: PecaDaAnalise[]; grupo: GrupoDePecas<PecaDaAnalise> }

const fmtM2 = (n: number): string => `${n.toLocaleString("pt-BR", { maximumFractionDigits: n >= 100 ? 0 : 1 })} m²`;

// ─── O gráfico por dia (o estilo do GraficoCarga da Desempenho) ──────────────

type SerieDoGrafico = { chave: string; nome: string; cor: string };
type ItemDaDica = { value?: number | null; dataKey?: string | number; name?: string; color?: string };

function DicaDoDia({ active, payload, label, unidade }: { active?: boolean; payload?: ItemDaDica[]; label?: string | number; unidade: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: T.dark, color: T.surface, borderRadius: R.sm, padding: "9px 12px", fontSize: FS.small, lineHeight: 1.6 }}>
      <div style={{ fontWeight: FW.forte, marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} style={{ fontVariantNumeric: "tabular-nums" }}>{p.name}: {unidade(Number(p.value ?? 0))}</div>
      ))}
    </div>
  );
}

/**
 * Barras por dia. Memoizado como o GraficoCarga: o recharts é o pedaço caro e
 * só precisa redesenhar quando a série muda (não quando a gaveta abre).
 */
const GraficoPorDia = React.memo(function GraficoPorDia({ dados, series, unidade, legenda, testId }: {
  dados: Array<Record<string, number | string>>;
  series: SerieDoGrafico[];
  unidade: (n: number) => string;
  legenda: string;
  testId: string;
}) {
  return (
    <figure data-testid={testId} style={{ margin: 0, minWidth: 0 }}>
      <figcaption className="sr-only">{legenda}</figcaption>
      {series.length > 1 && (
        <div aria-hidden="true" style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 6 }}>
          {series.map((s) => (
            <span key={s.chave} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: FS.small, color: T.second }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: s.cor }} />{s.nome}
            </span>
          ))}
        </div>
      )}
      {/* A caixa rola, a página não: 30 dias cabem em 390px, 90 não. Os
          rótulos dos eixos herdam os dígitos de largura fixa (fonte da casa,
          como no Desempenho — mono era a única fonte "de código" da tela). */}
      <div style={{ overflowX: "auto", fontVariantNumeric: "tabular-nums" }}>
        <div style={{ minWidth: dados.length > 45 ? dados.length * 9 : undefined, height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barGap={1}>
              <CartesianGrid stroke={T.border} vertical={false} />
              <XAxis dataKey="rotulo" tick={{ fontSize: FS.micro, fontWeight: FW.forte, fill: T.second, fontFamily: FONT.corpo }}
                axisLine={{ stroke: T.bdark }} tickLine={false} interval="preserveStartEnd" minTickGap={14} />
              <YAxis tick={{ fontSize: FS.micro, fill: T.second }} axisLine={false} tickLine={false} width={48} allowDecimals={false} />
              <Tooltip content={<DicaDoDia unidade={unidade} />} cursor={{ fill: T.low }} />
              {series.map((s) => (
                <Bar key={s.chave} dataKey={s.chave} name={s.nome} fill={s.cor} maxBarSize={18} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </figure>
  );
});

// ─── A aba ───────────────────────────────────────────────────────────────────

export default function AbaGrafica({ ctx }: { ctx: ContextoDaAnalise }) {
  const { estado, leitura } = ctx;
  const fase = estado.porFase.grafica;
  const etapas = estado.porEtapa.filter((e) => e.fase === "grafica");
  const emImpressao = etapas.find((e) => e.etapa === "inProduction")?.pecas ?? [];
  const recentes = estado.entreguesRecentes;
  const [medida, setMedida] = React.useState<"unidades" | "m2">("unidades");

  const dados = React.useMemo(() => {
    const ativas = estado.ativas.pecas;
    const maos: LinhaDaMao[] = MAOS.map((m) => {
      const total = ativas.filter((p) => casaEtapa(p as PecaDaAnalise & SaldoItem, m.id));
      const peloStatus = total.filter((p) => leitura(p).etapa === m.id);
      return { ...m, total, peloStatus, parcial: total.filter((p) => leitura(p).etapa !== m.id), grupo: resumirGrupo(total, leitura) };
    });
    // Em impressão sem máquina anotada (legado de antes do controle de máquinas).
    const semImpressora = emImpressao.filter((p) => impressorasDaPeca(comoReservavel(p)).includes(SEM_IMPRESSORA));
    return { maos, semImpressora };
  }, [estado.ativas.pecas, emImpressao, leitura]);

  /** As peças que a tela tem em mãos numa impressora: imprimindo agora e reservadas para ela. */
  const naImpressora = React.useCallback((codigo: string) => ({
    imprimindo: fase.pecas.filter((p) => estaEmImpressao(p) && imprimeNaMaquina(comoReservavel(p), codigo)),
    reservadas: fase.pecas.filter((p) => estaLiberada(p) && impressorasDaPeca(comoReservavel(p)).includes(codigo)),
  }), [fase.pecas]);

  return (
    <div data-testid="aba-grafica" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section aria-labelledby="h-gra-resumo">
        <h2 id="h-gra-resumo" className="sr-only">Resumo da Gráfica</h2>
        <GradeDeNumeros minimo={ctx.isMobile ? 150 : 200} rotulo="Resumo da Gráfica">
          <CartaoDeNumero ctx={ctx} testId="gra-na-grafica" rotulo="Na Gráfica" icone={Factory} pecas={fase.pecas}
            titulo="Na Gráfica (liberadas até embaladas)" sub={`${fmtInt(emImpressao.length)} em impressão`} />
          <CartaoDeNumero ctx={ctx} testId="gra-atrasadas" rotulo="Atrasadas" icone={AlertTriangle} tom="perigo" pecas={fase.atrasadas}
            titulo="Atrasadas na Produção Gráfica" subtitulo="Passaram do marco da Produção Gráfica do evento"
            sub={fase.piorAtraso ? `A pior venceu há ${fmtDias(fase.piorAtraso.diasDeAtraso)}` : "Nenhuma passou do marco"} />
          <CartaoDeNumero ctx={ctx} testId="gra-em-impressao" rotulo="Em impressão" icone={Printer} tom="laranja" pecas={emImpressao}
            titulo="Em impressão agora"
            sub={dados.semImpressora.length > 0 ? `${fmtInt(dados.semImpressora.length)} sem impressora anotada` : "Todas com impressora"} />
          <CartaoDeNumero ctx={ctx} testId="gra-paradas" rotulo={`Paradas ${DIAS_PARADA}+ dias`} icone={Hourglass} tom="alerta" pecas={fase.paradas}
            titulo={`Na Gráfica há ${DIAS_PARADA} dias ou mais na mesma etapa`} sub="Na mesma etapa" />
          <CartaoDeNumero ctx={ctx} testId="gra-travadas" rotulo={TEXTO_DAS_TRAVADAS.rotulo} icone={Lock} tom="roxo" pecas={fase.travadas}
            titulo={TEXTO_DAS_TRAVADAS.titulo} subtitulo={TEXTO_DAS_TRAVADAS.subtitulo} sub={TEXTO_DAS_TRAVADAS.sub} />
          <CartaoDeNumero ctx={ctx} testId="gra-entregues" rotulo="Entregues" icone={CheckCircle2} tom="sucesso" pecas={recentes.pecas}
            titulo={`Entregues nos últimos ${recentes.janelaDias} dias`}
            sub={`Em ${recentes.janelaDias} dias · ${recentes.foraDoPrazo.length > 0 ? `${fmtInt(recentes.foraDoPrazo.length)} depois da saída` : "nenhuma depois da saída"}`} />
        </GradeDeNumeros>
      </section>

      {/* As seis etapas são altas e a idade é baixa: lado a lado deixavam um
          buraco embaixo da idade. As etapas vão na largura toda, e a idade faz
          par com a fila de cada mão, que tem a mesma altura. */}
      <SecaoDaAnalise id="h-gra-etapas" testId="gra-etapas" titulo="As etapas da Gráfica" descricao="Pelo status de cada peça: quantas em cada etapa, quantas atrasadas, paradas ou travadas.">
        <FluxoDeEtapas ctx={ctx} etapas={etapas} agruparPorFase={false} mostrarEntregue={false} testId="gra-fluxo" />
      </SecaoDaAnalise>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(460px, 100%), 1fr))", gap: 20, alignItems: "stretch" }}>
        <SecaoDaAnalise id="h-gra-idade" titulo="Há quanto tempo na Gráfica" descricao="Dias desde a última mudança de status de cada peça na Gráfica.">
          <DistribuicaoDeIdade ctx={ctx} grupo={fase} contexto="na Gráfica" testId="gra-idade" />
        </SecaoDaAnalise>

        <SecaoDaAnalise
          id="h-gra-maos"
          testId="gra-maos"
          titulo="A fila de cada mão"
          descricao="Depois da impressora, a peça pode estar em duas filas ao mesmo tempo (6 de 10 impressas já esperam a conferência enquanto 4 imprimem). “Parcial” está na fila pelo saldo, não pelo status — a conta dos cartões da tela da Gráfica."
        >
          <TabelaCompacta<LinhaDaMao>
            testId="tabela-gra-maos"
            legenda="Peças em cada fila depois da impressora, com as parciais"
            linhas={dados.maos}
            chave={(l) => l.id}
            minLargura={440}
            colunas={[
              { id: "mao", rotulo: "Fila", valor: (l) => l.rotulo,
                render: (l) => <span style={{ display: "flex", flexDirection: "column" }}><span>{l.rotulo}</span><span style={{ fontSize: FS.small, fontWeight: FW.corpo, color: T.second }}>{l.frase}</span></span> },
              { id: "total", rotulo: "Na fila", alinhar: "direita", valor: (l) => l.total.length,
                render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.total} forte vazio="0" titulo={`${l.rotulo} — todas`} testId={`gra-mao-${l.id}`} /> },
              { id: "status", rotulo: "Pelo status", alinhar: "direita", ocultarNoCelular: true, titulo: "O status da peça já é esta etapa", valor: (l) => l.peloStatus.length,
                render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.peloStatus} titulo={`${l.rotulo} — pelo status`} /> },
              { id: "parcial", rotulo: "Parcial", alinhar: "direita", titulo: "Na fila pelo saldo: parte da peça ainda está na etapa anterior", valor: (l) => l.parcial.length,
                render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.parcial} tom="info" titulo={`${l.rotulo} — parciais`} subtitulo="Parte da peça ainda está na etapa anterior" testId={`gra-parcial-${l.id}`} /> },
              { id: "atrasadas", rotulo: "Atrasadas", alinhar: "direita", valor: (l) => l.grupo.atrasadas.length,
                render: (l) => <BotaoDeContagem ctx={ctx} pecas={l.grupo.atrasadas} tom="perigo" titulo={`${l.rotulo} — atrasadas`} /> },
            ]}
          />
        </SecaoDaAnalise>
      </div>

      <SecaoDaAnalise id="h-gra-maquinas" testId="gra-maquinas" titulo="As impressoras" descricao="O diário de cada impressora no período (registros de impressão parcial e de conclusão) e o que está nela agora.">
        <BlocoDaOperacao ctx={ctx} titulo="Diário das impressoras">
          {(op) => (
            <ListaDeBarras
              testId="gra-lista-maquinas"
              legenda={`Unidades impressas por impressora ${rotuloDaJanela(op)}`}
              itens={op.grafica.porMaquina.map((m) => {
                const agora = naImpressora(m.codigo);
                return {
                  id: m.codigo,
                  rotulo: m.maquina,
                  valor: m.unidades,
                  cor: m.unidades > 0 ? TOM.laranja.dot : TOM.neutro.dot,
                  texto: `${fmtInt(m.unidades)} un.`,
                  detalhe: (
                    <>
                      <span>{fmtM2(m.m2)}</span>
                      <span>{fmtInt(m.registros)} {plural(m.registros, "registro", "registros")}</span>
                      <span>{fmtInt(m.pecas)} {plural(m.pecas, "peça", "peças")} no período</span>
                      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}>
                        Imprimindo agora: <BotaoDeContagem ctx={ctx} pecas={agora.imprimindo} vazio="nenhuma" titulo={`${m.maquina} — imprimindo agora`} testId={`gra-maq-agora-${m.codigo}`} />
                      </span>
                      {agora.reservadas.length > 0 && (
                        <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}>
                          Reservadas: <BotaoDeContagem ctx={ctx} pecas={agora.reservadas} titulo={`${m.maquina} — reservadas para ela`} />
                        </span>
                      )}
                    </>
                  ),
                };
              })}
              vazio="Nenhuma impressora cadastrada."
            />
          )}
        </BlocoDaOperacao>
      </SecaoDaAnalise>

      <SecaoDaAnalise
        id="h-gra-producao"
        testId="gra-producao"
        titulo="Produção por dia"
        descricao="Unidades e m² impressos a cada dia do período, somando todas as impressoras."
        acoes={
          <Segmentado
            rotuloDaLista="Medida do gráfico"
            prefixoDeTestId="gra-medida"
            tamanho={ctx.isMobile ? "toque" : "sm"}
            ativo={medida}
            aoTrocar={(v) => setMedida(v as "unidades" | "m2")}
            itens={[{ id: "unidades", rotulo: "Unidades" }, { id: "m2", rotulo: "m²" }]}
          />
        }
      >
        <BlocoDaOperacao ctx={ctx} titulo="Produção por dia">
          {(op) => <ProducaoPorDia g={op.grafica} medida={medida} janela={rotuloDaJanela(op)} />}
        </BlocoDaOperacao>
      </SecaoDaAnalise>

      <SecaoDaAnalise id="h-gra-embalagem" testId="gra-embalagem" titulo="Embalagem e entrega" descricao="Unidades embaladas e entregues a cada dia, e os volumes (tubos e avulsos) que ainda não saíram.">
        <BlocoDaOperacao ctx={ctx} titulo="Embalagem e entrega">
          {(op) => {
            const g = op.grafica;
            const emb = g.embaladasPorDia.reduce((t, d) => t + d.embaladas, 0);
            const ent = g.embaladasPorDia.reduce((t, d) => t + d.entregues, 0);
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <GradeDeNumeros minimo={150} rotulo="Volumes">
                  <NumeroDoServidor testId="gra-tubos-abertos" rotulo="Tubos abertos" valor={g.tubos.abertos} sub="Ainda recebendo peças" />
                  <NumeroDoServidor testId="gra-tubos-fechados" rotulo="Tubos fechados" valor={g.tubos.fechados} sub="Prontos, não entregues" />
                  <NumeroDoServidor testId="gra-avulsos" rotulo="Avulsos não entregues" valor={g.tubos.avulsosAbertos} />
                  <NumeroDoServidor testId="gra-volumes-entregues" rotulo={`Volumes entregues ${rotuloDaJanela(op)}`} valor={g.tubos.entreguesNoPeriodo} sub="Tubos e avulsos" />
                </GradeDeNumeros>
                <p style={{ margin: 0, fontSize: FS.small, color: T.second }}>
                  <strong style={{ color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmtInt(emb)}</strong> {plural(emb, "unidade embalada", "unidades embaladas")} e{" "}
                  <strong style={{ color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmtInt(ent)}</strong> {plural(ent, "entregue", "entregues")} {rotuloDaJanela(op)}.
                </p>
                <GraficoPorDia
                  testId="gra-grafico-embalagem"
                  legenda={`Unidades embaladas e entregues por dia ${rotuloDaJanela(op)}`}
                  dados={g.embaladasPorDia.map((d) => ({ rotulo: fmtDia(d.dia), embaladas: d.embaladas, entregues: d.entregues }))}
                  series={[
                    { chave: "embaladas", nome: "Embaladas", cor: TOM.info.dot },
                    { chave: "entregues", nome: "Entregues", cor: TOM.sucesso.dot },
                  ]}
                  unidade={(n) => `${fmtInt(n)} un.`}
                />
              </div>
            );
          }}
        </BlocoDaOperacao>
      </SecaoDaAnalise>

      <AvisoDeCobertura
        testId="gra-cobertura"
        itens={[
          "O estado das filas vem das peças e segue todos os filtros do topo; impressoras, produção por dia e volumes vêm do levantamento do servidor, que segue só o evento e o patrocinador.",
          "Unidades impressas são as dos registros de impressão parcial e de conclusão do diário (a régua do Resumo do dia da aba Máquinas); m² = unidades × m² por unidade da peça.",
          dados.semImpressora.length > 0 && <>
            <BotaoDeContagem ctx={ctx} pecas={dados.semImpressora} titulo="Em impressão sem impressora anotada" />{" "}
            {plural(dados.semImpressora.length, "peça está", "peças estão")} em impressão sem impressora anotada (de antes do controle de máquinas) e não {plural(dados.semImpressora.length, "aparece", "aparecem")} em nenhuma impressora.
          </>,
          fase.idade.desconhecida.length > 0 && `${fmtInt(fase.idade.desconhecida.length)} ${plural(fase.idade.desconhecida.length, "peça não tem", "peças não têm")} registro de quando entrou na etapa — idade desconhecida.`,
        ]}
      />
    </div>
  );
}

function ProducaoPorDia({ g, medida, janela }: { g: GraficaDaOperacao; medida: "unidades" | "m2"; janela: string }) {
  const totalUn = g.porDia.reduce((t, d) => t + d.unidades, 0);
  const totalM2 = g.porDia.reduce((t, d) => t + d.m2, 0);
  const comProducao = g.porDia.filter((d) => d.unidades > 0).length;
  const pico = g.porDia.reduce<GraficaDaOperacao["porDia"][number] | null>((m, d) => (!m || d.unidades > m.unidades ? d : m), null);
  const dados = React.useMemo(
    () => g.porDia.map((d) => ({ rotulo: fmtDia(d.dia), valor: medida === "m2" ? Math.round(d.m2 * 10) / 10 : d.unidades })),
    [g.porDia, medida]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <GradeDeNumeros minimo={150} rotulo={`Produção ${janela}`}>
        <NumeroDoServidor testId="gra-total-unidades" rotulo={`Unidades ${janela}`} valor={totalUn} />
        <NumeroDoServidor testId="gra-total-m2" rotulo={`m² ${janela}`} valor={fmtM2(totalM2)} />
        <NumeroDoServidor rotulo="Dias com impressão" valor={comProducao} sub={`de ${fmtInt(g.porDia.length)} dias no gráfico`} />
        <NumeroDoServidor rotulo="Dia de maior produção" valor={pico && pico.unidades > 0 ? fmtDia(pico.dia) : "—"}
          sub={pico && pico.unidades > 0 ? `${fmtInt(pico.unidades)} un. · ${fmtM2(pico.m2)}` : "Nenhuma impressão no período"} />
      </GradeDeNumeros>
      <GraficoPorDia
        testId="gra-grafico-producao"
        legenda={`${medida === "m2" ? "Metros quadrados" : "Unidades"} impressos por dia ${janela}`}
        dados={dados}
        series={[{ chave: "valor", nome: medida === "m2" ? "m² impressos" : "Unidades impressas", cor: TOM.laranja.dot }]}
        unidade={medida === "m2" ? fmtM2 : (n) => `${fmtInt(n)} un.`}
      />
    </div>
  );
}
