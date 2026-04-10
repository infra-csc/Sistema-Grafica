import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { InventoryAsset } from "@shared/schema";
import {
  ScanSearch, CheckCircle2, AlertTriangle, XCircle,
  Archive, Warehouse, ArrowRight, Package,
} from "lucide-react";

// ─── Meta ────────────────────────────────────────────────────────────────────
const CONDITION_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  PERFEITO:    { label: "Perfeito",    color: "#16a34a", bg: "rgba(22,163,74,0.08)",  border: "rgba(22,163,74,0.2)"  },
  AVARIA_LEVE: { label: "Avaria Leve", color: "#d97706", bg: "rgba(217,119,6,0.08)",  border: "rgba(217,119,6,0.2)"  },
  SUCATA:      { label: "Sucata",      color: "#dc2626", bg: "rgba(220,38,38,0.08)",  border: "rgba(220,38,38,0.2)"  },
};
const CONDITIONS = ["PERFEITO", "AVARIA_LEVE", "SUCATA"] as const;
type Condition = typeof CONDITIONS[number];

const RESULT_OPTIONS = [
  { value: "NO_GALPAO",  label: "Retornar ao Galpão", color: "#16a34a" },
  { value: "DESCARTADO", label: "Descartar",           color: "#dc2626" },
] as const;
type TriagemResult = "NO_GALPAO" | "DESCARTADO";

interface TriagemEntry { condition: Condition; result: TriagemResult; notes: string; selected: boolean; }

// ─── Badge rounded-lg ────────────────────────────────────────────────────────
function Badge({ color, bg, border, label }: { color: string; bg: string; border: string; label: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "4px 10px", borderRadius: 8,
      fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
      fontFamily: "Space Grotesk, sans-serif",
      color, background: bg, border: `1px solid ${border}`,
    }}>
      {label}
    </span>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, Icon, color, subtext, subColor }: {
  label: string; value: number; Icon: React.ElementType;
  color: string; subtext: string; subColor?: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #fff 0%, #f8fafc 100%)",
        padding: 24, borderRadius: 20,
        border: `1px solid ${hovered ? color + "40" : "rgba(226,232,240,0.6)"}`,
        boxShadow: hovered ? `0 8px 24px ${color}14` : "0 1px 3px rgba(0,0,0,0.05)",
        transition: "border-color 0.2s, box-shadow 0.2s",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div style={{
          padding: 10, borderRadius: 12,
          background: hovered ? color : color + "18",
          transition: "background 0.2s",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={18} color={hovered ? "#fff" : color} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.15em" }}>
          {label}
        </span>
      </div>
      <p style={{ margin: "0 0 8px", fontSize: 30, fontWeight: 700, color: "#0f172a", fontFamily: "Space Grotesk, sans-serif", letterSpacing: "-0.02em" }}>
        {value.toLocaleString("pt-BR")}
      </p>
      <p style={{ margin: 0, fontSize: 9, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", color: subColor ?? "#94a3b8" }}>
        {subtext}
      </p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TriagemRetorno() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<Record<string, TriagemEntry>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const { data: awaitingAssets = [], isLoading, refetch } = useQuery<InventoryAsset[]>({
    queryKey: ["/api/inventory/awaiting-triage"],
  });

  const getEntry = (id: string): TriagemEntry =>
    entries[id] ?? { condition: "PERFEITO", result: "NO_GALPAO", notes: "", selected: false };

  const updateEntry = (id: string, patch: Partial<TriagemEntry>) =>
    setEntries(prev => ({ ...prev, [id]: { ...getEntry(id), ...patch } }));

  const triageMutation = useMutation({
    mutationFn: ({ id, condition, notes, trackingStatus }: { id: string; condition: Condition; notes: string; trackingStatus: string }) =>
      apiRequest("PATCH", `/api/inventory/${id}/triage`, { condition, notes, trackingStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/awaiting-triage"] });
    },
  });

  const handleSingle = async (assetId: string) => {
    const entry = getEntry(assetId);
    setSavingIds(prev => new Set(Array.from(prev).concat(assetId)));
    try {
      await triageMutation.mutateAsync({ id: assetId, condition: entry.condition, notes: entry.notes, trackingStatus: entry.result });
      setSavedIds(prev => new Set(Array.from(prev).concat(assetId)));
      toast({ title: "Triagem registrada com sucesso." });
    } catch {
      toast({ title: "Erro ao registrar triagem.", variant: "destructive" });
    } finally {
      setSavingIds(prev => { const s = new Set(Array.from(prev)); s.delete(assetId); return s; });
    }
  };

  const selectedIds = Object.entries(entries).filter(([, e]) => e.selected).map(([id]) => id);

  const handleBulk = async () => {
    if (selectedIds.length === 0) return;
    setSavingIds(new Set(selectedIds));
    const results = await Promise.allSettled(
      selectedIds.map(id => {
        const entry = getEntry(id);
        return triageMutation.mutateAsync({ id, condition: entry.condition, notes: entry.notes, trackingStatus: entry.result });
      })
    );
    const succeeded = results.filter(r => r.status === "fulfilled").length;
    const failed = results.filter(r => r.status === "rejected").length;
    setSavedIds(prev => new Set(Array.from(prev).concat(selectedIds)));
    setSavingIds(new Set());
    setEntries(prev => { const next = { ...prev }; selectedIds.forEach(id => { if (next[id]) next[id].selected = false; }); return next; });
    toast({ title: failed > 0 ? `${succeeded} salvas, ${failed} com erro.` : `${succeeded} triagem(ns) registradas.`, variant: failed > 0 ? "destructive" : "default" });
    refetch();
  };

  const toggleAll = (checked: boolean) => {
    const update: Record<string, TriagemEntry> = {};
    awaitingAssets.forEach(a => { if (!savedIds.has(a.id)) update[a.id] = { ...getEntry(a.id), selected: checked }; });
    setEntries(prev => ({ ...prev, ...update }));
  };

  const pendingAssets = awaitingAssets.filter(a => !savedIds.has(a.id));
  const allSelected = pendingAssets.length > 0 && pendingAssets.every(a => getEntry(a.id).selected);

  const SEL: React.CSSProperties = {
    padding: "8px 10px", borderRadius: 8, border: "1px solid #e2e8f0",
    fontSize: 12, fontFamily: "Space Grotesk, sans-serif", fontWeight: 600,
    background: "#f8fafc", color: "#0f172a", outline: "none",
    cursor: "pointer", width: "100%", boxSizing: "border-box",
  };
  const INP: React.CSSProperties = {
    padding: "8px 12px", borderRadius: 8, border: "1px solid #e2e8f0",
    fontSize: 12, fontFamily: "Plus Jakarta Sans, sans-serif",
    background: "#f8fafc", color: "#0f172a", outline: "none",
    width: "100%", boxSizing: "border-box",
  };

  return (
    <div style={{ padding: "32px 36px", background: "#f8fafc", minHeight: "100vh" }}>

      {/* ── Page header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 18, background: "#b45309",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 16px 40px rgba(180,83,9,0.25)",
          }}>
            <ScanSearch size={24} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: "0 0 4px", fontSize: 30, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", color: "#0f172a", letterSpacing: "-0.02em", lineHeight: 1 }}>
              Triagem de Retorno
            </h1>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#94a3b8", fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.15em" }}>
              Avaliação de Condição &amp; Destino
            </p>
          </div>
        </div>
        {selectedIds.length > 0 && (
          <button data-testid="button-bulk-triage" onClick={handleBulk} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "14px 28px", borderRadius: 16, border: "none",
            background: "#f97316", color: "#fff", fontSize: 13,
            cursor: "pointer", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
            letterSpacing: "0.05em", boxShadow: "0 8px 24px rgba(249,115,22,0.35)",
          }}>
            <Archive size={16} />
            CONFIRMAR TRIAGEM ({selectedIds.length})
          </button>
        )}
      </div>

      {/* ── Stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
        <StatCard
          label="Aguardando Triagem" value={pendingAssets.length}
          Icon={ScanSearch} color="#b45309"
          subtext="Prioridade alta" subColor="#b45309"
        />
        <StatCard
          label="Selecionados" value={selectedIds.length}
          Icon={CheckCircle2} color="#16a34a"
          subtext={selectedIds.length > 0 ? "Prontos para confirmar" : "Nenhum selecionado"}
        />
        <StatCard
          label="Triados Hoje" value={savedIds.size}
          Icon={Warehouse} color="#2563eb"
          subtext="Processados nesta sessão"
        />
      </div>

      {/* ── Main queue card ── */}
      {isLoading ? (
        <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #e2e8f0", padding: 60, textAlign: "center", color: "#94a3b8", fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 14 }}>
          Carregando materiais para triagem...
        </div>
      ) : pendingAssets.length === 0 && savedIds.size === 0 ? (
        <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #e2e8f0", padding: 80, textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.04)" }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: "#f8fafc", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <ScanSearch size={28} color="#cbd5e1" />
          </div>
          <p style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 6px", fontFamily: "Space Grotesk, sans-serif" }}>
            Nenhum material aguardando triagem
          </p>
          <p style={{ fontSize: 13, color: "#64748b", margin: 0, fontFamily: "Plus Jakarta Sans, sans-serif" }}>
            Os materiais são automaticamente movidos para triagem 24h após o evento.
          </p>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.06)" }}>

          {/* Table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "44px 160px 1fr 160px 160px 1fr 140px",
            gap: 0, padding: "14px 24px",
            background: "rgba(248,250,252,0.8)", borderBottom: "1px solid #e2e8f0",
            alignItems: "center",
          }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <input type="checkbox" data-testid="checkbox-select-all"
                checked={allSelected} onChange={e => toggleAll(e.target.checked)}
                style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#f97316" }}
              />
            </div>
            {["Identificador", "Equipamento", "Condição Atual", "Destino", "Observação", ""].map(h => (
              <span key={h} style={{
                fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em",
                color: "#94a3b8", fontFamily: "Space Grotesk, sans-serif",
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
            const condMeta = CONDITION_META[entry.condition];
            const resultMeta = RESULT_OPTIONS.find(r => r.value === entry.result) ?? RESULT_OPTIONS[0];

            return (
              <div key={asset.id} data-testid={`row-triage-${asset.id}`}
                style={{
                  borderBottom: "1px solid rgba(241,245,249,0.8)",
                  opacity: isSaved ? 0.55 : 1,
                  background: isSaved ? "rgba(240,253,244,0.5)" : "#fff",
                  transition: "background 0.15s",
                }}
              >
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "44px 160px 1fr 160px 160px 1fr 140px",
                  gap: 0, padding: "16px 24px", alignItems: "center",
                }}>

                  {/* Checkbox / done icon */}
                  <div>
                    {isSaved
                      ? <CheckCircle2 size={16} color="#16a34a" />
                      : <input type="checkbox" data-testid={`checkbox-asset-${asset.id}`}
                          checked={entry.selected}
                          onChange={e => updateEntry(asset.id, { selected: e.target.checked })}
                          style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#f97316" }}
                        />
                    }
                  </div>

                  {/* ID */}
                  <div>
                    <span style={{
                      fontFamily: "DM Mono, monospace", fontSize: 11, fontWeight: 700,
                      color: "#475569", background: "rgba(241,245,249,0.8)",
                      padding: "3px 8px", borderRadius: 6, display: "inline-block",
                    }}>
                      {asset.displayId}
                    </span>
                  </div>

                  {/* Name */}
                  <div style={{ paddingRight: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                        background: asset.autoAdded ? "rgba(37,99,235,0.08)" : "#f1f5f9",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        border: `1px solid ${asset.autoAdded ? "rgba(37,99,235,0.2)" : "#e2e8f0"}`,
                      }}>
                        <span style={{ fontSize: 8, fontWeight: 800, color: asset.autoAdded ? "#2563eb" : "#94a3b8", fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.03em" }}>
                          {asset.autoAdded ? "AUTO" : "MAN"}
                        </span>
                      </div>
                      <div>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#0f172a", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                          {asset.name}
                        </p>
                        {asset.notes && (
                          <p style={{ margin: "1px 0 0", fontSize: 10, color: "#94a3b8", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                            {asset.notes.length > 40 ? asset.notes.slice(0, 40) + "…" : asset.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Condition select */}
                  <div style={{ paddingRight: 12 }}>
                    <select data-testid={`select-condition-${asset.id}`}
                      value={entry.condition} disabled={isSaved}
                      onChange={e => updateEntry(asset.id, { condition: e.target.value as Condition })}
                      style={{ ...SEL, color: condMeta.color, cursor: isSaved ? "default" : "pointer" }}
                    >
                      {CONDITIONS.map(c => <option key={c} value={c}>{CONDITION_META[c].label}</option>)}
                    </select>
                  </div>

                  {/* Result select */}
                  <div style={{ paddingRight: 12 }}>
                    <select data-testid={`select-result-${asset.id}`}
                      value={entry.result} disabled={isSaved}
                      onChange={e => updateEntry(asset.id, { result: e.target.value as TriagemResult })}
                      style={{ ...SEL, color: resultMeta.color, cursor: isSaved ? "default" : "pointer" }}
                    >
                      {RESULT_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>

                  {/* Notes input */}
                  <div style={{ paddingRight: 12 }}>
                    <input data-testid={`input-notes-${asset.id}`}
                      type="text" placeholder="Observação opcional..."
                      value={entry.notes} disabled={isSaved}
                      onChange={e => updateEntry(asset.id, { notes: e.target.value })}
                      style={{ ...INP, cursor: isSaved ? "default" : "text" }}
                    />
                  </div>

                  {/* Action */}
                  <div>
                    {isSaved ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, background: "rgba(22,163,74,0.08)", color: "#16a34a", fontSize: 11, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif" }}>
                        <CheckCircle2 size={13} />
                        Triado
                      </span>
                    ) : (
                      <button data-testid={`button-save-triage-${asset.id}`}
                        disabled={isSaving}
                        onClick={() => handleSingle(asset.id)}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          padding: "8px 16px", borderRadius: 8, border: "none",
                          background: isSaving ? "#e2e8f0" : "#0f172a",
                          color: isSaving ? "#94a3b8" : "#fff",
                          fontSize: 11, cursor: isSaving ? "not-allowed" : "pointer",
                          fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                          letterSpacing: "0.05em", whiteSpace: "nowrap",
                          boxShadow: isSaving ? "none" : "0 2px 8px rgba(0,0,0,0.15)",
                        }}
                      >
                        {isSaving ? "..." : <><ArrowRight size={12} /> SALVAR</>}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Bulk action footer */}
          {selectedIds.length > 0 && (
            <div style={{
              padding: "16px 24px",
              background: "rgba(255,247,237,0.8)",
              borderTop: "1px solid rgba(253,215,170,0.6)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f97316" }} />
                <span style={{ fontSize: 13, color: "#ea580c", fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 600 }}>
                  {selectedIds.length} item(ns) selecionado(s) — pronto para triagem em lote
                </span>
              </div>
              <button data-testid="button-bulk-confirm" onClick={handleBulk} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "9px 20px", borderRadius: 10, border: "none",
                background: "#f97316", color: "#fff", fontSize: 12,
                cursor: "pointer", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                letterSpacing: "0.05em", boxShadow: "0 4px 14px rgba(249,115,22,0.3)",
              }}>
                <Archive size={14} />
                CONFIRMAR TRIAGEM EM LOTE
              </button>
            </div>
          )}

          {/* Footer count */}
          <div style={{
            padding: "14px 24px",
            background: "rgba(248,250,252,0.8)",
            borderTop: "1px solid #e2e8f0",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.15em", color: "#94a3b8" }}>
              Exibindo <span style={{ color: "#0f172a" }}>{awaitingAssets.length}</span> materiais na fila
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#b45309" }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  {pendingAssets.length} pendentes
                </span>
              </div>
              <div style={{ width: 1, height: 14, background: "#e2e8f0" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#16a34a" }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  {savedIds.size} triados
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
