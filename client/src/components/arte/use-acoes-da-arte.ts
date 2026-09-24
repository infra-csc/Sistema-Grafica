// ─────────────────────────────────────────────────────────────────────────────
// AS GRAVAÇÕES DA ARTE — cada mutação com o toast que diz o que aconteceu e
// para onde a peça foi, e a limpeza do modal de onde ela saiu.
//
// Esta tela lê ["/api/items"] (os dois recortes por status) e
// ["/api/items/resubmission-needed"]: toda gravação invalida as duas, para a
// tabela não depender do WebSocket estar de pé.
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, SetStateAction } from "react";
import { useMutation } from "@tanstack/react-query";
import type { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { runInBatches } from "@/lib/utils";
import { ehMolde } from "@shared/molde";
import { mensagemDeErro } from "./constantes";
import type { PecaDaArte, PecaDaCorrecao } from "./tipos";

export type AcoesDaArte = ReturnType<typeof useAcoesDaArte>;

export function useAcoesDaArte({
  toast, itemPorId, correcaoItems, correcaoItem, selectedItemId, proximaDaFila, handleViewDetails,
  setSelectedItemId, setApprovalThumbUrl, setApprovalThumbPreview, setSavedApprovalThumbUrl, setThumbJustSaved, setSendingId,
  setShowBulkDialog, setSelectedItemIds, setSharedPdfUrl, setFinalFileUrl, setFinalFileName, setFinalDirty, setMotivoTrocaThumb,
  setCorrecaoItem, setCorrecaoThumbUrl, setCorrecaoFileName, setDispenseItem, setDispenseReason, setDevolverItem, setDevolverMotivo,
}: {
  toast: ReturnType<typeof useToast>["toast"];
  itemPorId: Map<string, PecaDaArte>;
  correcaoItems: PecaDaCorrecao[];
  correcaoItem: PecaDaCorrecao | null;
  selectedItemId: string | null;
  /** A peça seguinte da fila aberta (ver a página), para abrir depois do envio. */
  proximaDaFila: (itemId: string, fila: string) => PecaDaArte | null;
  handleViewDetails: (item: PecaDaArte) => void;
  setSelectedItemId: Dispatch<SetStateAction<string | null>>;
  setApprovalThumbUrl: Dispatch<SetStateAction<string>>;
  setApprovalThumbPreview: Dispatch<SetStateAction<string>>;
  setSavedApprovalThumbUrl: Dispatch<SetStateAction<string>>;
  setThumbJustSaved: Dispatch<SetStateAction<boolean>>;
  setSendingId: Dispatch<SetStateAction<string | null>>;
  setShowBulkDialog: Dispatch<SetStateAction<boolean>>;
  setSelectedItemIds: Dispatch<SetStateAction<Set<string>>>;
  setSharedPdfUrl: Dispatch<SetStateAction<string>>;
  setFinalFileUrl: Dispatch<SetStateAction<string>>;
  setFinalFileName: Dispatch<SetStateAction<string>>;
  setFinalDirty: Dispatch<SetStateAction<boolean>>;
  setMotivoTrocaThumb: Dispatch<SetStateAction<string>>;
  setCorrecaoItem: Dispatch<SetStateAction<PecaDaCorrecao | null>>;
  setCorrecaoThumbUrl: Dispatch<SetStateAction<string>>;
  setCorrecaoFileName: Dispatch<SetStateAction<string>>;
  setDispenseItem: Dispatch<SetStateAction<PecaDaArte | null>>;
  setDispenseReason: Dispatch<SetStateAction<string>>;
  setDevolverItem: Dispatch<SetStateAction<PecaDaArte | null>>;
  setDevolverMotivo: Dispatch<SetStateAction<string>>;
}) {
  const submitForApprovalMutation = useMutation({
    mutationFn: async ({ itemId, approvalThumbUrl }: { itemId: string; approvalThumbUrl: string }) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/submit-for-approval`, { approvalThumbUrl });
    },
    onSuccess: (_res, variables) => {
      // Esta tela lê ["/api/items"] e ["/api/items/resubmission-needed"] — sem
      // invalidá-las, a peça continuava na tabela com o status velho até o
      // WebSocket chegar (ou pra sempre, se ele não estivesse conectado).
      // "/api/items/pending" é para outras telas (ex.: Atendimento).
      // O rótulo sai ANTES da invalidação: depois dela a peça já pode ter
      // saído da lista local.
      const peca = itemPorId.get(variables.itemId);
      const id = peca?.displayId;
      // PRÓXIMA PEÇA AUTOMÁTICA (rodada 4) — só quando o envio saiu do MODAL.
      // Depois de enviar, o modal fechava e o designer voltava à lista para
      // caçar a peça seguinte: abrir, subir, enviar, FECHAR, achar, abrir. A
      // próxima é a da MESMA fila, na ordem da tela (Kit no topo); sem próxima,
      // fecha como antes. O envio de um clique pela linha não abre nada.
      const vinhaDoModal = selectedItemId === variables.itemId;
      const proxima = vinhaDoModal ? proximaDaFila(variables.itemId, "criar-aprovacoes") : null;
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/resubmission-needed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/pending"] });
      if (proxima) {
        handleViewDetails(proxima);
      } else {
        setSelectedItemId(null);
        setApprovalThumbUrl("");
        setApprovalThumbPreview("");
      }
      const seguindo = proxima ? ` Abrindo a próxima: ${proxima.displayId}.` : "";
      // Peça SEM aprovação de patrocinador (skipApproval) não vai para
      // "Aguardando patrocinador" — o servidor (submit-for-approval) a manda
      // para awaiting_creator_review, que é a aba Finalizar arte desta mesma
      // tela: a Arte ainda sobe o arquivo final antes da Revisão Final. Dizer
      // "revisão final" prometia pular um passo que não é pulado. O toast, o
      // `title` da linha e o rótulo do botão dizem o mesmo destino.
      // MOLDE (22/09): sem aprovação e sem finalização — foi direto para a Revisão Final.
      if (ehMolde(peca)) {
        toast({ title: id ? `${id} enviado` : "Molde enviado", description: `Molde: foi direto para a Revisão Final (sem aprovação de patrocinador nem arquivo final).${seguindo}`, variant: "success" });
        return;
      }
      if (peca?.skipApproval) {
        toast({
          title: id ? `${id} enviada` : "Peça enviada",
          description: `Sem aprovação de patrocinador — foi direto para a finalização: falta subir o arquivo final (aba Finalizar arte).${seguindo}`,
          variant: "success",
        });
        return;
      }
      // Diz QUAL peça e PARA ONDE ela foi. "A peça foi enviada" repetia o
      // título, e no envio de um clique pela linha a pessoa não via qual
      // linha tinha sumido da fila.
      toast({
        title: id ? `${id} enviada para aprovação` : "Peça enviada para aprovação",
        description: `Saiu desta fila e agora está em Aguardando patrocinador.${seguindo}`,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao enviar peça",
        description: mensagemDeErro(error),
        variant: "destructive",
      });
    },
    onSettled: () => setSendingId(null),
  });

  // Salva o thumb no item SEM mudar o status (rascunho). O item continua na aba
  // "Mandar para Aprovação" (filtrada por status awaiting_submission) — só grava
  // o approvalThumbUrl para enviar depois.
  const saveThumbDraftMutation = useMutation({
    // apiRequest devolve a Response crua — sem o .json() o callback recebia um
    // objeto sem `id` e a atualização otimista nunca rodava.
    mutationFn: async ({ itemId, approvalThumbUrl }: { itemId: string; approvalThumbUrl: string }) => {
      const res = await apiRequest("PATCH", `/api/items/${itemId}`, { approvalThumbUrl });
      return await res.json() as PecaDaArte;
    },
    onSuccess: (_updated, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setSavedApprovalThumbUrl(variables.approvalThumbUrl);
      setThumbJustSaved(true);
      setTimeout(() => setThumbJustSaved(false), 2500);
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao salvar thumb", description: mensagemDeErro(error), variant: "destructive" });
    },
  });

  const submitBulkForApprovalMutation = useMutation({
    mutationFn: async ({ itemIds, pdfUrl }: { itemIds: string[]; pdfUrl: string }) => {
      // Em lotes com concorrência limitada — evita esgotar o pool do banco
      // ao enviar muitos itens (ex: 50) de uma vez.
      await runInBatches(itemIds, itemId =>
        apiRequest("PATCH", `/api/items/${itemId}/submit-for-approval`, { approvalThumbUrl: pdfUrl })
      );
    },
    onSuccess: (_, variables) => {
      // Mesmas chaves do envio individual — a tabela da Arte lê "/api/items".
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/resubmission-needed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/pending"] });
      setShowBulkDialog(false);
      setSelectedItemIds(new Set());
      setSharedPdfUrl("");
      // MOLDE (revisão 22/09): o molde do lote não vai para o patrocinador —
      // vai direto para a Revisão Final. O toast diz para onde CADA um foi.
      const n = variables.itemIds.length;
      const moldes = variables.itemIds.filter((id) => ehMolde(itemPorId.get(id))).length;
      const comuns = n - moldes;
      toast({ variant: "success", ...(moldes === 0 ? {
        title: `${n} ${n === 1 ? "peça enviada" : "peças enviadas"} para aprovação`,
        description: `Com o mesmo PDF — ${n === 1 ? "ela saiu" : "elas saíram"} desta fila e ${n === 1 ? "está" : "estão"} em Aguardando patrocinador.`,
      } : comuns === 0 ? {
        title: `${n} ${n === 1 ? "molde enviado" : "moldes enviados"} para a Revisão Final`,
        description: `Com o mesmo PDF — molde não passa por aprovação de patrocinador nem arquivo final.`,
      } : {
        title: `${n} peças enviadas`,
        description: `Com o mesmo PDF — ${comuns} para aprovação do patrocinador e ${moldes} ${moldes === 1 ? "molde" : "moldes"} direto para a Revisão Final.`,
      }) });
    },
    onError: (error: Error) => {
      // O lote roda em batches: um erro no meio deixa parte dos itens já
      // enviada. Sem invalidar aqui, a tabela ficava stale até o WebSocket.
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/resubmission-needed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/pending"] });
      toast({
        title: "Erro ao enviar peças",
        description: mensagemDeErro(error),
        variant: "destructive",
      });
    },
  });

  const resetFinalFileState = () => {
    setFinalFileUrl(""); setFinalFileName(""); setFinalDirty(false);
  };

  const submitFinalFileMutation = useMutation({
    mutationFn: async ({ itemId, finalFileUrl, finalPreviewUrl, finalFileName, isUpdate }: { itemId: string; finalFileUrl: string; finalPreviewUrl?: string; finalFileName?: string; isUpdate?: boolean }) => {
      const res = isUpdate
        ? await apiRequest("PATCH", `/api/items/${itemId}/update-final-file`, { finalFileUrl, finalPreviewUrl, finalFileName })
        : await apiRequest("PATCH", `/api/items/${itemId}/submit-final-file`, { finalFileUrl, finalPreviewUrl, finalFileName });
      // A troca numa peça liberada devolve a peça para a Revisão Final e o
      // servidor avisa com `voltouParaRevisao` — é o que o toast precisa dizer.
      return await res.json().catch(() => null) as { voltouParaRevisao?: boolean } | null;
    },
    onSuccess: (resposta, variables) => {
      const id = itemPorId.get(variables.itemId)?.displayId;
      // Mesma próxima peça automática do envio do thumb, na fila de Finalizar
      // arte. Atualizar um arquivo que já existia (Finalizados) é conferência
      // pontual, não fila — ali o modal fecha como sempre.
      const proxima = !variables.isUpdate && selectedItemId === variables.itemId
        ? proximaDaFila(variables.itemId, "finalizar-layouts")
        : null;
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      if (proxima) {
        handleViewDetails(proxima);
      } else {
        setSelectedItemId(null);
        resetFinalFileState(); // limpa url, nome e a flag de "sujo" de uma vez
      }
      // Atualizar e enviar pela primeira vez são fatos diferentes: só o envio
      // tira a peça de "Finalizar arte". O toast antigo dizia o mesmo nos dois.
      toast({ variant: "success", ...(variables.isUpdate
        ? {
            title: id ? `Arquivo final de ${id} atualizado` : "Arquivo final atualizado",
            description: resposta?.voltouParaRevisao
              ? "A peça voltou para a Revisão Final — quem solicitou confere o arquivo novo antes da Gráfica. O anterior ficou no histórico."
              : "O caminho anterior ficou guardado no histórico da peça.",
          }
        : { title: id ? `Arquivo final de ${id} enviado` : "Arquivo final enviado", description: `Segue para a revisão de quem solicitou a peça.${proxima ? ` Abrindo a próxima: ${proxima.displayId}.` : ""}` }) });
    },
    onError: (error: Error, variables) => {
      // O 409 da troca traz a frase certa (material produzido, peça travada):
      // ela vai inteira no toast. A lista recarrega para a tela parar de
      // oferecer a troca se a peça andou enquanto o modal estava aberto.
      if (variables.isUpdate) queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({
        title: variables.isUpdate ? "Não foi possível trocar o arquivo final" : "Erro ao enviar arquivo final",
        description: mensagemDeErro(error),
        variant: "destructive",
      });
    },
  });

  const updateThumbMutation = useMutation({
    // Mesmo defeito do rascunho: apiRequest devolve Response crua, então
    // `updated.id` era sempre undefined e a miniatura, o nome do arquivo e o
    // bloco "versão anterior guardada" continuavam mostrando o thumb velho.
    // Com selectedItem derivado da lista, a invalidação abaixo já repinta o
    // modal — o .json() fica porque a mutação devolve a peça atualizada.
    // `origem`: de qual peça a arte veio, quando o thumb foi REAPROVEITADO em
    // vez de subido (Buscar arte já feita). Só muda o texto do toast — a
    // gravação é a mesma para os dois caminhos.
    // `motivo` só viaja quando a regra exige (troca depois da aprovação).
    mutationFn: async ({ itemId, approvalThumbUrl, motivo }: { itemId: string; approvalThumbUrl: string; origem?: string; motivo?: string; statusAntes?: string }) => {
      const res = await apiRequest("PATCH", `/api/items/${itemId}/update-thumb`, motivo ? { approvalThumbUrl, motivo } : { approvalThumbUrl });
      return await res.json() as PecaDaArte;
    },
    onSuccess: (dados, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"], refetchType: "none" });
      setMotivoTrocaThumb("");
      // O servidor devolve a peça aprovada para a aprovação quando algum
      // patrocinador aprova toda versão nova — o toast tem de dizer isso.
      const voltouParaAprovacao = variables.statusAntes === "sponsor_approved" && dados?.status === "awaiting_sponsor_approval";
      // Troca COM O ATENDIMENTO (24/09): o servidor avisa o Atendimento —
      // o toast diz isso, para ninguém mandar mensagem à parte.
      const comAtendimento = variables.statusAntes === "awaiting_sponsor_approval";
      const descricao = voltouParaAprovacao
        ? "Um patrocinador que aprova toda versão nova perdeu a aprovação — a peça voltou para a aprovação do Atendimento."
        : comAtendimento
        ? "O Atendimento foi avisado para apresentar a versão nova ao patrocinador. O thumb anterior ficou no histórico."
        : variables.motivo
        ? "Registrado como “trocada após aprovação”, com o seu motivo. O thumb anterior ficou no histórico."
        : "O thumb anterior ficou guardado no histórico da peça.";
      toast(variables.origem
        ? { title: `Arte de ${variables.origem} aplicada`, description: descricao, variant: "success" }
        : { title: comAtendimento ? "Thumb trocado" : "Thumb atualizado", description: descricao, variant: "success" });
    },
    onError: (error: Error) => {
      // A peça pode ter andado (liberada, foi para o patrocinador): recarrega
      // para a tela passar a mostrar o motivo em vez da ação.
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({ title: "Não foi possível trocar o thumb", description: mensagemDeErro(error), variant: "destructive" });
    },
  });

  const resubmitMutation = useMutation({
    // O CONJUNTO NÃO VIAJA MAIS (24/08, caso real: Primavera Salvador).
    //
    // O servidor deriva sozinho quem recebe o reenvio — quem ainda não
    // aprovou — e recusa qualquer conjunto diferente. A tela mandava o
    // conjunto que ELA conhecia, calculado do payload da fila; bastava a
    // realidade mudar entre a carga e o clique (a marca nova vinculada
    // depois da recusa, por exemplo) para o 409 "o servidor não aceita
    // outro conjunto" travar a peça sem saída. Mandar a resposta junto com
    // a pergunta só dava chance de a resposta estar velha.
    mutationFn: async ({ itemId, newThumbUrl }: { itemId: string; newThumbUrl: string }) => {
      return await apiRequest("POST", `/api/items/${itemId}/sponsor-approvals/resubmit`, { newThumbUrl });
    },
    onSuccess: (_res, variables) => {
      const id = correcaoItem?.id === variables.itemId ? correcaoItem?.displayId : itemPorId.get(variables.itemId)?.displayId;
      queryClient.invalidateQueries({ queryKey: ["/api/items/resubmission-needed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setCorrecaoItem(null);
      setCorrecaoThumbUrl("");
      setCorrecaoFileName("");
      toast({
        title: id ? `Nova arte de ${id} enviada` : "Nova arte enviada",
        // Quanto ainda falta na fila (rodada 4): "e agora?" depois do envio
        // era voltar à lista e contar os cards.
        description: `O Atendimento foi avisado para decidir a nova versão.${restamNaCorrecao(variables.itemId)}`,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao enviar", description: mensagemDeErro(error), variant: "destructive" });
    },
  });

  /**
   * RE-ENVIO DA PEÇA DEVOLVIDA INTEIRA.
   *
   * `sponsor-approvals/resubmit` exige `awaiting_sponsor_approval` e devolve
   * 409 em qualquer outro status. A peça devolvida inteira está em
   * `awaiting_submission` — então, mesmo com o botão liberado, aquele caminho
   * respondia erro. Quem serve este status é `submit-for-approval`, que aceita
   * `awaiting_submission`, devolve as aprovações reprovadas para `pending` e
   * reabre a peça para todos os patrocinadores dela. É o gesto certo: foi a
   * peça inteira que voltou, não a linha de um patrocinador.
   *
   * Mutação própria, e não a `submitForApprovalMutation`: aquela limpa o
   * estado do modal de ENVIO (selectedItemId/approvalThumbUrl); esta precisa
   * limpar o do modal de CORREÇÃO, senão ele fica aberto com dado velho.
   */
  const reenvioInteiroMutation = useMutation({
    mutationFn: async ({ itemId, approvalThumbUrl }: { itemId: string; approvalThumbUrl: string }) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/submit-for-approval`, { approvalThumbUrl });
    },
    onSuccess: (_res, variables) => {
      const id = correcaoItem?.id === variables.itemId ? correcaoItem?.displayId : itemPorId.get(variables.itemId)?.displayId;
      queryClient.invalidateQueries({ queryKey: ["/api/items/resubmission-needed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/pending"] });
      setCorrecaoItem(null);
      setCorrecaoThumbUrl("");
      setCorrecaoFileName("");
      toast({
        title: id ? `Nova arte de ${id} enviada` : "Nova arte enviada",
        description: `A peça voltou para a aprovação dos patrocinadores.${restamNaCorrecao(variables.itemId)}`,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao enviar", description: mensagemDeErro(error), variant: "destructive" });
    },
  });

  /** " Faltam N na Correção." sem a peça que acabou de sair — a fila inteira,
   *  não o recorte filtrado, para o número não mudar conforme o filtro. */
  const restamNaCorrecao = (saiu: string): string => {
    const n = correcaoItems.filter((i) => i.id !== saiu).length;
    return n === 0 ? " A fila da Correção zerou." : ` ${n === 1 ? "Falta 1 peça" : `Faltam ${n} peças`} na Correção.`;
  };

  const dispenseMutation = useMutation({
    mutationFn: async ({ itemId, reason }: { itemId: string; reason: string }) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/dispense`, { reason });
    },
    onSuccess: () => {
      // A rota emite `item_updated` e avisa o Atendimento — as outras telas
      // se atualizam pelo WebSocket. Aqui invalida para esta sessão não
      // depender de o socket estar de pé.
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      setDispenseItem(null);
      setDispenseReason("");
      toast({ title: "Direto para a finalização", description: "A peça pulou a aprovação do Atendimento — agora é subir o arquivo final.", variant: "success" });
    },
    onError: (error: Error) => {
      toast({ title: "Não foi possível dispensar", description: mensagemDeErro(error), variant: "destructive" });
    },
  });

  const devolverMutation = useMutation({
    mutationFn: async ({ itemId, motivo }: { itemId: string; motivo: string }) =>
      await apiRequest("PATCH", `/api/items/${itemId}/arte-reject`, { rejectionReason: motivo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      setDevolverItem(null);
      setDevolverMotivo("");
      toast({ title: "Peça devolvida", description: "Voltou para rascunho — quem a criou decide se continua ou descarta.", variant: "success" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao devolver", description: mensagemDeErro(error), variant: "destructive" });
    },
  });

  return {
    submitForApprovalMutation, saveThumbDraftMutation, submitBulkForApprovalMutation, submitFinalFileMutation,
    updateThumbMutation, resubmitMutation, reenvioInteiroMutation, dispenseMutation, devolverMutation,
  };
}
