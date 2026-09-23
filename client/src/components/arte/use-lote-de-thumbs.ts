// ─────────────────────────────────────────────────────────────────────────────
// ENVIO DE THUMBS EM LOTE: os arquivos soltos no modal, o vínculo arquivo ×
// peça (pelo número no nome do arquivo) e o envio, com concorrência limitada.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { useToast } from "@/hooks/use-toast";
import type { useConfirmar } from "@/components/ui/usar-confirmar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { erroDeTamanhoDoUpload, matchFileToItem } from "@/lib/arte-rules";
import { runInBatches } from "@/lib/utils";
import { ehMolde } from "@shared/molde";
import { mensagemDeErro } from "./constantes";
import type { BulkThumbEntry, PecaDaArte, PecaDaCorrecao } from "./tipos";

export type LoteDeThumbs = ReturnType<typeof useLoteDeThumbs>;

export function useLoteDeThumbs({ allItems, correcaoItems, podeEditar, toast, confirmar, uploadFileRaw }: {
  allItems: PecaDaArte[];
  correcaoItems: PecaDaCorrecao[];
  podeEditar: boolean;
  toast: ReturnType<typeof useToast>["toast"];
  confirmar: ReturnType<typeof useConfirmar>["confirmar"];
  uploadFileRaw: (file: File) => Promise<string>;
}) {
  const [isDragOverBulk, setIsDragOverBulk] = useState(false);
  const [showBulkThumbModal, setShowBulkThumbModal] = useState(false);
  const [bulkThumbEntries, setBulkThumbEntries] = useState<BulkThumbEntry[]>([]);
  const [bulkThumbRunning, setBulkThumbRunning] = useState(false);
  // Progresso global do lote: 60 imagens uma a uma levam minutos e o único
  // sinal era o estado de cada card, que some da vista ao rolar a lista.
  const [bulkThumbProgress, setBulkThumbProgress] = useState({ feitos: 0, total: 0 });
  const [bulkThumbEventFilter, setBulkThumbEventFilter] = useState<string>("all");
  const [bulkThumbLinkOpenMap, setBulkThumbLinkOpenMap] = useState<Record<string, boolean>>({});
  // Peças que podem receber thumb no multi-upload: aguardando envio OU em
  // correção, deduplicadas e respeitando o filtro de evento do modal.
  // Calculado uma vez — antes era refeito dentro do .map de cada card E o
  // auto-match usava um pool diferente (sem correção e ignorando o filtro).
  // Pool SEM o filtro de evento — alimenta o seletor de evento do modal com
  // contagem real (o seletor listava todos os eventos do sistema, e o usuário
  // só descobria que o evento não tinha peça depois de escolhê-lo).
  const bulkThumbBasePool = useMemo(() => {
    const seen = new Set<string>();
    // Conjunto, e não `correcaoItems.some` por peça: eram ~5 mil varreduras da
    // fila de correção a cada atualização da lista.
    const emCorrecao = new Set<string>(correcaoItems.map((c) => c.id));
    return [...allItems, ...correcaoItems].filter((i) => {
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      return i.status === 'awaiting_submission' || emCorrecao.has(i.id);
    });
  }, [allItems, correcaoItems]);

  const bulkPendingPool = useMemo(
    () => bulkThumbEventFilter === "all"
      ? bulkThumbBasePool
      : bulkThumbBasePool.filter((i) => i.eventId === bulkThumbEventFilter),
    [bulkThumbBasePool, bulkThumbEventFilter],
  );

  // Mesma disciplina do bookEventOptions: só eventos que têm peça pronta para
  // receber thumb, com a contagem ao lado do nome.
  const bulkThumbEventOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    bulkThumbBasePool.forEach((i) => {
      if (!i.eventId) return;
      const cur = map.get(i.eventId);
      if (cur) cur.count++;
      else map.set(i.eventId, { value: i.eventId, label: i.event?.name || "Sem evento", count: 1 });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [bulkThumbBasePool]);

  const handleBulkThumbFilesAdded = useCallback((files: FileList | File[]) => {
    // Aceita por MIME OU por extensão (alguns navegadores devolvem type vazio).
    const isImage = (f: File) =>
      f.type.startsWith("image/") || /\.(jpe?g|png|gif|webp|svg|bmp|tiff?)$/i.test(f.name);
    const arr = Array.from(files).filter(isImage);
    if (!arr.length) return;
    // Peça já casada (em card anterior ou nesta leva) sai do pool — dois
    // arquivos com o mesmo número não podem apontar para a mesma peça.
    const taken = new Set(
      bulkThumbEntries.filter(e => e.matchedItemId).map(e => e.matchedItemId as string)
    );
    const newEntries: BulkThumbEntry[] = arr.map(file => {
      const { item: matched, ambiguous } = matchFileToItem(file.name, bulkPendingPool, taken);
      if (matched) taken.add(matched.id);
      // Acima do limite do servidor o cartão já nasce com o erro escrito — não
      // entra no envio para falhar minutos depois.
      const grandeDemais = erroDeTamanhoDoUpload(file);
      return {
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        preview: URL.createObjectURL(file),
        matchedItemId: matched?.id ?? null,
        ambiguous: !!matched && ambiguous,
        status: grandeDemais ? 'error' as const : 'pending' as const,
        errorMsg: grandeDemais ?? undefined,
      };
    });
    setBulkThumbEntries(prev => [...prev, ...newEntries]);
    setShowBulkThumbModal(true);
  }, [bulkPendingPool, bulkThumbEntries]);

  // Núcleo do upload em lote de thumbs. Se send=true, envia para aprovação
  // (/submit-for-approval, muda status). Se send=false, só salva o thumb no
  // item (PATCH /api/items/:id, mantém status awaiting_submission = rascunho).
  // PRÓXIMO PASSO (21/09), deliberadamente FORA desta rodada: sugerir aqui,
  // por peça, uma arte já feita ("Buscar arte já feita" individual existe no
  // modal da peça). Ficou de fora porque o lote casa ARQUIVO × peça pelo nome
  // do arquivo (matchFileToItem) e a sugestão automática casaria peça × arte
  // sem arquivo nenhum — dois vínculos diferentes na mesma tela, cada um com
  // seu jeito de errar. Fazer só com o desenho de conferência em pé.
  // "Tentar de novo" num cartão com erro refaz SÓ aquele envio, no mesmo modo
  // (enviar ou rascunho) do lote que falhou — antes era remover e adicionar a
  // imagem de novo, e o vínculo feito à mão se perdia junto.
  const bulkUltimoModoRef = useRef(true);
  const runBulkThumb = useCallback(async (send: boolean, soEstes?: string[]) => {
    if (!podeEditar) return; // gate de papel: nem sobe arquivo para tomar 403 depois
    const toProcess = bulkThumbEntries.filter(e => e.matchedItemId && (soEstes
      ? soEstes.includes(e.id) && e.status === 'error'
      : e.status === 'pending'));
    if (!toProcess.length) return;
    bulkUltimoModoRef.current = send;
    setBulkThumbRunning(true);
    setBulkThumbProgress({ feitos: 0, total: toProcess.length });
    let enviados = 0, enviadosMolde = 0, salvos = 0, reenviados = 0, falhas = 0;

    const processar = async (entry: BulkThumbEntry) => {
      setBulkThumbEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'uploading', errorMsg: undefined } : e));
      try {
        const localPath = await uploadFileRaw(entry.file);
        // "Enviar para aprovação" só vale para peças aguardando envio. Para as
        // demais (ex.: em correção) o thumb é apenas salvo — antes a tela tentava
        // enviar mesmo assim e o servidor recusava com erro de status.
        const alvo = [...allItems, ...correcaoItems].find((i) => i.id === entry.matchedItemId);
        const podeEnviar = send && alvo?.status === 'awaiting_submission';
        // Peça em correção usa o fluxo formal de reenvio: o PATCH genérico
        // trocava a arte em avaliação sem resetar as aprovações recusadas
        // nem notificar o Atendimento.
        const emCorrecao = correcaoItems.find((c) => c.id === entry.matchedItemId);
        if (podeEnviar) {
          await apiRequest("PATCH", `/api/items/${entry.matchedItemId}/submit-for-approval`, { approvalThumbUrl: localPath });
          // Molde vai direto para a Revisão Final — o toast não pode dizer "aprovação".
          if (ehMolde(alvo)) enviadosMolde++; else enviados++;
        } else if (emCorrecao) {
          // Sem conjunto — o servidor deriva (ver resubmitMutation). Este
          // caminho mandava SÓ as linhas recusadas (awaitingArteApprovals):
          // com qualquer outro patrocinador ainda pendente na peça, o
          // conjunto nunca batia e o reenvio em lote falhava sempre.
          await apiRequest("POST", `/api/items/${entry.matchedItemId}/sponsor-approvals/resubmit`, {
            newThumbUrl: localPath,
          });
          reenviados++;
        } else {
          await apiRequest("PATCH", `/api/items/${entry.matchedItemId}`, { approvalThumbUrl: localPath });
          salvos++;
        }
        setBulkThumbEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'done' } : e));
      } catch (err) {
        falhas++;
        setBulkThumbEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'error', errorMsg: mensagemDeErro(err) } : e));
      } finally {
        setBulkThumbProgress(p => ({ ...p, feitos: p.feitos + 1 }));
      }
    };

    // Concorrência 3 (e não os 5 do envio de PDF): cada imagem sobe pelo proxy
    // do servidor, que tem limite de 50MB por requisição — subir demais em
    // paralelo troca minutos de espera por falhas de memória. O try/catch mora
    // DENTRO da tarefa, então nenhum erro derruba o lote inteiro.
    await runInBatches(toProcess, processar, 3);

    setBulkThumbRunning(false);
    queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    queryClient.invalidateQueries({ queryKey: ["/api/items/pending"] });
    queryClient.invalidateQueries({ queryKey: ["/api/items/resubmission-needed"] });
    const p = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
    const partes = [
      enviados ? p(enviados, "enviado para aprovação", "enviados para aprovação") : "",
      enviadosMolde ? p(enviadosMolde, "molde enviado para a Revisão Final", "moldes enviados para a Revisão Final") : "",
      reenviados ? p(reenviados, "reenviado da Correção", "reenviados da Correção") : "",
      salvos ? p(salvos, "thumb salvo como rascunho", "thumbs salvos como rascunho") : "",
    ].filter(Boolean).join(" · ");
    // As FALHAS entram no toast. Ele dizia "concluído" mesmo com cards em
    // erro lá embaixo da lista, fora da vista — e quem fechava o modal
    // confiando no aviso perdia as imagens que não subiram.
    toast(falhas > 0
      ? { title: `${p(falhas, "imagem não subiu", "imagens não subiram")}`, description: `${partes ? `${partes}. ` : ""}As que falharam ficam na lista com o motivo — “Tentar de novo” no cartão reenvia só aquela.`, variant: "destructive" }
      : { title: "Envio em lote concluído", description: partes || "Nada a processar", variant: "success" });
  }, [bulkThumbEntries, uploadFileRaw, allItems, correcaoItems, podeEditar, mensagemDeErro, toast]);

  const handleBulkThumbUpload = useCallback(() => runBulkThumb(true), [runBulkThumb]);
  const tentarDeNovoNoLote = useCallback((entryId: string) => runBulkThumb(bulkUltimoModoRef.current, [entryId]), [runBulkThumb]);
  const handleBulkThumbSaveDraft = useCallback(() => runBulkThumb(false), [runBulkThumb]);

  // Trabalho que se perde ao fechar: arquivos ainda não processados.
  const bulkThumbPendentes = bulkThumbEntries.filter(e => e.status === 'pending').length;

  // Fecha o multi-upload liberando os object URLs dos previews — cada
  // URL.createObjectURL segura o blob na memória até o revoke.
  const closeBulkThumbModal = useCallback(async (forcar = false) => {
    if (bulkThumbRunning) {
      // Fechar no meio do lote deixaria uploads órfãos — avisa em vez de
      // ignorar o clique em silêncio.
      toast({ title: "Aguarde o envio terminar", description: "O envio em lote ainda está em andamento.", variant: "warning" });
      return;
    }
    // 40 imagens vinculadas e conferidas sumiam com um clique no overlay. A
    // proteção já existia para o envio em andamento e tinha ficado pela metade.
    const pendentes = bulkThumbEntries.filter(e => e.status === 'pending').length;
    if (!forcar && pendentes > 0) {
      const ok = await confirmar({
        titulo: "Descartar as imagens não enviadas?",
        descricao: `${pendentes} ${pendentes === 1 ? 'imagem ainda não foi enviada' : 'imagens ainda não foram enviadas'}. Fechar descarta ${pendentes === 1 ? 'essa imagem' : 'essas imagens'} e os vínculos feitos.`,
        confirmar: "Descartar",
        cancelar: "Continuar no lote",
        perigo: true,
      });
      if (!ok) return;
    }
    setBulkThumbEntries(prev => {
      prev.forEach(e => URL.revokeObjectURL(e.preview));
      return [];
    });
    setShowBulkThumbModal(false);
    setBulkThumbEventFilter("all");
    // O mapa de popovers abertos crescia uma chave por card e nunca era zerado.
    setBulkThumbLinkOpenMap({});
    setBulkThumbProgress({ feitos: 0, total: 0 });
  }, [bulkThumbRunning, bulkThumbEntries, toast, confirmar]);

  // Sair da tela por navegação com o modal aberto segurava os blobs dos
  // previews até o refresh — os revokes existiam no fechar, no remover e no
  // limpar concluídos, mas não no desmonte.
  const bulkThumbEntriesRef = useRef(bulkThumbEntries);
  bulkThumbEntriesRef.current = bulkThumbEntries;
  useEffect(() => () => {
    bulkThumbEntriesRef.current.forEach(e => URL.revokeObjectURL(e.preview));
  }, []);

  return {
    showBulkThumbModal, isDragOverBulk, setIsDragOverBulk,
    bulkThumbEntries, setBulkThumbEntries, bulkThumbRunning, bulkThumbProgress,
    bulkThumbEventFilter, setBulkThumbEventFilter, bulkThumbLinkOpenMap, setBulkThumbLinkOpenMap,
    bulkPendingPool, bulkThumbEventOptions, bulkThumbPendentes,
    handleBulkThumbFilesAdded, handleBulkThumbUpload, handleBulkThumbSaveDraft, tentarDeNovoNoLote, closeBulkThumbModal,
  };
}
