// ─────────────────────────────────────────────────────────────────────────────
// A CONFIRMAÇÃO DO ENVIO DOS RASCUNHOS — a lista do que vai (no recorte de
// quem envia, a mesma população que o servidor manda) e o que acontece depois.
// ─────────────────────────────────────────────────────────────────────────────
import { Check, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Botao } from "@/components/ui/botao";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { T, TOM, FONT, FS, FW, R } from "@/lib/theme";
import { refsDaPeca } from "@/lib/refs-da-peca";
import { miniatura } from "@/lib/miniatura";
import { formatarMedida } from "./regras";
import type { PecaDoEvento } from "./tipos";

export function ConfirmarEnvioDialog({ submitConfirmOpen, setSubmitConfirmOpen, rascunhosQueEuEnvio, dedo, enviando, onConfirmar }: {
  submitConfirmOpen: boolean;
  setSubmitConfirmOpen: (v: boolean) => void;
  rascunhosQueEuEnvio: PecaDoEvento[];
  /** Dedo (celular ou tablet do galpão): alvo de 44px. */
  dedo: boolean;
  enviando: boolean;
  onConfirmar: () => void;
}) {
  return (
    <Dialog open={submitConfirmOpen} onOpenChange={setSubmitConfirmOpen}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(560)}>
        <DialogTitle className="sr-only">Confirmar envio para vinculação</DialogTitle>
        <DialogDescription className="sr-only">
          Revise os itens antes de enviá-los para a vinculação de patrocinadores
        </DialogDescription>
        <ModalHeader
          variant="confirm"
          icon={Check}
          tint={T.accentText}
          title="Confirmar envio para vinculação"
          subtitle={`${rascunhosQueEuEnvio.length} ${rascunhosQueEuEnvio.length === 1 ? 'peça será enviada' : 'peças serão enviadas'} para a fila de vinculação.`}
          onClose={() => setSubmitConfirmOpen(false)}
        />

        {/* Lista de itens — ALTURA: cabeçalho 93 + lista de até 340 + bloco
            de aviso e botões ~120 = 553px. Numa janela de 445 sobram 397, e
            o Radix cortava 78px em cima e 78 embaixo ao mesmo tempo; os 340
            limitavam a lista, nunca o modal. `flex: 0 1 auto` + `minHeight:
            0` deixa a lista encolher abaixo dos 340 sob o teto do
            `modalSurface`, e a rolagem que já existia passa a ligar. */}
        <div style={{ maxHeight: 340, overflowY: 'auto', padding: '16px 24px 4px', flex: '0 1 auto', minHeight: 0 }}>
          {(() => {
            // rascunhosQueEuEnvio: draft + requested, no recorte de quem
            // envia — a mesma população que o servidor manda.
            const byType: Record<string, PecaDoEvento[]> = {};
            rascunhosQueEuEnvio.forEach(item => {
              const k = item.type || 'Sem tipo';
              if (!byType[k]) byType[k] = [];
              byType[k].push(item);
            });
            return Object.entries(byType).sort(([a],[b]) => a.localeCompare(b,'pt-BR')).map(([typeName, typeItems]) => (
              <div key={typeName} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: FS.meta, fontWeight: FW.forte, color: T.strong }}>{typeName}</span>
                  <span style={{ fontSize: FS.small, color: T.second }}>{typeItems.length} {typeItems.length === 1 ? 'peça' : 'peças'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${T.border}`, borderRadius: R.md, overflow: 'hidden' }}>
                  {typeItems.map((item, idx) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', backgroundColor: T.surface, borderTop: idx === 0 ? 'none' : `1px solid ${T.border}` }}>
                      {refsDaPeca(item)[0] && (
                        <img src={miniatura(refsDaPeca(item)[0])} alt="" aria-hidden="true" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: R.sm, border: `1px solid ${T.border}`, flexShrink: 0, backgroundColor: T.low }}
                          onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
                      )}
                      {/* displayId já vem com "#" do backend — prefixar de
                          novo mostrava "##0281". */}
                      <span style={{ fontSize: FS.meta, fontWeight: FW.forte, color: T.accentText, fontFamily: FONT.mono, flexShrink: 0 }}>
                        {item.displayId ?? '—'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div title={item.description || item.type} style={{ fontSize: FS.body, fontWeight: FW.medio, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.description || item.type}
                        </div>
                        <div style={{ fontSize: FS.small, color: T.second, marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
                          {[`${item.quantity} un.`, item.fileWidth && item.fileHeight ? `${formatarMedida(item.fileWidth)} × ${formatarMedida(item.fileHeight)} m` : null, item.material].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>

        {/* Aviso + botões */}
        <div style={{ padding: '14px 24px 20px', borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: R.md, padding: '10px 12px', marginBottom: 16 }}>
            <AlertCircle aria-hidden="true" style={{ width: 15, height: 15, color: TOM.alerta.text, flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: FS.body, color: T.strong, margin: 0, lineHeight: 1.5 }}>
              Após o envio, as peças saem de Rascunho e vão para a fila de <strong>Vincular Patrocinadores</strong> — nesta tela passam a aparecer como Aguardando Vinculação. Esta ação não pode ser desfeita por aqui.
            </p>
          </div>
          <DialogFooter style={{ gap: 8, flexDirection: 'row', justifyContent: 'flex-end' }}>
            <Botao variante="secundario" tamanho={dedo ? 'toque' : 'md'} onClick={() => setSubmitConfirmOpen(false)}>
              Cancelar
            </Botao>
            <Botao
              variante="primario"
              tamanho={dedo ? 'toque' : 'md'}
              icone={Check}
              carregando={enviando}
              onClick={() => {
                setSubmitConfirmOpen(false);
                onConfirmar();
              }}
              data-testid="button-confirm-submit-drafts"
            >
              {enviando ? 'Enviando...' : `Enviar ${rascunhosQueEuEnvio.length} ${rascunhosQueEuEnvio.length === 1 ? 'peça' : 'peças'}`}
            </Botao>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
