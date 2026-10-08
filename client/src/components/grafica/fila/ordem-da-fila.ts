// ─────────────────────────────────────────────────────────────────────────────
// A ORDEM DA FILA DA GRÁFICA — quem vem primeiro na lista.
//
// Os critérios, nesta ordem:
//   0. a PRIORITÁRIA vem PRIMEIRO DE TODA A FILA, à frente de qualquer evento
//      (dono, 08/10: "na Gráfica também" — junto do botão "Pedir prioridade na
//      impressão"). Até 08/10 ela só subia para o topo do bloco do SEU evento
//      (dono, 27/08). As prioritárias formam um grupo próprio no topo
//      ("Prioritárias", lista-da-fila.tsx), e entre elas valem os critérios
//      abaixo — o mesmo vale para o resto da fila;
//   1. a SAÍDA DO CAMINHÃO mais próxima no topo (sem data vai para o fim) — a
//      Gráfica trabalha por evento e pelo caminhão marcado;
//   2. o NOME DO EVENTO desempata (e mantém os blocos de evento contíguos);
//   3. o TIPO agrupa dentro do evento;
//   4. o CÓDIGO da peça, com `compareDisplayId`: o complemento COLA na mãe
//      (#0062 → #0062-C1 → #0062-C2 → #0063). O filho herda evento e tipo, então
//      os critérios de cima empatam e ele cai logo abaixo dela — sem isto
//      "#0062-C1" ordenaria como 621, a centenas de linhas da mãe.
//
// POR QUE CHAVES PRÉ-CALCULADAS (perf, 07/10). Com 6 mil peças o sort faz ~80
// mil comparações, e cada uma lia a data num Map e chamava `localeCompare` no
// nome do evento e no tipo — ~100 ms de thread principal a cada versão nova
// da fila (carga, delta do tempo real, polling). Agora cada peça ganha UMA vez
// a data, a POSIÇÃO do seu evento e do seu tipo na ordem alfabética (mesma
// régua: `localeCompare`; textos que ele considera iguais ganham a mesma
// posição, e aí a comparação termina empatada como antes) — e o sort compara
// números. O resultado é peça a peça o mesmo do comparador antigo
// (perf9-grafica-carga.test.ts compara os dois com filas sorteadas).
// ─────────────────────────────────────────────────────────────────────────────
import { compareDisplayId } from "@/lib/displayId";

/** O que a ordem lê da peça. */
export interface PecaOrdenavel {
  type: string;
  displayId?: string | null;
  isPriority?: boolean | null;
  event?: { name?: string | null; truckDepartureDate?: string | Date | null } | null;
}

/** A posição de cada texto na ordem de `localeCompare` (iguais para ele = mesma posição). */
function posicoes(textos: Iterable<string>): Map<string, number> {
  const unicos = Array.from(new Set(textos)).sort((a, b) => a.localeCompare(b));
  const pos = new Map<string, number>();
  let n = 0;
  for (let k = 0; k < unicos.length; k++) {
    if (k > 0 && unicos[k - 1].localeCompare(unicos[k]) !== 0) n++;
    pos.set(unicos[k], n);
  }
  return pos;
}

/** A chave do grupo das prioritárias no topo da fila (o corte por bloco e os cabeçalhos a leem). */
export const CHAVE_DAS_PRIORITARIAS = "__prioritarias__";

/** A fila na ordem de trabalho (cópia; `items` não é alterado). Estável. */
export function ordenarFilaDaGrafica<T extends PecaOrdenavel>(items: readonly T[]): T[] {
  const nomeDoEvento = (i: T) => i.event?.name || "";
  const posDoEvento = posicoes(items.map(nomeDoEvento));
  const posDoTipo = posicoes(items.map((i) => i.type));
  const chaves = items.map((peca) => {
    const saida = peca.event?.truckDepartureDate;
    const evento = nomeDoEvento(peca);
    return {
      peca,
      saida: saida ? new Date(saida).getTime() : Infinity,
      evento,
      posEvento: posDoEvento.get(evento)!,
      prioritaria: Number(!!peca.isPriority),
      tipo: peca.type,
      posTipo: posDoTipo.get(peca.type)!,
    };
  });
  chaves.sort((a, b) => {
    const prio = b.prioritaria - a.prioritaria;
    if (prio !== 0) return prio;
    if (a.saida !== b.saida) return a.saida - b.saida;
    if (a.evento !== b.evento) return a.posEvento - b.posEvento;
    if (a.tipo !== b.tipo) return a.posTipo - b.posTipo;
    return compareDisplayId(a.peca.displayId, b.peca.displayId);
  });
  return chaves.map((c) => c.peca);
}
