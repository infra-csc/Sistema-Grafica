// ─────────────────────────────────────────────────────────────────────────────
// PEÇAS DEVOLVIDAS PARA O RASCUNHO — as que voltaram para a mesa da Solicitação
//
// Dono, 29/10: "as peças que a arte devolve pra mim (ficam nos rascunhos),
// antigamente eu conseguia ver na tela inicial. Agora não aparece mais." O
// Painel Geral só as contava dentro do card "Solicitado" ("inclui N
// rascunhos"), misturadas com rascunho que nunca saiu — e a peça devolvida
// ficava parada até alguém abrir o evento certo.
//
// Duas portas levam uma peça de volta ao rascunho, e só elas:
//   · a Arte devolve ao solicitante (PATCH /api/items/:id/arte-reject), com
//     motivo obrigatório;
//   · a Vinculação devolve para a Criação (POST /api/items/:id/return-to-creation).
// Rascunho que nunca saiu (recém-criado, clonado, importado) não passou por
// nenhuma das duas — é o que separa "devolvida" de "ainda não enviada".
//
// O sinal é a linha da trilha (audit_logs) que cada porta grava: ela diz quem
// devolveu, quando e por quê, sem coluna nova no banco. As MARCAS abaixo são
// as mesmas que as duas rotas escrevem — mudar o texto de uma rota sem mudar
// aqui faria a peça devolvida sumir do aviso (o teste amarra as duas pontas).
// ─────────────────────────────────────────────────────────────────────────────

/** Trecho da linha da trilha gravada pela Arte ao devolver ao solicitante. */
export const MARCA_DEVOLVIDA_PELA_ARTE = "devolvida pela Arte ao solicitante";
/** Começo da linha da trilha gravada pela Vinculação ao devolver para a Criação. */
export const MARCA_DEVOLVIDA_PARA_A_CRIACAO = "Item devolvido para Criação";

export type OrigemDaDevolucao = "arte" | "vinculacao";

/** Lê uma linha da trilha: é uma devolução ao rascunho? De onde, e com qual motivo? */
export function lerDevolucaoAoRascunho(
  details: string | null | undefined,
): { origem: OrigemDaDevolucao; motivo: string | null } | null {
  if (!details) return null;
  if (details.includes(MARCA_DEVOLVIDA_PELA_ARTE)) {
    // "… → Rascunho (devolvida pela Arte ao solicitante[, JÁ FORA DA ARTE]). Motivo: <texto>"
    const m = /\.\s*Motivo:\s*([\s\S]*)$/.exec(details);
    const motivo = m?.[1]?.trim();
    return { origem: "arte", motivo: motivo ? motivo : null };
  }
  if (details.startsWith(MARCA_DEVOLVIDA_PARA_A_CRIACAO)) return { origem: "vinculacao", motivo: null };
  return null;
}

/** Quem devolveu, no nome que a pessoa conhece. */
export const nomeDaOrigem = (o: OrigemDaDevolucao): string => (o === "arte" ? "Arte" : "Vinculação");

/** Uma peça devolvida, como a API entrega para o menu, o Painel e o card de rascunhos. */
export type PecaDevolvida = {
  id: string;
  displayId: string | null;
  type: string;
  description: string | null;
  eventId: string;
  eventName: string;
  origem: OrigemDaDevolucao;
  motivo: string | null;
  /** Nome de quem devolveu (o da trilha). */
  por: string;
  /** Quando foi devolvida (ISO). */
  em: string;
};

export type RespostaDevolvidas = { pecas: PecaDevolvida[] };

/** "1 peça devolvida" / "3 peças devolvidas". */
export const rotuloDasDevolvidas = (n: number): string =>
  `${n} ${n === 1 ? "peça devolvida" : "peças devolvidas"} para o rascunho`;
