import { Fragment, useState } from "react";
import {
  Upload,
  List,
  Check,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Search,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

// ── Editable row for import preview table ────────────────────────────────
const IMPORT_QUOTA_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  MASTER:     { bg: '#fff1f1', color: '#dc2626', border: '#fecaca' },
  GOLD:       { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  SILVER:     { bg: '#f5f3ff', color: '#7c3aed', border: '#ddd6fe' },
  APOIO:      { bg: '#f9fafb', color: '#6b7280', border: '#e5e7eb' },
  MIDIA:      { bg: '#ecfeff', color: '#0891b2', border: '#a5f3fc' },
  MINISTERIO: { bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' },
};

function ImportPreviewRow({ row, idx, onChange, onDelete, eventSponsorsList }: {
  row: any; idx: number;
  onChange: (updated: any) => void;
  onDelete: () => void;
  eventSponsorsList: { sponsorId: string; quota: string; name: string }[];
}) {
  const [editField, setEditField] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);

  const update = (field: string, value: string) => {
    const updated = { ...row, [field]: value };
    if (['quantity', 'fileWidth', 'fileHeight', 'visualWidth', 'visualHeight'].includes(field)) {
      const qty = parseFloat(field === 'quantity' ? value : row.quantity) || 0;
      const fw  = parseFloat(field === 'fileWidth'  ? value : (row.fileWidth  ?? row.visualWidth  ?? 0)) || 0;
      const fh  = parseFloat(field === 'fileHeight' ? value : (row.fileHeight ?? row.visualHeight ?? 0)) || 0;
      updated.calculatedM2 = fw && fh ? (qty * fw * fh).toFixed(2) : '0';
      if (fw && fh) updated.measurement = `${fw.toFixed(2)} × ${fh.toFixed(2)}`;
    }
    onChange(updated);
  };

  const cell = (field: string, val: any, opts?: { dim?: boolean; mono?: boolean; wide?: boolean }) => {
    const isEditing = editField === field;
    const display = val !== null && val !== undefined && val !== '' ? String(val) : '—';
    const rowBg = hovered ? '#f7f6f4' : (idx % 2 === 0 ? '#fff' : '#fafaf9');
    return (
      <td
        onClick={() => setEditField(field)}
        title="Clique para editar"
        style={{
          padding: '8px 10px',
          borderBottom: '1px solid #f0efed',
          cursor: 'text',
          backgroundColor: isEditing ? '#fffbeb' : rowBg,
          maxWidth: opts?.wide ? 220 : 160,
        }}
      >
        {isEditing ? (
          <input
            autoFocus
            defaultValue={val ?? ''}
            onBlur={e => { update(field, e.target.value); setEditField(null); }}
            onKeyDown={e => {
              if (e.key === 'Enter') { update(field, (e.target as HTMLInputElement).value); setEditField(null); }
              if (e.key === 'Escape') setEditField(null);
            }}
            style={{ width: '100%', border: 'none', borderBottom: '2px solid #f97316', padding: '0 2px', fontSize: 12, outline: 'none', backgroundColor: 'transparent', fontFamily: opts?.mono ? 'DM Mono, monospace' : 'inherit' }}
          />
        ) : (
          <span style={{
            color: display === '—' ? '#d0cdc9' : (opts?.dim ? '#9c9490' : '#1a1c1c'),
            fontSize: 12,
            fontFamily: opts?.mono ? 'DM Mono, monospace' : 'inherit',
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>{display}</span>
        )}
      </td>
    );
  };

  const dimCell = (fieldW: string, fieldH: string, valW: any, valH: any, dimStyle?: boolean) => {
    const rowBg = hovered ? '#f7f6f4' : (idx % 2 === 0 ? '#fff' : '#fafaf9');
    const editingW = editField === fieldW;
    const editingH = editField === fieldH;
    const dispW = valW !== null && valW !== undefined && valW !== '' ? String(valW) : '—';
    const dispH = valH !== null && valH !== undefined && valH !== '' ? String(valH) : '—';
    return (
      <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0efed', whiteSpace: 'nowrap', backgroundColor: rowBg }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {editingW ? (
            <input autoFocus defaultValue={valW ?? ''} onBlur={e => { update(fieldW, e.target.value); setEditField(null); }} onKeyDown={e => { if (e.key==='Enter'){update(fieldW,(e.target as HTMLInputElement).value);setEditField(null);} if(e.key==='Escape')setEditField(null); }}
              style={{ width: 44, border: 'none', borderBottom: '2px solid #f97316', fontSize: 11, padding: '0 2px', outline: 'none', backgroundColor: 'transparent', fontFamily: 'DM Mono, monospace', color: '#1a1c1c' }} />
          ) : (
            <span onClick={() => setEditField(fieldW)} title="Clique para editar" style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: dimStyle ? '#9c9490' : '#1a1c1c', cursor: 'text', minWidth: 24 }}>{dispW}</span>
          )}
          <span style={{ color: '#d0cdc9', fontSize: 10, userSelect: 'none' }}>×</span>
          {editingH ? (
            <input autoFocus defaultValue={valH ?? ''} onBlur={e => { update(fieldH, e.target.value); setEditField(null); }} onKeyDown={e => { if (e.key==='Enter'){update(fieldH,(e.target as HTMLInputElement).value);setEditField(null);} if(e.key==='Escape')setEditField(null); }}
              style={{ width: 44, border: 'none', borderBottom: '2px solid #f97316', fontSize: 11, padding: '0 2px', outline: 'none', backgroundColor: 'transparent', fontFamily: 'DM Mono, monospace', color: '#1a1c1c' }} />
          ) : (
            <span onClick={() => setEditField(fieldH)} title="Clique para editar" style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: dimStyle ? '#9c9490' : '#1a1c1c', cursor: 'text', minWidth: 24 }}>{dispH}</span>
          )}
        </div>
      </td>
    );
  };

  const m2 = parseFloat(row.calculatedM2) || 0;
  const m2Color = m2 > 30 ? '#dc2626' : m2 > 10 ? '#ea580c' : m2 > 0 ? '#16a34a' : '#d0cdc9';

  const hasSponsors = (row.suggestedSponsorIds ?? []).length > 0;
  const rowBg = hovered ? '#f7f6f4' : (idx % 2 === 0 ? '#fff' : '#fafaf9');

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ transition: 'background 0.12s' }}
    >
      {cell('description', row.description, { wide: true })}
      {cell('quantity', row.quantity, { mono: true })}
      {dimCell('visualWidth', 'visualHeight', row.visualWidth, row.visualHeight, true)}
      {dimCell('fileWidth', 'fileHeight', row.fileWidth, row.fileHeight, false)}

      {/* M² */}
      <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0efed', whiteSpace: 'nowrap', backgroundColor: rowBg }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: m2Color, fontFamily: 'DM Mono, monospace', letterSpacing: '-0.02em' }}>
          {m2 > 0 ? m2.toFixed(2) : '—'}
        </span>
      </td>

      {cell('material', row.material)}
      {cell('finish', row.finish)}
      {/* Obs cell with reuse toggle */}
      <td
        onClick={() => setEditField('observations')}
        title="Clique para editar"
        style={{ padding: '8px 10px', borderBottom: '1px solid #f0efed', cursor: 'text', backgroundColor: editField === 'observations' ? '#fffbeb' : rowBg, maxWidth: 160 }}
      >
        {editField === 'observations' ? (
          <input autoFocus defaultValue={row.observations ?? ''}
            onBlur={e => { update('observations', e.target.value); setEditField(null); }}
            onKeyDown={e => { if (e.key === 'Enter') { update('observations', (e.target as HTMLInputElement).value); setEditField(null); } if (e.key === 'Escape') setEditField(null); }}
            style={{ width: '100%', border: 'none', borderBottom: '2px solid #f97316', padding: '0 2px', fontSize: 12, outline: 'none', backgroundColor: 'transparent' }} />
        ) : (
          <span style={{ color: row.observations ? '#9c9490' : '#d0cdc9', fontSize: 12, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.observations || '—'}
          </span>
        )}
        {/* Reuse toggle */}
        <button
          onClick={e => { e.stopPropagation(); onChange({ ...row, reuse: !row.reuse }); }}
          style={{
            marginTop: 3, display: 'block',
            fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 9999, cursor: 'pointer',
            border: `1px solid ${row.reuse ? '#22c55e' : '#e2deda'}`,
            backgroundColor: row.reuse ? '#f0fdf4' : 'transparent',
            color: row.reuse ? '#16a34a' : '#c4bfbb',
            letterSpacing: '0.04em', textTransform: 'uppercase', transition: 'all 0.15s',
          }}
        >
          Reaproveitar
        </button>
      </td>

      {/* Sponsor multi-select cell */}
      <td style={{ padding: '6px 8px', borderBottom: '1px solid #f0efed', backgroundColor: rowBg, minWidth: 190, verticalAlign: 'top' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
          {/* Chips for each selected sponsor */}
          {(row.suggestedSponsorIds ?? []).map((sid: string) => {
            const sp = eventSponsorsList.find(s => s.sponsorId === sid);
            if (!sp) return null;
            const qc = IMPORT_QUOTA_COLORS[sp.quota] ?? { bg: '#f0f9ff', color: '#0369a1', border: '#bae6fd' };
            return (
              <span key={sid} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px 2px 7px', borderRadius: 6, border: `1.5px solid ${qc.border}`, backgroundColor: qc.bg, color: qc.color, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>
                {sp.name}
                <button
                  onClick={e => { e.stopPropagation(); onChange({ ...row, suggestedSponsorIds: (row.suggestedSponsorIds ?? []).filter((id: string) => id !== sid) }); }}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', padding: '0 0 0 1px', opacity: 0.65, fontSize: 13, lineHeight: 1 }}
                >×</button>
              </span>
            );
          })}
          {/* Add sponsor dropdown */}
          {(row.suggestedSponsorIds ?? []).length < eventSponsorsList.length && (
            <select
              value=""
              onChange={e => {
                const v = e.target.value;
                if (v && !(row.suggestedSponsorIds ?? []).includes(v))
                  onChange({ ...row, suggestedSponsorIds: [...(row.suggestedSponsorIds ?? []), v] });
              }}
              onClick={e => e.stopPropagation()}
              style={{ fontSize: 10, borderRadius: 5, border: '1px dashed #d0cdc9', backgroundColor: 'transparent', color: '#a8a29e', cursor: 'pointer', padding: '2px 5px', outline: 'none', maxWidth: 100 }}
            >
              <option value="">+ Adicionar</option>
              {eventSponsorsList.filter(s => !(row.suggestedSponsorIds ?? []).includes(s.sponsorId)).map(s => (
                <option key={s.sponsorId} value={s.sponsorId}>{s.name}</option>
              ))}
            </select>
          )}
          {(row.suggestedSponsorIds ?? []).length === 0 && (
            <span style={{ fontSize: 11, color: '#d0cdc9', fontStyle: 'italic' }}>sem patrocinador</span>
          )}
        </div>
      </td>

      {/* Delete */}
      <td style={{ padding: '6px 6px', borderBottom: '1px solid #f0efed', backgroundColor: rowBg }}>
        <button
          onClick={onDelete}
          title="Remover peça"
          style={{ width: 26, height: 26, borderRadius: 6, border: 'none', backgroundColor: hovered ? '#fef2f2' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: hovered ? '#dc2626' : '#d0cdc9', transition: 'all 0.15s' }}
        >
          <X style={{ width: 13, height: 13 }} />
        </button>
      </td>
    </tr>
  );
}

interface ImportXlsxDialogProps {
  open: boolean;
  onOpenChangeClose: () => void;
  importFile: File | null;
  setImportFile: (f: File | null) => void;
  setImportPreview: (p: { total: number; groups: string[] } | null) => void;
  importPreviewItems: any[] | null;
  setImportPreviewItems: React.Dispatch<React.SetStateAction<any[] | null>>;
  importFileName: string;
  importSearch: string;
  setImportSearch: (s: string) => void;
  eventSponsorsList: { sponsorId: string; quota: string; name: string }[];
  previewXlsxPending: boolean;
  onPreview: (file: File) => void;
  confirmImportPending: boolean;
  onConfirmImport: (items: any[], fileName: string) => void;
}

// Extracted from event-detail.tsx: the "Importar Peças" split-panel dialog
// (upload/drop-zone + preview table). All state is still owned by the
// parent EventDetail page and passed down via props — no behavior changed,
// only relocated for readability.
export function ImportXlsxDialog({
  open,
  onOpenChangeClose,
  importFile,
  setImportFile,
  setImportPreview,
  importPreviewItems,
  setImportPreviewItems,
  importFileName,
  importSearch,
  setImportSearch,
  eventSponsorsList,
  previewXlsxPending,
  onPreview,
  confirmImportPending,
  onConfirmImport,
}: ImportXlsxDialogProps) {
  const { toast } = useToast();

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onOpenChangeClose(); }}>
      <DialogContent
        className="[&>button:last-child]:right-4 [&>button:last-child]:top-4 [&>button:last-child]:z-50"
        style={{ maxWidth: '98vw', width: importPreviewItems ? 1200 : 540, maxHeight: '92vh', padding: 0, gap: 0, borderRadius: 14, overflow: 'visible', transition: 'width 0.3s' }}
      >
        <div style={{ display: 'flex', flexDirection: 'row', height: '100%', maxHeight: '92vh', overflow: 'hidden', borderRadius: 14 }}>
        {/* ── Left sidebar ── */}
        <div style={{ width: 260, minWidth: 260, backgroundColor: '#ffffff', borderRight: '1px solid #e7e5e4', display: 'flex', flexDirection: 'column', padding: '22px 18px', gap: 16, overflowY: 'auto', flexShrink: 0 }}>
          {/* Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 7, backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <FileSpreadsheet style={{ width: 15, height: 15, color: '#16a34a' }} />
            </div>
            <div>
              <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em', color: '#1a1c1c', margin: 0, lineHeight: 1.2 }}>
                Importar Peças
              </DialogTitle>
              <DialogDescription style={{ fontSize: 10, color: '#a8a29e', margin: 0, marginTop: 1 }}>
                {importFileName || 'Formato padrão NORTE'}
              </DialogDescription>
            </div>
          </div>

          {/* Drop zone */}
          <label
            htmlFor="xlsx-upload"
            data-testid="dropzone-xlsx"
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              border: '2px dashed', borderColor: importFile ? '#16a34a' : '#d4d0cc',
              borderRadius: 10, padding: '18px 12px', cursor: 'pointer',
              backgroundColor: importFile ? '#f0fdf4' : '#fafaf9', transition: 'all 0.2s',
            }}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#16a34a'; e.currentTarget.style.backgroundColor = '#f0fdf4'; }}
            onDragLeave={e => { e.currentTarget.style.borderColor = importFile ? '#16a34a' : '#d4d0cc'; e.currentTarget.style.backgroundColor = importFile ? '#f0fdf4' : '#fafaf9'; }}
            onDrop={e => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) {
                setImportFile(f); setImportPreview(null); setImportPreviewItems(null);
              } else {
                toast({ title: "Arquivo inválido", description: "Selecione um arquivo .xlsx", variant: "destructive" });
              }
            }}
          >
            {importFile ? (
              <>
                <CheckCircle2 style={{ width: 24, height: 24, color: '#16a34a' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#166534', fontFamily: "'Space Grotesk', sans-serif" }}>{importFile.name}</div>
                  <div style={{ fontSize: 11, color: '#78716c', marginTop: 2 }}>{(importFile.size / 1024).toFixed(1)} KB</div>
                </div>
                <button
                  onClick={e => { e.preventDefault(); setImportFile(null); setImportPreview(null); setImportPreviewItems(null); }}
                  style={{ fontSize: 10, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
                >
                  <X style={{ width: 10, height: 10 }} /> Remover
                </button>
              </>
            ) : (
              <>
                <Upload style={{ width: 20, height: 20, color: '#a8a29e' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#44403c' }}>Arraste o .xlsx aqui</div>
                  <div style={{ fontSize: 11, color: '#78716c', marginTop: 2 }}>ou clique para selecionar</div>
                </div>
              </>
            )}
          </label>
          <input id="xlsx-upload" type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => {
            const f = e.target.files?.[0];
            if (f) { setImportFile(f); setImportPreview(null); setImportPreviewItems(null); }
            e.target.value = "";
          }} />

          {/* Stats (when preview is loaded) */}
          {importPreviewItems && (() => {
            const allItems = importPreviewItems;
            const totalM2 = allItems.reduce((s: number, i: any) => s + (parseFloat(i.calculatedM2) || 0), 0);
            const linked = allItems.filter((i: any) => (i.suggestedSponsorIds ?? []).length > 0).length;
            const groups = new Set(allItems.map((i: any) => i.type)).size;
            const linkPct = allItems.length > 0 ? Math.round((linked / allItems.length) * 100) : 0;
            return (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { l: 'Peças',      v: allItems.length,         color: '#1a1c1c', mono: false },
                    { l: 'Grupos',     v: groups,                  color: '#1a1c1c', mono: false },
                    { l: 'M² total',   v: `${totalM2.toFixed(0)}`, color: '#D97A1E', mono: true  },
                    { l: 'Vinculados', v: `${linkPct}%`,           color: linkPct === 100 ? '#16a34a' : '#d97706', mono: false },
                  ].map(s => (
                    <div key={s.l} style={{ backgroundColor: '#f5f4f2', border: '1px solid #e7e5e4', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: s.color, fontFamily: s.mono ? 'DM Mono, monospace' : "'Space Grotesk', sans-serif", lineHeight: 1 }}>{s.v}</div>
                      <div style={{ fontSize: 9, color: '#a8a29e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 4 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: '#78716c', fontWeight: 600 }}>Vinculação</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: linkPct === 100 ? '#16a34a' : '#d97706' }}>{linked}/{allItems.length}</span>
                  </div>
                  <div style={{ height: 5, backgroundColor: '#e7e5e4', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${linkPct}%`, backgroundColor: linkPct === 100 ? '#16a34a' : '#d97706', borderRadius: 99, transition: 'width 0.4s' }} />
                  </div>
                </div>
              </>
            );
          })()}

          {/* Format tip */}
          <div style={{ padding: '10px 12px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, display: 'flex', gap: 8 }}>
            <AlertTriangle style={{ width: 13, height: 13, color: '#d97706', flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 10, color: '#78350f', lineHeight: 1.6 }}>
              <strong style={{ color: '#92400e' }}>Formato NORTE:</strong><br />
              item · qtde · material · acabamento
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {/* Action buttons */}
          {!importPreviewItems ? (
            <button
              disabled={!importFile || previewXlsxPending}
              onClick={() => { if (importFile) onPreview(importFile); }}
              data-testid="button-preview-import"
              style={{ width: '100%', padding: '11px 0', backgroundColor: importFile ? '#16a34a' : '#e7e5e4', color: importFile ? '#fff' : '#a8a29e', border: 'none', borderRadius: 9, fontWeight: 800, fontSize: 13, cursor: importFile ? 'pointer' : 'not-allowed', fontFamily: "'Space Grotesk', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {previewXlsxPending ? (
                <><Loader2 style={{ width: 15, height: 15, animation: 'spin 1s linear infinite' }} /> Processando...</>
              ) : (
                <><List style={{ width: 15, height: 15 }} /> Pré-visualizar Peças</>
              )}
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => { setImportPreviewItems(null); setImportSearch(""); }}
                style={{ width: '100%', padding: '9px 0', backgroundColor: 'transparent', color: '#78716c', border: '1px solid #e7e5e4', borderRadius: 9, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Trocar arquivo
              </button>
              <button
                disabled={!importPreviewItems.length || confirmImportPending}
                onClick={() => { if (importPreviewItems.length > 0) onConfirmImport(importPreviewItems, importFileName); }}
                data-testid="button-confirm-import"
                style={{ width: '100%', padding: '11px 0', backgroundColor: '#1c1917', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: "'Space Grotesk', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                {confirmImportPending ? (
                  <><Loader2 style={{ width: 15, height: 15, animation: 'spin 1s linear infinite' }} /> Importando...</>
                ) : (
                  <><Check style={{ width: 15, height: 15 }} /> Importar {importPreviewItems.length} peças</>
                )}
              </button>
            </div>
          )}
        </div>

        {/* ── Right panel: table ── */}
        {importPreviewItems && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {/* Search bar */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #e7e5e4', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: '#a8a29e', pointerEvents: 'none' }} />
                <input
                  value={importSearch}
                  onChange={e => setImportSearch(e.target.value)}
                  placeholder="Filtrar peças ou grupos..."
                  style={{ width: '100%', padding: '7px 12px 7px 28px', backgroundColor: '#f5f4f2', border: '1px solid #e7e5e4', borderRadius: 7, color: '#1a1c1c', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <span style={{ fontSize: 11, color: '#a8a29e', whiteSpace: 'nowrap', fontWeight: 600 }}>
                {importSearch
                  ? `${importPreviewItems.filter(i => i.description?.toLowerCase().includes(importSearch.toLowerCase()) || i.type?.toLowerCase().includes(importSearch.toLowerCase())).length} de ${importPreviewItems.length}`
                  : `${importPreviewItems.length} peças`
                }
              </span>
            </div>

            {/* Table */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ backgroundColor: '#f5f4f2', position: 'sticky', top: 0, zIndex: 2, boxShadow: '0 1px 0 #e8e6e3' }}>
                    {[
                      { label: 'Descrição', tip: 'Nome da peça' },
                      { label: 'Qtd', tip: 'Quantidade' },
                      { label: 'Visual', tip: 'Largura × Altura visual (m)' },
                      { label: 'Arquivo', tip: 'Largura × Altura do arquivo (m)' },
                      { label: 'M²', tip: 'Metros quadrados calculados' },
                      { label: 'Material', tip: '' },
                      { label: 'Acabamento', tip: '' },
                      { label: 'Obs', tip: 'Observações' },
                      { label: 'Patrocinador', tip: 'Sugestão automática — clique para alterar' },
                      { label: '', tip: '' },
                    ].map((h, i) => (
                      <th key={i} title={h.tip} style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 700, fontSize: 10, color: '#78716c', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const items = importSearch
                      ? importPreviewItems.filter((i: any) => i.description?.toLowerCase().includes(importSearch.toLowerCase()) || i.type?.toLowerCase().includes(importSearch.toLowerCase()))
                      : importPreviewItems;
                    const groupMap = new Map<string, any[]>();
                    for (const item of items) {
                      const t = item.type || '—';
                      if (!groupMap.has(t)) groupMap.set(t, []);
                      groupMap.get(t)!.push(item);
                    }
                    const groups = Array.from(groupMap.entries());
                    return groups.map(([type, groupItems], gIdx) => {
                      const groupM2 = groupItems.reduce((s: number, i: any) => s + (parseFloat(i.calculatedM2) || 0), 0);
                      const groupLinked = groupItems.filter((i: any) => (i.suggestedSponsorIds ?? []).length > 0).length;
                      return (
                        <Fragment key={type}>
                          <tr>
                            <td colSpan={10} style={{ padding: '9px 14px 8px', background: 'linear-gradient(90deg, #F0EEEC 0%, #F5F4F2 100%)', borderTop: gIdx > 0 ? '2px solid #E2DEDA' : undefined, borderBottom: '1px solid #e2deda' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ width: 3, height: 14, backgroundColor: '#D97A1E', borderRadius: 2 }} />
                                  <span style={{ fontWeight: 800, fontSize: 12, color: '#1a1c1c', fontFamily: "'Space Grotesk', sans-serif", textTransform: 'uppercase', letterSpacing: '0.04em' }}>{type}</span>
                                  <span style={{ fontSize: 10, fontWeight: 600, color: '#78716c', backgroundColor: '#e8e6e3', borderRadius: 9999, padding: '1px 8px' }}>{groupItems.length}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                  {groupM2 > 0 && (
                                    <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', fontWeight: 700, color: '#D97A1E' }}>{groupM2.toFixed(2)} m²</span>
                                  )}
                                  <span style={{ fontSize: 11, color: groupLinked === groupItems.length ? '#16a34a' : '#d97706', fontWeight: 600 }}>
                                    {groupLinked}/{groupItems.length} vinculados
                                  </span>
                                </div>
                              </div>
                            </td>
                          </tr>
                          {groupItems.map((row: any, rowIdx: number) => (
                            <ImportPreviewRow
                              key={row._id}
                              row={row}
                              idx={rowIdx}
                              onChange={(updated: any) => setImportPreviewItems(prev => prev ? prev.map(r => r._id === row._id ? updated : r) : prev)}
                              onDelete={() => setImportPreviewItems(prev => prev ? prev.filter(r => r._id !== row._id) : prev)}
                              eventSponsorsList={eventSponsorsList}
                            />
                          ))}
                        </Fragment>
                      );
                    });
                  })()}
                </tbody>
              </table>
              {importPreviewItems.length === 0 && (
                <div style={{ padding: 60, textAlign: 'center', color: '#a8a29e', fontSize: 13 }}>
                  <List style={{ width: 32, height: 32, color: '#d0cdc9', margin: '0 auto 12px' }} />
                  <div>Nenhuma peça para importar.</div>
                </div>
              )}
            </div>
          </div>
        )}
        </div>{/* wrapper flex row */}
      </DialogContent>
    </Dialog>
  );
}
