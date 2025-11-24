import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, Eye, Calendar, Truck, Search, X, Package, MapPin, Ruler, FileText, Tag, XCircle } from "lucide-react";
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
import { useState, useMemo, Fragment, useEffect, useRef } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const statusMap = {
  requested: { label: "Solicitado", color: "bg-blue-500" },
  awaiting_sponsor_approval: { label: "Aguardando Aprovação Patrocinador", color: "bg-yellow-500" },
  sponsor_approved: { label: "Aprovado pelo Patrocinador", color: "bg-purple-500" },
  awaiting_creator_review: { label: "Aguardando Revisão Criador", color: "bg-orange-500" },
  ready_for_production: { label: "Liberado para Produção", color: "bg-cyan-500" },
  approved: { label: "Aprovado", color: "bg-green-500" },
  inProduction: { label: "Em Produção", color: "bg-indigo-500" },
  produced: { label: "Produzido", color: "bg-teal-500" },
  delivered: { label: "Entregue", color: "bg-emerald-600" },
} as const;

export default function Atendimento() {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [itemTypeFilter, setItemTypeFilter] = useState<string>("all");
  const [sponsorFilter, setSponsorFilter] = useState<string>("all");
  
  // Seleção múltipla
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  
  // Map para rastrear patrocinadores de cada item
  const [itemSponsorsMap, setItemSponsorsMap] = useState<Record<string, any[]>>({});
  const [loadingSponsors, setLoadingSponsors] = useState(false);
  
  // Request ID para evitar race conditions
  const requestIdRef = useRef(0);

  const { data: items = [], isLoading: itemsLoading } = useQuery<any[]>({
    queryKey: ["/api/items"],
  });

  const { data: events = [], isLoading: eventsLoading } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const { data: sponsors = [] } = useQuery<any[]>({
    queryKey: ["/api/sponsors"],
  });

  // Memoizar awaiting items para evitar fetches desnecessários
  const awaitingItems = useMemo(() => 
    items.filter(item => 
      item.status === 'awaiting_sponsor_approval' && !item.skipApproval
    ), [items]
  );

  // Carregar patrocinadores de items pendentes
  // Sempre recarregar quando awaitingItems muda para garantir dados atualizados
  useEffect(() => {
    // Incrementar request ID SEMPRE para invalidar requests anteriores
    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;
    
    if (awaitingItems.length === 0) {
      setItemSponsorsMap({});
      setLoadingSponsors(false);
      return;
    }
    
    setLoadingSponsors(true);
    
    // Recarregar todos os sponsors para garantir dados atualizados
    Promise.all(
      awaitingItems.map(async (item) => {
        try {
          const response = await apiRequest("GET", `/api/items/${item.id}/sponsors`);
          const itemSponsors = await response.json();
          console.log(`Item ${item.id} tem ${itemSponsors.length} patrocinadores:`, itemSponsors);
          return { itemId: item.id, sponsors: itemSponsors };
        } catch (error) {
          console.error(`Erro ao carregar patrocinadores do item ${item.id}:`, error);
          return { itemId: item.id, sponsors: [] };
        }
      })
    ).then(results => {
      // Apenas atualizar se este ainda é o último request
      if (currentRequestId === requestIdRef.current) {
        const newMap = results.reduce((acc, { itemId, sponsors }) => ({
          ...acc,
          [itemId]: sponsors
        }), {});
        
        console.log('ItemSponsorsMap atualizado:', newMap);
        setItemSponsorsMap(newMap);
        setLoadingSponsors(false);
      }
    });
  }, [awaitingItems]);

  const sponsorApproveMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/sponsor-approve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setDialogOpen(false);
      setSelectedItem(null);
      toast({
        title: "Item aprovado",
        description: "O item foi aprovado pelo patrocinador com sucesso!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao aprovar item",
        description: error.message || "Ocorreu um erro ao aprovar o item",
        variant: "destructive",
      });
    },
  });

  const sponsorRejectMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/sponsor-reject`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setDialogOpen(false);
      setSelectedItem(null);
      toast({
        title: "Item reprovado",
        description: "O item foi reprovado e retornou para a Arte refazer.",
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

  const bulkApproveMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      const approvePromises = itemIds.map(id => 
        apiRequest("PATCH", `/api/items/${id}/sponsor-approve`, {})
      );
      return await Promise.all(approvePromises);
    },
    onSuccess: (_, itemIds) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setSelectedItemIds(new Set());
      toast({
        title: "Itens aprovados",
        description: `${itemIds.length} ${itemIds.length === 1 ? 'item foi aprovado' : 'itens foram aprovados'} com sucesso!`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao aprovar itens",
        description: error.message || "Ocorreu um erro ao aprovar os itens",
        variant: "destructive",
      });
    },
  });

  const bulkRejectMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      const rejectPromises = itemIds.map(id => 
        apiRequest("PATCH", `/api/items/${id}/sponsor-reject`, {})
      );
      return await Promise.all(rejectPromises);
    },
    onSuccess: (_, itemIds) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setSelectedItemIds(new Set());
      toast({
        title: "Itens reprovados",
        description: `${itemIds.length} ${itemIds.length === 1 ? 'item foi reprovado' : 'itens foram reprovados'} e ${itemIds.length === 1 ? 'retornou' : 'retornaram'} para a Arte.`,
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

  // Filtrar itens aguardando aprovação de patrocinador
  const pendingItems = awaitingItems;
  
  // Filtros aplicados
  const filteredItems = useMemo(() => {
    return pendingItems.filter(item => {
      // IMPORTANTE: Filtrar itens "órfãos" que não têm patrocinadores
      // Esses items não deveriam estar aqui, mas podem existir se os patrocinadores foram deletados
      const hasSponsors = itemSponsorsMap[item.id]?.length > 0;
      if (!hasSponsors && !loadingSponsors) {
        return false; // Ignora items sem patrocinadores
      }
      
      // Filtro de busca por descrição/tipo
      const matchesSearch = searchTerm === "" || 
        item.type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.name?.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Filtro de evento
      const matchesEvent = eventFilter === "all" || item.eventId === eventFilter;
      
      // Filtro de tipo de item
      const matchesType = itemTypeFilter === "all" || item.type === itemTypeFilter;
      
      // Filtro de patrocinador
      const matchesSponsor = sponsorFilter === "all" || 
        itemSponsorsMap[item.id]?.some(sponsor => sponsor.id === sponsorFilter);
      
      return matchesSearch && matchesEvent && matchesType && matchesSponsor;
    });
  }, [pendingItems, searchTerm, eventFilter, itemTypeFilter, sponsorFilter, itemSponsorsMap, loadingSponsors]);
  
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

  const handleApprove = () => {
    if (selectedItem) {
      sponsorApproveMutation.mutate(selectedItem.id);
    }
  };

  const handleReject = () => {
    if (selectedItem) {
      sponsorRejectMutation.mutate(selectedItem.id);
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

  const handleBulkApprove = () => {
    const itemIds = Array.from(selectedItemIds);
    if (itemIds.length > 0) {
      bulkApproveMutation.mutate(itemIds);
    }
  };

  const handleBulkReject = () => {
    const itemIds = Array.from(selectedItemIds);
    if (itemIds.length > 0) {
      bulkRejectMutation.mutate(itemIds);
    }
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
              <CardTitle className="text-2xl">Aprovação do Patrocinador</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Revise e aprove os thumbs de aprovação enviados pela equipe de Arte
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
            
            <Select value={sponsorFilter} onValueChange={setSponsorFilter}>
              <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-sponsor-filter">
                <SelectValue placeholder="Filtrar por patrocinador" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os patrocinadores</SelectItem>
                {sponsors.map((sponsor) => (
                  <SelectItem key={sponsor.id} value={sponsor.id}>
                    {sponsor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {(searchTerm || eventFilter !== "all" || itemTypeFilter !== "all" || sponsorFilter !== "all") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchTerm("");
                  setEventFilter("all");
                  setItemTypeFilter("all");
                  setSponsorFilter("all");
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
                  onClick={handleBulkApprove}
                  disabled={bulkApproveMutation.isPending}
                  data-testid="button-bulk-approve"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Aprovar {selectedItemIds.size} {selectedItemIds.size === 1 ? 'Item' : 'Itens'}
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
                {pendingItems.length === 0 ? "Nenhum item pendente" : "Nenhum resultado encontrado"}
              </h3>
              <p className="text-muted-foreground">
                {pendingItems.length === 0 
                  ? "Não há itens aguardando aprovação do patrocinador no momento."
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
                    <th className="text-left py-3 px-4 font-medium">Evento</th>
                    <th className="text-left py-3 px-4 font-medium">Tipo</th>
                    <th className="text-left py-3 px-4 font-medium">Descrição</th>
                    <th className="text-center py-3 px-4 font-medium">Qtd</th>
                    <th className="text-left py-3 px-4 font-medium">Patrocinador</th>
                    <th className="text-left py-3 px-4 font-medium">Saída Caminhão</th>
                    <th className="text-right py-3 px-4 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, index) => {
                    const event = getEventInfo(item.eventId);
                    const itemSponsors = itemSponsorsMap[item.id] || [];
                    const prevItem = index > 0 ? filteredItems[index - 1] : null;
                    const showEventHeader = !prevItem || prevItem.eventId !== item.eventId;
                    
                    return (
                      <Fragment key={item.id}>
                        {showEventHeader && (
                          <tr className="bg-gradient-to-r from-primary/10 to-primary/5 border-t-4 border-primary/30">
                            <td colSpan={9} className="py-2 px-4">
                              <div className="flex items-center gap-3">
                                <div className="h-5 w-1 bg-primary rounded-full"></div>
                                <div className="text-sm font-bold text-primary uppercase tracking-wider">
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
                          <td className="py-2 px-4 text-sm text-muted-foreground">
                            {event?.name || "—"}
                          </td>
                          <td className="py-2 px-4">
                            <div className="text-sm font-medium">{item.type}</div>
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
                            {loadingSponsors ? (
                              <div className="text-xs text-muted-foreground">Carregando...</div>
                            ) : itemSponsors.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {itemSponsors.map((sponsor) => (
                                  <Badge key={sponsor.id} variant="outline" className="text-xs">
                                    {sponsor.name}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground">—</div>
                            )}
                          </td>
                          <td className="py-2 px-4 text-sm text-muted-foreground">
                            {event?.truckDepartureDate 
                              ? `${new Date(event.truckDepartureDate).toLocaleDateString('pt-BR')} ${new Date(event.truckDepartureDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                              : "—"
                            }
                          </td>
                          <td className="py-2 px-4 text-right">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleViewDetails(item)}
                              data-testid={`button-view-${item.id}`}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Revisar
                            </Button>
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
            <DialogTitle>Aprovação do Patrocinador</DialogTitle>
            <DialogDescription>
              Revise os detalhes e o thumb de aprovação antes de aprovar
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-4">
              {selectedItem.approvalThumbUrl && (
                <Card className="border-2 border-primary/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2 text-primary">
                      <Eye className="w-5 h-5" />
                      Thumb de Aprovação
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-center rounded-lg overflow-hidden bg-muted/50 p-6">
                      <img
                        src={selectedItem.approvalThumbUrl}
                        alt="Thumb de aprovação"
                        className="max-w-2xl max-h-96 w-auto h-auto object-contain shadow-lg"
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Package className="w-4 h-4 text-primary" />
                      Informações do Item
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-start gap-2">
                      <Tag className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="font-medium">{selectedItem.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{selectedItem.type}</div>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center py-1.5 border-t">
                      <span className="text-muted-foreground">Quantidade</span>
                      <Badge variant="secondary">{selectedItem.quantity}</Badge>
                    </div>
                    
                    {(selectedItem.material || selectedItem.finish) && (
                      <div className="space-y-1.5 pt-1.5 border-t">
                        {selectedItem.material && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Material</span>
                            <span className="font-medium">{selectedItem.material}</span>
                          </div>
                        )}
                        {selectedItem.finish && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Acabamento</span>
                            <span className="font-medium">{selectedItem.finish}</span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {itemSponsorsMap[selectedItem.id]?.length > 0 && (
                      <div className="pt-1.5 border-t">
                        <div className="text-xs text-muted-foreground mb-1">
                          {itemSponsorsMap[selectedItem.id].length === 1 ? 'Patrocinador' : 'Patrocinadores'}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {itemSponsorsMap[selectedItem.id].map((sponsor) => (
                            <Badge key={sponsor.id} variant="outline" className="text-xs">
                              {sponsor.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {((selectedItem.visualWidth && selectedItem.visualHeight) || 
                      (selectedItem.fileWidth && selectedItem.fileHeight)) && (
                      <div className="space-y-2 pt-1.5 border-t">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Ruler className="w-3.5 h-3.5" />
                          <span className="text-xs font-medium">Dimensões</span>
                        </div>
                        {selectedItem.visualWidth && selectedItem.visualHeight && (
                          <div className="flex justify-between text-xs pl-5">
                            <span className="text-muted-foreground">Área Visual</span>
                            <span className="font-medium">
                              {selectedItem.visualWidth}m × {selectedItem.visualHeight}m
                            </span>
                          </div>
                        )}
                        {selectedItem.fileWidth && selectedItem.fileHeight && (
                          <div className="flex justify-between text-xs pl-5">
                            <span className="text-muted-foreground">Arquivo</span>
                            <span className="font-medium">
                              {selectedItem.fileWidth}m × {selectedItem.fileHeight}m
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-primary" />
                      Informações do Evento
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {(() => {
                      const event = getEventInfo(selectedItem.eventId);
                      return event ? (
                        <>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Nome do Evento</div>
                            <div className="font-medium">{event.name}</div>
                          </div>
                          
                          <div className="flex items-start gap-2 pt-1.5 border-t">
                            <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <div className="text-xs text-muted-foreground mb-0.5">Local</div>
                              <div className="font-medium">{event.location}</div>
                            </div>
                          </div>
                          
                          <div className="flex items-start gap-2 pt-1.5 border-t">
                            <Calendar className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <div className="text-xs text-muted-foreground mb-0.5">Data do Evento</div>
                              <div className="font-medium">
                                {format(new Date(event.startDate), "dd/MM/yyyy", { locale: ptBR })}
                              </div>
                            </div>
                          </div>
                          
                          {event.truckDepartureDate && (
                            <div className="flex items-start gap-2 pt-1.5 border-t">
                              <Truck className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                              <div className="flex-1">
                                <div className="text-xs text-muted-foreground mb-0.5">Saída do Caminhão</div>
                                <div className="font-medium text-orange-500">
                                  {format(new Date(event.truckDepartureDate), "dd/MM/yyyy HH:mm", {
                                    locale: ptBR,
                                  })}
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-muted-foreground">Evento não encontrado</div>
                      );
                    })()}
                  </CardContent>
                </Card>
              </div>

              {selectedItem.notes && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="w-4 h-4 text-primary" />
                      Observações
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {selectedItem.notes}
                    </p>
                  </CardContent>
                </Card>
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
              onClick={handleReject}
              disabled={sponsorRejectMutation.isPending}
              data-testid="button-reject"
            >
              <XCircle className="w-4 h-4 mr-2" />
              {sponsorRejectMutation.isPending ? "Reprovando..." : "Reprovar"}
            </Button>
            <Button
              onClick={handleApprove}
              disabled={sponsorApproveMutation.isPending}
              data-testid="button-approve"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              {sponsorApproveMutation.isPending ? "Aprovando..." : "Aprovar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
