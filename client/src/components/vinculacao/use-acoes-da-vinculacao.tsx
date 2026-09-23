// ─────────────────────────────────────────────────────────────────────────────
// useAcoesDaVinculacao — as AÇÕES da tela: salvar vínculo, patrocinadores do
// evento, os handlers da linha e do lote, e o estado dos modais que elas
// abrem. Três blocos com vida própria moram em sub-hooks chamados daqui e
// devolvidos junto: o envio à Arte (use-envio-para-arte), o auto-vínculo por
// cota (use-auto-vinculo) e o acrescentar depois do envio (use-acrescentar).
//
// Recebe o que useVinculacao devolve. As mutações leem os mapas pelo
// fechamento do render atual (o useMutation troca as opções a cada render),
// como liam quando moravam na página.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { areSponsorsEqual } from "./regras";
import type { Vinculacao } from "./use-vinculacao";
import { useEnvioParaArte } from "./use-envio-para-arte";
import { useAutoVinculo } from "./use-auto-vinculo";
import { useAcrescentar } from "./use-acrescentar";
import type {
  EventoDaVinculacao, FalhaDaPeca, FotoDoSalvamento, ItemChanges, PecaDaVinculacao, ResultadoDoLote,
  ResultadoDoSalvamento, SavePayload,
} from "./tipos";

export function useAcoesDaVinculacao(v: Vinculacao) {
  const {
    items, sponsors, fullyFilteredItems, itemUIStates,
    itemSponsorsMap, setItemSponsorsMap, originalSponsorsMap, setOriginalSponsorsMap,
    pendingChanges, setPendingChanges, selectedItemIds, setSelectedItemIds,
    getEventSponsors,
  } = v;
  const { toast } = useToast();

  const [selectedEventForSponsors, setSelectedEventForSponsors] = useState<EventoDaVinculacao | null>(null);
  const [selectedSponsorIds, setSelectedSponsorIds] = useState<string[]>([]);
  const [sponsorDialogOpen, setSponsorDialogOpen] = useState(false);
  const [sponsorModalSearch, setSponsorModalSearch] = useState('');

  const [bulkApplyDialogOpen, setBulkApplyDialogOpen] = useState(false);
  const [bulkSelectedSponsors, setBulkSelectedSponsors] = useState<string[]>([]);
  const [bulkSkipApproval, setBulkSkipApproval] = useState(false);
  const [bulkSponsorSearch, setBulkSponsorSearch] = useState('');

  const [previewRefUrl, setPreviewRefUrl] = useState<string | null>(null);
  // Falha ao carregar a imagem de referência — sem isto o onError só escondia
  // o <img> e sobrava uma caixa cinza vazia, sem explicação.
  const [refImgFailed, setRefImgFailed] = useState(false);
  useEffect(() => { setRefImgFailed(false); }, [previewRefUrl]);

  // Resultado completo de um lote com muitas recusas — o toast fica para o
  // resumo; a lista nomeada (peça + motivo) abre aqui.
  const [resultadoDoLote, setResultadoDoLote] = useState<ResultadoDoLote | null>(null);
  // POR QUE ESTA PEÇA NÃO SALVOU/NÃO FOI. Num lote com falha parcial o toast
  // só resume; o motivo fica escrito NA LINHA da peça até ela dar certo.
  const [falhaPorPeca, setFalhaPorPeca] = useState<Record<string, string>>({});
  const registrarFalhas = (ok: string[], falhas: FalhaDaPeca[]) =>
    setFalhaPorPeca(prev => {
      const next = { ...prev };
      ok.forEach(id => { delete next[id]; });
      falhas.forEach(f => { next[f.itemId] = f.message; });
      return next;
    });
  // As que falharam CONTINUAM selecionadas: é nelas que a pessoa vai agir.
  const manterSelecionadas = (ids: string[]) => {
    if (ids.length === 0) return;
    setSelectedItemIds(prev => new Set([...Array.from(prev), ...ids]));
  };

  const envio = useEnvioParaArte(v, registrarFalhas);
  const { optimisticSentIds } = envio;
  const autoVinculo = useAutoVinculo(v);
  const acrescentar = useAcrescentar(v, setResultadoDoLote);

  // Salvar vínculo não pede confirmação: não é irreversível — a peça segue
  // editável até o envio, que tem a própria confirmação. Os três "Salvar"
  // (linha, barra, lote) gravam direto e o aviso diz em quantas peças e o
  // passo seguinte.

  // Toggle "Sem Patrocinador" por item individual
  const toggleItemSkipApproval = (item: PecaDaVinculacao) => {
    const originalSponsors = originalSponsorsMap[item.id] || [];
    const originalSkipApproval = item.skipApproval || false;
    const currentSkipApproval = pendingChanges[item.id]?.skipApproval ?? originalSkipApproval;
    const newSkipApproval = !currentSkipApproval;

    const newSponsors = newSkipApproval ? [] : originalSponsors;
    const hasChanges =
      !areSponsorsEqual(newSponsors, originalSponsors) ||
      newSkipApproval !== originalSkipApproval;

    setPendingChanges(prev => {
      if (!hasChanges) {
        const next = { ...prev };
        delete next[item.id];
        return next;
      }
      return {
        ...prev,
        [item.id]: { sponsorIds: newSponsors, skipApproval: newSkipApproval, isDirty: true },
      };
    });
    setItemSponsorsMap(prev => ({ ...prev, [item.id]: newSponsors }));
  };

  // Mutation para gerenciar patrocinadores do evento
  const manageEventSponsorsMutation = useMutation({
    mutationFn: async ({ eventId, currentSponsors, newSponsors }: {
      eventId: string,
      currentSponsors: string[],
      newSponsors: string[]
    }) => {
      const toAdd = newSponsors.filter(id => !currentSponsors.includes(id));
      const toRemove = currentSponsors.filter(id => !newSponsors.includes(id));

      // Adiciona e remove em paralelo.
      await Promise.all([
        ...toAdd.map(sponsorId => apiRequest("POST", `/api/events/${eventId}/sponsors`, { sponsorId })),
        ...toRemove.map(sponsorId => apiRequest("DELETE", `/api/events/${eventId}/sponsors/${sponsorId}`)),
      ]);
    },
    onSuccess: async () => {
      // Invalidar e fazer refetch forçado
      queryClient.removeQueries({ queryKey: ["/api/events"] });
      await queryClient.refetchQueries({ queryKey: ["/api/events"], type: 'active' });
      // Contagens de uso por patrocinador e histórico também mudam aqui.
      queryClient.invalidateQueries({ queryKey: ["/api/sponsors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSponsorDialogOpen(false);
      toast({
        title: "Patrocinadores do evento atualizados",
        description: "Só eles aparecem como opção nas peças deste evento.",
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar patrocinadores",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation 1: Salvar vinculação (patrocinadores + skipApproval) SEM mudar status
  const saveLinkingMutation = useMutation({
    mutationFn: async (payloads: SavePayload[]): Promise<ResultadoDoSalvamento> => {
      const savedIds: string[] = [];
      const failed: FalhaDaPeca[] = [];
      if (payloads.length === 0) return { savedIds, failed };

      // Lotes com concorrência limitada (evita esgotar o pool do banco), porém
      // tolerando falha parcial: um item com erro não descarta os que já foram
      // salvos nos lotes anteriores — senão o rollback marcaria como não salvo
      // algo que já está gravado no servidor.
      const batchSize = 5;
      for (let i = 0; i < payloads.length; i += batchSize) {
        const batch = payloads.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(({ itemId, sponsorIds, skipApproval }) =>
            apiRequest("POST", `/api/items/${itemId}/sponsors/sync`, { sponsorIds, skipApproval })
          )
        );
        results.forEach((r, idx) => {
          const itemId = batch[idx].itemId;
          if (r.status === "fulfilled") savedIds.push(itemId);
          else failed.push({ itemId, message: (r.reason as Error)?.message || "erro desconhecido" });
        });
      }

      // Nada salvou: propaga para o onError fazer o rollback completo.
      if (savedIds.length === 0 && failed.length > 0) throw new Error(failed[0].message);
      return { savedIds, failed };
    },
    onMutate: (payloads: SavePayload[]): FotoDoSalvamento => {
      const snapshot = {
        itemSponsorsMap: { ...itemSponsorsMap },
        originalSponsorsMap: { ...originalSponsorsMap },
        // TODAS as consultas sob o prefixo — a lista que a tela lê é a
        // recortada (["/api/items", "?status=…&eventId=…"]), nunca a chave nua.
        itemsCache: queryClient.getQueriesData({ queryKey: ["/api/items"] }),
      };
      // Atualização otimista: sponsors locais
      payloads.forEach(({ itemId, sponsorIds }) => {
        setItemSponsorsMap(prev => ({ ...prev, [itemId]: sponsorIds }));
        setOriginalSponsorsMap(prev => ({ ...prev, [itemId]: sponsorIds }));
      });
      // Atualização otimista: skipApproval no cache do React Query
      // (necessário para getItemUIStatus ler item.skipApproval correto antes do refetch).
      // PREFIXO, não chave exata: a chave exata ["/api/items"] não tem ninguém
      // olhando — a tela lê a lista recortada — e a marca "sem patrocinador"
      // salva sumia da linha até o próximo recarregamento. Só as LISTAS (já
      // expandidas pelo queryClient) são tocadas; outra forma passa intacta, e
      // a lista sem peça do lote volta a MESMA referência (sem re-render à toa).
      const porId = new Map(payloads.map(p => [p.itemId, p.skipApproval]));
      queryClient.setQueriesData<PecaDaVinculacao[]>({ queryKey: ["/api/items"] }, (old) => {
        if (!Array.isArray(old)) return old;
        let mudou = false;
        const next = old.map(item => {
          const skip = porId.get(item.id);
          if (skip === undefined || item.skipApproval === skip) return item;
          mudou = true;
          return { ...item, skipApproval: skip };
        });
        return mudou ? next : old;
      });
      return snapshot;
    },
    onSuccess: ({ savedIds, failed }, _vars: SavePayload[], snapshot: FotoDoSalvamento | undefined) => {
      setPendingChanges(prev => {
        const next = { ...prev };
        savedIds.forEach(id => { delete next[id]; });
        return next;
      });

      // Reverte localmente apenas os itens que falharam, preservando os salvos.
      if (failed.length > 0 && snapshot) {
        const restore = (prev: Record<string, string[]>, from: Record<string, string[]>) => {
          const next = { ...prev };
          failed.forEach(({ itemId }) => {
            if (from[itemId] !== undefined) next[itemId] = from[itemId];
            else delete next[itemId];
          });
          return next;
        };
        setItemSponsorsMap(prev => restore(prev, snapshot.itemSponsorsMap));
        setOriginalSponsorsMap(prev => restore(prev, snapshot.originalSponsorsMap));
      }

      // Sem invalidar /api/items: o onMutate já atualizou de forma otimista os
      // mapas de patrocinadores e o skipApproval no cache do React Query — que é
      // tudo que a UI lê. Invalidar aqui forçava um reload completo a cada
      // salvamento, deixando a tela lenta.
      // Audit-logs sim: o sync gera registro e o histórico do dialog de
      // detalhes ficava stale sem isto.
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      registrarFalhas(savedIds, failed);
      manterSelecionadas(failed.map(f => f.itemId));
      if (failed.length === 0) {
        // "ESSE VÍNCULO FOI SALVO?" — sim, e o que vem depois. Sem modal de
        // confirmação antes, este aviso é a prova do salvo. Só aponta o envio
        // para quem FICOU pronta: peça salva sem patrocinador e sem a marca
        // volta a Pendente, e mandar "enviar" nela seria um clique que não a
        // inclui.
        const prontas = _vars.filter(p => savedIds.includes(p.itemId)
          && (p.sponsorIds.length > 0 || p.skipApproval || items.find((i) => i.id === p.itemId)?.isReuse)).length;
        const pecas = (n: number) => `${n} ${n === 1 ? 'peça' : 'peças'}`;
        toast({
          title: "Vinculação salva",
          description: prontas === savedIds.length
            ? `Vínculo salvo em ${pecas(savedIds.length)}. Falta só o envio à Arte.`
            : prontas > 0
              ? `Vínculo salvo em ${pecas(savedIds.length)}. ${pecas(prontas)} ${prontas === 1 ? 'pode' : 'podem'} ir para a Arte; as sem patrocinador continuam pendentes.`
              : `Salvo em ${pecas(savedIds.length)}, ainda sem patrocinador — ${savedIds.length === 1 ? 'ela continua pendente' : 'elas continuam pendentes'}.`,
          variant: "success",
        });
      } else {
        console.error("[vincular] falhas ao salvar:", failed);
        toast({
          title: `${savedIds.length} ${savedIds.length === 1 ? 'salva' : 'salvas'}, ${failed.length} com problema`,
          description: `${failed.length === 1 ? 'A peça com problema continua selecionada' : 'As peças com problema continuam selecionadas'} — o motivo está na linha.`,
          variant: "destructive",
        });
      }
    },
    onError: (_error: Error, _vars: SavePayload[], snapshot: FotoDoSalvamento | undefined) => {
      if (snapshot) {
        setItemSponsorsMap(snapshot.itemSponsorsMap);
        setOriginalSponsorsMap(snapshot.originalSponsorsMap);
        // Reverter cache do React Query
        snapshot.itemsCache.forEach(([chave, dados]) => queryClient.setQueryData<unknown>(chave, dados));
      }
      console.error("[vincular] save draft error:", _error);
      const motivo = _error?.message || "Não foi possível salvar. Tente novamente.";
      const ids = (_vars ?? []).map(p => p.itemId);
      registrarFalhas([], ids.map(itemId => ({ itemId, message: motivo })));
      manterSelecionadas(ids);
      toast({
        title: "Erro ao salvar vinculação",
        description: ids.length > 1 ? `Nenhuma das ${ids.length} peças foi salva — o motivo está na linha de cada uma.` : motivo,
        variant: "destructive",
      });
    },
  });

  const handleOpenSponsorDialog = (event: EventoDaVinculacao) => {
    setSelectedEventForSponsors(event);
    const eventSponsors = getEventSponsors(event.id);
    setSelectedSponsorIds(eventSponsors.map(s => s.id));
    setSponsorDialogOpen(true);
  };

  const handleSaveEventSponsors = () => {
    if (!selectedEventForSponsors) return;

    const currentSponsors = getEventSponsors(selectedEventForSponsors.id).map(s => s.id);

    manageEventSponsorsMutation.mutate({
      eventId: selectedEventForSponsors.id,
      currentSponsors,
      newSponsors: selectedSponsorIds,
    });
  };

  // Funções para seleção em lote
  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const toggleAllItemsInEvent = (eventItems: PecaDaVinculacao[]) => {
    const eventItemIds = eventItems.map(item => item.id);
    const allSelected = eventItemIds.every(id => selectedItemIds.has(id));

    setSelectedItemIds(prev => {
      const newSet = new Set(prev);
      if (allSelected) {
        eventItemIds.forEach(id => newSet.delete(id));
      } else {
        eventItemIds.forEach(id => newSet.add(id));
      }
      return newSet;
    });
  };

  /** Marca (ou desmarca) todas as peças de um tipo dentro do grupo. */
  const toggleTypeGroup = (typeItems: PecaDaVinculacao[]) => {
    const selecionaveis = typeItems.filter(item => {
      const s = itemUIStates[item.id] || 'PENDENTE';
      return s === 'PENDENTE' || s === 'RASCUNHO';
    });
    const todasMarcadas = selecionaveis.length > 0 && selecionaveis.every(item => selectedItemIds.has(item.id));
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      selecionaveis.forEach(item => { todasMarcadas ? next.delete(item.id) : next.add(item.id); });
      return next;
    });
  };

  const handleOpenBulkApplyDialog = () => {
    setBulkSelectedSponsors([]);
    setBulkSkipApproval(false);
    setBulkApplyDialogOpen(true);
  };

  // Alterna a opção "Sem Patrocinador" do lote (usada no clique e no teclado)
  const toggleBulkSkip = () => {
    if (bulkSkipApproval) {
      setBulkSkipApproval(false);
    } else {
      setBulkSelectedSponsors([]);
      setBulkSkipApproval(true);
    }
  };

  const handleApplyBulkSponsors = () => {
    // PEÇA JÁ ENVIADA fica de fora: ela é selecionável para o "Acrescentar",
    // mas "Aplicar" REESCREVE a lista de patrocinadores, e o servidor recusa
    // isso fora da fase de vinculação. Mandar mesmo assim só renderia erro por
    // peça — o desconto já está dito na barra, antes do clique ("N já
    // enviadas — nelas só dá para acrescentar").
    const allSelectedItems = Array.from(selectedItemIds).filter(
      (id) => !optimisticSentIds.has(id) && (itemUIStates[id] || 'PENDENTE') !== 'ENVIADO',
    );

    // O botão "Aplicar em Lote" já fica desabilitado sem seleção; este guard
    // é só cinto de segurança (sem toast destrutivo).
    if (bulkSelectedSponsors.length === 0 && !bulkSkipApproval) return;

    // Aplicar patrocinadores apenas a itens NÃO isentos (skipApproval=false)
    // a menos que bulkSkipApproval seja true (nesse caso, aplica a todos)
    const itemsToUpdate: SavePayload[] = [];
    const skippedItems: string[] = [];

    allSelectedItems.forEach(itemId => {
      const currentSponsors = itemSponsorsMap[itemId] || originalSponsorsMap[itemId] || [];
      const item = items.find(i => i.id === itemId);
      const originalSkipApproval = item?.skipApproval || false;

      // Pular itens isentos quando não está aplicando skipApproval
      if (originalSkipApproval && !bulkSkipApproval) {
        skippedItems.push(itemId);
        return;
      }

      // Combinar patrocinadores existentes com novos (sem duplicatas)
      const combinedSponsors = Array.from(new Set([...currentSponsors, ...bulkSelectedSponsors]));

      const hasChanges =
        !areSponsorsEqual(combinedSponsors, originalSponsorsMap[itemId] || []) ||
        bulkSkipApproval !== originalSkipApproval;

      if (hasChanges) {
        setPendingChanges(prev => ({
          ...prev,
          [itemId]: {
            sponsorIds: combinedSponsors,
            skipApproval: bulkSkipApproval,
            isDirty: true
          }
        }));

        setItemSponsorsMap(prev => ({
          ...prev,
          [itemId]: combinedSponsors
        }));

        itemsToUpdate.push({ itemId, sponsorIds: combinedSponsors, skipApproval: bulkSkipApproval });
      }
    });

    // Limpar seleção e fechar modal
    setSelectedItemIds(new Set());
    setBulkApplyDialogOpen(false);
    setBulkSelectedSponsors([]);
    setBulkSkipApproval(false);

    if (itemsToUpdate.length === 0) {
      toast({
        title: "Nenhuma alteração",
        description: skippedItems.length > 0
          ? `${skippedItems.length} ${skippedItems.length !== 1 ? 'peças marcadas' : 'peça marcada'} sem patrocinador ${skippedItems.length !== 1 ? 'ficaram' : 'ficou'} de fora. Nas demais, os patrocinadores já estavam vinculados.`
          : "Os patrocinadores selecionados já estavam vinculados",
        variant: "warning",
      });
      return;
    }

    // Salvar automaticamente após aplicar
    saveLinkingMutation.mutate(itemsToUpdate);
  };

  /**
   * Vincula um patrocinador a todas as peças que ainda não o têm — como
   * RASCUNHO, igual a marcar um chip a um. Nada vai para o servidor até o
   * "Salvar", que é o que torna a ação segura de oferecer no cabeçalho.
   */
  const vincularRestantes = (sponsorId: string, alvos: PecaDaVinculacao[]) => {
    if (alvos.length === 0) return;
    const novosVinculos: Record<string, string[]> = {};
    setPendingChanges(prev => {
      const next = { ...prev };
      for (const item of alvos) {
        const atuais = itemSponsorsMap[item.id] ?? [];
        if (atuais.includes(sponsorId)) continue;
        const novos = [...atuais, sponsorId];
        novosVinculos[item.id] = novos;
        const originais = originalSponsorsMap[item.id] || [];
        const skipOriginal = item.skipApproval || false;
        // Vincular alguém e continuar "sem patrocinador" é contradição: o
        // vínculo ganha, como já acontece ao marcar um chip.
        const mudou = !areSponsorsEqual(novos, originais) || skipOriginal;
        if (mudou) next[item.id] = { sponsorIds: novos, skipApproval: false, isDirty: true };
        else delete next[item.id];
      }
      return next;
    });
    setItemSponsorsMap(prev => ({ ...prev, ...novosVinculos }));
    // Marcar dezenas de linhas de uma vez muda a lista inteira para Rascunho
    // — fora de vista, lá embaixo. O aviso diz o que aconteceu e que ainda
    // falta salvar. Sem botão "Salvar" no aviso de propósito: ele guardaria a
    // foto DESTE clique, e um chip marcado depois seria sobrescrito ao salvar.
    const n = Object.keys(novosVinculos).length;
    if (n > 0) {
      const sponsorNome = sponsors.find((s) => s.id === sponsorId)?.name ?? 'Patrocinador';
      toast({
        title: `${sponsorNome} marcado em ${n} ${n === 1 ? 'peça' : 'peças'}`,
        description: 'Ainda é rascunho — use "Salvar rascunhos", na barra acima da lista, para gravar.',
        variant: "success",
      });
    }
  };

  /** Grava um conjunto novo de patrocinadores como rascunho local. */
  const aplicarVinculo = (item: PecaDaVinculacao, novos: string[], skip: boolean) => {
    const originais = originalSponsorsMap[item.id] || [];
    const skipOriginal = item.skipApproval || false;
    const mudou = !areSponsorsEqual(novos, originais) || skip !== skipOriginal;
    setPendingChanges(prev => {
      if (!mudou) { const n = { ...prev }; delete n[item.id]; return n; }
      return { ...prev, [item.id]: { sponsorIds: novos, skipApproval: skip, isDirty: true } };
    });
    setItemSponsorsMap(prev => ({ ...prev, [item.id]: novos }));
  };

  /**
   * DESCARTAR O RASCUNHO DA LINHA, com desfazer no próprio toast. Descartar
   * apagava na hora, sem volta, um rascunho que pode ter levado vários
   * cliques — e o botão fica colado no "Salvar". Guarda-se o rascunho EXATO
   * (vínculos e a marca "sem patrocinador") antes de apagar; desfazer só
   * devolve esse estado local. Nada vai ao servidor: continua rascunho e
   * passa pelo mesmo "Salvar" de sempre.
   */
  const descartarRascunho = (item: PecaDaVinculacao) => {
    const originais = originalSponsorsMap[item.id] || [];
    const rascunho: ItemChanges | undefined = pendingChanges[item.id];
    const vinculosDoRascunho = itemSponsorsMap[item.id];
    setPendingChanges(prev => { const n = { ...prev }; delete n[item.id]; return n; });
    setItemSponsorsMap(prev => ({ ...prev, [item.id]: originais }));
    if (!rascunho) return;
    toast({
      title: "Alterações descartadas",
      description: `${item.displayId ?? "Peça"} voltou ao que está salvo.`,
      variant: "success",
      action: (
        <ToastAction
          altText={`Desfazer o descarte e recuperar o rascunho de ${item.displayId ?? "peça"}`}
          onClick={() => {
            setPendingChanges(prev => ({ ...prev, [item.id]: rascunho }));
            setItemSponsorsMap(prev => ({ ...prev, [item.id]: vinculosDoRascunho ?? rascunho.sponsorIds }));
          }}
        >
          Desfazer
        </ToastAction>
      ),
    });
  };

  /** O "Salvar" da linha: grava o rascunho desta peça. */
  const salvarLinha = (item: PecaDaVinculacao) => {
    const ch = pendingChanges[item.id];
    saveLinkingMutation.mutate([{ itemId: item.id, sponsorIds: ch?.sponsorIds ?? [], skipApproval: ch?.skipApproval ?? false }]);
  };

  /**
   * "Salvar N rascunhos" da barra de status. AGE SÓ SOBRE O QUE ESTÁ À VISTA
   * (fullyFilteredItems — todos os filtros, inclusive o de status), e o rótulo
   * conta `contextStatusCounts`, que sai do MESMO conjunto. Saindo do pool sem
   * a dimensão status, com o chip "Pronto" ligado o clique gravava rascunhos
   * escondidos pelo filtro — vínculos que a pessoa não estava vendo. Mesma
   * régua do "Enviar N para Arte".
   */
  const salvarRascunhosVisiveis = () => {
    const rascunhoItems = fullyFilteredItems.filter(i => itemUIStates[i.id] === 'RASCUNHO');
    if (rascunhoItems.length === 0) return;
    const payloads = rascunhoItems.map(i => {
      const ch = pendingChanges[i.id];
      return { itemId: i.id, sponsorIds: ch?.sponsorIds ?? [], skipApproval: ch?.skipApproval ?? false };
    });
    saveLinkingMutation.mutate(payloads);
  };

  /** "Salvar N rascunhos" da barra de lote: só os rascunhos selecionados. */
  const salvarSelecionadas = (dirtySelected: string[]) => {
    const payloads = dirtySelected.map(id => {
      const ch = pendingChanges[id];
      return { itemId: id, sponsorIds: ch?.sponsorIds ?? [], skipApproval: ch?.skipApproval ?? false };
    });
    saveLinkingMutation.mutate(payloads);
  };

  return {
    // linha
    toggleItemSkipApproval, aplicarVinculo, descartarRascunho, salvarLinha,
    toggleItemSelection, setPreviewRefUrl, falhaPorPeca,
    // lote e grupos
    toggleAllItemsInEvent, toggleTypeGroup, vincularRestantes, handleOpenBulkApplyDialog,
    salvarRascunhosVisiveis, salvarSelecionadas,
    // mutações (o que a tela lê delas: pendente e variáveis)
    saveLinkingMutation, manageEventSponsorsMutation,
    // referência visual
    previewRefUrl, refImgFailed, setRefImgFailed,
    // patrocinadores do evento
    selectedEventForSponsors, selectedSponsorIds, setSelectedSponsorIds, sponsorDialogOpen, setSponsorDialogOpen,
    sponsorModalSearch, setSponsorModalSearch, handleOpenSponsorDialog, handleSaveEventSponsors,
    // aplicar em lote
    bulkApplyDialogOpen, setBulkApplyDialogOpen, bulkSelectedSponsors, setBulkSelectedSponsors,
    bulkSkipApproval, setBulkSkipApproval, bulkSponsorSearch, setBulkSponsorSearch,
    toggleBulkSkip, handleApplyBulkSponsors,
    // envio à Arte, auto-vínculo e acrescentar (sub-hooks)
    ...envio, ...autoVinculo, ...acrescentar,
    // resultado do lote
    resultadoDoLote, setResultadoDoLote,
  };
}

export type AcoesDaVinculacao = ReturnType<typeof useAcoesDaVinculacao>;
