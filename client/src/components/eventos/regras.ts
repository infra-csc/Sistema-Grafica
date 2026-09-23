// Regras puras da tela de Eventos: ciclo de vida, contadores, prioridade,
// baldes de situação e ordem. Nada aqui depende de estado de tela.
import { getPriorityMeta, motivoEventoFinalizado, todayBusinessMs } from "@/lib/status";
import { FORA_DO_FUNIL } from "@/lib/fases";
import { toUTCDisplayDate } from "@/lib/utils";
import { T } from "@/lib/theme";
import type { BaldeDaSituacao, EventoDaLista, EventStats, LifecycleKey, OrdemDosEventos, PecaDoEventoNaLista, PriorityLevel } from "./tipos";

// Valor antigo do servidor/da URL → valor atual. Existe por dois caminhos
// reais: o link salvo com `?prioridade=closed_with_pending` e o cenário
// git-pull-sem-Stop/Run, em que o Express velho ainda responde o nome antigo.
// Sem isto, o primeiro vira filtro que não casa com nada e o segundo vira card
// sem selo nenhum.
export const LEGACY_LIFECYCLE: Record<string, LifecycleKey> = { closed_with_pending: 'realizado' };
export const normalizeLifecycle = (v: string | null | undefined): LifecycleKey | undefined =>
  v ? (LEGACY_LIFECYCLE[v] ?? (v as LifecycleKey)) : undefined;

// Pseudo-opções do filtro de prioridade que NÃO são prioridade: são a situação
// do evento. Ficam no mesmo dropdown (em grupo próprio) porque é onde o usuário
// já procura por "Concluído" — mas casam por lifecycle, não por
// `event.priority`.
export const LIFECYCLE_FILTERS = ['completed', 'realizado', 'manually_closed'] as const;

// Os dois estados que saem da visão padrão da grade: trabalho que acabou
// (entregue) e trabalho que alguém fechou. "Realizado com pendências" NÃO entra
// aqui, DE PROPÓSITO: é o único balde em que alguma coisa ficou para trás, e
// some por decisão de NINGUÉM — apenas o calendário virou. Arquivar por
// calendário esconderia exatamente o que o dono não pode perder de vista. A
// grade continua limpa porque o passado que acabou bem é `completed`, e esse
// sim é arquivado.
export const ARCHIVED_LIFECYCLES = new Set<LifecycleKey>(['completed', 'manually_closed']);

// Grafias que contam como ENTREGUE e como FORA DO FUNIL — espelham
// server/routes/events.ts. Só são usadas no fallback de `readEventStats`.
const DELIVERED_STATUSES = new Set(['delivered', 'entregue']);
const OUT_OF_FUNNEL_STATUSES = FORA_DO_FUNIL;

/**
 * Lê os contadores do payload — com FALLBACK calculado no cliente.
 *
 * O servidor manda `lifecycle`/`allDelivered`/`deliveredCount`/`activeItemCount`
 * prontos e essa é a fonte a usar. O fallback existe para o cenário
 * git-pull-sem-Stop/Run (o Express velho responde sem os campos novos): sem
 * ele a tela mostraria TODO evento como "ativo, 0%", que é pior que a mentira
 * que estamos corrigindo. As duas contas seguem a MESMA regra: canceladas
 * saem do denominador, "entregue" (grafia legada) conta como entregue.
 */
export function readEventStats(event: EventoDaLista): EventStats {
  const items: PecaDoEventoNaLista[] = Array.isArray(event.items) ? event.items : [];

  let deliveredCount = 0;
  let canceledCount = 0;
  let inProductionCount = 0;
  for (const it of items) {
    if (OUT_OF_FUNNEL_STATUSES.has(it.status)) canceledCount += 1;
    else if (DELIVERED_STATUSES.has(it.status)) deliveredCount += 1;
    if (it.status === 'inProduction' || it.status === 'em_producao') inProductionCount += 1;
  }

  const itemCount = typeof event.itemCount === 'number' ? event.itemCount : items.length;
  canceledCount = typeof event.canceledCount === 'number' ? event.canceledCount : canceledCount;
  deliveredCount = typeof event.deliveredCount === 'number' ? event.deliveredCount : deliveredCount;
  const activeItemCount = typeof event.activeItemCount === 'number'
    ? event.activeItemCount
    : itemCount - canceledCount;
  const openCount = typeof event.openCount === 'number'
    ? event.openCount
    : activeItemCount - deliveredCount;

  const allDelivered = typeof event.allDelivered === 'boolean'
    ? event.allDelivered
    : activeItemCount > 0 && openCount === 0;

  // `eventHasPassed` do servidor = "o DIA DO EVENTO passou", dia-calendário em
  // America/Sao_Paulo e comparação ESTRITA (durante o dia do evento ele ainda
  // conta). O fallback chama o MESMO predicado das cinco filas de trabalho —
  // era aqui que morava a segunda implementação da virada do dia, com `>=`,
  // um dia à frente das outras telas. Só `startDate` é passado de propósito:
  // aqui a pergunta é sobre a DATA, e o encerramento manual é lido logo abaixo.
  let eventHasPassed = false;
  if (typeof event.eventHasPassed === 'boolean') {
    eventHasPassed = event.eventHasPassed;
  } else if (event.startDate) {
    eventHasPassed = motivoEventoFinalizado({ startDate: event.startDate }, todayBusinessMs()) === 'realizado';
  }

  // Encerramento MANUAL: `manuallyClosed` vem do servidor; o fallback lê a
  // coluna crua (status "closed") porque é ela que persiste a decisão. É o
  // único pedaço do ciclo de vida que NÃO se recalcula a partir das peças —
  // por isso vem primeiro e vence os outros três.
  const manuallyClosed = typeof event.manuallyClosed === 'boolean'
    ? event.manuallyClosed
    : event.status === 'closed';

  const lifecycle: LifecycleKey = manuallyClosed
    ? 'manually_closed'
    : normalizeLifecycle(event.lifecycle)
      ?? (allDelivered ? 'completed' : eventHasPassed ? 'realizado' : 'active');

  const progressPct = activeItemCount > 0
    ? Math.round((deliveredCount / activeItemCount) * 100)
    : 0;

  return {
    itemCount, activeItemCount, deliveredCount, canceledCount, openCount,
    inProductionCount, allDelivered, eventHasPassed, manuallyClosed, lifecycle, progressPct,
  };
}

/**
 * CONTADORES POR OBJETO DE EVENTO, calculados uma vez (PERF-6, 17/09).
 *
 * `readEventStats` varre `event.items` inteiro — o payload embute as peças de
 * cada evento (o acervo todo, somado). Os filtros da tela chamavam a função
 * por evento em cada predicado (foco, prioridade, situação, ordem) e em cada
 * contagem de faceta: a mesma varredura seis, sete vezes a cada recorte.
 * O cache é por OBJETO (WeakMap): o refetch traz objetos novos e o cache velho
 * vai embora com eles, então nunca serve número de um payload anterior.
 * Só entra no cache o que não depende do relógio — quando o servidor já manda
 * `eventHasPassed`. O fallback de servidor antigo calcula o "já passou" com o
 * dia de hoje e, por isso, continua recalculado a cada chamada.
 */
const statsPorObjeto = new WeakMap<object, EventStats>();
export function statsDoEvento(event: EventoDaLista): EventStats {
  if (!event || typeof event !== 'object' || typeof event.eventHasPassed !== 'boolean') return readEventStats(event);
  let stats = statsPorObjeto.get(event);
  if (!stats) { stats = readEventStats(event); statsPorObjeto.set(event, stats); }
  return stats;
}

/**
 * Peças criadas que ainda não foram ENVIADAS para a vinculação (draft e o
 * legado requested — a mesma população do botão "Enviar" do detalhe).
 *
 * POR QUE NO CARTÃO: rascunho esquecido é o travamento mais silencioso do
 * fluxo. A barra de fases mostra 0% e o cartão parece "só começando", quando
 * na verdade a lista está pronta e ninguém apertou enviar. `event.items` já
 * vem no payload de /api/events (enrichEvent) — não há busca a mais.
 */
export function contarRascunhos(event: EventoDaLista): number {
  const items: PecaDoEventoNaLista[] = Array.isArray(event.items) ? event.items : [];
  let n = 0;
  for (const it of items) if (it.status === 'draft' || it.status === 'requested') n += 1;
  return n;
}

/** Prioridade do evento para filtro/ordenação. Ciclo de vida NÃO entra aqui. */
export function eventPriorityKey(event: EventoDaLista): PriorityLevel {
  return (event.priority as PriorityLevel) || 'sem_prioridade';
}

// Cores/rótulos derivados de PRIORITY (lib/status) — antes havia mapas hex
// duplicados aqui. `hex` (saturado) fica para borda/ícone/barra; `text` (tom
// escuro AA) é o que vai em texto.
const PRIORITY_FALLBACK = { label: "Sem Prioridade", hex: T.bdark, text: T.apoio };
export function getPriorityConfig(priority: string | null | undefined): { label: string; hex: string; text: string } {
  const meta = getPriorityMeta(priority);
  return meta ? { label: meta.label, hex: meta.dot, text: meta.text || T.apoio } : PRIORITY_FALLBACK;
}

/**
 * O balde de situação. PARTICIONA: todo evento cai em exatamente um, e é
 * isso que faz a soma das três contagens fechar com o total.
 */
export function baldeDe(event: EventoDaLista): BaldeDaSituacao {
  const lifecycle = statsDoEvento(event).lifecycle;
  if (ARCHIVED_LIFECYCLES.has(lifecycle)) return "arquivados";
  if (lifecycle === "realizado") return "pendencias";
  return "ativos";
}

/**
 * Ordenação: RISCO ABERTO primeiro, depois SAÍDA DO CAMINHÃO ascendente.
 *
 * A saída é a âncora do negócio — todo prazo do sistema pende dela. A
 * prioridade deixa de ser o eixo primário e vira desempate + destaque
 * visual. Os quatro baldes:
 *   0 · risco ABERTO — marco atrasado ou prioridade urgente, com o caminhão
 *       ainda por sair. É o que dá para salvar, e por isso vem primeiro.
 *   1 · em jogo
 *   2 · realizado com pendência — o caminhão já saiu; o que sobrou é
 *       acerto de contas, não urgência. Ficava no balde 0 e empurrava
 *       para baixo da dobra o evento que embarca amanhã.
 *   3 · concluído/encerrado (história)
 */
export function sortRank(event: EventoDaLista): number {
  const lifecycle = statsDoEvento(event).lifecycle;
  if (ARCHIVED_LIFECYCLES.has(lifecycle)) return 3;
  if (lifecycle === 'realizado') return 2;
  if (event.nextMilestone?.state === 'overdue') return 0;
  if (event.priority === 'urgente') return 0;
  return 1;
}
const PRIORITY_ORDER: Record<string, number> = { urgente: 0, alta: 1, media: 2, baixa: 3, sem_prioridade: 4 };

/** A regra da ordem, escrita ao lado dos alternadores (a resposta a "por que este está em cima"). */
export const REGRA_DA_ORDEM: Record<OrdemDosEventos, string> = {
  saida: 'marco atrasado primeiro, depois quem embarca antes; realizados por último',
  marco: 'o marco mais perto de vencer no topo',
  nome: 'ordem alfabética',
};

/** Ordena uma cópia da lista pelo critério escolhido (a cadeia de desempate é fixa). */
export function ordenarEventos(eventos: EventoDaLista[], ordem: OrdemDosEventos): EventoDaLista[] {
  // Chaves de ordenação calculadas UMA vez por evento (decorate-sort-undecorate):
  // dentro do comparador, `sortRank` refazia a leitura das peças a cada
  // comparação — O(n log n) varreduras da lista inteira de itens.
  const decorated = eventos.map((event) => ({
    event,
    // SEM PRIORIDADE POR ÚLTIMO, SEMPRE (pedido do dono, 25/08): com a
    // prioridade automática, "sem prioridade" quer dizer caminhão já
    // saído, sem data ou evento finalizado — o menos acionável da lista.
    // Ele não pode empurrar para baixo da dobra quem ainda embarca.
    sem: event.priority ? 0 : 1,
    rank: sortRank(event),
    dep: event.truckDepartureDate ? toUTCDisplayDate(event.truckDepartureDate).getTime() : Number.MAX_SAFE_INTEGER,
    prio: PRIORITY_ORDER[eventPriorityKey(event)],
    // `daysRemaining` vem do SERVIDOR, já no fuso do negócio — não é
    // recalculado aqui de propósito.
    marco: event.nextMilestone?.daysRemaining ?? Number.MAX_SAFE_INTEGER,
    name: event.name || '',
  }));

  // O CRITÉRIO ESCOLHIDO decide o primeiro desempate; o resto da cadeia
  // continua igual, porque ela é o que torna a ordem estável (sem ela, dois
  // eventos com o mesmo marco trocariam de lugar a cada render).
  decorated.sort((a, b) => {
    // "Sempre" é literal: vale nos três critérios, inclusive no alfabético.
    if (a.sem !== b.sem) return a.sem - b.sem;
    if (ordem === 'nome') return a.name.localeCompare(b.name, 'pt-BR');
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (ordem === 'marco') {
      // Sem marco vai para o fim: não é "o menos urgente", é ausência de
      // marco — e misturá-lo com os de prazo longo esconderia os dois.
      if (a.marco !== b.marco) return a.marco - b.marco;
    }
    if (a.dep !== b.dep) return a.dep - b.dep;
    if (a.prio !== b.prio) return a.prio - b.prio;
    return a.name.localeCompare(b.name, 'pt-BR');
  });

  return decorated.map((d) => d.event);
}

/** "2026-03" — ano+mês da saída, na mesma base do cartão (toUTCDisplayDate). */
export function mesDaSaida(truckDepartureDate: string): string {
  const d = toUTCDisplayDate(truckDepartureDate);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
