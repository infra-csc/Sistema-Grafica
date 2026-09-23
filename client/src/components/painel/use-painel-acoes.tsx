// ─── Ações do Painel Geral: excluir, restaurar, copiar e exportar ───────────
import type { Dispatch, SetStateAction } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import type { PecaDoPainel } from "./tipos";

type Avisar = ReturnType<typeof useToast>["toast"];

export function usePainelMutacoes({
  toast, isAdmin, canDeleteAny, setDeleteConfirmItemId, setRestoringItemId, setStatusFilter,
}: {
  toast: Avisar;
  isAdmin: boolean;
  canDeleteAny: boolean;
  setDeleteConfirmItemId: Dispatch<SetStateAction<string | null>>;
  setRestoringItemId: Dispatch<SetStateAction<string | null>>;
  setStatusFilter: Dispatch<SetStateAction<string[]>>;
}) {
  // Restaurar (desfaz o soft delete) — SOMENTE admin; a visão Excluídos era
  // um beco sem saída (dava para ver, não para voltar).
  const restoreItemMutation = useMutation({
    mutationFn: async (itemId: string) => await apiRequest("POST", `/api/items/${itemId}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/deleted"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      toast({ title: "Peça restaurada", description: "Ela voltou às listagens com o status que tinha.", variant: "success" });
    },
    onError: (error) => toast({ title: "Erro ao restaurar", description: error.message, variant: "destructive" }),
    onSettled: () => setRestoringItemId(null),
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => await apiRequest("DELETE", `/api/items/${itemId}`),
    onSuccess: (_res, itemId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/deleted"] });
      // '/api/events' também: sem ela, com o socket caído, quem excluiu via a
      // lista certa e o status do evento errado no resto do app.
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setDeleteConfirmItemId(null);
      // Exclusão aqui é soft delete e existe rota de restore — mas só admin
      // pode chamá-la (solicitacao leva 403). Por isso o desfazer só aparece
      // para quem consegue desfazer; aos demais, o caminho para a lixeira.
      toast({
        title: "Peça excluída",
        description: "Ela saiu das listagens e foi para a lixeira.",
        variant: "success",
        action: isAdmin ? (
          <ToastAction
            altText="Desfazer exclusão"
            onClick={() => { setRestoringItemId(itemId); restoreItemMutation.mutate(itemId); }}
          >
            Desfazer
          </ToastAction>
        ) : canDeleteAny ? (
          <ToastAction altText="Ver a lixeira" onClick={() => setStatusFilter(["deleted"])}>
            Ver na lixeira
          </ToastAction>
        ) : undefined,
      });
    },
    onError: (error) => toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }),
  });

  return { restoreItemMutation, deleteItemMutation };
}

/** Link direto da peça (?peca=<id>) na área de transferência. */
export async function copiarLinkDaPeca(item: PecaDoPainel, toast: Avisar) {
  const url = `${window.location.origin}${window.location.pathname}?peca=${item.id}`;
  try {
    await navigator.clipboard.writeText(url);
    toast({ title: "Link copiado", description: `Link direto da peça ${item.displayId}.`, variant: "success" });
  } catch {
    toast({ title: "Não foi possível copiar", description: url, variant: "warning" });
  }
}

/** Os códigos das peças selecionadas, um por linha. */
export async function copiarIds(selecionadas: PecaDoPainel[], toast: Avisar) {
  const txt = selecionadas.map((i) => i.displayId).join("\n");
  try {
    await navigator.clipboard.writeText(txt);
    toast({ title: "IDs copiados", description: `${selecionadas.length} ${selecionadas.length === 1 ? "ID copiado" : "IDs copiados"}.`, variant: "success" });
  } catch {
    toast({ title: "Não foi possível copiar", description: "O navegador bloqueou o acesso à área de transferência.", variant: "warning" });
  }
}

/** Baixa a planilha do recorte (ou da seleção) — o servidor monta o .xlsx. */
export async function baixarPlanilha({ itens, titulo, toast, setIsExportingXlsx }: {
  itens: PecaDoPainel[];
  titulo: string;
  toast: Avisar;
  setIsExportingXlsx: (v: boolean) => void;
}) {
  setIsExportingXlsx(true);
  try {
    const res = await fetch("/api/items/export-xlsx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ itemIds: itens.map((i) => i.id), title: titulo }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Falha ao gerar o arquivo");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${titulo}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    toast({ title: "Erro ao exportar", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
  } finally {
    setIsExportingXlsx(false);
  }
}
