import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilterSelect } from "@/components/filter-select";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import {
  Calendar, Package, FileCheck, Plus, Activity, Search, Truck, Clock,
  ChevronLeft, ChevronRight, Link2, FileText,
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
  sponsor_linked: {
    label: "Vinculação", dot: "#8b5cf6", bg: "#f5f3ff", border: "#ddd6fe", color: "#7c3aed",
    icon: Link2,
  },
  thumb_uploaded: {
    label: "Thumb Enviado", dot: "#f59e0b", bg: "#fffbeb", border: "#fde68a", color: "#b45309",
    icon: FileCheck,
  },
  final_file_added: {
    label: "Arq. Final", dot: "#06b6d4", bg: "#ecfeff", border: "#a5f3fc", color: "#0891b2",
    icon: FileCheck,
  },
  item_sent: {
    label: "Enviado p/ Aprov.", dot: "#f97316", bg: "#fff7ed", border: "#fed7aa", color: "#ea580c",
    icon: Clock,
  },
  sponsor_approved: {
    label: "Pat. Aprovou", dot: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", color: "#15803d",
    icon: FileCheck,
  },
  sponsor_rejected: {
    label: "Pat. Reprovou", dot: "#dc2626", bg: "#fef2f2", border: "#fecaca", color: "#b91c1c",
    icon: Activity,
  },
  item_approved: {
    label: "Peça Liberada", dot: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", color: "#15803d",
    icon: FileCheck,
  },
  item_released: {
    label: "Lib. p/ Produção", dot: "#2563eb", bg: "#eff6ff", border: "#bfdbfe", color: "#1d4ed8",
    icon: Package,
  },
  item_dispensed: {
    label: "Dispensado", dot: "#6b7280", bg: "#f3f4f6", border: "#e5e7eb", color: "#374151",
    icon: Activity,
  },
  item_deleted: {
    label: "Excluído", dot: "#ef4444", bg: "#fef2f2", border: "#fecaca", color: "#b91c1c",
    icon: Activity,
  },
  production_started: {
    label: "Em Produção", dot: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe", color: "#1d4ed8",
    icon: Package,
  },
  item_delivered: {
    label: "Peça Entregue", dot: "#9333ea", bg: "#faf5ff", border: "#e9d5ff", color: "#7e22ce",
    icon: Truck,
  },
  book_sent: {
    label: "Envio de Book", dot: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe", color: "#6d28d9",
    icon: FileText,
  },
  item_conferred: {
    label: "Conferência", dot: "#0891b2", bg: "#ecfeff", border: "#a5f3fc", color: "#0e7490",
    icon: FileCheck,
  },
  item_canceled: {
    label: "Cancelada", dot: "#dc2626", bg: "#fef2f2", border: "#fecaca", color: "#b91c1c",
    icon: Activity,
  },
  item_returned: {
    label: "Devolvida p/ Arte", dot: "#d97706", bg: "#fffbeb", border: "#fde68a", color: "#b45309",
    icon: Activity,
  },
};

const DEFAULT_CFG = {
  label: "atividade", dot: P.muted, bg: "#f5f5f4", border: P.border, color: P.second,
  icon: Clock,
};

const PAGE_SIZE = 25;

/* ── Initials helper ── */
function getInitials(name: string) {
  return (name || "Sistema")
    .split(" ").filter(Boolean).slice(0, 2)
    .map(n => n[0].toUpperCase()).join("");
}

/* ── User avatar ── */
function UserAvatar({ name }: { name?: string }) {
  // Sem autor registrado não dá para afirmar que foi o "Sistema": são ações
  // feitas antes de o app passar a gravar quem executou. Mostrar "—" é honesto.
  const unknown = !name || name === "Sistema";
  const display = unknown ? "—" : name!;
  const initials = unknown ? "—" : getInitials(display);
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 10 }}
      title={unknown ? "Autor não registrado (ação anterior ao registro de autoria)" : display}
    >
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        backgroundColor: "#e8e8e7",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, fontWeight: 800, color: unknown ? P.muted : P.text,
        flexShrink: 0, letterSpacing: "0.02em",
      }}>
        {initials}
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: unknown ? P.muted : P.text, whiteSpace: "nowrap" }}>
        {display}
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
  sponsorCount?: number;
  logDetails?: string;
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
    case "sponsor_linked":
      return (
        <span>
          {ID} <strong style={{ color: P.text }}>{e.itemType}</strong> —{" "}
          {e.sponsorCount != null
            ? <>{e.sponsorCount} {e.sponsorCount === 1 ? "patrocinador vinculado" : "patrocinadores vinculados"}</>
            : "patrocinadores atualizados"
          }{" "}
          no evento <strong style={{ color: P.text }}>{e.eventName}</strong>
        </span>
      );
    case "thumb_uploaded":
      return <span>{ID} <strong style={{ color: P.text }}>{e.itemType}</strong> — thumb de aprovação enviado · evento <strong style={{ color: P.text }}>{e.eventName}</strong></span>;
    case "final_file_added":
      return <span>{ID} <strong style={{ color: P.text }}>{e.itemType}</strong> — arquivo final adicionado · evento <strong style={{ color: P.text }}>{e.eventName}</strong></span>;
    case "item_sent":
      return <span>{ID} <strong style={{ color: P.text }}>{e.itemType}</strong> enviado para aprovação de patrocinador · evento <strong style={{ color: P.text }}>{e.eventName}</strong></span>;
    case "sponsor_approved":
      return <span>{ID} <strong style={{ color: P.text }}>{e.itemType}</strong> — {e.logDetails || "patrocinador aprovou"} · evento <strong style={{ color: P.text }}>{e.eventName}</strong></span>;
    case "sponsor_rejected":
      return <span>{ID} <strong style={{ color: P.text }}>{e.itemType}</strong> — {e.logDetails || "patrocinador reprovou"} · evento <strong style={{ color: P.text }}>{e.eventName}</strong></span>;
    case "item_approved":
      return <span>{ID} <strong style={{ color: P.text }}>{e.itemType}</strong> de <strong style={{ color: P.text }}>{e.eventName}</strong> liberado para produção</span>;
    case "item_released":
      return <span>{ID} <strong style={{ color: P.text }}>{e.itemType}</strong> revisado e liberado para produção · evento <strong style={{ color: P.text }}>{e.eventName}</strong></span>;
    case "item_dispensed":
      return <span>{ID} <strong style={{ color: P.text }}>{e.itemType}</strong> dispensado (aprovação ignorada) · evento <strong style={{ color: P.text }}>{e.eventName}</strong></span>;
    case "item_deleted":
      return <span>Peça <strong style={{ color: P.text }}>{e.itemType}</strong> excluída do evento <strong style={{ color: P.text }}>{e.eventName}</strong></span>;
    case "production_started":
      return <span>Produção de {ID} <strong style={{ color: P.text }}>{e.itemType}</strong> — {e.quantityProduced}/{e.quantity} un.</span>;
    case "item_delivered":
      return (
        <span>
          {ID} <strong style={{ color: P.text }}>{e.itemType}</strong> de <strong style={{ color: P.text }}>{e.eventName}</strong> entregue
          {e.receivedBy && <> para <strong style={{ color: P.text }}>{e.receivedBy}</strong></>}
        </span>
      );
    case "item_conferred":
      return <span>{ID} <strong style={{ color: P.text }}>{e.itemType}</strong> conferida{e.logDetails?.match(/\((\d+\/\d+)\)/) ? <> — {e.logDetails.match(/\((\d+\/\d+)\)/)![1]} un.</> : null} · evento <strong style={{ color: P.text }}>{e.eventName}</strong></span>;
    case "item_canceled":
      return <span>{ID} <strong style={{ color: P.text }}>{e.itemType}</strong> cancelada · evento <strong style={{ color: P.text }}>{e.eventName}</strong></span>;
    case "item_returned":
      return <span>{ID} <strong style={{ color: P.text }}>{e.itemType}</strong> devolvida para a Arte · evento <strong style={{ color: P.text }}>{e.eventName}</strong></span>;
    case "book_sent": {
      const removido = (e.logDetails || "").toLowerCase().includes("removido");
      return (
        <span>
          Book de aprovação {removido ? "removido de" : "enviado com"}{" "}
          {e.quantity ? <strong style={{ color: P.text }}>{e.quantity} peça{e.quantity === 1 ? "" : "s"}</strong> : "peças"}
          {" "}· evento <strong style={{ color: P.text }}>{e.eventName}</strong>
        </span>
      );
    }
    default:
      return <span>Atividade registrada</span>;
  }
}

export default function Historico() {
  const [, setLocation] = useLocation();
  const [eventFilter, setEventFilter] = useState<string[]>([]);
  const [actionFilter, setActionFilter] = useState<string[]>([]);
  const [searchFilter, setSearchFilter] = useState("");
  const [page, setPage] = useState(1);

  const { data: events = [] } = useQuery<any[]>({ queryKey: ["/api/events"] });
  const { data: items = [] }  = useQuery<any[]>({ queryKey: ["/api/items"] });
  const { data: auditLogs = [], isLoading: logsLoading } = useQuery<any[]>({ queryKey: ["/api/audit-logs"] });

  /* ── Build lookup maps ── */
  // Keep FIRST log per entity+action for userName lookups (created/delivered fire once)
  const auditLogMap = new Map<string, any>();
  auditLogs.forEach(log => {
    const key = `${log.entityId}-${log.action}`;
    if (!auditLogMap.has(key)) auditLogMap.set(key, log);
  });

  const itemMap = new Map<string, any>();
  items.forEach(item => itemMap.set(item.id, item));

  const timeline: TimelineEvent[] = [];

  // Pre-scan audit logs so the items loop can skip synthetic fallbacks
  // when a proper audit-log entry already covers that step.
  const itemsWithRelease = new Set<string>(); // covered by item_released from audit log
  auditLogs.forEach((log: any) => {
    const action = (log.action || "").toLowerCase();
    const details = (log.details || "");
    if (action === "approved" && details.toLowerCase().includes("liberado para produção")) {
      const itemId = log.entityId ?? log.entity_id;
      if (itemId) itemsWithRelease.add(itemId);
    }
  });

  /* ── Synthetic events from items / events tables ── */
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
    // Peças importadas via Excel antigas só têm o log agregado no evento —
    // usa-o como fallback para não exibir "Sistema" como autor.
    const createdLog = auditLogMap.get(`${item.id}-created`)
      ?? auditLogMap.get(`${item.eventId}-created`);

    timeline.push({
      id: `item-created-${item.id}`, type: "item_created",
      timestamp: new Date(item.createdAt),
      eventName, eventId: item.eventId,
      itemType: item.type, itemId: item.id, itemDisplayId: item.displayId,
      quantity: item.quantity, userName: createdLog?.userName,
    });

    // Synthetic "Peça Liberada" only as fallback for legacy items without an audit log
    if (
      ["approved", "inProduction", "produced", "delivered"].includes(item.status) &&
      !itemsWithRelease.has(item.id)
    ) {
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
      const prodLog = auditLogMap.get(`${item.id}-produced`) ?? auditLogMap.get(`${item.id}-production`);
      timeline.push({
        id: `production-${item.id}`, type: "production_started",
        timestamp: new Date(item.productionStartedAt || item.updatedAt),
        eventName, eventId: item.eventId,
        itemType: item.type, itemId: item.id, itemDisplayId: item.displayId,
        quantity: item.quantity, quantityProduced: item.quantityProduced,
        userName: prodLog?.userName ?? prodLog?.user_name,
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

  // Parse audit logs for all relevant action types
  auditLogs.forEach((log: any) => {
    const action = (log.action || "").toLowerCase();
    const details = (log.details || "");
    const detailsLower = details.toLowerCase();
    const itemId = log.entityId ?? log.entity_id;
    const entityType = (log.entityType ?? log.entity_type ?? "").toLowerCase();
    const ts = log.createdAt ?? log.created_at;
    const userName = log.userName ?? log.user_name;

    // Logs de EVENTO: hoje só o envio/remoção do book de aprovação interessa
    // aqui (os demais viram entradas próprias a partir da tabela de eventos).
    if (entityType === "event") {
      if (detailsLower.includes("book")) {
        const ev = events.find(e => e.id === itemId);
        const qtd = details.match(/(\d+)\s+pe/i)?.[1];
        timeline.push({
          id: `book-${log.id ?? itemId + ts}`,
          type: "book_sent",
          timestamp: new Date(ts),
          eventName: ev?.name || "Evento desconhecido",
          eventId: itemId,
          itemId,
          quantity: qtd ? parseInt(qtd, 10) : undefined,
          userName,
          logDetails: details,
        });
      }
      return;
    }

    // Only process item-related logs
    if (entityType !== "item") {
      return;
    }

    const item = itemMap.get(itemId);
    const event = item ? events.find(e => e.id === item.eventId) : null;

    // Extrai nome do evento e tipo da peça dos detalhes do log quando o item foi deletado
    const eventNameFromDetails = details.match(/(?:do|no) evento "(.+?)"/i)?.[1];
    const itemTypeFromDetails  = details.match(/(?:Peça|Item|peça) "(.+?)"/i)?.[1]
                               || details.match(/^"(.+?)"/)?.[1];
    const displayIdFromDetails = details.match(/#(\d+)/)?.[1];

    const eventName    = event?.name || eventNameFromDetails || "Evento desconhecido";
    const resolvedType = item?.type  || itemTypeFromDetails;
    const resolvedId   = item?.displayId || (displayIdFromDetails ? `#${displayIdFromDetails}` : undefined);

    const base = {
      timestamp: new Date(ts),
      eventName,
      eventId: item?.eventId || "",
      itemType: resolvedType,
      itemId: itemId,
      itemDisplayId: resolvedId,
      quantity: item?.quantity,
      userName,
      logDetails: details,
    };

    // Conferência da Gráfica (parcial ou concluída)
    if (detailsLower.includes("conferência")) {
      timeline.push({ id: `conferred-${log.id ?? itemId + ts}`, type: "item_conferred", ...base });
      return;
    }

    // Peça cancelada
    if (detailsLower.includes("item cancelado")) {
      timeline.push({ id: `canceled-${log.id ?? itemId + ts}`, type: "item_canceled", ...base });
      return;
    }

    // Devolvida para a Arte
    if (detailsLower.includes("devolvido para arte") || detailsLower.includes("devolvida para arte")
      || detailsLower.includes("devolvido para criação")) {
      timeline.push({ id: `returned-${log.id ?? itemId + ts}`, type: "item_returned", ...base });
      return;
    }

    // Sponsor linking
    if (action === "updated" && detailsLower.includes("patrocinadores atualizados")) {
      if (!item) return; // só exibe se item ainda existe (sponsor linking sem item é raro/irrelevante)
      const match = details.match(/(\d+)\s+patrocinador/i);
      const sponsorCount = match ? parseInt(match[1], 10) : undefined;
      timeline.push({ id: `sponsor-linked-${log.id ?? itemId + ts}`, type: "sponsor_linked", ...base, sponsorCount });
      return;
    }

    // Thumb uploaded
    if (action === "updated" && detailsLower.includes("thumb de aprovação atualizado")) {
      if (!item) return;
      timeline.push({ id: `thumb-${log.id ?? itemId + ts}`, type: "thumb_uploaded", ...base });
      return;
    }

    // Final file added (via add-final-file route OR via general patch with "arquivo final")
    if (action === "updated" && (detailsLower.includes("arquivo final adicionado") || detailsLower.includes("arquivo final atualizado"))) {
      if (!item) return;
      timeline.push({ id: `final-${log.id ?? itemId + ts}`, type: "final_file_added", ...base });
      return;
    }

    // Item sent for sponsor approval
    if (action === "updated" && detailsLower.includes("status alterado") && details.includes("→ Aguardando Aprovação")) {
      timeline.push({ id: `sent-${log.id ?? itemId + ts}`, type: "item_sent", ...base });
      return;
    }

    // Sponsor approved (individual or all)
    if (action === "approved" && (detailsLower.includes("patrocinador") || detailsLower.includes("aprovou"))) {
      // Skip "liberado para produção" — that's item_released
      if (detailsLower.includes("liberado para produção")) return;
      timeline.push({ id: `sp-approved-${log.id ?? itemId + ts}`, type: "sponsor_approved", ...base });
      return;
    }

    // Sponsor rejected
    if (action === "rejected") {
      timeline.push({ id: `sp-rejected-${log.id ?? itemId + ts}`, type: "sponsor_rejected", ...base });
      return;
    }

    // Item released for production (creator review)
    if (action === "approved" && detailsLower.includes("liberado para produção")) {
      timeline.push({ id: `released-${log.id ?? itemId + ts}`, type: "item_released", ...base });
      return;
    }

    // Item dispensed
    if (action === "dispensed") {
      timeline.push({ id: `dispensed-${log.id ?? itemId + ts}`, type: "item_dispensed", ...base });
      return;
    }

    // Item deleted — sempre exibe, mesmo sem o item na tabela
    if (action === "deleted") {
      timeline.push({
        id: `deleted-${log.id ?? itemId + ts}`,
        type: "item_deleted",
        ...base,
        itemType: resolvedType || "Peça",
      });
      return;
    }

    // Item criado (log de auditoria, sem item na tabela = item foi criado e deletado)
    if (action === "created" && !item) {
      // Resumos de importação antigos foram gravados como 'item' mas com o id do
      // EVENTO — não são peças, e renderizavam "Peça ( un.) — Evento desconhecido".
      if (events.some(e => e.id === itemId)) return;
      timeline.push({
        id: `item-created-log-${log.id ?? itemId + ts}`,
        type: "item_created",
        ...base,
        itemType: resolvedType || "Peça",
      });
      return;
    }
  });

  const sorted = timeline.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  /* ── Filters ── */
  let filtered = eventFilter.length === 0 ? sorted : sorted.filter(e => eventFilter.includes(e.eventId));
  if (actionFilter.length > 0) filtered = filtered.filter(e => actionFilter.includes(e.type));
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

  const handleFilterChange = (setter: (v: string[]) => void) => (v: string[]) => {
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
          <FilterSelect
            showAllLabelWhenEmpty hideWhenEmpty={false}
            label="Ação" allLabel="Todas as ações"
            values={actionFilter} onValuesChange={handleFilterChange(setActionFilter)}
            options={[
              { value: "event_created", label: "Eventos criados", group: "Criação", pinned: true },
              { value: "item_created", label: "Itens adicionados", group: "Criação", pinned: true },
              { value: "item_deleted", label: "Itens excluídos", group: "Criação", pinned: true },
              { value: "sponsor_linked", label: "Vinculações", group: "Arte", pinned: true },
              { value: "thumb_uploaded", label: "Thumbs enviados", group: "Arte", pinned: true },
              { value: "item_sent", label: "Enviados p/ aprovação", group: "Arte", pinned: true },
              { value: "book_sent", label: "Envio de book", group: "Arte", pinned: true },
              { value: "final_file_added", label: "Arq. finais adicionados", group: "Arte", pinned: true },
              { value: "item_dispensed", label: "Dispensados", group: "Arte", pinned: true },
              { value: "sponsor_approved", label: "Pat. aprovou", group: "Aprovação", pinned: true },
              { value: "sponsor_rejected", label: "Pat. reprovou", group: "Aprovação", pinned: true },
              { value: "item_released", label: "Lib. p/ produção", group: "Aprovação", pinned: true },
              { value: "item_approved", label: "Itens liberados", group: "Produção", pinned: true },
              { value: "production_started", label: "Em produção", group: "Produção", pinned: true },
              { value: "item_conferred", label: "Conferências", group: "Produção", pinned: true },
              { value: "item_delivered", label: "Entregas", group: "Produção", pinned: true },
              { value: "item_returned", label: "Devolvidas p/ Arte", group: "Aprovação", pinned: true },
              { value: "item_canceled", label: "Canceladas", group: "Criação", pinned: true },
            ]}
            searchPlaceholder="Buscar ação..." emptyText="Nenhuma ação encontrada."
            testId="select-action-filter" triggerStyle={selectStyle}
          />

          {/* Event select */}
          <EventFilterDropdown
            values={eventFilter}
            onValuesChange={handleFilterChange(setEventFilter)}
            options={events.map((ev: any) => ({ value: ev.id, label: ev.name }))}
          />

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
        {logsLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "80px 24px" }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : filtered.length === 0 ? (
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
                  onClick={entry.eventId ? () => setLocation(`/eventos/${entry.eventId}`) : undefined}
                  style={{
                    display: "grid", gridTemplateColumns: "2fr 5fr 2fr 3fr",
                    padding: "18px 32px", alignItems: "center",
                    borderBottom: isLast ? "none" : `1px solid #f0efee`,
                    cursor: entry.eventId ? "pointer" : "default", transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { if (entry.eventId) e.currentTarget.style.backgroundColor = "#f9f9f8"; }}
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
