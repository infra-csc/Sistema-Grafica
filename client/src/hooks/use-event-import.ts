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
  const [importDuplicateWarning, setImportDuplicateWarning] = useState<{ duplicateCount: number; totalCount: number } | null>(null);

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
      const norm = (s: string) =>
        (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').trim();

      const suggestSponsor = (item: any): string | null => {
        const descNorm = norm(item.description ?? '');
        for (const es of eventSponsorsList) {
          const nameNorm = norm(es.name);
          if (nameNorm.length > 2 && descNorm.includes(nameNorm)) return es.sponsorId;
        }
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
        return {
          ...item,
          _id: `row-${i}`,
          suggestedSponsorIds: suggested ? [suggested] : [],
          reuse: autoReuse,
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

  // ── Confirm import mutation (save reviewed items) — with duplicate guard ──
  const confirmImportMutation = useMutation({
    mutationFn: async ({ items, fileName, force }: { items: any[]; fileName: string; force?: boolean }) => {
      const response = await apiRequest("POST", `/api/events/${eventId}/confirm-import`, { items, fileName, force });
      if (!response.ok) {
        const err = await response.json();
        if (response.status === 409 && err.error === "duplicate_detected") {
          const dupErr: any = new Error(err.message);
          dupErr.isDuplicate = true;
          dupErr.duplicateCount = err.duplicateCount;
          dupErr.totalCount = err.totalCount;
          throw dupErr;
        }
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
      setImportDuplicateWarning(null);
      toast({ title: `${data.imported} peças importadas com sucesso`, description: "Os itens foram adicionados ao evento." });
    },
    onError: (error: any) => {
      if (error.isDuplicate) {
        setImportDuplicateWarning({ duplicateCount: error.duplicateCount, totalCount: error.totalCount });
      } else {
        toast({ title: "Erro na importação", description: error.message, variant: "destructive" });
      }
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
    importDuplicateWarning,
    setImportDuplicateWarning,
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

  const cloneItemsMutation = useMutation({
    mutationFn: async ({ sourceEventId }: { sourceEventId: string }) => {
      const response = await apiRequest("POST", `/api/events/${eventId}/clone-items`, { sourceEventId });
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
