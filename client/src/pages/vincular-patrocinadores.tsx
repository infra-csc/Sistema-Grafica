import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useMemo } from "react";
import { Package, Check, Calendar, Truck, Link2, AlertCircle, CheckCircle2, X, Building2, Plus } from "lucide-react";
import { format, isAfter, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function VincularPatrocinadores() {
  const { toast } = useToast();
  const [itemSponsorsMap, setItemSponsorsMap] = useState<Record<string, string[]>>({});
  const [selectedEventForSponsors, setSelectedEventForSponsors] = useState<any>(null);
  const [selectedSponsorIds, setSelectedSponsorIds] = useState<string[]>([]);
  const [sponsorDialogOpen, setSponsorDialogOpen] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  const { data: items = [], isLoading: itemsLoading } = useQuery<any[]>({
    queryKey: ["/api/items"],
  });

  const { data: rawEvents = [] } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const { data: sponsors = [] } = useQuery<any[]>({
    queryKey: ["/api/sponsors"],
  });

  // Filtrar apenas eventos futuros (data de início >= hoje)
  const events = useMemo(() => {
    const today = startOfDay(new Date());
    console.log('📅 FILTRO DE EVENTOS - Data de hoje:', today);
    
    const filtered = rawEvents.filter(event => {
      const eventStartDate = startOfDay(new Date(event.startDate));
      const shouldShow = isAfter(eventStartDate, today) || eventStartDate.getTime() === today.getTime();
      
      console.log(`  📌 Evento "${event.name}":`, {
        startDate: event.startDate,
        startDateParsed: eventStartDate,
        shouldShow,
        isAfter: isAfter(eventStartDate, today),
        isSameDay: eventStartDate.getTime() === today.getTime()
      });
      
      return shouldShow;
    });
    
    console.log(`✅ ${filtered.length} de ${rawEvents.length} eventos passaram no filtro`);
    return filtered;
  }, [rawEvents]);

  // Filtrar apenas items em status "requested"
  const requestedItems = useMemo(() => {
    const filtered = items.filter(item => item.status === 'requested');
    console.log('🔍 Debug Vincular Patrocinadores:', {
      totalItems: items.length,
      requestedItems: filtered.length,
      allItemsStatuses: items.map(i => ({ id: i.id, type: i.type, status: i.status }))
    });
    return filtered;
  }, [items]);

  // Agrupar items por evento
  const itemsByEvent = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    requestedItems.forEach(item => {
      if (!grouped[item.eventId]) {
        grouped[item.eventId] = [];
      }
      grouped[item.eventId].push(item);
    });
    return grouped;
  }, [requestedItems]);

  // Carregar sponsors de todos os items requested
  useEffect(() => {
    if (requestedItems.length === 0) {
      setItemSponsorsMap({});
      return;
    }

    Promise.all(
      requestedItems.map(async (item) => {
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
      
      setItemSponsorsMap(newMap);
    });
  }, [requestedItems]);

  // Mutation para sincronizar patrocinadores
  const syncItemSponsorsMutation = useMutation({
    mutationFn: async ({ itemId, sponsorIds }: { itemId: string, sponsorIds: string[] }) => {
      await apiRequest("POST", `/api/items/${itemId}/sponsors/sync`, { sponsorIds });
    },
    onMutate: async ({ itemId, sponsorIds }) => {
      setItemSponsorsMap(prev => ({
        ...prev,
        [itemId]: sponsorIds
      }));
    },
    onSuccess: async (_, { itemId }) => {
      try {
        const response = await apiRequest("GET", `/api/items/${itemId}/sponsors`);
        const itemSponsors = await response.json();
        const sponsorIds = itemSponsors.map((is: any) => is.sponsorId);
        
        setItemSponsorsMap(prev => ({
          ...prev,
          [itemId]: sponsorIds
        }));

        toast({
          title: "Atualizado!",
          description: "Patrocinadores vinculados com sucesso",
        });
      } catch (error) {
        console.error(`Erro ao recarregar sponsors do item ${itemId}:`, error);
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar patrocinadores",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para atualizar skipApproval
  const updateItemSkipApprovalMutation = useMutation({
    mutationFn: async ({ itemId, skipApproval }: { itemId: string, skipApproval: boolean }) => {
      await apiRequest("PATCH", `/api/items/${itemId}`, { skipApproval });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({
        title: "Atualizado",
        description: "Configuração de aprovação atualizada",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para gerenciar patrocinadores do evento
  const manageEventSponsorsMutation = useMutation({
    mutationFn: async ({ eventId, currentSponsors, newSponsors }: { 
      eventId: string, 
      currentSponsors: string[], 
      newSponsors: string[] 
    }) => {
      const toAdd = newSponsors.filter(id => !currentSponsors.includes(id));
      const toRemove = currentSponsors.filter(id => !newSponsors.includes(id));
      
      // Adicionar novos patrocinadores
      for (const sponsorId of toAdd) {
        await apiRequest("POST", `/api/events/${eventId}/sponsors`, { sponsorId });
      }
      
      // Remover patrocinadores desmarcados
      for (const sponsorId of toRemove) {
        await apiRequest("DELETE", `/api/events/${eventId}/sponsors/${sponsorId}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setSponsorDialogOpen(false);
      toast({
        title: "Patrocinadores atualizados!",
        description: "Os patrocinadores do evento foram atualizados com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar patrocinadores",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleOpenSponsorDialog = (event: any) => {
    setSelectedEventForSponsors(event);
    const eventSponsors = getEventSponsors(event.id);
    setSelectedSponsorIds(eventSponsors.map(s => s.id));
    setSponsorDialogOpen(true);
  };

  const handleSaveEventSponsors = () => {
    if (!selectedEventForSponsors) return;
    
    const currentSponsors = getEventSponsors(selectedEventForSponsors.id).map(s => s.id);
    
    manageEventSponsorsMutation.mutate({
      eventId: selectedEventForSponsors.id,
      currentSponsors,
      newSponsors: selectedSponsorIds,
    });
  };

  // Normalizar patrocinadores do evento (event.sponsors é array de objetos relation)
  const eventSponsorMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    rawEvents.forEach(event => {
      if (event.sponsors && Array.isArray(event.sponsors)) {
        map[event.id] = event.sponsors.map((rel: any) => rel.sponsorId);
      } else {
        map[event.id] = [];
      }
    });
    return map;
  }, [rawEvents]);

  const getEventSponsors = (eventId: string) => {
    const sponsorIds = eventSponsorMap[eventId] || [];
    return sponsors.filter(sponsor => sponsorIds.includes(sponsor.id));
  };

  // Calcular progresso
  const getItemStatus = (item: any) => {
    const linkedSponsors = itemSponsorsMap[item.id] || [];
    if (item.skipApproval) return 'skip';
    if (linkedSponsors.length === 0) return 'pending';
    return 'linked';
  };

  const calculateProgress = (eventItems: any[]) => {
    const completed = eventItems.filter(item => {
      const status = getItemStatus(item);
      return status === 'linked' || status === 'skip';
    }).length;
    return { completed, total: eventItems.length };
  };

  if (itemsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando items...</p>
        </div>
      </div>
    );
  }

  if (requestedItems.length === 0) {
    return (
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Vincular Patrocinadores</h1>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              Nenhum item aguardando vinculação
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Ações em lote
  const handleBulkLink = (itemIds: string[], sponsorId: string) => {
    itemIds.forEach(itemId => {
      const currentSponsors = itemSponsorsMap[itemId] || [];
      if (!currentSponsors.includes(sponsorId)) {
        syncItemSponsorsMutation.mutate({
          itemId,
          sponsorIds: [...currentSponsors, sponsorId]
        });
      }
    });
  };

  const handleBulkSkipApproval = (itemIds: string[]) => {
    itemIds.forEach(itemId => {
      updateItemSkipApprovalMutation.mutate({
        itemId,
        skipApproval: true
      });
    });
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Vincular Patrocinadores</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vincule patrocinadores aos items ou marque como "sem aprovação"
        </p>
      </div>

      {/* Cards de Eventos - Matriz Visual */}
      <div className="space-y-8">
        {Object.entries(itemsByEvent).map(([eventId, eventItems]) => {
          const event = events.find(e => e.id === eventId);
          const eventSponsors = getEventSponsors(eventId);
          const progress = calculateProgress(eventItems);
          const eventSelectedItems = selectedItemIds.filter(id =>
            eventItems.some(item => item.id === id)
          );

          if (!event) return null;

          return (
            <Card key={eventId}>
              {/* Header do Evento */}
              <CardHeader className="border-b space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <CardTitle className="text-lg">{event.name}</CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {progress.completed}/{progress.total} items
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>{format(new Date(event.startDate), "dd/MM/yyyy", { locale: ptBR })}</span>
                      <span>•</span>
                      <span>Caminhão: {format(new Date(event.truckDepartureDate), "dd/MM 'às' HH:mm", { locale: ptBR })}</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenSponsorDialog(event)}
                    className="gap-2"
                    data-testid={`button-manage-event-sponsors-${event.id}`}
                  >
                    <Building2 className="h-4 w-4" />
                    {eventSponsors.length === 0 ? 'Adicionar Patrocinadores' : `${eventSponsors.length} Patrocinador${eventSponsors.length !== 1 ? 'es' : ''}`}
                  </Button>
                </div>

                {/* Patrocinadores do Evento - Badges */}
                {eventSponsors.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {eventSponsors.map(sponsor => (
                      <Badge key={sponsor.id} variant="outline" className="gap-1">
                        <Building2 className="h-3 w-3" />
                        {sponsor.name}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Ações em Lote */}
                {eventSelectedItems.length > 0 && eventSponsors.length > 0 && (
                  <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                    <span className="text-sm font-medium">
                      {eventSelectedItems.length} item{eventSelectedItems.length !== 1 ? 's' : ''} selecionado{eventSelectedItems.length !== 1 ? 's' : ''}:
                    </span>
                    <div className="flex gap-2 flex-wrap">
                      {eventSponsors.map(sponsor => (
                        <Button
                          key={sponsor.id}
                          size="sm"
                          variant="outline"
                          onClick={() => handleBulkLink(eventSelectedItems, sponsor.id)}
                          className="gap-1"
                        >
                          <Link2 className="h-3 w-3" />
                          Vincular a {sponsor.name}
                        </Button>
                      ))}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleBulkSkipApproval(eventSelectedItems)}
                        className="gap-1"
                      >
                        <X className="h-3 w-3" />
                        Sem Aprovação
                      </Button>
                    </div>
                  </div>
                )}
              </CardHeader>

              {/* Tabela de Items */}
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b bg-muted/30">
                      <tr>
                        <th className="p-3 text-left w-12">
                          <Checkbox
                            checked={eventSelectedItems.length === eventItems.length}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedItemIds(prev => [
                                  ...prev.filter(id => !eventItems.some(item => item.id === id)),
                                  ...eventItems.map(item => item.id)
                                ]);
                              } else {
                                setSelectedItemIds(prev =>
                                  prev.filter(id => !eventItems.some(item => item.id === id))
                                );
                              }
                            }}
                          />
                        </th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Item</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Qtd</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Material</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Patrocinadores</th>
                        <th className="p-3 text-center text-xs font-medium text-muted-foreground">Sem Aprovação</th>
                        <th className="p-3 text-center text-xs font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eventItems.map(item => {
                        const itemStatus = getItemStatus(item);
                        const linkedSponsors = itemSponsorsMap[item.id] || [];
                        const isSelected = selectedItemIds.includes(item.id);

                        return (
                          <tr
                            key={item.id}
                            className={`border-b hover:bg-muted/30 transition-colors ${
                              itemStatus === 'linked' || itemStatus === 'skip'
                                ? 'bg-green-50/50 dark:bg-green-900/10'
                                : ''
                            } ${isSelected ? 'bg-primary/5' : ''}`}
                            data-testid={`item-row-${item.id}`}
                          >
                            <td className="p-3">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleItemSelection(item.id)}
                              />
                            </td>
                            <td className="p-3">
                              <div>
                                <div className="font-medium text-sm">{item.type}</div>
                                {item.description && (
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    {item.description}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-sm">{item.quantity}</td>
                            <td className="p-3 text-sm">{item.material}</td>
                            <td className="p-3">
                              {!item.skipApproval && eventSponsors.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {eventSponsors.map(sponsor => {
                                    const isLinked = linkedSponsors.includes(sponsor.id);
                                    return (
                                      <Button
                                        key={sponsor.id}
                                        size="sm"
                                        variant={isLinked ? "default" : "outline"}
                                        onClick={() => {
                                          const newSponsors = isLinked
                                            ? linkedSponsors.filter(id => id !== sponsor.id)
                                            : [...linkedSponsors, sponsor.id];
                                          syncItemSponsorsMutation.mutate({
                                            itemId: item.id,
                                            sponsorIds: newSponsors
                                          });
                                        }}
                                        className="h-7 text-xs gap-1"
                                      >
                                        {isLinked && <Check className="h-3 w-3" />}
                                        {sponsor.name}
                                      </Button>
                                    );
                                  })}
                                </div>
                              )}
                              {!item.skipApproval && eventSponsors.length === 0 && (
                                <span className="text-xs text-muted-foreground italic">
                                  Adicione patrocinadores ao evento
                                </span>
                              )}
                              {item.skipApproval && (
                                <Badge variant="secondary" className="text-xs">
                                  Sem patrocinador
                                </Badge>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <Checkbox
                                checked={item.skipApproval || false}
                                onCheckedChange={(checked) => {
                                  updateItemSkipApprovalMutation.mutate({
                                    itemId: item.id,
                                    skipApproval: !!checked
                                  });
                                }}
                                data-testid={`checkbox-skip-approval-${item.id}`}
                              />
                            </td>
                            <td className="p-3 text-center">
                              {itemStatus === 'linked' && (
                                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-500 inline" />
                              )}
                              {itemStatus === 'skip' && (
                                <Badge variant="secondary" className="text-xs">OK</Badge>
                              )}
                              {itemStatus === 'pending' && (
                                <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 inline" />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Dialog para Gerenciar Patrocinadores do Evento */}
      <Dialog open={sponsorDialogOpen} onOpenChange={setSponsorDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Gerenciar Patrocinadores do Evento
            </DialogTitle>
            <DialogDescription>
              {selectedEventForSponsors && (
                <span>Selecione os patrocinadores para <strong>{selectedEventForSponsors.name}</strong></span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[400px] overflow-y-auto">
            {sponsors.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum patrocinador cadastrado no sistema
              </p>
            ) : (
              <div className="space-y-2">
                {sponsors.map((sponsor) => (
                  <div 
                    key={sponsor.id} 
                    className={`flex items-center space-x-3 p-3 border-2 rounded-lg transition-all cursor-pointer hover-elevate ${
                      selectedSponsorIds.includes(sponsor.id)
                        ? 'border-primary bg-primary/5' 
                        : 'border-border bg-background'
                    }`}
                    onClick={() => {
                      if (selectedSponsorIds.includes(sponsor.id)) {
                        setSelectedSponsorIds(selectedSponsorIds.filter(id => id !== sponsor.id));
                      } else {
                        setSelectedSponsorIds([...selectedSponsorIds, sponsor.id]);
                      }
                    }}
                  >
                    <Checkbox
                      id={`event-sponsor-${sponsor.id}`}
                      checked={selectedSponsorIds.includes(sponsor.id)}
                      onCheckedChange={() => {}} // Controlled by div onClick
                      data-testid={`checkbox-event-sponsor-${sponsor.id}`}
                    />
                    <label
                      htmlFor={`event-sponsor-${sponsor.id}`}
                      className="text-sm font-medium leading-tight cursor-pointer flex-1"
                    >
                      {sponsor.name}
                      {sponsor.company && (
                        <span className="text-muted-foreground ml-1">({sponsor.company})</span>
                      )}
                    </label>
                    {selectedSponsorIds.includes(sponsor.id) && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              {selectedSponsorIds.length} {selectedSponsorIds.length === 1 ? 'patrocinador selecionado' : 'patrocinadores selecionados'}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setSponsorDialogOpen(false)}
                disabled={manageEventSponsorsMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveEventSponsors}
                disabled={manageEventSponsorsMutation.isPending}
                data-testid="button-save-event-sponsors"
              >
                {manageEventSponsorsMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
