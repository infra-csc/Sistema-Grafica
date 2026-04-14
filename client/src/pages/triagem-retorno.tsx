import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { InventoryAsset } from "@shared/schema";
import {
  ScanSearch, CheckCircle2, Warehouse, Archive, Package, Save,
  CalendarDays, Tag, X, Scissors, Sparkles, Hammer, Trash2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
const CONDITIONS = ["PERFEITO", "AVARIA_LEVE", "SUCATA"] as const;
type Condition = typeof CONDITIONS[number];

const CONDITION_META: Record<Condition, { label: string; color: string; bg: string; border: string; key: string; Icon: React.ElementType }> = {
  PERFEITO:    { label: "Perfeito",    color: "#16a34a", bg: "#f0fdf4", border: "#86efac", key: "1", Icon: Sparkles },
  AVARIA_LEVE: { label: "Avaria",      color: "#b45309", bg: "#fffbeb", border: "#fcd34d", key: "2", Icon: Hammer   },
  SUCATA:      { label: "Sucata",      color: "#dc2626", bg: "#fff1f2", border: "#fca5a5", key: "3", Icon: Trash2   },
};

type TriagemResult = "NO_GALPAO" | "DESCARTADO";
const RESULT_META: Record<TriagemResult, { label: string; color: string; bg: string; border: string }> = {
  NO_GALPAO:  { label: "Galpão",    color: "#166534", bg: "#f0fdf4", border: "#86efac" },
  DESCARTADO: { label: "Descartar", color: "#991b1b", bg: "#fff1f2", border: "#fca5a5" },
};

interface SplitLine { qty: number; condition: Condition; result: TriagemResult; }
interface TriagemEntry { splits: SplitLine[]; notes: string; selected: boolean; }

function makeSplits(totalQty: number): SplitLine[] {
  return [{ qty: totalQty, condition: "PERFEITO", result: "NO_GALPAO" }];
}

type EnrichedAsset = InventoryAsset & {
  eventName: string | null;
  eventDate: string | null;
  sponsors: { id: string; name: string }[];
};

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, Icon, color, iconBg }: {
  label: string; value: number; Icon: React.ElementType; color: string; iconBg: string;
}) {
  return (
    <div style={{
      background: "#fff", padding: "20px 24px", borderRadius: 16,
      border: "1px solid #e2e8f0", display: "flex", alignItems: "center",
      justifyContent: "space-between", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
    }}>
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
  if (!sponsors || sponsors.length === 0)
    return <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "Plus Jakarta Sans, sans-serif", fontStyle: "italic" }}>sem patrocinador</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {sponsors.map(s => (
        <span key={s.id} style={{
          display: "inline-flex", alignItems: "center", gap: 3,
          padding: "3px 8px", borderRadius: 6,
          background: "#f1f5f9", border: "1px solid #e2e8f0",
          fontSize: 10, fontWeight: 700, color: "#475569",
          fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.06em",
          textTransform: "uppercase", whiteSpace: "nowrap",
        }}>
          <Tag size={9} />{s.name}
        </span>
      ))}
    </div>
  );
}

// ─── TriageActionToggles ──────────────────────────────────────────────────────
function TriageActionToggles({
  condition, result, onCondition, onResult, disabled,
}: {
  condition: Condition;
  result: TriagemResult;
  onCondition: (c: Condition) => void;
  onResult: (r: TriagemResult) => void;
  disabled?: boolean;
}) {
  const btnBase: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "4px 10px", borderRadius: 6, cursor: disabled ? "default" : "pointer",
    fontSize: 10, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif",
    letterSpacing: "0.05em", textTransform: "uppercase", transition: "all 0.12s",
    whiteSpace: "nowrap",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {/* Condição */}
      <div style={{ display: "flex", gap: 3 }}>
        {(Object.entries(CONDITION_META) as [Condition, typeof CONDITION_META[Condition]][]).map(([val, meta]) => {
          const active = condition === val;
          return (
            <button key={val} onClick={() => !disabled && onCondition(val)} title={`Tecla ${meta.key}`}
              style={{
                ...btnBase,
                background: active ? meta.bg : "#f8fafc",
                color: active ? meta.color : "#94a3b8",
                border: active ? `1px solid ${meta.border}` : "1px solid #e2e8f0",
                boxShadow: active ? `0 1px 4px ${meta.color}18` : "none",
              }}>
              <meta.Icon size={11} />
              {meta.label}
            </button>
          );
        })}
      </div>
      {/* Destino */}
      <div style={{ display: "flex", gap: 3 }}>
        {(Object.entries(RESULT_META) as [TriagemResult, typeof RESULT_META[TriagemResult]][]).map(([val, meta]) => {
          const active = result === val;
          return (
            <button key={val} onClick={() => !disabled && onResult(val)}
              style={{
                ...btnBase,
                background: active ? meta.bg : "#f8fafc",
                color: active ? meta.color : "#94a3b8",
                border: active ? `1px solid ${meta.border}` : "1px solid #e2e8f0",
                boxShadow: active ? `0 1px 4px ${meta.color}18` : "none",
              }}>
              {meta.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Split Progress Bar ───────────────────────────────────────────────────────
const PROG_COLORS: Record<Condition, string> = {
  PERFEITO: "#16a34a", AVARIA_LEVE: "#f59e0b", SUCATA: "#dc2626",
};
function SplitProgress({ splits, total }: { splits: SplitLine[]; total: number }) {
  const sum = splits.reduce((s, l) => s + l.qty, 0);
  const pct = Math.min(100, Math.round((sum / total) * 100));
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ height: 6, borderRadius: 3, background: "#f1f5f9", overflow: "hidden", display: "flex" }}>
        {splits.map((s, i) => (
          <div key={i} style={{
            height: "100%",
            width: `${(s.qty / total) * 100}%`,
            background: PROG_COLORS[s.condition],
            transition: "width 0.2s",
          }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
        <span style={{ fontSize: 9, fontFamily: "DM Mono, monospace", fontWeight: 700, color: pct === 100 ? "#16a34a" : "#dc2626" }}>
          {sum}/{total} un ({pct}%)
        </span>
        {pct < 100 && (
          <span style={{ fontSize: 9, fontFamily: "DM Mono, monospace", color: "#94a3b8" }}>
            faltam {total - sum} un
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TriagemRetorno() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<Record<string, TriagemEntry>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [filterEvent, setFilterEvent] = useState("all");
  const [filterSponsor, setFilterSponsor] = useState("all");
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const { data: awaitingAssets = [], isLoading, refetch } = useQuery<EnrichedAsset[]>({
    queryKey: ["/api/inventory/awaiting-triage"],
  });

  const eventOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of awaitingAssets) { if (a.eventName) seen.set(a.eventName, a.eventName); }
    return Array.from(seen.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [awaitingAssets]);

  const sponsorOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of awaitingAssets) { for (const s of (a.sponsors ?? [])) seen.set(s.id, s.name); }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [awaitingAssets]);

  const getEntry = (id: string, totalQty?: number): TriagemEntry =>
    entries[id] ?? { splits: makeSplits(totalQty ?? 1), notes: "", selected: false };

  const updateEntry = (id: string, patch: Partial<TriagemEntry>) =>
    setEntries(prev => ({ ...prev, [id]: { ...getEntry(id), ...patch } }));

  const updateSplit = (id: string, splitIdx: number, patch: Partial<SplitLine>) =>
    setEntries(prev => {
      const e = prev[id] ?? { splits: makeSplits(1), notes: "", selected: false };
      const splits = e.splits.map((s, i) => i === splitIdx ? { ...s, ...patch } : s);
      return { ...prev, [id]: { ...e, splits } };
    });

  const addSplit = (id: string, totalQty: number) =>
    setEntries(prev => {
      const e = prev[id] ?? { splits: makeSplits(totalQty), notes: "", selected: false };
      const usedQty = e.splits.reduce((s, l) => s + l.qty, 0);
      const remaining = totalQty - usedQty;
      if (remaining <= 0) return prev;
      return { ...prev, [id]: { ...e, splits: [...e.splits, { qty: remaining, condition: "PERFEITO", result: "NO_GALPAO" }] } };
    });

  const removeSplit = (id: string, splitIdx: number) =>
    setEntries(prev => {
      const e = prev[id];
      if (!e || e.splits.length <= 1) return prev;
      return { ...prev, [id]: { ...e, splits: e.splits.filter((_, i) => i !== splitIdx) } };
    });

  const isSplitValid = (entry: TriagemEntry, totalQty: number) =>
    entry.splits.reduce((s, l) => s + l.qty, 0) === totalQty;

  const doTriage = async (assetId: string, totalQty: number) => {
    const entry = getEntry(assetId, totalQty);
    if (entry.splits.length === 1) {
      await apiRequest("PATCH", `/api/inventory/${assetId}/triage`, {
        condition: entry.splits[0].condition,
        notes: entry.notes,
        trackingStatus: entry.splits[0].result,
      });
    } else {
      await apiRequest("POST", `/api/inventory/${assetId}/triage-split`, {
        splits: entry.splits.map(s => ({
          qty: s.qty, condition: s.condition,
          trackingStatus: s.result,
          notes: entry.notes,
        })),
      });
    }
    queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    queryClient.invalidateQueries({ queryKey: ["/api/inventory/awaiting-triage"] });
  };

  const handleSingle = useCallback(async (asset: EnrichedAsset) => {
    const totalQty = asset.quantity ?? 1;
    const entry = getEntry(asset.id, totalQty);
    if (!isSplitValid(entry, totalQty)) {
      toast({ title: `A soma das quantidades deve ser ${totalQty}.`, variant: "destructive" });
      return;
    }
    if (savedIds.has(asset.id)) return;
    setSavingIds(prev => new Set(Array.from(prev).concat(asset.id)));
    try {
      await doTriage(asset.id, totalQty);
      setSavedIds(prev => new Set(Array.from(prev).concat(asset.id)));
      toast({ title: entry.splits.length > 1 ? `Triagem registrada em ${entry.splits.length} lotes.` : "Triagem registrada." });
    } catch {
      toast({ title: "Erro ao registrar triagem.", variant: "destructive" });
    } finally {
      setSavingIds(prev => { const s = new Set(Array.from(prev)); s.delete(asset.id); return s; });
    }
  }, [entries, savedIds, awaitingAssets]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!focusedId || savedIds.has(focusedId)) return;
      const asset = awaitingAssets.find(a => a.id === focusedId);
      if (!asset) return;
      // Only apply shortcuts when not typing in an input/textarea
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === "INPUT" && (document.activeElement as HTMLInputElement).type === "number") return;
      if (e.key === "1") { e.preventDefault(); updateSplit(focusedId, 0, { condition: "PERFEITO" }); }
      if (e.key === "2") { e.preventDefault(); updateSplit(focusedId, 0, { condition: "AVARIA_LEVE" }); }
      if (e.key === "3") { e.preventDefault(); updateSplit(focusedId, 0, { condition: "SUCATA" }); }
      if (e.key === "Enter" && !e.repeat && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        handleSingle(asset);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [focusedId, savedIds, awaitingAssets, entries, handleSingle]);

  const selectedIds = Object.entries(entries).filter(([, e]) => e.selected).map(([id]) => id);

  const handleBulk = async () => {
    if (selectedIds.length === 0) return;
    setSavingIds(new Set(selectedIds));
    const results = await Promise.allSettled(
      selectedIds.map(id => {
        const asset = awaitingAssets.find(a => a.id === id);
        return doTriage(id, asset?.quantity ?? 1);
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

  const hasFilters = filterEvent !== "all" || filterSponsor !== "all";

  const pendingAssets = awaitingAssets.filter(a => {
    if (savedIds.has(a.id)) return false;
    const me = filterEvent === "all" || a.eventName === filterEvent;
    const msp = filterSponsor === "all" || (a.sponsors ?? []).some(s => s.id === filterSponsor);
    return me && msp;
  });
  const allSelected = pendingAssets.length > 0 && pendingAssets.every(a => getEntry(a.id).selected);

  return (
    <div style={{ padding: "32px 36px", background: "#f8fafc", minHeight: "100vh" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 18, background: "#fffbeb",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 16px rgba(180,83,9,0.14)",
          }}>
            <ScanSearch size={26} color="#b45309" />
          </div>
          <div>
            <h1 style={{ margin: "0 0 4px", fontSize: 30, fontWeight: 800, fontFamily: "Space Grotesk, sans-serif", color: "#0f172a", letterSpacing: "-0.02em", lineHeight: 1 }}>
              Triagem de Retorno
            </h1>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#94a3b8", fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.15em" }}>
              Avalie e destine os materiais retornados
            </p>
          </div>
        </div>
        <button data-testid="button-bulk-triage-header" onClick={handleBulk}
          disabled={selectedIds.length === 0}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "14px 24px", borderRadius: 14, border: "none",
            background: selectedIds.length === 0 ? "#e2e8f0" : "linear-gradient(135deg, #1e40af, #2563eb)",
            color: selectedIds.length === 0 ? "#94a3b8" : "#fff", fontSize: 13,
            cursor: selectedIds.length === 0 ? "not-allowed" : "pointer",
            fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
            boxShadow: selectedIds.length > 0 ? "0 8px 24px rgba(37,99,235,0.35)" : "none",
            transition: "all 0.2s",
          }}>
          <CheckCircle2 size={16} />
          Confirmar Triagem em Lote ({selectedIds.length})
        </button>
      </div>

      {/* ── Stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 32 }}>
        <StatCard label="Aguardando Triagem" value={pendingAssets.length} Icon={ScanSearch} color="#b45309" iconBg="#fde68a" />
        <StatCard label="Selecionados" value={selectedIds.length} Icon={CheckCircle2} color="#16a34a" iconBg="#bbf7d0" />
        <StatCard label="Triados Hoje" value={savedIds.size} Icon={Warehouse} color="#2563eb" iconBg="#bfdbfe" />
      </div>

      {/* ── Filter bar ── */}
      {(eventOptions.length > 0 || sponsorOptions.length > 0) && (
        <div style={{
          background: "#fff", padding: "10px 16px", borderRadius: 16,
          border: "1px solid #e2e8f0", marginBottom: 20,
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}>
          <ScanSearch size={13} color="#94a3b8" />
          <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.1em", marginRight: 4 }}>
            Filtrar
          </span>
          {eventOptions.length > 0 && (
            <select data-testid="select-triage-filter-event" value={filterEvent} onChange={e => setFilterEvent(e.target.value)}
              style={{ border: "none", borderRadius: 10, fontSize: 11, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.06em", padding: "8px 12px", background: filterEvent !== "all" ? "#fef3c7" : "#f8fafc", color: filterEvent !== "all" ? "#b45309" : "#475569", cursor: "pointer", outline: "none", textTransform: "uppercase" }}>
              <option value="all">EVENTO: TODOS</option>
              {eventOptions.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
            </select>
          )}
          {sponsorOptions.length > 0 && (
            <select data-testid="select-triage-filter-sponsor" value={filterSponsor} onChange={e => setFilterSponsor(e.target.value)}
              style={{ border: "none", borderRadius: 10, fontSize: 11, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.06em", padding: "8px 12px", background: filterSponsor !== "all" ? "#f1f5f9" : "#f8fafc", color: filterSponsor !== "all" ? "#475569" : "#475569", cursor: "pointer", outline: "none", textTransform: "uppercase" }}>
              <option value="all">PATROCINADOR: TODOS</option>
              {sponsorOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          )}
          {hasFilters && (
            <>
              <div style={{ width: 1, height: 24, background: "#e2e8f0" }} />
              <button data-testid="button-triage-clear-filters"
                onClick={() => { setFilterEvent("all"); setFilterSponsor("all"); }}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "7px 10px", borderRadius: 8, border: "none", background: "#fef2f2", color: "#ef4444", fontSize: 11, cursor: "pointer", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700 }}>
                <X size={10} /> Limpar
              </button>
            </>
          )}
          <span style={{ marginLeft: "auto", fontSize: 10, color: "#cbd5e1", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {pendingAssets.length} aguardando
          </span>
        </div>
      )}

      {/* ── Main table ── */}
      {isLoading ? (
        <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #e2e8f0", padding: 60, textAlign: "center", color: "#94a3b8", fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 14 }}>
          Carregando materiais para triagem...
        </div>
      ) : pendingAssets.length === 0 && savedIds.size === 0 ? (
        <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #e2e8f0", padding: 80, textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: "#f8fafc", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <ScanSearch size={28} color="#cbd5e1" />
          </div>
          <p style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 8px", fontFamily: "Space Grotesk, sans-serif" }}>Nenhum material aguardando triagem</p>
          <p style={{ fontSize: 13, color: "#64748b", margin: 0, fontFamily: "Plus Jakarta Sans, sans-serif" }}>Os materiais são movidos automaticamente para triagem após o evento.</p>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 20, overflow: "hidden", border: "1px solid #e2e8f0", boxShadow: "0 8px 32px rgba(0,0,0,0.06)" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                  <th style={{ width: 44, padding: "12px 16px", textAlign: "left" }}>
                    <input type="checkbox" data-testid="checkbox-select-all"
                      checked={allSelected} onChange={e => toggleAll(e.target.checked)}
                      style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#2563eb" }} />
                  </th>
                  {[
                    { label: "Material / Qtd", align: "left" },
                    { label: "Evento", align: "left" },
                    { label: "Patrocinadores", align: "left" },
                    { label: "Condição · Destino", align: "left" },
                    { label: "Observação", align: "left" },
                    { label: "Ação", align: "right" },
                  ].map(h => (
                    <th key={h.label} style={{
                      padding: "12px 14px", fontWeight: 700, fontSize: 10,
                      textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8",
                      fontFamily: "Space Grotesk, sans-serif", textAlign: h.align as "left" | "right",
                      whiteSpace: "nowrap",
                    }}>
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...pendingAssets, ...awaitingAssets.filter(a => savedIds.has(a.id))].map(asset => {
                  const qty = asset.quantity ?? 1;
                  const entry = getEntry(asset.id, qty);
                  const isSaved = savedIds.has(asset.id);
                  const isSaving = savingIds.has(asset.id);
                  const splitSum = entry.splits.reduce((s, l) => s + l.qty, 0);
                  const splitValid = splitSum === qty;
                  const isFocused = focusedId === asset.id;

                  return (
                    <tr key={asset.id} data-testid={`row-triage-${asset.id}`}
                      onClick={() => !isSaved && setFocusedId(asset.id)}
                      style={{
                        opacity: isSaved ? 0.55 : 1,
                        background: isSaved ? "#f9fdf9" : isFocused ? "#f8fafc" : "#fff",
                        transition: "background 0.1s",
                        borderBottom: "1px solid #f1f5f9",
                        outline: isFocused && !isSaved ? "2px solid rgba(37,99,235,0.15)" : "none",
                        outlineOffset: -2,
                        cursor: isSaved ? "default" : "pointer",
                      }}
                      onMouseEnter={e => { if (!isSaved && !isFocused) (e.currentTarget as HTMLTableRowElement).style.background = "#f8fafc"; }}
                      onMouseLeave={e => { if (!isSaved && !isFocused) (e.currentTarget as HTMLTableRowElement).style.background = "#fff"; }}
                    >
                      {/* Checkbox */}
                      <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                        {isSaved
                          ? <CheckCircle2 size={17} color="#16a34a" />
                          : <input type="checkbox" data-testid={`checkbox-asset-${asset.id}`}
                              checked={entry.selected}
                              onChange={e => { e.stopPropagation(); updateEntry(asset.id, { selected: e.target.checked }); }}
                              style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#2563eb" }}
                            />
                        }
                      </td>

                      {/* Material + Qty */}
                      <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 38, height: 38, borderRadius: 10, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Package size={17} color="#64748b" />
                          </div>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: "#0f172a", fontFamily: "Plus Jakarta Sans, sans-serif" }}>{asset.name}</p>
                              <span style={{
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                minWidth: 22, height: 20, borderRadius: 6,
                                background: qty > 1 ? "#e0f2fe" : "#f1f5f9",
                                color: qty > 1 ? "#0369a1" : "#64748b",
                                fontSize: 10, fontWeight: 800, fontFamily: "DM Mono, monospace", padding: "0 6px",
                                border: qty > 1 ? "1px solid #bae6fd" : "1px solid #e2e8f0",
                              }}>×{qty}</span>
                            </div>
                            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#94a3b8", fontFamily: "DM Mono, monospace", letterSpacing: "0.04em" }}>
                              {asset.displayId}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Evento */}
                      <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                        {asset.eventName ? (
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                              <CalendarDays size={12} color="#2563eb" />
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", fontFamily: "Plus Jakarta Sans, sans-serif" }}>{asset.eventName}</span>
                            </div>
                            {asset.eventDate && (
                              <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "DM Mono, monospace" }}>
                                {new Date(asset.eventDate).toLocaleDateString("pt-BR")}
                              </span>
                            )}
                          </div>
                        ) : <span style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic", fontFamily: "Plus Jakarta Sans, sans-serif" }}>—</span>}
                      </td>

                      {/* Patrocinadores */}
                      <td style={{ padding: "12px 14px", verticalAlign: "middle", maxWidth: 140 }}>
                        <SponsorChips sponsors={asset.sponsors ?? []} />
                      </td>

                      {/* Condição + Destino (coluna unificada) */}
                      <td style={{ padding: "10px 14px", verticalAlign: "top", minWidth: 280 }}>
                        {isSaved ? (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, background: "#f0fdf4", border: "1px solid #86efac", color: "#16a34a" }}>
                            <CheckCircle2 size={12} />
                            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.08em" }}>Triado</span>
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {entry.splits.map((split, si) => (
                              <div key={si} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                {entry.splits.length > 1 && (
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }}>Lote {si + 1} — Qtd:</span>
                                    <input type="number" min={1} max={qty}
                                      value={split.qty}
                                      onChange={e => updateSplit(asset.id, si, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
                                      onClick={e => e.stopPropagation()}
                                      style={{
                                        padding: "3px 6px", borderRadius: 6, width: 52,
                                        fontSize: 12, fontFamily: "DM Mono, monospace", fontWeight: 700,
                                        textAlign: "center", outline: "none",
                                        background: !splitValid ? "#fff1f2" : "#f8fafc",
                                        color: !splitValid ? "#dc2626" : "#0f172a",
                                        border: !splitValid ? "1px solid #fca5a5" : "1px solid #e2e8f0",
                                        boxSizing: "border-box",
                                      }}
                                    />
                                    <button onClick={e => { e.stopPropagation(); removeSplit(asset.id, si); }}
                                      style={{ border: "none", background: "none", cursor: "pointer", color: "#cbd5e1", padding: 0, display: "flex", alignItems: "center", marginLeft: "auto" }}>
                                      <X size={13} />
                                    </button>
                                  </div>
                                )}
                                <TriageActionToggles
                                  condition={split.condition}
                                  result={split.result}
                                  onCondition={c => updateSplit(asset.id, si, { condition: c })}
                                  onResult={r => updateSplit(asset.id, si, { result: r })}
                                />
                                {entry.splits.length > 1 && si < entry.splits.length - 1 && (
                                  <div style={{ borderTop: "1px dashed #e2e8f0", marginTop: 2 }} />
                                )}
                              </div>
                            ))}
                            {entry.splits.length > 1 && (
                              <SplitProgress splits={entry.splits} total={qty} />
                            )}
                            {qty > 1 && splitSum < qty && (
                              <button onClick={e => { e.stopPropagation(); addSplit(asset.id, qty); }}
                                style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 4, border: "1px dashed #e2e8f0", borderRadius: 6, background: "transparent", cursor: "pointer", color: "#94a3b8", fontSize: 10, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", padding: "4px 8px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                                <Scissors size={10} /> Dividir lote
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Observação */}
                      <td style={{ padding: "12px 14px", verticalAlign: "middle", minWidth: 150 }}>
                        {isSaved ? null : (
                          <input data-testid={`input-notes-${asset.id}`}
                            type="text" placeholder="Adicionar nota..."
                            value={entry.notes}
                            onChange={e => updateEntry(asset.id, { notes: e.target.value })}
                            onClick={e => e.stopPropagation()}
                            onFocus={() => setFocusedId(asset.id)}
                            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleSingle(asset); } }}
                            style={{
                              padding: "6px 10px", borderRadius: 6, border: "1px solid #e2e8f0",
                              fontSize: 11, fontFamily: "Plus Jakarta Sans, sans-serif",
                              background: "#f8fafc", color: "#0f172a", outline: "none",
                              width: "100%", boxSizing: "border-box",
                            }}
                          />
                        )}
                      </td>

                      {/* Ação */}
                      <td style={{ padding: "12px 14px", verticalAlign: "middle", textAlign: "right" }}>
                        {isSaved ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#16a34a", fontSize: 12, fontFamily: "Space Grotesk, sans-serif", fontWeight: 700 }}>
                            <CheckCircle2 size={15} /> Salvo
                          </span>
                        ) : (
                          <button data-testid={`button-save-triage-${asset.id}`}
                            disabled={isSaving || !splitValid}
                            onClick={e => { e.stopPropagation(); handleSingle(asset); }}
                            title={!splitValid ? `Soma deve ser ${qty}` : "Salvar (Enter)"}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 6,
                              padding: "7px 14px", borderRadius: 8, border: "none",
                              background: isSaving || !splitValid ? "#e2e8f0" : "#0f172a",
                              color: isSaving || !splitValid ? "#94a3b8" : "#fff",
                              fontSize: 12, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif",
                              cursor: isSaving || !splitValid ? "not-allowed" : "pointer",
                              boxShadow: !isSaving && splitValid ? "0 2px 6px rgba(15,23,42,0.22)" : "none",
                              transition: "all 0.15s", whiteSpace: "nowrap",
                            }}>
                            {isSaving ? "..." : <><Save size={13} /> Salvar</>}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Sticky batch bar */}
          {selectedIds.length > 0 && (
            <div style={{ position: "sticky", bottom: 0, zIndex: 10, background: "#fff7ed", borderTop: "1px solid rgba(253,215,170,0.5)", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#fde68a", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Archive size={16} color="#b45309" />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#92400e", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                  {selectedIds.length} item(ns) selecionado(s)
                </span>
              </div>
              <button data-testid="button-bulk-confirm" onClick={handleBulk} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 22px", borderRadius: 10, border: "none", background: "#b45309", color: "#fff", fontSize: 13, cursor: "pointer", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, boxShadow: "0 2px 8px rgba(180,83,9,0.3)" }}>
                Confirmar Triagem em Lote
              </button>
            </div>
          )}
        </div>
      )}

      {/* Footer shortcuts */}
      <footer style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ScanSearch size={13} color="#94a3b8" />
          <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
            Clique na linha para focar, depois use os atalhos:
          </span>
        </div>
        {[["1", "Perfeito"], ["2", "Avaria Leve"], ["3", "Sucata"], ["Enter", "Salvar linha"]].map(([key, label]) => (
          <span key={key} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#64748b", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
            <kbd style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 5, padding: "2px 7px", fontSize: 11, fontFamily: "DM Mono, monospace", color: "#0f172a" }}>{key}</kbd>
            {label}
          </span>
        ))}
      </footer>
    </div>
  );
}
