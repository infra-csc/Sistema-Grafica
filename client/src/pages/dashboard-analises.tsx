import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { FilterSelect } from "@/components/filter-select";
import {
  Bar, BarChart, CartesianGrid, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  ArrowDown, ArrowUp, Building2, Calendar, ChevronDown, ChevronRight,
  Clock, Download, RotateCcw, SlidersHorizontal, X,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useLocation } from "wouter";
import { fmtRelative } from "@/components/prazos/tokens";
import { useIsMobile } from "@/hooks/use-mobile";
// Tokens canônicos — a paleta local divergia do resto do app e T.muted era
// usado como cor de TEXTO, o que reprova AA em todas as superfícies.
import { T, FS, R, SHADOW } from "@/lib/theme";
import { isOutOfFunnel } from "@/lib/analises-status";
import type { AnaliseEvent, AnaliseItem, AnaliseSponsor } from "@/lib/analises-metrics";
import {
  cycleWindow, eventCycleDayIndex, filterItems, pickDefaultPeriod, previousWindow, qtyOf,
} from "@/lib/analises-metrics";
import {
  computeCapacidade, rotuloSemana,
} from "@/lib/analises-capacidade";
import type { Variacao } from "@/lib/analises-desempenho";
import {
  computeDesempenho, computeOfensores, ordenarOfensores, rotaDoOfensor, variacao,
} from "@/lib/analises-desempenho";
import type { OfensorDim, OfensorOrdem, OfensorRow } from "@/lib/analises-desempenho";

/* Laranja para TEXTO e para objeto gráfico (orange-700): o T.accent saturado
   fica em ~2,8:1 sobre branco — vale para bordas, nunca para rótulo legível
   nem para barra que carrega significado (1.4.11 pede 3:1). */
const ACCENT_TEXT = T.accentText;
/* Verde/vermelho de julgamento. #15803d = 4,54:1 e #b91c1c = 5,93:1 sobre
   branco: passam AA como TEXTO, que é como aparecem (seta + número). */
const BOM = "#15803d";
const RUIM = "#b91c1c";
/* Cinza de objeto gráfico decorativo — 3,65:1 sobre branco. Nunca em texto. */
const GRAFICO_NEUTRO = "#78716c";

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
const PADDING_PAGINA = (isMobile: boolean) =>
  isMobile ? "14px 14px 40px" : "24px 28px 56px";

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
   Objeto gráfico (1.4.11 pede 3:1): média concluída #78716c / #ffffff = 4,80:1 ✓ */
const RESUMO_APAGADO = "#57534e";

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
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: cor, fontSize: FS.small, fontWeight: 800 }}>
      <Icone aria-hidden="true" style={{ width: 12, height: 12 }} />
      {Math.abs(v.delta) < 10
        ? Math.abs(v.delta).toFixed(1).replace(".", ",")
        : int(Math.abs(v.delta))}
      {sufixo}
      <span style={{ fontWeight: 600 }}>{v.positiva ? "melhor" : "pior"}</span>
    </span>
  );
}

/* ── Card de KPI ──
   NO MÓDULO, não dentro do render. O valor deixou de ser <h3>: na navegação
   por cabeçalhos de um leitor de tela, a lista de títulos da página virava uma
   sequência de números sem contexto. Agora é <dt> rótulo / <dd> valor. */
function KpiAnalise({
  rotulo, valor, contexto, v, sufixoVariacao, notaSemComparacao, testId,
}: {
  rotulo: string;
  valor: string;
  /** Denominador ou amostra. Regra da tela: nenhum número entra sozinho. */
  contexto: string;
  v: Variacao | null;
  sufixoVariacao: string;
  notaSemComparacao: string;
  testId: string;
}) {
  return (
    <div data-testid={testId} style={{
      backgroundColor: T.surface,
      borderLeft: `4px solid ${T.dark}`,
      padding: "18px 20px 16px",
      boxShadow: SHADOW.sm,
      minWidth: 0,
    }}>
      <dt style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.14em", color: T.second, margin: "0 0 10px" }}>
        {rotulo}
      </dt>
      <dd style={{ margin: 0 }}>
        <span style={{ display: "block", fontSize: FS.h1, fontWeight: 700, color: T.text, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em", lineHeight: 1 }}>
          {valor}
        </span>
        <span style={{ display: "block", marginTop: 9, minHeight: 17 }}>
          {v
            ? <SeloVariacao v={v} sufixo={sufixoVariacao} />
            : <span style={{ fontSize: FS.small, color: T.second }}>{notaSemComparacao}</span>}
        </span>
        <span style={{ display: "block", marginTop: 7, fontSize: FS.small, color: T.second, lineHeight: 1.4 }}>
          {contexto}
        </span>
      </dd>
    </div>
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
    <div style={{ backgroundColor: T.dark, color: "#fff", borderRadius: R.sm, padding: "9px 12px", fontSize: 11, lineHeight: 1.6 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Semana de {label}</div>
      {series.map((p: any) => (
        <div key={p.dataKey}>{p.name}: {int(p.value)} m²</div>
      ))}
      {futura && <div style={{ color: "#d6d3d1" }}>Previsto — ainda não aconteceu</div>}
    </div>
  );
};

/* ── Bloco vazio: "não há dado" é diferente de "o filtro comeu tudo" ── */
function Vazio({ porFiltro, real, aoLimpar }: { porFiltro: boolean; real: string; aoLimpar: () => void }) {
  return (
    <div style={{ padding: "40px 20px", textAlign: "center" }}>
      <p style={{ fontSize: FS.body, fontWeight: 700, color: T.text, margin: "0 0 5px" }}>
        {porFiltro ? "Nenhuma peça neste recorte" : real}
      </p>
      {porFiltro ? (
        <button
          onClick={aoLimpar}
          style={{ fontSize: FS.small, color: ACCENT_TEXT, background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline", fontWeight: 700 }}
        >
          Limpar os filtros e ver tudo
        </button>
      ) : (
        <p style={{ fontSize: FS.small, color: T.second, margin: 0 }}>
          Nada foi filtrado — este é o estado real da base.
        </p>
      )}
    </div>
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

export default function DashboardAnalises() {
  const isMobile = useIsMobile();
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
    refetchInterval: 60_000,
  } as const;
  const evQ = useQuery<AnaliseEvent[]>({ queryKey: ["/api/events"], ...freshness });
  const itQ = useQuery<AnaliseItem[]>({ queryKey: ["/api/items"], ...freshness });
  const spQ = useQuery<AnaliseSponsor[]>({ queryKey: ["/api/sponsors"], ...freshness });
  const events = evQ.data ?? [];
  const items = itQ.data ?? [];
  const sponsors = spQ.data ?? [];
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
  const janela = useMemo(() => cycleWindow(period, agora), [period, agora]);
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
    () => computeCapacidade({ items: itemsCarga, cycleDayByEvent, nowMs: agora }),
    [itemsCarga, cycleDayByEvent, agora]);

  const ofensores = useMemo(
    () => ordenarOfensores(
      computeOfensores(fItems, dim, { cycleDayByEvent, eventNameById, sponsors }),
      ordem,
    ),
    [fItems, dim, cycleDayByEvent, eventNameById, sponsors, ordem]);

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
    },
  ];

  const dadosCarga = carga.semanas.map((s) => ({
    label: rotuloSemana(s.inicioMs),
    demanda: Math.round(s.demandaM2),
    concluido: s.concluidoM2 == null ? null : Math.round(s.concluidoM2),
    futura: !s.passada && !s.atual,
    atualSemana: s.atual,
  }));
  // Média de 0 m² não é régua de capacidade nenhuma: sem produção registrada
  // a linha tracejada assentaria no eixo e diria algo que não é verdade.
  const temMedia = carga.mediaConcluidoM2 != null && carga.mediaConcluidoM2 > 0;
  const semanaAtualLabel = dadosCarga.find((d) => d.atualSemana)?.label;
  const primeiraFutura = dadosCarga.find((d) => d.futura)?.label;
  const ultimaLabel = dadosCarga[dadosCarga.length - 1]?.label;
  const cargaVazia = dadosCarga.every((d) => d.demanda === 0 && !d.concluido);

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
        options={events.map((e) => ({ value: e.id, label: e.name, count: contagens.porEvento.get(e.id) ?? 0 }))}
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
        options={sponsors.map((s) => ({ value: s.id, label: s.name, count: contagens.porPatrocinador.get(s.id) ?? 0 }))}
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
  const botaoFiltros = (
    <button
      type="button"
      onClick={() => setFiltrosAbertos((v) => !v)}
      aria-expanded={filtrosAbertos}
      aria-label={filtrosAtivos > 0 ? `Filtros — ${filtrosAtivos} ativo${filtrosAtivos === 1 ? "" : "s"}` : "Filtros"}
      data-testid="button-toggle-filtros"
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        height: 44, padding: "0 12px", borderRadius: R.md, flexShrink: 0,
        backgroundColor: filtrosAtivos > 0 ? ACCENT_TEXT : T.surface,
        border: `1px solid ${filtrosAtivos > 0 ? ACCENT_TEXT : T.bdark}`,
        color: filtrosAtivos > 0 ? "#ffffff" : T.text,
        fontSize: FS.body, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
      }}
    >
      <SlidersHorizontal aria-hidden="true" style={{ width: 14, height: 14 }} />
      Filtros
      {filtrosAtivos > 0 && (
        <span style={{
          fontSize: FS.small, fontWeight: 800, padding: "1px 7px", borderRadius: R.pill,
          backgroundColor: "#ffffff", color: ACCENT_TEXT,
        }}>
          {filtrosAtivos}
        </span>
      )}
      <ChevronDown aria-hidden="true" style={{
        width: 13, height: 13, transition: "transform 0.2s",
        transform: filtrosAbertos ? "rotate(180deg)" : "rotate(0deg)",
      }} />
    </button>
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
        style={{ fontSize: FS.body, color: T.second, fontWeight: 600, whiteSpace: isMobile ? "normal" : "nowrap" }}
      >
        {periodoPadraoAplicado && filtrosAtivos === 1
          ? <>Período padrão{" · "}</>
          : filtrosAtivos > 0 && (
            <>{filtrosAtivos} filtro{filtrosAtivos === 1 ? "" : "s"} ativo{filtrosAtivos === 1 ? "" : "s"}{" · "}</>
          )}
        <strong style={{ color: T.text, fontFamily: "'DM Mono', monospace" }}>{int(atual.pecasTotal)}</strong>
        {" de "}
        <span style={{ fontFamily: "'DM Mono', monospace" }}>{int(contagens.totalFunil)}</span>
        {" peças"}
      </span>

      <button
        type="button"
        onClick={limparFiltros}
        disabled={filtrosAtivos === 0}
        data-testid="btn-clear-filters"
        title={filtrosAtivos > 0 ? "Remover todos os filtros" : "Não há filtro aplicado"}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          height: isMobile ? 34 : 28, padding: "0 10px", borderRadius: 7,
          marginLeft: isMobile ? "auto" : 0,
          backgroundColor: filtrosAtivos > 0 ? "#fef2f2" : "transparent",
          border: `1px solid ${filtrosAtivos > 0 ? "#fecaca" : T.bdark}`,
          color: filtrosAtivos > 0 ? RUIM : RESUMO_APAGADO,
          fontSize: FS.micro, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em",
          cursor: filtrosAtivos > 0 ? "pointer" : "default",
          whiteSpace: "nowrap", flexShrink: 0,
        }}
      >
        <X aria-hidden="true" style={{ width: 11, height: 11 }} />
        Limpar tudo
      </button>
    </div>
  );

  if (isError) {
    return (
      <div style={{ backgroundColor: T.bg, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div role="alert" style={{ backgroundColor: T.surface, border: "1px solid #fecaca", borderRadius: R.lg, padding: "56px 32px", textAlign: "center", maxWidth: 480 }}>
          <h1 style={{ color: RUIM, fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Não foi possível carregar as análises</h1>
          <p style={{ color: T.second, fontSize: FS.body, marginBottom: 20, lineHeight: 1.5 }}>
            Sem uma das três fontes (eventos, peças, patrocinadores) todo número desta tela mudaria de significado —
            por isso nada é exibido pela metade.
          </p>
          <button onClick={retryAll} data-testid="button-retry-analises" disabled={isFetching}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: FS.body, fontWeight: 700, color: "#fff", background: T.dark, border: "none", borderRadius: R.md, padding: "9px 20px", cursor: isFetching ? "default" : "pointer", opacity: isFetching ? 0.7 : 1 }}>
            {isFetching && <RotateCcw aria-hidden="true" className="animate-spin" style={{ width: 13, height: 13 }} />}
            {isFetching ? "Tentando…" : "Tentar novamente"}
          </button>
        </div>
      </div>
    );
  }

  // Esqueleto com a SILHUETA REAL da tela: 4 KPIs, um gráfico de largura
  // inteira e a tabela de ofensores. Um esqueleto que não bate com o layout
  // provoca um salto no primeiro paint.
  if (isLoading) {
    return (
      <div style={{ backgroundColor: T.bg, height: "100%", overflowY: "auto", padding: PADDING_PAGINA(isMobile) }} aria-busy="true" aria-label="Carregando análises">
        <div className="animate-pulse" style={{ width: 240, height: 24, borderRadius: 4, backgroundColor: "#e7e5e4", marginBottom: 10 }} />
        <div className="animate-pulse" style={{ width: 420, maxWidth: "90%", height: 12, borderRadius: 4, backgroundColor: T.low, marginBottom: SP.bloco }} />
        {/* A silhueta acompanha a faixa nova: uma linha de gatilhos, não o card
            de duas linhas de antes — um esqueleto com a altura errada devolve o
            salto que ele existe para evitar. */}
        <div className="animate-pulse" style={{ height: 62, borderRadius: R.lg, backgroundColor: T.low, border: `1px solid ${T.border}`, marginBottom: SP.junto }} />
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 16, marginBottom: SP.secao }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ backgroundColor: T.surface, borderLeft: `4px solid ${T.border}`, padding: "18px 20px 16px", boxShadow: SHADOW.sm }}>
              <div className="animate-pulse" style={{ width: "75%", height: 10, borderRadius: 4, backgroundColor: T.low, marginBottom: 12 }} />
              <div className="animate-pulse" style={{ width: "50%", height: 24, borderRadius: 4, backgroundColor: "#e7e5e4", marginBottom: 12 }} />
              <div className="animate-pulse" style={{ width: "90%", height: 9, borderRadius: 4, backgroundColor: T.low }} />
            </div>
          ))}
        </div>
        <div className="animate-pulse" style={{ height: 340, backgroundColor: T.surface, border: `1px solid ${T.border}`, marginBottom: SP.secao }} />
        <div className="animate-pulse" style={{ height: 260, backgroundColor: T.surface, border: `1px solid ${T.border}` }} />
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: T.bg, height: "100%", overflowY: "auto", padding: PADDING_PAGINA(isMobile) }}>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: SP.bloco, gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: FS.h1, fontWeight: 700, color: T.text, margin: 0, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em", fontStyle: "italic" }}>
            Análises
          </h1>
          <p style={{ fontSize: FS.small, color: T.second, margin: `${SP.intra}px 0 0`, maxWidth: 680, lineHeight: 1.5 }}>
            O passado e o futuro da operação: desempenho dos <strong style={{ fontWeight: 700 }}>ciclos já encerrados</strong> e a
            carga que ainda vai vencer. O que está em andamento hoje fica no Painel Geral e na Gestão de Prazos.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <span
            data-testid="selo-frescor-analises"
            title={new Date(atualizadoEmMs).toLocaleString("pt-BR")}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: FS.small, color: dadoVelho ? "#b45309" : T.second, fontWeight: dadoVelho ? 700 : 400 }}
          >
            {isFetching && <RotateCcw aria-hidden="true" className="animate-spin" style={{ width: 11, height: 11 }} />}
            Atualizado {fmtRelative(new Date(atualizadoEmMs).toISOString(), agora)}
          </span>
          <button
            onClick={exportarCsv}
            data-testid="button-export-analises"
            title="Baixar os números desta tela em CSV, com os filtros aplicados"
            style={{ display: "flex", alignItems: "center", gap: 7, height: 34, padding: "0 14px", background: T.surface, border: `1px solid ${T.bdark}`, borderRadius: R.md, cursor: "pointer", fontSize: 11, fontWeight: 800, color: T.text, textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            <Download aria-hidden="true" style={{ width: 14, height: 14 }} /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Faixa em #f3f4f3, e não branca: o cinza separa CONTROLE de RESULTADO
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
        <dl style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 16, margin: 0 }}>
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
            />
          ))}
        </dl>
        {/* A ressalva pertence aos KPIs: fica a um degrau de distância deles
            (SP.junto) e a um degrau inteiro do próximo assunto (SP.secao).
            Aqui também moram as duas frases de método que saíram da linha de
            escopo quando ela virou resumo da faixa — o lugar delas é junto dos
            outros avisos de denominador, não repetidas ao lado de um gatilho
            que já diz o período. */}
        <p style={{ fontSize: FS.micro, color: T.second, margin: `${SP.junto}px 0 0`, lineHeight: 1.5, maxWidth: 900 }}>
          O período recorta pela <strong style={{ fontWeight: 700 }}>saída do caminhão já ocorrida</strong> (ciclo encerrado),
          não pela data em que a peça foi criada. Canceladas e excluídas não entram em nenhuma conta desta tela.
          {" "}Comparação contra a janela imediatamente anterior, do mesmo tamanho.
          {atual.prazoSemData > 0 && ` ${int(atual.prazoSemData)} peças entregues sem data registrada ficam fora da taxa de prazo.`}
          {atual.complementoPecas > 0 && ` ${int(atual.complementoPecas)} peças do recorte são complementos (quantidade extra pedida depois da produção).`}
          {" "}Retrabalho é <strong style={{ fontWeight: 700 }}>piso</strong>: conta refação registrada (arquivo final ou layout substituído) e reprovação ainda em aberto — o histórico completo só existe na trilha de auditoria.
        </p>
      </section>

      <section aria-labelledby="h-carga" style={{ backgroundColor: T.surface, border: `1px solid ${T.bdark}`, padding: isMobile ? "20px 16px" : "24px 28px 20px", marginBottom: SP.secao }}>
        {/* rowGap maior que o columnGap: quando a legenda não cabe ao lado do
            título (1366px com a barra lateral aberta), ela quebra para baixo e
            colava no parágrafo, que é de outro assunto. */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", columnGap: 16, rowGap: SP.junto, flexWrap: "wrap", marginBottom: SP.bloco }}>
          <div style={{ minWidth: 0 }}>
            <h2 id="h-carga" style={{ fontSize: FS.title, fontWeight: 700, color: T.text, margin: `0 0 ${SP.intra}px`, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em", fontStyle: "italic" }}>
              Capacidade × Demanda
            </h2>
            <p style={{ fontSize: FS.small, color: T.second, margin: 0, lineHeight: 1.45, maxWidth: 640 }}>
              m² que <strong style={{ fontWeight: 700 }}>vencem</strong> por semana (pela saída do caminhão) contra m² que a gráfica
              <strong style={{ fontWeight: 700 }}> concluiu</strong>. 12 semanas para trás e 8 para a frente — à direita da linha
              é previsto, ainda não aconteceu.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, backgroundColor: ACCENT_TEXT }} />
              <span style={{ fontSize: 10, fontWeight: 900, color: T.text, textTransform: "uppercase", letterSpacing: "0.12em" }}>Vence</span>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, backgroundColor: T.dark }} />
              <span style={{ fontSize: 10, fontWeight: 900, color: T.text, textTransform: "uppercase", letterSpacing: "0.12em" }}>Concluído</span>
            </span>
            {temMedia && (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 14, height: 2, backgroundColor: GRAFICO_NEUTRO }} />
                <span style={{ fontSize: 10, fontWeight: 900, color: T.text, textTransform: "uppercase", letterSpacing: "0.12em" }}>Média concluída</span>
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
            <figure role="img" style={{ margin: 0 }} aria-label={`Gráfico de barras semanais em metros quadrados: m² que vencem contra m² concluídos, de ${dadosCarga[0]?.label} a ${ultimaLabel}. Os números estão na tabela seguinte.`}>
              {/* 21 semanas × 2 barras não cabem em 375px sem virar risco:
                  no celular o gráfico rola na horizontal em vez de encolher
                  as barras até deixarem de ser comparáveis. */}
              <div style={{ overflowX: isMobile ? "auto" : "visible" }}>
                <div style={{ minWidth: isMobile ? 620 : undefined, height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dadosCarga} margin={{ top: 22, right: 8, left: -12, bottom: 0 }} barGap={2}>
                      <CartesianGrid stroke={T.border} vertical={false} />
                      {primeiraFutura && ultimaLabel && (
                        <ReferenceArea
                          x1={primeiraFutura} x2={ultimaLabel}
                          fill={T.low} fillOpacity={1}
                          label={{ value: "PREVISTO", position: "insideTopRight", fill: T.second, fontSize: 10, fontWeight: 900, letterSpacing: "0.12em" }}
                        />
                      )}
                      <XAxis dataKey="label" tick={{ fontSize: 9, fontWeight: 700, fill: T.second, fontFamily: "'DM Mono'" }} axisLine={{ stroke: T.bdark }} tickLine={false} interval={1} />
                      <YAxis tick={{ fontSize: 10, fill: T.second }} axisLine={false} tickLine={false} width={54}
                        label={{ value: "m²", position: "top", offset: 12, fill: T.second, fontSize: 10, fontWeight: 900 }} />
                      <Tooltip content={<CargaTip />} cursor={{ fill: "rgba(28,25,23,0.05)" }} />
                      {semanaAtualLabel && (
                        <ReferenceLine x={semanaAtualLabel} stroke={T.dark} strokeWidth={1.5}
                          label={{ value: "HOJE", position: "top", fill: T.text, fontSize: 10, fontWeight: 900, letterSpacing: "0.1em" }} />
                      )}
                      {carga.mediaConcluidoM2 != null && carga.mediaConcluidoM2 > 0 && (
                        <ReferenceLine y={carga.mediaConcluidoM2} stroke={GRAFICO_NEUTRO} strokeDasharray="5 4" strokeWidth={2} />
                      )}
                      <Bar dataKey="demanda" name="Vence" fill={ACCENT_TEXT} maxBarSize={26} isAnimationActive={false} />
                      <Bar dataKey="concluido" name="Concluído" fill={T.dark} maxBarSize={26} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
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
          Janela fixa: <strong style={{ fontWeight: 700 }}>não segue o filtro de período</strong> — um bloco de planejamento que
          encolhe com o recorte esconderia o pico que ele existe para antecipar. Segue os filtros de evento e patrocinador.
          {temMedia
            ? ` Linha tracejada: ${m2(carga.mediaConcluidoM2)} por semana, média das ${carga.semanasNaMedia} semanas passadas — a régua do que a casa costuma dar conta.`
            : " Sem produção registrada nas semanas passadas, não há média de capacidade para traçar."}
          {carga.demandaSemData > 0 && ` ${int(carga.demandaSemData)} peças estão em eventos sem data de saída válida e não entram na demanda.`}
          {carga.demandaForaDaJanela > 0 && ` ${int(carga.demandaForaDaJanela)} peças vencem fora desta janela de 21 semanas.`}
          {carga.semMedida > 0 && ` ${int(carga.semMedida)} peças concluídas não têm medida de arquivo e não somam m².`}
        </p>
      </section>

      {/* ── "Tempo por etapa" foi REMOVIDO daqui (e não esquecido) ──
          O bloco existia como lugar reservado: título, selo "DADO
          INDISPONÍVEL", um parágrafo explicando a limitação e seis linhas de
          "— dias". A intenção era honesta — não inventar número —, mas o efeito
          era meia dobra de tela ocupada para não informar nada, empurrando os
          Ofensores (conteúdo real) para baixo. Bloco a menos é melhor que bloco
          vazio.

          A LIMITAÇÃO CONTINUA VERDADEIRA, e é por isso que ela fica escrita
          aqui: `items` não guarda quando a peça ENTRA em cada etapa. Existem
          carimbos das etapas finais (`producedAt`, `conferredAt`,
          `deliveredAt`) e nada que marque a entrada em "aguardando envio" ou
          em "aguardando aprovação" — justamente as duas onde a operação mais
          reclama de perder tempo. Calcular permanência mediana por etapa a
          partir do que esta tela lê hoje só é possível INVENTANDO a data de
          entrada; não faça isso.

          O caminho para trazer o bloco de volta com número real existe e não
          passa por coluna nova: o servidor grava as mudanças de status em
          `audit_logs`, e a diferença entre carimbos consecutivos da mesma peça
          É a permanência. Isso exige um agregado no servidor (a trilha não é
          carregada por esta tela) e está sendo tratado à parte. Enquanto esse
          número não existir, o espaço não volta. */}

      <section aria-labelledby="h-ofensores" style={{ backgroundColor: T.surface, border: `1px solid ${T.bdark}` }}>
        <div style={{ padding: isMobile ? "20px 16px 16px" : "24px 28px 16px", borderBottom: `1px solid ${T.low}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", columnGap: 16, rowGap: SP.junto, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <h2 id="h-ofensores" style={{ fontSize: FS.title, fontWeight: 700, color: T.text, margin: `0 0 ${SP.intra}px`, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em", fontStyle: "italic" }}>
                Ofensores
              </h2>
              <p style={{ fontSize: FS.small, color: T.second, margin: 0, lineHeight: 1.45 }}>
                Quem custa caro no recorte, ordenado pelo que mais dói. Clique numa linha para ver as peças —
                {" "}{DIMENSOES.find((d) => d.value === dim)?.destino}.
              </p>
            </div>
            <div role="group" aria-label="Dimensão da tabela" style={{ display: "flex", border: `1px solid ${T.bdark}`, borderRadius: R.sm, overflow: "hidden", flexShrink: 0 }}>
              {DIMENSOES.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDim(d.value)}
                  aria-pressed={dim === d.value}
                  data-testid={`dim-${d.value}`}
                  style={{
                    padding: "7px 13px", border: "none", cursor: "pointer",
                    backgroundColor: dim === d.value ? T.dark : T.surface,
                    color: dim === d.value ? "#fff" : T.second,
                    fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em",
                  }}
                >
                  {d.label}
                </button>
              ))}
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
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
              <thead>
                <tr style={{ backgroundColor: T.low }}>
                  <th scope="col" style={{ padding: "11px 20px", fontSize: 10, fontWeight: 900, color: T.second, textTransform: "uppercase", letterSpacing: "0.14em", textAlign: "left" }}>
                    {DIMENSOES.find((d) => d.value === dim)?.label}
                  </th>
                  {ORDENS.map((o) => (
                    <th
                      key={o.value}
                      scope="col"
                      aria-sort={ordem === o.value ? "descending" : "none"}
                      style={{ padding: 0, textAlign: "right" }}
                    >
                      <button
                        onClick={() => setOrdem(o.value)}
                        data-testid={`ordem-${o.value}`}
                        title={`Ordenar por ${o.label.toLowerCase()}`}
                        style={{
                          width: "100%", padding: "11px 20px", background: "none", border: "none", cursor: "pointer",
                          fontSize: 10, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase",
                          textAlign: "right", color: ordem === o.value ? ACCENT_TEXT : T.second,
                        }}
                      >
                        {o.label}{ordem === o.value ? " ▾" : ""}
                      </button>
                    </th>
                  ))}
                  <th scope="col" style={{ padding: "11px 20px", fontSize: 10, fontWeight: 900, color: T.second, textTransform: "uppercase", letterSpacing: "0.14em", textAlign: "right" }}>
                    Em aberto
                  </th>
                  <th scope="col" style={{ width: 34 }}><span className="sr-only">Abrir</span></th>
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
                            style={{ fontSize: FS.body, fontWeight: 700, color: T.text, textDecoration: "none" }}
                          >
                            {o.label}
                          </a>
                        ) : (
                          <span style={{ fontSize: FS.body, fontWeight: 700, color: T.second }}>{o.label}</span>
                        )}
                        <span style={{ display: "block", fontSize: 10, color: T.second, marginTop: 3 }}>
                          {int(o.pecas)} peças · {m2(o.m2)}
                        </span>
                      </td>
                      <td style={{ padding: "13px 20px", textAlign: "right" }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: FS.small, fontWeight: 700, color: o.foraPrazo > 0 ? RUIM : T.text }}>
                          {o.prazoAvaliadas > 0 ? `${int(o.foraPrazo)} de ${int(o.prazoAvaliadas)}` : "—"}
                        </span>
                        <span style={{ display: "block", fontSize: 10, color: T.second, marginTop: 3 }}>
                          {o.prazoAvaliadas > 0 ? `${pct(o.prazoRate, 0)} no prazo` : "sem entrega avaliável"}
                        </span>
                      </td>
                      <td style={{ padding: "13px 20px", textAlign: "right" }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: FS.small, fontWeight: 700, color: o.retrabalhoPecas > 0 ? ACCENT_TEXT : T.text }}>
                          {int(o.retrabalhoPecas)} de {int(o.pecas)}
                        </span>
                        <span style={{ display: "block", fontSize: 10, color: T.second, marginTop: 3 }}>{pct(o.retrabalhoRate, 0)}</span>
                      </td>
                      <td style={{ padding: "13px 20px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontSize: FS.small, fontWeight: 700, color: T.text }}>
                        {dias(o.cicloMedianaDias)}
                      </td>
                      <td style={{ padding: "13px 20px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontSize: FS.small, fontWeight: 700, color: T.text }}>
                        {m2(o.m2)}
                      </td>
                      <td style={{ padding: "13px 20px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontSize: FS.small, fontWeight: 700, color: T.text }}>
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
          <p style={{ padding: isMobile ? "12px 16px 18px" : "14px 28px 20px", fontSize: 10, color: T.second, margin: 0, lineHeight: 1.5 }}>
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
