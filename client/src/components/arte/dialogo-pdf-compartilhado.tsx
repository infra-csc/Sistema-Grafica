import type { Dispatch, SetStateAction } from "react";
import { CheckCircle, FileImage, FileText, Send, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, modalSurface, ModalHeader, ModalFooter, FreezeWhileClosing } from "@/components/modal-shell";
import { FileUploader } from "@/components/FileUploader";
import { Botao } from "@/components/ui/botao";
import type { useToast } from "@/hooks/use-toast";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { miniatura } from "@/lib/miniatura";
import { T, TOM, N } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { PecaDaArte } from "./tipos";
import type { AcoesDaArte } from "./use-acoes-da-arte";
import type { UploadsDaArte } from "./use-uploads-da-arte";

/** "PDF compartilhado": um PDF vira o thumb das peças marcadas, que vão juntas para aprovação. */
export function DialogoPdfCompartilhado({
  showBulkDialog, setShowBulkDialog, sharedPdfUrl, setSharedPdfUrl, selectedItemIds, itemPorId,
  getUploadUrl, toast, submitBulkForApprovalMutation, handleBulkSubmit, isMobile, dedo,
}: {
  showBulkDialog: boolean;
  setShowBulkDialog: Dispatch<SetStateAction<boolean>>;
  sharedPdfUrl: string;
  setSharedPdfUrl: Dispatch<SetStateAction<string>>;
  selectedItemIds: Set<string>;
  itemPorId: Map<string, PecaDaArte>;
  getUploadUrl: UploadsDaArte["getUploadUrl"];
  toast: ReturnType<typeof useToast>["toast"];
  submitBulkForApprovalMutation: AcoesDaArte["submitBulkForApprovalMutation"];
  handleBulkSubmit: () => void;
  isMobile: boolean;
  dedo: boolean;
}) {
  return (
    <Dialog open={showBulkDialog} onOpenChange={(open) => { if (!open) { setShowBulkDialog(false); setSharedPdfUrl(""); } }}>
      <DialogContent className={cn("p-0 gap-0", HIDE_NATIVE_CLOSE)} style={modalSurface(600)}>
        {/* POR QUE congelar aqui: o onSuccess do envio em lote invalida TRÊS
            chaves de /api/items, fecha o modal, esvazia `selectedItemIds` e
            `sharedPdfUrl` e toasta — tudo no mesmo commit. Os dois estados
            esvaziados são exatamente o que o modal mostra: a lista de itens
            e o PDF anexado. Sem congelar, o modal vira "Itens Selecionados
            (00)" sem PDF durante toda a animação de saída, enquanto os
            renders da invalidação batem na subárvore em desmontagem — o laço
            do React #185. Mecanismo por extenso em
            components/modal-shell.tsx. */}
        <FreezeWhileClosing open={showBulkDialog}>
        <DialogTitle className="sr-only">PDF compartilhado</DialogTitle>
        <DialogDescription className="sr-only">Vincular um PDF a múltiplas peças</DialogDescription>

        <ModalHeader
          icon={Upload}
          tint={TOM.info.text}
          title="PDF compartilhado"
          subtitle="Um PDF vira o thumb de todas as peças selecionadas, e elas vão juntas para a aprovação do patrocinador"
          onClose={() => { setShowBulkDialog(false); setSharedPdfUrl(""); }}
        />
        {/* ALTURA: cabeçalho 93 + este corpo ~380 (a lista de itens já tem teto
            próprio de 280 e o painel do PDF fica ao lado) + rodapé 120 = 593px.
            Em 445 de altura cortava 98px de cada lado, com o "Enviar lote"
            fora da tela. `flex: 1 1 auto` + `minHeight: 0` entrega a este
            corpo o que sobrar do teto do `modalSurface`; a lista de 280 segue
            rolando por conta própria dentro dele. */}
        <div style={{ padding: '24px 32px', overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>

          {/* 2 colunas no desktop; 1 no mobile para não espremer as listas */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 20 : 32 }}>
            {/* Left: items list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Rótulo cinza como os dos outros modais (era marrom-laranja
                  #9d4300, uma sexta cor de rótulo na tela) e sem o zero à
                  esquerda: "(05)" é notação de painel de máquina, não conta. */}
              <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.apoio, margin: 0 }}>
                {selectedItemIds.size} {selectedItemIds.size === 1 ? 'peça selecionada' : 'peças selecionadas'}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                {Array.from(selectedItemIds).map((itemId, idx) => {
                  const item = itemPorId.get(itemId);
                  if (!item) return null;
                  const isFirst = idx === 0;
                  return (
                    <div key={itemId} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      // Sem o filete laranja na PRIMEIRA linha: ele destacava
                      // uma peça que não tem nada de diferente das outras.
                      backgroundColor: T.bg, border: `1px solid ${N.n3}`, borderRadius: 8,
                    }}>
                      <div style={{ width: 40, height: 40, backgroundColor: T.bdark, borderRadius: 6, flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {item.approvalThumbUrl ? (
                          <img loading="lazy" decoding="async" src={miniatura(item.approvalThumbUrl)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <FileImage style={{ width: 16, height: 16, color: T.apoio }} />
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: T.text, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>
                          {item.displayId} · {item.type}
                        </p>
                        <p style={{ fontSize: 11, color: T.apoio, margin: 0 }}>
                          {item.event?.name || 'Sem evento'}{item.sponsors?.[0]?.name ? ` • ${item.sponsors[0].name}` : ''}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: upload zone */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.apoio, margin: '0 0 16px' }}>
                PDF compartilhado
              </h3>
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                backgroundColor: T.bg, borderRadius: 12, border: `1.5px dashed ${T.bdark}`,
                padding: 24, textAlign: 'center', transition: 'border-color 0.15s', minHeight: isMobile ? 160 : 200
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = T.muted; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = T.bdark; }}
              >
                {sharedPdfUrl ? (
                  <>
                    <div style={{ width: 48, height: 48, backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                      <CheckCircle aria-hidden="true" style={{ width: 22, height: 22, color: TOM.sucesso.text }} />
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: '0 0 4px' }}>PDF carregado</p>
                    <a href={sharedPdfUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: T.strong, textDecoration: 'underline', textUnderlineOffset: 2, display: 'block', marginBottom: 12 }}>
                      Conferir o PDF
                    </a>
                    {/* Botões em caixa normal e 36px: eram pílulas de 32px em
                        versalete de 10px com espaçamento largo — o menor texto
                        do modal justamente na única ação da coluna. */}
                    <FileUploader
                      onGetUploadParameters={getUploadUrl}
                      onComplete={(result) => { setSharedPdfUrl(convertGCSUrlToLocalPath(result.url)); toast({ title: "PDF trocado", description: "O novo PDF vale para todas as peças selecionadas.", variant: "success" }); }}
                      onError={(error) => { toast({ title: "Erro no upload", description: error.message, variant: "destructive" }); }}
                      accept=".pdf,application/pdf"
                      buttonVariant="ghost"
                      buttonClassName="h-9 text-[13px] font-semibold bg-white text-stone-900 border border-stone-300 rounded-lg px-4 hover:bg-stone-50 hover:text-stone-900"
                    >
                      Trocar PDF
                    </FileUploader>
                  </>
                ) : (
                  <>
                    <div style={{ width: 48, height: 48, backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                      <FileText aria-hidden="true" style={{ width: 22, height: 22, color: T.strong }} />
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: '0 0 4px' }}>Suba o PDF</p>
                    <p style={{ fontSize: 12, color: T.apoio, margin: '0 0 14px', padding: '0 8px' }}>Ele vale para todas as peças {isMobile ? 'acima' : 'à esquerda'}.</p>
                    <FileUploader
                      onGetUploadParameters={getUploadUrl}
                      onComplete={(result) => { setSharedPdfUrl(convertGCSUrlToLocalPath(result.url)); toast({ title: "PDF carregado", description: "Confira as peças e envie o lote.", variant: "success" }); }}
                      onError={(error) => { toast({ title: "Erro no upload", description: error.message, variant: "destructive" }); }}
                      accept=".pdf,application/pdf"
                      buttonVariant="ghost"
                      buttonClassName="h-10 text-[13px] font-semibold bg-stone-900 text-white rounded-lg px-4 hover:bg-stone-700 hover:text-white"
                    >
                      Escolher PDF
                    </FileUploader>
                  </>
                )}
              </div>
            </div>
          </div>

        </div>
        <ModalFooter>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
            {/* QUEM FICA DE FORA, ANTES do clique (rodada 4). A seleção
                atravessa abas, e só "aguardando envio" aceita o PDF; o aviso
                existia só como toast DEPOIS de enviar. */}
            {(() => {
              const fora = Array.from(selectedItemIds).filter(id => itemPorId.get(id)?.status !== 'awaiting_submission').length;
              if (fora === 0) return null;
              return (
                <span data-testid="aviso-fora-do-lote" style={{ marginRight: 'auto', fontSize: 12, color: TOM.alerta.text, lineHeight: 1.4 }}>
                  {fora} {fora === 1 ? 'selecionada não está' : 'selecionadas não estão'} aguardando envio e {fora === 1 ? 'fica' : 'ficam'} fora
                </span>
              );
            })()}
            {/* Cancelar com contorno, como nos modais de dispensa e devolução:
                transparente e sem borda ele lia como legenda, não como saída. */}
            <Botao variante="secundario" tamanho={dedo ? "toque" : "md"} onClick={() => { setShowBulkDialog(false); setSharedPdfUrl(""); }}>
              Cancelar
            </Botao>
            {/* O rótulo diz QUANTAS vão — as mesmas que o envio aceita (só
                aguardando envio; ver handleBulkSubmit). Sem PDF, o porquê
                aparece embaixo do botão, e não só no `title`. */}
            <Botao
              variante="primario"
              tamanho={dedo ? "toque" : "md"}
              icone={Send}
              carregando={submitBulkForApprovalMutation.isPending}
              disabled={!sharedPdfUrl}
              motivo="Suba o PDF para liberar o envio"
              alinharMotivo="end"
              onClick={handleBulkSubmit}
              data-testid="button-submit-bulk-pdf"
            >
              {submitBulkForApprovalMutation.isPending ? 'Enviando…' : (() => {
                const n = Array.from(selectedItemIds).filter(id => itemPorId.get(id)?.status === 'awaiting_submission').length;
                return n > 0 ? `Enviar ${n} para aprovação` : 'Enviar lote';
              })()}
            </Botao>
          </div>
        </ModalFooter>
        </FreezeWhileClosing>
      </DialogContent>
    </Dialog>
  );
}
