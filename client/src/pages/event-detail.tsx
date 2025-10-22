import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, ArrowLeft, Calendar, Truck, AlertCircle, List, Clock, FileCheck, CheckCircle, Package, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { BulkItemEntry } from "@/components/bulk-item-entry";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";

const itemTypes = ["2x1", "Arena", "Halter", "Palco", "Painel Rosto", "Percurso", "Pórtico", "Prismas", "Qd Fotos", "Rolo", "Stand", "Testeiras", "WindBanner"];
const materials = ["Adesivo", "Lona", "Sanett", "Tecido"];
const finishes = ["Dupla Face", "Ilhós", "Impresso", "Recorte", "Refile"];

export default function EventDetail() {
  const { hasPermission } = useAuth();
  const [, params] = useRoute("/eventos/:id");
  const eventId = params?.id;
  const [open, setOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState(true);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    type: "",
    quantity: 1,
    area: "",
    visual: "",
    material: "",
    finish: "",
    measurement: "",
    observations: "",
  });

  const { data: event, isLoading: loadingEvent } = useQuery<any>({
    queryKey: ["/api/events", eventId],
    enabled: !!eventId,
  });

  const { data: items = [], isLoading: loadingItems } = useQuery<any[]>({
    queryKey: ["/api/items", eventId],
    enabled: !!eventId,
  });

  const { data: auditLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/audit-logs"],
  });

  const createItemMutation = useMutation({
    mutationFn: async (data: any) => {
      const area = parseFloat(data.area);
      const visual = parseFloat(data.visual);
      const calculatedM2 = (data.quantity * area * visual).toFixed(2);
      
      return await apiRequest("POST", "/api/items", {
        ...data,
        eventId,
        calculatedM2,
        measurement: data.measurement || `${area} × ${visual}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      setOpen(false);
      setFormData({
        type: "",
        quantity: 1,
        area: "",
        visual: "",
        material: "",
        finish: "",
        measurement: "",
        observations: "",
      });
      toast({
        title: "Item adicionado",
        description: "O item foi adicionado ao evento",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao adicionar item",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createBulkItemsMutation = useMutation({
    mutationFn: async (items: any[]) => {
      return await apiRequest("POST", "/api/items/bulk", { items });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      setOpen(false);
      setBulkMode(false);
      toast({
        title: "Itens adicionados",
        description: `${data.length} itens foram adicionados ao evento`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao adicionar itens",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const area = parseFloat(data.area);
      const visual = parseFloat(data.visual);
      const calculatedM2 = (data.quantity * area * visual).toFixed(2);
      
      return await apiRequest("PATCH", `/api/items/${id}`, {
        ...data,
        calculatedM2,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      setEditingItem(null);
      setOpen(false);
      setBulkMode(false);
      toast({
        title: "Item atualizado",
        description: "O item foi atualizado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar item",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      setDeletingItemId(null);
      toast({
        title: "Item excluído",
        description: "O item foi excluído com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir item",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) {
      updateItemMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createItemMutation.mutate(formData);
    }
  };

  const handleEditItem = (item: any) => {
    setEditingItem(item);
    setBulkMode(false);
    setFormData({
      type: item.type || "",
      quantity: item.quantity || 1,
      area: item.area || "",
      visual: item.visual || "",
      material: item.material || "",
      finish: item.finish || "",
      measurement: item.measurement || "",
      observations: item.observations || "",
    });
    setOpen(true);
  };

  const handleDeleteItem = (id: string) => {
    setDeletingItemId(id);
  };

  const handleCloseDialog = () => {
    setOpen(false);
    setEditingItem(null);
    setBulkMode(true);
    setFormData({
      type: "",
      quantity: 1,
      area: "",
      visual: "",
      material: "",
      finish: "",
      measurement: "",
      observations: "",
    });
  };

  if (loadingEvent || loadingItems) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Evento não encontrado</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Criar mapa de audit logs
  const auditLogMap = new Map<string, any>();
  auditLogs.forEach(log => {
    const key = `${log.entityId}-${log.action}`;
    auditLogMap.set(key, log);
  });

  // Construir timeline apenas para este evento
  const eventTimeline: any[] = [];

  // Evento criado
  const eventCreatedLog = auditLogMap.get(`${event.id}-created`);
  if (eventCreatedLog) {
    eventTimeline.push({
      type: 'event_created',
      timestamp: new Date(event.createdAt),
      userName: eventCreatedLog.userName,
      icon: Calendar,
      color: 'text-primary',
      label: 'Evento Criado',
    });
  }

  // Ações dos itens
  items.forEach((item: any) => {
    const itemCreatedLog = auditLogMap.get(`${item.id}-created`);
    if (itemCreatedLog) {
      eventTimeline.push({
        type: 'item_created',
        timestamp: new Date(item.createdAt),
        userName: itemCreatedLog.userName,
        itemType: item.type,
        icon: Plus,
        color: 'text-status-pending',
        label: `${item.type} adicionado`,
      });
    }

    if (['approved', 'inProduction', 'produced', 'delivered'].includes(item.status)) {
      const itemApprovedLog = auditLogMap.get(`${item.id}-approved`);
      if (itemApprovedLog) {
        eventTimeline.push({
          type: 'item_approved',
          timestamp: new Date(item.approvedAt || item.updatedAt),
          userName: itemApprovedLog.userName,
          itemType: item.type,
          icon: FileCheck,
          color: 'text-status-inProgress',
          label: `${item.type} aprovado`,
        });
      }
    }

    if (item.status === 'delivered' && item.deliveredAt) {
      const itemDeliveredLog = auditLogMap.get(`${item.id}-delivered`);
      if (itemDeliveredLog) {
        eventTimeline.push({
          type: 'item_delivered',
          timestamp: new Date(item.deliveredAt),
          userName: itemDeliveredLog.userName,
          itemType: item.type,
          receivedBy: item.receivedBy,
          icon: CheckCircle,
          color: 'text-status-completed',
          label: `${item.type} entregue`,
        });
      }
    }
  });

  // Ordenar por data (mais recente primeiro)
  const sortedEventTimeline = eventTimeline.sort((a, b) => 
    b.timestamp.getTime() - a.timestamp.getTime()
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <Link href="/eventos">
          <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para eventos
          </Button>
        </Link>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="title-event-name">
                {event.name}
              </h1>
              <StatusBadge status={event.status} />
            </div>
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" />
                <span>Início: {new Date(event.startDate).toLocaleDateString('pt-BR')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Truck className="h-3.5 w-3.5" />
                <span>Saída: {new Date(event.truckDepartureDate).toLocaleDateString('pt-BR')}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Dialog open={open} onOpenChange={(isOpen) => {
              if (isOpen) setOpen(true);
              else handleCloseDialog();
            }}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-item">
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Item
                </Button>
              </DialogTrigger>
              <DialogContent className={bulkMode && !editingItem ? "max-w-[95vw] max-h-[90vh] overflow-y-auto" : "sm:max-w-lg max-h-[90vh] overflow-y-auto"}>
                <DialogHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <DialogTitle>
                        {editingItem 
                          ? "Editar Item" 
                          : (bulkMode ? "Entrada Rápida - Múltiplos Itens" : "Adicionar Item ao Evento")
                        }
                      </DialogTitle>
                      <DialogDescription>
                        {editingItem
                          ? "Atualize as informações do item"
                          : (bulkMode ? "Adicione vários itens de uma vez usando a tabela" : "Preencha as informações do item gráfico")
                        }
                      </DialogDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setBulkMode(!bulkMode)}
                      data-testid="button-toggle-mode"
                    >
                      {bulkMode ? (
                        <>
                          <Plus className="h-4 w-4 mr-2" />
                          Modo Simples
                        </>
                      ) : (
                        <>
                          <List className="h-4 w-4 mr-2" />
                          Entrada Rápida
                        </>
                      )}
                    </Button>
                  </div>
                </DialogHeader>
                
                {bulkMode ? (
                  <BulkItemEntry
                    eventId={eventId!}
                    onSubmit={(items) => createBulkItemsMutation.mutate(items)}
                    onCancel={() => {
                      setBulkMode(false);
                      setOpen(false);
                    }}
                    isPending={createBulkItemsMutation.isPending}
                  />
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="type">Tipo de Item</Label>
                    <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })} required>
                      <SelectTrigger id="type" data-testid="select-item-type">
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {itemTypes.map((type) => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantidade</Label>
                    <Input
                      id="quantity"
                      type="number"
                      min="1"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
                      required
                      data-testid="input-quantity"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="area">Área (m)</Label>
                    <Input
                      id="area"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.area}
                      onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                      required
                      data-testid="input-area"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="visual">Visual (m)</Label>
                    <Input
                      id="visual"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.visual}
                      onChange={(e) => setFormData({ ...formData, visual: e.target.value })}
                      required
                      data-testid="input-visual"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="material">Material</Label>
                    <Select value={formData.material} onValueChange={(value) => setFormData({ ...formData, material: value })} required>
                      <SelectTrigger id="material" data-testid="select-material">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {materials.map((mat) => (
                          <SelectItem key={mat} value={mat}>{mat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="finish">Acabamento</Label>
                    <Select value={formData.finish} onValueChange={(value) => setFormData({ ...formData, finish: value })} required>
                      <SelectTrigger id="finish" data-testid="select-finish">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {finishes.map((fin) => (
                          <SelectItem key={fin} value={fin}>{fin}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="observations">Observações</Label>
                    <Textarea
                      id="observations"
                      value={formData.observations}
                      onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                      placeholder="Observações adicionais (opcional)"
                      rows={3}
                      data-testid="textarea-observations"
                    />
                  </div>
                </div>
                {formData.area && formData.visual && formData.quantity && (
                  <div className="p-4 bg-muted/50 rounded-md">
                    <p className="text-sm font-medium">
                      m² Total: {(formData.quantity * parseFloat(formData.area || "0") * parseFloat(formData.visual || "0")).toFixed(2)}
                    </p>
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={handleCloseDialog}>
                    Cancelar
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createItemMutation.isPending || updateItemMutation.isPending} 
                    data-testid="button-submit-item"
                  >
                    {editingItem
                      ? (updateItemMutation.isPending ? "Salvando..." : "Salvar Alterações")
                      : (createItemMutation.isPending ? "Adicionando..." : "Adicionar Item")
                    }
                  </Button>
                </div>
              </form>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Mini-Timeline de Atividades */}
      {sortedEventTimeline.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Atividades Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sortedEventTimeline.slice(0, 5).map((activity, index) => {
                const Icon = activity.icon;
                const timeAgo = formatDistanceToNow(activity.timestamp, {
                  addSuffix: true,
                  locale: ptBR,
                });

                return (
                  <div
                    key={index}
                    className="flex items-start gap-3 pb-3 border-b last:border-0 last:pb-0"
                  >
                    <div className={cn("mt-0.5", activity.color)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{activity.label}</span>
                        {activity.userName && (
                          <span className="text-xs text-muted-foreground">
                            por {activity.userName}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">{timeAgo}</span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground">
                          {activity.timestamp.toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Itens do Evento</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum item adicionado</h3>
              <p className="text-muted-foreground mb-4">Adicione itens ao evento para começar</p>
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Primeiro Item
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium">Tipo</th>
                    <th className="text-left py-3 px-4 font-medium">Qtd</th>
                    <th className="text-left py-3 px-4 font-medium">Área × Visual</th>
                    <th className="text-left py-3 px-4 font-medium">m²</th>
                    <th className="text-left py-3 px-4 font-medium">Material</th>
                    <th className="text-left py-3 px-4 font-medium">Acabamento</th>
                    <th className="text-left py-3 px-4 font-medium">Status</th>
                    {hasPermission("admin") && (
                      <th className="text-left py-3 px-4 font-medium">Ações</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr
                      key={item.id}
                      className={`border-b border-border hover-elevate ${index % 2 === 0 ? 'bg-muted/30' : ''}`}
                      data-testid={`row-item-${item.id}`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium text-sm">{item.type}</div>
                        {item.observations && (
                          <div className="text-xs text-muted-foreground">{item.observations}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm tabular-nums">{item.quantity}</td>
                      <td className="py-3 px-4 text-sm tabular-nums">{item.area} × {item.visual}</td>
                      <td className="py-3 px-4 text-sm font-medium tabular-nums">{item.calculatedM2}</td>
                      <td className="py-3 px-4 text-sm">{item.material}</td>
                      <td className="py-3 px-4 text-sm">{item.finish}</td>
                      <td className="py-3 px-4">
                        <StatusBadge status={item.status} />
                      </td>
                      {hasPermission("admin") && (
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => handleEditItem(item)}
                              data-testid={`button-edit-item-${item.id}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => handleDeleteItem(item.id)}
                              data-testid={`button-delete-item-${item.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deletingItemId} onOpenChange={() => setDeletingItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este item? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingItemId && deleteItemMutation.mutate(deletingItemId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-item"
            >
              {deleteItemMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
