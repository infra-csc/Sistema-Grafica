// ─────────────────────────────────────────────────────────────────────────────
// O ESTADO DOS FILTROS DA ARTE — cada recorte, o objeto único `filters` que as
// listas leem, a contagem de filtros ativos e a URL que carrega o recorte.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  countActiveFilters,
  serializeArteFilters,
  type ArteFilters,
  type ArteSortMode,
  type PeriodFilter,
  type TriState,
  type parseArteFilters,
} from "@/lib/arte-rules";
import { CHAVE_MAIS_FILTROS } from "./constantes";

export type FiltrosDaArte = ReturnType<typeof useFiltrosDaArte>;

export function useFiltrosDaArte(urlInicial: ReturnType<typeof parseArteFilters>, activeTab: string) {
  const [eventFilter, setEventFilter] = useState<string[]>(urlInicial.filters.eventIds);
  const [typeFilter, setTypeFilter] = useState<string[]>(urlInicial.filters.types);
  const [materialFilter, setMaterialFilter] = useState<string[]>(urlInicial.filters.materials);
  const [next10DaysFilter, setNext10DaysFilter] = useState(urlInicial.filters.next10Days);
  const [monthFilter, setMonthFilter] = useState<string[]>(urlInicial.filters.months);
  const [searchFilter, setSearchFilter] = useState<string>(urlInicial.filters.search);
  // Adia o valor usado na filtragem: o input segue responsivo, mas a tabela
  // (grande) não re-renderiza a cada tecla — evita engasgo com muitas peças.
  const deferredSearch = useDeferredValue(searchFilter);
  // Ordenação dos blocos: por evento (A→Z) ou pela urgência do marco da fase.
  // A regra de negócio inteira gira em torno da saída do caminhão e a lista só
  // sabia ordenar por nome de evento.
  // Vem da URL como o resto do recorte: quem manda "a fila por prazo" para um
  // colega está mandando a ORDEM junto — sem isto o link abria em A→Z e a
  // primeira linha do print não era a primeira linha da tela do outro.
  const [sortMode, setSortMode] = useState<ArteSortMode>(urlInicial.sort);
  const [correcaoSponsorFilter, setCorrecaoSponsorFilter] = useState<string>("all");
  const [sponsorFilter, setSponsorFilter] = useState<string[]>(urlInicial.filters.sponsorIds);
  // Tri-estado no lugar dos pares "sem/com": ligados juntos, os dois booleanos
  // descartavam TUDO por construção e a lista esvaziava com o vazio genérico
  // de "2 filtros ativos". Um controle, três valores, nenhum estado impossível.
  const [thumbFilter, setThumbFilter] = useState<TriState>(urlInicial.filters.thumb);
  const [finalFilter, setFinalFilter] = useState<TriState>(urlInicial.filters.final);
  const [urgenteFilter, setUrgenteFilter] = useState(urlInicial.filters.urgente);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(urlInicial.filters.period);
  // Só o que passou do marco da FASE — ver isAtrasadaNaFase em lib/arte-rules.
  const [atrasadoFilter, setAtrasadoFilter] = useState(urlInicial.filters.atrasado);
  // "Paradas há mais de 7d nesta fase" — recorte local desta tela. Fica fora
  // de ArteFilters porque lib/arte-rules é só leitura; a URL ganha o
  // parâmetro aqui mesmo, ao lado dos outros.
  const [paradasFilter, setParadasFilter] = useState<boolean>(() => new URLSearchParams(window.location.search).get("paradas") === "1");
  // FILTROS ESCONDIDOS ATRÁS DE UM BOTÃO (dono, 22/09: "a Arte está achando
  // os filtros poluídos: deixar apenas EVENTOS aparentes"). À vista ficam só a
  // busca, o Evento, o "Saída 10 dias" e o Ordenar; os outros nove recortes
  // moram em "Mais filtros".
  // No CELULAR eles abrem numa folha de tela cheia (padrão da Gráfica), que
  // nunca abre sozinha — uma folha modal na chegada tomaria a tela inteira, e
  // o recorte ativo já fica escrito nos chips.
  const [filtrosAbertosMobile, setFiltrosAbertosMobile] = useState(false);
  // No DESKTOP é uma faixa que se expande abaixo da barra. Lembra o último
  // estado (localStorage com try/catch: aba anônima e armazenamento bloqueado
  // lançam) e ABRE sozinha quando o link chega com um filtro escondido ligado
  // — senão a lista viria recortada por um controle que ninguém está vendo.
  const [maisFiltrosAberto, setMaisFiltrosAberto] = useState<boolean>(() => {
    const f = urlInicial.filters;
    const escondidoNaURL = f.sponsorIds.length > 0 || f.types.length > 0 || f.materials.length > 0
      || f.months.length > 0 || f.period !== "Todos" || f.urgente || f.atrasado
      || f.thumb !== "todos" || f.final !== "todos";
    if (escondidoNaURL) return true;
    try { return window.localStorage.getItem(CHAVE_MAIS_FILTROS) === "1"; } catch { return false; }
  });
  const alternarMaisFiltros = () => {
    // Só o gesto do usuário grava: a abertura automática pelo link não vira
    // preferência de quem só abriu um link uma vez.
    const novo = !maisFiltrosAberto;
    setMaisFiltrosAberto(novo);
    try { window.localStorage.setItem(CHAVE_MAIS_FILTROS, novo ? "1" : "0"); } catch { /* sem armazenamento: só não lembra */ }
  };
  /**
   * Objeto ÚNICO de filtros. As três listas da tela (abas de status, contagem
   * da Correção e a própria lista da Correção) leem daqui e passam pelo mesmo
   * `matchesArteFilters` — antes eram três implementações e duas ignoravam
   * metade dos filtros que os chips diziam estar ligados.
   */
  const filters = useMemo<ArteFilters>(() => ({
    search: deferredSearch.toLowerCase(),
    eventIds: eventFilter,
    sponsorIds: sponsorFilter,
    types: typeFilter,
    materials: materialFilter,
    months: monthFilter,
    next10Days: next10DaysFilter,
    urgente: urgenteFilter,
    thumb: thumbFilter,
    final: finalFilter,
    period: periodFilter,
    atrasado: atrasadoFilter,
  }), [deferredSearch, eventFilter, sponsorFilter, typeFilter, materialFilter, monthFilter,
    next10DaysFilter, urgenteFilter, thumbFilter, finalFilter, periodFilter, atrasadoFilter]);

  const activeFilterCount = useMemo(
    // O filtro local de patrocinador da aba Correção não aparecia nem nos chips
    // nem nesta conta, e combinado com o global produzia interseções que
    // nenhum dos dois controles refletia.
    () => countActiveFilters(filters) + (correcaoSponsorFilter !== "all" ? 1 : 0) + (paradasFilter ? 1 : 0),
    [filters, correcaoSponsorFilter, paradasFilter],
  );

  const clearAllFilters = useCallback(() => {
    setSearchFilter("");
    setEventFilter([]);
    setSponsorFilter([]);
    setMonthFilter([]);
    setNext10DaysFilter(false);
    setTypeFilter([]);
    setMaterialFilter([]);
    setThumbFilter("todos");
    setFinalFilter("todos");
    setUrgenteFilter(false);
    setPeriodFilter("Todos");
    setAtrasadoFilter(false);
    setParadasFilter(false);
    setCorrecaoSponsorFilter("all");
  }, []);

  // Filtros na URL, com debounce de 300ms (a regra da casa pede ≥200): sem ele,
  // cada tecla da busca escrevia um replaceState — o padrão que já derrubou a
  // árvore React no Safari em outra tela.
  useEffect(() => {
    const timer = setTimeout(() => {
      const p = new URLSearchParams(serializeArteFilters(filters, activeTab, sortMode));
      if (paradasFilter) p.set("paradas", "1");
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters, activeTab, sortMode, paradasFilter]);
  // "Limpar estes filtros": só os escondidos. Evento e busca ficam — quem
  // limpa a faixa de baixo não pediu para perder o evento que escolheu em cima.
  const limparFiltrosEscondidos = () => {
    setSponsorFilter([]);
    setTypeFilter([]);
    setMaterialFilter([]);
    setMonthFilter([]);
    setPeriodFilter("Todos");
    setUrgenteFilter(false);
    setAtrasadoFilter(false);
    setThumbFilter("todos");
    setFinalFilter("todos");
  };

  return {
    eventFilter, setEventFilter,
    typeFilter, setTypeFilter,
    materialFilter, setMaterialFilter,
    next10DaysFilter, setNext10DaysFilter,
    monthFilter, setMonthFilter,
    searchFilter, setSearchFilter,
    sortMode, setSortMode,
    correcaoSponsorFilter, setCorrecaoSponsorFilter,
    sponsorFilter, setSponsorFilter,
    thumbFilter, setThumbFilter,
    finalFilter, setFinalFilter,
    urgenteFilter, setUrgenteFilter,
    periodFilter, setPeriodFilter,
    atrasadoFilter, setAtrasadoFilter,
    paradasFilter, setParadasFilter,
    maisFiltrosAberto, alternarMaisFiltros,
    filtrosAbertosMobile, setFiltrosAbertosMobile,
    filters, activeFilterCount, clearAllFilters, limparFiltrosEscondidos,
  };
}
