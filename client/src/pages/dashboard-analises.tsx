import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Clock, Package, CheckCircle, TrendingUp, AlertTriangle, Download, BarChart3, Timer } from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { differenceInHours, differenceInMinutes, subDays, subWeeks, subMonths, isAfter } from "date-fns";
import { useState } from "react";

// Titanium palette
const TI = {
  bg: "#fafaf9",
  surface: "#ffffff",
  border: "#e7e5e4",
  text: "#1c1917",
  secondary: "#78716c",
  muted: "#a8a29e",
  accent: "#f97316",
  // Monochrome scale for charts
  c1: "#1c1917",
  c2: "#44403c",
  c3: "#78716c",
  c4: "#a8a29e",
  c5: "#d6d3d1",
};

const STATUS_LABELS: Record<string, string> = {
  requested: "Solicitado",
  awaiting_linking: "Aguard. Vinculação",
  awaiting_submission: "Aguard. Envio",
  awaiting_sponsor_approval: "Aguard. Patrocinador",
  sponsor_approved: "Patroc. Aprovado",
  awaiting_final_review: "Aguard. Finalização",
  awaiting_creator_review: "Revisão Final",
  ready_for_production: "Pronto p/ Produção",
  approved: "Liberado",
  inProduction: "Em Produção",
  produced: "Produzido",
  delivered: "Entregue",
};

const PERIOD_OPTIONS = [
  { label: "Hoje", value: "today" },
  { label: "Semana", value: "week" },
  { label: "Mês", value: "month" },
  { label: "Tudo", value: "all" },
];

// Custom tooltip
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      backgroundColor: TI.surface, border: `1px solid ${TI.border}`,
      borderRadius: 8, padding: "8px 12px", fontSize: 12, color: TI.text,
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)"
    }}>
      {label && <p style={{ fontWeight: 600, marginBottom: 4 }}>{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || TI.text }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
};

export default function DashboardAnalises() {
  const [period, setPeriod] = useState("all");

  const { data: items = [] } = useQuery<any[]>({ queryKey: ["/api/items"] });
  const { data: events = [] } = useQuery<any[]>({ queryKey: ["/api/events"] });

  // Filter items by period
  const now = new Date();
  const periodStart = period === "today" ? subDays(now, 1)
    : period === "week" ? subWeeks(now, 1)
    : period === "month" ? subMonths(now, 1)
    : null;

  const filteredItems = periodStart
    ? items.filter(i => isAfter(new Date(i.createdAt), periodStart))
    : items;

  // KPI calculations
  const totalItems = filteredItems.length;
  const totalM2 = filteredItems.reduce((sum, i) => sum + (parseFloat(i.calculatedM2) || 0), 0);
  const deliveredCount = filteredItems.filter(i => i.status === "delivered").length;
  const deliveryRate = totalItems > 0 ? Math.round((deliveredCount / totalItems) * 100) : 0;

  const approvedItems = filteredItems.filter(i => i.approvedAt && i.createdAt);
  const avgApprovalTime = approvedItems.length > 0
    ? approvedItems.reduce((sum, item) => {
        return sum + differenceInHours(new Date(item.approvedAt), new Date(item.createdAt));
      }, 0) / approvedItems.length
    : 0;

  // Status distribution for donut
  const statusCounts: Record<string, number> = {};
  filteredItems.forEach(i => {
    statusCounts[i.status] = (statusCounts[i.status] || 0) + 1;
  });

  const MONO_COLORS = [TI.c1, TI.c2, TI.c3, TI.c4, TI.c5, "#e7e5e4"];
  const donutData = Object.entries(statusCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([status, value], i) => ({
      name: STATUS_LABELS[status] || status,
      value,
      color: MONO_COLORS[i % MONO_COLORS.length],
    }));

  // Bar chart: items per event (top 8 by item count)
  const barData = events
    .map(event => {
      const eventItems = filteredItems.filter(i => i.eventId === event.id);
      return {
        name: event.name.length > 18 ? event.name.substring(0, 18) + "…" : event.name,
        total: eventItems.length,
        entregues: eventItems.filter(i => i.status === "delivered").length,
      };
    })
    .filter(e => e.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  // Urgent events (< 48h)
  const urgentEvents = events
    .filter(event => {
      if (!event.truckDepartureDate) return false;
      const hrs = differenceInHours(new Date(event.truckDepartureDate), now);
      return hrs > 0 && hrs < 48;
    })
    .sort((a, b) => new Date(a.truckDepartureDate).getTime() - new Date(b.truckDepartureDate).getTime());

  // Top 5 events table (by item count)
  const topEvents = events
    .map(event => {
      const evItems = filteredItems.filter(i => i.eventId === event.id);
      return {
        id: event.id,
        name: event.name,
        total: evItems.length,
        delivered: evItems.filter(i => i.status === "delivered").length,
        m2: evItems.reduce((sum, i) => sum + (parseFloat(i.calculatedM2) || 0), 0),
        priority: event.priority,
      };
    })
    .filter(e => e.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const PRIORITY_DOT: Record<string, string> = {
    urgente: "#ef4444",
    alta: "#f59e0b",
    media: "#a855f7",
    baixa: "#3b82f6",
  };

  const exportToCSV = () => {
    const headers = ["Evento", "Item", "Qtd Total", "Qtd Produzida", "m²", "Status", "Material", "Acabamento"];
    const rows = filteredItems.map(item => [
      item.event?.name || "N/A",
      item.type, item.quantity, item.quantityProduced || 0,
      item.calculatedM2, item.status, item.material, item.finish,
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `relatorio-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  // Shared card style
  const card = {
    backgroundColor: TI.surface,
    border: `1px solid ${TI.border}`,
    borderRadius: 12,
    padding: "20px 24px",
  } as React.CSSProperties;

  return (
    <div style={{ backgroundColor: TI.bg, minHeight: "100%", padding: "24px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ backgroundColor: TI.accent, borderRadius: 8, padding: "6px 8px", display: "flex" }}>
            <BarChart3 style={{ color: "#fff", width: 18, height: 18 }} />
          </div>
          <div>
            <h1 style={{ color: TI.text, fontSize: 18, fontWeight: 700, margin: 0 }} data-testid="title-dashboard-analises">
              Análise de Produção
            </h1>
            <p style={{ color: TI.muted, fontSize: 12, margin: 0 }}>Métricas e desempenho operacional</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Period selector */}
          <div style={{
            display: "flex", alignItems: "center",
            backgroundColor: TI.surface, border: `1px solid ${TI.border}`,
            borderRadius: 8, padding: 3, gap: 2
          }}>
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                data-testid={`button-period-${opt.value}`}
                style={{
                  padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: 600,
                  backgroundColor: period === opt.value ? TI.text : "transparent",
                  color: period === opt.value ? "#fff" : TI.secondary,
                  transition: "all 0.15s",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <Button variant="outline" onClick={exportToCSV} data-testid="button-export-csv"
            style={{ fontSize: 12, height: 36 }}>
            <Download className="h-4 w-4 mr-1.5" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Urgent alert */}
      {urgentEvents.length > 0 && (
        <div style={{
          backgroundColor: "#fff7ed", border: `1px solid #fed7aa`,
          borderRadius: 12, padding: "14px 20px",
          display: "flex", alignItems: "flex-start", gap: 12
        }}>
          <AlertTriangle style={{ color: TI.accent, width: 18, height: 18, flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: "#9a3412", fontWeight: 700, fontSize: 13, margin: "0 0 8px" }}>
              {urgentEvents.length} evento{urgentEvents.length > 1 ? "s" : ""} com saída do caminhão nas próximas 48h
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {urgentEvents.map(event => {
                const hrs = differenceInHours(new Date(event.truckDepartureDate), now);
                const mins = differenceInMinutes(new Date(event.truckDepartureDate), now) % 60;
                return (
                  <div key={event.id}
                    data-testid={`alert-urgent-${event.id}`}
                    style={{
                      backgroundColor: hrs < 24 ? "#fee2e2" : "#fff7ed",
                      border: `1px solid ${hrs < 24 ? "#fca5a5" : "#fed7aa"}`,
                      borderRadius: 8, padding: "6px 12px", fontSize: 12
                    }}>
                    <span style={{ fontWeight: 600, color: TI.text }}>{event.name}</span>
                    <span style={{ color: hrs < 24 ? "#dc2626" : "#c2410c", marginLeft: 8 }}>
                      <Clock style={{ display: "inline", width: 11, height: 11, marginRight: 3 }} />
                      {hrs}h {mins}min
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ROW 1 — KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {/* Total itens */}
        <div style={card} data-testid="kpi-total-items">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <span style={{ color: TI.muted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Total de Itens
            </span>
            <Package style={{ color: TI.muted, width: 16, height: 16 }} />
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, color: TI.text, lineHeight: 1 }}>{totalItems}</div>
          <p style={{ color: TI.muted, fontSize: 12, marginTop: 6 }}>
            <span style={{ color: TI.accent, fontWeight: 600 }}>{deliveredCount}</span> entregues
          </p>
        </div>

        {/* Total m² */}
        <div style={card} data-testid="kpi-total-m2">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <span style={{ color: TI.muted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Total de m²
            </span>
            <TrendingUp style={{ color: TI.muted, width: 16, height: 16 }} />
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, color: TI.text, lineHeight: 1 }}>{totalM2.toFixed(1)}</div>
          <p style={{ color: TI.muted, fontSize: 12, marginTop: 6 }}>metros quadrados</p>
        </div>

        {/* Tempo médio liberação */}
        <div style={card} data-testid="kpi-approval-time">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <span style={{ color: TI.muted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Tempo Médio Liberação
            </span>
            <Timer style={{ color: TI.muted, width: 16, height: 16 }} />
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, color: TI.text, lineHeight: 1 }}>
            {avgApprovalTime.toFixed(1)}<span style={{ fontSize: 16, fontWeight: 400, color: TI.secondary }}>h</span>
          </div>
          <p style={{ color: TI.muted, fontSize: 12, marginTop: 6 }}>Solicitação → Liberação</p>
        </div>

        {/* Taxa de entrega */}
        <div style={card} data-testid="kpi-delivery-rate">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <span style={{ color: TI.muted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Taxa de Entrega
            </span>
            <CheckCircle style={{ color: TI.muted, width: 16, height: 16 }} />
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, color: deliveryRate >= 80 ? "#16a34a" : TI.text, lineHeight: 1 }}>
            {deliveryRate}<span style={{ fontSize: 16, fontWeight: 400, color: TI.secondary }}>%</span>
          </div>
          {/* mini progress bar */}
          <div style={{ marginTop: 10, height: 4, backgroundColor: TI.border, borderRadius: 2 }}>
            <div style={{
              height: 4, borderRadius: 2,
              width: `${deliveryRate}%`,
              backgroundColor: deliveryRate >= 80 ? "#16a34a" : TI.accent,
              transition: "width 0.4s ease"
            }} />
          </div>
        </div>
      </div>

      {/* ROW 2 — Bar chart + Donut */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>

        {/* Bar chart */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ color: TI.text, fontSize: 13, fontWeight: 700, margin: 0 }}>Produção por Evento</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: TI.secondary }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: TI.c1, display: "inline-block" }} />
                Total
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: TI.secondary }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: TI.c4, display: "inline-block" }} />
                Entregues
              </span>
            </div>
          </div>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} barCategoryGap="30%" barGap={4}>
                <CartesianGrid vertical={false} strokeDasharray="0" stroke="#f5f5f4" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: TI.muted }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: TI.muted }}
                  axisLine={false} tickLine={false}
                  width={28}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f5f5f4" }} />
                <Bar dataKey="total" name="Total" fill={TI.c1} radius={[4, 4, 0, 0]} />
                <Bar dataKey="entregues" name="Entregues" fill={TI.c4} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 220, color: TI.muted, fontSize: 13 }}>
              Nenhum dado disponível
            </div>
          )}
        </div>

        {/* Donut */}
        <div style={card}>
          <h2 style={{ color: TI.text, fontSize: 13, fontWeight: 700, margin: "0 0 16px" }}>Distribuição por Status</h2>
          {donutData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%" cy="50%"
                    innerRadius={45} outerRadius={72}
                    paddingAngle={2}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {donutData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Legend with dots */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
                {donutData.slice(0, 6).map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: d.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: TI.secondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 130 }}>{d.name}</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: TI.text }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: TI.muted, fontSize: 13 }}>
              Nenhum dado disponível
            </div>
          )}
        </div>
      </div>

      {/* ROW 3 — Top 5 eventos */}
      <div style={card}>
        <h2 style={{ color: TI.text, fontSize: 13, fontWeight: 700, margin: "0 0 16px" }}>Top 5 Eventos por Volume</h2>
        {topEvents.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Evento", "Prioridade", "Total", "Entregues", "m²", "Progresso"].map(h => (
                  <th key={h} style={{
                    padding: "6px 12px", textAlign: h === "Progresso" || h === "Total" || h === "Entregues" || h === "m²" ? "center" : "left",
                    fontSize: 10, fontWeight: 600, color: TI.muted, textTransform: "uppercase",
                    letterSpacing: "0.5px", borderBottom: `1px solid ${TI.border}`
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topEvents.map((ev, idx) => {
                const pct = ev.total > 0 ? Math.round((ev.delivered / ev.total) * 100) : 0;
                const dotColor = PRIORITY_DOT[ev.priority] || TI.muted;
                return (
                  <tr key={ev.id} data-testid={`row-top-event-${ev.id}`}
                    style={{ borderBottom: idx < topEvents.length - 1 ? `1px solid ${TI.border}` : "none" }}>
                    <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600, color: TI.text }}>
                      {ev.name.length > 30 ? ev.name.substring(0, 30) + "…" : ev.name}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      {ev.priority ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                          <div style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: dotColor }} />
                          <span style={{ fontSize: 11, color: TI.secondary, textTransform: "capitalize" }}>{ev.priority}</span>
                        </div>
                      ) : <span style={{ color: TI.muted, fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontSize: 14, fontWeight: 700, color: TI.text }}>{ev.total}</td>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontSize: 14, fontWeight: 600, color: "#16a34a" }}>{ev.delivered}</td>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontSize: 12, color: TI.secondary }}>{ev.m2.toFixed(1)}</td>
                    <td style={{ padding: "10px 12px", minWidth: 100 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 5, backgroundColor: TI.border, borderRadius: 3 }}>
                          <div style={{
                            height: 5, borderRadius: 3,
                            width: `${pct}%`,
                            backgroundColor: pct === 100 ? "#16a34a" : TI.accent,
                          }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: TI.secondary, minWidth: 28, textAlign: "right" }}>{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ textAlign: "center", padding: "32px 0", color: TI.muted, fontSize: 13 }}>
            Nenhum dado disponível para o período selecionado
          </div>
        )}
      </div>
    </div>
  );
}
