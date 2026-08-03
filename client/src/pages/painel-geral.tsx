import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo, Fragment, useEffect } from "react";
import { Search, Calendar, Truck, AlertCircle, Eye, Paperclip, Trash2, FileText, Printer } from "lucide-react";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { ExportPdfDialog } from "@/components/export-pdf-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { parseDateLocal, toUTCDisplayDate } from "@/lib/utils";
import { FilterSelect } from "@/components/filter-select";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import { SponsorChips } from "@/components/sponsor-chips";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";

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
  awaiting_creator_review: { label: "Aguard. Finalização", dot: "#a855f7", bg: "#faf5ff", color: "#a855f7", border: "#ede9fe" },
  ready_for_production:  { label: "Pronto Produção",    dot: "#10b981", bg: "#f0fdf4", color: "#10b981", border: "#dcfce7" },
  // pronto_para_producao: mesmo conceito de ready_for_production (a dispensa da
  // Arte grava esse valor em português). Sem esta entrada o item mostrava o
  // texto cru "pronto_para_producao" na tabela e não entrava em nenhum card.
  pronto_para_producao:  { label: "Pronto Produção",    dot: "#10b981", bg: "#f0fdf4", color: "#10b981", border: "#dcfce7" },
  approved:              { label: "Liberado",           dot: "#15803d", bg: "#f0fdf4", color: "#15803d", border: "#dcfce7" },
  inProduction:          { label: "Em Produção",        dot: "#f59e0b", bg: "#fff7ed", color: "#f59e0b", border: "#fef3c7" },
  produced:              { label: "Produzido",          dot: "#ec4899", bg: "#fdf2f8", color: "#ec4899", border: "#fce7f3" },
  conferred:             { label: "Conferido",          dot: "#0e7490", bg: "#ecfeff", color: "#0e7490", border: "#a5f3fc" },
  delivered:             { label: "Entregue",           dot: "#15803d", bg: "#f0fdf4", color: "#15803d", border: "#dcfce7" },
  canceled:              { label: "Cancelado",          dot: "#ef4444", bg: "#fef2f2", color: "#ef4444", border: "#fecaca" },
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
  display: "block", fontSize: 9, fontWeight: 900,
  textTransform: "uppercase", letterSpacing: "0.11em",
  color: "#a8a29e", marginBottom: 4,
};

export default function PainelGeral() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [searchTerm, setSearchTerm]     = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [eventFilter, setEventFilter]   = useState<string[]>([]);
  const [sponsorFilter, setSponsorFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter]     = useState<string[]>([]);
  const [dateFilter, setDateFilter]     = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [deleteConfirmItemId, setDeleteConfirmItemId] = useState<string | null>(null);
  const [showExportPDFModal, setShowExportPDFModal] = useState(false);
  const isMobile = useIsMobile();
  // Sem placeholderData: no TanStack v5 ele zera o isLoading e o spinner nunca
  // aparece — o usuário via "Nenhum item" e KPIs zerados durante o carregamento.
  const { data: items = [], isLoading, isError, refetch } = useQuery<any[]>({ queryKey: ["/api/items"] });
  const { data: events = [] }           = useQuery<any[]>({ queryKey: ["/api/events"], placeholderData: [] });
  const { data: sponsors = [] }         = useQuery<any[]>({ queryKey: ["/api/sponsors"], placeholderData: [] });
  const { data: auditLogs = [] }        = useQuery<any[]>({ queryKey: ["/api/audit-logs"], placeholderData: [] });
  const { data: standardItems = [] }    = useQuery<any[]>({ queryKey: ["/api/standard-items"], placeholderData: [] });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => await apiRequest("DELETE", `/api/items/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setDeleteConfirmItemId(null);
      toast({ title: "Peça excluída", description: "A peça foi removida com sucesso." });
    },
    onError: (error: any) => toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }),
  });

  const uniqueTypes = Array.from(new Set(items.map((i: any) => i.type))).sort();

  const typeToGroup = useMemo(() => {
    const map: Record<string, string> = {};
    (standardItems as any[]).forEach((s: any) => { if (s.group) map[s.name] = s.group; });
    return map;
  }, [standardItems]);

  const applyBaseFilters = (item: any) => {
    const matchesSearch =
      item.type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.event?.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.displayId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.description || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEvent   = eventFilter.length === 0   || eventFilter.includes(item.eventId);
    const matchesType    = typeFilter.length === 0    || typeFilter.includes(item.type);
    const matchesSponsor = sponsorFilter.length === 0 ||
      (item.sponsors && Array.isArray(item.sponsors) && item.sponsors.some((s: any) => sponsorFilter.includes(s.id)));
    const dateRangeMap: Record<string, (diff: number) => boolean> = {
      today: d => d === 0, next3days: d => d >= 0 && d <= 3, next7days: d => d >= 0 && d <= 7,
      next10days: d => d >= 0 && d <= 10, next15days: d => d >= 0 && d <= 15,
      next30days: d => d >= 0 && d <= 30, overdue: d => d < 0,
    };
    const matchesDate = dateFilter.length === 0 || (() => {
      if (!item.event?.startDate) return false;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const evDate = parseDateLocal(item.event.startDate); evDate.setHours(0, 0, 0, 0);
      const diff = Math.ceil((evDate.getTime() - today.getTime()) / 86400000);
      return dateFilter.some(df => dateRangeMap[df] ? dateRangeMap[df](diff) : true);
    })();
    return matchesSearch && matchesEvent && matchesType && matchesSponsor && matchesDate;
  };

  const matchesStatus = (item: any, f: string[]) => {
    if (f.length === 0) return true;
    const map: Record<string, string[]> = {
      requested:             ["draft", "requested"],
      awaiting_approval:     ["awaiting_approval", "awaiting_sponsor_approval"],
      awaiting_finalization: ["awaiting_finalization", "sponsor_approved", "awaiting_creator_review"],
      awaiting_final_review: ["awaiting_final_review"],
      ready_for_production:  ["ready_for_production", "pronto_para_producao"],
    };
    return f.some(fv => map[fv] ? map[fv].includes(item.status) : item.status === fv);
  };

  const statsItems    = items.filter(applyBaseFilters);
  const filteredItems = statsItems
    .filter((i) => matchesStatus(i, statusFilter))
    .sort((a, b) => {
      const gA = typeToGroup[a.type] || '', gB = typeToGroup[b.type] || '';
      if (gA !== gB) return gA.localeCompare(gB, 'pt-BR');
      const idA = parseInt(String(a.displayId || '0').replace(/\D/g, '')) || 0;
      const idB = parseInt(String(b.displayId || '0').replace(/\D/g, '')) || 0;
      return idA - idB;
    });

  const groupedItems = filteredItems.reduce((acc, item) => {
    const k = item.eventId || "no-event";
    if (!acc[k]) acc[k] = { eventId: item.eventId, eventName: item.event?.name || "Sem Evento", items: [] };
    acc[k].items.push(item);
    return acc;
  }, {} as Record<string, { eventId: string | null; eventName: string; items: any[] }>);

  const stats = {
    total:                 statsItems.length,
    requested:             statsItems.filter(i => i.status === "requested" || i.status === "draft").length,
    awaitingLinking:       statsItems.filter(i => i.status === "awaiting_linking").length,
    awaitingSubmission:    statsItems.filter(i => i.status === "awaiting_submission").length,
    awaitingApproval:      statsItems.filter(i => i.status === "awaiting_approval" || i.status === "awaiting_sponsor_approval").length,
    awaitingFinalization:  statsItems.filter(i => i.status === "awaiting_finalization" || i.status === "sponsor_approved" || i.status === "awaiting_creator_review").length,
    awaitingFinalReview:   statsItems.filter(i => i.status === "awaiting_final_review").length,
    readyForProduction:    statsItems.filter(i => i.status === "ready_for_production" || i.status === "pronto_para_producao").length,
    approved:              statsItems.filter(i => i.status === "approved").length,
    inProduction:          statsItems.filter(i => i.status === "inProduction").length,
    produced:              statsItems.filter(i => i.status === "produced").length,
    conferred:             statsItems.filter(i => i.status === "conferred").length,
    delivered:             statsItems.filter(i => i.status === "delivered").length,
  };

  // ── Status card component ───────────────────────────────
  const StatusCard = ({
    label, value, dot, color, filterKey,
  }: { label: string; value: number; dot: string; color: string; filterKey: string }) => {
    const isActive = statusFilter.includes(filterKey);
    return (
      <div
        onClick={() => setStatusFilter(isActive ? [] : [filterKey])}
        data-testid={`stat-card-${filterKey}`}
        style={{
          position: "relative", overflow: "hidden",
          background: isActive ? `linear-gradient(135deg, ${color}18 0%, #ffffff 72%)` : "#ffffff",
          border: `1px solid ${isActive ? color : "#e7e5e4"}`,
          borderLeft: `4px solid ${isActive ? color : `${dot}90`}`,
          borderRadius: 10,
          padding: "14px 15px 13px 14px", minHeight: 102,
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          cursor: "pointer",
          boxShadow: isActive ? `0 0 0 2px ${color}30, 0 5px 12px ${color}18` : "0 1px 2px rgba(28,25,23,.04)",
          transform: isActive ? "translateY(1px)" : "none",
          transition: "border-color 0.15s, box-shadow 0.15s, transform 0.15s",
        }}
        onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; }}
        onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLDivElement).style.transform = "none"; }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: dot, boxShadow: `0 0 0 4px ${dot}18` }} />
          {isActive && <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: ".08em", color, textTransform: "uppercase" }}>Filtrado</span>}
        </div>
        <div>
          <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 27, fontWeight: 700, color: isActive ? color : "#1c1917", lineHeight: 1, margin: 0, letterSpacing: "-.05em" }}>{value}</p>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#78716c", marginTop: 4, lineHeight: 1.2 }}>{label}</p>
        </div>
      </div>
    );
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", height: 36,
    backgroundColor: "#ffffff",
    border: "1px solid #e7e5e4",
    borderRadius: 6,
    padding: "0 12px",
    fontSize: 13, color: "#1c1917",
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  };

  const hasActiveFilters = statusFilter.length > 0 || eventFilter.length > 0 || sponsorFilter.length > 0 || typeFilter.length > 0 || dateFilter.length > 0 || searchTerm.length > 0;
  const clearAllFilters = () => { setStatusFilter([]); setEventFilter([]); setSponsorFilter([]); setTypeFilter([]); setDateFilter([]); setSearchTerm(""); };


  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 22, padding: isMobile ? "0 12px 20px" : "0 28px 34px", minHeight: "100%", overflowY: "auto", background: "#fafaf9" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 4, height: 4, margin: isMobile ? "0 -12px" : "0 -28px", background: "linear-gradient(90deg, #1c1917 0%, #1c1917 72%, #f97316 72%, #f97316 100%)" }} />

      {/* ── Header ── */}
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16, paddingTop: 22, paddingBottom: 2 }}>
        <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minWidth: 0 }}>
          <h1
            data-testid="title-painel-geral"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
               fontSize: isMobile ? 20 : 29, fontWeight: 700, letterSpacing: "-0.055em",
              textTransform: "uppercase", color: "#1c1917", margin: 0,
            }}
          >
            Painel de Status Geral
          </h1>
          <p style={{ fontSize: 13, color: "#78716c", fontWeight: 500, margin: "4px 0 0 0", display: isMobile ? "none" : "block" }}>
            Acompanhamento em tempo real de todos os itens em produção
          </p>
        </div>
        <button
          onClick={() => setShowExportPDFModal(true)}
          data-testid="button-export-pdf-painel"
           style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: isMobile ? 44 : 40, minWidth: isMobile ? 44 : undefined, padding: isMobile ? "0 12px" : "0 16px", borderRadius: 7, backgroundColor: "#1c1917", border: "1px solid #1c1917", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", boxShadow: "0 2px 0 #f97316" }}
        >
          <Printer style={{ width: 14, height: 14 }} />
          {!isMobile && "Exportar PDF"}
        </button>
      </header>

      {/* ── Status cards ── */}
       <section style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3,1fr)" : "repeat(6,1fr)", gap: 10 }}>

        {/* Total card — dark */}
        <div
          onClick={() => setStatusFilter([])}
          data-testid="stat-total"
          style={{
             background: "linear-gradient(145deg, #292522, #1c1917)",
             border: `1px solid ${statusFilter.length === 0 ? "#f97316" : "#3b3531"}`,
            borderBottom: "3px solid #f97316",
             borderRadius: 10,
             padding: "14px 15px", minHeight: 102,
            display: "flex", flexDirection: "column", justifyContent: "space-between",
            cursor: "pointer",
             boxShadow: statusFilter.length === 0 ? "0 0 0 2px rgba(249,115,22,.22), 0 5px 12px rgba(28,25,23,.16)" : "0 2px 5px rgba(28,25,23,.12)",
             transform: statusFilter.length === 0 ? "translateY(1px)" : "none",
          }}
        >
           <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>{statusFilter.length === 0 && <span style={{ fontSize: 9, color: "#f97316", fontWeight: 900, letterSpacing: ".08em" }}>BASELINE</span>}</div>
          <div>
             <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 27, fontWeight: 700, color: "#f97316", lineHeight: 1, margin: 0, letterSpacing: "-.05em" }}>{stats.total}</p>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(255,255,255,0.5)", marginTop: 4, lineHeight: 1.2 }}>Total</p>
          </div>
        </div>

        <StatusCard label="Rascunho"            value={stats.requested}            dot="#f97316" color="#f97316" filterKey="requested" />
        <StatusCard label="Aguard. Vinculação" value={stats.awaitingLinking}      dot="#78716c" color="#78716c" filterKey="awaiting_linking" />
        <StatusCard label="Aguard. Envio"      value={stats.awaitingSubmission}   dot="#0ea5e9" color="#0ea5e9" filterKey="awaiting_submission" />
        <StatusCard label="Aguard. Aprovação"  value={stats.awaitingApproval}     dot="#f97316" color="#f97316" filterKey="awaiting_approval" />
        <StatusCard label="Aguard. Finalização" value={stats.awaitingFinalization} dot="#a855f7" color="#a855f7" filterKey="awaiting_finalization" />
        <StatusCard label="Aguard. Revisão"    value={stats.awaitingFinalReview}  dot="#d946ef" color="#d946ef" filterKey="awaiting_final_review" />
        <StatusCard label="Pronto Produção"    value={stats.readyForProduction}   dot="#10b981" color="#10b981" filterKey="ready_for_production" />
        <StatusCard label="Em Produção"        value={stats.inProduction}         dot="#f59e0b" color="#f59e0b" filterKey="inProduction" />
        <StatusCard label="Produzido"          value={stats.produced}             dot="#ec4899" color="#ec4899" filterKey="produced" />
        <StatusCard label="Conferido"          value={stats.conferred}            dot="#0e7490" color="#0e7490" filterKey="conferred" />
        <StatusCard label="Entregue"           value={stats.delivered}            dot="#15803d" color="#15803d" filterKey="delivered" />
      </section>

      {/* ── Filter toolbar ── */}
      <div style={{
        display: "flex", alignItems: isMobile ? "stretch" : "center", flexWrap: isMobile ? "wrap" : "nowrap", gap: 8,
        backgroundColor: "#ffffff",
        borderRadius: 8,
        border: "1px solid #e7e5e4",
        padding: "8px 10px",
        boxShadow: "0 1px 3px rgba(28,25,23,0.05)",
      }}>
        {/* Search — full width row on mobile */}
        <div style={{ position: "relative", flexShrink: 0, width: isMobile ? "100%" : 180 }}>
          <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#a8a29e", pointerEvents: "none" }} />
          <input
            type="text"
            placeholder="Buscar ID, evento..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="input-search"
            style={{ ...inputStyle, paddingLeft: 28, height: 32, fontSize: 12 }}
          />
        </div>

        {/* Divider — hidden on mobile */}
        {!isMobile && <div style={{ width: 1, height: 20, backgroundColor: "#e7e5e4", flexShrink: 0 }} />}

        {/* Evento */}
        <div style={{ flexShrink: 0, minWidth: 150, ...(isMobile && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
          <EventFilterDropdown
            values={eventFilter}
            onValuesChange={setEventFilter}
            options={(() => {
              const P: Record<string,number> = { urgente:0, alta:1, media:2, baixa:3 };
              const C: Record<string,string> = { urgente:'#ef4444', alta:'#f97316', media:'#eab308', baixa:'#3b82f6' };
              return [...events].sort((a:any,b:any) => { const pa=P[a.priority]??4,pb=P[b.priority]??4; return pa!==pb?pa-pb:a.name.localeCompare(b.name,'pt-BR'); }).map((e:any) => ({ value: e.id, label: e.name, dotColor: C[e.priority] }));
            })()}
          />
        </div>

        {/* Tipo */}
        <div style={{ flexShrink: 0, minWidth: 130, ...(isMobile && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
          <FilterSelect
            label="Tipo" allLabel="Todos os tipos"
            values={typeFilter} onValuesChange={setTypeFilter}
            hideWhenEmpty={false}
            options={uniqueTypes.map((t: string) => ({ value: t, label: t }))}
            testId="select-type-filter"
            fullWidth
          />
        </div>

        {/* Patrocinador */}
        <div style={{ flex: 1, minWidth: 160, ...(isMobile && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
          <FilterSelect
            label="Patrocinador" allLabel="Todos os patrocinadores"
            values={sponsorFilter} onValuesChange={setSponsorFilter}
            hideWhenEmpty={false}
            options={(sponsors as any[]).map((s: any) => ({ value: s.id, label: s.name }))}
            testId="select-sponsor-filter"
            fullWidth
          />
        </div>

        {/* Status */}
        <div style={{ flexShrink: 0, minWidth: 140, ...(isMobile && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
          <FilterSelect
            label="Status" allLabel="Qualquer status"
            values={statusFilter} onValuesChange={setStatusFilter}
            hideWhenEmpty={false}
            options={[
              { value: "requested",              label: "Rascunho",           pinned: true },
              { value: "awaiting_linking",        label: "Aguard. Vinculação", pinned: true },
              { value: "awaiting_submission",     label: "Aguard. Envio",      pinned: true },
              { value: "awaiting_approval",       label: "Aguard. Aprovação",  pinned: true },
              { value: "awaiting_finalization",   label: "Aguard. Finalização",pinned: true },
              { value: "awaiting_final_review",   label: "Aguard. Revisão",    pinned: true },
              { value: "ready_for_production",    label: "Pronto p/ Produção", pinned: true },
              { value: "inProduction",            label: "Em Produção",        pinned: true },
              { value: "produced",                label: "Produzido",          pinned: true },
              { value: "conferred",               label: "Conferido",          pinned: true },
              { value: "delivered",               label: "Entregue",           pinned: true },
            ]}
            testId="select-status-filter"
            fullWidth
          />
        </div>

        {/* Data */}
        <div style={{ flexShrink: 0, minWidth: 130, ...(isMobile && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
          <FilterSelect
            label="Data" allLabel="Todas as datas"
            values={dateFilter} onValuesChange={setDateFilter}
            hideWhenEmpty={false}
            options={[
              { value: "overdue",    label: "Atrasados",         pinned: true },
              { value: "today",      label: "Hoje",              pinned: true },
              { value: "next3days",  label: "Próximos 3 dias",   pinned: true },
              { value: "next7days",  label: "Próximos 7 dias",   pinned: true },
              { value: "next10days", label: "Próximos 10 dias",  pinned: true },
              { value: "next15days", label: "Próximos 15 dias",  pinned: true },
              { value: "next30days", label: "Próximos 30 dias",  pinned: true },
            ]}
            testId="select-date-filter"
            fullWidth
          />
        </div>

        {/* Divider — hidden on mobile */}
        {!isMobile && <div style={{ width: 1, height: 20, backgroundColor: "#e7e5e4", flexShrink: 0 }} />}

        {/* Counter + clear */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, ...(isMobile && { width: "100%" }) }}>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, fontWeight: 700, color: "#78716c", whiteSpace: "nowrap" }}>
            <span style={{ color: "#1c1917", fontWeight: 900 }}>{filteredItems.length}</span>
            {" "}iten{filteredItems.length !== 1 ? "s" : ""}
          </span>
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              style={{ display: "flex", alignItems: "center", gap: 4, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 5, padding: "3px 10px", fontSize: 11, fontWeight: 700, color: "#f97316", cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap", height: 32 }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#f97316"; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#fff7ed"; (e.currentTarget as HTMLButtonElement).style.color = "#f97316"; }}
            >
              × Limpar
            </button>
          )}
        </div>
      </div>

      {/* ── Grouped table ── */}
      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {isLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : isError ? (
          <div style={{ backgroundColor: "#ffffff", border: "1px solid #fecaca", padding: 48, textAlign: "center" }}>
            <p style={{ color: "#b91c1c", fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>Não foi possível carregar os itens</p>
            <p style={{ color: "#a8a29e", fontSize: 13, margin: "0 0 16px" }}>Verifique sua conexão e tente novamente.</p>
            <button onClick={() => refetch()} style={{ fontSize: 13, fontWeight: 600, color: "#fff", background: "#1c1917", border: "none", borderRadius: 8, padding: "8px 18px", cursor: "pointer" }}>Tentar novamente</button>
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
              <div key={eventKey} style={{ border: "1px solid #e2e2e2", borderRadius: 10, backgroundColor: "#ffffff", overflow: "hidden", boxShadow: "0 2px 8px rgba(28,25,23,0.07)" }}>

                {/* Group header */}
                <div style={{
                  borderBottom: "1px solid #e7e5e4",
                  padding: "13px 18px 13px 20px",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
                  borderLeft: "3px solid #f97316",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div>
                      <h3 style={{
                        fontFamily: "'Space Grotesk', sans-serif",
                        fontWeight: 800, fontSize: 14,
                        textTransform: "uppercase", letterSpacing: "0.01em",
                        color: "#1c1917", margin: 0, lineHeight: 1,
                      }}>
                        {gd.eventName}
                      </h3>
                      <div style={{ display: "flex", gap: 14, marginTop: 5 }}>
                        {firstItem?.event?.startDate && (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: "#78716c" }}>
                            <Calendar style={{ width: 11, height: 11, flexShrink: 0 }} />
                            Início: {format(parseDateLocal(firstItem.event.startDate), "dd MMM yyyy", { locale: ptBR })}
                          </span>
                        )}
                        {firstItem?.event?.truckDepartureDate && (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: "#78716c" }}>
                            <Truck style={{ width: 11, height: 11, flexShrink: 0 }} />
                            Saída: {format(toUTCDisplayDate(firstItem.event.truckDepartureDate), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span style={{
                    padding: "4px 11px", borderRadius: 999,
                    backgroundColor: "#fff7ed", color: "#f97316",
                    border: "1px solid #fed7aa",
                    fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em",
                    whiteSpace: "nowrap",
                  }}>
                    {gd.items.length} {gd.items.length === 1 ? "item" : "itens"}
                  </span>
                </div>

                {/* Table (desktop) / Cards (mobile) */}
                {isMobile ? (
                  <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 0 }}>
                    {(() => {
                      const typeToGroupLocal: Record<string, string> = {};
                      for (const s of standardItems) {
                        if (s.group) typeToGroupLocal[s.name] = s.group;
                      }
                      const groupMap: Record<string, Record<string, any[]>> = {};
                      for (const item of gd.items) {
                        const g = typeToGroupLocal[item.type] || '';
                        if (!groupMap[g]) groupMap[g] = {};
                        if (!groupMap[g][item.type]) groupMap[g][item.type] = [];
                        groupMap[g][item.type].push(item);
                      }
                      const sortedGroups = Object.keys(groupMap).sort((a, b) => {
                        if (a === '') return 1; if (b === '') return -1;
                        return a.localeCompare(b, 'pt-BR');
                      });
                      let cardIdx = 0;
                      return sortedGroups.map(group => (
                        <Fragment key={group || '__nogroup'}>
                          {group && (
                            <div style={{ padding: "6px 4px 4px", marginTop: 6, borderLeft: "3px solid #3b82f6", paddingLeft: 8, backgroundColor: "#e7f0fb", borderRadius: "4px 4px 0 0", overflow: "hidden" }}>
                              <span style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "#1d4ed8", fontFamily: "'Space Grotesk', sans-serif", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {group}
                              </span>
                            </div>
                          )}
                          {Object.entries(groupMap[group]).map(([type, typeItems]) => (
                            <Fragment key={type}>
                              {/* Type sub-header */}
                              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px 4px", borderTop: "2px solid #e7e5e4", marginTop: group ? 0 : 6, overflow: "hidden" }}>
                                <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#44403c", fontFamily: "'Space Grotesk', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}>
                                  {type}
                                </span>
                                <span style={{ fontSize: 9, fontWeight: 800, color: "#78716c", backgroundColor: "#e7e5e4", borderRadius: 999, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>
                                  {typeItems.length}
                                </span>
                              </div>
                              {typeItems.map((item: any) => {
                                const ci = cardIdx++;
                                return (
                                  <div
                                    key={item.id}
                                    data-testid={`item-row-${item.id}`}
                                    onClick={() => setSelectedItem(item)}
                                    style={{
                                      border: "1px solid #e7e5e4",
                                      borderRadius: 8,
                                      padding: "10px 12px",
                                      marginBottom: 8,
                                      backgroundColor: ci % 2 === 1 ? "#f6f4f1" : "#ffffff",
                                      display: "flex",
                                      alignItems: "flex-start",
                                      gap: 8,
                                      cursor: "pointer",
                                      overflow: "hidden",
                                    }}
                                  >
                                    {/* Card content */}
                                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                                      {/* Row 1: ID + type */}
                                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                        <span data-testid={`text-display-id-${item.id}`} style={{ fontFamily: "monospace", fontWeight: 700, color: "#f97316", fontSize: 13, flexShrink: 0 }}>
                                          {item.displayId}
                                        </span>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: "#44403c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{item.type}</span>
                                        {item.isReuse && (
                                          <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", backgroundColor: "#dcfce7", color: "#166534", borderRadius: 999, padding: "2px 7px", flexShrink: 0 }}>
                                            Reaproveit.
                                          </span>
                                        )}
                                      </div>
                                      {/* Row 2: description — allow up to 2 lines on mobile */}
                                      {item.description && (
                                        <span style={{ fontSize: 12, color: "#44403c", fontWeight: 500, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>
                                          {item.description}
                                        </span>
                                      )}
                                      {/* Row 3: status pill */}
                                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                        <StatusPill status={item.status} />
                                      </div>
                                      {/* Row 4: sponsors (sub-row, only shown when present) */}
                                      {item.sponsors && item.sponsors.length > 0 && (
                                        <div style={{ minWidth: 0, overflow: "hidden" }}>
                                          <SponsorChips sponsors={item.sponsors} variant="colored" size="sm" max={2} />
                                        </div>
                                      )}
                                    </div>
                                    {/* Action buttons — compact on mobile */}
                                    <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setSelectedItem(item); }}
                                        data-testid={`button-view-${item.id}`}
                                        style={{
                                          background: "none", border: "1px solid #e7e5e4", cursor: "pointer",
                                          borderRadius: 6, color: "#a8a29e",
                                          display: "flex", alignItems: "center", justifyContent: "center",
                                          height: 36, width: 36,
                                        }}
                                      >
                                        <Eye style={{ width: 15, height: 15 }} />
                                      </button>
                                      {isAdmin && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setDeleteConfirmItemId(item.id); }}
                                          data-testid={`button-delete-${item.id}`}
                                          title="Excluir peça (Admin)"
                                          style={{
                                            background: "none", border: "1px solid #fecaca", cursor: "pointer",
                                            borderRadius: 6, color: "#a8a29e",
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            height: 32, width: 36,
                                          }}
                                        >
                                          <Trash2 style={{ width: 14, height: 14 }} />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </Fragment>
                          ))}
                        </Fragment>
                      ));
                    })()}
                  </div>
                ) : (
                <div style={{ overflowX: "auto", overflowY: "visible" }} className="scrollbar-visible">
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#1c1917" }}>
                        {["ID", "Descrição", "Medidas", "Patrocinador", "Status", ""].map((col, i) => (
                          <th key={i} style={{
                            padding: "12px 20px",
                            fontSize: 11, fontWeight: 900, textTransform: "uppercase",
                            letterSpacing: "0.1em", color: "#ffffff",
                            textAlign: i === 6 ? "right" : "left",
                            whiteSpace: "nowrap",
                          }}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Build type → group map from standardItems
                        const typeToGroup: Record<string, string> = {};
                        for (const s of standardItems) {
                          if (s.group) typeToGroup[s.name] = s.group;
                        }
                        // Group by Grupo Pai first, then by type within each group
                        const groupMap: Record<string, Record<string, any[]>> = {};
                        for (const item of gd.items) {
                          const g = typeToGroup[item.type] || '';
                          if (!groupMap[g]) groupMap[g] = {};
                          if (!groupMap[g][item.type]) groupMap[g][item.type] = [];
                          groupMap[g][item.type].push(item);
                        }
                        const sortedGroups = Object.keys(groupMap).sort((a, b) => {
                          if (a === '') return 1; if (b === '') return -1;
                          return a.localeCompare(b, 'pt-BR');
                        });
                        let globalIdx = 0;
                        return sortedGroups.map(group => (
                          <Fragment key={group || '__nogroup'}>
                            {/* ── Grupo Pai header (only when group exists) ── */}
                            {group && (
                              <tr>
                                 <td colSpan={6} style={{ padding: "7px 20px", backgroundColor: "#e7f0fb", borderTop: "1px solid #c9ddf5", borderBottom: "1px solid #c9ddf5", borderLeft: "3px solid #3b82f6" }}>
                                  <span style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "#1d4ed8", fontFamily: "'Space Grotesk', sans-serif" }}>
                                    {group}
                                  </span>
                                </td>
                              </tr>
                            )}
                            {Object.entries(groupMap[group]).map(([type, typeItems]) => (
                          <Fragment key={type}>
                            {/* ── Type sub-header ── */}
                            <tr>
                              <td colSpan={6} style={{
                                padding: "6px 18px 6px 20px",
                                backgroundColor: "#fafaf9",
                                borderTop: "2px solid #e7e5e4",
                                borderBottom: "1px solid #e7e5e4",
                              }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{
                                    fontSize: 11, fontWeight: 800,
                                    textTransform: "uppercase", letterSpacing: "0.08em",
                                    color: "#44403c",
                                    fontFamily: "'Space Grotesk', sans-serif",
                                  }}>
                                    {type}
                                  </span>
                                  <span style={{
                                    fontSize: 9, fontWeight: 800,
                                    color: "#78716c",
                                    backgroundColor: "#e7e5e4",
                                    borderRadius: 999,
                                    padding: "2px 8px",
                                    textTransform: "uppercase", letterSpacing: "0.06em",
                                  }}>
                                    {typeItems.length}
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
                                       backgroundColor: idx % 2 === 1 ? "#f6f4f1" : "#ffffff",
                                       borderLeft: "3px solid transparent",
                                      cursor: "pointer",
                                      transition: "transform 0.15s, background-color 0.15s",
                                    }}
                                    onMouseEnter={(e) => {
                                      (e.currentTarget as HTMLTableRowElement).style.transform = "translateY(-1px)";
                                       (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "#fff7ed";
                                       (e.currentTarget as HTMLTableRowElement).style.borderLeftColor = "#f97316";
                                    }}
                                    onMouseLeave={(e) => {
                                      (e.currentTarget as HTMLTableRowElement).style.transform = "none";
                                       (e.currentTarget as HTMLTableRowElement).style.backgroundColor = idx % 2 === 1 ? "#f6f4f1" : "#ffffff";
                                       (e.currentTarget as HTMLTableRowElement).style.borderLeftColor = "transparent";
                                    }}
                                  >
                                    {/* ID */}
                                    <td style={{ padding: "10px 18px 10px 20px", whiteSpace: "nowrap" }}>
                                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                        <span data-testid={`text-display-id-${item.id}`} style={{ fontFamily: "monospace", fontWeight: 700, color: "#f97316", fontSize: 13 }}>
                                          {item.displayId}
                                        </span>
                                        {item.isReuse && (
                                          <span style={{ display: "inline-block", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", backgroundColor: "#dcfce7", color: "#166534", borderRadius: 999, padding: "2px 7px", width: "fit-content" }}>
                                            Reaproveit.
                                          </span>
                                        )}
                                        {item.referenceUrl && (
                                          <a href={item.referenceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Ver referência visual do solicitante" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 700, color: "#2563eb", textDecoration: "none", backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 3, padding: "2px 6px", width: "fit-content" }} data-testid={`link-reference-painel-${item.id}`}>
                                            <Paperclip style={{ width: 9, height: 9 }} />
                                            Ref. visual
                                          </a>
                                        )}
                                        {item.bookUrl && (
                                          <a href={item.bookUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Abrir book de aprovação (PDF) enviado pela Arte" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 700, color: "#6d28d9", textDecoration: "none", backgroundColor: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 3, padding: "2px 6px", width: "fit-content" }} data-testid={`link-book-painel-${item.id}`}>
                                            <FileText style={{ width: 9, height: 9 }} />
                                            Book
                                          </a>
                                        )}
                                      </div>
                                    </td>

                                            {/* Descrição */}
                                    <td style={{ padding: "10px 18px", maxWidth: 260 }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                                        {item.description ? (
                                          <span style={{ fontSize: 12, color: "#44403c", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1, minWidth: 0 }}>
                                            {item.description}
                                          </span>
                                        ) : (
                                          <span style={{ color: "#c4bfbb", fontSize: 12 }}>—</span>
                                        )}
                                        {item.observations && (
                                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0, fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#78716c", backgroundColor: "#f0ede9", border: "1px solid #e2ddd8", borderRadius: 4, padding: "2px 6px", whiteSpace: "nowrap" }}>
                                            ↩ {item.observations}
                                          </span>
                                        )}
                                      </div>
                                    </td>

                                    {/* Medidas */}
                                    <td style={{ padding: "10px 18px", whiteSpace: "nowrap" }}>
                                      {(item.visualWidth && item.visualHeight) || (item.fileWidth && item.fileHeight) ? (
                                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                          {item.visualWidth && item.visualHeight && (
                                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                              <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#a8a29e", width: 30 }}>VIS</span>
                                              <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#44403c" }}>
                                                {item.visualWidth} × {item.visualHeight}
                                              </span>
                                            </div>
                                          )}
                                          {item.fileWidth && item.fileHeight && (
                                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                              <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#a8a29e", width: 30 }}>ARQ</span>
                                              <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#78716c" }}>
                                                {item.fileWidth} × {item.fileHeight}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <span style={{ color: "#a8a29e", fontSize: 12 }}>—</span>
                                      )}
                                    </td>

                                    {/* Patrocinador */}
                                    <td style={{ padding: "10px 18px" }}>
                                      <SponsorChips sponsors={item.sponsors ?? []} variant="colored" size="sm" max={4} />
                                    </td>

                                    {/* Status */}
                                    <td style={{ padding: "10px 18px", whiteSpace: "nowrap" }}>
                                      <StatusPill status={item.status} />
                                    </td>

                                    {/* Ação */}
                                    <td style={{ padding: "10px 18px", textAlign: "right" }}>
                                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
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
                                        {isAdmin && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setDeleteConfirmItemId(item.id); }}
                                            data-testid={`button-delete-${item.id}`}
                                            title="Excluir peça (Admin)"
                                            style={{
                                              background: "none", border: "none", cursor: "pointer",
                                              padding: 4, borderRadius: 4, color: "#a8a29e",
                                              display: "flex", alignItems: "center", justifyContent: "center",
                                              transition: "color 0.15s",
                                            }}
                                            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#dc2626")}
                                            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#a8a29e")}
                                          >
                                            <Trash2 style={{ width: 15, height: 15 }} />
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>

                                </Fragment>
                              );
                            })}
                          </Fragment>
                            ))}
                          </Fragment>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
                )}
              </div>
            );
          })
        )}
      </section>

      {/* ── Exportar PDF — mesmo modal da Arte e do Atendimento ── */}
      <ExportPdfDialog
        open={showExportPDFModal}
        onOpenChange={setShowExportPDFModal}
        items={items}
        title="Peças"
      />

      {/* ── Item details modal ── */}
      <ItemDetailsDialog
        item={selectedItem}
        auditLogs={auditLogs}
        open={!!selectedItem}
        onOpenChange={(open) => !open && setSelectedItem(null)}
      />

      {/* ── Delete confirmation (Admin only) ── */}
      <AlertDialog open={!!deleteConfirmItemId} onOpenChange={open => { if (!open) setDeleteConfirmItemId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir peça?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirmItemId && (() => {
                const item = items.find((i: any) => i.id === deleteConfirmItemId);
                return item
                  ? `A peça "${item.displayId} — ${item.type}" será removida da lista, mas permanece no histórico de auditoria.`
                  : "A peça será removida da lista, mas permanece no histórico de auditoria.";
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteItemMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmItemId && deleteItemMutation.mutate(deleteConfirmItemId)}
              disabled={deleteItemMutation.isPending}
              style={{ backgroundColor: "#dc2626", color: "#fff" }}
              data-testid="button-confirm-delete"
            >
              {deleteItemMutation.isPending ? "Excluindo..." : "Excluir Peça"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
