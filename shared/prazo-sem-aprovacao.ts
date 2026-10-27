// ─────────────────────────────────────────────────────────────────────────────
// PRAZOS PARA PEÇAS SEM APROVAÇÃO — a regra, num lugar só (Pedro/dono, 26/10:
// "Gestão Gráfica — Prazos para peças sem aprovação (sem patrocínio e arte do
// cliente)"; o dono aprovou: "faz o que está no documento").
//
// O PROBLEMA. A peça que não passa pela Aprovação aparecia atrasada em Layout:
// o app aplicava a ela o prazo de Layout de toda peça. E cada tela tinha a sua
// versão da exceção — a Gestão de Prazos a cobrava pela FINALIZAÇÃO, o card do
// evento pela APROVAÇÃO e as Análises pelo Layout NORMAL. Três réguas para a
// mesma peça.
//
// AS DUAS MARCAS (RN01, independentes, podem vir juntas — marcação sempre manual):
//   · "Sem patrocínio" = `items.skipApproval` — a marca que já existia (a da
//     Vinculação, "sem patrocinador"; também usada pela produção interna e pela
//     dispensa da aprovação). Decisão do dono: não nasce um segundo booleano.
//   · "Arte do cliente" = `items.arteDoCliente` — a arte vem pronta do cliente.
//     Enquanto o arquivo não chega (`arteRecebidaEm` vazio) a peça está em
//     "Layout — Aguardando arte do cliente" (RN06). É uma MARCA, não um status
//     da máquina de estados: a peça continua no status de Layout em que está, e
//     todas as telas, filtros e contagens que já conhecem esses status seguem
//     certos sem mudar. Um status novo obrigaria cada fila e cada régua de
//     etapa do app a aprendê-lo — e o esquecimento de uma delas é a peça que
//     some de uma tela.
//
// A REGRA DO PRAZO (RN02, RN03, RN05):
//   prazo de Layout ajustado = prazo de Layout do evento + N dias CORRIDOS,
//   N = duração da etapa de Aprovação (configuração geral, padrão 7).
//   Com as duas marcas, soma UMA vez. O prazo final e os prazos da Finalização
//   em diante NÃO mudam — só a distribuição entre Layout e Aprovação.
//
// FIM DE SEMANA. O prazo de Layout do evento já vem com a regra do marco
// (seg–sex: sábado → sexta, domingo → segunda). Os N dias são CORRIDOS (o
// documento) e somam sobre esse dia; a data resultante passa pela MESMA regra
// de fim de semana do Layout — o prazo ajustado continua sendo um prazo de
// Layout, e um prazo de Layout não vence no sábado. Com N = 7 o dia da semana
// não muda e o ajuste nunca dispara; ele só existe para N que não seja
// múltiplo de 7 (ex.: N = 5 a partir de uma terça cairia no domingo → segunda).
//
// ONDE A MARCA VALE. O "Layout" do documento é uma etapa só: do cadastro ao
// envio do layout (rascunho, solicitado, vinculação, aguardando envio — o
// mesmo recorte do RN07). No app ele são dois marcos (Lista de Imagens e
// Entrega de Layouts); a peça com marca nessas etapas é medida pelo prazo de
// Layout AJUSTADO (os dois marcos viram um, como o Kit e a antiga isenção já
// faziam). Depois do Layout a peça segue os marcos normais.
//
// KIT (26/10, shared/kit.ts): a peça do Kit é cobrada da Entrega de Layouts em
// diante (a Lista de Imagens não a cobra) — o mesmo Layout das outras. Com
// marca, ela tem o prazo de Layout ajustado como qualquer peça.
//
// ATRASO DO CLIENTE × INTERNO (RN09): a peça com "Arte do cliente" ainda não
// recebida depois do prazo ajustado está atrasada — mas por conta do cliente.
// Toda outra peça atrasada é atraso interno.
//
// NADA É GRAVADO (RF12): os prazos derivam da saída do caminhão e da
// configuração, e são calculados na hora. Coluna de prazo copiado envelheceria
// no primeiro ajuste de data do evento. A trilha guarda os dois prazos (normal
// e ajustado) do momento de cada marcação/desmarcação, para auditoria.
// ─────────────────────────────────────────────────────────────────────────────
import { FUNIL_DE_PRAZOS, statusDasEtapas, statusDoFunil } from "./fluxo-peca";
import { MARCO_EM_QUE_O_KIT_ENTRA } from "./kit";
import { ehMolde } from "./molde";
import {
  FIM_DE_SEMANA_DO_CAMPO, FIM_DE_SEMANA_DO_MARCO, OFFSET_PADRAO_DO_MARCO,
  deslocamentoDeFimDeSemana, diaDoMarcoUTC, isPlausibleEventDate,
} from "./prazo-dates";

// ─── A configuração ──────────────────────────────────────────────────────────

/** Chave da duração da etapa de Aprovação em `configuracoes`. */
export const CONFIG_DIAS_DA_APROVACAO = "dias_da_aprovacao";
/** "Hoje, 1 semana" (o documento). Vale quando a configuração falta ou é inválida. */
export const DIAS_DA_APROVACAO_PADRAO = 7;
export const DIAS_DA_APROVACAO_MIN = 1;
export const DIAS_DA_APROVACAO_MAX = 30;

/** Inteiro entre o mínimo e o máximo; qualquer outra coisa vira `null`. */
export function diasDaAprovacaoValidos(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= DIAS_DA_APROVACAO_MIN && n <= DIAS_DA_APROVACAO_MAX ? n : null;
}

/** A configuração lida, ou o padrão. */
export const diasDaAprovacaoOuPadrao = (v: unknown): number => diasDaAprovacaoValidos(v) ?? DIAS_DA_APROVACAO_PADRAO;

// ─── Vocabulário das telas ───────────────────────────────────────────────────

export const ROTULO_SEM_PATROCINIO = "Sem patrocínio";
export const ROTULO_ARTE_DO_CLIENTE = "Arte do cliente";
/** O selo (curto) — RF06: tag "Sem patrocínio" / "Arte cliente". */
export const SELO_SEM_PATROCINIO = "Sem patrocínio";
export const SELO_ARTE_DO_CLIENTE = "Arte cliente";
export const ROTULO_AGUARDANDO_ARTE = "Aguardando arte do cliente";
/** O subestado no status da peça (RN06/RF07). */
export const SUBESTADO_AGUARDANDO_ARTE = "Layout — Aguardando arte do cliente";
export const ROTULO_ATRASO_DO_CLIENTE = "Atraso do cliente";
export const ROTULO_ATRASO_INTERNO = "Atraso interno";

// ─── As marcas da peça ───────────────────────────────────────────────────────

/** O que a regra lê da peça — estrutural (serve a Item, linha de painel ou de prazos). */
export interface MarcasDaPeca {
  status?: string | null;
  skipApproval?: boolean | null;
  arteDoCliente?: boolean | null;
  arteRecebidaEm?: string | Date | null;
  kitRemessaId?: string | null;
  /**
   * PRODUÇÃO INTERNA (vai direto para a Gráfica, shared/producao-interna): o
   * envio da lista grava `skipApproval=true` por dentro, mas a peça NÃO é
   * "Sem patrocínio" — não é marca, não tem prazo de Layout ajustado e não
   * entra no filtro de marca (27/10). Quem monta a peça para a regra passa
   * este campo junto com `skipApproval`.
   */
  producaoInterna?: boolean | null;
  /** O tipo — o molde não passa por aprovação (shared/molde). */
  type?: string | null;
}

/**
 * OS STATUS DE "LAYOUT" do documento: rascunho, solicitado, vinculação e
 * aguardando envio (com as grafias legadas). É onde as marcas podem mudar sem
 * admin (RN07) e onde o prazo ajustado vale.
 */
export const STATUS_DE_LAYOUT: readonly string[] = statusDasEtapas("requested", "awaiting_linking", "awaiting_submission");
export const estaEmLayout = (status: string | null | undefined): boolean => !!status && STATUS_DE_LAYOUT.includes(status);

/**
 * "Sem patrocínio" = `skipApproval`, menos a produção interna e o molde — os
 * dois gravam a flag por dentro e não passam por aprovação nenhuma; para eles
 * não há "peça sem aprovação" (nem selo, nem Layout ajustado). O mesmo vale
 * para "Arte do cliente" (a tela e o servidor não deixam marcar; dado antigo
 * que a tenha não muda o prazo deles).
 */
const foraDasMarcas = (p: MarcasDaPeca | null | undefined): boolean => !!p?.producaoInterna || ehMolde(p);
export const semPatrocinio = (p: MarcasDaPeca | null | undefined): boolean => !!p?.skipApproval && !foraDasMarcas(p);
export const arteDoCliente = (p: MarcasDaPeca | null | undefined): boolean => !!p?.arteDoCliente && !foraDasMarcas(p);

/** RN04: com qualquer marca a peça não passa pela Aprovação. */
export const pulaAprovacao = (p: MarcasDaPeca | null | undefined): boolean => semPatrocinio(p) || arteDoCliente(p);

/** RN06: "Layout — Aguardando arte do cliente" — marca sem a arte recebida, ainda em Layout. */
export const aguardandoArteDoCliente = (p: MarcasDaPeca | null | undefined): boolean =>
  arteDoCliente(p) && !p?.arteRecebidaEm && estaEmLayout(p?.status);

const ehDoKit = (p: MarcasDaPeca | null | undefined) => !!p?.kitRemessaId;

// ─── Quem muda as marcas (RN07) ──────────────────────────────────────────────

/** Quem marca/desmarca "Sem patrocínio" e "Arte do cliente" — quem monta a lista (o mesmo do PATCH). */
export const PAPEIS_QUE_MARCAM: readonly string[] = ["admin", "solicitacao"];
/** Quem registra "Arte recebida": Solicitação (recebe do cliente), Arte (confere o arquivo) e admin. */
export const PAPEIS_DA_ARTE_RECEBIDA: readonly string[] = ["admin", "solicitacao", "arte"];

/**
 * RN07: as marcas mudam enquanto a peça está em Layout; depois, só o admin.
 * (O papel de quem marca é a outra metade — `PAPEIS_QUE_MARCAM`.)
 */
export const marcasEditaveis = (status: string | null | undefined, papel: string | null | undefined): boolean =>
  papel === "admin" || estaEmLayout(status);

export const FRASE_MARCA_TRAVADA =
  "A peça já saiu do Layout: “Sem patrocínio” e “Arte do cliente” só mudam por um admin.";

/** Status em que a peça está NA Aprovação do patrocinador. */
const STATUS_NA_APROVACAO: readonly string[] = ["awaiting_approval", "awaiting_sponsor_approval"];

/**
 * O que a peça é, para decidir se ela PODE receber a marca (revisão 27/10).
 * A marca e o patrocinador vinculado não convivem: com patrocinador a peça
 * passa pela Aprovação (vincular desmarca — sponsors.ts), então MARCAR uma
 * peça com patrocinador pede antes tirar o vínculo. Molde e produção interna
 * não passam por aprovação nenhuma; a peça já NA Aprovação sai dela pela
 * "Dispensar aprovação" (o servidor desfaria a marca lá — storage.ts).
 */
export interface PecaParaMarcar {
  status: string | null | undefined;
  temPatrocinador?: boolean;
  producaoInterna?: boolean | null;
  molde?: boolean;
}

/**
 * `null` = pode; senão a frase da recusa. `marcando`: a mudança LIGA alguma
 * marca (desmarcar só esbarra no papel e no RN07).
 */
export function recusaAoMarcar(peca: PecaParaMarcar, papel: string | null | undefined, marcando: boolean): string | null {
  const base = recusaDaMarca(peca.status, papel);
  if (base) return base;
  if (!marcando) return null;
  if (peca.molde) return "Molde não passa por aprovação — não leva “Sem patrocínio” nem “Arte do cliente”.";
  if (peca.producaoInterna) return "Produção interna vai direto para a Gráfica — não leva “Sem patrocínio” nem “Arte do cliente”.";
  if (STATUS_NA_APROVACAO.includes(String(peca.status ?? ""))) {
    return "A peça está na Aprovação do patrocinador — para tirá-la de lá, a Arte usa “Dispensar aprovação”.";
  }
  if (peca.temPatrocinador) {
    return "A peça tem patrocinador vinculado — com patrocinador ela passa pela Aprovação. Tire o vínculo na Vinculação antes de marcar.";
  }
  return null;
}

/** `null` = pode; senão a frase da recusa. */
export function recusaDaMarca(status: string | null | undefined, papel: string | null | undefined): string | null {
  if (!PAPEIS_QUE_MARCAM.includes(String(papel ?? ""))) return "Marcar “Sem patrocínio” ou “Arte do cliente” é do admin e da Solicitação.";
  if (!marcasEditaveis(status, papel)) return FRASE_MARCA_TRAVADA;
  return null;
}

// ─── Datas ("YYYY-MM-DD") ────────────────────────────────────────────────────

const meioDia = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`);

export function somarDiasCorridos(dia: string, n: number): string {
  const t = meioDia(dia);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/**
 * RN02/RN03: o prazo de Layout ajustado — o prazo de Layout do evento (já
 * ajustado ao fim de semana) + N dias CORRIDOS, e a data resultante na regra
 * de fim de semana do marco de Layout (seg–sex). Ver o cabeçalho.
 */
export function prazoDeLayoutAjustado(prazoDeLayout: string, diasDaAprovacao: number): string {
  const d = meioDia(somarDiasCorridos(prazoDeLayout, diasDaAprovacao));
  d.setUTCDate(d.getUTCDate() + deslocamentoDeFimDeSemana(d.getUTCDay(), FIM_DE_SEMANA_DO_MARCO.layouts));
  return d.toISOString().slice(0, 10);
}

/**
 * O prazo de Layout de um EVENTO ("YYYY-MM-DD"): saída do caminhão + offset da
 * Entrega de Layouts, com a regra de fim de semana do marco (seg–sex). `null`
 * sem data (ou com ano absurdo). É a base do ajustado em toda tela que não
 * recebe os prazos prontos do servidor (ficha, formulário, Detalhe, Arte).
 */
export function prazoDeLayoutDoEvento(
  event: { truckDepartureDate?: Date | string | null; deadlineEntregaLayouts?: number | null } | null | undefined,
): string | null {
  if (!event?.truckDepartureDate) return null;
  const d = new Date(event.truckDepartureDate);
  if (!Number.isFinite(d.getTime())) return null;
  const dia = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (!isPlausibleEventDate(new Date(dia).toISOString().slice(0, 10))) return null;
  const offset = event.deadlineEntregaLayouts ?? OFFSET_PADRAO_DO_MARCO.deadlineEntregaLayouts;
  return diaDoMarcoUTC(dia, offset, FIM_DE_SEMANA_DO_CAMPO.deadlineEntregaLayouts).toISOString().slice(0, 10);
}

// ─── O funil (os seis marcos da Gestão de Prazos) ────────────────────────────

/** Índices dos marcos no funil (shared/fluxo-peca → FUNIL_DE_PRAZOS). */
export const INDICE_LISTA = FUNIL_DE_PRAZOS.findIndex((f) => f.key === "listaImagens");
export const INDICE_LAYOUT = FUNIL_DE_PRAZOS.findIndex((f) => f.key === "layouts");
export const INDICE_APROVACAO = FUNIL_DE_PRAZOS.findIndex((f) => f.key === "aprovacao");
export const INDICE_FINALIZACAO = FUNIL_DE_PRAZOS.findIndex((f) => f.key === "finalizacao");
/** O primeiro marco que cobra a peça do Kit (shared/kit.ts). */
const INDICE_DO_KIT = FUNIL_DE_PRAZOS.findIndex((f) => f.key === MARCO_EM_QUE_O_KIT_ENTRA);

const ETAPA_DO_STATUS: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  FUNIL_DE_PRAZOS.forEach((f, i) => statusDoFunil(f.key).forEach((s) => { m[s] = i; }));
  return m;
})();

/** Em que marco do funil a peça ESTÁ (pelo status). `undefined` = entregue ou fora do funil. */
export const etapaNoFunil = (status: string | null | undefined): number | undefined =>
  status ? ETAPA_DO_STATUS[status] : undefined;

/**
 * O MARCO QUE COBRA a peça — nem sempre é a etapa em que ela está:
 *   · Kit em etapa anterior ao marco do Kit (a Entrega de Layouts) → esse marco;
 *   · com marca, em Lista de Imagens → Layout (o Layout do documento é um só);
 *   · o resto → a própria etapa.
 * `status` é o status DE CONTAGEM (molde produzido já chega como entregue).
 */
export function marcoQueCobra(p: MarcasDaPeca & { status: string }): number | undefined {
  const rank = etapaNoFunil(p.status);
  if (rank === undefined) return undefined;
  if (ehDoKit(p) && rank < INDICE_DO_KIT) return INDICE_DO_KIT;
  if (pulaAprovacao(p) && rank < INDICE_LAYOUT) return INDICE_LAYOUT;
  return rank;
}

/** A peça é medida pelo prazo de Layout ajustado AGORA (tem marca e está em Layout)? */
export const medidaPeloLayoutAjustado = (p: MarcasDaPeca & { status: string }): boolean => {
  const rank = etapaNoFunil(p.status);
  return pulaAprovacao(p) && rank !== undefined && rank <= INDICE_LAYOUT;
};

/** O prazo da peça num marco: o do evento, ou o piso dela quando é mais tarde. */
export const prazoNoMarco = (i: number, prazosDoEvento: readonly string[], piso: string | null): string =>
  // O piso (Layout ajustado) só vale NO marco de Layout: da Aprovação em
  // diante os prazos são os do evento, sempre (RN05) — com N maior que a
  // folga entre Layout e Finalização, o piso empurraria a Finalização.
  i === INDICE_LAYOUT && piso && piso > (prazosDoEvento[i] ?? "") ? piso : prazosDoEvento[i];

export interface PrazoDaPeca {
  /** O marco que cobra a peça (índice do funil). */
  marco: number;
  /** O prazo que a mede agora ("YYYY-MM-DD"). */
  prazo: string;
  /** O prazo do mesmo marco sem a marca (o do evento). */
  prazoNormal: string;
  /** O prazo veio da regra das peças sem aprovação. */
  ajustado: boolean;
  /**
   * O piso: o prazo de Layout ajustado, quando ele vale para a peça. No marco
   * de Layout ela só está atrasada depois DELE; dali em diante valem os
   * prazos do evento (`prazoNoMarco`, RN05).
   */
  piso: string | null;
}

/**
 * A FUNÇÃO ÚNICA — o prazo que mede a peça. `prazosDoEvento` são os seis
 * prazos do evento ("YYYY-MM-DD", a ordem do funil, já com o fim de semana);
 * `diasDaAprovacao` é a configuração. `null` = entregue ou fora do funil.
 */
export function prazoDaPeca(
  p: MarcasDaPeca & { status: string },
  prazosDoEvento: readonly string[],
  diasDaAprovacao: number,
): PrazoDaPeca | null {
  const marco = marcoQueCobra(p);
  if (marco === undefined || !prazosDoEvento[marco]) return null;
  const piso = medidaPeloLayoutAjustado(p) && prazosDoEvento[INDICE_LAYOUT]
    ? prazoDeLayoutAjustado(prazosDoEvento[INDICE_LAYOUT], diasDaAprovacao)
    : null;
  const prazo = prazoNoMarco(marco, prazosDoEvento, piso);
  return { marco, prazo, prazoNormal: prazosDoEvento[marco], ajustado: prazo !== prazosDoEvento[marco], piso };
}

/**
 * RF12 — "prazo normal × prazo ajustado" do LAYOUT da peça, para a ficha e a
 * linha. Só existe para a peça com marca (a do Kit também, desde 26/10). Vale em qualquer etapa:
 * depois do Layout ele é a história de como a peça foi medida.
 */
export function prazosDeLayoutDaPeca(
  p: MarcasDaPeca,
  prazoDeLayoutDoEvento: string | null | undefined,
  diasDaAprovacao: number,
): { normal: string; ajustado: string } | null {
  if (!pulaAprovacao(p) || !prazoDeLayoutDoEvento) return null;
  return { normal: prazoDeLayoutDoEvento.slice(0, 10), ajustado: prazoDeLayoutAjustado(prazoDeLayoutDoEvento, diasDaAprovacao) };
}

// ─── Atraso por responsável (RN09) ───────────────────────────────────────────

export type ResponsavelPeloAtraso = "interno" | "cliente";

/**
 * Quem responde pelo atraso da peça: o CLIENTE quando ela espera a arte do
 * cliente e o prazo de Layout ajustado já passou; senão, interno. Só faz
 * sentido para a peça atrasada — `null` quando ela não está.
 */
export function responsavelPeloAtraso(
  p: MarcasDaPeca,
  prazo: Pick<PrazoDaPeca, "prazo" | "piso"> | null | undefined,
  hoje: string,
): ResponsavelPeloAtraso | null {
  if (!prazo || !(prazo.prazo < hoje)) return null;
  return aguardandoArteDoCliente(p) && !!prazo.piso && prazo.piso < hoje ? "cliente" : "interno";
}

/** Dias desde que a peça foi marcada "Arte do cliente" (RF10). `null` sem o carimbo. */
export function diasAguardandoArte(marcadaEm: string | Date | null | undefined, hoje: string): number | null {
  if (!marcadaEm) return null;
  const d = typeof marcadaEm === "string" ? marcadaEm : marcadaEm.toISOString();
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(d));
  return Math.max(0, Math.round((meioDia(hoje).getTime() - meioDia(dia).getTime()) / 86_400_000));
}

// ─── A frase da trilha (RN10) ────────────────────────────────────────────────

/** A peça ainda vai passar (ou está passando) pela Aprovação: Layout ou a própria Aprovação. */
const aAprovacaoAindaVem = (status: string | null | undefined): boolean => {
  if (status == null) return true;
  const rank = etapaNoFunil(status);
  return rank !== undefined && rank <= INDICE_APROVACAO;
};

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/**
 * "Arte do cliente marcada — prazo de Layout: normal 10/11/2026 · ajustado
 * 17/11/2026 (+7 dias corridos)". Quem e quando ficam na própria linha da
 * trilha (usuário e data do registro).
 */
export function fraseDaTrilhaDaMarca(
  marca: "semPatrocinio" | "arteDoCliente",
  marcou: boolean,
  /** Prazo de Layout normal e ajustado NESTE momento (null: evento sem data). */
  prazos: { normal: string; ajustado: string } | null,
  diasDaAprovacao: number,
  /** Depois da mudança a peça ainda pula a Aprovação (a outra marca segue)? */
  aindaSemAprovacao: boolean,
  contexto?: string,
  /**
   * O status da peça DEPOIS da mudança. Em Layout (ou já na Aprovação, como
   * na reabertura do "Acrescentar patrocinador") a desmarcação devolve a
   * Aprovação; depois dela (só o admin desmarca ali, RN07) a peça NÃO volta
   * de etapa — segue onde está. Omitido = em Layout (a criação).
   */
  statusDepois?: string | null,
): string {
  const nome = marca === "semPatrocinio" ? ROTULO_SEM_PATROCINIO : ROTULO_ARTE_DO_CLIENTE;
  const acao = marcou ? `“${nome}” marcada` : `“${nome}” desmarcada`;
  const base = contexto ? `${acao} (${contexto})` : acao;
  if (!prazos) return `${base} — prazo de Layout ajustado não se aplica (evento sem data).`;
  const vale = aindaSemAprovacao
    ? (marcou ? "vale o ajustado; a peça pula a Aprovação" : "segue o ajustado pela outra marca")
    : aAprovacaoAindaVem(statusDepois)
      ? "volta a valer o normal; a Aprovação volta para a peça (ela passa pela Aprovação quando tiver patrocinador vinculado)"
      : "volta a valer o prazo normal; a peça segue na etapa em que está";
  return `${base} — prazo de Layout: normal ${br(prazos.normal)} · ajustado ${br(prazos.ajustado)} (+${diasDaAprovacao} ${diasDaAprovacao === 1 ? "dia corrido" : "dias corridos"}); ${vale}.`;
}
