// Hook extraído de event-detail.tsx: estado + mutations relacionadas à
// importação de planilhas Excel (com preview/revisão) e à clonagem de itens
// entre eventos. Mantém as mesmas query keys, invalidateQueries e toasts
// que existiam originalmente na página.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface EventSponsorListEntry {
  sponsorId: string;
  quota: string;
  name: string;
}

interface UseEventImportParams {
  eventId: string | undefined;
  eventSponsorsList: EventSponsorListEntry[];
  eventQuotaRules: any[];
}

export function useEventImport({ eventId, eventSponsorsList, eventQuotaRules }: UseEventImportParams) {
  const { toast } = useToast();

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<{ total: number; groups: string[] } | null>(null);
  const [importPreviewItems, setImportPreviewItems] = useState<any[] | null>(null);
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importFileName, setImportFileName] = useState<string>("");
  const [importSearch, setImportSearch] = useState("");

  // ── Preview Excel mutation (parse → show review modal) ─────────────────
  const previewXlsxMutation = useMutation({
    mutationFn: async ({ file }: { file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/events/${eventId}/preview-xlsx`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Erro ao processar arquivo");
      }
      return response.json();
    },
    onSuccess: (data: any) => {
      // Normalize text for matching (strip accents, lowercase)
      const norm = (s: string) =>
        (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').trim();

      const suggestSponsor = (item: any): string | null => {
        const descNorm = norm(item.description ?? '');
        // 1. Try to find sponsor name in description
        for (const es of eventSponsorsList) {
          const nameNorm = norm(es.name);
          if (nameNorm.length > 2 && descNorm.includes(nameNorm)) return es.sponsorId;
        }
        // 2. Fallback: quota rules → find quotas that include this item type → first matching event sponsor
        const itemTypeNorm = norm(item.type ?? '');
        const matchingQuotas = eventQuotaRules
          .filter((r: any) => (r.itemTypes ?? []).some((t: string) => norm(t) === itemTypeNorm))
          .map((r: any) => r.quota);
        for (const quota of matchingQuotas) {
          const match = eventSponsorsList.find(es => es.quota === quota);
          if (match) return match.sponsorId;
        }
        return null;
      };

      const withIds = (data.items as any[]).map((item: any, i: number) => {
        const suggested = suggestSponsor(item);
        const autoReuse = /reaproveitar/i.test(item.observations ?? '');
        // O parser já sugere os patrocinadores da peça (descrição + coluna
        // "Patrocinadores" da exportação); o palpite por cota/descrição
        // daqui só entra quando ele não achou nenhum.
        const doParser: string[] = Array.isArray(item.suggestedSponsorIds) ? item.suggestedSponsorIds : [];
        return {
          ...item,
          _id: `row-${i}`,
          suggestedSponsorIds: doParser.length > 0 ? doParser : (suggested ? [suggested] : []),
          // A coluna "Reaprov." da exportação ("Sim") vale tanto quanto a
          // palavra nas observações.
          reuse: item.reuse === true || autoReuse,
        };
      });
      setImportPreviewItems(withIds);
      setImportFileName(data.fileName || "");
      setImportSearch("");
    },
    onError: (error: any) => {
      toast({ title: "Erro ao processar planilha", description: error.message, variant: "destructive" });
    },
  });

  // ── Confirm import mutation (save reviewed items) ─────────────────────
  //
  // A GUARDA DE DUPLICATA QUE MORAVA AQUI NUNCA RODOU.
  //
  // Este ramo esperava um 409 `duplicate_detected`, e o servidor nunca o
  // manda: `confirm-import` lê `{ items, fileName }` e mais nada — o `force`
  // viajava no corpo e era ignorado. Uma guarda que não roda é pior que
  // guarda nenhuma, porque ocupa o lugar dela: enquanto o código dizia que a
  // reimportação estava coberta, reimportar a mesma planilha duplicava o
  // evento inteiro em silêncio.
  //
  // A detecção passou para o PREVIEW, no diálogo — antes de importar, contra
  // as peças que o evento já tem, e dizendo QUAIS se repetem. Ver
  // `chaveDaPeca` em components/import-xlsx-dialog.tsx.
  const confirmImportMutation = useMutation({
    mutationFn: async ({ items, fileName }: { items: any[]; fileName: string }) => {
      const response = await apiRequest("POST", `/api/events/${eventId}/confirm-import`, { items, fileName });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Erro ao importar");
      }
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setImportDialogOpen(false);
      setImportPreviewItems(null);
      setImportFile(null);
      setImportFileName("");
      setImportSearch("");
      toast({ title: `${data.imported} peças importadas com sucesso`, description: "Os itens foram adicionados ao evento." });
    },
    onError: (error: any) => {
      toast({ title: "Erro na importação", description: error.message, variant: "destructive" });
    },
  });

  return {
    importDialogOpen,
    setImportDialogOpen,
    importFile,
    setImportFile,
    importPreview,
    setImportPreview,
    importPreviewItems,
    setImportPreviewItems,
    importPreviewOpen,
    setImportPreviewOpen,
    importFileName,
    setImportFileName,
    importSearch,
    setImportSearch,
    previewXlsxMutation,
    confirmImportMutation,
  };
}

interface UseEventCloneParams {
  eventId: string | undefined;
}

export function useEventClone({ eventId }: UseEventCloneParams) {
  const { toast } = useToast();

  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [cloneSourceId, setCloneSourceId] = useState<string>("");

  // ── Clone items mutation ───────────────────────────────────────────────
  const cloneItemsMutation = useMutation({
    // `itemIds` é a seleção do dialog (01/09); sem ela o servidor clona tudo,
    // que é o que o fluxo de criar-evento-clonando continua fazendo.
    mutationFn: async ({ sourceEventId, itemIds }: { sourceEventId: string; itemIds?: string[] }) => {
      const response = await apiRequest("POST", `/api/events/${eventId}/clone-items`, { sourceEventId, itemIds });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Erro ao clonar");
      }
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setCloneDialogOpen(false);
      setCloneSourceId("");
      toast({
        title: `${data.cloned} peças clonadas com sucesso`,
        description: "Os itens foram copiados para este evento.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao clonar", description: error.message, variant: "destructive" });
    },
  });

  return {
    cloneDialogOpen,
    setCloneDialogOpen,
    cloneSourceId,
    setCloneSourceId,
    cloneItemsMutation,
  };
}
