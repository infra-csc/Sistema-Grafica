// Hook extraído de event-detail.tsx: mutations de atualização/remoção da
// URL de referência visual de um item. Mantém as mesmas query keys,
// invalidateQueries e toasts que existiam originalmente na página.
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface UseEventReferenceParams {
  eventId: string | undefined;
}

export function useEventReference({ eventId }: UseEventReferenceParams) {
  const { toast } = useToast();

  const updateReferenceUrlMutation = useMutation({
    mutationFn: async ({ itemId, referenceUrl }: { itemId: string; referenceUrl: string }) => {
      await apiRequest("PATCH", `/api/items/${itemId}`, { referenceUrl });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      toast({ title: "Referência salva com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao salvar referência", description: error.message, variant: "destructive" });
    },
  });

  const removeReferenceUrlMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiRequest("PATCH", `/api/items/${itemId}`, { referenceUrl: null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      toast({ title: "Referência removida" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao remover referência", description: error.message, variant: "destructive" });
    },
  });

  // MAIS DE UMA referência por peça (25/08): grava a LISTA inteira; o servidor
  // mantém referenceUrl = primeira, para as telas de miniatura única. Remover
  // uma imagem é salvar a lista sem ela; lista vazia limpa os dois campos.
  const salvarReferenciasMutation = useMutation({
    mutationFn: async ({ itemId, referenceUrls }: { itemId: string; referenceUrls: string[] }) => {
      await apiRequest("PATCH", `/api/items/${itemId}`, { referenceUrls });
    },
    onSuccess: (_dados, { referenceUrls }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      toast({ title: referenceUrls.length === 0 ? "Referência removida" : "Referências salvas" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao salvar referências", description: error.message, variant: "destructive" });
    },
  });

  return {
    updateReferenceUrlMutation,
    removeReferenceUrlMutation,
    salvarReferenciasMutation,
  };
}
