import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, ArrowLeft, Calendar, Truck, AlertCircle, List, Package, Package2, Pencil, Trash2, Check, ChevronsUpDown, Building2, Loader2, User, History } from "lucide-react";
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
        title: "Item adicionado",
        description: "O item foi adicionado ao evento",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao adicionar item",
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
        title: "✅ Itens salvos com sucesso!",
        description: `${quantidade} ${quantidade === 1 ? 'item adicionado' : 'itens adicionados'}`,
      });
      
      // Atualizar com dados reais do servidor (substitui os temporários)
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      
      // NÃO FECHA O DIALOG - deixa usuário fechar quando quiser
      // Assim não causa re-fetches múltiplos e não fica tela branca
    },
    onError: (error: any, newItems: any, context: any) => {
      // Se der erro, reverter para dados anteriores
      if (context?.previousItems) {
        queryClient.setQueryData(["/api/items", eventId], context.previousItems);
      }
      
      toast({
        title: "Erro ao adicionar itens",
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
        title: "Item atualizado",
        description: "O item foi atualizado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar item",
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
        title: "Item excluído",
        description: "O item foi excluído com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir item",
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
      toast({
        title: "Itens enviados para Arte",
        description: `${data.count} ${data.count === 1 ? 'item foi enviado' : 'itens foram enviados'} com sucesso`,
      });
    },
    onError: (error: any) => {
      const message = error.message || "Erro desconhecido";
      
      if (message.includes("Nenhum item em rascunho")) {
        toast({
          title: "Nenhum item para enviar",
          description: "Não há itens em rascunho neste evento",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro ao enviar itens",
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
        title: isUnlinking ? "Itens desvinculados" : "Itens vinculados",
        description: isUnlinking 
          ? `${variables.itemIds.length} ${variables.itemIds.length === 1 ? 'item desvinculado' : 'itens desvinculados'} com sucesso`
          : `${variables.itemIds.length} ${variables.itemIds.length === 1 ? 'item vinculado' : 'itens vinculados'} ao patrocinador com sucesso`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao processar itens",
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

  const handleEditItem = (item: any) => {
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

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <Link href="/eventos">
          <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para eventos
          </Button>
        </Link>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="title-event-name">
                {event.name}
              </h1>
            </div>
            <div className="mb-3">
              <span className="text-xs text-muted-foreground/70">
                Criado em {new Date(event.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </span>
            </div>
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" />
                <span>Início: {new Date(event.startDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
              </div>
              <div className="flex items-center gap-2">
                <Truck className="h-3.5 w-3.5" />
                <span>Saída: {new Date(event.truckDepartureDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às {new Date(event.truckDepartureDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={() => {
                setEditingItem(null);
                setBulkMode(true);
                setOpen(true);
              }}
              data-testid="button-add-item"
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Item
            </Button>
            
            <Dialog open={open} onOpenChange={(isOpen) => {
              if (!isOpen) {
                handleCloseDialog();
              } else {
                setOpen(true);
              }
            }}>
              <DialogContent className={bulkMode && !editingItem ? "max-w-[95vw] max-h-[90vh]" : "sm:max-w-lg max-h-[90vh] overflow-y-auto"}>
                <DialogHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <DialogTitle>
                        {editingItem 
                          ? "Editar Item" 
                          : (bulkMode ? "Entrada Rápida - Múltiplos Itens" : "Adicionar Item ao Evento")
                        }
                      </DialogTitle>
                      <DialogDescription>
                        {editingItem
                          ? "Atualize as informações do item"
                          : (bulkMode ? "Adicione vários itens de uma vez usando a tabela" : "Preencha as informações do item gráfico")
                        }
                      </DialogDescription>
                    </div>
                    {!editingItem && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setBulkMode(!bulkMode)}
                        data-testid="button-toggle-mode"
                      >
                        {bulkMode ? (
                          <>
                            <Plus className="h-4 w-4 mr-2" />
                            Modo Simples
                          </>
                        ) : (
                          <>
                            <List className="h-4 w-4 mr-2" />
                            Entrada Rápida
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </DialogHeader>
                
                {bulkMode && !editingItem ? (
                  <div className="overflow-y-auto -mx-6 px-6">
                  <BulkItemEntry
                    eventId={eventId!}
                    standardItems={standardItems}
                    sponsors={sponsors}
                    onSubmit={(items) => createBulkItemsMutation.mutate(items)}
                    onCancel={() => {
                      // Apenas fecha o dialog, sem resetar estados
                      // Isso evita re-fetches múltiplos e tela branca
                      setOpen(false);
                    }}
                    isPending={createBulkItemsMutation.isPending}
                  />
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="type">Tipo de Item</Label>
                    <Popover open={typePopoverOpen} onOpenChange={setTypePopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={typePopoverOpen}
                          className="w-full justify-between font-normal"
                          data-testid="select-item-type"
                        >
                          <span className="truncate">
                            {formData.type || "Selecione o tipo"}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" align="start">
                        <Command>
                          <CommandInput 
                            placeholder="Buscar ou adicionar tipo..." 
                            value={customTypeInput}
                            onValueChange={setCustomTypeInput}
                          />
                          <CommandList>
                            <CommandEmpty>
                              <div className="p-2 space-y-2">
                                <p className="text-sm text-muted-foreground">Nenhum tipo encontrado.</p>
                                {customTypeInput && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="w-full"
                                    onClick={() => {
                                      setFormData({ ...formData, type: customTypeInput });
                                      setCustomTypeInput("");
                                      setTypePopoverOpen(false);
                                    }}
                                  >
                                    <Plus className="h-3 w-3 mr-1" />
                                    Adicionar "{customTypeInput}"
                                  </Button>
                                )}
                              </div>
                            </CommandEmpty>
                            {standardItems.length > 0 && (
                              <CommandGroup heading="Modelos">
                                {standardItems.map((item: any) => (
                                  <CommandItem
                                    key={item.id}
                                    value={item.name}
                                    onSelect={() => {
                                      setFormData({
                                        ...formData,
                                        type: item.name,
                                        visualWidth: item.visualWidth ? String(item.visualWidth) : (item.area ? String(item.area) : ""),
                                        visualHeight: item.visualHeight ? String(item.visualHeight) : (item.visual ? String(item.visual) : ""),
                                        fileWidth: item.fileWidth ? String(item.fileWidth) : "",
                                        fileHeight: item.fileHeight ? String(item.fileHeight) : "",
                                        material: item.material || "",
                                        finish: item.finish || "",
                                        measurement: (item.visualWidth && item.visualHeight) ? `${item.visualWidth} × ${item.visualHeight}` : (item.area && item.visual ? `${item.area} × ${item.visual}` : ""),
                                      });
                                      setCustomTypeInput("");
                                      setTypePopoverOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        formData.type === item.name ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {item.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            )}
                            <CommandGroup heading="Outros Tipos">
                              {itemTypes.map((type) => (
                                <CommandItem
                                  key={type}
                                  value={type}
                                  onSelect={() => {
                                    setFormData({ ...formData, type });
                                    setCustomTypeInput("");
                                    setTypePopoverOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      formData.type === type ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {type}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="description">Descrição (opcional)</Label>
                    <Input
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Descrição personalizada do item"
                      data-testid="input-description"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantidade</Label>
                    <Input
                      id="quantity"
                      type="number"
                      min="1"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
                      required
                      data-testid="input-quantity"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="visualWidth">Largura Visual (m)*</Label>
                    <Input
                      id="visualWidth"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.visualWidth}
                      onChange={(e) => setFormData({ ...formData, visualWidth: e.target.value })}
                      placeholder="Ex: 2.00"
                      required
                      data-testid="input-visual-width"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="visualHeight">Altura Visual (m)*</Label>
                    <Input
                      id="visualHeight"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.visualHeight}
                      onChange={(e) => setFormData({ ...formData, visualHeight: e.target.value })}
                      placeholder="Ex: 1.00"
                      required
                      data-testid="input-visual-height"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fileWidth">Largura Arquivo (m)*</Label>
                    <Input
                      id="fileWidth"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.fileWidth}
                      onChange={(e) => setFormData({ ...formData, fileWidth: e.target.value })}
                      placeholder="Ex: 1.90"
                      required
                      data-testid="input-file-width"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fileHeight">Altura Arquivo (m)*</Label>
                    <Input
                      id="fileHeight"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.fileHeight}
                      onChange={(e) => setFormData({ ...formData, fileHeight: e.target.value })}
                      placeholder="Ex: 0.90"
                      required
                      data-testid="input-file-height"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="material">Material</Label>
                    <Popover open={materialPopoverOpen} onOpenChange={setMaterialPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={materialPopoverOpen}
                          className="w-full justify-between font-normal"
                          data-testid="select-material"
                        >
                          <span className="truncate">
                            {formData.material || "Selecione ou digite um material"}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" align="start">
                        <Command>
                          <CommandInput 
                            placeholder="Buscar ou adicionar material..." 
                            value={customMaterialInput}
                            onValueChange={setCustomMaterialInput}
                          />
                          <CommandList>
                            <CommandEmpty>
                              <div className="p-2 space-y-2">
                                <p className="text-sm text-muted-foreground">Nenhum material encontrado.</p>
                                {customMaterialInput && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="w-full"
                                    onClick={() => {
                                      setFormData({ ...formData, material: customMaterialInput });
                                      setCustomMaterialInput("");
                                      setMaterialPopoverOpen(false);
                                    }}
                                  >
                                    <Plus className="h-3 w-3 mr-1" />
                                    Adicionar "{customMaterialInput}"
                                  </Button>
                                )}
                              </div>
                            </CommandEmpty>
                            <CommandGroup>
                              {materials.map((material) => (
                                <CommandItem
                                  key={material}
                                  value={material}
                                  onSelect={() => {
                                    setFormData({ ...formData, material });
                                    setCustomMaterialInput("");
                                    setMaterialPopoverOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      formData.material === material ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {material}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="finish">Acabamento</Label>
                    <Popover open={finishPopoverOpen} onOpenChange={setFinishPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={finishPopoverOpen}
                          className="w-full justify-between font-normal"
                          data-testid="select-finish"
                        >
                          <span className="truncate">
                            {formData.finish || "Selecione ou digite um acabamento"}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" align="start">
                        <Command>
                          <CommandInput 
                            placeholder="Buscar ou adicionar acabamento..." 
                            value={customFinishInput}
                            onValueChange={setCustomFinishInput}
                          />
                          <CommandList>
                            <CommandEmpty>
                              <div className="p-2 space-y-2">
                                <p className="text-sm text-muted-foreground">Nenhum acabamento encontrado.</p>
                                {customFinishInput && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="w-full"
                                    onClick={() => {
                                      setFormData({ ...formData, finish: customFinishInput });
                                      setCustomFinishInput("");
                                      setFinishPopoverOpen(false);
                                    }}
                                  >
                                    <Plus className="h-3 w-3 mr-1" />
                                    Adicionar "{customFinishInput}"
                                  </Button>
                                )}
                              </div>
                            </CommandEmpty>
                            <CommandGroup>
                              {finishes.map((finish) => (
                                <CommandItem
                                  key={finish}
                                  value={finish}
                                  onSelect={() => {
                                    setFormData({ ...formData, finish });
                                    setCustomFinishInput("");
                                    setFinishPopoverOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      formData.finish === finish ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {finish}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="observations">Observações</Label>
                    <Textarea
                      id="observations"
                      value={formData.observations}
                      onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                      placeholder="Observações adicionais (opcional)"
                      rows={3}
                      data-testid="textarea-observations"
                    />
                  </div>
                </div>
                {formData.fileWidth && formData.fileHeight && formData.quantity && (
                  <div className="p-4 bg-muted/50 rounded-md">
                    <p className="text-sm font-medium">
                      m² Total: {(formData.quantity * parseFloat(formData.fileWidth || "0") * parseFloat(formData.fileHeight || "0")).toFixed(2)}
                    </p>
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={handleCloseDialog}>
                    Cancelar
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createItemMutation.isPending || updateItemMutation.isPending} 
                    data-testid="button-submit-item"
                  >
                    {editingItem
                      ? (updateItemMutation.isPending ? "Salvando..." : "Salvar Alterações")
                      : (createItemMutation.isPending ? "Adicionando..." : "Adicionar Item")
                    }
                  </Button>
                </div>
              </form>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>


      {/* Card de Itens em Rascunho */}
      {items.filter(item => item.status === 'draft').length > 0 && (
        <Card className="border-2 border-dashed border-muted-foreground/30 bg-muted/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Itens em Rascunho</CardTitle>
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleEditItem(item)}
                          data-testid={`button-edit-draft-${item.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
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
                    {items.filter(item => item.status === 'draft').length} {items.filter(item => item.status === 'draft').length === 1 ? 'item será enviado' : 'itens serão enviados'} para Arte
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
                    Enviar Tudo para Arte
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Itens do Evento</CardTitle>
            {isFetching && !loadingItems && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Atualizando...</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum item adicionado</h3>
              <p className="text-muted-foreground mb-4">Adicione itens ao evento para começar</p>
              <Button onClick={() => {
                setEditingItem(null);
                setBulkMode(true);
                setOpen(true);
              }}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Primeiro Item
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium">ID</th>
                    <th className="text-left py-3 px-4 font-medium">Descrição</th>
                    <th className="text-left py-3 px-4 font-medium w-20">Qtd</th>
                    <th className="text-left py-3 px-4 font-medium">Dimensões</th>
                    <th className="text-left py-3 px-4 font-medium w-16">m²</th>
                    <th className="text-left py-3 px-4 font-medium">Material</th>
                    <th className="text-left py-3 px-4 font-medium">Acabamento</th>
                    <th className="text-left py-3 px-4 font-medium">Patrocinador</th>
                    <th className="text-left py-3 px-4 font-medium w-24">Status</th>
                    {hasPermission("admin") && (
                      <th className="text-left py-3 px-4 font-medium w-32">Ações</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => {
                    const prevItem = index > 0 ? items[index - 1] : null;
                    const showTypeHeader = !prevItem || prevItem.type !== item.type;
                    
                    return (
                      <Fragment key={item.id}>
                        {showTypeHeader && (
                          <tr key={`group-${item.type}`} className="bg-primary/5 border-y-2 border-primary/20">
                            <td colSpan={hasPermission("admin") ? 10 : 9} className="py-2 px-4">
                              <div className="flex items-center gap-3">
                                <div className="h-5 w-1 bg-primary rounded-full"></div>
                                <div className="text-sm font-bold text-foreground">
                                  {item.type}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        <tr
                          key={item.id}
                          className="border-b border-border hover-elevate cursor-pointer"
                          data-testid={`row-item-${item.id}`}
                          onClick={() => setSelectedItemForDetails(item)}
                        >
                          <td className="py-2 px-3">
                            <div className="text-sm font-mono font-medium text-primary" data-testid={`text-display-id-${item.id}`}>
                              {item.displayId}
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            {item.description ? (
                              <div className="text-xs text-foreground truncate max-w-xs">{item.description}</div>
                            ) : (
                              <div className="text-xs text-muted-foreground">—</div>
                            )}
                            {item.observations && (
                              <div className="text-xs text-muted-foreground italic truncate max-w-xs">{item.observations}</div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-sm tabular-nums text-center">{item.quantity}</td>
                          <td className="py-2 px-2 text-xs">
                            {(item.visualWidth || item.visualHeight) && (
                              <div className="whitespace-nowrap tabular-nums space-y-0.5">
                                <div>
                                  <span className="text-muted-foreground font-medium">V:</span> {item.visualWidth || "—"}×{item.visualHeight || "—"}
                                </div>
                              </div>
                            )}
                            {(item.fileWidth || item.fileHeight) && (
                              <div className="whitespace-nowrap tabular-nums text-muted-foreground">
                                <span className="font-medium">A:</span> {item.fileWidth || "—"}×{item.fileHeight || "—"}
                              </div>
                            )}
                            {!item.visualWidth && !item.visualHeight && !item.fileWidth && !item.fileHeight && (
                              <div className="text-muted-foreground">—</div>
                            )}
                          </td>
                          <td className="py-2 px-2 text-sm font-medium tabular-nums text-center">{item.calculatedM2}</td>
                          <td className="py-2 px-3 text-sm">{item.material}</td>
                          <td className="py-2 px-3 text-sm">{item.finish}</td>
                          <td className="py-2 px-3 text-sm">
                            <span className="text-muted-foreground text-xs">—</span>
                          </td>
                          <td className="py-2 px-3">
                            <StatusBadge status={item.status} />
                          </td>
                          {hasPermission("admin") && (
                            <td className="py-2 px-2">
                              <div className="flex items-center gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditItem(item);
                                  }}
                                  data-testid={`button-edit-item-${item.id}`}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteItem(item.id);
                                  }}
                                  data-testid={`button-delete-item-${item.id}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Detalhes do Item */}
      <Dialog open={!!selectedItemForDetails} onOpenChange={(open) => !open && setSelectedItemForDetails(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          {selectedItemForDetails && (
            <>
              <DialogHeader className="pb-4 border-b">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <DialogTitle className="text-2xl font-bold mb-3 flex items-center gap-3">
                      <span className="font-mono text-primary">{selectedItemForDetails.displayId}</span>
                      <StatusBadge status={selectedItemForDetails.status} />
                    </DialogTitle>
                    {event && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span className="font-medium">{event.name}</span>
                        {event.startDate && (
                          <>
                            <span className="mx-2">•</span>
                            <span>{new Date(event.startDate).toLocaleDateString('pt-BR')}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <Badge variant="outline" className="text-base px-4 py-2 shrink-0">
                    {selectedItemForDetails.type}
                  </Badge>
                </div>
              </DialogHeader>

              <div className="space-y-6 mt-6">
                {/* Grid de informações principais */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Card: Especificações */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold uppercase text-muted-foreground flex items-center gap-2">
                        <Package2 className="h-4 w-4" />
                        Especificações
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground block text-xs mb-1">Material</span>
                          <span className="font-semibold">{selectedItemForDetails.material}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-xs mb-1">Acabamento</span>
                          <span className="font-semibold">{selectedItemForDetails.finish}</span>
                        </div>
                        {selectedItemForDetails.visualWidth && selectedItemForDetails.visualHeight && (
                          <div>
                            <span className="text-muted-foreground block text-xs mb-1">Dimensão Visual</span>
                            <span className="font-semibold">{selectedItemForDetails.visualWidth} × {selectedItemForDetails.visualHeight}</span>
                          </div>
                        )}
                        {selectedItemForDetails.fileWidth && selectedItemForDetails.fileHeight && (
                          <div>
                            <span className="text-muted-foreground block text-xs mb-1">Dimensão Arquivo</span>
                            <span className="font-semibold">{selectedItemForDetails.fileWidth} × {selectedItemForDetails.fileHeight}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card: Produção */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold uppercase text-muted-foreground">
                        Produção
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground block text-xs mb-1">Quantidade Solicitada</span>
                          <span className="font-semibold text-lg">{selectedItemForDetails.quantity} un.</span>
                        </div>
                        {selectedItemForDetails.quantityProduced !== null && (
                          <div>
                            <span className="text-muted-foreground block text-xs mb-1">Quantidade Produzida</span>
                            <span className="font-semibold text-lg text-status-production">{selectedItemForDetails.quantityProduced} un.</span>
                          </div>
                        )}
                        <div>
                          <span className="text-muted-foreground block text-xs mb-1">Total m²</span>
                          <span className="font-semibold text-lg text-primary">{selectedItemForDetails.calculatedM2}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Patrocinadores e Observações */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Card: Patrocinadores */}
                  {selectedItemForDetails.sponsors && selectedItemForDetails.sponsors.length > 0 && (() => {
                    const itemSponsorNames = selectedItemForDetails.sponsors
                      .map((sponsorData: any) => {
                        if (typeof sponsorData === 'object' && sponsorData.name) {
                          return sponsorData.name;
                        }
                        const sponsorId = typeof sponsorData === 'object' ? sponsorData.id : sponsorData;
                        const sponsor = sponsors.find((s: any) => s.id === sponsorId);
                        return sponsor?.name || 'Patrocinador desconhecido';
                      })
                      .filter(Boolean);
                    
                    if (itemSponsorNames.length === 0) return null;
                    
                    return (
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-semibold uppercase text-muted-foreground">
                            Patrocinadores ({itemSponsorNames.length})
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2">
                            {itemSponsorNames.map((name: string, idx: number) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {name}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })()}

                  {/* Card: Observações */}
                  <Card className={!selectedItemForDetails.sponsors || selectedItemForDetails.sponsors.length === 0 ? 'md:col-span-2' : ''}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold uppercase text-muted-foreground">
                        Observações
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedItemForDetails.observations ? (
                        <p className="text-sm leading-relaxed">{selectedItemForDetails.observations}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">Nenhuma observação registrada</p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Timeline de Histórico */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold uppercase text-muted-foreground flex items-center gap-2">
                      <History className="h-4 w-4" />
                      Histórico de Ações
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {getItemLogs(selectedItemForDetails.id).length > 0 ? (
                      <div className="relative">
                        <div className="space-y-4">
                          {getItemLogs(selectedItemForDetails.id).map((log, index, array) => {
                            const actionLabels: Record<string, string> = {
                              'created': 'Criado',
                              'updated': 'Atualizado',
                              'deleted': 'Deletado',
                              'approved': 'Aprovado',
                              'rejected': 'Rejeitado',
                              'produced': 'Produzido',
                              'delivered': 'Entregue',
                              'linked': 'Vinculado',
                              'unlinked': 'Desvinculado',
                              'status_changed': 'Status Alterado',
                              'sponsor_linked': 'Patrocinador Vinculado',
                              'sponsor_unlinked': 'Patrocinador Desvinculado'
                            };
                            const actionLabel = actionLabels[log.action] || log.action;

                            return (
                              <div key={log.id} className="relative flex gap-3">
                                {/* Timeline line */}
                                {index < array.length - 1 && (
                                  <div className="absolute left-2 top-6 bottom-0 w-px bg-border"></div>
                                )}
                                
                                {/* Timeline dot */}
                                <div className="flex-shrink-0 w-4 h-4 rounded-full bg-primary/20 ring-2 ring-primary mt-0.5"></div>
                                
                                {/* Content */}
                                <div className="flex-1 pb-2">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="secondary" className="text-xs font-medium">
                                      {actionLabel}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                      <User className="h-3 w-3" />
                                      {log.userName}
                                    </span>
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {formatDateTime(log.createdAt)}
                                  </div>
                                  {log.details && (
                                    <p className="text-sm mt-1.5 text-foreground/80">{log.details}</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">Nenhum histórico disponível</p>
                    )}
                  </CardContent>
                </Card>

                {/* Comentários */}
                <div>
                  <CommentsSection itemId={selectedItemForDetails.id} itemType={selectedItemForDetails.type} />
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingItemId} onOpenChange={() => setDeletingItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este item? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingItemId && deleteItemMutation.mutate(deletingItemId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-item"
            >
              {deleteItemMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog separado para editar item */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Item</DialogTitle>
            <DialogDescription>Atualize as informações do item</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (editingItem) {
              updateItemMutation.mutate({ id: editingItem.id, data: formData });
            }
          }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Tipo de Item</Label>
                <Input
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  placeholder="Digite o tipo"
                  data-testid="input-edit-type"
                />
              </div>
              
              <div className="col-span-2 space-y-2">
                <Label>Descrição</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descrição opcional"
                  data-testid="input-edit-description"
                />
              </div>

              <div className="space-y-2">
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                  data-testid="input-edit-quantity"
                />
              </div>

              <div className="space-y-2">
                <Label>m² Calculado</Label>
                <Input
                  value={calculateM2(formData.quantity, parseFloat(formData.fileWidth) || 0, parseFloat(formData.fileHeight) || 0).toFixed(2)}
                  disabled
                  className="bg-muted"
                />
              </div>

              <div className="col-span-2 grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Visual Largura (m)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.visualWidth}
                    onChange={(e) => setFormData({ ...formData, visualWidth: e.target.value })}
                    data-testid="input-edit-visual-width"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Visual Altura (m)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.visualHeight}
                    onChange={(e) => setFormData({ ...formData, visualHeight: e.target.value })}
                    data-testid="input-edit-visual-height"
                  />
                </div>
              </div>

              <div className="col-span-2 grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Arquivo Largura (m)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.fileWidth}
                    onChange={(e) => setFormData({ ...formData, fileWidth: e.target.value })}
                    data-testid="input-edit-file-width"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Arquivo Altura (m)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.fileHeight}
                    onChange={(e) => setFormData({ ...formData, fileHeight: e.target.value })}
                    data-testid="input-edit-file-height"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Material</Label>
                <Input
                  value={formData.material}
                  onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                  placeholder="Material"
                  data-testid="input-edit-material"
                />
              </div>

              <div className="space-y-2">
                <Label>Acabamento</Label>
                <Input
                  value={formData.finish}
                  onChange={(e) => setFormData({ ...formData, finish: e.target.value })}
                  placeholder="Acabamento"
                  data-testid="input-edit-finish"
                />
              </div>

              <div className="col-span-2 space-y-2">
                <Label>Patrocinador</Label>
                <Select 
                  value={formData.sponsorId || "none"} 
                  onValueChange={(value) => setFormData({ ...formData, sponsorId: value === "none" ? "" : value })}
                >
                  <SelectTrigger data-testid="select-edit-sponsor">
                    <SelectValue placeholder="Selecione" />
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

              <div className="col-span-2 space-y-2">
                <Label>Observações</Label>
                <Textarea
                  value={formData.observations}
                  onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                  placeholder="Observações adicionais"
                  className="min-h-[80px]"
                  data-testid="textarea-edit-observations"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditDialogOpen(false);
                  setEditingItem(null);
                }}
                data-testid="button-cancel-edit"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={updateItemMutation.isPending}
                data-testid="button-save-edit"
              >
                {updateItemMutation.isPending ? "Salvando..." : "Salvar Alterações"}
              </Button>
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
                        <h4 className="text-sm font-semibold text-foreground">Itens Vinculados ({linkedItems.length})</h4>
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
                        <h4 className="text-sm font-semibold text-foreground">Itens Disponíveis ({availableItems.length})</h4>
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
                  {selectedItemsToLink.length} {selectedItemsToLink.length === 1 ? 'item selecionado' : 'itens selecionados'}
                </span>
              ) : (
                <span className="text-muted-foreground">Nenhum item selecionado</span>
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
