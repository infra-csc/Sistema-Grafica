import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { InventoryAsset } from "@shared/schema";
import {
  Archive, Plus, Search, Filter, RefreshCw, Pencil, Trash2,
  CheckCircle2, AlertTriangle, XCircle, MapPin, Tag, X,
} from "lucide-react";

// ── helpers ────────────────────────────────────────────────────────────────────
const CONDITION_META: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  PERFEITO:    { label: "Perfeito",     color: "#16a34a", bg: "#f0fdf4", Icon: CheckCircle2 },
  AVARIA_LEVE: { label: "Avaria Leve",  color: "#d97706", bg: "#fffbeb", Icon: AlertTriangle },
  SUCATA:      { label: "Sucata",       color: "#dc2626", bg: "#fef2f2", Icon: XCircle },
};

const CONDITIONS = ["PERFEITO", "AVARIA_LEVE", "SUCATA"] as const;
type Condition = typeof CONDITIONS[number];

const EMPTY_FORM = {
  name: "",
  location: "",
  condition: "PERFEITO" as Condition,
  franchiseTags: [] as string[],
  available: true,
  notes: "",
  originalItemId: null as string | null,
};

// ── Modal ─────────────────────────────────────────────────────────────────────
function AssetModal({
  asset,
  onClose,
  onSaved,
}: {
  asset: InventoryAsset | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState(
    asset
      ? {
          name: asset.name,
          location: asset.location ?? "",
          condition: (asset.condition as Condition) ?? "PERFEITO",
          franchiseTags: asset.franchiseTags ?? [],
          available: asset.available ?? true,
          notes: asset.notes ?? "",
          originalItemId: asset.originalItemId,
        }
      : { ...EMPTY_FORM }
  );
  const [tagInput, setTagInput] = useState("");
  const [hoverId, setHoverId] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", "/api/inventory", data),
    onSuccess: () => { onSaved(); toast({ title: "Peça adicionada ao acervo." }); },
    onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: (data: typeof form) => apiRequest("PATCH", `/api/inventory/${asset!.id}`, data),
    onSuccess: () => { onSaved(); toast({ title: "Peça atualizada." }); },
    onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
  });

  function addTag() {
    const t = tagInput.trim();
    if (t && !form.franchiseTags.includes(t)) {
      setForm(f => ({ ...f, franchiseTags: [...f.franchiseTags, t] }));
    }
    setTagInput("");
  }

  function removeTag(t: string) {
    setForm(f => ({ ...f, franchiseTags: f.franchiseTags.filter(x => x !== t) }));
  }

  function handleSubmit() {
    if (!form.name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    asset ? updateMut.mutate(form) : createMut.mutate(form);
  }

  const isPending = createMut.isPending || updateMut.isPending;

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: "1.5px solid #e8e8e7",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 13.5,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    color: "#1c1917",
    backgroundColor: "#fff",
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "#78716c",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    display: "block",
    marginBottom: 6,
    fontFamily: "'Space Grotesk', sans-serif",
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        backgroundColor: "rgba(28,25,23,0.45)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 100, padding: 24,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff", borderRadius: 16,
        width: "100%", maxWidth: 520,
        boxShadow: "0 24px 64px -12px rgba(28,25,23,0.22)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 24px 16px",
          borderBottom: "1px solid #f3f4f3",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 34, height: 34,
              backgroundColor: "#fff7ed",
              borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Archive style={{ width: 17, height: 17, color: "#f97316" }} />
            </div>
            <div>
              <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 14, color: "#1c1917", margin: 0 }}>
                {asset ? "Editar Peça" : "Nova Peça de Acervo"}
              </p>
              <p style={{ fontSize: 12, color: "#a8a29e", margin: 0 }}>
                {asset ? asset.displayId : "Preencha os dados abaixo"}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#a8a29e", padding: 4, borderRadius: 6 }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16, maxHeight: "70vh", overflowY: "auto" }}>
          {/* Nome */}
          <div>
            <label style={labelStyle}>Nome da Peça *</label>
            <input
              style={inputStyle}
              placeholder="Ex: Banner 3x2m — Sponser A"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              data-testid="input-asset-name"
            />
          </div>

          {/* Localização */}
          <div>
            <label style={labelStyle}>Localização</label>
            <input
              style={inputStyle}
              placeholder="Ex: Galpão A — Prateleira 3"
              value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              data-testid="input-asset-location"
            />
          </div>

          {/* Condição */}
          <div>
            <label style={labelStyle}>Condição</label>
            <div style={{ display: "flex", gap: 8 }}>
              {CONDITIONS.map(c => {
                const meta = CONDITION_META[c];
                const active = form.condition === c;
                return (
                  <button
                    key={c}
                    onClick={() => setForm(f => ({ ...f, condition: c }))}
                    data-testid={`button-condition-${c.toLowerCase()}`}
                    style={{
                      flex: 1,
                      padding: "8px 4px",
                      borderRadius: 8,
                      border: `2px solid ${active ? meta.color : "#e8e8e7"}`,
                      backgroundColor: active ? meta.bg : "#fafaf9",
                      cursor: "pointer",
                      display: "flex", flexDirection: "column",
                      alignItems: "center", gap: 4,
                      transition: "all 0.15s",
                    }}
                  >
                    <meta.Icon style={{ width: 16, height: 16, color: active ? meta.color : "#a8a29e" }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: active ? meta.color : "#78716c", fontFamily: "'Space Grotesk', sans-serif" }}>
                      {meta.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Franquia tags */}
          <div>
            <label style={labelStyle}>Tags de Franquia</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                style={{ ...inputStyle, flex: 1 }}
                placeholder="Ex: fla, corinthians, nba…"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                data-testid="input-franchise-tag"
              />
              <button
                onClick={addTag}
                data-testid="button-add-tag"
                style={{
                  padding: "9px 14px",
                  backgroundColor: "#f97316",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "'Space Grotesk', sans-serif",
                  whiteSpace: "nowrap",
                }}
              >
                Adicionar
              </button>
            </div>
            {form.franchiseTags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {form.franchiseTags.map(t => (
                  <span key={t} style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "3px 10px",
                    backgroundColor: "#fff7ed",
                    border: "1px solid #fed7aa",
                    borderRadius: 20,
                    fontSize: 12,
                    color: "#c2410c",
                    fontWeight: 500,
                  }}>
                    {t}
                    <button onClick={() => removeTag(t)} style={{ background: "none", border: "none", cursor: "pointer", color: "#c2410c", padding: 0, lineHeight: 1 }}>
                      <X style={{ width: 10, height: 10 }} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Disponível */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => setForm(f => ({ ...f, available: !f.available }))}
              data-testid="button-toggle-available"
              style={{
                width: 38, height: 22,
                borderRadius: 11,
                backgroundColor: form.available ? "#f97316" : "#e8e8e7",
                border: "none",
                cursor: "pointer",
                position: "relative",
                transition: "background-color 0.2s",
                flexShrink: 0,
              }}
            >
              <span style={{
                position: "absolute",
                top: 3,
                left: form.available ? 18 : 3,
                width: 16, height: 16,
                borderRadius: "50%",
                backgroundColor: "white",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                transition: "left 0.2s",
              }} />
            </button>
            <span style={{ fontSize: 13, color: "#78716c", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              {form.available ? "Disponível para alocação" : "Indisponível (em uso ou reservado)"}
            </span>
          </div>

          {/* Observações */}
          <div>
            <label style={labelStyle}>Observações</label>
            <textarea
              style={{ ...inputStyle, resize: "vertical", minHeight: 72 } as React.CSSProperties}
              placeholder="Notas adicionais sobre a peça…"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              data-testid="input-asset-notes"
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 24px",
          borderTop: "1px solid #f3f4f3",
          display: "flex", gap: 10, justifyContent: "flex-end",
        }}>
          <button
            onClick={onClose}
            style={{
              padding: "9px 20px",
              border: "1.5px solid #e8e8e7",
              borderRadius: 8,
              backgroundColor: "#fff",
              fontSize: 13.5,
              fontWeight: 600,
              color: "#78716c",
              cursor: "pointer",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            data-testid="button-save-asset"
            style={{
              padding: "9px 24px",
              border: "none",
              borderRadius: 8,
              backgroundColor: isPending ? "#fed7aa" : "#f97316",
              color: "white",
              fontSize: 13.5,
              fontWeight: 600,
              cursor: isPending ? "not-allowed" : "pointer",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            {isPending ? "Salvando…" : asset ? "Salvar Alterações" : "Adicionar ao Acervo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm ────────────────────────────────────────────────────────────
function DeleteModal({
  asset,
  onClose,
  onDeleted,
}: {
  asset: InventoryAsset;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const deleteMut = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/inventory/${asset.id}`, undefined),
    onSuccess: () => { onDeleted(); toast({ title: "Peça removida do acervo." }); },
    onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }),
  });

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        backgroundColor: "rgba(28,25,23,0.5)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 200, padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff", borderRadius: 16,
        width: "100%", maxWidth: 420,
        boxShadow: "0 24px 64px -12px rgba(28,25,23,0.22)",
        overflow: "hidden",
      }}>
        <div style={{ backgroundColor: "#ef4444", padding: "14px 20px" }}>
          <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 14, color: "white", margin: 0 }}>
            Atenção: Ação Irreversível
          </p>
        </div>
        <div style={{ padding: 24 }}>
          <p style={{ fontSize: 14, color: "#1c1917", margin: "0 0 8px" }}>
            Tem certeza que deseja remover <strong>{asset.name}</strong> do acervo?
          </p>
          <p style={{ fontSize: 12.5, color: "#a8a29e", margin: 0 }}>
            {asset.displayId} · Esta ação não pode ser desfeita.
          </p>
        </div>
        <div style={{ padding: "0 24px 20px", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "9px 20px", border: "1.5px solid #e8e8e7", borderRadius: 8,
              backgroundColor: "#fff", fontSize: 13.5, fontWeight: 600, color: "#78716c",
              cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            Manter
          </button>
          <button
            onClick={() => deleteMut.mutate()}
            disabled={deleteMut.isPending}
            data-testid="button-confirm-delete-asset"
            style={{
              padding: "9px 20px", border: "none", borderRadius: 8,
              backgroundColor: deleteMut.isPending ? "#fca5a5" : "#ef4444",
              color: "white", fontSize: 13.5, fontWeight: 600,
              cursor: deleteMut.isPending ? "not-allowed" : "pointer",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            {deleteMut.isPending ? "Excluindo…" : "Sim, Excluir"}
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
  const [filterCondition, setFilterCondition] = useState<string>("ALL");
  const [filterAvailable, setFilterAvailable] = useState<string>("ALL");
  const [filterFranchise, setFilterFranchise] = useState("");
  const [editAsset, setEditAsset] = useState<InventoryAsset | null | "new">(null);
  const [deleteAsset, setDeleteAsset] = useState<InventoryAsset | null>(null);

  const { data: assets = [], isLoading } = useQuery<InventoryAsset[]>({
    queryKey: ["/api/inventory"],
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
  }

  // Derived stats
  const total = assets.length;
  const available = assets.filter(a => a.available).length;
  const inUse = assets.filter(a => !a.available).length;
  const condCounts = CONDITIONS.reduce((acc, c) => {
    acc[c] = assets.filter(a => a.condition === c).length;
    return acc;
  }, {} as Record<string, number>);

  // Filter
  const filtered = assets.filter(a => {
    if (filterCondition !== "ALL" && a.condition !== filterCondition) return false;
    if (filterAvailable === "available" && !a.available) return false;
    if (filterAvailable === "inUse" && a.available) return false;
    if (filterFranchise && !a.franchiseTags.some(t => t.toLowerCase().includes(filterFranchise.toLowerCase()))) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!a.name.toLowerCase().includes(q) && !a.displayId.toLowerCase().includes(q) && !(a.location ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const statCard = (label: string, value: number | string, color: string) => (
    <div style={{
      background: "#fff",
      border: "1px solid #e8e8e7",
      borderRadius: 10,
      padding: "14px 18px",
      minWidth: 120,
    }}>
      <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, color, margin: 0, lineHeight: 1 }}>
        {value}
      </p>
      <p style={{ fontSize: 11.5, color: "#a8a29e", margin: "4px 0 0", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'Space Grotesk', sans-serif" }}>
        {label}
      </p>
    </div>
  );

  const inputStyle: React.CSSProperties = {
    border: "1.5px solid #e8e8e7",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 13,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    color: "#1c1917",
    backgroundColor: "#fff",
    outline: "none",
  };

  return (
    <div style={{ padding: "28px 32px", fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: "100%", backgroundColor: "#fafaf9" }}>

      {/* Modais */}
      {(editAsset === "new" || (editAsset && editAsset !== "new")) && (
        <AssetModal
          asset={editAsset === "new" ? null : editAsset}
          onClose={() => setEditAsset(null)}
          onSaved={() => { setEditAsset(null); invalidate(); }}
        />
      )}
      {deleteAsset && (
        <DeleteModal
          asset={deleteAsset}
          onClose={() => setDeleteAsset(null)}
          onDeleted={() => { setDeleteAsset(null); invalidate(); }}
        />
      )}

      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, color: "#1c1917", margin: 0, letterSpacing: "-0.02em" }}>
            Acervo de Peças
          </h1>
          <p style={{ fontSize: 13.5, color: "#78716c", margin: "4px 0 0" }}>
            Inventário de materiais gráficos e sua disponibilidade para eventos.
          </p>
        </div>
        <button
          onClick={() => setEditAsset("new")}
          data-testid="button-add-asset"
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "9px 18px",
            backgroundColor: "#f97316",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 13.5,
            fontWeight: 600,
            fontFamily: "'Space Grotesk', sans-serif",
            flexShrink: 0,
          }}
        >
          <Plus style={{ width: 16, height: 16 }} />
          Nova Peça
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        {statCard("Total de Peças", total, "#1c1917")}
        {statCard("Disponíveis", available, "#16a34a")}
        {statCard("Em Uso", inUse, "#f97316")}
        {statCard("Perfeito", condCounts.PERFEITO, "#16a34a")}
        {statCard("Avaria Leve", condCounts.AVARIA_LEVE, "#d97706")}
        {statCard("Sucata", condCounts.SUCATA, "#dc2626")}
      </div>

      {/* Filters */}
      <div style={{
        background: "#fff",
        border: "1px solid #e8e8e7",
        borderRadius: 12,
        padding: "14px 16px",
        marginBottom: 16,
        display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center",
      }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "#a8a29e" }} />
          <input
            style={{ ...inputStyle, width: "100%", paddingLeft: 34, boxSizing: "border-box" }}
            placeholder="Buscar por nome, ID ou localização…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-search-assets"
          />
        </div>

        {/* Condition filter */}
        <select
          style={{ ...inputStyle, minWidth: 160 }}
          value={filterCondition}
          onChange={e => setFilterCondition(e.target.value)}
          data-testid="select-filter-condition"
        >
          <option value="ALL">Todas as condições</option>
          <option value="PERFEITO">Perfeito</option>
          <option value="AVARIA_LEVE">Avaria Leve</option>
          <option value="SUCATA">Sucata</option>
        </select>

        {/* Availability filter */}
        <select
          style={{ ...inputStyle, minWidth: 160 }}
          value={filterAvailable}
          onChange={e => setFilterAvailable(e.target.value)}
          data-testid="select-filter-availability"
        >
          <option value="ALL">Todos os status</option>
          <option value="available">Disponível</option>
          <option value="inUse">Em uso</option>
        </select>

        {/* Franchise tag filter */}
        <div style={{ position: "relative", flex: "0 1 180px" }}>
          <Tag style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "#a8a29e" }} />
          <input
            style={{ ...inputStyle, width: "100%", paddingLeft: 32, boxSizing: "border-box" }}
            placeholder="Filtrar por franquia…"
            value={filterFranchise}
            onChange={e => setFilterFranchise(e.target.value)}
            data-testid="input-filter-franchise"
          />
        </div>
      </div>

      {/* Table */}
      <div style={{
        background: "#fff",
        border: "1px solid #e8e8e7",
        borderRadius: 12,
        overflow: "hidden",
      }}>
        {/* Table header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "100px 1fr 140px 160px 130px 110px 90px",
          gap: 0,
          backgroundColor: "#fafaf9",
          borderBottom: "1px solid #e8e8e7",
          padding: "0 16px",
        }}>
          {["ID", "Nome / Localização", "Condição", "Franquias", "Disponível", "Status", "Ações"].map((h, i) => (
            <div key={h} style={{
              padding: "11px 8px",
              fontSize: 11,
              fontWeight: 700,
              color: "#a8a29e",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontFamily: "'Space Grotesk', sans-serif",
              textAlign: i >= 5 ? "center" : "left",
            }}>
              {h}
            </div>
          ))}
        </div>

        {/* Rows */}
        {isLoading ? (
          <div style={{ padding: 48, textAlign: "center", color: "#a8a29e", fontSize: 14 }}>
            Carregando acervo…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 64, textAlign: "center" }}>
            <Archive style={{ width: 40, height: 40, color: "#d6d3d1", margin: "0 auto 12px", display: "block" }} />
            <p style={{ color: "#78716c", fontWeight: 600, fontSize: 14, margin: "0 0 4px" }}>Nenhuma peça encontrada</p>
            <p style={{ color: "#a8a29e", fontSize: 13, margin: 0 }}>
              {search || filterCondition !== "ALL" || filterAvailable !== "ALL" || filterFranchise
                ? "Tente ajustar os filtros"
                : "Clique em \"Nova Peça\" para adicionar ao acervo"}
            </p>
          </div>
        ) : (
          filtered.map((asset, idx) => {
            const meta = CONDITION_META[asset.condition ?? "PERFEITO"];
            const CondIcon = meta.Icon;
            return (
              <div
                key={asset.id}
                data-testid={`row-asset-${asset.id}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "100px 1fr 140px 160px 130px 110px 90px",
                  gap: 0,
                  padding: "0 16px",
                  borderBottom: idx < filtered.length - 1 ? "1px solid #f3f4f3" : "none",
                  alignItems: "center",
                  backgroundColor: "#fff",
                  transition: "background-color 0.1s",
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#fafaf9")}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#fff")}
              >
                {/* ID */}
                <div style={{ padding: "13px 8px" }}>
                  <span style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: "#f97316",
                    backgroundColor: "#fff7ed",
                    padding: "2px 7px",
                    borderRadius: 5,
                  }}>
                    {asset.displayId}
                  </span>
                </div>

                {/* Nome + localização */}
                <div style={{ padding: "13px 8px" }}>
                  <p style={{ fontSize: 13.5, fontWeight: 600, color: "#1c1917", margin: 0, lineHeight: 1.3 }}>
                    {asset.name}
                  </p>
                  {asset.location && (
                    <p style={{ fontSize: 11.5, color: "#a8a29e", margin: "2px 0 0", display: "flex", alignItems: "center", gap: 3 }}>
                      <MapPin style={{ width: 10, height: 10 }} />
                      {asset.location}
                    </p>
                  )}
                </div>

                {/* Condição */}
                <div style={{ padding: "13px 8px" }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "3px 10px",
                    backgroundColor: meta.bg,
                    border: `1px solid ${meta.color}30`,
                    borderRadius: 20,
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: meta.color,
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}>
                    <CondIcon style={{ width: 11, height: 11 }} />
                    {meta.label}
                  </span>
                </div>

                {/* Franquias */}
                <div style={{ padding: "13px 8px" }}>
                  {asset.franchiseTags?.length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {asset.franchiseTags.slice(0, 3).map(t => (
                        <span key={t} style={{
                          padding: "2px 8px",
                          backgroundColor: "#fff7ed",
                          border: "1px solid #fed7aa",
                          borderRadius: 20,
                          fontSize: 10.5,
                          color: "#c2410c",
                          fontWeight: 600,
                        }}>
                          {t}
                        </span>
                      ))}
                      {asset.franchiseTags.length > 3 && (
                        <span style={{ fontSize: 10.5, color: "#a8a29e", alignSelf: "center" }}>
                          +{asset.franchiseTags.length - 3}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, color: "#d6d3d1" }}>—</span>
                  )}
                </div>

                {/* Disponível toggle */}
                <div style={{ padding: "13px 8px" }}>
                  <ToggleAvailable asset={asset} onToggled={invalidate} />
                </div>

                {/* Status */}
                <div style={{ padding: "13px 8px", textAlign: "center" }}>
                  <span style={{
                    display: "inline-block",
                    padding: "3px 10px",
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 700,
                    fontFamily: "'Space Grotesk', sans-serif",
                    backgroundColor: asset.available ? "#f0fdf4" : "#fff7ed",
                    color: asset.available ? "#16a34a" : "#f97316",
                  }}>
                    {asset.available ? "Livre" : "Em Uso"}
                  </span>
                </div>

                {/* Ações */}
                <div style={{ padding: "13px 8px", display: "flex", gap: 6, justifyContent: "center" }}>
                  <ActionButton
                    icon={Pencil}
                    title="Editar"
                    color="#2563eb"
                    hoverBg="#eff6ff"
                    onClick={() => setEditAsset(asset)}
                    testId={`button-edit-asset-${asset.id}`}
                  />
                  <ActionButton
                    icon={Trash2}
                    title="Excluir"
                    color="#dc2626"
                    hoverBg="#fef2f2"
                    onClick={() => setDeleteAsset(asset)}
                    testId={`button-delete-asset-${asset.id}`}
                  />
                </div>
              </div>
            );
          })
        )}

        {/* Footer */}
        {filtered.length > 0 && (
          <div style={{
            padding: "10px 24px",
            borderTop: "1px solid #f3f4f3",
            backgroundColor: "#fafaf9",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: 12, color: "#a8a29e" }}>
              {filtered.length} de {total} {total === 1 ? "peça" : "peças"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inline toggle button ──────────────────────────────────────────────────────
function ToggleAvailable({ asset, onToggled }: { asset: InventoryAsset; onToggled: () => void }) {
  const { toast } = useToast();
  const mut = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/inventory/${asset.id}`, { available: !asset.available }),
    onSuccess: onToggled,
    onError: () => toast({ title: "Erro ao alterar disponibilidade", variant: "destructive" }),
  });

  return (
    <button
      onClick={() => mut.mutate()}
      disabled={mut.isPending}
      data-testid={`button-toggle-available-${asset.id}`}
      style={{
        width: 36, height: 21,
        borderRadius: 10,
        backgroundColor: asset.available ? "#f97316" : "#e8e8e7",
        border: "none",
        cursor: mut.isPending ? "not-allowed" : "pointer",
        position: "relative",
        transition: "background-color 0.2s",
        opacity: mut.isPending ? 0.6 : 1,
      }}
    >
      <span style={{
        position: "absolute",
        top: 2,
        left: asset.available ? 17 : 2,
        width: 17, height: 17,
        borderRadius: "50%",
        backgroundColor: "white",
        boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
        transition: "left 0.2s",
      }} />
    </button>
  );
}

// ── Small action button ───────────────────────────────────────────────────────
function ActionButton({
  icon: Icon, title, color, hoverBg, onClick, testId,
}: {
  icon: React.ElementType;
  title: string;
  color: string;
  hoverBg: string;
  onClick: () => void;
  testId?: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      data-testid={testId}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 30, height: 30,
        border: "1.5px solid #e8e8e7",
        borderRadius: 7,
        backgroundColor: hovered ? hoverBg : "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      <Icon style={{ width: 14, height: 14, color }} />
    </button>
  );
}
