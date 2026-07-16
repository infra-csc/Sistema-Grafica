// Hook extraído de event-detail.tsx: mutations de flags simples de um item
// (skipApproval, isReuse). Mantém as mesmas query keys, invalidateQueries e
// toasts que existiam originalmente na página.
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface UseEventItemFlagsParams {
  eventId: string | undefined;
}

export function useEventItemFlags({ eventId }: UseEventItemFlagsParams) {
  const { toast } = useToast();

  // Mutation para atualizar skipApproval de um item
  const updateItemSkipApprovalMutation = useMutation({
    mutationFn: async ({ itemId, skipApproval }: { itemId: string, skipApproval: boolean }) => {
      await apiRequest("PATCH", `/api/items/${itemId}`, { skipApproval });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar configuração",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para atualizar isReuse de um item
  const updateItemIsReuseMutation = useMutation({
    mutationFn: async ({ itemId, isReuse }: { itemId: string, isReuse: boolean }) => {
      await apiRequest("PATCH", `/api/items/${itemId}`, { isReuse });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    },
  });

  return {
    updateItemSkipApprovalMutation,
    updateItemIsReuseMutation,
  };
}
