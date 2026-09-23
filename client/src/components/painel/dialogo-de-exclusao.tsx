// ─── Confirmação de exclusão (Admin ou Solicitação, em qualquer status) ─────
import type { Dispatch, SetStateAction } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MODAL_RADIUS, MODAL_SHADOW } from "@/components/modal-shell";
import { T, TOM, FONT } from "@/lib/theme";
import type { PecaDoPainel } from "./tipos";

export function DialogoDeExclusao({ deleteConfirmItemId, setDeleteConfirmItemId, items, deleteItemMutation }: {
  deleteConfirmItemId: string | null;
  setDeleteConfirmItemId: Dispatch<SetStateAction<string | null>>;
  /** Para dizer QUAL peça vai para a lixeira. */
  items: PecaDoPainel[];
  deleteItemMutation: { isPending: boolean; mutate: (itemId: string) => void };
}) {
  return (
    <AlertDialog open={!!deleteConfirmItemId} onOpenChange={open => { if (!open) setDeleteConfirmItemId(null); }}>
      {/* A SUPERFÍCIE VEM DO SISTEMA DE MODAL DO APP, e não de números
          escritos aqui.

          Este era o único modal do Painel Geral e vinha com o shadcn CRU —
          nenhum estilo — enquanto o resto do app já tinha acabamento. É o
          que mais denuncia uma tela feita pela metade: a página refinada e,
          ao confirmar uma exclusão, um modal com cara de biblioteca
          instalada ontem. E confirmar exclusão é o momento de MAIOR atrito
          da tela: é onde a pessoa para para ler.

          A primeira correção copiou os números do Detalhe do Evento (raio
          16, sombra 0 20px 60px). Estava errado por um motivo que só
          apareceu ao ler o modal-shell: aquele arquivo TAMBÉM está fora do
          sistema. Copiar de quem está fora não conserta — só cria a quarta
          superfície artesanal. `modalSurface` é usado por dez telas, e os
          tokens dele são MODAL_RADIUS e MODAL_SHADOW.

          O maxHeight não é detalhe: sem teto, um modal que cresce além da
          janela é cortado EM CIMA E EMBAIXO AO MESMO TEMPO — o Radix centra
          o conteúdo — e some o título junto com o botão de confirmar. Aqui
          o texto é curto, mas ele carrega o nome e o tipo da peça, que numa
          janela baixa quebram em várias linhas. */}
      <AlertDialogContent style={{ width: "96vw", maxWidth: 460, backgroundColor: T.surface, borderRadius: MODAL_RADIUS, padding: 32, border: "none", boxShadow: MODAL_SHADOW, maxHeight: "calc(100vh - 48px)", overflowY: "auto" }}>
        <AlertDialogHeader>
          <AlertDialogTitle style={{ fontFamily: FONT.display, fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em", color: T.text }}>Excluir peça?</AlertDialogTitle>
          {/* #57534e sobre #ffffff = 7,63:1 ✓ — o mesmo cinza de leitura
              que a tela usa em texto de apoio. */}
          <AlertDialogDescription style={{ fontSize: 13, lineHeight: 1.55, color: T.apoio }}>
            {/* O texto antigo ("permanece no histórico de auditoria")
                descrevia o LOG, não a peça — e escondia que a ação é
                reversível. O que acontece é soft delete, com rota de restore. */}
            {deleteConfirmItemId && (() => {
              const item = items.find((i) => i.id === deleteConfirmItemId);
              const alvo = item ? `A peça "${item.displayId} — ${item.type}"` : "A peça";
              return `${alvo} vai para a lixeira. Ela some das listagens, mas um administrador pode restaurá-la a qualquer momento.`;
            })()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteItemMutation.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            // preventDefault: o AlertDialogAction fecha o diálogo no clique;
            // fechado, o "Excluindo..." nunca aparecia. Quem fecha agora é o
            // onSuccess da mutação (setDeleteConfirmItemId(null)).
            onClick={(e) => {
              e.preventDefault();
              if (deleteConfirmItemId) deleteItemMutation.mutate(deleteConfirmItemId);
            }}
            disabled={deleteItemMutation.isPending}
            /* #b91c1c, e não #dc2626. Os dois passam AA com texto branco
               (6,47 e 4,83), então isto não é correção de contraste — é
               consistência: #b91c1c é o vermelho destrutivo que este
               arquivo já usa em outros oito lugares, e ainda por cima o
               mais legível dos dois. Um app não tem dois vermelhos de
               "apagar". */
            style={{ backgroundColor: TOM.perigo.text, color: T.surface, fontWeight: 700 }}
            data-testid="button-confirm-delete"
          >
            {deleteItemMutation.isPending ? "Excluindo..." : "Excluir Peça"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
