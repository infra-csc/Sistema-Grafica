// AUDITORIA DO BOOK COM IA (dono, 19/10) — os dados da tela de Eventos e do
// número do menu. Uma chave só (/api/auditorias-do-book): o tempo real
// (auditorias_do_book) e a marcação de um achado atualizam os dois juntos.
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  podeVerAuditoriaDoBook, resumirAuditorias,
  type AuditoriaDoBookVista, type MotivoDaResolucao, type RespostaDasAuditorias,
} from "@shared/auditoria-do-book";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export const CHAVE_DAS_AUDITORIAS = ["/api/auditorias-do-book"] as const;

const VAZIO: AuditoriaDoBookVista[] = [];

/** Só a leitura — o menu lateral usa isto. */
export function useResumoDasAuditorias(usuario: { role?: string | null; kit?: boolean | null } | null | undefined) {
  const habilitado = podeVerAuditoriaDoBook(usuario?.role, usuario?.kit);
  const q = useQuery<RespostaDasAuditorias>({ queryKey: CHAVE_DAS_AUDITORIAS, enabled: habilitado });
  const auditorias = q.data?.auditorias ?? VAZIO;
  const resumo = useMemo(() => resumirAuditorias(auditorias), [auditorias]);
  return { habilitado, auditorias, resumo, semChave: q.data?.semChave === true, carregando: habilitado && q.isLoading, erro: q.isError, recarregar: q.refetch };
}

/** Leitura + marcar achado ("Já cadastrei", "Não precisa", "Já conferi", desfazer). */
export function useAuditoriasDoBook(usuario: { role?: string | null; kit?: boolean | null; name?: string | null; id?: string | null } | null | undefined) {
  const base = useResumoDasAuditorias(usuario);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const resolver = useMutation({
    mutationFn: async (v: { auditoriaId: string; chave: string; motivo: MotivoDaResolucao | null }) => {
      const res = await apiRequest("POST", `/api/auditorias-do-book/${v.auditoriaId}/resolver`, { chave: v.chave, motivo: v.motivo });
      return res.json();
    },
    // A contagem cai NA HORA (dono: "contagem cai na hora"): o cache é
    // atualizado antes da resposta e volta atrás se o servidor recusar.
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: CHAVE_DAS_AUDITORIAS });
      const anterior = queryClient.getQueryData<RespostaDasAuditorias>(CHAVE_DAS_AUDITORIAS);
      if (anterior) {
        queryClient.setQueryData<RespostaDasAuditorias>(CHAVE_DAS_AUDITORIAS, {
          ...anterior,
          auditorias: anterior.auditorias.map((a) => {
            if (a.id !== v.auditoriaId) return a;
            const resolvidos = { ...a.resolvidos };
            if (v.motivo) resolvidos[v.chave] = { motivo: v.motivo, por: usuario?.name ?? null, porId: usuario?.id ?? null, em: new Date().toISOString() };
            else delete resolvidos[v.chave];
            return { ...a, resolvidos };
          }),
        });
      }
      return { anterior };
    },
    onError: (erro, _v, ctx) => {
      if (ctx?.anterior) queryClient.setQueryData(CHAVE_DAS_AUDITORIAS, ctx.anterior);
      toast({ variant: "destructive", title: "Não deu para marcar o achado", description: erro instanceof Error ? erro.message : undefined });
    },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: CHAVE_DAS_AUDITORIAS }); },
  });

  return { ...base, resolver };
}

export type AuditoriasDoBook = ReturnType<typeof useAuditoriasDoBook>;
