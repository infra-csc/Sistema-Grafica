import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, ArrowLeft, Calendar, Truck, AlertCircle, List, Package, Package2, Pencil, Trash2, Check, ChevronsUpDown, Building2, Loader2, User, History, Lock } from "lucide-react";
import { Fragment, useState, useEffect } from "react";
import type { Sponsor } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import { calculateM2 } from "@/lib/calculateM2";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CommentsSection } from "@/components/comments-section";
import { ItemDetailsDialog } from "@/components/item-details-dialog";

const itemTypes = ["2x1", "Arena", "Halter", "Palco", "Painel Rosto", "Percurso", "Pórtico", "Prismas", "Qd Fotos", "Rolo", "Stand", "Testeiras", "WindBanner"];
const materials = ["Adesivo", "Lona", "Sanett", "Tecido"];
const finishes = ["Dupla Face", "Ilhós", "Impresso", "Recorte", "Refile"];

export default function EventDetail() {
  const { hasPermission, user } = useAuth();
  const [, params] = useRoute("/eventos/:id");
  const eventId = params?.id;
  const [open, setOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState(true);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [typePopoverOpen, setTypePopoverOpen] = useState(false);
  const [materialPopoverOpen, setMaterialPopoverOpen] = useState(false);
  const [finishPopoverOpen, setFinishPopoverOpen] = useState(false);
  const [customTypeInput, setCustomTypeInput] = useState("");
  const [customMaterialInput, setCustomMaterialInput] = useState("");
  const [customFinishInput, setCustomFinishInput] = useState("");
  const [linkItemsDialogOpen, setLinkItemsDialogOpen] = useState(false);
  const [selectedSponsorForLinking, setSelectedSponsorForLinking] = useState<Sponsor | null>(null);
  const [selectedItemsToLink, setSelectedItemsToLink] = useState<string[]>([]);
  const [itemSponsorsMap, setItemSponsorsMap] = useState<Record<string, string[]>>({});
  const [selectedItemForDetails, setSelectedItemForDetails] = useState<any | null>(null);
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
  });

  const { data: event, isLoading: loadingEvent } = useQuery<any>({
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

  // Ordenar itens por tipo
  const items = [...rawItems].sort((a, b) => a.type.localeCompare(b.type));

  const { data: standardItems = [] } = useQuery<any[]>({
    queryKey: ["/api/standard-items"],
    placeholderData: (previousData: any) => previousData,
    refetchOnWindowFocus: false,
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
          status: 'requested',
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
      const fileWidth = parseFloat(data.fileWidth);
      const fileHeight = parseFloat(data.fileHeight);
      
      const calculatedM2 = calculateM2(
        data.quantity,
        fileWidth,
        fileHeight
      ).toFixed(2);
      
      const itemData: any = {
        ...data,
        area: parseFloat(data.visualWidth),  // Manter area para compatibilidade com backend
        visual: parseFloat(data.visualHeight),  // Manter visual para compatibilidade com backend
        calculatedM2,
      };
      
      // Remover sponsorId se estiver vazio
      if (!data.sponsorId) {
        delete itemData.sponsorId;
      }
      
      return await apiRequest("PATCH", `/api/items/${id}`, itemData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      setEditingItem(null);
      setOpen(false);
      setBulkMode(false);
      toast({
        title: "Peça atualizada",
        description: "A peça foi atualizada com sucesso",
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

  // Mutation para atualizar skipApproval de um item
  const updateItemSkipApprovalMutation = useMutation({
    mutationFn: async ({ itemId, skipApproval }: { itemId: string, skipApproval: boolean }) => {
      await apiRequest("PATCH", `/api/items/${itemId}`, { skipApproval });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar configuração",
        description: error.message,
        variant: "destructive",
      });
    },
  });

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

  const BLOCKED_EDIT_STATUSES = ["pronto_para_producao", "liberado", "em_producao", "produzido", "entregue"];
  const isEditBlocked = (status: string) => BLOCKED_EDIT_STATUSES.includes(status);

  const handleEditItem = (item: any) => {
    if (isEditBlocked(item.status)) return;
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
    });
    setEditDialogOpen(true);
  };

  const handleDeleteItem = (id: string) => {
    setDeletingItemId(id);
  };

  const handleCloseDialog = () => {
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
              <p className="text-muted-foreground">Evento não encontrado</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Agrupar itens por tipo para renderização em seções
  const groupedItems: Record<string, typeof items> = {};
  items.forEach(item => {
    if (!groupedItems[item.type]) groupedItems[item.type] = [];
    groupedItems[item.type].push(item);
  });
  const sortedTypes = Object.keys(groupedItems).sort();

  return (
    <div style={{ padding: '40px', minHeight: '100vh' }}>
      {/* Breadcrumb */}
      <Link href="/eventos">
        <a
          data-testid="button-back"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '500', color: '#78716c', marginBottom: '16px', textDecoration: 'none', transition: 'color 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#f97316')}
          onMouseLeave={e => (e.currentTarget.style.color = '#78716c')}
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para eventos
        </a>
      </Link>

      {/* Header principal */}
      <div style={{ marginBottom: '48px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
          <div>
            <h1
              data-testid="title-event-name"
              style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '48px', fontWeight: '700', letterSpacing: '-0.03em', color: '#1a1c1c', lineHeight: 1.05, margin: 0 }}
            >
              {event.name}
            </h1>
            <p style={{ color: '#a8a29e', fontSize: '14px', fontWeight: '500', letterSpacing: '0.02em', marginTop: '8px' }}>
              Criado em {new Date(event.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setEditingItem(null);
                setBulkMode(true);
                setOpen(true);
              }}
              data-testid="button-add-item"
              style={{ backgroundColor: '#1c1917', color: '#ffffff', padding: '10px 24px', borderRadius: '6px', fontWeight: '700', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', border: 'none', cursor: 'pointer', transition: 'background-color 0.15s, transform 0.1s' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#292524')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#1c1917')}
              onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.96)')}
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
                className={`${bulkMode && !editingItem ? "max-w-[95vw] h-[90vh] p-0 overflow-hidden gap-0 flex flex-col" : "sm:max-w-lg max-h-[90vh] overflow-y-auto p-0 gap-0"} [&>button:last-child]:hidden`}
                onInteractOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
              >
                {/* HEADER */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 32px', backgroundColor: '#f9f9f8', borderBottom: '1px solid rgba(231,229,228,0.5)' }}>
                  <div>
                    <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '22px', fontWeight: '700', letterSpacing: '-0.03em', color: '#1a1c1c', margin: 0 }}>
                      {editingItem ? "Editar Peça" : (bulkMode ? "Entrada Rápida" : "Nova Peça")}
                    </DialogTitle>
                    <DialogDescription style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a8a29e', marginTop: '2px' }}>
                      {editingItem ? "Editar peça de produção" : (bulkMode ? "Modo Lote — NORTE Apex" : "Peça de Produção Gráfica")}
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
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  <BulkItemEntry
                    eventId={eventId!}
                    standardItems={standardItems}
                    sponsors={sponsors}
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
                          <label style={{ display: 'block', marginBottom: '6px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a8a29e' }}>Tipo de Peça</label>
                          <Popover open={typePopoverOpen} onOpenChange={setTypePopoverOpen}>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                role="combobox"
                                aria-expanded={typePopoverOpen}
                                data-testid="select-item-type"
                                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: '#f0efee', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '14px', color: formData.type ? '#1a1c1c' : '#a8a29e', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
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
                                    {materials.map(material => (
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
                                    {finishes.map(finish => (
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

        {/* Chips de data — pill rounded-full */}
        <div style={{ display: 'flex', gap: '16px', marginTop: '0', flexWrap: 'wrap' }}>
          <div style={{ backgroundColor: '#f3f4f3', borderRadius: '99px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Calendar className="h-4 w-4 flex-shrink-0" style={{ color: '#f97316' }} />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
              <span style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '-0.02em', color: '#78716c' }}>Início</span>
              <span style={{ fontSize: '14px', fontWeight: '700', color: '#1a1c1c', marginTop: '2px' }}>
                {new Date(event.startDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </span>
            </div>
          </div>
          <div style={{ backgroundColor: '#f3f4f3', borderRadius: '99px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Truck className="h-4 w-4 flex-shrink-0" style={{ color: '#f97316' }} />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
              <span style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '-0.02em', color: '#78716c' }}>Saída</span>
              <span style={{ fontSize: '14px', fontWeight: '700', color: '#1a1c1c', marginTop: '2px' }}>
                {new Date(event.truckDepartureDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} · {new Date(event.truckDepartureDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        </div>

        {/* Prazos do evento */}
        {(() => {
          const start = new Date(event.truckDepartureDate);
          // Ajusta fim de semana: sábado→sexta, domingo→segunda (exceto Produção Gráfica)
          const adjustWeekend = (date: Date, skipAdjust: boolean): { date: Date; adjusted: 'fri' | 'mon' | null } => {
            if (skipAdjust) return { date, adjusted: null };
            const dow = date.getDay();
            if (dow === 6) { // sábado → sexta
              const d = new Date(date); d.setDate(d.getDate() - 1); return { date: d, adjusted: 'fri' };
            }
            if (dow === 0) { // domingo → segunda
              const d = new Date(date); d.setDate(d.getDate() + 1); return { date: d, adjusted: 'mon' };
            }
            return { date, adjusted: null };
          };
          const deadlines = [
            { label: 'Lista de Imagens', days: event.deadlineListaImagens ?? -25, color: '#8b5cf6', allDays: false },
            { label: 'Entrega de Layouts', days: event.deadlineEntregaLayouts ?? -20, color: '#3b82f6', allDays: false },
            { label: 'Aprovação de Layout', days: event.deadlineAprovacaoLayout ?? -12, color: '#f59e0b', allDays: false },
            { label: 'Revisão de Lista', days: event.deadlineRevisaoLista ?? -8, color: '#10b981', allDays: false },
            { label: 'Produção Gráfica', days: event.deadlineProducaoGrafica ?? -1, color: '#f97316', allDays: true },
          ];
          return (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
              {deadlines.map(({ label, days, color, allDays }) => {
                const raw = new Date(start);
                raw.setDate(raw.getDate() + days);
                const { date, adjusted } = adjustWeekend(raw, allDays);
                return (
                  <div key={label} title={adjusted === 'fri' ? `${label} — movido de sáb para sex` : adjusted === 'mon' ? `${label} — movido de dom para seg` : label} style={{ backgroundColor: '#f3f4f3', borderRadius: '99px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
                      <span style={{ fontSize: '9px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#78716c' }}>{label}</span>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: '#1a1c1c', marginTop: '1px' }}>
                        {date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        {adjusted === 'fri' && <span style={{ fontSize: '9px', fontWeight: '600', color: '#f59e0b', marginLeft: '4px' }}>sex</span>}
                        {adjusted === 'mon' && <span style={{ fontSize: '9px', fontWeight: '600', color: '#f59e0b', marginLeft: '4px' }}>seg</span>}
                        <span style={{ fontSize: '10px', fontWeight: '500', color: '#a8a29e', marginLeft: '4px' }}>({days}d)</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Card de Peças em Rascunho */}
      {items.filter(item => item.status === 'draft').length > 0 && (
        <Card className="border-2 border-dashed border-muted-foreground/30 bg-muted/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Peças em Rascunho</CardTitle>
                <Badge variant="secondary" className="ml-2">
                  {items.filter(item => item.status === 'draft').length} {items.filter(item => item.status === 'draft').length === 1 ? 'item' : 'itens'}
                </Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Revise os itens abaixo e envie todos para Arte quando estiver pronto
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 mb-4">
              {items
                .filter(item => item.status === 'draft')
                .sort((a, b) => a.type.localeCompare(b.type))
                .map(item => (
                  <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg bg-card hover-elevate" data-testid={`draft-item-${item.id}`}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <Package className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{item.type}</span>
                          {item.description && <span className="text-sm text-muted-foreground truncate">— {item.description}</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.quantity} {item.quantity === 1 ? 'unidade' : 'unidades'} • {item.material} • {item.finish} • {parseFloat(item.calculatedM2).toFixed(2)}m²
                        </div>
                      </div>
                    </div>
                    {canManageEvent && (
                      <div className="flex items-center gap-1 ml-2">
                        {isEditBlocked(item.status) ? (
                          <div
                            className="p-1.5 rounded-md"
                            title="Edição bloqueada — item já liberado para gráfica"
                            style={{ color: "#a8a29e", cursor: "not-allowed" }}
                          >
                            <Lock className="h-3.5 w-3.5" />
                          </div>
                        ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleEditItem(item)}
                          data-testid={`button-edit-draft-${item.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 hover:bg-destructive/10"
                          onClick={() => setDeletingItemId(item.id)}
                          data-testid={`button-delete-draft-${item.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
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
                onClick={() => submitDraftsMutation.mutate()}
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
          {sortedTypes.map(type => {
            const typeItems = groupedItems[type];
            return (
              <section key={type}>
                {/* Cabeçalho do grupo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                  <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '22px', fontWeight: '700', letterSpacing: '-0.03em', color: '#1a1c1c', margin: 0, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
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
                        {['ID', 'Descrição', 'Qtd', 'Dimensões (V / A)', 'M²', 'Material', 'Acabamento', 'Patrocinador', 'Status', 'Ações'].map(col => (
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
                          {/* Descrição */}
                          <td style={{ padding: '14px 20px' }}>
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
                              style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', transition: 'opacity 0.15s' }}
                            >
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
            );
          })}
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
                  Editar Peça
                </DialogTitle>
                <DialogDescription style={{ fontSize: "14px", fontWeight: 500, color: "#78716c", marginTop: "2px" }}>
                  {editingItem ? `#${editingItem.displayId} · ${editingItem.type}` : "Atualize as informações da peça"}
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
            <div style={{ flex: 1, overflowY: "auto", padding: "32px 28px", display: "flex", flexDirection: "column", gap: "24px" }}>

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
                    value={formData.material}
                    onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                    placeholder="Ex: Lona 440g"
                    data-testid="input-edit-material"
                    style={{ width: "100%", backgroundColor: "#f3f4f3", border: "none", borderRadius: "8px", padding: "12px 16px", fontSize: "14px", fontWeight: 500, color: "#1a1c1c", outline: "none", transition: "box-shadow 0.15s" }}
                    onFocus={(e) => (e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.25)")}
                    onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a8a29e" }}>Acabamento</label>
                  <input
                    value={formData.finish}
                    onChange={(e) => setFormData({ ...formData, finish: e.target.value })}
                    placeholder="Ex: Bainha e Ilhós"
                    data-testid="input-edit-finish"
                    style={{ width: "100%", backgroundColor: "#f3f4f3", border: "none", borderRadius: "8px", padding: "12px 16px", fontSize: "14px", fontWeight: 500, color: "#1a1c1c", outline: "none", transition: "box-shadow 0.15s" }}
                    onFocus={(e) => (e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.25)")}
                    onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
                  />
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

              {/* Linha 5: Observações */}
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
    </div>
  );
}
