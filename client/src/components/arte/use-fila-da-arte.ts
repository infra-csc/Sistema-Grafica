// ─────────────────────────────────────────────────────────────────────────────
// A FILA DA ARTE — as queries e tudo o que se deriva delas: as peças em jogo
// (sem evento finalizado), os baldes por aba, as contagens, as facetas de
// cada filtro e a lista ordenada da aba aberta.
//
// Cada contagem de opção de filtro é, por construção, o número de linhas que
// aquele clique entrega (a regra travada em faceta-lista-invariante).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { isEventoFinalizado } from "@/lib/status";
import { compareDisplayId } from "@/lib/displayId";
import { toUTCDisplayDate } from "@/lib/utils";
import { T, TOM } from "@/lib/theme";
import {
  ARTE_POOL_STATUSES,
  TAB_STATUSES,
  PERIOD_FILTERS,
  compareEventUrgency,
  dentroDaJanelaFinalizados,
  filtrarAtrasadasDaFase,
  isUrgente,
  matchesArteFilters,
  phaseDeadline,
  type ArteFilters,
  type ArteSortMode,
  type DateBounds,
} from "@/lib/arte-rules";
import { ehBookCompleto } from "@shared/fluxo-peca";
import { prazoDoMolde } from "@shared/prazo-molde";
import { spDayMs } from "@shared/prazo-dates";
import { CHAVE_DAS_FILAS_DA_ARTE, CHAVE_DOS_FINALIZADOS, SEM_DADOS, estaParada, months } from "./constantes";
import type {
  EventoDaPeca, ModeloDoCatalogo, OpcaoDeFiltro, PatrocinadorDaPeca, PecaDaArte, PecaDaCorrecao, RegistroDeAuditoria,
} from "./tipos";

export type FilaDaArte = ReturnType<typeof useFilaDaArte>;

export function useFilaDaArte({
  filters, eventFilter, sponsorFilter, typeFilter, materialFilter, monthFilter, paradasFilter,
  activeTab, finalizadosTudo, sortMode, agora, dateBounds, selectedItemId,
}: {
  filters: ArteFilters;
  eventFilter: string[];
  sponsorFilter: string[];
  typeFilter: string[];
  materialFilter: string[];
  monthFilter: string[];
  paradasFilter: boolean;
  activeTab: string;
  finalizadosTudo: boolean;
  sortMode: ArteSortMode;
  /** O tique de 10 min da página — a âncora de "hoje" de toda a tela. */
  agora: number;
  dateBounds: DateBounds;
  selectedItemId: string | null;
}) {
  const hoje = dateBounds.today;

  // A lista de eventos vem PRIMEIRO porque é dela que sai o recorte por evento
  // das duas listas de peças.
  const { data: events = SEM_DADOS, isLoading: eventsLoading } = useQuery<EventoDaPeca[]>({
    queryKey: ["/api/events"],
  });

  // ── O RECORTE POR EVENTO ─────────────────────────────────────────────────
  // `allItems`, logo abaixo, já descarta toda peça de evento FINALIZADO — e em
  // produção a maioria dos 68 eventos já passou, com quase todas as 3.105
  // peças entregues penduradas neles. Era esse acervo que descia pela rede
  // para ser jogado fora na primeira linha de um useMemo.
  //
  // Os ids vão ORDENADOS: a chave da query é o texto da URL, e uma ordem que
  // dançasse a cada render viraria uma busca nova por render. O conjunto só
  // muda quando um evento é encerrado, criado ou vira o dia.
  const eventosEmJogo = useMemo(() => {
    const hoje = spDayMs(new Date());
    return events
      .filter((e) => !isEventoFinalizado(e, hoje))
      .map((e) => e.id)
      .sort();
  }, [events]);
  const porEvento = eventosEmJogo.length > 0 ? `&eventId=${eventosEmJogo.join(",")}` : "";
  const chaveDasFilas = useMemo(
    () => [CHAVE_DAS_FILAS_DA_ARTE[0], `${CHAVE_DAS_FILAS_DA_ARTE[1]}${porEvento}`] as const,
    [porEvento],
  );
  const chaveDosFinalizados = useMemo(
    () => [CHAVE_DOS_FINALIZADOS[0], `${CHAVE_DOS_FINALIZADOS[1]}${porEvento}`] as const,
    [porEvento],
  );
  // Sem evento em jogo não há fila nenhuma — e `?eventId=` vazio seria um 400
  // (a validação do servidor exige de 1 a 500 ids).
  const temFila = eventosEmJogo.length > 0;

  const { data: pecasDasFilas = SEM_DADOS, isLoading: filasLoading, isError, error, refetch } = useQuery<PecaDaArte[]>({
    queryKey: chaveDasFilas,
    enabled: temFila,
  });
  const {
    data: pecasFinalizadas = SEM_DADOS,
    isLoading: finalizadosLoading,
    isError: finalizadosIsError,
    refetch: refetchFinalizados,
  } = useQuery<PecaDaArte[]>({ queryKey: chaveDosFinalizados, enabled: temFila });
  // A silhueta cobre a espera pelos EVENTOS também: sem eles não há recorte, e
  // mostrar "nada na fila" enquanto a lista de eventos desce seria afirmar o
  // contrário do que a tela vai mostrar meio segundo depois.
  const isLoading = eventsLoading || filasLoading;
  // As duas listas como UMA, que é o que o resto da tela sempre viu.
  //
  // DEDUPLICA POR ID mesmo os recortes sendo disjuntos por construção (eles não
  // compartilham status nenhum). Uma peça em dobro aqui não daria erro: daria
  // contagem de aba dobrada, linha repetida na tabela e seleção em lote
  // contando duas vezes a mesma peça — o tipo de defeito que só se descobre
  // olhando. O custo é uma passada por Map, e só quando as duas listas
  // existem; enquanto os Finalizados não chegaram, é a própria lista das filas.
  const pecasDoServidor = useMemo(() => {
    if (pecasFinalizadas.length === 0) return pecasDasFilas;
    if (pecasDasFilas.length === 0) return pecasFinalizadas;
    const porId = new Map<string, PecaDaArte>();
    for (const p of pecasDasFilas) porId.set(p.id, p);
    for (const p of pecasFinalizadas) if (!porId.has(p.id)) porId.set(p.id, p);
    return Array.from(porId.values());
  }, [pecasDasFilas, pecasFinalizadas]);

  const {
    data: correcaoDoServidor = SEM_DADOS,
    isLoading: correcaoLoading,
    isError: correcaoIsError,
    error: correcaoError,
    refetch: refetchCorrecao,
  } = useQuery<PecaDaCorrecao[]>({
    queryKey: ["/api/items/resubmission-needed"],
  });

  // ── Evento FINALIZADO sai das filas ───────────────────────────────────────
  // Duas origens, um gate só (`motivoEventoFinalizado`, @shared/prazo-dates):
  //   · "encerrado" → um admin clicou em Encerrar evento. A confirmação promete,
  //     em voz alta, que o evento "sai da Gestão de Prazos e das filas".
  //   · "realizado" → a DATA DO EVENTO (events.startDate — não a saída do
  //     caminhão, que é sempre anterior) já passou. Regra do dono: não se
  //     trabalha mais em evento que já aconteceu. Durante o DIA do evento a
  //     peça ainda aparece; ela sai depois da virada do dia em São Paulo.
  //     Evento SEM data de início nunca some por esta regra.
  //
  // O recorte é do CLIENTE e não de /api/items: o Detalhe do Evento e o Painel
  // Geral leem a MESMA chave e a lista de peças precisa continuar aparecendo lá
  // — a Arte é tela de AÇÃO, aqueles são registro.
  //
  // `item.event` vem CRU do storage (nunca passa por enrichEvent), então o
  // status chega como "closed" e a data como `startDate` — as duas colunas que
  // o predicado lê.
  const hojeBusinessMs = useMemo(() => spDayMs(new Date(agora)), [agora]);
  const allItems = useMemo(
    // BOOK COMPLETO fica de fora: é o trâmite do Atendimento, não uma peça
    // (ver shared/fluxo-peca). A CORREÇÃO não passa por aqui (vem de
    // /api/items/resubmission-needed): reprovada, a peça-book continua com
    // porta de reenvio da v2.
    () => pecasDoServidor.filter((i) => !isEventoFinalizado(i.event, hojeBusinessMs) && !ehBookCompleto(i)),
    [pecasDoServidor, hojeBusinessMs],
  );
  // AUDITORIA 27/08: mapa id→peça para os pontos que buscavam com
  // allItems.find dentro de map/filter — seleção de 200 peças sobre ~1.000
  // itens eram 200.000 comparações por render do painel de lote.
  const itemPorId = useMemo(() => {
    const m = new Map<string, PecaDaArte>();
    for (const i of allItems) m.set(i.id, i);
    return m;
  }, [allItems]);
  const correcaoItems = useMemo(
    () => correcaoDoServidor.filter((i) => !isEventoFinalizado(i.event, hojeBusinessMs)),
    [correcaoDoServidor, hojeBusinessMs],
  );
  /**
   * A peça aberta no modal é DERIVADA da lista viva, não uma cópia congelada
   * guardada no clique. Com a cópia, trocar o thumb não repintava a miniatura,
   * o bloco "versão anterior guardada" nunca aparecia, e se outra pessoa
   * movesse a peça os blocos de ação continuavam desenhados pelo status velho
   * (o envio devolvia 409 com a chave em inglês no toast).
   */
  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null;
    // Mesma precedência do `[...allItems, ...correcaoItems].find` de antes (a
    // lista principal primeiro), sem copiar 5 mil peças num array novo a cada
    // atualização da lista só para achar uma.
    return itemPorId.get(selectedItemId)
      ?? correcaoItems.find((i) => i.id === selectedItemId)
      ?? null;
  }, [selectedItemId, itemPorId, correcaoItems]);

  // Histórico DA PEÇA aberta, com escopo no servidor. A versão anterior
  // baixava a listagem GLOBAL, que tem teto de 500 registros — com o volume
  // atual, os logs das peças mais antigas saíam da janela e a ficha mostrava
  // só "Criado", como se a peça não tivesse história ("itens sem histórico",
  // bug reportado pelo dono com print). O escopo devolve a trilha inteira da
  // peça, e barata.
  const { data: auditLogs = [] } = useQuery<RegistroDeAuditoria[]>({
    queryKey: ["/api/audit-logs", "item", selectedItem?.id],
    queryFn: () =>
      fetch(`/api/audit-logs?entityType=item&entityId=${selectedItem!.id}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`Falha ao carregar o histórico (HTTP ${r.status})`))),
    select: d => (Array.isArray(d) ? d : []),
    enabled: !!selectedItem?.id,
    placeholderData: [],
  });
  const { data: standardItems = SEM_DADOS } = useQuery<ModeloDoCatalogo[]>({ queryKey: ['/api/standard-items'] });
  // Resolve o grupo pai (do catálogo de Modelos) para um item, tolerante a
  // maiúscula/acento/espaço. Casa o type do item tanto com o NOME de um modelo
  // (name → group) quanto diretamente com um NOME DE GRUPO do catálogo — assim
  // itens importados da planilha (ex.: type "Rolo") caem no grupo "ROLO".
  const normKey = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const groupMaps = useMemo(() => {
    const byName: Record<string, string> = {};
    const byGroup: Record<string, string> = {};
    standardItems.forEach((s) => {
      if (s.group) {
        byName[normKey(s.name)] = s.group;
        byGroup[normKey(s.group)] = s.group; // recupera a grafia canônica do grupo
      }
    });
    return { byName, byGroup };
  }, [standardItems]);
  // Cache por TIPO: a ordenação da fila chama groupOf duas vezes por
  // comparação, e `normKey` faz normalize("NFD") + três regex. Com 3 mil peças
  // em Finalizados eram ~70 mil normalizações por ordenação; os tipos distintos
  // são poucas dezenas. O cache nasce de novo quando o catálogo muda.
  const grupoPorTipo = useMemo(() => new Map<string, string>(), [groupMaps]);
  // Estável (useCallback): a fila e a Correção são memoizadas e recebem esta
  // função como prop — uma identidade nova por render desfaria a fronteira.
  const groupOf = useCallback((type: string): string => {
    const guardado = grupoPorTipo.get(type);
    if (guardado !== undefined) return guardado;
    const k = normKey(type);
    const grupo = groupMaps.byName[k] || groupMaps.byGroup[k] || "";
    grupoPorTipo.set(type, grupo);
    return grupo;
  }, [grupoPorTipo, groupMaps]);

  const uniqueSponsors = useMemo(() => {
    const map = new Map<string, PatrocinadorDaPeca>();
    allItems.forEach((item) => (item.sponsors ?? []).forEach((s) => { if (!map.has(s.id)) map.set(s.id, s); }));
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [allItems]);

  // Eventos que JÁ têm book publicado. Quem está nesta lista e não tem bookUrl
  // ficou de fora do book — ver o selo "Fora do book" na coluna Peça.
  const eventosComBook = useMemo(
    () => new Set<string>(allItems.filter((i) => i.bookUrl && i.eventId).map((i) => i.eventId)),
    [allItems],
  );

  // Itens da fase/aba atual, sem aplicar os filtros de dropdown. É a base das
  // opções de filtro: assim cada filtro lista só o que existe naquela fase, e
  // escolher um filtro não esvazia as opções dos outros.
  const tabPoolItems = useMemo(() => {
    if (activeTab === "correcao") return correcaoItems;
    const allowed = TAB_STATUSES[activeTab]; // mesma fonte única das abas
    return allowed ? allItems.filter((i) => allowed.includes(i.status)) : allItems;
  }, [allItems, correcaoItems, activeTab]);

  // Filtros facetados: as opções de cada filtro são calculadas aplicando os
  // OUTROS filtros ativos. Assim escolher um evento reduz os patrocinadores,
  // tipos e materiais àquele evento (e as contagens acompanham a página), sem
  // que um filtro esvazie a si mesmo.
  const facetPool = (exclude: 'event' | 'sponsor' | 'type' | 'material') =>
    tabPoolItems.filter((i) => {
      if (exclude !== 'event' && eventFilter.length > 0 && !eventFilter.includes(i.eventId)) return false;
      if (exclude !== 'sponsor' && sponsorFilter.length > 0 && !(i.sponsors ?? []).some((s) => sponsorFilter.includes(s.id))) return false;
      if (exclude !== 'type' && typeFilter.length > 0 && !typeFilter.includes(i.type)) return false;
      if (exclude !== 'material' && materialFilter.length > 0 && !materialFilter.includes(i.material)) return false;
      return true;
    });

  const facetDeps = [tabPoolItems, eventFilter, sponsorFilter, typeFilter, materialFilter];

  const eventFilterOptions = useMemo(() => {
    const C: Record<string, string> = { urgent: TOM.perigo.dot, urgente: TOM.perigo.dot, alta: T.accent, media: TOM.alerta.dot, baixa: TOM.info.dot };
    const map = new Map<string, { value: string; label: string; count: number; dotColor?: string }>();
    facetPool('event').forEach((i) => {
      if (!i.eventId) return;
      const cur = map.get(i.eventId);
      if (cur) cur.count++;
      else map.set(i.eventId, { value: i.eventId, label: i.event?.name || 'Sem evento', count: 1, dotColor: C[i.event?.priority ?? ""] });
    });
    return Array.from(map.values());
  }, facetDeps);

  const sponsorFilterOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    facetPool('sponsor').forEach((i) => (i.sponsors ?? []).forEach((s) => {
      const cur = map.get(s.id);
      if (cur) cur.count++;
      else map.set(s.id, { value: s.id, label: s.name, count: 1 });
    }));
    return Array.from(map.values());
  }, facetDeps);

  const countBy = (key: 'type' | 'material') => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    facetPool(key).forEach((i) => {
      const v = i[key];
      if (!v) return;
      const cur = map.get(v);
      if (cur) cur.count++;
      else map.set(v, { value: v, label: v, count: 1 });
    });
    return Array.from(map.values());
  };
  const typeFilterOptions = useMemo(() => countBy('type'), facetDeps);
  const materialFilterOptions = useMemo(() => countBy('material'), facetDeps);

  // Aplica os filtros uma única vez e separa por aba. As contagens saem do
  // .length de cada balde; só a aba aberta paga o custo da ordenação.
  //
  // "Base" = tudo MENOS o recorte de atrasadas: o marco depende da fase, que só
  // existe depois do balde. É desta base que sai a contagem exibida no próprio
  // controle "Prazo" — número que precisa continuar valendo depois de clicado.
  const itemsByTabBase = useMemo(() => {
    const buckets: Record<string, PecaDaArte[]> = {
      "criar-aprovacoes": [], "aguardando-patrocinador": [],
      "finalizar-layouts": [], "finalizados": [],
    };
    for (const item of allItems) {
      if (!matchesArteFilters(item, filters, dateBounds)) continue;
      for (const tab in buckets) {
        if (TAB_STATUSES[tab].includes(item.status)) { buckets[tab].push(item); break; }
      }
    }
    // Recorte temporal padrão da aba Finalizados: ela acumula produzido,
    // conferido e entregue e nunca para de crescer. 90 dias por saída do
    // caminhão mantém a aba útil como conferência recente; "ver tudo" está a
    // um clique no cabeçalho da aba.
    if (!finalizadosTudo) {
      buckets["finalizados"] = buckets["finalizados"].filter(i => dentroDaJanelaFinalizados(i, hoje));
    }
    return buckets;
  }, [allItems, filters, finalizadosTudo, dateBounds, hoje]);

  const itemsByTabSemParadas = useMemo(() => {
    if (!filters.atrasado) return itemsByTabBase;
    const out: Record<string, PecaDaArte[]> = {};
    for (const tab in itemsByTabBase) out[tab] = filtrarAtrasadasDaFase(itemsByTabBase[tab], tab, hoje);
    return out;
  }, [itemsByTabBase, filters.atrasado, hoje]);
  // O recorte "paradas" entra por último, e a contagem do chip que o liga sai
  // da camada ANTERIOR — é o que faz o número do chip ser exatamente o de
  // linhas que o clique entrega (invariante das facetas).
  const itemsByTab = useMemo(() => {
    if (!paradasFilter) return itemsByTabSemParadas;
    const out: Record<string, PecaDaArte[]> = {};
    for (const tab in itemsByTabSemParadas) out[tab] = itemsByTabSemParadas[tab].filter((i) => estaParada(i, hoje));
    return out;
  }, [itemsByTabSemParadas, paradasFilter, hoje]);
  const paradasNaAba = useMemo(
    () => (itemsByTabSemParadas[activeTab] ?? []).filter((i) => estaParada(i, hoje)).length,
    [itemsByTabSemParadas, activeTab, hoje],
  );
  // Mesma invariante para "urgentes": o número do atalho tem de ser o de
  // linhas que o clique entrega, e não o do conjunto já recortado.
  const urgentesNaAba = useMemo(
    () => (itemsByTabBase[activeTab] ?? []).filter((i) => isUrgente(i.event?.priority)).length,
    [itemsByTabBase, activeTab],
  );

  // Quantas peças a janela de 90 dias está escondendo (para o rótulo do "ver tudo").
  const finalizadosForaDaJanela = useMemo(() => {
    // Com "só atrasadas" ligado a aba Finalizados fica vazia por definição (o
    // marco dela é a própria saída); anunciar "N peças mais antigas fora do
    // recorte" ali seria contar o que nenhum clique traz de volta.
    if (finalizadosTudo || filters.atrasado) return 0;
    let n = 0;
    for (const item of allItems) {
      if (!TAB_STATUSES["finalizados"].includes(item.status)) continue;
      if (!matchesArteFilters(item, filters, dateBounds)) continue;
      if (!dentroDaJanelaFinalizados(item, hoje)) n++;
    }
    return n;
  }, [allItems, filters, finalizadosTudo, dateBounds, hoje]);

  const filteredItems = useMemo(() => {
    const list = itemsByTab[activeTab] ?? [];
    // Um Collator reutilizado é bem mais rápido que localeCompare por comparação.
    const cmp = new Intl.Collator('pt-BR');
    return [...list].sort((a, b) => {
      // PEÇA PRIORITÁRIA fura a fila (dono, 27/08): vem antes de qualquer
      // régua — inclusive do prazo. É a peça que a Solicitação marcou para a
      // Arte atacar primeiro.
      // KIT SEMPRE EM CIMA (dono, 15/09): as peças do Kit antes das da Arena.
      const kit = Number(!!b.kitRemessaId) - Number(!!a.kitRemessaId);
      if (kit !== 0) return kit;
      const prio = Number(!!b.isPriority) - Number(!!a.isPriority);
      if (prio !== 0) return prio;
      // Ordenar por PRAZO reordena os blocos inteiros (a lista é agrupada por
      // evento): o evento com o marco da fase mais próximo sobe para o topo.
      // É o que transforma "lista organizada por evento" em "fila de trabalho".
      if (sortMode === "prazo") {
        // O molde com prazo do molde entra na fila pelo PRÓPRIO prazo (22/09);
        // as demais peças, pelo marco da fase do evento — como sempre.
        const pa = prazoDoMolde(a, a.event, hoje), pb = prazoDoMolde(b, b.event, hoje);
        if (pa || pb) {
          const da = pa ?? phaseDeadline(a.event, activeTab, hoje);
          const db = pb ?? phaseDeadline(b.event, activeTab, hoje);
          if (da && db && da.date.getTime() !== db.date.getTime()) return da.date.getTime() - db.date.getTime();
          if (da && !db) return -1;
          if (!da && db) return 1;
        }
        const u = compareEventUrgency(a.event, b.event, activeTab, hoje);
        if (u !== 0) return u;
      }
      const eA = a.event?.name || '', eB = b.event?.name || '';
      if (eA !== eB) return cmp.compare(eA, eB);
      // Cada remessa do Kit junta, num bloco só.
      const rA = a.kitRemessaId || '', rB = b.kitRemessaId || '';
      if (rA !== rB) return cmp.compare(rA, rB);
      const gA = groupOf(a.type) || '', gB = groupOf(b.type) || '';
      if (gA !== gB) return cmp.compare(gA, gB);
      // compareDisplayId, não replace(/\D/g,''): o complemento "#0062-C1"
      // virava 621 e caía a centenas de linhas da peça de que ele nasceu.
      return compareDisplayId(a.displayId, b.displayId);
    });
  }, [itemsByTab, activeTab, groupMaps, sortMode, hoje]);

  const pendingCount = itemsByTab["criar-aprovacoes"].length;
  const aguardandoCount = itemsByTab["aguardando-patrocinador"].length;
  const needsFinalFileCount = itemsByTab["finalizar-layouts"].length;
  const finalizadosCount = itemsByTab["finalizados"].length;
  // Mesmo predicado das outras abas: antes esta contagem só conhecia evento,
  // tipo, material, patrocinador e busca — ligar "Saída 10 dias" acendia o chip
  // e devolvia a lista inteira.
  const correcaoBase = useMemo(
    () => correcaoItems.filter(item => matchesArteFilters(item, filters, dateBounds)),
    [correcaoItems, filters, dateBounds],
  );
  const correcaoFiltrados = useMemo(
    () => (filters.atrasado ? filtrarAtrasadasDaFase(correcaoBase, "correcao", hoje) : correcaoBase),
    [correcaoBase, filters.atrasado, hoje],
  );
  const correcaoCount = correcaoFiltrados.length;

  // Quantas peças da ABA ATIVA estão atrasadas contra o marco da própria fase.
  // Sai da base (sem o recorte de atraso aplicado) para que o número no
  // controle seja o mesmo antes e depois de ligá-lo. Uma passada por aba, com
  // a âncora estável de "hoje" — nada disso é recalculado por linha da tabela.
  const atrasadasNaAba = useMemo(() => {
    const base = activeTab === "correcao" ? correcaoBase : (itemsByTabBase[activeTab] ?? []);
    return filtrarAtrasadasDaFase(base, activeTab, hoje).length;
  }, [itemsByTabBase, correcaoBase, activeTab, hoje]);

  // ── OPÇÕES DOS RECORTES DE UMA DIMENSÃO SÓ ────────────────────────────────
  // Período, mês, prazo, prioridade, thumb e arquivo final eram faixa de botões
  // e segmentados MUDOS: nenhum dizia quantas peças cada opção entrega. "Hoje"
  // num dia sem saída nenhuma era indistinguível de "Hoje" com quarenta, e "sem
  // arquivo final" só revelava o tamanho do problema depois de clicado.
  //
  // `poolSemDimensao` é o mesmo desenho do `facetPool` de evento/tipo/material,
  // estendido ao que mora FORA de `matchesArteFilters`: o balde da aba, a
  // janela de 90 dias dos Finalizados e o recorte de atrasadas. Com isso a
  // contagem de cada opção é, por construção, o número de linhas que aquele
  // clique entrega — a regra travada em faceta-lista-invariante.
  //
  // `filtrarAtrasadasDaFase` é item a item, então comuta com os demais e pode
  // ser aplicado antes de contar.
  // BASE COMUM das sete contagens abaixo. Cada opção chamava matchesArteFilters
  // sobre o balde inteiro da aba (3 mil peças em Finalizados) — nove passadas
  // a cada tecla da busca. O predicado é um E de dimensões independentes, e
  // valor neutro não restringe nada: filtrar UMA vez com as dimensões de
  // uma-só-opção neutras e depois aplicar o filtro completo sobre essa base dá
  // exatamente o mesmo conjunto — só que as nove passadas correm sobre o que
  // já sobrou da busca/evento/tipo.
  const baseDasDimensoes = useMemo(() => {
    const neutro: ArteFilters = { ...filters, period: "Todos", months: [], urgente: false, thumb: "todos", final: "todos", next10Days: false };
    return tabPoolItems.filter((i) => matchesArteFilters(i, neutro, dateBounds));
  }, [filters, tabPoolItems, dateBounds]);

  const poolSemDimensao = useCallback((patch: Partial<ArteFilters>): PecaDaArte[] => {
    const f = { ...filters, ...patch };
    let lista = baseDasDimensoes.filter((i) => matchesArteFilters(i, f, dateBounds));
    if (activeTab === "finalizados" && !finalizadosTudo) {
      lista = lista.filter((i) => dentroDaJanelaFinalizados(i, hoje));
    }
    if (f.atrasado) lista = filtrarAtrasadasDaFase(lista, activeTab, hoje);
    if (paradasFilter) lista = lista.filter((i) => estaParada(i, hoje));
    return lista;
  }, [filters, baseDasDimensoes, dateBounds, activeTab, finalizadosTudo, hoje, paradasFilter]);

  // Uma passada POR JANELA, e não um agrupamento único: as janelas são
  // cumulativas e se contêm ("7 dias" inclui "Hoje"), então não existe balde
  // que sirva para todas. Mesmo desenho do Período dos Registros.
  // `pinned` segura a ordem cronológica de PERIOD_FILTERS — o FilterSelect
  // ordena alfabeticamente e sem isto sairia "15 dias, 30 dias, 7 dias, Hoje".
  const periodFilterOptions = useMemo(
    () => PERIOD_FILTERS.filter(p => p !== "Todos").map(p => ({
      value: p as string,
      label: p as string,
      count: poolSemDimensao({ period: p }).length,
      pinned: true,
    })),
    [poolSemDimensao],
  );

  // Mês da SAÍDA DO CAMINHÃO. `?mes=` existia na URL e no chip desde sempre e
  // não tinha gatilho nenhum na tela: só entrava por link e só saía pelo X do
  // chip. Aqui o menu é uma passada só — os meses são baldes exclusivos — e
  // mês sem peça nenhuma não é oferecido (a não ser que já esteja escolhido,
  // senão o próprio recorte ativo sumiria da lista).
  const monthFilterOptions = useMemo(() => {
    const contagem = new Map<string, number>();
    poolSemDimensao({ months: [] }).forEach((i) => {
      const dep = i.event?.truckDepartureDate;
      if (!dep) return;
      const m = (toUTCDisplayDate(dep).getMonth() + 1).toString();
      contagem.set(m, (contagem.get(m) ?? 0) + 1);
    });
    return months
      .filter(m => m.value !== "all")
      .map(m => ({ value: m.value, label: m.label, count: contagem.get(m.value) ?? 0, pinned: true }))
      .filter(o => o.count > 0 || monthFilter.includes(o.value));
  }, [poolSemDimensao, monthFilter]);

  // Prazo tem UMA opção só ("Só atrasadas") porque o estado neutro é a linha
  // "Todos" que o próprio menu desenha — oferecer "todas" duas vezes seria
  // duas maneiras de dizer a mesma coisa no mesmo painel.
  const prazoFilterOptions = useMemo(
    () => [{ value: "atrasados", label: "Só atrasadas", count: atrasadasNaAba }],
    [atrasadasNaAba],
  );

  const prioridadeFilterOptions = useMemo(
    () => [{
      value: "urgentes",
      label: "Só urgentes",
      count: poolSemDimensao({ urgente: true }).length,
    }],
    [poolSemDimensao],
  );

  // Thumb e arquivo final: um pool só por dimensão, dois recortes contados dele.
  const thumbFilterOptions = useMemo(() => {
    const pool = poolSemDimensao({ thumb: "todos" });
    const com = pool.filter((i) => !!i.approvalThumbUrl).length;
    return [
      { value: "com", label: "Só com thumb", count: com },
      { value: "sem", label: "Só sem thumb", count: pool.length - com },
    ];
  }, [poolSemDimensao]);

  const finalFilterOptions = useMemo(() => {
    const pool = poolSemDimensao({ final: "todos" });
    const com = pool.filter((i) => !!i.finalFileUrl).length;
    return [
      { value: "com", label: "Só com arquivo final", count: com },
      { value: "sem", label: "Só sem arquivo final", count: pool.length - com },
    ];
  }, [poolSemDimensao]);

  // O atalho também diz quantas peças entrega antes de ser clicado — ele é um
  // recorte como os outros, só que com nome próprio (job 8 do vocabulário).
  const saida10Count = useMemo(
    () => poolSemDimensao({ next10Days: true }).length,
    [poolSemDimensao],
  );

  // ── Pool de itens para exportação ────────────────────────────────────────
  const arteItemsPool = useMemo(() =>
    [...allItems.filter((i) => ARTE_POOL_STATUSES.includes(i.status)), ...correcaoItems],
    [allItems, correcaoItems]
  );

  return {
    events, eventsLoading, isLoading, isError, error, refetch,
    finalizadosLoading, finalizadosIsError, refetchFinalizados,
    pecasDoServidor, correcaoLoading, correcaoIsError, correcaoError, refetchCorrecao,
    allItems, itemPorId, correcaoItems, selectedItem, auditLogs, groupMaps, groupOf,
    uniqueSponsors, eventosComBook, arteItemsPool,
    eventFilterOptions, sponsorFilterOptions, typeFilterOptions, materialFilterOptions,
    itemsByTab, paradasNaAba, urgentesNaAba, finalizadosForaDaJanela, filteredItems,
    pendingCount, aguardandoCount, needsFinalFileCount, finalizadosCount,
    correcaoFiltrados, correcaoCount, atrasadasNaAba,
    periodFilterOptions, monthFilterOptions, prazoFilterOptions, prioridadeFilterOptions,
    thumbFilterOptions, finalFilterOptions, saida10Count,
  };
}
