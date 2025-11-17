import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useMemo } from "react";
import { Package, Check, Calendar, Truck } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function VincularPatrocinadores() {
  const { toast } = useToast();
  const [itemSponsorsMap, setItemSponsorsMap] = useState<Record<string, string[]>>({});

  const { data: items = [], isLoading: itemsLoading } = useQuery<any[]>({
    queryKey: ["/api/items"],
  });

  const { data: events = [] } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const { data: sponsors = [] } = useQuery<any[]>({
    queryKey: ["/api/sponsors"],
  });

  // Filtrar apenas items em status "requested"
  const requestedItems = useMemo(
    () => items.filter(item => item.status === 'requested'),
    [items]
  );

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
        description: "Configuração de aprovação atualizada com sucesso!",
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

  const getEventSponsors = (eventId: string) => {
    const event = events.find(e => e.id === eventId);
    if (!event) return [];
    
    // Buscar sponsors vinculados ao evento
    return sponsors.filter(sponsor => 
      event.sponsors?.includes(sponsor.id)
    );
  };

  if (itemsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (requestedItems.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Vincular Patrocinadores</h1>
          <p className="text-muted-foreground mt-2">
            Vincule patrocinadores aos items antes de enviá-los para aprovação
          </p>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Package className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-lg text-muted-foreground">
              Nenhum item aguardando vinculação de patrocinadores
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Items aparecem aqui após serem criados pela Solicitação
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Vincular Patrocinadores</h1>
        <p className="text-muted-foreground mt-2">
          {requestedItems.length} {requestedItems.length === 1 ? 'item aguardando' : 'itens aguardando'} vinculação de patrocinadores
        </p>
      </div>

      <div className="space-y-6">
        {Object.entries(itemsByEvent).map(([eventId, eventItems]) => {
          const event = events.find(e => e.id === eventId);
          const eventSponsors = getEventSponsors(eventId);

          if (!event) return null;

          return (
            <Card key={eventId}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-xl mb-2">{event.name}</CardTitle>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(event.startDate), "dd/MM/yyyy", { locale: ptBR })}
                      </div>
                      <div className="flex items-center gap-1">
                        <Truck className="h-4 w-4" />
                        {format(new Date(event.truckDepartureDate), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </div>
                    </div>
                  </div>
                  <Badge variant="secondary">
                    {eventItems.length} {eventItems.length === 1 ? 'item' : 'itens'}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {eventItems.map(item => (
                  <div
                    key={item.id}
                    className="border rounded-lg p-4 space-y-3"
                    data-testid={`item-card-${item.id}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold">{item.type}</h4>
                        {item.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {item.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline">
                            Qtd: {item.quantity}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* Patrocinadores do Evento */}
                    {eventSponsors.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Patrocinadores:</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {eventSponsors.map(sponsor => (
                            <div 
                              key={sponsor.id} 
                              className="flex items-center space-x-2 p-2 border rounded-md bg-card"
                            >
                              <Checkbox
                                id={`item-${item.id}-sponsor-${sponsor.id}`}
                                checked={itemSponsorsMap[item.id]?.includes(sponsor.id) || false}
                                onCheckedChange={(checked) => {
                                  const currentSponsors = itemSponsorsMap[item.id] || [];
                                  const newSponsors = checked
                                    ? [...currentSponsors, sponsor.id]
                                    : currentSponsors.filter(id => id !== sponsor.id);
                                  
                                  syncItemSponsorsMutation.mutate({
                                    itemId: item.id,
                                    sponsorIds: newSponsors
                                  });
                                }}
                                data-testid={`checkbox-item-${item.id}-sponsor-${sponsor.id}`}
                              />
                              <label
                                htmlFor={`item-${item.id}-sponsor-${sponsor.id}`}
                                className="text-sm font-medium leading-none cursor-pointer flex-1"
                              >
                                {sponsor.name}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Este evento não possui patrocinadores vinculados
                      </p>
                    )}

                    {/* Checkbox Sem Aprovação */}
                    <div className="flex items-start space-x-2 pt-2 border-t">
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
                      <div className="grid gap-1 leading-none">
                        <label
                          htmlFor={`skip-approval-${item.id}`}
                          className="text-xs font-medium cursor-pointer"
                        >
                          Sem Aprovação de Patrocinador
                        </label>
                        <p className="text-xs text-muted-foreground">
                          Pular etapa de aprovação e enviar direto para revisão
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Informação sobre próximos passos */}
      <Card className="mt-6 border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Check className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900">
                Próximo passo
              </p>
              <p className="text-sm text-blue-700 mt-1">
                Após vincular os patrocinadores, a Solicitação deverá enviar os items para Arte através da página do evento.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
