// Desfazer o reaproveitamento pede confirmação: a peça volta a precisar de
// arquivo final e de produção.
import { Recycle } from "lucide-react";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { Botao } from "@/components/ui/botao";
import { useIsMobile } from "@/hooks/use-mobile";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { T } from "@/lib/theme";
import { TEXTO_DA_CONFIRMACAO, corpoDaConfirmacao, rodapeDaConfirmacao } from "./estilos";
import type { PecaDaRevisao } from "./tipos";

export function ConfirmarDesfazerReaproveitamento({
  itemId, pendingItems, dedo, desfazendo, aoFechar, aoDesfazer,
}: {
  itemId: string | null;
  pendingItems: PecaDaRevisao[];
  dedo: boolean;
  desfazendo: boolean;
  aoFechar: () => void;
  aoDesfazer: (itemId: string) => void;
}) {
  const celular = useIsMobile();
  return (
    <AlertDialog open={!!itemId} onOpenChange={open => { if (!open && !desfazendo) aoFechar(); }}>
      <AlertDialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(470)}>
        <FreezeWhileClosing open={!!itemId}>
        <ModalHeader
          variant="confirm"
          compacto={celular}
          icon={Recycle}
          tint={T.text}
          title="Desfazer o reaproveitamento"
          onClose={() => { if (!desfazendo) aoFechar(); }}
        />
        <AlertDialogTitle className="sr-only">Desfazer o reaproveitamento</AlertDialogTitle>
        <div style={corpoDaConfirmacao(celular)}>
          <AlertDialogDescription asChild>
            <div style={TEXTO_DA_CONFIRMACAO}>
              {(() => {
                const it = pendingItems.find((i) => i.id === itemId);
                return (
                  <span>
                    {it ? <strong>{it.displayId}</strong> : "A peça"} deixa de ser reaproveitamento total e volta ao fluxo normal: para liberar, vai precisar do arquivo final da Arte, e a Gráfica produz as unidades.
                  </span>
                );
              })()}
            </div>
          </AlertDialogDescription>
        </div>
        <div style={rodapeDaConfirmacao(celular)}>
          <AlertDialogPrimitive.Cancel asChild>
            <Botao variante="fantasma" tamanho={dedo || celular ? "toque" : "md"} data-testid="button-desfazer-reuse-cancel" disabled={desfazendo}>Manter reaproveitada</Botao>
          </AlertDialogPrimitive.Cancel>
          <AlertDialogPrimitive.Action asChild>
            <Botao
              variante="primario"
              tamanho={dedo || celular ? "toque" : "md"}
              onClick={(e) => {
                e.preventDefault(); // a mutation fecha (mantém aberto em erro)
                if (itemId) aoDesfazer(itemId);
              }}
              disabled={desfazendo}
              data-testid="button-desfazer-reuse-confirm"
            >
              {desfazendo ? "Desfazendo…" : "Desfazer"}
            </Botao>
          </AlertDialogPrimitive.Action>
        </div>
        </FreezeWhileClosing>
      </AlertDialogContent>
    </AlertDialog>
  );
}
