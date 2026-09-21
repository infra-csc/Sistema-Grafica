// ─────────────────────────────────────────────────────────────────────────────
// IMPRESSÃO DIVIDIDA ENTRE IMPRESSORAS (dono, 21/09: "ao mover, poder
// selecionar tudo ou quantidades").
//
// Uma peça de 10 un. pode ter 3 na Impressora 1 e 2 na Impressora 2 ao mesmo
// tempo. O dado mora em items.impressao_por_maquina (jsonb):
//
//     { "1": { "atrib": 3, "impressas": 1 }, "2": { "atrib": 2, "impressas": 0 } }
//
//   · atrib     = unidades ATRIBUÍDAS àquela impressora (a imprimir ou já
//                 impressas nela); a soma nunca passa do que há para imprimir.
//   · impressas = quantas dessas já saíram dela.
//
// NULL = peça não dividida: tudo na `printMachine`, como sempre foi.
// `printMachine` continua sendo a impressora PRINCIPAL (a que mais tem por
// imprimir; empate = a que recebeu por último) para que tudo o que já lê esse
// campo siga correto. `quantityProduced` continua sendo o TOTAL da peça e é
// sempre a soma das `impressas` quando há divisão.
//
// Tudo aqui é puro: o servidor (start-printing / start-production), a aba
// Máquinas, a fila da Gráfica e o modal leem destas funções.
// ─────────────────────────────────────────────────────────────────────────────
import { MAQUINAS_DE_IMPRESSAO, rotuloDaMaquina } from "./fluxo-peca";

export type ParteDaMaquina = { atrib: number; impressas: number };
export type PartesPorMaquina = Record<string, ParteDaMaquina>;

/** O mínimo da peça que estas funções leem. */
export type PecaDividivel = {
  printMachine?: string | null;
  impressaoPorMaquina?: unknown;
  quantity?: number | string | null;
  reuseQty?: number | string | null;
  isReuse?: boolean | null;
  quantityProduced?: number | string | null;
};

const inteiro = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/** Quanto há para imprimir (quantidade − reaproveitadas). */
export function aImprimirDaPeca(p: PecaDividivel): number {
  const qtd = inteiro(p.quantity);
  const reuso = p.isReuse ? qtd : inteiro(p.reuseQty);
  return Math.max(0, qtd - reuso);
}

/** Lê o jsonb com tolerância: só máquinas válidas, só números inteiros ≥ 0. */
export function lerPartes(bruto: unknown): PartesPorMaquina | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const partes: PartesPorMaquina = {};
  for (const [m, v] of Object.entries(bruto as Record<string, any>)) {
    if (!MAQUINAS_DE_IMPRESSAO.includes(m) || !v || typeof v !== "object") continue;
    const atrib = inteiro(v.atrib);
    const impressas = Math.min(atrib, inteiro(v.impressas));
    if (atrib > 0 || impressas > 0) partes[m] = { atrib, impressas };
  }
  return Object.keys(partes).length ? partes : null;
}

/** A peça está dividida entre mais de uma impressora? */
export function estaDividida(p: PecaDividivel): boolean {
  const partes = lerPartes(p.impressaoPorMaquina);
  return !!partes && Object.keys(partes).length > 1;
}

/**
 * As partes reais da peça: o jsonb quando existe, senão tudo na printMachine
 * (a forma "não dividida"). Sem printMachine, não há partes.
 */
export function partesDaPeca(p: PecaDividivel): PartesPorMaquina {
  const lidas = lerPartes(p.impressaoPorMaquina);
  if (lidas) return lidas;
  if (!p.printMachine) return {};
  return { [p.printMachine]: { atrib: aImprimirDaPeca(p), impressas: inteiro(p.quantityProduced) } };
}

/** A parte de UMA impressora (zeros quando ela não tem nada da peça). */
export function parteDaMaquina(p: PecaDividivel, maquina: string): ParteDaMaquina {
  return partesDaPeca(p)[maquina] ?? { atrib: 0, impressas: 0 };
}

/** Quantas ainda estão POR IMPRIMIR naquela impressora. */
export const restanteNaMaquina = (parte: ParteDaMaquina): number => Math.max(0, parte.atrib - parte.impressas);

/** A impressora principal: a que mais tem por imprimir; empate = `preferida`. */
export function maquinaPrincipal(partes: PartesPorMaquina, preferida?: string | null): string | null {
  let melhor: string | null = null;
  let maior = -1;
  for (const [m, parte] of Object.entries(partes)) {
    const r = restanteNaMaquina(parte);
    if (r > maior || (r === maior && m === preferida)) { maior = r; melhor = m; }
  }
  return melhor;
}

/** Soma das impressas — é o `quantityProduced` da peça quando dividida. */
export const totalImpressas = (partes: PartesPorMaquina): number =>
  Object.values(partes).reduce((s, x) => s + x.impressas, 0);

/**
 * Move `quantidade` unidades por imprimir de `origem` para `destino`
 * (`quantidade` ausente ou ≥ restante = tudo o que resta na origem). Devolve
 * as partes novas, quantas foram movidas e quantas ficaram na origem — ou o
 * erro em palavras. Puro: não decide printMachine nem grava nada.
 */
export function moverParte(
  partes: PartesPorMaquina, origem: string, destino: string, quantidade?: number | null,
): { ok: true; partes: PartesPorMaquina; movidas: number; ficam: number } | { ok: false; erro: string } {
  if (origem === destino) return { ok: false, erro: `A peça já está na ${rotuloDaMaquina(destino)}` };
  const de = partes[origem];
  const restante = de ? restanteNaMaquina(de) : 0;
  if (restante <= 0) return { ok: false, erro: `Não há nada por imprimir na ${rotuloDaMaquina(origem)} para mover` };
  const pedido = quantidade == null ? restante : inteiro(quantidade);
  if (pedido <= 0) return { ok: false, erro: "Informe quantas unidades vão para a outra impressora" };
  if (pedido > restante) return { ok: false, erro: `Só há ${restante} un. por imprimir na ${rotuloDaMaquina(origem)} — não dá para mover ${pedido}` };

  const novas: PartesPorMaquina = {};
  for (const [m, x] of Object.entries(partes)) novas[m] = { ...x };
  novas[origem] = { atrib: de.atrib - pedido, impressas: de.impressas };
  // Origem sem nada atribuído nem impresso some da divisão.
  if (novas[origem].atrib === 0 && novas[origem].impressas === 0) delete novas[origem];
  const para = novas[destino] ?? { atrib: 0, impressas: 0 };
  novas[destino] = { atrib: para.atrib + pedido, impressas: para.impressas };
  return { ok: true, partes: novas, movidas: pedido, ficam: restante - pedido };
}

/**
 * O que gravar no jsonb: NULL quando a peça não está dividida (uma só
 * impressora com tudo) — assim quem nunca leu a coluna continua certo.
 */
export function normalizarPartes(partes: PartesPorMaquina, aImprimir: number): PartesPorMaquina | null {
  const chaves = Object.keys(partes);
  if (chaves.length === 0) return null;
  if (chaves.length === 1 && partes[chaves[0]].atrib >= aImprimir) return null;
  return partes;
}

/** Partes que ainda têm algo POR IMPRIMIR — as zeradas ficam só como histórico. */
export function partesAtivas(partes: PartesPorMaquina): PartesPorMaquina {
  const ativas: PartesPorMaquina = {};
  for (const [m, x] of Object.entries(partes)) if (restanteNaMaquina(x) > 0) ativas[m] = x;
  return ativas;
}

/**
 * Quando `aImprimir` muda por fora (edição de quantidade, reaproveitamento,
 * correção de reaproveitamento), a soma dos `atrib` tem de acompanhar:
 * encolhe/estica o `atrib` da impressora principal (a com mais por imprimir),
 * nunca abaixo do que ela já imprimiu; se ainda sobrar, tira das outras.
 * Devolve NULL quando a divisão deixa de existir (uma chave só, ou teto 0).
 */
export function reescalarPartes(partes: PartesPorMaquina | null | undefined, aImprimir: number): PartesPorMaquina | null {
  if (!partes || Object.keys(partes).length === 0) return null;
  const alvo = Math.max(0, Math.floor(aImprimir));
  const novas: PartesPorMaquina = {};
  for (const [m, x] of Object.entries(partes)) novas[m] = { ...x };
  let soma = Object.values(novas).reduce((s, x) => s + x.atrib, 0);
  // Ordem de ajuste: a principal primeiro, depois as outras por restante.
  const ordem = Object.keys(novas).sort((a, b) => restanteNaMaquina(novas[b]) - restanteNaMaquina(novas[a]));
  if (soma > alvo) {
    for (const m of ordem) {
      if (soma <= alvo) break;
      const podeTirar = Math.min(soma - alvo, restanteNaMaquina(novas[m]));
      novas[m].atrib -= podeTirar;
      soma -= podeTirar;
    }
    // Ainda acima do teto: só impressas sobraram — o teto ficou abaixo do que
    // já saiu; encolhe as impressas junto (o handler já trata quantityProduced).
    for (const m of ordem) {
      if (soma <= alvo) break;
      const tira = Math.min(soma - alvo, novas[m].atrib);
      novas[m].atrib -= tira;
      novas[m].impressas = Math.min(novas[m].impressas, novas[m].atrib);
      soma -= tira;
    }
  }
  // Teto MAIOR que a soma não estica nenhuma parte: desde a reserva com
  // quantidade (shared/reserva-de-impressora.ts) a soma das partes pode ser
  // legitimamente menor que o teto — a diferença está reservada ou na fila geral.
  for (const m of Object.keys(novas)) if (novas[m].atrib === 0 && novas[m].impressas === 0) delete novas[m];
  return normalizarPartes(novas, alvo);
}

/** "Impressora 1 · 3 un. / Impressora 2 · 2 un." — a divisão em uma linha. */
export function resumoDaDivisao(partes: PartesPorMaquina): string {
  return Object.entries(partes)
    .map(([m, x]) => `${rotuloDaMaquina(m)} · ${x.impressas} de ${x.atrib} un.`)
    .join(" / ");
}
