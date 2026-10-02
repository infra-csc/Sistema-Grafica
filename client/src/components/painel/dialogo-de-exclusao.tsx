// ─── Confirmação de exclusão (Admin ou Solicitação, em qualquer status) ─────
import type { Dispatch, SetStateAction } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MODAL_RADIUS, MODAL_SHADOW } from "@/components/modal-shell";
import { Loader2, Trash2 } from "lucide-react";
import { FS, FW, R, T, TOM, FONT } from "@/lib/theme";
import { MiniaturaDaPeca } from "./miniatura-da-peca";
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
      <AlertDialogContent style={{ width: "96vw", maxWidth: 440, backgroundColor: T.surface, borderRadius: MODAL_RADIUS, padding: 0, border: "none", boxShadow: MODAL_SHADOW, maxHeight: "calc(100vh - 48px)", overflowY: "auto", gap: 0 }}>
        {(() => {
          const item = deleteConfirmItemId ? items.find((i) => i.id === deleteConfirmItemId) : undefined;
          return (
            <>
              <div style={{ padding: "24px 24px 0", display: "flex", gap: 14, alignItems: "flex-start" }}>
                {/* O ladrilho diz "ação que tira algo" antes de qualquer
                    palavra — o mesmo da confirmação do app (useConfirmar). */}
                <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: R.lg, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: TOM.perigo.bg, border: `1px solid ${TOM.perigo.border}`, color: TOM.perigo.text }}>
                  <Trash2 style={{ width: 18, height: 18 }} />
                </span>
                <AlertDialogHeader style={{ textAlign: "left", gap: 6, minWidth: 0 }}>
                  <AlertDialogTitle style={{ fontFamily: FONT.display, fontSize: FS.title + 1, fontWeight: 800, letterSpacing: "-0.02em", color: T.text, lineHeight: 1.25 }}>Excluir peça?</AlertDialogTitle>
                  {/* #57534e sobre #ffffff = 7,63:1 ✓ — o mesmo cinza de leitura
                      que a tela usa em texto de apoio. O texto antigo
                      ("permanece no histórico de auditoria") descrevia o LOG,
                      não a peça — e escondia que a ação é reversível. */}
                  <AlertDialogDescription style={{ fontSize: FS.body, lineHeight: 1.55, color: T.apoio }}>
                    Ela sai das listagens e vai para a lixeira. Um administrador pode restaurá-la a qualquer momento.
                  </AlertDialogDescription>
                </AlertDialogHeader>
              </div>
              {/* QUAL peça — com a arte, o código e o tipo. Quem confirma lê
                  isto, não o título; numa lista de 60 linhas iguais, "Excluir
                  peça?" sozinho não diz se o clique foi na linha certa. */}
              {item && (
                <div data-testid="exclusao-identidade" style={{ margin: "16px 24px 0", padding: 10, display: "flex", alignItems: "center", gap: 12, border: `1px solid ${T.border}`, borderRadius: R.lg, backgroundColor: T.bg }}>
                  <MiniaturaDaPeca url={item.approvalThumbUrl} tamanho={48} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                      <span style={{ fontFamily: FONT.mono, fontSize: FS.body, fontWeight: 700, color: T.accentText }}>{item.displayId}</span>
                      <span style={{ fontSize: FS.meta, fontWeight: FW.forte, color: T.strong, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.type}</span>
                    </p>
                    {item.description && (
                      <p style={{ margin: "2px 0 0", fontSize: FS.meta, color: T.apoio, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.description}</p>
                    )}
                    {item.event?.name && (
                      <p style={{ margin: "2px 0 0", fontSize: FS.small, color: T.second, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.event.name}</p>
                    )}
                  </div>
                </div>
              )}
            </>
          );
        })()}
        <AlertDialogFooter style={{ padding: "20px 24px 24px", gap: 8 }}>
          <AlertDialogCancel disabled={deleteItemMutation.isPending} className="pnl-dlg-cancelar" style={{ height: 40, borderRadius: R.md, borderColor: T.border, color: T.strong, fontWeight: 700, fontSize: FS.body, marginTop: 0 }}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            // preventDefault: o AlertDialogAction fecha o diálogo no clique;
            // fechado, o "Excluindo..." nunca aparecia. Quem fecha agora é o
            // onSuccess da mutação (setDeleteConfirmItemId(null)).
            onClick={(e) => {
              e.preventDefault();
              if (deleteConfirmItemId) deleteItemMutation.mutate(deleteConfirmItemId);
            }}
            disabled={deleteItemMutation.isPending}
            /* #b91c1c — o vermelho destrutivo do app (texto branco 6,47:1).
               Um app não tem dois vermelhos de "apagar". */
            className="pnl-dlg-excluir"
            style={{ backgroundColor: TOM.perigo.text, color: T.surface, fontWeight: 700, fontSize: FS.body, height: 40, borderRadius: R.md, gap: 8 }}
            data-testid="button-confirm-delete"
          >
            {deleteItemMutation.isPending
              ? <><Loader2 aria-hidden="true" className="animate-spin" style={{ width: 15, height: 15 }} />Excluindo...</>
              : <><Trash2 aria-hidden="true" style={{ width: 15, height: 15 }} />Excluir peça</>}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
