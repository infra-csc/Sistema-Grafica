import { useState } from "react";
import { Plus, Copy, Trash2, Loader2, ArrowRight } from "lucide-react";
import { calculateM2FromStrings } from "@/lib/calculateM2";

const itemTypes = ["2x1", "Arena", "Halter", "Palco", "Painel Rosto", "Percurso", "Pórtico", "Prismas", "Qd Fotos", "Rolo", "Stand", "Testeiras", "WindBanner"];
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

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  requested: 'Solicitado',
  awaiting_linking: 'Ag. Vinculação',
  awaiting_submission: 'Ag. Envio',
  awaiting_approval: 'Ag. Aprovação',
  awaiting_finalization: 'Ag. Finalização',
  awaiting_final_review: 'Ag. Revisão',
  ready_for_production: 'Pronto p/ Prod.',
  approved: 'Liberado',
  inProduction: 'Em Produção',
  produced: 'Produzido',
  delivered: 'Entregue',
};

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  draft:                  { bg: '#f0efee', color: '#78716c' },
  requested:              { bg: '#fef3c7', color: '#92400e' },
  awaiting_linking:       { bg: '#fef3c7', color: '#92400e' },
  awaiting_submission:    { bg: '#fef3c7', color: '#92400e' },
  awaiting_approval:      { bg: '#dbeafe', color: '#1e40af' },
  awaiting_finalization:  { bg: '#dbeafe', color: '#1e40af' },
  awaiting_final_review:  { bg: '#dbeafe', color: '#1e40af' },
  ready_for_production:   { bg: '#d1fae5', color: '#065f46' },
  approved:               { bg: '#d1fae5', color: '#065f46' },
  inProduction:           { bg: '#ffedd5', color: '#9a3412' },
  produced:               { bg: '#e0e7ff', color: '#3730a3' },
  delivered:              { bg: '#d1fae5', color: '#065f46' },
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: '#f0efee',
  border: 'none',
  borderRadius: '6px',
  fontSize: '12px',
  padding: '8px 10px',
  outline: 'none',
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  color: '#1a1c1c',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  appearance: 'none' as any,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a8a29e' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 8px center',
  paddingRight: '28px',
};

function createEmptyRow(): BulkItemRow {
  return {
    id: Math.random().toString(36).substring(7),
    type: "",
    description: "",
    quantity: "1",
    visualWidth: "",
    visualHeight: "",
    fileWidth: "",
    fileHeight: "",
    material: "",
    finish: "",
    measurement: "",
    observations: "",
    calculatedM2: 0,
    sponsorId: "",
  };
}

export function BulkItemEntry({ eventId, standardItems = [], sponsors = [], existingItems = [], onSubmit, onCancel, isPending }: BulkItemEntryProps) {
  const [rows, setRows] = useState<BulkItemRow[]>([createEmptyRow()]);
  const [replicateCounts, setReplicateCounts] = useState<Record<string, number>>({});

  function getReplicateCount(id: string) {
    return replicateCounts[id] ?? 1;
  }

  function setReplicateCount(id: string, n: number) {
    setReplicateCounts(prev => ({ ...prev, [id]: Math.max(1, Math.min(99, n)) }));
  }

  function updateRow(id: string, field: keyof BulkItemRow, value: string) {
    setRows(prev =>
      prev.map(row => {
        if (row.id !== id) return row;
        const updated = { ...row, [field]: value };

        if (field === 'type') {
          // Always clear auto-filled fields when type changes
          updated.visualWidth = "";
          updated.visualHeight = "";
          updated.fileWidth = "";
          updated.fileHeight = "";
          updated.material = "";
          updated.finish = "";
          updated.measurement = "";
          updated.calculatedM2 = 0;

          const stdItem = standardItems.find(s => s.name === value);
          if (stdItem) {
            const vw = stdItem.visualWidth ? String(stdItem.visualWidth) : (stdItem.area ? String(stdItem.area) : "");
            const vh = stdItem.visualHeight ? String(stdItem.visualHeight) : (stdItem.visual ? String(stdItem.visual) : "");
            const fw = stdItem.fileWidth ? String(stdItem.fileWidth) : "";
            const fh = stdItem.fileHeight ? String(stdItem.fileHeight) : "";
            updated.visualWidth = vw;
            updated.visualHeight = vh;
            updated.fileWidth = fw;
            updated.fileHeight = fh;
            updated.material = stdItem.material || "";
            updated.finish = stdItem.finish || "";
            updated.measurement = fw && fh ? `${fw} × ${fh}` : "";
            updated.calculatedM2 = calculateM2FromStrings(updated.quantity, fw, fh);
          }
        }

        if (field === 'quantity' || field === 'fileWidth' || field === 'fileHeight') {
          updated.calculatedM2 = calculateM2FromStrings(updated.quantity, updated.fileWidth, updated.fileHeight);
          updated.measurement = `${updated.fileWidth} × ${updated.fileHeight}`;
        }

        return updated;
      })
    );
  }

  function addRow() {
    setRows(prev => [...prev, createEmptyRow()]);
  }

  function removeRow(id: string) {
    if (rows.length === 1) return;
    setRows(prev => prev.filter(r => r.id !== id));
  }

  function duplicateRow(id: string) {
    const src = rows.find(r => r.id === id);
    if (!src) return;
    const count = getReplicateCount(id);
    const newRows = Array.from({ length: count }, () => ({
      ...src,
      id: Math.random().toString(36).substring(7),
    }));
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === id);
      const next = [...prev];
      next.splice(idx + 1, 0, ...newRows);
      return next;
    });
    // reset count back to 1 after duplicating
    setReplicateCount(id, 1);
  }

  function handleSubmit() {
    const valid = rows
      .filter(r =>
        r.type &&
        parseFloat(r.quantity) > 0 &&
        parseFloat(r.visualWidth) > 0 &&
        parseFloat(r.visualHeight) > 0 &&
        parseFloat(r.fileWidth) > 0 &&
        parseFloat(r.fileHeight) > 0 &&
        r.material &&
        r.finish
      )
      .map(r => ({
        eventId,
        type: r.type,
        description: r.description || "",
        quantity: parseInt(r.quantity),
        area: parseFloat(r.visualWidth),
        visual: parseFloat(r.visualHeight),
        visualWidth: r.visualWidth,
        visualHeight: r.visualHeight,
        fileWidth: r.fileWidth,
        fileHeight: r.fileHeight,
        material: r.material,
        finish: r.finish,
        measurement: r.measurement || `${r.fileWidth} × ${r.fileHeight}`,
        observations: r.observations || "",
        calculatedM2: r.calculatedM2,
      }));

    if (valid.length === 0) {
      alert("Preencha pelo menos uma peça completa antes de salvar.");
      return;
    }
    onSubmit(valid);
  }

  const totalM2 = rows.reduce((sum, r) => sum + r.calculatedM2, 0);
  const validCount = rows.filter(r =>
    r.type && parseFloat(r.quantity) > 0 && parseFloat(r.visualWidth) > 0 &&
    parseFloat(r.visualHeight) > 0 && parseFloat(r.fileWidth) > 0 &&
    parseFloat(r.fileHeight) > 0 && r.material && r.finish
  ).length;

  const allTypeOptions = [
    ...standardItems.map(s => s.name),
    ...itemTypes.filter(t => !standardItems.find(s => s.name === t)),
  ].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0, position: 'relative' }}>
      {isPending && (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(249,249,248,0.85)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <Loader2 className="h-10 w-10 animate-spin" style={{ color: '#fd761a' }} />
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#1a1c1c' }}>Salvando peças...</span>
          </div>
        </div>
      )}

      {/* TABLE AREA */}
      <div tabIndex={0} className="scrollbar-visible" style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: '20px', minWidth: 0, outline: 'none' }}>
        <div style={{ minWidth: '990px' }}>

        {/* EXISTING ITEMS PANEL */}
        {existingItems.length > 0 && (
          <div style={{ marginBottom: '20px', border: '1px solid #e7e5e4', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', backgroundColor: '#f5f5f4', borderBottom: '1px solid #e7e5e4' }}>
              <span style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#78716c', fontFamily: "'Space Grotesk', sans-serif" }}>
                Peças já no evento
              </span>
              <span style={{ fontSize: '11px', fontWeight: '700', backgroundColor: '#e7e5e4', color: '#57534e', borderRadius: '99px', padding: '1px 8px' }}>
                {existingItems.length}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '10px 16px', backgroundColor: '#fafaf9' }}>
              {existingItems.map(item => {
                const sc = STATUS_COLOR[item.status] ?? { bg: '#f0efee', color: '#78716c' };
                const sl = STATUS_LABEL[item.status] ?? item.status;
                return (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', backgroundColor: '#fff', border: '1px solid #e7e5e4', borderRadius: '6px', fontSize: '11px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    <span style={{ fontWeight: '700', color: '#a8a29e', fontSize: '10px', fontFamily: 'monospace' }}>{item.displayId}</span>
                    <span style={{ fontWeight: '600', color: '#1a1c1c' }}>{item.type}</span>
                    {item.quantity > 1 && <span style={{ color: '#a8a29e' }}>×{item.quantity}</span>}
                    {item.material && <span style={{ color: '#a8a29e' }}>· {item.material}</span>}
                    <span style={{ fontSize: '10px', fontWeight: '700', backgroundColor: sc.bg, color: sc.color, borderRadius: '4px', padding: '1px 6px', whiteSpace: 'nowrap' }}>{sl}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                {[
                  { label: 'Tipo', w: '130px' },
                  { label: 'Descrição', w: '140px' },
                  { label: 'Qtd', w: '54px' },
                  { label: 'Vis. L', w: '68px', orange: true },
                  { label: 'Vis. A', w: '68px', orange: true },
                  { label: 'Arq. L', w: '68px' },
                  { label: 'Arq. A', w: '68px' },
                  { label: 'M²', w: '62px', accent: true },
                  { label: 'Material', w: '90px' },
                  { label: 'Acabamento', w: '90px' },
                  { label: 'Obs', w: '86px' },
                  { label: '', w: '66px' },
                ].map((col, i) => (
                  <th
                    key={i}
                    style={{
                      paddingBottom: '16px',
                      paddingLeft: '8px',
                      paddingRight: '8px',
                      fontSize: '11px',
                      fontWeight: '800',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: col.orange ? '#f97316' : col.accent ? '#fd761a' : '#a8a29e',
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
                  className="group"
                  style={{ transition: 'background-color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(243,244,243,0.6)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {/* Tipo */}
                  <td style={{ padding: '3px 5px' }}>
                    <input
                      list={`types-list-${row.id}`}
                      value={row.type}
                      onChange={e => updateRow(row.id, 'type', e.target.value)}
                      placeholder="Buscar..."
                      style={{ ...inputStyle, textOverflow: 'ellipsis' }}
                      data-testid={`select-type-${index}`}
                      autoComplete="off"
                    />
                    <datalist id={`types-list-${row.id}`}>
                      {allTypeOptions.map(t => <option key={t} value={t} />)}
                    </datalist>
                  </td>

                  {/* Descrição */}
                  <td style={{ padding: '3px 5px' }}>
                    <input
                      type="text"
                      value={row.description}
                      onChange={e => updateRow(row.id, 'description', e.target.value)}
                      placeholder="Opcional"
                      style={inputStyle}
                      data-testid={`input-description-${index}`}
                    />
                  </td>

                  {/* Qtd */}
                  <td style={{ padding: '3px 5px' }}>
                    <input
                      type="number"
                      min="1"
                      value={row.quantity}
                      onChange={e => updateRow(row.id, 'quantity', e.target.value)}
                      style={{ ...inputStyle, textAlign: 'center' }}
                      data-testid={`input-quantity-${index}`}
                    />
                  </td>

                  {/* Visual Largura */}
                  <td style={{ padding: '3px 5px' }}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.visualWidth}
                      onChange={e => updateRow(row.id, 'visualWidth', e.target.value)}
                      placeholder="0.00"
                      style={{ ...inputStyle, textAlign: 'center', borderLeft: '2px solid #f97316', borderRadius: '0 6px 6px 0' }}
                      data-testid={`input-visual-width-${index}`}
                    />
                  </td>

                  {/* Visual Altura */}
                  <td style={{ padding: '3px 5px' }}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.visualHeight}
                      onChange={e => updateRow(row.id, 'visualHeight', e.target.value)}
                      placeholder="0.00"
                      style={{ ...inputStyle, textAlign: 'center' }}
                      data-testid={`input-visual-height-${index}`}
                    />
                  </td>

                  {/* Arquivo Largura */}
                  <td style={{ padding: '3px 5px' }}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.fileWidth}
                      onChange={e => updateRow(row.id, 'fileWidth', e.target.value)}
                      placeholder="0.00"
                      style={{ ...inputStyle, textAlign: 'center', borderLeft: '2px solid #d6d3d1', borderRadius: '0 6px 6px 0' }}
                      data-testid={`input-file-width-${index}`}
                    />
                  </td>

                  {/* Arquivo Altura */}
                  <td style={{ padding: '3px 5px' }}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.fileHeight}
                      onChange={e => updateRow(row.id, 'fileHeight', e.target.value)}
                      placeholder="0.00"
                      style={{ ...inputStyle, textAlign: 'center' }}
                      data-testid={`input-file-height-${index}`}
                    />
                  </td>

                  {/* M² calculado */}
                  <td style={{ padding: '3px 5px' }}>
                    <div style={{ backgroundColor: '#fdeee4', borderRadius: '6px', padding: '8px 10px', fontSize: '12px', fontWeight: '700', color: '#fd761a', textAlign: 'center', fontFamily: 'monospace' }}>
                      {row.calculatedM2 > 0 ? row.calculatedM2.toFixed(2) : '—'}
                    </div>
                  </td>

                  {/* Material */}
                  <td style={{ padding: '3px 5px' }}>
                    <select
                      value={row.material}
                      onChange={e => updateRow(row.id, 'material', e.target.value)}
                      style={selectStyle}
                      data-testid={`select-material-${index}`}
                    >
                      <option value="">Material</option>
                      {materials.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </td>

                  {/* Acabamento */}
                  <td style={{ padding: '3px 5px' }}>
                    <select
                      value={row.finish}
                      onChange={e => updateRow(row.id, 'finish', e.target.value)}
                      style={selectStyle}
                      data-testid={`select-finish-${index}`}
                    >
                      <option value="">Acabamento</option>
                      {finishes.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </td>

                  {/* Obs */}
                  <td style={{ padding: '3px 5px' }}>
                    <input
                      type="text"
                      value={row.observations}
                      onChange={e => updateRow(row.id, 'observations', e.target.value)}
                      placeholder="..."
                      style={inputStyle}
                      data-testid={`input-observations-${index}`}
                    />
                  </td>

                  {/* Ações */}
                  <td style={{ padding: '3px 5px', textAlign: 'center' }}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}
                    >
                      {/* Replicate count input */}
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={getReplicateCount(row.id)}
                        onChange={e => setReplicateCount(row.id, parseInt(e.target.value) || 1)}
                        onClick={e => (e.target as HTMLInputElement).select()}
                        title="Quantidade de cópias"
                        data-testid={`input-replicate-count-${index}`}
                        style={{ width: '36px', height: '24px', backgroundColor: '#f0efee', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '700', textAlign: 'center', color: '#57534e', outline: 'none', padding: '0 2px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                      />
                      <button
                        type="button"
                        onClick={() => duplicateRow(row.id)}
                        title={`Replicar ${getReplicateCount(row.id)}x`}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px', color: '#a8a29e', transition: 'color 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#1a1c1c')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#a8a29e')}
                        data-testid={`button-duplicate-${index}`}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        title="Remover"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px', color: '#d1cdc9', transition: 'color 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#d1cdc9')}
                        data-testid={`button-remove-${index}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Adicionar linha + total */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={addRow}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 20px', border: '2px solid #e7e5e4', borderRadius: '6px', backgroundColor: 'transparent', color: '#57534e', fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', fontFamily: "'Space Grotesk', sans-serif", transition: 'background-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f3f4f3')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                data-testid="button-add-row"
              >
                <Plus className="h-4 w-4" />
                Adicionar Linha
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
              <span style={{ fontSize: '10px', fontWeight: '700', color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: "'Space Grotesk', sans-serif" }}>
                Total Estimado do Lote:
              </span>
              <span style={{ fontSize: '22px', fontWeight: '900', color: '#fd761a', fontFamily: "'Space Grotesk', sans-serif', letterSpacing: '-0.02em'" }}>
                {totalM2.toFixed(2)} m²
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ padding: '20px 32px', backgroundColor: '#e8e8e7', borderTop: '1px solid #e7e5e4', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        {/* Left — status indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '99px', backgroundColor: '#fd761a' }} />
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#78716c', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Cálculo Automático Ativo
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '99px', backgroundColor: '#d6d3d1' }} />
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#78716c', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {validCount} {validCount === 1 ? 'Peça Válida' : 'Peças Válidas'}
            </span>
          </div>
        </div>

        {/* Right — actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ padding: '10px 24px', background: 'none', border: 'none', color: '#78716c', fontSize: '14px', fontWeight: '700', cursor: 'pointer', transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#1a1c1c')}
            onMouseLeave={e => (e.currentTarget.style.color = '#78716c')}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 28px', backgroundColor: isPending ? '#57534e' : '#1c1917', color: '#fff', borderRadius: '8px', border: 'none', fontSize: '14px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.06em', cursor: isPending ? 'not-allowed' : 'pointer', fontFamily: "'Space Grotesk', sans-serif", transition: 'background-color 0.15s' }}
            onMouseEnter={e => { if (!isPending) e.currentTarget.style.backgroundColor = '#f97316'; }}
            onMouseLeave={e => { if (!isPending) e.currentTarget.style.backgroundColor = '#1c1917'; }}
            data-testid="button-submit-bulk"
          >
            {isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
            ) : (
              <>Finalizar Lote <ArrowRight className="h-4 w-4" /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
