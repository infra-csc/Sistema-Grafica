import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { InventoryAsset, Sponsor } from "@shared/schema";
import {
  ScanSearch, CheckCircle2, Warehouse, Archive, Package, Save,
  CalendarDays, Tag, X, Scissors, Sparkles, Hammer, Trash2, Eye, Wrench,
  MapPin, ClipboardCheck, Users, Search,
} from "lucide-react";
import { TriagemModal } from "@/components/triagem-modal";
import { useAuth } from "@/contexts/auth-context";

// ─── Types ────────────────────────────────────────────────────────────────────
const CONDITIONS = ["PERFEITO", "AVARIA_LEVE", "SUCATA"] as const;
type Condition = typeof CONDITIONS[number];

const CONDITION_META: Record<Condition, { label: string; color: string; bg: string; border: string; key: string; Icon: React.ElementType }> = {
  PERFEITO:    { label: "Perfeito",    color: "#16a34a", bg: "#f0fdf4", border: "#86efac", key: "1", Icon: Sparkles },
  AVARIA_LEVE: { label: "Avaria",      color: "#b45309", bg: "#fffbeb", border: "#fcd34d", key: "2", Icon: Hammer   },
  SUCATA:      { label: "Sucata",      color: "#dc2626", bg: "#fff1f2", border: "#fca5a5", key: "3", Icon: Trash2   },
};

type TriagemResult = "NO_GALPAO" | "MANUTENCAO" | "DESCARTADO";
const RESULT_META: Record<TriagemResult, { label: string; color: string; bg: string; border: string; activeBg: string; activeColor: string }> = {
  NO_GALPAO:  { label: "Galpão",       color: "#1e40af", bg: "#eff6ff", border: "#93c5fd", activeBg: "#1e40af", activeColor: "#fff" },
  MANUTENCAO: { label: "Manutenção",   color: "#92400e", bg: "#fffbeb", border: "#fcd34d", activeBg: "#fef3c7", activeColor: "#92400e" },
  DESCARTADO: { label: "Descartar",    color: "#991b1b", bg: "#fff1f2", border: "#fca5a5", activeBg: "#dc2626", activeColor: "#fff" },
};

interface SplitLine { qty: number; condition: Condition | null; result: TriagemResult; }
interface TriagemEntry { splits: SplitLine[]; notes: string; selected: boolean; mode: "all" | "split"; }

function makeSplits(totalQty: number): SplitLine[] {
  return [{ qty: totalQty, condition: "PERFEITO", result: "NO_GALPAO" }];
}

// ─── ThumbCell — fallback quando a imagem falha ou URL está vazia ─────────────
function ThumbCell({ url, size = 15 }: { url?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <Package size={size} color="#94a3b8" />;
  return (
    <img
      src={url}
      alt=""
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
      onError={() => setFailed(true)}
    />
  );
}

function makeEntry(totalQty: number): TriagemEntry {
  return { splits: makeSplits(totalQty), notes: "", selected: false, mode: "all" };
}

type EnrichedAsset = InventoryAsset & {
  eventName: string | null;
  eventDate: string | null;
  sponsors: { id: string; name: string }[];
};

// ─── Stat card (matches estoque layout) ───────────────────────────────────────
function StatCard({ label, value, color, Icon }: {
  label: string; value: number; color: string; Icon: React.ElementType;
}) {
  return (
    <div style={{
      background: "#fff",
      padding: "20px 22px 18px",
      borderRadius: 14,
      border: "1px solid #e2e8f0",
      borderBottom: `4px solid ${color}`,
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.18em" }}>
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ margin: 0, fontSize: 32, fontWeight: 900, color, fontFamily: "Space Grotesk, sans-serif", letterSpacing: "-0.04em", lineHeight: 1 }}>
          {value}
        </p>
        <Icon size={32} color={color} style={{ opacity: 0.15 }} />
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

// ─── ConditionToggles ─────────────────────────────────────────────────────────
function ConditionToggles({ condition, onCondition, disabled, grayscale }: {
  condition: Condition | null; onCondition: (c: Condition) => void;
  disabled?: boolean; grayscale?: boolean;
}) {
  return (
    <div style={{
      display: "inline-flex", background: "#f3f4f3", padding: 4, borderRadius: 8,
      filter: grayscale ? "grayscale(1)" : "none",
    }}>
      {(Object.entries(CONDITION_META) as [Condition, typeof CONDITION_META[Condition]][]).map(([val, meta]) => {
        const active = condition === val;
        return (
          <button key={val} onClick={() => !disabled && onCondition(val)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "5px 10px", borderRadius: 6, border: "none",
              cursor: disabled ? "default" : "pointer",
              fontSize: 10, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif",
              letterSpacing: "0.04em", textTransform: "uppercase",
              whiteSpace: "nowrap", transition: "all 0.12s",
              background: active ? "#fff" : "transparent",
              color: active ? meta.color : "#94a3b8",
              boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
            }}>
            <meta.Icon size={10} />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── ResultToggles ─────────────────────────────────────────────────────────────
function ResultToggles({ result, onResult, disabled, grayscale }: {
  result: TriagemResult; onResult: (r: TriagemResult) => void;
  disabled?: boolean; grayscale?: boolean;
}) {
  return (
    <div style={{
      display: "inline-flex", background: "#f3f4f3", padding: 4, borderRadius: 8,
      filter: grayscale ? "grayscale(1)" : "none",
    }}>
      {(Object.entries(RESULT_META) as [TriagemResult, typeof RESULT_META[TriagemResult]][]).map(([val, meta]) => {
        const active = result === val;
        return (
          <button key={val} onClick={() => !disabled && onResult(val)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "5px 10px", borderRadius: 6, border: "none",
              cursor: disabled ? "default" : "pointer",
              fontSize: 10, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif",
              letterSpacing: "0.04em", textTransform: "uppercase",
              whiteSpace: "nowrap", transition: "all 0.12s",
              background: active ? meta.activeBg : "transparent",
              color: active ? meta.activeColor : "#94a3b8",
              boxShadow: active ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
            }}>
            {val === "MANUTENCAO" && <Wrench size={9} />}
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── TriageActionToggles (combined — used in split cards) ─────────────────────
function TriageActionToggles({
  condition, result, onCondition, onResult, disabled,
}: {
  condition: Condition | null; result: TriagemResult;
  onCondition: (c: Condition) => void; onResult: (r: TriagemResult) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <ConditionToggles condition={condition} onCondition={onCondition} disabled={disabled} />
      <ResultToggles result={result} onResult={onResult} disabled={disabled} />
    </div>
  );
}

// ─── LabeledTriageToggles (main table — shows CONDIÇÃO / DESTINO labels) ──────
function LabeledTriageToggles({
  condition, result, onCondition, onResult, disabled, grayscale,
}: {
  condition: Condition | null; result: TriagemResult;
  onCondition: (c: Condition) => void; onResult: (r: TriagemResult) => void;
  disabled?: boolean; grayscale?: boolean;
}) {
  const labelStyle: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, color: "#94a3b8",
    fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase",
    letterSpacing: "0.1em", minWidth: 62, flexShrink: 0,
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 7 }}>
        <span style={labelStyle}>Condição</span>
        <ConditionToggles condition={condition} onCondition={onCondition} disabled={disabled} grayscale={grayscale} />
      </div>
      <div style={{ height: 1, background: "#f1f5f9", marginBottom: 7 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={labelStyle}>Destino</span>
        <ResultToggles result={result} onResult={onResult} disabled={disabled} grayscale={grayscale} />
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
            background: s.condition ? PROG_COLORS[s.condition] : "#e2e8f0",
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
  const { user } = useAuth();
  const [entries, setEntries] = useState<Record<string, TriagemEntry>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [filterEvent, setFilterEvent] = useState("all");
  const [filterSponsor, setFilterSponsor] = useState("all");
  const [filterLocation, setFilterLocation] = useState("all");
  const [search, setSearch] = useState("");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<EnrichedAsset | null>(null);

  const { data: awaitingAssets = [], isLoading, refetch } = useQuery<EnrichedAsset[]>({
    queryKey: ["/api/inventory/awaiting-triage"],
  });
  const { data: allItems = [] } = useQuery<any[]>({ queryKey: ["/api/items"] });
  const { data: allSponsors = [] } = useQuery<Sponsor[]>({ queryKey: ["/api/sponsors"] });

  const eventOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of awaitingAssets) { if (a.eventName) seen.set(a.eventName, a.eventName); }
    return Array.from(seen.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [awaitingAssets]);

  const sponsorOptions = useMemo(() =>
    [...allSponsors].sort((a, b) => a.name.localeCompare(b.name)),
  [allSponsors]);

  const locationOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const a of awaitingAssets) { if (a.location) seen.add(a.location); }
    return Array.from(seen).sort();
  }, [awaitingAssets]);

  const getEntry = (id: string, totalQty?: number): TriagemEntry =>
    entries[id] ?? makeEntry(totalQty ?? 1);

  const updateEntry = (id: string, patch: Partial<TriagemEntry>) =>
    setEntries(prev => ({ ...prev, [id]: { ...getEntry(id), ...patch } }));

  const updateSplit = (id: string, splitIdx: number, patch: Partial<SplitLine>) =>
    setEntries(prev => {
      const e = prev[id] ?? makeEntry(1);
      const splits = e.splits.map((s, i) => i === splitIdx ? { ...s, ...patch } : s);
      return { ...prev, [id]: { ...e, splits } };
    });

  const addSplit = (id: string, totalQty: number) =>
    setEntries(prev => {
      const e = prev[id] ?? makeEntry(totalQty);
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

  // Stepper: +/- for split qty, clamped to keep sum <= totalQty
  const stepSplit = (id: string, splitIdx: number, delta: number, totalQty: number) =>
    setEntries(prev => {
      const e = prev[id] ?? makeEntry(totalQty);
      const otherSum = e.splits.reduce((s, l, i) => i !== splitIdx ? s + l.qty : s, 0);
      const maxForThis = totalQty - otherSum;
      const newQty = Math.max(1, Math.min(maxForThis, e.splits[splitIdx].qty + delta));
      const splits = e.splits.map((s, i) => i === splitIdx ? { ...s, qty: newQty } : s);
      return { ...prev, [id]: { ...e, splits } };
    });

  // Switch mode: "all" resets to single split; "split" enters divide mode
  const setMode = (id: string, mode: "all" | "split", totalQty: number) =>
    setEntries(prev => {
      const e = prev[id] ?? makeEntry(totalQty);
      if (mode === "all") {
        // Keep condition/result from first split but reset qty to total
        const first = e.splits[0];
        return { ...prev, [id]: { ...e, mode: "all", splits: [{ qty: totalQty, condition: first.condition, result: first.result }] } };
      }
      // Split mode: start with the single split (user will add more)
      return { ...prev, [id]: { ...e, mode: "split" } };
    });

  // Quick presets — reset splits to single batch but KEEP the current mode
  const applyPreset = (id: string, condition: Condition, result: TriagemResult, totalQty: number) =>
    setEntries(prev => {
      const e = prev[id] ?? makeEntry(totalQty);
      return {
        ...prev,
        [id]: { ...e, splits: [{ qty: totalQty, condition, result }] },
      };
    });

  // Bulk preset — preenche todas as linhas selecionadas na UI sem salvar
  const applyBulkPreset = (condition: Condition, result: TriagemResult) => {
    setEntries(prev => {
      const next = { ...prev };
      selectedIds.forEach(id => {
        const asset = awaitingAssets.find(a => a.id === id);
        const qty = asset?.quantity ?? 1;
        const e = next[id] ?? makeEntry(qty);
        next[id] = { ...e, splits: [{ qty, condition, result }] };
      });
      return next;
    });
  };

  // Smart condition update: auto-sets result based on condition (user can override after)
  const smartUpdateSplit = (id: string, splitIdx: number, condition: Condition) => {
    const patch: Partial<SplitLine> = { condition };
    if (condition === "PERFEITO")    patch.result = "NO_GALPAO";
    if (condition === "AVARIA_LEVE") patch.result = "MANUTENCAO";
    if (condition === "SUCATA")      patch.result = "DESCARTADO";
    updateSplit(id, splitIdx, patch);
  };

  const isSplitValid = (entry: TriagemEntry, totalQty: number) =>
    entry.splits.reduce((s, l) => s + l.qty, 0) === totalQty &&
    entry.splits.every(l => l.condition !== null);

  // MANUTENCAO é um conceito de UI — no banco mapeia para NO_GALPAO (condição AVARIA_LEVE indica a necessidade de reparo)
  const toDbStatus = (r: TriagemResult): string => r === "DESCARTADO" ? "DESCARTADO" : "NO_GALPAO";

  const doTriage = async (assetId: string, totalQty: number) => {
    const entry = getEntry(assetId, totalQty);
    if (entry.splits.length === 1) {
      await apiRequest("PATCH", `/api/inventory/${assetId}/triage`, {
        condition: entry.splits[0].condition,
        notes: entry.notes,
        trackingStatus: toDbStatus(entry.splits[0].result),
      });
    } else {
      await apiRequest("POST", `/api/inventory/${assetId}/triage-split`, {
        splits: entry.splits.map(s => ({
          qty: s.qty, condition: s.condition,
          trackingStatus: toDbStatus(s.result),
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
    if (entry.splits.some(l => l.condition === null)) {
      toast({ title: "Selecione a condição antes de salvar.", variant: "destructive" });
      return;
    }
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

  // ── pendingAssets ──────────────────────────────────────────────────────────────
  const pendingAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return awaitingAssets.filter(a => {
      if (savedIds.has(a.id)) return false;
      const me = filterEvent === "all" || a.eventName === filterEvent;
      const msp = filterSponsor === "all" || (a.sponsors ?? []).some(s => s.id === filterSponsor);
      const mloc = filterLocation === "all" || a.location === filterLocation;
      const msearch = !q || (a.name ?? "").toLowerCase().includes(q) || (a.displayId ?? "").toLowerCase().includes(q) || (a.location ?? "").toLowerCase().includes(q);
      return me && msp && mloc && msearch;
    });
  }, [awaitingAssets, savedIds, filterEvent, filterSponsor, filterLocation, search]);

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

  const hasFilters = filterEvent !== "all" || filterSponsor !== "all" || filterLocation !== "all" || !!search;

  const allSelected = pendingAssets.length > 0 && pendingAssets.every(a => getEntry(a.id).selected);

  const filterLabel: React.CSSProperties = {
    display: "block", fontSize: 10, fontWeight: 900,
    textTransform: "uppercase", letterSpacing: "0.09em",
    color: "#78716c", marginBottom: 8,
  };
  const selectTriggerStyle: React.CSSProperties = {
    backgroundColor: "#ffffff", border: "1px solid #e7e5e4",
    borderRadius: 0, height: 40, fontSize: 13, color: "#1c1917",
  };

  const TH: React.CSSProperties = {
    padding: "14px 20px", fontSize: 10, fontWeight: 800, letterSpacing: "0.14em",
    textTransform: "uppercase", color: "#fff", fontFamily: "Space Grotesk, sans-serif",
    textAlign: "left", background: "#0f172a", borderBottom: "none",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ padding: "32px 36px", background: "#f8fafc", height: "100%", overflowY: "auto", display: "flex", flexDirection: "column", gap: 28 }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: "#c2610c", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 12px 32px rgba(194,97,12,0.30)" }}>
            <ClipboardCheck size={22} color="#fff" strokeWidth={2.2} />
          </div>
          <div>
            <h1 style={{ margin: "0 0 3px", fontSize: 28, fontWeight: 900, fontFamily: "Space Grotesk, sans-serif", color: "#0f172a", letterSpacing: "-0.03em", lineHeight: 1 }}>
              Triagem de Retorno
            </h1>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: "#94a3b8", fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.18em" }}>
              Logística reversa · avaliação de condição e destino
            </p>
          </div>
        </div>
        <button data-testid="button-bulk-triage-header" onClick={handleBulk}
          disabled={selectedIds.length === 0}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "12px 24px", borderRadius: 12, border: "none", flexShrink: 0,
            background: selectedIds.length === 0 ? "#e2e8f0" : "#c2610c",
            color: selectedIds.length === 0 ? "#94a3b8" : "#fff", fontSize: 13,
            cursor: selectedIds.length === 0 ? "not-allowed" : "pointer",
            fontFamily: "Space Grotesk, sans-serif", fontWeight: 800, letterSpacing: "0.06em",
            boxShadow: selectedIds.length === 0 ? "none" : "0 8px 24px rgba(194,97,12,0.35)",
            transition: "all 0.2s",
          }}>
          <CheckCircle2 size={15} />
          Confirmar Lote ({selectedIds.length})
        </button>
      </div>

      {/* ── Stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        <StatCard label="Na Fila" value={awaitingAssets.length} color="#c2610c" Icon={ScanSearch} />
        <StatCard label="Selecionados" value={selectedIds.length} color="#16a34a" Icon={Users} />
        <StatCard label="Triados Hoje" value={savedIds.size} color="#2563eb" Icon={CheckCircle2} />
      </div>

      {/* ── Filter bar ── */}
      {(() => {
        const FL: React.CSSProperties = {
          fontSize: 11, fontWeight: 500, color: "#94a3b8",
          fontFamily: "Plus Jakarta Sans, sans-serif", marginBottom: 6, display: "block",
        };
        const SEL = (active: boolean): React.CSSProperties => ({
          height: 44, width: "100%",
          border: `1.5px solid ${active ? "#c2610c" : "#e2e8f0"}`,
          borderRadius: 8, fontSize: 13, fontWeight: 500,
          fontFamily: "Plus Jakarta Sans, sans-serif",
          padding: "0 12px", background: "#fff",
          color: active ? "#c2610c" : "#374151",
          cursor: "pointer", outline: "none",
          transition: "border-color 0.15s",
        });
        return (
          <div style={{
            background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0",
            padding: "16px 20px 18px",
            display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap",
          }}>
            {/* Evento */}
            <div style={{ display: "flex", flexDirection: "column", flex: "1 1 160px" }}>
              <label style={FL}>Evento</label>
              <select data-testid="select-triage-filter-event" value={filterEvent} onChange={e => setFilterEvent(e.target.value)} style={SEL(filterEvent !== "all")}>
                <option value="all">Todos os eventos</option>
                {eventOptions.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
              </select>
            </div>

            {/* Patrocinador */}
            <div style={{ display: "flex", flexDirection: "column", flex: "1 1 180px" }}>
              <label style={FL}>Patrocinador</label>
              <select data-testid="select-triage-filter-sponsor" value={filterSponsor} onChange={e => setFilterSponsor(e.target.value)} style={SEL(filterSponsor !== "all")}>
                <option value="all">Todos os patrocinadores</option>
                {sponsorOptions.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
              </select>
            </div>

            {/* Local */}
            {locationOptions.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", flex: "1 1 130px" }}>
                <label style={FL}>Local</label>
                <select data-testid="select-triage-filter-location" value={filterLocation} onChange={e => setFilterLocation(e.target.value)} style={SEL(filterLocation !== "all")}>
                  <option value="all">Todos os locais</option>
                  {locationOptions.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                </select>
              </div>
            )}

            {/* Buscar */}
            <div style={{ display: "flex", flexDirection: "column", flex: "1 1 150px" }}>
              <label style={FL}>Buscar</label>
              <div style={{ position: "relative" }}>
                <Search size={14} color="#94a3b8" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                <input
                  data-testid="input-triage-search"
                  style={{
                    width: "100%", paddingLeft: 34, paddingRight: 12, height: 44,
                    border: `1.5px solid ${search ? "#c2610c" : "#e2e8f0"}`, borderRadius: 8,
                    fontSize: 13, fontWeight: 400, fontFamily: "Plus Jakarta Sans, sans-serif",
                    background: "#fff", color: "#374151", outline: "none", boxSizing: "border-box",
                    transition: "border-color 0.15s",
                  }}
                  onFocus={e => (e.target.style.borderColor = "#c2610c")}
                  onBlur={e => (e.target.style.borderColor = search ? "#c2610c" : "#e2e8f0")}
                  placeholder="Nome ou ID..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Limpar + contador */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginLeft: "auto" }}>
              <button
                data-testid="button-triage-clear-filters"
                disabled={!hasFilters}
                onClick={() => { setFilterEvent("all"); setFilterSponsor("all"); setFilterLocation("all"); setSearch(""); }}
                style={{
                  height: 44, display: "flex", alignItems: "center", gap: 5, padding: "0 14px",
                  borderRadius: 8,
                  border: `1.5px solid ${hasFilters ? "#fecaca" : "#e2e8f0"}`,
                  background: hasFilters ? "#fef2f2" : "#f8fafc",
                  color: hasFilters ? "#ef4444" : "#cbd5e1",
                  fontSize: 12, cursor: hasFilters ? "pointer" : "not-allowed",
                  fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                  transition: "all 0.15s",
                }}>
                <X size={12} /> Limpar filtros
              </button>
              <span style={{ fontSize: 11, color: "#cbd5e1", fontFamily: "DM Mono, monospace", fontWeight: 600, whiteSpace: "nowrap", paddingBottom: 12 }}>
                {pendingAssets.length} pend. · {savedIds.size} triados
              </span>
            </div>
          </div>
        );
      })()}

      {/* ── Table ── */}
      <div>
      {isLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : pendingAssets.length === 0 && savedIds.size === 0 ? (
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: 60, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "#f8fafc", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <ScanSearch size={24} color="#cbd5e1" />
          </div>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "0 0 6px", fontFamily: "Space Grotesk, sans-serif" }}>Nenhum material aguardando triagem</p>
          <p style={{ color: "#94a3b8", fontSize: 12, fontFamily: "Plus Jakarta Sans, sans-serif", margin: 0 }}>Os materiais são movidos automaticamente para triagem após o evento.</p>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.05)" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ ...TH, width: 44, paddingLeft: 20 }}>
                    <input type="checkbox" data-testid="checkbox-select-all"
                      checked={allSelected} onChange={e => toggleAll(e.target.checked)}
                      style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#c2610c" }} />
                  </th>
                  {[
                    { label: "Material / Qtd", align: "left" },
                    { label: "Evento", align: "left" },
                    { label: "Patrocinadores", align: "left" },
                    { label: "Condição · Destino", align: "left" },
                    { label: "Observação", align: "left" },
                    { label: "Ação", align: "right" },
                  ].map(h => (
                    <th key={h.label} style={{ ...TH, textAlign: h.align as "left" | "right" }}>
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...pendingAssets, ...awaitingAssets.filter(a => savedIds.has(a.id))].map((asset, idx) => {
                  const qty = asset.quantity ?? 1;
                  const entry = getEntry(asset.id, qty);
                  const isSaved = savedIds.has(asset.id);
                  const isSaving = savingIds.has(asset.id);
                  const splitSum = entry.splits.reduce((s, l) => s + l.qty, 0);
                  const splitValid = splitSum === qty;
                  const isFocused = focusedId === asset.id;
                  const condRingColor = entry.splits[0].condition
                    ? ({ PERFEITO: "#16a34a", AVARIA_LEVE: "#f59e0b", SUCATA: "#dc2626" } as Record<Condition,string>)[entry.splits[0].condition]
                    : "#e2e8f0";
                  const thumbRing = isSaved ? "0 0 0 2px #e2e8f0" : `0 0 0 2px ${condRingColor}`;

                  const baseRowBg = idx % 2 === 1 ? "#fafaf9" : "#ffffff";
                  return (
                    <tr key={asset.id} data-testid={`row-triage-${asset.id}`}
                      onClick={() => {
                        if (!isSaved) {
                          setFocusedId(asset.id);
                          updateEntry(asset.id, { selected: !entry.selected });
                        }
                      }}
                      style={{
                        opacity: isSaved ? 0.5 : 1,
                        filter: isSaved ? "grayscale(0.5)" : "none",
                        backgroundColor: isFocused && !isSaved ? "#f8fafc" : "#fff",
                        transition: "background-color 0.12s",
                        borderBottom: "1px solid rgba(226,232,240,0.6)",
                        borderLeft: isFocused && !isSaved ? "3px solid #c2610c" : "3px solid transparent",
                        cursor: isSaved ? "default" : "pointer",
                        pointerEvents: isSaved ? "none" : "auto",
                      }}
                      onMouseEnter={e => { if (!isSaved && !isFocused) (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "#f8fafc"; }}
                      onMouseLeave={e => { if (!isSaved && !isFocused) (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "#fff"; }}
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
                      <td style={{ padding: "10px 14px", verticalAlign: "middle" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {/* Thumb / icon — ring muda com a condição */}
                          <div style={{
                            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                            background: "#f1f5f9",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            overflow: "hidden",
                            boxShadow: thumbRing,
                            transition: "box-shadow 0.2s",
                          }}>
                            <ThumbCell url={asset.approvalThumbUrl} size={15} />
                          </div>
                          {/* Text: ID acima do nome */}
                          <div>
                            <span style={{ fontSize: 10, color: "#c2610c", fontFamily: "DM Mono, monospace", fontWeight: 600, letterSpacing: "0.04em", display: "block", marginBottom: 2 }}>
                              {asset.displayId}
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", fontFamily: "Plus Jakarta Sans, sans-serif" }}>{asset.name}</span>
                              <span style={{
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                height: 18, borderRadius: 5, padding: "0 5px",
                                background: qty > 1 ? "#0f172a" : "#f1f5f9",
                                color: qty > 1 ? "#fff" : "#94a3b8",
                                fontSize: 10, fontWeight: 800, fontFamily: "DM Mono, monospace",
                              }}>+{qty}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Evento */}
                      <td style={{ padding: "10px 14px", verticalAlign: "middle", minWidth: 190 }}>
                        {asset.eventName ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {/* Linha 1: ícone + nome */}
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{
                                display: "flex", alignItems: "center", justifyContent: "center",
                                padding: 6, background: "#eff6ff", borderRadius: 6, flexShrink: 0,
                              }}>
                                <CalendarDays size={14} color="#2563eb" />
                              </span>
                              <span style={{
                                fontSize: 13, fontWeight: 700, color: "#0f172a",
                                fontFamily: "Plus Jakarta Sans, sans-serif", lineHeight: 1.25,
                              }}>
                                {asset.eventName}
                              </span>
                            </div>
                            {/* Linha 2: data + local mockado */}
                            <div style={{ paddingLeft: 34, display: "flex", alignItems: "center", gap: 6 }}>
                              {asset.eventDate && (
                                <span style={{
                                  fontFamily: "DM Mono, monospace", fontSize: 11,
                                  color: "#64748b", letterSpacing: "-0.02em",
                                }}>
                                  {new Date(asset.eventDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "")}
                                </span>
                              )}
                              <span style={{ color: "#cbd5e1", fontSize: 10 }}>•</span>
                              <span style={{
                                fontSize: 10, fontWeight: 700, color: "#94a3b8",
                                fontFamily: "Space Grotesk, sans-serif",
                                textTransform: "uppercase", letterSpacing: "0.06em",
                              }}>Galpão SP</span>
                            </div>
                          </div>
                        ) : <span style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic", fontFamily: "Plus Jakarta Sans, sans-serif" }}>—</span>}
                      </td>

                      {/* Patrocinadores */}
                      <td style={{ padding: "12px 14px", verticalAlign: "middle", maxWidth: 140 }}>
                        <SponsorChips sponsors={asset.sponsors ?? []} />
                      </td>

                      {/* ── Condição · Destino (coluna unificada com labels internos) ── */}
                      <td onClick={e => e.stopPropagation()} style={{ padding: "10px 14px", verticalAlign: "top", minWidth: 300 }}>
                        {isSaved ? (
                          /* salvo: mostra toggles desabilitados */
                          <LabeledTriageToggles
                            condition={entry.splits[0].condition}
                            result={entry.splits[0].result}
                            onCondition={() => {}} onResult={() => {}}
                            disabled grayscale
                          />
                        ) : qty === 1 ? (
                          /* ── qty = 1: toggles simples com labels ── */
                          <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 10px", border: "1px solid #f1f5f9" }}>
                            <LabeledTriageToggles
                              condition={entry.splits[0].condition}
                              result={entry.splits[0].result}
                              onCondition={c => smartUpdateSplit(asset.id, 0, c)}
                              onResult={r => updateSplit(asset.id, 0, { result: r })}
                            />
                          </div>
                        ) : (
                          /* ── qty > 1: banner + modo ── */
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }} onClick={e => e.stopPropagation()}>
                            {/* Mode toggle banner */}
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 28, height: 20, borderRadius: 6, background: "#0f172a", color: "#fff", fontSize: 11, fontWeight: 800, fontFamily: "DM Mono, monospace", padding: "0 6px" }}>×{qty}</span>
                              <button data-testid={`button-mode-all-${asset.id}`} onClick={() => setMode(asset.id, "all", qty)}
                                style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 9px", borderRadius: 6, fontSize: 10, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer", border: entry.mode === "all" ? "2px solid #2563eb" : "1px solid #e2e8f0", background: entry.mode === "all" ? "#eff6ff" : "#f8fafc", color: entry.mode === "all" ? "#1d4ed8" : "#94a3b8", transition: "all 0.12s" }}>
                                Aplicar a todas
                              </button>
                              <button data-testid={`button-mode-split-${asset.id}`} onClick={() => setMode(asset.id, "split", qty)}
                                style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 9px", borderRadius: 6, fontSize: 10, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer", border: entry.mode === "split" ? "2px solid #f97316" : "1px solid #e2e8f0", background: entry.mode === "split" ? "#fff7ed" : "#f8fafc", color: entry.mode === "split" ? "#ea580c" : "#94a3b8", transition: "all 0.12s" }}>
                                <Scissors size={9} /> Dividir por condição
                              </button>
                            </div>
                            {entry.mode === "all" ? (
                              <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 10px", border: "1px solid #f1f5f9" }}>
                                <LabeledTriageToggles
                                  condition={entry.splits[0].condition}
                                  result={entry.splits[0].result}
                                  onCondition={c => smartUpdateSplit(asset.id, 0, c)}
                                  onResult={r => updateSplit(asset.id, 0, { result: r })}
                                />
                              </div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "rgba(248,250,252,0.7)", borderRadius: 10, padding: "8px 8px 8px 16px", borderLeft: "4px solid #e2e8f0", marginLeft: 6 }}>
                                {/* Presets rápidos */}
                                <div style={{ display: "flex", gap: 5, marginBottom: 2 }}>
                                  <button data-testid={`button-preset-perfeito-${asset.id}`} onClick={() => applyPreset(asset.id, "PERFEITO", "NO_GALPAO", qty)}
                                    style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, border: "1px solid #86efac", background: "#f0fdf4", color: "#166534", fontSize: 9, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer" }}>
                                    <Sparkles size={9} /> Tudo Perfeito → Galpão
                                  </button>
                                  <button data-testid={`button-preset-sucata-${asset.id}`} onClick={() => applyPreset(asset.id, "SUCATA", "DESCARTADO", qty)}
                                    style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fff1f2", color: "#991b1b", fontSize: 9, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer" }}>
                                    <Trash2 size={9} /> Tudo Sucata → Descartar
                                  </button>
                                </div>
                                {/* Split cards */}
                                {entry.splits.map((split, si) => (
                                  <div key={si} style={{ border: "1px solid #e2e8f0", borderRadius: 8, background: "#fafafa", overflow: "hidden" }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 8px", borderBottom: "1px solid #f1f5f9", background: "#f8fafc" }}>
                                      <span style={{ fontSize: 9, fontWeight: 700, color: "#64748b", fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.08em" }}>Lote {si + 1}</span>
                                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                        <button data-testid={`button-split-minus-${asset.id}-${si}`} onClick={() => stepSplit(asset.id, si, -1, qty)} disabled={split.qty <= 1}
                                          style={{ width: 20, height: 20, borderRadius: 5, border: "1px solid #e2e8f0", background: "#fff", cursor: split.qty <= 1 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, lineHeight: 1, color: split.qty <= 1 ? "#cbd5e1" : "#0f172a", fontWeight: 700, padding: 0 }}>−</button>
                                        <span style={{ minWidth: 28, textAlign: "center", fontSize: 12, fontWeight: 800, fontFamily: "DM Mono, monospace", color: splitValid ? "#0f172a" : "#dc2626" }}>{split.qty}</span>
                                        <button data-testid={`button-split-plus-${asset.id}-${si}`} onClick={() => stepSplit(asset.id, si, +1, qty)} disabled={splitSum >= qty}
                                          style={{ width: 20, height: 20, borderRadius: 5, border: "1px solid #e2e8f0", background: "#fff", cursor: splitSum >= qty ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, lineHeight: 1, color: splitSum >= qty ? "#cbd5e1" : "#0f172a", fontWeight: 700, padding: 0 }}>+</button>
                                      </div>
                                      {entry.splits.length >= 2 && (
                                        <button data-testid={`button-remove-split-${asset.id}-${si}`} onClick={() => removeSplit(asset.id, si)}
                                          style={{ border: "none", background: "none", cursor: "pointer", color: "#94a3b8", padding: 0, display: "flex", alignItems: "center" }}>
                                          <X size={12} />
                                        </button>
                                      )}
                                    </div>
                                    <div style={{ padding: "6px 8px" }}>
                                      <TriageActionToggles condition={split.condition} result={split.result} onCondition={c => smartUpdateSplit(asset.id, si, c)} onResult={r => updateSplit(asset.id, si, { result: r })} />
                                    </div>
                                  </div>
                                ))}
                                {splitSum < qty && (
                                  <button data-testid={`button-add-split-${asset.id}`} onClick={() => addSplit(asset.id, qty)}
                                    style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 4, border: "1px dashed #cbd5e1", borderRadius: 6, background: "transparent", cursor: "pointer", color: "#64748b", fontSize: 9, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", padding: "4px 8px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                                    + Adicionar lote
                                  </button>
                                )}
                                <SplitProgress splits={entry.splits} total={qty} />
                                {!splitValid && (
                                  <span style={{ fontSize: 9, fontWeight: 700, color: "#dc2626", fontFamily: "Space Grotesk, sans-serif" }}>
                                    {splitSum < qty ? `Faltam ${qty - splitSum} unidades para distribuir` : `${splitSum - qty} unidades a mais`}
                                  </span>
                                )}
                              </div>
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
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                          {/* Botão detalhe / triagem modal */}
                          <button
                            data-testid={`button-view-item-${asset.id}`}
                            onClick={e => { e.stopPropagation(); setSelectedAsset(asset); }}
                            title="Abrir triagem"
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#f97316"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(249,115,22,0.08)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                            style={{ padding: 7, borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8", display: "flex", alignItems: "center", transition: "color 0.15s, background 0.15s" }}>
                            <Eye size={14} />
                          </button>
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
                              background: isSaving || !splitValid ? "#e2e8f0" : "#f97316",
                              color: isSaving || !splitValid ? "#94a3b8" : "#fff",
                              fontSize: 12, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif",
                              cursor: isSaving || !splitValid ? "not-allowed" : "pointer",
                              boxShadow: !isSaving && splitValid ? "0 2px 8px rgba(249,115,22,0.35)" : "none",
                              transition: "all 0.15s", whiteSpace: "nowrap",
                            }}>
                            {isSaving ? "..." : <><Save size={13} /> Salvar</>}
                          </button>
                        )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </div>
      )}
      </div>

      {/* ── Floating pill ── */}
      {selectedIds.length > 0 && (
        <div style={{
          position: "fixed", bottom: 52, left: "50%", transform: "translateX(-50%)",
          zIndex: 50, pointerEvents: "auto",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 20,
            padding: "12px 20px", borderRadius: 9999,
            background: "#0f172a",
            boxShadow: "0 12px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)",
          }}>
            {/* Count badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#f97316", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 800, fontFamily: "Space Grotesk, sans-serif" }}>
                {selectedIds.length}
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9", fontFamily: "Space Grotesk, sans-serif", whiteSpace: "nowrap" }}>
                {selectedIds.length === 1 ? "item" : "itens"} selecionados
              </span>
            </div>
            {/* Divider */}
            <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.12)" }} />
            {/* Quick presets */}
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <button data-testid="button-bulk-preset-perfeito" onClick={() => applyBulkPreset("PERFEITO", "NO_GALPAO")}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 11px", borderRadius: 9999, border: "1px solid rgba(147,197,253,0.4)", background: "rgba(30,64,175,0.5)", color: "#93c5fd", fontSize: 10, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", cursor: "pointer", whiteSpace: "nowrap" }}>
                <Sparkles size={10} /> Perfeitos → Galpão
              </button>
              <button data-testid="button-bulk-preset-manutencao" onClick={() => applyBulkPreset("AVARIA_LEVE", "MANUTENCAO")}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 11px", borderRadius: 9999, border: "1px solid rgba(252,211,77,0.4)", background: "rgba(146,64,14,0.45)", color: "#fcd34d", fontSize: 10, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", cursor: "pointer", whiteSpace: "nowrap" }}>
                <Wrench size={10} /> Avaria → Manutenção
              </button>
              <button data-testid="button-bulk-preset-sucata" onClick={() => applyBulkPreset("SUCATA", "DESCARTADO")}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 11px", borderRadius: 9999, border: "1px solid rgba(252,165,165,0.4)", background: "rgba(185,28,28,0.45)", color: "#fca5a5", fontSize: 10, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", cursor: "pointer", whiteSpace: "nowrap" }}>
                <Trash2 size={10} /> Sucata → Descartar
              </button>
            </div>
            {/* Divider */}
            <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.12)" }} />
            {/* Actions */}
            <div style={{ display: "flex", gap: 8 }}>
              <button data-testid="button-bulk-confirm" onClick={handleBulk}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 16px", borderRadius: 9999, border: "none", background: "#22c55e", color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(34,197,94,0.3)" }}>
                <CheckCircle2 size={13} /> Confirmar Triagem
              </button>
              <button data-testid="button-bulk-cancel" onClick={() => Object.keys(entries).forEach(id => updateEntry(id, { selected: false }))}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 9999, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#94a3b8", fontSize: 11, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", cursor: "pointer", whiteSpace: "nowrap" }}>
                <X size={12} /> Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <TriagemModal
        asset={selectedAsset}
        linkedItem={selectedAsset ? (allItems.find((i: any) => i.id === selectedAsset.originalItemId) ?? null) : null}
        entry={selectedAsset ? getEntry(selectedAsset.id, selectedAsset.quantity ?? 1) : null}
        open={!!selectedAsset}
        isSaving={!!selectedAsset && savingIds.has(selectedAsset.id)}
        isSaved={!!selectedAsset && savedIds.has(selectedAsset.id)}
        user={user}
        onOpenChange={(open) => { if (!open) setSelectedAsset(null); }}
        onUpdateCondition={(c) => { if (selectedAsset) smartUpdateSplit(selectedAsset.id, 0, c); }}
        onUpdateResult={(r) => { if (selectedAsset) updateSplit(selectedAsset.id, 0, { result: r }); }}
        onUpdateNotes={(notes) => { if (selectedAsset) updateEntry(selectedAsset.id, { notes }); }}
        onSaveAndClose={async () => { if (selectedAsset) { await handleSingle(selectedAsset); setSelectedAsset(null); } }}
      />
    </div>
  );
}
