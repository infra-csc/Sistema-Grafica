import { useState, useRef, useEffect } from "react";
import { Bell, Package, CheckCircle, AlertTriangle, Truck, FileText, ClipboardCheck, CalendarClock, PlusCircle, MinusCircle } from "lucide-react";

export interface Notification {
  id: string;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: Date | string;
  // Vêm do servidor e permitem navegar até o contexto da notificação.
  eventId?: string | null;
  itemId?: string | null;
}

interface NotificationBellProps {
  notifications: Notification[];
  isLoading?: boolean;
  isError?: boolean;
  /** Recarrega a query de notificações (estado de erro). */
  onRetry?: () => void;
  onMarkAsRead: (id: string) => void;
  /** Marca todas de uma vez (1 PATCH em lote no App, não N chamadas). */
  onMarkAllRead?: () => void;
  /** true enquanto o PATCH read-all está em voo (desabilita "Marcar todas"). */
  isMarkingAll?: boolean;
  onViewAll?: () => void;
  /** Navega até o evento/item da notificação (definido pelo App). */
  onOpen?: (n: Notification) => void;
}

// ── Type config ───────────────────────────────────────────────────────────────
type TypeConfig = {
  Icon: React.ComponentType<{ style?: React.CSSProperties }>;
  border: string;
  bgIcon: string;
  iconColor: string;
  label: string;
};

const TYPE_CONFIG: Record<string, TypeConfig> = {
  itemAdded: {
    Icon: Package,
    border: "#3b82f6",
    bgIcon: "#dbeafe", iconColor: "#2563eb",
    label: "Estoque",
  },
  arteApproved: {
    Icon: CheckCircle,
    border: "#22c55e",
    bgIcon: "#dcfce7", iconColor: "#16a34a",
    label: "Design",
  },
  deadlineAlert: {
    Icon: AlertTriangle,
    border: "#ef4444",
    bgIcon: "#fee2e2", iconColor: "#dc2626",
    label: "Urgente",
  },
  itemDelivered: {
    Icon: Truck,
    border: "#a855f7",
    bgIcon: "#f3e8ff", iconColor: "#9333ea",
    label: "Entrega",
  },
  eventCompleted: {
    Icon: ClipboardCheck,
    border: "#22c55e",
    bgIcon: "#dcfce7", iconColor: "#16a34a",
    label: "Evento",
  },
  eventCreated: {
    Icon: FileText,
    border: "#06b6d4",
    bgIcon: "#cffafe", iconColor: "#0891b2",
    label: "Evento",
  },
  prazoAlert: {
    Icon: CalendarClock,
    border: "#f59e0b",
    bgIcon: "#fef3c7", iconColor: "#d97706",
    label: "Prazo",
  },
  // COMPLEMENTO — aumento de quantidade depois que a peça entrou em produção.
  // É trabalho NOVO para quem imprime, então precisa da identidade laranja da
  // fila da Gráfica e não do cinza genérico de "Sistema": este é o aviso que
  // faz alguém ligar a máquina de novo. #c2410c no ícone (não #f97316, que
  // reprova contraste); #f97316 fica só na borda, que é fundo.
  complementCreated: {
    Icon: PlusCircle,
    border: "#f97316",
    bgIcon: "#fff7ed", iconColor: "#c2410c",
    label: "Complemento",
  },
  complementCanceled: {
    Icon: MinusCircle,
    border: "#ef4444",
    bgIcon: "#fef2f2", iconColor: "#b91c1c",
    label: "Compl. cancelado",
  },
  // Redução de quantidade numa peça já em produção: não cria trabalho, mas a
  // Gráfica precisa saber ANTES de imprimir a mais.
  quantityReduced: {
    Icon: MinusCircle,
    border: "#f59e0b",
    bgIcon: "#fef3c7", iconColor: "#92400e",
    label: "Quantidade",
  },
};

const DEFAULT_CONFIG: TypeConfig = {
  Icon: Bell,
  border: "#a8a29e",
  bgIcon: "#e7e5e4", iconColor: "#746e69",
  label: "Sistema",
};

// "Não lida" era um fundo por categoria (cfg.bgRow): metade dos tipos tinha
// fundo transparent e não-lidas passavam por lidas. Agora TODA não lida usa o
// mesmo âmbar; a categoria segue na borda esquerda.
const UNREAD_BG = "#fffbf5";

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

// ── Skeleton (popover carregando) ─────────────────────────────────────────────
function SkeletonRows() {
  return (
    <div aria-hidden="true" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="animate-pulse" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: "#f5f5f4", flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ height: 10, borderRadius: 4, backgroundColor: "#f5f5f4", width: "85%" }} />
            <div style={{ height: 8, borderRadius: 4, backgroundColor: "#f5f5f4", width: "45%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export function NotificationBell({
  notifications,
  isLoading = false,
  isError = false,
  onRetry,
  onMarkAsRead,
  onMarkAllRead,
  isMarkingAll = false,
  onViewAll,
  onOpen,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Depois de "Marcar todas", o botão que tinha o foco some junto com o
  // contador — sem isto o foco caía no body.
  const pendingFocusAfterMarkAll = useRef(false);
  const unread = notifications.filter((n) => !n.isRead);
  const unreadCount = unread.length;

  // Fechamentos programáticos devolvem o foco ao sino — sem isto o foco do
  // teclado morria no body quando o popover sumia.
  const closeAndRefocus = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  // Ao abrir, o foco entra no popover (dialog); Tab segue dali para os itens.
  useEffect(() => {
    if (open) popoverRef.current?.focus();
  }, [open]);

  // Fluxo de sucesso do "Marcar todas": quando a lista zera e o botão que
  // tinha o foco desmonta, o foco vai para o h3 do popover.
  useEffect(() => {
    if (!open) {
      pendingFocusAfterMarkAll.current = false;
      return;
    }
    if (isMarkingAll) {
      pendingFocusAfterMarkAll.current = true;
      return;
    }
    if (pendingFocusAfterMarkAll.current && unreadCount === 0) {
      pendingFocusAfterMarkAll.current = false;
      headingRef.current?.focus();
    }
  }, [open, isMarkingAll, unreadCount]);

  // Close on outside click/touch + Escape (fechava só com clique fora;
  // no touch o mousedown sintético nem sempre chega — daí o touchstart).
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Escape devolve o foco ao sino; clique fora não (o foco segue o clique).
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleItem = (n: Notification) => {
    if (!n.isRead) onMarkAsRead(n.id);
    // Clicar leva ao contexto: antes só marcava como lida e o usuário tinha
    // de caçar o item manualmente.
    if (n.eventId && onOpen) {
      // Com navegação o foco segue para o novo contexto — sem refocus no sino.
      setOpen(false);
      onOpen(n);
    } else {
      // Sem navegação o popover fecha e o foco volta ao sino.
      closeAndRefocus();
    }
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Bell trigger */}
      <button
        ref={triggerRef}
        data-testid="button-notifications"
        /* Só o ícone nomeava este botão: um leitor de tela anunciava "botão"
           sem dizer do que se tratava nem quantas notificações havia. O "99+"
           visual também não diz de quê — por isso ele fica aria-hidden e a
           contagem entra aqui por extenso. */
        aria-label={unreadCount > 0
          ? `Notificações — ${unreadCount} não lida${unreadCount !== 1 ? "s" : ""}`
          : "Notificações"}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? "notification-popover" : undefined}
        onClick={() => setOpen((p) => !p)}
        style={{
          position: "relative",
          // 36px ficava abaixo do alvo mínimo de toque (44px). flexShrink: 0
          // impede a topbar de 375px de esmagar o sino abaixo disso.
          width: 44,
          height: 44,
          flexShrink: 0,
          padding: 0,
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
            aria-hidden="true"
            style={{
              position: "absolute", top: 6, right: 6,
              backgroundColor: "#dc2626", color: "#ffffff",
              fontSize: 10, fontWeight: 700,
              height: 16, minWidth: 16, padding: "0 3px",
              borderRadius: 999, border: "2px solid #f9f9f8",
              display: "flex", alignItems: "center", justifyContent: "center",
              lineHeight: 1,
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Contagem anunciada quando muda, sem o usuário precisar tocar no sino.
          Só quando há dado de verdade: durante loading/erro a contagem seria
          um falso "nenhuma não lida". */}
      {!isLoading && !isError && (
        <span className="sr-only" aria-live="polite">
          {unreadCount > 0
            ? `${unreadCount} notificaç${unreadCount !== 1 ? "ões" : "ão"} não lida${unreadCount !== 1 ? "s" : ""}`
            : "Nenhuma notificação não lida"}
        </span>
      )}

      {/* Popover */}
      {open && (
        <div
          id="notification-popover"
          ref={popoverRef}
          role="dialog"
          aria-label="Alertas recentes"
          // Recebe o foco ao abrir (dialog): antes o foco ficava no sino e o
          // teclado tinha de atravessar o resto da topbar para chegar aqui.
          tabIndex={-1}
          style={{
            outline: "none",
            /* right -8 + 100vw-96px: o cálculo antigo (100vw-32px) ignorava o
               deslocamento do sino em relação à borda e cortava ~38px à
               esquerda em telas de 375px. */
            position: "absolute", top: "calc(100% + 12px)", right: -8,
            width: "min(384px, calc(100vw - 96px))", backgroundColor: "#ffffff",
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
            <h3
              ref={headingRef}
              // Alvo do foco após "Marcar todas" zerar a lista (o botão some).
              tabIndex={-1}
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 11, fontWeight: 700,
                color: "#1c1917", textTransform: "uppercase", letterSpacing: "0.1em",
                margin: 0, outline: "none",
              }}
            >
              Alertas Recentes
            </h3>
            {unreadCount > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: "#c2410c",
                  backgroundColor: "#fff7ed",
                  padding: "2px 8px", borderRadius: 4,
                  textTransform: "uppercase", letterSpacing: "0.05em",
                }}>
                  {unreadCount} NÃO LIDA{unreadCount !== 1 ? "S" : ""}
                </span>
                {/* Com 9+ acumuladas, marcar era clique a clique. */}
                <button
                  data-testid="button-mark-all-read"
                  onClick={() => onMarkAllRead?.()}
                  // Sem o disabled, cada clique extra disparava outro PATCH.
                  disabled={isMarkingAll}
                  style={{
                    background: "none", border: "none",
                    cursor: isMarkingAll ? "default" : "pointer",
                    // 12px verticais levam o alvo de toque a ~44px.
                    padding: "12px 10px", borderRadius: 4,
                    fontSize: 10, fontWeight: 700, color: "#746e69",
                    textTransform: "uppercase", letterSpacing: "0.05em",
                    textDecoration: "underline",
                    opacity: isMarkingAll ? 0.6 : 1,
                  }}
                >
                  {isMarkingAll ? "Marcando…" : "Marcar todas"}
                </button>
              </div>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: 400, overflowY: "auto", overflowX: "hidden" }}>
            {isLoading ? (
              <SkeletonRows />
            ) : isError ? (
              <div style={{ padding: "28px 24px", textAlign: "center" }}>
                <p style={{ margin: "0 0 12px", color: "#57534e", fontSize: 13, fontWeight: 500 }}>
                  Não foi possível carregar as notificações
                </p>
                <button
                  data-testid="button-retry-notifications"
                  onClick={() => onRetry?.()}
                  style={{
                    // #d6d3d1 dava ~1.5:1 com o fundo — a borda do único
                    // controle acionável do estado de erro quase sumia.
                    background: "#ffffff", border: "1px solid #78716c", borderRadius: 8,
                    padding: "8px 16px", cursor: "pointer",
                    fontSize: 12, fontWeight: 700, color: "#1c1917",
                  }}
                >
                  Tentar de novo
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: "32px 24px", textAlign: "center" }}>
                <Bell aria-hidden="true" style={{ width: 28, height: 28, color: "#d6d3d1", margin: "0 auto 10px", display: "block" }} />
                <p style={{ margin: "0 0 4px", color: "#57534e", fontSize: 13, fontWeight: 600 }}>
                  Nenhuma notificação
                </p>
                {/* #a8a29e era ~2.4:1 sobre branco — abaixo do AA. */}
                <p style={{ margin: 0, color: "#746e69", fontSize: 12 }}>
                  Você será avisado quando algo precisar da sua ação
                </p>
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
                    // Teclado: era <div onClick> não-focável — impossível marcar
                    // como lida sem mouse.
                    role="button"
                    tabIndex={0}
                    aria-label={`${n.isRead ? "Lida" : "Não lida"}: ${n.message}`}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleItem(n); } }}
                    style={{
                      position: "relative",
                      display: "flex", alignItems: "flex-start", gap: 12,
                      // 32px à direita: o ponto de não lida ficava por cima do
                      // fim do texto em mensagens longas.
                      padding: "14px 32px 14px 16px",
                      borderLeft: `4px solid ${cfg.border}`,
                      backgroundColor: !n.isRead ? UNREAD_BG : "transparent",
                      cursor: "pointer",
                      transition: "background-color 0.15s",
                      borderBottom: "1px solid #f3f4f3",
                    }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.backgroundColor = "#f9f9f8")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.backgroundColor = !n.isRead ? UNREAD_BG : "transparent")}
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
                        // #f87171 sobre branco era ~2.5:1 — ilegível justamente
                        // na notificação mais urgente.
                        color: isDeadline && !n.isRead ? "#b91c1c" : "#746e69",
                        margin: 0,
                      }}>
                        {fmtTime(n.createdAt)} · {cfg.label}
                      </p>
                    </div>

                    {/* Unread dot — laranja da marca; o azul antigo se confundia
                        com a categoria Estoque (#3b82f6). */}
                    {!n.isRead && (
                      <div style={{
                        position: "absolute", right: 14, top: "50%",
                        transform: "translateY(-50%)",
                        width: 7, height: 7, borderRadius: "50%",
                        backgroundColor: "#f97316", flexShrink: 0,
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
              // Fecha, devolve o foco ao sino (que continua na topbar após a
              // navegação SPA) e então navega.
              onClick={() => { closeAndRefocus(); onViewAll?.(); }}
              style={{
                background: "none", border: "none", cursor: "pointer",
                // Bloco de largura total: o alvo era só o texto de 10px.
                display: "block", width: "100%", padding: "10px 16px",
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
