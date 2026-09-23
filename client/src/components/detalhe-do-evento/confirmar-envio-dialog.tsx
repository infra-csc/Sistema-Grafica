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
import { T, TOM, FONT } from "@/lib/theme";
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
        <div style={{ maxHeight: 340, overflowY: 'auto', padding: '16px 28px', flex: '0 1 auto', minHeight: 0 }}>
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
              <div key={typeName} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.second, marginBottom: 6 }}>
                  {typeName} · {typeItems.length} {typeItems.length === 1 ? 'peça' : 'peças'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {typeItems.map(item => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', backgroundColor: T.bg, border: `1px solid ${T.border}`, borderRadius: 8 }}>
                      {/* displayId já vem com "#" do backend — prefixar de
                          novo mostrava "##0281". */}
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.accentText, fontFamily: FONT.mono, flexShrink: 0 }}>
                        {item.displayId ?? '—'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.type}{item.description ? ` — ${item.description}` : ''}
                        </div>
                        <div style={{ fontSize: 11, color: T.second, marginTop: 1 }}>
                          {item.quantity} un. · {item.visualWidth && item.visualHeight ? `${item.visualWidth}×${item.visualHeight}m` : item.material}
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
        <div style={{ padding: '14px 28px 24px', borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, backgroundColor: TOM.laranja.bg, border: `1px solid ${TOM.laranja.border}`, borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
            <AlertCircle style={{ width: 14, height: 14, color: T.accent, flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 13, color: TOM.alerta.text, margin: 0, lineHeight: 1.5 }}>
              Após o envio, as peças saem de Rascunho e vão para a fila de <strong>Vincular Patrocinadores</strong> — nesta tela passam a aparecer como Aguardando Vinculação. Esta ação não pode ser desfeita por aqui.
            </p>
          </div>
          <DialogFooter style={{ gap: 8, flexDirection: 'row', justifyContent: 'flex-end' }}>
            <Botao variante="fantasma" tamanho={dedo ? 'toque' : 'md'} onClick={() => setSubmitConfirmOpen(false)}>
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
              {enviando ? 'Enviando...' : 'Confirmar envio'}
            </Botao>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
