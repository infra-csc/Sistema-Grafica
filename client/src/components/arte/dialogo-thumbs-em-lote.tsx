import { FileImage, Send, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, modalSurface, ModalHeader } from "@/components/modal-shell";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { EstadoVazio } from "@/components/ui/estados";
import { T, TOM } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { CartaoThumbEmLote } from "./cartao-thumb-em-lote";
import type { EventoDaPeca, PecaDaArte, PecaDaCorrecao } from "./tipos";
import type { LoteDeThumbs } from "./use-lote-de-thumbs";

/** "Envio de thumbs em lote": o vínculo é automático pelo número no nome do arquivo. */
export function DialogoThumbsEmLote({ lote, itemPorId, correcaoItems, events, groupOf, isMobile, dedo }: {
  lote: LoteDeThumbs;
  itemPorId: Map<string, PecaDaArte>;
  correcaoItems: PecaDaCorrecao[];
  events: EventoDaPeca[];
  groupOf: (type: string) => string;
  isMobile: boolean;
  dedo: boolean;
}) {
  const {
    showBulkThumbModal, isDragOverBulk, setIsDragOverBulk, bulkThumbEntries, setBulkThumbEntries,
    bulkThumbRunning, bulkThumbProgress, bulkThumbEventFilter, setBulkThumbEventFilter, bulkThumbEventOptions,
    bulkThumbPendentes, handleBulkThumbFilesAdded, handleBulkThumbUpload, handleBulkThumbSaveDraft, closeBulkThumbModal,
  } = lote;
  return (
    <Dialog open={showBulkThumbModal} onOpenChange={(open) => { if (!open) void closeBulkThumbModal(); }}>
      <DialogContent
        className={cn("p-0 gap-0", HIDE_NATIVE_CLOSE)}
        // O teto e a coluna flex vêm do `modalSurface` (a conta está lá). A
        // única coisa sobrescrita é a UNIDADE no celular: o corpo daqui tinha
        // um teto de 85dvh porque a barra de endereço do Chrome come ~60px que
        // o `vh` finge que existem — sem o `dvh` o rodapé com "Enviar thumbs"
        // ficaria atrás dela. O desconto de 48 (24 em cima, 24 embaixo) é o
        // mesmo da casa.
        style={{ ...modalSurface(980), maxHeight: isMobile ? "calc(100dvh - 48px)" : "calc(100vh - 48px)" }}
        // 40 imagens vinculadas e conferidas sumiam com um clique no overlay.
        onInteractOutside={e => { if (bulkThumbRunning || bulkThumbPendentes > 0) e.preventDefault(); }}
      >
        <DialogTitle className="sr-only">Envio de thumbs em lote</DialogTitle>
        <DialogDescription className="sr-only">Envio em lote de miniaturas de aprovação</DialogDescription>

        <ModalHeader
          icon={Upload}
          tint={T.accentText}
          title="Envio de thumbs em lote"
          subtitle="O vínculo é automático pelo número no nome do arquivo — ex.: 0277_aplique.jpg"
          onClose={() => void closeBulkThumbModal()}
        />

        {/* ── Body — 2 colunas no desktop; empilhado e rolável no mobile ──
            ALTURA: cabeçalho 93 + corpo de altura FIXA 520 no desktop = 613px,
            sem teto nenhum acima disso. Numa janela de 445 o Radix cortava
            108px em cima e 108 embaixo ao mesmo tempo — sumiam o título e a
            barra com "Enviar thumbs" juntos.
            Os 520 continuam sendo a altura DESEJADA do desenho de duas
            colunas; `flex: 0 1 auto` + `minHeight: 0` é o que deixa este bloco
            encolher abaixo deles quando o teto do `modalSurface` (100vh − 48)
            aperta. As colunas internas já rolam sozinhas. */}
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          height: isMobile ? undefined : 520,
          flex: isMobile ? '1 1 auto' : '0 1 auto',
          minHeight: 0,
          overflow: isMobile ? 'auto' : 'visible',
        }}>

          {/* ══════════════════════════════════════
              Left panel — upload + controles
          ══════════════════════════════════════ */}
          <div style={{ width: isMobile ? '100%' : 264, flexShrink: 0, borderRight: isMobile ? 'none' : `1px solid ${T.border}`, borderBottom: isMobile ? `1px solid ${T.border}` : 'none', display: 'flex', flexDirection: 'column', backgroundColor: T.bg }}>

            {/* ── Drop zone ── */}
            <div style={{ padding: '18px 18px 14px' }}>
              <input id="bulk-thumb-input" type="file" accept="image/*" multiple className="sr-only"
                onChange={e => { if (e.target.files) handleBulkThumbFilesAdded(e.target.files); e.target.value = ''; }} />
              {/* role/tabIndex/onKeyDown: um <div onClick> não é focável e o
                  input que ele dispara estava em display:none — a zona de
                  maior alavancagem do modal era exclusiva de mouse. O padrão
                  acessível já existia nos cards do book e nos stat cards. */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Adicionar imagens para envio em lote"
                data-testid="dropzone-bulk-thumb"
                style={{
                  padding: '20px 12px 18px', borderRadius: 12,
                  background: isDragOverBulk ? `linear-gradient(135deg,${TOM.sucesso.bg},${TOM.sucesso.bg})` : T.surface,
                  border: isDragOverBulk ? `2px dashed ${TOM.sucesso.text}` : `2px dashed ${T.bdark}`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer',
                  transition: 'all 0.15s',
                  boxShadow: isDragOverBulk ? '0 0 0 4px rgba(22,163,74,0.08)' : 'none',
                }}
                onDragOver={e => { e.preventDefault(); setIsDragOverBulk(true); }}
                onDragEnter={e => { e.preventDefault(); setIsDragOverBulk(true); }}
                // Ignora o dragleave dos filhos — o verde piscava ao mirar o texto.
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragOverBulk(false); }}
                onDrop={e => { e.preventDefault(); setIsDragOverBulk(false); if (e.dataTransfer.files.length) handleBulkThumbFilesAdded(e.dataTransfer.files); }}
                onClick={() => { const inp = document.getElementById('bulk-thumb-input') as HTMLInputElement; inp?.click(); }}
                onKeyDown={e => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  (document.getElementById('bulk-thumb-input') as HTMLInputElement | null)?.click();
                }}
              >
                {/* Chapado e neutro, como as outras zonas de upload da tela:
                    o gradiente laranja com sombra colorida só ganhava do
                    conteúdo. Ao arrastar, o verde continua dizendo "solte". */}
                <div style={{
                  width: 44, height: 44, borderRadius: 10,
                  background: isDragOverBulk ? TOM.sucesso.text : T.text,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background-color 0.15s',
                }}>
                  <Upload aria-hidden="true" style={{ width: 20, height: 20, color: T.surface }} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: isDragOverBulk ? TOM.sucesso.text : T.text, margin: '0 0 2px' }}>
                    {isDragOverBulk ? 'Solte aqui' : 'Arrastar ou clicar'}
                  </p>
                  <p style={{ fontSize: 11, color: T.apoio, margin: 0, letterSpacing: '0.03em' }}>JPG · PNG · WEBP · SVG</p>
                </div>
              </div>
            </div>

            {/* ── Divider ── */}
            <div style={{ margin: '0 18px', borderTop: `1px solid ${T.border}` }} />

            {/* ── Event filter ── */}
            <div style={{ padding: '14px 18px 0' }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.apoio, margin: '0 0 6px' }}>Evento</p>
              <div style={{ width: '100%' }}>
                <EventFilterDropdown
                  value={bulkThumbEventFilter}
                  onChange={setBulkThumbEventFilter}
                  allLabel="Todos os eventos"
                  options={bulkThumbEventOptions}
                />
              </div>
            </div>

            {/* ── Resumo — só aparece quando há arquivos com count > 0 ── */}
            {bulkThumbEntries.length > 0 && (() => {
              const rows = [
                { label: 'Vinculados',  count: bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending').length,  dot: TOM.sucesso.text, color: TOM.sucesso.text, bg: TOM.sucesso.bg, border: TOM.sucesso.border },
                { label: 'Sem vínculo', count: bulkThumbEntries.filter(e => !e.matchedItemId && e.status === 'pending').length, dot: TOM.alerta.dot, color: TOM.alerta.text, bg: TOM.alerta.bg, border: TOM.alerta.border },
                { label: 'Concluídos',  count: bulkThumbEntries.filter(e => e.status === 'done').length,                        dot: TOM.roxo.text, color: TOM.roxo.text, bg: TOM.roxo.bg, border: TOM.roxo.border },
                { label: 'Erro',        count: bulkThumbEntries.filter(e => e.status === 'error').length,                       dot: TOM.perigo.text, color: TOM.perigo.text, bg: TOM.perigo.bg, border: TOM.perigo.border },
              ].filter(s => s.count > 0);
              if (rows.length === 0) return null;
              return (
                <div style={{ padding: '14px 18px 0' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.apoio, margin: '0 0 8px' }}>Resumo</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {rows.map(s => (
                      <div key={s.label} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '6px 10px', borderRadius: 6,
                        backgroundColor: s.bg, border: `1px solid ${s.border}`,
                        transition: 'all 0.15s',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: s.dot, flexShrink: 0 }} />
                          <span style={{ fontSize: 11, fontWeight: 600, color: s.color }}>{s.label}</span>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 800, color: s.color, fontFamily: '"Space Grotesk", sans-serif', lineHeight: 1 }}>{s.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Spacer */}
            <div style={{ flex: 1 }} />
          </div>

          {/* ══════════════════════════════════════
              Right panel — lista de arquivos
          ══════════════════════════════════════ */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: T.bg }}>
            {bulkThumbEntries.length === 0 ? (
              /* ── Empty state ── */
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 18 }}>
                <EstadoVazio
                  icone={Upload}
                  titulo="Nenhuma imagem adicionada"
                  descricao={`Arraste para a área ${isMobile ? 'acima' : 'ao lado'} ou toque nela para escolher`}
                  acao={
                    <div style={{ display: 'flex', gap: 6 }}>
                      {['JPG', 'PNG', 'WEBP', 'SVG'].map(f => (
                        <Selo key={f} tom="neutro" tamanho="sm">{f}</Selo>
                      ))}
                    </div>
                  }
                />
              </div>
            ) : (
              <>
                {/* ── Panel header ── */}
                <div style={{ padding: '11px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, backgroundColor: T.surface }}>
                  {/* As quatro pílulas coloridas de contagem saíram daqui: o
                      "Resumo" do painel ao lado mostra os MESMOS quatro números,
                      com as mesmas cores — duas faixas de selos dizendo a mesma
                      coisa a 200px uma da outra. */}
                  <span style={{ fontSize: 13, fontWeight: 800, color: T.text, fontFamily: '"Space Grotesk", sans-serif' }}>
                    {bulkThumbEntries.length} {bulkThumbEntries.length === 1 ? 'arquivo' : 'arquivos'}
                  </span>
                  <span style={{ fontSize: 12, color: T.apoio, fontWeight: 600 }}>Confira o vínculo de cada imagem</span>
                </div>

                {/* ── Lista de cards (horizontal) ── */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {bulkThumbEntries.map(entry => (
                    <CartaoThumbEmLote
                      key={entry.id}
                      entry={entry}
                      lote={lote}
                      itemPorId={itemPorId}
                      correcaoItems={correcaoItems}
                      events={events}
                      groupOf={groupOf}
                      isMobile={isMobile}
                      dedo={dedo}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Rodapé unificado — ocupa toda a largura do modal ── */}
        {(() => {
          const readyCount = bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending').length;
          const doneCount  = bulkThumbEntries.filter(e => e.status === 'done').length;
          const isDisabled = bulkThumbRunning || readyCount === 0;
          const pctLote = bulkThumbProgress.total > 0
            ? Math.round((bulkThumbProgress.feitos / bulkThumbProgress.total) * 100)
            : 0;
          return (
            <div style={{
              borderTop: `1px solid ${T.border}`, padding: isMobile ? '12px 16px' : '12px 24px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              // Quebra no celular: a fileira da direita (Cancelar + dois botões
              // com a contagem no rótulo) pedia ~480px e, sem quebra, o
              // "Enviar N thumbs" saía pela borda do modal em 390px.
              flexWrap: isMobile ? 'wrap' : 'nowrap',
              backgroundColor: T.surface, borderRadius: '0 0 16px 16px', flexShrink: 0,
              position: 'relative',
            }}>
              {/* Progresso GLOBAL do lote. 60 imagens de alguns MB levam
                  minutos e o único sinal era o estado de cada card, que sai da
                  vista assim que a lista rola. */}
              {bulkThumbRunning && bulkThumbProgress.total > 0 && (
                <div
                  role="progressbar"
                  aria-valuenow={bulkThumbProgress.feitos}
                  aria-valuemin={0}
                  aria-valuemax={bulkThumbProgress.total}
                  aria-label="Progresso do envio em lote"
                  data-testid="progress-bulk-thumb"
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column' }}
                >
                  <div style={{ height: 4, background: T.border }}>
                    <div style={{ height: '100%', width: `${pctLote}%`, background: TOM.sucesso.text, transition: 'width 0.2s' }} />
                  </div>
                </div>
              )}
              {/* Esquerda: progresso ou limpar concluídos */}
              <div>
                {bulkThumbRunning && bulkThumbProgress.total > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: TOM.sucesso.text }}>
                    Enviando {bulkThumbProgress.feitos} de {bulkThumbProgress.total} ({pctLote}%)
                  </span>
                )}
                {doneCount > 0 && (
                  <Botao
                    variante="fantasma"
                    tamanho={dedo ? "toque" : "sm"}
                    onClick={() => setBulkThumbEntries(prev => prev.filter(e => {
                      if (e.status !== 'done') return true;
                      URL.revokeObjectURL(e.preview);
                      return false;
                    }))}
                  >Limpar {doneCount} enviado{doneCount !== 1 ? 's' : ''}</Botao>
                )}
              </div>

              {/* Direita: Cancelar → Salvar rascunho → Enviar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: isMobile ? 'wrap' : 'nowrap', justifyContent: 'flex-end', width: isMobile ? '100%' : undefined }}>
                {/* Cancelar com contorno, como nos outros rodapés da Arte.
                    aria-disabled e não disabled: o clique no meio do lote
                    AVISA ("aguarde o envio terminar") em vez de sumir mudo. */}
                <Botao
                  variante="secundario"
                  tamanho={dedo ? "toque" : "md"}
                  onClick={() => void closeBulkThumbModal()}
                  aria-disabled={bulkThumbRunning}
                  style={{ opacity: bulkThumbRunning ? 0.5 : 1 }}
                >
                  {/* Com tudo processado não há o que cancelar (rodada 4):
                      "Cancelar" ao lado de cards "OK" fazia perguntar se
                      fechar desfazia o envio. Não desfaz. */}
                  {bulkThumbEntries.length > 0 && bulkThumbPendentes === 0 && !bulkThumbRunning ? 'Fechar' : 'Cancelar'}
                </Botao>

                {/* Secundário (contorno neutro) — Salvar como rascunho. O
                    title diz o caso da Correção, que não tem rascunho: a
                    imagem vai pelo reenvio nos dois botões (rodada 4). */}
                <Botao
                  variante="secundario"
                  tamanho={dedo ? "toque" : "md"}
                  icone={FileImage}
                  onClick={handleBulkThumbSaveDraft}
                  disabled={isDisabled}
                  data-testid="button-bulk-thumb-save-draft"
                  title="Peça aguardando envio: só salva o thumb, sem enviar — ela continua na fila como rascunho. Peça da Correção não tem rascunho: a imagem vai como nova versão para quem ainda não aprovou."
                  style={{ flex: isMobile ? '1 1 auto' : undefined, fontWeight: 600 }}
                >
                  {/* Sem nada vinculado o rótulo limpo basta: "Salvar 0
                      thumbs" não informa, e o botão está desabilitado. */}
                  {readyCount > 0
                    ? `Salvar ${readyCount} ${readyCount === 1 ? 'thumb' : 'thumbs'} como rascunho`
                    : 'Salvar como rascunho'}
                </Botao>

                {/* Primário (tinta) — Enviar. Verde nesta tela é o ESTADO
                    "enviado" dos cards; o botão que ainda vai enviar não
                    veste a cor do resultado. */}
                <Botao
                  variante="primario"
                  tamanho={dedo ? "toque" : "md"}
                  icone={Send}
                  carregando={bulkThumbRunning}
                  onClick={handleBulkThumbUpload}
                  disabled={isDisabled}
                  data-testid="button-bulk-thumb-confirm"
                  title="Sobe cada imagem e manda a peça para a aprovação do patrocinador. Peça que está na Correção recebe a imagem como nova versão e volta para quem ainda não aprovou."
                  style={{ flex: isMobile ? '1 1 auto' : undefined }}
                >
                  {bulkThumbRunning ? 'Enviando…' : readyCount > 0 ? `Enviar ${readyCount} para aprovação` : 'Enviar para aprovação'}
                </Botao>
              </div>
            </div>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}
