// O QUE ACONTECE COM O AVISO DA CONFERÊNCIA (dono, 04/11).
//
// O aviso só sai quando alguém age, e a ação diz o que aconteceu:
//   · "certo": o arquivo estava certo. Sai da lista; avisar a Gráfica é opcional.
//   · "corrigido": alguém corrigiu o arquivo. Avisar a Gráfica é obrigatório, porque ela
//     pode já ter aberto o arquivo antigo, e o arquivo é conferido de novo. Como
//     quase sempre o caminho continua o mesmo, nada mais perceberia a troca.
//
// Quem resolve escolhe o texto: é ele que aparece na peça, na tela da Gráfica.

export type ResolucaoDaConferencia = "certo" | "corrigido";

export const AVISO_MINIMO = 5;
export const AVISO_MAXIMO = 300;

/** Os atalhos de texto; o aviso continua editável. */
export const ATALHOS_DO_AVISO: Record<ResolucaoDaConferencia, readonly string[]> = {
  certo: ["Arquivo conferido: pode imprimir", "Só imprima depois de falar com a Arte"],
  corrigido: [
    "Arquivo corrigido: abra de novo antes de imprimir",
    "Arquivo final trocado: use o arquivo novo",
    "Se já mandou para a impressora, tire e mande de novo",
    "Só imprima depois de falar com a Arte",
  ],
};

/** A ação e o aviso limpos, ou a frase de erro para quem está resolvendo. */
export function lerResolucao(corpo: unknown):
  | { ok: true; acao: ResolucaoDaConferencia; aviso: string | null }
  | { ok: false; erro: string } {
  const c = (corpo ?? {}) as { acao?: unknown; aviso?: unknown };
  if (c.acao !== "certo" && c.acao !== "corrigido") return { ok: false, erro: "Diga se o arquivo estava certo ou se foi corrigido." };
  const texto = typeof c.aviso === "string" ? c.aviso.trim().replace(/\s+/g, " ") : "";
  if (!texto && c.acao === "corrigido") return { ok: false, erro: "Escreva o que a Gráfica precisa saber sobre o arquivo corrigido." };
  if (texto && texto.length < AVISO_MINIMO) return { ok: false, erro: `Escreva o aviso para a Gráfica com pelo menos ${AVISO_MINIMO} letras.` };
  if (texto.length > AVISO_MAXIMO) return { ok: false, erro: `O aviso passa de ${AVISO_MAXIMO} letras. Resuma.` };
  return { ok: true, acao: c.acao, aviso: texto || null };
}

/** O que a Gráfica lê na peça: o texto, quem escreveu e quando. */
export function avisoNaPeca(aviso: string, quem: string, agora: Date = new Date()): string {
  const quando = agora.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).replace(",", " às");
  return `${aviso} (${quem}, ${quando})`;
}
