// ─────────────────────────────────────────────────────────────────────────────
// QUEM ESTÁ NA MÁQUINA — o estado do operador no login compartilhado (21/10).
//
// Uma query só (GET /api/operadores) para a tela "Quem está na máquina?" e
// para o selo do topo. Login sem operadores recebe `exigeOperador: false` e
// nada mais acontece. Com operadores, a query se renova a cada minuto, ao
// voltar para a aba e no instante em que o turno vence (`expiraEm`) — o
// servidor é quem decide; a tela só pergunta na hora certa.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import type { EstadoDosOperadores, MotivoDaSaida } from "@shared/operadores";

export const CHAVE_DOS_OPERADORES = ["/api/operadores"] as const;

export function useEstadoDoOperador() {
  const { user } = useAuth();
  const consulta = useQuery<EstadoDosOperadores>({
    queryKey: CHAVE_DOS_OPERADORES,
    // Só o login compartilhado pergunta (o /api/auth/me diz quem é): os
    // demais não fazem requisição nenhuma a mais.
    enabled: user?.loginComOperadores === true,
    staleTime: 20_000,
    refetchOnWindowFocus: true,
    refetchInterval: (q) => (q.state.data?.exigeOperador ? 60_000 : false),
  });

  // Rebusca no minuto em que o turno vence (inatividade ou 12 h).
  const expiraEm = consulta.data?.atual?.expiraEm;
  useEffect(() => {
    if (!expiraEm) return;
    const falta = new Date(expiraEm).getTime() - Date.now() + 1500;
    if (!Number.isFinite(falta) || falta > 13 * 60 * 60 * 1000) return;
    const t = window.setTimeout(() => { void consulta.refetch(); }, Math.max(1000, falta));
    return () => window.clearTimeout(t);
  }, [expiraEm, consulta]);

  return consulta;
}

/** Grava a resposta do servidor no cache: a tela troca na mesma hora. */
const guardar = (estado: EstadoDosOperadores) => queryClient.setQueryData(CHAVE_DOS_OPERADORES, estado);

export function useAcoesDoOperador() {
  const entrar = useMutation({
    mutationFn: async (v: { operadorId: string; pin: string }) =>
      (await apiRequest<EstadoDosOperadores>("POST", "/api/operadores/entrar", v)).json(),
    onSuccess: guardar,
  });
  const criarPin = useMutation({
    mutationFn: async (v: { operadorId: string; pin: string; confirmacao: string }) =>
      (await apiRequest<EstadoDosOperadores>("POST", "/api/operadores/definir-pin", v)).json(),
    onSuccess: guardar,
  });
  const sair = useMutation({
    mutationFn: async (motivo: Exclude<MotivoDaSaida, "troca">) =>
      (await apiRequest<EstadoDosOperadores>("POST", "/api/operadores/sair", { motivo })).json(),
    onSuccess: guardar,
  });
  return { entrar, criarPin, sair };
}
