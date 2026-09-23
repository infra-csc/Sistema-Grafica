// ─────────────────────────────────────────────────────────────────────────────
// A LISTA DE PEÇAS — filtros (busca, chips de status, marco da timeline),
// agrupamento (por tipo ou por status) e o corte de 50 linhas.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import { getStatusLabel } from "@/lib/status";
import { grupoDoKit } from "@shared/kit";
import { statusDeExibicao, statusParaContagem } from "@shared/molde";
import { ORDEM_DO_FLUXO, estaAtrasDoMarco } from "./regras";
import type { PecaDoEvento } from "./tipos";

export type Agrupamento = 'tipo' | 'status';

/**
 * O estado dos filtros. Agrupar por TIPO (como a produção lê) ou por STATUS
 * (para achar o que travou), e o marco clicado na timeline — os dois na URL,
 * para a leitura sobreviver ao refresh e poder ser mandada por link.
 */
export function useFiltrosDaLista() {
  const [itemSearch, setItemSearch] = useState("");
  const [showAllItems, setShowAllItems] = useState(false);
  const [agrupar, setAgrupar] = useState<Agrupamento>(() =>
    new URLSearchParams(window.location.search).get('agrupar') === 'status' ? 'status' : 'tipo');
  const [marcoFiltro, setMarcoFiltro] = useState<number | null>(() => {
    const v = new URLSearchParams(window.location.search).get('marco');
    return v !== null && /^[0-5]$/.test(v) ? Number(v) : null;
  });
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (agrupar === 'status') p.set('agrupar', 'status'); else p.delete('agrupar');
    if (marcoFiltro !== null) p.set('marco', String(marcoFiltro)); else p.delete('marco');
    const q = p.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`);
  }, [agrupar, marcoFiltro]);
  // Filtro por status via chips do cabeçalho — compõe com a busca textual.
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  return { itemSearch, setItemSearch, showAllItems, setShowAllItems, agrupar, setAgrupar, marcoFiltro, setMarcoFiltro, statusFilter, setStatusFilter };
}

export type FiltrosDaLista = ReturnType<typeof useFiltrosDaLista>;

/** As peças que a lista mostra, já filtradas, cortadas e agrupadas. */
export function usePecasDaLista(mainItems: PecaDoEvento[], filtros: FiltrosDaLista, groupOf: (type: string) => string) {
  const { itemSearch, statusFilter, marcoFiltro, showAllItems } = filtros;

  // Busca local: num evento com centenas de peças, achar a "#0281" era
  // rolagem cega. Casa com ID, tipo, descrição e rótulo de status; compõe com
  // o filtro por chips de status do cabeçalho.
  const itemSearchLower = itemSearch.trim().toLowerCase();
  const searchedItems = useMemo(() => {
    let base = mainItems;
    if (statusFilter.length > 0) base = base.filter(item => statusFilter.includes(item.status));
    // O gargalo clicado na timeline: as peças que AINDA NÃO passaram por ele.
    if (marcoFiltro !== null) base = base.filter(item => estaAtrasDoMarco(statusParaContagem(item), marcoFiltro));
    if (itemSearchLower) {
      base = base.filter((item) =>
        (item.displayId || "").toLowerCase().includes(itemSearchLower) ||
        (item.type || "").toLowerCase().includes(itemSearchLower) ||
        (item.description || "").toLowerCase().includes(itemSearchLower) ||
        getStatusLabel(item.status).toLowerCase().includes(itemSearchLower));
    }
    return base;
  }, [mainItems, statusFilter, itemSearchLower, marcoFiltro]);

  // Renderização incremental (mesmo padrão do Painel Geral): até 50 linhas;
  // o restante entra sob demanda — mantém o DOM leve em eventos grandes.
  const ITEM_CAP = 50;
  const visibleEventItems = showAllItems || searchedItems.length <= ITEM_CAP
    ? searchedItems
    : searchedItems.slice(0, ITEM_CAP);
  const hiddenItemCount = searchedItems.length - visibleEventItems.length;

  // Agrupar itens: Grupo Pai → Tipo → [itens]
  const { groupMap, sortedGroups } = useMemo(() => {
    const map: Record<string, Record<string, typeof visibleEventItems>> = {};
    visibleEventItems.forEach(item => {
      // Peça do Kit: agrupada na remessa ("KIT V1 · entrega 14/09"),
      // não misturada nos grupos da Arena.
      const g = grupoDoKit(item) ?? (groupOf(item.type) || '');
      if (!map[g]) map[g] = {};
      if (!map[g][item.type]) map[g][item.type] = [];
      map[g][item.type].push(item);
    });
    const ehKit = (g: string) => g.startsWith('KIT');
    const groups = Object.keys(map).sort((a, b) => {
      if (ehKit(a) !== ehKit(b)) return ehKit(a) ? 1 : -1;
      if (a === '') return 1; if (b === '') return -1;
      return a.localeCompare(b, 'pt-BR');
    });
    return { groupMap: map, sortedGroups: groups };
  }, [visibleEventItems, groupOf]);

  // Modo STATUS: a chave é a etapa, não a produção — sem grupo pai, seções na
  // ordem do fluxo (a ordem das chaves de STATUS em lib/status).
  const secoesPorStatus = useMemo(() => {
    const map = new Map<string, typeof visibleEventItems>();
    visibleEventItems.forEach(item => {
      // Molde produzido tem seção própria ("Produzido (molde)"): ele não está
      // em Impresso/Acabamento — produzido é o FIM do fluxo dele (shared/molde).
      const chave = statusDeExibicao(item);
      if (!map.has(chave)) map.set(chave, []);
      map.get(chave)!.push(item);
    });
    return Array.from(map.entries()).sort(([a], [b]) => (ORDEM_DO_FLUXO.get(a) ?? 999) - (ORDEM_DO_FLUXO.get(b) ?? 999));
  }, [visibleEventItems]);

  return { itemSearchLower, searchedItems, hiddenItemCount, groupMap, sortedGroups, secoesPorStatus };
}
