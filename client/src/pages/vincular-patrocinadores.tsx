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
import { T, N, R, FS, FW, FONT } from "@/lib/theme";
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
  // A MESMA CAIXA DA TELA nos três estados de exceção (carregando, erro,
  // vazio): container, margens e o título no mesmo lugar. A silhueta tinha
  // largura e recuo próprios (1100px, 18px) e a tela "pulava" 7px quando os
  // dados chegavam; erro e vazio apareciam sem título nenhum, soltos no meio
  // do branco — sem dizer em que tela a pessoa estava.
  const caixa = "container mx-auto p-4 max-w-6xl 2xl:max-w-[1440px]";
  const titulo = (
    <>
      <div style={{ marginBottom: 8, fontSize: FS.micro, fontWeight: FW.rotulo, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.accentText }}>
        Antes da Arte
      </div>
      <h1 style={{ margin: '0 0 24px', fontFamily: FONT.display, fontSize: FS.h1, fontWeight: FW.rotulo, letterSpacing: '-0.03em', lineHeight: 1.15, color: T.text }}>
        Vincular Patrocinadores
      </h1>
    </>
  );

  if (v.itemsLoading || v.eventsLoading) {
    // Silhueta em vez de spinner central: reserva o espaço da lista e a
    // chegada dos dados não empurra a tela. Desenha o cabeçalho, os passos,
    // a barra de situação e os filtros, nas alturas reais.
    const barra = (w: number | string, h: number, cor: string = N.n3, mb = 0) => (
      <div className="animate-pulse" style={{ width: w, height: h, borderRadius: R.sm, backgroundColor: cor, marginBottom: mb, maxWidth: '100%' }} />
    );
    return (
      <div key="carregando" aria-busy="true" className={caixa}>
        {barra(84, 10, N.n3, 10)}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
          <div>{barra(280, 28, T.border, 10)}{barra(240, 14)}</div>
          {isMobile
            ? <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>{barra('100%', 44, T.border)}{barra('100%', 44, N.n2)}</div>
            : <div style={{ display: 'flex', gap: 10 }}>{barra(200, 44, N.n2)}{barra(170, 44, T.border)}</div>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: emCartoes ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: emCartoes ? 8 : 20, maxWidth: 920, marginBottom: 24 }}>
          {[0, 1, 2].map(i => <div key={i}>{!emCartoes && barra('100%', 2, i === 0 ? T.border : N.n3, 10)}{barra('80%', 12)}</div>)}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 14, borderBottom: `1px solid ${T.border}`, marginBottom: 18 }}>
          {barra(132, 8, T.border)}{barra(90, 12)}{barra(100, 32, N.n2)}{barra(90, 32, N.n2)}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          {barra(isMobile ? '100%' : 280, 36, N.n2)}{barra(150, 36, N.n2)}{barra(190, 36, N.n2)}{barra(140, 36, N.n2)}
        </div>
        <EsqueletoDeFila linhas={isMobile ? 5 : 8} />
      </div>
    );
  }

  // Falha de rede tem cara de falha, não de "nada para vincular" — sem isto o
  // erro caía no estado vazio logo abaixo e mentia sobre a causa. Cobre as
  // três queries de que a tela depende: sem eventos ou patrocinadores ela
  // também fica inutilizável (nenhum chip para vincular).
  if (v.itemsError || v.eventsError || v.sponsorsError) {
    return (
      <div key="erro" className={caixa}>
        {titulo}
        <div data-testid="button-retry-items" style={{ maxWidth: 520, margin: '40px auto 0' }}>
          {/* O testid antigo fica na caixa: o botão agora é o do EstadoErro. */}
          <EstadoErro
            titulo="Não foi possível carregar as peças"
            detalhe="Verifique sua conexão e tente novamente. Nada do que já estava salvo foi perdido."
            aoTentarDeNovo={() => { v.refetchItems(); v.refetchEvents(); v.refetchSponsors(); }}
          />
        </div>
      </div>
    );
  }

  if (v.visibleItems.length === 0) {
    return (
      <div key="vazio" className={caixa}>
        {titulo}
        <div style={{ maxWidth: 520, margin: '40px auto 0' }}>
          <EstadoVazio
            icone={CheckCircle2}
            titulo="Nada para vincular agora"
            descricao="Esta tela mostra apenas peças de eventos que ainda vão acontecer. Assim que a Solicitação cadastrar peças em um evento futuro, elas aparecem aqui para receber os patrocinadores."
          />
        </div>
      </div>
    );
  }

  // Cada estado (carregando, erro, vazio, tela) tem a sua `key`: sem ela o React
  // reaproveita a mesma <div> e mistura `padding` com `paddingBottom` ao trocar.
  // Com seleção, o respiro de baixo encolhe: a barra de lote é `sticky` e já
  // ocupa o próprio lugar no fim do fluxo.
  return (
    <div key="tela" className="container mx-auto p-4 max-w-6xl 2xl:max-w-[1440px] pb-24" style={{ height: "100%", overflowY: "auto", paddingBottom: selectedItemIds.size > 0 ? 24 : undefined }}>

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
        // Com filtro que zerou a lista, a frase do contexto dizia "Tudo enviado
        // à Arte" — falso: só não há nada À VISTA. O estado vazio logo abaixo
        // explica o filtro; o cabeçalho não pode contradizê-lo.
        fraseDeResolucao={v.temFiltroAtivo && v.totalDoContexto === 0 ? 'Nenhuma peça com os filtros atuais.' : v.fraseDeResolucao}
        contextStatusCounts={v.contextStatusCounts}
        eventFilter={v.eventFilter}
        abrirAutoVinculo={a.abrirAutoVinculo}
        abrirEnvioDasProntas={a.abrirEnvioDasProntas}
        enviando={sendToArteMutation.isPending}
        isMobile={isMobile}
        estreito={emCartoes}
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

      {/* Depois da lista, de propósito: é `sticky` (ver barra-de-lote) e
          precisa vir no fim do fluxo para grudar no rodapé da área. */}
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
        // Caixa estreita (lista em cartões) usa o arranjo empilhado da barra.
        isMobile={isMobile || emCartoes}
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
