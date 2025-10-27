import { useQuery, useMutation } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { AlertCircle, Package, CheckCircle, Truck, Calendar, Filter, Eye, Check, ChevronsUpDown, Camera } from "lucide-react";
import { Fragment, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ObjectUploader } from "@/components/ObjectUploader";
import { DeliveryPhotoGallery } from "@/components/DeliveryPhotoGallery";

export default function Grafica() {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [modalType, setModalType] = useState<"production" | "delivery" | null>(null);
  const [viewDetailsItem, setViewDetailsItem] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [materialFilter, setMaterialFilter] = useState<string>("all");
  const [finishFilter, setFinishFilter] = useState<string>("all");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [next10DaysFilter, setNext10DaysFilter] = useState(false);
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [openRecipientCombobox, setOpenRecipientCombobox] = useState(false);
  const [productionData, setProductionData] = useState({
    quantityProduced: 0,
  });
  const [deliveryData, setDeliveryData] = useState({
    photoUrl: "",
    receivedBy: "",
  });
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string>("");
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string>("");
  const [isPhotoUploaded, setIsPhotoUploaded] = useState(false);

  const { data: items = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/items/approved"],
  });

  const { data: events = [] } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const startProductionMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: any }) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/start-production`, data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      await queryClient.refetchQueries({ queryKey: ["/api/items/approved"] });
      await queryClient.refetchQueries({ queryKey: ["/api/items"] });
      setSelectedItem(null);
      setModalType(null);
      setProductionData({ quantityProduced: 0 });
      toast({
        title: "Produção iniciada",
        description: "A produção foi registrada com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao iniciar produção",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const markDeliveredMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: any }) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/deliver`, data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      await queryClient.refetchQueries({ queryKey: ["/api/items/approved"] });
      await queryClient.refetchQueries({ queryKey: ["/api/items"] });
      setSelectedItem(null);
      setModalType(null);
      setDeliveryData({ photoUrl: "", receivedBy: "" });
      setUploadedPhotoUrl("");
      toast({
        title: "Entrega confirmada",
        description: "O item foi marcado como entregue com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao confirmar entrega",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Obter tipos, materiais e acabamentos únicos
  const uniqueTypes = Array.from(new Set(items.map(item => item.type))).sort();
  const uniqueMaterials = Array.from(new Set(items.map(item => item.material).filter(Boolean))).sort();
  const uniqueFinishes = Array.from(new Set(items.map(item => item.finish).filter(Boolean))).sort();
  
  // Obter nomes únicos de destinatários (quem recebeu entregas anteriores)
  const uniqueRecipients = Array.from(
    new Set(items.map(item => item.receivedBy).filter(Boolean))
  ).sort();

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

  const filteredItems = items
    .filter(item => {
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesEvent = eventFilter === "all" || item.eventId === eventFilter;
      const matchesType = typeFilter === "all" || item.type === typeFilter;
      const matchesMaterial = materialFilter === "all" || item.material === materialFilter;
      const matchesFinish = finishFilter === "all" || item.finish === finishFilter;
      
      // Filtro de próximos 10 dias
      let matchesNext10Days = true;
      if (next10DaysFilter && item.event?.truckDepartureDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tenDaysFromNow = new Date(today);
        tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10);
        const departureDate = new Date(item.event.truckDepartureDate);
        matchesNext10Days = departureDate >= today && departureDate <= tenDaysFromNow;
      }
      
      // Filtro por mês
      let matchesMonth = true;
      if (monthFilter !== "all" && item.event?.truckDepartureDate) {
        const departureDate = new Date(item.event.truckDepartureDate);
        const month = departureDate.getMonth() + 1;
        matchesMonth = month.toString() === monthFilter;
      }
      
      return matchesStatus && matchesEvent && matchesType && matchesMaterial && matchesFinish && matchesNext10Days && matchesMonth;
    })
    .sort((a, b) => {
      // Primeiro ordenar por evento
      const eventA = a.event?.name || '';
      const eventB = b.event?.name || '';
      if (eventA !== eventB) {
        return eventA.localeCompare(eventB);
      }
      // Depois ordenar por tipo
      return a.type.localeCompare(b.type);
    });

  // Filtrar por evento antes de contar estatísticas
  const itemsForEvent = eventFilter === "all" 
    ? items 
    : items.filter(item => item.eventId === eventFilter);
  
  const stats = {
    total: itemsForEvent.length,
    approved: itemsForEvent.filter(i => i.status === 'approved').length,
    inProduction: itemsForEvent.filter(i => i.status === 'inProduction').length,
    produced: itemsForEvent.filter(i => i.status === 'produced').length,
    delivered: itemsForEvent.filter(i => i.status === 'delivered').length,
  };

  const handleSubmitProduction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    
    startProductionMutation.mutate({
      itemId: selectedItem.id,
      data: productionData,
    });
  };

  const handleSubmitDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    
    // Validar que o campo "Quem recebeu" está preenchido
    if (!deliveryData.receivedBy || !deliveryData.receivedBy.trim()) {
      toast({
        title: "Campo obrigatório",
        description: "Por favor, informe quem recebeu o material",
        variant: "destructive",
      });
      return;
    }
    
    // Salvar foto no banco antes de marcar como entregue (se houver)
    if (uploadedPhotoUrl) {
      try {
        await apiRequest("POST", "/api/delivery-photos", {
          itemId: selectedItem.id,
          photoUrl: uploadedPhotoUrl,
          uploadedBy: (window as any).userName || "Sistema",
        });
      } catch (error) {
        console.error("Error saving photo:", error);
        toast({
          title: "Erro ao salvar foto",
          description: "A foto não foi salva. Deseja continuar?",
          variant: "destructive",
        });
        return;
      }
    }
    
    markDeliveredMutation.mutate({
      itemId: selectedItem.id,
      data: deliveryData,
    });
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="title-grafica">
          Gráfica - Controle de Produção
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Registre o progresso da produção dos itens
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Liberados</CardTitle>
            <CheckCircle className="h-4 w-4 text-status-inProgress" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-inProgress" data-testid="stat-approved">{stats.approved}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Aguardando produção
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Produção</CardTitle>
            <Package className="h-4 w-4 text-status-production" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-production" data-testid="stat-production">{stats.inProduction}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Produção parcial
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Finalizados</CardTitle>
            <CheckCircle className="h-4 w-4 text-status-completed" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-completed" data-testid="stat-produced">{stats.produced}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Não entregue
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entregues</CardTitle>
            <Truck className="h-4 w-4 text-status-completed" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-completed" data-testid="stat-delivered">{stats.delivered}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Para alguém
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <CardTitle>Itens para Produção</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Select value={eventFilter} onValueChange={setEventFilter}>
                  <SelectTrigger className="w-[180px]" data-testid="select-event-filter">
                    <SelectValue placeholder="Todos os eventos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os eventos</SelectItem>
                    {events.map((event) => (
                      <SelectItem key={event.id} value={event.id}>
                        {event.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                    <SelectValue placeholder="Todos os status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="approved">Liberados</SelectItem>
                    <SelectItem value="inProduction">Em Produção</SelectItem>
                    <SelectItem value="produced">Produzidos</SelectItem>
                    <SelectItem value="delivered">Entregues</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={monthFilter} onValueChange={setMonthFilter}>
                  <SelectTrigger className="w-[160px]" data-testid="select-month-filter">
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
                  Próximos 10 dias
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className={showAdvancedFilters ? "bg-muted" : ""}
                  data-testid="button-toggle-advanced-filters"
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Filtros Avançados
                </Button>
              </div>
            </div>

            {showAdvancedFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-full" data-testid="select-type-filter">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os tipos</SelectItem>
                    {uniqueTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={materialFilter} onValueChange={setMaterialFilter}>
                  <SelectTrigger className="w-full" data-testid="select-material-filter">
                    <SelectValue placeholder="Material" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os materiais</SelectItem>
                    {uniqueMaterials.map((material) => (
                      <SelectItem key={material} value={material}>
                        {material}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={finishFilter} onValueChange={setFinishFilter}>
                  <SelectTrigger className="w-full" data-testid="select-finish-filter">
                    <SelectValue placeholder="Acabamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os acabamentos</SelectItem>
                    {uniqueFinishes.map((finish) => (
                      <SelectItem key={finish} value={finish}>
                        {finish}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {(typeFilter !== "all" || materialFilter !== "all" || finishFilter !== "all") && (
                  <div className="sm:col-span-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setTypeFilter("all");
                        setMaterialFilter("all");
                        setFinishFilter("all");
                      }}
                      className="text-xs"
                      data-testid="button-reset-advanced-filters"
                    >
                      Limpar filtros avançados
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum item encontrado</h3>
              <p className="text-muted-foreground">
                {statusFilter === "all" 
                  ? "Não há itens liberados para produção" 
                  : "Nenhum item com este status"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium">Descrição</th>
                    <th className="text-left py-3 px-4 font-medium w-20">Qtd</th>
                    <th className="text-left py-3 px-4 font-medium w-20">Prod.</th>
                    <th className="text-left py-3 px-4 font-medium">Dimensões</th>
                    <th className="text-left py-3 px-4 font-medium w-16">m²</th>
                    <th className="text-left py-3 px-4 font-medium">Material</th>
                    <th className="text-left py-3 px-4 font-medium w-24">Status</th>
                    <th className="text-right py-3 px-4 font-medium w-32">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, index) => {
                    const prevItem = index > 0 ? filteredItems[index - 1] : null;
                    const showEventHeader = !prevItem || prevItem.event?.name !== item.event?.name;
                    const showTypeHeader = !prevItem || prevItem.event?.name !== item.event?.name || prevItem.type !== item.type;
                    
                    // Calcular índice do evento para cores alternadas
                    let eventIndex = 0;
                    if (item.event) {
                      const uniqueEvents = Array.from(new Set(filteredItems.map(i => i.event?.id).filter(Boolean)));
                      eventIndex = uniqueEvents.indexOf(item.event.id);
                    }
                    const isEvenEvent = eventIndex % 2 === 0;
                    
                    return (
                      <Fragment key={item.id}>
                        {showEventHeader && (
                          <tr className="bg-gradient-to-r from-primary/10 to-primary/5 border-t-4 border-primary/30">
                            <td colSpan={8} className="py-3 px-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <div className="h-6 w-1.5 bg-primary rounded-full flex-shrink-0"></div>
                                  <div className="text-sm font-bold text-primary uppercase tracking-wider break-words">
                                    {item.event?.name || 'Sem Evento'}
                                  </div>
                                </div>
                                {item.event && (
                                  <div className="flex items-center gap-3 text-xs flex-shrink-0">
                                    <div className="flex items-center gap-1.5 text-muted-foreground whitespace-nowrap">
                                      <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                                      <span className="hidden sm:inline">Início: </span>
                                      <strong className="text-foreground">{new Date(item.event.startDate).toLocaleDateString('pt-BR')}</strong>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-muted-foreground whitespace-nowrap">
                                      <Truck className="h-3.5 w-3.5 flex-shrink-0" />
                                      <span className="hidden sm:inline">Saída: </span>
                                      <strong className="text-foreground">{new Date(item.event.truckDepartureDate).toLocaleDateString('pt-BR')} às {new Date(item.event.truckDepartureDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        {showTypeHeader && (
                          <tr key={`group-${item.eventId}-${item.type}`} className={`border-y border-primary/10 ${isEvenEvent ? 'bg-muted/20' : 'bg-muted/10'}`}>
                            <td colSpan={8} className="py-1.5 px-4">
                              <div className="flex items-center gap-2">
                                <div className="h-4 w-0.5 bg-primary/40 rounded-full"></div>
                                <div className="text-sm font-bold text-foreground">
                                  {item.type}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        <tr
                          key={item.id}
                          className={`border-b border-border hover-elevate ${isEvenEvent ? 'bg-muted/5' : 'bg-background'}`}
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
                          <td className="py-3 px-4 text-center">
                            <div className="text-sm font-semibold tabular-nums text-status-production">
                              {item.quantityProduced || '-'}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {item.visualWidth && item.visualHeight ? (
                              <div className="text-sm">
                                <div className="tabular-nums whitespace-nowrap">
                                  <span className="text-muted-foreground text-xs">Visual:</span> {item.visualWidth} × {item.visualHeight}m
                                </div>
                                {item.fileWidth && item.fileHeight && (
                                  <div className="tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                                    Arquivo: {item.fileWidth} × {item.fileHeight}m
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground">—</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm font-medium tabular-nums text-center">
                            {item.calculatedM2}
                          </td>
                          <td className="py-3 px-4 text-sm">
                            <div>{item.material}</div>
                            <div className="text-xs text-muted-foreground">{item.finish}</div>
                          </td>
                          <td className="py-3 px-4">
                            <StatusBadge status={item.status} />
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex gap-1 justify-end">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setViewDetailsItem(item)}
                                data-testid={`button-view-${item.id}`}
                                title="Ver detalhes"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {item.status !== 'produced' && item.status !== 'delivered' && (
                                <Button
                                  size="icon"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedItem(item);
                                    setModalType("production");
                                    setProductionData({ quantityProduced: item.quantity });
                                  }}
                                  data-testid={`button-production-${item.id}`}
                                  title={item.quantityProduced && item.quantityProduced > 0 ? "Continuar Produção" : "Iniciar Produção"}
                                  className="bg-status-production/10 hover:bg-status-production/20 border-status-production/30"
                                >
                                  <Package className="h-4 w-4 text-status-production" />
                                </Button>
                              )}
                              {item.status !== 'delivered' && (
                                <Button
                                  size="icon"
                                  onClick={() => {
                                    setSelectedItem(item);
                                    setModalType("delivery");
                                    setUploadedPhotoUrl("");
                                    setPhotoPreviewUrl("");
                                    setIsPhotoUploaded(false);
                                    setDeliveryData({ photoUrl: "", receivedBy: "" });
                                  }}
                                  data-testid={`button-deliver-${item.id}`}
                                  title="Marcar Entrega"
                                  className="bg-primary hover:bg-primary/90"
                                >
                                  <Truck className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </td>
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

      {/* Dialog de Detalhes do Item */}
      <Dialog open={!!viewDetailsItem} onOpenChange={(open) => !open && setViewDetailsItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalhes do Item</DialogTitle>
            <DialogDescription>
              Informações completas do item
            </DialogDescription>
          </DialogHeader>
          {viewDetailsItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Evento</p>
                  <p className="text-sm font-semibold">{viewDetailsItem.event?.name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Tipo</p>
                  <p className="text-sm font-semibold">{viewDetailsItem.type}</p>
                </div>
              </div>

              {viewDetailsItem.description && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Descrição</p>
                  <p className="text-sm font-semibold">{viewDetailsItem.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Material</p>
                  <p className="text-sm font-semibold">{viewDetailsItem.material}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Acabamento</p>
                  <p className="text-sm font-semibold">{viewDetailsItem.finish}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Quantidade</p>
                  <p className="text-sm font-semibold">{viewDetailsItem.quantity}</p>
                </div>
                {viewDetailsItem.quantityProduced !== null && viewDetailsItem.quantityProduced > 0 && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Quantidade Produzida</p>
                    <p className="text-sm font-semibold text-status-production">{viewDetailsItem.quantityProduced}</p>
                  </div>
                )}
                <div className="col-span-2">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Dimensões</p>
                  {viewDetailsItem.visualWidth && viewDetailsItem.visualHeight ? (
                    <>
                      <p className="text-sm font-semibold">Visual: {viewDetailsItem.visualWidth} × {viewDetailsItem.visualHeight}m</p>
                      {viewDetailsItem.fileWidth && viewDetailsItem.fileHeight && (
                        <p className="text-sm text-muted-foreground">Arquivo: {viewDetailsItem.fileWidth} × {viewDetailsItem.fileHeight}m</p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">—</p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">m² Total</p>
                  <p className="text-sm font-semibold">{viewDetailsItem.calculatedM2}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <div className="pt-1">
                    <StatusBadge status={viewDetailsItem.status} />
                  </div>
                </div>
              </div>

              {viewDetailsItem.observations && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Observações</p>
                  <p className="text-sm">{viewDetailsItem.observations}</p>
                </div>
              )}

              {viewDetailsItem.status === "delivered" && (
                <DeliveryPhotoGallery itemId={viewDetailsItem.id} />
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setViewDetailsItem(null)}>
                  Fechar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedItem && !!modalType} onOpenChange={(open) => {
        if (!open) {
          setSelectedItem(null);
          setModalType(null);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {modalType === "production" 
                ? (selectedItem?.quantityProduced && selectedItem.quantityProduced > 0 
                    ? "Continuar Produção" 
                    : "Iniciar Produção")
                : "Confirmar Entrega"}
            </DialogTitle>
            <DialogDescription>
              {modalType === "production" 
                ? (selectedItem?.quantityProduced && selectedItem.quantityProduced > 0
                    ? "Atualize a quantidade produzida do material"
                    : "Registre a quantidade produzida do material")
                : "Registre a entrega do material produzido"}
            </DialogDescription>
          </DialogHeader>
          {selectedItem && modalType === "production" && (
            <form onSubmit={handleSubmitProduction} className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Item:</span>
                  <span className="text-sm">{selectedItem.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Evento:</span>
                  <span className="text-sm">{selectedItem.event?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Quantidade Total:</span>
                  <span className="text-sm">{selectedItem.quantity} unidades</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="quantityProduced">Quantidade Produzida *</Label>
                <div className="flex gap-2">
                  <Input
                    id="quantityProduced"
                    type="number"
                    min="1"
                    max={selectedItem.quantity}
                    value={productionData.quantityProduced}
                    onChange={(e) => setProductionData({ quantityProduced: parseInt(e.target.value) || 0 })}
                    required
                    data-testid="input-quantity-produced"
                    className="flex-1"
                  />
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={() => setProductionData({ quantityProduced: selectedItem.quantity })}
                    data-testid="button-set-total"
                  >
                    Total ({selectedItem.quantity})
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Informe quantas unidades foram produzidas (parcial ou total)
                </p>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="outline" onClick={() => {
                  setSelectedItem(null);
                  setModalType(null);
                }}>
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={startProductionMutation.isPending || productionData.quantityProduced === 0}
                  className="bg-status-production hover:bg-status-production/90"
                  data-testid="button-confirm-production"
                >
                  <Package className="h-4 w-4 mr-2" />
                  {startProductionMutation.isPending ? "Salvando..." : "Confirmar Produção"}
                </Button>
              </div>
            </form>
          )}
          {selectedItem && modalType === "delivery" && (
            <form onSubmit={handleSubmitDelivery} className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Item:</span>
                  <span className="text-sm">{selectedItem.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Evento:</span>
                  <span className="text-sm">{selectedItem.event?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Quantidade:</span>
                  <span className="text-sm">{selectedItem.quantity} unidades</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Quem recebeu o material? *</Label>
                <Popover open={openRecipientCombobox} onOpenChange={setOpenRecipientCombobox}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openRecipientCombobox}
                      className="w-full justify-between"
                      data-testid="button-recipient-combobox"
                    >
                      {deliveryData.receivedBy || "Selecione ou digite o nome..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput 
                        placeholder="Digite o nome..." 
                        value={deliveryData.receivedBy}
                        onValueChange={(value) => setDeliveryData({ ...deliveryData, receivedBy: value })}
                      />
                      <CommandList>
                        {uniqueRecipients.length === 0 ? (
                          <CommandEmpty>Digite o nome de quem recebeu</CommandEmpty>
                        ) : (
                          <>
                            <CommandEmpty>
                              {deliveryData.receivedBy ? `Usar "${deliveryData.receivedBy}"` : "Digite o nome de quem recebeu"}
                            </CommandEmpty>
                            <CommandGroup heading="Destinatários anteriores">
                              {uniqueRecipients.map((recipient) => (
                                <CommandItem
                                  key={recipient}
                                  value={recipient}
                                  onSelect={(currentValue) => {
                                    setDeliveryData({ ...deliveryData, receivedBy: currentValue });
                                    setOpenRecipientCombobox(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      deliveryData.receivedBy === recipient ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {recipient}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground">
                  Selecione de entregas anteriores ou digite um novo nome
                </p>
              </div>

              <div className="space-y-2">
                <Label>Foto da entrega (opcional)</Label>
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-2">
                    <ObjectUploader
                      maxFileSize={10485760}
                      buttonVariant="outline"
                      onFileSelect={(file, previewUrl) => {
                        // Mostrar preview local IMEDIATAMENTE
                        setPhotoPreviewUrl(previewUrl);
                      }}
                      onGetUploadParameters={async () => {
                        const response = await fetch("/api/objects/upload", { method: "POST" });
                        const data = await response.json();
                        return {
                          method: "PUT" as const,
                          url: data.uploadURL,
                        };
                      }}
                      onComplete={async (result) => {
                        const photoUrl = result.url;
                        setUploadedPhotoUrl(photoUrl);
                        setIsPhotoUploaded(true);
                        
                        toast({
                          title: "Foto carregada",
                          description: "Foto anexada com sucesso",
                        });
                      }}
                      onError={(error) => {
                        // Limpar preview se houver erro
                        setPhotoPreviewUrl("");
                        toast({
                          title: "Erro no upload",
                          description: error.message,
                          variant: "destructive",
                        });
                      }}
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      {photoPreviewUrl ? "Trocar Foto" : "Anexar Foto"}
                    </ObjectUploader>
                    <p className="text-xs text-muted-foreground">
                      Faça upload de uma foto do material entregue (opcional)
                    </p>
                  </div>
                  {photoPreviewUrl && (
                    <div className="flex-shrink-0">
                      <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-border bg-muted">
                        <img
                          src={photoPreviewUrl}
                          alt="Preview da foto"
                          className="w-full h-full object-cover"
                          data-testid="photo-preview"
                        />
                        {isPhotoUploaded && (
                          <div className="absolute top-1 right-1">
                            <div className="bg-status-completed text-white rounded-full p-1">
                              <Check className="h-3 w-3" />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="outline" onClick={() => {
                  setSelectedItem(null);
                  setModalType(null);
                }}>
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={markDeliveredMutation.isPending}
                  className="bg-status-completed hover:bg-status-completed/90"
                  data-testid="button-confirm-delivery"
                >
                  <Truck className="h-4 w-4 mr-2" />
                  {markDeliveredMutation.isPending ? "Salvando..." : "Confirmar Entrega"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
