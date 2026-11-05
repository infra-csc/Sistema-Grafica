// O QUE ACONTECE COM O AVISO DA CONFERÊNCIA (dono, 04/11).
//
// O aviso só sai quando alguém age, e a ação diz o que aconteceu:
//   · "certo": o arquivo estava certo. Sai da lista; avisar a Gráfica é opcional.
//   · "corrigido": alguém corrigiu o arquivo. Avisar a Gráfica é obrigatório, porque ela
//     pode já ter aberto o arquivo antigo, e o arquivo é conferido de novo. Como
//     quase sempre o caminho continua o mesmo, nada mais perceberia a troca.
//
// Quem resolve escolhe o texto: é ele que aparece na peça, na tela da Gráfica.
//
// ANTES DA REVISÃO (dono, 05/11): o arquivo final é conferido depois da Finalização e
// antes da Revisão Final. Sem divergência, a peça segue para a Revisão. Com divergência,
// volta para a Finalização e a Arte resolve: o arquivo estava certo, foi corrigido, ou
// o thumb é que estava errado e é trocado. Assim o arquivo é arrumado antes de chegar
// na Gráfica. Se o conferidor não responde em ESPERA_MAXIMA_MIN, a peça não fica presa.

/** "thumb": o thumb estava errado e foi trocado na própria conferência. */
export type ResolucaoDaConferencia = "certo" | "corrigido" | "thumb";
export type AcaoDoAviso = "certo" | "corrigido";

/** Passado isso sem resposta do conferidor, a Revisão libera mesmo assim. */
export const ESPERA_MAXIMA_MIN = 60;

/** Onde a peça já é da Gráfica: daqui em diante, avisar a Gráfica do arquivo corrigido é obrigatório. */
const ANTES_DA_GRAFICA = ["sponsor_approved", "awaiting_creator_review", "awaiting_final_review", "awaiting_sponsor_approval"];
export const avisoObrigatorio = (status: string | null | undefined, acao: AcaoDoAviso): boolean =>
  acao === "corrigido" && !ANTES_DA_GRAFICA.includes(status ?? "");

export type EstadoDaConferencia = "conferindo" | "liberada" | "divergente";
/**
 * A peça na Revisão pode ser liberada? Só conta o veredito dado DEPOIS do pedido:
 * um "confere" antigo é de outro envio. "Não deu" e resolvido liberam; sem resposta
 * por mais de ESPERA_MAXIMA_MIN, também.
 */
export function estadoDaConferencia(pedidaEm: Date | null, veredito: { veredito: string; criadaEm: Date; resolvida: boolean } | null, agora: Date = new Date()): EstadoDaConferencia {
  if (!pedidaEm) return "liberada";
  const valido = veredito && veredito.criadaEm.getTime() >= pedidaEm.getTime() ? veredito : null;
  if (!valido) return agora.getTime() - pedidaEm.getTime() > ESPERA_MAXIMA_MIN * 60_000 ? "liberada" : "conferindo";
  if (valido.veredito === "vale_olhar" && !valido.resolvida) return "divergente";
  return "liberada";
}

export const AVISO_MINIMO = 5;
export const AVISO_MAXIMO = 300;

/** Os atalhos de texto; o aviso continua editável. */
export const ATALHOS_DO_AVISO: Record<AcaoDoAviso, readonly string[]> = {
  certo: ["Arquivo conferido: pode imprimir", "Só imprima depois de falar com a Arte"],
  corrigido: [
    "Arquivo corrigido: abra de novo antes de imprimir",
    "Arquivo final trocado: use o arquivo novo",
    "Se já mandou para a impressora, tire e mande de novo",
    "Só imprima depois de falar com a Arte",
  ],
};

/** A ação e o aviso limpos, ou a frase de erro para quem está resolvendo. */
export function lerResolucao(corpo: unknown, status?: string | null):
  | { ok: true; acao: AcaoDoAviso; aviso: string | null }
  | { ok: false; erro: string } {
  const c = (corpo ?? {}) as { acao?: unknown; aviso?: unknown };
  if (c.acao !== "certo" && c.acao !== "corrigido") return { ok: false, erro: "Diga se o arquivo estava certo ou se foi corrigido." };
  const texto = typeof c.aviso === "string" ? c.aviso.trim().replace(/\s+/g, " ") : "";
  // Antes da Gráfica, ninguém abriu o arquivo antigo: o aviso é opcional.
  if (!texto && (status === undefined ? c.acao === "corrigido" : avisoObrigatorio(status, c.acao))) return { ok: false, erro: "Escreva o que a Gráfica precisa saber sobre o arquivo corrigido." };
  if (texto && texto.length < AVISO_MINIMO) return { ok: false, erro: `Escreva o aviso para a Gráfica com pelo menos ${AVISO_MINIMO} letras.` };
  if (texto.length > AVISO_MAXIMO) return { ok: false, erro: `O aviso passa de ${AVISO_MAXIMO} letras. Resuma.` };
  return { ok: true, acao: c.acao, aviso: texto || null };
}

/** O que a Gráfica lê na peça: o texto, quem escreveu e quando. */
export function avisoNaPeca(aviso: string, quem: string, agora: Date = new Date()): string {
  const quando = agora.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).replace(",", " às");
  return `${aviso} (${quem}, ${quando})`;
}
