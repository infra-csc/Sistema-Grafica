// ─────────────────────────────────────────────────────────────────────────────
// ATENDIMENTO — a aprovação do patrocinador.
//
// Esta página é a COMPOSIÇÃO: o estado que as partes dividem mora aqui, e as
// partes moram em components/atendimento/ — regras puras (regras.ts), tipos
// das respostas (tipos.ts), queries (use-atendimento-dados), mutações
// (use-atendimento-acoes), os recortes da fila, do lote e do histórico, e cada
// seção e modal num arquivo.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useMemo, useEffect, useRef, useDeferredValue } from "react";
import { FileText, RotateCcw } from "lucide-react";
import { ExportPdfDialog } from "@/components/export-pdf-dialog";
// Prazo desta tela = marco de APROVAÇÃO DE LAYOUT. Regra pura e única, testada
// em server/__tests__/atendimento-prazo.test.ts.
import { inicioDoDia } from "@/lib/atendimento-prazo";
// Selo "Atualizado há X": o mesmo formatador da Gestão de Prazos, da Gráfica
// e das Análises, para as quatro telas datarem o dado com as mesmas palavras.
import { fmtRelative } from "@/components/prazos/tokens";
import { isEventoFinalizado, todayBusinessMs } from "@/lib/status";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePecaDoLink, buscarCodigoDaPeca } from "@/hooks/use-peca-do-link";
import { useIsMobile, useDensidadeDoConteudo, usePonteiroGrosso } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/auth-context";
import { FS, T } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { EstadoErro } from "@/components/ui/estados";
import { EsqueletoDeFila } from "@/components/esqueleto-de-fila";
import { PAGE_SIZE, SITUACAO_META, leiturasDoLote, type OrdemHistorico, type OrdemPendentes, type SituacaoPeca } from "@/components/atendimento/regras";
import type {
  AbaDoAtendimento, AlvoDePatrocinador, PecaAtendimento, PecaDoHistorico, SponsorApproval,
} from "@/components/atendimento/tipos";
import { useAtendimentoDados } from "@/components/atendimento/use-atendimento-dados";
import { useAprovacoesDoLote } from "@/components/atendimento/use-aprovacoes-do-lote";
import { useFilaPendente } from "@/components/atendimento/use-fila-pendente";
import { useOrdemDaFila } from "@/components/atendimento/use-ordem-da-fila";
import { useLoteDoPatrocinador } from "@/components/atendimento/use-lote-do-patrocinador";
import { useHistorico } from "@/components/atendimento/use-historico";
import { usePoolDeExportacao } from "@/components/atendimento/use-pool-de-exportacao";
import { useAtendimentoAcoes } from "@/components/atendimento/use-atendimento-acoes";
import { PlacarDeSituacao } from "@/components/atendimento/placar-de-situacao";
import { BarraDaFila, type ChipAtivo } from "@/components/atendimento/barra-da-fila";
import { PainelDeLote } from "@/components/atendimento/painel-de-lote";
import { ListaPendentes } from "@/components/atendimento/lista-pendentes";
import { AbaHistorico } from "@/components/atendimento/aba-historico";
import { ModalHistoricoDeAprovacoes } from "@/components/atendimento/modal-historico-aprovacoes";
import { ModalDeRevisao } from "@/components/atendimento/modal-de-revisao";
import { ConfirmarAprovacao, ConfirmarDesvinculo, ConfirmarLote } from "@/components/atendimento/confirmacoes";
import { PreviewDoLote } from "@/components/atendimento/preview-do-lote";

export default function Atendimento() {
  const { toast } = useToast();
  const { user } = useAuth();
  // Gate de papel: o servidor só aceita decisões de "atendimento" e "admin"
  // (403 para os demais). A UI espelha o gate em vez de deixar o clique
  // estourar erro — os outros papéis veem a tela em modo somente leitura.
  const canDecide = user?.role === "atendimento" || user?.role === "admin";
  const [selectedItem, setSelectedItem] = useState<PecaAtendimento | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // TRAVA DE ~600 ms DEPOIS DO AVANÇO AUTOMÁTICO. Decidir uma peça abre a
  // próxima no MESMO modal, com os botões no mesmo lugar: um duplo clique em
  // "Aprovar para todos" (que não tem confirmação) aprovava também a peça
  // seguinte, que a pessoa nem tinha visto. Por um instante as decisões ficam
  // desabilitadas — visível, não um clique engolido em silêncio — enquanto o
  // cabeçalho e o toast mostram a troca de peça. A navegação manual (setas,
  // "Próxima peça") não trava: ali a pessoa escolheu trocar.
  const TRAVA_POS_AVANCO_MS = 600;
  const avancouEmRef = useRef(0);
  const [pecaRecemAberta, setPecaRecemAberta] = useState(false);
  const seguirParaPeca = (next: PecaAtendimento) => {
    avancouEmRef.current = Date.now();
    setPecaRecemAberta(true);
    setSelectedItem(next);
  };
  useEffect(() => {
    if (!pecaRecemAberta) return;
    const t = setTimeout(() => setPecaRecemAberta(false), TRAVA_POS_AVANCO_MS);
    return () => clearTimeout(t);
  }, [pecaRecemAberta, selectedItem?.id]);
  // Checagem no próprio clique também: não depende do render já ter aplicado
  // o `disabled`.
  const decisaoTravada = () => Date.now() - avancouEmRef.current < TRAVA_POS_AVANCO_MS;

  // Aba ativa: pendentes ou histórico
  // (Os pedidos de peça saíram daqui para a página própria, /pedidos-de-peca.)
  const [activeTab, setActiveTab] = useState<AbaDoAtendimento>("pending");

  // Filtros — aba Pendentes. A ordem da lista é declarada e trocável (as três
  // ordens e a regra de cada uma moram em regras.ts, ORDEM_REGRA).
  const [ordemPendentes, setOrdemPendentes] = useState<OrdemPendentes>(() => {
    const o = new URLSearchParams(window.location.search).get("ordem");
    return o === "mesa" || o === "evento" ? o : "prazo";
  });

  // A ordem do HISTÓRICO ("mais demoradas" é o que a auditoria procura).
  const [ordemHistorico, setOrdemHistorico] = useState<OrdemHistorico>("recentes");
  const [searchTerm, setSearchTerm] = useState("");
  // Adia o termo usado na filtragem (input segue responsivo, tabela não engasga).
  const deferredSearchTerm = useDeferredValue(searchTerm);
  // Persiste o filtro de evento ao abrir uma peça e voltar.
  const [eventFilter, setEventFilter] = useState<string[]>(() => { try { return JSON.parse(sessionStorage.getItem("atendimento:eventFilter") || "[]"); } catch { return []; } });
  useEffect(() => { sessionStorage.setItem("atendimento:eventFilter", JSON.stringify(eventFilter)); }, [eventFilter]);
  const [itemTypeFilter, setItemTypeFilter] = useState<string[]>([]);
  const [situacaoFilter, setSituacaoFilter] = useState<string[]>([]);
  // ?patrocinador=<id> — deep-link da Gestão de Prazos ("Cobrar no
  // Atendimento"): a tela abre já filtrada no patrocinador da cobrança.
  const [sponsorFilter, setSponsorFilter] = useState<string[]>(() => {
    const sp = new URLSearchParams(window.location.search).get("patrocinador");
    return sp ? [sp] : [];
  });
  // ?atrasados=1 — recorte "só o que passou do marco de Aprovação de Layout".
  const [atrasadosFilter, setAtrasadosFilter] = useState<boolean>(
    () => new URLSearchParams(window.location.search).get("atrasados") === "1",
  );

  // Âncora de "hoje" ESTÁVEL. O selo de prazo do cabeçalho de evento fazia
  // `new Date()` DENTRO do render de cada grupo: a mesma tela podia responder
  // dias diferentes na virada da meia-noite, e nenhuma memoização segurava um
  // valor que nascia novo a cada passada. Mesmo padrão de `agora` na Gráfica.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 600_000);
    return () => clearInterval(id);
  }, []);
  const hoje = useMemo(() => inicioDoDia(new Date(agora)), [agora]);

  // Filtros — aba Histórico
  const [histEventFilter, setHistEventFilter] = useState<string[]>([]);
  const [histSponsorFilter, setHistSponsorFilter] = useState<string[]>([]);
  const [histPeriodFilter, setHistPeriodFilter] = useState<string>("all");
  const [histSearchTerm, setHistSearchTerm] = useState<string>("");
  // A BUSCA DO HISTÓRICO COM ATRASO (perf, 2ª rodada). Ela é a única da tela
  // que ainda escrevia direto no filtro: cada tecla refazia `casaHistorico`
  // sobre a lista inteira, RECALCULAVA a jornada de cada peça (12 etapas) e
  // ORDENAVA o resultado — e as duas facetas do cabeçalho faziam a mesma
  // varredura de novo. O campo continua respondendo na hora (o `value` é o
  // estado); quem espera é a lista, como na fila de Pendentes
  // (`deferredSearchTerm`) e na Arte.
  const histBuscaDeferida = useDeferredValue(histSearchTerm);

  // Modal detalhe de aprovações (Histórico)
  const [histDetailItem, setHistDetailItem] = useState<PecaDoHistorico | null>(null);

  // Quantos cards do histórico renderizar por vez (PAGE_SIZE, em regras.ts).
  const [histVisible, setHistVisible] = useState(PAGE_SIZE);

  // Peça em preview no lote (clique na arte abre grande, sem mexer na seleção).
  const [batchPreviewItem, setBatchPreviewItem] = useState<PecaAtendimento | null>(null);

  /**
   * Eventos ABERTOS na aba Pendentes (o cabeçalho vira um card clicável).
   *
   * COMEÇA TUDO FECHADO (decisão do dono, 24/08). São duas coisas diferentes,
   * e vale não confundi-las de novo: a LISTA vem completa — todos os eventos,
   * sem "carregar mais" — e cada GRUPO vem recolhido. O cabeçalho fechado já
   * carrega o que decide (nome, mês, prazo de Aprovação de Layout e quantas
   * peças), e quem quiser as peças abre o evento que interessa.
   *
   * O conjunto guarda quem está ABERTO, não quem está fechado: com o padrão
   * invertido não existe valor inicial que signifique "tudo fechado" — a lista
   * de eventos não é conhecida aqui e muda a cada filtro, e um evento novo
   * entraria aberto por omissão.
   */
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const toggleEventCollapsed = (id: string) =>
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const eventoAberto = (id: string) => expandedEvents.has(id);

  // Modal Exportar PDF
  const [showExportPDFModal, setShowExportPDFModal] = useState(false);

  // Lote por Patrocinador + Evento
  const [batchSponsorId, setBatchSponsorId]           = useState<string>("");
  const [batchEventId, setBatchEventId]               = useState<string>("");
  const [batchRejectReason, setBatchRejectReason]     = useState<string>("");
  const [batchShowRejectForm, setBatchShowRejectForm] = useState<boolean>(false);

  const [batchSelectedItemIds, setBatchSelectedItemIds] = useState<Set<string>>(new Set());
  // Painel de lote recolhido por padrão: quem entra para revisar peça a peça
  // não precisa do painel ocupando meia tela. A escolha persiste na sessão.
  const [batchPanelOpen, setBatchPanelOpen] = useState<boolean>(() => {
    try { return sessionStorage.getItem("atendimento:batchPanelOpen") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { sessionStorage.setItem("atendimento:batchPanelOpen", batchPanelOpen ? "1" : "0"); } catch {}
  }, [batchPanelOpen]);

  // State para aprovações individuais de patrocinadores (no diálogo)
  const [sponsorApprovals, setSponsorApprovals] = useState<SponsorApproval[]>([]);
  const [loadingSponsorApprovals, setLoadingSponsorApprovals] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectingSponsorId, setRejectingSponsorId] = useState<string | null>(null);

  /**
   * ADICIONAR PATROCINADOR PELO MODAL — SÓ ADMIN (pedido do dono, 25/08,
   * caso #2801: a arte tinha a Crystal e não havia linha para aprovar,
   * porque a marca não estava vinculada à peça).
   */
  const [addPatrocinadorAberto, setAddPatrocinadorAberto] = useState(false);
  const [addingPatrocinadorId, setAddingPatrocinadorId] = useState<string | null>(null);
  const [buscaPatrocinador, setBuscaPatrocinador] = useState("");

  // Confirmação de aprovação
  const [confirmApproveIndividual, setConfirmApproveIndividual] = useState<AlvoDePatrocinador | null>(null);
  // Desvincular patrocinador da peça (pedido do dono, 25/08) — admin, com confirmação.
  const [desvincularAlvo, setDesvincularAlvo] = useState<AlvoDePatrocinador | null>(null);
  const [confirmApproveBatch, setConfirmApproveBatch] = useState(false);

  const isMobile = useIsMobile();
  // Régua de ÁREA ÚTIL para o layout da lista (placar, cards, histórico): com
  // a sidebar aberta, uma janela de 1000px deixa ~700px de conteúdo, e o corte
  // pela janela mantinha o layout largo espremido ali. `isMobile` continua
  // valendo para o que é de celular: filtros recolhidos, padding da página,
  // modais. O padding descontado é o da raiz (12 ou 32 de cada lado).
  const { ref: refConteudo, cards } = useDensidadeDoConteudo<HTMLDivElement>(isMobile ? 24 : 64);
  // Alvo de 44px pelo PONTEIRO (dedo), não pela largura: o tablet do galpão
  // tem janela larga e é usado com o dedo.
  const dedo = usePonteiroGrosso();
  const tamBotao = dedo ? "toque" as const : "md" as const;

  const {
    vinculosDoEvento, items, itemsLoading, itemsError, refetchItems, dataUpdatedAt, isFetchingItems,
    events, eventsLoading, sponsors, sponsorsDoEvento, auditLogs, typeToGroup,
  } = useAtendimentoDados({
    selectedItem, dialogOpen, user,
    precisaDoHistorico: activeTab === "history" || showExportPDFModal,
  });

  // Memoizar awaiting items para evitar fetches desnecessários.
  //
  // Evento FINALIZADO sai da fila — duas origens, um gate só
  // (`motivoEventoFinalizado`, @shared/prazo-dates):
  //   · "encerrado" → um admin encerrou o evento; é a promessa feita em voz
  //     alta na confirmação ("sai da Gestão de Prazos e das filas de trabalho").
  //   · "realizado" → a DATA DO EVENTO (events.startDate, não a saída do
  //     caminhão) já passou. Regra do dono: cobrar aprovação de patrocinador
  //     para um evento que já aconteceu não faz sentido. Durante o DIA do
  //     evento a peça ainda conta; sai depois da virada do dia em São Paulo.
  //     Evento SEM data de início nunca sai por esta regra.
  //
  // O filtro é do CLIENTE, não de /api/items — o Detalhe do Evento e o Painel
  // Geral leem a mesma chave e a lista de peças precisa continuar aparecendo lá
  // (são telas de registro; esta é tela de ação). `item.event` vem cru do
  // storage (nunca passa por enrichEvent): traz `status` e `startDate`, que são
  // exatamente as duas colunas que o predicado lê.
  const hojeBusinessMs = todayBusinessMs();
  const awaitingItems = useMemo(() =>
    items.filter(item =>
      item.status === 'awaiting_sponsor_approval' && !item.skipApproval
      && !isEventoFinalizado(item.event, hojeBusinessMs)
    ), [items, hojeBusinessMs]
  );

  // Os dois mapas (patrocinadores e aprovações de cada peça), de UMA chamada.
  const { itemSponsorsMap, setItemSponsorsMap, itemApprovalsMap, setItemApprovalsMap, loadingSponsors, decididasAquiRef } =
    useAprovacoesDoLote(items, awaitingItems);

  // Carregar aprovações individuais de patrocinadores quando o dialog é aberto.
  // Guarda de corrida (cancelled): ao aprovar, o fluxo avança para a próxima
  // peça (setSelectedItem), disparando este efeito de novo. Sem a guarda, a
  // resposta lenta da peça ANTERIOR podia chegar depois e sobrescrever as
  // aprovações da peça atual — exibindo/decidindo sobre a peça errada.
  useEffect(() => {
    if (dialogOpen && selectedItem) {
      let cancelled = false;
      setLoadingSponsorApprovals(true);
      setSponsorApprovals([]);
      setRejectionReason("");
      setRejectingSponsorId(null);

      apiRequest("GET", `/api/items/${selectedItem.id}/sponsor-approvals`)
        .then(response => response.json())
        .then((approvals: SponsorApproval[]) => {
          if (cancelled) return;
          setSponsorApprovals(approvals);
          setLoadingSponsorApprovals(false);
        })
        .catch(error => {
          if (cancelled) return;
          console.error('Error loading sponsor approvals:', error);
          setLoadingSponsorApprovals(false);
        });

      return () => { cancelled = true; };
    }
  }, [dialogOpen, selectedItem]);

  const pendingItems = awaitingItems;

  /** Evento por id — o prazo da peça é o do evento dela. */
  const eventoPorId = useMemo(
    () => new Map(events.map((e) => [e.id, e])),
    [events],
  );

  const {
    filteredItemsBase, atrasadosNaBase, filteredItems, eventFilterOptions, contagemSituacao,
    situacaoFilterOptions, typeFilterOptions, sponsorFilterOptions,
  } = useFilaPendente({
    pendingItems, itemSponsorsMap, itemApprovalsMap, loadingSponsors, deferredSearchTerm,
    eventFilter, itemTypeFilter, sponsorFilter, situacaoFilter, atrasadosFilter, eventoPorId, hoje, events, sponsors,
  });

  const exportPoolCongelado = usePoolDeExportacao({ showExportPDFModal, items, events, itemSponsorsMap, itemApprovalsMap });

  const { sponsorsWithStatus, quemFalta, isItemFullyApproved } = leiturasDoLote(itemSponsorsMap, itemApprovalsMap);

  const { pendingGroup, actionableCount, reviewQueue, filaDaSuaMesa, itemsByEvent } = useOrdemDaFila({
    filteredItems, loadingSponsors, isItemFullyApproved, itemApprovalsMap, itemSponsorsMap,
    ordemPendentes, typeToGroup, eventoPorId, hoje,
  });

  /**
   * Liga o filtro de situação numa chave só — e desliga se ela já era a
   * única ligada. É o comportamento de um placar: a célula é um recorte, não
   * um acumulador.
   */
  const alternarSituacao = (k: string) =>
    setSituacaoFilter(atual => (atual.length === 1 && atual[0] === k ? [] : [k]));

  const nomePorPatrocinador = useMemo(
    () => new Map(sponsors.map((s) => [s.id, s.name])),
    [sponsors],
  );

  /**
   * O recorte ativo, escrito.
   *
   * Cinco filtros combinam nesta tela e nenhum deles aparecia por extenso: o
   * estado morava dentro dos menus. Quem clicava numa célula do placar, era
   * interrompido e voltava dez minutos depois via uma lista curta sem nada na
   * tela explicando por quê. Estado invisível vira desconfiança do número.
   */
  const chipsAtivos: ChipAtivo[] = [];
  if (searchTerm) chipsAtivos.push({ key: "busca", label: `Busca: ${searchTerm}`, onRemove: () => setSearchTerm("") });
  situacaoFilter.forEach(k => chipsAtivos.push({
    key: `sit-${k}`,
    label: SITUACAO_META[k as SituacaoPeca]?.label ?? k,
    onRemove: () => setSituacaoFilter(v => v.filter(x => x !== k)),
  }));
  eventFilter.forEach(id => chipsAtivos.push({
    key: `ev-${id}`,
    label: eventoPorId.get(id)?.name ?? "Evento",
    onRemove: () => setEventFilter(v => v.filter(x => x !== id)),
  }));
  itemTypeFilter.forEach(t => chipsAtivos.push({
    key: `tp-${t}`, label: t,
    onRemove: () => setItemTypeFilter(v => v.filter(x => x !== t)),
  }));
  sponsorFilter.forEach(id => chipsAtivos.push({
    key: `sp-${id}`,
    label: nomePorPatrocinador.get(id) ?? "Patrocinador",
    onRemove: () => setSponsorFilter(v => v.filter(x => x !== id)),
  }));
  if (atrasadosFilter) chipsAtivos.push({ key: "atrasados", label: "Passaram do prazo", onRemove: () => setAtrasadosFilter(false) });

  /** Limpa TUDO — inclusive a situação, que o botão antigo esquecia. */
  const limparFiltros = () => {
    setSearchTerm(""); setEventFilter([]); setItemTypeFilter([]);
    setSponsorFilter([]); setSituacaoFilter([]); setAtrasadosFilter(false);
  };

  // O lote: quem é elegível e a seleção em sincronia. Depois de um lote o
  // patrocinador FICA escolhido (ver batchSponsorMutation).
  const { batchEligibleSponsors, batchEligibleEvents, batchEligibleItems, batchItemCount, batchSponsorNome, batchEventoNome } =
    useLoteDoPatrocinador({
      awaitingItems, itemApprovalsMap, itemSponsorsMap, loadingSponsors, sponsors, events,
      batchSponsorId, setBatchSponsorId, batchEventId, setBatchSelectedItemIds, nomePorPatrocinador, eventoPorId,
    });

  const { historyItems, histEventOptions, histSponsorOptions } = useHistorico({
    activeTab, ordemHistorico, hoje, eventoPorId, items, events, itemApprovalsMap, itemSponsorsMap, loadingSponsors,
    histEventFilter, histSponsorFilter, histPeriodFilter, histBuscaDeferida,
  });

  /** Vai para a peça anterior/seguinte da fila. Sem próxima, encerra a revisão. */
  const goToAdjacentItem = (dir: 1 | -1) => {
    const idx = reviewQueue.findIndex((i) => i.id === selectedItem?.id);
    const next = idx >= 0 ? reviewQueue[idx + dir] : undefined;
    if (next) {
      setSelectedItem(next);
    } else {
      setDialogOpen(false);
      setSelectedItem(null);
    }
  };

  // O recorte de atrasados vive na URL, como nas demais telas: é o link que se
  // manda para o colega ("olha o que já venceu"). replaceState com debounce de
  // 300ms (a regra da casa pede ≥200) e preservando os outros parâmetros — o
  // ?patrocinador= da Gestão de Prazos chega por aqui e não pode ser apagado.
  useEffect(() => {
    const timer = setTimeout(() => {
      const p = new URLSearchParams(window.location.search);
      if (ordemPendentes !== "prazo") p.set("ordem", ordemPendentes); else p.delete("ordem");
      if (atrasadosFilter) p.set("atrasados", "1"); else p.delete("atrasados");
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    }, 300);
    return () => clearTimeout(timer);
  }, [ordemPendentes, atrasadosFilter]);
  // Ao trocar de aba ou mexer nos filtros, o histórico volta para a 1ª página.
  useEffect(() => { setHistVisible(PAGE_SIZE); }, [activeTab, histEventFilter, histSponsorFilter, histPeriodFilter, histBuscaDeferida]);

  const getEventInfo = (eventId: string) => events.find((e) => e.id === eventId);

  const handleViewDetails = (item: PecaAtendimento) => {
    // Limpa o motivo/patrocinador de reprovação para não vazar o texto
    // digitado numa peça anterior e reprovar a peça errada com justificativa alheia.
    setRejectionReason("");
    setRejectingSponsorId(null);
    setSelectedItem(item);
    setDialogOpen(true);
  };

  const acoes = useAtendimentoAcoes({
    toast, dialogOpen, setDialogOpen, selectedItem, setSelectedItem, seguirParaPeca, reviewQueue,
    itemSponsorsMap, setItemSponsorsMap, itemApprovalsMap, setItemApprovalsMap, setSponsorApprovals, decididasAquiRef,
    quemFalta, setRejectionReason, setRejectingSponsorId, setDesvincularAlvo, awaitingItems, batchSelectedItemIds,
    setBatchEventId, setBatchRejectReason, setBatchShowRejectForm, nomePorPatrocinador, vinculosDoEvento,
    addingPatrocinadorId, setAddingPatrocinadorId,
  });

  // Deep link `?item=` (sino e "Resolver em Atendimento →" da Gestão de
  // Prazos): abre a revisão da peça na aba Pendentes. A fila é
  // `awaitingItems` — a mesma regra que monta a lista (aguardando patrocinador,
  // sem dispensa, evento em jogo). Peça que já foi decidida não está mais
  // aqui, e o hook avisa em vez de abrir uma revisão sem decisão a tomar.
  // Antes do `return` de carregamento: hook não pode ficar atrás dele.
  usePecaDoLink<PecaAtendimento>({
    pronto: !itemsLoading && !eventsLoading && !itemsError,
    localizar: (id) => awaitingItems.find((i) => i.id === id),
    abrir: (peca) => {
      if (activeTab !== "pending") setActiveTab("pending");
      handleViewDetails(peca);
    },
    // Peça fora das duas listas recortadas (rascunho, vinculação, na mesa da
    // Arte): busca só ela, para o aviso continuar dizendo o código — antes
    // isso vinha do acervo inteiro que descia a cada visita.
    codigoDe: (id) =>
      items.find((i) => i.id === id)?.displayId ?? buscarCodigoDaPeca(id),
  });

  if (itemsLoading || eventsLoading) {
    // Silhueta da fila, e não um spinner solto no meio da tela: é o mesmo
    // carregando da Arte e da Gráfica, e já desenha o lugar do conteúdo —
    // a tela "aparece" antes dos dados, em vez de piscar de vazio para cheio.
    return (
      <div ref={refConteudo} className="bg-stone-50" style={{ height: "100%", overflowY: "auto", padding: isMobile ? "12px 12px" : "32px" }}>
        <CabecalhoDaPagina titulo="Atendimento" />
        <EsqueletoDeFila linhas={6} />
      </div>
    );
  }

  if (itemsError) {
    // O estado de erro da casa (role="alert" já vem nele): a troca da tela
    // inteira por esta mensagem é anunciada, e o título diz QUE fila falhou,
    // não "os itens". Erro não é vazio — por isso a caixa de falha, e não
    // um texto solto que leria como "nada a fazer".
    return (
      <div ref={refConteudo} className="bg-stone-50" style={{ height: '100%', overflowY: 'auto', padding: isMobile ? '12px' : '32px' }}>
        <CabecalhoDaPagina titulo="Atendimento" />
        <div style={{ maxWidth: 520, margin: '24px auto' }}>
          <EstadoErro
            titulo="Não foi possível carregar a fila de aprovação"
            detalhe="Nenhuma decisão foi perdida. Verifique sua conexão e tente novamente."
            aoTentarDeNovo={() => refetchItems()}
          />
        </div>
      </div>
    );
  }

  return (
    <div ref={refConteudo} className="bg-stone-50" style={{ height: "100%", overflowY: "auto", padding: isMobile ? "12px 12px" : "32px" }}>

      {/* ─── CABEÇALHO ───────────────────────────────────────────── */}
      {/* O TÍTULO É O NOME DO MENU, como nas outras telas desde a 2ª rodada
          ("Arte", "Painel Geral"): quem clicou em "Atendimento" na barra
          lateral caía numa página chamada "Aprovação do Patrocinador" — dois
          nomes para o mesmo lugar. O que a tela FAZ desce para o subtítulo.

          O badge "Aguardam Aprovação" saiu daqui: era UM número para uma tela
          que responde a quatro perguntas, e virou o placar abaixo. No lugar
          dele, a idade do dado (frescor) — sem isto, uma aba aberta o dia
          inteiro nunca dizia de quando são os números que mostra. */}
      <CabecalhoDaPagina
        titulo="Atendimento"
        subtitulo="Aprovação do patrocinador — decida cada arte com a marca e veja quem ainda falta responder."
        frescor={!itemsLoading && !itemsError ? (
          <span
            data-testid="selo-atualizado"
            title={new Date(dataUpdatedAt).toLocaleString("pt-BR")}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: FS.small, color: T.second, whiteSpace: 'nowrap' }}
          >
            {isFetchingItems && <RotateCcw aria-hidden="true" className="animate-spin" style={{ width: 11, height: 11 }} />}
            Atualizado {fmtRelative(new Date(dataUpdatedAt).toISOString(), agora)}
          </span>
        ) : undefined}
        acoes={
          // Exportar PDF — desabilita enquanto os dados de aprovação carregam:
          // o pool de exportação depende deles e sairia vazio/incompleto. O
          // porquê fica À VISTA (motivo), não só no hover.
          <Botao
            variante="secundario"
            tamanho={tamBotao}
            icone={FileText}
            onClick={() => setShowExportPDFModal(true)}
            disabled={loadingSponsors}
            motivo={loadingSponsors ? "Carregando os dados de aprovação" : undefined}
            alinharMotivo="end"
            data-testid="button-export-pdf"
            title={loadingSponsors ? "Aguarde: carregando os dados de aprovação das peças" : "Exportar peças em PDF"}
          >
            Exportar PDF
          </Botao>
        }
      />

      {activeTab === 'pending' && (
        <PlacarDeSituacao
          cards={cards}
          contagemSituacao={contagemSituacao}
          situacaoFilter={situacaoFilter}
          alternarSituacao={alternarSituacao}
          atrasadosNaBase={atrasadosNaBase}
          atrasadosFilter={atrasadosFilter}
          setAtrasadosFilter={setAtrasadosFilter}
          loadingSponsors={loadingSponsors}
        />
      )}

      <BarraDaFila
        activeTab={activeTab} setActiveTab={setActiveTab} actionableCount={actionableCount}
        isMobile={isMobile} dedo={dedo} searchTerm={searchTerm} setSearchTerm={setSearchTerm} chipsAtivos={chipsAtivos}
        eventFilter={eventFilter} setEventFilter={setEventFilter} eventFilterOptions={eventFilterOptions}
        itemTypeFilter={itemTypeFilter} setItemTypeFilter={setItemTypeFilter} typeFilterOptions={typeFilterOptions}
        situacaoFilter={situacaoFilter} setSituacaoFilter={setSituacaoFilter} situacaoFilterOptions={situacaoFilterOptions}
        sponsorFilter={sponsorFilter} setSponsorFilter={setSponsorFilter} sponsorFilterOptions={sponsorFilterOptions}
        atrasadosFilter={atrasadosFilter} setAtrasadosFilter={setAtrasadosFilter} atrasadosNaBase={atrasadosNaBase}
        limparFiltros={limparFiltros} filteredItems={filteredItems} pendingItems={pendingItems}
      />

      {/* ─── PAINEL DA ABA PENDENTES ─────────────────────────────── */}
      {activeTab === "pending" && <div role="tabpanel" id="tabpanel-pending" aria-labelledby="tab-pending">
        <PainelDeLote
          loadingSponsors={loadingSponsors} batchEligibleSponsors={batchEligibleSponsors} canDecide={canDecide}
          batchPanelOpen={batchPanelOpen} setBatchPanelOpen={setBatchPanelOpen} cards={cards} isMobile={isMobile} tamBotao={tamBotao}
          batchSponsorId={batchSponsorId} setBatchSponsorId={setBatchSponsorId} batchEventId={batchEventId} setBatchEventId={setBatchEventId}
          batchEligibleEvents={batchEligibleEvents} batchEligibleItems={batchEligibleItems} batchItemCount={batchItemCount}
          batchSelectedItemIds={batchSelectedItemIds} setBatchSelectedItemIds={setBatchSelectedItemIds}
          batchShowRejectForm={batchShowRejectForm} setBatchShowRejectForm={setBatchShowRejectForm}
          batchRejectReason={batchRejectReason} setBatchRejectReason={setBatchRejectReason} batchSponsorNome={batchSponsorNome}
          setBatchPreviewItem={setBatchPreviewItem} setConfirmApproveBatch={setConfirmApproveBatch}
          batchSponsorMutation={acoes.batchSponsorMutation}
        />
        <ListaPendentes
          filteredItems={filteredItems} filteredItemsBase={filteredItemsBase} pendingItems={pendingItems} pendingGroup={pendingGroup}
          atrasadosFilter={atrasadosFilter} setAtrasadosFilter={setAtrasadosFilter} chipsAtivos={chipsAtivos} limparFiltros={limparFiltros}
          ordemPendentes={ordemPendentes} setOrdemPendentes={setOrdemPendentes} user={user}
          avisarGestaoMutation={acoes.avisarGestaoMutation} filaDaSuaMesa={filaDaSuaMesa} reviewQueue={reviewQueue}
          setSelectedItem={setSelectedItem} setDialogOpen={setDialogOpen} itemsByEvent={itemsByEvent} events={events}
          expandedEvents={expandedEvents} isMobile={isMobile} dedo={dedo} hoje={hoje} itemSponsorsMap={itemSponsorsMap}
          getEventInfo={getEventInfo} eventoAberto={eventoAberto} toggleEventCollapsed={toggleEventCollapsed}
          itemApprovalsMap={itemApprovalsMap} typeToGroup={typeToGroup} isItemFullyApproved={isItemFullyApproved}
          sponsorsWithStatus={sponsorsWithStatus} quemFalta={quemFalta} handleViewDetails={handleViewDetails}
          loadingSponsors={loadingSponsors} cards={cards} tamBotao={tamBotao} agora={agora}
        />
      </div>}

      {activeTab === "history" && (
        <AbaHistorico
          events={events} ordemHistorico={ordemHistorico} setOrdemHistorico={setOrdemHistorico}
          dedo={dedo} isMobile={isMobile} cards={cards} hoje={hoje} tamBotao={tamBotao} loadingSponsors={loadingSponsors}
          histSearchTerm={histSearchTerm} setHistSearchTerm={setHistSearchTerm}
          histEventFilter={histEventFilter} setHistEventFilter={setHistEventFilter} histEventOptions={histEventOptions}
          histSponsorFilter={histSponsorFilter} setHistSponsorFilter={setHistSponsorFilter} histSponsorOptions={histSponsorOptions}
          histPeriodFilter={histPeriodFilter} setHistPeriodFilter={setHistPeriodFilter}
          historyItems={historyItems} histVisible={histVisible} setHistVisible={setHistVisible}
          itemSponsorsMap={itemSponsorsMap} itemApprovalsMap={itemApprovalsMap} setHistDetailItem={setHistDetailItem}
        />
      )}

      <ModalHistoricoDeAprovacoes
        histDetailItem={histDetailItem}
        setHistDetailItem={setHistDetailItem}
        itemSponsorsMap={itemSponsorsMap}
        itemApprovalsMap={itemApprovalsMap}
      />

      <ModalDeRevisao
        dialogOpen={dialogOpen} setDialogOpen={setDialogOpen} selectedItem={selectedItem} events={events} auditLogs={auditLogs}
        itemSponsorsMap={itemSponsorsMap} hoje={hoje} reviewQueue={reviewQueue} goToAdjacentItem={goToAdjacentItem}
        loadingSponsorApprovals={loadingSponsorApprovals} vinculosDoEvento={vinculosDoEvento} sponsorsDoEvento={sponsorsDoEvento}
        sponsors={sponsors} buscaPatrocinador={buscaPatrocinador} setBuscaPatrocinador={setBuscaPatrocinador}
        addPatrocinadorAberto={addPatrocinadorAberto} setAddPatrocinadorAberto={setAddPatrocinadorAberto}
        addingPatrocinadorId={addingPatrocinadorId} adicionarPatrocinador={acoes.adicionarPatrocinador}
        sponsorApproveMutation={acoes.sponsorApproveMutation}
        sponsorApprovals={sponsorApprovals} user={user} canDecide={canDecide} isMobile={isMobile} dedo={dedo} tamBotao={tamBotao}
        rejectingSponsorId={rejectingSponsorId} setRejectingSponsorId={setRejectingSponsorId}
        rejectionReason={rejectionReason} setRejectionReason={setRejectionReason}
        pecaRecemAberta={pecaRecemAberta} decisaoTravada={decisaoTravada}
        setConfirmApproveIndividual={setConfirmApproveIndividual} setDesvincularAlvo={setDesvincularAlvo}
        acoes={acoes}
      />

      <ConfirmarDesvinculo
        desvincularAlvo={desvincularAlvo}
        setDesvincularAlvo={setDesvincularAlvo}
        desvincularSponsorMutation={acoes.desvincularSponsorMutation}
      />
      <ConfirmarAprovacao
        confirmApproveIndividual={confirmApproveIndividual}
        setConfirmApproveIndividual={setConfirmApproveIndividual}
        individualApproveMutation={acoes.individualApproveMutation}
      />
      <ConfirmarLote
        confirmApproveBatch={confirmApproveBatch} setConfirmApproveBatch={setConfirmApproveBatch}
        batchSelectedItemIds={batchSelectedItemIds} batchSponsorNome={batchSponsorNome} batchEventoNome={batchEventoNome}
        batchSponsorId={batchSponsorId} batchEventId={batchEventId} batchSponsorMutation={acoes.batchSponsorMutation}
      />

      {/* Exportar PDF — mesmo motor e opções da Arte */}
      <ExportPdfDialog
        open={showExportPDFModal}
        onOpenChange={setShowExportPDFModal}
        items={exportPoolCongelado}
        title="Aprovação"
      />

      <PreviewDoLote batchPreviewItem={batchPreviewItem} setBatchPreviewItem={setBatchPreviewItem} />
    </div>
  );
}
