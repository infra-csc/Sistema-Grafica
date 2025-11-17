import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useMemo } from "react";
import { Package, Check, Calendar, Truck, Link2, AlertCircle, CheckCircle2, X } from "lucide-react";
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
      <div className="container mx-auto p-6 max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <span>Fluxo de Trabalho</span>
            <span>›</span>
            <span className="font-medium text-foreground">Vincular Patrocinadores</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">Vincular Patrocinadores aos Items</h1>
          <p className="text-muted-foreground">
            Nesta etapa você vincula os patrocinadores aos items criados pela Solicitação
          </p>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20">
            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4">
              <CheckCircle2 className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Tudo pronto!</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Não há items aguardando vinculação de patrocinadores no momento.
            </p>
            <p className="text-sm text-muted-foreground mt-3">
              Novos items aparecerão aqui quando forem criados pela equipe de Solicitação
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Header com Breadcrumb e Resumo */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <span>Fluxo de Trabalho</span>
          <span>›</span>
          <span className="font-medium text-foreground">Vincular Patrocinadores</span>
        </div>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">Vincular Patrocinadores aos Items</h1>
            <p className="text-muted-foreground">
              Vincule os patrocinadores corretos a cada item antes de enviá-los para aprovação
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-primary">{requestedItems.length}</div>
            <div className="text-sm text-muted-foreground">
              {requestedItems.length === 1 ? 'item aguardando' : 'itens aguardando'}
            </div>
          </div>
        </div>

        {/* Indicadores de Fluxo */}
        <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <span className="text-sm font-medium">Solicitação criou items</span>
          </div>
          <div className="h-px flex-1 bg-border"></div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
              <Link2 className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-medium text-primary">Você está aqui: Vincular Patrocinadores</span>
          </div>
          <div className="h-px flex-1 bg-border"></div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
              <Package className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="text-sm text-muted-foreground">Próximo: Solicitação envia para Arte</span>
          </div>
        </div>
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
              <CardHeader className="bg-muted/30 border-b">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-xl mb-3 truncate">{event.name}</CardTitle>
                    <div className="flex flex-wrap gap-3 text-sm">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>Início: {format(new Date(event.startDate), "dd/MM/yyyy", { locale: ptBR })}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Truck className="h-4 w-4" />
                        <span>Saída Caminhão: {format(new Date(event.truckDepartureDate), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Badge variant={progress.completed === progress.total ? "default" : "secondary"} className="text-sm">
                      {progress.completed} / {progress.total} concluídos
                    </Badge>
                    {eventSponsors.length === 0 && (
                      <Badge variant="destructive" className="text-xs gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Sem patrocinadores
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-6">
                {eventSponsors.length === 0 ? (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 text-center">
                    <AlertCircle className="h-12 w-12 text-yellow-600 dark:text-yellow-400 mx-auto mb-3" />
                    <p className="font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
                      Este evento não possui patrocinadores vinculados
                    </p>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      Adicione patrocinadores ao evento antes de vincular aos items
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
                          className={`border-2 rounded-lg p-5 transition-colors ${
                            itemStatus === 'linked' || itemStatus === 'skip'
                              ? 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/10'
                              : 'border-border bg-card'
                          }`}
                          data-testid={`item-card-${item.id}`}
                        >
                          {/* Header do Item */}
                          <div className="flex items-start justify-between gap-4 mb-4">
                            <div className="flex items-start gap-3 flex-1">
                              <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                                itemStatus === 'linked' || itemStatus === 'skip'
                                  ? 'bg-green-100 dark:bg-green-900'
                                  : 'bg-muted'
                              }`}>
                                {itemStatus === 'linked' || itemStatus === 'skip' ? (
                                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                                ) : (
                                  <Package className="h-5 w-5 text-muted-foreground" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-lg">{item.type}</h4>
                                {item.description && (
                                  <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                                )}
                                <div className="flex items-center gap-2 mt-2">
                                  <Badge variant="outline" className="font-normal">
                                    {item.quantity} {item.quantity === 1 ? 'unidade' : 'unidades'}
                                  </Badge>
                                  <Badge variant="outline" className="font-normal">
                                    {item.material}
                                  </Badge>
                                  <Badge variant="outline" className="font-normal">
                                    {parseFloat(item.calculatedM2).toFixed(2)} m²
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            {itemStatus === 'linked' && (
                              <Badge className="bg-green-600 dark:bg-green-700 shrink-0">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Vinculado
                              </Badge>
                            )}
                            {itemStatus === 'skip' && (
                              <Badge className="bg-blue-600 dark:bg-blue-700 shrink-0">
                                Sem Aprovação
                              </Badge>
                            )}
                          </div>

                          {/* Seleção de Patrocinadores */}
                          {!item.skipApproval && (
                            <div className="space-y-3 pl-[52px]">
                              <div className="flex items-center justify-between">
                                <label className="text-sm font-semibold text-foreground">
                                  Selecione os Patrocinadores:
                                </label>
                                {linkedSponsors.length > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    {linkedSponsors.length} {linkedSponsors.length === 1 ? 'selecionado' : 'selecionados'}
                                  </span>
                                )}
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {eventSponsors.map(sponsor => {
                                  const isChecked = linkedSponsors.includes(sponsor.id);
                                  return (
                                    <div 
                                      key={sponsor.id} 
                                      className={`flex items-center space-x-3 p-3 border-2 rounded-lg transition-all cursor-pointer hover-elevate ${
                                        isChecked 
                                          ? 'border-primary bg-primary/5' 
                                          : 'border-border bg-background'
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
                                        onCheckedChange={() => {}} // Controlled by div onClick
                                        data-testid={`checkbox-item-${item.id}-sponsor-${sponsor.id}`}
                                      />
                                      <label
                                        htmlFor={`item-${item.id}-sponsor-${sponsor.id}`}
                                        className="text-sm font-medium leading-tight cursor-pointer flex-1"
                                      >
                                        {sponsor.name}
                                      </label>
                                      {isChecked && (
                                        <Check className="h-4 w-4 text-primary shrink-0" />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Checkbox Sem Aprovação */}
                          <div className="flex items-start space-x-3 pt-4 mt-4 border-t pl-[52px]">
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
                            <div className="flex-1">
                              <label
                                htmlFor={`skip-approval-${item.id}`}
                                className="text-sm font-medium cursor-pointer block"
                              >
                                Item sem necessidade de aprovação de patrocinador
                              </label>
                              <p className="text-xs text-muted-foreground mt-1">
                                Marque esta opção se o item deve pular a etapa de aprovação e ir direto para revisão
                              </p>
                            </div>
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

      {/* Card de Próximos Passos */}
      <Card className="mt-8 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0">
              <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                Próximo Passo: Solicitação Envia para Arte
              </h3>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Após você vincular os patrocinadores aos items, a equipe de <strong>Solicitação</strong> deve acessar 
                a página do evento e clicar em <strong>"Enviar para Arte"</strong> para iniciar o processo de aprovação.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
