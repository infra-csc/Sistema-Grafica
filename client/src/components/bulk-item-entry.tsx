import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, Copy, Trash2, Loader2, ArrowRight, ChevronDown, Check } from "lucide-react";
import { calculateM2FromStrings } from "@/lib/calculateM2";

const materials = ["Adesivo", "Lona", "Sanett", "Tecido"];
const finishes = ["Dupla Face", "Ilhós", "Impresso", "Recorte", "Refile"];

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
  material?: string | null;
  status: string;
}

interface BulkItemEntryProps {
  eventId: string;
  standardItems?: StandardItem[];
  sponsors?: Sponsor[];
  existingItems?: ExistingItem[];
  onSubmit: (items: any[]) => void;
  onCancel: () => void;
  isPending?: boolean;
}

/* ── TipoSelect ─────────────────────────────────────────────────────── */
function TipoSelect({ value, options, onChange, rowId, onFocusIn }: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  rowId?: string;
  onFocusIn?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = search
    ? options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  const displayValue = open ? search : value;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          value={displayValue}
          onChange={e => { setSearch(e.target.value); onChange(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => { setSearch(""); setOpen(true); onFocusIn?.(); }}
          onBlur={e => { e.currentTarget.style.borderColor = 'transparent'; }}
          placeholder={value || "Selecionar..."}
          data-row-id={rowId}
          data-field="type"
          style={{
            ...fieldStyle,
            paddingRight: '24px',
            textOverflow: 'ellipsis',
            cursor: 'pointer',
            backgroundColor: open ? '#e8e8e7' : '#f3f4f3',
          }}
          onMouseDown={() => { if (!open) { setSearch(""); setOpen(true); } }}
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
      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 3px)', left: 0, zIndex: 500,
            backgroundColor: '#ffffff',
            border: '1px solid #e7e5e4',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            maxHeight: 200, overflowY: 'auto',
            minWidth: 190,
            padding: '4px',
            scrollbarWidth: 'thin',
            scrollbarColor: '#d6d3d1 #f5f5f4',
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 12, color: '#a8a29e', textAlign: 'center', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Nenhum resultado
            </div>
          ) : (
            filtered.map(opt => {
              const selected = opt === value;
              return (
                <div
                  key={opt}
                  onMouseDown={() => { onChange(opt); setSearch(""); setOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '7px 10px', borderRadius: 6, fontSize: 12,
                    fontWeight: selected ? 700 : 500,
                    color: selected ? '#f97316' : '#1c1917',
                    backgroundColor: selected ? '#fff7ed' : 'transparent',
                    cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", gap: 6,
                  }}
                  onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLDivElement).style.backgroundColor = '#f5f5f4'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = selected ? '#fff7ed' : ''; }}
                >
                  <span style={{ flex: 1 }}>{opt}</span>
                  {selected && <Check size={10} color="#f97316" />}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
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

const orangeFocus = {
  onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { e.currentTarget.style.borderColor = '#f97316'; },
  onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { e.currentTarget.style.borderColor = 'transparent'; },
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

function createEmptyRow(): BulkItemRow {
  return {
    id: Math.random().toString(36).substring(7),
    type: "", description: "", quantity: "1",
    visualWidth: "", visualHeight: "", fileWidth: "", fileHeight: "",
    material: "", finish: "", measurement: "", observations: "",
    calculatedM2: 0, sponsorId: "",
  };
}

/* ── Main Component ─────────────────────────────────────────────────── */
export function BulkItemEntry({ eventId, standardItems = [], sponsors = [], existingItems = [], onSubmit, onCancel, isPending }: BulkItemEntryProps) {
  const [rows, setRows] = useState<BulkItemRow[]>([createEmptyRow()]);
  const [replicateCounts, setReplicateCounts] = useState<Record<string, number>>({});
  const tableRef = useRef<HTMLDivElement>(null);

  function getReplicateCount(id: string) { return replicateCounts[id] ?? 1; }
  function setReplicateCount(id: string, n: number) {
    setReplicateCounts(prev => ({ ...prev, [id]: Math.max(1, Math.min(99, n)) }));
  }

  function updateRow(id: string, field: keyof BulkItemRow, value: string) {
    setRows(prev => prev.map(row => {
      if (row.id !== id) return row;
      const updated = { ...row, [field]: value };
      if (field === 'type') {
        updated.visualWidth = ""; updated.visualHeight = "";
        updated.fileWidth = ""; updated.fileHeight = "";
        updated.material = ""; updated.finish = "";
        updated.measurement = ""; updated.calculatedM2 = 0;
        const stdItem = standardItems.find(s => s.name === value);
        if (stdItem) {
          const vw = stdItem.visualWidth ? String(stdItem.visualWidth) : (stdItem.area ? String(stdItem.area) : "");
          const vh = stdItem.visualHeight ? String(stdItem.visualHeight) : (stdItem.visual ? String(stdItem.visual) : "");
          const fw = stdItem.fileWidth ? String(stdItem.fileWidth) : "";
          const fh = stdItem.fileHeight ? String(stdItem.fileHeight) : "";
          updated.visualWidth = vw; updated.visualHeight = vh;
          updated.fileWidth = fw; updated.fileHeight = fh;
          updated.material = stdItem.material || ""; updated.finish = stdItem.finish || "";
          updated.measurement = fw && fh ? `${fw} × ${fh}` : "";
          updated.calculatedM2 = calculateM2FromStrings(updated.quantity, fw, fh);
        }
      }
      if (field === 'quantity' || field === 'fileWidth' || field === 'fileHeight') {
        updated.calculatedM2 = calculateM2FromStrings(updated.quantity, updated.fileWidth, updated.fileHeight);
        updated.measurement = `${updated.fileWidth} × ${updated.fileHeight}`;
      }
      return updated;
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
    const newRows = Array.from({ length: count }, () => ({ ...src, id: Math.random().toString(36).substring(7) }));
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === id);
      const next = [...prev];
      next.splice(idx + 1, 0, ...newRows);
      return next;
    });
    setReplicateCount(id, 1);
  }

  /* Tab from last field of last row → add new row + focus */
  function handleLastFieldTab(e: React.KeyboardEvent, rowIndex: number) {
    if (e.key === 'Tab' && !e.shiftKey) {
      if (rowIndex === rows.length - 1) {
        e.preventDefault();
        addRow();
        setTimeout(() => {
          const inputs = tableRef.current?.querySelectorAll<HTMLElement>(`[data-field="type"]`);
          if (inputs && inputs[rowIndex + 1]) inputs[rowIndex + 1].focus();
        }, 40);
      }
    }
  }

  function handleSubmit() {
    const valid = rows
      .filter(r => r.type && parseFloat(r.quantity) > 0 && parseFloat(r.visualWidth) > 0 &&
        parseFloat(r.visualHeight) > 0 && parseFloat(r.fileWidth) > 0 &&
        parseFloat(r.fileHeight) > 0 && r.material && r.finish)
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
    if (valid.length === 0) { alert("Preencha pelo menos uma peça completa antes de salvar."); return; }
    onSubmit(valid);
  }

  const totalM2 = rows.reduce((sum, r) => sum + r.calculatedM2, 0);
  const validCount = rows.filter(r =>
    r.type && parseFloat(r.quantity) > 0 && parseFloat(r.visualWidth) > 0 &&
    parseFloat(r.visualHeight) > 0 && parseFloat(r.fileWidth) > 0 &&
    parseFloat(r.fileHeight) > 0 && r.material && r.finish
  ).length;

  const allTypeOptions = standardItems.map(s => s.name).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  /* ── Column defs ── */
  const cols = [
    { label: 'Tipo',       w: '130px', orange: false },
    { label: 'Descrição',  w: '130px', orange: false },
    { label: 'Qtd',        w: '50px',  orange: false },
    { label: 'VIS. L',     w: '64px',  orange: true  },
    { label: 'VIS. A',     w: '64px',  orange: true  },
    { label: 'ARQ. L',     w: '64px',  orange: true  },
    { label: 'ARQ. A',     w: '64px',  orange: true  },
    { label: 'M²',         w: '58px',  orange: true  },
    { label: 'Material',   w: '86px',  orange: false },
    { label: 'Acabamento', w: '86px',  orange: false },
    { label: 'Obs',        w: '82px',  orange: false },
    { label: '',           w: '62px',  orange: false },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0, position: 'relative' }}>

      {/* Pending overlay */}
      {isPending && (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(249,249,248,0.88)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <Loader2 className="h-10 w-10 animate-spin" style={{ color: '#fd761a' }} />
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#1a1c1c', fontFamily: "'Space Grotesk', sans-serif" }}>Salvando peças...</span>
          </div>
        </div>
      )}

      {/* ── SCROLL AREA ── */}
      <div
        ref={tableRef}
        className="scrollbar-visible"
        style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ minWidth: '970px', padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>

          {/* ── PEÇAS JÁ LANÇADAS ── */}
          {existingItems.length > 0 && (
            <div style={{ marginBottom: '14px', border: '1px solid #e7e5e4', borderRadius: '8px', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 12px', backgroundColor: '#f5f5f4', borderBottom: '1px solid #e7e5e4' }}>
                <span style={{ fontSize: '9px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#78716c', fontFamily: "'Space Grotesk', sans-serif" }}>
                  Peças já lançadas
                </span>
                <span style={{ fontSize: '9px', fontWeight: '800', backgroundColor: '#1c1917', color: '#fff', borderRadius: '99px', padding: '1px 6px', fontFamily: "'Space Grotesk', sans-serif" }}>
                  {existingItems.length}
                </span>
              </div>
              {/* Mini-grid */}
              <div
                className="scrollbar-visible"
                style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '8px 12px', backgroundColor: '#fafaf9', maxHeight: '120px', overflowY: 'auto' }}
              >
                {existingItems.map(item => (
                  <div
                    key={item.id}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      padding: '3px 8px',
                      backgroundColor: '#ffffff', border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                    }}
                  >
                    <span style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', fontFamily: "'DM Mono', 'JetBrains Mono', monospace" }}>
                      {item.displayId}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: '600', color: '#1a1c1c', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                      {item.type}
                    </span>
                    {item.quantity > 1 && (
                      <span style={{ fontSize: '10px', color: '#94a3b8', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>×{item.quantity}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── GRID DE LOTE ── */}
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                {cols.map((col, i) => (
                  <th
                    key={i}
                    style={{
                      paddingBottom: '10px',
                      paddingLeft: '5px', paddingRight: '5px',
                      fontSize: '10px', fontWeight: '800',
                      textTransform: 'uppercase', letterSpacing: '0.1em',
                      color: col.orange ? '#f97316' : '#a8a29e',
                      whiteSpace: 'nowrap',
                      fontFamily: "'Space Grotesk', sans-serif",
                      width: col.w || undefined,
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={row.id}
                  style={{ transition: 'background-color 0.12s' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(243,244,243,0.7)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {/* Tipo */}
                  <td style={{ padding: '2px 4px' }}>
                    <TipoSelect
                      value={row.type}
                      options={allTypeOptions}
                      onChange={v => updateRow(row.id, 'type', v)}
                      rowId={row.id}
                    />
                  </td>

                  {/* Descrição */}
                  <td style={{ padding: '2px 4px' }}>
                    <input
                      type="text"
                      value={row.description}
                      onChange={e => updateRow(row.id, 'description', e.target.value)}
                      placeholder="Opcional"
                      style={fieldStyle}
                      {...orangeFocus}
                      data-testid={`input-description-${index}`}
                    />
                  </td>

                  {/* Qtd */}
                  <td style={{ padding: '2px 4px' }}>
                    <input
                      type="number" min="1"
                      value={row.quantity}
                      onChange={e => updateRow(row.id, 'quantity', e.target.value)}
                      style={{ ...fieldStyle, textAlign: 'center' }}
                      {...orangeFocus}
                      data-testid={`input-quantity-${index}`}
                    />
                  </td>

                  {/* VIS. L */}
                  <td style={{ padding: '2px 4px' }}>
                    <input
                      type="number" step="0.01" min="0"
                      value={row.visualWidth}
                      onChange={e => updateRow(row.id, 'visualWidth', e.target.value)}
                      placeholder="0.00"
                      style={{ ...fieldStyle, textAlign: 'center' }}
                      {...orangeFocus}
                      data-testid={`input-visual-width-${index}`}
                    />
                  </td>

                  {/* VIS. A */}
                  <td style={{ padding: '2px 4px' }}>
                    <input
                      type="number" step="0.01" min="0"
                      value={row.visualHeight}
                      onChange={e => updateRow(row.id, 'visualHeight', e.target.value)}
                      placeholder="0.00"
                      style={{ ...fieldStyle, textAlign: 'center' }}
                      {...orangeFocus}
                      data-testid={`input-visual-height-${index}`}
                    />
                  </td>

                  {/* ARQ. L */}
                  <td style={{ padding: '2px 4px' }}>
                    <input
                      type="number" step="0.01" min="0"
                      value={row.fileWidth}
                      onChange={e => updateRow(row.id, 'fileWidth', e.target.value)}
                      placeholder="0.00"
                      style={{ ...fieldStyle, textAlign: 'center' }}
                      {...orangeFocus}
                      data-testid={`input-file-width-${index}`}
                    />
                  </td>

                  {/* ARQ. A */}
                  <td style={{ padding: '2px 4px' }}>
                    <input
                      type="number" step="0.01" min="0"
                      value={row.fileHeight}
                      onChange={e => updateRow(row.id, 'fileHeight', e.target.value)}
                      placeholder="0.00"
                      style={{ ...fieldStyle, textAlign: 'center' }}
                      {...orangeFocus}
                      data-testid={`input-file-height-${index}`}
                    />
                  </td>

                  {/* M² */}
                  <td style={{ padding: '2px 4px' }}>
                    <div style={{
                      backgroundColor: '#fff7ed', borderRadius: '6px',
                      padding: '5px 8px', fontSize: '12px', fontWeight: '800',
                      color: row.calculatedM2 > 0 ? '#f97316' : '#fcd9b8',
                      textAlign: 'center', fontFamily: 'monospace',
                      border: '1.5px solid transparent',
                    }}>
                      {row.calculatedM2 > 0 ? row.calculatedM2.toFixed(2) : '—'}
                    </div>
                  </td>

                  {/* Material */}
                  <td style={{ padding: '2px 4px' }}>
                    <select
                      value={row.material}
                      onChange={e => updateRow(row.id, 'material', e.target.value)}
                      style={selectStyle}
                      {...orangeFocus}
                      data-testid={`select-material-${index}`}
                    >
                      <option value="">Material</option>
                      {materials.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </td>

                  {/* Acabamento */}
                  <td style={{ padding: '2px 4px' }}>
                    <select
                      value={row.finish}
                      onChange={e => updateRow(row.id, 'finish', e.target.value)}
                      style={selectStyle}
                      {...orangeFocus}
                      data-testid={`select-finish-${index}`}
                    >
                      <option value="">Acabamento</option>
                      {finishes.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </td>

                  {/* Obs — last field: Tab creates new row */}
                  <td style={{ padding: '2px 4px' }}>
                    <input
                      type="text"
                      value={row.observations}
                      onChange={e => updateRow(row.id, 'observations', e.target.value)}
                      placeholder="..."
                      style={fieldStyle}
                      {...orangeFocus}
                      onKeyDown={e => handleLastFieldTab(e, index)}
                      data-testid={`input-observations-${index}`}
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
                        data-testid={`input-replicate-count-${index}`}
                        style={{ width: '30px', height: '26px', backgroundColor: '#f0efee', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '700', textAlign: 'center', color: '#57534e', outline: 'none', padding: '0', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                      />
                      <button
                        type="button"
                        onClick={() => duplicateRow(row.id)}
                        title={`Replicar ${getReplicateCount(row.id)}x`}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px', borderRadius: '4px', color: '#c4bfbb', lineHeight: 0 }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#1a1c1c')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#c4bfbb')}
                        data-testid={`button-duplicate-${index}`}
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
                        data-testid={`button-remove-${index}`}
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
          <div style={{ marginTop: '8px' }}>
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

          {/* ── TOTAL BAR (sticky bottom of scroll area) ── */}
          <div style={{
            position: 'sticky', bottom: 0,
            marginTop: 'auto', paddingTop: '12px',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px',
              padding: '10px 16px',
              backgroundColor: '#fff7ed',
              borderRadius: '8px',
              border: '1px solid #fed7aa',
            }}>
              <span style={{ fontSize: '10px', fontWeight: '800', color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: "'Space Grotesk', sans-serif" }}>
                Total Estimado do Lote
              </span>
              <span style={{ fontSize: '22px', fontWeight: '900', color: '#f97316', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                {totalM2.toFixed(2)}<span style={{ fontSize: '13px', marginLeft: '3px' }}>m²</span>
              </span>
            </div>
          </div>

        </div>
      </div>

      {/* ── FOOTER ── */}
      <div style={{
        padding: '14px 24px',
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
              Cálculo Automático Ativo
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
            style={{ padding: '9px 20px', background: 'none', border: 'none', color: '#78716c', fontSize: '13px', fontWeight: '600', cursor: 'pointer', transition: 'color 0.12s' }}
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
            {isPending ? (
              <><Loader2 size={15} className="animate-spin" /> Salvando...</>
            ) : (
              <>Finalizar Lote <ArrowRight size={15} /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
