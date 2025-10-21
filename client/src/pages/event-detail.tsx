import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, ArrowLeft, Calendar, Truck, AlertCircle, List, ChevronDown, ChevronUp, MessageSquare, Image as ImageIcon } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { BulkItemEntry } from "@/components/bulk-item-entry";
import { CommentsSection } from "@/components/comments-section";
import { DeliveryPhotoGallery } from "@/components/delivery-photo-gallery";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const itemTypes = ["2x1", "Rolo", "Palco", "Banner", "Faixa", "Adesivo", "Backdrop"];
const materials = ["Lona", "Tecido", "Adesivo", "Vinílico", "Banner"];
const finishes = ["Ilhós", "Soldado", "Bastão", "Sem acabamento"];

export default function EventDetail() {
  const [, params] = useRoute("/eventos/:id");
  const eventId = params?.id;
  const [open, setOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createItemMutation.mutate(formData);
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
              setOpen(isOpen);
              if (!isOpen) setBulkMode(false);
            }}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-item">
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Item
                </Button>
              </DialogTrigger>
              <DialogContent className={bulkMode ? "max-w-[95vw] max-h-[90vh] overflow-y-auto" : "sm:max-w-lg max-h-[90vh] overflow-y-auto"}>
                <DialogHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <DialogTitle>{bulkMode ? "Entrada Rápida - Múltiplos Itens" : "Adicionar Item ao Evento"}</DialogTitle>
                      <DialogDescription>
                        {bulkMode ? "Adicione vários itens de uma vez usando a tabela" : "Preencha as informações do item gráfico"}
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
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createItemMutation.isPending} data-testid="button-submit-item">
                    {createItemMutation.isPending ? "Adicionando..." : "Adicionar Item"}
                  </Button>
                </div>
              </form>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

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
            <div className="space-y-3">
              {items.map((item) => (
                <Collapsible 
                  key={item.id}
                  open={expandedItems[item.id] || false}
                  onOpenChange={(isOpen) => setExpandedItems({ ...expandedItems, [item.id]: isOpen })}
                >
                  <Card>
                    <CollapsibleTrigger asChild>
                      <div className="p-4 cursor-pointer hover-elevate" data-testid={`item-${item.id}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1 grid grid-cols-1 md:grid-cols-6 gap-4">
                            <div>
                              <div className="text-xs text-muted-foreground">Tipo</div>
                              <div className="font-medium">{item.type}</div>
                              {item.observations && (
                                <div className="text-xs text-muted-foreground mt-1">{item.observations}</div>
                              )}
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">Quantidade</div>
                              <div className="font-medium tabular-nums">{item.quantity}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">Área × Visual</div>
                              <div className="font-medium tabular-nums">{item.area} × {item.visual}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">m²</div>
                              <div className="font-medium tabular-nums">{item.calculatedM2}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">Material</div>
                              <div className="font-medium">{item.material}</div>
                              <div className="text-xs text-muted-foreground">{item.finish}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Status</div>
                              <StatusBadge status={item.status} />
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedItems({ ...expandedItems, [item.id]: !expandedItems[item.id] });
                              }}
                            >
                              {expandedItems[item.id] ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t border-border p-4 bg-muted/20">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {/* Comentários */}
                          <div>
                            <div className="flex items-center gap-2 mb-3">
                              <MessageSquare className="h-4 w-4 text-primary" />
                              <h4 className="font-semibold">Comentários</h4>
                            </div>
                            <CommentsSection itemId={item.id} />
                          </div>
                          
                          {/* Galeria de Fotos */}
                          <div>
                            <div className="flex items-center gap-2 mb-3">
                              <ImageIcon className="h-4 w-4 text-primary" />
                              <h4 className="font-semibold">Fotos de Entrega</h4>
                            </div>
                            <DeliveryPhotoGallery itemId={item.id} />
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
