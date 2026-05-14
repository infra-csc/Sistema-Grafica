import { useQuery } from "@tanstack/react-query";
import { useState, Fragment } from "react";
import { Search, Calendar, Truck, AlertCircle, Eye } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Status config ────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; dot: string; bg: string; color: string; border: string }> = {
  draft:                 { label: "Rascunho",           dot: "#78716c", bg: "#f5f5f4", color: "#78716c", border: "#e7e5e4" },
  requested:             { label: "Solicitado",         dot: "#f97316", bg: "#fff7ed", color: "#f97316", border: "#fef3c7" },
  awaiting_linking:      { label: "Aguard. Vinculação", dot: "#78716c", bg: "#f5f5f4", color: "#78716c", border: "#e7e5e4" },
  awaiting_submission:   { label: "Aguard. Envio",      dot: "#0ea5e9", bg: "#f0f9ff", color: "#0ea5e9", border: "#e0f2fe" },
  awaiting_approval:     { label: "Aguard. Aprovação",  dot: "#f97316", bg: "#fff7ed", color: "#f97316", border: "#fef3c7" },
  awaiting_sponsor_approval: { label: "Aguard. Aprovação", dot: "#f97316", bg: "#fff7ed", color: "#f97316", border: "#fef3c7" },
  awaiting_finalization: { label: "Aguard. Finalização",dot: "#a855f7", bg: "#faf5ff", color: "#a855f7", border: "#ede9fe" },
  sponsor_approved:      { label: "Aguard. Finalização",dot: "#a855f7", bg: "#faf5ff", color: "#a855f7", border: "#ede9fe" },
  awaiting_final_review: { label: "Aguard. Revisão",    dot: "#d946ef", bg: "#fdf4ff", color: "#d946ef", border: "#fae8ff" },
  awaiting_creator_review: { label: "Aguard. Revisão",  dot: "#d946ef", bg: "#fdf4ff", color: "#d946ef", border: "#fae8ff" },
  ready_for_production:  { label: "Pronto Produção",    dot: "#10b981", bg: "#f0fdf4", color: "#10b981", border: "#dcfce7" },
  approved:              { label: "Liberado",           dot: "#15803d", bg: "#f0fdf4", color: "#15803d", border: "#dcfce7" },
  inProduction:          { label: "Em Produção",        dot: "#f59e0b", bg: "#fff7ed", color: "#f59e0b", border: "#fef3c7" },
  produced:              { label: "Produzido",          dot: "#ec4899", bg: "#fdf2f8", color: "#ec4899", border: "#fce7f3" },
  delivered:             { label: "Entregue",           dot: "#15803d", bg: "#f0fdf4", color: "#15803d", border: "#dcfce7" },
};

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status, dot: "#a8a29e", bg: "#f5f5f4", color: "#78716c", border: "#e7e5e4" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "3px 10px",
      backgroundColor: cfg.bg,
      color: cfg.color,
      border: `1px solid ${cfg.border}`,
      borderRadius: 999,
      fontSize: 11, fontWeight: 700,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: cfg.dot, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}

// ─── Label style ──────────────────────────────────────────
const filterLabel: React.CSSProperties = {
  display: "block", fontSize: 10, fontWeight: 900,
  textTransform: "uppercase", letterSpacing: "0.09em",
  color: "#78716c", marginBottom: 8,
};

export default function PainelGeral() {
  const [searchTerm, setSearchTerm]     = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eventFilter, setEventFilter]   = useState<string>("all");
  const [sponsorFilter, setSponsorFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter]     = useState<string>("all");
  const [dateFilter, setDateFilter]     = useState<string>("all");
  const [selectedItem, setSelectedItem] = useState<any>(null);

  const { data: items = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/items"], placeholderData: [] });
  const { data: events = [] }           = useQuery<any[]>({ queryKey: ["/api/events"], placeholderData: [] });
  const { data: sponsors = [] }         = useQuery<any[]>({ queryKey: ["/api/sponsors"], placeholderData: [] });
  const { data: auditLogs = [] }        = useQuery<any[]>({ queryKey: ["/api/audit-logs"], placeholderData: [] });

  const uniqueTypes = Array.from(new Set(items.map((i: any) => i.type))).sort();

  const applyBaseFilters = (item: any) => {
    const matchesSearch =
      item.type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.event?.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.displayId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.description || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEvent   = eventFilter === "all"   || item.eventId === eventFilter;
    const matchesType    = typeFilter === "all"    || item.type === typeFilter;
    const matchesSponsor = sponsorFilter === "all" ||
      (item.sponsors && Array.isArray(item.sponsors) && item.sponsors.some((s: any) => s.id === sponsorFilter));
    const matchesDate = dateFilter === "all" || (() => {
      if (!item.event?.startDate) return false;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const evDate = new Date(item.event.startDate); evDate.setHours(0, 0, 0, 0);
      const diff = Math.ceil((evDate.getTime() - today.getTime()) / 86400000);
      switch (dateFilter) {
        case "today":       return diff === 0;
        case "next3days":   return diff >= 0 && diff <= 3;
        case "next7days":   return diff >= 0 && diff <= 7;
        case "next10days":  return diff >= 0 && diff <= 10;
        case "next15days":  return diff >= 0 && diff <= 15;
        case "next30days":  return diff >= 0 && diff <= 30;
        case "overdue":     return diff < 0;
        default:            return true;
      }
    })();
    return matchesSearch && matchesEvent && matchesType && matchesSponsor && matchesDate;
  };

  const matchesStatus = (item: any, f: string) => {
    if (f === "all") return true;
    const map: Record<string, string[]> = {
      awaiting_approval:     ["awaiting_approval", "awaiting_sponsor_approval"],
      awaiting_finalization: ["awaiting_finalization", "sponsor_approved"],
      awaiting_final_review: ["awaiting_final_review", "awaiting_creator_review"],
    };
    return map[f] ? map[f].includes(item.status) : item.status === f;
  };

  const statsItems    = items.filter(applyBaseFilters);
  const filteredItems = statsItems
    .filter((i) => matchesStatus(i, statusFilter))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const groupedItems = filteredItems.reduce((acc, item) => {
    const k = item.eventId || "no-event";
    if (!acc[k]) acc[k] = { eventId: item.eventId, eventName: item.event?.name || "Sem Evento", items: [] };
    acc[k].items.push(item);
    return acc;
  }, {} as Record<string, { eventId: string | null; eventName: string; items: any[] }>);

  const stats = {
    total:                 statsItems.length,
    requested:             statsItems.filter(i => i.status === "requested").length,
    awaitingLinking:       statsItems.filter(i => i.status === "awaiting_linking").length,
    awaitingSubmission:    statsItems.filter(i => i.status === "awaiting_submission").length,
    awaitingApproval:      statsItems.filter(i => i.status === "awaiting_approval" || i.status === "awaiting_sponsor_approval").length,
    awaitingFinalization:  statsItems.filter(i => i.status === "awaiting_finalization" || i.status === "sponsor_approved").length,
    awaitingFinalReview:   statsItems.filter(i => i.status === "awaiting_final_review" || i.status === "awaiting_creator_review").length,
    readyForProduction:    statsItems.filter(i => i.status === "ready_for_production").length,
    approved:              statsItems.filter(i => i.status === "approved").length,
    inProduction:          statsItems.filter(i => i.status === "inProduction").length,
    produced:              statsItems.filter(i => i.status === "produced").length,
    delivered:             statsItems.filter(i => i.status === "delivered").length,
  };

  // ── Status card component ───────────────────────────────
  const StatusCard = ({
    label, value, dot, color, filterKey,
  }: { label: string; value: number; dot: string; color: string; filterKey: string }) => {
    const isActive = statusFilter === filterKey;
    return (
      <div
        onClick={() => setStatusFilter(isActive ? "all" : filterKey)}
        data-testid={`stat-card-${filterKey}`}
        style={{
          backgroundColor: "#ffffff",
          border: `1px solid ${isActive ? "#f97316" : "#e7e5e4"}`,
          padding: 16, minHeight: 100,
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          cursor: "pointer",
          boxShadow: isActive ? "inset 0 0 0 1px #f97316" : "none",
          transition: "border-color 0.15s, box-shadow 0.15s",
        }}
      >
        <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: dot }} />
        <div>
          <p style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1, margin: 0 }}>{value}</p>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#78716c", marginTop: 4, lineHeight: 1.2 }}>{label}</p>
        </div>
      </div>
    );
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", height: 40,
    backgroundColor: "#ffffff",
    border: "1px solid #e7e5e4",
    borderRadius: 0,
    padding: "0 12px",
    fontSize: 13, color: "#1c1917",
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  };

  const selectTriggerStyle: React.CSSProperties = {
    backgroundColor: "#ffffff",
    border: "1px solid #e7e5e4",
    borderRadius: 0,
    height: 40,
    fontSize: 13,
    color: "#1c1917",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24 }}>

      {/* ── Header ── */}
      <header style={{ display: "flex", flexDirection: "column" }}>
        <h1
          data-testid="title-painel-geral"
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 28, fontWeight: 700, letterSpacing: "-0.04em",
            textTransform: "uppercase", color: "#1c1917", margin: 0,
          }}
        >
          Painel de Status Geral
        </h1>
        <p style={{ fontSize: 13, color: "#78716c", fontWeight: 500, margin: "4px 0 0 0" }}>
          Acompanhamento em tempo real de todos os itens em produção
        </p>
      </header>

      {/* ── Status cards ── */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }} className="grid-cols-2 md:grid-cols-4 lg:grid-cols-6">

        {/* Total card — dark */}
        <div
          onClick={() => setStatusFilter("all")}
          data-testid="stat-total"
          style={{
            backgroundColor: "#1c1917",
            borderBottom: "3px solid #f97316",
            padding: 16, minHeight: 100,
            display: "flex", flexDirection: "column", justifyContent: "space-between",
            cursor: "pointer",
            outline: statusFilter === "all" ? "2px solid #f97316" : "none",
            outlineOffset: -2,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
          <div>
            <p style={{ fontSize: 20, fontWeight: 700, color: "#f97316", lineHeight: 1, margin: 0 }}>{stats.total}</p>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(255,255,255,0.5)", marginTop: 4, lineHeight: 1.2 }}>Total</p>
          </div>
        </div>

        <StatusCard label="Solicitado"         value={stats.requested}            dot="#f97316" color="#f97316" filterKey="requested" />
        <StatusCard label="Aguard. Vinculação" value={stats.awaitingLinking}      dot="#78716c" color="#78716c" filterKey="awaiting_linking" />
        <StatusCard label="Aguard. Envio"      value={stats.awaitingSubmission}   dot="#0ea5e9" color="#0ea5e9" filterKey="awaiting_submission" />
        <StatusCard label="Aguard. Aprovação"  value={stats.awaitingApproval}     dot="#f97316" color="#f97316" filterKey="awaiting_approval" />
        <StatusCard label="Aguard. Finalização" value={stats.awaitingFinalization} dot="#a855f7" color="#a855f7" filterKey="awaiting_finalization" />
        <StatusCard label="Aguard. Revisão"    value={stats.awaitingFinalReview}  dot="#d946ef" color="#d946ef" filterKey="awaiting_final_review" />
        <StatusCard label="Pronto Produção"    value={stats.readyForProduction}   dot="#10b981" color="#10b981" filterKey="ready_for_production" />
        <StatusCard label="Liberado"           value={stats.approved}             dot="#15803d" color="#15803d" filterKey="approved" />
        <StatusCard label="Em Produção"        value={stats.inProduction}         dot="#f59e0b" color="#f59e0b" filterKey="inProduction" />
        <StatusCard label="Produzido"          value={stats.produced}             dot="#ec4899" color="#ec4899" filterKey="produced" />
        <StatusCard label="Entregue"           value={stats.delivered}            dot="#15803d" color="#15803d" filterKey="delivered" />
      </section>

      {/* ── Filter panel ── */}
      <section style={{
        backgroundColor: "#fafaf9",
        border: "1px solid #e7e5e4",
        padding: 24,
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 2fr 1fr 1fr", gap: 16, alignItems: "end" }}>

          {/* Busca */}
          <div>
            <label style={filterLabel}>Busca</label>
            <div style={{ position: "relative" }}>
              <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "#a8a29e" }} />
              <input
                type="text"
                placeholder="ID, evento ou tipo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search"
                style={{ ...inputStyle, paddingLeft: 32 }}
              />
            </div>
          </div>

          {/* Evento */}
          <div>
            <label style={filterLabel}>Evento</label>
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger style={selectTriggerStyle} data-testid="select-event-filter">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os eventos</SelectItem>
                {[...events].sort((a, b) => a.name.localeCompare(b.name)).map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo */}
          <div>
            <label style={filterLabel}>Tipo</label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger style={selectTriggerStyle} data-testid="select-type-filter">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {uniqueTypes.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Patrocinador */}
          <div>
            <label style={filterLabel}>Patrocinador</label>
            <Select value={sponsorFilter} onValueChange={setSponsorFilter}>
              <SelectTrigger style={selectTriggerStyle} data-testid="select-sponsor-filter">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os patrocinadores</SelectItem>
                {[...sponsors].sort((a: any, b: any) => a.name.localeCompare(b.name)).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
          <div>
            <label style={filterLabel}>Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger style={selectTriggerStyle} data-testid="select-status-filter">
                <SelectValue placeholder="Qualquer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Qualquer status</SelectItem>
                <SelectItem value="requested">Solicitado</SelectItem>
                <SelectItem value="awaiting_linking">Aguard. Vinculação</SelectItem>
                <SelectItem value="awaiting_submission">Aguard. Envio</SelectItem>
                <SelectItem value="awaiting_approval">Aguard. Aprovação</SelectItem>
                <SelectItem value="awaiting_finalization">Aguard. Finalização</SelectItem>
                <SelectItem value="awaiting_final_review">Aguard. Revisão</SelectItem>
                <SelectItem value="ready_for_production">Pronto p/ Produção</SelectItem>
                <SelectItem value="approved">Liberado</SelectItem>
                <SelectItem value="inProduction">Em Produção</SelectItem>
                <SelectItem value="produced">Produzido</SelectItem>
                <SelectItem value="delivered">Entregue</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Data */}
          <div>
            <label style={filterLabel}>Data</label>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger style={selectTriggerStyle} data-testid="select-date-filter">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as datas</SelectItem>
                <SelectItem value="overdue">Atrasados</SelectItem>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="next3days">Próximos 3 dias</SelectItem>
                <SelectItem value="next7days">Próximos 7 dias</SelectItem>
                <SelectItem value="next10days">Próximos 10 dias</SelectItem>
                <SelectItem value="next15days">Próximos 15 dias</SelectItem>
                <SelectItem value="next30days">Próximos 30 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* ── Grouped table ── */}
      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {isLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ backgroundColor: "#ffffff", border: "1px solid #e7e5e4", padding: 48, textAlign: "center" }}>
            <p style={{ color: "#a8a29e", fontSize: 14 }}>Nenhum item encontrado</p>
          </div>
        ) : (
          Object.entries(groupedItems).map(([eventKey, eventData]) => {
            const gd = eventData as { eventId: string | null; eventName: string; items: any[] };
            const firstItem = gd.items[0];
            return (
              <div key={eventKey} style={{ border: "1px solid #e2e2e2", backgroundColor: "#ffffff", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>

                {/* Group header */}
                <div style={{
                  backgroundColor: "#f5f4f3",
                  borderBottom: "1px solid #e2e2e2",
                  padding: "16px 20px",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{
                      width: 40, height: 40,
                      backgroundColor: "#ffffff",
                      border: "1px solid #e2e2e2",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <Calendar style={{ width: 18, height: 18, color: "#f97316" }} />
                    </div>
                    <div>
                      <h3 style={{
                        fontFamily: "'Space Grotesk', sans-serif",
                        fontWeight: 700, fontSize: 16,
                        textTransform: "uppercase", letterSpacing: "-0.02em",
                        color: "#1c1917", margin: 0, lineHeight: 1.2,
                      }}>
                        {gd.eventName}
                      </h3>
                      <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
                        {firstItem?.event?.startDate && (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#78716c" }}>
                            <Calendar style={{ width: 12, height: 12 }} />
                            Início: {format(new Date(firstItem.event.startDate), "dd MMM yyyy", { locale: ptBR })}
                          </span>
                        )}
                        {firstItem?.event?.truckDepartureDate && (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#78716c" }}>
                            <Truck style={{ width: 12, height: 12 }} />
                            Saída: {format(new Date(firstItem.event.truckDepartureDate), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span style={{
                    padding: "3px 12px", borderRadius: 999,
                    backgroundColor: "#e2e2e2", color: "#57534e",
                    fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.07em",
                    whiteSpace: "nowrap",
                  }}>
                    {gd.items.length} {gd.items.length === 1 ? "item" : "itens"}
                  </span>
                </div>

                {/* Table */}
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#1c1917" }}>
                        {["ID", "Peça de Produção", "Descrição", "Medidas", "Patrocinador", "Status", ""].map((col, i) => (
                          <th key={i} style={{
                            padding: "12px 20px",
                            fontSize: 11, fontWeight: 900, textTransform: "uppercase",
                            letterSpacing: "0.1em", color: "#ffffff",
                            textAlign: i === 7 ? "right" : "left",
                            whiteSpace: "nowrap",
                          }}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Group items by type, preserving insertion order
                        const typeMap: Record<string, any[]> = {};
                        for (const item of gd.items) {
                          if (!typeMap[item.type]) typeMap[item.type] = [];
                          typeMap[item.type].push(item);
                        }
                        let globalIdx = 0;
                        return Object.entries(typeMap).map(([type, typeItems]) => (
                          <Fragment key={type}>
                            {/* ── Type sub-header ── */}
                            <tr>
                              <td colSpan={8} style={{
                                padding: "8px 20px",
                                backgroundColor: "#f0ede8",
                                borderTop: "1px solid #e2e2e2",
                                borderBottom: "1px solid #e2e2e2",
                              }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <span style={{
                                    fontSize: 10, fontWeight: 900,
                                    textTransform: "uppercase", letterSpacing: "0.10em",
                                    color: "#57534e",
                                    fontFamily: "'Space Grotesk', sans-serif",
                                  }}>
                                    {type}
                                  </span>
                                  <span style={{
                                    fontSize: 9, fontWeight: 700,
                                    color: "#a8a29e",
                                    backgroundColor: "#e7e3de",
                                    borderRadius: 999,
                                    padding: "1px 7px",
                                    textTransform: "uppercase", letterSpacing: "0.06em",
                                  }}>
                                    {typeItems.length} {typeItems.length === 1 ? "item" : "itens"}
                                  </span>
                                </div>
                              </td>
                            </tr>

                            {/* ── Items within this type ── */}
                            {typeItems.map((item: any) => {
                              const idx = globalIdx++;
                              return (
                                <Fragment key={item.id}>
                                  <tr
                                    data-testid={`item-row-${item.id}`}
                                    onClick={() => setSelectedItem(item)}
                                    style={{
                                      borderBottom: "1px solid #f0f0ef",
                                      backgroundColor: idx % 2 === 1 ? "#fafaf9" : "#ffffff",
                                      cursor: "pointer",
                                      transition: "transform 0.15s, background-color 0.15s",
                                    }}
                                    onMouseEnter={(e) => {
                                      (e.currentTarget as HTMLTableRowElement).style.transform = "translateY(-1px)";
                                      (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "#f3f4f3";
                                    }}
                                    onMouseLeave={(e) => {
                                      (e.currentTarget as HTMLTableRowElement).style.transform = "none";
                                      (e.currentTarget as HTMLTableRowElement).style.backgroundColor = idx % 2 === 1 ? "#fafaf9" : "#ffffff";
                                    }}
                                  >
                                    {/* ID */}
                                    <td style={{ padding: "14px 20px", whiteSpace: "nowrap" }}>
                                      <span data-testid={`text-display-id-${item.id}`} style={{ fontFamily: "monospace", fontWeight: 700, color: "#f97316", fontSize: 13 }}>
                                        {item.displayId}
                                      </span>
                                    </td>

                                    {/* Item de Produção */}
                                    <td style={{ padding: "14px 20px", maxWidth: 220 }}>
                                      <p style={{ fontWeight: 700, fontSize: 13, color: "#1c1917", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {item.type}
                                      </p>
                                    </td>

                                    {/* Descrição */}
                                    <td style={{ padding: "14px 20px", maxWidth: 260 }}>
                                      {item.description ? (
                                        <span style={{ fontSize: 12, color: "#78716c", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {item.description}
                                        </span>
                                      ) : (
                                        <span style={{ color: "#a8a29e", fontSize: 12 }}>—</span>
                                      )}
                                    </td>

                                    {/* Medidas */}
                                    <td style={{ padding: "14px 20px", whiteSpace: "nowrap" }}>
                                      {(item.visualWidth && item.visualHeight) || (item.fileWidth && item.fileHeight) ? (
                                        <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#44403c" }}>
                                          {item.visualWidth && item.visualHeight
                                            ? `${item.visualWidth} × ${item.visualHeight}`
                                            : `${item.fileWidth} × ${item.fileHeight}`}
                                        </span>
                                      ) : (
                                        <span style={{ color: "#a8a29e", fontSize: 12 }}>—</span>
                                      )}
                                    </td>

                                    {/* Patrocinador */}
                                    <td style={{ padding: "14px 20px", color: "#78716c", fontSize: 13 }}>
                                      {item.sponsors?.length > 0
                                        ? item.sponsors.map((s: any) => s.name).join(", ")
                                        : <span style={{ color: "#a8a29e" }}>—</span>}
                                    </td>

                                    {/* Status */}
                                    <td style={{ padding: "14px 20px", whiteSpace: "nowrap" }}>
                                      <StatusPill status={item.status} />
                                    </td>

                                    {/* Ação */}
                                    <td style={{ padding: "14px 20px", textAlign: "right" }}>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setSelectedItem(item); }}
                                        data-testid={`button-view-${item.id}`}
                                        style={{
                                          background: "none", border: "none", cursor: "pointer",
                                          padding: 4, borderRadius: 4, color: "#a8a29e",
                                          display: "flex", alignItems: "center", justifyContent: "center",
                                          transition: "color 0.15s",
                                        }}
                                        onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#f97316")}
                                        onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#a8a29e")}
                                      >
                                        <Eye style={{ width: 16, height: 16 }} />
                                      </button>
                                    </td>
                                  </tr>

                                  {/* Observations row */}
                                  {item.observations && (
                                    <tr style={{ backgroundColor: "rgba(251,191,36,0.08)", borderBottom: "1px solid rgba(251,191,36,0.2)" }}>
                                      <td colSpan={8} style={{ padding: "8px 20px" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#92400e" }}>
                                          <AlertCircle style={{ width: 13, height: 13, flexShrink: 0 }} />
                                          Observação: {item.observations}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              );
                            })}
                          </Fragment>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* ── Item details modal ── */}
      <ItemDetailsDialog
        item={selectedItem}
        auditLogs={auditLogs}
        open={!!selectedItem}
        onOpenChange={(open) => !open && setSelectedItem(null)}
      />
    </div>
  );
}
