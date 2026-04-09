import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { AlertCircle, Package, CheckCircle, Truck, Calendar, Eye, Check, ChevronsUpDown, Camera, Search, Play, X, Filter, ChevronDown } from "lucide-react";
import { Fragment, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ObjectUploader } from "@/components/ObjectUploader";
import { ItemDetailsDialog } from "@/components/item-details-dialog";

const TI = {
  bg: "#fafaf9",
  surface: "#ffffff",
  text: "#1c1917",
  accent: "#f97316",
  accentDark: "#ea580c",
  border: "#e7e5e4",
  muted: "#a8a29e",
  secondary: "#78716c",
  stone800: "#292524",
  stone200: "#e7e5e4",
  stone100: "#f5f5f4",
};

const statusConfig: Record<string, { label: string; bg: string; color: string; border: string }> = {
  approved:     { label: "Liberado",     bg: "#dbeafe", color: "#1d4ed8", border: "#93c5fd" },
  liberado:     { label: "Liberado",     bg: "#dbeafe", color: "#1d4ed8", border: "#93c5fd" },
  inProduction: { label: "Em Produção",  bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
  em_producao:  { label: "Em Produção",  bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
  produced:     { label: "Produzido",    bg: "#dcfce7", color: "#15803d", border: "#86efac" },
  produzido:    { label: "Produzido",    bg: "#dcfce7", color: "#15803d", border: "#86efac" },
  delivered:    { label: "Entregue",     bg: "#f0fdf4", color: "#166534", border: "#6ee7b7" },
  entregue:     { label: "Entregue",     bg: "#f0fdf4", color: "#166534", border: "#6ee7b7" },
};

function StatusPill({ status }: { status: string }) {
  const cfg = statusConfig[status] || { label: status, bg: "#f5f5f4", color: "#78716c", border: "#e7e5e4" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      backgroundColor: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.border}`,
      borderRadius: 100, padding: "3px 10px",
      fontSize: 10, fontWeight: 800,
      textTransform: "uppercase", letterSpacing: "0.05em",
      whiteSpace: "nowrap",
    }}>
      {cfg.label}
    </span>
  );
}

export default function Grafica() {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [modalType, setModalType] = useState<"production" | "delivery" | null>(null);
  const [viewDetailsItem, setViewDetailsItem] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [materialFilter, setMaterialFilter] = useState<string>("all");
  const [finishFilter, setFinishFilter] = useState<string>("all");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [next10DaysFilter, setNext10DaysFilter] = useState(false);
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [openRecipientCombobox, setOpenRecipientCombobox] = useState(false);
  const [productionData, setProductionData] = useState({ quantityProduced: 0 });
  const [deliveryData, setDeliveryData] = useState({ photoUrl: "", receivedBy: "" });
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string>("");
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string>("");
  const [isPhotoUploaded, setIsPhotoUploaded] = useState(false);

  const { data: items = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/items/approved"] });
  const { data: events = [] } = useQuery<any[]>({ queryKey: ["/api/events"] });
  const { data: auditLogs = [] } = useQuery<any[]>({ queryKey: ["/api/audit-logs"] });

  const startProductionMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: any }) =>
      await apiRequest("PATCH", `/api/items/${itemId}/start-production`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setSelectedItem(null); setModalType(null);
      setProductionData({ quantityProduced: 0 });
      toast({ title: "Produção iniciada", description: "A produção foi registrada com sucesso" });
    },
    onError: (error: Error) => toast({ title: "Erro ao iniciar produção", description: error.message, variant: "destructive" }),
  });

  const markDeliveredMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: any }) =>
      await apiRequest("PATCH", `/api/items/${itemId}/deliver`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setSelectedItem(null); setModalType(null);
      setDeliveryData({ photoUrl: "", receivedBy: "" });
      setUploadedPhotoUrl("");
      toast({ title: "Entrega confirmada", description: "O item foi marcado como entregue com sucesso" });
    },
    onError: (error: Error) => toast({ title: "Erro ao confirmar entrega", description: error.message, variant: "destructive" }),
  });

  const uniqueTypes = Array.from(new Set(items.map((i: any) => i.type))).sort() as string[];
  const uniqueMaterials = Array.from(new Set(items.map((i: any) => i.material).filter(Boolean))).sort() as string[];
  const uniqueFinishes = Array.from(new Set(items.map((i: any) => i.finish).filter(Boolean))).sort() as string[];
  const uniqueRecipients = Array.from(new Set(items.map((i: any) => i.receivedBy).filter(Boolean))).sort() as string[];

  const months = [
    { value: "all", label: "Todos os meses" },
    { value: "1", label: "Janeiro" }, { value: "2", label: "Fevereiro" },
    { value: "3", label: "Março" }, { value: "4", label: "Abril" },
    { value: "5", label: "Maio" }, { value: "6", label: "Junho" },
    { value: "7", label: "Julho" }, { value: "8", label: "Agosto" },
    { value: "9", label: "Setembro" }, { value: "10", label: "Outubro" },
    { value: "11", label: "Novembro" }, { value: "12", label: "Dezembro" },
  ];

  const filteredItems = items
    .filter((item: any) => {
      if (searchFilter) {
        const q = searchFilter.toLowerCase();
        if (!item.type?.toLowerCase().includes(q) &&
            !item.description?.toLowerCase().includes(q) &&
            !item.displayId?.toLowerCase().includes(q) &&
            !item.event?.name?.toLowerCase().includes(q)) return false;
      }
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (eventFilter !== "all" && item.eventId !== eventFilter) return false;
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (materialFilter !== "all" && item.material !== materialFilter) return false;
      if (finishFilter !== "all" && item.finish !== finishFilter) return false;
      if (next10DaysFilter && item.event?.truckDepartureDate) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const tenDays = new Date(today); tenDays.setDate(tenDays.getDate() + 10);
        const dep = new Date(item.event.truckDepartureDate);
        if (!(dep >= today && dep <= tenDays)) return false;
      }
      if (monthFilter !== "all" && item.event?.truckDepartureDate) {
        const month = new Date(item.event.truckDepartureDate).getMonth() + 1;
        if (month.toString() !== monthFilter) return false;
      }
      return true;
    })
    .sort((a: any, b: any) => {
      const ea = a.event?.name || ""; const eb = b.event?.name || "";
      if (ea !== eb) return ea.localeCompare(eb);
      return a.type.localeCompare(b.type);
    });

  const itemsForEvent = eventFilter === "all" ? items : items.filter((i: any) => i.eventId === eventFilter);
  const stats = {
    liberados:    (itemsForEvent as any[]).filter(i => i.status === 'approved' || i.status === 'liberado').length,
    emProducao:   (itemsForEvent as any[]).filter(i => i.status === 'inProduction' || i.status === 'em_producao').length,
    produzidos:   (itemsForEvent as any[]).filter(i => i.status === 'produced' || i.status === 'produzido').length,
    entregues:    (itemsForEvent as any[]).filter(i => i.status === 'delivered' || i.status === 'entregue').length,
    total:        itemsForEvent.length,
  };

  const handleSubmitProduction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    startProductionMutation.mutate({ itemId: selectedItem.id, data: productionData });
  };

  const handleSubmitDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    if (!deliveryData.receivedBy?.trim()) {
      toast({ title: "Campo obrigatório", description: "Por favor, informe quem recebeu o material", variant: "destructive" });
      return;
    }
    if (uploadedPhotoUrl) {
      try {
        await apiRequest("POST", "/api/delivery-photos", {
          itemId: selectedItem.id, photoUrl: uploadedPhotoUrl,
          uploadedBy: (window as any).userName || "Sistema",
        });
      } catch {
        toast({ title: "Erro ao salvar foto", variant: "destructive" });
        return;
      }
    }
    markDeliveredMutation.mutate({ itemId: selectedItem.id, data: deliveryData });
  };

  const isDelivered = (item: any) => item.status === "delivered" || item.status === "entregue";
  const isProduced = (item: any) => item.status === "produced" || item.status === "produzido";
  const isInProd = (item: any) => item.status === "inProduction" || item.status === "em_producao";

  const openProductionModal = (item: any) => {
    setSelectedItem(item);
    setModalType("production");
    setProductionData({ quantityProduced: item.quantity });
  };

  const openDeliveryModal = (item: any) => {
    setSelectedItem(item);
    setModalType("delivery");
    setUploadedPhotoUrl(""); setPhotoPreviewUrl("");
    setIsPhotoUploaded(false);
    setDeliveryData({ photoUrl: "", receivedBy: "" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24, backgroundColor: TI.bg, minHeight: "100%" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em", textTransform: "uppercase", color: TI.text }} data-testid="title-grafica">
            Controle de Produção
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: TI.secondary }}>
            Gestão de ativos gráficos em tempo real
          </p>
        </div>
        {stats.liberados > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, backgroundColor: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa", borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#f97316", display: "inline-block" }} />
            {stats.liberados} peça{stats.liberados !== 1 ? "s" : ""} aguardando produção
          </span>
        )}
      </div>

      {/* ── KPI Strip ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        {[
          { label: "Liberados",    value: stats.liberados,  sub: "Aguard. produção", borderColor: "#0369a1", numColor: "#0369a1", testId: "stat-approved" },
          { label: "Em Produção",  value: stats.emProducao, sub: "Ativo",             borderColor: "#f97316", numColor: "#ea580c", testId: "stat-production" },
          { label: "Produzidos",   value: stats.produzidos, sub: "Não entregue",      borderColor: "#16a34a", numColor: "#15803d", testId: "stat-produced" },
          { label: "Entregues",    value: stats.entregues,  sub: "Concluído",         borderColor: "#0284c7", numColor: "#166534", testId: "stat-delivered" },
        ].map(kpi => (
          <div key={kpi.label} style={{ backgroundColor: TI.surface, borderLeft: `4px solid ${kpi.borderColor}`, borderRadius: 8, padding: "16px 18px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: TI.muted, marginBottom: 6, fontFamily: "'Space Grotesk', sans-serif" }}>{kpi.label}</div>
            <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.03em", fontFamily: "'Space Grotesk', sans-serif", color: kpi.numColor, lineHeight: 1 }} data-testid={kpi.testId}>{kpi.value}</div>
            <div style={{ fontSize: 11, color: TI.secondary, marginTop: 4 }}>{kpi.sub}</div>
          </div>
        ))}
        {/* Total — dark card */}
        <div style={{ backgroundColor: TI.text, borderLeft: `4px solid ${TI.accent}`, borderRadius: 8, padding: "16px 18px", boxShadow: "0 4px 16px rgba(0,0,0,0.14)" }}>
          <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", marginBottom: 6, fontFamily: "'Space Grotesk', sans-serif" }}>Total Geral</div>
          <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.03em", fontFamily: "'Space Grotesk', sans-serif", color: "#ffffff", lineHeight: 1 }} data-testid="stat-total">{stats.total}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Peças no sistema</div>
        </div>
      </div>

      {/* ── Filters Bar ── */}
      <div style={{ backgroundColor: "#f3f4f3", borderRadius: 10, padding: "12px 14px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1", minWidth: 200 }}>
          <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: TI.muted }} />
          <input
            type="text"
            placeholder="Buscar por ID, descrição ou evento..."
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
            data-testid="input-search-filter"
            style={{ width: "100%", paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8, backgroundColor: "#e8e8e7", border: "none", borderRadius: 6, fontSize: 13, color: TI.text, outline: "none", boxSizing: "border-box" }}
          />
        </div>

        {/* Event */}
        <select
          value={eventFilter}
          onChange={e => setEventFilter(e.target.value)}
          data-testid="select-event-filter"
          style={{ backgroundColor: "#e8e8e7", border: "none", borderRadius: 6, fontSize: 13, padding: "8px 12px", color: TI.text, outline: "none", cursor: "pointer" }}
        >
          <option value="all">Todos os eventos</option>
          {[...events].sort((a: any, b: any) => a.name.localeCompare(b.name)).map((ev: any) => (
            <option key={ev.id} value={ev.id}>{ev.name}</option>
          ))}
        </select>

        {/* Status */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          data-testid="select-status-filter"
          style={{ backgroundColor: "#e8e8e7", border: "none", borderRadius: 6, fontSize: 13, padding: "8px 12px", color: TI.text, outline: "none", cursor: "pointer" }}
        >
          <option value="all">Todos os status</option>
          <option value="approved">Liberados</option>
          <option value="inProduction">Em Produção</option>
          <option value="produced">Produzidos</option>
          <option value="delivered">Entregues</option>
        </select>

        {/* Mês */}
        <select
          value={monthFilter}
          onChange={e => setMonthFilter(e.target.value)}
          data-testid="select-month-filter"
          style={{ backgroundColor: "#e8e8e7", border: "none", borderRadius: 6, fontSize: 13, padding: "8px 12px", color: TI.text, outline: "none", cursor: "pointer" }}
        >
          {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>

        {/* Toggle Próximos 10 dias */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, borderLeft: `1px solid ${TI.border}`, paddingLeft: 12, marginLeft: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: TI.secondary, whiteSpace: "nowrap" }}>Próximos 10 dias</span>
          <button
            onClick={() => setNext10DaysFilter(v => !v)}
            data-testid="button-next-10-days-filter"
            style={{
              width: 38, height: 20, borderRadius: 100, border: "none", cursor: "pointer", position: "relative",
              backgroundColor: next10DaysFilter ? TI.accent : "#d6d3d1", transition: "background-color 0.2s",
            }}
          >
            <span style={{
              position: "absolute", top: 3, width: 14, height: 14, borderRadius: "50%",
              backgroundColor: "#ffffff", transition: "left 0.2s",
              left: next10DaysFilter ? 20 : 3,
            }} />
          </button>
        </div>

        {/* Filtros Avançados */}
        <button
          onClick={() => setShowAdvancedFilters(v => !v)}
          data-testid="button-toggle-advanced-filters"
          style={{ display: "flex", alignItems: "center", gap: 5, backgroundColor: showAdvancedFilters ? TI.text : "transparent", color: showAdvancedFilters ? "#ffffff" : TI.secondary, border: `1px solid ${showAdvancedFilters ? TI.text : TI.border}`, borderRadius: 6, padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}
        >
          <Filter style={{ width: 13, height: 13 }} />
          Filtros
          <ChevronDown style={{ width: 12, height: 12, transform: showAdvancedFilters ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
        </button>

        {/* Avançados */}
        {showAdvancedFilters && (
          <div style={{ width: "100%", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, borderTop: `1px solid ${TI.border}`, paddingTop: 10, marginTop: 2 }}>
            {[
              { label: "Tipo", value: typeFilter, onChange: setTypeFilter, options: uniqueTypes, testId: "select-type-filter" },
              { label: "Material", value: materialFilter, onChange: setMaterialFilter, options: uniqueMaterials, testId: "select-material-filter" },
              { label: "Acabamento", value: finishFilter, onChange: setFinishFilter, options: uniqueFinishes, testId: "select-finish-filter" },
            ].map(f => (
              <select key={f.label} value={f.value} onChange={e => f.onChange(e.target.value)} data-testid={f.testId} style={{ backgroundColor: "#e8e8e7", border: "none", borderRadius: 6, fontSize: 13, padding: "8px 12px", color: TI.text, outline: "none", cursor: "pointer" }}>
                <option value="all">Todos os {f.label.toLowerCase()}s</option>
                {f.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ))}
            {(typeFilter !== "all" || materialFilter !== "all" || finishFilter !== "all") && (
              <div style={{ gridColumn: "1 / -1" }}>
                <button onClick={() => { setTypeFilter("all"); setMaterialFilter("all"); setFinishFilter("all"); }} data-testid="button-reset-advanced-filters" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#dc2626", fontWeight: 600 }}>
                  Limpar filtros avançados
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Tabela Principal ── */}
      <div style={{ backgroundColor: TI.surface, border: `1px solid ${TI.border}`, borderRadius: 10, overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
            <div style={{ width: 32, height: 32, border: `3px solid ${TI.border}`, borderTopColor: TI.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 24px", color: TI.muted }}>
            <Package style={{ width: 40, height: 40, margin: "0 auto 12px", color: TI.muted }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: TI.secondary, marginBottom: 4 }}>Nenhuma peça encontrada</div>
            <div style={{ fontSize: 13 }}>Ajuste os filtros para visualizar itens</div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: TI.text }}>
                {["ID", "Descrição", "QTD", "PROD", "Dimensões (V × A)", "M²", "Material", "Status", ""].map(col => (
                  <th key={col} style={{ padding: "13px 16px", textAlign: col === "" ? "right" : "left", fontSize: 9, fontWeight: 900, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item: any, index: number) => {
                const prev = index > 0 ? filteredItems[index - 1] : null;
                const showEvHeader = !prev || (prev as any).event?.name !== item.event?.name;
                const showTypeHeader = !prev || (prev as any).event?.name !== item.event?.name || (prev as any).type !== item.type;

                return (
                  <Fragment key={item.id}>
                    {/* Cabeçalho de Evento */}
                    {showEvHeader && (
                      <tr style={{ backgroundColor: "#292524" }}>
                        <td colSpan={9} style={{ padding: "10px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <Package style={{ width: 16, height: 16, color: TI.accent }} />
                              <span style={{ fontSize: 12, fontWeight: 800, color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'Space Grotesk', sans-serif" }}>
                                {item.event?.name || "Sem Evento"}
                              </span>
                            </div>
                            {item.event && (
                              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                                  <Calendar style={{ width: 12, height: 12 }} />
                                  Início: <strong style={{ color: "rgba(255,255,255,0.7)" }}>{new Date(item.event.startDate).toLocaleDateString("pt-BR")}</strong>
                                </div>
                                <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 10 }}>|</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                                  <Truck style={{ width: 12, height: 12 }} />
                                  Saída: <strong style={{ color: "rgba(255,255,255,0.7)" }}>
                                    {new Date(item.event.truckDepartureDate).toLocaleDateString("pt-BR")} às {new Date(item.event.truckDepartureDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                  </strong>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Cabeçalho de Tipo */}
                    {showTypeHeader && (
                      <tr style={{ backgroundColor: "#f4f3f0" }}>
                        <td colSpan={9} style={{ padding: "6px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 3, height: 14, backgroundColor: TI.accent, borderRadius: 2, flexShrink: 0 }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: TI.text }}>{item.type}</span>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Linha do item */}
                    <tr
                      style={{ borderBottom: `1px solid #f4f3f0`, cursor: "pointer", transition: "background-color 0.1s" }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = "#fafaf9")}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = "")}
                      onClick={() => setViewDetailsItem(item)}
                      data-testid={`row-item-${item.id}`}
                    >
                      {/* ID */}
                      <td style={{ padding: "13px 16px" }}>
                        <span style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: TI.accent, fontWeight: 700, letterSpacing: "0.04em" }} data-testid={`text-display-id-${item.id}`}>
                          {item.displayId}
                        </span>
                      </td>
                      {/* Descrição */}
                      <td style={{ padding: "13px 16px", maxWidth: 280 }}>
                        {item.description ? (
                          <div style={{ fontSize: 12, color: TI.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description}</div>
                        ) : (
                          <div style={{ fontSize: 12, color: TI.muted }}>—</div>
                        )}
                        {item.observations && (
                          <div style={{ fontSize: 11, color: TI.secondary, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{item.observations}</div>
                        )}
                      </td>
                      {/* Qtd */}
                      <td style={{ padding: "13px 16px", textAlign: "center", fontSize: 13, fontWeight: 700, color: TI.text }}>{item.quantity}</td>
                      {/* Prod */}
                      <td style={{ padding: "13px 16px", textAlign: "center", fontSize: 13, fontWeight: 700, color: item.quantityProduced > 0 ? TI.accent : TI.muted }}>
                        {item.quantityProduced || "—"}
                      </td>
                      {/* Dimensões */}
                      <td style={{ padding: "13px 16px" }}>
                        {item.visualWidth && item.visualHeight ? (
                          <div>
                            <div style={{ fontSize: 11, color: TI.text, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                              <span style={{ color: TI.muted, fontWeight: 600 }}>V:</span> {item.visualWidth}×{item.visualHeight}
                            </div>
                            {item.fileWidth && item.fileHeight && (
                              <div style={{ fontSize: 11, color: TI.muted, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                                <span style={{ fontWeight: 600 }}>A:</span> {item.fileWidth}×{item.fileHeight}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: TI.muted }}>—</span>
                        )}
                      </td>
                      {/* m² */}
                      <td style={{ padding: "13px 16px", textAlign: "center", fontSize: 13, fontWeight: 700, color: TI.text, fontFamily: "monospace" }}>{item.calculatedM2 || "—"}</td>
                      {/* Material */}
                      <td style={{ padding: "13px 16px" }}>
                        <div style={{ fontSize: 12, color: TI.text }}>{item.material}</div>
                        {item.finish && <div style={{ fontSize: 11, color: TI.muted, marginTop: 2 }}>{item.finish}</div>}
                      </td>
                      {/* Status */}
                      <td style={{ padding: "13px 16px" }}>
                        <StatusPill status={item.status} />
                      </td>
                      {/* Ações */}
                      <td style={{ padding: "13px 16px", textAlign: "right" }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                          {/* Ver detalhes */}
                          <button
                            onClick={() => setViewDetailsItem(item)}
                            title="Ver detalhes"
                            data-testid={`button-view-${item.id}`}
                            style={{ background: "none", border: "none", cursor: "pointer", color: TI.muted, padding: 4, borderRadius: 4, display: "flex", alignItems: "center", transition: "color 0.15s" }}
                            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = TI.text)}
                            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = TI.muted)}
                          >
                            <Eye style={{ width: 15, height: 15 }} />
                          </button>

                          {/* Iniciar / Continuar Produção */}
                          {!isProduced(item) && !isDelivered(item) && (
                            <button
                              onClick={() => openProductionModal(item)}
                              title={isInProd(item) ? "Continuar Produção" : "Iniciar Produção"}
                              data-testid={`button-production-${item.id}`}
                              style={{ backgroundColor: TI.text, color: "#ffffff", border: "none", borderRadius: 6, height: 30, padding: "0 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, transition: "background-color 0.15s" }}
                              onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = TI.accent)}
                              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = TI.text)}
                            >
                              <Play style={{ width: 11, height: 11 }} />
                              {isInProd(item) ? "Continuar" : "Produzir"}
                            </button>
                          )}

                          {/* Marcar Entrega */}
                          {!isDelivered(item) && (
                            <button
                              onClick={() => openDeliveryModal(item)}
                              title="Marcar Entrega"
                              data-testid={`button-deliver-${item.id}`}
                              style={{ backgroundColor: TI.accent, color: "#ffffff", border: "none", borderRadius: 6, height: 30, padding: "0 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, transition: "background-color 0.15s" }}
                              onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = TI.accentDark)}
                              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = TI.accent)}
                            >
                              <Truck style={{ width: 11, height: 11 }} />
                              Entregar
                            </button>
                          )}

                          {/* Entregue */}
                          {isDelivered(item) && (
                            <span style={{ fontSize: 12, color: "#15803d", display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
                              <Check style={{ width: 13, height: 13 }} /> Entregue
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Linha de observação */}
                    {item.observations && (
                      <tr style={{ backgroundColor: "#fffbeb", borderBottom: "1px solid #fde68a" }}>
                        <td colSpan={9} style={{ padding: "8px 16px" }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                            <AlertCircle style={{ width: 14, height: 14, color: "#d97706", marginTop: 1, flexShrink: 0 }} />
                            <span style={{ fontSize: 12, color: "#92400e" }}>
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

        {/* Rodapé da tabela */}
        {filteredItems.length > 0 && (
          <div style={{ borderTop: `1px solid ${TI.border}`, padding: "10px 16px", backgroundColor: "#fafaf9", fontSize: 12, color: TI.secondary }}>
            Exibindo <strong style={{ color: TI.text }}>{filteredItems.length}</strong> peça{filteredItems.length !== 1 ? "s" : ""} ·{" "}
            <strong style={{ color: TI.text }}>{Array.from(new Set(filteredItems.map((i: any) => i.eventId).filter(Boolean))).length}</strong> evento{Array.from(new Set(filteredItems.map((i: any) => i.eventId).filter(Boolean))).length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* ── Dialog de Detalhes ── */}
      <ItemDetailsDialog
        item={viewDetailsItem}
        auditLogs={auditLogs}
        open={!!viewDetailsItem}
        onOpenChange={(open) => !open && setViewDetailsItem(null)}
      />

      {/* ── Modal de Produção / Entrega ── */}
      <Dialog open={!!selectedItem && !!modalType} onOpenChange={open => { if (!open) { setSelectedItem(null); setModalType(null); } }}>
        <DialogContent style={{ padding: 0, gap: 0, maxWidth: 440, borderRadius: 12, overflow: "hidden" }}>
          {/* Header dark */}
          <div style={{ backgroundColor: TI.text, padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#ffffff", textTransform: "uppercase", letterSpacing: "-0.02em", fontFamily: "'Space Grotesk', sans-serif" }}>
                {modalType === "production"
                  ? (selectedItem?.quantityProduced > 0 ? "Continuar Produção" : "Iniciar Produção")
                  : "Confirmar Entrega"}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>
                {modalType === "production" ? "Registre a quantidade produzida" : "Registre a entrega do material"}
              </div>
            </div>
          </div>

          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Info card */}
            {selectedItem && (
              <div style={{ backgroundColor: "#f4f3f0", borderRadius: 8, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <span style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: TI.accent }}>
                    {selectedItem.displayId}
                  </span>
                  <StatusPill status={selectedItem.status} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: TI.text }}>{selectedItem.type}</div>
                <div style={{ fontSize: 12, color: TI.secondary, marginTop: 4 }}>
                  {selectedItem.event?.name} · {selectedItem.material}
                  {selectedItem.visualWidth && ` · ${selectedItem.visualWidth}×${selectedItem.visualHeight}`}
                </div>
              </div>
            )}

            {/* Produção */}
            {selectedItem && modalType === "production" && (
              <form onSubmit={handleSubmitProduction} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: TI.secondary, marginBottom: 8 }}>
                    Quantidade a Produzir
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                      type="number"
                      min={1}
                      max={selectedItem.quantity}
                      value={productionData.quantityProduced}
                      onChange={e => setProductionData({ quantityProduced: parseInt(e.target.value) || 0 })}
                      required
                      data-testid="input-quantity-produced"
                      style={{ flex: 1, padding: "10px 14px", textAlign: "center", backgroundColor: "#f4f3f0", border: `1px solid ${TI.border}`, borderRadius: 6, fontSize: 16, fontWeight: 700, color: TI.text, outline: "none" }}
                    />
                    <span style={{ fontSize: 13, color: TI.secondary, whiteSpace: "nowrap" }}>/ {selectedItem.quantity} total</span>
                    <button
                      type="button"
                      onClick={() => setProductionData({ quantityProduced: selectedItem.quantity })}
                      data-testid="button-set-total"
                      style={{ backgroundColor: "#f4f3f0", border: `1px solid ${TI.border}`, borderRadius: 6, padding: "8px 12px", fontSize: 12, fontWeight: 600, color: TI.secondary, cursor: "pointer" }}
                    >
                      Tudo
                    </button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
                  <button type="button" onClick={() => { setSelectedItem(null); setModalType(null); }} style={{ flex: 1, border: `1px solid ${TI.border}`, backgroundColor: "transparent", color: TI.secondary, borderRadius: 6, padding: "11px 0", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={startProductionMutation.isPending || productionData.quantityProduced === 0}
                    data-testid="button-confirm-production"
                    style={{ flex: 1, backgroundColor: TI.text, color: "#ffffff", border: "none", borderRadius: 6, padding: "11px 0", fontSize: 13, fontWeight: 700, cursor: startProductionMutation.isPending ? "not-allowed" : "pointer", opacity: startProductionMutation.isPending ? 0.7 : 1, transition: "background-color 0.15s" }}
                    onMouseEnter={e => { if (!startProductionMutation.isPending) (e.currentTarget as HTMLButtonElement).style.backgroundColor = TI.accent; }}
                    onMouseLeave={e => { if (!startProductionMutation.isPending) (e.currentTarget as HTMLButtonElement).style.backgroundColor = TI.text; }}
                  >
                    {startProductionMutation.isPending ? "Salvando..." : "Confirmar Produção"}
                  </button>
                </div>
              </form>
            )}

            {/* Entrega */}
            {selectedItem && modalType === "delivery" && (
              <form onSubmit={handleSubmitDelivery} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Quem recebeu */}
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: TI.secondary, marginBottom: 8 }}>
                    Responsável pelo recebimento *
                  </label>
                  <Popover open={openRecipientCombobox} onOpenChange={setOpenRecipientCombobox}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        role="combobox"
                        data-testid="button-recipient-combobox"
                        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", backgroundColor: "#f4f3f0", border: `1px solid ${TI.border}`, borderRadius: 6, fontSize: 13, color: deliveryData.receivedBy ? TI.text : TI.muted, cursor: "pointer", textAlign: "left" }}
                      >
                        {deliveryData.receivedBy || "Selecione ou digite o nome..."}
                        <ChevronsUpDown style={{ width: 14, height: 14, color: TI.muted, flexShrink: 0 }} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent style={{ width: "100%", padding: 0 }} align="start">
                      <Command>
                        <CommandInput placeholder="Digite o nome..." value={deliveryData.receivedBy} onValueChange={v => setDeliveryData({ ...deliveryData, receivedBy: v })} />
                        <CommandList>
                          {uniqueRecipients.length === 0 ? (
                            <CommandEmpty>Digite o nome de quem recebeu</CommandEmpty>
                          ) : (
                            <>
                              <CommandEmpty>{deliveryData.receivedBy ? `Usar "${deliveryData.receivedBy}"` : "Digite o nome"}</CommandEmpty>
                              <CommandGroup heading="Anteriores">
                                {uniqueRecipients.map(r => (
                                  <CommandItem key={r} value={r} onSelect={v => { setDeliveryData({ ...deliveryData, receivedBy: v }); setOpenRecipientCombobox(false); }}>
                                    <Check className={cn("mr-2 h-4 w-4", deliveryData.receivedBy === r ? "opacity-100" : "opacity-0")} />
                                    {r}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Foto da entrega */}
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: TI.secondary, marginBottom: 8 }}>
                    Comprovante fotográfico (opcional)
                  </label>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <ObjectUploader
                        maxFileSize={10485760}
                        buttonVariant="outline"
                        onFileSelect={(_file, previewUrl) => setPhotoPreviewUrl(previewUrl)}
                        onGetUploadParameters={async () => {
                          const res = await fetch("/api/objects/upload", { method: "POST" });
                          const data = await res.json();
                          return { method: "PUT" as const, url: data.uploadURL };
                        }}
                        onComplete={async (result) => {
                          setUploadedPhotoUrl(result.url);
                          setIsPhotoUploaded(true);
                          toast({ title: "Foto carregada", description: "Foto anexada com sucesso" });
                        }}
                        onError={(error) => {
                          setPhotoPreviewUrl("");
                          toast({ title: "Erro no upload", description: error.message, variant: "destructive" });
                        }}
                      >
                        <Camera style={{ width: 14, height: 14, marginRight: 6 }} />
                        {photoPreviewUrl ? "Trocar Foto" : "Anexar Foto"}
                      </ObjectUploader>
                    </div>
                    {photoPreviewUrl && (
                      <div style={{ position: "relative", width: 72, height: 72, borderRadius: 8, overflow: "hidden", border: `1px solid ${TI.border}`, flexShrink: 0 }}>
                        <img src={photoPreviewUrl} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} data-testid="photo-preview" />
                        {isPhotoUploaded && (
                          <div style={{ position: "absolute", top: 4, right: 4, backgroundColor: "#15803d", borderRadius: "50%", padding: 2 }}>
                            <Check style={{ width: 10, height: 10, color: "#ffffff" }} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
                  <button type="button" onClick={() => { setSelectedItem(null); setModalType(null); }} style={{ flex: 1, border: `1px solid ${TI.border}`, backgroundColor: "transparent", color: TI.secondary, borderRadius: 6, padding: "11px 0", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={markDeliveredMutation.isPending}
                    data-testid="button-confirm-delivery"
                    style={{ flex: 1, backgroundColor: "#15803d", color: "#ffffff", border: "none", borderRadius: 6, padding: "11px 0", fontSize: 13, fontWeight: 700, cursor: markDeliveredMutation.isPending ? "not-allowed" : "pointer", opacity: markDeliveredMutation.isPending ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "background-color 0.15s" }}
                    onMouseEnter={e => { if (!markDeliveredMutation.isPending) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#166534"; }}
                    onMouseLeave={e => { if (!markDeliveredMutation.isPending) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#15803d"; }}
                  >
                    <Truck style={{ width: 14, height: 14 }} />
                    {markDeliveredMutation.isPending ? "Salvando..." : "Confirmar Entrega"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
