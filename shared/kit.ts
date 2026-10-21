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

/**
 * A Solicitação da Arena só VISUALIZA peça do Kit (dono, 15/09): a trava de
 * server/routes.ts responde 403 a toda escrita de quem tem papel
 * "solicitacao", NÃO é usuário do Kit, e mira peça com remessa do Kit — por
 * id na URL (/api/items/:id/…) ou na lista `itemIds` de um lote (aí o lote
 * inteiro volta 403). O admin age em tudo; o usuário do Kit, nas dele
 * (server/trava-do-kit.ts). Esta é a MESMA régua, para a tela não montar lote
 * que o servidor vai recusar.
 */
export function soVisualizaPecaDoKit(
  usuario: { role?: string | null; kit?: boolean | null } | null | undefined,
  peca: { kitRemessaId?: string | null },
): boolean {
  return usuario?.role === "solicitacao" && !usuario?.kit && !!peca.kitRemessaId;
}

/**
 * VINCULAÇÃO (dono, 21/10: "usuário de Solicitação NÃO vê Kit"): a Solicitação
 * da Arena não vê as peças do Kit nesta tela — fora da lista, das contagens e
 * do lote. O servidor recorta com `?semKitAlheio=1` (GET /api/items) e a tela
 * aplica o mesmo filtro. Admin vê tudo; o usuário do Kit vê as dele.
 */
export const PARAM_SEM_KIT_ALHEIO = "semKitAlheio";
export const pecaNaVinculacaoDe = (
  usuario: { role?: string | null; kit?: boolean | null } | null | undefined,
  peca: { kitRemessaId?: string | null },
): boolean => !soVisualizaPecaDoKit(usuario, peca);

/**
 * Divide um lote entre o que a pessoa pode liberar e as peças do Kit que ela
 * só visualiza — para mandar as primeiras e dizer quais ficaram, em vez de o
 * servidor recusar o lote inteiro.
 */
export function separarPecasDoKitAlheio<P extends { kitRemessaId?: string | null }>(
  usuario: { role?: string | null; kit?: boolean | null } | null | undefined,
  pecas: readonly P[],
): { podem: P[]; doKit: P[] } {
  const podem: P[] = [];
  const doKit: P[] = [];
  for (const p of pecas) (soVisualizaPecaDoKit(usuario, p) ? doKit : podem).push(p);
  return { podem, doKit };
}

/** "3 peças do Kit ficaram de fora: quem libera é o Kit." */
export const fraseDasPecasDoKitQueFicaram = (n: number): string =>
  n === 1
    ? "1 peça do Kit ficou de fora: quem libera é o Kit."
    : `${n} peças do Kit ficaram de fora: quem libera é o Kit.`;

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

/** O grupo da peça nas listas (15/09: "as peças devem ser agrupadas como Kit").
 *  "KIT V1 · entrega 20/09" para a peça do Kit; null para a da Arena. */
export function grupoDoKit(peca: { kitRemessaId?: string | null; kitRemessa?: { versao?: string | null; entregaMaterial?: string | Date | null } | null }): string | null {
  if (!peca.kitRemessaId) return null;
  // Sem a versão (15/09: "V1 não precisa, apenas que é Kit").
  const dia = diaMesDoKit(peca.kitRemessa?.entregaMaterial);
  return `KIT${dia ? ` · entrega ${dia}` : ""}`;
}

/** "KIT V1 · entrega 20/09" — como a remessa aparece numa lista de escolha. */
export function rotuloDaRemessa(remessa: { versao: string; entregaMaterial?: string | Date | null }): string {
  const dia = diaMesDoKit(remessa.entregaMaterial);
  return `KIT ${remessa.versao}${dia ? ` · entrega ${dia}` : ""}`;
}

// ─── Prazos pelas datas do Kit (dono, 14/09: "tem que ser pela data deles") ──

/** A âncora dos prazos da peça do Kit: QUANDO ELES PRECISAM DA PEÇA — a data de
 *  entrega do material (dono, 15/09: "o prazo não é a data do caminhão, e sim
 *  quando eles precisam do item"). Faz o papel da saída do caminhão na Arena. */
export const ancoraDoKit = (remessa: { entregaMaterial: string | Date }): string | Date =>
  remessa.entregaMaterial;

/**
 * O evento como a PEÇA DO KIT o enxerga: as mesmas regras e offsets do evento,
 * com as datas da remessa no lugar das da Arena. Toda tela que calcula prazo a
 * partir de `item.event` (Arte, Gráfica, Painel) passa a cobrar a peça do Kit
 * pela data dela sem mudar a conta. Sem remessa, devolve o evento como está.
 */
export function eventoComDatasDoKit<E extends { startDate?: unknown; truckDepartureDate?: unknown }>(
  evento: E | undefined,
  remessa: { versao: string; saidaCaminhao?: string | Date | null; entregaMaterial: string | Date; dataEvento?: string | Date | null } | null | undefined,
): E | undefined {
  if (!evento || !remessa) return evento;
  return {
    ...evento,
    truckDepartureDate: ancoraDoKit(remessa),
    startDate: remessa.dataEvento ?? evento.startDate,
    datasDoKit: true,
    kitVersao: remessa.versao,
    saidaDaArena: evento.truckDepartureDate,
  };
}

// ─── A planilha do Kit ───────────────────────────────────────────────────────
//
// O template do Kit traz, acima da tabela de peças, um cabeçalho de rótulo na
// coluna A e valor na B: "Data Solicitação", "Solicitante", "Departamento",
// "Versão do Pedido", "Data de Entrega do material:", "Data do Evento", "Data
// Carrega caminhão", "Data Saída Caminhão". Na A1, o nome do evento. As datas
// chegam como número de série do Excel (46279 = 14/09/2026).

export interface CabecalhoDoKit {
  evento: string | null;
  versao: string | null;
  solicitante: string | null;
  departamento: string | null;
  dataSolicitacao: string | null;
  entregaMaterial: string | null;
  dataEvento: string | null;
  cargaCaminhao: string | null;
  saidaCaminhao: string | null;
}

/** Data de célula da planilha → "AAAA-MM-DD" (série do Excel, dd/mm/aaaa ou ISO). */
export function dataDaPlanilha(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const t = String(valor).trim();
  if (/^\d+(\.\d+)?$/.test(t)) {
    const serie = Math.floor(Number(t));
    if (serie < 20000 || serie > 80000) return null;
    return new Date(Date.UTC(1899, 11, 30) + serie * 86_400_000).toISOString().slice(0, 10);
  }
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) return `${br[3].length === 2 ? `20${br[3]}` : br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

const rotuloNormal = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[:\s]+/g, " ").trim();

/**
 * Lê o cabeçalho do Kit dos pares (rótulo na A, valor na B). Null se não for do Kit.
 *
 * Pelas DATAS (entrega do material ou saída do caminhão) em qualquer aba. Com
 * `aceitarSemDatas` — só para a aba "KIT" que é a lida —, basta a versão do
 * pedido com solicitante, departamento ou data da solicitação: a New Balance
 * BSB (21/10) veio sem as datas, e a versão e o solicitante se perdiam junto.
 */
export function cabecalhoDoKit(
  pares: Array<{ rotulo: string; valor: string }>,
  primeiraCelula?: string | null,
  opcoes: { aceitarSemDatas?: boolean } = {},
): CabecalhoDoKit | null {
  const acha = (teste: (rotulo: string) => boolean) => pares.find((p) => teste(rotuloNormal(p.rotulo)))?.valor?.trim() || null;
  const entregaMaterial = dataDaPlanilha(acha((r) => r.startsWith("data de entrega") || r.startsWith("entrega do material")));
  const saidaCaminhao = dataDaPlanilha(acha((r) => r.includes("saida") && r.includes("caminhao")));
  const versao = acha((r) => r.startsWith("versao"));
  const solicitante = acha((r) => r === "solicitante");
  const departamento = acha((r) => r === "departamento");
  const dataSolicitacao = dataDaPlanilha(acha((r) => r.startsWith("data solicitacao") || r.startsWith("data da solicitacao")));
  const temCaraDeKit = opcoes.aceitarSemDatas === true && !!versao && !!(solicitante || departamento || dataSolicitacao);
  if (!entregaMaterial && !saidaCaminhao && !temCaraDeKit) return null;
  return {
    evento: primeiraCelula?.trim() || null,
    versao,
    solicitante,
    departamento,
    dataSolicitacao,
    entregaMaterial,
    dataEvento: dataDaPlanilha(acha((r) => r === "data do evento")),
    cargaCaminhao: dataDaPlanilha(acha((r) => r.includes("carrega") || (r.includes("carga") && r.includes("caminhao")))),
    saidaCaminhao,
  };
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
