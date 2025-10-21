import { useQuery, useMutation } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, Package, CheckCircle, Upload, Image as ImageIcon, Truck, Check } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Grafica() {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("production");
  const [updateData, setUpdateData] = useState({
    deliveredBy: "",
    quantityProduced: 0,
    photoUrl: "",
    markAsDelivered: false,
  });

  const { data: items = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/items/approved"],
  });

  const updateProductionMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: any }) => {
      return await apiRequest("POST", `/api/items/${itemId}/production`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setSelectedItem(null);
      setUpdateData({ deliveredBy: "", quantityProduced: 0, photoUrl: "", markAsDelivered: false });
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

  const filteredItems = statusFilter === "all" 
    ? items 
    : items.filter(item => item.status === statusFilter);

  const stats = {
    total: items.length,
    approved: items.filter(i => i.status === 'approved').length,
    inProduction: items.filter(i => i.status === 'inProduction').length,
    completed: items.filter(i => ['produced', 'delivered'].includes(i.status)).length,
  };

  const handleSubmitUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    
    updateProductionMutation.mutate({
      itemId: selectedItem.id,
      data: updateData,
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
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium">Evento</th>
                    <th className="text-left py-3 px-4 font-medium">Item</th>
                    <th className="text-left py-3 px-4 font-medium">Qtd</th>
                    <th className="text-left py-3 px-4 font-medium">m²</th>
                    <th className="text-left py-3 px-4 font-medium">Material</th>
                    <th className="text-left py-3 px-4 font-medium">Status</th>
                    <th className="text-left py-3 px-4 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, index) => (
                    <tr
                      key={item.id}
                      className={`border-b border-border hover-elevate ${index % 2 === 0 ? 'bg-muted/30' : ''}`}
                      data-testid={`row-item-${item.id}`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium text-sm">{item.event?.name || 'N/A'}</div>
                        <div className="text-xs text-muted-foreground">
                          Saída: {new Date(item.event?.truckDepartureDate).toLocaleDateString('pt-BR')}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-sm font-medium">{item.type}</div>
                      </td>
                      <td className="py-3 px-4 text-sm tabular-nums">{item.quantity}</td>
                      <td className="py-3 px-4 text-sm font-medium tabular-nums">{item.calculatedM2}</td>
                      <td className="py-3 px-4 text-sm">
                        <div>{item.material}</div>
                        <div className="text-xs text-muted-foreground">{item.finish}</div>
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="py-3 px-4">
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedItem(item);
                            setActiveTab("production");
                            setUpdateData({
                              deliveredBy: "",
                              quantityProduced: item.quantity,
                              photoUrl: "",
                              markAsDelivered: false,
                            });
                          }}
                          data-testid={`button-update-${item.id}`}
                        >
                          <Package className="h-4 w-4 mr-1" />
                          Atualizar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Controle de Produção</DialogTitle>
            <DialogDescription>
              Registre a produção e entrega de materiais
            </DialogDescription>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4">
              {/* Informações do Item */}
              <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-base">{selectedItem.type}</h3>
                    <p className="text-sm text-muted-foreground">{selectedItem.event?.name}</p>
                  </div>
                  <StatusBadge status={selectedItem.status} />
                </div>
                <Separator />
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Quantidade Total</span>
                    <p className="font-semibold">{selectedItem.quantity} un.</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Material</span>
                    <p className="font-semibold">{selectedItem.material}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Acabamento</span>
                    <p className="font-semibold">{selectedItem.finish}</p>
                  </div>
                </div>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="production" data-testid="tab-production">
                    <Package className="h-4 w-4 mr-2" />
                    Registrar Produção
                  </TabsTrigger>
                  <TabsTrigger value="delivery" data-testid="tab-delivery">
                    <Truck className="h-4 w-4 mr-2" />
                    Marcar Entregue
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="production" className="space-y-4 mt-4">
                  <form onSubmit={handleSubmitUpdate} className="space-y-4">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="deliveredBy" className="text-base font-semibold">
                          1. Quem entregou o arquivo?
                        </Label>
                        <Input
                          id="deliveredBy"
                          value={updateData.deliveredBy}
                          onChange={(e) => setUpdateData({ ...updateData, deliveredBy: e.target.value })}
                          placeholder="Ex: João Silva, Maria Souza..."
                          data-testid="input-delivered-by"
                          className="text-base"
                        />
                        <p className="text-xs text-muted-foreground">
                          Nome da pessoa que entregou o material para impressão
                        </p>
                      </div>

                      <Separator />

                      <div className="space-y-2">
                        <Label htmlFor="quantityProduced" className="text-base font-semibold">
                          2. Quantidade produzida
                        </Label>
                        <div className="flex gap-3 items-end">
                          <div className="flex-1">
                            <Input
                              id="quantityProduced"
                              type="number"
                              min="1"
                              max={selectedItem.quantity}
                              value={updateData.quantityProduced}
                              onChange={(e) => setUpdateData({ ...updateData, quantityProduced: parseInt(e.target.value) })}
                              required
                              data-testid="input-quantity-produced"
                              className="text-base"
                            />
                          </div>
                          <Button 
                            type="button" 
                            variant="outline"
                            onClick={() => setUpdateData({ ...updateData, quantityProduced: selectedItem.quantity })}
                            data-testid="button-set-full-quantity"
                          >
                            Total ({selectedItem.quantity})
                          </Button>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            Produção parcial ou total
                          </span>
                          <span className="font-medium">
                            {updateData.quantityProduced} de {selectedItem.quantity} unidades
                          </span>
                        </div>
                        <Progress 
                          value={(updateData.quantityProduced / selectedItem.quantity) * 100} 
                          className="h-2"
                        />
                      </div>

                      <Separator />

                      <div className="space-y-2">
                        <Label htmlFor="photoUrl" className="text-base font-semibold">
                          3. Anexar foto do material (opcional)
                        </Label>
                        <Input
                          id="photoUrl"
                          type="url"
                          value={updateData.photoUrl}
                          onChange={(e) => setUpdateData({ ...updateData, photoUrl: e.target.value })}
                          placeholder="https://exemplo.com/foto.jpg"
                          data-testid="input-photo-url"
                          className="text-base"
                        />
                        <p className="text-xs text-muted-foreground">
                          URL da foto do material produzido (pode enviar depois)
                        </p>
                        {updateData.photoUrl && (
                          <div className="mt-2 p-3 border rounded-md bg-card">
                            <div className="flex items-center gap-2">
                              <ImageIcon className="h-5 w-5 text-primary" />
                              <span className="text-sm font-medium">Foto anexada</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end pt-4">
                      <Button type="button" variant="outline" onClick={() => setSelectedItem(null)}>
                        Cancelar
                      </Button>
                      <Button 
                        type="submit" 
                        disabled={updateProductionMutation.isPending || updateData.quantityProduced === 0} 
                        data-testid="button-submit-production"
                      >
                        {updateProductionMutation.isPending ? "Salvando..." : "Registrar Produção"}
                      </Button>
                    </div>
                  </form>
                </TabsContent>

                <TabsContent value="delivery" className="space-y-4 mt-4">
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    updateProductionMutation.mutate({
                      itemId: selectedItem.id,
                      data: { ...updateData, markAsDelivered: true }
                    });
                  }} className="space-y-4">
                    <div className="p-4 border border-status-completed bg-status-completed/10 rounded-lg space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-status-completed/20 rounded-full">
                          <Check className="h-6 w-6 text-status-completed" />
                        </div>
                        <div>
                          <h4 className="font-semibold">Marcar como Entregue</h4>
                          <p className="text-sm text-muted-foreground">
                            Confirme que o material foi entregue e está pronto para uso no evento
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-base font-semibold">Confirmar informações:</Label>
                      <div className="p-3 bg-muted/50 rounded-md space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Item:</span>
                          <span className="font-medium">{selectedItem.type}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Quantidade:</span>
                          <span className="font-medium">{selectedItem.quantity} unidades</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Evento:</span>
                          <span className="font-medium">{selectedItem.event?.name}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end pt-4">
                      <Button type="button" variant="outline" onClick={() => setSelectedItem(null)}>
                        Cancelar
                      </Button>
                      <Button 
                        type="submit" 
                        disabled={updateProductionMutation.isPending}
                        className="bg-status-completed hover:bg-status-completed/90"
                        data-testid="button-mark-delivered"
                      >
                        {updateProductionMutation.isPending ? "Processando..." : "Confirmar Entrega"}
                      </Button>
                    </div>
                  </form>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
