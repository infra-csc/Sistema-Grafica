import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, Eye, Calendar, Truck, FileText, Check, Search, X, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const [itemToReject, setItemToReject] = useState<any>(null);
  const [bulkRejectConfirmOpen, setBulkRejectConfirmOpen] = useState(false);
  
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

  const creatorReviewMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/creator-review`, {});
    },
    onSuccess: () => {
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

  // Mutation para reprovar individual
  const creatorRejectMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/creator-reject`, {});
    },
    onSuccess: () => {
      setDialogOpen(false);
      setSelectedItem(null);
      setRejectConfirmOpen(false);
      setItemToReject(null);
      toast({
        title: "Item reprovado",
        description: "O item foi devolvido para a Arte refazer.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao reprovar item",
        description: error.message || "Ocorreu um erro ao reprovar o item",
        variant: "destructive",
      });
    },
  });

  // Mutation para reprovar em lote
  const bulkRejectMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      return await apiRequest("PATCH", `/api/items/bulk-creator-reject`, { itemIds });
    },
    onSuccess: (result: any) => {
      setSelectedItemIds(new Set());
      setBulkRejectConfirmOpen(false);
      toast({
        title: "Itens reprovados",
        description: `${result.success} ${result.success === 1 ? 'item foi devolvido' : 'itens foram devolvidos'} para a Arte refazer.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao reprovar itens",
        description: error.message || "Ocorreu um erro ao reprovar os itens",
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
    const itemIds = Array.from(selectedItemIds);
    if (itemIds.length > 0) {
      bulkReleaseMutation.mutate(itemIds);
    }
  };

  const handleReject = (item: any) => {
    setItemToReject(item);
    setRejectConfirmOpen(true);
  };

  const confirmReject = () => {
    if (itemToReject) {
      creatorRejectMutation.mutate(itemToReject.id);
    }
  };

  const handleBulkReject = () => {
    if (selectedItemIds.size > 0) {
      setBulkRejectConfirmOpen(true);
    }
  };

  const confirmBulkReject = () => {
    const itemIds = Array.from(selectedItemIds);
    bulkRejectMutation.mutate(itemIds);
  };

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
                {events.map((event) => (
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
              <>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleBulkRelease}
                  disabled={bulkReleaseMutation.isPending}
                  data-testid="button-bulk-release"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Liberar {selectedItemIds.size} {selectedItemIds.size === 1 ? 'Item' : 'Itens'}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkReject}
                  disabled={bulkRejectMutation.isPending}
                  data-testid="button-bulk-reject"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reprovar {selectedItemIds.size} {selectedItemIds.size === 1 ? 'Item' : 'Itens'}
                </Button>
              </>
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
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-center py-3 px-4 font-medium w-10">
                      <Checkbox
                        checked={selectedItemIds.size === filteredItems.length && filteredItems.length > 0}
                        onCheckedChange={toggleAllSelection}
                        data-testid="checkbox-select-all"
                      />
                    </th>
                    <th className="text-left py-3 px-4 font-medium">ID</th>
                    <th className="text-left py-3 px-4 font-medium">Nome</th>
                    <th className="text-left py-3 px-4 font-medium">Tipo</th>
                    <th className="text-left py-3 px-4 font-medium">Descrição</th>
                    <th className="text-center py-3 px-4 font-medium">Qtd</th>
                    <th className="text-left py-3 px-4 font-medium">Material</th>
                    <th className="text-left py-3 px-4 font-medium">Acabamento</th>
                    <th className="text-left py-3 px-4 font-medium">Dimensões</th>
                    <th className="text-left py-3 px-4 font-medium">Patrocinador</th>
                    <th className="text-left py-3 px-4 font-medium">Observações</th>
                    <th className="text-right py-3 px-4 font-medium">Ações</th>
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
                            <td colSpan={12} className="py-2 px-4">
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
                          <td className="py-2 px-4 text-center">
                            <Checkbox
                              checked={selectedItemIds.has(item.id)}
                              onCheckedChange={() => toggleItemSelection(item.id)}
                              data-testid={`checkbox-item-${item.id}`}
                            />
                          </td>
                          <td className="py-2 px-4">
                            <div className="text-sm font-mono font-medium text-primary" data-testid={`text-display-id-${item.id}`}>
                              {item.displayId}
                            </div>
                          </td>
                          <td className="py-2 px-4">
                            <div className="text-sm font-medium">{item.name || "—"}</div>
                          </td>
                          <td className="py-2 px-4">
                            <div className="text-sm text-muted-foreground">{item.type}</div>
                          </td>
                          <td className="py-2 px-4">
                            {item.description ? (
                              <div className="text-sm text-foreground">{item.description}</div>
                            ) : (
                              <div className="text-sm text-muted-foreground">—</div>
                            )}
                          </td>
                          <td className="py-2 px-4 text-center">
                            <Badge variant="outline">{item.quantity}x</Badge>
                          </td>
                          <td className="py-2 px-4">
                            <div className="text-sm text-muted-foreground">{item.material || "—"}</div>
                          </td>
                          <td className="py-2 px-4">
                            <div className="text-sm text-muted-foreground">{item.finish || "—"}</div>
                          </td>
                          <td className="py-2 px-4">
                            <div className="text-sm text-muted-foreground">
                              {item.fileWidth && item.fileHeight 
                                ? `${item.fileWidth}m x ${item.fileHeight}m` 
                                : "—"}
                            </div>
                          </td>
                          <td className="py-2 px-4">
                            <div className="text-sm text-muted-foreground">
                              {sponsor?.name || "—"}
                            </div>
                          </td>
                          <td className="py-2 px-4">
                            {item.notes ? (
                              <div className="text-sm text-muted-foreground max-w-xs truncate" title={item.notes}>
                                {item.notes}
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground">—</div>
                            )}
                          </td>
                          <td className="py-2 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleViewDetails(item)}
                                data-testid={`button-view-${item.id}`}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                Revisar
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleReject(item)}
                                data-testid={`button-reject-${item.id}`}
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Reprovar
                              </Button>
                            </div>
                          </td>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Revisão Final do Criador</DialogTitle>
            <DialogDescription>
              Revise todas as aprovações e libere o item para produção
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold mb-2">Informações do Item</h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium">Nome:</span>{" "}
                      <span className="text-muted-foreground">{selectedItem.name}</span>
                    </div>
                    <div>
                      <span className="font-medium">Tipo:</span>{" "}
                      <span className="text-muted-foreground">{selectedItem.type}</span>
                    </div>
                    <div>
                      <span className="font-medium">Quantidade:</span>{" "}
                      <span className="text-muted-foreground">{selectedItem.quantity}</span>
                    </div>
                    <div>
                      <span className="font-medium">Material:</span>{" "}
                      <span className="text-muted-foreground">{selectedItem.material || "N/A"}</span>
                    </div>
                    <div>
                      <span className="font-medium">Acabamento:</span>{" "}
                      <span className="text-muted-foreground">{selectedItem.finish || "N/A"}</span>
                    </div>
                    {selectedItem.sponsorId && (
                      <div>
                        <span className="font-medium">Patrocinador:</span>{" "}
                        <span className="text-muted-foreground">
                          {getSponsorInfo(selectedItem.sponsorId)?.name || "N/A"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Informações do Evento</h3>
                  <div className="space-y-2 text-sm">
                    {(() => {
                      const event = getEventInfo(selectedItem.eventId);
                      return event ? (
                        <>
                          <div>
                            <span className="font-medium">Evento:</span>{" "}
                            <span className="text-muted-foreground">{event.name}</span>
                          </div>
                          <div>
                            <span className="font-medium">Local:</span>{" "}
                            <span className="text-muted-foreground">{event.location}</span>
                          </div>
                          <div>
                            <span className="font-medium">Data:</span>{" "}
                            <span className="text-muted-foreground">
                              {format(new Date(event.startDate), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                          </div>
                          {event.truckDepartureDate && (
                            <div>
                              <span className="font-medium">Saída do Caminhão:</span>{" "}
                              <span className="text-muted-foreground">
                                {format(new Date(event.truckDepartureDate), "dd/MM/yyyy HH:mm", {
                                  locale: ptBR,
                                })}
                              </span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-muted-foreground">Evento não encontrado</div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  Status de Aprovações
                </h3>
                <div className="space-y-2 text-sm">
                  {selectedItem.artApprovedBy && (
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600" />
                      <span>
                        <span className="font-medium">Arte:</span> Aprovado por {selectedItem.artApprovedBy}
                        {selectedItem.artApprovedAt && (
                          <span className="text-muted-foreground ml-1">
                            em {format(new Date(selectedItem.artApprovedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                  {selectedItem.sponsorApprovedBy && (
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600" />
                      <span>
                        <span className="font-medium">Patrocinador:</span> Aprovado por {selectedItem.sponsorApprovedBy}
                        {selectedItem.sponsorApprovedAt && (
                          <span className="text-muted-foreground ml-1">
                            em {format(new Date(selectedItem.sponsorApprovedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {selectedItem.notes && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-2">Observações</h3>
                  <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                    {selectedItem.notes}
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              data-testid="button-cancel"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedItem) {
                  handleReject(selectedItem);
                }
              }}
              disabled={creatorRejectMutation.isPending}
              data-testid="button-dialog-reject"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Reprovar
            </Button>
            <Button
              onClick={handleRelease}
              disabled={creatorReviewMutation.isPending}
              data-testid="button-release"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              {creatorReviewMutation.isPending ? "Liberando..." : "Liberar para Produção"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert Dialog para confirmar reprovação individual */}
      <AlertDialog open={rejectConfirmOpen} onOpenChange={setRejectConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Reprovação</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem certeza que deseja reprovar este item? Ele será devolvido para a Arte refazer o trabalho.
              {itemToReject && (
                <div className="mt-3 p-3 bg-muted rounded-md text-sm">
                  <div><strong>Item:</strong> {itemToReject.displayId} - {itemToReject.type}</div>
                  {itemToReject.name && <div><strong>Nome:</strong> {itemToReject.name}</div>}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-reject-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-reject-confirm"
            >
              {creatorRejectMutation.isPending ? "Reprovando..." : "Confirmar Reprovação"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Alert Dialog para confirmar reprovação em lote */}
      <AlertDialog open={bulkRejectConfirmOpen} onOpenChange={setBulkRejectConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Reprovação em Lote</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem certeza que deseja reprovar {selectedItemIds.size} {selectedItemIds.size === 1 ? 'item' : 'itens'}? 
              Eles serão devolvidos para a Arte refazer o trabalho.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-bulk-reject-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkReject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-bulk-reject-confirm"
            >
              {bulkRejectMutation.isPending ? "Reprovando..." : `Reprovar ${selectedItemIds.size} ${selectedItemIds.size === 1 ? 'Item' : 'Itens'}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
