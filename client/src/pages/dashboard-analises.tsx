import { useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ehBookCompleto } from "@shared/fluxo-peca";
import { FilterSelect } from "@/components/filter-select";
import {
  Bar, BarChart, CartesianGrid, Cell, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  ArrowDown, ArrowUp, Building2, Calendar, ChevronDown, ChevronRight,
  Check, Clock, Download, RotateCcw, SlidersHorizontal, X, AlertTriangle, ArrowRight,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useLocation } from "wouter";
import { fmtRelative } from "@/components/prazos/tokens";
import { useIsMobile, useDensidadeDoConteudo } from "@/hooks/use-mobile";
// Tokens canônicos — a paleta local divergia do resto do app e T.muted era
// usado como cor de TEXTO, o que reprova AA em todas as superfícies.
import { T, FS, R, SHADOW, TOM, FONT, FW } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { Segmentado } from "@/components/ui/abas";
import { Selo } from "@/components/ui/selo";
import { CartaoKpi } from "@/components/ui/cartao-kpi";
import { EstadoVazio, EstadoErro } from "@/components/ui/estados";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { isOutOfFunnel } from "@/lib/analises-status";
import type { AnaliseEvent, AnaliseItem, AnaliseSponsor } from "@/lib/analises-metrics";
import {
  businessDayMs, cycleWindow, eventCycleDayIndex, filterItems, pickDefaultPeriod, previousWindow, qtyOf,
} from "@/lib/analises-metrics";
import type { Capacidade } from "@/lib/analises-capacidade";
import {
  computeCapacidade, rotuloSemana,
} from "@/lib/analises-capacidade";
import type { Variacao } from "@/lib/analises-desempenho";
import {
  computeDesempenho, computeOfensores, ordenarOfensores, rotaDoOfensor, variacao,
} from "@/lib/analises-desempenho";
import type { OfensorDim, OfensorOrdem, OfensorRow } from "@/lib/analises-desempenho";
import type { TempoPorEtapa } from "@shared/tempo-etapas-contract";
import { temBaseParaExibir } from "@shared/tempo-etapas-contract";
import { diferencaContraPlano, etapaMaisCara, frasesDeCobertura } from "@/lib/analises-tempo";

/* Laranja para TEXTO e para objeto gráfico (orange-700): o T.accent saturado
   fica em ~2,8:1 sobre branco — vale para bordas, nunca para rótulo legível
   nem para barra que carrega significado (1.4.11 pede 3:1). */
const ACCENT_TEXT = T.accentText;
/* Verde/vermelho de julgamento: o `text` de TOM.sucesso e TOM.perigo passa AA
   sobre branco como TEXTO, que é como aparecem (seta + número). */
const BOM = TOM.sucesso.text;
const RUIM = TOM.perigo.text;
/* Cinza de objeto gráfico (a linha da média): o `dot` do neutro, que é tom de
   desenho e não de texto — e passa os 3:1 que o 1.4.11 pede sobre branco. */
const GRAFICO_NEUTRO = TOM.neutro.dot;

/* ── Ritmo vertical ──
   Quatro degraus, e é a HIERARQUIA entre eles que agrupa: o que pertence à
   mesma ideia usa o degrau menor, a troca de assunto usa o maior. Antes a tela
   usava 24 / 22 / 16 / 22 / 16 entre blocos — números diferentes o bastante
   para não parecerem sistema e parecidos o bastante para não separarem nada:
   filtro, resultado e indicador ficavam todos à mesma distância e a tela lia
   como uma seção só.

   A escala conversa com as vizinhas: Histórico e Gestão de Prazos usam 28px de
   padding lateral e 18–20px entre o cabeçalho e o conteúdo. A Análises usava
   32px lateral, e era a única. */
const SP = {
  /** Dentro do mesmo elemento (título → subtítulo). */
  intra: 6,
  /** Irmãos da mesma ideia (faixa → KPIs, KPIs → ressalva). */
  junto: 12,
  /** Cabeçalho da página → primeiro conteúdo. */
  bloco: 20,
  /** Troca de assunto (indicadores → planejamento → ofensores). */
  secao: 32,
} as const;

/* Padding da página. 28px na lateral é o que o Histórico e a Gestão de Prazos
   usam; a Análises usava 32 e era a única — a diferença aparecia ao trocar de
   tela pela barra lateral, com o conteúdo dando um passo para dentro. O topo
   caiu de 28 para 24 porque a primeira dobra desta tela é disputada: KPIs,
   gráfico de 21 semanas e a tabela de ofensores, tudo abaixo. */
/* O topo saiu para uma constante propria porque o cabecalho grudento da
   tabela de ofensores desconta ELE: a pagina e o proprio scroller, e
   `top: 0` prenderia o cabecalho na borda do CONTEUDO, deixando uma faixa
   de `padding` acima por onde as linhas passavam aparecendo. */
const PADDING_TOPO = (isMobile: boolean) => (isMobile ? 14 : 24);

const PADDING_PAGINA = (isMobile: boolean) =>
  isMobile ? `${PADDING_TOPO(true)}px 14px 40px` : `${PADDING_TOPO(false)}px 28px 56px`;

/* ── Contrastes calculados (WCAG 2.1; todo texto ≤13px exige 4,5:1) ──
   Superfícies desta tela: branco #ffffff (cards), #f3f4f3 (faixa de filtros e
   cabeçalho de tabela) e #f9f9f8 (fundo da página).

     resumo do recorte    #746e69 / #f3f4f3 =  4,56:1 ✓
     número do resumo     #1a1c1c / #f3f4f3 = 15,52:1 ✓
     "Limpar tudo" ligado #b91c1c / #fef2f2 =  5,91:1 ✓
     "Limpar tudo" apagado#57534e / #f3f4f3 =  6,92:1 ✓
     gatilho inativo      #1c1917 / #ffffff = 17,49:1 ✓
     gatilho ativo cheio  #ffffff / #c2410c =  5,18:1 ✓
     botão Filtros (cel.) #ffffff / #c2410c =  5,18:1 ✓
     texto secundário     #746e69 / #ffffff =  5,03:1 ✓ · / #f9f9f8 = 4,77:1 ✓
     selo de dado velho   #b45309 / #f9f9f8 =  4,77:1 ✓
     variação boa/ruim    #15803d / #ffffff =  5,02:1 ✓ · #b91c1c = 6,47:1 ✓
   Objeto gráfico (1.4.11 pede 3:1): média concluída #78716c / #ffffff = 4,80:1 ✓
   (Os hex acima são o REGISTRO da medição; o código usa os tokens.) */

/* Data por extenso para a frase de cobertura. `format()` do date-fns LANÇA em
   data inválida e esta tela não tem error boundary — a guarda é a mesma que
   analises-metrics.ts aplica em toda leitura de data. */
const dataPorExtenso = (iso: string) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? format(d, "d 'de' MMMM 'de' yyyy", { locale: ptBR }) : "—";
};

/* Cor do juízo sobre a diferença contra o plano. "neutro" não ganha verde:
   fechar no combinado é o esperado, não uma vitória. */
const CORES_TOM = { bom: BOM, ruim: RUIM, neutro: T.second } as const;

/* ── Recorte de período ──
   Por CICLO DO EVENTO (saída do caminhão já ocorrida), não por data de criação
   da peça — ver `cycleWindow` em lib/analises-metrics.ts. Os rótulos dizem o
   que está sendo medido: o recorte anterior se chamava "Últimos 7 Dias" e
   empurrava a Taxa de Entrega para zero por construção. */
const PERIODS = [
  { label: "Saídas nos últimos 7 dias",   value: "7d"  },
  { label: "Saídas nos últimos 30 dias",  value: "30d" },
  { label: "Saídas no último trimestre",  value: "90d" },
  { label: "Todo o período",              value: "all" },
];

const DIMENSOES: { value: OfensorDim; label: string; destino: string }[] = [
  { value: "evento",        label: "Evento",        destino: "abre o evento" },
  { value: "tipo",          label: "Tipo de peça",  destino: "abre o Painel Geral filtrado" },
  { value: "patrocinador",  label: "Patrocinador",  destino: "abre o Painel Geral filtrado" },
];

/* As 4 colunas numéricas são também as 4 ordens: clicar no cabeçalho reordena
   pela coluna que se está lendo, sem um controle separado. */
const ORDENS: { value: OfensorOrdem; label: string }[] = [
  { value: "atraso",     label: "Fora do prazo" },
  { value: "retrabalho", label: "Retrabalho" },
  { value: "ciclo",      label: "Ciclo" },
  { value: "volume",     label: "Volume" },
];

// ─── Formatação (pt-BR em tudo) ──────────────────────────────────────────────
const int = (n: number) => Math.round(n).toLocaleString("pt-BR");
const pct = (v: number | null | undefined, casas = 1) =>
  v == null ? "—" : `${v.toFixed(casas).replace(".", ",")}%`;
const m2 = (v: number | null | undefined) =>
  v == null ? "—" : `${int(v)} m²`;
const dias = (v: number | null | undefined) => {
  if (v == null) return "—";
  const n = Math.round(v * 10) / 10;
  const txt = Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
  return `${txt} ${n === 1 ? "dia" : "dias"}`;
};

/* ── Selo de variação ──
   Nunca aparece sozinho: sempre acompanha a frase que diz se subir é bom ou
   ruim. A mesma seta para cima é ótima em "entregas no prazo" e péssima em
   "retrabalho", e os dois cards ficam lado a lado. */
function SeloVariacao({ v, sufixo }: { v: Variacao; sufixo: string }) {
  const Icone = v.direcao === "subiu" ? ArrowUp : ArrowDown;
  const cor = v.positiva ? BOM : RUIM;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: cor, fontSize: FS.small, fontWeight: FW.rotulo }}>
      <Icone aria-hidden="true" style={{ width: 12, height: 12 }} />
      {Math.abs(v.delta) < 10
        ? Math.abs(v.delta).toFixed(1).replace(".", ",")
        : int(Math.abs(v.delta))}
      {sufixo}
      <span style={{ fontWeight: FW.medio }}>{v.positiva ? "melhor" : "pior"}</span>
    </span>
  );
}

/* ── Card de KPI ──
   NO MÓDULO, não dentro do render. O valor não é <h3>: na navegação por
   cabeçalhos de um leitor de tela, a lista de títulos da página virava uma
   sequência de números sem contexto. A casca agora é o <CartaoKpi> da casa
   (rótulo em cima, número, e o `sub` com variação, denominador e link). */
function KpiAnalise({
  rotulo, valor, contexto, v, sufixoVariacao, notaSemComparacao, testId, selo, link, aoNavegar, isMobile,
}: {
  rotulo: string;
  valor: string;
  /** Denominador ou amostra. Regra da tela: nenhum número entra sozinho. */
  contexto: string;
  v: Variacao | null;
  sufixoVariacao: string;
  notaSemComparacao: string;
  testId: string;
  /** Qualifica a variação sem escondê-la (ver SeloRuido). */
  selo?: React.ReactNode;
  /** O caminho para as peças que compõem o número. */
  link?: { href: string; rotulo: string; testId: string } | null;
  aoNavegar?: (href: string) => void;
  isMobile?: boolean;
}) {
  return (
    <CartaoKpi
      data-testid={testId}
      rotulo={rotulo}
      valor={valor}
      sub={
      <>
        <span style={{ display: "block", marginTop: 7, minHeight: 17 }}>
          {v
            ? <>
                <SeloVariacao v={v} sufixo={sufixoVariacao} />
                {selo}
              </>
            : <span style={{ fontSize: FS.small, color: T.second }}>{notaSemComparacao}</span>}
        </span>
        <span style={{ display: "block", marginTop: 7, fontSize: FS.small, color: T.second, lineHeight: 1.4 }}>
          {contexto}
        </span>
        {/* O NÚMERO LEVA ÀS PEÇAS. "Retrabalho 11,2%" é o dado mais acionável
            da tela e terminava em si mesmo: quem quisesse ver as 44 peças
            tinha de adivinhar em qual tela procurar e refazer o recorte à
            mão. O link já vai com o recorte aplicado. */}
        {link && (
          <a href={link.href} data-testid={link.testId}
            onClick={(e) => {
              // Ctrl/Cmd/meio: deixa o navegador abrir em outra aba, que é o
              // gesto de quem quer conferir a lista sem perder o painel.
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              aoNavegar?.(link.href);
            }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8,
              minHeight: isMobile ? 44 : 32, fontSize: FS.small, fontWeight: FW.forte,
              color: ACCENT_TEXT, textDecoration: "none",
            }}>
            {link.rotulo}
            <ArrowRight aria-hidden="true" style={{ width: 12, height: 12 }} />
          </a>
        )}
      </>
      }
    />
  );
}

/* ── Quando a variação é ruído ────────────────────────────────────────────── */
/**
 * A tela afirmava "+3,2 p.p." com a mesma convicção sobre 357 peças e sobre 9.
 * Variação em amostra pequena não é tendência: é sorte de amostra — e num
 * painel que existe para embasar decisão, esse é o defeito mais caro, porque
 * ele não parece defeito.
 *
 * O piso é 30, escolhido pelo dono (24/08). Não é estatística formal; é a
 * régua a partir da qual a casa aceita ler uma variação como sinal. Vale a
 * MENOR das duas janelas: comparar 300 contra 8 é tão frágil quanto 8 contra 8.
 */
export const PISO_AMOSTRA = 30;

function SeloRuido({ atual, anterior, testId }: { atual: number; anterior: number | null | undefined; testId: string }) {
  if (anterior == null) return null;
  const menor = Math.min(atual, anterior);
  if (menor >= PISO_AMOSTRA) return null;
  const qualJanela = atual <= anterior ? "Esta janela tem" : "A janela anterior tem";
  // O <Selo> da casa em alerta: TOM.alerta.text sobre o próprio fundo passa AA.
  return (
    <Selo
      tom="alerta"
      tamanho="sm"
      forma="retangulo"
      icone={AlertTriangle}
      data-testid={testId}
      title={`${qualJanela} só ${int(menor)} ${menor === 1 ? "peça avaliável" : "peças avaliáveis"} — abaixo de ${PISO_AMOSTRA} a variação oscila por acaso e não indica tendência.`}
      style={{ marginLeft: 8, padding: "1px 6px", gap: 4 }}>
      amostra pequena · pode ser ruído
    </Selo>
  );
}

/* ── Tooltip do gráfico de carga ── */
const CargaTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  // Série nula (semana futura) é FILTRADA, não impressa como 0: "Concluído:
  // 0 m²" numa semana que ainda não chegou seria uma afirmação falsa.
  const series = payload.filter((p: any) => p?.value != null);
  const futura = payload.some((p: any) => p?.dataKey === "concluido" && p?.value == null);
  return (
    <div style={{ backgroundColor: T.dark, color: T.surface, borderRadius: R.sm, padding: "9px 12px", fontSize: FS.small, lineHeight: 1.6 }}>
      <div style={{ fontWeight: FW.forte, marginBottom: 4 }}>Semana de {label}</div>
      {series.map((p: any) => (
        <div key={p.dataKey}>{p.name}: {int(p.value)} m²</div>
      ))}
      {futura && <div style={{ color: T.bdark }}>Previsto — ainda não aconteceu</div>}
    </div>
  );
};

/* ── Uma semana do gráfico de carga, já no formato do recharts ── */
interface SemanaDoGrafico {
  label: string;
  demanda: number;
  concluido: number | null;
  futura: boolean;
  atualSemana: boolean;
}

/* ── O gráfico de Capacidade × Demanda, memoizado (PERF-4, 17/09) ──────────
   O recharts é o pedaço mais caro do render desta tela (21 semanas × 2 barras,
   eixos, referências e uma célula por barra) e era redesenhado a CADA render
   da página: o tique de 1 min do "Atualizado há X", trocar a dimensão ou a
   ordem da tabela de ofensores, abrir a gaveta de filtros, o giro de
   "atualizando". Nenhum desses muda uma barra. Aqui ele só redesenha quando
   os dados da carga mudam — todas as props chegam memoizadas da página. */
const GraficoCarga = memo(function GraficoCarga({
  dadosCarga, carga, rotulosQueEstouram, primeiraFutura, ultimaLabel, semanaAtualLabel, apertado,
}: {
  dadosCarga: SemanaDoGrafico[];
  carga: Capacidade;
  rotulosQueEstouram: Set<string>;
  primeiraFutura: string | undefined;
  ultimaLabel: string | undefined;
  semanaAtualLabel: string | undefined;
  /** Área útil apertada: o gráfico ganha largura mínima e rola na caixa. */
  apertado: boolean;
}) {
  // Mesma regra da tabela de ofensores: a caixa do gráfico rola, a página não.
  // Era `visible` fora do celular, e o estouro virava rolagem lateral da PÁGINA.
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: apertado ? 620 : undefined, height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dadosCarga} margin={{ top: 22, right: 8, left: -12, bottom: 0 }} barGap={2}>
            <CartesianGrid stroke={T.border} vertical={false} />
            {primeiraFutura && ultimaLabel && (
              <ReferenceArea
                x1={primeiraFutura} x2={ultimaLabel}
                fill={T.low} fillOpacity={1}
                label={{ value: "PREVISTO", position: "insideTopRight", fill: T.second, fontSize: FS.micro, fontWeight: FW.rotulo, letterSpacing: "0.12em" }}
              />
            )}
            {/* Piso de 10px da casa: o rótulo de 9 do eixo X subiu um degrau. */}
            <XAxis dataKey="label" tick={{ fontSize: FS.micro, fontWeight: FW.forte, fill: T.second, fontFamily: FONT.mono }} axisLine={{ stroke: T.bdark }} tickLine={false} interval={1} />
            <YAxis tick={{ fontSize: FS.micro, fill: T.second }} axisLine={false} tickLine={false} width={54}
              label={{ value: "m²", position: "top", offset: 12, fill: T.second, fontSize: FS.micro, fontWeight: FW.rotulo }} />
            <Tooltip content={<CargaTip />} cursor={{ fill: "rgba(28,25,23,0.05)" }} />
            {semanaAtualLabel && (
              <ReferenceLine x={semanaAtualLabel} stroke={T.dark} strokeWidth={1.5}
                label={{ value: "HOJE", position: "top", fill: T.text, fontSize: FS.micro, fontWeight: FW.rotulo, letterSpacing: "0.1em" }} />
            )}
            {carga.mediaConcluidoM2 != null && carga.mediaConcluidoM2 > 0 && (
              <ReferenceLine y={carga.mediaConcluidoM2} stroke={GRAFICO_NEUTRO} strokeDasharray="5 4" strokeWidth={2} />
            )}
            <Bar dataKey="demanda" name="Vence" fill={ACCENT_TEXT} maxBarSize={26} isAnimationActive={false}>
              {/* O anel marca no desenho as MESMAS semanas que a
                  faixa nomeia — senão são duas leituras a conferir
                  uma contra a outra. */}
              {dadosCarga.map((d) => (
                <Cell key={d.label}
                  stroke={rotulosQueEstouram.has(d.label) ? TOM.alerta.text : "none"}
                  strokeWidth={rotulosQueEstouram.has(d.label) ? 1.5 : 0} />
              ))}
            </Bar>
            <Bar dataKey="concluido" name="Concluído" fill={T.dark} maxBarSize={26} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

/* ── Bloco vazio: "não há dado" é diferente de "o filtro comeu tudo" ──
   O <EstadoVazio> da casa. Quando foi o filtro, a saída é o botão (alvo de
   44: é a ÚNICA saída de um bloco que o filtro esvaziou); quando não foi, a
   frase diz que este é o estado real da base. */
function Vazio({ porFiltro, real, aoLimpar }: { porFiltro: boolean; real: string; aoLimpar: () => void }) {
  return (
    <EstadoVazio
      compacto
      titulo={porFiltro ? "Nenhuma peça neste recorte" : real}
      descricao={porFiltro ? undefined : "Nada foi filtrado — este é o estado real da base."}
      acao={porFiltro ? (
        <Botao tamanho="toque" icone={X} onClick={aoLimpar}>
          Limpar os filtros e ver tudo
        </Botao>
      ) : undefined}
    />
  );
}

// Chaves do recorte na URL — regra da casa (o recorte tem de ser
// compartilhável, sobreviver a um F5 e voltar com o botão Voltar).
const URL_KEYS = {
  period: "periodo", event: "evento", sponsor: "patrocinador",
  dim: "dimensao", ordem: "ordem",
} as const;

function lerFiltrosDaUrl() {
  const p = new URLSearchParams(window.location.search);
  const val = (k: string) => p.get(k) || "all";
  const dim = p.get(URL_KEYS.dim) as OfensorDim | null;
  const ordem = p.get(URL_KEYS.ordem) as OfensorOrdem | null;
  return {
    /* Distinguir "a URL não trouxe período" de "a URL trouxe `all`" é o que
       permite abrir num padrão sem sequestrar a escolha de quem colou um link
       ou apertou Voltar pedindo explicitamente todo o período. */
    periodoAusente: !p.get(URL_KEYS.period),
    period: PERIODS.some((x) => x.value === val(URL_KEYS.period)) ? val(URL_KEYS.period) : "all",
    event: val(URL_KEYS.event),
    sponsor: val(URL_KEYS.sponsor),
    dim: DIMENSOES.some((d) => d.value === dim) ? dim! : "evento",
    ordem: ORDENS.some((o) => o.value === ordem) ? ordem! : "atraso",
  };
}

const SEM_EVENTOS: AnaliseEvent[] = [];
const SEM_ITENS: AnaliseItem[] = [];
const SEM_PATROCINADORES: AnaliseSponsor[] = [];

export default function DashboardAnalises() {
  const isMobile = useIsMobile();
  // RÉGUA PELA ÁREA ÚTIL para o que é LAYOUT (grade dos KPIs, rolagem do
  // gráfico): com a barra lateral aberta num tablet a janela diz "desktop" e
  // sobram ~700px. `isMobile` segue para o que é de fato celular: a gaveta de
  // filtros, o gutter e os alvos de 44px.
  const { ref: raizRef, cards: apertado } = useDensidadeDoConteudo<HTMLDivElement>(isMobile ? 28 : 56);
  // A MESMA caixa nos três estados (erro, carregando, tela): o React mantém o
  // nó entre eles, e a medição não se perde quando a carga termina.
  const naRaiz = (filho: React.ReactNode) => <div ref={raizRef} style={{ height: "100%" }}>{filho}</div>;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const inicial = useMemo(lerFiltrosDaUrl, []);
  const [period, setPeriod] = useState(inicial.period);
  const [eventFilter, setEventFilter] = useState(inicial.event);
  const [sponsorFilter, setSponsorFilter] = useState(inicial.sponsor);
  const [dim, setDim] = useState<OfensorDim>(inicial.dim);
  const [ordem, setOrdem] = useState<OfensorOrdem>(inicial.ordem);
  /* Enquanto ligado, o período ainda não foi escolhido por ninguém: a tela
     abriu sem `?periodo=` e vai resolver um padrão assim que os dados
     chegarem. Qualquer toque do usuário desliga isto para sempre. */
  const [periodoAutomatico, setPeriodoAutomatico] = useState(inicial.periodoAusente);
  /* O período padrão É um filtro, e a tela não pode fingir que não é: com ele
     ligado o resumo diria "1 filtro ativo" para um recorte que ninguém
     escolheu. Enquanto ninguém tiver tocado nele, o resumo diz "Período
     padrão" — é a mesma verdade, com a origem declarada. */
  const [periodoPadraoAplicado, setPeriodoPadraoAplicado] = useState(false);
  /* Gaveta de filtros do celular (o desktop mostra a faixa inteira). */
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  // Override LOCAL do queryClient (o default global é staleTime: Infinity,
  // sem refetch em foco e sem polling). A tela afirmava "Dados em tempo real"
  // sobre isso, e /api/sponsors não é invalidado por NENHUM handler de
  // WebSocket — a lista ficava congelada desde o primeiro mount da sessão.
  // Sem botão "Atualizar": a tela se atualiza sozinha (decisão do dono); o
  // polling é a rede de segurança para o socket morrer em silêncio.
  const freshness = {
    staleTime: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 300_000, // 5min (auditoria 27/08): o WebSocket cobre o tempo real; isto é só a rede de segurança de socket morto
  } as const;
  const evQ = useQuery<AnaliseEvent[]>({ queryKey: ["/api/events"], ...freshness });
  const itQ = useQuery<AnaliseItem[]>({ queryKey: ["/api/items"], ...freshness });
  const spQ = useQuery<AnaliseSponsor[]>({ queryKey: ["/api/sponsors"], ...freshness });
  // Tempo por etapa é o único agregado desta tela que NÃO sai de /api/items: a
  // permanência mora na trilha de auditoria, e baixar a trilha para o navegador
  // custaria dezenas de MB. O recorte vai na URL porque o servidor precisa
  // aplicar os MESMOS filtros — o rodapé do bloco declara cobertura sobre a
  // população do recorte, e recorte diferente ali seria número honesto sobre a
  // base errada. Falha isolada de propósito (ver `isError`): o bloco some, o
  // resto da tela continua de pé.
  const tempoQ = useQuery<TempoPorEtapa>({
    queryKey: [
      `/api/analises/tempo-por-etapa?periodo=${encodeURIComponent(period)}`
      + `&evento=${encodeURIComponent(eventFilter)}`
      + `&patrocinador=${encodeURIComponent(sponsorFilter)}`,
    ],
    ...freshness,
  });
  // Vazios de MÓDULO, não `?? []`: um literal novo a cada render mudaria a
  // identidade de todas as dependências dos memos abaixo enquanto uma das
  // fontes carrega, e cada agregado seria refeito em todo render.
  const events = evQ.data ?? SEM_EVENTOS;
  // BOOK COMPLETO não é peça: é o trâmite de aprovação do Atendimento e some
  // de toda contagem (shared/fluxo-peca). O servidor já o tira do tempo por etapa.
  const items = useMemo(() => (itQ.data ? itQ.data.filter((i) => !ehBookCompleto(i)) : SEM_ITENS), [itQ.data]);
  const sponsors = spQ.data ?? SEM_PATROCINADORES;
  const isLoading = evQ.isLoading || itQ.isLoading || spQ.isLoading;
  // Qualquer uma das 3 fontes falhando distorce os números em silêncio (sem
  // /api/events não há saída do caminhão, e sem ela TODA métrica de prazo desta
  // tela vira outra coisa). Por isso o erro é da tela inteira e não por bloco:
  // meio painel de números certos ao lado de meio painel de números errados é
  // pior do que nenhum painel.
  const isError = evQ.isError || itQ.isError || spQ.isError;
  const isFetching = evQ.isFetching || itQ.isFetching || spQ.isFetching;
  const retryAll = () => {
    // Invalidar (e não só refetch) inclui /api/sponsors, que nenhum handler de
    // WebSocket toca: sem isto o "tentar de novo" recarregava dado morto.
    queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    queryClient.invalidateQueries({ queryKey: ["/api/sponsors"] });
  };

  // Tick de 1 min. É a ÂNCORA DE DATA de toda a tela — antes cada render criava
  // um `new Date()` dentro de `cutoff(period)`, e esse objeto era dependência
  // dos agregados: com qualquer período selecionado os sete `useMemo` da tela
  // recalculavam em TODO render. Também alimenta o selo "Atualizado há X" e faz
  // a janela de semanas avançar numa aba deixada aberta pela virada do dia.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Recorte na URL, com debounce (a digitação dentro dos dropdowns dispara
  // mudanças em rajada e um replaceState por tecla trava a navegação).
  const urlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (urlTimer.current) clearTimeout(urlTimer.current);
    urlTimer.current = setTimeout(() => {
      const p = new URLSearchParams(window.location.search);
      const set = (k: string, v: string, padrao: string) => { if (v === padrao) p.delete(k); else p.set(k, v); };
      set(URL_KEYS.period, period, "all");
      set(URL_KEYS.event, eventFilter, "all");
      set(URL_KEYS.sponsor, sponsorFilter, "all");
      set(URL_KEYS.dim, dim, "evento");
      set(URL_KEYS.ordem, ordem, "atraso");
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    }, 250);
    return () => { if (urlTimer.current) clearTimeout(urlTimer.current); };
  }, [period, eventFilter, sponsorFilter, dim, ordem]);

  useEffect(() => {
    const onPop = () => {
      const f = lerFiltrosDaUrl();
      setPeriod(f.period); setEventFilter(f.event); setSponsorFilter(f.sponsor);
      setDim(f.dim); setOrdem(f.ordem);
      // Voltar para um endereço sem `?periodo=` devolve a tela ao padrão
      // automático — é o mesmo estado em que ela teria sido aberta ali.
      setPeriodoAutomatico(f.periodoAusente);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Trocar o período é sempre uma escolha explícita — desliga o padrão
  // automático para que o próximo tick de dados não o reescreva por baixo.
  const escolherPeriodo = (v: string) => {
    setPeriodoAutomatico(false); setPeriodoPadraoAplicado(false); setPeriod(v);
  };
  const limparFiltros = () => {
    setPeriodoAutomatico(false); setPeriodoPadraoAplicado(false);
    setPeriod("all"); setEventFilter("all"); setSponsorFilter("all");
  };

  // Ciclo do evento (saída do caminhão) — é por ele que o período recorta e é
  // contra ele que "no prazo" é medido.
  const cycleDayByEvent = useMemo(() => eventCycleDayIndex(events), [events]);

  /* ── Período de abertura ──
     A tela abria em "Todo o período", e "todo o período" não tem janela
     anterior: os quatro KPIs davam as boas-vindas com "Escolha um período para
     comparar". Estava tecnicamente certo e mesmo assim errado — um painel cujo
     primeiro contato são quatro cartões que não comparam nada não está
     respondendo, está pedindo configuração.
     `pickDefaultPeriod` escolhe o menor recorte que TEM as duas janelas com
     peça dentro (30 dias, depois o trimestre); não havendo nenhum, devolve
     "all" e a tela volta a declarar a ausência em vez de inventar comparação.
     Roda uma vez, quando os dados chegam — a partir daí o período é do
     usuário. */
  useEffect(() => {
    if (!periodoAutomatico || items.length === 0) return;
    const escolhido = pickDefaultPeriod(items, cycleDayByEvent, agora);
    setPeriod(escolhido);
    setPeriodoPadraoAplicado(escolhido !== "all");
    setPeriodoAutomatico(false);
  }, [periodoAutomatico, items, cycleDayByEvent, agora]);
  const eventNameById = useMemo(() => new Map(events.map((e) => [e.id, e.name])), [events]);

  /* ── Âncora de DIA para os agregados (PERF-4, 17/09) ──
     `cycleWindow` e `computeCapacidade` só leem o DIA do negócio de "agora"
     (`businessDayMs`). Com o `agora` cru nas dependências, o tique de 1 min
     refazia as duas janelas de desempenho, a capacidade, os ofensores e o
     gráfico — o painel inteiro, sessenta vezes por hora, para chegar aos
     mesmos números. `agoraDoDia` é o primeiro `agora` visto em cada dia: o
     mesmo resultado, recalculado só na virada do dia. O selo "Atualizado há X"
     continua lendo o `agora` cru. */
  const diaDoNegocio = businessDayMs(agora);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const agoraDoDia = useMemo(() => agora, [diaDoNegocio]);
  const janela = useMemo(() => cycleWindow(period, agoraDoDia), [period, agoraDoDia]);
  const janelaAnterior = useMemo(() => previousWindow(janela), [janela]);

  // Contagem por opção: o usuário escolhia um evento ou patrocinador sem saber
  // se havia uma ou zero peças ali, e cair no zero era o resultado provável.
  const contagens = useMemo(() => {
    const porEvento = new Map<string, number>();
    const porPatrocinador = new Map<string, number>();
    let totalFunil = 0;
    for (const i of items) {
      const q = qtyOf(i);
      porEvento.set(i.eventId, (porEvento.get(i.eventId) ?? 0) + q);
      for (const s of i.sponsors || []) {
        if (s?.id) porPatrocinador.set(s.id, (porPatrocinador.get(s.id) ?? 0) + q);
      }
      if (!isOutOfFunnel(i.status)) totalFunil += q;
    }
    return { porEvento, porPatrocinador, totalFunil };
  }, [items]);

  const fItems = useMemo(
    () => filterItems(items, cycleDayByEvent, { window: janela, eventFilter, sponsorFilter }),
    [items, cycleDayByEvent, janela, eventFilter, sponsorFilter]);

  const fItemsAnterior = useMemo(
    () => (janelaAnterior
      ? filterItems(items, cycleDayByEvent, { window: janelaAnterior, eventFilter, sponsorFilter })
      : []),
    [items, cycleDayByEvent, janelaAnterior, eventFilter, sponsorFilter]);

  // O bloco de carga ignora o filtro de PERÍODO de propósito (janela fixa de
  // 12+8 semanas), mas segue o de evento/patrocinador — é o mesmo recorte de
  // "quem" da tela toda. O escopo é carimbado em texto no bloco.
  const itemsCarga = useMemo(
    () => filterItems(items, cycleDayByEvent, { window: null, eventFilter, sponsorFilter }),
    [items, cycleDayByEvent, eventFilter, sponsorFilter]);

  const atual = useMemo(() => computeDesempenho(fItems, cycleDayByEvent), [fItems, cycleDayByEvent]);
  const anterior = useMemo(
    () => (janelaAnterior ? computeDesempenho(fItemsAnterior, cycleDayByEvent) : null),
    [janelaAnterior, fItemsAnterior, cycleDayByEvent]);

  const carga = useMemo(
    () => computeCapacidade({ items: itemsCarga, cycleDayByEvent, nowMs: agoraDoDia }),
    [itemsCarga, cycleDayByEvent, agoraDoDia]);

  /* Tempo por etapa já chega agregado do servidor — aqui só se decide se há
     base para o bloco existir e qual etapa lidera a perda. */
  const tempo = temBaseParaExibir(tempoQ.data) ? tempoQ.data! : null;
  const piorEtapa = tempo ? etapaMaisCara(tempo) : null;

  // Agrupar e ordenar em dois memos: trocar a ORDEM (clique no cabeçalho) só
  // reordena as linhas já agregadas, em vez de reagrupar o recorte inteiro.
  const ofensoresAgrupados = useMemo(
    () => computeOfensores(fItems, dim, { cycleDayByEvent, eventNameById, sponsors }),
    [fItems, dim, cycleDayByEvent, eventNameById, sponsors]);
  const ofensores = useMemo(
    () => ordenarOfensores(ofensoresAgrupados, ordem),
    [ofensoresAgrupados, ordem]);

  // ── Estados que precisam ser distinguidos ────────────────────────────────
  const filtrosAtivos = [period !== "all", eventFilter !== "all", sponsorFilter !== "all"].filter(Boolean).length;
  const recorteVazio = fItems.length === 0 && filtrosAtivos > 0;
  const baseVazia = items.length === 0;

  // Selo de frescor: o dado é tão velho quanto a MAIS velha das três fontes.
  const atualizadoEmMs = Math.min(
    evQ.dataUpdatedAt || agora, itQ.dataUpdatedAt || agora, spQ.dataUpdatedAt || agora,
  );
  const dadoVelho = agora - atualizadoEmMs >= 10 * 60_000;

  // Três motivos diferentes para não haver seta, três frases diferentes. Um
  // "0%" no lugar da variação seria lido como "não mudou nada", que é a única
  // leitura que os três casos NÃO permitem.
  // "Escolha um período para comparar" era uma INSTRUÇÃO, e a tela abria com
  // ela nos quatro cartões. Agora a tela já abre num período com janela
  // anterior de verdade, e a frase de "todo o período" volta a ser o que
  // sempre deveria ter sido: a constatação de um fato do recorte escolhido.
  const notaSem = (a: number | null, b: number | null | undefined): string => {
    if (!anterior) return period === "all" ? "Todo o período não tem anterior" : "Sem período anterior comparável";
    if (a == null || b == null) return "Sem base nos dois períodos";
    return "Igual ao período anterior";
  };

  /**
   * O RECORTE VIAJA COM O CLIQUE.
   *
   * Evento e patrocinador vão porque o Painel Geral já os entende com os mesmos
   * nomes de parâmetro. O PERÍODO não vai: a janela daqui é de SAÍDA DE
   * CAMINHÃO e a de lá é de proximidade da saída — mandar o período faria a
   * lista discordar do número que a abriu, que é pior que não filtrar.
   */
  const recorteNoLink = (extra: Record<string, string>) => {
    const q = new URLSearchParams();
    if (eventFilter !== "all") q.set("evento", eventFilter);
    if (sponsorFilter !== "all") q.set("patrocinador", sponsorFilter);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    return `/?${q.toString()}`;
  };

  const kpis = [
    {
      testId: "kpi-prazo",
      rotulo: "Entregas no prazo",
      valor: pct(atual.prazoRate),
      contexto: atual.prazoAvaliadas > 0
        ? `${int(atual.prazoNoPrazo)} de ${int(atual.prazoAvaliadas)} peças entregues chegaram até a saída do caminhão`
        : "Nenhuma entrega com data para avaliar neste recorte",
      v: variacao(atual.prazoRate, anterior?.prazoRate, true),
      sufixo: " p.p. · ",
      nota: notaSem(atual.prazoRate, anterior?.prazoRate),
      amostra: atual.prazoAvaliadas,
      amostraAnterior: anterior?.prazoAvaliadas,
      link: atual.prazoAvaliadas > atual.prazoNoPrazo
        ? {
            href: recorteNoLink({ foco: "fora-do-prazo" }),
            rotulo: `Ver as ${int(atual.prazoAvaliadas - atual.prazoNoPrazo)} fora do prazo`,
            testId: "link-kpi-prazo",
          }
        : null,
    },
    {
      testId: "kpi-ciclo",
      rotulo: "Ciclo de entrega (mediana)",
      valor: dias(atual.cicloMedianaDias),
      contexto: atual.cicloAmostra > 0
        ? `Da criação da peça à entrega, mediana de ${int(atual.cicloAmostra)} ${atual.cicloAmostra === 1 ? "item" : "itens"}`
        : "Nenhum item entregue com data de criação e entrega",
      v: variacao(atual.cicloMedianaDias, anterior?.cicloMedianaDias, false),
      sufixo: " dias · ",
      nota: notaSem(atual.cicloMedianaDias, anterior?.cicloMedianaDias),
      amostra: atual.cicloAmostra,
      amostraAnterior: anterior?.cicloAmostra,
      // A mediana não tem "as N piores": o que responde ao clique é a lista
      // ORDENADA pelo ciclo, com as mais demoradas no topo.
      link: atual.cicloAmostra > 0
        ? {
            href: recorteNoLink({ ordem: "ciclo" }),
            rotulo: "Ver as mais demoradas",
            testId: "link-kpi-ciclo",
          }
        : null,
    },
    {
      testId: "kpi-retrabalho",
      rotulo: "Retrabalho",
      valor: pct(atual.retrabalhoRate),
      contexto: atual.pecasTotal > 0
        ? `${int(atual.retrabalhoPecas)} de ${int(atual.pecasTotal)} peças tiveram arte refeita ou estão reprovadas`
        : "Sem peças no recorte",
      v: variacao(atual.retrabalhoRate, anterior?.retrabalhoRate, false),
      sufixo: " p.p. · ",
      nota: notaSem(atual.retrabalhoRate, anterior?.retrabalhoRate),
      amostra: atual.pecasTotal,
      amostraAnterior: anterior?.pecasTotal,
      link: atual.retrabalhoPecas > 0
        ? {
            href: recorteNoLink({ foco: "retrabalho" }),
            rotulo: `Ver as ${int(atual.retrabalhoPecas)} com retrabalho`,
            testId: "link-kpi-retrabalho",
          }
        : null,
    },
    {
      testId: "kpi-m2",
      rotulo: "Volume entregue",
      valor: m2(atual.m2Entregue),
      contexto: atual.m2Entregue > 0
        ? `Soma de m² das peças entregues no recorte${atual.m2SemMedida > 0 ? ` · ${int(atual.m2SemMedida)} sem medida de arquivo` : ""}`
        : "Nenhuma peça entregue com medida de arquivo",
      v: variacao(atual.m2Entregue, anterior?.m2Entregue, true),
      sufixo: " m² · ",
      nota: notaSem(atual.m2Entregue, anterior?.m2Entregue),
      amostra: atual.pecasTotal,
      amostraAnterior: anterior?.pecasTotal,
      // Sem link: m² é uma SOMA, não uma lista de exceções. Não existe "as
      // peças que compõem o volume" como coisa acionável.
      link: null,
    },
  ];

  // Memoizado sobre `carga`: é a identidade destes arrays e do Set abaixo que
  // deixa o gráfico (memo) pular os renders que não mudam barra nenhuma.
  const dadosCarga = useMemo<SemanaDoGrafico[]>(() => carga.semanas.map((s) => ({
    label: rotuloSemana(s.inicioMs),
    demanda: Math.round(s.demandaM2),
    concluido: s.concluidoM2 == null ? null : Math.round(s.concluidoM2),
    futura: !s.passada && !s.atual,
    atualSemana: s.atual,
  })), [carga]);
  // Média de 0 m² não é régua de capacidade nenhuma: sem produção registrada
  // a linha tracejada assentaria no eixo e diria algo que não é verdade.
  const temMedia = carga.mediaConcluidoM2 != null && carga.mediaConcluidoM2 > 0;
  const semanaAtualLabel = dadosCarga.find((d) => d.atualSemana)?.label;
  const primeiraFutura = dadosCarga.find((d) => d.futura)?.label;
  const ultimaLabel = dadosCarga[dadosCarga.length - 1]?.label;
  const cargaVazia = dadosCarga.every((d) => d.demanda === 0 && !d.concluido);

  /**
   * ONDE VAI ESTOURAR.
   *
   * O gráfico desenhava a demanda, o concluído e a linha da média, e deixava a
   * conclusão para o olho: em 21 barras, comparar oito futuras contra uma
   * tracejada é trabalho manual. O bloco existe para ANTECIPAR, e a antecipação
   * não estava escrita em lugar nenhum.
   *
   * Só semanas FUTURAS entram: a semana passada que estourou já é história, e o
   * bloco não é para lamentar. Sem média de capacidade não há régua — e sem
   * régua não há estouro a declarar.
   */
  const { semanasQueEstouram, excedenteTotal, semanasFuturas, rotulosQueEstouram } = useMemo(() => {
    const semanasQueEstouram = temMedia
      ? dadosCarga.filter((d) => d.futura && d.demanda > (carga.mediaConcluidoM2 as number))
      : [];
    const excedenteTotal = semanasQueEstouram.reduce(
      (soma, d) => soma + (d.demanda - (carga.mediaConcluidoM2 as number)), 0,
    );
    const semanasFuturas = dadosCarga.filter((d) => d.futura).length;
    const rotulosQueEstouram = new Set(semanasQueEstouram.map((d) => d.label));
    return { semanasQueEstouram, excedenteTotal, semanasFuturas, rotulosQueEstouram };
  }, [temMedia, dadosCarga, carga]);

  // ── Exportação ──────────────────────────────────────────────────────────
  // O arquivo leva o mesmo recorte que está na tela: sem o recorte escrito
  // nele, os números pareceriam globais depois que o CSV circula sozinho.
  // Ponto e vírgula + BOM: o Excel em pt-BR lê vírgula como separador decimal
  // e, sem o BOM, abre os acentos quebrados.
  const exportarCsv = () => {
    const esc = (v: unknown) => {
      const t = String(v ?? "");
      return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const linha = (cols: unknown[]) => cols.map(esc).join(";");
    const num = (v: number | null | undefined, casas = 1) =>
      v == null ? "" : v.toFixed(casas).replace(".", ",");
    const periodoLabel = PERIODS.find((p) => p.value === period)?.label ?? period;
    const eventoLabel = eventFilter === "all" ? "Todos" : (eventNameById.get(eventFilter) ?? eventFilter);
    const sponsorLabel = sponsorFilter === "all" ? "Todos" : (sponsors.find((s) => s.id === sponsorFilter)?.name ?? sponsorFilter);

    const b: string[] = [];
    b.push(linha(["Análises — desempenho de ciclos fechados e carga prevista"]));
    b.push(linha(["Gerado em", format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })]));
    b.push(linha(["Período", periodoLabel]));
    b.push(linha(["Recorte de período", "Por saída do caminhão já ocorrida (ciclo do evento)"]));
    b.push(linha(["Evento", eventoLabel]));
    b.push(linha(["Patrocinador", sponsorLabel]));
    b.push("");

    b.push(linha(["INDICADORES"]));
    b.push(linha(["Indicador", "Período atual", "Período anterior", "Denominador"]));
    b.push(linha(["Entregas no prazo (%)", num(atual.prazoRate), num(anterior?.prazoRate), `${atual.prazoNoPrazo} de ${atual.prazoAvaliadas}`]));
    b.push(linha(["Ciclo de entrega — mediana (dias)", num(atual.cicloMedianaDias), num(anterior?.cicloMedianaDias), `${atual.cicloAmostra} itens`]));
    b.push(linha(["Retrabalho (%)", num(atual.retrabalhoRate), num(anterior?.retrabalhoRate), `${atual.retrabalhoPecas} de ${atual.pecasTotal}`]));
    b.push(linha(["Volume entregue (m²)", num(atual.m2Entregue, 2), num(anterior?.m2Entregue, 2), ""]));
    b.push("");
    b.push(linha(["RESSALVAS"]));
    b.push(linha(["Entregues sem data de entrega (fora da taxa de prazo)", atual.prazoSemData]));
    b.push(linha(["Entregues sem medida de arquivo (fora do m²)", atual.m2SemMedida]));
    b.push(linha(["Complementos no recorte (quantidade extra pós-produção)", atual.complementoPecas]));
    b.push(linha(["Retrabalho é PISO", "só refação registrada (arquivo/layout trocado) e reprovação em aberto"]));
    b.push("");

    b.push(linha(["CAPACIDADE X DEMANDA (janela fixa de 12 semanas atrás e 8 à frente; ignora o filtro de período)"]));
    b.push(linha(["Semana (segunda)", "m² que vencem", "m² concluídos", "Situação"]));
    carga.semanas.forEach((s) => b.push(linha([
      rotuloSemana(s.inicioMs), num(s.demandaM2, 2),
      s.concluidoM2 == null ? "" : num(s.concluidoM2, 2),
      s.atual ? "semana atual" : s.passada ? "realizado" : "previsto",
    ])));
    b.push(linha(["Capacidade média observada (m²/semana)", num(carga.mediaConcluidoM2, 2), `${carga.semanasNaMedia} semanas`]));
    b.push("");

    b.push(linha([`OFENSORES POR ${(DIMENSOES.find((d) => d.value === dim)?.label ?? dim).toUpperCase()}`]));
    b.push(linha(["Nome", "Peças", "m²", "Fora do prazo", "Entregas avaliadas", "No prazo (%)", "Retrabalho", "Retrabalho (%)", "Ciclo mediano (dias)", "Em aberto"]));
    ofensores.forEach((o) => b.push(linha([
      o.label, o.pecas, num(o.m2, 2), o.foraPrazo, o.prazoAvaliadas, num(o.prazoRate),
      o.retrabalhoPecas, num(o.retrabalhoRate), num(o.cicloMedianaDias), o.emAberto,
    ])));

    const blob = new Blob(["﻿" + b.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Análises ${format(new Date(), "dd-MM-yyyy")}.csv`;
    // Fora do DOM, alguns navegadores (Firefox, iOS) ignoram o click sintético.
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  const abrirOfensor = (o: OfensorRow) => {
    const rota = rotaDoOfensor(dim, o.chave, o.label);
    if (rota) setLocation(rota);
  };

  /* ── Faixa de filtros ────────────────────────────────────────────────────
     Mesma língua do Histórico, que virou o padrão da casa: cada natureza com
     a sua roupa. Filtro = caixa com o ícone da dimensão, e o gatilho diz o
     RECORTE ("Saídas nos últimos 30 dias", "Copa Norte") em vez de repetir o
     nome do campo. Resultado = texto puro, sem moldura, porque é a resposta da
     consulta e não um controle.

     O que saiu, e por quê:
      · O rótulo em CAIXA ALTA acima de cada gatilho ("PERÍODO" sobre um botão
        escrito "Todo o período"): a mesma informação duas vezes, gastando uma
        linha inteira da primeira dobra. O ícone segura a identidade do campo
        quando o texto vira o recorte.
      · O texto centralizado dentro do gatilho — herança do `text-align: center`
        que o navegador dá a todo <button>, que só aparecia porque `fullWidth`
        esticava o <span> do rótulo. No resto do app o gatilho é à esquerda, e
        centralizado ele lia como campo desabilitado. No desktop os três agora
        têm a MESMA largura mínima e crescem com o conteúdo; a grade vem daí, e
        não de três números soltos (320/190/320).
      · "SEM FILTROS" cinza e sem moldura, que parecia um botão desligado: era
        um rótulo de estado. Virou o resumo em `aria-live`, e no lugar dele fica
        "Limpar tudo" SEMPRE desenhado (apagado quando não há o que limpar) —
        antes o botão de limpar só nascia depois que já havia algo errado.
      · A busca dentro do menu de Período: quatro opções fixas não são uma lista
        para procurar, e o campo ainda roubava o foco de quem só queria as
        setas. Mesmo conserto que o Histórico recebeu. */
  const gatilhoDesktop = isMobile ? undefined : { minWidth: 176 };
  // Opções memoizadas: recriadas a cada render (inclusive no tique de 1 min),
  // obrigavam cada FilterSelect a reordenar a lista com `localeCompare`.
  const opcoesEvento = useMemo(
    () => events.map((e) => ({ value: e.id, label: e.name, count: contagens.porEvento.get(e.id) ?? 0 })),
    [events, contagens]);
  const opcoesPatrocinador = useMemo(
    () => sponsors.map((s) => ({ value: s.id, label: s.name, count: contagens.porPatrocinador.get(s.id) ?? 0 })),
    [sponsors, contagens]);
  const camposDeRecorte = (
    <>
      <FilterSelect
        showAllLabelWhenEmpty hideWhenEmpty={false}
        label="Período" allLabel="Todo o período"
        icon={Clock} activeAppearance="solid"
        value={period} onChange={escolherPeriodo}
        options={PERIODS.filter((p) => p.value !== "all").map((p) => ({ value: p.value, label: p.label, pinned: true }))}
        emptyText="Nenhum período."
        hideSearch
        testId="select-period"
        fullWidth={isMobile}
        panelWidth={isMobile ? undefined : 250}
        triggerStyle={gatilhoDesktop}
      />
      <FilterSelect
        showAllLabelWhenEmpty hideWhenEmpty={false}
        label="Evento" allLabel="Todos os eventos"
        icon={Calendar} activeAppearance="solid"
        value={eventFilter} onChange={setEventFilter}
        options={opcoesEvento}
        searchPlaceholder="Buscar evento…" emptyText="Nenhum evento encontrado."
        testId="select-event"
        fullWidth={isMobile}
        panelWidth={isMobile ? undefined : 330}
        triggerStyle={gatilhoDesktop}
      />
      <FilterSelect
        showAllLabelWhenEmpty hideWhenEmpty={false}
        label="Patrocinador" allLabel="Todos os patrocinadores"
        icon={Building2} activeAppearance="solid"
        value={sponsorFilter} onChange={setSponsorFilter}
        options={opcoesPatrocinador}
        searchPlaceholder="Buscar patrocinador…" emptyText="Nenhum patrocinador encontrado."
        testId="select-sponsor"
        fullWidth={isMobile}
        panelWidth={isMobile ? undefined : 300}
        triggerStyle={gatilhoDesktop}
        // Último gatilho da linha: ancorado à esquerda, o painel nascia além da
        // borda direita da janela.
        dropdownAlign="right"
      />
    </>
  );

  // Celular: gaveta. O contador vive no próprio botão para que "tenho filtro
  // ligado" sobreviva com a gaveta fechada — sem ele, um recorte esquecido
  // explicaria números baixos sem nada na tela dizendo isso.
  // Com filtro ligado o botão fica cheio em laranja-texto (accentText, que
  // aguenta texto branco): o "tenho recorte" é visível de longe.
  const botaoFiltros = (
    <Botao
      tamanho="toque"
      icone={SlidersHorizontal}
      onClick={() => setFiltrosAbertos((v) => !v)}
      aria-expanded={filtrosAbertos}
      aria-label={filtrosAtivos > 0 ? `Filtros — ${filtrosAtivos} ativo${filtrosAtivos === 1 ? "" : "s"}` : "Filtros"}
      data-testid="button-toggle-filtros"
      style={{
        flexShrink: 0, fontSize: FS.body,
        ...(filtrosAtivos > 0
          ? { backgroundColor: ACCENT_TEXT, border: `1px solid ${ACCENT_TEXT}`, color: T.surface }
          : {}),
      }}
    >
      Filtros
      {filtrosAtivos > 0 && (
        <span style={{
          fontSize: FS.small, fontWeight: FW.rotulo, padding: "1px 7px", borderRadius: R.pill,
          backgroundColor: T.surface, color: ACCENT_TEXT,
        }}>
          {filtrosAtivos}
        </span>
      )}
      <ChevronDown aria-hidden="true" style={{
        width: 13, height: 13, transition: "transform 0.2s",
        transform: filtrosAbertos ? "rotate(180deg)" : "rotate(0deg)",
      }} />
    </Botao>
  );

  /* O resultado é TEXTO, sem moldura: diz de uma vez quantos filtros estão
     ligados, quanto eles cortaram e como desfazer. É também a LINHA DE ESCOPO
     da tela — antes um parágrafo solto abaixo da faixa, que gastava a sua
     própria altura e ficava atrás do menu quando um filtro era aberto. Aqui
     ele nasce ao lado dos controles que o produzem. */
  const linhaDeResumo = (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      ...(isMobile ? { width: "100%" } : { marginLeft: "auto" }), flexShrink: 0,
    }}>
      <span
        role="status"
        aria-live="polite"
        data-testid="recorte-analises"
        // No desktop a frase não quebra: se faltar largura, quem quebra é a
        // FAIXA (flexWrap), levando o resumo inteiro para a linha de baixo.
        // Sem isto, com um evento de nome longo selecionado em 1366px, o texto
        // se partia no meio e "Limpar tudo" subia para o meio da frase.
        style={{ fontSize: FS.body, color: T.second, fontWeight: FW.medio, whiteSpace: isMobile ? "normal" : "nowrap" }}
      >
        {periodoPadraoAplicado && filtrosAtivos === 1
          ? <>Período padrão{" · "}</>
          : filtrosAtivos > 0 && (
            <>{filtrosAtivos} filtro{filtrosAtivos === 1 ? "" : "s"} ativo{filtrosAtivos === 1 ? "" : "s"}{" · "}</>
          )}
        <strong style={{ color: T.text, fontFamily: FONT.mono }}>{int(atual.pecasTotal)}</strong>
        {" de "}
        <span style={{ fontFamily: FONT.mono }}>{int(contagens.totalFunil)}</span>
        {" peças"}
      </span>

      {/* Limpar não é destrutivo (só desfaz o recorte): secundário, não perigo.
          Apagado, o MOTIVO fica escrito ao lado — não só no title, que no
          celular não existe. 44 no toque: é o desfazer da faixa inteira. */}
      <Botao
        tamanho={isMobile ? "toque" : "sm"}
        icone={X}
        onClick={limparFiltros}
        disabled={filtrosAtivos === 0}
        motivo={filtrosAtivos === 0 ? "Nenhum filtro aplicado" : undefined}
        alinharMotivo="end"
        data-testid="btn-clear-filters"
        title={filtrosAtivos > 0 ? "Remover todos os filtros" : "Não há filtro aplicado"}
        style={{ marginLeft: isMobile ? "auto" : 0, flexShrink: 0 }}
      >
        Limpar tudo
      </Botao>
    </div>
  );

  if (isError) {
    // O <EstadoErro> da casa: diz o que falhou e oferece tentar de novo.
    // Enquanto tenta, a frase de apoio diz isso — o botão continua no lugar.
    return naRaiz(
      <div style={{ backgroundColor: T.bg, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 480, width: "100%" }}>
          <EstadoErro
            titulo="Não foi possível carregar as análises"
            detalhe={isFetching
              ? "Tentando de novo…"
              : "Sem uma das três fontes (eventos, peças, patrocinadores) todo número desta tela mudaria de significado — por isso nada é exibido pela metade."}
            aoTentarDeNovo={retryAll}
          />
        </div>
      </div>
    );
  }

  // Esqueleto com a SILHUETA REAL da tela: 4 KPIs, um gráfico de largura
  // inteira e a tabela de ofensores. Um esqueleto que não bate com o layout
  // provoca um salto no primeiro paint.
  if (isLoading) {
    return naRaiz(
      <div style={{ backgroundColor: T.bg, height: "100%", overflowY: "auto", padding: PADDING_PAGINA(isMobile) }} role="status" aria-busy="true">
        {/* Texto de verdade, não `aria-label`: num <div> sem papel o rótulo não
            era lido, e a carga passava em silêncio para o leitor de tela. Mesma
            solução do esqueleto da Gestão de Prazos. */}
        <span className="sr-only">Carregando análises…</span>
        <div className="animate-pulse" style={{ width: 240, height: 24, borderRadius: R.sm, backgroundColor: T.border, marginBottom: 10 }} />
        <div className="animate-pulse" style={{ width: 420, maxWidth: "90%", height: 12, borderRadius: R.sm, backgroundColor: T.low, marginBottom: SP.bloco }} />
        {/* A silhueta acompanha a faixa nova: uma linha de gatilhos, não o card
            de duas linhas de antes — um esqueleto com a altura errada devolve o
            salto que ele existe para evitar. */}
        <div className="animate-pulse" style={{ height: 62, borderRadius: R.lg, backgroundColor: T.low, border: `1px solid ${T.border}`, marginBottom: SP.junto }} />
        <div style={{ display: "grid", gridTemplateColumns: apertado ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 16, marginBottom: SP.secao }}>
          {[0, 1, 2, 3].map((i) => (
            // A silhueta do <CartaoKpi>: mesma borda, raio e respiro.
            <div key={i} style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, padding: "14px 16px" }}>
              <div className="animate-pulse" style={{ width: "75%", height: 10, borderRadius: R.sm, backgroundColor: T.low, marginBottom: 12 }} />
              <div className="animate-pulse" style={{ width: "50%", height: 24, borderRadius: R.sm, backgroundColor: T.border, marginBottom: 12 }} />
              <div className="animate-pulse" style={{ width: "90%", height: 9, borderRadius: R.sm, backgroundColor: T.low }} />
            </div>
          ))}
        </div>
        <div className="animate-pulse" style={{ height: 340, backgroundColor: T.surface, border: `1px solid ${T.border}`, marginBottom: SP.secao }} />
        <div className="animate-pulse" style={{ height: 260, backgroundColor: T.surface, border: `1px solid ${T.border}` }} />
      </div>
    );
  }

  return naRaiz(
    <div style={{ backgroundColor: T.bg, height: "100%", overflowY: "auto", padding: PADDING_PAGINA(isMobile) }}>

      {/* Cabeçalho da casa: o ESTADO do dado (frescor) fica colado ao título e a
          ação (exportar) à direita. A frase de escopo, com os dois links, desce
          para a linha de baixo — é explicação, não estado. */}
      <CabecalhoDaPagina
        titulo="Análises"
        frescor={
          <span
            data-testid="selo-frescor-analises"
            title={`Dados de ${new Date(atualizadoEmMs).toLocaleString("pt-BR")}. A tela se atualiza sozinha quando alguém muda uma peça ou evento, ao voltar para a aba e, por segurança, a cada 5 minutos.`}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: FS.small, color: dadoVelho ? TOM.alerta.text : T.second, fontWeight: dadoVelho ? FW.forte : 400 }}
          >
            {isFetching && <RotateCcw aria-hidden="true" className="animate-spin" style={{ width: 11, height: 11 }} />}
            Atualizado {fmtRelative(new Date(atualizadoEmMs).toISOString(), agora)}
          </span>
        }
        acoes={
          <Botao
            icone={Download}
            tamanho={isMobile ? "toque" : "md"}
            onClick={exportarCsv}
            data-testid="button-export-analises"
            title="Baixar os números desta tela em CSV, com os filtros aplicados"
          >
            Exportar CSV
          </Botao>
        }
      />
      <div style={{ marginTop: -8, marginBottom: SP.bloco }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: FS.small, color: T.second, margin: 0, maxWidth: 680, lineHeight: 1.5 }}>
            O passado e o futuro da operação: desempenho dos <strong style={{ fontWeight: FW.forte }}>ciclos já encerrados</strong> e a
            carga que ainda vai vencer. O que está em andamento hoje fica no{" "}
            {/* Os dois nomes eram texto morto: a frase apontava o destino e
                obrigava a pessoa a achá-lo no menu. Viram links, com a mesma
                navegação SPA do resto da tela (setLocation). */}
            <a href="/" onClick={(e) => { e.preventDefault(); setLocation("/"); }} data-testid="link-analises-painel"
              style={{ color: ACCENT_TEXT, fontWeight: FW.forte, textDecoration: "underline", textUnderlineOffset: 2 }}>Painel Geral</a>
            {" "}e na{" "}
            <a href="/prazos" onClick={(e) => { e.preventDefault(); setLocation("/prazos"); }} data-testid="link-analises-prazos"
              style={{ color: ACCENT_TEXT, fontWeight: FW.forte, textDecoration: "underline", textUnderlineOffset: 2 }}>Gestão de Prazos</a>.
          </p>
        </div>
      </div>

      {/* Faixa em T.low, e não branca: o cinza separa CONTROLE de RESULTADO
          à primeira olhada — daqui para baixo, tudo o que é branco é número.
          Uma linha só, com a altura de um gatilho: o card anterior gastava
          ~110px (rótulo em caixa alta + gatilho + folga larga) mais um
          parágrafo de escopo por fora, numa tela cujo conteúdo principal já é
          longo demais para a primeira dobra. */}
      <div style={{
        backgroundColor: T.low, border: `1px solid ${T.border}`, borderRadius: R.lg,
        padding: isMobile ? "10px 12px" : "12px 16px", marginBottom: SP.junto,
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        {isMobile ? (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {botaoFiltros}
            </div>
            {filtrosAbertos && (
              <div data-testid="painel-filtros-mobile" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {camposDeRecorte}
              </div>
            )}
            {linhaDeResumo}
          </>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            {camposDeRecorte}
            {linhaDeResumo}
          </div>
        )}
      </div>

      <section aria-labelledby="h-desempenho" style={{ marginBottom: SP.secao }}>
        <h2 id="h-desempenho" className="sr-only">Indicadores do período</h2>
        <div style={{ display: "grid", gridTemplateColumns: apertado ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 16, margin: 0 }}>
          {kpis.map((k) => (
            <KpiAnalise
              key={k.testId}
              testId={k.testId}
              rotulo={k.rotulo}
              valor={k.valor}
              contexto={k.contexto}
              v={k.v}
              sufixoVariacao={k.sufixo}
              notaSemComparacao={k.nota}
              selo={<SeloRuido atual={k.amostra} anterior={k.amostraAnterior} testId={`selo-ruido-${k.testId}`} />}
              link={k.link}
              aoNavegar={setLocation}
              isMobile={isMobile}
            />
          ))}
        </div>
        {/* A ressalva pertence aos KPIs: fica a um degrau de distância deles
            (SP.junto) e a um degrau inteiro do próximo assunto (SP.secao).
            Aqui também moram as duas frases de método que saíram da linha de
            escopo quando ela virou resumo da faixa — o lugar delas é junto dos
            outros avisos de denominador, não repetidas ao lado de um gatilho
            que já diz o período. */}
        <p style={{ fontSize: FS.micro, color: T.second, margin: `${SP.junto}px 0 0`, lineHeight: 1.5, maxWidth: 900 }}>
          O período recorta pela <strong style={{ fontWeight: FW.forte }}>saída do caminhão já ocorrida</strong> (ciclo encerrado),
          não pela data em que a peça foi criada. Canceladas e excluídas não entram em nenhuma conta desta tela.
          {" "}Comparação contra a janela imediatamente anterior, do mesmo tamanho.
          {atual.prazoSemData > 0 && ` ${int(atual.prazoSemData)} peças entregues sem data registrada ficam fora da taxa de prazo.`}
          {atual.complementoPecas > 0 && ` ${int(atual.complementoPecas)} peças do recorte são complementos (quantidade extra pedida depois da produção).`}
          {" "}Retrabalho é <strong style={{ fontWeight: FW.forte }}>piso</strong>: conta refação registrada (arquivo final ou layout substituído) e reprovação ainda em aberto — o histórico completo só existe na trilha de auditoria.
        </p>
      </section>

      <section aria-labelledby="h-carga" style={{ backgroundColor: T.surface, border: `1px solid ${T.bdark}`, padding: isMobile ? "20px 16px" : "24px 28px 20px", marginBottom: SP.secao }}>
        {/* rowGap maior que o columnGap: quando a legenda não cabe ao lado do
            título (1366px com a barra lateral aberta), ela quebra para baixo e
            colava no parágrafo, que é de outro assunto. */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", columnGap: 16, rowGap: SP.junto, flexWrap: "wrap", marginBottom: SP.bloco }}>
          <div style={{ minWidth: 0 }}>
            <h2 id="h-carga" style={{ fontSize: FS.title, fontWeight: FW.forte, color: T.text, margin: `0 0 ${SP.intra}px`, fontFamily: FONT.display, letterSpacing: "-0.02em", fontStyle: "italic" }}>
              Capacidade × Demanda
            </h2>
            <p style={{ fontSize: FS.small, color: T.second, margin: 0, lineHeight: 1.45, maxWidth: 640 }}>
              m² que <strong style={{ fontWeight: FW.forte }}>vencem</strong> por semana (pela saída do caminhão) contra m² que a gráfica
              <strong style={{ fontWeight: FW.forte }}> concluiu</strong>. 12 semanas para trás e 8 para a frente — à direita da linha
              é previsto, ainda não aconteceu.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, backgroundColor: ACCENT_TEXT }} />
              <span style={{ fontSize: FS.micro, fontWeight: FW.rotulo, color: T.text, textTransform: "uppercase", letterSpacing: "0.12em" }}>Vence</span>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, backgroundColor: T.dark }} />
              <span style={{ fontSize: FS.micro, fontWeight: FW.rotulo, color: T.text, textTransform: "uppercase", letterSpacing: "0.12em" }}>Concluído</span>
            </span>
            {temMedia && (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 14, height: 2, backgroundColor: GRAFICO_NEUTRO }} />
                <span style={{ fontSize: FS.micro, fontWeight: FW.rotulo, color: T.text, textTransform: "uppercase", letterSpacing: "0.12em" }}>Média concluída</span>
              </span>
            )}
          </div>
        </div>

        {cargaVazia ? (
          <Vazio
            porFiltro={(eventFilter !== "all" || sponsorFilter !== "all") && itemsCarga.length === 0}
            real={baseVazia ? "Sem peças cadastradas" : "Nenhuma peça vence ou foi concluída nestas 21 semanas"}
            aoLimpar={limparFiltros}
          />
        ) : (
          <>
            {/* A CONCLUSÃO, ANTES DO GRÁFICO. Nomeia as semanas e soma o
                excedente — e as barras dessas semanas ganham anel, para a
                faixa e o desenho apontarem a mesma coisa. */}
            {temMedia && !cargaVazia && (
              <div data-testid="faixa-estouro-capacidade"
                style={{
                  display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12,
                  padding: "10px 12px", borderRadius: R.sm,
                  backgroundColor: semanasQueEstouram.length > 0 ? TOM.alerta.bg : TOM.sucesso.bg,
                  border: `1px solid ${semanasQueEstouram.length > 0 ? TOM.alerta.border : TOM.sucesso.border}`,
                }}>
                {semanasQueEstouram.length > 0
                  ? <AlertTriangle aria-hidden="true" style={{ width: 15, height: 15, color: TOM.alerta.text, flexShrink: 0, marginTop: 1 }} />
                  : <Check aria-hidden="true" style={{ width: 15, height: 15, color: TOM.sucesso.text, flexShrink: 0, marginTop: 1 }} />}
                <div style={{ minWidth: 0 }}>
                  {semanasQueEstouram.length > 0 ? (
                    <>
                      {/* TOM.alerta.text sobre TOM.alerta.bg = 4,8:1 — por isso a
                          segunda linha NÃO leva mais opacidade: a 85% ela
                          cairia abaixo de 4,5. A hierarquia fica no peso. */}
                      <p style={{ margin: 0, fontSize: FS.body, fontWeight: FW.forte, color: TOM.alerta.text, lineHeight: 1.35 }}>
                        {semanasQueEstouram.length === 1
                          ? "1 semana prevista passa da capacidade: "
                          : `${semanasQueEstouram.length} semanas previstas passam da capacidade: `}
                        {semanasQueEstouram.map((d) => d.label).join(", ")}
                      </p>
                      <p style={{ margin: "3px 0 0", fontSize: FS.small, color: TOM.alerta.text, lineHeight: 1.45 }}>
                        Somam {int(excedenteTotal)} m² acima da média de {int(carga.mediaConcluidoM2 as number)} m² por semana.
                        {" "}Antecipar produção nas semanas vizinhas é mais barato que estourar o prazo.
                      </p>
                    </>
                  ) : (
                    <>
                      {/* TOM.sucesso.text sobre TOM.sucesso.bg = 4,8:1, sem opacidade. */}
                      <p style={{ margin: 0, fontSize: FS.body, fontWeight: FW.forte, color: TOM.sucesso.text, lineHeight: 1.35 }}>
                        Nenhuma semana prevista passa da capacidade
                      </p>
                      <p style={{ margin: "3px 0 0", fontSize: FS.small, color: TOM.sucesso.text, lineHeight: 1.45 }}>
                        {semanasFuturas === 1 ? "A semana à frente cabe" : `As ${semanasFuturas} semanas à frente cabem`}
                        {" "}na média de {int(carga.mediaConcluidoM2 as number)} m² por semana.
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}
            <figure role="img" style={{ margin: 0 }} aria-label={`Gráfico de barras semanais em metros quadrados: m² que vencem contra m² concluídos, de ${dadosCarga[0]?.label} a ${ultimaLabel}. Os números estão na tabela seguinte.`}>
              {/* 21 semanas × 2 barras não cabem em 375px sem virar risco:
                  no celular o gráfico rola na horizontal em vez de encolher
                  as barras até deixarem de ser comparáveis. */}
              <GraficoCarga
                dadosCarga={dadosCarga}
                carga={carga}
                rotulosQueEstouram={rotulosQueEstouram}
                primeiraFutura={primeiraFutura}
                ultimaLabel={ultimaLabel}
                semanaAtualLabel={semanaAtualLabel}
                apertado={apertado}
              />
            </figure>
            <table className="sr-only">
              <caption>m² por semana: o que vence e o que foi concluído</caption>
              <thead>
                <tr>
                  <th scope="col">Semana (segunda-feira)</th>
                  <th scope="col">m² que vencem</th>
                  <th scope="col">m² concluídos</th>
                  <th scope="col">Situação</th>
                </tr>
              </thead>
              <tbody>
                {carga.semanas.map((s) => (
                  <tr key={s.inicioMs}>
                    <td>{rotuloSemana(s.inicioMs)}</td>
                    <td>{int(s.demandaM2)}</td>
                    <td>{s.concluidoM2 == null ? "previsto, ainda não aconteceu" : int(s.concluidoM2)}</td>
                    <td>{s.atual ? "semana atual" : s.passada ? "realizado" : "previsto"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <p style={{ fontSize: FS.micro, color: T.second, margin: `${SP.junto}px 0 0`, lineHeight: 1.5 }}>
          Janela fixa: <strong style={{ fontWeight: FW.forte }}>não segue o filtro de período</strong> — um bloco de planejamento que
          encolhe com o recorte esconderia o pico que ele existe para antecipar. Segue os filtros de evento e patrocinador.
          {temMedia
            ? ` Linha tracejada: ${m2(carga.mediaConcluidoM2)} por semana, média das ${carga.semanasNaMedia} semanas passadas — a régua do que a casa costuma dar conta.`
            : " Sem produção registrada nas semanas passadas, não há média de capacidade para traçar."}
          {carga.demandaSemData > 0 && ` ${int(carga.demandaSemData)} peças estão em eventos sem data de saída válida e não entram na demanda.`}
          {carga.demandaForaDaJanela > 0 && ` ${int(carga.demandaForaDaJanela)} peças vencem fora desta janela de 21 semanas.`}
          {carga.semMedida > 0 && ` ${int(carga.semMedida)} peças concluídas não têm medida de arquivo e não somam m².`}
        </p>
      </section>

      {/* ── "Tempo por etapa" — o bloco voltou COM NÚMERO ──
          Ele saiu daqui por ser lugar reservado: seis linhas de "— dias" e um
          selo "DADO INDISPONÍVEL" ocupando meia dobra para não informar nada
          ("dado indisponível, não está nota 10 nunca essa tela").

          O que destravou: `items` continua sem guardar quando a peça ENTRA em
          cada etapa, mas a trilha de auditoria passou a gravar toda mudança de
          status com hora, e a leitura da trilha deixou de ter teto. A diferença
          entre dois carimbos consecutivos da mesma peça É a permanência — sem
          coluna nova. A conta mora no servidor (`services/tempo-etapas.ts`),
          porque a tela não pode baixar `audit_logs`.

          A DECISÃO ANTERIOR CONTINUA VALENDO e é o `temBaseParaExibir` abaixo:
          recorte sem base suficiente não ganha bloco vazio — ganha silêncio. */}
      {tempo && (
        <section aria-labelledby="h-tempo" style={{ backgroundColor: T.surface, border: `1px solid ${T.bdark}`, padding: isMobile ? "20px 16px" : "24px 28px 20px", marginBottom: SP.secao }}>
          <div style={{ marginBottom: SP.bloco }}>
            <h2 id="h-tempo" style={{ fontSize: FS.title, fontWeight: FW.forte, color: T.text, margin: `0 0 ${SP.intra}px`, fontFamily: FONT.display, letterSpacing: "-0.02em", fontStyle: "italic" }}>
              Tempo por etapa
            </h2>
            <p style={{ fontSize: FS.small, color: T.second, margin: 0, lineHeight: 1.45, maxWidth: 700 }}>
              Quanto tempo a peça fica parada em cada etapa, pela trilha de auditoria, contra o que os
              marcos do evento planejavam para ela. <strong style={{ fontWeight: FW.forte }}>Mediana</strong>, não média —
              uma peça esquecida distorce a média da operação inteira.
              {piorEtapa
                ? ` Onde mais se perde tempo hoje: ${piorEtapa.label}.`
                : " Nenhuma etapa passa do plano neste recorte."}
            </p>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
              <caption className="sr-only">
                Permanência mediana por etapa do funil, comparada ao prazo planejado da etapa
              </caption>
              <thead>
                <tr style={{ backgroundColor: T.low }}>
                  <th scope="col" style={{ textAlign: "left", padding: "9px 12px", fontSize: FS.micro, fontWeight: FW.rotulo, color: T.second, textTransform: "uppercase", letterSpacing: "0.12em", borderBottom: `1px solid ${T.bdark}` }}>Etapa</th>
                  <th scope="col" style={{ textAlign: "right", padding: "9px 12px", fontSize: FS.micro, fontWeight: FW.rotulo, color: T.second, textTransform: "uppercase", letterSpacing: "0.12em", borderBottom: `1px solid ${T.bdark}` }}>Permanência</th>
                  <th scope="col" style={{ textAlign: "right", padding: "9px 12px", fontSize: FS.micro, fontWeight: FW.rotulo, color: T.second, textTransform: "uppercase", letterSpacing: "0.12em", borderBottom: `1px solid ${T.bdark}` }}>Planejado</th>
                  <th scope="col" style={{ textAlign: "left", padding: "9px 12px", fontSize: FS.micro, fontWeight: FW.rotulo, color: T.second, textTransform: "uppercase", letterSpacing: "0.12em", borderBottom: `1px solid ${T.bdark}` }}>Diferença</th>
                  <th scope="col" style={{ textAlign: "right", padding: "9px 12px", fontSize: FS.micro, fontWeight: FW.rotulo, color: T.second, textTransform: "uppercase", letterSpacing: "0.12em", borderBottom: `1px solid ${T.bdark}` }}>Peças medidas</th>
                  <th scope="col" style={{ textAlign: "right", padding: "9px 12px", fontSize: FS.micro, fontWeight: FW.rotulo, color: T.second, textTransform: "uppercase", letterSpacing: "0.12em", borderBottom: `1px solid ${T.bdark}` }}>Paradas hoje</th>
                </tr>
              </thead>
              <tbody>
                {tempo.etapas.map((e) => {
                  const dif = diferencaContraPlano(e);
                  return (
                    <tr key={e.key} data-testid={`tempo-etapa-${e.key}`} style={{ borderBottom: `1px solid ${T.border}` }}>
                      <th scope="row" style={{ textAlign: "left", padding: "11px 12px", fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>
                        {e.label}
                      </th>
                      <td style={{ textAlign: "right", padding: "11px 12px", fontSize: FS.body, fontWeight: FW.forte, color: T.text, fontFamily: FONT.mono }}>
                        {dias(e.medianaDias)}
                      </td>
                      <td style={{ textAlign: "right", padding: "11px 12px", fontSize: FS.body, color: T.second, fontFamily: FONT.mono }}>
                        {e.planejadoDias == null ? "sem marco anterior" : dias(e.planejadoDias)}
                      </td>
                      <td style={{ textAlign: "left", padding: "11px 12px", fontSize: FS.small, fontWeight: FW.forte, color: dif ? CORES_TOM[dif.tom] : T.second }}>
                        {dif ? dif.texto : "—"}
                      </td>
                      <td style={{ textAlign: "right", padding: "11px 12px", fontSize: FS.small, color: T.second, fontFamily: FONT.mono }}>
                        {int(e.pecas)}
                      </td>
                      <td style={{ textAlign: "right", padding: "11px 12px", fontSize: FS.small, color: T.second, fontFamily: FONT.mono }}>
                        {int(e.emAberto)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p data-testid="tempo-cobertura" style={{ fontSize: FS.micro, color: T.second, margin: `${SP.junto}px 0 0`, lineHeight: 1.5, maxWidth: 900 }}>
            {frasesDeCobertura(tempo, dataPorExtenso).join(" ")}
            {" "}Permanência em dias-calendário no fuso de São Paulo; o planejado é a distância entre o
            marco da etapa e o da anterior, pelos offsets do próprio evento.
          </p>
        </section>
      )}

      <section aria-labelledby="h-ofensores" style={{ backgroundColor: T.surface, border: `1px solid ${T.bdark}` }}>
        <div style={{ padding: isMobile ? "20px 16px 16px" : "24px 28px 16px", borderBottom: `1px solid ${T.low}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", columnGap: 16, rowGap: SP.junto, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <h2 id="h-ofensores" style={{ fontSize: FS.title, fontWeight: FW.forte, color: T.text, margin: `0 0 ${SP.intra}px`, fontFamily: FONT.display, letterSpacing: "-0.02em", fontStyle: "italic" }}>
                Ofensores
              </h2>
              <p style={{ fontSize: FS.small, color: T.second, margin: 0, lineHeight: 1.45 }}>
                Quem custa caro no recorte, ordenado pelo que mais dói. Clique numa linha para ver as peças —
                {" "}{DIMENSOES.find((d) => d.value === dim)?.destino}.
              </p>
            </div>
            {/* Segmentado da casa: troca a FORMA de agrupar a mesma tabela.
                O prefixo mantém os testids `dim-<valor>`. */}
            <div style={{ flexShrink: 0 }}>
              <Segmentado
                rotuloDaLista="Dimensão da tabela"
                prefixoDeTestId="dim"
                tamanho={isMobile ? "md" : "sm"}
                ativo={dim}
                aoTrocar={(v) => setDim(v as OfensorDim)}
                itens={DIMENSOES.map((d) => ({ id: d.value, rotulo: d.label }))}
              />
            </div>
          </div>
        </div>

        {ofensores.length === 0 ? (
          <Vazio
            porFiltro={recorteVazio}
            real={baseVazia ? "Sem peças cadastradas" : "Nenhuma peça no funil para agrupar"}
            aoLimpar={limparFiltros}
          />
        ) : (
          // ROLAGEM SEMPRE NA CAIXA, nunca na página. Era `visible` fora do
          // celular: com a barra lateral aberta num tablet sobram ~700px de
          // conteúdo, a tabela de 780px estourava e quem rolava de lado era a
          // PÁGINA inteira (o SidebarInset computa overflow-x: auto), levando
          // junto cabeçalho e filtros.
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
              <thead>
                <tr style={{ backgroundColor: T.low }}>
                  <th scope="col" style={{ position: "sticky" as const, top: -PADDING_TOPO(isMobile), zIndex: 2, backgroundColor: T.low, padding: "11px 20px", fontSize: FS.micro, fontWeight: FW.rotulo, color: T.second, textTransform: "uppercase", letterSpacing: "0.14em", textAlign: "left" }}>
                    {DIMENSOES.find((d) => d.value === dim)?.label}
                  </th>
                  {ORDENS.map((o) => (
                    <th
                      key={o.value}
                      scope="col"
                      aria-sort={ordem === o.value ? "descending" : "none"}
                      style={{ position: "sticky" as const, top: -PADDING_TOPO(isMobile), zIndex: 2, backgroundColor: T.low, padding: 0, textAlign: "right" }}
                    >
                      <button
                        onClick={() => setOrdem(o.value)}
                        data-testid={`ordem-${o.value}`}
                        title={`Ordenar por ${o.label.toLowerCase()}`}
                        style={{
                          width: "100%", padding: "11px 20px", background: "none", border: "none", cursor: "pointer",
                          fontSize: FS.micro, fontWeight: FW.rotulo, letterSpacing: "0.14em", textTransform: "uppercase",
                          textAlign: "right", color: ordem === o.value ? ACCENT_TEXT : T.second,
                        }}
                      >
                        {o.label}{ordem === o.value ? " ▾" : ""}
                      </button>
                    </th>
                  ))}
                  <th scope="col" style={{ position: "sticky" as const, top: -PADDING_TOPO(isMobile), zIndex: 2, backgroundColor: T.low, padding: "11px 20px", fontSize: FS.micro, fontWeight: FW.rotulo, color: T.second, textTransform: "uppercase", letterSpacing: "0.14em", textAlign: "right" }}>
                    Em aberto
                  </th>
                  <th scope="col" style={{ position: "sticky" as const, top: -PADDING_TOPO(isMobile), zIndex: 2, backgroundColor: T.low, width: 34 }}><span className="sr-only">Abrir</span></th>
                </tr>
              </thead>
              <tbody>
                {ofensores.slice(0, 12).map((o, idx) => {
                  const rota = rotaDoOfensor(dim, o.chave, o.label);
                  return (
                    <tr
                      key={o.chave}
                      data-testid={`ofensor-${idx}`}
                      onClick={() => abrirOfensor(o)}
                      style={{
                        borderBottom: `1px solid ${T.low}`,
                        cursor: rota ? "pointer" : "default",
                      }}
                    >
                      <td style={{ padding: "13px 20px" }}>
                        {rota ? (
                          <a
                            href={rota}
                            onClick={(e) => {
                              // Ctrl/Cmd-clique continua abrindo em nova aba: o
                              // roteador só assume o clique simples.
                              if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                              e.preventDefault();
                              e.stopPropagation();
                              setLocation(rota);
                            }}
                            style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.text, textDecoration: "none" }}
                          >
                            {o.label}
                          </a>
                        ) : (
                          <span style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.second }}>{o.label}</span>
                        )}
                        <span style={{ display: "block", fontSize: FS.micro, color: T.second, marginTop: 3 }}>
                          {int(o.pecas)} peças · {m2(o.m2)}
                        </span>
                      </td>
                      <td style={{ padding: "13px 20px", textAlign: "right" }}>
                        <span style={{ fontFamily: FONT.mono, fontSize: FS.small, fontWeight: FW.forte, color: o.foraPrazo > 0 ? RUIM : T.text }}>
                          {o.prazoAvaliadas > 0 ? `${int(o.foraPrazo)} de ${int(o.prazoAvaliadas)}` : "—"}
                        </span>
                        <span style={{ display: "block", fontSize: FS.micro, color: T.second, marginTop: 3 }}>
                          {o.prazoAvaliadas > 0 ? `${pct(o.prazoRate, 0)} no prazo` : "sem entrega avaliável"}
                        </span>
                      </td>
                      <td style={{ padding: "13px 20px", textAlign: "right" }}>
                        <span style={{ fontFamily: FONT.mono, fontSize: FS.small, fontWeight: FW.forte, color: o.retrabalhoPecas > 0 ? ACCENT_TEXT : T.text }}>
                          {int(o.retrabalhoPecas)} de {int(o.pecas)}
                        </span>
                        <span style={{ display: "block", fontSize: FS.micro, color: T.second, marginTop: 3 }}>{pct(o.retrabalhoRate, 0)}</span>
                      </td>
                      <td style={{ padding: "13px 20px", textAlign: "right", fontFamily: FONT.mono, fontSize: FS.small, fontWeight: FW.forte, color: T.text }}>
                        {dias(o.cicloMedianaDias)}
                      </td>
                      <td style={{ padding: "13px 20px", textAlign: "right", fontFamily: FONT.mono, fontSize: FS.small, fontWeight: FW.forte, color: T.text }}>
                        {m2(o.m2)}
                      </td>
                      <td style={{ padding: "13px 20px", textAlign: "right", fontFamily: FONT.mono, fontSize: FS.small, fontWeight: FW.forte, color: T.text }}>
                        {int(o.emAberto)}
                      </td>
                      <td style={{ padding: "13px 12px 13px 0" }}>
                        {rota && <ChevronRight aria-hidden="true" style={{ width: 15, height: 15, color: T.second }} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {ofensores.length > 0 && (
          <p style={{ padding: isMobile ? "12px 16px 18px" : "14px 28px 20px", fontSize: FS.micro, color: T.second, margin: 0, lineHeight: 1.5 }}>
            {ofensores.length > 12 && `Mostrando as 12 primeiras de ${int(ofensores.length)} linhas — o CSV leva todas. `}
            "Fora do prazo" só considera peças entregues com data registrada, comparadas com a saída do caminhão do evento delas.
            {dim === "patrocinador" && " Uma peça com vários patrocinadores conta em cada linha, então a soma da coluna é maior que o total da tela."}
            {dim === "tipo" && " O tipo é texto livre no cadastro; grafias com maiúsculas ou espaços diferentes foram unidas."}
          </p>
        )}
      </section>
    </div>
  );
}
