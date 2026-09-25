// ─────────────────────────────────────────────────────────────────────────────
// REVISÃO FINAL — a última conferência antes da Gráfica.
//
// Esta página é a COMPOSIÇÃO da tela: o estado (filtros na URL, seleção, a
// peça aberta, os diálogos), os atalhos de teclado e o link `?item=`. O resto
// mora em components/revisao/:
//   · use-fila-da-revisao  — as leituras da API e a fila derivada delas;
//   · use-acoes-da-revisao — as mutações, com os avisos;
//   · barra-de-filtros / barra-do-lote / tabela / linha / cartão — a lista;
//   · modal-de-decisao + ficha-* — a ficha de decisão;
//   · confirmar-* / dialogo-* — cada confirmação no próprio arquivo;
//   · regras, estilos e tipos.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { CheckCircle, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePecaDoLink } from "@/hooks/use-peca-do-link";
import { Botao } from "@/components/ui/botao";
import { EstadoVazio, EstadoErro } from "@/components/ui/estados";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { EsqueletoDeFila } from "@/components/esqueleto-de-fila";
import { useIsMobile, usePonteiroGrosso, alvo, densityFromWidth } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/auth-context";
import { pecaTravada, podeTravar } from "@shared/trava-da-peca";
import { seloPecaEventoFinalizado } from "@/lib/status";
import { AumentarQuantidadeDialog } from "@/components/aumentar-quantidade-dialog";
import { useConsultaDaPeca, useEstoqueDaRevisao } from "@/components/consulta-de-estoque/na-revisao";
import { SOLICITACAO_AO_ESTOQUE_ATIVA, propostaDaLiberacao, respostaEsperandoConfirmar } from "@shared/consultas-de-estoque";
import { T, FS } from "@/lib/theme";
import { TI, buscarPecaAtual, prontaParaLiberar } from "@/components/revisao/regras";
import type { DestinoDaDevolucao, FiltroDoEstoque, FiltrosRevisao, PecaDaRevisao } from "@/components/revisao/tipos";
import { useFilaDaRevisao } from "@/components/revisao/use-fila-da-revisao";
import { useAcoesDaRevisao } from "@/components/revisao/use-acoes-da-revisao";
import { CabecalhoDaRevisao } from "@/components/revisao/cabecalho-da-revisao";
import { BarraDeFiltros } from "@/components/revisao/barra-de-filtros";
import { BarraDoLote } from "@/components/revisao/barra-do-lote";
import { ListaEmCartoes } from "@/components/revisao/lista-em-cartoes";
import { TabelaDaRevisao } from "@/components/revisao/tabela-da-revisao";
import { useRelogioDoMinuto } from "@/components/revisao/use-relogio-do-minuto";
import { ModalDeDecisao } from "@/components/revisao/modal-de-decisao";
import { ConfirmarLiberacao } from "@/components/revisao/confirmar-liberacao";
import { ConfirmarDevolucao } from "@/components/revisao/confirmar-devolucao";
import { ConfirmarLoteLiberar } from "@/components/revisao/confirmar-lote-liberar";
import { ConfirmarLoteDevolver } from "@/components/revisao/confirmar-lote-devolver";
import { ConfirmarLoteReaproveitar } from "@/components/revisao/confirmar-lote-reaproveitar";
import { DialogoReaproveitamento } from "@/components/revisao/dialogo-reaproveitamento";
import { ConfirmarDesfazerReaproveitamento } from "@/components/revisao/confirmar-desfazer-reaproveitamento";
import { DialogoTravar } from "@/components/revisao/dialogo-travar";
import { ConfirmarExclusao } from "@/components/revisao/confirmar-exclusao";

// ── O recorte na URL ────────────────────────────────────────────────────────
// O recorte ("evento X + banner") sobrevive ao F5, a abrir uma peça e voltar,
// e dá para mandar a um colega. `urlSetorDaPeca` (components/prazos/tokens.ts)
// manda gente para cá com `?busca=<ID>` a partir do drill da Gestão de Prazos.
//
// Nomes em pt-BR e IGUAIS aos das outras telas (`busca`, `evento`, `tipo`):
// a URL é compartilhada entre colegas, e o mesmo recorte não pode ter um nome
// em cada tela. Só o que está fora do padrão entra — estado limpo, URL limpa.
function filtrosRevisaoDaURL(search: string): FiltrosRevisao {
  const p = new URLSearchParams(search);
  const lista = (k: string) => (p.get(k) ?? "").split(",").filter(Boolean);
  return { busca: p.get("busca") ?? "", eventos: lista("evento"), tipos: lista("tipo") };
}

/**
 * Parte da query ATUAL e sobrescreve só as três chaves gerenciadas — o
 * `?item=` do deep link de peça (e qualquer param alheio) sobrevive, em vez de
 * ser apagado pelo primeiro espelhamento do recorte. Mesma disciplina de
 * `filtrosParaQuery` na Gráfica.
 */
function filtrosRevisaoParaQuery(searchAtual: string, f: FiltrosRevisao): string {
  const p = new URLSearchParams(searchAtual);
  const por = (k: string, v: string) => (v ? p.set(k, v) : p.delete(k));
  por("busca", f.busca);
  por("evento", f.eventos.join(","));
  por("tipo", f.tipos.join(","));
  return p.toString();
}

/** Padding lateral da lista (32 de cada lado) — o que a área útil desconta. */
const PADDING_DA_LISTA = 64;

export default function Solicitacao() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedItem, setSelectedItem] = useState<PecaDaRevisao | null>(null);
  // As duas facetas da barra de filtros.
  const [soSemArquivo, setSoSemArquivo] = useState(false);
  const [soEventoFinalizado, setSoEventoFinalizado] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [returnObservations, setReturnObservations] = useState("");
  // PARA ONDE a peça volta — escolha de quem devolve. "finalizacao" é o padrão
  // porque é o caso comum e o menos destrutivo: preservar a aprovação do
  // patrocinador não custa nada se a arte for refeita depois, mas jogar fora
  // uma aprovação que valia obriga a pedir tudo de novo.
  const [destinoDevolucao, setDestinoDevolucao] = useState<DestinoDaDevolucao>("finalizacao");
  const [editingQuantity, setEditingQuantity] = useState(false);
  const [quantityValue, setQuantityValue] = useState<number>(1);
  // Complemento: peça-mãe e a diferença sugerida pelo servidor quando o
  // aumento foi barrado por já estar em produção (409 USE_COMPLEMENT).
  const [complementItem, setComplementItem] = useState<PecaDaRevisao | null>(null);
  const [complementSugestao, setComplementSugestao] = useState<number | null>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  // Alvo do foco ao abrir a confirmação de liberar (ver ConfirmarLiberacao).
  const botaoConfirmarLiberarRef = useRef<HTMLButtonElement>(null);
  const [releaseConfirmOpen, setReleaseConfirmOpen] = useState(false);
  // ── SOLICITAÇÃO AO ESTOQUE ──────────────────────────────────────────────
  // As respostas do estoque aparecem na Revisão, SUGERIDAS — ela só confirma.
  // `estoquePorPeca`: o que vale para cada peça da lista (selo na linha, os
  // dois contadores, a ordem e o resumo do lote) — uma leitura só.
  // `propostaDaFicha`: a conta pronta da peça aberta, que escreve o botão
  // "Confirmar e liberar · 3 reaproveitadas + 3 a produzir".
  // `usarMenos`: o ajuste escondido atrás do link — null = a sugestão.
  // CHAVE DESLIGADA (SOLICITACAO_AO_ESTOQUE_ATIVA): os dois hooks não pedem
  // nada (mapa vazio, consulta null), o filtro fica vazio e a URL não é
  // tocada — a tela é a de antes da solicitação ao estoque.
  const estoquePorPeca = useEstoqueDaRevisao();
  const [filtroEstoque, setFiltroEstoque] = useState<FiltroDoEstoque>(() => {
    if (!SOLICITACAO_AO_ESTOQUE_ATIVA) return "";
    const v = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("estoque");
    return v === "aguardando" || v === "respondeu" ? v : "";
  });
  const [usarMenos, setUsarMenos] = useState<number | null>(null);
  const idDaFicha = selectedItem?.id ?? null;
  useEffect(() => { setUsarMenos(null); }, [idDaFicha]);
  const { consulta: consultaDaFicha } = useConsultaDaPeca(idDaFicha, modalOpen);
  const pedidoEmAberto = consultaDaFicha?.status === "aberta";
  // Marcação manual de reaproveitamento total manda — o servidor também a
  // respeita antes da resposta do estoque.
  const propostaDaFicha = SOLICITACAO_AO_ESTOQUE_ATIVA && selectedItem && !selectedItem.isReuse && respostaEsperandoConfirmar(consultaDaFicha)
    ? propostaDaLiberacao(Number(selectedItem.quantity) || 0, consultaDaFicha!, usarMenos)
    : null;
  // Sem arquivo final não libera — salvo quando o estoque cobre a peça inteira
  // (reaproveitamento total não imprime nada; é a mesma régua do servidor).
  // MOLDE não tem arquivo final — libera só com o thumb (arquivoFinalOk).
  const semArquivoParaLiberar = !!selectedItem && !prontaParaLiberar(selectedItem) && !(SOLICITACAO_AO_ESTOQUE_ATIVA && propostaDaFicha?.pulaProducao);
  // O filtro do estoque mora na URL, como os outros (?estoque=respondeu).
  useEffect(() => {
    if (!SOLICITACAO_AO_ESTOQUE_ATIVA) return;
    const q = new URLSearchParams(window.location.search);
    if (filtroEstoque) q.set("estoque", filtroEstoque); else q.delete("estoque");
    const qs = q.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [filtroEstoque]);
  // Campo de observação da ficha: existe por conta própria, sem depender de
  // "Liberar" ou "Devolver" — a pessoa pode querer deixar um recado (cor,
  // acabamento, posição) sem estar pronta para nenhuma das duas decisões.
  const [cardObservations, setCardObservations] = useState("");
  const [bulkReleaseConfirmOpen, setBulkReleaseConfirmOpen] = useState(false);
  const [bulkReturnConfirmOpen, setBulkReturnConfirmOpen] = useState(false);
  const [bulkReuseConfirmOpen, setBulkReuseConfirmOpen] = useState(false);
  const [bulkReturnObservations, setBulkReturnObservations] = useState("");
  const [returnConfirmOpen, setReturnConfirmOpen] = useState(false);
  const [deleteConfirmItemId, setDeleteConfirmItemId] = useState<string | null>(null);
  // POR QUE CADA PEÇA DO LOTE FICOU: o motivo do servidor, escrito na linha.
  // O toast só resume — "3 com erro" não dizia quais nem por quê.
  const [falhasPorId, setFalhasPorId] = useState<Record<string, string>>({});
  const anotarFalhas = (falhas: Record<string, string>, limpar: string[] = []) =>
    setFalhasPorId(prev => {
      const prox = { ...prev };
      for (const id of limpar) delete prox[id];
      return { ...prox, ...falhas };
    });
  // Travar pela ficha (a mesma trava da Gráfica): a peça a travar e o motivo.
  const [travandoItem, setTravandoItem] = useState<PecaDaRevisao | null>(null);
  const [motivoDaTrava, setMotivoDaTrava] = useState("");
  // "Reaproveitada · desfazer" pede confirmação: desfazer devolve a peça à
  // régua do arquivo final e da produção.
  const [desfazerReuseId, setDesfazerReuseId] = useState<string | null>(null);
  // Diálogo de reaproveitamento (total ou parcial)
  const [reuseDialogItemId, setReuseDialogItemId] = useState<string | null>(null);
  const [partialReuseQty, setPartialReuseQty] = useState(1);

  // Estado inicial vindo da URL — ver o bloco de comentário acima do componente.
  const urlInicial = useMemo(() => filtrosRevisaoDaURL(window.location.search), []);
  const [searchTerm, setSearchTerm] = useState(urlInicial.busca);
  const [eventFilter, setEventFilter] = useState<string[]>(urlInicial.eventos);
  const [itemTypeFilter, setItemTypeFilter] = useState<string[]>(urlInicial.tipos);
  const searchRef = useRef<HTMLInputElement>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const isMobile = useIsMobile();

  /** Altura dos controles: 44 quando o ponteiro é o dedo, 36 no mouse. */
  const dedo = usePonteiroGrosso();
  const alturaControle = alvo(36, dedo);
  // Campo com fonte < 16px faz o celular dar zoom ao focar.
  const fonteDeCampo = dedo || isMobile ? FS.lead : FS.body;

  // ── TABELA OU CARTÕES: a régua do app, pela ÁREA ÚTIL da tela ──
  // (hooks/use-mobile: <820 cartões, 820–1180 compacto, ≥1180 inteira). A
  // medida é a da caixa da TELA menos o padding de 32 de cada lado da lista —
  // não a da janela: com a barra lateral aberta um notebook de 1024 deixa
  // ~700px para a lista.
  //
  // O COMPACTO FUNDE UMA COLUNA. A tabela de layout fixo precisa de ~920px:
  // checkbox 96 + Qtd·Dim·m² 262 + Arquivo 172 + Ações 192 = 722, mais ~200
  // para a Peça. Na faixa compacta ela não caberia inteira — e rolagem
  // horizontal não pode existir. Então no compacto "Qtd · Dim · m²" desce
  // para uma segunda linha DENTRO da célula da Peça: sobram 460px fixos e a
  // Peça fica com ≥360 já nos 820.
  //
  // Callback ref, e não `useDensidadeDoConteudo`: a tela só monta DEPOIS do
  // carregamento (há retornos antecipados abaixo), e o efeito de montagem de
  // `useElementSize` rodaria com a ref ainda vazia e nunca mais observaria.
  // A conta é a mesma do hook (`densityFromWidth` sobre a área útil).
  const [larguraLista, setLarguraLista] = useState(0);
  const observadorLista = useRef<ResizeObserver | null>(null);
  const listaRef = useCallback((el: HTMLElement | null) => {
    observadorLista.current?.disconnect();
    observadorLista.current = null;
    if (!el) return;
    const medir = () => {
      const w = el.getBoundingClientRect().width;
      // Ignora sub-pixel: barra de rolagem aparecendo não re-renderiza a tela.
      setLarguraLista(prev => (Math.abs(prev - w) < 1 ? prev : w));
    };
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    observadorLista.current = ro;
  }, []);
  // Antes de medir (largura 0), o mesmo fallback do hook: celular → cartões.
  const densidade = larguraLista === 0
    ? (isMobile ? "cards" : "full")
    : densityFromWidth(larguraLista - PADDING_DA_LISTA);
  const listaEmCartoes = isMobile || densidade === "cards";
  /** Tabela reduzida: "Qtd · Dim · m²" funde na célula da Peça. */
  const compacto = !listaEmCartoes && densidade === "compact";
  const colunasDeDados = compacto ? 3 : 4;
  // O relógio da fila, ao minuto: a idade da trava e o dia do prazo do molde
  // nas linhas memoizadas andam com ele (ver use-relogio-do-minuto.ts).
  const agora = useRelogioDoMinuto();

  const {
    itensDoServidor, items, itemsLoading, itemsError, refetchItems,
    events, eventsLoading, eventsError, refetchEvents,
    itemAuditLogs, historicoCarregando, typeToGroup,
    hojeBusinessMs, pendingItems, selosPorItem, seloDoItem,
    filteredItems, contagemDoEstoque, contagemSemArquivo, contagemEventoFinalizado, fraseDeResolucao,
    eventFilterOptions, typeFilterOptions, itemsByEvent,
    selecaoLote, propostasDoLote, reaproveitadasNoLote, loteDeLiberar, moldesNoLote, loteSoDeMoldes,
    avisoLoteFinalizadas, getEventInfo,
  } = useFilaDaRevisao({
    user, searchTerm, eventFilter, itemTypeFilter, soSemArquivo, soEventoFinalizado, filtroEstoque,
    estoquePorPeca, selectedItemIds, setSelectedItemIds, selectedItem, modalOpen,
  });

  // O selo da peça ABERTA no modal. Vem do mesmo mapa da lista — a ficha não
  // pode discordar da linha de onde foi aberta. Deriva de `selectedItem.event`
  // como reserva: o modal sobrevive a uma invalidação que tire a peça da lista.
  const seloSelecionado = selectedItem
    ? (selosPorItem.get(selectedItem.id) ?? seloPecaEventoFinalizado(selectedItem.event, hojeBusinessMs))
    : null;

  // A TRAVA DA PEÇA ABERTA: a versão mais nova entre a da lista (que chega
  // pelo WebSocket quando alguém trava na Gráfica) e a da ficha (que o
  // travar/destravar daqui atualiza na hora).
  const pecaDaFicha: PecaDaRevisao | null = (() => {
    if (!selectedItem) return null;
    const daLista = pendingItems.find((i) => i.id === selectedItem.id);
    if (!daLista) return selectedItem;
    const t = (x: PecaDaRevisao | undefined) => new Date(x?.updatedAt ?? 0).getTime() || 0;
    return t(selectedItem) > t(daLista) ? selectedItem : daLista;
  })();
  const fichaTravada = pecaTravada(pecaDaFicha);

  // O subtítulo da ficha: a descrição da peça e o evento com a saída do
  // caminhão. A saída é gravada no "horário de exibição" (UTC = relógio de São
  // Paulo), como lê o chip do cabeçalho do evento na tabela — sem timeZone
  // "UTC" a ficha mostrava a hora 3h antes da lista.
  const subtituloDaFicha = (() => {
    if (!selectedItem) return undefined;
    const ev = events.find((e) => e.id === selectedItem.eventId);
    const saida = ev?.truckDepartureDate ? new Date(ev.truckDepartureDate) : null;
    const linhaDoEvento = ev
      ? ev.name + (saida
        ? " · caminhão " + saida.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" }).replace(".", "").replace(" de ", " ")
          + " · " + saida.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })
        : "")
      : "";
    return [selectedItem.description, linhaDoEvento].filter(Boolean).join(" — ") || undefined;
  })();

  const filaIdx = useMemo(
    () => (selectedItem ? filteredItems.findIndex((i) => i.id === selectedItem.id) : -1),
    [selectedItem, filteredItems],
  );
  const temAnterior = filaIdx > 0;
  const temProxima = filaIdx >= 0 && filaIdx < filteredItems.length - 1;

  const irParaFila = (idx: number) => {
    const alvo = filteredItems[idx];
    if (!alvo) return;
    // Mesmo preparo do openModal, sem reabrir o diálogo: trocar a peça com o
    // modal aberto tem de zerar os campos de edição da anterior, senão a
    // observação digitada na peça 3 aparece na 4.
    setSelectedItem(alvo);
    setQuantityValue(alvo.quantity ?? 1);
    setEditingQuantity(false);
    setReturnObservations("");
    setCardObservations(alvo.observations || "");
  };

  /**
   * Depois de decidir, a peça sai de `pendingItems` — e, portanto, da lista
   * filtrada. O índice que ERA o dela passa a ser o da peça seguinte, então
   * avançar é ficar no mesmo índice. Guardamos o índice ANTES da invalidação
   * porque depois dela `selectedItem` já não está na lista.
   */
  const proximaAposDecidir = useRef<number | null>(null);

  /** Marca o avanço, ou devolve `false` quando era a última da fila. */
  const marcarAvanco = (): boolean => {
    if (filaIdx < 0 || filaIdx >= filteredItems.length - 1) return false;
    proximaAposDecidir.current = filaIdx;
    return true;
  };

  const {
    avisarRevisaoMutation, updateQuantityMutation, updateObservationsMutation, creatorReviewMutation,
    bulkReleaseMutation, returnToArteMutation, bulkReturnMutation, bulkReuseMutation, deleteItemMutation,
    toggleReuseMutation, partialReuseMutation, travarMutation, destravarMutation,
  } = useAcoesDaRevisao({
    toast, items, pendingItems, estoquePorPeca, selectedItem, setSelectedItem, setModalOpen,
    quantityValue, setEditingQuantity, setComplementItem, setComplementSugestao, cardObservations,
    marcarAvanco, proximaAposDecidir, anotarFalhas, setSelectedItemIds,
    setReleaseConfirmOpen, setReturnConfirmOpen, setReturnObservations,
    setBulkReleaseConfirmOpen, setBulkReturnConfirmOpen, setBulkReturnObservations, setBulkReuseConfirmOpen,
    setDeleteConfirmItemId, setDesfazerReuseId, setReuseDialogItemId, setTravandoItem, setMotivoDaTrava,
  });

  // URL espelhando o recorte, com 300ms de atraso (a régua da casa pede ≥200):
  // sem o debounce, cada tecla da busca escreveria um replaceState — o padrão
  // que já derrubou a árvore React no Safari em outra tela. `replaceState` e
  // não `pushState`: filtrar não é navegar, e o Voltar tem de sair da tela em
  // vez de desfazer letra por letra.
  useEffect(() => {
    const t = setTimeout(() => {
      const qs = filtrosRevisaoParaQuery(
        window.location.search,
        { busca: searchTerm, eventos: eventFilter, tipos: itemTypeFilter },
      );
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm, eventFilter, itemTypeFilter]);

  // Voltar/avançar do navegador reidrata o recorte. Sem isto o back trocava a
  // URL e a tela continuava com os filtros novos — a URL passaria a mentir.
  useEffect(() => {
    const onPop = () => {
      const f = filtrosRevisaoDaURL(window.location.search);
      setSearchTerm(f.busca);
      setEventFilter(f.eventos);
      setItemTypeFilter(f.tipos);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Atalho "/" foca a busca (paridade com as outras telas de lista).
  // Com um diálogo aberto o atalho SE CALA: o FocusScope do Radix puxaria o
  // foco de volta na hora e o efeito visível seria só um pisca-pisca.
  const algumDialogoAberto = modalOpen || releaseConfirmOpen || returnConfirmOpen
    || bulkReleaseConfirmOpen || bulkReturnConfirmOpen || bulkReuseConfirmOpen
    || deleteConfirmItemId !== null || complementItem !== null || reuseDialogItemId !== null
    || travandoItem !== null || desfazerReuseId !== null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || algumDialogoAberto) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [algumDialogoAberto]);

  // Desfazer o reaproveitamento pede confirmação (ConfirmarDesfazerReaproveitamento).
  const desfazendoReuse = (id: string) => toggleReuseMutation.isPending && toggleReuseMutation.variables?.itemId === id && toggleReuseMutation.variables?.isReuse === false;

  // ── As ações das linhas e dos cartões ──
  // Estáveis (useCallback, só setters dentro): a linha e o cartão são
  // memoizados, e uma função nova a cada render os redesenharia todos.
  const openModal = useCallback((item: PecaDaRevisao) => {
    setSelectedItem(item);
    setQuantityValue(item.quantity ?? 1);
    setEditingQuantity(false);
    setReturnObservations("");
    setCardObservations(item.observations || "");
    setModalOpen(true);
  }, []);
  const toggleItem = useCallback((id: string) => setSelectedItemIds(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  }), []);
  // UM caminho para reaproveitar, da linha, do cartão e da ficha: marcada, pede
  // confirmação para desfazer; não marcada, abre o diálogo de total/parcial.
  // (A guarda de evento finalizado fica em quem chama, que conhece o selo.)
  const abrirReaproveitamento = useCallback((item: PecaDaRevisao) => {
    if (item.isReuse) setDesfazerReuseId(item.id);
    else { setPartialReuseQty(Math.max(1, Number(item.quantity) - 1 || 1)); setReuseDialogItemId(item.id); }
  }, []);
  const toggleAll = () => {
    selectedItemIds.size === filteredItems.length && filteredItems.length > 0
      ? setSelectedItemIds(new Set())
      : setSelectedItemIds(new Set(filteredItems.map(i => i.id)));
  };

  useEffect(() => {
    const idx = proximaAposDecidir.current;
    if (idx === null) return;
    proximaAposDecidir.current = null;
    const alvo = filteredItems[idx];
    if (!alvo) { setModalOpen(false); setSelectedItem(null); return; }
    irParaFila(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredItems]);

  // Deep link `?item=` (sino e "Resolver em Revisão Final →" da Gestão de
  // Prazos): abre a decisão da peça. A fila é `pendingItems` — a mesma regra
  // da lista, com o recorte do Kit —, então peça já liberada ou devolvida não
  // abre um modal sem decisão: o hook avisa que ela avançou.
  //
  // Peça do link FORA da fila: o aviso diz o código dela, que vem de uma busca
  // só por ela (`buscarPecaAtual`). O hook espera essa busca (`pronto`) para o
  // aviso sair com o código. O id é lido na montagem, no mesmo instante em que
  // o hook o lê.
  const [idDoLink] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("item"));
  const [codigoDoLink, setCodigoDoLink] = useState<{ id: string; codigo: string | null } | null>(null);
  const filaCarregada = !itemsLoading && !eventsLoading && !itemsError;
  const linkForaDaFila = filaCarregada && !!idDoLink && !pendingItems.some((i) => i.id === idDoLink);
  const codigoDoLinkPronto = !!idDoLink && codigoDoLink?.id === idDoLink;
  const linkPronto = filaCarregada && (!linkForaDaFila || codigoDoLinkPronto);
  // O hook consome o link UMA vez. Depois disso, a peça do link sair da fila
  // (a própria pessoa a liberou) não é motivo para buscar código nenhum.
  const linkJaConsumido = useRef(false);
  if (linkPronto) linkJaConsumido.current = true;
  useEffect(() => {
    if (linkJaConsumido.current || !linkForaDaFila || !idDoLink || codigoDoLinkPronto) return;
    let vivo = true;
    void buscarPecaAtual(idDoLink).then((peca) => {
      if (vivo) setCodigoDoLink({ id: idDoLink, codigo: peca?.displayId ?? null });
    });
    return () => { vivo = false; };
  }, [linkForaDaFila, idDoLink, codigoDoLinkPronto]);
  usePecaDoLink<PecaDaRevisao>({
    pronto: linkPronto,
    localizar: (id) => pendingItems.find((i) => i.id === id),
    abrir: openModal,
    codigoDe: (id) =>
      itensDoServidor.find((i) => i.id === id)?.displayId
      ?? (codigoDoLink?.id === id ? codigoDoLink.codigo : undefined),
  });

  useEffect(() => {
    if (!modalOpen) return;
    const handler = (e: KeyboardEvent) => {
      // Tecla SEGURADA não é decisão: o auto-repeat do teclado abria a
      // confirmação, o foco no "Liberar" confirmava, a fila avançava e o
      // próximo repeat recomeçava — várias peças liberadas num só aperto.
      // Só o keydown inicial conta; setas seguradas também param aqui (uma
      // peça por aperto é o ritmo de revisão).
      if (e.repeat) return;
      // Quem está digitando num campo (textarea de observação, input de
      // quantidade...) não pode ter Enter/Esc sequestrados pelo atalho.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.tagName === "SELECT" || t.isContentEditable)) return;
      // Com foco em botão/link, Enter ativa o próprio elemento — agir aqui
      // também abriria dois diálogos de uma vez.
      if (t && t.closest("button,a")) return;
      // Com um AlertDialog de confirmação aberto por cima, Enter/Esc são dele
      // (o Radix cuida); agir aqui fechava as duas camadas de uma vez.
      if (releaseConfirmOpen || returnConfirmOpen || travandoItem || desfazerReuseId || reuseDialogItemId) return;
      // Mesma checagem do botão "Liberar para Produção": sem arquivo final —
      // ou com o evento finalizado, que o servidor recusa com 409 — o atalho
      // não pode driblar o botão desabilitado.
      if (e.key === "Enter" && selectedItem && prontaParaLiberar(selectedItem)
        && !seloPecaEventoFinalizado(selectedItem?.event, hojeBusinessMs)) setReleaseConfirmOpen(true);
      if (e.key === "Escape") setModalOpen(false);
      if (e.key === "ArrowLeft" && temAnterior) { e.preventDefault(); irParaFila(filaIdx - 1); }
      if (e.key === "ArrowRight" && temProxima) { e.preventDefault(); irParaFila(filaIdx + 1); }
      // D de devolver — o par do Enter, que libera. Sem ele o atalho de
      // teclado só cobria metade da decisão.
      if ((e.key === "d" || e.key === "D") && !seloSelecionado) { e.preventDefault(); setReturnConfirmOpen(true); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modalOpen, selectedItem, releaseConfirmOpen, returnConfirmOpen, travandoItem, desfazerReuseId, reuseDialogItemId, filaIdx, temAnterior, temProxima, seloSelecionado]); // eslint-disable-line react-hooks/exhaustive-deps

  if (itemsLoading || eventsLoading) {
    // A SILHUETA DA FILA (25/09), como na Arte e na Gráfica: o giro central
    // colapsava a altura e, quando os dados chegavam, a lista EMPURRAVA a tela.
    // O título já fica no lugar; a frase diz O QUE carrega — numa fila que às
    // vezes está vazia de verdade, "carregando ou vazio?" era pergunta de todo dia.
    return (
      <div style={{ backgroundColor: TI.bg, height: "100%", overflowY: "auto" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: isMobile ? "16px 12px" : "20px 32px" }}>
          <CabecalhoDaPagina titulo="Revisão Final" subtitulo={<span style={{ color: T.apoio }}>Carregando a fila de revisão…</span>} />
          <EsqueletoDeFila linhas={isMobile ? 5 : 8} rotulo="Carregando a fila de revisão…" />
        </div>
      </div>
    );
  }

  if (itemsError || eventsError) {
    return (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", padding: "0 24px", maxWidth: 560, margin: "0 auto" }}>
        <EstadoErro
          titulo={itemsError ? "Não foi possível carregar as peças" : "Não foi possível carregar os eventos"}
          detalhe="Verifique sua conexão e tente novamente."
          aoTentarDeNovo={() => { refetchItems(); refetchEvents(); }}
        />
      </div>
    );
  }

  const admin = user?.role === "admin";
  // UM "limpar filtros" para a barra e para o vazio — o do vazio esquecia o
  // filtro do estoque e deixava a lista vazia com o botão já usado.
  const limparFiltros = () => { setSearchTerm(""); setEventFilter([]); setItemTypeFilter([]); setSoSemArquivo(false); setSoEventoFinalizado(false); setFiltroEstoque(""); };
  // O que a ficha faz ao decidir reaproveitar de dentro dela: avança para a
  // próxima da fila, como Liberar e Devolver — ou fecha, se era a última.
  // Aberto pela linha (modal fechado), nada de mexer na fila.
  const avancarSeDaFicha = (itemId: string) => {
    if (modalOpen && selectedItem?.id === itemId && !marcarAvanco()) { setModalOpen(false); setSelectedItem(null); }
  };

  return (
    <div ref={listaRef} style={{ backgroundColor: TI.bg, height: "100%", overflowY: "auto" }}>

      <CabecalhoDaRevisao
        isMobile={isMobile}
        dedo={dedo}
        fraseDeResolucao={fraseDeResolucao}
        admin={admin}
        avisando={avisarRevisaoMutation.isPending}
        aoAvisar={() => avisarRevisaoMutation.mutate()}
        totalNaFila={filteredItems.length}
        aoComecarFila={() => openModal(filteredItems[0])}
      />

      <BarraDeFiltros
        isMobile={isMobile}
        dedo={dedo}
        alturaControle={alturaControle}
        fonteDeCampo={fonteDeCampo}
        searchRef={searchRef}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        eventFilter={eventFilter}
        setEventFilter={setEventFilter}
        eventFilterOptions={eventFilterOptions}
        itemTypeFilter={itemTypeFilter}
        setItemTypeFilter={setItemTypeFilter}
        typeFilterOptions={typeFilterOptions}
        soSemArquivo={soSemArquivo}
        alternarSemArquivo={() => setSoSemArquivo(v => !v)}
        contagemSemArquivo={contagemSemArquivo}
        soEventoFinalizado={soEventoFinalizado}
        alternarEventoFinalizado={() => setSoEventoFinalizado(v => !v)}
        contagemEventoFinalizado={contagemEventoFinalizado}
        filtroEstoque={filtroEstoque}
        alternarFiltroEstoque={(alvoDoFiltro) => setFiltroEstoque(v => (v === alvoDoFiltro ? "" : alvoDoFiltro))}
        contagemDoEstoque={contagemDoEstoque}
        limparFiltros={limparFiltros}
        totalFiltradas={filteredItems.length}
        totalNaFila={pendingItems.length}
        totalSelecionadas={selectedItemIds.size}
        toggleAll={toggleAll}
        totalDeEventoFinalizado={selosPorItem.size}
        emTabela={!listaEmCartoes}
      >
        {selecaoLote.ids.length > 0 && (
          <BarraDoLote
            isMobile={isMobile}
            dedo={dedo}
            alturaControle={alturaControle}
            selecaoLote={selecaoLote}
            loteDeLiberar={loteDeLiberar}
            avisoLoteFinalizadas={avisoLoteFinalizadas}
            liberando={bulkReleaseMutation.isPending}
            devolvendo={bulkReturnMutation.isPending}
            reaproveitando={bulkReuseMutation.isPending}
            aoLimparSelecao={() => setSelectedItemIds(new Set())}
            aoLiberar={() => setBulkReleaseConfirmOpen(true)}
            aoDevolver={() => setBulkReturnConfirmOpen(true)}
            aoReaproveitar={() => setBulkReuseConfirmOpen(true)}
          />
        )}
      </BarraDeFiltros>

      {/* A FILA: vazia, em cartões ou em tabela. */}
      <section style={{ padding: isMobile ? "12px 12px" : listaEmCartoes ? "20px" : "32px", maxWidth: 1200, margin: "0 auto", paddingBottom: isMobile ? (selecaoLote.ids.length > 0 ? 180 : 24) : 80 }}>
        {filteredItems.length === 0 ? (
          <EstadoVazio
            icone={pendingItems.length === 0 ? CheckCircle : Search}
            // Tudo revisado é boa notícia: o ícone verde, como no vazio das outras filas.
            tom={pendingItems.length === 0 ? "sucesso" : undefined}
            titulo={pendingItems.length === 0 ? "Tudo revisado!" : "Nenhuma peça neste recorte"}
            descricao={
              <>
                {pendingItems.length === 0
                  ? "Não há peças aguardando revisão no momento."
                  : `${pendingItems.length} ${pendingItems.length === 1 ? "peça aguardando revisão ficou" : "peças aguardando revisão ficaram"} fora da busca e dos filtros.`}
                {/* "POR QUE A PEÇA NÃO ESTÁ AQUI?" — a pergunta de quem chega
                    procurando uma peça específica. A resposta é a regra de
                    entrada da fila, dita onde a ausência é notada. */}
                <span data-testid="regra-da-fila-revisao" style={{ display: "block", fontSize: FS.meta, color: T.apoio, marginTop: 10, lineHeight: 1.5 }}>
                  Aqui só entram peças que a Arte mandou para a revisão final. Peça ainda em criação na Arte, em aprovação do patrocinador
                  ou já liberada para a Gráfica não aparece — abra o evento dela para ver em que etapa está.
                  {user?.role === "solicitacao" && !user?.kit ? " Peças do Kit são revisadas pela equipe do Kit." : ""}
                </span>
              </>
            }
            acao={pendingItems.length > 0 ? (
              <Botao
                variante="secundario"
                tamanho={dedo ? "toque" : "md"}
                onClick={limparFiltros}
                data-testid="button-clear-filters-empty"
              >
                Limpar filtros
              </Botao>
            ) : undefined}
          />
        ) : listaEmCartoes ? (
          <ListaEmCartoes
            itemsByEvent={itemsByEvent}
            getEventInfo={getEventInfo}
            selectedItemIds={selectedItemIds}
            seloDoItem={seloDoItem}
            estoquePorPeca={estoquePorPeca}
            falhasPorId={falhasPorId}
            desfazendoReuse={desfazendoReuse}
            dedo={dedo}
            admin={admin}
            agora={agora}
            aoAbrir={openModal}
            aoMarcar={toggleItem}
            aoReaproveitar={abrirReaproveitamento}
            aoExcluir={setDeleteConfirmItemId}
          />
        ) : (
          <TabelaDaRevisao
            itemsByEvent={itemsByEvent}
            getEventInfo={getEventInfo}
            selectedItemIds={selectedItemIds}
            setSelectedItemIds={setSelectedItemIds}
            toggleAll={toggleAll}
            totalFiltradas={filteredItems.length}
            typeToGroup={typeToGroup}
            seloDoItem={seloDoItem}
            estoquePorPeca={estoquePorPeca}
            falhasPorId={falhasPorId}
            desfazendoReuse={desfazendoReuse}
            compacto={compacto}
            colunasDeDados={colunasDeDados}
            dedo={dedo}
            admin={admin}
            agora={agora}
            aoAbrir={openModal}
            aoMarcar={toggleItem}
            aoReaproveitar={abrirReaproveitamento}
            aoExcluir={setDeleteConfirmItemId}
          />
        )}
      </section>

      <ModalDeDecisao
        open={modalOpen}
        onOpenChange={open => { setModalOpen(open); if (!open) setReturnObservations(""); }}
        aoFechar={() => setModalOpen(false)}
        isMobile={isMobile}
        dedo={dedo}
        fonteDeCampo={fonteDeCampo}
        selectedItem={selectedItem}
        subtitulo={subtituloDaFicha}
        filaIdx={filaIdx}
        totalNaFila={filteredItems.length}
        temAnterior={temAnterior}
        temProxima={temProxima}
        irParaFila={irParaFila}
        seloSelecionado={seloSelecionado}
        editingQuantity={editingQuantity}
        setEditingQuantity={setEditingQuantity}
        quantityValue={quantityValue}
        setQuantityValue={setQuantityValue}
        quantityInputRef={quantityInputRef}
        salvandoQuantidade={updateQuantityMutation.isPending}
        aoSalvarQuantidade={() => { if (selectedItem) updateQuantityMutation.mutate({ itemId: selectedItem.id, quantity: quantityValue }); }}
        aoCopiarCaminho={(caminho) => {
          navigator.clipboard.writeText(caminho)
            .then(() => toast({ title: "Caminho copiado", description: "Cole no Explorer para abrir o arquivo.", variant: "success" }))
            .catch(() => toast({ title: "Não foi possível copiar", description: "Selecione o caminho e copie manualmente.", variant: "warning" }));
        }}
        semArquivoParaLiberar={semArquivoParaLiberar}
        liberando={creatorReviewMutation.isPending}
        rotuloDaProposta={propostaDaFicha ? propostaDaFicha.rotulo : null}
        aoLiberar={() => setReleaseConfirmOpen(true)}
        aoDevolver={() => setReturnConfirmOpen(true)}
        aoReaproveitar={abrirReaproveitamento}
        reaproveitando={toggleReuseMutation.isPending}
        desfazendo={!!selectedItem && desfazendoReuse(selectedItem.id)}
        pecaDaFicha={pecaDaFicha}
        fichaTravada={fichaTravada}
        podeTravar={podeTravar(user?.role)}
        destravando={destravarMutation.isPending}
        aoTravar={(peca) => { setMotivoDaTrava(""); setTravandoItem(peca); }}
        aoDestravar={(peca) => destravarMutation.mutate({ itemId: peca.id, displayId: peca.displayId })}
        usarMenos={usarMenos}
        setUsarMenos={setUsarMenos}
        cardObservations={cardObservations}
        setCardObservations={setCardObservations}
        salvandoObservacao={updateObservationsMutation.isPending}
        aoSalvarObservacao={(itemId) => updateObservationsMutation.mutate({ itemId, observations: cardObservations })}
        historicoCarregando={historicoCarregando}
        itemAuditLogs={itemAuditLogs}
      />

      <ConfirmarLiberacao
        open={releaseConfirmOpen}
        onOpenChange={setReleaseConfirmOpen}
        dedo={dedo}
        selectedItem={selectedItem}
        propostaDaFicha={propostaDaFicha}
        usarMenos={usarMenos}
        fichaTravada={fichaTravada}
        pecaDaFicha={pecaDaFicha}
        pedidoEmAberto={pedidoEmAberto}
        liberando={creatorReviewMutation.isPending}
        botaoConfirmarRef={botaoConfirmarLiberarRef}
        aoLiberar={(pedido) => creatorReviewMutation.mutate(pedido)}
      />

      <ConfirmarDevolucao
        open={returnConfirmOpen}
        onOpenChange={setReturnConfirmOpen}
        dedo={dedo}
        fonteDeCampo={fonteDeCampo}
        selectedItem={selectedItem}
        destino={destinoDevolucao}
        aoEscolherDestino={setDestinoDevolucao}
        motivo={returnObservations}
        setMotivo={setReturnObservations}
        devolvendo={returnToArteMutation.isPending}
        aoDevolver={(pedido) => returnToArteMutation.mutate(pedido)}
      />

      <ConfirmarLoteLiberar
        open={bulkReleaseConfirmOpen}
        onOpenChange={setBulkReleaseConfirmOpen}
        dedo={dedo}
        loteDeLiberar={loteDeLiberar}
        selecaoLote={selecaoLote}
        reaproveitadasNoLote={reaproveitadasNoLote}
        propostasDoLote={propostasDoLote}
        avisoLoteFinalizadas={avisoLoteFinalizadas}
        liberando={bulkReleaseMutation.isPending}
        aoLiberar={() => bulkReleaseMutation.mutate({ prontas: loteDeLiberar.prontas, deFora: loteDeLiberar.deFora })}
      />

      <ConfirmarLoteDevolver
        open={bulkReturnConfirmOpen}
        onOpenChange={setBulkReturnConfirmOpen}
        dedo={dedo}
        fonteDeCampo={fonteDeCampo}
        selecaoLote={selecaoLote}
        avisoLoteFinalizadas={avisoLoteFinalizadas}
        moldesNoLote={moldesNoLote}
        loteSoDeMoldes={loteSoDeMoldes}
        destino={destinoDevolucao}
        aoEscolherDestino={setDestinoDevolucao}
        motivo={bulkReturnObservations}
        setMotivo={setBulkReturnObservations}
        devolvendo={bulkReturnMutation.isPending}
        aoDevolver={() => bulkReturnMutation.mutate({ ids: selecaoLote.vivas, notes: bulkReturnObservations, destino: destinoDevolucao })}
      />

      <ConfirmarLoteReaproveitar
        open={bulkReuseConfirmOpen}
        onOpenChange={setBulkReuseConfirmOpen}
        dedo={dedo}
        selecaoLote={selecaoLote}
        avisoLoteFinalizadas={avisoLoteFinalizadas}
        reaproveitando={bulkReuseMutation.isPending}
        aoReaproveitar={() => bulkReuseMutation.mutate(selecaoLote.vivas)}
      />

      <DialogoReaproveitamento
        itemId={reuseDialogItemId}
        pendingItems={pendingItems}
        dedo={dedo}
        isMobile={isMobile}
        admin={admin}
        partialReuseQty={partialReuseQty}
        setPartialReuseQty={setPartialReuseQty}
        ocupado={toggleReuseMutation.isPending || partialReuseMutation.isPending}
        salvandoParte={partialReuseMutation.isPending}
        aoFechar={() => setReuseDialogItemId(null)}
        aoReaproveitarTudo={(dialogItem) => {
          avancarSeDaFicha(dialogItem.id);
          toggleReuseMutation.mutate({ itemId: dialogItem.id, isReuse: true });
          setReuseDialogItemId(null);
        }}
        aoReaproveitarParte={(dialogItem) => {
          avancarSeDaFicha(dialogItem.id);
          partialReuseMutation.mutate({ itemId: dialogItem.id, reuseQty: partialReuseQty });
        }}
      />

      <ConfirmarDesfazerReaproveitamento
        itemId={desfazerReuseId}
        pendingItems={pendingItems}
        dedo={dedo}
        desfazendo={toggleReuseMutation.isPending}
        aoFechar={() => setDesfazerReuseId(null)}
        aoDesfazer={(itemId) => toggleReuseMutation.mutate({ itemId, isReuse: false })}
      />

      <DialogoTravar
        travandoItem={travandoItem}
        motivoDaTrava={motivoDaTrava}
        setMotivoDaTrava={setMotivoDaTrava}
        dedo={dedo}
        fonteDeCampo={fonteDeCampo}
        travando={travarMutation.isPending}
        aoFechar={() => { setTravandoItem(null); setMotivoDaTrava(""); }}
        aoTravar={(pedido) => travarMutation.mutate(pedido)}
      />

      <ConfirmarExclusao
        itemId={deleteConfirmItemId}
        pendingItems={pendingItems}
        dedo={dedo}
        excluindo={deleteItemMutation.isPending}
        aoFechar={() => setDeleteConfirmItemId(null)}
        aoExcluir={(itemId) => deleteItemMutation.mutate(itemId)}
      />

      {/* Aumentar quantidade — mesmo modal das outras telas. Aqui ele é a saída
          do 409 USE_COMPLEMENT: a peça saiu de revisão e entrou em produção
          enquanto o modal estava aberto. */}
      <AumentarQuantidadeDialog
        item={complementItem}
        event={complementItem ? events.find((e) => e.id === complementItem.eventId) ?? null : null}
        open={!!complementItem}
        sugestao={complementSugestao}
        onOpenChange={(o) => { if (!o) { setComplementItem(null); setComplementSugestao(null); } }}
      />

    </div>
  );
}
