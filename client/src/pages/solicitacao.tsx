import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, Eye, Calendar, Truck, FileText, Check, Search, X, XCircle, ArrowLeft, Trash2, FileEdit } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useState, useMemo, Fragment } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const statusMap = {
  requested: { label: "Solicitado", color: "bg-blue-500" },
  awaiting_sponsor_approval: { label: "Aguardando Aprovação Patrocinador", color: "bg-yellow-500" },
  sponsor_approved: { label: "Aprovado pelo Patrocinador", color: "bg-purple-500" },
  awaiting_final_review: { label: "Aguardando Revisão Final", color: "bg-orange-500" },
  ready_for_production: { label: "Liberado para Produção", color: "bg-cyan-500" },
  approved: { label: "Aprovado", color: "bg-green-500" },
  inProduction: { label: "Em Produção", color: "bg-indigo-500" },
  produced: { label: "Produzido", color: "bg-teal-500" },
  delivered: { label: "Entregue", color: "bg-emerald-600" },
} as const;

export default function Solicitacao() {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [returnObservationOpen, setReturnObservationOpen] = useState(false);
  const [returnObservations, setReturnObservations] = useState("");
  const [releaseConfirmOpen, setReleaseConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelObservations, setCancelObservations] = useState("");
  
  // Confirmação em lote
  const [bulkReleaseConfirmOpen, setBulkReleaseConfirmOpen] = useState(false);
  const [bulkReturnConfirmOpen, setBulkReturnConfirmOpen] = useState(false);
  const [bulkCancelConfirmOpen, setBulkCancelConfirmOpen] = useState(false);
  const [bulkReturnObservations, setBulkReturnObservations] = useState("");
  const [bulkCancelObservations, setBulkCancelObservations] = useState("");
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [itemTypeFilter, setItemTypeFilter] = useState<string>("all");
  
  // Seleção múltipla
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  const { data: items = [], isLoading: itemsLoading } = useQuery<any[]>({
    queryKey: ["/api/items"],
  });

  const { data: events = [], isLoading: eventsLoading } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const { data: sponsors = [] } = useQuery<any[]>({
    queryKey: ["/api/sponsors"],
  });

  const { data: auditLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/audit-logs"],
  });

  const creatorReviewMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/creator-review`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setDialogOpen(false);
      setSelectedItem(null);
      toast({
        title: "Item liberado para produção",
        description: "O item foi revisado e liberado para a gráfica!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao liberar item",
        description: error.message || "Ocorreu um erro ao liberar o item",
        variant: "destructive",
      });
    },
  });

  const bulkReleaseMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      const releasePromises = itemIds.map(id => 
        apiRequest("PATCH", `/api/items/${id}/creator-review`, {})
      );
      return await Promise.all(releasePromises);
    },
    onSuccess: (_, itemIds) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSelectedItemIds(new Set());
      toast({
        title: "Itens liberados para produção",
        description: `${itemIds.length} ${itemIds.length === 1 ? 'item foi liberado' : 'itens foram liberados'} para produção!`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao liberar itens",
        description: error.message || "Ocorreu um erro ao liberar os itens",
        variant: "destructive",
      });
    },
  });



  // Items aguardando revisão final do criador
  const pendingItems = items.filter(item => item.status === 'awaiting_final_review');
  
  // Filtros aplicados
  const filteredItems = useMemo(() => {
    return pendingItems.filter(item => {
      // Filtro de busca por descrição/tipo/nome
      const matchesSearch = searchTerm === "" || 
        item.type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.name?.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Filtro de evento
      const matchesEvent = eventFilter === "all" || item.eventId === eventFilter;
      
      // Filtro de tipo de item
      const matchesType = itemTypeFilter === "all" || item.type === itemTypeFilter;
      
      return matchesSearch && matchesEvent && matchesType;
    });
  }, [pendingItems, searchTerm, eventFilter, itemTypeFilter]);
  
  // Opções únicas para filtros
  const uniqueItemTypes = useMemo(() => {
    const types = new Set(pendingItems.map(item => item.type).filter(Boolean));
    return Array.from(types).sort();
  }, [pendingItems]);

  const getEventInfo = (eventId: string) => {
    return events.find(e => e.id === eventId);
  };

  const getSponsorInfo = (sponsorId: string) => {
    return sponsors.find(s => s.id === sponsorId);
  };

  const handleViewDetails = (item: any) => {
    setSelectedItem(item);
    setDialogOpen(true);
  };

  const handleRelease = () => {
    if (selectedItem) {
      creatorReviewMutation.mutate(selectedItem.id);
    }
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const toggleAllSelection = () => {
    if (selectedItemIds.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(filteredItems.map(item => item.id)));
    }
  };

  const handleBulkRelease = () => {
    setBulkReleaseConfirmOpen(true);
  };

  const confirmBulkRelease = () => {
    const itemIds = Array.from(selectedItemIds);
    if (itemIds.length > 0) {
      bulkReleaseMutation.mutate(itemIds);
      setBulkReleaseConfirmOpen(false);
    }
  };

  const handleBulkReturnToArte = () => {
    setBulkReturnConfirmOpen(true);
    setBulkReturnObservations("");
  };

  const confirmBulkReturnToArte = () => {
    const itemIds = Array.from(selectedItemIds);
    if (itemIds.length > 0) {
      const returnPromises = itemIds.map(id =>
        apiRequest("POST", `/api/items/${id}/return-to-arte`, { notes: bulkReturnObservations })
      );
      Promise.all(returnPromises).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/items"] });
        setSelectedItemIds(new Set());
        setBulkReturnConfirmOpen(false);
        setBulkReturnObservations("");
        toast({
          title: "Itens devolvidos para Arte",
          description: `${itemIds.length} ${itemIds.length === 1 ? 'item foi devolvido' : 'itens foram devolvidos'} para a Arte.`,
        });
      }).catch((error: any) => {
        toast({
          title: "Erro ao devolver itens",
          description: error.message || "Ocorreu um erro",
          variant: "destructive",
        });
      });
    }
  };

  const handleReturnToArte = () => {
    setReturnObservationOpen(true);
    setReturnObservations("");
  };

  const confirmReturnToArte = () => {
    if (selectedItem) {
      returnToArteMutation.mutate({ itemId: selectedItem.id, notes: returnObservations });
    }
  };

  const handleBulkCancelConfirm = () => {
    setBulkCancelConfirmOpen(true);
    setBulkCancelObservations("");
  };

  const confirmBulkCancel = () => {
    const itemIds = Array.from(selectedItemIds);
    if (itemIds.length > 0) {
      bulkCancelMutation.mutate({ itemIds, notes: bulkCancelObservations });
      setBulkCancelConfirmOpen(false);
    }
  };

  const handleReleaseConfirm = () => {
    setReleaseConfirmOpen(true);
  };

  const confirmRelease = () => {
    if (selectedItem?.id) {
      creatorReviewMutation.mutate(selectedItem.id);
      setReleaseConfirmOpen(false);
    }
  };

  const handleCancelConfirm = () => {
    setCancelConfirmOpen(true);
    setCancelObservations("");
  };

  const confirmCancel = () => {
    if (selectedItem?.id) {
      bulkCancelMutation.mutate({ itemIds: [selectedItem.id], notes: cancelObservations });
      setCancelConfirmOpen(false);
    }
  };


  const editItemMutation = useMutation({
    mutationFn: async (payload: { itemId: string; updates: any }) => {
      return await apiRequest("PATCH", `/api/items/${payload.itemId}/edit`, payload.updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSelectedItem(null);
      toast({
        title: "Item atualizado",
        description: "As especificações do item foram atualizadas com sucesso.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar item",
        description: error.message || "Ocorreu um erro",
        variant: "destructive",
      });
    },
  });

  const returnToArteMutation = useMutation({
    mutationFn: async (payload: { itemId: string; notes: string }) => {
      return await apiRequest("POST", `/api/items/${payload.itemId}/return-to-arte`, { notes: payload.notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setDialogOpen(false);
      setSelectedItem(null);
      setReturnObservationOpen(false);
      setReturnObservations("");
      toast({
        title: "Item devolvido para Arte",
        description: "O item foi devolvido para a Arte com observações.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao devolver item",
        description: error.message || "Ocorreu um erro",
        variant: "destructive",
      });
    },
  });

  const bulkCancelMutation = useMutation({
    mutationFn: async (payload: { itemIds: string[], notes?: string }) => {
      return await apiRequest("PATCH", `/api/items/bulk-cancel`, { itemIds: payload.itemIds, notes: payload.notes });
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSelectedItemIds(new Set());
      setSelectedItem(null);
      setDialogOpen(false);
      setCancelConfirmOpen(false);
      setBulkCancelConfirmOpen(false);
      toast({
        title: "Itens cancelados",
        description: `${result.canceled} ${result.canceled === 1 ? 'item foi cancelado' : 'itens foram cancelados'}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao cancelar itens",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (itemsLoading || eventsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Carregando itens...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-6 gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Revisão do Criador</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Revise as aprovações dos patrocinadores e libere itens para produção
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-lg px-4 py-2">
                <AlertCircle className="h-4 w-4 mr-2" />
                {pendingItems.length} Pendentes
              </Badge>
            </div>
          </div>
          
          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por descrição ou tipo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
              {searchTerm && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                  onClick={() => setSearchTerm("")}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger className="w-full sm:w-[250px]" data-testid="select-event-filter">
                <SelectValue placeholder="Filtrar por evento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os eventos</SelectItem>
                {[...events].sort((a, b) => a.name.localeCompare(b.name)).map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={itemTypeFilter} onValueChange={setItemTypeFilter}>
              <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-type-filter">
                <SelectValue placeholder="Filtrar por tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {uniqueItemTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {(searchTerm || eventFilter !== "all" || itemTypeFilter !== "all") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchTerm("");
                  setEventFilter("all");
                  setItemTypeFilter("all");
                }}
                data-testid="button-clear-filters"
              >
                Limpar
              </Button>
            )}
            
            {selectedItemIds.size > 0 && (
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  onClick={() => {
                    const firstItem = Array.from(selectedItemIds).length === 1 
                      ? filteredItems.find(i => i.id === Array.from(selectedItemIds)[0])
                      : null;
                    if (firstItem) {
                      handleViewDetails(firstItem);
                    }
                  }}
                  data-testid="button-bulk-edit"
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                >
                  <FileEdit className="h-4 w-4 mr-2" />
                  Editar Especificações ({selectedItemIds.size})
                </Button>
                <Button
                  size="sm"
                  onClick={handleBulkRelease}
                  disabled={bulkReleaseMutation.isPending}
                  data-testid="button-bulk-release"
                  className="bg-green-500 hover:bg-green-600 text-white"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Liberar {selectedItemIds.size}
                </Button>
                <Button
                  size="sm"
                  onClick={handleBulkReturnToArte}
                  disabled={bulkCancelMutation.isPending}
                  data-testid="button-bulk-return"
                  className="bg-blue-500 hover:bg-blue-600 text-white"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Devolver {selectedItemIds.size}
                </Button>
                <Button
                  size="sm"
                  onClick={handleBulkCancelConfirm}
                  disabled={bulkCancelMutation.isPending}
                  data-testid="button-bulk-cancel"
                  className="bg-red-500 hover:bg-red-600 text-white"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Cancelar {selectedItemIds.size}
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        
        <CardContent>
          {itemsLoading || eventsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="h-12 w-12 text-status-completed mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {pendingItems.length === 0 ? "Nenhum item para revisar" : "Nenhum resultado encontrado"}
              </h3>
              <p className="text-muted-foreground">
                {pendingItems.length === 0 
                  ? "Não há itens aprovados pelos patrocinadores aguardando revisão no momento."
                  : "Tente ajustar os filtros para ver mais resultados."}
              </p>
            </div>
          ) : (
            <div>
              <table className="w-full">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-center py-3 px-3 font-medium w-10">
                      <Checkbox
                        checked={selectedItemIds.size === filteredItems.length && filteredItems.length > 0}
                        onCheckedChange={toggleAllSelection}
                        data-testid="checkbox-select-all"
                      />
                    </th>
                    <th className="text-left py-3 px-3 font-medium w-20">ID</th>
                    <th className="text-left py-3 px-3 font-medium">Tipo</th>
                    <th className="text-left py-3 px-3 font-medium">Descrição</th>
                    <th className="text-center py-3 px-3 font-medium w-16">Qtd</th>
                    <th className="text-left py-3 px-3 font-medium">Dimensões</th>
                    <th className="text-left py-3 px-3 font-medium">Patrocinador</th>
                    <th className="text-right py-3 px-3 font-medium w-56">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, index) => {
                    const event = getEventInfo(item.eventId);
                    const sponsor = item.sponsorId ? getSponsorInfo(item.sponsorId) : null;
                    const prevItem = index > 0 ? filteredItems[index - 1] : null;
                    const showEventHeader = !prevItem || prevItem.eventId !== item.eventId;
                    
                    return (
                      <Fragment key={item.id}>
                        {showEventHeader && (
                          <tr className="bg-gradient-to-r from-purple-500/10 to-purple-500/5 border-t-4 border-purple-500/30">
                            <td colSpan={8} className="py-2 px-3">
                              <div className="flex items-center gap-3">
                                <div className="h-5 w-1 bg-purple-500 rounded-full"></div>
                                <div className="text-sm font-bold text-purple-600 uppercase tracking-wider">
                                  {event?.name || 'Sem Evento'}
                                </div>
                                {event && (
                                  <div className="flex items-center gap-3 text-xs ml-auto">
                                    <div className="flex items-center gap-1.5 text-muted-foreground">
                                      <Calendar className="h-3.5 w-3.5" />
                                      <span>{new Date(event.startDate).toLocaleDateString('pt-BR')}</span>
                                    </div>
                                    {event.truckDepartureDate && (
                                      <div className="flex items-center gap-1.5 text-muted-foreground">
                                        <Truck className="h-3.5 w-3.5" />
                                        <span>Saída: {new Date(event.truckDepartureDate).toLocaleDateString('pt-BR')} {new Date(event.truckDepartureDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        <tr
                          className="border-b border-border hover-elevate"
                          data-testid={`row-item-${item.id}`}
                        >
                          <td className="py-2 px-3 text-center">
                            <Checkbox
                              checked={selectedItemIds.has(item.id)}
                              onCheckedChange={() => toggleItemSelection(item.id)}
                              data-testid={`checkbox-item-${item.id}`}
                            />
                          </td>
                          <td className="py-2 px-3">
                            <div className="text-sm font-mono font-medium text-primary" data-testid={`text-display-id-${item.id}`}>
                              {item.displayId}
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <div className="text-sm font-medium">{item.type}</div>
                          </td>
                          <td className="py-2 px-3">
                            <div className="text-sm text-muted-foreground">
                              {item.description || "—"}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <Badge variant="outline">{item.quantity}x</Badge>
                          </td>
                          <td className="py-2 px-3">
                            <div className="text-sm text-muted-foreground">
                              {item.fileWidth && item.fileHeight 
                                ? `${item.fileWidth}m x ${item.fileHeight}m` 
                                : "—"}
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <div className="text-sm text-muted-foreground">
                              {sponsor?.name || "—"}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <div className="flex gap-1.5 justify-end">
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSelectedItem(item);
                                  handleReleaseConfirm();
                                }}
                                disabled={creatorReviewMutation.isPending}
                                data-testid={`button-release-individual-${item.id}`}
                                title="Liberar para Produção"
                                className="bg-green-500 hover:bg-green-600 text-white"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSelectedItem(item);
                                  setReturnObservationOpen(true);
                                }}
                                disabled={returnToArteMutation.isPending}
                                data-testid={`button-return-individual-${item.id}`}
                                title="Devolver para Arte"
                                className="bg-blue-500 hover:bg-blue-600 text-white"
                              >
                                <ArrowLeft className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSelectedItem(item);
                                  handleCancelConfirm();
                                }}
                                disabled={bulkCancelMutation.isPending}
                                data-testid={`button-cancel-individual-${item.id}`}
                                title="Cancelar Item"
                                className="bg-red-500 hover:bg-red-600 text-white"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleViewDetails(item)}
                                data-testid={`button-view-${item.id}`}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                Revisar
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {item.observations && (
                          <tr className="bg-amber-50/50 dark:bg-amber-950/20 border-b border-amber-200/30 dark:border-amber-900/30">
                            <td colSpan={8} className="py-2 px-3">
                              <div className="flex gap-2 items-start">
                                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                                <div className="text-sm text-amber-800 dark:text-amber-200">
                                  <span className="font-semibold">Observações da Ação:</span> {item.observations}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ItemDetailsDialog
        item={selectedItem}
        auditLogs={auditLogs}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onEditSave={(editedItem) => {
          if (selectedItem?.id) {
            editItemMutation.mutate({
              itemId: selectedItem.id,
              updates: {
                type: editedItem.type,
                material: editedItem.material,
                finish: editedItem.finish,
                description: editedItem.description,
              },
            });
          }
        }}
        topActions={selectedItem ? (
          <div className="space-y-3">
            {selectedItem.approvalThumbUrl && (() => {
              const url = selectedItem.approvalThumbUrl.toLowerCase();
              const commonImageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
              const isImage = commonImageExtensions.some(ext => url.includes(ext));
              const isPdf = url.includes('.pdf') || (!isImage && url.includes('/objects/'));
              
              return (
                <Card className="bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-900">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2 text-purple-700 dark:text-purple-400">
                      📋 Thumb Aprovado {isPdf ? "(PDF)" : ""}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {isPdf ? (
                      <a
                        href={selectedItem.approvalThumbUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center w-full bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg p-4 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                        data-testid="button-open-approval-pdf"
                      >
                        <FileText className="h-5 w-5 mr-2 text-red-600 dark:text-red-400" />
                        <span className="text-red-600 dark:text-red-400 font-medium">Abrir PDF</span>
                      </a>
                    ) : (
                      <img
                        src={selectedItem.approvalThumbUrl}
                        alt="Thumb Aprovado"
                        className="w-full rounded-lg border border-purple-200 dark:border-purple-900"
                        data-testid="img-approval-thumb"
                      />
                    )}
                  </CardContent>
                </Card>
              );
            })()}
            <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2 text-green-700 dark:text-green-400">
                  <FileText className="h-4 w-4" />
                  Arquivo Final Pronto para Revisão
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {selectedItem.finalFileUrl ? (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Caminho do arquivo:</p>
                    <p className="text-sm font-mono bg-muted p-2 rounded break-all">{selectedItem.finalFileUrl}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum arquivo final enviado</p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : undefined}
        customActions={selectedItem ? (
          <div className="flex flex-col gap-2">
            <Button
              onClick={handleReleaseConfirm}
              disabled={creatorReviewMutation.isPending}
              data-testid="button-release-final"
              className="w-full"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              {creatorReviewMutation.isPending ? "Liberando..." : "Liberar para Produção"}
            </Button>
            <Button
              variant="secondary"
              onClick={handleReturnToArte}
              disabled={returnToArteMutation.isPending}
              data-testid="button-return-final"
              className="w-full"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Devolver para Arte
            </Button>
            <Button
              variant="outline"
              onClick={handleCancelConfirm}
              disabled={bulkCancelMutation.isPending}
              data-testid="button-cancel-item"
              className="w-full"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {bulkCancelMutation.isPending ? "Cancelando..." : "Cancelar Item"}
            </Button>
          </div>
        ) : undefined}
      />

      {/* AlertDialog para liberar individual - sem observações */}
      <AlertDialog open={releaseConfirmOpen} onOpenChange={setReleaseConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Liberar para Produção</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja liberar este item para produção?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-release-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRelease}
              className="bg-green-600 hover:bg-green-700 text-white"
              data-testid="button-release-confirm"
            >
              {creatorReviewMutation.isPending ? "Liberando..." : "Liberar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog para liberar em lote - sem observações */}
      <AlertDialog open={bulkReleaseConfirmOpen} onOpenChange={setBulkReleaseConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Liberar {selectedItemIds.size} itens para Produção</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja liberar {selectedItemIds.size} {selectedItemIds.size === 1 ? 'item' : 'itens'} para produção?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-bulk-release-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkRelease}
              className="bg-green-600 hover:bg-green-700 text-white"
              data-testid="button-bulk-release-confirm"
            >
              {bulkReleaseMutation.isPending ? "Liberando..." : "Liberar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog para devolver com observações */}
      <Dialog open={returnObservationOpen} onOpenChange={setReturnObservationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Devolver para Arte com Observações</DialogTitle>
            <DialogDescription>
              Adicione observações sobre o que precisa ser alterado (opcional)
            </DialogDescription>
          </DialogHeader>
          <textarea
            placeholder="Descreva as alterações necessárias..."
            value={returnObservations}
            onChange={(e) => setReturnObservations(e.target.value)}
            className="w-full min-h-24 p-2 border rounded-md bg-background text-foreground resize-none"
            data-testid="textarea-return-observations"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReturnObservationOpen(false)}
              data-testid="button-return-cancel"
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmReturnToArte}
              disabled={returnToArteMutation.isPending}
              data-testid="button-return-confirm"
              className="bg-blue-600 hover:bg-blue-700"
            >
              {returnToArteMutation.isPending ? "Devolvendo..." : "Devolver para Arte"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para cancelar item individual com observações */}
      <Dialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Item</DialogTitle>
            <DialogDescription>
              Deseja cancelar este item? Adicione uma observação opcional explicando o motivo.
              {selectedItem && (
                <div className="mt-3 p-3 bg-muted rounded-md text-sm">
                  <div><strong>Item:</strong> {selectedItem.displayId} - {selectedItem.type}</div>
                  {selectedItem.name && <div><strong>Nome:</strong> {selectedItem.name}</div>}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <textarea
            placeholder="Motivo do cancelamento (opcional)..."
            value={cancelObservations}
            onChange={(e) => setCancelObservations(e.target.value)}
            className="w-full min-h-20 p-2 border rounded-md bg-background text-foreground resize-none"
            data-testid="textarea-cancel-observations"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelConfirmOpen(false)}
              data-testid="button-cancel-cancel"
            >
              Manter Item
            </Button>
            <Button
              onClick={confirmCancel}
              disabled={bulkCancelMutation.isPending}
              data-testid="button-cancel-confirm"
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {bulkCancelMutation.isPending ? "Cancelando..." : "Confirmar Cancelamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para devolver em lote com observações */}
      <Dialog open={bulkReturnConfirmOpen} onOpenChange={setBulkReturnConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Devolver {selectedItemIds.size} itens para Arte</DialogTitle>
            <DialogDescription>
              Deseja devolver {selectedItemIds.size} {selectedItemIds.size === 1 ? 'item' : 'itens'} para a Arte? Adicione uma observação opcional.
            </DialogDescription>
          </DialogHeader>
          <textarea
            placeholder="Observações sobre alterações necessárias (opcional)..."
            value={bulkReturnObservations}
            onChange={(e) => setBulkReturnObservations(e.target.value)}
            className="w-full min-h-20 p-2 border rounded-md bg-background text-foreground resize-none"
            data-testid="textarea-bulk-return-observations"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkReturnConfirmOpen(false)}
              data-testid="button-bulk-return-cancel"
            >
              Manter Itens
            </Button>
            <Button
              onClick={confirmBulkReturnToArte}
              data-testid="button-bulk-return-confirm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Devolver para Arte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para cancelar em lote com observações */}
      <Dialog open={bulkCancelConfirmOpen} onOpenChange={setBulkCancelConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar {selectedItemIds.size} itens</DialogTitle>
            <DialogDescription>
              Deseja cancelar {selectedItemIds.size} {selectedItemIds.size === 1 ? 'item' : 'itens'}? Adicione uma observação opcional explicando o motivo.
            </DialogDescription>
          </DialogHeader>
          <textarea
            placeholder="Motivo do cancelamento (opcional)..."
            value={bulkCancelObservations}
            onChange={(e) => setBulkCancelObservations(e.target.value)}
            className="w-full min-h-20 p-2 border rounded-md bg-background text-foreground resize-none"
            data-testid="textarea-bulk-cancel-observations"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkCancelConfirmOpen(false)}
              data-testid="button-bulk-cancel-cancel"
            >
              Manter Itens
            </Button>
            <Button
              onClick={confirmBulkCancel}
              disabled={bulkCancelMutation.isPending}
              data-testid="button-bulk-cancel-confirm"
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {bulkCancelMutation.isPending ? "Cancelando..." : "Confirmar Cancelamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
