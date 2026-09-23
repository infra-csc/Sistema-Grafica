// ─────────────────────────────────────────────────────────────────────────────
// O MODAL DE EDITAR PEÇA — o formulário de peça no modo edição, com a
// quantidade travada (reduz até o piso físico) quando a peça já está em
// produção.
// ─────────────────────────────────────────────────────────────────────────────
import { Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ModalHeader, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { entrouEmProducao } from "@/components/aumentar-quantidade-dialog";
import { reductionFloorOf } from "@/lib/saldo";
import { tiposOferecidos } from "@shared/molde";
import { T } from "@/lib/theme";
import { ItemForm } from "./formulario-da-peca";
import { itemTypes } from "./regras";
import type { FormularioDaPeca } from "./use-formulario-da-peca";
import type { AcoesDasPecas } from "./use-detalhe-do-evento-acoes";
import type { ModeloDePeca, UsuarioLogado } from "./tipos";

export function EditarPecaDialog({
  form, user, isMobile, standardItems, materialOptions, finishOptions, updateItemMutation, getUploadUrl,
}: {
  form: FormularioDaPeca;
  user: UsuarioLogado;
  isMobile: boolean;
  standardItems: ModeloDePeca[];
  materialOptions: string[];
  finishOptions: string[];
  updateItemMutation: AcoesDasPecas["updateItemMutation"];
  getUploadUrl: () => Promise<{ method: "PUT"; url: string }>;
}) {
  const {
    editDialogOpen, editingItem, formData, setFormData, customMaterial, setCustomMaterial, customFinish,
    setCustomFinish, localRefPreview, setLocalRefPreview, handleCloseEditDialog,
  } = form;
  return (
    <Dialog open={editDialogOpen} onOpenChange={(o) => { if (!o) handleCloseEditDialog(); }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={{ maxWidth: isMobile ? "95vw" : "800px", width: "100%", padding: "0", backgroundColor: T.surface, borderRadius: "16px", overflow: "hidden", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        {/* POR QUE congelar aqui: o onSuccess de atualizar peça invalida
            /api/items, fecha este diálogo e faz `setEditingItem(null)` no
            mesmo commit — e é `editingItem` que escreve o título
            ("PEC-123 — Backdrop") e o subtítulo do cabeçalho. Sem congelar,
            o cabeçalho cai para "Editar Peça" genérico durante o fade, e os
            renders da invalidação ainda batem na subárvore em desmontagem. */}
        <FreezeWhileClosing open={editDialogOpen}>
        <DialogTitle className="sr-only">Editar Peça</DialogTitle>
        <DialogDescription className="sr-only">Atualize as informações da peça</DialogDescription>
        <ModalHeader
          icon={Pencil}
          tint={T.accentText}
          title={editingItem ? `${editingItem.displayId} — ${editingItem.type}` : "Editar Peça"}
          subtitle={editingItem?.description || "Atualize as informações da peça"}
          onClose={handleCloseEditDialog}
        />
        <ItemForm
          mode="edit"
          formData={formData}
          setFormData={setFormData}
          standardItems={standardItems}
          // Fora do rascunho, a fronteira do molde fica fechada (o servidor
          // responde 409): a peça comum não vê "Molde" e o molde só é molde.
          typeOptions={tiposOferecidos(editingItem, itemTypes)}
          materialOptions={materialOptions}
          finishOptions={finishOptions}
          customMaterial={customMaterial}
          setCustomMaterial={setCustomMaterial}
          customFinish={customFinish}
          setCustomFinish={setCustomFinish}
          isMobile={isMobile}
          isAdmin={user?.role === 'admin'}
                  podePriorizar={user?.role === 'admin' || user?.role === 'solicitacao'}
          isPending={updateItemMutation.isPending}
          onSubmit={(e) => {
            e.preventDefault();
            if (editingItem) {
              updateItemMutation.mutate({ id: editingItem.id, data: formData });
            }
          }}
          onCancel={handleCloseEditDialog}
          localRefPreview={localRefPreview}
          setLocalRefPreview={setLocalRefPreview}
          getUploadUrl={getUploadUrl}
          quantityLocked={entrouEmProducao(editingItem)}
          quantityFloor={reductionFloorOf(editingItem ?? {})}
          quantityCeiling={Number(editingItem?.quantity) || 1}
        />
        </FreezeWhileClosing>
      </DialogContent>
    </Dialog>
  );
}
