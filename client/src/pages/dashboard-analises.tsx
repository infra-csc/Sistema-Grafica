import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { Calendar, Package, Truck, Zap, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { format, subDays, subMonths, isAfter, parseISO, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useLocation } from "wouter";

/* ── Palette ── */
const TI = {
  bg:      "#fafaf9",
  surface: "#ffffff",
  border:  "#e7e5e4",
  text:    "#1c1917",
  second:  "#78716c",
  muted:   "#a8a29e",
  accent:  "#f97316",
  low:     "#f3f4f3",
  high:    "#e8e8e7",
};

/* ── Status config ── */
const STATUS_CFG: Record<string, { label: string; color: string }> = {
  requested:              { label: "Solicitado",          color: "#a8a29e" },
  awaiting_linking:       { label: "Aguard. Vinculação",  color: "#f97316" },
  awaiting_submission:    { label: "Aguard. Envio",       color: "#fb923c" },
  awaiting_approval:      { label: "Aguard. Aprovação",   color: "#eab308" },
  awaiting_final_review:  { label: "Aguard. Finalização", color: "#f59e0b" },
  ready_for_production:   { label: "Pronto p/ Produção",  color: "#3b82f6" },
  approved:               { label: "Liberado",            color: "#60a5fa" },
  inProduction:           { label: "Em Produção",         color: "#9333ea" },
  produced:               { label: "Produzido",           color: "#06b6d4" },
  delivered:              { label: "Entregue",            color: "#16a34a" },
};

/* ── Period filter ── */
const PERIODS = [
  { label: "7 Dias",    value: "7d" },
  { label: "30 Dias",   value: "30d" },
  { label: "Trimestre", value: "90d" },
  { label: "Tudo",      value: "all" },
];

function cutoff(period: string): Date | null {
  if (period === "all") return null;
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  return subDays(new Date(), days);
}

/* ── Custom tooltip ── */
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      backgroundColor: TI.text, borderRadius: 8,
      padding: "6px 12px", fontSize: 12, color: "#fff",
    }}>
      {label && <div style={{ fontWeight: 700, marginBottom: 2 }}>{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i}>{p.value}</div>
      ))}
    </div>
  );
};

/* ── Trend badge ── */
function TrendBadge({ value, suffix = "%" }: { value: number; suffix?: string }) {
  const up = value >= 0;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 3,
      padding: "3px 8px", borderRadius: 6,
      backgroundColor: up ? "#f0fdf4" : "#fef2f2",
      fontSize: 10, fontWeight: 800, letterSpacing: "0.02em",
      color: up ? "#15803d" : "#b91c1c",
    }}>
      {up ? <TrendingUp style={{ width: 10, height: 10 }} /> : <TrendingDown style={{ width: 10, height: 10 }} />}
      {up ? "+" : ""}{value}{suffix}
    </div>
  );
}

/* ── Rate badge ── */
function RateBadge({ rate }: { rate: number }) {
  const color = rate >= 80 ? { bg: "#f0fdf4", text: "#15803d" }
    : rate >= 50 ? { bg: "#fefce8", text: "#a16207" }
    : { bg: "#fef2f2", text: "#b91c1c" };
  const label = rate >= 80 ? "Ótimo" : rate >= 50 ? "Regular" : "Baixo";
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 6,
      backgroundColor: color.bg, color: color.text,
      fontSize: 10, fontWeight: 800,
      textTransform: "uppercase", letterSpacing: "0.06em",
    }}>
      {label} {rate.toFixed(0)}%
    </span>
  );
}

/* ── Progress bar ── */
function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ width: "100%", height: 10, backgroundColor: TI.high, borderRadius: 100, overflow: "hidden" }}>
      <div style={{
        height: "100%", borderRadius: 100,
        width: `${Math.min(100, pct)}%`,
        backgroundColor: color,
        transition: "width 0.5s ease",
      }} />
    </div>
  );
}

/* ── Section card wrapper ── */
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      backgroundColor: TI.surface,
      borderRadius: 16, padding: 28,
      border: `1px solid ${TI.border}`,
      ...style,
    }}>
      {children}
    </div>
  );
}

/* ── Card header ── */
function CardHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: TI.text, margin: 0, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em" }}>
        {title}
      </h3>
      {right}
    </div>
  );
}

export default function DashboardAnalises() {
  const [, setLocation] = useLocation();
  const [period, setPeriod] = useState("all");

  const { data: events = [] } = useQuery<any[]>({ queryKey: ["/api/events"] });
  const { data: items  = [] } = useQuery<any[]>({ queryKey: ["/api/items"]  });

  const cut = cutoff(period);

  /* ── Filtered sets ── */
  const filteredEvents = useMemo(() =>
    cut ? events.filter(e => isAfter(new Date(e.createdAt), cut)) : events,
    [events, cut]);

  const filteredItems = useMemo(() =>
    cut ? items.filter(i => isAfter(new Date(i.createdAt), cut)) : items,
    [items, cut]);

  /* ── KPIs ── */
  const totalEvents   = filteredEvents.length;
  const totalItems    = filteredItems.reduce((s, i) => s + (i.quantity || 1), 0);
  const deliveredQty  = filteredItems.filter(i => i.status === "delivered").reduce((s, i) => s + (i.quantity || 1), 0);
  const inProdQty     = filteredItems.filter(i => ["inProduction", "produced"].includes(i.status)).reduce((s, i) => s + (i.quantity || 1), 0);
  const deliveryRate  = totalItems > 0 ? Math.round((deliveredQty / totalItems) * 100) : 0;

  /* ── Status distribution (for bars + donut) ── */
  const statusCounts = useMemo(() => {
    const map: Record<string, number> = {};
    filteredItems.forEach(i => {
      const key = i.status || "requested";
      map[key] = (map[key] || 0) + (i.quantity || 1);
    });
    return Object.entries(map)
      .map(([status, count]) => ({
        status, count,
        label: STATUS_CFG[status]?.label ?? status,
        color: STATUS_CFG[status]?.color ?? TI.muted,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredItems]);

  const maxCount = Math.max(...statusCounts.map(s => s.count), 1);

  /* ── Events by month (last 6 months) ── */
  const monthlyData = useMemo(() => {
    const months: { label: string; key: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      months.push({
        key: format(d, "yyyy-MM"),
        label: format(d, "MMM", { locale: ptBR }).toUpperCase(),
        count: 0,
      });
    }
    events.forEach(e => {
      const key = format(new Date(e.createdAt), "yyyy-MM");
      const m = months.find(m => m.key === key);
      if (m) m.count++;
    });
    return months;
  }, [events]);

  /* ── Top events by volume ── */
  const topEvents = useMemo(() => {
    const map: Record<string, { name: string; qty: number }> = {};
    filteredEvents.forEach(e => { map[e.id] = { name: e.name, qty: 0 }; });
    filteredItems.forEach(i => {
      if (map[i.eventId]) map[i.eventId].qty += (i.quantity || 1);
    });
    return Object.entries(map)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [filteredEvents, filteredItems]);

  const maxEventQty = Math.max(...topEvents.map(e => e.qty), 1);

  /* ── Items by type (footer table) ── */
  const byType = useMemo(() => {
    const map: Record<string, { total: number; inProd: number; delivered: number }> = {};
    filteredItems.forEach(i => {
      const t = i.type || "Sem tipo";
      if (!map[t]) map[t] = { total: 0, inProd: 0, delivered: 0 };
      map[t].total     += (i.quantity || 1);
      if (["inProduction", "produced"].includes(i.status)) map[t].inProd     += (i.quantity || 1);
      if (i.status === "delivered")                         map[t].delivered  += (i.quantity || 1);
    });
    return Object.entries(map)
      .map(([type, v]) => ({ type, ...v, rate: v.total > 0 ? (v.delivered / v.total) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [filteredItems]);

  /* ── Select style ── */
  const selStyle: React.CSSProperties = {
    backgroundColor: TI.high, border: "none", borderRadius: 8,
    padding: "8px 14px", fontSize: 12, fontWeight: 700,
    color: TI.text, cursor: "pointer", outline: "none",
    appearance: "none", WebkitAppearance: "none",
    letterSpacing: "0.02em",
  };

  const KPI_CARDS = [
    { label: "Total de Eventos", value: totalEvents, icon: Calendar, iconBg: "#fff7ed", iconColor: TI.accent, trend: 0, suffix: "" },
    { label: "Total de Peças",   value: totalItems,  icon: Package,  iconBg: "#eff6ff", iconColor: "#3b82f6", trend: 0, suffix: "" },
    { label: "Taxa de Entrega",  value: `${deliveryRate}%`, icon: Truck, iconBg: "#f0fdf4", iconColor: "#16a34a", trend: deliveryRate - 80, suffix: "pp" },
    { label: "Em Produção",      value: inProdQty,   icon: Zap,      iconBg: "#faf5ff", iconColor: "#9333ea", trend: 0, suffix: "" },
  ];

  return (
    <div style={{ backgroundColor: TI.bg, minHeight: "100%", padding: "28px 28px 56px" }}>

      {/* ── Page header ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 36, fontWeight: 700, color: TI.text, margin: 0, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.04em", lineHeight: 1.1 }}>
            Análises de Produção
          </h2>
          <p style={{ fontSize: 13, color: TI.second, margin: "6px 0 0", fontWeight: 500 }}>
            Visão geral de desempenho e métricas do sistema
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: TI.muted }}>Período</span>
          <select value={period} onChange={e => setPeriod(e.target.value)} data-testid="select-period" style={selStyle}>
            {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
        {KPI_CARDS.map(card => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              data-testid={`card-kpi-${card.label}`}
              style={{ backgroundColor: TI.surface, borderRadius: 16, padding: 24, border: `1px solid ${TI.border}` }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10,
                  backgroundColor: card.iconBg,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <Icon style={{ width: 22, height: 22, color: card.iconColor }} />
                </div>
                {typeof card.trend === "number" && card.suffix && <TrendBadge value={card.trend} suffix={card.suffix} />}
              </div>
              <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: TI.muted, margin: "0 0 4px" }}>
                {card.label}
              </p>
              <h3 style={{ fontSize: 34, fontWeight: 500, color: TI.text, margin: 0, fontFamily: "'DM Mono', monospace", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
                {typeof card.value === "number" ? card.value.toLocaleString("pt-BR") : card.value}
              </h3>
            </div>
          );
        })}
      </div>

      {/* ── Charts Row 1: Bars + Donut (3-col layout) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16 }}>

        {/* Peças por Status — horizontal progress bars */}
        <Card>
          <CardHeader title="Peças por Status" />
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {statusCounts.slice(0, 6).map(s => (
              <div key={s.status}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: TI.second }}>{s.label}</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 500, color: TI.accent }}>
                    {s.count.toLocaleString("pt-BR")}
                  </span>
                </div>
                <ProgressBar pct={(s.count / maxCount) * 100} color={s.color} />
              </div>
            ))}
            {statusCounts.length === 0 && (
              <p style={{ fontSize: 13, color: TI.muted, textAlign: "center", padding: "24px 0" }}>Nenhum dado disponível</p>
            )}
          </div>
        </Card>

        {/* Distribuição de Status — Donut */}
        <Card style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <CardHeader title="Distribuição" />
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={statusCounts.length ? statusCounts : [{ label: "Vazio", count: 1, color: TI.high }]}
                cx="50%" cy="50%"
                innerRadius={52} outerRadius={80}
                dataKey="count"
                strokeWidth={2}
                stroke={TI.surface}
              >
                {(statusCounts.length ? statusCounts : [{ color: TI.high }]).map((s, i) => (
                  <Cell key={i} fill={s.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div style={{ backgroundColor: TI.text, color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 12 }}>
                      <strong>{d.label}</strong>: {d.count}
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", marginTop: 16, width: "100%" }}>
            {statusCounts.slice(0, 6).map(s => (
              <div key={s.status} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: s.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: TI.second, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── Charts Row 2: Line + Ranking ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

        {/* Eventos por Mês — Area chart */}
        <Card>
          <CardHeader title="Eventos por Mês" />
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={monthlyData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={TI.accent} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={TI.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fontWeight: 700, fill: TI.muted, fontFamily: "'DM Mono', monospace" }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: TI.muted }}
                axisLine={false} tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone" dataKey="count"
                stroke={TI.accent} strokeWidth={2.5}
                fill="url(#areaGrad)"
                dot={{ fill: TI.surface, stroke: TI.accent, strokeWidth: 2, r: 4 }}
                activeDot={{ r: 5, fill: TI.accent }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Top Eventos por Volume — ranking list */}
        <Card>
          <CardHeader title="Top Eventos por Volume" />
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {topEvents.map((ev, idx) => (
              <div
                key={ev.id}
                data-testid={`ranking-event-${idx}`}
                onClick={() => setLocation(`/eventos/${ev.id}`)}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "12px 0",
                  borderBottom: idx < topEvents.length - 1 ? `1px solid #f0efee` : "none",
                  cursor: "pointer",
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = "0.75")}
                onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                  backgroundColor: "#fff7ed",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 900, color: TI.accent,
                }}>
                  {idx + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 6 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: TI.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
                      {ev.name}
                    </p>
                    <p style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", fontWeight: 500, color: TI.second, margin: 0, flexShrink: 0 }}>
                      {ev.qty.toLocaleString("pt-BR")} un.
                    </p>
                  </div>
                  <div style={{ width: "100%", height: 5, backgroundColor: TI.high, borderRadius: 100, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 100,
                      width: `${(ev.qty / maxEventQty) * 100}%`,
                      backgroundColor: TI.accent,
                    }} />
                  </div>
                </div>
              </div>
            ))}
            {topEvents.length === 0 && (
              <p style={{ fontSize: 13, color: TI.muted, textAlign: "center", padding: "24px 0" }}>Nenhum dado disponível</p>
            )}
          </div>
        </Card>
      </div>

      {/* ── Footer table: Peças por Tipo ── */}
      <div style={{ backgroundColor: TI.surface, borderRadius: 16, border: `1px solid ${TI.border}`, overflow: "hidden" }}>
        {/* Table header */}
        <div style={{ padding: "20px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: TI.text, margin: 0, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em" }}>
            Peças por Tipo de Material
          </h3>
          <button
            onClick={() => setLocation("/modelos")}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: TI.second, background: "none", border: "none", cursor: "pointer", padding: 0 }}
            onMouseEnter={e => (e.currentTarget.style.color = TI.accent)}
            onMouseLeave={e => (e.currentTarget.style.color = TI.second)}
          >
            Ver Modelos <ArrowRight style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {/* Column headers */}
        <div style={{
          display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
          padding: "12px 28px", backgroundColor: TI.low,
          borderTop: `1px solid ${TI.border}`, borderBottom: `1px solid ${TI.border}`,
        }}>
          {["Tipo", "Qty Total", "Em Produção", "Entregues", "Taxa"].map(h => (
            <div key={h} style={{ fontSize: 10, fontWeight: 900, color: TI.muted, textTransform: "uppercase", letterSpacing: "0.12em" }}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        <div>
          {byType.length === 0 ? (
            <div style={{ padding: "40px 28px", textAlign: "center", fontSize: 13, color: TI.muted }}>
              Nenhuma peça encontrada no período selecionado
            </div>
          ) : byType.map((row, idx) => (
            <div
              key={row.type}
              data-testid={`table-type-row-${idx}`}
              style={{
                display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
                padding: "16px 28px", alignItems: "center",
                borderBottom: idx < byType.length - 1 ? `1px solid #f0efee` : "none",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f9f9f8")}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: TI.text }}>{row.type}</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 500, color: TI.second }}>
                {row.total.toLocaleString("pt-BR")}
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 500, color: TI.second }}>
                {row.inProd.toLocaleString("pt-BR")}
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 500, color: TI.second }}>
                {row.delivered.toLocaleString("pt-BR")}
              </div>
              <div><RateBadge rate={row.rate} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
