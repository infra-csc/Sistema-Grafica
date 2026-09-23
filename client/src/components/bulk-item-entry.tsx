// ─────────────────────────────────────────────────────────────────────────────
// ENTRADA RÁPIDA — a grade de lançamento de peças em lote do Detalhe do Evento.
//
// Este arquivo é a COMPOSIÇÃO: o estado das linhas, a navegação por teclado,
// o envio e a grade. O seletor de tipo, os campos de escolha, o painel das
// peças já lançadas, a revisão do lote, as regras puras e os tipos moram em
// components/entrada-rapida/.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Copy, Trash2, Loader2, ArrowRight, RotateCcw, AlertTriangle } from "lucide-react";
import { calculateM2FromStrings } from "@/lib/calculateM2";
import { useToast } from "@/hooks/use-toast";
import { T, N, TOM, FONT } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { useConfirmar } from "@/components/ui/usar-confirmar";
import { fieldStyle, makeFocusHandlers } from "@/components/entrada-rapida/estilos";
import { TipoSelect } from "@/components/entrada-rapida/tipo-select";
import { CampoDaGrade } from "@/components/entrada-rapida/campo-da-grade";
import { ExistingItemsPanel } from "@/components/entrada-rapida/painel-pecas-lancadas";
import { RevisaoDoLote } from "@/components/entrada-rapida/revisao-do-lote";
import {
  materials, finishes, FIELDS_PER_ROW, opcoesDeCampo, isRowComplete, createEmptyRow, isSameItem,
} from "@/components/entrada-rapida/regras";
import type {
  BulkItemRow, StandardItem, Sponsor, ExistingItem, PecaDoLote, DuplicataDoLote, ConfirmacaoDoLote,
} from "@/components/entrada-rapida/tipos";

export type { PecaDoLote } from "@/components/entrada-rapida/tipos";

interface BulkItemEntryProps {
  eventId: string;
  standardItems?: StandardItem[];
  sponsors?: Sponsor[];
  existingItems?: ExistingItem[];
  /** leftoverCount = linhas incompletas que NÃO foram enviadas e seguem no grid. */
  onSubmit: (items: PecaDoLote[], leftoverCount: number) => void;
  /**
   * Incrementado pelo pai a cada salvamento bem-sucedido. Ao mudar, as linhas
   * já gravadas saem do grid (evitando reenvio duplicado) e as incompletas
   * permanecem para serem finalizadas.
   */
  savedTick?: number;
  onCancel: () => void;
  isPending?: boolean;
  /** admin|solicitacao: mostra o botão de prioridade por linha (espelho do gate do servidor). */
  podePriorizar?: boolean;
  /**
   * Avisa o pai se a grade tem algo digitado. É o que deixa o X do modal
   * perguntar "descartar?" SÓ quando há o que perder — antes perguntava
   * sempre, até com a grade vazia.
   */
  onConteudoChange?: (temConteudo: boolean) => void;
}

/* ── Main Component ─────────────────────────────────────────────────── */
export function BulkItemEntry({
  eventId, standardItems = [], sponsors = [], existingItems = [],
  onSubmit, onCancel, isPending, savedTick = 0, podePriorizar = false, onConteudoChange,
}: BulkItemEntryProps) {
  const [rows, setRows] = useState<BulkItemRow[]>([createEmptyRow()]);
  const [replicateCounts, setReplicateCounts] = useState<Record<string, number>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [duplicateConfirm, setDuplicateConfirm] = useState<ConfirmacaoDoLote | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const submittedIdsRef = useRef<string[]>([]);
  const { toast } = useToast();
  const { confirmar, dialogo } = useConfirmar();

  // Quando o pai confirma o salvamento, tira do grid só as linhas gravadas.
  // As incompletas ficam, para o usuário terminar sem perder o que digitou.
  useEffect(() => {
    if (savedTick === 0 || submittedIdsRef.current.length === 0) return;
    const saved = new Set(submittedIdsRef.current);
    submittedIdsRef.current = [];
    setRows(prev => {
      const rest = prev.filter(r => !saved.has(r.id));
      return rest.length > 0 ? rest : [createEmptyRow()];
    });
  }, [savedTick]);
  const { data: catalogOptions = [] } = useQuery<{ kind: string; value: string }[]>({
    queryKey: ["/api/catalog-options"],
  });

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
        u.standardItemId = s ? s.id : "";
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
    const completeRows = rows.filter(isRowComplete);
    // Guarda quais linhas foram enviadas para removê-las quando o pai confirmar
    // o sucesso — assim elas não podem ser salvas duas vezes.
    submittedIdsRef.current = completeRows.map(r => r.id);
    const valid: PecaDoLote[] = completeRows
      .map(r => ({
        eventId, type: r.type, description: r.description || "",
        quantity: parseInt(r.quantity),
        area: parseFloat(r.visualWidth), visual: parseFloat(r.visualHeight),
        visualWidth: r.visualWidth, visualHeight: r.visualHeight,
        fileWidth: r.fileWidth, fileHeight: r.fileHeight,
        material: r.material, finish: r.finish,
        measurement: r.measurement || `${r.fileWidth} × ${r.fileHeight}`,
        observations: r.observations || "", calculatedM2: r.calculatedM2,
        isReuse: r.isReuse || false,
        isPriority: r.isPriority || false,
        standardItemId: r.standardItemId || null,
      }));
    if (valid.length === 0) {
      setSubmitAttempted(true);
      toast({
        title: "Nenhuma peça válida",
        description: "Preencha os campos destacados em vermelho antes de salvar.",
        variant: "warning",
      });
      return;
    }

    // Duplicate detection — structured
    const duplicates: DuplicataDoLote[] = [];
    const seen = new Set<string>();

    // Within batch: compare each pair — represent as synthetic ExistingItem
    for (let i = 0; i < valid.length; i++) {
      for (let j = i + 1; j < valid.length; j++) {
        if (isSameItem(valid[i], valid[j])) {
          const key = `batch-${i}-${j}`;
          if (!seen.has(key)) {
            seen.add(key);
            duplicates.push({
              newItem: valid[i],
              existingItem: {
                id: `batch-${j}`,
                displayId: `Linha ${j + 1}`,
                type: valid[j].type,
                description: valid[j].description,
                quantity: valid[j].quantity,
                status: 'draft',
              },
            });
          }
        }
      }
    }

    // Against already-saved items
    for (const newItem of valid) {
      for (const existing of existingItems) {
        if (isSameItem(newItem, existing)) {
          const key = `${newItem.type}::${newItem.description}::${existing.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            duplicates.push({ newItem, existingItem: existing });
          }
        }
      }
    }

    // Always show summary modal
    setDuplicateConfirm({ valid, duplicates });
  }

  // A MESMA régua de "tem conteúdo" do Cancelar e do X do modal (via pai):
  // duas contas diferentes fariam um perguntar e o outro não.
  const temConteudo = rows.some(r => r.type || r.description || r.material || r.finish || r.visualWidth || r.fileWidth);
  const onConteudoChangeRef = useRef(onConteudoChange);
  onConteudoChangeRef.current = onConteudoChange;
  useEffect(() => { onConteudoChangeRef.current?.(temConteudo); }, [temConteudo]);

  const validCount = rows.filter(isRowComplete).length;
  /** Linhas com algo digitado mas ainda incompletas — não vão no envio. */
  const leftoverCount = rows.filter(r => !isRowComplete(r) && (r.type || r.description || r.material || r.finish)).length;

  /** Retorna estilo com borda vermelha se campo estiver vazio após tentativa de salvar */
  const errStyle = (value: string | number, base: React.CSSProperties, rowHasContent: boolean): React.CSSProperties => {
    if (!submitAttempted || !rowHasContent || value) return base;
    return { ...base, boxShadow: `0 0 0 1.5px ${TOM.perigo.dot}`, backgroundColor: TOM.perigo.bg };
  };

  const groupedTypeOptions = useMemo(() => {
    const groupMap: Record<string, string[]> = {};
    const noGroup: string[] = [];
    for (const s of standardItems) {
      if (s.group) {
        if (!groupMap[s.group]) groupMap[s.group] = [];
        groupMap[s.group].push(s.name);
      } else {
        noGroup.push(s.name);
      }
    }
    const result = Object.entries(groupMap)
      .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
      .map(([group, items]) => ({ group, items: items.sort((a, b) => a.localeCompare(b, 'pt-BR')) }));
    if (noGroup.length > 0) result.push({ group: '', items: noGroup.sort((a, b) => a.localeCompare(b, 'pt-BR')) });
    return result;
  }, [standardItems]);

  // Materiais e acabamentos: padrão + catálogo cadastrado + os usados nos Modelos.
  // Assim, criar um material/acabamento novo em "Modelos" reflete aqui.
  const catMats = catalogOptions.filter(o => o.kind === 'material').map(o => o.value);
  const catFinishes = catalogOptions.filter(o => o.kind === 'finish').map(o => o.value);
  const materialOptions = useMemo(
    () => Array.from(new Set([...materials, ...catMats, ...(standardItems.map(s => s.material).filter(Boolean) as string[])]))
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [standardItems, catalogOptions],
  );
  const finishOptions = useMemo(
    () => Array.from(new Set([...finishes, ...catFinishes, ...(standardItems.map(s => s.finish).filter(Boolean) as string[])]))
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [standardItems, catalogOptions],
  );

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
            <Loader2 className="h-10 w-10 animate-spin" style={{ color: T.accent }} />
            <span style={{ fontSize: '15px', fontWeight: '700', color: T.text, fontFamily: FONT.display }}>
              Salvando peças...
            </span>
          </div>
        </div>
      )}

      <RevisaoDoLote
        duplicateConfirm={duplicateConfirm}
        setDuplicateConfirm={setDuplicateConfirm}
        standardItems={standardItems}
        existingItems={existingItems}
        isPending={isPending}
        onSubmit={onSubmit}
        leftoverCount={leftoverCount}
      />

      {/* ── SCROLL AREA ── */}
      <div
        ref={tableRef}
        className="scrollbar-visible"
        style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', minWidth: 0 }}
      >
        <div style={{ minWidth: '970px', padding: '16px 20px 24px' }}>

          {/* ══ SEÇÃO: PEÇAS JÁ LANÇADAS ══ */}
          {existingItems.length > 0 && (
            <ExistingItemsPanel items={existingItems} standardItems={standardItems} />
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
                    // O laranja marca as colunas de MEDIDA; em texto de 10px ele
                    // precisa ser o escuro (#c2410c) para ser lido.
                    color: col.orange ? T.accentText : T.second,
                    whiteSpace: 'nowrap', fontFamily: FONT.display,
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
                      groupedOptions={groupedTypeOptions}
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
                      aria-label={`Descrição, linha ${ri + 1}`}
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
                      style={errStyle(row.quantity, { ...fieldStyle, textAlign: 'center' }, !!(row.type || row.material || row.finish || row.description))}
                      data-nav-row={ri} data-nav-field="2"
                      aria-label={`Quantidade, linha ${ri + 1}`}
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
                      style={errStyle(row.visualWidth, { ...fieldStyle, textAlign: 'center' }, !!(row.type || row.material || row.finish || row.description))}
                      data-nav-row={ri} data-nav-field="3"
                      aria-label={`Largura visual em metros, linha ${ri + 1}`}
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
                      style={errStyle(row.visualHeight, { ...fieldStyle, textAlign: 'center' }, !!(row.type || row.material || row.finish || row.description))}
                      data-nav-row={ri} data-nav-field="4"
                      aria-label={`Altura visual em metros, linha ${ri + 1}`}
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
                      style={errStyle(row.fileWidth, { ...fieldStyle, textAlign: 'center' }, !!(row.type || row.material || row.finish || row.description))}
                      data-nav-row={ri} data-nav-field="5"
                      aria-label={`Largura do arquivo em metros, linha ${ri + 1}`}
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
                      style={errStyle(row.fileHeight, { ...fieldStyle, textAlign: 'center' }, !!(row.type || row.material || row.finish || row.description))}
                      data-nav-row={ri} data-nav-field="6"
                      aria-label={`Altura do arquivo em metros, linha ${ri + 1}`}
                      data-testid={`input-file-height-${ri}`}
                      {...navHandlers(ri, 6)}
                    />
                  </td>

                  {/* M² — read-only, no nav index */}
                  <td style={{ padding: '2px 4px' }}>
                    <div style={{
                      backgroundColor: TOM.laranja.bg, borderRadius: '6px',
                      padding: '5px 8px', fontSize: '13px', fontWeight: '800',
                      color: row.calculatedM2 > 0 ? T.accentText : T.second,
                      textAlign: 'center', fontFamily: FONT.mono,
                    }}>
                      {row.calculatedM2 > 0 ? row.calculatedM2.toFixed(2) : '—'}
                    </div>
                  </td>

                  {/* 7 · Material */}
                  <td style={{ padding: '2px 4px' }}>
                    {(() => { const rhc = !!(row.type || row.description || row.visualWidth || row.fileWidth || row.finish); return (
                    <CampoDaGrade
                      label="Material"
                      value={row.material}
                      onChange={v => { updateRow(row.id, 'material', v); setSubmitAttempted(false); }}
                      options={opcoesDeCampo(materialOptions, row.material)}
                      invalid={submitAttempted && rhc && !row.material}
                      ri={ri} field={7}
                      testId={`select-material-${ri}`}
                      onCommit={() => focusNextField(ri, 7)}
                    />
                    ); })()}
                  </td>

                  {/* 8 · Acabamento */}
                  <td style={{ padding: '2px 4px' }}>
                    {(() => { const rhc2 = !!(row.type || row.description || row.visualWidth || row.fileWidth || row.material); return (
                    <CampoDaGrade
                      label="Acabamento"
                      value={row.finish}
                      onChange={v => { updateRow(row.id, 'finish', v); setSubmitAttempted(false); }}
                      options={opcoesDeCampo(finishOptions, row.finish)}
                      invalid={submitAttempted && rhc2 && !row.finish}
                      ri={ri} field={8}
                      testId={`select-finish-${ri}`}
                      onCommit={() => focusNextField(ri, 8)}
                    />
                    ); })()}
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
                      aria-label={`Observações, linha ${ri + 1}`}
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
                        aria-label={`Quantas cópias da linha ${ri + 1} criar`}
                        data-testid={`input-replicate-count-${ri}`}
                        style={{
                          width: '28px', height: '26px',
                          backgroundColor: N.n3, border: 'none', borderRadius: '6px',
                          fontSize: '11px', fontWeight: '700', textAlign: 'center',
                          color: T.apoio, padding: '0',
                          fontFamily: FONT.corpo,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => duplicateRow(row.id)}
                        title={`Replicar ${getReplicateCount(row.id)}x`}
                        aria-label={`Replicar a linha ${ri + 1} ${getReplicateCount(row.id)} ${getReplicateCount(row.id) === 1 ? 'vez' : 'vezes'}`}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px', borderRadius: '6px', color: T.second, lineHeight: 0 }}
                        onMouseEnter={e => (e.currentTarget.style.color = T.text)}
                        onMouseLeave={e => (e.currentTarget.style.color = T.second)}
                        data-testid={`button-duplicate-${ri}`}
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRows(prev => prev.map(r => r.id === row.id ? { ...r, isReuse: !r.isReuse } : r))}
                        title={row.isReuse ? "Reaproveitamento ativo — clique para desativar" : "Marcar como reaproveitamento"}
                        style={{ background: row.isReuse ? TOM.sucesso.bg : 'none', border: row.isReuse ? `1px solid ${TOM.sucesso.border}` : 'none', cursor: 'pointer', padding: '3px 5px', borderRadius: '6px', color: row.isReuse ? TOM.sucesso.text : T.second, lineHeight: 0, transition: 'all 0.12s' }}
                        onMouseEnter={e => { if (!row.isReuse) e.currentTarget.style.color = TOM.sucesso.text; }}
                        onMouseLeave={e => { if (!row.isReuse) e.currentTarget.style.color = T.second; }}
                        aria-label={`Reaproveitamento, linha ${ri + 1}`}
                        aria-pressed={row.isReuse}
                        data-testid={`button-reuse-${ri}`}
                      >
                        <RotateCcw size={13} />
                      </button>
                      {/* PRIORITÁRIA (dono, 27/08: "não achei para dar prioridade")
                          — o mesmo idioma do toggle de reaproveitamento ao lado.
                          Só aparece para quem o servidor aceita (podePriorizar =
                          admin|solicitacao); a peça nasce furando a fila da Arte. */}
                      {podePriorizar && (
                        <button
                          type="button"
                          onClick={() => setRows(prev => prev.map(r => r.id === row.id ? { ...r, isPriority: !r.isPriority } : r))}
                          title={row.isPriority ? "Prioridade ativa — a peça nasce furando a fila da Arte; clique para desativar" : "Marcar como prioritária (fura a fila da Arte)"}
                          style={{ background: row.isPriority ? TOM.perigo.bg : 'none', border: row.isPriority ? `1px solid ${TOM.perigo.border}` : 'none', cursor: 'pointer', padding: '3px 5px', borderRadius: '6px', color: row.isPriority ? TOM.perigo.text : T.second, lineHeight: 0, transition: 'all 0.12s' }}
                          onMouseEnter={e => { if (!row.isPriority) e.currentTarget.style.color = TOM.perigo.text; }}
                          onMouseLeave={e => { if (!row.isPriority) e.currentTarget.style.color = T.second; }}
                          aria-label={`Peça prioritária, linha ${ri + 1}`}
                          aria-pressed={row.isPriority}
                          data-testid={`button-priority-${ri}`}
                        >
                          <AlertTriangle size={13} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        // Sem linha única para tirar, o botão diz por que não age
                        // em vez de engolir o clique em silêncio.
                        title={rows.length === 1 ? "A grade precisa de pelo menos uma linha" : "Remover esta linha"}
                        aria-label={`Remover a linha ${ri + 1}`}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px', borderRadius: '6px', color: T.second, lineHeight: 0 }}
                        onMouseEnter={e => (e.currentTarget.style.color = TOM.perigo.dot)}
                        onMouseLeave={e => (e.currentTarget.style.color = T.second)}
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
            <Botao variante="secundario" tamanho="sm" icone={Plus} onClick={addRow} data-testid="button-add-row">
              Adicionar Linha
            </Botao>
          </div>

        </div>
      </div>

      {/* ── FOOTER ── */}
      <div style={{
        padding: '12px 24px',
        backgroundColor: N.n2,
        borderTop: `1px solid ${T.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexShrink: 0,
      }}>
        {/* Status chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {/* No lugar do selo "Cálculo Automático" (que não pedia nem
              ensinava nada): o atalho que torna a grade rápida. Enter já
              avançava de campo e criava a linha seguinte — só ninguém sabia. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <kbd style={{ fontSize: '10px', fontWeight: '700', color: T.strong, backgroundColor: T.surface, border: `1px solid ${T.bdark}`, borderBottomWidth: 2, borderRadius: 4, padding: '0 5px', fontFamily: FONT.mono }}>Enter</kbd>
            <span style={{ fontSize: '10px', fontWeight: '700', color: T.second, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT.display }}>
              próximo campo · nova linha no fim
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '999px', backgroundColor: validCount > 0 ? TOM.sucesso.dot : T.bdark }} />
            <span style={{ fontSize: '10px', fontWeight: '700', color: T.second, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT.display }}>
              {validCount} {validCount === 1 ? 'Peça Válida' : 'Peças Válidas'}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Botao
            variante="fantasma"
            onClick={async () => {
              // Grid com conteúdo digitado: confirmar antes de descartar — o
              // Esc e o clique-fora já são bloqueados; este era o único caminho
              // que jogava o trabalho fora sem perguntar.
              if (temConteudo) {
                const ok = await confirmar({
                  titulo: "Descartar as peças digitadas neste lote?",
                  descricao: "As linhas preenchidas aqui ainda não foram salvas e serão perdidas.",
                  confirmar: "Descartar",
                  cancelar: "Continuar editando",
                  perigo: true,
                  icone: Trash2,
                });
                if (!ok) return;
              }
              onCancel();
            }}
          >
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            onClick={handleSubmit}
            carregando={isPending}
            data-testid="button-submit-bulk"
            // "Finalizar Lote" prometia um fim que não existe: o clique abre
            // a revisão, e o lote salvo ainda vira rascunho a enviar.
          >
            {isPending
              ? "Salvando..."
              : <>Revisar e salvar <ArrowRight size={15} aria-hidden="true" /></>
            }
          </Botao>
        </div>
      </div>
      {dialogo}
    </div>
  );
}
