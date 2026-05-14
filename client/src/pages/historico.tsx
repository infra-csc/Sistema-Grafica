import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar, Package, FileCheck, Plus, Activity, Search, Truck, Clock,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

/* ── Palette ── */
const P = {
  bg:      "#fafaf9",
  surface: "#ffffff",
  border:  "#e7e5e4",
  text:    "#1c1917",
  second:  "#78716c",
  muted:   "#a8a29e",
  accent:  "#f97316",
};

/* ── Type pill config ── */
const TYPE_CONFIG: Record<string, {
  label: string; dot: string; bg: string; border: string; color: string;
  icon: any;
}> = {
  event_created: {
    label: "Evento Criado", dot: "#dc2626", bg: "#fef2f2", border: "#fecaca", color: "#b91c1c",
    icon: Calendar,
  },
  item_created: {
    label: "Peça Adicionada", dot: "#f97316", bg: "#fff7ed", border: "#fed7aa", color: "#f97316",
    icon: Plus,
  },
  item_approved: {
    label: "Peça Liberada", dot: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", color: "#15803d",
    icon: FileCheck,
  },
  production_started: {
    label: "Em Produção", dot: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe", color: "#1d4ed8",
    icon: Package,
  },
  item_delivered: {
    label: "Peça Entregue", dot: "#9333ea", bg: "#faf5ff", border: "#e9d5ff", color: "#7e22ce",
    icon: Truck,
  },
};

const DEFAULT_CFG = {
  label: "atividade", dot: P.muted, bg: "#f5f5f4", border: P.border, color: P.second,
  icon: Clock,
};

const PAGE_SIZE = 25;

/* ── Initials helper ── */
function getInitials(name: string) {
  return (name || "?")
    .split(" ").filter(Boolean).slice(0, 2)
    .map(n => n[0].toUpperCase()).join("");
}

/* ── User avatar ── */
function UserAvatar({ name }: { name?: string }) {
  const initials = getInitials(name || "");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        backgroundColor: "#e8e8e7",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, fontWeight: 800, color: P.text,
        flexShrink: 0, letterSpacing: "0.02em",
      }}>
        {initials}
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: P.text, whiteSpace: "nowrap" }}>
        {name || "—"}
      </span>
    </div>
  );
}

interface TimelineEvent {
  id: string;
  type: string;
  timestamp: Date;
  eventName: string;
  eventId: string;
  itemType?: string;
  itemId?: string;
  itemDisplayId?: string;
  quantity?: number;
  quantityProduced?: number;
  receivedBy?: string;
  userName?: string;
}

/* ── Description builder ── */
function buildDescription(e: TimelineEvent) {
  const ID = e.itemDisplayId
    ? <code style={{ fontFamily: "monospace", fontWeight: 700, color: P.second, fontSize: 12 }}>{e.itemDisplayId}</code>
    : null;

  switch (e.type) {
    case "event_created":
      return <span>Evento <strong style={{ color: P.text }}>{e.eventName}</strong> foi criado</span>;
    case "item_created":
      return <span>{ID} <strong style={{ color: P.text }}>{e.itemType}</strong> ({e.quantity} un.) adicionado ao evento <strong style={{ color: P.text }}>{e.eventName}</strong></span>;
    case "item_approved":
      return <span>{ID} <strong style={{ color: P.text }}>{e.itemType}</strong> de <strong style={{ color: P.text }}>{e.eventName}</strong> liberado para produção</span>;
    case "production_started":
      return <span>Produção de {ID} <strong style={{ color: P.text }}>{e.itemType}</strong> — {e.quantityProduced}/{e.quantity} un.</span>;
    case "item_delivered":
      return (
        <span>
          {ID} <strong style={{ color: P.text }}>{e.itemType}</strong> de <strong style={{ color: P.text }}>{e.eventName}</strong> entregue
          {e.receivedBy && <> para <strong style={{ color: P.text }}>{e.receivedBy}</strong></>}
        </span>
      );
    default:
      return <span>Atividade registrada</span>;
  }
}

export default function Historico() {
  const [, setLocation] = useLocation();
  const [eventFilter, setEventFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [page, setPage] = useState(1);

  const { data: events = [] } = useQuery<any[]>({ queryKey: ["/api/events"] });
  const { data: items = [] }  = useQuery<any[]>({ queryKey: ["/api/items"] });
  const { data: auditLogs = [] } = useQuery<any[]>({ queryKey: ["/api/audit-logs"] });

  /* ── Build timeline ── */
  const auditLogMap = new Map<string, any>();
  auditLogs.forEach(log => auditLogMap.set(`${log.entityId}-${log.action}`, log));

  const timeline: TimelineEvent[] = [];

  events.forEach(event => {
    const log = auditLogMap.get(`${event.id}-created`);
    timeline.push({
      id: `event-${event.id}`, type: "event_created",
      timestamp: new Date(event.createdAt),
      eventName: event.name, eventId: event.id,
      userName: log?.userName,
    });
  });

  items.forEach(item => {
    const event = events.find(e => e.id === item.eventId);
    const eventName = event?.name || "Evento desconhecido";
    const createdLog = auditLogMap.get(`${item.id}-created`);

    timeline.push({
      id: `item-created-${item.id}`, type: "item_created",
      timestamp: new Date(item.createdAt),
      eventName, eventId: item.eventId,
      itemType: item.type, itemId: item.id, itemDisplayId: item.displayId,
      quantity: item.quantity, userName: createdLog?.userName,
    });

    if (["approved", "inProduction", "produced", "delivered"].includes(item.status)) {
      const log = auditLogMap.get(`${item.id}-approved`);
      timeline.push({
        id: `item-approved-${item.id}`, type: "item_approved",
        timestamp: new Date(item.approvedAt || item.updatedAt),
        eventName, eventId: item.eventId,
        itemType: item.type, itemId: item.id, itemDisplayId: item.displayId,
        quantity: item.quantity, userName: log?.userName,
      });
    }

    if (item.quantityProduced && item.quantityProduced > 0) {
      timeline.push({
        id: `production-${item.id}`, type: "production_started",
        timestamp: new Date(item.productionStartedAt || item.updatedAt),
        eventName, eventId: item.eventId,
        itemType: item.type, itemId: item.id, itemDisplayId: item.displayId,
        quantity: item.quantity, quantityProduced: item.quantityProduced,
      });
    }

    if (item.status === "delivered" && item.deliveredAt) {
      const log = auditLogMap.get(`${item.id}-delivered`);
      timeline.push({
        id: `delivered-${item.id}`, type: "item_delivered",
        timestamp: new Date(item.deliveredAt),
        eventName, eventId: item.eventId,
        itemType: item.type, itemId: item.id, itemDisplayId: item.displayId,
        receivedBy: item.receivedBy, userName: log?.userName,
      });
    }
  });

  const sorted = timeline.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  /* ── Filters ── */
  let filtered = eventFilter === "all" ? sorted : sorted.filter(e => e.eventId === eventFilter);
  if (actionFilter !== "all") filtered = filtered.filter(e => e.type === actionFilter);
  if (searchFilter.trim()) {
    const q = searchFilter.toLowerCase();
    filtered = filtered.filter(e =>
      e.eventName.toLowerCase().includes(q) ||
      e.userName?.toLowerCase().includes(q) ||
      e.itemType?.toLowerCase().includes(q) ||
      e.itemDisplayId?.toLowerCase().includes(q) ||
      e.receivedBy?.toLowerCase().includes(q)
    );
  }

  /* ── Pagination ── */
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const pageItems  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleFilterChange = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  /* page buttons: show at most 5 */
  const pageWindow: number[] = [];
  const start = Math.max(1, safePage - 2);
  const end   = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) pageWindow.push(i);

  /* ── Select style helper ── */
  const selectStyle: React.CSSProperties = {
    backgroundColor: "#ffffff", border: "none", borderRadius: 8,
    padding: "9px 14px", fontSize: 13, fontWeight: 600,
    color: P.text, cursor: "pointer", outline: "none",
    appearance: "none", WebkitAppearance: "none", minWidth: 168,
  };

  return (
    <div style={{ backgroundColor: P.bg, height: "100%", overflowY: "auto", padding: "28px 28px 48px" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 20, marginBottom: 32 }}>
        <div style={{
          width: 56, height: 56, flexShrink: 0,
          backgroundColor: "#fff7ed",
          borderRadius: 14,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 1px 4px rgba(249,115,22,0.18)",
        }}>
          <Activity style={{ width: 28, height: 28, color: P.accent }} />
        </div>
        <div>
          <h1 style={{
            fontSize: 32, fontWeight: 700, color: P.text, margin: 0,
            letterSpacing: "-0.02em", fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1.1,
          }}>
            Histórico de Atividades
          </h1>
          <p style={{ fontSize: 13, color: P.second, margin: "6px 0 0", fontWeight: 500 }}>
            Audit log completo de todas as ações do sistema
          </p>
        </div>
      </div>

      {/* ── Card ── */}
      <div style={{ backgroundColor: P.surface, border: `1px solid ${P.border}`, borderRadius: 12, overflow: "hidden" }}>

        {/* Filter strip */}
        <div style={{
          padding: "20px 24px",
          borderBottom: `1px solid ${P.border}`,
          backgroundColor: "#f3f4f3",
          display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center",
        }}>

          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
            <Search style={{
              position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)",
              width: 14, height: 14, color: P.muted, pointerEvents: "none",
            }} />
            <input
              placeholder="Buscar por ID, evento ou usuário..."
              value={searchFilter}
              onChange={e => { setSearchFilter(e.target.value); setPage(1); }}
              data-testid="input-search-filter"
              style={{
                width: "100%", paddingLeft: 34, paddingRight: 12, paddingTop: 9, paddingBottom: 9,
                backgroundColor: "#ffffff", border: "none", borderRadius: 8,
                fontSize: 13, color: P.text, outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Action type select */}
          <select
            value={actionFilter}
            onChange={e => handleFilterChange(setActionFilter)(e.target.value)}
            data-testid="select-action-filter"
            style={selectStyle}
          >
            <option value="all">Todas as ações</option>
            <option value="event_created">Eventos criados</option>
            <option value="item_created">Itens adicionados</option>
            <option value="item_approved">Itens liberados</option>
            <option value="production_started">Em produção</option>
            <option value="item_delivered">Entregas</option>
          </select>

          {/* Event select */}
          <select
            value={eventFilter}
            onChange={e => handleFilterChange(setEventFilter)(e.target.value)}
            data-testid="select-event-filter"
            style={selectStyle}
          >
            <option value="all">Todos os eventos</option>
            {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>

          {/* Counter chip */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            backgroundColor: "#e8e8e7", borderRadius: 8, padding: "9px 14px",
            marginLeft: "auto",
          }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: P.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Total</span>
            <span style={{ fontSize: 14, fontWeight: 900, color: P.accent }}>{filtered.length}</span>
          </div>
        </div>

        {/* Table header */}
        <div style={{
          display: "grid", gridTemplateColumns: "2fr 5fr 2fr 3fr",
          padding: "14px 32px",
          backgroundColor: "#f3f4f3",
          borderBottom: `1px solid ${P.border}`,
        }}>
          {["Tipo", "Ação", "Data / Hora", "Realizado Por"].map(h => (
            <div key={h} style={{ fontSize: 10, fontWeight: 900, color: P.muted, textTransform: "uppercase", letterSpacing: "0.12em" }}>
              {h}
            </div>
          ))}
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", textAlign: "center" }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", backgroundColor: "#e8e8e7", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, opacity: 0.5 }}>
              <Search style={{ width: 32, height: 32, color: P.muted }} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: P.text, margin: "0 0 8px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.01em" }}>
              Nenhuma atividade encontrada
            </h3>
            <p style={{ fontSize: 13, color: P.second, margin: 0 }}>Tente ajustar os filtros para encontrar o que procura</p>
          </div>
        ) : (
          <div style={{ borderBottom: `1px solid ${P.border}` }}>
            {pageItems.map((entry, idx) => {
              const cfg = TYPE_CONFIG[entry.type] ?? DEFAULT_CFG;
              const isLast = idx === pageItems.length - 1;

              return (
                <div
                  key={entry.id}
                  data-testid={`timeline-event-${idx}`}
                  onClick={() => setLocation(`/eventos/${entry.eventId}`)}
                  style={{
                    display: "grid", gridTemplateColumns: "2fr 5fr 2fr 3fr",
                    padding: "18px 32px", alignItems: "center",
                    borderBottom: isLast ? "none" : `1px solid #f0efee`,
                    cursor: "pointer", transition: "background 0.1s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f9f9f8")}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  {/* Tipo pill */}
                  <div>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "4px 10px", borderRadius: 100,
                      backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`,
                      fontSize: 9, fontWeight: 800, color: cfg.color,
                      textTransform: "uppercase", letterSpacing: "0.04em",
                      whiteSpace: "nowrap",
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: cfg.dot, flexShrink: 0 }} />
                      {cfg.label}
                    </span>
                  </div>

                  {/* Ação */}
                  <div style={{ fontSize: 13, color: P.second, paddingRight: 16, lineHeight: 1.45 }}>
                    {buildDescription(entry)}
                  </div>

                  {/* Data / Hora */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: P.text }}>
                      {format(entry.timestamp, "dd MMM, HH:mm", { locale: ptBR })}
                    </div>
                    <div style={{ fontSize: 10, color: P.muted, marginTop: 2 }}>
                      {format(entry.timestamp, "yyyy", { locale: ptBR })}
                    </div>
                  </div>

                  {/* Realizado por */}
                  <div>
                    <UserAvatar name={entry.userName} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer pagination */}
        {filtered.length > 0 && (
          <div style={{
            padding: "14px 32px",
            backgroundColor: "#f3f4f3",
            borderTop: `1px solid ${P.border}`,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          }}>
            <span style={{ fontSize: 12, color: P.second }}>
              Exibindo <strong style={{ color: P.text }}>{Math.min((safePage - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(safePage * PAGE_SIZE, filtered.length)}</strong> de <strong style={{ color: P.text }}>{filtered.length}</strong> registros
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {/* Prev */}
              <PageBtn
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                testId="button-prev-page"
              >
                <ChevronLeft style={{ width: 14, height: 14 }} />
              </PageBtn>

              {/* Page numbers */}
              {pageWindow.map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  data-testid={`button-page-${p}`}
                  style={{
                    padding: "4px 10px", borderRadius: 6, border: "none",
                    fontSize: 12, fontWeight: p === safePage ? 900 : 700,
                    cursor: "pointer",
                    backgroundColor: p === safePage ? P.accent : "transparent",
                    color: p === safePage ? "#ffffff" : P.second,
                    transition: "all 0.12s",
                    minWidth: 32,
                  }}
                  onMouseEnter={e => { if (p !== safePage) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#e8e8e7"; }}
                  onMouseLeave={e => { if (p !== safePage) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                >
                  {p}
                </button>
              ))}

              {/* Next */}
              <PageBtn
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                testId="button-next-page"
              >
                <ChevronRight style={{ width: 14, height: 14 }} />
              </PageBtn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Pagination arrow button ── */
function PageBtn({ onClick, disabled, children, testId }: {
  onClick: () => void; disabled: boolean; children: React.ReactNode; testId: string;
}) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        padding: 6, borderRadius: 6, border: "none", cursor: disabled ? "default" : "pointer",
        backgroundColor: h && !disabled ? "#e8e8e7" : "transparent",
        color: disabled ? "#d4d0cc" : "#57534e",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.12s", opacity: disabled ? 0.35 : 1,
      }}
    >
      {children}
    </button>
  );
}
