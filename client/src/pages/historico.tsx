import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Calendar, Package, FileCheck, Plus, Activity, Search, Truck, Clock,
} from "lucide-react";
import { useLocation } from "wouter";
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
  graphite: "#44403c",
};

interface TimelineEvent {
  id: string;
  type: "event_created" | "item_created" | "item_approved" | "production_started" | "item_delivered";
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

const ACTION_CONFIG: Record<string, { label: string; dot: string; icon: any; entityType: "Evento" | "Item" }> = {
  event_created:      { label: "Evento Criado",    dot: TI.accent,    icon: Calendar,  entityType: "Evento" },
  item_created:       { label: "Item Adicionado",  dot: TI.graphite,  icon: Plus,      entityType: "Item" },
  item_approved:      { label: "Item Liberado",    dot: "#16a34a",    icon: FileCheck, entityType: "Item" },
  production_started: { label: "Em Produção",      dot: "#2563eb",    icon: Package,   entityType: "Item" },
  item_delivered:     { label: "Item Entregue",    dot: "#7c3aed",    icon: Truck,     entityType: "Item" },
};

function getInitials(name: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0].toUpperCase())
    .join("");
}

function UserAvatar({ name }: { name?: string }) {
  const initials = getInitials(name || "");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <div style={{
        width: 24, height: 24, borderRadius: "50%",
        backgroundColor: "#f5f5f4",
        border: `1px solid ${TI.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, fontWeight: 700, color: TI.text,
        flexShrink: 0, letterSpacing: "0.02em",
      }}>
        {initials}
      </div>
      <span style={{ fontSize: 12, color: TI.secondary, whiteSpace: "nowrap" }}>{name || "—"}</span>
    </div>
  );
}

export default function Historico() {
  const [, setLocation] = useLocation();
  const [eventFilter, setEventFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");

  const { data: events = [] } = useQuery<any[]>({ queryKey: ["/api/events"] });
  const { data: items = [] }  = useQuery<any[]>({ queryKey: ["/api/items"] });
  const { data: auditLogs = [] } = useQuery<any[]>({ queryKey: ["/api/audit-logs"] });

  const auditLogMap = new Map<string, any>();
  auditLogs.forEach(log => auditLogMap.set(`${log.entityId}-${log.action}`, log));

  const timeline: TimelineEvent[] = [];

  events.forEach(event => {
    const log = auditLogMap.get(`${event.id}-created`);
    timeline.push({
      id: `event-${event.id}`,
      type: "event_created",
      timestamp: new Date(event.createdAt),
      eventName: event.name,
      eventId: event.id,
      userName: log?.userName,
    });
  });

  items.forEach(item => {
    const event = events.find(e => e.id === item.eventId);
    const eventName = event?.name || "Evento desconhecido";

    const createdLog = auditLogMap.get(`${item.id}-created`);
    timeline.push({
      id: `item-created-${item.id}`,
      type: "item_created",
      timestamp: new Date(item.createdAt),
      eventName,
      eventId: item.eventId,
      itemType: item.type,
      itemId: item.id,
      itemDisplayId: item.displayId,
      quantity: item.quantity,
      userName: createdLog?.userName,
    });

    if (["approved", "inProduction", "produced", "delivered"].includes(item.status)) {
      const approvedLog = auditLogMap.get(`${item.id}-approved`);
      timeline.push({
        id: `item-approved-${item.id}`,
        type: "item_approved",
        timestamp: new Date(item.approvedAt || item.updatedAt),
        eventName,
        eventId: item.eventId,
        itemType: item.type,
        itemId: item.id,
        itemDisplayId: item.displayId,
        quantity: item.quantity,
        userName: approvedLog?.userName,
      });
    }

    if (item.quantityProduced && item.quantityProduced > 0) {
      timeline.push({
        id: `production-${item.id}`,
        type: "production_started",
        timestamp: new Date(item.productionStartedAt || item.updatedAt),
        eventName,
        eventId: item.eventId,
        itemType: item.type,
        itemId: item.id,
        itemDisplayId: item.displayId,
        quantity: item.quantity,
        quantityProduced: item.quantityProduced,
      });
    }

    if (item.status === "delivered" && item.deliveredAt) {
      const deliveredLog = auditLogMap.get(`${item.id}-delivered`);
      timeline.push({
        id: `delivered-${item.id}`,
        type: "item_delivered",
        timestamp: new Date(item.deliveredAt),
        eventName,
        eventId: item.eventId,
        itemType: item.type,
        itemId: item.id,
        itemDisplayId: item.displayId,
        receivedBy: item.receivedBy,
        userName: deliveredLog?.userName,
      });
    }
  });

  const sorted = timeline.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

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

  const getDescription = (e: TimelineEvent) => {
    switch (e.type) {
      case "event_created":
        return <>Evento <strong style={{ color: TI.text }}>{e.eventName}</strong> foi criado</>;
      case "item_created":
        return (
          <>
            <span style={{ fontFamily: "monospace", fontWeight: 700, color: TI.accent }}>{e.itemDisplayId}</span>{" "}
            <strong style={{ color: TI.text }}>{e.itemType}</strong> ({e.quantity} un.) adicionado ao evento{" "}
            <strong style={{ color: TI.text }}>{e.eventName}</strong>
          </>
        );
      case "item_approved":
        return (
          <>
            <span style={{ fontFamily: "monospace", fontWeight: 700, color: TI.accent }}>{e.itemDisplayId}</span>{" "}
            <strong style={{ color: TI.text }}>{e.itemType}</strong> de{" "}
            <strong style={{ color: TI.text }}>{e.eventName}</strong> liberado para produção
          </>
        );
      case "production_started":
        return (
          <>
            Produção de{" "}
            <span style={{ fontFamily: "monospace", fontWeight: 700, color: TI.accent }}>{e.itemDisplayId}</span>{" "}
            <strong style={{ color: TI.text }}>{e.itemType}</strong> — {e.quantityProduced}/{e.quantity} un.
          </>
        );
      case "item_delivered":
        return (
          <>
            <span style={{ fontFamily: "monospace", fontWeight: 700, color: TI.accent }}>{e.itemDisplayId}</span>{" "}
            <strong style={{ color: TI.text }}>{e.itemType}</strong> de{" "}
            <strong style={{ color: TI.text }}>{e.eventName}</strong> entregue
            {e.receivedBy && <> para <strong style={{ color: TI.text }}>{e.receivedBy}</strong></>}
          </>
        );
      default:
        return "Atividade registrada";
    }
  };

  return (
    <div style={{ backgroundColor: TI.bg, minHeight: "100%", padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ backgroundColor: TI.accent, borderRadius: 8, padding: "6px 8px", display: "flex" }}>
          <Activity style={{ color: "#fff", width: 18, height: 18 }} />
        </div>
        <div>
          <h1 style={{ color: TI.text, fontSize: 18, fontWeight: 700, margin: 0 }}>
            Histórico de Atividades
          </h1>
          <p style={{ color: TI.muted, fontSize: 12, margin: 0 }}>Audit log completo de todas as ações do sistema</p>
        </div>
      </div>

      {/* Card principal */}
      <div style={{
        backgroundColor: TI.surface,
        border: `1px solid ${TI.border}`,
        borderRadius: 12,
        overflow: "hidden",
      }}>

        {/* Filtros */}
        <div style={{
          padding: "14px 20px",
          borderBottom: `1px solid ${TI.border}`,
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
        }}>
          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
            <Search style={{
              position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
              width: 14, height: 14, color: TI.muted, pointerEvents: "none",
            }} />
            <input
              placeholder="Buscar por evento, usuário, item..."
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              data-testid="input-search-filter"
              style={{
                width: "100%", paddingLeft: 32, paddingRight: 12, paddingTop: 7, paddingBottom: 7,
                backgroundColor: TI.bg, border: `1px solid ${TI.border}`, borderRadius: 8,
                fontSize: 12, color: TI.text, outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-44" data-testid="select-action-filter"
              style={{ backgroundColor: TI.bg, borderColor: TI.border, fontSize: 12 }}>
              <SelectValue placeholder="Tipo de ação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as ações</SelectItem>
              <SelectItem value="event_created">Eventos criados</SelectItem>
              <SelectItem value="item_created">Itens adicionados</SelectItem>
              <SelectItem value="item_approved">Itens liberados</SelectItem>
              <SelectItem value="production_started">Em produção</SelectItem>
              <SelectItem value="item_delivered">Entregas</SelectItem>
            </SelectContent>
          </Select>

          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger className="w-44" data-testid="select-event-filter"
              style={{ backgroundColor: TI.bg, borderColor: TI.border, fontSize: 12 }}>
              <SelectValue placeholder="Filtrar por evento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os eventos</SelectItem>
              {events.map(ev => (
                <SelectItem key={ev.id} value={ev.id}>{ev.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span style={{ marginLeft: "auto", fontSize: 11, color: TI.muted, whiteSpace: "nowrap" }}>
            {filtered.length} registro{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px", color: TI.muted }}>
            <Activity style={{ width: 36, height: 36, margin: "0 auto 12px", opacity: 0.4 }} />
            <p style={{ fontSize: 14, fontWeight: 500, color: TI.secondary }}>Nenhuma atividade encontrada</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>Tente ajustar os filtros</p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: TI.bg, borderBottom: `1px solid ${TI.border}` }}>
                {["Tipo", "Ação", "Data / Hora", "Realizado por"].map(h => (
                  <th key={h} style={{
                    padding: "9px 16px",
                    textAlign: "left",
                    fontSize: 10, fontWeight: 600,
                    color: "#71717a",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    whiteSpace: "nowrap",
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, idx) => {
                const cfg = ACTION_CONFIG[entry.type] ?? {
                  label: "Atividade", dot: TI.muted, icon: Clock, entityType: "Item" as const,
                };
                const Icon = cfg.icon;
                const isLast = idx === filtered.length - 1;

                return (
                  <tr
                    key={entry.id}
                    data-testid={`timeline-event-${idx}`}
                    onClick={() => setLocation(`/eventos/${entry.eventId}`)}
                    style={{
                      borderBottom: isLast ? "none" : `1px solid ${TI.border}`,
                      cursor: "pointer",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = TI.bg)}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    {/* Tipo */}
                    <td style={{ padding: "11px 16px", whiteSpace: "nowrap" }}>
                      <div style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        backgroundColor: TI.surface,
                        border: `1px solid ${TI.border}`,
                        borderRadius: 6,
                        padding: "3px 8px",
                      }}>
                        <div style={{
                          width: 6, height: 6, borderRadius: "50%",
                          backgroundColor: cfg.dot, flexShrink: 0,
                        }} />
                        <span style={{ fontSize: 11, fontWeight: 500, color: TI.text }}>{cfg.label}</span>
                      </div>
                    </td>

                    {/* Ação */}
                    <td style={{ padding: "11px 16px", fontSize: 12, color: TI.secondary, maxWidth: 480 }}>
                      {getDescription(entry)}
                    </td>

                    {/* Data / Hora */}
                    <td style={{ padding: "11px 16px", whiteSpace: "nowrap" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: TI.text }}>
                        {format(entry.timestamp, "dd/MM/yyyy", { locale: ptBR })}
                      </div>
                      <div style={{ fontSize: 11, color: TI.muted, marginTop: 1 }}>
                        {format(entry.timestamp, "HH:mm", { locale: ptBR })}
                      </div>
                    </td>

                    {/* Realizado por */}
                    <td style={{ padding: "11px 16px" }}>
                      <UserAvatar name={entry.userName} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
