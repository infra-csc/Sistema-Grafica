// As três correções do PRÓPRIO DADO que a ficha permite: reverter uma
// aprovação, descancelar e transferir de evento. Não são ações do fluxo — ver
// "ESTA FICHA NÃO AGE" em item-details-dialog.tsx.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { getStatusLabel } from "@/lib/status";
import type { AprovacaoDaFicha, EventoParaTransferir, ItemDaFicha } from "./tipos";

/** O corpo JSON de erro/sucesso destas rotas, no que a ficha lê. */
type RespostaDaRota = { error?: string; status?: string; avisos?: unknown };

const mensagemDoErro = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function useFichaAcoes({ item, onOpenChange, refetchApprovals }: {
  item: ItemDaFicha | null;
  onOpenChange: (open: boolean) => void;
  refetchApprovals: () => Promise<AprovacaoDaFicha[] | undefined>;
}) {
  const { toast } = useToast();
  const [revertingSponsorId, setRevertingSponsorId] = useState<string | null>(null);
  const [descancelando, setDescancelando] = useState(false);
  // TRANSFERIR DE EVENTO (dono, 11/09: "transferir um item de um evento para
  // o outro sem mudar o status"). Mesma família da reversão de aprovação e do
  // descancelar: corrige o PRÓPRIO DADO, não o fluxo — e por isso é também
  // admin-only e mora aqui, fora da faixa de resolução.
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferDestino, setTransferDestino] = useState("");
  const [transferindo, setTransferindo] = useState(false);

  // A lista de eventos só é buscada quando o dialog de transferência abre —
  // mesmo cuidado do clone de peças: baixar todos os eventos toda vez que
  // qualquer ficha abre pesaria numa tela que já lista dezenas de peças.
  const { data: todosEventos = [], isLoading: eventosCarregando } = useQuery<EventoParaTransferir[]>({
    queryKey: ["/api/events"],
    enabled: transferOpen,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
  });

  const handleRevertApproval = async (sponsorId: string, sponsorName: string | null | undefined) => {
    if (!item?.id) return;
    setRevertingSponsorId(sponsorId);
    try {
      const res = await fetch(`/api/items/${item.id}/sponsor-approvals/${sponsorId}/revert`, {
        method: "POST",
        credentials: "include",
      });
      const data: RespostaDaRota = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Não foi possível reverter a aprovação");
      await refetchApprovals();
      // O item pode ter voltado de "sponsor_approved" para aguardando aprovação —
      // as listas que dependem de /api/items (Painel Geral, Atendimento etc.)
      // precisam refletir isso sem exigir um refresh manual da página.
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({ title: "Aprovação revertida", description: `"${sponsorName}" volta a aguardar aprovação.`, variant: "success" });
    } catch (error) {
      toast({ title: "Erro ao reverter", description: mensagemDoErro(error), variant: "destructive" });
    } finally {
      setRevertingSponsorId(null);
    }
  };

  // DESCANCELAR (dono, 01/09): admin devolve a peça ao fluxo de onde ela saiu.
  // Cabe na mesma exceção da reversão de aprovação logo acima — a ficha não
  // age no fluxo, mas desfazer um lançamento errado é correção do próprio
  // dado. Só admin vê o botão, e só em peça cancelada.
  const handleUncancel = async () => {
    if (!item?.id) return;
    setDescancelando(true);
    try {
      const res = await fetch(`/api/items/${item.id}/uncancel`, {
        method: "PATCH",
        credentials: "include",
      });
      const data: RespostaDaRota = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Não foi possível descancelar a peça");
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items", item.eventId] });
      toast({ title: "Peça descancelada", description: `Voltou para "${getStatusLabel(data?.status) || "o fluxo"}".`, variant: "success" });
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Erro ao descancelar", description: mensagemDoErro(error), variant: "destructive" });
    } finally {
      setDescancelando(false);
    }
  };

  const handleTransferEvent = async () => {
    if (!item?.id || !transferDestino) return;
    setTransferindo(true);
    try {
      const res = await fetch(`/api/items/${item.id}/transfer-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ eventId: transferDestino }),
      });
      const data: RespostaDaRota = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Não foi possível transferir a peça");
      // O item saiu de um evento e entrou noutro: as duas listas precisam
      // refletir isso, e não só a genérica '/api/items' (Painel Geral e as
      // filas usam a query com o eventId no meio da chave).
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      const nomeDestino = todosEventos.find((e) => e.id === transferDestino)?.name || "o evento escolhido";
      // Os avisos do servidor (patrocinador fora do destino, solicitação que
      // voltou a abrir) vão junto: a transferência deu certo, mas há o que conferir.
      const avisos: string[] = Array.isArray(data?.avisos) ? data.avisos : [];
      toast({
        title: "Peça transferida",
        description: [`Agora pertence a "${nomeDestino}" — status mantido.`, ...avisos].join(" "),
        variant: "success",
        ...(avisos.length ? { duration: 12000 } : {}),
      });
      setTransferOpen(false);
      setTransferDestino("");
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Erro ao transferir", description: mensagemDoErro(error), variant: "destructive" });
    } finally {
      setTransferindo(false);
    }
  };

  return {
    revertingSponsorId, descancelando,
    transferOpen, setTransferOpen, transferDestino, setTransferDestino, transferindo,
    todosEventos, eventosCarregando,
    handleRevertApproval, handleUncancel, handleTransferEvent,
  };
}
