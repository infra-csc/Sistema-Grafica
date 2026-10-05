// ─────────────────────────────────────────────────────────────────────────────
// A CONFIRMAÇÃO DE EXCLUIR PEÇA — diz QUAL peça e a volta (a exclusão é soft:
// Peças Excluídas restaura).
//
// No padrão das confirmações da casa (Encerrar evento, Confirmar envio): o
// cabeçalho claro com o ícone, a peça em destaque num bloco próprio (código,
// tipo, descrição e a miniatura, se houver) e a frase da volta embaixo. Antes
// a pergunta inteira era um parágrafo em negrito, e a peça se perdia no meio.
// ─────────────────────────────────────────────────────────────────────────────
import { Trash2, RotateCcw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Botao } from "@/components/ui/botao";
import { ModalHeader, modalSurface } from "@/components/modal-shell";
import { StatusBadge } from "@/components/status-badge";
import { refsDaPeca } from "@/lib/refs-da-peca";
import { miniatura } from "@/lib/miniatura";
import { statusDeExibicao } from "@shared/molde";
import { T, N, TOM, FONT, FS, FW, R } from "@/lib/theme";
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
  const ref = deletingItem ? refsDaPeca(deletingItem)[0] : undefined;
  return (
    // Fechar no meio da exclusão perderia o retorno (toast/erro): o pedido de
    // fechar só passa quando nada está correndo.
    <AlertDialog open={!!deletingItem} onOpenChange={(o) => { if (!o && !deleteItemMutation.isPending) setDeletingItem(null); }}>
      <AlertDialogContent style={{ ...modalSurface(440), gap: 0 }}>
        <AlertDialogTitle className="sr-only">Excluir peça</AlertDialogTitle>
        <ModalHeader variant="confirm" icon={Trash2} tint={TOM.perigo.text} title="Excluir peça" />

        <div style={{ padding: "18px 24px 6px", overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
          {deletingItem && (
            <div
              data-testid="peca-a-excluir"
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: N.n1, marginBottom: 14 }}
            >
              {ref && (
                <img src={miniatura(ref)} alt="" aria-hidden="true" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: R.sm, border: `1px solid ${T.border}`, flexShrink: 0, backgroundColor: T.low }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: FONT.mono, fontWeight: FW.forte, fontSize: FS.body, color: T.accentText }}>{deletingItem.displayId ?? "—"}</span>
                  <span style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>{deletingItem.type ?? "sem tipo"}</span>
                </div>
                {deletingItem.description && (
                  <div style={{ fontSize: FS.meta, color: T.apoio, marginTop: 2, overflowWrap: "anywhere" }}>{deletingItem.description}</div>
                )}
              </div>
              <span style={{ flexShrink: 0 }}><StatusBadge status={statusDeExibicao(deletingItem)} short /></span>
            </div>
          )}
          {/* Diz a VOLTA: a exclusão é soft (Peças Excluídas restaura).
              "Permanece no histórico" soava como "some para sempre, mas fica
              um registro" — e fazia a pessoa hesitar sem motivo. */}
          <AlertDialogDescription style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: FS.body, color: T.apoio, lineHeight: 1.55, margin: 0 }}>
            <RotateCcw aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, marginTop: 3, color: T.second }} />
            <span>
              {deletingItem && <span className="sr-only">Excluir a peça {deletingItem.displayId ?? ""} — {deletingItem.type ?? "sem tipo"}{deletingItem.description ? ` (${deletingItem.description})` : ""}. </span>}
              A peça sai da lista e vai para <strong style={{ color: T.text, fontWeight: FW.medio }}>Peças Excluídas</strong>, de onde pode ser restaurada. O histórico de auditoria continua guardado.
            </span>
          </AlertDialogDescription>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "16px 24px 20px", flexShrink: 0 }}>
          <AlertDialogCancel asChild>
            <Botao variante="secundario" tamanho={dedo ? 'toque' : 'md'} disabled={deleteItemMutation.isPending} style={{ margin: 0 }}>Cancelar</Botao>
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
              {deleteItemMutation.isPending ? "Excluindo..." : "Excluir peça"}
            </Botao>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
