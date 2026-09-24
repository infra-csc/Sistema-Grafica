// ─────────────────────────────────────────────────────────────────────────────
// A GRÁFICA — a fila de produção: imprimir, conferir, embalar e entregar.
//
// Esta página é a COMPOSIÇÃO. Os dados e o recorte moram nos hooks de
// components/grafica/hooks/ (fila, facetas, tubos, lote, modal da peça,
// edições em linha, complemento criado); o desenho, em components/grafica/fila/
// (cabeçalho, cartões de etapa, filtros, resumo, lista, linha da tabela, cartão
// do celular, barra do lote) e components/grafica/modais/. Aqui fica o que
// junta as partes: os gates por papel, a densidade da tabela pela largura, o
// inventário do que cada linha memoizada lê (`depsDaLinha`) e os modais.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useMemo, useLayoutEffect, useRef } from "react";
import type React from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile, useElementSize, densityFromWidth, usePonteiroGrosso } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/auth-context";
import { getStatusLabel, seloPecaEventoFinalizado } from "@/lib/status";
import { diasNaFase } from "@/lib/idade-na-fase";
import { invalidarGraficaEMaquinas } from "@/lib/tempo-real-grafica";
import { aEmbalar } from "@shared/embalagem";
import { remainingConfer } from "@/lib/saldo";
import { Abas } from "@/components/ui/abas";
import { useConfirmar } from "@/components/ui/usar-confirmar";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import { TubosDialog } from "@/components/tubos-dialog";
import { GalpaoFila, type GalpaoDados } from "@/components/galpao-fila";
import { AbaTubos } from "@/components/grafica/aba-tubos";
// Teclado virtual: a folha de filtros sobe junto com ele (ver o arquivo).
import { useAcompanharAreaVisivel } from "@/components/grafica/area-visivel";
import { T } from "@/lib/theme";
// AUMENTAR QUANTIDADE nasce AQUI. Esta é a tela onde as peças em produção
// vivem e onde o aumento precisa ser visto — o Detalhe do Evento ficou só com
// a REDUÇÃO (campo Qtd. com piso físico) e aponta para cá. O gate é
// `podeMexerNaQuantidade` (admin | solicitacao), NUNCA `canProduce`: o operador
// da Gráfica vê a peça, o selo, o motivo e o botão Produzir — e não vê Aumentar.
import {
  AumentarQuantidadeDialog,
  ComplementoDaFicha,
  temBlocoDeComplemento,
} from "@/components/aumentar-quantidade-dialog";
import type { PecaDaFila } from "@/components/grafica/tipos";
import { useFilaDaGrafica, useHistoricoDaPeca } from "@/components/grafica/hooks/use-fila-da-grafica";
import { useTubosDaFila } from "@/components/grafica/hooks/use-tubos-da-fila";
import { useEdicaoNaLinha } from "@/components/grafica/hooks/use-edicao-na-linha";
import { useSelecaoEmLote } from "@/components/grafica/hooks/use-selecao-em-lote";
import { useModalDaPeca } from "@/components/grafica/hooks/use-modal-da-peca";
import { useComplementoCriado } from "@/components/grafica/hooks/use-complemento-criado";
import { gatesDaGrafica } from "@/components/grafica/fila/regras";
import type { ContextoDaLinha } from "@/components/grafica/fila/contexto-da-linha";
import { AtalhosDaGrafica, CabecalhoDaGrafica } from "@/components/grafica/fila/cabecalho-da-grafica";
import { CartoesDeEtapa } from "@/components/grafica/fila/cartoes-de-etapa";
import { BarraDeFiltros } from "@/components/grafica/fila/barra-de-filtros";
import { ResumoDaLista, BannerDoComplemento } from "@/components/grafica/fila/resumo-da-lista";
import { ListaDaFila } from "@/components/grafica/fila/lista-da-fila";
import { BarraDoLote } from "@/components/grafica/fila/barra-do-lote";
import { CSS_DA_TRAVA } from "@/components/grafica/fila/trava-da-peca";
import { BulkActionDialog } from "@/components/grafica/modais/conferencia-em-lote";
import { ModalDaPeca } from "@/components/grafica/modais/modal-da-peca";
import { ModalTravar, useTravaDaPeca } from "@/components/grafica/modais/modal-travar";
import { ModalDevolver, useDevolverParaRevisao } from "@/components/grafica/modais/modal-devolver";

export default function Grafica() {
  const { user } = useAuth();
  // Os gates por papel — o espelho de cada rota no servidor (fila/regras.ts).
  const gates = useMemo(() => gatesDaGrafica(user), [user]);
  const { canProduce, podeConferir, canConfer, podeEmbalar, oferecerEmbalarJunto, podeMexerQtd, podeMexerNaTrava } = gates;
  const { toast } = useToast();
  const [viewDetailsItem, setViewDetailsItem] = useState<PecaDaFila | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  // A folha de filtros do CELULAR (ver BarraDeFiltros).
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  // Último "quem recebeu" registrado NESTA sessão (entrega do volume). Só
  // memória da tela: vira atalho de um toque no campo da aba/painel de tubos.
  const [ultimoRecebedor, setUltimoRecebedor] = useState("");
  const isMobile = useIsMobile();
  // Tablet do galpão: o ponteiro é o dedo em qualquer largura — os alvos do
  // topo e dos chips sobem para 44px por isto, não pela largura da janela.
  const ponteiroGrosso = usePonteiroGrosso();
  /** Botão de ação dentro da LINHA da tabela: 32px no mouse, 44 no dedo. */
  const tamLinha = ponteiroGrosso ? ("toque" as const) : ("sm" as const);
  // A pergunta de confirmação é do app, não do navegador (ver useConfirmar).
  const { dialogo: dialogoDeConfirmacao } = useConfirmar();
  /** Celular: nenhuma informação abaixo de 12px (o galpão lê no sol, de braço esticado). */
  const fsMin = (n: number) => (isMobile ? Math.max(12, n) : n);
  /**
   * Alvo de 44px num botão que mora NO MEIO DE UMA FRASE (resumo da lista):
   * a altura vira área de toque e a margem negativa devolve a linha de texto
   * ao tamanho normal — o parágrafo não engorda, o dedo acerta.
   */
  const alvoNoTexto: React.CSSProperties = isMobile
    ? { display: "inline-flex", alignItems: "center", minHeight: 44, margin: "-14px 0", verticalAlign: "middle" }
    : {};
  // Folha de filtros do celular: acompanha o teclado virtual (area-visivel.ts).
  const folhaFiltrosRef = useRef<HTMLDivElement>(null);
  useAcompanharAreaVisivel(folhaFiltrosRef, "tela-cheia", isMobile && filtrosAbertos);
  // DENSIDADE PELA LARGURA DO CONTEÚDO, não da janela (mesma régua do Painel
  // Geral). O tablet do galpão em pé (768–1024px) com a sidebar aberta deixa
  // 500–700px de conteúdo — e `isMobile` respondia "desktop": caía na tabela
  // de dez colunas com rolagem lateral, o pior formato possível para quem
  // trabalha com a peça na mão. Abaixo de 820px de conteúdo a fila vira cards;
  // entre 820 e 1180 a tabela funde colunas secundárias. O padding de 24px de
  // cada lado sai da conta porque a medida é da caixa da raiz.
  const { ref: raizRef, width: larguraRaiz } = useElementSize<HTMLDivElement>();
  const larguraConteudo = larguraRaiz - (isMobile ? 24 : 48);
  // ── A TABELA QUE NÃO CABE (dono, 17/09: "cortando quando o menu está aberto,
  // cortando o status") ──────────────────────────────────────────────────────
  // Os limites 820/1180 são um CHUTE sobre a largura mínima da tabela — e ela
  // depende do conteúdo: descrição longa, selos, quantos botões a linha tem.
  // Com a barra lateral aberta (~1.380px úteis) a tabela cheia passava da
  // caixa: a coluna de Ações (sticky à direita) cobria o Status ("PR", "há 1")
  // e o botão principal saía pela borda. Agora a tabela se MEDE depois de
  // desenhada: se rolou para o lado, esta largura de conteúdo fica marcada
  // como "não cabe" para aquela densidade e a tela desce um degrau (cheia →
  // compacta → cartões). Marca a LARGURA, não um booleano: alargar a janela
  // além dela tenta de novo o degrau de cima (e, se estourar, remarca).
  const [estouroEm, setEstouroEm] = useState<{ full: number; compact: number }>({ full: 0, compact: 0 });
  const densidadeBase = larguraRaiz === 0 ? (isMobile ? "cards" : "full") : densityFromWidth(larguraConteudo);
  const densidade = larguraRaiz === 0 ? densidadeBase
    : densidadeBase === "full" && larguraConteudo <= estouroEm.full
      ? (larguraConteudo <= estouroEm.compact ? "cards" : "compact")
    : densidadeBase === "compact" && larguraConteudo <= estouroEm.compact ? "cards"
    : densidadeBase;
  const usaCards = isMobile || densidade === "cards";
  const compacto = !usaCards && densidade === "compact";
  /** A caixa de rolagem lateral da tabela — é nela que se mede o estouro. */
  const tabelaRolagemRef = useRef<HTMLDivElement>(null);
  // Colunas da tabela. Eram dez, com REAPROV. e PROD como colunas próprias
  // quase sempre "—": viraram linhas pequenas DENTRO da célula de Qtd, onde a
  // pergunta "quanto desta peça já andou?" nasce. Na densidade compacta,
  // Material desce para baixo da descrição e o m² para baixo das medidas — a
  // informação fica, a rolagem lateral some. `direita` = coluna numérica.
  const colunas: { rotulo: string; direita?: boolean }[] = [
    { rotulo: "ID" },
    { rotulo: "Peça" },
    { rotulo: "Qtd", direita: true },
    { rotulo: "Medidas (ARQ / VIS)" },
    ...(compacto ? [] : [{ rotulo: "m² a produzir", direita: true }, { rotulo: "Material" }]),
    { rotulo: "Status" },
    { rotulo: "" },
  ];
  const nColunas = colunas.length;

  /**
   * MODO GALPÃO (celular): conferir em fila, uma peça por vez (a entrega é do
   * volume, na aba Tubos — não há mais fila de entrega por peça).
   *
   * As mutações daqui não passam pelas useMutation dos modais de propósito:
   * o onSuccess delas fecha modal, zera fotos e dispara um toast por peça —
   * efeitos do fluxo de bancada. Na fila, o avanço é do componente e o resumo
   * é um só, na saída.
   */
  const [galpao, setGalpao] = useState<null | "confer">(null);
  const registrarNoGalpao = async (item: PecaDaFila, dados: GalpaoDados) => {
    await apiRequest("POST", `/api/items/${item.id}/confer`, {
      conferencePhotoUrl: dados.photoUrl, qty: dados.qty, notes: "",
    });
    // Invalidação POR PEÇA, não só na saída: esta é a tela em que duas pessoas
    // trabalham a mesma fila ao mesmo tempo — o computador da bancada precisa
    // ver a peça sumir enquanto o conferente anda com o celular.
    invalidarGraficaEMaquinas();
  };
  const fecharGalpao = (feitas: number) => {
    setGalpao(null);
    if (feitas > 0) {
      toast({
        title: "Conferência feita",
        description: `${feitas} peça${feitas !== 1 ? "s" : ""} conferida${feitas !== 1 ? "s" : ""} pela fila. Agora é embalar. As etiquetas já podem ser impressas — atalho no cabeçalho do evento.`,
      });
    }
  };

  const fila = useFilaDaGrafica();
  const { pecasDoServidor, items, isLoading, hojeBusinessMs, hojeUTC, filteredItems, filtros, itemPorId, tubaveisPorEvento, linhasRenderizadas } = fila;
  const tubos = useTubosDaFila(pecasDoServidor);
  const { tubosDoEvento, setTubosDoEvento, numeroDoTubo, fechamentoDoTubo, conteudoDoTubo, ehAvulsa, seloDoTubo, tirarDoTuboMutation } = tubos;
  const trava = useTravaDaPeca(podeMexerNaTrava);
  const modal = useModalDaPeca({ items, canConfer, canProduce, oferecerEmbalarJunto, avisarTravada: trava.avisarTravada, isMobile });
  const { selectedItem } = modal;
  const devolucao = useDevolverParaRevisao(isMobile);
  const complemento = useComplementoCriado(fila);
  const { complementoItem, setComplementoItem, novoComplementoId, abrirComplemento, handleComplementoCriado } = complemento;
  const edicao = useEdicaoNaLinha(compacto);
  const {
    reuseConfirmItemId, reuseQty, correctReuseItemId, correctReuseQty, cancelComplementId, menuAcoesId, menuParaCima, idMenuAberto,
    markReuseMutation, correctReuseMutation, cancelComplementMutation,
  } = edicao;
  const lote = useSelecaoEmLote({ filteredItems, itemPorId, canConfer, podeEmbalar, tubosDoEvento, setTubosDoEvento, viewDetailsItem, selectedItem });
  const { bulkOn, bulkConferMode, bulkPackMode, bulkSelectedIds, conferableInFilter, sairDoLote } = lote;
  const auditLogs = useHistoricoDaPeca(viewDetailsItem?.id);

  // A ABA DA TELA — "fila" (padrão) ou "tubos", em `?aba=`. replaceState: trocar
  // de aba não empilha histórico nem mexe nos outros parâmetros (os filtros).
  const [abaDaTela, setAbaDaTela] = useState<"fila" | "tubos">(() => (new URLSearchParams(window.location.search).get("aba") === "tubos" ? "tubos" : "fila"));
  const irParaAba = (aba: "fila" | "tubos") => {
    const u = new URL(window.location.href);
    if (aba === "fila") u.searchParams.delete("aba"); else u.searchParams.set("aba", aba);
    window.history.replaceState(null, "", u.pathname + u.search);
    setAbaDaTela(aba);
  };

  /** Margem interna do corpo dos modais: 24 roubava 48px de largura em 360. */
  const padModal = isMobile ? 16 : 24;

  // Exporta a lista visível. Manda os ids em vez de repetir os filtros no
  // servidor — o arquivo sai idêntico ao que está na tela.
  const handleExportXlsx = async () => {
    if (!filteredItems.length) return;
    setIsExporting(true);
    try {
      const statusNames = filtros.status.map(s => getStatusLabel(s));
      const title = statusNames.length
        ? `Produção — ${statusNames.join(", ")}`
        : "Produção — Gráfica";

      const res = await fetch("/api/items/export-xlsx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ itemIds: filteredItems.map((i) => i.id), title }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Falha ao gerar o arquivo");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: "Erro ao exportar", description: (error as Error).message, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  // ── Dependências das linhas memoizadas (LinhaMemo) ─────────────────────────
  // Cada tecla na busca, cada modal aberto e cada revalidação (polling,
  // WebSocket, foco) re-renderizava TODAS as linhas desenhadas, mesmo sem
  // mudança nenhuma nelas. Agora uma linha só roda de novo quando muda algo
  // que ela LÊ — e esta lista é o inventário disso. Estado novo lido dentro
  // da linha entra aqui, senão a linha fica com o valor (e o handler) velho.
  //   • da página: papel do usuário (todos os gates derivam dele), modo de
  //     lote, densidade da tabela, o dia (selo de evento finalizado, prazo) e
  //     o "enviando" das três mutações que desabilitam botões na linha;
  //   • da linha: a peça (referência — a revalidação preserva a das
  //     inalteradas), realce de recém-criada, seleção no lote, dias na fase e
  //     o valor em edição SÓ se a edição aberta for a dela.
  // Os handlers (abrir modal, marcar, expandir) só chamam setState e
  // `mutation.mutate`, estáveis entre renders — não precisam entrar.
  const agoraDaTela = new Date();
  const depsDasLinhas: unknown[] = [
    user, bulkOn, bulkConferMode, bulkPackMode, compacto,
    hojeBusinessMs, hojeUTC,
    // O alvo dos botões da linha segue o ponteiro (tablet com o dedo).
    ponteiroGrosso,
    markReuseMutation.isPending, correctReuseMutation.isPending, cancelComplementMutation.isPending,
  ];
  const depsDaLinha = (item: PecaDaFila, daPosicao: unknown[]): unknown[] => [
    ...depsDasLinhas,
    item,
    item.id === novoComplementoId,
    bulkSelectedIds.has(item.id),
    diasNaFase(item, agoraDaTela),
    reuseConfirmItemId === item.id ? reuseQty : null,
    correctReuseItemId === item.id ? correctReuseQty : null,
    cancelComplementId === item.id,
    // o menu "⋯" das ações secundárias (tabela compacta) aberto NESTA linha
    menuAcoesId === item.id,
    // …ou aberto por uma edição em linha dele (z-index da célula), e o lado
    idMenuAberto === item.id,
    idMenuAberto === item.id && menuParaCima,
    // TUBOS: o chip "Tubo N" da linha e o botão "Tubos" do cabeçalho do evento
    // leem estes dois; sem eles a linha memoizada não redesenhava quando a
    // peça entrava num tubo ou o evento ganhava a primeira peça tubável.
    item.tuboId ? numeroDoTubo.get(item.tuboId) ?? null : null,
    // …e o "fechado 14:32" do selo (21/09): a linha redesenha quando o tubo fecha.
    item.tuboId ? fechamentoDoTubo.get(item.tuboId) ?? null : null,
    // …e o "· 4 peças" + a lista do title: muda quando outra peça entra ou sai.
    item.tuboId ? conteudoDoTubo.get(item.tuboId)?.lista ?? null : null,
    // "Embalada" × "Tubo N", "Entregar" × "Entregar tubo".
    ehAvulsa(item),
    // o selo com as quantidades por volume e o "Embalar 3"
    seloDoTubo(item), aEmbalar(item),
    // Só a linha DESTA peça fica "pendente" ao tirar do tubo — o booleano
    // global redesenhava a fila inteira a cada clique.
    tirarDoTuboMutation.isPending && tirarDoTuboMutation.variables?.itemId === item.id,
    tubaveisPorEvento.get(String(item.eventId)) ?? 0,
    ...daPosicao,
  ];

  // Mede a tabela depois de desenhada (ver `estouroEm`). useLayoutEffect: a
  // troca de densidade acontece antes da pintura — ninguém vê a tabela cortada
  // piscar. Roda quando muda a largura, a densidade ou o recorte desenhado; não
  // a cada tecla. No jsdom scrollWidth é 0 e nada acontece.
  useLayoutEffect(() => {
    const caixa = tabelaRolagemRef.current;
    if (!caixa || usaCards || larguraRaiz === 0) return;
    if (caixa.scrollWidth - caixa.clientWidth > 1) {
      const chave = compacto ? "compact" : "full";
      setEstouroEm(e => (e[chave] >= larguraConteudo ? e : { ...e, [chave]: larguraConteudo }));
    }
    // bulkOn: sair do lote devolve os botões à coluna de Ações — a mesma
    // largura de tela pode deixar de caber.
  }, [larguraRaiz, larguraConteudo, compacto, usaCards, linhasRenderizadas, bulkOn]);

  // O que cada linha memoizada lê (ver contexto-da-linha.ts).
  const ctx: ContextoDaLinha = {
    ...gates, ...edicao,
    seloDoItem: fila.seloDoItem, seloDaImpressao: fila.seloDaImpressao, etiquetaveisPorEvento: fila.etiquetaveisPorEvento,
    tubaveisPorEvento, typeToGroup: fila.typeToGroup, expandirGrupo: fila.expandirGrupo,
    setTubosDoEvento, seloDoTubo, tituloDoTubo: tubos.tituloDoTubo, abrirTuboDaPeca: tubos.abrirTuboDaPeca, fechamentoDoTubo,
    temVolumeAberto: tubos.temVolumeAberto, ehAvulsa, tirarDoTuboMutation,
    bulkOn, bulkConferMode, bulkPackMode, bulkSelectedIds, toggleBulkItem: lote.toggleBulkItem, abrirEmbalar: lote.abrirEmbalar,
    openProductionModal: modal.openProductionModal, openConferenceModal: modal.openConferenceModal,
    tirarBloqueada: modal.tirarBloqueada, podeTirarBloqueada: modal.podeTirarBloqueada, mutacoesDeImpressao: modal.mutacoesDeImpressao,
    travaDaLinha: trava.travaDaLinha,
    setDevolverItem: devolucao.setDevolverItem, setDevolverMotivo: devolucao.setDevolverMotivo,
    novoComplementoId, abrirComplemento, setViewDetailsItem,
    compacto, nColunas, tamLinha, ponteiroGrosso,
  };

  // paddingBottom no lote: a barra fixa do celular tem DUAS linhas (≈120px +
  // recorte seguro); com os 88 do desktop ela cobria a última peça.
  return (
    <div ref={raizRef} style={{ display: "flex", flexDirection: "column", gap: isMobile ? 8 : 16, padding: isMobile ? "12px 12px" : 24, paddingBottom: bulkOn ? (isMobile ? 'calc(140px + env(safe-area-inset-bottom))' : 'calc(88px + env(safe-area-inset-bottom))') : isMobile ? 12 : 24, backgroundColor: T.bg, height: "100%", overflowY: "auto" }}>
      {dialogoDeConfirmacao}

      <CabecalhoDaGrafica fila={fila} lote={lote} podeConferir={podeConferir} isMobile={isMobile} ponteiroGrosso={ponteiroGrosso}
        isExporting={isExporting} handleExportXlsx={handleExportXlsx} setGalpao={setGalpao} />

      {/* ── As abas da tela: Fila | Tubos — uma abinha separada, não uma
          página. O <Abas> do design system — o mesmo de Máquinas: tablist,
          setas, roving tabindex e 44px. O número de tubos abertos vai no
          contador da aba. `?aba=tubos` na URL; cada aba monta SÓ o próprio
          painel. */}
      <div data-testid="abas-grafica">
        {/* No celular, Máquinas e Excel (só ícones) moram à direita das abas —
            ver AtalhosDaGrafica. A linha das abas já existia; a deles não. */}
        <div style={isMobile ? { display: "flex", alignItems: "center", gap: 8 } : undefined}>
        <Abas
          style={isMobile ? { flex: "1 1 auto", minWidth: 0 } : undefined}
          rotuloDaLista="Seções da Gráfica"
          prefixoDeTestId="aba-grafica"
          ativo={abaDaTela}
          aoTrocar={(id) => irParaAba(id === "tubos" ? "tubos" : "fila")}
          itens={[
            { id: "fila", rotulo: "Fila" },
            { id: "tubos", rotulo: "Tubos", contador: tubos.tubosAbertosNaTela > 0 ? tubos.tubosAbertosNaTela : undefined, tom: "info" },
          ]}
        />
        {isMobile && !lote.bulkOn && (
          <AtalhosDaGrafica fila={fila} isMobile ponteiroGrosso={ponteiroGrosso} isExporting={isExporting} handleExportXlsx={handleExportXlsx} />
        )}
        </div>
      </div>

      {abaDaTela === "tubos" && (
        <AbaTubos sugestaoRecebedor={ultimoRecebedor} onEntregou={setUltimoRecebedor}
          onAbrirPeca={(id) => { const peca = itemPorId.get(id); if (peca) setViewDetailsItem(peca); }} />
      )}

      {abaDaTela === "fila" && (
      <div id="painel-fila" role="tabpanel" aria-label="Fila" style={{ display: "contents" }}>
        <CartoesDeEtapa stats={fila.stats} filtros={filtros} patchFiltros={fila.patchFiltros} isMobile={isMobile} isLoading={isLoading}
          larguraConteudo={larguraRaiz === 0 ? 0 : larguraConteudo} />

        <BarraDeFiltros fila={fila} isMobile={isMobile} usaCards={usaCards} ponteiroGrosso={ponteiroGrosso}
          showAdvancedFilters={showAdvancedFilters} setShowAdvancedFilters={setShowAdvancedFilters}
          filtrosAbertos={filtrosAbertos} setFiltrosAbertos={setFiltrosAbertos} folhaFiltrosRef={folhaFiltrosRef} />

        {/* ── A lista: o resumo do recorte em cima, o aviso da peça-filha que
            nasceu fora dele e as peças (cartões ou tabela). ── */}
        <div style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: 12 }}>
          <ResumoDaLista fila={fila} isMobile={isMobile} ponteiroGrosso={ponteiroGrosso} alvoNoTexto={alvoNoTexto} fsMin={fsMin} />
          <BannerDoComplemento bannerComplemento={complemento.bannerComplemento} mostrarComplementoCriado={complemento.mostrarComplementoCriado}
            setBannerComplemento={complemento.setBannerComplemento} isMobile={isMobile} ponteiroGrosso={ponteiroGrosso} />
          <ListaDaFila fila={fila} ctx={ctx} depsDaLinha={depsDaLinha} usaCards={usaCards} colunas={colunas} tabelaRolagemRef={tabelaRolagemRef} />
        </div>
      </div>
      )}

      <BarraDoLote lote={lote} isMobile={isMobile} ponteiroGrosso={ponteiroGrosso} usaCards={usaCards} />

      {/* ── Conferência em lote ── Fechar NÃO descarta a foto; trocar as
          peças marcadas, sim: ver `selecaoDaFotoRef` e `sairDoLote`. */}
      <BulkActionDialog
        open={lote.bulkConferOpen}
        onClose={() => lote.setBulkConferOpen(false)}
        items={lote.bulkSelectedItems}
        photos={lote.bulkConferPhotos}
        onAddPhoto={lote.addBulkConferPhoto}
        onRemovePhoto={url => lote.setBulkConferPhotos(prev => prev.filter(u => u !== url))}
        onPhotoError={modal.onPhotoError}
        notes={lote.bulkConferNotes}
        onNotesChange={lote.setBulkConferNotes}
        isSubmitting={lote.isBulkSubmitting}
        onConfirm={lote.handleBulkConference}
        qtyFor={remainingConfer}
      />

      {/* ── Dialog de Detalhes ── */}
      {/* O bloco de complemento da ficha é o MESMO componente das outras telas —
          zero desenho novo. Na mãe: a lista de complementos com status e o total
          realmente contratado; no filho: "complemento de #0062" com motivo,
          autor e data. `onAbrirPeca` resolve o beco sem saída — do complemento
          (que nunca tem o gatilho) chega-se à mãe em um clique.
          `temBlocoDeComplemento` é obrigatório: o slot é testado por verdade do
          nó, e um elemento que renderiza null deixa 36px de buraco em toda peça
          normal. */}
      <ItemDetailsDialog
        item={viewDetailsItem}
        auditLogs={auditLogs}
        open={!!viewDetailsItem}
        onOpenChange={(open) => !open && setViewDetailsItem(null)}
        customActions={temBlocoDeComplemento(viewDetailsItem, podeMexerQtd)
          ? (
            <ComplementoDaFicha
              item={viewDetailsItem}
              canEditLists={podeMexerQtd}
              /* Terceira porta para POST /api/items/:id/complement, que a
                 guarda de evento finalizado barra. Sem `onAumentar` o
                 ComplementoDaFicha não desenha o botão — e aqui HIDE em vez de
                 disable é o certo: a ficha é uma sobreposição, e quem chegou
                 nela veio da linha, onde o selo e o botão desabilitado com o
                 motivo já contaram a história. */
              onAumentar={seloPecaEventoFinalizado(viewDetailsItem?.event, hojeBusinessMs) ? undefined : abrirComplemento}
              onAbrirPeca={(id) => setViewDetailsItem(items.find((i) => i.id === id) ?? viewDetailsItem)}
            />
          )
          : undefined}
      />

      {/* ── Aumentar quantidade: o modal, montado uma vez para a tela ── */}
      <AumentarQuantidadeDialog
        item={complementoItem}
        event={complementoItem?.event ?? null}
        open={!!complementoItem}
        onOpenChange={(o) => { if (!o) setComplementoItem(null); }}
        onCreated={handleComplementoCriado}
      />

      <ModalDaPeca modal={modal} pecasDoServidor={pecasDoServidor} oferecerEmbalarJunto={oferecerEmbalarJunto}
        isMobile={isMobile} padModal={padModal} fsMin={fsMin} />

      <style>{CSS_DA_TRAVA}</style>
      <ModalTravar trava={trava} isMobile={isMobile} ponteiroGrosso={ponteiroGrosso} />
      <TubosDialog evento={tubosDoEvento} onClose={() => setTubosDoEvento(null)}
        itensIniciais={tubosDoEvento?.embalar} emLote={tubosDoEvento?.lote} tuboInicial={tubosDoEvento?.entregarTubo ?? undefined}
        verTubo={tubosDoEvento?.verTubo ?? undefined}
        onAbrirPeca={(id) => { const peca = itemPorId.get(id); if (peca) { setTubosDoEvento(null); setViewDetailsItem(peca); } }}
        onEmbalou={() => { if (bulkPackMode) sairDoLote(); }}
        sugestaoRecebedor={ultimoRecebedor} onEntregou={setUltimoRecebedor} />

      {galpao && (
        <GalpaoFila
          mode={galpao}
          itens={conferableInFilter}
          onClose={fecharGalpao}
          onConfirmar={registrarNoGalpao}
          sugestaoRecebedor={ultimoRecebedor}
        />
      )}

      <ModalDevolver devolucao={devolucao} isMobile={isMobile} padModal={padModal} fsMin={fsMin} />
    </div>
  );
}
