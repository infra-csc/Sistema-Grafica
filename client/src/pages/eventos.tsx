import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Calendar, Truck, AlertCircle, Search, Pencil, Trash2 } from "lucide-react";
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
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";

export default function Eventos() {
  const { hasPermission } = useAuth();
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    startDate: "",
    truckDepartureDate: "",
  });
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
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

  const updateEventMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      return await apiRequest("PATCH", `/api/events/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setEditingEvent(null);
      setFormData({ name: "", startDate: "", truckDepartureDate: "" });
      toast({
        title: "Evento atualizado",
        description: "O evento foi atualizado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar evento",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/events/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setDeletingEventId(null);
      toast({
        title: "Evento excluído",
        description: "O evento foi excluído com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir evento",
        description: error.message,
        variant: "destructive",
      });
    },
  });


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingEvent) {
      updateEventMutation.mutate({ id: editingEvent.id, data: formData });
    } else {
      createEventMutation.mutate(formData);
    }
  };

  const handleEdit = (event: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingEvent(event);
    setFormData({
      name: event.name || "",
      startDate: event.startDate ? new Date(event.startDate).toISOString().slice(0, 16) : "",
      truckDepartureDate: event.truckDepartureDate ? new Date(event.truckDepartureDate).toISOString().slice(0, 16) : "",
    });
    setOpen(true);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeletingEventId(id);
  };

  const handleCloseDialog = () => {
    setOpen(false);
    setEditingEvent(null);
    setFormData({ name: "", startDate: "", truckDepartureDate: "" });
  };

  const filteredEvents = events.filter((event) =>
    event.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar eventos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-full sm:w-64"
              data-testid="input-search-events"
            />
          </div>
          <Dialog open={open} onOpenChange={(isOpen) => {
            if (!isOpen) handleCloseDialog();
            else setOpen(isOpen);
          }}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-event">
                <Plus className="h-4 w-4 mr-2" />
                Novo Evento
              </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingEvent ? "Editar Evento" : "Criar Novo Evento"}</DialogTitle>
              <DialogDescription>
                {editingEvent ? "Atualize as informações do evento" : "Preencha as informações do evento"}
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
                <Button type="button" variant="outline" onClick={handleCloseDialog}>
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={createEventMutation.isPending || updateEventMutation.isPending} 
                  data-testid="button-submit-event"
                >
                  {editingEvent 
                    ? (updateEventMutation.isPending ? "Salvando..." : "Salvar Alterações")
                    : (createEventMutation.isPending ? "Criando..." : "Criar Evento")
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
      ) : filteredEvents.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum evento encontrado</h3>
              <p className="text-muted-foreground">Tente uma busca diferente</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredEvents.map((event) => {
            const itemCount = event.items?.length || 0;
            
            return (
              <Link key={event.id} href={`/eventos/${event.id}`}>
                <Card className="hover-elevate cursor-pointer transition-all" data-testid={`card-event-${event.id}`}>
                  <CardHeader>
                    <CardTitle className="text-base">{event.name}</CardTitle>
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
                    <div className="flex items-center justify-between w-full gap-2">
                      <span className="text-sm text-muted-foreground">
                        {itemCount} {itemCount === 1 ? 'item' : 'itens'}
                      </span>
                      <div className="flex items-center gap-2">
                        {hasPermission("admin") && (
                          <>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={(e) => handleEdit(event, e)}
                              data-testid={`button-edit-event-${event.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={(e) => handleDelete(event.id, e)}
                              data-testid={`button-delete-event-${event.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                        <Button variant="ghost" size="sm">
                          Ver detalhes
                        </Button>
                      </div>
                    </div>
                  </CardFooter>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deletingEventId} onOpenChange={() => setDeletingEventId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este evento? Esta ação não pode ser desfeita e todos os itens associados também serão excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingEventId && deleteEventMutation.mutate(deletingEventId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-event"
            >
              {deleteEventMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
