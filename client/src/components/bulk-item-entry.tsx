import { useState, useRef, useCallback, useMemo } from "react";
import { Plus, Copy, Trash2, Loader2, ArrowRight, ChevronDown, Check, Search, X } from "lucide-react";
import { calculateM2FromStrings } from "@/lib/calculateM2";

const materials = ["Adesivo", "Lona", "Sanett", "Tecido"];
const finishes = ["Dupla Face", "Ilhós", "Impresso", "Recorte", "Refile"];

/* Total focusable fields per row (indices 0–9) */
const FIELDS_PER_ROW = 10;

interface BulkItemRow {
  id: string;
  type: string;
  description: string;
  quantity: string;
  visualWidth: string;
  visualHeight: string;
  fileWidth: string;
  fileHeight: string;
  material: string;
  finish: string;
  measurement: string;
  observations: string;
  calculatedM2: number;
  sponsorId: string;
}

interface StandardItem {
  id: string;
  name: string;
  type: string;
  area: number;
  visual: number;
  visualWidth?: number | null;
  visualHeight?: number | null;
  fileWidth?: number | null;
  fileHeight?: number | null;
  material?: string | null;
  finish?: string | null;
}

interface Sponsor {
  id: string;
  name: string;
  company?: string | null;
}

interface ExistingItem {
  id: string;
  displayId: string;
  type: string;
  quantity: number;
  description?: string | null;
  visualWidth?: string | number | null;
  visualHeight?: string | number | null;
  fileWidth?: string | number | null;
  fileHeight?: string | number | null;
  material?: string | null;
  finish?: string | null;
  status: string;
}

interface BulkItemEntryProps {
  eventId: string;
  standardItems?: StandardItem[];
  sponsors?: Sponsor[];
  existingItems?: ExistingItem[];
  onDeleteExistingItem?: (id: string) => void;
  onSubmit: (items: any[]) => void;
  onCancel: () => void;
  isPending?: boolean;
}

/* ── Styles ─────────────────────────────────────────────────────────── */
const fieldStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: '#f3f4f3',
  border: '1.5px solid transparent',
  borderRadius: '6px',
  fontSize: '12px',
  padding: '5px 8px',
  outline: 'none',
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  color: '#1a1c1c',
  boxSizing: 'border-box',
  transition: 'border-color 0.12s',
};

const selectStyle: React.CSSProperties = {
  ...fieldStyle,
  cursor: 'pointer',
  appearance: 'none' as any,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23a8a29e' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 7px center',
  paddingRight: '24px',
};

function makeFocusHandlers(onNav?: () => void) {
  return {
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
      e.currentTarget.style.borderColor = '#f97316';
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
      e.currentTarget.style.borderColor = 'transparent';
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
      if (e.key === 'Enter') { e.preventDefault(); onNav?.(); }
    },
  };
}

/* ── TipoSelect ─────────────────────────────────────────────────────── */
interface TipoSelectProps {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  rowIndex: number;
  onNavigateNext: () => void;
}

function TipoSelect({ value, options, onChange, rowIndex, onNavigateNext }: TipoSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function closeDropdown() { setOpen(false); setSearch(""); }

  const filtered = search
    ? options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (open && filtered.length > 0) {
        // select top result then navigate
        const top = filtered[0];
        onChange(top);
        closeDropdown();
      }
      onNavigateNext();
    }
    if (e.key === 'Escape') closeDropdown();
  }

  return (
    <div
      ref={ref}
      style={{ position: 'relative' }}
      onBlur={e => {
        if (!ref.current?.contains(e.relatedTarget as Node)) closeDropdown();
      }}
    >
      {/* Input wrapper with left orange accent */}
      <div style={{ position: 'relative', display: 'flex' }}>
        {/* Left accent bar */}
        <div style={{
          width: '3px', flexShrink: 0,
          backgroundColor: '#f97316',
          borderRadius: '4px 0 0 4px',
          alignSelf: 'stretch',
        }} />
        <input
          ref={inputRef}
          value={open ? search : value}
          onChange={e => { setSearch(e.target.value); onChange(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => { setSearch(""); setOpen(true); inputRef.current!.style.borderColor = '#f97316'; }}
          onBlur={e => { e.currentTarget.style.borderColor = 'transparent'; }}
          onKeyDown={handleKeyDown}
          onMouseDown={() => { if (!open) { setSearch(""); setOpen(true); } }}
          placeholder={value || "Selecionar..."}
          data-nav-row={rowIndex}
          data-nav-field="0"
          style={{
            ...fieldStyle,
            flex: 1,
            paddingRight: '24px',
            paddingLeft: '8px',
            textOverflow: 'ellipsis',
            cursor: 'pointer',
            borderRadius: '0 6px 6px 0',
            backgroundColor: open ? '#ebe9e7' : '#f3f4f3',
          }}
        />
        <ChevronDown
          size={10}
          color="#a8a29e"
          style={{
            position: 'absolute', right: 7, top: '50%',
            transform: open ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)',
            transition: 'transform 0.15s', pointerEvents: 'none',
          }}
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 3px)', left: 0, zIndex: 600,
          backgroundColor: '#ffffff',
          border: '1px solid #e7e5e4',
          borderRadius: 8,
          boxShadow: '0 8px 28px rgba(0,0,0,0.13)',
          maxHeight: 208, overflowY: 'auto',
          minWidth: 200, padding: '4px',
          scrollbarWidth: 'thin', scrollbarColor: '#d6d3d1 #f5f5f4',
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 12, color: '#a8a29e', textAlign: 'center', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Nenhum resultado
            </div>
          ) : filtered.map(opt => {
            const sel = opt === value;
            return (
              <div
                key={opt}
                onMouseDown={e => { e.preventDefault(); onChange(opt); closeDropdown(); onNavigateNext(); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '7px 10px', borderRadius: 6, fontSize: 12,
                  fontWeight: sel ? 700 : 500,
                  color: sel ? '#f97316' : '#1c1917',
                  backgroundColor: sel ? '#fff7ed' : 'transparent',
                  cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", gap: 6,
                }}
                onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLDivElement).style.backgroundColor = '#f5f5f4'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = sel ? '#fff7ed' : ''; }}
              >
                <span style={{ flex: 1 }}>{opt}</span>
                {sel && <Check size={10} color="#f97316" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────── */
function createEmptyRow(): BulkItemRow {
  return {
    id: Math.random().toString(36).substring(7),
    type: "", description: "", quantity: "1",
    visualWidth: "", visualHeight: "", fileWidth: "", fileHeight: "",
    material: "", finish: "", measurement: "", observations: "",
    calculatedM2: 0, sponsorId: "",
  };
}

/* ── ExistingItemsPanel ─────────────────────────────────────────────── */
interface ExistingItemsPanelProps {
  items: ExistingItem[];
  onDelete?: (id: string) => void;
}

function ExistingItemsPanel({ items, onDelete }: ExistingItemsPanelProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      it =>
        it.displayId.toLowerCase().includes(q) ||
        it.type.toLowerCase().includes(q) ||
        (it.description ?? "").toLowerCase().includes(q)
    );
  }, [items, query]);

  // Split filtered list into two equal columns
  const half = Math.ceil(filtered.length / 2);
  const col1 = filtered.slice(0, half);
  const col2 = filtered.slice(half);

  function ItemRow({ item }: { item: ExistingItem }) {
    const [hovered, setHovered] = useState(false);
    return (
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '5px 8px',
          borderBottom: '1px solid #f1f5f9',
          backgroundColor: hovered ? '#fff7ed' : 'transparent',
          transition: 'background-color 0.1s',
          minWidth: 0,
        }}
      >
        {/* ID */}
        <span style={{
          fontSize: '10px', fontWeight: '700', color: '#f97316',
          fontFamily: "'DM Mono', 'JetBrains Mono', monospace",
          minWidth: '52px', flexShrink: 0,
        }}>
          {item.displayId}
        </span>
        {/* Tipo */}
        <span style={{
          fontSize: '11px', fontWeight: '700', color: '#1e293b',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          minWidth: '110px', flexShrink: 0,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {item.type}
          {item.quantity > 1 && (
            <span style={{ fontWeight: '500', color: '#94a3b8', marginLeft: '3px' }}>×{item.quantity}</span>
          )}
        </span>
        {/* Descrição */}
        <span style={{
          fontSize: '11px', color: '#64748b',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          flex: 1, minWidth: 0,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {item.description || item.material || '—'}
        </span>
        {/* Trash — visible only on hover */}
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            title="Excluir item"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '2px', borderRadius: '4px', lineHeight: 0,
              color: '#fca5a5', flexShrink: 0,
              visibility: hovered ? 'visible' : 'hidden',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
            onMouseLeave={e => (e.currentTarget.style.color = '#fca5a5')}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '24px', border: '1px solid #e7e5e4', borderRadius: '10px', overflow: 'hidden' }}>
      {/* ── Sticky header ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '7px 12px',
        backgroundColor: '#f5f5f4', borderBottom: '1px solid #e7e5e4',
      }}>
        <span style={{
          fontSize: '9px', fontWeight: '800', textTransform: 'uppercase',
          letterSpacing: '0.14em', color: '#78716c',
          fontFamily: "'Space Grotesk', sans-serif", whiteSpace: 'nowrap',
        }}>
          Peças já lançadas
        </span>
        <span style={{
          fontSize: '9px', fontWeight: '800',
          backgroundColor: '#1c1917', color: '#fff',
          borderRadius: '99px', padding: '1px 7px',
          fontFamily: "'Space Grotesk', sans-serif", flexShrink: 0,
        }}>
          {items.length}
        </span>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Quick search */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={11} color="#a8a29e" style={{ position: 'absolute', left: 7, pointerEvents: 'none' }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filtrar..."
            style={{
              fontSize: '11px', fontFamily: "'Plus Jakarta Sans', sans-serif",
              backgroundColor: '#ebe9e7', border: 'none', outline: 'none',
              borderRadius: '6px', padding: '4px 24px 4px 24px',
              color: '#1a1c1c', width: '140px',
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              style={{ position: 'absolute', right: 6, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 0, padding: 0, color: '#a8a29e' }}
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* ── Split 2-column list ── */}
      <div
        className="scrollbar-visible"
        style={{ maxHeight: '176px', overflowY: 'auto', backgroundColor: '#fafaf9' }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: '12px 16px', fontSize: '11px', color: '#a8a29e', textAlign: 'center', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {query ? 'Nenhum item encontrado para esta busca.' : 'Nenhuma peça lançada ainda.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            {/* Column 1 */}
            <div style={{ borderRight: '1px solid #f1f5f9' }}>
              {col1.map(item => <ItemRow key={item.id} item={item} onDelete={onDelete} />)}
            </div>
            {/* Column 2 */}
            <div>
              {col2.map(item => <ItemRow key={item.id} item={item} onDelete={onDelete} />)}
            </div>
          </div>
        )}
      </div>

      {/* Column headers (after scroll area to stay in context) */}
    </div>
  );
}

/* ── Duplicate detection ─────────────────────────────────────────────── */
function normalize(v: string | number | null | undefined): number {
  return parseFloat(String(v ?? 0)) || 0;
}

function isSameItem(
  a: { type: string; description?: string | null; quantity: number | string; visualWidth?: string | number | null; visualHeight?: string | number | null; fileWidth?: string | number | null; fileHeight?: string | number | null; material?: string | null; finish?: string | null },
  b: { type: string; description?: string | null; quantity: number | string; visualWidth?: string | number | null; visualHeight?: string | number | null; fileWidth?: string | number | null; fileHeight?: string | number | null; material?: string | null; finish?: string | null }
): boolean {
  return (
    (a.type || '').trim() === (b.type || '').trim() &&
    (a.description || '').trim().toLowerCase() === (b.description || '').trim().toLowerCase() &&
    normalize(a.quantity) === normalize(b.quantity) &&
    normalize(a.visualWidth) === normalize(b.visualWidth) &&
    normalize(a.visualHeight) === normalize(b.visualHeight) &&
    normalize(a.fileWidth) === normalize(b.fileWidth) &&
    normalize(a.fileHeight) === normalize(b.fileHeight) &&
    (a.material || '').trim() === (b.material || '').trim() &&
    (a.finish || '').trim() === (b.finish || '').trim()
  );
}

/* ── Main Component ─────────────────────────────────────────────────── */
export function BulkItemEntry({
  eventId, standardItems = [], sponsors = [], existingItems = [],
  onDeleteExistingItem, onSubmit, onCancel, isPending,
}: BulkItemEntryProps) {
  const [rows, setRows] = useState<BulkItemRow[]>([createEmptyRow()]);
  const [replicateCounts, setReplicateCounts] = useState<Record<string, number>>({});
  const [duplicateConfirm, setDuplicateConfirm] = useState<{ valid: any[]; warnings: string[] } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const getReplicateCount = (id: string) => replicateCounts[id] ?? 1;
  const setReplicateCount = (id: string, n: number) =>
    setReplicateCounts(prev => ({ ...prev, [id]: Math.max(1, Math.min(99, n)) }));

  function updateRow(id: string, field: keyof BulkItemRow, value: string) {
    setRows(prev => prev.map(row => {
      if (row.id !== id) return row;
      const u = { ...row, [field]: value };
      if (field === 'type') {
        u.visualWidth = ""; u.visualHeight = ""; u.fileWidth = ""; u.fileHeight = "";
        u.material = ""; u.finish = ""; u.measurement = ""; u.calculatedM2 = 0;
        const s = standardItems.find(s => s.name === value);
        if (s) {
          const vw = s.visualWidth ? String(s.visualWidth) : s.area ? String(s.area) : "";
          const vh = s.visualHeight ? String(s.visualHeight) : s.visual ? String(s.visual) : "";
          const fw = s.fileWidth ? String(s.fileWidth) : "";
          const fh = s.fileHeight ? String(s.fileHeight) : "";
          u.visualWidth = vw; u.visualHeight = vh; u.fileWidth = fw; u.fileHeight = fh;
          u.material = s.material || ""; u.finish = s.finish || "";
          u.measurement = fw && fh ? `${fw} × ${fh}` : "";
          u.calculatedM2 = calculateM2FromStrings(u.quantity, fw, fh);
        }
      }
      if (field === 'quantity' || field === 'fileWidth' || field === 'fileHeight') {
        u.calculatedM2 = calculateM2FromStrings(u.quantity, u.fileWidth, u.fileHeight);
        u.measurement = `${u.fileWidth} × ${u.fileHeight}`;
      }
      return u;
    }));
  }

  const addRow = useCallback(() => {
    setRows(prev => [...prev, createEmptyRow()]);
  }, []);

  function removeRow(id: string) {
    if (rows.length === 1) return;
    setRows(prev => prev.filter(r => r.id !== id));
  }

  function duplicateRow(id: string) {
    const src = rows.find(r => r.id === id);
    if (!src) return;
    const count = getReplicateCount(id);
    const newRows = Array.from({ length: count }, () => ({
      ...src, id: Math.random().toString(36).substring(7),
    }));
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === id);
      const next = [...prev];
      next.splice(idx + 1, 0, ...newRows);
      return next;
    });
    setReplicateCount(id, 1);
  }

  /* ── Keyboard navigation ── */
  function focusNextField(rowIndex: number, fieldIndex: number) {
    const nextField = fieldIndex + 1;
    if (nextField < FIELDS_PER_ROW) {
      const el = tableRef.current?.querySelector<HTMLElement>(
        `[data-nav-row="${rowIndex}"][data-nav-field="${nextField}"]`
      );
      el?.focus();
      return;
    }
    // Last field → next row or new row
    const nextRow = rowIndex + 1;
    if (nextRow < rows.length) {
      const el = tableRef.current?.querySelector<HTMLElement>(
        `[data-nav-row="${nextRow}"][data-nav-field="0"]`
      );
      el?.focus();
    } else {
      addRow();
      setTimeout(() => {
        const el = tableRef.current?.querySelector<HTMLElement>(
          `[data-nav-row="${nextRow}"][data-nav-field="0"]`
        );
        el?.focus();
      }, 40);
    }
  }

  function navHandlers(rowIndex: number, fieldIndex: number) {
    return makeFocusHandlers(() => focusNextField(rowIndex, fieldIndex));
  }

  function handleSubmit() {
    const valid = rows
      .filter(r => r.type && parseFloat(r.quantity) > 0 &&
        parseFloat(r.visualWidth) > 0 && parseFloat(r.visualHeight) > 0 &&
        parseFloat(r.fileWidth) > 0 && parseFloat(r.fileHeight) > 0 &&
        r.material && r.finish)
      .map(r => ({
        eventId, type: r.type, description: r.description || "",
        quantity: parseInt(r.quantity),
        area: parseFloat(r.visualWidth), visual: parseFloat(r.visualHeight),
        visualWidth: r.visualWidth, visualHeight: r.visualHeight,
        fileWidth: r.fileWidth, fileHeight: r.fileHeight,
        material: r.material, finish: r.finish,
        measurement: r.measurement || `${r.fileWidth} × ${r.fileHeight}`,
        observations: r.observations || "", calculatedM2: r.calculatedM2,
      }));
    if (valid.length === 0) {
      alert("Preencha pelo menos uma peça completa antes de salvar.");
      return;
    }

    // Duplicate detection
    const warnings: string[] = [];

    // Within batch: compare each pair
    for (let i = 0; i < valid.length; i++) {
      for (let j = i + 1; j < valid.length; j++) {
        if (isSameItem(valid[i], valid[j])) {
          warnings.push(`Linha ${i + 1} e linha ${j + 1} são idênticas (${valid[i].type})`);
        }
      }
    }

    // Against already-saved items
    for (const newItem of valid) {
      for (const existing of existingItems) {
        if (isSameItem(newItem, existing)) {
          const label = existing.displayId ? `${existing.displayId}` : 'item existente';
          warnings.push(`"${newItem.type}" é idêntica ao ${label} já lançado`);
        }
      }
    }

    // Always show summary modal (with duplicate info if applicable)
    setDuplicateConfirm({ valid, warnings });
  }

  const validCount = rows.filter(r =>
    r.type && parseFloat(r.quantity) > 0 && parseFloat(r.visualWidth) > 0 &&
    parseFloat(r.visualHeight) > 0 && parseFloat(r.fileWidth) > 0 &&
    parseFloat(r.fileHeight) > 0 && r.material && r.finish
  ).length;

  const allTypeOptions = standardItems.map(s => s.name).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const cols = [
    { label: 'Tipo',       w: '134px', orange: false },
    { label: 'Descrição',  w: '126px', orange: false },
    { label: 'Qtd',        w: '50px',  orange: false },
    { label: 'VIS. L',     w: '62px',  orange: true  },
    { label: 'VIS. A',     w: '62px',  orange: true  },
    { label: 'ARQ. L',     w: '62px',  orange: true  },
    { label: 'ARQ. A',     w: '62px',  orange: true  },
    { label: 'M²',         w: '56px',  orange: true  },
    { label: 'Material',   w: '84px',  orange: false },
    { label: 'Acab.',      w: '84px',  orange: false },
    { label: 'Obs',        w: '80px',  orange: false },
    { label: '',           w: '60px',  orange: false },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0, position: 'relative' }}>

      {/* Pending overlay */}
      {isPending && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50,
          backgroundColor: 'rgba(249,249,248,0.9)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <Loader2 className="h-10 w-10 animate-spin" style={{ color: '#f97316' }} />
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#1a1c1c', fontFamily: "'Space Grotesk', sans-serif" }}>
              Salvando peças...
            </span>
          </div>
        </div>
      )}

      {/* ── RESUMO / CONFIRMAÇÃO DE LOTE ── */}
      {duplicateConfirm && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 60,
          backgroundColor: 'rgba(28,25,23,0.60)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '8px', padding: '16px',
        }}>
          <div style={{
            backgroundColor: '#F7F6F3', borderRadius: '14px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
            width: '100%', maxWidth: '520px', maxHeight: '85vh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>

            {/* ── CABEÇALHO ── */}
            <div style={{
              padding: '22px 28px 18px',
              borderBottom: '1px solid #E7E3DC',
              backgroundColor: '#fff',
              borderRadius: '14px 14px 0 0',
            }}>
              <p style={{
                margin: 0, fontSize: '11px', fontWeight: '700', letterSpacing: '0.10em',
                textTransform: 'uppercase', color: '#9D978F',
                fontFamily: "'Space Grotesk', sans-serif",
              }}>
                Revisão do Lote
              </p>
              <p style={{
                margin: '4px 0 0', fontSize: '18px', fontWeight: '800', color: '#1F1D1A',
                fontFamily: "'Space Grotesk', sans-serif",
              }}>
                Confirmar criação de peças
              </p>
            </div>

            {/* ── CORPO SCROLLÁVEL ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* SEÇÃO 1 — O QUE SERÁ CRIADO */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <div style={{
                    width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e', flexShrink: 0,
                  }} />
                  <span style={{
                    fontSize: '10px', fontWeight: '700', letterSpacing: '0.10em', textTransform: 'uppercase',
                    color: '#6F6A63', fontFamily: "'Space Grotesk', sans-serif",
                  }}>
                    Será criado — {duplicateConfirm.valid.length} {duplicateConfirm.valid.length === 1 ? 'peça' : 'peças'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {duplicateConfirm.valid.map((item, i) => {
                    const isDup = duplicateConfirm.warnings.some(w =>
                      w.includes(`Linha ${i + 1} e`) || w.includes(`Linha ${i + 1} `) ||
                      (w.includes(`"${item.type}"`) && w.includes('já lançado'))
                    );
                    return (
                      <div key={i} style={{
                        backgroundColor: isDup ? '#fef9ec' : '#fff',
                        border: `1px solid ${isDup ? '#fde68a' : '#E7E3DC'}`,
                        borderRadius: '8px', padding: '10px 14px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                          {isDup && (
                            <span style={{
                              fontSize: '9px', fontWeight: '800', backgroundColor: '#fde68a',
                              color: '#92400e', borderRadius: '4px', padding: '2px 6px',
                              textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0,
                              fontFamily: "'Space Grotesk', sans-serif",
                            }}>
                              Dup
                            </span>
                          )}
                          <span style={{
                            fontSize: '13px', fontWeight: '700', color: '#1F1D1A',
                            fontFamily: "'Space Grotesk', sans-serif",
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {item.type}
                          </span>
                          {item.description && (
                            <span style={{ fontSize: '12px', color: '#9D978F', fontFamily: "'Plus Jakarta Sans', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {item.description}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                          <span style={{ fontSize: '11px', color: '#6F6A63', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                            {item.fileWidth} × {item.fileHeight}m
                          </span>
                          <span style={{ fontSize: '11px', color: '#6F6A63', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                            {item.material}
                          </span>
                          <span style={{
                            fontSize: '11px', fontWeight: '700', color: '#D97A1E',
                            fontFamily: "'Space Grotesk', sans-serif",
                            backgroundColor: '#FDF3E7', borderRadius: '4px', padding: '2px 7px',
                          }}>
                            {item.quantity}x
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SEÇÃO 2 — JÁ EXISTEM NO EVENTO */}
              {existingItems.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <div style={{
                      width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#A9B7C8', flexShrink: 0,
                    }} />
                    <span style={{
                      fontSize: '10px', fontWeight: '700', letterSpacing: '0.10em', textTransform: 'uppercase',
                      color: '#6F6A63', fontFamily: "'Space Grotesk', sans-serif",
                    }}>
                      Já existem no evento — {existingItems.length} {existingItems.length === 1 ? 'peça' : 'peças'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {existingItems.slice(0, 5).map((item) => (
                      <div key={item.id} style={{
                        backgroundColor: '#F7F6F3', border: '1px solid #E7E3DC',
                        borderRadius: '7px', padding: '8px 14px',
                        display: 'flex', alignItems: 'center', gap: '10px',
                      }}>
                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#D97A1E', fontFamily: "'Space Grotesk', sans-serif" }}>
                          {item.displayId}
                        </span>
                        <span style={{ fontSize: '12px', color: '#6F6A63', fontFamily: "'Plus Jakarta Sans', sans-serif", flex: 1 }}>
                          {item.type}
                        </span>
                        <span style={{ fontSize: '11px', color: '#9D978F', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                          {item.quantity}x
                        </span>
                      </div>
                    ))}
                    {existingItems.length > 5 && (
                      <p style={{ fontSize: '11px', color: '#9D978F', margin: '4px 0 0 14px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                        + {existingItems.length - 5} peças não exibidas
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* SEÇÃO 3 — DUPLICATAS (só se houver) */}
              {duplicateConfirm.warnings.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <div style={{
                      width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#D97A1E', flexShrink: 0,
                    }} />
                    <span style={{
                      fontSize: '10px', fontWeight: '700', letterSpacing: '0.10em', textTransform: 'uppercase',
                      color: '#D97A1E', fontFamily: "'Space Grotesk', sans-serif",
                    }}>
                      Duplicatas detectadas — {duplicateConfirm.warnings.length} {duplicateConfirm.warnings.length === 1 ? 'conflito' : 'conflitos'}
                    </span>
                  </div>
                  <div style={{
                    backgroundColor: '#FEF9EC', border: '1px solid #FDE68A',
                    borderRadius: '8px', padding: '12px 14px',
                    display: 'flex', flexDirection: 'column', gap: '7px',
                  }}>
                    {duplicateConfirm.warnings.map((w, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        <span style={{ color: '#D97A1E', fontWeight: '700', flexShrink: 0, fontSize: '12px', marginTop: '1px', fontFamily: "'Space Grotesk', sans-serif" }}>!</span>
                        <span style={{ fontSize: '12px', color: '#92400e', fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: '1.6' }}>{w}</span>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: '12px', color: '#6F6A63', margin: '10px 0 0', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    Você ainda pode confirmar — as peças serão criadas mesmo assim.
                  </p>
                </div>
              )}

            </div>

            {/* ── RODAPÉ ── */}
            <div style={{
              padding: '16px 28px',
              borderTop: '1px solid #E7E3DC',
              backgroundColor: '#fff',
              borderRadius: '0 0 14px 14px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
            }}>
              <p style={{ margin: 0, fontSize: '12px', color: '#9D978F', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                {duplicateConfirm.valid.length} {duplicateConfirm.valid.length === 1 ? 'peça nova' : 'peças novas'} ·{' '}
                {existingItems.length} existentes no evento
              </p>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setDuplicateConfirm(null)}
                  style={{
                    padding: '9px 20px', background: 'none', border: '1.5px solid #E7E3DC',
                    borderRadius: '8px', color: '#6F6A63', fontSize: '13px', fontWeight: '600',
                    cursor: 'pointer', fontFamily: "'Space Grotesk', sans-serif",
                    transition: 'border-color 0.15s',
                  }}
                >
                  Voltar e revisar
                </button>
                <button
                  type="button"
                  onClick={() => { setDuplicateConfirm(null); onSubmit(duplicateConfirm.valid); }}
                  style={{
                    padding: '9px 22px',
                    background: 'linear-gradient(135deg, #2E2A26 0%, #1F1D1A 100%)',
                    border: 'none', borderRadius: '8px', color: '#fff',
                    fontSize: '13px', fontWeight: '800', cursor: 'pointer',
                    fontFamily: "'Space Grotesk', sans-serif",
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                    display: 'flex', alignItems: 'center', gap: '8px',
                  }}
                  data-testid="button-confirm-duplicates"
                >
                  <span>Confirmar Lote</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── SCROLL AREA ── */}
      <div
        ref={tableRef}
        className="scrollbar-visible"
        style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', minWidth: 0 }}
      >
        <div style={{ minWidth: '970px', padding: '16px 20px 24px' }}>

          {/* ══ SEÇÃO: PEÇAS JÁ LANÇADAS ══ */}
          {existingItems.length > 0 && (
            <ExistingItemsPanel items={existingItems} onDelete={onDeleteExistingItem} />
          )}

          {/* ══ SEÇÃO: GRID DE LOTE ══ */}
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                {cols.map((col, i) => (
                  <th key={i} style={{
                    paddingBottom: '10px', paddingLeft: '5px', paddingRight: '5px',
                    fontSize: '10px', fontWeight: '800',
                    textTransform: 'uppercase', letterSpacing: '0.1em',
                    color: col.orange ? '#f97316' : '#a8a29e',
                    whiteSpace: 'nowrap', fontFamily: "'Space Grotesk', sans-serif",
                    width: col.w || undefined,
                  }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr
                  key={row.id}
                  style={{ transition: 'background-color 0.12s' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(243,244,243,0.7)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {/* 0 · Tipo */}
                  <td style={{ padding: '2px 4px' }}>
                    <TipoSelect
                      value={row.type}
                      options={allTypeOptions}
                      onChange={v => updateRow(row.id, 'type', v)}
                      rowIndex={ri}
                      onNavigateNext={() => focusNextField(ri, 0)}
                    />
                  </td>

                  {/* 1 · Descrição */}
                  <td style={{ padding: '2px 4px' }}>
                    <input
                      type="text"
                      value={row.description}
                      onChange={e => updateRow(row.id, 'description', e.target.value)}
                      placeholder="Opcional"
                      style={fieldStyle}
                      data-nav-row={ri} data-nav-field="1"
                      data-testid={`input-description-${ri}`}
                      {...navHandlers(ri, 1)}
                    />
                  </td>

                  {/* 2 · Qtd */}
                  <td style={{ padding: '2px 4px' }}>
                    <input
                      type="number" min="1"
                      value={row.quantity}
                      onChange={e => updateRow(row.id, 'quantity', e.target.value)}
                      style={{ ...fieldStyle, textAlign: 'center' }}
                      data-nav-row={ri} data-nav-field="2"
                      data-testid={`input-quantity-${ri}`}
                      {...navHandlers(ri, 2)}
                    />
                  </td>

                  {/* 3 · VIS. L */}
                  <td style={{ padding: '2px 4px' }}>
                    <input
                      type="number" step="0.01" min="0"
                      value={row.visualWidth}
                      onChange={e => updateRow(row.id, 'visualWidth', e.target.value)}
                      placeholder="0.00"
                      style={{ ...fieldStyle, textAlign: 'center' }}
                      data-nav-row={ri} data-nav-field="3"
                      data-testid={`input-visual-width-${ri}`}
                      {...navHandlers(ri, 3)}
                    />
                  </td>

                  {/* 4 · VIS. A */}
                  <td style={{ padding: '2px 4px' }}>
                    <input
                      type="number" step="0.01" min="0"
                      value={row.visualHeight}
                      onChange={e => updateRow(row.id, 'visualHeight', e.target.value)}
                      placeholder="0.00"
                      style={{ ...fieldStyle, textAlign: 'center' }}
                      data-nav-row={ri} data-nav-field="4"
                      data-testid={`input-visual-height-${ri}`}
                      {...navHandlers(ri, 4)}
                    />
                  </td>

                  {/* 5 · ARQ. L */}
                  <td style={{ padding: '2px 4px' }}>
                    <input
                      type="number" step="0.01" min="0"
                      value={row.fileWidth}
                      onChange={e => updateRow(row.id, 'fileWidth', e.target.value)}
                      placeholder="0.00"
                      style={{ ...fieldStyle, textAlign: 'center' }}
                      data-nav-row={ri} data-nav-field="5"
                      data-testid={`input-file-width-${ri}`}
                      {...navHandlers(ri, 5)}
                    />
                  </td>

                  {/* 6 · ARQ. A */}
                  <td style={{ padding: '2px 4px' }}>
                    <input
                      type="number" step="0.01" min="0"
                      value={row.fileHeight}
                      onChange={e => updateRow(row.id, 'fileHeight', e.target.value)}
                      placeholder="0.00"
                      style={{ ...fieldStyle, textAlign: 'center' }}
                      data-nav-row={ri} data-nav-field="6"
                      data-testid={`input-file-height-${ri}`}
                      {...navHandlers(ri, 6)}
                    />
                  </td>

                  {/* M² — read-only, no nav index */}
                  <td style={{ padding: '2px 4px' }}>
                    <div style={{
                      backgroundColor: '#fff7ed', borderRadius: '6px',
                      padding: '5px 8px', fontSize: '12px', fontWeight: '800',
                      color: row.calculatedM2 > 0 ? '#f97316' : '#fcd9b8',
                      textAlign: 'center', fontFamily: 'monospace',
                    }}>
                      {row.calculatedM2 > 0 ? row.calculatedM2.toFixed(2) : '—'}
                    </div>
                  </td>

                  {/* 7 · Material */}
                  <td style={{ padding: '2px 4px' }}>
                    <select
                      value={row.material}
                      onChange={e => updateRow(row.id, 'material', e.target.value)}
                      style={selectStyle}
                      data-nav-row={ri} data-nav-field="7"
                      data-testid={`select-material-${ri}`}
                      {...navHandlers(ri, 7)}
                    >
                      <option value="">Material</option>
                      {materials.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </td>

                  {/* 8 · Acabamento */}
                  <td style={{ padding: '2px 4px' }}>
                    <select
                      value={row.finish}
                      onChange={e => updateRow(row.id, 'finish', e.target.value)}
                      style={selectStyle}
                      data-nav-row={ri} data-nav-field="8"
                      data-testid={`select-finish-${ri}`}
                      {...navHandlers(ri, 8)}
                    >
                      <option value="">Acabamento</option>
                      {finishes.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </td>

                  {/* 9 · Obs — last nav field */}
                  <td style={{ padding: '2px 4px' }}>
                    <input
                      type="text"
                      value={row.observations}
                      onChange={e => updateRow(row.id, 'observations', e.target.value)}
                      placeholder="..."
                      style={fieldStyle}
                      data-nav-row={ri} data-nav-field="9"
                      data-testid={`input-observations-${ri}`}
                      {...navHandlers(ri, 9)}
                    />
                  </td>

                  {/* Ações */}
                  <td style={{ padding: '2px 4px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                      <input
                        type="number" min="1" max="99"
                        value={getReplicateCount(row.id)}
                        onChange={e => setReplicateCount(row.id, parseInt(e.target.value) || 1)}
                        onClick={e => (e.target as HTMLInputElement).select()}
                        title="Cópias"
                        data-testid={`input-replicate-count-${ri}`}
                        style={{
                          width: '28px', height: '26px',
                          backgroundColor: '#f0efee', border: 'none', borderRadius: '4px',
                          fontSize: '11px', fontWeight: '700', textAlign: 'center',
                          color: '#57534e', outline: 'none', padding: '0',
                          fontFamily: "'Plus Jakarta Sans', sans-serif",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => duplicateRow(row.id)}
                        title={`Replicar ${getReplicateCount(row.id)}x`}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px', borderRadius: '4px', color: '#c4bfbb', lineHeight: 0 }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#1a1c1c')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#c4bfbb')}
                        data-testid={`button-duplicate-${ri}`}
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        title="Remover"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px', borderRadius: '4px', color: '#ddd9d5', lineHeight: 0 }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#ddd9d5')}
                        data-testid={`button-remove-${ri}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ── ADICIONAR LINHA ── */}
          <div style={{ marginTop: '10px' }}>
            <button
              type="button"
              onClick={addRow}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '6px 16px',
                border: '1.5px dashed #d6d3d1', borderRadius: '6px',
                backgroundColor: 'transparent', color: '#78716c',
                fontSize: '11px', fontWeight: '700',
                textTransform: 'uppercase', letterSpacing: '0.08em',
                cursor: 'pointer', fontFamily: "'Space Grotesk', sans-serif",
                transition: 'border-color 0.12s, color 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#f97316'; e.currentTarget.style.color = '#f97316'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#d6d3d1'; e.currentTarget.style.color = '#78716c'; }}
              data-testid="button-add-row"
            >
              <Plus size={13} />
              Adicionar Linha
            </button>
          </div>

        </div>
      </div>

      {/* ── FOOTER ── */}
      <div style={{
        padding: '12px 24px',
        backgroundColor: '#f5f5f4',
        borderTop: '1px solid #e7e5e4',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexShrink: 0,
      }}>
        {/* Status chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '99px', backgroundColor: '#f97316' }} />
            <span style={{ fontSize: '10px', fontWeight: '700', color: '#78716c', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>
              Cálculo Automático
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '99px', backgroundColor: validCount > 0 ? '#22c55e' : '#d6d3d1' }} />
            <span style={{ fontSize: '10px', fontWeight: '700', color: '#78716c', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>
              {validCount} {validCount === 1 ? 'Peça Válida' : 'Peças Válidas'}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '9px 20px', background: 'none', border: 'none',
              color: '#78716c', fontSize: '13px', fontWeight: '600',
              cursor: 'pointer', transition: 'color 0.12s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#1a1c1c')}
            onMouseLeave={e => (e.currentTarget.style.color = '#78716c')}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '9px 22px',
              backgroundColor: isPending ? '#57534e' : '#1c1917',
              color: '#fff', borderRadius: '8px', border: 'none',
              fontSize: '13px', fontWeight: '900',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              cursor: isPending ? 'not-allowed' : 'pointer',
              fontFamily: "'Space Grotesk', sans-serif",
              transition: 'background-color 0.12s',
            }}
            onMouseEnter={e => { if (!isPending) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#f97316'; }}
            onMouseLeave={e => { if (!isPending) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#1c1917'; }}
            data-testid="button-submit-bulk"
          >
            {isPending
              ? <><Loader2 size={15} className="animate-spin" /> Salvando...</>
              : <>Finalizar Lote <ArrowRight size={15} /></>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
