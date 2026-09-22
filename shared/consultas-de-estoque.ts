// ─────────────────────────────────────────────────────────────────────────────
// SOLICITAÇÃO AO ESTOQUE A PARTIR DA REVISÃO FINAL (dono, 21/09).
//
// "Na revisão final, quando o usuário de Solicitação colocar, chega como se
// fosse uma solicitação para quem faz o estoque e a triagem; a pessoa procura
// (o sistema sugere também), ela acata ou não, e chega a resposta na revisão
// final se temos ou não." E, com o modal Reaproveitamento na mão: "quando
// clicar aqui e selecionar as quantidades, lá no estoque deve aparecer uma
// SOLICITAÇÃO; ele pode ATENDER, ATENDER PARCIAL ou NÃO CONSEGUIR ATENDER".
//
// As decisões do dono:
//   · a porta de entrada é o modal Reaproveitamento: confirmar (tudo ou N) não
//     aplica mais na hora — PEDE N un. ao estoque;
//   · quem recebe e responde é a GRÁFICA (papéis grafica e admin);
//   · "as respostas do reaproveitar têm que aparecer na REVISÃO, e é ELA que
//     segue com o item": com a peça na Revisão Final a resposta só fica
//     registrada e vem SUGERIDA — ela confirma e libera num clique, e o
//     reaproveitamento entra na mesma transação da liberação (pode usar MENOS
//     do que o estoque atendeu, nunca mais). A resposta nunca libera a peça;
//   · só se a peça JÁ tinha sido liberada é que a resposta aplica o
//     reaproveitamento direto (a regra do mark-reuse); se não couber mais, a
//     resposta é recusada com frase humana e a solicitação segue aberta;
//   · enquanto aberta, a peça PODE ser liberada, com aviso;
//   · o sistema NÃO guarda onde a peça fica no galpão — sem campo de local.
//
// Na interface o nome é "Solicitação ao estoque". Por dentro (tabela, rotas,
// arquivos) ficou "consulta de estoque", o nome do primeiro desenho — é o
// mesmo objeto.
//
// Tudo aqui é PURO: o servidor decide e a tela escreve com as mesmas funções.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A CHAVE ÚNICA da Solicitação ao estoque (dono, 21/09): "o reaproveitar por
 * solicitação, segurar: não vamos implementar agora; segue no fluxo NORMAL de
 * reaproveitar". Desligada (false):
 *   · Revisão Final: o modal Reaproveitamento aplica direto, como antes; sem
 *     selos, chips, filtro ?estoque=, ordem nova nem resumo do lote;
 *   · menu, rota /grafica/solicitacoes-ao-estoque (vai para /grafica),
 *     pré-carga e número do menu somem; o aviso na fila da Gráfica não aparece
 *     nem pede nada ao servidor;
 *   · servidor: a liberação (creator-review) não lê nem grava a tabela; as
 *     rotas /api/consultas-de-estoque* seguem registradas, mas escrita → 404
 *     "Recurso desativado" e leitura → vazio.
 * Para religar: virar para true. A tabela `consultas_de_estoque` já existe em
 * produção (vazia) — não precisa de migração.
 */
export const SOLICITACAO_AO_ESTOQUE_ATIVA: boolean = false;

export const STATUS_DA_CONSULTA = ["aberta", "atendida", "atendida_parcial", "nao_atendida", "cancelada"] as const;
export type StatusDaConsulta = (typeof STATUS_DA_CONSULTA)[number];

export const ROTULO_DA_CONSULTA: Record<StatusDaConsulta, string> = {
  aberta: "Aguardando o estoque",
  atendida: "Atendida",
  atendida_parcial: "Atendida em parte",
  nao_atendida: "Não atendida",
  cancelada: "Cancelada",
};

/** Os status de "já respondida" — a aba Respondidas e os filtros. */
export const STATUS_RESPONDIDOS: StatusDaConsulta[] = ["atendida", "atendida_parcial", "nao_atendida", "cancelada"];

export const MAX_OBSERVACAO_DA_CONSULTA = 1000;

/** A solicitação como a API devolve para a peça (Revisão Final e Gráfica). */
export interface ConsultaDaPeca {
  id: string;
  itemId: string;
  status: StatusDaConsulta;
  quantidadePedida: number;
  quantidadeAtendida: number | null;
  observacao: string | null;
  pedidoPor: string | null;
  pedidoPorId: string | null;
  pedidoEm: string;
  observacaoResposta: string | null;
  fotoUrl: string | null;
  respondidoPor: string | null;
  respondidoEm: string | null;
  aplicadoEm: string | null;
}

/** Só se pede ao estoque peça que está na mesa da Revisão Final. */
export const STATUS_QUE_CONSULTA = "awaiting_final_review";

/** A foto da resposta só pode ser um upload do próprio sistema. */
export const ehFotoValida = (url: unknown): url is string =>
  typeof url === "string" && url.startsWith("/objects/") && url.length <= 500 && !url.includes("..");

const inteiro = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
};

/** O pedido: de 1 até o que a peça ainda não tem reaproveitado. */
export function validarPedido(e: { quantidade: unknown; quantidadeDaPeca: number; jaReaproveitadas: number }):
  { ok: true; quantidade: number } | { ok: false; erro: string } {
  const n = inteiro(e.quantidade);
  if (n == null || Number.isNaN(n) || n < 1) return { ok: false, erro: "Diga quantas unidades pedir ao estoque (número inteiro, mínimo 1)." };
  const cabe = Math.max(0, e.quantidadeDaPeca - Math.max(0, e.jaReaproveitadas));
  if (cabe === 0) return { ok: false, erro: "Esta peça já está toda como reaproveitamento — não há o que pedir ao estoque." };
  if (n > cabe) return { ok: false, erro: `A peça tem ${e.quantidadeDaPeca} un.${e.jaReaproveitadas > 0 ? ` e ${e.jaReaproveitadas} já reaproveitada(s)` : ""} — dá para pedir até ${cabe}.` };
  return { ok: true, quantidade: n };
}

export type RespostaDoEstoque = "atender" | "nao_atender";

export type AtendimentoValidado =
  | { ok: true; atendida: number; status: Exclude<StatusDaConsulta, "aberta" | "cancelada"> }
  | { ok: false; erro: string };

/**
 * A resposta da Gráfica. "atender": a quantidade atendida é o número digitado
 * ou, sem número, a soma das unidades dos ativos escolhidos — de 1 até o que
 * foi PEDIDO (igual ao pedido = atendida; menos = atendida em parte). O número
 * nunca fica abaixo do que foi reservado do acervo. "nao_atender": zero.
 */
export function validarAtendimento(e: { resposta: unknown; quantidade: unknown; quantidadePedida: number; unidadesDosAtivos: number }): AtendimentoValidado {
  if (e.resposta === "nao_atender") return { ok: true, atendida: 0, status: "nao_atendida" };
  if (e.resposta !== "atender") return { ok: false, erro: "Responda atendendo (tudo ou parte) ou dizendo que não consegue atender." };
  const informada = inteiro(e.quantidade);
  if (informada != null && (Number.isNaN(informada) || informada < 1)) {
    return { ok: false, erro: "Diga quantas unidades o estoque atende (número inteiro, mínimo 1)." };
  }
  const atendida = informada ?? e.unidadesDosAtivos;
  if (atendida < 1) return { ok: false, erro: "Diga quantas unidades o estoque atende, ou escolha as peças do acervo." };
  if (atendida > e.quantidadePedida) {
    return { ok: false, erro: `Pediram ${e.quantidadePedida} un. — não dá para atender ${atendida}.` };
  }
  if (e.unidadesDosAtivos > atendida) {
    return { ok: false, erro: `As peças escolhidas do acervo somam ${e.unidadesDosAtivos} un. — mais do que as ${atendida} atendidas.` };
  }
  return { ok: true, atendida, status: atendida >= e.quantidadePedida ? "atendida" : "atendida_parcial" };
}

// ─── O efeito na peça — a regra do mark-reuse ────────────────────────────────

const JA_LIBERADA = new Set(["ready_for_production", "pronto_para_producao", "approved", "liberado", "inProduction", "em_producao"]);
const JA_FECHADA = new Set(["produced", "produzido", "conferred", "conferido", "packed", "embalado", "delivered", "entregue"]);
const CANCELADA = new Set(["canceled", "cancelled", "cancelado"]);

export const pecaJaLiberada = (status: string): boolean => JA_LIBERADA.has(status);

export type EfeitoNaPeca =
  | { ok: true; reuseQty: number; isReuse: boolean; aProduzir: number; /** fecha como Produzido (só peça já liberada) */ fecha: boolean }
  | { ok: false; erro: string };

/**
 * O que o atendimento faz na peça. É o fluxo normal do mark-reuse: SOMA ao que
 * já está reaproveitado, sem invadir o que já foi produzido; `isReuse` quando
 * cobre a peça inteira. Peça já liberada fecha como "Produzido" quando reuso +
 * produção cobrem tudo; peça ainda na revisão (ou de volta na Arte) só guarda
 * o número — quem a fecha é a liberação. Se não cabe mais, recusa com frase de
 * gente: a solicitação continua aberta para ser cancelada.
 */
export function efeitoDoAtendimento(peca: { quantity: number; reuseQty?: number | null; quantityProduced?: number | null; status: string }, atendida: number): EfeitoNaPeca {
  if (CANCELADA.has(peca.status)) return { ok: false, erro: "A peça foi cancelada — não há o que reaproveitar. Responda que não consegue atender, ou peça a quem solicitou para cancelar." };
  if (JA_FECHADA.has(peca.status)) {
    return { ok: false, erro: "A peça já foi impressa — o reaproveitamento não cabe mais. Avise quem pediu para cancelar a solicitação (depois de Produzido, quem ajusta o reaproveitamento é a Solicitação)." };
  }
  const ja = Math.max(0, peca.reuseQty ?? 0);
  const produzidas = pecaJaLiberada(peca.status) ? Math.max(0, peca.quantityProduced ?? 0) : 0;
  const cabe = peca.quantity - ja - produzidas;
  if (atendida > cabe) {
    return {
      ok: false,
      erro: cabe <= 0
        ? `Não cabe mais reaproveitamento nesta peça: ${produzidas} un. já impressa(s) e ${ja} reaproveitada(s) de ${peca.quantity}. Avise quem pediu para cancelar a solicitação.`
        : `Só cabem ${cabe} un. de reaproveitamento agora (${produzidas} já impressa(s), ${ja} reaproveitada(s) de ${peca.quantity}) — atenda até ${cabe}.`,
    };
  }
  const reuseQty = ja + atendida;
  return {
    ok: true,
    reuseQty,
    isReuse: reuseQty >= peca.quantity,
    aProduzir: Math.max(0, peca.quantity - reuseQty - produzidas),
    fecha: pecaJaLiberada(peca.status) && reuseQty + produzidas >= peca.quantity,
  };
}

// ─── As frases — fixadas por teste ───────────────────────────────────────────

/** A trilha da peça: "Reaproveitamento atendido pelo estoque: 3 de 5 pedidas (Fulano)". */
export const trilhaDoAtendimento = (atendida: number, pedida: number, quem: string | null | undefined): string =>
  `Reaproveitamento atendido pelo estoque: ${atendida} de ${pedida} ${pedida === 1 ? "pedida" : "pedidas"} (${quem || "—"})`;

/**
 * A trilha quando a Revisão Final CONFIRMA a resposta ao liberar. Se ela usou
 * menos do que o estoque atendeu, a frase diz — o número da peça e o da
 * resposta passam a ser diferentes, e alguém vai perguntar por quê.
 */
export const trilhaDaLiberacaoComEstoque = (usadas: number, atendida: number, pedida: number, quem: string | null | undefined): string =>
  trilhaDoAtendimento(atendida, pedida, quem) + (usadas < atendida ? ` — a Revisão Final usou ${usadas}` : "");

/** O selo na Revisão Final enquanto espera. */
export const textoDoPedido = (pedida: number): string => `Pedido ao estoque: ${pedida} un. · aguardando`;

const reaproveitadas = (n: number) => `${n} ${n === 1 ? "reaproveitada" : "reaproveitadas"}`;

/** A resposta já chegou e ainda espera a Revisão Final confirmar? */
export const respostaEsperandoConfirmar = (c: Pick<ConsultaDaPeca, "status" | "aplicadoEm"> | null | undefined): boolean =>
  !!c && !c.aplicadoEm && (c.status === "atendida" || c.status === "atendida_parcial" || c.status === "nao_atendida");

/** O título do bloco na ficha: "Estoque respondeu: atende 3 de 5" / "…: não tem". */
export function textoDaResposta(c: Pick<ConsultaDaPeca, "status" | "quantidadePedida" | "quantidadeAtendida">): string {
  if (c.status === "nao_atendida") return `Estoque respondeu: não tem as ${c.quantidadePedida} un. pedidas — segue para produção`;
  return `Estoque respondeu: atende ${c.quantidadeAtendida ?? 0} de ${c.quantidadePedida}`;
}

/**
 * A PROPOSTA da liberação — "tem que vir SUGERIDO de acordo com a resposta do
 * estoque e ela só CONFIRMAR". Sem digitar nada: usa o que o estoque atendeu
 * (`usar` é o "usar menos": de 0 até o atendido, nunca mais).
 *   · atendeu parte → "Confirmar e liberar · 3 reaproveitadas + 3 a produzir"
 *   · cobre a peça  → "Confirmar e liberar · 6 reaproveitadas — pula produção"
 *   · não atende    → "Confirmar e liberar · 6 a produzir"
 */
export function propostaDaLiberacao(
  quantidadeDaPeca: number,
  c: Pick<ConsultaDaPeca, "status" | "quantidadeAtendida">,
  usar?: number | null,
): { reaproveitadas: number; aProduzir: number; pulaProducao: boolean; rotulo: string } {
  const atendida = c.status === "nao_atendida" ? 0 : Math.max(0, Math.min(quantidadeDaPeca, c.quantidadeAtendida ?? 0));
  const n = usar == null ? atendida : Math.max(0, Math.min(atendida, Math.floor(usar) || 0));
  const aProduzir = Math.max(0, quantidadeDaPeca - n);
  const rotulo = n === 0
    ? `Confirmar e liberar · ${aProduzir} a produzir`
    : aProduzir === 0
      ? `Confirmar e liberar · ${reaproveitadas(n)} — pula produção`
      : `Confirmar e liberar · ${reaproveitadas(n)} + ${aProduzir} a produzir`;
  return { reaproveitadas: n, aProduzir, pulaProducao: n > 0 && aProduzir === 0, rotulo };
}

/** O resumo do lote: "12 peças · 3 com reaproveitamento do estoque (11 un.)". */
export function resumoDoLoteComEstoque(totalDePecas: number, propostas: Array<{ reaproveitadas: number }>): string {
  const com = propostas.filter((p) => p.reaproveitadas > 0);
  const unidades = com.reduce((s, p) => s + p.reaproveitadas, 0);
  const pecas = `${totalDePecas} ${totalDePecas === 1 ? "peça" : "peças"}`;
  return com.length === 0 ? pecas : `${pecas} · ${com.length} com reaproveitamento do estoque (${unidades} un.)`;
}

/** As mensagens das notificações (servidor). */
export const avisoParaAGrafica = (codigo: string | null | undefined, pedida: number, evento: string | null | undefined): string =>
  `Solicitação ao estoque: ${codigo || "peça"} · ${pedida} un. (${evento || "—"})`;

export function avisoParaQuemPediu(atendida: number, pedida: number, codigo: string | null | undefined): string {
  const peca = codigo || "peça";
  if (atendida <= 0) return `Estoque não tem — ${peca} segue para produção`;
  return atendida >= pedida
    ? `Estoque atendeu as ${pedida} un. pedidas — ${peca}`
    : `Estoque atendeu ${atendida} de ${pedida} un. — ${peca}`;
}
