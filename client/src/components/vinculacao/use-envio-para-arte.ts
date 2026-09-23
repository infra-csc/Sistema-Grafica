// ─────────────────────────────────────────────────────────────────────────────
// useEnvioParaArte — o ENVIO À ARTE: o modal de conferência (com a foto das
// peças), a sincronização dos rascunhos antes do envio, a marca otimista
// "Enviado" e a mutação. Chamado de dentro de useAcoesDaVinculacao.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { runInBatches } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { DOWNSTREAM_STATUSES } from "./constantes";
import { mensagemDoErro } from "./regras";
import type { Vinculacao } from "./use-vinculacao";
import type { FalhaDaPeca, PecaDaVinculacao, ProgressoDoEnvio, RespostaDoEnvio, SendConfirmModal } from "./tipos";

export function useEnvioParaArte(v: Vinculacao, registrarFalhas: (ok: string[], falhas: FalhaDaPeca[]) => void) {
  const {
    items, fullyFilteredItems, itemUIStates, setItemSponsorsMap, originalSponsorsMap, setOriginalSponsorsMap,
    pendingChanges, setPendingChanges, setSelectedItemIds,
  } = v;
  const { toast } = useToast();

  const [optimisticSentIds, setOptimisticSentIds] = useState<Set<string>>(new Set());

  const [sendConfirmModal, setSendConfirmModal] = useState<SendConfirmModal | null>(null);
  // Recorte dentro do modal de envio: ver so as pecas que vao sair sem marca.
  // Numa lista de trinta, as tres em ambar ficam espalhadas e e preciso rolar
  // procurando — justo a conferencia que o aviso do topo acabou de pedir.
  const [soSemPatrocinador, setSoSemPatrocinador] = useState(false);
  // Trava o botão de confirmar envio enquanto a sincronização/envio está em curso.
  const [isSending, setIsSending] = useState(false);
  // PROGRESSO VISÍVEL do envio em lote: a sincronização roda item a item no
  // client (runInBatches) — dava para contar, e o botão ficava só em
  // 'Enviando...' enquanto 60 peças sincronizavam às cegas.
  const [progressoEnvio, setProgressoEnvio] = useState<ProgressoDoEnvio | null>(null);

  // Mutation para enviar items para Arte
  const sendToArteMutation = useMutation({
    mutationFn: async (itemIds: string[]): Promise<RespostaDoEnvio> => {
      const res = await apiRequest("POST", "/api/items/send-to-arte", { itemIds });
      return res.json();
    },
    onMutate: (itemIds: string[]) => {
      // Atualização otimista: marca visualmente como ENVIADO antes da resposta do servidor
      setOptimisticSentIds(prev => new Set(Array.from(prev).concat(itemIds)));
    },
    onSuccess: async (data, itemIds) => {
      // O motivo por peça vem em `falhas`; as enviadas limpam o delas.
      const falhasDoEnvio: { itemId: string; motivo: string }[] = data.falhas ?? [];
      const idsComFalha = new Set(falhasDoEnvio.map(f => f.itemId));
      registrarFalhas(itemIds.filter(id => !idsComFalha.has(id)), falhasDoEnvio.map(f => ({ itemId: f.itemId, message: f.motivo })));
      // Só sai da seleção o que foi; a que falhou continua marcada.
      setSelectedItemIds(prev => new Set(Array.from(prev).filter(id => idsComFalha.has(id))));
      setSendConfirmModal(null);
      // Audit-logs e notificações recarregam em background.
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });

      // O TOAST antes da espera: o usuário vê o resultado na hora; o que
      // espera é só a limpeza da marca otimista, logo abaixo.
      const jaEnviadas = (data.errors ?? []).filter((e: string) => e.includes('já foi enviado')).length;
      if (data.sent === 0 && data.errors && data.errors.length > 0 && jaEnviadas === data.errors.length) {
        // O caso do clique repetido: nada a fazer, e a frase diz isso em
        // vez de listar N "erros" que não são erros de ninguém.
        toast({
          title: jaEnviadas === 1 ? "Essa peça já tinha sido enviada" : `Essas ${jaEnviadas} peças já tinham sido enviadas`,
          description: "Por outro envio ou por outra pessoa — elas já estão na fila da Arte. A lista foi atualizada.",
          // Aviso, não erro: nada falhou, só não havia o que enviar.
          variant: "warning",
        });
      } else if (data.errors && data.errors.length > 0) {
        const comProblema = falhasDoEnvio.length || data.errors.length;
        toast({
          title: `${data.sent} ${data.sent === 1 ? 'enviada' : 'enviadas'}, ${comProblema} com problema`,
          description: falhasDoEnvio.length > 0
            ? "O motivo está na linha de cada peça que não foi."
            : data.errors.join(', '),
          variant: "destructive",
        });
      } else {
        toast({
          title: data.sent === 1 ? "Peça enviada para a Arte" : "Peças enviadas para a Arte",
          description: (data.sent === 1 ? "Ela já está na fila da Arte" : `As ${data.sent} já estão na fila da Arte`)
            + " — a Arte faz o layout e os patrocinadores vinculados aprovam. Aqui ficam como Enviado.",
          variant: "success",
        });
      }

      // A JANELA DE CORRIDA, fechada: a marca otimista "enviado" só cai quando
      // a lista nova CHEGOU — `invalidateQueries` devolve uma promessa que
      // resolve depois do refetch. Apagada antes, as peças recém-enviadas
      // voltavam a aparecer como "Pronto" com o status antigo enquanto a
      // recarga estava em voo, o botão reabilitava, e um segundo clique
      // mandava tudo de novo.
      await queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      // Limpa só os otimistas DESTE envio — zerar tudo apagava o estado de
      // um segundo envio ainda em voo.
      setOptimisticSentIds(prev => {
        const next = new Set(prev);
        itemIds.forEach(id => next.delete(id));
        return next;
      });
    },
    onError: (error: Error, itemIds: string[]) => {
      // Reverter estado otimista
      setOptimisticSentIds(prev => {
        const next = new Set(prev);
        itemIds.forEach(id => next.delete(id));
        return next;
      });
      toast({
        title: "Erro ao enviar para Arte",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => { if (!sendConfirmModal) setSoSemPatrocinador(false); }, [sendConfirmModal]);

  const openSendModalForItem = (item: PecaDaVinculacao, preSelectedSponsorId?: string) => {
    const pending: Set<string> = new Set();
    if (preSelectedSponsorId) pending.add(preSelectedSponsorId);
    setSendConfirmModal({ items: [item], pendingByItem: { [item.id]: pending } });
  };

  /** O "Enviar N para Arte" do topo: abre o envio com as prontas à vista. */
  const abrirEnvioDasProntas = () => {
    const prontoItems = fullyFilteredItems.filter(i => itemUIStates[i.id] === 'PRONTO');
    if (prontoItems.length === 0) return;
    const pendingByItem: Record<string, Set<string>> = {};
    prontoItems.forEach(i => { pendingByItem[i.id] = new Set(); });
    setSendConfirmModal({ items: prontoItems, pendingByItem });
  };

  // Confirma e executa o envio com os patrocinadores finais do modal
  const handleModalConfirmSend = async () => {
    if (!sendConfirmModal || isSending) return;
    const { items: doModal, pendingByItem } = sendConfirmModal;
    // O modal carrega uma FOTO da lista de quando foi aberto. Entre abrir e
    // confirmar, outra pessoa (ou outro envio desta tela) pode ter mandado
    // parte dela: o que já tem status além da vinculação sai do lote AQUI,
    // na hora do clique, em vez de ir ao servidor para voltar como erro.
    const statusAtual = new Map(items.map((i) => [i.id, i.status]));
    const jaEnviadas = doModal.filter(i => DOWNSTREAM_STATUSES.includes(statusAtual.get(i.id) ?? i.status));
    const paraEnviar = doModal.filter(i => !jaEnviadas.includes(i));
    if (paraEnviar.length === 0) {
      setSendConfirmModal(null);
      toast({
        title: jaEnviadas.length === 1 ? "Essa peça já tinha sido enviada" : `Essas ${jaEnviadas.length} peças já tinham sido enviadas`,
        description: "Por outro envio ou por outra pessoa — elas já estão na fila da Arte.",
        variant: "warning",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      return;
    }
    setIsSending(true);

    try {
      // Sincroniza os itens que ganharam patrocinadores no modal OU que têm
      // rascunho local não salvo — senão enviar um rascunho descartaria as
      // edições não salvas em silêncio (o sync usaria só o que está salvo).
      const toSync = paraEnviar.filter(item => {
        const draft = pendingChanges[item.id];
        const existing = draft?.sponsorIds ?? originalSponsorsMap[item.id] ?? [];
        const newOnes = Array.from(pendingByItem[item.id] || []);
        return !!draft?.isDirty || newOnes.some(id => !existing.includes(id));
      });
      setProgressoEnvio({ feito: 0, total: toSync.length });
      await runInBatches(toSync, async (item) => {
        const draft = pendingChanges[item.id];
        const existing = draft?.sponsorIds ?? originalSponsorsMap[item.id] ?? [];
        const newOnes = Array.from(pendingByItem[item.id] || []);
        const merged = Array.from(new Set([...existing, ...newOnes]));
        // skipApproval só vai no body quando há rascunho com a flag; caso
        // contrário o servidor preserva o valor atual (mandar `false` fixo
        // apagava a marca "sem aprovação" de itens isentos).
        try {
          await apiRequest("POST", `/api/items/${item.id}/sponsors/sync`, {
            sponsorIds: merged,
            ...(draft ? { skipApproval: draft.skipApproval } : {}),
          });
        } catch (erro) {
          // O motivo vai para a linha da peça que travou o envio.
          registrarFalhas([], [{ itemId: item.id, message: mensagemDoErro(erro) || "Não foi possível salvar o vínculo." }]);
          throw erro;
        }
        setOriginalSponsorsMap(prev => ({ ...prev, [item.id]: merged }));
        setItemSponsorsMap(prev => ({ ...prev, [item.id]: merged }));
        if (draft) setPendingChanges(prev => { const n = { ...prev }; delete n[item.id]; return n; });
        setProgressoEnvio(prev => prev ? { ...prev, feito: prev.feito + 1 } : prev);
      });
      const itemIds = paraEnviar.map(i => i.id);
      setOptimisticSentIds(prev => new Set(Array.from(prev).concat(itemIds)));
      // Espera o resultado de verdade: com mutate() fire-and-forget o modal
      // fechava antes da resposta e, em erro, o usuário perdia o contexto.
      // Sucesso fecha o modal (e limpa a seleção) no onSuccess; erro toasta no
      // onError e o modal fica aberto para tentar de novo.
      await sendToArteMutation.mutateAsync(itemIds).then(() => {}, () => {});
    } catch (err) {
      toast({
        title: "Erro ao enviar",
        description: mensagemDoErro(err) || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
      setProgressoEnvio(null);
    }
  };

  return {
    optimisticSentIds, sendToArteMutation, openSendModalForItem, abrirEnvioDasProntas,
    sendConfirmModal, setSendConfirmModal, soSemPatrocinador, setSoSemPatrocinador,
    isSending, progressoEnvio, handleModalConfirmSend,
  };
}
