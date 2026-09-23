// A confirmação de EXCLUIR uma peça (só admin — a lixeira da linha e do cartão).
import { Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { Botao } from "@/components/ui/botao";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { TOM } from "@/lib/theme";
import { CORPO_DA_CONFIRMACAO, RODAPE_DA_CONFIRMACAO, TEXTO_DA_CONFIRMACAO } from "./estilos";
import type { PecaDaRevisao } from "./tipos";

export function ConfirmarExclusao({
  itemId, pendingItems, dedo, excluindo, aoFechar, aoExcluir,
}: {
  itemId: string | null;
  pendingItems: PecaDaRevisao[];
  dedo: boolean;
  excluindo: boolean;
  aoFechar: () => void;
  aoExcluir: (itemId: string) => void;
}) {
  return (
    <AlertDialog open={!!itemId} onOpenChange={open => { if (!open) aoFechar(); }}>
      <AlertDialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(470)}>
        {/* POR QUE congelar aqui: o onSuccess da exclusão invalida, avisa e
            zera o id — que é quem escreve o ID da peça na descrição. Sem
            congelar, "A peça SOL-123 será excluída" cairia para o texto
            genérico durante a saída. */}
        <FreezeWhileClosing open={!!itemId}>
        <ModalHeader variant="confirm" icon={Trash2} tint={TOM.perigo.text} title="Excluir peça" onClose={aoFechar} />
        <AlertDialogTitle className="sr-only">Excluir peça</AlertDialogTitle>
        <div style={CORPO_DA_CONFIRMACAO}>
          <AlertDialogDescription asChild>
            <div style={TEXTO_DA_CONFIRMACAO}>
              {itemId && (() => {
                const item = pendingItems.find(i => i.id === itemId);
                return item ? <span>A peça <strong>{item.displayId}</strong> será permanentemente excluída. Esta ação não pode ser desfeita.</span> : "Esta peça será permanentemente excluída.";
              })()}
            </div>
          </AlertDialogDescription>
        </div>
        <div style={RODAPE_DA_CONFIRMACAO}>
          <AlertDialogPrimitive.Cancel asChild>
            <Botao variante="fantasma" tamanho={dedo ? "toque" : "md"} data-testid="button-delete-cancel">Cancelar</Botao>
          </AlertDialogPrimitive.Cancel>
          <AlertDialogPrimitive.Action asChild>
            <Botao
              variante="perigo"
              tamanho={dedo ? "toque" : "md"}
              icone={Trash2}
              onClick={(e) => {
                e.preventDefault(); // a mutation controla o fechamento (mantém aberto em erro)
                if (itemId) aoExcluir(itemId);
              }}
              disabled={excluindo}
              data-testid="button-delete-confirm"
            >
              {excluindo ? "Excluindo..." : "Excluir peça"}
            </Botao>
          </AlertDialogPrimitive.Action>
        </div>
        </FreezeWhileClosing>
      </AlertDialogContent>
    </AlertDialog>
  );
}
