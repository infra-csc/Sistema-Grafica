import { useQuery, useMutation } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Package, CheckCircle, Truck, Calendar } from "lucide-react";
import { Fragment, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Grafica() {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [modalType, setModalType] = useState<"production" | "delivery" | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [productionData, setProductionData] = useState({
    quantityProduced: 0,
  });
  const [deliveryData, setDeliveryData] = useState({
    photoUrl: "",
    receivedBy: "",
  });

  const { data: items = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/items/approved"],
  });

  const { data: events = [] } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const startProductionMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: any }) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/start-production`, data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      await queryClient.refetchQueries({ queryKey: ["/api/items/approved"] });
      await queryClient.refetchQueries({ queryKey: ["/api/items"] });
      setSelectedItem(null);
      setModalType(null);
      setProductionData({ quantityProduced: 0 });
      toast({
        title: "Produção iniciada",
        description: "A produção foi registrada com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao iniciar produção",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const markDeliveredMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: any }) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/deliver`, data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      await queryClient.refetchQueries({ queryKey: ["/api/items/approved"] });
      await queryClient.refetchQueries({ queryKey: ["/api/items"] });
      setSelectedItem(null);
      setModalType(null);
      setDeliveryData({ photoUrl: "", receivedBy: "" });
      toast({
        title: "Entrega confirmada",
        description: "O item foi marcado como entregue com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao confirmar entrega",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredItems = items
    .filter(item => {
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesEvent = eventFilter === "all" || item.eventId === eventFilter;
      return matchesStatus && matchesEvent;
    })
    .sort((a, b) => {
      // Primeiro ordenar por evento
      const eventA = a.event?.name || '';
      const eventB = b.event?.name || '';
      if (eventA !== eventB) {
        return eventA.localeCompare(eventB);
      }
      // Depois ordenar por tipo
      return a.type.localeCompare(b.type);
    });

  const stats = {
    total: items.length,
    approved: items.filter(i => i.status === 'approved').length,
    inProduction: items.filter(i => i.status === 'inProduction').length,
    produced: items.filter(i => i.status === 'produced').length,
    delivered: items.filter(i => i.status === 'delivered').length,
  };

  const handleSubmitProduction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    
    startProductionMutation.mutate({
      itemId: selectedItem.id,
      data: productionData,
    });
  };

  const handleSubmitDelivery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    
    markDeliveredMutation.mutate({
      itemId: selectedItem.id,
      data: deliveryData,
    });
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="title-grafica">
          Gráfica - Controle de Produção
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Registre o progresso da produção dos itens
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Liberados</CardTitle>
            <CheckCircle className="h-4 w-4 text-status-inProgress" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-inProgress" data-testid="stat-approved">{stats.approved}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Aguardando produção
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Produção</CardTitle>
            <Package className="h-4 w-4 text-status-production" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-production" data-testid="stat-production">{stats.inProduction}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Produção parcial
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Finalizados</CardTitle>
            <CheckCircle className="h-4 w-4 text-status-completed" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-completed" data-testid="stat-produced">{stats.produced}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Não entregue
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entregues</CardTitle>
            <Truck className="h-4 w-4 text-status-completed" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-completed" data-testid="stat-delivered">{stats.delivered}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Para alguém
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle>Itens para Produção</CardTitle>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger className="w-full sm:w-48" data-testid="select-event-filter">
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
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-48" data-testid="select-status-filter">
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="approved">Liberados</SelectItem>
                  <SelectItem value="inProduction">Em Produção</SelectItem>
                  <SelectItem value="produced">Produzidos</SelectItem>
                  <SelectItem value="delivered">Entregues</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum item encontrado</h3>
              <p className="text-muted-foreground">
                {statusFilter === "all" 
                  ? "Não há itens liberados para produção" 
                  : "Nenhum item com este status"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium">Evento</th>
                    <th className="text-left py-3 px-4 font-medium">Item</th>
                    <th className="text-left py-3 px-4 font-medium">Qtd Total</th>
                    <th className="text-left py-3 px-4 font-medium">Qtd Produzida</th>
                    <th className="text-left py-3 px-4 font-medium">Material</th>
                    <th className="text-left py-3 px-4 font-medium">Status</th>
                    <th className="text-left py-3 px-4 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, index) => {
                    const prevItem = index > 0 ? filteredItems[index - 1] : null;
                    const showEventHeader = !prevItem || prevItem.event?.name !== item.event?.name;
                    const showTypeHeader = !prevItem || prevItem.event?.name !== item.event?.name || prevItem.type !== item.type;
                    
                    // Calcular índice do evento para cores alternadas
                    let eventIndex = 0;
                    if (item.event) {
                      const uniqueEvents = Array.from(new Set(filteredItems.map(i => i.event?.id).filter(Boolean)));
                      eventIndex = uniqueEvents.indexOf(item.event.id);
                    }
                    const isEvenEvent = eventIndex % 2 === 0;
                    
                    return (
                      <Fragment key={item.id}>
                        {showEventHeader && (
                          <tr className="bg-gradient-to-r from-primary/10 to-primary/5 border-t-4 border-primary/30">
                            <td colSpan={7} className="py-3 px-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <div className="h-6 w-1.5 bg-primary rounded-full flex-shrink-0"></div>
                                  <div className="text-sm font-bold text-primary uppercase tracking-wider break-words">
                                    {item.event?.name || 'Sem Evento'}
                                  </div>
                                </div>
                                {item.event && (
                                  <div className="flex items-center gap-3 text-xs flex-shrink-0">
                                    <div className="flex items-center gap-1.5 text-muted-foreground whitespace-nowrap">
                                      <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                                      <span className="hidden sm:inline">Início: </span>
                                      <strong className="text-foreground">{new Date(item.event.startDate).toLocaleDateString('pt-BR')}</strong>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-muted-foreground whitespace-nowrap">
                                      <Truck className="h-3.5 w-3.5 flex-shrink-0" />
                                      <span className="hidden sm:inline">Saída: </span>
                                      <strong className="text-foreground">{new Date(item.event.truckDepartureDate).toLocaleDateString('pt-BR')}</strong>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        {showTypeHeader && (
                          <tr key={`group-${item.eventId}-${item.type}`} className={`border-y border-primary/10 ${isEvenEvent ? 'bg-muted/20' : 'bg-muted/10'}`}>
                            <td colSpan={7} className="py-1.5 px-4">
                              <div className="flex items-center gap-2">
                                <div className="h-4 w-0.5 bg-primary/40 rounded-full"></div>
                                <div className="text-sm font-bold text-foreground">
                                  {item.type}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        <tr
                          key={item.id}
                          className={`border-b border-border hover-elevate ${isEvenEvent ? 'bg-muted/5' : 'bg-background'}`}
                          data-testid={`row-item-${item.id}`}
                        >
                          <td className="py-3 px-4 min-w-[180px] max-w-[240px]">
                            <div className="font-medium text-sm break-words">
                              {item.event?.name ? (
                                <>
                                  {item.event.name.split(/(\s*-\s*\d{4})/).map((part, i) => 
                                    part.match(/\s*-\s*\d{4}/) ? (
                                      <span key={i} className="whitespace-nowrap">{part}</span>
                                    ) : part
                                  )}
                                </>
                              ) : 'N/A'}
                            </div>
                            <div className="text-xs text-muted-foreground whitespace-nowrap">
                              Saída: {new Date(item.event?.truckDepartureDate).toLocaleDateString('pt-BR')}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-sm font-medium">{item.type}</div>
                          </td>
                          <td className="py-3 px-4 text-sm tabular-nums">{item.quantity}</td>
                          <td className="py-3 px-4">
                            <div className="text-sm font-semibold tabular-nums text-status-production">
                              {item.quantityProduced || '-'}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm">
                            <div>{item.material}</div>
                            <div className="text-xs text-muted-foreground">{item.finish}</div>
                          </td>
                          <td className="py-3 px-4">
                            <StatusBadge status={item.status} />
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex gap-2">
                              {item.status !== 'produced' && item.status !== 'delivered' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedItem(item);
                                    setModalType("production");
                                    setProductionData({ quantityProduced: item.quantity });
                                  }}
                                  data-testid={`button-production-${item.id}`}
                                >
                                  <Package className="h-4 w-4 mr-1" />
                                  {item.quantityProduced && item.quantityProduced > 0 
                                    ? "Continuar Produção" 
                                    : "Iniciar Produção"}
                                </Button>
                              )}
                              {item.status !== 'delivered' && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setSelectedItem(item);
                                    setModalType("delivery");
                                    setDeliveryData({ photoUrl: "", receivedBy: "" });
                                  }}
                                  data-testid={`button-deliver-${item.id}`}
                                >
                                  <Truck className="h-4 w-4 mr-1" />
                                  Marcar Entregue
                                </Button>
                              )}
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

      <Dialog open={!!selectedItem && !!modalType} onOpenChange={(open) => {
        if (!open) {
          setSelectedItem(null);
          setModalType(null);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {modalType === "production" 
                ? (selectedItem?.quantityProduced && selectedItem.quantityProduced > 0 
                    ? "Continuar Produção" 
                    : "Iniciar Produção")
                : "Confirmar Entrega"}
            </DialogTitle>
            <DialogDescription>
              {modalType === "production" 
                ? (selectedItem?.quantityProduced && selectedItem.quantityProduced > 0
                    ? "Atualize a quantidade produzida do material"
                    : "Registre a quantidade produzida do material")
                : "Registre a entrega do material produzido"}
            </DialogDescription>
          </DialogHeader>
          {selectedItem && modalType === "production" && (
            <form onSubmit={handleSubmitProduction} className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Item:</span>
                  <span className="text-sm">{selectedItem.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Evento:</span>
                  <span className="text-sm">{selectedItem.event?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Quantidade Total:</span>
                  <span className="text-sm">{selectedItem.quantity} unidades</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="quantityProduced">Quantidade Produzida *</Label>
                <div className="flex gap-2">
                  <Input
                    id="quantityProduced"
                    type="number"
                    min="1"
                    max={selectedItem.quantity}
                    value={productionData.quantityProduced}
                    onChange={(e) => setProductionData({ quantityProduced: parseInt(e.target.value) || 0 })}
                    required
                    data-testid="input-quantity-produced"
                    className="flex-1"
                  />
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={() => setProductionData({ quantityProduced: selectedItem.quantity })}
                    data-testid="button-set-total"
                  >
                    Total ({selectedItem.quantity})
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Informe quantas unidades foram produzidas (parcial ou total)
                </p>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="outline" onClick={() => {
                  setSelectedItem(null);
                  setModalType(null);
                }}>
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={startProductionMutation.isPending || productionData.quantityProduced === 0}
                  className="bg-status-production hover:bg-status-production/90"
                  data-testid="button-confirm-production"
                >
                  <Package className="h-4 w-4 mr-2" />
                  {startProductionMutation.isPending ? "Salvando..." : "Confirmar Produção"}
                </Button>
              </div>
            </form>
          )}
          {selectedItem && modalType === "delivery" && (
            <form onSubmit={handleSubmitDelivery} className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Item:</span>
                  <span className="text-sm">{selectedItem.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Evento:</span>
                  <span className="text-sm">{selectedItem.event?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Quantidade:</span>
                  <span className="text-sm">{selectedItem.quantity} unidades</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="receivedBy">Quem recebeu o material? *</Label>
                <Input
                  id="receivedBy"
                  value={deliveryData.receivedBy}
                  onChange={(e) => setDeliveryData({ ...deliveryData, receivedBy: e.target.value })}
                  placeholder="Nome de quem recebeu"
                  required
                  data-testid="input-received-by"
                />
                <p className="text-xs text-muted-foreground">
                  Nome da pessoa que recebeu o material no local do evento
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="photoUrl">Foto da entrega (opcional)</Label>
                <Input
                  id="photoUrl"
                  type="url"
                  value={deliveryData.photoUrl}
                  onChange={(e) => setDeliveryData({ ...deliveryData, photoUrl: e.target.value })}
                  placeholder="https://exemplo.com/foto.jpg"
                  data-testid="input-delivery-photo"
                />
                <p className="text-xs text-muted-foreground">
                  URL da foto do material entregue (opcional)
                </p>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="outline" onClick={() => {
                  setSelectedItem(null);
                  setModalType(null);
                }}>
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={markDeliveredMutation.isPending}
                  className="bg-status-completed hover:bg-status-completed/90"
                  data-testid="button-confirm-delivery"
                >
                  <Truck className="h-4 w-4 mr-2" />
                  {markDeliveredMutation.isPending ? "Salvando..." : "Confirmar Entrega"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
