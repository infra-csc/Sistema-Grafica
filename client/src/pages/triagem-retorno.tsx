import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { InventoryAsset } from "@shared/schema";
import {
  ScanSearch, CheckCircle2, AlertTriangle, XCircle, Package,
  Archive, Warehouse, Truck, ArrowRight, X, ChevronDown,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────
const CONDITION_META: Record<string, {
  label: string; color: string; bg: string; border: string; Icon: React.ElementType;
}> = {
  PERFEITO:    { label: "Perfeito",     color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", Icon: CheckCircle2 },
  AVARIA_LEVE: { label: "Avaria Leve",  color: "#d97706", bg: "#fffbeb", border: "#fde68a", Icon: AlertTriangle },
  SUCATA:      { label: "Sucata",       color: "#dc2626", bg: "#fef2f2", border: "#fecaca", Icon: XCircle },
};
const CONDITIONS = ["PERFEITO", "AVARIA_LEVE", "SUCATA"] as const;
type Condition = typeof CONDITIONS[number];

const RESULT_OPTIONS = [
  { value: "NO_GALPAO", label: "Retornar ao Galpão", Icon: Warehouse, color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  { value: "DESCARTADO", label: "Descartar", Icon: XCircle, color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
] as const;
type TriagemResult = "NO_GALPAO" | "DESCARTADO";

interface TriagemEntry {
  condition: Condition;
  result: TriagemResult;
  notes: string;
  selected: boolean;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TriagemRetorno() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<Record<string, TriagemEntry>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  // Load assets awaiting triage
  const { data: awaitingAssets = [], isLoading, refetch } = useQuery<InventoryAsset[]>({
    queryKey: ["/api/inventory/awaiting-triage"],
  });

  const getEntry = (assetId: string): TriagemEntry =>
    entries[assetId] ?? { condition: "PERFEITO", result: "NO_GALPAO", notes: "", selected: false };

  const updateEntry = (assetId: string, patch: Partial<TriagemEntry>) =>
    setEntries(prev => ({
      ...prev,
      [assetId]: { ...getEntry(assetId), ...patch },
    }));

  const triageMutation = useMutation({
    mutationFn: ({ id, condition, notes, trackingStatus }: {
      id: string; condition: Condition; notes: string; trackingStatus: string;
    }) => apiRequest("PATCH", `/api/inventory/${id}/triage`, { condition, notes, trackingStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/awaiting-triage"] });
    },
  });

  const handleSingle = async (assetId: string) => {
    const entry = getEntry(assetId);
    setSavingIds(prev => new Set([...prev, assetId]));
    try {
      await triageMutation.mutateAsync({
        id: assetId,
        condition: entry.condition,
        notes: entry.notes,
        trackingStatus: entry.result,
      });
      setSavedIds(prev => new Set([...prev, assetId]));
      toast({ title: "Triagem registrada com sucesso." });
    } catch {
      toast({ title: "Erro ao registrar triagem.", variant: "destructive" });
    } finally {
      setSavingIds(prev => { const s = new Set(prev); s.delete(assetId); return s; });
    }
  };

  const selectedIds = Object.entries(entries)
    .filter(([, e]) => e.selected)
    .map(([id]) => id);

  const handleBulk = async () => {
    if (selectedIds.length === 0) return;
    setSavingIds(new Set(selectedIds));
    const results = await Promise.allSettled(
      selectedIds.map(id => {
        const entry = getEntry(id);
        return triageMutation.mutateAsync({
          id,
          condition: entry.condition,
          notes: entry.notes,
          trackingStatus: entry.result,
        });
      })
    );
    const succeeded = results.filter(r => r.status === "fulfilled").length;
    const failed = results.filter(r => r.status === "rejected").length;
    setSavedIds(prev => new Set([...prev, ...selectedIds]));
    setSavingIds(new Set());
    setEntries(prev => {
      const next = { ...prev };
      selectedIds.forEach(id => { if (next[id]) next[id].selected = false; });
      return next;
    });
    if (failed > 0) {
      toast({ title: `${succeeded} triagens salvas, ${failed} com erro.`, variant: "destructive" });
    } else {
      toast({ title: `${succeeded} triagem(ns) registradas.` });
    }
    refetch();
  };

  const toggleAll = (checked: boolean) => {
    const update: Record<string, TriagemEntry> = {};
    awaitingAssets.forEach(a => {
      if (!savedIds.has(a.id)) {
        update[a.id] = { ...getEntry(a.id), selected: checked };
      }
    });
    setEntries(prev => ({ ...prev, ...update }));
  };

  const pendingAssets = awaitingAssets.filter(a => !savedIds.has(a.id));
  const allSelected = pendingAssets.length > 0 && pendingAssets.every(a => getEntry(a.id).selected);

  const LBL: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: "#a8a29e", fontFamily: "Space Grotesk, sans-serif",
    textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5,
  };
  const INP: React.CSSProperties = {
    width: "100%", padding: "7px 10px", borderRadius: 6,
    border: "1px solid #e8e8e7", fontSize: 12, fontFamily: "Plus Jakarta Sans, sans-serif",
    background: "#fafaf9", color: "#1c1917", outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ padding: "24px 32px", background: "#fafaf9", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, background: "#fffbeb",
            border: "1px solid #fde68a", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <ScanSearch size={18} color="#b45309" />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", color: "#1c1917", margin: 0 }}>
              Triagem de Retorno
            </h1>
            <p style={{ fontSize: 12, color: "#78716c", margin: 0, fontFamily: "Plus Jakarta Sans, sans-serif" }}>
              Avalie a condição dos materiais retornados e envie ao galpão
            </p>
          </div>
        </div>
        {selectedIds.length > 0 && (
          <button
            data-testid="button-bulk-triage"
            onClick={handleBulk}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 8, border: "none",
              background: "#f97316", color: "#fff", fontSize: 13,
              cursor: "pointer", fontFamily: "Space Grotesk, sans-serif", fontWeight: 600,
            }}
          >
            <Archive size={14} />
            Confirmar Triagem ({selectedIds.length})
          </button>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Aguardando Triagem", value: pendingAssets.length, Icon: ScanSearch, color: "#b45309", bg: "#fffbeb", border: "#fde68a" },
          { label: "Selecionados", value: selectedIds.length, Icon: CheckCircle2, color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
          { label: "Triados Hoje", value: savedIds.size, Icon: Warehouse, color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
        ].map(({ label, value, Icon, color, bg, border }) => (
          <div key={label} style={{
            background: "#fff", border: "1px solid #e8e8e7", borderRadius: 10,
            padding: "14px 16px", display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: bg, border: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon size={16} color={color} />
            </div>
            <div>
              <p style={{ fontSize: 11, color: "#78716c", margin: "0 0 2px", fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {label}
              </p>
              <p style={{ fontSize: 20, fontWeight: 700, color: "#1c1917", margin: 0, fontFamily: "Space Grotesk, sans-serif" }}>
                {value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Loading / Empty */}
      {isLoading ? (
        <div style={{ background: "#fff", border: "1px solid #e8e8e7", borderRadius: 10, padding: 48, textAlign: "center", color: "#a8a29e", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
          Carregando materiais para triagem...
        </div>
      ) : pendingAssets.length === 0 && savedIds.size === 0 ? (
        <div style={{
          background: "#fff", border: "1px solid #e8e8e7", borderRadius: 10,
          padding: 56, textAlign: "center",
        }}>
          <ScanSearch size={36} color="#e8e8e7" style={{ display: "block", margin: "0 auto 12px" }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: "#1c1917", margin: "0 0 4px", fontFamily: "Space Grotesk, sans-serif" }}>
            Nenhum material aguardando triagem
          </p>
          <p style={{ fontSize: 13, color: "#78716c", margin: 0, fontFamily: "Plus Jakarta Sans, sans-serif" }}>
            Os materiais são automaticamente movidos para triagem 24h após o evento.
          </p>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e8e8e7", borderRadius: 10, overflow: "hidden" }}>
          {/* Table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "36px 1fr 140px 140px 1fr 120px 44px",
            gap: 8, padding: "10px 16px",
            background: "#fafaf9", borderBottom: "1px solid #e8e8e7",
          }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <input
                type="checkbox"
                data-testid="checkbox-select-all"
                checked={allSelected}
                onChange={e => toggleAll(e.target.checked)}
                style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#f97316" }}
              />
            </div>
            {["Identificação", "Condição Atual", "Destino", "Observação", ""].map(h => (
              <span key={h} style={{
                fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                color: "#a8a29e", fontFamily: "Space Grotesk, sans-serif",
              }}>
                {h}
              </span>
            ))}
          </div>

          {/* Rows */}
          {[...pendingAssets, ...awaitingAssets.filter(a => savedIds.has(a.id))].map(asset => {
            const entry = getEntry(asset.id);
            const isSaved = savedIds.has(asset.id);
            const isSaving = savingIds.has(asset.id);
            const isExpanded = expandedId === asset.id;
            const condMeta = CONDITION_META[entry.condition];
            const resultMeta = RESULT_OPTIONS.find(r => r.value === entry.result) ?? RESULT_OPTIONS[0];

            return (
              <div key={asset.id} data-testid={`row-triage-${asset.id}`} style={{
                borderBottom: "1px solid #f0efed",
                opacity: isSaved ? 0.6 : 1,
                background: isSaved ? "#f9fdf9" : "#fff",
              }}>
                {/* Main row */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "36px 1fr 140px 140px 1fr 120px 44px",
                  gap: 8, padding: "12px 16px", alignItems: "center",
                }}>
                  {/* Checkbox */}
                  <div>
                    {isSaved ? (
                      <CheckCircle2 size={15} color="#16a34a" />
                    ) : (
                      <input
                        type="checkbox"
                        data-testid={`checkbox-asset-${asset.id}`}
                        checked={entry.selected}
                        onChange={e => updateEntry(asset.id, { selected: e.target.checked })}
                        style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#f97316" }}
                      />
                    )}
                  </div>

                  {/* ID + Name */}
                  <div>
                    <span style={{
                      fontFamily: "DM Mono, monospace", fontSize: 11, color: "#a8a29e",
                      display: "block", marginBottom: 1,
                    }}>
                      {asset.displayId}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#1c1917", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                      {asset.name}
                    </span>
                    {asset.notes && (
                      <span style={{ fontSize: 11, color: "#78716c", display: "block", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                        {asset.notes}
                      </span>
                    )}
                  </div>

                  {/* Condition select */}
                  <select
                    data-testid={`select-condition-${asset.id}`}
                    value={entry.condition}
                    disabled={isSaved}
                    onChange={e => updateEntry(asset.id, { condition: e.target.value as Condition })}
                    style={{
                      ...INP, cursor: isSaved ? "default" : "pointer",
                      color: condMeta.color, fontWeight: 600,
                    }}
                  >
                    {CONDITIONS.map(c => (
                      <option key={c} value={c}>{CONDITION_META[c].label}</option>
                    ))}
                  </select>

                  {/* Result select */}
                  <select
                    data-testid={`select-result-${asset.id}`}
                    value={entry.result}
                    disabled={isSaved}
                    onChange={e => updateEntry(asset.id, { result: e.target.value as TriagemResult })}
                    style={{
                      ...INP, cursor: isSaved ? "default" : "pointer",
                      color: resultMeta.color, fontWeight: 600,
                    }}
                  >
                    {RESULT_OPTIONS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>

                  {/* Notes */}
                  <input
                    data-testid={`input-notes-${asset.id}`}
                    type="text"
                    placeholder="Observação..."
                    value={entry.notes}
                    disabled={isSaved}
                    onChange={e => updateEntry(asset.id, { notes: e.target.value })}
                    style={{ ...INP, cursor: isSaved ? "default" : "text" }}
                  />

                  {/* Save single button */}
                  {isSaved ? (
                    <span style={{
                      fontSize: 11, color: "#16a34a", fontFamily: "Space Grotesk, sans-serif",
                      fontWeight: 600, display: "flex", alignItems: "center", gap: 4,
                    }}>
                      <CheckCircle2 size={13} />
                      Triado
                    </span>
                  ) : (
                    <button
                      data-testid={`button-save-triage-${asset.id}`}
                      disabled={isSaving}
                      onClick={() => handleSingle(asset.id)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                        padding: "7px 10px", borderRadius: 6, border: "none",
                        background: isSaving ? "#e8e8e7" : "#1c1917",
                        color: isSaving ? "#a8a29e" : "#fff", fontSize: 12,
                        cursor: isSaving ? "not-allowed" : "pointer",
                        fontFamily: "Space Grotesk, sans-serif", fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isSaving ? "..." : (
                        <>
                          <ArrowRight size={12} />
                          Salvar
                        </>
                      )}
                    </button>
                  )}

                  {/* Expand */}
                  <div />
                </div>
              </div>
            );
          })}

          {/* Bulk action bar */}
          {selectedIds.length > 0 && (
            <div style={{
              padding: "12px 16px", background: "#fff7ed", borderTop: "1px solid #fed7aa",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ fontSize: 13, color: "#ea580c", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                {selectedIds.length} item(ns) selecionado(s)
              </span>
              <button
                data-testid="button-bulk-confirm"
                onClick={handleBulk}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 14px", borderRadius: 6, border: "none",
                  background: "#f97316", color: "#fff", fontSize: 12,
                  cursor: "pointer", fontFamily: "Space Grotesk, sans-serif", fontWeight: 600,
                }}
              >
                <Archive size={13} />
                Confirmar Triagem em Lote
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
