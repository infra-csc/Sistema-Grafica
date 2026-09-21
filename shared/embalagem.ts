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

const n = (v: unknown) => { const x = Math.trunc(Number(v)); return Number.isFinite(x) && x > 0 ? x : 0; };

export const quantidadeDe = (p: PecaDaEmbalagem) => n(p.quantity);
export const embaladaDe = (p: PecaDaEmbalagem) => n(p.embaladaQty);
export const entregueDe = (p: PecaDaEmbalagem) => n(p.deliveredQty);

/**
 * Unidades que JÁ podem ser embaladas = as conferidas. O reuso LEGADO (marcado
 * antes de `reuse_qty` existir: isReuse com reuseQty 0) nunca passou por
 * conferência — a regra antiga o mandava direto à entrega —, então vale a
 * quantidade inteira, para não travar o que já estava em andamento.
 */
export const conferidasParaEmbalar = (p: PecaDaEmbalagem) =>
  p.isReuse && n(p.reuseQty) === 0 ? quantidadeDe(p) : Math.min(n(p.conferredQty), quantidadeDe(p));

/** Quanto ainda dá para embalar AGORA: conferidas − já embaladas. */
export const aEmbalar = (p: PecaDaEmbalagem) => Math.max(0, conferidasParaEmbalar(p) - embaladaDe(p));

/** Tudo embalado (é o que faz a peça virar `packed`). */
export const todaEmbalada = (p: PecaDaEmbalagem) => quantidadeDe(p) > 0 && embaladaDe(p) >= quantidadeDe(p);

/** O que quebra a conta protegida — vazio quando está tudo certo. */
export function violacoesDaConta(p: PecaDaEmbalagem): string[] {
  const erros: string[] = [];
  const q = quantidadeDe(p), conf = conferidasParaEmbalar(p), emb = embaladaDe(p), ent = entregueDe(p);
  const feitas = p.isReuse && n(p.reuseQty) === 0 ? q : n(p.quantityProduced) + n(p.reuseQty);
  if (ent > emb) erros.push(`entregues (${ent}) > embaladas (${emb})`);
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
  const disponivel = aEmbalar(p);
  if (disponivel <= 0) {
    return { ok: false, motivo: embaladaDe(p) > 0 ? `já está toda embalada (${embaladaDe(p)} de ${quantidadeDe(p)})` : "ainda não tem unidade conferida para embalar" };
  }
  const quer = pedida === undefined || pedida === null ? disponivel : Math.trunc(Number(pedida));
  if (!Number.isFinite(quer) || quer < 1) return { ok: false, motivo: "a quantidade a embalar tem de ser pelo menos 1" };
  if (quer > disponivel) return { ok: false, motivo: `só há ${disponivel} conferida(s) sem embalar (pediu ${quer})` };
  const total = embaladaDe(p) + quer;
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

/** "7 de 10 embaladas" enquanto a peça está dividida no tempo; vazio quando não ajuda. */
export function progressoDaEmbalagem(p: PecaDaEmbalagem): string {
  const emb = embaladaDe(p), q = quantidadeDe(p);
  return emb > 0 && emb < q ? `${emb} de ${q} embaladas` : "";
}

/** "(7 de 10)" ao lado da linha do volume quando a peça NÃO está inteira nele. */
export function parteDoTotal(quantidadeNoVolume: number, quantidadeDaPeca: number): string {
  return n(quantidadeNoVolume) < n(quantidadeDaPeca) ? `(${n(quantidadeNoVolume)} de ${n(quantidadeDaPeca)})` : "";
}
