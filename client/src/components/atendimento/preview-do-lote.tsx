// ─────────────────────────────────────────────────────────────────────────────
// PREVIEW DA ARTE NO LOTE — abre pela miniatura, sem mexer na seleção.
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, SetStateAction } from "react";
import { FileText } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { T, N, TOM, FONT } from "@/lib/theme";
import { aoFalharMiniatura } from "./regras";
import type { PecaAtendimento } from "./tipos";

export function PreviewDoLote({ batchPreviewItem, setBatchPreviewItem }: {
  batchPreviewItem: PecaAtendimento | null;
  setBatchPreviewItem: Dispatch<SetStateAction<PecaAtendimento | null>>;
}) {
  return (
    <Dialog open={!!batchPreviewItem} onOpenChange={o => !o && setBatchPreviewItem(null)}>
      <DialogContent
        className="p-0 gap-0"
        // ALTURA: cabeçalho 72 + imagem com teto de 75vh + 32 de padding.
        // Em 445 de altura isso dava 438px de modal contra 397 disponíveis, e
        // o Radix cortava 20px de cada lado — o `overflow: hidden` daqui
        // impedia rolar até eles. Os 75vh eram um desconto CHUTADO: 75% da
        // viewport para a imagem, sem relação com o cabeçalho real.
        // A CONTA certa é `100vh − 48` no Content (24px de respiro em cima e
        // 24 embaixo, simétrico porque o Radix centra), com coluna flex: o
        // cabeçalho não encolhe e a área da imagem fica com o que sobrar.
        style={{ width: 'min(900px, calc(100vw - 32px))', maxWidth: 'none', borderRadius: 12, overflow: 'hidden', maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column' }}
      >
        <DialogTitle className="sr-only">Arte da peça</DialogTitle>
        <DialogDescription className="sr-only">Visualização ampliada da arte enviada</DialogDescription>
        {batchPreviewItem && (
          <>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${N.n3}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <span style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 800, color: T.accentText, background: TOM.laranja.bg, border: `1px solid ${TOM.laranja.border}`, borderRadius: 6, padding: '2px 6px' }}>
                {batchPreviewItem.displayId}
              </span>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{batchPreviewItem.type}</p>
                {batchPreviewItem.description && (
                  <p style={{ margin: 0, fontSize: 13, color: T.second, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{batchPreviewItem.description}</p>
                )}
              </div>
            </div>
            <div style={{ background: T.bg, overflow: 'auto', flex: '1 1 auto', minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, position: 'relative' }}>
              <img
                src={batchPreviewItem.approvalThumbUrl ?? undefined}
                alt={batchPreviewItem.type}
                decoding="async"
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
                onError={aoFalharMiniatura}
              />
              <div data-fallback="1" style={{ display: 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '48px 0' }}>
                <FileText style={{ width: 32, height: 32, color: T.muted }} />
                <p style={{ fontSize: 13, color: T.second, margin: 0 }}>Não foi possível carregar a arte</p>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
