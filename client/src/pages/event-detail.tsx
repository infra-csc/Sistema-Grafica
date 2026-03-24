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
        title: "Itens enviados com sucesso",
        description: `${data.count} ${data.count === 1 ? 'item foi enviado' : 'itens foram enviados'} para vinculação de patrocinadores`,
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
            <h1 className="text-2xl font-bold tracking-tight text-[#1c1917] mb-1" data-testid="title-event-name">
              {event.name}
            </h1>
            <div className="mb-3">
              <span className="text-xs" style={{ color: "#a8a29e" }}>
                Criado em {new Date(event.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: "#f5f5f4", border: "1px solid #e7e5e4" }}>
                <Calendar className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#f97316" }} />
                <div>
                  <div className="text-xs font-medium" style={{ color: "#a8a29e", lineHeight: 1 }}>Início</div>
                  <div className="text-xs font-semibold" style={{ color: "#1c1917" }}>
                    {new Date(event.startDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: "#f5f5f4", border: "1px solid #e7e5e4" }}>
                <Truck className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#f97316" }} />
                <div>
                  <div className="text-xs font-medium" style={{ color: "#a8a29e", lineHeight: 1 }}>Saída</div>
                  <div className="text-xs font-semibold" style={{ color: "#1c1917" }}>
                    {new Date(event.truckDepartureDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} · {new Date(event.truckDepartureDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
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
              style={{ backgroundColor: "#1c1917", color: "#ffffff" }}
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
                <DialogHeader style={{ borderBottom: "1px solid #e7e5e4", paddingBottom: "16px", marginBottom: "4px" }}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {editingItem && (
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0" style={{ backgroundColor: "#fff7ed" }}>
                          <Pencil className="h-4 w-4" style={{ color: "#f97316" }} />
                        </div>
                      )}
                      <div>
                        <DialogTitle className="text-base font-bold" style={{ color: "#1c1917" }}>
                          {editingItem 
                            ? "Editar Item" 
                            : (bulkMode ? "Entrada Rápida - Múltiplos Itens" : "Adicionar Item ao Evento")
                          }
                        </DialogTitle>
                        <DialogDescription className="text-xs mt-0.5" style={{ color: "#a8a29e" }}>
                          {editingItem
                            ? "Atualize as informações do item"
                            : (bulkMode ? "Adicione vários itens de uma vez usando a tabela" : "Preencha as informações do item gráfico")
                          }
                        </DialogDescription>
                      </div>
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
                  <form onSubmit={handleSubmit} className="flex flex-col gap-0">
                    {/* Corpo com scroll */}
                    <div className="flex flex-col gap-4 py-4">

                      {/* Tipo de Item — largura total */}
                      <div className="space-y-1.5">
                        <Label htmlFor="type" className="text-sm font-semibold" style={{ color: "#1c1917" }}>Tipo de Item</Label>
                        <Popover open={typePopoverOpen} onOpenChange={setTypePopoverOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={typePopoverOpen}
                              className="w-full justify-between font-normal text-sm"
                              style={{ backgroundColor: "#fafaf9", borderColor: "#e7e5e4", color: "#1c1917" }}
                              data-testid="select-item-type"
                            >
                              <span className="truncate">
                                {formData.type || "Selecione o tipo"}
                              </span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0" style={{ color: "#a8a29e" }} />
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
                                        <Check className={cn("mr-2 h-4 w-4", formData.type === item.name ? "opacity-100" : "opacity-0")} />
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

                      {/* Descrição — largura total */}
                      <div className="space-y-1.5">
                        <Label htmlFor="description" className="text-sm font-semibold" style={{ color: "#1c1917" }}>Descrição <span style={{ color: "#a8a29e", fontWeight: 400 }}>(opcional)</span></Label>
                        <Input
                          id="description"
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          placeholder="Descrição personalizada do item"
                          className="text-sm focus-visible:ring-[#f97316] focus-visible:border-[#f97316]"
                          style={{ backgroundColor: "#fafaf9", borderColor: "#e7e5e4", color: "#1c1917" }}
                          data-testid="input-description"
                        />
                      </div>

                      {/* Quantidade | m² Preview — 2 colunas */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="quantity" className="text-sm font-semibold" style={{ color: "#1c1917" }}>Quantidade</Label>
                          <Input
                            id="quantity"
                            type="number"
                            min="1"
                            value={formData.quantity}
                            onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
                            required
                            className="text-sm focus-visible:ring-[#f97316] focus-visible:border-[#f97316]"
                            style={{ backgroundColor: "#fafaf9", borderColor: "#e7e5e4", color: "#1c1917" }}
                            data-testid="input-quantity"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-sm font-semibold" style={{ color: "#1c1917" }}>m² Total</Label>
                          <div className="flex items-center h-9 px-3 rounded-md text-sm font-semibold tabular-nums" style={{ backgroundColor: "#f5f5f4", border: "1px solid #e7e5e4", color: formData.fileWidth && formData.fileHeight ? "#f97316" : "#a8a29e" }}>
                            {formData.fileWidth && formData.fileHeight && formData.quantity
                              ? (formData.quantity * parseFloat(formData.fileWidth || "0") * parseFloat(formData.fileHeight || "0")).toFixed(2) + " m²"
                              : "—"
                            }
                          </div>
                        </div>
                      </div>

                      {/* Seção Dimensões Visuais */}
                      <div className="rounded-lg p-3 space-y-3" style={{ backgroundColor: "#fafaf9", border: "1px solid #e7e5e4" }}>
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-0.5 rounded-full" style={{ backgroundColor: "#f97316" }}></div>
                          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "#78716c" }}>Dimensões Visuais (m)</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label htmlFor="visualWidth" className="text-sm font-semibold" style={{ color: "#1c1917" }}>Largura *</Label>
                            <Input
                              id="visualWidth"
                              type="number"
                              step="0.01"
                              min="0"
                              value={formData.visualWidth}
                              onChange={(e) => setFormData({ ...formData, visualWidth: e.target.value })}
                              placeholder="Ex: 2.00"
                              required
                              className="text-sm bg-white focus-visible:ring-[#f97316] focus-visible:border-[#f97316]"
                              style={{ borderColor: "#e7e5e4", color: "#1c1917" }}
                              data-testid="input-visual-width"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="visualHeight" className="text-sm font-semibold" style={{ color: "#1c1917" }}>Altura *</Label>
                            <Input
                              id="visualHeight"
                              type="number"
                              step="0.01"
                              min="0"
                              value={formData.visualHeight}
                              onChange={(e) => setFormData({ ...formData, visualHeight: e.target.value })}
                              placeholder="Ex: 1.00"
                              required
                              className="text-sm bg-white focus-visible:ring-[#f97316] focus-visible:border-[#f97316]"
                              style={{ borderColor: "#e7e5e4", color: "#1c1917" }}
                              data-testid="input-visual-height"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Seção Dimensões Arquivo */}
                      <div className="rounded-lg p-3 space-y-3" style={{ backgroundColor: "#fafaf9", border: "1px solid #e7e5e4" }}>
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-0.5 rounded-full" style={{ backgroundColor: "#78716c" }}></div>
                          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "#78716c" }}>Dimensões Arquivo (m)</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label htmlFor="fileWidth" className="text-sm font-semibold" style={{ color: "#1c1917" }}>Largura *</Label>
                            <Input
                              id="fileWidth"
                              type="number"
                              step="0.01"
                              min="0"
                              value={formData.fileWidth}
                              onChange={(e) => setFormData({ ...formData, fileWidth: e.target.value })}
                              placeholder="Ex: 1.90"
                              required
                              className="text-sm bg-white focus-visible:ring-[#f97316] focus-visible:border-[#f97316]"
                              style={{ borderColor: "#e7e5e4", color: "#1c1917" }}
                              data-testid="input-file-width"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="fileHeight" className="text-sm font-semibold" style={{ color: "#1c1917" }}>Altura *</Label>
                            <Input
                              id="fileHeight"
                              type="number"
                              step="0.01"
                              min="0"
                              value={formData.fileHeight}
                              onChange={(e) => setFormData({ ...formData, fileHeight: e.target.value })}
                              placeholder="Ex: 0.90"
                              required
                              className="text-sm bg-white focus-visible:ring-[#f97316] focus-visible:border-[#f97316]"
                              style={{ borderColor: "#e7e5e4", color: "#1c1917" }}
                              data-testid="input-file-height"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Material | Acabamento — 2 colunas */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="material" className="text-sm font-semibold" style={{ color: "#1c1917" }}>Material</Label>
                          <Popover open={materialPopoverOpen} onOpenChange={setMaterialPopoverOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                role="combobox"
                                aria-expanded={materialPopoverOpen}
                                className="w-full justify-between font-normal text-sm"
                                style={{ backgroundColor: "#fafaf9", borderColor: "#e7e5e4", color: "#1c1917" }}
                                data-testid="select-material"
                              >
                                <span className="truncate">
                                  {formData.material || "Material"}
                                </span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0" style={{ color: "#a8a29e" }} />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-full p-0" align="start">
                              <Command>
                                <CommandInput 
                                  placeholder="Buscar ou adicionar..." 
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
                                        <Check className={cn("mr-2 h-4 w-4", formData.material === material ? "opacity-100" : "opacity-0")} />
                                        {material}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="finish" className="text-sm font-semibold" style={{ color: "#1c1917" }}>Acabamento</Label>
                          <Popover open={finishPopoverOpen} onOpenChange={setFinishPopoverOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                role="combobox"
                                aria-expanded={finishPopoverOpen}
                                className="w-full justify-between font-normal text-sm"
                                style={{ backgroundColor: "#fafaf9", borderColor: "#e7e5e4", color: "#1c1917" }}
                                data-testid="select-finish"
                              >
                                <span className="truncate">
                                  {formData.finish || "Acabamento"}
                                </span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0" style={{ color: "#a8a29e" }} />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-full p-0" align="start">
                              <Command>
                                <CommandInput 
                                  placeholder="Buscar ou adicionar..." 
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
                                        <Check className={cn("mr-2 h-4 w-4", formData.finish === finish ? "opacity-100" : "opacity-0")} />
                                        {finish}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>

                      {/* Observações — largura total */}
                      <div className="space-y-1.5">
                        <Label htmlFor="observations" className="text-sm font-semibold" style={{ color: "#1c1917" }}>Observações <span style={{ color: "#a8a29e", fontWeight: 400 }}>(opcional)</span></Label>
                        <Textarea
                          id="observations"
                          value={formData.observations}
                          onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                          placeholder="Observações adicionais sobre este item..."
                          rows={3}
                          className="text-sm resize-y focus-visible:ring-[#f97316] focus-visible:border-[#f97316]"
                          style={{ backgroundColor: "#fafaf9", borderColor: "#e7e5e4", color: "#1c1917" }}
                          data-testid="textarea-observations"
                        />
                      </div>
                    </div>

                    {/* Rodapé fixo com border-t */}
                    <div className="flex gap-2 justify-end pt-4" style={{ borderTop: "1px solid #e7e5e4" }}>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCloseDialog}
                        style={{ borderColor: "#e7e5e4", color: "#1c1917", backgroundColor: "#ffffff" }}
                      >
                        Cancelar
                      </Button>
                      <Button 
                        type="submit" 
                        disabled={createItemMutation.isPending || updateItemMutation.isPending} 
                        style={{ backgroundColor: "#1c1917", color: "#ffffff" }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#000000")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#1c1917")}
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

      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#ffffff", border: "1px solid #e7e5e4", boxShadow: "0 1px 4px 0 rgba(0,0,0,0.06)" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #e7e5e4" }}>
          <span className="text-base font-bold" style={{ color: "#1c1917" }}>Itens do Evento</span>
          {isFetching && !loadingItems && (
            <div className="flex items-center gap-2 text-sm" style={{ color: "#a8a29e" }}>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Atualizando...</span>
            </div>
          )}
        </div>
        <div className="p-0">
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
                <thead style={{ backgroundColor: "#fafaf9", borderBottom: "1px solid #e7e5e4" }}>
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide" style={{ color: "#a8a29e" }}>ID</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide" style={{ color: "#a8a29e" }}>Descrição</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold uppercase tracking-wide w-20" style={{ color: "#a8a29e" }}>Qtd</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide" style={{ color: "#a8a29e" }}>Dimensões</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold uppercase tracking-wide w-16" style={{ color: "#a8a29e" }}>m²</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide" style={{ color: "#a8a29e" }}>Material</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide" style={{ color: "#a8a29e" }}>Acabamento</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide" style={{ color: "#a8a29e" }}>Patrocinador</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide w-36" style={{ color: "#a8a29e" }}>Status</th>
                    {hasPermission("admin") && (
                      <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide w-24" style={{ color: "#a8a29e" }}>Ações</th>
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
                          <tr key={`group-${item.type}`} style={{ backgroundColor: "#f5f5f4", borderTop: "1px solid #e7e5e4", borderBottom: "1px solid #e7e5e4" }}>
                            <td colSpan={hasPermission("admin") ? 10 : 9} className="py-2 px-4">
                              <div className="flex items-center gap-3">
                                <div className="h-4 w-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#f97316" }}></div>
                                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "#1c1917" }}>
                                  {item.type}
                                </span>
                              </div>
                            </td>
                          </tr>
                        )}
                        <tr
                          key={item.id}
                          className="cursor-pointer transition-colors duration-100"
                          style={{ borderBottom: "1px solid #f5f5f4" }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#fafaf9")}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                          data-testid={`row-item-${item.id}`}
                          onClick={() => setSelectedItemForDetails(item)}
                        >
                          <td className="py-2.5 px-3">
                            <div className="text-xs font-mono font-semibold" style={{ color: "#f97316" }} data-testid={`text-display-id-${item.id}`}>
                              {item.displayId}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            {item.description ? (
                              <div className="text-xs font-medium truncate max-w-xs" style={{ color: "#1c1917" }}>{item.description}</div>
                            ) : (
                              <div className="text-xs" style={{ color: "#a8a29e" }}>—</div>
                            )}
                            {item.observations && (
                              <div className="text-xs italic truncate max-w-xs" style={{ color: "#a8a29e" }}>{item.observations}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-sm tabular-nums text-center font-medium" style={{ color: "#1c1917" }}>{item.quantity}</td>
                          <td className="py-2.5 px-2 text-xs">
                            {(item.visualWidth || item.visualHeight) && (
                              <div className="whitespace-nowrap tabular-nums space-y-0.5">
                                <div>
                                  <span className="font-medium" style={{ color: "#a8a29e" }}>V:</span>{" "}
                                  <span style={{ color: "#1c1917" }}>{item.visualWidth || "—"}×{item.visualHeight || "—"}</span>
                                </div>
                              </div>
                            )}
                            {(item.fileWidth || item.fileHeight) && (
                              <div className="whitespace-nowrap tabular-nums" style={{ color: "#78716c" }}>
                                <span className="font-medium">A:</span> {item.fileWidth || "—"}×{item.fileHeight || "—"}
                              </div>
                            )}
                            {!item.visualWidth && !item.visualHeight && !item.fileWidth && !item.fileHeight && (
                              <div style={{ color: "#a8a29e" }}>—</div>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-sm font-semibold tabular-nums text-center" style={{ color: "#1c1917" }}>{item.calculatedM2}</td>
                          <td className="py-2.5 px-3 text-xs" style={{ color: "#78716c" }}>{item.material}</td>
                          <td className="py-2.5 px-3 text-xs" style={{ color: "#78716c" }}>{item.finish}</td>
                          <td className="py-2.5 px-3 text-xs">
                            <span style={{ color: "#a8a29e" }}>—</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <StatusBadge status={item.status} />
                          </td>
                          {hasPermission("admin") && (
                            <td className="py-2.5 px-2">
                              <div className="flex items-center gap-1">
                                {isEditBlocked(item.status) ? (
                                  <div
                                    className="p-1.5 rounded-md"
                                    title="Edição bloqueada — item já liberado para gráfica"
                                    style={{ color: "#d1cdc9", cursor: "not-allowed" }}
                                    data-testid={`button-edit-item-${item.id}`}
                                  >
                                    <Lock className="h-3.5 w-3.5" />
                                  </div>
                                ) : (
                                <button
                                  className="p-1.5 rounded-md transition-colors duration-100"
                                  style={{ color: "#a8a29e", backgroundColor: "transparent" }}
                                  onMouseEnter={(e) => { e.currentTarget.style.color = "#f97316"; e.currentTarget.style.backgroundColor = "#fff7ed"; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.color = "#a8a29e"; e.currentTarget.style.backgroundColor = "transparent"; }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditItem(item);
                                  }}
                                  data-testid={`button-edit-item-${item.id}`}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                )}
                                <button
                                  className="p-1.5 rounded-md transition-colors duration-100"
                                  style={{ color: "#a8a29e", backgroundColor: "transparent" }}
                                  onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.backgroundColor = "#fef2f2"; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.color = "#a8a29e"; e.currentTarget.style.backgroundColor = "transparent"; }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteItem(item.id);
                                  }}
                                  data-testid={`button-delete-item-${item.id}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
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
        </div>
      </div>

      {/* Dialog de Detalhes do Item */}
      <ItemDetailsDialog
        item={selectedItemForDetails}
        auditLogs={auditLogs}
        open={!!selectedItemForDetails}
        onOpenChange={(open) => !open && setSelectedItemForDetails(null)}
      />

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

      {/* Dialog separado para editar item — layout compacto sem scroll */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent style={{ maxWidth: "800px", width: "100%", padding: "0", backgroundColor: "#ffffff", borderRadius: "12px" }}>

          {/* Cabeçalho */}
          <DialogHeader style={{ padding: "16px 20px", borderBottom: "1px solid #e7e5e4" }}>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0" style={{ backgroundColor: "#fff7ed" }}>
                <Pencil className="h-4 w-4" style={{ color: "#f97316" }} />
              </div>
              <div>
                <DialogTitle className="text-sm font-bold leading-tight" style={{ color: "#1c1917" }}>Editar Item</DialogTitle>
                <DialogDescription className="text-[11px] mt-0.5" style={{ color: "#a8a29e" }}>
                  {editingItem ? `#${editingItem.displayId} · ${editingItem.type}` : "Atualize as informações do item"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={(e) => {
            e.preventDefault();
            if (editingItem) {
              updateItemMutation.mutate({ id: editingItem.id, data: formData });
            }
          }}>
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>

              {/* Linha 1: Tipo (60%) | Quantidade (20%) | m² Total (20%) */}
              <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr 1fr", gap: "10px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#78716c" }}>Tipo de Item</label>
                  <Input
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    placeholder="Digite o tipo"
                    className="h-9 text-sm focus-visible:ring-[#f97316] focus-visible:border-[#f97316]"
                    style={{ backgroundColor: "#fafaf9", borderColor: "#e7e5e4", color: "#1c1917" }}
                    data-testid="input-edit-type"
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#78716c" }}>Quantidade</label>
                  <Input
                    type="number"
                    min="1"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                    className="h-9 text-sm focus-visible:ring-[#f97316] focus-visible:border-[#f97316]"
                    style={{ backgroundColor: "#fafaf9", borderColor: "#e7e5e4", color: "#1c1917" }}
                    data-testid="input-edit-quantity"
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#78716c" }}>m² Total</label>
                  <div className="h-9 flex items-center px-3 rounded-md text-sm font-semibold tabular-nums" style={{ backgroundColor: "#f5f5f4", border: "1px solid #e7e5e4", color: formData.fileWidth && formData.fileHeight ? "#f97316" : "#a8a29e" }}>
                    {formData.fileWidth && formData.fileHeight
                      ? calculateM2(formData.quantity, parseFloat(formData.fileWidth) || 0, parseFloat(formData.fileHeight) || 0).toFixed(2) + " m²"
                      : "—"
                    }
                  </div>
                </div>
              </div>

              {/* Linha 2: Descrição (100%) */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#78716c" }}>
                  Descrição <span style={{ textTransform: "none", fontWeight: 400, color: "#a8a29e" }}>(opcional)</span>
                </label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descrição personalizada do item"
                  className="h-9 text-sm focus-visible:ring-[#f97316] focus-visible:border-[#f97316]"
                  style={{ backgroundColor: "#fafaf9", borderColor: "#e7e5e4", color: "#1c1917" }}
                  data-testid="input-edit-description"
                />
              </div>

              {/* Linha 3: Dimensões — 4 colunas numa só linha */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingTop: "4px", borderTop: "1px solid #e7e5e4" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#78716c" }}>Dimensões (m)</span>
                  <span style={{ fontSize: "10px", color: "#a8a29e" }}>Visual · Arquivo</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "10px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: "#78716c", display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#f97316", display: "inline-block", flexShrink: 0 }}></span>
                      Visual Larg.
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.visualWidth}
                      onChange={(e) => setFormData({ ...formData, visualWidth: e.target.value })}
                      placeholder="0.00"
                      className="h-9 text-sm focus-visible:ring-[#f97316] focus-visible:border-[#f97316]"
                      style={{ backgroundColor: "#fafaf9", borderColor: "#e7e5e4", color: "#1c1917" }}
                      data-testid="input-edit-visual-width"
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: "#78716c", display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#f97316", display: "inline-block", flexShrink: 0 }}></span>
                      Visual Alt.
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.visualHeight}
                      onChange={(e) => setFormData({ ...formData, visualHeight: e.target.value })}
                      placeholder="0.00"
                      className="h-9 text-sm focus-visible:ring-[#f97316] focus-visible:border-[#f97316]"
                      style={{ backgroundColor: "#fafaf9", borderColor: "#e7e5e4", color: "#1c1917" }}
                      data-testid="input-edit-visual-height"
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: "#78716c", display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#78716c", display: "inline-block", flexShrink: 0 }}></span>
                      Arquivo Larg.
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.fileWidth}
                      onChange={(e) => setFormData({ ...formData, fileWidth: e.target.value })}
                      placeholder="0.00"
                      className="h-9 text-sm focus-visible:ring-[#f97316] focus-visible:border-[#f97316]"
                      style={{ backgroundColor: "#fafaf9", borderColor: "#e7e5e4", color: "#1c1917" }}
                      data-testid="input-edit-file-width"
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: "#78716c", display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#78716c", display: "inline-block", flexShrink: 0 }}></span>
                      Arquivo Alt.
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.fileHeight}
                      onChange={(e) => setFormData({ ...formData, fileHeight: e.target.value })}
                      placeholder="0.00"
                      className="h-9 text-sm focus-visible:ring-[#f97316] focus-visible:border-[#f97316]"
                      style={{ backgroundColor: "#fafaf9", borderColor: "#e7e5e4", color: "#1c1917" }}
                      data-testid="input-edit-file-height"
                    />
                  </div>
                </div>
              </div>

              {/* Linha 4: Material (33%) | Acabamento (33%) | Patrocinador (33%) */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#78716c" }}>Material</label>
                  <Input
                    value={formData.material}
                    onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                    placeholder="Material"
                    className="h-9 text-sm focus-visible:ring-[#f97316] focus-visible:border-[#f97316]"
                    style={{ backgroundColor: "#fafaf9", borderColor: "#e7e5e4", color: "#1c1917" }}
                    data-testid="input-edit-material"
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#78716c" }}>Acabamento</label>
                  <Input
                    value={formData.finish}
                    onChange={(e) => setFormData({ ...formData, finish: e.target.value })}
                    placeholder="Acabamento"
                    className="h-9 text-sm focus-visible:ring-[#f97316] focus-visible:border-[#f97316]"
                    style={{ backgroundColor: "#fafaf9", borderColor: "#e7e5e4", color: "#1c1917" }}
                    data-testid="input-edit-finish"
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#78716c" }}>Patrocinador</label>
                  <Select
                    value={formData.sponsorId || "none"}
                    onValueChange={(value) => setFormData({ ...formData, sponsorId: value === "none" ? "" : value })}
                  >
                    <SelectTrigger
                      className="h-9 text-sm focus:ring-[#f97316] focus:border-[#f97316]"
                      style={{ backgroundColor: "#fafaf9", borderColor: "#e7e5e4", color: "#1c1917" }}
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
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#78716c" }}>
                  Observações <span style={{ textTransform: "none", fontWeight: 400, color: "#a8a29e" }}>(opcional)</span>
                </label>
                <Textarea
                  value={formData.observations}
                  onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                  placeholder="Observações adicionais sobre este item..."
                  className="text-sm resize-none focus-visible:ring-[#f97316] focus-visible:border-[#f97316]"
                  style={{ height: "72px", backgroundColor: "#fafaf9", borderColor: "#e7e5e4", color: "#1c1917" }}
                  data-testid="textarea-edit-observations"
                />
              </div>

              {/* Pular Aprovação — apenas Admin */}
              {user?.role === 'admin' && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", backgroundColor: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "8px" }}>
                  <Checkbox
                    id="skip-approval-edit"
                    checked={formData.skipApproval}
                    onCheckedChange={(checked) => setFormData({ ...formData, skipApproval: !!checked })}
                    data-testid="checkbox-skip-approval"
                  />
                  <div>
                    <label htmlFor="skip-approval-edit" style={{ fontSize: "12px", fontWeight: 700, color: "#c2410c", cursor: "pointer" }}>
                      Pular aprovação de patrocinador
                    </label>
                    <p style={{ fontSize: "11px", color: "#ea580c", margin: "1px 0 0 0" }}>
                      Item irá diretamente para revisão do criador sem aprovação dos patrocinadores
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé */}
            <div style={{ padding: "12px 20px", borderTop: "1px solid #e7e5e4", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditDialogOpen(false);
                  setEditingItem(null);
                }}
                style={{ borderColor: "#e7e5e4", color: "#1c1917", backgroundColor: "#ffffff" }}
                data-testid="button-cancel-edit"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={updateItemMutation.isPending}
                style={{ backgroundColor: "#1c1917", color: "#ffffff" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#000000")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#1c1917")}
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
