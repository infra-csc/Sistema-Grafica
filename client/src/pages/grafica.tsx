import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { FilterSelect } from "@/components/filter-select";
import { AlertCircle, Package, CheckCircle, Truck, Calendar, Eye, Check, ChevronsUpDown, Camera, Search, Play, X, Filter, ChevronDown, Printer, RotateCcw, Recycle, ImagePlus, FileSpreadsheet } from "lucide-react";
import { Fragment, useState, useMemo } from "react";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { cn, parseDateLocal } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest, queryClient, getCurrentUserName } from "@/lib/queryClient";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
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
  draft:                  { label: "Rascunho",           bg: "#f5f5f4", color: "#78716c", border: "#e7e5e4" },
  requested:              { label: "Solicitado",         bg: "#f5f5f4", color: "#78716c", border: "#e7e5e4" },
  awaiting_linking:       { label: "Ag. Vinculação",     bg: "#fef9c3", color: "#a16207", border: "#fde047" },
  awaiting_submission:    { label: "Ag. Envio",          bg: "#fef9c3", color: "#a16207", border: "#fde047" },
  awaiting_approval:      { label: "Ag. Aprovação",      bg: "#fef9c3", color: "#a16207", border: "#fde047" },
  awaiting_finalization:  { label: "Ag. Finalização",    bg: "#fef9c3", color: "#a16207", border: "#fde047" },
  awaiting_final_review:  { label: "Ag. Revisão",        bg: "#fef9c3", color: "#a16207", border: "#fde047" },
  awaiting_creator_review:{ label: "Ag. Finalização",    bg: "#fef9c3", color: "#a16207", border: "#fde047" },
  ready_for_production:   { label: "Pronto p/ Prod.",    bg: "#ede9fe", color: "#6d28d9", border: "#c4b5fd" },
  pronto_para_producao:   { label: "Pronto p/ Prod.",    bg: "#ede9fe", color: "#6d28d9", border: "#c4b5fd" },
  approved:               { label: "Liberado",           bg: "#dbeafe", color: "#1d4ed8", border: "#93c5fd" },
  inProduction:           { label: "Em Produção",        bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
  produced:               { label: "Produzido",          bg: "#dcfce7", color: "#15803d", border: "#86efac" },
  conferred:              { label: "Conferido",          bg: "#ecfeff", color: "#0e7490", border: "#a5f3fc" },
  delivered:              { label: "Entregue",           bg: "#f0fdf4", color: "#166534", border: "#6ee7b7" },
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
  const [modalType, setModalType] = useState<"production" | "delivery" | "conference" | null>(null);
  const [viewDetailsItem, setViewDetailsItem] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [eventFilter, setEventFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [materialFilter, setMaterialFilter] = useState<string[]>([]);
  const [finishFilter, setFinishFilter] = useState<string[]>([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [next10DaysFilter, setNext10DaysFilter] = useState(false);
  const [monthFilter, setMonthFilter] = useState<string[]>([]);
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [isExporting, setIsExporting] = useState(false);
  const [productionData, setProductionData] = useState({ quantityProduced: 0 });
  const [deliveryData, setDeliveryData] = useState({ photoUrl: "", receivedBy: "" });
  const [conferQty, setConferQty] = useState(0);   // conferência parcial
  const [deliverQty, setDeliverQty] = useState(0); // entrega parcial
  // Fotos anexadas no modal aberto (conferência ou entrega). Várias por vez.
  const [photos, setPhotos] = useState<string[]>([]);
  // A URL assinada do GCS perde o token ao ser gravada; o app serve os arquivos
  // por /objects/... — sem converter, a foto salva não abre depois.
  const addPhoto = (url: string) => setPhotos(prev => [...prev, convertGCSUrlToLocalPath(url)]);
  const removePhoto = (url: string) => setPhotos(prev => prev.filter(p => p !== url));
  const [modalNotes, setModalNotes] = useState("");
  const [reuseConfirmItemId, setReuseConfirmItemId] = useState<string | null>(null);
  const [reuseQty, setReuseQty] = useState(0); // reaproveitamento parcial

  const { data: items = [], isLoading, isError, refetch } = useQuery<any[]>({ queryKey: ["/api/items/approved"] });
  const { data: events = [] } = useQuery<any[]>({ queryKey: ["/api/events"] });
  const { data: auditLogs = [] } = useQuery<any[]>({ queryKey: ["/api/audit-logs"] });
  const { data: standardItems = [] } = useQuery<any[]>({ queryKey: ['/api/standard-items'] });
  const typeToGroup = useMemo(() => {
    const map: Record<string, string> = {};
    (standardItems as any[]).forEach((s: any) => { if (s.group) map[s.name] = s.group; });
    return map;
  }, [standardItems]);

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
      setPhotos([]);
      toast({ title: "Entrega confirmada", description: "O item foi marcado como entregue com sucesso" });
    },
    onError: (error: Error) => toast({ title: "Erro ao confirmar entrega", description: error.message, variant: "destructive" }),
  });

  const conferMutation = useMutation({
    mutationFn: async ({ itemId, conferencePhotoUrl, qty, notes }: { itemId: string; conferencePhotoUrl: string; qty: number; notes?: string }) =>
      await apiRequest("POST", `/api/items/${itemId}/confer`, { conferencePhotoUrl, qty, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setSelectedItem(null); setModalType(null);
      setPhotos([]);
      toast({ title: "Conferido", description: "A peça foi conferida e está pronta para entrega." });
    },
    onError: (error: Error) => toast({ title: "Erro ao conferir", description: error.message, variant: "destructive" }),
  });

  const markReuseMutation = useMutation({
    mutationFn: async ({ itemId, qty }: { itemId: string; qty: number }) =>
      await apiRequest("POST", `/api/items/${itemId}/mark-reuse`, { qty }),
    onSuccess: (updated: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setReuseConfirmItemId(null);
      const falta = (updated?.quantity ?? 0) - (updated?.reuseQty ?? 0);
      toast({
        title: "Reaproveitamento registrado",
        description: falta > 0
          ? `${updated.reuseQty} un. reaproveitada(s). Faltam ${falta} un. para produzir.`
          : "Peça inteira reaproveitada. Segue para conferência.",
      });
    },
    onError: (error: Error) => {
      setReuseConfirmItemId(null);
      toast({ title: "Erro ao marcar reaproveitamento", description: error.message, variant: "destructive" });
    },
  });

  const uniqueTypes = Array.from(new Set(items.map((i: any) => i.type))).sort() as string[];
  const uniqueMaterials = Array.from(new Set(items.map((i: any) => i.material).filter(Boolean))).sort() as string[];
  const uniqueFinishes = Array.from(new Set(items.map((i: any) => i.finish).filter(Boolean))).sort() as string[];

  // Filtros facetados: cada filtro lista só o que existe no recorte atual,
  // aplicando os OUTROS filtros ativos (com contagem por opção).
  const gFacetPool = (exclude: 'event' | 'status' | 'type' | 'material' | 'finish') =>
    (items as any[]).filter((item: any) => {
      if (exclude !== 'status' && statusFilter.length > 0) {
        const ok = statusFilter.some(sf => sf === "ready_for_production"
          ? (item.status === "ready_for_production" || item.status === "pronto_para_producao" || item.status === "approved")
          : item.status === sf);
        if (!ok) return false;
      }
      if (exclude !== 'event' && eventFilter.length > 0 && !eventFilter.includes(item.eventId)) return false;
      if (exclude !== 'type' && typeFilter.length > 0 && !typeFilter.includes(item.type)) return false;
      if (exclude !== 'material' && materialFilter.length > 0 && !materialFilter.includes(item.material)) return false;
      if (exclude !== 'finish' && finishFilter.length > 0 && !finishFilter.includes(item.finish)) return false;
      return true;
    });

  const countField = (exclude: any, key: 'type' | 'material' | 'finish') => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    gFacetPool(exclude).forEach((i: any) => {
      const v = i[key];
      if (!v) return;
      const cur = map.get(v);
      if (cur) cur.count++;
      else map.set(v, { value: v, label: v, count: 1 });
    });
    return Array.from(map.values());
  };

  const eventFilterOptions = (() => {
    const DOT: Record<string, string> = { urgente: '#ef4444', urgent: '#ef4444', alta: '#f97316', media: '#eab308', baixa: '#3b82f6' };
    const map = new Map<string, { value: string; label: string; count: number; dotColor?: string }>();
    gFacetPool('event').forEach((i: any) => {
      if (!i.eventId) return;
      const cur = map.get(i.eventId);
      if (cur) cur.count++;
      else map.set(i.eventId, { value: i.eventId, label: i.event?.name || 'Sem evento', count: 1, dotColor: DOT[i.event?.priority] });
    });
    return Array.from(map.values());
  })();
  const typeFilterOptions = countField('type', 'type');
  const materialFilterOptions = countField('material', 'material');
  const finishFilterOptions = countField('finish', 'finish');

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
      if (statusFilter.length > 0) {
        const matchesFilter = statusFilter.some(sf => sf === "ready_for_production"
          ? (item.status === "ready_for_production" || item.status === "pronto_para_producao" || item.status === "approved")
          : item.status === sf);
        if (!matchesFilter) return false;
      }
      if (eventFilter.length > 0 && !eventFilter.includes(item.eventId)) return false;
      if (typeFilter.length > 0 && !typeFilter.includes(item.type)) return false;
      if (materialFilter.length > 0 && !materialFilter.includes(item.material)) return false;
      if (finishFilter.length > 0 && !finishFilter.includes(item.finish)) return false;
      if (next10DaysFilter && item.event?.truckDepartureDate) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const tenDays = new Date(today); tenDays.setDate(tenDays.getDate() + 10);
        const dep = new Date(item.event.truckDepartureDate);
        if (!(dep >= today && dep <= tenDays)) return false;
      }
      if (monthFilter.length > 0 && item.event?.truckDepartureDate) {
        const month = new Date(item.event.truckDepartureDate).getMonth() + 1;
        if (!monthFilter.includes(month.toString())) return false;
      }
      return true;
    })
    .sort((a: any, b: any) => {
      const ea = a.event?.name || ""; const eb = b.event?.name || "";
      if (ea !== eb) return ea.localeCompare(eb);
      return a.type.localeCompare(b.type);
    });

  // statsPool: todos os filtros ativos (exceto status) — os cards mostram contagens dentro do contexto atual
  const statsPool = (items as any[]).filter((item: any) => {
    if (eventFilter.length > 0 && !eventFilter.includes(item.eventId)) return false;
    if (typeFilter.length > 0 && !typeFilter.includes(item.type)) return false;
    if (materialFilter.length > 0 && !materialFilter.includes(item.material)) return false;
    if (finishFilter.length > 0 && !finishFilter.includes(item.finish)) return false;
    if (next10DaysFilter && item.event?.truckDepartureDate) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const tenDays = new Date(today); tenDays.setDate(tenDays.getDate() + 10);
      const dep = new Date(item.event.truckDepartureDate);
      if (!(dep >= today && dep <= tenDays)) return false;
    }
    if (monthFilter.length > 0 && item.event?.truckDepartureDate) {
      const month = new Date(item.event.truckDepartureDate).getMonth() + 1;
      if (!monthFilter.includes(month.toString())) return false;
    }
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      if (!item.type?.toLowerCase().includes(q) && !item.description?.toLowerCase().includes(q) &&
          !item.displayId?.toLowerCase().includes(q) && !item.event?.name?.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const stats = {
    liberados:  statsPool.filter((i: any) => i.status === 'approved' || i.status === 'ready_for_production' || i.status === 'pronto_para_producao').length,
    emProducao: statsPool.filter((i: any) => i.status === 'inProduction').length,
    produzidos: statsPool.filter((i: any) => i.status === 'produced').length,
    conferidos: statsPool.filter((i: any) => i.status === 'conferred').length,
    entregues:  statsPool.filter((i: any) => i.status === 'delivered').length,
    total:      statsPool.length,
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
    if (photos.length) {
      try {
        await Promise.all(photos.map(photoUrl =>
          apiRequest("POST", `/api/items/${selectedItem.id}/photos`, {
            photoUrl, kind: "delivery",
            uploadedBy: getCurrentUserName(),
          })
        ));
      } catch {
        toast({ title: "Erro ao salvar fotos", variant: "destructive" });
        return;
      }
    }
    markDeliveredMutation.mutate({ itemId: selectedItem.id, data: { ...deliveryData, qty: deliverQty, notes: modalNotes } });
  };

  const handleSubmitConference = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    if (!photos.length) {
      toast({ title: "Foto obrigatória", description: "Envie ao menos uma foto da conferência.", variant: "destructive" });
      return;
    }
    // Todas as fotos ficam na galeria; a primeira também vai para o item, que é
    // o campo que o restante do app já lê como "foto da conferência".
    try {
      await Promise.all(photos.map(photoUrl =>
        apiRequest("POST", `/api/items/${selectedItem.id}/photos`, {
          photoUrl, kind: "conference",
          uploadedBy: getCurrentUserName(),
        })
      ));
    } catch {
      toast({ title: "Erro ao salvar fotos", variant: "destructive" });
      return;
    }
    conferMutation.mutate({ itemId: selectedItem.id, conferencePhotoUrl: photos[0], qty: conferQty, notes: modalNotes });
  };

  const isDelivered = (item: any) => item.status === "delivered" || item.status === "entregue";
  const isConferred = (item: any) => item.status === "conferred";
  const isProduced = (item: any) => item.status === "produced" || item.status === "produzido";
  const isInProd = (item: any) => item.status === "inProduction" || item.status === "em_producao";

  // Quantidades para reaproveitamento/conferência/entrega parciais.
  const qtyOf = (item: any) => Number(item.quantity) || 0;
  const conferredOf = (item: any) => Number(item.conferredQty) || 0;
  const deliveredOf = (item: any) => Number(item.deliveredQty) || 0;
  const reusedOf = (item: any) => Number(item.reuseQty) || 0;
  const producedOf = (item: any) => Number(item.quantityProduced) || 0;
  // Peças marcadas como reuso antes de reuseQty existir nunca conferiram — pela
  // regra antiga iam direto para a entrega. Mantidas nessa regra para não travar
  // entregas em andamento; as novas seguem pela conferência.
  const isLegacyReuse = (item: any) => item.isReuse && reusedOf(item) === 0;
  // Reuso total antigo não preencheu reuseQty, mas cobre a peça inteira.
  const reusedTotalOf = (item: any) => (item.isReuse ? qtyOf(item) : reusedOf(item));
  // Metragem que de fato vai para a impressora: o reaproveitado não é impresso.
  const m2ToProduce = (item: any) => {
    const total = Number(item.calculatedM2) || 0;
    const qty = qtyOf(item);
    if (!total || !qty) return total;
    const toPrint = qty - reusedTotalOf(item);
    return toPrint <= 0 ? 0 : (total / qty) * toPrint;
  };
  const remainingConfer = (item: any) => qtyOf(item) - conferredOf(item);
  // Reaproveitado também confere, então a entrega sempre sai do que foi conferido.
  const remainingDeliver = (item: any) =>
    (isLegacyReuse(item) ? qtyOf(item) : conferredOf(item)) - deliveredOf(item);
  // Sobra para reaproveitar: o que não foi reaproveitado nem produzido ainda.
  const remainingReuse = (item: any) => qtyOf(item) - reusedOf(item) - producedOf(item);
  // Botões parciais: dá pra conferir enquanto falta conferir (e já produziu);
  // dá pra entregar enquanto há conferido não entregue.
  const canConfer = (item: any) => !isDelivered(item) && !isLegacyReuse(item) && isProduced(item) && remainingConfer(item) > 0;
  const canDeliver = (item: any) => !isDelivered(item) && remainingDeliver(item) > 0;

  // Anexo de fotos usado pelos modais de conferência e entrega. Dois caminhos:
  // "Tirar foto" abre a câmera direto no celular; "Anexar" aceita várias da galeria.
  const uploadParams = async () => {
    const res = await fetch("/api/objects/upload", { method: "POST" });
    const data = await res.json();
    return { method: "PUT" as const, url: data.uploadURL };
  };
  const onPhotoError = (error: Error) =>
    toast({ title: "Erro no upload", description: error.message, variant: "destructive" });

  const renderNotesField = (placeholder: string) => (
    <div>
      <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#78716c", marginBottom: 8 }}>
        Observação <span style={{ color: "#a8a29e", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(opcional)</span>
      </label>
      <textarea
        value={modalNotes}
        onChange={e => setModalNotes(e.target.value)}
        placeholder={placeholder}
        rows={2}
        data-testid="input-notes"
        style={{ width: "100%", padding: "10px 14px", backgroundColor: "#e8e8e7", border: "1px solid transparent", borderRadius: 8, fontSize: 13, color: TI.text, outline: "none", resize: "vertical", fontFamily: "inherit" }}
      />
    </div>
  );

  const renderPhotoPicker = (hint: string) => (
    <div>
      <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#78716c", marginBottom: 10 }}>
        Fotos <span style={{ color: "#a8a29e", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>{hint}</span>
      </label>

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <ObjectUploader
            capture
            maxFileSize={10485760}
            buttonVariant="ghost"
            buttonClassName="w-full h-full p-0 border-0 hover:bg-transparent"
            onGetUploadParameters={uploadParams}
            onComplete={r => addPhoto(r.url)}
            onError={onPhotoError}
          >
            <div style={{ width: "100%", padding: "14px 0", backgroundColor: "#f4f3f0", borderRadius: 8, border: "2px dashed #d6d3d1", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <Camera style={{ width: 20, height: 20, color: "#78716c" }} />
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#78716c" }}>Tirar Foto</span>
            </div>
          </ObjectUploader>
        </div>
        <div style={{ flex: 1 }}>
          <ObjectUploader
            multiple
            maxFileSize={10485760}
            buttonVariant="ghost"
            buttonClassName="w-full h-full p-0 border-0 hover:bg-transparent"
            onGetUploadParameters={uploadParams}
            onComplete={r => addPhoto(r.url)}
            onError={onPhotoError}
          >
            <div style={{ width: "100%", padding: "14px 0", backgroundColor: "#f4f3f0", borderRadius: 8, border: "2px dashed #d6d3d1", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <ImagePlus style={{ width: 20, height: 20, color: "#78716c" }} />
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#78716c" }}>Anexar Fotos</span>
            </div>
          </ObjectUploader>
        </div>
      </div>

      {photos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 8, marginTop: 12 }}>
          {photos.map(url => (
            <div key={url} style={{ position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden", border: `1px solid ${TI.border}`, backgroundColor: "#f4f3f0" }}>
              <img src={url} alt="Foto anexada" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button
                type="button"
                onClick={() => removePhoto(url)}
                title="Remover foto"
                style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", border: "none", backgroundColor: "rgba(28,25,23,0.75)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
              >
                <X style={{ width: 11, height: 11 }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const openProductionModal = (item: any) => {
    setSelectedItem(item);
    setModalType("production");
    // O que já foi reaproveitado não precisa ser produzido de novo.
    setProductionData({ quantityProduced: qtyOf(item) - reusedOf(item) });
  };

  // Exporta a lista visível. Manda os ids em vez de repetir os filtros no
  // servidor — o arquivo sai idêntico ao que está na tela.
  const handleExportXlsx = async () => {
    if (!filteredItems.length) return;
    setIsExporting(true);
    try {
      const statusNames = statusFilter.map(s => statusConfig[s]?.label ?? s);
      const title = statusNames.length
        ? `Produção — ${statusNames.join(", ")}`
        : "Produção — Gráfica";

      const res = await fetch("/api/items/export-xlsx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ itemIds: filteredItems.map((i: any) => i.id), title }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Falha ao gerar o arquivo");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({ title: "Erro ao exportar", description: error.message, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const openConferenceModal = (item: any) => {
    setSelectedItem(item);
    setModalType("conference");
    setPhotos([]); setModalNotes("");
    setConferQty(remainingConfer(item)); // padrão: o que falta conferir
  };

  const openDeliveryModal = (item: any) => {
    setSelectedItem(item);
    setModalType("delivery");
    setPhotos([]); setModalNotes("");
    setDeliveryData({ photoUrl: "", receivedBy: "" });
    setDeliverQty(remainingDeliver(item)); // padrão: o que falta entregar
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24, backgroundColor: TI.bg, height: "100%", overflowY: "auto" }}>

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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {stats.liberados > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, backgroundColor: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa", borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#f97316", display: "inline-block" }} />
              {stats.liberados} peça{stats.liberados !== 1 ? "s" : ""} aguardando produção
            </span>
          )}
          {/* Exporta exatamente o que os filtros da tela estão mostrando. */}
          <button
            onClick={handleExportXlsx}
            disabled={isExporting || filteredItems.length === 0}
            data-testid="button-export-xlsx"
            title={filteredItems.length ? `Exportar ${filteredItems.length} peça(s) em Excel` : "Nada para exportar"}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              backgroundColor: TI.surface, color: TI.text,
              border: `1px solid ${TI.border}`, borderRadius: 6, padding: "7px 14px",
              fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em",
              cursor: (isExporting || filteredItems.length === 0) ? "not-allowed" : "pointer",
              opacity: (isExporting || filteredItems.length === 0) ? 0.5 : 1,
            }}
          >
            <FileSpreadsheet style={{ width: 13, height: 13 }} />
            {isExporting ? "Gerando…" : `Exportar Excel${filteredItems.length ? ` (${filteredItems.length})` : ""}`}
          </button>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        {[
          { label: "Liberados",    value: stats.liberados,  sub: "Aguard. produção", borderColor: "#0369a1", numColor: "#0369a1", testId: "stat-approved",    filterVal: "ready_for_production" },
          { label: "Em Produção",  value: stats.emProducao, sub: "Ativo",             borderColor: "#f97316", numColor: "#ea580c", testId: "stat-production",  filterVal: "inProduction" },
          { label: "Produzidos",   value: stats.produzidos, sub: "Aguard. conferência", borderColor: "#16a34a", numColor: "#15803d", testId: "stat-produced",    filterVal: "produced" },
          { label: "Conferidos",   value: stats.conferidos, sub: "Aguard. entrega",   borderColor: "#0891b2", numColor: "#0e7490", testId: "stat-conferred",   filterVal: "conferred" },
          { label: "Entregues",    value: stats.entregues,  sub: "Concluído",         borderColor: "#0284c7", numColor: "#166534", testId: "stat-delivered",   filterVal: "delivered" },
        ].map(kpi => {
          const isActive = statusFilter.includes(kpi.filterVal);
          return (
            <div
              key={kpi.label}
              onClick={() => setStatusFilter(isActive ? [] : [kpi.filterVal])}
              data-testid={kpi.testId}
              style={{
                backgroundColor: isActive ? kpi.borderColor : TI.surface,
                borderLeft: `4px solid ${kpi.borderColor}`,
                borderRadius: 8,
                padding: "16px 18px",
                boxShadow: isActive ? `0 4px 16px ${kpi.borderColor}33` : "0 1px 4px rgba(0,0,0,0.06)",
                cursor: "pointer",
                transition: "all 0.15s",
                outline: isActive ? `2px solid ${kpi.borderColor}` : "2px solid transparent",
                outlineOffset: 2,
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.backgroundColor = `${kpi.borderColor}0f`; }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.backgroundColor = TI.surface; }}
            >
              <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: isActive ? "rgba(255,255,255,0.7)" : TI.muted, marginBottom: 6, fontFamily: "'Space Grotesk', sans-serif" }}>{kpi.label}</div>
              <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.03em", fontFamily: "'Space Grotesk', sans-serif", color: isActive ? "#ffffff" : kpi.numColor, lineHeight: 1 }}>{kpi.value}</div>
              <div style={{ fontSize: 11, color: isActive ? "rgba(255,255,255,0.6)" : TI.secondary, marginTop: 4 }}>{isActive ? "Clique para limpar" : kpi.sub}</div>
            </div>
          );
        })}
        {/* Total — dark card, clica para resetar */}
        <div
          onClick={() => setStatusFilter([])}
          data-testid="stat-total"
          style={{
            backgroundColor: TI.text, borderLeft: `4px solid ${TI.accent}`, borderRadius: 8,
            padding: "16px 18px", boxShadow: "0 4px 16px rgba(0,0,0,0.14)",
            cursor: "pointer", transition: "opacity 0.15s",
            outline: statusFilter.length === 0 ? `2px solid ${TI.accent}` : "2px solid transparent",
            outlineOffset: 2,
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.opacity = "0.85")}
          onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.opacity = "1")}
        >
          <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", marginBottom: 6, fontFamily: "'Space Grotesk', sans-serif" }}>Total Geral</div>
          <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.03em", fontFamily: "'Space Grotesk', sans-serif", color: "#ffffff", lineHeight: 1 }}>{stats.total}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{statusFilter.length === 0 ? "Todos selecionados" : "Ver todos"}</div>
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
        <EventFilterDropdown
          values={eventFilter}
          onValuesChange={setEventFilter}
          options={eventFilterOptions}
        />

        {/* Status */}
        <FilterSelect
          showAllLabelWhenEmpty hideWhenEmpty={false}
          label="Status" allLabel="Todos os status"
          values={statusFilter} onValuesChange={setStatusFilter}
          options={[
            { value: "ready_for_production", label: "Pronto p/ Produção", pinned: true },
            { value: "approved", label: "Liberados", pinned: true },
            { value: "inProduction", label: "Em Produção", pinned: true },
            { value: "produced", label: "Produzidos", pinned: true },
            { value: "conferred", label: "Conferidos", pinned: true },
            { value: "delivered", label: "Entregues", pinned: true },
          ]}
          searchPlaceholder="Buscar status..." emptyText="Nenhum status encontrado."
          testId="select-status-filter"
          triggerStyle={{ backgroundColor: "#e8e8e7", border: "none", borderRadius: 6, fontSize: 13, color: TI.text }}
        />

        {/* Mês */}
        <FilterSelect
          showAllLabelWhenEmpty hideWhenEmpty={false}
          label="Mês" allLabel={months.find(m => m.value === "all")?.label || "Todos os meses"}
          values={monthFilter} onValuesChange={setMonthFilter}
          options={months.filter(m => m.value !== "all").map(m => ({ value: m.value, label: m.label, pinned: true }))}
          searchPlaceholder="Buscar mês..." emptyText="Nenhum mês encontrado."
          testId="select-month-filter"
          triggerStyle={{ backgroundColor: "#e8e8e7", border: "none", borderRadius: 6, fontSize: 13, color: TI.text }}
        />

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
              { label: "Tipo", allLabel: "Todos os tipos", values: typeFilter, onValuesChange: setTypeFilter, options: typeFilterOptions, testId: "select-type-filter" },
              { label: "Material", allLabel: "Todos os materiais", values: materialFilter, onValuesChange: setMaterialFilter, options: materialFilterOptions, testId: "select-material-filter" },
              { label: "Acabamento", allLabel: "Todos os acabamentos", values: finishFilter, onValuesChange: setFinishFilter, options: finishFilterOptions, testId: "select-finish-filter" },
            ].map(f => (
              <FilterSelect
                key={f.label}
                fullWidth showAllLabelWhenEmpty hideWhenEmpty={false}
                label={f.label} allLabel={f.allLabel}
                values={f.values} onValuesChange={f.onValuesChange}
                options={f.options}
                searchPlaceholder={`Buscar ${f.label.toLowerCase()}...`}
                emptyText="Nada encontrado."
                testId={f.testId}
                triggerStyle={{ backgroundColor: "#e8e8e7", border: "none", fontSize: 13, color: TI.text }}
              />
            ))}
            {(typeFilter.length > 0 || materialFilter.length > 0 || finishFilter.length > 0) && (
              <div style={{ gridColumn: "1 / -1" }}>
                <button onClick={() => { setTypeFilter([]); setMaterialFilter([]); setFinishFilter([]); }} data-testid="button-reset-advanced-filters" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#dc2626", fontWeight: 600 }}>
                  Limpar filtros avançados
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Tabela Principal ── */}
      <div style={{ backgroundColor: TI.surface, border: `1px solid ${TI.border}`, borderRadius: 10 }}>
        {isLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
            <div style={{ width: 32, height: 32, border: `3px solid ${TI.border}`, borderTopColor: TI.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          </div>
        ) : isError ? (
          <div style={{ textAlign: "center", padding: "48px 24px" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#b91c1c", marginBottom: 4 }}>Não foi possível carregar as peças</div>
            <div style={{ fontSize: 13, color: TI.muted, marginBottom: 16 }}>Verifique sua conexão e tente novamente.</div>
            <button onClick={() => refetch()} style={{ background: TI.text, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Tentar novamente</button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 24px", color: TI.muted }}>
            <Package style={{ width: 40, height: 40, margin: "0 auto 12px", color: TI.muted }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: TI.secondary, marginBottom: 4 }}>Nenhuma peça encontrada</div>
            <div style={{ fontSize: 13 }}>Ajuste os filtros para visualizar itens</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: TI.text }}>
                {["ID", "Descrição", "QTD", "REAPROV.", "PROD", "Dimensões (V × A)", "M² a produzir", "Material", "Status", ""].map(col => (
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
                    {(() => {
                      const groupName = typeToGroup[item.type] || '';
                      const prevGroupName = prev ? (typeToGroup[(prev as any).type] || '') : '';
                      const showGroupHeader = !showEvHeader && groupName !== '' && groupName !== prevGroupName;
                      return showGroupHeader ? (
                        <tr style={{ backgroundColor: '#dbeafe' }}>
                          <td colSpan={10} style={{ padding: '5px 16px' }}>
                            <span style={{ fontSize: 10, fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{groupName}</span>
                          </td>
                        </tr>
                      ) : null;
                    })()}
                    {showEvHeader && (
                      <tr style={{ backgroundColor: "#292524" }}>
                        <td colSpan={10} style={{ padding: "10px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <Package style={{ width: 16, height: 16, color: TI.accent }} />
                              <span style={{ fontSize: 12, fontWeight: 800, color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'Space Grotesk', sans-serif" }}>
                                {item.event?.name || "Sem Evento"}
                              </span>
                            </div>
                            {item.event && (
                              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                                  <Calendar style={{ width: 12, height: 12 }} />
                                  Início: <strong style={{ color: "rgba(255,255,255,0.7)" }}>{parseDateLocal(item.event.startDate).toLocaleDateString("pt-BR")}</strong>
                                </div>
                                <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 10 }}>|</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                                  <Truck style={{ width: 12, height: 12 }} />
                                  Saída: <strong style={{ color: "rgba(255,255,255,0.7)" }}>
                                    {new Date(item.event.truckDepartureDate).toLocaleDateString("pt-BR", { timeZone: 'UTC' })} às {new Date(item.event.truckDepartureDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: 'UTC' })}
                                  </strong>
                                </div>
                                {(() => {
                                  const days = item.event.deadlineProducaoGrafica ?? -1;
                                  const d = new Date(new Date(item.event.truckDepartureDate).getTime() + days * 86400000);
                                  d.setHours(0,0,0,0);
                                  const tod = new Date(); tod.setHours(0,0,0,0);
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
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, backgroundColor: s.bg, border: `1px solid ${s.border}`, borderRadius: 99, padding: "3px 9px", fontSize: 10, fontWeight: 700, color: s.text, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                                      Produção Gráfica · {ds}{diff >= 0 && diff <= 14 && <span style={{ opacity: 0.65, fontWeight: 500 }}> ({diff}d)</span>}
                                    </span>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Cabeçalho de Tipo */}
                    {showTypeHeader && (
                      <tr style={{ backgroundColor: "#f4f3f0" }}>
                        <td colSpan={10} style={{ padding: "6px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 3, height: 14, backgroundColor: TI.accent, borderRadius: 2, flexShrink: 0 }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: TI.text }}>{item.type}</span>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Linha do item */}
                    <tr
                      style={{ borderBottom: `1px solid ${item.isReuse ? "#bbf7d0" : "#f4f3f0"}`, cursor: "pointer", transition: "background-color 0.1s", backgroundColor: item.isReuse ? "#f0fdf4" : undefined }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = item.isReuse ? "#dcfce7" : "#fafaf9")}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = item.isReuse ? "#f0fdf4" : "")}
                      onClick={() => setViewDetailsItem(item)}
                      data-testid={`row-item-${item.id}`}
                    >
                      {/* ID */}
                      <td style={{ padding: "13px 16px" }}>
                        <span style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: item.isReuse ? "#059669" : TI.accent, fontWeight: 700, letterSpacing: "0.04em" }} data-testid={`text-display-id-${item.id}`}>
                          {item.displayId}
                        </span>
                      </td>
                      {/* Descrição */}
                      <td style={{ padding: "13px 16px", maxWidth: 280 }}>
                        {/* A cor verde da linha sozinha não diz o que é: o rótulo
                            precisa aparecer sempre que houver reaproveitamento,
                            inclusive nas peças marcadas antes de reuseQty existir. */}
                        {(item.isReuse || reusedOf(item) > 0) && (
                          <div title={item.isReuse ? "Peça inteira reaproveitada" : `${reusedOf(item)} de ${qtyOf(item)} un. reaproveitadas`}
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, backgroundColor: item.isReuse ? "#059669" : "#10b981", color: "#ffffff", borderRadius: 5, padding: "3px 9px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>
                            <RotateCcw style={{ width: 11, height: 11 }} />
                            {item.isReuse ? "Reaproveitamento" : `Reaproveitamento ${reusedOf(item)}/${qtyOf(item)}`}
                          </div>
                        )}
                        {item.description ? (
                          <div style={{ fontSize: 12, color: item.isReuse ? "#065f46" : TI.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: item.isReuse ? 600 : 400 }}>{item.description}</div>
                        ) : (
                          <div style={{ fontSize: 12, color: TI.muted }}>—</div>
                        )}
                        {item.observations && (
                          <div style={{ fontSize: 11, color: TI.secondary, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{item.observations}</div>
                        )}
                        {item.referenceUrl && (
                          <a href={item.referenceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Ver referência do solicitante" style={{ display: "inline-flex", alignItems: "center", gap: 3, marginTop: 3, fontSize: 10, fontWeight: 700, color: "#f97316", textDecoration: "none", backgroundColor: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 3, padding: "1px 5px" }} data-testid={`link-reference-grafica-${item.id}`}>
                            <img src={item.referenceUrl} style={{ width: 12, height: 12, objectFit: "cover", borderRadius: 2 }} alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            REF
                          </a>
                        )}
                        {/* Arquivo final foi substituído pela Arte após envio inicial */}
                        {item.previousFinalFileUrl && (
                          <div
                            title={`Anterior: ${item.previousFinalFileUrl}`}
                            data-testid={`badge-arquivo-atualizado-${item.id}`}
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4, fontSize: 10, fontWeight: 800, color: "#92400e", backgroundColor: "#fef3c7", border: "1px solid #fbbf24", borderRadius: 3, padding: "2px 7px", textTransform: "uppercase", letterSpacing: "0.06em" }}
                          >
                            ⚠ Arquivo atualizado
                          </div>
                        )}
                      </td>
                      {/* Qtd */}
                      <td style={{ padding: "13px 16px", textAlign: "center", fontSize: 13, fontWeight: 700, color: TI.text }}>{item.quantity}</td>
                      {/* Reaproveitado */}
                      <td style={{ padding: "13px 16px", textAlign: "center", fontSize: 13, fontWeight: 700, color: reusedTotalOf(item) > 0 ? "#059669" : TI.muted }}>
                        {reusedTotalOf(item) > 0 ? (
                          <span title={item.isReuse ? "Peça inteira reaproveitada" : `${reusedTotalOf(item)} de ${qtyOf(item)} un. reaproveitadas`}>
                            {reusedTotalOf(item)}
                            {reusedTotalOf(item) < qtyOf(item) && (
                              <span style={{ color: TI.muted, fontWeight: 400 }}>/{qtyOf(item)}</span>
                            )}
                          </span>
                        ) : "—"}
                      </td>
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
                      {/* m² a produzir — o reaproveitado não vai para a impressora */}
                      <td style={{ padding: "13px 16px", textAlign: "center", fontSize: 13, fontWeight: 700, color: TI.text, fontFamily: "monospace" }}>
                        {(() => {
                          const total = Number(item.calculatedM2) || 0;
                          if (!total) return "—";
                          const toPrint = m2ToProduce(item);
                          if (reusedTotalOf(item) === 0) return total.toFixed(2);
                          return (
                            <span title={`Total da peça: ${total.toFixed(2)} m² · reaproveitado não é impresso`}>
                              <span style={{ color: toPrint === 0 ? "#059669" : TI.text }}>{toPrint.toFixed(2)}</span>
                              <span style={{ display: "block", fontSize: 10, fontWeight: 400, color: TI.muted, textDecoration: "line-through" }}>
                                {total.toFixed(2)}
                              </span>
                            </span>
                          );
                        })()}
                      </td>
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

                          {/* Iniciar / Continuar Produção — oculto para reaproveitamento.
                              Depois de conferida, a peça só tem a entrega pela frente. */}
                          {!isDelivered(item) && !isProduced(item) && !isConferred(item) && !item.isReuse && (
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

                          {/* Reaproveitar — total ou parcial, enquanto ainda há
                              unidades sem produzir nem reaproveitar */}
                          {!isDelivered(item) && !isProduced(item) && !isConferred(item) && remainingReuse(item) > 0 && (
                            reuseConfirmItemId === item.id ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={e => e.stopPropagation()}>
                                <input
                                  type="number"
                                  min={1}
                                  max={remainingReuse(item)}
                                  value={reuseQty}
                                  onChange={e => setReuseQty(Math.max(1, Math.min(remainingReuse(item), parseInt(e.target.value) || 1)))}
                                  title={`Quantas unidades reaproveitar (até ${remainingReuse(item)})`}
                                  data-testid={`input-reuse-qty-${item.id}`}
                                  style={{ width: 52, height: 26, padding: "0 6px", borderRadius: 5, border: `1px solid ${TI.border}`, fontSize: 11, fontWeight: 700, color: TI.text, textAlign: "center", outline: "none" }}
                                />
                                <span style={{ fontSize: 10, color: TI.muted, whiteSpace: "nowrap" }}>de {remainingReuse(item)}</span>
                                <button
                                  onClick={() => markReuseMutation.mutate({ itemId: item.id, qty: reuseQty })}
                                  disabled={markReuseMutation.isPending}
                                  title="Confirmar reaproveitamento"
                                  data-testid={`button-reuse-confirm-${item.id}`}
                                  style={{ backgroundColor: "#059669", color: "#fff", border: "none", borderRadius: 5, height: 26, padding: "0 8px", fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                                >
                                  OK
                                </button>
                                <button
                                  onClick={() => setReuseConfirmItemId(null)}
                                  title="Cancelar"
                                  style={{ background: "none", border: `1px solid ${TI.border}`, borderRadius: 5, height: 26, padding: "0 6px", fontSize: 10, fontWeight: 700, color: TI.muted, cursor: "pointer" }}
                                >
                                  <X style={{ width: 10, height: 10 }} />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={e => { e.stopPropagation(); setReuseConfirmItemId(item.id); setReuseQty(remainingReuse(item)); }}
                                title={`Reaproveitar (pula produção) — até ${remainingReuse(item)} un.`}
                                data-testid={`button-reuse-${item.id}`}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#059669", padding: 4, borderRadius: 4, display: "flex", alignItems: "center", transition: "color 0.15s" }}
                                onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = "#065f46")}
                                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = "#059669")}
                              >
                                <RotateCcw style={{ width: 15, height: 15 }} />
                              </button>
                            )
                          )}

                          {/* Conferir — etapa entre Produzido e Entregue (com foto) */}
                          {canConfer(item) && (
                            <button
                              onClick={() => openConferenceModal(item)}
                              title={`Conferir (faltam ${remainingConfer(item)} de ${qtyOf(item)})`}
                              data-testid={`button-confer-${item.id}`}
                              style={{
                                backgroundColor: "#0891b2", color: "#ffffff",
                                border: "none", borderRadius: 6, height: 30, padding: "0 12px",
                                fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
                                cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                                transition: "background-color 0.15s",
                              }}
                              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#0e7490"}
                              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#0891b2"}
                            >
                              <CheckCircle style={{ width: 11, height: 11 }} />
                              {conferredOf(item) > 0 ? `Conferir ${remainingConfer(item)}` : "Conferir"}
                            </button>
                          )}

                          {/* Entregar — reaproveitamento: direto; normal: o que já foi conferido */}
                          {canDeliver(item) && (
                            <button
                              onClick={() => openDeliveryModal(item)}
                              title={`Entregar (${remainingDeliver(item)} conferido(s) pendente(s))`}
                              data-testid={`button-deliver-${item.id}`}
                              style={{
                                backgroundColor: TI.accent, color: "#ffffff",
                                border: "none", borderRadius: 6, height: 30, padding: "0 12px",
                                fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
                                cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                                transition: "background-color 0.15s",
                              }}
                              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = TI.accentDark}
                              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = TI.accent}
                            >
                              <Truck style={{ width: 11, height: 11 }} />
                              {deliveredOf(item) > 0 ? `Entregar ${remainingDeliver(item)}` : "Entregar"}
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
                        <td colSpan={10} style={{ padding: "8px 16px" }}>
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
          </div>
        )}

        {/* Rodapé da tabela */}
        {filteredItems.length > 0 && (
          <div style={{ borderTop: `1px solid ${TI.border}`, padding: "10px 16px", backgroundColor: "#fafaf9", fontSize: 12, color: TI.secondary }}>
            Exibindo <strong style={{ color: TI.text }}>{filteredItems.length}</strong> peça{filteredItems.length !== 1 ? "s" : ""} ·{" "}
            <strong style={{ color: TI.text }}>{Array.from(new Set(filteredItems.map((i: any) => i.eventId).filter(Boolean))).length}</strong> evento{Array.from(new Set(filteredItems.map((i: any) => i.eventId).filter(Boolean))).length !== 1 ? "s" : ""}
            {(() => {
              // O total que importa para a Gráfica é o que vai ser impresso.
              const totalM2 = filteredItems.reduce((s: number, i: any) => s + (Number(i.calculatedM2) || 0), 0);
              const printM2 = filteredItems.reduce((s: number, i: any) => s + m2ToProduce(i), 0);
              const reusedUn = filteredItems.reduce((s: number, i: any) => s + reusedTotalOf(i), 0);
              if (!totalM2) return null;
              return (
                <>
                  {" · "}<strong style={{ color: TI.text }}>{printM2.toFixed(2)} m²</strong> a produzir
                  {reusedUn > 0 && (
                    <span style={{ color: "#059669" }}>
                      {" "}(economia de {(totalM2 - printM2).toFixed(2)} m² · {reusedUn} un. reaproveitada{reusedUn !== 1 ? "s" : ""})
                    </span>
                  )}
                </>
              );
            })()}
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
        <DialogContent style={{ padding: 0, gap: 0, maxWidth: 448, borderRadius: 12, overflow: "hidden" }}>

          {/* ── Header dark ── */}
          <div style={{ backgroundColor: TI.text, padding: "24px" }}>
            <h2 style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 700, color: "#ffffff", textTransform: "uppercase", letterSpacing: "-0.02em", lineHeight: 1 }}>
              {modalType === "production"
                ? (selectedItem?.quantityProduced > 0 ? "Continuar Produção" : "Iniciar Produção")
                : modalType === "conference" ? "Conferir Peça"
                : "Confirmar Entrega"}
            </h2>
            <p style={{ margin: "6px 0 0", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>
              {modalType === "production" ? "Registre a quantidade produzida"
                : modalType === "conference" ? "Anexe a foto da conferência"
                : "Registre a entrega do material"}
            </p>
          </div>

          {/* ── Corpo ── */}
          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Card de identificação */}
            {selectedItem && (
              <div style={{ backgroundColor: "#f4f3f0", borderRadius: 8, padding: 16, display: "flex", alignItems: "flex-start", gap: 14 }}>
                {/* Ícone */}
                <div style={{ backgroundColor: "#ffffff", borderRadius: 6, padding: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", flexShrink: 0 }}>
                  {modalType === "production"
                    ? <Printer style={{ width: 20, height: 20, color: TI.accent }} />
                    : <Truck style={{ width: 20, height: 20, color: TI.accent }} />}
                </div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 13, color: TI.accent }}>{selectedItem.displayId}</span>
                    <StatusPill status={selectedItem.status} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: TI.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selectedItem.type}</div>
                  <div style={{ fontSize: 12, color: "#78716c", marginTop: 2 }}>
                    {selectedItem.material}{selectedItem.visualWidth ? ` | ${selectedItem.visualWidth} × ${selectedItem.visualHeight}m` : ""}
                  </div>
                </div>
              </div>
            )}

            {/* ── FORM: PRODUÇÃO ── */}
            {selectedItem && modalType === "production" && (
              <form onSubmit={handleSubmitProduction} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#78716c", marginBottom: 10 }}>
                    Quantidade a Produzir
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="number"
                      min={1}
                      max={selectedItem.quantity}
                      value={productionData.quantityProduced}
                      onChange={e => setProductionData({ quantityProduced: parseInt(e.target.value) || 0 })}
                      required
                      data-testid="input-quantity-produced"
                      style={{ flex: 1, textAlign: "center", fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 700, color: TI.text, backgroundColor: "#f4f3f0", border: "none", borderRadius: 8, padding: "16px 12px", outline: "none" }}
                    />
                    <button
                      type="button"
                      onClick={() => setProductionData({ quantityProduced: selectedItem.quantity })}
                      data-testid="button-set-total"
                      style={{ backgroundColor: "#e7e5e4", border: "none", borderRadius: 8, padding: "0 20px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "#78716c", cursor: "pointer", whiteSpace: "nowrap", transition: "background-color 0.15s" }}
                      onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#d6d3d1")}
                      onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#e7e5e4")}
                    >
                      Tudo
                    </button>
                  </div>
                </div>

                {/* Footer */}
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => { setSelectedItem(null); setModalType(null); }}
                    style={{ flex: 1, padding: "12px 0", backgroundColor: "transparent", border: "none", color: "#78716c", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer", borderRadius: 8, transition: "background-color 0.15s" }}
                    onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#f4f3f0")}
                    onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent")}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={startProductionMutation.isPending || productionData.quantityProduced === 0}
                    data-testid="button-confirm-production"
                    style={{ flex: 2, padding: "12px 0", backgroundColor: TI.text, border: "none", color: "#ffffff", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "-0.01em", cursor: startProductionMutation.isPending || productionData.quantityProduced === 0 ? "not-allowed" : "pointer", borderRadius: 8, opacity: startProductionMutation.isPending || productionData.quantityProduced === 0 ? 0.6 : 1, transition: "background-color 0.15s" }}
                    onMouseEnter={e => { if (!startProductionMutation.isPending && productionData.quantityProduced > 0) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#000000"; }}
                    onMouseLeave={e => { if (!startProductionMutation.isPending) (e.currentTarget as HTMLButtonElement).style.backgroundColor = TI.text; }}
                  >
                    {startProductionMutation.isPending ? "Salvando..." : "Confirmar Produção"}
                  </button>
                </div>
              </form>
            )}

            {/* ── FORM: ENTREGA ── */}
            {selectedItem && modalType === "delivery" && (
              <form onSubmit={handleSubmitDelivery} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                {/* Responsável */}
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#78716c", marginBottom: 10 }}>
                    Responsável pelo Recebimento *
                  </label>
                  {/* Campo livre: quem recebe muda a cada entrega, e a lista de
                      nomes anteriores mais atrapalhava do que ajudava. */}
                  <input
                    type="text"
                    value={deliveryData.receivedBy}
                    onChange={e => setDeliveryData({ ...deliveryData, receivedBy: e.target.value })}
                    placeholder="Nome de quem recebeu"
                    autoFocus
                    data-testid="input-received-by"
                    style={{ width: "100%", padding: "12px 14px", backgroundColor: "#e8e8e7", border: "1px solid transparent", borderRadius: 8, fontSize: 13, fontWeight: 500, color: TI.text, outline: "none" }}
                  />
                </div>

                {/* Quantidade a entregar (entrega parcial) */}
                {qtyOf(selectedItem) > 1 && (
                  <div>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#78716c", marginBottom: 8 }}>
                      Quantidade a entregar agora <span style={{ color: "#a8a29e", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>· já entregue {deliveredOf(selectedItem)}/{qtyOf(selectedItem)}, disponível {remainingDeliver(selectedItem)}</span>
                    </label>
                    <input type="number" min={1} max={remainingDeliver(selectedItem)} value={deliverQty}
                      onChange={e => setDeliverQty(Math.max(1, Math.min(remainingDeliver(selectedItem), parseInt(e.target.value) || 1)))}
                      style={{ width: "100%", padding: "10px 14px", backgroundColor: "#e8e8e7", border: "1px solid transparent", borderRadius: 8, fontSize: 15, fontWeight: 700, color: TI.text, outline: "none" }} />
                  </div>
                )}

                {/* Comprovante fotográfico */}
                {renderPhotoPicker("(opcional) · pode anexar várias")}

                {renderNotesField("Ex.: entregue na portaria, faltou 1 caixa…")}

                {/* Footer */}
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => { setSelectedItem(null); setModalType(null); }}
                    style={{ flex: 1, padding: "12px 0", backgroundColor: "transparent", border: "none", color: "#78716c", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer", borderRadius: 8, transition: "background-color 0.15s" }}
                    onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#f4f3f0")}
                    onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent")}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={markDeliveredMutation.isPending}
                    data-testid="button-confirm-delivery"
                    style={{ flex: 2, padding: "12px 0", backgroundColor: "#15803d", border: "none", color: "#ffffff", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "-0.01em", cursor: markDeliveredMutation.isPending ? "not-allowed" : "pointer", borderRadius: 8, opacity: markDeliveredMutation.isPending ? 0.7 : 1, transition: "background-color 0.15s" }}
                    onMouseEnter={e => { if (!markDeliveredMutation.isPending) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#166534"; }}
                    onMouseLeave={e => { if (!markDeliveredMutation.isPending) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#15803d"; }}
                  >
                    {markDeliveredMutation.isPending ? "Salvando..." : "Confirmar Entrega"}
                  </button>
                </div>
              </form>
            )}

            {selectedItem && modalType === "conference" && (
              <form onSubmit={handleSubmitConference} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <p style={{ fontSize: 12, color: "#57534e", margin: 0 }}>
                  Confira a peça produzida e anexe a foto. Pode conferir parcialmente — depois é só conferir o restante.
                </p>
                {qtyOf(selectedItem) > 1 && (
                  <div>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#78716c", marginBottom: 8 }}>
                      Quantidade a conferir agora <span style={{ color: "#a8a29e", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>· já conferido {conferredOf(selectedItem)}/{qtyOf(selectedItem)}, faltam {remainingConfer(selectedItem)}</span>
                    </label>
                    <input type="number" min={1} max={remainingConfer(selectedItem)} value={conferQty}
                      onChange={e => setConferQty(Math.max(1, Math.min(remainingConfer(selectedItem), parseInt(e.target.value) || 1)))}
                      style={{ width: "100%", padding: "10px 14px", backgroundColor: "#e8e8e7", border: "1px solid transparent", borderRadius: 8, fontSize: 15, fontWeight: 700, color: TI.text, outline: "none" }} />
                  </div>
                )}
                {renderPhotoPicker("· obrigatória, pode anexar várias")}

                {renderNotesField("Ex.: cor puxando para o escuro, ilhós faltando…")}
                <div style={{ display: "flex", gap: 10 }}>
                  <button type="button" onClick={() => { setSelectedItem(null); setModalType(null); }}
                    style={{ flex: 1, padding: "12px 0", backgroundColor: "transparent", border: "none", color: "#78716c", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer", borderRadius: 8 }}>
                    Cancelar
                  </button>
                  <button type="submit" disabled={conferMutation.isPending || !photos.length}
                    data-testid="button-confirm-conference"
                    style={{ flex: 2, padding: "12px 0", backgroundColor: (!photos.length) ? "#a5f3fc" : "#0891b2", border: "none", color: "#ffffff", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 13, textTransform: "uppercase", cursor: (conferMutation.isPending || !photos.length) ? "not-allowed" : "pointer", borderRadius: 8, opacity: conferMutation.isPending ? 0.7 : 1 }}>
                    {conferMutation.isPending ? "Salvando..." : "Confirmar Conferência"}
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
