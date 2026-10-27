// A CONFIGURAÇÃO DE PRAZOS (26/10) — a duração da etapa de Aprovação, em dias
// corridos, que estende o prazo de Layout das peças sem aprovação ("Sem
// patrocínio" e "Arte do cliente"). As telas que calculam prazo no navegador
// (ficha, formulário, Detalhe do Evento, Arte, Calendário) leem DAQUI — nunca
// um 7 escrito no componente. Enquanto a resposta não chega vale o padrão
// (o mesmo que o servidor usa quando a configuração falta).
import { useQuery } from "@tanstack/react-query";
import { DIAS_DA_APROVACAO_PADRAO } from "@shared/prazo-sem-aprovacao";

export interface ConfiguracaoDePrazos {
  diasDaAprovacao: number;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
  padrao: number;
}

export const CHAVE_DA_CONFIGURACAO_DE_PRAZOS = ["/api/configuracoes/prazos"] as const;

export function useConfiguracaoDePrazos() {
  return useQuery<ConfiguracaoDePrazos>({
    queryKey: CHAVE_DA_CONFIGURACAO_DE_PRAZOS,
    // Muda raramente (o admin, em Configurações) — 5 min de folga.
    staleTime: 5 * 60_000,
  });
}

/** Só o número (padrão 7 até a resposta chegar). */
export function useDiasDaAprovacao(): number {
  return useConfiguracaoDePrazos().data?.diasDaAprovacao ?? DIAS_DA_APROVACAO_PADRAO;
}
