import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { InventoryAsset, Sponsor, Item, Event } from "@shared/schema";
import {
  Archive, Plus, Search, Pencil, Trash2, CheckCircle2, AlertTriangle,
  XCircle, MapPin, Tag, X, Package, Warehouse, Truck, ScanSearch, Flame,
} from "lucide-react";

// ─── Status meta ─────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  NO_GALPAO:          { label: "No Galpão",   color: "#16a34a", bg: "rgba(22,163,74,0.10)"  },
  EM_USO:             { label: "Em Uso",       color: "#ea580c", bg: "rgba(234,88,12,0.10)"  },
  AGUARDANDO_TRIAGEM: { label: "Ag. Triagem",  color: "#b45309", bg: "rgba(180,83,9,0.10)"   },
  DESCARTADO:         { label: "Descartado",   color: "#6b7280", bg: "rgba(107,114,128,0.10)"},
};
const ALL_STATUSES = ["NO_GALPAO", "EM_USO", "AGUARDANDO_TRIAGEM", "DESCARTADO"] as const;
type TrackingStatus = typeof ALL_STATUSES[number];

// ─── Condition meta ───────────────────────────────────────────────────────────
const CONDITION_META: Record<string, { label: string; color: string; bg: string }> = {
  PERFEITO:    { label: "Perfeito",    color: "#16a34a", bg: "rgba(22,163,74,0.08)"  },
  AVARIA_LEVE: { label: "Avaria Leve", color: "#d97706", bg: "rgba(217,119,6,0.08)"  },
  SUCATA:      { label: "Sucata",      color: "#dc2626", bg: "rgba(220,38,38,0.08)"  },
};
const CONDITIONS = ["PERFEITO", "AVARIA_LEVE", "SUCATA"] as const;
type Condition = typeof CONDITIONS[number];

// ─── Rounded-lg badge ────────────────────────────────────────────────────────
function Badge({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "4px 10px", borderRadius: 8,
      fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
      fontFamily: "Space Grotesk, sans-serif",
      color, background: bg, border: `1px solid ${color}22`,
    }}>
      {label}
    </span>
  );
}

// ─── Stat card with icon-fill-on-hover ───────────────────────────────────────
function StatCard({ label, value, Icon, color, subtext, subColor }: {
  label: string; value: number; Icon: React.ElementType;
  color: string; subtext: string; subColor?: string;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #fff 0%, #f8fafc 100%)",
        padding: 24, borderRadius: 20,
        border: `1px solid ${hov ? color + "44" : "rgba(226,232,240,0.7)"}`,
        boxShadow: hov ? `0 8px 24px ${color}18` : "0 1px 4px rgba(0,0,0,0.04)",
        transition: "border-color 0.2s, box-shadow 0.2s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div style={{
          padding: 10, borderRadius: 12,
          background: hov ? color : color + "18",
          transition: "background 0.2s",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={18} color={hov ? "#fff" : color} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.15em" }}>
          {label}
        </span>
      </div>
      <p style={{ margin: "0 0 6px", fontSize: 30, fontWeight: 700, color: "#0f172a", fontFamily: "Space Grotesk, sans-serif", letterSpacing: "-0.02em" }}>
        {value.toLocaleString("pt-BR")}
      </p>
      <p style={{ margin: 0, fontSize: 9, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", color: subColor ?? "#94a3b8" }}>
        {subtext}
      </p>
    </div>
  );
}

// ─── Sponsor avatar stack ─────────────────────────────────────────────────────
function SponsorStack({ sponsorIds, sponsors }: { sponsorIds: string[]; sponsors: Sponsor[] }) {
  if (!sponsorIds || sponsorIds.length === 0)
    return <span style={{ color: "#cbd5e1", fontSize: 12 }}>—</span>;
  const matched = sponsorIds.map(id => sponsors.find(s => s.id === id)).filter(Boolean) as Sponsor[];
  const shown = matched.slice(0, 4);
  const extra = matched.length - shown.length;
  const COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#06b6d4"];
  return (
    <div style={{ display: "flex" }}>
      {shown.map((sp, i) => {
        const initials = sp.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
        const fg = COLORS[i % COLORS.length];
        return (
          <div key={sp.id} title={sp.name} style={{
            width: 28, height: 28, borderRadius: "50%",
            border: "2px solid #fff", background: fg + "18",
            marginLeft: i === 0 ? 0 : -10,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 8, fontWeight: 700, color: fg,
            fontFamily: "Space Grotesk, sans-serif",
            boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
            zIndex: shown.length - i, position: "relative",
          }}>
            {initials}
          </div>
        );
      })}
      {extra > 0 && (
        <div style={{
          width: 28, height: 28, borderRadius: "50%", border: "2px solid #fff",
          background: "#f1f5f9", marginLeft: -10, position: "relative",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 8, fontWeight: 700, color: "#64748b", fontFamily: "Space Grotesk, sans-serif",
          boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
        }}>
          +{extra}
        </div>
      )}
    </div>
  );
}

// ─── Art thumbnail with hover popover ────────────────────────────────────────
function ArtThumb({ url }: { url: string }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-block", cursor: "zoom-in" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 8, overflow: "hidden",
        border: `2px solid ${show ? "rgba(37,99,235,0.3)" : "#e2e8f0"}`,
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        transition: "border-color 0.15s",
      }}>
        <img src={url} alt="arte" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
      {show && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 10px)", left: 0,
          background: "#fff", borderRadius: 12, padding: 6,
          boxShadow: "0 20px 60px rgba(0,0,0,0.18)", zIndex: 9999,
          border: "1px solid #e2e8f0",
          transform: "scale(1)", opacity: 1,
          transformOrigin: "bottom left",
        }}>
          <img src={url} alt="preview" style={{ width: 192, height: 192, borderRadius: 8, objectFit: "cover", display: "block" }} />
          <p style={{ textAlign: "center", fontSize: 10, color: "#94a3b8", margin: "5px 0 0", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
            Arte aprovada
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Delete Modal ─────────────────────────────────────────────────────────────
function DeleteModal({ asset, onClose, onConfirm }: {
  asset: InventoryAsset; onClose: () => void; onConfirm: () => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 20, width: 420, overflow: "hidden", boxShadow: "0 25px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ background: "#ef4444", padding: "16px 20px" }}>
          <p style={{ color: "#fff", fontWeight: 800, fontSize: 13, fontFamily: "Space Grotesk, sans-serif", margin: 0, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Atenção: Ação Irreversível
          </p>
        </div>
        <div style={{ padding: 24 }}>
          <p style={{ fontSize: 14, color: "#1e293b", margin: "0 0 8px", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
            Tem certeza que deseja excluir este ativo permanentemente?
          </p>
          <p style={{ fontSize: 12, color: "#64748b", fontFamily: "DM Mono, monospace", margin: "0 0 24px" }}>
            {asset.displayId} — {asset.name}
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={onClose} data-testid="button-cancel-delete" style={{
              padding: "9px 18px", borderRadius: 10, border: "1px solid #e2e8f0",
              background: "#f8fafc", color: "#1e293b", fontSize: 13, cursor: "pointer",
              fontFamily: "Space Grotesk, sans-serif", fontWeight: 600,
            }}>Manter</button>
            <button onClick={onConfirm} data-testid="button-confirm-delete" style={{
              padding: "9px 18px", borderRadius: 10, border: "none",
              background: "#ef4444", color: "#fff", fontSize: 13, cursor: "pointer",
              fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
            }}>Sim, Excluir</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Asset Modal ──────────────────────────────────────────────────────────────
function AssetModal({ asset, onClose, onSaved }: {
  asset: InventoryAsset | null; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!asset;
  const [form, setForm] = useState(asset ? {
    name: asset.name, quantity: asset.quantity ?? 1, location: asset.location ?? "",
    condition: (asset.condition as Condition) ?? "PERFEITO",
    franchiseTags: asset.franchiseTags ?? [],
    trackingStatus: (asset.trackingStatus as TrackingStatus) ?? "NO_GALPAO",
    notes: asset.notes ?? "",
  } : { name: "", quantity: 1, location: "", condition: "PERFEITO" as Condition, franchiseTags: [] as string[], trackingStatus: "NO_GALPAO" as TrackingStatus, notes: "" });
  const [tagInput, setTagInput] = useState("");

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      isEdit ? apiRequest("PATCH", `/api/inventory/${asset!.id}`, data) : apiRequest("POST", "/api/inventory", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); toast({ title: isEdit ? "Ativo atualizado." : "Ativo criado." }); onSaved(); },
    onError: () => toast({ title: "Erro ao salvar.", variant: "destructive" }),
  });

  const addTag = () => { const t = tagInput.trim(); if (t && !form.franchiseTags.includes(t)) setForm(f => ({ ...f, franchiseTags: [...f.franchiseTags, t] })); setTagInput(""); };
  const removeTag = (t: string) => setForm(f => ({ ...f, franchiseTags: f.franchiseTags.filter(x => x !== t) }));

  const INP: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 10, border: "none",
    fontSize: 13, fontFamily: "Plus Jakarta Sans, sans-serif", background: "#f8fafc",
    color: "#0f172a", outline: "none", boxSizing: "border-box",
  };
  const LBL: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: "#94a3b8", fontFamily: "Space Grotesk, sans-serif",
    textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6,
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 20, width: 500, maxHeight: "90vh", overflow: "auto", boxShadow: "0 25px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "#f97316", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(249,115,22,0.3)" }}>
              <Archive size={18} color="#fff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, fontFamily: "Space Grotesk, sans-serif", color: "#0f172a" }}>
                {isEdit ? "Editar Ativo" : "Novo Ativo"}
              </h3>
              <p style={{ margin: 0, fontSize: 11, color: "#94a3b8", fontFamily: "Plus Jakarta Sans, sans-serif" }}>Acervo — Estoque & Logística</p>
            </div>
          </div>
          <button onClick={onClose} data-testid="button-close-modal" style={{ background: "#f1f5f9", border: "none", width: 32, height: 32, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
            <X size={15} />
          </button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <label style={LBL}>Nome / Descrição *</label>
            <input data-testid="input-asset-name" style={INP} value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Banner 3×1m — Patrocinador A" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LBL}>Quantidade</label>
              <input data-testid="input-asset-quantity" type="number" min={1} style={INP}
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: Math.max(1, parseInt(e.target.value) || 1) }))} />
            </div>
            <div>
              <label style={LBL}>Localização</label>
              <input data-testid="input-asset-location" style={INP} value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="Ex: Prateleira A3" />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LBL}>Condição</label>
              <select data-testid="select-asset-condition" style={{ ...INP, cursor: "pointer" }}
                value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value as Condition }))}>
                {CONDITIONS.map(c => <option key={c} value={c}>{CONDITION_META[c].label}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Status</label>
              <select data-testid="select-asset-status" style={{ ...INP, cursor: "pointer" }}
                value={form.trackingStatus} onChange={e => setForm(f => ({ ...f, trackingStatus: e.target.value as TrackingStatus }))}>
                {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={LBL}>Tags de Franquia</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input data-testid="input-asset-tag" style={{ ...INP, flex: 1 }} value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTag())}
                placeholder="Ex: flamengo — Enter para adicionar" />
              <button onClick={addTag} data-testid="button-add-tag" style={{
                width: 40, height: 40, borderRadius: 10, border: "none",
                background: "#f1f5f9", cursor: "pointer", color: "#64748b",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}><Plus size={14} /></button>
            </div>
            {form.franchiseTags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                {form.franchiseTags.map(t => (
                  <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 8px", borderRadius: 9999, background: "#fff7ed", color: "#ea580c", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                    <Tag size={9} />{t}
                    <button onClick={() => removeTag(t)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ea580c", padding: 0 }}><X size={9} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <label style={LBL}>Observações</label>
            <textarea data-testid="input-asset-notes" style={{ ...INP, minHeight: 72, resize: "vertical" as const }}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Informações adicionais..." />
          </div>
        </div>
        <div style={{ padding: "16px 24px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#f1f5f9", color: "#475569", fontSize: 13, cursor: "pointer", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700 }}>Cancelar</button>
          <button data-testid="button-save-asset" disabled={!form.name.trim() || mutation.isPending}
            onClick={() => mutation.mutate(form)} style={{
              padding: "10px 24px", borderRadius: 10, border: "none",
              background: !form.name.trim() ? "#e2e8f0" : "#f97316",
              color: !form.name.trim() ? "#94a3b8" : "#fff",
              fontSize: 13, cursor: !form.name.trim() ? "not-allowed" : "pointer",
              fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
              boxShadow: form.name.trim() ? "0 4px 14px rgba(249,115,22,0.35)" : "none",
            }}>
            {mutation.isPending ? "Salvando..." : "+ SALVAR ATIVO"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Estoque() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCondition, setFilterCondition] = useState("all");
  const [filterAutoAdded, setFilterAutoAdded] = useState("all");
  const [filterEvent, setFilterEvent] = useState("all");
  const [filterSponsor, setFilterSponsor] = useState("all");
  const [editing, setEditing] = useState<InventoryAsset | null | false>(false);
  const [deleting, setDeleting] = useState<InventoryAsset | null>(null);

  const { data: assets = [], isLoading } = useQuery<InventoryAsset[]>({ queryKey: ["/api/inventory"] });
  const { data: sponsors = [] } = useQuery<Sponsor[]>({ queryKey: ["/api/sponsors"] });
  const { data: allItems = [] } = useQuery<Item[]>({ queryKey: ["/api/items"] });
  const { data: allEvents = [] } = useQuery<Event[]>({ queryKey: ["/api/events"] });

  // Map assetId → eventName via originalItemId → item → event
  const assetEventMap = useMemo(() => {
    const itemMap = Object.fromEntries(allItems.map(i => [i.id, i]));
    const eventMap = Object.fromEntries(allEvents.map(e => [e.id, e]));
    const map: Record<string, { id: string; name: string }> = {};
    for (const asset of assets) {
      if (!asset.originalItemId) continue;
      const item = itemMap[asset.originalItemId];
      if (!item) continue;
      const event = eventMap[item.eventId];
      if (event) map[asset.id] = { id: event.id, name: event.name };
    }
    return map;
  }, [assets, allItems, allEvents]);

  // Unique events that appear in the current asset list
  const eventOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const v of Object.values(assetEventMap)) seen.set(v.id, v.name);
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [assetEventMap]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/inventory/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); toast({ title: "Ativo excluído." }); setDeleting(null); },
    onError: () => toast({ title: "Erro ao excluir.", variant: "destructive" }),
  });

  // Assets that have been triaged (not awaiting triage) — these belong to the acervo
  const acervoAssets = assets.filter(a => a.trackingStatus !== "AGUARDANDO_TRIAGEM");
  const triageCount = assets.filter(a => a.trackingStatus === "AGUARDANDO_TRIAGEM").length;

  const total = acervoAssets.length;
  const byStatus = (s: string) => acervoAssets.filter(a => a.trackingStatus === s).length;
  const sucata = acervoAssets.filter(a => a.condition === "SUCATA").length;
  const autoCount = acervoAssets.filter(a => a.autoAdded).length;

  const filtered = acervoAssets.filter(a => {
    const q = search.toLowerCase();
    const ms = !q || a.name.toLowerCase().includes(q) || a.displayId.toLowerCase().includes(q) || (a.location ?? "").toLowerCase().includes(q) || a.franchiseTags.some(t => t.toLowerCase().includes(q));
    const mst = filterStatus === "all" || a.trackingStatus === filterStatus;
    const mc = filterCondition === "all" || a.condition === filterCondition;
    const ma = filterAutoAdded === "all" || (filterAutoAdded === "auto" ? a.autoAdded : !a.autoAdded);
    const me = filterEvent === "all" || assetEventMap[a.id]?.id === filterEvent;
    const msp = filterSponsor === "all" || (a.sponsorIds ?? []).includes(filterSponsor);
    return ms && mst && mc && ma && me && msp;
  });

  const hasFilters = !!(search || filterStatus !== "all" || filterCondition !== "all" || filterAutoAdded !== "all" || filterEvent !== "all" || filterSponsor !== "all");

  const TH: React.CSSProperties = {
    padding: "18px 24px", fontSize: 10, fontWeight: 700, letterSpacing: "0.2em",
    textTransform: "uppercase", color: "#94a3b8", fontFamily: "Space Grotesk, sans-serif",
    textAlign: "left", background: "rgba(248,250,252,0.8)", borderBottom: "1px solid #e2e8f0",
    whiteSpace: "nowrap",
  };
  const TD: React.CSSProperties = {
    padding: "18px 24px", verticalAlign: "middle",
    fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 13, color: "#0f172a",
    borderBottom: "1px solid rgba(241,245,249,0.8)",
  };

  return (
    <div style={{ padding: "32px 36px", background: "#f8fafc", minHeight: "100vh" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 18, background: "#f97316", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 16px 40px rgba(249,115,22,0.28)" }}>
            <Archive size={24} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: "0 0 4px", fontSize: 30, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", color: "#0f172a", letterSpacing: "-0.02em", lineHeight: 1 }}>
              Acervo
            </h1>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#94a3b8", fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.15em" }}>
              Módulo de Estoque &amp; Logística Reversa
            </p>
          </div>
        </div>
        <button data-testid="button-new-asset" onClick={() => setEditing(null)} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "14px 28px", borderRadius: 16, border: "none",
          background: "#2563eb", color: "#fff", fontSize: 13, cursor: "pointer",
          fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, letterSpacing: "0.08em",
          boxShadow: "0 8px 24px rgba(37,99,235,0.35)",
        }}>
          <Plus size={16} />
          + NOVO ATIVO
        </button>
      </div>

      {/* ── Stat cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 16, marginBottom: 28 }}>
        <StatCard label="Total"       value={total}                 Icon={Package}   color="#2563eb" subtext={`${autoCount} via gráfica`} />
        <StatCard label="Galpão"      value={byStatus("NO_GALPAO")} Icon={Warehouse} color="#16a34a" subtext={total ? `${Math.round(byStatus("NO_GALPAO")/total*100)}% disponível` : "0% disponível"} subColor="#16a34a" />
        <StatCard label="Em Uso"      value={byStatus("EM_USO")}    Icon={Truck}     color="#ea580c" subtext="Frota ativa" />
        {/* Card clicável → navega para Triagem */}
        <div onClick={() => navigate("/triagem-retorno")} style={{ cursor: triageCount > 0 ? "pointer" : "default" }}>
          <StatCard label="Ag. Triagem" value={triageCount} Icon={ScanSearch} color="#b45309" subtext={triageCount > 0 ? "Ir para triagem →" : "Nenhum pendente"} subColor={triageCount > 0 ? "#b45309" : "#94a3b8"} />
        </div>
        <StatCard label="Descartado"  value={byStatus("DESCARTADO")} Icon={XCircle}  color="#6b7280" subtext="Logística reversa" />
        <StatCard label="Sucata"      value={sucata}                  Icon={Flame}    color="#dc2626" subtext="Perda total" subColor="#dc2626" />
      </div>

      {/* ── Filter bar ── */}
      <div style={{
        background: "#fff", padding: "12px 16px", borderRadius: 20,
        border: "1px solid #e2e8f0",
        boxShadow: "0 4px 20px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)",
        marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ position: "relative", flex: 1, minWidth: 260 }}>
          <Search size={16} color="#94a3b8" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
          <input data-testid="input-search-assets" style={{
            width: "100%", paddingLeft: 40, paddingRight: 14, height: 42,
            border: "none", borderRadius: 12, fontSize: 13, fontWeight: 500,
            background: "#f8fafc", color: "#0f172a", outline: "none", boxSizing: "border-box",
            fontFamily: "Plus Jakarta Sans, sans-serif",
          }} placeholder="Buscar por ID, nome, local ou tag..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div style={{ width: 1, height: 32, background: "#f1f5f9" }} />

        {[
          { val: filterStatus,    fn: setFilterStatus,    opts: [["all","STATUS: TODOS"], ...ALL_STATUSES.filter(s => s !== "AGUARDANDO_TRIAGEM").map(s => [s, STATUS_META[s].label])] },
          { val: filterCondition, fn: setFilterCondition, opts: [["all","CONDIÇÃO: TODA"], ...CONDITIONS.map(c => [c, CONDITION_META[c].label])] },
          { val: filterAutoAdded, fn: setFilterAutoAdded, opts: [["all","ORIGEM: TODAS"],["auto","Gráfica (Auto)"],["manual","Manual"]] },
        ].map(({ val, fn, opts }, i) => (
          <select key={i} value={val} onChange={e => fn(e.target.value)} style={{
            border: "none", borderRadius: 12, fontSize: 11, fontWeight: 700,
            fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.08em",
            padding: "10px 14px", background: "#f8fafc", color: "#475569",
            cursor: "pointer", outline: "none", textTransform: "uppercase",
          }}>
            {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ))}

        {/* Filtro por Evento */}
        <select
          data-testid="select-filter-event"
          value={filterEvent}
          onChange={e => setFilterEvent(e.target.value)}
          style={{
            border: "none", borderRadius: 12, fontSize: 11, fontWeight: 700,
            fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.08em",
            padding: "10px 14px",
            background: filterEvent !== "all" ? "#f0f4ff" : "#f8fafc",
            color: filterEvent !== "all" ? "#4338ca" : "#475569",
            cursor: "pointer", outline: "none", textTransform: "uppercase",
          }}
        >
          <option value="all">EVENTO: TODOS</option>
          {eventOptions.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>

        {/* Filtro por Patrocinador */}
        <select
          data-testid="select-filter-sponsor"
          value={filterSponsor}
          onChange={e => setFilterSponsor(e.target.value)}
          style={{
            border: "none", borderRadius: 12, fontSize: 11, fontWeight: 700,
            fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.08em",
            padding: "10px 14px",
            background: filterSponsor !== "all" ? "#faf5ff" : "#f8fafc",
            color: filterSponsor !== "all" ? "#7c3aed" : "#475569",
            cursor: "pointer", outline: "none", textTransform: "uppercase",
          }}
        >
          <option value="all">PATROCINADOR: TODOS</option>
          {sponsors.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <div style={{ width: 1, height: 32, background: "#f1f5f9" }} />

        {hasFilters && (
          <button data-testid="button-clear-filters" onClick={() => { setSearch(""); setFilterStatus("all"); setFilterCondition("all"); setFilterAutoAdded("all"); setFilterEvent("all"); setFilterSponsor("all"); }} style={{
            display: "flex", alignItems: "center", gap: 4, padding: "9px 12px", borderRadius: 10,
            border: "none", background: "#fef2f2", color: "#ef4444", fontSize: 11, cursor: "pointer",
            fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
          }}>
            <X size={11} /> Limpar
          </button>
        )}

        <span style={{ fontSize: 10, color: "#cbd5e1", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, marginLeft: "auto", whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          {filtered.length} / {total} registros
        </span>
      </div>

      {/* ── Table ── */}
      <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.06)" }}>
        {isLoading ? (
          <div style={{ padding: 60, textAlign: "center", color: "#94a3b8", fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 14 }}>
            Carregando acervo...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 72, textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: "#f8fafc", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <Archive size={24} color="#cbd5e1" />
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "0 0 6px", fontFamily: "Space Grotesk, sans-serif" }}>Nenhum ativo encontrado</p>
            <p style={{ fontSize: 12, color: "#94a3b8", fontFamily: "Plus Jakarta Sans, sans-serif", margin: 0 }}>Ajuste os filtros ou adicione um novo ativo.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr>
                  {["Identificador","Equipamento","Status","Condição","Sponsors","Localização","Arte / Tags","Ações"].map((h, i) => (
                    <th key={h} style={{ ...TH, textAlign: i === 7 ? "center" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(asset => {
                  const sm = STATUS_META[asset.trackingStatus ?? "NO_GALPAO"];
                  const cm = CONDITION_META[asset.condition ?? "PERFEITO"];
                  return (
                    <tr key={asset.id} data-testid={`row-asset-${asset.id}`}
                      className="group"
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "rgba(248,250,252,0.6)"}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ""}
                      style={{ transition: "background 0.1s" }}
                    >
                      {/* ID pill */}
                      <td style={TD}>
                        <span style={{ fontFamily: "DM Mono, monospace", fontSize: 12, fontWeight: 700, color: "#64748b", background: "rgba(241,245,249,0.7)", padding: "3px 8px", borderRadius: 6, display: "inline-block" }}>
                          {asset.displayId}
                        </span>
                      </td>

                      {/* Name + origem badge */}
                      <td style={TD}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div
                            title={asset.autoAdded ? "Criado automaticamente pela gráfica ao marcar item como produzido" : "Adicionado manualmente"}
                            style={{
                              height: 32, borderRadius: 8, flexShrink: 0, padding: "0 8px",
                              background: asset.autoAdded ? "rgba(37,99,235,0.08)" : "#f1f5f9",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              border: `1px solid ${asset.autoAdded ? "rgba(37,99,235,0.18)" : "#e2e8f0"}`,
                            }}>
                            <span style={{ fontSize: 8, fontWeight: 800, fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.04em", textTransform: "uppercase", color: asset.autoAdded ? "#2563eb" : "#94a3b8", whiteSpace: "nowrap" }}>
                              {asset.autoAdded ? "GRÁFICA" : "MANUAL"}
                            </span>
                          </div>
                          <div>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#0f172a", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                              {asset.name}
                            </p>
                            {asset.notes && (
                              <p style={{ margin: "2px 0 0", fontSize: 10, color: "#94a3b8", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                                {asset.notes.length > 45 ? asset.notes.slice(0, 45) + "…" : asset.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td style={TD}><Badge color={sm.color} bg={sm.bg} label={sm.label} /></td>

                      {/* Condition */}
                      <td style={TD}><Badge color={cm.color} bg={cm.bg} label={cm.label} /></td>

                      {/* Sponsors */}
                      <td style={TD}><SponsorStack sponsorIds={asset.sponsorIds ?? []} sponsors={sponsors} /></td>

                      {/* Location */}
                      <td style={TD}>
                        {asset.location ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#64748b" }}>
                            <MapPin size={12} color="#94a3b8" />
                            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.05em" }}>{asset.location}</span>
                          </div>
                        ) : <span style={{ color: "#e2e8f0", fontSize: 12 }}>—</span>}
                      </td>

                      {/* Art + Tags */}
                      <td style={TD}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {asset.approvalThumbUrl && <ArtThumb url={asset.approvalThumbUrl} />}
                          {asset.franchiseTags && asset.franchiseTags.length > 0 ? (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                              {asset.franchiseTags.slice(0, 2).map(t => (
                                <span key={t} style={{ padding: "2px 7px", borderRadius: 6, background: "rgba(251,146,60,0.08)", color: "#f97316", fontSize: 9, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", border: "1px solid rgba(251,146,60,0.15)" }}>{t}</span>
                              ))}
                              {asset.franchiseTags.length > 2 && (
                                <span style={{ padding: "2px 7px", borderRadius: 6, background: "#f8fafc", color: "#94a3b8", fontSize: 9, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif" }}>+{asset.franchiseTags.length - 2}</span>
                              )}
                            </div>
                          ) : (!asset.approvalThumbUrl && <span style={{ color: "#e2e8f0", fontSize: 12 }}>—</span>)}
                        </div>
                      </td>

                      {/* Actions — opacity-0, visible on row hover */}
                      <td style={{ ...TD, textAlign: "center" }}>
                        <div className="group-row-actions" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2, opacity: 0, transition: "opacity 0.15s" }}>
                          <button data-testid={`button-edit-asset-${asset.id}`} onClick={() => setEditing(asset)}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#2563eb"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(37,99,235,0.08)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                            style={{ padding: 8, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8", display: "flex", alignItems: "center", transition: "color 0.15s, background 0.15s" }}>
                            <Pencil size={15} />
                          </button>
                          <button data-testid={`button-delete-asset-${asset.id}`} onClick={() => setDeleting(asset)}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.08)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                            style={{ padding: 8, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8", display: "flex", alignItems: "center", transition: "color 0.15s, background 0.15s" }}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Table footer */}
            <div style={{ padding: "16px 24px", background: "rgba(248,250,252,0.8)", borderTop: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.15em", color: "#94a3b8" }}>
                Exibindo <span style={{ color: "#0f172a" }}>{filtered.length}</span> de <span style={{ color: "#0f172a" }}>{total}</span> registros
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Hover-show actions via CSS injection */}
      <style>{`tr:hover .group-row-actions { opacity: 1 !important; }`}</style>

      {editing !== false && (
        <AssetModal asset={editing} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
      )}
      {deleting && (
        <DeleteModal asset={deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMutation.mutate(deleting.id)} />
      )}
    </div>
  );
}
