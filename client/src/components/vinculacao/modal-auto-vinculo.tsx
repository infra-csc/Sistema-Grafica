// ─────────────────────────────────────────────────────────────────────────────
// AUTO-VINCULAR POR COTA — pré-visualiza os vínculos que as regras de cota do
// evento criariam; nada é gravado antes de confirmar. Serve ao botão do topo
// (com um evento filtrado) e ao do cabeçalho de cada evento.
// ─────────────────────────────────────────────────────────────────────────────
import { Zap } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { EstadoVazio } from "@/components/ui/estados";
import { TOM, T, N, R, FS, FW } from "@/lib/theme";
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
  return (
    <Dialog open={autoLinkOpen} onOpenChange={open => { if (autoLinkConfirming) return; if (!open) fecharAutoVinculo(); }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(600)}>
        <DialogTitle className="sr-only">Auto-vincular por cota</DialogTitle>
        <DialogDescription className="sr-only">Vincula patrocinadores conforme as regras de cota do evento</DialogDescription>
        <ModalHeader
          icon={Zap}
          tint={TOM.info.text}
          title="Auto-vincular por cota"
          /* O NOME do evento: aberto do cabeçalho de um grupo, o diálogo
             precisa dizer sobre qual evento está falando. */
          subtitle={`${(autoLinkEventoId && eventById.get(autoLinkEventoId)?.name) || 'Evento'} · os patrocinadores entram conforme as regras de cota`}
          /* Durante a confirmação o modal não pode fechar (o onOpenChange já
             bloqueia; o X precisava acompanhar). */
          onClose={autoLinkConfirming ? undefined : fecharAutoVinculo}
        />

        {/* Body — ALTURA: cabeçalho 93 + corpo de até 420 + rodapé 65 = 578px,
            e numa janela de 445 saíam 66px em cima e 66 embaixo ao mesmo tempo.
            O `maxHeight: 420` sozinho nunca evitou isso: ele limita o corpo,
            não o modal. `flex: 0 1 auto` + `minHeight: 0` deixa o corpo
            encolher abaixo dos 420 sob o teto do `modalSurface`; a rolagem que
            já existia aqui finalmente liga, porque agora existe um "não coube". */}
        <div style={{ padding: '20px 24px', minHeight: 160, maxHeight: 420, overflowY: 'auto', flex: '0 1 auto' }}>
          {autoLinkLoading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, height: 120, color: T.second, fontSize: FS.body }}>
              <svg className="animate-spin" style={{ width: 20, height: 20, color: TOM.info.text }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Carregando pré-visualização...
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
                  {/* Total count */}
                  <div style={{ fontSize: FS.small, fontWeight: FW.forte, color: TOM.info.text, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                    {autoLinkPreview.reduce((acc: number, e) => acc + e.items.length, 0)} vínculo{autoLinkPreview.reduce((acc: number, e) => acc + e.items.length, 0) !== 1 ? 's' : ''} a criar · {autoLinkPreview.length} patrocinador{autoLinkPreview.length !== 1 ? 'es' : ''}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {autoLinkPreview.map((entry) => (
                      <div key={entry.sponsorId} style={{ padding: '10px 14px', borderRadius: R.md, backgroundColor: TOM.info.bg, border: `1px solid ${TOM.info.border}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <Selo tamanho="sm" cores={{ bg: TOM.info.text, text: T.surface, border: TOM.info.text }}>
                            {entry.quota}
                          </Selo>
                          <span style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>{entry.sponsorName}</span>
                          <span style={{ marginLeft: 'auto', fontSize: FS.small, color: T.second }}>{entry.items.length} {entry.items.length === 1 ? 'peça' : 'peças'}</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {entry.items.map((it) => (
                            <Selo key={it.itemId} forma="retangulo" cores={{ bg: T.surface, text: TOM.info.text, border: TOM.info.border }} style={{ fontWeight: FW.corpo }}>
                              {it.displayId} · {it.type}
                            </Selo>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: `1px solid ${N.n3}`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
          <p style={{ fontSize: FS.meta, color: T.apoio, lineHeight: 1.45, flex: '1 1 auto', minWidth: 0, marginRight: 12 }}>
            {/* Dizia "os vínculos entram como rascunho" — e não entram: a rota
                grava direto. A promessa errada fazia procurar um Salvar que
                não existe. */}
            Nada é gravado até você confirmar. Ao confirmar, os vínculos são salvos na hora; o envio à Arte continua sendo seu.
          </p>
          <Botao
            variante="fantasma"
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
          >
            {autoLinkConfirming
              ? 'Vinculando...'
              : `Confirmar ${autoLinkPreview?.reduce((a: number, e) => a + e.items.length, 0) ?? 0} vínculos`}
          </Botao>
        </div>
      </DialogContent>
    </Dialog>
  );
}
