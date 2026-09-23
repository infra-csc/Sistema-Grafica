// ─── Painel Geral — a composição ────────────────────────────────────────────
// A primeira tela de todos os perfis: todas as peças de todos os eventos,
// com KPIs, filtros e a lista por evento. Os pedaços moram em
// client/src/components/painel/ (seções, linhas memoizadas, hooks de dados e
// de ações, o recorte puro em recorte.ts e os tipos em tipos.ts); aqui fica o
// estado da tela e a ordem em que as seções aparecem.
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { ExportPdfDialog } from "@/components/export-pdf-dialog";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import {
  ComplementoDaFicha,
  temBlocoDeComplemento,
} from "@/components/aumentar-quantidade-dialog";
import { useIsMobile, useElementSize, densityFromWidth, usePonteiroGrosso, type ContentDensity } from "@/hooks/use-mobile";
import { getStatusLabel, motivoEventoFinalizado, todayBusinessMs } from "@/lib/status";
import { chipOcultas } from "@/lib/painel-encerrados";
import { FS, FW, R, T, TOM } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { EstadoErro } from "@/components/ui/estados";
import { PG_CSS } from "@/components/painel/estilos";
import { HORA_MS, STATUS_FILTER_VALUES } from "@/components/painel/regras";
import { retratoDosEventos, calcularRecorte, idadesPorEtapaDe } from "@/components/painel/recorte";
import type { AcoesDaLista, PecaDoPainel, SortCampo, SortDir } from "@/components/painel/tipos";
import { useFiltrosDoPainel } from "@/components/painel/use-filtros-do-painel";
import { usePainelDados } from "@/components/painel/use-painel-dados";
import {
  usePainelMutacoes, copiarLinkDaPeca, copiarIds, baixarPlanilha,
} from "@/components/painel/use-painel-acoes";
import { useOrcamentoDeLinhas } from "@/components/painel/use-orcamento-de-linhas";
import { useVisoesDoPainel } from "@/components/painel/use-visoes-do-painel";
import { CarimboDeFrescor } from "@/components/painel/carimbo-de-frescor";
import { PorOndeComecar, MenuExportar } from "@/components/painel/cabecalho-do-painel";
import { FaixaDeAtencao } from "@/components/painel/faixa-de-atencao";
import { BarraDoFluxo } from "@/components/painel/barra-do-fluxo";
import { CartoesDeStatus } from "@/components/painel/cartoes-de-status";
import { BarraDeFiltros } from "@/components/painel/barra-de-filtros";
import { ChipsDosFiltros } from "@/components/painel/chips-dos-filtros";
import { EsqueletoDaLista, VazioDaLista } from "@/components/painel/estados-da-lista";
import { GrupoDoEvento } from "@/components/painel/grupo-do-evento";
import { SentinelaDeLote } from "@/components/painel/sentinela-de-lote";
import { BarraDeSelecao } from "@/components/painel/barra-de-selecao";
import { AcoesDaFicha } from "@/components/painel/acoes-da-ficha";
import { DialogoDeExclusao } from "@/components/painel/dialogo-de-exclusao";

export default function PainelGeral() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  // Exclusão: admin e solicitação, em QUALQUER status — decisão do dono, mesma
  // regra do event-detail.tsx.
  //
  // O que torna a liberação segura é a natureza da ação: excluir aqui é SOFT
  // delete (grava deletedAt), fica registrado no log de auditoria e a peça
  // continua acessível — e restaurável por admin — na visão "Excluídos". Não é
  // uma porta sem volta, é tirar da listagem. A trava de escalão por status
  // impedia solicitação de apagar até o rascunho que ela mesma tinha acabado de
  // criar (awaiting_submission estava na lista de bloqueio), o que resolvia um
  // risco que não existia e criava um pedido de socorro ao admin por dia.
  //
  // A trava que CONTINUA valendo para todo mundo é a de integridade — peça mãe
  // com complemento vivo — e ela é barrada no servidor com 409, onde tem de
  // ser: é regra de dado, não de papel.
  const canDeleteAny = isAdmin || user?.role === "solicitacao";

  // Busca, filtros e peças ocultas — espelhados na URL (ver o hook).
  const filtros = useFiltrosDoPainel();
  const {
    urlParams, searchTerm, statusFilter, setStatusFilter, eventFilter, sponsorFilter, typeFilter,
    dateFilter, setDateFilter, focoFilter, setFocoFilter, mostrarFinalizados, setMostrarFinalizados,
    toggleStatusCard, toggleFoco, hasActiveFilters,
  } = filtros;

  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<PecaDoPainel | null>(null);
  const [deleteConfirmItemId, setDeleteConfirmItemId] = useState<string | null>(null);
  // Feedback do restaurar: guarda o id em restauração para trocar o ícone
  // daquele botão por um spinner (os outros só ficam desabilitados).
  const [restoringItemId, setRestoringItemId] = useState<string | null>(null);
  const [showExportPDFModal, setShowExportPDFModal] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [showAllKpis, setShowAllKpis] = useState(false);
  // "ciclo" é a porta de entrada do KPI de Ciclo de Entrega da Análise: o
  // número é a MEDIANA de um conjunto, e a pergunta que segue é sempre "quais
  // foram as mais demoradas". Nasce em desc porque ninguém clica ali para ver
  // a mais rápida.
  const [sortBy, setSortBy] = useState<SortCampo>(
    () => (new URLSearchParams(window.location.search).get("ordem") === "ciclo" ? "ciclo" : "displayId"),
  );
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const isMobile = useIsMobile();
  // Alvo pelo PONTEIRO, não pela largura da janela: o tablet do galpão tem
  // 1024px e é dedo — os chips e as abas ficavam em 32/36px, abaixo do mínimo.
  const dedo = usePonteiroGrosso() || isMobile;
  // Densidade pela largura do CONTEÚDO, não da janela: com a sidebar aberta,
  // 1000px de janela deixam ~744px de conteúdo — e era aí que a tabela de 6
  // colunas estourava, dando rolagem horizontal na PÁGINA inteira, em silêncio.
  const { ref: rootRef, width: contentWidth } = useElementSize<HTMLDivElement>();
  const density: ContentDensity = contentWidth === 0
    ? (isMobile ? "cards" : "full")   // antes da 1ª medição: cai no palpite da janela
    : densityFromWidth(contentWidth);
  const useCards = isMobile || density === "cards";
  const isCompact = !useCards && density === "compact";
  // Altura REAL da toolbar sticky — ela quebra linha conforme a largura, e o
  // header de evento e o thead grudam logo abaixo dela. Número fixo aqui
  // esconderia uma camada atrás da outra na primeira quebra.
  const { ref: toolbarRef, height: toolbarH } = useElementSize<HTMLDivElement>();
  const stickyToolbar = !useCards;
  const topOffset = 4 + (stickyToolbar ? toolbarH : 0);

  const showDeleted = statusFilter.includes("deleted");
  const {
    itensDoServidor, items, isLoading, isError, refetch, sponsors, standardItems, auditLogs,
    deletedItems, deletedLoading, deletedError, refetchDeleted, eventoDasPecas, nomeDoEvento,
  } = usePainelDados({ selectedItemId: selectedItem?.id, showDeleted, canDeleteAny, eventFilter });

  // Relógio de IDADE, na hora cheia. As idades ("há 3 dias") são em dias
  // inteiros e as linhas são memoizadas: um "agora" que mudasse a cada render
  // re-renderizaria todas elas. Este só muda uma vez por hora (o setState com
  // o mesmo número é descartado pelo React), então a idade nunca fica mais de
  // uma hora atrasada e a lista não re-renderiza à toa.
  const [relogioIdade, setRelogioIdade] = useState(() => Math.floor(Date.now() / HORA_MS) * HORA_MS);
  useEffect(() => {
    const t = setInterval(() => setRelogioIdade(Math.floor(Date.now() / HORA_MS) * HORA_MS), 60_000);
    return () => clearInterval(t);
  }, []);

  const { restoreItemMutation, deleteItemMutation } = usePainelMutacoes({
    toast, isAdmin, canDeleteAny, setDeleteConfirmItemId, setRestoringItemId, setStatusFilter,
  });

  // `uniqueTypes` saiu: era a lista de tipos do BANCO INTEIRO alimentando o
  // menu de Tipo, sem contagem e sem relação com o recorte da tela. Quem faz
  // isso agora é `typeFilterOptions`, que sai do mesmo pool da lista.
  const typeToGroup = useMemo(() => {
    const map: Record<string, string> = {};
    standardItems.forEach((s) => { if (s.group) map[s.name] = s.group; });
    return map;
  }, [standardItems]);

  // Âncora SEPARADA para o predicado de evento finalizado, e ela é obrigatória:
  // `todayMs` (no recorte) é meia-noite LOCAL do navegador, enquanto o
  // predicado compartilhado (servidor + as cinco filas) roda no dia do negócio
  // em São Paulo. Duas âncoras diferentes fariam o Painel divergir das filas
  // exatamente na virada do dia — o horário em que alguém confere o painel
  // antes do evento. É um número por DIA: como dependência de memo, só muda
  // na virada.
  const hojeNegocioMs = todayBusinessMs();

  // ── Retrato do evento, em memo PRÓPRIO ───────────────────────────────────
  // Morava dentro do memo dos filtros: cada tecla da busca, cada troca de
  // status ou de ordenação criava um Map novo com objetos `meta` novos — e o
  // `memo` de GrupoDoEvento (que recebe `meta` e, por ele, o `selo` que desce
  // a cada linha) nunca pulava grupo nenhum. O retrato só lê `items` e o dia
  // do negócio; é deles que depende.
  const { eventMeta, seloDosEventosVivos } = useMemo(() => retratoDosEventos(items, hojeNegocioMs), [items, hojeNegocioMs]);

  // Filtragem, ordenação, agrupamento e KPIs são recomputados SÓ quando os
  // dados ou filtros mudam — sem o useMemo, cada render (ex.: abrir um modal)
  // refazia filter+sort da lista inteira.
  const { filteredItems, sortedGroupEntries, stats, atencao, ocultas,
          eventFilterOptions, typeFilterOptions, sponsorFilterOptions, dateFilterOptions } = useMemo(() => calcularRecorte({
    eventMeta, seloDosEventosVivos, hojeNegocioMs, items, deletedItems, showDeleted, searchTerm, statusFilter,
    eventFilter, sponsorFilter, typeFilter, dateFilter, focoFilter, mostrarFinalizados, typeToGroup, sortBy,
    sortDir, eventoDasPecas, sponsors,
  }), [eventMeta, seloDosEventosVivos, hojeNegocioMs, items, deletedItems, showDeleted, searchTerm, statusFilter, eventFilter, sponsorFilter, typeFilter, dateFilter, focoFilter, mostrarFinalizados, typeToGroup, sortBy, sortDir, eventoDasPecas, sponsors]);

  // O chip de reversão. Fora do memo de propósito: ele depende de `ocultas`
  // (que vem de lá) mas também do estado do botão, e nada mais.
  const chipOcultasDados = chipOcultas(ocultas, mostrarFinalizados);

  // DO ALERTA À LISTA, sem rolar à mão. No celular, entre o chip de atenção e
  // a primeira peça ficam a barra, os cards e os filtros — tocar em "3 peças
  // reprovadas" filtrava uma lista que estava duas telas abaixo, e nada na
  // tela visível mudava: parecia que o toque não tinha feito nada. Só ao
  // LIGAR o foco e só no layout de cards; no desktop a barra de filtros é
  // sticky e o contador muda à vista. Sem animação para quem pediu menos
  // movimento (a regra global do CSS não alcança o scroll disparado por JS).
  const levarALista = () => {
    if (!useCards) return;
    const semMovimento = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => toolbarRef.current?.scrollIntoView({ block: "start", behavior: semMovimento ? "auto" : "smooth" }));
  };

  // Mudou o recorte, muda a lista: manter grupos expandidos de um filtro
  // anterior deixava um evento com 400 linhas abertas debaixo de uma busca que
  // não tem nada a ver. `expandedEvents` só crescia; agora zera com o filtro.
  useEffect(() => {
    setExpandedEvents(new Set());
    setOpenGroups(new Set());
  }, [searchTerm, statusFilter, eventFilter, sponsorFilter, typeFilter, dateFilter, focoFilter, mostrarFinalizados]);

  // ── Orçamento de linhas montadas (ver LINHAS_INICIAIS) ────────────────────
  // Volta ao inicial quando o RECORTE muda; a chave é o recorte inteiro.
  const chaveDoRecorte = JSON.stringify([searchTerm, statusFilter, eventFilter, sponsorFilter, typeFilter, dateFilter, focoFilter, mostrarFinalizados]);
  const { orcamentoLinhas, crescerOrcamento, pedirProximoLote, planoDaLista } = useOrcamentoDeLinhas({
    chaveDoRecorte, sortedGroupEntries, openGroups, expandedEvents,
  });

  // ── Visões salvas ─────────────────────────────────────────────────────────
  const filtrosAtuais = { status: statusFilter, saida: dateFilter, foco: focoFilter };
  const { visoes, aplicarVisao, visaoPadrao, fixarVisaoPadrao } = useVisoesDoPainel({
    role: user?.role, filtrosAtuais, urlParams, toast, setStatusFilter, setDateFilter, setFocoFilter,
  });

  // ── Deep-link ?peca=<id> ──────────────────────────────────────────────────
  // O event-detail já suporta ?item=; a home, que é de onde se manda o link no
  // WhatsApp, não tinha equivalente. Consumido UMA vez (o param é removido da
  // URL), senão o dialog reabriria a cada re-render e o F5 nunca "esqueceria".
  const pendingDeepLink = useRef<string | null>(urlParams.get("peca"));
  useEffect(() => {
    const id = pendingDeepLink.current;
    if (!id || items.length === 0) return;
    pendingDeepLink.current = null;
    const alvo = items.find((i) => i.id === id || i.displayId === id);
    const p = new URLSearchParams(window.location.search);
    p.delete("peca");
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    if (alvo) {
      // A peça pode estar num evento fora de jogo, que a tela abre ocultando.
      // O link tem de entregar a peça — e, junto, o CONTEXTO: revelar o recorte
      // deixa o chip da faixa marcado, então o usuário vê onde ela estava. Sem
      // isto, o dialog abriria sobre uma lista onde a peça não existe.
      if (motivoEventoFinalizado(alvo.event, todayBusinessMs()) !== null) setMostrarFinalizados(true);
      setSelectedItem(alvo);
    }
    else toast({ title: "Peça não encontrada", description: "O link aponta para uma peça que não está mais nas listagens.", variant: "warning" });
  }, [items, toast]);

  // ── Seleção em lote ───────────────────────────────────────────────────────
  const selecionadas = useMemo(
    () => filteredItems.filter((i) => !i.deletedAt && selectedIds.has(i.id)),
    [filteredItems, selectedIds],
  );

  // ── Exportações ───────────────────────────────────────────────────────────
  // O que sai é sempre o que está na tela: a seleção quando existe, senão o
  // recorte filtrado. Nunca a base inteira, e nunca com peça excluída dentro.
  const itensParaExportar = useMemo(
    () => (selecionadas.length > 0 ? selecionadas : filteredItems).filter((i) => !i.deletedAt),
    [selecionadas, filteredItems],
  );
  const tituloExport = statusFilter.length
    ? `Peças — ${statusFilter.filter(s => s !== "deleted").map(s => getStatusLabel(s)).join(", ") || "Excluídas"}`
    : "Peças";

  const exportarXlsx = async () => {
    if (!itensParaExportar.length) return;
    setExportMenuOpen(false);
    await baixarPlanilha({ itens: itensParaExportar, titulo: tituloExport, toast, setIsExportingXlsx });
  };

  // Ordenação por coluna: mesmo campo alterna a direção; campo novo começa asc.
  const toggleSort = useCallback((campo: SortCampo) => {
    setSortBy(prev => { if (prev === campo) { setSortDir(d => d === "asc" ? "desc" : "asc"); return prev; } setSortDir("asc"); return campo; });
  }, []);

  // ── Ações da lista: UM objeto estável para todos os grupos e linhas ──────
  // Funções novas a cada render derrubariam o memo de cada linha. As que só
  // chamam setState já são estáveis; a de restaurar depende da mutação (objeto
  // novo por render) e por isso lê a versão atual por ref.
  const restaurarPecaRef = useRef<(id: string) => void>(() => {});
  restaurarPecaRef.current = (id: string) => { setRestoringItemId(id); restoreItemMutation.mutate(id); };
  const acoesDaLista = useMemo<AcoesDaLista>(() => ({
    abrir: (item) => setSelectedItem(item),
    alternarSelecao: (id) =>
      setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
    alternarSelecaoDoEvento: (evItems, marcar) =>
      setSelectedIds(prev => {
        const n = new Set(prev);
        for (const i of evItems) { if (i.deletedAt) continue; if (marcar) n.add(i.id); else n.delete(i.id); }
        return n;
      }),
    excluir: (id) => setDeleteConfirmItemId(id),
    restaurar: (id) => restaurarPecaRef.current(id),
    expandir: (key, extra) => {
      setExpandedEvents(prev => { const next = new Set(prev); next.add(key); return next; });
      crescerOrcamento(extra);
    },
    abrirGrupo: (key, extra) => {
      setOpenGroups(prev => { const next = new Set(prev); next.add(key); return next; });
      crescerOrcamento(extra);
    },
    ordenar: toggleSort,
  }), [toggleSort, crescerOrcamento]);

  // Banner da visão Excluídos visível = o motivo do vazio JÁ está explicado em
  // cima. O bloco genérico "Nenhum item corresponde aos filtros ativos" logo
  // abaixo dizia outra coisa (falsa) e era o maior e o único com botão.
  const bannerExcluidosVisivel = showDeleted && (!canDeleteAny || deletedLoading || deletedError);

  const colCount = isCompact ? 5 : 7;

  // Hoje à meia-noite — uma vez por render, não uma por grupo de evento.
  const hojeMs = (() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t.getTime(); })();
  // O "agora" das idades é o `relogioIdade` (hora cheia), UM só para a tela
  // inteira: o chip de peças paradas chamava Date.now() dentro de cada grupo,
  // e dois cabeçalhos do mesmo render podiam medir contra instantes diferentes.

  // Opções do menu de Status, memoizadas (inline, nasciam novas a cada render).
  // Rótulos derivam de lib/status.ts (fonte única) — o hardcoded anterior
  // chamava `requested` de "Rascunho", divergindo dos pills da tabela
  // ("Solicitado").
  const statusOptions = useMemo(() => [
    ...STATUS_FILTER_VALUES.map((value) => ({ value, label: getStatusLabel(value), pinned: true })),
    ...(canDeleteAny ? [{ value: "deleted", label: "Excluídos", pinned: true }] : []),
  ], [canDeleteAny]);

  // Idades por etapa da barra do fluxo, numa passada só e memoizada.
  const idadesPorEtapa = useMemo(() => idadesPorEtapaDe(filteredItems, relogioIdade), [filteredItems, relogioIdade]);

  // Sem dado nenhum por falha: cards e frase de fila mostrariam o mesmo zero
  // falso que o travessão resolve na carga.
  const falhouSemDados = isError && itensDoServidor.length === 0;

  return (
    <div
      ref={rootRef}
      /* flexShrink 0 — e a raiz PRECISA disso, senao ela encolhe.

         Esta raiz e flex ITEM do <main>, que e `flex-direction: column`. Com
         `flex: 0 1 auto` (o padrao), o flex-SHRINK de 1 autoriza o navegador
         a comprimi-la ate o tamanho do container quando o conteudo e maior.
         Medido: a caixa ficava em 609,6px enquanto o conteudo pedia 1224.
         `minHeight: 100%` nao salva — ele resolve contra a altura do <main>,
         que e justamente 610.

         Quem paga e a barra de filtros: `sticky` so gruda DENTRO da caixa do
         pai, e com a caixa do tamanho da janela ela nao tinha alcance nenhum.
         Rolando a lista a barra saia da tela (medida em y -78), e quem estava
         no meio de 3.187 pecas perdia busca, filtros e visoes salvas
         justamente quando mais precisa deles.

         Tentei antes com `alignSelf: flex-start` e NAO funcionou, por um
         motivo que so a medicao mostrou: em container `column` o align-self
         governa o eixo CRUZADO, que ali e a largura. Estava mexendo no eixo
         errado. Com flexShrink 0 a raiz vai a 1262px e a barra fica em y 68 —
         os dois numeros medidos no navegador antes deste commit. */
      style={{ position: "relative", display: "flex", flexDirection: "column", flexShrink: 0, gap: 22, padding: useCards ? "0 12px 20px" : "0 28px 34px", minHeight: "100%", background: T.bg }}
    >
      {/* SEM overflowY no wrapper: quem rola é o <main> do layout. Um
          overflow:auto aqui criava um scroll-container que NÃO rola
          (min-height 100%) e prendia todo position:sticky descendente. */}
      <style>{PG_CSS}</style>
      <div style={{ position: "sticky", top: 0, zIndex: 4, height: 4, margin: useCards ? "0 -12px" : "0 -28px", background: `linear-gradient(90deg, ${T.text} 0%, ${T.text} 72%, ${T.accent} 72%, ${T.accent} 100%)` }} />

      {/* ── Header ──
          O subtítulo é a fila de quem lê (o estado), o frescor vem ao lado
          dele, e a frase de escopo mora no "Como ler este painel" da barra do
          fluxo. O data-testid do título mora no invólucro: o cabeçalho do
          design system não repassa testid ao <h1>. A margem negativa devolve
          os 20px que ele reserva embaixo, porque o `gap` da raiz já dá o
          respiro. */}
      <div data-testid="title-painel-geral" style={{ paddingTop: 22, marginBottom: -18 }}>
        <CabecalhoDaPagina
          titulo="Painel Geral"
          subtitulo={!isLoading && !falhouSemDados ? (
            <PorOndeComecar
              visoes={visoes}
              stats={stats}
              recorteAlheio={!!searchTerm || eventFilter.length > 0 || typeFilter.length > 0
                || sponsorFilter.length > 0 || dateFilter.length > 0 || focoFilter.length > 0}
              filtrosAtuais={filtrosAtuais}
              role={user?.role}
              aplicarVisao={aplicarVisao}
            />
          ) : null}
          /* Carimbo de frescor: o usuário precisa saber DESDE QUANDO o que
             ele lê é verdade. Sem botão Atualizar — a tela revalida
             sozinha. O relógio de 30s mora dentro dele (ver
             CarimboDeFrescor). */
          frescor={<CarimboDeFrescor />}
          acoes={
            <MenuExportar
              useCards={useCards}
              exportMenuOpen={exportMenuOpen}
              setExportMenuOpen={setExportMenuOpen}
              isExportingXlsx={isExportingXlsx}
              nSelecionadas={selecionadas.length}
              nParaExportar={itensParaExportar.length}
              onPdf={() => { setExportMenuOpen(false); setShowExportPDFModal(true); }}
              onXlsx={exportarXlsx}
            />
          }
        />
      </div>

      <FaixaDeAtencao
        isLoading={isLoading}
        isError={isError}
        atencao={atencao}
        chipOcultasDados={chipOcultasDados}
        hasActiveFilters={hasActiveFilters}
        useCards={useCards}
        focoFilter={focoFilter}
        toggleFoco={toggleFoco}
        levarALista={levarALista}
        mostrarFinalizados={mostrarFinalizados}
        setMostrarFinalizados={setMostrarFinalizados}
      />

      {!isLoading && stats.total > 0 && (
        <BarraDoFluxo
          stats={stats}
          idadesPorEtapa={idadesPorEtapa}
          statusFilter={statusFilter}
          toggleStatusCard={toggleStatusCard}
          useCards={useCards}
          dedo={dedo}
        />
      )}

      {/* Os cards somem quando a carga FALHOU sem dado nenhum: mostrariam "0"
          em tudo ao lado do aviso "Não foi possível carregar as peças" — o
          mesmo zero falso que o travessão resolve na carga, agora no erro. */}
      {!falhouSemDados && (
        <CartoesDeStatus
          useCards={useCards}
          stats={stats}
          isLoading={isLoading}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          toggleStatusCard={toggleStatusCard}
          showAllKpis={showAllKpis}
          setShowAllKpis={setShowAllKpis}
        />
      )}

      <BarraDeFiltros
        filtros={filtros}
        toolbarRef={toolbarRef}
        stickyToolbar={stickyToolbar}
        useCards={useCards}
        dedo={dedo}
        visoes={visoes}
        filtrosAtuais={filtrosAtuais}
        visaoPadrao={visaoPadrao}
        aplicarVisao={aplicarVisao}
        fixarVisaoPadrao={fixarVisaoPadrao}
        mobileFiltersOpen={mobileFiltersOpen}
        setMobileFiltersOpen={setMobileFiltersOpen}
        eventFilterOptions={eventFilterOptions}
        typeFilterOptions={typeFilterOptions}
        sponsorFilterOptions={sponsorFilterOptions}
        statusOptions={statusOptions}
        dateFilterOptions={dateFilterOptions}
        isLoading={isLoading}
        filteredItems={filteredItems}
        chipOcultasDados={chipOcultasDados}
      />

      {hasActiveFilters && (
        <ChipsDosFiltros filtros={filtros} useCards={useCards} nomeDoEvento={nomeDoEvento} sponsors={sponsors} />
      )}

      {/* Sem permissão para a visão Excluídos (a query nem roda — enabled
          exige canDeleteAny): diz o porquê e oferece a saída, em vez de uma
          lista silenciosamente vazia. Acontece via URL compartilhada. */}
      {showDeleted && !canDeleteAny && (
        <div style={{ backgroundColor: T.surface, border: `1px solid ${TOM.perigo.border}`, borderRadius: R.lg, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: FS.body, fontWeight: FW.forte, color: TOM.perigo.text }}>Você não tem permissão para ver peças excluídas.</span>
          <Botao
            variante="primario"
            tamanho="md"
            onClick={() => setStatusFilter(prev => prev.filter(s => s !== "deleted"))}
          >
            Remover filtro
          </Botao>
        </div>
      )}

      {/* Estados da visão Excluídos — sem eles, carregamento parecia lista
          vazia e uma falha virava "Nenhum item encontrado" (mentira).
          A carga continua uma faixa de uma linha (e não o <Esqueleto>): ela
          fica ACIMA da lista, que tem o próprio esqueleto; dois esqueletos
          empilhados leriam como duas listas chegando. */}
      {showDeleted && deletedLoading && (
        <div role="status" style={{ backgroundColor: T.bg, border: `1px solid ${T.border}`, borderRadius: R.lg, padding: "10px 16px", fontSize: FS.body, fontWeight: FW.medio, color: T.second }}>
          Carregando peças excluídas...
        </div>
      )}
      {showDeleted && deletedError && (
        <EstadoErro
          compacto
          titulo="Não foi possível carregar as peças excluídas."
          aoTentarDeNovo={() => refetchDeleted()}
        />
      )}

      {/* ── Grouped table ── */}
      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {isLoading ? (
          <EsqueletoDaLista />
        ) : isError ? (
          /* O ERRO É IRMÃO DO VAZIO: os dois são os estados do design system
             (<EstadoErro> e <EstadoVazio>), a mesma composição em que só muda
             o que de fato distingue "deu errado" de "não tem nada": a cor e a
             saída. */
          <EstadoErro
            titulo="Não foi possível carregar as peças"
            detalhe="Verifique sua conexão e tente novamente."
            aoTentarDeNovo={() => refetch()}
          />
        ) : filteredItems.length === 0 ? (
          !bannerExcluidosVisivel && (
            <VazioDaLista filtros={filtros} chipOcultasDados={chipOcultasDados} nomeDoEvento={nomeDoEvento} sponsors={sponsors} />
          )
        ) : (
          <>
            {planoDaLista.grupos.map((p) => (
              <GrupoDoEvento
                key={p.eventKey}
                eventKey={p.eventKey}
                gd={p.gd}
                meta={eventMeta.get(p.eventKey)}
                groupOpen={p.groupOpen}
                isExpanded={p.isExpanded}
                linhasPermitidas={p.linhasPermitidas}
                hojeMs={hojeMs}
                relogioIdade={relogioIdade}
                useCards={useCards}
                isCompact={isCompact}
                colCount={colCount}
                topOffset={topOffset}
                sortBy={sortBy}
                sortDir={sortDir}
                typeToGroup={typeToGroup}
                selectedIds={selectedIds}
                isAdmin={isAdmin}
                canDeleteAny={canDeleteAny}
                restoringItemId={restoringItemId}
                restorePending={restoreItemMutation.isPending}
                acoes={acoesDaLista}
              />
            ))}
            {planoDaLista.incompleto && (
              <SentinelaDeLote key={orcamentoLinhas} onVisivel={pedirProximoLote} />
            )}
          </>
        )}
      </section>

      {selecionadas.length > 0 && (
        <BarraDeSelecao
          selecionadas={selecionadas}
          dedo={dedo}
          isExportingXlsx={isExportingXlsx}
          onPdf={() => setShowExportPDFModal(true)}
          onXlsx={exportarXlsx}
          onCopiarIds={() => copiarIds(selecionadas, toast)}
          onLimpar={() => setSelectedIds(new Set())}
        />
      )}

      {/* ── Exportar PDF — mesmo modal da Arte e do Atendimento ── */}
      {/* Exporta o recorte que está na tela (ou a seleção), nunca a base
          inteira, e sem as peças excluídas. Montado só quando aberto — o modal
          roda facetas sobre a lista inteira mesmo fechado. */}
      {showExportPDFModal && (
        <ExportPdfDialog
          open={showExportPDFModal}
          onOpenChange={setShowExportPDFModal}
          items={itensParaExportar}
          title="Peças"
        />
      )}

      {/* ── Item details modal ── */}
      <ItemDetailsDialog
        item={selectedItem}
        auditLogs={auditLogs}
        open={!!selectedItem}
        onOpenChange={(open) => !open && setSelectedItem(null)}
        topActions={selectedItem ? (
          <AcoesDaFicha selectedItem={selectedItem} role={user?.role} onCopiarLink={() => copiarLinkDaPeca(selectedItem, toast)} />
        ) : undefined}
        customActions={temBlocoDeComplemento(selectedItem, false, false) ? (
          <ComplementoDaFicha
            item={selectedItem}
            canEditLists={false}
            onAbrirPeca={(id) => {
              const alvo = items.find((i) => i.id === id);
              if (alvo) setSelectedItem(alvo);
            }}
          />
        ) : undefined}
      />

      {/* ── Delete confirmation (Admin ou Solicitação, em qualquer status) ── */}
      <DialogoDeExclusao
        deleteConfirmItemId={deleteConfirmItemId}
        setDeleteConfirmItemId={setDeleteConfirmItemId}
        items={items}
        deleteItemMutation={deleteItemMutation}
      />
    </div>
  );
}
