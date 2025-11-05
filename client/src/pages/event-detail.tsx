import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, ArrowLeft, Calendar, Truck, AlertCircle, List, Package, Pencil, Trash2, Check, ChevronsUpDown, Building2 } from "lucide-react";
import { Fragment, useState, useEffect } from "react";
import type { Sponsor } from "@shared/schema";
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
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { BulkItemEntry } from "@/components/bulk-item-entry";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import { calculateM2 } from "@/lib/calculateM2";

const itemTypes = ["2x1", "Arena", "Halter", "Palco", "Painel Rosto", "Percurso", "Pórtico", "Prismas", "Qd Fotos", "Rolo", "Stand", "Testeiras", "WindBanner"];
const materials = ["Adesivo", "Lona", "Sanett", "Tecido"];
const finishes = ["Dupla Face", "Ilhós", "Impresso", "Recorte", "Refile"];

export default function EventDetail() {
  const { hasPermission } = useAuth();
  const [, params] = useRoute("/eventos/:id");
  const eventId = params?.id;
  const [open, setOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState(true);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [typePopoverOpen, setTypePopoverOpen] = useState(false);
  const [materialPopoverOpen, setMaterialPopoverOpen] = useState(false);
  const [finishPopoverOpen, setFinishPopoverOpen] = useState(false);
  const [customTypeInput, setCustomTypeInput] = useState("");
  const [customMaterialInput, setCustomMaterialInput] = useState("");
  const [customFinishInput, setCustomFinishInput] = useState("");
  const [sponsorsDialogOpen, setSponsorsDialogOpen] = useState(false);
  const [selectedSponsorIds, setSelectedSponsorIds] = useState<string[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [bulkSponsorDialogOpen, setBulkSponsorDialogOpen] = useState(false);
  const [bulkSponsorId, setBulkSponsorId] = useState<string>("");
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    type: "",
    description: "",
    quantity: 1,
    visualWidth: "",
    visualHeight: "",
    fileWidth: "",
    fileHeight: "",
    material: "",
    finish: "",
    measurement: "",
    observations: "",
    sponsorId: "",
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

  // Buscar patrocinadores vinculados ao evento
  const { data: eventSponsors = [] } = useQuery<any[]>({
    queryKey: ["/api/events", eventId, "sponsors"],
    enabled: !!eventId,
  });

  // Buscar todos os patrocinadores para obter os detalhes
  const { data: allSponsors = [] } = useQuery<Sponsor[]>({
    queryKey: ["/api/sponsors"],
  });

  // Filtrar apenas os patrocinadores vinculados ao evento
  const sponsors = allSponsors.filter(sponsor => 
    eventSponsors.some(es => es.sponsorId === sponsor.id)
  );

  const createItemMutation = useMutation({
    mutationFn: async (data: any) => {
      const fileWidth = parseFloat(data.fileWidth);
      const fileHeight = parseFloat(data.fileHeight);
      
      const calculatedM2 = calculateM2(
        data.quantity,
        fileWidth,
        fileHeight
      ).toFixed(2);
      
      const itemData: any = {
        ...data,
        eventId,
        area: parseFloat(data.visualWidth),  // Manter area para compatibilidade com backend
        visual: parseFloat(data.visualHeight),  // Manter visual para compatibilidade com backend
        calculatedM2,
        measurement: data.measurement || `${fileWidth} × ${fileHeight}`,
      };
      
      // Remover sponsorId se estiver vazio, enviar null caso contrário
      if (!data.sponsorId) {
        delete itemData.sponsorId;
      }
      
      return await apiRequest("POST", "/api/items", itemData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      setOpen(false);
      setFormData({
        type: "",
        description: "",
        quantity: 1,
        visualWidth: "",
        visualHeight: "",
        fileWidth: "",
        fileHeight: "",
        material: "",
        finish: "",
        measurement: "",
        observations: "",
        sponsorId: "",
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
      const fileWidth = parseFloat(data.fileWidth);
      const fileHeight = parseFloat(data.fileHeight);
      
      const calculatedM2 = calculateM2(
        data.quantity,
        fileWidth,
        fileHeight
      ).toFixed(2);
      
      const itemData: any = {
        ...data,
        area: parseFloat(data.visualWidth),  // Manter area para compatibilidade com backend
        visual: parseFloat(data.visualHeight),  // Manter visual para compatibilidade com backend
        calculatedM2,
      };
      
      // Remover sponsorId se estiver vazio
      if (!data.sponsorId) {
        delete itemData.sponsorId;
      }
      
      return await apiRequest("PATCH", `/api/items/${id}`, itemData);
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

  const manageSponsorsMutation = useMutation({
    mutationFn: async (sponsorIds: string[]) => {
      // Buscar patrocinadores atuais do evento
      const currentSponsorsRes = await apiRequest("GET", `/api/events/${eventId}/sponsors`);
      const currentSponsors = await currentSponsorsRes.json();
      const currentSponsorIds = currentSponsors.map((es: any) => es.sponsorId);
      
      // Calcular operações necessárias
      const toRemove = currentSponsorIds.filter((id: string) => !sponsorIds.includes(id));
      const toAdd = sponsorIds.filter((id: string) => !currentSponsorIds.includes(id));
      
      // Executar todas as operações em paralelo
      const operations = [
        ...toRemove.map((sponsorId: string) =>
          apiRequest("DELETE", `/api/events/${eventId}/sponsors/${sponsorId}`)
        ),
        ...toAdd.map((sponsorId: string) =>
          apiRequest("POST", `/api/events/${eventId}/sponsors`, { sponsorId })
        ),
      ];
      
      await Promise.all(operations);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "sponsors"] });
      setSponsorsDialogOpen(false);
      toast({
        title: "Patrocinadores atualizados",
        description: "Os patrocinadores do evento foram atualizados com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar patrocinadores",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const bulkUpdateSponsorMutation = useMutation({
    mutationFn: async ({ itemIds, sponsorId }: { itemIds: string[], sponsorId: string }) => {
      const operations = itemIds.map((id) =>
        apiRequest("PATCH", `/api/items/${id}`, { 
          sponsorId: sponsorId === "none" ? null : sponsorId 
        })
      );
      await Promise.all(operations);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      setBulkSponsorDialogOpen(false);
      setSelectedItemIds([]);
      setBulkSponsorId("");
      toast({
        title: "Patrocinador atribuído",
        description: `Patrocinador atribuído a ${selectedItemIds.length} ${selectedItemIds.length === 1 ? 'item' : 'itens'} com sucesso`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atribuir patrocinador",
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
    setFormData({
      type: item.type || "",
      description: item.description || "",
      quantity: item.quantity || 1,
      visualWidth: item.visualWidth || item.area || "",
      visualHeight: item.visualHeight || item.visual || "",
      fileWidth: item.fileWidth || "",
      fileHeight: item.fileHeight || "",
      material: item.material || "",
      finish: item.finish || "",
      measurement: item.measurement || "",
      observations: item.observations || "",
      sponsorId: item.sponsorId || "",
    });
    setEditDialogOpen(true);
  };

  const handleDeleteItem = (id: string) => {
    setDeletingItemId(id);
  };

  const handleCloseDialog = () => {
    setEditingItem(null);
    setBulkMode(true);
    setFormData({
      type: "",
      description: "",
      quantity: 1,
      visualWidth: "",
      visualHeight: "",
      fileWidth: "",
      fileHeight: "",
      material: "",
      finish: "",
      measurement: "",
      observations: "",
      sponsorId: "",
    });
    setOpen(false);
  };

  const handleOpenSponsorsDialog = () => {
    // Inicializar com os patrocinadores atuais do evento
    const currentSponsorIds = sponsors.map(s => s.id);
    setSelectedSponsorIds(currentSponsorIds);
    setSponsorsDialogOpen(true);
  };

  const handleSaveSponsors = () => {
    manageSponsorsMutation.mutate(selectedSponsorIds);
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
            <Button 
              onClick={() => {
                setEditingItem(null);
                setBulkMode(true);
                setOpen(true);
              }}
              data-testid="button-add-item"
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Item
            </Button>
            
            <Dialog open={open} onOpenChange={(isOpen) => {
              if (!isOpen) {
                handleCloseDialog();
              } else {
                setOpen(true);
              }
            }}>
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
                    {!editingItem && (
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
                    )}
                  </div>
                </DialogHeader>
                
                {bulkMode && !editingItem ? (
                  <BulkItemEntry
                    eventId={eventId!}
                    standardItems={standardItems}
                    sponsors={sponsors}
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
                          <CommandInput 
                            placeholder="Buscar ou adicionar tipo..." 
                            value={customTypeInput}
                            onValueChange={setCustomTypeInput}
                          />
                          <CommandList>
                            <CommandEmpty>
                              <div className="p-2 space-y-2">
                                <p className="text-sm text-muted-foreground">Nenhum tipo encontrado.</p>
                                {customTypeInput && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="w-full"
                                    onClick={() => {
                                      setFormData({ ...formData, type: customTypeInput });
                                      setCustomTypeInput("");
                                      setTypePopoverOpen(false);
                                    }}
                                  >
                                    <Plus className="h-3 w-3 mr-1" />
                                    Adicionar "{customTypeInput}"
                                  </Button>
                                )}
                              </div>
                            </CommandEmpty>
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
                                        visualWidth: item.visualWidth ? String(item.visualWidth) : (item.area ? String(item.area) : ""),
                                        visualHeight: item.visualHeight ? String(item.visualHeight) : (item.visual ? String(item.visual) : ""),
                                        fileWidth: item.fileWidth ? String(item.fileWidth) : "",
                                        fileHeight: item.fileHeight ? String(item.fileHeight) : "",
                                        material: item.material || "",
                                        finish: item.finish || "",
                                        measurement: (item.visualWidth && item.visualHeight) ? `${item.visualWidth} × ${item.visualHeight}` : (item.area && item.visual ? `${item.area} × ${item.visual}` : ""),
                                      });
                                      setCustomTypeInput("");
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
                                    setCustomTypeInput("");
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
                    <Label htmlFor="visualWidth">Largura Visual (m)*</Label>
                    <Input
                      id="visualWidth"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.visualWidth}
                      onChange={(e) => setFormData({ ...formData, visualWidth: e.target.value })}
                      placeholder="Ex: 2.00"
                      required
                      data-testid="input-visual-width"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="visualHeight">Altura Visual (m)*</Label>
                    <Input
                      id="visualHeight"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.visualHeight}
                      onChange={(e) => setFormData({ ...formData, visualHeight: e.target.value })}
                      placeholder="Ex: 1.00"
                      required
                      data-testid="input-visual-height"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fileWidth">Largura Arquivo (m)*</Label>
                    <Input
                      id="fileWidth"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.fileWidth}
                      onChange={(e) => setFormData({ ...formData, fileWidth: e.target.value })}
                      placeholder="Ex: 1.90"
                      required
                      data-testid="input-file-width"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fileHeight">Altura Arquivo (m)*</Label>
                    <Input
                      id="fileHeight"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.fileHeight}
                      onChange={(e) => setFormData({ ...formData, fileHeight: e.target.value })}
                      placeholder="Ex: 0.90"
                      required
                      data-testid="input-file-height"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="material">Material</Label>
                    <Popover open={materialPopoverOpen} onOpenChange={setMaterialPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={materialPopoverOpen}
                          className="w-full justify-between font-normal"
                          data-testid="select-material"
                        >
                          <span className="truncate">
                            {formData.material || "Selecione ou digite um material"}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" align="start">
                        <Command>
                          <CommandInput 
                            placeholder="Buscar ou adicionar material..." 
                            value={customMaterialInput}
                            onValueChange={setCustomMaterialInput}
                          />
                          <CommandList>
                            <CommandEmpty>
                              <div className="p-2 space-y-2">
                                <p className="text-sm text-muted-foreground">Nenhum material encontrado.</p>
                                {customMaterialInput && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="w-full"
                                    onClick={() => {
                                      setFormData({ ...formData, material: customMaterialInput });
                                      setCustomMaterialInput("");
                                      setMaterialPopoverOpen(false);
                                    }}
                                  >
                                    <Plus className="h-3 w-3 mr-1" />
                                    Adicionar "{customMaterialInput}"
                                  </Button>
                                )}
                              </div>
                            </CommandEmpty>
                            <CommandGroup>
                              {materials.map((material) => (
                                <CommandItem
                                  key={material}
                                  value={material}
                                  onSelect={() => {
                                    setFormData({ ...formData, material });
                                    setCustomMaterialInput("");
                                    setMaterialPopoverOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      formData.material === material ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {material}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="finish">Acabamento</Label>
                    <Popover open={finishPopoverOpen} onOpenChange={setFinishPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={finishPopoverOpen}
                          className="w-full justify-between font-normal"
                          data-testid="select-finish"
                        >
                          <span className="truncate">
                            {formData.finish || "Selecione ou digite um acabamento"}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" align="start">
                        <Command>
                          <CommandInput 
                            placeholder="Buscar ou adicionar acabamento..." 
                            value={customFinishInput}
                            onValueChange={setCustomFinishInput}
                          />
                          <CommandList>
                            <CommandEmpty>
                              <div className="p-2 space-y-2">
                                <p className="text-sm text-muted-foreground">Nenhum acabamento encontrado.</p>
                                {customFinishInput && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="w-full"
                                    onClick={() => {
                                      setFormData({ ...formData, finish: customFinishInput });
                                      setCustomFinishInput("");
                                      setFinishPopoverOpen(false);
                                    }}
                                  >
                                    <Plus className="h-3 w-3 mr-1" />
                                    Adicionar "{customFinishInput}"
                                  </Button>
                                )}
                              </div>
                            </CommandEmpty>
                            <CommandGroup>
                              {finishes.map((finish) => (
                                <CommandItem
                                  key={finish}
                                  value={finish}
                                  onSelect={() => {
                                    setFormData({ ...formData, finish });
                                    setCustomFinishInput("");
                                    setFinishPopoverOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      formData.finish === finish ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {finish}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
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

                  {/* Seleção de Patrocinador */}
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="sponsorId" className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Patrocinador (opcional)
                    </Label>
                    <Select
                      value={formData.sponsorId}
                      onValueChange={(value) => setFormData({ ...formData, sponsorId: value })}
                    >
                      <SelectTrigger data-testid="select-sponsor">
                        <SelectValue placeholder="Selecione o patrocinador" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Nenhum</SelectItem>
                        {sponsors.map((sponsor) => (
                          <SelectItem key={sponsor.id} value={sponsor.id}>
                            {sponsor.name}
                            {sponsor.company && ` (${sponsor.company})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {sponsors.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Nenhum patrocinador cadastrado. <Link href="/patrocinadores" className="text-primary hover:underline">Cadastre agora</Link>
                      </p>
                    )}
                  </div>
                </div>
                {formData.fileWidth && formData.fileHeight && formData.quantity && (
                  <div className="p-4 bg-muted/50 rounded-md">
                    <p className="text-sm font-medium">
                      m² Total: {(formData.quantity * parseFloat(formData.fileWidth || "0") * parseFloat(formData.fileHeight || "0")).toFixed(2)}
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

      {/* Card de Patrocinadores */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Patrocinadores do Evento
            </CardTitle>
            <Dialog open={sponsorsDialogOpen} onOpenChange={setSponsorsDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleOpenSponsorsDialog} data-testid="button-manage-sponsors">
                  <Plus className="h-4 w-4 mr-2" />
                  Gerenciar Patrocinadores
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Gerenciar Patrocinadores do Evento</DialogTitle>
                  <DialogDescription>
                    Selecione os patrocinadores associados a este evento
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {allSponsors.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhum patrocinador cadastrado. <Link href="/patrocinadores" className="text-primary hover:underline">Cadastre agora</Link>
                    </p>
                  ) : (
                    <div className="border rounded-md p-3 space-y-2 max-h-60 overflow-y-auto">
                      {allSponsors.map((sponsor) => (
                        <div key={sponsor.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`event-sponsor-${sponsor.id}`}
                            checked={selectedSponsorIds.includes(sponsor.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedSponsorIds([...selectedSponsorIds, sponsor.id]);
                              } else {
                                setSelectedSponsorIds(selectedSponsorIds.filter(id => id !== sponsor.id));
                              }
                            }}
                            data-testid={`checkbox-event-sponsor-${sponsor.id}`}
                          />
                          <label
                            htmlFor={`event-sponsor-${sponsor.id}`}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                          >
                            {sponsor.name}
                            {sponsor.company && <span className="text-muted-foreground ml-1">({sponsor.company})</span>}
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" onClick={() => setSponsorsDialogOpen(false)} data-testid="button-cancel-sponsors">
                      Cancelar
                    </Button>
                    <Button 
                      type="button"
                      onClick={handleSaveSponsors}
                      disabled={manageSponsorsMutation.isPending}
                      data-testid="button-save-sponsors"
                    >
                      {manageSponsorsMutation.isPending ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {sponsors.length === 0 ? (
            <div className="text-center py-8">
              <Building2 className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-sm text-muted-foreground">Nenhum patrocinador vinculado a este evento</p>
              <p className="text-xs text-muted-foreground mt-1">Clique em "Gerenciar Patrocinadores" para adicionar</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sponsors.map((sponsor) => (
                <Badge key={sponsor.id} variant="secondary" className="px-3 py-1.5 text-sm" data-testid={`badge-sponsor-${sponsor.id}`}>
                  <Building2 className="h-3 w-3 mr-1.5" />
                  {sponsor.name}
                  {sponsor.company && <span className="ml-1 text-muted-foreground">({sponsor.company})</span>}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
              <Button onClick={() => {
                setEditingItem(null);
                setBulkMode(true);
                setOpen(true);
              }}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Primeiro Item
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left py-3 px-2 w-10">
                      <Checkbox
                        checked={selectedItemIds.length === items.length && items.length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedItemIds(items.map(item => item.id));
                          } else {
                            setSelectedItemIds([]);
                          }
                        }}
                        data-testid="checkbox-select-all-items"
                      />
                    </th>
                    <th className="text-left py-3 px-4 font-medium">Descrição</th>
                    <th className="text-left py-3 px-4 font-medium w-20">Qtd</th>
                    <th className="text-left py-3 px-4 font-medium">Dimensões</th>
                    <th className="text-left py-3 px-4 font-medium w-16">m²</th>
                    <th className="text-left py-3 px-4 font-medium">Material</th>
                    <th className="text-left py-3 px-4 font-medium">Acabamento</th>
                    <th className="text-left py-3 px-4 font-medium">Patrocinador</th>
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
                            <td colSpan={hasPermission("admin") ? 10 : 9} className="py-2 px-4">
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
                          <td className="py-2 px-2">
                            <Checkbox
                              checked={selectedItemIds.includes(item.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedItemIds([...selectedItemIds, item.id]);
                                } else {
                                  setSelectedItemIds(selectedItemIds.filter(id => id !== item.id));
                                }
                              }}
                              data-testid={`checkbox-item-${item.id}`}
                            />
                          </td>
                          <td className="py-2 px-3">
                            {item.description ? (
                              <div className="text-xs text-foreground truncate max-w-xs">{item.description}</div>
                            ) : (
                              <div className="text-xs text-muted-foreground">—</div>
                            )}
                            {item.observations && (
                              <div className="text-xs text-muted-foreground italic truncate max-w-xs">{item.observations}</div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-sm tabular-nums text-center">{item.quantity}</td>
                          <td className="py-2 px-2 text-xs">
                            {(item.visualWidth || item.visualHeight) && (
                              <div className="whitespace-nowrap tabular-nums space-y-0.5">
                                <div>
                                  <span className="text-muted-foreground font-medium">V:</span> {item.visualWidth || "—"}×{item.visualHeight || "—"}
                                </div>
                              </div>
                            )}
                            {(item.fileWidth || item.fileHeight) && (
                              <div className="whitespace-nowrap tabular-nums text-muted-foreground">
                                <span className="font-medium">A:</span> {item.fileWidth || "—"}×{item.fileHeight || "—"}
                              </div>
                            )}
                            {!item.visualWidth && !item.visualHeight && !item.fileWidth && !item.fileHeight && (
                              <div className="text-muted-foreground">—</div>
                            )}
                          </td>
                          <td className="py-2 px-2 text-sm font-medium tabular-nums text-center">{item.calculatedM2}</td>
                          <td className="py-2 px-3 text-sm">{item.material}</td>
                          <td className="py-2 px-3 text-sm">{item.finish}</td>
                          <td className="py-2 px-3 text-sm">
                            {item.sponsorId ? (
                              <div className="flex items-center gap-1">
                                <Building2 className="h-3 w-3 text-muted-foreground" />
                                <span className="truncate max-w-[120px]">
                                  {allSponsors.find(s => s.id === item.sponsorId)?.name || "—"}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <StatusBadge status={item.status} />
                          </td>
                          {hasPermission("admin") && (
                            <td className="py-2 px-2">
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

      {/* Botão flutuante para atribuir patrocinador em lote */}
      {selectedItemIds.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-card border-2 border-primary shadow-lg rounded-lg px-6 py-3 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="bg-primary/10 rounded-full h-8 w-8 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">{selectedItemIds.length}</span>
              </div>
              <span className="text-sm font-medium">
                {selectedItemIds.length === 1 ? 'item selecionado' : 'itens selecionados'}
              </span>
            </div>
            <div className="h-6 w-px bg-border"></div>
            <Button
              onClick={() => setBulkSponsorDialogOpen(true)}
              size="sm"
              data-testid="button-bulk-assign-sponsor"
            >
              <Building2 className="h-4 w-4 mr-2" />
              Atribuir Patrocinador
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedItemIds([])}
              data-testid="button-clear-selection"
            >
              Limpar
            </Button>
          </div>
        </div>
      )}

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

      {/* Dialog separado para editar item */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Item</DialogTitle>
            <DialogDescription>Atualize as informações do item</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (editingItem) {
              updateItemMutation.mutate({ id: editingItem.id, data: formData });
            }
          }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Tipo de Item</Label>
                <Input
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  placeholder="Digite o tipo"
                  data-testid="input-edit-type"
                />
              </div>
              
              <div className="col-span-2 space-y-2">
                <Label>Descrição</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descrição opcional"
                  data-testid="input-edit-description"
                />
              </div>

              <div className="space-y-2">
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                  data-testid="input-edit-quantity"
                />
              </div>

              <div className="space-y-2">
                <Label>m² Calculado</Label>
                <Input
                  value={calculateM2(formData.quantity, parseFloat(formData.fileWidth) || 0, parseFloat(formData.fileHeight) || 0).toFixed(2)}
                  disabled
                  className="bg-muted"
                />
              </div>

              <div className="col-span-2 grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Visual Largura (m)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.visualWidth}
                    onChange={(e) => setFormData({ ...formData, visualWidth: e.target.value })}
                    data-testid="input-edit-visual-width"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Visual Altura (m)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.visualHeight}
                    onChange={(e) => setFormData({ ...formData, visualHeight: e.target.value })}
                    data-testid="input-edit-visual-height"
                  />
                </div>
              </div>

              <div className="col-span-2 grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Arquivo Largura (m)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.fileWidth}
                    onChange={(e) => setFormData({ ...formData, fileWidth: e.target.value })}
                    data-testid="input-edit-file-width"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Arquivo Altura (m)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.fileHeight}
                    onChange={(e) => setFormData({ ...formData, fileHeight: e.target.value })}
                    data-testid="input-edit-file-height"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Material</Label>
                <Input
                  value={formData.material}
                  onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                  placeholder="Material"
                  data-testid="input-edit-material"
                />
              </div>

              <div className="space-y-2">
                <Label>Acabamento</Label>
                <Input
                  value={formData.finish}
                  onChange={(e) => setFormData({ ...formData, finish: e.target.value })}
                  placeholder="Acabamento"
                  data-testid="input-edit-finish"
                />
              </div>

              <div className="col-span-2 space-y-2">
                <Label>Patrocinador</Label>
                <Select 
                  value={formData.sponsorId || "none"} 
                  onValueChange={(value) => setFormData({ ...formData, sponsorId: value === "none" ? "" : value })}
                >
                  <SelectTrigger data-testid="select-edit-sponsor">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {sponsors.map(sponsor => (
                      <SelectItem key={sponsor.id} value={sponsor.id}>
                        {sponsor.name}
                        {sponsor.company && ` (${sponsor.company})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2 space-y-2">
                <Label>Observações</Label>
                <Textarea
                  value={formData.observations}
                  onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                  placeholder="Observações adicionais"
                  className="min-h-[80px]"
                  data-testid="textarea-edit-observations"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditDialogOpen(false);
                  setEditingItem(null);
                }}
                data-testid="button-cancel-edit"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={updateItemMutation.isPending}
                data-testid="button-save-edit"
              >
                {updateItemMutation.isPending ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog para atribuir patrocinador em lote */}
      <Dialog open={bulkSponsorDialogOpen} onOpenChange={setBulkSponsorDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Atribuir Patrocinador em Lote</DialogTitle>
            <DialogDescription>
              Selecione um patrocinador para atribuir aos {selectedItemIds.length} {selectedItemIds.length === 1 ? 'item selecionado' : 'itens selecionados'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Lista de itens selecionados */}
            <div className="rounded-md border p-3 max-h-[200px] overflow-y-auto">
              <div className="text-xs font-medium text-muted-foreground mb-2">Itens que serão atualizados:</div>
              <div className="space-y-1">
                {items
                  .filter(item => selectedItemIds.includes(item.id))
                  .map(item => (
                    <div key={item.id} className="text-sm flex items-center gap-2 py-1">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary"></div>
                      <span className="font-medium">{item.type}</span>
                      {item.description && (
                        <span className="text-muted-foreground">- {item.description}</span>
                      )}
                    </div>
                  ))}
              </div>
            </div>

            {/* Seletor de patrocinador */}
            <div className="space-y-2">
              <Label>Patrocinador</Label>
              <Select 
                value={bulkSponsorId || "none"} 
                onValueChange={setBulkSponsorId}
              >
                <SelectTrigger data-testid="select-bulk-sponsor">
                  <SelectValue placeholder="Selecione um patrocinador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Remover Patrocinador</SelectItem>
                  {sponsors.map(sponsor => (
                    <SelectItem key={sponsor.id} value={sponsor.id}>
                      {sponsor.name}
                      {sponsor.company && ` (${sponsor.company})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Botões de ação */}
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setBulkSponsorDialogOpen(false);
                  setBulkSponsorId("");
                }}
                data-testid="button-cancel-bulk-sponsor"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  if (bulkSponsorId) {
                    bulkUpdateSponsorMutation.mutate({
                      itemIds: selectedItemIds,
                      sponsorId: bulkSponsorId
                    });
                  }
                }}
                disabled={!bulkSponsorId || bulkUpdateSponsorMutation.isPending}
                data-testid="button-confirm-bulk-sponsor"
              >
                {bulkUpdateSponsorMutation.isPending ? "Atribuindo..." : "Atribuir Patrocinador"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
