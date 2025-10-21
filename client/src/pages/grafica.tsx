import { useQuery, useMutation } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Package, CheckCircle, Truck } from "lucide-react";
import { useState } from "react";
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
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deliveryData, setDeliveryData] = useState({
    photoUrl: "",
    receivedBy: "",
  });

  const { data: items = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/items/approved"],
  });

  const markDeliveredMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: any }) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/deliver`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setSelectedItem(null);
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

  const filteredItems = statusFilter === "all" 
    ? items 
    : items.filter(item => item.status === statusFilter);

  const stats = {
    total: items.length,
    approved: items.filter(i => i.status === 'approved').length,
    inProduction: items.filter(i => i.status === 'inProduction').length,
    completed: items.filter(i => ['produced', 'delivered'].includes(i.status)).length,
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
                    <th className="text-left py-3 px-4 font-medium">Qtd Total</th>
                    <th className="text-left py-3 px-4 font-medium">Qtd Produzida</th>
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
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedItem(item);
                            setDeliveryData({ photoUrl: "", receivedBy: "" });
                          }}
                          data-testid={`button-deliver-${item.id}`}
                        >
                          <Truck className="h-4 w-4 mr-1" />
                          Marcar Entregue
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Entrega</DialogTitle>
            <DialogDescription>
              Registre a entrega do material produzido
            </DialogDescription>
          </DialogHeader>
          {selectedItem && (
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
                <Button type="button" variant="outline" onClick={() => setSelectedItem(null)}>
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
