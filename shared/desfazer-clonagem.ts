// ─────────────────────────────────────────────────────────────────────────────
// DESFAZER A CLONAGEM — as regras, num lugar só (servidor e tela leem daqui).
//
// O caso (Fernanda, Solicitação, 19/10): "Fui clonar umas peças de outra lista
// pra jogar na Eco Navegantes e veio a lista toda." O diálogo abria com TODAS
// as peças da origem marcadas, ela confirmou, e 69 peças caíram num evento que
// já tinha 67. Desfazer à mão eram 69 exclusões. O dono aprovou um botão.
//
// A regra em quatro linhas:
//   · desfaz SÓ as peças daquela clonagem que seguem em RASCUNHO e intocadas
//     — peça que andou (enviada para a vinculação, editada, com estoque
//     reservado) é trabalho de alguém e FICA, com o motivo dito;
//   · dentro de uma JANELA (2 horas): desfazer é a correção do engano de
//     agora, não uma limpeza de lista antiga — essa é a exclusão de sempre;
//   · quem pode: QUEM CLONOU, ou um administrador;
//   · excluir é a exclusão normal (soft, para a lixeira, restaurável).
//
// O LOTE mora na trilha de auditoria (sem coluna nova): a clonagem grava uma
// linha `entityType: "clonagem"` com os ids das peças criadas em JSON, e o
// desfazer grava outra que a marca como desfeita. Ver
// server/routes/itens/desfazer-clonagem.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** Quanto tempo depois de clonar o desfazer continua oferecido. */
export const JANELA_DO_DESFAZER_MS = 2 * 60 * 60 * 1000;

/** A janela dita em palavras — a mesma frase no servidor e na tela. */
export const JANELA_DO_DESFAZER_TEXTO = "2 horas";

/** O `entityType` das duas linhas de máquina da trilha (lote e desfeito). */
export const TRILHA_DA_CLONAGEM = "clonagem";
export const ACAO_DO_LOTE = "clone_lote";
export const ACAO_DO_DESFEITO = "clone_desfeito";

/**
 * Folga entre o carimbo das peças ao nascer e o `updatedAt` de agora para
 * contar como "editada". As peças da clonagem nascem num INSERT só (o mesmo
 * now() para todas); qualquer gravação depois troca o carimbo pelo relógio da
 * gravação. Dois segundos absorvem arredondamento, nunca uma edição de gente.
 */
const FOLGA_DO_CARIMBO_MS = 2000;

/** O que a linha `clone_lote` da trilha guarda (details, em JSON). */
export interface LoteDaClonagem {
  v: 1;
  destinoId: string;
  origemId: string;
  origemNome: string;
  /** Ids das peças CRIADAS pela clonagem (as cópias, não as da origem). */
  ids: string[];
  /** Quando clonou (ISO, relógio do servidor) — a base da janela. */
  em: string;
  /** `updatedAt` das cópias ao nascer (ISO) — o que diz se alguém mexeu. */
  carimbo: string | null;
  porId: string | null;
  porNome: string;
  /** A frase legível da linha (Logs do sistema mostram esta, não o JSON). */
  resumo: string;
}

/** O que a linha `clone_desfeito` da trilha guarda (details, em JSON). */
export interface DesfeitoDaClonagem {
  v: 1;
  loteId: string;
  removidas: number;
  ficaram: number;
  resumo: string;
}

/** Lê o JSON da trilha sem confiar nele: linha estranha vira null. */
export function lerLote(details: string | null | undefined): LoteDaClonagem | null {
  try {
    const d = JSON.parse(details ?? "");
    if (d?.v !== 1 || !Array.isArray(d.ids) || typeof d.em !== "string" || typeof d.destinoId !== "string") return null;
    return d as LoteDaClonagem;
  } catch {
    return null;
  }
}

export function lerDesfeito(details: string | null | undefined): DesfeitoDaClonagem | null {
  try {
    const d = JSON.parse(details ?? "");
    return d?.v === 1 && typeof d.loteId === "string" ? (d as DesfeitoDaClonagem) : null;
  } catch {
    return null;
  }
}

/** Quando a janela fecha. */
export const expiraEm = (lote: Pick<LoteDaClonagem, "em">): Date =>
  new Date(new Date(lote.em).getTime() + JANELA_DO_DESFAZER_MS);

export const dentroDaJanela = (lote: Pick<LoteDaClonagem, "em">, agora: Date): boolean =>
  agora.getTime() <= expiraEm(lote).getTime();

/** Quem clonou, ou um administrador. */
export function podeDesfazer(quem: { papel?: string | null; userId?: string | null }, lote: Pick<LoteDaClonagem, "porId">): boolean {
  if (quem.papel === "admin") return true;
  return !!lote.porId && !!quem.userId && lote.porId === quem.userId;
}

/** A peça como a regra a lê. */
export interface PecaDoLote {
  eventId: string;
  status: string;
  deletedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  pedidoDePecaLinhaId?: string | null;
}

/**
 * Por que a peça FICA (não é desfeita) — ou null quando ela pode sair.
 *
 * A ordem é a de "o que a pessoa reconhece primeiro": a peça que andou no
 * fluxo é a explicação mais comum, e "editada" só vale para quem ainda está
 * em rascunho.
 */
export function motivoParaFicar(
  peca: PecaDoLote,
  lote: Pick<LoteDaClonagem, "destinoId" | "carimbo">,
  temReserva: boolean,
): string | null {
  if (peca.eventId !== lote.destinoId) return "foi transferida para outro evento";
  if (peca.status !== "draft") return "já saiu do rascunho";
  if (peca.pedidoDePecaLinhaId) return "está ligada a uma solicitação de peça";
  if (temReserva) return "tem peça do estoque reservada";
  if (lote.carimbo && peca.updatedAt) {
    const mexeu = Math.abs(new Date(peca.updatedAt).getTime() - new Date(lote.carimbo).getTime()) > FOLGA_DO_CARIMBO_MS;
    if (mexeu) return "foi editada depois da clonagem";
  }
  return null;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * "3 ficaram: 2 já saíram do rascunho, 1 foi editada depois da clonagem."
 * Agrupa por motivo, do mais comum para o menos.
 */
export function fraseDasQueFicaram(ficaram: ReadonlyArray<{ motivo: string }>): string {
  if (ficaram.length === 0) return "";
  const porMotivo = new Map<string, number>();
  for (const f of ficaram) porMotivo.set(f.motivo, (porMotivo.get(f.motivo) ?? 0) + 1);
  const partes = Array.from(porMotivo.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([motivo, n]) => `${n} ${n === 1 ? motivo : pluralDoMotivo(motivo)}`);
  return `${plural(ficaram.length, "peça ficou", "peças ficaram")}: ${partes.join(", ")}.`;
}

/** O verbo dos motivos no plural ("foi editada" → "foram editadas"). */
function pluralDoMotivo(motivo: string): string {
  return motivo
    .replace(/^foi transferida/, "foram transferidas")
    .replace(/^já saiu/, "já saíram")
    .replace(/^está ligada/, "estão ligadas")
    .replace(/^tem peça do estoque reservada/, "têm peça do estoque reservada")
    .replace(/^foi editada/, "foram editadas")
    .replace(/^tem complemento ativo/, "têm complemento ativo");
}
