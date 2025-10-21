import { useQuery, useMutation } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Package, CheckCircle, Upload, Image as ImageIcon } from "lucide-react";
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
  const [updateData, setUpdateData] = useState({
    deliveredBy: "",
    quantityProduced: 0,
    photoUrl: "",
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
      setUpdateData({ deliveredBy: "", quantityProduced: 0, photoUrl: "" });
      toast({
        title: "Produção atualizada",
        description: "O status do item foi atualizado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar produção",
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
                      className={`border-b border-border hover-elevate ${index % 2 === 0 ? 'bg-card/50' : ''}`}
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
                            setUpdateData({
                              deliveredBy: "",
                              quantityProduced: item.quantity,
                              photoUrl: "",
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Atualizar Produção</DialogTitle>
            <DialogDescription>
              Registre o progresso da produção
            </DialogDescription>
          </DialogHeader>
          {selectedItem && (
            <form onSubmit={handleSubmitUpdate} className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-md space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Item:</span>
                  <span className="text-sm">{selectedItem.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Quantidade:</span>
                  <span className="text-sm">{selectedItem.quantity}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Evento:</span>
                  <span className="text-sm">{selectedItem.event?.name}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="deliveredBy">Entregue por</Label>
                <Input
                  id="deliveredBy"
                  value={updateData.deliveredBy}
                  onChange={(e) => setUpdateData({ ...updateData, deliveredBy: e.target.value })}
                  placeholder="Nome de quem entregou o arquivo"
                  data-testid="input-delivered-by"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="quantityProduced">Quantidade Produzida</Label>
                <Input
                  id="quantityProduced"
                  type="number"
                  min="0"
                  max={selectedItem.quantity}
                  value={updateData.quantityProduced}
                  onChange={(e) => setUpdateData({ ...updateData, quantityProduced: parseInt(e.target.value) })}
                  required
                  data-testid="input-quantity-produced"
                />
                <p className="text-xs text-muted-foreground">
                  Total necessário: {selectedItem.quantity}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="photoUrl">URL da Foto (opcional)</Label>
                <div className="flex gap-2">
                  <Input
                    id="photoUrl"
                    type="url"
                    value={updateData.photoUrl}
                    onChange={(e) => setUpdateData({ ...updateData, photoUrl: e.target.value })}
                    placeholder="https://..."
                    data-testid="input-photo-url"
                  />
                  <Button type="button" variant="outline" size="icon">
                    <Upload className="h-4 w-4" />
                  </Button>
                </div>
                {updateData.photoUrl && (
                  <div className="mt-2 p-2 border rounded-md">
                    <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto" />
                    <p className="text-xs text-center text-muted-foreground mt-2">Preview da foto</p>
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setSelectedItem(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={updateProductionMutation.isPending} data-testid="button-submit-production">
                  {updateProductionMutation.isPending ? "Salvando..." : "Salvar Atualização"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
