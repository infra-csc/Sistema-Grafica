// ─────────────────────────────────────────────────────────────────────────────
// AUTO-VINCULAR POR COTA — pré-visualiza os vínculos que as regras de cota do
// evento criariam; nada é gravado antes de confirmar. Serve ao botão do topo
// (com um evento filtrado) e ao do cabeçalho de cada evento.
// ─────────────────────────────────────────────────────────────────────────────
import { Zap } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ModalHeader, ModalFooter, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { EstadoVazio } from "@/components/ui/estados";
import { useIsMobile } from "@/hooks/use-mobile";
import { TOM, T, N, R, FS, FW, FONT } from "@/lib/theme";
import type { EventoDaVinculacao, PreviaDoAutoVinculo } from "./tipos";

type Props = {
  autoLinkOpen: boolean;
  autoLinkPreview: PreviaDoAutoVinculo[] | null;
  autoLinkLoading: boolean;
  autoLinkConfirming: boolean;
  autoLinkEventoId: string | null;
  eventById: Map<string, EventoDaVinculacao>;
  fecharAutoVinculo: () => void;
  confirmarAutoVinculo: () => void;
  dedo: boolean;
};

export function ModalAutoVinculo({
  autoLinkOpen, autoLinkPreview, autoLinkLoading, autoLinkConfirming, autoLinkEventoId, eventById,
  fecharAutoVinculo, confirmarAutoVinculo, dedo,
}: Props) {
  const isMobile = useIsMobile();
  const lado = isMobile ? 16 : 24;
  const totalDeVinculos = autoLinkPreview?.reduce((a: number, e) => a + e.items.length, 0) ?? 0;
  return (
    <Dialog open={autoLinkOpen} onOpenChange={open => { if (autoLinkConfirming) return; if (!open) fecharAutoVinculo(); }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={{ ...modalSurface(600), gap: 0 }}>
        <DialogTitle className="sr-only">Auto-vincular por cota</DialogTitle>
        <DialogDescription className="sr-only">Vincula patrocinadores conforme as regras de cota do evento</DialogDescription>
        <ModalHeader
          icon={Zap}
          tint={TOM.info.text}
          title="Auto-vincular por cota"
          /* O NOME do evento: aberto do cabeçalho de um grupo, o diálogo
             precisa dizer sobre qual evento está falando. A regra ("entram
             conforme a cota") desceu para o corpo, junto do resultado. */
          subtitle={(autoLinkEventoId && eventById.get(autoLinkEventoId)?.name) || 'Evento'}
          compacto={isMobile}
          /* Durante a confirmação o modal não pode fechar (o onOpenChange já
             bloqueia; o X precisava acompanhar). */
          onClose={autoLinkConfirming ? undefined : fecharAutoVinculo}
        />

        {/* O CORPO QUE ROLA — `flex: 1 1 auto` + `minHeight: 0` sob o teto do
            modalSurface: numa janela baixa a prévia encolhe e rola, e o
            Confirmar nunca sai da tela. */}
        <div aria-busy={autoLinkLoading || undefined} style={{ padding: `18px ${lado}px`, minHeight: 160, overflowY: 'auto', flex: '1 1 auto' }}>
          {autoLinkLoading && (
            // SILHUETA DO RESULTADO, não spinner no vazio: reserva a forma da
            // lista que vai chegar e o diálogo não pula de altura.
            <div role="status" aria-label="Calculando a pré-visualização" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="animate-pulse" style={{ width: 220, height: 14, borderRadius: R.sm, backgroundColor: N.n3 }} />
              {[0, 1, 2].map(i => (
                <div key={i} style={{ padding: '12px 14px', borderRadius: R.md, border: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <div className="animate-pulse" style={{ width: 160 - i * 20, height: 12, borderRadius: R.sm, backgroundColor: N.n3 }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[70, 90, 64].map((w, j) => <div key={j} className="animate-pulse" style={{ width: w, height: 20, borderRadius: R.sm, backgroundColor: N.n2 }} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!autoLinkLoading && autoLinkPreview !== null && (
            <>
              {autoLinkPreview.length === 0 && (
                <EstadoVazio
                  compacto
                  icone={Zap}
                  titulo="Nenhuma peça elegível para auto-vínculo neste evento."
                  descricao="Verifique se os patrocinadores têm cota definida e se há regras configuradas para este evento."
                />
              )}
              {autoLinkPreview.length > 0 && (
                <div>
                  {/* O RESULTADO EM UMA FRASE, com os números em destaque. */}
                  <p style={{ margin: '0 0 14px', fontSize: FS.read, color: T.strong, lineHeight: 1.5 }}>
                    <strong style={{ fontFamily: FONT.mono, color: T.text }}>{totalDeVinculos}</strong> {totalDeVinculos === 1 ? 'vínculo a criar' : 'vínculos a criar'} para{' '}
                    <strong style={{ fontFamily: FONT.mono, color: T.text }}>{autoLinkPreview.length}</strong> {autoLinkPreview.length === 1 ? 'patrocinador' : 'patrocinadores'}, conforme as regras de cota.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {autoLinkPreview.map((entry) => (
                      <section key={entry.sponsorId} style={{ padding: '12px 14px', borderRadius: R.md, backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>{entry.sponsorName}</span>
                          <Selo tamanho="sm" forma="retangulo" tom="info">
                            {entry.quota}
                          </Selo>
                          <span style={{ marginLeft: 'auto', fontFamily: FONT.mono, fontSize: FS.meta, color: T.apoio }}>
                            +{entry.items.length} {entry.items.length === 1 ? 'peça' : 'peças'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {entry.items.map((it) => (
                            <Selo key={it.itemId} forma="retangulo" cores={{ bg: T.bg, text: T.strong, border: T.border }} style={{ fontWeight: FW.corpo }}>
                              <span style={{ fontFamily: FONT.mono, color: T.apoio, marginRight: 5 }}>{it.displayId}</span>{it.type}
                            </Selo>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <ModalFooter fundo={T.bg} style={{ padding: isMobile ? '12px 16px' : '14px 24px' }}>
          {/* Dizia "os vínculos entram como rascunho" — e não entram: a rota
              grava direto. A promessa errada fazia procurar um Salvar que
              não existe. */}
          <p style={{ margin: 0, fontSize: FS.meta, color: T.apoio, lineHeight: 1.45 }}>
            Nada é gravado até você confirmar. Ao confirmar, os vínculos são salvos na hora; o envio à Arte continua sendo seu.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Botao
              variante="secundario"
              tamanho={dedo ? "toque" : "md"}
              onClick={fecharAutoVinculo}
              disabled={autoLinkConfirming}
              data-testid="button-auto-link-cancel"
            >
              Cancelar
            </Botao>
            <Botao
              variante="primario"
              tamanho={dedo ? "toque" : "md"}
              icone={Zap}
              carregando={autoLinkConfirming}
              disabled={!autoLinkPreview || autoLinkPreview.length === 0 || autoLinkConfirming}
              // Grava direto no servidor — ver confirmarAutoVinculo.
              onClick={confirmarAutoVinculo}
              data-testid="button-auto-link-confirm"
              style={isMobile ? { flex: '1 1 0' } : undefined}
            >
              {autoLinkConfirming
                ? 'Vinculando…'
                : autoLinkLoading
                  ? 'Confirmar vínculos'
                  : `Confirmar ${totalDeVinculos} ${totalDeVinculos === 1 ? 'vínculo' : 'vínculos'}`}
            </Botao>
          </div>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
