// ─────────────────────────────────────────────────────────────────────────────
// VINCULAR PATROCINADORES — a etapa antes da Arte: marcar quem aprova a arte
// de cada peça, salvar e enviar.
//
// Esta página é a COMPOSIÇÃO. As peças moram em components/vinculacao/:
//   · use-vinculacao ............ filtros, queries, mapas de vínculo, derivações
//   · use-acoes-da-vinculacao ... mutações, handlers e o estado dos modais
//   · fila-da-vinculacao ........ a tabela única, agrupada por evento ou patrocinador
//   · linha-da-peca ............. a linha memoizada (que no celular vira cartão)
//   · barra-de-* e modal-* ...... cada barra e cada diálogo no próprio arquivo
// ─────────────────────────────────────────────────────────────────────────────
import { CheckCircle2 } from "lucide-react";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import { useDensidadeDoConteudo, usePonteiroGrosso } from "@/hooks/use-mobile";
import { EsqueletoDeFila } from "@/components/esqueleto-de-fila";
import { EstadoVazio, EstadoErro } from "@/components/ui/estados";
import { T, N, R } from "@/lib/theme";
import { useVinculacao } from "@/components/vinculacao/use-vinculacao";
import { useAcoesDaVinculacao } from "@/components/vinculacao/use-acoes-da-vinculacao";
import { LinhaDaPeca, type AcoesDaLinha } from "@/components/vinculacao/linha-da-peca";
import { FilaDaVinculacao } from "@/components/vinculacao/fila-da-vinculacao";
import { CabecalhoDaVinculacao } from "@/components/vinculacao/cabecalho-da-vinculacao";
import { BarraDeStatus } from "@/components/vinculacao/barra-de-status";
import { BarraDeFiltros } from "@/components/vinculacao/barra-de-filtros";
import { BarraDeLote } from "@/components/vinculacao/barra-de-lote";
import { ModalReferenciaVisual } from "@/components/vinculacao/modal-referencia-visual";
import { ModalAutoVinculo } from "@/components/vinculacao/modal-auto-vinculo";
import { ModalPatrocinadoresDoEvento } from "@/components/vinculacao/modal-patrocinadores-do-evento";
import { ModalAcrescentar } from "@/components/vinculacao/modal-acrescentar";
import { ModalAplicarEmLote } from "@/components/vinculacao/modal-aplicar-em-lote";
import { ModalResultadoDoLote } from "@/components/vinculacao/modal-resultado-do-lote";
import { ModalConfirmarEnvio } from "@/components/vinculacao/modal-confirmar-envio";
import type { PatrocinadorDaVinculacao, PecaDaVinculacao, SavePayload } from "@/components/vinculacao/tipos";

/**
 * A RÉGUA MEDE A CAIXA DA TELA, não a janela.
 *
 * Tabela × cartões dependia de `useIsMobile` (768px de JANELA): com a sidebar
 * aberta, uma janela de 1000px deixava ~740px para cinco colunas e a linha
 * estourava de lado. A régua (use-mobile) mede a área útil.
 *
 * A medida mora NESTA casca, e não dentro da tela, porque a tela tem três
 * saídas (carregando, erro, lista) e o observador só se liga no elemento que
 * existe na montagem — que é o esqueleto. Aqui a caixa é a mesma nos três.
 * `32` é o `p-4` do container (16 de cada lado).
 */
export default function VincularPatrocinadores() {
  const regua = useDensidadeDoConteudo<HTMLDivElement>(32);
  return (
    <div ref={regua.ref} style={{ height: '100%' }}>
      <TelaDaVinculacao emCartoes={regua.cards} isMobile={regua.isMobile} />
    </div>
  );
}

function TelaDaVinculacao({ emCartoes, isMobile }: { emCartoes: boolean; isMobile: boolean }) {
  // Alvo de 44px pelo PONTEIRO (dedo), não pela largura: o tablet do galpão
  // tem janela de desktop e é usado com a mão.
  const dedo = usePonteiroGrosso();
  const v = useVinculacao();
  const a = useAcoesDaVinculacao(v);
  const {
    itemSponsorsMap, pendingChanges, originalSponsorsMap, itemUIStates, selectedItemIds,
    getItemEditability, podeAcrescentar,
  } = v;
  const { optimisticSentIds, falhaPorPeca, saveLinkingMutation, sendToArteMutation } = a;

  const acoesDaLinha: AcoesDaLinha = {
    setSelectedItemForDetails: v.setSelectedItemForDetails,
    setPreviewRefUrl: a.setPreviewRefUrl,
    toggleItemSelection: a.toggleItemSelection,
    toggleItemSkipApproval: a.toggleItemSkipApproval,
    aplicarVinculo: a.aplicarVinculo,
    descartarRascunho: a.descartarRascunho,
    salvarLinha: a.salvarLinha,
    openSendModalForItem: a.openSendModalForItem,
  };

  /**
   * A LINHA É UMA FUNÇÃO SÓ, chamada pelos dois agrupamentos — é o que
   * garante o mesmo conjunto de ações por linha. Passa à linha memoizada só
   * as entradas DESTA peça nos mapas (ver linha-da-peca).
   */
  const renderLinhaDaPeca = (item: PecaDaVinculacao, chips: PatrocinadorDaVinculacao[], eventSponsors: PatrocinadorDaVinculacao[]) => {
    const estado = optimisticSentIds.has(item.id) ? 'ENVIADO' : (itemUIStates[item.id] || 'PENDENTE');
    // Qual linha está gravando AGORA: o "Salvar" dela diz "Salvando…"; as
    // outras só travam.
    const salvandoEsta = saveLinkingMutation.isPending
      && (saveLinkingMutation.variables ?? []).some((p: SavePayload) => p.itemId === item.id);
    return (
      <LinhaDaPeca
        key={item.id}
        item={item}
        chips={chips}
        eventSponsors={eventSponsors}
        vinculosDaPeca={itemSponsorsMap[item.id]}
        rascunho={pendingChanges[item.id]}
        originais={originalSponsorsMap[item.id]}
        falha={falhaPorPeca[item.id]}
        estado={estado}
        selecionada={selectedItemIds.has(item.id)}
        editavel={getItemEditability(item)}
        podeAcrescentar={podeAcrescentar}
        salvandoEsta={salvandoEsta}
        salvando={saveLinkingMutation.isPending}
        enviando={sendToArteMutation.isPending}
        emCartoes={emCartoes}
        dedo={dedo}
        acoes={acoesDaLinha}
      />
    );
  };

  // Carregamento e vazio no mesmo estilo inline do resto da tela, e o vazio
  // diz por quê e o que fazer — quem cai aqui não pode ficar sem saída.
  if (v.itemsLoading || v.eventsLoading) {
    // Silhueta em vez de spinner central: reserva o espaço da lista e a
    // chegada dos dados não empurra a tela.
    return (
      <div aria-busy="true" style={{ padding: '18px 18px 64px', maxWidth: 1100, margin: '0 auto' }}>
        <div className="animate-pulse" style={{ width: 260, height: 22, borderRadius: R.sm, backgroundColor: T.border, marginBottom: 8 }} />
        <div className="animate-pulse" style={{ width: 360, height: 13, borderRadius: 4, backgroundColor: N.n3, marginBottom: 20 }} />
        <EsqueletoDeFila linhas={9} />
      </div>
    );
  }

  // Falha de rede tem cara de falha, não de "nada para vincular" — sem isto o
  // erro caía no estado vazio logo abaixo e mentia sobre a causa. Cobre as
  // três queries de que a tela depende: sem eventos ou patrocinadores ela
  // também fica inutilizável (nenhum chip para vincular).
  if (v.itemsError || v.eventsError || v.sponsorsError) {
    return (
      <div data-testid="button-retry-items" style={{ maxWidth: 520, margin: '10vh auto 0', padding: 24 }}>
        {/* O testid antigo fica na caixa: o botão agora é o do EstadoErro. */}
        <EstadoErro
          titulo="Não foi possível carregar as peças"
          detalhe="Verifique sua conexão e tente novamente."
          aoTentarDeNovo={() => { v.refetchItems(); v.refetchEvents(); v.refetchSponsors(); }}
        />
      </div>
    );
  }

  if (v.visibleItems.length === 0) {
    return (
      <div style={{ maxWidth: 520, margin: '10vh auto 0', padding: 24 }}>
        <EstadoVazio
          icone={CheckCircle2}
          titulo="Nada para vincular agora"
          descricao="Esta tela mostra apenas peças de eventos que ainda vão acontecer. Assim que a Solicitação cadastrar peças em um evento futuro, elas aparecem aqui para receber os patrocinadores."
        />
      </div>
    );
  }

  // O respiro de baixo acompanha a barra de lote FIXA, que no celular quebra
  // em duas linhas — é a janela que manda nela, não a caixa da tela.
  return (
    <div className="container mx-auto p-4 max-w-6xl pb-24" style={{ height: "100%", overflowY: "auto", paddingBottom: selectedItemIds.size > 0 ? (isMobile ? 260 : 150) : undefined }}>

      <ModalReferenciaVisual
        previewRefUrl={a.previewRefUrl}
        setPreviewRefUrl={a.setPreviewRefUrl}
        refImgFailed={a.refImgFailed}
        setRefImgFailed={a.setRefImgFailed}
      />

      <ModalAutoVinculo
        autoLinkOpen={a.autoLinkOpen}
        autoLinkPreview={a.autoLinkPreview}
        autoLinkLoading={a.autoLinkLoading}
        autoLinkConfirming={a.autoLinkConfirming}
        autoLinkEventoId={a.autoLinkEventoId}
        eventById={v.eventById}
        fecharAutoVinculo={a.fecharAutoVinculo}
        confirmarAutoVinculo={a.confirmarAutoVinculo}
        dedo={dedo}
      />

      <CabecalhoDaVinculacao
        fraseDeResolucao={v.fraseDeResolucao}
        contextStatusCounts={v.contextStatusCounts}
        eventFilter={v.eventFilter}
        abrirAutoVinculo={a.abrirAutoVinculo}
        abrirEnvioDasProntas={a.abrirEnvioDasProntas}
        enviando={sendToArteMutation.isPending}
      />

      <BarraDeStatus
        contagemPorEstado={v.contagemPorEstado}
        totalDoContexto={v.totalDoContexto}
        statusFilter={v.statusFilter}
        alternarStatus={v.alternarStatus}
        contextStatusCounts={v.contextStatusCounts}
        salvarRascunhosVisiveis={a.salvarRascunhosVisiveis}
        salvando={saveLinkingMutation.isPending}
        dedo={dedo}
      />

      <BarraDeFiltros
        searchInputRef={v.searchInputRef}
        buscaDigitada={v.buscaDigitada}
        setSearchQuery={v.setSearchQuery}
        eventFilter={v.eventFilter}
        setEventFilter={v.setEventFilter}
        eventFilterOptions={v.eventFilterOptions}
        sponsorFilter={v.sponsorFilter}
        setSponsorFilter={v.setSponsorFilter}
        sponsorFilterOptions={v.sponsorFilterOptions}
        itemFilter={v.itemFilter}
        setItemFilter={v.setItemFilter}
        itemFilterOptions={v.itemFilterOptions}
        agrupamento={v.agrupamento}
        setAgrupamento={v.setAgrupamento}
        emCartoes={emCartoes}
        isMobile={isMobile}
        dedo={dedo}
      />

      <BarraDeLote
        selectedItemIds={selectedItemIds}
        setSelectedItemIds={v.setSelectedItemIds}
        optimisticSentIds={optimisticSentIds}
        itemUIStates={itemUIStates}
        salvarSelecionadas={a.salvarSelecionadas}
        salvando={saveLinkingMutation.isPending}
        podeAcrescentar={podeAcrescentar}
        abrirAcrescentar={a.abrirAcrescentar}
        handleOpenBulkApplyDialog={a.handleOpenBulkApplyDialog}
        isMobile={isMobile}
        dedo={dedo}
      />

      <FilaDaVinculacao
        gruposDaLista={v.gruposDaLista}
        getEventSponsors={v.getEventSponsors}
        getItemEditability={getItemEditability}
        itemUIStates={itemUIStates}
        itemSponsorsMap={itemSponsorsMap}
        selectedItemIds={selectedItemIds}
        showAllRows={v.showAllRows}
        setShowAllRows={v.setShowAllRows}
        tiposColapsados={v.tiposColapsados}
        setTiposColapsados={v.setTiposColapsados}
        toggleAllItemsInEvent={a.toggleAllItemsInEvent}
        toggleTypeGroup={a.toggleTypeGroup}
        vincularRestantes={a.vincularRestantes}
        abrirAutoVinculo={a.abrirAutoVinculo}
        handleOpenSponsorDialog={a.handleOpenSponsorDialog}
        renderLinhaDaPeca={renderLinhaDaPeca}
        temFiltroAtivo={v.temFiltroAtivo}
        limparFiltros={() => { v.setSearchQuery(''); v.setEventFilter([]); v.setSponsorFilter([]); v.setItemFilter([]); v.setStatusFilter([]); }}
        agrupamento={v.agrupamento}
        setAgrupamento={v.setAgrupamento}
        emCartoes={emCartoes}
        dedo={dedo}
      />

      <ModalPatrocinadoresDoEvento
        sponsorDialogOpen={a.sponsorDialogOpen}
        setSponsorDialogOpen={a.setSponsorDialogOpen}
        sponsorModalSearch={a.sponsorModalSearch}
        setSponsorModalSearch={a.setSponsorModalSearch}
        selectedEventForSponsors={a.selectedEventForSponsors}
        selectedSponsorIds={a.selectedSponsorIds}
        setSelectedSponsorIds={a.setSelectedSponsorIds}
        sponsors={v.sponsors}
        handleSaveEventSponsors={a.handleSaveEventSponsors}
        salvando={a.manageEventSponsorsMutation.isPending}
        dedo={dedo}
        isMobile={isMobile}
      />

      <ModalAcrescentar
        acrescentarAberto={a.acrescentarAberto}
        setAcrescentarAberto={a.setAcrescentarAberto}
        acrescentarSponsorId={a.acrescentarSponsorId}
        setAcrescentarSponsorId={a.setAcrescentarSponsorId}
        buscaAcrescentar={a.buscaAcrescentar}
        setBuscaAcrescentar={a.setBuscaAcrescentar}
        acrescentarAlvo={a.acrescentarAlvo}
        sponsors={v.sponsors}
        confirmarAcrescentar={a.confirmarAcrescentar}
        acrescentando={a.acrescentarSponsorMutation.isPending}
        dedo={dedo}
        isMobile={isMobile}
      />

      <ModalAplicarEmLote
        bulkApplyDialogOpen={a.bulkApplyDialogOpen}
        setBulkApplyDialogOpen={a.setBulkApplyDialogOpen}
        bulkSponsorSearch={a.bulkSponsorSearch}
        setBulkSponsorSearch={a.setBulkSponsorSearch}
        bulkSelectedSponsors={a.bulkSelectedSponsors}
        setBulkSelectedSponsors={a.setBulkSelectedSponsors}
        bulkSkipApproval={a.bulkSkipApproval}
        setBulkSkipApproval={a.setBulkSkipApproval}
        toggleBulkSkip={a.toggleBulkSkip}
        handleApplyBulkSponsors={a.handleApplyBulkSponsors}
        selectedItemIds={selectedItemIds}
        items={v.items}
        visibleItems={v.visibleItems}
        eventFilter={v.eventFilter}
        getEventSponsors={v.getEventSponsors}
        dedo={dedo}
        isMobile={isMobile}
      />

      {/* Dialog de Detalhes do Item */}
      <ItemDetailsDialog
        item={v.selectedItemForDetails}
        auditLogs={v.auditLogs}
        open={!!v.selectedItemForDetails}
        onOpenChange={(open) => !open && v.setSelectedItemForDetails(null)}
      />

      <ModalResultadoDoLote resultadoDoLote={a.resultadoDoLote} setResultadoDoLote={a.setResultadoDoLote} />

      <ModalConfirmarEnvio
        sendConfirmModal={a.sendConfirmModal}
        setSendConfirmModal={a.setSendConfirmModal}
        isSending={a.isSending}
        soSemPatrocinador={a.soSemPatrocinador}
        setSoSemPatrocinador={a.setSoSemPatrocinador}
        originalSponsorsMap={originalSponsorsMap}
        sponsors={v.sponsors}
        events={v.events}
        progressoEnvio={a.progressoEnvio}
        handleModalConfirmSend={a.handleModalConfirmSend}
        enviando={sendToArteMutation.isPending}
        dedo={dedo}
      />
    </div>
  );
}
