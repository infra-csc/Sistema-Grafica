import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilterSelect } from "@/components/filter-select";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ScanSearch, CheckCircle2, Package, Save,
  CalendarDays, X, Scissors, Sparkles, Trash2, Eye, Wrench,
  ClipboardCheck, Users, Search, BookmarkCheck, ArrowLeft, ChevronDown,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TriagemModal } from "@/components/triagem-modal";
import { EventosDaTriagem, SEM_EVENTO } from "@/components/triagem/eventos-da-triagem";
import { QuadroDaTriagem, emGrupos, GRAVACOES_POR_VEZ } from "@/components/triagem/quadro-da-triagem";
import { diaEMes, ehRecusaDeJaTriada } from "@shared/estoque";
import { chaveDoGrupo, resumoDaGravacao } from "@/components/triagem/grupos-da-triagem";
import { SponsorChips } from "@/components/sponsor-chips";
import { useAuth } from "@/contexts/auth-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { CONDITION_META, type Condition, type ConditionMeta, type EnrichedAsset } from "@/lib/inventory-meta";
import { FS } from "@/lib/theme";

// Re-export para compatibilidade — a definição vive em @/lib/inventory-meta.
export type { EnrichedAsset };

type TriagemResult = "NO_GALPAO" | "MANUTENCAO" | "DESCARTADO";
const RESULT_META: Record<TriagemResult, { label: string; color: string; bg: string; border: string; activeBg: string; activeColor: string }> = {
  NO_GALPAO:  { label: "Galpão",       color: "#1e40af", bg: "#eff6ff", border: "#93c5fd", activeBg: "#1e40af", activeColor: "#fff" },
  MANUTENCAO: { label: "Manutenção",   color: "#92400e", bg: "#fffbeb", border: "#fcd34d", activeBg: "#fef3c7", activeColor: "#92400e" },
  DESCARTADO: { label: "Descartar",    color: "#991b1b", bg: "#fff1f2", border: "#fca5a5", activeBg: "#dc2626", activeColor: "#fff" },
};

interface SplitLine { qty: number; condition: Condition | null; result: TriagemResult; }
interface TriagemEntry { splits: SplitLine[]; notes: string; selected: boolean; mode: "all" | "split"; }

/** Reserva vigente (GET /api/estoque/reservas-ativas) — a peça que tem
 *  destino marcado vai para o topo da fila, com a data de saída. */
type ReservaAtiva = { reservaId: string; assetId: string; itemDisplayId: string | null; eventName: string; saida: string | null };

/** Linhas da tabela montadas por vez. A fila passa de 4 mil peças e cada linha
 *  tem ~10 botões e 2 campos: montar tudo travava a tela a cada tecla. */
export const LOTE_DA_TABELA = 50;

/** Referência estável para "ainda sem dados": um `= []` no useQuery cria um
 *  array novo a cada render e todo useMemo/useEffect que depende dele dispara
 *  de novo (laço de render). */
const VAZIO: never[] = [];

function makeSplits(totalQty: number): SplitLine[] {
  return [{ qty: totalQty, condition: "PERFEITO", result: "NO_GALPAO" }];
}

// ─── ThumbCell — fallback quando a imagem falha ou URL está vazia ─────────────
function ThumbCell({ url, size = 15 }: { url?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <Package size={size} color="#64748b" />;
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

// ─── Stat card (matches estoque layout) ───────────────────────────────────────
function StatCard({ label, value, color, Icon, compacto }: {
  label: string; value: number; color: string; Icon: React.ElementType;
  /** Celular: três cartões em ~110px cada — sem o ícone d'água e com o
   *  número menor, senão "Triados nesta sessão" estourava o cartão. */
  compacto?: boolean;
}) {
  return (
    <div style={{
      background: "#fff",
      padding: compacto ? "12px 12px 10px" : "18px 20px 16px",
      borderRadius: 12,
      border: "1px solid #e2e8f0",
      borderBottom: `3px solid ${color}`,
      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      display: "flex", flexDirection: "column", gap: compacto ? 4 : 8, minWidth: 0,
    }}>
      {/* Rótulo em texto corrido: caixa alta com 0.18em nos três cartões
          disputava atenção com o número, que é o que importa. */}
      <span style={{ fontSize: compacto ? 11 : 12, fontWeight: 600, color: "#64748b", fontFamily: "Space Grotesk, sans-serif", lineHeight: 1.25 }}>
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ margin: 0, fontSize: compacto ? 22 : 30, fontWeight: 800, color, fontFamily: "Space Grotesk, sans-serif", letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {value}
        </p>
        {!compacto && <Icon size={28} color={color} aria-hidden="true" style={{ opacity: 0.15 }} />}
      </div>
    </div>
  );
}

// ─── ConditionToggles ─────────────────────────────────────────────────────────
// `grande` (celular): cada botão divide a largura e ganha 44px de altura —
// os ~22px da tabela ficavam abaixo da ponta do dedo no chão do galpão.
function ConditionToggles({ condition, onCondition, disabled, grayscale, grande }: {
  condition: Condition | null; onCondition: (c: Condition) => void;
  disabled?: boolean; grayscale?: boolean; grande?: boolean;
}) {
  return (
    <div role="group" aria-label="Condição do item" style={{
      display: grande ? "flex" : "inline-flex", width: grande ? "100%" : undefined,
      background: "#f3f4f3", padding: 3, borderRadius: 8,
      filter: grayscale ? "grayscale(1)" : "none",
    }}>
      {(Object.entries(CONDITION_META) as [Condition, ConditionMeta][]).map(([val, meta]) => {
        const active = condition === val;
        return (
          <button key={val} onClick={() => !disabled && onCondition(val)}
            aria-pressed={active} disabled={disabled}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
              flex: grande ? 1 : undefined, minHeight: grande ? 44 : 28,
              padding: grande ? "0 6px" : "0 10px", borderRadius: 6, border: "none",
              cursor: disabled ? "default" : "pointer",
              fontSize: grande ? 13 : 11, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif",
              whiteSpace: "nowrap", transition: "background-color 0.12s, color 0.12s, box-shadow 0.12s",
              background: active ? "#fff" : "transparent",
              color: active ? meta.color : "#475569",
              boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
            }}>
            <meta.Icon size={grande ? 13 : 11} aria-hidden="true" />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── ResultToggles ─────────────────────────────────────────────────────────────
function ResultToggles({ result, onResult, disabled, grayscale, grande }: {
  result: TriagemResult; onResult: (r: TriagemResult) => void;
  disabled?: boolean; grayscale?: boolean; grande?: boolean;
}) {
  return (
    <div role="group" aria-label="Destino do item" style={{
      display: grande ? "flex" : "inline-flex", width: grande ? "100%" : undefined,
      background: "#f3f4f3", padding: 3, borderRadius: 8,
      filter: grayscale ? "grayscale(1)" : "none",
    }}>
      {(Object.entries(RESULT_META) as [TriagemResult, typeof RESULT_META[TriagemResult]][]).map(([val, meta]) => {
        const active = result === val;
        return (
          <button key={val} onClick={() => !disabled && onResult(val)}
            aria-pressed={active} disabled={disabled}
            title={val === "MANUTENCAO" ? "Fica fora do estoque até o reparo terminar" : undefined}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
              flex: grande ? 1 : undefined, minHeight: grande ? 44 : 28,
              padding: grande ? "0 6px" : "0 10px", borderRadius: 6, border: "none",
              cursor: disabled ? "default" : "pointer",
              fontSize: grande ? 13 : 11, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif",
              whiteSpace: "nowrap", transition: "background-color 0.12s, color 0.12s, box-shadow 0.12s",
              background: active ? meta.activeBg : "transparent",
              color: active ? meta.activeColor : "#475569",
              boxShadow: active ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
            }}>
            {val === "MANUTENCAO" && <Wrench size={grande ? 13 : 11} aria-hidden="true" />}
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── TriageActionToggles (combined — used in split cards) ─────────────────────
function TriageActionToggles({
  condition, result, onCondition, onResult, disabled, grande,
}: {
  condition: Condition | null; result: TriagemResult;
  onCondition: (c: Condition) => void; onResult: (r: TriagemResult) => void;
  disabled?: boolean; grande?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <ConditionToggles condition={condition} onCondition={onCondition} disabled={disabled} grande={grande} />
      <ResultToggles result={result} onResult={onResult} disabled={disabled} grande={grande} />
    </div>
  );
}

// ─── LabeledTriageToggles (main table — shows CONDIÇÃO / DESTINO labels) ──────
function LabeledTriageToggles({
  condition, result, onCondition, onResult, disabled, grayscale, grande,
}: {
  condition: Condition | null; result: TriagemResult;
  onCondition: (c: Condition) => void; onResult: (r: TriagemResult) => void;
  disabled?: boolean; grayscale?: boolean; grande?: boolean;
}) {
  // No celular o rótulo vai ACIMA dos botões: ao lado ele comia 62px dos
  // ~320 disponíveis e os três botões não cabiam.
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: "#64748b",
    fontFamily: "Space Grotesk, sans-serif", minWidth: grande ? undefined : 62, flexShrink: 0,
  };
  const linha: React.CSSProperties = grande
    ? { display: "flex", flexDirection: "column", alignItems: "stretch", gap: 4 }
    : { display: "flex", alignItems: "center", gap: 6 };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <div style={{ ...linha, paddingBottom: 7 }}>
        <span style={labelStyle}>Condição</span>
        <ConditionToggles condition={condition} onCondition={onCondition} disabled={disabled} grayscale={grayscale} grande={grande} />
      </div>
      <div style={{ height: 1, background: "#f1f5f9", marginBottom: 7 }} />
      <div style={linha}>
        <span style={labelStyle}>Destino</span>
        <ResultToggles result={result} onResult={onResult} disabled={disabled} grayscale={grayscale} grande={grande} />
      </div>
    </div>
  );
}

// ─── Split Progress Bar ───────────────────────────────────────────────────────
// Cores derivadas de CONDITION_META — fonte única, sem cópia local.
const PROG_COLORS = Object.fromEntries(
  (Object.entries(CONDITION_META) as [Condition, ConditionMeta][]).map(([c, m]) => [c, m.color]),
) as Record<Condition, string>;
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
        <span style={{ fontSize: 11, fontFamily: "DM Mono, monospace", fontWeight: 700, color: pct === 100 ? "#15803d" : "#b91c1c" }}>
          {sum}/{total} un ({pct}%)
        </span>
        {pct < 100 && (
          <span style={{ fontSize: 11, fontFamily: "DM Mono, monospace", color: "#746e69" }}>
            faltam {total - sum} un
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TriagemRetorno() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { user } = useAuth();
  const [entries, setEntries] = useState<Record<string, TriagemEntry>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  // ONDE ESTOU NA URL (regra da casa): F5 no meio da triagem de um evento
  // voltava à lista de eventos, e não dava para mandar o link da pilha.
  // Lido uma vez; escrito com replaceState e debounce, como no Estoque.
  const urlInicial = useMemo(() => new URLSearchParams(window.location.search), []);
  const listaDaUrl = (k: string) => (urlInicial.get(k) ?? "").split(",").filter(Boolean);
  const [filterEvent, setFilterEvent] = useState<string[]>(() => listaDaUrl("eventos"));
  const [filterSponsor, setFilterSponsor] = useState<string[]>(() => listaDaUrl("patrocinador"));
  const [search, setSearch] = useState(() => urlInicial.get("q") ?? "");
  const [mostrando, setMostrando] = useState(LOTE_DA_TABELA);
  // Descarte pendente de confirmação: uma peça (salvar da linha) ou o lote.
  const [descarte, setDescarte] = useState<{ tipo: "uma"; asset: EnrichedAsset } | { tipo: "lote"; quantas: number } | null>(null);
  const [gravadasDoLote, setGravadasDoLote] = useState(0);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<EnrichedAsset | null>(null);
  // ENTRADA POR EVENTO (dono, 14/09): a triagem abre na lista de eventos que
  // voltaram; escolhido o evento, o quadro de arrastar. A tabela segue como
  // vista completa (e é onde se divide uma peça ×N por condição).
  const [vista, setVista] = useState<"eventos" | "quadro" | "tabela">(() => {
    const v = urlInicial.get("vista");
    return v === "tabela" ? "tabela" : v === "quadro" && urlInicial.get("evento") ? "quadro" : "eventos";
  });
  const [eventoDoQuadro, setEventoDoQuadro] = useState<string | null>(() => urlInicial.get("evento"));
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams(window.location.search);
      const grava = (k: string, v: string) => { if (v) p.set(k, v); else p.delete(k); };
      grava("vista", vista === "eventos" ? "" : vista);
      grava("evento", vista === "quadro" ? eventoDoQuadro ?? "" : "");
      grava("q", vista === "tabela" ? search.trim() : "");
      grava("eventos", vista === "tabela" ? filterEvent.join(",") : "");
      grava("patrocinador", vista === "tabela" ? filterSponsor.join(",") : "");
      // "local" saiu do sistema (21/09): um link antigo com o parâmetro é limpo.
      p.delete("local");
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    }, 200);
    return () => clearTimeout(t);
  }, [vista, eventoDoQuadro, search, filterEvent, filterSponsor]);

  const { data: awaitingAssets = VAZIO as EnrichedAsset[], isLoading, isError, refetch } = useQuery<EnrichedAsset[]>({
    queryKey: ["/api/inventory/awaiting-triage"],
  });
  // /api/items é a lista INTEIRA de peças (MBs) e só serve ao modal de
  // detalhe: só é pedida quando alguém abre um.
  const { data: allItems = VAZIO as any[] } = useQuery<any[]>({ queryKey: ["/api/items"], enabled: !!selectedAsset });
  const { data: reservasAtivas = VAZIO as ReservaAtiva[] } = useQuery<ReservaAtiva[]>({ queryKey: ["/api/estoque/reservas-ativas"] });
  const reservaPorAtivo = useMemo(() => new Map(reservasAtivas.map(r => [r.assetId, r])), [reservasAtivas]);
  // Por id: os laços de lote faziam awaitingAssets.find() por peça — 4 mil × 4 mil.
  const ativoPorId = useMemo(() => new Map(awaitingAssets.map(a => [a.id, a])), [awaitingAssets]);
  // Trocar o recorte volta ao primeiro lote de linhas.
  useEffect(() => { setMostrando(LOTE_DA_TABELA); }, [search, filterEvent, filterSponsor]);

  const getEntry = (id: string, totalQty?: number): TriagemEntry =>
    entries[id] ?? makeEntry(totalQty ?? 1);

  // Lê `prev` dentro do updater (não o closure `entries`): duas atualizações
  // no mesmo tick não se descartam. `totalQty` evita criar entry com splits
  // de qty=1 para item ×N — sem ele, o Salvar travava em `splitValid`.
  const updateEntry = (id: string, patch: Partial<TriagemEntry>, totalQty?: number) =>
    setEntries(prev => ({ ...prev, [id]: { ...(prev[id] ?? makeEntry(totalQty ?? 1)), ...patch } }));

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
        const qty = ativoPorId.get(id)?.quantity ?? 1;
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

  // MANUTENCAO grava EM_MANUTENCAO (14/09): a peça sai do estoque disponível
  // até o reparo terminar. Antes gravava NO_GALPAO e seguia oferecida.
  const toDbStatus = (r: TriagemResult): string =>
    r === "DESCARTADO" ? "DESCARTADO" : r === "MANUTENCAO" ? "EM_MANUTENCAO" : "NO_GALPAO";

  // Destino MANUTENCAO persiste a condição como AVARIA_LEVE — cumpre a
  // microcopy "Volta ao galpão como Avaria Leve para reparo" do toggle.
  const toDbCondition = (s: SplitLine): Condition | null =>
    s.result === "MANUTENCAO" ? "AVARIA_LEVE" : s.condition;

  const doTriage = async (assetId: string, totalQty: number) => {
    const entry = getEntry(assetId, totalQty);
    if (entry.splits.length === 1) {
      await apiRequest("PATCH", `/api/inventory/${assetId}/triage`, {
        condition: toDbCondition(entry.splits[0]),
        notes: entry.notes,
        trackingStatus: toDbStatus(entry.splits[0].result),
      });
    } else {
      await apiRequest("POST", `/api/inventory/${assetId}/triage-split`, {
        splits: entry.splits.map(s => ({
          qty: s.qty, condition: toDbCondition(s),
          trackingStatus: toDbStatus(s.result),
          notes: entry.notes,
        })),
      });
    }
    queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    queryClient.invalidateQueries({ queryKey: ["/api/inventory/awaiting-triage"] });
  };

  // Devolve se a triagem ficou gravada — o modal só fecha quando é `true`
  // (antes fechava por cima do toast de validação e levava o campo embora).
  const handleSingle = useCallback(async (asset: EnrichedAsset, confirmado = false): Promise<boolean> => {
    const totalQty = asset.quantity ?? 1;
    const entry = getEntry(asset.id, totalQty);
    if (entry.splits.some(l => l.condition === null)) {
      toast({ title: "Selecione a condição antes de salvar.", variant: "destructive" });
      return false;
    }
    if (!isSplitValid(entry, totalQty)) {
      toast({ title: `A soma das quantidades deve ser ${totalQty}.`, variant: "destructive" });
      return false;
    }
    if (savedIds.has(asset.id)) return true;
    // DESCARTAR destrói (sai do inventário e a triagem não se desfaz pelo
    // app): é o único destino que pede confirmação.
    if (!confirmado && entry.splits.some(s => s.result === "DESCARTADO")) {
      setDescarte({ tipo: "uma", asset });
      return false;
    }
    setSavingIds(prev => new Set(Array.from(prev).concat(asset.id)));
    try {
      await doTriage(asset.id, totalQty);
      setSavedIds(prev => new Set(Array.from(prev).concat(asset.id)));
      // O toast nomeia a peça e o destino: triando dezenas seguidas, "Triagem
      // registrada." não dizia QUAL linha acabou de sair da fila.
      const destino = entry.splits.length > 1 ? `${entry.splits.length} lotes`
        : RESULT_META[entry.splits[0].result].label;
      toast({ title: `${asset.displayId} triada · ${destino}` });
      return true;
    } catch (e: any) {
      // Outra pessoa chegou antes (409): não é erro de quem está aqui — a
      // lista só estava velha. Aviso neutro e lista nova.
      if (ehRecusaDeJaTriada(e?.message)) {
        toast({ title: `Outra pessoa já triou ${asset.displayId} — lista atualizada` });
        refetch();
        return false;
      }
      toast({ title: `Não foi possível triar ${asset.displayId}`, description: e?.message || "Tente de novo.", variant: "destructive" });
      return false;
    } finally {
      setSavingIds(prev => { const s = new Set(Array.from(prev)); s.delete(asset.id); return s; });
    }
  }, [entries, savedIds, awaitingAssets]);

  // ── pendingAssets ──────────────────────────────────────────────────────────────
  // Filtro de evento por ID (eventId vem do enriquecimento do servidor):
  // nomes de evento podem se repetir entre ciclos, o id não.
  const pendingAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return awaitingAssets.filter(a => {
      if (savedIds.has(a.id)) return false;
      const me = filterEvent.length === 0 || filterEvent.includes(a.eventId ?? "");
      const msp = filterSponsor.length === 0 || (a.sponsors ?? []).some(s => filterSponsor.includes(s.id));
      const msearch = !q || (a.name ?? "").toLowerCase().includes(q) || (a.displayId ?? "").toLowerCase().includes(q);
      return me && msp && msearch;
    })
      // Reservadas primeiro, pela saída do caminhão mais próxima: é a peça
      // que tem hora para estar triada e guardada.
      .map((a, i) => ({ a, i, r: reservaPorAtivo.get(a.id) }))
      .sort((x, y) => {
        if (!!x.r !== !!y.r) return x.r ? -1 : 1;
        const sx = x.r?.saida ? new Date(x.r.saida).getTime() : Infinity;
        const sy = y.r?.saida ? new Date(y.r.saida).getTime() : Infinity;
        return sx - sy || x.i - y.i;
      })
      .map(({ a }) => a);
  }, [awaitingAssets, savedIds, filterEvent, filterSponsor, search, reservaPorAtivo]);

  // ITENS POR QUANTIDADE JUNTOS (dono, 21/09): o ciclo cria um registro por
  // unidade, então 24 unidades da mesma peça são 24 linhas. Aqui elas ficam
  // ADJACENTES (o grupo entra na posição do seu primeiro registro, que já vem
  // ordenado por reserva) e cada linha diz quantas iguais existem. Repartir a
  // quantidade entre destinos é no quadro do evento ("Dividir…").
  const { emOrdemDeGrupo, iguaisPorChave } = useMemo(() => {
    const porChave = new Map<string, EnrichedAsset[]>();
    for (const a of pendingAssets) {
      const k = chaveDoGrupo(a);
      const lista = porChave.get(k);
      if (lista) lista.push(a); else porChave.set(k, [a]);
    }
    const iguaisPorChave = new Map<string, number>();
    porChave.forEach((lista, k) => iguaisPorChave.set(k, lista.reduce((s, a) => s + (a.quantity ?? 1), 0)));
    return { emOrdemDeGrupo: Array.from(porChave.values()).flat(), iguaisPorChave };
  }, [pendingAssets]);

  // Filtros facetados: cada filtro lista só o que existe na triagem, aplicando
  // os OUTROS filtros ativos, com contagem por opção.
  const tFacetPool = (exclude: 'event' | 'sponsor') =>
    awaitingAssets.filter(a => {
      if (savedIds.has(a.id)) return false;
      if (exclude !== 'event' && filterEvent.length > 0 && !filterEvent.includes(a.eventId ?? "")) return false;
      if (exclude !== 'sponsor' && filterSponsor.length > 0 && !(a.sponsors ?? []).some(s => filterSponsor.includes(s.id))) return false;
      return true;
    });
  const tTally = (rows: EnrichedAsset[], key: (r: EnrichedAsset) => { value: string; label: string } | null) => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    rows.forEach(r => {
      const k = key(r);
      if (!k?.value) return;
      const cur = map.get(k.value);
      if (cur) cur.count++;
      else map.set(k.value, { ...k, count: 1 });
    });
    return Array.from(map.values());
  };
  // Memo: três varreduras da fila inteira (4 mil+) rodavam a CADA render —
  // inclusive a cada clique num botão de condição de uma linha.
  const eventFilterOptions = useMemo(() => tTally(tFacetPool('event'), a => a.eventId ? { value: a.eventId, label: a.eventName ?? "Evento" } : null),
    [awaitingAssets, savedIds, filterSponsor]);
  const sponsorFilterOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    tFacetPool('sponsor').forEach(a => (a.sponsors ?? []).forEach(s => {
      const cur = map.get(s.id);
      if (cur) cur.count++;
      else map.set(s.id, { value: s.id, label: s.name, count: 1 });
    }));
    return Array.from(map.values());
  }, [awaitingAssets, savedIds, filterEvent]);

  // Seleção deriva SEMPRE da lista visível: uma entry marcada que saiu do
  // filtro não conta (nem no lote, nem no contador, nem nos presets).
  const selectedIds = useMemo(() => pendingAssets.filter(a => entries[a.id]?.selected).map(a => a.id), [pendingAssets, entries]);
  // O que está montado na tela agora (o resto entra por "Mostrar mais").
  const linhasVisiveis = useMemo(() => emOrdemDeGrupo.slice(0, mostrando), [emOrdemDeGrupo, mostrando]);

  const handleBulk = async (confirmado = false) => {
    if (selectedIds.length === 0 || savingIds.size > 0) return;
    // Divisão incompleta: antes ia ao servidor e voltava como "N com erro".
    const somaErrada = selectedIds.filter(id => {
      const a = ativoPorId.get(id);
      return !!a && !isSplitValid(getEntry(id, a.quantity ?? 1), a.quantity ?? 1);
    });
    if (somaErrada.length > 0) {
      toast({
        title: `${somaErrada.length} ${somaErrada.length === 1 ? "peça está" : "peças estão"} com a divisão incompleta.`,
        description: `Confira os lotes de ${ativoPorId.get(somaErrada[0])?.displayId ?? "uma peça"}: a soma precisa fechar a quantidade.`,
        variant: "destructive",
      });
      return;
    }
    const paraDescartar = selectedIds.filter(id => getEntry(id, ativoPorId.get(id)?.quantity ?? 1).splits.some(s => s.result === "DESCARTADO")).length;
    if (!confirmado && paraDescartar > 0) { setDescarte({ tipo: "lote", quantas: paraDescartar }); return; }
    setSavingIds(new Set(selectedIds));
    setGravadasDoLote(0);
    // Em grupos: um PATCH por peça, todos de uma vez, abria centenas de
    // conexões e o servidor recusava no meio do lote.
    const results = await emGrupos(selectedIds, GRAVACOES_POR_VEZ, (id) => {
      const asset = ativoPorId.get(id);
      if (!asset) {
        // Sem o ativo não dá para validar a quantidade — rejeita com erro
        // claro e conta como falha (antes virava doTriage com qty=1 silencioso).
        return Promise.reject(new Error(`Ativo ${id} não está mais na fila de triagem.`));
      }
      return doTriage(id, asset.quantity ?? 1);
    }, setGravadasDoLote);
    // Só marca como salvo (some da fila) o que realmente foi registrado. Os que
    // falharam continuam visíveis e selecionados para nova tentativa — antes,
    // TODOS os selecionados saíam da lista, "engolindo" os que deram erro.
    const okIds = selectedIds.filter((_, i) => results[i].status === "fulfilled");
    // Recusadas porque OUTRA pessoa já triou: contam à parte, não travam as
    // demais e saem da seleção (somem na atualização da lista).
    const jaTriadas = selectedIds.filter((_, i) => { const r = results[i]; return r.status === "rejected" && ehRecusaDeJaTriada(r.reason?.message); });
    const failed = selectedIds.length - okIds.length - jaTriadas.length;
    setSavedIds(prev => new Set(Array.from(prev).concat(okIds)));
    setSavingIds(new Set());
    setEntries(prev => {
      const next = { ...prev };
      [...okIds, ...jaTriadas].forEach(id => { if (next[id]) next[id] = { ...next[id], selected: false }; });
      return next;
    });
    // Com erro, o toast traz o motivo da primeira recusa — "com erro" sem porquê
    // deixava a pessoa reenviando o lote às cegas.
    const primeiraFalha = results.find((r): r is PromiseRejectedResult => r.status === "rejected" && !ehRecusaDeJaTriada(r.reason?.message));
    toast({
      title: resumoDaGravacao(okIds.length, jaTriadas.length, failed),
      description: failed > 0 ? `${primeiraFalha?.reason?.message ?? "Erro ao gravar"}. As que falharam continuam selecionadas.`
        : jaTriadas.length > 0 ? "Outra pessoa triou parte da seleção — lista atualizada." : undefined,
      variant: failed > 0 ? "destructive" : "default",
    });
    refetch();
  };

  // Selecionar tudo opera sobre as linhas NA TELA (o lote visível do recorte),
  // nunca sobre a fila inteira — senão o "Confirmar lote" triava milhares de
  // peças que a pessoa nem chegou a ver. Desmarcar limpa o recorte todo.
  const toggleAll = (checked: boolean) => {
    if (!checked) {
      // Desmarca TUDO, inclusive o que ficou marcado fora do recorte atual —
      // senão a marca voltava, de surpresa, ao limpar o filtro.
      setEntries(prev => Object.fromEntries(Object.entries(prev).map(([id, e]) => [id, e.selected ? { ...e, selected: false } : e])));
      return;
    }
    const update: Record<string, TriagemEntry> = {};
    linhasVisiveis.forEach(a => { update[a.id] = { ...getEntry(a.id, a.quantity ?? 1), selected: checked }; });
    setEntries(prev => ({ ...prev, ...update }));
  };

  const hasFilters = filterEvent.length > 0 || filterSponsor.length > 0 || !!search;

  const allSelected = linhasVisiveis.length > 0 && linhasVisiveis.every(a => entries[a.id]?.selected);

  const moldura: React.CSSProperties = { padding: isMobile ? "14px 16px" : "32px 36px", background: "#f8fafc", height: "100%", overflowY: "auto" };

  const doEventoDoQuadro = vista === "quadro" && eventoDoQuadro
    ? awaitingAssets.filter((a) => (a.eventId ?? SEM_EVENTO) === eventoDoQuadro) : VAZIO as EnrichedAsset[];
  // Link antigo para um evento que já terminou a triagem: cai na lista de
  // eventos em vez de abrir um quadro vazio sem saída clara.
  const quadroSemPecas = vista === "quadro" && !isLoading && !isError && doEventoDoQuadro.length === 0;

  if (vista === "eventos" || quadroSemPecas || (vista === "quadro" && (isLoading || isError))) {
    return (
      <div style={moldura}>
        <EventosDaTriagem
          ativos={awaitingAssets}
          reservaPorAtivo={reservaPorAtivo}
          isLoading={isLoading}
          isError={isError}
          onTentarDeNovo={() => refetch()}
          onAbrir={(id) => { setEventoDoQuadro(id); setVista("quadro"); }}
          onTabela={() => { setFilterEvent([]); setVista("tabela"); }}
        />
      </div>
    );
  }

  if (vista === "quadro" && eventoDoQuadro) {
    const doEvento = doEventoDoQuadro;
    return (
      <div style={moldura}>
        <QuadroDaTriagem
          key={eventoDoQuadro}
          evento={{ id: eventoDoQuadro, nome: doEvento[0]?.eventName ?? "Sem evento", data: doEvento[0]?.eventDate ?? null }}
          ativos={doEvento}
          reservaPorAtivo={reservaPorAtivo}
          onVoltar={() => setVista("eventos")}
          onTabela={() => { setFilterEvent(eventoDoQuadro !== SEM_EVENTO ? [eventoDoQuadro] : []); setVista("tabela"); }}
          onConcluido={() => setVista("eventos")}
        />
      </div>
    );
  }

  const TH: React.CSSProperties = {
    padding: "12px 14px", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
    textTransform: "uppercase", color: "#fff", fontFamily: "Space Grotesk, sans-serif",
    textAlign: "left", background: "#0f172a", borderBottom: "none",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{
      padding: isMobile ? "14px 16px" : "32px 36px",
      // Compensa a pill flutuante de lote: sem isso ela cobre as últimas
      // linhas da tabela quando há seleção.
      // No celular a pill quebra em três linhas de 44px — os 130 do desktop
      // deixavam o Salvar da última peça escondido atrás dela.
      paddingBottom: selectedIds.length > 0 ? (isMobile ? 240 : 130) : undefined,
      background: "#f8fafc", height: "100%", overflowY: "auto", display: "flex", flexDirection: "column", gap: isMobile ? 16 : 28,
    }}>

      <button type="button" data-testid="button-voltar-eventos-triagem" onClick={() => setVista("eventos")}
        style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, minHeight: isMobile ? 44 : 32, background: "none", border: "none", padding: 0, fontSize: 13, fontWeight: 700, color: "#475569", cursor: "pointer", transition: "color 0.12s" }}
        onMouseEnter={e => { e.currentTarget.style.color = "#0f172a"; }}
        onMouseLeave={e => { e.currentTarget.style.color = "#475569"; }}>
        <ArrowLeft size={15} aria-hidden="true" /> Eventos da triagem
      </button>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 16, minWidth: 0 }}>
          <div style={{ width: isMobile ? 44 : 48, height: isMobile ? 44 : 48, borderRadius: 12, background: "#c2410c", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 12px rgba(194,65,12,0.22)" }}>
            <ClipboardCheck size={22} color="#fff" strokeWidth={2.2} aria-hidden="true" />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: "0 0 3px", fontSize: FS.h1, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", color: "#1c1917", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
              Triagem de Retorno
            </h1>
            {/* Subtítulo em texto corrido — a caixa alta com 0.18em era o
                elemento mais ruidoso do cabeçalho. */}
            <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "#746e69", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
              Peças que voltaram do evento: escolha a condição, o destino e onde guardar
            </p>
          </div>
        </div>
        {/* Cinza sem dizer por quê era o "travou?" desta tela: o lote só
            existe depois de marcar a caixa das peças. */}
        <button data-testid="button-bulk-triage-header" onClick={() => handleBulk()}
          disabled={selectedIds.length === 0 || savingIds.size > 0}
          title={selectedIds.length === 0 ? "Marque a caixa à esquerda das peças para triar várias de uma vez" : `Grava a triagem das ${selectedIds.length} peças marcadas`}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            minHeight: 44, padding: "0 20px", borderRadius: 10, border: "none", flexShrink: 0,
            width: isMobile ? "100%" : undefined,
            background: (selectedIds.length === 0 || savingIds.size > 0) ? "#e2e8f0" : "#c2410c",
            color: (selectedIds.length === 0 || savingIds.size > 0) ? "#64748b" : "#fff", fontSize: 14,
            cursor: (selectedIds.length === 0 || savingIds.size > 0) ? "not-allowed" : "pointer",
            fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
            boxShadow: (selectedIds.length === 0 || savingIds.size > 0) ? "none" : "0 4px 14px rgba(194,65,12,0.28)",
            transition: "background-color 0.15s, box-shadow 0.15s, color 0.15s",
          }}>
          <CheckCircle2 size={16} aria-hidden="true" />
          {savingIds.size > 1 ? `Registrando ${gravadasDoLote} de ${savingIds.size}…` : savingIds.size > 0 ? "Registrando…" : `Confirmar lote (${selectedIds.length})`}
        </button>
      </div>

      {/* ── Stats ── minmax(0, 1fr): com `1fr` puro o mínimo automático é o
          min-content do cartão e, em 375px, "Triados nesta sessão" estourava
          a grade e dava rolagem lateral na página. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: isMobile ? 8 : 14 }}>
        {/* Desconta os já triados na sessão — o card acompanha a fila real. */}
        <StatCard compacto={isMobile} label="Na fila" value={Math.max(0, awaitingAssets.length - savedIds.size)} color="#c2410c" Icon={ScanSearch} />
        <StatCard compacto={isMobile} label="Selecionados" value={selectedIds.length} color="#15803d" Icon={Users} />
        <StatCard compacto={isMobile} label="Triados nesta sessão" value={savedIds.size} color="#1d4ed8" Icon={CheckCircle2} />
      </div>

      {/* ── Filter bar ── */}
      {(() => {
        const FL: React.CSSProperties = {
          fontSize: 11, fontWeight: 500, color: "#64748b",
          fontFamily: "Plus Jakarta Sans, sans-serif", marginBottom: 6, display: "block",
        };
        // Sem `outline: none`: o inline anulava o anel de foco global e o
        // teclado não via qual filtro estava focado. Texto ativo em #9a3412 —
        // o #c2610c dava 4,17:1 e reprovava AA.
        const SEL = (active: boolean): React.CSSProperties => ({
          height: 44, width: "100%",
          border: `1.5px solid ${active ? "#c2410c" : "#e2e8f0"}`,
          borderRadius: 8, fontSize: 13, fontWeight: 500,
          fontFamily: "Plus Jakarta Sans, sans-serif",
          padding: "0 12px", background: "#fff",
          color: active ? "#9a3412" : "#374151",
          cursor: "pointer",
          transition: "border-color 0.15s",
        });
        return (
          <div style={{
            background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0",
            padding: isMobile ? "12px 14px 14px" : "16px 20px 18px",
            display: "flex", alignItems: "flex-end", gap: isMobile ? 10 : 14, flexWrap: "wrap",
          }}>
            {/* Evento — wrapper .event-filter-44 iguala o trigger aos 44px dos
                demais filtros (componente compartilhado sem prop de estilo). */}
            <div className="event-filter-44" style={{ display: "flex", flexDirection: "column", flex: "1 1 160px" }}>
              <label style={FL}>Evento</label>
              <EventFilterDropdown
                values={filterEvent}
                onValuesChange={setFilterEvent}
                options={eventFilterOptions}
              />
            </div>

            {/* Patrocinador */}
            <div style={{ display: "flex", flexDirection: "column", flex: "1 1 180px" }}>
              <label style={FL}>Patrocinador</label>
              <FilterSelect
                fullWidth showAllLabelWhenEmpty hideWhenEmpty={false}
                label="Patrocinador" allLabel="Todos os patrocinadores"
                values={filterSponsor} onValuesChange={setFilterSponsor}
                options={sponsorFilterOptions}
                searchPlaceholder="Buscar patrocinador..." emptyText="Nenhum patrocinador encontrado."
                testId="select-triage-filter-sponsor" triggerStyle={SEL(filterSponsor.length > 0)}
              />
            </div>

            {/* Buscar */}
            <div style={{ display: "flex", flexDirection: "column", flex: "1 1 150px" }}>
              <label style={FL}>Buscar</label>
              <div style={{ position: "relative" }}>
                <Search size={14} color="#64748b" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                <input
                  data-testid="input-triage-search"
                  style={{
                    width: "100%", paddingLeft: 34, paddingRight: 12, height: 44,
                    border: `1.5px solid ${search ? "#c2610c" : "#e2e8f0"}`, borderRadius: 8,
                    fontSize: isMobile ? 16 : 13, fontWeight: 400, fontFamily: "Plus Jakarta Sans, sans-serif",
                    background: "#fff", color: "#374151", boxSizing: "border-box",
                    transition: "border-color 0.15s",
                  }}
                  onFocus={e => (e.target.style.borderColor = "#c2410c")}
                  onBlur={e => (e.target.style.borderColor = search ? "#c2610c" : "#e2e8f0")}
                  aria-label="Buscar peças na triagem"
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
                onClick={() => { setFilterEvent([]); setFilterSponsor([]); setSearch(""); }}
                style={{
                  height: 44, display: "flex", alignItems: "center", gap: 5, padding: "0 14px",
                  borderRadius: 8,
                  border: `1.5px solid ${hasFilters ? "#fecaca" : "#e2e8f0"}`,
                  background: hasFilters ? "#fef2f2" : "#f8fafc",
                  color: hasFilters ? "#b91c1c" : "#94a3b8",
                  fontSize: 12, cursor: hasFilters ? "pointer" : "not-allowed",
                  fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                  transition: "all 0.15s",
                }}>
                <X size={12} /> Limpar filtros
              </button>
              <span style={{ fontSize: 11, color: "#746e69", fontFamily: "DM Mono, monospace", fontWeight: 600, whiteSpace: "nowrap", paddingBottom: 12 }}>
                {pendingAssets.length} pend. · {savedIds.size} triados
              </span>
            </div>
          </div>
        );
      })()}

      {/* ── Table ── */}
      <div>
      {isLoading ? (
        /* Skeleton no padrão da tabela do estoque — evita o "salto" do spinner. */
        <div data-testid="skeleton-triagem" aria-busy="true" style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: isMobile ? "4px 14px" : "8px 24px", boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="animate-pulse" style={{ display: "flex", alignItems: "center", gap: 18, padding: "16px 0", borderBottom: i < 5 ? "1px solid #f1f5f9" : "none" }}>
              <div style={{ width: 15, height: 15, borderRadius: 4, background: "#e2e8f0", flexShrink: 0 }} />
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "#e2e8f0", flexShrink: 0 }} />
              <div style={{ flex: 1, height: 12, borderRadius: 6, background: "#e2e8f0" }} />
              {!isMobile && <div style={{ width: 130, height: 12, borderRadius: 6, background: "#e2e8f0", flexShrink: 0 }} />}
              {!isMobile && <div style={{ width: 180, height: 22, borderRadius: 8, background: "#e2e8f0", flexShrink: 0 }} />}
              {!isMobile && <div style={{ width: 70, height: 12, borderRadius: 6, background: "#e2e8f0", flexShrink: 0 }} />}
            </div>
          ))}
        </div>
      ) : isError ? (
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #fecaca", padding: isMobile ? "36px 20px" : 60, textAlign: "center" }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#b91c1c", margin: "0 0 6px", fontFamily: "Space Grotesk, sans-serif" }}>Não foi possível carregar os materiais</p>
          <p style={{ color: "#64748b", fontSize: 12, margin: "0 0 16px" }}>Verifique sua conexão e tente novamente.</p>
          <button onClick={() => refetch()} style={{ minHeight: 44, background: "#0f172a", color: "#fff", border: "none", borderRadius: 8, padding: "0 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Tentar novamente</button>
        </div>
      ) : pendingAssets.length === 0 && savedIds.size === 0 ? (
        /* Dois vazios diferentes: a fila vazia de verdade, ou o RECORTE vazio.
           Antes os dois diziam "Nenhum material aguardando triagem" — com um
           filtro esquecido a pessoa concluía que não havia trabalho. */
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: isMobile ? "36px 20px" : 60, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "#f8fafc", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <ScanSearch size={24} color="#64748b" />
          </div>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "0 0 6px", fontFamily: "Space Grotesk, sans-serif" }}>
            {hasFilters && awaitingAssets.length > 0 ? "Nenhuma peça neste recorte" : "Nenhum material aguardando triagem"}
          </p>
          <p style={{ color: "#64748b", fontSize: 12, fontFamily: "Plus Jakarta Sans, sans-serif", margin: 0 }}>
            {hasFilters && awaitingAssets.length > 0
              ? `${awaitingAssets.length} ${awaitingAssets.length === 1 ? "peça espera" : "peças esperam"} triagem fora dos filtros atuais.`
              : "Os materiais são movidos automaticamente para triagem após o evento."}
          </p>
          {hasFilters && awaitingAssets.length > 0 && (
            <button type="button" onClick={() => { setFilterEvent([]); setFilterSponsor([]); setSearch(""); }}
              style={{ marginTop: 16, minHeight: 44, background: "#0f172a", color: "#fff", border: "none", borderRadius: 8, padding: "0 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Limpar filtros
            </button>
          )}
        </div>
      ) : pendingAssets.length === 0 ? (
        /* Tudo o que estava no recorte foi triado nesta sessão: a tabela só
           teria linhas cinzas "Salvo" — o fechamento merece ser dito. */
        <div data-testid="triagem-concluida-no-recorte" style={{ background: "#fff", borderRadius: 16, border: "1px solid #bbf7d0", padding: isMobile ? "32px 20px" : 48, textAlign: "center" }}>
          <CheckCircle2 size={28} color="#15803d" />
          <p style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "10px 0 6px", fontFamily: "Space Grotesk, sans-serif" }}>
            {savedIds.size} {savedIds.size === 1 ? "peça triada" : "peças triadas"} nesta sessão — nada pendente {hasFilters ? "neste recorte" : "na fila"}
          </p>
          <button type="button" onClick={() => setVista("eventos")}
            style={{ marginTop: 10, minHeight: 44, background: "#0f172a", color: "#fff", border: "none", borderRadius: 8, padding: "0 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Voltar aos eventos da triagem
          </button>
        </div>
      ) : (
        <>
        {/* A CONDIÇÃO MUDA O DESTINO SOZINHA (smartUpdateSplit) — sem aviso,
            quem marcava "Avaria leve" via o destino pular para Manutenção e
            achava que tinha tocado errado. Uma linha diz a regra e o caminho
            de volta; também diz o que o Salvar grava. */}
        <p data-testid="dica-triagem-tabela" style={{ margin: "0 0 10px", fontSize: 12.5, color: "#475569", lineHeight: 1.5, fontFamily: "Plus Jakarta Sans, sans-serif" }}>
          A condição já sugere o destino (Perfeito → Galpão, Avaria leve → Manutenção, Sucata → Descartar) — troque o destino se precisar.
          Nada é gravado até <strong style={{ color: "#0f172a" }}>Salvar</strong> na linha ou <strong style={{ color: "#0f172a" }}>Confirmar lote</strong>.
        </p>
        <div style={{ background: "#fff", borderRadius: isMobile ? 12 : 16, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
          {(() => {
            // As peças de cada linha são montadas UMA vez e servem às duas
            // vistas: tabela no desktop, cartões no celular. Antes o celular
            // recebia a tabela de 920px com rolagem lateral: o Salvar ficava
            // fora da tela e os botões de condição tinham ~22px de altura.
            const alvo = isMobile ? 44 : 28;
            // Só o lote visível + o que foi salvo nesta sessão (fica na tela,
            // cinza, como recibo). O resto da fila entra por "Mostrar mais".
            const linhas = [...linhasVisiveis, ...awaitingAssets.filter(a => savedIds.has(a.id))];
            const pecasDe = (asset: EnrichedAsset) => {
              const qty = asset.quantity ?? 1;
              const entry = getEntry(asset.id, qty);
              const isSaved = savedIds.has(asset.id);
              const isSaving = savingIds.has(asset.id);
              const splitSum = entry.splits.reduce((s, l) => s + l.qty, 0);
              const splitValid = splitSum === qty;
              const isFocused = focusedId === asset.id;
              // Cor do anel derivada de CONDITION_META — fonte única.
              const condRingColor = entry.splits[0].condition
                ? CONDITION_META[entry.splits[0].condition].color
                : "#e2e8f0";
              const thumbRing = isSaved ? "0 0 0 2px #e2e8f0" : `0 0 0 2px ${condRingColor}`;
              const alternarSelecao = () => {
                if (!isSaved) {
                  setFocusedId(asset.id);
                  updateEntry(asset.id, { selected: !entry.selected }, qty);
                }
              };

              // Checkbox — âncora de teclado da linha. No celular o input fica
              // dentro de um rótulo de 44px: os 16px do quadradinho eram o
              // único jeito de marcar a peça sem abrir nada.
              const checkboxEl = isSaved
                ? <CheckCircle2 size={17} color="#15803d" aria-label="Triagem salva" />
                : (
                  <label onClick={e => e.stopPropagation()}
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: isMobile ? 44 : 24, height: isMobile ? 44 : 24, margin: isMobile ? "-10px 0 0 -10px" : 0, cursor: "pointer", flexShrink: 0 }}>
                    <input type="checkbox" data-testid={`checkbox-asset-${asset.id}`}
                      aria-label={`Selecionar ${asset.name} para triagem em lote`}
                      checked={entry.selected}
                      onChange={e => { e.stopPropagation(); updateEntry(asset.id, { selected: e.target.checked }, qty); }}
                      onClick={e => e.stopPropagation()}
                      onFocus={() => setFocusedId(asset.id)}
                      style={{ width: isMobile ? 20 : 16, height: isMobile ? 20 : 16, cursor: "pointer", accentColor: "#c2410c" }}
                    />
                  </label>
                );

              const miniaturaEl = (
                <div style={{
                  width: isMobile ? 44 : 36, height: isMobile ? 44 : 36, borderRadius: 8, flexShrink: 0,
                  background: "#f1f5f9",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  overflow: "hidden",
                  boxShadow: thumbRing,
                  transition: "box-shadow 0.15s",
                }}>
                  <ThumbCell url={asset.approvalThumbUrl} size={15} />
                </div>
              );

              // ID em #9a3412: o #c2610c dava 4,17:1 no DM Mono de 10px.
              const materialEl = (
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 11, color: "#9a3412", fontFamily: "DM Mono, monospace", fontWeight: 600, display: "block", marginBottom: 2 }}>
                    {asset.displayId}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: isMobile ? 14 : 13, color: "#0f172a", fontFamily: "Plus Jakarta Sans, sans-serif", overflowWrap: "anywhere" }}>{asset.name}</span>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      height: 18, borderRadius: 5, padding: "0 5px",
                      background: qty > 1 ? "#0f172a" : "#f1f5f9",
                      color: qty > 1 ? "#fff" : "#64748b",
                      fontSize: 11, fontWeight: 700, fontFamily: "DM Mono, monospace",
                    }}>×{qty}</span>
                    {(iguaisPorChave.get(chaveDoGrupo(asset)) ?? 0) > qty && (
                      <span data-testid={`iguais-${asset.id}`} title="Registros do mesmo material ficam juntos; para repartir a quantidade entre destinos, use Dividir no quadro do evento"
                        style={{ fontSize: 11, fontWeight: 600, color: "#475569", background: "#f1f5f9", borderRadius: 5, padding: "1px 6px", whiteSpace: "nowrap" }}>
                        {iguaisPorChave.get(chaveDoGrupo(asset))} un. iguais
                      </span>
                    )}
                  </div>
                  {(() => {
                    const reserva = reservaPorAtivo.get(asset.id);
                    if (!reserva) return null;
                    return (
                      <span data-testid={`chip-reservada-${asset.id}`}
                        title={`Reservada para ${reserva.itemDisplayId ?? "uma peça"} do evento ${reserva.eventName}`}
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4, padding: "2px 7px", borderRadius: 6, background: "#eff6ff", color: "#1d4ed8", fontSize: 11, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", maxWidth: "100%" }}>
                        <BookmarkCheck size={11} aria-hidden="true" style={{ flexShrink: 0 }} /> Reservada · {reserva.eventName}{reserva.saida ? ` · saída ${diaEMes(reserva.saida)}` : ""}
                      </span>
                    );
                  })()}
                </div>
              );

              const dataDoEvento = asset.eventDate
                ? new Date(asset.eventDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "")
                : null;
              const eventoEl = asset.eventName ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      padding: 6, background: "#eff6ff", borderRadius: 6, flexShrink: 0,
                    }}>
                      <CalendarDays size={14} color="#1d4ed8" aria-hidden="true" />
                    </span>
                    <span style={{
                      fontSize: 13, fontWeight: 700, color: "#0f172a",
                      fontFamily: "Plus Jakarta Sans, sans-serif", lineHeight: 1.25,
                    }}>
                      {asset.eventName}
                    </span>
                  </div>
                  <div style={{ paddingLeft: 34, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {dataDoEvento && (
                      <span style={{ fontFamily: "DM Mono, monospace", fontSize: 11, color: "#64748b", letterSpacing: "-0.02em" }}>
                        {dataDoEvento}
                      </span>
                    )}
                  </div>
                </div>
              ) : <span style={{ fontSize: 12, color: "#746e69", fontStyle: "italic", fontFamily: "Plus Jakarta Sans, sans-serif" }}>Sem evento</span>;

              const patrocinadoresEl = <SponsorChips sponsors={asset.sponsors ?? []} />;

              // Botão de modo (qty > 1). Caixa alta em 10px saiu: é um controle,
              // e o rótulo precisa ser lido, não gritado.
              const botaoModo = (ativo: boolean, cor: string, fundo: string): React.CSSProperties => ({
                display: "inline-flex", alignItems: "center", gap: 4, minHeight: isMobile ? 40 : 26, padding: "0 10px", borderRadius: 6,
                fontSize: 12, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", cursor: "pointer",
                border: ativo ? `2px solid ${cor}` : "1px solid #e2e8f0", background: ativo ? fundo : "#f8fafc",
                color: ativo ? cor : "#475569", transition: "background-color 0.12s, color 0.12s, border-color 0.12s",
              });
              const botaoPreset = (borda: string, fundo: string, cor: string): React.CSSProperties => ({
                display: "inline-flex", alignItems: "center", gap: 4, minHeight: isMobile ? 40 : 26, padding: "0 10px", borderRadius: 6,
                border: `1px solid ${borda}`, background: fundo, color: cor, fontSize: 12, fontWeight: 600,
                fontFamily: "Space Grotesk, sans-serif", cursor: "pointer",
              });
              const botaoPasso = (desabilitado: boolean): React.CSSProperties => ({
                width: alvo, height: alvo, borderRadius: 6, border: "1px solid #e2e8f0", background: "#fff",
                cursor: desabilitado ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, lineHeight: 1, color: desabilitado ? "#cbd5e1" : "#0f172a", fontWeight: 700, padding: 0,
              });

              const togglesEl = isSaved ? (
                <LabeledTriageToggles
                  condition={entry.splits[0].condition}
                  result={entry.splits[0].result}
                  onCondition={() => {}} onResult={() => {}}
                  disabled grayscale grande={isMobile}
                />
              ) : qty === 1 ? (
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 10px", border: "1px solid #f1f5f9" }}>
                  <LabeledTriageToggles
                    condition={entry.splits[0].condition}
                    result={entry.splits[0].result}
                    onCondition={c => smartUpdateSplit(asset.id, 0, c)}
                    onResult={r => updateSplit(asset.id, 0, { result: r })}
                    grande={isMobile}
                  />
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 28, height: 22, borderRadius: 6, background: "#0f172a", color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "DM Mono, monospace", padding: "0 6px" }}>×{qty}</span>
                    <button data-testid={`button-mode-all-${asset.id}`} onClick={() => setMode(asset.id, "all", qty)}
                      aria-pressed={entry.mode === "all"}
                      style={botaoModo(entry.mode === "all", "#1d4ed8", "#eff6ff")}>
                      Aplicar a todas
                    </button>
                    <button data-testid={`button-mode-split-${asset.id}`} onClick={() => setMode(asset.id, "split", qty)}
                      aria-pressed={entry.mode === "split"}
                      style={botaoModo(entry.mode === "split", "#c2410c", "#fff7ed")}>
                      <Scissors size={12} aria-hidden="true" /> Dividir por condição
                    </button>
                  </div>
                  {entry.mode === "all" ? (
                    <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 10px", border: "1px solid #f1f5f9" }}>
                      <LabeledTriageToggles
                        condition={entry.splits[0].condition}
                        result={entry.splits[0].result}
                        onCondition={c => smartUpdateSplit(asset.id, 0, c)}
                        onResult={r => updateSplit(asset.id, 0, { result: r })}
                        grande={isMobile}
                      />
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "rgba(248,250,252,0.7)", borderRadius: 10, padding: isMobile ? "8px 8px 8px 10px" : "8px 8px 8px 16px", borderLeft: "4px solid #e2e8f0", marginLeft: isMobile ? 0 : 6 }}>
                      <div style={{ display: "flex", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
                        <button data-testid={`button-preset-perfeito-${asset.id}`} onClick={() => applyPreset(asset.id, "PERFEITO", "NO_GALPAO", qty)}
                          style={botaoPreset("#86efac", "#f0fdf4", "#166534")}>
                          <Sparkles size={12} aria-hidden="true" /> Tudo perfeito → Galpão
                        </button>
                        <button data-testid={`button-preset-sucata-${asset.id}`} onClick={() => applyPreset(asset.id, "SUCATA", "DESCARTADO", qty)}
                          style={botaoPreset("#fca5a5", "#fff1f2", "#991b1b")}>
                          <Trash2 size={12} aria-hidden="true" /> Tudo sucata → Descartar
                        </button>
                      </div>
                      {entry.splits.map((split, si) => (
                        <div key={si} style={{ border: "1px solid #e2e8f0", borderRadius: 8, background: "#fafafa", overflow: "hidden" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "5px 8px", borderBottom: "1px solid #f1f5f9", background: "#f8fafc" }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b", fontFamily: "Space Grotesk, sans-serif" }}>Lote {si + 1}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              {/* Rótulo falado: "−" sozinho não diz nada ao leitor
                                  de tela. Desabilitado em #cbd5e1 (sai o #a8a29e,
                                  proibido como cor de texto). 44px no celular. */}
                              <button data-testid={`button-split-minus-${asset.id}-${si}`} onClick={() => stepSplit(asset.id, si, -1, qty)} disabled={split.qty <= 1}
                                aria-label={`Uma unidade a menos no lote ${si + 1}`}
                                style={botaoPasso(split.qty <= 1)}>−</button>
                              <span aria-live="polite" style={{ minWidth: 28, textAlign: "center", fontSize: 13, fontWeight: 700, fontFamily: "DM Mono, monospace", color: splitValid ? "#0f172a" : "#b91c1c" }}>{split.qty}</span>
                              <button data-testid={`button-split-plus-${asset.id}-${si}`} onClick={() => stepSplit(asset.id, si, +1, qty)} disabled={splitSum >= qty}
                                aria-label={`Uma unidade a mais no lote ${si + 1}`}
                                style={botaoPasso(splitSum >= qty)}>+</button>
                            </div>
                            {entry.splits.length >= 2 && (
                              <button data-testid={`button-remove-split-${asset.id}-${si}`} onClick={() => removeSplit(asset.id, si)}
                                aria-label={`Remover o lote ${si + 1}`} title="Remover este lote"
                                style={{ width: alvo, height: alvo, border: "none", borderRadius: 6, background: "none", cursor: "pointer", color: "#64748b", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <X size={14} aria-hidden="true" />
                              </button>
                            )}
                          </div>
                          <div style={{ padding: "6px 8px" }}>
                            <TriageActionToggles condition={split.condition} result={split.result} onCondition={c => smartUpdateSplit(asset.id, si, c)} onResult={r => updateSplit(asset.id, si, { result: r })} grande={isMobile} />
                          </div>
                        </div>
                      ))}
                      {splitSum < qty && (
                        <button data-testid={`button-add-split-${asset.id}`} onClick={() => addSplit(asset.id, qty)}
                          style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 4, minHeight: isMobile ? 40 : 26, border: "1px dashed #cbd5e1", borderRadius: 6, background: "transparent", cursor: "pointer", color: "#475569", fontSize: 12, fontWeight: 600, fontFamily: "Space Grotesk, sans-serif", padding: "0 10px" }}>
                          + Adicionar lote
                        </button>
                      )}
                      <SplitProgress splits={entry.splits} total={qty} />
                      {!splitValid && (
                        <span role="status" style={{ fontSize: 12, fontWeight: 600, color: "#b91c1c", fontFamily: "Space Grotesk, sans-serif" }}>
                          {splitSum < qty ? `Faltam ${qty - splitSum} unidades para distribuir` : `${splitSum - qty} unidades a mais`}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );

              // Observação — sem o campo de local (dono, 21/09: o sistema não
              // guarda ONDE a peça fica no galpão). 16px no celular (abaixo
              // disso o Safari dá zoom ao focar).
              const campo = (faltando: boolean): React.CSSProperties => ({
                minHeight: isMobile ? 44 : 32, padding: "0 10px", borderRadius: 6,
                border: `1px solid ${faltando ? "#fca5a5" : "#e2e8f0"}`,
                fontSize: isMobile ? 16 : 12, fontFamily: "Plus Jakarta Sans, sans-serif",
                background: faltando ? "#fff7f7" : "#f8fafc", color: "#0f172a",
                width: "100%", boxSizing: "border-box",
              });
              const localEl = isSaved ? (
                entry.notes ? <span style={{ fontSize: 12, color: "#475569" }}>{entry.notes}</span> : null
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <input data-testid={`input-notes-${asset.id}`}
                    type="text" placeholder="Adicionar nota..."
                    aria-label={`Observação da triagem de ${asset.name}`}
                    value={entry.notes}
                    onChange={e => updateEntry(asset.id, { notes: e.target.value }, qty)}
                    onClick={e => e.stopPropagation()}
                    onFocus={() => setFocusedId(asset.id)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleSingle(asset); } }}
                    style={campo(false)}
                  />
                </div>
              );

              // #c2410c no hover (regra da casa: #f97316 nunca como cor de
              // texto/ícone sobre claro) e #64748b em repouso — o #94a3b8
              // dava 2,6:1 num ícone de ação.
              const verEl = (
                <button
                  data-testid={`button-view-item-${asset.id}`}
                  onClick={e => { e.stopPropagation(); setSelectedAsset(asset); }}
                  title="Abrir triagem"
                  aria-label={`Abrir a triagem de ${asset.displayId}`}
                  onMouseEnter={e => { e.currentTarget.style.color = "#c2410c"; e.currentTarget.style.background = "rgba(194,65,12,0.08)"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "#64748b"; e.currentTarget.style.background = "transparent"; }}
                  style={{ width: isMobile ? 44 : 32, height: isMobile ? 44 : 32, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "color 0.15s, background 0.15s" }}>
                  <Eye size={isMobile ? 18 : 15} aria-hidden="true" />
                </button>
              );
              const salvarEl = isSaved ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#15803d", fontSize: 13, fontFamily: "Space Grotesk, sans-serif", fontWeight: 700 }}>
                  <CheckCircle2 size={15} aria-hidden="true" /> Salvo
                </span>
              ) : (
                <button data-testid={`button-save-triage-${asset.id}`}
                  disabled={isSaving || !splitValid}
                  onClick={e => { e.stopPropagation(); handleSingle(asset); }}
                  title={!splitValid ? `Soma deve ser ${qty}` : "Salvar (Enter)"}
                  style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                    minHeight: isMobile ? 44 : 32, padding: "0 14px", borderRadius: 8, border: "none",
                    width: isMobile ? "100%" : undefined,
                    // #c2410c: branco sobre #f97316 dava 2,8:1 (reprova AA).
                    background: isSaving || !splitValid ? "#e2e8f0" : "#c2410c",
                    color: isSaving || !splitValid ? "#64748b" : "#fff",
                    fontSize: isMobile ? 14 : 12, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif",
                    cursor: isSaving || !splitValid ? "not-allowed" : "pointer",
                    boxShadow: !isSaving && splitValid ? "0 2px 8px rgba(194,65,12,0.25)" : "none",
                    transition: "background-color 0.15s, box-shadow 0.15s", whiteSpace: "nowrap",
                  }}>
                  {isSaving ? "Salvando…" : <><Save size={13} aria-hidden="true" /> Salvar</>}
                </button>
              );

              return { entry, isSaved, isFocused, alternarSelecao, checkboxEl, miniaturaEl, materialEl, eventoEl, patrocinadoresEl, togglesEl, localEl, verEl, salvarEl };
            };

            if (isMobile) {
              return (
                <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 14px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                  <span style={{ fontSize: 12, color: "#475569" }}>{linhasVisiveis.length} de {pendingAssets.length} na tela</span>
                  <button type="button" data-testid="button-selecionar-visiveis-tabela" onClick={() => toggleAll(!allSelected)}
                    aria-pressed={allSelected}
                    style={{ minHeight: 44, padding: "0 4px", background: "none", border: "none", fontSize: 13, fontWeight: 700, color: "#9a3412", cursor: "pointer" }}>
                    {allSelected ? "Desmarcar todas" : `Selecionar as ${linhasVisiveis.length} visíveis`}
                  </button>
                </div>
                <ul aria-label="Peças aguardando triagem" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {linhas.map((asset, idx) => {
                    const p = pecasDe(asset);
                    const realce = p.entry.selected && !p.isSaved;
                    return (
                      <li key={asset.id} data-testid={`row-triage-${asset.id}`}
                        onClick={p.alternarSelecao}
                        style={{
                          display: "flex", flexDirection: "column", gap: 12, padding: "14px 14px 16px 11px",
                          borderBottom: idx < linhas.length - 1 ? "1px solid #e2e8f0" : "none",
                          borderLeft: realce ? "3px solid #c2410c" : "3px solid transparent",
                          background: realce ? "#fff7ed" : "#fff",
                          opacity: p.isSaved ? 0.8 : 1, filter: p.isSaved ? "grayscale(0.5)" : "none",
                          cursor: p.isSaved ? "default" : "pointer",
                          transition: "background-color 0.12s",
                        }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          {p.checkboxEl}
                          {p.miniaturaEl}
                          <div style={{ flex: 1, minWidth: 0 }}>{p.materialEl}</div>
                          {p.verEl}
                        </div>
                        {asset.eventName ? p.eventoEl : null}
                        {(asset.sponsors ?? []).length > 0 && <div>{p.patrocinadoresEl}</div>}
                        <div onClick={e => e.stopPropagation()}>{p.togglesEl}</div>
                        <div onClick={e => e.stopPropagation()}>{p.localEl}</div>
                        <div onClick={e => e.stopPropagation()}>{p.salvarEl}</div>
                      </li>
                    );
                  })}
                </ul>
                </>
              );
            }

            return (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={{ ...TH, width: 44 }}>
                        <input type="checkbox" data-testid="checkbox-select-all"
                          aria-label="Selecionar todas as peças visíveis"
                          checked={allSelected} onChange={e => toggleAll(e.target.checked)}
                          style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#c2410c" }} />
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
                    {linhas.map((asset, idx) => {
                      const p = pecasDe(asset);
                      const { entry, isSaved, isFocused } = p;
                      const baseRowBg = idx % 2 === 1 ? "#fafaf9" : "#ffffff";
                      return (
                        <tr key={asset.id} data-testid={`row-triage-${asset.id}`}
                          /* Sem role="button" no <tr>: a linha mantém a semântica
                             implícita de row; o acesso por teclado é do checkbox. */
                          onClick={p.alternarSelecao}
                          style={{
                            opacity: isSaved ? 0.8 : 1,
                            filter: isSaved ? "grayscale(0.5)" : "none",
                            // Selecionada tem realce próprio; foco e zebra são fallback.
                            backgroundColor: entry.selected && !isSaved ? "#fff7ed"
                              : isFocused && !isSaved ? "#f8fafc" : baseRowBg,
                            transition: "background-color 0.12s",
                            borderBottom: "1px solid rgba(226,232,240,0.6)",
                            borderLeft: (entry.selected || isFocused) && !isSaved ? "3px solid #c2410c" : "3px solid transparent",
                            cursor: isSaved ? "default" : "pointer",
                          }}
                          onMouseEnter={e => { if (!isSaved && !isFocused && !entry.selected) (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "#f8fafc"; }}
                          onMouseLeave={e => { if (!isSaved && !isFocused && !entry.selected) (e.currentTarget as HTMLTableRowElement).style.backgroundColor = baseRowBg; }}
                        >
                          <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                            {p.checkboxEl}
                          </td>

                          <td style={{ padding: "10px 14px", verticalAlign: "middle" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              {p.miniaturaEl}
                              {p.materialEl}
                            </div>
                          </td>

                          <td style={{ padding: "10px 14px", verticalAlign: "middle", minWidth: 190 }}>
                            {p.eventoEl}
                          </td>

                          <td style={{ padding: "12px 14px", verticalAlign: "middle", maxWidth: 140 }}>
                            {p.patrocinadoresEl}
                          </td>

                          <td onClick={e => e.stopPropagation()} style={{ padding: "10px 14px", verticalAlign: "top", minWidth: 300 }}>
                            {p.togglesEl}
                          </td>

                          <td style={{ padding: "12px 14px", verticalAlign: "middle", minWidth: 200 }}>
                            {p.localEl}
                          </td>

                          <td style={{ padding: "12px 14px", verticalAlign: "middle", textAlign: "right" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                              {p.verEl}
                              {p.salvarEl}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
          {pendingAssets.length > linhasVisiveis.length && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: isMobile ? "12px 14px" : "12px 24px", borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <span role="status" style={{ fontSize: 12.5, color: "#475569" }}>
                Mostrando <strong style={{ color: "#0f172a", fontFamily: "Space Grotesk, sans-serif" }}>{linhasVisiveis.length}</strong> de <strong style={{ color: "#0f172a", fontFamily: "Space Grotesk, sans-serif" }}>{pendingAssets.length}</strong> peças — use os filtros para chegar na pilha certa
              </span>
              <button type="button" data-testid="mostrar-mais-tabela" onClick={() => setMostrando(n => n + LOTE_DA_TABELA)}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44, padding: "0 16px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#334155", fontSize: 13, fontWeight: 700, cursor: "pointer", width: isMobile ? "100%" : undefined }}>
                <ChevronDown size={15} aria-hidden="true" /> Mostrar mais {Math.min(LOTE_DA_TABELA, pendingAssets.length - linhasVisiveis.length)}
              </button>
            </div>
          )}
        </div>
        </>
      )}
      </div>

      {/* ── Floating pill ── */}
      {selectedIds.length > 0 && (
        <div role="toolbar" aria-label="Ações para as peças selecionadas" style={{
          // No mobile a pill ancora nas laterais (left/right 12) em vez de
          // centralizar por transform — senão estoura a viewport estreita —
          // e sobe a área segura do iPhone (a barra de gesto cobria o Confirmar).
          position: "fixed", zIndex: 50, pointerEvents: "auto",
          ...(isMobile
            ? { left: 12, right: 12, bottom: "calc(12px + env(safe-area-inset-bottom, 0px))", transform: "none" }
            : { left: "50%", bottom: 52, transform: "translateX(-50%)" }),
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: isMobile ? 8 : 16,
            flexWrap: isMobile ? "wrap" : "nowrap",
            justifyContent: isMobile ? "space-between" : "flex-start",
            padding: isMobile ? "10px 12px" : "10px 12px 10px 16px", borderRadius: isMobile ? 16 : 9999,
            background: "#0f172a",
            boxShadow: "0 12px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06)",
          }}>
            {/* Count badge — "1 item selecionados" corrigido para concordar. */}
            <div role="status" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#c2410c", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                {selectedIds.length}
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9", fontFamily: "Space Grotesk, sans-serif", whiteSpace: "nowrap" }}>
                {selectedIds.length === 1 ? "item selecionado" : "itens selecionados"}
              </span>
            </div>
            {/* Presets rápidos — ocultos no mobile: já existem por linha e não
                cabem na pill estreita. */}
            {!isMobile && (
              <>
                <div aria-hidden="true" style={{ width: 1, height: 24, background: "rgba(255,255,255,0.12)" }} />
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button data-testid="button-bulk-preset-perfeito" onClick={() => applyBulkPreset("PERFEITO", "NO_GALPAO")}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 32, padding: "0 12px", borderRadius: 9999, border: "1px solid rgba(147,197,253,0.4)", background: "rgba(30,64,175,0.5)", color: "#bfdbfe", fontSize: 12, fontWeight: 600, fontFamily: "Space Grotesk, sans-serif", cursor: "pointer", whiteSpace: "nowrap" }}>
                    <Sparkles size={12} aria-hidden="true" /> Perfeitos → Galpão
                  </button>
                  <button data-testid="button-bulk-preset-manutencao" onClick={() => applyBulkPreset("AVARIA_LEVE", "MANUTENCAO")}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 32, padding: "0 12px", borderRadius: 9999, border: "1px solid rgba(252,211,77,0.4)", background: "rgba(146,64,14,0.45)", color: "#fde68a", fontSize: 12, fontWeight: 600, fontFamily: "Space Grotesk, sans-serif", cursor: "pointer", whiteSpace: "nowrap" }}>
                    <Wrench size={12} aria-hidden="true" /> Avaria → Manutenção
                  </button>
                  <button data-testid="button-bulk-preset-sucata" onClick={() => applyBulkPreset("SUCATA", "DESCARTADO")}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 32, padding: "0 12px", borderRadius: 9999, border: "1px solid rgba(252,165,165,0.4)", background: "rgba(185,28,28,0.45)", color: "#fecaca", fontSize: 12, fontWeight: 600, fontFamily: "Space Grotesk, sans-serif", cursor: "pointer", whiteSpace: "nowrap" }}>
                    <Trash2 size={12} aria-hidden="true" /> Sucata → Descartar
                  </button>
                </div>
                <div aria-hidden="true" style={{ width: 1, height: 24, background: "rgba(255,255,255,0.12)" }} />
              </>
            )}
            {/* Actions */}
            <div style={{ display: "flex", gap: 8, flex: isMobile ? "1 1 100%" : undefined }}>
              <button data-testid="button-bulk-confirm" onClick={() => handleBulk()}
                disabled={savingIds.size > 0}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: isMobile ? 44 : 36, padding: "0 16px", flex: isMobile ? 1 : undefined, borderRadius: 9999, border: "none", background: savingIds.size > 0 ? "#64748b" : "#15803d", color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", cursor: savingIds.size > 0 ? "not-allowed" : "pointer", whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(21,128,61,0.3)", transition: "background-color 0.15s" }}>
                <CheckCircle2 size={14} aria-hidden="true" /> {savingIds.size > 1 ? `Registrando ${gravadasDoLote} de ${savingIds.size}…` : savingIds.size > 0 ? "Registrando…" : "Confirmar triagem"}
              </button>
              {/* "Cancelar" soava como desfazer a triagem; o botão só
                  desmarca as linhas (o que foi preenchido nelas fica). */}
              <button data-testid="button-bulk-cancel" onClick={() => toggleAll(false)}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, height: isMobile ? 44 : 36, padding: "0 14px", borderRadius: 9999, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#e2e8f0", fontSize: 13, fontWeight: 600, fontFamily: "Space Grotesk, sans-serif", cursor: "pointer", whiteSpace: "nowrap" }}>
                <X size={13} aria-hidden="true" /> Limpar seleção
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
        onUpdateNotes={(notes) => { if (selectedAsset) updateEntry(selectedAsset.id, { notes }, selectedAsset.quantity ?? 1); }}
        onSaveAndClose={async () => {
          if (!selectedAsset) return false;
          const ok = await handleSingle(selectedAsset);
          if (ok) setSelectedAsset(null);
          return ok;
        }}
      />

      <AlertDialog open={!!descarte} onOpenChange={(aberto) => { if (!aberto) setDescarte(null); }}>
        <AlertDialogContent style={{ width: "min(440px, calc(100vw - 32px))", maxWidth: "min(440px, calc(100vw - 32px))", borderRadius: 16 }}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {descarte?.tipo === "uma" ? `Descartar ${descarte.asset.displayId}?` : `Descartar ${descarte?.tipo === "lote" ? descarte.quantas : 0} ${descarte?.tipo === "lote" && descarte.quantas === 1 ? "peça" : "peças"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {descarte?.tipo === "uma" ? `${descarte.asset.name} sai` : "Elas saem"} do inventário como sucata e a triagem não pode ser desfeita por aqui.
              {descarte?.tipo === "lote" && selectedIds.length > descarte.quantas ? ` As outras ${selectedIds.length - descarte.quantas} selecionadas seguem para o destino marcado.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter style={{ gap: 8 }}>
            <AlertDialogCancel data-testid="button-rever-descarte" style={{ minHeight: 44 }}>Rever</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirmar-descarte" style={{ minHeight: 44, background: "#b91c1c", color: "#fff" }}
              onClick={async () => {
                const d = descarte;
                setDescarte(null);
                if (d?.tipo === "lote") { handleBulk(true); return; }
                if (d?.tipo === "uma") {
                  const ok = await handleSingle(d.asset, true);
                  // Veio do modal de detalhe: fecha, como o Salvar dele faria.
                  if (ok) setSelectedAsset(atual => (atual?.id === d.asset.id ? null : atual));
                }
              }}>
              Descartar e salvar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Iguala o trigger do EventFilterDropdown aos demais filtros (44px de
          altura e largura total) — componente compartilhado, sem prop de estilo. */}
      <style>{`
        .event-filter-44 > div { width: 100%; }
        .event-filter-44 > div > button { height: 44px !important; width: 100%; }
      `}</style>
    </div>
  );
}
