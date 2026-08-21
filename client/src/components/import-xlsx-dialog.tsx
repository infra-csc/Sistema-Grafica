import { Fragment, useMemo, useState } from "react";
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
import { FilterSelect } from "@/components/filter-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

// Ativa a edição da célula também pelo teclado (Enter/Espaço) — as células
// eram clicáveis mas invisíveis para quem navega por Tab.
const editableKeyDown = (activate: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    activate();
  }
};

// ── Editable row for import preview table ────────────────────────────────
// Cota → cor. MESMOS pares de eventos.tsx (QUOTA_OPTIONS), derivados da paleta
// `P` de lib/status.ts: tint 50 no fundo, tom 700/800 no TEXTO. Duas coisas
// estavam erradas aqui: (1) a divergência — MASTER era #dc2626 nesta tela e
// #ef4444 na de Eventos, para o mesmo dado; (2) o contraste — o chip é 10px, e
// MIDIA (#0891b2 sobre #ecfeff, 3,3:1) e MINISTERIO (#059669 sobre #ecfdf5,
// 3,2:1) reprovavam AA. DÍVIDA: quando QUOTAS virar módulo em `shared`, este
// mapa e o de eventos.tsx viram um só.
const IMPORT_QUOTA_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  MASTER:     { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
  GOLD:       { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  SILVER:     { bg: '#faf5ff', color: '#7e22ce', border: '#e9d5ff' },
  APOIO:      { bg: '#f5f5f4', color: '#44403c', border: '#e7e5e4' },
  MIDIA:      { bg: '#ecfeff', color: '#0e7490', border: '#a5f3fc' },
  MINISTERIO: { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
};

/**
 * O QUE FALTA NUMA LINHA, em uma função só.
 *
 * A triagem conta com ela e a linha se pinta com ela: dois cálculos do mesmo
 * defeito divergiriam no primeiro ajuste, e o balde passaria a prometer um
 * número que a tabela não entrega.
 *
 * A gravidade separa o que impede de produzir do que só muda o caminho da
 * peça: sem medida ou sem m² a gráfica não tem o que imprimir; sem
 * patrocinador a peça entra e segue, só não passa por aprovação.
 */
export type DefeitoImport =
  | 'sem-patrocinador' | 'sem-medida' | 'm2-nao-fecha' | 'sem-material' | 'ja-existe';

/**
 * A IDENTIDADE DE UMA PEÇA, para efeito de reimportação.
 *
 * Tipo + descrição, sem acento, sem caixa, sem espaço duplo. Não entra a
 * quantidade: reimportar a mesma lista com a quantidade corrigida continua
 * sendo a MESMA peça — é justamente o caso mais comum de reimportação, e
 * incluir a quantidade faria a repetida passar despercebida.
 */
export function chaveDaPeca(row: any): string {
  const norm = (v: any) => String(v ?? '')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();
  return norm(row.type) + '\u0000' + norm(row.description);
}

export function defeitosDaLinha(row: any, jaNoEvento?: Set<string>): DefeitoImport[] {
  const out: DefeitoImport[] = [];
  // A repetida vem primeiro: é a única que não se conserta editando a
  // célula — se resolve tirando a linha, e por isso precisa ser lida antes.
  if (jaNoEvento?.has(chaveDaPeca(row))) out.push('ja-existe');
  if ((row.suggestedSponsorIds ?? []).length === 0) out.push('sem-patrocinador');
  // Medida de ARQUIVO — a visual não serve para produzir.
  const temMedida = !!(parseFloat(row.fileWidth) && parseFloat(row.fileHeight));
  if (!temMedida) out.push('sem-medida');
  if (!(parseFloat(row.calculatedM2) > 0)) out.push('m2-nao-fecha');
  if (!String(row.material ?? '').trim() || !String(row.finish ?? '').trim()) out.push('sem-material');
  return out;
}

/**
 * Vermelho custa dinheiro; âmbar muda o caminho da peça.
 *
 * Sem medida ou sem m², a gráfica não tem o que imprimir. Repetida, ela
 * imprime DUAS VEZES e cobra as duas — o mesmo prejuízo por outro caminho.
 */
const DEFEITO_GRAVE = new Set<DefeitoImport>(['sem-medida', 'm2-nao-fecha', 'ja-existe']);

export const DEFEITO_LABEL: Record<DefeitoImport, string> = {
  'sem-patrocinador': 'Sem patrocinador',
  'sem-medida': 'Sem medida',
  'm2-nao-fecha': 'M² não fecha',
  'sem-material': 'Sem material/acab.',
  'ja-existe': 'Já está no evento',
};

/** A frase por extenso de cada defeito — o `title` da linha. */
const DEFEITO_FRASE: Record<DefeitoImport, string> = {
  'sem-patrocinador': 'entra sem marca e não vai para aprovação',
  'sem-medida': 'a planilha não trouxe largura ou altura de arquivo',
  'm2-nao-fecha': 'o m² veio zerado ou não pôde ser calculado',
  'sem-material': 'a gráfica não consegue produzir sem material e acabamento',
  'ja-existe': 'uma peça com este mesmo tipo e descrição já foi importada para este evento',
};

export function ImportPreviewRow({ row, idx, onChange, onDelete, eventSponsorsList, jaNoEvento }: {
  row: any; idx: number;
  onChange: (updated: any) => void;
  onDelete: () => void;
  eventSponsorsList: { sponsorId: string; quota: string; name: string }[];
  jaNoEvento?: Set<string>;
}) {
  const [editField, setEditField] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);

  const update = (field: string, value: string) => {
    const updated = { ...row, [field]: value };
    if (['quantity', 'fileWidth', 'fileHeight', 'visualWidth', 'visualHeight'].includes(field)) {
      const qty = parseFloat(field === 'quantity' ? value : row.quantity) || 0;
      // O M² SAI DAS MEDIDAS DE ARQUIVO, e SÓ delas.
      //
      // Havia um `?? row.visualWidth` aqui: sem medida de arquivo, o cálculo
      // caía para a visual e produzia um m² que não é o que vai ser impresso.
      // Visual e arquivo são pares DISTINTOS — o visual é o que se vê na peça
      // montada, o arquivo é o que a impressora recebe (com sangria, com
      // sobra de acabamento), e é dele que sai o metro quadrado que a gráfica
      // cobra. O fallback fazia a planilha sem medida de arquivo importar um
      // orçamento errado sem avisar ninguém.
      //
      // Sem medida de arquivo o m² fica ZERO, e a triagem ao lado passa a
      // dizer isso em voz alta.
      const fw  = parseFloat(field === 'fileWidth'  ? value : (row.fileWidth  ?? 0)) || 0;
      const fh  = parseFloat(field === 'fileHeight' ? value : (row.fileHeight ?? 0)) || 0;
      updated.calculatedM2 = fw && fh ? (qty * fw * fh).toFixed(2) : '0';
      if (fw && fh) updated.measurement = `${fw.toFixed(2)} × ${fh.toFixed(2)}`;
    }
    onChange(updated);
  };

  const cell = (field: string, val: any, opts?: { dim?: boolean; mono?: boolean; wide?: boolean; alerta?: string }) => {
    const isEditing = editField === field;
    const display = val !== null && val !== undefined && val !== '' ? String(val) : '—';
    const rowBg = hovered ? '#f7f6f4' : (idx % 2 === 0 ? '#fff' : '#fafaf9');
    return (
      <td
        onClick={() => setEditField(field)}
        tabIndex={isEditing ? -1 : 0}
        role="button"
        onKeyDown={isEditing ? undefined : editableKeyDown(() => setEditField(field))}
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
            style={{ width: '100%', border: 'none', borderBottom: '2px solid #f97316', padding: '0 2px', fontSize: 13, backgroundColor: 'transparent', fontFamily: opts?.mono ? 'DM Mono, monospace' : 'inherit' }}
          />
        ) : (
          <span style={{
            color: display === '—' ? '#a8a29e' : (opts?.dim ? '#746e69' : '#1a1c1c'),
            fontSize: 13,
            fontFamily: opts?.mono ? 'DM Mono, monospace' : 'inherit',
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>{display}</span>
        )}
        {/* O PONTO DO DEFEITO. Fica na descrição porque é onde o olho já está
            quando varre a lista — a faixa lateral de 3px só entra no campo de
            visão de quem já está olhando para a esquerda da tabela. */}
        {opts?.alerta && !isEditing && (
          <span
            aria-hidden="true"
            style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', backgroundColor: opts.alerta, marginTop: 4 }}
          />
        )}
      </td>
    );
  };

  const dimCell = (fieldW: string, fieldH: string, valW: any, valH: any, dimStyle?: boolean, alerta?: boolean) => {
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
              style={{ width: 44, border: 'none', borderBottom: '2px solid #f97316', fontSize: 11, padding: '0 2px', backgroundColor: 'transparent', fontFamily: 'DM Mono, monospace', color: '#1a1c1c' }} />
          ) : (
            <span onClick={() => setEditField(fieldW)} tabIndex={0} role="button" onKeyDown={editableKeyDown(() => setEditField(fieldW))} title="Clique para editar" style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: alerta ? '#b91c1c' : dimStyle ? '#746e69' : '#1a1c1c', fontWeight: alerta ? 700 : undefined, cursor: 'text', minWidth: 24 }}>{dispW}</span>
          )}
          <span style={{ color: '#d0cdc9', fontSize: 10, userSelect: 'none' }}>×</span>
          {editingH ? (
            <input autoFocus defaultValue={valH ?? ''} onBlur={e => { update(fieldH, e.target.value); setEditField(null); }} onKeyDown={e => { if (e.key==='Enter'){update(fieldH,(e.target as HTMLInputElement).value);setEditField(null);} if(e.key==='Escape')setEditField(null); }}
              style={{ width: 44, border: 'none', borderBottom: '2px solid #f97316', fontSize: 11, padding: '0 2px', backgroundColor: 'transparent', fontFamily: 'DM Mono, monospace', color: '#1a1c1c' }} />
          ) : (
            <span onClick={() => setEditField(fieldH)} tabIndex={0} role="button" onKeyDown={editableKeyDown(() => setEditField(fieldH))} title="Clique para editar" style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: alerta ? '#b91c1c' : dimStyle ? '#746e69' : '#1a1c1c', fontWeight: alerta ? 700 : undefined, cursor: 'text', minWidth: 24 }}>{dispH}</span>
          )}
        </div>
      </td>
    );
  };

  const m2 = parseFloat(row.calculatedM2) || 0;
  const m2Color = m2 > 30 ? '#dc2626' : m2 > 10 ? '#ea580c' : m2 > 0 ? '#16a34a' : '#d0cdc9';

  const hasSponsors = (row.suggestedSponsorIds ?? []).length > 0;

  // ── A LINHA SE ANUNCIA ──
  //
  // São 10 colunas. Achar o que falta exigia ler as dez, linha por linha, e
  // decidir de cabeça se aquele branco importava — numa planilha de 60 peças
  // isso não acontece: a pessoa importa e descobre depois, com a peça já no
  // evento.
  const defeitos = defeitosDaLinha(row, jaNoEvento);
  const grave = defeitos.some(d => DEFEITO_GRAVE.has(d));
  const corDoDefeito = defeitos.length === 0 ? null : grave ? '#dc2626' : '#d97706';
  const fundoDoDefeito = defeitos.length === 0 ? null : grave ? '#fffbfa' : '#fffdf7';
  const tituloDosDefeitos = defeitos.length === 0
    ? undefined
    : defeitos.map(d => `${DEFEITO_LABEL[d]}: ${DEFEITO_FRASE[d]}`).join(' · ');

  const semMedida = defeitos.includes('sem-medida');
  const semM2 = defeitos.includes('m2-nao-fecha');

  const rowBg = hovered ? '#f7f6f4' : (fundoDoDefeito ?? (idx % 2 === 0 ? '#fff' : '#fafaf9'));

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={tituloDosDefeitos}
      data-testid={`import-row-${idx}`}
      style={{ transition: 'background 0.12s', boxShadow: corDoDefeito ? `inset 3px 0 0 ${corDoDefeito}` : undefined }}
    >
      {/* O ponto ao lado da descrição: o defeito se anuncia onde o olho já
          está, sem depender de a faixa lateral entrar no campo de visão. */}
      {cell('description', row.description, { wide: true, alerta: corDoDefeito ?? undefined })}
      {cell('quantity', row.quantity, { mono: true })}
      {dimCell('visualWidth', 'visualHeight', row.visualWidth, row.visualHeight, true)}
      {/* Só a de ARQUIVO acende: a visual pode faltar sem impedir nada. */}
      {dimCell('fileWidth', 'fileHeight', row.fileWidth, row.fileHeight, false, semMedida)}

      {/* M² */}
      <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0efed', whiteSpace: 'nowrap', backgroundColor: rowBg }}>
        {/* Zerado, o m² fica VERMELHO e não no cinza da escala: um traço
            cinza se lê como "não se aplica", e aqui se aplica — é orçamento
            que não fecha. A escala de cor do valor positivo continua a mesma. */}
        <span style={{ fontSize: 13, fontWeight: 700, color: semM2 ? '#b91c1c' : m2Color, fontFamily: 'DM Mono, monospace', letterSpacing: '-0.02em' }}>
          {m2 > 0 ? m2.toFixed(2) : '—'}
        </span>
      </td>

      {cell('material', row.material)}
      {cell('finish', row.finish)}
      {/* Obs cell with reuse toggle */}
      <td
        onClick={() => setEditField('observations')}
        tabIndex={editField === 'observations' ? -1 : 0}
        role="button"
        onKeyDown={editField === 'observations' ? undefined : editableKeyDown(() => setEditField('observations'))}
        title="Clique para editar"
        style={{ padding: '8px 10px', borderBottom: '1px solid #f0efed', cursor: 'text', backgroundColor: editField === 'observations' ? '#fffbeb' : rowBg, maxWidth: 160 }}
      >
        {editField === 'observations' ? (
          <input autoFocus defaultValue={row.observations ?? ''}
            onBlur={e => { update('observations', e.target.value); setEditField(null); }}
            onKeyDown={e => { if (e.key === 'Enter') { update('observations', (e.target as HTMLInputElement).value); setEditField(null); } if (e.key === 'Escape') setEditField(null); }}
            style={{ width: '100%', border: 'none', borderBottom: '2px solid #f97316', padding: '0 2px', fontSize: 13, backgroundColor: 'transparent' }} />
        ) : (
          <span style={{ color: row.observations ? '#746e69' : '#a8a29e', fontSize: 13, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.observations || '—'}
          </span>
        )}
        {/* Reuse toggle */}
        <button
          onClick={e => { e.stopPropagation(); onChange({ ...row, reuse: !row.reuse }); }}
          style={{
            marginTop: 3, display: 'block',
            fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999, cursor: 'pointer',
            border: `1px solid ${row.reuse ? '#22c55e' : '#e2deda'}`,
            backgroundColor: row.reuse ? '#f0fdf4' : 'transparent',
            color: row.reuse ? '#16a34a' : '#57534e',
            letterSpacing: '0.04em', textTransform: 'uppercase', transition: 'all 0.15s',
          }}
        >
          Reaproveitar
        </button>
      </td>

      {/* Sponsor multi-select cell */}
      <td style={{ padding: '6px 8px', borderBottom: '1px solid #f0efed', backgroundColor: rowBg, minWidth: 230, verticalAlign: 'top' }}>
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
          {/* Add sponsor dropdown — kind="field". Não é filtro: cada escolha
              ACRESCENTA um patrocinador à linha (por isso o gatilho volta a
              "+ Adicionar" e o valor fica sempre vazio). Era `<select>` NATIVO
              dentro de uma célula editável, e o menu do sistema operacional
              abrindo por cima da grade era o único elemento da tela que não
              tinha o desenho da casa. #746e69 sobre o fundo branco da célula =
              5,29:1 ✓ em 10px (a régua pede 4,5:1). */}
          {(row.suggestedSponsorIds ?? []).length < eventSponsorsList.length && (
            <div onClick={e => e.stopPropagation()} style={{ display: 'inline-flex' }}>
              <FilterSelect
                kind="field" hideWhenEmpty={false}
                label="Adicionar patrocinador"
                placeholder="+ Adicionar"
                value=""
                onChange={v => {
                  if (v && !(row.suggestedSponsorIds ?? []).includes(v))
                    onChange({ ...row, suggestedSponsorIds: [...(row.suggestedSponsorIds ?? []), v] });
                }}
                options={eventSponsorsList
                  .filter(s => !(row.suggestedSponsorIds ?? []).includes(s.sponsorId))
                  .map(s => ({ value: s.sponsorId, label: s.name }))}
                searchPlaceholder="Buscar patrocinador..."
                emptyText="Nenhum patrocinador"
                panelWidth={220}
                triggerStyle={{ fontSize: 10, height: 'auto', borderRadius: 6, border: '1px dashed #d0cdc9', backgroundColor: 'transparent', color: '#746e69', padding: '2px 4px 2px 5px', maxWidth: 110 }}
              />
            </div>
          )}
          {/* Select all event sponsors */}
          {eventSponsorsList.length > 0 && (row.suggestedSponsorIds ?? []).length < eventSponsorsList.length && (
            <button
              type="button"
              title="Vincular todos os patrocinadores do evento"
              onClick={e => { e.stopPropagation(); onChange({ ...row, suggestedSponsorIds: eventSponsorsList.map(s => s.sponsorId) }); }}
              style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, border: '1px solid #bbf7d0', backgroundColor: '#f0fdf4', color: '#15803d', cursor: 'pointer', padding: '2px 7px', whiteSpace: 'nowrap' }}
            >
              Todos
            </button>
          )}
          {(row.suggestedSponsorIds ?? []).length === 0 && (
            // #78716c sobre branco = 4,80:1 ✓ (#a8a29e dava 2,32:1). Aqui a
            // frase não é enfeite: é o aviso de que a linha vai entrar SEM
            // patrocinador, e era o texto mais apagado da tabela.
            <span style={{ fontSize: 11, color: '#78716c', fontStyle: 'italic' }}>sem patrocinador</span>
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
  /** As peças que o evento JÁ tem — é contra elas que a repetição é medida. */
  itensDoEvento?: { type?: string | null; description?: string | null }[];
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
  itensDoEvento = [],
}: ImportXlsxDialogProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // Confirmação de descarte no padrão visual da casa — o window.confirm
  // nativo destoava do produto (flagrado em produção).
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  // ── TRIAGEM ──────────────────────────────────────────────────────────────
  //
  // A barra lateral dizia "42% vinculados" e mais nada. Saber QUAIS linhas
  // exigem atenção obrigava a ler as 10 colunas, linha por linha — e numa
  // planilha de 60 peças isso não acontece: a pessoa importa e descobre
  // depois, com a peça já no evento e o orçamento já errado.
  const [triagem, setTriagem] = useState<DefeitoImport | null>(null);

  // ── A REIMPORTAÇÃO, DETECTADA NO PREVIEW ─────────────────────────────
  //
  // Havia aqui um aviso de reimportação que NUNCA aparecia: o cliente
  // esperava um 409 `duplicate_detected` do servidor, e o servidor não
  // manda nem nunca mandou — `confirm-import` lê só `{ items, fileName }`,
  // e o `force` viajava e era ignorado. Reimportar a mesma planilha
  // duplicava o evento inteiro em silêncio.
  //
  // O aviso mudou de MOMENTO e de CONTEÚDO. De momento porque só serve
  // antes de importar: descobrir depois é descobrir com a peça já dentro.
  // De conteúdo porque um "12 de 40 já existem" não diz QUAIS — e sem os
  // nomes restam duas saídas ruins, importar tudo ou desistir de tudo.
  const chavesDoEvento = useMemo(
    () => new Set(itensDoEvento.map(chaveDaPeca)),
    [itensDoEvento],
  );
  const repetidas = (importPreviewItems ?? []).filter(i => chavesDoEvento.has(chaveDaPeca(i)));

  // Predicado único da busca do preview — usado na contagem, no "+ Todos" e
  // no empty-state de filtro sem resultado.
  const importQ = importSearch.toLowerCase();
  const matchesImportSearch = (i: any) =>
    !importSearch || i.description?.toLowerCase().includes(importQ) || i.type?.toLowerCase().includes(importQ);

  // O RECORTE, uma função só: a busca E a triagem. A contagem de cada balde
  // sai do MESMO predicado que a tabela aplica — com a própria dimensão de
  // fora —, então o número do balde é exatamente o de linhas que o clique
  // entrega.
  const passaNaTriagem = (i: any) => !triagem || defeitosDaLinha(i, chavesDoEvento).includes(triagem);
  const matchesImportFiltros = (i: any) => matchesImportSearch(i) && passaNaTriagem(i);

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) {
        // Preview carregado = trabalho de edição/vinculação em andamento.
        // Fechar (X/Esc/clique-fora) descartava tudo sem perguntar; a
        // confirmação usa o AlertDialog da casa (o confirm() nativo destoava).
        if (importPreviewItems && importPreviewItems.length > 0) {
          setConfirmDiscardOpen(true);
          return;
        }
        onOpenChangeClose();
      }
    }}>
      <DialogContent
        className="[&>button:last-child]:right-4 [&>button:last-child]:top-4 [&>button:last-child]:z-50"
        style={{ maxWidth: '98vw', width: importPreviewItems ? 1320 : 540, maxHeight: '92vh', padding: 0, gap: 0, borderRadius: 12, overflow: 'visible', transition: 'width 0.3s' }}
      >
        {/* Abaixo de 768px a sidebar empilha ACIMA da tabela (largura total) —
            lado a lado, os 260px fixos esmagavam o preview no celular. */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', height: '100%', maxHeight: '92vh', overflow: 'hidden', borderRadius: 12 }}>
        {/* ── Left sidebar ── */}
        <div style={{ width: isMobile ? '100%' : 260, minWidth: isMobile ? 0 : 260, maxHeight: isMobile && importPreviewItems ? '42vh' : undefined, backgroundColor: '#ffffff', borderRight: isMobile ? 'none' : '1px solid #e7e5e4', borderBottom: isMobile ? '1px solid #e7e5e4' : 'none', display: 'flex', flexDirection: 'column', padding: '22px 18px', gap: 16, overflowY: 'auto', flexShrink: 0 }}>
          {/* Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <FileSpreadsheet style={{ width: 15, height: 15, color: '#16a34a' }} />
            </div>
            <div>
              <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: '#1a1c1c', margin: 0, lineHeight: 1.2 }}>
                Importar Peças
              </DialogTitle>
              <DialogDescription style={{ fontSize: 10, color: '#746e69', margin: 0, marginTop: 1 }}>
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
              borderRadius: 12, padding: '18px 12px', cursor: 'pointer',
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
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', fontFamily: "'Space Grotesk', sans-serif" }}>{importFile.name}</div>
                  <div style={{ fontSize: 11, color: '#746e69', marginTop: 2 }}>{(importFile.size / 1024).toFixed(1)} KB</div>
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
                <Upload style={{ width: 20, height: 20, color: '#8a847e' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#44403c' }}>Arraste o .xlsx aqui</div>
                  <div style={{ fontSize: 11, color: '#746e69', marginTop: 2 }}>ou clique para selecionar</div>
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
                      <div style={{ fontSize: 18, fontWeight: 900, color: s.color, fontFamily: s.mono ? 'DM Mono, monospace' : "'Space Grotesk', sans-serif", lineHeight: 1 }}>{s.v}</div>
                      <div style={{ fontSize: 10, color: '#746e69', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 4 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: '#746e69', fontWeight: 600 }}>Vinculação</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: linkPct === 100 ? '#16a34a' : '#d97706' }}>{linked}/{allItems.length}</span>
                  </div>
                  <div style={{ height: 5, backgroundColor: '#e7e5e4', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${linkPct}%`, backgroundColor: linkPct === 100 ? '#16a34a' : '#d97706', borderRadius: 999, transition: 'width 0.4s' }} />
                  </div>
                </div>

                {/* ── ANTES DE IMPORTAR ──

                    Quatro baldes clicáveis. A contagem sai do mesmo predicado
                    da tabela (`defeitosDaLinha`), com a busca aplicada e a
                    própria triagem de fora — o número é o de linhas que o
                    clique entrega, não o de um pool vizinho.

                    Balde zerado fica esmaecido e sem clique: um balde que
                    devolve lista vazia é indistinguível de um filtro quebrado.
                    E ele CONTINUA na lista em vez de sumir — "0 sem medida" é
                    a boa notícia que a pessoa veio buscar. */}
                {(() => {
                  const naBusca = allItems.filter(matchesImportSearch);
                  const baldes: { chave: DefeitoImport; cor: string }[] = [
                    { chave: 'sem-patrocinador', cor: '#d97706' },
                    { chave: 'sem-medida', cor: '#dc2626' },
                    { chave: 'm2-nao-fecha', cor: '#dc2626' },
                    { chave: 'sem-material', cor: '#d97706' },
                    { chave: 'ja-existe', cor: '#dc2626' },
                  ];
                  return (
                    <div>
                      <div style={{ fontSize: 11, color: '#746e69', fontWeight: 600, marginBottom: 6 }}>Antes de importar</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {baldes.map(({ chave, cor }) => {
                          const n = naBusca.filter(i => defeitosDaLinha(i, chavesDoEvento).includes(chave)).length;
                          const ligado = triagem === chave;
                          const vazio = n === 0;
                          return (
                            <button
                              key={chave}
                              type="button"
                              onClick={vazio ? undefined : () => setTriagem(ligado ? null : chave)}
                              aria-pressed={ligado}
                              disabled={vazio}
                              data-testid={`triagem-${chave}`}
                              title={vazio
                                ? `Nenhuma peça com este problema`
                                : ligado ? 'Mostrar todas as peças de novo' : `Ver as ${n} com este problema`}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 7, width: '100%',
                                padding: '6px 9px', borderRadius: 7, textAlign: 'left',
                                border: `1px solid ${ligado ? '#1c1917' : '#e7e5e4'}`,
                                backgroundColor: ligado ? '#1c1917' : '#fff',
                                color: ligado ? '#fff' : '#44403c',
                                opacity: vazio ? 0.45 : 1,
                                cursor: vazio ? 'default' : 'pointer',
                                font: 'inherit', fontSize: 11, fontWeight: 600,
                              }}
                            >
                              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: ligado ? '#fff' : cor, flexShrink: 0 }} />
                              <span style={{ flex: 1, minWidth: 0 }}>{DEFEITO_LABEL[chave]}</span>
                              <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700 }}>{n}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
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
              style={{ width: '100%', padding: '11px 0', backgroundColor: importFile ? '#16a34a' : '#e7e5e4', color: importFile ? '#fff' : '#8a847e', border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: importFile ? 'pointer' : 'not-allowed', fontFamily: "'Space Grotesk', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {previewXlsxPending ? (
                <><Loader2 style={{ width: 15, height: 15, animation: 'spin 1s linear infinite' }} /> Processando...</>
              ) : (
                <><List style={{ width: 15, height: 15 }} /> Pré-visualizar Peças</>
              )}
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* O AVISO DE REIMPORTAÇÃO — agora com nomes e com saída.

                  Ele não BLOQUEIA: reimportar de propósito é legítimo (uma
                  planilha corrigida, um lote que ficou de fora). O que ele
                  faz é impedir que aconteça sem ninguém saber, e oferecer o
                  atalho de quem já sabe — tirar as repetidas e importar o
                  resto, que é o desfecho em quase todos os casos. */}
              {repetidas.length > 0 && (
                <div
                  data-testid="aviso-reimportacao"
                  style={{ padding: '10px 12px', borderRadius: 8, background: '#fff7ed', border: '1px solid #fed7aa', fontSize: 11, color: '#9a3412', lineHeight: 1.5 }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 2, color: '#7c2d12' }}>
                    {repetidas.length} de {importPreviewItems.length} já {repetidas.length === 1 ? 'está' : 'estão'} neste evento
                  </div>
                  <div>
                    {repetidas.slice(0, 3).map((r: any) => r.description || r.type || 'sem descrição').join(' · ')}
                    {repetidas.length > 3 ? ` · e mais ${repetidas.length - 3}` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => setTriagem(triagem === 'ja-existe' ? null : 'ja-existe')}
                      aria-pressed={triagem === 'ja-existe'}
                      data-testid="button-ver-repetidas"
                      style={{ flex: 1, padding: '6px 0', background: '#fff', border: '1px solid #fed7aa', borderRadius: 6, fontSize: 11, fontWeight: 700, color: '#9a3412', cursor: 'pointer' }}
                    >
                      {triagem === 'ja-existe' ? 'Ver todas de novo' : `Ver as ${repetidas.length}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const fora = new Set(repetidas.map((r: any) => r._id));
                        setImportPreviewItems(prev => prev ? prev.filter(r => !fora.has(r._id)) : prev);
                        // A triagem ligada em 'ja-existe' deixaria a tabela
                        // vazia logo depois da remoção — a lista some junto
                        // com o motivo de ela estar recortada.
                        if (triagem === 'ja-existe') setTriagem(null);
                        toast({ title: `${fora.size} ${fora.size === 1 ? 'peça repetida removida' : 'peças repetidas removidas'}`, description: 'Elas continuam no evento; só saíram desta importação.' });
                      }}
                      data-testid="button-remover-repetidas"
                      style={{ flex: 1, padding: '6px 0', background: '#c2410c', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer' }}
                    >
                      Remover {repetidas.length === 1 ? 'a repetida' : `as ${repetidas.length}`}
                    </button>
                  </div>
                </div>
              )}
              <button
                onClick={() => { setImportPreviewItems(null); setImportSearch(""); setTriagem(null); }}
                style={{ width: '100%', padding: '9px 0', backgroundColor: 'transparent', color: '#746e69', border: '1px solid #e7e5e4', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Trocar arquivo
              </button>
              <button
                disabled={!importPreviewItems.length || confirmImportPending}
                onClick={() => { if (importPreviewItems.length > 0) onConfirmImport(importPreviewItems, importFileName); }}
                data-testid="button-confirm-import"
                style={{ width: '100%', padding: '11px 0', backgroundColor: '#1c1917', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: "'Space Grotesk', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
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
            {/* Search bar. paddingRight extra: o X nativo do dialog vive em
                right-4/top-4 e ficava POR CIMA do botão "+ Todos
                patrocinadores" — colisão flagrada em produção. */}
            <div style={{ padding: '10px 44px 10px 16px', borderBottom: '1px solid #e7e5e4', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: '#8a847e', pointerEvents: 'none' }} />
                <input
                  value={importSearch}
                  onChange={e => setImportSearch(e.target.value)}
                  placeholder="Filtrar peças ou grupos..."
                  style={{ width: '100%', padding: '7px 12px 7px 28px', backgroundColor: '#f5f4f2', border: '1px solid #e7e5e4', borderRadius: 8, color: '#1a1c1c', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <span style={{ fontSize: 11, color: '#746e69', whiteSpace: 'nowrap', fontWeight: 600 }}>
                {importSearch || triagem
                  ? `${importPreviewItems.filter(matchesImportFiltros).length} de ${importPreviewItems.length} peças`
                  : `${importPreviewItems.length} peças`
                }
              </span>
              {/* O "Limpar" da triagem: um balde ligado na barra lateral fica
                  longe da tabela que ele recortou, e sem saída à mão a pessoa
                  lê a lista curta como "a planilha tem 4 peças". */}
              {triagem && (
                <button
                  type="button"
                  onClick={() => setTriagem(null)}
                  data-testid="button-limpar-triagem"
                  style={{ fontSize: 11, fontWeight: 700, color: '#c2410c', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', padding: 0 }}
                >
                  Limpar
                </button>
              )}
              {eventSponsorsList.length > 0 && (
                <button
                  type="button"
                  title="Vincular todos os patrocinadores do evento a todas as peças listadas"
                  onClick={() => {
                    const allIds = eventSponsorsList.map(s => s.sponsorId);
                    const q = importSearch.toLowerCase();
                    setImportPreviewItems(prev => prev ? prev.map(r =>
                      (!q || r.description?.toLowerCase().includes(q) || r.type?.toLowerCase().includes(q))
                        ? { ...r, suggestedSponsorIds: allIds }
                        : r
                    ) : prev);
                  }}
                  style={{ fontSize: 11, fontWeight: 700, borderRadius: 8, border: '1px solid #bbf7d0', backgroundColor: '#f0fdf4', color: '#15803d', cursor: 'pointer', padding: '6px 11px', whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  + Todos patrocinadores
                </button>
              )}
            </div>

            {/* Table */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ backgroundColor: '#f5f4f2', position: 'sticky', top: 0, zIndex: 2, boxShadow: '0 1px 0 #e8e6e3' }}>
                    {[
                      { label: 'Descrição', tip: 'Nome da peça' },
                      { label: 'Qtd', tip: 'Quantidade' },
                      { label: 'Visual', tip: 'VIS. — o que se vê na peça montada (m)' },
                      { label: 'Arquivo', tip: 'ARQ. — o que a impressora recebe (m); o m² sai daqui' },
                      { label: 'M²', tip: 'Metros quadrados calculados' },
                      { label: 'Material', tip: '' },
                      { label: 'Acabamento', tip: '' },
                      { label: 'Obs', tip: 'Observações' },
                      { label: 'Patrocinador', tip: 'Sugestão automática — clique para alterar' },
                      { label: '', tip: '' },
                    ].map((h, i) => (
                      <th key={i} title={h.tip} style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 700, fontSize: 10, color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const items = importPreviewItems.filter(matchesImportFiltros);
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
                                  <div style={{ width: 3, height: 14, backgroundColor: '#D97A1E', borderRadius: 6 }} />
                                  <span style={{ fontWeight: 800, fontSize: 13, color: '#1a1c1c', fontFamily: "'Space Grotesk', sans-serif", textTransform: 'uppercase', letterSpacing: '0.04em' }}>{type}</span>
                                  <span style={{ fontSize: 10, fontWeight: 600, color: '#57534e', backgroundColor: '#e8e6e3', borderRadius: 999, padding: '1px 8px' }}>{groupItems.length}</span>
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
                              jaNoEvento={chavesDoEvento}
                            />
                          ))}
                        </Fragment>
                      );
                    });
                  })()}
                </tbody>
              </table>
              {importPreviewItems.length === 0 && (
                <div style={{ padding: 60, textAlign: 'center', color: '#746e69', fontSize: 13 }}>
                  <List style={{ width: 32, height: 32, color: '#a8a29e', margin: '0 auto 12px' }} />
                  <div>Nenhuma peça para importar.</div>
                </div>
              )}
              {/* Filtro sem resultado: antes a tabela simplesmente sumia,
                  sem dizer o porquê nem oferecer saída. */}
              {importPreviewItems.length > 0 && importPreviewItems.filter(matchesImportFiltros).length === 0 && (
                <div style={{ padding: 60, textAlign: 'center', color: '#746e69', fontSize: 13 }}>
                  <Search style={{ width: 32, height: 32, color: '#a8a29e', margin: '0 auto 12px' }} />
                  <div style={{ fontWeight: 700, color: '#1a1c1c', marginBottom: 4 }}>Nenhuma peça corresponde ao filtro</div>
                  <div style={{ marginBottom: 14 }}>Tente outro termo ou limpe o filtro para ver as {importPreviewItems.length} peças.</div>
                  <button
                    // Limpa os DOIS recortes: com a triagem ligada, um
                    // "Limpar filtro" que so apaga a busca deixa a tela
                    // vazia depois de a pessoa ter pedido para limpar.
                    onClick={() => { setImportSearch(""); setTriagem(null); }}
                    data-testid="button-clear-import-search"
                    style={{ padding: '8px 18px', backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderRadius: 8, fontSize: 12, fontWeight: 700, color: '#1a1c1c', cursor: 'pointer' }}
                  >
                    Limpar filtro
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        </div>{/* wrapper flex row */}
      </DialogContent>

      {/* Confirmação de descarte da importação — padrão da casa */}
      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent style={{ width: '96vw', maxWidth: 420, borderRadius: 16 }}>
          <AlertDialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 17, fontWeight: 700, color: '#1c1917' }}>
            Descartar importação?
          </AlertDialogTitle>
          <AlertDialogDescription style={{ fontSize: 13, color: '#57534e', lineHeight: 1.6 }}>
            As edições e vinculações feitas no preview serão perdidas.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-keep-import">Continuar editando</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-discard-import"
              onClick={() => { setConfirmDiscardOpen(false); onOpenChangeClose(); }}
              style={{ backgroundColor: '#dc2626', color: '#fff' }}
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
