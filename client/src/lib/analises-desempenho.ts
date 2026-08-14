// Desempenho de ciclos JÁ FECHADOS: os 4 KPIs comparáveis e a tabela de
// ofensores. Regra pura, sem React e sem I/O.
//
// PORQUÊ estas quatro métricas e não as cinco antigas ("total de peças",
// "eventos cadastrados", "em produção", "taxa de entrega", "aprovadas ou
// além"): nenhuma daquelas muda uma decisão. Contagem de estoque por status é
// foto do agora, e o agora é território do Painel Geral e da Gestão de Prazos.
// As quatro daqui são RAZÕES com denominador estável, medidas contra um
// compromisso (a saída do caminhão) e comparáveis com o período anterior —
// é isso que separa "estamos piorando" de "o número é feio".
//
// REGRA DE HONESTIDADE aplicada em todo agregado: o que não pôde ser medido é
// devolvido como CONTAGEM À PARTE (`semData`, `semMedida`), nunca somado como
// zero. Um denominador que engole o desconhecido mente para baixo em silêncio.
import { DAY_MS, instantDayMs, m2Of, qtyOf } from "./analises-metrics";
import type { AnaliseItem, AnaliseSponsor } from "./analises-metrics";
import { isDelivered, isOutOfFunnel } from "./analises-status";

// ─── Retrabalho ──────────────────────────────────────────────────────────────

/**
 * A peça passou por REFAÇÃO DE ARTE?
 *
 * Dois sinais DURÁVEIS e dois TRANSITÓRIOS, e a diferença importa:
 *
 *  - `previousFinalFileUrl` e `previousApprovalThumbUrl` são gravados quando a
 *    Arte SUBSTITUI um arquivo final ou um layout já enviado
 *    (`routes/items.ts` — troca de arte e troca de thumb). Nunca são limpos:
 *    valem para ciclos fechados, que é o recorte desta tela.
 *  - `rejectedBySponsor`/`rejectedByCreator` são LIMPOS quando a peça reanda
 *    (aprovação do patrocinador, reenvio da Arte). Sozinhos, subnotificam o
 *    passado; entram porque pegam a reprovação que ainda está em aberto.
 *
 * Consequência declarada na tela: isto é PISO, não total. Retrabalho anterior
 * à substituição de arquivo — e reprovação já resolvida sem troca de arte —
 * só existe em `audit_logs`, que o cliente não lê.
 */
export function temRefacao(i: AnaliseItem): boolean {
  return !!(
    i.previousFinalFileUrl ||
    i.previousApprovalThumbUrl ||
    i.rejectedBySponsor ||
    i.rejectedByCreator
  );
}

/** Peça-filha de complemento: quantidade extra impressa DEPOIS da produção. */
export function ehComplemento(i: AnaliseItem): boolean {
  return i.complementSeq != null;
}

// ─── Resumo de desempenho ────────────────────────────────────────────────────

export interface DesempenhoResumo {
  /** Σ quantidade das peças DENTRO do funil (canceladas/excluídas fora). */
  pecasTotal: number;
  /** Peças entregues com data de entrega E saída do caminhão válidas. */
  prazoAvaliadas: number;
  prazoNoPrazo: number;
  /** Entregues sem `deliveredAt` (entrega parcial/legado): fora da conta. */
  prazoSemData: number;
  /** `null` quando não há nenhuma entrega avaliável — não é 0%. */
  prazoRate: number | null;

  /** Mediana de dias entre criação e entrega. `null` = sem amostra. */
  cicloMedianaDias: number | null;
  /** Quantos ITENS (linhas) entraram na mediana. */
  cicloAmostra: number;

  retrabalhoPecas: number;
  retrabalhoRate: number | null;
  complementoPecas: number;

  m2Entregue: number;
  /** Itens entregues sem medida de arquivo: não somam m² e são declarados. */
  m2SemMedida: number;
}

const VAZIO: DesempenhoResumo = {
  pecasTotal: 0, prazoAvaliadas: 0, prazoNoPrazo: 0, prazoSemData: 0, prazoRate: null,
  cicloMedianaDias: null, cicloAmostra: 0,
  retrabalhoPecas: 0, retrabalhoRate: null, complementoPecas: 0,
  m2Entregue: 0, m2SemMedida: 0,
};

/** Mediana (interpolada nos pares) — resistente à peça esquecida no sistema. */
export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

/**
 * Os 4 KPIs sobre um recorte já filtrado. UMA passada.
 *
 * `cycleDayByEvent` traz a saída do caminhão de cada evento — é a referência
 * de prazo. Sem ela, "taxa de entrega" volta a ser a tautologia que o badge
 * CRÍTICO antigo produzia: peça de evento futuro conta como falha.
 */
export function computeDesempenho(
  items: AnaliseItem[],
  cycleDayByEvent: Map<string, number | null>,
): DesempenhoResumo {
  if (items.length === 0) return { ...VAZIO };
  const r: DesempenhoResumo = { ...VAZIO };
  const ciclos: number[] = [];

  for (const i of items) {
    if (isOutOfFunnel(i.status)) continue;
    const q = qtyOf(i);
    r.pecasTotal += q;

    if (temRefacao(i)) r.retrabalhoPecas += q;
    if (ehComplemento(i)) r.complementoPecas += q;

    if (!isDelivered(i.status)) continue;

    const entregaDia = instantDayMs(i.deliveredAt);
    const saidaDia = cycleDayByEvent.get(i.eventId) ?? null;
    if (entregaDia == null || saidaDia == null) {
      r.prazoSemData += q;
    } else {
      r.prazoAvaliadas += q;
      // `<=`: entregar NO dia da saída é no prazo — o caminhão carrega naquele
      // dia, não na véspera.
      if (entregaDia <= saidaDia) r.prazoNoPrazo += q;
    }

    const criadoDia = instantDayMs(i.createdAt);
    if (entregaDia != null && criadoDia != null && entregaDia >= criadoDia) {
      ciclos.push((entregaDia - criadoDia) / DAY_MS);
    }

    const m2 = m2Of(i);
    if (m2 == null) r.m2SemMedida += q;
    else r.m2Entregue += m2;
  }

  r.prazoRate = r.prazoAvaliadas > 0 ? (r.prazoNoPrazo / r.prazoAvaliadas) * 100 : null;
  r.retrabalhoRate = r.pecasTotal > 0 ? (r.retrabalhoPecas / r.pecasTotal) * 100 : null;
  r.cicloMedianaDias = mediana(ciclos);
  r.cicloAmostra = ciclos.length;
  return r;
}

// ─── Variação contra o período anterior ──────────────────────────────────────

export interface Variacao {
  /** Diferença absoluta na unidade do KPI (pontos percentuais, dias ou m²). */
  delta: number;
  direcao: "subiu" | "desceu";
  /** `true` = a mudança é boa para o negócio; leva a cor e o ícone. */
  positiva: boolean;
}

/**
 * Compara dois valores de KPI. Devolve `null` quando falta um dos lados — a
 * tela precisa dizer "sem período anterior" em vez de desenhar "0%", que é
 * lido como "não mudou nada".
 *
 * `subirEhBom` é obrigatório de propósito: a mesma seta para cima é ótima em
 * "entregas no prazo" e péssima em "retrabalho", e a tela tem os dois lado a
 * lado. Deixar isso implícito é como o badge CRÍTICO nasceu.
 */
export function variacao(
  atual: number | null | undefined,
  anterior: number | null | undefined,
  subirEhBom: boolean,
): Variacao | null {
  if (atual == null || anterior == null) return null;
  const delta = atual - anterior;
  if (delta === 0) return null;
  const subiu = delta > 0;
  return { delta, direcao: subiu ? "subiu" : "desceu", positiva: subiu === subirEhBom };
}

// ─── Ofensores ───────────────────────────────────────────────────────────────

export type OfensorDim = "evento" | "tipo" | "patrocinador";

export interface OfensorRow {
  /** Chave de recorte para a tela vizinha (id do evento/patrocinador, ou tipo). */
  chave: string;
  label: string;
  pecas: number;
  m2: number;
  foraPrazo: number;
  prazoAvaliadas: number;
  prazoRate: number | null;
  retrabalhoPecas: number;
  retrabalhoRate: number | null;
  cicloMedianaDias: number | null;
  /** Peças do recorte ainda não entregues — o que venceu e não saiu. */
  emAberto: number;
}

export type OfensorOrdem = "atraso" | "retrabalho" | "ciclo" | "volume";

interface Acc {
  chave: string; label: string;
  pecas: number; m2: number;
  foraPrazo: number; prazoAvaliadas: number;
  retrabalhoPecas: number; emAberto: number;
  ciclos: number[];
}

/**
 * Agrupa o recorte pela dimensão escolhida.
 *
 * PORQUÊ uma tabela com dimensão trocável no lugar de três blocos: "Eficiência
 * por Categoria", "Top Patrocinadores" e metade da Central Operacional eram
 * três recortes do mesmo dado, dois deles sem prazo no denominador (qualquer
 * evento futuro virava CRÍTICO) e um lendo um campo inexistente. As colunas
 * aqui são as mesmas dos KPIs do topo, então a linha explica o total.
 *
 * ATENÇÃO na dimensão `patrocinador`: uma peça com 3 patrocinadores conta nas 3
 * linhas. A soma da coluna é MAIOR que o total da tela, de propósito — e a
 * tela declara isso, porque um rodapé que não bate com o topo destrói a
 * confiança no painel inteiro.
 */
export function computeOfensores(
  items: AnaliseItem[],
  dim: OfensorDim,
  ctx: {
    cycleDayByEvent: Map<string, number | null>;
    eventNameById: Map<string, string>;
    sponsors: AnaliseSponsor[];
  },
): OfensorRow[] {
  const nomeSponsor = new Map(ctx.sponsors.map((s) => [s.id, s.name]));
  const acc = new Map<string, Acc>();

  const alvo = (chave: string, label: string): Acc => {
    let a = acc.get(chave);
    if (!a) {
      a = { chave, label, pecas: 0, m2: 0, foraPrazo: 0, prazoAvaliadas: 0, retrabalhoPecas: 0, emAberto: 0, ciclos: [] };
      acc.set(chave, a);
    }
    return a;
  };

  for (const i of items) {
    if (isOutOfFunnel(i.status)) continue;

    const grupos: Acc[] = [];
    if (dim === "evento") {
      grupos.push(alvo(i.eventId, ctx.eventNameById.get(i.eventId) ?? "Evento removido"));
    } else if (dim === "tipo") {
      // `items.type` é texto livre (o formulário permite tipo customizado):
      // "Banner", "banner" e "Banner " são a mesma coisa para quem lê.
      const bruto = (i.type || "").trim();
      grupos.push(alvo(bruto.toLowerCase() || "__sem_tipo__", bruto || "Sem tipo"));
    } else {
      for (const s of i.sponsors || []) {
        if (s?.id) grupos.push(alvo(s.id, nomeSponsor.get(s.id) ?? s.name ?? "Sem nome"));
      }
      if (grupos.length === 0) grupos.push(alvo("__sem_patrocinador__", "Sem patrocinador"));
    }
    if (grupos.length === 0) continue;

    const q = qtyOf(i);
    const m2 = m2Of(i) ?? 0;
    const refez = temRefacao(i);
    const entregue = isDelivered(i.status);
    const entregaDia = entregue ? instantDayMs(i.deliveredAt) : null;
    const saidaDia = ctx.cycleDayByEvent.get(i.eventId) ?? null;
    const criadoDia = instantDayMs(i.createdAt);
    const avaliavel = entregaDia != null && saidaDia != null;
    const atrasou = avaliavel && entregaDia! > saidaDia!;
    const ciclo = entregaDia != null && criadoDia != null && entregaDia >= criadoDia
      ? (entregaDia - criadoDia) / DAY_MS
      : null;

    for (const a of grupos) {
      a.pecas += q;
      a.m2 += m2;
      if (refez) a.retrabalhoPecas += q;
      if (!entregue) a.emAberto += q;
      if (avaliavel) {
        a.prazoAvaliadas += q;
        if (atrasou) a.foraPrazo += q;
      }
      if (ciclo != null) a.ciclos.push(ciclo);
    }
  }

  return Array.from(acc.values()).map((a) => ({
    chave: a.chave,
    label: a.label,
    pecas: a.pecas,
    m2: a.m2,
    foraPrazo: a.foraPrazo,
    prazoAvaliadas: a.prazoAvaliadas,
    prazoRate: a.prazoAvaliadas > 0 ? ((a.prazoAvaliadas - a.foraPrazo) / a.prazoAvaliadas) * 100 : null,
    retrabalhoPecas: a.retrabalhoPecas,
    retrabalhoRate: a.pecas > 0 ? (a.retrabalhoPecas / a.pecas) * 100 : null,
    cicloMedianaDias: mediana(a.ciclos),
    emAberto: a.emAberto,
  }));
}

/**
 * Ordena por dor, não por volume.
 *
 * O critério padrão é `atraso` em PEÇAS (absoluto) e não em percentual: uma
 * linha com 1 de 1 fora do prazo marca 100% e não é o problema da casa. O
 * percentual fica visível na coluna para quem quiser o outro julgamento.
 * Linhas sem denominador vão para o fim — "—" no topo do ranking seria ruído.
 */
export function ordenarOfensores(rows: OfensorRow[], ordem: OfensorOrdem): OfensorRow[] {
  const semDado = (v: number | null) => v == null;
  const cmp: Record<OfensorOrdem, (a: OfensorRow, b: OfensorRow) => number> = {
    atraso: (a, b) => b.foraPrazo - a.foraPrazo || b.pecas - a.pecas,
    retrabalho: (a, b) => b.retrabalhoPecas - a.retrabalhoPecas || b.pecas - a.pecas,
    ciclo: (a, b) => {
      if (semDado(a.cicloMedianaDias) !== semDado(b.cicloMedianaDias)) return semDado(a.cicloMedianaDias) ? 1 : -1;
      return (b.cicloMedianaDias ?? 0) - (a.cicloMedianaDias ?? 0) || b.pecas - a.pecas;
    },
    volume: (a, b) => b.m2 - a.m2 || b.pecas - a.pecas,
  };
  return [...rows].sort(cmp[ordem]);
}

/** Destino do clique na linha — o ciclo ver→investigar tinha ponta solta. */
export function rotaDoOfensor(dim: OfensorDim, chave: string, label: string): string | null {
  if (chave.startsWith("__")) return null;
  if (dim === "evento") return `/eventos/${chave}`;
  // O Painel Geral lê os filtros da URL em CSV (`tipo`, `patrocinador`) — o
  // tipo viaja pelo RÓTULO porque é ele que está gravado em `items.type`.
  if (dim === "tipo") return `/?tipo=${encodeURIComponent(label)}`;
  return `/?patrocinador=${encodeURIComponent(chave)}`;
}
