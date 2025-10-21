import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, ArrowLeft, Calendar, Truck, AlertCircle } from "lucide-react";
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

const itemTypes = ["2x1", "Rolo", "Palco", "Banner", "Faixa", "Adesivo", "Backdrop"];
const materials = ["Lona", "Tecido", "Adesivo", "Vinílico", "Banner"];
const finishes = ["Ilhós", "Soldado", "Bastão", "Sem acabamento"];

export default function EventDetail() {
  const [, params] = useRoute("/eventos/:id");
  const eventId = params?.id;
  const [open, setOpen] = useState(false);
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
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-item">
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Item
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Adicionar Item ao Evento</DialogTitle>
                <DialogDescription>
                  Preencha as informações do item gráfico
                </DialogDescription>
              </DialogHeader>
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
            </DialogContent>
          </Dialog>
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
                    <th className="text-left py-3 px-4 font-medium">Tipo</th>
                    <th className="text-left py-3 px-4 font-medium">Qtd</th>
                    <th className="text-left py-3 px-4 font-medium">Área × Visual</th>
                    <th className="text-left py-3 px-4 font-medium">m²</th>
                    <th className="text-left py-3 px-4 font-medium">Material</th>
                    <th className="text-left py-3 px-4 font-medium">Acabamento</th>
                    <th className="text-left py-3 px-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr
                      key={item.id}
                      className={`border-b border-border hover-elevate ${index % 2 === 0 ? 'bg-card/50' : ''}`}
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
