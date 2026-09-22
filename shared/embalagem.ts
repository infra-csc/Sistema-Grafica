// ─────────────────────────────────────────────────────────────────────────────
// EMBALAGEM COM QUANTIDADE (dono, 21/09: "podemos ter quantidade diferente em
// tubos diferentes, então tem que colocar as quantidades também").
//
// Substitui a premissa antiga "a peça vai INTEIRA para um tubo": uma peça de
// 10 un. pode ir 7 no Tubo 1 e 3 no Tubo 2 — ou 7 embaladas hoje e 3 depois,
// quando forem conferidas. O vínculo peça × volume é uma LINHA com quantidade
// (tabela `tubo_itens`); `items.embalada_qty` é o total já embalado da peça,
// ENTREGUE OU NÃO; `items.tubo_id` continua existindo como atalho (o volume
// aberto com mais unidades) para o que já lia esse campo.
//
// A CONTA PROTEGIDA, numa linha:
//     entregues ≤ embaladas ≤ conferidas ≤ produzidas + reuso ≤ quantidade
//
// O FLUXO é um só (dono, 21/09: "todas são embaladas"): Conferido → Embalado →
// Entregue. Só unidade CONFERIDA é embalada; quem entrega é o VOLUME (tubo ou
// embalagem avulsa), e ele entrega as quantidades que estão nele. A peça vira
// `packed` quando TUDO está embalado e `delivered` quando TUDO foi entregue;
// no meio do caminho fica no status em que está, com o progresso à vista.
//
// Tudo aqui é função pura — servidor e tela leem as MESMAS contas, e o teste
// não precisa de banco nem de tela.
// ─────────────────────────────────────────────────────────────────────────────

export type PecaDaEmbalagem = {
  quantity?: number | null;
  quantityProduced?: number | null;
  reuseQty?: number | null;
  isReuse?: boolean | null;
  conferredQty?: number | null;
  embaladaQty?: number | null;
  deliveredQty?: number | null;
  status?: string | null;
};

import { EM_REVISAO, podeIrParaTubo } from "./fluxo-peca";
import { pecaTravada, fraseDaTrava, type PecaTravavel } from "./trava-da-peca";

const n = (v: unknown) => { const x = Math.trunc(Number(v)); return Number.isFinite(x) && x > 0 ? x : 0; };

export const quantidadeDe = (p: PecaDaEmbalagem) => n(p.quantity);
export const embaladaDe = (p: PecaDaEmbalagem) => n(p.embaladaQty);
export const entregueDe = (p: PecaDaEmbalagem) => n(p.deliveredQty);

/**
 * O QUE JÁ SAIU DA CONTA DE EMBALAR: o maior entre embaladas e entregues.
 * A ENTREGA PARCIAL ANTIGA (feita pelo modelo de antes da embalagem — em
 * produção havia 7 peças `produced` com `delivered_qty > 0` e `embalada_qty = 0`)
 * nunca passou por volume, mas as unidades JÁ SAÍRAM: contam como embaladas
 * para não serem oferecidas de novo. Ao embalar, `embalada_qty` parte daqui
 * (ver planejarEmbalar) e a conta protegida volta a valer.
 */
export const jaSaiuDaConta = (p: PecaDaEmbalagem) => Math.max(embaladaDe(p), entregueDe(p));

/**
 * O STATUS deixa embalar? Só peça que saiu da impressão (produced/conferred/
 * packed — PODE_IR_PARA_TUBO) e fora de revisão. Cancelada, arquivada, em
 * aprovação ou em revisão NUNCA é embalada — nem o reaproveitamento antigo
 * (isReuse com reuseQty 0), que antes valia a quantidade inteira em qualquer
 * status (em produção: 6 dessas ainda antes da produção).
 */
export const statusEmbalavel = (status: string | null | undefined): boolean =>
  podeIrParaTubo(status) && !EM_REVISAO.has(String(status));

/** Por que o status não deixa embalar — frase de gente, para a recusa. */
export function motivoDoStatus(status: string | null | undefined): string {
  if (status === "canceled") return "está cancelada";
  if (status === "archived") return "está arquivada";
  if (status && EM_REVISAO.has(status)) return "está em revisão";
  return "ainda não saiu da impressão";
}

/**
 * A peça é um PROBLEMA dentro de um volume ainda aberto — não pode sair na
 * entrega: excluída, TRAVADA pela Solicitação, cancelada, arquivada, devolvida
 * à revisão ou a um passo antes da impressão depois de embalada. Null quando
 * está tudo certo. A trava entra aqui (revisão de 22/09) para o modal de
 * entrega mostrar e desabilitar ANTES do 409 — a frase é a mesma da recusa.
 */
export function problemaNoVolume(p: { status?: string | null; deletedAt?: unknown } & PecaTravavel): string | null {
  if (p.deletedAt) return "foi excluída";
  if (p.status === "delivered" || p.status === "entregue") return null;
  if (pecaTravada(p)) return fraseDaTrava(p);
  if (statusEmbalavel(p.status)) return null;
  const motivo = motivoDoStatus(p.status);
  return motivo === "ainda não saiu da impressão" ? "voltou para antes da impressão" : motivo;
}

/**
 * Unidades que JÁ podem ser embaladas = as conferidas. O reuso LEGADO (marcado
 * antes de `reuse_qty` existir: isReuse com reuseQty 0) nunca passou por
 * conferência — a regra antiga o mandava direto à entrega —, então vale a
 * quantidade inteira, para não travar o que já estava em andamento.
 */
export const conferidasParaEmbalar = (p: PecaDaEmbalagem) =>
  p.isReuse && n(p.reuseQty) === 0 ? quantidadeDe(p) : Math.min(n(p.conferredQty), quantidadeDe(p));

/** Quanto ainda dá para embalar AGORA: conferidas − max(embaladas, entregues); 0 se o status não deixa. */
export const aEmbalar = (p: PecaDaEmbalagem) =>
  statusEmbalavel(p.status) ? Math.max(0, conferidasParaEmbalar(p) - jaSaiuDaConta(p)) : 0;

/** Tudo embalado (é o que faz a peça virar `packed`) — a entrega antiga conta como embalada. */
export const todaEmbalada = (p: PecaDaEmbalagem) => quantidadeDe(p) > 0 && jaSaiuDaConta(p) >= quantidadeDe(p);

/** O que quebra a conta protegida — vazio quando está tudo certo. */
export function violacoesDaConta(p: PecaDaEmbalagem): string[] {
  const erros: string[] = [];
  const q = quantidadeDe(p), conf = conferidasParaEmbalar(p), emb = embaladaDe(p), ent = entregueDe(p);
  const feitas = p.isReuse && n(p.reuseQty) === 0 ? q : n(p.quantityProduced) + n(p.reuseQty);
  // `emb = 0` com entregues é a entrega parcial ANTIGA (sem volume): não é erro.
  if (ent > emb && emb > 0) erros.push(`entregues (${ent}) > embaladas (${emb})`);
  if (emb > conf) erros.push(`embaladas (${emb}) > conferidas (${conf})`);
  if (n(p.conferredQty) > feitas) erros.push(`conferidas (${n(p.conferredQty)}) > produzidas + reuso (${feitas})`);
  if (feitas > q) erros.push(`produzidas + reuso (${feitas}) > quantidade (${q})`);
  return erros;
}

// ── Embalar ─────────────────────────────────────────────────────────────────

export type PedidoDeEmbalar = { id: string; quantidade?: number | null };

/**
 * Valida UMA peça do pedido: 1..(conferidas − já embaladas); sem quantidade, o
 * padrão é tudo o que está conferido e ainda não embalado. Devolve a quantidade
 * a embalar, o total novo e o status que a peça passa a ter.
 */
export function planejarEmbalar(p: PecaDaEmbalagem, pedida?: number | null):
  | { ok: true; quantidade: number; embaladaQty: number; viraEmbalada: boolean }
  | { ok: false; motivo: string } {
  if (!statusEmbalavel(p.status)) return { ok: false, motivo: motivoDoStatus(p.status) };
  const disponivel = aEmbalar(p);
  if (disponivel <= 0) {
    if (todaEmbalada(p)) return { ok: false, motivo: `já está toda embalada (${jaSaiuDaConta(p)} de ${quantidadeDe(p)})` };
    return {
      ok: false,
      motivo: jaSaiuDaConta(p) > 0
        ? `não há unidade conferida sem embalar (${jaSaiuDaConta(p)} de ${quantidadeDe(p)} já embaladas ou entregues)`
        : "ainda não tem unidade conferida para embalar",
    };
  }
  const quer = pedida === undefined || pedida === null ? disponivel : Math.trunc(Number(pedida));
  if (!Number.isFinite(quer) || quer < 1) return { ok: false, motivo: "a quantidade a embalar tem de ser pelo menos 1" };
  if (quer > disponivel) return { ok: false, motivo: `só há ${disponivel} conferida(s) sem embalar (pediu ${quer})` };
  // A partir do que JÁ SAIU (embaladas ou entregues antigas): 7 entregues pelo
  // modelo antigo + 3 embaladas agora = 10 → `packed`, e entregues ≤ embaladas.
  const total = jaSaiuDaConta(p) + quer;
  return { ok: true, quantidade: quer, embaladaQty: total, viraEmbalada: total >= quantidadeDe(p) };
}

// ── Tirar do volume / desfazer a embalagem ──────────────────────────────────

/** Devolve a quantidade da linha a "conferida não embalada". Peça `packed` volta a `conferred`. */
export function planejarRetirada(p: PecaDaEmbalagem, quantidadeDaLinha: number): { embaladaQty: number; voltaAConferida: boolean } {
  return { embaladaQty: Math.max(entregueDe(p), embaladaDe(p) - n(quantidadeDaLinha)), voltaAConferida: p.status === "packed" };
}

// ── Entregar o volume ───────────────────────────────────────────────────────

/** O volume entrega AS QUANTIDADES que estão nele; `delivered` só quando tudo saiu. */
export function planejarEntrega(p: PecaDaEmbalagem, quantidadeDaLinha: number): { deliveredQty: number; viraEntregue: boolean } {
  const total = Math.min(quantidadeDe(p), entregueDe(p) + n(quantidadeDaLinha));
  return { deliveredQty: total, viraEntregue: total >= quantidadeDe(p) };
}

// ── O atalho `items.tubo_id` ────────────────────────────────────────────────

export type LinhaDoVolume = { tuboId: string; quantidade: number; entregueEm?: unknown; numero?: number | null; avulso?: boolean | null };

/** O volume ABERTO com mais unidades da peça (empate: o primeiro). Sem linha aberta, o último entregue; sem linha, null. */
export function volumePrincipal(linhas: LinhaDoVolume[]): string | null {
  const abertas = linhas.filter((l) => !l.entregueEm);
  const base = abertas.length ? abertas : linhas;
  if (!base.length) return null;
  return base.reduce((m, l) => (n(l.quantidade) > n(m.quantidade) ? l : m), base[0]).tuboId;
}

// ── Como se diz ─────────────────────────────────────────────────────────────

/** "Tubo 1 (7) · Tubo 2 (3)" — ou "Embalada (10)" para a que foi sozinha. */
export function seloDosVolumes(linhas: LinhaDoVolume[]): string {
  return linhas
    .filter((l) => !l.entregueEm)
    .sort((a, b) => Number(!!a.avulso) - Number(!!b.avulso) || n(a.numero) - n(b.numero))
    .map((l) => (l.avulso ? `Embalada (${n(l.quantidade)})` : `Tubo ${n(l.numero)} (${n(l.quantidade)})`))
    .join(" · ");
}

/**
 * "7 de 10 embaladas" enquanto a peça está dividida no tempo; vazio quando não
 * ajuda. Conta SÓ o que foi embalado de verdade (`embaladaDe`): a entrega
 * parcial ANTIGA (7 entregues sem volume, 0 embaladas) não é "7 de 10
 * embaladas" — é "7 de 10 entregues" (revisão de 22/09).
 */
export function progressoDaEmbalagem(p: PecaDaEmbalagem): string {
  const emb = embaladaDe(p), ent = entregueDe(p), q = quantidadeDe(p);
  if (emb > 0 && emb < q) return `${emb} de ${q} embaladas`;
  if (emb === 0 && ent > 0 && ent < q) return `${ent} de ${q} entregues`;
  return "";
}

/** "(7 de 10)" ao lado da linha do volume quando a peça NÃO está inteira nele. */
export function parteDoTotal(quantidadeNoVolume: number, quantidadeDaPeca: number): string {
  return n(quantidadeNoVolume) < n(quantidadeDaPeca) ? `(${n(quantidadeNoVolume)} de ${n(quantidadeDaPeca)})` : "";
}

// ── Conferir ────────────────────────────────────────────────────────────────
// O TETO DA CONFERÊNCIA é o que EXISTE no galpão: impressas + reaproveitadas.
// Antes era `quantidade − conferidas` — dava para "conferir" 10 de uma peça
// com 6 impressas. Servidor (POST /confer) e telas (client/src/lib/saldo.ts)
// leem DAQUI, então não há como um oferecer o que o outro recusa.

/**
 * Decisão do dono (trocável): conferir o que JÁ SAIU da impressora mesmo antes
 * de a peça inteira ser impressa — 6 de 10 no acabamento → confere 6. Com
 * `false`, a parte impressa só confere quando a peça fecha a impressão (o
 * reaproveitado continua conferindo a qualquer momento).
 */
export const CONFERIR_PARCIAL = true;

/**
 * Decisão do dono (trocável): quando a conferência zera o que falta conferir,
 * o modal oferece (já marcado) "Já embalar (volume avulso) com esta foto".
 */
export const CONFERIR_E_EMBALAR = true;

/** Status em que a impressão já acabou: o contador vazio do acervo antigo não esconde a produção. */
const IMPRESSAO_FECHADA = new Set(["produced", "produzido", "conferred", "conferido", "packed"]);
/** Onde não se confere nada: fim do fluxo ou fora dele. */
const FORA_DA_CONFERENCIA = new Set(["delivered", "entregue", "canceled", "archived", "deleted"]);

/** O status deixa conferir? Fora da revisão e fora do fim do fluxo. */
export const statusConferivel = (status: string | null | undefined): boolean =>
  !EM_REVISAO.has(String(status)) && !FORA_DA_CONFERENCIA.has(String(status));

/**
 * Quantas unidades existem para conferir: impressas + reaproveitadas, até a
 * quantidade. Peça com a impressão fechada vale a parte impressa inteira mesmo
 * com `quantityProduced` vazio (acervo antigo: quem garante é o status).
 */
export function tetoDaConferencia(p: PecaDaEmbalagem, parcial: boolean = CONFERIR_PARCIAL): number {
  const q = quantidadeDe(p), reuso = n(p.reuseQty);
  const impressas = IMPRESSAO_FECHADA.has(String(p.status))
    ? Math.max(n(p.quantityProduced), q - reuso)
    : parcial ? n(p.quantityProduced) : 0;
  return Math.min(q, impressas + reuso);
}

/** Quanto ainda dá para conferir AGORA (0 quando o status não deixa). */
export const aConferir = (p: PecaDaEmbalagem, parcial: boolean = CONFERIR_PARCIAL): number =>
  statusConferivel(p.status) ? Math.max(0, tetoDaConferencia(p, parcial) - n(p.conferredQty)) : 0;

/**
 * Valida UMA conferência. `pedida` ausente = tudo o que existe para conferir;
 * enviada, tem de ser inteiro ≥ 1 (0, "abc" e null não viram "tudo"). A peça
 * só vira `conferred` quando TODA a quantidade foi conferida (`packed` se já
 * estava toda embalada); antes disso fica no status em que está.
 */
export function planejarConferencia(p: PecaDaEmbalagem, pedida?: unknown, parcial: boolean = CONFERIR_PARCIAL):
  | { ok: true; quantidade: number; conferredQty: number; completa: boolean; novoStatus: "conferred" | "packed" | null }
  | { ok: false; http: number; motivo: string } {
  const disponivel = aConferir(p, parcial);
  const q = quantidadeDe(p), ja = n(p.conferredQty);
  if (disponivel <= 0) {
    if (!statusConferivel(p.status)) return { ok: false, http: 409, motivo: `Esta peça não pode ser conferida agora (${motivoDoStatus(p.status)}).` };
    if (ja >= q && q > 0) return { ok: false, http: 409, motivo: `Nada a conferir: a peça já está toda conferida (${ja} de ${q}).` };
    return { ok: false, http: 409, motivo: `Nada a conferir agora: ${ja} de ${q} conferidas e nenhuma unidade impressa esperando conferência.` };
  }
  let quer = disponivel;
  if (pedida !== undefined) {
    const x = typeof pedida === "number" ? pedida : typeof pedida === "string" && pedida.trim() !== "" ? Number(pedida) : NaN;
    if (!Number.isInteger(x) || x < 1) return { ok: false, http: 400, motivo: "Informe quantas unidades conferir (número inteiro, pelo menos 1)." };
    if (x > disponivel) return { ok: false, http: 409, motivo: `Só há ${disponivel} un. para conferir agora (pediu ${x}) — o resto ainda não saiu da impressora.` };
    quer = x;
  }
  const total = ja + quer;
  const completa = total >= q;
  const novoStatus = completa ? (embaladaDe(p) >= q ? "packed" : "conferred") : null;
  return { ok: true, quantidade: quer, conferredQty: total, completa, novoStatus };
}
