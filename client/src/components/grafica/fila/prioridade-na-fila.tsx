// PRIORIDADE NA IMPRESSÃO na linha e no cartão da Gráfica (dono, 08/10): o
// pedido da Solicitação mora ao lado do Travar — as duas ações dela nesta
// fila. Quem vê, quando e o que faz: shared/prioridade-na-impressao.ts.
import type { SeloPecaEventoFinalizado } from "@/lib/status";
import { PrioridadeNaImpressao } from "@/components/prioridade-na-impressao";
import type { PecaDaFila } from "@/components/grafica/tipos";

export function ControleDePrioridadeNaFila({ item, selo, fonte, alvo, linhaPropria = false }: {
  item: PecaDaFila;
  /** Selo de evento finalizado (null = evento em jogo): pedir some, retirar fica. */
  selo: SeloPecaEventoFinalizado | null;
  fonte: number;
  alvo: number;
  /** No cartão: ocupa uma linha própria do bloco de selos (como o Travar). */
  linhaPropria?: boolean;
}) {
  return (
    <PrioridadeNaImpressao
      item={item}
      eventoFinalizado={!!selo}
      tamanho="sm"
      fonte={fonte}
      alvo={alvo}
      naFilaDaGrafica
      // Linha própria nos dois: no cartão, uma linha do bloco de selos; na
      // tabela, abaixo do Travar (a célula de Status não quebra linha).
      envolver={linhaPropria ? { flexBasis: "100%" } : { display: "block", marginTop: 4 }}
    />
  );
}
