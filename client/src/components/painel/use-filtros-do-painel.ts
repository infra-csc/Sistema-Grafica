// ─── Os filtros do Painel Geral, espelhados na URL ──────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";

// Filtros inicializam da URL (?status=...&evento=...) — assim F5 não perde o
// trabalho de filtrar e dá para compartilhar um link "itens atrasados do
// evento X" com um colega.
export function useFiltrosDoPainel() {
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const fromCsv = (key: string) => { const v = urlParams.get(key); return v ? v.split(",").filter(Boolean) : []; };
  // Busca com debounce: o input atualiza `searchInput` a cada tecla; o filtro
  // (searchTerm) só é aplicado 200ms depois — sem isso, cada tecla refiltrava,
  // reordenava e reagrupava a lista inteira.
  const [searchInput, setSearchInput]   = useState(() => urlParams.get("busca") ?? "");
  const [searchTerm, setSearchTerm]     = useState(() => urlParams.get("busca") ?? "");
  const [statusFilter, setStatusFilter] = useState<string[]>(() => fromCsv("status"));
  const [eventFilter, setEventFilter]   = useState<string[]>(() => fromCsv("evento"));
  const [sponsorFilter, setSponsorFilter] = useState<string[]>(() => fromCsv("patrocinador"));
  const [typeFilter, setTypeFilter]     = useState<string[]>(() => fromCsv("tipo"));
  const [dateFilter, setDateFilter]     = useState<string[]>(() => fromCsv("saida"));
  const [focoFilter, setFocoFilter]     = useState<string[]>(() => fromCsv("foco"));
  // ── Peças de evento fora de jogo: ocultas na abertura ─────────────────────
  // Decisão do dono: "acho que não precisa aparecer inicialmente". Mesmo
  // padrão já provado das "entregues ocultas" da Gráfica — o estado mora na
  // URL (um recorte compartilhado tem de chegar igual do outro lado) e o
  // caminho de volta é um chip SEMPRE visível na faixa de atenção, nunca um
  // filtro escondido num dropdown.
  const [mostrarFinalizados, setMostrarFinalizados] = useState<boolean>(() => urlParams.get("finalizados") === "1");

  // Mantém a URL espelhando os filtros (replaceState: não polui o histórico).
  // Parte da query string ATUAL e sobrescreve só as chaves gerenciadas — um
  // param alheio (ex.: utm_source, flag de debug) sobrevive à filtragem.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const setOrDelete = (key: string, value: string) => value ? p.set(key, value) : p.delete(key);
    setOrDelete("busca", searchTerm);
    setOrDelete("status", statusFilter.join(","));
    setOrDelete("evento", eventFilter.join(","));
    setOrDelete("patrocinador", sponsorFilter.join(","));
    setOrDelete("tipo", typeFilter.join(","));
    setOrDelete("saida", dateFilter.join(","));
    setOrDelete("foco", focoFilter.join(","));
    setOrDelete("finalizados", mostrarFinalizados ? "1" : "");
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [searchTerm, statusFilter, eventFilter, sponsorFilter, typeFilter, dateFilter, focoFilter, mostrarFinalizados]);

  // Debounce da busca (200ms) — ver comentário no estado searchInput.
  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Voltar/avançar do navegador: reidrata os filtros a partir da URL. Sem
  // isso, o back trocava a URL mas a tela continuava com os filtros novos.
  useEffect(() => {
    const onPop = () => {
      const p = new URLSearchParams(window.location.search);
      const csv = (k: string) => { const v = p.get(k); return v ? v.split(",").filter(Boolean) : []; };
      setSearchInput(p.get("busca") ?? "");
      setSearchTerm(p.get("busca") ?? "");
      setStatusFilter(csv("status"));
      setEventFilter(csv("evento"));
      setSponsorFilter(csv("patrocinador"));
      setTypeFilter(csv("tipo"));
      setDateFilter(csv("saida"));
      setFocoFilter(csv("foco"));
      setMostrarFinalizados(p.get("finalizados") === "1");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Atalho "/" foca a busca (padrão de SaaS — Linear/GitHub). Ignorado quando
  // o usuário já está digitando em algum campo.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Clique no card alterna o status DENTRO do conjunto de filtros — coerente
  // com o dropdown multi-seleção. Antes o clique descartava a seleção inteira
  // e ficava impossível combinar dois status pelos cards.
  const toggleStatusCard = (filterKey: string) =>
    setStatusFilter(prev => prev.includes(filterKey) ? prev.filter(s => s !== filterKey) : [...prev, filterKey]);
  const toggleFoco = (key: string) =>
    setFocoFilter(prev => prev.includes(key) ? prev.filter(f => f !== key) : [...prev, key]);

  const activeFilterCount =
    statusFilter.length + eventFilter.length + sponsorFilter.length +
    typeFilter.length + dateFilter.length + focoFilter.length + (searchTerm ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;
  const clearAllFilters = () => {
    setStatusFilter([]); setEventFilter([]); setSponsorFilter([]);
    setTypeFilter([]); setDateFilter([]); setFocoFilter([]);
    setSearchTerm(""); setSearchInput("");
  };

  return {
    urlParams, searchRef,
    searchInput, setSearchInput, searchTerm, setSearchTerm,
    statusFilter, setStatusFilter, eventFilter, setEventFilter,
    sponsorFilter, setSponsorFilter, typeFilter, setTypeFilter,
    dateFilter, setDateFilter, focoFilter, setFocoFilter,
    mostrarFinalizados, setMostrarFinalizados,
    toggleStatusCard, toggleFoco, activeFilterCount, hasActiveFilters, clearAllFilters,
  };
}

/** Os filtros da tela, como a página os repassa às seções. */
export type FiltrosDoPainel = ReturnType<typeof useFiltrosDoPainel>;
