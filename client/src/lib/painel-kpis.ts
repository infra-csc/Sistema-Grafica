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
import { statusParaContagem } from "@shared/molde";
import { ETAPAS_DA_PECA, STATUS_DA_ETAPA, etapaDaPeca } from "@shared/fluxo-peca";
import type { EtapaDaPeca } from "@shared/fluxo-peca";

/**
 * Chave de filtro/card → status reais que ela cobre.
 *
 * Os cards SÃO as etapas canônicas da peça (shared/fluxo-peca) — a mesma
 * régua da barra de fases, do Atendimento, de Prazos e das Análises. O
 * primeiro status de cada lista é o canônico (dá rótulo e cor ao card). A
 * ORDEM das chaves é a do fluxo e serve de peso na ordenação por Status.
 */
export const STATUS_GROUPS: Readonly<Record<EtapaDaPeca, readonly string[]>> = STATUS_DA_ETAPA;

export type GroupKey = EtapaDaPeca;

export const GROUP_KEYS: GroupKey[] = [...ETAPAS_DA_PECA];

/** Grupo de um status, ou `null` quando o valor está fora do vocabulário do app. */
export function statusGroupOf(status: string | null | undefined): GroupKey | null {
  return etapaDaPeca(status);
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
export function computeStats(items: Array<{ status?: string | null; type?: string | null }>): PainelStats {
  const byGroup = Object.fromEntries(GROUP_KEYS.map((k) => [k, 0])) as Record<GroupKey, number>;
  const outrosSet = new Set<string>();
  let total = 0;
  let drafts = 0;
  let outros = 0;

  for (const i of items) {
    total++;
    if (i.status === "draft") drafts++;
    // Molde produzido conta onde a peça entregue conta (shared/molde).
    const g = statusGroupOf(statusParaContagem(i));
    if (g) byGroup[g]++;
    else {
      outros++;
      outrosSet.add(i.status ? String(i.status) : "(sem status)");
    }
  }

  return { total, drafts, byGroup, outros, outrosStatus: Array.from(outrosSet).sort() };
}
