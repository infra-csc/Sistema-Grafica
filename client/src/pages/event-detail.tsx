import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, ArrowLeft, Calendar, Truck, AlertCircle, List, Package, Pencil, Trash2, Check, ChevronsUpDown } from "lucide-react";
import { Fragment, useState } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { BulkItemEntry } from "@/components/bulk-item-entry";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

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
  const [typePopoverOpen, setTypePopoverOpen] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    type: "",
    description: "",
    quantity: 1,
    area: "",
    visual: "",
    visualWidth: "",
    visualHeight: "",
    fileWidth: "",
    fileHeight: "",
    material: "",
    finish: "",
    measurement: "",
    observations: "",
  });

  const { data: event, isLoading: loadingEvent } = useQuery<any>({
    queryKey: ["/api/events", eventId],
    enabled: !!eventId,
  });

  const { data: rawItems = [], isLoading: loadingItems } = useQuery<any[]>({
    queryKey: ["/api/items", eventId],
    enabled: !!eventId,
  });

  // Ordenar itens por tipo
  const items = [...rawItems].sort((a, b) => a.type.localeCompare(b.type));

  const { data: standardItems = [] } = useQuery<any[]>({
    queryKey: ["/api/standard-items"],
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
        description: "",
        quantity: 1,
        area: "",
        visual: "",
        visualWidth: "",
        visualHeight: "",
        fileWidth: "",
        fileHeight: "",
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
      description: item.description || "",
      quantity: item.quantity || 1,
      area: item.area || "",
      visual: item.visual || "",
      visualWidth: item.visualWidth || "",
      visualHeight: item.visualHeight || "",
      fileWidth: item.fileWidth || "",
      fileHeight: item.fileHeight || "",
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
      description: "",
      quantity: 1,
      area: "",
      visual: "",
      visualWidth: "",
      visualHeight: "",
      fileWidth: "",
      fileHeight: "",
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
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="title-event-name">
                {event.name}
              </h1>
            </div>
            <div className="mb-3">
              <span className="text-xs text-muted-foreground/70">
                Criado em {new Date(event.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </span>
            </div>
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" />
                <span>Início: {new Date(event.startDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
              </div>
              <div className="flex items-center gap-2">
                <Truck className="h-3.5 w-3.5" />
                <span>Saída: {new Date(event.truckDepartureDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às {new Date(event.truckDepartureDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
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
                    standardItems={standardItems}
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
                    <Popover open={typePopoverOpen} onOpenChange={setTypePopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={typePopoverOpen}
                          className="w-full justify-between font-normal"
                          data-testid="select-item-type"
                        >
                          <span className="truncate">
                            {formData.type || "Selecione o tipo"}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Buscar tipo..." />
                          <CommandList>
                            <CommandEmpty>Nenhum tipo encontrado.</CommandEmpty>
                            {standardItems.length > 0 && (
                              <CommandGroup heading="Modelos">
                                {standardItems.map((item: any) => (
                                  <CommandItem
                                    key={item.id}
                                    value={item.name}
                                    onSelect={() => {
                                      setFormData({
                                        ...formData,
                                        type: item.name,
                                        area: item.area ? String(item.area) : "",
                                        visual: item.visual ? String(item.visual) : "",
                                        material: item.material || "",
                                        finish: item.finish || "",
                                        measurement: item.area && item.visual ? `${item.area} × ${item.visual}` : "",
                                      });
                                      setTypePopoverOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        formData.type === item.name ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {item.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            )}
                            <CommandGroup heading="Outros Tipos">
                              {itemTypes.map((type) => (
                                <CommandItem
                                  key={type}
                                  value={type}
                                  onSelect={() => {
                                    setFormData({ ...formData, type });
                                    setTypePopoverOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      formData.type === type ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {type}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="description">Descrição (opcional)</Label>
                    <Input
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Descrição personalizada do item"
                      data-testid="input-description"
                    />
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
                    <Label htmlFor="visualWidth">Largura Visual (m)</Label>
                    <Input
                      id="visualWidth"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.visualWidth}
                      onChange={(e) => setFormData({ ...formData, visualWidth: e.target.value })}
                      placeholder="Ex: 2.00"
                      data-testid="input-visual-width"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="visualHeight">Altura Visual (m)</Label>
                    <Input
                      id="visualHeight"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.visualHeight}
                      onChange={(e) => setFormData({ ...formData, visualHeight: e.target.value })}
                      placeholder="Ex: 1.00"
                      data-testid="input-visual-height"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fileWidth">Largura Arquivo (px)</Label>
                    <Input
                      id="fileWidth"
                      type="number"
                      min="0"
                      value={formData.fileWidth}
                      onChange={(e) => setFormData({ ...formData, fileWidth: e.target.value })}
                      placeholder="Ex: 1920"
                      data-testid="input-file-width"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fileHeight">Altura Arquivo (px)</Label>
                    <Input
                      id="fileHeight"
                      type="number"
                      min="0"
                      value={formData.fileHeight}
                      onChange={(e) => setFormData({ ...formData, fileHeight: e.target.value })}
                      placeholder="Ex: 1080"
                      data-testid="input-file-height"
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
                    <th className="text-left py-3 px-4 font-medium">Descrição</th>
                    <th className="text-left py-3 px-4 font-medium w-20">Qtd</th>
                    <th className="text-left py-3 px-4 font-medium">Área × Visual</th>
                    <th className="text-left py-3 px-4 font-medium">Dimensões</th>
                    <th className="text-left py-3 px-4 font-medium w-16">m²</th>
                    <th className="text-left py-3 px-4 font-medium">Material</th>
                    <th className="text-left py-3 px-4 font-medium">Acabamento</th>
                    <th className="text-left py-3 px-4 font-medium w-24">Status</th>
                    {hasPermission("admin") && (
                      <th className="text-left py-3 px-4 font-medium w-32">Ações</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => {
                    const prevItem = index > 0 ? items[index - 1] : null;
                    const showTypeHeader = !prevItem || prevItem.type !== item.type;
                    
                    return (
                      <Fragment key={item.id}>
                        {showTypeHeader && (
                          <tr key={`group-${item.type}`} className="bg-primary/5 border-y-2 border-primary/20">
                            <td colSpan={hasPermission("admin") ? 9 : 8} className="py-2 px-4">
                              <div className="flex items-center gap-3">
                                <div className="h-5 w-1 bg-primary rounded-full"></div>
                                <div className="text-sm font-bold text-foreground">
                                  {item.type}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        <tr
                          key={item.id}
                          className="border-b border-border hover-elevate"
                          data-testid={`row-item-${item.id}`}
                        >
                          <td className="py-3 px-4">
                            {item.description ? (
                              <div className="text-xs text-foreground truncate max-w-xs">{item.description}</div>
                            ) : (
                              <div className="text-xs text-muted-foreground">—</div>
                            )}
                            {item.observations && (
                              <div className="text-xs text-muted-foreground italic truncate max-w-xs">{item.observations}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm tabular-nums text-center">{item.quantity}</td>
                          <td className="py-3 px-4 text-sm text-muted-foreground whitespace-nowrap">{item.area} × {item.visual}</td>
                          <td className="py-3 px-4 text-xs text-muted-foreground">
                            {(item.visualWidth || item.visualHeight) && (
                              <div className="whitespace-nowrap">
                                Visual: {item.visualWidth || "—"} × {item.visualHeight || "—"}m
                              </div>
                            )}
                            {(item.fileWidth || item.fileHeight) && (
                              <div className="whitespace-nowrap">
                                Arquivo: {item.fileWidth || "—"} × {item.fileHeight || "—"}px
                              </div>
                            )}
                            {!item.visualWidth && !item.visualHeight && !item.fileWidth && !item.fileHeight && (
                              <div className="text-muted-foreground/50">—</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm font-medium tabular-nums text-center">{item.calculatedM2}</td>
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
                      </Fragment>
                    );
                  })}
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
