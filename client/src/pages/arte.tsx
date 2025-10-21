import { useQuery, useMutation } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";

export default function Arte() {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"pending" | "approved">("pending");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [confirmApprovalItem, setConfirmApprovalItem] = useState<any>(null);

  const { data: allItems = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/items"],
  });

  const { data: events = [] } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const approveItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/approve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setSelectedItem(null);
      setConfirmApprovalItem(null);
      toast({
        title: "Item aprovado",
        description: "O item foi liberado para produção",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao aprovar item",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const approveBulkMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      return await Promise.all(
        itemIds.map(id => apiRequest("PATCH", `/api/items/${id}/approve`, {}))
      );
    },
    onSuccess: (_, itemIds) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setSelectedItems([]);
      setConfirmApprovalItem(null);
      toast({
        title: "Itens aprovados",
        description: `${itemIds.length} itens foram liberados para produção`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao aprovar itens",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredItems = allItems.filter(item => {
    const matchesEvent = eventFilter === "all" || item.eventId === eventFilter;
    const matchesView = viewMode === "pending" 
      ? item.status === 'requested'
      : item.status === 'approved' || item.status === 'inProduction' || item.status === 'produced' || item.status === 'delivered';
    return matchesEvent && matchesView;
  });

  const pendingCount = allItems.filter(item => item.status === 'requested').length;
  const approvedCount = allItems.filter(item => item.status !== 'requested').length;

  const pendingItems = filteredItems.filter(item => item.status === 'requested');
  const allPendingSelected = pendingItems.length > 0 && selectedItems.length === pendingItems.length;

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const toggleSelectAll = () => {
    if (allPendingSelected) {
      setSelectedItems([]);
    } else {
      setSelectedItems(pendingItems.map(item => item.id));
    }
  };

  const handleBulkApprove = () => {
    setConfirmApprovalItem({ type: 'bulk', count: selectedItems.length });
  };

  const handleSingleApprove = (item: any) => {
    setConfirmApprovalItem({ type: 'single', item });
  };

  const confirmApproval = () => {
    if (confirmApprovalItem?.type === 'bulk') {
      approveBulkMutation.mutate(selectedItems);
    } else if (confirmApprovalItem?.type === 'single') {
      approveItemMutation.mutate(confirmApprovalItem.item.id);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="title-arte">
          Arte - Liberação de Arquivos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Revise e libere itens para impressão
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <AlertCircle className="h-4 w-4 text-status-pending" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-pending" data-testid="stat-pending">
              {pendingCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Aguardando aprovação</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Liberados</CardTitle>
            <CheckCircle className="h-4 w-4 text-status-approved" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-approved" data-testid="stat-approved">
              {approvedCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Aprovados para produção</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <CardTitle>
                {viewMode === "pending" ? "Itens Pendentes de Aprovação" : "Histórico de Liberações"}
              </CardTitle>
              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger className="w-full sm:w-64" data-testid="select-event-filter">
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
            </div>
            
            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex gap-2">
                <Button
                  variant={viewMode === "pending" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("pending")}
                  data-testid="button-view-pending"
                >
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Pendentes ({pendingCount})
                </Button>
                <Button
                  variant={viewMode === "approved" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("approved")}
                  data-testid="button-view-approved"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Liberados ({approvedCount})
                </Button>
              </div>
              
              {viewMode === "pending" && selectedItems.length > 0 && (
                <Button
                  size="sm"
                  onClick={handleBulkApprove}
                  disabled={approveBulkMutation.isPending}
                  data-testid="button-bulk-approve"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Liberar Selecionados ({selectedItems.length})
                </Button>
              )}
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
              {viewMode === "pending" ? (
                <>
                  <CheckCircle className="h-12 w-12 text-status-completed mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Tudo aprovado!</h3>
                  <p className="text-muted-foreground">Não há itens pendentes no momento</p>
                </>
              ) : (
                <>
                  <Eye className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Nenhum item liberado</h3>
                  <p className="text-muted-foreground">Histórico vazio. Libere itens para vê-los aqui</p>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide">
                  <tr>
                    {viewMode === "pending" && (
                      <th className="w-12 py-3 px-4">
                        <Checkbox
                          checked={allPendingSelected}
                          onCheckedChange={toggleSelectAll}
                          data-testid="checkbox-select-all"
                        />
                      </th>
                    )}
                    <th className="text-left py-3 px-4 font-medium">Evento</th>
                    <th className="text-left py-3 px-4 font-medium">Item</th>
                    <th className="text-left py-3 px-4 font-medium">Qtd</th>
                    <th className="text-left py-3 px-4 font-medium">Medida</th>
                    <th className="text-left py-3 px-4 font-medium">m²</th>
                    <th className="text-left py-3 px-4 font-medium">Material</th>
                    {viewMode === "approved" && (
                      <th className="text-left py-3 px-4 font-medium">Status</th>
                    )}
                    <th className="text-left py-3 px-4 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, index) => (
                    <tr
                      key={item.id}
                      className={`border-b border-border hover-elevate ${index % 2 === 0 ? 'bg-muted/30' : ''}`}
                      data-testid={`row-pending-item-${item.id}`}
                    >
                      {viewMode === "pending" && (
                        <td className="py-3 px-4">
                          <Checkbox
                            checked={selectedItems.includes(item.id)}
                            onCheckedChange={() => toggleItemSelection(item.id)}
                            data-testid={`checkbox-item-${item.id}`}
                          />
                        </td>
                      )}
                      <td className="py-3 px-4">
                        <div className="font-medium text-sm">{item.event?.name || 'N/A'}</div>
                        <div className="text-xs text-muted-foreground">
                          Saída: {new Date(item.event?.truckDepartureDate).toLocaleDateString('pt-BR')}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-sm font-medium">{item.type}</div>
                        {item.observations && (
                          <div className="text-xs text-muted-foreground">{item.observations}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm tabular-nums">{item.quantity}</td>
                      <td className="py-3 px-4 text-sm tabular-nums">{item.area} × {item.visual}</td>
                      <td className="py-3 px-4 text-sm font-medium tabular-nums">{item.calculatedM2}</td>
                      <td className="py-3 px-4 text-sm">
                        <div>{item.material}</div>
                        <div className="text-xs text-muted-foreground">{item.finish}</div>
                      </td>
                      {viewMode === "approved" && (
                        <td className="py-3 px-4">
                          <StatusBadge status={item.status} />
                        </td>
                      )}
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedItem(item)}
                            data-testid={`button-view-${item.id}`}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Ver
                          </Button>
                          {viewMode === "pending" && (
                            <Button
                              size="sm"
                              onClick={() => handleSingleApprove(item)}
                              disabled={approveItemMutation.isPending}
                              data-testid={`button-approve-${item.id}`}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Liberar
                            </Button>
                          )}
                        </div>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalhes do Item</DialogTitle>
            <DialogDescription>
              Revise as informações antes de liberar
            </DialogDescription>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Evento</p>
                  <p className="text-sm font-semibold">{selectedItem.event?.name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Tipo</p>
                  <p className="text-sm font-semibold">{selectedItem.type}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Quantidade</p>
                  <p className="text-sm font-semibold">{selectedItem.quantity}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">m² Total</p>
                  <p className="text-sm font-semibold">{selectedItem.calculatedM2}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Material</p>
                  <p className="text-sm font-semibold">{selectedItem.material}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Acabamento</p>
                  <p className="text-sm font-semibold">{selectedItem.finish}</p>
                </div>
              </div>
              {selectedItem.observations && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Observações</p>
                  <p className="text-sm">{selectedItem.observations}</p>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setSelectedItem(null)}>
                  Fechar
                </Button>
                {selectedItem.status === 'requested' && (
                  <Button
                    onClick={() => {
                      approveItemMutation.mutate(selectedItem.id);
                    }}
                    disabled={approveItemMutation.isPending}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Liberar para Produção
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmApprovalItem} onOpenChange={(open) => !open && setConfirmApprovalItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Liberação</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmApprovalItem?.type === 'bulk' ? (
                <>
                  Você está prestes a liberar <strong>{confirmApprovalItem.count} itens</strong> para produção.
                  <br /><br />
                  Esta ação notificará a Gráfica e os itens ficarão disponíveis para impressão.
                </>
              ) : confirmApprovalItem?.type === 'single' ? (
                <>
                  Você está prestes a liberar o item <strong>{confirmApprovalItem.item?.type}</strong> para produção.
                  <br /><br />
                  Evento: <strong>{confirmApprovalItem.item?.event?.name}</strong>
                  <br />
                  Quantidade: <strong>{confirmApprovalItem.item?.quantity}</strong>
                  <br />
                  Material: <strong>{confirmApprovalItem.item?.material}</strong>
                  <br /><br />
                  Esta ação notificará a Gráfica e o item ficará disponível para impressão.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmApproval}
              disabled={approveItemMutation.isPending || approveBulkMutation.isPending}
              data-testid="button-confirm-approval"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Confirmar Liberação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
