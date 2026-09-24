import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { CheckCircle, Clock, FileCheck, Lock, RotateCcw, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePecaDoLink, buscarCodigoDaPeca } from "@/hooks/use-peca-do-link";
import { useIsMobile, useDensidadeDoConteudo, usePonteiroGrosso } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/auth-context";
import { fileNameFromPath } from "@/lib/utils";
// Motor de PDF compartilhado (mesmo da tela de Atendimento) — a Arte não tem
// mais motor próprio; qualquer ajuste de layout do book vale para as duas telas.
import { exportMixedToPDF } from "@/lib/artePdfExport";
// Trocar arquivo final/thumb depois que a peça andou: a MESMA regra que as
// rotas update-final-file e update-thumb aplicam — a tela não oferece o que o
// servidor nega.
import { regraDaTrocaDeArquivoFinal, regraDaTrocaDeThumb, MOTIVO_TROCA_MIN } from "@shared/troca-de-material";
// Raio e paleta vêm de fonte, não do dedo (lib/theme): a Arte chegou a usar
// dezenove raios e hex copiados à mão.
import { T, N } from "@/lib/theme";
// Regras puras (recortes de status, predicado de filtro, prazo por fase,
// vínculo do multi-upload) — testadas em server/__tests__/arte-rules.test.ts.
import {
  TAB_STATUSES,
  filtersKey,
  makeDateBounds,
  parseArteFilters,
  faltamNoMotivo,
} from "@/lib/arte-rules";
import { ExportPdfDialog } from "@/components/export-pdf-dialog";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import { EsqueletoDeFila } from "@/components/esqueleto-de-fila";
import { useConfirmar } from "@/components/ui/usar-confirmar";
import { BuscarArteDialog, imagemDaArte, type ArteEncontrada } from "@/components/buscar-arte-dialog";
import { ARTE_PAGE_SIZE } from "@/components/arte/constantes";
import { useFiltrosDaArte } from "@/components/arte/use-filtros-da-arte";
import { useFilaDaArte } from "@/components/arte/use-fila-da-arte";
import { useAcoesDaArte } from "@/components/arte/use-acoes-da-arte";
import { useUploadsDaArte } from "@/components/arte/use-uploads-da-arte";
import { useLoteDeThumbs } from "@/components/arte/use-lote-de-thumbs";
import { useBookDaArte } from "@/components/arte/use-book-da-arte";
import { ChipsAtivos, useChipsAtivos } from "@/components/arte/chips-ativos";
import { CabecalhoDaArte } from "@/components/arte/cabecalho-da-arte";
import { BarraDeFiltros, OrdenarDaArte } from "@/components/arte/barra-de-filtros";
import { FasesESelecao } from "@/components/arte/fases-e-selecao";
import { FilaAgrupada } from "@/components/arte/fila-agrupada";
import { AbaCorrecao } from "@/components/arte/aba-correcao";
import { ErroDeCarga } from "@/components/arte/erro-de-carga";
import { DialogoDispensar } from "@/components/arte/dialogo-dispensar";
import { DialogoDevolver } from "@/components/arte/dialogo-devolver";
import { DialogoCorrecao } from "@/components/arte/dialogo-correcao";
import { BotaoDoArquivoFinal, PainelDeFinalizacao, useSugestaoDoArquivoFinal } from "@/components/arte/painel-finalizacao";
import { PainelDoThumbDeAprovacao } from "@/components/arte/painel-thumb-aprovacao";
import { DialogoPdfCompartilhado } from "@/components/arte/dialogo-pdf-compartilhado";
import { DialogoBook } from "@/components/arte/dialogo-book";
import { DialogoThumbsEmLote } from "@/components/arte/dialogo-thumbs-em-lote";
import type { AcoesDaLinha, BuscaDeArte, PecaDaArte, PecaDaCorrecao } from "@/components/arte/tipos";

// ─────────────────────────────────────────────────────────────────────────────
// A TELA DA ARTE — composição. O estado dos modais e da seleção mora aqui; as
// listas e contagens em useFilaDaArte, os filtros em useFiltrosDaArte, as
// gravações em useAcoesDaArte, e cada pedaço da tela em components/arte/.
// ─────────────────────────────────────────────────────────────────────────────
export default function Arte() {
  const { toast } = useToast();
  const { user } = useAuth();
  // Gate de papel. A rota admite `atendimento` (App.tsx: ROLES_ARTE), mas as
  // sete rotas de escrita da Arte no servidor só aceitam `arte`/`admin`. Sem
  // este espelho, o papel descobria o que não pode fazer ação por ação — e o
  // multi-upload chegava a subir 40 imagens para o bucket antes de tomar 40
  // respostas 403. Mesmo padrão de atendimento.tsx (canDecide) e grafica.tsx
  // (canProduce), as duas telas irmãs que já admitem um segundo papel.
  const podeEditar = ["arte", "admin"].includes(user?.role ?? "");

  // ── Estado inicial vindo da URL ──────────────────────────────────────────
  // O recorte "evento X + sem thumb + saída 10 dias" era remontado do zero todo
  // dia e não dava para mandar para um colega: a tela sincroniza com
  // URLSearchParams, como as outras.
  const urlInicial = useMemo(() => parseArteFilters(window.location.search), []);

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  // Persiste a aba ativa para não voltar ao padrão ao abrir uma peça e retornar.
  // A URL vence o sessionStorage: link compartilhado tem de abrir na fase certa.
  const [activeTab, setActiveTab] = useState<string>(
    () => urlInicial.tab || sessionStorage.getItem("arte:activeTab") || "criar-aprovacoes",
  );
  useEffect(() => { sessionStorage.setItem("arte:activeTab", activeTab); }, [activeTab]);

  // A aba ativa é persistida: quem voltar numa janela estreita precisa
  // ENXERGAR onde está, e não só poder rolar até lá.
  useEffect(() => {
    const alvo = tablistRef.current?.querySelector('[aria-selected="true"]');
    alvo?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [activeTab]);

  // Quem rola nesta tela é a área de conteúdo (o <main> do app é overflow:hidden),
  // por isso o scroll precisa ser feito nela e não na window.
  // A MESMA caixa decide tabela × cartões pela régua da área útil (menos o
  // padding horizontal dela: 12+12 no celular, 32+32 fora): com a sidebar
  // aberta, uma janela de 1000px deixa ~740 para a lista.
  const { ref: contentRef, cards: emCartoes, larguraUtil } = useDensidadeDoConteudo<HTMLDivElement>(useIsMobile() ? 24 : 64);
  const tablistRef = useRef<HTMLDivElement>(null);
  const raizRef = useRef<HTMLDivElement>(null);
  // Onde mora o Ordenar: na barra da busca quando ela tem largura; no celular
  // e na área estreita (tablet em pé com a sidebar, < 640px úteis) ele vira o
  // ícone ⇅ ao lado do seletor de fase — na barra ele caía sozinho numa linha.
  const ordenarJuntoDaFase = useIsMobile() || (larguraUtil > 0 && larguraUtil < 640);

  // Paginação da tabela — ver FilaAgrupada.
  const [visibleCount, setVisibleCount] = useState(ARTE_PAGE_SIZE);
  const [showAllTravando, setShowAllTravando] = useState(false);
  // "Quem está travando" nasce RECOLHIDO: a Arte não age nesta fila — quem
  // cobra é o Atendimento. O resumo de uma linha fica à vista; o ranking abre
  // num clique.
  const [travandoAberto, setTravandoAberto] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // Trocar de aba troca a lista inteira; manter o scroll onde estava deixava o
  // usuário no meio da tabela nova. Sempre volta ao topo da listagem.
  const changeTab = useCallback((tabId: string) => {
    setActiveTab(tabId);
    setVisibleCount(ARTE_PAGE_SIZE);
    // A seleção sobrevivia à troca de aba e alimentava a exportação sem
    // aparecer em lugar nenhum: em "Correção" o botão de seleção nem é
    // renderizado, mas o cabeçalho continuava dizendo "Exportar N sel.".
    setSelectedItemIds(new Set());
    // No celular quem rola é a raiz (o topo rola junto); fora dele, a lista.
    // As duas vão ao topo — a que não rola simplesmente ignora.
    requestAnimationFrame(() => {
      contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      raizRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, []);
  const [finalFileUrl, setFinalFileUrl] = useState<string>("");
  const [finalFileName, setFinalFileName] = useState<string>("");
  // true quando a Arte trocou o caminho nesta sessão (evita "atualizar" sem mudar).
  const [finalDirty, setFinalDirty] = useState(false);
  const [approvalThumbUrl, setApprovalThumbUrl] = useState<string>("");
  const [approvalThumbPreview, setApprovalThumbPreview] = useState<string>("");
  const [savedApprovalThumbUrl, setSavedApprovalThumbUrl] = useState<string>("");
  const [thumbJustSaved, setThumbJustSaved] = useState(false);
  // A aba Finalizados acumula todo o histórico e nunca para de crescer.
  const [finalizadosTudo, setFinalizadosTudo] = useState(false);

  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [sharedPdfUrl, setSharedPdfUrl] = useState<string>("");

  const [correcaoItem, setCorrecaoItem] = useState<PecaDaCorrecao | null>(null);
  const [correcaoThumbUrl, setCorrecaoThumbUrl] = useState<string>("");
  const [correcaoFileName, setCorrecaoFileName] = useState<string>("");

  const filtros = useFiltrosDaArte(urlInicial, activeTab);
  const { filters, activeFilterCount, clearAllFilters, eventFilter, sponsorFilter, setSponsorFilter } = filtros;

  // Âncora de "hoje" ESTÁVEL: um estado com tique de 10 min, o mesmo padrão
  // da Gráfica (`agora`). A data só muda quando o relógio muda, e aí a tela
  // inteira muda junto — duas partes da mesma tela nunca respondem dias
  // diferentes numa aba aberta durante a virada do dia.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 600_000);
    return () => clearInterval(id);
  }, []);
  const dateBounds = useMemo(() => makeDateBounds(new Date(agora)), [agora]);
  const hoje = dateBounds.today;

  const isMobile = useIsMobile();
  // Alvo de 44px: ponteiro grosso (o tablet do galpão é tocado com o dedo) OU
  // celular — a régua da casa vale para os dois.
  const dedo = usePonteiroGrosso() || isMobile;
  const { confirmar, dialogo: dialogoDeConfirmacao } = useConfirmar();
  const [dispenseItem, setDispenseItem] = useState<PecaDaArte | null>(null);
  const [dispenseReason, setDispenseReason] = useState<string>("");
  // Devolver ao solicitante: a peça volta para RASCUNHO e quem a criou decide
  // se continua ou descarta — ver DialogoDevolver.
  const [devolverItem, setDevolverItem] = useState<PecaDaArte | null>(null);
  const [devolverMotivo, setDevolverMotivo] = useState<string>("");
  // Trava só a linha em curso: o estado da mutação é compartilhado, então
  // enquanto um envio direto corria TODAS as linhas ficavam desabilitadas.
  const [sendingId, setSendingId] = useState<string | null>(null);

  const fila = useFilaDaArte({
    filters,
    eventFilter,
    sponsorFilter,
    typeFilter: filtros.typeFilter,
    materialFilter: filtros.materialFilter,
    monthFilter: filtros.monthFilter,
    paradasFilter: filtros.paradasFilter,
    activeTab, finalizadosTudo, sortMode: filtros.sortMode, agora, dateBounds, selectedItemId,
  });
  const {
    events, isLoading, isError, error, refetch, finalizadosLoading, finalizadosIsError, refetchFinalizados,
    pecasDoServidor, correcaoLoading, correcaoIsError, correcaoError, refetchCorrecao,
    allItems, itemPorId, correcaoItems, selectedItem, auditLogs, groupOf, eventosComBook, arteItemsPool,
    filteredItems, pendingCount, aguardandoCount, needsFinalFileCount, finalizadosCount, correcaoCount,
  } = fila;
  const { activeChips, removeChipFilter, nFiltrosEscondidos } = useChipsAtivos(filtros, {
    events, uniqueSponsors: fila.uniqueSponsors, correcaoItems,
  });

  const uploads = useUploadsDaArte({
    toast, selectedItem, approvalThumbUrl, setApprovalThumbUrl, setApprovalThumbPreview,
    correcaoItem, setCorrecaoThumbUrl, setCorrecaoFileName,
  });
  const { getUploadUrl, isPasteUploading, uploadFileDirect, concluirEnvioDoThumb, focarEnvioParaAprovacao } = uploads;
  const [isDragOver, setIsDragOver] = useState(false);

  // Qualquer mudança de recorte recomeça a paginação. A dependência é uma CHAVE
  // do recorte, não a identidade do objeto de baldes: `itemsByTab` é um objeto
  // novo a cada `item_updated` do WebSocket, e quem tinha clicado "Carregar
  // mais" três vezes perdia a posição sem ter feito nada.
  const recorteKey = filtersKey(filters, activeTab) + (finalizadosTudo ? "~tudo" : "") + (filtros.paradasFilter ? "~paradas" : "");
  useEffect(() => { setVisibleCount(ARTE_PAGE_SIZE); }, [recorteKey]);

  // Re-sincroniza o preview do thumb caso a query de items refaça o estado
  // após salvar rascunho (dupla invalidação: onSuccess + WebSocket item_updated).
  useEffect(() => {
    if (selectedItem?.approvalThumbUrl && !approvalThumbPreview) {
      setApprovalThumbUrl(selectedItem.approvalThumbUrl);
      setApprovalThumbPreview(selectedItem.approvalThumbUrl);
    }
    if (selectedItem?.approvalThumbUrl && !savedApprovalThumbUrl) {
      setSavedApprovalThumbUrl(selectedItem.approvalThumbUrl);
    }
    // approvalThumbPreview nas deps: o efeito lê o valor; o guard acima já
    // impede loop (só grava quando o preview está vazio).
  }, [selectedItem?.approvalThumbUrl, savedApprovalThumbUrl, approvalThumbPreview]);

  const handleViewDetails = (item: PecaDaArte) => {
    setSelectedItemId(item.id);
    setApprovalThumbUrl(item.approvalThumbUrl || "");
    setApprovalThumbPreview(item.approvalThumbUrl || "");
    setSavedApprovalThumbUrl(item.approvalThumbUrl || "");
    setThumbJustSaved(false);
    setFinalFileUrl(item.finalFileUrl || "");
    setFinalFileName(item.finalFileName || fileNameFromPath(item.finalFileUrl) || (item.finalFileUrl ? "arquivo enviado" : ""));
    setFinalDirty(false);
  };

  // Deep link `?item=` (sino e "Resolver em Arte →" da Gestão de Prazos): abre
  // a ficha JÁ na fase em que a peça está. A fase sai de onde a própria tela
  // a coloca — Correção quando veio de /resubmission-needed (é lá que a ação
  // de reenvio mora), senão o balde de TAB_STATUSES. Peça sem fase aqui (já
  // na Revisão Final, na Gráfica…) não está nesta fila: o hook avisa.
  usePecaDoLink<{ peca: PecaDaArte; aba: string }>({
    // Espera as DUAS listas: um link para peça já entregue chegaria antes dos
    // Finalizados e diria "não está nesta fila" sobre uma peça que está.
    pronto: !isLoading && !finalizadosLoading && !correcaoLoading && !isError && !correcaoIsError,
    localizar: (id) => {
      const emCorrecao = correcaoItems.find((i) => i.id === id);
      if (emCorrecao) return { peca: emCorrecao, aba: "correcao" };
      const peca = itemPorId.get(id);
      if (!peca) return null;
      const aba = Object.keys(TAB_STATUSES).find((t) => TAB_STATUSES[t].includes(peca.status));
      return aba ? { peca, aba } : null;
    },
    abrir: ({ peca, aba }) => {
      if (aba !== activeTab) changeTab(aba);
      handleViewDetails(peca);
    },
    // Fora das filas desta tela (rascunho, vinculação, cancelada) a peça não
    // está mais no cache — a lista vem recortada. Busca só ela para o aviso
    // continuar dizendo o código, como dizia quando o acervo inteiro descia.
    codigoDe: (id) =>
      pecasDoServidor.find((i) => i.id === id)?.displayId
      ?? correcaoItems.find((i) => i.id === id)?.displayId
      ?? buscarCodigoDaPeca(id),
  });

  /**
   * A peça SEGUINTE da fila aberta, na ordem em que a tela a mostra (Kit e
   * prioritárias no topo, depois evento e grupo) — a mesma lista, os mesmos
   * filtros. Só vale quando a aba ativa É a fila da ação: um envio feito com
   * outra aba aberta não tem "próxima" que a pessoa esteja vendo.
   */
  const proximaDaFila = (itemId: string, fila: string): PecaDaArte | null => {
    if (activeTab !== fila) return null;
    const i = filteredItems.findIndex((x) => x.id === itemId);
    if (i < 0) return null;
    return filteredItems.slice(i + 1).find((x) => x.id !== itemId) ?? null;
  };

  // Troca do thumb (Finalizar Arte / Revisão Final). A regra de quando pode e
  // quando pede motivo é `regraDaTrocaDeThumb` (shared/troca-de-material); o
  // thumb anterior fica guardado no item e no histórico.
  const [motivoTrocaThumb, setMotivoTrocaThumb] = useState("");

  const {
    submitForApprovalMutation, saveThumbDraftMutation, submitBulkForApprovalMutation, submitFinalFileMutation,
    updateThumbMutation, resubmitMutation, reenvioInteiroMutation, dispenseMutation, devolverMutation,
  } = useAcoesDaArte({
    toast, itemPorId, correcaoItems, correcaoItem, selectedItemId, proximaDaFila, handleViewDetails,
    setSelectedItemId, setApprovalThumbUrl, setApprovalThumbPreview, setSavedApprovalThumbUrl, setThumbJustSaved, setSendingId,
    setShowBulkDialog, setSelectedItemIds, setSharedPdfUrl, setFinalFileUrl, setFinalFileName, setFinalDirty, setMotivoTrocaThumb,
    setCorrecaoItem, setCorrecaoThumbUrl, setCorrecaoFileName, setDispenseItem, setDispenseReason, setDevolverItem, setDevolverMotivo,
  });

  const lote = useLoteDeThumbs({ allItems, correcaoItems, podeEditar, toast, confirmar, uploadFileRaw: uploads.uploadFileRaw });
  const book = useBookDaArte({ arteItemsPool, eventFilter, toast, uploadFileRaw: uploads.uploadFileRaw });

  // ── Exportação ───────────────────────────────────────────────────────────
  const [showExportModal, setShowExportModal] = useState(false);
  // Itens marcados na tabela, deduplicados (uma peça em correção também pode
  // estar em allItems). Alimenta o ExportPdfDialog quando há seleção.
  const selectedItems = useMemo(() => {
    if (selectedItemIds.size === 0) return [] as PecaDaArte[];
    const seen = new Set<string>();
    return [...allItems, ...correcaoItems].filter((i) => {
      if (!selectedItemIds.has(i.id) || seen.has(i.id)) return false;
      seen.add(i.id);
      return true;
    });
  }, [allItems, correcaoItems, selectedItemIds]);

  // "Exportar N sel." abre o MESMO modal de exportação, com a seleção como
  // pool — antes disparava a impressão direto, pulando as opções (agrupar,
  // capa, ordem) que o botão sem seleção oferecia.
  const handleClickExportButton = () => {
    setShowExportModal(true);
  };

  // O modal de exportação fica montado o tempo todo e recalcula oito facetas
  // sobre `items` sempre que a identidade do array muda — isto é, a cada
  // atualização de /api/items, com o modal FECHADO. Fechado, ele recebe o
  // último array que mostrou (mesma identidade, zero recálculo, e a animação
  // de saída continua com o conteúdo de antes); aberto, recebe o vivo.
  const itensDaExportacao = selectedItems.length > 0 ? selectedItems : arteItemsPool;
  const itensDaExportacaoRef = useRef<PecaDaArte[]>([]);
  if (showExportModal) itensDaExportacaoRef.current = itensDaExportacao;
  const itensDaExportacaoCongelados = showExportModal ? itensDaExportacao : itensDaExportacaoRef.current;

  const handleExportItemPDF = (item: PecaDaArte) => {
    void exportMixedToPDF([item], new Set(), `Prova — ${item.displayId || item.type}`);
  };

  // Fechar a Correção descartava um arquivo JÁ ENVIADO ao storage sem avisar.
  const fecharCorrecaoModal = useCallback(async (forcar = false) => {
    if (!forcar && correcaoThumbUrl) {
      const ok = await confirmar({
        titulo: "Descartar a nova versão?",
        descricao: "A nova versão foi carregada, mas ainda NÃO foi enviada aos patrocinadores. Fechar descarta o arquivo.",
        confirmar: "Descartar",
        cancelar: "Continuar editando",
        perigo: true,
      });
      if (!ok) return;
    }
    setCorrecaoItem(null);
    setCorrecaoThumbUrl("");
    setCorrecaoFileName("");
  }, [correcaoThumbUrl, confirmar]);

  // Última barreira do gate de papel: a UI já esconde as ações, mas um handler
  // exposto não pode contar só com isso.
  const bloqueadoPorPapel = () => {
    if (podeEditar) return false;
    // AVISO, não vermelho: é permissão, não falha. O vermelho dizia "algo
    // quebrou" a quem só está consultando a fila.
    toast({ title: "Modo consulta", description: "Só a equipe de Arte pode alterar peças nesta tela.", variant: "warning" });
    return true;
  };

  const handleSubmitForApproval = () => {
    if (bloqueadoPorPapel()) return;
    if (!selectedItem || !approvalThumbUrl) {
      // Título que diz O QUE falta: "Erro" sozinho soa como falha do sistema,
      // quando é só um passo que ainda não foi dado.
      toast({ title: "Falta o thumb de aprovação", description: "Suba o thumb (arraste, escolha ou cole com Ctrl+V) antes de enviar para aprovação.", variant: "warning" });
      return;
    }
    submitForApprovalMutation.mutate({ itemId: selectedItem.id, approvalThumbUrl });
  };

  // Salva o thumb sem enviar para aprovação (rascunho).
  const handleSaveThumbDraft = () => {
    if (bloqueadoPorPapel()) return;
    if (!selectedItem || !approvalThumbUrl) {
      toast({ title: "Falta o thumb", description: "Suba o thumb antes de salvar o rascunho.", variant: "warning" });
      return;
    }
    saveThumbDraftMutation.mutate({ itemId: selectedItem.id, approvalThumbUrl });
  };

  // Envia (ou atualiza) o caminho do arquivo final.
  const handleSubmitFinalFile = () => {
    if (bloqueadoPorPapel()) return;
    if (!selectedItem || !finalFileUrl) {
      toast({ title: "Falta o arquivo final", description: "Informe o caminho do arquivo final antes de enviar.", variant: "warning" });
      return;
    }
    const isUpdate = !!selectedItem.finalFileUrl; // já tinha arquivo → é atualização
    const regra = isUpdate ? regraDaTrocaDeArquivoFinal(selectedItem) : null;
    if (regra && !regra.pode) {
      toast({ title: "Não foi possível trocar o arquivo final", description: regra.motivo, variant: "warning" });
      return;
    }
    submitFinalFileMutation.mutate({ itemId: selectedItem.id, finalFileUrl, finalPreviewUrl: "", finalFileName: fileNameFromPath(finalFileUrl) || "", isUpdate });
  };

  // Trocar thumb / arquivo final da peça aberta: as regras do servidor. Só a
  // TROCA do arquivo final passa pela regra — o primeiro envio é outra rota.
  const regraThumbSel = selectedItem ? regraDaTrocaDeThumb(selectedItem) : null;
  const regraFinalSel = selectedItem?.finalFileUrl ? regraDaTrocaDeArquivoFinal(selectedItem) : null;
  const thumbPedeMotivo = !!regraThumbSel && regraThumbSel.pode && regraThumbSel.exigeMotivo;
  const faltamMotivoThumb = thumbPedeMotivo ? faltamNoMotivo(motivoTrocaThumb, MOTIVO_TROCA_MIN) : 0;
  // O motivo é da peça: trocar de peça não leva o texto junto.
  useEffect(() => { setMotivoTrocaThumb(""); }, [selectedItemId]);
  const { sugestaoVisivel, usarSugestaoFinal, ignorarSugestaoFinal } = useSugestaoDoArquivoFinal({
    selectedItem, podeEditar, finalFileUrl, setFinalFileUrl, setFinalFileName, setFinalDirty,
  });

  // ── BUSCAR ARTE JÁ FEITA ─────────────────────────────────────────────────
  //
  // "Para ele não precisar colocar o arquivo ou a thumb novamente e só
  // referenciar." O modal (components/buscar-arte-dialog.tsx) só ACHA a arte;
  // aplicar é encher o MESMO campo que o upload encheria. Daí em diante o
  // caminho é o de sempre — submit-for-approval, update-thumb,
  // sponsor-approvals/resubmit, submit-final-file — com os mesmos efeitos, a
  // mesma trilha e a mesma versão de arte. Nenhuma regra de negócio muda:
  // reaproveitar troca a ORIGEM da URL, não o fluxo de aprovação.
  //
  // `destino` em vez de guardar a função de aplicar no estado: função em
  // useState precisa de `setX(() => fn)` e some no primeiro esquecimento —
  // com o destino declarado, o que fazer com a arte fica num lugar só, aqui.
  const [buscaDeArte, setBuscaDeArte] = useState<BuscaDeArte | null>(null);

  const aplicarArteEncontrada = (arte: ArteEncontrada) => {
    if (!buscaDeArte) return;
    const de = `${arte.displayId ?? "peça"}${arte.eventName ? ` (${arte.eventName})` : ""}`;
    // A MESMA imagem que o modal mostrou na prévia (imagemDaArte).
    const imagem = imagemDaArte(arte);

    if (buscaDeArte.destino === "arquivo-final") {
      if (!arte.arquivoFinalUrl) {
        toast({ title: "Esta arte não tem arquivo final", description: "Escolha outra ou informe o caminho à mão.", variant: "warning" });
        return;
      }
      setFinalFileUrl(arte.arquivoFinalUrl);
      setFinalFileName(arte.arquivoFinalNome || fileNameFromPath(arte.arquivoFinalUrl) || "");
      // `finalDirty`: sem isto o botão "Atualizar arquivo" continua travado —
      // ele só libera quando o campo MUDA em relação ao que está gravado.
      setFinalDirty(true);
      setBuscaDeArte(null);
      toast({ title: `Arquivo final de ${de} aplicado`, description: "Confira o caminho e envie — a peça segue o fluxo normal.", variant: "success" });
      return;
    }

    if (!imagem) {
      toast({ title: "Esta arte não tem imagem", description: "Escolha outra arte da lista.", variant: "warning" });
      return;
    }

    if (buscaDeArte.destino === "thumb-troca") {
      // Última barreira do gate de papel, como em todo handler que GRAVA: os
      // outros destinos só enchem um campo, este manda para o servidor.
      if (bloqueadoPorPapel()) return;
      // A arte escolhida já é a atual: não há o que gravar (o servidor
      // responderia 409 "igual ao atual" — em vermelho, para um clique que não
      // errou nada). Aviso neutro e o modal fecha.
      if (itemPorId.get(buscaDeArte.itemId)?.approvalThumbUrl === imagem) {
        setBuscaDeArte(null);
        toast({ title: "Essa já é a arte atual desta peça", variant: "warning" });
        return;
      }
      // A troca do thumb já aprovado grava NA HORA, pela mutação de sempre
      // (update-thumb): mesma revogação de aprovação estrita, mesma versão de
      // arte, mesma trilha — e o mesmo motivo quando a regra o exige.
      const alvo = itemPorId.get(buscaDeArte.itemId);
      const regra = regraDaTrocaDeThumb(alvo);
      if (!regra.pode) {
        setBuscaDeArte(null);
        toast({ title: "Não dá para trocar o thumb", description: regra.motivo, variant: "warning" });
        return;
      }
      if (regra.exigeMotivo && faltamNoMotivo(motivoTrocaThumb, MOTIVO_TROCA_MIN) > 0) {
        setBuscaDeArte(null);
        toast({ title: "Falta o motivo da troca", description: `Escreva no campo do thumb, em pelo menos ${MOTIVO_TROCA_MIN} caracteres, por que ele está sendo trocado.`, variant: "warning" });
        return;
      }
      updateThumbMutation.mutate({
        itemId: buscaDeArte.itemId, approvalThumbUrl: imagem, origem: de, statusAntes: alvo?.status,
        motivo: regra.exigeMotivo ? motivoTrocaThumb.trim().replace(/\s+/g, " ") : undefined,
      });
      setBuscaDeArte(null);
      return;
    }

    if (buscaDeArte.destino === "thumb-correcao") {
      setCorrecaoThumbUrl(imagem);
      setCorrecaoFileName(imagem.split("/").pop() || "Arte reaproveitada");
    } else {
      // Mesmo par de setters do upload: a miniatura aparece e o "Enviar para
      // aprovação" destrava, porque `approvalThumbUrl` é o que ele exige.
      concluirEnvioDoThumb(imagem);
      focarEnvioParaAprovacao();
    }
    setBuscaDeArte(null);
    toast({ title: `Arte de ${de} aplicada`, description: "Confira a miniatura e envie — a peça segue o fluxo normal de aprovação.", variant: "success" });
  };

  const toggleItemSelection = (itemId: string) => {
    const s = new Set(selectedItemIds);
    if (s.has(itemId)) s.delete(itemId); else s.add(itemId);
    setSelectedItemIds(s);
  };

  const handleBulkSubmit = () => {
    if (bloqueadoPorPapel()) return;
    if (!sharedPdfUrl) {
      toast({ title: "Falta o PDF compartilhado", description: "Suba o PDF que vale para as peças selecionadas antes de enviar o lote.", variant: "warning" });
      return;
    }
    // A seleção persiste entre abas: só peças aguardando envio aceitam
    // submit-for-approval — as demais devolveriam 409 no meio do lote.
    const ids = Array.from(selectedItemIds);
    const elegiveis = ids.filter(id => itemPorId.get(id)?.status === 'awaiting_submission');
    const foraDoLote = ids.length - elegiveis.length;
    if (elegiveis.length === 0) {
      toast({ title: "Nenhuma peça elegível", description: "Só peças aguardando envio podem receber o PDF compartilhado.", variant: "warning" });
      return;
    }
    if (foraDoLote > 0) {
      toast({ title: `${foraDoLote} ${foraDoLote === 1 ? 'peça ficou fora' : 'peças ficaram fora'} do lote`, description: `Só ${elegiveis.length === 1 ? 'a peça aguardando envio segue' : `as ${elegiveis.length} peças aguardando envio seguem`} para aprovação.`, variant: "warning" });
    }
    submitBulkForApprovalMutation.mutate({ itemIds: elegiveis, pdfUrl: sharedPdfUrl });
  };

  // ─── AÇÕES DA LINHA — um objeto ESTÁVEL ─────────────────────────────────
  // A linha e o cartão são memoizados (LinhaDaArte, CartaoDaArte): se os
  // gestos fossem closures novas a cada render, toda tecla num modal
  // redesenharia a fila inteira. O objeto nasce uma vez e cada gesto chama a
  // versão do render ATUAL pelo ref — nunca um valor velho.
  const gestosDaLinha = useRef<AcoesDaLinha | null>(null);
  gestosDaLinha.current = {
    verDetalhes: handleViewDetails,
    alternarSelecao: toggleItemSelection,
    enviarDireto: (item) => {
      setSendingId(item.id);
      submitForApprovalMutation.mutate({ itemId: item.id, approvalThumbUrl: item.approvalThumbUrl ?? "" });
    },
    exportarProva: handleExportItemPDF,
    dispensar: (item) => { setDispenseItem(item); setDispenseReason(""); },
    devolver: (item) => { setDevolverItem(item); setDevolverMotivo(""); },
  };
  const acoesDaLinha = useMemo<AcoesDaLinha>(() => ({
    verDetalhes: (item) => gestosDaLinha.current?.verDetalhes(item),
    alternarSelecao: (itemId) => gestosDaLinha.current?.alternarSelecao(itemId),
    enviarDireto: (item) => gestosDaLinha.current?.enviarDireto(item),
    exportarProva: (item) => gestosDaLinha.current?.exportarProva(item),
    dispensar: (item) => gestosDaLinha.current?.dispensar(item),
    devolver: (item) => gestosDaLinha.current?.devolver(item),
  }), []);
  // "Enviar nova arte" na Correção: só setters, então estável de nascença.
  const abrirCorrecao = useCallback((item: PecaDaCorrecao) => {
    setCorrecaoItem(item);
    setCorrecaoThumbUrl("");
    setCorrecaoFileName("");
  }, []);

  // ─── RENDER ────────────────────────────────────────────────────────────────
  // "Aguardando envio" e não "Mandar para Aprovação"/"Pendentes": a mesma fase
  // tinha quatro nomes na tela (aba, stat card, selo e empty state), e um deles
  // ("Liberado") é o rótulo de OUTRO status. Memoizadas: a fila recebe as abas
  // como prop e é memoizada.
  const tabs = useMemo(() => [
    { id: "criar-aprovacoes", label: "Aguardando envio", count: pendingCount, Icon: Send, testId: "tab-criar-aprovacoes" },
    { id: "aguardando-patrocinador", label: "Aguardando patrocinador", count: aguardandoCount, Icon: Clock, testId: "tab-aguardando-patrocinador" },
    { id: "correcao", label: "Correção", count: correcaoCount, Icon: RotateCcw, testId: "tab-correcao" },
    { id: "finalizar-layouts", label: "Finalizar arte", count: needsFinalFileCount, Icon: FileCheck, testId: "tab-finalizar-layouts" },
    { id: "finalizados", label: "Finalizados", count: finalizadosCount, Icon: CheckCircle, testId: "tab-finalizados" },
  ], [pendingCount, aguardandoCount, correcaoCount, needsFinalFileCount, finalizadosCount]);

  // As MESMAS cinco abas, para o seletor de fase do celular. `pinned` mantém a
  // ordem do fluxo (aguardando envio → finalizados), que é a ordem em que a
  // peça anda; alfabética começaria por "Aguardando patrocinador" e terminaria
  // em "Finalizar arte", uma sequência que não existe no trabalho de ninguém.
  const faseFilterOptions = tabs.map(tab => ({
    value: tab.id, label: tab.label, count: tab.count, pinned: true,
  }));
  const faseAtualCount = tabs.find(t => t.id === activeTab)?.count ?? 0;
  // Correção vazia: a próxima fila em que a Arte age, como as outras abas
  // vazias oferecem (VazioDaFila). Memoizada — a aba é memoizada.
  const proximaFaseDaCorrecao = useCallback(() => {
    const t = tabs.find(x => x.id !== "correcao" && x.count > 0 && ["criar-aprovacoes", "finalizar-layouts"].includes(x.id));
    return t ? { label: t.label, count: t.count, ir: () => changeTab(t.id) } : undefined;
  }, [tabs, changeTab]);

  // Qual bloco de ação a ficha abre (só para quem edita):
  //   · 'thumb'       — aguardando envio: subir o thumb e enviar;
  //   · 'finalizacao' — aprovada: subir o arquivo final;
  //   · 'troca'       — já enviada (tem thumb ou arquivo final): trocar o que
  //                     a regra deixar, com o motivo escrito do que ela não deixa.
  const painelDaFicha: 'thumb' | 'finalizacao' | 'troca' | null = !selectedItem || !podeEditar ? null
    : selectedItem.status === 'awaiting_submission' ? 'thumb'
    : ['sponsor_approved', 'awaiting_creator_review'].includes(selectedItem.status) ? 'finalizacao'
    : (selectedItem.approvalThumbUrl || selectedItem.finalFileUrl) ? 'troca'
    : null;
  // A REGRA NEGA TUDO (dono, 24/09): peça entregue/produzida, em que nem o
  // thumb nem o arquivo final podem mais mudar. Em vez do bloco de troca
  // inteiro dizendo "não" duas vezes, UMA linha neutra com o motivo da regra.
  const trocaTodaNegada = painelDaFicha === 'troca' && !regraThumbSel?.pode && !regraFinalSel?.pode;
  // O envio do arquivo final aparece (1º envio ou troca permitida)? No celular ele vai para o rodapé.
  const ctaDoFinalNoRodape = isMobile && !trocaTodaNegada
    && (painelDaFicha === 'finalizacao' || (painelDaFicha === 'troca' && !!regraFinalSel?.pode));
  const motivoDaTrocaNegada = (regraFinalSel && !regraFinalSel.pode ? regraFinalSel.motivo : null)
    ?? (regraThumbSel && !regraThumbSel.pode ? regraThumbSel.motivo : null) ?? "";

  return (
    // ALTURA: `position: absolute; inset: 0` prende a tela na casca em vez de
    // pedir que ela caiba. Com `height: 100%` + `overflow: hidden` a casca
    // rolava TAMBÉM: dois scrollers verticais sobre a mesma lista, e a lista
    // podia parar no meio de uma linha com a tela em branco embaixo.
    // NO CELULAR O TOPO ROLA JUNTO (revisão de celular, 24/09). Fixo, ele
    // ocupava 443 dos 844px de um celular (52%): a primeira peça começava
    // abaixo da dobra e, no modo consulta, nenhuma aparecia. Agora quem rola
    // no celular é a caixa inteira — o topo sai de cena ao descer a lista,
    // como na Gráfica. No desktop/tablet ele segue fixo e a lista rola sozinha.
    <div ref={raizRef} data-testid="raiz-arte" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', overflowX: 'hidden', overflowY: isMobile ? 'auto' : 'hidden', overscrollBehavior: 'contain' }}>
      {/* ── TOPO (fixo fora do celular) ───────────────────────────────────── */}
      <div data-testid="topo-arte" style={{
        position: isMobile ? 'relative' : 'sticky', top: 0, zIndex: 40,
        background: T.surface,
        borderBottom: `1px solid ${T.border}`,
        flexShrink: 0,
      }}>
        <div style={{ padding: isMobile ? '12px 12px 0' : '20px 32px 0', maxWidth: 1600, margin: '0 auto' }}>
          <CabecalhoDaArte
            isMobile={isMobile}
            dedo={dedo}
            podeEditar={podeEditar}
            activeTab={activeTab}
            pendingCount={pendingCount}
            correcaoCount={correcaoCount}
            needsFinalFileCount={needsFinalFileCount}
            selectedItemIds={selectedItemIds}
            handleBulkThumbFilesAdded={lote.handleBulkThumbFilesAdded}
            handleClickExportButton={handleClickExportButton}
            openBookModal={book.openBookModal}
            setShowBulkDialog={setShowBulkDialog}
          />

          <BarraDeFiltros
            filtros={filtros}
            semOrdenar={ordenarJuntoDaFase}
            isMobile={isMobile}
            dedo={dedo}
            activeTab={activeTab}
            atrasadasNaAba={fila.atrasadasNaAba}
            faseAtualCount={faseAtualCount}
            saida10Count={fila.saida10Count}
            nFiltrosEscondidos={nFiltrosEscondidos}
            eventFilterOptions={fila.eventFilterOptions}
            sponsorFilterOptions={fila.sponsorFilterOptions}
            typeFilterOptions={fila.typeFilterOptions}
            materialFilterOptions={fila.materialFilterOptions}
            monthFilterOptions={fila.monthFilterOptions}
            periodFilterOptions={fila.periodFilterOptions}
          />

          <ChipsAtivos
            activeChips={activeChips}
            removeChipFilter={removeChipFilter}
            clearAllFilters={clearAllFilters}
            maisFiltrosAberto={filtros.maisFiltrosAberto}
            isMobile={isMobile}
            dedo={dedo}
          />

          <FasesESelecao
            isMobile={isMobile}
            dedo={dedo}
            podeEditar={podeEditar}
            activeTab={activeTab}
            changeTab={changeTab}
            tabs={tabs}
            faseAtualCount={faseAtualCount}
            faseFilterOptions={faseFilterOptions}
            tablistRef={tablistRef}
            selectedItemIds={selectedItemIds}
            setSelectedItemIds={setSelectedItemIds}
            filteredItems={filteredItems}
            ordenar={ordenarJuntoDaFase ? <OrdenarDaArte filtros={filtros} somenteIcone /> : undefined}
          />
        </div>
      </div>

      {/* ── 4. SCROLLABLE CONTENT AREA ────────────────────────────────────── */}
      <div
        ref={contentRef}
        id="painel-arte"
        role="tabpanel"
        aria-label={tabs.find(t => t.id === activeTab)?.label}
        style={{ flex: isMobile ? 'none' : 1, overflowY: isMobile ? 'visible' : 'auto', padding: isMobile ? '8px 12px 24px' : '24px 32px', maxWidth: 1600, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}
      >
      {/* O QUE SE FAZ NESTA FASE (GUIA_DA_FASE) mora no "?" ao lado do título. */}
      {isLoading ? (
        /* Silhueta em vez de spinner — mesma razão da Gráfica. */
        <EsqueletoDeFila linhas={8} />
      ) : isError || finalizadosIsError ? (
        // Terceiro ramo ANTES do conteúdo: enquanto houver erro, o empty state
        // de sucesso nunca é renderizado. As duas listas recortadas entram
        // aqui: uma aba de status vazia por falha de rede é indistinguível de
        // uma aba realmente vazia, e é isso que este ramo existe para evitar.
        <ErroDeCarga
          titulo="Não foi possível carregar a fila da Arte"
          erro={error}
          tentarDeNovo={() => { void refetch(); void refetchFinalizados(); }}
          testId="erro-arte"
        />
      ) : activeTab === "correcao" ? (
        // FRONTEIRA DE RENDER: AbaCorrecao e FilaAgrupada são memoizadas e
        // recebem só valores, setters e callbacks estáveis — o motivo digitado
        // num modal não redesenha a fila (perf5-arte-atendimento).
        <AbaCorrecao
          correcaoLoading={correcaoLoading}
          correcaoIsError={correcaoIsError}
          correcaoError={correcaoError}
          refetchCorrecao={refetchCorrecao}
          correcaoItems={correcaoItems}
          correcaoFiltrados={fila.correcaoFiltrados}
          correcaoSponsorFilter={filtros.correcaoSponsorFilter}
          setCorrecaoSponsorFilter={filtros.setCorrecaoSponsorFilter}
          activeFilterCount={activeFilterCount}
          clearAllFilters={clearAllFilters}
          podeEditar={podeEditar}
          dedo={dedo}
          emCartoes={emCartoes}
          hoje={hoje}
          groupOf={groupOf}
          abrirCorrecao={abrirCorrecao}
          proximaFase={proximaFaseDaCorrecao}
        />
      ) : (
        <FilaAgrupada
          items={filteredItems}
          tabId={activeTab}
          activeTab={activeTab}
          hoje={hoje}
          dedo={dedo}
          emCartoes={emCartoes}
          podeEditar={podeEditar}
          visibleCount={visibleCount}
          setVisibleCount={setVisibleCount}
          activeFilterCount={activeFilterCount}
          atrasadoFilter={filtros.atrasadoFilter}
          setAtrasadoFilter={filtros.setAtrasadoFilter}
          paradasFilter={filtros.paradasFilter}
          setParadasFilter={filtros.setParadasFilter}
          urgenteFilter={filtros.urgenteFilter}
          setUrgenteFilter={filtros.setUrgenteFilter}
          clearAllFilters={clearAllFilters}
          tabs={tabs}
          changeTab={changeTab}
          paradasNaAba={fila.paradasNaAba}
          atrasadasNaAba={fila.atrasadasNaAba}
          urgentesNaAba={fila.urgentesNaAba}
          showAllTravando={showAllTravando}
          setShowAllTravando={setShowAllTravando}
          travandoAberto={travandoAberto}
          setTravandoAberto={setTravandoAberto}
          sponsorFilter={sponsorFilter}
          setSponsorFilter={setSponsorFilter}
          finalizadosForaDaJanela={fila.finalizadosForaDaJanela}
          finalizadosTudo={finalizadosTudo}
          setFinalizadosTudo={setFinalizadosTudo}
          groupOf={groupOf}
          selectedItemIds={selectedItemIds}
          setSelectedItemIds={setSelectedItemIds}
          sendingId={sendingId}
          eventosComBook={eventosComBook}
          acoes={acoesDaLinha}
          larguraUtil={larguraUtil}
        />
      )}

      <DialogoDispensar
        dispenseItem={dispenseItem}
        setDispenseItem={setDispenseItem}
        dispenseReason={dispenseReason}
        setDispenseReason={setDispenseReason}
        dispenseMutation={dispenseMutation}
        dedo={dedo}
      />

      <DialogoDevolver
        devolverItem={devolverItem}
        setDevolverItem={setDevolverItem}
        devolverMotivo={devolverMotivo}
        setDevolverMotivo={setDevolverMotivo}
        devolverMutation={devolverMutation}
        dedo={dedo}
      />

      <DialogoCorrecao
        correcaoItem={correcaoItem}
        correcaoThumbUrl={correcaoThumbUrl}
        setCorrecaoThumbUrl={setCorrecaoThumbUrl}
        correcaoFileName={correcaoFileName}
        setCorrecaoFileName={setCorrecaoFileName}
        fecharCorrecaoModal={fecharCorrecaoModal}
        isPasteUploading={isPasteUploading}
        uploadFileDirect={uploadFileDirect}
        getUploadUrl={getUploadUrl}
        toast={toast}
        setBuscaDeArte={setBuscaDeArte}
        resubmitMutation={resubmitMutation}
        reenvioInteiroMutation={reenvioInteiroMutation}
        dedo={dedo}
      />

      {/* A ficha da peça, com o bloco de ação da fase por cima. */}
      <ItemDetailsDialog
        item={selectedItem}
        auditLogs={selectedItem ? auditLogs.filter((log) => log.entityType === 'item' && log.entityId === selectedItem.id) : []}
        open={!!selectedItem}
        onOpenChange={(open) => !open && setSelectedItemId(null)}
        // No celular o envio do arquivo final vai para o rodapé fixo da ficha:
        // no corpo ele ficava abaixo da dobra (medido: 765px numa tela de 780).
        acaoNoRodape={ctaDoFinalNoRodape && selectedItem ? (
          <BotaoDoArquivoFinal selectedItem={selectedItem} finalFileUrl={finalFileUrl} finalDirty={finalDirty}
            submitFinalFileMutation={submitFinalFileMutation} handleSubmitFinalFile={handleSubmitFinalFile} curto />
        ) : undefined}
        // O BLOCO DE AÇÃO DA FASE VEM NO TOPO — nas três situações.
        // Subir o thumb (o gesto nº 1 da Arte, 2.582 em 30 dias) morava em
        // `customActions`, no FIM da ficha: abaixo da especificação e do
        // percurso, a 800px de rolagem no celular, enquanto a Finalização já
        // vinha no topo (pedido do dono, 11/2025). Agora as duas vêm no topo,
        // e a TROCA do que já foi enviado também: qualquer peça com thumb ou
        // arquivo final abre com o bloco de troca, e o que pode ou não pode
        // é a regra de shared/troca-de-material (o motivo aparece escrito).
        topActions={painelDaFicha === 'thumb' && selectedItem ? (
          <PainelDoThumbDeAprovacao
            selectedItem={selectedItem}
            zonaDoThumbRef={uploads.zonaDoThumbRef}
            approvalThumbUrl={approvalThumbUrl}
            approvalThumbPreview={approvalThumbPreview}
            savedApprovalThumbUrl={savedApprovalThumbUrl}
            thumbJustSaved={thumbJustSaved}
            thumbEnviando={uploads.thumbEnviando}
            isPasteUploading={isPasteUploading}
            isDragOver={isDragOver}
            setIsDragOver={setIsDragOver}
            iniciarEnvioDoThumb={uploads.iniciarEnvioDoThumb}
            concluirEnvioDoThumb={concluirEnvioDoThumb}
            desfazerEnvioDoThumb={uploads.desfazerEnvioDoThumb}
            uploadFileDirect={uploadFileDirect}
            getUploadUrl={getUploadUrl}
            focarEnvioParaAprovacao={focarEnvioParaAprovacao}
            toast={toast}
            setBuscaDeArte={setBuscaDeArte}
            submitForApprovalMutation={submitForApprovalMutation}
            saveThumbDraftMutation={saveThumbDraftMutation}
            handleSubmitForApproval={handleSubmitForApproval}
            handleSaveThumbDraft={handleSaveThumbDraft}
            isMobile={isMobile}
            dedo={dedo}
          />
        ) : trocaTodaNegada ? (
          <p data-testid="material-troca-bloqueada" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: 0, padding: '10px 14px', borderRadius: 10, background: N.n2, border: `1px solid ${T.border}`, fontSize: isMobile ? 13 : 12.5, color: T.strong, lineHeight: 1.5 }}>
            <Lock aria-hidden="true" style={{ width: 14, height: 14, color: T.apoio, flexShrink: 0, marginTop: 2 }} />
            <span><b style={{ fontWeight: 700 }}>Material não pode mais ser trocado</b> — {motivoDaTrocaNegada}</span>
          </p>
        ) : (painelDaFicha === 'finalizacao' || painelDaFicha === 'troca') && selectedItem ? (
          <PainelDeFinalizacao
            selectedItem={selectedItem}
            isMobile={isMobile}
            regraThumbSel={regraThumbSel}
            regraFinalSel={regraFinalSel}
            thumbPedeMotivo={thumbPedeMotivo}
            faltamMotivoThumb={faltamMotivoThumb}
            motivoTrocaThumb={motivoTrocaThumb}
            setMotivoTrocaThumb={setMotivoTrocaThumb}
            updateThumbMutation={updateThumbMutation}
            submitFinalFileMutation={submitFinalFileMutation}
            handleSubmitFinalFile={handleSubmitFinalFile}
            getUploadUrl={getUploadUrl}
            setBuscaDeArte={setBuscaDeArte}
            finalFileUrl={finalFileUrl}
            setFinalFileUrl={setFinalFileUrl}
            finalDirty={finalDirty}
            setFinalDirty={setFinalDirty}
            sugestaoVisivel={sugestaoVisivel}
            usarSugestaoFinal={usarSugestaoFinal}
            ignorarSugestaoFinal={ignorarSugestaoFinal}
            ctaNoRodape={ctaDoFinalNoRodape}
          />
        ) : selectedItem && !podeEditar && ['awaiting_submission', 'sponsor_approved', 'awaiting_creator_review'].includes(selectedItem.status) ? (
          // MODO CONSULTA DENTRO DA PEÇA. A faixa cinza do topo explica a
          // lista, mas quem abria uma peça que espera a Arte via o modal sem
          // nenhum bloco de ação e não sabia se faltava permissão ou se a tela
          // tinha falhado. Só nas fases em que a Arte age — e no TOPO, no
          // lugar onde o bloco de ação estaria para quem é da Arte.
          <p data-testid="modal-modo-consulta" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, padding: '10px 14px', borderRadius: 10, background: N.n2, border: `1px solid ${T.border}`, fontSize: 12.5, color: T.strong, lineHeight: 1.5 }}>
            <Lock aria-hidden="true" style={{ width: 14, height: 14, color: T.apoio, flexShrink: 0 }} />
            <span><b style={{ fontWeight: 700 }}>Modo consulta.</b> Subir o thumb e o arquivo final desta peça é da equipe de Arte.</span>
          </p>
        ) : null}
      />

      <DialogoPdfCompartilhado
        showBulkDialog={showBulkDialog}
        setShowBulkDialog={setShowBulkDialog}
        sharedPdfUrl={sharedPdfUrl}
        setSharedPdfUrl={setSharedPdfUrl}
        selectedItemIds={selectedItemIds}
        itemPorId={itemPorId}
        getUploadUrl={getUploadUrl}
        toast={toast}
        submitBulkForApprovalMutation={submitBulkForApprovalMutation}
        handleBulkSubmit={handleBulkSubmit}
        isMobile={isMobile}
        dedo={dedo}
      />

      {/* Exportar PDF (componente compartilhado). Com peças selecionadas, o
          modal recebe só a seleção como pool. */}
      <ExportPdfDialog open={showExportModal} onOpenChange={setShowExportModal} items={itensDaExportacaoCongelados} title="Arte" />

      {/* BUSCAR ARTE JÁ FEITA — um modal só para os quatro pontos de envio
          (thumb de aprovação, troca do thumb aprovado, correção e arquivo
          final). Quem abriu diz o DESTINO; aplicar é aplicarArteEncontrada. */}
      <BuscarArteDialog
        item={buscaDeArte ? { id: buscaDeArte.itemId, displayId: buscaDeArte.displayId } : null}
        querArquivoFinal={buscaDeArte?.destino === "arquivo-final"}
        onUsar={aplicarArteEncontrada}
        onClose={() => setBuscaDeArte(null)}
      />

      <DialogoBook book={book} groupOf={groupOf} dedo={dedo} />

      <DialogoThumbsEmLote
        lote={lote}
        itemPorId={itemPorId}
        correcaoItems={correcaoItems}
        events={events}
        groupOf={groupOf}
        isMobile={isMobile}
        dedo={dedo}
      />

      {/* A pergunta de "descartar?" dos modais de upload (useConfirmar). */}
      {dialogoDeConfirmacao}

      </div>
    </div>
  );
}
