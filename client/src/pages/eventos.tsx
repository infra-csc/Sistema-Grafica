import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Calendar, Truck, AlertCircle } from "lucide-react";
import { Link } from "wouter";
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
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Eventos() {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    startDate: "",
    truckDepartureDate: "",
  });
  const { toast } = useToast();

  const { data: events = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const createEventMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return await apiRequest("POST", "/api/events", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setOpen(false);
      setFormData({ name: "", startDate: "", truckDepartureDate: "" });
      toast({
        title: "Evento criado",
        description: "O evento foi criado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar evento",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getEventStatus = (event: any) => {
    const now = new Date();
    const departure = new Date(event.truckDepartureDate);
    const hoursUntilDeparture = (departure.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (event.status === 'completed') return 'completed';
    if (hoursUntilDeparture < 48) return 'urgent';
    return 'created';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createEventMutation.mutate(formData);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="title-eventos">
            Eventos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie todos os eventos de produção gráfica
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-event">
              <Plus className="h-4 w-4 mr-2" />
              Novo Evento
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Criar Novo Evento</DialogTitle>
              <DialogDescription>
                Preencha as informações do evento
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Evento</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Circuitinho BSB 2024"
                  required
                  data-testid="input-event-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="startDate">Data e Hora de Início do Evento</Label>
                <Input
                  id="startDate"
                  type="datetime-local"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  required
                  data-testid="input-start-date"
                />
                <p className="text-xs text-muted-foreground">
                  Quando o evento começa
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="truckDepartureDate">Data e Hora de Saída do Caminhão</Label>
                <Input
                  id="truckDepartureDate"
                  type="datetime-local"
                  value={formData.truckDepartureDate}
                  onChange={(e) => setFormData({ ...formData, truckDepartureDate: e.target.value })}
                  required
                  data-testid="input-truck-date"
                />
                <p className="text-xs text-muted-foreground">
                  Prazo final para entrega dos materiais
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createEventMutation.isPending} data-testid="button-submit-event">
                  {createEventMutation.isPending ? "Criando..." : "Criar Evento"}
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
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum evento criado</h3>
              <p className="text-muted-foreground mb-4">Comece criando seu primeiro evento</p>
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeiro Evento
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {events.map((event) => {
            const status = getEventStatus(event);
            const itemCount = event.items?.length || 0;
            
            return (
              <Link key={event.id} href={`/eventos/${event.id}`}>
                <Card className="hover-elevate cursor-pointer transition-all" data-testid={`card-event-${event.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{event.name}</CardTitle>
                      <StatusBadge status={status} />
                    </div>
                    <CardDescription className="flex flex-col gap-1 mt-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>Início: {new Date(event.startDate).toLocaleDateString('pt-BR')}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Truck className="h-3.5 w-3.5" />
                        <span>Saída: {new Date(event.truckDepartureDate).toLocaleDateString('pt-BR')}</span>
                      </div>
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className="border-t pt-4">
                    <div className="flex items-center justify-between w-full">
                      <span className="text-sm text-muted-foreground">
                        {itemCount} {itemCount === 1 ? 'item' : 'itens'}
                      </span>
                      <Button variant="ghost" size="sm">
                        Ver detalhes
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
