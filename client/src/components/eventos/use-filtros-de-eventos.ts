// Os filtros da tela de Eventos: nascem da URL e são espelhados nela (mesmo
// padrão do Painel Geral: F5 não perde o estado e o link filtrado é
// compartilhável).
import { useEffect, useMemo, useRef, useState } from "react";
import { LEGACY_LIFECYCLE } from "./regras";
import type { DensidadeDaLista, OrdemDosEventos } from "./tipos";

export function useFiltrosDeEventos() {
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  // Busca com DEBOUNCE: `searchInput` acompanha a digitação; `searchTerm` (o
  // que filtra e vai para a URL) só alcança 200ms depois. Sem isso, cada tecla
  // refiltrava e reordenava a grade inteira — e escrevia um replaceState, o
  // padrão que a casa já documentou como causa de SecurityError no Safari
  // (~100 chamadas/30s derrubam a árvore React) em gestao-prazos.tsx:575.
  const [searchInput, setSearchInput] = useState(() => urlParams.get("busca") ?? "");
  const [searchTerm, setSearchTerm] = useState(() => urlParams.get("busca") ?? "");
  // `closed_with_pending` → `realizado` na leitura: um link salvo com o nome
  // antigo continua abrindo o mesmo recorte (e a URL se corrige sozinha no
  // próximo espelhamento) em vez de virar um filtro que não casa com nada.
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>(
    () => (urlParams.get("prioridade")?.split(",").filter(Boolean) ?? [])
      .map((v) => LEGACY_LIFECYCLE[v] ?? v),
  );
  const [selectedSponsorFilter, setSelectedSponsorFilter] = useState<string[]>(
    () => (urlParams.get("patrocinador")?.split(",").filter(Boolean)) ?? [],
  );
  const [next10DaysFilter, setNext10DaysFilter] = useState(() => urlParams.get("proximos") === "1");
  const [monthFilter, setMonthFilter] = useState<string>(() => urlParams.get("mes") ?? "all");
  // "Ocultar concluídos" nasce LIGADO: a visão padrão é o que ainda tem
  // trabalho. Só esconde os ARCHIVED_LIFECYCLES — "Realizado com pendências"
  // continua visível, e em âmbar, porque ainda há o que fechar.
  // Na URL o parâmetro diz o CONTRÁRIO (`concluidos=1` = mostrar), para que o
  // estado padrão continue sendo a URL limpa.
  const [showCompleted, setShowCompleted] = useState(() => urlParams.get("concluidos") === "1");
  // Chips de foco do cabeçalho (sugestão 7 do relatório).
  const [foco, setFoco] = useState<string>(() => urlParams.get("foco") ?? "");

  // ── ORDEM ────────────────────────────────────────────────────────────────
  //
  // `sortedEvents` sempre ordenou por risco e depois pela saída do caminhão.
  // É a ordem certa — e a tela nunca a disse: ninguém entendia por que um
  // evento era o terceiro, e não havia como pedir outro critério. Uma ordem
  // que a pessoa não consegue nomear ela lê como aleatória, e passa a varrer
  // a lista inteira toda vez em vez de confiar no topo.
  const [ordem, setOrdem] = useState<OrdemDosEventos>(() => {
    const v = urlParams.get("ordem");
    return v === "marco" || v === "nome" ? v : "saida";
  });

  // ── SITUAÇÃO ─────────────────────────────────────────────────────────────
  //
  // O mesmo eixo vivia em TRÊS lugares: o FilterSelect "Prioridade e situação"
  // (que misturava PRIORITY com LIFECYCLE_FILTERS), o botão "Ocultar
  // concluídos", e os chips do cabeçalho. O código chegava a DESABILITAR o
  // botão quando o filtro pedia uma situação — `explicitLifecycleFilter` era
  // a confissão de que dois controles disputavam a mesma decisão.
  //
  // Três alternadores que PARTICIONAM: cada evento cai num balde só, e a soma
  // das contagens fecha com o total. Alternadores e não radios — radios
  // prometem exclusão mútua, e aqui a pessoa combina baldes.
  //
  // Padrão: SÓ Ativos. "Pendências" é `realizado` — evento cujo caminhão já
  // saiu e ainda tem peça em aberto. Ele não é arquivo (sobrou trabalho, e
  // por isso ARCHIVED_LIFECYCLES não o inclui), mas também não é o que a
  // pessoa abre a tela para ver: com ele ligado por padrão, os três
  // primeiros cartões da grade eram "REALIZADO COM PENDÊNCIAS · Saiu há
  // 14d", e o evento que embarca amanhã ficava abaixo da dobra. Pedido do
  // dono: realizados ocultos por padrão, a um clique no alternador.
  const [situacoes, setSituacoes] = useState<Set<string>>(() => {
    const v = urlParams.get("situacao");
    if (v) return new Set(v.split(",").filter(Boolean));
    return new Set(["ativos"]);
  });
  const alternarSituacao = (chave: string) => setSituacoes((prev) => {
    const n = new Set(prev);
    n.has(chave) ? n.delete(chave) : n.add(chave);
    return n;
  });

  // ── DENSIDADE ────────────────────────────────────────────────────────────
  //
  // O cartão tem sete blocos e ~440px de altura; com 50 eventos a varredura é
  // longa. A lista não substitui o cartão — responde outra pergunta: "onde
  // está o evento X" em vez de "como está o evento X".
  const [densidade, setDensidade] = useState<DensidadeDaLista>(() => {
    const v = urlParams.get("densidade");
    return v === "lista" ? "lista" : "cartoes";
  });

  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  // URL espelhada com 300ms de atraso — ver comentário do debounce acima.
  useEffect(() => {
    const timer = setTimeout(() => {
      const p = new URLSearchParams();
      if (searchTerm) p.set("busca", searchTerm);
      if (selectedPriorities.length) p.set("prioridade", selectedPriorities.join(","));
      if (selectedSponsorFilter.length) p.set("patrocinador", selectedSponsorFilter.join(","));
      if (next10DaysFilter) p.set("proximos", "1");
      if (monthFilter !== "all") p.set("mes", monthFilter);
      if (showCompleted) p.set("concluidos", "1");
      if (foco) p.set("foco", foco);
      if (ordem !== "saida") p.set("ordem", ordem);
      // A situação só entra quando difere do padrão (ativos+pendências), para
      // o link continuar curto no caso comum.
      const sit = Array.from(situacoes).sort().join(",");
      if (sit !== "ativos,pendencias") p.set("situacao", sit);
      if (densidade !== "cartoes") p.set("densidade", densidade);
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, selectedPriorities, selectedSponsorFilter, next10DaysFilter, monthFilter, showCompleted, foco, ordem, situacoes, densidade]);

  // Atalho "/" foca a busca (paridade com o Painel Geral).
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

  const clearAllEventFilters = () => {
    setSearchInput(""); setSearchTerm(""); setSelectedPriorities([]); setSelectedSponsorFilter([]);
    setNext10DaysFilter(false); setMonthFilter("all"); setFoco("");
  };

  return {
    searchInput, setSearchInput, searchTerm, setSearchTerm,
    selectedPriorities, setSelectedPriorities,
    selectedSponsorFilter, setSelectedSponsorFilter,
    next10DaysFilter, setNext10DaysFilter,
    monthFilter, setMonthFilter,
    showCompleted, setShowCompleted,
    foco, setFoco,
    ordem, setOrdem,
    situacoes, setSituacoes, alternarSituacao,
    densidade, setDensidade,
    searchRef, clearAllEventFilters,
  };
}

export type FiltrosDeEventos = ReturnType<typeof useFiltrosDeEventos>;
