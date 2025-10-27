import { useQuery, useMutation } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, Eye, Calendar, Truck, Filter, Check, ChevronsUpDown, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Fragment, useState } from "react";

export default function Arte() {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"pending" | "approved">("pending");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [confirmApprovalItem, setConfirmApprovalItem] = useState<any>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [materialFilter, setMaterialFilter] = useState<string>("all");
  const [finishFilter, setFinishFilter] = useState<string>("all");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [openEventCombobox, setOpenEventCombobox] = useState(false);
  const [next10DaysFilter, setNext10DaysFilter] = useState(false);
  const [monthFilter, setMonthFilter] = useState<string>("all");

  const { data: allItems = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/items"],
  });

  const { data: events = [] } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const approveItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/approve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setSelectedItem(null);
      setConfirmApprovalItem(null);
      toast({
        title: "Item liberado",
        description: "O item foi liberado para produção",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao liberar item",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const approveBulkMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      return await Promise.all(
        itemIds.map(id => apiRequest("PATCH", `/api/items/${id}/approve`, {}))
      );
    },
    onSuccess: (_, itemIds) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setSelectedItems([]);
      setConfirmApprovalItem(null);
      toast({
        title: "Itens liberados",
        description: `${itemIds.length} itens foram liberados para produção`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao liberar itens",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Obter tipos, materiais e acabamentos únicos
  const uniqueTypes = Array.from(new Set(allItems.map(item => item.type))).sort();
  const uniqueMaterials = Array.from(new Set(allItems.map(item => item.material).filter(Boolean))).sort();
  const uniqueFinishes = Array.from(new Set(allItems.map(item => item.finish).filter(Boolean))).sort();

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

  const filteredItems = allItems
    .filter(item => {
      const matchesEvent = eventFilter === "all" || item.eventId === eventFilter;
      const matchesView = viewMode === "pending" 
        ? item.status === 'requested'
        : item.status === 'approved' || item.status === 'inProduction' || item.status === 'produced' || item.status === 'delivered';
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
        const month = departureDate.getMonth() + 1; // getMonth() retorna 0-11
        matchesMonth = month.toString() === monthFilter;
      }
      
      return matchesEvent && matchesView && matchesType && matchesMaterial && matchesFinish && matchesNext10Days && matchesMonth;
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

  // Filtrar por evento antes de contar
  const itemsForEvent = eventFilter === "all" 
    ? allItems 
    : allItems.filter(item => item.eventId === eventFilter);
  
  const pendingCount = itemsForEvent.filter(item => item.status === 'requested').length;
  const approvedCount = itemsForEvent.filter(item => item.status !== 'requested').length;

  const pendingItems = filteredItems.filter(item => item.status === 'requested');
  const allPendingSelected = pendingItems.length > 0 && selectedItems.length === pendingItems.length;

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const toggleSelectAll = () => {
    if (allPendingSelected) {
      setSelectedItems([]);
    } else {
      setSelectedItems(pendingItems.map(item => item.id));
    }
  };

  const handleBulkApprove = () => {
    setConfirmApprovalItem({ type: 'bulk', count: selectedItems.length });
  };

  const handleSingleApprove = (item: any) => {
    setConfirmApprovalItem({ type: 'single', item });
  };

  const confirmApproval = () => {
    if (confirmApprovalItem?.type === 'bulk') {
      approveBulkMutation.mutate(selectedItems);
    } else if (confirmApprovalItem?.type === 'single') {
      approveItemMutation.mutate(confirmApprovalItem.item.id);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="title-arte">
          Arte - Liberação de Arquivos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Revise e libere itens para impressão
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <AlertCircle className="h-4 w-4 text-status-pending" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-pending" data-testid="stat-pending">
              {pendingCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Aguardando liberação</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Liberados</CardTitle>
            <CheckCircle className="h-4 w-4 text-status-approved" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-approved" data-testid="stat-approved">
              {approvedCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Liberados para produção</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <CardTitle>
                {viewMode === "pending" ? "Itens Pendentes de Liberação" : "Histórico de Liberações"}
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                <Popover open={openEventCombobox} onOpenChange={setOpenEventCombobox}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openEventCombobox}
                      className="w-[200px] justify-between"
                      data-testid="button-event-filter"
                    >
                      {eventFilter === "all" 
                        ? "Todos os eventos" 
                        : events.find((event) => event.id === eventFilter)?.name || "Selecione um evento"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] p-0">
                    <Command>
                      <CommandInput placeholder="Buscar evento..." />
                      <CommandList>
                        <CommandEmpty>Nenhum evento encontrado.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="all"
                            onSelect={() => {
                              setEventFilter("all");
                              setOpenEventCombobox(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                eventFilter === "all" ? "opacity-100" : "opacity-0"
                              )}
                            />
                            Todos os eventos
                          </CommandItem>
                          {events.map((event) => (
                            <CommandItem
                              key={event.id}
                              value={event.name}
                              onSelect={() => {
                                setEventFilter(event.id);
                                setOpenEventCombobox(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  eventFilter === event.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {event.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                
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
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={viewMode === "pending" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("pending")}
                  data-testid="button-view-pending"
                >
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Pendentes ({pendingCount})
                </Button>
                <Button
                  variant={viewMode === "approved" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("approved")}
                  data-testid="button-view-approved"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Liberados ({approvedCount})
                </Button>
                {viewMode === "pending" && selectedItems.length > 0 && (
                  <Button
                    size="sm"
                    onClick={handleBulkApprove}
                    disabled={approveBulkMutation.isPending}
                    data-testid="button-bulk-approve"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Liberar Selecionados ({selectedItems.length})
                  </Button>
                )}
              </div>
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

            {showAdvancedFilters && (
              <div className="flex flex-col gap-3 pt-4 border-t">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                </div>

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
              {viewMode === "pending" ? (
                <>
                  <CheckCircle className="h-12 w-12 text-status-completed mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Tudo liberado!</h3>
                  <p className="text-muted-foreground">Não há itens pendentes no momento</p>
                </>
              ) : (
                <>
                  <Eye className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Nenhum item liberado</h3>
                  <p className="text-muted-foreground">Histórico vazio. Libere itens para vê-los aqui</p>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide">
                  <tr>
                    {viewMode === "pending" && (
                      <th className="w-12 py-3 px-4">
                        <Checkbox
                          checked={allPendingSelected}
                          onCheckedChange={toggleSelectAll}
                          data-testid="checkbox-select-all"
                        />
                      </th>
                    )}
                    <th className="text-left py-3 px-4 font-medium">Descrição</th>
                    <th className="text-center py-3 px-4 font-medium">Qtd</th>
                    <th className="text-left py-3 px-4 font-medium">Dimensões</th>
                    <th className="text-center py-3 px-4 font-medium">m²</th>
                    <th className="text-left py-3 px-4 font-medium">Material</th>
                    {viewMode === "approved" && (
                      <th className="text-left py-3 px-4 font-medium">Status</th>
                    )}
                    <th className="text-right py-3 px-4 font-medium">Ações</th>
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
                            <td colSpan={viewMode === "pending" ? 7 : 7} className="py-3 px-4">
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
                            <td colSpan={viewMode === "pending" ? 7 : 7} className="py-1.5 px-4">
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
                          data-testid={`row-pending-item-${item.id}`}
                        >
                          {viewMode === "pending" && (
                            <td className="py-3 px-4">
                              <Checkbox
                                checked={selectedItems.includes(item.id)}
                                onCheckedChange={() => toggleItemSelection(item.id)}
                                data-testid={`checkbox-item-${item.id}`}
                              />
                            </td>
                          )}
                          <td className="py-3 px-4">
                            {item.description ? (
                              <div className="text-sm text-foreground">{item.description}</div>
                            ) : (
                              <div className="text-sm text-muted-foreground">—</div>
                            )}
                            {item.observations && (
                              <div className="text-xs text-muted-foreground italic mt-0.5">{item.observations}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="text-sm tabular-nums">{item.quantity}</div>
                          </td>
                          <td className="py-3 px-2 text-xs">
                            {item.visualWidth && item.visualHeight ? (
                              <div className="space-y-0.5">
                                <div className="tabular-nums whitespace-nowrap">
                                  <span className="text-muted-foreground font-medium">V</span> {item.visualWidth}×{item.visualHeight}
                                </div>
                                {item.fileWidth && item.fileHeight && (
                                  <div className="tabular-nums text-muted-foreground whitespace-nowrap">
                                    <span className="font-medium">A</span> {item.fileWidth}×{item.fileHeight}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-muted-foreground">—</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="text-sm font-medium tabular-nums">{item.calculatedM2}</div>
                          </td>
                          <td className="py-3 px-4 text-sm">
                            <div>{item.material}</div>
                            <div className="text-xs text-muted-foreground">{item.finish}</div>
                          </td>
                          {viewMode === "approved" && (
                            <td className="py-3 px-4">
                              <StatusBadge status={item.status} />
                            </td>
                          )}
                          <td className="py-3 px-4">
                            <div className="flex gap-1 justify-end">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setSelectedItem(item)}
                                data-testid={`button-view-${item.id}`}
                                title="Ver detalhes"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {viewMode === "pending" && (
                                <Button
                                  size="icon"
                                  onClick={() => handleSingleApprove(item)}
                                  disabled={approveItemMutation.isPending}
                                  data-testid={`button-approve-${item.id}`}
                                  title="Liberar para Produção"
                                  className="bg-status-approved hover:bg-status-approved/90"
                                >
                                  <CheckCircle className="h-4 w-4" />
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

      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalhes do Item</DialogTitle>
            <DialogDescription>
              Revise as informações antes de liberar
            </DialogDescription>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Evento</p>
                  <p className="text-sm font-semibold">{selectedItem.event?.name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Tipo</p>
                  <p className="text-sm font-semibold">{selectedItem.type}</p>
                </div>
              </div>

              {selectedItem.description && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Descrição</p>
                  <p className="text-sm font-semibold">{selectedItem.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Material</p>
                  <p className="text-sm font-semibold">{selectedItem.material}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Acabamento</p>
                  <p className="text-sm font-semibold">{selectedItem.finish}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Quantidade</p>
                  <p className="text-sm font-semibold">{selectedItem.quantity}</p>
                </div>
                {selectedItem.quantityProduced !== null && selectedItem.quantityProduced > 0 && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Quantidade Produzida</p>
                    <p className="text-sm font-semibold text-status-production">{selectedItem.quantityProduced}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Área × Visual</p>
                  <p className="text-sm font-semibold">{selectedItem.area} × {selectedItem.visual}</p>
                </div>
                {selectedItem.measurement && selectedItem.measurement !== `${selectedItem.area} × ${selectedItem.visual}` && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Medida</p>
                    <p className="text-sm font-semibold">{selectedItem.measurement}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-muted-foreground">m² Total</p>
                  <p className="text-sm font-semibold">{selectedItem.calculatedM2}</p>
                </div>
              </div>

              {selectedItem.observations && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Observações</p>
                  <p className="text-sm">{selectedItem.observations}</p>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setSelectedItem(null)}>
                  Fechar
                </Button>
                {selectedItem.status === 'requested' && (
                  <Button
                    onClick={() => {
                      approveItemMutation.mutate(selectedItem.id);
                    }}
                    disabled={approveItemMutation.isPending}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Liberar para Produção
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmApprovalItem} onOpenChange={(open) => !open && setConfirmApprovalItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Liberação</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmApprovalItem?.type === 'bulk' ? (
                <>
                  Você está prestes a liberar <strong>{confirmApprovalItem.count} itens</strong> para produção.
                  <br /><br />
                  Esta ação notificará a Gráfica e os itens ficarão disponíveis para impressão.
                </>
              ) : confirmApprovalItem?.type === 'single' ? (
                <>
                  Você está prestes a liberar o item <strong>{confirmApprovalItem.item?.type}</strong> para produção.
                  <br /><br />
                  <div className="space-y-1 text-sm">
                    <div><span className="text-muted-foreground">Evento:</span> <strong>{confirmApprovalItem.item?.event?.name}</strong></div>
                    {confirmApprovalItem.item?.description && (
                      <div><span className="text-muted-foreground">Descrição:</span> <strong>{confirmApprovalItem.item.description}</strong></div>
                    )}
                    {confirmApprovalItem.item?.observations && (
                      <div><span className="text-muted-foreground">Observações:</span> <strong className="italic">{confirmApprovalItem.item.observations}</strong></div>
                    )}
                    <div><span className="text-muted-foreground">Quantidade:</span> <strong>{confirmApprovalItem.item?.quantity}</strong></div>
                    <div><span className="text-muted-foreground">Medida:</span> <strong>{confirmApprovalItem.item?.area} × {confirmApprovalItem.item?.visual}</strong></div>
                    <div><span className="text-muted-foreground">m² Total:</span> <strong>{confirmApprovalItem.item?.calculatedM2}</strong></div>
                    <div><span className="text-muted-foreground">Material:</span> <strong>{confirmApprovalItem.item?.material}</strong></div>
                    {confirmApprovalItem.item?.finish && (
                      <div><span className="text-muted-foreground">Acabamento:</span> <strong>{confirmApprovalItem.item.finish}</strong></div>
                    )}
                  </div>
                  <br />
                  Esta ação notificará a Gráfica e o item ficará disponível para impressão.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmApproval}
              disabled={approveItemMutation.isPending || approveBulkMutation.isPending}
              data-testid="button-confirm-approval"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Confirmar Liberação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
