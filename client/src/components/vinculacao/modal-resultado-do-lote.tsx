// ─────────────────────────────────────────────────────────────────────────────
// RESULTADO DO LOTE — mais de 3 recusas não cabem num toast: aqui a lista
// inteira, peça a peça, com o motivo do servidor.
// ─────────────────────────────────────────────────────────────────────────────
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ModalHeader, ModalFooter, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { Botao } from "@/components/ui/botao";
import { TOM, T, N, R, FS, FW, FONT } from "@/lib/theme";
import type { ResultadoDoLote } from "./tipos";

type Props = {
  resultadoDoLote: ResultadoDoLote | null;
  setResultadoDoLote: (r: ResultadoDoLote | null) => void;
};

export function ModalResultadoDoLote({ resultadoDoLote, setResultadoDoLote }: Props) {
  return (
    <Dialog open={!!resultadoDoLote} onOpenChange={(open) => { if (!open) setResultadoDoLote(null); }}>
      {/* Casca padrão (modalSurface + ModalHeader + ModalFooter), como todo
          modal da tela: era o único com o Dialog cru, X nativo e sem saída
          clara além do X. */}
      <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(560)}>
        <FreezeWhileClosing open={!!resultadoDoLote}>
        <DialogTitle className="sr-only">{resultadoDoLote?.titulo ?? 'Peças recusadas'}</DialogTitle>
        <DialogDescription className="sr-only">As peças que não receberam o patrocinador, cada uma com o motivo</DialogDescription>
        <ModalHeader
          variant="confirm"
          icon={AlertTriangle}
          tint={TOM.alerta.text}
          title={resultadoDoLote?.titulo ?? 'Peças recusadas'}
          subtitle="Nenhuma dessas peças foi alterada — cada linha diz o porquê."
          onClose={() => setResultadoDoLote(null)}
        />
        <div style={{ padding: '14px 24px', overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
        <div style={{ border: `1px solid ${T.border}`, borderRadius: R.md }}>
          {(resultadoDoLote?.recusadas ?? []).map((rec, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 12px', borderBottom: `1px solid ${N.n3}`, fontSize: FS.body }}>
              <span style={{ fontFamily: FONT.mono, fontWeight: FW.forte, color: T.accentText, whiteSpace: 'nowrap' }}>{rec.displayId}</span>
              <span style={{ color: T.strong }}>{rec.motivo}</span>
            </div>
          ))}
        </div>
        </div>
        <ModalFooter>
          <Botao
            variante="primario"
            tamanho="toque"
            larguraCheia
            onClick={() => setResultadoDoLote(null)}
            data-testid="button-fechar-resultado-lote"
          >
            Entendi
          </Botao>
        </ModalFooter>
        </FreezeWhileClosing>
      </DialogContent>
    </Dialog>
  );
}
