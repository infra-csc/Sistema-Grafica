import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, AlertCircle, Calendar, Truck } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// Titanium palette
const TI = {
  bg: "#fafaf9",
  surface: "#ffffff",
  border: "#e7e5e4",
  text: "#1c1917",
  secondary: "#78716c",
  muted: "#a8a29e",
  accent: "#f97316",
};

// Priority → left-border color
const PRIORITY_COLOR: Record<string, string> = {
  urgente:   "#ef4444",
  alta:      "#f59e0b",
  media:     "#a855f7",
  baixa:     "#3b82f6",
  completed: "#22c55e",
  none:      "#d6d3d1",
};

const PRIORITY_LABEL: Record<string, string> = {
  urgente:   "Urgente",
  alta:      "Alta",
  media:     "Média",
  baixa:     "Baixa",
  completed: "Concluído",
  none:      "Sem prioridade",
};

function getPriorityKey(event: any): string {
  if (event.status === "completed") return "completed";
  return event.priority || "none";
}

const WEEK_DAYS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
const MONTH_NAMES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

export default function Calendario() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [, setLocation] = useLocation();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: events = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/events"] });

  const year  = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDay      = new Date(year, month, 1);
  const daysInMonth   = new Date(year, month + 1, 0).getDate();
  const startDow      = (firstDay.getDay() + 6) % 7; // Monday=0

  const days: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const getEventsForDate = (date: Date) => {
    const ds = date.toDateString();
    const starts = events
      .filter(e => new Date(e.startDate).toDateString() === ds)
      .map(e => ({ ...e, _type: "start" as const, _sort: new Date(e.startDate).getTime() }));
    const departures = events
      .filter(e => new Date(e.truckDepartureDate).toDateString() === ds)
      .map(e => ({ ...e, _type: "departure" as const, _sort: new Date(e.truckDepartureDate).getTime() }));
    return [...starts, ...departures].sort((a, b) => a._sort - b._sort);
  };

  const navBtn = (onClick: () => void, children: React.ReactNode, testId: string) => (
    <button
      onClick={onClick}
      data-testid={testId}
      style={{
        width: 32, height: 32, borderRadius: 8,
        border: `1px solid ${TI.border}`,
        backgroundColor: TI.surface,
        color: TI.text,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer",
      }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = TI.bg)}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = TI.surface)}
    >
      {children}
    </button>
  );

  const urgentEvents = events.filter(ev => {
    const hrs = (new Date(ev.truckDepartureDate).getTime() - Date.now()) / 3_600_000;
    return hrs > 0 && hrs < 48;
  }).sort((a, b) => new Date(a.truckDepartureDate).getTime() - new Date(b.truckDepartureDate).getTime());

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, backgroundColor: TI.bg, minHeight: "100%" }}>

      {/* Header */}
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: TI.text, margin: 0 }} data-testid="title-calendario">
          Calendário de Eventos
        </h1>
        <p style={{ fontSize: 12, color: TI.muted, margin: "2px 0 0" }}>
          Visualize os eventos e datas de saída dos caminhões
        </p>
      </div>

      {/* Main calendar card */}
      <div style={{
        backgroundColor: TI.surface,
        border: `1px solid ${TI.border}`,
        borderRadius: 12,
        overflow: "hidden",
      }}>

        {/* Navigation bar */}
        <div style={{
          padding: "14px 20px",
          borderBottom: `1px solid ${TI.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {navBtn(() => setCurrentDate(new Date(year, month - 1, 1)), <ChevronLeft style={{ width: 15, height: 15 }} />, "button-prev-month")}
            {navBtn(() => setCurrentDate(new Date(year, month + 1, 1)), <ChevronRight style={{ width: 15, height: 15 }} />, "button-next-month")}
            <h2 style={{ fontSize: 15, fontWeight: 700, color: TI.text, margin: 0 }}>
              {MONTH_NAMES[month]} {year}
            </h2>
          </div>
          <button
            onClick={() => setCurrentDate(new Date())}
            data-testid="button-today"
            style={{
              padding: "5px 12px", borderRadius: 8,
              border: `1px solid ${TI.border}`,
              backgroundColor: TI.surface, color: TI.text,
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = TI.bg)}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = TI.surface)}
          >
            Hoje
          </button>
        </div>

        {isLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {/* Day-of-week headers */}
            {WEEK_DAYS.map(d => (
              <div key={d} style={{
                padding: "8px 0",
                textAlign: "center",
                backgroundColor: TI.bg,
                borderBottom: `1px solid ${TI.border}`,
                fontSize: 10, fontWeight: 700,
                color: "#71717a",
                letterSpacing: "0.07em",
                textTransform: "uppercase",
              }}>
                {d}
              </div>
            ))}

            {/* Day cells */}
            {days.map((day, idx) => {
              if (day === null) {
                return (
                  <div key={`empty-${idx}`} style={{
                    minHeight: 90,
                    borderRight: (idx + 1) % 7 !== 0 ? `1px solid ${TI.border}` : undefined,
                    borderBottom: `1px solid ${TI.border}`,
                    backgroundColor: TI.bg,
                  }} />
                );
              }

              const date = new Date(year, month, day);
              const dayEvents = getEventsForDate(date);
              const isToday = date.toDateString() === new Date().toDateString();
              const hasEvents = dayEvents.length > 0;
              const col = (idx) % 7;

              return (
                <div
                  key={day}
                  data-testid={`calendar-day-${day}`}
                  onClick={() => { if (hasEvents) { setSelectedDate(date); setIsDialogOpen(true); } }}
                  style={{
                    minHeight: 90,
                    borderRight: col !== 6 ? `1px solid ${TI.border}` : undefined,
                    borderBottom: `1px solid ${TI.border}`,
                    backgroundColor: isToday ? "#fff7ed" : TI.surface,
                    cursor: hasEvents ? "pointer" : "default",
                    padding: "6px 7px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { if (hasEvents) (e.currentTarget.style.backgroundColor = TI.bg); }}
                  onMouseLeave={e => { (e.currentTarget.style.backgroundColor = isToday ? "#fff7ed" : TI.surface); }}
                >
                  {/* Day number */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                    <span style={{
                      fontSize: 12, fontWeight: isToday ? 800 : 500,
                      color: isToday ? TI.accent : TI.text,
                      lineHeight: 1,
                    }}>
                      {day}
                    </span>
                    {dayEvents.length > 0 && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: TI.muted,
                        backgroundColor: TI.bg, border: `1px solid ${TI.border}`,
                        borderRadius: 4, padding: "1px 4px",
                      }}>
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  {/* Event pills */}
                  {dayEvents.slice(0, 3).map(ev => {
                    const pk = getPriorityKey(ev);
                    const borderColor = PRIORITY_COLOR[pk];
                    const isStart = ev._type === "start";
                    const time = !isStart
                      ? new Date(ev.truckDepartureDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                      : null;

                    return (
                      <div
                        key={`${ev.id}-${ev._type}`}
                        data-testid={`event-${ev.id}-${ev._type}`}
                        onClick={e => { e.stopPropagation(); setLocation(`/eventos/${ev.id}`); }}
                        title={`${isStart ? "Início" : "Saída"}: ${ev.name}${time ? " — " + time : ""}`}
                        style={{
                          display: "flex", alignItems: "center", gap: 4,
                          backgroundColor: TI.surface,
                          border: `1px solid ${TI.border}`,
                          borderLeft: `3px solid ${borderColor}`,
                          borderRadius: 4,
                          padding: "2px 5px",
                          cursor: "pointer",
                          overflow: "hidden",
                        }}
                      >
                        {isStart
                          ? <Calendar style={{ width: 9, height: 9, color: TI.muted, flexShrink: 0 }} />
                          : <Truck    style={{ width: 9, height: 9, color: TI.muted, flexShrink: 0 }} />
                        }
                        <span style={{
                          fontSize: 10, color: TI.text, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                        }}>
                          {ev.name}
                        </span>
                        {time && (
                          <span style={{ fontSize: 9, color: TI.muted, whiteSpace: "nowrap", flexShrink: 0 }}>
                            {time}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <span style={{ fontSize: 9, color: TI.muted, paddingLeft: 4 }}>
                      +{dayEvents.length - 3} mais
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Legend footer */}
        <div style={{
          padding: "12px 20px",
          borderTop: `1px solid ${TI.border}`,
          backgroundColor: TI.bg,
          display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: TI.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Prioridade:
          </span>
          {[
            { key: "urgente", label: "Urgente" },
            { key: "alta",    label: "Alta" },
            { key: "media",   label: "Média" },
            { key: "baixa",   label: "Baixa" },
            { key: "completed", label: "Concluído" },
            { key: "none",    label: "Sem prioridade" },
          ].map(({ key, label }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: PRIORITY_COLOR[key] }} />
              <span style={{ fontSize: 11, color: TI.secondary }}>{label}</span>
            </div>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Calendar style={{ width: 11, height: 11, color: TI.muted }} />
              <span style={{ fontSize: 11, color: TI.secondary }}>Início</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Truck style={{ width: 11, height: 11, color: TI.muted }} />
              <span style={{ fontSize: 11, color: TI.secondary }}>Saída do caminhão</span>
            </div>
          </div>
        </div>
      </div>

      {/* Urgent alert strip */}
      {urgentEvents.length > 0 && (
        <div style={{
          backgroundColor: "#fff7ed",
          border: `1px solid #fed7aa`,
          borderRadius: 12,
          padding: "14px 20px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <AlertCircle style={{ width: 16, height: 16, color: TI.accent }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#9a3412" }}>
              {urgentEvents.length} evento{urgentEvents.length > 1 ? "s" : ""} com saída do caminhão nas próximas 48h
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {urgentEvents.map(ev => {
              const dep = new Date(ev.truckDepartureDate);
              const hrs = Math.floor((dep.getTime() - Date.now()) / 3_600_000);
              const mins = Math.floor(((dep.getTime() - Date.now()) % 3_600_000) / 60_000);
              const isCritical = hrs < 24;
              return (
                <div
                  key={ev.id}
                  data-testid={`alert-${ev.id}`}
                  onClick={() => setLocation(`/eventos/${ev.id}`)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 12px",
                    backgroundColor: isCritical ? "#fee2e2" : TI.surface,
                    border: `1px solid ${isCritical ? "#fca5a5" : TI.border}`,
                    borderRadius: 8, cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Truck style={{ width: 14, height: 14, color: isCritical ? "#dc2626" : TI.accent }} />
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: TI.text, margin: 0 }}>{ev.name}</p>
                      <p style={{ fontSize: 11, color: TI.muted, margin: 0 }}>
                        Saída: {dep.toLocaleDateString("pt-BR")} às {dep.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 700,
                    color: isCritical ? "#dc2626" : "#c2410c",
                    backgroundColor: isCritical ? "#fee2e2" : "#fff7ed",
                    border: `1px solid ${isCritical ? "#fca5a5" : "#fed7aa"}`,
                    borderRadius: 6, padding: "3px 8px",
                  }}>
                    {hrs}h {mins}min
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Day detail dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle style={{ fontSize: 15, fontWeight: 700, color: TI.text, display: "flex", alignItems: "center", gap: 8 }}>
              <Calendar style={{ width: 16, height: 16, color: TI.accent }} />
              {selectedDate?.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </DialogTitle>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            {selectedDate && getEventsForDate(selectedDate).map(ev => {
              const pk = getPriorityKey(ev);
              const borderColor = PRIORITY_COLOR[pk];
              const isStart = ev._type === "start";
              const dateTime = isStart ? new Date(ev.startDate) : new Date(ev.truckDepartureDate);

              return (
                <div
                  key={`${ev.id}-${ev._type}`}
                  data-testid={`dialog-event-${ev.id}-${ev._type}`}
                  onClick={() => { setIsDialogOpen(false); setLocation(`/eventos/${ev.id}`); }}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 12,
                    padding: "12px 14px",
                    backgroundColor: TI.surface,
                    border: `1px solid ${TI.border}`,
                    borderLeft: `4px solid ${borderColor}`,
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = TI.bg)}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = TI.surface)}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    backgroundColor: TI.bg, border: `1px solid ${TI.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {isStart
                      ? <Calendar style={{ width: 15, height: 15, color: TI.secondary }} />
                      : <Truck    style={{ width: 15, height: 15, color: TI.secondary }} />
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: TI.text, margin: 0 }}>{ev.name}</p>
                      <span style={{
                        fontSize: 10, fontWeight: 600, whiteSpace: "nowrap",
                        color: TI.secondary,
                        backgroundColor: TI.bg, border: `1px solid ${TI.border}`,
                        borderRadius: 4, padding: "2px 6px",
                      }}>
                        {PRIORITY_LABEL[pk]}
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: TI.muted, margin: "4px 0 0" }}>
                      {isStart ? "Início do evento: " : "Saída do caminhão: "}
                      <strong style={{ color: TI.secondary }}>
                        {dateTime.toLocaleDateString("pt-BR")}
                        {!isStart && ` às ${dateTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
                      </strong>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
