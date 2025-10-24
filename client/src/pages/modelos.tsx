import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Layers, Search, Check, ChevronsUpDown } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const itemTypes = ["2x1", "Arena", "Halter", "Palco", "Painel Rosto", "Percurso", "Pórtico", "Prismas", "Qd Fotos", "Rolo", "Stand", "Testeiras", "WindBanner"];
const materials = ["Adesivo", "Lona", "Sanett", "Tecido"];
const finishes = ["Dupla Face", "Ilhós", "Impresso", "Recorte", "Refile"];

export default function Modelos() {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [typePopoverOpen, setTypePopoverOpen] = useState(false);
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    type: "",
    area: "",
    visual: "",
    material: "",
    finish: "",
    hasVariableMeasurement: false,
  });

  const { data: standardItems = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/standard-items"],
  });

  const createStandardItemMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return await apiRequest("POST", "/api/standard-items", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/standard-items"] });
      setOpen(false);
      setFormData({
        name: "",
        type: "",
        area: "",
        visual: "",
        material: "",
        finish: "",
        hasVariableMeasurement: false,
      });
      toast({
        title: "Modelo criado",
        description: "O modelo foi criado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar modelo",
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
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Modelo
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Criar Novo Modelo</DialogTitle>
              <DialogDescription>
                Configure um modelo reutilizável de item gráfico
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
                        <CommandGroup>
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
                <Select
                  value={formData.material}
                  onValueChange={(value) => setFormData({ ...formData, material: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o material" />
                  </SelectTrigger>
                  <SelectContent>
                    {materials.map((material) => (
                      <SelectItem key={material} value={material}>
                        {material}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <Select
                  value={formData.finish}
                  onValueChange={(value) => setFormData({ ...formData, finish: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o acabamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {finishes.map((finish) => (
                      <SelectItem key={finish} value={finish}>
                        {finish}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createStandardItemMutation.isPending}>
                  {createStandardItemMutation.isPending ? "Criando..." : "Criar Modelo"}
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
                  <div className="min-w-0">
                    <CardTitle className="text-sm truncate">{item.name}</CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Tipo: {item.type}
                    </CardDescription>
                  </div>
                  {item.hasVariableMeasurement && (
                    <Badge variant="secondary" className="text-xs shrink-0">Variável</Badge>
                  )}
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
    </div>
  );
}
