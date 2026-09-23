// ─────────────────────────────────────────────────────────────────────────────
// A CONFIRMAÇÃO DE EXCLUIR PEÇA — diz QUAL peça e a volta (a exclusão é soft:
// Peças Excluídas restaura).
// ─────────────────────────────────────────────────────────────────────────────
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Botao } from "@/components/ui/botao";
import { T, FONT } from "@/lib/theme";
import type { AcoesDasPecas } from "./use-detalhe-do-evento-acoes";
import type { PecaDoEvento } from "./tipos";

export function ExcluirPecaDialog({ deletingItem, setDeletingItem, deleteItemMutation, dedo }: {
  /** Objeto inteiro (não só o id): a pergunta escreve QUAL peça vai ser excluída. */
  deletingItem: PecaDoEvento | null;
  setDeletingItem: (item: PecaDoEvento | null) => void;
  deleteItemMutation: AcoesDasPecas["deleteItemMutation"];
  /** Dedo (celular ou tablet do galpão): alvo de 44px. */
  dedo: boolean;
}) {
  return (
    <AlertDialog open={!!deletingItem} onOpenChange={(o) => { if (!o) setDeletingItem(null); }}>
      <AlertDialogContent style={{ width: "96vw", maxWidth: 400, backgroundColor: T.surface, borderRadius: "16px", padding: "32px", border: "none", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
        <AlertDialogHeader style={{ padding: 0, marginBottom: "24px" }}>
          <AlertDialogTitle style={{ fontFamily: FONT.display, fontSize: "18px", fontWeight: 900, letterSpacing: "-0.03em", color: T.text }}>
            Excluir peça
          </AlertDialogTitle>
          <AlertDialogDescription style={{ fontSize: "15px", color: T.second, lineHeight: 1.6, marginTop: "6px" }}>
            {deletingItem && (
              <span style={{ display: "block", fontWeight: 700, color: T.text, marginBottom: 6 }}>
                Excluir a peça {deletingItem.displayId ?? ""} — {deletingItem.type ?? "sem tipo"}?
                {deletingItem.description ? ` (${deletingItem.description})` : ""}
              </span>
            )}
            {/* Diz a VOLTA: a exclusão é soft (Peças Excluídas restaura).
                "Permanece no histórico" soava como "some para sempre, mas
                fica um registro" — e fazia a pessoa hesitar sem motivo. */}
            A peça sai da lista e vai para Peças Excluídas, de onde pode ser restaurada. O histórico de auditoria continua guardado.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter style={{ padding: 0, display: "flex", flexDirection: "row", justifyContent: "flex-end", gap: "10px" }}>
          <AlertDialogCancel asChild>
            <Botao variante="fantasma" tamanho={dedo ? 'toque' : 'md'}>Cancelar</Botao>
          </AlertDialogCancel>
          <AlertDialogAction
            asChild
            // preventDefault: o AlertDialogAction fecha o diálogo no clique;
            // sem impedir, o "Excluindo…" nunca chegava a aparecer. O
            // fechamento acontece no onSuccess da mutation.
            onClick={(e) => {
              e.preventDefault();
              if (deletingItem && !deleteItemMutation.isPending) deleteItemMutation.mutate(deletingItem.id);
            }}
          >
            <Botao
              variante="perigo"
              tamanho={dedo ? 'toque' : 'md'}
              icone={Trash2}
              carregando={deleteItemMutation.isPending}
              data-testid="button-confirm-delete-item"
            >
              {deleteItemMutation.isPending ? "Excluindo..." : "Excluir"}
            </Botao>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
