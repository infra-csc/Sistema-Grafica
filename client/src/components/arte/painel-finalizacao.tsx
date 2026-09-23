import { useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, FileCheck, FileText, FolderOpen, Lock, RotateCcw } from "lucide-react";
import { FileUploader } from "@/components/FileUploader";
import { Input } from "@/components/ui/input";
import { Botao } from "@/components/ui/botao";
import { avisoDaTrocaDoArquivoFinal, fraseFaltamCaracteres, textoDaTrocaDoThumb } from "@/lib/arte-rules";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { P } from "@/lib/status";
import { T, TOM, N, R, FS, FONT } from "@/lib/theme";
import { fileNameFromPath } from "@/lib/utils";
import type { RegraDaTroca, RegraDoThumb } from "@shared/troca-de-material";
import { BotaoBuscarArte } from "./botao-buscar-arte";
import type { BuscaDeArte, PecaDaArte, SugestaoDeArquivoFinal } from "./tipos";
import type { AcoesDaArte } from "./use-acoes-da-arte";
import type { UploadsDaArte } from "./use-uploads-da-arte";

// ── SUGESTÃO DO ARQUIVO FINAL (dono, 21/09) ──────────────────────────────
// "Caso eu tenha buscado a arte já feita, na hora da finalização aparece uma
// sugestão do arquivo final da última peça — apenas sugestão." O servidor
// acha a peça de onde a arte veio pela MESMA URL de thumb (sem coluna nova)
// e devolve o caminho dela, ou null. Aqui nada é gravado: "Usar este
// caminho" só enche o campo; quem grava é o envio de sempre.
//
// A consulta só roda na etapa de Finalização e com o campo VAZIO — é
// quando a sugestão serve; depois de carregada ela fica (vira a linha
// menor enquanto a pessoa digita). "Ignorar" vale para a sessão, por peça.
export function useSugestaoDoArquivoFinal({ selectedItem, podeEditar, finalFileUrl, setFinalFileUrl, setFinalFileName, setFinalDirty }: {
  selectedItem: PecaDaArte | null;
  podeEditar: boolean;
  finalFileUrl: string;
  setFinalFileUrl: Dispatch<SetStateAction<string>>;
  setFinalFileName: Dispatch<SetStateAction<string>>;
  setFinalDirty: Dispatch<SetStateAction<boolean>>;
}) {
  const naFinalizacao = !!selectedItem && podeEditar
    && ["sponsor_approved", "awaiting_creator_review"].includes(selectedItem.status);
  const [sugestoesIgnoradas, setSugestoesIgnoradas] = useState<Set<string>>(() => new Set());
  const chaveDaSugestaoFinal = selectedItem ? `/api/artes/sugestao-final?item=${encodeURIComponent(selectedItem.id)}` : "";
  const { data: sugestaoFinal = null } = useQuery<SugestaoDeArquivoFinal | null>({
    queryKey: [chaveDaSugestaoFinal],
    enabled: naFinalizacao && finalFileUrl.trim() === "" && !sugestoesIgnoradas.has(selectedItem!.id),
    staleTime: 60_000,
  });
  const sugestaoVisivel = naFinalizacao && sugestaoFinal?.finalFileUrl
    && !sugestoesIgnoradas.has(selectedItem!.id)
    && sugestaoFinal.finalFileUrl !== finalFileUrl
    ? sugestaoFinal : null;
  const usarSugestaoFinal = () => {
    if (!sugestaoVisivel) return;
    setFinalFileUrl(sugestaoVisivel.finalFileUrl);
    setFinalFileName(sugestaoVisivel.finalFileName || fileNameFromPath(sugestaoVisivel.finalFileUrl) || "");
    // Marca como editado para o botão de envio destravar — e NÃO envia.
    setFinalDirty(true);
  };
  const ignorarSugestaoFinal = () => {
    if (!selectedItem) return;
    setSugestoesIgnoradas((s) => new Set(s).add(selectedItem.id));
  };
  return { sugestaoVisivel, usarSugestaoFinal, ignorarSugestaoFinal };
}

/**
 * O bloco de ação da peça APROVADA no modal: finalização do layout (subir o
 * caminho do arquivo final) ou, já finalizada, a troca do arquivo final e do
 * thumb — sempre pelas regras de shared/troca-de-material.
 */
export function PainelDeFinalizacao({
  selectedItem, isMobile, regraThumbSel, regraFinalSel, thumbPedeMotivo, faltamMotivoThumb, motivoTrocaThumb, setMotivoTrocaThumb,
  updateThumbMutation, submitFinalFileMutation, handleSubmitFinalFile, getUploadUrl, setBuscaDeArte,
  finalFileUrl, setFinalFileUrl, finalDirty, setFinalDirty, sugestaoVisivel, usarSugestaoFinal, ignorarSugestaoFinal,
}: {
  selectedItem: PecaDaArte;
  isMobile: boolean;
  regraThumbSel: RegraDoThumb | null;
  regraFinalSel: RegraDaTroca | null;
  thumbPedeMotivo: boolean;
  faltamMotivoThumb: number;
  motivoTrocaThumb: string;
  setMotivoTrocaThumb: Dispatch<SetStateAction<string>>;
  updateThumbMutation: AcoesDaArte["updateThumbMutation"];
  submitFinalFileMutation: AcoesDaArte["submitFinalFileMutation"];
  handleSubmitFinalFile: () => void;
  getUploadUrl: UploadsDaArte["getUploadUrl"];
  setBuscaDeArte: Dispatch<SetStateAction<BuscaDeArte | null>>;
  finalFileUrl: string;
  setFinalFileUrl: Dispatch<SetStateAction<string>>;
  finalDirty: boolean;
  setFinalDirty: Dispatch<SetStateAction<boolean>>;
  sugestaoVisivel: SugestaoDeArquivoFinal | null;
  usarSugestaoFinal: () => void;
  ignorarSugestaoFinal: () => void;
}) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Section header */}
      {/* Título em caixa normal e o selo virou texto de apoio. O selo
          dizia "CORREÇÃO" na substituição do arquivo final — a mesma
          palavra da aba Correção, que é OUTRA coisa (arte recusada pelo
          patrocinador). Quem lia achava que a peça tinha voltado. */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: FS.title, letterSpacing: '-0.02em', color: T.text, margin: 0 }}>
          {['sponsor_approved', 'awaiting_creator_review'].includes(selectedItem.status) ? 'Finalização de layout' : 'Substituir arquivo final'}
        </h3>
        <span style={{ fontSize: 12, color: T.second, fontWeight: 600 }}>
          {['sponsor_approved', 'awaiting_creator_review'].includes(selectedItem.status) ? 'arte aprovada — falta o arquivo final' : 'a peça já tem arquivo final'}
        </span>
      </div>

      {/* Superfície branca com hairline, sem o "vidro" verde com blur e
          borda de 2px: verde nesta tela é o ESTADO aprovado, e o bloco
          inteiro vestido dele competia com o botão de enviar. */}
      <div style={{
        background: T.surface,
        border: `1px solid ${T.border}`, borderRadius: 12, padding: isMobile ? 16 : 20,
        display: 'flex', flexDirection: 'column', gap: 16
      }}>
        {/* Thumb aprovado preview */}
        {selectedItem.approvalThumbUrl && (() => {
          const url = selectedItem.approvalThumbUrl.toLowerCase();
          const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(url) || selectedItem.approvalThumbUrl.startsWith('/objects/');
          const isPdf = !isImage;
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: T.bg, borderRadius: 8, border: `1px solid ${N.n3}`, flexWrap: 'wrap' }}>
              <div style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: TOM.perigo.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {isPdf
                  ? <FileText style={{ width: 20, height: 20, color: TOM.perigo.dot }} />
                  : <img loading="lazy" decoding="async" src={selectedItem.approvalThumbUrl} alt="Thumb" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }} />
                }
              </div>
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                {/* "Thumb aprovado" é o que o bloco É; o nome do arquivo
                    (um hash, em versalete) vai para o `title`. */}
                <p title={selectedItem.approvalThumbUrl.split('/').pop() || undefined} style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Thumb aprovado
                </p>
                <a href={selectedItem.approvalThumbUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: T.strong, textDecoration: 'underline', textUnderlineOffset: 2 }}>
                  Abrir em nova aba
                </a>
                {/* "Trocar thumb" sobe NA HORA, sem confirmação — então o
                    que a troca faz (ou por que não dá) vem escrito antes. */}
                {regraThumbSel && (
                  <p data-testid="texto-troca-thumb" style={{ margin: '2px 0 0', fontSize: 11, color: T.apoio, lineHeight: 1.4 }}>
                    {textoDaTrocaDoThumb(selectedItem.status, regraThumbSel)}
                  </p>
                )}
              </div>

              {regraThumbSel?.pode && (
                <>
                  <FileUploader
                    onGetUploadParameters={getUploadUrl}
                    onComplete={(result) => updateThumbMutation.mutate({
                      itemId: selectedItem.id,
                      approvalThumbUrl: convertGCSUrlToLocalPath(result.url),
                      statusAntes: selectedItem.status,
                      motivo: thumbPedeMotivo ? motivoTrocaThumb.trim().replace(/\s+/g, " ") : undefined,
                    })}
                    accept="image/*,application/pdf"
                    data-testid="uploader-update-thumb"
                    disabled={faltamMotivoThumb > 0 || updateThumbMutation.isPending}
                    buttonVariant="ghost"
                    buttonClassName="h-9 px-3 text-[12px] font-semibold text-stone-800 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 shrink-0"
                  >
                    {updateThumbMutation.isPending ? 'Enviando…' : 'Trocar thumb'}
                  </FileUploader>
                  {/* Reaproveitar segue a MESMA mutação (e o mesmo
                      motivo) — ver aplicarArteEncontrada. */}
                  {faltamMotivoThumb === 0 && (
                    <BotaoBuscarArte
                      variante="discreto"
                      testId="button-buscar-arte-troca-aprovada"
                      onClick={() => setBuscaDeArte({ itemId: selectedItem.id, displayId: selectedItem.displayId, destino: "thumb-troca" })}
                    />
                  )}
                </>
              )}
              {thumbPedeMotivo && (
                <div style={{ flexBasis: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label htmlFor="motivo-troca-thumb" style={{ fontSize: 11, fontWeight: 700, color: T.apoio }}>
                    Motivo da troca <span style={{ color: P.red.text }}>*</span>
                  </label>
                  <textarea
                    id="motivo-troca-thumb"
                    value={motivoTrocaThumb}
                    onChange={(e) => setMotivoTrocaThumb(e.target.value)}
                    placeholder="Ex: o patrocinador pediu o logo novo por e-mail depois de aprovar."
                    data-testid="textarea-motivo-troca-thumb"
                    style={{ width: '100%', backgroundColor: T.surface, border: `1px solid ${faltamMotivoThumb > 0 ? T.border : TOM.sucesso.text}`, borderRadius: R.md, padding: '8px 10px', fontSize: 12, resize: 'none', height: 60, fontFamily: 'inherit', color: T.text, boxSizing: 'border-box' }}
                  />
                  {faltamMotivoThumb > 0 && (
                    <p data-testid="troca-thumb-faltam" style={{ margin: 0, fontSize: 11, color: P.amber.text }}>
                      {fraseFaltamCaracteres(faltamMotivoThumb)} para liberar “Trocar thumb”.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Thumb anterior — gravado quando a Arte troca o thumb aprovado */}
        {selectedItem.previousApprovalThumbUrl && (
          <div style={{ backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: TOM.alerta.text }}>Thumb substituído — a versão anterior ficou guardada</span>
            <a href={selectedItem.previousApprovalThumbUrl} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: T.apoio, wordBreak: 'break-all', textDecoration: 'underline' }}>
              {selectedItem.previousApprovalThumbUrl.split('/').pop() || selectedItem.previousApprovalThumbUrl}
            </a>
          </div>
        )}

        {/* Arquivo anterior — exibido quando Arte substitui o arquivo enviado */}
        {selectedItem.previousFinalFileUrl && (
          <div style={{ backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: TOM.alerta.text }}>Arquivo final substituído — o anterior ficou gravado</span>
            <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: T.apoio, wordBreak: 'break-all' }}>
              {selectedItem.previousFinalFileName || selectedItem.previousFinalFileUrl}
            </span>
          </div>
        )}

        {regraFinalSel && !regraFinalSel.pode ? (
          // A troca não cabe mais: o motivo no lugar do campo (a rota
          // responderia 409 com a mesma frase).
          <p data-testid="final-troca-bloqueada" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: 0, padding: '10px 12px', borderRadius: 8, background: N.n2, border: `1px solid ${T.border}`, fontSize: 12, color: T.strong, lineHeight: 1.5 }}>
            <Lock aria-hidden="true" style={{ width: 14, height: 14, color: T.apoio, flexShrink: 0, marginTop: 2 }} />
            <span><b style={{ fontWeight: 700 }}>Arquivo final não pode mais ser trocado.</b> {regraFinalSel.motivo}</span>
          </p>
        ) : (
        <>
        {/* Caminho do arquivo final (rede) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* htmlFor: o rótulo era um <label> solto (sem vínculo com o
              campo) em verde a 60% — o leitor de tela anunciava "campo de
              edição" sem nome, e o texto não passava AA. */}
          <label htmlFor="finalFilePath" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.apoio, paddingLeft: 2 }}>
            Caminho do arquivo final
          </label>
          <div style={{ position: 'relative' }}>
            <FolderOpen aria-hidden="true" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: T.apoio }} />
            <Input
              id="finalFilePath"
              placeholder="Cole o caminho do ARQUIVO (com nome e extensão)…"
              value={finalFileUrl}
              onChange={(e) => { setFinalFileUrl(e.target.value); setFinalDirty(true); }}
              data-testid="input-final-file-path"
              style={{ paddingLeft: 36, paddingRight: 16, height: 44, background: T.surface, border: 'none', boxShadow: `0 0 0 1px ${T.bdark}`, borderRadius: 8, fontSize: 13, fontWeight: 500 }}
            />
          </div>
          {/* O arquivo final da mesma arte já está no app — copiar o
              caminho à mão da outra peça era o que se fazia. */}
          <BotaoBuscarArte
            variante="discreto"
            testId="button-buscar-arte-final"
            onClick={() => setBuscaDeArte({ itemId: selectedItem.id, displayId: selectedItem.displayId, destino: "arquivo-final" })}
          />
          {sugestaoVisivel && (
            finalFileUrl.trim() === "" ? (
              <div data-testid="sugestao-arquivo-final" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: 8, background: T.bg, border: `1px solid ${T.border}` }}>
                <p style={{ margin: 0, fontSize: 12, color: T.strong, lineHeight: 1.5 }}>
                  <b style={{ fontWeight: 700, color: T.text }}>Sugestão</b> — arquivo final da {sugestaoVisivel.displayId ?? "peça de origem"}{sugestaoVisivel.evento ? ` (${sugestaoVisivel.evento})` : ""}:
                </p>
                <p style={{ margin: 0, fontSize: 12, fontFamily: "'DM Mono', monospace", color: T.text, wordBreak: "break-all" }}>{sugestaoVisivel.finalFileUrl}</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Botao variante="secundario" tamanho="toque" onClick={usarSugestaoFinal} data-testid="button-usar-sugestao-final" style={{ fontSize: FS.body }}>
                    Usar este caminho
                  </Botao>
                  <Botao variante="fantasma" tamanho="toque" onClick={ignorarSugestaoFinal} data-testid="button-ignorar-sugestao-final" style={{ fontSize: FS.body, fontWeight: 600 }}>
                    Ignorar
                  </Botao>
                </div>
                <p style={{ margin: 0, fontSize: 11, color: T.second, lineHeight: 1.45 }}>
                  É só sugestão — nada é enviado até você clicar em enviar. Confira se o arquivo serve para esta peça (medida e evento).
                </p>
              </div>
            ) : (
              <p data-testid="sugestao-arquivo-final-linha" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 11.5, color: T.apoio, paddingLeft: 2 }}>
                <span style={{ minWidth: 0, wordBreak: "break-all" }}>Sugestão: {sugestaoVisivel.finalFileUrl}</span>
                <button type="button" onClick={usarSugestaoFinal} data-testid="button-usar-sugestao-final-linha"
                  style={{ minHeight: 44, padding: "0 8px", border: "none", background: "transparent", color: T.text, fontSize: 12, fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer" }}>
                  Usar
                </button>
              </p>
            )
          )}
          {finalFileUrl.trim() && (
            fileNameFromPath(finalFileUrl)
              ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: TOM.sucesso.text, paddingLeft: 4 }}>
                  <FileCheck style={{ width: 13, height: 13, flexShrink: 0 }} />
                  Arquivo: <span style={{ fontFamily: "'DM Mono', monospace" }}>{fileNameFromPath(finalFileUrl)}</span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, fontWeight: 600, color: TOM.alerta.text, background: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: 6, padding: '7px 10px' }}>
                  <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
                  <span>Isto parece uma <b>pasta</b>. Cole o caminho do <b>arquivo específico</b> (com nome e extensão, ex.: …\Rolo_Ministerio.tif) para a gráfica não pegar o arquivo errado.</span>
                </div>
              )
          )}
        </div>

        {/* Troca que devolve a peça para a Revisão Final: dito ANTES do
            clique, junto da ação. */}
        {regraFinalSel && avisoDaTrocaDoArquivoFinal(regraFinalSel) && (
          <p data-testid="aviso-troca-volta-revisao" style={{ display: 'flex', alignItems: 'flex-start', gap: 6, margin: 0, padding: '7px 10px', borderRadius: 6, background: P.amber.bg, border: `1px solid ${P.amber.border}`, fontSize: 11.5, fontWeight: 600, color: TOM.alerta.text, lineHeight: 1.45 }}>
            <RotateCcw aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
            {avisoDaTrocaDoArquivoFinal(regraFinalSel)}
          </p>
        )}
        {/* CTA button */}
        {/* TINTA (primário), como os outros primários da Arte. O CTA diz o
            resultado (rodada 4). O porquê do desabilitado mora logo
            abaixo (final-bloqueado-motivo), à vista. */}
        <Botao
          variante="primario"
          tamanho="toque"
          larguraCheia
          carregando={submitFinalFileMutation.isPending}
          onClick={handleSubmitFinalFile}
          disabled={!finalFileUrl || (!!selectedItem.finalFileUrl && !finalDirty)}
          data-testid="button-submit-final"
          style={{ fontFamily: FONT.display, fontSize: FS.read }}
        >
          {submitFinalFileMutation.isPending ? 'Enviando…' : (selectedItem.finalFileUrl ? 'Atualizar arquivo final' : 'Enviar arquivo final para revisão')}
          {!submitFinalFileMutation.isPending && <ArrowRight aria-hidden="true" style={{ width: 16, height: 16 }} />}
        </Botao>
        {/* POR QUE ESTÁ BLOQUEADO, à vista. A razão morava só no `title`
            (hover, e nunca no celular); o botão cinza parecia quebrado. */}
        {!submitFinalFileMutation.isPending && (!finalFileUrl || (!!selectedItem.finalFileUrl && !finalDirty)) ? (
          <p data-testid="final-bloqueado-motivo" style={{ margin: '-8px 0 0', fontSize: 11.5, color: T.apoio, textAlign: 'center' }}>
            {!finalFileUrl
              ? 'Cole o caminho do arquivo acima para liberar o envio.'
              : 'Troque o caminho acima para atualizar o arquivo final.'}
          </p>
        ) : !selectedItem.finalFileUrl && !submitFinalFileMutation.isPending ? (
          <p style={{ margin: '-8px 0 0', fontSize: 11.5, color: T.apoio, textAlign: 'center' }}>
            Quem pediu a peça confere o arquivo; depois ela vai para a Gráfica.
          </p>
        ) : null}
        </>
        )}
      </div>
    </section>
  );
}
