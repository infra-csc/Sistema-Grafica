// ─────────────────────────────────────────────────────────────────────────────
// KIT (dono, 14/09).
//
// "Vamos precisar criar, com base nesse template, novas peças que vão ser do
// Kit." Decisões do dono:
//   · a peça do Kit fica no MESMO evento, com as datas próprias do Kit
//     (entrega do material, carga e saída do caminhão) — as da Arena não mudam;
//   · cada planilha (ou criação à mão) é uma REMESSA; cada versão (V1, V2…) é
//     uma remessa nova;
//   · o fluxo é o mesmo da Arena, e quem cria escolhe se precisa de aprovação;
//   · o usuário do Kit é um usuário de Solicitação marcado "Kit": tem as mesmas
//     telas, mas só vê as peças do Kit que ELE criou;
//   · admin, Solicitação, Atendimento e Arte veem tudo misturado, com o selo
//     KIT e o prazo de entrega em todas as etapas.
// ─────────────────────────────────────────────────────────────────────────────

/** A remessa do Kit como a API devolve. Datas em ISO. */
export interface RemessaDoKit {
  id: string;
  eventId: string;
  versao: string;
  solicitante: string | null;
  departamento: string | null;
  dataSolicitacao: string | null;
  entregaMaterial: string;
  dataEvento: string | null;
  cargaCaminhao: string | null;
  saidaCaminhao: string | null;
  arquivo: string | null;
  criadoPor: string | null;
  criadoPorId: string | null;
  createdAt: string;
}

export const ehPecaDoKit = (peca: { kitRemessaId?: string | null }): boolean => !!peca.kitRemessaId;

/**
 * Quem enxerga a peça. O usuário do Kit só vê as peças do Kit que ele criou;
 * todo o resto vê tudo. É a régua única do servidor (listas de peças, eventos,
 * detalhe do evento) — o cliente só esconde o que o servidor já não mandou.
 */
export function pecaVisivelPara(
  usuario: { kit?: boolean | null; userId?: string | null },
  peca: { kitRemessaId?: string | null; criadoPorId?: string | null },
): boolean {
  if (!usuario.kit) return true;
  return !!peca.kitRemessaId && !!usuario.userId && peca.criadoPorId === usuario.userId;
}

/** A remessa pode receber peça deste usuário? O do Kit só usa as dele. */
export const remessaUtilizavelPor = (
  usuario: { kit?: boolean | null; userId?: string | null },
  remessa: { criadoPorId?: string | null },
): boolean => !usuario.kit || (!!usuario.userId && remessa.criadoPorId === usuario.userId);

/** "20/09" de uma data do Kit (gravada ao meio-dia UTC do dia). */
export function diaMesDoKit(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  const data = new Date(d);
  if (Number.isNaN(data.getTime())) return null;
  const iso = data.toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** O texto do selo: "KIT · entrega 20/09" (ou só "KIT" sem a data). */
export function textoDoSeloKit(remessa: { entregaMaterial?: string | Date | null } | null | undefined): string {
  const dia = diaMesDoKit(remessa?.entregaMaterial);
  return dia ? `KIT · entrega ${dia}` : "KIT";
}

/** "KIT V1 · entrega 20/09" — como a remessa aparece numa lista de escolha. */
export function rotuloDaRemessa(remessa: { versao: string; entregaMaterial?: string | Date | null }): string {
  const dia = diaMesDoKit(remessa.entregaMaterial);
  return `KIT ${remessa.versao}${dia ? ` · entrega ${dia}` : ""}`;
}

/** Explicação completa do selo (title/tooltip). */
export function detalheDaRemessa(remessa: Partial<RemessaDoKit> | null | undefined): string {
  if (!remessa) return "Peça do Kit";
  const partes = [`Peça do Kit${remessa.versao ? ` — remessa ${remessa.versao}` : ""}`];
  const entrega = diaMesDoKit(remessa.entregaMaterial);
  const carga = diaMesDoKit(remessa.cargaCaminhao);
  const saida = diaMesDoKit(remessa.saidaCaminhao);
  if (entrega) partes.push(`entrega do material ${entrega}`);
  if (carga) partes.push(`carga do caminhão ${carga}`);
  if (saida) partes.push(`saída do caminhão ${saida}`);
  return partes.join(" · ");
}
