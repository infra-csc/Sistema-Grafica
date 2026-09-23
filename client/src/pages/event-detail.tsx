// ─────────────────────────────────────────────────────────────────────────────
// DETALHE DO EVENTO — a página é a COMPOSIÇÃO: as leituras, as escritas, as
// permissões e os gestos que cruzam pedaços moram aqui; cada bloco da tela
// mora em components/detalhe-do-evento/ (tipos, regras puras, hooks de dados e
// de ações, cabeçalho, agenda, rascunhos, lista e cada modal).
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useMemo, useRef } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { ArrowLeft, Package, Plus, Upload, Copy, Search, Loader2 } from "lucide-react";
import { motivoEventoFinalizado, todayBusinessMs } from "@/lib/status";
import { EstoqueSemelhantesDialog } from "@/components/estoque-semelhantes-dialog";
import { PedidosDoEvento } from "@/components/pedidos-do-evento";
import { PainelDoKit } from "@/components/kit/painel-do-kit";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import { ImportXlsxDialog } from "@/components/import-xlsx-dialog";
import { CloneItemsDialog } from "@/components/clone-items-dialog";
import { EncerrarEventoDialog } from "@/components/encerrar-evento-dialog";
import { useEventImport, useEventClone } from "@/hooks/use-event-import";
import { useEventReference } from "@/hooks/use-event-reference";
import { useEventItemFlags } from "@/hooks/use-event-item-flags";
import { useDensidadeDoConteudo, usePonteiroGrosso } from "@/hooks/use-mobile";
import { AumentarQuantidadeDialog, ComplementoDaFicha, temBlocoDeComplemento } from "@/components/aumentar-quantidade-dialog";
import { T, N, FS } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { EstadoErro, EstadoVazio } from "@/components/ui/estados";
import { useConfirmar } from "@/components/ui/usar-confirmar";
import { BLOCKED_EDIT_STATUSES, MOTIVO_SOMENTE_LEITURA } from "@/components/detalhe-do-evento/regras";
import type { PecaDoEvento } from "@/components/detalhe-do-evento/tipos";
import {
  useDadosDoEvento, useCatalogoDePecas, usePatrocinadoresDoEvento, useEventosParaClonar, useHistoricoDaPeca,
  useResumoDoEstoque, useQuemEncerrou,
} from "@/components/detalhe-do-evento/use-detalhe-do-evento-dados";
import { useContagensDoEvento } from "@/components/detalhe-do-evento/use-contagens-do-evento";
import { useFiltrosDaLista, usePecasDaLista } from "@/components/detalhe-do-evento/use-lista-de-pecas";
import { useFormularioDaPeca, useColarPrintNaReferencia } from "@/components/detalhe-do-evento/use-formulario-da-peca";
import { getUploadUrl, useAcoesDasPecas, useEncerrarEReabrir } from "@/components/detalhe-do-evento/use-detalhe-do-evento-acoes";
import { EsqueletoDoEvento, EventoIndisponivel } from "@/components/detalhe-do-evento/estados-da-tela";
import { FaixasDoEvento } from "@/components/detalhe-do-evento/faixas-do-evento";
import { TituloDoEvento } from "@/components/detalhe-do-evento/titulo-do-evento";
import { AcoesDoEvento } from "@/components/detalhe-do-evento/acoes-do-evento";
import { ModalDeEntradaDePecas } from "@/components/detalhe-do-evento/modal-de-entrada-de-pecas";
import { AgendaOperacional } from "@/components/detalhe-do-evento/agenda-operacional";
import { CardDeRascunhos } from "@/components/detalhe-do-evento/card-de-rascunhos";
import { ConfirmarEnvioDialog } from "@/components/detalhe-do-evento/confirmar-envio-dialog";
import { BarraDaLista } from "@/components/detalhe-do-evento/barra-da-lista";
import { SecoesDaLista } from "@/components/detalhe-do-evento/secoes-da-lista";
import type { PropsDaPeca } from "@/components/detalhe-do-evento/linha-da-peca";
import { ExcluirPecaDialog } from "@/components/detalhe-do-evento/excluir-peca-dialog";
import { EditarPecaDialog } from "@/components/detalhe-do-evento/editar-peca-dialog";

export default function EventDetail() {
  const { hasPermission, user } = useAuth();
  const [, params] = useRoute("/eventos/:id");
  const [, setLocation] = useLocation();
  const eventId = params?.id;
  // Os dois modais de peça (entrada e editar) e o formulário que eles dividem.
  const form = useFormularioDaPeca();
  const { formData, editingItem } = form;
  // Objeto inteiro (não só o id): o diálogo de confirmação escreve QUAL peça
  // vai ser excluída — com só o id, a mensagem era genérica.
  const [deletingItem, setDeletingItem] = useState<PecaDoEvento | null>(null);
  const [selectedItemForDetails, setSelectedItemForDetails] = useState<PecaDoEvento | null>(null);
  // Complemento (aumento de quantidade pós-produção): a peça-mãe em foco e,
  // quando o pedido veio de uma edição barrada pelo servidor, a diferença já
  // calculada por ele (409 USE_COMPLEMENT → suggestedComplement).
  const [complementItem, setComplementItem] = useState<PecaDoEvento | null>(null);
  const [complementSugestao, setComplementSugestao] = useState<number | null>(null);
  // Busca, chips de status, marco da timeline e agrupamento (os dois últimos na URL).
  const filtros = useFiltrosDaLista();
  const { statusFilter, setStatusFilter, marcoFiltro, setMarcoFiltro, agrupar, setShowAllItems } = filtros;
  const [showAllDrafts, setShowAllDrafts] = useState(false);

  // Deep-link ?item=<id>: usado pelo clique na notificação — navega até este
  // evento e abre direto o dialog da peça. O parâmetro é consumido uma única
  // vez (replaceState) para não reabrir o dialog a cada re-render/refresh.
  const pendingDeepLinkItem = useRef<string | null>(
    new URLSearchParams(window.location.search).get("item"),
  );
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  // Régua única (use-mobile.tsx): a lista de peças escolhe tabela ou cartões
  // pela ÁREA ÚTIL medida, e o alvo de toque segue o PONTEIRO.
  const { ref: listaRef, cards: emCards, compacto, isMobile } = useDensidadeDoConteudo<HTMLDivElement>();
  const ponteiroGrosso = usePonteiroGrosso();
  /** Dedo (celular OU tablet do galpão): manda no TAMANHO do alvo, só nele. */
  const dedo = ponteiroGrosso || isMobile;
  const { toast } = useToast();
  // Confirmação do app (no lugar do window.confirm): hoje, só o X do modo lote.
  const { confirmar, dialogo } = useConfirmar();

  const { event, loadingEvent, eventError, refetchEvent, rawItems, loadingItems, isFetching, itemsError, refetchItems, remessasDoKit } = useDadosDoEvento(eventId);

  // Consome o deep-link ?item= assim que a query resolve (ver pendingDeepLinkItem).
  // Consumir também com lista VAZIA: antes o ?item= ficava preso na URL de um
  // evento sem peças e reabria o dialog num refresh futuro.
  useEffect(() => {
    if (!pendingDeepLinkItem.current || loadingItems) return;
    const target = rawItems.find((i) => i.id === pendingDeepLinkItem.current);
    pendingDeepLinkItem.current = null;
    // Tira SÓ o ?item= — `agrupar` e `marco` são do usuário e ficam.
    const p = new URLSearchParams(window.location.search); p.delete('item');
    const q = p.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`);
    if (target) setSelectedItemForDetails(target);
  }, [rawItems, loadingItems]);

  const {
    items, draftItems, mainItems, rascunhosQueEuEnvio, statusChips, pecasNaConta, canceladasForaDaConta,
    totalM2, complementCount, marcosDoEvento, atrasDoMarco, fases, entregues, fraseResolucao, openWork,
  } = useContagensDoEvento(rawItems, event, user);

  // Leva a pessoa até o card de rascunhos. Ele mora abaixo da agenda, do Kit e
  // das solicitações — num evento com tudo isso, ficava fora da primeira tela
  // e o rascunho era esquecido. Sem animação para quem pede menos movimento.
  const irParaRascunhos = () => {
    const reduzir = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('rascunhos-do-evento')?.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'start' });
  };

  const { standardItems, catalogOptions, createCatalogOptionMutation, groupOf, materialOptions, finishOptions } = useCatalogoDePecas();
  const { sponsors, eventQuotaRules, eventSponsorsList } = usePatrocinadoresDoEvento(eventId);

  // Estado e mutations de importação de Excel (extraído para @/hooks/use-event-import)
  const {
    importDialogOpen,
    setImportDialogOpen,
    importFile,
    setImportFile,
    setImportPreview,
    importPreviewItems,
    setImportPreviewItems,
    importFileName,
    importSearch,
    setImportSearch,
    previewXlsxMutation,
    confirmImportMutation,
    importKit,
    importIgnoradas,
  } = useEventImport({ eventId, eventSponsorsList, eventQuotaRules });

  // Estado e mutation de clonagem de itens entre eventos (extraído para @/hooks/use-event-import)
  const {
    cloneDialogOpen,
    setCloneDialogOpen,
    cloneSourceId,
    setCloneSourceId,
    cloneItemsMutation,
  } = useEventClone({ eventId });

  const { allEvents, loadingAllEvents } = useEventosParaClonar(cloneDialogOpen);
  const auditLogs = useHistoricoDaPeca(selectedItemForDetails?.id);

  // ── Evento FINALIZADO: encerrado à mão OU já realizado ────────────────────
  // Esta tela mostra as peças do evento finalizado DE PROPÓSITO (registro não
  // perde o passado) — e era exatamente por isso que a ação continuava
  // acontecendo aqui depois de o servidor passar a recusá-la. Um botão que só
  // existe para devolver 409 é pior do que um botão desabilitado: gasta o
  // clique, some com o trabalho digitado e não explica nada.
  //
  // O CRITÉRIO é o mesmo do servidor (server/routes/items.ts): desabilita o
  // que faz o trabalho ANDAR (adicionar, importar, clonar, editar, enviar,
  // marcar reaproveitamento, mexer na referência); mantém o que ARRUMA A CASA
  // (excluir peça) e o que só lê (exportar).
  //
  // Fica ANTES de canUploadReference/canEditLists porque os dois já dependem
  // dele — em JS, `const` não sobe.
  const motivoEventoFim = useMemo(
    () => motivoEventoFinalizado(event ?? null, todayBusinessMs()),
    [event],
  );
  const eventoFinalizado = motivoEventoFim !== null;
  /** A frase do botão travado — a mesma distinção das duas origens. */
  const avisoEventoFim = motivoEventoFim === "encerrado"
    ? "Evento encerrado — reabra o evento para mexer nas peças dele."
    : "Este evento já aconteceu — não é possível mexer nas peças dele.";

  // Solicitação ou admin podem adicionar referência
  // Anexar/trocar/remover referência visual é PATCH /api/items/:id — a mesma
  // rota que o servidor passou a recusar em evento finalizado. Sem `&&
  // !eventoFinalizado` o clipe continuaria convidando a subir um arquivo que
  // seria descartado no 409 depois do upload inteiro.
  const canUploadReference = (hasPermission("admin") || user?.role === "solicitacao") && !eventoFinalizado;

  // Quem cria a lista (solicitação, admin ou criador do evento) sempre pode
  // editar uma peça, mesmo depois que ela entra em produção/entrega.
  const canEditLists = hasPermission("admin") || user?.role === "solicitacao" || !!(event && user && event.createdBy === user.id);

  // BUSCAR NO ESTOQUE: cada peça mostra quantas iguais — mesmo tipo e medida —
  // o estoque tem, e abre a busca. Estoque é só do admin.
  const podeReservarEstoque = user?.role === "admin";
  const estoqueResumo = useResumoDoEstoque(eventId, user?.role === "admin");
  const [estoqueDaPeca, setEstoqueDaPeca] = useState<{ id: string; eventId: string } | null>(null);

  const podeAtenderPedidos = hasPermission("admin") || user?.role === "solicitacao";

  // ── Encerramento manual do evento ─────────────────────────────────────────
  // `manuallyClosed` vem de enrichEvent; o fallback lê a coluna crua ("closed")
  // para o caso do Express antigo respondendo sem o campo novo.
  const isEventClosed = !!event && (event.manuallyClosed === true || event.status === 'closed');
  // Mesmo gate do servidor (POST /api/events/:id/close|reopen): encerrar tira
  // trabalho da vista de outras equipes, então é decisão de admin — a mesma
  // classe da exclusão, não a da edição.
  const canCloseEvent = user?.role === 'admin';
  const closureLog = useQuemEncerrou(eventId, isEventClosed);

  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);

  const { closeEventMutation, reopenEventMutation } = useEncerrarEReabrir({ eventId, toast, setCloseDialogOpen, setReopenDialogOpen });

  useColarPrintNaReferencia(form, toast);

  const { salvarReferenciasMutation } = useEventReference({ eventId });

  const { createItemMutation, createBulkItemsMutation, updateItemMutation, deleteItemMutation, submitDraftsMutation } = useAcoesDasPecas({
    eventId, toast, setLocation, form, items, catalogOptions, standardItems, createCatalogOptionMutation,
    deletingItem, setDeletingItem, irParaRascunhos,
  });

  const { updateItemIsReuseMutation } = useEventItemFlags({ eventId });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) {
      // Ligar o reaproveitamento pelo formulário = reaproveita a peça inteira
      // (o servidor exige a quantidade junto com a flag).
      const ligouReuso = !!formData.isReuse && !editingItem.isReuse;
      updateItemMutation.mutate({ id: editingItem.id, data: ligouReuso ? { ...formData, reuseQty: Number(formData.quantity) } : formData });
    } else {
      createItemMutation.mutate(formData);
    }
  };

  /**
   * POR QUE devolve a FRASE e não um booleano: agora há DUAS razões para o
   * cadeado, e elas pedem explicações opostas. "Já liberado para a gráfica" é
   * sobre a peça e depende do papel; "evento finalizado" é sobre o evento e
   * vale para todo mundo, inclusive admin. Um `title` genérico manda a pessoa
   * procurar a permissão errada.
   *
   * O evento finalizado vem PRIMEIRO porque é o mais forte: nem quem edita a
   * lista escapa dele, e é o que o servidor recusa com 409.
   */
  const motivoEdicaoBloqueada = (status: string): string | null => {
    if (eventoFinalizado) return avisoEventoFim;
    if (BLOCKED_EDIT_STATUSES.includes(status) && !canEditLists) {
      // "peça" (a palavra da tela) e QUEM pode: a frase manda a pessoa ao
      // perfil certo em vez de fazê-la procurar um botão que não existe.
      return "Edição bloqueada — a peça já foi liberada para a Gráfica. Só a Solicitação, um admin ou quem criou o evento edita.";
    }
    return null;
  };
  const isEditBlocked = (status: string) => motivoEdicaoBloqueada(status) !== null;

  // Exclusão: solicitação tem o MESMO alcance do admin (decisão do dono).
  // Antes, solicitação só excluía antes de a peça chegar na Arte — e
  // "awaiting_submission" estava na lista de bloqueio, ou seja, nem o próprio
  // rascunho recém-criado ela conseguia apagar. A exclusão aqui é SOFT
  // (deletedAt), fica no log de auditoria e é restaurável em Peças Excluídas,
  // então o risco é reversível; a trava que continua valendo para todos é a
  // de integridade (mãe com complemento vivo, barrada no servidor).
  const canDeleteAny = hasPermission("admin") || user?.role === "solicitacao";
  const canDeleteItem = (_status: string) => canDeleteAny;

  const handleEditItem = (item: PecaDoEvento) => {
    if (isEditBlocked(item.status)) return;
    form.hidratarEdicao(item);
  };

  const handleDeleteItem = (item: PecaDoEvento) => {
    setDeletingItem(item);
  };

  const { itemSearchLower, searchedItems, hiddenItemCount, groupMap, sortedGroups, secoesPorStatus } = usePecasDaLista(mainItems, filtros, groupOf);

  if (loadingEvent || loadingItems) {
    return <EsqueletoDoEvento isMobile={isMobile} />;
  }

  if (!event) {
    return <EventoIndisponivel eventError={eventError} refetchEvent={() => refetchEvent()} />;
  }

  // O que a linha da tabela e o cartão do celular precisam da tela.
  const linha: PropsDaPeca = {
    event, canEditLists, canDeleteAny, canUploadReference, isEditBlocked, motivoEdicaoBloqueada, canDeleteItem,
    setSelectedItemForDetails, handleEditItem, handleDeleteItem, estoqueResumo, setEstoqueDaPeca,
    salvarReferenciasMutation, updateItemIsReuseMutation, getUploadUrl, toast,
  };

  return (
    <div style={{ padding: isMobile ? '12px 12px' : '28px 40px', height: '100%', overflowY: 'auto', maxWidth: '1400px', margin: '0 auto', backgroundColor: N.n2 }}>
      {/* Breadcrumb */}
      <Link href="/eventos">
        <a
          data-testid="button-back"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: '500', color: T.second, marginBottom: '22px', textDecoration: 'none', transition: 'color 0.15s', letterSpacing: '0.02em' }}
          onMouseEnter={e => (e.currentTarget.style.color = T.accentText)}
          onMouseLeave={e => (e.currentTarget.style.color = T.second)}
        >
          <ArrowLeft className="h-3 w-3" />
          Voltar para eventos
        </a>
      </Link>

      <FaixasDoEvento
        isEventClosed={isEventClosed}
        motivoEventoFim={motivoEventoFim}
        closureLog={closureLog}
        openWork={openWork}
        canCloseEvent={canCloseEvent}
        isMobile={isMobile}
        onReabrir={() => setReopenDialogOpen(true)}
      />

      {/* Header principal */}
      <div style={{ marginBottom: '40px' }}>
        {/* flex-start: o bloco do título cresce (frase, barra, chips) e as
            ações ficam na altura do NOME, não boiando no meio da coluna. O
            título ocupa o que sobrar (flex 1) e as ações quebram para baixo
            quando não cabem. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isMobile ? 20 : 28, gap: isMobile ? 16 : 24, flexWrap: 'wrap' }}>
          <TituloDoEvento
            event={event}
            fraseResolucao={fraseResolucao}
            fases={fases}
            pecasNaConta={pecasNaConta}
            entregues={entregues}
            totalDePecas={items.length}
            complementCount={complementCount}
            totalM2={totalM2}
            canceladasForaDaConta={canceladasForaDaConta}
            statusChips={statusChips}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            rascunhos={draftItems.length}
            irParaRascunhos={irParaRascunhos}
            canEditLists={canEditLists}
            eventoFinalizado={eventoFinalizado}
            isMobile={isMobile}
          />
          {/* ── AÇÕES DO CABEÇALHO: HIERARQUIA ──
              Eram oito botões brancos com o mesmo peso, e o que monta a lista
              ("Adicionar peça") era só mais um na fila. Agora:
                · PRIMÁRIA — Adicionar peça: é o trabalho desta tela.
                · SECUNDÁRIA visível — Importar Excel: o outro jeito frequente
                  de montar a lista (no celular vai para o menu: planilha é
                  gesto de computador).
                · MENU "Mais" — o que é leitura/saída (book, etiquetas,
                  relatório, Excel), o clonar (raro) e Encerrar/Reabrir (admin,
                  raro e de peso). Nada sumiu: cada item leva o MESMO testid,
                  a MESMA condição de perfil e o MESMO bloqueio de evento
                  finalizado do botão que substituiu. */}
          <AcoesDoEvento
            event={event}
            eventId={eventId}
            rawItems={rawItems}
            isMobile={isMobile}
            canEditLists={canEditLists}
            canCloseEvent={canCloseEvent}
            isEventClosed={isEventClosed}
            eventoFinalizado={eventoFinalizado}
            avisoEventoFim={avisoEventoFim}
            abrirEntradaDePecas={form.abrirEntradaDePecas}
            setImportDialogOpen={setImportDialogOpen}
            setCloneDialogOpen={setCloneDialogOpen}
            setCloseDialogOpen={setCloseDialogOpen}
            setReopenDialogOpen={setReopenDialogOpen}
            setLocation={setLocation}
            toast={toast}
          >
            <ModalDeEntradaDePecas
              form={form}
              event={event}
              eventId={eventId}
              user={user}
              isMobile={isMobile}
              standardItems={standardItems}
              sponsors={sponsors}
              items={items}
              materialOptions={materialOptions}
              finishOptions={finishOptions}
              remessasDoKit={remessasDoKit}
              acoes={{ createBulkItemsMutation, createItemMutation, updateItemMutation }}
              confirmar={confirmar}
              handleSubmit={handleSubmit}
              getUploadUrl={getUploadUrl}
            />
          </AcoesDoEvento>
        </div>

        {/* ── Agenda Operacional ───────────────────────────────── */}
        <AgendaOperacional
          event={event}
          isEventClosed={isEventClosed}
          isMobile={isMobile}
          marcosDoEvento={marcosDoEvento}
          atrasDoMarco={atrasDoMarco}
          marcoFiltro={marcoFiltro}
          setMarcoFiltro={setMarcoFiltro}
        />
      </div>

      {/* Kit: remessas com as datas do Kit. */}
      <PainelDoKit
        eventId={eventId!}
        pecas={items}
        podeCriar={(user?.role === 'admin' || user?.role === 'solicitacao') && canEditLists}
        usuarioDoKit={!!user?.kit}
        nomeDoUsuario={user?.name ?? ""}
        dataDoEvento={event?.startDate ?? null}
        saidaDoEvento={event?.truckDepartureDate ?? null}
        onAbrirPeca={(peca) => setSelectedItemForDetails(peca)}
        // Inclusão individual do Kit: o formulário de sempre, já na remessa.
        onAdicionarPeca={(remessaId) => form.abrirNaRemessaDoKit(remessaId)}
        eventoFinalizado={!!eventoFinalizado}
      />

      {/* Pedidos de peça do Atendimento — some quando não há. */}
      <PedidosDoEvento
        eventId={eventId!}
        pecas={items}
        podeVer={user?.role !== "grafica"}
        podeAtender={podeAtenderPedidos && canEditLists}
        motivoEventoFim={motivoEventoFim}
        saidaDoCaminhao={event?.truckDepartureDate ?? null}
        onCriarPeca={(pedidoDaLinha, pedido) => form.criarPecaDoPedido(standardItems, pedidoDaLinha, pedido)}
      />

      {/* Card de Peças em Rascunho — visual Titanium (antes era Card shadcn
          tracejado + Badge, destoando do resto da página). Os rascunhos vivem
          SÓ aqui; a listagem principal exclui draft/requested. */}
      {draftItems.length > 0 && (
        <>
        <CardDeRascunhos
          draftItems={draftItems}
          rascunhosQueEuEnvio={rascunhosQueEuEnvio}
          showAllDrafts={showAllDrafts}
          setShowAllDrafts={setShowAllDrafts}
          groupOf={groupOf}
          user={user}
          hasPermission={hasPermission}
          isMobile={isMobile}
          canUploadReference={canUploadReference}
          canEditLists={canEditLists}
          canDeleteAny={canDeleteAny}
          eventoFinalizado={eventoFinalizado}
          avisoEventoFim={avisoEventoFim}
          isEditBlocked={isEditBlocked}
          motivoEdicaoBloqueada={motivoEdicaoBloqueada}
          handleEditItem={handleEditItem}
          setDeletingItem={setDeletingItem}
          salvarReferenciasMutation={salvarReferenciasMutation}
          getUploadUrl={getUploadUrl}
          enviando={submitDraftsMutation.isPending}
          setSubmitConfirmOpen={setSubmitConfirmOpen}
        />

        {/* ── Modal de confirmação de envio com lista de itens ── */}
        <ConfirmarEnvioDialog
          submitConfirmOpen={submitConfirmOpen}
          setSubmitConfirmOpen={setSubmitConfirmOpen}
          rascunhosQueEuEnvio={rascunhosQueEuEnvio}
          dedo={dedo}
          enviando={submitDraftsMutation.isPending}
          onConfirmar={() => submitDraftsMutation.mutate()}
        />
        </>
      )}

      {/* Indicador de atualização — fora do bloco da lista: também aparece
          quando o evento está vazio ou só tem rascunhos. */}
      {isFetching && !loadingItems && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: T.second, fontSize: '13px', marginBottom: '16px' }}>
          <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
          <span>Atualizando...</span>
        </div>
      )}

      {/* Falha em /api/items: sem este bloco, o erro virava um falso
          "Nenhum item adicionado" (mesmo padrão do erro de evento acima).
          Lista vazia: rascunhos moram no card acima; a listagem só reclama de
          vazio quando não há NADA. Empty-state neutro (Package, não alerta);
          o CTA respeita canEditLists. */}
      {itemsError ? (
        <EstadoErro
          titulo="Não foi possível carregar as peças"
          detalhe="Verifique sua conexão e tente novamente."
          aoTentarDeNovo={() => refetchItems()}
        />
      ) : mainItems.length === 0 ? (
        draftItems.length > 0 ? null : (
          // OS TRÊS CAMINHOS, CLICÁVEIS. No estado vazio a pergunta é "como
          // começo": os três gestos ficam aqui, com os MESMOS handlers e o
          // MESMO bloqueio de evento finalizado dos botões do cabeçalho — e o
          // porquê do bloqueio é a própria descrição, visível.
          <EstadoVazio
            icone={Package}
            titulo="Nenhuma peça na lista ainda"
            descricao={canEditLists
              ? (eventoFinalizado ? avisoEventoFim : 'Adicione peça por peça ou em lote, importe a planilha, ou copie as peças de outro evento.')
              : 'Quando a lista for montada, as peças aparecem aqui.'}
            acao={canEditLists ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {([
                  { chave: 'adicionar', rotulo: 'Adicionar peças', Icone: Plus, acao: form.abrirEntradaDePecas, primaria: true },
                  { chave: 'importar', rotulo: 'Importar Excel', Icone: Upload, acao: () => setImportDialogOpen(true), primaria: false },
                  { chave: 'clonar', rotulo: 'Clonar de outro evento', Icone: Copy, acao: () => setCloneDialogOpen(true), primaria: false },
                ] as const).map(({ chave, rotulo, Icone, acao, primaria }) => (
                  <Botao
                    key={chave}
                    variante={primaria ? 'primario' : 'secundario'}
                    tamanho="toque"
                    icone={Icone}
                    data-testid={`button-vazio-${chave}`}
                    onClick={acao}
                    disabled={eventoFinalizado}
                    title={eventoFinalizado ? avisoEventoFim : undefined}
                  >
                    {rotulo}
                  </Botao>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: FS.meta, color: T.second, margin: 0 }}>
                {MOTIVO_SOMENTE_LEITURA}
              </p>
            )}
          />
        )
      ) : (
        /* `listaRef` mede a ÁREA ÚTIL da lista de peças — é ela, e não a
           janela, que decide entre a tabela de 9 colunas e os cartões
           (ver a régua em use-mobile.tsx). */
        <div ref={listaRef} style={{ display: 'flex', flexDirection: 'column', gap: '48px' }}>
          {/* Busca local de peças — evita rolagem cega em eventos grandes. */}
          <BarraDaLista
            filtros={filtros}
            itemSearchLower={itemSearchLower}
            searchedItems={searchedItems}
            mainItems={mainItems}
            isMobile={isMobile}
          />

          {searchedItems.length === 0 && (
            <EstadoVazio
              compacto
              icone={Search}
              titulo={statusFilter.length > 0 || marcoFiltro !== null ? 'Nenhuma peça corresponde aos filtros' : 'Nenhuma peça corresponde à busca'}
              descricao={statusFilter.length > 0 || marcoFiltro !== null ? 'Tente outro termo, ou limpe a busca, o filtro de status ou o marco.' : 'Tente outro termo ou limpe a busca.'}
            />
          )}

          <SecoesDaLista
            agrupar={agrupar}
            secoesPorStatus={secoesPorStatus}
            sortedGroups={sortedGroups}
            groupMap={groupMap}
            emCards={emCards}
            compacto={compacto}
            linha={linha}
          />
          {hiddenItemCount > 0 && (
            <Botao
              variante="secundario"
              tamanho="toque"
              larguraCheia
              onClick={() => setShowAllItems(true)}
              data-testid="button-show-all-event-items"
            >
              Mostrar todas as {searchedItems.length} peças (+{hiddenItemCount})
            </Botao>
          )}
        </div>
      )}

      {/* Dialog de Detalhes do Item — a ficha vira editável (o componente já
          suporta onEditSave) apenas para quem pode editar a lista. Só os
          campos que o modo de edição da ficha toca vão no PATCH. */}
      <ItemDetailsDialog
        item={selectedItemForDetails}
        auditLogs={auditLogs}
        open={!!selectedItemForDetails}
        onOpenChange={(open) => !open && setSelectedItemForDetails(null)}
        customActions={temBlocoDeComplemento(selectedItemForDetails, false, false) ? (
          <ComplementoDaFicha
            item={selectedItemForDetails}
            canEditLists={false}
            onAbrirPeca={(id) => {
              const alvo = items.find((i) => i.id === id);
              if (alvo) setSelectedItemForDetails(alvo);
            }}
          />
        ) : undefined}
        onEditSave={canEditLists && !eventoFinalizado ? (edited: PecaDoEvento) => updateItemMutation.mutate({
          id: edited.id,
          data: {
            type: edited.type,
            material: edited.material,
            finish: edited.finish,
            description: edited.description,
            quantity: edited.quantity,
            visualWidth: edited.visualWidth,
            visualHeight: edited.visualHeight,
            fileWidth: edited.fileWidth,
            fileHeight: edited.fileHeight,
            measurement: edited.measurement,
            observations: edited.observations,
          },
        }) : undefined}
      />

      {/* Aumento de quantidade pós-produção. Monta o modal uma vez para toda a
          tela: ele é aberto pela ficha da peça, pela linha da tabela, pelo card
          do celular, pelo campo Qtd. travado do form de edição e pelo 409
          USE_COMPLEMENT — cinco gestos, um único fluxo. */}
      <AumentarQuantidadeDialog
        item={complementItem}
        event={event}
        open={!!complementItem}
        sugestao={complementSugestao}
        onOpenChange={(o) => { if (!o) { setComplementItem(null); setComplementSugestao(null); } }}
        onCreated={(child) => {
          // Abre a ficha da peça-filha recém-criada: sem isto o usuário fica
          // olhando para a lista tentando adivinhar o que mudou.
          if (child?.id) setSelectedItemForDetails(child);
        }}
      />

      {/* ── ENCERRAR / REABRIR ──
          A confirmação é o MESMO componente da lista de Eventos
          (components/encerrar-evento-dialog.tsx). A mutação, as invalidações
          e o toast continuam aqui; os números vêm de openWork. */}
      <EncerrarEventoDialog
        modo="encerrar"
        open={closeDialogOpen}
        onFechar={() => setCloseDialogOpen(false)}
        onConfirmar={() => closeEventMutation.mutate()}
        pendente={closeEventMutation.isPending}
        nomeDoEvento={event.name}
        abertas={openWork.abertas}
        emProducao={openWork.emProducao}
        ativas={openWork.ativas}
      />
      <EncerrarEventoDialog
        modo="reabrir"
        open={reopenDialogOpen}
        onFechar={() => setReopenDialogOpen(false)}
        onConfirmar={() => reopenEventMutation.mutate()}
        pendente={reopenEventMutation.isPending}
        nomeDoEvento={event.name}
        abertas={openWork.abertas}
        emProducao={openWork.emProducao}
        ativas={openWork.ativas}
      />

      <ExcluirPecaDialog
        deletingItem={deletingItem}
        setDeletingItem={setDeletingItem}
        deleteItemMutation={deleteItemMutation}
        dedo={dedo}
      />

      {/* Dialog separado para editar item */}
      <EditarPecaDialog
        form={form}
        user={user}
        isMobile={isMobile}
        standardItems={standardItems}
        materialOptions={materialOptions}
        finishOptions={finishOptions}
        updateItemMutation={updateItemMutation}
        getUploadUrl={getUploadUrl}
      />

      {/* ── Dialog: Importar Excel (split-panel) ───────────────────────────── */}
      <ImportXlsxDialog
        open={importDialogOpen}
        onOpenChangeClose={() => {
          setImportDialogOpen(false);
          setImportFile(null);
          setImportPreview(null);
          setImportPreviewItems(null);
        }}
        importFile={importFile}
        setImportFile={setImportFile}
        setImportPreview={setImportPreview}
        importPreviewItems={importPreviewItems}
        setImportPreviewItems={setImportPreviewItems}
        importFileName={importFileName}
        importSearch={importSearch}
        setImportSearch={setImportSearch}
        eventSponsorsList={eventSponsorsList}
        previewXlsxPending={previewXlsxMutation.isPending}
        onPreview={(file) => previewXlsxMutation.mutate({ file })}
        confirmImportPending={confirmImportMutation.isPending}
        onConfirmImport={(items, fileName, destino) => confirmImportMutation.mutate({ items, fileName, destino })}
        // Arena ou Kit: o modal antes de importar usa as remessas do
        // evento e o cabeçalho da planilha do Kit, quando ela tem.
        kitRemessas={remessasDoKit}
        kitCabecalho={importKit}
        somenteKit={!!user?.kit}
        // As peças que o evento JÁ tem — sem elas o diálogo não teria contra
        // o que medir a repetição, e reimportar a mesma planilha duplicava o
        // evento inteiro em silêncio.
        itensDoEvento={items}
        ignoradas={importIgnoradas}
      />
      {/* ── Dialog: Clonar Evento ──────────────────────────────────────────── */}
      <CloneItemsDialog
        open={cloneDialogOpen}
        onOpenChange={setCloneDialogOpen}
        eventId={eventId}
        eventName={event?.name}
        allEvents={allEvents}
        eventsLoading={loadingAllEvents}
        cloneSourceId={cloneSourceId}
        setCloneSourceId={setCloneSourceId}
        isCloning={cloneItemsMutation.isPending}
        onConfirmClone={(itemIds) => { if (cloneSourceId) cloneItemsMutation.mutate({ sourceEventId: cloneSourceId, itemIds }); }}
      />
      {/* ── Dialog: Buscar no estoque ──────────────────────────────────────── */}
      <EstoqueSemelhantesDialog
        item={estoqueDaPeca}
        podeReservar={podeReservarEstoque}
        onClose={() => setEstoqueDaPeca(null)}
      />

      {dialogo}
    </div>
  );
}
