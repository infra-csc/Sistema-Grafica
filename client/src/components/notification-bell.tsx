import { useState, useRef, useEffect } from "react";
import { Bell, Package, CheckCircle, AlertTriangle, Truck, FileText, ClipboardCheck, CalendarClock } from "lucide-react";

interface Notification {
  id: string;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: Date | string;
}

interface NotificationBellProps {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onViewAll?: () => void;
}

// ── Type config ───────────────────────────────────────────────────────────────
type TypeConfig = {
  Icon: React.ComponentType<{ style?: React.CSSProperties }>;
  border: string;
  bgRow: string;
  bgIcon: string;
  iconColor: string;
  label: string;
};

const TYPE_CONFIG: Record<string, TypeConfig> = {
  itemAdded: {
    Icon: Package,
    border: "#3b82f6", bgRow: "rgba(59,130,246,0.06)",
    bgIcon: "#dbeafe", iconColor: "#2563eb",
    label: "Estoque",
  },
  arteApproved: {
    Icon: CheckCircle,
    border: "#22c55e", bgRow: "rgba(34,197,94,0.06)",
    bgIcon: "#dcfce7", iconColor: "#16a34a",
    label: "Design",
  },
  deadlineAlert: {
    Icon: AlertTriangle,
    border: "#ef4444", bgRow: "rgba(239,68,68,0.06)",
    bgIcon: "#fee2e2", iconColor: "#dc2626",
    label: "Urgente",
  },
  itemDelivered: {
    Icon: Truck,
    border: "#a855f7", bgRow: "transparent",
    bgIcon: "#f3e8ff", iconColor: "#9333ea",
    label: "Entrega",
  },
  eventCompleted: {
    Icon: ClipboardCheck,
    border: "#22c55e", bgRow: "transparent",
    bgIcon: "#dcfce7", iconColor: "#16a34a",
    label: "Evento",
  },
  eventCreated: {
    Icon: FileText,
    border: "#06b6d4", bgRow: "transparent",
    bgIcon: "#cffafe", iconColor: "#0891b2",
    label: "Evento",
  },
  prazoAlert: {
    Icon: CalendarClock,
    border: "#f59e0b", bgRow: "rgba(245,158,11,0.06)",
    bgIcon: "#fef3c7", iconColor: "#d97706",
    label: "Prazo",
  },
};

const DEFAULT_CONFIG: TypeConfig = {
  Icon: Bell,
  border: "#a8a29e", bgRow: "transparent",
  bgIcon: "#e7e5e4", iconColor: "#78716c",
  label: "Sistema",
};

// ── Timestamp helper ──────────────────────────────────────────────────────────
function fmtTime(raw: Date | string): string {
  const d = new Date(raw);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) {
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  }
  if (diffDays === 1) return "Ontem";
  const day = d.getDate().toString().padStart(2, "0");
  const month = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][d.getMonth()];
  return `${day} ${month}`;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function NotificationBell({ notifications, onMarkAsRead, onViewAll }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const unread = notifications.filter((n) => !n.isRead);
  const unreadCount = unread.length;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleItem = (n: Notification) => {
    if (!n.isRead) onMarkAsRead(n.id);
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Bell trigger */}
      <button
        data-testid="button-notifications"
        onClick={() => setOpen((p) => !p)}
        style={{
          position: "relative",
          padding: 8,
          borderRadius: 6,
          border: "none",
          background: open ? "rgba(28,25,23,0.06)" : "transparent",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => { if (!open) (e.currentTarget as HTMLButtonElement).style.background = "rgba(28,25,23,0.05)"; }}
        onMouseLeave={(e) => { if (!open) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
      >
        <Bell style={{ width: 20, height: 20, color: "#57534e" }} />
        {unreadCount > 0 && (
          <span
            data-testid="badge-notification-count"
            style={{
              position: "absolute", top: 4, right: 4,
              backgroundColor: "#dc2626", color: "#ffffff",
              fontSize: 10, fontWeight: 700,
              height: 16, minWidth: 16, padding: "0 3px",
              borderRadius: 999, border: "2px solid #f9f9f8",
              display: "flex", alignItems: "center", justifyContent: "center",
              lineHeight: 1,
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Popover */}
      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 12px)", right: 0,
            width: 384, backgroundColor: "#ffffff",
            borderRadius: 12,
            boxShadow: "0 32px 64px -16px rgba(28,25,23,0.18)",
            border: "1px solid #f3f4f3",
            zIndex: 100, overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{
            padding: "14px 20px",
            backgroundColor: "#fafaf9",
            borderBottom: "1px solid #e7e5e4",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <h3 style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 11, fontWeight: 700,
              color: "#1c1917", textTransform: "uppercase", letterSpacing: "0.1em",
              margin: 0,
            }}>
              Alertas Recentes
            </h3>
            {unreadCount > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, color: "#c2410c",
                backgroundColor: "#fff7ed",
                padding: "2px 8px", borderRadius: 4,
                textTransform: "uppercase", letterSpacing: "0.05em",
              }}>
                {unreadCount} NÃO LIDA{unreadCount !== 1 ? "S" : ""}
              </span>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: 400, overflowY: "auto", overflowX: "hidden" }}>
            {notifications.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#746e69", fontSize: 13 }}>
                Nenhuma notificação
              </div>
            ) : (
              notifications.map((n) => {
                const cfg = TYPE_CONFIG[n.type] ?? DEFAULT_CONFIG;
                const Icon = cfg.Icon;
                const isDeadline = n.type === "deadlineAlert";
                return (
                  <div
                    key={n.id}
                    data-testid={`notification-${n.id}`}
                    onClick={() => handleItem(n)}
                    style={{
                      position: "relative",
                      display: "flex", alignItems: "flex-start", gap: 12,
                      padding: "14px 16px",
                      borderLeft: `4px solid ${cfg.border}`,
                      backgroundColor: !n.isRead ? cfg.bgRow : "transparent",
                      cursor: "pointer",
                      transition: "background-color 0.15s",
                      borderBottom: "1px solid #f3f4f3",
                    }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.backgroundColor = "#f9f9f8")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.backgroundColor = !n.isRead ? cfg.bgRow : "transparent")}
                  >
                    {/* Icon box */}
                    <div style={{
                      flexShrink: 0,
                      backgroundColor: cfg.bgIcon,
                      borderRadius: 8, padding: 8,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Icon style={{ width: 18, height: 18, color: cfg.iconColor } as React.CSSProperties} />
                    </div>

                    {/* Text */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: 12, fontWeight: !n.isRead ? 600 : 500,
                        color: isDeadline && !n.isRead ? "#b91c1c" : !n.isRead ? "#1c1917" : "#57534e",
                        margin: "0 0 3px 0", lineHeight: 1.4,
                      }}>
                        {n.message}
                      </p>
                      <p style={{
                        fontSize: 10, fontWeight: 500,
                        color: isDeadline && !n.isRead ? "#f87171" : "#746e69",
                        margin: 0,
                      }}>
                        {fmtTime(n.createdAt)} · {cfg.label}
                      </p>
                    </div>

                    {/* Unread dot */}
                    {!n.isRead && (
                      <div style={{
                        position: "absolute", right: 14, top: "50%",
                        transform: "translateY(-50%)",
                        width: 7, height: 7, borderRadius: "50%",
                        backgroundColor: "#3b82f6", flexShrink: 0,
                      }} />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "12px 20px",
            backgroundColor: "#1c1917",
            textAlign: "center",
          }}>
            <button
              data-testid="button-view-all-activities"
              onClick={() => { setOpen(false); onViewAll?.(); }}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 10, fontWeight: 700,
                color: "#d4d0ce", textTransform: "uppercase", letterSpacing: "0.12em",
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#f97316")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#d4d0ce")}
            >
              Ver Todas as Atividades
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
