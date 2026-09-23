// A confirmação de REAPROVEITAR EM LOTE — só o reaproveitamento TOTAL. O
// parcial fica no ícone da linha, onde a quantidade é decidida peça a peça.
import { Recycle } from "lucide-react";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { Botao } from "@/components/ui/botao";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { TOM } from "@/lib/theme";
import { CORPO_DA_CONFIRMACAO, RODAPE_DA_CONFIRMACAO, TEXTO_DA_CONFIRMACAO } from "./estilos";
import type { useFilaDaRevisao } from "./use-fila-da-revisao";

type Fila = ReturnType<typeof useFilaDaRevisao>;

export function ConfirmarLoteReaproveitar({
  open, onOpenChange, dedo, selecaoLote, avisoLoteFinalizadas, reaproveitando, aoReaproveitar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dedo: boolean;
  selecaoLote: Fila["selecaoLote"];
  avisoLoteFinalizadas: Fila["avisoLoteFinalizadas"];
  reaproveitando: boolean;
  aoReaproveitar: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(470)}>
        {/* Mesmo congelamento dos outros lotes: o onSuccess reescreve a
            seleção (que conta o título) e fecha no mesmo commit. */}
        <FreezeWhileClosing open={open}>
        <ModalHeader
          variant="confirm"
          icon={Recycle}
          tint={TOM.sucesso.text}
          title={`Reaproveitar ${selecaoLote.vivas.length} ${selecaoLote.vivas.length === 1 ? "peça" : "peças"}`}
          onClose={() => onOpenChange(false)}
        />
        <AlertDialogTitle className="sr-only">Reaproveitar {selecaoLote.vivas.length} {selecaoLote.vivas.length === 1 ? "peça" : "peças"}</AlertDialogTitle>
        <div style={CORPO_DA_CONFIRMACAO}>
          <AlertDialogDescription asChild>
            <div style={TEXTO_DA_CONFIRMACAO}>
              {selecaoLote.vivas.length === 1 ? "A peça será marcada" : "As peças serão marcadas"} como reaproveitamento <strong>total</strong> e enviadas direto à Gráfica como produzidas — sem nova impressão. Para reaproveitar só parte das unidades de uma peça, use o ícone ♻ na linha dela.
              {selecaoLote.finalizadas > 0 && (
                <span data-testid="aviso-bulk-reuse-finalizadas" style={{ display: "block", marginTop: 8 }}>
                  {avisoLoteFinalizadas()}
                </span>
              )}
            </div>
          </AlertDialogDescription>
        </div>
        <div style={RODAPE_DA_CONFIRMACAO}>
          <AlertDialogPrimitive.Cancel asChild>
            <Botao variante="fantasma" tamanho={dedo ? "toque" : "md"} data-testid="button-bulk-reuse-cancel">Cancelar</Botao>
          </AlertDialogPrimitive.Cancel>
          <AlertDialogPrimitive.Action asChild>
            <Botao
              variante="primario"
              tamanho={dedo ? "toque" : "md"}
              icone={Recycle}
              onClick={(e) => {
                e.preventDefault(); // a mutation controla o fechamento (mantém aberto em erro)
                aoReaproveitar();
              }}
              disabled={reaproveitando || selecaoLote.vivas.length === 0}
              data-testid="button-bulk-reuse-confirm"
            >
              {reaproveitando
                ? "Reaproveitando..."
                : selecaoLote.finalizadas > 0 ? `Reaproveitar as ${selecaoLote.vivas.length}` : "Reaproveitar todas"}
            </Botao>
          </AlertDialogPrimitive.Action>
        </div>
        </FreezeWhileClosing>
      </AlertDialogContent>
    </AlertDialog>
  );
}
