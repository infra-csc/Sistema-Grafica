// ─────────────────────────────────────────────────────────────────────────────
// KIT (dono, 14/09; SIMPLIFICADO em 23/10).
//
// "O kit não precisa ser tão diferente das peças normais, ele entra nessa
// aprovação [Aprovação de layout] pra frente e não seriam várias remessas,
// seria tudo a mesma inclusão, e ele não precisaria colocar as datas, mas
// seguiremos com a planilha de inclusão do kit." (dono, 23/10)
//
// O que vale desde 23/10:
//   · a peça do Kit é PEÇA DO EVENTO, com o selo KIT — mesmas datas, mesmos
//     marcos, mesmo evento em toda tela (nada de "Evento · KIT" à parte);
//   · PRAZOS: o Kit é cobrado pelos marcos do evento a partir da APROVAÇÃO DE
//     LAYOUT (Aprovação → Finalização → Revisão de lista → Produção gráfica).
//     Lista de imagens e Entrega de layouts NÃO cobram o Kit (ver
//     `kitCobradoNoMarco`) — a peça do Kit que ainda está nessas etapas é
//     medida pelo prazo da Aprovação;
//   · UMA INCLUSÃO POR EVENTO: a linha de `kit_remessas` virou "a inclusão do
//     Kit do evento" (UNIQUE em event_id, migração 0009). Subir outra planilha
//     do Kit só ACRESCENTA peças a ela. As datas da antiga remessa (entrega do
//     material, carga e saída do caminhão) ficam no banco, ignoradas;
//   · `items.kit_remessa_id` continua sendo a marca "peça do Kit";
//   · o usuário do Kit é um usuário de Solicitação marcado "Kit": tem as mesmas
//     telas, mas só vê (e só cria) as peças do Kit que ELE criou;
//   · admin, Solicitação, Atendimento e Arte veem tudo misturado, com o selo.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A INCLUSÃO DO KIT do evento como a API devolve (uma por evento). As colunas
 * de data da antiga remessa seguem no banco, mas não chegam mais à tela.
 */
export interface InclusaoDoKit {
  id: string;
  eventId: string;
  solicitante: string | null;
  departamento: string | null;
  /** A última planilha do Kit incluída. */
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
 * QUEM PÕE PEÇA NO KIT DO EVENTO (23/10, no lugar de `remessaUtilizavelPor`):
 * a inclusão é do EVENTO, não de quem a abriu — admin, Solicitação e o usuário
 * do Kit (que é um usuário de Solicitação) acrescentam peças a ela. O que
 * continua por pessoa é a VISÃO: o usuário do Kit só vê (e só mexe) nas peças
 * que ele mesmo criou (`pecaVisivelPara`, server/trava-do-kit.ts).
 */
export const podeIncluirNoKit = (usuario: { role?: string | null; kit?: boolean | null }): boolean =>
  usuario.kit === true || usuario.role === "admin" || usuario.role === "solicitacao";

/**
 * A Solicitação da Arena só VISUALIZA peça do Kit (dono, 15/09): a trava de
 * server/routes.ts responde 403 a toda escrita de quem tem papel
 * "solicitacao", NÃO é usuário do Kit, e mira peça do Kit — por id na URL
 * (/api/items/:id/…) ou na lista `itemIds` de um lote (aí o lote inteiro volta
 * 403). O admin age em tudo; o usuário do Kit, nas dele
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

// ─── Selo e grupo (23/10: só "KIT", sem data) ────────────────────────────────

/** O texto do selo da peça do Kit, em toda tela. */
export const TEXTO_DO_SELO_KIT = "KIT";

/** O que o selo explica ao passar o mouse (title/tooltip). */
export const DETALHE_DO_SELO_KIT = "Peça do Kit — segue os prazos do evento a partir da Aprovação de layout";

/** O texto do selo: sempre "KIT" (a data própria do Kit deixou de existir em 23/10). */
export const textoDoSeloKit = (): string => TEXTO_DO_SELO_KIT;

/** O grupo da peça nas listas (15/09: "as peças devem ser agrupadas como Kit"):
 *  "KIT" para a peça do Kit; null para a da Arena. */
export function grupoDoKit(peca: { kitRemessaId?: string | null }): string | null {
  return peca.kitRemessaId ? TEXTO_DO_SELO_KIT : null;
}

// ─── Prazos: o Kit entra no funil na Aprovação de layout (dono, 23/10) ───────

/** Os marcos do funil que NÃO cobram a peça do Kit (chaves de FUNIL_DE_PRAZOS). */
export const MARCOS_QUE_NAO_COBRAM_O_KIT: ReadonlySet<string> = new Set(["listaImagens", "layouts"]);

/** O primeiro marco que cobra a peça do Kit. */
export const MARCO_EM_QUE_O_KIT_ENTRA = "aprovacao" as const;

/** O marco (pela chave) cobra a peça do Kit? Da Aprovação em diante, sim. */
export const kitCobradoNoMarco = (chaveDoMarco: string): boolean => !MARCOS_QUE_NAO_COBRAM_O_KIT.has(chaveDoMarco);

// ─── A planilha do Kit ───────────────────────────────────────────────────────
//
// O template do Kit traz, acima da tabela de peças, um cabeçalho de rótulo na
// coluna A e valor na B: "Data Solicitação", "Solicitante", "Departamento",
// "Versão do Pedido", "Data de Entrega do material:", "Data do Evento", "Data
// Carrega caminhão", "Data Saída Caminhão". Na A1, o nome do evento. As datas
// chegam como número de série do Excel (46279 = 14/09/2026).
//
// Desde 23/10 o cabeçalho só RECONHECE a planilha do Kit e traz o solicitante e
// o departamento: as datas são lidas (é por elas que o template se identifica),
// mas não viram prazo nem são gravadas — o Kit segue as datas do evento.

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
