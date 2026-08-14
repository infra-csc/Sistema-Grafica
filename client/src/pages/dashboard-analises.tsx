import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { FilterSelect } from "@/components/filter-select";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import {
  TrendingUp, ChevronRight, Download, RotateCcw, SearchX,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useLocation } from "wouter";
import { getStatusLabel, getStatusMeta } from "@/lib/status";
import { fmtRelative } from "@/components/prazos/tokens";
import { useIsMobile } from "@/hooks/use-mobile";
// Tokens canônicos — a paleta local divergia do resto do app (border, low e
// bdark tinham valores próprios) e T.muted era usado como cor de TEXTO, o que
// reprova AA em todas as superfícies (ver lib/theme.ts).
import { T, FS, R, SHADOW } from "@/lib/theme";
// Regra pura: taxonomia espelhada do funil canônico do servidor + agregados de
// uma passada. Antes tudo isto era declarado e recalculado dentro do render.
import type { AnaliseEvent, AnaliseItem, AnaliseSponsor } from "@/lib/analises-metrics";
import {
  computeAlerts, computeByType, computeDonut, computeKpis, computeMonthly,
  computeTopSponsors, cycleWindow, eventCycleDayIndex, filterEvents, filterItems,
  monthKeysEndingAt,
} from "@/lib/analises-metrics";

/* Laranja para TEXTO (orange-700): o T.accent saturado fica em ~2.8:1 sobre
   branco — vale para bordas, nunca para rótulo legível nem para objeto
   gráfico que carrega significado (1.4.11 pede 3:1 e o saturado dá 2,5-2,8). */
const ACCENT_TEXT = T.accentText;

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

/* Cores dos objetos gráficos com significado — todas saem de lib/status.ts
   (fonte única). Medidas sobre T.low (#f3f4f3), o fundo real das barras:
   as três passam folgado em 1.4.11. A faixa "Regular" era
   #eab308 = 1,74:1, ou seja, o estado intermediário — o que mais precisa ser
   lido de relance — era o invisível. */
function rateColor(rate: number): string {
  if (rate >= 80) return getStatusMeta("delivered").text;         // emerald-700 #047857 (4,97:1)
  if (rate >= 60) return getStatusMeta("awaiting_approval").text; // amber-700   #b45309 (4,59:1)
  return getStatusMeta("canceled").text;                          // red-700     #b91c1c (5,93:1)
}

/* ── Status labels ── */
// Opções do filtro de status — rótulos derivam de lib/status.ts (fonte única).
// Lista canônica, sem os status "legacy" duplicados que geravam entradas
// repetidas no dropdown; inclui "Conferido", que faltava.
const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  [
    "requested", "awaiting_linking", "awaiting_submission", "awaiting_approval",
    "awaiting_finalization", "awaiting_final_review", "ready_for_production",
    "approved", "inProduction", "produced", "conferred", "delivered",
  ].map((k) => [k, getStatusLabel(k)]),
);

/* ── Badge editorial (status table) ── */
function EdBadge({ rate }: { rate: number }) {
  const cfg = rate >= 80
    ? { bg: T.dark,   color: "#fff",    label: "Ótimo"    }
    : rate >= 60
    ? { bg: "#f5f5f4", color: "#746e69", label: "Regular"  }
    // #c2410c: branco sobre o T.accent saturado ficava em 2.8:1 — o badge
    // mais urgente era o menos legível dos três.
    : { bg: ACCENT_TEXT, color: "#fff", label: "Crítico"  };
  return (
    <span style={{
      padding: "3px 8px", fontSize: 10, fontWeight: 900,
      textTransform: "uppercase", letterSpacing: "0.1em", fontStyle: "italic",
      backgroundColor: cfg.bg, color: cfg.color,
    }}>
      {cfg.label}
    </span>
  );
}

/* ── Tooltip ── */
const ChartTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: T.dark, color: "#fff", borderRadius: 6, padding: "8px 12px", fontSize: 11 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color === T.dark ? "#ccc" : p.color }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
};

/* ── Campo de filtro (rótulo + ponto de "ativo" + FilterSelect) ──
   NO MÓDULO, não dentro do render: definido inline, o React via um componente
   NOVO a cada re-render e desmontava/remontava o dropdown — ele fechava
   sozinho e perdia o texto buscado a cada tecla. */
function Fld({ label, allLabel, value, onChange, testId, options }: {
  label: string; allLabel: string; value: string; onChange: (v: string) => void;
  testId?: string; options: { value: string; label: string; count?: number; pinned?: boolean }[];
}) {
  const active = value !== "all";
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
        <span style={{ fontSize: 10, fontWeight: 900, color: active ? ACCENT_TEXT : T.second, textTransform: "uppercase", letterSpacing: "0.16em", transition: "color 0.15s" }}>
          {label}
        </span>
        {active && (
          <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: ACCENT_TEXT, flexShrink: 0 }} />
        )}
      </div>
      <FilterSelect
        fullWidth showAllLabelWhenEmpty hideWhenEmpty={false}
        label={label} allLabel={allLabel}
        value={value} onChange={onChange}
        options={options}
        searchPlaceholder={`Buscar ${label.toLowerCase()}...`}
        emptyText="Nada encontrado."
        testId={testId}
        triggerStyle={{
          height: "auto", padding: "9px 10px",
          backgroundColor: active ? "#fff7ed" : T.low,
          border: `1px solid ${active ? "#fed7aa" : T.border}`,
          borderRadius: R.sm,
          fontSize: 11, fontWeight: active ? 700 : 600,
          color: active ? ACCENT_TEXT : T.text,
        }}
      />
    </div>
  );
}

// Chaves do recorte na URL — regra da casa (o recorte tem de ser
// compartilhável, sobreviver a um F5 e voltar com o botão Voltar). Mesmo
// padrão da Gestão de Prazos.
const URL_KEYS = { period: "periodo", event: "evento", status: "status", sponsor: "patrocinador" } as const;

function lerFiltrosDaUrl(): { period: string; event: string; status: string; sponsor: string } {
  const p = new URLSearchParams(window.location.search);
  const val = (k: string) => p.get(k) || "all";
  return {
    period: PERIODS.some(x => x.value === val(URL_KEYS.period)) ? val(URL_KEYS.period) : "all",
    event: val(URL_KEYS.event),
    status: val(URL_KEYS.status),
    sponsor: val(URL_KEYS.sponsor),
  };
}

export default function DashboardAnalises() {
  const isMobile = useIsMobile();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const inicial = useMemo(lerFiltrosDaUrl, []);
  const [period, setPeriod]       = useState(inicial.period);
  const [eventFilter, setEventFilter]   = useState(inicial.event);
  const [statusFilter, setStatusFilter] = useState(inicial.status);
  const [sponsorFilter, setSponsorFilter] = useState(inicial.sponsor);

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
  // spLoading incluso: sem ele, a tela pintava com "Top Patrocinadores" vazio
  // e o filtro de patrocinador sem opções até a terceira fonte chegar.
  const isLoading = evQ.isLoading || itQ.isLoading || spQ.isLoading;
  // Qualquer uma das 3 fontes falhando distorce os números em silêncio
  // (ex.: sem /api/sponsors o "Top Patrocinadores" viraria "sem dados") —
  // melhor avisar e oferecer nova tentativa do que exibir análises erradas.
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
  // de `fItems`: com qualquer período selecionado os sete `useMemo` da tela
  // recalculavam em TODO render (hover, invalidação de WebSocket de qualquer
  // usuário, qualquer mudança de estado). Também alimenta o selo "Atualizado
  // há X" e faz a janela de 6 meses avançar numa aba deixada aberta.
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
      const set = (k: string, v: string) => { if (v === "all") p.delete(k); else p.set(k, v); };
      set(URL_KEYS.period, period);
      set(URL_KEYS.event, eventFilter);
      set(URL_KEYS.status, statusFilter);
      set(URL_KEYS.sponsor, sponsorFilter);
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    }, 250);
    return () => { if (urlTimer.current) clearTimeout(urlTimer.current); };
  }, [period, eventFilter, statusFilter, sponsorFilter]);

  useEffect(() => {
    const onPop = () => {
      const f = lerFiltrosDaUrl();
      setPeriod(f.period); setEventFilter(f.event);
      setStatusFilter(f.status); setSponsorFilter(f.sponsor);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Ciclo do evento (saída do caminhão) — é por ele que o período recorta.
  const cycleDayByEvent = useMemo(() => eventCycleDayIndex(events), [events]);
  const janelaCiclo = useMemo(() => cycleWindow(period, agora), [period, agora]);

  const fEvents = useMemo(
    () => filterEvents(events, cycleDayByEvent, janelaCiclo),
    [events, cycleDayByEvent, janelaCiclo]);

  const fItems = useMemo(
    () => filterItems(items, cycleDayByEvent, { window: janelaCiclo, eventFilter, statusFilter, sponsorFilter }),
    [items, cycleDayByEvent, janelaCiclo, eventFilter, statusFilter, sponsorFilter]);

  /* ── KPIs ── */
  const totalEvents = fEvents.length;
  const kpis = useMemo(() => computeKpis(fItems), [fItems]);
  const { totalQty, deliveryRate, approvalRate, inProdQty, inProdRate, outOfFunnelQty } = kpis;

  /* ── Monthly data for dual area ── */
  const monthKeys = useMemo(() => monthKeysEndingAt(agora, 6), [agora]);

  // fItems (não items): o gráfico ignorava TODOS os filtros da tela — os KPIs
  // mudavam com o recorte e a curva continuava a mesma; o CSV exportava a
  // divergência junto. Agora o gráfico (e o CSV, que herda daqui) respeita o
  // mesmo recorte do resto da tela.
  const monthlyData = useMemo(() =>
    computeMonthly(fItems, monthKeys).map(p => {
      const [y, m] = p.key.split("-").map(Number);
      // Com ano ("JAN/26"): a janela de 6 meses cruza a virada do ano e um
      // "JAN" solto era ambíguo no gráfico — e pior ainda no CSV arquivado.
      return { ...p, label: format(new Date(y, m - 1, 1), "MMM/yy", { locale: ptBR }).toUpperCase() };
    }), [fItems, monthKeys]);

  /* ── Donut data ── */
  const donutData = useMemo(
    () => computeDonut(fItems).map(s => ({
      ...s,
      // Cor pela fonte única (lib/status.ts). "Outros" fica no cinza neutro
      // #78716c: 3,65:1 sobre o card escuro — o #57534e antigo sumia.
      color: s.colorStatus ? getStatusMeta(s.colorStatus).dot : "#78716c",
    })),
    [fItems]);

  /* ── Top sponsors ── */
  const topSponsors = useMemo(() => computeTopSponsors(fItems, sponsors), [fItems, sponsors]);
  const maxSponsorQty = useMemo(
    () => topSponsors.reduce((m, s) => Math.max(m, s.qty), 1),
    [topSponsors]);

  /* ── By type ── */
  const byType = useMemo(() => computeByType(fItems), [fItems]);

  /* ── Alerts ──
     Urgência e saída iminente olham para `events` (todos), de propósito: um
     caminhão que sai amanhã não deixa de ser urgente porque o evento está fora
     do recorte. O escopo é carimbado em texto abaixo do bloco — sem carimbo, a
     linha parecia contradizer o filtro. */
  const alerts = useMemo(
    () => computeAlerts({ events, items: fItems, nowMs: agora }),
    [events, fItems, agora]);

  /* ── Exportação ──────────────────────────────────────────────────────
     "Exportar" e "Partilhar" eram botões sem onClick: pareciam ações e não
     faziam nada. Exportar é a que faz sentido aqui — quem abre esta tela
     costuma precisar levar os números para uma reunião ou planilha.
     O arquivo leva o mesmo recorte que está na tela (os filtros aplicados),
     senão o número exportado não bate com o número exibido.

     CSV com ponto e vírgula e BOM: o Excel em pt-BR lê vírgula como separador
     decimal, e sem o BOM ele abre os acentos quebrados. */
  const exportarCsv = () => {
    const esc = (v: unknown) => {
      const t = String(v ?? "");
      // \r incluso: um retorno de carro solto num nome quebraria a linha do
      // CSV (as linhas do arquivo usam \r\n como separador).
      return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const linha = (cols: unknown[]) => cols.map(esc).join(";");
    const periodoLabel = PERIODS.find(p => p.value === period)?.label ?? period;
    // Os 4 filtros declarados no cabeçalho: o CSV circula sozinho e, sem o
    // recorte escrito nele, os números pareceriam globais.
    const eventoLabel  = eventFilter  === "all" ? "Todos" : ((events as any[]).find(e => e.id === eventFilter)?.name ?? eventFilter);
    const statusLabel  = statusFilter === "all" ? "Todos" : (STATUS_LABELS[statusFilter] ?? statusFilter);
    const sponsorLabel = sponsorFilter === "all" ? "Todos" : ((sponsors as any[]).find(s => s.id === sponsorFilter)?.name ?? sponsorFilter);

    const blocos: string[] = [];
    blocos.push(linha(["Análises & Performance"]));
    blocos.push(linha(["Gerado em", format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })]));
    blocos.push(linha(["Período", periodoLabel]));
    blocos.push(linha(["Evento", eventoLabel]));
    blocos.push(linha(["Status", statusLabel]));
    blocos.push(linha(["Patrocinador", sponsorLabel]));
    blocos.push(linha(["Recorte de período", "Por saída do caminhão (ciclo do evento)"]));
    blocos.push(linha(["Peças fora do funil (não somadas)", outOfFunnelQty]));
    blocos.push("");

    blocos.push(linha(["INDICADORES"]));
    blocos.push(linha(["Indicador", "Valor"]));
    KPI.forEach(k => blocos.push(linha([k.label, k.value])));
    blocos.push("");

    blocos.push(linha(["POR TIPO DE PEÇA"]));
    blocos.push(linha(["Tipo", "Total", "Entregues", "Taxa de entrega (%)"]));
    byType.forEach(t => blocos.push(linha([t.type, t.total, t.delivered, t.rate.toFixed(1).replace(".", ",")])));
    blocos.push("");

    blocos.push(linha(["EVOLUÇÃO MENSAL"]));
    blocos.push(linha(["Mês", "Produção", "Entregas"]));
    monthlyData.forEach(m => blocos.push(linha([m.label, m.producao, m.entregas])));
    blocos.push("");

    blocos.push(linha(["PATROCINADORES COM MAIS PEÇAS"]));
    blocos.push(linha(["Patrocinador", "Peças"]));
    topSponsors.forEach(s => blocos.push(linha([s.name, s.qty])));

    const blob = new Blob(["﻿" + blocos.join("\r\n")], { type: "text/csv;charset=utf-8" });
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

  /* ── KPI card data ──
     pct: null = sem barra. "Total de Peças" tinha uma barra sempre em 100% e
     "Eventos" uma em totalEvents*10 — decoração que parecia dado. O bloco de
     delta também saiu: era sempre string vazia desde que nasceu. */
  const KPI: { label: string; value: string; pct: number | null; accent: boolean }[] = [
    // Total do FUNIL: peça cancelada/excluída/arquivada não é pendência nem
    // total (regra do domínio do servidor). O que ficou de fora aparece como
    // nota abaixo da rosca, em vez de sumir sem aviso.
    { label: "Total de Peças",   value: totalQty.toLocaleString("pt-BR"), pct: null, accent: true  },
    { label: "Taxa de Entrega",  value: `${deliveryRate.toFixed(1)}%`,    pct: deliveryRate, accent: false },
    // "SLA de Aprovação" prometia um SLA que ninguém mede aqui; o número é a
    // fatia de peças que já passou da aprovação (aprovadas ou etapas além).
    { label: "Peças Aprovadas ou Além", value: `${approvalRate.toFixed(1)}%`, pct: approvalRate, accent: true  },
    { label: "Em Produção",      value: inProdQty.toLocaleString("pt-BR"), pct: inProdRate, accent: false },
    // O rótulo acompanha o recorte: com período ativo são os eventos cuja
    // SAÍDA caiu na janela, não os que foram criados nela.
    { label: period === "all" ? "Eventos Cadastrados" : "Eventos com Saída no Período", value: totalEvents.toLocaleString("pt-BR"), pct: null, accent: true  },
  ];

  // ── Estados que precisam ser distinguidos ────────────────────────────────
  // "Tudo em ordem" com selo verde tinha quatro causas e uma só resposta: não
  // havia como diferenciar "não há alerta" de "o filtro eliminou tudo".
  const filtrosAtivos = [period !== "all", eventFilter !== "all", statusFilter !== "all", sponsorFilter !== "all"].filter(Boolean).length;
  const recorteVazio = fItems.length === 0 && filtrosAtivos > 0;
  const baseVazia = items.length === 0;

  // Selo de frescor: o dado é tão velho quanto a MAIS velha das três fontes.
  const atualizadoEmMs = Math.min(
    evQ.dataUpdatedAt || agora, itQ.dataUpdatedAt || agora, spQ.dataUpdatedAt || agora,
  );
  const atualizadoEmIso = new Date(atualizadoEmMs).toISOString();
  const dadoVelho = agora - atualizadoEmMs >= 10 * 60_000;

  if (isError) {
    return (
      <div style={{ backgroundColor: T.bg, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div role="alert" style={{ backgroundColor: T.surface, border: "1px solid #fecaca", borderRadius: R.lg, padding: "56px 32px", textAlign: "center", maxWidth: 480 }}>
          <h3 style={{ color: "#b91c1c", fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Não foi possível carregar as análises</h3>
          <p style={{ color: T.second, fontSize: FS.body, marginBottom: 20 }}>Verifique sua conexão e tente novamente.</p>
          {/* Estado de carregamento no botão: antes ele disparava três refetch
              e retornava — clique sem resposta visível é lido como botão
              quebrado. Este é o único botão de recarga da tela e existe porque
              aqui a recarga automática já falhou. */}
          <button onClick={retryAll} data-testid="button-retry-analises" disabled={isFetching}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: FS.body, fontWeight: 700, color: "#fff", background: T.dark, border: "none", borderRadius: R.md, padding: "9px 20px", cursor: isFetching ? "default" : "pointer", opacity: isFetching ? 0.7 : 1 }}>
            {isFetching && <RotateCcw aria-hidden="true" className="animate-spin" style={{ width: 13, height: 13 }} />}
            {isFetching ? "Tentando…" : "Tentar novamente"}
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ backgroundColor: T.bg, height: "100%", overflowY: "auto", padding: isMobile ? "14px 16px 48px" : "28px 32px 64px" }} aria-busy="true" aria-label="Carregando análises">
        <div className="animate-pulse" style={{ width: 220, height: 22, borderRadius: 4, backgroundColor: "#e7e5e4", marginBottom: 28 }} />
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(5, 1fr)", gap: 16, marginBottom: 24 }}>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{ backgroundColor: T.surface, borderLeft: `4px solid ${T.border}`, padding: "22px 20px 18px", boxShadow: SHADOW.sm }}>
              <div className="animate-pulse" style={{ width: "80%", height: 10, borderRadius: 4, backgroundColor: T.low, marginBottom: 14 }} />
              <div className="animate-pulse" style={{ width: "50%", height: 24, borderRadius: 4, backgroundColor: "#e7e5e4" }} />
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr", gap: 16 }}>
          <div className="animate-pulse" style={{ height: 320, backgroundColor: T.surface, border: `1px solid ${T.border}` }} />
          <div className="animate-pulse" style={{ height: 320, backgroundColor: "#e7e5e4" }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: T.bg, height: "100%", overflowY: "auto", padding: isMobile ? "14px 16px 48px" : "28px 32px 64px" }}>

      {/* ── Header row: title + export buttons ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: FS.title, fontWeight: 700, color: T.text, margin: 0, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em", fontStyle: "italic" }}>
            Análises &amp; Performance
          </h2>
          {/* Subtítulo declarando o MODELO. Sem ele, o mesmo número servia a
              duas leituras opostas: o recorte de período corta pelo ciclo do
              evento (saída do caminhão já ocorrida), não pela criação da peça. */}
          <p style={{ fontSize: FS.small, color: T.second, margin: "5px 0 0", maxWidth: 620, lineHeight: 1.45 }}>
            O período recorta por <strong style={{ fontWeight: 700 }}>saída do caminhão já ocorrida</strong> — as peças
            medidas são as de ciclos que já venceram. O que está em andamento hoje fica no Painel Geral e na Gestão de Prazos.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          {/* Selo de frescor, sem botão "Atualizar": a tela se atualiza sozinha
              (polling de 60s + revalidação no foco). O texto "Dados em tempo
              real" que ficava na Eficiência por Categoria era falso — o
              queryClient global roda com staleTime: Infinity e nenhum handler
              de WebSocket invalida /api/sponsors. O spinner é o único sinal de
              que uma recarga está em curso. */}
          <span
            data-testid="selo-frescor-analises"
            title={new Date(atualizadoEmMs).toLocaleString("pt-BR")}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: FS.small, color: dadoVelho ? "#b45309" : T.second, fontWeight: dadoVelho ? 700 : 400 }}
          >
            {isFetching && <RotateCcw aria-hidden="true" className="animate-spin" style={{ width: 11, height: 11 }} />}
            Atualizado {fmtRelative(atualizadoEmIso, agora)}
          </span>
          {/* "Partilhar" saiu: não tinha onClick e não existe para onde
              compartilhar. Um botão que não faz nada custa mais confiança do que
              entrega — e o termo é português europeu, fora do resto da interface.
              O rótulo a 9px também era o menor texto da tela. */}
          <button
            onClick={exportarCsv}
            data-testid="button-export-analises"
            title="Baixar os números desta tela em CSV, com os filtros aplicados"
            style={{ display: "flex", alignItems: "center", gap: 7, height: 34, padding: "0 14px", background: T.surface, border: `1px solid ${T.bdark}`, borderRadius: R.md, cursor: "pointer", fontSize: 11, fontWeight: 800, color: T.text, textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            <Download style={{ width: 14, height: 14 }} /> Exportar CSV
          </button>
        </div>
      </div>

      {/* ── Global filters — card branco Titanium ── */}
      {(() => {
        const activeCount = filtrosAtivos;
        const hasActive = activeCount > 0;

        return (
          /* No celular os 4 selects lado a lado esmagavam uns aos outros:
             empilha em coluna e esconde os divisores verticais. */
          <div style={{
            backgroundColor: T.surface,
            border: `1px solid ${T.bdark}`,
            borderRadius: R.lg,
            padding: "18px 20px",
            marginBottom: 24,
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            flexWrap: "wrap",
            alignItems: isMobile ? "stretch" : "flex-end",
            gap: 16,
          }}>
            <Fld
              label="Período" allLabel={PERIODS.find(p => p.value === "all")?.label || "Todo o período"}
              value={period} onChange={setPeriod} testId="select-period"
              options={PERIODS.filter(p => p.value !== "all").map(p => ({ value: p.value, label: p.label, pinned: true }))}
            />

            {!isMobile && (
              <div style={{ width: 1, height: 40, backgroundColor: T.border, flexShrink: 0 }} />
            )}

            {/* Mesmo invólucro do Fld (rótulo + ponto de ativo): o filtro de
                evento era o único do card sem rótulo — parecia de outra tela.
                O EventFilterDropdown é compartilhado e trava a própria largura
                com estilos inline (flexShrink/maxWidth); no celular, o
                override escopado abaixo o estica para a coluna sem tocar no
                componente (que serve outras telas). */}
            <div className="fld-evento-analises" style={{ flex: 1 }}>
              {isMobile && (
                <style>{`
                  .fld-evento-analises > div:last-child { width: 100%; }
                  .fld-evento-analises > div:last-child > button { max-width: none !important; width: 100%; }
                  .fld-evento-analises > div:last-child > button > span:first-child { max-width: none !important; flex: 1; text-align: left; }
                `}</style>
              )}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: eventFilter !== "all" ? ACCENT_TEXT : T.second, textTransform: "uppercase", letterSpacing: "0.16em", transition: "color 0.15s" }}>
                  Evento
                </span>
                {eventFilter !== "all" && (
                  <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: ACCENT_TEXT, flexShrink: 0 }} />
                )}
              </div>
              <EventFilterDropdown
                value={eventFilter}
                onChange={setEventFilter}
                options={(events as any[]).map(e => ({ value: e.id, label: e.name }))}
                allLabel={`Todos os eventos (${(events as any[]).length})`}
              />
            </div>

            <Fld
              label="Status" allLabel="Todos os status"
              value={statusFilter} onChange={setStatusFilter} testId="select-status"
              options={Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l as string }))}
            />

            <Fld
              label="Patrocinador" allLabel="Todos os patrocinadores"
              value={sponsorFilter} onChange={setSponsorFilter} testId="select-sponsor"
              options={sponsors.map((s: any) => ({ value: s.id, label: s.name }))}
            />

            {!isMobile && (
              <div style={{ width: 1, height: 40, backgroundColor: T.border, flexShrink: 0 }} />
            )}

            {/* Clear button — só aparece quando há filtro ativo */}
            <div style={{ flexShrink: 0, display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
              {hasActive ? (
                <button
                  data-testid="btn-clear-filters"
                  onClick={() => { setPeriod("all"); setEventFilter("all"); setStatusFilter("all"); setSponsorFilter("all"); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "8px 14px",
                    backgroundColor: "#fef2f2", border: "1px solid #fecaca",
                    borderRadius: R.sm, cursor: "pointer",
                    fontSize: 10, fontWeight: 800, color: "#b91c1c",
                    textTransform: "uppercase", letterSpacing: "0.1em",
                    whiteSpace: "nowrap", transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#fee2e2"; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#fef2f2"; }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 2L8 8M8 2L2 8" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  Limpar ({activeCount})
                </button>
              ) : (
                <div style={{ padding: "8px 14px", fontSize: 10, color: T.second, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Sem filtros
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── KPI cards — border-l-4 editorial ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(5, 1fr)", gap: 16, marginBottom: 24 }}>
        {KPI.map(card => (
          <div key={card.label} style={{
            backgroundColor: T.surface,
            borderLeft: `4px solid ${card.accent ? T.accent : T.dark}`,
            padding: "22px 20px 18px",
            boxShadow: SHADOW.sm,
            transition: "transform 0.25s",
          }}
            onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-3px)")}
            onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}
          >
            <p style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.18em", color: T.second, margin: "0 0 14px" }}>
              {card.label}
            </p>
            <h3 style={{ fontSize: FS.h1, fontWeight: 700, color: T.text, margin: "0 0 14px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em", lineHeight: 1 }}>
              {card.value}
            </h3>
            {card.pct != null && (
              /* ACCENT_TEXT e não T.accent: a barra CARREGA o percentual, então
                 é objeto gráfico significativo (1.4.11, mínimo 3:1) — o laranja
                 saturado sobre #f0efee dá ~2,7:1. */
              <div style={{ height: 3, width: "100%", backgroundColor: "#f0efee", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(100, card.pct)}%`, backgroundColor: card.accent ? ACCENT_TEXT : T.dark, transition: "width 0.5s" }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Row 1: Area chart + Dark donut ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr", gap: 16, marginBottom: 16 }}>

        {/* Velocidade de Produção vs Entregas */}
        <div style={{ backgroundColor: T.surface, border: `1px solid ${T.bdark}`, padding: "32px 28px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
            <div>
              <h3 style={{ fontSize: FS.title, fontWeight: 700, color: T.text, margin: "0 0 4px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em", fontStyle: "italic" }}>
                Velocidade de Produção vs. Entregas
              </h3>
              <p style={{ fontSize: 10, color: T.second, margin: 0, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
                Fluxo de materiais consolidado por mês
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              {/* O quadrado da legenda é a única chave entre a cor e a série:
                  em T.accent ele media 2,80:1 sobre branco. Mesmo tom da linha
                  do gráfico, para os dois continuarem sendo a mesma coisa. */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, backgroundColor: ACCENT_TEXT }} />
                <span style={{ fontSize: 10, fontWeight: 900, color: T.text, textTransform: "uppercase", letterSpacing: "0.12em" }}>Produção</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, backgroundColor: T.dark }} />
                <span style={{ fontSize: 10, fontWeight: 900, color: T.text, textTransform: "uppercase", letterSpacing: "0.12em" }}>Entregas</span>
              </div>
            </div>
          </div>
          {/* figure role="img": o SVG do recharts é ruído para leitor de tela;
              o aria-label resume e a tabela sr-only entrega os números. */}
          <figure role="img" aria-label="Gráfico de área: produção e entregas por mês, últimos 6 meses" style={{ margin: 0 }}>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={monthlyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gProd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT_TEXT} stopOpacity={0.12} />
                    <stop offset="100%" stopColor={ACCENT_TEXT} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gDel" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={T.dark} stopOpacity={0.10} />
                    <stop offset="100%" stopColor={T.dark} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 10, fontWeight: 900, fill: T.second, fontFamily: "'DM Mono'", letterSpacing: "0.06em" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: T.second }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTip />} />
                <Area type="monotone" dataKey="producao" name="Produção" stroke={ACCENT_TEXT} strokeWidth={3} fill="url(#gProd)" dot={false} />
                <Area type="monotone" dataKey="entregas"  name="Entregas"  stroke={T.dark}   strokeWidth={2.5} fill="url(#gDel)"  dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </figure>
          <table className="sr-only">
            <caption>Evolução mensal de produção e entregas</caption>
            <thead>
              <tr><th scope="col">Mês</th><th scope="col">Produção</th><th scope="col">Entregas</th></tr>
            </thead>
            <tbody>
              {monthlyData.map(m => (
                <tr key={m.label}><td>{m.label}</td><td>{m.producao}</td><td>{m.entregas}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Dark donut card */}
        <div style={{ backgroundColor: T.dark, padding: "32px 28px", display: "flex", flexDirection: "column" }}>
          <h3 style={{ fontSize: FS.strong, fontWeight: 700, color: "#ffffff", margin: "0 0 28px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em", fontStyle: "italic" }}>
            Status do Inventário
          </h3>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <figure role="img" aria-label={`Gráfico de rosca: distribuição das ${totalQty.toLocaleString("pt-BR")} peças por etapa do fluxo${donutData.length ? " — " + donutData.map(d => `${d.label} ${d.pct}%`).join(", ") : ""}`} style={{ margin: 0, position: "relative", width: 192, height: 192 }}>
              {/* Placeholder em #78716c: o #292524 antigo media ~1,3:1 sobre o
                  card escuro e o anel "vazio" sumia — "não há dado" ficava
                  indistinguível de "não carregou". */}
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData.length ? donutData : [{ label: "Vazio", qty: 1, color: "#78716c", pct: 100 }]}
                    cx="50%" cy="50%" innerRadius={60} outerRadius={86}
                    dataKey="qty" strokeWidth={3} stroke={T.dark}
                  >
                    {(donutData.length ? donutData : [{ color: "#78716c" }]).map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: FS.h1, fontWeight: 700, color: "#fff", fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1 }}>
                  {totalQty.toLocaleString("pt-BR")}
                </span>
                {/* #a8a29e: sobre o fundo escuro o #746e69 (feito para fundos
                    claros) ficava abaixo de 3:1 — aqui a lógica inverte. */}
                <span style={{ fontSize: 10, fontWeight: 900, color: "#a8a29e", textTransform: "uppercase", letterSpacing: "0.18em", marginTop: 5 }}>
                  Total Peças
                </span>
              </div>
            </figure>

            {/* Legend — dark style */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 24, width: "100%", maxWidth: 200 }}>
              {donutData.map(d => (
                <div key={d.key} title={`${d.qty.toLocaleString("pt-BR")} peças`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #292524", paddingBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: d.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#a8a29e", textTransform: "uppercase", letterSpacing: "0.1em" }}>{d.label}</span>
                  </div>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700, color: "#fff" }}>{d.pct}%</span>
                </div>
              ))}
              {donutData.length === 0 && (
                <p style={{ fontSize: 11, color: "#a8a29e", textAlign: "center" }}>
                  {recorteVazio ? "Nenhuma peça neste recorte" : "Sem peças cadastradas"}
                </p>
              )}
              {/* Canceladas/excluídas não entram no total (regra do funil do
                  servidor). Dizer quantas ficaram de fora é o que impede o
                  total desta tela de parecer discordar do Painel Geral. */}
              {outOfFunnelQty > 0 && (
                <p style={{ fontSize: 10, color: "#a8a29e", textAlign: "center", margin: "2px 0 0", lineHeight: 1.4 }}>
                  +{outOfFunnelQty.toLocaleString("pt-BR")} fora do funil (canceladas ou excluídas), não somadas
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 2: Efficiency table + Status board ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>

        {/* Eficiência por Categoria */}
        <div style={{ backgroundColor: T.surface, border: `1px solid ${T.bdark}`, overflow: "hidden" }}>
          <div style={{ padding: "20px 28px", borderBottom: `1px solid ${T.low}`, backgroundColor: "rgba(245,245,244,0.5)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: FS.title, fontWeight: 700, color: T.text, margin: 0, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em", fontStyle: "italic" }}>
              Eficiência por Categoria
            </h3>
            {/* "Dados em tempo real" saiu: era falso (staleTime: Infinity, sem
                revalidação, /api/sponsors sem invalidação de WebSocket) e o
                frescor agora é declarado com número no selo do cabeçalho.
                No lugar, o que a coluna de fato mede — sem prazo na conta. */}
            <span style={{ fontSize: 10, fontWeight: 900, color: T.second, textTransform: "uppercase", letterSpacing: "0.14em" }}>% Entregue por tipo</span>
          </div>
          {/* No celular as 4 colunas esmagavam a barra de eficiência a zero:
              a tabela mantém uma largura mínima e rola dentro do card. */}
          <div style={{ overflowX: isMobile ? "auto" : "visible" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 460 : undefined }}>
            <thead>
              <tr style={{ backgroundColor: T.low }}>
                {["Categoria", "Volume", "Eficiência", "Status"].map(h => (
                  <th key={h} style={{ padding: "12px 20px", fontSize: 10, fontWeight: 900, color: T.second, textTransform: "uppercase", letterSpacing: "0.16em", textAlign: "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byType.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: "32px 20px", textAlign: "center", fontSize: FS.body, color: T.second }}>
                  {recorteVazio ? "Nenhuma peça neste recorte — ajuste ou limpe os filtros" : "Nenhum dado disponível"}
                </td></tr>
              ) : byType.slice(0, 5).map((row, idx) => (
                <tr key={row.type}
                  style={{ borderBottom: idx < Math.min(byType.length, 5) - 1 ? `1px solid ${T.low}` : "none", transition: "background 0.1s" }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = T.low)}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  {/* Categoria — a régua vertical repete o semáforo da barra.
                      Era T.accent/T.muted: 2,52:1 sobre branco no estado
                      "abaixo da meta", justamente o que precisa ser visto. */}
                  <td style={{ padding: "16px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 4, height: 22, backgroundColor: rateColor(row.rate), flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: T.text }}>{row.type}</span>
                    </div>
                  </td>
                  {/* Volume */}
                  <td style={{ padding: "16px 20px", fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700, color: T.second }}>
                    {row.total.toLocaleString("pt-BR")}
                  </td>
                  {/* Efficiency bar */}
                  <td style={{ padding: "16px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, height: 3, backgroundColor: T.low, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${row.rate}%`, backgroundColor: rateColor(row.rate) }} />
                      </div>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 700, color: T.second, minWidth: 32 }}>
                        {row.rate.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  {/* Badge */}
                  <td style={{ padding: "16px 20px" }}>
                    <EdBadge rate={row.rate} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        {/* Central Operacional — status board */}
        <div style={{ backgroundColor: T.surface, border: `1px solid ${T.bdark}`, padding: "24px 28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <h3 style={{ fontSize: FS.title, fontWeight: 700, color: T.text, margin: 0, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em", fontStyle: "italic" }}>
              Central Operacional
            </h3>
            {alerts.length > 0 && (
              <span style={{ padding: "3px 10px", backgroundColor: ACCENT_TEXT, color: "#fff", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", fontStyle: "italic" }}>
                {alerts.length} alerta{alerts.length > 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {alerts.length === 0 ? (
              /* Três causas, três respostas. "Tudo em ordem" com seta verde
                 era exibido também quando o filtro tinha esvaziado a tela e
                 quando não há peça nenhuma cadastrada — a mesma frase
                 tranquilizadora para "não há alerta" e para "não há dado". */
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 0", textAlign: "center" }}>
                {recorteVazio || baseVazia ? (
                  <SearchX aria-hidden="true" style={{ width: 24, height: 24, color: T.second, marginBottom: 10 }} />
                ) : (
                  <TrendingUp aria-hidden="true" style={{ width: 24, height: 24, color: "#15803d", marginBottom: 10 }} />
                )}
                <p style={{ fontSize: FS.body, fontWeight: 700, color: T.text, margin: "0 0 4px" }}>
                  {recorteVazio ? "Nenhuma peça neste recorte" : baseVazia ? "Sem peças cadastradas" : "Tudo em ordem"}
                </p>
                <p style={{ fontSize: 11, color: T.second, margin: 0, maxWidth: 280, lineHeight: 1.45 }}>
                  {recorteVazio
                    ? "Não dá para dizer se há alerta: ajuste ou limpe os filtros acima."
                    : baseVazia
                    ? "Nenhuma peça chegou ao sistema ainda."
                    : "Nenhum alerta operacional no momento"}
                </p>
              </div>
            ) : alerts.map((a, idx) => (
              /* O alerta navega ao evento, mas era um div sem foco: por
                 teclado a Central Operacional não levava a lugar nenhum.
                 role="link" só quando existe evento para onde ir (mesmo
                 padrão das linhas do histórico). */
              <div
                key={idx}
                data-testid={`alert-${idx}`}
                {...(a.eventId ? {
                  role: "link" as const,
                  tabIndex: 0,
                  "aria-label": `Abrir evento do alerta: ${a.title}`,
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLocation(`/eventos/${a.eventId}`); }
                  },
                } : {})}
                onClick={() => a.eventId && setLocation(`/eventos/${a.eventId}`)}
                style={{
                  padding: "14px 16px",
                  backgroundColor: T.low,
                  borderRight: `2px solid ${T.low}`,
                  cursor: a.eventId ? "pointer" : "default",
                  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                  transition: "border-color 0.15s, background 0.15s",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderRightColor = T.accent;
                  e.currentTarget.style.backgroundColor = "#fff";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderRightColor = T.low;
                  e.currentTarget.style.backgroundColor = T.low;
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 10, fontWeight: 900, color: ACCENT_TEXT, textTransform: "uppercase", letterSpacing: "0.14em", margin: "0 0 5px" }}>
                    {a.tag}
                  </p>
                  <h4 style={{ fontSize: FS.body, fontWeight: 700, color: T.text, textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.title}
                  </h4>
                  <p style={{ fontSize: 10, color: T.second, margin: 0, lineHeight: 1.4 }}>
                    {a.desc}
                  </p>
                </div>
                {a.eventId && (
                  /* T.second e não T.muted: o chevron é a ÚNICA pista de que a
                     linha navega, e o cinza decorativo dava 2,29:1 sobre o
                     fundo do alerta. */
                  <ChevronRight aria-hidden="true" style={{ width: 16, height: 16, color: T.second, flexShrink: 0, marginTop: 2 }} />
                )}
              </div>
            ))}
          </div>

          {/* Carimbo de escopo, no padrão da Gestão de Prazos: urgência e saída
              iminente olham TODOS os eventos, então filtrando o evento A podia
              aparecer um alerta do evento B sem nada explicando. */}
          {alerts.some(a => a.ignoraFiltros) && filtrosAtivos > 0 && (
            <p style={{ fontSize: 10, color: T.second, margin: "12px 0 0", lineHeight: 1.45 }}>
              Urgência e saída iminente consideram todos os eventos — não seguem os filtros acima.
            </p>
          )}

          {/* Top sponsors compact list */}
          {topSponsors.length > 0 && (
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${T.low}` }}>
              <p style={{ fontSize: 10, fontWeight: 900, color: T.second, textTransform: "uppercase", letterSpacing: "0.16em", margin: "0 0 14px" }}>
                Top Patrocinadores
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {topSponsors.slice(0, 3).map(s => (
                  <div key={s.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>{s.name}</span>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 700, color: ACCENT_TEXT, flexShrink: 0 }}>{s.qty.toLocaleString("pt-BR")}</span>
                    </div>
                    {/* ACCENT_TEXT: a barra é a comparação visual entre os três
                        patrocinadores — em T.accent media 2,54:1 sobre T.low. */}
                    <div style={{ height: 2, backgroundColor: T.low }}>
                      <div style={{ height: "100%", width: `${(s.qty / maxSponsorQty) * 100}%`, backgroundColor: ACCENT_TEXT }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
