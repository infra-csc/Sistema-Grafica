// ─────────────────────────────────────────────────────────────────────────────
// O MODAL DE ENTRADA DE PEÇAS — Entrada Rápida (grade em lote) ou o
// formulário simples (uma peça, do Kit, ou atendendo uma solicitação).
// ─────────────────────────────────────────────────────────────────────────────
import type { ComponentProps } from "react";
import { Plus, List } from "lucide-react";
import type { Sponsor } from "@shared/schema";
import type { RemessaDoKit } from "@shared/kit";
import { patrocinadoresDaLinha } from "@shared/pedidos-de-peca";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { useConfirmar } from "@/components/ui/usar-confirmar";
import { BulkItemEntry } from "@/components/bulk-item-entry";
import { ModalHeader, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { T, FS, FW, R } from "@/lib/theme";
import { ItemForm } from "./formulario-da-peca";
import { itemTypes } from "./regras";
import type { FormularioDaPeca } from "./use-formulario-da-peca";
import type { AcoesDasPecas } from "./use-detalhe-do-evento-acoes";
import type { EventoDoDetalhe, ModeloDePeca, PecaDoEvento, UsuarioLogado } from "./tipos";

export function ModalDeEntradaDePecas({
  form, event, eventId, user, isMobile, standardItems, sponsors, items, materialOptions, finishOptions,
  remessasDoKit, acoes, confirmar, handleSubmit, getUploadUrl,
}: {
  form: FormularioDaPeca;
  event: EventoDoDetalhe;
  eventId: string | undefined;
  user: UsuarioLogado;
  isMobile: boolean;
  standardItems: ModeloDePeca[];
  sponsors: Sponsor[];
  items: PecaDoEvento[];
  materialOptions: string[];
  finishOptions: string[];
  remessasDoKit: RemessaDoKit[];
  acoes: Pick<AcoesDasPecas, "createBulkItemsMutation" | "createItemMutation" | "updateItemMutation">;
  confirmar: ReturnType<typeof useConfirmar>["confirmar"];
  handleSubmit: (e: React.FormEvent) => void;
  getUploadUrl: () => Promise<{ method: "PUT"; url: string }>;
}) {
  const {
    open, setOpen, bulkMode, setBulkMode, editingItem, pedidoEmAtendimento, bulkTemConteudoRef, bulkSavedTick,
    bulkLeftoverRef, formData, setFormData, customMaterial, setCustomMaterial, customFinish, setCustomFinish,
    localRefPreview, setLocalRefPreview, handleCloseDialog,
  } = form;
  const { createBulkItemsMutation, createItemMutation, updateItemMutation } = acoes;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        handleCloseDialog();
      } else {
        setOpen(true);
      }
    }}>
      <DialogContent
        className={`${bulkMode && !editingItem ? "max-w-[95vw] h-[90vh] p-0 gap-0 flex flex-col" : "p-0 gap-0"} ${HIDE_NATIVE_CLOSE}`}
        style={bulkMode && !editingItem
          ? { display: 'flex', flexDirection: 'column', overflow: 'hidden' }
          : { maxWidth: isMobile ? '95vw' : '800px', width: '100%', padding: 0, backgroundColor: T.surface, borderRadius: '16px', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        // Bloquear ESC/clique-fora SÓ no modo lote (onde há grade com
        // linhas não salvas). No modo simples o fechamento acidental
        // não custa nada e o bloqueio só irritava.
        onInteractOutside={(e) => { if (bulkMode && !editingItem) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (bulkMode && !editingItem) e.preventDefault(); }}
      >
        {/* POR QUE congelar aqui: os três onSuccess que fecham este
            modal (criar peça, criar em lote, atualizar) invalidam duas
            chaves de /api/items, fecham, toastam e ainda mexem no que
            o modal está exibindo — `setFormData(EMPTY_ITEM_FORM)` e
            `setBulkMode(false)`. Esse último é o pior: trocar bulkMode
            no mesmo commit do fechamento faz a subárvore em
            desmontagem passar do modo LOTE para o modo SIMPLES no meio
            do fade, o que remonta a árvore inteira dentro do Presence.
            Mecanismo por extenso em components/modal-shell.tsx. */}
        <FreezeWhileClosing open={open}>
        <DialogTitle className="sr-only">{bulkMode && !editingItem ? "Entrada Rápida" : "Adicionar Peça"}</DialogTitle>
        <DialogDescription className="sr-only">
          {bulkMode && !editingItem ? "Modo lote — entrada rápida de peças" : "Nova peça de produção"}
        </DialogDescription>
        {/* Header no padrão ModalHeader. O X do modo lote é a única
            saída além de salvar: confirma antes de descartar as linhas
            não salvas — pelo useConfirmar do app (o window.confirm
            travava a thread e congelava a grade atrás da pergunta). */}
        <ModalHeader
          icon={bulkMode && !editingItem ? List : Plus}
          tint={T.accentText}
          title={bulkMode && !editingItem ? "Entrada Rápida" : "Adicionar Peça"}
          subtitle={bulkMode && !editingItem ? "Modo Lote — entrada rápida de peças" : (pedidoEmAtendimento ? `Atendendo solicitação do Atendimento — ${pedidoEmAtendimento.linha.quantidade} un. · ${patrocinadoresDaLinha(pedidoEmAtendimento.linha)}` : (event.name || "Nova peça de produção"))}
          // Pergunta SÓ se a grade tem algo digitado: com ela vazia, a
          // confirmação era um clique a mais para não perder nada.
          onClose={bulkMode && !editingItem
            ? async () => {
                if (bulkTemConteudoRef.current) {
                  const ok = await confirmar({
                    titulo: "Descartar linhas não salvas?",
                    descricao: "O que foi digitado na grade e ainda não foi salvo se perde ao fechar.",
                    confirmar: "Descartar",
                    cancelar: "Continuar editando",
                    perigo: true,
                  });
                  if (!ok) return;
                }
                handleCloseDialog();
              }
            : handleCloseDialog}
          // Atendendo um pedido, a Entrada Rápida some: a peça criada em
          // lote não seria ligada ao pedido.
          trailing={!editingItem && !pedidoEmAtendimento && !user?.kit ? (
            // <button> + .ds-botao, e não <Botao>: as variantes do Botao
            // são para fundo claro, e este mora no cabeçalho escuro.
            <button
              type="button"
              className="ds-botao"
              onClick={() => setBulkMode(!bulkMode)}
              data-testid="button-toggle-mode"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)', borderRadius: R.md, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', fontSize: FS.body, fontWeight: FW.forte, whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {bulkMode ? <Plus className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
              {bulkMode ? "Modo Simples" : "Entrada Rápida"}
            </button>
          ) : undefined}
        />

        {bulkMode && !editingItem ? (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
          <BulkItemEntry
            eventId={eventId!}
            // A grade declara as medidas do modelo como número, mas a API manda o
            // decimal como texto (ou null); ela só as lê com String(), então o
            // mesmo array serve — o cast só alinha as duas declarações.
            standardItems={standardItems as unknown as ComponentProps<typeof BulkItemEntry>["standardItems"]}
            sponsors={sponsors}
            existingItems={items}
            savedTick={bulkSavedTick}
            onSubmit={(items, leftoverCount) => {
              bulkLeftoverRef.current = leftoverCount;
              createBulkItemsMutation.mutate(items);
            }}
            onCancel={handleCloseDialog}
            isPending={createBulkItemsMutation.isPending}
            podePriorizar={user?.role === 'admin' || user?.role === 'solicitacao'}
            onConteudoChange={(tem) => { bulkTemConteudoRef.current = tem; }}
          />
          </div>
        ) : (
          <ItemForm
            mode="create"
            formData={formData}
            setFormData={setFormData}
            standardItems={standardItems}
            typeOptions={itemTypes}
            materialOptions={materialOptions}
            finishOptions={finishOptions}
            customMaterial={customMaterial}
            setCustomMaterial={setCustomMaterial}
            customFinish={customFinish}
            setCustomFinish={setCustomFinish}
            isMobile={isMobile}
            isAdmin={user?.role === 'admin'}
            podePriorizar={user?.role === 'admin' || user?.role === 'solicitacao'}
            remessasDoKit={remessasDoKit}
            kitObrigatorio={!!user?.kit}
            isPending={createItemMutation.isPending || updateItemMutation.isPending}
            onSubmit={handleSubmit}
            onCancel={handleCloseDialog}
            localRefPreview={localRefPreview}
            setLocalRefPreview={setLocalRefPreview}
            getUploadUrl={getUploadUrl}
          />
        )}
        </FreezeWhileClosing>
      </DialogContent>
    </Dialog>
  );
}
