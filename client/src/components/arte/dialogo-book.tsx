import { Check, CheckCircle, ExternalLink, FileText, RefreshCw, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, modalSurface, ModalHeader, ModalFooter } from "@/components/modal-shell";
import { ComentarioDoBook } from "@/components/comentario-do-book";
import { FilterSelect } from "@/components/filter-select";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { EstadoVazio } from "@/components/ui/estados";
import { T, TOM, N, FS, FONT } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { hrefSeguro } from "@shared/url-segura";
import type { BookDaArte } from "./use-book-da-arte";

/** "Subir book": o PDF pronto do evento e as peças que ele cobre. */
export function DialogoBook({ book, groupOf, dedo }: {
  book: BookDaArte;
  groupOf: (type: string) => string;
  dedo: boolean;
}) {
  const {
    showBookModal, setShowBookModal, existingBookUrl, bookEventId, setBookEventId, bookEventOptions,
    bookFileUrl, bookFileName, bookUploading, isDragOverBook, setIsDragOverBook, handleBookFile,
    bookEventPieces, bookSelectedIds, setBookSelectedIds, bookComentario, setBookComentario,
    bookPatrocinadores, bookComentarioFalta, saveBookMutation,
  } = book;
  return (
    <Dialog open={showBookModal} onOpenChange={setShowBookModal}>
      <DialogContent className={cn("p-0 gap-0", HIDE_NATIVE_CLOSE)} style={modalSurface(600)}>
        <DialogTitle className="sr-only">Subir book de aprovação</DialogTitle>
        <DialogDescription className="sr-only">Envie o PDF do book e selecione as peças que ele cobre</DialogDescription>

        {/* Cabeçalho da casca compartilhada — mesma altura, mesmo tamanho de
            título e mesmo botão de fechar dos outros modais da tela. */}
        <ModalHeader
          icon={FileText}
          tint={T.accentText}
          title={existingBookUrl ? 'Atualizar book (PDF)' : 'Subir book (PDF)'}
          // "serão enviadas aos patrocinadores" prometia um destino que o
          // servidor não tem (rodada 4): salvar publica o book no evento e o
          // aviso por e-mail vai para a EQUIPE (avisarBookPorEmail) — o toast
          // diz para quem saiu.
          subtitle={existingBookUrl
            ? 'Substitua o PDF atual e confirme as peças cobertas — ao salvar, a equipe é avisada por e-mail.'
            : 'Envie o layout pronto e marque as peças que ele cobre — ao salvar, a equipe é avisada por e-mail.'}
          onClose={() => setShowBookModal(false)}
        />

        {/* ── Body ── */}
        {/* ALTURA: o `maxHeight: '62vh'` daqui era um desconto CHUTADO — 62% da
            viewport para o corpo, sem relação com o que cabeçalho e rodapé
            realmente ocupam. Media 93 + 62vh + 120: em 445 de altura dava
            489px de modal contra 397 disponíveis, e o Radix cortava 46px de
            cada lado. É o mesmo erro estrutural que a Gestão de Prazos
            abandonou: nenhum número fixo acerta 1080 e 445 ao mesmo tempo.
            Agora o teto é do DialogContent (`100vh − 48`, via `modalSurface`) e
            este corpo fica com o que sobrar depois do cabeçalho e do rodapé
            MEDIDOS pelo navegador — `flex: 1 1 auto` + `minHeight: 0`. */}
        <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 22, overflowY: 'auto', flex: '1 1 auto', minHeight: 0, backgroundColor: T.bg }}>

          {/* Evento */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.apoio, display: 'block', marginBottom: 6 }}>Evento</label>
            <FilterSelect
              fullWidth hideWhenEmpty={false} showAllLabelWhenEmpty
              label="Evento" allLabel="Selecione um evento"
              value={bookEventId || "all"} onChange={v => setBookEventId(v === "all" ? "" : v)}
              options={bookEventOptions}
              searchPlaceholder="Buscar evento..." emptyText="Nenhum evento com peças na Arte."
            />
          </div>

          {/* Book atual — só aparece quando já existe um book para o evento */}
          {existingBookUrl && !bookFileUrl && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.apoio, display: 'block', marginBottom: 6 }}>Book atual</label>
              {/* Neutro e chapado: o book atual é CONTEXTO (o que existe hoje),
                  não alerta — o ladrilho em gradiente laranja com sombra era o
                  objeto mais saturado do modal, acima do próprio upload. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, border: `1px solid ${T.border}`, background: T.surface, flexWrap: 'wrap' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: N.n2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FileText aria-hidden="true" style={{ width: 14, height: 14, color: T.strong }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: 0 }}>Este evento já tem book</p>
                  <p style={{ fontSize: 12, color: T.apoio, margin: '1px 0 0' }}>O PDF que você subir abaixo substitui o atual</p>
                </div>
                <a
                  href={hrefSeguro(existingBookUrl)} target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 32, fontSize: 12, fontWeight: 600, color: T.text, textDecoration: 'none', background: T.surface, border: `1px solid ${T.bdark}`, borderRadius: 8, padding: '0 10px', flexShrink: 0, whiteSpace: 'nowrap' }}
                >
                  <ExternalLink aria-hidden="true" style={{ width: 12, height: 12 }} /> Ver book atual
                </a>
              </div>
            </div>
          )}

          {/* Upload do PDF */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.apoio, display: 'block', marginBottom: 6 }}>
              {existingBookUrl ? 'Novo PDF (substituição)' : 'Arquivo do book'}
            </label>
            {/* Drag & drop real: a zona dizia "Arrastar ou clicar" mas só o
                clique funcionava — mesmo padrão dos outros dropzones da tela. */}
            <label style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 12,
              border: `1.5px dashed ${isDragOverBook ? T.apoio : bookFileUrl ? TOM.sucesso.border : T.bdark}`,
              background: isDragOverBook ? N.n2 : T.surface,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
              onMouseEnter={e => { if (!bookFileUrl && !isDragOverBook) { (e.currentTarget as HTMLLabelElement).style.borderColor = T.muted; (e.currentTarget as HTMLLabelElement).style.background = T.bg; } }}
              onMouseLeave={e => { if (!bookFileUrl && !isDragOverBook) { (e.currentTarget as HTMLLabelElement).style.borderColor = T.bdark; (e.currentTarget as HTMLLabelElement).style.background = T.surface; } }}
              onDragOver={e => { e.preventDefault(); setIsDragOverBook(true); }}
              onDragEnter={e => { e.preventDefault(); setIsDragOverBook(true); }}
              // Ignora o dragleave dos filhos (ícone, textos) — o destaque piscava.
              onDragLeave={e => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragOverBook(false); }}
              onDrop={e => {
                e.preventDefault();
                setIsDragOverBook(false);
                if (bookUploading) return;
                void handleBookFile(e.dataTransfer.files?.[0]); // valida .pdf lá dentro
              }}
            >
              {/* Ladrilho chapado: dois gradientes laranja com sombra colorida
                  para um ícone de 18px. Carregado, o sinal é o VERDE do
                  "pronto" (o mesmo das outras zonas de upload), não laranja. */}
              <div style={{ width: 40, height: 40, borderRadius: 12, background: bookFileUrl ? TOM.sucesso.bg : T.surface, border: `1px solid ${bookFileUrl ? TOM.sucesso.border : T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                {bookUploading
                  ? <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${T.border}`, borderTopColor: T.text, animation: 'spin 0.8s linear infinite' }} />
                  : bookFileUrl
                    ? <CheckCircle aria-hidden="true" style={{ width: 18, height: 18, color: TOM.sucesso.text }} />
                    : existingBookUrl
                      ? <RefreshCw aria-hidden="true" style={{ width: 16, height: 16, color: T.strong }} />
                      : <Upload aria-hidden="true" style={{ width: 18, height: 18, color: T.strong }} />
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {bookUploading ? 'Enviando arquivo…' : bookFileName || (existingBookUrl ? 'Escolher o novo PDF…' : 'Arraste o PDF aqui ou clique para escolher')}
                </p>
                {!bookFileUrl && !bookUploading && (
                  <p style={{ fontSize: 12, color: T.apoio, margin: '2px 0 0' }}>Só arquivos .pdf, de qualquer tamanho</p>
                )}
                {bookFileUrl && (
                  <p style={{ fontSize: 12, color: TOM.sucesso.text, margin: '2px 0 0', fontWeight: 600 }}>Carregado — marque as peças e salve</p>
                )}
              </div>
              {bookFileUrl && <span aria-hidden="true" style={{ fontSize: 12, fontWeight: 600, color: T.text, flexShrink: 0, padding: '5px 10px', border: `1px solid ${T.bdark}`, borderRadius: 8, background: T.surface }}>Trocar</span>}
              <input type="file" accept="application/pdf,.pdf" className="sr-only"
                onChange={e => { handleBookFile(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </div>

          {/* Peças do evento */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.apoio }}>Peças no book</span>
                {bookEventPieces.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 800, color: T.text, fontFamily: '"Space Grotesk", sans-serif' }}>
                    {bookSelectedIds.size}<span style={{ fontWeight: 500, color: T.apoio }}> / {bookEventPieces.length}</span>
                  </span>
                )}
              </div>
              {bookEventPieces.length > 0 && (
                <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  {/* minHeight 32: com padding de 3px os dois atalhos tinham
                      ~20px de alvo, abaixo do mínimo de 24. */}
                  <button type="button" onClick={() => setBookSelectedIds(new Set(bookEventPieces.map((i) => i.id)))}
                    style={{ background: 'none', border: 'none', minHeight: 32, padding: '0 8px', fontSize: 12, fontWeight: 700, color: T.accentText, cursor: 'pointer', borderRadius: 6, transition: 'color 0.1s', textDecoration: 'underline', textDecorationColor: 'transparent', textUnderlineOffset: '2px' }}
                    onMouseEnter={e => { e.currentTarget.style.textDecorationColor = T.accentText; }}
                    onMouseLeave={e => { e.currentTarget.style.textDecorationColor = 'transparent'; }}
                  >Todas</button>
                  <span style={{ color: T.bdark, userSelect: 'none' }}>·</span>
                  <button type="button" onClick={() => setBookSelectedIds(new Set())}
                    style={{ background: 'none', border: 'none', minHeight: 32, padding: '0 8px', fontSize: 12, fontWeight: 700, color: T.apoio, cursor: 'pointer', borderRadius: 6, transition: 'color 0.1s', textDecoration: 'underline', textDecorationColor: 'transparent', textUnderlineOffset: '2px' }}
                    onMouseEnter={e => { e.currentTarget.style.textDecorationColor = T.muted; }}
                    onMouseLeave={e => { e.currentTarget.style.textDecorationColor = 'transparent'; }}
                  >Nenhuma</button>
                </div>
              )}
            </div>
            <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, maxHeight: 240, overflowY: 'auto', backgroundColor: T.surface }}>
              {bookEventPieces.length === 0 ? (
                <EstadoVazio compacto icone={FileText} titulo="Nenhum evento escolhido" descricao="Selecione um evento para ver as peças disponíveis." />
              ) : bookEventPieces.map((item, idx: number) => {
                const on = bookSelectedIds.has(item.id);
                const isLast = idx === bookEventPieces.length - 1;
                const toggleBookPiece = () => setBookSelectedIds(prev => { const n = new Set(prev); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; });
                return (
                  <div key={item.id}
                    // Mesmo padrão de checkbox acessível do export-pdf-dialog.
                    role="checkbox"
                    aria-checked={on}
                    aria-label={`${item.displayId} — ${item.type}`}
                    tabIndex={0}
                    onClick={toggleBookPiece}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleBookPiece(); } }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: isLast ? 'none' : `1px solid ${N.n3}`, cursor: 'pointer', background: on ? TOM.laranja.bg : T.surface, transition: 'background 0.1s' }}
                    onMouseEnter={e => { if (!on) e.currentTarget.style.background = T.bg; }}
                    onMouseLeave={e => { e.currentTarget.style.background = on ? TOM.laranja.bg : T.surface; }}
                  >
                    <div style={{ width: 16, height: 16, borderRadius: 6, flexShrink: 0, border: `2px solid ${on ? T.accent : T.bdark}`, background: on ? T.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }}>
                      {on && <Check style={{ width: 9, height: 9, color: T.surface }} />}
                    </div>
                    <span style={{ fontFamily: FONT.display, fontSize: FS.small, fontWeight: 700, color: on ? T.accentText : T.second, background: on ? TOM.laranja.border : N.n3, padding: '2px 7px', borderRadius: 6, flexShrink: 0, letterSpacing: '0.01em', transition: 'all 0.12s' }}>{item.displayId}</span>
                    <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                        {groupOf(item.type) && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: on ? T.accentText : T.second, background: on ? TOM.laranja.bg : N.n3, border: `1px solid ${on ? TOM.laranja.border : T.border}`, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: '0.02em', transition: 'all 0.12s' }}>{groupOf(item.type)}</span>
                        )}
                        <span style={{ fontSize: 12, fontWeight: 600, color: on ? T.text : T.apoio, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere', transition: 'color 0.1s' }}>{item.type}</span>
                      </div>
                      {item.description && item.description !== item.type && (
                        <span style={{ fontSize: 11, color: T.apoio, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{item.description}</span>
                      )}
                    </span>
                    {item.bookUrl && (
                      <Selo forma="retangulo" title="Esta peça já está no book atual" style={{ marginLeft: 'auto', flexShrink: 0, fontWeight: 600, padding: '2px 8px', color: T.apoio }}>no book atual</Selo>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* O que mudou — obrigatório quando o evento já tem book */}
          <ComentarioDoBook
            republicacao={!!existingBookUrl}
            valor={bookComentario}
            aoMudar={setBookComentario}
            patrocinadores={bookPatrocinadores}
          />
        </div>

        <ModalFooter>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* O QUE FALTA para salvar, escrito (rodada 4) — a mesma conta do
              `title` do botão, que só aparecia no hover. */}
          {!saveBookMutation.isPending && (!bookFileUrl || bookSelectedIds.size === 0 || bookComentarioFalta) && (
            <span data-testid="book-falta" style={{ marginRight: 'auto', fontSize: 12, color: T.apoio, lineHeight: 1.4 }}>
              {!bookFileUrl ? 'Falta o PDF do book.' : bookSelectedIds.size === 0 ? 'Marque ao menos uma peça.' : 'Escreva o que mudou nesta versão.'}
            </span>
          )}
          {/* Cancelar com contorno: mesma gramática dos outros rodapés da Arte. */}
          <Botao variante="secundario" tamanho={dedo ? "toque" : "md"} onClick={() => setShowBookModal(false)}>Cancelar</Botao>
          {/* O que falta para salvar já está escrito à esquerda (book-falta). */}
          <Botao
            variante="primario"
            tamanho={dedo ? "toque" : "md"}
            icone={existingBookUrl ? RefreshCw : FileText}
            carregando={saveBookMutation.isPending}
            onClick={() => saveBookMutation.mutate()}
            disabled={!bookFileUrl || bookSelectedIds.size === 0 || bookComentarioFalta}
            title={!bookFileUrl ? 'Adicione o arquivo PDF antes de salvar' : bookSelectedIds.size === 0 ? 'Selecione ao menos uma peça' : bookComentarioFalta ? 'Este evento já tem book — escreva o que mudou nesta versão' : undefined}
          >
            {saveBookMutation.isPending
              ? 'Salvando…'
              : existingBookUrl
                ? `Atualizar book — ${bookSelectedIds.size} peça${bookSelectedIds.size !== 1 ? 's' : ''}`
                : `Salvar book — ${bookSelectedIds.size} peça${bookSelectedIds.size !== 1 ? 's' : ''}`}
          </Botao>
          </div>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
