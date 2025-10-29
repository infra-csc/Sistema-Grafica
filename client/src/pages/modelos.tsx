import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Layers, Search, Check, ChevronsUpDown, Pencil, Trash2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";

const itemTypes = ["2x1", "Arena", "Halter", "Palco", "Painel Rosto", "Percurso", "Pórtico", "Prismas", "Qd Fotos", "Rolo", "Stand", "Testeiras", "WindBanner"];
const materials = ["Adesivo", "Lona", "Sanett", "Tecido"];
const finishes = ["Dupla Face", "Ilhós", "Impresso", "Recorte", "Refile"];

export default function Modelos() {
  const { hasPermission } = useAuth();
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [typePopoverOpen, setTypePopoverOpen] = useState(false);
  const [materialPopoverOpen, setMaterialPopoverOpen] = useState(false);
  const [finishPopoverOpen, setFinishPopoverOpen] = useState(false);
  const [customTypeInput, setCustomTypeInput] = useState("");
  const [customMaterialInput, setCustomMaterialInput] = useState("");
  const [customFinishInput, setCustomFinishInput] = useState("");
  const { toast } = useToast();
  const [editingItem, setEditingItem] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    type: "",
    area: "",
    visual: "",
    visualWidth: "",
    visualHeight: "",
    fileWidth: "",
    fileHeight: "",
    material: "",
    finish: "",
    hasVariableMeasurement: false,
  });

  const { data: standardItems = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/standard-items"],
  });

  const createStandardItemMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (editingItem) {
        return await apiRequest("PATCH", `/api/standard-items/${editingItem.id}`, data);
      }
      return await apiRequest("POST", "/api/standard-items", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/standard-items"] });
      setOpen(false);
      setEditingItem(null);
      setFormData({
        name: "",
        type: "",
        area: "",
        visual: "",
        visualWidth: "",
        visualHeight: "",
        fileWidth: "",
        fileHeight: "",
        material: "",
        finish: "",
        hasVariableMeasurement: false,
      });
      toast({
        title: editingItem ? "Modelo atualizado" : "Modelo criado",
        description: editingItem ? "O modelo foi atualizado com sucesso" : "O modelo foi criado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: editingItem ? "Erro ao atualizar modelo" : "Erro ao criar modelo",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteStandardItemMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/standard-items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/standard-items"] });
      setDeleteConfirm(null);
      toast({
        title: "Modelo excluído",
        description: "O modelo foi excluído com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir modelo",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const dataToSubmit: any = {
      ...formData,
      material: formData.material || null,
      finish: formData.finish || null,
      area: formData.area || null,
      visual: formData.visual || null,
    };
    
    createStandardItemMutation.mutate(dataToSubmit);
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      type: item.type,
      area: item.area || "",
      visual: item.visual || "",
      visualWidth: item.visualWidth || "",
      visualHeight: item.visualHeight || "",
      fileWidth: item.fileWidth || "",
      fileHeight: item.fileHeight || "",
      material: item.material || "",
      finish: item.finish || "",
      hasVariableMeasurement: item.hasVariableMeasurement || false,
    });
    setOpen(true);
  };

  const handleDelete = (item: any) => {
    setDeleteConfirm(item);
  };

  const confirmDelete = () => {
    if (deleteConfirm) {
      deleteStandardItemMutation.mutate(deleteConfirm.id);
    }
  };

  const handleCloseDialog = () => {
    setOpen(false);
    setEditingItem(null);
    setFormData({
      name: "",
      type: "",
      area: "",
      visual: "",
      visualWidth: "",
      visualHeight: "",
      fileWidth: "",
      fileHeight: "",
      material: "",
      finish: "",
      hasVariableMeasurement: false,
    });
  };

  // Filtrar modelos por nome
  const filteredItems = standardItems.filter((item) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Modelos de Itens
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie modelos padrão de itens gráficos
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar modelos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-full sm:w-64"
            />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button 
              data-testid="button-new-model"
              onClick={() => {
                setEditingItem(null);
                setFormData({
                  name: "",
                  type: "",
                  area: "",
                  visual: "",
                  visualWidth: "",
                  visualHeight: "",
                  fileWidth: "",
                  fileHeight: "",
                  material: "",
                  finish: "",
                  hasVariableMeasurement: false,
                });
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Novo Modelo
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingItem ? "Editar Modelo" : "Criar Novo Modelo"}</DialogTitle>
              <DialogDescription>
                {editingItem ? "Atualize as informações do modelo" : "Configure um modelo reutilizável de item gráfico"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Modelo</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Banner 2x1 Padrão"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="type">Tipo</Label>
                <Popover open={typePopoverOpen} onOpenChange={setTypePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={typePopoverOpen}
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate">
                        {formData.type || "Selecione ou digite um tipo"}
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
                        <CommandGroup>
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

              <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-md">
                <Checkbox
                  id="hasVariableMeasurement"
                  checked={formData.hasVariableMeasurement}
                  onCheckedChange={(checked) => 
                    setFormData({ 
                      ...formData, 
                      hasVariableMeasurement: checked as boolean,
                      area: checked ? "" : formData.area,
                      visual: checked ? "" : formData.visual,
                    })
                  }
                />
                <Label htmlFor="hasVariableMeasurement" className="cursor-pointer font-normal">
                  Medida variável (preencher por item)
                </Label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="area">Área (m)</Label>
                  <Input
                    id="area"
                    type="number"
                    step="0.01"
                    value={formData.area}
                    onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                    placeholder="2.00"
                    disabled={formData.hasVariableMeasurement}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="visual">Visual (m)</Label>
                  <Input
                    id="visual"
                    type="number"
                    step="0.01"
                    value={formData.visual}
                    onChange={(e) => setFormData({ ...formData, visual: e.target.value })}
                    placeholder="1.00"
                    disabled={formData.hasVariableMeasurement}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Material (opcional)</Label>
                  {formData.material && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setFormData({ ...formData, material: "" })}
                      className="h-auto py-1 px-2 text-xs"
                    >
                      Limpar
                    </Button>
                  )}
                </div>
                <Popover open={materialPopoverOpen} onOpenChange={setMaterialPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={materialPopoverOpen}
                      className="w-full justify-between font-normal"
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

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Acabamento (opcional)</Label>
                  {formData.finish && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setFormData({ ...formData, finish: "" })}
                      className="h-auto py-1 px-2 text-xs"
                    >
                      Limpar
                    </Button>
                  )}
                </div>
                <Popover open={finishPopoverOpen} onOpenChange={setFinishPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={finishPopoverOpen}
                      className="w-full justify-between font-normal"
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

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={handleCloseDialog}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createStandardItemMutation.isPending} data-testid="button-submit-model">
                  {createStandardItemMutation.isPending 
                    ? (editingItem ? "Atualizando..." : "Criando...") 
                    : (editingItem ? "Atualizar Modelo" : "Criar Modelo")
                  }
                </Button>
              </div>
            </form>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : standardItems.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Layers className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum modelo criado</h3>
              <p className="text-muted-foreground mb-4">Crie modelos para reutilizar configurações de itens</p>
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeiro Modelo
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : filteredItems.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum modelo encontrado</h3>
              <p className="text-muted-foreground mb-4">Tente buscar com outro termo</p>
              <Button variant="outline" onClick={() => setSearchTerm("")}>
                Limpar busca
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredItems.map((item) => (
            <Card key={item.id} className="hover-elevate">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-sm truncate">{item.name}</CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Tipo: {item.type}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {item.hasVariableMeasurement && (
                      <Badge variant="secondary" className="text-xs">Variável</Badge>
                    )}
                    {hasPermission("admin") && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleEdit(item)}
                          className="h-7 w-7"
                          data-testid={`button-edit-model-${item.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(item)}
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          data-testid={`button-delete-model-${item.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {!item.hasVariableMeasurement && item.area && item.visual && (
                  <div className="p-2 bg-muted/50 rounded-md">
                    <p className="text-xs font-medium">Medidas Fixas</p>
                    <p className="text-xs text-muted-foreground">
                      {item.area} × {item.visual} m
                    </p>
                  </div>
                )}
                
                {item.material && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                      Material
                    </p>
                    <Badge variant="outline" className="text-xs">
                      {item.material}
                    </Badge>
                  </div>
                )}

                {item.finish && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                      Acabamento
                    </p>
                    <Badge variant="outline" className="text-xs">
                      {item.finish}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o modelo <strong>{deleteConfirm?.name}</strong>?
              <br /><br />
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteStandardItemMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-model"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
