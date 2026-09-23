// ─────────────────────────────────────────────────────────────────────────────
// AS AÇÕES DO ATENDIMENTO — cada decisão, e como ela remenda a tela.
//
// Uma decisão NÃO recarrega as listas inteiras: a resposta do servidor traz o
// registro de aprovação e (quando mudou de status) a peça, e os dois são
// remendados no lugar. Depois, a fila segue sozinha para a próxima peça.
// ─────────────────────────────────────────────────────────────────────────────
import { useMutation } from "@tanstack/react-query";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { useToast } from "@/hooks/use-toast";
import type {
  AlvoDePatrocinador, Patrocinador, PecaAtendimento, RespostaDaDecisao, RespostaDoAviso, RespostaDoDesvinculo,
  ResultadoDoLote, SponsorApproval, VinculoDoEvento,
} from "./tipos";

export interface ParametrosDasAcoes {
  toast: ReturnType<typeof useToast>["toast"];
  dialogOpen: boolean;
  setDialogOpen: Dispatch<SetStateAction<boolean>>;
  selectedItem: PecaAtendimento | null;
  setSelectedItem: Dispatch<SetStateAction<PecaAtendimento | null>>;
  seguirParaPeca: (next: PecaAtendimento) => void;
  reviewQueue: PecaAtendimento[];
  itemSponsorsMap: Record<string, Patrocinador[]>;
  setItemSponsorsMap: Dispatch<SetStateAction<Record<string, Patrocinador[]>>>;
  itemApprovalsMap: Record<string, SponsorApproval[]>;
  setItemApprovalsMap: Dispatch<SetStateAction<Record<string, SponsorApproval[]>>>;
  setSponsorApprovals: Dispatch<SetStateAction<SponsorApproval[]>>;
  decididasAquiRef: MutableRefObject<Set<string>>;
  quemFalta: (item: { id: string }) => string[];
  setRejectionReason: Dispatch<SetStateAction<string>>;
  setRejectingSponsorId: Dispatch<SetStateAction<string | null>>;
  setDesvincularAlvo: Dispatch<SetStateAction<AlvoDePatrocinador | null>>;
  awaitingItems: PecaAtendimento[];
  batchSelectedItemIds: Set<string>;
  setBatchEventId: Dispatch<SetStateAction<string>>;
  setBatchRejectReason: Dispatch<SetStateAction<string>>;
  setBatchShowRejectForm: Dispatch<SetStateAction<boolean>>;
  nomePorPatrocinador: Map<string, string>;
  vinculosDoEvento: VinculoDoEvento[];
  addingPatrocinadorId: string | null;
  setAddingPatrocinadorId: Dispatch<SetStateAction<string | null>>;
}

export function useAtendimentoAcoes({
  toast, dialogOpen, setDialogOpen, selectedItem, setSelectedItem, seguirParaPeca, reviewQueue,
  itemSponsorsMap, setItemSponsorsMap, itemApprovalsMap, setItemApprovalsMap, setSponsorApprovals, decididasAquiRef,
  quemFalta, setRejectionReason, setRejectingSponsorId, setDesvincularAlvo, awaitingItems, batchSelectedItemIds,
  setBatchEventId, setBatchRejectReason, setBatchShowRejectForm, nomePorPatrocinador, vinculosDoEvento,
  addingPatrocinadorId, setAddingPatrocinadorId,
}: ParametrosDasAcoes) {
  const adicionarPatrocinador = async (sp: Patrocinador) => {
    if (!selectedItem || addingPatrocinadorId) return;
    setAddingPatrocinadorId(sp.id);
    try {
      // Patrocinador de FORA do evento (caso Crystal, 25/08): primeiro entra
      // no evento — senão a peça carregaria uma marca que nenhuma outra tela
      // do evento conhece — e depois na peça. Vínculo de evento repetido não
      // derruba o fluxo: o objetivo é o estado final, não a primeira escrita.
      const jaNoEvento = vinculosDoEvento.some((v) => v.sponsorId === sp.id);
      if (!jaNoEvento) {
        try {
          await apiRequest("POST", `/api/events/${selectedItem.eventId}/sponsors`, { sponsorId: sp.id });
        } catch {
          // provável duplicata (corrida com outra aba) — o vínculo de PEÇA
          // logo abaixo é quem decide se a operação falhou de verdade.
        }
        queryClient.invalidateQueries({ queryKey: ["/api/events", selectedItem.eventId, "sponsors"] });
      }
      await apiRequest("POST", `/api/items/${selectedItem.id}/sponsors`, { sponsorId: sp.id });
      // O servidor criou a linha pendente junto; o estado local reflete na
      // hora — a linha nova aparece "Aguardando decisão" sem refetch.
      setItemSponsorsMap(prev => ({
        ...prev,
        [selectedItem.id]: [...(prev[selectedItem.id] ?? []), sp],
      }));
      setSponsorApprovals(prev => [...prev, { itemId: selectedItem.id, sponsorId: sp.id, status: "pending" }]);
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({ title: "Patrocinador adicionado", description: `"${sp.name}" entrou na rodada como Aguardando decisão.`, variant: "success" });
    } catch (e) {
      toast({ title: "Não foi possível adicionar", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setAddingPatrocinadorId(null);
    }
  };

  /**
   * Atualiza a peça já no cache em vez de recarregar a lista inteira.
   * Recarregar /api/items (milhares de peças) + /api/audit-logs (milhares de
   * registros) a cada decisão deixava a revisão lenta. Eventos e logs são
   * marcados como desatualizados e só recarregam quando a tela precisar.
   */
  const applyItemDecisionToCache = (updatedItem?: PecaAtendimento) => {
    if (updatedItem?.id) {
      const patch = (list?: PecaAtendimento[]) =>
        list ? list.map(i => (i.id === updatedItem.id ? { ...i, ...updatedItem } : i)) : list;
      queryClient.setQueryData<PecaAtendimento[]>(["/api/items"], patch);
      queryClient.setQueryData<PecaAtendimento[]>(["/api/items/approved"], patch);
    } else {
      // Sem o item na resposta não dá para remendar com segurança: recarrega.
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    }
    queryClient.invalidateQueries({ queryKey: ["/api/events"], refetchType: "none" });
    // Só recarrega os logs se o histórico estiver aberto na tela.
    queryClient.invalidateQueries({
      queryKey: ["/api/audit-logs"],
      refetchType: dialogOpen ? "active" : "none",
    });
  };

  /**
   * Remenda UM registro de aprovação nos estados locais (mapa da lista e,
   * quando o modal mostra a mesma peça, a lista do modal) — em vez de deixar
   * o efeito refazer a chamada batch inteira a cada decisão.
   * O spread { ...a, ...approval } preserva o campo `sponsor` enriquecido
   * (as respostas de decisão devolvem o registro cru, sem `sponsor`).
   */
  const applyApprovalToCache = (itemId: string, approval?: SponsorApproval | null) => {
    if (!approval) return;
    const patch = (list: SponsorApproval[]) => {
      const exists = list.some(a => a.sponsorId === approval.sponsorId);
      return exists
        ? list.map(a => (a.sponsorId === approval.sponsorId ? { ...a, ...approval } : a))
        : [...list, approval];
    };
    setItemApprovalsMap(prev => ({ ...prev, [itemId]: patch(prev[itemId] || []) }));
    if (selectedItem?.id === itemId) setSponsorApprovals(prev => patch(prev));
  };

  const individualApproveMutation = useMutation({
    mutationFn: async ({ itemId, sponsorId }: { itemId: string; sponsorId: string }): Promise<RespostaDaDecisao> => {
      const response = await apiRequest("POST", `/api/items/${itemId}/sponsor-approvals/${sponsorId}/approve`, {});
      return response.json();
    },
    onSuccess: (data, variables) => {
      // Remenda o registro de aprovação nos caches locais — sem refazer o batch.
      applyApprovalToCache(variables.itemId, data.approval);

      if (data.allApproved) {
        // A última aprovação que faltava, já remendada acima com o registro do
        // servidor: o mapa local está completo e a saída da peça da fila não
        // precisa re-baixar o lote. (Só a APROVAÇÃO marca: reprovar pode tirar
        // a aprovação estrita de outros patrocinadores no servidor, e "Aprovar
        // para todos" não devolve os registros — esses seguem re-buscando.)
        // E só se o mapa local já dizia o mesmo que o servidor sobre os DEMAIS
        // patrocinadores (todos aprovados) — senão o lote é quem corrige.
        const mapaConfere = (itemSponsorsMap[variables.itemId] ?? []).every((s) =>
          s.id === variables.sponsorId
          || (itemApprovalsMap[variables.itemId] ?? []).some(a => a.sponsorId === s.id && a.status === 'approved'));
        if (data.item?.id && data.approval && mapaConfere) decididasAquiRef.current.add(data.item.id);
        // O item mudou de status: a resposta traz o item atualizado.
        applyItemDecisionToCache(data.item);
        // Peça concluída: segue direto para a próxima da fila, sem voltar à lista.
        const idx = reviewQueue.findIndex((i) => i.id === selectedItem?.id);
        const next = idx >= 0 ? reviewQueue[idx + 1] : undefined;
        if (next) {
          seguirParaPeca(next);
          toast({ title: "Peça aprovada", description: `Seguindo para ${next.displayId} · ${next.type}`, variant: "success" });
        } else {
          setDialogOpen(false);
          setSelectedItem(null);
          toast({ title: "Todos patrocinadores aprovaram", description: "Você revisou a última peça da fila.", variant: "success" });
        }
      } else {
        // Decisão parcial: o item não mudou de status; só o log ficou defasado.
        queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"], refetchType: dialogOpen ? "active" : "none" });
        const sponsorName = itemSponsorsMap[variables.itemId]?.find((s) => s.id === variables.sponsorId)?.name;
        // Quem ainda falta NESTA peça: é o que diz se dá para seguir para a
        // próxima ou se ainda há decisão aqui. Conta pelo mapa da lista com a
        // decisão recém-remendada (applyApprovalToCache roda antes, mas o
        // estado só vale no próximo render — por isso o sponsorId sai à mão).
        const restantes = quemFalta({ id: variables.itemId }).filter(n => n !== sponsorName).length;
        // Sem ninguém pendente — mas nem todos aprovaram (alguém reprovou
        // antes) — a peça não pede mais nada de quem decide (rodada 4). Ficar
        // nela obrigava a achar "Próxima peça" numa ficha sem ação; segue como
        // o ramo de todos aprovados.
        const idx = reviewQueue.findIndex((i) => i.id === variables.itemId);
        const next = restantes === 0 && dialogOpen && selectedItem?.id === variables.itemId && idx >= 0 ? reviewQueue[idx + 1] : undefined;
        if (next) seguirParaPeca(next);
        toast({
          title: `${sponsorName || 'Patrocinador'} aprovou`,
          description: restantes > 0
            ? `${restantes === 1 ? 'Falta 1 patrocinador' : `Faltam ${restantes} patrocinadores`} decidir nesta peça.`
            : next
              ? `Nada mais a decidir nesta peça — seguindo para ${next.displayId} · ${next.type}`
              : "A decisão foi registrada. Nada mais a decidir nesta peça.",
          variant: "success",
        });
      }
    },
    onError: (error) => {
      toast({ title: "Erro ao aprovar", description: error.message || "Ocorreu um erro ao aprovar", variant: "destructive" });
    },
  });

  const individualRejectMutation = useMutation({
    mutationFn: async ({ itemId, sponsorId, reason }: { itemId: string; sponsorId: string; reason?: string }): Promise<RespostaDaDecisao> => {
      const response = await apiRequest("POST", `/api/items/${itemId}/sponsor-approvals/${sponsorId}/reject`, {
        rejectionReason: reason || null
      });
      return response.json();
    },
    onSuccess: (data, variables) => {
      // A resposta traz o registro de aprovação (status awaiting_arte) e o
      // item (flag rejectedBySponsor) — remenda os dois caches localmente.
      applyApprovalToCache(variables.itemId, data.approval);
      applyItemDecisionToCache(data.item);
      setRejectionReason("");
      setRejectingSponsorId(null);

      // NADA MAIS A DECIDIR NESTA PEÇA? (rodada 4) O endpoint não devolve
      // `allDecided`, então o ramo abaixo nunca rodava: depois de reprovar o
      // último patrocinador pendente, a pessoa ficava parada numa peça sem
      // decisão nenhuma a tomar. A conta sai de `quemFalta` (o mapa da lista),
      // tirando à mão quem acabou de ser reprovado — o estado remendado por
      // applyApprovalToCache só vale no próximo render.
      const quemReprovou = itemSponsorsMap[variables.itemId]?.find((s) => s.id === variables.sponsorId)?.name;
      const aindaFaltam = quemFalta({ id: variables.itemId }).filter(n => n !== quemReprovou).length;
      const modalNaPeca = dialogOpen && selectedItem?.id === variables.itemId;
      if (data.allDecided || (modalNaPeca && aindaFaltam === 0)) {
        // Peça resolvida (volta para a Arte): segue para a próxima da fila.
        const idx = reviewQueue.findIndex((i) => i.id === selectedItem?.id);
        const next = idx >= 0 ? reviewQueue[idx + 1] : undefined;
        if (next) {
          seguirParaPeca(next);
          toast({ title: quemReprovou ? `Reprovação de ${quemReprovou} registrada` : "Peça devolvida para a Arte", description: `A Arte recebe o motivo. Nada mais a decidir nesta peça — seguindo para ${next.displayId} · ${next.type}`, variant: "success" });
        } else {
          setDialogOpen(false);
          setSelectedItem(null);
          toast({ title: quemReprovou ? `Reprovação de ${quemReprovou} registrada` : "Todos patrocinadores decidiram", description: "A Arte recebe o motivo e refaz a arte. Era a última peça da fila.", variant: "success" });
        }
      } else {
        // Diz QUEM reprovou e o que acontece com os demais — a pergunta
        // seguinte de quem acabou de reprovar é "e os outros patrocinadores?".
        toast({ title: quemReprovou ? `Reprovação de ${quemReprovou} registrada` : "Reprovação registrada", description: `A Arte recebe o motivo e prepara a nova versão. ${aindaFaltam === 0 ? "Nada mais a decidir nesta peça." : `${aindaFaltam === 1 ? "Falta 1 patrocinador" : `Faltam ${aindaFaltam} patrocinadores`} decidir nesta peça.`}`, variant: "success" });
      }
    },
    onError: (error) => {
      toast({ title: "Erro ao reprovar", description: error.message || "Ocorreu um erro ao reprovar", variant: "destructive" });
    },
  });

  // Correção de admin: desfaz uma aprovação/reprovação feita por engano,
  // sem precisar mexer direto no banco. Só admin vê o botão (checado na UI).
  const revertApprovalMutation = useMutation({
    mutationFn: async ({ itemId, sponsorId }: { itemId: string; sponsorId: string }): Promise<RespostaDaDecisao> => {
      const response = await apiRequest("POST", `/api/items/${itemId}/sponsor-approvals/${sponsorId}/revert`, {});
      return response.json();
    },
    onSuccess: (data, variables) => {
      // A resposta traz { approval, item }: remenda os caches localmente.
      applyApprovalToCache(variables.itemId, data.approval);
      applyItemDecisionToCache(data.item);
      toast({ title: "Aprovação revertida", description: "O patrocinador volta a aguardar decisão.", variant: "success" });
    },
    onError: (error) => {
      toast({ title: "Erro ao reverter", description: error.message || "Não foi possível reverter a aprovação", variant: "destructive" });
    },
  });

  /**
   * DISPARAR À MÃO o aviso da gestão (25/08).
   *
   * O aviso das 10h, 15h e 18h SAI do sistema, e o conector de e-mail só
   * autentica dentro do ambiente publicado — não há como verificar de fora que
   * o canal está de pé. Sem este botão, a única forma de descobrir que o aviso
   * parou seria as três não receberem nada e ninguém estranhar.
   *
   * Só admin, pela mesma régua do reenvio do book e do aviso da Revisão: um
   * clique manda e-mail de verdade para outras pessoas.
   */
  const avisarGestaoMutation = useMutation({
    mutationFn: async (): Promise<RespostaDoAviso> => {
      const res = await apiRequest("POST", "/api/gestao/digest/enviar", {});
      return await res.json();
    },
    onSuccess: (r) => {
      // O servidor devolve a frase pronta — inclusive quando NÃO enviou (nada
      // pendente, remetente ausente). "Enviado" seria mentira nesses casos, e
      // o ponto do botão é justamente saber o que aconteceu.
      toast({
        title: r?.status === "enviado" ? "Aviso enviado" : "Aviso não enviado",
        description: r?.mensagem ?? "Sem resposta do servidor.",
        // Só "falhou" é falha de verdade; fila vazia ou ambiente desligado é
        // aviso — nada quebrou, só não havia o que mandar.
        variant: r?.status === "enviado" ? "success" : r?.status === "falhou" ? "destructive" : "warning",
      });
    },
    onError: (error) => toast({ title: "Erro ao disparar o aviso", description: error.message, variant: "destructive" }),
  });

  // DESVINCULAR da peça (pedido do dono, 25/08): tira o patrocinador e a
  // aprovação PENDENTE dele deixa de contar — se ele era o único que faltava,
  // o servidor fecha a rodada e a peça segue. Aprovação já dada fica no
  // histórico (para desfazê-la existe o Revogar). Só admin, como o Adicionar.
  const desvincularSponsorMutation = useMutation({
    mutationFn: async ({ itemId, sponsorId }: { itemId: string; sponsorId: string }): Promise<RespostaDoDesvinculo> => {
      const response = await apiRequest("DELETE", `/api/items/${itemId}/sponsors/${sponsorId}`);
      return response.json();
    },
    onSuccess: (data, variables) => {
      setItemSponsorsMap(prev => ({
        ...prev,
        [variables.itemId]: (prev[variables.itemId] ?? []).filter((s) => s.id !== variables.sponsorId),
      }));
      setSponsorApprovals(prev => prev.filter(a => a.sponsorId !== variables.sponsorId));
      if (data?.item) applyItemDecisionToCache(data.item);
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setDesvincularAlvo(null);
      toast(data?.pecaInativada
        ? { title: "Desvinculado — a peça foi cancelada", description: "Era o único patrocinador: a peça saiu das filas e segue visível no Painel Geral, com a explicação registrada." }
        : data?.rodadaFechou
        ? { title: "Desvinculado — a peça seguiu", description: "Ele era o único que faltava: a rodada fechou e a Arte foi avisada para finalizar." }
        : { title: "Patrocinador desvinculado", description: "A aprovação pendente dele deixou de contar." });
    },
    onError: (error) => {
      toast({ title: "Erro ao desvincular", description: error.message || "Não foi possível desvincular o patrocinador", variant: "destructive" });
    },
  });

  const sponsorApproveMutation = useMutation({
    mutationFn: async (itemId: string): Promise<PecaAtendimento> => {
      // O endpoint devolve o item atualizado — dá para remendar o cache.
      const response = await apiRequest("PATCH", `/api/items/${itemId}/sponsor-approve`, {});
      return response.json();
    },
    onSuccess: (item, itemId) => {
      applyItemDecisionToCache(item);
      // A MESMA fila da aprovação individual (rodada 4). "Aprovar para todos"
      // fechava o modal e devolvia a pessoa à lista para reencontrar a próxima
      // peça — o atalho mais rápido de decidir era o mais lento de continuar.
      // O toast também dizia "aprovada pelo patrocinador", no singular, para
      // uma decisão de todos.
      const idx = reviewQueue.findIndex((i) => i.id === itemId);
      const next = idx >= 0 ? reviewQueue[idx + 1] : undefined;
      if (next) {
        seguirParaPeca(next);
        toast({ title: "Peça aprovada para todos os patrocinadores", description: `Seguindo para ${next.displayId} · ${next.type}`, variant: "success" });
      } else {
        setDialogOpen(false);
        setSelectedItem(null);
        toast({ title: "Peça aprovada para todos os patrocinadores", description: "Era a última peça da fila.", variant: "success" });
      }
    },
    onError: (error) => {
      toast({ title: "Erro ao aprovar peça", description: error.message || "Ocorreu um erro", variant: "destructive" });
    },
  });


  const batchSponsorMutation = useMutation({
    mutationFn: async ({ sponsorId, eventId, action, reason }: {
      sponsorId: string; eventId: string; action: "approve" | "reject"; reason?: string;
    }): Promise<ResultadoDoLote> => {
      const targetItems = awaitingItems.filter(item =>
        item.eventId === eventId && batchSelectedItemIds.has(item.id)
      );
      const elegiveis = targetItems.filter(item => {
        const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
        const approval = approvals.find(a => a.sponsorId === sponsorId);
        const status = approval?.status || "pending";
        if (!itemSponsorsMap[item.id]?.some((s) => s.id === sponsorId)) return false;
        return status === "pending" || status === "new_version_pending";
      });
      // allSettled, e não all: com Promise.all, UMA recusa (peça que outra
      // pessoa decidiu no meio, evento que fechou) jogava o lote inteiro no
      // onError — "Erro na operação em lote" — enquanto as outras decisões
      // JÁ ESTAVAM gravadas, e o cache não era remendado com nenhuma delas.
      // Parseia cada resposta: { approval, item?, allApproved? } — permite
      // remendar os caches sem invalidar/refazer as listas inteiras.
      const settled = await Promise.allSettled(elegiveis.map(item => (action === "approve"
        ? apiRequest("POST", `/api/items/${item.id}/sponsor-approvals/${sponsorId}/approve`, {})
        : apiRequest("POST", `/api/items/${item.id}/sponsor-approvals/${sponsorId}/reject`, { rejectionReason: reason || null })
      ).then(r => r.json() as Promise<RespostaDaDecisao>)));
      const results: RespostaDaDecisao[] = [];
      const falhas: { displayId: string; erro: string }[] = [];
      settled.forEach((r, i) => {
        if (r.status === "fulfilled") results.push(r.value);
        else falhas.push({ displayId: elegiveis[i].displayId ?? "peça", erro: (r.reason as Error)?.message || "erro desconhecido" });
      });
      return { results, falhas, total: elegiveis.length };
    },
    onSuccess: ({ results, falhas, total }: ResultadoDoLote, vars) => {
      // Nenhuma requisição saiu (todas as selecionadas já estavam decididas ou
      // sem o patrocinador): avisa em vez de anunciar um sucesso que não houve.
      if (total === 0) {
        toast({
          title: "Nenhuma peça elegível",
          description: "As peças selecionadas já foram decididas para este patrocinador.",
          variant: "warning",
        });
        return;
      }
      let anyItemChanged = false;
      results.forEach((r) => {
        if (r?.approval) applyApprovalToCache(r.approval.itemId, r.approval);
        if (r?.item) { anyItemChanged = true; applyItemDecisionToCache(r.item); }
      });
      if (!anyItemChanged) {
        // Nenhum item mudou de status — ainda assim o log ficou defasado.
        queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"], refetchType: dialogOpen ? "active" : "none" });
      }
      // O PATROCINADOR FICA (rodada 4): decidir por marca é percorrer os
      // eventos dela, e zerar tudo obrigava a reescolher a mesma marca a cada
      // evento. Sem mais pendência, o efeito junto de batchSponsorNome limpa.
      setBatchEventId("");
      setBatchRejectReason("");
      setBatchShowRejectForm(false);
      // O número no aviso: "todas as selecionadas" não confirma QUANTAS
      // decisões saíram — e é essa conta que a pessoa confere com o patrocinador.
      const n = results.length;
      // FALHA PARCIAL: "X de Y registradas" e QUAIS ficaram, com o motivo da
      // primeira — as que passaram já estão no cache (remendado acima).
      if (falhas.length > 0) {
        // O que falhou pode ter mudado no servidor (outra pessoa decidiu):
        // a lista é recarregada para não mostrar a decisão velha.
        queryClient.invalidateQueries({ queryKey: ["/api/items"] });
        toast({
          title: `${n} de ${total} ${vars.action === "approve" ? "aprovações registradas" : "reprovações registradas"}`,
          description: `Não ${falhas.length === 1 ? "foi" : "foram"}: ${falhas.slice(0, 5).map(f => f.displayId).join(", ")}${falhas.length > 5 ? ` e mais ${falhas.length - 5}` : ""} — ${falhas[0].erro}`,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: vars.action === "approve"
          ? `${n} ${n === 1 ? 'peça aprovada' : 'peças aprovadas'} em lote`
          : `${n} ${n === 1 ? 'peça reprovada' : 'peças reprovadas'} em lote`,
        description: `${vars.action === "approve"
          ? `Aprovação de ${nomePorPatrocinador.get(vars.sponsorId) ?? "o patrocinador"} registrada.`
          : "As peças voltaram para a Arte com o motivo informado."}`,
        variant: "success",
      });
    },
    onError: (error) => {
      toast({ title: "Erro na operação em lote", description: error.message || "Ocorreu um erro", variant: "destructive" });
    },
  });

  return {
    adicionarPatrocinador, individualApproveMutation, individualRejectMutation, revertApprovalMutation,
    avisarGestaoMutation, desvincularSponsorMutation, sponsorApproveMutation, batchSponsorMutation,
  };
}

export type AcoesDoAtendimento = ReturnType<typeof useAtendimentoAcoes>;
