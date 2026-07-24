import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, ArrowLeft, Calendar, Truck, AlertCircle, List, Package, Package2, Pencil, Trash2, Check, ChevronsUpDown, Building2, Loader2, User, History, Lock, Paperclip, ExternalLink, X, RotateCcw, Upload, Copy, ChevronDown, CheckCircle2, AlertTriangle, FileSpreadsheet, Search } from "lucide-react";
import { Fragment, useState, useEffect } from "react";
import type { Sponsor } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { BulkItemEntry } from "@/components/bulk-item-entry";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth-context";
import { cn, parseDateLocal } from "@/lib/utils";
import { calculateM2 } from "@/lib/calculateM2";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CommentsSection } from "@/components/comments-section";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import { ImportXlsxDialog, ImportPreviewRow } from "@/components/import-xlsx-dialog";
import { CloneItemsDialog } from "@/components/clone-items-dialog";
import { useEventImport, useEventClone } from "@/hooks/use-event-import";
import { useEventReference } from "@/hooks/use-event-reference";
import { useEventItemFlags } from "@/hooks/use-event-item-flags";

const itemTypes = ["2x1", "Arena", "Halter", "Palco", "Painel Rosto", "Percurso", "Pórtico", "Prismas", "Qd Fotos", "Rolo", "Stand", "Testeiras", "WindBanner"];
const materials = ["Adesivo", "Lona", "Madeira", "Sanett", "Tecido", "Tecido Pet"];
const finishes = ["Dupla Face", "Ilhós", "Impressão UV", "Impresso", "Recorte", "Refile"];

export default function EventDetail() {
  const { hasPermission, user } = useAuth();
  const [, params] = useRoute("/eventos/:id");
  const eventId = params?.id;
  const [open, setOpen] = useState(false);
  const [localRefPreview, setLocalRefPreview] = useState<string>("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState(true);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [typePopoverOpen, setTypePopoverOpen] = useState(false);
  const [materialPopoverOpen, setMaterialPopoverOpen] = useState(false);
  const [finishPopoverOpen, setFinishPopoverOpen] = useState(false);
  const [customTypeInput, setCustomTypeInput] = useState("");
  const [editingTypeName, setEditingTypeName] = useState(false);
  const [customMaterialInput, setCustomMaterialInput] = useState("");
  const [customFinishInput, setCustomFinishInput] = useState("");
  const [linkItemsDialogOpen, setLinkItemsDialogOpen] = useState(false);
  const [selectedSponsorForLinking, setSelectedSponsorForLinking] = useState<Sponsor | null>(null);
  const [selectedItemsToLink, setSelectedItemsToLink] = useState<string[]>([]);
  const [itemSponsorsMap, setItemSponsorsMap] = useState<Record<string, string[]>>({});
  const [selectedItemForDetails, setSelectedItemForDetails] = useState<any | null>(null);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    type: "",
    description: "",
    quantity: 1,
    visualWidth: "",
    visualHeight: "",
    fileWidth: "",
    fileHeight: "",
    material: "",
    finish: "",
    measurement: "",
    observations: "",
    sponsorId: "",
    skipApproval: false,
    isReuse: false,
    referenceUrl: "",
  });

  const { data: event, isLoading: loadingEvent, isError: eventError, refetch: refetchEvent } = useQuery<any>({
    queryKey: ["/api/events", eventId],
    enabled: !!eventId,
    placeholderData: (previousData: any) => previousData,
    refetchOnWindowFocus: false,
  });

  const { data: rawItems = [], isLoading: loadingItems, isFetching } = useQuery<any[]>({
    queryKey: ["/api/items", eventId],
    enabled: !!eventId,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
  });

  // Ordenar itens por displayId (grupo é tratado pelo groupMap; dentro de cada tipo, ordem pelo id)
  const items = [...rawItems].sort((a, b) => {
    const idA = parseInt(String(a.displayId || '0').replace(/\D/g, '')) || 0;
    const idB = parseInt(String(b.displayId || '0').replace(/\D/g, '')) || 0;
    return idA - idB;
  });

  const { data: standardItems = [] } = useQuery<any[]>({
    queryKey: ["/api/standard-items"],
    placeholderData: (previousData: any) => previousData,
    refetchOnWindowFocus: false,
  });

  const { data: catalogOptions = [] } = useQuery<{ kind: string; value: string }[]>({
    queryKey: ["/api/catalog-options"],
  });

  const createCatalogOptionMutation = useMutation({
    mutationFn: async ({ kind, value }: { kind: string; value: string }) =>
      await apiRequest("POST", "/api/catalog-options", { kind, value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/catalog-options"] }),
  });

  // Buscar patrocinadores vinculados ao evento
  const { data: eventSponsors = [] } = useQuery<any[]>({
    queryKey: ["/api/events", eventId, "sponsors"],
    enabled: !!eventId,
    placeholderData: (previousData: any) => previousData,
    refetchOnWindowFocus: false,
  });

  // Buscar todos os patrocinadores para obter os detalhes
  const { data: allSponsors = [] } = useQuery<Sponsor[]>({
    queryKey: ["/api/sponsors"],
    placeholderData: (previousData: any) => previousData,
    refetchOnWindowFocus: false,
  });

  // Filtrar apenas os patrocinadores vinculados ao evento
  const sponsors = allSponsors.filter(sponsor => 
    eventSponsors.some(es => es.sponsorId === sponsor.id)
  );

  // Cotas configuradas para este evento (usadas na sugestão de patrocinador na importação)
  const { data: eventQuotaRules = [] } = useQuery<any[]>({
    queryKey: ["/api/events", eventId, "quota-rules"],
    queryFn: () => fetch(`/api/events/${eventId}/quota-rules`).then(r => r.json()),
    enabled: !!eventId,
  });

  // Lista enriquecida: eventSponsors + nome do patrocinador (para sugestão na importação)
  const eventSponsorsList = eventSponsors.map((es: any) => ({
    sponsorId: es.sponsorId,
    quota: es.quota,
    name: allSponsors.find((s: any) => s.id === es.sponsorId)?.name ?? '',
  })).filter(es => es.name);

  // Estado e mutations de importação de Excel (extraído para @/hooks/use-event-import)
  const {
    importDialogOpen,
    setImportDialogOpen,
    importFile,
    setImportFile,
    importPreview,
    setImportPreview,
    importPreviewItems,
    setImportPreviewItems,
    importFileName,
    importSearch,
    setImportSearch,
    previewXlsxMutation,
    confirmImportMutation,
    importDuplicateWarning,
    setImportDuplicateWarning,
  } = useEventImport({ eventId, eventSponsorsList, eventQuotaRules });

  // Estado e mutation de clonagem de itens entre eventos (extraído para @/hooks/use-event-import)
  const {
    cloneDialogOpen,
    setCloneDialogOpen,
    cloneSourceId,
    setCloneSourceId,
    cloneItemsMutation,
  } = useEventClone({ eventId });

  // Buscar todos os eventos (para seletor de clone)
  const { data: allEvents = [] } = useQuery<any[]>({
    queryKey: ["/api/events"],
    placeholderData: (previousData: any) => previousData,
    refetchOnWindowFocus: false,
  });

  // Buscar audit logs para histórico
  const { data: auditLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/audit-logs"],
    placeholderData: (previousData: any) => previousData,
    refetchOnWindowFocus: false,
  });

  // Helper para formatar data/hora
  const formatDateTime = (date: string | Date) => {
    return format(new Date(date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  // Helper para filtrar logs de um item específico
  const getItemLogs = (itemId: string) => {
    return auditLogs
      .filter((log: any) => log.entityType === 'item' && log.entityId === itemId)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  };

  // Check if user can manage this event (admin or event creator)
  const canManageEvent = hasPermission("admin") || (event && user && event.createdBy === user.id);

  // Solicitação ou admin podem adicionar referência
  const canUploadReference = hasPermission("admin") || user?.role === "solicitacao";

  // Quem cria a lista (solicitação, admin ou criador do evento) sempre pode
  // editar uma peça, mesmo depois que ela entra em produção/entrega.
  const canEditLists = hasPermission("admin") || user?.role === "solicitacao" || !!(event && user && event.createdBy === user.id);

  const getUploadUrl = async () => {
    const response = await apiRequest("POST", "/api/objects/upload", {});
    const data = await response.json();
    return { method: "PUT" as const, url: data.uploadURL };
  };

  // Ctrl+V: colar um print direto na referência ao editar a peça. Envia o
  // arquivo original, sem compressão, mantendo a qualidade da imagem.
  useEffect(() => {
    if (!editDialogOpen) return;
    const handler = async (e: ClipboardEvent) => {
      const imgItem = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith("image/"));
      if (!imgItem) return;
      const file = imgItem.getAsFile();
      if (!file) return;
      e.preventDefault();
      const reader = new FileReader();
      reader.onload = ev => setLocalRefPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
      try {
        const { url } = await getUploadUrl();
        const put = await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
        if (!put.ok) throw new Error("upload falhou");
        const objectUrl = url.split("?")[0];
        setFormData(f => ({ ...f, referenceUrl: objectUrl }));
        setLocalRefPreview("");
        toast({ title: "Print anexado", description: "Imagem colada como referência em alta qualidade." });
      } catch {
        setLocalRefPreview("");
        toast({ title: "Erro ao colar imagem", description: "Não foi possível anexar o print.", variant: "destructive" });
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [editDialogOpen]);

  const { updateReferenceUrlMutation, removeReferenceUrlMutation } = useEventReference({ eventId });

  const createItemMutation = useMutation({
    mutationFn: async (data: any) => {
      const fileWidth = parseFloat(data.fileWidth);
      const fileHeight = parseFloat(data.fileHeight);
      
      const calculatedM2 = calculateM2(
        data.quantity,
        fileWidth,
        fileHeight
      ).toFixed(2);
      
      const itemData: any = {
        ...data,
        eventId,
        area: parseFloat(data.visualWidth),
        visual: parseFloat(data.visualHeight),
        calculatedM2,
        measurement: data.measurement || `${fileWidth} × ${fileHeight}`,
        skipApproval: data.skipApproval || false,
        isReuse: data.isReuse || false,
      };
      
      // Remover campos que não devem ir para o backend
      delete itemData.sponsorId;
      
      // Criar item
      const response = await apiRequest("POST", "/api/items", itemData);
      const createdItem = await response.json();
      
      return createdItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setOpen(false);
      setFormData({
        type: "",
        description: "",
        quantity: 1,
        visualWidth: "",
        visualHeight: "",
        fileWidth: "",
        fileHeight: "",
        material: "",
        finish: "",
        measurement: "",
        observations: "",
        sponsorId: "",
        skipApproval: false,
      });
      toast({
        title: "Peça adicionada",
        description: "A peça foi adicionada ao evento",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao adicionar peça",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createBulkItemsMutation = useMutation({
    mutationFn: async (items: any[]) => {
      const response = await apiRequest("POST", "/api/items/bulk", { items });
      return await response.json();
    },
    onMutate: async (newItems: any[]) => {
      // Cancelar queries pendentes para evitar sobrescrever nosso optimistic update
      await queryClient.cancelQueries({ queryKey: ["/api/items", eventId] });
      
      // Snapshot dos dados atuais (para rollback em caso de erro)
      const previousItems = queryClient.getQueryData(["/api/items", eventId]);
      
      // Optimistically update: adicionar os novos itens IMEDIATAMENTE no cache
      queryClient.setQueryData(["/api/items", eventId], (old: any[] = []) => {
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
    onSuccess: (data: any) => {
      const quantidade = Array.isArray(data) ? data.length : 0;
      
      toast({
        title: "✅ Peças salvas com sucesso!",
        description: `${quantidade} ${quantidade === 1 ? 'peça adicionada' : 'peças adicionadas'}`,
      });
      
      // Atualizar com dados reais do servidor (substitui os temporários)
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      
      // NÃO FECHA O DIALOG - deixa usuário fechar quando quiser
      // Assim não causa re-fetches múltiplos e não fica tela branca
    },
    onError: (error: any, newItems: any, context: any) => {
      // Se der erro, reverter para dados anteriores
      if (context?.previousItems) {
        queryClient.setQueryData(["/api/items", eventId], context.previousItems);
      }
      
      toast({
        title: "Erro ao adicionar peças",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      // Campo decimal vazio não pode virar "" (Postgres: invalid input syntax
      // for type numeric). Coage vazio/invalido para null; mantém como string.
      const toNumStr = (v: any): string | null => {
        const s = String(v ?? "").trim().replace(",", ".");
        if (s === "") return null;
        const n = parseFloat(s);
        return isNaN(n) ? null : s;
      };
      const toNum = (v: any): number | null => {
        const s = String(v ?? "").trim().replace(",", ".");
        if (s === "") return null;
        const n = parseFloat(s);
        return isNaN(n) ? null : n;
      };

      const fw = toNum(data.fileWidth);
      const fh = toNum(data.fileHeight);
      const calculatedM2 = (fw !== null && fh !== null)
        ? calculateM2(data.quantity, fw, fh).toFixed(2)
        : null;

      const itemData: any = {
        ...data,
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

      // Remover sponsorId se estiver vazio
      if (!data.sponsorId) {
        delete itemData.sponsorId;
      }

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
        (standardItems as any[]).some(s => (kind === "material" ? s.material : s.finish)?.toLowerCase() === v.toLowerCase());
      const criados: string[] = [];
      if (mat && !materials.some(m => m.toLowerCase() === mat.toLowerCase()) && !has("material", mat)) {
        createCatalogOptionMutation.mutate({ kind: "material", value: mat });
        criados.push(`material "${mat}"`);
      }
      if (fin && !finishes.some(f => f.toLowerCase() === fin.toLowerCase()) && !has("finish", fin)) {
        createCatalogOptionMutation.mutate({ kind: "finish", value: fin });
        criados.push(`acabamento "${fin}"`);
      }

      setEditingItem(null);
      setOpen(false);
      setEditDialogOpen(false);
      setBulkMode(false);
      toast({
        title: "Peça atualizada",
        description: criados.length
          ? `Peça salva. Novo ${criados.join(" e ")} cadastrado no catálogo.`
          : "A peça foi atualizada com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar peça",
        description: error.message,
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
      setDeletingItemId(null);
      toast({
        title: "Peça excluída",
        description: "A peça foi excluída com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir peça",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const submitDraftsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/events/${eventId}/items/submit`);
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({
        title: "Peças enviadas com sucesso",
        description: `${data.count} ${data.count === 1 ? 'peça foi enviada' : 'peças foram enviadas'} para vinculação de patrocinadores`,
      });
    },
    onError: (error: any) => {
      const message = error.message || "Erro desconhecido";
      
      if (message.includes("Nenhum item em rascunho")) {
        toast({
          title: "Nenhuma peça para enviar",
          description: "Não há peças em rascunho neste evento",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro ao enviar peças",
          description: message,
          variant: "destructive",
        });
      }
    },
  });

  const linkItemsToSponsorMutation = useMutation({
    mutationFn: async ({ itemIds, sponsorId }: { itemIds: string[], sponsorId: string }) => {
      const operations = itemIds.map((id) =>
        apiRequest("PATCH", `/api/items/${id}`, { 
          sponsorId: sponsorId === "" ? null : sponsorId 
        })
      );
      await Promise.all(operations);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      setLinkItemsDialogOpen(false);
      setSelectedItemsToLink([]);
      setSelectedSponsorForLinking(null);
      
      const isUnlinking = variables.sponsorId === "";
      toast({
        title: isUnlinking ? "Peças desvinculadas" : "Peças vinculadas",
        description: isUnlinking 
          ? `${variables.itemIds.length} ${variables.itemIds.length === 1 ? 'peça desvinculada' : 'peças desvinculadas'} com sucesso`
          : `${variables.itemIds.length} ${variables.itemIds.length === 1 ? 'peça vinculada' : 'peças vinculadas'} ao patrocinador com sucesso`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao processar peças",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para sincronizar patrocinadores de um item específico
  const syncItemSponsorsMutation = useMutation({
    mutationFn: async ({ itemId, sponsorIds }: { itemId: string, sponsorIds: string[] }) => {
      await apiRequest("POST", `/api/items/${itemId}/sponsors/sync`, { sponsorIds });
    },
    onMutate: async ({ itemId, sponsorIds }) => {
      // Atualização otimista para UI responsiva
      setItemSponsorsMap(prev => ({
        ...prev,
        [itemId]: sponsorIds
      }));
    },
    onSuccess: async (_, { itemId }) => {
      // Recarregar sponsors do servidor para garantir sincronização
      try {
        const response = await apiRequest("GET", `/api/items/${itemId}/sponsors`);
        const itemSponsors = await response.json();
        const sponsorIds = itemSponsors.map((is: any) => is.sponsorId);
        
        setItemSponsorsMap(prev => ({
          ...prev,
          [itemId]: sponsorIds
        }));
      } catch (error) {
        console.error(`Erro ao recarregar sponsors do item ${itemId}:`, error);
      }
      
      // Invalidar queries relacionadas
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar patrocinadores",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { updateItemSkipApprovalMutation, updateItemIsReuseMutation } = useEventItemFlags({ eventId });

  // Carregar patrocinadores de todos os items em rascunho
  useEffect(() => {
    const requestedItems = items.filter(item => item.status === 'requested');
    
    // Apenas carregar para items que ainda não temos no map
    const itemsToLoad = requestedItems.filter(item => !itemSponsorsMap[item.id]);
    
    if (itemsToLoad.length > 0) {
      Promise.all(
        itemsToLoad.map(async (item) => {
          try {
            const response = await apiRequest("GET", `/api/items/${item.id}/sponsors`);
            const itemSponsors = await response.json();
            const sponsorIds = itemSponsors.map((is: any) => is.sponsorId);
            return { itemId: item.id, sponsorIds };
          } catch (error) {
            console.error(`Erro ao carregar patrocinadores do item ${item.id}:`, error);
            return { itemId: item.id, sponsorIds: [] };
          }
        })
      ).then(results => {
        const newMap = results.reduce((acc, { itemId, sponsorIds }) => ({
          ...acc,
          [itemId]: sponsorIds
        }), {});
        
        setItemSponsorsMap(prev => ({ ...prev, ...newMap }));
      });
    }
  }, [items, itemSponsorsMap]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) {
      updateItemMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createItemMutation.mutate(formData);
    }
  };

  const BLOCKED_EDIT_STATUSES = ["ready_for_production", "inProduction", "produced", "delivered", "pronto_para_producao", "liberado", "em_producao", "produzido", "entregue"];
  const isEditBlocked = (status: string) => BLOCKED_EDIT_STATUSES.includes(status) && !canEditLists;

  const handleEditItem = (item: any) => {
    if (isEditBlocked(item.status)) return;
    setLocalRefPreview("");
    setEditingItem(item);
    setFormData({
      type: item.type || "",
      description: item.description || "",
      quantity: item.quantity || 1,
      visualWidth: item.visualWidth || item.area || "",
      visualHeight: item.visualHeight || item.visual || "",
      fileWidth: item.fileWidth || "",
      fileHeight: item.fileHeight || "",
      material: item.material || "",
      finish: item.finish || "",
      measurement: item.measurement || "",
      observations: item.observations || "",
      sponsorId: item.sponsorId || "",
      skipApproval: item.skipApproval || false,
      isReuse: item.isReuse || false,
      referenceUrl: item.referenceUrl || "",
    });
    setEditDialogOpen(true);
  };

  const handleDeleteItem = (id: string) => {
    setDeletingItemId(id);
  };

  const handleCloseDialog = () => {
    setLocalRefPreview("");
    setEditingItem(null);
    setBulkMode(true);
    setFormData({
      type: "",
      description: "",
      quantity: 1,
      visualWidth: "",
      visualHeight: "",
      fileWidth: "",
      fileHeight: "",
      material: "",
      finish: "",
      measurement: "",
      observations: "",
      sponsorId: "",
      skipApproval: false,
      isReuse: false,
      referenceUrl: "",
    });
    setOpen(false);
  };

  if (loadingEvent || loadingItems) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <div className="space-y-3">
              <div className="h-8 w-64 bg-muted animate-pulse rounded"></div>
              <div className="h-4 w-96 bg-muted animate-pulse rounded"></div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-sm text-muted-foreground">Carregando evento...</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <div className="h-6 w-48 bg-muted animate-pulse rounded"></div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-4 p-4 border rounded-lg">
                  <div className="h-4 w-4 bg-muted animate-pulse rounded"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 bg-muted animate-pulse rounded"></div>
                    <div className="h-3 w-48 bg-muted animate-pulse rounded"></div>
                  </div>
                  <div className="h-8 w-20 bg-muted animate-pulse rounded"></div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              {eventError ? (
                <>
                  <p className="text-red-700 font-semibold mb-1">Não foi possível carregar o evento</p>
                  <p className="text-muted-foreground text-sm mb-4">Verifique sua conexão e tente novamente.</p>
                  <button onClick={() => refetchEvent()} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
                    Tentar novamente
                  </button>
                </>
              ) : (
                <p className="text-muted-foreground">Evento não encontrado</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Mapa tipo → grupo pai (a partir dos standardItems). Resolve tolerante a
  // maiúscula/acento/espaço, casando o type tanto com o NOME do modelo quanto
  // com um NOME DE GRUPO do catálogo — assim itens importados da planilha
  // (ex.: type "Rolo") caem no grupo "ROLO".
  const normKey = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const groupByName: Record<string, string> = {};
  const groupByGroup: Record<string, string> = {};
  (standardItems as any[]).forEach((s: any) => {
    if (s.group) {
      groupByName[normKey(s.name)] = s.group;
      groupByGroup[normKey(s.group)] = s.group;
    }
  });
  const groupOf = (type: string): string => {
    const k = normKey(type);
    return groupByName[k] || groupByGroup[k] || "";
  };

  // Materiais e acabamentos: padrão + catálogo cadastrado + os usados nos Modelos,
  // para que um material/acabamento criado em "Modelos" apareça na edição de itens.
  const catMats = catalogOptions.filter(o => o.kind === "material").map(o => o.value);
  const catFinishes = catalogOptions.filter(o => o.kind === "finish").map(o => o.value);
  const materialOptions = Array.from(new Set([...materials, ...catMats, ...((standardItems as any[]).map(s => s.material).filter(Boolean) as string[])])).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const finishOptions = Array.from(new Set([...finishes, ...catFinishes, ...((standardItems as any[]).map(s => s.finish).filter(Boolean) as string[])])).sort((a, b) => a.localeCompare(b, "pt-BR"));

  // Agrupar itens: Grupo Pai → Tipo → [itens]
  const groupMap: Record<string, Record<string, typeof items>> = {};
  items.forEach(item => {
    const g = groupOf(item.type) || '';
    if (!groupMap[g]) groupMap[g] = {};
    if (!groupMap[g][item.type]) groupMap[g][item.type] = [];
    groupMap[g][item.type].push(item);
  });
  const sortedGroups = Object.keys(groupMap).sort((a, b) => {
    if (a === '') return 1; if (b === '') return -1;
    return a.localeCompare(b, 'pt-BR');
  });

  return (
    <div style={{ padding: '28px 40px', height: '100%', overflowY: 'auto', maxWidth: '1400px', margin: '0 auto', backgroundColor: '#F7F6F3' }}>
      {/* Breadcrumb */}
      <Link href="/eventos">
        <a
          data-testid="button-back"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: '500', color: '#9D978F', marginBottom: '22px', textDecoration: 'none', transition: 'color 0.15s', letterSpacing: '0.02em' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#D97A1E')}
          onMouseLeave={e => (e.currentTarget.style.color = '#9D978F')}
        >
          <ArrowLeft className="h-3 w-3" />
          Voltar para eventos
        </a>
      </Link>

      {/* Header principal */}
      <div style={{ marginBottom: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', gap: '24px', flexWrap: 'wrap' }}>
          <div>
            <p style={{ color: '#9D978F', fontSize: '11px', fontWeight: '500', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 8px 0' }}>
              Criado em {new Date(event.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </p>
            <h1
              data-testid="title-event-name"
              style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', textTransform: 'uppercase', color: '#1F1D1A', lineHeight: 1.05, margin: 0 }}
            >
              {event.name}
            </h1>
          </div>
          <div className="flex gap-2 flex-wrap">
            {/* Importar Excel */}
            <button
              onClick={() => setImportDialogOpen(true)}
              data-testid="button-import-xlsx"
              style={{ backgroundColor: '#ffffff', color: '#1a1c1c', padding: '11px 18px', borderRadius: '9px', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '7px', border: '1.5px solid #e7e5e4', cursor: 'pointer', transition: 'background-color 0.15s, border-color 0.15s', letterSpacing: '0.01em', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: "'Space Grotesk', sans-serif" }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f5f5f4'; e.currentTarget.style.borderColor = '#d4d0cc'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#ffffff'; e.currentTarget.style.borderColor = '#e7e5e4'; }}
            >
              <Upload className="h-4 w-4" style={{ color: '#22c55e' }} />
              Importar Excel
            </button>

            {/* Clonar Evento */}
            <button
              onClick={() => setCloneDialogOpen(true)}
              data-testid="button-clone-event"
              style={{ backgroundColor: '#ffffff', color: '#1a1c1c', padding: '11px 18px', borderRadius: '9px', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '7px', border: '1.5px solid #e7e5e4', cursor: 'pointer', transition: 'background-color 0.15s, border-color 0.15s', letterSpacing: '0.01em', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: "'Space Grotesk', sans-serif" }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f5f5f4'; e.currentTarget.style.borderColor = '#d4d0cc'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#ffffff'; e.currentTarget.style.borderColor = '#e7e5e4'; }}
            >
              <Copy className="h-4 w-4" style={{ color: '#6366f1' }} />
              Clonar Evento
            </button>

            {/* Exportar Excel */}
            <button
              onClick={() => window.open(`/api/events/${eventId}/export-items`, '_blank')}
              data-testid="button-export-xlsx"
              style={{ backgroundColor: '#ffffff', color: '#1a1c1c', padding: '11px 18px', borderRadius: '9px', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '7px', border: '1.5px solid #e7e5e4', cursor: 'pointer', transition: 'background-color 0.15s, border-color 0.15s', letterSpacing: '0.01em', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: "'Space Grotesk', sans-serif" }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f5f5f4'; e.currentTarget.style.borderColor = '#d4d0cc'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#ffffff'; e.currentTarget.style.borderColor = '#e7e5e4'; }}
            >
              <FileSpreadsheet className="h-4 w-4" style={{ color: '#16a34a' }} />
              Exportar Excel
            </button>

            <button
              onClick={() => {
                setEditingItem(null);
                setBulkMode(true);
                setOpen(true);
              }}
              data-testid="button-add-item"
              style={{ backgroundColor: '#D97A1E', color: '#ffffff', padding: '11px 24px', borderRadius: '9px', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '7px', border: 'none', cursor: 'pointer', transition: 'background-color 0.18s, box-shadow 0.18s, transform 0.1s', letterSpacing: '0.03em', whiteSpace: 'nowrap', flexShrink: 0, boxShadow: '0 1px 3px rgba(217,122,30,0.25)', fontFamily: "'Space Grotesk', sans-serif" }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#C96D16'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(217,122,30,0.35)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#D97A1E'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(217,122,30,0.25)'; }}
              onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
              onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <Plus className="h-4 w-4" />
              Adicionar Peça
            </button>
            
            <Dialog open={open} onOpenChange={(isOpen) => {
              if (!isOpen) {
                handleCloseDialog();
              } else {
                setOpen(true);
              }
            }}>
              <DialogContent
                className={`${bulkMode && !editingItem ? "max-w-[95vw] h-[90vh] p-0 gap-0 flex flex-col" : "sm:max-w-lg max-h-[90vh] overflow-y-auto p-0 gap-0"} [&>button:last-child]:hidden`}
                style={bulkMode && !editingItem ? { display: 'flex', flexDirection: 'column', overflow: 'hidden' } : undefined}
                onInteractOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
              >
                {/* HEADER */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 32px', backgroundColor: '#f9f9f8', borderBottom: '1px solid rgba(231,229,228,0.5)' }}>
                  <div>
                    <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '22px', fontWeight: '700', letterSpacing: '-0.03em', color: '#1a1c1c', margin: 0 }}>
                      {editingItem
                        ? `#${editingItem.displayId?.toString().padStart(4, '0')} — ${editingItem.type}`
                        : (bulkMode ? "Entrada Rápida" : (formData.type || "Nova Peça"))}
                    </DialogTitle>
                    <DialogDescription style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a8a29e', marginTop: '2px' }}>
                      {editingItem
                        ? (editingItem.description ? editingItem.description : "Editar peça de produção")
                        : (bulkMode ? "Modo Lote — NORTE Apex" : (formData.type ? "Nova peça de produção" : "Selecione o tipo para começar"))}
                    </DialogDescription>
                  </div>
                  {!editingItem && (
                    bulkMode ? (
                      <button
                        onClick={() => setBulkMode(false)}
                        data-testid="button-toggle-mode"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', backgroundColor: 'rgba(231,229,228,0.6)', color: '#57534e', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '700', transition: 'background-color 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#e7e5e4')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(231,229,228,0.6)')}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Modo Simples
                      </button>
                    ) : (
                      <button
                        onClick={() => setBulkMode(true)}
                        data-testid="button-toggle-mode"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', backgroundColor: 'rgba(255,237,213,0.6)', color: '#ea580c', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '700', transition: 'background-color 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fed7aa')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(255,237,213,0.6)')}
                      >
                        <List className="h-3.5 w-3.5" />
                        Entrada Rápida
                      </button>
                    )
                  )}
                </div>
                
                {bulkMode && !editingItem ? (
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
                  <BulkItemEntry
                    eventId={eventId!}
                    standardItems={standardItems}
                    sponsors={sponsors}
                    existingItems={items}
                    onSubmit={(items) => createBulkItemsMutation.mutate(items)}
                    onCancel={() => setOpen(false)}
                    isPending={createBulkItemsMutation.isPending}
                  />
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
                    {/* Corpo */}
                    <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>

                      {/* LINHA 1: Tipo + Quantidade lado a lado */}
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
                        {/* Tipo de Item — flex-1 */}
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', marginBottom: '6px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a8a29e' }}>
                            Tipo de Peça
                          </label>
                          {editingTypeName ? (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <input
                                autoFocus
                                type="text"
                                value={formData.type}
                                onChange={e => setFormData({ ...formData, type: e.target.value })}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setEditingTypeName(false); } if (e.key === 'Escape') setEditingTypeName(false); }}
                                onBlur={() => setEditingTypeName(false)}
                                data-testid="input-type-name-edit"
                                style={{ flex: 1, padding: '12px 16px', backgroundColor: '#f0efee', borderRadius: '10px', border: '1.5px solid #f97316', outline: 'none', fontSize: '14px', color: '#1a1c1c', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                              />
                              <button
                                type="button"
                                onMouseDown={() => setEditingTypeName(false)}
                                data-testid="button-confirm-type-name"
                                style={{ padding: '0 14px', backgroundColor: '#f97316', borderRadius: '10px', border: 'none', cursor: 'pointer', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}
                              >
                                OK
                              </button>
                            </div>
                          ) : (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <Popover open={typePopoverOpen} onOpenChange={setTypePopoverOpen}>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                role="combobox"
                                aria-expanded={typePopoverOpen}
                                data-testid="select-item-type"
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: '#f0efee', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '14px', color: formData.type ? '#1a1c1c' : '#a8a29e', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                              >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formData.type || "Selecione o tipo"}</span>
                                <ChevronsUpDown className="h-4 w-4 flex-shrink-0 ml-2" style={{ color: '#a8a29e' }} />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-full p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Buscar ou adicionar tipo..." value={customTypeInput} onValueChange={setCustomTypeInput} />
                                <CommandList>
                                  <CommandEmpty>
                                    <div className="p-2 space-y-2">
                                      <p className="text-sm text-muted-foreground">Nenhum tipo encontrado.</p>
                                      {customTypeInput && (
                                        <Button type="button" size="sm" className="w-full" onClick={() => { setFormData({ ...formData, type: customTypeInput }); setCustomTypeInput(""); setTypePopoverOpen(false); }}>
                                          <Plus className="h-3 w-3 mr-1" /> Adicionar "{customTypeInput}"
                                        </Button>
                                      )}
                                    </div>
                                  </CommandEmpty>
                                  {standardItems.length > 0 && (
                                    <CommandGroup heading="Modelos">
                                      {standardItems.map((item: any) => (
                                        <CommandItem key={item.id} value={item.name} onSelect={() => {
                                          setFormData({ ...formData, type: item.name, visualWidth: item.visualWidth ? String(item.visualWidth) : (item.area ? String(item.area) : ""), visualHeight: item.visualHeight ? String(item.visualHeight) : (item.visual ? String(item.visual) : ""), fileWidth: item.fileWidth ? String(item.fileWidth) : "", fileHeight: item.fileHeight ? String(item.fileHeight) : "", material: item.material || "", finish: item.finish || "", measurement: (item.visualWidth && item.visualHeight) ? `${item.visualWidth} × ${item.visualHeight}` : (item.area && item.visual ? `${item.area} × ${item.visual}` : "") });
                                          setCustomTypeInput(""); setTypePopoverOpen(false);
                                        }}>
                                          <Check className={cn("mr-2 h-4 w-4", formData.type === item.name ? "opacity-100" : "opacity-0")} />
                                          {item.name}
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  )}
                                  <CommandGroup heading="Outros Tipos">
                                    {itemTypes.map((type) => (
                                      <CommandItem key={type} value={type} onSelect={() => { setFormData({ ...formData, type }); setCustomTypeInput(""); setTypePopoverOpen(false); }}>
                                        <Check className={cn("mr-2 h-4 w-4", formData.type === type ? "opacity-100" : "opacity-0")} />
                                        {type}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          {formData.type && (
                            <button
                              type="button"
                              onClick={() => setEditingTypeName(true)}
                              data-testid="button-edit-type-name"
                              title="Editar nome do tipo"
                              style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, backgroundColor: '#f0efee', borderRadius: '10px', border: 'none', cursor: 'pointer', color: '#a8a29e' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#e7e5e4'; (e.currentTarget as HTMLButtonElement).style.color = '#f97316'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#f0efee'; (e.currentTarget as HTMLButtonElement).style.color = '#a8a29e'; }}
                            >
                              <Pencil style={{ width: 15, height: 15 }} />
                            </button>
                          )}
                          </div>
                          )}
                        </div>
                        {/* Quantidade — fixo 96px */}
                        <div style={{ width: '96px' }}>
                          <label style={{ display: 'block', marginBottom: '6px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a8a29e' }}>Qtd</label>
                          <input
                            id="quantity"
                            type="number"
                            min="1"
                            value={formData.quantity}
                            onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
                            required
                            data-testid="input-quantity"
                            style={{ width: '100%', padding: '12px 16px', backgroundColor: '#f0efee', borderRadius: '10px', border: 'none', fontSize: '14px', color: '#1a1c1c', textAlign: 'center', fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none' }}
                            onFocus={e => (e.currentTarget.style.boxShadow = '0 0 0 2px rgba(249,115,22,0.15)')}
                            onBlur={e => (e.currentTarget.style.boxShadow = 'none')}
                          />
                        </div>
                      </div>

                      {/* Descrição */}
                      <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a8a29e' }}>Descrição <span style={{ color: '#c9c4c0', fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: '10px' }}>(opcional)</span></label>
                        <input
                          id="description"
                          type="text"
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          placeholder="Ex: Banner Frontlit Entrada Principal"
                          data-testid="input-description"
                          style={{ width: '100%', padding: '12px 16px', backgroundColor: '#f0efee', borderRadius: '10px', border: 'none', fontSize: '14px', color: '#1a1c1c', fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none', boxSizing: 'border-box' }}
                          onFocus={e => (e.currentTarget.style.boxShadow = '0 0 0 2px rgba(249,115,22,0.15)')}
                          onBlur={e => (e.currentTarget.style.boxShadow = 'none')}
                        />
                      </div>

                      {/* Bloco dimensões: grid 2 colunas dentro de container */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', padding: '16px', backgroundColor: 'rgba(240,239,238,0.5)', borderRadius: '12px' }}>
                        {/* Dimensões Visuais */}
                        <div style={{ paddingLeft: '16px', borderLeft: '4px solid #f97316', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <span style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#f97316' }}>Dimensões Visuais (m)</span>
                          <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '9px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#a8a29e' }}>Largura</label>
                            <input id="visualWidth" type="number" step="0.01" min="0" value={formData.visualWidth} onChange={e => setFormData({ ...formData, visualWidth: e.target.value })} placeholder="Ex: 2.00" required data-testid="input-visual-width"
                              style={{ width: '100%', padding: '10px 14px', backgroundColor: '#fff', borderRadius: '8px', border: 'none', fontSize: '14px', color: '#1a1c1c', fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none', boxSizing: 'border-box' }}
                              onFocus={e => (e.currentTarget.style.boxShadow = '0 0 0 2px rgba(249,115,22,0.20)')}
                              onBlur={e => (e.currentTarget.style.boxShadow = 'none')}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '9px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#a8a29e' }}>Altura</label>
                            <input id="visualHeight" type="number" step="0.01" min="0" value={formData.visualHeight} onChange={e => setFormData({ ...formData, visualHeight: e.target.value })} placeholder="Ex: 1.00" required data-testid="input-visual-height"
                              style={{ width: '100%', padding: '10px 14px', backgroundColor: '#fff', borderRadius: '8px', border: 'none', fontSize: '14px', color: '#1a1c1c', fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none', boxSizing: 'border-box' }}
                              onFocus={e => (e.currentTarget.style.boxShadow = '0 0 0 2px rgba(249,115,22,0.20)')}
                              onBlur={e => (e.currentTarget.style.boxShadow = 'none')}
                            />
                          </div>
                        </div>
                        {/* Dimensões Arquivo */}
                        <div style={{ paddingLeft: '16px', borderLeft: '4px solid #d6d3d1', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <span style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#78716c' }}>Dimensões Arquivo (m)</span>
                          <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '9px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#a8a29e' }}>Largura</label>
                            <input id="fileWidth" type="number" step="0.01" min="0" value={formData.fileWidth} onChange={e => setFormData({ ...formData, fileWidth: e.target.value })} placeholder="Ex: 1.90" required data-testid="input-file-width"
                              style={{ width: '100%', padding: '10px 14px', backgroundColor: '#fff', borderRadius: '8px', border: 'none', fontSize: '14px', color: '#1a1c1c', fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none', boxSizing: 'border-box' }}
                              onFocus={e => (e.currentTarget.style.boxShadow = '0 0 0 2px rgba(120,113,108,0.15)')}
                              onBlur={e => (e.currentTarget.style.boxShadow = 'none')}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '9px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#a8a29e' }}>Altura</label>
                            <input id="fileHeight" type="number" step="0.01" min="0" value={formData.fileHeight} onChange={e => setFormData({ ...formData, fileHeight: e.target.value })} placeholder="Ex: 0.90" required data-testid="input-file-height"
                              style={{ width: '100%', padding: '10px 14px', backgroundColor: '#fff', borderRadius: '8px', border: 'none', fontSize: '14px', color: '#1a1c1c', fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none', boxSizing: 'border-box' }}
                              onFocus={e => (e.currentTarget.style.boxShadow = '0 0 0 2px rgba(120,113,108,0.15)')}
                              onBlur={e => (e.currentTarget.style.boxShadow = 'none')}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Barra M² Total — dark */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: '#1c1917', borderRadius: '10px' }}>
                        <span style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#78716c' }}>M² Total (calculado)</span>
                        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: '700', fontSize: '18px', color: formData.fileWidth && formData.fileHeight ? '#fff' : '#57534e' }}>
                          {formData.fileWidth && formData.fileHeight && formData.quantity
                            ? (formData.quantity * parseFloat(formData.fileWidth || "0") * parseFloat(formData.fileHeight || "0")).toFixed(2) + " m²"
                            : "—"
                          }
                        </span>
                      </div>

                      {/* Material | Acabamento */}
                      <div style={{ display: 'flex', gap: '16px' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', marginBottom: '6px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a8a29e' }}>Material</label>
                          <Popover open={materialPopoverOpen} onOpenChange={setMaterialPopoverOpen}>
                            <PopoverTrigger asChild>
                              <button type="button" role="combobox" data-testid="select-material"
                                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: '#f0efee', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '14px', color: formData.material ? '#1a1c1c' : '#a8a29e', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                              >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formData.material || "Selecionar"}</span>
                                <ChevronsUpDown className="h-4 w-4 flex-shrink-0 ml-2" style={{ color: '#a8a29e' }} />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-full p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Buscar ou adicionar..." value={customMaterialInput} onValueChange={setCustomMaterialInput} />
                                <CommandList>
                                  <CommandEmpty>
                                    <div className="p-2 space-y-2">
                                      <p className="text-sm text-muted-foreground">Nenhum material encontrado.</p>
                                      {customMaterialInput && <Button type="button" size="sm" className="w-full" onClick={() => { setFormData({ ...formData, material: customMaterialInput }); setCustomMaterialInput(""); setMaterialPopoverOpen(false); }}><Plus className="h-3 w-3 mr-1" /> Adicionar "{customMaterialInput}"</Button>}
                                    </div>
                                  </CommandEmpty>
                                  <CommandGroup>
                                    {materialOptions.map(material => (
                                      <CommandItem key={material} value={material} onSelect={() => { setFormData({ ...formData, material }); setCustomMaterialInput(""); setMaterialPopoverOpen(false); }}>
                                        <Check className={cn("mr-2 h-4 w-4", formData.material === material ? "opacity-100" : "opacity-0")} />{material}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', marginBottom: '6px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a8a29e' }}>Acabamento</label>
                          <Popover open={finishPopoverOpen} onOpenChange={setFinishPopoverOpen}>
                            <PopoverTrigger asChild>
                              <button type="button" role="combobox" data-testid="select-finish"
                                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: '#f0efee', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '14px', color: formData.finish ? '#1a1c1c' : '#a8a29e', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                              >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formData.finish || "Selecionar"}</span>
                                <ChevronsUpDown className="h-4 w-4 flex-shrink-0 ml-2" style={{ color: '#a8a29e' }} />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-full p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Buscar ou adicionar..." value={customFinishInput} onValueChange={setCustomFinishInput} />
                                <CommandList>
                                  <CommandEmpty>
                                    <div className="p-2 space-y-2">
                                      <p className="text-sm text-muted-foreground">Nenhum acabamento encontrado.</p>
                                      {customFinishInput && <Button type="button" size="sm" className="w-full" onClick={() => { setFormData({ ...formData, finish: customFinishInput }); setCustomFinishInput(""); setFinishPopoverOpen(false); }}><Plus className="h-3 w-3 mr-1" /> Adicionar "{customFinishInput}"</Button>}
                                    </div>
                                  </CommandEmpty>
                                  <CommandGroup>
                                    {finishOptions.map(finish => (
                                      <CommandItem key={finish} value={finish} onSelect={() => { setFormData({ ...formData, finish }); setCustomFinishInput(""); setFinishPopoverOpen(false); }}>
                                        <Check className={cn("mr-2 h-4 w-4", formData.finish === finish ? "opacity-100" : "opacity-0")} />{finish}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>

                      {/* Observações */}
                      <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a8a29e' }}>Observações <span style={{ color: '#c9c4c0', fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: '10px' }}>(opcional)</span></label>
                        <textarea
                          id="observations"
                          value={formData.observations}
                          onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                          placeholder="Informações adicionais para produção..."
                          rows={2}
                          data-testid="textarea-observations"
                          style={{ width: '100%', padding: '12px 16px', backgroundColor: '#f0efee', borderRadius: '10px', border: 'none', fontSize: '14px', color: '#1a1c1c', fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                          onFocus={e => (e.currentTarget.style.boxShadow = '0 0 0 2px rgba(249,115,22,0.15)')}
                          onBlur={e => (e.currentTarget.style.boxShadow = 'none')}
                        />
                      </div>
                    </div>

                    {/* Rodapé */}
                    <div style={{ padding: '20px 32px', display: 'flex', gap: '12px' }}>
                      <button
                        type="button"
                        onClick={handleCloseDialog}
                        style={{ flex: 1, padding: '12px', border: '1px solid #e7e5e4', borderRadius: '10px', backgroundColor: '#fff', color: '#57534e', fontWeight: '700', fontSize: '14px', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'background-color 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9f9f8')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#fff')}
                      >
                        CANCELAR
                      </button>
                      <button
                        type="submit"
                        disabled={createItemMutation.isPending || updateItemMutation.isPending}
                        style={{ flex: 2, padding: '12px', border: 'none', borderRadius: '10px', backgroundColor: createItemMutation.isPending || updateItemMutation.isPending ? '#57534e' : '#1c1917', color: '#fff', fontWeight: '700', fontSize: '14px', cursor: createItemMutation.isPending || updateItemMutation.isPending ? 'not-allowed' : 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'background-color 0.15s' }}
                        onMouseEnter={e => { if (!createItemMutation.isPending && !updateItemMutation.isPending) e.currentTarget.style.backgroundColor = '#f97316'; }}
                        onMouseLeave={e => { if (!createItemMutation.isPending && !updateItemMutation.isPending) e.currentTarget.style.backgroundColor = '#1c1917'; }}
                        data-testid="button-submit-item"
                      >
                        {editingItem
                          ? (updateItemMutation.isPending ? "SALVANDO..." : "SALVAR ALTERAÇÕES")
                          : (createItemMutation.isPending ? "ADICIONANDO..." : "ADICIONAR ITEM")
                        }
                      </button>
                    </div>
                  </form>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* ── Agenda Operacional ───────────────────────────────── */}
        {(() => {
          const TI = {
            card: '#FFFFFF', border: '#E7E3DC',
            title: '#1F1D1A', secondary: '#6F6A63', label: '#9D978F',
            dark: '#2E2A26', accent: '#D97A1E',
            line: '#D8D4CE', attention: '#C97B4B',
          };

          const today = new Date(); today.setHours(0, 0, 0, 0);
          const departure = new Date(event.truckDepartureDate);
          const depDay = new Date(departure); depDay.setHours(0, 0, 0, 0);
          const countdownDays = Math.ceil((depDay.getTime() - today.getTime()) / 86400000);
          const depLabel = departure.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
          const depTime = departure.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
          const startLabel = parseDateLocal(event.startDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

          const adjustWeekend = (date: Date, skip: boolean): { date: Date; adjusted: 'fri' | 'mon' | null } => {
            if (skip) return { date, adjusted: null };
            const dow = date.getDay();
            if (dow === 6) { const d = new Date(date); d.setDate(d.getDate() - 1); return { date: d, adjusted: 'fri' }; }
            if (dow === 0) { const d = new Date(date); d.setDate(d.getDate() + 1); return { date: d, adjusted: 'mon' }; }
            return { date, adjusted: null };
          };

          const rawDeadlines = [
            { label: 'Lista de Imagens',    days: event.deadlineListaImagens    ?? -25, allDays: false },
            { label: 'Entrega de Layouts',  days: event.deadlineEntregaLayouts  ?? -20, allDays: false },
            { label: 'Aprovação de Layout', days: event.deadlineAprovacaoLayout ?? -12, allDays: false },
            { label: 'Revisão de Lista',    days: event.deadlineRevisaoLista    ?? -8,  allDays: false },
            { label: 'Produção Gráfica',    days: event.deadlineProducaoGrafica ?? -1,  allDays: true  },
          ];

          const milestones = rawDeadlines.map(({ label, days, allDays }) => {
            const raw = new Date(departure); raw.setDate(raw.getDate() + days);
            const { date, adjusted } = adjustWeekend(raw, allDays);
            const isPast = date < today;
            const isOverdue = isPast && countdownDays > 0;
            return { label, date, adjusted, isPast, isOverdue };
          });

          const nextIndex = milestones.findIndex(m => !m.isPast);
          const progressFrac = nextIndex === -1 ? 1 : nextIndex === 0 ? 0 : nextIndex / (milestones.length - 1);

          const countdownColor = countdownDays < 0 ? '#B84040' : countdownDays <= 3 ? TI.attention : TI.secondary;
          const countdownText = countdownDays < 0
            ? `Atrasado ${Math.abs(countdownDays)}d`
            : countdownDays === 0 ? 'Hoje'
            : `Faltam ${countdownDays} dia${countdownDays !== 1 ? 's' : ''}`;

          const cardHover = (el: HTMLDivElement, on: boolean) => {
            el.style.boxShadow = on ? '0 6px 20px rgba(0,0,0,0.08)' : '0 1px 4px rgba(0,0,0,0.05)';
          };

          return (
            <div style={{ marginTop: '8px' }}>

              {/* Section divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px' }}>
                <span style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.16em', color: TI.label, fontFamily: "'Space Grotesk', sans-serif", whiteSpace: 'nowrap' }}>
                  Agenda Operacional
                </span>
                <div style={{ flex: 1, height: '1px', backgroundColor: TI.border }} />
              </div>

              {/* ── Cards de logística ── */}
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'stretch' }}>

                {/* Card: SAÍDA DO CAMINHÃO */}
                <div
                  style={{ flex: '0 0 auto', minWidth: '210px', backgroundColor: TI.card, border: `1px solid ${TI.border}`, borderRadius: '12px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '18px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', transition: 'box-shadow 0.2s' }}
                  onMouseEnter={e => cardHover(e.currentTarget, true)}
                  onMouseLeave={e => cardHover(e.currentTarget, false)}
                >
                  <div style={{ width: '50px', height: '50px', borderRadius: '12px', backgroundColor: '#FEF3E7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Truck size={22} color={TI.accent} />
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.14em', color: TI.label, marginBottom: '7px', fontFamily: "'Space Grotesk', sans-serif" }}>
                      Saída do Caminhão
                    </div>
                    <div style={{ fontSize: '23px', fontWeight: '800', color: TI.title, fontFamily: "'Manrope', sans-serif", lineHeight: 1.1, letterSpacing: '-0.03em' }}>
                      {depLabel}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: '500', color: TI.secondary, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '0.01em' }}>{depTime}</span>
                      <span style={{ width: '3px', height: '3px', borderRadius: '50%', backgroundColor: TI.line, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', fontWeight: '600', color: countdownColor, letterSpacing: '0.01em' }}>
                        {countdownText}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card: INÍCIO DA MONTAGEM */}
                <div
                  style={{ flex: '0 0 auto', minWidth: '210px', backgroundColor: TI.card, border: `1px solid ${TI.border}`, borderRadius: '12px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '18px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', transition: 'box-shadow 0.2s' }}
                  onMouseEnter={e => cardHover(e.currentTarget, true)}
                  onMouseLeave={e => cardHover(e.currentTarget, false)}
                >
                  <div style={{ width: '50px', height: '50px', borderRadius: '12px', backgroundColor: '#EEF2F7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Calendar size={22} color="#7A93AC" />
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.14em', color: TI.label, marginBottom: '7px', fontFamily: "'Space Grotesk', sans-serif" }}>
                      Dia do Evento
                    </div>
                    <div style={{ fontSize: '23px', fontWeight: '800', color: TI.title, fontFamily: "'Manrope', sans-serif", lineHeight: 1.1, letterSpacing: '-0.03em' }}>
                      {startLabel}
                    </div>
                    <div style={{ marginTop: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: '500', color: TI.secondary, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '0.01em' }}>Início do evento</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Timeline de Prazos ── */}
              <div style={{ backgroundColor: TI.card, border: `1px solid ${TI.border}`, borderRadius: '12px', padding: '22px 28px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ overflowX: 'auto', paddingBottom: '4px' }}>
                  <div style={{ position: 'relative', display: 'flex', minWidth: '480px' }}>

                    {/* Track base */}
                    <div style={{
                      position: 'absolute', top: '18px',
                      left: `calc(100% / ${milestones.length} / 2)`,
                      right: `calc(100% / ${milestones.length} / 2)`,
                      height: '1.5px', backgroundColor: TI.line, zIndex: 0,
                    }} />
                    {/* Progress fill */}
                    {progressFrac > 0 && (
                      <div style={{
                        position: 'absolute', top: '18px',
                        left: `calc(100% / ${milestones.length} / 2)`,
                        width: `calc(${progressFrac} * (100% - 100% / ${milestones.length}))`,
                        height: '1.5px', backgroundColor: '#C3B5A2', zIndex: 1,
                      }} />
                    )}

                    {milestones.map(({ label, date, adjusted, isPast, isOverdue }, i) => {
                      const isNext = i === nextIndex;
                      const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

                      let dotBg: string, dotBorder: string, dotSize: number;
                      let labelCol: string, dateCol: string, labelW: number;
                      let glowColor = '';

                      if (isNext) {
                        dotBg = TI.accent; dotBorder = TI.accent; dotSize = 22;
                        labelCol = TI.dark; dateCol = TI.accent; labelW = 700;
                        glowColor = 'rgba(217,122,30,0.18)';
                      } else if (isOverdue) {
                        dotBg = '#FDF0E8'; dotBorder = TI.attention; dotSize = 14;
                        labelCol = TI.attention; dateCol = TI.attention; labelW = 600;
                      } else if (isPast) {
                        dotBg = '#D8D4CE'; dotBorder = '#D8D4CE'; dotSize = 10;
                        labelCol = '#B8B2A8'; dateCol = '#B8B2A8'; labelW = 500;
                      } else {
                        dotBg = TI.card; dotBorder = TI.line; dotSize = 12;
                        labelCol = TI.secondary; dateCol = TI.secondary; labelW = 500;
                      }

                      return (
                        <div
                          key={label}
                          title={adjusted === 'fri' ? `${label} — movido de sáb para sex` : adjusted === 'mon' ? `${label} — movido de dom para seg` : label}
                          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 2 }}
                        >
                          {/* Dot — 40px container so all centers align on track */}
                          <div style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', marginBottom: '10px' }}>
                            {glowColor && (
                              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', backgroundColor: glowColor, filter: 'blur(6px)' }} />
                            )}
                            <div style={{
                              width: `${dotSize}px`, height: `${dotSize}px`, borderRadius: '50%',
                              backgroundColor: dotBg,
                              border: dotSize <= 10 ? 'none' : `2px solid ${dotBorder}`,
                              boxShadow: isNext ? `0 0 0 5px rgba(217,122,30,0.12)` : 'none',
                              position: 'relative', zIndex: 1,
                            }} />
                          </div>

                          {/* Label */}
                          <span style={{
                            fontSize: '9px', fontWeight: labelW, textTransform: 'uppercase',
                            letterSpacing: '0.07em', color: labelCol,
                            textAlign: 'center', lineHeight: 1.45,
                            fontFamily: "'Space Grotesk', sans-serif",
                            maxWidth: '88px', display: 'block',
                          }}>
                            {label}
                          </span>

                          {/* Date */}
                          <span style={{
                            fontSize: '11px', fontWeight: isNext ? 700 : 500,
                            color: dateCol, fontFamily: "'DM Mono', monospace",
                            marginTop: '5px', display: 'block', letterSpacing: '0.03em',
                          }}>
                            {dateStr}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

            </div>
          );
        })()}
      </div>

      {/* Card de Peças em Rascunho */}
      {items.filter(item => item.status === 'draft' || item.status === 'requested').length > 0 && (
        <>
        <Card className="border-2 border-dashed border-muted-foreground/30 bg-muted/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Peças em Rascunho</CardTitle>
                <Badge variant="secondary" className="ml-2">
                  {items.filter(item => item.status === 'draft' || item.status === 'requested').length} {items.filter(item => item.status === 'draft' || item.status === 'requested').length === 1 ? 'item' : 'itens'}
                </Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Revise os itens abaixo e envie todos para Arte quando estiver pronto
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 mb-4">
              {(() => {
                const draftItems = items.filter(item => item.status === 'draft' || item.status === 'requested');
                // Grupo Pai → Tipo → itens
                const draftGroupMap: Record<string, Record<string, typeof draftItems>> = {};
                draftItems.forEach(item => {
                  const g = groupOf(item.type) || '';
                  if (!draftGroupMap[g]) draftGroupMap[g] = {};
                  if (!draftGroupMap[g][item.type]) draftGroupMap[g][item.type] = [];
                  draftGroupMap[g][item.type].push(item);
                });
                const draftSortedGroups = Object.keys(draftGroupMap).sort((a, b) => {
                  if (a === '') return 1; if (b === '') return -1;
                  return a.localeCompare(b, 'pt-BR');
                });
                return draftSortedGroups.map(groupName => {
                  const typeMap = draftGroupMap[groupName];
                  const sortedTypes = Object.keys(typeMap).sort((a, b) => a.localeCompare(b, 'pt-BR'));
                  return (
                    <div key={groupName || '__sem_grupo__'}>
                      {/* Cabeçalho Grupo Pai */}
                      {groupName && (
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#a8a29e', marginBottom: 6, paddingLeft: 2 }}>
                          {groupName}
                        </div>
                      )}
                      <div className="space-y-3">
                        {sortedTypes.map(typeName => {
                          const typeItems = typeMap[typeName];
                          return (
                            <div key={typeName}>
                              {/* Sub-cabeçalho Tipo */}
                              <div style={{ fontSize: 11, fontWeight: 600, color: '#78716c', marginBottom: 4, paddingLeft: 2 }}>
                                {typeName}
                              </div>
                              <div className="space-y-2">
                                {typeItems.map(item => (
                                  <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg bg-card hover-elevate" data-testid={`draft-item-${item.id}`}>
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                        <Package className="h-4 w-4 text-muted-foreground" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          {item.description && <span className="text-sm text-muted-foreground truncate">— {item.description}</span>}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          {item.quantity} {item.quantity === 1 ? 'unidade' : 'unidades'} • {item.material} • {item.finish} • {parseFloat(item.calculatedM2).toFixed(2)}m²
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                                      {/* Referência visual */}
                                      {item.referenceUrl && (
                                        <a href={item.referenceUrl} target="_blank" rel="noopener noreferrer" title="Abrir referência visual" data-testid={`link-reference-${item.id}`}>
                                          <img src={item.referenceUrl} className="h-8 w-8 rounded object-cover border border-border" alt="Referência visual" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                                        </a>
                                      )}
                                      {/* Upload referência — solicitation/admin, em qualquer status até entrega */}
                                      {canUploadReference && item.status !== 'entregue' && (
                                        <ObjectUploader
                                          onGetUploadParameters={getUploadUrl}
                                          onComplete={({ url }) => updateReferenceUrlMutation.mutate({ itemId: item.id, referenceUrl: url })}
                                          buttonVariant="ghost"
                                          buttonClassName="px-2 h-7 text-xs gap-1"
                                        >
                                          <Paperclip className="h-3 w-3" />
                                          <span>{item.referenceUrl ? 'Trocar ref.' : 'Ref. visual'}</span>
                                        </ObjectUploader>
                                      )}
                                      {canUploadReference && item.referenceUrl && item.status !== 'entregue' && (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-muted-foreground"
                                          title="Remover referência"
                                          data-testid={`button-remove-reference-${item.id}`}
                                          onClick={() => removeReferenceUrlMutation.mutate(item.id)}
                                        >
                                          <X className="h-3 w-3" />
                                        </Button>
                                      )}
                                      {canManageEvent && (
                                        <>
                                          {isEditBlocked(item.status) ? (
                                            <div className="p-1.5 rounded-md" title="Edição bloqueada — item já liberado para gráfica" style={{ color: "#a8a29e", cursor: "not-allowed" }}>
                                              <Lock className="h-3.5 w-3.5" />
                                            </div>
                                          ) : (
                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditItem(item)} data-testid={`button-edit-draft-${item.id}`}>
                                              <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                          )}
                                          <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-destructive/10" onClick={() => setDeletingItemId(item.id)} data-testid={`button-delete-draft-${item.id}`}>
                                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border-2 border-dashed border-primary/30">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold">Pronto para enviar?</p>
                  <p className="text-xs text-muted-foreground">
                    {items.filter(item => item.status === 'draft').length} {items.filter(item => item.status === 'draft').length === 1 ? 'item será enviado' : 'itens serão enviados'} para vinculação de patrocinadores
                  </p>
                </div>
              </div>
              <Button
                onClick={() => setSubmitConfirmOpen(true)}
                disabled={submitDraftsMutation.isPending}
                size="lg"
                data-testid="button-submit-drafts"
              >
                {submitDraftsMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Enviar Todos os Itens
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Modal de confirmação de envio com lista de itens ── */}
        <Dialog open={submitConfirmOpen} onOpenChange={setSubmitConfirmOpen}>
          <DialogContent style={{ maxWidth: 560, padding: 0, gap: 0, borderRadius: 14, overflow: 'hidden' }}>
            {/* Header */}
            <DialogHeader style={{ padding: '24px 28px 16px', borderBottom: '1px solid #e7e5e4' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Check style={{ width: 20, height: 20, color: '#f97316' }} />
                </div>
                <div>
                  <DialogTitle style={{ fontSize: 17, fontWeight: 700, color: '#1c1917', margin: 0 }}>
                    Confirmar envio para vinculação
                  </DialogTitle>
                  <DialogDescription style={{ fontSize: 13, color: '#78716c', marginTop: 3 }}>
                    {(() => {
                      const n = items.filter(i => i.status === 'draft').length;
                      return `${n} ${n === 1 ? 'item será enviado' : 'itens serão enviados'} para a fila de vinculação de patrocinadores.`;
                    })()}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {/* Lista de itens */}
            <div style={{ maxHeight: 340, overflowY: 'auto', padding: '16px 28px' }}>
              {(() => {
                const draftItems = items.filter(i => i.status === 'draft');
                const byType: Record<string, typeof draftItems> = {};
                draftItems.forEach(item => {
                  const k = item.type || 'Sem tipo';
                  if (!byType[k]) byType[k] = [];
                  byType[k].push(item);
                });
                return Object.entries(byType).sort(([a],[b]) => a.localeCompare(b,'pt-BR')).map(([typeName, typeItems]) => (
                  <div key={typeName} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a8a29e', marginBottom: 6 }}>
                      {typeName} · {typeItems.length} {typeItems.length === 1 ? 'item' : 'itens'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {typeItems.map(item => (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', backgroundColor: '#fafaf9', border: '1px solid #e7e5e4', borderRadius: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#f97316', fontFamily: 'monospace', flexShrink: 0 }}>
                            #{item.displayId?.toString().padStart(4, '0') ?? '—'}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1c1917', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {item.type}{item.description ? ` — ${item.description}` : ''}
                            </div>
                            <div style={{ fontSize: 11, color: '#78716c', marginTop: 1 }}>
                              {item.quantity} {item.quantity === 1 ? 'un.' : 'un.'} · {item.visualWidth && item.visualHeight ? `${item.visualWidth}×${item.visualHeight}m` : item.material}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* Aviso + botões */}
            <div style={{ padding: '14px 28px 24px', borderTop: '1px solid #e7e5e4' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
                <AlertCircle style={{ width: 14, height: 14, color: '#f97316', flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12, color: '#92400e', margin: 0, lineHeight: 1.5 }}>
                  Após o envio, os itens irão para a fila de <strong>Vincular Patrocinadores</strong>. Esta ação não pode ser desfeita.
                </p>
              </div>
              <DialogFooter style={{ gap: 8, flexDirection: 'row', justifyContent: 'flex-end' }}>
                <Button variant="outline" onClick={() => setSubmitConfirmOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => {
                    setSubmitConfirmOpen(false);
                    submitDraftsMutation.mutate();
                  }}
                  data-testid="button-confirm-submit-drafts"
                  disabled={submitDraftsMutation.isPending}
                >
                  {submitDraftsMutation.isPending ? (
                    <><Loader2 style={{ width: 14, height: 14, marginRight: 6 }} className="animate-spin" /> Enviando...</>
                  ) : (
                    <><Check style={{ width: 14, height: 14, marginRight: 6 }} /> Confirmar envio</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
        </>
      )}

      {/* Itens agrupados por tipo em seções */}
      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0' }}>
          <AlertCircle className="h-12 w-12 mx-auto mb-4" style={{ color: '#a8a29e' }} />
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1c1917', marginBottom: '8px' }}>Nenhum item adicionado</h3>
          <p style={{ color: '#78716c', marginBottom: '16px', fontSize: '14px' }}>Adicione itens ao evento para começar</p>
          <button
            onClick={() => { setEditingItem(null); setBulkMode(true); setOpen(true); }}
            style={{ backgroundColor: '#1c1917', color: '#fff', padding: '10px 20px', borderRadius: '6px', fontWeight: '700', fontSize: '14px', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus className="h-4 w-4" />
            Adicionar Primeiro Item
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '48px' }}>
          {isFetching && !loadingItems && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a8a29e', fontSize: '13px' }}>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Atualizando...</span>
            </div>
          )}
          {sortedGroups.map(group => (
            <Fragment key={group || '__nogroup'}>
              {/* ── Grupo Pai header ── */}
              {group && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', marginTop: '8px' }}>
                  <span style={{
                    backgroundColor: '#dbeafe', color: '#1d4ed8',
                    fontSize: '11px', fontWeight: '900', letterSpacing: '0.12em',
                    textTransform: 'uppercase', padding: '4px 14px', borderRadius: '99px',
                    fontFamily: "'Space Grotesk', sans-serif", whiteSpace: 'nowrap',
                  }}>
                    {group}
                  </span>
                  <div style={{ flex: 1, height: '1px', backgroundColor: '#bfdbfe' }} />
                </div>
              )}

              {Object.entries(groupMap[group]).map(([type, typeItems]) => (
              <section key={type} style={{ marginBottom: group ? '32px' : '48px' }}>
                {/* Cabeçalho do tipo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                  <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: group ? '16px' : '22px', fontWeight: '700', letterSpacing: '-0.03em', color: '#1a1c1c', margin: 0, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    {type}
                  </h2>
                  <div style={{ flex: 1, height: '2px', backgroundColor: '#f0efee' }} />
                  <span style={{ backgroundColor: '#f3f4f3', color: '#a8a29e', fontSize: '10px', fontWeight: '700', padding: '4px 12px', borderRadius: '99px', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                    {typeItems.length} {typeItems.length === 1 ? 'ITEM' : 'ITENS'}
                  </span>
                </div>

                {/* Tabela do grupo */}
                <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f9f9f8' }}>
                        {['ID', 'Referência', 'Descrição', 'Qtd', 'Dimensões (V / A)', 'M²', 'Material', 'Acabamento', 'Patrocinador', 'Status', 'Ações'].map(col => (
                          <th key={col} style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a8a29e', whiteSpace: 'nowrap' }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {typeItems.map(item => (
                        <tr
                          key={item.id}
                          className="group"
                          style={{ borderTop: '1px solid #f5f5f4', cursor: 'pointer', transition: 'background-color 0.1s' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9f9f8')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                          onClick={() => setSelectedItemForDetails(item)}
                          data-testid={`row-item-${item.id}`}
                        >
                          {/* ID */}
                          <td style={{ padding: '14px 20px' }}>
                            <span style={{ fontWeight: '700', color: '#f97316', fontSize: '12px', fontFamily: 'monospace' }} data-testid={`text-display-id-${item.id}`}>
                              #{item.displayId}
                            </span>
                          </td>
                          {/* Ref. */}
                          <td style={{ padding: '14px 20px' }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              {item.referenceUrl && (
                                <a href={item.referenceUrl} target="_blank" rel="noopener noreferrer" title="Ver referência" data-testid={`link-reference-table-${item.id}`}>
                                  <img src={item.referenceUrl} style={{ height: 32, width: 32, objectFit: 'cover', borderRadius: 4, border: '1px solid #e7e5e4' }} alt="Referência visual" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                                </a>
                              )}
                              {canUploadReference && item.status !== 'entregue' && (
                                <ObjectUploader
                                  onGetUploadParameters={getUploadUrl}
                                  onComplete={({ url }) => updateReferenceUrlMutation.mutate({ itemId: item.id, referenceUrl: url })}
                                  buttonVariant="ghost"
                                  buttonClassName="h-7 w-7 p-0"
                                >
                                  <Paperclip style={{ width: 13, height: 13, color: item.referenceUrl ? '#f97316' : '#a8a29e' }} title={item.referenceUrl ? "Substituir referência" : "Adicionar referência"} />
                                </ObjectUploader>
                              )}
                              {canUploadReference && item.referenceUrl && item.status !== 'entregue' && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground"
                                  title="Remover referência"
                                  data-testid={`button-remove-reference-table-${item.id}`}
                                  onClick={() => removeReferenceUrlMutation.mutate(item.id)}
                                >
                                  <X style={{ width: 11, height: 11 }} />
                                </Button>
                              )}
                              {(!canUploadReference || item.status === 'entregue') && !item.referenceUrl && (
                                <span style={{ color: '#a8a29e', fontSize: 13 }}>—</span>
                              )}
                            </div>
                          </td>
                          {/* Descrição */}
                          <td style={{ padding: '14px 20px' }}>
                            {item.isReuse && !['em_producao','produzido','entregue'].includes(item.status) && (
                              <div style={{ display: "inline-flex", alignItems: "center", gap: 4, backgroundColor: "#059669", color: "#ffffff", borderRadius: 4, padding: "2px 7px", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                                <RotateCcw style={{ width: 9, height: 9 }} /> Reaproveit.
                              </div>
                            )}
                            {item.description ? (
                              <span style={{ fontWeight: '500', color: '#1a1c1c', fontSize: '13px' }}>{item.description}</span>
                            ) : (
                              <span style={{ color: '#a8a29e', fontSize: '13px' }}>—</span>
                            )}
                          </td>
                          {/* Qtd */}
                          <td style={{ padding: '14px 20px', fontSize: '13px', color: '#1a1c1c' }}>
                            {String(item.quantity).padStart(2, '0')}
                          </td>
                          {/* Dimensões */}
                          <td style={{ padding: '14px 20px', fontSize: '12px', color: '#78716c', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
                            {(item.visualWidth && item.visualHeight) ? (
                              <>
                                {item.visualWidth} × {item.visualHeight}m
                                {(item.fileWidth && item.fileHeight) ? ` / ${item.fileWidth} × ${item.fileHeight}m` : ''}
                              </>
                            ) : '—'}
                          </td>
                          {/* M² */}
                          <td style={{ padding: '14px 20px', fontSize: '13px', fontWeight: '800', color: '#1a1c1c' }}>
                            {parseFloat(item.calculatedM2 || '0').toFixed(2)}
                          </td>
                          {/* Material */}
                          <td style={{ padding: '14px 20px', fontSize: '13px', color: '#78716c' }}>{item.material || '—'}</td>
                          {/* Acabamento */}
                          <td style={{ padding: '14px 20px', fontSize: '13px', color: '#78716c' }}>{item.finish || '—'}</td>
                          {/* Patrocinador */}
                          <td style={{ padding: '14px 20px', fontSize: '13px', color: '#a8a29e' }}>—</td>
                          {/* Status */}
                          <td style={{ padding: '14px 20px' }}>
                            <StatusBadge status={item.status} />
                          </td>
                          {/* Ações — visíveis só no hover via CSS group */}
                          <td style={{ padding: '14px 20px' }}>
                            <div
                              className="opacity-0 group-hover:opacity-100"
                              style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', alignItems: 'center', transition: 'opacity 0.15s' }}
                            >
                              {/* Toggle reaproveitamento — disponível enquanto não estiver em produção/entregue */}
                              {!isEditBlocked(item.status) && (
                                <button
                                  title={item.isReuse ? "Reaproveitamento ativo — clique para desativar" : "Marcar como reaproveitamento"}
                                  onClick={e => { e.stopPropagation(); updateItemIsReuseMutation.mutate({ itemId: item.id, isReuse: !item.isReuse }); }}
                                  data-testid={`button-reuse-item-${item.id}`}
                                  style={{ background: item.isReuse ? '#d1fae5' : 'none', border: item.isReuse ? '1px solid #6ee7b7' : 'none', borderRadius: '6px', padding: '6px', cursor: 'pointer', color: item.isReuse ? '#065f46' : '#a8a29e', transition: 'all 0.15s', display: 'flex', alignItems: 'center' }}
                                  onMouseEnter={e => { if (!item.isReuse) { e.currentTarget.style.color = '#065f46'; e.currentTarget.style.backgroundColor = '#d1fae5'; } }}
                                  onMouseLeave={e => { if (!item.isReuse) { e.currentTarget.style.color = '#a8a29e'; e.currentTarget.style.backgroundColor = 'transparent'; } }}
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </button>
                              )}
                              {isEditBlocked(item.status) ? (
                                <span title="Edição bloqueada" style={{ color: '#d1cdc9', padding: '6px', cursor: 'not-allowed' }} data-testid={`button-edit-item-${item.id}`}>
                                  <Lock className="h-4 w-4" />
                                </span>
                              ) : (
                                <button
                                  style={{ color: '#a8a29e', background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px', transition: 'color 0.15s, background-color 0.15s' }}
                                  onMouseEnter={e => { e.currentTarget.style.color = '#1a1c1c'; e.currentTarget.style.backgroundColor = '#f0efee'; }}
                                  onMouseLeave={e => { e.currentTarget.style.color = '#a8a29e'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                                  onClick={e => { e.stopPropagation(); handleEditItem(item); }}
                                  data-testid={`button-edit-item-${item.id}`}
                                  title="Editar peça" aria-label="Editar peça"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                              )}
                              <button
                                style={{ color: '#a8a29e', background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px', transition: 'color 0.15s, background-color 0.15s' }}
                                onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.backgroundColor = '#fef2f2'; }}
                                onMouseLeave={e => { e.currentTarget.style.color = '#a8a29e'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                                onClick={e => { e.stopPropagation(); handleDeleteItem(item.id); }}
                                data-testid={`button-delete-item-${item.id}`}
                                title="Excluir peça" aria-label="Excluir peça"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
            </Fragment>
          ))}
        </div>
      )}

      {/* Dialog de Detalhes do Item */}
      <ItemDetailsDialog
        item={selectedItemForDetails}
        auditLogs={auditLogs}
        open={!!selectedItemForDetails}
        onOpenChange={(open) => !open && setSelectedItemForDetails(null)}
      />

      <AlertDialog open={!!deletingItemId} onOpenChange={() => setDeletingItemId(null)}>
        <AlertDialogContent style={{ maxWidth: "400px", backgroundColor: "#ffffff", borderRadius: "16px", padding: "32px", border: "none", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
          <AlertDialogHeader style={{ padding: 0, marginBottom: "24px" }}>
            <AlertDialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "20px", fontWeight: 900, letterSpacing: "-0.03em", color: "#1a1c1c" }}>
              Confirmar Exclusão
            </AlertDialogTitle>
            <AlertDialogDescription style={{ fontSize: "14px", color: "#78716c", lineHeight: 1.6, marginTop: "6px" }}>
              Tem certeza que deseja excluir esta peça? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter style={{ padding: 0, display: "flex", flexDirection: "row", justifyContent: "flex-end", gap: "10px" }}>
            <AlertDialogCancel
              style={{ padding: "9px 20px", backgroundColor: "transparent", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 600, color: "#78716c", cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f3f4f3")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingItemId && deleteItemMutation.mutate(deletingItemId)}
              data-testid="button-confirm-delete-item"
              style={{ padding: "9px 20px", backgroundColor: "#ef4444", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 700, color: "#ffffff", cursor: "pointer", transition: "background-color 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#dc2626")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#ef4444")}
            >
              {deleteItemMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog separado para editar item */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent style={{ maxWidth: "800px", width: "100%", padding: "0", backgroundColor: "#ffffff", borderRadius: "16px", overflow: "hidden", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>

          {/* Cabeçalho */}
          <DialogHeader style={{ padding: "24px 28px", borderBottom: "1px solid #eeeeed" }}>
            <div className="flex items-start gap-4">
              <div style={{ backgroundColor: "#fff7ed", padding: "12px", borderRadius: "10px", flexShrink: 0 }}>
                <Pencil className="h-5 w-5" style={{ color: "#f97316" }} />
              </div>
              <div>
                <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "24px", fontWeight: 900, letterSpacing: "-0.03em", color: "#1a1c1c", lineHeight: 1.1 }}>
                  {editingItem ? `#${editingItem.displayId?.toString().padStart(4, '0')} — ${editingItem.type}` : "Editar Peça"}
                </DialogTitle>
                <DialogDescription style={{ fontSize: "14px", fontWeight: 500, color: "#78716c", marginTop: "2px" }}>
                  {editingItem?.description || "Atualize as informações da peça"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editingItem) {
                updateItemMutation.mutate({ id: editingItem.id, data: formData });
              }
            }}
            style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}
          >
            <div className="scrollbar-visible" style={{ flex: 1, overflowY: "auto", padding: "32px 28px", display: "flex", flexDirection: "column", gap: "24px" }}>

              {/* Linha 1: Tipo (3fr) | Qtd. (1fr) | M2 Total (1fr) */}
              <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr 1fr", gap: "16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a8a29e" }}>Tipo de Peça</label>
                  <input
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    placeholder="Ex: Banner Lona Frontlight"
                    data-testid="input-edit-type"
                    style={{ width: "100%", backgroundColor: "#f3f4f3", border: "none", borderRadius: "8px", padding: "12px 16px", fontSize: "14px", fontWeight: 500, color: "#1a1c1c", outline: "none", transition: "box-shadow 0.15s" }}
                    onFocus={(e) => (e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.25)")}
                    onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a8a29e" }}>Qtd.</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                    data-testid="input-edit-quantity"
                    style={{ width: "100%", backgroundColor: "#f3f4f3", border: "none", borderRadius: "8px", padding: "12px 16px", fontSize: "14px", fontWeight: 500, color: "#1a1c1c", outline: "none", transition: "box-shadow 0.15s" }}
                    onFocus={(e) => (e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.25)")}
                    onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a8a29e" }}>M2 Total</label>
                  <input
                    readOnly
                    value={formData.fileWidth && formData.fileHeight
                      ? calculateM2(formData.quantity, parseFloat(formData.fileWidth) || 0, parseFloat(formData.fileHeight) || 0).toFixed(2) + " m²"
                      : "—"
                    }
                    style={{ width: "100%", backgroundColor: "#f3f4f3", border: "none", borderRadius: "8px", padding: "12px 16px", fontSize: "14px", fontWeight: 700, color: formData.fileWidth && formData.fileHeight ? "#f97316" : "#a8a29e", outline: "none", cursor: "default" }}
                  />
                </div>
              </div>

              {/* Reaproveitamento — banner topo */}
              <div
                data-testid="toggle-is-reuse"
                onClick={() => setFormData({ ...formData, isReuse: !formData.isReuse })}
                style={{
                  backgroundColor: formData.isReuse ? "#059669" : "#f3f4f3",
                  border: `2px solid ${formData.isReuse ? "#047857" : "#e5e7eb"}`,
                  padding: "14px 18px", borderRadius: "10px",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ backgroundColor: formData.isReuse ? "rgba(255,255,255,0.2)" : "#e5e7eb", borderRadius: "8px", padding: "8px", flexShrink: 0 }}>
                    <RotateCcw style={{ width: 18, height: 18, color: formData.isReuse ? "#ffffff" : "#6b7280" }} />
                  </div>
                  <div>
                    <p style={{ fontSize: "14px", fontWeight: 700, color: formData.isReuse ? "#ffffff" : "#374151", margin: 0 }}>Reaproveitamento</p>
                    <p style={{ fontSize: "12px", color: formData.isReuse ? "rgba(255,255,255,0.8)" : "#9ca3af", margin: 0 }}>Gráfica entrega direto — sem etapa de produção</p>
                  </div>
                </div>
                <Checkbox
                  checked={formData.isReuse}
                  onCheckedChange={(checked) => setFormData({ ...formData, isReuse: !!checked })}
                  data-testid="checkbox-is-reuse"
                  style={{ width: "20px", height: "20px", accentColor: "#ffffff", pointerEvents: "none", flexShrink: 0 }}
                />
              </div>

              {/* Linha 2: Descrição */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a8a29e" }}>Descrição do Item</label>
                <input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ex: Banner para fachada lateral com ilhós"
                  data-testid="input-edit-description"
                  style={{ width: "100%", backgroundColor: "#f3f4f3", border: "none", borderRadius: "8px", padding: "12px 16px", fontSize: "14px", fontWeight: 500, color: "#1a1c1c", outline: "none", transition: "box-shadow 0.15s" }}
                  onFocus={(e) => (e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.25)")}
                  onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
                />
              </div>

              {/* Linha 3: Dimensões — painel bg */}
              <div style={{ backgroundColor: "rgba(243,244,243,0.6)", padding: "24px", borderRadius: "12px" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a8a29e", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#f97316", display: "inline-block", flexShrink: 0 }}></span>
                  Dimensões de Produção
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px" }}>
                  {[
                    { label: "Visual Larg.", key: "visualWidth", orange: true, testId: "input-edit-visual-width" },
                    { label: "Visual Alt.", key: "visualHeight", orange: true, testId: "input-edit-visual-height" },
                    { label: "Arquivo Larg.", key: "fileWidth", orange: false, testId: "input-edit-file-width" },
                    { label: "Arquivo Alt.", key: "fileHeight", orange: false, testId: "input-edit-file-height" },
                  ].map((dim) => (
                    <div key={dim.key} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <label style={{ fontSize: "10px", fontWeight: 700, color: "#78716c", display: "flex", alignItems: "center", gap: "5px" }}>
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: dim.orange ? "#f97316" : "#a8a29e", display: "inline-block", flexShrink: 0 }}></span>
                        {dim.label}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={(formData as any)[dim.key]}
                        onChange={(e) => setFormData({ ...formData, [dim.key]: e.target.value })}
                        placeholder="0.00"
                        data-testid={dim.testId}
                        style={{ width: "100%", backgroundColor: "#ffffff", border: "none", borderRadius: "8px", padding: "8px 12px", fontSize: "14px", fontWeight: 500, color: "#1a1c1c", outline: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", transition: "box-shadow 0.15s" }}
                        onFocus={(e) => (e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.25)")}
                        onBlur={(e) => (e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.08)")}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Linha 4: Material | Acabamento | Patrocinador */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a8a29e" }}>Material</label>
                  <input
                    list="edit-materials-list"
                    value={formData.material}
                    onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                    placeholder="Selecione ou escreva..."
                    data-testid="input-edit-material"
                    style={{ width: "100%", backgroundColor: "#f3f4f3", border: "none", borderRadius: "8px", padding: "12px 16px", fontSize: "14px", fontWeight: 500, color: "#1a1c1c", outline: "none", transition: "box-shadow 0.15s" }}
                    onFocus={(e) => (e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.25)")}
                    onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
                  />
                  <datalist id="edit-materials-list">
                    {materialOptions.map(m => <option key={m} value={m} />)}
                  </datalist>
                  {formData.material.trim() && !materialOptions.some(m => m.toLowerCase() === formData.material.trim().toLowerCase()) && (
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "#b45309", display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                      <Plus style={{ width: 12, height: 12, flexShrink: 0 }} /> Novo material — será criado no catálogo ao salvar
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a8a29e" }}>Acabamento</label>
                  <input
                    list="edit-finishes-list"
                    value={formData.finish}
                    onChange={(e) => setFormData({ ...formData, finish: e.target.value })}
                    placeholder="Selecione ou escreva..."
                    data-testid="input-edit-finish"
                    style={{ width: "100%", backgroundColor: "#f3f4f3", border: "none", borderRadius: "8px", padding: "12px 16px", fontSize: "14px", fontWeight: 500, color: "#1a1c1c", outline: "none", transition: "box-shadow 0.15s" }}
                    onFocus={(e) => (e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.25)")}
                    onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
                  />
                  <datalist id="edit-finishes-list">
                    {finishOptions.map(f => <option key={f} value={f} />)}
                  </datalist>
                  {formData.finish.trim() && !finishOptions.some(f => f.toLowerCase() === formData.finish.trim().toLowerCase()) && (
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "#065f46", display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                      <Plus style={{ width: 12, height: 12, flexShrink: 0 }} /> Novo acabamento — será criado no catálogo ao salvar
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a8a29e" }}>Patrocinador</label>
                  <Select
                    value={formData.sponsorId || "none"}
                    onValueChange={(value) => setFormData({ ...formData, sponsorId: value === "none" ? "" : value })}
                  >
                    <SelectTrigger
                      className="border-0 focus:ring-0 focus:ring-offset-0 text-sm font-medium"
                      style={{ backgroundColor: "#f3f4f3", borderRadius: "8px", padding: "12px 16px", height: "auto", color: "#1a1c1c" }}
                      data-testid="select-edit-sponsor"
                    >
                      <SelectValue placeholder="Nenhum" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {sponsors.map(sponsor => (
                        <SelectItem key={sponsor.id} value={sponsor.id}>
                          {sponsor.name}
                          {sponsor.company && ` (${sponsor.company})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Linha 5: Referência (opcional) */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a8a29e" }}>
                  Referência <span style={{ color: "#c9c4c0", fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: "10px" }}>(opcional — cole um print com Ctrl+V ou anexe uma imagem, em alta qualidade)</span>
                </label>
                {(localRefPreview || formData.referenceUrl) ? (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    {/* Thumbnail preview */}
                    <div style={{ flexShrink: 0, width: 80, height: 80, borderRadius: 8, overflow: "hidden", border: "1px solid #e7e5e4", backgroundColor: "#f5f5f4" }}>
                      <img
                        src={localRefPreview || formData.referenceUrl}
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        alt="Referência visual"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                    {/* Ações */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, justifyContent: "center", paddingTop: 4 }}>
                      <ObjectUploader
                        onGetUploadParameters={getUploadUrl}
                        onFileSelect={(_file, previewUrl) => setLocalRefPreview(previewUrl)}
                        onComplete={({ url }) => { setFormData(f => ({ ...f, referenceUrl: url })); setLocalRefPreview(""); }}
                        buttonVariant="outline"
                      >
                        <Paperclip className="h-3 w-3 mr-1" /> Trocar imagem
                      </ObjectUploader>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive justify-start px-2"
                        onClick={() => { setFormData(f => ({ ...f, referenceUrl: "" })); setLocalRefPreview(""); }}
                        data-testid="button-remove-reference"
                      >
                        <X className="h-3 w-3 mr-1" /> Remover
                      </Button>
                    </div>
                  </div>
                ) : (
                  <ObjectUploader
                    onGetUploadParameters={getUploadUrl}
                    onFileSelect={(_file, previewUrl) => setLocalRefPreview(previewUrl)}
                    onComplete={({ url }) => { setFormData(f => ({ ...f, referenceUrl: url })); setLocalRefPreview(""); }}
                    buttonVariant="outline"
                  >
                    <Paperclip className="h-3.5 w-3.5 mr-1.5" /> Adicionar referência visual
                  </ObjectUploader>
                )}
              </div>

              {/* Linha 6: Observações */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a8a29e" }}>Observações Internas</label>
                <textarea
                  value={formData.observations}
                  onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                  placeholder="Reforço, instruções especiais ou observações de produção..."
                  rows={3}
                  data-testid="textarea-edit-observations"
                  style={{ width: "100%", backgroundColor: "#f3f4f3", border: "none", borderRadius: "8px", padding: "12px 16px", fontSize: "14px", fontWeight: 500, color: "#1a1c1c", outline: "none", resize: "none", fontFamily: "inherit", transition: "box-shadow 0.15s" }}
                  onFocus={(e) => (e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.25)")}
                  onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
                />
              </div>

              {/* Pular Aprovação — apenas Admin */}
              {user?.role === 'admin' && (
                <div style={{ backgroundColor: "#fffbeb", borderLeft: "4px solid #fbbf24", padding: "14px 16px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                    <p style={{ fontSize: "14px", fontWeight: 500, color: "#92400e" }}>Pular aprovação técnica <span style={{ fontSize: "12px", color: "#b45309" }}>(Apenas Administrativo)</span></p>
                  </div>
                  <Checkbox
                    id="skip-approval-edit"
                    checked={formData.skipApproval}
                    onCheckedChange={(checked) => setFormData({ ...formData, skipApproval: !!checked })}
                    data-testid="checkbox-skip-approval"
                    style={{ width: "20px", height: "20px", accentColor: "#d97706" }}
                  />
                </div>
              )}
            </div>

            {/* Rodapé */}
            <div style={{ padding: "20px 28px", backgroundColor: "#f3f4f3", display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button
                type="button"
                onClick={() => {
                  setEditDialogOpen(false);
                  setEditingItem(null);
                }}
                data-testid="button-cancel-edit"
                style={{ padding: "10px 24px", backgroundColor: "transparent", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 700, color: "#78716c", cursor: "pointer", transition: "background-color 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#e8e8e7")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={updateItemMutation.isPending}
                data-testid="button-save-edit"
                style={{ padding: "10px 32px", backgroundColor: "#f97316", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 700, color: "#ffffff", cursor: "pointer", boxShadow: "0 4px 12px rgba(249,115,22,0.25)", transition: "filter 0.15s, transform 0.1s", opacity: updateItemMutation.isPending ? 0.7 : 1 }}
                onMouseEnter={(e) => { if (!updateItemMutation.isPending) e.currentTarget.style.filter = "brightness(1.08)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
                onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.97)"; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
              >
                {updateItemMutation.isPending ? "Salvando..." : "Salvar Alterações"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog para vincular itens ao patrocinador */}
      <Dialog open={linkItemsDialogOpen} onOpenChange={setLinkItemsDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Gerenciar Itens do Patrocinador
            </DialogTitle>
            <DialogDescription>
              {selectedSponsorForLinking && (
                <span className="font-medium text-foreground">
                  {selectedSponsorForLinking.name}
                  {selectedSponsorForLinking.company && (
                    <span className="text-muted-foreground ml-1">({selectedSponsorForLinking.company})</span>
                  )}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {/* Estatísticas */}
          {selectedSponsorForLinking && (() => {
            const alreadyLinked = items.filter(item => item.sponsorId === selectedSponsorForLinking.id);
            const availableItems = items.filter(item => !item.sponsorId || item.sponsorId === selectedSponsorForLinking.id);
            
            return (
              <div className="grid grid-cols-3 gap-3 pb-4 border-b">
                <div className="text-center p-3 bg-primary/5 rounded-lg">
                  <div className="text-2xl font-bold text-primary">{items.length}</div>
                  <div className="text-xs text-muted-foreground">Total de Itens</div>
                </div>
                <div className="text-center p-3 bg-green-500/10 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{alreadyLinked.length}</div>
                  <div className="text-xs text-muted-foreground">Já Vinculados</div>
                </div>
                <div className="text-center p-3 bg-orange-500/10 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">{availableItems.length - alreadyLinked.length}</div>
                  <div className="text-xs text-muted-foreground">Disponíveis</div>
                </div>
              </div>
            );
          })()}
          
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum item disponível neste evento
              </div>
            ) : (
              <>
                {/* Itens já vinculados */}
                {selectedSponsorForLinking && (() => {
                  const linkedItems = items.filter(item => item.sponsorId === selectedSponsorForLinking.id);
                  if (linkedItems.length === 0) return null;
                  
                  return (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-1 w-1 rounded-full bg-green-600"></div>
                        <h4 className="text-sm font-semibold text-foreground">Peças Vinculadas ({linkedItems.length})</h4>
                      </div>
                      <div className="space-y-2">
                        {linkedItems.map((item) => (
                          <div
                            key={item.id}
                            className={cn(
                              "flex items-center gap-3 p-3 border border-green-200 bg-green-50/50 rounded-lg hover-elevate cursor-pointer",
                              selectedItemsToLink.includes(item.id) && "border-primary bg-primary/5"
                            )}
                            onClick={() => {
                              if (selectedItemsToLink.includes(item.id)) {
                                setSelectedItemsToLink(selectedItemsToLink.filter(id => id !== item.id));
                              } else {
                                setSelectedItemsToLink([...selectedItemsToLink, item.id]);
                              }
                            }}
                            data-testid={`item-linked-${item.id}`}
                          >
                            <Checkbox
                              checked={selectedItemsToLink.includes(item.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedItemsToLink([...selectedItemsToLink, item.id]);
                                } else {
                                  setSelectedItemsToLink(selectedItemsToLink.filter(id => id !== item.id));
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              data-testid={`checkbox-link-item-${item.id}`}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-xs font-medium bg-white">
                                  {item.type}
                                </Badge>
                                <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 border-green-200">
                                  Vinculado
                                </Badge>
                              </div>
                              {item.description && (
                                <div className="text-sm text-foreground">{item.description}</div>
                              )}
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                <span>Qtd: {item.quantity}</span>
                                {item.material && <span>• {item.material}</span>}
                                {item.finish && <span>• {item.finish}</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Itens disponíveis */}
                {selectedSponsorForLinking && (() => {
                  const availableItems = items.filter(item => !item.sponsorId);
                  
                  return (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-1 w-1 rounded-full bg-orange-600"></div>
                        <h4 className="text-sm font-semibold text-foreground">Peças Disponíveis ({availableItems.length})</h4>
                      </div>
                      {availableItems.length === 0 ? (
                        <div className="text-center py-8 px-4 border border-dashed rounded-lg bg-muted/20">
                          <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                          <p className="text-sm text-muted-foreground">Nenhum item disponível</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Todos os itens deste evento já estão vinculados a patrocinadores
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {availableItems.map((item) => (
                            <div
                              key={item.id}
                              className={cn(
                                "flex items-center gap-3 p-3 border rounded-lg hover-elevate cursor-pointer",
                                selectedItemsToLink.includes(item.id) && "border-primary bg-primary/5"
                              )}
                              onClick={() => {
                                if (selectedItemsToLink.includes(item.id)) {
                                  setSelectedItemsToLink(selectedItemsToLink.filter(id => id !== item.id));
                                } else {
                                  setSelectedItemsToLink([...selectedItemsToLink, item.id]);
                                }
                              }}
                              data-testid={`item-available-${item.id}`}
                            >
                              <Checkbox
                                checked={selectedItemsToLink.includes(item.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedItemsToLink([...selectedItemsToLink, item.id]);
                                  } else {
                                    setSelectedItemsToLink(selectedItemsToLink.filter(id => id !== item.id));
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                                data-testid={`checkbox-link-item-${item.id}`}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className="text-xs font-medium">
                                    {item.type}
                                  </Badge>
                                </div>
                                {item.description && (
                                  <div className="text-sm text-foreground">{item.description}</div>
                                )}
                                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                  <span>Qtd: {item.quantity}</span>
                                  {item.material && <span>• {item.material}</span>}
                                  {item.finish && <span>• {item.finish}</span>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

              </>
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t mt-4">
            <div className="text-sm">
              {selectedItemsToLink.length > 0 ? (
                <span className="font-medium text-foreground">
                  {selectedItemsToLink.length} {selectedItemsToLink.length === 1 ? 'peça selecionada' : 'peças selecionadas'}
                </span>
              ) : (
                <span className="text-muted-foreground">Nenhum peça selecionada</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setLinkItemsDialogOpen(false);
                  setSelectedItemsToLink([]);
                  setSelectedSponsorForLinking(null);
                }}
                data-testid="button-cancel-link-items"
              >
                Fechar
              </Button>
              {selectedItemsToLink.length > 0 && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (selectedSponsorForLinking && selectedItemsToLink.length > 0) {
                        linkItemsToSponsorMutation.mutate({
                          itemIds: selectedItemsToLink,
                          sponsorId: ""
                        });
                      }
                    }}
                    disabled={linkItemsToSponsorMutation.isPending}
                    data-testid="button-unlink-items"
                  >
                    {linkItemsToSponsorMutation.isPending ? "Processando..." : "Desvincular"}
                  </Button>
                  <Button
                    onClick={() => {
                      if (selectedSponsorForLinking && selectedItemsToLink.length > 0) {
                        linkItemsToSponsorMutation.mutate({
                          itemIds: selectedItemsToLink,
                          sponsorId: selectedSponsorForLinking.id
                        });
                      }
                    }}
                    disabled={linkItemsToSponsorMutation.isPending}
                    data-testid="button-confirm-link-items"
                  >
                    {linkItemsToSponsorMutation.isPending ? "Processando..." : "Vincular"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Importar Excel (split-panel) ───────────────────────────── */}
      <ImportXlsxDialog
        open={importDialogOpen}
        onOpenChangeClose={() => {
          setImportDialogOpen(false);
          setImportFile(null);
          setImportPreview(null);
          setImportPreviewItems(null);
          setImportDuplicateWarning(null);
        }}
        importFile={importFile}
        setImportFile={setImportFile}
        setImportPreview={setImportPreview}
        importPreviewItems={importPreviewItems}
        setImportPreviewItems={setImportPreviewItems}
        importFileName={importFileName}
        importSearch={importSearch}
        setImportSearch={setImportSearch}
        eventSponsorsList={eventSponsorsList}
        previewXlsxPending={previewXlsxMutation.isPending}
        onPreview={(file) => previewXlsxMutation.mutate({ file })}
        confirmImportPending={confirmImportMutation.isPending}
        onConfirmImport={(items, fileName, force) => confirmImportMutation.mutate({ items, fileName, force })}
        importDuplicateWarning={importDuplicateWarning}
        setImportDuplicateWarning={setImportDuplicateWarning}
      />
      {/* ── Dialog: Clonar Evento ──────────────────────────────────────────── */}
      <CloneItemsDialog
        open={cloneDialogOpen}
        onOpenChange={setCloneDialogOpen}
        eventId={eventId}
        eventName={event?.name}
        allEvents={allEvents}
        cloneSourceId={cloneSourceId}
        setCloneSourceId={setCloneSourceId}
        isCloning={cloneItemsMutation.isPending}
        onConfirmClone={() => { if (cloneSourceId) cloneItemsMutation.mutate({ sourceEventId: cloneSourceId }); }}
      />

    </div>
  );
}
