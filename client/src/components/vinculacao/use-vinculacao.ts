// ─────────────────────────────────────────────────────────────────────────────
// useVinculacao — o ESTADO e as DERIVAÇÕES da tela: filtros (com a URL), as
// queries, os três mapas de vínculo (rascunho, salvo, mudanças pendentes), a
// seleção, e tudo que se calcula a partir disso — lista visível, facetas,
// contagens, frase de resolução e os grupos da tabela.
//
// As AÇÕES (mutações e handlers) moram em useAcoesDaVinculacao, que recebe o
// que este hook devolve.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useMemo, useRef, useDeferredValue } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AuditLog } from "@shared/schema";
import { ehMolde } from "@shared/molde";
import { useAuth } from "@/contexts/auth-context";
import { TOM, T } from "@/lib/theme";
import { isEventoFinalizado, todayBusinessMs } from "@/lib/status";
import { CHAVE_DA_VINCULACAO, VAZIO, VINCULACAO_VISIBLE_STATUSES } from "./constantes";
import { getItemUIStatus, ordenarParaLeitura } from "./regras";
import type {
  Agrupamento, ComoJson, ContagemPorEstado, EventoDaVinculacao, GrupoDaLista, ItemChanges,
  OpcaoDeFiltro, PatrocinadorDaVinculacao, PecaDaVinculacao, PecaPadrao, UIStatus,
} from "./tipos";

export function useVinculacao() {
  // Estado para dialog de detalhes do item
  const [selectedItemForDetails, setSelectedItemForDetails] = useState<PecaDaVinculacao | null>(null);

  // Estados de filtro — inicializam da URL (link compartilhável, padrão da
  // casa como painel-geral/eventos), com fallback do sessionStorage para o
  // filtro de evento (comportamento antigo de navegar e voltar).
  const initParams = useRef(new URLSearchParams(window.location.search)).current;
  const listParam = (k: string) => { const v = initParams.get(k); return v ? v.split(",").filter(Boolean) : []; };
  // O campo mostra o que se digita na hora; filtros, contagens e a tabela leem
  // o valor ADIADO. Cada tecla recalculava as facetas e redesenhava a tabela
  // inteira antes de o caractere aparecer no campo.
  const [buscaDigitada, setSearchQuery] = useState(initParams.get("q") ?? "");
  const searchQuery = useDeferredValue(buscaDigitada);
  const [eventFilter, setEventFilter] = useState<string[]>(() => {
    const fromUrl = listParam("ev");
    if (fromUrl.length) return fromUrl;
    try { return JSON.parse(sessionStorage.getItem("vincular:eventFilter") || "[]"); } catch { return []; }
  });
  useEffect(() => { sessionStorage.setItem("vincular:eventFilter", JSON.stringify(eventFilter)); }, [eventFilter]);
  const [sponsorFilter, setSponsorFilter] = useState<string[]>(() => listParam("sp"));
  const [itemFilter, setItemFilter] = useState<string[]>(() => listParam("tp"));
  const [statusFilter, setStatusFilter] = useState<string[]>(() => listParam("st"));

  // Estado local para rastrear mudanças pendentes
  const [pendingChanges, setPendingChanges] = useState<Record<string, ItemChanges>>({});
  const [itemSponsorsMap, setItemSponsorsMap] = useState<Record<string, string[]>>({});
  // Os vínculos SALVOS no banco — é deles que saem filtros e facetas.
  const [originalSponsorsMap, setOriginalSponsorsMap] = useState<Record<string, string[]>>({});

  // Estados para seleção em lote
  const { user } = useAuth();
  // ACRESCENTAR patrocinador depois do envio: admin e solicitação (decisão do
  // dono). O servidor confere o mesmo — aqui o botão SOME em vez de existir
  // para dar 403.
  const podeAcrescentar = user?.role === "admin" || user?.role === "solicitacao";
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // ── AGRUPAMENTO, não visão ───────────────────────────────────────────────
  //
  // Eram duas ABAS — "Por Item" e "Por Patrocinador" —, e por isso duas
  // árvores de JSX quase completas com a mesma informação e conjuntos de ação
  // DIFERENTES. Agrupar é a operação de verdade: a tabela é a mesma, muda o
  // cabeçalho do grupo e o escopo dos chips.
  //
  // O parâmetro de URL continua sendo `view` e ainda entende os dois valores
  // antigos — link salvo por alguém não pode deixar de abrir.
  const [agrupamento, setAgrupamento] = useState<Agrupamento>(() => {
    const v = initParams.get("view");
    return v === "patrocinador" || v === "por-patrocinador" ? "patrocinador" : "evento";
  });

  // Blocos (evento ou grupo de patrocinador) com todas as linhas visíveis
  const [showAllRows, setShowAllRows] = useState<Set<string>>(new Set());

  // Cabeçalhos de tipo fechados, por `${grupo}:${tipo}`.
  const [tiposColapsados, setTiposColapsados] = useState<Set<string>>(new Set());

  // Filtros e aba refletidos na URL via replaceState (não polui o histórico)
  useEffect(() => {
    const p = new URLSearchParams();
    if (searchQuery) p.set("q", searchQuery);
    if (eventFilter.length) p.set("ev", eventFilter.join(","));
    if (sponsorFilter.length) p.set("sp", sponsorFilter.join(","));
    if (itemFilter.length) p.set("tp", itemFilter.join(","));
    if (statusFilter.length) p.set("st", statusFilter.join(","));
    if (agrupamento !== "evento") p.set("view", agrupamento);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, [searchQuery, eventFilter, sponsorFilter, itemFilter, statusFilter, agrupamento]);

  // Atalho "/" foca a busca (padrão da casa). Mora aqui, e não na barra de
  // filtros, porque vale também enquanto a tela carrega ou está vazia.
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // isLoading dos eventos também gateia o spinner: visibleItems exige o evento
  // no eventById — se /api/items resolvesse antes de /api/events, a tela
  // piscava o vazio "Nada para vincular agora" até os eventos chegarem.
  //
  // E ela vem PRIMEIRO por um segundo motivo: é dela que sai o recorte por
  // evento da lista de peças, logo abaixo.
  const { data: rawEvents = VAZIO, isLoading: eventsLoading, isError: eventsError, refetch: refetchEvents } = useQuery<EventoDaVinculacao[]>({
    queryKey: ["/api/events"],
  });

  // ── O RECORTE POR EVENTO ─────────────────────────────────────────────────
  // `visibleItems`, logo abaixo, já descarta toda peça de evento FINALIZADO —
  // e em produção a maioria dos eventos já passou, com quase todas as peças
  // entregues penduradas neles. Era esse acervo que descia pela rede para ser
  // jogado fora na segunda linha de um useMemo.
  //
  // Os ids vão ORDENADOS: a chave da query é o texto da URL, e uma ordem que
  // dançasse a cada render viraria uma busca nova por render. O conjunto só
  // muda quando um evento é encerrado, criado ou vira o dia — e aí uma busca
  // nova é exatamente o que se quer.
  const eventosEmJogo = useMemo(() => {
    const hoje = todayBusinessMs();
    return rawEvents
      .filter((e) => !isEventoFinalizado(e, hoje))
      .map((e) => e.id)
      .sort();
  }, [rawEvents]);
  const chaveDaVinculacao = useMemo(
    () => [CHAVE_DA_VINCULACAO[0], `${CHAVE_DA_VINCULACAO[1]}&eventId=${eventosEmJogo.join(",")}`] as const,
    [eventosEmJogo],
  );
  const { data: items = VAZIO, isLoading: itemsLoading, isError: itemsError, refetch: refetchItems } = useQuery<PecaDaVinculacao[]>({
    queryKey: chaveDaVinculacao,
    // Sem evento em jogo não há nada para vincular — e `?eventId=` vazio seria
    // um 400 do servidor (a validação exige de 1 a 500 ids).
    enabled: eventosEmJogo.length > 0,
  });

  // Histórico DA PEÇA aberta no dialog de detalhes, com escopo no servidor.
  // A listagem global tem teto de 500 registros — peça antiga caía fora da
  // janela e a ficha mostrava "sem histórico". E só roda com a ficha aberta,
  // em vez de baixar a trilha inteira no load da página.
  const { data: auditLogs = [] } = useQuery<ComoJson<AuditLog>[]>({
    queryKey: ["/api/audit-logs", "item", selectedItemForDetails?.id],
    queryFn: () =>
      fetch(`/api/audit-logs?entityType=item&entityId=${selectedItemForDetails!.id}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`Falha ao carregar o histórico (HTTP ${r.status})`))),
    select: d => (Array.isArray(d) ? d : []),
    enabled: !!selectedItemForDetails?.id,
    placeholderData: [],
  });

  const { data: sponsors = VAZIO, isError: sponsorsError, refetch: refetchSponsors } = useQuery<PatrocinadorDaVinculacao[]>({
    queryKey: ["/api/sponsors"],
  });
  const { data: standardItems = [] } = useQuery<PecaPadrao[]>({ queryKey: ['/api/standard-items'] });
  const typeToGroup = useMemo(() => {
    const map: Record<string, string> = {};
    standardItems.forEach((s) => { if (s.group) map[s.name] = s.group; });
    return map;
  }, [standardItems]);

  // "Hoje" do NEGÓCIO (dia-calendário em São Paulo). Uma âncora só para a tela
  // inteira: a lista de eventos e o recorte de peças precisam virar o dia no
  // mesmo instante, senão o evento sai de um e fica no outro.
  const hojeBusinessMs = todayBusinessMs();

  // Eventos que ainda estão em jogo, pelo predicado único — mesma virada de
  // dia do recorte de peças logo abaixo e da Gestão de Prazos no servidor.
  // Evento encerrado à mão sai daqui; evento SEM data de início APARECE — sem
  // data não há "já passou", e é o cadastro que precisa de conserto.
  const events = useMemo(
    () => rawEvents.filter(event => !isEventoFinalizado(event, hojeBusinessMs)),
    [rawEvents, hojeBusinessMs],
  );

  // Lookup O(1) de evento por id — evita rawEvents.find() dentro de loops de
  // filtro (que era O(nº itens × nº eventos) e pesava com muitos itens).
  const eventById = useMemo(() => {
    const m = new Map<string, EventoDaVinculacao>();
    rawEvents.forEach(e => m.set(e.id, e));
    return m;
  }, [rawEvents]);

  // Mostrar apenas items de eventos ainda em jogo, com status que permitem
  // vinculação de patrocinadores. Exclui: draft e requested (Rascunho — ainda
  // não enviado pela Solicitação).
  const visibleItems = useMemo(() => {
    return items.filter(item => {
      // Filtro 1: Status permitido (exclui draft)
      if (!VINCULACAO_VISIBLE_STATUSES.includes(item.status)) return false;
      // MOLDE não passa pela Vinculação — não aparece nesta fila.
      if (ehMolde(item)) return false;

      const event = eventById.get(item.eventId);
      if (!event) return false;

      // Filtro 2: evento FINALIZADO sai desta fila — encerrado à mão OU com a
      // DATA DO EVENTO (events.startDate, não a saída do caminhão) já passada.
      // Vale também para peça pendente de vínculo: um atalho que a deixava
      // sempre à vista furava este recorte, e a peça de um evento antigo
      // continuava sendo cobrada aqui.
      //
      // É o mesmo predicado, a mesma virada de dia (São Paulo) e a mesma regra
      // que o servidor usa na Gestão de Prazos — e o dia do evento continua
      // contando (a comparação é `>`). Evento SEM data de início não é
      // finalizado: continua aqui.
      if (isEventoFinalizado(event, hojeBusinessMs)) return false;

      return true;
    });
  }, [items, eventById, hojeBusinessMs]);

  // Determinar quais items são editáveis (baseado no status UI)
  const getItemEditability = (item: PecaDaVinculacao) => {
    const originalSponsors = originalSponsorsMap[item.id] || [];
    const pendingChange = pendingChanges[item.id];
    const uiStatus = getItemUIStatus(item, originalSponsors, pendingChange);
    // Items enviados não podem ser editados
    return uiStatus !== 'ENVIADO';
  };

  // Agrupar items por evento
  const itemsByEvent = useMemo(() => {
    const grouped: Record<string, PecaDaVinculacao[]> = {};
    visibleItems.forEach(item => {
      if (!grouped[item.eventId]) {
        grouped[item.eventId] = [];
      }
      grouped[item.eventId].push(item);
    });
    return grouped;
  }, [visibleItems]);

  // Função helper para filtrar items (aplicada tanto na lógica de filtros quanto no render)
  const filterItems = (eventItems: PecaDaVinculacao[], eventName?: string) => {
    return eventItems.filter(item => {
      // Filtro de busca (tipo ou descrição do item, ou nome do evento)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const typeMatch = item.type.toLowerCase().includes(query);
        const descMatch = item.description?.toLowerCase().includes(query) || false;
        const eventMatch = eventName?.toLowerCase().includes(query) || false;

        // Item passa se corresponder tipo, descrição, OU se o evento corresponder
        if (!typeMatch && !descMatch && !eventMatch) {
          return false;
        }
      }

      // Filtro por tipo de item
      if (itemFilter.length > 0 && !itemFilter.includes(item.type)) {
        return false;
      }

      // Filtro por patrocinador (usar dados SALVOS, não locais)
      if (sponsorFilter.length > 0) {
        const savedSponsors = originalSponsorsMap[item.id] || [];
        if (!sponsorFilter.some(sf => savedSponsors.includes(sf))) {
          return false;
        }
      }

      // Filtro por status UI (PENDENTE/RASCUNHO/PRONTO/ENVIADO)
      if (statusFilter.length > 0) {
        const originalSponsors = originalSponsorsMap[item.id] || [];
        const pendingChange = pendingChanges[item.id];
        const uiSt = getItemUIStatus(item, originalSponsors, pendingChange);
        if (!statusFilter.includes(uiSt)) return false;
      }

      return true;
    });
  };

  // Aplicar filtros
  const filteredEventEntries = useMemo(() => {
    const entries = Object.entries(itemsByEvent);

    return entries.filter(([eventId, eventItems]) => {
      const event = eventById.get(eventId);
      if (!event) return false;

      // Filtro por evento específico
      if (eventFilter.length > 0 && !eventFilter.includes(eventId)) {
        return false;
      }

      // Filtrar items usando a função helper
      const filteredItems = filterItems(eventItems, event.name);

      // Se não há items que passaram no filtro, ocultar o evento
      return filteredItems.length > 0;
    });
  }, [itemsByEvent, eventById, searchQuery, eventFilter, sponsorFilter, itemFilter, statusFilter, originalSponsorsMap, pendingChanges]);

  const temFiltroAtivo = !!searchQuery || eventFilter.length > 0 || sponsorFilter.length > 0
                       || itemFilter.length > 0 || statusFilter.length > 0;

  // ===== FONTE ÚNICA DE VERDADE: Computar estados UI de todos os items =====
  const itemUIStates = useMemo(() => {
    const states: Record<string, UIStatus> = {};
    visibleItems.forEach(item => {
      const originalSponsors = originalSponsorsMap[item.id] || [];
      const pendingChange = pendingChanges[item.id];
      states[item.id] = getItemUIStatus(item, originalSponsors, pendingChange);
    });
    return states;
  }, [visibleItems, originalSponsorsMap, pendingChanges]);

  // Auto-deselect de quem saiu dos estados selecionáveis (ex: após salvar).
  //
  // A lista de estados que ficam marcados tem de ser a MESMA do
  // `podeSelecionar` da linha. Quando ENVIADO virou selecionável para o
  // "Acrescentar", este efeito — escrito quando enviada não era marcável —
  // continuou desmarcando ENVIADO no render seguinte ao clique: a pessoa
  // marcava 12 peças e o diálogo dizia "0 peças selecionadas".
  useEffect(() => {
    setSelectedItemIds(prev => {
      const next = new Set<string>();
      prev.forEach(id => {
        const st = itemUIStates[id] || 'PENDENTE';
        if (st === 'PENDENTE' || st === 'RASCUNHO' || (st === 'ENVIADO' && podeAcrescentar)) {
          next.add(id);
        }
      });
      return next.size === prev.size ? prev : next;
    });
  }, [itemUIStates, podeAcrescentar]);

  // Items visíveis respeitando o eventFilter (para contadores de contexto e ações em lote)
  const contextVisibleItems = useMemo(() => {
    if (eventFilter.length === 0) return visibleItems;
    return visibleItems.filter(item => eventFilter.includes(item.eventId));
  }, [visibleItems, eventFilter]);

  // Opções dos filtros facetadas: só o que existe na lista, aplicando o OUTRO
  // filtro ativo, com contagem por opção.
  const eventFilterOptions = useMemo(() => {
    const DOT: Record<string, string> = { urgente: TOM.perigo.dot, urgent: TOM.perigo.dot, alta: T.accent, media: TOM.alerta.dot, baixa: TOM.info.dot };
    const map = new Map<string, OpcaoDeFiltro>();
    visibleItems
      // originalSponsorsMap (o que está SALVO), igual à filtragem em
      // fullyFilteredItems — com itemSponsorsMap (rascunho local) a opção
      // aparecia com contagem > 0 e, selecionada, retornava zero linhas.
      .filter(i => sponsorFilter.length === 0 || (originalSponsorsMap[i.id] ?? []).some(sf => sponsorFilter.includes(sf)))
      .forEach(i => {
        if (!i.eventId) return;
        const cur = map.get(i.eventId);
        if (cur) cur.count++;
        else {
          const ev = eventById.get(i.eventId);
          map.set(i.eventId, { value: i.eventId, label: ev?.name || 'Sem evento', count: 1, dotColor: ev?.priority ? DOT[ev.priority] : undefined });
        }
      });
    return Array.from(map.values());
  }, [visibleItems, sponsorFilter, originalSponsorsMap, eventById]);

  const sponsorFilterOptions = useMemo(() => {
    const byId = new Map(sponsors.map((s) => [s.id, s]));
    const map = new Map<string, OpcaoDeFiltro>();
    // originalSponsorsMap pela mesma razão do filtro de eventos acima.
    contextVisibleItems.forEach(i => (originalSponsorsMap[i.id] ?? []).forEach((sid: string) => {
      const cur = map.get(sid);
      if (cur) cur.count++;
      else {
        const s = byId.get(sid);
        map.set(sid, { value: sid, label: s?.name || sid, count: 1, dotColor: s?.color || TOM.info.dot });
      }
    }));
    return Array.from(map.values());
  }, [contextVisibleItems, originalSponsorsMap, sponsors]);

  // Itens que passam em TODOS os filtros ativos (usado no bloco de progresso)
  const fullyFilteredItems = useMemo(() => {
    return contextVisibleItems.filter(item => {
      const event = eventById.get(item.eventId);
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!item.type.toLowerCase().includes(q) &&
            !(item.description?.toLowerCase().includes(q)) &&
            !(event?.name?.toLowerCase().includes(q))) return false;
      }
      if (itemFilter.length > 0 && !itemFilter.includes(item.type)) return false;
      if (sponsorFilter.length > 0) {
        const saved = originalSponsorsMap[item.id] || [];
        if (!sponsorFilter.some(sf => saved.includes(sf))) return false;
      }
      if (statusFilter.length > 0) {
        const orig = originalSponsorsMap[item.id] || [];
        const pc = pendingChanges[item.id];
        if (!statusFilter.includes(getItemUIStatus(item, orig, pc))) return false;
      }
      return true;
    });
  }, [contextVisibleItems, eventById, searchQuery, itemFilter, sponsorFilter, statusFilter, originalSponsorsMap, pendingChanges]);

  // Opções de Peça e de Status, COM contagem, e só do que existe na fila. O
  // pool de cada um exclui o próprio filtro e aplica todos os outros, como
  // manda a invariante de server/__tests__/faceta-lista-invariante.test.ts.
  const poolSemDimensao = (ignorar: "tipo" | "status") =>
    contextVisibleItems.filter(item => {
      const event = eventById.get(item.eventId);
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!item.type.toLowerCase().includes(q) &&
            !(item.description?.toLowerCase().includes(q)) &&
            !(event?.name?.toLowerCase().includes(q))) return false;
      }
      if (ignorar !== "tipo" && itemFilter.length > 0 && !itemFilter.includes(item.type)) return false;
      if (sponsorFilter.length > 0) {
        const saved = originalSponsorsMap[item.id] || [];
        if (!sponsorFilter.some(sf => saved.includes(sf))) return false;
      }
      if (ignorar !== "status" && statusFilter.length > 0) {
        const orig = originalSponsorsMap[item.id] || [];
        const pc = pendingChanges[item.id];
        if (!statusFilter.includes(getItemUIStatus(item, orig, pc))) return false;
      }
      return true;
    });

  const itemFilterOptions = useMemo(() => {
    const conta = new Map<string, number>();
    poolSemDimensao("tipo").forEach(i => conta.set(i.type, (conta.get(i.type) ?? 0) + 1));
    return Array.from(conta.entries()).map(([t, count]) => ({ value: t, label: t, count }));
  }, [contextVisibleItems, eventById, searchQuery, sponsorFilter, statusFilter, originalSponsorsMap, pendingChanges]);

  // ── AS DUAS CONTAGENS, e o papel de cada uma ─────────────────────────────
  //
  // `contagemPorEstado` sai do pool SEM a dimensão status — é a contagem de
  // FACETA. Ela alimenta a barra segmentada, os quatro chips e a frase de
  // resolução: o número ao lado de um filtro tem de ser o número de linhas
  // que o clique entrega. Se saísse de fullyFilteredItems, clicar em
  // "Pendente" zeraria os outros três chips e a barra viraria um bloco só.
  //
  // `contextStatusCounts` continua saindo de fullyFilteredItems porque serve a
  // outra coisa: o botão "Enviar N para Arte" AGE sobre as peças filtradas, e
  // a contagem dele tem de ser a do que vai de fato sair.
  const contagemPorEstado = useMemo<ContagemPorEstado>(() => {
    const c = { PENDENTE: 0, RASCUNHO: 0, PRONTO: 0, ENVIADO: 0 };
    poolSemDimensao("status").forEach(i => {
      const st = getItemUIStatus(i, originalSponsorsMap[i.id] || [], pendingChanges[i.id]);
      c[st]++;
    });
    return c;
  }, [contextVisibleItems, eventById, searchQuery, itemFilter, sponsorFilter, originalSponsorsMap, pendingChanges]);

  const totalDoContexto = contagemPorEstado.PENDENTE + contagemPorEstado.RASCUNHO
                        + contagemPorEstado.PRONTO + contagemPorEstado.ENVIADO;

  // ── A FRASE DE RESOLUÇÃO ─────────────────────────────────────────────────
  //
  // O que a pessoa quer saber ao abrir a tela é O QUE FAZER AGORA, e a
  // resposta é sempre uma só — a primeira coisa da fila. A precedência é a do
  // fluxo: vincular vem antes de salvar, que vem antes de enviar.
  const fraseDeResolucao = (() => {
    const { PENDENTE: pend, RASCUNHO: rasc, PRONTO: pron } = contagemPorEstado;
    const pecas = (n: number) => `${n} ${n === 1 ? "peça" : "peças"}`;
    if (pend > 0) {
      const base = `${pecas(pend)} ainda ${pend === 1 ? "não tem" : "não têm"} patrocinador`;
      return rasc > 0
        ? `${base} e ${rasc} ${rasc === 1 ? "rascunho espera" : "rascunhos esperam"} ser ${rasc === 1 ? "salvo" : "salvos"}.`
        : `${base}.`;
    }
    if (rasc > 0) return `${rasc} ${rasc === 1 ? "rascunho espera" : "rascunhos esperam"} ser ${rasc === 1 ? "salvo" : "salvos"} antes do envio à Arte.`;
    if (pron > 0) return `Tudo vinculado. ${pecas(pron)} ${pron === 1 ? "pronta" : "prontas"} para enviar à Arte.`;
    return "Tudo enviado à Arte. Nada pendente nesta tela.";
  })();

  const alternarStatus = (estado: string) =>
    setStatusFilter(prev => prev.includes(estado) ? prev.filter(v => v !== estado) : [...prev, estado]);

  const contextStatusCounts = useMemo<ContagemPorEstado>(() => {
    const counts = { RASCUNHO: 0, PRONTO: 0, ENVIADO: 0, PENDENTE: 0 };
    fullyFilteredItems.forEach(item => {
      const status = itemUIStates[item.id] || 'PENDENTE';
      counts[status]++;
    });
    return counts;
  }, [fullyFilteredItems, itemUIStates]);

  // IDs já processados — evita overwrite de updates otimistas durante mutations
  const loadedItemIdsRef = useRef(new Set<string>());

  // Preencher os mapas de patrocinadores a partir dos dados que JÁ vêm no
  // payload de /api/items (item.sponsors), sem uma requisição por peça: com
  // muitos itens, centenas de GETs paralelos travavam a tela.
  useEffect(() => {
    if (itemsLoading || items.length === 0) return;

    const newEntries: Record<string, string[]> = {};
    const newOriginals: Record<string, string[]> = {};
    let hasNew = false;

    for (const item of items) {
      // Pula itens já processados para não sobrescrever updates otimistas.
      if (loadedItemIdsRef.current.has(item.id)) continue;
      const sponsorIds = Array.isArray(item.sponsors)
        ? item.sponsors.map((s) => s.id).filter(Boolean)
        : [];
      newEntries[item.id] = sponsorIds;
      newOriginals[item.id] = sponsorIds;
      loadedItemIdsRef.current.add(item.id);
      hasNew = true;
    }

    if (!hasNew) return;

    // MERGE — nunca substitui entradas já existentes (preserva updates otimistas)
    setItemSponsorsMap(prev => ({ ...newEntries, ...prev }));
    setOriginalSponsorsMap(prev => ({ ...newOriginals, ...prev }));
  }, [items, itemsLoading]);

  // Normalizar patrocinadores do evento (event.sponsors é array de objetos relation)
  const eventSponsorMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    rawEvents.forEach(event => {
      if (event.sponsors && Array.isArray(event.sponsors)) {
        map[event.id] = event.sponsors.map((rel) => rel.sponsorId);
      } else {
        map[event.id] = [];
      }
    });
    return map;
  }, [rawEvents]);

  const getEventSponsors = (eventId: string) => {
    const sponsorIds = eventSponsorMap[eventId] || [];
    return sponsors.filter(sponsor => sponsorIds.includes(sponsor.id));
  };

  // Progresso do grupo: sempre pelos dados SALVOS no banco (originalSponsorsMap),
  // não pelo rascunho local — rascunho é o selo "Rascunho", não progresso.
  const getItemStatus = (item: PecaDaVinculacao) => {
    const savedSponsors = originalSponsorsMap[item.id] || [];
    const savedSkipApproval = item.skipApproval || false;
    if (savedSkipApproval) return 'skip';
    if (savedSponsors.length > 0) return 'linked';
    return 'pending';
  };

  const calculateProgress = (eventItems: PecaDaVinculacao[]) => {
    const completed = eventItems.filter(item => {
      const status = getItemStatus(item);
      return status === 'linked' || status === 'skip';
    }).length;
    return { completed, total: eventItems.length };
  };

  // ── OS GRUPOS DA LISTA ───────────────────────────────────────────────────
  //
  // Um derivado só para os dois agrupamentos. O grupo por patrocinador traz
  // TODAS as peças do evento — a operação que traz alguém aqui é justamente
  // passar de "sem a marca" para "com a marca", e o chip marcado é que diz
  // quais já a têm. A ordem de leitura (ordenarParaLeitura) vale nos dois: é
  // ela que faz o cabeçalho de tipo da fila agrupar de verdade.
  const gruposDaLista = useMemo<GrupoDaLista[]>(() => {
    if (agrupamento === 'evento') {
      return filteredEventEntries.map(([eventId, eventItems]) => {
        const event = eventById.get(eventId)!;
        const itens = ordenarParaLeitura(filterItems(eventItems, event.name), typeToGroup);
        const progresso = calculateProgress(itens);
        return { chave: eventId, event, itens, vinculadas: progresso.completed, total: progresso.total };
      });
    }

    const out: GrupoDaLista[] = [];
    for (const [eventId, eventItems] of Object.entries(itemsByEvent)) {
      if (eventFilter.length > 0 && !eventFilter.includes(eventId)) continue;
      const event = eventById.get(eventId);
      if (!event) continue;
      const itens = ordenarParaLeitura(filterItems(eventItems, event.name), typeToGroup);
      if (itens.length === 0) continue;
      const doEvento = getEventSponsors(eventId)
        .filter(sp => sponsorFilter.length === 0 || sponsorFilter.includes(sp.id));
      for (const sponsor of doEvento) {
        const vinculadas = itens.filter(i => (itemSponsorsMap[i.id] ?? []).includes(sponsor.id)).length;
        out.push({ chave: `${eventId}:${sponsor.id}`, event, sponsor, itens, vinculadas, total: itens.length });
      }
    }
    return out;
  }, [agrupamento, filteredEventEntries, itemsByEvent, eventById, eventFilter, sponsorFilter,
      itemSponsorsMap, originalSponsorsMap, pendingChanges, searchQuery, itemFilter, statusFilter,
      eventSponsorMap, sponsors, typeToGroup]);

  return {
    // filtros
    buscaDigitada, setSearchQuery, searchQuery, searchInputRef,
    eventFilter, setEventFilter, sponsorFilter, setSponsorFilter,
    itemFilter, setItemFilter, statusFilter, setStatusFilter, alternarStatus, temFiltroAtivo,
    agrupamento, setAgrupamento, showAllRows, setShowAllRows, tiposColapsados, setTiposColapsados,
    // dados
    rawEvents, events, eventById, items, sponsors, auditLogs,
    itemsLoading, eventsLoading, itemsError, eventsError, sponsorsError,
    refetchItems, refetchEvents, refetchSponsors,
    // vínculos e seleção
    itemSponsorsMap, setItemSponsorsMap, originalSponsorsMap, setOriginalSponsorsMap,
    pendingChanges, setPendingChanges, loadedItemIdsRef,
    selectedItemIds, setSelectedItemIds, podeAcrescentar,
    selectedItemForDetails, setSelectedItemForDetails,
    // derivações
    visibleItems, itemUIStates, fullyFilteredItems, eventFilterOptions, sponsorFilterOptions,
    itemFilterOptions, contagemPorEstado, totalDoContexto, fraseDeResolucao, contextStatusCounts,
    gruposDaLista, getEventSponsors, getItemEditability,
  };
}

export type Vinculacao = ReturnType<typeof useVinculacao>;
