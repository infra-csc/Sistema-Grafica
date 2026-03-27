import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, Eye, Calendar, Truck, FileText, Check, Search, X, XCircle, ArrowLeft, Trash2, FileEdit } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useState, useMemo, Fragment } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// Titanium palette
const TI = {
  bg: "#fafaf9", surface: "#ffffff", border: "#e7e5e4",
  text: "#1c1917", secondary: "#78716c", muted: "#a8a29e",
  accent: "#f97316",
};

export default function Solicitacao() {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [returnObservationOpen, setReturnObservationOpen] = useState(false);
  const [returnObservations, setReturnObservations] = useState("");
  const [releaseConfirmOpen, setReleaseConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelObservations, setCancelObservations] = useState("");

  const [bulkReleaseConfirmOpen, setBulkReleaseConfirmOpen] = useState(false);
  const [bulkReturnConfirmOpen, setBulkReturnConfirmOpen] = useState(false);
  const [bulkCancelConfirmOpen, setBulkCancelConfirmOpen] = useState(false);
  const [bulkReturnObservations, setBulkReturnObservations] = useState("");
  const [bulkCancelObservations, setBulkCancelObservations] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [itemTypeFilter, setItemTypeFilter] = useState<string>("all");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  const { data: items = [], isLoading: itemsLoading } = useQuery<any[]>({ queryKey: ["/api/items"] });
  const { data: events = [], isLoading: eventsLoading } = useQuery<any[]>({ queryKey: ["/api/events"] });
  const { data: sponsors = [] } = useQuery<any[]>({ queryKey: ["/api/sponsors"] });
  const { data: auditLogs = [] } = useQuery<any[]>({ queryKey: ["/api/audit-logs"] });

  const creatorReviewMutation = useMutation({
    mutationFn: async (itemId: string) => await apiRequest("PATCH", `/api/items/${itemId}/creator-review`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setDialogOpen(false); setSelectedItem(null);
      toast({ title: "Item liberado para produção", description: "O item foi revisado e liberado para a gráfica!" });
    },
    onError: (error: any) => toast({ title: "Erro ao liberar item", description: error.message, variant: "destructive" }),
  });

  const bulkReleaseMutation = useMutation({
    mutationFn: async (itemIds: string[]) => Promise.all(itemIds.map(id => apiRequest("PATCH", `/api/items/${id}/creator-review`, {}))),
    onSuccess: (_, itemIds) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSelectedItemIds(new Set());
      toast({ title: "Itens liberados para produção", description: `${itemIds.length} ${itemIds.length === 1 ? "item foi liberado" : "itens foram liberados"} para produção!` });
    },
    onError: (error: any) => toast({ title: "Erro ao liberar itens", description: error.message, variant: "destructive" }),
  });

  const editItemMutation = useMutation({
    mutationFn: async (payload: { itemId: string; updates: any }) => await apiRequest("PATCH", `/api/items/${payload.itemId}/edit`, payload.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSelectedItem(null);
      toast({ title: "Item atualizado", description: "As especificações do item foram atualizadas com sucesso." });
    },
    onError: (error: any) => toast({ title: "Erro ao atualizar item", description: error.message, variant: "destructive" }),
  });

  const returnToArteMutation = useMutation({
    mutationFn: async (payload: { itemId: string; notes: string }) =>
      await apiRequest("POST", `/api/items/${payload.itemId}/return-to-arte`, { notes: payload.notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setDialogOpen(false); setSelectedItem(null);
      setReturnObservationOpen(false); setReturnObservations("");
      toast({ title: "Item devolvido para Arte", description: "O item foi devolvido para a Arte com observações." });
    },
    onError: (error: any) => toast({ title: "Erro ao devolver item", description: error.message, variant: "destructive" }),
  });

  const bulkCancelMutation = useMutation({
    mutationFn: async (payload: { itemIds: string[]; notes?: string }) =>
      await apiRequest("PATCH", `/api/items/bulk-cancel`, { itemIds: payload.itemIds, notes: payload.notes }),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSelectedItemIds(new Set()); setSelectedItem(null);
      setDialogOpen(false); setCancelConfirmOpen(false); setBulkCancelConfirmOpen(false);
      toast({ title: "Itens cancelados", description: `${result.canceled} ${result.canceled === 1 ? "item foi cancelado" : "itens foram cancelados"}.` });
    },
    onError: (error: any) => toast({ title: "Erro ao cancelar itens", description: error.message, variant: "destructive" }),
  });

  const pendingItems = items.filter(item => item.status === "awaiting_final_review");

  const filteredItems = useMemo(() => pendingItems.filter(item => {
    const matchesSearch = searchTerm === "" ||
      item.type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEvent = eventFilter === "all" || item.eventId === eventFilter;
    const matchesType = itemTypeFilter === "all" || item.type === itemTypeFilter;
    return matchesSearch && matchesEvent && matchesType;
  }), [pendingItems, searchTerm, eventFilter, itemTypeFilter]);

  const uniqueItemTypes = useMemo(() => {
    const types = new Set(pendingItems.map(item => item.type).filter(Boolean));
    return Array.from(types).sort();
  }, [pendingItems]);

  const getEventInfo = (eventId: string) => events.find(e => e.id === eventId);
  const getSponsorInfo = (sponsorId: string) => sponsors.find(s => s.id === sponsorId);
  const handleViewDetails = (item: any) => { setSelectedItem(item); setDialogOpen(true); };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds(prev => {
      const newSet = new Set(prev);
      newSet.has(itemId) ? newSet.delete(itemId) : newSet.add(itemId);
      return newSet;
    });
  };
  const toggleAllSelection = () => {
    selectedItemIds.size === filteredItems.length && filteredItems.length > 0
      ? setSelectedItemIds(new Set())
      : setSelectedItemIds(new Set(filteredItems.map(item => item.id)));
  };

  const handleBulkRelease = () => setBulkReleaseConfirmOpen(true);
  const confirmBulkRelease = () => {
    const itemIds = Array.from(selectedItemIds);
    if (itemIds.length > 0) { bulkReleaseMutation.mutate(itemIds); setBulkReleaseConfirmOpen(false); }
  };
  const handleBulkReturnToArte = () => { setBulkReturnConfirmOpen(true); setBulkReturnObservations(""); };
  const confirmBulkReturnToArte = () => {
    const itemIds = Array.from(selectedItemIds);
    if (itemIds.length > 0) {
      Promise.all(itemIds.map(id => apiRequest("POST", `/api/items/${id}/return-to-arte`, { notes: bulkReturnObservations })))
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/items"] });
          setSelectedItemIds(new Set()); setBulkReturnConfirmOpen(false); setBulkReturnObservations("");
          toast({ title: "Itens devolvidos para Arte", description: `${itemIds.length} ${itemIds.length === 1 ? "item foi devolvido" : "itens foram devolvidos"} para a Arte.` });
        })
        .catch((error: any) => toast({ title: "Erro ao devolver itens", description: error.message, variant: "destructive" }));
    }
  };
  const handleBulkCancelConfirm = () => { setBulkCancelConfirmOpen(true); setBulkCancelObservations(""); };
  const confirmBulkCancel = () => {
    const itemIds = Array.from(selectedItemIds);
    if (itemIds.length > 0) { bulkCancelMutation.mutate({ itemIds, notes: bulkCancelObservations }); setBulkCancelConfirmOpen(false); }
  };
  const handleReleaseConfirm = () => setReleaseConfirmOpen(true);
  const confirmRelease = () => {
    if (selectedItem?.id) { creatorReviewMutation.mutate(selectedItem.id); setReleaseConfirmOpen(false); }
  };
  const handleCancelConfirm = () => { setCancelConfirmOpen(true); setCancelObservations(""); };
  const confirmCancel = () => {
    if (selectedItem?.id) { bulkCancelMutation.mutate({ itemIds: [selectedItem.id], notes: cancelObservations }); setCancelConfirmOpen(false); }
  };
  const handleReturnToArte = () => { setReturnObservationOpen(true); setReturnObservations(""); };
  const confirmReturnToArte = () => {
    if (selectedItem) returnToArteMutation.mutate({ itemId: selectedItem.id, notes: returnObservations });
  };

  if (itemsLoading || eventsLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: TI.bg, minHeight: "100%", padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Page header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ backgroundColor: TI.accent, borderRadius: 8, padding: "6px 8px", display: "flex" }}>
            <FileText style={{ color: "#fff", width: 18, height: 18 }} />
          </div>
          <div>
            <h1 style={{ color: TI.text, fontSize: 18, fontWeight: 700, margin: 0 }}>Revisão do Criador</h1>
            <p style={{ color: TI.muted, fontSize: 12, margin: 0 }}>Revise as aprovações dos patrocinadores e libere itens para produção</p>
          </div>
        </div>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          backgroundColor: TI.surface, border: `1px solid ${TI.border}`,
          borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, color: TI.text,
        }}>
          <AlertCircle style={{ width: 14, height: 14, color: TI.accent }} />
          {pendingItems.length} pendente{pendingItems.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* ── Main card ── */}
      <div style={{ backgroundColor: TI.surface, border: `1px solid ${TI.border}`, borderRadius: 12, overflow: "hidden" }}>

        {/* Filters bar */}
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${TI.border}`, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 200px", minWidth: 160 }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: TI.muted, pointerEvents: "none" }} />
            <input placeholder="Buscar por descrição ou tipo..." value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)} data-testid="input-search"
              style={{ width: "100%", paddingLeft: 32, paddingRight: searchTerm ? 32 : 12, paddingTop: 7, paddingBottom: 7, backgroundColor: TI.bg, border: `1px solid ${TI.border}`, borderRadius: 8, fontSize: 12, color: TI.text, outline: "none", boxSizing: "border-box" }} />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: TI.muted, padding: 0 }}>
                <X style={{ width: 13, height: 13 }} />
              </button>
            )}
          </div>

          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger className="w-52" data-testid="select-event-filter" style={{ backgroundColor: TI.bg, borderColor: TI.border, fontSize: 12 }}>
              <SelectValue placeholder="Todos os eventos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os eventos</SelectItem>
              {[...events].sort((a, b) => a.name.localeCompare(b.name)).map(ev => (
                <SelectItem key={ev.id} value={ev.id}>{ev.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={itemTypeFilter} onValueChange={setItemTypeFilter}>
            <SelectTrigger className="w-44" data-testid="select-type-filter" style={{ backgroundColor: TI.bg, borderColor: TI.border, fontSize: 12 }}>
              <SelectValue placeholder="Todos os tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {uniqueItemTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>

          {(searchTerm || eventFilter !== "all" || itemTypeFilter !== "all") && (
            <Button variant="outline" size="sm" onClick={() => { setSearchTerm(""); setEventFilter("all"); setItemTypeFilter("all"); }} data-testid="button-clear-filters">
              Limpar
            </Button>
          )}

          {/* Bulk actions */}
          {selectedItemIds.size > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginLeft: "auto" }}>
              <Button size="sm" data-testid="button-bulk-edit"
                style={{ backgroundColor: TI.accent, color: "#fff", border: "none" }}
                onClick={() => {
                  const firstItem = Array.from(selectedItemIds).length === 1 ? filteredItems.find(i => i.id === Array.from(selectedItemIds)[0]) : null;
                  if (firstItem) handleViewDetails(firstItem);
                }}>
                <FileEdit style={{ width: 14, height: 14, marginRight: 6 }} />
                Editar ({selectedItemIds.size})
              </Button>
              <button onClick={handleBulkRelease} disabled={bulkReleaseMutation.isPending} data-testid="button-bulk-release"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 6, cursor: "pointer", backgroundColor: TI.text, color: "#fff", border: "none", fontSize: 12, fontWeight: 600 }}>
                <Check style={{ width: 14, height: 14 }} />
                Liberar {selectedItemIds.size}
              </button>
              <Button size="sm" variant="outline" onClick={handleBulkReturnToArte} disabled={bulkCancelMutation.isPending} data-testid="button-bulk-return" style={{ borderColor: "#b91c1c", color: "#b91c1c" }}>
                <ArrowLeft style={{ width: 14, height: 14, marginRight: 6 }} />
                Devolver {selectedItemIds.size}
              </Button>
              <Button size="sm" variant="outline" onClick={handleBulkCancelConfirm} disabled={bulkCancelMutation.isPending} data-testid="button-bulk-cancel" style={{ borderColor: "#dc2626", color: "#dc2626" }}>
                <Trash2 style={{ width: 14, height: 14, marginRight: 6 }} />
                Cancelar {selectedItemIds.size}
              </Button>
            </div>
          )}

          <span style={{ fontSize: 11, color: TI.muted, marginLeft: selectedItemIds.size > 0 ? 0 : "auto", whiteSpace: "nowrap" }}>
            {filteredItems.length} item{filteredItems.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Table / empty state */}
        {filteredItems.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px", color: TI.muted }}>
            <CheckCircle style={{ width: 36, height: 36, margin: "0 auto 12px", opacity: 0.4 }} />
            <p style={{ fontSize: 14, fontWeight: 500, color: TI.secondary }}>
              {pendingItems.length === 0 ? "Nenhum item para revisar" : "Nenhum resultado encontrado"}
            </p>
            <p style={{ fontSize: 12, marginTop: 4 }}>
              {pendingItems.length === 0 ? "Não há itens aguardando revisão no momento." : "Tente ajustar os filtros."}
            </p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: TI.bg, borderBottom: `1px solid ${TI.border}` }}>
                <th style={{ padding: "9px 14px", width: 40, textAlign: "center" }}>
                  <Checkbox checked={selectedItemIds.size === filteredItems.length && filteredItems.length > 0}
                    onCheckedChange={toggleAllSelection} data-testid="checkbox-select-all" />
                </th>
                {["ID / Status", "Tipo / Descrição", "Qtd", "Dimensões", "M²", "Material · Acab.", "Ações"].map(h => (
                  <th key={h} style={{ padding: "9px 14px", textAlign: h === "Ações" ? "right" : "left", fontSize: 10, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item, index) => {
                const event = getEventInfo(item.eventId);
                const prevItem = index > 0 ? filteredItems[index - 1] : null;
                const showEventHeader = !prevItem || prevItem.eventId !== item.eventId;
                const isLast = index === filteredItems.length - 1;

                return (
                  <Fragment key={item.id}>
                    {/* ── Dark event header ── */}
                    {showEventHeader && (
                      <tr>
                        <td colSpan={8} style={{ backgroundColor: TI.text, padding: "8px 14px", borderTop: index > 0 ? `4px solid ${TI.border}` : undefined }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                            <span style={{ color: "#fff", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                              {event?.name || "Sem Evento"}
                            </span>
                            {event && (
                              <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#a8a29e" }}>
                                {event.startDate && (
                                  <span style={{ display: "flex", gap: 5, alignItems: "center" }}>
                                    <Calendar style={{ width: 11, height: 11 }} />
                                    {new Date(event.startDate).toLocaleDateString("pt-BR")}
                                  </span>
                                )}
                                {event.truckDepartureDate && (
                                  <span style={{ display: "flex", gap: 5, alignItems: "center" }}>
                                    <Truck style={{ width: 11, height: 11 }} />
                                    Saída: {new Date(event.truckDepartureDate).toLocaleDateString("pt-BR")} {new Date(event.truckDepartureDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* ── Item row ── */}
                    <tr data-testid={`row-item-${item.id}`}
                      style={{ borderBottom: isLast ? "none" : `1px solid ${TI.border}`, backgroundColor: TI.surface, transition: "background 0.1s" }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = TI.bg)}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = TI.surface)}>

                      <td style={{ padding: "9px 14px", textAlign: "center" }}>
                        <Checkbox checked={selectedItemIds.has(item.id)} onCheckedChange={() => toggleItemSelection(item.id)} data-testid={`checkbox-item-${item.id}`} />
                      </td>

                      {/* ID + badge */}
                      <td style={{ padding: "9px 14px", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 12, color: TI.accent }} data-testid={`text-display-id-${item.id}`}>
                            {item.displayId}
                          </span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, backgroundColor: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 600, color: TI.accent, letterSpacing: "0.03em" }}>
                            Aguardando Revisão
                          </span>
                        </div>
                      </td>

                      {/* Tipo / Descrição */}
                      <td style={{ padding: "9px 14px" }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: TI.text, borderLeft: `3px solid ${TI.accent}`, paddingLeft: 7 }}>
                          {item.type}
                        </div>
                        {item.description && (
                          <div style={{ fontSize: 11, color: TI.secondary, paddingLeft: 10, marginTop: 2 }}>{item.description}</div>
                        )}
                      </td>

                      {/* Qtd */}
                      <td style={{ padding: "9px 14px", fontWeight: 700, fontSize: 13, color: TI.text }}>{item.quantity}x</td>

                      {/* Dimensões */}
                      <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 11, color: TI.text }}>
                        {item.fileWidth && item.fileHeight ? `${item.fileWidth}×${item.fileHeight}` : "—"}
                      </td>

                      {/* m² */}
                      <td style={{ padding: "9px 14px", fontFamily: "monospace", fontWeight: 700, fontSize: 12, color: TI.text }}>
                        {item.calculatedM2 || "—"}
                      </td>

                      {/* Material */}
                      <td style={{ padding: "9px 14px", fontSize: 11, color: TI.secondary }}>
                        {item.material && item.finish ? `${item.material} · ${item.finish}` : item.material || item.finish || "—"}
                      </td>

                      {/* Ações */}
                      <td style={{ padding: "9px 14px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          {/* Liberar — preto Titanium */}
                          <button onClick={() => { setSelectedItem(item); handleReleaseConfirm(); }} disabled={creatorReviewMutation.isPending}
                            data-testid={`button-release-individual-${item.id}`} title="Liberar para Produção"
                            style={{ width: 30, height: 30, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", backgroundColor: TI.text, color: "#fff", border: "none" }}>
                            <CheckCircle style={{ width: 14, height: 14 }} />
                          </button>
                          {/* Devolver — terracota outline */}
                          <button onClick={() => { setSelectedItem(item); setReturnObservationOpen(true); }} disabled={returnToArteMutation.isPending}
                            data-testid={`button-return-individual-${item.id}`} title="Devolver para Arte"
                            style={{ width: 30, height: 30, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", backgroundColor: "transparent", color: "#b91c1c", border: "1.5px solid #b91c1c" }}>
                            <ArrowLeft style={{ width: 14, height: 14 }} />
                          </button>
                          {/* Cancelar */}
                          <button onClick={() => { setSelectedItem(item); handleCancelConfirm(); }} disabled={bulkCancelMutation.isPending}
                            data-testid={`button-cancel-individual-${item.id}`} title="Cancelar Item"
                            style={{ width: 30, height: 30, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", backgroundColor: "transparent", color: "#dc2626", border: "1.5px solid #fca5a5" }}>
                            <Trash2 style={{ width: 14, height: 14 }} />
                          </button>
                          {/* Revisar */}
                          <button onClick={() => handleViewDetails(item)} data-testid={`button-view-${item.id}`}
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "0 10px", height: 30, borderRadius: 6, cursor: "pointer", backgroundColor: "transparent", color: TI.secondary, border: `1px solid ${TI.border}`, fontSize: 11, fontWeight: 500 }}>
                            <Eye style={{ width: 13, height: 13 }} />
                            Revisar
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Observations */}
                    {item.observations && (
                      <tr style={{ backgroundColor: "#fffbeb", borderBottom: `1px solid #fde68a` }}>
                        <td colSpan={8} style={{ padding: "6px 14px" }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                            <AlertCircle style={{ width: 13, height: 13, color: "#d97706", flexShrink: 0, marginTop: 1 }} />
                            <span style={{ fontSize: 11, color: "#92400e" }}>
                              <strong>Observações:</strong> {item.observations}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Item details dialog ── */}
      <ItemDetailsDialog
        item={selectedItem}
        auditLogs={auditLogs}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onEditSave={(editedItem) => {
          if (selectedItem?.id) {
            editItemMutation.mutate({
              itemId: selectedItem.id,
              updates: { type: editedItem.type, material: editedItem.material, finish: editedItem.finish, description: editedItem.description },
            });
          }
        }}
        topActions={selectedItem ? (
          <div className="space-y-3">
            {/* Thumb aprovado */}
            {selectedItem.approvalThumbUrl && (() => {
              const url = selectedItem.approvalThumbUrl.toLowerCase();
              const isImage = /\.(png|jpg|jpeg|gif|webp)/i.test(url);
              const isPdf = url.includes(".pdf") || (!isImage && url.includes("/objects/"));
              return (
                <div style={{ border: `1px solid ${TI.border}`, borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px", borderBottom: `1px solid ${TI.border}`, backgroundColor: TI.bg, display: "flex", alignItems: "center", gap: 7 }}>
                    <Eye style={{ width: 14, height: 14, color: TI.accent }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: TI.text }}>Thumb de Aprovação {isPdf ? "(PDF)" : ""}</span>
                  </div>
                  <div style={{ padding: 12, backgroundColor: TI.surface }}>
                    {isPdf ? (
                      <a href={selectedItem.approvalThumbUrl} target="_blank" rel="noopener noreferrer" data-testid="button-open-approval-pdf"
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, backgroundColor: TI.bg, border: `1px solid ${TI.border}`, color: TI.text, textDecoration: "none", fontSize: 12, fontWeight: 600 }}>
                        <FileText style={{ width: 16, height: 16, color: TI.accent }} />
                        Abrir PDF de Aprovação
                      </a>
                    ) : (
                      <img src={selectedItem.approvalThumbUrl} alt="Thumb Aprovado" data-testid="img-approval-thumb"
                        style={{ width: "100%", borderRadius: 6, border: `1px solid ${TI.border}`, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }} />
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Arquivo final */}
            <div style={{ border: `1px solid ${TI.border}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${TI.border}`, backgroundColor: TI.bg, display: "flex", alignItems: "center", gap: 7 }}>
                <FileText style={{ width: 14, height: 14, color: TI.text }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: TI.text }}>Arquivo Final para Revisão</span>
              </div>
              <div style={{ padding: 12, backgroundColor: TI.surface }}>
                {selectedItem.finalFileUrl ? (
                  <p style={{ fontFamily: "monospace", fontSize: 11, backgroundColor: TI.bg, border: `1px solid ${TI.border}`, borderRadius: 6, padding: "8px 10px", color: TI.text, wordBreak: "break-all", margin: 0 }}>
                    {selectedItem.finalFileUrl}
                  </p>
                ) : (
                  <p style={{ fontSize: 12, color: TI.muted, margin: 0 }}>Nenhum arquivo final enviado</p>
                )}
              </div>
            </div>
          </div>
        ) : undefined}
        customActions={selectedItem ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={handleReleaseConfirm} disabled={creatorReviewMutation.isPending} data-testid="button-release-final"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "9px 0", borderRadius: 8, cursor: "pointer", backgroundColor: TI.text, color: "#fff", border: "none", fontSize: 13, fontWeight: 700 }}>
              <CheckCircle style={{ width: 16, height: 16 }} />
              {creatorReviewMutation.isPending ? "Liberando..." : "Liberar para Produção"}
            </button>
            <button onClick={handleReturnToArte} disabled={returnToArteMutation.isPending} data-testid="button-return-final"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "9px 0", borderRadius: 8, cursor: "pointer", backgroundColor: "transparent", color: "#b91c1c", border: "1.5px solid #b91c1c", fontSize: 13, fontWeight: 600 }}>
              <ArrowLeft style={{ width: 16, height: 16 }} />
              Devolver para Arte
            </button>
            <button onClick={handleCancelConfirm} disabled={bulkCancelMutation.isPending} data-testid="button-cancel-item"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "9px 0", borderRadius: 8, cursor: "pointer", backgroundColor: "transparent", color: "#dc2626", border: "1px solid #fca5a5", fontSize: 12, fontWeight: 500 }}>
              <Trash2 style={{ width: 15, height: 15 }} />
              {bulkCancelMutation.isPending ? "Cancelando..." : "Cancelar Item"}
            </button>
          </div>
        ) : undefined}
      />

      {/* ── Confirm dialogs ── */}

      <AlertDialog open={releaseConfirmOpen} onOpenChange={setReleaseConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Liberar para Produção</AlertDialogTitle>
            <AlertDialogDescription>Deseja liberar este item para produção?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-release-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRelease} style={{ backgroundColor: TI.text, color: "#fff" }} data-testid="button-release-confirm">
              {creatorReviewMutation.isPending ? "Liberando..." : "Liberar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkReleaseConfirmOpen} onOpenChange={setBulkReleaseConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Liberar {selectedItemIds.size} itens para Produção</AlertDialogTitle>
            <AlertDialogDescription>Deseja liberar {selectedItemIds.size} {selectedItemIds.size === 1 ? "item" : "itens"} para produção?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-bulk-release-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkRelease} style={{ backgroundColor: TI.text, color: "#fff" }} data-testid="button-bulk-release-confirm">
              {bulkReleaseMutation.isPending ? "Liberando..." : "Liberar Todos"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={returnObservationOpen} onOpenChange={setReturnObservationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Devolver para Arte</DialogTitle>
            <DialogDescription>Descreva as alterações necessárias (opcional)</DialogDescription>
          </DialogHeader>
          <textarea placeholder="Descreva as alterações necessárias..." value={returnObservations}
            onChange={(e) => setReturnObservations(e.target.value)}
            className="w-full min-h-24 p-2 border rounded-md bg-background text-foreground resize-none"
            data-testid="textarea-return-observations" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnObservationOpen(false)} data-testid="button-return-cancel">Cancelar</Button>
            <Button onClick={confirmReturnToArte} disabled={returnToArteMutation.isPending} data-testid="button-return-confirm"
              style={{ backgroundColor: TI.text, color: "#fff" }}>
              {returnToArteMutation.isPending ? "Devolvendo..." : "Devolver para Arte"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Item</DialogTitle>
            <DialogDescription>
              Adicione uma observação opcional explicando o motivo.
              {selectedItem && (
                <div style={{ marginTop: 10, padding: "8px 12px", backgroundColor: TI.bg, border: `1px solid ${TI.border}`, borderRadius: 8, fontSize: 12 }}>
                  <strong>{selectedItem.displayId}</strong> — {selectedItem.type}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <textarea placeholder="Motivo do cancelamento (opcional)..." value={cancelObservations}
            onChange={(e) => setCancelObservations(e.target.value)}
            className="w-full min-h-20 p-2 border rounded-md bg-background text-foreground resize-none"
            data-testid="textarea-cancel-observations" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelConfirmOpen(false)} data-testid="button-cancel-cancel">Manter Item</Button>
            <Button variant="destructive" onClick={confirmCancel} disabled={bulkCancelMutation.isPending} data-testid="button-cancel-confirm">
              {bulkCancelMutation.isPending ? "Cancelando..." : "Confirmar Cancelamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkReturnConfirmOpen} onOpenChange={setBulkReturnConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Devolver {selectedItemIds.size} itens para Arte</DialogTitle>
            <DialogDescription>Deseja devolver {selectedItemIds.size} {selectedItemIds.size === 1 ? "item" : "itens"} para a Arte?</DialogDescription>
          </DialogHeader>
          <textarea placeholder="Observações (opcional)..." value={bulkReturnObservations}
            onChange={(e) => setBulkReturnObservations(e.target.value)}
            className="w-full min-h-20 p-2 border rounded-md bg-background text-foreground resize-none"
            data-testid="textarea-bulk-return-observations" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkReturnConfirmOpen(false)} data-testid="button-bulk-return-cancel">Manter Itens</Button>
            <Button onClick={confirmBulkReturnToArte} data-testid="button-bulk-return-confirm" style={{ backgroundColor: TI.text, color: "#fff" }}>
              Devolver para Arte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkCancelConfirmOpen} onOpenChange={setBulkCancelConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar {selectedItemIds.size} itens</DialogTitle>
            <DialogDescription>Deseja cancelar {selectedItemIds.size} {selectedItemIds.size === 1 ? "item" : "itens"}?</DialogDescription>
          </DialogHeader>
          <textarea placeholder="Motivo do cancelamento (opcional)..." value={bulkCancelObservations}
            onChange={(e) => setBulkCancelObservations(e.target.value)}
            className="w-full min-h-20 p-2 border rounded-md bg-background text-foreground resize-none"
            data-testid="textarea-bulk-cancel-observations" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkCancelConfirmOpen(false)} data-testid="button-bulk-cancel-cancel">Manter Itens</Button>
            <Button variant="destructive" onClick={confirmBulkCancel} disabled={bulkCancelMutation.isPending} data-testid="button-bulk-cancel-confirm">
              {bulkCancelMutation.isPending ? "Cancelando..." : "Confirmar Cancelamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
