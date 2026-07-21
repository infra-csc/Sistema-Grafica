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

  return {
    updateReferenceUrlMutation,
    removeReferenceUrlMutation,
  };
}
