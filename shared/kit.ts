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

/** Lê o cabeçalho do Kit dos pares (rótulo na A, valor na B). Null se não for do Kit. */
export function cabecalhoDoKit(pares: Array<{ rotulo: string; valor: string }>, primeiraCelula?: string | null): CabecalhoDoKit | null {
  const acha = (teste: (rotulo: string) => boolean) => pares.find((p) => teste(rotuloNormal(p.rotulo)))?.valor?.trim() || null;
  const entregaMaterial = dataDaPlanilha(acha((r) => r.startsWith("data de entrega") || r.startsWith("entrega do material")));
  const saidaCaminhao = dataDaPlanilha(acha((r) => r.includes("saida") && r.includes("caminhao")));
  if (!entregaMaterial && !saidaCaminhao) return null;
  return {
    evento: primeiraCelula?.trim() || null,
    versao: acha((r) => r.startsWith("versao")),
    solicitante: acha((r) => r === "solicitante"),
    departamento: acha((r) => r === "departamento"),
    dataSolicitacao: dataDaPlanilha(acha((r) => r.startsWith("data solicitacao") || r.startsWith("data da solicitacao"))),
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
