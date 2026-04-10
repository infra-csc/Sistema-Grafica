import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { InventoryAsset, Sponsor } from "@shared/schema";
import {
  Archive, Plus, Search, Filter, Pencil, Trash2,
  CheckCircle2, AlertTriangle, XCircle, MapPin, Tag,
  X, Eye, Package, Warehouse, Truck, ScanSearch, Flame,
} from "lucide-react";

// ── Tracking Status ────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string; Icon: React.ElementType }> = {
  NO_GALPAO:         { label: "No Galpão",         color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", Icon: Warehouse },
  EM_USO:            { label: "Em Uso",             color: "#ea580c", bg: "#fff7ed", border: "#fed7aa", Icon: Truck },
  AGUARDANDO_TRIAGEM:{ label: "Aguard. Triagem",    color: "#b45309", bg: "#fffbeb", border: "#fde68a", Icon: ScanSearch },
  DESCARTADO:        { label: "Descartado",         color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb", Icon: XCircle },
};
const ALL_STATUSES = ["NO_GALPAO", "EM_USO", "AGUARDANDO_TRIAGEM", "DESCARTADO"] as const;
type TrackingStatus = typeof ALL_STATUSES[number];

// ── Condition ─────────────────────────────────────────────────────────────────
const CONDITION_META: Record<string, { label: string; color: string; bg: string; border: string; Icon: React.ElementType }> = {
  PERFEITO:    { label: "Perfeito",     color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", Icon: CheckCircle2 },
  AVARIA_LEVE: { label: "Avaria Leve",  color: "#d97706", bg: "#fffbeb", border: "#fde68a", Icon: AlertTriangle },
  SUCATA:      { label: "Sucata",       color: "#dc2626", bg: "#fef2f2", border: "#fecaca", Icon: XCircle },
};
const CONDITIONS = ["PERFEITO", "AVARIA_LEVE", "SUCATA"] as const;
type Condition = typeof CONDITIONS[number];

const EMPTY_FORM = {
  name: "",
  quantity: 1,
  location: "",
  condition: "PERFEITO" as Condition,
  franchiseTags: [] as string[],
  trackingStatus: "NO_GALPAO" as TrackingStatus,
  notes: "",
};

// ── Thumb Popover ─────────────────────────────────────────────────────────────
function ThumbPopover({ url }: { url: string }) {
  const [show, setShow] = useState(false);
  return (
    <div
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <button
        data-testid="button-thumb-preview"
        style={{
          width: 28, height: 28, borderRadius: 4, overflow: "hidden",
          border: "1px solid #e8e8e7", cursor: "pointer", padding: 0,
        }}
      >
        <img src={url} alt="thumb" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </button>
      {show && (
        <div style={{
          position: "absolute", top: 34, left: "50%", transform: "translateX(-50%)",
          background: "#fff", border: "1px solid #e8e8e7", borderRadius: 8,
          padding: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 9999,
          width: 180,
        }}>
          <img src={url} alt="aprovação" style={{ width: "100%", borderRadius: 4 }} />
          <p style={{ fontSize: 10, color: "#78716c", textAlign: "center", marginTop: 4, fontFamily: "Plus Jakarta Sans, sans-serif" }}>
            Arte aprovada
          </p>
        </div>
      )}
    </div>
  );
}

// ── Sponsor Chips ─────────────────────────────────────────────────────────────
function SponsorChips({ sponsorIds, sponsors }: { sponsorIds: string[]; sponsors: Sponsor[] }) {
  if (!sponsorIds || sponsorIds.length === 0) return <span style={{ color: "#a8a29e", fontSize: 12 }}>—</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {sponsorIds.map(sid => {
        const sp = sponsors.find(s => s.id === sid);
        if (!sp) return null;
        return (
          <span key={sid} style={{
            fontSize: 11, padding: "2px 6px", borderRadius: 4,
            background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#16a34a",
            fontFamily: "Plus Jakarta Sans, sans-serif", whiteSpace: "nowrap",
          }}>
            {sp.name}
          </span>
        );
      })}
    </div>
  );
}

// ── Delete Modal ──────────────────────────────────────────────────────────────
function DeleteModal({ asset, onClose, onConfirm }: {
  asset: InventoryAsset;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(28,25,23,0.5)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "#fff", borderRadius: 12, width: 420, overflow: "hidden",
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
      }}>
        <div style={{ background: "#ef4444", padding: "16px 20px" }}>
          <p style={{ color: "#fff", fontWeight: 700, fontSize: 14, fontFamily: "Space Grotesk, sans-serif", margin: 0 }}>
            ATENÇÃO: AÇÃO IRREVERSÍVEL
          </p>
        </div>
        <div style={{ padding: 24 }}>
          <p style={{ fontSize: 14, color: "#1c1917", margin: "0 0 8px", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
            Tem certeza que deseja excluir o ativo abaixo permanentemente?
          </p>
          <p style={{ fontSize: 13, color: "#78716c", fontFamily: "DM Mono, monospace", margin: "0 0 20px" }}>
            {asset.displayId} — {asset.name}
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={onClose} data-testid="button-cancel-delete" style={{
              padding: "8px 18px", borderRadius: 6, border: "1px solid #e8e8e7",
              background: "#fafaf9", color: "#1c1917", fontSize: 13, cursor: "pointer",
              fontFamily: "Plus Jakarta Sans, sans-serif",
            }}>
              Manter
            </button>
            <button onClick={onConfirm} data-testid="button-confirm-delete" style={{
              padding: "8px 18px", borderRadius: 6, border: "none",
              background: "#ef4444", color: "#fff", fontSize: 13, cursor: "pointer",
              fontFamily: "Plus Jakarta Sans, sans-serif",
            }}>
              Sim, Excluir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Asset Modal (Create / Edit) ────────────────────────────────────────────────
function AssetModal({
  asset, onClose, onSaved,
}: {
  asset: InventoryAsset | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!asset;

  const [form, setForm] = useState(
    asset
      ? {
          name: asset.name,
          quantity: asset.quantity ?? 1,
          location: asset.location ?? "",
          condition: (asset.condition as Condition) ?? "PERFEITO",
          franchiseTags: asset.franchiseTags ?? [],
          trackingStatus: (asset.trackingStatus as TrackingStatus) ?? "NO_GALPAO",
          notes: asset.notes ?? "",
        }
      : { ...EMPTY_FORM }
  );
  const [tagInput, setTagInput] = useState("");

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      isEdit
        ? apiRequest("PATCH", `/api/inventory/${asset!.id}`, data)
        : apiRequest("POST", "/api/inventory", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: isEdit ? "Ativo atualizado." : "Ativo criado." });
      onSaved();
    },
    onError: () => toast({ title: "Erro ao salvar.", variant: "destructive" }),
  });

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.franchiseTags.includes(t)) {
      setForm(f => ({ ...f, franchiseTags: [...f.franchiseTags, t] }));
    }
    setTagInput("");
  };
  const removeTag = (t: string) =>
    setForm(f => ({ ...f, franchiseTags: f.franchiseTags.filter(x => x !== t) }));

  const INP: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 6,
    border: "1px solid #e8e8e7", fontSize: 13, fontFamily: "Plus Jakarta Sans, sans-serif",
    background: "#fafaf9", color: "#1c1917", outline: "none", boxSizing: "border-box",
  };
  const LBL: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: "#78716c", fontFamily: "Space Grotesk, sans-serif",
    textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6,
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(28,25,23,0.5)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "#fff", borderRadius: 12, width: 480, maxHeight: "90vh",
        overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid #e8e8e7",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Archive size={16} color="#f97316" />
            <span style={{ fontWeight: 700, fontSize: 14, fontFamily: "Space Grotesk, sans-serif", color: "#1c1917" }}>
              {isEdit ? "Editar Ativo" : "Novo Ativo"}
            </span>
          </div>
          <button onClick={onClose} data-testid="button-close-modal" style={{
            background: "none", border: "none", cursor: "pointer", color: "#78716c",
          }}>
            <X size={18} />
          </button>
        </div>
        {/* Body */}
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Name */}
          <div>
            <label style={LBL}>Nome / Descrição *</label>
            <input
              data-testid="input-asset-name"
              style={INP}
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Banner 3x1m — Sponsor A"
            />
          </div>
          {/* Quantity + Location */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LBL}>Quantidade</label>
              <input
                data-testid="input-asset-quantity"
                type="number" min={1} style={INP}
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: Math.max(1, parseInt(e.target.value) || 1) }))}
              />
            </div>
            <div>
              <label style={LBL}>Localização</label>
              <input
                data-testid="input-asset-location"
                style={INP}
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="Ex: Prateleira A3"
              />
            </div>
          </div>
          {/* Condition + Status */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LBL}>Condição</label>
              <select
                data-testid="select-asset-condition"
                style={{ ...INP, cursor: "pointer" }}
                value={form.condition}
                onChange={e => setForm(f => ({ ...f, condition: e.target.value as Condition }))}
              >
                {CONDITIONS.map(c => (
                  <option key={c} value={c}>{CONDITION_META[c].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={LBL}>Status</label>
              <select
                data-testid="select-asset-status"
                style={{ ...INP, cursor: "pointer" }}
                value={form.trackingStatus}
                onChange={e => setForm(f => ({ ...f, trackingStatus: e.target.value as TrackingStatus }))}
              >
                {ALL_STATUSES.map(s => (
                  <option key={s} value={s}>{STATUS_META[s].label}</option>
                ))}
              </select>
            </div>
          </div>
          {/* Franchise Tags */}
          <div>
            <label style={LBL}>Tags de Franquia</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                data-testid="input-asset-tag"
                style={{ ...INP, flex: 1 }}
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTag())}
                placeholder="Ex: flamengo, vasco"
              />
              <button onClick={addTag} data-testid="button-add-tag" style={{
                padding: "8px 12px", borderRadius: 6, border: "1px solid #e8e8e7",
                background: "#fafaf9", cursor: "pointer", color: "#1c1917", fontSize: 13,
              }}>
                <Plus size={14} />
              </button>
            </div>
            {form.franchiseTags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                {form.franchiseTags.map(t => (
                  <span key={t} style={{
                    display: "flex", alignItems: "center", gap: 4,
                    fontSize: 11, padding: "3px 8px", borderRadius: 4,
                    background: "#fff7ed", border: "1px solid #fed7aa", color: "#ea580c",
                  }}>
                    <Tag size={10} />
                    {t}
                    <button onClick={() => removeTag(t)} style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: "#ea580c", padding: 0, lineHeight: 1,
                    }}>
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          {/* Notes */}
          <div>
            <label style={LBL}>Observações</label>
            <textarea
              data-testid="input-asset-notes"
              style={{ ...INP, minHeight: 72, resize: "vertical" }}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Informações adicionais..."
            />
          </div>
        </div>
        {/* Footer */}
        <div style={{
          padding: "14px 20px", borderTop: "1px solid #e8e8e7",
          display: "flex", justifyContent: "flex-end", gap: 8,
        }}>
          <button onClick={onClose} style={{
            padding: "8px 18px", borderRadius: 6, border: "1px solid #e8e8e7",
            background: "#fafaf9", color: "#1c1917", fontSize: 13, cursor: "pointer",
            fontFamily: "Plus Jakarta Sans, sans-serif",
          }}>
            Cancelar
          </button>
          <button
            data-testid="button-save-asset"
            disabled={!form.name.trim() || mutation.isPending}
            onClick={() => mutation.mutate(form)}
            style={{
              padding: "8px 20px", borderRadius: 6, border: "none",
              background: !form.name.trim() ? "#e8e8e7" : "#f97316",
              color: !form.name.trim() ? "#a8a29e" : "#fff",
              fontSize: 13, cursor: !form.name.trim() ? "not-allowed" : "pointer",
              fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 600,
            }}
          >
            {mutation.isPending ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Estoque() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterCondition, setFilterCondition] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterAutoAdded, setFilterAutoAdded] = useState<boolean | null>(null);
  const [editing, setEditing] = useState<InventoryAsset | null | false>(false); // false=closed, null=new
  const [deleting, setDeleting] = useState<InventoryAsset | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const { data: assets = [], isLoading } = useQuery<InventoryAsset[]>({
    queryKey: ["/api/inventory"],
  });

  const { data: sponsors = [] } = useQuery<Sponsor[]>({
    queryKey: ["/api/sponsors"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/inventory/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Ativo excluído." });
      setDeleting(null);
    },
    onError: () => toast({ title: "Erro ao excluir.", variant: "destructive" }),
  });

  // ── Stats ──────────────────────────────────────────────────────────────────
  const total = assets.length;
  const noGalpao = assets.filter(a => a.trackingStatus === "NO_GALPAO").length;
  const emUso = assets.filter(a => a.trackingStatus === "EM_USO").length;
  const aguardando = assets.filter(a => a.trackingStatus === "AGUARDANDO_TRIAGEM").length;
  const descartados = assets.filter(a => a.trackingStatus === "DESCARTADO").length;
  const sucata = assets.filter(a => a.condition === "SUCATA").length;
  const autoAdded = assets.filter(a => a.autoAdded).length;

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = assets.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      a.name.toLowerCase().includes(q) ||
      a.displayId.toLowerCase().includes(q) ||
      (a.location ?? "").toLowerCase().includes(q) ||
      a.franchiseTags.some(t => t.toLowerCase().includes(q));
    const matchCondition = filterCondition === "all" || a.condition === filterCondition;
    const matchStatus = filterStatus === "all" || a.trackingStatus === filterStatus;
    const matchAuto =
      filterAutoAdded === null ||
      (filterAutoAdded ? a.autoAdded : !a.autoAdded);
    return matchSearch && matchCondition && matchStatus && matchAuto;
  });

  const HEADER: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em",
    color: "#a8a29e", fontFamily: "Space Grotesk, sans-serif", padding: "10px 12px",
    textAlign: "left", borderBottom: "1px solid #f0efed", whiteSpace: "nowrap",
  };
  const CELL: React.CSSProperties = {
    padding: "10px 12px", fontSize: 13, color: "#1c1917",
    fontFamily: "Plus Jakarta Sans, sans-serif", verticalAlign: "middle",
  };

  return (
    <div style={{ padding: "24px 32px", background: "#fafaf9", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, background: "#fff7ed",
            border: "1px solid #fed7aa", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Archive size={18} color="#f97316" />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", color: "#1c1917", margin: 0 }}>
              Acervo
            </h1>
            <p style={{ fontSize: 12, color: "#78716c", margin: 0, fontFamily: "Plus Jakarta Sans, sans-serif" }}>
              Módulo de Estoque & Logística Reversa
            </p>
          </div>
        </div>
        <button
          data-testid="button-new-asset"
          onClick={() => setEditing(null)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 16px", borderRadius: 8, border: "none",
            background: "#f97316", color: "#fff", fontSize: 13,
            cursor: "pointer", fontFamily: "Space Grotesk, sans-serif", fontWeight: 600,
          }}
        >
          <Plus size={15} />
          Novo Ativo
        </button>
      </div>

      {/* Stats cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total", value: total, Icon: Package, color: "#1c1917", bg: "#f0efed", border: "#e8e8e7" },
          { label: "No Galpão", value: noGalpao, Icon: Warehouse, color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
          { label: "Em Uso", value: emUso, Icon: Truck, color: "#ea580c", bg: "#fff7ed", border: "#fed7aa" },
          { label: "Aguard. Triagem", value: aguardando, Icon: ScanSearch, color: "#b45309", bg: "#fffbeb", border: "#fde68a" },
          { label: "Descartado", value: descartados, Icon: XCircle, color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" },
          { label: "Sucata", value: sucata, Icon: Flame, color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
        ].map(({ label, value, Icon, color, bg, border }) => (
          <div key={label} style={{
            background: "#fff", border: "1px solid #e8e8e7", borderRadius: 10,
            padding: "14px 16px", display: "flex", flexDirection: "column", gap: 4,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: "#78716c", fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {label}
              </span>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: bg, border: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon size={12} color={color} />
              </div>
            </div>
            <span style={{ fontSize: 22, fontWeight: 700, color: "#1c1917", fontFamily: "Space Grotesk, sans-serif" }}>
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{
        background: "#fff", border: "1px solid #e8e8e7", borderRadius: 10,
        padding: "12px 16px", marginBottom: 16,
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        {/* Search */}
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <Search size={14} color="#a8a29e" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input
            data-testid="input-search-assets"
            style={{
              width: "100%", paddingLeft: 30, paddingRight: 10, height: 36,
              border: "1px solid #e8e8e7", borderRadius: 8, fontSize: 13,
              background: "#fafaf9", color: "#1c1917", outline: "none", boxSizing: "border-box",
              fontFamily: "Plus Jakarta Sans, sans-serif",
            }}
            placeholder="Buscar por nome, ID, local ou tag..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <Filter size={14} color="#a8a29e" style={{ flexShrink: 0 }} />

        {/* Status filter */}
        <select
          data-testid="select-filter-status"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{
            height: 36, padding: "0 10px", borderRadius: 8, border: "1px solid #e8e8e7",
            fontSize: 13, background: "#fafaf9", color: "#1c1917", cursor: "pointer",
            fontFamily: "Plus Jakarta Sans, sans-serif",
          }}
        >
          <option value="all">Todos os status</option>
          {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>

        {/* Condition filter */}
        <select
          data-testid="select-filter-condition"
          value={filterCondition}
          onChange={e => setFilterCondition(e.target.value)}
          style={{
            height: 36, padding: "0 10px", borderRadius: 8, border: "1px solid #e8e8e7",
            fontSize: 13, background: "#fafaf9", color: "#1c1917", cursor: "pointer",
            fontFamily: "Plus Jakarta Sans, sans-serif",
          }}
        >
          <option value="all">Todas as condições</option>
          {CONDITIONS.map(c => <option key={c} value={c}>{CONDITION_META[c].label}</option>)}
        </select>

        {/* Auto-added filter */}
        <select
          data-testid="select-filter-auto"
          value={filterAutoAdded === null ? "all" : filterAutoAdded ? "auto" : "manual"}
          onChange={e => {
            const v = e.target.value;
            setFilterAutoAdded(v === "all" ? null : v === "auto");
          }}
          style={{
            height: 36, padding: "0 10px", borderRadius: 8, border: "1px solid #e8e8e7",
            fontSize: 13, background: "#fafaf9", color: "#1c1917", cursor: "pointer",
            fontFamily: "Plus Jakarta Sans, sans-serif",
          }}
        >
          <option value="all">Origem: Todos</option>
          <option value="auto">Adicionado pela Gráfica</option>
          <option value="manual">Cadastro manual</option>
        </select>

        {(search || filterCondition !== "all" || filterStatus !== "all" || filterAutoAdded !== null) && (
          <button
            data-testid="button-clear-filters"
            onClick={() => { setSearch(""); setFilterCondition("all"); setFilterStatus("all"); setFilterAutoAdded(null); }}
            style={{
              height: 36, padding: "0 12px", borderRadius: 8, border: "1px solid #e8e8e7",
              background: "#fafaf9", color: "#78716c", fontSize: 12, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            <X size={12} />
            Limpar
          </button>
        )}

        <span style={{ fontSize: 12, color: "#a8a29e", marginLeft: "auto", whiteSpace: "nowrap" }}>
          {filtered.length} de {total} itens
        </span>
      </div>

      {/* Table */}
      <div style={{
        background: "#fff", border: "1px solid #e8e8e7", borderRadius: 10, overflow: "hidden",
      }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#a8a29e", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
            Carregando acervo...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <Archive size={32} color="#e8e8e7" style={{ marginBottom: 8, display: "block", margin: "0 auto 8px" }} />
            <p style={{ fontSize: 14, color: "#a8a29e", fontFamily: "Plus Jakarta Sans, sans-serif", margin: 0 }}>
              Nenhum ativo encontrado.
            </p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#fafaf9" }}>
                <th style={HEADER}>ID</th>
                <th style={HEADER}>Nome</th>
                <th style={HEADER}>Status</th>
                <th style={HEADER}>Condição</th>
                <th style={HEADER}>Patrocinadores</th>
                <th style={HEADER}>Local</th>
                <th style={HEADER}>Tags</th>
                <th style={HEADER}>Arte</th>
                <th style={HEADER}>Origem</th>
                <th style={{ ...HEADER, textAlign: "right" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((asset, idx) => {
                const sm = STATUS_META[asset.trackingStatus ?? "NO_GALPAO"];
                const cm = CONDITION_META[asset.condition ?? "PERFEITO"];
                const StatusIcon = sm.Icon;
                const CondIcon = cm.Icon;
                const isHover = hoverId === asset.id;
                return (
                  <tr
                    key={asset.id}
                    data-testid={`row-asset-${asset.id}`}
                    onMouseEnter={() => setHoverId(asset.id)}
                    onMouseLeave={() => setHoverId(null)}
                    style={{
                      background: isHover ? "#fafaf9" : (idx % 2 === 0 ? "#fff" : "#fefefe"),
                      borderBottom: "1px solid #f0efed", transition: "background 0.1s",
                    }}
                  >
                    {/* ID */}
                    <td style={{ ...CELL }}>
                      <span style={{
                        fontFamily: "DM Mono, monospace", fontSize: 12,
                        color: "#78716c", letterSpacing: "0.03em",
                      }}>
                        {asset.displayId}
                      </span>
                    </td>
                    {/* Name */}
                    <td style={{ ...CELL, maxWidth: 200 }}>
                      <span style={{ fontWeight: 600, color: "#1c1917" }}>{asset.name}</span>
                      {asset.notes && (
                        <p style={{ fontSize: 11, color: "#a8a29e", margin: "2px 0 0", lineHeight: 1.3 }}>
                          {asset.notes}
                        </p>
                      )}
                    </td>
                    {/* Tracking Status */}
                    <td style={CELL}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        fontSize: 11, padding: "3px 8px", borderRadius: 5,
                        background: sm.bg, border: `1px solid ${sm.border}`, color: sm.color,
                        fontFamily: "Space Grotesk, sans-serif", fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}>
                        <StatusIcon size={10} />
                        {sm.label}
                      </span>
                    </td>
                    {/* Condition */}
                    <td style={CELL}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        fontSize: 11, padding: "3px 8px", borderRadius: 5,
                        background: cm.bg, border: `1px solid ${cm.border}`, color: cm.color,
                        fontFamily: "Space Grotesk, sans-serif", fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}>
                        <CondIcon size={10} />
                        {cm.label}
                      </span>
                    </td>
                    {/* Sponsors */}
                    <td style={{ ...CELL, maxWidth: 160 }}>
                      <SponsorChips sponsorIds={asset.sponsorIds ?? []} sponsors={sponsors} />
                    </td>
                    {/* Location */}
                    <td style={CELL}>
                      {asset.location ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#78716c" }}>
                          <MapPin size={11} color="#a8a29e" />
                          {asset.location}
                        </span>
                      ) : (
                        <span style={{ color: "#e8e8e7", fontSize: 12 }}>—</span>
                      )}
                    </td>
                    {/* Franchise Tags */}
                    <td style={{ ...CELL, maxWidth: 160 }}>
                      {asset.franchiseTags && asset.franchiseTags.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                          {asset.franchiseTags.map(t => (
                            <span key={t} style={{
                              fontSize: 10, padding: "2px 6px", borderRadius: 4,
                              background: "#fff7ed", border: "1px solid #fed7aa", color: "#ea580c",
                              fontFamily: "Plus Jakarta Sans, sans-serif", whiteSpace: "nowrap",
                            }}>
                              {t}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: "#e8e8e7", fontSize: 12 }}>—</span>
                      )}
                    </td>
                    {/* Approval thumb */}
                    <td style={CELL}>
                      {asset.approvalThumbUrl ? (
                        <ThumbPopover url={asset.approvalThumbUrl} />
                      ) : (
                        <span style={{ color: "#e8e8e7", fontSize: 12 }}>—</span>
                      )}
                    </td>
                    {/* Origin */}
                    <td style={CELL}>
                      {asset.autoAdded ? (
                        <span style={{
                          fontSize: 10, padding: "2px 6px", borderRadius: 4,
                          background: "#eff6ff", border: "1px solid #bfdbfe", color: "#2563eb",
                          fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                          letterSpacing: "0.05em", textTransform: "uppercase",
                        }}>
                          Auto
                        </span>
                      ) : (
                        <span style={{ color: "#a8a29e", fontSize: 11 }}>Manual</span>
                      )}
                    </td>
                    {/* Actions */}
                    <td style={{ ...CELL, textAlign: "right" }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                        <button
                          data-testid={`button-edit-asset-${asset.id}`}
                          onClick={() => setEditing(asset)}
                          style={{
                            width: 30, height: 30, borderRadius: 6, display: "flex",
                            alignItems: "center", justifyContent: "center",
                            border: "1px solid #e8e8e7", background: "#fafaf9", cursor: "pointer",
                            color: "#78716c", visibility: isHover ? "visible" : "hidden",
                          }}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          data-testid={`button-delete-asset-${asset.id}`}
                          onClick={() => setDeleting(asset)}
                          style={{
                            width: 30, height: 30, borderRadius: 6, display: "flex",
                            alignItems: "center", justifyContent: "center",
                            border: "1px solid #fecaca", background: "#fef2f2", cursor: "pointer",
                            color: "#dc2626", visibility: isHover ? "visible" : "hidden",
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {editing !== false && (
        <AssetModal
          asset={editing}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      )}
      {deleting && (
        <DeleteModal
          asset={deleting}
          onClose={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}
