// ─────────────────────────────────────────────────────────────────────────────
// TRIAGEM — ITENS POR QUANTIDADE JUNTOS (dono, 21/09).
//
// "Na triagem os itens por quantidade têm que ficar JUNTOS, e ir ajustando os
// itens pela quantidade."
//
// COMO O DADO É DE FATO: o ciclo da Gráfica cria UM ativo por unidade produzida
// (quantity = 1, displayId #EST-<peça>-<seq>, todos com o mesmo
// originalItemId). Uma peça de 24 unidades volta do evento como 24 ativos
// iguais — eram 24 cartões. Ativo com quantity > 1 só existe quando foi
// cadastrado à mão ou sobrou de uma divisão antiga.
//
// Por isso o agrupamento é de TELA: nenhum registro é fundido. O grupo soma as
// unidades, a pessoa distribui a quantidade entre os destinos e o plano de
// gravação traduz isso para as rotas que já existem:
//   · ativo inteiro num destino      → PATCH /api/inventory/:id/triage
//   · ativo ×N repartido em destinos → POST  /api/inventory/:id/triage-split
//
// Tudo aqui é PURO (sem React, sem rede) para ser testado direto.
// ─────────────────────────────────────────────────────────────────────────────
import type { EnrichedAsset } from "@/lib/inventory-meta";

export type DestinoFinal = "galpao" | "manutencao" | "descartar";
export const DESTINOS_FINAIS: DestinoFinal[] = ["galpao", "manutencao", "descartar"];
export type Distribuicao = Record<DestinoFinal, number>;
export const SEM_DISTRIBUICAO: Distribuicao = { galpao: 0, manutencao: 0, descartar: 0 };
export type CondicaoNoGalpao = "PERFEITO" | "AVARIA_LEVE";

const normalizar = (t: string | null | undefined) =>
  String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Mesmo evento + mesma peça de origem. Sem peça de origem (cadastro manual):
 *  mesmo evento + mesmo nome + mesmos patrocinadores — o ativo do acervo não
 *  guarda tipo/medida em colunas próprias; o nome é "tipo — descrição". */
export function chaveDoGrupo(a: Pick<EnrichedAsset, "eventId" | "originalItemId" | "name" | "sponsorIds">): string {
  const evento = a.eventId ?? "sem-evento";
  if (a.originalItemId) return `${evento}|item:${a.originalItemId}`;
  const patrocinadores = [...(a.sponsorIds ?? [])].sort().join(",");
  return `${evento}|nome:${normalizar(a.name)}|pat:${patrocinadores}`;
}

export type GrupoDaTriagem = {
  chave: string;
  nome: string;
  /** Os ativos individuais, na ordem do código (#EST-0412-2 antes de -10). */
  ativos: EnrichedAsset[];
  unidades: number;
  patrocinadores: string[];
  miniatura: string | null;
};

const porCodigo = new Intl.Collator("pt-BR", { numeric: true });

/** Uma passada (Map por chave). A ordem dos grupos é a da primeira aparição. */
export function agruparAtivos(ativos: EnrichedAsset[]): GrupoDaTriagem[] {
  const porChave = new Map<string, GrupoDaTriagem>();
  for (const a of ativos) {
    const chave = chaveDoGrupo(a);
    let g = porChave.get(chave);
    if (!g) {
      g = { chave, nome: a.name, ativos: [], unidades: 0, patrocinadores: (a.sponsors ?? []).map((s) => s.name), miniatura: null };
      porChave.set(chave, g);
    }
    g.ativos.push(a);
    g.unidades += a.quantity ?? 1;
    if (!g.miniatura && a.approvalThumbUrl) g.miniatura = a.approvalThumbUrl;
  }
  const grupos = Array.from(porChave.values());
  for (const g of grupos) g.ativos.sort((x, y) => porCodigo.compare(x.displayId ?? "", y.displayId ?? ""));
  return grupos;
}

// ─── Distribuição ────────────────────────────────────────────────────────────

export const distribuido = (d: Distribuicao) => d.galpao + d.manutencao + d.descartar;
export const restante = (total: number, d: Distribuicao) => Math.max(0, total - distribuido(d));

/** Muda UM destino sem deixar a soma passar do total: o campo aceita até o que
 *  sobra dos outros dois. Lixo digitado vira 0. */
export function ajustarDistribuicao(total: number, d: Distribuicao, destino: DestinoFinal, valor: number): Distribuicao {
  const outros = distribuido(d) - d[destino];
  const limpo = Number.isFinite(valor) ? Math.floor(valor) : 0;
  return { ...d, [destino]: Math.max(0, Math.min(limpo, total - outros)) };
}

export const tudoPara = (total: number, destino: DestinoFinal): Distribuicao => ({ ...SEM_DISTRIBUICAO, [destino]: total });

/** Move a quantidade de uma coluna para outra ("triar" = o que ainda resta). */
export function moverQuantidade(total: number, d: Distribuicao, de: DestinoFinal | "triar", para: DestinoFinal | "triar"): Distribuicao {
  if (de === para) return d;
  const qtd = de === "triar" ? restante(total, d) : d[de];
  const proximo = { ...d };
  if (de !== "triar") proximo[de] = 0;
  if (para !== "triar") proximo[para] += qtd;
  return proximo;
}

// ─── Plano de gravação ───────────────────────────────────────────────────────

const STATUS: Record<DestinoFinal, "NO_GALPAO" | "EM_MANUTENCAO" | "DESCARTADO"> = { galpao: "NO_GALPAO", manutencao: "EM_MANUTENCAO", descartar: "DESCARTADO" };

/** As mesmas regras do quadro desde 14/09: Manutenção grava Avaria leve,
 *  Descartar grava Sucata, Galpão leva a condição escolhida. Sem local: o
 *  dono decidiu (21/09) que o sistema não guarda ONDE a peça fica no galpão. */
const condicaoDe = (destino: DestinoFinal, noGalpao: CondicaoNoGalpao) =>
  destino === "galpao" ? noGalpao : destino === "manutencao" ? "AVARIA_LEVE" : "SUCATA";

export type PassoDeGravacao =
  | { tipo: "triagem"; ativoId: string; chave: string; metodo: "PATCH"; url: string; corpo: Record<string, unknown>; unidades: number }
  | { tipo: "divisao"; ativoId: string; chave: string; metodo: "POST"; url: string; corpo: { splits: Record<string, unknown>[] }; unidades: number };

/** A reserva de um ativo, como a tela a conhece (GET /api/estoque/reservas-ativas). */
export type ReservaDoAtivo = { eventName: string; itemDisplayId: string | null };

export type PlanoDeGravacao = {
  passos: PassoDeGravacao[];
  /** Ativo ×N que ficou só PARCIALMENTE distribuído. O triage-split exige que
   *  a soma feche a quantidade do ativo (o servidor não deixa um pedaço
   *  "aguardando triagem"). Só acontece quando NENHUMA escolha de registros
   *  fecha a conta (ex.: um único registro ×10 com 4 distribuídas). */
  incompletos: { ativoId: string; displayId: string; quantidade: number; faltam: number }[];
  /** Ativo RESERVADO que o plano mandaria (inteiro ou em parte) para fora do
   *  Galpão — o servidor recusa (409); a tela avisa antes de salvar. */
  conflitos: { ativoId: string; displayId: string; reserva: ReservaDoAtivo }[];
};

/**
 * Quais registros ficam INTOCADOS (aguardando triagem) para somar exatamente
 * `alvo` unidades — de preferência os do FIM da ordem. Com registros de 1
 * unidade (o caso normal) o guloso resolve; com registros ×N cai numa soma de
 * subconjunto (a que antes era recusada como "incompleta" sem precisar). null
 * = nenhuma combinação fecha.
 */
export function escolherIntocados(quantidades: readonly number[], alvo: number): Set<number> | null {
  const escolhidos = new Set<number>();
  let resta = alvo;
  for (let i = quantidades.length - 1; i >= 0 && resta > 0; i--) {
    if (quantidades[i] <= resta) { escolhidos.add(i); resta -= quantidades[i]; }
  }
  if (resta === 0) return escolhidos;
  // Soma de subconjunto: via[s] = índice que alcançou s primeiro (varrendo do
  // fim, para preferir os últimos). Cada registro entra uma vez só.
  const via = new Int32Array(alvo + 1).fill(-1);
  const alcancado = new Uint8Array(alvo + 1);
  alcancado[0] = 1;
  for (let i = quantidades.length - 1; i >= 0; i--) {
    const q = quantidades[i];
    for (let s = alvo; s >= q; s--) if (!alcancado[s] && alcancado[s - q]) { alcancado[s] = 1; via[s] = i; }
    if (alcancado[alvo]) break;
  }
  if (!alcancado[alvo]) return null;
  const saida = new Set<number>();
  for (let s = alvo; s > 0; s -= quantidades[via[s]]) saida.add(via[s]);
  return saida;
}

/**
 * Traduz "20 Galpão · 3 Manutenção · 1 Descartar" em chamadas.
 *
 * ORDEM: os RESERVADOS primeiro (revisão 22/09 — é o Galpão que mantém a
 * reserva verdadeira; descartar/mandar para manutenção uma peça reservada
 * deixava a peça do outro evento "coberta" por nada), depois os demais na
 * ordem do código. Os destinos se enchem na ordem Galpão → Manutenção →
 * Descartar; os registros do FIM da ordem ficam intocados, aguardando triagem.
 * Reservado que não cabe no Galpão nem entre os intocados vira `conflitos`.
 */
export function planoDeGravacao(
  grupo: GrupoDaTriagem,
  d: Distribuicao,
  condicaoNoGalpao: CondicaoNoGalpao,
  reservaDe: (ativoId: string) => ReservaDoAtivo | undefined = () => undefined,
): PlanoDeGravacao {
  const falta: Distribuicao = { ...d };
  const passos: PassoDeGravacao[] = [];
  const incompletos: PlanoDeGravacao["incompletos"] = [];
  const conflitos: PlanoDeGravacao["conflitos"] = [];

  const qtd = (a: EnrichedAsset) => Math.max(1, a.quantity ?? 1);
  // Reservados que CABEM no Galpão vão na frente; os que não cabem vão para o
  // FIM — são os primeiros a ficar intocados (aguardando, a reserva segue
  // verdadeira). Só viram conflito se nem assim sobrar lugar para eles.
  const reservados = grupo.ativos.filter((a) => reservaDe(a.id));
  const naFrente: EnrichedAsset[] = [];
  const noFim: EnrichedAsset[] = [];
  let lugarNoGalpao = d.galpao;
  for (const a of reservados) {
    if (qtd(a) <= lugarNoGalpao) { naFrente.push(a); lugarNoGalpao -= qtd(a); } else noFim.push(a);
  }
  const ordem = [...naFrente, ...grupo.ativos.filter((a) => !reservaDe(a.id)), ...noFim];
  const total = ordem.reduce((s, a) => s + qtd(a), 0);
  const semDestino = Math.max(0, total - distribuido(d));
  const intocados = escolherIntocados(ordem.map(qtd), semDestino);

  ordem.forEach((ativo, i) => {
    if (intocados?.has(i)) return;
    let sobra = qtd(ativo);
    const partes: { destino: DestinoFinal; qtd: number }[] = [];
    for (const destino of DESTINOS_FINAIS) {
      if (sobra === 0) break;
      const q = Math.min(sobra, falta[destino]);
      if (q > 0) { partes.push({ destino, qtd: q }); falta[destino] -= q; sobra -= q; }
    }
    if (partes.length === 0) return;
    if (sobra > 0) {
      // Só sem combinação possível (intocados === null): devolve o que este
      // ativo tinha consumido — nada dele é gravado.
      for (const p of partes) falta[p.destino] += p.qtd;
      incompletos.push({ ativoId: ativo.id, displayId: ativo.displayId, quantidade: qtd(ativo), faltam: sobra });
      return;
    }
    const reserva = reservaDe(ativo.id);
    if (reserva && (partes.length > 1 || partes[0].destino !== "galpao")) conflitos.push({ ativoId: ativo.id, displayId: ativo.displayId, reserva });
    if (partes.length === 1) {
      const { destino } = partes[0];
      const corpo: Record<string, unknown> = { condition: condicaoDe(destino, condicaoNoGalpao), trackingStatus: STATUS[destino] };
      passos.push({ tipo: "triagem", ativoId: ativo.id, chave: grupo.chave, metodo: "PATCH", url: `/api/inventory/${ativo.id}/triage`, corpo, unidades: qtd(ativo) });
    } else {
      passos.push({
        tipo: "divisao", ativoId: ativo.id, chave: grupo.chave, metodo: "POST", url: `/api/inventory/${ativo.id}/triage-split`,
        corpo: { splits: partes.map((p) => ({ qty: p.qtd, condition: condicaoDe(p.destino, condicaoNoGalpao), trackingStatus: STATUS[p.destino] })) },
        unidades: qtd(ativo),
      });
    }
  });
  return { passos, incompletos, conflitos };
}

/** A arrumação que volta ao quadro depois de uma gravação que FALHOU: cada
 *  passo devolve TODAS as suas unidades ao destino de onde saíram (um PATCH
 *  de registro ×N volta como N, não como 1). */
export function distribuicaoDasFalhas(falhas: readonly PassoDeGravacao[]): Record<string, Distribuicao> {
  const destinoDoStatus: Record<string, DestinoFinal> = { NO_GALPAO: "galpao", EM_MANUTENCAO: "manutencao", DESCARTADO: "descartar" };
  const resto: Record<string, Distribuicao> = {};
  for (const p of falhas) {
    const d = resto[p.chave] ?? { ...SEM_DISTRIBUICAO };
    const partes = p.tipo === "divisao"
      ? p.corpo.splits.map((s) => ({ status: String(s.trackingStatus), qtd: Number(s.qty) }))
      : [{ status: String(p.corpo.trackingStatus), qtd: p.unidades }];
    for (const parte of partes) d[destinoDoStatus[parte.status]] += parte.qtd;
    resto[p.chave] = d;
  }
  return resto;
}

/** "Descartar 1 de 24 un. de 2x1 Ministério?" — a frase da confirmação. */
export function fraseDoDescarte(itens: { nome: string; descartar: number; unidades: number }[]): string {
  const total = itens.reduce((s, i) => s + i.descartar, 0);
  if (itens.length === 1) {
    const [i] = itens;
    return i.descartar === i.unidades ? `Descartar ${i.unidades === 1 ? "" : `as ${i.unidades} un. de `}${i.nome}?` : `Descartar ${i.descartar} de ${i.unidades} un. de ${i.nome}?`;
  }
  return `Descartar ${total} un. de ${itens.length} materiais?`;
}

/** "18 salvas · 2 já tinham sido triadas · 1 com erro" — o resumo do salvar.
 *  A recusa de quem chegou depois (409) não é erro: só é contada à parte. */
export function resumoDaGravacao(salvas: number, jaTriadas: number, falhas: number): string {
  const partes = [`${salvas} ${salvas === 1 ? "salva" : "salvas"}`];
  if (jaTriadas > 0) partes.push(`${jaTriadas} já ${jaTriadas === 1 ? "tinha sido triada" : "tinham sido triadas"}`);
  if (falhas > 0) partes.push(`${falhas} com erro`);
  return partes.join(" · ");
}
