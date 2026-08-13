// ─────────────────────────────────────────────────────────────────────────────
// FONTE ÚNICA DA ARITMÉTICA DE SALDO DA PEÇA (quantidades e m²).
//
// Por que este arquivo existe: os mesmos onze cálculos (quanto falta produzir,
// conferir, entregar, reaproveitar; quanto de m² realmente vai para a
// impressora) viviam duplicados como consts locais no topo de grafica.tsx e
// eram recalculados "na mão", com pequenas variações, na ficha da peça e nos
// modais. Toda vez que uma regra mudou (reuso parcial, conferência parcial,
// entrega parcial) uma das cópias ficou para trás — e um número errado aqui
// não é cosmético: é peça a mais ou a menos saindo da impressora.
//
// Mesmo princípio de lib/status.ts: nada de aritmética de saldo espalhada.
// Quem precisa de um número chama daqui.
//
// Todas as funções são PURAS, tolerantes a null/undefined e nunca lançam —
// elas recebem itens vindos da API, onde qualquer coluna pode chegar nula
// (acervo antigo) e onde os status circulam em duas grafias (canônica em
// inglês e legado em português).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Forma mínima de item que a aritmética de saldo enxerga. Todos os campos são
 * opcionais de propósito: as telas passam o item cru da API (tipado como any)
 * e o acervo antigo tem colunas nulas. Assim `any` continua atribuível e
 * nenhuma chamada existente precisa de cast.
 */
export interface SaldoItem {
  status?: string | null;
  quantity?: number | string | null;
  quantityProduced?: number | string | null;
  reuseQty?: number | string | null;
  isReuse?: boolean | null;
  conferredQty?: number | string | null;
  deliveredQty?: number | string | null;
  calculatedM2?: number | string | null;
  /** Complemento: id da peça-mãe. NULL/ausente = peça normal. */
  parentItemId?: string | null;
  /** Complementos vivos desta peça (anexado pelo enrich do servidor). */
  complements?: Array<{ quantity?: number | string | null }> | null;
  [key: string]: unknown;
}

/** Converte qualquer coisa que a API devolva num inteiro seguro (>= 0 não é imposto). */
const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

// ── Predicados de status ────────────────────────────────────────────────────
// Os status circulam em duas grafias: a canônica (inglês, gravada pelo fluxo
// atual) e o legado em português, ainda presente no banco. Comparar só com uma
// delas faz o gate nunca disparar — foi assim que peças entregues continuaram
// oferecendo o botão "Conferir".

export const isDelivered = (item: SaldoItem): boolean =>
  item?.status === "delivered" || item?.status === "entregue";
export const isConferred = (item: SaldoItem): boolean => item?.status === "conferred";
export const isProduced = (item: SaldoItem): boolean =>
  item?.status === "produced" || item?.status === "produzido";
export const isInProd = (item: SaldoItem): boolean =>
  item?.status === "inProduction" || item?.status === "em_producao";

// ── Quantidades brutas ──────────────────────────────────────────────────────

export const qtyOf = (item: SaldoItem): number => n(item?.quantity);
export const producedOf = (item: SaldoItem): number => n(item?.quantityProduced);
export const conferredOf = (item: SaldoItem): number => n(item?.conferredQty);
export const deliveredOf = (item: SaldoItem): number => n(item?.deliveredQty);
export const reusedOf = (item: SaldoItem): number => n(item?.reuseQty);

/**
 * Peças marcadas como reuso ANTES de reuse_qty existir têm reuseQty = 0 e nunca
 * passaram por conferência — a regra antiga as mandava direto para a entrega.
 * Continuam nessa regra para não travar entregas em andamento; as novas seguem
 * pela conferência.
 */
export const isLegacyReuse = (item: SaldoItem): boolean =>
  !!item?.isReuse && reusedOf(item) === 0;

/** Reuso total antigo não preencheu reuseQty, mas cobre a peça inteira. */
export const reusedTotalOf = (item: SaldoItem): number =>
  item?.isReuse ? qtyOf(item) : reusedOf(item);

// ── Saldos (o que ainda falta fazer) ────────────────────────────────────────

/** Unidades que ainda precisam ir para a impressora (o reaproveitado não vai). */
export const remainingProduce = (item: SaldoItem): number =>
  Math.max(0, qtyOf(item) - reusedTotalOf(item) - producedOf(item));

export const remainingConfer = (item: SaldoItem): number =>
  Math.max(0, qtyOf(item) - conferredOf(item));

/** Reaproveitado também confere, então a entrega sempre sai do que foi conferido. */
export const remainingDeliver = (item: SaldoItem): number =>
  Math.max(0, (isLegacyReuse(item) ? qtyOf(item) : conferredOf(item)) - deliveredOf(item));

/** Sobra para reaproveitar: o que não foi reaproveitado nem produzido ainda. */
export const remainingReuse = (item: SaldoItem): number =>
  Math.max(0, qtyOf(item) - reusedOf(item) - producedOf(item));

// ── Metragem ────────────────────────────────────────────────────────────────

/** m² total contratado da peça (o que está gravado na coluna). */
export const m2Of = (item: SaldoItem): number => n(item?.calculatedM2);

/**
 * Metragem que de fato vai para a impressora: o reaproveitado não é impresso.
 * Rateia o m² total pela fração de unidades que ainda serão produzidas.
 */
export const m2ToProduce = (item: SaldoItem): number => {
  const total = m2Of(item);
  const qty = qtyOf(item);
  if (!total || !qty) return total;
  const toPrint = qty - reusedTotalOf(item);
  return toPrint <= 0 ? 0 : (total / qty) * toPrint;
};

// ── Gates de ação (espelham os tetos que o SERVIDOR valida) ─────────────────
// Estes predicados só decidem se o botão aparece. O teto de verdade está nas
// rotas (confer/deliver/start-production); aqui é para não convidar o operador
// a uma ação que o servidor vai recusar.

export const canProduce = (item: SaldoItem): boolean =>
  !isDelivered(item) && !isConferred(item) && remainingProduce(item) > 0;

export const canConfer = (item: SaldoItem): boolean =>
  !isDelivered(item) && !isLegacyReuse(item) && isProduced(item) && remainingConfer(item) > 0;

export const canDeliver = (item: SaldoItem): boolean =>
  !isDelivered(item) && remainingDeliver(item) > 0;

// ── Complemento ─────────────────────────────────────────────────────────────

/** Esta peça é um complemento (nasceu de um aumento pós-produção)? */
export const isComplement = (item: SaldoItem): boolean => !!item?.parentItemId;

/** Soma das unidades dos complementos vivos desta peça-mãe (0 se não houver). */
export const complementsQtyOf = (item: SaldoItem): number =>
  (item?.complements ?? []).reduce((acc, c) => acc + n(c?.quantity), 0);

/**
 * Total realmente contratado da peça: a quantidade original MAIS os
 * complementos. A peça-mãe nunca é alterada, então este número só existe
 * derivado — nunca gravar contador denormalizado.
 */
export const contractedTotalOf = (item: SaldoItem): number =>
  qtyOf(item) + complementsQtyOf(item);

/**
 * PISO FÍSICO de uma redução de quantidade: não dá para reduzir abaixo do que
 * já existe no mundo real. Espelha byte a byte a validação do servidor em
 * PATCH /api/items/:id — a UI usa isto para o `min` do campo e para explicar
 * antes de o 409 chegar.
 */
export const reductionFloorOf = (item: SaldoItem): number =>
  Math.max(
    producedOf(item) + reusedOf(item),
    conferredOf(item),
    deliveredOf(item),
  );

// ── Agregador ───────────────────────────────────────────────────────────────

/** Todos os números de uma peça de uma vez — evita recalcular helper a helper. */
export interface Saldo {
  /** Quantidade contratada nesta linha (a peça-mãe NÃO soma os complementos aqui). */
  qty: number;
  produced: number;
  /** reuseQty cru (0 no reuso legado). */
  reused: number;
  /** Reuso efetivo: o legado total conta como a peça inteira. */
  reusedTotal: number;
  conferred: number;
  delivered: number;
  /** Quanto ainda vai para a impressora. */
  toProduce: number;
  toConfer: number;
  toDeliver: number;
  toReuse: number;
  /** m² gravado na peça. */
  m2: number;
  /** m² que de fato será impresso (desconta o reaproveitado). */
  m2ToProduce: number;
  /** Piso de uma redução de quantidade (ver reductionFloorOf). */
  reductionFloor: number;
  isLegacyReuse: boolean;
  isDelivered: boolean;
  isConferred: boolean;
  isProduced: boolean;
  isInProd: boolean;
  canProduce: boolean;
  canConfer: boolean;
  canDeliver: boolean;
  /** Esta peça é um complemento. */
  isComplement: boolean;
  /** Soma dos complementos vivos (só faz sentido na mãe). */
  complementsQty: number;
  /** qty + complementsQty. */
  contractedTotal: number;
}

export function getSaldo(item: SaldoItem): Saldo {
  const qty = qtyOf(item);
  const produced = producedOf(item);
  const reused = reusedOf(item);
  const reusedTotal = reusedTotalOf(item);
  const conferred = conferredOf(item);
  const delivered = deliveredOf(item);
  const complementsQty = complementsQtyOf(item);
  return {
    qty,
    produced,
    reused,
    reusedTotal,
    conferred,
    delivered,
    toProduce: remainingProduce(item),
    toConfer: remainingConfer(item),
    toDeliver: remainingDeliver(item),
    toReuse: remainingReuse(item),
    m2: m2Of(item),
    m2ToProduce: m2ToProduce(item),
    reductionFloor: reductionFloorOf(item),
    isLegacyReuse: isLegacyReuse(item),
    isDelivered: isDelivered(item),
    isConferred: isConferred(item),
    isProduced: isProduced(item),
    isInProd: isInProd(item),
    canProduce: canProduce(item),
    canConfer: canConfer(item),
    canDeliver: canDeliver(item),
    isComplement: isComplement(item),
    complementsQty,
    contractedTotal: qty + complementsQty,
  };
}
