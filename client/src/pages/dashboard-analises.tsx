import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import {
  Calendar, Package, Truck, Zap, Users, Clock,
  TrendingUp, TrendingDown, AlertTriangle, ChevronRight,
  Download, Share2,
} from "lucide-react";
import { format, subDays, subMonths, isAfter, differenceInHours } from "date-fns";
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
  requested:             { label: "Solicitado",         color: "#a8a29e" },
  awaiting_linking:      { label: "Aguard. Vinculação", color: "#f97316" },
  awaiting_submission:   { label: "Aguard. Envio",      color: "#fb923c" },
  awaiting_approval:     { label: "Aguard. Aprovação",  color: "#eab308" },
  awaiting_final_review: { label: "Aguard. Finalização",color: "#f59e0b" },
  ready_for_production:  { label: "Pronto p/ Prod.",    color: "#3b82f6" },
  approved:              { label: "Liberado",           color: "#60a5fa" },
  inProduction:          { label: "Em Produção",        color: "#9333ea" },
  produced:              { label: "Produzido",          color: "#06b6d4" },
  delivered:             { label: "Entregue",           color: "#16a34a" },
};

/* ── Workflow groups for donut ── */
const WF_GROUPS = [
  { label: "Produção",     keys: ["inProduction", "produced"],                      color: "#f97316" },
  { label: "Aprovação",    keys: ["awaiting_approval", "awaiting_final_review", "ready_for_production", "approved"], color: "#006398" },
  { label: "Planejamento", keys: ["requested", "awaiting_linking", "awaiting_submission"], color: "#625d5b" },
  { label: "Entregue",     keys: ["delivered"],                                     color: "#16a34a" },
];

/* ── Period helpers ── */
const PERIODS = [
  { label: "7 Dias",    value: "7d" },
  { label: "30 Dias",   value: "30d" },
  { label: "Trimestre", value: "90d" },
  { label: "Tudo",      value: "all" },
];
function cutoff(period: string): Date | null {
  if (period === "all") return null;
  return subDays(new Date(), period === "7d" ? 7 : period === "30d" ? 30 : 90);
}

/* ── Sparkline SVG ── */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const W = 48, H = 16;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1 || 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Rate badge ── */
function RateBadge({ rate, labels }: { rate: number; labels?: [string, string, string] }) {
  const [l1, l2, l3] = labels ?? ["Ótimo", "Regular", "Baixo"];
  const cfg = rate >= 80
    ? { bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d", label: l1 }
    : rate >= 60
    ? { bg: "#fefce8", border: "#fde68a", text: "#a16207", label: l2 }
    : { bg: "#fef2f2", border: "#fecaca", text: "#b91c1c", label: l3 };
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 5,
      backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`,
      color: cfg.text, fontSize: 9, fontWeight: 800,
      textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap",
    }}>
      {cfg.label}
    </span>
  );
}

/* ── Card wrapper ── */
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ backgroundColor: TI.surface, borderRadius: 14, padding: 28, border: `1px solid ${TI.border}`, ...style }}>
      {children}
    </div>
  );
}

/* ── Tabs ── */
const TABS = ["Visão Geral", "Produção", "Logística", "Patrocinadores"];

export default function DashboardAnalises() {
  const [, setLocation] = useLocation();
  const [period, setPeriod]     = useState("all");
  const [activeTab, setActiveTab] = useState(0);
  const [eventFilter, setEventFilter] = useState("all");

  const { data: events    = [] } = useQuery<any[]>({ queryKey: ["/api/events"]   });
  const { data: items     = [] } = useQuery<any[]>({ queryKey: ["/api/items"]    });
  const { data: sponsors  = [] } = useQuery<any[]>({ queryKey: ["/api/sponsors"] });

  const cut = cutoff(period);

  /* ── Filtered sets ── */
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
  const deliveryRate = totalQty > 0 ? Math.round((deliveredQty / totalQty) * 100) : 0;
  const activeSponsorCount = sponsors.length;

  /* sparkline: last 6 months item counts */
  const monthKeys = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), 5 - i), "yyyy-MM"));
  }, []);

  const sparkItems = useMemo(() => {
    const map: Record<string, number> = {};
    monthKeys.forEach(k => (map[k] = 0));
    items.forEach(i => {
      const k = format(new Date(i.createdAt), "yyyy-MM");
      if (map[k] !== undefined) map[k]++;
    });
    return monthKeys.map(k => map[k]);
  }, [items, monthKeys]);

  const sparkEvents = useMemo(() => {
    const map: Record<string, number> = {};
    monthKeys.forEach(k => (map[k] = 0));
    events.forEach(e => {
      const k = format(new Date(e.createdAt), "yyyy-MM");
      if (map[k] !== undefined) map[k]++;
    });
    return monthKeys.map(k => map[k]);
  }, [events, monthKeys]);

  /* ── Monthly data for dual area chart ── */
  const monthlyData = useMemo(() => {
    return monthKeys.map(k => {
      const label = format(new Date(k + "-01"), "MMM", { locale: ptBR }).toUpperCase();
      const producao = items.filter(i =>
        format(new Date(i.createdAt), "yyyy-MM") === k).reduce((s, i) => s + (i.quantity || 1), 0);
      const entregas = items.filter(i =>
        i.status === "delivered" &&
        format(new Date(i.deliveredAt || i.updatedAt), "yyyy-MM") === k).reduce((s, i) => s + (i.quantity || 1), 0);
      return { label, producao, entregas };
    });
  }, [items, monthKeys]);

  /* ── Workflow groups for donut ── */
  const donutData = useMemo(() => {
    const total = fItems.reduce((s, i) => s + (i.quantity || 1), 0) || 1;
    return WF_GROUPS.map(g => {
      const qty = fItems.filter(i => g.keys.includes(i.status)).reduce((s, i) => s + (i.quantity || 1), 0);
      return { ...g, qty, pct: Math.round((qty / total) * 100) };
    }).filter(g => g.qty > 0);
  }, [fItems]);

  /* ── Top sponsors by item volume ── */
  const topSponsors = useMemo(() => {
    const map: Record<string, { name: string; qty: number }> = {};
    sponsors.forEach(s => { map[s.id] = { name: s.name, qty: 0 }; });
    fItems.forEach(i => {
      (i.sponsorIds || []).forEach((sid: string) => {
        if (map[sid]) map[sid].qty += (i.quantity || 1);
      });
    });
    return Object.entries(map)
      .map(([id, v]) => ({ id, ...v }))
      .filter(s => s.qty > 0)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 6);
  }, [sponsors, fItems]);
  const maxSponsorQty = Math.max(...topSponsors.map(s => s.qty), 1);

  /* ── Status Board: real alerts ── */
  const alerts = useMemo(() => {
    const list: { type: "red" | "yellow" | "blue"; title: string; desc: string; eventId?: string }[] = [];

    // Urgent events
    const urgentEvents = events.filter(e => e.status === "urgent");
    urgentEvents.slice(0, 2).forEach(e => {
      list.push({ type: "red", title: `Evento Urgente: ${e.name}`, desc: "Este evento foi marcado como urgente. Verificar itens pendentes.", eventId: e.id });
    });

    // Items awaiting approval for a long time
    const stale = fItems.filter(i =>
      ["awaiting_approval", "awaiting_final_review"].includes(i.status) &&
      differenceInHours(new Date(), new Date(i.updatedAt)) > 24
    );
    if (stale.length > 0) {
      list.push({ type: "yellow", title: `${stale.length} peça${stale.length > 1 ? "s" : ""} aguardando aprovação`, desc: "Itens parados há mais de 24h sem aprovação do criador.", eventId: stale[0].eventId });
    }

    // Items ready for production not yet started
    const readyNotStarted = fItems.filter(i => i.status === "ready_for_production");
    if (readyNotStarted.length > 0) {
      list.push({ type: "blue", title: `${readyNotStarted.length} peça${readyNotStarted.length > 1 ? "s" : ""} prontas para produção`, desc: "Itens liberados aguardando início na gráfica.", eventId: readyNotStarted[0].eventId });
    }

    // Events nearing departure with undelivered items
    const nearDep = events.filter(e => {
      if (!e.truckDepartureDate) return false;
      const hrs = differenceInHours(new Date(e.truckDepartureDate), new Date());
      return hrs > 0 && hrs < 72;
    });
    nearDep.slice(0, 1).forEach(e => {
      const hrs = differenceInHours(new Date(e.truckDepartureDate), new Date());
      list.push({ type: "red", title: `Saída em ${hrs}h: ${e.name}`, desc: "Evento com caminhão saindo em menos de 72h. Verificar status dos itens.", eventId: e.id });
    });

    return list.slice(0, 4);
  }, [events, fItems]);

  /* ── By type table ── */
  const byType = useMemo(() => {
    const map: Record<string, { total: number; inProd: number; delivered: number }> = {};
    fItems.forEach(i => {
      const t = i.type || "Sem tipo";
      if (!map[t]) map[t] = { total: 0, inProd: 0, delivered: 0 };
      map[t].total    += (i.quantity || 1);
      if (["inProduction", "produced"].includes(i.status)) map[t].inProd    += (i.quantity || 1);
      if (i.status === "delivered")                         map[t].delivered += (i.quantity || 1);
    });
    return Object.entries(map)
      .map(([type, v]) => ({ type, ...v, sla: v.total > 0 ? (v.delivered / v.total) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [fItems]);

  /* ── Select style ── */
  const sel: React.CSSProperties = {
    backgroundColor: TI.low, border: "none", borderRadius: 8,
    padding: "8px 12px", fontSize: 12, fontWeight: 700,
    color: TI.text, cursor: "pointer", outline: "none",
    appearance: "none", WebkitAppearance: "none",
  };

  /* ── KPI card data ── */
  const KPI_CARDS = [
    { label: "Total Eventos",    value: totalEvents,  icon: Calendar, bg: "#fff7ed", ic: TI.accent,  spark: sparkEvents, sColor: "#f97316" },
    { label: "Total de Peças",   value: totalQty,     icon: Package,  bg: "#eff6ff", ic: "#3b82f6",  spark: sparkItems,  sColor: "#3b82f6" },
    { label: "Em Produção",      value: inProdQty,    icon: Zap,      bg: "#faf5ff", ic: "#9333ea",  spark: sparkItems.map(v => Math.round(v * 0.3)), sColor: "#9333ea" },
    { label: "Entregas",         value: deliveredQty, icon: Truck,    bg: "#f0fdf4", ic: "#16a34a",  spark: sparkItems.map(v => Math.round(v * 0.6)), sColor: "#16a34a" },
    { label: "Taxa de Entrega",  value: `${deliveryRate}%`, icon: TrendingUp, bg: "#fff7ed", ic: TI.accent, spark: [60,65,70,72,78,deliveryRate], sColor: "#f97316" },
    { label: "Patrocinadores",   value: activeSponsorCount, icon: Users, bg: "#fefce8", ic: "#ca8a04", spark: Array(6).fill(activeSponsorCount), sColor: "#eab308" },
  ];

  const alertBg: Record<string, { bg: string; left: string; icon: string }> = {
    red:    { bg: "#fef2f2", left: "#ef4444", icon: "#dc2626" },
    yellow: { bg: "#fffbeb", left: "#f59e0b", icon: "#d97706" },
    blue:   { bg: "#eff6ff", left: "#3b82f6", icon: "#2563eb" },
  };

  return (
    <div style={{ backgroundColor: TI.bg, minHeight: "100%", padding: "24px 28px 56px" }}>

      {/* ── Tabs + actions ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", backgroundColor: TI.surface, border: `1px solid ${TI.border}`, borderRadius: 12, padding: 4, gap: 2 }}>
          {TABS.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              data-testid={`tab-${tab.toLowerCase().replace(/\s/g, "-")}`}
              style={{
                padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 700,
                backgroundColor: activeTab === i ? TI.accent : "transparent",
                color: activeTab === i ? "#fff" : TI.second,
                transition: "all 0.15s",
              }}
            >
              {tab}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ padding: "8px 10px", backgroundColor: TI.surface, border: `1px solid ${TI.border}`, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center" }}>
            <Download style={{ width: 16, height: 16, color: TI.second }} />
          </button>
          <button style={{ padding: "8px 10px", backgroundColor: TI.surface, border: `1px solid ${TI.border}`, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center" }}>
            <Share2 style={{ width: 16, height: 16, color: TI.second }} />
          </button>
        </div>
      </div>

      {/* ── Global filters bar ── */}
      <div style={{
        backgroundColor: TI.surface, border: `1px solid ${TI.border}`,
        borderRadius: 14, padding: "16px 20px", marginBottom: 20,
        display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 14,
      }}>
        <div style={{ flex: "1 1 160px" }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: TI.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Período</div>
          <select value={period} onChange={e => setPeriod(e.target.value)} data-testid="select-period" style={{ ...sel, width: "100%" }}>
            {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: TI.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Evento</div>
          <select value={eventFilter} onChange={e => setEventFilter(e.target.value)} data-testid="select-event" style={{ ...sel, width: "100%" }}>
            <option value="all">Todos os Eventos ({events.length})</option>
            {events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: TI.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Patrocinador</div>
          <select style={{ ...sel, width: "100%" }}>
            <option>Todos Ativos</option>
            {sponsors.map(s => <option key={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: TI.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Tipo de Item</div>
          <select style={{ ...sel, width: "100%" }}>
            <option>Toda Produção</option>
            {[...new Set(items.map(i => i.type).filter(Boolean))].map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* ── 6 KPI Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 16 }}>
        {KPI_CARDS.map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} style={{ backgroundColor: TI.surface, borderRadius: 14, padding: "18px 18px 14px", border: `1px solid ${TI.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: card.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon style={{ width: 16, height: 16, color: card.ic }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                  <Sparkline data={card.spark} color={card.sColor} />
                </div>
              </div>
              <p style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: TI.muted, margin: "0 0 4px" }}>
                {card.label}
              </p>
              <h3 style={{ fontSize: 22, fontWeight: 500, color: TI.text, margin: 0, fontFamily: "'DM Mono', monospace", letterSpacing: "-0.02em", lineHeight: 1 }}>
                {typeof card.value === "number" ? card.value.toLocaleString("pt-BR") : card.value}
              </h3>
            </div>
          );
        })}
      </div>

      {/* ── Row 1: Dual area chart + Donut ── */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 14 }}>

        {/* Volume de Produção vs Entregas */}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: TI.text, margin: "0 0 4px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em" }}>
                Volume de Produção vs. Entregas
              </h3>
              <p style={{ fontSize: 11, color: TI.second, margin: 0 }}>Fluxo de materiais consolidado por mês</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: TI.accent }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: TI.muted, textTransform: "uppercase" }}>Produção</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#006398" }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: TI.muted, textTransform: "uppercase" }}>Entregas</span>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={monthlyData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="gradProd" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={TI.accent} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={TI.accent} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradDel" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#006398"   stopOpacity={0.18} />
                  <stop offset="100%" stopColor="#006398"   stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fontSize: 10, fontWeight: 700, fill: TI.muted, fontFamily: "'DM Mono'" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: TI.muted }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div style={{ backgroundColor: TI.text, color: "#fff", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
                      {payload.map((p: any, i: number) => (
                        <div key={i} style={{ color: p.color }}>{p.name}: {p.value}</div>
                      ))}
                    </div>
                  );
                }}
              />
              <Area type="monotone" dataKey="producao" name="Produção" stroke={TI.accent} strokeWidth={2.5} fill="url(#gradProd)" dot={false} />
              <Area type="monotone" dataKey="entregas"  name="Entregas"  stroke="#006398" strokeWidth={2.5} fill="url(#gradDel)" strokeDasharray="6 3" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Status de Workflow — Donut */}
        <Card style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: TI.text, margin: 0, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em" }}>
              Status de Workflow
            </h3>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "relative", width: 160, height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData.length ? donutData : [{ label: "Vazio", qty: 1, color: TI.high, pct: 100 }]}
                    cx="50%" cy="50%" innerRadius={52} outerRadius={72}
                    dataKey="qty" strokeWidth={2} stroke={TI.surface}
                  >
                    {(donutData.length ? donutData : [{ color: TI.high }]).map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: TI.text, fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1 }}>
                  {totalQty.toLocaleString("pt-BR")}
                </span>
                <span style={{ fontSize: 9, fontWeight: 800, color: TI.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 3 }}>
                  Total Peças
                </span>
              </div>
            </div>

            {/* Legend with % */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", marginTop: 20, width: "100%", paddingLeft: 4 }}>
              {donutData.map(d => (
                <div key={d.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", backgroundColor: d.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: TI.second }}>{d.label}</span>
                  </div>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700, color: TI.text }}>{d.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* ── Row 2: Top Sponsors + Status Board ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>

        {/* Top Patrocinadores */}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: TI.text, margin: 0, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em" }}>
              Top Patrocinadores por Volume
            </h3>
            <button onClick={() => setLocation("/patrocinadores")}
              style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: TI.accent, background: "none", border: "none", cursor: "pointer" }}>
              Ver Todos
            </button>
          </div>

          {topSponsors.length === 0 ? (
            <p style={{ fontSize: 13, color: TI.muted, textAlign: "center", padding: "24px 0" }}>
              Nenhum patrocinador com peças vinculadas
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {topSponsors.map(s => (
                <div key={s.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: TI.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>
                      {s.name}
                    </span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 700, color: TI.accent, flexShrink: 0 }}>
                      {s.qty.toLocaleString("pt-BR")} un.
                    </span>
                  </div>
                  <div style={{ width: "100%", height: 7, backgroundColor: TI.low, borderRadius: 100 }}>
                    <div style={{ height: "100%", borderRadius: 100, backgroundColor: TI.accent, width: `${(s.qty / maxSponsorQty) * 100}%`, transition: "width 0.4s" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Status Board */}
        <Card style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: TI.text, margin: 0, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em" }}>
              Status Board
            </h3>
            {alerts.filter(a => a.type === "red").length > 0 && (
              <span style={{ padding: "3px 10px", backgroundColor: "#fef2f2", color: "#b91c1c", fontSize: 9, fontWeight: 800, borderRadius: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {alerts.filter(a => a.type === "red").length} Alerta{alerts.filter(a => a.type === "red").length > 1 ? "s" : ""} Crítico{alerts.filter(a => a.type === "red").length > 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
            {alerts.length === 0 ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 0" }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", backgroundColor: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                  <TrendingUp style={{ width: 22, height: 22, color: "#16a34a" }} />
                </div>
                <p style={{ fontSize: 13, fontWeight: 700, color: TI.text, margin: "0 0 4px" }}>Tudo em ordem</p>
                <p style={{ fontSize: 11, color: TI.muted, margin: 0 }}>Nenhum alerta crítico no momento</p>
              </div>
            ) : alerts.map((a, idx) => {
              const cfg = alertBg[a.type];
              const AlertIcon = a.type === "red" ? AlertTriangle : a.type === "yellow" ? Clock : TrendingUp;
              return (
                <div
                  key={idx}
                  onClick={() => a.eventId && setLocation(`/eventos/${a.eventId}`)}
                  data-testid={`alert-${idx}`}
                  style={{
                    padding: "12px 14px", backgroundColor: cfg.bg,
                    borderLeft: `4px solid ${cfg.left}`,
                    borderRadius: "0 8px 8px 0",
                    display: "flex", gap: 10, cursor: a.eventId ? "pointer" : "default",
                    alignItems: "flex-start", transition: "opacity 0.12s",
                  }}
                  onMouseEnter={e => { if (a.eventId) e.currentTarget.style.opacity = "0.8"; }}
                  onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                >
                  <AlertIcon style={{ width: 15, height: 15, color: cfg.icon, marginTop: 1, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: TI.text, margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.title}
                    </p>
                    <p style={{ fontSize: 10, color: cfg.icon, margin: 0, lineHeight: 1.4, opacity: 0.8 }}>
                      {a.desc}
                    </p>
                  </div>
                  {a.eventId && <ChevronRight style={{ width: 14, height: 14, color: cfg.left, flexShrink: 0, marginTop: 2 }} />}
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* ── Footer Table: Desempenho por Tipo ── */}
      <div style={{ backgroundColor: TI.surface, borderRadius: 14, border: `1px solid ${TI.border}`, overflow: "hidden" }}>
        <div style={{ padding: "20px 28px", borderBottom: `1px solid ${TI.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: TI.text, margin: "0 0 3px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em" }}>
              Desempenho por Categoria
            </h3>
            <p style={{ fontSize: 11, color: TI.second, margin: 0 }}>Comparativo de métricas de eficiência operacional</p>
          </div>
        </div>

        {/* Table head */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr 1fr", padding: "12px 28px", backgroundColor: TI.low, borderBottom: `1px solid ${TI.border}` }}>
          {["Categoria", "Volume Total", "SLA Atendimento", "Qualidade"].map(h => (
            <div key={h} style={{ fontSize: 9, fontWeight: 900, color: TI.muted, textTransform: "uppercase", letterSpacing: "0.12em" }}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        {byType.length === 0 ? (
          <div style={{ padding: "40px 28px", textAlign: "center", fontSize: 13, color: TI.muted }}>
            Nenhuma peça encontrada no período selecionado
          </div>
        ) : byType.map((row, idx) => (
          <div
            key={row.type}
            data-testid={`table-type-${idx}`}
            style={{
              display: "grid", gridTemplateColumns: "2fr 1fr 2fr 1fr",
              padding: "16px 28px", alignItems: "center",
              borderBottom: idx < byType.length - 1 ? `1px solid #f0efee` : "none",
              transition: "background 0.1s",
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f9f9f8")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            {/* Categoria */}
            <div style={{ fontSize: 13, fontWeight: 700, color: TI.text }}>{row.type}</div>

            {/* Volume Total */}
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 500, color: TI.second }}>
              {row.total.toLocaleString("pt-BR")}
            </div>

            {/* SLA — progress bar + % */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, paddingRight: 16 }}>
              <div style={{ flex: 1, height: 5, backgroundColor: TI.low, borderRadius: 100, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 100,
                  width: `${row.sla}%`,
                  backgroundColor: row.sla >= 80 ? "#22c55e" : row.sla >= 60 ? "#eab308" : "#ef4444",
                  transition: "width 0.4s",
                }} />
              </div>
              <span style={{
                fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 700,
                color: row.sla >= 80 ? "#16a34a" : row.sla >= 60 ? "#a16207" : "#dc2626",
                minWidth: 36, textAlign: "right",
              }}>
                {row.sla.toFixed(0)}%
              </span>
            </div>

            {/* Qualidade badge */}
            <div><RateBadge rate={row.sla} labels={["Ótimo", "Regular", "Crítico"]} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
