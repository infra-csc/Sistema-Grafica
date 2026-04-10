import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import {
  AlertTriangle, Clock, TrendingUp, ChevronRight, Download, Share2,
} from "lucide-react";
import { format, subDays, subMonths, isAfter, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useLocation } from "wouter";

/* ── Palette ── */
const T = {
  bg:      "#fafaf9",
  surface: "#ffffff",
  border:  "#f0efee",
  bdark:   "#e5e5e5",
  text:    "#1c1917",
  second:  "#78716c",
  muted:   "#a8a29e",
  accent:  "#f97316",
  low:     "#f5f5f4",
  dark:    "#1c1917",
};

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

/* ── Workflow groups for donut ── */
const WF_GROUPS = [
  { label: "Produção",     keys: ["inProduction", "produced"],                      color: T.accent },
  { label: "Aprovação",    keys: ["awaiting_approval", "awaiting_final_review", "ready_for_production", "approved"], color: "#ffffff" },
  { label: "Planejamento", keys: ["requested", "awaiting_linking", "awaiting_submission"], color: "#3b82f6" },
  { label: "Entregue",     keys: ["delivered"],                                     color: "#6b7280" },
];

/* ── Tabs ── */
const TABS = ["Visão Geral", "Produção", "Logística", "Patrocinadores", "Financeiro"];

/* ── Select style — editorial border-bottom only ── */
const selStyle: React.CSSProperties = {
  width: "100%", padding: "10px 0 10px 0",
  backgroundColor: "transparent",
  border: "none", borderBottom: `2px solid ${T.bdark}`,
  borderRadius: 0,
  fontSize: 12, fontWeight: 700, color: T.text,
  cursor: "pointer", outline: "none",
  appearance: "none", WebkitAppearance: "none",
  transition: "border-color 0.15s",
};

/* ── Badge editorial (status table) ── */
function EdBadge({ rate }: { rate: number }) {
  const cfg = rate >= 80
    ? { bg: T.dark,   color: "#fff",    label: "Ótimo"    }
    : rate >= 60
    ? { bg: "#f5f5f4", color: "#78716c", label: "Regular"  }
    : { bg: T.accent, color: "#fff",    label: "Crítico"  };
  return (
    <span style={{
      padding: "3px 8px", fontSize: 9, fontWeight: 900,
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
    <div style={{ backgroundColor: T.dark, color: "#fff", borderRadius: 4, padding: "8px 12px", fontSize: 11 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color === T.dark ? "#ccc" : p.color }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
};

export default function DashboardAnalises() {
  const [, setLocation] = useLocation();
  const [period, setPeriod]     = useState("all");
  const [activeTab, setActiveTab] = useState(0);
  const [eventFilter, setEventFilter] = useState("all");

  const { data: events   = [] } = useQuery<any[]>({ queryKey: ["/api/events"]   });
  const { data: items    = [] } = useQuery<any[]>({ queryKey: ["/api/items"]    });
  const { data: sponsors = [] } = useQuery<any[]>({ queryKey: ["/api/sponsors"] });

  const cut = cutoff(period);

  const fEvents = useMemo(() =>
    cut ? events.filter(e => isAfter(new Date(e.createdAt), cut)) : events,
    [events, cut]);

  const fItems = useMemo(() => {
    let base = cut ? items.filter(i => isAfter(new Date(i.createdAt), cut)) : items;
    if (eventFilter !== "all") base = base.filter(i => i.eventId === eventFilter);
    return base;
  }, [items, cut, eventFilter]);

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

  const monthlyData = useMemo(() =>
    monthKeys.map(k => {
      const label = format(new Date(k + "-01"), "MMM", { locale: ptBR }).toUpperCase();
      const producao = items.filter(i => format(new Date(i.createdAt), "yyyy-MM") === k)
        .reduce((s, i) => s + (i.quantity || 1), 0);
      const entregas = items.filter(i => i.status === "delivered" &&
        format(new Date(i.deliveredAt || i.updatedAt), "yyyy-MM") === k)
        .reduce((s, i) => s + (i.quantity || 1), 0);
      return { label, producao, entregas };
    }), [items, monthKeys]);

  /* ── Donut data ── */
  const donutData = useMemo(() => {
    const total = fItems.reduce((s, i) => s + (i.quantity || 1), 0) || 1;
    return WF_GROUPS.map(g => {
      const qty = fItems.filter(i => g.keys.includes(i.status)).reduce((s, i) => s + (i.quantity || 1), 0);
      return { ...g, qty, pct: Math.round((qty / total) * 100) };
    }).filter(g => g.qty > 0);
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
  const maxSponsorQty = Math.max(...topSponsors.map(s => s.qty), 1);

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

  /* ── Alerts ── */
  const alerts = useMemo(() => {
    const list: { tag: string; title: string; desc: string; eventId?: string }[] = [];
    events.filter(e => e.status === "urgent").slice(0, 1).forEach(e => {
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
    const nearDep = events.filter(e => {
      if (!e.truckDepartureDate) return false;
      const hrs = differenceInHours(new Date(e.truckDepartureDate), new Date());
      return hrs > 0 && hrs < 72;
    });
    nearDep.slice(0, 1).forEach(e => {
      const hrs = differenceInHours(new Date(e.truckDepartureDate), new Date());
      list.push({ tag: "SAÍDA IMINENTE", title: `${e.name} — saída em ${hrs}h`, desc: "Confirmar que todos os itens estão prontos para envio.", eventId: e.id });
    });
    return list.slice(0, 4);
  }, [events, fItems]);

  /* ── KPI card data ── */
  const KPI = [
    { label: "Total de Peças",   value: totalQty.toLocaleString("pt-BR"),          delta: "",         pct: Math.min(100, (totalQty / Math.max(totalQty, 1)) * 100), accent: true  },
    { label: "Taxa de Entrega",  value: `${deliveryRate.toFixed(1)}%`,              delta: "",         pct: deliveryRate, accent: false },
    { label: "SLA de Aprovação", value: `${approvalRate.toFixed(1)}%`,             delta: "",         pct: approvalRate, accent: true  },
    { label: "Em Produção",      value: inProdQty.toLocaleString("pt-BR"),         delta: "",         pct: totalQty > 0 ? (inProdQty / totalQty) * 100 : 0, accent: false },
    { label: "Eventos Ativos",   value: totalEvents.toLocaleString("pt-BR"),       delta: "",         pct: Math.min(100, totalEvents * 10), accent: true  },
  ];

  return (
    <div style={{ backgroundColor: T.bg, minHeight: "100%", padding: "28px 32px 64px" }}>

      {/* ── Tab navigation — underline style ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", borderBottom: `1px solid ${T.bdark}`, marginBottom: 28 }}>
        <div style={{ display: "flex", gap: 36 }}>
          {TABS.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              data-testid={`tab-${i}`}
              style={{
                paddingBottom: 14,
                background: "none", border: "none", cursor: "pointer",
                fontSize: 10, fontWeight: 900,
                textTransform: "uppercase", letterSpacing: "0.16em",
                color: activeTab === i ? T.text : T.muted,
                borderBottom: `2px solid ${activeTab === i ? T.accent : "transparent"}`,
                marginBottom: -1,
                transition: "all 0.15s",
              }}
            >
              {tab}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, paddingBottom: 14 }}>
          <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: T.surface, border: `1px solid ${T.bdark}`, cursor: "pointer", fontSize: 9, fontWeight: 900, color: T.second, textTransform: "uppercase", letterSpacing: "0.12em" }}>
            <Download style={{ width: 13, height: 13 }} /> Exportar
          </button>
          <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: T.surface, border: `1px solid ${T.bdark}`, cursor: "pointer", fontSize: 9, fontWeight: 900, color: T.second, textTransform: "uppercase", letterSpacing: "0.12em" }}>
            <Share2 style={{ width: 13, height: 13 }} /> Partilhar
          </button>
        </div>
      </div>

      {/* ── Global filters — editorial border-bottom only ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 24, marginBottom: 36 }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 900, color: T.muted, textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 8 }}>Período</div>
          <select value={period} onChange={e => setPeriod(e.target.value)} data-testid="select-period" style={selStyle}>
            {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 900, color: T.muted, textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 8 }}>Eventos</div>
          <select value={eventFilter} onChange={e => setEventFilter(e.target.value)} data-testid="select-event" style={selStyle}>
            <option value="all">Todos os Eventos ({events.length})</option>
            {events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 900, color: T.muted, textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 8 }}>Tipo de Material</div>
          <select style={selStyle}>
            <option>Toda a Produção</option>
            {[...new Set(items.map(i => i.type).filter(Boolean))].map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
          <button style={{ backgroundColor: T.accent, color: "#fff", border: "none", padding: "10px 20px", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.18em", cursor: "pointer" }}>
            Atualizar
          </button>
        </div>
      </div>

      {/* ── KPI cards — border-l-4 editorial ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 24 }}>
        {KPI.map((card, i) => (
          <div key={card.label} style={{
            backgroundColor: T.surface,
            borderLeft: `4px solid ${card.accent ? T.accent : T.dark}`,
            padding: "22px 20px 18px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            transition: "transform 0.25s",
          }}
            onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-3px)")}
            onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}
          >
            <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.18em", color: T.muted, margin: "0 0 14px" }}>
              {card.label}
            </p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 14 }}>
              <h3 style={{ fontSize: 28, fontWeight: 700, color: T.text, margin: 0, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em", lineHeight: 1 }}>
                {card.value}
              </h3>
              {card.delta && (
                <span style={{ fontSize: 10, fontWeight: 700, color: card.delta.startsWith("+") ? "#16a34a" : "#dc2626", fontFamily: "'DM Mono', monospace" }}>
                  {card.delta}
                </span>
              )}
            </div>
            {/* h-1 progress bar */}
            <div style={{ height: 3, width: "100%", backgroundColor: "#f0efee", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(100, card.pct)}%`, backgroundColor: card.accent ? T.accent : T.dark, transition: "width 0.5s" }} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Row 1: Area chart + Dark donut ── */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16 }}>

        {/* Velocidade de Produção vs Entregas */}
        <div style={{ backgroundColor: T.surface, border: `1px solid ${T.bdark}`, padding: "32px 28px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
            <div>
              <h3 style={{ fontSize: 19, fontWeight: 700, color: T.text, margin: "0 0 4px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em", fontStyle: "italic" }}>
                Velocidade de Produção vs. Entregas
              </h3>
              <p style={{ fontSize: 9, color: T.muted, margin: 0, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
                Fluxo de materiais consolidado por mês
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, backgroundColor: T.accent }} />
                <span style={{ fontSize: 9, fontWeight: 900, color: T.text, textTransform: "uppercase", letterSpacing: "0.12em" }}>Produção</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, backgroundColor: T.dark }} />
                <span style={{ fontSize: 9, fontWeight: 900, color: T.text, textTransform: "uppercase", letterSpacing: "0.12em" }}>Entregas</span>
              </div>
            </div>
          </div>
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
              <XAxis dataKey="label" tick={{ fontSize: 9, fontWeight: 900, fill: T.muted, fontFamily: "'DM Mono'", letterSpacing: "0.06em" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: T.muted }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="producao" name="Produção" stroke={T.accent} strokeWidth={3} fill="url(#gProd)" dot={false} />
              <Area type="monotone" dataKey="entregas"  name="Entregas"  stroke={T.dark}   strokeWidth={2.5} fill="url(#gDel)"  dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Dark donut card */}
        <div style={{ backgroundColor: T.dark, padding: "32px 28px", display: "flex", flexDirection: "column" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#ffffff", margin: "0 0 28px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em", fontStyle: "italic" }}>
            Status do Inventário
          </h3>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "relative", width: 192, height: 192 }}>
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
                <span style={{ fontSize: 28, fontWeight: 700, color: "#fff", fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1 }}>
                  {totalQty.toLocaleString("pt-BR")}
                </span>
                <span style={{ fontSize: 8, fontWeight: 900, color: "#78716c", textTransform: "uppercase", letterSpacing: "0.18em", marginTop: 5 }}>
                  Total Peças
                </span>
              </div>
            </div>

            {/* Legend — dark style */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 24, width: "100%", maxWidth: 200 }}>
              {donutData.map(d => (
                <div key={d.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #292524", paddingBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: d.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#a8a29e", textTransform: "uppercase", letterSpacing: "0.1em" }}>{d.label}</span>
                  </div>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700, color: "#fff" }}>{d.pct}%</span>
                </div>
              ))}
              {donutData.length === 0 && (
                <p style={{ fontSize: 11, color: "#57534e", textAlign: "center" }}>Sem dados</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 2: Efficiency table + Status board ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Eficiência por Categoria */}
        <div style={{ backgroundColor: T.surface, border: `1px solid ${T.bdark}`, overflow: "hidden" }}>
          <div style={{ padding: "20px 28px", borderBottom: `1px solid ${T.low}`, backgroundColor: "rgba(245,245,244,0.5)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: T.text, margin: 0, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em", fontStyle: "italic" }}>
              Eficiência por Categoria
            </h3>
            <span style={{ fontSize: 9, fontWeight: 900, color: T.muted, textTransform: "uppercase", letterSpacing: "0.14em" }}>Dados em tempo real</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: T.low }}>
                {["Categoria", "Volume", "Eficiência", "Status"].map(h => (
                  <th key={h} style={{ padding: "12px 20px", fontSize: 9, fontWeight: 900, color: T.muted, textTransform: "uppercase", letterSpacing: "0.16em", textAlign: "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byType.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: "32px 20px", textAlign: "center", fontSize: 12, color: T.muted }}>Nenhum dado disponível</td></tr>
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
            <h3 style={{ fontSize: 17, fontWeight: 700, color: T.text, margin: 0, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em", fontStyle: "italic" }}>
              Central Operacional
            </h3>
            {alerts.length > 0 && (
              <span style={{ padding: "3px 10px", backgroundColor: T.accent, color: "#fff", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", fontStyle: "italic" }}>
                {alerts.length} alerta{alerts.length > 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {alerts.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 0" }}>
                <TrendingUp style={{ width: 24, height: 24, color: "#16a34a", marginBottom: 10 }} />
                <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: "0 0 4px" }}>Tudo em ordem</p>
                <p style={{ fontSize: 11, color: T.muted, margin: 0 }}>Nenhum alerta operacional no momento</p>
              </div>
            ) : alerts.map((a, idx) => (
              <div
                key={idx}
                data-testid={`alert-${idx}`}
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
                  <p style={{ fontSize: 9, fontWeight: 900, color: T.accent, textTransform: "uppercase", letterSpacing: "0.14em", margin: "0 0 5px" }}>
                    {a.tag}
                  </p>
                  <h4 style={{ fontSize: 12, fontWeight: 700, color: T.text, textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
              <p style={{ fontSize: 9, fontWeight: 900, color: T.muted, textTransform: "uppercase", letterSpacing: "0.16em", margin: "0 0 14px" }}>
                Top Patrocinadores
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {topSponsors.slice(0, 3).map(s => (
                  <div key={s.name}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>{s.name}</span>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 700, color: T.accent, flexShrink: 0 }}>{s.qty.toLocaleString("pt-BR")}</span>
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
