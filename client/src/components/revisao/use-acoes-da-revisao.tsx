// ─────────────────────────────────────────────────────────────────────────────
// AS AÇÕES DA REVISÃO FINAL: todas as mutações da tela, cada uma com o aviso
// que responde "foi para onde?" e "e agora?".
//
// O hook recebe a cada render o estado de que as mutações precisam (a peça
// aberta, a fila, os setters dos diálogos). O TanStack atualiza as opções da
// mutação a cada render, então o onSuccess lê sempre o estado do render mais
// recente — o mesmo de quando as mutações moravam dentro da página.
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ToastAction } from "@/components/ui/toast";
import type { useToast } from "@/hooks/use-toast";
import { parseApiError } from "@/components/aumentar-quantidade-dialog";
import { CHAVE_DO_ESTOQUE_NA_REVISAO, chaveDaConsulta, estoqueRespondeu } from "@/components/consulta-de-estoque/na-revisao";
import type { EstoqueDaLinha } from "@/components/consulta-de-estoque/na-revisao";
import { propostaDaLiberacao } from "@shared/consultas-de-estoque";
import { ehBookCompleto } from "@shared/fluxo-peca";
import { ehMolde } from "@shared/molde";
import { CODIGO_PECA_TRAVADA } from "@shared/trava-da-peca";
import { buscarPecaAtual, destinoAoLiberar, emLotes, reaproveitamentoTotal } from "./regras";
import type { PecaDaRevisao, RespostaDaDevolucao, RespostaDoAviso, RespostaDoLoteDeDevolucao } from "./tipos";

type Setter<T> = Dispatch<SetStateAction<T>>;

export interface EntradaDasAcoes {
  toast: ReturnType<typeof useToast>["toast"];
  items: PecaDaRevisao[];
  pendingItems: PecaDaRevisao[];
  estoquePorPeca: Map<string, EstoqueDaLinha>;
  selectedItem: PecaDaRevisao | null;
  setSelectedItem: Setter<PecaDaRevisao | null>;
  setModalOpen: Setter<boolean>;
  quantityValue: number;
  setEditingQuantity: Setter<boolean>;
  setComplementItem: Setter<PecaDaRevisao | null>;
  setComplementSugestao: Setter<number | null>;
  cardObservations: string;
  /** Marca o avanço na fila, ou devolve `false` quando era a última. */
  marcarAvanco: () => boolean;
  proximaAposDecidir: MutableRefObject<number | null>;
  anotarFalhas: (falhas: Record<string, string>, limpar?: string[]) => void;
  setSelectedItemIds: Setter<Set<string>>;
  setReleaseConfirmOpen: Setter<boolean>;
  setReturnConfirmOpen: Setter<boolean>;
  setReturnObservations: Setter<string>;
  setBulkReleaseConfirmOpen: Setter<boolean>;
  setBulkReturnConfirmOpen: Setter<boolean>;
  setBulkReturnObservations: Setter<string>;
  setBulkReuseConfirmOpen: Setter<boolean>;
  setDeleteConfirmItemId: Setter<string | null>;
  setDesfazerReuseId: Setter<string | null>;
  setReuseDialogItemId: Setter<string | null>;
  setTravandoItem: Setter<PecaDaRevisao | null>;
  setMotivoDaTrava: Setter<string>;
}

export function useAcoesDaRevisao({
  toast, items, pendingItems, estoquePorPeca, selectedItem, setSelectedItem, setModalOpen,
  quantityValue, setEditingQuantity, setComplementItem, setComplementSugestao, cardObservations,
  marcarAvanco, proximaAposDecidir, anotarFalhas, setSelectedItemIds,
  setReleaseConfirmOpen, setReturnConfirmOpen, setReturnObservations,
  setBulkReleaseConfirmOpen, setBulkReturnConfirmOpen, setBulkReturnObservations, setBulkReuseConfirmOpen,
  setDeleteConfirmItemId, setDesfazerReuseId, setReuseDialogItemId, setTravandoItem, setMotivoDaTrava,
}: EntradaDasAcoes) {
  /**
   * DISPARAR O AVISO DA FILA AGORA.
   *
   * O aviso sai sozinho às 10h, 15h e 18h. Este botão existe porque o e-mail
   * SAI do sistema: o conector só autentica dentro do ambiente publicado, então
   * não há como verificar de fora que o canal está de pé — sem ele, a única
   * forma de descobrir que o aviso parou seria ninguém receber nada.
   *
   * Só admin, pela mesma régua do reenvio do book: um clique manda e-mail de
   * verdade para outras pessoas.
   */
  const avisarRevisaoMutation = useMutation({
    mutationFn: async (): Promise<RespostaDoAviso> => {
      const res = await apiRequest("POST", "/api/revisao/digest/enviar", {});
      return await res.json();
    },
    onSuccess: (r) => {
      // O servidor devolve a frase pronta — inclusive quando NÃO enviou (fila
      // vazia, remetente ausente). "Enviado" seria mentira nesses casos, e o
      // ponto do botão é justamente saber o que aconteceu.
      toast({
        title: r?.status === "enviado" ? "Aviso enviado" : "Aviso não enviado",
        description: r?.mensagem ?? "O envio não respondeu — tente de novo em instantes.",
        // Não enviado (fila vazia, remetente ausente) é aviso, não falha.
        variant: r?.status === "enviado" ? "success" : "warning",
      });
    },
    onError: (error) => toast({ title: "Erro ao disparar o aviso", description: error.message, variant: "destructive" }),
  });

  const updateQuantityMutation = useMutation({
    // apiRequest devolve o Response cru — sem o json() o "updatedItem" era o
    // Response e updatedItem.quantity saía sempre undefined.
    mutationFn: async ({ itemId, quantity }: { itemId: string; quantity: number }): Promise<Partial<PecaDaRevisao>> => {
      const res = await apiRequest("PATCH", `/api/items/${itemId}`, { quantity });
      return await res.json();
    },
    onSuccess: (updatedItem) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSelectedItem((prev) => prev ? { ...prev, quantity: updatedItem.quantity ?? quantityValue } : prev);
      setEditingQuantity(false);
      toast({ title: "Quantidade atualizada", description: `Nova quantidade: ${updatedItem.quantity ?? quantityValue}x`, variant: "success" });
    },
    // Rede de segurança do modelo de COMPLEMENTO. Esta tela só lista peças em
    // "Aguardando Revisão Final" — pré-produção, onde editar a quantidade
    // continua sendo o gesto certo. Mas a peça pode ter sido liberada e
    // produzida em outra aba enquanto o modal estava aberto: aí o servidor
    // recusa o aumento (409 USE_COMPLEMENT) e a resposta honesta é abrir o
    // fluxo do complemento, já com a diferença que ELE calculou. QUANTITY_FLOOR
    // é o mesmo raciocínio para a redução abaixo do que já existe fisicamente.
    onError: (error) => {
      const { message, code, data } = parseApiError(error);

      if (code === "USE_COMPLEMENT") {
        const idAlvo = data?.itemId ?? selectedItem?.id;
        const daFila = items.find((i) => i.id === idAlvo) ?? selectedItem;
        setEditingQuantity(false);
        toast({
          title: "Peça em produção",
          description: 'Use "Aumentar quantidade" — o aumento vira uma peça complementar.',
          variant: "warning",
        });
        const abrirComplemento = (alvo: PecaDaRevisao | null) => {
          if (!alvo) return;
          // `suggestedComplement` só existe quando o corpo JSON chega inteiro;
          // no caminho normal (apiRequest desembrulha o erro em texto) a
          // diferença é a que o próprio modal tentou salvar menos a atual.
          const atual = Number(alvo?.quantity);
          setComplementSugestao(
            Number(data?.suggestedComplement)
              || (Number.isFinite(atual) && quantityValue > atual ? quantityValue - atual : null),
          );
          setComplementItem(alvo);
        };
        // A peça já saiu desta fila (está em produção): a lista recortada não
        // a tem mais, e o complemento precisa do status, da quantidade e dos
        // complementos de AGORA. Sem id, ou se a busca falhar, segue com a
        // peça que o modal mostrava. Book completo nunca entra em `items`:
        // mesma régua aqui.
        if (!idAlvo) { abrirComplemento(daFila); return; }
        void buscarPecaAtual(idAlvo).then((atual) =>
          abrirComplemento(atual && !ehBookCompleto(atual) ? atual : daFila));
        return;
      }

      if (code === "QUANTITY_FLOOR") {
        toast({
          title: "Redução não permitida",
          description: `Já há ${data?.minimum ?? "?"} un. produzidas/conferidas/entregues. Mínimo: ${data?.minimum ?? "?"}.`,
          variant: "warning",
        });
        return;
      }

      toast({ title: "Erro ao atualizar quantidade", description: message, variant: "destructive" });
    },
  });

  const updateObservationsMutation = useMutation({
    mutationFn: async ({ itemId, observations }: { itemId: string; observations: string }) =>
      await apiRequest("PATCH", `/api/items/${itemId}`, { observations }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSelectedItem((prev) => prev ? { ...prev, observations: cardObservations } : prev);
      toast({ title: "Observação salva", variant: "success" });
    },
    onError: (error) => toast({ title: "Erro ao salvar observação", description: parseApiError(error).message, variant: "destructive" }),
  });

  const creatorReviewMutation = useMutation({
    // `corpo`: vazio = a sugestão do estoque (o servidor aplica o que a Gráfica
    // atendeu); { reuseQty, peloEstoque } = "usar menos do que o estoque atendeu".
    // `trava`: o que fazer com a trava da Solicitação ao liberar (o servidor
    // recusa peça travada sem essa escolha).
    mutationFn: async ({ itemId, corpo, trava }: { itemId: string; corpo?: { reuseQty: number; peloEstoque: true }; trava?: "destravar" | "manter" }) =>
      await apiRequest("PATCH", `/api/items/${itemId}/creator-review`, {
        ...(corpo ?? {}),
        ...(trava === "destravar" ? { destravar: true } : trava === "manter" ? { manterTrava: true } : {}),
      }),
    onSuccess: (_res, { itemId, corpo, trava }) => {
      queryClient.invalidateQueries({ queryKey: CHAVE_DO_ESTOQUE_NA_REVISAO });
      queryClient.invalidateQueries({ queryKey: chaveDaConsulta(itemId) });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setReleaseConfirmOpen(false);
      const liberada = items.find((i) => i.id === itemId);
      const id = liberada?.displayId ?? "A peça";
      // Avança para a peça seguinte em vez de fechar. Só fecha na última —
      // e é aí que o FreezeWhileClosing continua valendo, porque é aí que o
      // `selectedItem` de fato some com o modal em fade.
      if (!marcarAvanco()) { setModalOpen(false); setSelectedItem(null); }
      const avancou = proximaAposDecidir.current !== null;
      // A resposta do estoque entrou nesta liberação: o aviso não pode dizer
      // só "Pronto para Produção" para uma peça que veio coberta pelo estoque.
      const linhaDoEstoque = estoquePorPeca.get(itemId);
      const doEstoque = liberada && !liberada.isReuse && linhaDoEstoque && estoqueRespondeu(linhaDoEstoque)
        ? propostaDaLiberacao(Number(liberada.quantity) || 0, linhaDoEstoque, corpo ? corpo.reuseQty : null)
        : null;
      // O aviso responde "foi para a Gráfica?" (o destino e o status que ela
      // vai ver lá) e "e agora?" (a ficha já trocou de peça, ou a fila acabou).
      // O recado (observação) sai da vista junto com a peça: o atalho leva à
      // peça na fila da Gráfica, onde o recado aparece.
      toast({
        title: "Liberada para a Gráfica",
        variant: "success",
        action: <ToastAction altText="Ver a peça na fila da Gráfica" onClick={() => { window.location.href = `/grafica?item=${itemId}`; }}>Ver na Gráfica</ToastAction>,
        description: `${id} ${doEstoque && doEstoque.reaproveitadas > 0
          ? (doEstoque.pulaProducao
            ? `foi direto para Impresso / Acabamento: as ${doEstoque.reaproveitadas} un. vêm do estoque`
            : `entrou na fila da Gráfica com ${doEstoque.reaproveitadas} un. do estoque e ${doEstoque.aProduzir} a produzir`)
          : destinoAoLiberar(liberada)}.${trava === "destravar" ? " A trava foi retirada." : trava === "manter" ? " Continua travada: a Gráfica vê, mas não consegue fazê-la andar." : ""} ${avancou ? "A próxima peça da fila já está aberta." : "Era a última desta fila."}`,
      });
    },
    onError: (error) => {
      const { message, code } = parseApiError(error);
      // Travada por outra pessoa enquanto a ficha estava aberta: a lista
      // atualiza e a confirmação passa a oferecer as duas escolhas.
      if (code === CODIGO_PECA_TRAVADA) queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({ title: "Não foi possível liberar", description: message, variant: "destructive" });
    },
  });

  const bulkReleaseMutation = useMutation({
    // LIBERAÇÃO não tem rota em lote: usa a individual (idempotente), de 5 em
    // 5, e guarda o MOTIVO de cada recusa por id. Só vão as PRONTAS (ver
    // `loteDeLiberar`): peça sem arquivo final ou travada fica fora, marcada
    // na linha com o porquê, em vez de ir e voltar com erro.
    mutationFn: async ({ prontas, deFora }: { prontas: string[]; deFora: Record<string, string> }) => {
      const falhas = await emLotes(prontas, (id) => apiRequest("PATCH", `/api/items/${id}/creator-review`, {}));
      return { total: prontas.length, released: prontas.length - Object.keys(falhas).length, falhas, deFora };
    },
    onSuccess: ({ total, released, falhas, deFora }, { prontas }) => {
      queryClient.invalidateQueries({ queryKey: CHAVE_DO_ESTOQUE_NA_REVISAO });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      anotarFalhas({ ...deFora, ...falhas }, prontas);
      // Continua marcado o que ainda pede ação: o que falhou, o que ficou de
      // fora por não estar pronto e as de evento finalizado (ver `selecaoLote`).
      setSelectedItemIds(prev => {
        const foi = new Set(prontas);
        return new Set(Array.from(prev).filter(id => !!falhas[id] || !foi.has(id)));
      });
      setBulkReleaseConfirmOpen(false);
      const failed = Object.keys(falhas).length;
      const fora = Object.keys(deFora).length;
      if (failed > 0) {
        toast({
          title: "Liberação parcial",
          description: `${released} de ${total} foram para a fila da Gráfica. ${failed} não ${failed === 1 ? "passou" : "passaram"} — o motivo está escrito na linha${failed === 1 ? "" : " de cada uma"}, que continua marcada.`,
          variant: "warning",
        });
      } else {
        // Reaproveitamento total vai para Impresso / Acabamento, não para a impressão
        // (mesmo critério do servidor — ver `reaproveitamentoTotal`).
        const reaproveitadas = prontas.filter(id => reaproveitamentoTotal(pendingItems.find((i) => i.id === id))).length;
        const extra = reaproveitadas > 0
          ? ` ${reaproveitadas === released ? (released === 1 ? "Era" : "Todas eram") : (reaproveitadas === 1 ? "1 era" : `${reaproveitadas} eram`)} de reaproveitamento total e ${reaproveitadas === 1 ? "foi" : "foram"} direto para Impresso / Acabamento.`
          : "";
        const deForaTxt = fora > 0 ? ` ${fora} ${fora === 1 ? "não estava pronta e continua marcada" : "não estavam prontas e continuam marcadas"}, com o motivo na linha.` : "";
        toast({ title: "Liberadas para a Gráfica", description: `${released} ${released === 1 ? "peça saiu" : "peças saíram"} da Revisão Final para a fila da Gráfica.${extra}${deForaTxt}`, variant: "success" });
      }
    },
    onError: (error) => toast({ title: "Não foi possível liberar as peças", description: parseApiError(error).message, variant: "destructive" }),
  });

  const returnToArteMutation = useMutation({
    mutationFn: async (payload: { itemId: string; notes: string; destino: string }): Promise<RespostaDaDevolucao> => {
      // PATCH, não POST: a rota é PATCH e o método errado caía no fallback do
      // SPA, que responde 200 com HTML — a tela dizia "devolvida" e o servidor
      // nunca recebia nada.
      const res = await apiRequest("PATCH", `/api/items/${payload.itemId}/return-to-arte`, { notes: payload.notes, destino: payload.destino });
      return await res.json().catch(() => ({}));
    },
    onSuccess: (resposta, payload) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setReturnConfirmOpen(false); setReturnObservations("");
      if (!marcarAvanco()) { setModalOpen(false); setSelectedItem(null); }
      const avancou = proximaAposDecidir.current !== null;
      // O aviso diz para onde ela FOI — o destino que o SERVIDOR aplicou (o
      // molde volta sempre para o começo da Arte, seja qual for o pedido) — e
      // QUEM recebe: a Arte, avisada com o motivo.
      const destino = resposta?.destinoDevolvido ?? payload.destino;
      const molde = ehMolde(resposta) || ehMolde(pendingItems.find((i) => i.id === payload.itemId));
      toast({
        title: "Devolvida para a Arte",
        variant: "success",
        description: (molde
          ? "O molde voltou para o começo da Arte, com o thumb dele."
          : destino === "arte"
          ? "Voltou para o começo da Arte — o patrocinador terá de aprovar de novo."
          : "Voltou para a Finalização — a aprovação do patrocinador continua valendo.")
          + ` A Arte foi avisada com o seu motivo.${avancou ? " A próxima peça já está aberta." : ""}`,
      });
    },
    onError: (error) => toast({ title: "Não foi possível devolver", description: parseApiError(error).message, variant: "destructive" }),
  });

  const bulkReturnMutation = useMutation({
    // Uma chamada só: a rota de lote responde { success, errors: [{itemId,
    // error}], items, destinos } — o motivo de cada recusa vai para a linha.
    mutationFn: async (payload: { ids: string[]; notes: string; destino: string }) => {
      const res = await apiRequest("PATCH", "/api/items/bulk-return-to-arte", { itemIds: payload.ids, notes: payload.notes, destino: payload.destino });
      const result: RespostaDoLoteDeDevolucao = await res.json();
      const falhas: Record<string, string> = {};
      if (Array.isArray(result.errors)) for (const e of result.errors) falhas[e.itemId] = e.error;
      else for (const id of result.failedItemIds ?? []) falhas[id] = "Esta peça não pôde ser devolvida — tente de novo pela ficha.";
      return { total: payload.ids.length, falhas, destinos: result.destinos ?? {} };
    },
    onSuccess: ({ total, falhas, destinos }, { ids: enviados }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      anotarFalhas(falhas, enviados);
      // Falha parcial: mantém selecionado só o que falhou, para a pessoa
      // tentar de novo sem re-marcar tudo — e mantém também as de evento
      // finalizado, que nem chegaram a ser enviadas (ver `selecaoLote`).
      setSelectedItemIds(prev => {
        const foi = new Set(enviados);
        return new Set(Array.from(prev).filter(id => !!falhas[id] || !foi.has(id)));
      });
      setBulkReturnConfirmOpen(false); setBulkReturnObservations("");
      const failed = Object.keys(falhas).length;
      const ok = total - failed;
      // Para onde foram DE FATO (o servidor diz por peça): molde volta sempre
      // para o começo da Arte, mesmo com "só o arquivo final" escolhido.
      const paraArte = Object.values(destinos).filter(d => d === "arte").length;
      const paraFinalizacao = Object.values(destinos).filter(d => d === "finalizacao").length;
      const onde = paraArte > 0 && paraFinalizacao > 0
        ? `${paraFinalizacao} para a Finalização e ${paraArte} para o começo da Arte`
        : paraArte > 0 ? "o começo da Arte" : "a Finalização";
      if (failed > 0) {
        toast({ title: "Devolução parcial", description: `${ok} ${ok === 1 ? "voltou" : "voltaram"} para a Arte; ${failed} não ${failed === 1 ? "passou e continua marcada" : "passaram e continuam marcadas"} — o motivo está na linha.`, variant: "warning" });
      } else {
        toast({ title: "Devolvidas para a Arte", description: `${ok} ${ok === 1 ? "peça voltou" : "peças voltaram"} ${paraArte > 0 && paraFinalizacao > 0 ? `(${onde})` : `para ${onde}`}. A Arte foi avisada com o motivo.`, variant: "success" });
      }
    },
    onError: (error) => toast({ title: "Não foi possível devolver as peças", description: parseApiError(error).message, variant: "destructive" }),
  });

  const bulkReuseMutation = useMutation({
    // REAPROVEITAR em lote: o mesmo par de chamadas do reaproveitamento TOTAL
    // individual (PATCH isReuse + creator-review), peça a peça, de 5 em 5 —
    // rota de lote não existe. O PARCIAL continua só no ícone da linha:
    // quantidade reaproveitada é decisão de UMA peça.
    mutationFn: async (itemIds: string[]) => {
      const semLiberar: Record<string, string> = {};
      const falhas = await emLotes(itemIds, async (id) => {
        // Reaproveitamento TOTAL: o servidor exige a quantidade junto com a marcação.
        const qtd = items.find((i) => i.id === id)?.quantity;
        await apiRequest("PATCH", `/api/items/${id}`, { isReuse: true, reuseQty: qtd });
        // Marcou mas não liberou é MEIO caminho, não falha igual: a marcação
        // existe, e o "Liberar" da barra resolve o resto — com o motivo.
        try { await apiRequest("PATCH", `/api/items/${id}/creator-review`, {}); }
        catch (e) { semLiberar[id] = `Marcada, mas não liberada: ${parseApiError(e).message}`; }
      });
      return { total: itemIds.length, falhas, semLiberar };
    },
    onSuccess: ({ total, falhas, semLiberar }, enviados) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      anotarFalhas({ ...semLiberar, ...falhas }, enviados);
      // Continua selecionado o que ainda pede ação: o que falhou (tentar de
      // novo) e o que marcou sem liberar (o "Liberar N" da barra fecha) — e as
      // de evento finalizado, que nem foram enviadas (ver `selecaoLote`).
      setSelectedItemIds(prev => {
        const foi = new Set(enviados);
        return new Set(Array.from(prev).filter(id => !!falhas[id] || !!semLiberar[id] || !foi.has(id)));
      });
      setBulkReuseConfirmOpen(false);
      const nFalhas = Object.keys(falhas).length, nSem = Object.keys(semLiberar).length;
      const ok = total - nFalhas - nSem;
      if (nFalhas === 0 && nSem === 0) {
        toast({ title: "Reaproveitamento confirmado", description: `${ok} peça(s) enviada(s) à Gráfica como produzida(s).`, variant: "success" });
      } else if (nFalhas === 0) {
        toast({
          title: "Marcadas, mas nem todas liberadas",
          description: `${ok} enviada(s) à Gráfica; ${nSem} marcada(s) sem liberar — continuam selecionadas, com o motivo na linha.`,
          variant: "warning",
        });
      } else {
        toast({
          title: "Reaproveitamento parcial",
          description: `${ok} de ${total} enviada(s). ${nFalhas} falhou(aram)${nSem > 0 ? ` e ${nSem} marcou sem liberar` : ""} — continuam selecionadas, com o motivo na linha.`,
          variant: "warning",
        });
      }
    },
    onError: (error) => toast({ title: "Não foi possível reaproveitar", description: parseApiError(error).message, variant: "destructive" }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => await apiRequest("DELETE", `/api/items/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setDeleteConfirmItemId(null);
      toast({ title: "Peça excluída", description: "A peça foi removida com sucesso.", variant: "success" });
    },
    onError: (error) => toast({ title: "Erro ao excluir", description: parseApiError(error).message, variant: "destructive" }),
  });

  const toggleReuseMutation = useMutation({
    mutationFn: async ({ itemId, isReuse }: { itemId: string; isReuse: boolean }): Promise<{ statusAdvanced: boolean; erro?: string }> => {
      // Marcar é o reaproveitamento TOTAL (a quantidade vai junto, o servidor exige);
      // desmarcar zera.
      const qtd = items.find((i) => i.id === itemId)?.quantity;
      await apiRequest("PATCH", `/api/items/${itemId}`, isReuse ? { isReuse, reuseQty: qtd } : { isReuse, reuseQty: 0 });
      // Ao marcar reaproveitamento, libera automaticamente para Gráfica (status → produced)
      if (isReuse) {
        try {
          await apiRequest("PATCH", `/api/items/${itemId}/creator-review`, {});
        } catch (e) {
          // O MOTIVO do servidor vai para o aviso (e para a linha): "falhou"
          // sozinho não dizia se era arquivo, trava ou evento finalizado.
          return { statusAdvanced: false, erro: parseApiError(e).message };
        }
      }
      return { statusAdvanced: true };
    },
    onSuccess: (result, { itemId, isReuse }) => {
      setDesfazerReuseId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      const advanced = result?.statusAdvanced !== false;
      if (isReuse && !advanced) {
        // A marcação gravou mas o creator-review falhou: nada de prometer
        // atualização automática — a liberação precisa ser feita à mão.
        const erro = result?.erro;
        if (erro) anotarFalhas({ [itemId]: `Marcada, mas não liberada: ${erro}` });
        toast({
          title: "Reaproveitamento marcado, mas não liberado",
          description: `${erro ?? "A liberação falhou."} Abra a peça e libere quando o motivo estiver resolvido.`,
          variant: "warning",
        });
        return;
      }
      toast({
        title: isReuse ? "Reaproveitamento confirmado" : "Marcação removida",
        description: isReuse
          ? "Peça enviada diretamente para a Gráfica como produzida."
          : "A peça volta ao fluxo normal: para liberar, precisa do arquivo final.",
        variant: "success",
      });
    },
    onError: (error) => { setDesfazerReuseId(null); toast({ title: "Não foi possível salvar o reaproveitamento", description: parseApiError(error).message, variant: "destructive" }); },
  });

  // Reaproveitamento parcial: define reuseQty e avança via creator-review
  const partialReuseMutation = useMutation({
    mutationFn: async ({ itemId, reuseQty }: { itemId: string; reuseQty: number }) => {
      // creator-review aceita reuseQty no body para registrar o parcial e
      // avança para ready_for_production (as demais unidades ainda vão para produção)
      await apiRequest("PATCH", `/api/items/${itemId}/creator-review`, { reuseQty });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setReuseDialogItemId(null);
      toast({
        title: "Reaproveitamento parcial confirmado",
        description: "As unidades reaproveitadas foram guardadas. O restante segue para produção.",
        variant: "success",
      });
    },
    onError: (error) => toast({ title: "Não foi possível reaproveitar em parte", description: parseApiError(error).message, variant: "destructive" }),
  });

  // TRAVAR / DESTRAVAR pela ficha — a mesma trava que a Solicitação põe na
  // Gráfica (rotas /travar e /destravar). A ficha passa a mostrar a peça como
  // o servidor a devolveu, sem esperar a lista recarregar.
  const travarMutation = useMutation({
    mutationFn: async ({ itemId, motivo }: { itemId: string; motivo: string; displayId?: string }): Promise<Partial<PecaDaRevisao>> => {
      const res = await apiRequest("POST", `/api/items/${itemId}/travar`, { motivo });
      return await res.json();
    },
    onSuccess: (item, v) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSelectedItem((prev) => (prev?.id === v.itemId ? { ...prev, ...item } : prev));
      setTravandoItem(null); setMotivoDaTrava("");
      toast({ title: `${v.displayId ?? "Peça"} travada`, description: `Mesmo liberada, a Gráfica não consegue fazê-la andar até alguém destravar: ${v.motivo}`, variant: "success" });
    },
    onError: (error) => toast({ title: "Não foi possível travar", description: parseApiError(error).message, variant: "destructive" }),
  });
  const destravarMutation = useMutation({
    mutationFn: async ({ itemId }: { itemId: string; displayId?: string }): Promise<Partial<PecaDaRevisao>> => {
      const res = await apiRequest("POST", `/api/items/${itemId}/destravar`, {});
      return await res.json();
    },
    onSuccess: (item, v) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSelectedItem((prev) => (prev?.id === v.itemId ? { ...prev, ...item } : prev));
      toast({ title: `${v.displayId ?? "Peça"} destravada`, variant: "success" });
    },
    onError: (error) => toast({ title: "Não foi possível destravar", description: parseApiError(error).message, variant: "destructive" }),
  });

  return {
    avisarRevisaoMutation, updateQuantityMutation, updateObservationsMutation, creatorReviewMutation,
    bulkReleaseMutation, returnToArteMutation, bulkReturnMutation, bulkReuseMutation, deleteItemMutation,
    toggleReuseMutation, partialReuseMutation, travarMutation, destravarMutation,
  };
}
