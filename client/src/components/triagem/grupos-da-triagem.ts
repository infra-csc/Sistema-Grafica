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
  | { tipo: "triagem"; ativoId: string; chave: string; metodo: "PATCH"; url: string; corpo: Record<string, unknown> }
  | { tipo: "divisao"; ativoId: string; chave: string; metodo: "POST"; url: string; corpo: { splits: Record<string, unknown>[] } };

export type PlanoDeGravacao = {
  passos: PassoDeGravacao[];
  /** Ativo ×N que ficou só PARCIALMENTE distribuído. O triage-split exige que
   *  a soma feche a quantidade do ativo (o servidor não deixa um pedaço
   *  "aguardando triagem"), então este ativo não entra no plano. */
  incompletos: { ativoId: string; displayId: string; quantidade: number; faltam: number }[];
};

/**
 * Traduz "20 Galpão · 3 Manutenção · 1 Descartar" em chamadas. Os ativos são
 * consumidos NA ORDEM do código: os primeiros vão para o Galpão, os seguintes
 * para a Manutenção, os últimos para Descartar; o que sobra sem destino fica
 * como está, aguardando triagem.
 */
export function planoDeGravacao(grupo: GrupoDaTriagem, d: Distribuicao, condicaoNoGalpao: CondicaoNoGalpao): PlanoDeGravacao {
  const falta: Distribuicao = { ...d };
  const passos: PassoDeGravacao[] = [];
  const incompletos: PlanoDeGravacao["incompletos"] = [];

  for (const ativo of grupo.ativos) {
    let sobra = ativo.quantity ?? 1;
    const partes: { destino: DestinoFinal; qtd: number }[] = [];
    for (const destino of DESTINOS_FINAIS) {
      if (sobra === 0) break;
      const qtd = Math.min(sobra, falta[destino]);
      if (qtd > 0) { partes.push({ destino, qtd }); falta[destino] -= qtd; sobra -= qtd; }
    }
    if (partes.length === 0) continue;
    if (sobra > 0) {
      // Devolve o que este ativo tinha consumido: nada dele é gravado.
      for (const p of partes) falta[p.destino] += p.qtd;
      incompletos.push({ ativoId: ativo.id, displayId: ativo.displayId, quantidade: ativo.quantity ?? 1, faltam: sobra });
      continue;
    }
    if (partes.length === 1) {
      const { destino } = partes[0];
      const corpo: Record<string, unknown> = { condition: condicaoDe(destino, condicaoNoGalpao), trackingStatus: STATUS[destino] };
      passos.push({ tipo: "triagem", ativoId: ativo.id, chave: grupo.chave, metodo: "PATCH", url: `/api/inventory/${ativo.id}/triage`, corpo });
    } else {
      passos.push({
        tipo: "divisao", ativoId: ativo.id, chave: grupo.chave, metodo: "POST", url: `/api/inventory/${ativo.id}/triage-split`,
        corpo: { splits: partes.map((p) => ({ qty: p.qtd, condition: condicaoDe(p.destino, condicaoNoGalpao), trackingStatus: STATUS[p.destino] })) },
      });
    }
  }
  return { passos, incompletos };
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
