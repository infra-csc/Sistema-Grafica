// ─────────────────────────────────────────────────────────────────────────────
// PRÉ-VISUALIZAÇÃO DA REFERÊNCIA VISUAL que o solicitante anexou à peça.
// Aberta pelo clipe da linha; a URL já chega filtrada por `safeRefUrl`.
// ─────────────────────────────────────────────────────────────────────────────
import { ExternalLink, Paperclip } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { EstadoErro } from "@/components/ui/estados";
import { TOM, T, N } from "@/lib/theme";

type Props = {
  previewRefUrl: string | null;
  setPreviewRefUrl: (url: string | null) => void;
  refImgFailed: boolean;
  setRefImgFailed: (falhou: boolean) => void;
};

export function ModalReferenciaVisual({ previewRefUrl, setPreviewRefUrl, refImgFailed, setRefImgFailed }: Props) {
  return (
    <Dialog open={!!previewRefUrl} onOpenChange={open => !open && setPreviewRefUrl(null)}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(560)}>
        <DialogTitle className="sr-only">Referência visual</DialogTitle>
        <DialogDescription className="sr-only">Imagem de referência anexada à peça</DialogDescription>
        <ModalHeader
          variant="confirm"
          icon={Paperclip}
          tint={TOM.info.text}
          title="Referência visual"
          onClose={() => setPreviewRefUrl(null)}
        />
        {previewRefUrl && (
          <div style={{
            backgroundColor: N.n2, display: 'flex', alignItems: 'center', justifyContent: 'center',
            // ALTURA: cabeçalho 73 + imagem de até 480 + rodapé 43 = 596px. Numa
            // janela de 445 o Radix centrava e cortava 75px em cima e 75 embaixo
            // ao mesmo tempo. O teto de `100vh − 48` agora vem do `modalSurface`;
            // aqui basta a imagem PODER encolher — `flex: 0 1 auto` com o
            // `minHeight: 200` como piso de desenho e o 480 como teto de desenho
            // — e a `<img>` acompanhar o container com `maxHeight: 100%`.
            minHeight: 200, maxHeight: 480, overflow: 'hidden', flex: '0 1 auto',
          }}>
            {refImgFailed ? (
              <div style={{ padding: 16, width: '100%' }}>
                <EstadoErro compacto titulo="Não foi possível carregar a imagem" />
              </div>
            ) : (
              <img
                src={previewRefUrl}
                alt="Referência visual"
                // Aqui a exibição é GRANDE (até 480px): a URL fica crua — a
                // referência existe para ser olhada. Só a decodificação sai
                // da thread principal.
                decoding="async"
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
                onError={() => setRefImgFailed(true)}
              />
            )}
          </div>
        )}
        {previewRefUrl && (
          <div style={{ padding: '12px 24px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
            <a
              href={previewRefUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: TOM.info.text, textDecoration: 'none', fontWeight: 700 }}
              data-testid="link-open-ref-new-tab"
            >
              <ExternalLink style={{ width: 13, height: 13 }} />
              Abrir em nova aba
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
