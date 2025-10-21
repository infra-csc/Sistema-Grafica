import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, AlertCircle, Layers } from "lucide-react";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const itemTypes = ["2x1", "Rolo", "Palco", "Banner", "Faixa", "Adesivo", "Backdrop"];

export default function Modelos() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    type: "",
    area: "",
    visual: "",
    materials: [] as string[],
    finishes: [] as string[],
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
        materials: [],
        finishes: [],
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
    createStandardItemMutation.mutate(formData);
  };

  const handleMaterialToggle = (material: string) => {
    setFormData(prev => ({
      ...prev,
      materials: prev.materials.includes(material)
        ? prev.materials.filter(m => m !== material)
        : [...prev.materials, material]
    }));
  };

  const handleFinishToggle = (finish: string) => {
    setFormData(prev => ({
      ...prev,
      finishes: prev.finishes.includes(finish)
        ? prev.finishes.filter(f => f !== finish)
        : [...prev.finishes, finish]
    }));
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="title-modelos">
            Modelos de Itens
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie modelos padrão de itens gráficos
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-model">
              <Plus className="h-4 w-4 mr-2" />
              Novo Modelo
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
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
                  data-testid="input-model-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Tipo</Label>
                <Input
                  id="type"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  placeholder="Ex: 2x1, Rolo, etc"
                  required
                  data-testid="input-model-type"
                  list="item-types"
                />
                <datalist id="item-types">
                  {itemTypes.map(type => (
                    <option key={type} value={type} />
                  ))}
                </datalist>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="hasVariableMeasurement"
                  checked={formData.hasVariableMeasurement}
                  onCheckedChange={(checked) => setFormData({ ...formData, hasVariableMeasurement: checked as boolean })}
                  data-testid="checkbox-variable-measurement"
                />
                <Label htmlFor="hasVariableMeasurement" className="cursor-pointer">
                  Medidas variáveis (deixar em branco para medidas fixas)
                </Label>
              </div>

              {!formData.hasVariableMeasurement && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="area">Área (m)</Label>
                    <Input
                      id="area"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.area}
                      onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                      data-testid="input-model-area"
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
                      data-testid="input-model-visual"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Materiais Disponíveis</Label>
                <div className="grid grid-cols-2 gap-2">
                  {["Lona", "Tecido", "Adesivo", "Vinílico", "Banner"].map((material) => (
                    <div key={material} className="flex items-center space-x-2">
                      <Checkbox
                        id={`material-${material}`}
                        checked={formData.materials.includes(material)}
                        onCheckedChange={() => handleMaterialToggle(material)}
                      />
                      <Label htmlFor={`material-${material}`} className="cursor-pointer text-sm">
                        {material}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Acabamentos Disponíveis</Label>
                <div className="grid grid-cols-2 gap-2">
                  {["Ilhós", "Soldado", "Bastão", "Sem acabamento"].map((finish) => (
                    <div key={finish} className="flex items-center space-x-2">
                      <Checkbox
                        id={`finish-${finish}`}
                        checked={formData.finishes.includes(finish)}
                        onCheckedChange={() => handleFinishToggle(finish)}
                      />
                      <Label htmlFor={`finish-${finish}`} className="cursor-pointer text-sm">
                        {finish}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createStandardItemMutation.isPending} data-testid="button-submit-model">
                  {createStandardItemMutation.isPending ? "Criando..." : "Criar Modelo"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {standardItems.map((item) => (
            <Card key={item.id} className="hover-elevate" data-testid={`card-model-${item.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{item.name}</CardTitle>
                    <CardDescription className="mt-1">
                      Tipo: {item.type}
                    </CardDescription>
                  </div>
                  {item.hasVariableMeasurement && (
                    <Badge variant="secondary">Variável</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!item.hasVariableMeasurement && item.area && item.visual && (
                  <div className="p-3 bg-muted/50 rounded-md">
                    <p className="text-sm font-medium">Medidas Fixas</p>
                    <p className="text-xs text-muted-foreground">
                      {item.area} × {item.visual} m
                    </p>
                  </div>
                )}
                
                {item.materials && item.materials.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                      Materiais
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {item.materials.map((material: string) => (
                        <Badge key={material} variant="outline" className="text-xs">
                          {material}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {item.finishes && item.finishes.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                      Acabamentos
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {item.finishes.map((finish: string) => (
                        <Badge key={finish} variant="outline" className="text-xs">
                          {finish}
                        </Badge>
                      ))}
                    </div>
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
