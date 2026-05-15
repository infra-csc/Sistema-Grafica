import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle, AlertCircle, Eye, FileText, Search, X, FileImage, Maximize2, Trash2, Paperclip } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState, useMemo, useEffect, Fragment } from "react";

const TI = {
  bg: "#fafaf9", surface: "#ffffff", border: "#e7e5e4",
  text: "#1c1917", secondary: "#78716c", muted: "#a8a29e",
  accent: "#f97316", dark: "#0c0a09",
};

export default function Solicitacao() {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [returnObservations, setReturnObservations] = useState("");
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [releaseConfirmOpen, setReleaseConfirmOpen] = useState(false);
  const [bulkReleaseConfirmOpen, setBulkReleaseConfirmOpen] = useState(false);
  const [bulkReturnConfirmOpen, setBulkReturnConfirmOpen] = useState(false);
  const [bulkReturnObservations, setBulkReturnObservations] = useState("");
  const [bulkCancelConfirmOpen, setBulkCancelConfirmOpen] = useState(false);
  const [bulkCancelObservations, setBulkCancelObservations] = useState("");
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelObservations, setCancelObservations] = useState("");
  const [returnConfirmOpen, setReturnConfirmOpen] = useState(false);
  const [deleteConfirmItemId, setDeleteConfirmItemId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [itemTypeFilter, setItemTypeFilter] = useState<string>("all");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  const { data: items = [], isLoading: itemsLoading } = useQuery<any[]>({ queryKey: ["/api/items"] });
  const { data: events = [], isLoading: eventsLoading } = useQuery<any[]>({ queryKey: ["/api/events"] });
  const { data: sponsors = [] } = useQuery<any[]>({ queryKey: ["/api/sponsors"] });
  const { data: auditLogs = [] } = useQuery<any[]>({ queryKey: ["/api/audit-logs"] });
  const { data: standardItems = [] } = useQuery<any[]>({ queryKey: ['/api/standard-items'] });
  const typeToGroup = useMemo(() => {
    const map: Record<string, string> = {};
    (standardItems as any[]).forEach((s: any) => { if (s.group) map[s.name] = s.group; });
    return map;
  }, [standardItems]);

  const creatorReviewMutation = useMutation({
    mutationFn: async (itemId: string) => await apiRequest("PATCH", `/api/items/${itemId}/creator-review`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setModalOpen(false); setSelectedItem(null); setReleaseConfirmOpen(false);
      toast({ title: "Peça liberada para produção!", description: "A peça foi revisada e liberada para a gráfica." });
    },
    onError: (error: any) => toast({ title: "Erro ao liberar peça", description: error.message, variant: "destructive" }),
  });

  const bulkReleaseMutation = useMutation({
    mutationFn: async (itemIds: string[]) => await apiRequest("PATCH", `/api/items/bulk-creator-review`, { itemIds }),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSelectedItemIds(new Set()); setBulkReleaseConfirmOpen(false);
      toast({ title: "Peças liberadas", description: `${result.released ?? selectedItemIds.size} peças foram liberadas para produção.` });
    },
    onError: (error: any) => toast({ title: "Erro ao liberar peças", description: error.message, variant: "destructive" }),
  });

  const returnToArteMutation = useMutation({
    mutationFn: async (payload: { itemId: string; notes: string }) =>
      await apiRequest("POST", `/api/items/${payload.itemId}/return-to-arte`, { notes: payload.notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setModalOpen(false); setSelectedItem(null);
      setReturnConfirmOpen(false); setReturnObservations(""); setShowReturnForm(false);
      toast({ title: "Peça devolvida para Arte", description: "A peça foi devolvida com observações." });
    },
    onError: (error: any) => toast({ title: "Erro ao devolver peça", description: error.message, variant: "destructive" }),
  });

  const bulkCancelMutation = useMutation({
    mutationFn: async (payload: { itemIds: string[]; notes?: string }) =>
      await apiRequest("PATCH", `/api/items/bulk-cancel`, { itemIds: payload.itemIds, notes: payload.notes }),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSelectedItemIds(new Set()); setSelectedItem(null);
      setModalOpen(false); setCancelConfirmOpen(false); setBulkCancelConfirmOpen(false);
      toast({ title: "Peças canceladas", description: `${result.canceled} peça(s) cancelada(s).` });
    },
    onError: (error: any) => toast({ title: "Erro ao cancelar", description: error.message, variant: "destructive" }),
  });

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

  const pendingItems = useMemo(() => items.filter(item => item.status === "awaiting_final_review"), [items]);

  const filteredItems = useMemo(() => pendingItems.filter(item => {
    const matchesSearch = searchTerm === "" ||
      item.type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.displayId?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEvent = eventFilter === "all" || item.eventId === eventFilter;
    const matchesType = itemTypeFilter === "all" || item.type === itemTypeFilter;
    return matchesSearch && matchesEvent && matchesType;
  }), [pendingItems, searchTerm, eventFilter, itemTypeFilter]);

  const uniqueItemTypes = useMemo(() => Array.from(new Set(pendingItems.map(i => i.type).filter(Boolean))).sort(), [pendingItems]);
  const eventsWithItems = useMemo(() => {
    const ids = new Set(pendingItems.map(i => i.eventId));
    return events.filter(e => ids.has(e.id));
  }, [pendingItems, events]);

  const itemsByEvent = useMemo(() => {
    const map = new Map<string, any[]>();
    const sorted = [...filteredItems].sort((a, b) => {
      const ea = a.event?.name || "", eb = b.event?.name || "";
      const ga = typeToGroup[a.type] || '', gb = typeToGroup[b.type] || '';
      return ea.localeCompare(eb) || ga.localeCompare(gb) || a.type.localeCompare(b.type);
    });
    sorted.forEach(item => {
      const key = item.eventId || "__none__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    return map;
  }, [filteredItems, typeToGroup]);

  const getEventInfo = (eventId: string) => events.find(e => e.id === eventId);
  const itemAuditLogs = useMemo(() => selectedItem
    ? auditLogs.filter((l: any) => l.entityId === selectedItem.id).slice(0, 8)
    : [], [auditLogs, selectedItem]);

  const toggleItem = (id: string) => setSelectedItemIds(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });
  const toggleAll = () => {
    selectedItemIds.size === filteredItems.length && filteredItems.length > 0
      ? setSelectedItemIds(new Set())
      : setSelectedItemIds(new Set(filteredItems.map(i => i.id)));
  };

  const openModal = (item: any) => {
    setSelectedItem(item); setShowReturnForm(false); setReturnObservations(""); setModalOpen(true);
  };

  useEffect(() => {
    if (!modalOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !showReturnForm && selectedItem) setReleaseConfirmOpen(true);
      if (e.key === "Escape") setModalOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modalOpen, showReturnForm, selectedItem]);

  if (itemsLoading || eventsLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: TI.accent }} />
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: TI.bg, height: "100%", overflowY: "auto" }}>

      {/* ── 1. HERO HEADER ─────────────────────────────────────────────── */}
      <section style={{ backgroundColor: "#0c0a09", color: "#fff", padding: "48px 32px", position: "relative", overflow: "hidden" }}>
        {/* Decorative icon */}
        <div style={{ position: "absolute", right: -60, top: "50%", transform: "translateY(-50%)", opacity: 0.04, pointerEvents: "none", fontSize: 280, lineHeight: 1, userSelect: "none", color: "#fff" }}>
          <Eye style={{ width: 280, height: 280 }} />
        </div>

        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: 32, position: "relative", zIndex: 1 }}>
          {/* Left */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20, flex: 1 }}>
            <span style={{
              display: "inline-block", padding: "4px 12px",
              backgroundColor: "#1c1917", fontSize: 10, fontWeight: 700,
              letterSpacing: "0.18em", textTransform: "uppercase", color: "#a8a29e",
              borderLeft: "2px solid #f97316",
            }}>
              REVISÃO FINAL · SOLICITAÇÃO
            </span>
            <h1 style={{
              fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900,
              fontSize: 56, letterSpacing: "-0.04em", color: "#fff",
              lineHeight: 1, margin: 0,
            }}>
              Revisão do Criador
            </h1>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                backgroundColor: "#1c1917", padding: "8px 16px", borderRadius: 8,
                border: "1px solid #292524",
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#f97316", flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#78716c" }}>Aguardando:</span>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18, color: "#fff" }}>{pendingItems.length}</span>
              </div>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                backgroundColor: "#1c1917", padding: "8px 16px", borderRadius: 8,
                border: "1px solid #292524",
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#10b981", flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#78716c" }}>Selecionadas:</span>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18, color: "#f97316" }}>{selectedItemIds.size}</span>
              </div>
            </div>
          </div>

          {/* Right — quick action panel */}
          <div style={{
            backgroundColor: "rgba(28,25,23,0.8)", backdropFilter: "blur(12px)",
            padding: 24, borderRadius: 12, border: "1px solid #292524",
            width: 280, display: "flex", flexDirection: "column", gap: 16, flexShrink: 0,
          }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: "#57534e", letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>AÇÃO RÁPIDA</p>
            <button
              onClick={() => selectedItemIds.size > 0 && setBulkReleaseConfirmOpen(true)}
              disabled={selectedItemIds.size === 0}
              data-testid="button-bulk-release-hero"
              style={{
                width: "100%", padding: "12px 0", borderRadius: 6, border: "none",
                backgroundColor: selectedItemIds.size === 0 ? "#292524" : "#9d4300",
                color: selectedItemIds.size === 0 ? "#57534e" : "#fff",
                fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em",
                cursor: selectedItemIds.size === 0 ? "not-allowed" : "pointer",
              }}>
              Liberar Selecionadas {selectedItemIds.size > 0 && `(${selectedItemIds.size})`}
            </button>
            <button
              onClick={() => selectedItemIds.size > 0 && setBulkReturnConfirmOpen(true)}
              disabled={selectedItemIds.size === 0}
              data-testid="button-bulk-return-hero"
              style={{
                width: "100%", padding: "12px 0", borderRadius: 6,
                border: "1px solid #44403c",
                backgroundColor: "transparent",
                color: selectedItemIds.size === 0 ? "#44403c" : "#d6d3d1",
                fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em",
                cursor: selectedItemIds.size === 0 ? "not-allowed" : "pointer",
              }}>
              Devolver Selecionadas {selectedItemIds.size > 0 && `(${selectedItemIds.size})`}
            </button>
          </div>
        </div>
      </section>

      {/* ── 2. FILTER BAR ──────────────────────────────────────────────── */}
      <section style={{
        backgroundColor: "#fff", padding: "12px 32px",
        borderBottom: `1px solid ${TI.border}`,
        position: "sticky", top: 0, zIndex: 30,
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: TI.muted, pointerEvents: "none" }} />
            <input
              placeholder="Filtrar por ID ou descrição..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              data-testid="input-search"
              style={{ width: "100%", paddingLeft: 34, paddingRight: searchTerm ? 32 : 12, paddingTop: 9, paddingBottom: 9, backgroundColor: "#f3f4f3", border: "none", borderRadius: 8, fontSize: 13, color: TI.text, outline: "none", boxSizing: "border-box" }}
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: TI.muted, padding: 0 }}>
                <X style={{ width: 13, height: 13 }} />
              </button>
            )}
          </div>

          {/* Event select */}
          <select
            value={eventFilter}
            onChange={e => setEventFilter(e.target.value)}
            data-testid="select-event-filter"
            style={{ backgroundColor: "#f3f4f3", border: "none", borderRadius: 8, fontSize: 13, padding: "9px 14px", color: TI.text, minWidth: 180, cursor: "pointer", outline: "none" }}
          >
            <option value="all">Todos os Eventos</option>
            {eventsWithItems.sort((a, b) => a.name.localeCompare(b.name)).map(ev => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>

          {/* Type select */}
          <select
            value={itemTypeFilter}
            onChange={e => setItemTypeFilter(e.target.value)}
            data-testid="select-type-filter"
            style={{ backgroundColor: "#f3f4f3", border: "none", borderRadius: 8, fontSize: 13, padding: "9px 14px", color: TI.text, minWidth: 150, cursor: "pointer", outline: "none" }}
          >
            <option value="all">Tipo de Peça</option>
            {uniqueItemTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {(searchTerm || eventFilter !== "all" || itemTypeFilter !== "all") && (
            <button
              onClick={() => { setSearchTerm(""); setEventFilter("all"); setItemTypeFilter("all"); }}
              data-testid="button-clear-filters"
              style={{ fontSize: 11, fontWeight: 700, color: TI.secondary, textTransform: "uppercase", letterSpacing: "0.08em", background: "none", border: "none", cursor: "pointer", padding: "0 8px" }}>
              Limpar filtros
            </button>
          )}

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {filteredItems.length > 0 && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: TI.secondary, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={selectedItemIds.size === filteredItems.length && filteredItems.length > 0}
                  onChange={toggleAll}
                  data-testid="checkbox-select-all"
                  style={{ accentColor: TI.accent, width: 14, height: 14 }}
                />
                Selecionar todos
              </label>
            )}
            <span style={{ fontSize: 11, color: TI.muted, whiteSpace: "nowrap" }}>
              {filteredItems.length} de {pendingItems.length} peças
            </span>
          </div>
        </div>
      </section>

      {/* ── 3 & 4. HIGH-DENSITY TABLE ──────────────────────────────────── */}
      <section style={{ padding: "32px", maxWidth: 1200, margin: "0 auto", paddingBottom: 80 }}>
        {filteredItems.length === 0 ? (
          <div style={{ backgroundColor: "#fff", border: "1px solid #e7e5e4", borderRadius: 8, textAlign: "center", padding: "80px 24px" }}>
            <CheckCircle style={{ width: 48, height: 48, color: "#d1cfce", margin: "0 auto 16px" }} />
            <p style={{ fontSize: 16, fontWeight: 700, color: TI.secondary, margin: "0 0 8px" }}>
              {pendingItems.length === 0 ? "Tudo revisado!" : "Nenhum resultado encontrado"}
            </p>
            <p style={{ fontSize: 13, color: TI.muted, margin: 0 }}>
              {pendingItems.length === 0 ? "Não há itens aguardando sua revisão no momento." : "Tente ajustar os filtros."}
            </p>
          </div>
        ) : (
          <div style={{ backgroundColor: "#fff", border: "1px solid #e7e5e4", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
            <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "#fafaf9", borderBottom: "1px solid #e7e5e4" }}>
                  {/* Select all */}
                  <th style={{ padding: "14px 24px", width: 48, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={selectedItemIds.size === filteredItems.length && filteredItems.length > 0}
                      onChange={toggleAll}
                      data-testid="checkbox-select-all"
                      style={{ accentColor: "#f97316", width: 14, height: 14, cursor: "pointer" }}
                    />
                  </th>
                  {[
                    { label: "ID", w: 120 },
                    { label: "Tipo", w: 160 },
                    { label: "Descrição da Peça", w: undefined },
                    { label: "Qtd", w: 64, center: true },
                    { label: "Dim (LxA)", w: 128 },
                    { label: "M²", w: 80 },
                    { label: "Ações", w: 120, right: true },
                  ].map(col => (
                    <th
                      key={col.label}
                      style={{
                        padding: "14px 16px",
                        width: col.w,
                        textAlign: col.right ? "right" : col.center ? "center" : "left",
                        fontSize: 10, fontWeight: 900,
                        textTransform: "uppercase", letterSpacing: "0.1em",
                        color: "#78716c",
                      }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from(itemsByEvent.entries()).map(([eventId, eventItems]) => {
                  const event = getEventInfo(eventId);
                  const groupSelected = eventItems.every(i => selectedItemIds.has(i.id));
                  const toggleGroup = () => {
                    setSelectedItemIds(prev => {
                      const next = new Set(prev);
                      if (groupSelected) eventItems.forEach(i => next.delete(i.id));
                      else eventItems.forEach(i => next.add(i.id));
                      return next;
                    });
                  };

                  return (
                    <>
                      {/* ── Group header row ── */}
                      <tr key={`group-${eventId}`} style={{ backgroundColor: "#1c1917", borderTop: "1px solid #292524", borderBottom: "1px solid #292524" }}>
                        <td style={{ padding: "10px 24px", textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={groupSelected}
                            onChange={toggleGroup}
                            data-testid={`checkbox-group-${eventId}`}
                            style={{ accentColor: "#f97316", width: 14, height: 14, cursor: "pointer", backgroundColor: "#292524" }}
                          />
                        </td>
                        <td colSpan={7} style={{ padding: "10px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <span style={{
                                fontFamily: "'Space Grotesk', sans-serif",
                                fontSize: 11, fontWeight: 900,
                                color: "#fff", textTransform: "uppercase", letterSpacing: "0.06em",
                              }}>
                                {event?.name || "Sem Evento"}
                              </span>
                              <span style={{
                                backgroundColor: "#ea580c", color: "#fff",
                                fontSize: 9, fontWeight: 900,
                                padding: "1px 8px", borderRadius: 999,
                                textTransform: "uppercase", letterSpacing: "0.04em",
                              }}>
                                {eventItems.length} PENDENTE{eventItems.length !== 1 ? "S" : ""}
                              </span>
                            </div>
                            {event && (
                              <div style={{ display: "flex", gap: 12, fontSize: 9, color: "#57534e", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", flexWrap: "wrap", alignItems: "center" }}>
                                {event.startDate && (
                                  <span>Início: <span style={{ color: "#d6d3d1" }}>{new Date(event.startDate).toLocaleDateString("pt-BR")}</span></span>
                                )}
                                {event.truckDepartureDate && (
                                  <span>Saída: <span style={{ color: "#d6d3d1" }}>{new Date(event.truckDepartureDate).toLocaleDateString("pt-BR")} {new Date(event.truckDepartureDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span></span>
                                )}
                                {event.truckDepartureDate && (() => {
                                  const dls = [
                                    { label: "Lista de Imagens", days: event.deadlineListaImagens  ?? -25 },
                                    { label: "Revisão de Lista", days: event.deadlineRevisaoLista   ?? -8  },
                                  ];
                                  const tod = new Date(); tod.setHours(0,0,0,0);
                                  return dls.map(({ label, days }) => {
                                    const d = new Date(new Date(event.truckDepartureDate).getTime() + days * 86400000);
                                    d.setHours(0,0,0,0);
                                    const diff = Math.ceil((d.getTime() - tod.getTime()) / 86400000);
                                    const ds = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                                    const s = diff < 0
                                      ? { bg: "rgba(255,80,80,0.22)", border: "rgba(255,80,80,0.38)", text: "#ffb3b3" }
                                      : diff === 0
                                      ? { bg: "rgba(255,200,80,0.28)", border: "rgba(255,200,80,0.45)", text: "#ffe59c" }
                                      : diff <= 3
                                      ? { bg: "rgba(255,160,50,0.22)", border: "rgba(255,160,50,0.38)", text: "#ffc78a" }
                                      : { bg: "rgba(255,255,255,0.12)", border: "rgba(255,255,255,0.2)", text: "rgba(255,255,255,0.72)" };
                                    return (
                                      <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 4, backgroundColor: s.bg, border: `1px solid ${s.border}`, borderRadius: 99, padding: "3px 9px", fontSize: 10, fontWeight: 700, color: s.text, letterSpacing: "0.04em", whiteSpace: "nowrap", textTransform: "none" }}>
                                        {label} · {ds}{diff >= 0 && diff <= 14 && <span style={{ opacity: 0.65, fontWeight: 500 }}> ({diff}d)</span>}
                                      </span>
                                    );
                                  });
                                })()}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* ── Item rows ── */}
                      {eventItems.map((item, idx) => {
                        const isSelected = selectedItemIds.has(item.id);
                        const isLast = idx === eventItems.length - 1;
                        const prevItem = idx > 0 ? eventItems[idx - 1] : null;
                        const showTypeHeader = !prevItem || prevItem.type !== item.type;
                        const itemGroupName = typeToGroup[item.type] || '';
                        const prevItemGroupName = prevItem ? (typeToGroup[prevItem.type] || '') : '';
                        const showGroupHeader = showTypeHeader && itemGroupName !== '' && itemGroupName !== prevItemGroupName;
                        return (
                          <Fragment key={item.id}>
                            {showGroupHeader && (
                              <tr style={{ backgroundColor: '#dbeafe' }}>
                                <td colSpan={8} style={{ padding: '5px 16px' }}>
                                  <span style={{ fontSize: 10, fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{itemGroupName}</span>
                                </td>
                              </tr>
                            )}
                            {showTypeHeader && (
                              <tr style={{ backgroundColor: '#f0ede8' }}>
                                <td colSpan={8} style={{ padding: '5px 16px' }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: '#57534e', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.type}</span>
                                </td>
                              </tr>
                            )}
                          <tr
                            key={`row-${item.id}`}
                            data-testid={`row-item-${item.id}`}
                            style={{
                              borderBottom: isLast ? "none" : "1px solid #f0efee",
                              backgroundColor: isSelected ? "#fff8f5" : "#fff",
                              transition: "background-color 0.1s",
                              cursor: "default",
                            }}
                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = "#fafaf9"; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = isSelected ? "#fff8f5" : "#fff"; }}
                          >
                            {/* Checkbox */}
                            <td style={{ padding: "14px 24px", textAlign: "center" }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleItem(item.id)}
                                data-testid={`checkbox-item-${item.id}`}
                                style={{ accentColor: "#f97316", width: 14, height: 14, cursor: "pointer" }}
                              />
                            </td>

                            {/* ID */}
                            <td style={{ padding: "14px 16px" }}>
                              <span
                                data-testid={`text-display-id-${item.id}`}
                                style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#c2410c", letterSpacing: "-0.02em" }}
                              >
                                {item.displayId}
                              </span>
                            </td>

                            {/* Tipo */}
                            <td style={{ padding: "14px 16px" }}>
                              <span style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", color: TI.text, letterSpacing: "0.02em" }}>
                                {item.type}
                              </span>
                            </td>

                            {/* Descrição */}
                            <td style={{ padding: "14px 16px" }}>
                              <span style={{ fontSize: 13, fontWeight: 500, color: TI.secondary }}>
                                {item.description || "—"}
                              </span>
                              {item.referenceUrl && (
                                <a href={item.referenceUrl} target="_blank" rel="noopener noreferrer" title="Ver referência visual" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 700, color: '#2563eb', textDecoration: 'none', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 3, padding: '2px 6px', marginTop: 4, marginLeft: 4 }} data-testid={`link-reference-solicitacao-${item.id}`}>
                                  <Paperclip style={{ width: 9, height: 9 }} />
                                  Ref. visual
                                </a>
                              )}
                            </td>

                            {/* Qtd */}
                            <td style={{ padding: "14px 16px", textAlign: "center" }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: TI.text }}>
                                {item.quantity}
                              </span>
                            </td>

                            {/* Dimensões */}
                            <td style={{ padding: "14px 16px" }}>
                              <span style={{ fontFamily: "monospace", fontSize: 11, color: TI.secondary }}>
                                {item.fileWidth && item.fileHeight ? `${item.fileWidth}x${item.fileHeight}` : "—"}
                              </span>
                            </td>

                            {/* M² */}
                            <td style={{ padding: "14px 16px" }}>
                              <span style={{ fontSize: 12, fontWeight: 900, color: item.calculatedM2 ? TI.text : TI.muted }}>
                                {item.calculatedM2 || "—"}
                              </span>
                            </td>

                            {/* Ação */}
                            <td style={{ padding: "14px 16px", textAlign: "right" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                                <button
                                  onClick={() => openModal(item)}
                                  data-testid={`button-review-${item.id}`}
                                  style={{
                                    backgroundColor: "#1c1917", color: "#fff",
                                    border: "none", borderRadius: 4,
                                    fontSize: 9, fontWeight: 900,
                                    textTransform: "uppercase", letterSpacing: "0.08em",
                                    padding: "6px 16px", cursor: "pointer",
                                    transition: "background-color 0.15s",
                                  }}
                                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#ea580c")}
                                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#1c1917")}
                                >
                                  Revisar
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmItemId(item.id)}
                                  data-testid={`button-delete-${item.id}`}
                                  title="Excluir peça"
                                  style={{
                                    background: "none", border: "none", cursor: "pointer",
                                    color: "#a8a29e", padding: "4px",
                                    display: "flex", alignItems: "center",
                                    borderRadius: 4, transition: "color 0.15s",
                                  }}
                                  onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
                                  onMouseLeave={e => (e.currentTarget.style.color = "#a8a29e")}
                                >
                                  <Trash2 style={{ width: 15, height: 15 }} />
                                </button>
                              </div>
                            </td>
                          </tr>
                          </Fragment>
                        );
                      })}
                    </>
                  );
                })}
              </tbody>
            </table>

            {/* Table footer */}
            <div style={{
              backgroundColor: "#fafaf9", padding: "12px 24px",
              borderTop: "1px solid #e7e5e4",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: TI.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Mostrando {filteredItems.length} de {pendingItems.length} iten{pendingItems.length !== 1 ? "s" : ""} pendente{pendingItems.length !== 1 ? "s" : ""}
              </span>
              {selectedItemIds.size > 0 && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setBulkReleaseConfirmOpen(true)}
                    data-testid="button-bulk-release-table"
                    style={{ fontSize: 10, fontWeight: 700, padding: "5px 14px", borderRadius: 4, backgroundColor: "#1c1917", color: "#fff", border: "none", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em" }}
                  >
                    Liberar {selectedItemIds.size}
                  </button>
                  <button
                    onClick={() => setBulkReturnConfirmOpen(true)}
                    data-testid="button-bulk-return-table"
                    style={{ fontSize: 10, fontWeight: 700, padding: "5px 14px", borderRadius: 4, backgroundColor: "transparent", color: "#b91c1c", border: "1px solid #b91c1c", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em" }}
                  >
                    Devolver {selectedItemIds.size}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── 5. REVIEW MODAL ────────────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={open => { setModalOpen(open); if (!open) { setShowReturnForm(false); setReturnObservations(""); } }}>
        <DialogContent className="max-w-6xl p-0 gap-0 rounded-xl overflow-hidden flex flex-col [&>button:last-child]:hidden" style={{ height: "87vh", maxHeight: 900 }} onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

            {/* Left column — art visualizer (40%) */}
            <div style={{ width: "40%", backgroundColor: "#f3f4f3", display: "flex", flexDirection: "column", borderRight: "1px solid #e7e5e4", overflow: "hidden" }}>
              {/* Left header */}
              <div style={{ padding: "12px 16px", backgroundColor: "#673AB7", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#fff" }}>Visualizador de Arte</span>
                <Maximize2 style={{ width: 16, height: 16, color: "rgba(255,255,255,0.7)" }} />
              </div>

              {/* Left content */}
              <div style={{ flex: 1, padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Art preview */}
                <div style={{ aspectRatio: "1/1", width: "100%", backgroundColor: "#fff", borderRadius: 8, overflow: "hidden", border: "1px solid #e7e5e4", boxShadow: "inset 0 1px 4px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {selectedItem?.approvalThumbUrl && /\.(png|jpg|jpeg|gif|webp)/i.test(selectedItem.approvalThumbUrl) ? (
                    <img src={selectedItem.approvalThumbUrl} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  ) : selectedItem?.approvalThumbUrl ? (
                    <div style={{ textAlign: "center", padding: 24 }}>
                      <FileText style={{ width: 40, height: 40, color: "#a8a29e", margin: "0 auto 8px" }} />
                      <a href={selectedItem.approvalThumbUrl} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 12, color: "#f97316", fontWeight: 600, textDecoration: "none" }}>
                        Abrir PDF de Aprovação
                      </a>
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", color: "#a8a29e" }}>
                      <FileImage style={{ width: 40, height: 40, margin: "0 auto 8px" }} />
                      <p style={{ fontSize: 12 }}>Sem thumb disponível</p>
                    </div>
                  )}
                </div>

                {/* File path */}
                <div>
                  <p style={{ fontSize: 10, fontWeight: 900, color: TI.secondary, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Caminho do Arquivo Final</p>
                  {selectedItem?.finalFileUrl ? (
                    <div style={{ backgroundColor: "#e2e2e2", padding: "8px 10px", borderRadius: 6, fontFamily: "monospace", fontSize: 10, color: "#57534e", wordBreak: "break-all" }}>
                      {selectedItem.finalFileUrl}
                    </div>
                  ) : (
                    <div style={{ backgroundColor: "#fff0ee", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 10px", fontSize: 11, color: "#b91c1c", fontWeight: 600 }}>
                      Nenhum arquivo final enviado
                    </div>
                  )}
                </div>

                {/* Technical metadata grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    { label: "Tipo", value: selectedItem?.type || "—" },
                    { label: "Material", value: selectedItem?.material || "—" },
                    { label: "Acabamento", value: selectedItem?.finish || "—" },
                    { label: "Quantidade", value: selectedItem?.quantity ? `${selectedItem.quantity}x` : "—" },
                    { label: "Dimensões", value: selectedItem?.fileWidth && selectedItem?.fileHeight ? `${selectedItem.fileWidth}×${selectedItem.fileHeight}` : "—" },
                    { label: "M²", value: selectedItem?.calculatedM2 || "—" },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ backgroundColor: "#fff", padding: "10px 12px", borderRadius: 8, border: "1px solid #e7e5e4" }}>
                      <p style={{ fontSize: 9, color: "#a8a29e", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em", margin: 0 }}>{label}</p>
                      <p style={{ fontSize: 11, fontWeight: 700, color: TI.text, margin: "3px 0 0" }}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right column — decision & timeline (60%) */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", backgroundColor: "#fff", overflow: "hidden" }}>
              {/* Right header */}
              <div style={{ padding: "20px 24px", borderBottom: "1px solid #f0efee", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0 }}>
                <div>
                  <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 22, textTransform: "uppercase", letterSpacing: "-0.03em", color: TI.text, margin: 0 }}>
                    Decisão de Revisão
                  </h2>
                  <p style={{ fontSize: 13, color: TI.secondary, margin: "4px 0 0" }}>
                    {selectedItem?.displayId && `ID: ${selectedItem.displayId}`}
                    {selectedItem?.type && ` | ${selectedItem.type}`}
                  </p>
                </div>
                <button
                  onClick={() => setModalOpen(false)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: TI.muted, padding: 4, display: "flex", borderRadius: 6 }}
                  onMouseEnter={e => (e.currentTarget.style.color = TI.text)}
                  onMouseLeave={e => (e.currentTarget.style.color = TI.muted)}
                >
                  <X style={{ width: 20, height: 20 }} />
                </button>
              </div>

              {/* Right body */}
              <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px", display: "flex", flexDirection: "column", gap: 28 }}>

                {/* Action card (dark) */}
                <div style={{ backgroundColor: "#0c0a09", padding: 28, borderRadius: 12, display: "flex", flexDirection: "column", gap: 20 }}>
                  <div style={{ display: "flex", gap: 12 }}>
                    <button
                      onClick={() => setReleaseConfirmOpen(true)}
                      disabled={creatorReviewMutation.isPending || !selectedItem?.finalFileUrl}
                      data-testid="button-release-modal"
                      title={!selectedItem?.finalFileUrl ? "Arquivo final não enviado" : ""}
                      style={{
                        flex: 1, padding: "14px 0", borderRadius: 6, border: "none",
                        backgroundColor: !selectedItem?.finalFileUrl ? "#292524" : "#9d4300",
                        color: !selectedItem?.finalFileUrl ? "#57534e" : "#fff",
                        fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em",
                        cursor: !selectedItem?.finalFileUrl || creatorReviewMutation.isPending ? "not-allowed" : "pointer",
                      }}
                    >
                      {creatorReviewMutation.isPending ? "Liberando..." : "Liberar para Produção"}
                    </button>
                    <button
                      onClick={() => setShowReturnForm(f => !f)}
                      data-testid="button-return-toggle"
                      style={{
                        flex: 1, padding: "14px 0", borderRadius: 6,
                        border: "1px solid #44403c", backgroundColor: "transparent",
                        color: "#d6d3d1", fontSize: 12, fontWeight: 900,
                        textTransform: "uppercase", letterSpacing: "0.12em", cursor: "pointer",
                      }}
                    >
                      Devolver para Arte
                    </button>
                  </div>

                  {/* Return form */}
                  {showReturnForm && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <textarea
                        placeholder="Adicionar observação técnica para a equipe..."
                        value={returnObservations}
                        onChange={e => setReturnObservations(e.target.value)}
                        data-testid="textarea-return-observations"
                        style={{
                          width: "100%", minHeight: 100, padding: 14, borderRadius: 8,
                          backgroundColor: "#1c1917", border: "1px solid #44403c",
                          color: "#fff", fontSize: 13, resize: "none", outline: "none",
                          fontFamily: "inherit", boxSizing: "border-box",
                        }}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => setReturnConfirmOpen(true)}
                          disabled={returnToArteMutation.isPending}
                          data-testid="button-confirm-return"
                          style={{ flex: 1, padding: "10px 0", borderRadius: 6, border: "none", backgroundColor: "#dc2626", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}
                        >
                          {returnToArteMutation.isPending ? "Devolvendo..." : "Confirmar Devolução"}
                        </button>
                        <button
                          onClick={() => { setShowReturnForm(false); setReturnObservations(""); }}
                          style={{ padding: "10px 16px", borderRadius: 6, border: "1px solid #44403c", backgroundColor: "transparent", color: "#78716c", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Observations */}
                {selectedItem?.observations && (
                  <div style={{ backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "12px 14px", display: "flex", gap: 8 }}>
                    <AlertCircle style={{ width: 14, height: 14, color: "#d97706", flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: "#92400e", margin: 0 }}>Observações do item</p>
                      <p style={{ fontSize: 12, color: "#78350f", margin: "4px 0 0" }}>{selectedItem.observations}</p>
                    </div>
                  </div>
                )}

                {/* History timeline */}
                <div>
                  <h3 style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.18em", color: TI.secondary, paddingBottom: 10, borderBottom: "1px solid #f0efee", margin: "0 0 20px" }}>
                    HISTÓRICO
                  </h3>
                  {itemAuditLogs.length === 0 ? (
                    <p style={{ fontSize: 12, color: TI.muted }}>Sem histórico disponível.</p>
                  ) : (
                    <div style={{ position: "relative", paddingLeft: 24 }}>
                      {/* Vertical line */}
                      <div style={{ position: "absolute", left: 11, top: 8, bottom: 0, width: 2, backgroundColor: "#f0efee" }} />
                      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                        {itemAuditLogs.map((log: any, idx: number) => {
                          const dotColors = ["#10b981", "#f97316", "#3b82f6", "#d946ef", "#a8a29e"];
                          const dot = dotColors[idx % dotColors.length];
                          return (
                            <div key={log.id || idx} style={{ position: "relative" }}>
                              <span style={{
                                position: "absolute", left: -22, top: 2,
                                width: 16, height: 16, borderRadius: "50%",
                                backgroundColor: "#fff", border: `4px solid ${dot}`, zIndex: 1,
                              }} />
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                                <div>
                                  <p style={{ fontSize: 12, fontWeight: 700, color: TI.text, margin: 0 }}>{log.action || log.details}</p>
                                  {log.userName && <p style={{ fontSize: 10, color: TI.secondary, margin: "2px 0 0" }}>{log.userName}</p>}
                                  {log.details && log.action && (
                                    <p style={{ fontSize: 11, fontStyle: "italic", color: TI.secondary, backgroundColor: "#f3f4f3", padding: "6px 8px", borderRadius: 4, margin: "6px 0 0" }}>
                                      "{log.details}"
                                    </p>
                                  )}
                                </div>
                                <span style={{ fontSize: 10, fontWeight: 700, color: TI.muted, whiteSpace: "nowrap", fontFamily: "monospace" }}>
                                  {log.createdAt ? new Date(log.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right footer — keyboard shortcuts */}
              <div style={{ padding: "14px 24px", backgroundColor: "#fafaf9", borderTop: "1px solid #f0efee", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: TI.secondary, textTransform: "uppercase", letterSpacing: "0.08em" }}>Atalhos:</span>
                  <span style={{ fontSize: 10, fontWeight: 900, backgroundColor: "#e7e5e4", padding: "2px 6px", borderRadius: 4, color: TI.text }}>Enter</span>
                  <span style={{ fontSize: 10, color: TI.secondary }}>Liberar</span>
                  <span style={{ fontSize: 10, fontWeight: 900, backgroundColor: "#e7e5e4", padding: "2px 6px", borderRadius: 4, color: TI.text }}>Esc</span>
                  <span style={{ fontSize: 10, color: TI.secondary }}>Fechar</span>
                </div>
                <p style={{ fontSize: 10, fontWeight: 700, color: TI.muted, margin: 0 }}>NORTE v2.0</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── CONFIRM DIALOGS ─────────────────────────────────────────────── */}

      {/* Release single */}
      <AlertDialog open={releaseConfirmOpen} onOpenChange={setReleaseConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Liberar para Produção</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedItem && <span><strong>{selectedItem.displayId}</strong> — {selectedItem.type} será liberado para produção.</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-release-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedItem && creatorReviewMutation.mutate(selectedItem.id)}
              style={{ backgroundColor: TI.text, color: "#fff" }}
              data-testid="button-release-confirm"
            >
              {creatorReviewMutation.isPending ? "Liberando..." : "Liberar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Return to Arte from card (quick) */}
      <AlertDialog open={returnConfirmOpen} onOpenChange={setReturnConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Devolver para Arte</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedItem && <span><strong>{selectedItem.displayId}</strong> será devolvido à equipe de Arte.</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div style={{ padding: "0 24px" }}>
            <textarea
              placeholder="Descreva as alterações necessárias (opcional)..."
              value={returnObservations}
              onChange={e => setReturnObservations(e.target.value)}
              data-testid="textarea-return-quick"
              className="w-full min-h-20 p-2 border rounded-md bg-background text-foreground resize-none text-sm"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-return-cancel" onClick={() => { setReturnObservations(""); }}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedItem && returnToArteMutation.mutate({ itemId: selectedItem.id, notes: returnObservations })}
              style={{ backgroundColor: TI.text, color: "#fff" }}
              data-testid="button-return-confirm"
            >
              {returnToArteMutation.isPending ? "Devolvendo..." : "Devolver para Arte"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk release */}
      <AlertDialog open={bulkReleaseConfirmOpen} onOpenChange={setBulkReleaseConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Liberar {selectedItemIds.size} iten{selectedItemIds.size !== 1 ? "s" : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja liberar {selectedItemIds.size} {selectedItemIds.size === 1 ? "item" : "itens"} para produção?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-bulk-release-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkReleaseMutation.mutate(Array.from(selectedItemIds))}
              style={{ backgroundColor: TI.text, color: "#fff" }}
              data-testid="button-bulk-release-confirm"
            >
              {bulkReleaseMutation.isPending ? "Liberando..." : "Liberar Todos"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk return */}
      <AlertDialog open={bulkReturnConfirmOpen} onOpenChange={setBulkReturnConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Devolver {selectedItemIds.size} iten{selectedItemIds.size !== 1 ? "s" : ""} para Arte</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja devolver {selectedItemIds.size} {selectedItemIds.size === 1 ? "item" : "itens"} para a Arte?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div style={{ padding: "0 24px" }}>
            <textarea
              placeholder="Observações (opcional)..."
              value={bulkReturnObservations}
              onChange={e => setBulkReturnObservations(e.target.value)}
              data-testid="textarea-bulk-return"
              className="w-full min-h-20 p-2 border rounded-md bg-background text-foreground resize-none text-sm"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-bulk-return-cancel">Manter Itens</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const ids = Array.from(selectedItemIds);
                await Promise.all(ids.map(id => apiRequest("POST", `/api/items/${id}/return-to-arte`, { notes: bulkReturnObservations })));
                queryClient.invalidateQueries({ queryKey: ["/api/items"] });
                setSelectedItemIds(new Set()); setBulkReturnConfirmOpen(false); setBulkReturnObservations("");
                toast({ title: "Peças devolvidas", description: `${ids.length} peça(s) devolvida(s) para a Arte.` });
              }}
              style={{ backgroundColor: TI.text, color: "#fff" }}
              data-testid="button-bulk-return-confirm"
            >
              Devolver para Arte
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel single */}
      <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Item</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedItem && <span><strong>{selectedItem.displayId}</strong> — {selectedItem.type}</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div style={{ padding: "0 24px" }}>
            <textarea
              placeholder="Motivo do cancelamento (opcional)..."
              value={cancelObservations}
              onChange={e => setCancelObservations(e.target.value)}
              data-testid="textarea-cancel"
              className="w-full min-h-20 p-2 border rounded-md bg-background text-foreground resize-none text-sm"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-cancel">Manter Item</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedItem && bulkCancelMutation.mutate({ itemIds: [selectedItem.id], notes: cancelObservations })}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-cancel-confirm"
            >
              {bulkCancelMutation.isPending ? "Cancelando..." : "Confirmar Cancelamento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirmItemId} onOpenChange={open => { if (!open) setDeleteConfirmItemId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir peça</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirmItemId && (() => {
                const item = pendingItems.find(i => i.id === deleteConfirmItemId);
                return item ? <span>A peça <strong>{item.displayId}</strong> será permanentemente excluída. Esta ação não pode ser desfeita.</span> : "Esta peça será permanentemente excluída.";
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmItemId && deleteItemMutation.mutate(deleteConfirmItemId)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-delete-confirm"
            >
              {deleteItemMutation.isPending ? "Excluindo..." : "Excluir Peça"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
