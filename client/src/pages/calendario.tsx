import { useQuery } from "@tanstack/react-query";
import { parseDateLocal } from "@/lib/utils";
import { ChevronLeft, ChevronRight, AlertTriangle, Calendar, Truck, Search, BarChart2, Flag } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";

/* ── Palette ── */
const P = {
  bg:       "#f9f9f8",
  surface:  "#ffffff",
  border:   "#e7e5e4",
  text:     "#1c1917",
  secondary:"#78716c",
  muted:    "#a8a29e",
  accent:   "#f97316",
  low:      "#f5f4f0",
};

/* ── Priority → border-left color ── */
const PRIO_COLOR: Record<string, string> = {
  urgente:   "#dc2626",
  alta:      "#f97316",
  media:     "#eab308",
  baixa:     "#3b82f6",
  completed: "#22c55e",
  none:      "#d6d3d1",
};

const PRIO_LABEL: Record<string, string> = {
  urgente:   "Urgente",
  alta:      "Alta",
  media:     "Média",
  baixa:     "Normal",
  completed: "Concluído",
  none:      "Sem prioridade",
};

function prioKey(ev: any): string {
  if (ev.status === "completed") return "completed";
  return ev.priority || "none";
}

/* ── Deadline types (same colors as event-detail) ── */
const DEADLINE_TYPES = [
  { key: "deadlineListaImagens",    label: "Lista de Imagens",    short: "Lista Img",       color: "#8b5cf6" },
  { key: "deadlineEntregaLayouts",  label: "Entrega de Layouts",  short: "Entrega Layout",  color: "#3b82f6" },
  { key: "deadlineAprovacaoLayout", label: "Aprovação de Layout", short: "Aprov. Layout",   color: "#f59e0b" },
  { key: "deadlineRevisaoLista",    label: "Revisão de Lista",    short: "Revisão Lista",   color: "#10b981" },
  { key: "deadlineProducaoGrafica", label: "Produção Gráfica",    short: "Prod. Gráfica",   color: "#f97316" },
] as const;

const DEADLINE_DEFAULTS: Record<string, number> = {
  deadlineListaImagens:    -25,
  deadlineEntregaLayouts:  -20,
  deadlineAprovacaoLayout: -12,
  deadlineRevisaoLista:    -8,
  deadlineProducaoGrafica: -1,
};

/* Sunday-first week (matches mockup) */
const WEEK_DAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

const MONTH_NAMES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

export default function Calendario() {  const isMobile = useIsMobile();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [, setLocation] = useLocation();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeView, setActiveView] = useState<"mes"|"semana"|"lista">("mes");

  const { data: events = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/events"] });

  const year  = currentDate.getFullYear();
  const month = currentDate.getMonth();

  /* Sunday-first offset */
  const firstDay    = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow    = firstDay.getDay(); // 0=Sunday

  const days: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  /* pad to complete last row */
  while (days.length % 7 !== 0) days.push(null);

  const getEventsForDate = (date: Date) => {
    const ds = date.toDateString();
    const starts = events.filter(e => parseDateLocal(e.startDate).toDateString() === ds)
      .map(e => ({ ...e, _type: "start" as const }));
    const deps = events.filter(e => new Date(e.truckDepartureDate).toDateString() === ds)
      .map(e => ({ ...e, _type: "departure" as const }));
    return [...starts, ...deps];
  };

  const getDeadlinesForDate = (date: Date) => {
    const ds = date.toDateString();
    const result: Array<{ event: any; dtype: typeof DEADLINE_TYPES[number] }> = [];
    for (const ev of events) {
      const start = parseDateLocal(ev.startDate);
      for (const dt of DEADLINE_TYPES) {
        const offset: number = (ev as any)[dt.key] ?? DEADLINE_DEFAULTS[dt.key];
        const d = new Date(start);
        d.setDate(d.getDate() + offset);
        if (d.toDateString() === ds) {
          result.push({ event: ev, dtype: dt });
        }
      }
    }
    return result;
  };

  /* Urgent: departure < 48h away */
  const urgentEvents = useMemo(() =>
    events.filter(ev => {
      const hrs = (new Date(ev.truckDepartureDate).getTime() - Date.now()) / 3_600_000;
      return hrs > 0 && hrs < 48;
    }).sort((a, b) => new Date(a.truckDepartureDate).getTime() - new Date(b.truckDepartureDate).getTime()),
  [events]);

  /* Next 5 events for sidebar */
  const upcomingEvents = useMemo(() =>
    events
      .filter(ev => parseDateLocal(ev.startDate).getTime() >= Date.now() && ev.status !== "completed")
      .sort((a, b) => parseDateLocal(a.startDate).getTime() - parseDateLocal(b.startDate).getTime())
      .slice(0, 5),
  [events]);

  /* Month stats */
  const monthEvents = events.filter(ev => {
    const d = parseDateLocal(ev.startDate);
    return d.getFullYear() === year && d.getMonth() === month;
  });
  const completedCount = monthEvents.filter(e => e.status === "completed").length;
  const urgentCount    = monthEvents.filter(e => e.priority === "urgente").length;

  const filteredSearch = searchTerm
    ? events.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : events;

  function msToHM(ms: number) {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return `${h}h ${m}min`;
  }

  /* pill background for urgent countdown */
  function urgentBg(ev: any) {
    const hrs = (new Date(ev.truckDepartureDate).getTime() - Date.now()) / 3_600_000;
    return hrs < 24 ? "#dc2626" : "#f97316";
  }

  return (
    <div style={{ backgroundColor: P.bg, height: "100%", overflowY: "auto", padding: isMobile ? "14px 14px 32px" : "28px 28px 48px" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 data-testid="title-calendario" style={{
            fontSize: 38, fontWeight: 800, color: P.text, margin: 0,
            textTransform: "uppercase", letterSpacing: "-0.03em",
            fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1,
          }}>
            Calendário de Eventos
          </h1>
          <p style={{ fontSize: 13, color: P.secondary, margin: "6px 0 0", fontWeight: 500 }}>
            Gestão tática e logística — {MONTH_NAMES[month]} {year}
          </p>
        </div>

        {/* View switcher */}
        <div style={{ display: "flex", backgroundColor: "#eeeeed", borderRadius: 10, padding: 4, gap: 2 }}>
          {(["mes", "semana", "lista"] as const).map(v => (
            <button key={v} onClick={() => setActiveView(v)}
              style={{
                padding: "6px 18px", borderRadius: 7, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 700,
                backgroundColor: activeView === v ? "#ffffff" : "transparent",
                color: activeView === v ? P.text : P.muted,
                boxShadow: activeView === v ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.15s",
              }}>
              {v === "mes" ? "Mês" : v === "semana" ? "Semana" : "Lista"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Alert strip (urgent < 48h) ── */}
      {urgentEvents.length > 0 && (
        <div style={{
          marginBottom: 20,
          backgroundColor: "#fef2f2",
          borderLeft: "6px solid #dc2626",
          borderRadius: 10,
          border: "1px solid #fca5a5",
          padding: "14px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <AlertTriangle style={{ width: 18, height: 18, color: "#dc2626", flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#7f1d1d" }}>
              {urgentEvents.length} evento{urgentEvents.length > 1 ? "s" : ""} com saída do caminhão nas próximas 48h
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: "#ffffff", backgroundColor: "#dc2626", borderRadius: 100, padding: "2px 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Crítico
            </span>
            <button onClick={() => { setSelectedDate(new Date(urgentEvents[0].truckDepartureDate)); setDialogOpen(true); }}
              style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>
              Ver Detalhes
            </button>
          </div>
        </div>
      )}

      {/* ── Main Calendar Card ── */}
      <div style={{ backgroundColor: P.surface, borderRadius: 14, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.06)", marginBottom: 28 }}>

        {/* Navigation bar */}
        <div style={{ padding: "20px 32px", backgroundColor: "#f9f9f8", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: P.text, textTransform: "uppercase", letterSpacing: "-0.03em", fontFamily: "'Space Grotesk', sans-serif" }}>
              {MONTH_NAMES[month]} {year}
            </h2>
            <div style={{ display: "flex", gap: 4 }}>
              <NavBtn onClick={() => setCurrentDate(new Date(year, month - 1, 1))} testId="button-prev-month">
                <ChevronLeft style={{ width: 18, height: 18 }} />
              </NavBtn>
              <NavBtn onClick={() => setCurrentDate(new Date(year, month + 1, 1))} testId="button-next-month">
                <ChevronRight style={{ width: 18, height: 18 }} />
              </NavBtn>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Search */}
            <div style={{ position: "relative" }}>
              <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: P.muted }} />
              <input placeholder="Filtrar evento..."
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                style={{ paddingLeft: 32, paddingRight: 12, height: 36, width: 200, backgroundColor: "#eeeeed", border: "none", borderRadius: 8, fontSize: 12, color: P.text, outline: "none" }} />
            </div>
            <button onClick={() => setCurrentDate(new Date())} data-testid="button-today"
              style={{ padding: "7px 20px", borderRadius: 8, border: "1px solid #e7e5e4", backgroundColor: "#ffffff", color: P.text, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = P.bg)}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#ffffff")}>
              Hoje
            </button>
          </div>
        </div>

        {isLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 64 }}>
            <div style={{ width: 32, height: 32, border: "3px solid #e7e5e4", borderTopColor: P.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>

            {/* Day headers */}
            {WEEK_DAYS.map(d => (
              <div key={d} style={{
                padding: "12px 0", textAlign: "center",
                backgroundColor: "#f9f9f8",
                borderBottom: "1px solid #eeeeed",
                borderRight: d !== "SÁB" ? "1px solid #eeeeed" : undefined,
                fontSize: 10, fontWeight: 900, color: "#a8a29e",
                textTransform: "uppercase", letterSpacing: "0.18em",
              }}>
                {d}
              </div>
            ))}

            {/* Day cells */}
            {days.map((day, idx) => {
              const col = idx % 7;
              const isOutside = day === null;

              /* ── Previous month days to fill the gap ── */
              if (isOutside) {
                /* compute which day-of-month it represents (before or after) */
                const outsideDay = idx < startDow
                  ? new Date(year, month, 0).getDate() - (startDow - idx - 1)
                  : idx - daysInMonth - startDow + 1;
                return (
                  <div key={`out-${idx}`} style={{
                    height: 90, backgroundColor: "rgba(250,250,249,0.6)", padding: "8px 8px",
                    borderRight: col !== 6 ? "1px solid #eeeeed" : undefined,
                    borderBottom: "1px solid #eeeeed",
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#d1cdc9" }}>{String(outsideDay).padStart(2,"0")}</span>
                  </div>
                );
              }

              const date         = new Date(year, month, day);
              const dayEvs       = getEventsForDate(date).filter(ev =>
                !searchTerm || ev.name.toLowerCase().includes(searchTerm.toLowerCase())
              );
              const dayDeadlines = getDeadlinesForDate(date).filter(d =>
                !searchTerm || d.event.name.toLowerCase().includes(searchTerm.toLowerCase())
              );
              const allCellItems: Array<
                | { kind: "event"; ev: (typeof dayEvs)[number] }
                | { kind: "deadline"; event: any; dtype: typeof DEADLINE_TYPES[number] }
              > = [
                ...dayEvs.map(ev => ({ kind: "event" as const, ev })),
                ...dayDeadlines.map(d => ({ kind: "deadline" as const, event: d.event, dtype: d.dtype })),
              ];
              const isToday = date.toDateString() === new Date().toDateString();
              const hasAny  = allCellItems.length > 0;

              return (
                <div
                  key={day}
                  data-testid={`calendar-day-${day}`}
                  onClick={() => { if (hasAny) { setSelectedDate(date); setDialogOpen(true); } }}
                  style={{
                    height: 90, padding: "7px 7px",
                    borderRight: col !== 6 ? "1px solid #eeeeed" : undefined,
                    borderBottom: "1px solid #eeeeed",
                    backgroundColor: P.surface,
                    cursor: hasAny ? "pointer" : "default",
                    display: "flex", flexDirection: "column", gap: 3,
                    outline: isToday ? "2px solid rgba(249,115,22,0.2)" : undefined,
                    outlineOffset: "-2px",
                    transition: "background 0.1s",
                    position: "relative",
                  }}
                  onMouseEnter={e => { if (hasAny) (e.currentTarget.style.backgroundColor = "#f9f9f8"); }}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = P.surface)}
                >
                  {/* Day number */}
                  <div style={{ marginBottom: 2 }}>
                    {isToday ? (
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 22, height: 22, borderRadius: "50%",
                        backgroundColor: P.accent, color: "#ffffff",
                        fontSize: 11, fontWeight: 900,
                      }}>{day}</span>
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 800, color: P.text }}>{String(day).padStart(2,"0")}</span>
                    )}
                  </div>

                  {/* Event + deadline pills (max 2 visible) */}
                  {allCellItems.slice(0, 2).map((item, i) => {
                    if (item.kind === "event") {
                      const ev        = item.ev;
                      const isStart   = ev._type === "start";
                      const color     = PRIO_COLOR[prioKey(ev)];
                      const depTime   = new Date(ev.truckDepartureDate);
                      const remaining = depTime.getTime() - Date.now();
                      const isUrgent  = !isStart && remaining > 0 && remaining < 48 * 3_600_000;
                      const isCrit    = !isStart && remaining > 0 && remaining < 24 * 3_600_000;
                      return (
                        <div
                          key={`ev-${ev.id}-${ev._type}`}
                          data-testid={`event-${ev.id}-${ev._type}`}
                          onClick={e => { e.stopPropagation(); setLocation(`/eventos/${ev.id}`); }}
                          title={ev.name}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            gap: 4, padding: "2px 6px",
                            backgroundColor: isCrit ? "#fef2f2" : "#ffffff",
                            borderLeft: `3px solid ${color}`,
                            borderRadius: 4,
                            boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
                            overflow: "hidden", cursor: "pointer",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden", flex: 1 }}>
                            {isStart
                              ? <Calendar style={{ width: 9, height: 9, color: P.muted, flexShrink: 0 }} />
                              : <Truck    style={{ width: 9, height: 9, color: P.muted, flexShrink: 0 }} />}
                            <span style={{ fontSize: 10, fontWeight: 700, color: P.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {ev.name}
                            </span>
                          </div>
                          {isUrgent && (
                            <span style={{ fontSize: 8, fontWeight: 900, color: "#ffffff", backgroundColor: isCrit ? "#dc2626" : "#f97316", borderRadius: 3, padding: "1px 4px", whiteSpace: "nowrap", flexShrink: 0 }}>
                              {msToHM(remaining)}
                            </span>
                          )}
                        </div>
                      );
                    } else {
                      const { event, dtype } = item;
                      return (
                        <div
                          key={`dl-${event.id}-${dtype.key}-${i}`}
                          onClick={e => { e.stopPropagation(); setLocation(`/eventos/${event.id}`); }}
                          title={`${event.name} — ${dtype.label}`}
                          style={{
                            display: "flex", alignItems: "center", gap: 4, padding: "2px 6px",
                            backgroundColor: `${dtype.color}12`,
                            borderLeft: `3px dashed ${dtype.color}`,
                            borderRadius: 4,
                            overflow: "hidden", cursor: "pointer",
                          }}
                        >
                          <Flag style={{ width: 9, height: 9, color: dtype.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 10, fontWeight: 700, color: dtype.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {dtype.short}
                          </span>
                        </div>
                      );
                    }
                  })}
                  {allCellItems.length > 2 && (
                    <span style={{ fontSize: 9, color: P.muted, paddingLeft: 2 }}>+{allCellItems.length - 2} mais</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Legend footer ── */}
        <div style={{ padding: "14px 32px", borderTop: "1px solid #eeeeed", backgroundColor: "#f9f9f8", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
          {/* Priority legend */}
          {[
            { key: "urgente",   label: "Urgente" },
            { key: "alta",      label: "Alta" },
            { key: "media",     label: "Média" },
            { key: "baixa",     label: "Normal" },
            { key: "completed", label: "Concluído" },
          ].map(({ key, label }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", backgroundColor: PRIO_COLOR[key] }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: P.muted, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</span>
            </div>
          ))}

          {/* Divider */}
          <div style={{ width: 1, height: 16, backgroundColor: "#e7e5e4", margin: "0 4px" }} />

          {/* Deadline legend */}
          {DEADLINE_TYPES.map(dt => (
            <div key={dt.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 14, height: 9, borderRadius: 2, borderLeft: `3px dashed ${dt.color}`, backgroundColor: `${dt.color}15` }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: P.muted, textTransform: "uppercase", letterSpacing: "0.07em" }}>{dt.short}</span>
            </div>
          ))}

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Calendar style={{ width: 12, height: 12, color: P.muted }} />
              <span style={{ fontSize: 11, color: P.secondary }}>Início</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Truck style={{ width: 12, height: 12, color: P.muted }} />
              <span style={{ fontSize: 11, color: P.secondary }}>Saída Logística</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Flag style={{ width: 12, height: 12, color: P.muted }} />
              <span style={{ fontSize: 11, color: P.secondary }}>Prazo de Layout</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Secondary grid: Próximos Eventos + Resumo do Mês ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr minmax(220px, 300px)", gap: 20, alignItems: "start" }}>

        {/* Próximos Eventos */}
        <div style={{ backgroundColor: "#f0efee", borderRadius: 14, padding: 24, position: "relative", overflow: "hidden" }}>
          {/* watermark icon */}
          <div style={{ position: "absolute", right: -20, bottom: -20, opacity: 0.05, pointerEvents: "none" }}>
            <Truck style={{ width: 160, height: 160, color: "#1c1917" }} />
          </div>
          <div style={{ position: "relative" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 800, color: P.text, textTransform: "uppercase", letterSpacing: "-0.02em", fontFamily: "'Space Grotesk', sans-serif" }}>
              Próximos Eventos
            </h3>
            {upcomingEvents.length === 0 ? (
              <p style={{ fontSize: 13, color: P.muted }}>Nenhum evento futuro no momento.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {upcomingEvents.map(ev => {
                  const dep = new Date(ev.truckDepartureDate);
                  const color = PRIO_COLOR[prioKey(ev)];
                  return (
                    <div key={ev.id}
                      data-testid={`upcoming-event-${ev.id}`}
                      onClick={() => setLocation(`/eventos/${ev.id}`)}
                      style={{ backgroundColor: "#ffffff", borderRadius: 8, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderLeft: `4px solid ${color}`, cursor: "pointer" }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = P.bg)}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#ffffff")}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: P.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.name}</p>
                        <p style={{ margin: "3px 0 0", fontSize: 11, color: P.muted }}>
                          Saída: {dep.toLocaleDateString("pt-BR")} às {dep.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color, backgroundColor: `${color}18`, borderRadius: 100, padding: "3px 10px", whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {PRIO_LABEL[prioKey(ev)]}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Resumo do Mês */}
        <div style={{ backgroundColor: "#1c1917", borderRadius: 14, padding: 24, color: "#ffffff" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#ffffff", textTransform: "uppercase", letterSpacing: "-0.01em", fontFamily: "'Space Grotesk', sans-serif" }}>
              Resumo do Mês
            </h3>
            <BarChart2 style={{ width: 18, height: 18, color: P.accent }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {[
              { label: "Total de Eventos", value: monthEvents.length, color: P.accent },
              { label: "Concluídos",       value: completedCount,     color: "#22c55e" },
              { label: "Urgentes",         value: urgentCount,        color: "#dc2626" },
              { label: "Em andamento",     value: monthEvents.length - completedCount, color: "#ffffff" },
            ].map(({ label, value, color }, i, arr) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>{label}</span>
                <span style={{ fontSize: 16, fontWeight: 800, color }}>{value}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => setCurrentDate(new Date())}
            style={{ marginTop: 20, width: "100%", padding: "11px 0", backgroundColor: "rgba(255,255,255,0.07)", border: "none", borderRadius: 8, color: "#ffffff", fontSize: 11, fontWeight: 900, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.1em" }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.12)")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.07)")}>
            Ver Mês Atual
          </button>
        </div>
      </div>

      {/* ── Day detail dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent style={{ maxWidth: 480, maxHeight: "80vh", overflowY: "auto" }}>
          <DialogHeader>
            <DialogTitle style={{ fontSize: 15, fontWeight: 700, color: P.text, display: "flex", alignItems: "center", gap: 8 }}>
              <Calendar style={{ width: 16, height: 16, color: P.accent }} />
              {selectedDate?.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </DialogTitle>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            {selectedDate && getEventsForDate(selectedDate).map(ev => {
              const pk = prioKey(ev);
              const color = PRIO_COLOR[pk];
              const isStart = ev._type === "start";
              const dateTime = isStart ? parseDateLocal(ev.startDate) : new Date(ev.truckDepartureDate);

              return (
                <div key={`${ev.id}-${ev._type}`}
                  data-testid={`dialog-event-${ev.id}-${ev._type}`}
                  onClick={() => { setDialogOpen(false); setLocation(`/eventos/${ev.id}`); }}
                  style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", backgroundColor: P.surface, border: `1px solid ${P.border}`, borderLeft: `4px solid ${color}`, borderRadius: 8, cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = P.bg)}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = P.surface)}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, backgroundColor: P.bg, border: `1px solid ${P.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {isStart ? <Calendar style={{ width: 14, height: 14, color: P.secondary }} /> : <Truck style={{ width: 14, height: 14, color: P.secondary }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: P.text, margin: 0 }}>{ev.name}</p>
                      <span style={{ fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", color: P.secondary, backgroundColor: P.bg, border: `1px solid ${P.border}`, borderRadius: 4, padding: "2px 6px" }}>
                        {PRIO_LABEL[pk]}
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: P.muted, margin: "4px 0 0" }}>
                      {isStart ? "Início: " : "Saída do caminhão: "}
                      <strong style={{ color: P.secondary }}>
                        {isStart ? dateTime.toLocaleDateString("pt-BR") : dateTime.toLocaleDateString("pt-BR", { timeZone: 'UTC' })}
                        {!isStart && ` às ${dateTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: 'UTC' })}`}
                      </strong>
                    </p>
                  </div>
                </div>
              );
            })}

            {/* ── Deadline entries in dialog ── */}
            {selectedDate && (() => {
              const deadlines = getDeadlinesForDate(selectedDate);
              if (!deadlines.length) return null;
              return (
                <>
                  <div style={{ borderTop: "1px solid #eeeeed", paddingTop: 6, paddingBottom: 2 }}>
                    <span style={{ fontSize: 10, fontWeight: 900, color: P.muted, textTransform: "uppercase", letterSpacing: "0.12em" }}>
                      Prazos de Layout
                    </span>
                  </div>
                  {deadlines.map(({ event, dtype }) => (
                    <div key={`${event.id}-${dtype.key}`}
                      data-testid={`dialog-deadline-${event.id}-${dtype.key}`}
                      onClick={() => { setDialogOpen(false); setLocation(`/eventos/${event.id}`); }}
                      style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", backgroundColor: `${dtype.color}08`, border: `1px solid ${P.border}`, borderLeft: `4px solid ${dtype.color}`, borderRadius: 8, cursor: "pointer" }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = `${dtype.color}14`)}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = `${dtype.color}08`)}
                    >
                      <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, backgroundColor: `${dtype.color}15`, border: `1px solid ${dtype.color}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Flag style={{ width: 14, height: 14, color: dtype.color }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <p style={{ fontSize: 14, fontWeight: 600, color: P.text, margin: 0 }}>{event.name}</p>
                          <span style={{ fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", color: "#ffffff", backgroundColor: dtype.color, borderRadius: 4, padding: "2px 8px" }}>
                            {dtype.short}
                          </span>
                        </div>
                        <p style={{ fontSize: 12, color: P.muted, margin: "4px 0 0" }}>
                          Prazo: <strong style={{ color: P.secondary }}>{dtype.label}</strong>
                        </p>
                      </div>
                    </div>
                  ))}
                </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Nav arrow button ── */
function NavBtn({ onClick, children, testId }: { onClick: () => void; children: React.ReactNode; testId: string }) {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} data-testid={testId}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ width: 34, height: 34, borderRadius: "50%", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: h ? "#eeeeed" : "transparent", color: "#1c1917", transition: "background 0.12s" }}>
      {children}
    </button>
  );
}
