import { useQuery, useMutation } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, Eye, Calendar, Truck, Filter, Check, ChevronsUpDown, Search, Upload, FileImage, File, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
import { Fragment, useState } from "react";
import { FileUploader } from "@/components/FileUploader";
import { Checkbox } from "@/components/ui/checkbox";

export default function Arte() {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("criar-aprovacoes");
  const [finalFileUrl, setFinalFileUrl] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [materialFilter, setMaterialFilter] = useState<string>("all");
  const [finishFilter, setFinishFilter] = useState<string>("all");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [openEventCombobox, setOpenEventCombobox] = useState(false);
  const [next10DaysFilter, setNext10DaysFilter] = useState(false);
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [approvalThumbUrl, setApprovalThumbUrl] = useState<string>("");
  const [approvalThumbPreview, setApprovalThumbPreview] = useState<string>("");
  
  // Multi-selection states
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [sharedPdfUrl, setSharedPdfUrl] = useState<string>("");

  const { data: allItems = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/items"],
  });

  const { data: events = [] } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const submitForApprovalMutation = useMutation({
    mutationFn: async ({ itemId, approvalThumbUrl }: { itemId: string; approvalThumbUrl: string }) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/submit-for-approval`, { approvalThumbUrl });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/pending"] });
      setSelectedItem(null);
      setApprovalThumbUrl("");
      setApprovalThumbPreview("");
      toast({
        title: "Item enviado para aprovação",
        description: "O item foi enviado para aprovação do patrocinador",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao enviar item",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const submitBulkForApprovalMutation = useMutation({
    mutationFn: async ({ itemIds, pdfUrl }: { itemIds: string[]; pdfUrl: string }) => {
      // Submit all selected items with the same PDF
      const promises = itemIds.map(itemId =>
        apiRequest("PATCH", `/api/items/${itemId}/submit-for-approval`, { approvalThumbUrl: pdfUrl })
      );
      return await Promise.all(promises);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/pending"] });
      setShowBulkDialog(false);
      setSelectedItemIds(new Set());
      setSharedPdfUrl("");
      toast({
        title: "Peças enviadas para aprovação",
        description: `${variables.itemIds.length} peças foram enviadas com o mesmo PDF`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao enviar peças",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const submitFinalFileMutation = useMutation({
    mutationFn: async ({ itemId, finalFileUrl }: { itemId: string; finalFileUrl: string }) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/submit-final-file`, { finalFileUrl });
    },
    onSuccess: () => {
      setSelectedItem(null);
      setFinalFileUrl("");
      toast({
        title: "Arquivo final enviado",
        description: "O arquivo final foi enviado para revisão da solicitação",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao enviar arquivo final",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getUploadUrl = async () => {
    const response = await apiRequest("POST", "/api/objects/upload", {});
    const data = await response.json();
    return { method: "PUT" as const, url: data.uploadURL };
  };

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

  // Function to filter items based on active tab
  const getFilteredItemsForTab = (tab: string) => {
    return allItems
      .filter(item => {
        const matchesEvent = eventFilter === "all" || item.eventId === eventFilter;
        let matchesView = false;
        if (tab === "criar-aprovacoes") {
          matchesView = item.status === 'requested';
        } else if (tab === "finalizar-layouts") {
          matchesView = item.status === 'sponsor_approved';
        } else {
          matchesView = item.status === 'awaiting_sponsor_approval' || 
            item.status === 'awaiting_creator_review' || 
            item.status === 'ready_for_production' || 
            item.status === 'approved' || 
            item.status === 'inProduction' || 
            item.status === 'produced' || 
            item.status === 'delivered';
        }
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
  };

  const filteredItems = getFilteredItemsForTab(activeTab);

  // Filter items by selected event for statistics cards
  const itemsForEvent = eventFilter === "all" 
    ? allItems 
    : allItems.filter(item => item.eventId === eventFilter);

  // Calculate badge counts using the same filtered pipeline
  const pendingCount = getFilteredItemsForTab("criar-aprovacoes").length;
  const needsFinalFileCount = getFilteredItemsForTab("finalizar-layouts").length;
  const approvedCount = getFilteredItemsForTab("aprovados").length;

  const pendingItems = filteredItems.filter(item => item.status === 'requested');

  const handleViewDetails = (item: any) => {
    setSelectedItem(item);
    // Reset upload states when opening dialog
    setApprovalThumbUrl(item.approvalThumbUrl || "");
    setApprovalThumbPreview(item.approvalThumbUrl || "");
    setFinalFileUrl(item.finalFileUrl || "");
  };

  const handleSubmitForApproval = () => {
    if (!selectedItem || !approvalThumbUrl) {
      toast({
        title: "Erro",
        description: "É necessário fazer upload do thumb de aprovação",
        variant: "destructive",
      });
      return;
    }
    submitForApprovalMutation.mutate({ itemId: selectedItem.id, approvalThumbUrl });
  };

  const handleSubmitFinalFile = () => {
    if (!selectedItem || !finalFileUrl) {
      toast({
        title: "Erro",
        description: "É necessário fazer upload do arquivo final",
        variant: "destructive",
      });
      return;
    }
    submitFinalFileMutation.mutate({ itemId: selectedItem.id, finalFileUrl });
  };

  const toggleItemSelection = (itemId: string) => {
    const newSet = new Set(selectedItemIds);
    if (newSet.has(itemId)) {
      newSet.delete(itemId);
    } else {
      newSet.add(itemId);
    }
    setSelectedItemIds(newSet);
  };

  const toggleAllSelection = () => {
    if (selectedItemIds.size === pendingItems.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(pendingItems.map(item => item.id)));
    }
  };

  const handleBulkSubmit = () => {
    if (!sharedPdfUrl) {
      toast({
        title: "Erro",
        description: "É necessário fazer upload do PDF compartilhado",
        variant: "destructive",
      });
      return;
    }
    submitBulkForApprovalMutation.mutate({ 
      itemIds: Array.from(selectedItemIds), 
      pdfUrl: sharedPdfUrl 
    });
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
            <CardTitle className="text-sm font-medium">Aguard. Patrocinador</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600" data-testid="stat-awaiting-sponsor">
              {itemsForEvent.filter(i => i.status === 'awaiting_sponsor_approval').length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Enviado p/ aprovação</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Patrocinador Aprovou</CardTitle>
            <CheckCircle className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600" data-testid="stat-sponsor-approved">
              {itemsForEvent.filter(i => i.status === 'sponsor_approved').length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Aguard. solicitação</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prontos p/ Produção</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="stat-ready-production">
              {itemsForEvent.filter(i => 
                i.status === 'ready_for_production' || 
                i.status === 'approved'
              ).length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Liberados</p>
          </CardContent>
        </Card>
      </div>

      {/* Abas Horizontais Modernas */}
      <Card>
        <CardContent className="pt-6 pb-6">
          <div className="inline-flex items-stretch rounded-lg bg-muted p-1.5 w-full gap-1">
            <button
              onClick={() => setActiveTab("criar-aprovacoes")}
              data-testid="tab-criar-aprovacoes"
              className={cn(
                "inline-flex flex-col items-center justify-center whitespace-nowrap rounded-md px-6 py-3.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 flex-1 gap-2",
                activeTab === "criar-aprovacoes"
                  ? "bg-background text-foreground shadow-md border-2 border-blue-500"
                  : "text-foreground/70 hover-elevate"
              )}
            >
              <div className="flex items-center gap-2">
                <FileImage className={cn("h-4 w-4", activeTab === "criar-aprovacoes" ? "text-blue-600" : "text-blue-500")} />
                <span className="font-semibold">Mandar para Aprovação</span>
              </div>
              <Badge 
                className={cn(
                  "min-w-[28px] justify-center bg-blue-600 text-white hover:bg-blue-700",
                  activeTab !== "criar-aprovacoes" && "bg-blue-500/20 text-blue-700 hover:bg-blue-500/30"
                )}
              >
                {pendingCount}
              </Badge>
            </button>
            
            <button
              onClick={() => setActiveTab("finalizar-layouts")}
              data-testid="tab-finalizar-layouts"
              className={cn(
                "inline-flex flex-col items-center justify-center whitespace-nowrap rounded-md px-6 py-3.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 flex-1 gap-2",
                activeTab === "finalizar-layouts"
                  ? "bg-background text-foreground shadow-md border-2 border-orange-500"
                  : "text-foreground/70 hover-elevate"
              )}
            >
              <div className="flex items-center gap-2">
                <Upload className={cn("h-4 w-4", activeTab === "finalizar-layouts" ? "text-orange-600" : "text-orange-500")} />
                <span className="font-semibold">Finalizar Arte</span>
              </div>
              <Badge 
                className={cn(
                  "min-w-[28px] justify-center bg-orange-600 text-white hover:bg-orange-700",
                  activeTab !== "finalizar-layouts" && "bg-orange-500/20 text-orange-700 hover:bg-orange-500/30"
                )}
              >
                {needsFinalFileCount}
              </Badge>
            </button>
            
            <button
              onClick={() => setActiveTab("aprovados")}
              data-testid="tab-aprovados"
              className={cn(
                "inline-flex flex-col items-center justify-center whitespace-nowrap rounded-md px-6 py-3.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 flex-1 gap-2",
                activeTab === "aprovados"
                  ? "bg-background text-foreground shadow-md border-2 border-green-500"
                  : "text-foreground/70 hover-elevate"
              )}
            >
              <div className="flex items-center gap-2">
                <CheckCircle className={cn("h-4 w-4", activeTab === "aprovados" ? "text-green-600" : "text-green-500")} />
                <span className="font-semibold">Aprovados</span>
              </div>
              <Badge 
                className={cn(
                  "min-w-[28px] justify-center bg-green-600 text-white hover:bg-green-700",
                  activeTab !== "aprovados" && "bg-green-500/20 text-green-700 hover:bg-green-500/30"
                )}
              >
                {approvedCount}
              </Badge>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
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
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              {activeTab === "criar-aprovacoes" && selectedItemIds.size > 0 && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setShowBulkDialog(true)}
                  data-testid="button-open-bulk-upload"
                >
                  <File className="h-4 w-4 mr-2" />
                  Upload PDF Compartilhado ({selectedItemIds.size})
                </Button>
              )}
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
              {activeTab === "criar-aprovacoes" ? (
                <>
                  <CheckCircle className="h-12 w-12 text-status-completed mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Tudo liberado!</h3>
                  <p className="text-muted-foreground">Não há itens pendentes no momento</p>
                </>
              ) : activeTab === "finalizar-layouts" ? (
                <>
                  <Upload className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Nenhum item aguardando arquivo final</h3>
                  <p className="text-muted-foreground">Todos os itens aprovados já possuem arquivos finais</p>
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
                    {activeTab === "criar-aprovacoes" && (
                      <th className="text-center py-3 px-4 font-medium w-10">
                        <Checkbox
                          checked={selectedItemIds.size === pendingItems.length && pendingItems.length > 0}
                          onCheckedChange={toggleAllSelection}
                          data-testid="checkbox-select-all"
                        />
                      </th>
                    )}
                    <th className="text-left py-3 px-4 font-medium">ID</th>
                    <th className="text-left py-3 px-4 font-medium">Descrição</th>
                    <th className="text-center py-3 px-4 font-medium">Qtd</th>
                    <th className="text-left py-3 px-4 font-medium">Dimensões</th>
                    <th className="text-center py-3 px-4 font-medium">m²</th>
                    <th className="text-left py-3 px-4 font-medium">Material</th>
                    {activeTab === "aprovados" && (
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
                            <td colSpan={activeTab === "criar-aprovacoes" ? 9 : 8} className="py-3 px-4">
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
                            <td colSpan={activeTab === "criar-aprovacoes" ? 9 : 8} className="py-1.5 px-4">
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
                          {activeTab === "criar-aprovacoes" && (
                            <td className="py-2 px-4 text-center">
                              <Checkbox
                                checked={selectedItemIds.has(item.id)}
                                onCheckedChange={() => toggleItemSelection(item.id)}
                                data-testid={`checkbox-item-${item.id}`}
                              />
                            </td>
                          )}
                          <td className="py-2 px-3">
                            <div className="text-sm font-mono font-medium text-primary" data-testid={`text-display-id-${item.id}`}>
                              {item.displayId}
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            {item.description ? (
                              <div className="text-sm text-foreground">{item.description}</div>
                            ) : (
                              <div className="text-sm text-muted-foreground">—</div>
                            )}
                            {item.observations && (
                              <div className="text-xs text-muted-foreground italic mt-0.5">{item.observations}</div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <div className="text-sm tabular-nums">{item.quantity}</div>
                          </td>
                          <td className="py-2 px-2 text-xs">
                            {item.visualWidth && item.visualHeight ? (
                              <div className="space-y-0.5">
                                <div className="tabular-nums whitespace-nowrap">
                                  <span className="text-muted-foreground font-medium">V:</span> {item.visualWidth}×{item.visualHeight}
                                </div>
                                {item.fileWidth && item.fileHeight && (
                                  <div className="tabular-nums text-muted-foreground whitespace-nowrap">
                                    <span className="font-medium">A:</span> {item.fileWidth}×{item.fileHeight}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-muted-foreground">—</div>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <div className="text-sm font-medium tabular-nums">{item.calculatedM2}</div>
                          </td>
                          <td className="py-2 px-3 text-sm">
                            <div>{item.material}</div>
                            <div className="text-xs text-muted-foreground">{item.finish}</div>
                          </td>
                          {activeTab === "aprovados" && (
                            <td className="py-2 px-3">
                              <StatusBadge status={item.status} />
                            </td>
                          )}
                          <td className="py-2 px-2">
                            <div className="flex gap-1 justify-end">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleViewDetails(item)}
                                data-testid={`button-view-${item.id}`}
                                title="Ver detalhes"
                              >
                                {activeTab === "criar-aprovacoes" ? <Upload className="h-4 w-4" /> : 
                                 activeTab === "finalizar-layouts" ? <FileImage className="h-4 w-4" /> : 
                                 <Eye className="h-4 w-4" />}
                              </Button>
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
              {/* Upload de Thumb de Aprovação */}
              {selectedItem.status === 'requested' && (
                <div className="border-t pt-4 space-y-4">
                  <div>
                    <p className="text-sm font-medium mb-2 flex items-center gap-2">
                      <FileImage className="h-4 w-4" />
                      Thumb de Aprovação <span className="text-destructive">*</span>
                    </p>
                    <p className="text-xs text-muted-foreground mb-3">
                      Envie uma imagem leve (preview) para o patrocinador aprovar
                    </p>
                    {approvalThumbPreview ? (
                      <div className="space-y-2">
                        <img 
                          src={approvalThumbPreview} 
                          alt="Preview" 
                          className="max-h-48 rounded-md border"
                        />
                        <FileUploader
                          onGetUploadParameters={getUploadUrl}
                          onComplete={(result) => {
                            setApprovalThumbUrl(result.url);
                            setApprovalThumbPreview(result.url);
                            toast({
                              title: "Upload concluído",
                              description: "Thumb de aprovação enviado com sucesso",
                            });
                          }}
                          onError={(error) => {
                            toast({
                              title: "Erro no upload",
                              description: error.message,
                              variant: "destructive",
                            });
                          }}
                          onFileSelect={(file) => {
                            const reader = new FileReader();
                            reader.onload = (e) => {
                              setApprovalThumbPreview(e.target?.result as string);
                            };
                            reader.readAsDataURL(file);
                          }}
                          accept="image/*"
                          buttonVariant="outline"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Alterar Thumb
                        </FileUploader>
                      </div>
                    ) : (
                      <FileUploader
                        onGetUploadParameters={getUploadUrl}
                        onComplete={(result) => {
                          setApprovalThumbUrl(result.url);
                          setApprovalThumbPreview(result.url);
                          toast({
                            title: "Upload concluído",
                            description: "Thumb de aprovação enviado com sucesso",
                          });
                        }}
                        onError={(error) => {
                          toast({
                            title: "Erro no upload",
                            description: error.message,
                            variant: "destructive",
                          });
                        }}
                        onFileSelect={(file) => {
                          const reader = new FileReader();
                          reader.onload = (e) => {
                            setApprovalThumbPreview(e.target?.result as string);
                          };
                          reader.readAsDataURL(file);
                        }}
                        accept="image/*"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Fazer Upload do Thumb
                      </FileUploader>
                    )}
                  </div>
                </div>
              )}

              {/* Upload de Arquivo Final após Aprovação do Patrocinador */}
              {selectedItem.status === 'sponsor_approved' && (
                <div className="border-t pt-4 space-y-4">
                  <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg p-4 mb-4">
                    <p className="text-sm font-semibold text-green-700 dark:text-green-400 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" />
                      Patrocinador aprovou este item!
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                      Finalize o layout e adicione o arquivo final para enviar para revisão da solicitação.
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2 flex items-center gap-2">
                      <File className="h-4 w-4" />
                      Arquivo Final <span className="text-destructive">*</span>
                    </p>
                    <p className="text-xs text-muted-foreground mb-3">
                      Envie o arquivo final em alta resolução (PDF, imagem, etc.)
                    </p>
                    {finalFileUrl ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                          <File className="h-4 w-4 text-green-600" />
                          <span className="text-sm truncate flex-1">Arquivo final enviado</span>
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        </div>
                        <FileUploader
                          onGetUploadParameters={getUploadUrl}
                          onComplete={(result) => {
                            setFinalFileUrl(result.url);
                            toast({
                              title: "Upload concluído",
                              description: "Arquivo final atualizado com sucesso",
                            });
                          }}
                          onError={(error) => {
                            toast({
                              title: "Erro no upload",
                              description: error.message,
                              variant: "destructive",
                            });
                          }}
                          accept=".pdf,image/*"
                          buttonVariant="outline"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Alterar Arquivo Final
                        </FileUploader>
                      </div>
                    ) : (
                      <FileUploader
                        onGetUploadParameters={getUploadUrl}
                        onComplete={(result) => {
                          setFinalFileUrl(result.url);
                          toast({
                            title: "Upload concluído",
                            description: "Arquivo final enviado com sucesso",
                          });
                        }}
                        onError={(error) => {
                          toast({
                            title: "Erro no upload",
                            description: error.message,
                            variant: "destructive",
                          });
                        }}
                        accept=".pdf,image/*"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Fazer Upload do Arquivo Final
                      </FileUploader>
                    )}
                  </div>
                </div>
              )}
              
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setSelectedItem(null)}>
                  Fechar
                </Button>
                {selectedItem.status === 'requested' && (
                  <Button
                    onClick={handleSubmitForApproval}
                    disabled={submitForApprovalMutation.isPending || !approvalThumbUrl}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Enviar para Aprovação do Patrocinador
                  </Button>
                )}
                {selectedItem.status === 'sponsor_approved' && (
                  <Button
                    onClick={handleSubmitFinalFile}
                    disabled={submitFinalFileMutation.isPending || !finalFileUrl}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Enviar Arquivo Final
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de Upload Compartilhado de PDF */}
      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload de PDF Compartilhado</DialogTitle>
            <DialogDescription>
              Faça upload de 1 PDF que contém artes de múltiplas peças. {selectedItemIds.size} peça(s) selecionada(s).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="border rounded-lg p-4 bg-muted/30">
              <p className="text-sm font-medium mb-2">Peças Selecionadas:</p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {Array.from(selectedItemIds).map(itemId => {
                  const item = allItems.find(i => i.id === itemId);
                  return item ? (
                    <div key={itemId} className="text-xs flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {item.event?.name || 'Sem Evento'}
                      </Badge>
                      <span className="text-muted-foreground">•</span>
                      <span>{item.type}</span>
                      {item.description && (
                        <>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-muted-foreground">{item.description}</span>
                        </>
                      )}
                    </div>
                  ) : null;
                })}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <File className="h-4 w-4" />
                PDF Compartilhado <span className="text-destructive">*</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Envie 1 PDF contendo todas as artes. Ele será usado por todas as peças marcadas.
              </p>
              {sharedPdfUrl ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/20">
                    <File className="h-5 w-5 text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">PDF enviado com sucesso</p>
                      <p className="text-xs text-muted-foreground truncate">{sharedPdfUrl}</p>
                    </div>
                  </div>
                  <FileUploader
                    onGetUploadParameters={getUploadUrl}
                    onComplete={(result) => {
                      setSharedPdfUrl(result.url);
                      toast({
                        title: "Upload concluído",
                        description: "PDF compartilhado enviado com sucesso",
                      });
                    }}
                    onError={(error) => {
                      toast({
                        title: "Erro no upload",
                        description: error.message,
                        variant: "destructive",
                      });
                    }}
                    accept=".pdf,application/pdf"
                    buttonVariant="outline"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Alterar PDF
                  </FileUploader>
                </div>
              ) : (
                <FileUploader
                  onGetUploadParameters={getUploadUrl}
                  onComplete={(result) => {
                    setSharedPdfUrl(result.url);
                    toast({
                      title: "Upload concluído",
                      description: "PDF compartilhado enviado com sucesso",
                    });
                  }}
                  onError={(error) => {
                    toast({
                      title: "Erro no upload",
                      description: error.message,
                      variant: "destructive",
                    });
                  }}
                  accept=".pdf,application/pdf"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Fazer Upload do PDF
                </FileUploader>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowBulkDialog(false);
                setSharedPdfUrl("");
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleBulkSubmit}
              disabled={submitBulkForApprovalMutation.isPending || !sharedPdfUrl}
            >
              {submitBulkForApprovalMutation.isPending ? (
                <>
                  <Upload className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Enviar {selectedItemIds.size} Peças para Aprovação
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
