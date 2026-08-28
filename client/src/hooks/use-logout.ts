import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, resetItensDelta } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * Fluxo único de logout — antes vivia copiado em App.tsx (menu do avatar) e
 * app-sidebar.tsx (botão do rodapé), e qualquer ajuste tinha de ser feito em
 * dois lugares. Limpa o cache e redireciona para o hub (ou /login).
 */
export function useLogout() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/logout");
      return await res.json();
    },
    onSuccess: () => {
      resetItensDelta();
      queryClient.clear();
      // O toast que existia aqui vinha DEPOIS do redirect — nunca aparecia.
      window.location.href = import.meta.env.VITE_HUB_URL ?? "/login";
    },
    onError: (error: any) => {
      // Sem isto, uma falha de rede no logout era silêncio absoluto.
      toast({ title: "Erro ao sair", description: error?.message || "Tente novamente.", variant: "destructive" });
    },
  });
}
