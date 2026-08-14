// ─────────────────────────────────────────────────────────────────────────────
// AGRUPAMENTO DE STATUS DO PAINEL — fonte única da tela, regra pura.
//
// PORQUÊ ISTO EXISTE. A mesma regra de negócio vivia DUAS vezes dentro de
// painel-geral.tsx, em sintaxes diferentes e sem ligação: um `Record<string,
// string[]>` no predicado do filtro e um `switch` no acumulador dos KPIs. Elas
// coincidiam por sorte. Pior: `acc.total++` era incondicional e o `switch` não
// tinha `default:` — qualquer status fora das 14 chaves somava no Total e em
// card nenhum, e a soma dos cards deixava de fechar com o Total SEM QUALQUER
// AVISO. Aqui as duas derivam do mesmo mapa, e o que sobra é contado em
// `outros`, que a tela renderiza como card visível.
//
// Este mapa é do PAINEL (chave de filtro → status que ela cobre), não do
// vocabulário: rótulo, cor e dot continuam saindo de lib/status.ts, a fonte
// única do app. Os dois se encontram na tela, não aqui.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Chave de filtro/card → status reais que ela cobre.
 *
 * A ORDEM das chaves é a ordem do fluxo (entrada → aprovação → produção →
 * encerrados) e é usada como peso na ordenação por Status na tabela.
 */
export const STATUS_GROUPS = {
  requested:             ["draft", "requested"],
  awaiting_linking:      ["awaiting_linking"],
  awaiting_submission:   ["awaiting_submission"],
  awaiting_approval:     ["awaiting_approval", "awaiting_sponsor_approval"],
  awaiting_finalization: ["awaiting_finalization", "sponsor_approved", "awaiting_creator_review"],
  awaiting_final_review: ["awaiting_final_review"],
  ready_for_production:  ["ready_for_production", "pronto_para_producao"],
  approved:              ["approved"],
  inProduction:          ["inProduction"],
  produced:              ["produced"],
  conferred:             ["conferred"],
  delivered:             ["delivered"],
  canceled:              ["canceled"],
} as const satisfies Record<string, readonly string[]>;

export type GroupKey = keyof typeof STATUS_GROUPS;

export const GROUP_KEYS = Object.keys(STATUS_GROUPS) as GroupKey[];

// Índice reverso status → grupo, montado UMA vez no módulo. Sem ele, cada
// classificação varreria 13 arrays por peça.
const GROUP_OF: Record<string, GroupKey> = (() => {
  const m: Record<string, GroupKey> = {};
  for (const key of GROUP_KEYS) {
    for (const st of STATUS_GROUPS[key]) m[st] = key;
  }
  return m;
})();

/** Grupo de um status, ou `null` quando o valor está fora do vocabulário do painel. */
export function statusGroupOf(status: string | null | undefined): GroupKey | null {
  return (status && GROUP_OF[status]) || null;
}

/**
 * Peso do status na ordem do fluxo — para ordenar a coluna Status da tabela.
 * Status desconhecido vai para o fim (não some, não se disfarça de conhecido).
 */
export function statusFlowIndex(status: string | null | undefined): number {
  const g = statusGroupOf(status);
  return g ? GROUP_KEYS.indexOf(g) : GROUP_KEYS.length;
}

/**
 * O item casa com a seleção de status?
 *
 * Uma chave que existe em STATUS_GROUPS casa com o GRUPO inteiro; qualquer
 * outro valor (ex.: "draft" sozinho, que é opção própria do dropdown) casa por
 * igualdade exata. Lista vazia = sem filtro de status.
 */
export function matchesStatusFilter(status: string | null | undefined, filterValues: string[]): boolean {
  if (filterValues.length === 0) return true;
  return filterValues.some((fv) => {
    const group = (STATUS_GROUPS as Record<string, readonly string[]>)[fv];
    return group ? group.includes(status ?? "") : status === fv;
  });
}

export interface PainelStats {
  total: number;
  /** Subconjunto de `requested` — subtexto do card e filtro próprio. */
  drafts: number;
  byGroup: Record<GroupKey, number>;
  /** Peças cujo status não pertence a grupo nenhum. Sempre visível na tela. */
  outros: number;
  /** Valores crus que caíram em `outros` — é o que torna a anomalia diagnosticável. */
  outrosStatus: string[];
}

/**
 * KPIs num único passe (eram 14 `filter()`, 14 varreduras).
 *
 * INVARIANTE, coberta por teste: `soma(byGroup) + outros === total`. É esta
 * igualdade que a versão anterior podia quebrar em silêncio.
 */
export function computeStats(items: Array<{ status?: string | null }>): PainelStats {
  const byGroup = Object.fromEntries(GROUP_KEYS.map((k) => [k, 0])) as Record<GroupKey, number>;
  const outrosSet = new Set<string>();
  let total = 0;
  let drafts = 0;
  let outros = 0;

  for (const i of items) {
    total++;
    if (i.status === "draft") drafts++;
    const g = statusGroupOf(i.status);
    if (g) byGroup[g]++;
    else {
      outros++;
      outrosSet.add(i.status ? String(i.status) : "(sem status)");
    }
  }

  return { total, drafts, byGroup, outros, outrosStatus: Array.from(outrosSet).sort() };
}
