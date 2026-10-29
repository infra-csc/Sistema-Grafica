// PEÇAS DEVOLVIDAS PARA O RASCUNHO (dono, 29/10) — os dados do número do menu
// (Painel Geral), do aviso no topo do Painel e do motivo no card de rascunhos
// do evento. Uma chave só, que começa com /api/items: o tempo real das peças a
// atualiza, e o envio do rascunho de novo tira a peça do aviso sozinho.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PecaDevolvida, RespostaDevolvidas } from "@shared/devolvidas-ao-rascunho";

export const CHAVE_DAS_DEVOLVIDAS = ["/api/items", "devolvidas-ao-rascunho"] as const;

const VAZIO: PecaDevolvida[] = [];

/** Quem recebe a peça devolvida de volta: a Solicitação (o Kit vê só as dele) e o admin. */
export const recebeDevolvidas = (role: string | null | undefined) => role === "solicitacao" || role === "admin";

export function useDevolvidasAoRascunho(usuario: { role?: string | null } | null | undefined) {
  const habilitado = recebeDevolvidas(usuario?.role);
  const q = useQuery<RespostaDevolvidas>({ queryKey: CHAVE_DAS_DEVOLVIDAS, enabled: habilitado });
  const pecas = q.data?.pecas ?? VAZIO;
  const porId = useMemo(() => new Map(pecas.map((p) => [p.id, p])), [pecas]);
  return { habilitado, pecas, porId };
}
