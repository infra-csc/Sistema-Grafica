import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { InventoryAsset, Sponsor } from "@shared/schema";
import {
  Archive, Plus, Search, Pencil, Trash2, CheckCircle2, AlertTriangle,
  XCircle, MapPin, Tag, X, Package, Warehouse, Truck, ScanSearch, Flame,
  Filter,
} from "lucide-react";

// ─── Status meta ────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  NO_GALPAO:          { label: "No Galpão",      color: "#16a34a", bg: "rgba(22,163,74,0.10)",  Icon: Warehouse },
  EM_USO:             { label: "Em Uso",          color: "#ea580c", bg: "rgba(234,88,12,0.10)",  Icon: Truck },
  AGUARDANDO_TRIAGEM: { label: "Ag. Triagem",     color: "#b45309", bg: "rgba(180,83,9,0.10)",   Icon: ScanSearch },
  DESCARTADO:         { label: "Descartado",      color: "#6b7280", bg: "rgba(107,114,128,0.10)",Icon: XCircle },
};
const ALL_STATUSES = ["NO_GALPAO", "EM_USO", "AGUARDANDO_TRIAGEM", "DESCARTADO"] as const;
type TrackingStatus = typeof ALL_STATUSES[number];

// ─── Condition meta ─────────────────────────────────────────────────────────
const CONDITION_META: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  PERFEITO:    { label: "Perfeito",    color: "#16a34a", bg: "rgba(22,163,74,0.08)",  Icon: CheckCircle2 },
  AVARIA_LEVE: { label: "Avaria Leve", color: "#d97706", bg: "rgba(217,119,6,0.08)",  Icon: AlertTriangle },
  SUCATA:      { label: "Sucata",      color: "#dc2626", bg: "rgba(220,38,38,0.08)",  Icon: XCircle },
};
const CONDITIONS = ["PERFEITO", "AVARIA_LEVE", "SUCATA"] as const;
type Condition = typeof CONDITIONS[number];

// ─── Pill badge ─────────────────────────────────────────────────────────────
function Pill({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "3px 10px", borderRadius: 9999,
      fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
      fontFamily: "Space Grotesk, sans-serif",
      color, background: bg,
    }}>
      {label}
    </span>
  );
}

// ─── Sponsor avatar stack ───────────────────────────────────────────────────
function SponsorStack({ sponsorIds, sponsors }: { sponsorIds: string[]; sponsors: Sponsor[] }) {
  if (!sponsorIds || sponsorIds.length === 0)
    return <span style={{ color: "#cbd5e1", fontSize: 12 }}>—</span>;
  const matched = sponsorIds.map(id => sponsors.find(s => s.id === id)).filter(Boolean) as Sponsor[];
  const shown = matched.slice(0, 4);
  const extra = matched.length - shown.length;
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div style={{ display: "flex" }}>
        {shown.map((sp, i) => {
          const initials = sp.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
          const COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#06b6d4"];
          const bg = COLORS[i % COLORS.length] + "22";
          const fg = COLORS[i % COLORS.length];
          return (
            <div key={sp.id} title={sp.name} style={{
              width: 24, height: 24, borderRadius: "50%", border: "2px solid #fff",
              background: bg, marginLeft: i === 0 ? 0 : -8,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 8, fontWeight: 700, color: fg, fontFamily: "Space Grotesk, sans-serif",
              zIndex: shown.length - i,
            }}>
              {initials}
            </div>
          );
        })}
        {extra > 0 && (
          <div style={{
            width: 24, height: 24, borderRadius: "50%", border: "2px solid #fff",
            background: "#f1f5f9", marginLeft: -8,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 8, fontWeight: 700, color: "#64748b",
            fontFamily: "Space Grotesk, sans-serif",
          }}>
            +{extra}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Art thumbnail with popover ─────────────────────────────────────────────
function ArtThumb({ url }: { url: string }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <img src={url} alt="arte" style={{
        width: 32, height: 32, borderRadius: 6, objectFit: "cover",
        border: "1px solid #e2e8f0", cursor: "pointer", display: "block",
      }} />
      {show && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: 0,
          background: "#fff", borderRadius: 10, padding: 4,
          boxShadow: "0 12px 40px rgba(0,0,0,0.15)", zIndex: 9999,
          border: "1px solid #e2e8f0",
        }}>
          <img src={url} alt="preview" style={{ width: 192, height: 192, borderRadius: 6, objectFit: "cover", display: "block" }} />
          <p style={{ textAlign: "center", fontSize: 10, color: "#94a3b8", margin: "4px 0 0", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
            Arte aprovada
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Delete Modal ───────────────────────────────────────────────────────────
function DeleteModal({ asset, onClose, onConfirm }: {
  asset: InventoryAsset; onClose: () => void; onConfirm: () => void;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ background: "#fff", borderRadius: 16, width: 420, overflow: "hidden", boxShadow: "0 25px 60px rgba(0,0,0,0.2)" }}>
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
              padding: "8px 18px", borderRadius: 8, border: "1px solid #e2e8f0",
              background: "#f8fafc", color: "#1e293b", fontSize: 13, cursor: "pointer",
              fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 600,
            }}>Manter</button>
            <button onClick={onConfirm} data-testid="button-confirm-delete" style={{
              padding: "8px 18px", borderRadius: 8, border: "none",
              background: "#ef4444", color: "#fff", fontSize: 13, cursor: "pointer",
              fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 700,
            }}>Sim, Excluir</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Asset Modal ─────────────────────────────────────────────────────────────
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
    width: "100%", padding: "9px 12px", borderRadius: 10, border: "none",
    fontSize: 13, fontFamily: "Plus Jakarta Sans, sans-serif", background: "#f8fafc",
    color: "#1e293b", outline: "none", boxSizing: "border-box",
  };
  const LBL: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: "#94a3b8", fontFamily: "Space Grotesk, sans-serif",
    textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6,
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 20, width: 500, maxHeight: "90vh", overflow: "auto", boxShadow: "0 25px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "#fff7ed", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Archive size={16} color="#f97316" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, fontFamily: "Space Grotesk, sans-serif", color: "#0f172a" }}>
                {isEdit ? "Editar Ativo" : "Novo Ativo"}
              </h3>
              <p style={{ margin: 0, fontSize: 11, color: "#94a3b8", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                Acervo — Estoque & Logística
              </p>
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
                placeholder="Ex: flamengo, vasco — Enter para adicionar" />
              <button onClick={addTag} data-testid="button-add-tag" style={{
                width: 38, height: 38, borderRadius: 10, border: "none",
                background: "#f8fafc", cursor: "pointer", color: "#64748b",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}><Plus size={14} /></button>
            </div>
            {form.franchiseTags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                {form.franchiseTags.map(t => (
                  <span key={t} style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    fontSize: 11, padding: "3px 8px", borderRadius: 9999,
                    background: "#fff7ed", color: "#ea580c",
                    fontFamily: "Plus Jakarta Sans, sans-serif",
                  }}>
                    <Tag size={9} />{t}
                    <button onClick={() => removeTag(t)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ea580c", padding: 0, lineHeight: 1 }}>
                      <X size={9} />
                    </button>
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
          <button onClick={onClose} style={{
            padding: "9px 20px", borderRadius: 10, border: "none",
            background: "#f1f5f9", color: "#475569", fontSize: 13, cursor: "pointer",
            fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
          }}>Cancelar</button>
          <button data-testid="button-save-asset" disabled={!form.name.trim() || mutation.isPending}
            onClick={() => mutation.mutate(form)} style={{
              padding: "9px 24px", borderRadius: 10, border: "none",
              background: !form.name.trim() ? "#e2e8f0" : "#f97316",
              color: !form.name.trim() ? "#94a3b8" : "#fff",
              fontSize: 13, cursor: !form.name.trim() ? "not-allowed" : "pointer",
              fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
              boxShadow: form.name.trim() ? "0 4px 14px rgba(249,115,22,0.35)" : "none",
            }}>
            {mutation.isPending ? "Salvando..." : "Salvar Ativo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Estoque() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCondition, setFilterCondition] = useState("all");
  const [filterAutoAdded, setFilterAutoAdded] = useState("all");
  const [editing, setEditing] = useState<InventoryAsset | null | false>(false);
  const [deleting, setDeleting] = useState<InventoryAsset | null>(null);

  const { data: assets = [], isLoading } = useQuery<InventoryAsset[]>({ queryKey: ["/api/inventory"] });
  const { data: sponsors = [] } = useQuery<Sponsor[]>({ queryKey: ["/api/sponsors"] });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/inventory/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); toast({ title: "Ativo excluído." }); setDeleting(null); },
    onError: () => toast({ title: "Erro ao excluir.", variant: "destructive" }),
  });

  const total = assets.length;
  const byStatus = (s: string) => assets.filter(a => a.trackingStatus === s).length;
  const sucata = assets.filter(a => a.condition === "SUCATA").length;

  const filtered = assets.filter(a => {
    const q = search.toLowerCase();
    const ms = !q || a.name.toLowerCase().includes(q) || a.displayId.toLowerCase().includes(q) || (a.location ?? "").toLowerCase().includes(q) || a.franchiseTags.some(t => t.toLowerCase().includes(q));
    const mst = filterStatus === "all" || a.trackingStatus === filterStatus;
    const mc = filterCondition === "all" || a.condition === filterCondition;
    const ma = filterAutoAdded === "all" || (filterAutoAdded === "auto" ? a.autoAdded : !a.autoAdded);
    return ms && mst && mc && ma;
  });

  const STATS = [
    { key: "total",   label: "Total",         value: total,               color: "#3b82f6", icon: "📦", Icon: Package,   subtext: `${assets.filter(a=>a.autoAdded).length} automáticos` },
    { key: "galpao",  label: "No Galpão",      value: byStatus("NO_GALPAO"),           color: "#16a34a", Icon: Warehouse,  subtext: total ? `${Math.round(byStatus("NO_GALPAO")/total*100)}% disponível` : "0% disponível" },
    { key: "uso",     label: "Em Uso",          value: byStatus("EM_USO"),              color: "#ea580c", Icon: Truck,      subtext: "Ativos em campo" },
    { key: "triagem", label: "Ag. Triagem",     value: byStatus("AGUARDANDO_TRIAGEM"), color: "#b45309", Icon: ScanSearch, subtext: "Prioridade alta" },
    { key: "desc",    label: "Descartado",      value: byStatus("DESCARTADO"),          color: "#6b7280", Icon: XCircle,    subtext: "Logística reversa" },
    { key: "sucata",  label: "Sucata",          value: sucata,              color: "#dc2626", Icon: Flame,     subtext: "Perda total" },
  ];

  const TH: React.CSSProperties = {
    padding: "14px 20px", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em",
    textTransform: "uppercase", color: "#94a3b8", fontFamily: "Space Grotesk, sans-serif",
    textAlign: "left", background: "rgba(248,250,252,0.6)", borderBottom: "1px solid #f1f5f9",
    whiteSpace: "nowrap",
  };
  const TD: React.CSSProperties = {
    padding: "14px 20px", verticalAlign: "middle",
    fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 13, color: "#1e293b",
    borderBottom: "1px solid #f8fafc",
  };

  return (
    <div style={{ padding: "32px 36px", background: "#fafaf9", minHeight: "100vh" }}>

      {/* ── Page header ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: "#f97316", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Archive size={20} color="#fff" />
            </div>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, fontFamily: "Space Grotesk, sans-serif", color: "#0f172a", letterSpacing: "-0.02em" }}>
              Acervo
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#94a3b8", fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.15em" }}>
            Módulo de Estoque &amp; Logística Reversa
          </p>
        </div>
        <button data-testid="button-new-asset" onClick={() => setEditing(null)} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "12px 24px", borderRadius: 14, border: "none",
          background: "#f97316", color: "#fff", fontSize: 13, cursor: "pointer",
          fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, letterSpacing: "0.05em",
          boxShadow: "0 8px 24px rgba(249,115,22,0.3)",
        }}>
          <Plus size={16} />
          + NOVO ATIVO
        </button>
      </div>

      {/* ── Stats bento grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 16, marginBottom: 24 }}>
        {STATS.map(({ key, label, value, color, Icon, subtext }) => (
          <div key={key} style={{
            background: "#fff", padding: 20, borderRadius: 20,
            border: "1px solid #f1f5f9",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            transition: "border-color 0.2s, box-shadow 0.2s",
          }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLDivElement).style.borderColor = color + "33";
              (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 16px ${color}14`;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLDivElement).style.borderColor = "#f1f5f9";
              (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: color + "1a", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon size={16} color={color} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#cbd5e1", fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {label}
              </span>
            </div>
            <p style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 800, color: "#0f172a", fontFamily: "Space Grotesk, sans-serif", letterSpacing: "-0.02em" }}>
              {value.toLocaleString("pt-BR")}
            </p>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: color, fontFamily: "Space Grotesk, sans-serif" }}>
              {subtext}
            </p>
          </div>
        ))}
      </div>

      {/* ── Filter bar ── */}
      <div style={{
        background: "#fff", padding: "12px 16px", borderRadius: 16, border: "1px solid #f1f5f9",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)", marginBottom: 20,
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <Search size={14} color="#94a3b8" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
          <input data-testid="input-search-assets" style={{
            width: "100%", paddingLeft: 34, paddingRight: 12, height: 38,
            border: "none", borderRadius: 10, fontSize: 13,
            background: "#f8fafc", color: "#1e293b", outline: "none", boxSizing: "border-box",
            fontFamily: "Plus Jakarta Sans, sans-serif",
          }} placeholder="Buscar por ID, nome, local ou tag..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div style={{ width: 1, height: 28, background: "#f1f5f9" }} />

        {[
          { value: filterStatus,    onChange: setFilterStatus,    testId: "select-filter-status",    options: [["all","STATUS: TODOS"], ...ALL_STATUSES.map(s => [s, STATUS_META[s].label])] },
          { value: filterCondition, onChange: setFilterCondition, testId: "select-filter-condition", options: [["all","CONDIÇÃO: TODAS"], ...CONDITIONS.map(c => [c, CONDITION_META[c].label])] },
          { value: filterAutoAdded, onChange: setFilterAutoAdded, testId: "select-filter-auto",      options: [["all","ORIGEM: TODAS"],["auto","Gráfica (Auto)"],["manual","Manual"]] },
        ].map(({ value, onChange, testId, options }) => (
          <select key={testId} data-testid={testId} value={value} onChange={e => onChange(e.target.value)} style={{
            border: "none", borderRadius: 10, fontSize: 11, fontWeight: 700,
            fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.05em",
            padding: "9px 14px", background: "#f8fafc", color: "#475569",
            cursor: "pointer", outline: "none", textTransform: "uppercase",
          }}>
            {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ))}

        {(search || filterStatus !== "all" || filterCondition !== "all" || filterAutoAdded !== "all") && (
          <button data-testid="button-clear-filters" onClick={() => { setSearch(""); setFilterStatus("all"); setFilterCondition("all"); setFilterAutoAdded("all"); }} style={{
            display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", borderRadius: 10,
            border: "none", background: "#fef2f2", color: "#ef4444", fontSize: 11, cursor: "pointer",
            fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
          }}>
            <X size={11} /> Limpar
          </button>
        )}

        <span style={{ fontSize: 11, color: "#cbd5e1", fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, marginLeft: "auto", whiteSpace: "nowrap" }}>
          {filtered.length} / {total}
        </span>
      </div>

      {/* ── Table ── */}
      <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #f1f5f9", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        {isLoading ? (
          <div style={{ padding: 56, textAlign: "center", color: "#94a3b8", fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 14 }}>
            Carregando acervo...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 64, textAlign: "center" }}>
            <Archive size={36} color="#e2e8f0" style={{ margin: "0 auto 12px", display: "block" }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: "#94a3b8", fontFamily: "Space Grotesk, sans-serif", margin: 0 }}>Nenhum ativo encontrado</p>
            <p style={{ fontSize: 12, color: "#cbd5e1", fontFamily: "Plus Jakarta Sans, sans-serif", margin: "4px 0 0" }}>Ajuste os filtros ou adicione um novo ativo.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={TH}>Identificador</th>
                  <th style={TH}>Equipamento</th>
                  <th style={TH}>Status</th>
                  <th style={TH}>Condição</th>
                  <th style={TH}>Sponsors</th>
                  <th style={TH}>Localização</th>
                  <th style={TH}>Arte / Tags</th>
                  <th style={{ ...TH, textAlign: "center" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(asset => {
                  const sm = STATUS_META[asset.trackingStatus ?? "NO_GALPAO"];
                  const cm = CONDITION_META[asset.condition ?? "PERFEITO"];
                  return (
                    <tr key={asset.id} data-testid={`row-asset-${asset.id}`}
                      className="group"
                      style={{ transition: "background 0.1s" }}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "rgba(248,250,252,0.7)"}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ""}
                    >
                      {/* ID */}
                      <td style={TD}>
                        <span style={{ fontFamily: "DM Mono, monospace", fontSize: 12, fontWeight: 700, color: "#475569" }}>
                          {asset.displayId}
                        </span>
                      </td>

                      {/* Name + origin badge */}
                      <td style={TD}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                            background: asset.autoAdded ? "#eff6ff" : "#f8fafc",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            border: `1px solid ${asset.autoAdded ? "#bfdbfe" : "#e2e8f0"}`,
                          }}>
                            <span style={{
                              fontSize: 8, fontWeight: 800, fontFamily: "Space Grotesk, sans-serif",
                              letterSpacing: "0.05em", textTransform: "uppercase",
                              color: asset.autoAdded ? "#2563eb" : "#94a3b8",
                            }}>
                              {asset.autoAdded ? "AUTO" : "MAN"}
                            </span>
                          </div>
                          <div>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#0f172a", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                              {asset.name}
                            </p>
                            {asset.notes && (
                              <p style={{ margin: "2px 0 0", fontSize: 11, color: "#94a3b8", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                                {asset.notes.length > 45 ? asset.notes.slice(0, 45) + "…" : asset.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Status pill */}
                      <td style={TD}>
                        <Pill color={sm.color} bg={sm.bg} label={sm.label} />
                      </td>

                      {/* Condition pill */}
                      <td style={TD}>
                        <Pill color={cm.color} bg={cm.bg} label={cm.label} />
                      </td>

                      {/* Sponsors */}
                      <td style={TD}>
                        <SponsorStack sponsorIds={asset.sponsorIds ?? []} sponsors={sponsors} />
                      </td>

                      {/* Location */}
                      <td style={TD}>
                        {asset.location ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#64748b" }}>
                            <MapPin size={12} color="#94a3b8" />
                            <span style={{ fontSize: 12 }}>{asset.location}</span>
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
                                <span key={t} style={{
                                  padding: "2px 8px", borderRadius: 9999,
                                  background: "#fff7ed", color: "#f97316",
                                  fontSize: 9, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif",
                                  letterSpacing: "0.06em", textTransform: "uppercase",
                                }}>{t}</span>
                              ))}
                              {asset.franchiseTags.length > 2 && (
                                <span style={{ padding: "2px 8px", borderRadius: 9999, background: "#f8fafc", color: "#94a3b8", fontSize: 9, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif" }}>
                                  +{asset.franchiseTags.length - 2}
                                </span>
                              )}
                            </div>
                          ) : (!asset.approvalThumbUrl && <span style={{ color: "#e2e8f0", fontSize: 12 }}>—</span>)}
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ ...TD, textAlign: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                          <button data-testid={`button-edit-asset-${asset.id}`} onClick={() => setEditing(asset)} style={{
                            padding: 6, borderRadius: 8, border: "none", background: "transparent",
                            cursor: "pointer", color: "#94a3b8", display: "flex", alignItems: "center",
                            transition: "color 0.15s, background 0.15s",
                          }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#3b82f6"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(59,130,246,0.06)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                          >
                            <Pencil size={15} />
                          </button>
                          <button data-testid={`button-delete-asset-${asset.id}`} onClick={() => setDeleting(asset)} style={{
                            padding: 6, borderRadius: 8, border: "none", background: "transparent",
                            cursor: "pointer", color: "#94a3b8", display: "flex", alignItems: "center",
                            transition: "color 0.15s, background 0.15s",
                          }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.06)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing !== false && (
        <AssetModal asset={editing} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
      )}
      {deleting && (
        <DeleteModal asset={deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMutation.mutate(deleting.id)} />
      )}
    </div>
  );
}
