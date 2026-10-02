// ─────────────────────────────────────────────────────────────────────────────
// PRÉ-VISUALIZAÇÃO DA REFERÊNCIA VISUAL que o solicitante anexou à peça.
// Aberta pelo clipe da linha; a URL já chega filtrada por `safeRefUrl`.
// ─────────────────────────────────────────────────────────────────────────────
import { ExternalLink, ImageOff, Paperclip } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ModalHeader, ModalFooter, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { BotaoLink } from "@/components/ui/botao";
import { usePonteiroGrosso } from "@/hooks/use-mobile";
import { TOM, T, N, FS, FW } from "@/lib/theme";

type Props = {
  previewRefUrl: string | null;
  setPreviewRefUrl: (url: string | null) => void;
  refImgFailed: boolean;
  setRefImgFailed: (falhou: boolean) => void;
};

export function ModalReferenciaVisual({ previewRefUrl, setPreviewRefUrl, refImgFailed, setRefImgFailed }: Props) {
  const dedo = usePonteiroGrosso();
  return (
    <Dialog open={!!previewRefUrl} onOpenChange={open => !open && setPreviewRefUrl(null)}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={{ ...modalSurface(640), gap: 0 }}>
        <DialogTitle className="sr-only">Referência visual</DialogTitle>
        <DialogDescription className="sr-only">Imagem de referência anexada à peça</DialogDescription>
        <ModalHeader
          variant="confirm"
          icon={Paperclip}
          tint={TOM.info.text}
          title="Referência visual"
          subtitle="Anexada por quem pediu a peça"
          onClose={() => setPreviewRefUrl(null)}
        />
        {previewRefUrl && (
          <div style={{
            backgroundColor: N.n2, display: 'flex', alignItems: 'center', justifyContent: 'center',
            // ALTURA: o teto de `100vh − 48` vem do `modalSurface`; aqui basta
            // a imagem PODER encolher — `flex: 0 1 auto` com o `minHeight:
            // 220` como piso e o 520 como teto de desenho — e a `<img>`
            // acompanhar o container com `maxHeight: 100%`.
            minHeight: 220, maxHeight: 520, overflow: 'hidden', flex: '0 1 auto', padding: 12,
          }}>
            {refImgFailed ? (
              // FALHA SEM ALARME. Era a caixa vermelha de erro de sistema —
              // mas nada quebrou do lado de quem olha: o link é que não abre
              // aqui dentro (formato, permissão, link vencido). A saída fica
              // à vista no rodapé.
              <div role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center', padding: '24px 16px', maxWidth: 360 }}>
                <ImageOff aria-hidden="true" style={{ width: 28, height: 28, color: T.muted }} />
                <p style={{ margin: 0, fontSize: FS.read, fontWeight: FW.forte, color: T.text }}>Não foi possível carregar a imagem</p>
                <p style={{ margin: 0, fontSize: FS.meta, color: T.apoio, lineHeight: 1.5 }}>
                  O arquivo pode não ser uma imagem ou o link pode ter expirado. Tente abrir em uma nova aba.
                </p>
              </div>
            ) : (
              <img
                src={previewRefUrl}
                alt="Referência visual"
                // Aqui a exibição é GRANDE (até 520px): a URL fica crua — a
                // referência existe para ser olhada. Só a decodificação sai
                // da thread principal.
                decoding="async"
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block', borderRadius: 4 }}
                onError={() => setRefImgFailed(true)}
              />
            )}
          </div>
        )}
        {previewRefUrl && (
          <ModalFooter style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: '12px 20px' }}>
            <BotaoLink
              href={previewRefUrl}
              externo
              target="_blank"
              rel="noopener noreferrer"
              variante="secundario"
              tamanho={dedo ? "toque" : "md"}
              icone={ExternalLink}
              data-testid="link-open-ref-new-tab"
            >
              Abrir em nova aba
            </BotaoLink>
          </ModalFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
