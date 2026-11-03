// ─────────────────────────────────────────────────────────────────────────────
// O MÓDULO REAPROVEITAR (dono, 03/11): "é um módulo que vai todos reaproveitar
// apenas, com as mesmas informações da Gráfica, pois a pessoa vai colocar
// quantos temos no estoque para reaproveitar; caso ele não coloque todos, o item
// vai para a Gráfica produzir". E: "a pessoa que reaproveita não é a mesma que
// faz as coisas da Gráfica".
//
// O CAMINHO:
//   1. a Revisão Final libera a peça pedindo N un. de reaproveitamento (o modal
//      Reaproveitamento, ou a marca da peça). Vindo do ESTOQUE (ou sem origem),
//      nada vira reaproveitado ainda: a peça fica Pronto para Produção com
//      `reusoPedido = N` e NÃO aparece na fila da Gráfica nem nas impressoras;
//   2. no módulo, a pessoa diz quantas tem: POST /api/items/:id/mark-reuse com
//      { respostaDoEstoque: true, qty }. As confirmadas viram reuseQty (a mesma
//      conta de sempre) e `reusoPedido` zera;
//   3. o que faltar fica para imprimir na fila da Gráfica; tudo confirmado, a
//      peça segue para Conferir, como qualquer reaproveitamento.
//
// EM TRÂNSITO continua direto: não sai do estoque, não há o que confirmar.
// ─────────────────────────────────────────────────────────────────────────────

/** Os status em que a resposta ainda faz sentido (a peça foi liberada e não andou). */
const LIBERADA = new Set(["ready_for_production", "pronto_para_producao", "approved", "liberado"]);

type PecaDoPedido = { reusoPedido?: number | null; status?: string | null; quantity?: number | string | null };

/** A peça espera a resposta do módulo Reaproveitar — fora da Gráfica e das impressoras. */
export const aguardaReaproveitar = (p: PecaDoPedido | null | undefined): boolean =>
  !!p && (p.reusoPedido ?? 0) > 0 && LIBERADA.has(String(p.status ?? ""));

/** Quantas a pessoa pode confirmar: o pedido, com teto na quantidade atual da peça. */
export const pedidoDoReaproveitar = (p: PecaDoPedido): number =>
  Math.max(0, Math.min(p.reusoPedido ?? 0, Number(p.quantity ?? p.reusoPedido ?? 0)));

/**
 * A peça é do módulo: espera a resposta ou foi reaproveitada por inteiro. Na fila
 * da Gráfica ela só aparece com o filtro de reaproveitamento ou buscada (dono,
 * 03/11: "só no Reaproveitar; na Gráfica, apenas se fizerem o filtro"). A parcial
 * continua na fila: ainda há o que imprimir.
 */
export const ficaNoReaproveitar = (p: PecaDoPedido & { isReuse?: boolean | null; reuseQty?: number | string | null }): boolean => {
  if (p.isReuse || aguardaReaproveitar(p)) return true;
  const reuso = Number(p.reuseQty) || 0;
  return reuso > 0 && reuso >= (Number(p.quantity) || 0);
};

/** A liberação pede ao estoque, ou aplica direto? Só "em trânsito" aplica direto. */
export const pedeAoEstoque = (origem: string | null | undefined): boolean => origem !== "em_transito";

/** A recusa de quem tenta imprimir antes da resposta (tela velha, script). */
export const FRASE_AGUARDA_REAPROVEITAR = "Esta peça espera a resposta do Reaproveitar — quando disserem quantas têm no estoque, o que faltar vem para a impressora.";

/**
 * O que a tela diz enquanto a pessoa digita (pura, para o teste). O que vai para
 * a Gráfica é a peça MENOS o que saiu do estoque — não só o que faltou do pedido:
 * peça de 10 com pedido de 6 e 4 no estoque imprime 6.
 */
export function fraseDaResposta(temos: number, quantidade: number): string {
  if (temos <= 0) return `Nada no estoque: ${quantidade === 1 ? "a unidade vai" : `as ${quantidade} un. vão`} para a Gráfica produzir.`;
  const resta = quantidade - temos;
  if (resta <= 0) return quantidade === 1 ? "A unidade sai do estoque, nada vai para a impressora." : `As ${quantidade} un. saem do estoque, nada vai para a impressora.`;
  return `${temos} un. ${temos === 1 ? "sai" : "saem"} do estoque e ${resta === 1 ? "1 un. vai" : `${resta} un. vão`} para a Gráfica produzir.`;
}

/** A linha da trilha da resposta. */
export function trilhaDaResposta(temos: number, pedido: number, quantidade: number): string {
  const resta = Math.max(0, quantidade - temos);
  const destino = resta > 0 ? ` — ${resta} un. vão para a Gráfica produzir` : "";
  return temos <= 0
    ? `Reaproveitar: nada no estoque (pedidas ${pedido} un.)${destino}`
    : `Reaproveitar: estoque confirmou ${temos} de ${pedido} un. pedidas${destino}`;
}
