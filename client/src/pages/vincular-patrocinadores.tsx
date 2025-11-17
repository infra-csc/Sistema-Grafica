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
    return rawEvents.filter(event => {
      const eventStartDate = startOfDay(new Date(event.startDate));
      return isAfter(eventStartDate, today) || eventStartDate.getTime() === today.getTime();
    });
  }, [rawEvents]);

  // Filtrar apenas items em status "requested"
  const requestedItems = useMemo(() => {
    const filtered = items.filter(item => item.status === 'requested');
    console.log('🔍 Debug Vincular Patrocinadores:', {
      totalItems: items.length,
      requestedItems: filtered.length,
      allItemsStatuses: items.map(i => ({ id: i.id, type: i.type, status: i.status })),
      totalEvents: rawEvents.length,
      filteredEvents: events.length,
      eventsWithRequestedItems: Object.keys(
        filtered.reduce((acc, item) => ({ ...acc, [item.eventId]: true }), {})
      ).length
    });
    return filtered;
  }, [items, rawEvents, events]);

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

  const getEventSponsors = (eventId: string) => {
    const event = events.find(e => e.id === eventId);
    if (!event) return [];
    
    // Buscar sponsors vinculados ao evento
    return sponsors.filter(sponsor => 
      event.sponsors?.includes(sponsor.id)
    );
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

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Header Simples */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Vincular Patrocinadores</h1>
      </div>

      {/* Cards de Eventos com Items */}
      <div className="space-y-6">
        {Object.entries(itemsByEvent).map(([eventId, eventItems]) => {
          const event = events.find(e => e.id === eventId);
          const eventSponsors = getEventSponsors(eventId);
          const progress = calculateProgress(eventItems);

          if (!event) return null;

          return (
            <Card key={eventId} className="overflow-hidden">
              {/* Header do Evento */}
              <CardHeader className="border-b">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-2">
                      <CardTitle className="text-lg">{event.name}</CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {progress.completed}/{progress.total}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
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
                    Patrocinadores ({eventSponsors.length})
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="p-6">
                {eventSponsors.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">
                      Adicione patrocinadores ao evento para começar
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {eventItems.map(item => {
                      const itemStatus = getItemStatus(item);
                      const linkedSponsors = itemSponsorsMap[item.id] || [];

                      return (
                        <div
                          key={item.id}
                          className={`border rounded-lg p-4 transition-colors ${
                            itemStatus === 'linked' || itemStatus === 'skip'
                              ? 'border-green-500/30 bg-green-50/30 dark:border-green-700/30 dark:bg-green-900/10'
                              : 'border-border'
                          }`}
                          data-testid={`item-card-${item.id}`}
                        >
                          {/* Header do Item */}
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium">{item.type}</h4>
                                {itemStatus === 'linked' && (
                                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-500" />
                                )}
                              </div>
                              {item.description && (
                                <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                              )}
                              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                <span>{item.quantity} un.</span>
                                <span>•</span>
                                <span>{item.material}</span>
                                <span>•</span>
                                <span>{parseFloat(item.calculatedM2).toFixed(2)} m²</span>
                              </div>
                            </div>
                          </div>

                          {/* Seleção de Patrocinadores */}
                          {!item.skipApproval && (
                            <div className="space-y-2 mt-3 pt-3 border-t">
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-medium">
                                  Patrocinadores
                                </label>
                                {linkedSponsors.length > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    {linkedSponsors.length} selecionado{linkedSponsors.length !== 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {eventSponsors.map(sponsor => {
                                  const isChecked = linkedSponsors.includes(sponsor.id);
                                  return (
                                    <div 
                                      key={sponsor.id} 
                                      className={`flex items-center space-x-2 p-2 border rounded cursor-pointer hover-elevate ${
                                        isChecked 
                                          ? 'border-primary/50 bg-primary/5' 
                                          : 'border-border'
                                      }`}
                                      onClick={() => {
                                        const newSponsors = isChecked
                                          ? linkedSponsors.filter(id => id !== sponsor.id)
                                          : [...linkedSponsors, sponsor.id];
                                        
                                        syncItemSponsorsMutation.mutate({
                                          itemId: item.id,
                                          sponsorIds: newSponsors
                                        });
                                      }}
                                    >
                                      <Checkbox
                                        id={`item-${item.id}-sponsor-${sponsor.id}`}
                                        checked={isChecked}
                                        onCheckedChange={() => {}}
                                        data-testid={`checkbox-item-${item.id}-sponsor-${sponsor.id}`}
                                      />
                                      <label
                                        htmlFor={`item-${item.id}-sponsor-${sponsor.id}`}
                                        className="text-sm cursor-pointer flex-1"
                                      >
                                        {sponsor.name}
                                      </label>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Checkbox Sem Aprovação */}
                          <div className="flex items-center space-x-2 pt-3 mt-3 border-t">
                            <Checkbox
                              id={`skip-approval-${item.id}`}
                              checked={item.skipApproval || false}
                              onCheckedChange={(checked) => {
                                updateItemSkipApprovalMutation.mutate({
                                  itemId: item.id,
                                  skipApproval: !!checked
                                });
                              }}
                              data-testid={`checkbox-skip-approval-${item.id}`}
                            />
                            <label
                              htmlFor={`skip-approval-${item.id}`}
                              className="text-sm cursor-pointer"
                            >
                              Item sem aprovação de patrocinador
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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
