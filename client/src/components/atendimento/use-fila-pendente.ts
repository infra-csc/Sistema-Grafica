// ─────────────────────────────────────────────────────────────────────────────
// A FILA DE PENDENTES FILTRADA, E AS FACETAS DOS MENUS.
//
// A invariante da casa: FACETA E LISTA SAEM DO MESMO POOL. Cada menu conta o
// que o clique entrega, aplicando os OUTROS filtros ativos.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from "react";
import { normalizarBusca } from "@/lib/utils";
import { filtrarAtrasadosNaAprovacao, isEventoAtrasadoNaAprovacao } from "@/lib/atendimento-prazo";
import { T, TOM } from "@/lib/theme";
import type { FilterOption } from "@/components/filter-select";
import { SITUACAO_META, SITUACAO_ORDEM, situacaoDaPeca } from "./regras";
import type { EventoAtendimento, OpcaoContada, Patrocinador, PecaAtendimento, SponsorApproval } from "./tipos";

export function useFilaPendente({
  pendingItems, itemSponsorsMap, itemApprovalsMap, loadingSponsors, deferredSearchTerm,
  eventFilter, itemTypeFilter, sponsorFilter, situacaoFilter, atrasadosFilter, eventoPorId, hoje, events, sponsors,
}: {
  pendingItems: PecaAtendimento[];
  itemSponsorsMap: Record<string, Patrocinador[]>;
  itemApprovalsMap: Record<string, SponsorApproval[]>;
  loadingSponsors: boolean;
  deferredSearchTerm: string;
  eventFilter: string[];
  itemTypeFilter: string[];
  sponsorFilter: string[];
  situacaoFilter: string[];
  atrasadosFilter: boolean;
  eventoPorId: Map<string, EventoAtendimento>;
  hoje: Date;
  events: EventoAtendimento[];
  sponsors: Patrocinador[];
}) {
  // "Base" = todos os filtros MENOS o de atrasados. É dela que sai a contagem
  // exibida no próprio controle, que precisa continuar valendo depois do clique.
  const filteredItemsBase = useMemo(() => {
    return pendingItems.filter(item => {
      const hasSponsors = itemSponsorsMap[item.id]?.length > 0;
      if (!hasSponsors && !loadingSponsors) return false;

      // A busca desta aba tinha DOIS defeitos, e o campo prometia os dois:
      // o placeholder diz "ID, tipo ou descrição".
      //
       // 1. Nunca olhava o `displayId`. Digitar "2229" devolvia zero, sempre —
      //    e o ID é justamente como se procura uma peça quando alguém liga
      //    perguntando por ela.
      // 2. Usava `toLowerCase()` cru, que não tira acento: "São" e "sao" eram
      //    buscas diferentes. É o mesmo defeito que a Gráfica teve com
      //    "SÓ QUERO PEDALAR SP".
      //
      // O conserto já existia na aba Histórico (`casaHistorico`): mesma
      // `normalizarBusca` dos menus, sobre os mesmos três campos. Duas buscas
      // na mesma tela com regras diferentes era a origem de tudo.
      const q = normalizarBusca(deferredSearchTerm);
      const matchesSearch = q === "" ||
        normalizarBusca(item.displayId).includes(q) ||
        normalizarBusca(item.type).includes(q) ||
        normalizarBusca(item.description).includes(q);

      const matchesEvent = eventFilter.length === 0 || eventFilter.includes(item.eventId);
      const matchesType = itemTypeFilter.length === 0 || itemTypeFilter.includes(item.type);
      const matchesSponsor = sponsorFilter.length === 0 ||
        itemSponsorsMap[item.id]?.some(sponsor => sponsorFilter.includes(sponsor.id));
      const matchesSituacao = situacaoFilter.length === 0 ||
        situacaoFilter.includes(situacaoDaPeca(itemApprovalsMap[item.id]));

      return matchesSearch && matchesEvent && matchesType && matchesSponsor && matchesSituacao;
    });
  }, [pendingItems, deferredSearchTerm, eventFilter, itemTypeFilter, sponsorFilter, situacaoFilter, itemApprovalsMap, itemSponsorsMap, loadingSponsors]);

  // UMA passada, memoizada na âncora estável — nada de recalcular data por card.
  const atrasadosNaBase = useMemo(
    () => filtrarAtrasadosNaAprovacao(filteredItemsBase, eventoPorId, hoje),
    [filteredItemsBase, eventoPorId, hoje],
  );

  const filteredItems = atrasadosFilter ? atrasadosNaBase : filteredItemsBase;

  // Filtros facetados: cada filtro lista só o que existe na página, aplicando
  // os OUTROS filtros ativos (escolher um evento reduz tipos e patrocinadores).
  const facetPool = (exclude: 'event' | 'type' | 'sponsor' | 'situacao') =>
    pendingItems.filter((item) => {
      if (!(itemSponsorsMap[item.id]?.length > 0) && !loadingSponsors) return false;
      // O recorte de atrasados também é faceta: sem ele aqui, o dropdown
      // ofereceria "Evento X · 12" e a lista devolveria 2.
      // Peça do Kit (14/09): o atraso conta pelas datas da remessa dela.
      if (atrasadosFilter && !isEventoAtrasadoNaAprovacao(item.kitRemessaId && item.event ? item.event : eventoPorId.get(item.eventId), hoje)) return false;
      if (exclude !== 'event' && eventFilter.length > 0 && !eventFilter.includes(item.eventId)) return false;
      if (exclude !== 'type' && itemTypeFilter.length > 0 && !itemTypeFilter.includes(item.type)) return false;
      if (exclude !== 'sponsor' && sponsorFilter.length > 0 && !itemSponsorsMap[item.id]?.some(s => sponsorFilter.includes(s.id))) return false;
      if (exclude !== 'situacao' && situacaoFilter.length > 0 && !situacaoFilter.includes(situacaoDaPeca(itemApprovalsMap[item.id]))) return false;
      return true;
    });

  const eventFilterOptions = useMemo(() => {
    const DOT: Record<string, string> = { urgente: TOM.perigo.dot, urgent: TOM.perigo.dot, alta: T.accent, media: TOM.alerta.dot, baixa: TOM.info.dot };
    const byId = new Map(events.map((e) => [e.id, e]));
    const map = new Map<string, OpcaoContada>();
    facetPool('event').forEach((i) => {
      if (!i.eventId) return;
      const cur = map.get(i.eventId);
      if (cur) cur.count++;
      else {
        const ev = byId.get(i.eventId);
        map.set(i.eventId, { value: i.eventId, label: ev?.name || 'Sem evento', count: 1, dotColor: DOT[ev?.priority ?? ''] });
      }
    });
    return Array.from(map.values());
  }, [pendingItems, eventFilter, itemTypeFilter, sponsorFilter, itemSponsorsMap, loadingSponsors, events, atrasadosFilter, eventoPorId, hoje]);

  // A contagem por SITUAÇÃO, calculada UMA vez.
  //
  // O placar e o menu "Situação" mostram os mesmos números em dois lugares da
  // mesma tela. Esta tela já teve exatamente esse defeito — o badge do topo e
  // a contagem da aba somavam conjuntos diferentes e divergiam à vista de
  // todos, e há um comentário no código registrando o conserto. Com uma fonte
  // só eles não voltam a divergir nem se alguém mexer em um dos dois.
  //
  // O pool é o de `facetPool("situacao")`, que aplica os OUTROS filtros mas
  // não o de situação: o placar é o controle que LIGA esse filtro, então ele
  // precisa contar o conjunto de antes dele — senão clicar numa célula mudaria
  // o número da própria célula que você clicou.
  const contagemSituacao = useMemo(() => {
    const conta = new Map<string, number>();
    facetPool('situacao').forEach((i) => {
      const k = situacaoDaPeca(itemApprovalsMap[i.id]);
      conta.set(k, (conta.get(k) ?? 0) + 1);
    });
    return conta;
  }, [pendingItems, eventFilter, itemTypeFilter, sponsorFilter, situacaoFilter, itemApprovalsMap, itemSponsorsMap, loadingSponsors, atrasadosFilter, eventoPorId, hoje]);

  const situacaoFilterOptions = useMemo(() => {
    const conta = contagemSituacao;
    // `pinned`: a ordem é a da urgência, e alfabética poria "Aprovado" antes de
    // "Nova versão para aprovar" — o oposto de onde o olho precisa cair.
    return SITUACAO_ORDEM
      .filter(k => (conta.get(k) ?? 0) > 0)
      .map(k => ({ value: k, label: SITUACAO_META[k].label, count: conta.get(k)!, pinned: true }));
  }, [contagemSituacao]);

  const typeFilterOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    facetPool('type').forEach((i) => {
      if (!i.type) return;
      const cur = map.get(i.type);
      if (cur) cur.count++;
      else map.set(i.type, { value: i.type, label: i.type, count: 1 });
    });
    return Array.from(map.values());
  }, [pendingItems, eventFilter, itemTypeFilter, sponsorFilter, itemSponsorsMap, loadingSponsors, atrasadosFilter, eventoPorId, hoje]);

  // Enquanto o mapa ainda carrega, mostra todos os patrocinadores da API
  // (sem contagem) para que o filtro apareça imediatamente. Assim que o mapa
  // ficar pronto, troca para as opções facetadas com contagem.
  const sponsorFilterOptions = useMemo(() => {
    if (loadingSponsors) {
      return sponsors.map((s): FilterOption => ({ value: s.id, label: s.name }));
    }
    const map = new Map<string, OpcaoContada>();
    facetPool('sponsor').forEach((i) => (itemSponsorsMap[i.id] ?? []).forEach((s) => {
      const cur = map.get(s.id);
      if (cur) cur.count++;
      else map.set(s.id, { value: s.id, label: s.name, count: 1, dotColor: s.color || T.muted });
    }));
    return Array.from(map.values());
  }, [pendingItems, eventFilter, itemTypeFilter, sponsorFilter, itemSponsorsMap, loadingSponsors, sponsors, atrasadosFilter, eventoPorId, hoje]);

  return {
    filteredItemsBase, atrasadosNaBase, filteredItems, eventFilterOptions, contagemSituacao,
    situacaoFilterOptions, typeFilterOptions, sponsorFilterOptions,
  };
}
