import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, Truck, AlertCircle, Search, Pencil, Trash2, Package, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

type UrgencyLevel = 'urgent' | 'attention' | 'normal' | 'completed';

export default function Eventos() {
  const { hasPermission } = useAuth();
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUrgencies, setSelectedUrgencies] = useState<UrgencyLevel[]>([]);
  const [next10DaysFilter, setNext10DaysFilter] = useState(false);
  const [monthFilter, setMonthFilter] = useState<string>("all");
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

  // Função para calcular urgência baseado na saída do caminhão
  const getEventUrgency = (event: any): UrgencyLevel => {
    const now = new Date();
    const departure = new Date(event.truckDepartureDate);
    const hoursUntilDeparture = (departure.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilDeparture < 0) return 'completed';
    if (hoursUntilDeparture < 24) return 'urgent';
    if (hoursUntilDeparture < 48) return 'attention';
    return 'normal';
  };

  const toggleUrgency = (urgency: UrgencyLevel) => {
    setSelectedUrgencies(prev => 
      prev.includes(urgency) 
        ? prev.filter(u => u !== urgency)
        : [...prev, urgency]
    );
  };

  // Meses do ano
  const months = [
    { value: "all", label: "Todos os meses" },
    { value: "1", label: "Janeiro" },
    { value: "2", label: "Fevereiro" },
    { value: "3", label: "Março" },
    { value: "4", label: "Abril" },
    { value: "5", label: "Maio" },
    { value: "6", label: "Junho" },
    { value: "7", label: "Julho" },
    { value: "8", label: "Agosto" },
    { value: "9", label: "Setembro" },
    { value: "10", label: "Outubro" },
    { value: "11", label: "Novembro" },
    { value: "12", label: "Dezembro" },
  ];

  const filteredEvents = events
    .filter((event) => {
      // Filtro de busca por nome
      const matchesSearch = event.name.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Filtro de urgência
      const matchesUrgency = selectedUrgencies.length === 0 || 
        selectedUrgencies.includes(getEventUrgency(event));
      
      // Filtro de próximos 10 dias
      let matchesNext10Days = true;
      if (next10DaysFilter && event.truckDepartureDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tenDaysFromNow = new Date(today);
        tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10);
        const departureDate = new Date(event.truckDepartureDate);
        matchesNext10Days = departureDate >= today && departureDate <= tenDaysFromNow;
      }
      
      // Filtro por mês
      let matchesMonth = true;
      if (monthFilter !== "all" && event.truckDepartureDate) {
        const departureDate = new Date(event.truckDepartureDate);
        const month = departureDate.getMonth() + 1;
        matchesMonth = month.toString() === monthFilter;
      }
      
      return matchesSearch && matchesUrgency && matchesNext10Days && matchesMonth;
    })
    .sort((a, b) => {
      const urgencyOrder: Record<UrgencyLevel, number> = {
        urgent: 0,      // Vermelho - primeiro
        attention: 1,   // Amarelo - segundo
        normal: 2,      // Azul - terceiro
        completed: 3    // Verde - último
      };

      const urgencyA = getEventUrgency(a);
      const urgencyB = getEventUrgency(b);
      
      const orderA = urgencyOrder[urgencyA];
      const orderB = urgencyOrder[urgencyB];
      
      // Se têm urgências diferentes, ordena por prioridade
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      
      // Se têm a mesma urgência, ordena primeiro por data de início do evento
      const startDateA = new Date(a.startDate);
      const startDateB = new Date(b.startDate);
      
      if (startDateA.getTime() !== startDateB.getTime()) {
        return startDateA.getTime() - startDateB.getTime();
      }
      
      // Se a data de início for igual, ordena por data de saída do caminhão
      const truckDateA = new Date(a.truckDepartureDate);
      const truckDateB = new Date(b.truckDepartureDate);
      return truckDateA.getTime() - truckDateB.getTime();
    });

  const urgencyConfig = {
    urgent: { label: 'Urgente', color: 'bg-status-urgent text-white', count: events.filter(e => getEventUrgency(e) === 'urgent').length },
    attention: { label: 'Atenção', color: 'bg-status-pending text-foreground', count: events.filter(e => getEventUrgency(e) === 'attention').length },
    normal: { label: 'Normal', color: 'bg-primary text-white', count: events.filter(e => getEventUrgency(e) === 'normal').length },
    completed: { label: 'Concluído', color: 'bg-status-completed text-white', count: events.filter(e => getEventUrgency(e) === 'completed').length },
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
                <Label htmlFor="startDate">Data de Início do Evento</Label>
                <Input
                  id="startDate"
                  type="date"
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

      {/* Filtros de Urgência */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Filtrar por urgência:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.entries(urgencyConfig) as [UrgencyLevel, typeof urgencyConfig.urgent][]).map(([urgency, config]) => (
            <Badge
              key={urgency}
              variant={selectedUrgencies.includes(urgency) ? "default" : "outline"}
              className={`cursor-pointer transition-all ${
                selectedUrgencies.includes(urgency) 
                  ? config.color 
                  : 'hover-elevate'
              }`}
              onClick={() => toggleUrgency(urgency)}
              data-testid={`filter-urgency-${urgency}`}
            >
              {config.label} ({config.count})
            </Badge>
          ))}
          {selectedUrgencies.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedUrgencies([])}
              className="h-auto py-1 px-2 text-xs"
              data-testid="button-clear-filters"
            >
              Limpar filtros
            </Button>
          )}
        </div>
        
        {/* Legenda discreta */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground/60 mt-2">
          <span className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-status-urgent"></div>
            <span>Urgente (&lt;24h)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-status-pending"></div>
            <span>Atenção (24-48h)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-primary"></div>
            <span>Normal (&gt;48h)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-status-completed"></div>
            <span>Concluído</span>
          </span>
        </div>
      </div>

      {/* Filtros de Data */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Filtros de data:</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="w-[200px]" data-testid="select-month-filter">
              <SelectValue placeholder="Mês de saída" />
            </SelectTrigger>
            <SelectContent>
              {months.map((month) => (
                <SelectItem key={month.value} value={month.value}>
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant={next10DaysFilter ? "default" : "outline"}
            size="sm"
            onClick={() => setNext10DaysFilter(!next10DaysFilter)}
            data-testid="button-next-10-days-filter"
          >
            <Truck className="h-4 w-4 mr-2" />
            {next10DaysFilter ? "Próximos 10 dias ✓" : "Próximos 10 dias"}
          </Button>

          {(monthFilter !== "all" || next10DaysFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMonthFilter("all");
                setNext10DaysFilter(false);
              }}
              className="text-xs"
              data-testid="button-clear-date-filters"
            >
              Limpar filtros de data
            </Button>
          )}
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
            
            // Status para INÍCIO DO EVENTO
            const getEventStartStatus = () => {
              const now = new Date();
              const start = new Date(event.startDate);
              const hoursUntilStart = (start.getTime() - now.getTime()) / (1000 * 60 * 60);

              if (hoursUntilStart < 0) {
                return { bg: 'bg-status-completed/10', border: 'border-status-completed/20', icon: 'text-status-completed' };
              }
              if (hoursUntilStart < 24) {
                return { bg: 'bg-status-urgent/10', border: 'border-status-urgent/20', icon: 'text-status-urgent' };
              }
              if (hoursUntilStart < 48) {
                return { bg: 'bg-status-pending/10', border: 'border-status-pending/20', icon: 'text-status-pending' };
              }
              return { bg: 'bg-primary/10', border: 'border-primary/20', icon: 'text-primary' };
            };

            // Status para SAÍDA DO CAMINHÃO (define título e card)
            const getTruckStatus = () => {
              const now = new Date();
              const departure = new Date(event.truckDepartureDate);
              const hoursUntilDeparture = (departure.getTime() - now.getTime()) / (1000 * 60 * 60);

              // Verde: Caminhão já saiu
              if (hoursUntilDeparture < 0) {
                return { 
                  borderColor: 'border-l-status-completed',
                  bgCard: 'bg-status-completed/5',
                  titleColor: 'text-status-completed',
                  bg: 'bg-status-completed/10',
                  border: 'border-status-completed/20',
                  icon: 'text-status-completed'
                };
              }
              
              // Vermelho: Menos de 24h para saída - URGENTE!
              if (hoursUntilDeparture < 24) {
                return { 
                  borderColor: 'border-l-status-urgent',
                  bgCard: 'bg-status-urgent/5',
                  titleColor: 'text-status-urgent',
                  bg: 'bg-status-urgent/10',
                  border: 'border-status-urgent/20',
                  icon: 'text-status-urgent'
                };
              }
              
              // Amarelo: Entre 24h e 48h para saída - ATENÇÃO
              if (hoursUntilDeparture < 48) {
                return { 
                  borderColor: 'border-l-status-pending',
                  bgCard: 'bg-status-pending/5',
                  titleColor: 'text-status-pending',
                  bg: 'bg-status-pending/10',
                  border: 'border-status-pending/20',
                  icon: 'text-status-pending'
                };
              }
              
              // Azul: Mais de 48h para saída - NORMAL
              return { 
                borderColor: 'border-l-primary',
                bgCard: 'bg-primary/5',
                titleColor: 'text-primary',
                bg: 'bg-primary/10',
                border: 'border-primary/20',
                icon: 'text-primary'
              };
            };

            const eventStartColors = getEventStartStatus();
            const truckColors = getTruckStatus();
            
            return (
              <Link key={event.id} href={`/eventos/${event.id}`}>
                <Card className={`hover-elevate cursor-pointer transition-all border-l-4 ${truckColors.borderColor} ${truckColors.bgCard}`} data-testid={`card-event-${event.id}`}>
                  <CardHeader className="pb-3 pt-4">
                    <CardTitle className={`text-base font-bold mb-2 ${truckColors.titleColor}`}>{event.name}</CardTitle>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="flex items-center gap-2 p-2 rounded bg-card border">
                        <Calendar className={`h-3.5 w-3.5 flex-shrink-0 ${eventStartColors.icon}`} />
                        <div className="flex flex-col gap-0 min-w-0">
                          <span className={`text-[10px] font-medium uppercase ${eventStartColors.icon}`}>Início</span>
                          <span className="text-xs font-semibold text-foreground whitespace-nowrap">
                            {new Date(event.startDate).toLocaleDateString('pt-BR', { 
                              day: '2-digit', 
                              month: '2-digit',
                              year: 'numeric'
                            })}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 p-2 rounded bg-card border">
                        <Truck className={`h-3.5 w-3.5 flex-shrink-0 ${truckColors.icon}`} />
                        <div className="flex flex-col gap-0 min-w-0">
                          <span className={`text-[10px] font-medium uppercase ${truckColors.icon}`}>Saída</span>
                          <span className="text-xs font-bold text-foreground whitespace-nowrap">
                            {new Date(event.truckDepartureDate).toLocaleDateString('pt-BR', { 
                              day: '2-digit', 
                              month: '2-digit'
                            })} às {new Date(event.truckDepartureDate).toLocaleTimeString('pt-BR', { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardFooter className="border-t pt-2 pb-3 flex-row items-center gap-3">
                    <div className="flex flex-col gap-1 flex-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground font-medium">
                          {event.items?.filter((item: any) => item.status === 'delivered').length || 0}/{itemCount} concluídos
                        </span>
                        <span className="text-muted-foreground font-semibold">
                          {itemCount > 0 ? Math.round(((event.items?.filter((item: any) => item.status === 'delivered').length || 0) / itemCount) * 100) : 0}%
                        </span>
                      </div>
                      {itemCount > 0 && (
                        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                          <div 
                            className="h-full bg-status-completed transition-all"
                            style={{ 
                              width: `${Math.round(((event.items?.filter((item: any) => item.status === 'delivered').length || 0) / itemCount) * 100)}%` 
                            }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      {hasPermission("admin") && (
                        <>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="h-7 w-7 hover:bg-primary/10"
                            onClick={(e) => handleEdit(event, e)}
                            data-testid={`button-edit-event-${event.id}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="h-7 w-7 hover:bg-destructive/10"
                            onClick={(e) => handleDelete(event.id, e)}
                            data-testid={`button-delete-event-${event.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </>
                      )}
                      <Button variant="default" size="sm" className="h-7 text-xs">
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
