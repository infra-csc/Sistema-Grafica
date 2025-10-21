import { useQuery, useMutation } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, Package, CheckCircle, Image as ImageIcon, Truck, Check, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Grafica() {
  const { toast } = useToast();
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("production");
  const [updateData, setUpdateData] = useState<Record<string, {
    deliveredBy: string;
    quantityProduced: number;
    photoUrl: string;
    markAsDelivered: boolean;
  }>>({});

  const { data: items = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/items/approved"],
  });

  const updateProductionMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: any }) => {
      return await apiRequest("POST", `/api/items/${itemId}/production`, data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setExpandedItemId(null);
      setUpdateData(prev => {
        const newData = { ...prev };
        delete newData[variables.itemId];
        return newData;
      });
      toast({
        title: "Produção registrada",
        description: "O registro de produção foi salvo com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao registrar produção",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getItemData = (itemId: string, defaultQuantity: number) => {
    return updateData[itemId] || {
      deliveredBy: "",
      quantityProduced: defaultQuantity,
      photoUrl: "",
      markAsDelivered: false,
    };
  };

  const setItemData = (itemId: string, data: any) => {
    setUpdateData(prev => ({
      ...prev,
      [itemId]: { ...getItemData(itemId, 0), ...data }
    }));
  };

  const filteredItems = statusFilter === "all" 
    ? items 
    : items.filter(item => item.status === statusFilter);

  const stats = {
    total: items.length,
    approved: items.filter(i => i.status === 'approved').length,
    inProduction: items.filter(i => i.status === 'inProduction').length,
    completed: items.filter(i => ['produced', 'delivered'].includes(i.status)).length,
  };

  const handleSubmitUpdate = (e: React.FormEvent, itemId: string) => {
    e.preventDefault();
    const data = getItemData(itemId, 0);
    
    updateProductionMutation.mutate({
      itemId,
      data,
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Produção</CardTitle>
            <Package className="h-4 w-4 text-status-production" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-production" data-testid="stat-production">{stats.inProduction}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Finalizados</CardTitle>
            <CheckCircle className="h-4 w-4 text-status-completed" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-completed" data-testid="stat-completed">{stats.completed}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle>Itens para Produção</CardTitle>
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
            <div className="space-y-3">
              {filteredItems.map((item) => {
                const isExpanded = expandedItemId === item.id;
                const itemData = getItemData(item.id, item.quantity);
                
                return (
                  <Card key={item.id} className={isExpanded ? 'border-primary' : ''} data-testid={`card-item-${item.id}`}>
                    {/* Header - sempre visível */}
                    <div 
                      className="p-4 cursor-pointer hover-elevate active-elevate-2"
                      onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                      data-testid={`button-expand-${item.id}`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-6 gap-4">
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Evento</div>
                            <div className="font-medium text-sm">{item.event?.name || 'N/A'}</div>
                            <div className="text-xs text-muted-foreground">
                              Saída: {new Date(item.event?.truckDepartureDate).toLocaleDateString('pt-BR')}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Item</div>
                            <div className="text-sm font-semibold">{item.type}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Quantidade</div>
                            <div className="text-sm font-medium tabular-nums">{item.quantity} un.</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Área (m²)</div>
                            <div className="text-sm font-medium tabular-nums">{item.calculatedM2}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Material</div>
                            <div className="text-sm">{item.material}</div>
                            <div className="text-xs text-muted-foreground">{item.finish}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Status</div>
                            <StatusBadge status={item.status} />
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" type="button">
                          {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                        </Button>
                      </div>
                    </div>

                    {/* Formulários de Produção - mostrado quando expandido */}
                    {isExpanded && (
                      <div className="border-t bg-muted/30">
                        <div className="p-4">
                          <Tabs value={activeTab} onValueChange={setActiveTab}>
                            <TabsList className="grid w-full grid-cols-2 mb-4">
                              <TabsTrigger value="production" data-testid="tab-production">
                                <Package className="h-4 w-4 mr-2" />
                                Registrar Produção
                              </TabsTrigger>
                              <TabsTrigger value="delivery" data-testid="tab-delivery">
                                <Truck className="h-4 w-4 mr-2" />
                                Marcar Entregue
                              </TabsTrigger>
                            </TabsList>

                            <TabsContent value="production">
                              <form onSubmit={(e) => handleSubmitUpdate(e, item.id)} className="space-y-4">
                                <div className="grid gap-4 md:grid-cols-2">
                                  <div className="space-y-2">
                                    <Label htmlFor={`deliveredBy-${item.id}`}>
                                      Quem entregou o arquivo?
                                    </Label>
                                    <Input
                                      id={`deliveredBy-${item.id}`}
                                      value={itemData.deliveredBy}
                                      onChange={(e) => setItemData(item.id, { deliveredBy: e.target.value })}
                                      placeholder="Ex: João Silva"
                                      data-testid={`input-delivered-by-${item.id}`}
                                    />
                                  </div>

                                  <div className="space-y-2">
                                    <Label htmlFor={`photoUrl-${item.id}`}>
                                      Foto do material (opcional)
                                    </Label>
                                    <Input
                                      id={`photoUrl-${item.id}`}
                                      type="url"
                                      value={itemData.photoUrl}
                                      onChange={(e) => setItemData(item.id, { photoUrl: e.target.value })}
                                      placeholder="https://exemplo.com/foto.jpg"
                                      data-testid={`input-photo-url-${item.id}`}
                                    />
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <Label htmlFor={`quantityProduced-${item.id}`}>
                                    Quantidade produzida
                                  </Label>
                                  <div className="flex gap-3">
                                    <Input
                                      id={`quantityProduced-${item.id}`}
                                      type="number"
                                      min="1"
                                      max={item.quantity}
                                      value={itemData.quantityProduced}
                                      onChange={(e) => setItemData(item.id, { quantityProduced: parseInt(e.target.value) || 0 })}
                                      required
                                      data-testid={`input-quantity-${item.id}`}
                                      className="flex-1"
                                    />
                                    <Button 
                                      type="button" 
                                      variant="outline"
                                      onClick={() => setItemData(item.id, { quantityProduced: item.quantity })}
                                      data-testid={`button-set-full-${item.id}`}
                                    >
                                      Total ({item.quantity})
                                    </Button>
                                  </div>
                                  <div className="flex items-center justify-between text-xs mt-1">
                                    <span className="text-muted-foreground">Produção parcial ou total</span>
                                    <span className="font-medium">{itemData.quantityProduced} de {item.quantity}</span>
                                  </div>
                                  <Progress 
                                    value={(itemData.quantityProduced / item.quantity) * 100} 
                                    className="h-2 mt-2"
                                  />
                                </div>

                                <div className="flex justify-end gap-2 pt-2">
                                  <Button 
                                    type="submit" 
                                    disabled={updateProductionMutation.isPending || itemData.quantityProduced === 0}
                                    data-testid={`button-submit-production-${item.id}`}
                                  >
                                    <Package className="h-4 w-4 mr-2" />
                                    {updateProductionMutation.isPending ? "Salvando..." : "Registrar Produção"}
                                  </Button>
                                </div>
                              </form>
                            </TabsContent>

                            <TabsContent value="delivery">
                              <form onSubmit={(e) => {
                                e.preventDefault();
                                updateProductionMutation.mutate({
                                  itemId: item.id,
                                  data: { ...itemData, markAsDelivered: true }
                                });
                              }} className="space-y-4">
                                <div className="p-4 border border-status-completed bg-status-completed/10 rounded-lg">
                                  <div className="flex items-center gap-3">
                                    <div className="p-2 bg-status-completed/20 rounded-full">
                                      <Check className="h-6 w-6 text-status-completed" />
                                    </div>
                                    <div>
                                      <h4 className="font-semibold">Marcar como Entregue</h4>
                                      <p className="text-sm text-muted-foreground">
                                        Confirme que o material foi entregue e está pronto para uso
                                      </p>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex justify-end gap-2">
                                  <Button 
                                    type="submit" 
                                    disabled={updateProductionMutation.isPending}
                                    className="bg-status-completed hover:bg-status-completed/90"
                                    data-testid={`button-mark-delivered-${item.id}`}
                                  >
                                    <Truck className="h-4 w-4 mr-2" />
                                    {updateProductionMutation.isPending ? "Processando..." : "Confirmar Entrega"}
                                  </Button>
                                </div>
                              </form>
                            </TabsContent>
                          </Tabs>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
