// ─────────────────────────────────────────────────────────────────────────────
// PRIORIDADE NA IMPRESSÃO — a Solicitação pede que a peça saia na frente na
// Gráfica (dono, 08/10: "faz um botão que a Solicitação consegue pedir
// prioridade na impressão quando estiver na revisão ou na gráfica").
//
// O caso que originou o pedido: a peça saiu do reaproveitamento (passou a
// precisar ser impressa) e a Solicitação procurou, na tela da Gráfica, como
// pedir que ela furasse a fila — não havia como. A marca de prioridade só se
// punha pelo formulário da peça.
//
// SEM CAMPO NOVO: o pedido grava a MESMA marca `isPriority` do formulário e
// acende o selo "Prioritária". A ORDEM mudou no mesmo dia (dono, 08/10): a
// prioritária vem PRIMEIRO de toda a fila da Gráfica (grupo "Prioritárias",
// à frente de qualquer evento — antes era só o topo do bloco do evento) e
// primeiro em Máquinas (fila geral; na fila da impressora, depois só da
// pausada). O que este módulo acrescenta é a PORTA: um botão nas etapas em
// que a peça está na Revisão Final ou na Gráfica, com trilha e aviso.
//
// Uma regra num lugar só, lida pelo servidor (POST /api/items/:id/prioridade-
// na-impressao) e pelas telas (o botão só aparece quando a rota aceitaria) —
// o mesmo desenho de shared/producao-interna.ts.
//
//   QUEM: admin e Solicitação (os papéis que já marcam prioridade na peça).
//         Peça do Kit segue a régua de sempre: só o usuário do Kit que a criou
//         (ou o admin) — a Solicitação da Arena só visualiza peça do Kit.
//   QUANDO: da Revisão Final até antes de a impressão terminar —
//         Revisão Final · Pronto para Produção / Liberado · Em Impressão
//         (inclusive a impressão parcial, que segue "Em Impressão").
//   NÃO: molde (não vai para a impressora), reaproveitamento total (não há o
//         que imprimir), book completo (não é impresso) e peça na lixeira.
//
// RETIRAR o pedido é recuar — não é barrado por etapa nem por evento fechado:
// tirar a marca de uma peça nunca faz trabalho andar.
// ─────────────────────────────────────────────────────────────────────────────
import { ehMolde } from "./molde";
import { EM_REVISAO, ehBookCompleto } from "./fluxo-peca";
import { LIBERADA, EM_IMPRESSAO, PRODUZIDA } from "./maquina-de-estados";

/** Quem pede (e retira) prioridade na impressão. */
export const PAPEIS_DA_PRIORIDADE_NA_IMPRESSAO: readonly string[] = ["admin", "solicitacao"];

/** As etapas "na revisão ou na gráfica": da Revisão Final até a impressão terminar. */
export const ETAPAS_DA_PRIORIDADE_NA_IMPRESSAO: readonly string[] = [
  ...Array.from(EM_REVISAO),
  ...LIBERADA,
  ...EM_IMPRESSAO,
];

/** Depois da impressora: impressa, conferida, embalada, entregue. */
const JA_SAIU_DA_IMPRESSORA: readonly string[] = [...PRODUZIDA, "conferred", "conferido", "packed", "delivered", "entregue"];
const FORA_DO_FLUXO: readonly string[] = ["canceled", "archived", "deleted"];

/** Os rótulos da tela — um lugar só, para a Gráfica e a Solicitação lerem o mesmo. */
export const ROTULO_PEDIR_PRIORIDADE = "Pedir prioridade na impressão";
export const ROTULO_PRIORIDADE_PEDIDA = "Prioridade pedida";
export const ROTULO_RETIRAR_PRIORIDADE = "Retirar prioridade";

/**
 * O que o selo "Prioritária" da Gráfica diz no title. A marca é a mesma do
 * formulário da peça (não há como saber por qual porta veio sem uma coluna
 * nova): a frase diz o que a marca FAZ na Gráfica e quem a põe.
 */
export const TITULO_DO_SELO_NA_GRAFICA =
  "Prioridade na impressão pedida pela Solicitação — esta peça vem antes de todas as outras da fila, no grupo Prioritárias do topo. Quem pediu está no histórico da peça.";

/** O que a regra lê da peça (a do banco e a da tela servem). */
export type PecaDaPrioridade = {
  status?: string | null;
  type?: string | null;
  isReuse?: boolean | null;
  isPriority?: boolean | null;
  deletedAt?: string | Date | null;
  kitRemessaId?: string | null;
  criadoPorId?: string | null;
};

/** Quem pede: o papel e, para a régua do Kit, a marca e o id da pessoa. */
export type QuemPedePrioridade = {
  papel: string | null | undefined;
  kit?: boolean | null;
  userId?: string | null;
};

/** Por que não — a frase humana, o código para a tela e o status HTTP que a rota responde. */
export type MotivoSemPrioridade = { codigo: string; frase: string; http: number };

const fora = (codigo: string, frase: string, http = 409): MotivoSemPrioridade => ({ codigo, frase, http });

const quemDe = (q: QuemPedePrioridade | string | null | undefined): QuemPedePrioridade =>
  typeof q === "object" && q !== null ? q : { papel: q };

/** Papel e régua do Kit — comuns a pedir e a retirar. */
function motivoDeQuem(peca: PecaDaPrioridade, q: QuemPedePrioridade): MotivoSemPrioridade | null {
  if (!PAPEIS_DA_PRIORIDADE_NA_IMPRESSAO.includes(String(q.papel ?? ""))) {
    return fora("PAPEL", "Só a Solicitação e o admin pedem prioridade na impressão.", 403);
  }
  if (q.papel === "admin") return null;
  if (q.kit === true) {
    return peca.kitRemessaId && peca.criadoPorId === q.userId
      ? null
      : fora("KIT", "É peça de outra lista — o usuário do Kit mexe só nas peças do Kit que criou.", 403);
  }
  return peca.kitRemessaId ? fora("KIT", "Peça do Kit: a Solicitação da Arena só visualiza. Quem age nela é o usuário do Kit.", 403) : null;
}

/**
 * Por que esta peça NÃO pode receber o pedido de prioridade na impressão
 * agora. `null` = pode. Não olha a marca atual: pedir de novo numa peça já
 * prioritária é inofensivo (a rota responde a peça como está). Evento
 * encerrado/realizado é conferido à parte (a rota tem a guarda própria; a
 * tela, o selo de evento finalizado).
 */
export function motivoParaNaoPedirPrioridade(
  peca: PecaDaPrioridade,
  quem: QuemPedePrioridade | string | null | undefined,
): MotivoSemPrioridade | null {
  const q = quemDe(quem);
  const deQuem = motivoDeQuem(peca, q);
  if (deQuem) return deQuem;
  if (peca.deletedAt) return fora("EXCLUIDA", "A peça está na lixeira — restaure antes de pedir prioridade.", 404);
  if (ehMolde(peca)) return fora("MOLDE", "Molde não vai para a impressora — não há impressão para priorizar.");
  if (ehBookCompleto(peca)) return fora("BOOK", "Book completo não é impresso — não há impressão para priorizar.");
  if (peca.isReuse) return fora("REAPROVEITAMENTO", "Peça de reaproveitamento total não é impressa — não há impressão para priorizar.");
  const status = String(peca.status ?? "");
  if (ETAPAS_DA_PRIORIDADE_NA_IMPRESSAO.includes(status)) return null;
  if (JA_SAIU_DA_IMPRESSORA.includes(status)) {
    return fora("ETAPA", "A peça já saiu da impressora (impressa, conferida ou entregue) — não há mais impressão para priorizar.");
  }
  if (FORA_DO_FLUXO.includes(status)) return fora("ETAPA", "A peça está cancelada — não há impressão para priorizar.");
  return fora("ETAPA", "A peça ainda não chegou à Revisão Final — a prioridade na impressão vale da Revisão Final até a impressão terminar.");
}

/**
 * Por que o pedido NÃO pode ser retirado por esta pessoa. Recuar não depende
 * da etapa: só papel, Kit e lixeira.
 */
export function motivoParaNaoRetirarPrioridade(
  peca: PecaDaPrioridade,
  quem: QuemPedePrioridade | string | null | undefined,
): MotivoSemPrioridade | null {
  const deQuem = motivoDeQuem(peca, quemDe(quem));
  if (deQuem) return deQuem;
  if (peca.deletedAt) return fora("EXCLUIDA", "A peça está na lixeira.", 404);
  return null;
}

/**
 * O CONTROLE NA TELA: "pedir" (o botão), "pedida" (o selo + Retirar) ou
 * `null` (nada aparece). Aparece só onde a rota aceitaria pedir — fora da
 * janela, a peça já prioritária mostra só o selo de sempre, sem botão.
 */
export function estadoDaPrioridadeNaImpressao(
  peca: PecaDaPrioridade | null | undefined,
  quem: QuemPedePrioridade | string | null | undefined,
): "pedir" | "pedida" | null {
  if (!peca) return null;
  if (motivoParaNaoPedirPrioridade(peca, quem)) return null;
  return peca.isPriority ? "pedida" : "pedir";
}

/** O corpo do POST: `{ prioritaria: true | false }` — qualquer outra coisa é erro. */
export function lerPedidoDePrioridade(corpo: unknown): { ok: true; prioritaria: boolean } | { ok: false; erro: string } {
  const v = (corpo as { prioritaria?: unknown } | null | undefined)?.prioritaria;
  if (typeof v !== "boolean") return { ok: false, erro: "Diga se a prioridade é pedida ou retirada (prioritaria: true ou false)." };
  return { ok: true, prioritaria: v };
}

/** A frase da trilha (audit_logs). */
export function fraseDaTrilhaDaPrioridade(prioritaria: boolean, nome: string, etapa: string): string {
  return prioritaria
    ? `Prioridade na impressão pedida por ${nome} (etapa: ${etapa}) — a peça passa à frente das outras na fila da Gráfica e na de Máquinas`
    : `Prioridade na impressão retirada por ${nome} (etapa: ${etapa})`;
}

/** O aviso à Gráfica (e ao admin) quando o pedido é feito. */
export function mensagemDoAvisoDePrioridade(peca: { displayId?: string | null; type?: string | null }, evento: string, nome: string): string {
  return `PRIORIDADE NA IMPRESSÃO: ${peca.displayId ?? "peça"} ${peca.type ?? ""} — ${evento} (pedida por ${nome})`.replace(/\s+—/, " —");
}

// ─── MÁQUINAS (dono, 08/10: "essa prioridade tem que ser o primeiro na tela
// Máquinas da Gráfica") ────────────────────────────────────────────────────
/**
 * O desempate que põe as prioritárias na frente — para usar DEPOIS das
 * réguas que a prioridade não fura (a peça pausada, que volta primeiro para
 * a fila da impressora) e ANTES da ordem de sempre (saída do caminhão).
 * `sort` é estável: sozinho, mantém a ordem de cada grupo.
 */
export function primeiroAsPrioritarias(a: { prioritaria?: boolean | null }, b: { prioritaria?: boolean | null }): number {
  return Number(!!b.prioritaria) - Number(!!a.prioritaria);
}

/** O title do selo "Prioritária" em Máquinas. */
export const TITULO_DO_SELO_EM_MAQUINAS =
  "Prioridade na impressão pedida pela Solicitação — vem antes das outras na fila geral e na fila da impressora (nunca à frente da que está imprimindo nem da pausada). Trocar a que está na impressora continua sendo decisão da Gráfica.";
