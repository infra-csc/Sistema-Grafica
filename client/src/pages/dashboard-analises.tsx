import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FilterSelect } from "@/components/filter-select";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import {
  TrendingUp, ChevronRight, Download,
} from "lucide-react";
import { format, subDays, subMonths, isAfter, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useLocation } from "wouter";
import { getStatusLabel } from "@/lib/status";
import { useIsMobile } from "@/hooks/use-mobile";
// Tokens canônicos — a paleta local divergia do resto do app (border, low e
// bdark tinham valores próprios) e T.muted era usado como cor de TEXTO, o que
// reprova AA em todas as superfícies (ver lib/theme.ts).
import { T, FS, R, SHADOW } from "@/lib/theme";

/* Laranja para TEXTO (orange-700): o T.accent saturado fica em ~2.8:1 sobre
   branco — vale para barras e bordas, nunca para rótulo legível. */
const ACCENT_TEXT = "#c2410c";

/* ── Period helpers ── */
const PERIODS = [
  { label: "Últimos 7 Dias",    value: "7d"  },
  { label: "Últimos 30 Dias",   value: "30d" },
  { label: "Último Trimestre",  value: "90d" },
  { label: "Todo o período",    value: "all" },
];
function cutoff(p: string): Date | null {
  if (p === "all") return null;
  return subDays(new Date(), p === "7d" ? 7 : p === "30d" ? 30 : 90);
}

/* ── Workflow groups for donut ──
   "conferred" entra no grupo Produção: peça conferida ainda está no fluxo da
   Gráfica — antes ela simplesmente sumia do donut e as fatias não fechavam. */
const WF_GROUPS: { label: string; keys: string[]; color: string }[] = [
  { label: "Produção",     keys: ["inProduction", "produced", "conferred"],         color: T.accent },
  { label: "Aprovação",    keys: ["awaiting_approval", "awaiting_sponsor_approval", "sponsor_approved", "awaiting_finalization", "awaiting_creator_review", "awaiting_final_review", "ready_for_production", "pronto_para_producao", "approved"], color: "#ffffff" },
  { label: "Planejamento", keys: ["requested", "awaiting_linking", "awaiting_submission"], color: "#3b82f6" },
  { label: "Entregue",     keys: ["delivered"],                                     color: "#a8a29e" },
];

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
          <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: T.accent, flexShrink: 0 }} />
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

export default function DashboardAnalises() {
  const isMobile = useIsMobile();
  const [, setLocation] = useLocation();
  const [period, setPeriod]       = useState("all");
  const [eventFilter, setEventFilter]   = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sponsorFilter, setSponsorFilter] = useState("all");

  const { data: events   = [], isLoading: evLoading, isError: evError, refetch: refetchEvents } = useQuery<any[]>({ queryKey: ["/api/events"]   });
  const { data: items    = [], isLoading: itLoading, isError: itError, refetch: refetchItems } = useQuery<any[]>({ queryKey: ["/api/items"]    });
  const { data: sponsors = [], isError: spError, refetch: refetchSponsors } = useQuery<any[]>({ queryKey: ["/api/sponsors"] });
  const isLoading = evLoading || itLoading;
  // Qualquer uma das 3 fontes falhando distorce os números em silêncio
  // (ex.: sem /api/sponsors o "Top Patrocinadores" viraria "sem dados") —
  // melhor avisar e oferecer nova tentativa do que exibir análises erradas.
  const isError = evError || itError || spError;
  const retryAll = () => { refetchEvents(); refetchItems(); refetchSponsors(); };

  const cut = cutoff(period);

  const fEvents = useMemo(() =>
    cut ? events.filter(e => isAfter(new Date(e.createdAt), cut)) : events,
    [events, cut]);

  const fItems = useMemo(() => {
    let base = cut ? items.filter(i => isAfter(new Date(i.createdAt), cut)) : items;
    if (eventFilter  !== "all") base = base.filter(i => i.eventId === eventFilter);
    if (statusFilter !== "all") base = base.filter(i => i.status  === statusFilter);
    if (sponsorFilter !== "all") base = base.filter(i => (i.sponsorIds || []).includes(sponsorFilter));
    return base;
  }, [items, cut, eventFilter, statusFilter, sponsorFilter]);

  /* ── KPIs ── */
  const totalEvents  = fEvents.length;
  const totalQty     = fItems.reduce((s, i) => s + (i.quantity || 1), 0);
  const deliveredQty = fItems.filter(i => i.status === "delivered").reduce((s, i) => s + (i.quantity || 1), 0);
  const inProdQty    = fItems.filter(i => ["inProduction", "produced"].includes(i.status)).reduce((s, i) => s + (i.quantity || 1), 0);
  const deliveryRate = totalQty > 0 ? (deliveredQty / totalQty) * 100 : 0;
  const approvalRate = totalQty > 0 ? ((fItems.filter(i => ["approved", "inProduction", "produced", "delivered"].includes(i.status)).reduce((s,i)=>s+(i.quantity||1),0)) / totalQty) * 100 : 0;

  /* ── Monthly data for dual area ── */
  const monthKeys = useMemo(() =>
    Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), 5 - i), "yyyy-MM")),
    []);

  // fItems (não items): o gráfico ignorava TODOS os filtros da tela — os KPIs
  // mudavam com o recorte e a curva continuava a mesma; o CSV exportava a
  // divergência junto. Agora o gráfico (e o CSV, que herda daqui) respeita o
  // mesmo recorte do resto da tela.
  const monthlyData = useMemo(() =>
    monthKeys.map(k => {
      const label = format(new Date(k + "-01"), "MMM", { locale: ptBR }).toUpperCase();
      const producao = fItems.filter(i => format(new Date(i.createdAt), "yyyy-MM") === k)
        .reduce((s, i) => s + (i.quantity || 1), 0);
      const entregas = fItems.filter(i => i.status === "delivered" &&
        format(new Date(i.deliveredAt || i.updatedAt), "yyyy-MM") === k)
        .reduce((s, i) => s + (i.quantity || 1), 0);
      return { label, producao, entregas };
    }), [fItems, monthKeys]);

  /* ── Donut data ──
     Grupo "Outros" por diferença: status fora dos grupos (rascunho, cancelado,
     legacy novos…) simplesmente sumiam e as fatias não somavam 100%. */
  const donutData = useMemo(() => {
    const total = fItems.reduce((s, i) => s + (i.quantity || 1), 0);
    if (total === 0) return [];
    const groups = WF_GROUPS.map(g => {
      const qty = fItems.filter(i => g.keys.includes(i.status)).reduce((s, i) => s + (i.quantity || 1), 0);
      return { label: g.label, color: g.color, qty, pct: Math.round((qty / total) * 100) };
    });
    const covered = groups.reduce((s, g) => s + g.qty, 0);
    if (total - covered > 0) {
      groups.push({
        label: "Outros",
        color: "#57534e",
        qty: total - covered,
        // pct por diferença: os arredondamentos dos grupos fecham em 100%.
        pct: Math.max(0, 100 - groups.reduce((s, g) => s + g.pct, 0)),
      });
    }
    return groups.filter(g => g.qty > 0);
  }, [fItems]);

  /* ── Top sponsors ── */
  const topSponsors = useMemo(() => {
    const map: Record<string, { name: string; qty: number }> = {};
    sponsors.forEach(s => { map[s.id] = { name: s.name, qty: 0 }; });
    fItems.forEach(i => (i.sponsorIds || []).forEach((sid: string) => {
      if (map[sid]) map[sid].qty += (i.quantity || 1);
    }));
    return Object.values(map).filter(s => s.qty > 0).sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [sponsors, fItems]);
  const maxSponsorQty = useMemo(
    () => Math.max(...topSponsors.map(s => s.qty), 1),
    [topSponsors],
  );

  /* ── By type ── */
  const byType = useMemo(() => {
    const map: Record<string, { total: number; delivered: number }> = {};
    fItems.forEach(i => {
      const t = i.type || "Sem tipo";
      if (!map[t]) map[t] = { total: 0, delivered: 0 };
      map[t].total += (i.quantity || 1);
      if (i.status === "delivered") map[t].delivered += (i.quantity || 1);
    });
    return Object.entries(map)
      .map(([type, v]) => ({ type, ...v, rate: v.total > 0 ? (v.delivered / v.total) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [fItems]);

  /* ── Alerts ──
     fEvents (não events): os alertas de evento ignoravam o período filtrado
     enquanto os de peça o respeitavam — a mesma lista misturava dois recortes. */
  const alerts = useMemo(() => {
    const list: { tag: string; title: string; desc: string; eventId?: string }[] = [];
    fEvents.filter(e => e.status === "urgent").slice(0, 1).forEach(e => {
      list.push({ tag: "URGENTE", title: `Evento Urgente: ${e.name}`, desc: "Verificar todos os itens pendentes.", eventId: e.id });
    });
    const stale = fItems.filter(i =>
      ["awaiting_approval", "awaiting_final_review"].includes(i.status) &&
      differenceInHours(new Date(), new Date(i.updatedAt)) > 24);
    if (stale.length > 0)
      list.push({ tag: "APROVAÇÃO PENDENTE", title: `${stale.length} peça${stale.length > 1 ? "s" : ""} sem aprovação`, desc: "Paradas há mais de 24h. Notificar responsáveis.", eventId: stale[0].eventId });
    const ready = fItems.filter(i => i.status === "ready_for_production");
    if (ready.length > 0)
      list.push({ tag: "PRODUÇÃO", title: `${ready.length} peça${ready.length > 1 ? "s" : ""} aguardando gráfica`, desc: "Liberadas pela Arte, ainda não iniciadas na produção.", eventId: ready[0].eventId });
    const nearDep = fEvents.filter(e => {
      if (!e.truckDepartureDate) return false;
      const hrs = differenceInHours(new Date(e.truckDepartureDate), new Date());
      return hrs > 0 && hrs < 72;
    });
    nearDep.slice(0, 1).forEach(e => {
      const hrs = differenceInHours(new Date(e.truckDepartureDate), new Date());
      list.push({ tag: "SAÍDA IMINENTE", title: `${e.name} — saída em ${hrs}h`, desc: "Confirmar que todos os itens estão prontos para envio.", eventId: e.id });
    });
    return list.slice(0, 4);
  }, [fEvents, fItems]);

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
      return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const linha = (cols: unknown[]) => cols.map(esc).join(";");
    const periodoLabel = PERIODS.find(p => p.value === period)?.label ?? period;

    const blocos: string[] = [];
    blocos.push(linha(["Análises & Performance"]));
    blocos.push(linha(["Gerado em", format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })]));
    blocos.push(linha(["Período", periodoLabel]));
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
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  /* ── KPI card data ──
     pct: null = sem barra. "Total de Peças" tinha uma barra sempre em 100% e
     "Eventos" uma em totalEvents*10 — decoração que parecia dado. O bloco de
     delta também saiu: era sempre string vazia desde que nasceu. */
  const KPI: { label: string; value: string; pct: number | null; accent: boolean }[] = [
    { label: "Total de Peças",   value: totalQty.toLocaleString("pt-BR"), pct: null, accent: true  },
    { label: "Taxa de Entrega",  value: `${deliveryRate.toFixed(1)}%`,    pct: deliveryRate, accent: false },
    // "SLA de Aprovação" prometia um SLA que ninguém mede aqui; o número é a
    // fatia de peças que já passou da aprovação (aprovadas ou etapas além).
    { label: "Peças Aprovadas ou Além", value: `${approvalRate.toFixed(1)}%`, pct: approvalRate, accent: true  },
    { label: "Em Produção",      value: inProdQty.toLocaleString("pt-BR"), pct: totalQty > 0 ? (inProdQty / totalQty) * 100 : 0, accent: false },
    // "Eventos Ativos" mentia: conta eventos CRIADOS no período, ativos ou não.
    { label: "Eventos Criados no Período", value: totalEvents.toLocaleString("pt-BR"), pct: null, accent: true  },
  ];

  if (isError) {
    return (
      <div style={{ backgroundColor: T.bg, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div role="alert" style={{ backgroundColor: T.surface, border: "1px solid #fecaca", borderRadius: R.lg, padding: "56px 32px", textAlign: "center", maxWidth: 480 }}>
          <h3 style={{ color: "#b91c1c", fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Não foi possível carregar as análises</h3>
          <p style={{ color: T.second, fontSize: FS.body, marginBottom: 20 }}>Verifique sua conexão e tente novamente.</p>
          <button onClick={retryAll} data-testid="button-retry-analises"
            style={{ fontSize: FS.body, fontWeight: 700, color: "#fff", background: T.dark, border: "none", borderRadius: R.md, padding: "9px 20px", cursor: "pointer" }}>
            Tentar novamente
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <h2 style={{ fontSize: FS.title, fontWeight: 700, color: T.text, margin: 0, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em", fontStyle: "italic" }}>
          Análises &amp; Performance
        </h2>
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

      {/* ── Global filters — card branco Titanium ── */}
      {(() => {
        const hasActive = period !== "all" || eventFilter !== "all" || statusFilter !== "all" || sponsorFilter !== "all";
        const activeCount = [period !== "all", eventFilter !== "all", statusFilter !== "all", sponsorFilter !== "all"].filter(Boolean).length;

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

            <EventFilterDropdown
              value={eventFilter}
              onChange={setEventFilter}
              options={(events as any[]).map(e => ({ value: e.id, label: e.name }))}
              allLabel={`Todos os eventos (${(events as any[]).length})`}
            />

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
              <div style={{ height: 3, width: "100%", backgroundColor: "#f0efee", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(100, card.pct)}%`, backgroundColor: card.accent ? T.accent : T.dark, transition: "width 0.5s" }} />
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
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, backgroundColor: T.accent }} />
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
                    <stop offset="0%" stopColor={T.accent} stopOpacity={0.12} />
                    <stop offset="100%" stopColor={T.accent} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gDel" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={T.dark} stopOpacity={0.10} />
                    <stop offset="100%" stopColor={T.dark} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 10, fontWeight: 900, fill: T.second, fontFamily: "'DM Mono'", letterSpacing: "0.06em" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: T.second }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTip />} />
                <Area type="monotone" dataKey="producao" name="Produção" stroke={T.accent} strokeWidth={3} fill="url(#gProd)" dot={false} />
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
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData.length ? donutData : [{ label: "Vazio", qty: 1, color: "#292524", pct: 100 }]}
                    cx="50%" cy="50%" innerRadius={60} outerRadius={86}
                    dataKey="qty" strokeWidth={3} stroke={T.dark}
                  >
                    {(donutData.length ? donutData : [{ color: "#292524" }]).map((d, i) => <Cell key={i} fill={d.color} />)}
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
                <div key={d.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #292524", paddingBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: d.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#a8a29e", textTransform: "uppercase", letterSpacing: "0.1em" }}>{d.label}</span>
                  </div>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700, color: "#fff" }}>{d.pct}%</span>
                </div>
              ))}
              {donutData.length === 0 && (
                <p style={{ fontSize: 11, color: "#a8a29e", textAlign: "center" }}>Sem dados</p>
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
            <span style={{ fontSize: 10, fontWeight: 900, color: T.second, textTransform: "uppercase", letterSpacing: "0.14em" }}>Dados em tempo real</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: T.low }}>
                {["Categoria", "Volume", "Eficiência", "Status"].map(h => (
                  <th key={h} style={{ padding: "12px 20px", fontSize: 10, fontWeight: 900, color: T.second, textTransform: "uppercase", letterSpacing: "0.16em", textAlign: "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byType.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: "32px 20px", textAlign: "center", fontSize: FS.body, color: T.second }}>Nenhum dado disponível</td></tr>
              ) : byType.slice(0, 5).map((row, idx) => (
                <tr key={row.type}
                  style={{ borderBottom: idx < Math.min(byType.length, 5) - 1 ? `1px solid ${T.low}` : "none", transition: "background 0.1s" }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = T.low)}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  {/* Category — accent bar */}
                  <td style={{ padding: "16px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 4, height: 22, backgroundColor: row.rate >= 80 ? T.accent : T.muted, flexShrink: 0 }} />
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
                        <div style={{ height: "100%", width: `${row.rate}%`, backgroundColor: row.rate >= 80 ? T.accent : row.rate >= 60 ? "#eab308" : "#ef4444" }} />
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
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 0" }}>
                <TrendingUp style={{ width: 24, height: 24, color: "#16a34a", marginBottom: 10 }} />
                <p style={{ fontSize: FS.body, fontWeight: 700, color: T.text, margin: "0 0 4px" }}>Tudo em ordem</p>
                <p style={{ fontSize: 11, color: T.second, margin: 0 }}>Nenhum alerta operacional no momento</p>
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
                  <ChevronRight style={{ width: 16, height: 16, color: T.muted, flexShrink: 0, marginTop: 2 }} />
                )}
              </div>
            ))}
          </div>

          {/* Top sponsors compact list */}
          {topSponsors.length > 0 && (
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${T.low}` }}>
              <p style={{ fontSize: 10, fontWeight: 900, color: T.second, textTransform: "uppercase", letterSpacing: "0.16em", margin: "0 0 14px" }}>
                Top Patrocinadores
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {topSponsors.slice(0, 3).map(s => (
                  <div key={s.name}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>{s.name}</span>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 700, color: ACCENT_TEXT, flexShrink: 0 }}>{s.qty.toLocaleString("pt-BR")}</span>
                    </div>
                    <div style={{ height: 2, backgroundColor: T.low }}>
                      <div style={{ height: "100%", width: `${(s.qty / maxSponsorQty) * 100}%`, backgroundColor: T.accent }} />
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
