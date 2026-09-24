import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { CheckCircle, FileImage, Send, Upload } from "lucide-react";
import { FileUploader } from "@/components/FileUploader";
import { Botao } from "@/components/ui/botao";
import type { useToast } from "@/hooks/use-toast";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { T, TOM, N, FS, FONT } from "@/lib/theme";
import { ehMolde } from "@shared/molde";
import { BotaoBuscarArte } from "./botao-buscar-arte";
import { KBD } from "./constantes";
import type { BuscaDeArte, PecaDaArte } from "./tipos";
import type { AcoesDaArte } from "./use-acoes-da-arte";
import type { UploadsDaArte } from "./use-uploads-da-arte";

/**
 * O thumb de aprovação da peça AGUARDANDO ENVIO, no modal: a zona de upload
 * (arrastar, escolher, colar ou reaproveitar) e, com o thumb no lugar, o envio
 * para aprovação e o rascunho.
 */
export function PainelDoThumbDeAprovacao({
  selectedItem, zonaDoThumbRef, approvalThumbUrl, approvalThumbPreview, savedApprovalThumbUrl, thumbJustSaved,
  thumbEnviando, isPasteUploading, isDragOver, setIsDragOver, iniciarEnvioDoThumb, concluirEnvioDoThumb, desfazerEnvioDoThumb,
  uploadFileDirect, getUploadUrl, focarEnvioParaAprovacao, toast, setBuscaDeArte,
  submitForApprovalMutation, saveThumbDraftMutation, handleSubmitForApproval, handleSaveThumbDraft, isMobile, dedo,
}: {
  selectedItem: PecaDaArte;
  zonaDoThumbRef: MutableRefObject<HTMLElement | null>;
  approvalThumbUrl: string;
  approvalThumbPreview: string;
  savedApprovalThumbUrl: string;
  thumbJustSaved: boolean;
  thumbEnviando: boolean;
  isPasteUploading: boolean;
  isDragOver: boolean;
  setIsDragOver: Dispatch<SetStateAction<boolean>>;
  iniciarEnvioDoThumb: UploadsDaArte["iniciarEnvioDoThumb"];
  concluirEnvioDoThumb: UploadsDaArte["concluirEnvioDoThumb"];
  desfazerEnvioDoThumb: UploadsDaArte["desfazerEnvioDoThumb"];
  uploadFileDirect: UploadsDaArte["uploadFileDirect"];
  getUploadUrl: UploadsDaArte["getUploadUrl"];
  focarEnvioParaAprovacao: () => void;
  toast: ReturnType<typeof useToast>["toast"];
  setBuscaDeArte: Dispatch<SetStateAction<BuscaDeArte | null>>;
  submitForApprovalMutation: AcoesDaArte["submitForApprovalMutation"];
  saveThumbDraftMutation: AcoesDaArte["saveThumbDraftMutation"];
  handleSubmitForApproval: () => void;
  handleSaveThumbDraft: () => void;
  isMobile: boolean;
  dedo: boolean;
}) {
  return (
    <section ref={zonaDoThumbRef} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Section header */}
      {/* Título em caixa normal e "obrigatório" como texto de apoio,
          não selo vermelho em versalete: era o elemento mais alarmante
          do modal para dizer uma regra que o botão travado e o toast
          já explicam. Vermelho fica para o que deu errado. */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: FS.title, letterSpacing: '-0.02em', color: T.text, margin: 0 }}>
          Thumb de aprovação
        </h3>
        {/* O que É o thumb, e não só que é obrigatório (rodada 4):
            "thumb × arquivo final" era a dúvida número um de quem
            chega — e a regra do obrigatório o botão já ensina. */}
        <span style={{ fontSize: 12, color: T.second, fontWeight: 600 }}>
          a imagem que o patrocinador vai aprovar
        </span>
      </div>

      {approvalThumbPreview && approvalThumbPreview.trim() !== "" ? (
        /* State A2: thumb uploaded */
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Superfície BRANCA com hairline, no lugar do "vidro" lilás
              com blur: o desfoque não tinha nada atrás para desfocar
              (o fundo do modal é liso) e o lilás fazia o bloco de
              decisão parecer um aviso. */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ width: 96, height: 64, borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.border}`, flexShrink: 0, backgroundColor: N.n2 }}>
              <img loading="lazy" decoding="async" 
                src={approvalThumbPreview}
                alt="Preview do Thumb"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, gap: 4, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                {/* Estado em texto + ícone, sem selo verde em versalete.
                    O nome do arquivo em #57534e, e não no roxo a 60%:
                    é o que se confere ("subi o certo?") e o roxo
                    translúcido não passava AA. Enquanto o preview é
                    um data: URL (upload em curso), não há nome útil. */}
                {/* A miniatura aparece NO INSTANTE da escolha (leitura
                    local), antes de o arquivo terminar de subir. O
                    "Carregado" verde mentia nesse intervalo, e o
                    "Enviar" clicado ali respondia "Falta o thumb".
                    O giro depende de um envio EM CURSO (thumbEnviando),
                    não de "falta a URL": falha e cancelamento desfazem
                    a prévia em vez de deixar o indicador girando. */}
                {(thumbEnviando || isPasteUploading) ? (
                  <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: T.apoio, flexShrink: 0 }}>
                    <span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: '50%', border: `2px solid ${T.border}`, borderTopColor: T.apoio, animation: 'spin 0.8s linear infinite' }} />
                    Subindo o thumb…
                  </span>
                ) : approvalThumbUrl ? (
                  <>
                    <CheckCircle aria-hidden="true" style={{ width: 13, height: 13, color: TOM.sucesso.text, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: TOM.sucesso.text, flexShrink: 0 }}>Thumb carregado</span>
                  </>
                ) : null}
                {!approvalThumbPreview.startsWith('data:') && (
                  <span title={approvalThumbPreview.split('/').pop() || undefined} style={{ fontSize: isMobile ? 12 : 11, color: T.apoio, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                    {approvalThumbPreview.split('/').pop()}
                  </span>
                )}
              </div>
              <FileUploader
                onGetUploadParameters={getUploadUrl}
                onComplete={(result) => {
                  concluirEnvioDoThumb(convertGCSUrlToLocalPath(result.url));
                  toast({ title: "Thumb trocado", description: "Confira a miniatura e envie para aprovação.", variant: "success" });
                  focarEnvioParaAprovacao();
                }}
                onError={(error) => { desfazerEnvioDoThumb(); toast({ title: "Erro no upload", description: `${error.message} — o thumb anterior continua valendo.`, variant: "destructive" }); }}
                onCancel={desfazerEnvioDoThumb}
                onFileSelect={iniciarEnvioDoThumb}
                disabled={thumbEnviando || isPasteUploading}
                accept="image/*"
                buttonVariant="ghost"
                buttonClassName={`${dedo ? "min-h-[44px] px-0" : "h-auto p-0"} self-start text-[12px] font-semibold text-stone-700 underline underline-offset-2 hover:text-stone-900 hover:bg-transparent`}
              >
                Trocar thumb
              </FileUploader>
              <BotaoBuscarArte
                variante="discreto"
                testId="button-buscar-arte-trocar"
                onClick={() => setBuscaDeArte({ itemId: selectedItem.id, displayId: selectedItem.displayId, destino: "thumb-aprovacao" })}
              />
            </div>
          </div>

          {/* A AÇÃO PRINCIPAL VEM PRIMEIRO, E EM TINTA.

              Eram dois botões de largura inteira empilhados com
              "Salvar thumb (sem enviar)" EM CIMA e o envio embaixo,
              num roxo com sombra colorida — o olho chegava primeiro no
              secundário. Agora enviar é o botão cheio, em tinta, como
              o "Enviar" da linha da tabela (é a mesma ação), e o
              rascunho fica logo abaixo, com contorno. O foco vem para
              cá quando o upload termina: Enter envia. */}
          <Botao
            variante="primario"
            tamanho="toque"
            larguraCheia
            icone={Send}
            carregando={submitForApprovalMutation.isPending}
            onClick={handleSubmitForApproval}
            disabled={isPasteUploading || thumbEnviando || !approvalThumbUrl}
            data-testid="button-submit-approval-header"
            style={{ fontFamily: FONT.display, fontSize: FS.read }}
          >
            {submitForApprovalMutation.isPending
              ? 'Enviando…'
              : ehMolde(selectedItem) ? 'Enviar para a Revisão Final' : selectedItem.skipApproval ? 'Enviar direto para a finalização (arquivo final)' : 'Enviar para aprovação do patrocinador'}
          </Botao>
          {/* "ENVIOU PARA QUEM?" respondido antes do clique (rodada
              4). Os nomes já vêm na peça; peça sem aprovação de
              patrocinador diz isso em vez de listar marcas que não
              vão decidir nada. */}
          {(() => {
            if (ehMolde(selectedItem)) {
              return (
                <p data-testid="thumb-vai-para-molde" style={{ margin: '-4px 0 0', fontSize: 12, color: T.apoio, textAlign: 'center', lineHeight: 1.45 }}>
                  Molde: vai direto para a Revisão Final — sem aprovação de patrocinador nem arquivo final.
                </p>
              );
            }
            if (selectedItem.skipApproval) {
              return (
                <p style={{ margin: '-4px 0 0', fontSize: 12, color: T.apoio, textAlign: 'center', lineHeight: 1.45 }}>
                  Esta peça não passa por aprovação de patrocinador.
                </p>
              );
            }
            const nomes: string[] = (selectedItem.sponsors ?? []).map((s) => s?.name).filter(Boolean);
            if (nomes.length === 0) return null;
            const lista = nomes.length <= 3 ? nomes.join(', ') : `${nomes.slice(0, 3).join(', ')} e mais ${nomes.length - 3}`;
            return (
              <p data-testid="thumb-vai-para" style={{ margin: '-4px 0 0', fontSize: 12, color: T.apoio, textAlign: 'center', lineHeight: 1.45 }}>
                Vai para a aprovação de <strong style={{ color: T.text, fontWeight: 600 }}>{lista}</strong>
              </p>
            );
          })()}

          {/* Rascunho: secundário de verdade. Salvo, vira uma LINHA de
              confirmação — era uma caixa verde do tamanho do botão
              principal, que parecia ser a próxima ação. */}
          {savedApprovalThumbUrl && savedApprovalThumbUrl === approvalThumbUrl ? (
            <p
              data-testid="thumb-saved-confirmation"
              role="status"
              style={{
                margin: 0, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                color: TOM.sucesso.text, fontSize: 13, fontWeight: 600, textAlign: 'center',
                animation: thumbJustSaved ? 'thumb-saved-pop 0.25s ease' : 'none',
              }}
            >
              <CheckCircle aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }} />
              Salvo como rascunho — dá para enviar depois pela linha da peça
            </p>
          ) : (
            <Botao
              variante="secundario"
              tamanho={dedo ? "toque" : "md"}
              larguraCheia
              icone={FileImage}
              carregando={saveThumbDraftMutation.isPending}
              onClick={handleSaveThumbDraft}
              disabled={submitForApprovalMutation.isPending}
              data-testid="button-save-thumb-draft"
              style={{ fontWeight: 600 }}
            >
              {saveThumbDraftMutation.isPending ? 'Salvando…' : 'Salvar como rascunho, sem enviar'}
            </Botao>
          )}
        </div>
      ) : (
        /* State A1: empty upload zone */
        <div style={{
          background: (isPasteUploading || isDragOver) ? N.n2 : T.bg,
          border: (isPasteUploading || isDragOver) ? `1.5px dashed ${T.apoio}` : `1.5px dashed ${T.bdark}`, borderRadius: 12, padding: isMobile ? '20px 16px' : '24px 32px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', gap: 10, transition: 'background 0.15s, border-color 0.15s'
        }}
          onMouseEnter={e => { if (!isPasteUploading && !isDragOver) (e.currentTarget as HTMLElement).style.background = N.n2; }}
          onMouseLeave={e => { if (!isPasteUploading && !isDragOver) (e.currentTarget as HTMLElement).style.background = T.bg; }}
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragEnter={e => { e.preventDefault(); setIsDragOver(true); }}
          // Mesmo cuidado da zona da Correção: ignora o dragleave dos filhos.
          onDragLeave={e => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragOver(false); }}
          onDrop={e => {
            e.preventDefault();
            setIsDragOver(false);
            const file = e.dataTransfer.files[0];
            if (!file || !file.type.startsWith('image/')) {
              toast({ title: "Arquivo inválido", description: "Apenas imagens são aceitas", variant: "warning" });
              return;
            }
            iniciarEnvioDoThumb(file);
            uploadFileDirect(file, (localPath) => {
              concluirEnvioDoThumb(localPath);
              focarEnvioParaAprovacao();
            }, desfazerEnvioDoThumb);
          }}
        >
          {/* ZONA NEUTRA. Era lilás com desfoque, ícone roxo, título
              roxo-escuro e botão roxo: quatro tons de uma cor que, no
              resto da tela, só marca "rascunho". A zona de upload
              segue a mesma pele da zona da Correção — tracejado claro
              que escurece ao arrastar. */}
          <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: T.surface, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isPasteUploading
              ? <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2.5px solid ${T.border}`, borderTopColor: T.text, animation: 'spin 0.8s linear infinite' }} />
              : <Upload aria-hidden="true" style={{ width: 20, height: 20, color: T.strong }} />
            }
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: T.text, margin: '0 0 4px' }}>
              {isPasteUploading ? 'Subindo a imagem…' : 'Suba o thumb para enviar'}
            </p>
            <p style={{ fontSize: 12, color: T.apoio, margin: 0 }}>
              {isPasteUploading ? 'Aguarde o upload concluir' : isMobile ? 'Escolha a imagem no aparelho ou reaproveite uma arte já feita' : <>Arraste aqui, escolha o arquivo ou cole com <kbd style={KBD}>Ctrl</kbd>+<kbd style={KBD}>V</kbd></>}
            </p>
          </div>
          {!isPasteUploading && (
            <FileUploader
              onGetUploadParameters={getUploadUrl}
              onComplete={(result) => {
                concluirEnvioDoThumb(convertGCSUrlToLocalPath(result.url));
                toast({ title: "Thumb carregado", description: "Confira a miniatura e envie para aprovação.", variant: "success" });
                focarEnvioParaAprovacao();
              }}
              onError={(error) => { desfazerEnvioDoThumb(); toast({ title: "Erro no upload", description: `${error.message} — o thumb não subiu; escolha o arquivo de novo.`, variant: "destructive" }); }}
              onCancel={desfazerEnvioDoThumb}
              onFileSelect={iniciarEnvioDoThumb}
              accept="image/*"
              buttonVariant="ghost"
              buttonClassName={`mt-1 ${dedo ? "h-11 min-h-[44px] text-[14px]" : "h-10 text-[13px]"} font-semibold bg-white text-stone-900 border border-stone-300 px-5 rounded-lg hover:bg-stone-50 hover:text-stone-900`}
            >
              Escolher arquivo
            </FileUploader>
          )}
          {/* O SEGUNDO CAMINHO, ao lado do primeiro (dono, 21/09):
              a arte deste patrocinador já existe no app, num evento
              do mesmo circuito. Reaproveitar é só não subir o
              arquivo de novo — daqui para a frente é o envio de
              sempre. */}
          {!isPasteUploading && (
            <BotaoBuscarArte
              testId="button-buscar-arte-aprovacao"
              onClick={() => setBuscaDeArte({ itemId: selectedItem.id, displayId: selectedItem.displayId, destino: "thumb-aprovacao" })}
            />
          )}
          {/* A linha "ou Ctrl+V para colar direto" saiu: repetia, em
              roxo, o atalho que a frase logo acima já ensina. */}
        </div>
      )}
    </section>
  );
}
