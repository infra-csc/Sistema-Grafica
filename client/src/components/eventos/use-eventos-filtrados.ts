// O recorte da lista de Eventos: predicados, ordem, contagens de cada filtro
// e os chips de filtro ativo. Os predicados são separados para que a CONTAGEM
// de cada dropdown reflita os DEMAIS filtros (o número dentro do dropdown
// nunca mente sobre o que vai aparecer).
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Sponsor } from "@shared/schema";
import { PRIORITY } from "@/lib/status";
import { toUTCDisplayDate } from "@/lib/utils";
import { T } from "@/lib/theme";
import { CARD_PAGE, MONTH_NAMES } from "./constantes";
import {
  ARCHIVED_LIFECYCLES, LIFECYCLE_FILTERS, baldeDe, eventPriorityKey, mesDaSaida, ordenarEventos, statsDoEvento,
} from "./regras";
import type { BaldeDaSituacao, EventoDaLista } from "./tipos";
import type { FiltrosDeEventos } from "./use-filtros-de-eventos";

const ROTULO_DA_SITUACAO: Record<BaldeDaSituacao, string> = { ativos: 'Ativos', pendencias: 'Pendências', arquivados: 'Encerrados' };

export interface ChipDeFiltro { key: string; label: string; clear: () => void }

export function useEventosFiltrados(
  events: EventoDaLista[],
  sponsorById: Map<string, Sponsor>,
  pedidosPorEvento: Map<string, number>,
  filtros: FiltrosDeEventos,
) {
  const {
    searchTerm, setSearchInput, setSearchTerm, selectedPriorities, setSelectedPriorities,
    selectedSponsorFilter, setSelectedSponsorFilter, next10DaysFilter, setNext10DaysFilter,
    monthFilter, setMonthFilter, foco, setFoco, ordem, situacoes, setSituacoes, alternarSituacao,
  } = filtros;

  const matchesSearch = useCallback((event: EventoDaLista) => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    if (event.name?.toLowerCase().includes(q)) return true;
    // Busca também por patrocinador: "em quais eventos a Ambev está?" é rotina
    // no Atendimento e não tinha resposta aqui.
    return (event.sponsors || []).some((es) =>
      (sponsorById.get(es.sponsorId)?.name || '').toLowerCase().includes(q));
  }, [searchTerm, sponsorById]);

  const matchesDates = useCallback((event: EventoDaLista) => {
    // Próximos 10 dias — toUTCDisplayDate alinha com a data que o card exibe.
    if (next10DaysFilter && event.truckDepartureDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tenDaysFromNow = new Date(today);
      tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10);
      const departureDate = toUTCDisplayDate(event.truckDepartureDate);
      if (!(departureDate >= today && departureDate <= tenDaysFromNow)) return false;
    }
    // Mês — compara ano+mês ("2026-03") na mesma base UTC do card.
    if (monthFilter !== "all" && event.truckDepartureDate) {
      if (mesDaSaida(event.truckDepartureDate) !== monthFilter) return false;
    }
    return true;
  }, [next10DaysFilter, monthFilter]);

  const matchesFoco = useCallback((event: EventoDaLista) => {
    if (!foco) return true;
    const stats = statsDoEvento(event);
    if (foco === "atrasado") return event.nextMilestone?.state === 'overdue';
    if (foco === "sem_pecas") return stats.activeItemCount === 0 && !ARCHIVED_LIFECYCLES.has(stats.lifecycle);
    // Pedidos do Atendimento (dono, 14/09): eventos com pedido esperando a lista.
    if (foco === "pedidos") return (pedidosPorEvento.get(event.id) ?? 0) > 0;
    return true;
  }, [foco, pedidosPorEvento]);

  const matchesPriority = useCallback((event: EventoDaLista) => {
    if (selectedPriorities.length === 0) return true;
    const lifecycle = statsDoEvento(event).lifecycle;
    return selectedPriorities.some((sel) => {
      if ((LIFECYCLE_FILTERS as readonly string[]).includes(sel)) return lifecycle === sel;
      // Um evento CONCLUÍDO (ou encerrado à mão) não responde mais pela
      // prioridade — o badge dele já não é a prioridade. "Realizado com
      // pendências", sim: ele continua sendo trabalho, e continua na fila da
      // prioridade que tem.
      return !ARCHIVED_LIFECYCLES.has(lifecycle) && eventPriorityKey(event) === sel;
    });
  }, [selectedPriorities]);

  const matchesSponsor = useCallback((event: EventoDaLista) => {
    if (selectedSponsorFilter.length === 0) return true;
    return (event.sponsors || []).some((es) => selectedSponsorFilter.includes(es.sponsorId));
  }, [selectedSponsorFilter]);

  // A visibilidade agora é UM controle: os três alternadores de situação.
  //
  // Saiu daqui o `explicitLifecycleFilter` — a regra que ignorava o botão
  // "Ocultar concluídos" quando o dropdown pedia uma situação. Ela existia
  // para remendar a disputa entre dois controles sobre o mesmo eixo; sem a
  // disputa, não há o que remendar.
  //
  // Nenhum balde marcado mostra tudo, e não nada: uma tela vazia porque a
  // pessoa desmarcou os três se lê como erro, não como filtro.
  const matchesVisibility = useCallback((event: EventoDaLista) => {
    if (situacoes.size === 0) return true;
    return situacoes.has(baldeDe(event));
  }, [situacoes]);

  const filteredEvents = useMemo(
    () => ordenarEventos(
      events.filter((event) => matchesSearch(event) && matchesDates(event) && matchesFoco(event)
        && matchesPriority(event) && matchesSponsor(event) && matchesVisibility(event)),
      ordem,
    ),
    [events, matchesSearch, matchesDates, matchesFoco, matchesPriority, matchesSponsor, matchesVisibility, ordem],
  );

  // Quantos cards a grade monta de primeira: 50 + "Mostrar todos".
  const [visibleCount, setVisibleCount] = useState(CARD_PAGE);
  // Volta ao teto sempre que o recorte muda: "Mostrar todos" de um filtro não
  // pode vazar para o próximo.
  useEffect(() => { setVisibleCount(CARD_PAGE); },
    [searchTerm, selectedPriorities, selectedSponsorFilter, next10DaysFilter, monthFilter, situacoes, foco]);

  const visibleEvents = useMemo(() => filteredEvents.slice(0, visibleCount), [filteredEvents, visibleCount]);
  const hiddenCount = filteredEvents.length - visibleEvents.length;

  // CONTAGEM POR BALDE — sobre a lista filtrada por tudo MENOS a própria
  // situação. É o que faz o número ao lado de cada alternador ser exatamente o
  // de linhas que ligá-lo acrescenta, e a soma dos três fechar com o total.
  const contagemPorSituacao = useMemo(() => {
    const c: Record<BaldeDaSituacao, number> = { ativos: 0, pendencias: 0, arquivados: 0 };
    events
      .filter((e) => matchesSearch(e) && matchesDates(e) && matchesFoco(e) && matchesPriority(e) && matchesSponsor(e))
      .forEach((e) => { c[baldeDe(e)] += 1; });
    return c;
  }, [events, matchesSearch, matchesDates, matchesFoco, matchesPriority, matchesSponsor]);

  // "POR QUE NÃO APARECEU?" — os eventos que os demais filtros aceitam mas a
  // SITUAÇÃO esconde. A busca pelo nome de um evento arquivado devolvia
  // "Nenhum evento encontrado", e o "Limpar filtros" (que de propósito não
  // mexe na situação) não o trazia de volta: a pessoa concluía que o evento
  // tinha sumido. Os baldes e as contagens são os mesmos dos alternadores.
  const foraPorSituacao = useMemo(() => {
    if (situacoes.size === 0) return { total: 0, baldes: [] as BaldeDaSituacao[] };
    const baldes = (['ativos', 'pendencias', 'arquivados'] as const)
      .filter((b) => !situacoes.has(b) && contagemPorSituacao[b] > 0);
    return { total: baldes.reduce((s, b) => s + contagemPorSituacao[b], 0), baldes };
  }, [situacoes, contagemPorSituacao]);
  const incluirSituacoesOcultas = () => setSituacoes((prev) => new Set([...Array.from(prev), ...foraPorSituacao.baldes]));
  const nomesDasSituacoesOcultas = foraPorSituacao.baldes.map((b) => ROTULO_DA_SITUACAO[b]).join(' e ');

  // Contagens de prioridade sobre a lista já filtrada pelos DEMAIS filtros.
  const priorityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    events
      .filter((e) => matchesSearch(e) && matchesDates(e) && matchesFoco(e) && matchesSponsor(e))
      .forEach((e) => {
        const lifecycle = statsDoEvento(e).lifecycle;
        if (lifecycle === 'manually_closed') {
          counts.manually_closed = (counts.manually_closed || 0) + 1;
          return;
        }
        if (lifecycle === 'completed') {
          counts.completed = (counts.completed || 0) + 1;
          return;
        }
        // Realizado com pendências conta NOS DOIS lugares (sem `return`): o
        // evento continua respondendo pela prioridade que tem, porque continua
        // sendo trabalho a fechar.
        if (lifecycle === 'realizado') {
          counts.realizado = (counts.realizado || 0) + 1;
        }
        const p = eventPriorityKey(e);
        counts[p] = (counts[p] || 0) + 1;
      });
    return counts;
  }, [events, matchesSearch, matchesDates, matchesFoco, matchesSponsor]);

  // DUAS DIMENSÕES, UM MENU, DOIS GRUPOS. Continuam no mesmo dropdown porque
  // são mutuamente exclusivas na prática (um evento arquivado já não responde
  // pela prioridade, ver matchesPriority), porque o menu é um OU — "mostre o
  // que for qualquer uma destas" — e porque separá-las custaria um quinto
  // controle na faixa e quebraria todo link salvo com `?prioridade=`. O que
  // faltava era só dizer onde uma acaba e a outra começa: os cabeçalhos de
  // grupo do FilterSelect fazem isso, inclusive para leitor de tela (role=group).
  const priorityFilterOptions = useMemo(() => ([
    ...Object.entries(PRIORITY).map(([value, meta]) => ({
      value, label: meta.label, dotColor: meta.dot, count: priorityCounts[value] || 0, pinned: true,
      group: "Prioridade",
    })),
    { value: "sem_prioridade", label: "Sem Prioridade", dotColor: T.bdark, count: priorityCounts.sem_prioridade || 0, pinned: true, group: "Prioridade" },
    // As três opções de SITUAÇÃO saíram daqui. Elas eram o segundo lugar do
    // mesmo eixo, e é o que obrigava `matchesPriority` a saber de lifecycle e
    // o botão a se desabilitar sozinho.
  ]), [priorityCounts]);

  // Opções/contagens do filtro de patrocinador — mesma disciplina: contam a
  // lista já filtrada por tudo, MENOS o próprio filtro de patrocinador.
  const sponsorFilterOptions = useMemo(() => {
    const counts = new Map<string, number>();
    events
      .filter((e) => matchesSearch(e) && matchesDates(e) && matchesFoco(e) && matchesPriority(e) && matchesVisibility(e))
      .forEach((e) => {
        (e.sponsors || []).forEach((es) => {
          counts.set(es.sponsorId, (counts.get(es.sponsorId) || 0) + 1);
        });
      });
    const seen = new Set<string>();
    events.forEach((e) => (e.sponsors || []).forEach((es) => seen.add(es.sponsorId)));
    return Array.from(seen)
      .map((id) => ({
        value: id,
        label: sponsorById.get(id)?.name || "Patrocinador removido",
        dotColor: sponsorById.get(id)?.color || T.second,
        count: counts.get(id) || 0,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [events, sponsorById, matchesSearch, matchesDates, matchesFoco, matchesPriority, matchesVisibility]);

  // Contagens dos chips de foco (calculadas sem o próprio foco aplicado).
  const focoCounts = useMemo(() => {
    const base = events.filter((e) => matchesSearch(e) && matchesDates(e) && matchesPriority(e) && matchesSponsor(e) && matchesVisibility(e));
    let atrasado = 0, semPecas = 0, semPrioridade = 0, pedidos = 0;
    base.forEach((e) => {
      const stats = statsDoEvento(e);
      if (e.nextMilestone?.state === 'overdue') atrasado += 1;
      const arquivado = ARCHIVED_LIFECYCLES.has(stats.lifecycle);
      if (stats.activeItemCount === 0 && !arquivado) semPecas += 1;
      if (!e.priority && !arquivado) semPrioridade += 1;
      pedidos += pedidosPorEvento.get(e.id) ?? 0;
    });
    return { atrasado, semPecas, semPrioridade, pedidos };
  }, [events, matchesSearch, matchesDates, matchesPriority, matchesSponsor, matchesVisibility, pedidosPorEvento]);

  // Opções de mês (com ANO) derivadas dos eventos existentes, em ordem cronológica.
  const monthOptions = useMemo(() => {
    const keys = new Set<string>();
    events.forEach((e) => {
      if (!e.truckDepartureDate) return;
      keys.add(mesDaSaida(e.truckDepartureDate));
    });
    return Array.from(keys).sort().map((key) => {
      const [y, m] = key.split("-");
      return { value: key, label: `${MONTH_NAMES[Number(m) - 1]}/${y}`, pinned: true };
    });
  }, [events]);

  // Filtros ativos como CHIPS removíveis — usados no empty state por filtro,
  // onde "Limpar filtros" era tudo-ou-nada.
  const activeFilterChips = useMemo(() => {
    const chips: ChipDeFiltro[] = [];
    if (searchTerm) chips.push({ key: 'busca', label: `Busca: "${searchTerm}"`, clear: () => { setSearchInput(""); setSearchTerm(""); } });
    selectedPriorities.forEach((p) => {
      const opt = priorityFilterOptions.find((o) => o.value === p);
      chips.push({ key: `prio-${p}`, label: opt?.label || p, clear: () => setSelectedPriorities((prev) => prev.filter((x) => x !== p)) });
    });
    selectedSponsorFilter.forEach((sid) => {
      chips.push({ key: `sp-${sid}`, label: sponsorById.get(sid)?.name || 'Patrocinador', clear: () => setSelectedSponsorFilter((prev) => prev.filter((x) => x !== sid)) });
    });
    if (monthFilter !== "all") {
      const opt = monthOptions.find((o) => o.value === monthFilter);
      chips.push({ key: 'mes', label: opt?.label || monthFilter, clear: () => setMonthFilter("all") });
    }
    if (next10DaysFilter) chips.push({ key: 'proximos', label: 'Próximos 10 dias', clear: () => setNext10DaysFilter(false) });
    if (foco === 'atrasado') chips.push({ key: 'foco', label: 'Marco atrasado', clear: () => setFoco("") });
    if (foco === 'sem_pecas') chips.push({ key: 'foco', label: 'Sem peças', clear: () => setFoco("") });
    if (foco === 'pedidos') chips.push({ key: 'foco', label: 'Solicitações de peças', clear: () => setFoco("") });
    // O chip de "concluídos ocultos" saiu: os três alternadores de situação
    // JÁ mostram o que está dentro e o que está fora, com contagem. Um chip
    // que repete um controle visível ao lado é ruído — e este ainda oferecia
    // um "limpar" que discordava do alternador.
    if (!situacoes.has('arquivados') && situacoes.size > 0) {
      chips.push({ key: 'arquivados', label: 'Arquivados fora da lista', clear: () => alternarSituacao('arquivados') });
    }
    return chips;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, selectedPriorities, selectedSponsorFilter, monthFilter, next10DaysFilter, foco, situacoes, priorityFilterOptions, monthOptions, sponsorById]);

  const hasActiveFilters = searchTerm !== "" || selectedPriorities.length > 0 || selectedSponsorFilter.length > 0
    || monthFilter !== "all" || next10DaysFilter || foco !== "";

  return {
    filteredEvents, visibleEvents, hiddenCount, setVisibleCount,
    contagemPorSituacao, foraPorSituacao, incluirSituacoesOcultas, nomesDasSituacoesOcultas,
    priorityFilterOptions, sponsorFilterOptions, focoCounts, monthOptions,
    activeFilterChips, hasActiveFilters,
  };
}

export type EventosFiltrados = ReturnType<typeof useEventosFiltrados>;
