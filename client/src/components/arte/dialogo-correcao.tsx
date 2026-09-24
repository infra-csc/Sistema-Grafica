import { useState, type Dispatch, type SetStateAction } from "react";
import { RotateCcw, Send, Upload, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, modalSurface, ModalHeader, FreezeWhileClosing } from "@/components/modal-shell";
import { FileUploader } from "@/components/FileUploader";
import { TextoComLinks } from "@/components/texto-com-links";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import type { useToast } from "@/hooks/use-toast";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { getApprovalMeta } from "@/lib/status";
import { T, TOM, N, R, FS, FONT } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { BotaoBuscarArte } from "./botao-buscar-arte";
import { KBD, fsToque } from "./constantes";
import { MiniaturaDaCorrecao } from "./miniatura-da-correcao";
import type { AprovacaoDaCorrecao, BuscaDeArte, PecaDaCorrecao } from "./tipos";
import type { AcoesDaArte } from "./use-acoes-da-arte";
import type { UploadsDaArte } from "./use-uploads-da-arte";

/** A Correção: subir a nova versão e reenviá-la a quem ainda não aprovou. */
export function DialogoCorrecao({
  correcaoItem, correcaoThumbUrl, setCorrecaoThumbUrl, correcaoFileName, setCorrecaoFileName, fecharCorrecaoModal,
  isPasteUploading, uploadFileDirect, getUploadUrl, toast, setBuscaDeArte, resubmitMutation, reenvioInteiroMutation, dedo,
}: {
  correcaoItem: PecaDaCorrecao | null;
  correcaoThumbUrl: string;
  setCorrecaoThumbUrl: Dispatch<SetStateAction<string>>;
  correcaoFileName: string;
  setCorrecaoFileName: Dispatch<SetStateAction<string>>;
  fecharCorrecaoModal: (forcar?: boolean) => Promise<void>;
  isPasteUploading: boolean;
  uploadFileDirect: UploadsDaArte["uploadFileDirect"];
  getUploadUrl: UploadsDaArte["getUploadUrl"];
  toast: ReturnType<typeof useToast>["toast"];
  setBuscaDeArte: Dispatch<SetStateAction<BuscaDeArte | null>>;
  resubmitMutation: AcoesDaArte["resubmitMutation"];
  reenvioInteiroMutation: AcoesDaArte["reenvioInteiroMutation"];
  dedo: boolean;
}) {
  const [isDragOverCorrecao, setIsDragOverCorrecao] = useState(false);
  /**
   * O CONJUNTO DO REENVIO, derivado — corpo e rodapé leem daqui. `aprovacoes`
   * vem da fila da Correção (todas as linhas de patrocinador da peça); nas
   * respostas antigas sem esse campo, cai para as reprovadas.
   */
  const correcaoAprovacoes: AprovacaoDaCorrecao[] = correcaoItem?.aprovacoes ?? correcaoItem?.awaitingArteApprovals ?? [];
  const correcaoDestinatarios: string[] = correcaoAprovacoes.filter((a) => a.status !== 'approved').map((a) => a.sponsorId);
  return (
    <Dialog open={!!correcaoItem} onOpenChange={(open) => { if (!open) void fecharCorrecaoModal(); }}>
      {/* overflowY vence o overflow:hidden do modalSurface — este modal rola. */}
      <DialogContent
        // `max-h-[90vh]` saiu: o teto de altura mora no `modalSurface`
        // (100vh − 48, simétrico porque o Radix centra o Content). Dois tetos
        // no mesmo elemento é uma conta que ninguém revisa junto — e o daqui
        // era mais frouxo, então prometia 10vh de respiro que a casca já
        // tinha decidido que eram 48px.
        className={cn("p-0 gap-0", HIDE_NATIVE_CLOSE)}
        style={{ ...modalSurface(472), overflowY: 'auto' }}
        // Com uma nova arte JÁ ENVIADA ao storage, um clique no overlay
        // (o Radix fecha por padrão) descartava o arquivo sem perguntar.
        onInteractOutside={e => { if (correcaoThumbUrl) e.preventDefault(); }}
      >
        {/* POR QUE congelar aqui: o onSuccess do re-envio invalida duas
            chaves, fecha e apaga de uma vez `correcaoItem`, `correcaoThumbUrl`,
            `correcaoFileName` e a seleção de patrocinadores — que são
            exatamente a miniatura, o nome do arquivo e a lista de checkboxes
            que o modal está exibindo. Sem congelar, o modal fica vazio
            durante toda a animação de saída. */}
        <FreezeWhileClosing open={!!correcaoItem}>
        <DialogTitle className="sr-only">Enviar nova arte</DialogTitle>
        <DialogDescription className="sr-only">Reenvio de arte para patrocinadores</DialogDescription>

        {/* ── Cabeçalho claro ──

            Eram DOIS gradientes empilhados (um diagonal quase preto e um
            brilho radial vermelho por cima), com todo o texto em branco
            translúcido: 0,55 na linha da peça, 0,72 no evento. É como se
            apaga texto sem admitir que ele ficou ilegível — num modal cuja
            função é a pessoa LER o que o patrocinador recusou. */}
        {/* CASCA DA CASA (ModalHeader `confirm`), no lugar do cabeçalho feito
            à mão. Ele tinha um terceiro desenho de "fechar" (quadrado de 36
            com borda, posicionado por `absolute`), título em caixa de título
            ("Enviar Nova Arte") e um sobretítulo vermelho em versalete —
            "AÇÃO NECESSÁRIA" — que só repetia, gritando, o que o botão que
            abriu o modal já tinha dito. A peça e o evento continuam na linha
            de apoio, que é onde se confere "é a peça certa?". */}
        <ModalHeader
          variant="confirm"
          icon={RotateCcw}
          tint={TOM.perigo.text}
          title="Enviar nova arte"
          subtitle={correcaoItem
            ? [
                [correcaoItem.displayId, correcaoItem.type, correcaoItem.description !== correcaoItem.type ? correcaoItem.description : null].filter(Boolean).join(' · '),
                correcaoItem.event?.name,
              ].filter(Boolean).join(' — ')
            : undefined}
          onClose={() => void fecharCorrecaoModal()}
        />

        {/* ── Body ──
            `flexShrink: 0` nos três blocos: aqui quem rola é o PRÓPRIO
            DialogContent (`overflowY: 'auto'` inline, logo acima), e agora ele
            também é coluna flex por causa do `modalSurface`. Sem travar o
            encolhimento, uma janela baixa espremeria cabeçalho, corpo e rodapé
            em vez de rolar. */}
        <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
          {correcaoItem && (
            <>
              {/* Rejection cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {correcaoItem.awaitingArteApprovals.map((approval) => (
                  <div key={approval.id} style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${TOM.perigo.border}` }}>
                    {/* Sponsor bar */}
                    <div style={{ backgroundColor: TOM.perigo.bg, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 7, borderBottom: `1px solid ${TOM.perigo.border}` }}>
                      {approval.sponsor?.color && <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: approval.sponsor.color, flexShrink: 0 }} />}
                      {/* Nome em caixa normal e "recusou" como verbo: eram DUAS
                          peças em versalete vermelho na mesma faixa (a marca e
                          um selo "RECUSADO"), e o painel logo abaixo já diz
                          "reprovou" em caixa baixa — mesma notícia, duas vozes. */}
                      <span style={{ fontSize: 12, fontWeight: 700, color: TOM.perigo.text, flex: 1, minWidth: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{approval.sponsor?.name || 'Patrocinador'}</span>
                      <span style={{ fontSize: fsToque(11, dedo), fontWeight: 600, color: TOM.perigo.text, whiteSpace: 'nowrap' }}>recusou</span>
                    </div>
                    {/* Reason */}
                    {/* Corpo BRANCO e sem itálico: é o texto que a pessoa
                        abriu o modal para ler, e estava em vermelho escuro
                        inclinado sobre rosa. As aspas já marcam a citação. */}
                    <div style={{ backgroundColor: T.surface, padding: '10px 14px 8px' }}>
                      <p style={{ fontSize: 12, color: T.strong, margin: 0, lineHeight: 1.55 }}>
                        {approval.rejectionReason ? <>"<TextoComLinks texto={approval.rejectionReason} />"</> : <span style={{ color: T.second }}>Sem motivo informado.</span>}
                      </p>
                      {(approval.rejectedBy || approval.rejectedAt) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                          {approval.rejectedBy && (
                            // Sem o chip rosa em volta do nome: quem recusou
                            // não é um status, é um crédito de linha.
                            <span style={{ fontSize: fsToque(11, dedo), fontWeight: 600, color: T.apoio }}>
                              {approval.rejectedBy}
                            </span>
                          )}
                          {approval.rejectedAt && (
                            <span style={{ fontSize: fsToque(11, dedo), color: T.apoio, fontVariantNumeric: 'tabular-nums' }}>
                              {new Date(approval.rejectedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Upload zone */}
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: fsToque(11, dedo), fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.apoio, marginBottom: 8 }}>
                  Nova versão
                </label>
                {correcaoThumbUrl ? (
                  /* Uploaded state — compact pill row */
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, backgroundColor: TOM.sucesso.bg, border: `1px solid ${TOM.sucesso.border}` }}>
                    {/* Ladrilho chapado: o gradiente verde era o ultimo desta
                        area, e num aviso de sucesso de 32px ele nao le como
                        gradiente — le como ruido. */}
                    <MiniaturaDaCorrecao key={correcaoThumbUrl} url={correcaoThumbUrl} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* "Arquivo enviado" lia como "já foi para o
                          patrocinador" (rodada 4) — e a pessoa fechava o
                          modal sem clicar no botão de baixo. Subiu para o
                          servidor; ninguém recebeu ainda. */}
                      <div style={{ fontSize: fsToque(11, dedo), fontWeight: 700, color: TOM.sucesso.text }}>Nova versão carregada — falta enviar</div>
                      {correcaoFileName && (
                        <div style={{ fontSize: fsToque(11, dedo), color: TOM.sucesso.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={correcaoFileName}>{correcaoFileName}</div>
                      )}
                    </div>
                    <Botao
                      variante="secundario"
                      tamanho={dedo ? "toque" : "md"}
                      icone={X}
                      onClick={() => { setCorrecaoThumbUrl(""); setCorrecaoFileName(""); }}
                      data-testid="button-remove-correcao-thumb"
                      style={{ flexShrink: 0 }}
                    >
                      Trocar
                    </Botao>
                  </div>
                ) : (
                  /* Empty state. A zona dizia "Arraste ou" mas nunca teve
                     handler de drag — só o link e o Ctrl+V funcionavam. */
                  <div style={{
                    height: 130, border: (isPasteUploading || isDragOverCorrecao) ? `1.5px dashed ${TOM.perigo.text}` : `1.5px dashed ${T.border}`, borderRadius: 10,
                    backgroundColor: (isPasteUploading || isDragOverCorrecao) ? TOM.perigo.bg : T.bg, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 2, transition: 'all 0.15s', cursor: 'default'
                  }}
                    onMouseEnter={e => { if (!isPasteUploading && !isDragOverCorrecao) { (e.currentTarget as HTMLElement).style.backgroundColor = N.n2; (e.currentTarget as HTMLElement).style.borderColor = T.bdark; } }}
                    onMouseLeave={e => { if (!isPasteUploading && !isDragOverCorrecao) { (e.currentTarget as HTMLElement).style.backgroundColor = T.bg; (e.currentTarget as HTMLElement).style.borderColor = T.border; } }}
                    onDragOver={e => { e.preventDefault(); setIsDragOverCorrecao(true); }}
                    onDragEnter={e => { e.preventDefault(); setIsDragOverCorrecao(true); }}
                    // Só apaga o destaque quando o arrasto SAI da zona: o dragleave
                    // também dispara ao passar sobre o ícone e o texto de dentro,
                    // e a borda piscava enquanto a pessoa mirava o arquivo.
                    onDragLeave={e => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragOverCorrecao(false); }}
                    onDrop={e => {
                      e.preventDefault();
                      setIsDragOverCorrecao(false);
                      if (isPasteUploading) return;
                      const file = e.dataTransfer.files[0];
                      if (!file) return;
                      const ok = file.type.startsWith('image/') || file.type === 'application/pdf';
                      if (!ok) {
                        toast({ title: "Arquivo inválido", description: "Aceito: PDF, PNG, SVG ou outras imagens", variant: "warning" });
                        return;
                      }
                      setCorrecaoFileName(file.name);
                      uploadFileDirect(file, (localPath) => setCorrecaoThumbUrl(localPath));
                    }}
                  >
                    {/* Hairline no lugar da sombra: uma sombra difusa dentro
                        de uma caixa tracejada dá dois contornos concorrentes
                        para o mesmo objeto. */}
                    <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: T.surface, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                      {isPasteUploading
                        ? <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2.5px solid ${TOM.perigo.border}`, borderTopColor: TOM.perigo.text, animation: 'spin 0.8s linear infinite' }} />
                        : <Upload style={{ width: 18, height: 18, color: TOM.perigo.text }} />
                      }
                    </div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: T.strong, margin: 0 }}>
                      {isPasteUploading ? 'Enviando...' : 'Arraste ou'}
                    </p>
                    {!isPasteUploading && (
                      <FileUploader
                        onGetUploadParameters={getUploadUrl}
                        onFileSelect={(file) => { setCorrecaoFileName(file.name); }}
                        onComplete={(result) => { setCorrecaoThumbUrl(convertGCSUrlToLocalPath(result.url)); }}
                        accept="image/*,application/pdf"
                        data-testid="uploader-correcao-thumb"
                        buttonVariant="ghost"
                        buttonClassName="h-auto py-0 px-0 text-[12px] font-semibold underline decoration-2 underline-offset-2 text-red-700 hover:bg-transparent"
                      >
                        escolha um arquivo
                      </FileUploader>
                    )}
                    {/* O atalho que JÁ existe, desenhado como tecla: escrito no
                        meio da frase ele passava por texto de rodapé. */}
                    <p style={{ fontSize: fsToque(11, dedo), color: T.apoio, margin: '3px 0 0' }}>
                      {isPasteUploading ? 'Aguarde…' : <>PDF, PNG, SVG · ou cole com <kbd style={KBD}>Ctrl</kbd>+<kbd style={KBD}>V</kbd></>}
                    </p>
                    {!isPasteUploading && correcaoItem && (
                      <BotaoBuscarArte
                        variante="discreto"
                        testId="button-buscar-arte-correcao"
                        onClick={() => setBuscaDeArte({ itemId: correcaoItem.id, displayId: correcaoItem.displayId, destino: "thumb-correcao" })}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* ── PARA QUEM VAI O REENVIO — AUTOMÁTICO ──
                  Regra do dono: o reenvio vai SEMPRE para quem ainda não
                  aprovou — quem reprovou e quem está aguardando. Quem já
                  aprovou mantém a aprovação e não recebe de novo. Isto era
                  uma lista de caixas de seleção, e permitia um erro sem
                  volta: desmarcar quem reprovou publicava a arte corrigida
                  sem que a marca que a recusou voltasse a ver. Agora é
                  painel de LEITURA: a tela mostra a conta, e o servidor
                  (sponsor-approvals/resubmit) recusa qualquer outro conjunto. */}
              <div style={{ marginBottom: 20 }} data-testid="painel-reenvio">
                <label style={{ display: 'block', fontSize: fsToque(11, dedo), fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.apoio, marginBottom: 8 }}>
                  Para quem vai o reenvio — automático
                </label>
                {correcaoAprovacoes.length === 0 && (
                  <p style={{ fontSize: 12, color: T.apoio, margin: '0 0 4px', lineHeight: 1.45 }}>
                    Nenhum patrocinador reprovou individualmente — esta peça foi devolvida inteira.
                    O re-envio manda a arte nova para a aprovação de <strong>todos</strong> os patrocinadores dela.
                  </p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {correcaoAprovacoes.map((a) => {
                    const est = getApprovalMeta(a.status);
                    const recebe = a.status !== 'approved';
                    const estadoTexto = est?.tone === 'approved' ? 'já aprovou' : est?.tone === 'waiting' ? 'aguardando' : 'reprovou';
                    return (
                      <div
                        key={a.sponsorId}
                        data-testid={`linha-reenvio-${a.sponsorId}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: R.md, minHeight: 44, backgroundColor: recebe ? T.bg : T.surface, border: `1px solid ${recebe ? T.border : N.n3}`, opacity: recebe ? 1 : 0.7 }}
                      >
                        {a.sponsor?.color && (
                          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: a.sponsor.color, flexShrink: 0 }} />
                        )}
                        <span style={{ fontSize: FS.body, fontWeight: recebe ? 700 : 500, color: T.text, flex: 1, minWidth: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{a.sponsor?.name || 'Patrocinador'}</span>
                        <Selo forma="retangulo" cores={est ? { bg: est.bg, text: est.text, border: est.border } : undefined} style={{ padding: '2px 8px', letterSpacing: '0.04em' }}>
                          {estadoTexto}
                        </Selo>
                        <Selo forma="retangulo" tom={recebe ? "laranja" : "sucesso"} style={{ padding: '2px 8px' }}>
                          {recebe ? 'vai receber' : 'mantém aprovação'}
                        </Selo>
                      </div>
                    );
                  })}
                </div>
                {correcaoAprovacoes.length > 0 && (
                  <p data-testid="text-reenvio-total" style={{ margin: '10px 0 0', fontSize: 12, fontWeight: 700, color: T.strong }}>
                    Vai para {correcaoDestinatarios.length} de {correcaoAprovacoes.length} {correcaoAprovacoes.length === 1 ? 'patrocinador' : 'patrocinadores'}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        {(() => {
        /**
         * DUAS DEVOLUÇÕES DIFERENTES, DOIS CAMINHOS DE VOLTA.
         *
         * A peça chega à Correção de dois jeitos, e eles não têm o mesmo
         * gesto de saída:
         *
         * 1. UM PATROCINADOR reprovou a linha dele. A peça segue em
         *    `awaiting_sponsor_approval` e o re-envio é por patrocinador —
         *    escolhe-se quem revê. Rota: sponsor-approvals/resubmit.
         *
         * 2. A PEÇA INTEIRA voltou (status `awaiting_submission`). Aquela
         *    rota recusa este status com 409, então o caminho é
         *    submit-for-approval, que o aceita, devolve as aprovações
         *    reprovadas para `pending` e reabre a peça para todos os
         *    patrocinadores dela.
         *
         * O botão exigia patrocinador selecionado nos DOIS casos. No caso 2
         * podia não haver nenhum para selecionar — e aí ele nascia
         * desabilitado e nunca saía disso: subia-se a arte nova e o modal
         * virava um beco sem saída. Eram 3 peças em produção nesse estado.
         */
        // SEM PEÇA, SEM RODAPÉ — e esta guarda não é defensiva por gosto.
        // O corpo do modal já vive dentro de `{correcaoItem && (...)}`, mas
        // este rodapé ficou FORA dela, e o FreezeWhileClosing mantém a
        // subárvore renderizada mesmo com o modal fechado. Resultado: com
        // `correcaoItem` nulo — que é o estado normal ao abrir a tela — ler
        // `.status` derrubava a Arte INTEIRA no boundary de render, não só o
        // modal. Devolver null aqui é o mesmo que o corpo já faz.
        if (!correcaoItem) return null;
        const devolvidaInteira = correcaoItem.status === "awaiting_submission";
        const enviando = resubmitMutation.isPending || reenvioInteiroMutation.isPending;
        // O painel de destinatários é LEITURA e pode estar velho (a fila é
        // cache; vínculos mudam em outra tela). Quem decide se há alguém
        // para receber é o SERVIDOR — se não houver, ele responde 409 com a
        // frase certa ("todos já aprovaram") e o toast a mostra. Travar o
        // botão pelo cálculo local deixava a peça sem saída justamente
        // quando o dado local estava errado.
        const travado = !correcaoThumbUrl || enviando;
        return (
        <div style={{ padding: '16px 24px 24px', borderTop: `1px solid ${N.n3}`, flexShrink: 0 }}>
          {/* TINTA (primário), não vermelho: vermelho é a cor do problema (a
              recusa), não da solução. O rótulo diz a QUEM vai. Travado, o
              botão diz o que falta (`motivo`, à vista) — as duas razões
              possíveis estão em lugares diferentes do modal. */}
          <Botao
            variante="primario"
            tamanho="toque"
            larguraCheia
            icone={Send}
            carregando={enviando}
            disabled={travado}
            alinharMotivo="center"
            motivo={!correcaoThumbUrl ? 'Suba a nova versão para liberar o envio.' : 'Nenhum patrocinador pendente para receber o reenvio — todos já aprovaram.'}
            onClick={() => {
              if (!correcaoItem) return;
              if (devolvidaInteira) {
                reenvioInteiroMutation.mutate({ itemId: correcaoItem.id, approvalThumbUrl: correcaoThumbUrl });
                return;
              }
              resubmitMutation.mutate({ itemId: correcaoItem.id, newThumbUrl: correcaoThumbUrl });
            }}
            data-testid="button-submit-correcao"
            style={{ minHeight: 48, fontFamily: FONT.display, letterSpacing: '-0.02em' }}
          >
            {enviando ? 'Enviando…' : devolvidaInteira
              ? 'Enviar nova arte a todos os patrocinadores'
              : correcaoDestinatarios.length === 0
              ? 'Enviar nova arte'
              : `Enviar nova arte a ${correcaoDestinatarios.length} ${correcaoDestinatarios.length === 1 ? 'patrocinador' : 'patrocinadores'}`}
          </Botao>
        </div>
        );
        })()}
        </FreezeWhileClosing>
      </DialogContent>
    </Dialog>
  );
}
