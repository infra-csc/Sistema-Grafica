import { useQuery, useMutation } from "@tanstack/react-query";
import { FilterSelect } from "@/components/filter-select";
import { AlertCircle, Package, CheckCircle, Truck, Calendar, Eye, Check, Camera, Search, Play, X, Filter, ChevronDown, Printer, RotateCcw, ImagePlus, FileSpreadsheet, ListChecks } from "lucide-react";
import { Fragment, useState, useMemo, useEffect, useRef } from "react";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { parseDateLocal } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest, queryClient, getCurrentUserName } from "@/lib/queryClient";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { useToast } from "@/hooks/use-toast";
import { ObjectUploader } from "@/components/ObjectUploader";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { getStatusMeta, getStatusLabel } from "@/lib/status";
import { StatusPill } from "@/components/status-pill";
import { useAuth } from "@/contexts/auth-context";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";

const TI = {
  bg: "#fafaf9",
  surface: "#ffffff",
  text: "#1c1917",
  accent: "#f97316",
  border: "#e7e5e4",
  muted: "#a8a29e",
  secondary: "#78716c",
  stone800: "#292524",
  stone200: "#e7e5e4",
  stone100: "#f5f5f4",
};

// ── Helpers puros de estado/quantidade — não dependem de estado do componente ──
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

// Chip de prazo da Produção Gráfica — o mesmo visual sobre o cabeçalho escuro
// do evento, tanto na tabela desktop quanto no card mobile.
function DeadlineChip({ event }: { event: any }) {
  if (!event?.truckDepartureDate) return null;
  const days = event.deadlineProducaoGrafica ?? -1;
  const d = new Date(new Date(event.truckDepartureDate).getTime() + days * 86400000);
  d.setHours(0, 0, 0, 0);
  const tod = new Date(); tod.setHours(0, 0, 0, 0);
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
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, backgroundColor: s.bg, border: `1px solid ${s.border}`, borderRadius: 999, padding: "3px 9px", fontSize: 10, fontWeight: 700, color: s.text, letterSpacing: "0.04em", whiteSpace: "nowrap", alignSelf: "flex-start" }}>
      Produção Gráfica · {ds}{diff >= 0 && diff <= 14 && <span style={{ opacity: 0.65, fontWeight: 500 }}> ({diff}d)</span>}
    </span>
  );
}

// Seletor de fotos (câmera + galeria) com miniaturas e remoção — unifica as
// três cópias que existiam (modais individuais, entrega e conferência em lote).
function PhotoPicker({ photos, onAdd, onRemove, onError, label = "Fotos", hint, dense = false }: {
  photos: string[];
  onAdd: (url: string) => void;
  onRemove: (url: string) => void;
  onError: (error: Error) => void;
  label?: string;
  hint?: string;
  dense?: boolean;
}) {
  const buttons = [
    { capture: true, Icon: Camera, text: dense ? "Câmera" : "Tirar Foto" },
    { capture: false, Icon: ImagePlus, text: dense ? "Galeria" : "Anexar Fotos" },
  ];
  return (
    <div>
      <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#746e69", marginBottom: 10 }}>
        {label} {hint && <span style={{ color: "#746e69", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>{hint}</span>}
      </label>

      <div style={{ display: "flex", gap: 10 }}>
        {buttons.map(({ capture, Icon, text }) => (
          <div key={text} style={{ flex: 1 }}>
            <ObjectUploader
              {...(capture ? { capture: true } : { multiple: true })}
              maxFileSize={10485760}
              buttonVariant="ghost"
              buttonClassName="w-full h-full p-0 border-0 hover:bg-transparent"
              onComplete={r => onAdd(r.url)}
              onError={onError}
            >
              <div style={{ width: "100%", padding: dense ? "12px 0" : "14px 0", backgroundColor: "#f4f3f0", borderRadius: 8, border: "2px dashed #d6d3d1", display: "flex", flexDirection: "column", alignItems: "center", gap: dense ? 5 : 6, cursor: "pointer" }}>
                <Icon style={{ width: dense ? 18 : 20, height: dense ? 18 : 20, color: "#746e69" }} />
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#746e69" }}>{text}</span>
              </div>
            </ObjectUploader>
          </div>
        ))}
      </div>

      {photos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${dense ? 72 : 84}px, 1fr))`, gap: 8, marginTop: dense ? 10 : 12 }}>
          {photos.map(url => (
            <div key={url} style={{ position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden", border: `1px solid ${TI.border}`, backgroundColor: "#f4f3f0" }}>
              <img src={url} alt="Foto anexada" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              {/* Alvo de toque 44×44 (área invisível maior que o X visível) e
                  confirmação antes de remover — o botão de 20px colado na
                  miniatura removia a foto num toque acidental, sem volta. */}
              <button
                type="button"
                onClick={() => { if (window.confirm("Remover esta foto?")) onRemove(url); }}
                title="Remover foto"
                aria-label="Remover foto"
                style={{ position: "absolute", top: 0, right: 0, width: 44, height: 44, background: "transparent", border: "none", display: "flex", alignItems: "flex-start", justifyContent: "flex-end", padding: 4, cursor: "pointer" }}
              >
                <span style={{ width: 20, height: 20, borderRadius: "50%", backgroundColor: "rgba(28,25,23,0.75)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <X style={{ width: 11, height: 11 }} />
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Dialog dos modos em lote — um único componente para conferência e entrega,
// que eram duas cópias de ~150 linhas divergindo aos poucos.
function BulkActionDialog({
  mode, open, onClose, items, photos, onAddPhoto, onRemovePhoto, onPhotoError,
  notes, onNotesChange, receivedBy = "", onReceivedByChange, isSubmitting, onConfirm, qtyFor,
}: {
  mode: "confer" | "deliver";
  open: boolean;
  onClose: () => void;
  items: any[];
  photos: string[];
  onAddPhoto: (url: string) => void;
  onRemovePhoto: (url: string) => void;
  onPhotoError: (error: Error) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  receivedBy?: string;
  onReceivedByChange?: (v: string) => void;
  isSubmitting: boolean;
  onConfirm: () => void;
  qtyFor: (item: any) => number;
}) {
  const isConfer = mode === "confer";
  const tint = isConfer ? "#0e7490" : TI.accent;
  const canSubmit = isConfer ? photos.length > 0 : receivedBy.trim().length > 0;
  const confirmBg = isConfer ? "#0e7490" : "#15803d";
  const confirmHover = isConfer ? "#155e75" : "#166534";
  const HeaderIcon = isConfer ? CheckCircle : Truck;
  const count = items.length;
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(460)}>
        <DialogTitle className="sr-only">{isConfer ? "Confirmar Conferência em Lote" : "Confirmar Entrega em Lote"}</DialogTitle>
        <DialogDescription className="sr-only">{isConfer ? "Registre a conferência de múltiplas peças de uma vez" : "Registre a entrega de múltiplas peças de uma vez"}</DialogDescription>

        <ModalHeader
          icon={HeaderIcon}
          tint={tint}
          title={isConfer ? "Conferência em lote" : "Entrega em lote"}
          subtitle={`${count} peça${count !== 1 ? "s" : ""} selecionada${count !== 1 ? "s" : ""}`}
          onClose={onClose}
        />

        {/* Body */}
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18, background: "#fafaf9" }}>
          {!isConfer && (
            <div>
              <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#746e69", marginBottom: 10 }}>
                Responsável pelo Recebimento *
              </label>
              <input
                type="text"
                value={receivedBy}
                onChange={e => onReceivedByChange?.(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onConfirm(); } }}
                placeholder="Nome de quem recebeu"
                autoFocus
                style={{ width: "100%", boxSizing: "border-box", padding: "14px 16px", background: "#fff", border: "1.5px solid #e7e5e4", borderRadius: 12, fontSize: 15, fontWeight: 600, color: TI.text, transition: "border-color 0.15s, box-shadow 0.15s" }}
                onFocus={e => { e.currentTarget.style.borderColor = tint; e.currentTarget.style.boxShadow = `0 0 0 3px ${tint}22`; }}
                onBlur={e => { e.currentTarget.style.borderColor = "#e7e5e4"; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>
          )}

          <PhotoPicker
            dense
            photos={photos}
            onAdd={onAddPhoto}
            onRemove={onRemovePhoto}
            onError={onPhotoError}
            label={isConfer ? "Foto da conferência *" : "Comprovante fotográfico"}
            hint={isConfer ? "· mesma para todas as peças" : "· opcional · mesmo para todas as peças"}
          />

          {/* Observações */}
          <div>
            <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#746e69", marginBottom: 8 }}>
              Observações <span style={{ textTransform: "none", fontWeight: 400, color: "#746e69", letterSpacing: 0 }}>(opcional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => onNotesChange(e.target.value)}
              placeholder={isConfer ? "Ex.: conferido contra o romaneio, sem avarias..." : "Ex.: entregue na portaria, aguardando retirada..."}
              rows={2}
              style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", background: "#fff", border: "1.5px solid #e7e5e4", borderRadius: 12, fontSize: 13, fontFamily: "inherit", color: TI.text, resize: "none", lineHeight: 1.5 }}
            />
          </div>

          {/* Peças selecionadas */}
          <div style={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: 12, maxHeight: 150, overflowY: "auto" }}>
            {items.map((item: any, idx: number) => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: idx < count - 1 ? "1px solid #f5f5f4" : "none" }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700, color: tint, flexShrink: 0 }}>{item.displayId}</span>
                <span style={{ fontSize: 13, color: TI.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{item.type}</span>
                <span style={{ fontSize: 11, color: TI.secondary, flexShrink: 0 }}>{qtyFor(item)} un.</span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ flex: 1, height: 48, borderRadius: 12, background: "transparent", border: "1.5px solid #e7e5e4", color: "#746e69", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "background 0.12s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#f5f5f4"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isSubmitting || !canSubmit}
              style={{
                flex: 2, height: 48, borderRadius: 12, border: "none",
                background: (!canSubmit || isSubmitting) ? "#e7e5e4" : confirmBg,
                color: (!canSubmit || isSubmitting) ? "#78716c" : "#fff",
                fontSize: 13, fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif",
                cursor: (!canSubmit || isSubmitting) ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: canSubmit && !isSubmitting ? `0 4px 14px ${confirmBg}4d` : "none",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { if (canSubmit && !isSubmitting) e.currentTarget.style.background = confirmHover; }}
              onMouseLeave={e => { if (canSubmit && !isSubmitting) e.currentTarget.style.background = confirmBg; }}
            >
              {isSubmitting
                ? "Salvando..."
                : <><HeaderIcon style={{ width: 15, height: 15 }} />{isConfer ? "Confirmar Conferência" : "Confirmar Entrega"} ({count})</>
              }
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Grafica() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  // Espelha os gates do servidor (server/routes/items.ts): start-production e
  // confer aceitam apenas grafica/admin; deliver aceita também solicitacao.
  // Sem isto a Solicitação via botões de Produzir/Conferir que o servidor
  // recusava com 403 depois do clique.
  const canProduce = ["grafica", "admin"].includes(user?.role ?? "");
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
  const [correctReuseItemId, setCorrectReuseItemId] = useState<string | null>(null);
  const [correctReuseQty, setCorrectReuseQty] = useState(0); // quantidade corrigida
  // Entrega em lote
  const [bulkDeliveryMode, setBulkDeliveryMode] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeliveryOpen, setBulkDeliveryOpen] = useState(false);
  const [bulkReceivedBy, setBulkReceivedBy] = useState("");
  const [bulkDeliveryNotes, setBulkDeliveryNotes] = useState("");
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [bulkDeliveryPhotos, setBulkDeliveryPhotos] = useState<string[]>([]);
  const addBulkPhoto = (url: string) => setBulkDeliveryPhotos(prev => [...prev, convertGCSUrlToLocalPath(url)]);
  // ── Conferência em lote (espelha a entrega em lote) ──
  const [bulkConferMode, setBulkConferMode] = useState(false);
  const [bulkConferOpen, setBulkConferOpen] = useState(false);
  const [bulkConferNotes, setBulkConferNotes] = useState("");
  const [bulkConferPhotos, setBulkConferPhotos] = useState<string[]>([]);
  const addBulkConferPhoto = (url: string) => setBulkConferPhotos(prev => [...prev, convertGCSUrlToLocalPath(url)]);
  const isMobile = useIsMobile();
  const { data: items = [], isLoading, isError, refetch } = useQuery<any[]>({ queryKey: ["/api/items/approved"] });
  // Só busca os logs com o dialog de detalhes aberto — é o único consumidor, e
  // a lista completa de auditoria é pesada demais para carregar junto da tela.
  const { data: auditLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/audit-logs"],
    enabled: !!viewDetailsItem,
  });
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

  // Corrige reaproveitamento total marcado por engano (só disponível antes de conferir)
  const correctReuseMutation = useMutation({
    mutationFn: async ({ itemId, correctedReuseQty }: { itemId: string; correctedReuseQty: number }) =>
      await apiRequest("POST", `/api/items/${itemId}/correct-reuse`, { correctedReuseQty }),
    onSuccess: (updated: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setCorrectReuseItemId(null);
      const qty = Number(updated?.quantity) || 0;
      const reused = Number(updated?.reuseQty) || 0;
      toast({
        title: reused === 0 ? "Reaproveitamento removido" : "Reaproveitamento corrigido",
        description: reused === 0
          ? `A peça voltou para a fila de produção com as ${qty} un.`
          : `${reused} un. reaproveitadas. As outras ${qty - reused} voltaram para produção.`,
      });
    },
    onError: (error: Error) => {
      setCorrectReuseItemId(null);
      toast({ title: "Erro ao corrigir reaproveitamento", description: error.message, variant: "destructive" });
    },
  });

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

  // Filtro compartilhado entre a lista e os KPIs — a única diferença é que os
  // KPIs ignoram o filtro de status (cada card mostra a contagem do seu status
  // dentro do recorte atual). Antes eram duas cópias quase idênticas.
  const matchesFilters = (item: any, opts?: { skipStatus?: boolean }) => {
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      if (!item.type?.toLowerCase().includes(q) &&
          !item.description?.toLowerCase().includes(q) &&
          !item.displayId?.toLowerCase().includes(q) &&
          !item.event?.name?.toLowerCase().includes(q)) return false;
    }
    if (!opts?.skipStatus && statusFilter.length > 0) {
      const ok = statusFilter.some(sf => sf === "ready_for_production"
        ? (item.status === "ready_for_production" || item.status === "pronto_para_producao" || item.status === "approved")
        : item.status === sf);
      if (!ok) return false;
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
  };

  // Memoizado com as deps reais dos filtros — sem isto era um array novo por
  // render, e os useMemo derivados (deliverable/conferable) nunca acertavam.
  const filteredItems = useMemo(() =>
    (items as any[])
      .filter((item: any) => matchesFilters(item))
      .sort((a: any, b: any) => {
        // Urgência primeiro: evento com saída do caminhão mais próxima no topo;
        // sem data vai para o fim. Nome desempata (e mantém os grupos estáveis).
        const da = a.event?.truckDepartureDate ? new Date(a.event.truckDepartureDate).getTime() : Infinity;
        const db = b.event?.truckDepartureDate ? new Date(b.event.truckDepartureDate).getTime() : Infinity;
        if (da !== db) return da - db;
        const ea = a.event?.name || ""; const eb = b.event?.name || "";
        if (ea !== eb) return ea.localeCompare(eb);
        return a.type.localeCompare(b.type);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, searchFilter, statusFilter, eventFilter, typeFilter, materialFilter, finishFilter, next10DaysFilter, monthFilter]);

  // statsPool: todos os filtros ativos (exceto status) — os cards mostram contagens dentro do contexto atual
  const statsPool = useMemo(() =>
    (items as any[]).filter((item: any) => matchesFilters(item, { skipStatus: true })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, searchFilter, eventFilter, typeFilter, materialFilter, finishFilter, next10DaysFilter, monthFilter]);
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
    // Mutation PRIMEIRO; fotos só depois do sucesso — mesma disciplina do lote.
    // Antes as fotos eram anexadas antes da entrega, e uma entrega recusada
    // pelo servidor deixava fotos órfãs na galeria da peça.
    const itemId = selectedItem.id;
    const photosToAttach = photos;
    try {
      await markDeliveredMutation.mutateAsync({ itemId, data: { ...deliveryData, qty: deliverQty, notes: modalNotes } });
    } catch {
      return; // o onError da mutation já mostrou o toast
    }
    if (photosToAttach.length) {
      const results = await Promise.allSettled(photosToAttach.map(photoUrl =>
        apiRequest("POST", `/api/items/${itemId}/photos`, {
          photoUrl, kind: "delivery",
          uploadedBy: getCurrentUserName(),
        })
      ));
      if (results.some(r => r.status === "rejected")) {
        toast({ title: "Entrega registrada", description: "Parte das fotos não pôde ser anexada.", variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    }
  };

  const handleSubmitConference = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    if (!photos.length) {
      toast({ title: "Foto obrigatória", description: "Envie ao menos uma foto da conferência.", variant: "destructive" });
      return;
    }
    // Mutation PRIMEIRO (a primeira foto vai nela como conferencePhotoUrl, o
    // campo que o restante do app lê); a galeria só recebe as fotos depois do
    // sucesso — mesma disciplina do lote. Antes uma conferência recusada
    // deixava fotos órfãs na galeria.
    const itemId = selectedItem.id;
    const photosToAttach = photos;
    try {
      await conferMutation.mutateAsync({ itemId, conferencePhotoUrl: photosToAttach[0], qty: conferQty, notes: modalNotes });
    } catch {
      return; // o onError da mutation já mostrou o toast
    }
    const results = await Promise.allSettled(photosToAttach.map(photoUrl =>
      apiRequest("POST", `/api/items/${itemId}/photos`, {
        photoUrl, kind: "conference",
        uploadedBy: getCurrentUserName(),
      })
    ));
    if (results.some(r => r.status === "rejected")) {
      toast({ title: "Conferência registrada", description: "Parte das fotos não pôde ser anexada.", variant: "destructive" });
    }
    queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
    queryClient.invalidateQueries({ queryKey: ["/api/items"] });
  };

  const onPhotoError = (error: Error) =>
    toast({ title: "Erro no upload", description: error.message, variant: "destructive" });

  // Barra de ações dos modais. No celular o conteúdo (arte grande + specs +
  // fotos + observação) passa da altura da tela, e o botão de confirmar ficava
  // no fim da rolagem: depois de tirar a foto era preciso procurar por ele.
  const modalActionsStyle: React.CSSProperties = {
    display: "flex", gap: 10,
    position: "sticky", bottom: 0,
    backgroundColor: "#ffffff",
    paddingTop: 12, marginTop: -4,
    boxShadow: "0 -8px 12px -8px rgba(28,25,23,0.18)",
  };

  const renderNotesField = (placeholder: string) => (
    <div>
      <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#746e69", marginBottom: 8 }}>
        Observação <span style={{ color: "#746e69", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(opcional)</span>
      </label>
      <textarea
        value={modalNotes}
        onChange={e => setModalNotes(e.target.value)}
        placeholder={placeholder}
        rows={2}
        data-testid="input-notes"
        style={{ width: "100%", padding: "10px 14px", backgroundColor: "#e8e8e7", border: "1px solid transparent", borderRadius: 8, fontSize: 13, color: TI.text, resize: "vertical", fontFamily: "inherit" }}
      />
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
      const statusNames = statusFilter.map(s => getStatusLabel(s));
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

  // Items que podem ser entregues no filtro atual
  const deliverableInFilter = useMemo(
    () => (filteredItems as any[]).filter(i => canDeliver(i)),
    [filteredItems],
  );
  // Conferíveis no filtro atual (para o modo conferência em lote)
  const conferableInFilter = useMemo(
    () => (filteredItems as any[]).filter(i => canConfer(i)),
    [filteredItems],
  );
  // Um modo de lote por vez; a lista elegível depende do modo ativo.
  const bulkOn = bulkDeliveryMode || bulkConferMode;
  const bulkEligibleList = bulkConferMode ? conferableInFilter : deliverableInFilter;
  const allDeliverableSelected =
    bulkEligibleList.length > 0 && bulkEligibleList.every((i: any) => bulkSelectedIds.has(i.id));

  const toggleBulkItem = (id: string) =>
    setBulkSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Peças do lote resolvidas na lista COMPLETA (para os dialogs de lote).
  const bulkSelectedItems = useMemo(
    () => Array.from(bulkSelectedIds).map(id => (items as any[]).find(i => i.id === id)).filter(Boolean) as any[],
    [bulkSelectedIds, items],
  );

  const bulkConfirmRef = useRef<HTMLButtonElement>(null);

  // Ao entrar num modo de lote o foco vai para o Confirmar da barra fixa —
  // sem isso, teclado e leitor de tela ficavam perdidos no meio da tabela.
  useEffect(() => {
    if (bulkOn) bulkConfirmRef.current?.focus();
  }, [bulkOn]);

  // Filtros podem mudar com o lote ativo: poda a seleção para manter apenas
  // ids visíveis e elegíveis — evita confirmar peça que não está mais na tela.
  useEffect(() => {
    if (!bulkOn) return;
    setBulkSelectedIds(prev => {
      const eligible = new Set(bulkEligibleList.map((i: any) => i.id));
      const next = new Set(Array.from(prev).filter(id => eligible.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkOn, bulkEligibleList]);

  // Escape sai do modo lote — mas não quando há dialog aberto: o Escape do
  // dialog fecha o dialog, e o estado ainda aponta "aberto" quando este
  // handler roda, então os dois não conflitam.
  useEffect(() => {
    if (!bulkOn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (bulkDeliveryOpen || bulkConferOpen || viewDetailsItem || selectedItem) return;
      setBulkDeliveryMode(false);
      setBulkConferMode(false);
      setBulkSelectedIds(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bulkOn, bulkDeliveryOpen, bulkConferOpen, viewDetailsItem, selectedItem]);

  // Conferência em lote: mesma disciplina da entrega (allSettled + tolerância a
  // falha parcial). Foto é obrigatória (regra do servidor); a primeira vira o
  // conferencePhotoUrl de cada peça e todas entram na galeria (kind conference).
  const handleBulkConference = async () => {
    if (bulkConferPhotos.length === 0) {
      toast({ title: "Foto obrigatória", description: "Envie ao menos uma foto da conferência.", variant: "destructive" });
      return;
    }
    setIsBulkSubmitting(true);
    // Busca cada peça na lista COMPLETA (items) — buscar em filteredItems fazia
    // a peça "sumir" quando o filtro mudava com o lote aberto, e o fallback
    // qty: 1 registrava conferência de 1 unidade em vez do restante real.
    // Peça não encontrada SAI do lote em vez de ir com quantidade chutada.
    const entries = Array.from(bulkSelectedIds)
      .map(id => (items as any[]).find(i => i.id === id))
      .filter(Boolean) as any[];
    const ids = entries.map(i => i.id);
    try {
      const confer = await Promise.allSettled(entries.map(item =>
        apiRequest("POST", `/api/items/${item.id}/confer`, {
          conferencePhotoUrl: bulkConferPhotos[0],
          qty: remainingConfer(item),
          notes: bulkConferNotes || null,
        })
      ));

      const okIds = ids.filter((_, i) => confer[i].status === "fulfilled");
      const failed = ids.length - okIds.length;

      let photoFailed = 0;
      if (okIds.length > 0) {
        const photos = await Promise.allSettled(
          okIds.flatMap(itemId =>
            bulkConferPhotos.map(photoUrl =>
              apiRequest("POST", `/api/items/${itemId}/photos`, {
                photoUrl, kind: "conference", uploadedBy: getCurrentUserName(),
              })
            )
          )
        );
        photoFailed = photos.filter(p => p.status === "rejected").length;
      }

      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });

      if (failed > 0) {
        toast({
          title: "Conferência parcial",
          description: `${okIds.length} de ${ids.length} conferida(s). ${failed} falhou(aram) e continua(m) na lista.`,
          variant: "destructive",
        });
      } else if (photoFailed > 0) {
        toast({
          title: `${okIds.length} peça(s) conferida(s)`,
          description: "A conferência foi registrada, mas parte das fotos não pôde ser anexada.",
          variant: "destructive",
        });
      } else {
        toast({ title: `${okIds.length} peça(s) conferida(s)`, description: "Prontas para entrega." });
      }

      setBulkConferOpen(false);
      setBulkConferMode(false);
      setBulkSelectedIds(new Set());
      setBulkConferNotes("");
      setBulkConferPhotos([]);
    } catch (e: any) {
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      toast({ title: "Erro na conferência em lote", description: e.message, variant: "destructive" });
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const handleBulkDelivery = async () => {
    if (!bulkReceivedBy.trim()) {
      toast({ title: "Campo obrigatório", description: "Informe quem recebeu o material", variant: "destructive" });
      return;
    }
    setIsBulkSubmitting(true);
    // Mesma regra da conferência em lote: resolve na lista COMPLETA (items) e
    // exclui do lote a peça não encontrada — nunca entrega "1" por fallback.
    const entries = Array.from(bulkSelectedIds)
      .map(id => (items as any[]).find(i => i.id === id))
      .filter(Boolean) as any[];
    const ids = entries.map(i => i.id);
    try {
      // allSettled, não all: com Promise.all a primeira falha rejeitava, mas as
      // demais requisições já tinham sido enviadas e concluíam. A tela mostrava
      // "erro na entrega em lote" enquanto as peças apareciam como entregues.
      const delivery = await Promise.allSettled(entries.map(item =>
        apiRequest("PATCH", `/api/items/${item.id}/deliver`, {
          receivedBy: bulkReceivedBy.trim(),
          qty: remainingDeliver(item),
          notes: bulkDeliveryNotes || null,
        })
      ));

      // Só anexa a foto nas peças cuja entrega passou.
      const deliveredIds = ids.filter((_, i) => delivery[i].status === "fulfilled");
      const failed = ids.length - deliveredIds.length;

      let photoFailed = 0;
      if (bulkDeliveryPhotos.length > 0 && deliveredIds.length > 0) {
        const photos = await Promise.allSettled(
          deliveredIds.flatMap(itemId =>
            bulkDeliveryPhotos.map(photoUrl =>
              // uploadedBy é NOT NULL no banco: sem ele o insert falhava, a foto
              // não era gravada (por isso não aparecia no card nem em Registros)
              // e o erro derrubava o lote inteiro.
              apiRequest("POST", `/api/items/${itemId}/photos`, {
                photoUrl, kind: "delivery", uploadedBy: getCurrentUserName(),
              })
            )
          )
        );
        photoFailed = photos.filter(p => p.status === "rejected").length;
      }

      // Invalida sempre — mesmo com falha parcial a lista precisa refletir o
      // que de fato foi entregue.
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });

      if (failed > 0) {
        toast({
          title: "Entrega parcial",
          description: `${deliveredIds.length} de ${ids.length} entregue(s). ${failed} falhou(aram) e continua(m) na lista.`,
          variant: "destructive",
        });
      } else if (photoFailed > 0) {
        toast({
          title: `${deliveredIds.length} peça(s) entregue(s)`,
          description: "A entrega foi registrada, mas o comprovante não pôde ser anexado.",
          variant: "destructive",
        });
      } else {
        toast({ title: `${deliveredIds.length} peça(s) entregue(s)`, description: `Recebido por: ${bulkReceivedBy}` });
      }

      setBulkDeliveryOpen(false);
      setBulkDeliveryMode(false);
      setBulkSelectedIds(new Set());
      setBulkReceivedBy("");
      setBulkDeliveryNotes("");
      setBulkDeliveryPhotos([]);
    } catch (e: any) {
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      toast({ title: "Erro na entrega em lote", description: e.message, variant: "destructive" });
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 12 : 24, padding: isMobile ? "12px 12px" : 24, paddingBottom: bulkOn ? 80 : isMobile ? 12 : 24, backgroundColor: TI.bg, height: "100%", overflowY: "auto" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "center" : "flex-end", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: isMobile ? 19 : 26, fontWeight: 900, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em", textTransform: "uppercase", color: TI.text }} data-testid="title-grafica">
            Gráfica
          </h1>
          {!isMobile && (
            <p style={{ margin: "4px 0 0", fontSize: 13, color: TI.secondary }}>
              Gestão de ativos gráficos em tempo real
            </p>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {!isMobile && stats.liberados > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, backgroundColor: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa", borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#f97316", display: "inline-block" }} />
              {stats.liberados} peça{stats.liberados !== 1 ? "s" : ""} aguardando produção
            </span>
          )}
          {/* Botão Conferência em Lote — só para quem pode conferir (gate do servidor) */}
          {canProduce && conferableInFilter.length > 0 && !bulkOn && (
            <button
              onClick={() => { setBulkConferMode(true); setBulkSelectedIds(new Set()); }}
              data-testid="button-bulk-confer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                backgroundColor: '#0e7490', color: '#fff',
                border: 'none', borderRadius: 8, padding: isMobile ? '11px 16px' : '8px 14px',
                fontSize: isMobile ? 13 : 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em',
                cursor: 'pointer', boxShadow: '0 2px 8px rgba(14,116,144,0.3)',
              }}
            >
              <CheckCircle style={{ width: isMobile ? 16 : 14, height: isMobile ? 16 : 14 }} />
              {isMobile ? `Conferir em lote (${conferableInFilter.length})` : `Conferência em Lote (${conferableInFilter.length})`}
            </button>
          )}
          {bulkConferMode && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#ecfeff', color: '#0e7490', border: '1.5px solid #a5f3fc', borderRadius: 8, padding: '7px 12px', fontSize: 11, fontWeight: 800 }}>
              <CheckCircle style={{ width: 13, height: 13 }} />
              {isMobile ? 'Lote ativo' : 'Modo conferência em lote ativo'}
            </span>
          )}
          {/* Botão Entrega em Lote */}
          {deliverableInFilter.length > 0 && !bulkOn && (
            <button
              onClick={() => { setBulkDeliveryMode(true); setBulkSelectedIds(new Set()); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                // #c2410c (orange-700): branco sobre #f97316 dava ~2.8:1 (reprova AA)
                backgroundColor: '#c2410c', color: '#fff',
                border: 'none', borderRadius: 8, padding: isMobile ? '11px 16px' : '8px 14px',
                fontSize: isMobile ? 13 : 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em',
                cursor: 'pointer', boxShadow: '0 2px 8px rgba(194,65,12,0.35)',
              }}
            >
              <ListChecks style={{ width: isMobile ? 16 : 14, height: isMobile ? 16 : 14 }} />
              {isMobile ? `Entregar em lote (${deliverableInFilter.length})` : `Entrega em Lote (${deliverableInFilter.length})`}
            </button>
          )}
          {bulkDeliveryMode && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff7ed', color: TI.accent, border: '1.5px solid #fed7aa', borderRadius: 8, padding: '7px 12px', fontSize: 11, fontWeight: 800 }}>
              <ListChecks style={{ width: 13, height: 13 }} />
              {isMobile ? 'Lote ativo' : 'Modo entrega em lote ativo'}
            </span>
          )}
          {/* Exportar Excel — é só um download, funciona igualmente no celular */}
          <button
            onClick={handleExportXlsx}
            disabled={isExporting || filteredItems.length === 0}
            data-testid="button-export-xlsx"
            title={filteredItems.length ? `Exportar ${filteredItems.length} peça(s) em Excel` : "Nada para exportar"}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              backgroundColor: TI.surface, color: TI.text,
              border: `1px solid ${TI.border}`, borderRadius: 6, padding: isMobile ? "10px 14px" : "7px 14px",
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
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(5, 1fr)", gap: isMobile ? 6 : 12 }}>
        {[
          { label: "Liberados",    value: stats.liberados,  sub: "Aguard. produção", testId: "stat-approved",   filterVal: "ready_for_production" },
          { label: "Em Produção",  value: stats.emProducao, sub: "Ativo",            testId: "stat-production", filterVal: "inProduction" },
          { label: "Produzidos",   value: stats.produzidos, sub: "Ag. conferência",  testId: "stat-produced",   filterVal: "produced" },
          { label: "Conferidos",   value: stats.conferidos, sub: "Ag. entrega",      testId: "stat-conferred",  filterVal: "conferred" },
          { label: "Entregues",    value: stats.entregues,  sub: "Concluído",        testId: "stat-delivered",  filterVal: "delivered" },
        ].map(kpi => {
          const isActive = statusFilter.includes(kpi.filterVal);
          // Cores derivadas do MESMO mapa dos pills (lib/status): dot para a
          // borda, text (tom 700, AA) para o número e para o fundo ativo.
          // Antes cada card tinha hex próprio — "Entregues" saía com borda azul
          // e número verde enquanto o pill era emerald; e o fundo ativo laranja
          // (#f97316) reprovava contraste com o texto branco.
          const m = getStatusMeta(kpi.filterVal);
          return (
            /* Os KPIs são o filtro principal desta tela: clicar num deles é
               como se filtra por status. Eram <div> com onClick, então quem
               navega por teclado não conseguia filtrar de jeito nenhum.
               aria-pressed comunica qual está ativo — que hoje só a cor diz. */
            <div
              key={kpi.label}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              aria-label={`Filtrar por ${kpi.label}`}
              onClick={() => setStatusFilter(isActive ? [] : [kpi.filterVal])}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setStatusFilter(isActive ? [] : [kpi.filterVal]);
                }
              }}
              data-testid={kpi.testId}
              style={{
                backgroundColor: isActive ? m.text : TI.surface,
                borderLeft: `4px solid ${m.dot}`,
                borderRadius: 8,
                padding: isMobile ? "10px 10px" : "16px 18px",
                boxShadow: isActive ? `0 4px 16px ${m.dot}33` : "0 1px 4px rgba(0,0,0,0.06)",
                cursor: "pointer",
                transition: "all 0.15s",
                outline: isActive ? `2px solid ${m.dot}` : "2px solid transparent",
                outlineOffset: 2,
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.backgroundColor = `${m.dot}0f`; }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.backgroundColor = TI.surface; }}
            >
              <div style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", color: isActive ? "rgba(255,255,255,0.75)" : TI.secondary, marginBottom: isMobile ? 3 : 6, fontFamily: "'Space Grotesk', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{kpi.label}</div>
              <div style={{ fontSize: isMobile ? 22 : 32, fontWeight: 900, letterSpacing: "-0.03em", fontFamily: "'Space Grotesk', sans-serif", color: isActive ? "#ffffff" : m.text, lineHeight: 1 }}>{kpi.value}</div>
              {!isMobile && <div style={{ fontSize: 11, color: isActive ? "rgba(255,255,255,0.7)" : TI.secondary, marginTop: 4 }}>{isActive ? "Clique para limpar" : kpi.sub}</div>}
            </div>
          );
        })}
        {/* Total — dark card, clica para resetar */}
        <div
          role="button"
          tabIndex={0}
          aria-pressed={statusFilter.length === 0}
          aria-label="Mostrar todos os status"
          onClick={() => setStatusFilter([])}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setStatusFilter([]); }
          }}
          data-testid="stat-total"
          style={{
            backgroundColor: TI.text, borderLeft: `4px solid ${TI.accent}`, borderRadius: 8,
            padding: isMobile ? "10px 10px" : "16px 18px", boxShadow: "0 4px 16px rgba(0,0,0,0.14)",
            cursor: "pointer", transition: "opacity 0.15s",
            outline: statusFilter.length === 0 ? `2px solid ${TI.accent}` : "2px solid transparent",
            outlineOffset: 2,
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.opacity = "0.85")}
          onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.opacity = "1")}
        >
          <div style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.6)", marginBottom: isMobile ? 3 : 6, fontFamily: "'Space Grotesk', sans-serif" }}>Total</div>
          <div style={{ fontSize: isMobile ? 22 : 32, fontWeight: 900, letterSpacing: "-0.03em", fontFamily: "'Space Grotesk', sans-serif", color: "#ffffff", lineHeight: 1 }}>{stats.total}</div>
          {!isMobile && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>{statusFilter.length === 0 ? "Todos selecionados" : "Ver todos"}</div>}
        </div>
      </div>

      {/* ── Filters Bar ── */}
      <div style={{ backgroundColor: "#f3f4f3", borderRadius: 12, padding: "12px 14px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1", minWidth: 200 }}>
          <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: TI.muted }} />
          <input
            type="text"
            placeholder="Buscar por ID, descrição ou evento..."
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
            data-testid="input-search-filter"
            style={{ width: "100%", paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8, backgroundColor: "#e8e8e7", border: "none", borderRadius: 6, fontSize: 13, color: TI.text, boxSizing: "border-box" }}
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

        {/* Toggle Próximos 10 dias — rótulo + trilho num único alvo de toque
            (≥44px): antes só o trilho de 38×20 era clicável. */}
        <div style={{ borderLeft: `1px solid ${TI.border}`, paddingLeft: 12, marginLeft: 4 }}>
          <button
            role="switch"
            aria-checked={next10DaysFilter}
            onClick={() => setNext10DaysFilter(v => !v)}
            data-testid="button-next-10-days-filter"
            style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44, background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: TI.secondary, whiteSpace: "nowrap" }}>Próximos 10 dias</span>
            <span style={{
              width: 38, height: 20, borderRadius: 999, position: "relative", flexShrink: 0, display: "inline-block",
              backgroundColor: next10DaysFilter ? TI.accent : "#d6d3d1", transition: "background-color 0.2s",
            }}>
              <span style={{
                position: "absolute", top: 3, width: 14, height: 14, borderRadius: "50%",
                backgroundColor: "#ffffff", transition: "left 0.2s",
                left: next10DaysFilter ? 20 : 3,
              }} />
            </span>
          </button>
        </div>

        {/* Filtros Avançados */}
        <button
          onClick={() => setShowAdvancedFilters(v => !v)}
          data-testid="button-toggle-advanced-filters"
          style={{ display: "flex", alignItems: "center", gap: 5, backgroundColor: showAdvancedFilters ? TI.text : "transparent", color: showAdvancedFilters ? "#ffffff" : TI.secondary, border: `1px solid ${showAdvancedFilters ? TI.text : TI.border}`, borderRadius: 6, padding: "7px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}
        >
          <Filter style={{ width: 13, height: 13 }} />
          Filtros
          <ChevronDown style={{ width: 12, height: 12, transform: showAdvancedFilters ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
        </button>

        {/* Avançados */}
        {showAdvancedFilters && (
          <div style={{ width: "100%", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 8, borderTop: `1px solid ${TI.border}`, paddingTop: 10, marginTop: 2 }}>
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
                <button onClick={() => { setTypeFilter([]); setMaterialFilter([]); setFinishFilter([]); }} data-testid="button-reset-advanced-filters" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#dc2626", fontWeight: 600 }}>
                  Limpar filtros avançados
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Tabela Principal ── */}
      <div style={{ backgroundColor: TI.surface, border: `1px solid ${TI.border}`, borderRadius: 12 }}>
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
        ) : isMobile ? (
          /* ── View mobile: cards ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 8px' }}>
            {(filteredItems as any[]).map((item: any, index: number) => {
              const prev = index > 0 ? (filteredItems as any[])[index - 1] : null;
              const showEvHeader = !prev || prev.event?.name !== item.event?.name;
              const isSelected = bulkSelectedIds.has(item.id);
              const canDeliverItem = canDeliver(item);
              const canConferItem = canConfer(item);
              const bulkEligible = bulkDeliveryMode ? canDeliverItem : bulkConferMode ? canConferItem : false;

              return (
                <Fragment key={item.id}>
                  {showEvHeader && (
                    <div style={{ padding: '8px 8px 6px', marginTop: index > 0 ? 6 : 0, background: TI.text, borderRadius: '8px 8px 0 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Package style={{ width: 13, height: 13, color: TI.accent }} />
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: "'Space Grotesk', sans-serif" }}>
                          {item.event?.name || 'Sem Evento'}
                        </span>
                        {/* A data aqui era o INÍCIO do evento — para a Gráfica o
                            que manda é a SAÍDA do caminhão, a mesma que ordena
                            a lista e o cabeçalho do desktop. */}
                        {item.event?.truckDepartureDate && (
                          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(255,255,255,0.72)', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                            <Truck style={{ width: 10, height: 10 }} />
                            Saída {new Date(item.event.truckDepartureDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: 'UTC' })}
                          </span>
                        )}
                      </div>
                      {item.event && <DeadlineChip event={item.event} />}
                    </div>
                  )}
                  <div
                    style={{
                      // Altura acompanha a arte: com a peça na mão, é pelo
                      // desenho que se reconhece o item na lista.
                      display: 'flex', alignItems: 'stretch',
                      minHeight: item.approvalThumbUrl && !bulkOn ? 104 : 74,
                      background: isSelected ? '#fff7ed' : '#fff',
                      border: `1.5px solid ${isSelected ? TI.accent : TI.border}`,
                      borderRadius: showEvHeader ? '0 0 12px 12px' : 12,
                      overflow: 'hidden',
                      cursor: bulkOn && bulkEligible ? 'pointer' : undefined,
                      transition: 'border-color 0.12s, background 0.12s',
                    }}
                    /* O "checkbox" da esquerda é um <div> desenhado, não um
                       campo: em modo de entrega em lote não havia como marcar
                       peça alguma sem mouse. role/aria-checked dão ao card o
                       papel que a caixinha só aparenta ter. */
                    {...(bulkOn && bulkEligible ? {
                      role: 'checkbox' as const,
                      tabIndex: 0,
                      'aria-checked': isSelected,
                      'aria-label': `Selecionar ${item.displayId} para ${bulkConferMode ? 'conferência' : 'entrega'}`,
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleBulkItem(item.id); }
                      },
                    } : {})}
                    onClick={bulkOn && bulkEligible ? () => toggleBulkItem(item.id) : undefined}
                  >
                    {/* Left stripe / checkbox */}
                    {bulkOn ? (
                      bulkEligible ? (
                        <div style={{ width: 52, flexShrink: 0, background: isSelected ? TI.accent : '#f5f5f4', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>
                          <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${isSelected ? '#fff' : '#d4d4d0'}`, background: isSelected ? 'rgba(255,255,255,0.25)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {isSelected && <Check style={{ width: 14, height: 14, color: '#fff' }} />}
                          </div>
                        </div>
                      ) : (
                        <div style={{ width: 4, flexShrink: 0, background: '#e7e5e4' }} />
                      )
                    ) : (
                      <div style={{ width: 4, flexShrink: 0, background: isDelivered(item) ? '#86efac' : canDeliverItem ? TI.accent : '#e7e5e4' }} />
                    )}

                    {/* Arte aprovada — no celular é ela que identifica a peça
                        de relance, na hora de conferir com o material na mão. */}
                    {item.approvalThumbUrl && !bulkOn && (
                      <a
                        href={convertGCSUrlToLocalPath(item.approvalThumbUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        title="Abrir a arte aprovada"
                        data-testid={`thumb-art-mobile-${item.id}`}
                        style={{ width: 88, flexShrink: 0, alignSelf: 'stretch', backgroundColor: '#faf9f7', borderRight: `1px solid ${TI.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 5 }}
                      >
                        <img src={convertGCSUrlToLocalPath(item.approvalThumbUrl)} alt="Arte"
                          loading="lazy" decoding="async"
                          style={{ maxWidth: '100%', maxHeight: 104, objectFit: 'contain', display: 'block' }}
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                      </a>
                    )}

                    {/* Content */}
                    <div style={{ flex: 1, padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: item.isReuse ? '#059669' : TI.accent }}>
                          {item.displayId}
                        </span>
                        <StatusPill status={item.status} size="sm" showDot={false} />
                        {item.isReuse && <span style={{ fontSize: 10, fontWeight: 800, color: '#059669', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 6, padding: '2px 6px' }}>REAPROV.</span>}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: TI.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.type}</div>
                      {item.observations && (
                        <div style={{ fontSize: 11, color: '#d97706', display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                          <AlertCircle style={{ width: 10, height: 10 }} />{item.observations}
                        </div>
                      )}
                    </div>

                    {/* Right: action buttons — some em QUALQUER modo de lote
                        (antes só !bulkDeliveryMode: na conferência em lote os
                        botões continuavam aparecendo e disputando o toque). */}
                    {!bulkOn && (
                      <div style={{ flexShrink: 0, padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 5, justifyContent: 'center' }}>
                        {canDeliverItem && (
                          <button
                            onClick={e => { e.stopPropagation(); openDeliveryModal(item); }}
                            style={{ padding: '11px 14px', borderRadius: 8, background: '#c2410c', border: 'none', color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', whiteSpace: 'nowrap' }}
                          >
                            <Truck style={{ width: 13, height: 13 }} />
                            {deliveredOf(item) > 0 ? `Entregar ${remainingDeliver(item)}` : 'Entregar'}
                          </button>
                        )}
                        {canProduce && canConferItem && (
                          <button
                            onClick={e => { e.stopPropagation(); openConferenceModal(item); }}
                            style={{ padding: '11px 14px', borderRadius: 8, background: '#0891b2', border: 'none', color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', whiteSpace: 'nowrap' }}
                          >
                            <CheckCircle style={{ width: 13, height: 13 }} />
                            Conferir
                          </button>
                        )}
                        {isDelivered(item) && (
                          <span style={{ fontSize: 13, color: '#15803d', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, padding: '4px 8px' }}>
                            <Check style={{ width: 13, height: 13 }} /> Entregue
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </Fragment>
              );
            })}
          </div>
        ) : (
          /* ── View desktop: tabela ── */
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: TI.text }}>
                {["ID", "Descrição", "QTD", "REAPROV.", "PROD", "Dimensões (V × A)", "M² a produzir", "Material", "Status", ""].map(col => (
                  <th key={col} style={{ padding: "13px 16px", textAlign: col === "" ? "right" : "left", fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
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
                // Mesmo padrão do mobile: elegível conforme o modo de lote
                // ativo — antes só a entrega em lote tinha checkbox na tabela.
                const isSelected = bulkSelectedIds.has(item.id);
                const bulkEligible = bulkDeliveryMode ? canDeliver(item) : bulkConferMode ? canConfer(item) : false;

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
                              <span style={{ fontSize: 13, fontWeight: 800, color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'Space Grotesk', sans-serif" }}>
                                {item.event?.name || "Sem Evento"}
                              </span>
                            </div>
                            {item.event && (
                              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                                  <Calendar style={{ width: 12, height: 12 }} />
                                  Início: <strong style={{ color: "rgba(255,255,255,0.7)" }}>{parseDateLocal(item.event.startDate).toLocaleDateString("pt-BR")}</strong>
                                </div>
                                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 10 }}>|</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                                  <Truck style={{ width: 12, height: 12 }} />
                                  Saída: <strong style={{ color: "rgba(255,255,255,0.7)" }}>
                                    {new Date(item.event.truckDepartureDate).toLocaleDateString("pt-BR", { timeZone: 'UTC' })} às {new Date(item.event.truckDepartureDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: 'UTC' })}
                                  </strong>
                                </div>
                                <DeadlineChip event={item.event} />
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
                            <div style={{ width: 3, height: 14, backgroundColor: TI.accent, borderRadius: 999, flexShrink: 0 }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: TI.text }}>{item.type}</span>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Linha do item */}
                    <tr
                      style={{ borderBottom: `1px solid ${item.isReuse ? "#bbf7d0" : "#f4f3f0"}`, cursor: "pointer", transition: "background-color 0.1s", backgroundColor: isSelected ? "#fff7ed" : item.isReuse ? "#f0fdf4" : undefined }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = item.isReuse ? "#dcfce7" : "#fafaf9"; }}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = bulkSelectedIds.has(item.id) ? "#fff7ed" : item.isReuse ? "#f0fdf4" : "")}
                      onClick={bulkOn && bulkEligible ? () => toggleBulkItem(item.id) : () => setViewDetailsItem(item)}
                      data-testid={`row-item-${item.id}`}
                    >
                      {/* ID */}
                      {/* A linha abre o detalhe no clique, mas <tr> não recebe
                          foco: sem mouse não havia como abrir peça nenhuma.
                          O ID vira o alvo focável — é o rótulo natural da linha.
                          #059669 sobre branco dá 3.77:1; o verde escuro passa e
                          continua sinalizando reaproveitamento. */}
                      <td style={{ padding: "13px 16px" }}>
                        <button
                          onClick={e => { e.stopPropagation(); setViewDetailsItem(item); }}
                          aria-label={`Ver detalhes da peça ${item.displayId}`}
                          style={{ fontSize: 13, fontFamily: "'DM Mono', monospace", color: item.isReuse ? "#047857" : TI.accent, fontWeight: 700, letterSpacing: "0.04em", background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                          data-testid={`text-display-id-${item.id}`}
                        >
                          {item.displayId}
                        </button>
                      </td>
                      {/* Descrição — com a arte ao lado: a Gráfica identifica a
                          peça pelo desenho, não pelo texto, e antes era preciso
                          abrir o detalhe de cada uma para saber o que era. */}
                      <td style={{ padding: "13px 16px", maxWidth: 320 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          {item.approvalThumbUrl && (
                            <a
                              href={convertGCSUrlToLocalPath(item.approvalThumbUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              title="Abrir a arte aprovada"
                              data-testid={`thumb-art-${item.id}`}
                              style={{ display: "block", width: 44, height: 44, borderRadius: 6, overflow: "hidden", border: `1px solid ${TI.border}`, backgroundColor: "#fff", flexShrink: 0 }}
                            >
                              <img src={convertGCSUrlToLocalPath(item.approvalThumbUrl)} alt="Arte"
                                loading="lazy" decoding="async"
                                style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                                onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            </a>
                          )}
                          <div style={{ minWidth: 0, flex: 1 }}>
                        {/* A cor verde da linha sozinha não diz o que é: o rótulo
                            precisa aparecer sempre que houver reaproveitamento,
                            inclusive nas peças marcadas antes de reuseQty existir. */}
                        {(item.isReuse || reusedOf(item) > 0) && (
                          <div title={item.isReuse ? "Peça inteira reaproveitada" : `${reusedOf(item)} de ${qtyOf(item)} un. reaproveitadas`}
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, backgroundColor: item.isReuse ? "#059669" : "#10b981", color: "#ffffff", borderRadius: 6, padding: "3px 9px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>
                            <RotateCcw style={{ width: 11, height: 11 }} />
                            {item.isReuse ? "Reaproveitamento" : `Reaproveitamento ${reusedOf(item)}/${qtyOf(item)}`}
                          </div>
                        )}
                        {item.description ? (
                          <div style={{ fontSize: 13, color: item.isReuse ? "#065f46" : TI.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: item.isReuse ? 600 : 400 }}>{item.description}</div>
                        ) : (
                          <div style={{ fontSize: 13, color: TI.muted }}>—</div>
                        )}
                        {item.observations && (
                          <div style={{ fontSize: 11, color: TI.secondary, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{item.observations}</div>
                        )}
                        {item.referenceUrl && (
                          <a href={item.referenceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Ver referência do solicitante" style={{ display: "inline-flex", alignItems: "center", gap: 3, marginTop: 3, fontSize: 10, fontWeight: 700, color: "#c2410c", textDecoration: "none", backgroundColor: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 6, padding: "1px 5px" }} data-testid={`link-reference-grafica-${item.id}`}>
                            <img src={item.referenceUrl} style={{ width: 12, height: 12, objectFit: "cover", borderRadius: 999 }} alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            REF
                          </a>
                        )}
                        {/* Arquivo final foi substituído pela Arte após envio inicial */}
                        {item.previousFinalFileUrl && (
                          <div
                            title={`Anterior: ${item.previousFinalFileUrl}`}
                            data-testid={`badge-arquivo-atualizado-${item.id}`}
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4, fontSize: 10, fontWeight: 800, color: "#92400e", backgroundColor: "#fef3c7", border: "1px solid #fbbf24", borderRadius: 6, padding: "2px 7px", textTransform: "uppercase", letterSpacing: "0.06em" }}
                          >
                            ⚠ Arquivo atualizado
                          </div>
                        )}
                          </div>
                        </div>
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
                          <span style={{ fontSize: 13, color: TI.muted }}>—</span>
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
                        <div style={{ fontSize: 13, color: TI.text }}>{item.material}</div>
                        {item.finish && <div style={{ fontSize: 11, color: TI.muted, marginTop: 2 }}>{item.finish}</div>}
                      </td>
                      {/* Status */}
                      <td style={{ padding: "13px 16px" }}>
                        <StatusPill status={item.status} size="sm" showDot={false} />
                      </td>
                      {/* Ações */}
                      <td style={{ padding: "13px 16px", textAlign: "right" }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                          {/* Ver detalhes */}
                          <button
                            onClick={() => setViewDetailsItem(item)}
                            title="Ver detalhes"
                            data-testid={`button-view-${item.id}`}
                            style={{ background: "none", border: "none", cursor: "pointer", color: TI.muted, padding: 4, borderRadius: 6, display: "flex", alignItems: "center", transition: "color 0.15s" }}
                            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = TI.text)}
                            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = TI.muted)}
                          >
                            <Eye style={{ width: 15, height: 15 }} />
                          </button>

                          {/* Iniciar / Continuar Produção — oculto para reaproveitamento
                              e para quem o servidor recusa (só grafica/admin produzem).
                              Depois de conferida, a peça só tem a entrega pela frente. */}
                          {canProduce && !isDelivered(item) && !isProduced(item) && !isConferred(item) && !item.isReuse && (
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
                                  style={{ width: 52, height: 26, padding: "0 6px", borderRadius: 6, border: `1px solid ${TI.border}`, fontSize: 11, fontWeight: 700, color: TI.text, textAlign: "center" }}
                                />
                                <span style={{ fontSize: 10, color: TI.secondary, whiteSpace: "nowrap" }}>de {remainingReuse(item)}</span>
                                <button
                                  onClick={() => markReuseMutation.mutate({ itemId: item.id, qty: reuseQty })}
                                  disabled={markReuseMutation.isPending}
                                  title="Confirmar reaproveitamento"
                                  data-testid={`button-reuse-confirm-${item.id}`}
                                  style={{ backgroundColor: "#047857", color: "#fff", border: "none", borderRadius: 6, height: 26, padding: "0 8px", fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                                >
                                  OK
                                </button>
                                <button
                                  onClick={() => setReuseConfirmItemId(null)}
                                  title="Cancelar"
                                  style={{ background: "none", border: `1px solid ${TI.border}`, borderRadius: 6, height: 26, padding: "0 6px", fontSize: 10, fontWeight: 700, color: TI.muted, cursor: "pointer" }}
                                >
                                  <X style={{ width: 10, height: 10 }} />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={e => { e.stopPropagation(); setReuseConfirmItemId(item.id); setReuseQty(remainingReuse(item)); }}
                                title={`Reaproveitar (pula produção) — até ${remainingReuse(item)} un.`}
                                data-testid={`button-reuse-${item.id}`}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#059669", padding: 4, borderRadius: 6, display: "flex", alignItems: "center", transition: "color 0.15s" }}
                                onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = "#065f46")}
                                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = "#059669")}
                              >
                                <RotateCcw style={{ width: 15, height: 15 }} />
                              </button>
                            )
                          )}

                          {/* Corrigir reaproveitamento — para quando a marcação foi
                              feita errada, total ou parcial, e a peça ainda não
                              começou a ser conferida nem entregue.
                              O `isProduced` sozinho escondia o caso mais comum:
                              a quantidade sai errada e o erro é notado antes de
                              produzir, com a peça em "Pronto p/ Produção". O
                              admin corrige em qualquer etapa anterior à
                              conferência; para a Gráfica segue como estava. */}
                          {(isProduced(item) || isAdmin) && reusedTotalOf(item) > 0
                            && conferredOf(item) === 0 && deliveredOf(item) === 0 && (
                            correctReuseItemId === item.id ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={e => e.stopPropagation()}>
                                {/* Rótulo explícito: sem ele este campo fica ao
                                    lado do de "Produzir", que também é um
                                    número seguido de "de N" — dava para digitar
                                    no lugar errado sem perceber. */}
                                <span style={{ fontSize: 11, fontWeight: 700, color: "#b45309", whiteSpace: "nowrap" }}>Reaprov.:</span>
                                {/* O teto era quantidade-1, então quem marcou
                                    parcial por engano não conseguia voltar para
                                    reaproveitamento total. O admin alcança o
                                    total; para a Gráfica o limite continua
                                    sendo o parcial. */}
                                <input
                                  type="number"
                                  min={0}
                                  max={isAdmin ? qtyOf(item) : qtyOf(item) - 1}
                                  value={correctReuseQty}
                                  autoFocus
                                  onFocus={e => e.currentTarget.select()}
                                  onChange={e => setCorrectReuseQty(Math.max(0, Math.min(isAdmin ? qtyOf(item) : qtyOf(item) - 1, parseInt(e.target.value) || 0)))}
                                  aria-label="Quantidade reaproveitada corrigida"
                                  title={`Quantas unidades reaproveitadas (0 a ${isAdmin ? qtyOf(item) : qtyOf(item) - 1})`}
                                  style={{ width: 52, height: 26, padding: "0 6px", borderRadius: 6, border: "1px solid #fbbf24", fontSize: 11, fontWeight: 700, color: TI.text, textAlign: "center" }}
                                />
                                <span style={{ fontSize: 10, color: TI.secondary, whiteSpace: "nowrap" }}>de {qtyOf(item)}</span>
                                <button
                                  onClick={() => correctReuseMutation.mutate({ itemId: item.id, correctedReuseQty: correctReuseQty })}
                                  disabled={correctReuseMutation.isPending}
                                  title="Confirmar correção"
                                  style={{ backgroundColor: "#b45309", color: "#fff", border: "none", borderRadius: 6, height: 26, padding: "0 8px", fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                                >
                                  OK
                                </button>
                                <button
                                  onClick={() => setCorrectReuseItemId(null)}
                                  title="Cancelar"
                                  style={{ background: "none", border: `1px solid ${TI.border}`, borderRadius: 6, height: 26, padding: "0 6px", fontSize: 10, fontWeight: 700, color: TI.muted, cursor: "pointer" }}
                                >
                                  <X style={{ width: 10, height: 10 }} />
                                </button>
                              </div>
                            ) : (
                              /* Era um ícone solto com o texto só no `title`:
                                 ninguém achava o caminho para corrigir. Com
                                 rótulo, a ação fica óbvia ao lado do número
                                 errado. E o campo abre com a quantidade ATUAL,
                                 não com quantidade-1 — quem corrige parte do
                                 valor que está lá, não de um chute. */
                              <button
                                onClick={e => { e.stopPropagation(); setCorrectReuseItemId(item.id); setCorrectReuseQty(reusedTotalOf(item)); }}
                                title="Corrigir a quantidade reaproveitada desta peça"
                                aria-label={`Corrigir reaproveitamento de ${item.displayId}`}
                                data-testid={`button-correct-reuse-${item.id}`}
                                style={{ background: "#fff7ed", border: "1px solid #fed7aa", cursor: "pointer", color: "#b45309", height: 26, padding: "0 9px", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", transition: "background-color 0.15s" }}
                                onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#ffedd5")}
                                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#fff7ed")}
                              >
                                <RotateCcw style={{ width: 12, height: 12 }} />
                                Corrigir reaprov.
                              </button>
                            )
                          )}

                          {/* Conferir — etapa entre Produzido e Entregue (com foto);
                              gate igual ao do servidor (grafica/admin) */}
                          {canProduce && canConfer(item) && (
                            <button
                              onClick={() => openConferenceModal(item)}
                              title={`Conferir (faltam ${remainingConfer(item)} de ${qtyOf(item)})`}
                              data-testid={`button-confer-${item.id}`}
                              style={{
                                backgroundColor: "#0e7490", color: "#ffffff",
                                border: "none", borderRadius: 6, height: 30, padding: "0 12px",
                                fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
                                cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                                transition: "background-color 0.15s",
                              }}
                              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#155e75"}
                              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#0e7490"}
                            >
                              <CheckCircle style={{ width: 11, height: 11 }} />
                              {conferredOf(item) > 0 ? `Conferir ${remainingConfer(item)}` : "Conferir"}
                            </button>
                          )}

                          {/* Checkbox seleção em lote — nos DOIS modos (a
                              conferência em lote não tinha checkbox na tabela) */}
                          {bulkOn && bulkEligible && (
                            <div
                              role="checkbox"
                              aria-checked={isSelected}
                              aria-label={`Selecionar ${item.displayId} para ${bulkConferMode ? 'conferência' : 'entrega'}`}
                              onClick={e => { e.stopPropagation(); toggleBulkItem(item.id); }}
                              style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0, border: `2px solid ${isSelected ? TI.accent : '#d4d4d0'}`, background: isSelected ? TI.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.12s' }}
                            >
                              {isSelected && <Check style={{ width: 13, height: 13, color: '#fff' }} />}
                            </div>
                          )}
                          {/* Entregar — reaproveitamento: direto; normal: o que já foi conferido */}
                          {canDeliver(item) && (
                            <button
                              onClick={() => openDeliveryModal(item)}
                              title={`Entregar (${remainingDeliver(item)} conferido(s) pendente(s))`}
                              data-testid={`button-deliver-${item.id}`}
                              style={{
                                // #c2410c: branco sobre #f97316 dava ~2.8:1 (reprova AA)
                                backgroundColor: "#c2410c", color: "#ffffff",
                                border: "none", borderRadius: 6, height: 30, padding: "0 12px",
                                fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
                                cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                                transition: "background-color 0.15s",
                              }}
                              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#9a3412"}
                              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#c2410c"}
                            >
                              <Truck style={{ width: 11, height: 11 }} />
                              {deliveredOf(item) > 0 ? `Entregar ${remainingDeliver(item)}` : "Entregar"}
                            </button>
                          )}

                          {/* Entregue */}
                          {isDelivered(item) && (
                            <span style={{ fontSize: 13, color: "#15803d", display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
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
                            <span style={{ fontSize: 13, color: "#92400e" }}>
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
          <div style={{ borderTop: `1px solid ${TI.border}`, padding: "10px 16px", backgroundColor: "#fafaf9", fontSize: 13, color: TI.secondary }}>
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

      {/* ── Barra flutuante dos modos em lote (entrega OU conferência) ── */}
      {bulkOn && (
        <div
          role="toolbar"
          aria-label={bulkConferMode ? "Ações da conferência em lote" : "Ações da entrega em lote"}
          style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
            background: TI.text,
            padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: 10,
            boxShadow: '0 -4px 24px rgba(0,0,0,0.28)',
          }}>
          {/* Selecionar tudo / desmarcar */}
          <button
            onClick={() => allDeliverableSelected
              ? setBulkSelectedIds(new Set())
              : setBulkSelectedIds(new Set(bulkEligibleList.map((i: any) => i.id)))
            }
            style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {allDeliverableSelected ? 'Desmarcar' : `Sel. ${bulkEligibleList.length}`}
          </button>

          {/* Contador — aria-live anuncia a contagem a cada seleção */}
          <span aria-live="polite" style={{ flex: 1, color: bulkSelectedIds.size > 0 ? '#fff' : 'rgba(255,255,255,0.72)', fontSize: 13, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {bulkSelectedIds.size > 0
              ? `${bulkSelectedIds.size} peça${bulkSelectedIds.size !== 1 ? 's' : ''} selecionada${bulkSelectedIds.size !== 1 ? 's' : ''}`
              : 'Toque nas peças para selecionar'}
          </span>

          {/* Confirmar — aria-disabled (não disabled) para poder receber o foco
              ao entrar no modo; o onClick já ignora o clique sem seleção. */}
          <button
            ref={bulkConfirmRef}
            onClick={() => { if (bulkSelectedIds.size > 0) (bulkConferMode ? setBulkConferOpen(true) : setBulkDeliveryOpen(true)); }}
            aria-disabled={bulkSelectedIds.size === 0}
            style={{
              padding: '12px 18px', borderRadius: 12, border: 'none', flexShrink: 0,
              background: bulkSelectedIds.size === 0 ? 'rgba(255,255,255,0.15)' : bulkConferMode ? '#0e7490' : '#c2410c',
              color: bulkSelectedIds.size === 0 ? 'rgba(255,255,255,0.35)' : '#fff',
              fontSize: 13, fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif",
              cursor: bulkSelectedIds.size === 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 7,
              boxShadow: bulkSelectedIds.size > 0 ? (bulkConferMode ? '0 4px 16px rgba(14,116,144,0.4)' : '0 4px 16px rgba(194,65,12,0.4)') : 'none',
              transition: 'all 0.15s',
            }}
          >
            {bulkConferMode ? <CheckCircle style={{ width: 15, height: 15 }} /> : <Truck style={{ width: 15, height: 15 }} />}
            Confirmar{bulkSelectedIds.size > 0 && ` (${bulkSelectedIds.size})`}
          </button>

          {/* Cancelar modo */}
          <button
            onClick={() => { setBulkDeliveryMode(false); setBulkConferMode(false); setBulkSelectedIds(new Set()); }}
            style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>
      )}

      {/* ── Dialogs dos modos em lote (componente único, ver BulkActionDialog) ── */}
      <BulkActionDialog
        mode="deliver"
        open={bulkDeliveryOpen}
        onClose={() => { setBulkDeliveryOpen(false); setBulkDeliveryPhotos([]); }}
        items={bulkSelectedItems}
        photos={bulkDeliveryPhotos}
        onAddPhoto={addBulkPhoto}
        onRemovePhoto={url => setBulkDeliveryPhotos(prev => prev.filter(u => u !== url))}
        onPhotoError={onPhotoError}
        notes={bulkDeliveryNotes}
        onNotesChange={setBulkDeliveryNotes}
        receivedBy={bulkReceivedBy}
        onReceivedByChange={setBulkReceivedBy}
        isSubmitting={isBulkSubmitting}
        onConfirm={handleBulkDelivery}
        qtyFor={remainingDeliver}
      />
      <BulkActionDialog
        mode="confer"
        open={bulkConferOpen}
        onClose={() => { setBulkConferOpen(false); setBulkConferPhotos([]); }}
        items={bulkSelectedItems}
        photos={bulkConferPhotos}
        onAddPhoto={addBulkConferPhoto}
        onRemovePhoto={url => setBulkConferPhotos(prev => prev.filter(u => u !== url))}
        onPhotoError={onPhotoError}
        notes={bulkConferNotes}
        onNotesChange={setBulkConferNotes}
        isSubmitting={isBulkSubmitting}
        onConfirm={handleBulkConference}
        qtyFor={remainingConfer}
      />

      {/* ── Dialog de Detalhes ── */}
      <ItemDetailsDialog
        item={viewDetailsItem}
        auditLogs={auditLogs}
        open={!!viewDetailsItem}
        onOpenChange={(open) => !open && setViewDetailsItem(null)}
      />

      {/* ── Modal de Produção / Entrega ── */}
      <Dialog open={!!selectedItem && !!modalType} onOpenChange={open => { if (!open) { setSelectedItem(null); setModalType(null); } }}>
        <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(468)}>
          <DialogTitle className="sr-only">
            {modalType === "production" ? "Registrar produção"
              : modalType === "conference" ? "Conferir peça"
              : "Confirmar entrega"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {modalType === "production" ? "Registre a quantidade produzida desta peça"
              : modalType === "conference" ? "Anexe a foto da conferência e confirme a quantidade"
              : "Registre quem recebeu o material e confirme a entrega"}
          </DialogDescription>

          {/* rgba(255,255,255,0.4) media ~3.9:1 sobre o cabeçalho escuro — a
              legenda que diz o que fazer era a coisa menos legível do modal. */}
          <ModalHeader
            icon={modalType === "production" ? Play : modalType === "conference" ? CheckCircle : Truck}
            tint={TI.accent}
            title={modalType === "production"
              ? (selectedItem?.quantityProduced > 0 ? "Continuar produção" : "Iniciar produção")
              : modalType === "conference" ? "Conferir peça"
              : "Confirmar entrega"}
            subtitle={modalType === "production" ? "Registre a quantidade produzida"
              : modalType === "conference" ? "Anexe a foto da conferência"
              : "Registre a entrega do material"}
            onClose={() => { setSelectedItem(null); setModalType(null); }}
          />

          {/* ── Corpo ── */}
          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, overflowY: "auto", maxHeight: "calc(88vh - 112px)" }}>

            {/* Arte aprovada em destaque — na conferência é o que a pessoa
                compara com a peça na mão, quase sempre pelo celular. Precisa ser
                a maior coisa da tela, não uma miniatura ao lado do texto. */}
            {selectedItem?.approvalThumbUrl && modalType !== "production" && (
              <a
                href={convertGCSUrlToLocalPath(selectedItem.approvalThumbUrl)}
                target="_blank"
                rel="noopener noreferrer"
                title="Tocar para abrir em tamanho real"
                data-testid="thumb-approved-art"
                style={{
                  display: "block", position: "relative", width: "100%",
                  height: isMobile ? 240 : 200,
                  // O corpo do modal é um flex column com rolagem: sem
                  // flexShrink 0 este bloco era espremido até uma linha fina
                  // quando o conteúdo passava da altura máxima.
                  flexShrink: 0,
                  borderRadius: 12, overflow: "hidden",
                  backgroundColor: "#ffffff", border: `1px solid ${TI.border}`,
                }}
              >
                <img
                  src={convertGCSUrlToLocalPath(selectedItem.approvalThumbUrl)}
                  alt="Arte aprovada"
                  style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
                <span style={{ position: "absolute", top: 8, left: 8, backgroundColor: "rgba(28,25,23,0.78)", color: "#fff", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", padding: "4px 8px", borderRadius: 6 }}>
                  Arte aprovada
                </span>
                <span style={{ position: "absolute", bottom: 8, right: 8, backgroundColor: "rgba(28,25,23,0.78)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "4px 8px", borderRadius: 6, display: "flex", alignItems: "center", gap: 4 }}>
                  <Search style={{ width: 10, height: 10 }} /> Ampliar
                </span>
              </a>
            )}

            {/* Card de identificação */}
            {selectedItem && (
              <div style={{ backgroundColor: "#f4f3f0", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ backgroundColor: "#ffffff", borderRadius: 8, padding: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", flexShrink: 0 }}>
                    {modalType === "production"
                      ? <Printer style={{ width: 20, height: 20, color: TI.accent }} />
                      : modalType === "conference"
                      ? <CheckCircle style={{ width: 20, height: 20, color: "#0891b2" }} />
                      : <Truck style={{ width: 20, height: 20, color: TI.accent }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                      <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 13, color: selectedItem.isReuse ? '#059669' : TI.accent }}>{selectedItem.displayId}</span>
                      <StatusPill status={selectedItem.status} size="sm" showDot={false} />
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: TI.text }}>{selectedItem.type}</div>
                    {selectedItem.description && selectedItem.description !== selectedItem.type && (
                      <div style={{ fontSize: 13, color: TI.secondary, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedItem.description}</div>
                    )}
                    {selectedItem.event?.name && (
                      <div style={{ fontSize: 13, color: "#746e69", marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
                        <Calendar style={{ width: 11, height: 11, flexShrink: 0 }} />
                        {selectedItem.event.name}
                      </div>
                    )}
                  </div>
                </div>

                {/* Grade de specs */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ background: '#fff', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TI.secondary, marginBottom: 3 }}>Material</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: TI.text }}>{selectedItem.material || '—'}</div>
                    {selectedItem.visualWidth && (
                      <div style={{ fontSize: 11, color: TI.secondary, marginTop: 1 }}>{selectedItem.visualWidth} × {selectedItem.visualHeight}m</div>
                    )}
                  </div>
                  <div style={{ background: '#fff', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TI.secondary, marginBottom: 3 }}>Acabamento</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: TI.text }}>{selectedItem.finish || '—'}</div>
                    {Number(selectedItem.calculatedM2) > 0 && (
                      <div style={{ fontSize: 11, color: TI.secondary, marginTop: 1 }}>{m2ToProduce(selectedItem).toFixed(2)} m²</div>
                    )}
                  </div>
                  <div style={{ background: '#fff', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TI.secondary, marginBottom: 2 }}>Quantidade</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: TI.text, fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1 }}>{qtyOf(selectedItem)}<span style={{ fontSize: 11, fontWeight: 500, color: TI.muted, marginLeft: 3 }}>un.</span></div>
                    {selectedItem.isReuse && <div style={{ fontSize: 10, color: '#059669', marginTop: 2, fontWeight: 600 }}>Reaproveitado</div>}
                  </div>
                  {(modalType === "conference" || modalType === "delivery") && (
                    <div style={{ background: modalType === "conference" ? '#ecfeff' : '#fff7ed', borderRadius: 8, padding: '8px 10px', border: `1px solid ${modalType === "conference" ? '#a5f3fc' : '#fed7aa'}` }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: modalType === "conference" ? '#0e7490' : '#c2410c', marginBottom: 2 }}>
                        {modalType === "conference" ? "A Conferir" : "A Entregar"}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: modalType === "conference" ? '#0891b2' : TI.accent, fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1 }}>
                        {modalType === "conference" ? remainingConfer(selectedItem) : remainingDeliver(selectedItem)}<span style={{ fontSize: 11, fontWeight: 500, marginLeft: 3 }}>un.</span>
                      </div>
                      {modalType === "conference" && conferredOf(selectedItem) > 0 && (
                        <div style={{ fontSize: 10, color: '#0e7490', marginTop: 2 }}>{conferredOf(selectedItem)} já conferida{conferredOf(selectedItem) !== 1 ? 's' : ''}</div>
                      )}
                      {modalType === "delivery" && deliveredOf(selectedItem) > 0 && (
                        <div style={{ fontSize: 10, color: '#c2410c', marginTop: 2 }}>{deliveredOf(selectedItem)} já entregue{deliveredOf(selectedItem) !== 1 ? 's' : ''}</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Observações */}
                {selectedItem.observations && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                    <AlertCircle style={{ width: 12, height: 12, color: '#d97706', flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 13, color: '#92400e', lineHeight: 1.4 }}>{selectedItem.observations}</span>
                  </div>
                )}
              </div>
            )}

            {/* ── FORM: PRODUÇÃO ── */}
            {selectedItem && modalType === "production" && (
              <form onSubmit={handleSubmitProduction} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#746e69", marginBottom: 10 }}>
                    Quantidade a Produzir
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {/* Teto = quantidade − reaproveitadas (a mesma conta do
                        openProductionModal): o reaproveitado não é produzido,
                        e o teto antigo deixava lançar produção acima do real. */}
                    <input
                      type="number"
                      min={1}
                      max={qtyOf(selectedItem) - reusedOf(selectedItem)}
                      value={productionData.quantityProduced}
                      onChange={e => setProductionData({ quantityProduced: parseInt(e.target.value) || 0 })}
                      required
                      data-testid="input-quantity-produced"
                      style={{ flex: 1, textAlign: "center", fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 700, color: TI.text, backgroundColor: "#f4f3f0", border: "none", borderRadius: 8, padding: "16px 12px" }}
                    />
                    <button
                      type="button"
                      onClick={() => setProductionData({ quantityProduced: qtyOf(selectedItem) - reusedOf(selectedItem) })}
                      data-testid="button-set-total"
                      style={{ backgroundColor: "#e7e5e4", border: "none", borderRadius: 8, padding: "0 20px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "#57534e", cursor: "pointer", whiteSpace: "nowrap", transition: "background-color 0.15s" }}
                      onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#d6d3d1")}
                      onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#e7e5e4")}
                    >
                      Tudo
                    </button>
                  </div>
                </div>

                {/* Footer */}
                <div style={modalActionsStyle}>
                  <button
                    type="button"
                    onClick={() => { setSelectedItem(null); setModalType(null); }}
                    style={{ flex: 1, padding: "12px 0", backgroundColor: "transparent", border: "none", color: "#746e69", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer", borderRadius: 8, transition: "background-color 0.15s" }}
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
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#746e69", marginBottom: 10 }}>
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
                    style={{ width: "100%", padding: "12px 14px", backgroundColor: "#e8e8e7", border: "1px solid transparent", borderRadius: 8, fontSize: 13, fontWeight: 500, color: TI.text }}
                  />
                </div>

                {/* Quantidade a entregar (entrega parcial) — só exibe se restar mais de 1 */}
                {remainingDeliver(selectedItem) > 1 && (
                  <div>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#746e69", marginBottom: 8 }}>
                      Quantidade a entregar agora <span style={{ color: "#746e69", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>· já entregue {deliveredOf(selectedItem)}/{qtyOf(selectedItem)}, disponível {remainingDeliver(selectedItem)}</span>
                    </label>
                    <input type="number" min={1} max={remainingDeliver(selectedItem)} value={deliverQty}
                      onChange={e => setDeliverQty(Math.max(1, Math.min(remainingDeliver(selectedItem), parseInt(e.target.value) || 1)))}
                      style={{ width: "100%", padding: "10px 14px", backgroundColor: "#e8e8e7", border: "1px solid transparent", borderRadius: 8, fontSize: 15, fontWeight: 700, color: TI.text }} />
                  </div>
                )}

                {/* Comprovante fotográfico */}
                <PhotoPicker photos={photos} onAdd={addPhoto} onRemove={removePhoto} onError={onPhotoError} hint="(opcional) · pode anexar várias" />

                {renderNotesField("Ex.: entregue na portaria, faltou 1 caixa…")}

                {/* Footer */}
                <div style={modalActionsStyle}>
                  <button
                    type="button"
                    onClick={() => { setSelectedItem(null); setModalType(null); }}
                    style={{ flex: 1, padding: "12px 0", backgroundColor: "transparent", border: "none", color: "#746e69", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer", borderRadius: 8, transition: "background-color 0.15s" }}
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
                <p style={{ fontSize: 13, color: "#57534e", margin: 0 }}>
                  Confira a peça produzida e anexe a foto. Pode conferir parcialmente — depois é só conferir o restante.
                </p>
                {remainingConfer(selectedItem) > 1 && (
                  <div>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#746e69", marginBottom: 8 }}>
                      Quantidade a conferir agora <span style={{ color: "#746e69", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>· já conferido {conferredOf(selectedItem)}/{qtyOf(selectedItem)}, faltam {remainingConfer(selectedItem)}</span>
                    </label>
                    <input type="number" min={1} max={remainingConfer(selectedItem)} value={conferQty}
                      onChange={e => setConferQty(Math.max(1, Math.min(remainingConfer(selectedItem), parseInt(e.target.value) || 1)))}
                      style={{ width: "100%", padding: "10px 14px", backgroundColor: "#e8e8e7", border: "1px solid transparent", borderRadius: 8, fontSize: 15, fontWeight: 700, color: TI.text }} />
                  </div>
                )}
                <PhotoPicker photos={photos} onAdd={addPhoto} onRemove={removePhoto} onError={onPhotoError} hint="· obrigatória, pode anexar várias" />

                {renderNotesField("Ex.: cor puxando para o escuro, ilhós faltando…")}
                <div style={modalActionsStyle}>
                  <button type="button" onClick={() => { setSelectedItem(null); setModalType(null); }}
                    style={{ flex: 1, padding: "12px 0", backgroundColor: "transparent", border: "none", color: "#746e69", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer", borderRadius: 8 }}>
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
