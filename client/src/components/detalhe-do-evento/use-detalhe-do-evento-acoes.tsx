// ─────────────────────────────────────────────────────────────────────────────
// AS ESCRITAS DO DETALHE DO EVENTO — encerrar/reabrir, criar (uma e em lote),
// editar, excluir e enviar rascunhos. As MESMAS rotas, invalidações e toasts
// de antes; o estado que cada uma fecha ou zera chega pelo formulário.
// ─────────────────────────────────────────────────────────────────────────────
import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ToastAction } from "@/components/ui/toast";
import type { useToast } from "@/hooks/use-toast";
import { invalidarPedidos } from "@/components/pedidos/ui";
import { parseApiError } from "@/components/aumentar-quantidade-dialog";
import { calculateM2 } from "@/lib/calculateM2";
import { EMPTY_ITEM_FORM, finishes, materials } from "./regras";
import type { FormularioDaPeca } from "./use-formulario-da-peca";
import type { DadosDaEdicao, ItemFormData, ModeloDePeca, OpcaoDoCatalogo, PecaDoEvento } from "./tipos";

type Toast = ReturnType<typeof useToast>["toast"];

/** Pede ao servidor a URL de upload da referência visual. */
export const getUploadUrl = async () => {
  const response = await apiRequest("POST", "/api/objects/upload", {});
  const data = await response.json() as { uploadURL: string };
  return { method: "PUT" as const, url: data.uploadURL };
};

/** Encerrar / reabrir o evento (admin). */
export function useEncerrarEReabrir({ eventId, toast, setCloseDialogOpen, setReopenDialogOpen }: {
  eventId: string | undefined;
  toast: Toast;
  setCloseDialogOpen: (v: boolean) => void;
  setReopenDialogOpen: (v: boolean) => void;
}) {
  const closeEventMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/events/${eventId}/close`);
      return await res.json() as { openCount?: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId] });
      queryClient.invalidateQueries({ queryKey: ["/api/prazos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs", "event", eventId] });
      // As filas de trabalho leem `item.event.status` do payload de PEÇAS —
      // sem estas três, a aba de Arte/Gráfica já aberta continuaria mostrando
      // o evento encerrado (essas chaves rodam com staleTime Infinity).
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/resubmission-needed"] });
      setCloseDialogOpen(false);
      const abertas = data?.openCount ?? 0;
      toast({
        title: "Evento encerrado",
        description: abertas > 0
          ? `${abertas} ${abertas === 1 ? 'peça continua' : 'peças continuam'} na lista, sem ser ${abertas === 1 ? 'cobrada' : 'cobradas'} na Gestão de Prazos. Você pode reabrir a qualquer momento.`
          : "Saiu da Gestão de Prazos e das filas de trabalho. Você pode reabrir a qualquer momento.",
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Não foi possível encerrar o evento", description: error.message, variant: "destructive" });
    },
  });

  const reopenEventMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/events/${eventId}/reopen`);
      return await res.json() as { openCount?: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId] });
      queryClient.invalidateQueries({ queryKey: ["/api/prazos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs", "event", eventId] });
      // Mesmas três do encerrar: é o que devolve as peças às filas na hora.
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/resubmission-needed"] });
      setReopenDialogOpen(false);
      toast({
        title: "Evento reaberto",
        description: "Voltou para a Gestão de Prazos e para as filas de trabalho.",
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Não foi possível reabrir o evento", description: error.message, variant: "destructive" });
    },
  });

  return { closeEventMutation, reopenEventMutation };
}

/** O que o POST /api/items devolve e esta tela lê. */
type PecaCriada = { displayId?: string; vinculoDoPedido?: { ok: boolean; erro?: string } };
/** O que o POST /api/events/:id/items/submit devolve. */
type EnvioDosRascunhos = { count: number; falharam?: unknown };

/** Criar, criar em lote, editar, excluir e enviar rascunhos. */
export function useAcoesDasPecas({
  eventId, toast, setLocation, form, items, catalogOptions, standardItems, createCatalogOptionMutation,
  deletingItem, setDeletingItem, irParaRascunhos,
}: {
  eventId: string | undefined;
  toast: Toast;
  setLocation: (to: string) => void;
  form: FormularioDaPeca;
  items: PecaDoEvento[];
  catalogOptions: OpcaoDoCatalogo[];
  standardItems: ModeloDePeca[];
  createCatalogOptionMutation: UseMutationResult<Response, Error, { kind: string; value: string }>;
  deletingItem: PecaDoEvento | null;
  setDeletingItem: (item: PecaDoEvento | null) => void;
  irParaRascunhos: () => void;
}) {
  const {
    pedidoEmAtendimento, setPedidoEmAtendimento, setOpen, setFormData, bulkLeftoverRef, setBulkSavedTick,
    setBulkMode, setEditingItem, setEditDialogOpen, handleCloseEditDialog,
  } = form;

  const createItemMutation = useMutation({
    mutationFn: async (data: ItemFormData) => {
      const fileWidth = parseFloat(data.fileWidth);
      const fileHeight = parseFloat(data.fileHeight);

      const calculatedM2 = calculateM2(
        data.quantity,
        fileWidth,
        fileHeight
      ).toFixed(2);

      const itemData = {
        ...data,
        eventId,
        standardItemId: data.standardItemId || null,
        area: parseFloat(data.visualWidth),
        visual: parseFloat(data.visualHeight),
        calculatedM2,
        measurement: data.measurement || `${fileWidth} × ${fileHeight}`,
        skipApproval: data.skipApproval || false,
        isReuse: data.isReuse || false,
        // Criada a partir de um pedido do Atendimento: o servidor liga a peça
        // ao pedido na mesma requisição.
        ...(pedidoEmAtendimento ? { pedidoDePecaLinhaId: pedidoEmAtendimento.linha.id } : {}),
        // Peça do Kit: o servidor confere a remessa (mesmo evento, dona certa).
        ...(data.kitRemessaId ? { kitRemessaId: data.kitRemessaId } : {}),
      };

      // Criar item
      const response = await apiRequest("POST", "/api/items", itemData);
      const createdItem = await response.json() as PecaCriada;

      return createdItem;
    },
    onSuccess: (createdItem) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      const vinculo = createdItem?.vinculoDoPedido;
      setPedidoEmAtendimento(null);
      setOpen(false);
      setFormData({ ...EMPTY_ITEM_FORM });
      if (vinculo) {
        invalidarPedidos();
        if (vinculo.ok) {
          // A peça nasce em RASCUNHO como qualquer outra: sem dizer isso, quem
          // atendeu a solicitação achava que ela já tinha seguido.
          toast({
            title: "Peça criada e ligada à solicitação",
            description: "Quem solicitou foi avisado. A peça está em Rascunho — envie para a vinculação junto com a lista.",
            variant: "success",
            action: <ToastAction altText="Ver os rascunhos do evento" onClick={irParaRascunhos}>Ver rascunhos</ToastAction>,
          });
        } else {
          toast({
            title: "Peça criada, mas não ficou ligada à solicitação",
            description: `${vinculo.erro ?? "Erro ao ligar"} — use “Já criei a peça” na solicitação.`,
            // Aviso, não falha: a peça EXISTE; só o vínculo ficou para o botão da solicitação.
            variant: "warning",
          });
        }
      } else {
        // O CÓDIGO da peça criada: é o que a pessoa procura na lista logo
        // depois, e o que ela repete para a Arte.
        // "Já está na lista" era meia verdade: a peça nasce em RASCUNHO e não
        // anda até alguém enviar. O toast diz o passo seguinte e leva até ele.
        toast({
          title: createdItem?.displayId ? `Peça ${createdItem.displayId} adicionada` : "Peça adicionada",
          description: "Está em Rascunho. Quando a lista estiver pronta, envie para a vinculação.",
          variant: "success",
          action: <ToastAction altText="Ver os rascunhos do evento" onClick={irParaRascunhos}>Ver rascunhos</ToastAction>,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Não foi possível adicionar a peça",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // As linhas da grade chegam no formato do POST /api/items/bulk; a tela só as
  // repassa (e as põe no cache como rascunho até o servidor responder).
  const createBulkItemsMutation = useMutation({
    mutationFn: async (items: object[]) => {
      const response = await apiRequest("POST", "/api/items/bulk", { items });
      return await response.json() as unknown;
    },
    onMutate: async (newItems: object[]) => {
      // Cancelar queries pendentes para evitar sobrescrever nosso optimistic update
      await queryClient.cancelQueries({ queryKey: ["/api/items", eventId] });

      // Snapshot dos dados atuais (para rollback em caso de erro)
      const previousItems = queryClient.getQueryData(["/api/items", eventId]);

      // Optimistically update: adicionar os novos itens IMEDIATAMENTE no cache
      queryClient.setQueryData(["/api/items", eventId], (old: unknown[] = []) => {
        const itemsWithIds = newItems.map(item => ({
          ...item,
          id: `temp-${Math.random()}`, // ID temporário
          status: 'draft',
        }));
        return [...old, ...itemsWithIds];
      });

      // Retornar contexto para possível rollback
      return { previousItems };
    },
    onSuccess: (data) => {
      const quantidade = Array.isArray(data) ? data.length : 0;

      // Sem emoji e sem exclamação — o tom do resto do produto. A descrição diz
      // onde as peças foram parar (RASCUNHO, não "a lista") e o passo seguinte.
      // UM toast só: com linhas incompletas saíam dois "Peças salvas" empilhados.
      const sobra = bulkLeftoverRef.current;
      toast({
        title: "Peças salvas",
        description: `${quantidade} ${quantidade === 1 ? 'peça entrou' : 'peças entraram'} em Rascunho — envie para a vinculação quando a lista estiver pronta.`
          + (sobra > 0 ? ` ${sobra} ${sobra === 1 ? 'linha incompleta continua aberta' : 'linhas incompletas continuam abertas'} para você terminar.` : ''),
        action: sobra === 0
          ? <ToastAction altText="Ver os rascunhos do evento" onClick={irParaRascunhos}>Ver rascunhos</ToastAction>
          : undefined,
        variant: "success",
      });

      // Atualizar com dados reais do servidor (substitui os temporários)
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });

      // Sinaliza ao grid para remover as linhas já gravadas (evita salvá-las
      // de novo). As incompletas continuam lá.
      setBulkSavedTick(t => t + 1);

      // Fecha só quando não sobrou nada para terminar — assim o salvamento dá
      // a sensação clara de concluído sem descartar linhas pela metade.
      if (bulkLeftoverRef.current === 0) {
        setOpen(false);
        setBulkMode(false);
      }
    },
    onError: (error: Error, _newItems, context) => {
      // Se der erro, reverter para dados anteriores
      if (context?.previousItems) {
        queryClient.setQueryData(["/api/items", eventId], context.previousItems);
      }

      toast({
        title: "Não foi possível salvar o lote",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: DadosDaEdicao }) => {
      // Campo decimal vazio não pode virar "" (Postgres: invalid input syntax
      // for type numeric). Coage vazio/invalido para null; mantém como string.
      const toNumStr = (v: unknown): string | null => {
        const s = String(v ?? "").trim().replace(",", ".");
        if (s === "") return null;
        const n = parseFloat(s);
        return isNaN(n) ? null : s;
      };
      const toNum = (v: unknown): number | null => {
        const s = String(v ?? "").trim().replace(",", ".");
        if (s === "") return null;
        const n = parseFloat(s);
        return isNaN(n) ? null : n;
      };

      const fw = toNum(data.fileWidth);
      const fh = toNum(data.fileHeight);
      // A ficha pode mandar a quantidade como texto do campo: calculateM2 a
      // multiplica do mesmo jeito.
      const calculatedM2 = (fw !== null && fh !== null)
        ? calculateM2(Number(data.quantity), fw, fh).toFixed(2)
        : null;

      const itemData: Record<string, unknown> = {
        ...data,
        standardItemId: data.standardItemId || null,
        visualWidth: toNumStr(data.visualWidth),
        visualHeight: toNumStr(data.visualHeight),
        fileWidth: toNumStr(data.fileWidth),
        fileHeight: toNumStr(data.fileHeight),
        area: toNum(data.visualWidth),   // Manter area para compatibilidade com backend
        visual: toNum(data.visualHeight), // Manter visual para compatibilidade com backend
        calculatedM2,
      };

      // area/visual/calculatedM2 são colunas obrigatórias (notNull): se ficaram
      // sem valor, omitir do update parcial em vez de enviar null.
      if (itemData.area === null) delete itemData.area;
      if (itemData.visual === null) delete itemData.visual;
      if (itemData.calculatedM2 === null) delete itemData.calculatedM2;

      return await apiRequest("PATCH", `/api/items/${id}`, itemData);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });

      // Se o usuário digitou um material/acabamento que ainda não existe,
      // cadastra no catálogo (Modelos) para reutilizar depois.
      const mat = (variables?.data?.material || "").trim();
      const fin = (variables?.data?.finish || "").trim();
      const has = (kind: string, v: string) =>
        catalogOptions.some(o => o.kind === kind && o.value.toLowerCase() === v.toLowerCase()) ||
        standardItems.some(s => (kind === "material" ? s.material : s.finish)?.toLowerCase() === v.toLowerCase());
      const criados: string[] = [];
      if (mat && !materials.some(m => m.toLowerCase() === mat.toLowerCase()) && !has("material", mat)) {
        createCatalogOptionMutation.mutate({ kind: "material", value: mat });
        criados.push(`material "${mat}"`);
      }
      if (fin && !finishes.some(f => f.toLowerCase() === fin.toLowerCase()) && !has("finish", fin)) {
        createCatalogOptionMutation.mutate({ kind: "finish", value: fin });
        criados.push(`acabamento "${fin}"`);
      }

      const idSalvo = items.find((i) => i.id === variables?.id)?.displayId;
      setEditingItem(null);
      setOpen(false);
      setEditDialogOpen(false);
      setBulkMode(false);
      toast({
        title: idSalvo ? `Peça ${idSalvo} atualizada` : "Peça atualizada",
        description: criados.length
          ? `Novo ${criados.join(" e ")} cadastrado no catálogo.`
          : "As alterações foram salvas.",
        variant: "success",
      });
    },
    onError: (error: Error) => {
      // Rede de segurança do modelo de complemento. O servidor recusa aumentar
      // a quantidade de peça em produção (409 USE_COMPLEMENT) e recusa reduzir
      // abaixo do que já existe fisicamente (409 QUANTITY_FLOOR). Sem tradução,
      // os dois chegavam ao usuário como JSON cru num toast vermelho.
      const { message, code, data } = parseApiError(error);

      if (code === "USE_COMPLEMENT") {
        handleCloseEditDialog();
        toast({
          title: "Peça já em produção",
          description: 'A quantidade não sobe por aqui: o aumento vira uma peça complementar, e o pedido é feito na tela da Gráfica.',
          variant: "warning",
        });
        return;
      }

      if (code === "QUANTITY_FLOOR") {
        toast({
          title: "Redução não permitida",
          description: `Já há ${data?.minimum ?? "?"} un. produzidas/conferidas/entregues. Mínimo: ${data?.minimum ?? "?"}.`,
          // O piso barrou o número; nada quebrou — aviso, não falha.
          variant: "warning",
        });
        return;
      }

      toast({
        title: "Não foi possível salvar a peça",
        description: message,
        variant: "destructive",
      });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      const idExcluido = deletingItem?.displayId;
      // Fechar aqui (e não no onClick) permite que o botão mostre "Excluindo…"
      // enquanto a requisição roda.
      setDeletingItem(null);
      // A exclusão é SOFT (ver canDeleteAny): dizer onde a peça foi parar
      // tira o peso de um clique que parece irreversível e não é.
      toast({
        title: idExcluido ? `Peça ${idExcluido} excluída` : "Peça excluída",
        description: "Foi para Peças Excluídas, de onde pode ser restaurada.",
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Não foi possível excluir a peça",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const submitDraftsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/events/${eventId}/items/submit`);
      return await response.json() as EnvioDosRascunhos;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      // O passo seguinte mora em OUTRA tela: a ação leva direto para a
      // Vinculação já filtrada neste evento (?ev= é o filtro que ela lê da URL).
      // Falha parcial: as que foram, foram — e as que ficaram são nomeadas
      // (mudaram de status no meio do envio, outra pessoa mexeu).
      const falharam: string[] = Array.isArray(data?.falharam) ? data.falharam : [];
      const ficaram = falharam.length > 0
        ? ` ${falharam.length} não ${falharam.length === 1 ? 'foi' : 'foram'} porque mudaram de status durante o envio: ${falharam.join(', ')} — recarregue e confira.`
        : '';
      toast({
        title: falharam.length > 0 ? `${data.count} de ${data.count + falharam.length} peças enviadas` : "Peças enviadas para a vinculação",
        description: `${data.count} ${data.count === 1 ? 'peça já está' : 'peças já estão'} na fila de Vincular Patrocinadores. Aqui ${data.count === 1 ? 'ela aparece' : 'elas aparecem'} como Aguardando Vinculação.${ficaram}`,
        action: (
          <ToastAction altText="Abrir a Vinculação deste evento" onClick={() => setLocation(`/vincular-patrocinadores?ev=${eventId}`)}>
            Ver na Vinculação
          </ToastAction>
        ),
        // Envio parcial é aviso: as que ficaram estão nomeadas na descrição.
        variant: falharam.length > 0 ? "warning" : "success",
      });
    },
    onError: (error: Error) => {
      const message = error.message || "Erro desconhecido";

      if (message.includes("Nenhum item em rascunho")) {
        toast({
          title: "Nenhuma peça para enviar",
          description: "Não há rascunho que o seu perfil envie neste evento — pode já ter sido enviado por outra pessoa.",
          variant: "warning",
        });
      } else {
        toast({
          title: "Não foi possível enviar as peças",
          description: message,
          variant: "destructive",
        });
      }
    },
  });

  return { createItemMutation, createBulkItemsMutation, updateItemMutation, deleteItemMutation, submitDraftsMutation };
}

export type AcoesDasPecas = ReturnType<typeof useAcoesDasPecas>;
