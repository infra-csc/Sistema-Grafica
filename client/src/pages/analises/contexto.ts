// O que cada aba da Análises (o Painel operacional da gráfica) recebe da
// página: o painel calculado no servidor e as ações de navegação entre abas.
import type { PainelOperacional } from "@shared/painel-operacional";

export const ABAS_DO_PAINEL = [
  { id: "geral", rotulo: "Painel geral" },
  { id: "producao", rotulo: "Produção" },
  { id: "pre", rotulo: "Pré-produção" },
  { id: "problemas", rotulo: "Problemas operacionais" },
  { id: "evento", rotulo: "Status por evento" },
] as const;
export type IdDoPainel = (typeof ABAS_DO_PAINEL)[number]["id"];
export type SubDaProducao = "realizado" | "projecao";

export interface ContextoDoPainel {
  painel: PainelOperacional;
  isMobile: boolean;
  /** Abre "Status por evento" com o evento escolhido. */
  abrirEvento: (chave: string) => void;
  /** O evento aberto em "Status por evento" (null = o padrão: o primeiro atrasado). */
  eventoAberto: string | null;
  sub: SubDaProducao;
  trocarSub: (s: SubDaProducao) => void;
}
