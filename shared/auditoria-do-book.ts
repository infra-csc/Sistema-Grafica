// ─────────────────────────────────────────────────────────────────────────────
// AUDITORIA DO BOOK COM IA (dono, 19/10): "às vezes tem peça que tá no book mas
// esquecemos de colocar na lista… rodar uma IA pra criticar e gerar
// notificações" — e "isso aparecer como uma notificação para o usuário de
// solicitação a cada book subido, na tela de eventos, igual aparece a
// solicitação".
//
// A cada book publicado, a IA lê o PDF (cada página = arte de uma peça +
// legenda) e compara com as peças ATIVAS do evento, casando pelo SENTIDO e não
// pelo nome. O que ela devolve vira dois tipos de achado:
//   · FALTANDO — peça desenhada no book que não tem cadastro na lista;
//   · CANCELADA NO APP — peça desenhada cuja correspondente foi cancelada
//     (dono, 19/10: patrocinador trocado; não é peça esquecida);
//   · DIVERGÊNCIA — peça que existe, mas com medida/patrocinador/texto
//     diferente do que o book mostra.
// Faltando + canceladas são as "peças a revisar" (selo, atalho, faixa, menu);
// divergência fica só no painel. Quem monta a lista (Solicitação, menos o
// usuário do Kit) e o admin marcam cada achado ("Já cadastrei"/"Não precisa";
// cancelada: "Já resolvi"/"Cancelada de propósito"; divergência: "Já
// conferi"). A auditoria roda só no 1º BOOK de cada evento (dono, 19/10 —
// custo): reenvio não audita de novo, e a do 1º book continua valendo. O admin
// pode auditar o book atual quando quiser.
//
// Este arquivo é a parte PURA (tipos, contagem, quem vê) — usada pelo servidor
// e pelas telas. O processo da IA mora em server/services/auditoria-do-book/.
// ─────────────────────────────────────────────────────────────────────────────

export const STATUS_DA_AUDITORIA = ["pendente", "processando", "concluida", "erro", "sem_chave", "substituida"] as const;
export type StatusDaAuditoria = (typeof STATUS_DA_AUDITORIA)[number];

export const CONFIANCAS = ["alta", "media", "baixa"] as const;
export type ConfiancaDoAchado = (typeof CONFIANCAS)[number];

export const ROTULO_DA_CONFIANCA: Record<ConfiancaDoAchado, string> = {
  alta: "Confiança alta",
  media: "Confiança média",
  baixa: "Confiança baixa",
};

/** Peça desenhada no book sem cadastro na lista. `chave` = "f<n>". */
export interface AchadoFaltando {
  chave: string;
  pagina: number | null;
  pecaNoBook: string;
  detalhe: string;
  confianca: ConfiancaDoAchado;
  /** A peça do app mais parecida, quando a IA ficou em dúvida ("#7104 painel em lona"). */
  candidata: string | null;
  /** Id da candidata, quando ela é uma peça deste evento (vira link). */
  candidataId: string | null;
}

/**
 * Peça desenhada no book cuja correspondente no app está CANCELADA (dono,
 * 19/10: no Longevidade Manaus o patrocinador foi trocado e as peças foram
 * canceladas — não eram peças esquecidas). `chave` = "c<n>".
 */
export interface AchadoCancelada {
  chave: string;
  pagina: number | null;
  pecaNoBook: string;
  detalhe: string;
  /** Ids (uuid) das peças CANCELADAS do evento que correspondem. */
  ids: string[];
  /** As mesmas, legíveis: "#8040 2x1 Bradesco Seguros". */
  rotulos: string[];
}

/** Peça que existe na lista, mas diferente do book. `chave` = "d<n>". */
export interface DivergenciaDoBook {
  chave: string;
  pagina: number | null;
  /** Ids (uuid) das peças do evento envolvidas. */
  ids: string[];
  /** Os números legíveis das mesmas peças, na mesma ordem ("#6524"). */
  displayIds: string[];
  noBook: string;
  noApp: string;
}

export interface AchadosDoBook {
  faltando: AchadoFaltando[];
  /** Ausente nas auditorias gravadas antes de 19/10 à noite — leia com `canceladasDe`. */
  canceladas?: AchadoCancelada[];
  divergencias: DivergenciaDoBook[];
  observacoes: string | null;
}

export const MOTIVOS_DE_RESOLUCAO = ["cadastrada", "nao_precisa", "conferida"] as const;
export type MotivoDaResolucao = (typeof MOTIVOS_DE_RESOLUCAO)[number];

export interface ResolucaoDoAchado {
  motivo: MotivoDaResolucao;
  por: string | null;
  porId: string | null;
  /** ISO. */
  em: string;
}

export type ResolvidosDoBook = Record<string, ResolucaoDoAchado>;

/**
 * O motivo serve para aquele tipo de achado? Faltando e cancelada:
 * cadastrada ("Já cadastrei" / "Já resolvi") ou não precisa; divergência:
 * conferida ou não precisa.
 */
export function motivoServeParaChave(chave: string, motivo: MotivoDaResolucao): boolean {
  if (chave.startsWith("f") || chave.startsWith("c")) return motivo === "cadastrada" || motivo === "nao_precisa";
  if (chave.startsWith("d")) return motivo === "conferida" || motivo === "nao_precisa";
  return false;
}

/** Uma auditoria como a API devolve para a tela. Datas em ISO. */
export interface AuditoriaDoBookVista {
  id: string;
  eventId: string;
  eventName: string;
  bookUrl: string;
  /** Quando o book auditado foi publicado. */
  bookPublicadoEm: string | null;
  /** Saiu um book mais novo que o auditado (reenvio não audita de novo): quando. */
  bookMaisNovoEm: string | null;
  status: StatusDaAuditoria;
  modelo: string | null;
  achados: AchadosDoBook | null;
  resolvidos: ResolvidosDoBook;
  pecasNoBook: number | null;
  encontradasNoApp: number | null;
  erro: string | null;
  criadoEm: string;
  concluidoEm: string | null;
}

export interface RespostaDasAuditorias {
  auditorias: AuditoriaDoBookVista[];
  /** Só para admin: o servidor está sem ANTHROPIC_API_KEY (auditoria nova não roda). */
  semChave?: boolean;
}

/**
 * Quem vê e resolve os achados: Solicitação (menos o usuário do Kit, que só
 * enxerga as peças dele) e admin. É a mesma régua da faixa de solicitações.
 */
export const podeVerAuditoriaDoBook = (papel: string | null | undefined, kit?: boolean | null): boolean =>
  papel === "admin" || (papel === "solicitacao" && kit !== true);

const SEM_ACHADOS: AchadosDoBook = { faltando: [], canceladas: [], divergencias: [], observacoes: null };

/** As canceladas de uma auditoria (as antigas não têm o campo). */
export const canceladasDe = (achados: AchadosDoBook | null | undefined): AchadoCancelada[] => achados?.canceladas ?? [];

/** As peças faltando que ninguém resolveu. Só conta auditoria concluída. */
export function faltandoEmAberto(a: Pick<AuditoriaDoBookVista, "status" | "achados" | "resolvidos">): AchadoFaltando[] {
  if (a.status !== "concluida") return [];
  const achados = a.achados ?? SEM_ACHADOS;
  return achados.faltando.filter((f) => !a.resolvidos?.[f.chave]);
}

/** As desenhadas no book que estão canceladas no app e ninguém resolveu. */
export function canceladasEmAberto(a: Pick<AuditoriaDoBookVista, "status" | "achados" | "resolvidos">): AchadoCancelada[] {
  if (a.status !== "concluida") return [];
  return canceladasDe(a.achados).filter((c) => !a.resolvidos?.[c.chave]);
}

/**
 * "Peças a revisar" (dono, 19/10): faltando + canceladas no app, em aberto.
 * É o número do selo, do atalho, da faixa e do menu. Divergência não entra —
 * a peça existe; é conferência, não falta.
 */
export const aRevisarEmAberto = (a: Pick<AuditoriaDoBookVista, "status" | "achados" | "resolvidos">): number =>
  faltandoEmAberto(a).length + canceladasEmAberto(a).length;

export function divergenciasEmAberto(a: Pick<AuditoriaDoBookVista, "status" | "achados" | "resolvidos">): DivergenciaDoBook[] {
  if (a.status !== "concluida") return [];
  const achados = a.achados ?? SEM_ACHADOS;
  return achados.divergencias.filter((d) => !a.resolvidos?.[d.chave]);
}

export interface ResumoDasAuditorias {
  /** Peças a revisar (faltando + canceladas no app) em aberto, em todos os books atuais. */
  pecas: number;
  /** Eventos com pelo menos uma peça a revisar. */
  eventos: number;
  /** eventId → peças a revisar em aberto (só os que têm alguma). */
  porEvento: Map<string, number>;
}

export function resumirAuditorias(lista: readonly Pick<AuditoriaDoBookVista, "eventId" | "status" | "achados" | "resolvidos">[]): ResumoDasAuditorias {
  const porEvento = new Map<string, number>();
  for (const a of lista) {
    const n = aRevisarEmAberto(a);
    if (n > 0) porEvento.set(a.eventId, (porEvento.get(a.eventId) ?? 0) + n);
  }
  let pecas = 0;
  porEvento.forEach((n) => { pecas += n; });
  return { pecas, eventos: porEvento.size, porEvento };
}

/** "1 peça" / "3 peças". */
export const nPecas = (n: number) => `${n} ${n === 1 ? "peça" : "peças"}`;
/** "1 evento" / "3 eventos". */
export const nEventos = (n: number) => `${n} ${n === 1 ? "evento" : "eventos"}`;

/**
 * O link do PDF já na página do achado. `#page=N` é o parâmetro de abertura
 * de PDF que Chrome, Edge, Firefox e Safari entendem; URL que já tem âncora
 * fica como está.
 */
export function linkDaPagina(bookUrl: string, pagina: number | null | undefined): string {
  if (!pagina || pagina < 1 || bookUrl.includes("#")) return bookUrl;
  return `${bookUrl}#page=${Math.floor(pagina)}`;
}

/**
 * A frase do sino: "Book do Night Run Vitória: 3 peças do book não estão na
 * lista" — e, havendo, "… e 13 estão canceladas no app".
 */
export function fraseDaNotificacaoDoBook(nomeDoEvento: string, faltando: number, canceladas = 0): string {
  const partes: string[] = [];
  if (faltando > 0) partes.push(`${faltando} ${faltando === 1 ? "peça do book não está na lista" : "peças do book não estão na lista"}`);
  if (canceladas > 0) {
    partes.push(faltando > 0
      ? `${canceladas} ${canceladas === 1 ? "está cancelada" : "estão canceladas"} no app`
      : `${canceladas} ${canceladas === 1 ? "peça do book está cancelada" : "peças do book estão canceladas"} no app`);
  }
  return `Book do ${nomeDoEvento}: ${partes.join(" e ")}`;
}

/** O rótulo do contador do menu: "3 peças do book a revisar na lista". */
export const rotuloDoContadorDoBook = (n: number) =>
  `${n} ${n === 1 ? "peça do book a revisar" : "peças do book a revisar"} na lista (fora da lista ou canceladas)`;
