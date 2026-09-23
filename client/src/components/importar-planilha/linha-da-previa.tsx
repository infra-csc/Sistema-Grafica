// A LINHA DO PREVIEW — cada célula edita no lugar; a linha se pinta com os defeitos.
import { useState } from "react";
import { X } from "lucide-react";
import { FilterSelect } from "@/components/filter-select";
import { T, N, TOM, FONT } from "@/lib/theme";
import { DEFEITO_FRASE, DEFEITO_GRAVE, DEFEITO_LABEL, defeitosDaLinha } from "./regras";
import type { CampoDaLinha, LinhaDaImportacao, PatrocinadorDoEvento } from "./tipos";

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
  MASTER:     { bg: TOM.perigo.bg, color: TOM.perigo.text, border: TOM.perigo.border },
  GOLD:       { bg: TOM.info.bg, color: TOM.info.text, border: TOM.info.border },
  SILVER:     { bg: TOM.roxo.bg, color: TOM.roxo.text, border: TOM.roxo.border },
  APOIO:      { bg: N.n2, color: T.strong, border: T.border },
  MIDIA:      { bg: TOM.ciano.bg, color: TOM.ciano.text, border: TOM.ciano.border },
  MINISTERIO: { bg: TOM.esmeralda.bg, color: TOM.esmeralda.text, border: TOM.esmeralda.border },
};

/** O valor cru de uma célula: número da planilha ou texto já editado. */
type ValorDaCelula = string | number | null | undefined;

export function ImportPreviewRow({ row, idx, onChange, onDelete, eventSponsorsList, jaNoEvento, repetidas, mostrarVisual = true }: {
  row: LinhaDaImportacao; idx: number;
  /** Linhas que repetem outra da mesma planilha (_id → linha repetida). */
  repetidas?: Map<string, number>;
  onChange: (updated: LinhaDaImportacao) => void;
  onDelete: () => void;
  eventSponsorsList: PatrocinadorDoEvento[];
  jaNoEvento?: Set<string>;
  /** Falso quando NENHUMA linha da planilha trouxe medida visual: a coluna some em vez de ocupar espaço com traços. */
  mostrarVisual?: boolean;
}) {
  const [editField, setEditField] = useState<CampoDaLinha | null>(null);
  const [hovered, setHovered] = useState(false);

  const update = (field: CampoDaLinha, value: string) => {
    const updated: LinhaDaImportacao = { ...row, [field]: value };
    if (['quantity', 'fileWidth', 'fileHeight', 'visualWidth', 'visualHeight'].includes(field)) {
      const qty = parseFloat(field === 'quantity' ? value : String(row.quantity)) || 0;
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
      const fw  = parseFloat(field === 'fileWidth'  ? value : String(row.fileWidth  ?? 0)) || 0;
      const fh  = parseFloat(field === 'fileHeight' ? value : String(row.fileHeight ?? 0)) || 0;
      updated.calculatedM2 = fw && fh ? (qty * fw * fh).toFixed(2) : '0';
      if (fw && fh) updated.measurement = `${fw.toFixed(2)} × ${fh.toFixed(2)}`;
    }
    onChange(updated);
  };

  // Nome de cada campo em português: vira o `aria-label` do input que abre no
  // lugar da célula. Sem ele o leitor de tela anunciava só "edição de texto" —
  // numa tabela com seis campos editáveis por linha, isso não localiza nada.
  const ROTULO_DO_CAMPO: Record<string, string> = {
    description: 'Descrição', quantity: 'Quantidade', material: 'Material',
    finish: 'Acabamento', observations: 'Observações',
    fileWidth: 'Largura do arquivo (m)', fileHeight: 'Altura do arquivo (m)',
    visualWidth: 'Largura visual (m)', visualHeight: 'Altura visual (m)',
  };
  const rotuloDoCampo = (field: string) => ROTULO_DO_CAMPO[field] ?? field;

  const cell = (field: CampoDaLinha, val: ValorDaCelula, opts?: { dim?: boolean; mono?: boolean; wide?: boolean; alerta?: string }) => {
    const isEditing = editField === field;
    const display = val !== null && val !== undefined && val !== '' ? String(val) : '—';
    const rowBg = hovered ? N.n2 : (idx % 2 === 0 ? T.surface : T.bg);
    return (
      <td
        onClick={() => setEditField(field)}
        tabIndex={isEditing ? -1 : 0}
        role="button"
        onKeyDown={isEditing ? undefined : editableKeyDown(() => setEditField(field))}
        // aria-label em vez de `title`: a célula é um botão cujo texto é o
        // VALOR ("—", "2"), e sozinho ele não diz nem o campo nem que dá para
        // editar. O `title` não chega ao leitor de tela nem ao tablet.
        aria-label={`${rotuloDoCampo(field)}: ${display}. Editar.`}
        style={{
          padding: '8px 10px',
          borderBottom: `1px solid ${N.n3}`,
          cursor: 'text',
          backgroundColor: isEditing ? TOM.alerta.bg : rowBg,
          maxWidth: opts?.wide ? 220 : 160,
        }}
      >
        {isEditing ? (
          <input
            autoFocus
            aria-label={`${rotuloDoCampo(field)} da peça ${idx + 1}`}
            defaultValue={val ?? ''}
            onBlur={e => { update(field, e.target.value); setEditField(null); }}
            onKeyDown={e => {
              if (e.key === 'Enter') { update(field, (e.target as HTMLInputElement).value); setEditField(null); }
              if (e.key === 'Escape') setEditField(null);
            }}
            style={{ width: '100%', border: 'none', borderBottom: `2px solid ${T.accent}`, padding: '0 2px', fontSize: 13, backgroundColor: 'transparent', fontFamily: opts?.mono ? FONT.mono : 'inherit' }}
          />
        ) : (
          <span style={{
            // O traço é INFORMAÇÃO ("a planilha não trouxe"): #78716c, não o
            // #a8a29e de antes, que some sobre o zebrado da tabela.
            color: display === '—' ? T.second : (opts?.dim ? T.second : T.text),
            fontSize: 13,
            fontFamily: opts?.mono ? FONT.mono : 'inherit',
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

  const dimCell = (fieldW: CampoDaLinha, fieldH: CampoDaLinha, valW: ValorDaCelula, valH: ValorDaCelula, dimStyle?: boolean, alerta?: boolean) => {
    const rowBg = hovered ? N.n2 : (idx % 2 === 0 ? T.surface : T.bg);
    const editingW = editField === fieldW;
    const editingH = editField === fieldH;
    const dispW = valW !== null && valW !== undefined && valW !== '' ? String(valW) : '—';
    const dispH = valH !== null && valH !== undefined && valH !== '' ? String(valH) : '—';
    return (
      <td style={{ padding: '8px 10px', borderBottom: `1px solid ${N.n3}`, whiteSpace: 'nowrap', backgroundColor: rowBg }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {editingW ? (
            <input autoFocus aria-label={`${rotuloDoCampo(fieldW)} da peça ${idx + 1}`} defaultValue={valW ?? ''} onBlur={e => { update(fieldW, e.target.value); setEditField(null); }} onKeyDown={e => { if (e.key==='Enter'){update(fieldW,(e.target as HTMLInputElement).value);setEditField(null);} if(e.key==='Escape')setEditField(null); }}
              style={{ width: 44, border: 'none', borderBottom: `2px solid ${T.accent}`, fontSize: 11, padding: '0 2px', backgroundColor: 'transparent', fontFamily: FONT.mono, color: T.text }} />
          ) : (
            <span onClick={() => setEditField(fieldW)} tabIndex={0} role="button" onKeyDown={editableKeyDown(() => setEditField(fieldW))} aria-label={`${rotuloDoCampo(fieldW)}: ${dispW}. Editar.`} style={{ fontSize: 11, fontFamily: FONT.mono, color: alerta ? TOM.perigo.text : dimStyle ? T.second : T.text, fontWeight: alerta ? 700 : undefined, cursor: 'text', minWidth: 24 }}>{dispW}</span>
          )}
          <span style={{ color: T.bdark, fontSize: 10, userSelect: 'none' }}>×</span>
          {editingH ? (
            <input autoFocus aria-label={`${rotuloDoCampo(fieldH)} da peça ${idx + 1}`} defaultValue={valH ?? ''} onBlur={e => { update(fieldH, e.target.value); setEditField(null); }} onKeyDown={e => { if (e.key==='Enter'){update(fieldH,(e.target as HTMLInputElement).value);setEditField(null);} if(e.key==='Escape')setEditField(null); }}
              style={{ width: 44, border: 'none', borderBottom: `2px solid ${T.accent}`, fontSize: 11, padding: '0 2px', backgroundColor: 'transparent', fontFamily: FONT.mono, color: T.text }} />
          ) : (
            <span onClick={() => setEditField(fieldH)} tabIndex={0} role="button" onKeyDown={editableKeyDown(() => setEditField(fieldH))} aria-label={`${rotuloDoCampo(fieldH)}: ${dispH}. Editar.`} style={{ fontSize: 11, fontFamily: FONT.mono, color: alerta ? TOM.perigo.text : dimStyle ? T.second : T.text, fontWeight: alerta ? 700 : undefined, cursor: 'text', minWidth: 24 }}>{dispH}</span>
          )}
        </div>
      </td>
    );
  };

  const m2 = parseFloat(String(row.calculatedM2)) || 0;
  // Mesma escala (alto · médio · baixo), nos tons que passam AA em 13px:
  // #ea580c (3,6:1) e #16a34a (3,3:1) viraram #c2410c e #15803d.
  const m2Color = m2 > 30 ? TOM.perigo.text : m2 > 10 ? T.accentText : m2 > 0 ? TOM.sucesso.text : T.second;

  const hasSponsors = (row.suggestedSponsorIds ?? []).length > 0;

  // ── A LINHA SE ANUNCIA ──
  //
  // São 10 colunas. Achar o que falta exigia ler as dez, linha por linha, e
  // decidir de cabeça se aquele branco importava — numa planilha de 60 peças
  // isso não acontece: a pessoa importa e descobre depois, com a peça já no
  // evento.
  const defeitos = defeitosDaLinha(row, jaNoEvento, repetidas);
  const grave = defeitos.some(d => DEFEITO_GRAVE.has(d));
  const corDoDefeito = defeitos.length === 0 ? null : grave ? TOM.perigo.text : TOM.alerta.text;
  const fundoDoDefeito = defeitos.length === 0 ? null : grave ? T.bg : TOM.alerta.bg;
  const tituloDosDefeitos = defeitos.length === 0
    ? undefined
    : defeitos.map(d => d === 'repetida-na-planilha'
        ? `${DEFEITO_LABEL[d]}: repete a linha ${repetidas?.get(row._id)}`
        : `${DEFEITO_LABEL[d]}: ${DEFEITO_FRASE[d]}`).join(' · ');

  const semMedida = defeitos.includes('sem-medida');
  const semM2 = defeitos.includes('m2-nao-fecha');

  const rowBg = hovered ? N.n2 : (fundoDoDefeito ?? (idx % 2 === 0 ? T.surface : T.bg));

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
      {cell('quantity', row.quantity, { mono: true, alerta: defeitos.includes('qtd-invalida') ? TOM.perigo.text : undefined })}
      {mostrarVisual && dimCell('visualWidth', 'visualHeight', row.visualWidth, row.visualHeight, true)}
      {/* Só a de ARQUIVO acende: a visual pode faltar sem impedir nada. */}
      {dimCell('fileWidth', 'fileHeight', row.fileWidth, row.fileHeight, false, semMedida)}

      {/* M² */}
      <td style={{ padding: '8px 10px', borderBottom: `1px solid ${N.n3}`, whiteSpace: 'nowrap', backgroundColor: rowBg }}>
        {/* Zerado, o m² fica VERMELHO e não no cinza da escala: um traço
            cinza se lê como "não se aplica", e aqui se aplica — é orçamento
            que não fecha. A escala de cor do valor positivo continua a mesma. */}
        <span style={{ fontSize: 13, fontWeight: 700, color: semM2 ? TOM.perigo.text : m2Color, fontFamily: FONT.mono, letterSpacing: '-0.02em' }}>
          {m2 > 0 ? m2.toFixed(2) : '—'}
        </span>
      </td>

      {cell('material', row.material)}
      {cell('finish', row.finish)}
      {/* Sponsor multi-select cell */}
      <td style={{ padding: '6px 8px', borderBottom: `1px solid ${N.n3}`, backgroundColor: rowBg, verticalAlign: 'top' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
          {/* Chips for each selected sponsor */}
          {(row.suggestedSponsorIds ?? []).map((sid: string) => {
            const sp = eventSponsorsList.find(s => s.sponsorId === sid);
            if (!sp) return null;
            const qc = IMPORT_QUOTA_COLORS[sp.quota] ?? { bg: TOM.ceu.bg, color: TOM.ceu.text, border: TOM.ceu.border };
            return (
              <span key={sid} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px 2px 7px', borderRadius: 6, border: `1.5px solid ${qc.border}`, backgroundColor: qc.bg, color: qc.color, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>
                {sp.name}
                <button
                  type="button"
                  aria-label={`Tirar ${sp.name} desta peça`}
                  title={`Tirar ${sp.name}`}
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
                triggerStyle={{ fontSize: 10, height: 'auto', borderRadius: 6, border: `1px dashed ${T.bdark}`, backgroundColor: 'transparent', color: T.second, padding: '2px 4px 2px 5px', maxWidth: 110 }}
              />
            </div>
          )}
          {/* Select all event sponsors */}
          {eventSponsorsList.length > 0 && (row.suggestedSponsorIds ?? []).length < eventSponsorsList.length && (
            <button
              type="button"
              title="Vincular todos os patrocinadores do evento"
              onClick={e => { e.stopPropagation(); onChange({ ...row, suggestedSponsorIds: eventSponsorsList.map(s => s.sponsorId) }); }}
              style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, border: `1px solid ${TOM.sucesso.border}`, backgroundColor: TOM.sucesso.bg, color: TOM.sucesso.text, cursor: 'pointer', padding: '2px 7px', whiteSpace: 'nowrap' }}
            >
              Todos
            </button>
          )}
          {(row.suggestedSponsorIds ?? []).length === 0 && (
            // #78716c sobre branco = 4,80:1 ✓ (#a8a29e dava 2,32:1). Aqui a
            // frase não é enfeite: é o aviso de que a linha vai entrar SEM
            // patrocinador, e era o texto mais apagado da tabela.
            <span style={{ fontSize: 11, color: T.second, fontStyle: 'italic' }}>sem patrocinador</span>
          )}
        </div>
      </td>

      {/* Obs cell with reuse toggle */}
      <td
        onClick={() => setEditField('observations')}
        tabIndex={editField === 'observations' ? -1 : 0}
        role="button"
        onKeyDown={editField === 'observations' ? undefined : editableKeyDown(() => setEditField('observations'))}
        aria-label={`Observações: ${row.observations || 'vazio'}. Editar.`}
        style={{ padding: '8px 10px', borderBottom: `1px solid ${N.n3}`, cursor: 'text', backgroundColor: editField === 'observations' ? TOM.alerta.bg : rowBg, maxWidth: 160 }}
      >
        {editField === 'observations' ? (
          <input autoFocus aria-label={`Observações da peça ${idx + 1}`} defaultValue={row.observations ?? ''}
            onBlur={e => { update('observations', e.target.value); setEditField(null); }}
            onKeyDown={e => { if (e.key === 'Enter') { update('observations', (e.target as HTMLInputElement).value); setEditField(null); } if (e.key === 'Escape') setEditField(null); }}
            style={{ width: '100%', border: 'none', borderBottom: `2px solid ${T.accent}`, padding: '0 2px', fontSize: 13, backgroundColor: 'transparent' }} />
        ) : (
          <span style={{ color: row.observations ? T.second : T.second, fontSize: 13, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.observations || '—'}
          </span>
        )}
        {/* Reuse toggle */}
        <button
          type="button"
          aria-pressed={!!row.reuse}
          onClick={e => { e.stopPropagation(); onChange({ ...row, reuse: !row.reuse }); }}
          style={{
            marginTop: 3, display: 'block',
            fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999, cursor: 'pointer',
            border: `1px solid ${row.reuse ? TOM.sucesso.dot : T.border}`,
            backgroundColor: row.reuse ? TOM.sucesso.bg : 'transparent',
            color: row.reuse ? TOM.sucesso.text : T.apoio,
            letterSpacing: '0.04em', textTransform: 'uppercase', transition: 'all 0.15s',
          }}
        >
          Reaproveitar
        </button>
      </td>

      {/* Delete */}
      <td style={{ padding: '6px 6px', borderBottom: `1px solid ${N.n3}`, backgroundColor: rowBg }}>
        {/* O X em repouso era #d0cdc9 (1,6:1): só aparecia no hover, então
            no toque e no teclado a linha parecia não ter como sair. */}
        <button
          type="button"
          onClick={onDelete}
          title="Tirar esta peça da importação"
          aria-label={`Tirar ${row.description || row.type || 'esta peça'} da importação`}
          style={{ width: 26, height: 26, borderRadius: 6, border: 'none', backgroundColor: hovered ? TOM.perigo.bg : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: hovered ? TOM.perigo.text : T.second, transition: 'all 0.15s' }}
        >
          <X style={{ width: 13, height: 13 }} />
        </button>
      </td>
    </tr>
  );
}
