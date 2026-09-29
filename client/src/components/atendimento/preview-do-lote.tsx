// ─────────────────────────────────────────────────────────────────────────────
// PREVIEW DA ARTE NO LOTE — abre pela miniatura, sem mexer na seleção.
//
// O cabeçalho segue o do modal de revisão (29/09): código em mono cinza — era
// um selo laranja, a única vez que o código da peça ganhava a cor de atenção
// — e o X da casa, do mesmo tamanho dos outros (era o X nativo do Radix,
// pequeno e sem o alvo de 44px no toque).
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, SetStateAction } from "react";
import { FileText, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { Botao } from "@/components/ui/botao";
import { usePonteiroGrosso } from "@/hooks/use-mobile";
import { FONT, FS, FW, R, T, N } from "@/lib/theme";
import { aoFalharMiniatura } from "./regras";
import { codigoDaPeca, letra } from "./estilos";
import type { PecaAtendimento } from "./tipos";

export function PreviewDoLote({ batchPreviewItem, setBatchPreviewItem }: {
  batchPreviewItem: PecaAtendimento | null;
  setBatchPreviewItem: Dispatch<SetStateAction<PecaAtendimento | null>>;
}) {
  const dedo = usePonteiroGrosso();
  const lado = dedo ? 44 : 36;
  return (
    <Dialog open={!!batchPreviewItem} onOpenChange={o => !o && setBatchPreviewItem(null)}>
      <DialogContent
        className={`p-0 gap-0 ${HIDE_NATIVE_CLOSE}`}
        // ALTURA: `100vh − 48` no Content (24px de respiro em cima e 24
        // embaixo, simétrico porque o Radix centra), com coluna flex: o
        // cabeçalho não encolhe e a área da imagem fica com o que sobrar.
        style={{ width: 'min(900px, calc(100vw - 16px))', maxWidth: 'none', borderRadius: R.xl, overflow: 'hidden', maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column' }}
      >
        <DialogTitle className="sr-only">Arte da peça</DialogTitle>
        <DialogDescription className="sr-only">Visualização ampliada da arte enviada</DialogDescription>
        {batchPreviewItem && (
          <>
            <div style={{ padding: '12px 12px 12px 20px', borderBottom: `1px solid ${N.n3}`, backgroundColor: T.bg, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <div style={{ minWidth: 0, flex: '1 1 0%' }}>
                <p style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                  <span style={{ fontFamily: FONT.display, fontSize: 17, fontWeight: FW.forte, letterSpacing: '-0.02em', color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{batchPreviewItem.type}</span>
                  <span style={codigoDaPeca(dedo, FS.body)}>{batchPreviewItem.displayId}</span>
                </p>
                {batchPreviewItem.description && (
                  <p style={{ margin: '2px 0 0', fontSize: letra(FS.body, dedo), color: T.second, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{batchPreviewItem.description}</p>
                )}
              </div>
              <Botao
                variante="secundario"
                icone={X}
                tamanhoDoIcone={16}
                aria-label="Fechar"
                title="Fechar (Esc)"
                data-testid="button-close-preview-lote"
                onClick={() => setBatchPreviewItem(null)}
                style={{ width: lado, minWidth: lado, minHeight: lado, padding: 0, flexShrink: 0 }}
              />
            </div>
            <div style={{ background: N.n2, overflow: 'auto', flex: '1 1 auto', minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, position: 'relative' }}>
              <img
                src={batchPreviewItem.approvalThumbUrl ?? undefined}
                alt={batchPreviewItem.type}
                decoding="async"
                className="atd-entrar"
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block', borderRadius: R.sm, boxShadow: '0 1px 3px rgba(28,25,23,0.10)' }}
                onError={aoFalharMiniatura}
              />
              <div data-fallback="1" style={{ display: 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '48px 0' }}>
                <FileText aria-hidden="true" style={{ width: 32, height: 32, color: T.bdark }} />
                <p style={{ fontSize: FS.body, color: T.second, margin: 0 }}>Não foi possível carregar a arte</p>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
