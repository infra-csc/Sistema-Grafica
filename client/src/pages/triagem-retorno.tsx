import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { InventoryAsset } from "@shared/schema";
import {
  ScanSearch, CheckCircle2, Warehouse, Archive, Package, Save, CalendarDays, Tag,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
const CONDITIONS = ["PERFEITO", "AVARIA_LEVE", "SUCATA"] as const;
type Condition = typeof CONDITIONS[number];
const CONDITION_LABELS: Record<string, string> = {
  PERFEITO: "Perfeito",
  AVARIA_LEVE: "Avaria Leve",
  SUCATA: "Sucata",
};
const CONDITION_COLORS: Record<string, { bg: string; color: string }> = {
  PERFEITO: { bg: "#dcfce7", color: "#16a34a" },
  AVARIA_LEVE: { bg: "#fef9c3", color: "#854d0e" },
  SUCATA: { bg: "#fee2e2", color: "#dc2626" },
};

const RESULT_OPTIONS = [
  { value: "NO_GALPAO", label: "Galpão" },
  { value: "DESCARTADO", label: "Descartar" },
] as const;
type TriagemResult = "NO_GALPAO" | "DESCARTADO";

interface TriagemEntry { condition: Condition; result: TriagemResult; notes: string; selected: boolean; }

type EnrichedAsset = InventoryAsset & {
  eventName: string | null;
  eventDate: string | null;
  sponsors: { id: string; name: string }[];
};

// ─── Horizontal stat card ─────────────────────────────────────────────────────
function StatCard({ label, value, Icon, color, iconBg }: {
  label: string; value: number; Icon: React.ElementType; color: string; iconBg: string;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{
        background: hov ? "#e9edff" : "#f1f3ff",
        padding: "20px 24px", borderRadius: 16,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        transition: "background 0.2s", cursor: "default",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div>
        <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 700, color, fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          {label}
        </p>
        <h3 style={{ margin: 0, fontSize: 38, fontWeight: 900, color: "#0f172a", fontFamily: "Space Grotesk, sans-serif", letterSpacing: "-0.03em", lineHeight: 1 }}>
          {value}
        </h3>
      </div>
      <div style={{ width: 44, height: 44, borderRadius: "50%", background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={20} color={color} />
      </div>
    </div>
  );
}

// ─── Sponsor chips ─────────────────────────────────────────────────────────────
function SponsorChips({ sponsors }: { sponsors: { id: string; name: string }[] }) {
  if (!sponsors || sponsors.length === 0) return (
    <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "Plus Jakarta Sans, sans-serif", fontStyle: "italic" }}>
      sem patrocinador
    </span>
  );
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {sponsors.map(s => (
        <span key={s.id} style={{
          display: "inline-flex", alignItems: "center", gap: 3,
          padding: "3px 8px", borderRadius: 6,
          background: "#f0f4ff", border: "1px solid #c7d2fe",
          fontSize: 10, fontWeight: 700, color: "#4338ca",
          fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.06em",
          textTransform: "uppercase", whiteSpace: "nowrap",
        }}>
          <Tag size={9} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TriagemRetorno() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<Record<string, TriagemEntry>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const { data: awaitingAssets = [], isLoading, refetch } = useQuery<EnrichedAsset[]>({
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
      toast({ title: "Triagem registrada." });
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
    padding: "8px 10px", borderRadius: 8, border: "none",
    fontSize: 13, fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 500,
    background: "#f1f3ff", color: "#0f172a", outline: "none",
    cursor: "pointer", width: "100%", boxSizing: "border-box",
  };
  const INP: React.CSSProperties = {
    padding: "8px 12px", borderRadius: 8, border: "none",
    fontSize: 13, fontFamily: "Plus Jakarta Sans, sans-serif",
    background: "#f1f3ff", color: "#0f172a", outline: "none",
    width: "100%", boxSizing: "border-box",
  };

  return (
    <div style={{ padding: "32px 36px", background: "#f9f9ff", minHeight: "100vh" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, background: "#fffbeb",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 8px rgba(180,83,9,0.12)",
          }}>
            <ScanSearch size={28} color="#b45309" />
          </div>
          <div>
            <h1 style={{ margin: "0 0 4px", fontSize: 30, fontWeight: 800, fontFamily: "Space Grotesk, sans-serif", color: "#0f172a", letterSpacing: "-0.02em", lineHeight: 1 }}>
              Triagem de Retorno
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: "#64748b", fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 500 }}>
              Avalie a condição dos materiais retornados e envie ao galpão
            </p>
          </div>
        </div>
        <button data-testid="button-bulk-triage-header" onClick={handleBulk}
          disabled={selectedIds.length === 0}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "14px 24px", borderRadius: 14, border: "none",
            background: selectedIds.length === 0 ? "#e2e8f0" : "linear-gradient(135deg, #3b82f6, #1d4ed8)",
            color: selectedIds.length === 0 ? "#94a3b8" : "#fff", fontSize: 13,
            cursor: selectedIds.length === 0 ? "not-allowed" : "pointer",
            fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
            boxShadow: selectedIds.length > 0 ? "0 8px 24px rgba(37,99,235,0.35)" : "none",
            transition: "all 0.2s",
          }}>
          <span>Confirmar Triagem ({selectedIds.length})</span>
          <CheckCircle2 size={16} />
        </button>
      </div>

      {/* ── Stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, marginBottom: 40 }}>
        <StatCard label="Aguardando Triagem" value={pendingAssets.length} Icon={ScanSearch} color="#b45309" iconBg="#fde68a" />
        <StatCard label="Selecionados" value={selectedIds.length} Icon={CheckCircle2} color="#16a34a" iconBg="#bbf7d0" />
        <StatCard label="Triados Hoje" value={savedIds.size} Icon={Warehouse} color="#2563eb" iconBg="#bfdbfe" />
      </div>

      {/* ── Main card ── */}
      {isLoading ? (
        <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #e2e8f0", padding: 60, textAlign: "center", color: "#94a3b8", fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 14, boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
          Carregando materiais para triagem...
        </div>
      ) : pendingAssets.length === 0 && savedIds.size === 0 ? (
        <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #e2e8f0", padding: 80, textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: "#f1f3ff", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <ScanSearch size={28} color="#94a3b8" />
          </div>
          <p style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 8px", fontFamily: "Space Grotesk, sans-serif" }}>
            Nenhum material aguardando triagem
          </p>
          <p style={{ fontSize: 13, color: "#64748b", margin: 0, fontFamily: "Plus Jakarta Sans, sans-serif" }}>
            Os materiais são automaticamente movidos para triagem na data do evento.
          </p>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 20, overflow: "hidden", boxShadow: "0 20px 40px rgba(20,27,43,0.06)", position: "relative" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr style={{ background: "#e9edff" }}>
                  <th style={{ width: 48, padding: "14px 20px", textAlign: "left" }}>
                    <input type="checkbox" data-testid="checkbox-select-all"
                      checked={allSelected} onChange={e => toggleAll(e.target.checked)}
                      style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#2563eb" }}
                    />
                  </th>
                  {[
                    { label: "Material / Quantidade", align: "left" },
                    { label: "Evento", align: "left" },
                    { label: "Patrocinadores", align: "left" },
                    { label: "Condição", align: "left" },
                    { label: "Destino", align: "left" },
                    { label: "Observação", align: "left" },
                    { label: "Ação", align: "right" },
                  ].map(h => (
                    <th key={h.label} style={{
                      padding: "14px 20px", fontWeight: 700, fontSize: 11,
                      textTransform: "uppercase", letterSpacing: "0.08em", color: "#434655",
                      fontFamily: "Space Grotesk, sans-serif", textAlign: h.align as any,
                    }}>
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...pendingAssets, ...awaitingAssets.filter(a => savedIds.has(a.id))].map(asset => {
                  const entry = getEntry(asset.id);
                  const isSaved = savedIds.has(asset.id);
                  const isSaving = savingIds.has(asset.id);
                  const qty = asset.quantity ?? 1;

                  return (
                    <tr key={asset.id} data-testid={`row-triage-${asset.id}`}
                      style={{
                        opacity: isSaved ? 0.55 : 1,
                        background: isSaved ? "#f9fdf9" : "#fff",
                        transition: "background 0.1s",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                      onMouseEnter={e => { if (!isSaved) (e.currentTarget as HTMLTableRowElement).style.background = "#f8f9ff"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = isSaved ? "#f9fdf9" : "#fff"; }}
                    >
                      {/* Checkbox */}
                      <td style={{ padding: "18px 20px", verticalAlign: "middle" }}>
                        {isSaved
                          ? <CheckCircle2 size={17} color="#16a34a" />
                          : <input type="checkbox" data-testid={`checkbox-asset-${asset.id}`}
                              checked={entry.selected}
                              onChange={e => updateEntry(asset.id, { selected: e.target.checked })}
                              style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#2563eb" }}
                            />
                        }
                      </td>

                      {/* Material + Qty */}
                      <td style={{ padding: "18px 20px", verticalAlign: "middle" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 38, height: 38, borderRadius: 10, background: "#e9edff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Package size={17} color="#64748b" />
                          </div>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: "#0f172a", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                                {asset.name}
                              </p>
                              {/* Quantity badge */}
                              <span style={{
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                minWidth: 22, height: 20, borderRadius: 6,
                                background: qty > 1 ? "#e0f2fe" : "#f1f5f9",
                                color: qty > 1 ? "#0369a1" : "#64748b",
                                fontSize: 10, fontWeight: 800,
                                fontFamily: "DM Mono, monospace",
                                padding: "0 6px",
                                border: qty > 1 ? "1px solid #bae6fd" : "1px solid #e2e8f0",
                              }}>
                                ×{qty}
                              </span>
                            </div>
                            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#94a3b8", fontFamily: "DM Mono, monospace", letterSpacing: "0.04em" }}>
                              {asset.displayId}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Evento */}
                      <td style={{ padding: "18px 20px", verticalAlign: "middle" }}>
                        {asset.eventName ? (
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                              <CalendarDays size={12} color="#6366f1" />
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                                {asset.eventName}
                              </span>
                            </div>
                            {asset.eventDate && (
                              <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "DM Mono, monospace" }}>
                                {new Date(asset.eventDate).toLocaleDateString("pt-BR")}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic", fontFamily: "Plus Jakarta Sans, sans-serif" }}>—</span>
                        )}
                      </td>

                      {/* Patrocinadores */}
                      <td style={{ padding: "18px 20px", verticalAlign: "middle", maxWidth: 180 }}>
                        <SponsorChips sponsors={asset.sponsors ?? []} />
                      </td>

                      {/* Condição select */}
                      <td style={{ padding: "18px 20px", verticalAlign: "middle", minWidth: 140 }}>
                        <select data-testid={`select-condition-${asset.id}`}
                          value={entry.condition} disabled={isSaved}
                          onChange={e => updateEntry(asset.id, { condition: e.target.value as Condition })}
                          style={{ ...SEL, opacity: isSaved ? 0.5 : 1, cursor: isSaved ? "not-allowed" : "pointer" }}
                        >
                          {CONDITIONS.map(c => <option key={c} value={c}>{CONDITION_LABELS[c]}</option>)}
                        </select>
                        {/* Condition color hint */}
                        {!isSaved && (
                          <div style={{
                            display: "flex", alignItems: "center", gap: 4, marginTop: 4,
                          }}>
                            <span style={{
                              display: "inline-block", width: 6, height: 6, borderRadius: "50%",
                              background: CONDITION_COLORS[entry.condition]?.color ?? "#64748b",
                            }} />
                            <span style={{ fontSize: 10, color: CONDITION_COLORS[entry.condition]?.color ?? "#64748b", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700 }}>
                              {CONDITION_LABELS[entry.condition]}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Destino select */}
                      <td style={{ padding: "18px 20px", verticalAlign: "middle", minWidth: 130 }}>
                        <select data-testid={`select-result-${asset.id}`}
                          value={entry.result} disabled={isSaved}
                          onChange={e => updateEntry(asset.id, { result: e.target.value as TriagemResult })}
                          style={{
                            ...SEL,
                            opacity: isSaved ? 0.5 : 1,
                            cursor: isSaved ? "not-allowed" : "pointer",
                            color: entry.result === "DESCARTADO" ? "#dc2626" : "#0f172a",
                          }}
                        >
                          {RESULT_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      </td>

                      {/* Observação */}
                      <td style={{ padding: "18px 20px", verticalAlign: "middle" }}>
                        {isSaved ? (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, background: "#dcfce7", color: "#16a34a" }}>
                            <CheckCircle2 size={12} />
                            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.08em" }}>Triado</span>
                          </div>
                        ) : (
                          <input data-testid={`input-notes-${asset.id}`}
                            type="text" placeholder="Adicionar nota..."
                            value={entry.notes}
                            onChange={e => updateEntry(asset.id, { notes: e.target.value })}
                            onKeyDown={e => e.key === "Enter" && handleSingle(asset.id)}
                            style={INP}
                          />
                        )}
                      </td>

                      {/* Ação — botão Salvar melhorado */}
                      <td style={{ padding: "18px 20px", verticalAlign: "middle", textAlign: "right" }}>
                        {isSaved ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#16a34a", fontSize: 12, fontFamily: "Space Grotesk, sans-serif", fontWeight: 700 }}>
                            <CheckCircle2 size={15} />
                            Salvo
                          </span>
                        ) : (
                          <button data-testid={`button-save-triage-${asset.id}`}
                            disabled={isSaving}
                            onClick={() => handleSingle(asset.id)}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 6,
                              padding: "8px 16px", borderRadius: 9,
                              border: "none",
                              background: isSaving ? "#e2e8f0" : "#2563eb",
                              color: isSaving ? "#94a3b8" : "#fff",
                              fontSize: 12, fontWeight: 700,
                              fontFamily: "Space Grotesk, sans-serif",
                              cursor: isSaving ? "not-allowed" : "pointer",
                              boxShadow: isSaving ? "none" : "0 2px 8px rgba(37,99,235,0.28)",
                              transition: "all 0.15s",
                              whiteSpace: "nowrap",
                            }}
                            onMouseEnter={e => { if (!isSaving) (e.currentTarget as HTMLButtonElement).style.background = "#1d4ed8"; }}
                            onMouseLeave={e => { if (!isSaving) (e.currentTarget as HTMLButtonElement).style.background = "#2563eb"; }}
                          >
                            {isSaving
                              ? <span style={{ fontSize: 12 }}>...</span>
                              : <><Save size={13} /> Salvar</>
                            }
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Sticky batch action bar */}
          {selectedIds.length > 0 && (
            <div style={{
              position: "sticky", bottom: 0, zIndex: 10,
              background: "#fff7ed", borderTop: "1px solid rgba(253,215,170,0.5)",
              padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#fde68a", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Archive size={16} color="#b45309" />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#92400e", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                  {selectedIds.length} item(ns) selecionado(s)
                </span>
              </div>
              <button data-testid="button-bulk-confirm" onClick={handleBulk} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "10px 22px", borderRadius: 10, border: "none",
                background: "#b45309", color: "#fff", fontSize: 13,
                cursor: "pointer", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                boxShadow: "0 2px 8px rgba(180,83,9,0.3)",
              }}>
                Confirmar Triagem em Lote
              </button>
            </div>
          )}
        </div>
      )}

      {/* Footer tip */}
      <footer style={{ marginTop: 40, display: "flex", alignItems: "center", gap: 6 }}>
        <ScanSearch size={14} color="#94a3b8" />
        <span style={{ fontSize: 12, color: "#94a3b8", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
          Atalho: Pressione <kbd style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 4, padding: "1px 6px", fontSize: 11, fontFamily: "DM Mono, monospace" }}>Enter</kbd> no campo de observação para salvar rapidamente a linha.
        </span>
      </footer>
    </div>
  );
}
