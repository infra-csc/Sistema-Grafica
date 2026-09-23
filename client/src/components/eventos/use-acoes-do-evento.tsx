// As ações sobre um evento da lista — arquivar (o "Excluir"), encerrar,
// reabrir e prioridade: o estado de cada diálogo, a mutação e o aviso.
import { useCallback, useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { getPriorityMeta } from "@/lib/status";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { CHAVE_EVENTOS_ARQUIVADOS } from "./eventos-arquivados";
import { readEventStats } from "./regras";
import type { AcaoSobreEvento, EventoDaLista } from "./tipos";

export function useAcoesDoEvento(
  events: EventoDaLista[],
  { showCompleted, setShowCompleted }: { showCompleted: boolean; setShowCompleted: (v: boolean) => void },
) {
  const { toast } = useToast();
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  // Encerrar e reabrir compartilham um único par de estados: nunca há os dois
  // diálogos abertos ao mesmo tempo (o card mostra um botão OU o outro).
  const [closingEventId, setClosingEventId] = useState<string | null>(null);
  const [reopeningEventId, setReopeningEventId] = useState<string | null>(null);
  const [priorityDialogOpen, setPriorityDialogOpen] = useState(false);
  const [selectedEventForPriority, setSelectedEventForPriority] = useState<EventoDaLista | null>(null);

  const deleteEventMutation = useMutation({
    mutationFn: async (id: string) => {
      // O DELETE ARQUIVA (nada é apagado); o corpo diz quantas peças saíram
      // de vista junto com o evento.
      const res = await apiRequest("DELETE", `/api/events/${id}`);
      return await res.json() as { deletedItems?: number; deliveredItems?: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: CHAVE_EVENTOS_ARQUIVADOS });
      setDeletingEventId(null);
      setDeleteConfirmText("");
      const saiu = data?.deletedItems ?? 0;
      toast({
        title: "Evento arquivado",
        description: saiu > 0
          ? `${saiu} ${saiu === 1 ? 'peça saiu' : 'peças saíram'} das telas junto com ele. Nada foi apagado: dá para restaurar em Arquivados.`
          : "Nada foi apagado: dá para restaurar em Arquivados.",
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Não foi possível arquivar o evento", description: error.message, variant: "destructive" });
    },
  });

  // ── Encerrar / reabrir ────────────────────────────────────────────────────
  // O corpo da resposta traz a contagem REAL do servidor (openCount /
  // inProductionCount): o toast repete o número que a confirmação prometeu, em
  // vez de reafirmar o que o cliente já achava.
  const closeEventMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/events/${id}/close`);
      return await res.json() as { openCount?: number; inProductionCount?: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prazos"] });
      // As filas de trabalho leem `item.event.status` do payload de PEÇAS —
      // sem estas três, a aba de Arte/Gráfica já aberta continuaria mostrando
      // o evento encerrado (essas chaves rodam com staleTime Infinity).
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/resubmission-needed"] });
      setClosingEventId(null);
      const open = data?.openCount ?? 0;
      toast({
        title: "Evento encerrado",
        description: open > 0
          ? `${open} ${open === 1 ? 'peça continua' : 'peças continuam'} em aberto na lista do evento, sem cobrança de prazo.`
          : "Saiu da Gestão de Prazos e das filas de trabalho.",
        // O card acabou de SUMIR da grade (a visão padrão esconde encerrados).
        // Sem esta ação, "pode reabrir a qualquer momento" seria verdade só
        // para quem já sabe onde o evento foi parar.
        action: !showCompleted ? (
          <ToastAction altText="Mostrar eventos encerrados" onClick={() => setShowCompleted(true)}>
            Mostrar
          </ToastAction>
        ) : undefined,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Não foi possível encerrar o evento", description: error.message, variant: "destructive" });
    },
  });

  const reopenEventMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/events/${id}/reopen`);
      return await res.json() as { openCount?: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prazos"] });
      // Mesmas três do encerrar: é o que devolve as peças às filas na hora.
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/resubmission-needed"] });
      setReopeningEventId(null);
      const open = data?.openCount ?? 0;
      toast({
        title: "Evento reaberto",
        description: open > 0
          ? `Voltou para a Gestão de Prazos e para as filas com ${open} ${open === 1 ? 'peça em aberto' : 'peças em aberto'}.`
          : "Voltou para a Gestão de Prazos e para as filas de trabalho.",
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Não foi possível reabrir o evento", description: error.message, variant: "destructive" });
    },
  });

  const updatePriorityMutation = useMutation({
    mutationFn: async ({ id, priority }: { id: string; priority: string }) => {
      return await apiRequest("PATCH", `/api/events/${id}/priority`, { priority });
    },
    onSuccess: (_res, { priority }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      const nome = selectedEventForPriority?.name;
      setPriorityDialogOpen(false);
      setSelectedEventForPriority(null);
      // Diz O QUE ficou e EM QUAL evento: com os atalhos 1–4 a pessoa organiza
      // a semana em sequência, e o toast é a única confirmação do nível.
      // Vazio = volta à regra automática (ver o diálogo).
      const nivel = priority ? getPriorityMeta(priority)?.label ?? priority : "Automática";
      toast({
        title: priority ? `Prioridade: ${nivel}` : "Prioridade automática",
        description: priority
          ? `${nome ? `"${nome}" ` : ""}travado neste nível — a regra da saída do caminhão não mexe mais nele.`
          : `${nome ? `"${nome}" ` : "O evento "}voltou a seguir a saída do caminhão.`,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Não foi possível mudar a prioridade", description: error.message, variant: "destructive" });
    },
  });

  const handleDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteConfirmText("");
    setDeletingEventId(id);
  }, []);

  const handleClose = useCallback<AcaoSobreEvento>((event, e) => {
    e.preventDefault();
    e.stopPropagation();
    setClosingEventId(event.id);
  }, []);

  const handleReopen = useCallback<AcaoSobreEvento>((event, e) => {
    e.preventDefault();
    e.stopPropagation();
    setReopeningEventId(event.id);
  }, []);

  const handleSetPriority = useCallback<AcaoSobreEvento>((event, e) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedEventForPriority(event);
    setPriorityDialogOpen(true);
  }, []);

  const handlePrioritySelect = useCallback((priority: string) => {
    if (selectedEventForPriority) {
      updatePriorityMutation.mutate({ id: selectedEventForPriority.id, priority });
    }
  }, [selectedEventForPriority, updatePriorityMutation]);

  // Atalhos 1–4 definem a prioridade e 0 remove — organizar a fila da semana
  // era hover → bandeira → clique em 5–10 eventos.
  useEffect(() => {
    if (!priorityDialogOpen) return;
    const map: Record<string, string> = { '1': 'baixa', '2': 'media', '3': 'alta', '4': 'urgente', '0': '' };
    const onKey = (e: KeyboardEvent) => {
      if (updatePriorityMutation.isPending) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const value = map[e.key];
      if (value === undefined) return;
      e.preventDefault();
      handlePrioritySelect(value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [priorityDialogOpen, updatePriorityMutation.isPending, handlePrioritySelect]);

  // ── Exclusão: dimensão real do estrago ────────────────────────────────────
  const deletingEvent = deletingEventId ? events.find((e) => e.id === deletingEventId) : null;
  const deletingStats = deletingEvent ? readEventStats(deletingEvent) : null;
  // Peça entregue ou em produção = trabalho pago e material físico envolvido.
  // Nesses casos a confirmação exige digitar o nome do evento.
  const deleteNeedsTyping = !!deletingStats && (deletingStats.deliveredCount > 0 || deletingStats.inProductionCount > 0);
  const deleteConfirmed = !deleteNeedsTyping
    || deleteConfirmText.trim().toLowerCase() === (deletingEvent?.name || "").trim().toLowerCase();

  // ── Encerramento: dimensão real do que sai de vista ───────────────────────
  const closingEvent = closingEventId ? events.find((e) => e.id === closingEventId) : null;
  const closingStats = closingEvent ? readEventStats(closingEvent) : null;
  const reopeningEvent = reopeningEventId ? events.find((e) => e.id === reopeningEventId) : null;
  const reopeningStats = reopeningEvent ? readEventStats(reopeningEvent) : null;

  return {
    deletingEventId, setDeletingEventId, deleteConfirmText, setDeleteConfirmText,
    deletingEvent, deletingStats, deleteNeedsTyping, deleteConfirmed, deleteEventMutation,
    closingEventId, setClosingEventId, closingEvent, closingStats, closeEventMutation,
    reopeningEventId, setReopeningEventId, reopeningEvent, reopeningStats, reopenEventMutation,
    priorityDialogOpen, setPriorityDialogOpen, selectedEventForPriority, updatePriorityMutation,
    handleDelete, handleClose, handleReopen, handleSetPriority, handlePrioritySelect,
  };
}

export type AcoesDoEvento = ReturnType<typeof useAcoesDoEvento>;
