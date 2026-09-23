// A BARRA LATERAL da importação: topo fixo (título e arquivo), meio que rola
// (resumo e triagem) e pé fixo (avisos e o botão de importar).
import { List, Check, CheckCircle2, AlertTriangle, FileSpreadsheet, Upload, X } from "lucide-react";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { T, N, TOM, FONT } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { DEFEITO_LABEL, defeitosDaLinha, tipoDoGrupo, type DefeitoImport } from "./regras";
import type { LinhaDaImportacao } from "./tipos";

export function BarraLateralDaImportacao({
  isMobile, importFile, setImportFile, setImportPreview, importPreviewItems, setImportPreviewItems,
  importFileName, setImportSearch, previewXlsxPending, onPreview, confirmImportPending,
  ignoradas, verIgnoradas, setVerIgnoradas, repetidas, comQtdInvalida, chavesDoEvento, repetidasDaPlanilha,
  triagem, setTriagem, matchesImportSearch, setEscolhendoDestino,
}: {
  isMobile: boolean;
  importFile: File | null;
  setImportFile: (f: File | null) => void;
  setImportPreview: (p: { total: number; groups: string[] } | null) => void;
  importPreviewItems: LinhaDaImportacao[] | null;
  setImportPreviewItems: React.Dispatch<React.SetStateAction<LinhaDaImportacao[] | null>>;
  importFileName: string;
  setImportSearch: (s: string) => void;
  previewXlsxPending: boolean;
  onPreview: (file: File) => void;
  confirmImportPending: boolean;
  ignoradas: { linha: number; motivo: string }[];
  verIgnoradas: boolean;
  setVerIgnoradas: React.Dispatch<React.SetStateAction<boolean>>;
  /** Linhas que já estão no evento (reimportação). */
  repetidas: LinhaDaImportacao[];
  /** Linhas que o servidor recusaria (quantidade inválida). */
  comQtdInvalida: LinhaDaImportacao[];
  chavesDoEvento: Set<string>;
  repetidasDaPlanilha: Map<string, number>;
  triagem: DefeitoImport | null;
  setTriagem: (t: DefeitoImport | null) => void;
  matchesImportSearch: (i: LinhaDaImportacao) => boolean | undefined;
  setEscolhendoDestino: (v: boolean) => void;
}) {
  const { toast } = useToast();

  return (
    <div style={{ width: isMobile ? '100%' : 260, minWidth: isMobile ? 0 : 260, maxHeight: isMobile && importPreviewItems ? '42vh' : undefined, backgroundColor: T.surface, borderRight: isMobile ? 'none' : `1px solid ${T.border}`, borderBottom: isMobile ? `1px solid ${T.border}` : 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
      {/* TOPO FIXO: título e o cartão do arquivo — o começo da tarefa. */}
      <div style={{ flexShrink: 0, padding: '22px 18px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: TOM.sucesso.bg, border: `1px solid ${TOM.sucesso.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <FileSpreadsheet style={{ width: 15, height: 15, color: TOM.sucesso.text }} />
        </div>
        <div>
          <DialogTitle style={{ fontFamily: FONT.display, fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: T.text, margin: 0, lineHeight: 1.2 }}>
            Importar Peças
          </DialogTitle>
          <DialogDescription style={{ fontSize: 10, color: T.second, margin: 0, marginTop: 1 }}>
            {importFileName || 'Formato padrão NORTE'}
          </DialogDescription>
        </div>
      </div>

      {/* sr-only, e não display:none: escondido de vez, o campo saía da
          ordem de Tab e sem mouse não havia como escolher a planilha. Vem
          ANTES do rótulo para o `peer` pintar o anel de foco nele. */}
      <input id="xlsx-upload" type="file" accept=".xlsx,.xls" className="sr-only peer" aria-label="Escolher a planilha .xlsx" onChange={e => {
        const f = e.target.files?.[0];
        if (f) { setImportFile(f); setImportPreview(null); setImportPreviewItems(null); }
        e.target.value = "";
      }} />
      {/* Drop zone */}
      <label
        htmlFor="xlsx-upload"
        data-testid="dropzone-xlsx"
        className="peer-focus-visible:ring-2 peer-focus-visible:ring-green-700 peer-focus-visible:ring-offset-2"
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          border: '2px dashed', borderColor: importFile ? TOM.sucesso.text : T.bdark,
          borderRadius: 12, padding: '18px 12px', cursor: 'pointer',
          backgroundColor: importFile ? TOM.sucesso.bg : T.bg, transition: 'all 0.2s',
        }}
        onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = TOM.sucesso.text; e.currentTarget.style.backgroundColor = TOM.sucesso.bg; }}
        onDragLeave={e => { e.currentTarget.style.borderColor = importFile ? TOM.sucesso.text : T.bdark; e.currentTarget.style.backgroundColor = importFile ? TOM.sucesso.bg : T.bg; }}
        onDrop={e => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) {
            setImportFile(f); setImportPreview(null); setImportPreviewItems(null);
          } else {
            toast({ title: "Arquivo inválido", description: "Selecione um arquivo .xlsx", variant: "warning" });
          }
        }}
      >
        {importFile ? (
          <>
            <CheckCircle2 style={{ width: 24, height: 24, color: TOM.sucesso.text }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TOM.sucesso.text, fontFamily: FONT.display }}>{importFile.name}</div>
              <div style={{ fontSize: 11, color: T.second, marginTop: 2 }}>{(importFile.size / 1024).toFixed(1)} KB</div>
            </div>
            <button
              type="button"
              onClick={e => { e.preventDefault(); setImportFile(null); setImportPreview(null); setImportPreviewItems(null); }}
              style={{ fontSize: 11, fontWeight: 600, color: TOM.perigo.text, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, minHeight: 28, padding: '0 6px' }}
            >
              <X style={{ width: 10, height: 10 }} /> Remover
            </button>
          </>
        ) : (
          <>
            <Upload style={{ width: 20, height: 20, color: T.second }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.strong }}>Arraste o .xlsx aqui</div>
              <div style={{ fontSize: 11, color: T.second, marginTop: 2 }}>ou clique para selecionar</div>
            </div>
          </>
        )}
      </label>
      </div>

      {/* MEIO ROLÁVEL: resumo, triagem e a dica de formato. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Stats (when preview is loaded) */}
      {importPreviewItems && (() => {
        const allItems = importPreviewItems;
        const totalM2 = allItems.reduce((s: number, i) => s + (parseFloat(String(i.calculatedM2)) || 0), 0);
        const linked = allItems.filter((i) => (i.suggestedSponsorIds ?? []).length > 0).length;
        const groups = new Set(allItems.map(tipoDoGrupo)).size;
        const linkPct = allItems.length > 0 ? Math.round((linked / allItems.length) * 100) : 0;
        return (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { l: 'Peças',      v: allItems.length,         color: T.text, mono: false },
                { l: 'Grupos',     v: groups,                  color: T.text, mono: false },
                { l: 'M² total',   v: `${totalM2.toFixed(0)}`, color: TOM.alerta.text, mono: true  },
                { l: 'Vinculados', v: `${linkPct}%`,           color: linkPct === 100 ? TOM.sucesso.text : TOM.alerta.text, mono: false },
              ].map(s => (
                <div key={s.l} style={{ backgroundColor: N.n3, border: `1px solid ${T.border}`, borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: s.color, fontFamily: s.mono ? FONT.mono : FONT.display, lineHeight: 1 }}>{s.v}</div>
                  <div style={{ fontSize: 10, color: T.second, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 4 }}>{s.l}</div>
                </div>
              ))}
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 11, color: T.second, fontWeight: 600 }}>Vinculação</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: linkPct === 100 ? TOM.sucesso.text : TOM.alerta.text }}>{linked}/{allItems.length}</span>
              </div>
              <div style={{ height: 5, backgroundColor: T.border, borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${linkPct}%`, backgroundColor: linkPct === 100 ? TOM.sucesso.text : TOM.alerta.text, borderRadius: 999, transition: 'width 0.4s' }} />
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
                { chave: 'qtd-invalida', cor: TOM.perigo.text },
                { chave: 'repetida-na-planilha', cor: TOM.perigo.text },
                { chave: 'sem-patrocinador', cor: TOM.alerta.text },
                { chave: 'sem-medida', cor: TOM.perigo.text },
                { chave: 'm2-nao-fecha', cor: TOM.perigo.text },
                { chave: 'sem-material', cor: TOM.alerta.text },
                { chave: 'ja-existe', cor: TOM.perigo.text },
              ];
              return (
                <div>
                  <div style={{ fontSize: 11, color: T.second, fontWeight: 600, marginBottom: 6 }}>Antes de importar</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {baldes.map(({ chave, cor }) => {
                      const n = naBusca.filter(i => defeitosDaLinha(i, chavesDoEvento, repetidasDaPlanilha).includes(chave)).length;
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
                            border: `1px solid ${ligado ? T.text : T.border}`,
                            backgroundColor: ligado ? T.text : T.surface,
                            color: ligado ? T.surface : T.strong,
                            opacity: vazio ? 0.45 : 1,
                            cursor: vazio ? 'default' : 'pointer',
                            font: 'inherit', fontSize: 11, fontWeight: 600,
                          }}
                        >
                          <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: ligado ? T.surface : cor, flexShrink: 0 }} />
                          <span style={{ flex: 1, minWidth: 0 }}>{DEFEITO_LABEL[chave]}</span>
                          <span style={{ fontFamily: FONT.mono, fontWeight: 700 }}>{n}</span>
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
      <div style={{ padding: '10px 12px', backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: 8, display: 'flex', gap: 8 }}>
        <AlertTriangle style={{ width: 13, height: 13, color: TOM.alerta.text, flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 10, color: TOM.alerta.text, lineHeight: 1.6 }}>
          <strong style={{ color: TOM.alerta.text }}>Formato NORTE:</strong><br />
          item · qtde · material · acabamento
        </div>
      </div>

      </div>

      {/* PÉ FIXO: o botão de importar — o fim da tarefa — nunca sai de vista. */}
      <div style={{ flexShrink: 0, padding: '12px 18px 18px', borderTop: `1px solid ${N.n3}`, backgroundColor: T.surface }}>
      {!importPreviewItems ? (
        <Botao
          variante="primario"
          tamanho="toque"
          larguraCheia
          icone={List}
          disabled={!importFile}
          carregando={previewXlsxPending}
          motivo={!importFile ? 'Escolha a planilha acima.' : undefined}
          alinharMotivo="center"
          onClick={() => { if (importFile) onPreview(importFile); }}
          data-testid="button-preview-import"
        >
          {previewXlsxPending ? 'Processando...' : 'Pré-visualizar Peças'}
        </Botao>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* AS LINHAS QUE FICARAM DE FORA. Antes sumiam caladas (linha sem
              quantidade, quantidade zero ou negativa): a pessoa contava as
              peças da planilha, contava as do preview, e não batia. */}
          {ignoradas.length > 0 && (
            <div
              data-testid="aviso-linhas-ignoradas"
              style={{ padding: '10px 12px', borderRadius: 8, background: N.n2, border: `1px solid ${T.border}`, fontSize: 11, color: T.strong, lineHeight: 1.5 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 700, color: T.text }}>
                  {ignoradas.length} {ignoradas.length === 1 ? 'linha da planilha ficou' : 'linhas da planilha ficaram'} de fora
                </span>
                <button
                  type="button"
                  onClick={() => setVerIgnoradas(v => !v)}
                  aria-expanded={verIgnoradas}
                  data-testid="button-ver-ignoradas"
                  style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, fontWeight: 700, color: T.accentText, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  {verIgnoradas ? 'Esconder' : 'Ver quais'}
                </button>
              </div>
              {verIgnoradas && (
                <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', maxHeight: 120, overflowY: 'auto' }}>
                  {ignoradas.map(ig => (
                    <li key={ig.linha}>Linha {ig.linha}: {ig.motivo}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {/* O AVISO DE REIMPORTAÇÃO — agora com nomes e com saída.

              Ele não BLOQUEIA: reimportar de propósito é legítimo (uma
              planilha corrigida, um lote que ficou de fora). O que ele
              faz é impedir que aconteça sem ninguém saber, e oferecer o
              atalho de quem já sabe — tirar as repetidas e importar o
              resto, que é o desfecho em quase todos os casos. */}
          {repetidas.length > 0 && (
            <div
              data-testid="aviso-reimportacao"
              style={{ padding: '10px 12px', borderRadius: 8, background: TOM.laranja.bg, border: `1px solid ${TOM.laranja.border}`, fontSize: 11, color: T.accentText, lineHeight: 1.5 }}
            >
              <div style={{ fontWeight: 700, marginBottom: 2, color: T.accentText }}>
                {repetidas.length} de {importPreviewItems.length} já {repetidas.length === 1 ? 'está' : 'estão'} neste evento
              </div>
              <div>
                {repetidas.slice(0, 3).map((r) => r.description || r.type || 'sem descrição').join(' · ')}
                {repetidas.length > 3 ? ` · e mais ${repetidas.length - 3}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <Botao
                  variante="secundario"
                  tamanho="sm"
                  onClick={() => setTriagem(triagem === 'ja-existe' ? null : 'ja-existe')}
                  aria-pressed={triagem === 'ja-existe'}
                  data-testid="button-ver-repetidas"
                  style={{ flex: 1 }}
                >
                  {triagem === 'ja-existe' ? 'Ver todas de novo' : `Ver as ${repetidas.length}`}
                </Botao>
                <Botao
                  variante="primario"
                  tamanho="sm"
                  onClick={() => {
                    const fora = new Set(repetidas.map((r) => r._id));
                    setImportPreviewItems(prev => prev ? prev.filter(r => !fora.has(r._id)) : prev);
                    // A triagem ligada em 'ja-existe' deixaria a tabela
                    // vazia logo depois da remoção — a lista some junto
                    // com o motivo de ela estar recortada.
                    if (triagem === 'ja-existe') setTriagem(null);
                    toast({ title: `${fora.size} ${fora.size === 1 ? 'peça repetida removida' : 'peças repetidas removidas'}`, description: 'Elas continuam no evento; só saíram desta importação.', variant: 'success' });
                  }}
                  data-testid="button-remover-repetidas"
                  style={{ flex: 1 }}
                >
                  Remover {repetidas.length === 1 ? 'a repetida' : `as ${repetidas.length}`}
                </Botao>
              </div>
            </div>
          )}
          <Botao
            variante="secundario"
            larguraCheia
            onClick={() => { setImportPreviewItems(null); setImportSearch(""); setTriagem(null); }}
          >
            Trocar arquivo
          </Botao>
          {/* O motivo do travamento já aparece logo abaixo, com a linha
              (motivo-importar-travado) — por isso sem `motivo` aqui. */}
          <Botao
            variante="primario"
            tamanho="toque"
            larguraCheia
            icone={Check}
            disabled={!importPreviewItems.length || comQtdInvalida.length > 0}
            carregando={confirmImportPending}
            onClick={() => { if (importPreviewItems.length > 0 && comQtdInvalida.length === 0) setEscolhendoDestino(true); }}
            data-testid="button-confirm-import"
          >
            {confirmImportPending
              ? 'Importando...'
              : <>Importar {importPreviewItems.length} {importPreviewItems.length === 1 ? 'peça' : 'peças'}</>}
          </Botao>
          {/* POR QUE O BOTÃO ESTÁ TRAVADO — à vista, com a linha. */}
          {comQtdInvalida.length > 0 && (
            <p data-testid="motivo-importar-travado" role="status" style={{ margin: 0, fontSize: 11, color: TOM.perigo.text, lineHeight: 1.45, textAlign: 'center', fontWeight: 600 }}>
              {comQtdInvalida.slice(0, 3).map((r) => `Linha ${r.linha ?? '?'}: quantidade mínima é 1`).join(' · ')}
              {comQtdInvalida.length > 3 ? ` · e mais ${comQtdInvalida.length - 3}` : ''}
              {' — corrija a quantidade ou tire a linha.'}
            </p>
          )}
          {/* O QUE ACONTECE DEPOIS — antes de clicar. Importar não é
              enviar: as peças caem no card de rascunhos do evento e só
              seguem para a vinculação quando alguém envia. */}
          <p data-testid="texto-depois-de-importar" style={{ margin: 0, fontSize: 11, color: T.apoio, lineHeight: 1.45, textAlign: 'center' }}>
            As peças entram em Rascunho no evento. Depois, envie para a vinculação.
          </p>
        </div>
      )}
      </div>
    </div>
  );
}
